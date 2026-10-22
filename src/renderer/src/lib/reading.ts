import { useSyncExternalStore } from 'react'

import { chime } from '@/lib/sound'
import { isSplit, usePane } from '@/lib/split'
import { vigil } from '@/lib/vigil'

/**
 * How an open note is laid out for reading: its details beside it or put
 * away, and its words in a column or across the page.
 *
 * Details start put away, so a note opens as a page to read rather than a
 * form to fill. Opened, they stay open everywhere until put away again: one
 * choice for every note and every window, until Vigil is next opened, when
 * they start put away again.
 *
 * Split, each pane keeps its own: details brought out beside the note in
 * one pane leave the note beside it as it was.
 */
const KEY = 'noteDetails'
const CHANGED = 'mf:details'

// The window's choice as last read, so a page drawn many times over (every
// step of Back and Forward) never reads storage again for it; let go of when
// it changes here or in another window.
let stored: boolean | null = null

/** Called once as the main window first loads: each time Vigil opens, details start put away. */
export function putDetailsAway(): void {
  stored = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing kept, so nothing to put away.
  }
}

// Each pane's own choice, made while split; a pane with none follows the window's.
const inPane = new Map<string, boolean>()

if (typeof window !== 'undefined') {
  window.addEventListener(CHANGED, () => void (stored = null), true)
  window.addEventListener('storage', (event) => void (event.key === KEY && (stored = null)), true)
}

export const detailsShown = (pane?: string | null): boolean => {
  const own = pane ? inPane.get(pane) : undefined
  if (own !== undefined) return own
  if (stored !== null) return stored
  try {
    return (stored = localStorage.getItem(KEY) === 'open')
  } catch {
    return false
  }
}

/** Out or away: for one pane when `pane` is given and the page is split, else everywhere. */
export function showDetails(on: boolean, pane?: string | null): void {
  chime(on ? 'slide' : 'fold')
  if (pane && isSplit()) {
    inPane.set(pane, on)
    return void window.dispatchEvent(new Event(CHANGED))
  }
  inPane.clear()
  stored = null
  try {
    localStorage.setItem(KEY, on ? 'open' : 'closed')
  } catch {
    // This window only, until it reloads.
  }
  window.dispatchEvent(new Event(CHANGED))
}

const listen = (changed: () => void): (() => void) => {
  const onStorage = (event: StorageEvent): void => void (event.key === KEY && changed())
  window.addEventListener(CHANGED, changed)
  // The other windows follow.
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGED, changed)
    window.removeEventListener('storage', onStorage)
  }
}

/** Whether an open note's details are out beside it, in the pane this is drawn in. */
export function useDetailsShown(): boolean {
  const pane = usePane()
  return useSyncExternalStore(listen, () => detailsShown(pane))
}

/** How wide a page is: a reading column, a wider one, or edge to edge. */
export type PageWidth = 'narrow' | 'wide' | 'full'
export const PAGE_WIDTHS: { id: PageWidth; label: string }[] = [
  { id: 'narrow', label: 'Narrow' },
  { id: 'wide', label: 'Wide' },
  { id: 'full', label: 'Full' },
]

/** The width saved, or the old Full width switch for someone who set it before there were three. */
export const widthOf = (settings: { pageWidth?: PageWidth; fullWidth?: boolean } | null | undefined): PageWidth =>
  settings?.pageWidth ?? (settings?.fullWidth ? 'full' : 'narrow')

/** The words run edge to edge (Full in Settings), or sit in a column. */
export const fullWidth = (): boolean => document.documentElement.dataset.width === 'full'

/** The page's width, for every page and every window. The old switch follows, for anything still reading it. */
export function setPageWidth(width: PageWidth): void {
  chime(width === 'narrow' ? 'fold' : 'slide')
  void vigil.setSettings({ pageWidth: width, fullWidth: width === 'full' })
}

/** Full width on or off, for every page: the same choice as the one in Settings. */
export function setFullWidth(on: boolean): void {
  setPageWidth(on ? 'full' : 'narrow')
}
