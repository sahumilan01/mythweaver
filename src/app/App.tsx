'use client'

import {
  Check,
  Copy,
  Info,
  MoonStars,
  PencilSimpleLine,
  Play,
  Robot,
  Sparkle,
  X,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createNativeCanvasPort, NativeStoryCanvas } from '../canvas/nativeCanvas'
import {
  createStoryStore,
  type StoryBeat,
  type StoryProposal,
  type StoryStore,
  type StoryState,
} from '../story/storyStore'
import { registerMythWeaverTools } from '../webmcp/registerTools'

const STORY_STORAGE_KEY = 'mythweaver-story-state-v1'

function loadStoryState(): StoryState | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(STORY_STORAGE_KEY)
    if (!raw) return undefined
    const state = JSON.parse(raw) as Partial<StoryState>
    if (
      typeof state.revision !== 'number' ||
      !Array.isArray(state.contributions) ||
      !('pending' in state)
    ) {
      return undefined
    }
    return state as StoryState
  } catch {
    return undefined
  }
}

const SAMPLE_PROMPT =
  'Paint with me in MythWeaver. Read the coloring canvas, choose two uncolored regions, and color them one at a time while I keep painting. Tell me what you changed.'

function useStoryState(story: StoryStore) {
  return useSyncExternalStore(story.subscribe, story.getState, story.getState)
}

