import { ipcMain, type BrowserWindow } from 'electron'
import { changed, database } from './captures'
import { LABEL } from './book-words'
import { write } from './write'
import { writeMarkdown } from './backup'
import { markdown } from './haligtree'
import { caps } from './understand'
import { meets } from './needs'
import { transcriptLines, type MeetingLine } from './meeting-doc'

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
/** As it was, for Undo; `heading`: the name its heading was given (a note named for itself), put back alone. */
type Was = { kind: 'capture' | 'task'; id: string; title: string; body: string | null; aliases: string | null; named: number; heading?: string }

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
  const row = db.prepare(`select number, title, body, named, aliases, ${LABEL} as name from captures where id = ?`).get(one.id) as { number: number; title: string; body: string | null; named: number; aliases: string | null; name: string } | undefined
  if (!row || row.name !== one.name) return null
  let aliases: string[] = []
  try { aliases = JSON.parse(row.aliases || '[]') as string[] } catch { /* none readable: started afresh */ }
  const also = JSON.stringify([...new Set([...aliases, one.name])])
  let heading: string | undefined
  if (row.named) {
    db.prepare('update captures set title = ?, aliases = ? where id = ?').run(one.to, also, one.id)
    // A note named for itself whose heading says that name (a meeting's): the heading says the new one too.
    const doc = JSON.parse(row.body || 'null') as Doc | null
    const head = doc?.content?.[0]
    if (doc && head?.type === 'heading' && headingWords(head) === one.name) {
      const named = { ...doc, content: [{ ...head, content: [text(one.to)] }, ...(doc.content ?? []).slice(1)] }
      db.prepare('update captures set body = ? where id = ?').run(JSON.stringify(named), one.id)
      void writeMarkdown(row.number, markdown(named))
      heading = one.to
    }
  } else {
    // Its first line stays, as the note's opening words: the short name is a title over it.
    const doc = (JSON.parse(row.body || 'null') as Doc | null) ?? { type: 'doc', content: [] }
    const content = (doc.content ?? []).map((block, at) => (at === 0 && block.type === 'heading' ? { type: 'paragraph', content: block.content } : block))
    const named = { ...doc, content: [{ type: 'heading', attrs: { level: 1 }, content: [text(one.to)] }, ...content] }
    db.prepare('update captures set body = ?, aliases = ? where id = ?').run(JSON.stringify(named), also, one.id)
    // Its Markdown copy at once, as a save writes it: no editor writes it for words put in from here.
    void writeMarkdown(row.number, markdown(named))
  }
  return { kind: 'capture', id: one.id, title: row.title, body: row.body, aliases: row.aliases, named: row.named, ...(heading ? { heading } : {}) }
}

function putBack(list: Was[]): void {
  const db = database()
  for (const one of list) {
    if (one.kind === 'task') db.prepare('update tasks set title = ?, notes = ? where id = ?').run(one.title, one.body, one.id)
    else if (one.named) {
      // A note named for itself (a meeting's): its name and heading go back, and whatever was written in it since stays.
      const now = db.prepare('select number, body from captures where id = ?').get(one.id) as { number: number; body: string | null } | undefined
      const doc = JSON.parse(now?.body || 'null') as Doc | null
      const head = doc?.content?.[0]
      const body = doc && head?.type === 'heading' && one.heading && headingWords(head) === one.heading ? { ...doc, content: [{ ...head, content: [text(one.title)] }, ...(doc.content ?? []).slice(1)] } : null
      db.prepare('update captures set title = ?, aliases = ?, body = coalesce(?, body) where id = ?').run(one.title, one.aliases, body && JSON.stringify(body), one.id)
      if (now && body) void writeMarkdown(now.number, markdown(body))
    } else {
      db.prepare('update captures set title = ?, body = ?, aliases = ?, named = ? where id = ?').run(one.title, one.body, one.aliases, one.named, one.id)
      const number = (db.prepare('select number from captures where id = ?').get(one.id) as { number: number } | undefined)?.number
      if (number !== undefined && one.body) void writeMarkdown(number, markdown(JSON.parse(one.body)))
    }
  }
  changed()
}

const headingWords = (block: { content?: unknown[] }): string => (block.content ?? []).map((one) => (one as { text?: string }).text ?? '').join('')

// ---- Recordings named by what was said (the user, 20 Nov: "Recording, 8 Nov at 15:28" says nothing; "Pricing call
// with Sam · 8 Nov 15:28" does, its day and time kept after a dot so they stay findable and in order).

const day = (at: Date): string => at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const clock = (at: Date): string => `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`
/** A recording's own name as it is kept (meeting.ts): "Recording, 8 Nov at 15:28". */
export const recordingName = (startedAt: string): string => `Recording, ${day(new Date(startedAt))} at ${clock(new Date(startedAt))}`
/** Its name by what was said: "Pricing call with Sam · 8 Nov 15:28". */
const saidName = (topic: string, startedAt: string): string => `${topic} · ${day(new Date(startedAt))} ${clock(new Date(startedAt))}`

/** The first minutes of a recording are what it is named from. */
const FIRST_SECONDS = 180
type Recorded = { id: string; name: string; at: string; event: string; said: string }

/**
 * A meeting note still under the name it was kept with (its event's title, or "Recording, …"), and what was said in
 * its first minutes. Null for one renamed since, by hand or in its heading: a name the person gave is theirs.
 */
