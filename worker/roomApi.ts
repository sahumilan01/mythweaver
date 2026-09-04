import type { CanvasSnapshot } from '../src/canvas/nativeCanvas'
import { ARTIFACT_RELATIONS, PAINT_ARTIFACTS, SCENE_PALETTE } from '../src/canvas/paintingModel'
import { SESSION_MODES, type SessionMode, type SessionParticipant, type TurnSessionState } from '../src/session/turnSession'
import type { StoryState } from '../src/story/storyStore'

export interface SharedRoomSnapshot {
  canvas: CanvasSnapshot
  turnSession: TurnSessionState
  story: StoryState
}

export interface StoredRoom {
  roomId: string
  tokenHash: string
  version: number
  snapshot: SharedRoomSnapshot
  updatedAt: number
}

export interface RoomEvent {
  id: number
  roomId: string
  type: string
  payload: Record<string, unknown>
  createdAt: number
}

export interface RoomRepository {
  get(roomId: string, tokenHash: string): Promise<StoredRoom | null>
  create(roomId: string, tokenHash: string, snapshot: SharedRoomSnapshot, eventType: string): Promise<StoredRoom | null>
  write(roomId: string, tokenHash: string, expectedVersion: number, snapshot: SharedRoomSnapshot, eventType: string): Promise<StoredRoom | null>
  events(roomId: string, tokenHash: string, after: number): Promise<RoomEvent[] | null>
}

type D1Result = { meta?: { changes?: number }; success?: boolean }
type D1Statement = {
  bind(...values: unknown[]): D1Statement
  first<T>(): Promise<T | null>
  all<T>(): Promise<{ results: T[] }>
  run(): Promise<D1Result>
}

export interface D1DatabasePort {
  prepare(sql: string): D1Statement
}

let roomSchemaReady: Promise<void> | null = null

export function ensureRoomSchema(db: D1DatabasePort) {
  roomSchemaReady ??= Promise.all([
    db.prepare('CREATE TABLE IF NOT EXISTS painting_rooms (id TEXT PRIMARY KEY NOT NULL, token_hash TEXT NOT NULL, version INTEGER NOT NULL, snapshot TEXT NOT NULL, updated_at INTEGER NOT NULL)').run(),
    db.prepare('CREATE TABLE IF NOT EXISTS painting_events (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, room_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL)').run(),
  ]).then(async () => {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_painting_events_room_id_id ON painting_events (room_id, id)').run()
  })
  return roomSchemaReady
}

const ROOM_ID = /^[a-zA-Z0-9_-]{12,80}$/
const HEX_COLOR = /^#[0-9a-f]{6}$/i
const MAX_BODY_BYTES = 96_000
const paintRegionIds = new Set(PAINT_ARTIFACTS.map((artifact) => artifact.id))

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
})

const publicRoom = ({ tokenHash: _tokenHash, ...room }: StoredRoom) => ({
  ...room,
  scene: {
    title: 'Moonlit fox',
    description: 'A coloring-book fox beside a winding river under a moon and two stars.',
    artifacts: PAINT_ARTIFACTS.map((artifact) => ({ ...artifact, fill: room.snapshot.canvas.fills[artifact.id] ?? null })),
    palette: SCENE_PALETTE,
    relations: ARTIFACT_RELATIONS,
  },
  agentInstructions: [
    'Announce presence before reading or painting.',
    'Read this state immediately before every paint action.',
    'Paint exactly one predefined open region with one six-digit hex color.',
    'Preserve every human fill and obey snapshot.turnSession.active.',
    'After painting, read state again. If it is the human turn, stay connected and poll events/pending every second until the brush returns.',
    'Continue immediately on every agent turn. Stop only when the page is complete, the person asks you to stop, or the room repeatedly fails.',
  ],
})

const durableSnapshotFingerprint = (snapshot: SharedRoomSnapshot) => JSON.stringify({
  canvas: {
    shapes: snapshot.canvas.shapes,
    fills: snapshot.canvas.fills,
  },
  turnSession: snapshot.turnSession,
  story: snapshot.story,
})

