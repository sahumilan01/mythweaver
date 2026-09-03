import {
  createShapeId,
  toRichText,
  type Editor,
  type TLGeoShape,
  type TLShapeId,
} from 'tldraw'
import type {
  StoryBeat,
  StoryElement,
  StoryProposal,
  StoryState,
} from '../story/storyStore'
import type { CanvasPort, ProposalDraft } from '../webmcp/registerTools'

export interface MythCanvasPort extends CanvasPort {
  addHumanStarter(): void
  commitProposal(proposal: StoryProposal): void
  subscribeToHumanChanges(listener: () => void): () => void
}

const geometryMap = {
  rectangle: 'rectangle',
  ellipse: 'ellipse',
  star: 'star',
  cloud: 'cloud',
  heart: 'heart',
  diamond: 'diamond',
} as const

export function createTldrawCanvasPort(
  editor: Editor,
  onPreview: (beats: StoryBeat[]) => void,
  initialStory?: StoryState,
): MythCanvasPort {
  const elementShapes = new Map<string, TLShapeId>()
  let agentMutationDepth = 0

  const runAgentMutation = <T,>(operation: () => T): T => {
    agentMutationDepth += 1
    try {
      let result!: T
      editor.run(() => {
        result = operation()
      })
      return result
    } finally {
      agentMutationDepth -= 1
    }
  }
  const knownProposals = [
    ...(initialStory?.contributions ?? []),
    ...(initialStory?.pending ? [initialStory.pending] : []),
  ]
  knownProposals.forEach((proposal) => {
    proposal.elements.forEach((element) => {
      elementShapes.set(element.id, element.shapeId as TLShapeId)
    })
  })

  const createProposalElements = (proposal: ProposalDraft): StoryElement[] => {
    const elements = proposal.elements.map((element) => {
      const shapeId = createShapeId()
      elementShapes.set(element.id, shapeId)
      editor.createShape<TLGeoShape>({
        id: shapeId,
        type: 'geo',
        x: element.x,
        y: element.y,
        meta: {
          mythweaver: {
            elementId: element.id,
            proposalId: proposal.id,
            status: 'pending',
            role: element.role,
          },
        },
        props: {
          geo: geometryMap[element.shape],
          w: element.w,
          h: element.h,
          color: 'orange',
          labelColor: 'black',
          fill: 'semi',
          dash: 'dashed',
          size: 'm',
          font: 'draw',
          align: 'middle',
          verticalAlign: 'middle',
          richText: toRichText(element.name),
        },
      })
      return {
        id: element.id,
        shapeId: String(shapeId),
        name: element.name,
        role: element.role,
      }
    })
    editor.select(...elements.map((element) => element.shapeId as TLShapeId))
    editor.zoomToSelection({ animation: { duration: 420 } })
    window.setTimeout(() => editor.selectNone(), 460)
    return elements
  }

  return {
    addHumanStarter() {
      runAgentMutation(() => {
        const viewport = editor.getViewportPageBounds()
        const shapeId = createShapeId()
        editor.createShape<TLGeoShape>({
          id: shapeId,
          type: 'geo',
          x: viewport.x + viewport.w / 2 - 90,
          y: viewport.y + viewport.h / 2 - 90,
          meta: { mythweaver: { origin: 'human', status: 'committed' } },
          props: {
            geo: 'ellipse',
            w: 180,
            h: 180,
            color: 'blue',
            labelColor: 'black',
            fill: 'semi',
            dash: 'draw',
            size: 'm',
            font: 'draw',
            align: 'middle',
            verticalAlign: 'middle',
            richText: toRichText('Moon?'),
          },
        })
        editor.select(shapeId)
        editor.zoomToSelection({ animation: { duration: 360 } })
        window.setTimeout(() => editor.selectNone(), 400)
      })
    },
    readWorld() {
      const selection = editor.getSelectedShapeIds().map(String)
      const shapes = editor.getCurrentPageShapes().slice(0, 24).map((shape) => {
        const bounds = editor.getShapePageBounds(shape)
        let text = ''
        try {
          text = editor.getShapeUtil(shape).getText(shape) ?? ''
        } catch {
          text = ''
        }
        return {
          id: String(shape.id),
          type: shape.type,
          x: Math.round(shape.x),
          y: Math.round(shape.y),
          w: bounds ? Math.round(bounds.w) : undefined,
          h: bounds ? Math.round(bounds.h) : undefined,
          text: text.slice(0, 80),
          selected: selection.includes(String(shape.id)),
          story: shape.meta.mythweaver ?? null,
        }
      })
      return { shapes, selection }
    },
    renderProposal(proposal: ProposalDraft): StoryElement[] {
      return runAgentMutation(() => createProposalElements(proposal))
    },
    replaceProposal(previous, proposal) {
      return runAgentMutation(() => {
        editor.deleteShapes(previous.elements.map((element) => element.shapeId as TLShapeId))
        previous.elements.forEach((element) => elementShapes.delete(element.id))
        return createProposalElements(proposal)
      })
    },
    clearProposal(proposal) {
      runAgentMutation(() => {
        const ids = proposal.elements.map((element) => element.shapeId as TLShapeId)
        editor.deleteShapes(ids)
        proposal.elements.forEach((element) => elementShapes.delete(element.id))
      })
    },
    commitProposal(proposal) {
      runAgentMutation(() => {
        editor.updateShapes<TLGeoShape>(
          proposal.elements.map((element) => ({
            id: element.shapeId as TLShapeId,
            type: 'geo',
            meta: {
              mythweaver: {
                elementId: element.id,
                proposalId: proposal.id,
                status: 'committed',
                role: element.role,
                origin: 'agent',
              },
            },
            props: {
              dash: 'solid',
              fill: 'solid',
            },
          })),
        )
      })
    },
    focus(elementIds) {
      const shapeIds = elementIds
        .map((id) => elementShapes.get(id))
        .filter((id): id is TLShapeId => Boolean(id))
      if (shapeIds.length > 0) {
        editor.select(...shapeIds)
        editor.zoomToSelection({ animation: { duration: 520 } })
        window.setTimeout(() => editor.selectNone(), 560)
      }
      return elementIds.filter((id) => elementShapes.has(id))
    },
    preview(beats) {
      onPreview(beats)
    },
    subscribeToHumanChanges(listener) {
      return editor.store.listen(
        () => {
          if (agentMutationDepth === 0) listener()
        },
        { scope: 'document', source: 'user' },
      )
    },
  }
}
