import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { randomUUID } from 'crypto'

import { KINDS, LABEL, atomically, changed, database, like } from './captures'
import { NOTE_KEY } from './name'
import { writeMarkdown } from './backup'
import { markdown } from './haligtree'
import { renameLinks, resolveLinks, unresolveLinks } from './link-rename'
import { nameLineIn } from './blocks'

/**
 * A note's name is its first line, so it changes as you type. Once it has
 * rested a moment under a new name, every link to it in every note is written
 * again with that name (link-rename.ts), and the window that renamed it is
 * told how many, for one notice with one Undo.
 */
const REST = 2500
type Pending = { from: string; timer: ReturnType<typeof setTimeout>; sender?: WebContents }
const pending = new Map<string, Pending>()
type Undo = { table: 'captures' | 'nuggets'; id: string; before: string; after: string }
const undos = new Map<string, Undo[]>()

/** Where a link points: a capture's id alone, or `nugget:` / `article:` and an id. */
const partsOf = (link: string): { table: 'captures' | 'nuggets'; id: string } =>
  link.includes(':') ? { table: 'nuggets', id: link.slice(link.indexOf(':') + 1) } : { table: 'captures', id: link }

/** The name a note goes by now, '' when it is gone or in the Bin. */
function nameNow(link: string): string {
  const { table, id } = partsOf(link)
  const row = (table === 'captures'
    ? database().prepare(`select ${LABEL} as name from captures where id = ? and status != 'discarded'`).get(id)
    : database().prepare("select coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as name from nuggets where id = ? and binned_at is null").get(id)) as { name: string } | undefined
  return (row?.name ?? '').trim()
}

/** The way a link names a gem, an article or a question: its tier and id. */
export const linkOf = (table: 'captures' | 'nuggets', id: string): string => {
  if (table === 'captures') return id
  const tier = (database().prepare('select tier from nuggets where id = ?').get(id) as { tier: string } | undefined)?.tier
  return tier ? `${tier}:${id}` : id
}

/** A note was saved, and was called `before` until then: if its name changed, its links follow once it rests. */
export function watchName(link: string, before: string, sender?: WebContents): void {
  const was = pending.get(link)
  // Unchanged, but a note just made still answers links waiting for its name.
  if (!was && nameNow(link) === before.trim()) {
    if (!before.trim()) resolveWaiting(link)
    return
  }
  if (was) clearTimeout(was.timer)
  pending.set(link, { from: was?.from ?? before.trim(), sender: sender ?? was?.sender, timer: setTimeout(() => settle(link), REST) })
}

function settle(link: string): void {
  const was = pending.get(link)
  pending.delete(link)
  if (!was) return
  const to = nameNow(link)
  if (!to) return
  // Links typed to this name before the note had it now point at it.
  resolveWaiting(link)
  if (!was.from || to === was.from) return
  const { count, token } = rewrite(link, was.from, to)
  // Told to the window it was renamed in, or the one in front.
  const tell = was.sender && !was.sender.isDestroyed() ? was.sender : BrowserWindow.getFocusedWindow()?.webContents
  if (count) tell?.send('links:renamed', { token, count, from: was.from, to })
}

/** Every link to the note, in every note, renamed in one go. */
export function rewrite(link: string, from: string, to: string): { count: number; token: string } {
  const db = database()
  // Only bodies that could hold one are read: its id, or the old name (as JSON writes it, too).
  const wanted = [link, from, JSON.stringify(from).slice(1, -1)].map((text) => `%${like(text)}%`)
  const where = "(body like ? escape '\\' or body like ? escape '\\' or body like ? escape '\\')"
  const rows = [
    ...(db.prepare(`select 'captures' as tab, id, number, body from captures where ${where}`).all(...wanted) as { tab: 'captures'; id: string; number: number; body: string }[]),
    ...(db.prepare(`select 'nuggets' as tab, id, null as number, body from nuggets where ${where}`).all(...wanted) as { tab: 'nuggets'; id: string; number: null; body: string }[])
  ]
  let count = 0
  const done: Undo[] = []
  atomically(() => {
    for (const row of rows) {
      let body: unknown
      try {
        body = JSON.parse(row.body)
      } catch {
        body = row.body
      }
      const out = renameLinks(body, { ids: [link], from, to })
      if (!out.count) continue
      const after = JSON.stringify(out.body)
      db.prepare(`update ${row.tab} set body = ? where id = ?`).run(after, row.id)
      done.push({ table: row.tab, id: row.id, before: row.body, after })
      count += out.count
      if (row.tab === 'captures') void writeMarkdown(row.number, typeof out.body === 'string' ? out.body : markdown(out.body))
    }
  })
  const token = randomUUID()
  if (count) {
    undos.set(token, done)
    // A handful of Undos kept, the newest: a notice lasts seconds.
    for (const old of [...undos.keys()].slice(0, -20)) undos.delete(old)
    changed()
  }
  return { count, token }
}

