import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { app, ipcMain } from 'electron'
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

export function caps(): Promise<Caps> {
  asked ??= new Promise<Caps>((done) => {
    if (process.platform !== 'darwin') return done(NONE)
    execFile(helper, ['--status'], { timeout: 15_000 }, (error, out) => {
      let real = NONE
      try {
        if (!error) real = { ...NONE, ...(JSON.parse(String(out).trim()).status as Caps) }
      } catch {
        // Unreadable: this Mac is said to have nothing beyond every Mac's.
      }
      done(process.env.HALIGTREE_QA_CAPS ? standIn(process.env.HALIGTREE_QA_CAPS, real) : real)
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
export async function translate(text: string, to = ownLanguage()): Promise<{ text: string; from: string; to: string } | { error: string }> {
  const have = await caps()
  if (have.major < 26) return { error: 'Translation needs macOS 26' }
  const words = text.trim().slice(0, 20_000)
  if (!words) return { error: 'There are no words to translate' }
  const read = await understand('read', { text: words.slice(0, 2000) })
  const from = String(read.lang ?? 'und')
  if (from === 'und') return { error: 'The language of these words could not be told' }
  if (from === to) return { error: `These words are already in ${languageName(to)}` }
  const done = await understand('translate', { text: words, from, to })
  return done.error ? { error: done.error.message } : { text: String(done.text ?? ''), from, to }
}

export const languageName = (code: string): string => new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code

export function registerUnderstand(): void {
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
    if (!on()) return { error: 'Apple Intelligence in Review and reading is turned off in Settings' }
    const said = await understand(op, body)
    return said.error ? { error: said.error.message } : said
  }
  ipcMain.handle('haligtree:ai:judge', (_event, question: unknown, answer: unknown, said: unknown) =>
    ask('judge', { question: String(question ?? ''), answer: String(answer ?? ''), said: String(said ?? '') }))
  ipcMain.handle('haligtree:ai:hint', (_event, question: unknown, answer: unknown, level: unknown) =>
    ask('hint', { question: String(question ?? ''), answer: String(answer ?? ''), level: Number(level) >= 2 ? 2 : 1 }))
  ipcMain.handle('haligtree:ai:cards', (_event, title: unknown, text: unknown, count: unknown) =>
    ask('cards', { title: String(title ?? ''), text: String(text ?? ''), count: Math.min(10, Math.max(1, Number(count) || 5)) }))
}
