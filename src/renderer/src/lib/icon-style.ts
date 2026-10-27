import { useSyncExternalStore } from 'react'

/**
 * "Icons" (Settings, Appearance): lines, or each one's own emoji, in menus and the sidebar's pages and tags. The
 * setting is worn on the page's root (lib/haligtree.ts), so a drawing already on screen follows it at once.
 */
const read = (): boolean => document.documentElement.dataset.menuIcons === 'emoji'
const listen = (changed: () => void): (() => void) => {
  const watch = new MutationObserver(changed)
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-menu-icons'] })
  return () => watch.disconnect()
}
export const emojiIcons = read
export const useEmojiIcons = (): boolean => useSyncExternalStore(listen, read)
