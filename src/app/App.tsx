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
  'Look at my drawing in MythWeaver. Tell me what you think it means, then add one surprising idea as a proposal. Do not accept it for me.'

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
  const [guideOpen, setGuideOpen] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [agentActivity, setAgentActivity] = useState('Waiting for your first mark.')
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
    if (!canvas || state.pending) return
    const draft = sampleDraft(state.revision)
    const elements = canvas.renderProposal(draft)
    story.propose({ ...draft, elements })
    setAgentActivity('The built-in demo staged an example proposal. It is not part of your story yet.')
  }

  const addStarter = () => {
    if (!canvas) return
    canvas.addHumanStarter()
    story.noteHumanChange()
    setAgentActivity('Your moon is on the canvas. ChatGPT can read it when you ask.')
  }

  const accept = () => {
    if (!canvas || !state.pending) return
    const title = state.pending.title
    canvas.commitProposal(state.pending)
    story.acceptPending()
    setAgentActivity(`You kept “${title}”. It is now part of the story.`)
  }

  const discard = () => {
    if (!canvas || !state.pending) return
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

  const phase = state.pending
    ? 'review'
    : state.contributions.length > 0
      ? 'build'
      : state.revision > 0
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
            <span>Draw a world together</span>
          </div>
        </div>

        <div className="header-actions">
          <span className={`turn-status turn-${phase}`}>
            {phase === 'review' ? <Robot weight="bold" aria-hidden="true" /> : <PencilSimpleLine weight="bold" aria-hidden="true" />}
            {phase === 'review' ? 'Your decision' : phase === 'ask' ? 'Ask ChatGPT' : 'Your turn'}
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
          <button
            className="primary-button"
            type="button"
            aria-label="Perform story"
            onClick={perform}
            disabled={committedBeats.length === 0 || Boolean(playback)}
          >
            <Play weight="fill" aria-hidden="true" />
            <span>Perform story</span>
          </button>
        </div>
      </header>

      <section className="canvas-stage" aria-label="MythWeaver story canvas">
        <Tldraw
          onMount={setEditor}
          persistenceKey="mythweaver-story-world"
          licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
        />

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
            onPerform={perform}
            onClose={() => setGuideOpen(false)}
            ready={Boolean(canvas)}
          />
        )}

        {advancedOpen && (
          <AdvancedPanel
            webMcpReady={webMcpReady}
            revision={state.revision}
            contributions={state.contributions.length}
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
  onPerform,
  ready,
}: {
  phase: GuidePhase
  webMcpReady: boolean
  copied: boolean
  onClose: () => void
  onCopy: () => void
  onSample: () => void
  onStarter: () => void
  onPerform: () => void
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
        <span>{isAsk ? 'ChatGPT’s turn' : 'Your turn'}</span>
        <i>{isStart ? '1' : isAsk ? '2' : '3'}</i>
      </div>
      <h1>{isStart ? 'Put one thing on the canvas' : isAsk ? 'Ask ChatGPT to look' : 'Your story has started'}</h1>
      <p>
        {isStart
          ? 'Draw anything, even a circle or a word. Need a nudge? Start with a moon.'
          : isAsk
            ? webMcpReady
              ? 'In ChatGPT, send the line below. It will read the canvas through WebMCP, then place a suggestion here.'
              : 'Open this site inside ChatGPT to let it read the canvas. You can also preview the turn with the built-in example.'
            : 'Keep drawing and ask for another idea, or play the story you have made so far.'}
      </p>
      {isAsk && <blockquote>“Look at my drawing in MythWeaver. Tell me what you think it means, then add one surprising idea as a proposal. Do not accept it for me.”</blockquote>}
      <div className="turn-guide-actions">
        {isStart && (
          <button className="prompt-button" type="button" onClick={onStarter} disabled={!ready}>
            <MoonStars weight="fill" aria-hidden="true" />
            Add a moon to start
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
            Show an example
          </button>
        )}
        {isBuild && (
          <>
            <button className="prompt-button" type="button" onClick={onPerform}>
              <Play weight="fill" aria-hidden="true" />
              Play my story
            </button>
            <button className="sample-button" type="button" onClick={onCopy}>
              <Copy weight="bold" aria-hidden="true" />
              {copied ? 'Prompt copied' : 'Ask for another idea'}
            </button>
          </>
        )}
      </div>
      <p className="turn-guide-foot">
        {isStart ? 'You make the first mark.' : isAsk ? 'ChatGPT can suggest. It cannot accept for you.' : 'You can keep building one turn at a time.'}
      </p>
    </aside>
  )
}

function AdvancedPanel({
  webMcpReady,
  revision,
  contributions,
  agentActivity,
  onClose,
}: {
  webMcpReady: boolean
  revision: number
  contributions: number
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
      <p>WebMCP is the bridge. This page offers a small set of tools that ChatGPT can call while you stay in control.</p>
      <ol className="mcp-flow">
        <li><strong>The page offers five tools.</strong><span>Read, propose, revise, focus, and preview.</span></li>
        <li><strong>ChatGPT reads structured canvas data.</strong><span>It does not guess from screen coordinates.</span></li>
        <li><strong>Agent changes arrive as suggestions.</strong><span>Dashed coral shapes stay separate until you decide.</span></li>
        <li><strong>Accept and remove belong to you.</strong><span>Those actions are not exposed as WebMCP tools.</span></li>
      </ol>
      <div className="advanced-stats">
        <span><b>{webMcpReady ? 'Connected' : 'Canvas only'}</b>WebMCP</span>
        <span><b>{revision}</b>Canvas revision</span>
        <span><b>{contributions}</b>Ideas kept</span>
      </div>
      <div className="activity-log">
        <span>Latest activity</span>
        <p>{agentActivity}</p>
      </div>
      <div className="provenance-key" aria-label="Contribution appearance">
        <span><i className="human-swatch" /> Your canvas marks</span>
        <span><i className="agent-swatch" /> ChatGPT suggestion</span>
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
