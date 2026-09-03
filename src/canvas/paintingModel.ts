export type PaintingParticipant = 'agent' | 'agent-two'

export const SCENE_PALETTE = [
  { name: 'Moon gold', hex: '#f0b343', use: 'moon, stars, or hill' },
  { name: 'Fox coral', hex: '#d9513f', use: 'fox sections' },
  { name: 'Forest green', hex: '#247c63', use: 'hill or fox sections' },
  { name: 'Night blue', hex: '#263f98', use: 'river or cool sections' },
  { name: 'Midnight ink', hex: '#18213f', use: 'dark sections' },
] as const

export const PAINT_ARTIFACTS = [
  { id: 'hill', label: 'Moonlit hill', kind: 'landscape', description: 'The broad ground beneath the fox and river.', center: { x: 350, y: 520 }, bounds: { x: 0, y: 390, width: 1200, height: 310 }, suggestedColors: [SCENE_PALETTE[2], SCENE_PALETTE[0]] },
  { id: 'river', label: 'Winding river', kind: 'landscape', description: 'A curved river crossing the lower-right hill.', center: { x: 830, y: 590 }, bounds: { x: 520, y: 455, width: 530, height: 245 }, suggestedColors: [SCENE_PALETTE[3], SCENE_PALETTE[1]] },
  { id: 'moon', label: 'Moon', kind: 'sky-object', description: 'The large round moon in the upper-left sky.', center: { x: 260, y: 160 }, bounds: { x: 182, y: 82, width: 156, height: 156 }, suggestedColors: [SCENE_PALETTE[0], SCENE_PALETTE[3]] },
  { id: 'star-one', label: 'Little star', kind: 'sky-object', description: 'The small star at the far left.', center: { x: 104, y: 163 }, bounds: { x: 64, y: 126, width: 80, height: 76 }, suggestedColors: [SCENE_PALETTE[0], SCENE_PALETTE[1]] },
  { id: 'star-two', label: 'Far star', kind: 'sky-object', description: 'The small star above and left of the fox.', center: { x: 438, y: 114 }, bounds: { x: 408, y: 84, width: 60, height: 58 }, suggestedColors: [SCENE_PALETTE[0], SCENE_PALETTE[1]] },
  { id: 'fox-tail', label: 'Fox tail', kind: 'character-part', description: 'The curled tail on the fox’s right side.', center: { x: 820, y: 450 }, bounds: { x: 714, y: 350, width: 200, height: 192 }, suggestedColors: [SCENE_PALETTE[1], SCENE_PALETTE[0]] },
  { id: 'fox-body', label: 'Fox body', kind: 'character-part', description: 'The round body in the center of the scene.', center: { x: 650, y: 440 }, bounds: { x: 515, y: 325, width: 255, height: 251 }, suggestedColors: [SCENE_PALETTE[1], SCENE_PALETTE[2]] },
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

export type SectionFillMove = {
  type: 'fill'
  artifactId: ArtifactId
  label: string
  color: string
  purpose: string
}

export function chooseNextSectionFill(
  fills: Partial<Record<ArtifactId, { color: string }>>,
  participant: PaintingParticipant,
): SectionFillMove | null {
  const open = PAINT_ARTIFACTS.find((artifact) => !fills[artifact.id])
  if (!open) return null
  const paletteIndex = participant === 'agent-two' && open.suggestedColors.length > 1 ? 1 : 0
  return {
    type: 'fill',
    artifactId: open.id,
    label: open.label,
    color: open.suggestedColors[paletteIndex].hex,
    purpose: `Fill the ${open.label} section`,
  }
}