function recorded(id: string): Recorded | null {
  const row = database().prepare(`select body, private, ${LABEL} as name from captures where id = ? and source = 'Meeting' and status != 'discarded'`).get(id) as { body: string | null; private: number; name: string } | undefined
  if (!row || row.private) return null
  let doc: Doc | null = null
  try { doc = JSON.parse(row.body || 'null') as Doc | null } catch { return null }
  const meeting = doc?.content?.find((block) => block.type === 'meeting')
  const at = String(meeting?.attrs?.startedAt ?? '')
  if (!meeting || !at || Number.isNaN(Date.parse(at))) return null
  const event = String((meeting.attrs?.event as { title?: string } | null)?.title ?? '').trim()
  const kept = event || recordingName(at)
  const head = doc?.content?.[0]
  if (row.name !== kept || (head?.type === 'heading' && headingWords(head) !== kept)) return null
  const lines = ((meeting.attrs?.lines ?? []) as MeetingLine[]).filter((one) => one.at < FIRST_SECONDS)
  return { id, name: kept, at, event, said: transcriptLines(lines).join('\n') }
}

/** Its topic: the event's title where it came from one, else Apple Intelligence's reading of its first minutes. */
async function topicOf(one: Recorded): Promise<string | null> {
  if (one.event) return one.event
  if (!one.said.trim()) return null
  const said = await write(
    'You name a recorded conversation from the start of its transcript, the way a person names a meeting in their calendar: what it was about and, when a name is said, with whom ("Pricing call with Sam", "Launch plan stand-up"). Two to six words, in the transcript\'s own language. Never the words "recording", "transcript" or "conversation". Answer with the name alone: no quotes, no full stop, nothing else.',
    one.said.slice(0, 1500), `${one.said.replace(/^\[[^\]]*\][^:]*:\s*/, '').split(/\s+/).slice(0, 3).join(' ').replace(/[,.;:!?]+$/, '')} (a stand-in topic)`)
  if ('error' in said) return null
  const first = said.text.split('\n').find((line) => line.trim()) ?? ''
  const topic = first.replace(/^["“'‘]+|["”'’.]+$/g, '').replace(/\s*·\s*/g, ' - ').trim()
  return topic && topic.length <= 60 && !/^recording\b/i.test(topic) ? topic : null
}

/** A rename the app made, told to the main window: its name rolls in, and (unless quiet) a notice offers Undo. */
const told = (renamed: { id: string; from: string; to: string; was: Was[]; quiet?: boolean; fromEvent?: boolean }): void => {
  const win = home()
  if (win && !win.isDestroyed()) win.webContents.send('names:renamed', renamed)
}

/** On: Apple Intelligence on in Settings, on a Mac that has it. */
let aiOn: () => boolean = () => false
const canName = async (): Promise<boolean> => aiOn() && meets(await caps(), 'ai')
let home: () => BrowserWindow | null = () => null

/**
 * A recording just kept, named by what was said now its words are in: in the background, said in a quiet notice with
 * Undo, its old name kept as another name. A name typed meanwhile is never written over.
 */
export async function nameRecording(id: string): Promise<void> {
  if (!(await canName())) return
  const one = recorded(id)
  const topic = one && (await topicOf(one))
  if (!one || !topic) return
  // Looked at again: renamed while the model read it, it is the person's.
  if (recorded(id)?.name !== one.name) return
  const to = saidName(topic, one.at)
  const was = rename({ kind: 'capture', id, name: one.name, to })
  if (!was) return
  // Told first, so its name rolls in as the lists read it again.
  told({ id, from: one.name, to, was: [was], fromEvent: !!one.event })
  changed()
}

/** The meeting notes still under the name they were kept with, newest first, for the backfill. */
/** Each with whether its name comes from its event (`fromEvent`), not from what was said. */
function recordingsToName(): (Long & { fromEvent: boolean })[] {
  // Only the ones that can still wear the name they were kept with: "Recording, …", or an event's (its title). The
  // rest (renamed by hand, or by this) are never opened and read.
  const ids = database().prepare(`select id from captures where source = 'Meeting' and status != 'discarded' and private = 0 and (${LABEL} like 'Recording, %' or body like '%"event":{%') order by captured_at desc limit 2000`).all() as { id: string }[]
  return ids.flatMap(({ id }) => {
    const one = recorded(id)
    return one && (one.said.trim() || one.event) ? [{ kind: 'capture' as const, id, name: one.name, fromEvent: !!one.event }] : []
  })
}

/** As each note or task is made, with "Name long notes for me" on: named in the background, its long name kept. */
let named: () => boolean = () => false
export function nameIfLong(kind: 'capture' | 'task', id: string): void {
  if (!named()) return
  const db = database()
  const row = (kind === 'task' ? db.prepare('select title as name from tasks where id = ?') : db.prepare(`select ${LABEL} as name, private from captures where id = ?`)).get(id) as { name: string; private?: number } | undefined
  if (!row?.name || row.private || !isLong(row.name)) return
  void askName(row.name).then((to) => {
    const was = to && rename({ kind, id, name: row.name, to })
    if (!to || !was) return
    told({ id, from: row.name, to, was: [was], quiet: true })
    changed()
  })
}

export function registerLongNames(on: () => boolean, ai: () => boolean, main: () => BrowserWindow | null): void {
  named = on
  aiOn = ai
  home = main
  // The backfill: none offered where Apple Intelligence is off or missing.
  ipcMain.handle('haligtree:names:recordings', async () => ((await canName()) ? recordingsToName() : []))
  ipcMain.handle('haligtree:names:recording', async (_event, id: unknown) => {
    const one = recorded(String(id ?? ''))
    const topic = one && (await topicOf(one))
    return one && topic ? saidName(topic, one.at) : null
  })
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
