import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

import { atomically, changed, database, setting } from './captures'

/**
 * Projects: where a task lives, as Todoist keeps them, apart from Folders (which keep notes, pages and gems). A project
 * is a row of note_groups with list 'projects', nested by parent_id, ordered in note_order under the same list; a
 * task's project is its own `project_id`. A group inside a project (a task dropped on a task, ⌘G) is a row with list
 * 'task-groups' whose parent is the project, and each task in one names it in `task_group`.
 *
 * The one-time move (22 Nov 2026): every task kept in a folder goes into a project of the folder's name, each change
 * written to project_move so "Put them back" (`unmoveProjects`) returns each task to its folder exactly.
 */

export const LIST = 'projects'
export const GROUPS = 'task-groups'
/** How deep projects go: a project and three levels inside it, as Todoist's. */
export const PROJECT_DEPTH = 4

export type Project = {
  id: string; name: string; icon: string | null; color: string | null; parent: string | null; starred: number; archived: number; folded: number
  /** Its own open tasks (not its projects'), out of the Bin. */
  open: number
}
export type TaskGroup = { id: string; name: string; project: string | null; folded: number }

const now = (): string => new Date().toISOString()

/** Laid down on every start, found already there after the first. */
export function projectColumns(): void {
  const db = database()
  for (const definition of ['project_id text', 'task_group text']) {
    try {
      db.exec(`alter table tasks add column ${definition}`)
    } catch {
      // Already there.
    }
  }
  db.exec('create index if not exists tasks_by_project on tasks(project_id)')
  // Each task the one-time move took out of a folder: where it was, and the project it went to (made: 1 when the move made it).
  db.exec('create table if not exists project_move (task text not null, folder text, project text not null, made integer not null default 0)')
}

export function listProjects(): Project[] {
  const db = database()
  const rows = db.prepare(`select g.id, g.name, g.icon, g.color, g.parent_id as parent, g.starred, g.archived_at is not null as archived, g.folded,
      coalesce(o.position, 1e12) as at, g.created_at as made from note_groups g left join note_order o on o.list = '${LIST}' and o.id = 'g:' || g.id
      where g.list = '${LIST}' order by at, made`).all() as (Omit<Project, 'open'> & { at: number; made: string })[]
  const open = new Map((db.prepare("select project_id as id, count(*) as n from tasks where project_id is not null and status = 'open' and held_at is null group by 1").all() as { id: string; n: number }[]).map((one) => [one.id, one.n]))
  return rows.map(({ at: _at, made: _made, ...row }) => ({ ...row, open: open.get(row.id) ?? 0 }))
}

/** A new project, in `parent` or at the top, at the end of what holds it; starred, so the sidebar shows it. */
export function makeProject(name: string, parent: string | null = null): string {
  const id = atomically(() => insertProject(name, parent))
  changed()
  return id
}

/** The row and its place, inside a transaction already open. */
function insertProject(name: string, parent: string | null, extra: { icon?: string | null; color?: string | null } = {}): string {
  const db = database()
  const id = randomUUID()
  db.prepare(`insert into note_groups (id, list, name, icon, color, parent_id, folder, starred, created_at) values (?, '${LIST}', ?, ?, ?, ?, 1, 1, ?)`).run(id, name.trim() || 'New project', extra.icon ?? null, extra.color ?? null, parent, now())
  const end = db.prepare(`select max(position) as at from note_order where list = '${LIST}'`).get() as { at: number | null }
  db.prepare(`insert or replace into note_order (list, id, position) values ('${LIST}', ?, ?)`).run('g:' + id, (end.at ?? -1) + 1)
  return id
}

/** Where a task was, for Undo: its project and its group. */
export type Was = { id: string; project: string | null; group: string | null }

/** Tasks put in a project (null: in none). Leaving a project leaves its group too. Gives back where each was. */
export function fileTasks(ids: string[], project: string | null): Was[] {
  const was = atomically(() => putTasks(ids, project))
  changed()
  return was
}

export function unfileTasks(was: Was[]): void {
  atomically(() => putBack(was))
  changed()
}

