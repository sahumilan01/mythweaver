import { describe, expect, it, vi } from 'vitest'
import { createStoryStore } from '../story/storyStore'
import {
  registerMythWeaverTools,
  type CanvasPort,
  type ModelContextPort,
  type ProposalDraft,
  type RegisteredTool,
} from './registerTools'

function createHarness() {
  const tools = new Map<string, RegisteredTool>()
  const renderProposal = vi.fn((proposal: ProposalDraft) =>
    proposal.elements.map(({ shape: _shape, x: _x, y: _y, w: _w, h: _h, ...element }) => ({
      ...element,
      shapeId: `shape:${element.id}`,
    })),
  )
  const modelContext: ModelContextPort = {
    registerTool(tool) {
      tools.set(tool.name, tool)
      return Promise.resolve()
    },
  }
  const canvas: CanvasPort = {
    readWorld: () => ({ shapes: [], selection: [] }),
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
  })

  return { tools, renderProposal }
}

describe('MythWeaver WebMCP tools', () => {
  it('registers a composable creative tool surface without agent approval tools', () => {
    const { tools } = createHarness()

    expect([...tools.keys()]).toEqual([
      'get_story_world',
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
      expect.objectContaining({ revision: 0, shapes: [], selection: [] }),
    )
    expect(result.content[0]?.text).toMatch(/revision 0/i)
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
