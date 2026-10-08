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

/** How a carried row is let go over another: on its middle (gathered with it), or just before or after it. */
export type How = 'join' | 'before' | 'after'

/** Put `key` just before or after `anchor`, in `group` (or the top level, null). */
function beside(layout: Layout, key: string, group: string | null, anchor: string, how: 'before' | 'after'): Layout {
  if (how === 'after') return moveTo(layout, key, { group, after: anchor })
  const list = (group ? layout.groups[group] ?? [] : layout.top).filter((one) => one !== key)
  const at = list.indexOf(anchor)
  return moveTo(layout, key, { group, after: at > 0 ? list[at - 1] : null })
}

/**
 * Where a drop lands: `active` (a note, or a group by its `g:` row) let go
 * `how` over `target`. Over the middle of a row the two are gathered into a
 * new group, or the note joins the target's group; just before or after a
 * row it goes beside it, in that row's group if it has one. Just under an
 * open group's own row is first in that group. Null when nothing changes.
 */
export function drop(layout: Layout, active: string, target: string, how: How, folded: Set<string>, make: () => { id: string; name: string }): Layout | null {
  if (active === target) return null
  const own = isGroup(active) ? undefined : groupOf(layout, active)
  if (isGroup(active)) {
    // A group only ever sits at the top level: beside the target's own place there.
    const anchor = topKey(layout, target)
    if (anchor === active) return null
    return beside(layout, active, null, anchor, how === 'before' ? 'before' : 'after')
  }
  if (how === 'join') {
    if (isGroup(target)) {
      const group = groupId(target)
      if (own === group) return null
      const ids = layout.groups[group] ?? []
      return moveTo(layout, active, { group, after: ids[ids.length - 1] ?? null })
    }
    const group = groupOf(layout, target)
    if (group) return moveTo(layout, active, { group, after: target })
    return gather(layout, target, [active], make())
  }
  if (isGroup(target)) {
    const group = groupId(target)
    if (how === 'after' && !folded.has(group)) return moveTo(layout, active, { group, after: null })
    return beside(layout, active, null, target, how)
  }
  return beside(layout, active, groupOf(layout, target) ?? null, target, how)
}

/** The group a drop would leave the note in (null: the top level), for saying so before it happens. */
export function landsIn(layout: Layout, target: string, how: How, folded: Set<string>): string | null {
  if (isGroup(target)) return how === 'join' || (how === 'after' && !folded.has(groupId(target))) ? groupId(target) : null
  return groupOf(layout, target) ?? null
}

/**
 * One step up or down with the keys, among the rows on show (`shown`, folded
 * groups' notes left out). Into a group and out of it are steps of their own:
 * a note at the end of a group steps out to just under it before passing the
 * next row.
 */
export function step(layout: Layout, shown: string[], id: string, by: number, folded: Set<string>): Layout | null {
  const at = shown.indexOf(id)
  const target = shown[at + by]
  if (at < 0 || !target) return null
  const own = groupOf(layout, id)
  if (by > 0) {
    if (own && groupOf(layout, target) !== own) return moveTo(layout, id, { group: null, after: KEY + own })
    return drop(layout, id, target, 'after', folded, () => ({ id: '', name: '' }))
  }
  const theirs = isGroup(target) ? undefined : groupOf(layout, target)
  if (theirs && theirs !== own) return moveTo(layout, id, { group: theirs, after: target })
  return drop(layout, id, target, 'before', folded, () => ({ id: '', name: '' }))
}

/** The order the notes are read in, groups opened out: what your own order is saved as. */
export const flatten = (layout: Layout): string[] => layout.top.flatMap((key) => (isGroup(key) ? [key, ...(layout.groups[groupId(key)] ?? [])] : [key]))
