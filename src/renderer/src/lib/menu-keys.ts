/**
 * Which way a key moves through a list.
 *
 * The arrows, plus the Ctrl chords cmdk answers to, so every menu here moves
 * the same way whether it is built on cmdk, on a suggestion popup or on a
 * Radix dropdown. Without this the `/` menu and the handle menu were the two
 * places where `Ctrl-j` typed a letter instead.
 */
export function listDirection(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}): "up" | "down" | null {
  if (event.key === "ArrowDown") return "down"
  if (event.key === "ArrowUp") return "up"
  if (!event.ctrlKey || event.metaKey || event.altKey) return null

  // Ctrl-P is left out on purpose: it opens the priority picker, which is the
  // only thing it has ever meant here. cmdk still claims it inside its own
  // lists, which is cmdk's binding rather than this one.
  const key = event.key.toLowerCase()
  if (key === "n" || key === "j") return "down"
  if (key === "k") return "up"
  return null
}

/** The next index in that direction, wrapping at either end. */
export function step(current: number, direction: "up" | "down", length: number): number {
  if (!length) return 0
  return direction === "down"
    ? (current + 1) % length
    : (current + length - 1) % length
}
