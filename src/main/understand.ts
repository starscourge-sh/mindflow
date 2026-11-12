import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { app, ipcMain, shell } from 'electron'
import helper from '../../resources/understand?asset&asarUnpack'
import { meets, standIn, type Caps } from './needs'

/**
 * What this Mac can do, and the small helper (native/understand.swift) that
 * reads words with Apple's Natural Language framework and, where the Mac has
 * it, writes with Apple Intelligence. Nothing leaves the Mac.
 *
 * The Mac is asked once, at start, off the main path (`--status`); everything
 * that offers a feature reads the answer from here. HALIGTREE_QA_CAPS stands
 * an older Mac in for a probe (needs.ts).
 */

const NONE: Caps = { macos: '0', major: 0, silicon: false, embeddings: [], ai: 'too-old', translation: false }

let asked: Promise<Caps> | null = null
/** The last answer, and when it was asked for. */
let last: { caps: Caps; at: number } | null = null
/** How long a "not ready" stands before the Mac is asked again. */
export const ASK_AGAIN_MS = 60_000

/**
 * One answer a run, with one exception: "not ready" (macOS still downloading or setting up Apple Intelligence) is the
 * one answer that changes by itself, so once it is a minute old the Mac is asked again by whoever asks next (a window
 * come back to, Settings opened: lib/needs.ts). The four features then turn on in the same run; before, the first
 * answer was kept until Haligtree was quit and opened again.
 */
export function caps(): Promise<Caps> {
  // A test run may shorten the minute (HALIGTREE_QA_ASK_AGAIN, ms), so a check need not sit through it.
  const stands = Number(process.env.HALIGTREE_USER_DATA && process.env.HALIGTREE_QA_ASK_AGAIN) || ASK_AGAIN_MS
  if (asked && last?.caps.ai === 'not-ready' && Date.now() - last.at >= stands) asked = null
  asked ??= new Promise<Caps>((done) => {
    const at = Date.now()
    const answer = (caps: Caps): void => ((last = { caps, at }), done(caps))
    if (process.platform !== 'darwin') return answer(NONE)
    execFile(helper, ['--status'], { timeout: 15_000 }, (error, out) => {
      let real = NONE
      try {
        if (!error) real = { ...NONE, ...(JSON.parse(String(out).trim()).status as Caps) }
      } catch {
        // Unreadable: this Mac is said to have nothing beyond every Mac's.
      }
      answer(process.env.HALIGTREE_QA_CAPS ? standIn(process.env.HALIGTREE_QA_CAPS, real) : real)
    })
  })
  return asked
}

type Answer = Record<string, unknown> & { error?: { code: string; message: string } }

/**
 * Two helpers: one for what a person is waiting on (a language, a translation, words read aloud), and one for
 * the background (the book's roots read for offers, offers.ts), so a long read never makes the first wait.
 */
type Lane = 'now' | 'background'
const children: Record<Lane, ChildProcessWithoutNullStreams | null> = { now: null, background: null }
let next = 1
const waiting = new Map<number, (answer: Answer) => void>()

