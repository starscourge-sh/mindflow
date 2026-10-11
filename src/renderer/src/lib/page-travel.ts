/**
 * Which way a pane just travelled through the sidebar: 1 down the list, -1
 * up it, 0 when it stayed put or either end is not in the list (a note, a
 * day, Settings). Kept per pane and asked during render, so asked twice for
 * the same page (React's dev double render) it gives the same answer.
 */
const seen = new Map<string, { id: string; way: -1 | 0 | 1 }>()

export function pageTravel(pane: string, id: string, order: readonly string[]): -1 | 0 | 1 {
  const was = seen.get(pane)
  if (!was) return (seen.set(pane, { id, way: 0 }), 0)
  if (was.id === id) return was.way
  const [from, to] = [order.indexOf(was.id), order.indexOf(id)]
  const way = from < 0 || to < 0 ? 0 : to > from ? 1 : -1
  seen.set(pane, { id, way })
  return way
}
