import { useEffect, useState } from 'react'
import { positionalKeys, type MotionProps, type TargetAndTransition, type Transition, type Variants } from 'motion/react'

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

/** Motion off (the app's setting) or Reduce motion (the system's): nothing travels. */
export const still = (): boolean => document.documentElement.dataset.motion === 'off' || reduced()

/**
 * A frame loop that runs only while the window is looked at (`data-awake`,
 * progress-bar.tsx): away, hidden or behind another window, it holds still and
 * picks up again on return. `tick` returns false to stop until `again()`.
 */
export function awakeFrames(tick: (now: number) => boolean | void): { again: () => void; stop: () => void } {
  const root = document.documentElement
  let frame = 0
  const run = (now: number): void => {
    frame = 0
    if (!root.hasAttribute('data-awake')) return
    if (tick(now) !== false) frame = requestAnimationFrame(run)
  }
  const again = (): void => void (!frame && root.hasAttribute('data-awake') && (frame = requestAnimationFrame(run)))
  const seen = new MutationObserver(again)
  seen.observe(root, { attributes: true, attributeFilter: ['data-awake'] })
  again()
  return { again, stop: () => (seen.disconnect(), cancelAnimationFrame(frame), (frame = 0)) }
}

/**
 * The same, read live: turn Motion off, or Reduce motion on, with the page
 * open and what asks this hears it at once (a demo's timers stop).
 */
export function useStill(): boolean {
  const [now, setNow] = useState(still)
  useEffect(() => {
    const again = (): void => setNow(still())
    const watch = new MutationObserver(again)
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    media.addEventListener('change', again)
    return () => (watch.disconnect(), media.removeEventListener('change', again))
  }, [])
  return now
}

/**
 * Reduce motion for every whole transform, once for the app. Motion's
 * `MotionConfig reducedMotion="user"` makes x, y, scale, width and the like
 * arrive at once, but not a `transform: '...'` written out whole (as this file
 * asks, for the compositor), so a slide or a grow still played. Listing
 * `transform` among those keys makes it arrive at once too, while opacity
 * still fades. Motion off is already the global skip (lib/haligtree.ts). `shift`
 * stays for the start of a move, so nothing even begins away from its place.
 */
export function stillTransforms(): void {
  positionalKeys.add('transform')
}

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

/**
 * How a scroll the app makes goes: a glide, or there at once with Motion off
 * or Reduce motion. For `scrollIntoView` and `scrollTo`, which ignore the CSS.
 */
export const glideWay = (): ScrollBehavior =>
  document.documentElement.dataset.motion === 'off' || reduced() ? 'instant' : 'smooth'

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

/**
 * Whether something was reached by a key, read once each time `shown`
 * changes (as it appears), never on a later render: read on every render, a
 * click inside a thing opened by a key added its entrance afterwards and
 * played it then.
 */
export function useByKeys(shown: unknown): boolean {
  const [read, setRead] = useState(() => ({ shown, keyed }))
  if (read.shown === shown) return read.keyed
  const next = { shown, keyed }
  setRead(next)
  return next.keyed
}

/**
 * A ref for a pop-over, menu or side sheet (components/ui): opened by a key,
 * it is marked as it appears, and main.css lets it simply be there and go at
 * once (rule 5); opened by a click it still eases in. Read once as it
 * appears, so a click inside it later never plays the entrance again.
 */
export const markKeyed = (node: HTMLElement | null): void => void (node && keyed && node.setAttribute('data-keyed', ''))

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

/**
 * Three speeds for what answers the hand (Fluid Functionalism's springs): the
 * bigger the thing that moves, the slower. `fast` for a hover, a highlight, a
 * fold; `moderate` for a selection travelling between choices, which must land
 * exactly; `slow` for a whole panel. Each enter is a spring, so a change of
 * mind turns it round from where it is; each has its `exit`, a plain tween one
 * step quicker, so going away reads as done rather than the arrival played
 * backwards. Take one of these rather than writing a duration.
 */
export const spring = {
  fast: { type: 'spring' as const, duration: 0.08, bounce: 0, exit: { duration: 0.06 } },
  moderate: { type: 'spring' as const, duration: 0.16, bounce: 0, exit: { duration: 0.12 } },
  slow: { type: 'spring' as const, duration: 0.24, bounce: 0.12, exit: { duration: 0.16 } }
} as const

/**
 * The two weights a label moves between: at rest, and chosen or open. Set as
 * `font-weight`, not a variation setting: the root's settings give the face
 * its SOFT and WONK, and a variation list on a label would replace them.
 */
export const WEIGHT = { normal: 400, chosen: 550 } as const

/**
 * A panel that comes and goes in place (Recent, the reword card): reached by
 * a key it is simply there and simply goes (rule 5); by a click it moves
 * `from` to `to` on `enter` and leaves to `away`. How it leaves is read as it
 * leaves.
 */
export function keyedMotion(from: TargetAndTransition, to: TargetAndTransition, enter: Transition, away: TargetAndTransition): MotionProps {
  return {
    initial: keyed ? false : from,
    animate: { ...to, transition: enter },
    variants: { gone: () => (keyed ? { opacity: 0, transition: { duration: 0 } } : away) },
    exit: 'gone'
  }
}

/**
 * A sheet summoned over the page (⌘K, “I have 15 minutes”): opened by its key
 * it is simply there (rule 5); opened by a click the scrim fades in over 120ms
 * and the panel rises 6px from a hair smaller. Leaving after a key it is gone
 * at once; after a click it fades out quickly on the app's ease-out curve.
 * `keyed` is read once, as it opens; how it leaves is read as it leaves.
 */
export function sheetMotion(keyed: boolean, rise = 0.12): { scrim: MotionProps; panel: MotionProps } {
  const away = (soft: Record<string, unknown>) => () => (byKeys() ? { opacity: 0, transition: { duration: 0 } } : { ...soft, transition: { duration: 0.09, ease: EASE } })
  return {
    scrim: {
      initial: keyed ? false : { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.12, ease: EASE } },
      variants: { gone: away({ opacity: 0 }) },
      exit: 'gone'
    },
    panel: {
      initial: keyed ? false : { opacity: 0, transform: shift('translateY(6px) scale(0.98)') },
      animate: { opacity: 1, transform: shift('translateY(0px) scale(1)'), transition: { type: 'spring', duration: rise, bounce: 0 } },
      variants: { gone: away({ opacity: 0, transform: shift('translateY(3px) scale(0.99)') }) },
      exit: 'gone'
    }
  }
}
