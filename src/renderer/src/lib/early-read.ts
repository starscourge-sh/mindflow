import { startTransition, useEffect, useState } from 'react'
import { vigil } from './vigil'

/**
 * A note's (or task's, or gem's) words asked for the moment it is pressed,
 * not once its page has been drawn: by the time the page is up they are
 * there, and it opens on them at once. Each early read is used once, and only
 * while fresh, so something changed since is never opened on older words.
 */
const READERS: Record<string, (id: string) => Promise<unknown>> = {
  capture: (id) => window.api.captures.get(id),
  task: (id) => vigil.task(id),
  nugget: (id) => vigil.item(id),
  article: (id) => vigil.item(id),
  question: (id) => vigil.item(id)
}

const FRESH_MS = 2000
type Early = { at: number; read: Promise<unknown>; got?: unknown }
const early = new Map<string, Early>()
const keyOf = (type: string, id: string): string => `${type}:${id}`

/** Asks for one thing's words now, ahead of opening it. */
function readEarly(type: string, id: string): void {
  const reader = READERS[type]
  if (!reader || !id) return
  const key = keyOf(type, id)
  const had = early.get(key)
  if (had && performance.now() - had.at < FRESH_MS) return
  const one: Early = { at: performance.now(), read: reader(id) }
  one.read.then((got) => void (one.got = got), () => void early.delete(key))
  early.set(key, one)
}

/** The same, looked at without using it up: for where it opens, before its page reads it. */
export function peekRead<T>(type: string, id: string): T | undefined {
  const one = early.get(keyOf(type, id))
  return one?.got && performance.now() - one.at < FRESH_MS ? (one.got as T) : undefined
}

/** Its words if they are already here (read early and answered), else undefined. Used once. */
export function readNow<T>(type: string, id: string): T | undefined {
  const key = keyOf(type, id)
  const one = early.get(key)
  if (!one?.got || performance.now() - one.at >= FRESH_MS) return undefined
  early.delete(key)
  return one.got as T
}

/** Its words: the early read if there is a fresh one, else asked for now. */
export function readFresh<T>(type: string, id: string, read: (id: string) => Promise<T>): Promise<T> {
  const key = keyOf(type, id)
  const one = early.get(key)
  early.delete(key)
  return one && performance.now() - one.at < FRESH_MS ? (one.read as Promise<T>) : read(id)
}

/**
 * Waits for its words (read early, started now if not yet), but never longer
 * than `most` ms: its page then opens on them in one go, rather than drawn
 * empty and again a moment later. Words that never come cost only the wait.
 */
export function whenRead(type: string, id: string, most = 120): Promise<void> {
  readEarly(type, id)
  const one = early.get(keyOf(type, id))
  if (!one || one.got !== undefined) return Promise.resolve()
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
