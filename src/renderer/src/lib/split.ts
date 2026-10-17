import { createContext, useContext, useSyncExternalStore } from 'react'

/**
 * Split view: the main window's page as up to four panes side by side, each
 * with its own Back and Forward. One of them has the keys at a time (⌃H and
 * ⌃L move between them); the rest wait, and nothing typed reaches them.
 *
 * A page learns which pane it is in from `PaneContext`. Outside the main
 * window's panes (the box, a note's own window) there is no pane, and every
 * check here says yes, so those windows behave as they always have.
 */
/** The most panes the main window splits into. */
export const MAX_PANES = 4

export const PaneContext = createContext<string | null>(null)
export const usePane = (): string | null => useContext(PaneContext)

let focused: string | null = null
let count = 1

/** Said by the main window whenever the pane in front, or how many there are, changes. */
export function setPanes(front: string, many: number): void {
  if (focused === front && count === many) return
  focused = front
  count = many
}

/** The pane with the keys, or null outside the main window. */
export const frontPane = (): string | null => focused
/** More than one pane open. */
export const isSplit = (): boolean => count > 1

/** Whether keys pressed now are for something in `pane`: the pane in front, or anything outside the panes. */
export const keysHere = (pane: string | null): boolean => !pane || !focused || focused === pane

/**
 * For a window key listener inside a page: call it first and stand down when
 * it says no, so J in one pane's list never moves the row in another's.
 */
export function useHere(): () => boolean {
  const pane = usePane()
  return () => keysHere(pane)
}

// --- each pane's note name, for the top bar to show the front one's

const titles = new Map<string, string | null>()
export const titleOf = (pane: string): string | null => titles.get(pane) ?? null
/** The open note's name as it scrolls out of sight, kept for its pane; true when that pane is in front. */
export function keepTitle(pane: string | null, title: string | null): boolean {
  if (pane) titles.set(pane, title)
  return keysHere(pane)
}

// --- how many panes fit side by side

/** Narrower than this, a pane would only show a sliver of its page: they take turns instead. */
export const PANE_MIN = 300
/** The gap between panes, which is also where a divider is held. */
export const PANE_GAP = 8
/** Whether `many` panes fit side by side in `room` pixels, or else take turns. */
export const panesFit = (many: number, room: number): boolean => many < 2 || room <= 0 || room - PANE_GAP * (many - 1) >= PANE_MIN * many
/** Whether `many` panes would fit side by side in the main window's page as it is now. */
export const roomFor = (many: number): boolean => panesFit(many, document.querySelector('[data-split-area]')?.clientWidth ?? 0)

// --- opening to the side

/** Only the main window splits: the box and a note's own window have one page. */
export const canSplit = (): boolean => typeof location !== 'undefined' && new URLSearchParams(location.search).get('view') === 'home'

/** "Open to the side" for a row's menu or a note's ⋯ menu, in the main window only. */
export const asideItem = (type: string, id: string): false | { label: string; keys: string; run: () => void } =>
  canSplit() && { label: 'Open to the side', keys: '⌥-click', run: () => openAside(type, id) }

/** Open something in a pane beside the one in front (or beside `from`). */
export const openAside = (type: string, id: string, from?: string | null): void =>
  void window.dispatchEvent(new CustomEvent('vigil:aside', { detail: { type, id, from } }))

/**
 * ⌥-click, as Finder and VS Code use it: whatever the click opens goes to the
 * side. Held from the press until just after the click, so a link the editor
 * follows on mouse-up counts too.
 */
let armed = false
let disarm: ReturnType<typeof setTimeout> | undefined
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (event) => {
    armed = event.button === 0 && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey
    clearTimeout(disarm)
    if (armed) disarm = setTimeout(() => void (armed = false), 1500)
  }, true)
  window.addEventListener('click', () => {
    if (!armed) return
    clearTimeout(disarm)
    disarm = setTimeout(() => void (armed = false), 0)
  }, true)
}
export const asideClick = (): boolean => armed
/** Taken: the click that armed it has been used, so nothing else opens to the side too. */
export const spendAsideClick = (): void => void (armed = false)

// --- a pane's own page width

/**
 * Narrow, Wide or Full for one pane, over the one in Settings: a note read
 * beside another can sit in a column while the other runs edge to edge. Set
 * only while the page is split; on its own, a page follows Settings.
 */
export type PaneWidth = 'narrow' | 'wide' | 'full'
export const PaneWidthContext = createContext<{ width?: PaneWidth; set: (width: PaneWidth) => void } | null>(null)
export const usePaneWidth = (): { width?: PaneWidth; set: (width: PaneWidth) => void } | null => useContext(PaneWidthContext)

// --- which note each pane has open, for a list to mark its row

let open: (string | null)[] = []
const marks = new Set<() => void>()
const followMarks = (tell: () => void): (() => void) => (marks.add(tell), () => void marks.delete(tell))
/** Said by the main window: each pane's open note, left to right (null for a page with none). */
export function setPaneNotes(ids: (string | null)[]): void {
  if (ids.length === open.length && ids.every((id, at) => id === open[at])) return
  open = ids
  marks.forEach((tell) => tell())
}
/** Where a note is open while the page is split: L, M or R, or null. */
export function paneMarkOf(id: string): 'L' | 'M' | 'R' | null {
  if (open.length < 2) return null
  const at = open.indexOf(id)
  return at < 0 ? null : at === 0 ? 'L' : at === open.length - 1 ? 'R' : 'M'
}
export const usePaneMark = (id: string): 'L' | 'M' | 'R' | null => useSyncExternalStore(followMarks, () => paneMarkOf(id))
