import { app, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { copyFile, mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { DatabaseSync } from 'node:sqlite'

import { LABEL, atomically, changed, database, setting } from './captures'
import { backupDir } from './backup'
import { copyBook } from './books'
import { dayKey } from './dates'
import { assetsDir } from './pictures'
import { pdfsToFind } from './find-files'

/**
 * Start fresh (22 Nov 2026): the person's book put away, nothing of theirs deleted, so they bring back only what they
 * choose. Run only when they hold its button in Settings; never at start.
 *
 * Put away (each written to fresh_away, so each comes back exactly as it was):
 *   every top-level folder goes inside one new folder "From Obsidian", and loose pages and gems into it too;
 *   every page, gem, card and deck archived (`archived_at`, which every Feed, Home, hint and Review reader leaves out);
 *   the notes filed in folders archived; the Inbox left as it is;
 *   every open task on hold (`held_at`, which Tasks leaves out) in one archived project "From before".
 * Deleted for good (test material): everything made from PDFs (highlights, ribbons, reading progress, the gems made
 * from highlights, the PDFs added with no note and their files), and every stat. A note holding a PDF is kept, and so is
 * its PDF: the person keeps every capture.
 * A whole copy of the book (and of each PDF file deleted) is made first, and nothing happens if it fails.
 */

export const AWAY = 'fresh_away'
const now = (): string => new Date().toISOString()
const TITLE = "coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body))"

/** Laid down by folders.ts on every start: Writing's rows read it. */
export const freshTable = (db: DatabaseSync): void =>
  db.exec(`create table if not exists ${AWAY} (kind text not null, id text not null, was text not null, at text not null, back_at text, primary key (kind, id))`)

/** The stats tables cleared, each with what a person would call it. Missing ones (an older book) are passed by. */
const STATS: { table: string; what: [string, string]; where?: string }[] = [
  { table: 'review_log', what: ['review in your history', 'reviews in your history'] },
  { table: 'sessions', what: ['focus session', 'focus sessions'], where: 'ended_at is not null' },
  { table: 'focus_breaks', what: ['focus break', 'focus breaks'] },
  { table: 'session_log', what: ['line of focus history', 'lines of focus history'] },
  { table: 'session_blocks', what: ['site kept off in a session', 'sites kept off in sessions'] },
  { table: 'word_days', what: ['day of words written', 'days of words written'] },
  { table: 'task_done', what: ['task finished, as counted', 'tasks finished, as counted'] },
  { table: 'feed_days', what: ['day of the Feed', 'days of the Feed'] },
  { table: 'feed_reacts', what: ['like in the Feed', 'likes in the Feed'] },
  { table: 'feed_reads', what: ['post read in the Feed', 'posts read in the Feed'] },
  { table: 'feed_polls', what: ['poll answered', 'polls answered'] },
  { table: 'feed_quiz', what: ['quiz answered', 'quizzes answered'] },
  { table: 'feed_restacks', what: ['restack', 'restacks'] },
  { table: 'feed_insights', what: ['insight card', 'insight cards'] },
  { table: 'hint_events', what: ['hint shown', 'hints shown'] },
  { table: 'reading_queue', what: ['thing in the reading queue', 'things in the reading queue'] },
  { table: 'note_opens', what: ['note in “Opened lately”', 'notes in “Opened lately”'] },
  { table: 'usage_counts', what: ['usage count', 'usage counts'] },
  { table: 'folder_use', what: ['folder pick remembered', 'folder picks remembered'] },
  { table: 'article_reads', what: ['article read, as counted', 'articles read, as counted'] },
  { table: 'media_opened', what: ['file opened, as counted', 'files opened, as counted'] },
  { table: 'media_place', what: ['place kept in a video', 'places kept in videos'] },
  { table: 'picture_looks', what: ['picture looked at, as counted', 'pictures looked at, as counted'] },
  { table: 'recall_scores', what: ['recall score', 'recall scores'] }
]

const has = (db: DatabaseSync, table: string): boolean => !!db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table)
const count = (db: DatabaseSync, sql: string, ...args: string[]): number => (db.prepare(sql).get(...args) as { n: number | null }).n ?? 0

const PDF_SRC = /^(haligtree|mindflow):\/\/assets\//
/** What the PDFs come to: the ones added with no note, deleted with their files; the ones a note holds, kept with it. */
function pdfPlan(db: DatabaseSync): { gone: string[]; stay: number } {
  const all = new Set(pdfsToFind(db).map((one) => one.id.slice(0, one.id.indexOf('|'))))
  const added = new Set(has(db, 'media_added') ? (db.prepare('select src from media_added where binned_at is null').all() as { src: string }[]).map((one) => one.src) : [])
  // In a note's words as well as added: kept, the note holds it.
  const held = new Set<string>()
  for (const row of db.prepare(`select body from captures where status != 'discarded' and body like '%"attachment"%' and body like '%.pdf%'
    union all select body from nuggets where binned_at is null and body like '%"attachment"%' and body like '%.pdf%'`).all() as { body: string | null }[])
    for (const src of [...all]) if (row.body?.includes(src)) held.add(src)
  const gone = [...all].filter((src) => added.has(src) && !held.has(src))
  return { gone, stay: all.size - gone.length }
}

/** The gems made from a PDF's highlights: deleted with them. */
const HIGHLIGHT_GEMS = "select gem_id from pdf_highlights where gem_id is not null and src like '%.pdf'"

export type Line = { key: string; n: number; words: string }
export type Plan = { away: Line[]; gone: Line[]; stay: number; backup: string; done: { at: string; backup: string } | null }

const line = (key: string, n: number, one: string, many: string, after: string): Line => ({ key, n, words: `${n === 1 ? one : many} ${after}` })

/** What Start fresh would do to this book now, each kind with its real count. */
export function freshPlan(): Plan {
  const db = database()
  freshTable(db)
  const live = 'binned_at is null and superseded_by is null and archived_at is null'
  const pdf = pdfPlan(db)
  const highlightGems = has(db, 'pdf_highlights') ? count(db, `select count(*) as n from nuggets where id in (${HIGHLIGHT_GEMS})`) : 0
  const away = [
    line('folders', count(db, "select count(*) as n from note_groups where list = 'folders' and parent_id is null and id != ?", setting<{ folder?: string } | null>('startFresh', null)?.folder ?? ''), 'folder', 'folders', 'moved inside “From Obsidian”, with what they hold'),
    line('loose', count(db, `select count(*) as n from nuggets where ${live} and folder_id is null and tier in ('article', 'nugget', 'question')`), 'page or gem in no folder', 'pages and gems in no folder', 'moved into “From Obsidian”'),
    line('pages', count(db, `select count(*) as n from nuggets where ${live} and tier = 'article'`), 'page', 'pages', 'put away'),
    line('gems', count(db, `select count(*) as n from nuggets where ${live} and tier in ('nugget', 'question')`), 'gem', 'gems', 'put away'),
    line('cards', count(db, `select count(*) as n from nuggets where ${live} and tier in ('card', 'deck')`), 'card', 'cards', 'put away, decks with them'),
    line('notes', count(db, "select count(*) as n from captures where status != 'discarded' and archived_at is null and folder_id is not null"), 'note filed in a folder', 'notes filed in folders', 'put away'),
    line('tasks', count(db, "select count(*) as n from tasks where status = 'open'"), 'open task', 'open tasks', 'moved into “From before”, on hold')
  ].filter((one) => one.n > 0)
  const gone = [
    line('highlights', has(db, 'pdf_highlights') ? count(db, 'select count(*) as n from pdf_highlights') : 0, 'highlight', 'highlights', 'deleted'),
    line('highlightGems', highlightGems, 'gem made from a PDF highlight', 'gems made from PDF highlights', 'deleted'),
    line('pdfs', pdf.gone.length, 'PDF added to the Library with no note', 'PDFs added to the Library with no note', 'deleted, with its file'),
    line('ribbons', has(db, 'ribbons') ? count(db, 'select count(*) as n from ribbons') : 0, 'ribbon', 'ribbons', 'deleted'),
    line('reading', has(db, 'pdf_reading') ? count(db, 'select count(*) as n from pdf_reading') : 0, 'book’s reading progress', 'books’ reading progress', 'deleted'),
    line('schedules', count(db, 'select count(*) as n from nuggets where state is not null or due_at is not null'), 'card schedule', 'card schedules', 'started over'),
    ...STATS.filter((one) => has(db, one.table)).map((one) => line(one.table, count(db, `select count(*) as n from ${one.table}${one.where ? ` where ${one.where}` : ''}`), one.what[0], one.what[1], 'deleted'))
  ].filter((one) => one.n > 0)
  const said = setting<{ at?: string; backup?: string } | null>('startFresh', null)
  return { away, gone, stay: pdf.stay, backup: join(backupDir(), `before start fresh ${dayKey()}`), done: said?.at && said.backup ? { at: said.at, backup: said.backup } : null }
}

export type Result = { done: false; why: string } | { done: true; away: number; gone: number; backup: string }

/** Start fresh, as the person held its button: the copy first, then one transaction, then the PDFs' files. */
export async function startFresh(copy: (to: string) => Promise<void> = (to) => copyBook(join(app.getPath('userData'), 'haligtree.db'), to)): Promise<Result> {
  const db = database()
  freshTable(db)
  const plan = pdfPlan(db)
  const store = assetsDir()
  const fileOf = (src: string): string => src.replace(PDF_SRC, '')
  const covers = has(db, 'pdf_covers') ? new Map((db.prepare('select src, file from pdf_covers').all() as { src: string; file: string }[]).map((one) => [one.src, one.file])) : new Map<string, string>()
  // The copy: the whole book, and every PDF file about to go, in one folder named for the day.
  let backup = join(backupDir(), `before start fresh ${dayKey()}`)
  if (existsSync(backup)) backup += ` ${new Date().toTimeString().slice(0, 5).replace(':', '.')}`
  try {
    await mkdir(join(backup, 'files'), { recursive: true })
    await copy(join(backup, 'haligtree.db'))
    for (const src of plan.gone) for (const file of [fileOf(src), covers.get(src)]) if (file && existsSync(join(store, file))) await copyFile(join(store, file), join(backup, 'files', file))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code ?? ''
    return { done: false, why: code === 'ENOSPC' ? 'The copy failed: the disk is full' : code === 'EACCES' || code === 'EPERM' || code === 'EROFS' ? 'The copy failed: its folder can’t be written to' : `The copy failed: ${(error as Error)?.message ?? 'unknown'}` }
  }
  const at = now()
  let away = 0
  let gone = 0
  atomically(() => {
    const record = db.prepare(`insert or replace into ${AWAY} (kind, id, was, at) values (?, ?, ?, ?)`)
    const said = setting<{ folder?: string; project?: string } | null>('startFresh', null)
    // "From Obsidian", at the top of Writing: the one an earlier run made, or a new one.
    let folder = said?.folder && db.prepare("select 1 from note_groups where id = ? and list = 'folders'").get(said.folder) ? said.folder : null
    const place = (list: string, id: string): void => {
      const end = db.prepare('select max(position) as at from note_order where list = ?').get(list) as { at: number | null }
      db.prepare('insert or replace into note_order (list, id, position) values (?, ?, ?)').run(list, 'g:' + id, (end.at ?? -1) + 1)
    }
    if (!folder) {
      folder = randomUUID()
      db.prepare("insert into note_groups (id, list, name, parent_id, folder, starred, created_at) values (?, 'folders', 'From Obsidian', null, 1, 1, ?)").run(folder, at)
      place('folders', folder)
    }
    for (const one of db.prepare("select id from note_groups where list = 'folders' and parent_id is null and id != ?").all(folder) as { id: string }[]) {
      record.run('folder', one.id, JSON.stringify({ parent: null }), at)
      db.prepare('update note_groups set parent_id = ? where id = ?').run(folder, one.id)
      away++
    }
    // Deleted first, so nothing about to go is put away: the gems made from PDF highlights.
    const dropped = has(db, 'pdf_highlights') ? (db.prepare(`select id from nuggets where id in (${HIGHLIGHT_GEMS})`).all() as { id: string }[]).map((one) => one.id) : []
    for (const id of dropped) (db.prepare('delete from nuggets where id = ?').run(id), db.prepare('delete from versions where item_id = ?').run(id))
    gone += dropped.length
    // Every page, gem, question, card and deck: archived, its pin and reminder kept for when it comes back; loose ones into
    // the folder. Earlier wordings (superseded) too, so nothing of the old book is left in sight anywhere; the pass lists
    // only the current ones.
    const things = db.prepare("select id, folder_id as folder, tier from nuggets where binned_at is null and archived_at is null and tier != 'goal'").all() as { id: string; folder: string | null; tier: string }[]
    const archive = (table: string): ReturnType<DatabaseSync['prepare']> =>
      db.prepare(`update ${table} set archived_at = ?, archived_was = json_object('pinned_at', pinned_at, 'remind_at', remind_at), pinned_at = null, remind_at = null where id = ?`)
    const putNugget = archive('nuggets')
    for (const one of things) {
      record.run('nugget', one.id, JSON.stringify({ folder: one.folder }), at)
      putNugget.run(at, one.id)
      if (!one.folder && ['article', 'nugget', 'question'].includes(one.tier)) db.prepare('update nuggets set folder_id = ? where id = ?').run(folder, one.id)
      away++
    }
    const putNote = archive('captures')
    for (const one of db.prepare("select id from captures where status != 'discarded' and archived_at is null and folder_id is not null").all() as { id: string }[]) {
      record.run('capture', one.id, '{}', at)
      putNote.run(at, one.id)
      away++
    }
    // Every open task: on hold, in "From before" (archived), where it was kept for when it comes back.
    const open = db.prepare("select id, project_id as project, task_group as 'group', held_at as held from tasks where status = 'open'").all() as { id: string; project: string | null; group: string | null; held: string | null }[]
    let project = said?.project && db.prepare("select 1 from note_groups where id = ? and list = 'projects'").get(said.project) ? said.project : null
    if (open.length && !project) {
      project = randomUUID()
      db.prepare("insert into note_groups (id, list, name, parent_id, folder, starred, created_at, archived_at) values (?, 'projects', 'From before', null, 1, 0, ?, ?)").run(project, at, at)
      place('projects', project)
    }
    for (const one of open) {
      record.run('task', one.id, JSON.stringify({ project: one.project, group: one.group, held: one.held }), at)
      db.prepare('update tasks set project_id = ?, task_group = null, held_at = coalesce(held_at, ?) where id = ?').run(project, at, one.id)
      away++
    }
    // Deleted for good: what PDFs made, and every stat.
    const wipe = (table: string, where = ''): void => void (has(db, table) && (gone += Number(db.prepare(`delete from ${table}${where ? ` where ${where}` : ''}`).run().changes)))
    for (const table of ['pdf_highlights', 'ribbons', 'pdf_reading', 'pdf_days']) wipe(table)
    for (const src of plan.gone) {
      for (const table of ['pdf_covers', 'pdf_titles', 'media_added', 'pdf_downloads', 'media_how']) if (has(db, table)) db.prepare(`delete from ${table} where src = ?`).run(src)
      gone++
    }
    for (const one of STATS) wipe(one.table, one.where)
    gone += Number(db.prepare('update nuggets set state = null, due_at = null, edited_since_review = 0 where state is not null or due_at is not null').run().changes)
    db.prepare("insert or replace into settings (key, value) values ('startFresh', ?)").run(JSON.stringify({ at, backup, folder, project }))
  })
  // The files last, once the book no longer names them: a copy of each is in the backup folder.
  for (const src of plan.gone) for (const file of [fileOf(src), covers.get(src)]) if (file) await rm(join(store, file), { force: true }).catch(() => undefined)
  changed()
  return { done: true, away, gone, backup }
}

/** `contents`: everything put away inside a folder, back in it, the folder left where it stands. */
export type Kind = 'folder' | 'contents' | 'page' | 'gem' | 'deck' | 'card' | 'note' | 'task'
export type Away = { kind: Kind; id: string; title: string; within: string | null }

/** Everything Start fresh put away and not yet brought back, by kind, for the Bring back pass. A deck is one row. */
export function awayList(): Away[] {
  const db = database()
  freshTable(db)
  const names = new Map((db.prepare("select id, name from note_groups where list = 'folders'").all() as { id: string; name: string }[]).map((one) => [one.id, one.name]))
  const folders = db.prepare(`select 'folder' as kind, g.id, g.name as title, null as within from ${AWAY} a join note_groups g on g.id = a.id where a.kind = 'folder' and a.back_at is null order by g.name collate nocase`).all() as Away[]
  const nuggets = db.prepare(`select case when n.tier = 'article' then 'page' when n.tier in ('card', 'deck') then 'card' else 'gem' end as kind, n.id, ${TITLE} as title, n.folder_id as within, n.deck
    from ${AWAY} a join nuggets n on n.id = a.id where a.kind = 'nugget' and a.back_at is null and n.archived_at is not null and n.binned_at is null and n.superseded_by is null order by n.created_at desc`).all() as (Away & { deck: string | null })[]
  const decks = new Map<string, number>()
  for (const one of nuggets) if (one.deck) decks.set(one.deck.split('::')[0].trim(), (decks.get(one.deck.split('::')[0].trim()) ?? 0) + 1)
  const notes = db.prepare(`select 'note' as kind, c.id, ${LABEL} as title, c.folder_id as within from ${AWAY} a join captures c on c.id = a.id where a.kind = 'capture' and a.back_at is null and c.archived_at is not null order by c.captured_at desc`).all() as Away[]
  const tasks = db.prepare(`select 'task' as kind, t.id, t.title, null as within from ${AWAY} a join tasks t on t.id = a.id where a.kind = 'task' and a.back_at is null and t.held_at is not null and t.status = 'open' order by t.created_at desc`).all() as Away[]
  const named = (one: Away): Away => ({ ...one, within: one.within ? names.get(one.within) ?? null : null })
  return [
    ...folders,
    ...nuggets.filter((one) => one.kind === 'page').map(named),
    ...nuggets.filter((one) => one.kind === 'gem').map(named),
    ...[...decks].map(([name, n]) => ({ kind: 'deck' as const, id: name, title: name, within: `${n} cards` })),
    ...nuggets.filter((one) => one.kind === 'card' && !one.deck).map(({ deck: _deck, ...one }) => one),
    ...notes.map(named),
    ...tasks
  ].map((one) => ({ kind: one.kind, id: one.id, title: one.title || 'Untitled', within: one.within }))
}

/** Back, one thing (a folder with all it holds, a deck with all its cards): what it was before Start fresh. Gives back how many came back. */
export function bringBack(kind: Kind, id: string): number {
  const db = database()
  let n = 0
  const at = now()
  atomically(() => {
    const unarchive = (table: 'nuggets' | 'captures', one: string): void => {
      const was = JSON.parse((db.prepare(`select archived_was as was from ${table} where id = ?`).get(one) as { was: string | null } | undefined)?.was ?? 'null') as { pinned_at?: string | null; remind_at?: string | null } | null
      n += Number(db.prepare(`update ${table} set archived_at = null, archived_was = null, pinned_at = coalesce(pinned_at, ?), remind_at = coalesce(remind_at, ?) where id = ?`).run(was?.pinned_at ?? null, was?.remind_at ?? null, one).changes)
    }
    const nugget = (one: string): void => {
      const row = db.prepare(`select was from ${AWAY} where kind = 'nugget' and id = ? and back_at is null`).get(one) as { was: string } | undefined
      if (!row) return
      const was = JSON.parse(row.was) as { folder: string | null }
      // A loose one goes back to the top of Writing; one in a folder stays in it.
      if (!was.folder) db.prepare('update nuggets set folder_id = null where id = ?').run(one)
      unarchive('nuggets', one)
      db.prepare(`update ${AWAY} set back_at = ? where kind = 'nugget' and id = ?`).run(at, one)
    }
    if (kind === 'folder' || kind === 'contents') {
      // The folder to the top of Writing, and everything put away inside it, at any depth, back in sight.
      const inside = (db.prepare("with recursive t(id) as (select ? union all select g.id from note_groups g join t on g.parent_id = t.id) select id from t").all(id) as { id: string }[]).map((one) => one.id)
      if (kind === 'folder') db.prepare('update note_groups set parent_id = null where id = ?').run(id)
      db.prepare(`update ${AWAY} set back_at = ? where kind = 'folder' and id in (${inside.map(() => '?').join(', ')})`).run(at, ...inside)
      const marks = inside.map(() => '?').join(', ')
      for (const one of db.prepare(`select id from nuggets where folder_id in (${marks}) and archived_at is not null`).all(...inside) as { id: string }[]) nugget(one.id)
      for (const one of db.prepare(`select c.id from captures c join ${AWAY} a on a.kind = 'capture' and a.id = c.id and a.back_at is null where c.folder_id in (${marks})`).all(...inside) as { id: string }[]) {
        unarchive('captures', one.id)
        db.prepare(`update ${AWAY} set back_at = ? where kind = 'capture' and id = ?`).run(at, one.id)
      }
      n += 1
    } else if (kind === 'deck') {
      for (const one of db.prepare("select id from nuggets where (deck = ? or deck like ? || '::%') and archived_at is not null").all(id, id) as { id: string }[]) nugget(one.id)
    } else if (kind === 'note') {
      unarchive('captures', id)
      db.prepare(`update ${AWAY} set back_at = ? where kind = 'capture' and id = ?`).run(at, id)
    } else if (kind === 'task') {
      const row = db.prepare(`select was from ${AWAY} where kind = 'task' and id = ? and back_at is null`).get(id) as { was: string } | undefined
      if (row) {
        const was = JSON.parse(row.was) as { project: string | null; group: string | null }
        n += Number(db.prepare('update tasks set held_at = null, project_id = ?, task_group = ? where id = ?').run(was.project, was.group, id).changes)
        db.prepare(`update ${AWAY} set back_at = ? where kind = 'task' and id = ?`).run(at, id)
      }
    } else nugget(id)
  })
  changed()
  return n
}

/** Brought back some other way (“Unarchive” on a page or gem, a task off hold in Later): its record says so, and a loose one leaves the folder. */
export function broughtBack(table: 'nuggets' | 'captures' | 'tasks', id: string): void {
  const db = database()
  freshTable(db)
  const kind = table === 'nuggets' ? 'nugget' : table === 'captures' ? 'capture' : 'task'
  const row = db.prepare(`select was from ${AWAY} where kind = ? and id = ? and back_at is null`).get(kind, id) as { was: string } | undefined
  if (!row) return
  const was = JSON.parse(row.was) as { folder?: string | null; project?: string | null; group?: string | null }
  if (table === 'nuggets' && was.folder === null) db.prepare('update nuggets set folder_id = null where id = ?').run(id)
  if (table === 'tasks') db.prepare('update tasks set project_id = ?, task_group = ? where id = ?').run(was.project ?? null, was.group ?? null, id)
  db.prepare(`update ${AWAY} set back_at = ? where kind = ? and id = ?`).run(now(), kind, id)
}

/** Put away again (Undo of a bring back): exactly the rows that one brought back. */
export function putBackAway(kind: Kind, id: string): void {
  const db = database()
  const settings = setting<{ folder?: string; project?: string } | null>('startFresh', null)
  const at = now()
  atomically(() => {
    const away = (table: 'nuggets' | 'captures', one: string): void =>
      void db.prepare(`update ${table} set archived_at = ?, archived_was = json_object('pinned_at', pinned_at, 'remind_at', remind_at), pinned_at = null, remind_at = null where id = ? and archived_at is null`).run(at, one)
    const nugget = (one: string): void => {
      const row = db.prepare(`select was from ${AWAY} where kind = 'nugget' and id = ?`).get(one) as { was: string } | undefined
      if (!row) return
      if ((JSON.parse(row.was) as { folder: string | null }).folder === null && settings?.folder) db.prepare('update nuggets set folder_id = ? where id = ? and folder_id is null').run(settings.folder, one)
      away('nuggets', one)
      db.prepare(`update ${AWAY} set back_at = null where kind = 'nugget' and id = ?`).run(one)
    }
    if (kind === 'folder' || kind === 'contents') {
      const inside = (db.prepare("with recursive t(id) as (select ? union all select g.id from note_groups g join t on g.parent_id = t.id) select id from t").all(id) as { id: string }[]).map((one) => one.id)
      const marks = inside.map(() => '?').join(', ')
      if (kind === 'folder' && settings?.folder) db.prepare('update note_groups set parent_id = ? where id = ?').run(settings.folder, id)
      db.prepare(`update ${AWAY} set back_at = null where kind = 'folder' and id in (${marks})`).run(...inside)
      for (const one of db.prepare(`select a.id from ${AWAY} a join nuggets n on n.id = a.id where a.kind = 'nugget' and n.folder_id in (${marks})`).all(...inside) as { id: string }[]) nugget(one.id)
      for (const one of db.prepare(`select a.id from ${AWAY} a join captures c on c.id = a.id where a.kind = 'capture' and c.folder_id in (${marks})`).all(...inside) as { id: string }[])
        (away('captures', one.id), db.prepare(`update ${AWAY} set back_at = null where kind = 'capture' and id = ?`).run(one.id))
    } else if (kind === 'deck') {
      for (const one of db.prepare("select id from nuggets where (deck = ? or deck like ? || '::%')").all(id, id) as { id: string }[]) nugget(one.id)
    } else if (kind === 'note') {
      away('captures', id)
      db.prepare(`update ${AWAY} set back_at = null where kind = 'capture' and id = ?`).run(id)
    } else if (kind === 'task') {
      db.prepare("update tasks set held_at = ?, project_id = ?, task_group = null where id = ? and status = 'open'").run(at, settings?.project ?? null, id)
      db.prepare(`update ${AWAY} set back_at = null where kind = 'task' and id = ?`).run(id)
    } else nugget(id)
  })
  changed()
}

export function registerStartFresh(): void {
  freshTable(database())
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`haligtree:${channel}`, (_event, ...args) => run(...(args as never[])))
  handle('fresh:plan', () => freshPlan())
  handle('fresh:run', () => startFresh())
  handle('fresh:away', () => awayList())
  handle('fresh:back', (kind: Kind, id: string) => bringBack(kind, id))
  // What a folder holds that Start fresh put away, at any depth: said on the folder's page, never an empty page.
  handle('fresh:away-in', (id: string) => {
    const db = database()
    freshTable(db)
    const inside = (db.prepare("with recursive t(id) as (select ? union all select g.id from note_groups g join t on g.parent_id = t.id) select id from t").all(String(id)) as { id: string }[]).map((one) => one.id)
    const marks = inside.map(() => '?').join(', ')
    const count = (sql: string): number => (db.prepare(sql).get(...inside) as { n: number }).n
    return {
      pages: count(`select count(*) as n from ${AWAY} a join nuggets n on n.id = a.id where a.kind = 'nugget' and a.back_at is null and n.archived_at is not null and n.tier = 'article' and n.folder_id in (${marks})`),
      gems: count(`select count(*) as n from ${AWAY} a join nuggets n on n.id = a.id where a.kind = 'nugget' and a.back_at is null and n.archived_at is not null and n.tier != 'article' and n.folder_id in (${marks})`),
      notes: count(`select count(*) as n from ${AWAY} a join captures c on c.id = a.id where a.kind = 'capture' and a.back_at is null and c.folder_id in (${marks})`)
    }
  })
  handle('fresh:unback', (kind: Kind, id: string) => putBackAway(kind, id))
}
