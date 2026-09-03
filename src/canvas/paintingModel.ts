export type PaintingPoint = { x: number; y: number }
export type PaintingBounds = { x: number; y: number; width: number; height: number }
export type PaintingParticipant = 'agent' | 'agent-two'

export const SCENE_PALETTE = [
  { name: 'Moon gold', hex: '#f0b343', use: 'moonlight, stars, and warm highlights' },
  { name: 'Fox coral', hex: '#d9513f', use: 'fox fur and warm details' },
  { name: 'Forest green', hex: '#247c63', use: 'hill and natural accents' },
  { name: 'Night blue', hex: '#263f98', use: 'river, sky, and cool shadows' },
  { name: 'Midnight ink', hex: '#18213f', use: 'outlines and details on light paint' },
  { name: 'Paper white', hex: '#fbfaf4', use: 'details on dark paint' },
] as const

export const PAINT_ARTIFACTS = [
  { id: 'hill', label: 'Moonlit hill', kind: 'landscape', description: 'The broad ground beneath the fox and river.', center: { x: 350, y: 520 }, bounds: { x: 0, y: 390, width: 1200, height: 310 }, suggestedColors: [SCENE_PALETTE[2], SCENE_PALETTE[0]] },
  { id: 'river', label: 'Winding river', kind: 'landscape', description: 'A curved river crossing the lower-right hill.', center: { x: 830, y: 590 }, bounds: { x: 520, y: 455, width: 530, height: 245 }, suggestedColors: [SCENE_PALETTE[3], SCENE_PALETTE[5]] },
  { id: 'moon', label: 'Moon', kind: 'sky-object', description: 'The large round moon in the upper-left sky.', center: { x: 260, y: 160 }, bounds: { x: 182, y: 82, width: 156, height: 156 }, suggestedColors: [SCENE_PALETTE[0], SCENE_PALETTE[5]] },
  { id: 'star-one', label: 'Little star', kind: 'sky-object', description: 'The small star at the far left.', center: { x: 104, y: 163 }, bounds: { x: 64, y: 126, width: 80, height: 76 }, suggestedColors: [SCENE_PALETTE[0], SCENE_PALETTE[5]] },
  { id: 'star-two', label: 'Far star', kind: 'sky-object', description: 'The small star above and left of the fox.', center: { x: 438, y: 114 }, bounds: { x: 408, y: 84, width: 60, height: 58 }, suggestedColors: [SCENE_PALETTE[0], SCENE_PALETTE[5]] },
  { id: 'fox-tail', label: 'Fox tail', kind: 'character-part', description: 'The curled tail on the fox’s right side.', center: { x: 820, y: 450 }, bounds: { x: 714, y: 350, width: 200, height: 192 }, suggestedColors: [SCENE_PALETTE[1], SCENE_PALETTE[0]] },
  { id: 'fox-body', label: 'Fox body', kind: 'character-part', description: 'The round body in the center of the scene.', center: { x: 650, y: 440 }, bounds: { x: 515, y: 325, width: 255, height: 251 }, suggestedColors: [SCENE_PALETTE[1], SCENE_PALETTE[0]] },
  { id: 'fox-head', label: 'Fox face', kind: 'character-part', description: 'The fox head with ears, eyes, and smile.', center: { x: 648, y: 345 }, bounds: { x: 520, y: 260, width: 256, height: 172 }, suggestedColors: [SCENE_PALETTE[1], SCENE_PALETTE[0]] },
] as const

export type ArtifactId = (typeof PAINT_ARTIFACTS)[number]['id']

export const ARTIFACT_RELATIONS = [
  { from: 'fox-head', relation: 'part-of', to: 'fox-body' },
  { from: 'fox-tail', relation: 'part-of', to: 'fox-body' },
  { from: 'fox-body', relation: 'rests-on', to: 'hill' },
  { from: 'river', relation: 'crosses', to: 'hill' },
  { from: 'moon', relation: 'lights', to: 'hill' },
] as const

type ArtifactDetail = {
  id: string
  artifactId: ArtifactId
  label: string
  purpose: string
  points: readonly PaintingPoint[]
  width: number
}

