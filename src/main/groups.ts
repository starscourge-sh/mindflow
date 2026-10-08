import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

import { atomically, changed, database } from './captures'

/**
 * Groups in a kept list, the way a browser gathers tabs: a named run of
 * nuggets or articles that folds away under one row. A group belongs to one
 * list (`nugget` or `article`, the names your own order is kept under), and
 * each note in one says which, and where in it, on its own row.
 *
 * Where a group sits among the rest is your own order's: `g:` and its id is a
 * place in note_order like any note's, with its notes right after it, so a
 * list in your own order but drawn flat (grouped by kind, say) keeps them
 * together.
 *
 * Every channel here starts `vigil:`, so the preload passes it through.
 */

export type Group = { id: string; name: string; icon: string | null; color: string | null; folded: number; members: string[] }
/** A list as it should be: its top level in order (notes and `g:` groups), and each group's notes in order. */
export type Layout = { top: string[]; groups: Record<string, string[]>; make?: { id: string; name: string } }

const now = (): string => new Date().toISOString()
const KEY = 'g:'

export function registerGroups(): void {
  const db = database()
  const column = (name: string, definition: string): void => {
    try {
      db.exec(`alter table ${name} add column ${definition}`)
    } catch {
      // Already there.
    }
  }
  // Safe on every start, as every other change to the file is: made once,
  // then found already there.
  db.exec(`create table if not exists note_groups (
    id text primary key, list text not null, name text not null, icon text, color text,
    folded integer not null default 0, created_at text not null)`)
  column('nuggets', 'group_id text')
  column('nuggets', 'group_order real')
  db.exec('create index if not exists nuggets_by_group on nuggets(group_id, group_order)')

  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:${channel}`, (_event, ...args) => run(...(args as never[])))

  const members = (id: string): string[] =>
    (db.prepare('select id from nuggets where group_id = ? order by group_order, created_at').all(id) as { id: string }[]).map((row) => row.id)

  // The order, written out whole: each group's key with its notes after it.
  const writeOrder = (list: string, top: string[], groups: Record<string, string[]>): void => {
    db.prepare('delete from note_order where list = ?').run(list)
    const add = db.prepare('insert or ignore into note_order (list, id, position) values (?, ?, ?)')
    let at = 0
    for (const key of top) {
      add.run(list, key, at++)
      if (key.startsWith(KEY)) for (const id of groups[key.slice(KEY.length)] ?? []) add.run(list, id, at++)
    }
  }

  handle('groups', (list: string) =>
    (db.prepare('select id, name, icon, color, folded from note_groups where list = ? order by created_at').all(list) as Omit<Group, 'members'>[])
      .map((group) => ({ ...group, members: members(group.id) })))

  // A whole list's shape at once: what a drag, a new group or a step with the keys leaves.
  handle('groups:arrange', (list: string, layout: Layout) => {
    atomically(() => {
      if (layout.make) db.prepare('insert into note_groups (id, list, name, created_at) values (?, ?, ?, ?)').run(layout.make.id, list, layout.make.name, now())
      const placed = new Set<string>()
      const put = db.prepare('update nuggets set group_id = ?, group_order = ? where id = ?')
      for (const [group, ids] of Object.entries(layout.groups))
        ids.forEach((id, at) => (placed.add(id), put.run(group, at, id)))
      // Out of every group: whatever the layout has at its top level.
      for (const key of layout.top) if (!key.startsWith(KEY) && !placed.has(key)) put.run(null, null, key)
      writeOrder(list, layout.top, layout.groups)
      // A group left with nothing in it is gone: a group is its notes.
      db.exec(`delete from note_groups where not exists (select 1 from nuggets where nuggets.group_id = note_groups.id)`)
    })
    changed()
    return true
  })

  handle('groups:set', (id: string, patch: { name?: string; icon?: string | null; color?: string | null; folded?: boolean }) => {
    const fields = Object.entries({ name: patch.name?.trim() || undefined, icon: patch.icon, color: patch.color, folded: patch.folded === undefined ? undefined : patch.folded ? 1 : 0 })
      .filter(([, value]) => value !== undefined)
    if (!fields.length) return false
    db.prepare(`update note_groups set ${fields.map(([key]) => `${key} = ?`).join(', ')} where id = ?`).run(...fields.map(([, value]) => value as string | number | null), id)
    changed()
    return true
  })

  // Separate: the notes stay, where they were, and only the group goes. What
  // it was comes back, for Undo to put it together again.
  handle('groups:separate', (id: string) => {
    const group = db.prepare('select id, list, name, icon, color, folded, created_at as createdAt from note_groups where id = ?').get(id) as Record<string, string | number> | undefined
    if (!group) return null
    const ids = members(id)
    atomically(() => {
      db.prepare('update nuggets set group_id = null, group_order = null where group_id = ?').run(id)
      db.prepare('delete from note_order where list = ? and id = ?').run(group.list, KEY + id)
      db.prepare('delete from note_groups where id = ?').run(id)
    })
    changed()
    return { group, ids }
  })
  handle('groups:restore', (was: { group: Record<string, string | number>; ids: string[] }) => {
    const { id, list, name, icon, color, folded, createdAt } = was.group
    atomically(() => {
      db.prepare('insert or replace into note_groups (id, list, name, icon, color, folded, created_at) values (?, ?, ?, ?, ?, ?, ?)').run(id, list, name, icon, color, folded, createdAt)
      const put = db.prepare('update nuggets set group_id = ?, group_order = ? where id = ?')
      was.ids.forEach((one, at) => put.run(id, at, one))
      // Back where its first note is.
      const first = db.prepare('select position from note_order where list = ? and id = ?').get(list, was.ids[0]) as { position: number } | undefined
      if (first) db.prepare('insert or replace into note_order (list, id, position) values (?, ?, ?)').run(list, KEY + id, first.position - 0.5)
    })
    changed()
    return true
  })

  // A second group of copies of its notes, right after it, named so you can tell them apart.
  handle('groups:duplicate', (id: string) => {
    const group = db.prepare('select list, name, icon, color from note_groups where id = ?').get(id) as { list: string; name: string; icon: string | null; color: string | null } | undefined
    if (!group) return null
    const copy = randomUUID()
    const columns = (db.prepare('pragma table_info(nuggets)').all() as { name: string }[]).map((one) => one.name)
      .filter((name) => !['id', 'group_id', 'group_order', 'created_at', 'updated_at', 'pinned_at', 'remind_at', 'capture_id'].includes(name))
    const ids = members(id)
    atomically(() => {
      db.prepare('insert into note_groups (id, list, name, icon, color, created_at) values (?, ?, ?, ?, ?, ?)').run(copy, group.list, `${group.name} copy`, group.icon, group.color, now())
      const clone = db.prepare(`insert into nuggets (id, group_id, group_order, created_at, updated_at, ${columns.join(', ')})
        select ?, ?, ?, ?, ?, ${columns.join(', ')} from nuggets where id = ?`)
      const made = ids.map((one, at) => {
        const fresh = randomUUID()
        clone.run(fresh, copy, at, now(), now(), one)
        return fresh
      })
      // Right after the original in your own order.
      const order = (db.prepare('select id from note_order where list = ? order by position').all(group.list) as { id: string }[]).map((row) => row.id)
      const after = Math.max(order.indexOf(KEY + id), ...ids.map((one) => order.indexOf(one)))
      order.splice(after + 1, 0, KEY + copy, ...made)
      db.prepare('delete from note_order where list = ?').run(group.list)
      const add = db.prepare('insert or ignore into note_order (list, id, position) values (?, ?, ?)')
      order.forEach((one, at) => add.run(group.list, one, at))
    })
    changed()
    return copy
  })

  // Every web address its notes hold, once each, in the group's order.
  handle('groups:links', (id: string) => {
    const rows = db.prepare('select title, attribution, body, fields from nuggets where group_id = ? order by group_order').all(id) as { title: string; attribution: string | null; body: string | null; fields: string | null }[]
    const seen = new Set<string>()
    for (const row of rows)
      for (const found of `${row.attribution ?? ''} ${row.fields ?? ''} ${row.body ?? ''}`.matchAll(/https?:\/\/[^\s"'<>)\]\\]+/g))
        seen.add(found[0].replace(/[.,;:]+$/, ''))
    return [...seen]
  })

  // A new note at the end of the group, of the list's own tier.
  handle('groups:note', (id: string) => {
    const group = db.prepare('select list from note_groups where id = ?').get(id) as { list: string } | undefined
    if (!group) return null
    const fresh = randomUUID()
    const last = db.prepare('select max(group_order) as at from nuggets where group_id = ?').get(id) as { at: number | null }
    const tier = group.list === 'article' ? 'article' : 'nugget'
    atomically(() => {
      db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at, group_id, group_order) values (?, ?, 'note', ?, 'null', ?, ?, ?, ?)")
        .run(fresh, tier, tier === 'article' ? 'Untitled' : '', now(), now(), id, (last.at ?? -1) + 1)
      const end = db.prepare('select max(position) as at from note_order where list = ? and id in (select id from nuggets where group_id = ?)').get(group.list, id) as { at: number | null }
      if (end.at !== null) db.prepare('insert or replace into note_order (list, id, position) values (?, ?, ?)').run(group.list, fresh, end.at + 0.5)
    })
    changed()
    return fresh
  })
}
