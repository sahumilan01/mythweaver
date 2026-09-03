import type {
  StoryBeat,
  StoryProposal,
  StoryRole,
  StoryStore,
} from '../story/storyStore'

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export interface RegisteredTool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean; destructiveHint?: boolean }
  execute(input: unknown): Promise<ToolResult> | ToolResult
}

export interface ModelContextPort {
  registerTool(
    tool: RegisteredTool,
    options?: { signal: AbortSignal },
  ): Promise<void> | void
}

export type ProposalShape =
  | 'rectangle'
  | 'ellipse'
  | 'star'
  | 'cloud'
  | 'heart'
  | 'diamond'

export interface ProposalElementDraft {
  id: string
  name: string
  role: StoryRole
  shape: ProposalShape
  x: number
  y: number
  w: number
  h: number
}

export interface ProposalDraft {
  id: string
  basedOnRevision: number
  title: string
  narration: string
  elements: ProposalElementDraft[]
  beats: StoryBeat[]
}

export interface CanvasPort {
  readWorld(): { shapes: unknown[]; selection: string[]; regions?: unknown[] }
  paintRegion(regionId: string, color: string, origin: 'human' | 'agent'): void
  addPaintStroke(
    points: Array<{ x: number; y: number }>,
    color: string,
    width: number,
    origin: 'human' | 'agent',
  ): string
  undoLast(origin: 'human' | 'agent'): boolean
  clearPaint(origin: 'human' | 'agent'): void
  renderProposal(proposal: ProposalDraft): StoryProposal['elements']
  replaceProposal(
    previous: StoryProposal,
    proposal: ProposalDraft,
  ): StoryProposal['elements']
  clearProposal(proposal: StoryProposal): void
  focus(elementIds: string[]): string[]
  preview(beats: StoryBeat[]): void
  showAgentPresence(label: string): void
  moveAgentCursor(point: { x: number; y: number }, label: string): Promise<void>
  moveAgentToRegion(regionId: string, label: string): Promise<void>
}

interface RegisterToolsOptions {
  modelContext: ModelContextPort
  story: StoryStore
  canvas: CanvasPort
  onAgentActivity?: (message: string) => void
}

const roles = new Set<StoryRole>(['character', 'place', 'object', 'event'])
const shapes = new Set<ProposalShape>([
  'rectangle',
  'ellipse',
  'star',
  'cloud',
  'heart',
  'diamond',
])

const object = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected an object.')
  }
  return input as Record<string, unknown>
}

const string = (value: unknown, field: string, max = 180) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-empty string.`)
  }
  return value.trim().slice(0, max)
}

const number = (value: unknown, field: string, min: number, max: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`)
  }
  return Math.min(max, Math.max(min, value))
}

const color = (value: unknown) => {
  const parsed = string(value, 'color', 7)
  if (!/^#[0-9a-f]{6}$/i.test(parsed)) {
    throw new Error('color must be a six-digit hex value such as #d9513f.')
  }
  return parsed
}

function parseDraft(input: unknown, expectedProposalId?: string): ProposalDraft {
  const root = object(input)
  const elementsInput = Array.isArray(root.elements) ? root.elements : []
  const beatsInput = Array.isArray(root.beats) ? root.beats : []
  if (elementsInput.length === 0 || elementsInput.length > 8) {
    throw new Error('A proposal must contain between 1 and 8 elements.')
  }
  if (beatsInput.length > 3) throw new Error('A proposal can contain up to 3 beats.')

  const elementIds = new Set<string>()
  const elements = elementsInput.map((raw, index): ProposalElementDraft => {
    const item = object(raw)
    const id = string(item.id, `elements[${index}].id`, 48)
    if (elementIds.has(id)) throw new Error(`Duplicate element id: ${id}.`)
    elementIds.add(id)
    const role = string(item.role, `elements[${index}].role`) as StoryRole
    const shape = string(item.shape, `elements[${index}].shape`) as ProposalShape
    if (!roles.has(role)) throw new Error(`Unknown story role: ${role}.`)
    if (!shapes.has(shape)) throw new Error(`Unknown shape: ${shape}.`)
    return {
      id,
      name: string(item.name, `elements[${index}].name`, 64),
      role,
      shape,
      x: number(item.x, `elements[${index}].x`, -5000, 5000),
      y: number(item.y, `elements[${index}].y`, -5000, 5000),
      w: number(item.w ?? 180, `elements[${index}].w`, 72, 640),
      h: number(item.h ?? 120, `elements[${index}].h`, 56, 480),
    }
  })

  const beats = beatsInput.map((raw, index): StoryBeat => {
    const item = object(raw)
    const references = Array.isArray(item.elementIds)
      ? item.elementIds.map((id) => string(id, `beats[${index}].elementIds`, 48))
      : []
    const unknown = references.find((id) => !elementIds.has(id))
    if (unknown) throw new Error(`Beat references unknown proposal element: ${unknown}.`)
    return {
      id: string(item.id ?? `beat-${index + 1}`, `beats[${index}].id`, 48),
      narration: string(item.narration, `beats[${index}].narration`, 220),
      elementIds: references,
    }
  })

  return {
    id: expectedProposalId ?? string(root.id, 'id', 64),
    basedOnRevision: number(
      root.basedOnRevision,
      'basedOnRevision',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    title: string(root.title, 'title', 96),
    narration: string(root.narration, 'narration', 260),
    elements,
    beats,
  }
}

const success = (text: string, structuredContent?: Record<string, unknown>): ToolResult => ({
  content: [{ type: 'text', text }],
  structuredContent,
})

const failure = (error: unknown): ToolResult => ({
  content: [
    {
      type: 'text',
      text: error instanceof Error ? error.message : 'The tool could not complete the request.',
    },
  ],
  isError: true,
})

const proposalSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', description: 'A stable ID for this proposal.' },
    basedOnRevision: {
      type: 'number',
      description: 'The revision returned by get_story_world.',
    },
    title: { type: 'string', description: 'Short name for the creative idea.' },
    narration: { type: 'string', description: 'One sentence explaining the idea.' },
    elements: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string', enum: [...roles] },
          shape: { type: 'string', enum: [...shapes] },
          x: { type: 'number' },
          y: { type: 'number' },
          w: { type: 'number' },
          h: { type: 'number' },
        },
        required: ['id', 'name', 'role', 'shape', 'x', 'y'],
      },
    },
    beats: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          narration: { type: 'string' },
          elementIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['narration', 'elementIds'],
      },
    },
  },
  required: ['id', 'basedOnRevision', 'title', 'narration', 'elements'],
} as const

