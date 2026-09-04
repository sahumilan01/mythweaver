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
  PencilSimpleLine,
  Play,
  Robot,
  Sparkle,
  UsersThree,
  UserPlus,
  X,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createEmptyCanvasSnapshot, createNativeCanvasPort, NativeStoryCanvas, type AgentId } from '../canvas/nativeCanvas'
import { chooseNextSectionFill } from '../canvas/paintingModel'
import { RoomClient, RoomRequestError, resolveRoomCredentials, type RoomStateEnvelope } from '../room/roomClient'
import { createTurnSessionStore, SESSION_MODES, type SessionMode, type SessionParticipant } from '../session/turnSession'
import {
  createStoryStore,
  type StoryBeat,
  type StoryProposal,
  type StoryStore,
} from '../story/storyStore'
import { registerMythWeaverTools } from '../webmcp/registerTools'
import type { SharedRoomSnapshot } from '../../worker/roomApi'

const ONBOARDING_STORAGE_KEY = 'mythweaver-onboarding-seen-v1'
type WebMcpStatus = 'checking' | 'ready' | 'unavailable' | 'error'

const agentInviteFor = (pageUrl: string) => {
  const url = new URL(pageUrl)
  const roomId = url.searchParams.get('room')
  const token = url.searchParams.get('token')
  const api = `${url.origin}/api/agent/${roomId}`
  return `Join my MythWeaver painting immediately and stay for the whole live session: ${pageUrl}\n\nPreferred: open the page, call join_painting_session, and read the live canvas. Paint one predefined section whenever an agent owns the active turn. When it becomes the human turn, do not exit: call wait_for_painting_turn with {"timeoutMs":25000} repeatedly. As soon as the brush returns, read the fresh canvas and paint the next legal section. In AI + AI mode, alternate ChatGPT and Mica exactly as the live turn directs. Stop only when the painting is complete, I ask you to stop, or the room fails repeatedly.\n\nIf WebMCP is unavailable, use the shared-room API with Authorization: Bearer ${token}. First POST ${api}/presence with {"type":"join","participant":"agent","takeFirstTurn":true,"label":"ChatGPT joined"}. Then GET ${api}/state. Fill one predefined section by POSTing ${api}/actions with {"type":"paint","participant":"<active agent>","regionId":"<open id>","color":"<hex>","reason":"<brief visual reason>"}. After each move, read state. During a human turn, stay connected: POST presence every 20 seconds and poll ${api}/events/pending?after=<last-seen-id> every second; refresh state when an event appears. Continue immediately when an agent becomes active. Never overwrite human paint.`
}

function useStoryState(story: StoryStore) {
  return useSyncExternalStore(story.subscribe, story.getState, story.getState)
}

