import { describe, expect, it } from 'vitest'
import { createTurnSessionStore } from './turnSession'

describe('turn session', () => {
  it('alternates one human move with one agent move', () => {
    const session = createTurnSessionStore('one-one')
    expect(session.canMove('human')).toBe(true)
    session.noteMove('human')
    expect(session.getState().active).toBe('agent')
    session.noteMove('agent')
    expect(session.getState().active).toBe('human')
  })

  it('starts with an immediate agent turn when the agent is invited', () => {
    const session = createTurnSessionStore('one-one')

    session.startWith('agent')

    expect(session.getState()).toMatchObject({ active: 'agent', movesRemaining: 1, finished: false })
    session.noteMove('agent')
    expect(session.getState().active).toBe('human')
  })

  it('counts two moves before passing the brush', () => {
    const session = createTurnSessionStore('two-two')
    session.noteMove('human')
    expect(session.getState()).toMatchObject({ active: 'human', movesRemaining: 1 })
    session.noteMove('human')
    expect(session.getState()).toMatchObject({ active: 'agent', movesRemaining: 2 })
  })

  it('alternates two agents without giving the human a paint turn', () => {
    const session = createTurnSessionStore('agent-duo')
    session.noteMove('agent')
    expect(session.getState().active).toBe('agent-two')
    session.noteMove('agent-two')
    expect(session.getState().active).toBe('agent')
  })

  it('restores the live turn received from another canvas tab', () => {
    const session = createTurnSessionStore('one-one')

    session.restore({
      mode: 'two-two',
      active: 'agent',
      movesRemaining: 2,
      round: 4,
      finished: false,
    })

    expect(session.getState()).toEqual({
      mode: 'two-two',
      active: 'agent',
      movesRemaining: 2,
      round: 4,
      finished: false,
    })
  })
})
