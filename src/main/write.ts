import { ipcMain } from 'electron'
import { database } from './captures'
import { caps, understand } from './understand'
import { plural } from './dates'

/**
 * Words written for you by Apple Intelligence's on-device model (FoundationModels,
 * through native/understand.swift "write"), only on a Mac that has it turned on,
 * and only from your own notes: "Your week, in a paragraph", a name for an
 * Untitled note, and why a note may help answer a question. Always offered,
 * never put in unasked; said to be written on this Mac. Nothing leaves the Mac.
 * Under HALIGTREE_QA_CAPS=ai a stand-in answers instead, plainly marked, so a
 * probe can drive the surfaces on a Mac without Apple Intelligence.
 */

async function write(instructions: string, prompt: string, stand: string): Promise<{ text: string } | { error: string }> {
  if (process.env.HALIGTREE_QA_CAPS === 'ai') return { text: stand }
  const have = await caps()
  if (have.ai !== 'available') return { error: 'Needs Apple Intelligence' }
  const said = await understand('write', { instructions, prompt: prompt.slice(0, 8000) })
  return said.error ? { error: said.error.message } : { text: String(said.text ?? '').trim() }
}

const PLAIN = 'Write in plain, warm English a student could read. Use only what the notes say; never add facts, names or numbers that are not in them. No lists, no headings, no quotation marks around the answer.'

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
}
