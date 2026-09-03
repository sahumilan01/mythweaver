import { ArrowCounterClockwise, Eraser, PencilSimple } from '@phosphor-icons/react'
import {
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import type { StoryBeat, StoryElement, StoryProposal } from '../story/storyStore'
import type { CanvasPort, ProposalDraft, ProposalShape } from '../webmcp/registerTools'
import { ARTIFACT_RELATIONS, PAINT_ARTIFACTS, SCENE_PALETTE, chooseNextSectionFill } from './paintingModel'

const CANVAS_STORAGE_KEY = 'mythweaver-pair-painting-v1'
const VIEWBOX_WIDTH = 1200
const VIEWBOX_HEIGHT = 700

export type PaintOrigin = 'human' | 'agent' | 'agent-two'
export type AgentId = 'agent' | 'agent-two'
export type PaintPoint = { x: number; y: number }
export type AgentPresence = { x: number; y: number; label: string }

export const PAINT_REGIONS = [
  { id: 'hill', label: 'Moonlit hill', d: 'M0 515 C180 430 345 485 515 470 C720 450 890 390 1200 470 L1200 700 L0 700 Z' },
  { id: 'river', label: 'Winding river', d: 'M535 700 C595 610 700 570 815 550 C905 535 975 515 1030 465 C1000 535 935 575 850 602 C750 635 690 665 655 700 Z' },
  { id: 'moon', label: 'Moon', d: 'M260 82 A78 78 0 1 0 260 238 A78 78 0 1 0 260 82 Z' },
  { id: 'star-one', label: 'Little star', d: 'M104 126 L116 151 L144 155 L124 174 L129 202 L104 189 L79 202 L84 174 L64 155 L92 151 Z' },
  { id: 'star-two', label: 'Far star', d: 'M438 84 L447 103 L468 106 L453 121 L456 142 L438 132 L419 142 L423 121 L408 106 L429 103 Z' },
  { id: 'fox-tail', label: 'Fox tail', d: 'M714 430 C835 350 915 385 904 464 C895 530 820 542 744 492 C807 487 832 456 842 424 C805 432 770 454 733 476 Z' },
  { id: 'fox-body', label: 'Fox body', d: 'M545 340 C505 405 514 515 583 548 C647 576 735 548 754 482 C770 424 736 365 678 342 C634 325 581 325 545 340 Z' },
  { id: 'fox-head', label: 'Fox face', d: 'M548 348 L520 260 L590 298 C625 278 669 278 705 299 L776 260 L747 351 C735 402 694 432 647 432 C598 432 560 402 548 348 Z' },
] as const

type RegionId = (typeof PAINT_REGIONS)[number]['id']
type RegionFill = { color: string; origin: PaintOrigin }

const REGION_CENTERS = Object.fromEntries(PAINT_ARTIFACTS.map((artifact) => [artifact.id, artifact.center])) as Record<RegionId, PaintPoint>

type CanvasShape =
  {
      id: string
      type: 'geo'
      origin: PaintOrigin
      status: 'pending' | 'committed'
      elementId?: string
      proposalId?: string
      geo: ProposalShape
      x: number
      y: number
      w: number
      h: number
      label: string
      color: string
    }

export interface CanvasSnapshot {
  shapes: CanvasShape[]
  fills: Partial<Record<RegionId, RegionFill>>
  focusedIds: string[]
  lastAction: { origin: PaintOrigin; label: string } | null
  agentPresence: AgentPresence | null
  agentTwoPresence: AgentPresence | null
}

export interface NativeCanvasPort extends CanvasPort {
  addHumanStarter(): void
  paintRegion(regionId: string, color: string, origin: PaintOrigin): void
  clearPaint(origin: PaintOrigin): void
  undoLast(origin: PaintOrigin): boolean
  commitProposal(proposal: StoryProposal): void
  subscribeToHumanChanges(listener: () => void): () => void
  subscribe(listener: () => void): () => void
  getSnapshot(): CanvasSnapshot
  getServerSnapshot(): CanvasSnapshot
  setPreviewHandler(handler: (beats: StoryBeat[]) => void): void
  showAgentPresence(label: string, agentId?: AgentId): void
  moveAgentCursor(point: PaintPoint, label: string, agentId?: AgentId): Promise<void>
  moveAgentToRegion(regionId: string, label: string, agentId?: AgentId): Promise<void>
}

const EMPTY_SNAPSHOT: CanvasSnapshot = { shapes: [], fills: {}, focusedIds: [], lastAction: null, agentPresence: null, agentTwoPresence: null }

const parseStoredSnapshot = (raw: string | null, includeLivePresence = false): CanvasSnapshot => {
  try {
    const value = JSON.parse(raw ?? '{}')
    const rawShapes = Array.isArray(value.shapes) ? value.shapes : []
    const shapes = rawShapes.filter((shape: { type?: string }) => shape?.type !== 'stroke') as CanvasShape[]
    const removedFreehandMarks = shapes.length !== rawShapes.length
    return {
      shapes,
      fills: value.fills && typeof value.fills === 'object' ? value.fills : {},
      focusedIds: Array.isArray(value.focusedIds) ? value.focusedIds : [],
      lastAction: !removedFreehandMarks && (value.lastAction?.origin === 'human' || value.lastAction?.origin === 'agent' || value.lastAction?.origin === 'agent-two')
        ? value.lastAction
        : null,
      agentPresence: includeLivePresence && value.agentPresence && typeof value.agentPresence === 'object' ? value.agentPresence : null,
      agentTwoPresence: includeLivePresence && value.agentTwoPresence && typeof value.agentTwoPresence === 'object' ? value.agentTwoPresence : null,
    }
  } catch {
    return EMPTY_SNAPSHOT
  }
}

const loadSnapshot = (): CanvasSnapshot => {
  if (typeof window === 'undefined') return EMPTY_SNAPSHOT
  return parseStoredSnapshot(window.localStorage.getItem(CANVAS_STORAGE_KEY))
}

const safeColor = (color: string) => /^#[0-9a-f]{6}$/i.test(color) ? color : '#d9513f'
const originName = (origin: PaintOrigin) => origin === 'human' ? 'You' : origin === 'agent-two' ? 'Mica' : 'ChatGPT'

export function createNativeCanvasPort(): NativeCanvasPort {
  let snapshot: CanvasSnapshot = loadSnapshot()
  let previewHandler: (beats: StoryBeat[]) => void = () => undefined
  const listeners = new Set<() => void>()
  const humanListeners = new Set<() => void>()
  const actions: Array<{ origin: PaintOrigin; undo: () => void }> = []

  const publish = (next: CanvasSnapshot) => {
    snapshot = next
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify({
        shapes: next.shapes,
        fills: next.fills,
        focusedIds: next.focusedIds,
        lastAction: next.lastAction,
        agentPresence: next.agentPresence,
        agentTwoPresence: next.agentTwoPresence,
      }))
    }
    listeners.forEach((listener) => listener())
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== CANVAS_STORAGE_KEY || !event.newValue) return
      snapshot = parseStoredSnapshot(event.newValue, true)
      listeners.forEach((listener) => listener())
    })
  }

  const announceHumanChange = () => humanListeners.forEach((listener) => listener())
  const flash = (id: string) => globalThis.setTimeout(() => {
    if (snapshot.focusedIds.includes(id)) publish({ ...snapshot, focusedIds: [] })
  }, 850)

  const paintRegion = (regionId: string, color: string, origin: PaintOrigin) => {
    const region = PAINT_REGIONS.find((item) => item.id === regionId)
    if (!region) throw new Error(`Unknown paint region: ${regionId}.`)
    const previous = snapshot.fills[region.id]
    actions.push({
      origin,
      undo: () => {
        const fills = { ...snapshot.fills }
        if (previous) fills[region.id] = previous
        else delete fills[region.id]
        publish({ ...snapshot, fills, focusedIds: [region.id], lastAction: { origin, label: `Undid color on ${region.label}` } })
      },
    })
    publish({
      ...snapshot,
      fills: { ...snapshot.fills, [region.id]: { color: safeColor(color), origin } },
      focusedIds: [region.id],
      lastAction: { origin, label: `${originName(origin)} colored ${region.label}` },
      agentPresence: origin === 'agent' && snapshot.agentPresence
        ? { ...snapshot.agentPresence, label: `Painted ${region.label}` }
        : snapshot.agentPresence,
      agentTwoPresence: origin === 'agent-two' && snapshot.agentTwoPresence
        ? { ...snapshot.agentTwoPresence, label: `Painted ${region.label}` }
        : snapshot.agentTwoPresence,
    })
    if (origin === 'human') announceHumanChange()
    flash(region.id)
  }

  const showAgentPresence = (label: string, agentId: AgentId = 'agent') => {
    const key = agentId === 'agent' ? 'agentPresence' : 'agentTwoPresence'
    const current = snapshot[key]
    publish({
      ...snapshot,
      [key]: current
        ? { ...current, label }
        : { x: agentId === 'agent' ? 1080 : 980, y: agentId === 'agent' ? 100 : 145, label },
    })
  }

  const moveAgentCursor = async (point: PaintPoint, label: string, agentId: AgentId = 'agent') => {
    const key = agentId === 'agent' ? 'agentPresence' : 'agentTwoPresence'
    if (!snapshot[key]) {
      showAgentPresence(`${agentId === 'agent' ? 'ChatGPT' : 'Mica'} joined`, agentId)
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 90))
    publish({
      ...snapshot,
      [key]: {
        x: Math.min(VIEWBOX_WIDTH - 80, Math.max(20, point.x)),
        y: Math.min(VIEWBOX_HEIGHT - 60, Math.max(20, point.y)),
        label,
      },
    })
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    await new Promise((resolve) => globalThis.setTimeout(resolve, reducedMotion ? 80 : 620))
  }

  const renderElements = (proposal: ProposalDraft): StoryElement[] => {
    const elements = proposal.elements.map((element) => ({ id: element.id, shapeId: `shape:${proposal.id}:${element.id}`, name: element.name, role: element.role }))
    const additions: CanvasShape[] = proposal.elements.map((element) => ({
      id: `shape:${proposal.id}:${element.id}`,
      type: 'geo',
      origin: 'agent',
      status: 'pending',
      elementId: element.id,
      proposalId: proposal.id,
      geo: element.shape,
      x: element.x,
      y: element.y,
      w: element.w,
      h: element.h,
      label: element.name,
      color: '#e7651b',
    }))
    publish({ ...snapshot, shapes: [...snapshot.shapes, ...additions], lastAction: { origin: 'agent', label: 'ChatGPT staged a story idea' } })
    return elements
  }

  return {
    addHumanStarter: () => paintRegion('moon', '#f0b343', 'human'),
    paintRegion,
    clearPaint(origin) {
      const removedShapes = snapshot.shapes.filter((shape) => shape.origin === origin)
      const removedFills = Object.entries(snapshot.fills).filter(([, fill]) => fill?.origin === origin)
      if (removedShapes.length === 0 && removedFills.length === 0) return
      actions.push({
        origin,
        undo: () => publish({
          ...snapshot,
          shapes: [...snapshot.shapes, ...removedShapes],
          fills: { ...snapshot.fills, ...Object.fromEntries(removedFills) },
          lastAction: { origin, label: `Restored ${origin === 'agent' ? 'ChatGPT’s' : 'your'} paint` },
        }),
      })
      const fills = { ...snapshot.fills }
      removedFills.forEach(([id]) => delete fills[id as RegionId])
      publish({ ...snapshot, shapes: snapshot.shapes.filter((shape) => shape.origin !== origin), fills, lastAction: { origin, label: `Cleared ${origin === 'agent' ? 'ChatGPT’s' : 'your'} paint` } })
      if (origin === 'human') announceHumanChange()
    },
    undoLast(origin) {
      const index = actions.findLastIndex((action) => action.origin === origin)
      if (index < 0) return false
      const [action] = actions.splice(index, 1)
      action.undo()
      if (origin === 'human') announceHumanChange()
      return true
    },
    readWorld() {
      return {
        canvas: { width: VIEWBOX_WIDTH, height: VIEWBOX_HEIGHT, coordinateSystem: 'top-left; x grows right, y grows down' },
        scene: { title: 'Moonlit fox', description: 'A coloring-book scene with a fox resting on a hill beside a winding river, under a moon and two stars.' },
        palette: SCENE_PALETTE,
        relations: ARTIFACT_RELATIONS,
        interactionRule: 'Choose a color and fill exactly one predefined section. Freehand lines are disabled for both humans and agents.',
        suggestedNextMoves: [chooseNextSectionFill(snapshot.fills, 'agent')].filter(Boolean),
        selection: snapshot.focusedIds,
        regions: PAINT_REGIONS.map((region) => ({ id: region.id, name: region.label, fill: snapshot.fills[region.id] ?? null })),
        artifacts: PAINT_ARTIFACTS.map((artifact) => ({
          ...artifact,
          fill: snapshot.fills[artifact.id] ?? null,
        })),
        shapes: snapshot.shapes.slice(0, 40).map((shape) => ({ id: shape.id, type: shape.geo, origin: shape.origin, status: shape.status, text: shape.label, elementId: shape.elementId })),
      }
    },
    renderProposal: renderElements,
    replaceProposal(previous, proposal) {
      const ids = new Set(previous.elements.map((element) => element.shapeId))
      publish({ ...snapshot, shapes: snapshot.shapes.filter((shape) => !ids.has(shape.id)) })
      return renderElements(proposal)
    },
    clearProposal(proposal) {
      const ids = new Set(proposal.elements.map((element) => element.shapeId))
      publish({ ...snapshot, shapes: snapshot.shapes.filter((shape) => !ids.has(shape.id)) })
    },
    commitProposal(proposal) {
      const ids = new Set(proposal.elements.map((element) => element.shapeId))
      publish({ ...snapshot, shapes: snapshot.shapes.map((shape) => shape.type === 'geo' && ids.has(shape.id) ? { ...shape, status: 'committed' as const } : shape) })
    },
    focus(elementIds) {
      const ids = snapshot.shapes.filter((shape) => shape.type === 'geo' && shape.elementId && elementIds.includes(shape.elementId)).map((shape) => shape.id)
      publish({ ...snapshot, focusedIds: ids })
      ids.forEach(flash)
      return elementIds.filter((elementId) => snapshot.shapes.some((shape) => shape.type === 'geo' && shape.elementId === elementId))
    },
    preview: (beats) => previewHandler(beats),
    subscribeToHumanChanges(listener) {
      humanListeners.add(listener)
      return () => humanListeners.delete(listener)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY_SNAPSHOT,
    setPreviewHandler(handler) {
      previewHandler = handler
    },
    showAgentPresence,
    moveAgentCursor,
    moveAgentToRegion(regionId, label, agentId = 'agent') {
      const region = PAINT_REGIONS.find((item) => item.id === regionId)
      if (!region) return Promise.reject(new Error(`Unknown paint region: ${regionId}.`))
      return moveAgentCursor(REGION_CENTERS[region.id], label, agentId)
    },
  }
}

