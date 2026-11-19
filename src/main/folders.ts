import { app, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir } from 'fs/promises'
import { join } from 'path'

import { atomically, changed, database, setting } from './captures'
import { backupDir } from './backup'
import { copyBook } from './books'
import { dayKey } from './dates'

/**
 * Folders: one tree for the whole book, where a thing lives, of any kind (a page, a gem, a note from the Inbox, a
 * task). A folder is a row of note_groups with list 'folders'; a thing's place is its own `folder_id`. Groups (the ⌘G
 * panels) stay in Writing and Gems, in `nuggets.group_id`, so one thing can be in one folder and one group at once.
 *
 * Filing a note from the Inbox takes it out: its status becomes 'filed', and taking it out of the folder puts it back
 * to 'open', in the Inbox again. Every count that reads 'open' stays true.
 */

export const LIST = 'folders'
/** How deep folders go: a folder and five levels inside it. */
export const FOLDER_DEPTH = 6

/** What a thing is, as the windows open it. */
export type Kind = 'article' | 'nugget' | 'question' | 'capture' | 'task'
export type Thing = { type: Kind; id: string }
/** Where a thing was, for Undo to put it back. */
export type Was = Thing & { folder: string | null; status?: string }
export type Folder = {
  id: string; name: string; icon: string | null; color: string | null; parent: string | null; starred: number; archived: number
  /** What it holds itself, by kind, out of the Bin and in sight; and how many of its things are archived. */
  pages: number; gems: number; notes: number; tasks: number; hidden: number
}

const now = (): string => new Date().toISOString()

/** A row's name: its title, or for one with none (a gem) its first words, read from its stored page without parsing it whole. */
const lineOf = (said: string | null): string => {
  if (!said || !said.startsWith('{')) return said ?? ''
  const words: string[] = []
  for (const match of said.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)) {
    words.push(match[1].replace(/\\(.)/g, '$1'))
    if (words.join('').length > 120) break
  }
  return words.join('').slice(0, 160)
}

/** The table each kind lives in. */
const tableOf = (type: Kind): 'nuggets' | 'captures' | 'tasks' => (type === 'capture' ? 'captures' : type === 'task' ? 'tasks' : 'nuggets')

/** Laid down on every start, found already there after the first. */
export function folderColumns(): void {
  const db = database()
  const column = (table: string, definition: string): void => {
    try {
      db.exec(`alter table ${table} add column ${definition}`)
    } catch {
      // Already there.
    }
  }
  for (const table of ['nuggets', 'captures', 'tasks']) {
    column(table, 'folder_id text')
    db.exec(`create index if not exists ${table}_by_folder on ${table}(folder_id)`)
  }
  column('note_groups', 'starred integer not null default 0')
  column('note_groups', 'archived_at text')
  // Each change the one-time move made, so it can be undone: a thing's old group and order, a folder's old list and
  // parent (and its whole row, when it was merged into another of the same name), the lists' old order.
  db.exec('create table if not exists folder_move (thing text not null, what text not null, was text not null)')
}

/** Every folder, in the tree's own order, each with what it holds counted by kind. */
export function listFolders(): Folder[] {
  const db = database()
  const rows = db.prepare(`select g.id, g.name, g.icon, g.color, g.parent_id as parent, g.starred, g.archived_at is not null as archived,
      coalesce(o.position, 1e12) as at, g.created_at as made from note_groups g left join note_order o on o.list = '${LIST}' and o.id = 'g:' || g.id
      where g.list = '${LIST}' order by at, made`).all() as (Omit<Folder, 'pages' | 'gems' | 'notes' | 'tasks' | 'hidden'> & { at: number; made: string })[]
  const counts = new Map<string, { pages: number; gems: number; notes: number; tasks: number; hidden: number }>()
  const tally = (id: string): { pages: number; gems: number; notes: number; tasks: number; hidden: number } => {
    let one = counts.get(id)
    if (!one) counts.set(id, (one = { pages: 0, gems: 0, notes: 0, tasks: 0, hidden: 0 }))
    return one
  }
  for (const row of db.prepare(`select folder_id as id, tier, archived_at is not null as archived, count(*) as n from nuggets
      where folder_id is not null and binned_at is null and superseded_by is null group by 1, 2, 3`).all() as { id: string; tier: string; archived: number; n: number }[]) {
    const one = tally(row.id)
    if (row.archived) one.hidden += row.n
    else if (row.tier === 'article') one.pages += row.n
    else one.gems += row.n
  }
  for (const row of db.prepare(`select folder_id as id, archived_at is not null as archived, count(*) as n from captures
      where folder_id is not null and status != 'discarded' group by 1, 2`).all() as { id: string; archived: number; n: number }[]) {
    const one = tally(row.id)
    if (row.archived) one.hidden += row.n
    else one.notes += row.n
  }
  for (const row of db.prepare("select folder_id as id, count(*) as n from tasks where folder_id is not null and status != 'dropped' group by 1").all() as { id: string; n: number }[])
    tally(row.id).tasks += row.n
  return rows.map(({ at: _at, made: _made, ...row }) => ({ ...row, ...(counts.get(row.id) ?? { pages: 0, gems: 0, notes: 0, tasks: 0, hidden: 0 }) }))
}

