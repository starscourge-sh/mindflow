import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import threadFile from './reader-worker?modulePath'
import { bookJobs, type Answered, type Asked, type FromThread, type Jobs, type ToThread } from './reader-jobs'
import { pictures, readSoon } from './picture-words'
import { understand } from './understand'
import { named, noted } from './stalls'

/**
 * Main's side of the reading thread (reader-worker.ts). Every key and click
 * reaches every window through main's one thread, so nothing may hold it:
 * search and what a note is offered read the whole book, and are asked of a
 * thread that has its own read-only connection to it instead. Main stays the
 * book's one writer.
 *
 * `ask` is the whole of it: a kind (reader-jobs.ts), what it carries, and an
 * answer in its own time. An ask may name a `slot`, the one thing it is the
 * latest ask for (one search box's words, one note's offers): while an ask
 * of that slot is in hand, only the newest one after it waits, and an older
 * one that had not begun is answered as the newer one is. `left` says the
 * asker of a slot is gone: its waiting ask is answered null without being
 * read, and the one in hand stops at its next pause.
 *
 * The thread ends with the app (`endReader`). If it ever stops on its own, or
 * cannot answer an ask, that is said in the freeze log (stalls.ts) and the ask
 * is answered here on main, by the same code, rather than lost.
 */

type Ask = { id: number; kind: keyof Jobs; args: unknown[]; slot?: string; done: (value: unknown) => void; failed: (error: unknown) => void; /** Older asks that gave way to this one. */ with: Ask[]; left?: boolean }

let thread: Worker | null = null
let book: DatabaseSync
let ending = false
/** Main's own, made only if the thread has stopped. */
let here: ReturnType<typeof bookJobs> | null = null
/** Sent to the thread and not yet answered; per slot, the one in hand and the one waiting behind it. */
const sent = new Map<number, Ask>()
const inHand = new Map<string, Ask>()
const behind = new Map<string, Ask>()
let ids = 0
const stats = { asked: 0, gaveWay: 0, left: 0, onMain: 0, reads: 0, stopped: '' }

const keptFile = (): string => join(app.getPath('userData'), 'offer-roots.json')
const tell = (said: ToThread): void => thread?.postMessage(said)

/** Ask the reading thread. */
export function ask<K extends keyof Jobs>(kind: K, args: Asked<K>, slot?: string): Promise<Answered<K>> {
  stats.asked++
  // The very same ask (its kind and what it carries) while one is still out: answered by that one, never queued again.
  // Home, a list and the Feed each asked their whole-book reads again on every visit, and on a big book the copies
  // piled up on the thread faster than it read them (thirty at once), so a search typed later waited 20 s behind them.
  const same = slot ? undefined : `${kind}\u0000${JSON.stringify(args)}`
  const out = same ? asking.get(same) : undefined
  if (out) return out as Promise<Answered<K>>
  const made = new Promise<unknown>((done, failed) => {
    const one: Ask = { id: ++ids, kind, args, slot, done, failed, with: [] }
    if (!thread) return onMain(one)
    if (!slot || !inHand.has(slot)) return send(one)
    // A newer ask for the same thing: the one that had not begun gives way, and is answered as this one is.
    const was = behind.get(slot)
    if (was) {
      stats.gaveWay++
      one.with.push(was, ...was.with)
      was.with = []
    }
    behind.set(slot, one)
  })
  if (same) (asking.set(same, made), void made.then(() => asking.delete(same), () => asking.delete(same)))
  return made as Promise<Answered<K>>
}
/** The asks still out, by kind and what they carry (not those with a slot, which give way to newer ones instead). */
const asking = new Map<string, Promise<unknown>>()

/** The asker of a slot has left (a note closed, a search box gone): nothing more is read for it. */
export function left(slot: string): void {
  const waiting = behind.get(slot)
  if (waiting) {
    behind.delete(slot)
    stats.left++
    for (const each of [waiting, ...waiting.with]) each.done(null)
  }
  const running = inHand.get(slot)
  if (!running || running.left) return
  running.left = true
  stats.left++
  tell({ gone: running.id })
}

function send(one: Ask): void {
  sent.set(one.id, one)
  if (one.slot) inHand.set(one.slot, one)
  tell({ id: one.id, kind: one.kind, args: one.args })
}

