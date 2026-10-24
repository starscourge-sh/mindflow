import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

import { atomically, changed, database } from './captures'

/**
 * Notes brought in from another app (Apple Notes, an Obsidian vault) land in
 * Writing, a group for each folder they were in, and every one of them "not
 * yet sorted" (`nuggets.unsorted`) until it is kept, tagged, moved out of its
 * group or put in the Bin. Each group shows how many are left; "Sort these"
 * goes through them one at a time.
 *
 * Groups have one level here, so a folder is a group named for where it came
 * from and what it was called: "Apple Notes / Recipes".
 */

/** A folder of one note is not a group: those are gathered into this one. */
const OTHERS = 'Other folders'

/**
 * Put these articles into the groups of Pages, a group for each folder, named
 * "<from> / <folder>". A group of that name already there (from an earlier
 * import) takes them in after its own. Folders of a single note share one
 * group, and a lone note left over stays in the list as it is.
 */
export function fileIntoGroups(from: string, folders: { name: string; ids: string[] }[]): { name: string; count: number }[] {
  const db = database()
  const big = folders.filter((one) => one.ids.length > 1)
  const small = folders.filter((one) => one.ids.length === 1).flatMap((one) => one.ids)
  const wanted = [...big.map((one) => ({ name: `${from} / ${one.name}`, ids: one.ids })), ...(small.length > 1 ? [{ name: `${from} / ${OTHERS}`, ids: small }] : [])]
  const named: { name: string; count: number }[] = []
  atomically(() => {
    const find = db.prepare("select id from note_groups where list = 'article' and name = ? order by created_at limit 1")
    const make = db.prepare("insert into note_groups (id, list, name, created_at) values (?, 'article', ?, ?)")
    const put = db.prepare('update nuggets set group_id = ?, group_order = ? where id = ?')
    const last = db.prepare('select max(group_order) as at from nuggets where group_id = ?')
    for (const one of wanted) {
      let id = (find.get(one.name) as { id: string } | undefined)?.id
      if (!id) make.run((id = randomUUID()), one.name, new Date().toISOString())
      const after = ((last.get(id) as { at: number | null }).at ?? -1) + 1
      one.ids.forEach((note, at) => put.run(id, after + at, note))
      named.push({ name: one.name, count: one.ids.length })
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
export function filedSaid(from: string, groups: { name: string; count: number }[], made: number): string {
  if (!made) return ''
  const grouped = groups.reduce((sum, one) => sum + one.count, 0)
  const loose = made - grouped
  const they = made === 1 ? 'It is' : 'They are'
  const where = groups.length === 1 ? `“${groups[0].name}”` : `${groups.length.toLocaleString()} groups named “${from} / …”`
  if (!groups.length) return `${they} in Writing, marked not yet sorted.`
  if (loose <= 0) return `${they} in Writing, in ${where}, marked not yet sorted.`
  return `${they} in Writing, marked not yet sorted: ${grouped.toLocaleString()} in ${where}, ${loose.toLocaleString()} on ${loose === 1 ? 'its' : 'their'} own.`
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
