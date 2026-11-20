import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

import { changed, database } from './captures'
import { caps, shaped } from './understand'
import { kindOf, saidBy } from './import'
import { cut } from './clip'
import { LIST } from './folders'

/**
 * What a folder offers out of its own notes, as the plan's 19 Nov sections ask (plan-folders-kinds-groups.md):
 *
 * - Gem suggestions: lines in its pages and notes worth keeping as gems. Read by the Mac's own model (Apple
 *   Intelligence, `shaped` in main/understand.ts) where it is on, else by the capture box's own word rules (`kindOf`: someone's words)
 *   and what the person highlighted; said which. Each line, once kept or let go, is never offered again, and the
 *   folder's quiet line is shown once (note_groups.gems_offered). Nothing is sent off the Mac.
 * - "Write from this folder": a new page in Writing, made beside the folder (it stays a folder), whose margin holds
 *   the folder's gems and highlights to quote from (nuggets.written_from; marginalia.tsx `FolderMargin`).
 */

type Node = { type?: string; text?: string; marks?: { type: string }[]; attrs?: { label?: string }; content?: Node[] }
export type GemIdea = { line: string; type: 'article' | 'capture'; id: string; title: string }
export type FolderQuote = { type: string; id: string; kind: string; label: string; medium: string | null; who: string | null }

const now = (): string => new Date().toISOString()

