import { ipcMain } from 'electron'
import { database } from './captures'
import { caps, understand } from './understand'
import { num, plural } from './dates'

/**
 * Words written for you by Apple Intelligence's on-device model (FoundationModels,
 * through native/understand.swift "write"), only on a Mac that has it turned on,
 * and only from your own notes: "Your week, in a paragraph", a name for an
 * Untitled note, why a note may help answer a question, and Writing help on
 * picked words (writing-help.tsx). Always offered, never put in unasked; said
 * to be written on this Mac. Nothing leaves the Mac.
 * Under HALIGTREE_QA_CAPS=ai a stand-in answers instead, plainly marked, so a
 * probe can drive the surfaces on a Mac without Apple Intelligence
 * (HALIGTREE_QA_AI_DELAY, in ms, has it take its time, as a real model does).
 */

/** The longest wait for the model: past it, the person is told it took too long and nothing changes. */
const MOST_MS = 30_000

async function write(instructions: string, prompt: string, stand: string): Promise<{ text: string } | { error: string }> {
  if (process.env.HALIGTREE_QA_CAPS === 'ai') return new Promise((done) => setTimeout(() => done({ text: stand }), Number(process.env.HALIGTREE_QA_AI_DELAY ?? 0)))
  const have = await caps()
  if (have.ai !== 'available') return { error: 'Needs Apple Intelligence' }
  const said = await Promise.race([
    understand('write', { instructions, prompt: prompt.slice(0, 8000) }),
    new Promise<Awaited<ReturnType<typeof understand>>>((done) => setTimeout(() => done({ error: { code: 'busy', message: `Apple Intelligence took too long (over ${MOST_MS / 1000} seconds)` } }), MOST_MS))
  ])
  return said.error ? { error: said.error.message } : { text: String(said.text ?? '').trim() }
}

const PLAIN = 'Write in plain, warm English a student could read. Use only what the notes say; never add facts, names or numbers that are not in them. No lists, no headings, no quotation marks around the answer.'

/** The most a pick may hold for Writing help: the model reads about this much at once, and a rewrite must see all of it. */
export const HELP_MOST = 4000
const KEEP = 'Keep every fact, name and number; never add one. Answer with the rewritten words alone: no preface, no quotation marks around them. Keep the paragraph breaks.'
/** What each Writing help asks of the model, and the stand-in's answer for tests (marked as a stand-in's). */
const HELP: Record<string, { instructions: string; stand: (words: string, mine: number) => string }> = {
  fix: { instructions: `You fix spelling, punctuation, capitals and the slips of dictation (a doubled word, a wrong homophone) in someone's own writing, and change nothing else: not their words, not their order, not their tone. ${KEEP}`, stand: (words) => `${words} (a stand-in's fix)` },
  shorter: { instructions: `You make someone's writing shorter: the same thought, tightened, about half as long. ${KEEP}`, stand: (words) => `${words.split(/\s+/).slice(0, Math.max(3, Math.ceil(words.split(/\s+/).length / 2))).join(' ')} (a stand-in's shorter)` },
  friendlier: { instructions: `You make someone's writing friendlier: the same thought, warmer and kinder, as said to a friend. ${KEEP}`, stand: (words) => `${words} (a stand-in's friendlier)` },
  plainer: { instructions: `You make someone's writing plainer: the same thought in short, everyday words a fourteen-year-old would follow. ${KEEP}`, stand: (words) => `${words} (a stand-in's plainer)` },
  mine: { instructions: `You retell a passage someone copied in their own voice: their words, rhythm and tone, as their own writing in SAMPLES shows it. Say what the passage says, in about as many words. ${KEEP}`, stand: (words, mine) => `${words} (a stand-in's retelling, in the voice of ${plural(mine, 'note')} of yours)` },
  card: { instructions: 'You write one study flashcard from a passage: a question someone would answer from memory, and its short answer, taken from the passage. Never put the answer in the question; never add a fact that is not in the passage. Answer in this form and nothing else: Q: the question || A: the answer', stand: (words) => `Q: What do these words say? || A: ${words.split(/(?<=[.!?])\s/)[0]}` },
  ask: { instructions: 'You turn a passage into one open question its reader could keep thinking about, the kind that gathers clues over months; use only the passage and the NOTE it sits in. Answer with the question alone, ending in a question mark.', stand: (words) => `What follows from “${words.split(/\s+/).slice(0, 6).join(' ')}”? (a stand-in's question)` },
  quote: { instructions: 'You find the one sentence in a passage most worth keeping as a quote. Answer with that sentence alone, copied exactly as it stands in the passage, every word and mark the same.', stand: (words) => [...words.split(/(?<=[.!?])\s+/)].sort((a, b) => b.length - a.length)[0] }
}

/** A few hundred words of the person's own writing (notes and pages, not private), newest first, for "In my words" to learn their voice from. */
function ownWriting(db: ReturnType<typeof database>): string[] {
  // The newest thirty of each read, not the whole book.
  const recent = db.prepare(
    `select text from (
       select * from (select words(id, body) as text, captured_at as at from captures where kind = 'note' and status != 'discarded' and private = 0 order by captured_at desc limit 30)
       union all select * from (select words(id, body), created_at from nuggets where tier = 'article' and private = 0 and binned_at is null order by created_at desc limit 30))
     where length(text) > 120 order by at desc limit 6`
  ).all() as { text: string }[]
  return recent.map((row) => row.text.replace(/\s+/g, ' ').slice(0, 400))
}

