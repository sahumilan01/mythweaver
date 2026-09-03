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
})
