import { parentPort, workerData } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'
import { bookFunctions } from './book-words'
import { bookJobs, type FromThread, type ToThread } from './reader-jobs'
import { pictureLines, pictureNamed, type Pictures } from './picture-lines'
import { warmEmoji } from './lazy/emoji'

/**
 * The reading thread: the book read on a thread of its own, so a search
 * through every note's words, or matching every name against a long note,
 * never holds main (whose one thread carries every key and click to every
 * window). It has its own connection to the book, read-only: main stays the
 * one writer, and with the log beside the file (db-open.ts) a reader never
 * makes a save wait. Started, asked and ended by reader.ts; no Electron here.
 */

const { file, keptFile } = workerData as { file: string; keptFile: string }
const port = parentPort!
const say = (said: FromThread): void => port.postMessage(said)
const db = new DatabaseSync(file, { readOnly: true })
// A read never waits for a save. The one moment the book can be shut to it is while main folds the log into the
// file: it waits that out here, on this thread, rather than failing.
db.exec('pragma busy_timeout = 2000')

// Every picture's words known so far, by file name; one with none yet is named to main, which reads it.
let known: Map<string, string> | null = null
const unread = new Set<string>()
const pictures: Pictures = {
  known: () => {
    if (known) return known
    try {
      known = new Map((db.prepare('select name, text from picture_words').all() as { name: string; text: string }[]).map((row) => [row.name, row.text]))
    } catch {
      // No picture has been read in this book yet.
      known = new Map()
    }
    return known
  },
  wordsOf: (src) => {
    const name = pictureNamed(src)
    if (!name) return ''
    const kept = pictures.known().get(name)
    if (kept !== undefined) return pictureLines(kept)
    unread.add(name)
    return ''
  }
}
const forgetWords = bookFunctions(db, pictures.wordsOf)

// The Mac's reading of some words: main asks its helper (understand.ts) and sends the answer back.
let needs = 0
const waiting = new Map<number, (answer: Record<string, unknown>) => void>()
const understand = (op: string, body: Record<string, unknown>): Promise<Record<string, unknown>> =>
  new Promise((done) => {
    const need = ++needs
    waiting.set(need, done)
    say({ need, op, body })
  })

const book = bookJobs(db, pictures, { keptFile, understand, named: (_name, run) => run() })
/** The asks in hand, and those among them whose asker has left. */
const inHand = new Set<number>()
const left = new Set<number>()
// A name read before the emoji table has loaded is missing its emoji (book-words.ts): nothing is read until it has.
const ready = warmEmoji()

port.on('message', (said: ToThread) => {
  if ('answer' in said) {
    waiting.get(said.answer)?.(said.value)
    waiting.delete(said.answer)
  } else if ('gone' in said) {
    if (inHand.has(said.gone) || asked.some((one) => one.id === said.gone)) left.add(said.gone)
  } else if ('forget' in said) {
    known = null
    forgetWords()
    book.forget()
  } else if ('end' in said) {
    // Quitting: the book let go of, so main can fold its log into the file with no reader left.
    db.close()
    Atomics.store(said.end, 0, 1)
    Atomics.notify(said.end, 0)
    process.exit(0)
  } else if ('crash' in said) {
    setImmediate(() => { throw new Error('asked to stop, by a test') })
  } else {
    asked.push(said)
    pump()
  }
})

// What a person is typing (⌘K, `@`, a link by name) is answered before the reads a page or a start-up asks for: the
// asks wait here and the next is picked after each one, so a search typed just after start no longer waits behind
// every list, file and first-line read queued before it (8.6 s for the first key on a big book). A read already
// running is never cut short.
const TYPED = new Set<string>(['find', 'search', 'items', 'named'])
const asked: Extract<ToThread, { kind: unknown }>[] = []
let pumping = false
// Nothing is picked until the emoji table has loaded (answer waits for it too): picked before, every ask would start
// and then wait in the order it came.
let warm = false
const warmed = (): void => ((warm = true), pump())
void ready.then(warmed, warmed)
function pump(): void {
  if (pumping || !asked.length || !warm) return
  pumping = true
  // Its own turn of the event loop, so asks that came in while the last one ran are in the queue to be picked from.
  setImmediate(() => {
    const at = asked.findIndex((one) => TYPED.has(one.kind))
    const next = asked.splice(at < 0 ? 0 : at, 1)[0]
    // Started, not awaited: one waiting on main (the Mac's reading of words) lets the next begin, as before.
    void answer(next)
    pumping = false
    pump()
  })
}

async function answer({ id, kind, args }: Extract<ToThread, { kind: unknown }>): Promise<void> {
  inHand.add(id)
  try {
    await ready
    const value = await (book.jobs[kind] as (gone: () => boolean, ...args: unknown[]) => unknown)(() => left.has(id), ...args)
    say({ id, value, reads: book.reads() })
  } catch (error) {
    say({ id, error: error instanceof Error ? error.stack ?? error.message : String(error) })
  }
  inHand.delete(id)
  left.delete(id)
  if (unread.size) {
    say({ unread: [...unread] })
    unread.clear()
  }
}