export function App() {
  const [story] = useState(() => createStoryStore(loadStoryState()))
  const [canvas] = useState(() => createNativeCanvasPort())
  const [guideOpen, setGuideOpen] = useState(() => {
    const saved = canvas.getSnapshot()
    return Object.keys(saved.fills).length === 0 && saved.shapes.length === 0
  })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [agentActivity, setAgentActivity] = useState('Waiting for your first mark.')
  const [playback, setPlayback] = useState<{ beats: StoryBeat[]; index: number } | null>(
    null,
  )
  const state = useStoryState(story)
  const canvasState = useSyncExternalStore(canvas.subscribe, canvas.getSnapshot, canvas.getServerSnapshot)
  const webMcpReady = typeof document !== 'undefined' && Boolean(document.modelContext)

  useEffect(
    () => story.subscribe(() => {
      window.localStorage.setItem(STORY_STORAGE_KEY, JSON.stringify(story.getState()))
    }),
    [story],
  )

  const startPerformance = useCallback((beats: StoryBeat[]) => {
    if (beats.length > 0) setPlayback({ beats, index: 0 })
  }, [])

  useEffect(() => canvas.setPreviewHandler(startPerformance), [canvas, startPerformance])

  useEffect(() => {
    return canvas.subscribeToHumanChanges(() => story.noteHumanChange())
  }, [canvas, story])

  useEffect(() => {
    if (!document.modelContext) return
    return registerMythWeaverTools({
      modelContext: document.modelContext,
      story,
      canvas,
      onAgentActivity: setAgentActivity,
    })
  }, [canvas, story])

  useEffect(() => {
    if (!playback || !canvas) return
    const beat = playback.beats[playback.index]
    canvas.focus(beat.elementIds)
    const timeout = window.setTimeout(() => {
      setPlayback((current) => {
        if (!current || current.index >= current.beats.length - 1) return null
        return { ...current, index: current.index + 1 }
      })
    }, 2500)
    return () => window.clearTimeout(timeout)
  }, [canvas, playback])

  const committedBeats = useMemo(
    () => state.contributions.flatMap((contribution) => contribution.beats),
    [state.contributions],
  )

  const stageSample = () => {
    if (state.pending) return
    setGuideOpen(false)
    canvas.showAgentPresence('ChatGPT joined')
    setAgentActivity('ChatGPT joined the canvas and is moving to the fox.')
    void (async () => {
      await canvas.moveAgentToRegion('fox-body', 'Painting Fox body')
      canvas.paintRegion('fox-body', '#d9513f', 'agent')
      setAgentActivity('ChatGPT colored the fox body coral. It is moving to the river.')
      await canvas.moveAgentToRegion('river', 'Painting Winding river')
      canvas.paintRegion('river', '#263f98', 'agent')
      setAgentActivity('ChatGPT colored the river blue. You can keep painting at the same time.')
    })()
  }

  const addStarter = () => {
    canvas.addHumanStarter()
    setAgentActivity('You colored the moon. ChatGPT can join whenever you ask.')
    setGuideOpen(false)
  }

  const accept = () => {
    if (!state.pending) return
    const title = state.pending.title
    canvas.commitProposal(state.pending)
    story.acceptPending()
    setAgentActivity(`You kept “${title}”. It is now part of the story.`)
  }

  const discard = () => {
    if (!state.pending) return
    canvas.clearProposal(state.pending)
    story.discardPending()
    setAgentActivity('You removed the suggestion. Your own marks stayed untouched.')
  }

  const perform = () => startPerformance(committedBeats)

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(SAMPLE_PROMPT)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const agentHasPaint = Object.values(canvasState.fills).some((fill) => fill?.origin === 'agent')
    || canvasState.shapes.some((shape) => shape.origin === 'agent')
  const hasPaint = Object.keys(canvasState.fills).length > 0 || canvasState.shapes.length > 0
  const phase = state.pending
    ? 'review'
    : agentHasPaint || canvasState.agentPresence || state.contributions.length > 0
      ? 'build'
      : hasPaint || state.revision > 0
        ? 'ask'
        : 'start'

  return (
    <main className="myth-app">
      <header className="story-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <MoonStars weight="fill" />
          </span>
          <div>
            <strong>MythWeaver</strong>
            <span>Paint the same page together</span>
          </div>
        </div>

        <div className="header-actions">
          <div className="collaborator-presence" aria-label={canvasState.agentPresence ? 'You and ChatGPT are in the canvas' : 'You are in the canvas'}>
            <span className="collaborator-avatar human-avatar" title="You">You</span>
            {canvasState.agentPresence && (
              <span className="collaborator-avatar agent-avatar" title="ChatGPT is in the canvas">
                <Robot weight="fill" aria-hidden="true" />
                <i>ChatGPT joined</i>
              </span>
            )}
          </div>
          <span className={`turn-status turn-${phase}`}>
            {phase === 'review' || phase === 'build' ? <Robot weight="bold" aria-hidden="true" /> : <PencilSimpleLine weight="bold" aria-hidden="true" />}
            {phase === 'review' ? 'Your decision' : phase === 'build' ? 'Painting together' : phase === 'ask' ? 'Invite ChatGPT' : 'Start painting'}
          </span>
          <button
            className="text-button"
            type="button"
            onClick={() => setGuideOpen(true)}
          >
            Guide
          </button>
          <button
            className="text-button advanced-button"
            type="button"
            onClick={() => setAdvancedOpen(true)}
          >
            Advanced
            <Info weight="bold" aria-hidden="true" />
          </button>
          {committedBeats.length > 0 && <button
            className="primary-button"
            type="button"
            aria-label="Perform story"
            onClick={perform}
            disabled={committedBeats.length === 0 || Boolean(playback)}
          >
            <Play weight="fill" aria-hidden="true" />
            <span>Perform story</span>
          </button>}
        </div>
      </header>

      <section className="canvas-stage" aria-label="MythWeaver story canvas">
        <NativeStoryCanvas canvas={canvas} />

        {!guideOpen && phase === 'ask' && (
          <aside className="pair-hint" aria-live="polite">
            <Robot weight="fill" aria-hidden="true" />
            <span><b>Your move is live.</b> Now ask ChatGPT to paint the fox.</span>
            <button type="button" onClick={() => setGuideOpen(true)}>Pair</button>
          </aside>
        )}

        {state.pending && (
          <ProposalCard proposal={state.pending} onAccept={accept} onDiscard={discard} />
        )}

        {!state.pending && !playback && guideOpen && (
          <TurnGuide
            phase={phase}
            webMcpReady={webMcpReady}
            copied={copied}
            onCopy={copyPrompt}
            onSample={stageSample}
            onStarter={addStarter}
            onClose={() => setGuideOpen(false)}
            ready
          />
        )}

        {advancedOpen && (
          <AdvancedPanel
            webMcpReady={webMcpReady}
            revision={state.revision}
            paintMoves={Object.keys(canvasState.fills).length + canvasState.shapes.length}
            agentActivity={agentActivity}
            onClose={() => setAdvancedOpen(false)}
          />
        )}

        {playback && (
          <PerformanceOverlay
            beat={playback.beats[playback.index]}
            current={playback.index + 1}
            total={playback.beats.length}
            onStop={() => setPlayback(null)}
          />
        )}
      </section>
    </main>
  )
}