/**
 * The names a link may call the note by: its name now, its other names, the aliases an import kept in its fields,
 * and for a note brought in from a vault its path there from any folder up, as Obsidian reads a link naming its
 * folder ("Archive/Twice page" for Archive/Twice page.md).
 */
function namesOf(link: string): string[] {
  const { table, id } = partsOf(link)
  const row = database().prepare(`select aliases, fields, source from ${table} where id = ?`).get(id) as { aliases: string | null; fields: string | null; source: string | null } | undefined
  const parts = row?.source && /\.md$/i.test(row.source) ? row.source.replace(/\.md$/i, '').split('/') : []
  const read = (text: string | null | undefined): unknown => {
    try {
      return JSON.parse(text ?? 'null')
    } catch {
      return null
    }
  }
  const listed = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(',') : []
  const fields = read(row?.fields) as { aliases?: unknown } | null
  return [nameNow(link), ...listed(read(row?.aliases)), ...listed(fields?.aliases), ...parts.slice(0, -1).map((_, at) => parts.slice(at).join('/'))].map((name) => name.trim()).filter(Boolean)
}

/**
 * A waiting link pointed at its note the way an editor points one (findCaptures in lib/capture-links.tsx): its id,
 * its short key and its kind. The book is the one place a waiting link is pointed, so a note open on it is shown
 * what is kept, never pointed again by its editor, and the two never differ.
 */
function pointedAs(link: string): Record<string, string> {
  const { table, id } = partsOf(link)
  if (table === 'nuggets') {
    const tier = link.slice(0, link.indexOf(':'))
    return { id: link, key: '', kind: tier === 'nugget' ? 'idea' : tier }
  }
  const row = database().prepare('select kind, number from captures where id = ?').get(id) as { kind: string | null; number: number | null } | undefined
  return { id: link, key: row?.number ? `${NOTE_KEY}-${row.number}` : '', kind: (KINDS as readonly string[]).includes(row?.kind ?? '') ? row!.kind! : 'note' }
}

/**
 * Notes made, renamed, or brought in by a later import: every link in every
 * note still waiting for one of their names (no id, drawn grey and dashed) is
 * given its note's id, so it turns solid and opens it. No Undo: nothing was
 * lost. The first note named wins, as the import's own links do.
 */
export function resolveWaiting(...links: string[]): number {
  const byName = new Map<string, string>()
  for (const link of links) for (const name of namesOf(link)) if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), link)
  if (!byName.size) return 0
  const db = database()
  // Only bodies that could hold one are read: a few names, by name (as Markdown
  // or JSON writes it); many, as an import brings, any body with a link by name.
  const names = [...new Set([...byName.keys()].flatMap((name) => [name, JSON.stringify(name).slice(1, -1)]))]
  const wanted = names.length <= 20 ? names.map((text) => `%${like(text)}%`) : ['%[[%', '%"noteLink"%', '%"noteEmbed"%']
  const where = `(${wanted.map(() => "body like ? escape '\\'").join(' or ')})`
  const rows = [
    ...(db.prepare(`select 'captures' as tab, id, number, body from captures where ${where}`).all(...wanted) as { tab: 'captures'; id: string; number: number; body: string }[]),
    ...(db.prepare(`select 'nuggets' as tab, id, null as number, body from nuggets where ${where}`).all(...wanted) as { tab: 'nuggets'; id: string; number: null; body: string }[])
  ]
  let count = 0
  atomically(() => {
    for (const row of rows) {
      let body: unknown
      try {
        body = JSON.parse(row.body)
      } catch {
        body = row.body
      }
      const out = resolveLinks(body, byName, pointedAs)
      if (!out.count) continue
      db.prepare(`update ${row.tab} set body = ? where id = ?`).run(JSON.stringify(out.body), row.id)
      count += out.count
      if (row.tab === 'captures') void writeMarkdown(row.number, typeof out.body === 'string' ? out.body : markdown(out.body))
    }
  })
  if (count) changed()
  return count
}