function start(lane: Lane): ChildProcessWithoutNullStreams {
  const one = spawn(helper, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  let rest = ''
  one.stdout.setEncoding('utf8')
  one.stdout.on('data', (chunk: string) => {
    rest += chunk
    let at: number
    while ((at = rest.indexOf('\n')) >= 0) {
      const line = rest.slice(0, at)
      rest = rest.slice(at + 1)
      try {
        const answer = JSON.parse(line) as Answer
        const id = Number(answer.id)
        waiting.get(id)?.(answer)
        waiting.delete(id)
      } catch {
        // A line that is not an answer is let go.
      }
    }
  })
  one.stderr.resume()
  const gone = (): void => {
    if (children[lane] === one) children[lane] = null
    for (const [, answer] of waiting) answer({ error: { code: 'failed', message: 'The helper stopped' } })
    waiting.clear()
  }
  one.on('exit', gone)
  one.on('error', gone)
  return one
}

/** One request to the helper, answered in its own time; never throws. */
export function understand(op: string, body: Record<string, unknown>, lane: Lane = 'now'): Promise<Answer> {
  if (process.platform !== 'darwin') return Promise.resolve({ error: { code: 'unavailable', message: 'Only on a Mac' } })
  const child = (children[lane] ??= start(lane))
  const id = next++
  return new Promise((done) => {
    waiting.set(id, done)
    child.stdin.write(`${JSON.stringify({ ...body, id, op })}\n`)
  })
}

/** The language a person reads in: the Mac's own, as two letters. */
export const ownLanguage = (): string => (app.getPreferredSystemLanguages()[0] ?? app.getLocale() ?? 'en').split('-')[0].toLowerCase()

/**
 * Words put into your own language, on this Mac (Apple's Translation, macOS 26):
 * the language they are in found first. Says why not, plainly, when it cannot.
 */
export async function translate(text: string, to = ownLanguage()): Promise<{ text: string; from: string; to: string } | { error: string } | { needs: string; to: string }> {
  const have = await caps()
  if (have.major < 26) return { error: 'Translation needs macOS 26' }
  const words = text.trim().slice(0, 20_000)
  if (!words) return { error: 'There are no words to translate' }
  const read = await understand('read', { text: words.slice(0, 2000) })
  const from = String(read.lang ?? 'und')
  if (from === 'und') return { error: 'The language of these words could not be told' }
  if (from === to) return { error: `These words are already in ${languageName(to)}` }
  const done = await understand('translate', { text: words, from, to })
  // Supported but not on this Mac yet: not a failure, a language to fetch once (Apple's own prompt, prepare()).
  if (process.env.HALIGTREE_QA_TRANSLATE_PREPARE) return standReady ? { text: `(a stand-in's translation of: ${words})`, from, to } : { needs: from, to }
  if (done.error?.code === 'download') return { needs: from, to }
  return done.error ? { error: done.error.message } : { text: String(done.text ?? ''), from, to }
}

export const languageName = (code: string): string => new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code

/**
 * Whether picked words are worth translating: the Mac is sure (0.8 or more) of their language, two words or
 * more, and it is not yours. A name or a single romanised word ("xiao", "Jing") inside an English book is
 * not: "Look up" is the tool there.
 */
export async function translatable(text: string): Promise<{ offer: boolean; from: string }> {
  const words = text.trim()
  if (words.split(/\s+/).length < 2) return { offer: false, from: 'und' }
  const said = await understand('language', { text: words.slice(0, 2000) })
  const from = String(said.lang ?? 'und')
  return { offer: Number(said.confidence ?? 0) >= 0.8 && from !== 'und' && from !== ownLanguage(), from }
}

let standReady = false
/**
 * Apple's own download prompt for a language, in a small window of the helper's own (understand --prepare);
 * the language comes down once. Under HALIGTREE_QA_TRANSLATE_PREPARE a stand-in answers ("ok" or "cancel"),
 * so a test never downloads anything.
 */
function prepare(from: string, to = ownLanguage()): Promise<{ prepared: boolean; why?: string }> {
  const stand = process.env.HALIGTREE_QA_TRANSLATE_PREPARE
  if (stand) return Promise.resolve(stand === 'ok' ? ((standReady = true), { prepared: true }) : { prepared: false, why: 'closed' })
  return new Promise((done) => {
    execFile(helper, ['--prepare', from, to], { timeout: 15 * 60_000 }, (_error, out) => {
      try {
        done(JSON.parse(String(out).trim().split('\n').at(-1) ?? '') as { prepared: boolean; why?: string })
      } catch {
        done({ prepared: false, why: 'failed' })
      }
    })
  })
}

export function registerUnderstand(): void {
  ipcMain.handle('haligtree:translatable', (_event, text: unknown) => translatable(String(text ?? '')))
  ipcMain.handle('haligtree:translate:prepare', (_event, from: unknown) => prepare(String(from ?? '')))
  // When Apple's prompt cannot open: the pane where languages are kept, one click away (never a written path).
  ipcMain.handle('haligtree:translate:settings', () => void shell.openExternal('x-apple.systempreferences:com.apple.Localization-Settings.extension'))
  ipcMain.handle('haligtree:caps', () => caps())
  // The language some words are in, as two letters; English when it cannot be told.
  ipcMain.handle('haligtree:language', async (_event, text: unknown) => {
    const read = await understand('read', { text: String(text ?? '').slice(0, 2000) })
    const lang = String(read.lang ?? 'und')
    return lang === 'und' ? 'en' : lang
  })
  ipcMain.handle('haligtree:translate', (_event, text: unknown, to: unknown) => translate(String(text ?? ''), typeof to === 'string' && to ? to : undefined))
  // Asked now, so the answer is in hand before any page needs it.
  void caps()
}

/**
 * Review and reading with Apple Intelligence: an answer checked by what it
 * means, a hint that is never the answer, cards from a chapter. Only on a Mac
 * with it turned on, and only while Settings has it on; nothing leaves the Mac.
 * Every answer is an offer: nothing is graded or made from it unasked.
 */
export function registerStudyAi(on: () => boolean): void {
  const ask = async (op: string, body: Record<string, unknown>): Promise<Answer | { error: string }> => {
    if (!meets(await caps(), 'ai')) return { error: 'Needs Apple Intelligence' }
    if (!on()) return { error: 'Apple Intelligence is turned off in Settings' }
    const said = await understand(op, body)
    return said.error ? { error: said.error.message } : said
  }
  ipcMain.handle('haligtree:ai:judge', (_event, question: unknown, answer: unknown, said: unknown) =>
    ask('judge', { question: String(question ?? ''), answer: String(answer ?? ''), said: String(said ?? '') }))
  ipcMain.handle('haligtree:ai:hint', (_event, question: unknown, answer: unknown, level: unknown) =>
    ask('hint', { question: String(question ?? ''), answer: String(answer ?? ''), level: Number(level) >= 2 ? 2 : 1 }))
  ipcMain.handle('haligtree:ai:cards', (_event, title: unknown, text: unknown, count: unknown) =>
    ask('cards', { title: String(title ?? ''), text: String(text ?? ''), count: Math.min(10, Math.max(1, Number(count) || 5)) }))
  // A new group's first name, offered in its name field. Never an error: no answer simply leaves the name it has.
  ipcMain.handle('haligtree:ai:group-name', async (_event, titles: unknown): Promise<string | null> => {
    const have = await caps()
    if (have.major < 26 || !on() || !Array.isArray(titles)) return null
    const stand = process.env.HALIGTREE_QA_GROUP_NAME
    const prompt = titles.slice(0, 12).map((one) => `- ${String(one).slice(0, 80)}`).join('\n')
    const said = stand
      ? (have.ai === 'available' ? new Promise<Answer>((done) => setTimeout(() => done(stand === 'fail' ? { error: { code: 'failed', message: 'no' } } : { text: stand }), Number(process.env.HALIGTREE_QA_GROUP_NAME_MS ?? 300))) : Promise.resolve<Answer>({ error: { code: 'unavailable', message: 'no' } }))
      // The helper checks the Mac afresh, so Apple Intelligence turned on or its model downloaded counts without a restart.
      : understand('write', { instructions: 'You name a group of notes from their titles. Answer with only the name: at most three words, in the language of the titles, with no quotes and no full stop. Say what the notes have in common.', prompt })
    const answer = await Promise.race([said, new Promise<null>((done) => setTimeout(() => done(null), 5000))])
    return answer && !answer.error && typeof answer.text === 'string' ? answer.text : null
  })
}