/** What a folder holds itself (not its folders'), newest first: archived ones too, said so, for "Show archived". */
export function folderItems(id: string): { type: Kind; id: string; title: string; at: string; archived: number }[] {
  const db = database()
  // "Not in a folder": the pages and gems made straight in Writing or Gems, a view, not a folder.
  if (id === 'unfiled')
    return db.prepare(`select case when tier = 'article' then 'article' else 'nugget' end as type, id, case when trim(title) = '' then substr(body, 1, 4000) else title end as title, coalesce(updated_at, created_at) as at, 0 as archived
      from nuggets where folder_id is null and tier in ('article', 'nugget') and binned_at is null and archived_at is null and superseded_by is null
      order by coalesce(updated_at, created_at) desc`).all().map((one) => ({ ...(one as { type: Kind; id: string; title: string; at: string; archived: number }), title: lineOf((one as { title: string }).title) }))
  const kept = db.prepare(`select case when tier = 'article' then 'article' when tier = 'question' then 'question' else 'nugget' end as type, id,
      case when trim(title) = '' then substr(body, 1, 4000) else title end as title, coalesce(updated_at, created_at) as at, archived_at is not null as archived from nuggets
      where folder_id = ? and binned_at is null and superseded_by is null`).all(id)
  const notes = db.prepare(`select 'capture' as type, id, case when trim(title) = '' then substr(body, 1, 4000) else title end as title, coalesce(edited_at, captured_at) as at, archived_at is not null as archived from captures
      where folder_id = ? and status != 'discarded'`).all(id)
  const tasks = db.prepare(`select 'task' as type, id, title, coalesce(completed_at, created_at) as at, 0 as archived from tasks
      where folder_id = ? and status != 'dropped'`).all(id)
  return ([...kept, ...notes, ...tasks] as { type: Kind; id: string; title: string; at: string; archived: number }[]).map((one) => ({ ...one, title: lineOf(one.title) })).sort((a, b) => (a.at < b.at ? 1 : -1))
}

/** Pages and gems in no folder, out of the Bin and in sight: the sidebar's "Not in a folder". */
export function unfiledCount(): number {
  return (database().prepare("select count(*) as n from nuggets where folder_id is null and tier in ('article', 'nugget') and binned_at is null and archived_at is null and superseded_by is null").get() as { n: number }).n
}

/** A new folder, in `parent` or at the top, at the end of what holds it. Made by a person, it starts starred. */
export function makeFolder(name: string, parent: string | null = null, starred = true): string {
  const db = database()
  const id = randomUUID()
  atomically(() => {
    db.prepare(`insert into note_groups (id, list, name, parent_id, folder, starred, created_at) values (?, '${LIST}', ?, ?, 1, ?, ?)`).run(id, name.trim() || 'New folder', parent, starred ? 1 : 0, now())
    const end = db.prepare(`select max(position) as at from note_order where list = '${LIST}'`).get() as { at: number | null }
    db.prepare(`insert or replace into note_order (list, id, position) values ('${LIST}', ?, ?)`).run('g:' + id, (end.at ?? -1) + 1)
  })
  changed()
  return id
}

