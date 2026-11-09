import { useEffect, useRef } from 'react'

/**
 * A sticky's own lines in its right-click menu ("Open in Haligtree", "Take it down"), chosen in the menu window
 * and sent back by main as 'sticky:do': each kind of sticky hands its own open and take-down here.
 */
export function useStickyDo(act: { open: () => void; down: () => void }): void {
  const now = useRef(act)
  now.current = act
  useEffect(() => window.api.onStickyDo((what) => now.current[what]?.()), [])
}
