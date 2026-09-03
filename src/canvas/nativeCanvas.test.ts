import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNativeCanvasPort } from './nativeCanvas'

describe('native pair-paint canvas', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps human and agent paint in the same reactive world', () => {
    const canvas = createNativeCanvasPort()

    canvas.paintRegion('moon', '#f0b343', 'human')
    canvas.paintRegion('river', '#263f98', 'agent')

    const regions = canvas.readWorld().regions as Array<{
      id: string
      fill: { color: string; origin: string } | null
    }>
    expect(regions.find((region) => region.id === 'moon')?.fill).toEqual({
      color: '#f0b343',
      origin: 'human',
    })
    expect(regions.find((region) => region.id === 'river')?.fill).toEqual({
      color: '#263f98',
      origin: 'agent',
    })
  })

  it('gives WebMCP semantic artifacts, geometry, palette, relationships, and next moves', () => {
    const canvas = createNativeCanvasPort()
    const world = canvas.readWorld()
    const artifacts = world.artifacts as Array<Record<string, unknown>>

    expect(world.canvas).toEqual({ width: 1200, height: 700, coordinateSystem: 'top-left; x grows right, y grows down' })
    expect(world.palette).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Moon gold', hex: '#f0b343' })]))
    expect(world.relations).toEqual(expect.arrayContaining([expect.objectContaining({ from: 'fox-body', relation: 'rests-on', to: 'hill' })]))
    expect(artifacts.find((artifact) => artifact.id === 'fox-head')).toEqual(expect.objectContaining({
      description: expect.stringMatching(/fox head/i),
      center: { x: 648, y: 345 },
      bounds: { x: 520, y: 260, width: 256, height: 172 },
      availableDetails: expect.arrayContaining([expect.objectContaining({ id: 'fox-whisker-left' })]),
    }))
    expect(world.suggestedNextMoves).toEqual([expect.objectContaining({ type: 'fill', artifactId: 'hill' })])
  })

  it('recommends a purposeful artifact detail after every region has color', () => {
    const canvas = createNativeCanvasPort()
    for (const id of ['hill', 'river', 'moon', 'star-one', 'star-two', 'fox-tail', 'fox-body', 'fox-head']) {
      canvas.paintRegion(id, '#263f98', 'human')
    }

    expect(canvas.readWorld().suggestedNextMoves).toEqual([
      expect.objectContaining({ type: 'detail', artifactId: 'moon', detailId: 'moon-crater', purpose: expect.stringMatching(/crater/i) }),
    ])
  })

  it('undoes only the requested collaborator’s latest move', () => {
    const canvas = createNativeCanvasPort()
    canvas.paintRegion('moon', '#f0b343', 'human')
    canvas.paintRegion('river', '#263f98', 'agent')

    expect(canvas.undoLast('agent')).toBe(true)

    const regions = canvas.readWorld().regions as Array<{
      id: string
      fill: { origin: string } | null
    }>
    expect(regions.find((region) => region.id === 'moon')?.fill?.origin).toBe('human')
    expect(regions.find((region) => region.id === 'river')?.fill).toBeNull()
  })

  it('shows ChatGPT joining and moves its labeled cursor to the target region', async () => {
    const canvas = createNativeCanvasPort()

    const movement = canvas.moveAgentToRegion('fox-body', 'Painting Fox body')
    expect(canvas.getSnapshot().agentPresence?.label).toBe('ChatGPT joined')

    await vi.runAllTimersAsync()
    await movement

    expect(canvas.getSnapshot().agentPresence).toEqual({
      x: 650,
      y: 440,
      label: 'Painting Fox body',
    })
  })

  it('gives the second agent an independent cursor and paint identity', async () => {
    const canvas = createNativeCanvasPort()

    const movement = canvas.moveAgentToRegion('river', 'Painting Winding river', 'agent-two')
    await vi.runAllTimersAsync()
    await movement
    canvas.paintRegion('river', '#247c63', 'agent-two')

    expect(canvas.getSnapshot().agentPresence).toBeNull()
    expect(canvas.getSnapshot().agentTwoPresence?.label).toBe('Painted Winding river')
    const regions = canvas.readWorld().regions as Array<{ id: string; fill: { origin: string } | null }>
    expect(regions.find((region) => region.id === 'river')?.fill?.origin).toBe('agent-two')
  })
})
