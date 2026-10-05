import type { ReactElement } from 'react'

import { toast } from './ui'
import { chime } from '@/lib/sound'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from '@/components/ui/context-menu'

/** One line of a right-click menu, or a rule between groups. */
export type MenuItem = { label: string; run: () => void; keys?: string; danger?: boolean } | 'separator' | false | null | undefined

/**
 * What a right click on a row offers: the same things its keys and buttons
 * do, gathered where a mouse looks for them first.
 */
export function RowMenu({ items, children }: { items: MenuItem[]; children: ReactElement }): React.JSX.Element {
  const shown = items.filter(Boolean) as Exclude<MenuItem, false | null | undefined>[]
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
          const item = shown.find((one) => one !== 'separator' && one.keys?.length === 1 && one.keys.toLowerCase() === event.key.toLowerCase())
          if (!item || item === 'separator') return
          event.preventDefault()
          event.stopPropagation()
          // Closed as Escape closes it: the menu has no open switch of its own.
          event.currentTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          item.run()
        }}
      >
        {shown.map((item, index) =>
          item === 'separator' ? (
            <ContextMenuSeparator key={`separator-${index}`} />
          ) : (
            <ContextMenuItem key={item.label} variant={item.danger ? 'destructive' : 'default'} onSelect={item.run}>
              {item.label}
              {item.keys && <ContextMenuShortcut>{item.keys}</ContextMenuShortcut>}
            </ContextMenuItem>
          )
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Put text on the clipboard and say so. */
export const copy = (text: string, said = 'Copied'): void => void navigator.clipboard.writeText(text).then(() => {
    chime('copy')
    toast(said)
  })