const parseSnapshot = (value: unknown): SharedRoomSnapshot => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('snapshot must be an object')
  const snapshot = value as Partial<SharedRoomSnapshot>
  if (!snapshot.canvas || !snapshot.turnSession || !snapshot.story) throw new Error('snapshot is incomplete')
  if (!snapshot.canvas.fills || typeof snapshot.canvas.fills !== 'object') throw new Error('canvas fills are invalid')
  if (!['human', 'agent', 'agent-two'].includes(snapshot.turnSession.active)) throw new Error('turn participant is invalid')
  if (!Number.isFinite(snapshot.story.revision)) throw new Error('story revision is invalid')
  return snapshot as SharedRoomSnapshot
}

const bearerToken = (request: Request) => {
  const authorization = request.headers.get('authorization') ?? ''
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim()
  return new URL(request.url).searchParams.get('token')?.trim() ?? ''
}

const hashToken = async (token: string) => {
  if (token.length < 24 || token.length > 160) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const body = async (request: Request) => {
  const value = await request.text()
  if (new TextEncoder().encode(value).byteLength > MAX_BODY_BYTES) throw new Error('Request is too large.')
  return JSON.parse(value || '{}') as Record<string, unknown>
}

const nextTurn = (state: TurnSessionState, participant: SessionParticipant): TurnSessionState => {
  if (state.movesRemaining > 1) return { ...state, movesRemaining: state.movesRemaining - 1 }
  const active = state.mode === 'agent-show'
    ? 'agent'
    : state.mode === 'agent-duo'
      ? participant === 'agent' ? 'agent-two' : 'agent'
      : participant === 'human' ? 'agent' : 'human'
  return {
    ...state,
    active,
    movesRemaining: state.mode === 'two-two' ? 2 : 1,
    round: state.round + 1,
  }
}

const participantName = (participant: SessionParticipant) => participant === 'human' ? 'You' : participant === 'agent-two' ? 'Mica' : 'ChatGPT'

const mutateAction = (snapshot: SharedRoomSnapshot, input: Record<string, unknown>): { snapshot: SharedRoomSnapshot; eventType: string } => {
  const type = String(input.type ?? '')
  const participant = input.participant === 'human' || input.participant === 'agent-two' ? input.participant : 'agent'
  const next = structuredClone(snapshot)
  const presenceKey = participant === 'agent-two' ? 'agentTwoPresence' : 'agentPresence'
  const now = Date.now()

  if (type === 'join' || type === 'heartbeat') {
    if (participant === 'human') throw new Error('Human presence does not use the agent endpoint.')
    const current = next.canvas[presenceKey]
    next.canvas[presenceKey] = {
      x: typeof input.x === 'number' ? input.x : current?.x ?? (participant === 'agent' ? 1080 : 980),
      y: typeof input.y === 'number' ? input.y : current?.y ?? (participant === 'agent' ? 100 : 145),
      label: typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 180) : `${participantName(participant)} joined`,
      updatedAt: now,
    }
    if (type === 'join' && input.takeFirstTurn === true) {
      next.turnSession.active = participant
      next.turnSession.movesRemaining = next.turnSession.mode === 'two-two' ? 2 : 1
      next.turnSession.finished = false
    }
    return { snapshot: next, eventType: type }
  }

  if (type === 'leave') {
    if (participant === 'human') throw new Error('Human presence does not use the agent endpoint.')
    next.canvas[presenceKey] = null
    return { snapshot: next, eventType: type }
  }

  if (type === 'paint') {
    const regionId = String(input.regionId ?? '')
    const color = String(input.color ?? '')
    const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 180) : ''
    if (!paintRegionIds.has(regionId as never)) throw new Error('Unknown paint region.')
    if (!HEX_COLOR.test(color)) throw new Error('Color must be a six-digit hex value.')
    if (next.turnSession.finished || next.turnSession.active !== participant) {
      throw new Error(`It is ${participantName(next.turnSession.active)}'s turn.`)
    }
    const existing = next.canvas.fills[regionId as keyof typeof next.canvas.fills]
    if (existing?.origin === 'human' && participant !== 'human') throw new Error('That section belongs to the person.')
    if (existing && input.repaintOwnFill !== true) throw new Error('That section is already painted.')
    next.canvas.fills[regionId as keyof typeof next.canvas.fills] = { color, origin: participant }
    next.canvas.focusedIds = [regionId]
    next.canvas.lastAction = { origin: participant, label: `${participantName(participant)} colored ${PAINT_ARTIFACTS.find((item) => item.id === regionId)?.label ?? regionId}` }
    if (participant !== 'human') {
      next.canvas[presenceKey] = {
        x: PAINT_ARTIFACTS.find((item) => item.id === regionId)?.center.x ?? 600,
        y: PAINT_ARTIFACTS.find((item) => item.id === regionId)?.center.y ?? 350,
        label: reason || `Painted ${regionId}`,
        updatedAt: now,
      }
    }
    next.story.revision += participant === 'human' ? 1 : 0
    next.turnSession = nextTurn(next.turnSession, participant)
    if (Object.keys(next.canvas.fills).length >= PAINT_ARTIFACTS.length) next.turnSession.finished = true
    return { snapshot: next, eventType: 'paint' }
  }

  if (type === 'set_mode') {
    const mode = String(input.mode ?? '') as SessionMode
    if (!(mode in SESSION_MODES)) throw new Error('Unknown painting mode.')
    next.turnSession = {
      mode,
      active: mode === 'agent-show' || mode === 'agent-duo' ? 'agent' : 'human',
      movesRemaining: mode === 'two-two' ? 2 : 1,
      round: 1,
      finished: false,
    }
    return { snapshot: next, eventType: 'set_mode' }
  }

  throw new Error('Unknown room action.')
}

