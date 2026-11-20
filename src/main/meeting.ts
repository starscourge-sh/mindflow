import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, createReadStream, writeFileSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app, ipcMain, shell, systemPreferences } from 'electron'
import helper from '../../resources/meeting?asset&asarUnpack'
import { database, keepMeeting, setting } from './captures'
import { assetsDir } from './pictures'
import { caps, shaped, type Shape } from './understand'
import { meets } from './needs'
import { foundActions, writtenActions, type MeetingLine } from './meeting-doc'
import { readTake } from './meeting-take'
import { nameRecording, recordingName } from './long-names'
import { FEW_SECONDS, PCM_BYTES_A_SECOND, heardTwice, keptFor, linesFrom, offerWords, type Line } from './meeting-left'

/**
 * Record a whole meeting on this Mac: your microphone and the Mac's own sound (the others, in Teams or a browser) as
 * two tracks, the words live, who said what, then the meeting's own page. The work is done by a small program beside
 * the app (native/meeting.swift); this keeps the one meeting under way, tells the live card (windows/meeting.tsx)
 * what is heard, and keeps the meeting in the book when it stops. Nothing leaves the Mac.
 *
 * HALIGTREE_QA_MEETING (a probe's): `you.wav|others.wav|script.jsonl`, fed to the program's test mode in place of the
 * microphone and the Mac's sound. HALIGTREE_QA_MEETING_SCREEN=denied stands in a Mac that has not allowed it.
 * HALIGTREE_QA_MEETING_PROGRAM runs another program in its place (one that will not start), and
 * HALIGTREE_QA_MEETING_ROOM stands in how many bytes the disk has left.
 *
 * A crash loses seconds, not the recording: the program writes the sound and the words to the meeting's folder as they
 * come, and this writes down what only it knows (when it began, the event, the moments). A folder still here when the
 * app opens, or when the program dies under it, is offered in the main window (recording-left.tsx). The folders live in
 * the book's own data, so each is offered in the book it was recorded in.
 */
export type MeetingEvent = { title: string; start?: string; end?: string; people?: string[] }
export type { Line }
export type Live = {
  state: 'ready' | 'asking' | 'denied' | 'starting' | 'live' | 'paused' | 'saving' | 'saved' | 'failed' | 'too-old'
  /** Before the first recording: the line about letting people know. */
  first: boolean
  /** How words come: live as said (macOS 26 or SFSpeechRecognizer on this Mac), or none live. */
  words: 'analyzer' | 'recognizer' | 'test' | 'none' | null
  event: MeetingEvent | null
  seconds: number
  lines: Line[]
  moments: { at: number; line: string | null }[]
  message?: string
  /** The meeting kept: its note. */
  id?: string
  /** Where the sound comes from: one app's (its bundle id and name) or all of this Mac's (null), and the microphone. */
  from: { bundle: string | null; name: string | null; mic: boolean }
  /** The recording ended by itself and what it holds is safe: the card says so, not "nothing was recorded". */
  stopped?: boolean
  /** What the meeting program itself says it records now (a probe checks it is what was chosen). */
  recording?: { bundle: string | null; mic: boolean }
}
/** An app open now that can make sound, as "Sound from" lists it. */
export type SoundApp = { bundle: string; name: string }

type Shown = { send: (live: Live, level?: { you: number; others: number }) => void; open: () => void; close: () => void; openNote: (id: string) => void; leftChanged: () => void }
type Saved = { seconds: number; peaks: number[]; you: boolean; others: boolean; heard?: number; stopped?: string; quietMic?: boolean; micName?: string }
/** What only this side knows about a recording, written in its folder as it goes. */
type Noted = { startedAt: string; event: MeetingEvent | null; words: Live['words'] }
type Moment = Live['moments'][number]
/** A recording left behind, as its offer shows it. */
export type Left = { id: string; said: string }

const program = (): string => process.env.HALIGTREE_QA_MEETING_PROGRAM ?? helper
const meetingsDir = (): string => join(app.getPath('userData'), 'meetings')
/** Discarded, and still there for its Undo: gone when the app next opens. */
const discardedDir = (): string => join(meetingsDir(), '.discarded')

