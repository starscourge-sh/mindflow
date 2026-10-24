import hapticFile from '../../resources/haptic.node?asset&asarUnpack'

/**
 * A light tap on a Force Touch trackpad (native/haptic.mm), as the Mac gives
 * when a window lines up with a guide. Kept rare: a sticky or a goal's
 * card coming into line with an edge or another sticky while you drag it,
 * and a dragged row coming over a new place in a list (the renderer's
 * slotTicker, at most one each 60ms).
 * The Mac plays it only while a finger is on such a trackpad; anywhere else,
 * or should the module not load, nothing happens.
 */
let tapper: ((kind: number) => void) | null | undefined
/** How many taps were asked for: what the stickies' probe reads. */
export let taps = 0
export function tap(kind: 'align' | 'level' = 'align'): void {
  if (process.platform !== 'darwin') return
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
  // Tests count the taps and never play one (HALIGTREE_QA_AWAY).
  if (process.env.HALIGTREE_QA_AWAY) return
  tapper?.(kind === 'level' ? 1 : 0)
}
