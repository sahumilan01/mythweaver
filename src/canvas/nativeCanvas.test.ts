import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNativeCanvasPort } from './nativeCanvas'

describe('native pair-paint canvas', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

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
    }))
    expect(world.suggestedNextMoves).toEqual([expect.objectContaining({ type: 'fill', artifactId: 'hill' })])
  })

  it('recommends no further paint move after every predefined section has color', () => {
    const canvas = createNativeCanvasPort()
    for (const id of ['hill', 'river', 'moon', 'star-one', 'star-two', 'fox-tail', 'fox-body', 'fox-head']) {
      canvas.paintRegion(id, '#263f98', 'human')
    }

    expect(canvas.readWorld().suggestedNextMoves).toEqual([])
    expect(canvas.readWorld().interactionRule).toMatch(/Freehand lines are disabled/i)
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

  it('starts a clean painting while keeping connected collaborators present', () => {
    const canvas = createNativeCanvasPort()
    canvas.showAgentPresence('ChatGPT joined')
    canvas.paintRegion('moon', '#f0b343', 'human')
    canvas.paintRegion('river', '#263f98', 'agent')

    canvas.resetPainting()

    expect(canvas.getSnapshot()).toMatchObject({
      fills: {},
      shapes: [],
      agentPresence: expect.objectContaining({ label: 'Painted Winding river' }),
      lastAction: { origin: 'human', label: 'You started a new painting' },
    })
    expect(canvas.undoLast('human')).toBe(false)
  })

  it('shows ChatGPT joining and moves its labeled cursor to the target region', async () => {
    const canvas = createNativeCanvasPort()

    const movement = canvas.moveAgentToRegion('fox-body', 'Painting Fox body')
    expect(canvas.getSnapshot().agentPresence?.label).toBe('ChatGPT joined')

    await vi.runAllTimersAsync()
    await movement

    expect(canvas.getSnapshot().agentPresence).toMatchObject({
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

  it('does not leak one room canvas into another through global browser storage', () => {
    const values = new Map<string, string>()
    const storageListeners: Array<(event: { key: string; newValue: string }) => void> = []
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
      addEventListener: (type: string, listener: (event: { key: string; newValue: string }) => void) => {
        if (type === 'storage') storageListeners.push(listener)
      },
    })

    const roomOne = createNativeCanvasPort()
    const roomTwo = createNativeCanvasPort()
    roomOne.paintRegion('moon', '#f0b343', 'agent')
    roomOne.showAgentPresence('WebMCP • Balances the cool river', 'agent')

    expect(values.size).toBe(0)
    expect(storageListeners).toHaveLength(0)
    expect(roomTwo.getSnapshot().fills.moon).toBeUndefined()
    expect(roomTwo.getSnapshot().agentPresence).toBeNull()
  })

  it('expires a disconnected agent presence lease', () => {
    const canvas = createNativeCanvasPort()
    canvas.showAgentPresence('ChatGPT joined through WebMCP')

    vi.advanceTimersByTime(6001)
    canvas.expireAgentPresence(6000)

    expect(canvas.getSnapshot().agentPresence).toBeNull()
  })
})
