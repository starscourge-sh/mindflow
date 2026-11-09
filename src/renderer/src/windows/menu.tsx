// A sticky's menus: menu.html, the one window main keeps for them (main's popup-menu.ts). The window covers the
// screen the pointer is on while a menu is open, and draws nothing but the menu: the main window's own right-click
// menu (its surface, rows, icons, keys, light and sounds), opened at the point right-clicked.
import '../assets/main.css'
import { useEffect, useRef, useState } from 'react'
import { start } from '../main'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '../components/ui/context-menu'
import { flat, lines, type RowItem, type Shown } from '../components/haligtree/row-menu'
import { useAppearance } from '../lib/haligtree'

/** A line as main sends it (popup-menu.ts). */
type Wire =
  | { separator: true }
  | { heading: string }
  | { swatches: { color: string; label: string; on: boolean }[] }
  | { label: string; keys?: string; danger?: boolean; submenu?: Wire[] }
type Asked = { id: number; x: number; y: number; lines: Wire[] }

/** Main's lines as a row menu's, each choosing its own place in the menu. */
const items = (list: Wire[], path: number[], pick: (path: number[]) => void): RowItem[] =>
  list.map((one, n): RowItem =>
    'separator' in one ? 'separator'
      : 'heading' in one ? { heading: one.heading }
      : 'swatches' in one ? { swatches: one.swatches.map((swatch, at) => ({ ...swatch, run: () => pick([...path, n, at]) })) }
      : one.submenu ? { label: one.label, items: items(one.submenu, [...path, n], pick) }
      : { label: one.label, keys: one.keys, danger: one.danger, run: () => pick([...path, n]) })

// Only the menu is drawn: the rest of the window is clear.
document.documentElement.style.background = 'transparent'
document.body.style.background = 'transparent'

function PopupMenu(): React.JSX.Element | null {
  // The app's own look, as in every window: its theme, the interface font you chose, its sounds.
  useAppearance()
  const [asked, setAsked] = useState<Asked | null>(null)
  const picked = useRef<number[] | null>(null)
  const trigger = useRef<HTMLDivElement>(null)
  useEffect(() => window.api.onPopupMenu((menu) => ((picked.current = null), setAsked(menu as Asked | null))), [])
  // Opened as a right click opens a row's menu, at the point main gave.
  useEffect(() => {
    if (!asked || !trigger.current) return
    trigger.current.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: asked.x, clientY: asked.y, button: 2 }))
  }, [asked])
  if (!asked) return null
  const shown = items(asked.lines, [], (path) => void (picked.current = path)).filter(Boolean) as Shown[]
  const done = (): void => window.api.popupMenuDone(asked.id, picked.current)
  return (
    <ContextMenu key={asked.id} onOpenChange={(open) => !open && done()}>
      {/* The window's clear room: a right click of the person's own here opens nothing. */}
      <ContextMenuTrigger asChild onContextMenu={(event) => event.nativeEvent.isTrusted && event.preventDefault()}>
        <div ref={trigger} data-menu-room className="fixed inset-0" />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60" collisionPadding={12} data-popup-menu
        // The keys a line shows work here too, as in a row's menu: R on a task, ⌘W to take it down.
        onKeyDown={(event) => {
          const chord = event.metaKey && !event.ctrlKey && !event.altKey ? `⌘${event.key.toUpperCase()}` : ''
          if ((event.ctrlKey || event.altKey || event.metaKey) && !chord) return
          const line = flat(shown).find((one) => one && one !== 'separator' && (chord ? one.keys === chord : one.keys?.length === 1 && one.keys.toLowerCase() === event.key.toLowerCase()))
          if (!line || line === 'separator') return
          event.preventDefault()
          event.stopPropagation()
          line.run()
          event.currentTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        }}>
        {lines(shown)}
      </ContextMenuContent>
    </ContextMenu>
  )
}

start(
  <>
    <PopupMenu />
  </>
)
