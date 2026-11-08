/**
 * Runs `read` once, after the page next lays itself out and before that frame
 * is painted: where things are is known then and costs nothing to ask. Asked
 * as a pane or list mounts instead, every read laid the half-built page out
 * again (dropping a note to open a second pane read it out six times over,
 * about a second and a half). Gives back a way to call it off.
 */
export function afterLayout(element: Element, read: () => void): () => void {
  // A size watch tells of each element it is given once, at its first layout, even at no size.
  const watch = new ResizeObserver(() => (watch.disconnect(), read()))
  watch.observe(element)
  return () => watch.disconnect()
}
