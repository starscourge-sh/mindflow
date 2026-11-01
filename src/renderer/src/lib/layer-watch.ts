import { useLayoutEffect, useState } from 'react'
import { layerOpen } from '@/lib/menu-keys'

/** A [[, @ or / still being typed: its menu is open even in the moment it redraws between two searches. */
const TYPING = '.tiptap-slash-token'

/**
 * Whether a menu, picker, popover or dialog is open in this window, followed
 * as the page changes, while `watching` (a corner card is up or waiting): a
 * corner card never shows while one is open (the [[ picker under the "100
 * captures kept" card). Read once a frame at most, however much changes, and
 * first before the card is painted, so it never shows for a frame.
 */
export function useLayerOpen(watching: boolean): boolean {
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    if (!watching) return setOpen(false)
    let frame = 0
    const read = (): void => {
      frame = 0
      setOpen(layerOpen(TYPING))
    }
    read()
    const watch = new MutationObserver(() => void (frame ||= requestAnimationFrame(read)))
    watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'data-state', 'aria-expanded'] })
    return () => (watch.disconnect(), cancelAnimationFrame(frame))
  }, [watching])
  return open
}
