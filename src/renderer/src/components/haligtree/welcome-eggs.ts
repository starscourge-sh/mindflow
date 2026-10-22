/**
 * The welcome's easter eggs, all in one place so they can be found and
 * switched off. None is ever in the way or needed: each is found by doing
 * something a curious person would try.
 *
 * - Write "42" as your first capture: "It landed." gains a second line.
 *   "Follow the white rabbit" gets one too.
 * - Skip from the very first screen: the note that says where the welcome
 *   waits begins with a line from Bilbo's poem.
 * - Turn the theme dial a full circle one way: it cheers, and says so.
 * - ↑ ↑ ↓ ↓ ← → ← → B A anywhere in the welcome: the keycaps of the one key
 *   turn to cuneiform for the rest of the session, 𒀭 and 𒆠 (An and Ki,
 *   heaven and earth), for Nisaba's scribes, who pressed the first lists
 *   into clay.
 * - Type "play" on an empty Review (all caught up): Ink line, a calm game of
 *   a pen line that grows with each blot it reaches (ink-line.tsx). Esc
 *   leaves; its sounds follow the sound setting.
 */
export const EGGS = true

/** Said under the dial after a full turn. */
export const FULL_TURN = 'Indecisive. Respect.'

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
let heard = 0
let clay = false
/** Fed every key the welcome hears: true the moment the code is complete. */
export function konami(key: string): boolean {
  if (!EGGS || clay) return false
  const want = KONAMI[heard]
  heard = key.toLowerCase() === want.toLowerCase() ? heard + 1 : key === KONAMI[0] ? 1 : 0
  if (heard < KONAMI.length) return false
  heard = 0
  clay = true
  return true
}
/** Whether the keycaps are clay now (for this session only). */
export const inClay = (): boolean => clay
/** A key's glyph, in clay when the code was entered: the modifier is An, the key is Ki. */
export const glyph = (key: string, last: boolean): string => (clay ? (last ? '𒆠' : '𒀭') : key)