/** A stored body (a page's JSON, or Markdown words as a string) as its lines of words, and the words highlighted in it. */
export function linesOf(body: string | null): { lines: string[]; marked: string[] } {
  const lines: string[] = []
  const marked: string[] = []
  let doc: unknown
  try {
    doc = JSON.parse(body ?? 'null')
  } catch {
    doc = body
  }
  if (typeof doc === 'string') {
    for (const line of doc.split('\n')) {
      const text = line.replace(/^\s*(?:[-*>]|#{1,6}|\d+\.)\s+/, '').trim()
      if (text) lines.push(text)
      for (const one of line.matchAll(/==([^=]+)==/g)) marked.push(one[1].trim())
    }
    return { lines, marked }
  }
  const walk = (node: Node): void => {
    if (node.type === 'codeBlock') return
    if (node.content?.some((child) => child.text !== undefined)) {
      const text = node.content.map((child) => child.text ?? (child.type === 'noteLink' ? (child.attrs?.label ?? '') : child.type === 'hardBreak' ? '\n' : '')).join('')
      for (const line of text.split('\n')) if (line.trim()) lines.push(line.trim())
      let run = ''
      for (const child of [...node.content, {}]) {
        if (child.text !== undefined && child.marks?.some((mark) => mark.type === 'highlight')) run += child.text
        else if (run.trim()) (marked.push(run.trim()), (run = ''))
        else run = ''
      }
      return
    }
    for (const child of node.content ?? []) walk(child)
  }
  if (doc && typeof doc === 'object') walk(doc as Node)
  return { lines, marked }
}

/** A line fit to be a gem at all: a sentence or so, not a heading of two words or a whole paragraph of a page. */
const gemSized = (line: string): boolean => { const n = line.split(/\s+/).length; return n >= 5 && n <= 60 }
/** The same line however it was marked or spaced, for "already kept or let go". */
const keyOf = (line: string): string => line.toLowerCase().replace(/[“”"'’]/g, '').replace(/\s+/g, ' ').trim()

export function registerFolderGems(): void {
  const db = database()
  for (const definition of ['note_groups add column gems_offered integer not null default 0', 'nuggets add column written_from text']) {
    try {
      db.exec(`alter table ${definition}`)
    } catch {
      // Already there.
    }
  }
  // Each line of a folder offered as a gem and kept or let go: never offered again.
  db.exec('create table if not exists folder_gem_seen (folder_id text not null, line text not null, gem text, at text not null, primary key (folder_id, line))')
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`haligtree:${channel}`, (_event, ...args) => run(...(args as never[])))

  /** The lines a folder's pages and notes hold, each with its note, and those highlighted, never one offered before or a gem already. */
  const candidates = (folder: string): { all: GemIdea[]; ruled: GemIdea[] } => {
    const seen = new Set((db.prepare('select line from folder_gem_seen where folder_id = ?').all(folder) as { line: string }[]).map((row) => row.line))
    const gems = db.prepare("select title, passage from nuggets where tier in ('nugget', 'card') and binned_at is null").all() as { title: string | null; passage: string | null }[]
    for (const gem of gems) for (const said of [gem.title, gem.passage]) if (said) seen.add(keyOf(said))
    const notes = [
      ...(db.prepare("select 'article' as type, id, coalesce(nullif(trim(title), ''), 'Untitled') as title, body from nuggets where folder_id = ? and tier = 'article' and binned_at is null and archived_at is null").all(folder) as (Omit<GemIdea, 'line'> & { body: string | null })[]),
      ...(db.prepare("select 'capture' as type, id, label(title, body, named) as title, body from captures where folder_id = ? and status != 'discarded' and archived_at is null and kind != 'quote'").all(folder) as (Omit<GemIdea, 'line'> & { body: string | null })[])
    ]
    const all: GemIdea[] = []
    const ruled: GemIdea[] = []
    for (const note of notes) {
      const { lines, marked } = linesOf(note.body)
      const highlighted = new Set(marked.map(keyOf))
      for (const line of new Set([...lines, ...marked])) {
        const key = keyOf(line)
        if (seen.has(key) || !gemSized(line)) continue
        seen.add(key)
        const idea = { line: cut(line, 400), type: note.type, id: note.id, title: note.title }
        all.push(idea)
        // The capture box's own reading: someone's words (a quote), or what the person marked themselves.
        if (highlighted.has(key) || kindOf(line) === 'quote') ruled.push(idea)
      }
    }
    return { all, ruled }
  }

  // The folder's suggestions: read by the Mac's model where it is on, else by the word rules; `offered` once the
  // folder's line has been answered (seen or put away), so it is never shown again.
  handle('folders:gem-ideas', async (folder: string) => {
    const offered = !!(db.prepare(`select gems_offered from note_groups where id = ? and list = '${LIST}'`).get(folder) as { gems_offered: number } | undefined)?.gems_offered
    const { all, ruled } = candidates(folder)
    const have = process.env.HALIGTREE_QA_CAPS === 'ai' ? 'available' : (await caps()).ai
    if (have !== 'available' || !all.length) return { by: 'rules', lines: ruled, offered }
    const asked = all.slice(0, 80)
    const said = await shaped<{ lines: number[] }>(
      'You pick the lines in someone\'s notes most worth keeping as gems: a striking sentence, someone\'s words, an idea said well, a fact worth remembering. Pick none when none are worth it.',
      asked.map((idea, at) => `${at + 1}. ${idea.line}`).join('\n'),
      { type: 'object', properties: [{ name: 'lines', type: 'array', max: asked.length, description: 'The numbers of the lines picked; none when none are worth keeping', items: { type: 'int', min: 1, max: asked.length } }] },
      // The stand-in picks what the rules pick, so a test sees the same lines either way.
      () => ({ lines: asked.flatMap((idea, at) => (ruled.includes(idea) ? [at + 1] : [])) })
    )
    if ('error' in said || !Array.isArray(said.lines)) return { by: 'rules', lines: ruled, offered }
    const picked = new Set(said.lines.map((one) => Number(one) - 1))
    return { by: 'ai', lines: asked.filter((_, at) => picked.has(at)), offered }
  })
  // The folder's line answered: never shown again for it.
  handle('folders:gems-offered', (folder: string) => {
    db.prepare(`update note_groups set gems_offered = 1 where id = ? and list = '${LIST}'`).run(folder)
    return true
  })
  // ↵: the line kept as a gem, in the folder, with the note it came from as its passage's source. ⌫: let go.
  // Either way it is not offered again. Gives back the gem's id, for Undo.
  handle('folders:gem-idea', (folder: string, idea: GemIdea, keep: boolean) => {
    let gem: string | null = null
    if (keep) {
      gem = randomUUID()
      const from = idea.type === 'capture' ? (db.prepare('select attribution, medium from captures where id = ?').get(idea.id) as { attribution: string | null; medium: string | null } | undefined) : undefined
      db.prepare("insert into nuggets (id, capture_id, kind, title, body, attribution, medium, passage, folder_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        // Someone's words keep who said them ("- Will Durant"), as the capture box reads a quote's tail.
        .run(gem, idea.type === 'capture' ? idea.id : null, kindOf(idea.line) === 'quote' ? 'quote' : 'note', cut(idea.line, 160), JSON.stringify(idea.line), saidBy(idea.line).who || from?.attribution?.trim() || null, from?.medium?.trim() || (saidBy(idea.line).who ? null : idea.title), idea.line, folder, now(), now())
    }
    db.prepare('insert or replace into folder_gem_seen (folder_id, line, gem, at) values (?, ?, ?, ?)').run(folder, keyOf(idea.line), gem, now())
    changed()
    return gem
  })
  // Undo of either: offered again, and the gem it made gone.
  handle('folders:gem-idea-undo', (folder: string, line: string) => {
    const row = db.prepare('select gem from folder_gem_seen where folder_id = ? and line = ?').get(folder, keyOf(line)) as { gem: string | null } | undefined
    if (row?.gem) db.prepare("delete from nuggets where id = ? and tier = 'nugget'").run(row.gem)
    db.prepare('delete from folder_gem_seen where folder_id = ? and line = ?').run(folder, keyOf(line))
    changed()
    return true
  })

  // "Write from this folder": a new page in Writing, not in the folder (a folder is never itself a writing project),
  // its margin holding what the folder keeps to quote from.
  handle('folders:write-from', (folder: string) => {
    const named = (db.prepare(`select name from note_groups where id = ? and list = '${LIST}'`).get(folder) as { name: string } | undefined)?.name
    if (!named) return null
    const id = randomUUID()
    db.prepare("insert into nuggets (id, tier, kind, title, body, written_from, created_at, updated_at) values (?, 'article', 'note', ?, ?, ?, ?, ?)")
      .run(id, `On ${named}`, JSON.stringify(''), folder, now(), now())
    changed()
    return id
  })
  // A page's margin from its folder: the folder's gems, then the words highlighted in its notes, each with its note.
  handle('folders:quotes', (page: string) => {
    const folder = db.prepare(`select g.id, g.name from nuggets n join note_groups g on g.id = n.written_from and g.list = '${LIST}' where n.id = ?`).get(page) as { id: string; name: string } | undefined
    if (!folder) return null
    const gems = (db.prepare("select 'nugget' as type, id, kind, coalesce(nullif(trim(title), ''), '') as label, medium, attribution as who from nuggets where folder_id = ? and tier = 'nugget' and binned_at is null and archived_at is null and superseded_by is null order by created_at desc limit 40").all(folder.id) as FolderQuote[])
    const notes = [
      ...(db.prepare("select 'article' as type, id, coalesce(nullif(trim(title), ''), 'Untitled') as title, body from nuggets where folder_id = ? and tier = 'article' and binned_at is null and id != ?").all(folder.id, page) as { type: string; id: string; title: string; body: string | null }[]),
      ...(db.prepare("select 'capture' as type, id, label(title, body, named) as title, body from captures where folder_id = ? and status != 'discarded'").all(folder.id) as { type: string; id: string; title: string; body: string | null }[])
    ]
    const highlights: FolderQuote[] = notes.flatMap((note) => linesOf(note.body).marked.map((label, at) => ({ type: note.type, id: note.id, kind: `mark-${at}`, label, medium: note.title, who: null }))).slice(0, 40)
    return { folder, gems, highlights }
  })
}
