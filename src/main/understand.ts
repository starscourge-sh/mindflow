import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { app, ipcMain, shell } from 'electron'
import helper from '../../resources/understand?asset&asarUnpack'
import { meets, standIn, type Caps } from './needs'
import { answerInNote, flat, givesAway, type QuestionDraft } from './note-questions'

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
    // A test run standing in for a Mac with the model (HALIGTREE_QA_CAPS=ai): a stand-in's verdict, marked as one.
    if (op === 'judge' && process.env.HALIGTREE_QA_CAPS === 'ai') return { verdict: 'close', missing: "a stand-in's verdict" } as unknown as Answer
    const said = await understand(op, body)
    return said.error ? { error: said.error.message } : said
  }
  ipcMain.handle('haligtree:ai:judge', (_event, question: unknown, answer: unknown, said: unknown) =>
    ask('judge', { question: String(question ?? ''), answer: String(answer ?? ''), said: String(said ?? '') }))
  ipcMain.handle('haligtree:ai:hint', (_event, question: unknown, answer: unknown, level: unknown) =>
    ask('hint', { question: String(question ?? ''), answer: String(answer ?? ''), level: Number(level) >= 2 ? 2 : 1 }))
  // Cards: asked with a schema (native/understand.swift, guided generation), so the model fills each card's fields
  // and none is lost to how it lays out its words. None at all says so plainly.
  ipcMain.handle('haligtree:ai:cards', async (_event, title: unknown, text: unknown, count: unknown) => {
    const said = await ask('cards', { title: String(title ?? '').slice(0, 200), text: String(text ?? '').slice(0, 9000), count: Math.min(10, Math.max(1, Number(count) || 5)) })
    if (typeof said.error === 'string') return { error: said.error }
    const cards = (said as Answer).cards
    return Array.isArray(cards) && cards.length ? { cards } : { error: 'Apple Intelligence filled no card from these pages: they may hold too few words it could read (a scan or code alone).' }
  })
  ipcMain.handle('haligtree:ai:phrase', (_event, drafts: unknown) => phraseDrafts(Array.isArray(drafts) ? drafts.slice(0, 5) : [], on))
  // A new group's first name, offered in its name field. Never an error: no answer simply leaves the name it has.
  ipcMain.handle('haligtree:ai:group-name', async (_event, titles: unknown): Promise<string | null> => {
    const have = await caps()
    if (have.major < 26 || !on() || !Array.isArray(titles)) return null
    const stand = process.env.HALIGTREE_QA_GROUP_NAME
    const prompt = `Titles:\n${titles.slice(0, 12).map((one) => `- ${String(one).slice(0, 80)}`).join('\n')}\n\nThe shared topic:`
    const said = stand
      ? (have.ai === 'available' ? new Promise<Answer>((done) => setTimeout(() => done(stand === 'fail' ? { error: { code: 'failed', message: 'no' } } : { text: stand }), Number(process.env.HALIGTREE_QA_GROUP_NAME_MS ?? 300))) : Promise.resolve<Answer>({ error: { code: 'unavailable', message: 'no' } }))
      // The helper checks the Mac afresh, so Apple Intelligence turned on or its model downloaded counts without a restart.
      // Asked for "the topic" with the titles laid out: asked for "a name", it answered "Notes from titles" (19 Nov).
      : understand('write', { instructions: 'You name a folder that holds some notes, the way a person names a folder on their desk. Read the note titles, find the one topic they share, and answer with that topic alone: one to three words, Title Case, in the language of the titles. Never the words "notes", "titles", "group" or "things". No quotes, no full stop, nothing else.', prompt })
    const answer = await Promise.race([said, new Promise<null>((done) => setTimeout(() => done(null), 5000))])
    return answer && !answer.error && typeof answer.text === 'string' ? answer.text : null
  })
}

