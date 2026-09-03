import { describe, expect, it, vi } from 'vitest'
import { createStoryStore } from '../story/storyStore'
import { createTurnSessionStore, type TurnSessionStore } from '../session/turnSession'
import {
  registerMythWeaverTools,
  type CanvasPort,
  type ModelContextPort,
  type ProposalDraft,
  type RegisteredTool,
} from './registerTools'

function createHarness(turnSession?: TurnSessionStore) {
  const tools = new Map<string, RegisteredTool>()
  const renderProposal = vi.fn((proposal: ProposalDraft) =>
    proposal.elements.map(({ shape: _shape, x: _x, y: _y, w: _w, h: _h, ...element }) => ({
      ...element,
      shapeId: `shape:${element.id}`,
    })),
  )
  const paintRegion = vi.fn()
  const undoLast = vi.fn(() => true)
  const clearPaint = vi.fn()
  const showAgentPresence = vi.fn()
  const moveAgentCursor = vi.fn(async () => undefined)
  const moveAgentToRegion = vi.fn(async () => undefined)
  const onAgentJoined = vi.fn()
  const modelContext: ModelContextPort = {
    registerTool(tool) {
      tools.set(tool.name, tool)
      return Promise.resolve()
    },
  }
  const canvas: CanvasPort = {
    readWorld: () => ({
      shapes: [], selection: [], regions: [{ id: 'moon', name: 'Moon', fill: null }],
      artifacts: [{ id: 'moon', name: 'Moon', bounds: { x: 182, y: 82, width: 156, height: 156 }, suggestedColors: [{ name: 'Moon gold', hex: '#f0b343' }], fill: null }],
      palette: [{ name: 'Moon gold', hex: '#f0b343' }],
    }),
    paintRegion,
    undoLast,
    clearPaint,
    showAgentPresence,
    moveAgentCursor,
    moveAgentToRegion,
    renderProposal,
    clearProposal: () => undefined,
    replaceProposal: (_previous, proposal) =>
      proposal.elements.map(({ shape: _shape, x: _x, y: _y, w: _w, h: _h, ...element }) => ({
        ...element,
        shapeId: `shape:${element.id}`,
      })),
    focus: () => [],
    preview: () => undefined,
  }

  registerMythWeaverTools({
    modelContext,
    story: createStoryStore(),
    canvas,
    turnSession,
    onAgentJoined,
  })

  return { tools, renderProposal, paintRegion, undoLast, clearPaint, moveAgentToRegion, showAgentPresence, onAgentJoined }
}

