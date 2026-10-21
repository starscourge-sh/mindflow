import { useEffect, useState } from 'react'
import { APP_NAME } from '../../../main/name'

/**
 * Words that did not reach the database yet, said in one calm voice for the
 * whole window: every editor that saves through `useSameWords` reports here
 * when a save fails and again when a retry lands, and the toast lane shows a
 * single line for as long as anything is still waiting (save-trouble.tsx).
 */
export type SaveTrouble = { state: 'failing'; reason: string; tries: number } | { state: 'saved' } | null

const failing = new Map<symbol, { reason: string; tries: number }>()
let shown: SaveTrouble = null
let settle: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<(trouble: SaveTrouble) => void>()

const tell = (next: SaveTrouble): void => {
  shown = next
  for (const one of listeners) one(next)
}

/** Why it failed, in a few plain words, never the database's own wording. */
export const reasonOf = (error: unknown): string => {
  const raw = String((error as Error | undefined)?.message ?? error ?? '')
  if (/full|SQLITE_FULL|ENOSPC/i.test(raw)) return 'Your disk is full. Free up some space and they go in by themselves.'
  if (/readonly|read-only|EACCES|EPERM/i.test(raw)) return `${APP_NAME} isn't allowed to write to its folder. Check its permissions in Finder.`
  if (/locked|busy/i.test(raw)) return 'Your notes are busy for a moment.'
  return ''
}

/** One editor's save failed: the line comes up, or counts another try. */
export function saveFailed(who: symbol, error: unknown): void {
  clearTimeout(settle)
  const was = failing.get(who)
  failing.set(who, { reason: reasonOf(error), tries: (was?.tries ?? 0) + 1 })
  const worst = [...failing.values()].reduce((a, b) => (b.tries > a.tries ? b : a))
  tell({ state: 'failing', reason: worst.reason, tries: worst.tries })
}

/** One editor's waiting words went in: once none is waiting, the line says so and goes. */
export function saveLanded(who: symbol): void {
  if (!failing.delete(who) || failing.size) return
  tell({ state: 'saved' })
  settle = setTimeout(() => tell(null), 1800)
}

/** How long to wait before trying again: soon at first, then less often, never more than 20 seconds. */
export const retryIn = (tries: number): number => Math.min(20000, 1500 * 2 ** Math.max(0, tries - 1))

export function useSaveTrouble(): SaveTrouble {
  const [trouble, setTrouble] = useState<SaveTrouble>(shown)
  useEffect(() => {
    listeners.add(setTrouble)
    setTrouble(shown)
    return () => void listeners.delete(setTrouble)
  }, [])
  return trouble
}
