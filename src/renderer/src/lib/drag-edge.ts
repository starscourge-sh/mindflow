/**
 * In or out of what holds it: read off the real edges of the boxes round the
 * nearest row (a group, its subgroup; a line and its steps), outermost first.
 * Past an edge is out, and nothing inside that box counts then. A dead band of
 * BAND round each edge keeps what it last was, so small moves never flip it.
 *
 * No imports, so `node --test` can run it as it is.
 */
export const BAND = 6
export type EdgeBox = { id: string; top: number; bottom: number }

/** The outermost box the pointer is past, and which side; null when it is inside them all. `inside` remembers, move to move. */
export function pastEdge(boxes: EdgeBox[], y: number, inside: Set<string>): { id: string; how: 'before' | 'after' } | null {
  for (const [at, box] of boxes.entries()) {
    const room = inside.has(box.id) ? BAND : -BAND
    if (y >= box.top - room && y <= box.bottom + room) {
      inside.add(box.id)
      continue
    }
    for (const one of boxes.slice(at)) inside.delete(one.id)
    return { id: box.id, how: y < (box.top + box.bottom) / 2 ? 'before' : 'after' }
  }
  return null
}