let child: ChildProcessWithoutNullStreams | null = null
let folder = ''
let live: Live = blank()
let shown: Shown | null = null
let startedAt = ''
let clock = { began: 0, pausedFor: 0, pausedAt: 0 }
/** The last of the words: the card shows a few; the rest are on disk as they settle, never one giant string. */
const SHOWN_LINES = 40
let settled: Line[] = []
let saved: Saved | null = null
/** The program said the disk has no room: the card says that is why it could not finish. */
let diskFull = false
let found: Record<string, unknown> | null = null
let take: Record<string, unknown> | null = null
let finished: (() => void) | null = null

function blank(): Live {
  // The last choice, remembered: the same app and microphone next time.
  const from = setting<{ bundle: string | null; name: string | null } | null>('meetingFrom', null)
  return { state: 'ready', first: !setting('meetingTold', false), words: null, event: null, seconds: 0, lines: [], moments: [], from: { bundle: from?.bundle ?? null, name: from?.name ?? null, mic: setting('meetingMic', true) } }
}

const remember = (key: string, value: unknown): void => void database().prepare('insert or replace into settings (key, value) values (?, ?)').run(key, JSON.stringify(value))

/** The apps open now that can make sound: none asked of a Mac that has not allowed it (listing them would ask). */
export async function soundApps(): Promise<SoundApp[]> {
  // A probe's stand-in apps: the real Mac's are never listed in a test.
  if (process.env.HALIGTREE_QA_MEETING) return JSON.parse(process.env.HALIGTREE_QA_MEETING_APPS ?? '[]') as SoundApp[]
  if (!screenAllowed()) return []
  const out = await new Promise<string>((done) => {
    const asking = spawn(helper, ['--apps'])
    let said = ''
    asking.stdout.on('data', (chunk) => (said += chunk))
    asking.on('close', () => done(said))
    asking.on('error', () => done(''))
  })
  try {
    // Names as the Mac gives them can carry invisible direction marks: taken off.
    return ((JSON.parse(out).apps ?? []) as SoundApp[]).map((one) => ({ ...one, name: one.name.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim() }))
  } catch {
    return []
  }
}

/** "Sound from": one app, or all of this Mac (null); kept for next time, and changed at once while it records. */
export function soundFrom(app: SoundApp | null): void {
  live = { ...live, from: { ...live.from, bundle: app?.bundle ?? null, name: app?.name ?? null } }
  remember('meetingFrom', app ? { bundle: app.bundle, name: app.name } : null)
  if (child) child.stdin.write(`from ${app?.bundle ?? 'all'}\n`)
  tell()
}

/** "My microphone", on or off; kept for next time, and changed at once while it records. */
export function microphone(on: boolean): void {
  live = { ...live, from: { ...live.from, mic: on } }
  remember('meetingMic', on)
  if (child) child.stdin.write(`mic ${on ? 'on' : 'off'}\n`)
  tell()
}

const seconds = (): number => {
  if (!clock.began) return 0
  return ((clock.pausedAt || Date.now()) - clock.began - clock.pausedFor) / 1000
}
const tell = (level?: { you: number; others: number }): void => shown?.send({ ...live, seconds: seconds() }, level)

export const meetingNow = (): boolean => !!child
export const meetingState = (): Live => ({ ...live, seconds: seconds() })

/** Screen & System Audio Recording: what macOS says now, without asking. */
function screenAllowed(): boolean {
  if (process.env.HALIGTREE_QA_MEETING_SCREEN) return process.env.HALIGTREE_QA_MEETING_SCREEN === 'granted'
  if (process.env.HALIGTREE_QA_MEETING) return true
  return systemPreferences.getMediaAccessStatus('screen') === 'granted'
}

/**
 * "Record a meeting", from anywhere: the card comes up. The first time (and whenever the Mac's sound is not allowed)
 * it waits on "Start recording" with what will be recorded and the line about letting people know; after that it
 * starts at once. While one records, this notes the moment instead.
 */