export function registerMythWeaverTools({
  modelContext,
  story,
  canvas,
  onAgentActivity,
}: RegisterToolsOptions): () => void {
  const controller = new AbortController()
  const register = (tool: RegisteredTool) => {
    void modelContext.registerTool(tool, { signal: controller.signal })
  }

  register({
    name: 'get_story_world',
    title: 'Read story world',
    description:
      'Read the visible canvas, selection, committed contributions, current revision, and any proposal awaiting human review.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => {
      const state = story.getState()
      const world = canvas.readWorld()
      canvas.showAgentPresence('Reading the canvas')
      const filledRegions = world.regions?.filter((region) => object(region).fill).length ?? 0
      onAgentActivity?.(`ChatGPT read the canvas: ${filledRegions} filled regions and ${world.shapes.length} freeform shapes at revision ${state.revision}.`)
      return success(
        `Story world revision ${state.revision}. ${filledRegions} filled regions, ${world.shapes.length} freeform shapes, and ${state.pending ? 'one proposal awaiting review' : 'no pending proposal'}.`,
        {
          revision: state.revision,
          ...world,
          pending: state.pending,
          contributions: state.contributions,
          consentRule:
            'You may propose or revise. Only the person can accept or discard in the canvas UI.',
        },
      )
    },
  })

  register({
    name: 'paint_canvas_region',
    title: 'Paint one coloring region',
    description:
      'Immediately fill one named coloring-book region on the shared canvas. The move is visible and reversible.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        regionId: { type: 'string', description: 'Region ID returned by get_story_world.' },
        color: { type: 'string', description: 'Six-digit hex color such as #d9513f.' },
      },
      required: ['regionId', 'color'],
    },
    execute: async (input) => {
      try {
        const root = object(input)
        const regionId = string(root.regionId, 'regionId', 48)
        const paintColor = color(root.color)
        await canvas.moveAgentToRegion(regionId, `Painting ${regionId}`)
        canvas.paintRegion(regionId, paintColor, 'agent')
        onAgentActivity?.(`ChatGPT colored ${regionId} ${paintColor}. The move appeared on the shared canvas.`)
        return success(`Painted ${regionId} ${paintColor}. The person can see it now and the move can be undone.`, {
          regionId,
          color: paintColor,
          world: canvas.readWorld(),
        })
      } catch (error) {
        return failure(error)
      }
    },
  })

  register({
    name: 'add_canvas_stroke',
    title: 'Add one brush stroke',
    description:
      'Immediately add one freehand brush stroke to the shared painting using canvas coordinates from 0 to 1200 by 0 to 700.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        points: {
          type: 'array',
          minItems: 2,
          maxItems: 160,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { x: { type: 'number' }, y: { type: 'number' } },
            required: ['x', 'y'],
          },
        },
        color: { type: 'string', description: 'Six-digit hex color.' },
        width: { type: 'number', description: 'Brush width from 2 to 18.' },
      },
      required: ['points', 'color'],
    },
    execute: async (input) => {
      try {
        const root = object(input)
        const rawPoints = Array.isArray(root.points) ? root.points : []
        const points = rawPoints.map((raw, index) => {
          const point = object(raw)
          return {
            x: number(point.x, `points[${index}].x`, 0, 1200),
            y: number(point.y, `points[${index}].y`, 0, 700),
          }
        })
        const paintColor = color(root.color)
        const width = number(root.width ?? 6, 'width', 2, 18)
        if (points.length > 0) await canvas.moveAgentCursor(points[0], 'Drawing a brush stroke')
        const strokeId = canvas.addPaintStroke(points, paintColor, width, 'agent')
        onAgentActivity?.(`ChatGPT added a ${paintColor} brush stroke. It appeared on the shared canvas.`)
        return success(`Added brush stroke ${strokeId}. The person can see it now and the move can be undone.`, {
          strokeId,
          pointCount: points.length,
        })
      } catch (error) {
        return failure(error)
      }
    },
  })

  register({
    name: 'undo_agent_paint',
    title: 'Undo last ChatGPT paint move',
    description: 'Undo ChatGPT’s most recent reversible fill or brush stroke without changing the person’s paint.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () => {
      const undone = canvas.undoLast('agent')
      onAgentActivity?.(undone ? 'ChatGPT undid its last paint move.' : 'ChatGPT had no paint move to undo.')
      return undone
        ? success('Undid ChatGPT’s last paint move.', { world: canvas.readWorld() })
        : failure(new Error('There is no ChatGPT paint move to undo.'))
    },
  })

  register({
    name: 'clear_agent_paint',
    title: 'Clear ChatGPT paint',
    description: 'Remove all paint added by ChatGPT while preserving every human fill and stroke.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { destructiveHint: true },
    execute: () => {
      canvas.clearPaint('agent')
      onAgentActivity?.('ChatGPT cleared its paint. Your paint stayed untouched.')
      return success('Cleared ChatGPT paint and preserved the person’s work.', { world: canvas.readWorld() })
    },
  })

  register({
    name: 'propose_story_patch',
    title: 'Propose story elements',
    description:
      'Place a reviewable creative contribution on the canvas. It stays pending until the person accepts it.',
    inputSchema: proposalSchema,
    execute: (input) => {
      try {
        const draft = parseDraft(input)
        const current = story.getState()
        if (draft.basedOnRevision !== current.revision) {
          throw new Error(`Story world is at revision ${current.revision}. Read it again before proposing.`)
        }
        if (current.pending) {
          throw new Error(`Proposal ${current.pending.id} is awaiting human review. Revise it instead.`)
        }
        const rendered = canvas.renderProposal(draft)
        story.propose({ ...draft, elements: rendered })
        onAgentActivity?.(`ChatGPT staged “${draft.title}” for your review. Nothing has been accepted yet.`)
        return success(
          `Proposed "${draft.title}" with ${rendered.length} elements. Ask the person to review it on the canvas.`,
          { proposalId: draft.id, revision: story.getState().revision, elementIds: rendered.map((e) => e.id) },
        )
      } catch (error) {
        return failure(error)
      }
    },
  })

  register({
    name: 'revise_story_patch',
    title: 'Revise pending story idea',
    description:
      'Replace the current pending proposal after the person gives feedback. Read the story world first for its current revision.',
    inputSchema: proposalSchema,
    execute: (input) => {
      try {
        const pending = story.getState().pending
        if (!pending) throw new Error('There is no pending proposal to revise.')
        const draft = parseDraft(input, pending.id)
        if (draft.basedOnRevision !== story.getState().revision) {
          throw new Error(
            `Story world is at revision ${story.getState().revision}. Read it again before revising.`,
          )
        }
        const rendered = canvas.replaceProposal(pending, draft)
        story.revise({ ...draft, elements: rendered })
        onAgentActivity?.(`ChatGPT revised the pending idea to “${draft.title}”. It still needs your decision.`)
        return success(
          `Revised "${draft.title}". It is still waiting for human review.`,
          { proposalId: pending.id, revision: story.getState().revision },
        )
      } catch (error) {
        return failure(error)
      }
    },
  })

  register({
    name: 'focus_story_elements',
    title: 'Focus story elements',
    description: 'Frame story elements on the canvas by their semantic element IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      },
      required: ['elementIds'],
    },
    annotations: { readOnlyHint: true },
    execute: (input) => {
      try {
        const root = object(input)
        const ids = Array.isArray(root.elementIds)
          ? root.elementIds.map((id) => string(id, 'elementIds', 48))
          : []
        const focused = canvas.focus(ids)
        onAgentActivity?.(`ChatGPT focused ${focused.length} story ${focused.length === 1 ? 'element' : 'elements'} without changing the canvas.`)
        return success(`Focused ${focused.length} story elements.`, { focused })
      } catch (error) {
        return failure(error)
      }
    },
  })

  register({
    name: 'preview_story_performance',
    title: 'Preview the story',
    description: 'Play the committed story beats without changing the artifact.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: () => {
      const beats = story.getState().contributions.flatMap((item) => item.beats)
      if (beats.length === 0) return failure(new Error('Accept a proposal with story beats before previewing.'))
      canvas.preview(beats)
      onAgentActivity?.(`ChatGPT previewed ${beats.length} committed story ${beats.length === 1 ? 'beat' : 'beats'}.`)
      return success(`Playing ${beats.length} story beats.`, { beatCount: beats.length })
    },
  })

  return () => controller.abort()
}
