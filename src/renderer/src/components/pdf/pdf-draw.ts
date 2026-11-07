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

/**
 * Draws when its turn comes. The answer drops it: while it waits, it never
 * runs; once running, `run` is told to stop through its signal.
 */
export function drawInTurn(rank: number, run: (stopped: () => boolean) => Promise<unknown>): () => void {
  let stopped = false
  const job: Job = { rank, order: count++, run: () => (stopped ? Promise.resolve() : run(() => stopped)) }
  waiting.push(job)
  next()
  return () => {
    stopped = true
    const at = waiting.indexOf(job)
    if (at >= 0) waiting.splice(at, 1)
  }
}

/**
 * The last few pages drawn sharp, kept as their canvases: going back to one
 * shows it at once instead of drawing it again. Keyed by what was drawn and
 * at what size, so a zoom never shows a stale picture.
 */
const kept = new Map<string, HTMLCanvasElement>()
const KEEP = 6
export const keptPage = (key: string): HTMLCanvasElement | undefined => {
  const canvas = kept.get(key)
  if (canvas) {
    kept.delete(key)
    kept.set(key, canvas)
  }
  return canvas
}
export const keepPage = (key: string, canvas: HTMLCanvasElement): void => {
  kept.delete(key)
  kept.set(key, canvas)
  while (kept.size > KEEP) kept.delete(kept.keys().next().value!)
}