/**
 * Study questions drafted from a note (note-questions.ts), phrased better by
 * Apple Intelligence on this Mac: each reworded question kept only if its
 * answer still stands in the line it came from and the question does not say
 * it; any other keeps the note's own draft. `none` on a Mac without it (or
 * with it off in Settings), so nothing there speaks of a model.
 * HALIGTREE_QA_CAPS=ai stands a model in (one of its answers made up, to show
 * the check at work) unless HALIGTREE_QA_PHRASE=real asks this Mac's own.
 */
async function phraseDrafts(drafts: unknown[], on: () => boolean): Promise<{ drafts: QuestionDraft[]; phrased: number } | { error: string } | { none: true }> {
  const given = drafts.filter((one): one is QuestionDraft => !!one && typeof one === 'object' && typeof (one as QuestionDraft).question === 'string' && typeof (one as QuestionDraft).answer === 'string' && typeof (one as QuestionDraft).from === 'string')
  if (!meets(await caps(), 'ai') || !on()) return { none: true }
  if (!given.length) return { drafts: [], phrased: 0 }
  const stand = process.env.HALIGTREE_QA_CAPS === 'ai' && process.env.HALIGTREE_QA_PHRASE !== 'real'
  const prompt = given.map((one, n) => `${n + 1}. Q: ${one.question} || A: ${one.answer} || FROM: ${one.from.slice(0, 400)}`).join('\n')
  const said: Answer = stand
    ? { text: given.map((one, n) => `${n + 1}. Q: ${one.question.replace(/\?$/, '')}, in a stand-in's words? || A: ${n === 0 ? 'an answer the note never gave' : one.answer}`).join('\n') }
    : await Promise.race([
      understand('write', {
        instructions: 'You rewrite study flashcards a student drafted from their own note, so each question reads as a natural question they would answer from memory and asks for one thing. For example "What does your note say about “Spaced repetition”?" with the answer "Reviewing just before you forget makes each memory last longer" becomes "Why review just before you forget?". Keep "Fill the gap:" questions as they are, with their blank. Keep the same order and the same count. Each answer must use only words from its FROM line, and may be shorter, never longer. Never add a fact, a name or a number that is not in the FROM line, and never put the answer in the question. Start each question with a capital letter. Answer one line per card, in this form and nothing else: N. Q: the question || A: the answer',
        prompt
      }),
      new Promise<Answer>((done) => setTimeout(() => done({ error: { code: 'busy', message: 'Apple Intelligence took too long' } }), 20_000))
    ])
  if (said.error || typeof said.text !== 'string') return { error: said.error?.message ?? 'Apple Intelligence gave no answer' }
  const lines = new Map<number, { question: string; answer: string }>()
  for (const line of said.text.split('\n')) {
    const shape = /^\s*(\d+)[.)]\s*Q:\s*(.+?)\s*\|\|\s*A:\s*(.+?)\s*$/.exec(line)
    if (shape) lines.set(Number(shape[1]) - 1, { question: shape[2].trim(), answer: shape[3].trim() })
  }
  let phrased = 0
  const out = given.map((one, n) => {
    const said = lines.get(n)
    const better = said && { question: said.question.replace(/^\p{Ll}/u, (letter) => letter.toUpperCase()), answer: said.answer }
    // Kept only if its answer is still the note's own words, from the line it came from, the question does not give it
    // away, a gap keeps its blank, and it changed more than its capitals and stops: else the note's own draft stands.
    if (!better || better.question.length > 240 || !answerInNote(better.answer, one.from) || givesAway(better.question, better.answer)) return one
    if ((one.rule === 'gap') !== better.question.includes('_____') || (flat(better.question) === flat(one.question) && flat(better.answer) === flat(one.answer))) return one
    // Half or more of the answer's longer words already in the question ("What survives the build?" for "what survives
    // the build, not what precedes it") gives it away as surely as the whole of it.
    const long = flat(better.answer).split(' ').filter((word) => word.length >= 4)
    const asked = new Set(flat(better.question).split(' '))
    if (long.length && long.filter((word) => asked.has(word)).length * 2 >= long.length) return one
    phrased++
    return { ...one, question: better.question, answer: better.answer }
  })
  return { drafts: out, phrased }
}