export async function startMeeting(event: MeetingEvent | null = null): Promise<void> {
  if (child) return void noteMoment()
  if (live.state === 'saving') return shown?.open()
  live = { ...blank(), event }
  const mac = await caps()
  if (process.platform !== 'darwin' || mac.major < 13) live = { ...live, state: 'too-old', message: 'Recording a meeting needs macOS 13 or later' }
  else if (!screenAllowed()) live = { ...live, state: setting('meetingAsked', false) ? 'denied' : 'ready' }
  shown?.open()
  tell()
  if (live.state === 'ready' && !live.first) await begin()
}

/** "Start recording" on the card: asked for the Mac's sound once, then recording. */
export async function begin(): Promise<void> {
  if (child || !['ready', 'denied'].includes(live.state)) return
  database().prepare("insert or replace into settings (key, value) values ('meetingTold', 'true')").run()
  if (!screenAllowed()) {
    live = { ...live, state: 'asking', first: false }
    tell()
    database().prepare("insert or replace into settings (key, value) values ('meetingAsked', 'true')").run()
    // A probe never asks the real Mac: its stand-in answer is the one it set.
    const said = process.env.HALIGTREE_QA_MEETING_SCREEN ? '' : await new Promise<string>((done) => {
      const asking = spawn(helper, ['--ask'])
      let out = ''
      asking.stdout.on('data', (chunk) => (out += chunk))
      asking.on('close', () => done(out))
      asking.on('error', () => done(''))
    })
    if (!/"granted"/.test(said) && !screenAllowed()) {
      live = { ...live, state: 'denied' }
      return tell()
    }
  }
  live = { ...live, state: 'starting', first: false, lines: [], moments: [] }
  tell()
  shown?.leftChanged()
  folder = join(meetingsDir(), randomUUID())
  settled = []
  saved = found = take = null
  diskFull = false
  startedAt = new Date().toISOString()
  try {
    await mkdir(folder, { recursive: true })
    note(null)
  } catch (error) {
    live = { ...live, state: 'failed', message: `There is nowhere to keep a recording: ${(error as Error).message}` }
    return tell()
  }
  const ai = meets(await caps(), 'ai')
  const qa = process.env.HALIGTREE_QA_MEETING?.split('|')
  const args = ['record', folder, (app.getPreferredSystemLanguages()[0] ?? 'en-US').replace('-', '_'), ...(live.from.bundle ? ['--from', live.from.bundle] : []), ...(live.from.mic ? [] : ['--no-mic']),
    ...(qa ? ['--test', ...qa] : []), ...(qa && ai ? ['--ai-stand-in'] : []), ...(qa && process.env.HALIGTREE_QA_MEETING_SPEED ? ['--speed', process.env.HALIGTREE_QA_MEETING_SPEED] : []),
    ...(qa && process.env.HALIGTREE_QA_MEETING_ROOM ? ['--room', process.env.HALIGTREE_QA_MEETING_ROOM] : [])]
  const run = spawn(program(), args)
  child = run
  // A program that will not start, or has gone when told something: said on the card, never an error that takes the app down.
  run.on('error', (error) => void (live = { ...live, message: `The recording could not start: ${error.message}` }))
  run.stdin.on('error', () => undefined)
  let rest = ''
  run.stdout.setEncoding('utf8')
  run.stdout.on('data', (chunk: string) => {
    const parts = (rest + chunk).split('\n')
    rest = parts.pop() ?? ''
    for (const part of parts) {
      try {
        if (part.trim()) heard(JSON.parse(part))
      } catch {
        // Not one of the program's own lines: left out.
      }
    }
  })
  run.stderr.resume()
  run.on('close', () => void ended())
}

/** What only this side knows, in the folder, so a crash keeps it too. */
function note(words: Live['words']): void {
  writeFileSync(join(folder, 'recording.json'), JSON.stringify({ startedAt, event: live.event, words } satisfies Noted))
}

