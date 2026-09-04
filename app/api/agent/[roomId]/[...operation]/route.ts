import { env } from 'cloudflare:workers'
import { createD1RoomRepository, ensureRoomSchema, handleRoomRequest, type D1DatabasePort } from '../../../../../worker/roomApi'

const database = () => (env as unknown as { DB: D1DatabasePort }).DB

const respond = async (request: Request) => {
  const db = database()
  await ensureRoomSchema(db)
  return handleRoomRequest(request, createD1RoomRepository(db))
}

export async function GET(request: Request) {
  return respond(request)
}

export async function PUT(request: Request) {
  return respond(request)
}

export async function POST(request: Request) {
  return respond(request)
}