/** Things put in a folder (null: in none), each; gives back where each was, for Undo (`unfile`). */
export function fileThings(things: Thing[], folder: string | null): Was[] {
  const db = database()
  const was: Was[] = []
  atomically(() => {
    for (const thing of things) {
      const table = tableOf(thing.type)
      const row = db.prepare(`select folder_id as folder${table === 'captures' ? ', status' : ''} from ${table} where id = ?`).get(thing.id) as { folder: string | null; status?: string } | undefined
      if (!row) continue
      was.push({ ...thing, folder: row.folder, ...(row.status !== undefined ? { status: row.status } : {}) })
      db.prepare(`update ${table} set folder_id = ? where id = ?`).run(folder, thing.id)
      // Out of the Inbox once it has a place; back in it when it has none.
      if (table === 'captures') db.prepare(`update captures set status = ? where id = ? and status = ?`).run(folder ? 'filed' : 'open', thing.id, folder ? 'open' : 'filed')
      // An imported page moved into a folder is sorted: it has a place now.
      if (table === 'nuggets' && folder) db.prepare('update nuggets set unsorted = 0 where id = ?').run(thing.id)
    }
  })
  changed()
  return was
}

/** Each thing back where it was. */
export function unfile(was: Was[]): void {
  const db = database()
  atomically(() => {
    for (const one of was) {
      const table = tableOf(one.type)
      db.prepare(`update ${table} set folder_id = ? where id = ?`).run(one.folder, one.id)
      if (table === 'captures' && one.status) db.prepare('update captures set status = ? where id = ?').run(one.status, one.id)
    }
  })
  changed()
}

/**
 * The one-time move (19 Nov 2026): Writing's and Gems' folders become Folders, everything kept. A copy of the book is
 * made first and must succeed; then one transaction, every change written to folder_move. Two top-level folders of
 * the same name (Writing's Obsidian and Gems' Obsidian) become one. A group that sat in a folder moves to the top of
 * its list, its notes still in that folder. Says what it did, or why it did nothing.
 */