function heard(line: Record<string, unknown>): void {
  if (line.ready) {
    clock = { began: Date.now(), pausedFor: 0, pausedAt: 0 }
    live = { ...live, state: 'live', words: (line.ready as { live: Live['words'] }).live }
    try {
      note(live.words)
    } catch {
      // Only which way the words came: the disk's trouble is the program's to say.
    }
    return tell()
  }
  if (line.level) return tell(line.level as { you: number; others: number })
  // What the program says it records now: the app (or all of this Mac) and the microphone.
  if (line.from) {
    const said = line.from as { bundle: string | null; mic: boolean }
    live = { ...live, from: { bundle: said.bundle, name: said.bundle === live.from.bundle ? live.from.name : null, mic: said.mic }, recording: { bundle: said.bundle, mic: said.mic } }
    return tell()
  }
  if (line.words) {
    const said = line.words as Line
    const one: Line = { ...said, start: Math.round(said.start * 10) / 10, end: Math.round(said.end * 10) / 10 }
    if (one.final && heardTwice(one, settled)) return
    const at = live.lines.findIndex((other) => other.id === one.id)
    const lines = at >= 0 ? live.lines.map((other, index) => (index === at ? one : other)) : [...live.lines, one].sort((a, b) => a.start - b.start)
    live = { ...live, lines: lines.slice(-SHOWN_LINES) }
    if (one.final) settled.push(one)
    return tell()
  }
  if (line.saved) saved = line.saved as typeof saved
  if (line.found) found = line.found as Record<string, unknown>
  if (line.take) take = line.take as Record<string, unknown>
  if (line.error) {
    const error = line.error as { code: string; message: string }
    if (live.state === 'starting') live = { ...live, state: error.code === 'denied' ? 'denied' : 'failed', message: error.message }
    // The disk full: the program is ending the recording itself and keeping what it has.
    else if (error.code === 'disk' && ['live', 'paused'].includes(live.state)) live = { ...live, state: 'saving', message: error.message }
    if (error.code === 'disk') diskFull = true
    tell()
  }
}

export function noteMoment(): void {
  if (!child || live.state !== 'live') return
  const at = Math.round(seconds() * 10) / 10
  const line = [...live.lines].reverse().find((one) => one.start <= at + 0.5)
  const moment = { at, line: line?.id ?? null }
  live = { ...live, moments: [...live.moments, moment] }
  try {
    appendFileSync(join(folder, 'moments.jsonl'), `${JSON.stringify(moment)}\n`)
  } catch {
    // Kept in the card's own list all the same; only a crash now would lose it.
  }
  tell()
}

export function pauseMeeting(pause: boolean): void {
  if (!child || (pause ? live.state !== 'live' : live.state !== 'paused')) return
  child.stdin.write(pause ? 'pause\n' : 'resume\n')
  if (pause) clock.pausedAt = Date.now()
  else (clock.pausedFor += Date.now() - clock.pausedAt, (clock.pausedAt = 0))
  live = { ...live, state: pause ? 'paused' : 'live' }
  tell()
}

/** Stop: what was recorded is kept, whatever stopped it (Stop, the lid, quitting). Resolves once it is in the book. */
export function stopMeeting(): Promise<void> {
  if (!child) {
    // Asked but never started: the card goes.
    if (['ready', 'denied', 'failed', 'too-old'].includes(live.state)) (live = blank(), shown?.close())
    return Promise.resolve()
  }
  if (live.state === 'paused') pauseMeeting(false)
  if (live.state !== 'saving') {
    live = { ...live, state: 'saving' }
    tell()
    child.stdin.write('stop\n')
  }
  return new Promise((done) => {
    const before = finished
    finished = () => (before?.(), done())
  })
}