/** A note gone: every link pointed at it waits again for a note by its name (unresolveLinks). */
function forget(link: string): number {
  const db = database()
  const wanted = `%${like(link)}%`
  const rows = [
    ...(db.prepare("select 'captures' as tab, id, number, body from captures where body like ? escape '\\'").all(wanted) as { tab: 'captures'; id: string; number: number; body: string }[]),
    ...(db.prepare("select 'nuggets' as tab, id, null as number, body from nuggets where body like ? escape '\\'").all(wanted) as { tab: 'nuggets'; id: string; number: null; body: string }[])
  ]
  let count = 0
  atomically(() => {
    for (const row of rows) {
      let body: unknown
      try {
        body = JSON.parse(row.body)
      } catch {
        body = row.body
      }
      const out = unresolveLinks(body, link)
      if (!out.count) continue
      db.prepare(`update ${row.tab} set body = ? where id = ?`).run(typeof out.body === 'string' ? out.body : JSON.stringify(out.body), row.id)
      count += out.count
      if (row.tab === 'captures') void writeMarkdown(row.number, typeof out.body === 'string' ? out.body : markdown(out.body))
    }
  })
  return count
}

/**
 * The other way round: links inside notes just brought in that wait for a note
 * already here (one made by hand before the import) point at it. Every note's
 * name and aliases are read once, so this is for the end of an import, not a keystroke.
 */
export function resolveWithin(...links: string[]): number {
  if (!links.length) return 0
  const db = database()
  const byName = new Map<string, string>()
  const every = [
    ...(db.prepare("select id from captures where status != 'discarded'").all() as { id: string }[]).map((row) => linkOf('captures', row.id)),
    ...(db.prepare('select id from nuggets where binned_at is null').all() as { id: string }[]).map((row) => linkOf('nuggets', row.id))
  ]
  for (const link of every) for (const name of namesOf(link)) if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), link)
  const count = pointIn(links, byName)
  if (count) changed()
  return count
}

/** The waiting links in these notes whose names `byName` knows, pointed as an editor points one (pointedAs); how many. */
function pointIn(links: string[], byName: Map<string, string>): number {
  const db = database()
  let count = 0
  atomically(() => {
    for (const link of links) {
      const { table, id } = partsOf(link)
      const row = db.prepare(`select body${table === 'captures' ? ', number' : ''} from ${table} where id = ?`).get(id) as { body: string | null; number?: number } | undefined
      if (!row?.body) continue
      let body: unknown
      try {
        body = JSON.parse(row.body)
      } catch {
        body = row.body
      }
      const out = resolveLinks(body, byName, pointedAs)
      if (!out.count) continue
      db.prepare(`update ${table} set body = ? where id = ?`).run(JSON.stringify(out.body), id)
      count += out.count
      if (table === 'captures' && row.number) void writeMarkdown(row.number, typeof out.body === 'string' ? out.body : markdown(out.body))
    }
  })
  return count
}