function ProposalCard({
  proposal,
  onAccept,
  onDiscard,
}: {
  proposal: StoryProposal
  onAccept: () => void
  onDiscard: () => void
}) {
  return (
    <aside className="proposal-card" aria-live="polite">
      <div className="proposal-heading">
        <span className="proposal-icon"><Sparkle weight="fill" /></span>
        <div>
          <span className="proposal-label">ChatGPT suggests</span>
          <h2>{proposal.title}</h2>
        </div>
        <span className="proposal-status">Waiting for you</span>
      </div>
      <p>{proposal.narration}</p>
      <p className="proposal-explanation">
        ChatGPT read your canvas and added the dashed coral shapes. This is only a suggestion.
      </p>
      <p className="counter-offer-copy">
        Want a change? Draw over it, then tell ChatGPT what to revise.
      </p>
      <div className="proposal-meta">
        {proposal.elements.length} new {proposal.elements.length === 1 ? 'element' : 'elements'}
        <span aria-hidden="true">/</span>
        {proposal.beats.length} story {proposal.beats.length === 1 ? 'beat' : 'beats'}
      </div>
      <div className="proposal-actions">
        <button className="accept-button" type="button" onClick={onAccept}>
          <Check weight="bold" aria-hidden="true" />
          Keep this idea
        </button>
        <button className="discard-button" type="button" onClick={onDiscard}>
          <X weight="bold" aria-hidden="true" />
          Remove it
        </button>
      </div>
    </aside>
  )
}

type GuidePhase = 'start' | 'ask' | 'build' | 'review'

