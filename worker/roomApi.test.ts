import { describe, expect, it } from 'vitest'
import {
  createMemoryRoomRepository,
  handleRoomRequest,
  type SharedRoomSnapshot,
} from './roomApi'

const emptyRoom = (): SharedRoomSnapshot => ({
  canvas: {
    shapes: [],
    fills: {},
    focusedIds: [],
    lastAction: null,
    agentPresence: null,
    agentTwoPresence: null,
  },
  turnSession: {
    mode: 'one-one',
    active: 'human',
    movesRemaining: 1,
    round: 1,
    finished: false,
  },
  story: { revision: 0, pending: null, contributions: [] },
})

const token = 'test-token-1234567890-abcdef'
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

describe('shared painting room API', () => {
  it('lets two browser sessions observe the same authoritative canvas', async () => {
    const repository = createMemoryRoomRepository()
    const roomId = 'room_1234567890abcdef'
    const created = await handleRoomRequest(
      new Request(`https://example.test/api/rooms/${roomId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ expectedVersion: 0, snapshot: emptyRoom() }),
      }),
      repository,
    )
    expect(created.status).toBe(200)

    const first = await created.json() as { version: number; snapshot: SharedRoomSnapshot }
    const painted = structuredClone(first.snapshot)
    painted.canvas.fills.moon = { color: '#f0b343', origin: 'human' }

    const updated = await handleRoomRequest(
      new Request(`https://example.test/api/rooms/${roomId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ expectedVersion: first.version, snapshot: painted }),
      }),
      repository,
    )
    expect(updated.status).toBe(200)

    const observed = await handleRoomRequest(
      new Request(`https://example.test/api/agent/${roomId}/state`, { headers }),
      repository,
    )
    const live = await observed.json() as { version: number; snapshot: SharedRoomSnapshot }
    expect(live.snapshot.canvas.fills.moon).toEqual({ color: '#f0b343', origin: 'human' })
  })

  it('rejects stale writes instead of silently erasing another collaborator', async () => {
    const repository = createMemoryRoomRepository()
    const roomId = 'room_abcdef1234567890'
    const created = await handleRoomRequest(
      new Request(`https://example.test/api/rooms/${roomId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ expectedVersion: 0, snapshot: emptyRoom() }),
      }),
      repository,
    )
    const first = await created.json() as { version: number }

    const write = (color: string) => handleRoomRequest(
      new Request(`https://example.test/api/rooms/${roomId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          expectedVersion: first.version,
          snapshot: {
            ...emptyRoom(),
            canvas: {
              ...emptyRoom().canvas,
              fills: { moon: { color, origin: 'agent' } },
            },
          },
        }),
      }),
      repository,
    )

    expect((await write('#263f98')).status).toBe(200)
    const conflict = await write('#d9513f')
    expect(conflict.status).toBe(409)
    const current = await conflict.json() as { snapshot: SharedRoomSnapshot }
    expect(current.snapshot.canvas.fills.moon?.color).toBe('#263f98')
  })

  it('requires the token and exposes an agent join, read, paint, and event contract', async () => {
    const repository = createMemoryRoomRepository()
    const roomId = 'room_shared123456789'
    await handleRoomRequest(new Request(`https://example.test/api/rooms/${roomId}`, {
      method: 'PUT', headers, body: JSON.stringify({ expectedVersion: 0, snapshot: emptyRoom() }),
    }), repository)

    expect((await handleRoomRequest(new Request(`https://example.test/api/agent/${roomId}/state`), repository)).status).toBe(401)

    const joined = await handleRoomRequest(new Request(`https://example.test/api/agent/${roomId}/presence`, {
      method: 'POST', headers, body: JSON.stringify({ participant: 'agent', type: 'join', takeFirstTurn: true, label: 'ChatGPT joined' }),
    }), repository)
    expect(joined.status).toBe(200)

    const painted = await handleRoomRequest(new Request(`https://example.test/api/agent/${roomId}/actions`, {
      method: 'POST', headers, body: JSON.stringify({ type: 'paint', participant: 'agent', regionId: 'river', color: '#263f98', reason: 'A cool river anchors the scene.' }),
    }), repository)
    expect(painted.status).toBe(200)
    const paintState = await painted.json() as { snapshot: SharedRoomSnapshot }
    expect(paintState.snapshot.canvas.fills.river).toEqual({ color: '#263f98', origin: 'agent' })
    expect(paintState.snapshot.turnSession.active).toBe('human')

    const events = await handleRoomRequest(new Request(`https://example.test/api/agent/${roomId}/events/pending?after=0`, { headers }), repository)
    const eventBody = await events.json() as { events: Array<{ type: string }> }
    expect(eventBody.events.map((event) => event.type)).toEqual(['created', 'join', 'paint'])
  })
})
