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

/**
 * Where a corner card may land in the main window: the sidebar's foot (home.tsx), or null while the sidebar is
 * folded to its icons or away, when there is no room that covers nothing. Read again as the window changes size.
 */
export function useCornerDock(): HTMLElement | null {
  const [dock, setDock] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    let frame = 0
    const read = (): void => {
      frame = 0
      setDock(document.querySelector<HTMLElement>('[data-corner-dock]'))
    }
    read()
    const later = (): void => void (frame ||= requestAnimationFrame(read))
    window.addEventListener('resize', later)
    // The sidebar folded or opened by hand, at any width.
    const watch = new MutationObserver(later)
    const side = document.querySelector('[data-corner-dock]')?.parentElement ?? document.querySelector('aside')
    if (side) watch.observe(side, { childList: true })
    if (side?.parentElement) watch.observe(side.parentElement, { childList: true })
    return () => (window.removeEventListener('resize', later), watch.disconnect(), cancelAnimationFrame(frame))
  }, [])
  return dock
}