describe('MythWeaver WebMCP tools', () => {
  it('registers a composable creative tool surface without agent approval tools', () => {
    const { tools } = createHarness()

    expect([...tools.keys()]).toEqual([
      'join_painting_session',
      'get_story_world',
      'paint_canvas_region',
      'undo_agent_paint',
      'clear_agent_paint',
      'propose_story_patch',
      'revise_story_patch',
      'focus_story_elements',
      'preview_story_performance',
    ])
    expect([...tools.keys()]).not.toContain('accept_proposal')
    expect([...tools.keys()]).not.toContain('discard_proposal')
  })

  it('uses an explicit WebMCP handshake before claiming ChatGPT joined', async () => {
    const session = createTurnSessionStore('one-one')
    const { tools, showAgentPresence, onAgentJoined } = createHarness(session)

    const result = await tools.get('join_painting_session')!.execute({ takeFirstTurn: true })

    expect(result.isError).not.toBe(true)
    expect(showAgentPresence).toHaveBeenCalledWith('ChatGPT joined through WebMCP', 'agent')
    expect(onAgentJoined).toHaveBeenCalledWith('agent')
    expect(session.getState().active).toBe('agent')
    expect(result.structuredContent).toEqual(expect.objectContaining({
      agentMayPaint: true,
      openRegions: expect.any(Array),
      collaborationProtocol: expect.any(Array),
    }))
  })

  it('returns the current revision and canvas state to the agent', async () => {
    const { tools } = createHarness()

    const result = await tools.get('get_story_world')!.execute({})

    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        revision: 0,
        shapes: [],
        selection: [],
        artifacts: expect.any(Array),
        palette: expect.any(Array),
        openRegions: expect.any(Array),
        recommendedNextAction: expect.any(String),
      }),
    )
    expect(result.content[0]?.text).toMatch(/revision 0/i)
  })

  it('lets the agent paint one named region immediately', async () => {
    const { tools, paintRegion, moveAgentToRegion } = createHarness()

    const result = await tools.get('paint_canvas_region')!.execute({ regionId: 'moon', color: '#f0b343', reason: 'The warm moon balances the cool river.' })

    expect(result.isError).not.toBe(true)
    expect(moveAgentToRegion).toHaveBeenCalledWith('moon', 'The warm moon balances the cool river.', 'agent')
    expect(paintRegion).toHaveBeenCalledWith('moon', '#f0b343', 'agent')
    expect(moveAgentToRegion.mock.invocationCallOrder[0]).toBeLessThan(paintRegion.mock.invocationCallOrder[0])
    expect(result.structuredContent).toEqual(expect.objectContaining({ reason: 'The warm moon balances the cool river.', paintedBy: 'agent' }))
  })

  it('obeys the human-selected turn rule', async () => {
    const session = createTurnSessionStore('one-one')
    const { tools, paintRegion } = createHarness(session)

    const early = await tools.get('paint_canvas_region')!.execute({ regionId: 'moon', color: '#f0b343', reason: 'Start with a warm focal point.' })
    expect(early.isError).toBe(true)
    expect(paintRegion).not.toHaveBeenCalled()

    session.noteMove('human')
    const turn = await tools.get('paint_canvas_region')!.execute({ regionId: 'moon', color: '#f0b343', reason: 'Echo the person’s warm palette.' })
    expect(turn.isError).not.toBe(true)
    expect(session.getState().active).toBe('human')
  })

  it('rejects malformed paint colors before touching the canvas', async () => {
    const { tools, paintRegion } = createHarness()

    const result = await tools.get('paint_canvas_region')!.execute({ regionId: 'moon', color: 'yellow', reason: 'A warm focal point.' })

    expect(result.isError).toBe(true)
    expect(paintRegion).not.toHaveBeenCalled()
  })

  it('lets the real MCP caller paint for the second-agent turn', async () => {
    const session = createTurnSessionStore('agent-duo')
    const { tools, paintRegion } = createHarness(session)
    await tools.get('paint_canvas_region')!.execute({ regionId: 'moon', color: '#f0b343', reason: 'ChatGPT starts with the focal point.' })

    const second = await tools.get('paint_canvas_region')!.execute({ regionId: 'moon', color: '#263f98', reason: 'Mica adds a cool counterpoint.' })

    expect(second.isError).not.toBe(true)
    expect(paintRegion).toHaveBeenLastCalledWith('moon', '#263f98', 'agent-two')
    expect(second.structuredContent).toEqual(expect.objectContaining({ paintedBy: 'agent-two' }))
  })

  it('keeps the agent tool surface section-fill only', () => {
    const { tools } = createHarness()
    expect(tools.has('paint_canvas_region')).toBe(true)
    expect(tools.has('add_canvas_stroke')).toBe(false)
  })

  it('rejects a stale proposal before drawing anything on the canvas', async () => {
    const { tools, renderProposal } = createHarness()

    const result = await tools.get('propose_story_patch')!.execute({
      id: 'stale',
      basedOnRevision: 3,
      title: 'Old idea',
      narration: 'This proposal was made against an old canvas.',
      elements: [
        { id: 'old-star', name: 'Old star', role: 'object', shape: 'star', x: 10, y: 20 },
      ],
    })

    expect(result.isError).toBe(true)
    expect(renderProposal).not.toHaveBeenCalled()
  })
})