async function ended(): Promise<void> {
  child = null
  const done = finished
  finished = null
  try {
    if (!saved) {
      // The program died under it, or never started. Whatever reached the disk is offered; nothing that did not is claimed.
      const seconds = await soundIn(folder)
      if (seconds >= FEW_SECONDS) live = { ...live, state: 'failed', stopped: true, message: diskFull ? `${keptFor(seconds)} is safe, but the disk is too full to finish it. Free up some space, then keep it or discard it in the main window.` : `${keptFor(seconds)} is safe. Keep it or discard it in the main window.` }
      else {
        await rm(folder, { recursive: true, force: true })
        if (!['denied', 'failed'].includes(live.state)) live = { ...live, state: 'failed', message: live.message ?? 'The recording stopped before anything was kept' }
      }
      tell()
      return
    }
    const id = await keep(folder, { startedAt, event: live.event, words: live.words }, saved, found, take, live.moments)
    live = { ...live, state: 'saved', id }
    tell()
    shown?.openNote(id)
    shown?.close()
  } catch (error) {
    // The disk or the database in the way: the folder stays, and is offered.
    live = { ...live, state: 'failed', stopped: true, message: `It could not be kept yet: ${(error as Error).message}. It is safe, and will be offered again in the main window.` }
    tell()
  } finally {
    if (live.state === 'saved') await rm(folder, { recursive: true, force: true }).catch(() => undefined)
    shown?.leftChanged()
    done?.()
  }
}

/** A file from the meeting into the book's store, named by the hash of its bytes like every other. */
async function store(file: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((done, fail) => createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('end', done).on('error', fail))
  const name = `${hash.digest('hex')}.m4a`
  await mkdir(assetsDir(), { recursive: true })
  const temporary = join(assetsDir(), `${name}.${randomUUID()}.tmp`)
  await copyFile(file, temporary)
  await rename(temporary, join(assetsDir(), name))
  return `haligtree://assets/${name}`
}

/** The meeting, kept as a note of its own (meeting-page.tsx draws it): the recording, who said what, and what to take from it. */
async function keep(from: string, noted: Noted, saved: Saved, found: Record<string, unknown> | null, take: Record<string, unknown> | null, marks: Moment[], stopped?: string): Promise<string> {
  const audio = await store(join(from, 'meeting.m4a'))
  const tracks = { you: saved.you ? await store(join(from, 'you.m4a')) : '', others: saved.others ? await store(join(from, 'others.m4a')) : '' }
  // The waveform worked out while it recorded: an hour is never read whole again to draw it.
  const peaks = /assets\/(.+)$/.exec(audio)![1]
  await writeFile(join(assetsDir(), `${peaks}.peaks`), JSON.stringify({ peaks: saved.peaks, seconds: saved.seconds }))
  // What was written as it was said: one record of the words, whether it stopped or crashed.
  const lines = linesFrom(await readFile(join(from, 'words.jsonl'), 'utf8').catch(() => ''))
  const title = noted.event?.title || recordingName(noted.startedAt)
  const speakers = [...new Set(lines.filter((one) => one.speaker !== 'you').map((one) => one.speaker))]
  // A moment is the line being said when it was noted: that line's own start and voice, so it plays from where the line begins.
  const moments = marks.map((one) => {
    const line = lines.find((said) => said.id === one.line)
    return line ? { at: line.start, text: line.text, speaker: line.speaker } : { at: one.at, text: '' }
  })
  const marked = new Set(marks.map((one) => one.line))
  // Every line said, kept as the meeting's own data: who, from when to when, the words.
  const said: MeetingLine[] = lines.map((one) => ({ id: one.id, who: one.speaker, at: one.start, end: one.end, text: one.text, ...(marked.has(one.id) ? { marked: true } : {}) }))
  // The action items: Apple Intelligence's, written properly, where this Mac has it; every other Mac's, the lines that commit or ask.
  const dated: Record<string, string> = {}
  for (const one of ((found?.dates ?? []) as { at: number; date?: string }[])) {
    const line = said.find((line) => Math.abs(line.at - one.at) < 0.05)
    if (line && one.date) dated[line.id] = String(one.date).slice(0, 10)
  }
  const read = readTake(take)
  // A probe's stand-in for the model writes the same items a person would (made from the lines, written down plainly).
  const actions = read?.standIn ? foundActions(said, dated).map((one) => ({ ...one, by: 'ai' as const })) : read ? writtenActions(read.actions, said) : foundActions(said, dated)
  const meeting = {
    type: 'meeting',
    attrs: {
      audio, you: tracks.you, others: tracks.others, seconds: saved.seconds, startedAt: noted.startedAt, event: noted.event, people: noted.event?.people ?? [],
      speakers, names: {}, moments, found, take, words: noted.words, tag: '#recording', lines: said, actions, heard: saved.heard ?? null,
      // The folder it came from, so a crash between keeping it and clearing the folder never keeps it twice; and why it ended early, if it did.
      recording: basename(from), stopped: stopped ?? saved.stopped ?? null,
      // Your microphone on but hearing almost nobody while the others talked: its name, so the page can say which one.
      quietMic: saved.quietMic ? (saved.micName ?? '') : null
    }
  }
  const text = (words: string): unknown[] => (words ? [{ type: 'text', text: words }] : [])
  // The meeting block carries the #recording tag itself (haligtree.ts, plain): every meeting under the one tag, shown once.
  // The paragraph after it is the person's own notes about the meeting.
  const body = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: text(title) }, meeting, { type: 'paragraph' }] }
  const id = keepMeeting(title, body)
  // Its words are all in: named by what was said, where Apple Intelligence is on (long-names.ts).
  void nameRecording(id)
  return id
}

