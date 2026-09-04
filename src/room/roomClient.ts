import type { SharedRoomSnapshot } from '../../worker/roomApi'

export interface RoomCredentials {
  roomId: string
  token: string
  shareUrl: string
}

export interface RoomStateEnvelope {
  roomId: string
  version: number
  snapshot: SharedRoomSnapshot
  updatedAt: number
}

export class RoomRequestError extends Error {
  constructor(public status: number, message: string, public current?: RoomStateEnvelope) {
    super(message)
  }
}

const randomSecret = () => crypto.randomUUID().replaceAll('-', '')

export function resolveRoomCredentials(pageUrl: string): RoomCredentials {
  const url = new URL(pageUrl)
  let roomId = url.searchParams.get('room') ?? ''
  let token = url.searchParams.get('token') ?? ''
  if (!/^room_[a-zA-Z0-9_-]{16,64}$/.test(roomId) || token.length < 24) {
    roomId = `room_${randomSecret()}`
    token = `${randomSecret()}${randomSecret()}`
    url.searchParams.set('room', roomId)
    url.searchParams.set('token', token)
  }
  return { roomId, token, shareUrl: url.toString() }
}

export class RoomClient {
  constructor(
    private credentials: RoomCredentials,
    private request: typeof fetch = fetch,
  ) {}

  private endpoint(suffix = 'state') {
    return `/api/agent/${encodeURIComponent(this.credentials.roomId)}/${suffix}`
  }

  private async send(path: string, init: RequestInit = {}): Promise<RoomStateEnvelope> {
    const response = await this.request(path, {
      ...init,
      headers: {
        authorization: `Bearer ${this.credentials.token}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    })
    const payload = await response.json() as RoomStateEnvelope & { error?: string }
    if (!response.ok) throw new RoomRequestError(response.status, payload.error ?? 'Room request failed.', response.status === 409 ? payload : undefined)
    return payload
  }

  read() {
    return this.send(this.endpoint())
  }

  create(snapshot: SharedRoomSnapshot) {
    return this.send(this.endpoint(), { method: 'PUT', body: JSON.stringify({ expectedVersion: 0, snapshot }) })
  }

  write(expectedVersion: number, snapshot: SharedRoomSnapshot, eventType = 'state') {
    return this.send(this.endpoint(), { method: 'PUT', body: JSON.stringify({ expectedVersion, snapshot, eventType }) })
  }

  action(input: Record<string, unknown>) {
    return this.send(this.endpoint('actions'), { method: 'POST', body: JSON.stringify(input) })
  }
}
