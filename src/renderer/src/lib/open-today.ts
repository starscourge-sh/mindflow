/**
 * The notes you open, newest first: what ⌘K lists under “Recent” before you
 * type. Kept in the window's own storage, which is the open book's alone, and
 * shared by every window of it.
 */

/** A note opened, and when it last was. */
export type OpenNote = { type: string; id: string; at: string }

// The key the sidebar's Recent used, so what was opened before still counts.
const KEY = 'sidebar:open-today'
/** How long an opening counts, and how many are kept. */
const KEEP_DAYS = 30
const KEEP_MAX = 120

const same = (one: { type: string; id: string }, type: string, id: string): boolean => one.type === type && one.id === id

export function readOpen(): OpenNote[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as OpenNote[]
    return Array.isArray(list) ? list.filter((one) => typeof one?.type === 'string' && typeof one.id === 'string' && typeof one.at === 'string') : []
  } catch {
    return []
  }
}

/** A note opened: to the top of the list. */
export function touch(type: string, id: string): void {
  const old = Date.now() - KEEP_DAYS * 86400000
  const next = [{ type, id, at: new Date().toISOString() }, ...readOpen().filter((one) => !same(one, type, id) && Date.parse(one.at) >= old)].slice(0, KEEP_MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Kept in this window only.
  }
}

/** The last few opened, newest first, as `type:id`. */
export const recentlyOpened = (count: number): string[] => readOpen().sort((a, b) => b.at.localeCompare(a.at)).slice(0, count).map((one) => `${one.type}:${one.id}`)
