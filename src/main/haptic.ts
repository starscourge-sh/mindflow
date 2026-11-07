import hapticFile from '../../resources/haptic.node?asset&asarUnpack'
import { setting } from './captures'

/**
 * A firm tap on a Force Touch trackpad (native/haptic.mm), the Mac's level-change
 * pattern, the strongest it lets an app play. Kept rare: a sticky or a goal's
 * card coming into line with an edge or another sticky while you drag it,
 * and a dragged row coming over a new place in a list (the renderer's
 * slotTicker, at most one each 60ms).
 * The Mac plays it only while a finger is on such a trackpad; anywhere else,
 * or should the module not load, nothing happens.
 */
let tapper: ((kind: number) => void) | null | undefined
/** How many taps were asked for: what the stickies' probe reads. */
export let taps = 0
/** Each tap's kind, in order: what the scrub probe reads (tests never play one). */
export const tapKinds: Array<'align' | 'level'> = []
export function tap(kind: 'align' | 'level' = 'align'): void {
  if (process.platform !== 'darwin') return
  // "Haptic taps" off in Settings: none at all, played or counted.
  if (!setting('haptics', true)) return
  if (tapper === undefined && !process.env.HALIGTREE_QA_AWAY) {
    try {
      const module = { exports: {} as { tap?: (kind: number) => void } }
      process.dlopen(module, hapticFile)
      tapper = module.exports.tap ?? null
    } catch {
      tapper = null
    }
  }
  taps += 1
  if (tapKinds.push(kind) > 500) tapKinds.shift()
  // Tests count the taps and never play one (HALIGTREE_QA_AWAY).
  if (process.env.HALIGTREE_QA_AWAY) return
  // macOS gives no control of strength beyond which pattern plays. The firm tap is its level change; the light one its
  // generic tap, since the alignment pattern was too light to feel (the user asked for stronger).
  tapper?.(kind === 'level' ? 1 : 2)
}

/**
 * Quick capture is a panel that takes the keys without making Haligtree the
 * active app, and macOS shows only the active app's cursor: over its buttons
 * the hand never came, over its writing never the I-beam. This lets the
 * window server show Haligtree's cursor from the background too (native/haptic.mm).
 * Says whether it took; false off a Mac or should the module not load.
 */
export let cursorShown = false
export function cursorInBackground(): boolean {
  if (process.platform !== 'darwin') return false
  try {
    const module = { exports: {} as { cursorInBackground?: () => boolean } }
    process.dlopen(module, hapticFile)
    cursorShown = module.exports.cursorInBackground?.() ?? false
  } catch {
    cursorShown = false
  }
  return cursorShown
}
