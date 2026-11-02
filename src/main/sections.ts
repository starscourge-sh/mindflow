import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

import { atomically, changed, database } from './captures'

/**
 * Groups you make by hand inside a list, as Things' headings are: a named
 * section of the list you are looking at (a folder, or the list itself),
 * that folds, takes notes dragged onto it and can go again while its notes
 * stay. A group is never a folder: a note lives in one folder (its group_id,
 * groups.ts) and, inside that folder, may sit in one of its groups. A group
 * belongs to one folder (or to none, at the list's top level), so moving a
 * note to another folder takes it out of its group there.
 *
 * Every channel here starts `haligtree:`, so the preload passes it through.
 */

export type Section = { id: string; name: string; folder: string | null; folded: number; members: string[] }
type Kept = { section: { id: string; list: string; folder: string | null; name: string; folded: number; createdAt: string }; ids: string[] }

const now = (): string => new Date().toISOString()

export function registerSections(): void {
  const db = database()
  db.exec(`create table if not exists note_sections (
    id text primary key, list text not null, folder_id text, name text not null,
    folded integer not null default 0, created_at text not null)`)
  try {
    db.exec('alter table nuggets add column section_id text')
  } catch {
    // Already there.
  }

  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`haligtree:${channel}`, (_event, ...args) => run(...(args as never[])))

  // Only the notes still in the group's own folder count as in it: a note moved to another folder has left it.
  const members = (id: string, folder: string | null): string[] =>
    (db.prepare("select id from nuggets where section_id = ? and coalesce(group_id, '') = ? order by created_at").all(id, folder ?? '') as { id: string }[]).map((row) => row.id)

  handle('sections', (list: string) =>
    (db.prepare('select id, name, folder_id as folder, folded from note_sections where list = ? order by created_at').all(list) as Omit<Section, 'members'>[])
      .map((one) => ({ ...one, members: members(one.id, one.folder) })))

  handle('sections:make', (list: string, folder: string | null, name: string, ids: string[] = []) => {
    const id = randomUUID()
    atomically(() => {
      db.prepare('insert into note_sections (id, list, folder_id, name, created_at) values (?, ?, ?, ?, ?)').run(id, list, folder, name.trim() || 'New group', now())
      const put = db.prepare('update nuggets set section_id = ? where id = ?')
      for (const one of ids) put.run(id, one)
    })
    changed()
    return id
  })

  handle('sections:set', (id: string, patch: { name?: string; folded?: boolean }) => {
    const fields = Object.entries({ name: patch.name?.trim() || undefined, folded: patch.folded === undefined ? undefined : patch.folded ? 1 : 0 }).filter(([, value]) => value !== undefined)
    if (!fields.length) return false
    db.prepare(`update note_sections set ${fields.map(([key]) => `${key} = ?`).join(', ')} where id = ?`).run(...fields.map(([, value]) => value as string | number), id)
    changed()
    return true
  })

  // Deleting a group keeps its notes, where they live, out of any group; what it was comes back for Undo.
  handle('sections:delete', (id: string): Kept | null => {
    const section = db.prepare('select id, list, folder_id as folder, name, folded, created_at as createdAt from note_sections where id = ?').get(id) as Kept['section'] | undefined
    if (!section) return null
    const ids = members(id, section.folder)
    atomically(() => {
      db.prepare('update nuggets set section_id = null where section_id = ?').run(id)
      db.prepare('delete from note_sections where id = ?').run(id)
    })
    changed()
    return { section, ids }
  })
  handle('sections:restore', (was: Kept) => {
    const { id, list, folder, name, folded, createdAt } = was.section
    atomically(() => {
      db.prepare('insert or replace into note_sections (id, list, folder_id, name, folded, created_at) values (?, ?, ?, ?, ?, ?)').run(id, list, folder, name, folded, createdAt)
      const put = db.prepare('update nuggets set section_id = ? where id = ?')
      for (const one of was.ids) put.run(id, one)
    })
    changed()
    return true
  })

  // Notes into a group (or out of every group, with null): where each was comes back, for Undo.
  handle('sections:place', (moves: { id: string; section: string | null }[]) => {
    const get = db.prepare('select section_id as section from nuggets where id = ?')
    const was = moves.map(({ id }) => ({ id, section: (get.get(id) as { section: string | null } | undefined)?.section ?? null }))
    atomically(() => {
      const put = db.prepare('update nuggets set section_id = ? where id = ?')
      for (const one of moves) put.run(one.section, one.id)
    })
    changed()
    return was
  })
}
