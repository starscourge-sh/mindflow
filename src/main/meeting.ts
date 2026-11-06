import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { appendFile, copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, ipcMain, shell, systemPreferences } from 'electron'
import helper from '../../resources/meeting?asset&asarUnpack'
import { database, keepMeeting, setting } from './captures'
import { assetsDir } from './pictures'
import { caps } from './understand'
import { meets } from './needs'

/**
 * Record a whole meeting on this Mac: your microphone and the Mac's own sound (the others, in Teams or a browser) as
 * two tracks, the words live, who said what, then the meeting's own page. The work is done by a small program beside
 * the app (native/meeting.swift); this keeps the one meeting under way, tells the live card (windows/meeting.tsx)
 * what is heard, and keeps the meeting in the book when it stops. Nothing leaves the Mac.
 *
 * HALIGTREE_QA_MEETING (a probe's): `you.wav|others.wav|script.jsonl`, fed to the program's test mode in place of the
 * microphone and the Mac's sound. HALIGTREE_QA_MEETING_SCREEN=denied stands in a Mac that has not allowed it.
 */
export type MeetingEvent = { title: string; start?: string; end?: string; people?: string[] }
export type Line = { id: string; track: 'you' | 'others'; text: string; start: number; end: number; final: boolean; speaker: string }
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
}

type Shown = { send: (live: Live, level?: { you: number; others: number }) => void; open: () => void; close: () => void; openNote: (id: string) => void }

let child: ChildProcessWithoutNullStreams | null = null
let folder = ''
let live: Live = blank()
let shown: Shown | null = null
let startedAt = ''
let clock = { began: 0, pausedFor: 0, pausedAt: 0 }
/** The last of the words: the card shows a few; the rest are on disk as they settle, never one giant string. */
const SHOWN_LINES = 40
let settled: Line[] = []
let saved: { seconds: number; peaks: number[]; you: boolean; others: boolean } | null = null
let found: Record<string, unknown> | null = null
let take: Record<string, unknown> | null = null
let finished: (() => void) | null = null

