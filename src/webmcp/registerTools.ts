import type {
  StoryBeat,
  StoryProposal,
  StoryRole,
  StoryStore,
} from '../story/storyStore'
import type { SessionParticipant, TurnSessionState } from '../session/turnSession'
import { PAINT_ARTIFACTS } from '../canvas/paintingModel'

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
  readWorld(): { shapes: unknown[]; selection: string[]; regions?: unknown[]; artifacts?: unknown[]; [key: string]: unknown }
  paintRegion(regionId: string, color: string, origin: 'human' | 'agent' | 'agent-two'): void
  undoLast(origin: 'human' | 'agent' | 'agent-two'): boolean
  clearPaint(origin: 'human' | 'agent' | 'agent-two'): void
  renderProposal(proposal: ProposalDraft): StoryProposal['elements']
  replaceProposal(
    previous: StoryProposal,
    proposal: ProposalDraft,
  ): StoryProposal['elements']
  clearProposal(proposal: StoryProposal): void
  focus(elementIds: string[]): string[]
  preview(beats: StoryBeat[]): void
  showAgentPresence(label: string, agentId?: 'agent' | 'agent-two'): void
  moveAgentCursor(point: { x: number; y: number }, label: string, agentId?: 'agent' | 'agent-two'): Promise<void>
  moveAgentToRegion(regionId: string, label: string, agentId?: 'agent' | 'agent-two'): Promise<void>
}

