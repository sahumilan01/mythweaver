export type StoryRole = 'character' | 'place' | 'object' | 'event'
export type StoryOrigin = 'human' | 'agent' | 'mixed'

export interface StoryElement {
  id: string
  shapeId: string
  name: string
  role: StoryRole
}

export interface StoryBeat {
  id: string
  narration: string
  elementIds: string[]
}

export interface StoryProposal {
  id: string
  basedOnRevision: number
  title: string
  narration: string
  elements: StoryElement[]
  beats: StoryBeat[]
}

export interface StoryContribution extends Omit<StoryProposal, 'basedOnRevision'> {
  origin: StoryOrigin
}

export interface StoryState {
  revision: number
  pending: StoryProposal | null
  contributions: StoryContribution[]
}

export interface StoryStore {
  getState(): StoryState
  subscribe(listener: () => void): () => void
  noteHumanChange(): void
  propose(proposal: StoryProposal): void
  revise(proposal: StoryProposal): void
  acceptPending(): StoryContribution
  discardPending(): StoryProposal | null
  reset(): void
  restore(next: StoryState): void
}

const initialState = (): StoryState => ({
  revision: 0,
  pending: null,
  contributions: [],
})

export function createStoryStore(savedState?: StoryState): StoryStore {
  let state = savedState
    ? {
        revision: savedState.revision,
        pending: savedState.pending ? structuredClone(savedState.pending) : null,
        contributions: structuredClone(savedState.contributions),
      }
    : initialState()
  const listeners = new Set<() => void>()

  const publish = (next: StoryState) => {
    state = next
    listeners.forEach((listener) => listener())
  }

  const assertCurrentRevision = (revision: number) => {
    if (revision !== state.revision) {
      throw new Error(
        `Story world is at revision ${state.revision}. Read it again before proposing.`,
      )
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    noteHumanChange() {
      publish({ ...state, revision: state.revision + 1 })
    },
    propose(proposal) {
      assertCurrentRevision(proposal.basedOnRevision)
      if (state.pending) {
        throw new Error(
          `Proposal ${state.pending.id} is awaiting human review. Revise it instead.`,
        )
      }
      publish({
        ...state,
        revision: state.revision + 1,
        pending: proposal,
      })
    },
    revise(proposal) {
      assertCurrentRevision(proposal.basedOnRevision)
      if (!state.pending) {
        throw new Error('There is no proposal to revise.')
      }
      if (proposal.id !== state.pending.id) {
        throw new Error(`Revise proposal ${state.pending.id}, not ${proposal.id}.`)
      }
      publish({
        ...state,
        revision: state.revision + 1,
        pending: proposal,
      })
    },
    acceptPending() {
      if (!state.pending) throw new Error('There is no proposal to accept.')
      const { basedOnRevision: _basedOnRevision, ...proposal } = state.pending
      const contribution: StoryContribution = {
        ...proposal,
        origin: 'agent',
      }
      publish({
        revision: state.revision + 1,
        pending: null,
        contributions: [...state.contributions, contribution],
      })
      return contribution
    },
    discardPending() {
      const discarded = state.pending
      if (discarded) {
        publish({
          ...state,
          revision: state.revision + 1,
          pending: null,
        })
      }
      return discarded
    },
    reset() {
      publish(initialState())
    },
    restore(next) {
      publish({
        revision: next.revision,
        pending: next.pending ? structuredClone(next.pending) : null,
        contributions: structuredClone(next.contributions),
      })
    },
  }
}