/** How many seconds of sound a folder holds, the longer side: 0 for none. */
async function soundIn(from: string): Promise<number> {
  const sizes = await Promise.all(['you', 'others'].map((side) => stat(join(from, `${side}.pcm`)).then((one) => one.size, () => 0)))
  return Math.max(...sizes) / PCM_BYTES_A_SECOND
}

/** A recording under way, from before its folder exists until it is in the book: its folder is not one left behind. */
const recordingNow = (): boolean => !!child || ['starting', 'live', 'paused', 'saving'].includes(live.state)
/** Being kept right now: not offered again while it is. */
const keeping = new Set<string>()
let swept = false

/**
 * The recordings left behind, oldest first. None while one records. A folder a crash left after it was kept is cleared;
 * so is one with too little sound to ask about. A folder from before sound was written this way (no .pcm, its files
 * unreadable after a crash) is never touched.
 */
export async function recordingsLeft(): Promise<Left[]> {
  if (!swept) {
    swept = true
    await rm(discardedDir(), { recursive: true, force: true }).catch(() => undefined)
  }
  if (recordingNow()) return []
  const names = await readdir(meetingsDir(), { withFileTypes: true }).catch(() => [])
  const left: (Left & { at: string })[] = []
  // Which folders are already in the book, read once: asked per folder, 50 folders over 100 long meetings held the app for 1.7 seconds.
  let kept: Set<string> | null = null
  const inBook = (id: string): boolean => (kept ??= new Set((database().prepare("select substr(body, instr(body, '\"recording\":\"') + 13, 36) as id from captures where source = 'Meeting' and instr(body, '\"recording\":\"') > 0").all() as { id: string }[]).map((row) => row.id))).has(id)
  for (const one of names) {
    if (!one.isDirectory() || one.name.startsWith('.') || keeping.has(one.name)) continue
    const from = join(meetingsDir(), one.name)
    const files = await readdir(from).catch(() => [] as string[])
    if (!files.some((file) => file.endsWith('.pcm')) && files.some((file) => file.endsWith('.m4a'))) continue
    const seconds = await soundIn(from)
    if (recordingNow()) return []
    if (seconds < FEW_SECONDS || inBook(one.name)) {
      await rm(from, { recursive: true, force: true }).catch(() => undefined)
      continue
    }
    const noted = await notedIn(from)
    left.push({ id: one.name, said: offerWords(noted.startedAt, seconds), at: noted.startedAt })
  }
  return left.sort((a, b) => a.at.localeCompare(b.at)).map(({ id, said }) => ({ id, said }))
}

/** What was written down when it began; a crash at that very moment leaves the folder's own date. */
async function notedIn(from: string): Promise<Noted> {
  try {
    return JSON.parse(await readFile(join(from, 'recording.json'), 'utf8')) as Noted
  } catch {
    const made = await stat(from)
    return { startedAt: made.birthtime.toISOString(), event: null, words: null }
  }
}

const isFolderId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)

/**
 * "Keep": a normal meeting page from what was saved, saying it stopped early. The folder goes only once the note is in
 * the book, so a second crash anywhere in here leaves it to be offered again.
 */
