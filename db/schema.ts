import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const paintingRooms = sqliteTable('painting_rooms', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  version: integer('version').notNull(),
  snapshot: text('snapshot').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const paintingEvents = sqliteTable(
  'painting_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    roomId: text('room_id').notNull(),
    type: text('type').notNull(),
    payload: text('payload').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_painting_events_room_id_id').on(table.roomId, table.id)],
)
