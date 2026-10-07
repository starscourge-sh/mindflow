import { useSyncExternalStore } from 'react'

import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'

/**
 * How an open note is laid out for reading: its details beside it or put
 * away, and its words in a column or across the page.
 *
 * Details start put away, so a note opens as a page to read rather than a
 * form to fill. Opened, they stay open everywhere until put away again: one
 * choice for every note and every window, the way a sidebar is remembered.
 */
const KEY = 'noteDetails'
const CHANGED = 'mf:details'

export const detailsShown = (): boolean => {
  try {
    return localStorage.getItem(KEY) === 'open'
  } catch {
    return false
  }
}

export function showDetails(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'open' : 'closed')
  } catch {
    // This window only, until it reloads.
  }
  chime(on ? 'slide' : 'fold')
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

/** Whether an open note's details are out beside it. */
export const useDetailsShown = (): boolean => useSyncExternalStore(listen, detailsShown)

/** The words run edge to edge (Full width in Settings), or sit in a reading column. */
export const fullWidth = (): boolean => document.documentElement.dataset.width === 'full'

/** Full width on or off, for every page: the same switch as the one in Settings. */
export function setFullWidth(on: boolean): void {
  chime(on ? 'slide' : 'fold')
  void vigil.setSettings({ fullWidth: on })
}