export function registerRenames(): void {
  // A link made to one line of a note: that line is given its lasting name
  // where it lives, saved like any edit, and the name handed back.
  ipcMain.handle('haligtree:notes:anchor', (_event, link: string, index: number, text: string) => {
    const { table, id } = partsOf(String(link))
    const db = database()
    const row = db.prepare(`select body${table === 'captures' ? ', number' : ''} from ${table} where id = ?`).get(id) as { body: string | null; number?: number } | undefined
    let body: unknown
    try {
      body = JSON.parse(row?.body ?? 'null')
    } catch {
      return null
    }
    const named = nameLineIn(body, Number(index), String(text ?? ''))
    if (!named) return null
    if (named.body !== body) {
      db.prepare(`update ${table} set body = ? where id = ?`).run(JSON.stringify(named.body), id)
      if (table === 'captures' && row?.number) void writeMarkdown(row.number, markdown(named.body))
      changed({ kind: table === 'captures' ? 'capture' : 'item', id })
    }
    return named.id
  })
  // A page made by following a link to nothing, opened and left with nothing
  // but its name: not kept, as Obsidian keeps none. Anything written in it, a
  // tag, a picture, a second line, and it stays.
  ipcMain.handle('haligtree:ghost:drop', (_event, id: string, name: string) => {
    const db = database()
    const row = db.prepare(`select body, status, ${LABEL} as label from captures where id = ?`).get(String(id)) as { body: string | null; status: string; label: string } | undefined
    if (!row || row.status !== 'open') return false
    let body: { content?: { type?: string; content?: { text?: string }[] }[] } | null = null
    try {
      body = JSON.parse(row.body ?? 'null')
    } catch {
      return false
    }
    const blocks = (body?.content ?? []).filter((block) => (block.content ?? []).length || !['paragraph', 'heading'].includes(block.type ?? ''))
    const words = blocks.map((block) => (block.content ?? []).map((one) => one.text ?? '').join('')).join('\n').trim()
    const bare = blocks.length <= 1 && (!words || words === String(name).trim()) && blocks.every((block) => ['paragraph', 'heading'].includes(block.type ?? '') && (block.content ?? []).every((one) => one.text !== undefined))
    if (!bare) return false
    db.prepare('delete from captures where id = ?').run(String(id))
    // Its making pointed the links waiting for its name at it (resolveWaiting): they wait again, not point at nothing.
    forget(String(id))
    changed()
    return true
  })

  // A note a link brought in from a vault, taken back by the notice's Undo: gone again, its links waiting for its name
  // once more. The vault still holds it, so it is not the Bin's to keep.
  ipcMain.handle('haligtree:vault:unbring', (_event, link: string) => {
    const { table, id } = partsOf(String(link))
    const db = database()
    if (!db.prepare(`select 1 from ${table} where id = ? and source != ''`).get(id)) return false
    db.prepare(`delete from ${table} where id = ?`).run(id)
    forget(String(link))
    changed()
    return true
  })

  // A note open in an editor holds links waiting for notes that are here (read before the book pointed them, or never
  // pointed): pointed in the book, the one place a waiting link is pointed, each found by its editor as `[label, link]`
  // and checked here. The note is told of it either way, so an editor opened on words older than the book's catches up.
  ipcMain.handle('haligtree:links:point', (_event, note: unknown, found: unknown) => {
    if (typeof note !== 'string' || !note || !Array.isArray(found)) return 0
    const byName = new Map<string, string>()
    for (const pair of found)
      if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string' && namesOf(pair[1]).some((name) => name.toLowerCase() === pair[0].trim().toLowerCase()))
        byName.set(pair[0].trim().toLowerCase(), pair[1])
    const count = byName.size ? pointIn([note], byName) : 0
    const { table, id } = partsOf(note)
    changed({ kind: table === 'captures' ? 'capture' : 'item', id })
    return count
  })

  // Undo: each note put back as it was, unless it has been written since.
  ipcMain.handle('haligtree:links:rename:undo', (_event, token: string) => {
    const done = undos.get(String(token))
    undos.delete(String(token))
    if (!done) return 0
    const db = database()
    let back = 0
    atomically(() => {
      for (const one of done) back += Number(db.prepare(`update ${one.table} set body = ? where id = ? and body = ?`).run(one.before, one.id, one.after).changes)
    })
    if (back) changed()
    return back
  })
}