export function registerWrite(): void {
  const db = database()
  // A week's notes (made that week, not private), a few hundred words each at most, as the model's prompt.
  ipcMain.handle('haligtree:ai:week', (_event, monday: unknown) => {
    const from = new Date(`${String(monday)}T00:00`)
    const to = new Date(from.getTime() + 7 * 86_400_000)
    const rows = db.prepare(
      `select label(title, body, named) as title, words(id, body) as text from captures where status != 'discarded' and private = 0 and captured_at >= ? and captured_at < ?
       union all select coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)), words(id, body) from nuggets where tier in ('nugget', 'article', 'question') and private = 0 and binned_at is null and created_at >= ? and created_at < ?`
    ).all(from.toISOString(), to.toISOString(), from.toISOString(), to.toISOString()) as { title: string; text: string }[]
    if (!rows.length) return { error: 'Nothing was written this week to sum up' }
    const notes = rows.map((row) => `- ${row.title}: ${(row.text ?? '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')
    return write(`You sum up someone's week from the notes they kept, in one short paragraph of three to five sentences, speaking to them as "you". ${PLAIN}`, notes,
      `This week you kept ${plural(rows.length, 'note')}, among them “${rows[0].title.replace(/[.!?]+$/, '')}”. (Written by a stand-in for Apple Intelligence, for a test.)`)
  })
  ipcMain.handle('haligtree:ai:name', (_event, text: unknown) => {
    const words = String(text ?? '').trim()
    if (words.length < 12) return { error: 'Too few words to name' }
    return write(`You give a note a short title of two to six words, in the note's own language, saying what it is about. Answer with the title alone. ${PLAIN}`, words,
      `${words.split(/\s+/).slice(0, 4).join(' ')} (a stand-in name)`)
  })
  ipcMain.handle('haligtree:ai:why', (_event, question: unknown, note: unknown) =>
    write(`You say in one short sentence why a note may help answer a question, or plainly that it may not. ${PLAIN}`, `Question: ${String(question ?? '')}\nNote: ${String(note ?? '').slice(0, 1500)}`,
      `It speaks of ${String(note ?? '').split(/\s+/).slice(0, 5).join(' ')}. (A stand-in's reason.)`))
  // Writing help on picked words: the words alone (and, for "Ask me about this", the note they sit in), or the
  // person's own writing beside them for "In my words". Every refusal says what it found, never a catch-all.
  ipcMain.handle('haligtree:ai:help', async (_event, op: unknown, text: unknown, note: unknown) => {
    const help = Object.hasOwn(HELP, String(op)) ? HELP[String(op)] : null
    const words = String(text ?? '').trim()
    if (!help) return { error: 'There is no such help' }
    if (!words) return { error: 'There are no words picked' }
    if (words.length > HELP_MOST) return { error: `Too long for Apple Intelligence on this Mac: ${num(words.length)} characters picked, ${num(HELP_MOST)} at most` }
    const mine = op === 'mine' ? ownWriting(db) : []
    if (op === 'mine' && !mine.length) return { error: 'None of your own notes to learn your voice from yet: write a few, then ask again' }
    const prompt = op === 'mine' ? `SAMPLES:\n${mine.join('\n---\n')}\n\nPASSAGE:\n${words}`
      : op === 'ask' ? `NOTE:\n${String(note ?? '').slice(0, 3000)}\n\nPASSAGE:\n${words}` : words
    const said = await write(help.instructions, prompt, help.stand(words, mine.length))
    if ('error' in said) return said
    const answer = said.text.replace(/^["“'‘]+|["”'’]+$/g, '').trim()
    if (!answer) return { error: 'Apple Intelligence gave no answer' }
    if (op === 'card') {
      const shape = /Q:\s*(.+?)\s*\|\|\s*A:\s*(.+)/s.exec(answer)
      return shape ? { question: shape[1].trim(), answer: shape[2].trim() } : { error: 'Apple Intelligence did not write a question and answer' }
    }
    if (op === 'quote') return { text: lineIn(words, answer) }
    if (answer === words) return { error: op === 'fix' ? 'Nothing to fix: Apple Intelligence found it right as it is' : 'It came back the same as your words' }
    return { text: answer }
  })
}

/**
 * The quote, as the passage has it: the model's line when it is there word for word, else the passage's sentence
 * that shares most of its words, so a pulled quote is always the author's own words, never a model's rewording.
 */
function lineIn(passage: string, line: string): string {
  if (passage.includes(line)) return line
  const sentences = passage.split(/(?<=[.!?…])\s+|\n+/).map((one) => one.trim()).filter(Boolean)
  const said = new Set(line.toLowerCase().match(/\p{L}+/gu) ?? [])
  const shared = (one: string): number => (one.toLowerCase().match(/\p{L}+/gu) ?? []).filter((word) => said.has(word)).length
  return sentences.reduce((best, one) => (shared(one) > shared(best) ? one : best), sentences[0] ?? line)
}
