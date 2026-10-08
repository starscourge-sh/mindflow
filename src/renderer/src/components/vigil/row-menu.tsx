import type { ReactElement, ReactNode } from 'react'

import { toast } from './ui'
import { chime } from '@/lib/sound'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { keyFor } from '@/lib/keys'

/** One line of a right-click menu, a line that opens a few more beside it, or a rule between groups. */
export type MenuItem = { label: string; run: () => void; keys?: string; danger?: boolean; icon?: ReactNode; trail?: ReactNode } | 'separator' | false | null | undefined
/** A row menu's line can also open a few more beside it (Group with…). */
export type RowItem = MenuItem | { label: string; items: MenuItem[] }
type Shown = Exclude<RowItem, false | null | undefined>

/** The lines of a menu, drawn: shared by the menu and the ones that open beside it. */
const lines = (items: Shown[]): React.ReactNode =>
  items.map((item, index) =>
    item === 'separator' ? (
      <ContextMenuSeparator key={`separator-${index}`} />
    ) : 'items' in item ? (
      <ContextMenuSub key={item.label}>
        <ContextMenuSubTrigger>{item.label}</ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-52">{lines(item.items.filter(Boolean) as Shown[])}</ContextMenuSubContent>
      </ContextMenuSub>
    ) : (
      <ContextMenuItem key={item.label} variant={item.danger ? 'destructive' : 'default'} onSelect={item.run}>
        {item.icon}
        {item.label}
        {item.trail}
        {item.keys && keyFor(item.keys) && <ContextMenuShortcut>{keyFor(item.keys)}</ContextMenuShortcut>}
      </ContextMenuItem>
    )
  )

/**
 * What a right click on a row offers: the same things its keys and buttons
 * do, gathered where a mouse looks for them first.
 */
export function RowMenu({ items, children }: { items: RowItem[]; children: ReactElement }): React.JSX.Element {
  const shown = items.filter(Boolean) as Shown[]
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="w-56"
        // An item that opens its own picker (Change kind…) keeps the keys
        // there: the menu would otherwise hand focus back to the row.
        onCloseAutoFocus={(event) => {
          const picker = document.querySelector<HTMLElement>('[aria-modal="true"]')
          if (!picker) return
          event.preventDefault()
          picker.querySelector<HTMLElement>('input, textarea, button')?.focus()
        }}
        // The key a row shows works here too, on the row that was
        // right-clicked: press R with the menu open and that row resolves.
        onKeyDown={(event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return
          const item = shown.find((one) => one !== 'separator' && 'run' in one && one.keys?.length === 1 && one.keys.toLowerCase() === event.key.toLowerCase())
          if (!item || item === 'separator' || !('run' in item)) return
          event.preventDefault()
          event.stopPropagation()
          // Closed as Escape closes it: the menu has no open switch of its own.
          event.currentTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          item.run()
        }}
      >
        {lines(shown)}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Put text on the clipboard and say so. */
export const copy = (text: string, said = 'Copied'): void => void navigator.clipboard.writeText(text).then(() => {
    chime('copy')
    toast(said)
  })