/** Inside a transaction already open. */
function putTasks(ids: string[], project: string | null): Was[] {
  const db = database()
  const was: Was[] = []
  for (const id of ids) {
    const row = db.prepare('select project_id as project, task_group as "group" from tasks where id = ?').get(id) as { project: string | null; group: string | null } | undefined
    if (!row) continue
    was.push({ id, ...row })
    if (row.project !== project) db.prepare('update tasks set project_id = ?, task_group = null where id = ?').run(project, id)
  }
  return was
}
function putBack(was: Was[]): void {
  const db = database()
  for (const one of was) db.prepare('update tasks set project_id = ?, task_group = ? where id = ?').run(one.project, one.group, one.id)
}

/**
 * The one-time move: each task kept in a folder, into a project of that folder's name (one already there of that
 * name, at the top, is used), with the folder's icon and colour; out of the folder. One transaction; each task
 * written to project_move. Done once: a setting says so, and "Put them back" leaves it undone until asked again.
 */
export function moveTasksToProjects(): { tasks: number; projects: number } | null {
  const db = database()
  if (setting<{ at?: string; undone?: string } | null>('projectMove', null)) return null
  const kept = db.prepare(`select t.id, t.folder_id as folder, g.name, g.icon, g.color from tasks t join note_groups g on g.id = t.folder_id where t.folder_id is not null`).all() as { id: string; folder: string; name: string; icon: string | null; color: string | null }[]
  let made = 0
  atomically(() => {
    const byName = new Map(listProjects().filter((one) => !one.parent).map((one) => [one.name.trim().toLowerCase(), one.id]))
    const record = db.prepare('insert into project_move (task, folder, project, made) values (?, ?, ?, ?)')
    const fresh = new Set<string>()
    for (const one of kept) {
      const name = one.name.trim().toLowerCase()
      let project = byName.get(name)
      if (!project) (project = insertProject(one.name, null, one)), byName.set(name, project), fresh.add(project), made++
      record.run(one.id, one.folder, project, fresh.has(project) ? 1 : 0)
      db.prepare('update tasks set project_id = ?, folder_id = null where id = ?').run(project, one.id)
    }
    db.prepare("insert or replace into settings (key, value) values ('projectMove', ?)").run(JSON.stringify({ at: now(), tasks: kept.length, projects: made, told: !kept.length }))
  })
  if (kept.length) changed()
  return { tasks: kept.length, projects: made }
}

/** The move undone: each task back in its folder, out of its project; the projects the move made, gone if empty. */
export function unmoveProjects(): number {
  const db = database()
  const rows = db.prepare('select task, folder, project, made from project_move').all() as { task: string; folder: string | null; project: string; made: number }[]
  if (!rows.length) return 0
  atomically(() => {
    for (const one of rows) db.prepare('update tasks set folder_id = ?, project_id = null, task_group = null where id = ? and project_id = ?').run(one.folder, one.task, one.project)
    for (const id of new Set(rows.filter((one) => one.made).map((one) => one.project)))
      if (!db.prepare('select 1 from tasks where project_id = ? limit 1').get(id) && !db.prepare('select 1 from note_groups where parent_id = ? limit 1').get(id)) {
        db.prepare('delete from note_groups where id = ?').run(id)
        db.prepare(`delete from note_order where list = '${LIST}' and id = ?`).run('g:' + id)
      }
    db.exec('delete from project_move')
    db.prepare("insert or replace into settings (key, value) values ('projectMove', ?)").run(JSON.stringify({ undone: now() }))
  })
  changed()
  return rows.length
}

