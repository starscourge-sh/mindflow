import type { ReactElement } from 'react'

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
      <ContextMenuContent className="w-56">
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
export const copy = (text: string, said: string, toast: (message: string) => void): void =>
  void navigator.clipboard.writeText(text).then(() => toast(said))
