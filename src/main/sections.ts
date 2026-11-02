import { atomically, database } from './captures'

/**
 * The headings made by hand in 0.4.0-beta.102 (note_sections) are groups now,
 * the panels a list had before groups became folders (groups.ts, folder = 0):
 * each heading becomes a group in the folder it was made in (or at the list's
 * top level), holding the same notes, which stay in that folder. Done once, on
 * start, after groups.ts has laid down its columns; the old table goes.
 */
export function registerSections(): void {
  const db = database()
  const had = db.prepare("select 1 from sqlite_master where type = 'table' and name = 'note_sections'").get()
  if (!had) return
  type Old = { id: string; list: string; folder: string | null; name: string; folded: number; createdAt: string }
  const old = db.prepare('select id, list, folder_id as folder, name, folded, created_at as createdAt from note_sections order by created_at').all() as Old[]
  const hasColumn = (db.prepare('pragma table_info(nuggets)').all() as { name: string }[]).some((one) => one.name === 'section_id')
  atomically(() => {
    for (const one of old) {
      const list = one.list === 'question' ? 'article' : one.list
      db.prepare('insert or ignore into note_groups (id, list, name, folded, parent_id, folder, created_at) values (?, ?, ?, ?, ?, 0, ?)').run(one.id, list, one.name, one.folded, one.folder, one.createdAt)
      // Only the notes still in its folder were in it (a note moved to another folder had left it).
      if (hasColumn) db.prepare("update nuggets set group_id = ? where section_id = ? and coalesce(group_id, '') = ?").run(one.id, one.id, one.folder ?? '')
    }
    if (hasColumn) db.exec('update nuggets set section_id = null')
    db.exec('drop table note_sections')
  })
}