export const ARTIFACT_DETAILS: readonly ArtifactDetail[] = [
  { id: 'moon-crater', artifactId: 'moon', label: 'a moon crater', purpose: 'Add a curved crater that follows the moon’s round surface.', width: 5, points: [{ x: 222, y: 142 }, { x: 217, y: 153 }, { x: 220, y: 165 }, { x: 231, y: 171 }, { x: 243, y: 168 }, { x: 248, y: 157 }, { x: 245, y: 146 }, { x: 234, y: 140 }, { x: 222, y: 142 }] },
  { id: 'moon-glow', artifactId: 'moon', label: 'a moon glow', purpose: 'Echo the moon edge with a soft inner crescent.', width: 4, points: [{ x: 284, y: 112 }, { x: 300, y: 124 }, { x: 308, y: 142 }, { x: 309, y: 161 }, { x: 303, y: 179 }, { x: 291, y: 194 }] },
  { id: 'tail-stripe', artifactId: 'fox-tail', label: 'a tail stripe', purpose: 'Follow the curl of the fox tail with a contrasting stripe.', width: 9, points: [{ x: 790, y: 464 }, { x: 811, y: 449 }, { x: 834, y: 440 }, { x: 858, y: 438 }, { x: 880, y: 444 }] },
  { id: 'river-ripple-one', artifactId: 'river', label: 'a river ripple', purpose: 'Add a flowing ripple that follows the river bend.', width: 5, points: [{ x: 670, y: 632 }, { x: 706, y: 614 }, { x: 747, y: 600 }, { x: 790, y: 590 }, { x: 834, y: 581 }] },
  { id: 'river-ripple-two', artifactId: 'river', label: 'a second river ripple', purpose: 'Add a shorter echoing ripple inside the river.', width: 4, points: [{ x: 786, y: 622 }, { x: 822, y: 610 }, { x: 860, y: 602 }, { x: 897, y: 590 }] },
  { id: 'fox-whisker-left', artifactId: 'fox-head', label: 'left whiskers', purpose: 'Give the fox expressive whiskers that follow its cheek.', width: 4, points: [{ x: 614, y: 379 }, { x: 598, y: 384 }, { x: 580, y: 386 }, { x: 563, y: 384 }] },
  { id: 'fox-whisker-right', artifactId: 'fox-head', label: 'right whiskers', purpose: 'Balance the fox face with whiskers on its right cheek.', width: 4, points: [{ x: 680, y: 379 }, { x: 697, y: 384 }, { x: 715, y: 386 }, { x: 732, y: 383 }] },
  { id: 'hill-grass', artifactId: 'hill', label: 'hill grass', purpose: 'Add a small tuft of grass beside the fox.', width: 5, points: [{ x: 484, y: 485 }, { x: 481, y: 469 }, { x: 486, y: 483 }, { x: 494, y: 468 }, { x: 490, y: 486 }] },
] as const

export const LEGACY_SKY_CHEVRONS = [
  [{ x: 840, y: 130 }, { x: 875, y: 104 }, { x: 910, y: 130 }],
  [{ x: 935, y: 205 }, { x: 970, y: 177 }, { x: 1008, y: 205 }],
  [{ x: 720, y: 155 }, { x: 750, y: 128 }, { x: 782, y: 155 }],
  [{ x: 315, y: 275 }, { x: 350, y: 248 }, { x: 386, y: 275 }],
  [{ x: 1020, y: 300 }, { x: 1050, y: 274 }, { x: 1082, y: 300 }],
  [{ x: 480, y: 190 }, { x: 515, y: 164 }, { x: 550, y: 190 }],
] as const

export function isLegacySkyChevron(points: readonly PaintingPoint[]): boolean {
  return LEGACY_SKY_CHEVRONS.some((legacy) => legacy.length === points.length && legacy.every((point, index) => point.x === points[index]?.x && point.y === points[index]?.y))
}

export function containsArtifactPoint(artifactId: string, point: PaintingPoint, margin = 24): boolean {
  const artifact = PAINT_ARTIFACTS.find((item) => item.id === artifactId)
  if (!artifact) return false
  const { x, y, width, height } = artifact.bounds
  return point.x >= x - margin && point.x <= x + width + margin && point.y >= y - margin && point.y <= y + height + margin
}

function detailColor(fill: string | undefined, participant: PaintingParticipant): string {
  if (!fill) return participant === 'agent-two' ? '#247c63' : '#d9513f'
  const dark = new Set(['#263f98', '#18213f', '#247c63'])
  if (dark.has(fill.toLowerCase())) return participant === 'agent-two' ? '#fbfaf4' : '#f0b343'
  return participant === 'agent-two' ? '#263f98' : '#18213f'
}

export type SemanticPaintMove =
  | { type: 'fill'; artifactId: ArtifactId; label: string; color: string; purpose: string }
  | { type: 'detail'; artifactId: ArtifactId; detailId: string; label: string; color: string; width: number; points: PaintingPoint[]; purpose: string }

export function chooseNextPaintMove(
  state: { fills: Partial<Record<ArtifactId, { color: string }>>; usedDetailIds: readonly string[] },
  participant: PaintingParticipant,
): SemanticPaintMove | null {
  const open = PAINT_ARTIFACTS.find((artifact) => !state.fills[artifact.id])
  if (open) {
    const paletteIndex = participant === 'agent-two' && open.suggestedColors.length > 1 ? 1 : 0
    return { type: 'fill', artifactId: open.id, label: open.label, color: open.suggestedColors[paletteIndex].hex, purpose: `Color ${open.description.toLowerCase()}` }
  }
  const detail = ARTIFACT_DETAILS.find((item) => !state.usedDetailIds.includes(item.id))
  if (!detail) return null
  return {
    type: 'detail', artifactId: detail.artifactId, detailId: detail.id, label: detail.label,
    color: detailColor(state.fills[detail.artifactId]?.color, participant), width: detail.width,
    points: detail.points.map((point) => ({ ...point })), purpose: detail.purpose,
  }
}