export function registerProjects(): void {
  const db = database()
  projectColumns()
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`haligtree:${channel}`, (_event, ...args) => run(...(args as never[])))
  const moved = moveTasksToProjects()
  handle('projects', () => listProjects())
  handle('projects:make', (name: string, parent: string | null = null) => makeProject(name, parent))
  handle('projects:file', (ids: string[], project: string | null) => fileTasks(ids, project))
  handle('projects:unfile', (was: Was[]) => unfileTasks(was))
  handle('projects:set', (id: string, patch: { name?: string; icon?: string | null; color?: string | null; starred?: boolean; archived?: boolean; folded?: boolean }) => {
    const fields = Object.entries({
      name: patch.name?.trim() || undefined, icon: patch.icon, color: patch.color,
      starred: patch.starred === undefined ? undefined : patch.starred ? 1 : 0,
      folded: patch.folded === undefined ? undefined : patch.folded ? 1 : 0,
      archived_at: patch.archived === undefined ? undefined : patch.archived ? now() : null
    }).filter(([, value]) => value !== undefined)
    if (!fields.length) return false
    db.prepare(`update note_groups set ${fields.map(([key]) => `${key} = ?`).join(', ')} where id = ? and list in ('${LIST}', '${GROUPS}')`).run(...fields.map(([, value]) => value as string | number | null), id)
    changed()
    return true
  })
  const writeOrder = (ids: string[]): void => {
    db.prepare(`delete from note_order where list = '${LIST}'`).run()
    const add = db.prepare(`insert into note_order (list, id, position) values ('${LIST}', ?, ?)`)
    ids.forEach((one, at) => add.run('g:' + one, at))
  }
  // Dropped by another's edge: just before or after it, beside it in what holds that one. Gives back what Undo needs.
  handle('projects:place', (id: string, target: string, after: boolean) => {
    const all = listProjects()
    const me = all.find((one) => one.id === id)
    const by = all.find((one) => one.id === target)
    if (!me || !by || id === target) return null
    for (let at: string | null = by.parent; at; at = all.find((one) => one.id === at)?.parent ?? null) if (at === id) return null
    const was = { ids: all.map((one) => one.id), parent: me.parent }
    const ids = was.ids.filter((one) => one !== id)
    ids.splice(ids.indexOf(target) + (after ? 1 : 0), 0, id)
    atomically(() => (writeOrder(ids), db.prepare('update note_groups set parent_id = ? where id = ?').run(by.parent, id)))
    changed()
    return was
  })
  handle('projects:arrange', (id: string, was: { ids: string[]; parent: string | null }) => {
    atomically(() => (writeOrder(was.ids), db.prepare('update note_groups set parent_id = ? where id = ?').run(was.parent, id)))
    changed()
    return true
  })
  // Put in another (null: the top), refused inside itself or deeper than projects go.
  handle('projects:nest', (id: string, parent: string | null) => {
    const all = listProjects()
    const parentOf = new Map(all.map((one) => [one.id, one.parent]))
    const level = (at: string | null): number => (at ? 1 + level(parentOf.get(at) ?? null) : 0)
    const height = (at: string): number => 1 + Math.max(0, ...all.filter((one) => one.parent === at).map((one) => height(one.id)))
    for (let at = parent; at; at = parentOf.get(at) ?? null) if (at === id) return 'A project can’t go inside itself'
    if (level(parent) + height(id) > PROJECT_DEPTH) return `Projects go ${PROJECT_DEPTH} levels deep`
    db.prepare('update note_groups set parent_id = ? where id = ?').run(parent, id)
    changed()
    return true
  })
  // Deleted, a project: its tasks stay in Tasks, in the project that held it (or none); its projects move up a level.
  handle('projects:remove', (id: string) => {
    const row = db.prepare('select id, name, icon, color, parent_id as parent, starred, created_at as made from note_groups where id = ?').get(id) as Record<string, string | number | null> | undefined
    if (!row) return null
    const tasks = (db.prepare('select id from tasks where project_id = ?').all(id) as { id: string }[]).map((one) => one.id)
    const subs = (db.prepare(`select id from note_groups where parent_id = ? and list = '${LIST}'`).all(id) as { id: string }[]).map((one) => one.id)
    let was: Was[] = []
    atomically(() => {
      was = putTasks(tasks, row.parent as string | null)
      db.prepare(`update note_groups set parent_id = ? where parent_id = ? and list = '${LIST}'`).run(row.parent, id)
      db.prepare('delete from note_groups where id = ?').run(id)
    })
    changed()
    return { row, was, subs }
  })
  handle('projects:restore', (back: { row: Record<string, string | number | null>; was: Was[]; subs: string[] }) => {
    const { id, name, icon, color, parent, starred, made } = back.row
    atomically(() => {
      db.prepare(`insert or replace into note_groups (id, list, name, icon, color, parent_id, folder, starred, created_at) values (?, '${LIST}', ?, ?, ?, ?, 1, ?, ?)`).run(id, name, icon, color, parent, starred, made)
      for (const sub of back.subs) db.prepare('update note_groups set parent_id = ? where id = ?').run(id, sub)
      putBack(back.was)
    })
    changed()
    return true
  })
  // Groups inside a project: these tasks gathered under a new one (in the project of the first), named; Undo ungroups.
  handle('projects:groups', () => db.prepare(`select id, name, parent_id as project, folded from note_groups where list = '${GROUPS}' order by created_at`).all())
  handle('projects:group', (ids: string[], name: string) => {
    const project = (db.prepare('select project_id as project from tasks where id = ?').get(ids[0]) as { project: string | null } | undefined)?.project ?? null
    const id = randomUUID()
    const was: Was[] = []
    atomically(() => {
      db.prepare(`insert into note_groups (id, list, name, parent_id, folder, created_at) values (?, '${GROUPS}', ?, ?, 0, ?)`).run(id, name.trim() || 'New group', project, now())
      for (const one of ids) {
        const row = db.prepare('select project_id as project, task_group as "group" from tasks where id = ?').get(one) as { project: string | null; group: string | null } | undefined
        if (!row) continue
        was.push({ id: one, ...row })
        db.prepare('update tasks set project_id = ?, task_group = ? where id = ?').run(project, id, one)
      }
    })
    changed()
    return { id, was }
  })
  // Into a group already there (a task dropped on a task in a group): its project too. Undo is `projects:unfile`.
  handle('projects:join', (ids: string[], group: string) => {
    const project = (db.prepare(`select parent_id as project from note_groups where id = ? and list = '${GROUPS}'`).get(group) as { project: string | null } | undefined)?.project
    if (project === undefined) return []
    const was = atomically(() => {
      const before = putTasks(ids, project)
      for (const one of ids) db.prepare('update tasks set task_group = ? where id = ?').run(group, one)
      return before
    })
    changed()
    return was
  })
  // Out of their groups (⇧⌘G); a group left with nothing in it goes. Gives back what Undo needs.
  handle('projects:ungroup', (ids: string[]) => {
    const was: Was[] = []
    const gone: Record<string, string | number | null>[] = []
    atomically(() => {
      for (const one of ids) {
        const row = db.prepare('select project_id as project, task_group as "group" from tasks where id = ? and task_group is not null').get(one) as { project: string | null; group: string } | undefined
        if (!row) continue
        was.push({ id: one, ...row })
        db.prepare('update tasks set task_group = null where id = ?').run(one)
      }
      for (const group of new Set(was.map((one) => one.group)))
        if (group && !db.prepare('select 1 from tasks where task_group = ? limit 1').get(group)) {
          gone.push(db.prepare('select id, name, parent_id as parent, created_at as made from note_groups where id = ?').get(group) as Record<string, string | number | null>)
          db.prepare('delete from note_groups where id = ?').run(group)
        }
    })
    changed()
    return { was, gone }
  })
  handle('projects:regroup', (back: { was: Was[]; gone: Record<string, string | number | null>[] }) => {
    atomically(() => {
      for (const one of back.gone) db.prepare(`insert or replace into note_groups (id, list, name, parent_id, folder, created_at) values (?, '${GROUPS}', ?, ?, 0, ?)`).run(one.id, one.name, one.parent, one.made)
      putBack(back.was)
    })
    changed()
    return true
  })
  // The move's notice, said once, on the first window that asks.
  handle('projects:moved', () => {
    const said = setting<{ at?: string; tasks?: number; projects?: number; told?: boolean } | null>('projectMove', null)
    if (!moved || !said?.at || said.told) return null
    db.prepare("insert or replace into settings (key, value) values ('projectMove', ?)").run(JSON.stringify({ ...said, told: true }))
    return { tasks: said.tasks ?? 0, projects: said.projects ?? 0 }
  })
  handle('projects:unmove', () => unmoveProjects())
}
