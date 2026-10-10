import { ipcMain } from 'electron'

import { changed, database } from './captures'
import { personKey } from './names'

/**
 * The people your notes are from, kept once each: a name and, if you gave
 * one, a picture from the app's own store. Keyed by the name as it is
 * compared everywhere (no accents, capitals or doubled spaces), so "marcus
 * aurelius" and "Marcus Aurelius" are one person with one picture. Pictures
 * only ever come from you: nothing here reaches the internet.
 */


/** Only a picture already in the store: its hash and a picture's ending. */
const STORED = /^mindflow:\/\/assets\/[a-f0-9]{64}\.(png|jpg|jpeg|webp|gif|avif)$/

export type Person = { name: string; avatar: string | null }

export function registerPeople(): void {
  const db = database()
  db.exec('create table if not exists people (key text primary key, name text not null, avatar text, updated_at text not null)')
  ipcMain.handle('vigil:people', () => {
    const rows = db.prepare('select key, name, avatar from people where avatar is not null').all() as { key: string; name: string; avatar: string }[]
    return Object.fromEntries(rows.map((row) => [row.key, { name: row.name, avatar: row.avatar }]))
  })
  ipcMain.handle('vigil:people:set', (_event, name: unknown, avatar: unknown) => {
    if (typeof name !== 'string' || !personKey(name)) return false
    if (avatar !== null && (typeof avatar !== 'string' || !STORED.test(avatar))) return false
    db.prepare('insert into people (key, name, avatar, updated_at) values (?, ?, ?, ?) on conflict(key) do update set name = excluded.name, avatar = excluded.avatar, updated_at = excluded.updated_at')
      .run(personKey(name), name.trim(), avatar, new Date().toISOString())
    changed()
    return true
  })
}
