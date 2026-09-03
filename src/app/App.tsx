'use client'

import {
  ArrowsClockwise,
  CaretDown,
  Check,
  Copy,
  Eye,
  Info,
  MoonStars,
  PaintBucket,
  Palette,
  PencilSimpleLine,
  Play,
  Robot,
  Sparkle,
  UsersThree,
  UserPlus,
  X,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createNativeCanvasPort, NativeStoryCanvas } from '../canvas/nativeCanvas'
import { chooseNextSectionFill } from '../canvas/paintingModel'
import { createTurnSessionStore, SESSION_MODES, type SessionMode, type SessionParticipant } from '../session/turnSession'
import {
  createStoryStore,
  type StoryBeat,
  type StoryProposal,
  type StoryStore,
  type StoryState,
} from '../story/storyStore'
import { registerMythWeaverTools } from '../webmcp/registerTools'

const STORY_STORAGE_KEY = 'mythweaver-story-state-v1'
const SESSION_STORAGE_KEY = 'mythweaver-session-mode-v1'
const ONBOARDING_STORAGE_KEY = 'mythweaver-onboarding-seen-v1'

function loadSessionMode(): SessionMode {
  if (typeof window === 'undefined') return 'one-one'
  const saved = window.localStorage.getItem(SESSION_STORAGE_KEY)
  return saved && saved in SESSION_MODES ? saved as SessionMode : 'one-one'
}

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
  const [turnSession] = useState(() => createTurnSessionStore())
  const [guideOpen, setGuideOpen] = useState(() => {
    const saved = canvas.getSnapshot()
    return Object.keys(saved.fills).length === 0 && saved.shapes.length === 0
  })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(() => typeof window === 'undefined' || window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'true')
  const [agentInvited, setAgentInvited] = useState(false)
  const [copied, setCopied] = useState(false)
  const [agentActivity, setAgentActivity] = useState('Waiting for your first mark.')
  const [playback, setPlayback] = useState<{ beats: StoryBeat[]; index: number } | null>(
    null,
  )
  const state = useStoryState(story)
  const canvasState = useSyncExternalStore(canvas.subscribe, canvas.getSnapshot, canvas.getServerSnapshot)
  const turnState = useSyncExternalStore(turnSession.subscribe, turnSession.getState, turnSession.getState)
  const agentBusy = useRef(false)
  const webMcpReady = typeof document !== 'undefined' && Boolean(document.modelContext)

  useEffect(
    () => story.subscribe(() => {
      window.localStorage.setItem(STORY_STORAGE_KEY, JSON.stringify(story.getState()))
    }),
    [story],
  )

  useEffect(
    () => {
      const savedMode = loadSessionMode()
      if (savedMode !== turnSession.getState().mode) turnSession.setMode(savedMode)
    },
    [turnSession],
  )

  useEffect(
    () => turnSession.subscribe(() => {
      window.localStorage.setItem(SESSION_STORAGE_KEY, turnSession.getState().mode)
    }),
    [turnSession],
  )

  const startPerformance = useCallback((beats: StoryBeat[]) => {
    if (beats.length > 0) setPlayback({ beats, index: 0 })
  }, [])

  useEffect(() => canvas.setPreviewHandler(startPerformance), [canvas, startPerformance])

  useEffect(() => {
    return canvas.subscribeToHumanChanges(() => {
      story.noteHumanChange()
      turnSession.noteMove('human')
    })
  }, [canvas, story, turnSession])

  useEffect(() => {
    if (!document.modelContext) return
    return registerMythWeaverTools({
      modelContext: document.modelContext,
      story,
      canvas,
      turnSession,
      onAgentActivity: setAgentActivity,
    })
  }, [canvas, story, turnSession])

  useEffect(() => {
    const participant = turnState.active
    if (participant === 'human' || turnState.finished || agentBusy.current) return
    const autoplay = agentInvited
    if (!autoplay) return
    const move = chooseNextSectionFill(canvas.getSnapshot().fills, participant)
    const isAgentOnly = turnState.mode === 'agent-show' || turnState.mode === 'agent-duo'
    if (!move) {
      if (isAgentOnly) turnSession.finish()
      else turnSession.noteMove(participant)
      setAgentActivity('Every predefined section is filled. Choose another rule to start a new round.')
      return
    }

    agentBusy.current = true
    const agentName = participant === 'agent-two' ? 'Mica' : 'ChatGPT'
    canvas.showAgentPresence(`${agentName} is ready`, participant)
    setAgentActivity(`${agentName} understands the scene and is moving to ${move.label}.`)
    void (async () => {
      await canvas.moveAgentToRegion(move.artifactId, `Coloring ${move.label}`, participant)
      const current = turnSession.getState()
      if (current.mode !== turnState.mode || current.round !== turnState.round || current.active !== participant) {
        agentBusy.current = false
        canvas.showAgentPresence(`${agentName} paused`, participant)
        return
      }
      canvas.paintRegion(move.artifactId, move.color, participant)
      turnSession.noteMove(participant)
      setAgentActivity(`${agentName} colored ${move.label}.`)
      agentBusy.current = false
    })()
  }, [agentInvited, canvas, canvasState.fills, turnSession, turnState])

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

  const inviteAgent = () => {
    setAgentInvited(true)
    canvas.showAgentPresence('ChatGPT joined - waiting for you')
    setAgentActivity('ChatGPT joined the canvas. Fill one section, then ChatGPT will take the next turn.')
  }

  const finishOnboarding = (invite: boolean) => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
    setOnboardingOpen(false)
    setGuideOpen(false)
    if (invite) inviteAgent()
  }

  const stageSample = () => {
    if (state.pending) return
    setGuideOpen(false)
    inviteAgent()
    turnSession.setMode('agent-show')
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
    || Object.values(canvasState.fills).some((fill) => fill?.origin === 'agent-two')
    || canvasState.shapes.some((shape) => shape.origin === 'agent' || shape.origin === 'agent-two')
  const hasPaint = Object.keys(canvasState.fills).length > 0 || canvasState.shapes.length > 0
  const phase = state.pending
    ? 'review'
    : agentHasPaint || canvasState.agentPresence || canvasState.agentTwoPresence || state.contributions.length > 0
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
          {!canvasState.agentPresence && (
            <button className="invite-agent-button" type="button" onClick={inviteAgent}>
              <UserPlus weight="bold" aria-hidden="true" />
              <span>Invite ChatGPT</span>
            </button>
          )}
          <div className="collaborator-presence" aria-label={canvasState.agentTwoPresence ? 'You, ChatGPT, and Mica are in the canvas' : canvasState.agentPresence ? 'You and ChatGPT are in the canvas' : 'You are in the canvas'}>
            <span className="collaborator-avatar human-avatar" title="You">You</span>
            {canvasState.agentPresence && (
              <span className="collaborator-avatar agent-avatar" title="ChatGPT is in the canvas">
                <Robot weight="fill" aria-hidden="true" />
                <i>ChatGPT joined</i>
              </span>
            )}
            {canvasState.agentTwoPresence && (
              <span className="collaborator-avatar agent-avatar agent-two-avatar" title="Mica is in the canvas">
                <Sparkle weight="fill" aria-hidden="true" />
                <i>Mica joined</i>
              </span>
            )}
          </div>
          <button className="session-chip" type="button" onClick={() => { setRulesOpen(true); setGuideOpen(false) }} aria-label="Change painting rules">
            <span>{SESSION_MODES[turnState.mode].shortLabel}</span>
            <b>{turnState.finished ? 'Page complete' : participantTurnLabel(turnState.active)}</b>
            {!turnState.finished && turnState.movesRemaining > 1 && <i>{turnState.movesRemaining} moves</i>}
            <CaretDown weight="bold" aria-hidden="true" />
          </button>
          {canvasState.agentPresence && <button
            className="text-button"
            type="button"
            onClick={() => setGuideOpen(true)}
          >
            Guide
          </button>}
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
        <NativeStoryCanvas canvas={canvas} humanCanPaint={turnSession.canMove('human')} />

        <div className={`turn-ribbon turn-ribbon-${turnState.active}`} aria-live="polite">
          {turnState.active === 'human' ? <PencilSimpleLine weight="bold" /> : turnState.active === 'agent-two' ? <Sparkle weight="fill" /> : <Robot weight="fill" />}
          <span><b>{turnState.finished ? 'Painting complete' : participantTurnLabel(turnState.active)}</b>{turnState.finished ? ' Pick a rule to start another round.' : `${turnState.movesRemaining} ${turnState.movesRemaining === 1 ? 'move' : 'moves'} before the brush passes.`}</span>
        </div>

        {!guideOpen && phase === 'ask' && !canvasState.agentPresence && (
          <aside className="pair-hint" aria-live="polite">
            <Robot weight="fill" aria-hidden="true" />
            <span><b>Your section is filled.</b> Invite ChatGPT to take the next turn.</span>
            <button type="button" onClick={inviteAgent}>Invite ChatGPT</button>
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

        {rulesOpen && (
          <SessionRulesPanel
            current={turnState.mode}
            onChoose={(mode) => {
              if (mode === 'agent-show' || mode === 'agent-duo') inviteAgent()
              turnSession.setMode(mode)
              setRulesOpen(false)
              setAgentActivity(`${SESSION_MODES[mode].label} started. ${participantTurnLabel(turnSession.getState().active)}.`)
            }}
            onClose={() => setRulesOpen(false)}
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

        {onboardingOpen && (
          <FirstRunOnboarding
            onInvite={() => finishOnboarding(true)}
            onDismiss={() => finishOnboarding(false)}
          />
        )}
      </section>
    </main>
  )
}

function FirstRunOnboarding({ onInvite, onDismiss }: { onInvite: () => void; onDismiss: () => void }) {
  return (
    <div className="welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <section className="welcome-panel">
        <span className="welcome-symbol" aria-hidden="true"><MoonStars weight="fill" /></span>
        <p className="welcome-kicker">Your first painting</p>
        <h1 id="welcome-title">Color this page with ChatGPT</h1>
        <p className="welcome-copy">You both make the same simple move. Pick a color, fill one outlined section, then pass the turn.</p>
        <div className="consent-flow" aria-label="How pair painting works">
          <span><Palette weight="fill" aria-hidden="true" /> Pick a color</span>
          <span><PaintBucket weight="fill" aria-hidden="true" /> Fill one section</span>
          <span><Robot weight="fill" aria-hidden="true" /> Pass the turn</span>
        </div>
        <div className="welcome-paths">
          <button className="prompt-button" type="button" onClick={onInvite}>
            <UserPlus weight="bold" aria-hidden="true" /> Invite ChatGPT and start
          </button>
          <button className="sample-button" type="button" onClick={onDismiss}>I’ll look around first</button>
        </div>
        <p className="support-note">ChatGPT appears beside you when it joins. Its cursor shows exactly which section it is coloring.</p>
      </section>
    </div>
  )
}

const participantName = (participant: SessionParticipant) => participant === 'human' ? 'You' : participant === 'agent-two' ? 'Mica' : 'ChatGPT'
const participantTurnLabel = (participant: SessionParticipant) => participant === 'human' ? 'Your turn' : `${participantName(participant)}'s turn`

function SessionRulesPanel({
  current,
  onChoose,
  onClose,
}: {
  current: SessionMode
  onChoose: (mode: SessionMode) => void
  onClose: () => void
}) {
  const icons = {
    'one-one': <ArrowsClockwise weight="bold" />,
    'two-two': <UsersThree weight="bold" />,
    'agent-show': <Eye weight="bold" />,
    'agent-duo': <Sparkle weight="fill" />,
  }
  return (
    <aside className="session-rules" aria-label="Painting session rules">
      <button className="close-button" type="button" onClick={onClose} aria-label="Close painting rules"><X weight="bold" /></button>
      <span className="session-rules-kicker">You set the rules</span>
      <h2>How should we pass the brush?</h2>
      <p>Pick a rhythm. Everyone on the canvas follows it immediately.</p>
      <div className="session-mode-list">
        {(Object.keys(SESSION_MODES) as SessionMode[]).map((mode) => (
          <button key={mode} type="button" className={mode === current ? 'is-current' : ''} onClick={() => onChoose(mode)}>
            <i>{icons[mode]}</i>
            <span><b>{SESSION_MODES[mode].label}</b><small>{SESSION_MODES[mode].description}</small></span>
            <strong>{SESSION_MODES[mode].shortLabel}</strong>
          </button>
        ))}
      </div>
      <p className="session-owner-note">Only you choose the rule. Agents can read it and must wait for their turn.</p>
    </aside>
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
          ? 'Choose a color below, then tap one outlined section to fill it.'
          : isAsk
            ? webMcpReady
              ? 'Send the line below in ChatGPT. WebMCP lets it color this same picture while you keep painting.'
              : 'Open this site inside ChatGPT to pair paint live. You can preview the rhythm here first.'
            : 'Your fills and ChatGPT’s fills appear on the same page as they happen. You both play by the same rule: one color, one section.'}
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
            <button className="prompt-button" type="button" onClick={onSample}>
              <Robot weight="fill" aria-hidden="true" />
              Watch ChatGPT finish
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
        <li><strong>Each tool call becomes a visible move.</strong><span>ChatGPT chooses a color and fills one predefined section, just like you.</span></li>
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