/** An ask is over: its slot is free for the one waiting behind it. */
function over(one: Ask): void {
  sent.delete(one.id)
  if (!one.slot || inHand.get(one.slot) !== one) return
  inHand.delete(one.slot)
  const next = behind.get(one.slot)
  if (!next) return
  behind.delete(one.slot)
  if (thread) send(next)
  else onMain(next)
}

const answered = (one: Ask, value: unknown): void => { for (const each of [one, ...one.with]) each.done(one.left ? null : value) }

/** Answered here, on main's own thread, by the same code: only when the reading thread cannot. */
function onMain(one: Ask): void {
  stats.onMain++
  here ??= bookJobs(book, pictures, { keptFile: keptFile(), understand: (op, body) => understand(op, body, 'background'), named })
  const run = here.jobs[one.kind] as (gone: () => boolean, ...args: unknown[]) => unknown
  new Promise((done) => done(named(`${one.kind}, on main (the reading thread has stopped)`, () => run(() => !!one.left, ...one.args))))
    .then((value) => answered(one, value), (error) => { for (const each of [one, ...one.with]) each.failed(error) })
    .finally(() => over(one))
}

const faults = new Set<string>()
function heard(said: FromThread): void {
  if ('need' in said) return void understand(said.op, said.body, 'background').then((value) => tell({ answer: said.need, value }))
  if ('unread' in said) return readSoon(said.unread)
  const one = sent.get(said.id)
  if (!one) return
  if ('error' in said) {
    // Said once per kind, then answered here: an ask is never lost to a fault on the thread.
    if (!faults.has(one.kind)) noted(`the reading thread could not answer “${one.kind}” (${said.error.split('\n')[0]}): answered on main instead`)
    faults.add(one.kind)
    sent.delete(one.id)
    return onMain(one)
  }
  stats.reads = said.reads
  over(one)
  answered(one, said.value)
}

/** The thread is gone before the app is: said in the freeze log, and everything asked of it is answered on main from here on. */
function stopped(why: string): void {
  if (!thread || ending) return
  thread = null
  stats.stopped = why
  noted(`the reading thread stopped (${why}): search and link offers are answered on main from here on`)
  console.error(`The reading thread stopped: ${why}`)
  const waiting = [...sent.values(), ...behind.values()]
  sent.clear()
  inHand.clear()
  behind.clear()
  for (const one of waiting) onMain({ ...one, slot: undefined })
}

/** New words were read in a picture: search's list is read again, on the thread and here. */
export function forgetWords(): void {
  tell({ forget: true })
  here?.forget()
}

/** Start the thread on the book main has just opened (captures.ts). */
export function startReader(db: DatabaseSync, file: string): void {
  book = db
  try {
    thread = new Worker(threadFile, { workerData: { file, keptFile: keptFile() }, name: 'haligtree-reader' })
  } catch (error) {
    stats.stopped = String(error)
    noted(`the reading thread did not start (${String(error)}): search and link offers are answered on main`)
    return
  }
  thread.on('message', heard)
  thread.on('error', (error) => stopped(error instanceof Error ? error.message : String(error)))
  thread.on('exit', (code) => stopped(`it ended with code ${code}`))
  // It never keeps the app from quitting.
  thread.unref()
  // A development or test run reads what was asked, and can stop the thread as a fault would.
  if (!app.isPackaged || process.env.HALIGTREE_QA_AWAY)
    Object.assign(globalThis, { readerStats: () => ({ ...stats, alive: !!thread, inHand: sent.size, waiting: behind.size, doing: [...sent.values()].map((one) => one.kind) }), readerCrash: () => tell({ crash: true }) })
}

/**
 * The app is quitting: the thread lets go of the book first, so main folds the log into the file with no reader
 * left on it (captures.ts `shutDatabase`). Main waits for it to say so: it answers at once unless it is in the
 * middle of a read, and then when that read ends; a thread that cannot answer is ended all the same.
 */
export function endReader(): void {
  const one = thread
  if (!one) return
  ending = true
  thread = null
  const done = new Int32Array(new SharedArrayBuffer(4))
  one.postMessage({ end: done } satisfies ToThread)
  try {
    Atomics.wait(done, 0, 0, 3000)
  } catch {
    // This thread may not wait: the thread is ended below either way.
  }
  void one.terminate()
}
