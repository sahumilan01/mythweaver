export type SessionMode = 'one-one' | 'two-two' | 'agent-show' | 'agent-duo'
export type SessionParticipant = 'human' | 'agent' | 'agent-two'

export interface TurnSessionState {
  mode: SessionMode
  active: SessionParticipant
  movesRemaining: number
  round: number
  finished: boolean
}

export interface TurnSessionStore {
  getState(): TurnSessionState
  subscribe(listener: () => void): () => void
  setMode(mode: SessionMode): void
  startWith(participant: SessionParticipant): void
  canMove(participant: SessionParticipant): boolean
  noteMove(participant: SessionParticipant): boolean
  finish(): void
}

export const SESSION_MODES: Record<SessionMode, {
  label: string
  shortLabel: string
  description: string
}> = {
  'one-one': {
    label: 'One and one',
    shortLabel: '1 + 1',
    description: 'You paint once, then ChatGPT paints once.',
  },
  'two-two': {
    label: 'Two and two',
    shortLabel: '2 + 2',
    description: 'You each make two moves before passing the brush.',
  },
  'agent-show': {
    label: 'Agent showcase',
    shortLabel: 'Watch',
    description: 'ChatGPT paints the open regions while you watch.',
  },
  'agent-duo': {
    label: 'Two-agent paint-off',
    shortLabel: 'AI + AI',
    description: 'ChatGPT and Mica alternate while you direct the session.',
  },
}

const initialFor = (mode: SessionMode): TurnSessionState => ({
  mode,
  active: mode === 'agent-show' || mode === 'agent-duo' ? 'agent' : 'human',
  movesRemaining: mode === 'two-two' ? 2 : 1,
  round: 1,
  finished: false,
})

export function createTurnSessionStore(initialMode: SessionMode = 'one-one'): TurnSessionStore {
  let state = initialFor(initialMode)
  const listeners = new Set<() => void>()
  const publish = (next: TurnSessionState) => {
    state = next
    listeners.forEach((listener) => listener())
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setMode(mode) {
      publish(initialFor(mode))
    },
    startWith(participant) {
      publish({
        ...state,
        active: participant,
        movesRemaining: state.mode === 'two-two' ? 2 : 1,
        round: 1,
        finished: false,
      })
    },
    canMove: (participant) => !state.finished && state.active === participant,
    noteMove(participant) {
      if (state.finished || state.active !== participant) return false
      if (state.movesRemaining > 1) {
        publish({ ...state, movesRemaining: state.movesRemaining - 1 })
        return true
      }

      const next = state.mode === 'agent-show'
        ? 'agent'
        : state.mode === 'agent-duo'
          ? participant === 'agent' ? 'agent-two' : 'agent'
          : participant === 'human' ? 'agent' : 'human'
      publish({
        ...state,
        active: next,
        movesRemaining: state.mode === 'two-two' ? 2 : 1,
        round: state.round + 1,
      })
      return true
    },
    finish() {
      publish({ ...state, finished: true })
    },
  }
}