function Star({ shape }: { shape: Extract<CanvasShape, { type: 'geo' }> }) {
  const cx = shape.x + shape.w / 2
  const cy = shape.y + shape.h / 2
  const outer = Math.min(shape.w, shape.h) / 2
  const inner = outer * 0.46
  const points = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (index * Math.PI) / 5
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`
  }).join(' ')
  return <polygon points={points} />
}

function GeoShape({ shape, focused }: { shape: Extract<CanvasShape, { type: 'geo' }>; focused: boolean }) {
  const common = {
    fill: shape.origin === 'agent' ? 'rgba(231, 101, 27, 0.09)' : 'rgba(66, 99, 235, 0.08)',
    stroke: shape.color,
    strokeWidth: focused ? 7 : 4,
    strokeDasharray: shape.status === 'pending' ? '12 10' : undefined,
    vectorEffect: 'non-scaling-stroke' as const,
  }
  const geometry = shape.geo === 'ellipse'
    ? <ellipse {...common} cx={shape.x + shape.w / 2} cy={shape.y + shape.h / 2} rx={shape.w / 2} ry={shape.h / 2} />
    : shape.geo === 'star'
      ? <g {...common}><Star shape={shape} /></g>
      : shape.geo === 'diamond'
        ? <polygon {...common} points={`${shape.x + shape.w / 2},${shape.y} ${shape.x + shape.w},${shape.y + shape.h / 2} ${shape.x + shape.w / 2},${shape.y + shape.h} ${shape.x},${shape.y + shape.h / 2}`} />
        : <rect {...common} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.geo === 'cloud' ? 42 : 12} />
  return <g className={focused ? 'native-shape is-focused' : 'native-shape'}>{geometry}<text x={shape.x + shape.w / 2} y={shape.y + shape.h / 2} textAnchor="middle" dominantBaseline="middle">{shape.label}</text></g>
}

export function NativeStoryCanvas({ canvas, humanCanPaint = true }: { canvas: NativeCanvasPort; humanCanPaint?: boolean }) {
  const snapshot = useSyncExternalStore(canvas.subscribe, canvas.getSnapshot, canvas.getServerSnapshot)
  const [color, setColor] = useState('#263f98')
  const canUndo = Object.values(snapshot.fills).some((fill) => fill?.origin === 'human')

  return (
    <div className={`native-canvas-shell ${humanCanPaint ? '' : 'is-agent-turn'}`}>
      <div className="live-paint-status" aria-live="polite"><i className={snapshot.lastAction?.origin === 'agent' ? 'is-agent' : ''} /><span>{snapshot.lastAction?.label ?? 'Outline ready. Choose a color and tap one section.'}</span></div>
      <svg
        className="native-canvas"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Coloring book canvas. Choose a color, then tap a section to fill it."
      >
        <rect className="native-canvas-paper" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} />
        {PAINT_REGIONS.map((region) => {
          const fill = snapshot.fills[region.id]
          return <g key={region.id} className={`paint-region ${fill?.origin === 'agent' ? 'painted-by-agent' : fill?.origin === 'agent-two' ? 'painted-by-agent-two' : 'painted-by-human'} ${snapshot.focusedIds.includes(region.id) ? 'is-focused' : ''}`}><path d={region.d} fill={fill?.color ?? '#fbfaf4'} onPointerDown={(event) => { event.stopPropagation(); if (humanCanPaint) canvas.paintRegion(region.id, color, 'human') }} /><title>{region.label}{fill ? `, colored by ${fill.origin === 'agent' ? 'ChatGPT' : fill.origin === 'agent-two' ? 'Mica' : 'you'}` : ', uncolored'}</title></g>
        })}
        <g className="fox-details" aria-hidden="true"><circle cx="615" cy="348" r="6" /><circle cx="682" cy="348" r="6" /><path d="M635 373 Q648 385 661 373" /></g>
        {snapshot.shapes.map((shape) => <GeoShape key={shape.id} shape={shape} focused={snapshot.focusedIds.includes(shape.id)} />)}
        {([['agent', snapshot.agentPresence], ['agent-two', snapshot.agentTwoPresence]] as const).map(([agentId, presence]) => presence && (
          <g
            key={agentId}
            className={`agent-live-cursor ${agentId === 'agent-two' ? 'agent-two-cursor' : ''}`}
            style={{ transform: `translate(${presence.x}px, ${presence.y}px)` }}
            aria-label={`${agentId === 'agent' ? 'ChatGPT' : 'Mica'} cursor: ${presence.label}`}
          >
            <g className="agent-cursor-visual">
              <path className="agent-cursor-arrow" d="M0 0 L5 31 L13 21 L22 34 L29 29 L19 17 L31 14 Z" />
              <g className="agent-cursor-label" transform="translate(22 28)">
                <rect x="0" y="0" width={Math.min(230, Math.max(108, presence.label.length * 7.1 + 26))} height="34" rx="9" />
                <text x="13" y="22">{presence.label}</text>
              </g>
            </g>
          </g>
        ))}
      </svg>
      <div className="native-toolbar" aria-label="Painting tools">
        <span><PencilSimple weight="bold" aria-hidden="true" /> Paint</span>
        <div className="native-colors" aria-label="Paint color">
          {['#263f98', '#18213f', '#d9513f', '#247c63', '#f0b343'].map((option) => <button key={option} type="button" className={color === option ? 'is-selected' : ''} style={{ '--swatch': option } as CSSProperties} onClick={() => setColor(option)} aria-label={`Use ${option} paint color`} />)}
        </div>
        <button type="button" onClick={() => canvas.undoLast('human')} disabled={!canUndo || !humanCanPaint} aria-label="Undo my last paint"><ArrowCounterClockwise weight="bold" aria-hidden="true" /></button>
        <button type="button" onClick={() => canvas.clearPaint('human')} disabled={!canUndo || !humanCanPaint} aria-label="Clear my paint"><Eraser weight="bold" aria-hidden="true" /></button>
      </div>
    </div>
  )
}
