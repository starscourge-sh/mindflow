import { ipcMain } from 'electron'
import { changed, database } from './captures'
import { LABEL } from './book-words'
import { write } from './write'

/**
 * Long names made short by Apple Intelligence on this Mac (the user, 17 Nov: "an option to auto rename long notes
 * automatically, include a backfill version ... keep OG name as an alias ... similar thing for tasks").
 *
 * A note keeps its long first line: the short name goes above it as the note's title, and the long one is also kept
 * as another name of the note (its aliases, which search and links read). A task's long words move to its
 * description, and the short name is its title. Every change is given back as it was before, for one Undo.
 *
 * Settings' "Name long notes for me" does this as each note or task is made; "Rename the long ones…" does the ones
 * already kept, after a preview. Under HALIGTREE_QA_CAPS=ai the stand-in in write.ts answers.
 */

/** Long: more than seven words, or past 56 characters, its #tags left out ("send shaun loom on a.i assisted jackhammer experience"). */
export const isLong = (name: string): boolean => {
  const words = name.replace(/(?<=^|\s)#[\p{L}\p{N}_/-]+/gu, ' ').replace(/\s+/g, ' ').trim()
  return words.split(' ').length > 7 || words.length > 56
}

export type Long = { kind: 'capture' | 'task'; id: string; name: string }
export type Renamed = Long & { to: string }
type Was = { kind: 'capture' | 'task'; id: string; title: string; body: string | null; aliases: string | null; named: number }

type Doc = { type: 'doc'; content?: { type: string; attrs?: Record<string, unknown>; content?: unknown[] }[] }
const text = (words: string): { type: 'text'; text: string } => ({ type: 'text', text: words })

/** What the model is shown: the long name, and the first words after it. */
const askName = async (name: string, more = ''): Promise<string | null> => {
  const said = await write(
    'You give a note a short title of two to five words, in its own language, saying what it is about, the way a person would name it. Answer with the title alone: no quotes, no full stop, nothing else.',
    `${name}\n${more}`.slice(0, 1500), `${name.replace(/(?<=^|\s)#\S+/g, '').trim().split(/\s+/).slice(0, 3).join(' ')} (a stand-in name)`)
  if ('error' in said) return null
  const first = said.text.split('\n').find((one) => one.trim()) ?? ''
  const short = first.replace(/^["“'‘]+|["”'’.]+$/g, '').trim()
  return short && short.length <= 60 && !isLong(short) && short.toLowerCase() !== name.toLowerCase() ? short : null
}

/** The long ones kept: open notes and open tasks, newest first, private notes left out. */
function longOnes(): Long[] {
  const db = database()
  const notes = (db.prepare(`select 'capture' as kind, id, ${LABEL} as name from captures where status not in ('discarded') and private = 0 order by captured_at desc limit 4000`).all() as Long[])
  const tasks = (db.prepare("select 'task' as kind, id, title as name from tasks where status = 'open' order by created_at desc limit 4000").all() as Long[])
  return [...notes, ...tasks].filter((one) => one.name && isLong(one.name))
}

function rename(one: Renamed): Was | null {
  const db = database()
  if (one.kind === 'task') {
    const row = db.prepare('select title, notes from tasks where id = ?').get(one.id) as { title: string; notes: string | null } | undefined
    if (!row || row.title !== one.name) return null
    // The long words open its description, above what it held.
    const notes = JSON.parse(row.notes || 'null') as Doc | null
    const kept = (notes?.content ?? []).filter((block) => block.content?.length)
    db.prepare('update tasks set title = ?, notes = ? where id = ?').run(one.to, JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [text(row.title)] }, ...kept] }), one.id)
    return { kind: 'task', id: one.id, title: row.title, body: row.notes, aliases: null, named: 0 }
  }
  const row = db.prepare(`select title, body, named, aliases, ${LABEL} as name from captures where id = ?`).get(one.id) as { title: string; body: string | null; named: number; aliases: string | null; name: string } | undefined
  if (!row || row.name !== one.name) return null
  let aliases: string[] = []
  try { aliases = JSON.parse(row.aliases || '[]') as string[] } catch { /* none readable: started afresh */ }
  const also = JSON.stringify([...new Set([...aliases, one.name])])
  if (row.named) db.prepare('update captures set title = ?, aliases = ? where id = ?').run(one.to, also, one.id)
  else {
    // Its first line stays, as the note's opening words: the short name is a title over it.
    const doc = (JSON.parse(row.body || 'null') as Doc | null) ?? { type: 'doc', content: [] }
    const content = (doc.content ?? []).map((block, at) => (at === 0 && block.type === 'heading' ? { type: 'paragraph', content: block.content } : block))
    db.prepare('update captures set body = ?, aliases = ? where id = ?').run(JSON.stringify({ ...doc, content: [{ type: 'heading', attrs: { level: 1 }, content: [text(one.to)] }, ...content] }), also, one.id)
  }
  return { kind: 'capture', id: one.id, title: row.title, body: row.body, aliases: row.aliases, named: row.named }
}

function putBack(list: Was[]): void {
  const db = database()
  for (const one of list) {
    if (one.kind === 'task') db.prepare('update tasks set title = ?, notes = ? where id = ?').run(one.title, one.body, one.id)
    else db.prepare('update captures set title = ?, body = ?, aliases = ?, named = ? where id = ?').run(one.title, one.body, one.aliases, one.named, one.id)
  }
  changed()
}

/** As each note or task is made, with "Name long notes for me" on: named in the background, its long name kept. */
let named: () => boolean = () => false
export function nameIfLong(kind: 'capture' | 'task', id: string): void {
  if (!named()) return
  const db = database()
  const row = (kind === 'task' ? db.prepare('select title as name from tasks where id = ?') : db.prepare(`select ${LABEL} as name, private from captures where id = ?`)).get(id) as { name: string; private?: number } | undefined
  if (!row?.name || row.private || !isLong(row.name)) return
  void askName(row.name).then((to) => {
    if (to && rename({ kind, id, name: row.name, to })) changed()
  })
}

export function registerLongNames(on: () => boolean): void {
  named = on
  ipcMain.handle('haligtree:names:long', () => longOnes())
  ipcMain.handle('haligtree:names:ask', (_event, name: unknown) => askName(String(name ?? '')))
  ipcMain.handle('haligtree:names:apply', (_event, list: unknown) => {
    const done = (Array.isArray(list) ? list : []).flatMap((one: Renamed) => {
      const was = one && typeof one.to === 'string' && one.to.trim() ? rename({ kind: one.kind === 'task' ? 'task' : 'capture', id: String(one.id), name: String(one.name), to: one.to.trim() }) : null
      return was ? [was] : []
    })
    if (done.length) changed()
    return done
  })
  ipcMain.handle('haligtree:names:undo', (_event, list: unknown) => putBack(Array.isArray(list) ? (list as Was[]) : []))
}
