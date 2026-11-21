/**
 * Whether the app in front is really what you were looking at, for quick capture's "From" line.
 *
 * macOS keeps an app "in front" even when none of its windows can be seen: AeroSpace, and tools like it, show an empty
 * workspace by sliding every window to a corner of the screen, a pixel or two still showing, and the last app stays
 * frontmost (the user, 21 Nov: "why is it saying 'herdr' ghostty? i moved from that workspace to a blank one"). The
 * window list the Mac gives (CGWindowListCopyWindowInfo, on screen only, read in site-block.ts's script) still has
 * those windows, so it is not enough: a window counts only if it is a normal window (layer 0), not see-through, and
 * covers a real piece of a display, at least MIN px each way. No such window: no "From" line at all.
 */
export type SeenWindow = { layer: number; alpha: number; x: number; y: number; w: number; h: number; name?: string }
export type Display = { x: number; y: number; w: number; h: number }

/** The least of a display a window must cover, each way, to count as seen: an AeroSpace corner leaves a sliver of 1 or 2. */
const MIN = 40

const overlap = (one: SeenWindow, screen: Display): boolean =>
  Math.min(one.x + one.w, screen.x + screen.w) - Math.max(one.x, screen.x) >= MIN &&
  Math.min(one.y + one.h, screen.y + screen.h) - Math.max(one.y, screen.y) >= MIN

/**
 * The front app's windows (front to back, as the Mac lists them) and the displays: null when none of its windows can
 * be seen, else the name of the frontmost seen window that has one ('' when the Mac gives no names, without Screen
 * Recording).
 */
export function seenTitle(windows: SeenWindow[], displays: Display[]): string | null {
  const seen = windows.filter((one) => one.layer === 0 && one.alpha > 0 && displays.some((screen) => overlap(one, screen)))
  if (!seen.length) return null
  return seen.find((one) => one.name?.trim())?.name?.trim() ?? ''
}
