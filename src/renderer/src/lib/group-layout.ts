/**
 * The shape of a kept list in your own order, with its groups: what sits at
 * the top level (notes, and groups as `g:` and their id), and what is in each
 * group, in order. A group can hold one level of subgroups: its list then has
 * `g:` keys of its own among its notes. Every change to it (a drag, a new
 * group, a step with the keys) is worked out here as a new shape, then saved
 * whole.
 *
 * No imports, so `node --test` can run it as it is.
 */

export type Layout = {
  top: string[]
  groups: Record<string, string[]>
  make?: { id: string; name: string }
  /** Groups to bring back as they were, for an Undo of what took them apart. */
  revive?: { id: string; name: string; icon: string | null; color: string | null; folded: number }[]
}
/** Where a note goes: into a group (or the top level, null), just after `after` (or first, null). */
type Place = { group: string | null; after: string | null }

export const KEY = 'g:'
export const isGroup = (key: string): boolean => key.startsWith(KEY)
export const groupId = (key: string): string => key.slice(KEY.length)

/**
 * The layout as saved: `ids` is every note in your own order, `groups` each
 * group's notes in order, and a subgroup's `parent` the group it sits in (one
 * level only: a group whose parent is itself a subgroup counts as a subgroup
 * of nothing). A group is two things or more, notes and subgroups together:
 * one with fewer (counting only the notes in `live`, when given, so an
 * archived one does not count) is drawn as what it has, where it was.
 */
export function layoutOf(ids: string[], groups: { id: string; members: string[]; parent?: string | null }[], live?: Set<string>): Layout {
  const known = new Set(ids)
  const counted = (id: string): boolean => known.has(id) && (!live || live.has(id))
  const byId = new Map(groups.map((group) => [group.id, group]))
  const parentOf = (id: string): string | null => {
    const parent = byId.get(id)?.parent ? byId.get(byId.get(id)!.parent!) : undefined
    return parent && !parent.parent ? parent.id : null
  }
  // A subgroup stands with two notes; a group with two things, its own notes,
  // the notes of subgroups that do not stand, and the subgroups that do.
  const subs = new Set(groups.filter((group) => parentOf(group.id) && group.members.filter(counted).length >= 2).map((group) => group.id))
  const tops = new Set(groups.filter((group) => {
    if (parentOf(group.id)) return false
    const loose = groups.filter((one) => parentOf(one.id) === group.id && !subs.has(one.id)).reduce((n, one) => n + one.members.filter(counted).length, 0)
    const standing = groups.filter((one) => parentOf(one.id) === group.id && subs.has(one.id)).length
    return group.members.filter(counted).length + loose + standing >= 2
  }).map((group) => group.id))
  // A subgroup whose group does not stand is a group of its own.
  for (const id of subs) if (!tops.has(parentOf(id)!)) (subs.delete(id), tops.add(id))
  const outer = (group: string): string | null => (subs.has(group) ? parentOf(group) : null)
  // The group each note is drawn in, innermost.
  const of = new Map<string, string>()
  for (const group of groups)
    for (const id of group.members) {
      if (!known.has(id)) continue
      const parent = parentOf(group.id)
      const home = subs.has(group.id) || tops.has(group.id) ? group.id : parent && tops.has(parent) ? parent : null
      if (home) of.set(id, home)
    }
  const top: string[] = []
  const lists: Record<string, string[]> = {}
  const add = (group: string, key: string): void => {
    const list = (lists[group] ??= [])
    if (!list.includes(key)) list.push(key)
  }
  for (const id of ids) {
    const home = of.get(id)
    if (!home) {
      top.push(id)
      continue
    }
    const parent = outer(home)
    if (!top.includes(KEY + (parent ?? home))) top.push(KEY + (parent ?? home))
    if (parent) add(parent, KEY + home)
    add(home, id)
  }
  return { top, groups: lists }
}

export const groupOf = (layout: Layout, id: string): string | undefined => {
  // Worked out once per layout (layouts are never changed in place): asked for each of 2,500 rows, a scan each time took seconds.
  let homes = HOMES.get(layout)
  if (!homes) {
    homes = new Map()
    for (const [group, ids] of Object.entries(layout.groups)) for (const one of ids) if (!homes.has(one)) homes.set(one, group)
    HOMES.set(layout, homes)
  }
  return homes.get(id)
}
const HOMES = new WeakMap<Layout, Map<string, string>>()
/** The group a group sits in, for a subgroup; undefined for one at the top level. */
export const parentOf = (layout: Layout, group: string): string | undefined => groupOf(layout, KEY + group)
/** Whether a group holds subgroups of its own. */
export const hasSubgroups = (layout: Layout, group: string): boolean => (layout.groups[group] ?? []).some(isGroup)
/** The row at the top level a key is drawn under: itself, or the outermost group holding it. */
const topKey = (layout: Layout, key: string): string => {
  let at = key
  for (let i = 0; i < 3; i++) {
    const group = groupOf(layout, at)
    if (!group) return at
    at = KEY + group
  }
  return at
}