export async function moveFolders(copy: (to: string) => Promise<void> = (to) => copyBook(join(app.getPath('userData'), 'haligtree.db'), to)):
  Promise<{ moved: false; why: string } | { moved: true; folders: number; things: number; backup: string }> {
  const db = database()
  type Row = { id: string; list: string; name: string; parent: string | null; icon: string | null; color: string | null; folded: number; made: string; folder: number }
  const all = () => db.prepare('select id, list, name, parent_id as parent, icon, color, folded, created_at as made, folder from note_groups').all() as Row[]
  if (!all().some((one) => one.folder && one.list !== LIST)) return { moved: false, why: 'nothing to move' }
  const dir = join(backupDir(), 'database')
  const backup = join(dir, `haligtree-before-folders-${dayKey()}.db`)
  try {
    await mkdir(dir, { recursive: true })
    await copy(backup)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code ?? ''
    return { moved: false, why: code === 'ENOSPC' ? 'The backup failed: the disk is full' : code === 'EACCES' || code === 'EPERM' || code === 'EROFS' ? 'The backup failed: its folder can’t be written to' : `The backup failed: ${(error as Error)?.message ?? 'unknown'}` }
  }
  let folders = 0
  let things = 0
  atomically(() => {
    const rows = all()
    // Read again inside the transaction: another start could have moved them while the copy ran.
    const old = rows.filter((one) => one.folder && one.list !== LIST)
    if (!old.length) return
    const byId = new Map(rows.map((one) => [one.id, one]))
    const isOldFolder = (id: string | null): boolean => !!id && !!byId.get(id)?.folder && byId.get(id)!.list !== LIST
    const record = db.prepare('insert into folder_move (thing, what, was) values (?, ?, ?)')
    // The old order of Writing's and Gems' lists, whole: the move drops the folders' keys from them.
    const orders = db.prepare("select list, id, position from note_order where list in ('article', 'nugget')").all()
    record.run('order', 'order', JSON.stringify(orders))
    // Each folder's place in the sidebar as it was: Writing's first, then Gems', each in its list's order.
    const position = new Map((orders as { list: string; id: string; position: number }[]).map((one) => [`${one.list}:${one.id}`, one.position]))
    old.sort((a, b) => (a.list === b.list ? (position.get(`${a.list}:g:${a.id}`) ?? 1e12) - (position.get(`${b.list}:g:${b.id}`) ?? 1e12) || (a.made < b.made ? -1 : 1) : a.list === 'article' ? -1 : 1))
    // Merged by name at the top level: the first of a name is kept, the others' contents go into it.
    const into = new Map<string, string>()
    const kept = new Map<string, string>()
    for (const one of old) {
      if (one.parent && isOldFolder(one.parent)) continue
      const name = one.name.trim().toLowerCase()
      const first = kept.get(name)
      if (first) into.set(one.id, first)
      else kept.set(name, one.id)
    }
    const target = (id: string): string => into.get(id) ?? id
    let at = (db.prepare(`select max(position) as at from note_order where list = '${LIST}'`).get() as { at: number | null }).at ?? -1
    for (const one of old) {
      record.run('g:' + one.id, 'folder', JSON.stringify(one))
      if (into.has(one.id)) {
        db.prepare('update note_groups set parent_id = ? where parent_id = ?').run(into.get(one.id)!, one.id)
        db.prepare('delete from note_groups where id = ?').run(one.id)
        continue
      }
      // The user's own folders: starred, so the sidebar shows them as it did.
      db.prepare(`update note_groups set list = '${LIST}', starred = case when parent_id is null then 1 else starred end where id = ?`).run(one.id)
      db.prepare(`insert or replace into note_order (list, id, position) values ('${LIST}', ?, ?)`).run('g:' + one.id, ++at)
      folders++
    }
    // The nearest folder a group sits in, through groups inside groups.
    const folderAbove = (id: string | null): string | null => {
      for (let at = id, steps = 0; at && steps < 12; at = byId.get(at)?.parent ?? null, steps++) if (isOldFolder(at)) return target(at)
      return null
    }
    const note = db.prepare("select id, group_id as 'group', group_order as 'order', folder_id as folder from nuggets where group_id = ?")
    const put = db.prepare('update nuggets set folder_id = ?, group_id = ?, group_order = ? where id = ?')
    for (const group of rows.filter((one) => one.list !== LIST)) {
      const home = folderAbove(group.id)
      if (!home) continue
      const isFolder = isOldFolder(group.id)
      for (const one of note.all(group.id) as { id: string; group: string | null; order: number | null; folder: string | null }[]) {
        record.run(one.id, 'note', JSON.stringify(one))
        // A note right in a folder leaves its group column; one in a group keeps its group, and is filed in the folder.
        isFolder ? put.run(home, null, null, one.id) : put.run(home, one.group, one.order, one.id)
        things++
      }
      // A group right inside a folder goes to the top of its list.
      if (!isFolder && isOldFolder(group.parent)) {
        record.run('g:' + group.id, 'group', JSON.stringify({ parent: group.parent }))
        db.prepare('update note_groups set parent_id = null where id = ?').run(group.id)
      }
    }
    db.prepare(`delete from note_order where list in ('article', 'nugget') and id in (${old.map(() => '?').join(', ')})`).run(...old.map((one) => 'g:' + one.id))
    db.prepare("insert or replace into settings (key, value) values ('folderMove', ?)").run(JSON.stringify({ at: now(), folders, things, backup, told: false }))
  })
  changed()
  return { moved: true, folders, things, backup }
}

/** The move undone, everything back as it was before, from folder_move. */
export function unmoveFolders(): boolean {
  const db = database()
  const rows = db.prepare('select thing, what, was from folder_move order by rowid desc').all() as { thing: string; what: string; was: string }[]
  if (!rows.length) return false
  atomically(() => {
    for (const row of rows) {
      const was = JSON.parse(row.was)
      if (row.what === 'note') db.prepare('update nuggets set folder_id = ?, group_id = ?, group_order = ? where id = ?').run(was.folder, was.group, was.order, was.id)
      else if (row.what === 'group') db.prepare('update note_groups set parent_id = ? where id = ?').run(was.parent, row.thing.slice(2))
      else if (row.what === 'folder')
        db.prepare('insert or replace into note_groups (id, list, name, icon, color, folded, created_at, parent_id, folder, starred) values (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)')
          .run(was.id, was.list, was.name, was.icon, was.color, was.folded, was.made, was.parent)
      else if (row.what === 'order') {
        db.exec("delete from note_order where list in ('article', 'nugget')")
        const add = db.prepare('insert or ignore into note_order (list, id, position) values (?, ?, ?)')
        for (const one of was as { list: string; id: string; position: number }[]) add.run(one.list, one.id, one.position)
      }
    }
    for (const row of rows) if (row.what === 'folder') db.prepare(`delete from note_order where list = '${LIST}' and id = ?`).run(row.thing)
    db.exec('delete from folder_move')
    db.prepare("insert or replace into settings (key, value) values ('folderMove', ?)").run(JSON.stringify({ undone: now() }))
  })
  changed()
  return true
}

