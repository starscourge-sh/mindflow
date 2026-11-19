/**
 * Every page picture a window draws, one at a time and the most wanted first.
 * pdf.js reads every page in one worker, in the order it is asked: a jump that
 * asks for a dozen thumbnails and the pages beside the one you want had it read
 * all of them before the page you came for. Here a page waits its turn, the
 * page in view goes ahead of everything, and one no longer wanted (scrolled
 * past, a thumbnail gone from the rail) is dropped before it ever reaches the
 * worker.
 */

/**
 * Lower goes first: the page in view, then the rail's thumbnails in its view, then the pages
 * either side. A thumbnail costs a fraction of a sharp page, and one in view is seen now, where a
 * page ahead is only wanted later: behind them, a rail of empty boxes waited a second or two after
 * every opening while pages out of sight were drawn.
 */
export const IN_VIEW = 0
export const THUMB = 1
export const AHEAD = 2

type Job = { rank: number; run: () => Promise<unknown>; order: number }
const waiting: Job[] = []
let running = 0
let count = 0
/** One at a time: the worker reads one page at a time anyway, and the next one waiting may yet be outranked. */
const AT_ONCE = 1

const next = (): void => {
  while (running < AT_ONCE && waiting.length) {
    waiting.sort((a, b) => a.rank - b.rank || a.order - b.order)
    const job = waiting.shift()!
    running++
    void job.run().catch(() => {}).finally(() => {
      running--
      next()
    })
  }
}

/** A page's place in the queue: drop it, or move it up or down as it comes nearer the view or goes. */
export type Turn = (() => void) & { rerank: (rank: number) => void }

/**
 * Draws when its turn comes. The answer drops it: while it waits, it never
 * runs; once running, `run` is told to stop through its signal. A page drawn
 * ahead that scrolls into view is moved up the queue (`rerank`), never dropped
 * and asked for again, so the drawing it began is not thrown away.
 */
export function drawInTurn(rank: number, run: (stopped: () => boolean) => Promise<unknown>): Turn {
  let stopped = false
  const job: Job = { rank, order: count++, run: () => (stopped ? Promise.resolve() : run(() => stopped)) }
  waiting.push(job)
  next()
  const drop = (): void => {
    stopped = true
    const at = waiting.indexOf(job)
    if (at >= 0) waiting.splice(at, 1)
  }
  return Object.assign(drop, { rerank: (now: number) => void (job.rank = now) })
}

/**
 * Pages drawn sharp, kept as their canvases: going back to one, or reaching
 * one drawn ahead, shows it at once instead of drawing it again. Keyed by what
 * was drawn and at what size, so a zoom never shows a stale picture. Sized to
 * the computer's memory, counted in pixels: a sharp page on a Retina screen is
 * about 30MB, so a Mac with 8GB or more keeps 256MB of pages (about eight),
 * one with less keeps fewer, never under four pages' worth. The least lately
 * seen go first.
 */
const kept = new Map<string, HTMLCanvasElement>()
const deviceMemory = typeof navigator !== "undefined" ? ((navigator as { deviceMemory?: number }).deviceMemory ?? 4) : 4
export const KEEP_BYTES = Math.max(4, Math.min(8, deviceMemory)) * 32 * 2 ** 20
const bytes = (canvas: HTMLCanvasElement): number => canvas.width * canvas.height * 4
let held = 0
export const keptPage = (key: string): HTMLCanvasElement | undefined => {
  const canvas = kept.get(key)
  if (canvas) {
    kept.delete(key)
    kept.set(key, canvas)
  }
  return canvas
}
export const keepPage = (key: string, canvas: HTMLCanvasElement): void => {
  const old = kept.get(key)
  if (old) (held -= bytes(old), kept.delete(key))
  kept.set(key, canvas)
  held += bytes(canvas)
  // Always at least the page just drawn and the one before it, however large.
  while (held > KEEP_BYTES && kept.size > 2) {
    const [first, gone] = kept.entries().next().value!
    kept.delete(first)
    held -= bytes(gone)
    // Let go of its pixels at once, unless a sheet still shows it.
    if (!gone.isConnected) gone.width = gone.height = 0
  }
}

/**
 * The end of a fling: the pages resting a moment (`REST` ms) ends it, if no
 * slower scroll did first. While one is on, thumbnails wait and the rail keeps
 * up at once instead of gliding; a jump or reading pace changes nothing.
 */
const REST = 150
let moving = 0
/** Told by the pages on each scroll. */
export function pagesScrolled(): void {
  window.clearTimeout(moving)
  moving = window.setTimeout(() => {
    moving = 0
    if (flinging) calmed()
  }, REST)
}
/** `run` now unless the pages are flung, else once they slow or rest; the answer drops it if it has not run. */
export function whenStill(run: () => void): () => void {
  if (!flinging) return run(), () => {}
  onCalm.push(run)
  return () => {
    const at = onCalm.indexOf(run)
    if (at >= 0) onCalm.splice(at, 1)
  }
}

/**
 * A fling: the pages going by faster than anyone reads (over `FLING` px a ms,
 * a page every third of a second or so). A page drawn mid-fling costs a frame
 * or several on the main thread and is gone before it shows, so drawing waits
 * until the pages slow to reading speed or rest.
 */
const FLING = 3
let flinging = false
let lastAt = 0
let lastTop = 0
/** Fast scrolls in a row. */
let fast = 0
const onCalm: (() => void)[] = []
const calmed = (): void => {
  flinging = false
  onCalm.splice(0).forEach((run) => run())
}
/** Told by the pages on each scroll, with where they are: their speed decides whether a fling is on. */
export function pagesAt(top: number): void {
  const now = performance.now()
  const speed = Math.abs(top - lastTop) / Math.max(1, now - lastAt)
  // A fling is fast scroll after fast scroll: one jump alone (a page typed in the box, a link, opening at a page)
  // never holds drawing up.
  fast = now - lastAt < 100 && speed > FLING ? fast + 1 : 0
  lastAt = now
  lastTop = top
  if (fast >= 3) flinging = true
  else if (flinging) calmed()
}
/** Waits while the pages are flung; the pages resting ends the wait too. */
export const calm = (): Promise<void> => (flinging ? new Promise((done) => onCalm.push(done)) : Promise.resolve())

/** Whether any page or thumbnail is being drawn or waits to be: work in the background (reading a book's words ahead) holds off until none is. */
export const drawing = (): boolean => running > 0 || waiting.length > 0

/** Whether something more wanted than `rank` waits its turn: a page out of sight then goes back in line behind it. */
export const outranked = (rank: number): boolean => waiting.some((one) => one.rank < rank)