/** Take `key` from wherever it is and put it at `place`. A group left empty goes, from wherever it sat. */
export const moveTo = (layout: Layout, key: string, place: Place): Layout => moveMany(layout, [key], place)

/** Take every one of `keys` from wherever it is and put them, in that order, at `place`: one pass, however many. */
export function moveMany(layout: Layout, keys: string[], place: Place): Layout {
  const out = new Set(keys)
  let top = layout.top.filter((one) => !out.has(one))
  const groups: Record<string, string[]> = {}
  for (const [group, ids] of Object.entries(layout.groups)) groups[group] = ids.filter((one) => !out.has(one))
  if (place.group) {
    const list = groups[place.group] ?? []
    list.splice(place.after ? list.indexOf(place.after) + 1 : 0, 0, ...keys)
    groups[place.group] = list
  } else top.splice(place.after ? top.indexOf(place.after) + 1 : 0, 0, ...keys)
  for (let pass = 0; pass < 3; pass++)
    for (const [group, ids] of Object.entries(groups))
      if (!ids.length) {
        delete groups[group]
        top = top.filter((one) => one !== KEY + group)
        for (const other of Object.keys(groups)) groups[other] = groups[other].filter((one) => one !== KEY + group)
      }
  return { top, groups }
}

/**
 * A new group where `target` is (after its group, if it was in one), holding
 * it and then `ids`. With `within`, a subgroup inside that group instead, in
 * the target's place there.
 */
export function gather(layout: Layout, target: string, ids: string[], make: { id: string; name: string }, within: string | null = null): Layout {
  const members = [...new Set([target, ...ids])]
  if (within) {
    const groups: Record<string, string[]> = {}
    for (const [group, keys] of Object.entries(layout.groups))
      groups[group] = group === within ? keys.flatMap((one) => (one === target ? [KEY + make.id] : members.includes(one) ? [] : [one])) : keys.filter((one) => !members.includes(one))
    const tidied = moveTo({ top: layout.top, groups: { ...groups, [make.id]: members } }, KEY + make.id, { group: within, after: groups[within][groups[within].indexOf(KEY + make.id) - 1] ?? null })
    return { ...tidied, make }
  }
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
 * new group, or the note joins the target's group; two of a group's own
 * notes gathered make a subgroup in it. Just before or after a row it goes
 * beside it, in that row's group if it has one. Just under an open group's
 * own row is first in that group. A group with no subgroups let go over the
 * middle of another group's row goes inside it. Null when nothing changes.
 */
export function drop(layout: Layout, active: string, target: string, how: How, folded: Set<string>, make: () => { id: string; name: string }): Layout | null {
  if (active === target) return null
  const own = groupOf(layout, active)
  if (isGroup(active)) {
    const me = groupId(active)
    if (how === 'join') {
      if (!isGroup(target) || parentOf(layout, groupId(target)) || hasSubgroups(layout, me) || target === KEY + own) return null
      const list = layout.groups[groupId(target)] ?? []
      return moveTo(layout, active, { group: groupId(target), after: list[list.length - 1] ?? null })
    }
    // A subgroup moves among the rest of its group; let go outside it, it stands at the top level.
    if (own) {
      const theirs = groupOf(layout, target)
      const key = theirs === own ? target : theirs && parentOf(layout, theirs) === own ? KEY + theirs : null
      if (key && key !== active) return beside(layout, active, own, key, how === 'before' ? 'before' : 'after')
    }
    // A group otherwise only sits at the top level: beside the target's own place there.
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
    // Two of a group's own notes, one over the other: a subgroup of them, in that group (one level only).
    if (group && own === group) return parentOf(layout, group) ? null : gather(layout, target, [active], make(), group)
    if (group) return moveTo(layout, active, { group, after: target })
    return gather(layout, target, [active], make())
  }
  if (isGroup(target)) {
    const group = groupId(target)
    if (how === 'after' && !folded.has(group)) return moveTo(layout, active, { group, after: null })
    return beside(layout, active, parentOf(layout, group) ?? null, target, how)
  }
  return beside(layout, active, groupOf(layout, target) ?? null, target, how)
}

/** The group a drop would leave the note in (null: the top level), for saying so before it happens. */
export function landsIn(layout: Layout, target: string, how: How, folded: Set<string>): string | null {
  if (isGroup(target)) return how === 'join' || (how === 'after' && !folded.has(groupId(target))) ? groupId(target) : parentOf(layout, groupId(target)) ?? null
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
    // Out of its group, to just under it, in whatever holds that group.
    if (own && groupOf(layout, target) !== own) return moveTo(layout, id, { group: parentOf(layout, own) ?? null, after: KEY + own })
    return drop(layout, id, target, 'after', folded, () => ({ id: '', name: '' }))
  }
  const theirs = isGroup(target) ? undefined : groupOf(layout, target)
  if (theirs && theirs !== own) return moveTo(layout, id, { group: theirs, after: target })
  return drop(layout, id, target, 'before', folded, () => ({ id: '', name: '' }))
}

