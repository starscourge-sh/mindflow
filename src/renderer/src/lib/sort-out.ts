/**
 * "Sort this out": a pasted or written page, line by line, into what each
 * line is best kept as (components/haligtree/sort-out.tsx). From any window: the
 * main window opens the sheet; another window asks it to.
 */
export function openSort(text: string, origin: string | null = null): void {
  const detail = { text, origin }
  if (new URLSearchParams(location.search).get('view') === 'home') window.dispatchEvent(new CustomEvent('haligtree:sort-out', { detail }))
  else window.api.openInHome('sort', JSON.stringify(detail))
}

const SORTED_KEY = 'morning-sort:done'
const AWAY_KEY = 'morning-sort:away'
const today = (): string => new Date().toLocaleDateString('en-CA')
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Offered again, then.
  }
}

/** The morning sort: "Sort this out" over the Inbox, with a ten-minute clock. */
export function openInboxSort(): void {
  const detail = { text: '', origin: null, inbox: true }
  if (new URLSearchParams(location.search).get('view') === 'home') window.dispatchEvent(new CustomEvent('haligtree:sort-out', { detail }))
  else window.api.openInHome('sort', JSON.stringify(detail))
}
/** Started today: the morning offer is not made again until tomorrow. */
export const markSorted = (): void => (write(SORTED_KEY, today()), void window.dispatchEvent(new CustomEvent('haligtree:morning-sorted')))
/** Put away for today with its ×. */
export const sortAway = (): void => (write(AWAY_KEY, today()), void window.dispatchEvent(new CustomEvent('haligtree:morning-sorted')))
/** Whether the morning offer is due: on, from 4 until noon, and not started or put away today. */
export function sortDue(on: boolean | undefined, now = new Date()): boolean {
  return on !== false && now.getHours() >= 4 && now.getHours() < 12 && read(SORTED_KEY) !== today() && read(AWAY_KEY) !== today()
}
