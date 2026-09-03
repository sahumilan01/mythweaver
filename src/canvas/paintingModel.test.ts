import { describe, expect, it } from 'vitest'
import {
  LEGACY_SKY_CHEVRONS,
  PAINT_ARTIFACTS,
  chooseNextPaintMove,
  isLegacySkyChevron,
} from './paintingModel'

describe('semantic painting model', () => {
  it('describes what and where every visible artifact is', () => {
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

  it('chooses a named artifact detail instead of a generic sky arrow when all regions are filled', () => {
    const fills = Object.fromEntries(PAINT_ARTIFACTS.map((artifact) => [artifact.id, { color: '#263f98', origin: 'human' }]))

    const move = chooseNextPaintMove({ fills, usedDetailIds: [] }, 'agent')

    expect(move).toEqual(expect.objectContaining({
      type: 'detail',
      artifactId: expect.any(String),
      detailId: expect.any(String),
      purpose: expect.any(String),
    }))
    if (move?.type === 'detail') {
      expect(PAINT_ARTIFACTS.some((artifact) => artifact.id === move.artifactId)).toBe(true)
      expect(move.points.length).toBeGreaterThan(3)
    }
  })

  it('recognizes only the obsolete generated chevrons for safe migration', () => {
    expect(isLegacySkyChevron([...LEGACY_SKY_CHEVRONS[0]])).toBe(true)
    expect(isLegacySkyChevron([{ x: 840, y: 130 }, { x: 875, y: 104 }, { x: 911, y: 130 }])).toBe(false)
  })
})
