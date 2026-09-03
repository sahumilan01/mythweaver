'use client'

import {
  Check,
  Copy,
  MoonStars,
  PencilSimpleLine,
  Play,
  Robot,
  Sparkle,
  X,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Tldraw, type Editor } from 'tldraw'
import { createTldrawCanvasPort, type MythCanvasPort } from '../canvas/tldrawCanvas'
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
  'Read my MythWeaver story world. Explain what you think my marks mean, then propose one surprising character and up to three story beats. Keep your idea on the proposal layer so I can respond before accepting it.'

const sampleDraft = (revision: number) => ({
  id: `sample-${Date.now()}`,
  basedOnRevision: revision,
  title: 'A fox hears the moon',
  narration: 'A watchful fox follows a silver song toward the sleeping village.',
  elements: [
    {
      id: 'moon-fox',
      name: 'Moon fox',
      role: 'character' as const,
      shape: 'star' as const,
      x: 420,
      y: 180,
      w: 170,
      h: 150,
    },
    {
      id: 'moon-path',
      name: 'Silver path',
      role: 'place' as const,
      shape: 'cloud' as const,
      x: 650,
      y: 340,
      w: 250,
      h: 110,
    },
  ],
  beats: [
    {
      id: 'beat-listen',
      narration: 'The fox hears a silver song inside the jar.',
      elementIds: ['moon-fox'],
    },
    {
      id: 'beat-follow',
      narration: 'It follows the song along a path no one else can see.',
      elementIds: ['moon-path'],
    },
    {
      id: 'beat-promise',
      narration: 'Before dawn, the fox promises to return the night.',
      elementIds: ['moon-fox', 'moon-path'],
    },
  ],
})

function useStoryState(story: StoryStore) {
  return useSyncExternalStore(story.subscribe, story.getState, story.getState)
}