/** The order the notes are read in, groups opened out: what your own order is saved as. */
export const flatten = (layout: Layout): string[] => {
  const open = (key: string, depth: number): string[] => (isGroup(key) && depth < 3 ? [key, ...(layout.groups[groupId(key)] ?? []).flatMap((one) => open(one, depth + 1))] : [key])
  return layout.top.flatMap((key) => open(key, 0))
}

/**
 * Several notes carried at once (`ids`, in the order they are read), let go
 * `how` over `target`: the first lands as one would, and the rest follow it
 * in order, in the same place. Over the middle of a row outside any group,
 * all of them and that row make a new group; all from the target's own group,
 * a subgroup in it.
 */
export function dropMany(layout: Layout, ids: string[], target: string, how: How, folded: Set<string>, make: () => { id: string; name: string }): Layout | null {
  if (ids.length < 2) return ids[0] ? drop(layout, ids[0], target, how, folded, make) : null
  if (ids.includes(target)) return null
  if (how === 'join' && !isGroup(target)) {
    const group = groupOf(layout, target)
    if (!group) return gather(layout, target, ids, make())
    if (!parentOf(layout, group) && ids.every((id) => groupOf(layout, id) === group)) return gather(layout, target, ids, make(), group)
  }
  const [first, ...rest] = ids
  let next = drop(layout, first, target, how, folded, make) ?? layout
  let prev = first
  for (const id of rest) {
    const group = groupOf(next, prev) ?? null
    next = moveTo(next, id, { group, after: prev })
    prev = id
  }
  return next
}

/**
 * A group is two things or more. Any left with one (or none) comes apart: what
 * it held stays where the group was, and a subgroup coming apart can leave its
 * group with one thing, which then comes apart too. Gives back the tidied
 * layout and the groups that came apart, for the list to show them going.
 */
export function tidy(layout: Layout): { layout: Layout; dissolved: string[] } {
  const dissolved: string[] = []
  let now = layout
  for (let pass = 0; pass < 3; pass++) {
    const gone = Object.keys(now.groups).filter((group) => now.groups[group].length < 2)
    if (!gone.length) break
    dissolved.push(...gone)
    const was = now
    const open = (key: string): string[] => (isGroup(key) && gone.includes(groupId(key)) ? was.groups[groupId(key)] ?? [] : [key])
    const groups: Record<string, string[]> = {}
    for (const [group, keys] of Object.entries(was.groups)) if (!gone.includes(group)) groups[group] = keys.flatMap(open)
    now = { ...was, top: was.top.flatMap(open), groups }
  }
  return { layout: now, dissolved }
}

/**
 * The layout put in the order a list shows it (`seen`: every key, groups'
 * too, in the order they are drawn), for a list sorted some other way: a drop
 * there starts from what you see. Each list keeps its keys; only the ones in
 * `seen` change places, among the slots they had, so rows filtered out stay
 * where they were.
 */
export function reorderAs(layout: Layout, seen: string[]): Layout {
  const at = new Map(seen.map((key, index) => [key, index]))
  const sort = (list: string[]): string[] => {
    const slots = list.map((key, index) => (at.has(key) ? index : -1)).filter((index) => index >= 0)
    const moved = slots.map((index) => list[index]).sort((a, b) => at.get(a)! - at.get(b)!)
    const out = [...list]
    slots.forEach((slot, index) => (out[slot] = moved[index]))
    return out
  }
  return { top: sort(layout.top), groups: Object.fromEntries(Object.entries(layout.groups).map(([group, list]) => [group, sort(list)])) }
}

/** The rows on show, in order: every key, a folded group's row but none of what it holds. */
export const shownKeys = (layout: Layout, folded: Set<string>): string[] => {
  const open = (key: string, depth: number): string[] => (isGroup(key) && depth < 3 ? [key, ...(folded.has(groupId(key)) ? [] : (layout.groups[groupId(key)] ?? []).flatMap((one) => open(one, depth + 1)))] : [key])
  return layout.top.flatMap((key) => open(key, 0))
}

/** Whether two layouts are the same shape: the same order, and each group holding the same, in the same order. */
export function sameLayout(a: Layout, b: Layout): boolean {
  const lists = (one: Layout): string => JSON.stringify([one.top, ...Object.keys(one.groups).filter((group) => one.groups[group].length).sort().map((group) => [group, one.groups[group]])])
  return lists(a) === lists(b)
}

/** The groups holding `key`, innermost first. */
export function groupsAround(layout: Layout, key: string): string[] {
  const out: string[] = []
  let at = groupOf(layout, key)
  while (at && out.length < 3) (out.push(at), (at = groupOf(layout, KEY + at)))
  return out
}