export async function handleRoomRequest(request: Request, repository: RoomRepository): Promise<Response> {
  const url = new URL(request.url)
  const match = url.pathname.match(/^\/api\/(?:rooms|agent)\/([^/]+)(?:\/(state|presence|actions|events\/pending))?$/)
  const roomId = match?.[1] ?? ''
  const operation = match?.[2] ?? 'state'
  if (!ROOM_ID.test(roomId)) return json({ error: 'Invalid room.' }, 400)
  const tokenHash = await hashToken(bearerToken(request))
  if (!tokenHash) return json({ error: 'A valid bearer token is required.' }, 401)

  if (operation === 'events/pending' && request.method === 'GET') {
    const after = Math.max(0, Number(url.searchParams.get('after') ?? 0) || 0)
    const events = await repository.events(roomId, tokenHash, after)
    return events ? json({ events }) : json({ error: 'Room not found or token is invalid.' }, 401)
  }

  if (operation === 'state' && request.method === 'GET') {
    const room = await repository.get(roomId, tokenHash)
    return room ? json(publicRoom(room)) : json({ error: 'Room not found or token is invalid.' }, 401)
  }

  if (operation === 'state' && request.method === 'PUT') {
    try {
      const input = await body(request)
      const expectedVersion = Number(input.expectedVersion)
      if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return json({ error: 'expectedVersion must be a non-negative integer.' }, 400)
      const snapshot = parseSnapshot(input.snapshot)
      const eventType = String(input.eventType ?? 'state')
      if (expectedVersion > 0 && eventType === 'canvas_changed') {
        const current = await repository.get(roomId, tokenHash)
        if (!current) return json({ error: 'Room not found or token is invalid.' }, 401)
        if (current.version !== expectedVersion) return json(publicRoom(current), 409)
        if (durableSnapshotFingerprint(current.snapshot) === durableSnapshotFingerprint(snapshot)) {
          return json(publicRoom(current))
        }
      }
      const written = expectedVersion === 0
        ? await repository.create(roomId, tokenHash, snapshot, 'created')
        : await repository.write(roomId, tokenHash, expectedVersion, snapshot, eventType)
      if (written) return json(publicRoom(written))
      const current = await repository.get(roomId, tokenHash)
      return current ? json(publicRoom(current), 409) : json({ error: 'Room not found or token is invalid.' }, 401)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid room state.' }, 400)
    }
  }

  if ((operation === 'presence' || operation === 'actions') && request.method === 'POST') {
    try {
      const input = await body(request)
      const action = operation === 'presence' ? { ...input, type: input.type ?? 'join' } : input
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await repository.get(roomId, tokenHash)
        if (!current) return json({ error: 'Room not found or token is invalid.' }, 401)
        const mutation = mutateAction(current.snapshot, action)
        const written = await repository.write(roomId, tokenHash, current.version, mutation.snapshot, mutation.eventType)
        if (written) return json(publicRoom(written))
      }
      return json({ error: 'The room changed too quickly. Read state and retry.' }, 409)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid room action.' }, 400)
    }
  }

  return json({ error: 'Method not allowed.' }, 405)
}

