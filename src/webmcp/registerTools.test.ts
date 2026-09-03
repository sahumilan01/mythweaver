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
  const addPaintStroke = vi.fn(() => 'agent-stroke-1')
  const undoLast = vi.fn(() => true)
  const clearPaint = vi.fn()
  const showAgentPresence = vi.fn()
  const moveAgentCursor = vi.fn(async () => undefined)
  const moveAgentToRegion = vi.fn(async () => undefined)
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
    addPaintStroke,
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
  })

  return { tools, renderProposal, paintRegion, addPaintStroke, undoLast, clearPaint, moveAgentToRegion }
}

describe('MythWeaver WebMCP tools', () => {
  it('registers a composable creative tool surface without agent approval tools', () => {
    const { tools } = createHarness()

    expect([...tools.keys()]).toEqual([
      'get_story_world',
      'paint_canvas_region',
      'add_canvas_stroke',
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

  it('returns the current revision and canvas state to the agent', async () => {
    const { tools } = createHarness()

    const result = await tools.get('get_story_world')!.execute({})

    expect(result.structuredContent).toEqual(
      expect.objectContaining({ revision: 0, shapes: [], selection: [], artifacts: expect.any(Array), palette: expect.any(Array) }),
    )
    expect(result.content[0]?.text).toMatch(/revision 0/i)
  })

  it('lets the agent paint one named region immediately', async () => {
    const { tools, paintRegion, moveAgentToRegion } = createHarness()

    const result = await tools.get('paint_canvas_region')!.execute({ regionId: 'moon', color: '#f0b343' })

    expect(result.isError).not.toBe(true)
    expect(moveAgentToRegion).toHaveBeenCalledWith('moon', 'Painting moon')
    expect(paintRegion).toHaveBeenCalledWith('moon', '#f0b343', 'agent')
    expect(moveAgentToRegion.mock.invocationCallOrder[0]).toBeLessThan(paintRegion.mock.invocationCallOrder[0])
  })

  it('obeys the human-selected turn rule', async () => {
    const session = createTurnSessionStore('one-one')
    const { tools, paintRegion } = createHarness(session)

    const early = await tools.get('paint_canvas_region')!.execute({ regionId: 'moon', color: '#f0b343' })
    expect(early.isError).toBe(true)
    expect(paintRegion).not.toHaveBeenCalled()

    session.noteMove('human')
    const turn = await tools.get('paint_canvas_region')!.execute({ regionId: 'moon', color: '#f0b343' })
    expect(turn.isError).not.toBe(true)
    expect(session.getState().active).toBe('human')
  })

  it('rejects malformed paint colors before touching the canvas', async () => {
    const { tools, paintRegion } = createHarness()

    const result = await tools.get('paint_canvas_region')!.execute({ regionId: 'moon', color: 'yellow' })

    expect(result.isError).toBe(true)
    expect(paintRegion).not.toHaveBeenCalled()
  })

  it('lets the agent add and undo its own brush stroke', async () => {
    const { tools, addPaintStroke, undoLast } = createHarness()

    await tools.get('add_canvas_stroke')!.execute({
      points: [{ x: 220, y: 140 }, { x: 240, y: 150 }],
      color: '#d9513f',
      width: 7,
      artifactId: 'moon',
      detailId: 'moon-crater',
      purpose: 'a moon crater',
    })
    const result = await tools.get('undo_agent_paint')!.execute({})

    expect(addPaintStroke).toHaveBeenCalledWith(
      [{ x: 220, y: 140 }, { x: 240, y: 150 }],
      '#d9513f',
      7,
      'agent',
      { artifactId: 'moon', detailId: 'moon-crater', purpose: 'a moon crater', label: 'a moon crater' },
    )
    expect(undoLast).toHaveBeenCalledWith('agent')
    expect(result.isError).not.toBe(true)
  })

  it('rejects generic or misplaced marks that are not grounded in an artifact', async () => {
    const { tools, addPaintStroke } = createHarness()

    const generic = await tools.get('add_canvas_stroke')!.execute({
      points: [{ x: 840, y: 130 }, { x: 875, y: 104 }, { x: 910, y: 130 }],
      color: '#d9513f',
      artifactId: 'moon',
      purpose: 'a decorative arrow',
    })

    expect(generic.isError).toBe(true)
    expect(generic.content[0]?.text).toMatch(/within Moon's bounds/i)
    expect(addPaintStroke).not.toHaveBeenCalled()
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