interface RegisterToolsOptions {
  modelContext: ModelContextPort
  story: StoryStore
  canvas: CanvasPort
  turnSession?: {
    getState(): TurnSessionState
    startWith(participant: SessionParticipant): void
    canMove(participant: SessionParticipant): boolean
    noteMove(participant: SessionParticipant): boolean
    finish(): void
  }
  onAgentActivity?: (message: string) => void
  onAgentJoined?: (participant: 'agent' | 'agent-two') => void
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
  turnSession,
  onAgentActivity,
  onAgentJoined,
}: RegisterToolsOptions): () => void {
  const controller = new AbortController()
  const register = (tool: RegisteredTool) => {
    void modelContext.registerTool(tool, { signal: controller.signal })
  }

  const participantName = (participant: SessionParticipant) => participant === 'agent-two' ? 'Mica' : participant === 'agent' ? 'ChatGPT' : 'the person'

  const sessionBriefing = () => {
    const state = story.getState()
    const world = canvas.readWorld()
    const sessionState = turnSession?.getState() ?? null
    const artifacts = Array.isArray(world.artifacts) ? world.artifacts.map(object) : []
    const openRegions = artifacts.filter((artifact) => !artifact.fill).map((artifact) => ({
      id: artifact.id,
      label: artifact.label,
      kind: artifact.kind,
      description: artifact.description,
      center: artifact.center,
      suggestedColors: artifact.suggestedColors,
    }))
    const humanPaint = artifacts.filter((artifact) => object(artifact.fill ?? {}).origin === 'human').map((artifact) => ({
      id: artifact.id,
      color: object(artifact.fill ?? {}).color,
    }))
    const active = sessionState?.active ?? 'agent'
    const agentMayPaint = openRegions.length > 0 && (active === 'agent' || active === 'agent-two')
    const recommendedNextAction = sessionState?.finished || openRegions.length === 0
      ? 'The page is complete. Stop and tell the person what the session created.'
      : agentMayPaint
        ? `It is ${participantName(active)}'s turn. Choose one open region and a harmonious color, then call paint_canvas_region with a concise visual reason.`
        : `It is the person's turn. Do not paint. Invite them to choose a color and fill ${sessionState?.movesRemaining ?? 1} section${sessionState?.movesRemaining === 1 ? '' : 's'}.`

    return {
      revision: state.revision,
      ...world,
      pending: state.pending,
      contributions: state.contributions,
      turnSession: sessionState,
      openRegions,
      humanPaint,
      agentMayPaint,
      recommendedNextAction,
      collaborationProtocol: [
        'Use the live artifact IDs and fills returned here; never guess screen coordinates or draw freehand lines.',
        'Treat the person’s existing colors as creative intent. You may echo one for unity or choose a suggested contrasting color for balance.',
        'Choose with visual judgment: connect related artifacts, distribute warm and cool colors, and avoid repainting unless the person asks.',
        'Make one atomic fill per paint_canvas_region call. Include a short reason the person can see while your cursor moves.',
        'After every fill, inspect the returned turnSession. Continue only while the active participant is an agent; otherwise stop and hand the brush back.',
        'Only the person may accept or discard a proposed story contribution.',
      ],
      consentRule: 'You may propose or revise. Only the person can accept or discard in the canvas UI.',
    }
  }

  register({
    name: 'join_painting_session',
    title: 'Join the painting session',
    description:
      'Call this first when the person asks ChatGPT to join, start, or paint together. It makes the real WebMCP agent visibly present and returns the live scene, turn rule, open sections, prior human choices, and exact next-action guidance.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        participant: {
          type: 'string',
          enum: ['agent', 'agent-two'],
          description: 'Use agent for ChatGPT. Use agent-two only when a second invited agent is joining as Mica.',
        },
        takeFirstTurn: {
          type: 'boolean',
          description: 'Set true only when the person explicitly asks this agent to make the first move.',
        },
      },
    },
    execute: (input) => {
      try {
        const root = object(input)
        const participant = root.participant === 'agent-two' ? 'agent-two' : 'agent'
        const name = participantName(participant)
        if (root.takeFirstTurn === true) turnSession?.startWith(participant)
        canvas.showAgentPresence(`${name} joined through WebMCP`, participant)
        onAgentJoined?.(participant)
        onAgentActivity?.(`${name} joined through WebMCP and is reading the live canvas before choosing.`)
        const briefing = sessionBriefing()
        return success(
          `Joined the shared canvas through WebMCP. ${briefing.recommendedNextAction}`,
          briefing,
        )
      } catch (error) {
        return failure(error)
      }
    },
  })

  register({
    name: 'get_story_world',
    title: 'Read story world',
    description:
      'Read the visible canvas before painting. Returns every predefined section with its bounds, center, current fill, suggested colors, scene relationships, and next valid fill.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => {
      const briefing = sessionBriefing()
      canvas.showAgentPresence('Reading the live canvas through WebMCP')
      onAgentJoined?.('agent')
      const regionCount = Array.isArray(briefing.regions) ? briefing.regions.length : 0
      const filledRegions = regionCount - briefing.openRegions.length
      onAgentActivity?.(`ChatGPT read the live canvas through WebMCP: ${filledRegions} of ${regionCount} sections are filled.`)
      return success(
        `Read live canvas revision ${briefing.revision}. ${filledRegions} of ${regionCount} sections are filled. ${briefing.recommendedNextAction}`,
        briefing,
      )
    },
  })

  register({
    name: 'paint_canvas_region',
    title: 'Paint one coloring region',
    description:
      'Immediately fill one named coloring-book artifact on the shared canvas. Use its suggested colors from get_story_world. The move is visible and reversible.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        regionId: { type: 'string', enum: PAINT_ARTIFACTS.map((artifact) => artifact.id), description: 'One predefined section ID returned by get_story_world.' },
        color: { type: 'string', description: 'Six-digit hex color such as #d9513f.' },
        reason: { type: 'string', description: 'A short, user-facing visual reason for choosing this section and color.' },
        repaintOwnFill: { type: 'boolean', description: 'Set true only when the person explicitly asks you to recolor a section previously painted by an agent. Human paint is never overwritten.' },
      },
      required: ['regionId', 'color', 'reason'],
    },
    execute: async (input) => {
      try {
        const root = object(input)
        const regionId = string(root.regionId, 'regionId', 48)
        const paintColor = color(root.color)
        const reason = string(root.reason, 'reason', 180)
        const artifact = (canvas.readWorld().artifacts as unknown[] | undefined)?.map(object).find((item) => item.id === regionId)
        const existingFill = artifact?.fill ? object(artifact.fill) : null
        if (existingFill?.origin === 'human') {
          throw new Error(`${regionId} belongs to the person. Preserve their paint and choose an open region instead.`)
        }
        if (existingFill && root.repaintOwnFill !== true) {
          throw new Error(`${regionId} is already painted. Choose an open region, or set repaintOwnFill true only when the person asked for a recolor.`)
        }
        const active = turnSession?.getState().active ?? 'agent'
        const participant = active === 'agent-two' ? 'agent-two' : 'agent'
        if (turnSession && !turnSession.canMove(participant)) {
          throw new Error(`It is ${participantName(active)}'s turn. Read get_story_world and wait rather than painting.`)
        }
        canvas.showAgentPresence(`${participantName(participant)} is deciding`, participant)
        onAgentJoined?.(participant)
        onAgentActivity?.(`${participantName(participant)} chose ${regionId}: ${reason}`)
        await canvas.moveAgentToRegion(regionId, reason, participant)
        canvas.paintRegion(regionId, paintColor, participant)
        turnSession?.noteMove(participant)
        const remainingArtifacts = canvas.readWorld().artifacts
        const hasOpenRegion = Array.isArray(remainingArtifacts) && remainingArtifacts.some((artifact) => !object(artifact).fill)
        if (!hasOpenRegion) turnSession?.finish()
        const briefing = sessionBriefing()
        onAgentActivity?.(`${participantName(participant)} colored ${regionId} ${paintColor} through WebMCP — ${reason}`)
        return success(`Painted ${regionId} ${paintColor} through WebMCP because ${reason} ${briefing.recommendedNextAction}`, {
          regionId,
          color: paintColor,
          reason,
          paintedBy: participant,
          ...briefing,
        })
      } catch (error) {
        return failure(error)
      }
    },
  })

  register({
    name: 'undo_agent_paint',
    title: 'Undo last ChatGPT paint move',
    description: 'Undo ChatGPT’s most recent section fill without changing the person’s colors.',
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
    description: 'Remove every section fill added by ChatGPT while preserving the person’s colors.',
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
