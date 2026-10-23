import { useCallback, useEffect, useState } from 'react'

/** The same choice set from outside a component (a link that needs it on), told to every user of the key. */
export function storeFlag(key: string, on: boolean, [yes, no]: [string, string] = ['on', 'off']): void {
  try {
    if (localStorage.getItem(key) === (on ? yes : no)) return
    localStorage.setItem(key, on ? yes : no)
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: on ? yes : no }))
  } catch {
    // Kept for nothing: storage cannot be reached.
  }
}

/**
 * An on/off choice remembered between runs, kept under `key` as "on" or
 * "off" (or the two words given, for a key that was written another way
 * before this). Storage that cannot be reached - a locked-down profile -
 * keeps the choice for this window only rather than throwing. Changed in
 * another window, or elsewhere in this one, it changes here too.
 */
export function useStoredFlag(key: string, fallback = false, [yes, no]: [string, string] = ['on', 'off']): [boolean, (on: boolean | ((was: boolean) => boolean)) => void] {
  const [on, setOn] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved === null ? fallback : saved === yes
    } catch {
      return fallback
    }
  })
  const set = useCallback((next: boolean | ((was: boolean) => boolean)): void => {
    setOn((was) => {
      const value = typeof next === 'function' ? next(was) : next
      try {
        localStorage.setItem(key, value ? yes : no)
        // Other windows hear of it on their own; this one's other users of the key
        // are told here, once this update is done rather than in the middle of it.
        queueMicrotask(() => window.dispatchEvent(new StorageEvent('storage', { key, newValue: value ? yes : no })))
      } catch {
        // Kept for this window only.
      }
      return value
    })
  }, [key, yes, no])
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => void (event.key === key && setOn(event.newValue === null ? fallback : event.newValue === yes))
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key, fallback, yes])
  return [on, set]
}
