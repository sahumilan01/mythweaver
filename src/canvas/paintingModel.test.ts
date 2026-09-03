import { describe, expect, it } from 'vitest'
import { PAINT_ARTIFACTS, chooseNextSectionFill } from './paintingModel'

describe('section-fill painting model', () => {
  it('describes what and where every predefined artifact is', () => {
    expect(PAINT_ARTIFACTS).toHaveLength(8)
    expect(PAINT_ARTIFACTS.find((artifact) => artifact.id === 'fox-head')).toEqual(
      expect.objectContaining({
        label: 'Fox face',
        kind: 'character-part',
        bounds: expect.objectContaining({ x: expect.any(Number), width: expect.any(Number) }),
        suggestedColors: expect.arrayContaining([expect.objectContaining({ name: expect.any(String), hex: expect.any(String) })]),
      }),
    )
  })

  it('chooses one unfilled section and never invents a line', () => {
    const move = chooseNextSectionFill({ hill: { color: '#247c63' } }, 'agent')
    expect(move).toEqual(expect.objectContaining({ type: 'fill', artifactId: 'river', color: '#263f98' }))
    expect(move).not.toHaveProperty('points')
  })

  it('stops when every predefined section is filled', () => {
    const fills = Object.fromEntries(PAINT_ARTIFACTS.map((artifact) => [artifact.id, { color: '#263f98' }]))
    expect(chooseNextSectionFill(fills, 'agent')).toBeNull()
  })

  it('can recolor one section on an invited agent turn when the page is already full', () => {
    const fills = Object.fromEntries(PAINT_ARTIFACTS.map((artifact) => [artifact.id, { color: '#263f98' }]))

    const move = chooseNextSectionFill(fills, 'agent', { repaintIndex: 2 })

    expect(move).toEqual(expect.objectContaining({ type: 'fill', artifactId: 'moon', color: '#f0b343' }))
  })
})
