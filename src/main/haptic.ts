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
  // Always the firmer of the Mac's taps (its level change): the alignment tap was too light to feel (the user asked
  // for stronger). macOS gives no control of strength beyond which pattern plays. `kind` is kept for the callers.
  void kind
  tapper?.(1)
}
