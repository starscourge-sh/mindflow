/**
 * A list kept in your own order: the sidebar's places, the box's tabs, the
 * pins. Saved as the ids in order; empty means the usual order. Nothing here
 * reads or writes settings, so it can be tested on its own.
 */

/**
 * `usual` in the `saved` order. One not in it (new since the order was saved)
 * sits just after the one it follows in the usual order, or first.
 */
export function inOrder<T>(usual: T[], saved: readonly string[] | null | undefined, keyOf: (one: T) => string): T[] {
  if (!saved?.length) return usual
  const byId = new Map(usual.map((one) => [keyOf(one), one]))
  const out = saved.filter((id, at) => byId.has(id) && saved.indexOf(id) === at)
  usual.forEach((one, at) => {
    const id = keyOf(one)
    if (out.includes(id)) return
    const before = at > 0 ? out.indexOf(keyOf(usual[at - 1])) : -1
    out.splice(before + 1, 0, id)
  })
  return out.map((id) => byId.get(id)!)
}

/** The order after `id` is put just before `target`, or just after it. */
export function moved(order: readonly string[], id: string, target: string, after: boolean): string[] {
  if (id === target || !order.includes(id) || !order.includes(target)) return [...order]
  const out = order.filter((one) => one !== id)
  out.splice(out.indexOf(target) + (after ? 1 : 0), 0, id)
  return out
}

/**
 * The order after `id` swaps with its neighbour one step up (-1) or down (1)
 * among `among` (the ids it is shown with), or null when it is at that end.
 */
export function stepped(order: readonly string[], id: string, by: -1 | 1, among: readonly string[]): string[] | null {
  const near = among[among.indexOf(id) + by]
  if (!among.includes(id) || !near) return null
  return moved(order, id, near, by > 0)
}

/** Whether `order` is the usual one, so there is nothing to put back. */
export const isUsual = (order: readonly string[], usual: readonly string[]): boolean => order.length === usual.length && order.every((id, at) => id === usual[at])
