import { describe, expect, it, vi } from 'vitest'
import { resolveRoomCredentials, RoomClient } from './roomClient'

describe('room client', () => {
  it('creates a tokenized invitation and preserves it when opened by the agent', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn()
      .mockReturnValueOnce('11111111-1111-1111-1111-111111111111')
      .mockReturnValueOnce('22222222-2222-2222-2222-222222222222')
      .mockReturnValueOnce('33333333-3333-3333-3333-333333333333') })
    const created = resolveRoomCredentials('https://mythweaver.test/')
    const reopened = resolveRoomCredentials(created.shareUrl)
    expect(created.roomId).toBe('room_11111111111111111111111111111111')
    expect(created.token).toHaveLength(64)
    expect(reopened).toEqual(created)
    vi.unstubAllGlobals()
  })

  it('sends the bearer token when an agent reads the shared room', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ roomId: 'room_shared123456789', version: 1, snapshot: {}, updatedAt: 1 }), { status: 200 }))
    const client = new RoomClient({ roomId: 'room_shared123456789', token: 'secret-token-1234567890-abcdef', shareUrl: 'https://example.test/' }, request as typeof fetch)
    await client.read()
    expect(request).toHaveBeenCalledWith('/api/agent/room_shared123456789/state', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer secret-token-1234567890-abcdef' }),
    }))
  })

  it('calls the browser fetch function with its required global receiver', async () => {
    const request = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(new Response(JSON.stringify({ roomId: 'room_shared123456789', version: 1, snapshot: {}, updatedAt: 1 }), { status: 200 }))
    })
    vi.stubGlobal('fetch', request)
    const client = new RoomClient({ roomId: 'room_shared123456789', token: 'secret-token-1234567890-abcdef', shareUrl: 'https://example.test/' })
    await client.read()
    expect(request).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it('adopts the winning room when two browser mounts create it together', async () => {
    const current = { roomId: 'room_shared123456789', version: 1, snapshot: {}, updatedAt: 1 }
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Room not found.' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(current), { status: 409 }))
    const client = new RoomClient({ roomId: current.roomId, token: 'secret-token-1234567890-abcdef', shareUrl: 'https://example.test/' }, request as typeof fetch)
    await expect(client.open({} as never)).resolves.toEqual(current)
  })
})
