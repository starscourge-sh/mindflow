import { useCallback, useState } from 'react'

/**
 * An on/off choice remembered between runs, kept under `key` as "on" or
 * "off" (or the two words given, for a key that was written another way
 * before this). Storage that cannot be reached - a locked-down profile -
 * keeps the choice for this window only rather than throwing.
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
      } catch {
        // Kept for this window only.
      }
      return value
    })
  }, [key, yes, no])
  return [on, set]
}
