import type { Variants } from 'motion/react'

/**
 * The app's motion in one place: its curve, how far things travel, and when
 * they should not travel at all.
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
export const byKeys = (): boolean => keyed

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
