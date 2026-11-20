import type { Step } from './nav'
import type { PaneWidth } from './split'

/**
 * The main window's page as Obsidian has it: one or more panes side by side,
 * each holding its own row of tabs, each tab its own Back and Forward. Only
 * the tab on show in a pane is drawn; the rest hold their trail and scroll.
 * Plain functions over plain data: home.tsx says when, these say what.
 */
export type Trail = { views: Step[]; at: number }
/** `pinned`: a tab that stays, drawn small at the left of its row, kept through restarts (Safari's and Chrome's pinned tabs). */
export type Tab = { key: string; trail: Trail; pinned?: true }
export type Pane = { key: string; tabs: Tab[]; active: string; width?: PaneWidth }
export type Split = { panes: Pane[]; front: string; sizes: number[] }

let made = 0
const newKey = (start: string): string => `${start}${Date.now().toString(36)}${made++}`
export const newTab = (views: Step[]): Tab => ({ key: newKey('t'), trail: { views, at: views.length - 1 } })
export const paneOf = (tab: Tab): Pane => ({ key: newKey('p'), tabs: [tab], active: tab.key })
export const activeTab = (pane: Pane): Tab => pane.tabs.find((one) => one.key === pane.active) ?? pane.tabs[0]
export const tabStep = (tab: Tab): Step => tab.trail.views[tab.trail.at]
export const onShow = (pane: Pane): Step => tabStep(activeTab(pane))
export const frontOf = (split: Split): Pane => split.panes.find((one) => one.key === split.front) ?? split.panes[0]

const shares = (split: Split): number[] => {
  const kept = split.sizes.length === split.panes.length ? split.sizes : split.panes.map(() => 1)
  const total = kept.reduce((sum, one) => sum + one, 0) || 1
  return kept.map((one) => one / total)
}

/** A new pane at place `at`, in front: it takes its share, the others give theirs up evenly. */
export function insertPane(split: Split, pane: Pane, at: number): Split {
  const n = split.panes.length + 1
  const rest = shares(split).map((one) => one * ((n - 1) / n))
  return { ...split, panes: [...split.panes.slice(0, at), pane, ...split.panes.slice(at)], front: pane.key, sizes: [...rest.slice(0, at), 1 / n, ...rest.slice(at)] }
}

/** A pane gone: its neighbours take the room, and the one before it the keys if it had them. */
export function removePane(split: Split, key: string): Split {
  const at = split.panes.findIndex((one) => one.key === key)
  if (at < 0 || split.panes.length < 2) return split
  const left = split.panes.filter((one) => one.key !== key)
  const kept = shares(split).filter((_, index) => index !== at)
  const total = kept.reduce((sum, one) => sum + one, 0) || 1
  return {
    ...split,
    // On its own again, a page follows Page width in Settings.
    panes: left.length === 1 ? [{ ...left[0], width: undefined }] : left,
    front: split.front === key ? (left[at - 1] ?? left[0]).key : split.front,
    sizes: kept.map((one) => one / total)
  }
}

/** Pinned tabs first, each run in its own order: a tab placed or carried anywhere lands on its own side of them. */
const pinnedFirst = (pane: Pane): Pane => {
  const at = pane.tabs.findIndex((one) => !one.pinned)
  return at < 0 || pane.tabs.slice(at).every((one) => !one.pinned) ? pane : { ...pane, tabs: [...pane.tabs.filter((one) => one.pinned), ...pane.tabs.filter((one) => !one.pinned)] }
}
const changePane = (split: Split, key: string, change: (pane: Pane) => Pane): Split => ({ ...split, panes: split.panes.map((one) => (one.key === key ? pinnedFirst(change(one)) : one)) })

/** A tab pinned, at the end of its pane's pinned ones, or let go, just after them. */
export const pinTab = (split: Split, key: string, tab: string, on: boolean): Split =>
  changePane(split, key, (pane) => {
    const one = pane.tabs.find((each) => each.key === tab)
    if (!one) return pane
    const rest = pane.tabs.filter((each) => each !== one)
    const at = rest.filter((each) => each.pinned).length
    const moved: Tab = on ? { ...one, pinned: true } : { key: one.key, trail: one.trail }
    return { ...pane, tabs: [...rest.slice(0, at), moved, ...rest.slice(at)] }
  })

/** A tab placed in a pane (just after the open one unless said), open and in front. */
export const addTab = (split: Split, key: string, tab: Tab, at?: number): Split => ({
  ...changePane(split, key, (pane) => {
    const place = at ?? pane.tabs.findIndex((one) => one.key === pane.active) + 1
    return { ...pane, tabs: [...pane.tabs.slice(0, place), tab, ...pane.tabs.slice(place)], active: tab.key }
  }),
  front: key
})

export const selectTab = (split: Split, key: string, tab: string): Split => ({ ...changePane(split, key, (pane) => ({ ...pane, active: tab })), front: key })

/**
 * A tab out of its pane. Its neighbour to the right opens, or else the one to
 * its left. The pane's last tab takes the pane with it, the last pane left
 * standing keeps a `landing` tab instead: the window never ends up blank.
 */
