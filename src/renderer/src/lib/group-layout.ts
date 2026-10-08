/**
 * The shape of a kept list in your own order, with its groups: what sits at
 * the top level (notes, and groups as `g:` and their id), and what is in each
 * group, in order. Every change to it (a drag, a new group, a step with the
 * keys) is worked out here as a new shape, then saved whole.
 *
 * No imports, so `node --test` can run it as it is.
 */

export type Layout = { top: string[]; groups: Record<string, string[]>; make?: { id: string; name: string } }
/** Where a note goes: into a group (or the top level, null), just after `after` (or first, null). */
type Place = { group: string | null; after: string | null }

export const KEY = 'g:'
export const isGroup = (key: string): boolean => key.startsWith(KEY)
export const groupId = (key: string): string => key.slice(KEY.length)

/** The layout as saved: `ids` is every note in your own order, `groups` each group's notes in order. */
export function layoutOf(ids: string[], groups: { id: string; members: string[] }[]): Layout {
  const known = new Set(ids)
  const of = new Map<string, string>()
  for (const group of groups) for (const id of group.members) if (known.has(id)) of.set(id, group.id)
  const top: string[] = []
  const placed = new Set<string>()
  for (const id of ids) {
    const group = of.get(id)
    if (!group) top.push(id)
    else if (!placed.has(group)) (placed.add(group), top.push(KEY + group))
  }
  return { top, groups: Object.fromEntries(groups.filter((one) => placed.has(one.id)).map((one) => [one.id, one.members.filter((id) => known.has(id))])) }
}

export const groupOf = (layout: Layout, id: string): string | undefined =>
  Object.keys(layout.groups).find((group) => layout.groups[group].includes(id))
const topKey = (layout: Layout, key: string): string => {
  const group = isGroup(key) ? undefined : groupOf(layout, key)
  return group ? KEY + group : key
}

/** Take `key` from wherever it is and put it at `place`. A group left empty goes. */
export function moveTo(layout: Layout, key: string, place: Place): Layout {
  let top = layout.top.filter((one) => one !== key)
  const groups: Record<string, string[]> = {}
  for (const [group, ids] of Object.entries(layout.groups)) groups[group] = ids.filter((one) => one !== key)
  if (place.group) {
    const list = groups[place.group] ?? []
    list.splice(place.after ? list.indexOf(place.after) + 1 : 0, 0, key)
    groups[place.group] = list
  } else top.splice(place.after ? top.indexOf(place.after) + 1 : 0, 0, key)
  for (const [group, ids] of Object.entries(groups))
    if (!ids.length) {
      delete groups[group]
      top = top.filter((one) => one !== KEY + group)
    }
  return { top, groups }
}

/** A new group where `target` is (after its group, if it was in one), holding it and then `ids`. */
export function gather(layout: Layout, target: string, ids: string[], make: { id: string; name: string }): Layout {
  const members = [...new Set([target, ...ids])]
  const anchor = topKey(layout, target)
  const groups: Record<string, string[]> = {}
  for (const [group, list] of Object.entries(layout.groups)) {
    const rest = list.filter((one) => !members.includes(one))
    if (rest.length) groups[group] = rest
  }
  const top: string[] = []
  for (const key of layout.top) {
    const gone = members.includes(key) || (isGroup(key) && !groups[groupId(key)])
    if (!gone) top.push(key)
    if (key === anchor) top.push(KEY + make.id)
  }
  return { top, groups: { ...groups, [make.id]: members }, make }
}

const arrayMove = <T>(list: T[], from: number, to: number): T[] => {
  const next = [...list]
  next.splice(to, 0, next.splice(from, 1)[0])
  return next
}

/**
 * Where a drop lands. `shown` is every row on screen in order (group rows as
 * `g:` keys, the notes of a folded group left out); `active` is what was
 * carried and `over` what it was let go over. `join`: let go over the middle
 * of a row, which gathers the two (or adds to that row's group). Null when
 * nothing changes.
 */
export function drop(layout: Layout, shown: string[], active: string, over: string, join: boolean, folded: Set<string>, make: () => { id: string; name: string }): Layout | null {
  if (active === over) return null
  const own = isGroup(active) ? undefined : groupOf(layout, active)
  if (join && !isGroup(active)) {
    if (isGroup(over)) {
      const group = groupId(over)
      if (own === group) return null
      const ids = layout.groups[group] ?? []
      return moveTo(layout, active, { group, after: ids[ids.length - 1] ?? null })
    }
    const group = groupOf(layout, over)
    if (group) return moveTo(layout, active, { group, after: over })
    return gather(layout, over, [active], make())
  }
  const from = shown.indexOf(active)
  const to = shown.indexOf(over)
  if (from < 0 || to < 0) return null
  const moved = arrayMove(shown, from, to)
  const at = moved.indexOf(active)
  if (isGroup(active)) {
    // The nearest row above that is not its own: it goes after that row's place at the top.
    const mine = new Set(layout.groups[groupId(active)] ?? [])
    const prev = moved.slice(0, at).reverse().find((one) => !mine.has(one))
    return moveTo(layout, active, { group: null, after: prev ? topKey(layout, prev) : null })
  }
  const prev = moved[at - 1]
  const next = moved[at + 1]
  // Just under an open group's row: first in it.
  if (prev && isGroup(prev) && !folded.has(groupId(prev))) return moveTo(layout, active, { group: groupId(prev), after: null })
  const above = prev && !isGroup(prev) ? groupOf(layout, prev) : undefined
  const below = next && !isGroup(next) ? groupOf(layout, next) : undefined
  // Between two of a group's notes, or still at the end of its own.
  if (above && (above === below || above === own)) return moveTo(layout, active, { group: above, after: prev })
  return moveTo(layout, active, { group: null, after: prev ? topKey(layout, prev) : null })
}

/** The order the notes are read in, groups opened out: what your own order is saved as. */
export const flatten = (layout: Layout): string[] => layout.top.flatMap((key) => (isGroup(key) ? [key, ...(layout.groups[groupId(key)] ?? [])] : [key]))
