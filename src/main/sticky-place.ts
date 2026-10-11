/**
 * How stickies move: one clock for every glide, paced on the screen's own
 * frames, and where a sticky let go near an edge or a neighbour settles.
 * Nothing here knows about windows, so it is tested on its own
 * (test/sticky-place.test.ts).
 */
import { performance } from 'node:perf_hooks'

export type Box = { x: number; y: number; width: number; height: number }
/** How far in from its window's edges a sticky's card is drawn: paper keeps room round it for its lean and shadow. */
export type Inset = { left: number; top: number; right: number; bottom: number }

/** Quick off the mark, then settling: most of the way at once. */
export const outQuart = (t: number): number => 1 - (1 - t) ** 4
export const outCubic = (t: number): number => 1 - (1 - t) ** 3
/**
 * A sticky pointed at lifts, and sets down, in this long on this curve,
 * glass (its window rises) and paper (its card rises in the page) alike: the
 * page's CSS uses cubic-bezier(0.22, 1, 0.36, 1) over the same 240ms.
 */
export const LIFT_MS = 240
export const outQuint = (t: number): number => 1 - (1 - t) ** 5
/** Past the mark by a hair, then back: a thing set down settles rather than stopping dead. */
export const settle = (t: number): number => {
  const s = 1.4
  return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2
}

/**
 * Every glide under way shares one clock that wakes once a display frame
 * (60 or 120 times a second, as the screen runs), rather than each keeping a
 * 16ms timer of its own: those drift against the screen and against each
 * other, so windows moving together stuttered out of step. Each step is told
 * the same moment, and says whether it wants another frame.
 */
type Step = (now: number) => boolean
const steps = new Set<Step>()
let ticking: ReturnType<typeof setTimeout> | null = null
let frame = (): number => 1000 / 60
/** The length of one display frame, ms: set once the screen can be asked. */
export const paceBy = (ms: () => number): void => void (frame = ms)
function tick(): void {
  const now = performance.now()
  for (const step of [...steps]) if (!step(now)) steps.delete(step)
  if (!steps.size) return void (ticking = null)
  // The next frame's edge, not "a frame from now": the wait shrinks when a step ran long, so the beat holds.
  const ms = frame()
  ticking = setTimeout(tick, Math.max(1, ms - ((performance.now() - now) % ms)))
}
/** Run `step` once a frame until it returns false; the way to stop it early is the function given back. */
export function onFrames(step: Step): () => void {
  steps.add(step)
  if (!ticking) ticking = setTimeout(tick, 0)
  return () => void steps.delete(step)
}
/**
 * One glide of `ms`: `at(t)` is told how far through it is (0 to 1), once a
 * frame and exactly once at 1, then `done`. Returns the way to stop it.
 */
export function tween(ms: number, at: (t: number) => boolean | void, done?: () => void): () => void {
  const start = performance.now()
  return onFrames((now) => {
    const t = Math.min(1, (now - start) / ms)
    if (at(t) === false) return false
    if (t < 1) return true
    done?.()
    return false
  })
}

/** The card inside its window. */
export const cardOf = (win: Box, inset: Inset): Box => ({ x: win.x + inset.left, y: win.y + inset.top, width: win.width - inset.left - inset.right, height: win.height - inset.top - inset.bottom })

/**
 * A window placed so its card is all on the screen: the room round a paper
 * card may hang past the edge, the card itself never does.
 */
export function cardInView(win: Box, inset: Inset, area: Box): Box {
  const card = cardOf(win, inset)
  const x = Math.max(area.x, Math.min(card.x, area.x + area.width - card.width))
  const y = Math.max(area.y, Math.min(card.y, area.y + area.height - card.height))
  return { ...win, x: Math.round(x - inset.left), y: Math.round(y - inset.top) }
}

/** How near counts as "let go by" an edge or a neighbour, the gap a sticky keeps to its neighbours, and its margin from the screen's edge. */
export const REACH = 12
export const GAP = 8
export const MARGIN = 8

/**
 * Where a card let go at `card` settles: within REACH of the screen's edge it
 * lines up MARGIN in from it; within REACH of the line a neighbour's side
 * makes (GAP away from it) it lines up there, and with the neighbour's top or
 * left too when that is as near. Each way, across and down, takes the nearest
 * pull; none near, it stays where it was let go.
 */
export function magnet(card: Box, others: Box[], area: Box): { x: number; y: number } {
  const across: { to: number; far: number }[] = []
  const down: { to: number; far: number }[] = []
  const pull = (list: { to: number; far: number }[], now: number, to: number): void => {
    const far = Math.abs(now - to)
    if (far <= REACH) list.push({ to, far })
  }
  const right = card.x + card.width
  const bottom = card.y + card.height
  pull(across, card.x, area.x + MARGIN)
  pull(across, card.x, area.x + area.width - MARGIN - card.width)
  pull(down, card.y, area.y + MARGIN)
  pull(down, card.y, area.y + area.height - MARGIN - card.height)
  for (const one of others) {
    const besideY = card.y < one.y + one.height && one.y < bottom
    const besideX = card.x < one.x + one.width && one.x < right
    if (besideY) {
      // Side by side: its left to their right, or its right to their left; tops lined up when near.
      pull(across, card.x, one.x + one.width + GAP)
      pull(across, card.x, one.x - GAP - card.width)
      if (Math.abs(card.x - (one.x + one.width + GAP)) <= REACH || Math.abs(right - (one.x - GAP)) <= REACH) pull(down, card.y, one.y)
    }
    if (besideX) {
      // One above the other: its top to their foot, or its foot to their top; lefts lined up when near.
      pull(down, card.y, one.y + one.height + GAP)
      pull(down, card.y, one.y - GAP - card.height)
      if (Math.abs(card.y - (one.y + one.height + GAP)) <= REACH || Math.abs(bottom - (one.y - GAP)) <= REACH) pull(across, card.x, one.x)
    }
  }
  const nearest = (list: { to: number; far: number }[], now: number): number => (list.length ? list.reduce((a, b) => (b.far < a.far ? b : a)).to : now)
  return { x: Math.round(nearest(across, card.x)), y: Math.round(nearest(down, card.y)) }
}

/**
 * Pulled past its least or most size, a grip gives a little, as a rubber
 * band would: up to 6 points, less and less the further it is pulled.
 */
export function rubber(want: number, least: number, most: number): number {
  const give = (over: number): number => 6 * (1 - Math.exp(-over / 40))
  if (want < least) return least - give(least - want)
  if (want > most) return most + give(want - most)
  return want
}