export function createMemoryRoomRepository(): RoomRepository {
  const rooms = new Map<string, StoredRoom>()
  const eventLog: RoomEvent[] = []
  const append = (room: StoredRoom, type: string) => eventLog.push({ id: eventLog.length + 1, roomId: room.roomId, type, payload: { version: room.version }, createdAt: room.updatedAt })
  return {
    async get(roomId, tokenHash) {
      const room = rooms.get(roomId)
      return room?.tokenHash === tokenHash ? structuredClone(room) : null
    },
    async create(roomId, tokenHash, snapshot, eventType) {
      if (rooms.has(roomId)) return null
      const room = { roomId, tokenHash, version: 1, snapshot: structuredClone(snapshot), updatedAt: Date.now() }
      rooms.set(roomId, room)
      append(room, eventType)
      return structuredClone(room)
    },
    async write(roomId, tokenHash, expectedVersion, snapshot, eventType) {
      const current = rooms.get(roomId)
      if (!current || current.tokenHash !== tokenHash || current.version !== expectedVersion) return null
      const room = { roomId, tokenHash, version: expectedVersion + 1, snapshot: structuredClone(snapshot), updatedAt: Date.now() }
      rooms.set(roomId, room)
      append(room, eventType)
      return structuredClone(room)
    },
    async events(roomId, tokenHash, after) {
      if (rooms.get(roomId)?.tokenHash !== tokenHash) return null
      return structuredClone(eventLog.filter((event) => event.roomId === roomId && event.id > after))
    },
  }
}

export function createD1RoomRepository(db: D1DatabasePort): RoomRepository {
  const read = async (roomId: string, tokenHash: string): Promise<StoredRoom | null> => {
    const row = await db.prepare('SELECT id, token_hash, version, snapshot, updated_at FROM painting_rooms WHERE id = ? AND token_hash = ?')
      .bind(roomId, tokenHash).first<{ id: string; token_hash: string; version: number; snapshot: string; updated_at: number }>()
    return row ? { roomId: row.id, tokenHash: row.token_hash, version: row.version, snapshot: JSON.parse(row.snapshot) as SharedRoomSnapshot, updatedAt: row.updated_at } : null
  }
  const append = (roomId: string, type: string, version: number, createdAt: number) => db.prepare(
    'INSERT INTO painting_events (room_id, type, payload, created_at) VALUES (?, ?, ?, ?)',
  ).bind(roomId, type, JSON.stringify({ version }), createdAt).run()

  return {
    get: read,
    async create(roomId, tokenHash, snapshot, eventType) {
      const updatedAt = Date.now()
      const result = await db.prepare('INSERT INTO painting_rooms (id, token_hash, version, snapshot, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING')
        .bind(roomId, tokenHash, JSON.stringify(snapshot), updatedAt).run()
      if ((result.meta?.changes ?? 0) !== 1) return null
      await append(roomId, eventType, 1, updatedAt)
      return read(roomId, tokenHash)
    },
    async write(roomId, tokenHash, expectedVersion, snapshot, eventType) {
      const updatedAt = Date.now()
      const result = await db.prepare('UPDATE painting_rooms SET version = version + 1, snapshot = ?, updated_at = ? WHERE id = ? AND token_hash = ? AND version = ?')
        .bind(JSON.stringify(snapshot), updatedAt, roomId, tokenHash, expectedVersion).run()
      if ((result.meta?.changes ?? 0) !== 1) return null
      await append(roomId, eventType, expectedVersion + 1, updatedAt)
      return read(roomId, tokenHash)
    },
    async events(roomId, tokenHash, after) {
      if (!await read(roomId, tokenHash)) return null
      const { results } = await db.prepare('SELECT id, room_id, type, payload, created_at FROM painting_events WHERE room_id = ? AND id > ? ORDER BY id ASC LIMIT 100')
        .bind(roomId, after).all<{ id: number; room_id: string; type: string; payload: string; created_at: number }>()
      return results.map((row) => ({ id: row.id, roomId: row.room_id, type: row.type, payload: JSON.parse(row.payload) as Record<string, unknown>, createdAt: row.created_at }))
    },
  }
}