export function App() {
  const [story] = useState(() => createStoryStore())
  const [canvas] = useState(() => createNativeCanvasPort(createEmptyCanvasSnapshot()))
  const [turnSession] = useState(() => createTurnSessionStore('one-one'))
  const [guideOpen, setGuideOpen] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(true)
  const [roomReady, setRoomReady] = useState(false)
  const [roomStatus, setRoomStatus] = useState('Creating your private painting room…')
  const [roomCode, setRoomCode] = useState('starting')
  const [agentRequested, setAgentRequested] = useState(false)
  const [webMcpStatus, setWebMcpStatus] = useState<WebMcpStatus>('checking')
  const [shareUrl, setShareUrl] = useState('this MythWeaver page')
  const [copied, setCopied] = useState(false)
  const [resetArmed, setResetArmed] = useState(false)
  const [agentActivity, setAgentActivity] = useState('Waiting for your first mark.')
  const [playback, setPlayback] = useState<{ beats: StoryBeat[]; index: number } | null>(
    null,
  )
  const state = useStoryState(story)
  const canvasState = useSyncExternalStore(canvas.subscribe, canvas.getSnapshot, canvas.getServerSnapshot)
  const turnState = useSyncExternalStore(turnSession.subscribe, turnSession.getState, turnSession.getState)
  const agentConnected = Boolean(canvasState.agentPresence || canvasState.agentTwoPresence)
  const latestPresence = [canvasState.agentPresence, canvasState.agentTwoPresence]
    .filter((presence) => presence !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const visibleAgentActivity = latestPresence?.label ?? agentActivity
  const webMcpReady = webMcpStatus === 'ready'
  const hostedAgents = useRef(new Set<AgentId>())
  const roomClient = useRef<RoomClient | null>(null)
  const roomVersion = useRef(0)
  const applyingRoom = useRef(false)
  const roomWriteTimer = useRef<number | null>(null)
  const roomWriteChain = useRef<Promise<void>>(Promise.resolve())

  const roomSnapshot = useCallback((): SharedRoomSnapshot => ({
    canvas: canvas.getSnapshot(),
    turnSession: turnSession.getState(),
    story: story.getState(),
  }), [canvas, story, turnSession])

  const applyRoomEnvelope = useCallback((envelope: RoomStateEnvelope) => {
    roomVersion.current = envelope.version
    applyingRoom.current = true
    canvas.restore(envelope.snapshot.canvas)
    turnSession.restore(envelope.snapshot.turnSession)
    story.restore(envelope.snapshot.story)
    applyingRoom.current = false
  }, [canvas, story, turnSession])

  const pullRoom = useCallback(async () => {
    const client = roomClient.current
    if (!client) return
    const envelope = await client.read()
    if (envelope.version > roomVersion.current) applyRoomEnvelope(envelope)
  }, [applyRoomEnvelope])

  const flushRoom = useCallback(async (eventType = 'state') => {
    if (roomWriteTimer.current !== null) {
      window.clearTimeout(roomWriteTimer.current)
      roomWriteTimer.current = null
    }
    roomWriteChain.current = roomWriteChain.current.then(async () => {
      const client = roomClient.current
      if (!client || applyingRoom.current) return
      try {
        const envelope = await client.write(roomVersion.current, roomSnapshot(), eventType)
        roomVersion.current = envelope.version
      } catch (error) {
        if (error instanceof RoomRequestError && error.status === 409 && error.current) {
          applyRoomEnvelope(error.current)
          return
        }
        setRoomStatus('Connection interrupted — retrying…')
      }
    })
    return roomWriteChain.current
  }, [applyRoomEnvelope, roomSnapshot])

  useEffect(() => {
    let cancelled = false
    let pollTimer: number | undefined
    let unsubscribers: Array<() => void> = []
    const credentials = resolveRoomCredentials(window.location.href)
    window.history.replaceState({}, '', credentials.shareUrl)
    setShareUrl(credentials.shareUrl)
    setRoomCode(credentials.roomId.slice(-6).toUpperCase())
    setOnboardingOpen(window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'true')
    const client = new RoomClient(credentials)
    roomClient.current = client

    const start = async () => {
      try {
        const envelope = await client.open(roomSnapshot())
        if (cancelled) return
        applyRoomEnvelope(envelope)
        setRoomReady(true)
        setRoomStatus('Private live room ready')
        setGuideOpen(Object.keys(envelope.snapshot.canvas.fills).length === 0)

        const scheduleWrite = () => {
          if (applyingRoom.current || roomWriteTimer.current !== null) return
          roomWriteTimer.current = window.setTimeout(() => void flushRoom('canvas_changed'), 80)
        }
        unsubscribers = [canvas.subscribe(scheduleWrite), turnSession.subscribe(scheduleWrite), story.subscribe(scheduleWrite)]
        pollTimer = window.setInterval(() => void pullRoom().catch(() => setRoomStatus('Connection interrupted — retrying…')), 150)
      } catch {
        if (!cancelled) setRoomStatus('Could not create the live room. Reload to retry.')
      }
    }
    void start()
    return () => {
      cancelled = true
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      if (pollTimer) window.clearInterval(pollTimer)
      if (roomWriteTimer.current !== null) window.clearTimeout(roomWriteTimer.current)
    }
  }, [applyRoomEnvelope, canvas, flushRoom, pullRoom, roomSnapshot, story, turnSession])

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
    const refreshPresence = () => hostedAgents.current.forEach((agentId) => canvas.refreshAgentPresence(agentId))
    const disconnect = () => hostedAgents.current.forEach((agentId) => canvas.hideAgentPresence(agentId))
    const heartbeatTimer = window.setInterval(refreshPresence, 2000)
    window.addEventListener('pagehide', disconnect)
    return () => {
      window.clearInterval(heartbeatTimer)
      window.removeEventListener('pagehide', disconnect)
      disconnect()
    }
  }, [canvas])

  useEffect(() => {
    if (!roomReady) return
    let disposeTools: (() => void) | undefined
    let retryTimer: number | undefined
    let attempts = 0
    let cancelled = false

    const connectTools = () => {
      if (cancelled) return
      if (!document.modelContext) {
        attempts += 1
        if (attempts >= 12) setWebMcpStatus('unavailable')
        retryTimer = window.setTimeout(connectTools, 500)
        return
      }

      setWebMcpStatus('ready')
      setAgentActivity('WebMCP is ready. This browser’s ChatGPT agent can discover 10 live canvas tools.')
      disposeTools = registerMythWeaverTools({
        modelContext: document.modelContext,
        story,
        canvas,
        turnSession,
        beforeRead: pullRoom,
        afterMutation: flushRoom,
        onAgentActivity: setAgentActivity,
        onAgentJoined: (participant) => {
          hostedAgents.current.add(participant)
          setAgentRequested(false)
          setGuideOpen(false)
        },
        onRegistrationError: (toolName) => {
          setWebMcpStatus('error')
          setAgentActivity(`WebMCP could not register ${toolName}. Reload this page inside ChatGPT and try again.`)
        },
      })
    }

    connectTools()
    return () => {
      cancelled = true
      if (retryTimer) window.clearTimeout(retryTimer)
      disposeTools?.()
    }
  }, [canvas, flushRoom, pullRoom, roomReady, story, turnSession])

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

  const inviteAgent = async () => {
    setAgentRequested(true)
    setGuideOpen(true)
    setAgentActivity('Invitation ready. Send it in ChatGPT; the real agent appears only after its first WebMCP call.')
    try {
      await navigator.clipboard.writeText(agentInviteFor(shareUrl))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setAgentRequested(false)
      setCopied(false)
      setAgentActivity('Clipboard access was blocked. Copy the visible page address and instruction from the connection card.')
    }
  }

  const finishOnboarding = (invite: boolean) => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
    setOnboardingOpen(false)
    setGuideOpen(false)
    if (invite) void inviteAgent()
  }

  const stageSample = async () => {
    if (state.pending) return
    const move = chooseNextSectionFill(canvas.getSnapshot().fills, 'agent-two')
    if (!move) {
      setAgentActivity('Every predefined section is already filled.')
      return
    }
    setGuideOpen(false)
    canvas.showAgentPresence('Mica demo is choosing', 'agent-two')
    setAgentActivity(`Mica demo chose ${move.label} using a deterministic local fallback.`)
    await canvas.moveAgentToRegion(move.artifactId, `Demo: ${move.purpose}`, 'agent-two')
    canvas.paintRegion(move.artifactId, move.color, 'agent-two')
    setAgentActivity(`Mica demo colored ${move.label}. This preview did not use WebMCP.`)
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

  const startNewPainting = () => {
    if (!resetArmed) {
      setResetArmed(true)
      setAgentActivity('Press “Start over?” once more to clear this shared painting.')
      window.setTimeout(() => setResetArmed(false), 4000)
      return
    }
    setResetArmed(false)
    setPlayback(null)
    story.reset()
    canvas.resetPainting()
    turnSession.setMode(turnState.mode)
    setGuideOpen(false)
    setAgentActivity('Fresh outline ready. You have the first color.')
    void flushRoom('new_painting')
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentInviteFor(shareUrl))
      setAgentRequested(true)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setAgentRequested(false)
      setCopied(false)
      setAgentActivity('Clipboard access was blocked. Copy the visible page address and instruction from this card.')
    }
  }

  const agentHasPaint = Object.values(canvasState.fills).some((fill) => fill?.origin === 'agent')
    || Object.values(canvasState.fills).some((fill) => fill?.origin === 'agent-two')
    || canvasState.shapes.some((shape) => shape.origin === 'agent' || shape.origin === 'agent-two')
  const hasPaint = Object.keys(canvasState.fills).length > 0 || canvasState.shapes.length > 0
  const phase = state.pending
    ? 'review'
    : agentHasPaint || canvasState.agentPresence || canvasState.agentTwoPresence || state.contributions.length > 0
      ? 'build'
      : agentRequested || hasPaint || state.revision > 0
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
            <span>{roomReady ? `Room ${roomCode} · live` : roomStatus}</span>
          </div>
        </div>

        <div className="header-actions">
          {!agentConnected && (
            <button className="invite-agent-button" type="button" disabled={!roomReady} onClick={() => void inviteAgent()} aria-label={agentRequested ? 'Agent invite copied' : 'Connect your agent'}>
              <UserPlus weight="bold" aria-hidden="true" />
              <span>{agentRequested ? 'Agent link copied' : 'Connect your agent'}</span>
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
          <button className="session-chip" type="button" disabled={!roomReady} onClick={() => { setRulesOpen(true); setGuideOpen(false) }} aria-label="Change painting rules">
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
          {hasPaint && <button
            className={`new-painting-button${resetArmed ? ' is-armed' : ''}`}
            type="button"
            disabled={!roomReady}
            onClick={startNewPainting}
            aria-label={resetArmed ? 'Confirm starting a new painting' : 'Start a new painting'}
          >
            <ArrowsClockwise weight="bold" aria-hidden="true" />
            <span>{resetArmed ? 'Start over?' : 'New painting'}</span>
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
        <NativeStoryCanvas canvas={canvas} humanCanPaint={roomReady && turnSession.canMove('human')} />

        <div className={`turn-ribbon turn-ribbon-${turnState.active}`} aria-live="polite">
          {turnState.active === 'human' ? <PencilSimpleLine weight="bold" /> : turnState.active === 'agent-two' ? <Sparkle weight="fill" /> : <Robot weight="fill" />}
          <span><b>{turnState.finished ? 'Painting complete' : participantTurnLabel(turnState.active)}</b>{turnState.finished ? ' Pick a rule to start another round.' : `${turnState.movesRemaining} ${turnState.movesRemaining === 1 ? 'move' : 'moves'} before the brush passes.`}</span>
        </div>

        {agentConnected && (
          <aside className="mcp-live-receipt" aria-live="polite" aria-label="Live WebMCP activity">
            <span><i /> WebMCP live</span>
            <p>{visibleAgentActivity}</p>
          </aside>
        )}

        {!guideOpen && phase === 'ask' && !canvasState.agentPresence && (
          <aside className="pair-hint" aria-live="polite">
            <Robot weight="fill" aria-hidden="true" />
            <span><b>Your section is filled.</b> Copy this live canvas for your agent.</span>
            <button type="button" onClick={() => void inviteAgent()}>{agentRequested ? 'Paste in ChatGPT' : 'Copy for agent'}</button>
          </aside>
        )}

        {state.pending && (
          <ProposalCard proposal={state.pending} onAccept={accept} onDiscard={discard} />
        )}

        {!state.pending && !playback && guideOpen && (
          <TurnGuide
            phase={phase}
            webMcpReady={webMcpReady}
            webMcpStatus={webMcpStatus}
            shareUrl={shareUrl}
            copied={copied}
            agentRequested={agentRequested}
            onCopy={copyPrompt}
            onSample={stageSample}
            onStarter={addStarter}
            onClose={() => setGuideOpen(false)}
            ready={roomReady}
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
              turnSession.setMode(mode)
              setRulesOpen(false)
              setAgentActivity(`${SESSION_MODES[mode].label} is set. Ask ChatGPT to continue through WebMCP.`)
              if ((mode === 'agent-show' || mode === 'agent-duo') && !agentConnected) void inviteAgent()
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
        <h1 id="welcome-title">Bring your agent into the canvas</h1>
        <p className="welcome-copy">Every painting now has its own private room. Copy its secure invitation so your agent can join, read the same sections, and paint beside you.</p>
        <div className="consent-flow" aria-label="How pair painting works">
          <span><UserPlus weight="bold" aria-hidden="true" /> Copy live canvas</span>
          <span><Robot weight="fill" aria-hidden="true" /> Paste to your agent</span>
          <span><PaintBucket weight="fill" aria-hidden="true" /> Paint together</span>
        </div>
        <div className="welcome-paths">
          <button className="prompt-button" type="button" onClick={onInvite}>
            <UserPlus weight="bold" aria-hidden="true" /> Copy for your agent
          </button>
          <button className="sample-button" type="button" onClick={onDismiss}>I’ll look around first</button>
        </div>
        <p className="support-note">No agent account setup. Its avatar appears only after the room receives a real WebMCP or authenticated agent API join.</p>
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
        Want a change? Tell ChatGPT what to revise. The idea stays pending until you decide.
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
  webMcpStatus,
  shareUrl,
  copied,
  agentRequested,
  onClose,
  onCopy,
  onSample,
  onStarter,
  ready,
}: {
  phase: GuidePhase
  webMcpReady: boolean
  webMcpStatus: WebMcpStatus
  shareUrl: string
  copied: boolean
  agentRequested: boolean
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
      <h1>{isStart ? 'Tap a shape to color it' : isAsk ? 'Bring your agent into this canvas' : 'You’re painting together'}</h1>
      <p>
        {isStart
          ? 'Choose a color below, then tap one outlined section to fill it.'
          : isAsk
            ? webMcpReady
              ? agentRequested
                ? 'The private room and its instructions are copied. Paste them into ChatGPT; its avatar appears after a real join request.'
                : 'Copy this private room into ChatGPT. WebMCP lets your agent read and color the same picture with you.'
              : 'Direct WebMCP is not available in this browser. The secure invitation includes an agent API fallback, so ChatGPT can still join.'
            : 'Your fills and ChatGPT’s fills appear on the same page as they happen. You both play by the same rule: one color, one section.'}
      </p>
      {isAsk && (
        <div className={`mcp-readiness is-${webMcpStatus}`}>
          <i />
          <span>{webMcpStatus === 'ready'
            ? '10 WebMCP tools ready for your agent'
            : webMcpStatus === 'checking'
              ? 'Checking this browser for WebMCP…'
              : webMcpStatus === 'error'
                ? 'Tool registration failed — reload inside ChatGPT'
                : 'Secure room API ready · WebMCP available when supported'}</span>
        </div>
      )}
      {isAsk && <blockquote><strong>Private room {new URL(shareUrl).searchParams.get('room')?.slice(-6).toUpperCase()}</strong><br />The copied invitation includes the room link, join endpoint, live state endpoint, and turn-safe paint action.</blockquote>}
      <div className="turn-guide-actions">
        {isStart && (
          <button className="prompt-button" type="button" onClick={onStarter} disabled={!ready}>
            <MoonStars weight="fill" aria-hidden="true" />
            Color the moon
          </button>
        )}
        {isAsk && (
          <button className="prompt-button" type="button" onClick={onCopy} disabled={!ready}>
            <Copy weight="bold" aria-hidden="true" />
            {copied ? 'Copied — paste to your agent' : 'Copy page + instructions'}
          </button>
        )}
        {isAsk && (
          <button className="sample-button" type="button" onClick={onSample}>
            <Sparkle weight="fill" aria-hidden="true" />
            Watch Mica demo one move
          </button>
        )}
        {isBuild && (
          <>
            <button className="prompt-button" type="button" onClick={onSample}>
              <Robot weight="fill" aria-hidden="true" />
              Watch Mica demo one move
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
      <p>Most AI art is prompt-and-wait: the person asks, then receives a finished result. WebMCP turns that into supervised co-creation, where the agent works inside the same painting and every decision stays visible.</p>
      <ol className="mcp-flow">
        <li><strong>The page names every paintable region.</strong><span>ChatGPT sees the moon, fox, stars, hill, and river.</span></li>
        <li><strong>Each tool call becomes a visible move.</strong><span>ChatGPT chooses a color and fills one predefined section, just like you.</span></li>
        <li><strong>You share one live canvas and turn rule.</strong><span>Every fill appears immediately, then the brush passes to the next participant.</span></li>
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
