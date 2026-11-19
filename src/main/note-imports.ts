import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

import { atomically, changed, database } from './captures'
import { FOLDER_DEPTH, LIST, offerArchive } from './folders'

/**
 * Notes brought in from another app (Apple Notes, an Obsidian vault) land in
 * Writing, a group for each folder they were in, and every one of them "not
 * yet sorted" (`nuggets.unsorted`) until it is kept, tagged, moved out of its
 * group or put in the Bin. Each group shows how many are left; "Sort these"
 * goes through them one at a time.
 *
 * A folder is a group named for it ("Recipes"), its subfolders groups inside
 * it, as deep as groups go.
 */

/**
 * Put these imported notes into Folders, under one "Imports" folder: a folder of the import's own ("Obsidian:
 * Engineering Codex", "Apple Notes"), and inside it the source's folders at their own paths, as deep as folders go
 * (deeper ones come into the last level, named by the rest of their path, "Acme / 2024"). A folder of that name
 * already in the same place (from an earlier import) takes them in. "Imports" is starred, so the sidebar shows one
 * line per import, never a source's whole tree. A page stays a page in Writing, kept in its folder.
 */
/** `made`: given, the folders it had to make are added to it, outermost first. */
export function fileIntoGroups(folders: { path: string[]; ids: string[] }[], made?: string[], source = 'Notes'): { name: string; count: number }[] {
  const db = database()
  const named: { name: string; count: number }[] = []
  atomically(() => {
    const find = db.prepare(`select id from note_groups where list = '${LIST}' and name = ? and coalesce(parent_id, '') = ? order by created_at limit 1`)
    const make = db.prepare(`insert into note_groups (id, list, name, parent_id, folder, starred, created_at) values (?, '${LIST}', ?, ?, 1, ?, ?)`)
    const end = db.prepare(`select max(position) as at from note_order where list = '${LIST}'`)
    const order = db.prepare(`insert or replace into note_order (list, id, position) values ('${LIST}', ?, ?)`)
    const put = db.prepare('update nuggets set folder_id = ? where id = ?')
    // Imports, then the import's own, then the source's: two levels are taken before its folders start.
    const room = FOLDER_DEPTH - 2
    for (const one of folders) {
      if (!one.ids.length) continue
      const inner = one.path.length > room ? [...one.path.slice(0, room - 1), one.path.slice(room - 1).join(' / ')] : one.path
      const path = ['Imports', source, ...inner]
      let id: string | null = null
      for (const [at, name] of path.entries()) {
        const parent: string | null = id
        id = (find.get(name, parent ?? '') as { id: string } | undefined)?.id ?? null
        if (!id) {
          make.run((id = randomUUID()), name, parent, at === 0 ? 1 : 0, new Date().toISOString())
          // A source's "Archive" (Obsidian boards make one): offered once to be archived instead (folders.ts `offers`).
          if (at > 1 && /^archived?$/i.test(name.trim())) offerArchive(id)
          order.run('g:' + id, ((end.get() as { at: number | null }).at ?? -1) + 1)
          made?.push(id)
        }
      }
      for (const note of one.ids) put.run(id, note)
      named.push({ name: path.join(' › '), count: one.ids.length })
    }
  })
  changed()
  return named
}

/**
 * Where an import's notes went, in one line: the group, or how many groups,
 * and any lone note that stayed in the list outside them ("1 on its own"),
 * so the count adds up to what came in.
 */
export function filedSaid(groups: { name: string; count: number }[], made: number): string {
  if (!made) return ''
  const grouped = groups.reduce((sum, one) => sum + one.count, 0)
  const loose = made - grouped
  const they = made === 1 ? 'It is' : 'They are'
  const where = groups.length === 1 ? `“${groups[0].name}”` : `${groups.length.toLocaleString()} folders under “${groups[0].name.split(' › ').slice(0, 2).join(' › ')}”, one for each of its folders`
  if (!groups.length) return `${they} in Writing, marked not yet sorted.`
  if (loose <= 0) return `${they} in Writing, kept in ${where}, marked not yet sorted.`
  return `${they} in Writing, marked not yet sorted: ${grouped.toLocaleString()} kept in ${where}, ${loose.toLocaleString()} in no folder.`
}

export function registerNoteImports(): void {
  const db = database()
  // Kept, or put back to sort again by Undo.
  ipcMain.handle('haligtree:imports:sorted', (_event, ids: unknown, sorted: unknown) => {
    const list = Array.isArray(ids) ? ids.map(String) : []
    const set = db.prepare('update nuggets set unsorted = ? where id = ?')
    atomically(() => list.forEach((id) => set.run(sorted ? 0 : 1, id)))
    changed()
    return true
  })
  // Moved, which sorts it: into another of Writing's groups, or out of every group (null).
  // What it was comes back, for Undo to put it where it was, not yet sorted again.
  type Was = { id: string; group: string | null; order: number | null; unsorted: number }
  ipcMain.handle('haligtree:imports:move', (_event, id: unknown, group: unknown) => {
    const was = db.prepare('select id, group_id as "group", group_order as "order", unsorted from nuggets where id = ?').get(String(id)) as Was | undefined
    if (!was) return null
    const into = typeof group === 'string' ? group : null
    const end = into ? ((db.prepare('select max(group_order) as at from nuggets where group_id = ?').get(into) as { at: number | null }).at ?? -1) + 1 : null
    db.prepare('update nuggets set group_id = ?, group_order = ?, unsorted = 0 where id = ?').run(into, end, was.id)
    changed()
    return was
  })
  ipcMain.handle('haligtree:imports:unmove', (_event, was: Was) => {
    db.prepare('update nuggets set group_id = ?, group_order = ?, unsorted = ? where id = ?').run(was.group, was.order, was.unsorted, was.id)
    changed()
    return true
  })
}