function TurnGuide({
  phase,
  webMcpReady,
  copied,
  onClose,
  onCopy,
  onSample,
  onStarter,
  ready,
}: {
  phase: GuidePhase
  webMcpReady: boolean
  copied: boolean
  onClose: () => void
  onCopy: () => void
  onSample: () => void
  onStarter: () => void
  ready: boolean
}) {
  const isStart = phase === 'start'
  const isAsk = phase === 'ask'
  const isBuild = phase === 'build'

  return (
    <aside className={`turn-guide guide-${phase}`} aria-live="polite">
      <button className="close-button" type="button" onClick={onClose} aria-label="Hide guide">
        <X weight="bold" />
      </button>
      <div className="turn-guide-role">
        <span>{isAsk ? 'Invite your partner' : isBuild ? 'Pair painting live' : 'Your turn'}</span>
        <i>{isStart ? '1' : isAsk ? '2' : '3'}</i>
      </div>
      <h1>{isStart ? 'Tap a shape to color it' : isAsk ? 'Invite ChatGPT to paint with you' : 'You’re painting together'}</h1>
      <p>
        {isStart
          ? 'Choose a color below, then tap any part of the picture. You can also drag anywhere to draw.'
          : isAsk
            ? webMcpReady
              ? 'Send the line below in ChatGPT. WebMCP lets it color this same picture while you keep painting.'
              : 'Open this site inside ChatGPT to pair paint live. You can preview the rhythm here first.'
            : 'Your marks and ChatGPT’s marks appear on the same page as they happen. Keep coloring, draw freely, or ask for a new direction.'}
      </p>
      {isAsk && <blockquote>“Paint with me in MythWeaver. Read the coloring canvas, choose two uncolored regions, and color them one at a time while I keep painting. Tell me what you changed.”</blockquote>}
      <div className="turn-guide-actions">
        {isStart && (
          <button className="prompt-button" type="button" onClick={onStarter} disabled={!ready}>
            <MoonStars weight="fill" aria-hidden="true" />
            Color the moon
          </button>
        )}
        {isAsk && (
          <button className="prompt-button" type="button" onClick={onCopy}>
            <Copy weight="bold" aria-hidden="true" />
            {copied ? 'Prompt copied' : 'Copy this prompt'}
          </button>
        )}
        {isAsk && (
          <button className="sample-button" type="button" onClick={onSample}>
            <Sparkle weight="fill" aria-hidden="true" />
            Watch a demo partner
          </button>
        )}
        {isBuild && (
          <>
            <button className="prompt-button" type="button" onClick={onCopy}>
              <Copy weight="bold" aria-hidden="true" />
              {copied ? 'Prompt copied' : 'Invite another move'}
            </button>
            <button className="sample-button" type="button" onClick={onClose}>Keep painting</button>
          </>
        )}
      </div>
      <p className="turn-guide-foot">
        {isStart ? 'No blank page. The outline is ready.' : isAsk ? 'Every change is visible and undoable.' : 'You can undo your paint. ChatGPT can undo its own.'}
      </p>
    </aside>
  )
}

function AdvancedPanel({
  webMcpReady,
  revision,
  paintMoves,
  agentActivity,
  onClose,
}: {
  webMcpReady: boolean
  revision: number
  paintMoves: number
  agentActivity: string
  onClose: () => void
}) {
  return (
    <aside className="advanced-panel" aria-label="Advanced WebMCP details">
      <button className="close-button" type="button" onClick={onClose} aria-label="Close advanced details">
        <X weight="bold" />
      </button>
      <span className="advanced-kicker"><Info weight="fill" />Advanced view</span>
      <h2>How ChatGPT reaches the canvas</h2>
      <p>WebMCP is the bridge. It lets ChatGPT work in the same painting instead of describing changes from outside it.</p>
      <ol className="mcp-flow">
        <li><strong>The page names every paintable region.</strong><span>ChatGPT sees the moon, fox, stars, hill, and river.</span></li>
        <li><strong>Each tool call becomes a visible move.</strong><span>ChatGPT can fill one region or add one brush stroke at a time.</span></li>
        <li><strong>You can paint at the same time.</strong><span>Both kinds of marks share one reactive canvas.</span></li>
        <li><strong>Every paint move is reversible.</strong><span>You undo yours. ChatGPT can undo or clear its own paint.</span></li>
      </ol>
      <div className="advanced-stats">
        <span><b>{webMcpReady ? 'Connected' : 'Canvas only'}</b>WebMCP</span>
        <span><b>{revision}</b>Canvas revision</span>
        <span><b>{paintMoves}</b>Paint moves</span>
      </div>
      <div className="activity-log">
        <span>Latest activity</span>
        <p>{agentActivity}</p>
      </div>
      <div className="provenance-key" aria-label="Contribution appearance">
        <span><i className="human-swatch" /> Your paint</span>
        <span><i className="agent-swatch" /> ChatGPT paint</span>
      </div>
    </aside>
  )
}

function PerformanceOverlay({
  beat,
  current,
  total,
  onStop,
}: {
  beat: StoryBeat
  current: number
  total: number
  onStop: () => void
}) {
  return (
    <div className="performance-overlay" aria-live="polite">
      <div className="performance-copy">
        <span>{current} / {total}</span>
        <p>{beat.narration}</p>
      </div>
      <button type="button" onClick={onStop}>Stop</button>
    </div>
  )
}