export function closeTab(split: Split, key: string, tab: string, landing: () => Tab): Split {
  const pane = split.panes.find((one) => one.key === key)
  if (!pane) return split
  const at = pane.tabs.findIndex((one) => one.key === tab)
  if (at < 0) return split
  const tabs = pane.tabs.filter((one) => one.key !== tab)
  if (tabs.length) return changePane(split, key, (one) => ({ ...one, tabs, active: one.active === tab ? (tabs[at] ?? tabs[at - 1]).key : one.active }))
  if (split.panes.length > 1) return removePane(split, key)
  const fresh = landing()
  return changePane(split, key, (one) => ({ ...one, tabs: [fresh], active: fresh.key }))
}

/** Keep only the tabs `keep` says, in a pane; the open one stays if it can. */
export function keepTabs(split: Split, key: string, keep: (tab: Tab, at: number) => boolean, open: string): Split {
  return changePane(split, key, (pane) => {
    const tabs = pane.tabs.filter(keep)
    return tabs.length ? { ...pane, tabs, active: tabs.some((one) => one.key === pane.active) ? pane.active : open } : pane
  })
}

/**
 * A tab carried to place `at` of a pane's row, counted among the tabs without
 * it: it opens there, in front. A pane left with no tabs closes.
 */
export function moveTab(split: Split, from: string, tab: string, to: string, at: number): Split {
  const source = split.panes.find((one) => one.key === from)
  const moving = source?.tabs.find((one) => one.key === tab)
  if (!source || !moving || !split.panes.some((one) => one.key === to)) return split
  if (from === to) {
    const rest = source.tabs.filter((one) => one.key !== tab)
    return { ...changePane(split, to, (pane) => ({ ...pane, tabs: [...rest.slice(0, at), moving, ...rest.slice(at)], active: tab })), front: to }
  }
  const emptied = source.tabs.length === 1
  const placed = addTab(emptied ? split : closeTab(split, from, tab, () => moving), to, moving, at)
  return emptied ? { ...removePane(placed, from), front: to } : placed
}

/** A tab carried to the gap `at` between panes: a new pane of its own there. */
export function tabToNewPane(split: Split, from: string, tab: string, at: number): Split {
  const source = split.panes.find((one) => one.key === from)
  const moving = source?.tabs.find((one) => one.key === tab)
  if (!source || !moving) return split
  const pane = paneOf(moving)
  const index = split.panes.indexOf(source)
  if (source.tabs.length > 1) return insertPane(closeTab(split, from, tab, () => moving), pane, at)
  // Its pane's only tab: the pane itself moves, the gap counted without it.
  return insertPane(removePane(split, from), pane, at > index ? at - 1 : at)
}

/** What launch reads back: the one kept value, or a value kept before tabs (a pane with one trail), each pane one tab. */
export function readSplit(kept: unknown, step: (one: Step) => Step): Split | null {
  const raw = kept as { panes?: unknown; front?: unknown; sizes?: unknown } | null
  if (!raw || !Array.isArray(raw.panes) || !raw.panes.length) return null
  const fineTrail = (trail: Trail | undefined): trail is Trail => Array.isArray(trail?.views) && trail.views.length > 0 && trail.views.every((one) => typeof one?.id === 'string') && trail.at >= 0 && trail.at < trail.views.length
  const panes: Pane[] = []
  for (const one of raw.panes as (Pane & { trail?: Trail })[]) {
    if (typeof one?.key !== 'string') return null
    const tabs: Tab[] = fineTrail(one.trail) ? [{ key: newKey('t'), trail: one.trail }] : Array.isArray(one.tabs) ? one.tabs : []
    if (!tabs.length || !tabs.every((tab) => typeof tab?.key === 'string' && fineTrail(tab.trail))) return null
    panes.push(pinnedFirst({ key: one.key, width: one.width, active: tabs.some((tab) => tab.key === one.active) ? one.active : tabs[0].key, tabs: tabs.map((tab) => ({ key: tab.key, ...(tab.pinned === true && { pinned: true as const }), trail: { ...tab.trail, views: tab.trail.views.map(step) } })) }))
  }
  const sizes = raw.sizes as number[]
  return {
    panes,
    front: panes.some((one) => one.key === raw.front) ? (raw.front as string) : panes[0].key,
    sizes: Array.isArray(sizes) && sizes.length === panes.length && sizes.every((one) => one > 0) ? sizes : panes.map(() => 1 / panes.length)
  }
}

/** Each tab's trail without its scroll, and only its last fifty steps: what is kept on disk. */
export const bareSplit = (split: Split): Split => ({
  ...split,
  panes: split.panes.map((pane) => ({
    ...pane,
    tabs: pane.tabs.map(({ key, trail, pinned }) => {
      const from = Math.max(0, Math.min(trail.at, trail.views.length - 50))
      return { key, ...(pinned && { pinned }), trail: { views: trail.views.slice(from).map(({ id, focus, tab, folder }) => ({ id, focus, tab, folder })), at: trail.at - from } }
    })
  }))
})
