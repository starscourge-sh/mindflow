import { useEffect, useState } from 'react'
import type { Variants } from 'motion/react'

/**
 * The app's motion in one place: its curve, how far things travel, and when
 * they should not travel at all.
 *
 * How a screen moves, so that what moves reads as meant rather than as noise:
 * 1. One voice per screen. Only one line types itself in at a time (`speak`);
 *    any other on screen at that moment is simply written. A sequence that
 *    tells a story (the welcome, a recap) takes its turns on purpose.
 * 2. Typing is for the one line that speaks to you: a page hint, the brief's
 *    greeting, what an empty page is for. Never for data: titles, labels,
 *    counts, rows. A line says itself once a session; after that it is written.
 * 3. A number rolls only when it changes in front of you, never as a page
 *    paints (`Rolling`).
 * 4. First paint: one short stagger at most, on the page's main list, 250ms
 *    in all, and only on the first visit in a session (`useFirstVisit`).
 * 5. Reached by a key, nothing moves (`byKeys`). Motion off or Reduce motion,
 *    nothing travels (`shift`, main.css).
 * 6. Decoration waits for the voice: while a line types, the scenery holds
 *    still and a margin mark is drawn only once the line is done (data-voice
 *    on the root, main.css).
 */

/** The one curve the app moves on, the same as `--mf-ease` in CSS. */
export const EASE = [0.16, 1, 0.3, 1] as const

/** Reduce motion is on: things still fade, but nothing moves or grows. */
const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A transform for Motion to animate, written out whole so it runs on the
 * compositor rather than the main thread. With Reduce motion on there is
 * nothing to move: the same call gives the transform at rest, every offset
 * 0 and every scale 1, so only the fade is left. (At rest, not `none`: Motion
 * reads `none` as all zeros, and a scale of zero would make the thing vanish.)
 */
export const shift = (transform: string): string =>
  reduced()
    ? transform.replace(/scale\([^)]*\)/g, 'scale(1)').replace(/(translate[XYZ]?)\(([^)]*)\)/g, (_, name: string, args: string) => `${name}(${args.split(',').map(() => '0px').join(', ')})`)
    : transform

// Whether the last thing you did was a key press or a pointer. What a key
// reaches (G and a letter, j and k, ⌘[) is done hundreds of times a day, so
// it arrives at once, with no settle.
let keyed = false
addEventListener('keydown', () => void (keyed = true), true)
addEventListener('pointerdown', () => void (keyed = false), true)
// Coming back to the window starts afresh: the box, opened by its key from
// another app, still says its line.
addEventListener('focus', () => void (keyed = false))
export const byKeys = (): boolean => keyed

// The one line speaking in this window, and until when.
let voice: { id: string; until: number } | null = null
let quiet: ReturnType<typeof setTimeout> | undefined
// Each line said this session, and which one said it.
const spoken = new Map<string, string>()

/**
 * Whether the line `id` may type itself in for `ms` (rule 1): no when another
 * is speaking, when it was reached by a key, when it has been said before
 * this session, or while the welcome holds the screen (its box examples
 * included). A `story` line is part of a sequence and always takes its turn.
 * Asked again with the same id, the same answer.
 */
export function speak(id: string, text: string, ms: number, story = false): boolean {
  const root = document.documentElement
  const now = performance.now()
  const said = spoken.get(text)
  if (!story && voice?.id !== id && ((voice && voice.until > now) || byKeys() || (said && said !== id) || root.hasAttribute('data-welcoming') || root.hasAttribute('data-welcome-ph'))) return false
  spoken.set(text, id)
  voice = { id, until: Math.max(now + ms, story && voice ? voice.until : 0) }
  root.setAttribute('data-voice', '')
  clearTimeout(quiet)
  quiet = setTimeout(() => hush(id), voice.until - now)
  return true
}

/**
 * When the line `id` may start typing itself in, in ms from now: at once if
 * no other line is speaking, or once the one speaking has finished, so two
 * lines on a page take turns rather than the second simply appearing. Every
 * visit and every way of arriving (a key too) gets its beat; only the
 * welcome, which holds the screen, keeps lines still (null).
 */
export function speakAfter(id: string, ms: number): number | null {
  const root = document.documentElement
  if (root.hasAttribute('data-welcoming') || root.hasAttribute('data-welcome-ph')) return null
  const now = performance.now()
  for (const [one, until] of turns) if (until <= now) turns.delete(one)
  // Behind the lines still speaking on screen (a page kept but out of view
  // does not count); never long, whatever is queued.
  const seen = (one: string): boolean => !!document.querySelector<HTMLElement>(`[data-line="${CSS.escape(one)}"]`)?.offsetParent
  const wait = Math.min(2000, Math.max(0, ...[...turns].filter(([one]) => one !== id && seen(one)).map(([, until]) => until - now)))
  turns.set(id, now + wait + ms)
  root.setAttribute('data-voice', '')
  clearTimeout(quiet)
  quiet = setTimeout(() => (turns.clear(), root.removeAttribute('data-voice')), Math.max(...turns.values()) - now)
  return wait
}
/** The lines taking turns now, and when each is done. A line gone from the page gives its turn up. */
const turns = new Map<string, number>()

/** The line `id` has finished or gone: the screen is free for another. */
export function hush(id: string): void {
  turns.delete(id)
  if (voice?.id !== id) return
  voice = null
  clearTimeout(quiet)
  document.documentElement.removeAttribute('data-voice')
}

const visited = new Set<string>()
/** True the first time `key` is reached this session (rule 4); a revisit arrives settled. */
export function useFirstVisit(key: string): boolean {
  const [first] = useState(() => !visited.has(key))
  useEffect(() => void visited.add(key), [key])
  return first
}

/**
 * One page giving way to the next in the same place (reading through a list,
 * a pass): the new one rises in and the old one lifts away, quicker. Turned by
 * a key, which is how it is mostly done, the old one simply goes. Pass
 * `byKeys()` as `custom` to the AnimatePresence and the page.
 */
export const TURN: Variants = {
  from: () => ({ opacity: 0, transform: shift('translateY(6px)') }),
  here: () => ({ opacity: 1, transform: shift('translateY(0px)') }),
  gone: (keyed: boolean) => (keyed ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: shift('translateY(-6px)'), transition: { duration: 0.1, ease: EASE } })
}