/** A folder an import named "Archive", to be offered once: archived things, in sight nowhere, instead of a place. */
export function offerArchive(id: string): void {
  const was = setting<string[]>('archiveOffers', [])
  database().prepare("insert or replace into settings (key, value) values ('archiveOffers', ?)").run(JSON.stringify([...was, id]))
}

export function registerFolders(): void {
  const db = database()
  folderColumns()
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`haligtree:${channel}`, (_event, ...args) => run(...(args as never[])))
  handle('folders', () => listFolders())
  handle('folders:items', (id: string) => folderItems(id))
  handle('folders:unfiled', () => unfiledCount())
  handle('folders:make', (name: string, parent: string | null = null) => makeFolder(name, parent))
  handle('folders:file', (things: Thing[], folder: string | null) => fileThings(things, folder))
  handle('folders:unfile', (was: Was[]) => unfile(was))
  // Where each of these things lives: its folder's id, for the quiet label on Writing's and Gems' rows.
  handle('folders:of', (type: 'nuggets' | 'captures' | 'tasks') =>
    Object.fromEntries((db.prepare(`select id, folder_id as folder from ${type === 'captures' ? 'captures' : type === 'tasks' ? 'tasks' : 'nuggets'} where folder_id is not null`).all() as { id: string; folder: string }[]).map((one) => [one.id, one.folder])))
  handle('folders:set', (id: string, patch: { name?: string; icon?: string | null; color?: string | null; starred?: boolean; archived?: boolean }) => {
    const fields = Object.entries({
      name: patch.name?.trim() || undefined, icon: patch.icon, color: patch.color,
      starred: patch.starred === undefined ? undefined : patch.starred ? 1 : 0,
      archived_at: patch.archived === undefined ? undefined : patch.archived ? now() : null
    }).filter(([, value]) => value !== undefined)
    if (!fields.length) return false
    db.prepare(`update note_groups set ${fields.map(([key]) => `${key} = ?`).join(', ')} where id = ? and list = '${LIST}'`).run(...fields.map(([, value]) => value as string | number | null), id)
    changed()
    return true
  })
  // A folder put in another (null: the top), refused deeper than folders go or inside itself.
  handle('folders:nest', (id: string, parent: string | null) => {
    const folders = listFolders()
    const parentOf = new Map(folders.map((one) => [one.id, one.parent]))
    const level = (at: string | null): number => (at ? 1 + level(parentOf.get(at) ?? null) : 0)
    const height = (at: string): number => 1 + Math.max(0, ...folders.filter((one) => one.parent === at).map((one) => height(one.id)))
    for (let at = parent; at; at = parentOf.get(at) ?? null) if (at === id) return 'A folder can’t go inside itself'
    if (level(parent) + height(id) > FOLDER_DEPTH) return `Folders go ${FOLDER_DEPTH} levels deep`
    db.prepare('update note_groups set parent_id = ? where id = ?').run(parent, id)
    changed()
    return true
  })
  // Gone, a folder: what it held, things and folders, moves up a level. Gives back what Undo needs.
  handle('folders:remove', (id: string) => {
    const row = db.prepare('select id, name, icon, color, parent_id as parent, starred, created_at as made from note_groups where id = ?').get(id) as Record<string, string | number | null> | undefined
    if (!row) return null
    const things = folderItems(id).map(({ type, id: one }) => ({ type, id: one }))
    const subs = (db.prepare('select id from note_groups where parent_id = ?').all(id) as { id: string }[]).map((one) => one.id)
    atomically(() => {
      for (const table of ['nuggets', 'captures', 'tasks']) db.prepare(`update ${table} set folder_id = ? where folder_id = ?`).run(row.parent, id)
      if (!row.parent) db.prepare("update captures set status = 'open' where status = 'filed' and folder_id is null").run()
      db.prepare('update note_groups set parent_id = ? where parent_id = ?').run(row.parent, id)
      db.prepare('delete from note_groups where id = ?').run(id)
    })
    changed()
    return { row, things, subs }
  })
  handle('folders:restore', (was: { row: Record<string, string | number | null>; things: Thing[]; subs: string[] }) => {
    const { id, name, icon, color, parent, starred, made } = was.row
    db.prepare(`insert or replace into note_groups (id, list, name, icon, color, parent_id, folder, starred, created_at) values (?, '${LIST}', ?, ?, ?, ?, 1, ?, ?)`).run(id, name, icon, color, parent, starred, made)
    for (const sub of was.subs) db.prepare('update note_groups set parent_id = ? where id = ?').run(id, sub)
    fileThings(was.things, id as string)
    return true
  })
  handle('folders:unmove', () => unmoveFolders())
  // Each import's "Archive" folder still to offer, with what it holds; taken off the list once said.
  handle('folders:offers', () => {
    const ids = setting<string[]>('archiveOffers', [])
    if (!ids.length) return []
    db.prepare("insert or replace into settings (key, value) values ('archiveOffers', '[]')").run()
    return listFolders().filter((one) => ids.includes(one.id)).map((one) => ({ id: one.id, name: one.name, n: one.pages + one.gems + one.notes + one.tasks }))
  })
  // Archived instead: what it holds archived, moved up into the folder that held it, and the folder gone. Undo
  // (`folders:unarchive`) puts it all back.
  handle('folders:archive-instead', (id: string) => {
    const things = folderItems(id).filter((one) => !one.archived).map(({ type, id: one }) => ({ type, id: one }))
    atomically(() => {
      for (const one of things) if (one.type !== 'task') db.prepare(`update ${tableOf(one.type)} set archived_at = ? where id = ?`).run(now(), one.id)
    })
    const row = db.prepare('select id, name, icon, color, parent_id as parent, starred, created_at as made from note_groups where id = ?').get(id) as Record<string, string | number | null> | undefined
    if (!row) return null
    atomically(() => {
      for (const table of ['nuggets', 'captures', 'tasks']) db.prepare(`update ${table} set folder_id = ? where folder_id = ?`).run(row.parent, id)
      db.prepare('update note_groups set parent_id = ? where parent_id = ?').run(row.parent, id)
      db.prepare('delete from note_groups where id = ?').run(id)
    })
    changed()
    return { row, things, subs: [] as string[] }
  })
  handle('folders:unarchive', (was: { row: Record<string, string | number | null>; things: Thing[]; subs: string[] }) => {
    atomically(() => {
      for (const one of was.things) if (one.type !== 'task') db.prepare(`update ${tableOf(one.type)} set archived_at = null where id = ?`).run(one.id)
    })
    const { id, name, icon, color, parent, starred, made } = was.row
    db.prepare(`insert or replace into note_groups (id, list, name, icon, color, parent_id, folder, starred, created_at) values (?, '${LIST}', ?, ?, ?, ?, 1, ?, ?)`).run(id, name, icon, color, parent, starred, made)
    fileThings(was.things, id as string)
    return true
  })
  // The move's notice, said once, on the first window that asks.
  // A move that could not be made says why, there, each start until it is made.
  let failed: string | null = null
  // Asked by the first window as it opens: answered once the move (its backup copy first) has run.
  const moving = moveFolders().then((done) => void (!done.moved && done.why !== 'nothing to move' && (failed = done.why)), (error) => void (failed = `The folders could not be moved: ${(error as Error)?.message}`))
  handle('folders:moved', async () => {
    await moving
    if (failed) return { failed }
    const said = setting<{ at?: string; folders?: number; things?: number; told?: boolean } | null>('folderMove', null)
    if (!said?.at || said.told) return null
    db.prepare("insert or replace into settings (key, value) values ('folderMove', ?)").run(JSON.stringify({ ...said, told: true }))
    return { folders: said.folders ?? 0, things: said.things ?? 0 }
  })
}