export async function keepLeft(id: string): Promise<{ id?: string; error?: string }> {
  const from = join(meetingsDir(), id)
  if (keeping.has(id)) return {}
  keeping.add(id)
  try {
    const qa = process.env.HALIGTREE_QA_MEETING && meets(await caps(), 'ai')
    type Said = { saved?: Saved; found?: Record<string, unknown>; take?: Record<string, unknown>; error?: { message: string } }
    const said = await new Promise<Said>((done) => {
      const run = spawn(program(), ['recover', from, ...(qa ? ['--ai-stand-in'] : [])])
      const out: Said = {}
      let rest = ''
      run.stdout.setEncoding('utf8')
      run.stdout.on('data', (chunk: string) => {
        const parts = (rest + chunk).split('\n')
        rest = parts.pop() ?? ''
        for (const part of parts) {
          try {
            if (part.trim()) Object.assign(out, JSON.parse(part))
          } catch {
            // Not one of the program's own lines: left out.
          }
        }
      })
      run.stderr.resume()
      run.on('error', (error) => (out.error = { message: error.message }))
      run.on('close', () => done(out))
    })
    if (!said.saved) return { error: said.error?.message ?? 'The recording could not be finished. It is still safe.' }
    const moments = (await readFile(join(from, 'moments.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map((one) => JSON.parse(one) as Moment)
    const note = await keep(from, await notedIn(from), said.saved, said.found ?? null, said.take ?? null, moments, 'crash')
    await rm(from, { recursive: true, force: true })
    shown?.openNote(note)
    return { id: note }
  } catch (error) {
    return { error: `It could not be kept yet: ${(error as Error).message}. It is still safe.` }
  } finally {
    keeping.delete(id)
  }
}

/** "Discard": out of the way at once, and back on "Undo"; really gone when the app next opens. */
async function discardLeft(id: string): Promise<void> {
  await mkdir(discardedDir(), { recursive: true })
  await rename(join(meetingsDir(), id), join(discardedDir(), id))
}
const undoDiscard = (id: string): Promise<void> => rename(join(discardedDir(), id), join(meetingsDir(), id))

/**
 * What Apple Intelligence is asked of a recording read again: the five lists a new one gets (native/meeting.swift
 * `take`), as fields it fills (`shaped`), each item with the [seconds] of the line it comes from.
 */
const READ_AGAIN = 'You read part of a meeting\'s transcript and write what to take from it, plainly. Each item keeps the [seconds] of the transcript line it comes from. A list with nothing in it stays empty.'
const SECONDS: Shape & { name: string } = { name: 'at', type: 'int', min: 0, description: 'The [seconds] of the transcript line it comes from' }
const items = (name: string, description: string): Shape & { name: string } =>
  ({ name, type: 'array', description, items: { type: 'object', properties: [{ name: 'text', type: 'string', description: 'The item, in a short sentence' }, SECONDS] } })
const TAKE: Shape = { type: 'object', properties: [
  { name: 'summary', type: 'string', description: 'Two or three sentences, no list' },
  items('decisions', 'What was decided'),
  { name: 'actions', type: 'array', description: 'Only a real promise someone made ("I\'ll send it by Friday") or a real ask of someone ("can you check the invoice?"). Never a story, a feeling, a quote, lyrics, or a line only because it has "tell", "will" or "going to" in it. Most parts have few actions or none', items: { type: 'object', properties: [
    { name: 'owner', type: 'string', description: 'Who will do it, as the transcript names them: "You" or "Speaker N"' },
    // "By when" is part of it, not a field: asked as its own (optional) field, the model wrote "now" for every one (20 Nov).
    { name: 'what', type: 'string', description: 'What they will do, and by when only if that was said' },
    SECONDS
  ] } },
  items('questions', 'Questions left open'),
  items('aboutYou', 'Things said about "You" or your work')
] }
type Item = { text: string; at: number; owner?: string }
type Filled = { summary: string; decisions: Item[]; actions: { owner: string; what: string; at: number }[]; questions: Item[]; aboutYou: Item[] }

/**
 * A recording kept without Apple Intelligence's read (made on a Mac or a day without it): read now, a part at a time,
 * since a long meeting is more than the model takes at once. The summary is the first part's; the lists are every
 * part's. Said plainly when this Mac has no Apple Intelligence, so the page keeps the lines found by rule.
 */
async function readAgain(lines: MeetingLine[]): Promise<{ take: Record<string, unknown>; actions: ReturnType<typeof writtenActions> } | { unavailable: string } | { failed: string }> {
  const ai = (await caps()).ai
  if (ai !== 'available') return { unavailable: ai }
  const said = lines.map((one) => `[${Math.floor(one.at)}s] ${one.who === 'you' ? 'You' : `Speaker ${one.who.slice(1)}`}: ${one.text}`)
  const parts: string[] = []
  for (const line of said) {
    // 8,000 characters a part: the shape asked for is read by the model too, and the whole must fit what it reads at once.
    if (!parts.length || parts[parts.length - 1].length + line.length > 8000) parts.push(line)
    else parts[parts.length - 1] += `\n${line}`
  }
  const take = { summary: '', decisions: [] as Item[], actions: [] as Item[], questions: [] as Item[], missed: [] as Item[] }
  // Each part's items as the page keeps them (meeting-take.ts `TakeLine`): an action's owner its "You" or "Speaker N".
  const list = (value: unknown): Item[] => (Array.isArray(value) ? value : []).filter((one) => typeof one?.text === 'string' && one.text.trim())
    .map((one) => ({ text: one.text.trim(), at: Number(one.at) || 0, ...(typeof one.owner === 'string' && one.owner.trim() ? { owner: one.owner.trim() } : {}) }))
  for (const [n, part] of parts.entries()) {
    const said = await shaped<Filled>(READ_AGAIN + (n ? ' This is a later part: leave the summary empty.' : ''), part, TAKE, undefined, 5 * 60_000)
    if ('error' in said) return { failed: said.error }
    if (!n) take.summary = String(said.summary ?? '').trim()
    take.decisions.push(...list(said.decisions))
    take.questions.push(...list(said.questions))
    take.missed.push(...list(said.aboutYou))
    take.actions.push(...list((Array.isArray(said.actions) ? said.actions : []).map((one) => ({ ...one, text: one?.what }))))
  }
  return { take, actions: writtenActions(take.actions, lines) }
}

export function registerMeeting(show: Shown): void {
  ipcMain.handle('haligtree:meeting:read-again', (_event, lines: unknown) => readAgain(Array.isArray(lines) ? (lines as MeetingLine[]) : []))
  shown = show
  ipcMain.handle('haligtree:meeting:left', () => recordingsLeft())
  ipcMain.handle('haligtree:meeting:left-keep', (_event, id: unknown) => (isFolderId(id) ? keepLeft(id) : {}))
  ipcMain.handle('haligtree:meeting:left-discard', (_event, id: unknown) => (isFolderId(id) ? discardLeft(id) : undefined))
  ipcMain.handle('haligtree:meeting:left-undo', (_event, id: unknown) => (isFolderId(id) ? undoDiscard(id) : undefined))
  ipcMain.handle('haligtree:meeting:state', () => meetingState())
  ipcMain.handle('haligtree:meeting:start', (_event, event: unknown) => startMeeting((event as MeetingEvent | null) ?? null))
  ipcMain.handle('haligtree:meeting:begin', () => begin())
  ipcMain.handle('haligtree:meeting:mark', () => noteMoment())
  ipcMain.handle('haligtree:meeting:pause', (_event, pause: unknown) => pauseMeeting(!!pause))
  ipcMain.handle('haligtree:meeting:stop', () => stopMeeting())
  ipcMain.handle('haligtree:meeting:apps', () => soundApps())
  ipcMain.handle('haligtree:meeting:from', (_event, one: unknown) => soundFrom(one && typeof one === 'object' && typeof (one as SoundApp).bundle === 'string' ? { bundle: (one as SoundApp).bundle, name: String((one as SoundApp).name ?? '') } : null))
  ipcMain.handle('haligtree:meeting:mic', (_event, on: unknown) => microphone(!!on))
  ipcMain.handle('haligtree:meeting:privacy', () => void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'))
}
