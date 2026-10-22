import { startTransition, useEffect, useState } from 'react'
import { haligtree } from './haligtree'
import { lookUpKindsIn } from '../extensions/note-link'

/**
 * A note's (or task's, or gem's) words asked for the moment it is pressed,
 * not once its page has been drawn: by the time the page is up they are
 * there, and it opens on them at once. Each early read is used once, and only
 * while fresh, so something changed since is never opened on older words.
 */
const READERS: Record<string, (id: string) => Promise<unknown>> = {
  capture: (id) => window.api.captures.get(id),
  task: (id) => haligtree.task(id),
  nugget: (id) => haligtree.item(id),
  article: (id) => haligtree.item(id),
  question: (id) => haligtree.item(id),
  goal: (id) => haligtree.item(id)
}

const FRESH_MS = 2000
type Early = { at: number; read: Promise<unknown>; got?: unknown }
const early = new Map<string, Early>()
const keyOf = (type: string, id: string): string => `${type}:${id}`

/**
 * Every note's words this window has read lately, kept until that note
 * changes: Back, Forward and a link to a note seen before open on them in the
 * very next frame, with no read to wait for. Any save of it (here or in
 * another window) lets it go, so a note is never opened on older words.
 */
const KNOWN_MAX = 80
const known = new Map<string, unknown>()
function remember(type: string, id: string, got: unknown): void {
  if (!got) return
  const key = keyOf(type, id)
  known.delete(key)
  known.set(key, got)
  // Its links' kinds asked for now too, so its page has nothing left to wait for once drawn.
  const body = (got as { body?: unknown; notes?: unknown }).body ?? (got as { notes?: unknown }).notes
  if (body && typeof body === 'object') lookUpKindsIn(body)
  if (known.size > KNOWN_MAX) known.delete(known.keys().next().value!)
}
/** One note's kept words let go: it is being saved, so what was read is old. */
export function forget(id: string): void {
  for (const key of [...known.keys()]) if (key.endsWith(`:${id}`)) known.delete(key)
}
// Told of every write anywhere: one note named lets that one go, anything else all of them.
if (typeof window !== 'undefined') window.api?.captures?.onChange((what) => (what ? what.forEach((one) => forget(one.id)) : known.clear()))

/** Asks for one thing's words now, ahead of opening it. */
function readEarly(type: string, id: string): void {
  const reader = READERS[type]
  if (!reader || !id) return
  const key = keyOf(type, id)
  const had = early.get(key)
  if (had && performance.now() - had.at < FRESH_MS) return
  const one: Early = { at: performance.now(), read: reader(id) }
  one.read.then((got) => void ((one.got = got), remember(type, id, got)), () => void early.delete(key))
  early.set(key, one)
}

/** The same, looked at without using it up: for where it opens, before its page reads it. A note kept from before counts. */
export function peekRead<T>(type: string, id: string): T | undefined {
  const one = early.get(keyOf(type, id))
  return one?.got && performance.now() - one.at < FRESH_MS ? (one.got as T) : (known.get(keyOf(type, id)) as T | undefined)
}

/**
 * The notes either side of the one open, read while it is read: the
 * stepper's ↓ and ↑ then open on their words in the next frame.
 */
export function readAhead(type: string, ids: (string | undefined)[]): void {
  for (const id of ids) if (id && !known.has(keyOf(type, id))) readEarly(type, id)
}

/** Its words if they are already here (read early and answered, or read before and unchanged since), else undefined. */
export function readNow<T>(type: string, id: string): T | undefined {
  const key = keyOf(type, id)
  const one = early.get(key)
  if (one?.got && performance.now() - one.at < FRESH_MS) {
    early.delete(key)
    return one.got as T
  }
  return known.get(key) as T | undefined
}

/** Its words: the early read if there is a fresh one, else asked for now. Kept for the next time it opens. */
export function readFresh<T>(type: string, id: string, read: (id: string) => Promise<T>): Promise<T> {
  const key = keyOf(type, id)
  const one = early.get(key)
  early.delete(key)
  const got = one && performance.now() - one.at < FRESH_MS ? (one.read as Promise<T>) : read(id)
  return got.then((words) => (remember(type, id, words), words))
}

/**
 * Waits for its words (read early, started now if not yet), but never longer
 * than `most` ms: its page then opens on them in one go, rather than drawn
 * empty and again a moment later. Words read before and unchanged need no
 * wait at all. Words slower than that open the page on the note's frame and
 * name, its words filled in as they come (note-coming.tsx).
 * `null`: read already, so the page can turn in this very step, with
 * whatever else the same key or click changes (⌘K closing), in one draw.
 */
export function whenRead(type: string, id: string, most = 400): Promise<void> | null {
  if (known.has(keyOf(type, id))) return null
  readEarly(type, id)
  const one = early.get(keyOf(type, id))
  if (!one || one.got !== undefined) return null
  return Promise.race([one.read.then(() => undefined, () => undefined), new Promise<void>((done) => setTimeout(done, most))])
}

/**
 * Pressing anything that opens a note (a card, a row, a pin, a link to it)
 * starts reading it: the press comes a tenth of a second before the click.
 */
export function readOnPress(): () => void {
  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !(event.target instanceof Element)) return
    const card = event.target.closest('[data-drag-open]')?.getAttribute('data-drag-open')
    const row = event.target.closest('[data-row][data-id][data-type]')
    const [type, id] = card ? [card.slice(0, card.indexOf(':')), card.slice(card.indexOf(':') + 1)] : [row?.getAttribute('data-type'), row?.getAttribute('data-id')]
    if (type && id) readEarly(type, id)
  }
  window.addEventListener('pointerdown', onDown, true)
  return () => window.removeEventListener('pointerdown', onDown, true)
}

/**
 * False until the frame something first shows in has been drawn, then true
 * for good: what can wait a moment (links to it, like notes, its map) is
 * drawn just after its words, never ahead of them. Stepping on to the next
 * note keeps it, so nothing blinks.
 */
export function useAfterFirstPaint(): boolean {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    let after = 0
    const frame = requestAnimationFrame(() => void (after = window.setTimeout(() => startTransition(() => setDrawn(true)), 0)))
    return () => (cancelAnimationFrame(frame), clearTimeout(after))
  }, [])
  return drawn
}
