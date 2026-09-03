import { describe, expect, it } from 'vitest'
import { createStoryStore } from './storyStore'

const moonProposal = {
  id: 'proposal:moon',
  basedOnRevision: 0,
  title: 'The moon finds a guardian',
  narration: 'A small fox hears the moon humming from inside the jar.',
  elements: [
    {
      id: 'fox',
      shapeId: 'shape:fox',
      name: 'Moon fox',
      role: 'character' as const,
    },
  ],
  beats: [
    {
      id: 'beat:fox',
      narration: 'The fox follows the silver sound.',
      elementIds: ['fox'],
    },
  ],
}

describe('StoryStore', () => {
  it('keeps an agent contribution pending until the human accepts it', () => {
    const store = createStoryStore()

    store.propose(moonProposal)

    expect(store.getState().pending?.title).toBe('The moon finds a guardian')
    expect(store.getState().contributions).toHaveLength(0)

    store.acceptPending()

    expect(store.getState().pending).toBeNull()
    expect(store.getState().contributions).toEqual([
      expect.objectContaining({
        title: 'The moon finds a guardian',
        origin: 'agent',
      }),
    ])
  })

  it('rejects a stale proposal without changing the story world', () => {
    const store = createStoryStore()
    store.noteHumanChange()

    expect(() => store.propose(moonProposal)).toThrow(/revision 1/i)
    expect(store.getState().pending).toBeNull()
  })

  it('revises a pending contribution without committing either version', () => {
    const store = createStoryStore()
    store.propose(moonProposal)
    const currentRevision = store.getState().revision

    store.revise({
      ...moonProposal,
      basedOnRevision: currentRevision,
      title: 'The fox becomes the moon guardian',
      narration: 'The crowned fox promises to return night to the village.',
    })

    expect(store.getState().pending?.title).toBe(
      'The fox becomes the moon guardian',
    )
    expect(store.getState().contributions).toHaveLength(0)
  })

  it('discarding a proposal leaves committed contributions untouched', () => {
    const store = createStoryStore()
    store.propose(moonProposal)
    store.acceptPending()
    store.propose({
      ...moonProposal,
      id: 'proposal:village',
      basedOnRevision: store.getState().revision,
      title: 'A second idea',
    })

    store.discardPending()

    expect(store.getState().contributions).toHaveLength(1)
    expect(store.getState().pending).toBeNull()
  })

  it('restores a previously saved story state', () => {
    const original = createStoryStore()
    original.propose(moonProposal)
    original.acceptPending()

    const restored = createStoryStore(original.getState())

    expect(restored.getState()).toEqual(original.getState())
    expect(restored.getState().contributions[0]?.beats[0]?.narration).toBe(
      'The fox follows the silver sound.',
    )
  })
})
