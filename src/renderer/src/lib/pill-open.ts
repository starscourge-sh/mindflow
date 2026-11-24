/**
 * How much of the tape to show while a pill grows into its card.
 * The tape hangs above the card, and the opening clips everything above its
 * moving top, so the tape stays hidden until that clip has cleared it.
 * 0 while it would be cut, then up to 1 over the last of the opening.
 */
export function tapeReady(progress: number, frameY: number, hang = 14): number {
  const cleared = frameY > hang ? 1 - hang / frameY : 0.92
  const start = Math.max(cleared, 0.85)
  const t = Math.min(1, Math.max(0, progress))
  return Math.min(1, Math.max(0, (t - start) / 0.12))
}
