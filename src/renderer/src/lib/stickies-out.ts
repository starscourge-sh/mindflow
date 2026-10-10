import { useEffect, useState } from 'react'

/**
 * How many sticky notes are out on the screen now. Tidy stickies is offered
 * (the Vigil menu, ⌘K) only when there is at least one to tidy.
 */
export function useStickiesOut(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let live = true
    void window.api.stickiesOut?.().then((now) => live && setCount(now))
    const off = window.api.onStickiesOut?.(setCount)
    return () => ((live = false), off?.())
  }, [])
  return count
}