function blank(): Live {
  return { state: 'ready', first: !setting('meetingTold', false), words: null, event: null, seconds: 0, lines: [], moments: [] }
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
  folder = join(app.getPath('userData'), 'meetings', randomUUID())
  await mkdir(folder, { recursive: true })
  settled = []
  saved = found = take = null
  startedAt = new Date().toISOString()
  const ai = meets(await caps(), 'ai')
  const qa = process.env.HALIGTREE_QA_MEETING?.split('|')
  const args = ['record', folder, (app.getPreferredSystemLanguages()[0] ?? 'en-US').replace('-', '_'), ...(qa ? ['--test', ...qa] : []), ...(qa && ai ? ['--ai-stand-in'] : [])]
  const run = spawn(helper, args)
  child = run
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

function heard(line: Record<string, unknown>): void {
  if (line.ready) {
    clock = { began: Date.now(), pausedFor: 0, pausedAt: 0 }
    live = { ...live, state: 'live', words: (line.ready as { live: Live['words'] }).live }
    return tell()
  }
  if (line.level) return tell(line.level as { you: number; others: number })
  if (line.words) {
    const said = line.words as Line
    const one: Line = { ...said, start: Math.round(said.start * 10) / 10, end: Math.round(said.end * 10) / 10 }
    // Heard twice: a voice from the speakers came back in through the microphone. The others' line is the one kept.
    if (one.track === 'you' && one.final && settled.some((other) => other.track === 'others' && Math.abs(other.start - one.start) < 3 && alike(other.text, one.text))) return
    const at = live.lines.findIndex((other) => other.id === one.id)
    const lines = at >= 0 ? live.lines.map((other, index) => (index === at ? one : other)) : [...live.lines, one].sort((a, b) => a.start - b.start)
    live = { ...live, lines: lines.slice(-SHOWN_LINES) }
    if (one.final) {
      settled.push(one)
      void appendFile(join(folder, 'lines.jsonl'), `${JSON.stringify(one)}\n`).catch(() => undefined)
    }
    return tell()
  }
  if (line.saved) saved = line.saved as typeof saved
  if (line.found) found = line.found as Record<string, unknown>
  if (line.take) take = line.take as Record<string, unknown>
  if (line.error) {
    const error = line.error as { code: string; message: string }
    if (live.state === 'starting') live = { ...live, state: error.code === 'denied' ? 'denied' : 'failed', message: error.message }
    tell()
  }
}

/** Two lines with mostly the same words. */
function alike(a: string, b: string): boolean {
  const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
  const one = new Set(words(a)), two = words(b)
  return two.length > 2 && two.filter((word) => one.has(word)).length / two.length > 0.6
}

export function noteMoment(): void {
  if (!child || live.state !== 'live') return
  const at = Math.round(seconds() * 10) / 10
  const line = [...live.lines].reverse().find((one) => one.start <= at + 0.5)
  live = { ...live, moments: [...live.moments, { at, line: line?.id ?? null }] }
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
      if (!['denied', 'failed'].includes(live.state)) live = { ...live, state: 'failed', message: live.message ?? 'The meeting program stopped before anything was kept' }
      tell()
      return
    }
    const id = await keep()
    live = { ...live, state: 'saved', id }
    tell()
    shown?.openNote(id)
    shown?.close()
  } catch (error) {
    live = { ...live, state: 'failed', message: `The meeting could not be kept: ${(error as Error).message}` }
    tell()
  } finally {
    if (live.state === 'saved') await rm(folder, { recursive: true, force: true }).catch(() => undefined)
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
async function keep(): Promise<string> {
  const audio = await store(join(folder, 'meeting.m4a'))
  const tracks = { you: saved!.you ? await store(join(folder, 'you.m4a')) : '', others: saved!.others ? await store(join(folder, 'others.m4a')) : '' }
  // The waveform worked out while it recorded: an hour is never read whole again to draw it.
  const peaks = /assets\/(.+)$/.exec(audio)![1]
  await writeFile(join(assetsDir(), `${peaks}.peaks`), JSON.stringify({ peaks: saved!.peaks, seconds: saved!.seconds }))
  const lines = settled.sort((a, b) => a.start - b.start)
  const at = new Date(startedAt)
  const title = live.event?.title || `Meeting, ${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`
  const speakers = [...new Set(lines.filter((one) => one.speaker !== 'you').map((one) => one.speaker))]
  // A moment is the line being said when it was noted: that line's own start and voice, so it plays from where the line begins.
  const moments = live.moments.map((one) => {
    const line = lines.find((said) => said.id === one.line)
    return line ? { at: line.start, text: line.text, speaker: line.speaker } : { at: one.at, text: '' }
  })
  const meeting = {
    type: 'meeting',
    attrs: {
      audio, you: tracks.you, others: tracks.others, seconds: saved!.seconds, startedAt, event: live.event, people: live.event?.people ?? [],
      speakers, names: {}, moments, found, take, words: live.words, tag: '#meeting'
    }
  }
  const text = (words: string): unknown[] => (words ? [{ type: 'text', text: words }] : [])
  const noted = new Set(live.moments.map((one) => one.line))
  const said = lines.map((one) => ({ type: 'meetingLine', attrs: { who: one.speaker, at: one.start, end: one.end, marked: noted.has(one.id) }, content: text(one.text) }))
  // The meeting block carries the #meeting tag itself (haligtree.ts, plain): every meeting under the one tag, shown once.
  const body = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: text(title) }, meeting, ...said, { type: 'paragraph' }] }
  return keepMeeting(title, body)
}

export function registerMeeting(show: Shown): void {
  shown = show
  ipcMain.handle('haligtree:meeting:state', () => meetingState())
  ipcMain.handle('haligtree:meeting:start', (_event, event: unknown) => startMeeting((event as MeetingEvent | null) ?? null))
  ipcMain.handle('haligtree:meeting:begin', () => begin())
  ipcMain.handle('haligtree:meeting:mark', () => noteMoment())
  ipcMain.handle('haligtree:meeting:pause', (_event, pause: unknown) => pauseMeeting(!!pause))
  ipcMain.handle('haligtree:meeting:stop', () => stopMeeting())
  ipcMain.handle('haligtree:meeting:privacy', () => void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'))
}
