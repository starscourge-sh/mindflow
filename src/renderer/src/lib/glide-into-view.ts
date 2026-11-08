import { afterLayout } from './after-layout'
import { still } from './motion'

/**
 * Brings a row into its list's view the way a reader's sidebar follows the page: an eased glide,
 * never a snap. A row already in view moves nothing. A new row while gliding (pages turning fast)
 * bends the same glide toward it from where the list is now. The list is the person's: a wheel, a
 * press or a key on it stops the glide at once. With motion off or Reduce motion on, it goes
 * straight there.
 */

type Glide = { row: HTMLElement; at: number; frame: number; stop: () => void }
const gliding = new WeakMap<HTMLElement, Glide>()

/** How quickly the gap closes: about two thirds of it each 90ms, settled in about a third of a second. */
const PACE = 90
/** Past this many views away, the glide starts this far short: the list never streams pages of rows past. */
const FAR = 1.5

/** The nearest scrolling list holding the row. */
const listOf = (row: HTMLElement): HTMLElement | null => {
  for (let at = row.parentElement; at; at = at.parentElement) {
    const flow = getComputedStyle(at).overflowY
    if ((flow === 'auto' || flow === 'scroll') && at.scrollHeight > at.clientHeight) return at
  }
  return null
}

/**
 * Where the list's top must be for the row to show whole, the least move from now; read from the
 * row's place as it is now, so rows above it growing as they draw never send the glide astray.
 */
const wanted = (list: HTMLElement, row: HTMLElement, margin: number): number => {
  const box = list.getBoundingClientRect()
  const it = row.getBoundingClientRect()
  const top = it.top - box.top
  const bottom = it.bottom - box.top
  let move = 0
  if (top < margin) move = top - margin
  else if (bottom > list.clientHeight - margin) move = Math.min(top - margin, bottom - list.clientHeight + margin)
  return Math.max(0, Math.min(list.scrollHeight - list.clientHeight, Math.round(list.scrollTop + move)))
}

export function glideIntoView(row: HTMLElement | null | undefined, options: { jump?: boolean; margin?: number } = {}): void {
  // Where the row and its list are, read once the page is laid out, never while it is still being built (lib/after-layout.ts).
  if (row) afterLayout(row, () => glideNow(row, options))
}

function glideNow(row: HTMLElement, { jump = false, margin = 8 }: { jump?: boolean; margin?: number }): void {
  if (!row.isConnected) return
  const list = listOf(row)
  if (!list) return
  const glide = gliding.get(list)
  if (glide) return void (glide.row = row)
  const target = wanted(list, row, margin)
  if (target === list.scrollTop) return
  if (jump || still()) return void (list.scrollTop = target)
  const far = FAR * list.clientHeight
  if (Math.abs(target - list.scrollTop) > far) list.scrollTop = target - Math.sign(target - list.scrollTop) * far
  const own: Glide = {
    row,
    at: list.scrollTop,
    frame: 0,
    stop: () => {
      cancelAnimationFrame(own.frame)
      for (const way of HANDS) list.removeEventListener(way, own.stop)
      if (gliding.get(list) === own) gliding.delete(list)
    },
  }
  gliding.set(list, own)
  // The person's hand on the list wins.
  for (const way of HANDS) list.addEventListener(way, own.stop, { passive: true })
  let then = performance.now()
  const step = (now: number): void => {
    if (!own.row.isConnected) return own.stop()
    // The list moved under the glide (rows above drawn taller, scroll anchoring): carry on from there.
    if (Math.abs(list.scrollTop - own.at) > 1.5) own.at = list.scrollTop
    const goal = wanted(list, own.row, margin) - list.scrollTop + own.at
    own.at += (goal - own.at) * (1 - Math.exp(-(now - then) / PACE))
    then = now
    if (Math.abs(goal - own.at) < 0.5) own.at = goal
    list.scrollTop = own.at
    if (own.at === goal) return own.stop()
    own.frame = requestAnimationFrame(step)
  }
  own.frame = requestAnimationFrame(step)
}

const HANDS = ['wheel', 'pointerdown', 'keydown'] as const