export function App() {
  const [story] = useState(() => createStoryStore(loadStoryState()))
  const [editor, setEditor] = useState<Editor | null>(null)
  const [canvas, setCanvas] = useState<MythCanvasPort | null>(null)
  const [welcomeOpen, setWelcomeOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const [playback, setPlayback] = useState<{ beats: StoryBeat[]; index: number } | null>(
    null,
  )
  const state = useStoryState(story)
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

  useEffect(() => {
    if (!editor) return
    setCanvas(createTldrawCanvasPort(editor, startPerformance, story.getState()))
  }, [editor, startPerformance, story])

  useEffect(() => {
    if (!canvas) return
    return canvas.subscribeToHumanChanges(() => story.noteHumanChange())
  }, [canvas, story])

  useEffect(() => {
    if (!canvas || !document.modelContext) return
    return registerMythWeaverTools({
      modelContext: document.modelContext,
      story,
      canvas,
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
    if (!canvas || state.pending) return
    const draft = sampleDraft(state.revision)
    const elements = canvas.renderProposal(draft)
    story.propose({ ...draft, elements })
    setWelcomeOpen(false)
  }

  const accept = () => {
    if (!canvas || !state.pending) return
    canvas.commitProposal(state.pending)
    story.acceptPending()
  }

  const discard = () => {
    if (!canvas || !state.pending) return
    canvas.clearProposal(state.pending)
    story.discardPending()
  }

  const perform = () => startPerformance(committedBeats)

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(SAMPLE_PROMPT)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <main className="myth-app">
      <header className="story-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <MoonStars weight="fill" />
          </span>
          <div>
            <strong>MythWeaver</strong>
            <span>Draw a world together</span>
          </div>
        </div>

        <div className="header-actions">
          <span className={`mcp-status ${webMcpReady ? 'is-ready' : ''}`}>
            <Robot weight="bold" aria-hidden="true" />
            {webMcpReady ? `WebMCP ready, revision ${state.revision}` : 'Drawing mode'}
          </span>
          <button
            className="text-button"
            type="button"
            onClick={() => setWelcomeOpen(true)}
          >
            How it works
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={perform}
            disabled={committedBeats.length === 0 || Boolean(playback)}
          >
            <Play weight="fill" aria-hidden="true" />
            Perform story
          </button>
        </div>
      </header>

      <section className="canvas-stage" aria-label="MythWeaver story canvas">
        <Tldraw
          onMount={setEditor}
          persistenceKey="mythweaver-story-world"
          licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
        />

        <div className="provenance-key" aria-label="Contribution colors">
          <span><i className="human-swatch" /> Your marks</span>
          <span><i className="agent-swatch" /> Agent contribution</span>
          <span className="consent-note">Agent proposes. You decide.</span>
        </div>

        {state.pending && (
          <ProposalCard proposal={state.pending} onAccept={accept} onDiscard={discard} />
        )}

        {welcomeOpen && (
          <WelcomePanel
            webMcpReady={webMcpReady}
            copied={copied}
            onClose={() => setWelcomeOpen(false)}
            onCopy={copyPrompt}
            onSample={stageSample}
            sampleDisabled={!canvas || Boolean(state.pending)}
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
          <span className="proposal-label">Agent proposal</span>
          <h2>{proposal.title}</h2>
        </div>
        <span className="proposal-status">Not in story</span>
      </div>
      <p>{proposal.narration}</p>
      <p className="counter-offer-copy">
        Draw a counter-offer, then ask the agent to read again and revise.
      </p>
      <div className="proposal-meta">
        {proposal.elements.length} new {proposal.elements.length === 1 ? 'element' : 'elements'}
        <span aria-hidden="true">/</span>
        {proposal.beats.length} story {proposal.beats.length === 1 ? 'beat' : 'beats'}
      </div>
      <div className="proposal-actions">
        <button className="accept-button" type="button" onClick={onAccept}>
          <Check weight="bold" aria-hidden="true" />
          Accept contribution
        </button>
        <button className="discard-button" type="button" onClick={onDiscard}>
          <X weight="bold" aria-hidden="true" />
          Discard
        </button>
      </div>
    </aside>
  )
}

function WelcomePanel({
  webMcpReady,
  copied,
  sampleDisabled,
  onClose,
  onCopy,
  onSample,
}: {
  webMcpReady: boolean
  copied: boolean
  sampleDisabled: boolean
  onClose: () => void
  onCopy: () => void
  onSample: () => void
}) {
  return (
    <div className="welcome-backdrop" role="presentation">
      <section className="welcome-panel" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <button className="close-button" type="button" onClick={onClose} aria-label="Close introduction">
          <X weight="bold" />
        </button>
        <span className="welcome-symbol" aria-hidden="true"><MoonStars weight="fill" /></span>
        <p className="welcome-kicker">A shared canvas with boundaries</p>
        <h1 id="welcome-title">Draw first. Let the story answer.</h1>
        <p className="welcome-copy">
          Make a rough mark. Your browser agent can interpret it and propose what happens next. Only you can make the idea part of the story.
        </p>
        <div className="consent-flow" aria-label="How collaboration works">
          <span><PencilSimpleLine weight="bold" aria-hidden="true" />You draw</span>
          <span><Robot weight="bold" aria-hidden="true" />Agent proposes</span>
          <span><Check weight="bold" aria-hidden="true" />You decide</span>
        </div>
        <div className="welcome-paths">
          <button className="prompt-button" type="button" onClick={onCopy}>
            <Copy weight="bold" aria-hidden="true" />
            {copied ? 'Prompt copied' : 'Copy agent prompt'}
          </button>
          <button className="sample-button" type="button" onClick={onSample} disabled={sampleDisabled}>
            <Sparkle weight="fill" aria-hidden="true" />
            Try a sample turn
          </button>
        </div>
        <p className="support-note">
          {webMcpReady
            ? 'Five story tools are available to your browser agent.'
            : 'Open this page in the ChatGPT browser or WebMCP-enabled Chrome to create with an agent.'}
        </p>
      </section>
    </div>
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
