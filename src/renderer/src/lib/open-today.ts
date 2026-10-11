import { useEffect, useState } from 'react'

/**
 * The sidebar's Open today and Earlier, Arc's way: Pinned never ages, and
 * every note you open lands under Open today, then moves to Earlier on its
 * own once its time is up (overnight, after a week, or never, as Settings
 * says), or when you close it there. Earlier keeps the last few weeks, and
 * anything in it comes back with a click or a drag.
 *
 * Kept in the window's own storage, which is the open book's alone, and
 * shared by every window of it.
 */

export type OpenFor = 'day' | 'week' | 'never'
/** A note in the sidebar: when it first landed in this stretch, when it was last opened, and when it was closed. */
export type OpenNote = { type: string; id: string; since: string; at: string; closed?: string }

const KEY = 'sidebar:open-today'
/** Seen landed once: the first-time line under Open today is not shown again. */
const EVER = 'sidebar:open-ever'
/** How many Earlier keeps, and for how long. */
const EARLIER_MAX = 20
const EARLIER_DAYS = 30
const CHANGED = 'vigil:open-today'

const same = (one: { type: string; id: string }, type: string, id: string): boolean => one.type === type && one.id === id

export function readOpen(): OpenNote[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as OpenNote[]
    return Array.isArray(list) ? list.filter((one) => typeof one?.type === 'string' && typeof one.id === 'string' && typeof one.at === 'string') : []
  } catch {
    return []
  }
}
function save(list: OpenNote[]): void {
  const old = Date.now() - EARLIER_DAYS * 86400000
  const kept = list.filter((one) => Date.parse(one.closed ?? one.at) >= old).slice(0, 120)
  try {
    localStorage.setItem(KEY, JSON.stringify(kept))
  } catch {
    // Kept in this window only.
  }
  window.dispatchEvent(new Event(CHANGED))
}

/** Where Open today begins: midnight today, six midnights back, or the beginning. */
export function cutoff(openFor: OpenFor, now = new Date()): number {
  if (openFor === 'never') return 0
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (openFor === 'week') start.setDate(start.getDate() - 6)
  return start.getTime()
}
export const isOpen = (one: OpenNote, openFor: OpenFor, now = new Date()): boolean => !one.closed && Date.parse(one.at) >= cutoff(openFor, now)

/** A note opened: under Open today, or kept there, its place unchanged. */
export function touch(type: string, id: string, openFor: OpenFor = 'day'): void {
  const list = readOpen()
  const now = new Date().toISOString()
  const was = list.find((one) => same(one, type, id))
  const stays = was && isOpen(was, openFor)
  const next: OpenNote = { type, id, since: stays ? was.since : now, at: now }
  save([next, ...list.filter((one) => !same(one, type, id))])
  try {
    localStorage.setItem(EVER, '1')
  } catch {
    // The first-time line shows once more.
  }
}
/** Moved to Earlier now, as if its time were up. */
export const close = (type: string, id: string): void =>
  save(readOpen().map((one) => (same(one, type, id) ? { ...one, closed: new Date().toISOString() } : one)))
/** Gone from the sidebar altogether (the note itself is untouched). */
export const forget = (type: string, id: string): void => save(readOpen().filter((one) => !same(one, type, id)))
/** Whether anything has ever landed under Open today. */
export const everOpened = (): boolean => {
  try {
    return localStorage.getItem(EVER) === '1'
  } catch {
    return false
  }
}

/** The two lists: Open today, newest landed first, and Earlier, most recently moved first. */
export function split(list: OpenNote[], openFor: OpenFor, now = new Date()): { open: OpenNote[]; earlier: OpenNote[] } {
  const moved = (one: OpenNote): number => (one.closed ? Date.parse(one.closed) : Date.parse(one.at))
  return {
    open: list.filter((one) => isOpen(one, openFor, now)).sort((a, b) => b.since.localeCompare(a.since)),
    earlier: list.filter((one) => !isOpen(one, openFor, now)).sort((a, b) => moved(b) - moved(a)).slice(0, EARLIER_MAX)
  }
}

/**
 * The list, kept current: as it changes here or in another window, and at
 * midnight, when the day's notes move to Earlier on their own.
 */
export function useOpenToday(): { list: OpenNote[]; now: Date } {
  const [state, setState] = useState(() => ({ list: readOpen(), now: new Date() }))
  useEffect(() => {
    const load = (): void => setState({ list: readOpen(), now: new Date() })
    const onStorage = (event: StorageEvent): void => void (event.key === KEY && load())
    let timer = 0
    const atMidnight = (): void => {
      const next = new Date()
      next.setHours(24, 0, 1, 0)
      timer = window.setTimeout(() => (load(), atMidnight()), Math.min(next.getTime() - Date.now(), 2 ** 31 - 1))
    }
    atMidnight()
    // A Mac asleep over midnight misses the timer: looked at again on waking.
    const onShow = (): void => void (document.hidden || load())
    window.addEventListener(CHANGED, load)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('focus', onShow)
    return () => {
      clearTimeout(timer)
      window.removeEventListener(CHANGED, load)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('focus', onShow)
    }
  }, [])
  return state
}
