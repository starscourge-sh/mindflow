import { useEffect, useRef } from 'react'

/**
 * A notice that goes by itself after `ms`, but waits for you, as the main
 * window's toasts do: its clock stops while the pointer rests on it or its
 * window is hidden, and runs on with the time it had left (at least a second
 * and a half) when you come back. Off while `active` is false. Spread the
 * returned handlers on the notice.
 */
export function usePatience(ms: number, onDone: () => void, active = true, restart?: unknown): { onPointerEnter: () => void; onPointerLeave: () => void } {
  const done = useRef(onDone)
  done.current = onDone
  const clock = useRef<{ timer?: ReturnType<typeof setTimeout>; left: number; since: number; held: Set<string> }>({ left: 0, since: 0, held: new Set() })
  const run = (): void => {
    const at = clock.current
    if (at.timer !== undefined || at.held.size || !at.left) return
    at.since = Date.now()
    at.timer = setTimeout(() => ((at.timer = undefined), (at.left = 0), done.current()), at.left)
  }
  const hold = (why: string): void => {
    const at = clock.current
    at.held.add(why)
    if (at.timer === undefined) return
    clearTimeout(at.timer)
    at.timer = undefined
    at.left = Math.max(0, at.left - (Date.now() - at.since))
  }
  const release = (why: string): void => {
    const at = clock.current
    if (!at.held.delete(why) || at.held.size || !at.left) return
    at.left = Math.max(1500, at.left)
    run()
  }
  useEffect(() => {
    const at = clock.current
    if (!active) return
    at.left = ms
    if (document.hidden) at.held.add('hidden')
    run()
    const seen = (): void => (document.hidden ? hold('hidden') : release('hidden'))
    document.addEventListener('visibilitychange', seen)
    return () => {
      document.removeEventListener('visibilitychange', seen)
      clearTimeout(at.timer)
      at.timer = undefined
      at.left = 0
      at.held.delete('hidden')
    }
  }, [ms, active, restart]) // eslint-disable-line react-hooks/exhaustive-deps
  return { onPointerEnter: () => hold('pointer'), onPointerLeave: () => release('pointer') }
}
