/** Where the welcome's scene stands, in the screen's points: the whole screen, and the window it becomes (from the screen's top left). */
export type ScenePlace = { screen: { width: number; height: number }; window: { x: number; y: number; width: number; height: number } }

/**
 * The one scale at which the scene's stage (the screen's shape) covers the welcome's window (its own shape) with nothing
 * stretched, and what of the stage is cut off at its sides (`cutX`) or its top and foot (`cutY`) to show it, in the
 * stage's points: by width on a screen taller than the window's shape, by height on a wider one (a 16:9 screen against
 * the window's 16:10, where the window was left a bare band at its top and foot, 15 Nov 2026).
 */
export function sceneCover(place: ScenePlace): { scale: number; cutX: number; cutY: number } {
  const { width: W, height: H } = place.screen
  const box = place.window
  const scale = Math.max(box.width / W, box.height / H)
  return { scale, cutX: Math.max(0, (W - box.width / scale) / 2), cutY: Math.max(0, (H - box.height / scale) / 2) }
}
