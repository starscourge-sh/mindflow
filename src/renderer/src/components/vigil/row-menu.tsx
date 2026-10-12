import type { ReactElement, ReactNode } from 'react'

import { toast } from './ui'
import { chime } from '@/lib/sound'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { keyFor } from '@/lib/keys'

/** One line of a right-click menu, a line that opens a few more beside it, or a rule between groups. */
export type MenuItem = { label: string; run: () => void; keys?: string; danger?: boolean; icon?: ReactNode; trail?: ReactNode } | 'separator' | false | null | undefined
/** A row menu's line can also open a few more beside it (Group with…). */
export type RowItem = MenuItem | { label: string; items: RowItem[]; icon?: ReactNode } | { heading: string }
type Shown = Exclude<RowItem, false | null | undefined>

/** Rules only between groups of lines: never first, last or twice in a row, whatever was left out. */
export const tidy = <T,>(items: (T | 'separator')[]): (T | 'separator')[] =>
  items.filter((item, index) => item !== 'separator' || (index > 0 && index < items.length - 1 && items[index - 1] !== 'separator'))

/**
 * Lines that belong together, folded into one line that opens them beside it,
 * so a long menu reads as a few choices: where to open it, the queue, and the
 * copies. Only where two or more of a kind are there; one alone stays a line.
 */
const NESTS: [string, RegExp][] = [
  ['Open in…', /^open (in a new window|to the side)$/i],
  ['Queue', /^(add to queue|read next)$/i],
  ['Copy', /^copy\b/i]
]
export function nest(items: RowItem[]): RowItem[] {
  const out: RowItem[] = [...items]
  for (const [label, rule] of NESTS) {
    const fits = (item: RowItem): boolean => !!item && item !== 'separator' && 'run' in item && rule.test(item.label)
    const found = out.filter(fits)
    if (found.length < 2) continue
    const at = out.findIndex(fits)
    out.splice(at, 1, { label, items: found })
    for (let index = out.length - 1; index > at; index--) if (fits(out[index])) out.splice(index, 1)
  }
  return out
}

/** A menu with its nested lines laid out flat again, for a menu that cannot open one beside it. */
export const flat = (items: RowItem[]): MenuItem[] =>
  items.flatMap((item): MenuItem[] => (item && item !== 'separator' && 'items' in item ? flat(item.items) : item && item !== 'separator' && 'heading' in item ? [] : [item as MenuItem]))

/** The lines of a menu, drawn: shared by the menu and the ones that open beside it. */
const lines = (items: Shown[]): React.ReactNode =>
  tidy(items).map((item, index) =>
    item === 'separator' ? (
      <ContextMenuSeparator key={`separator-${index}`} />
    ) : 'heading' in item ? (
      <ContextMenuLabel key={`heading-${item.heading}`}>{item.heading}</ContextMenuLabel>
    ) : 'items' in item ? (
      <ContextMenuSub key={`${item.label}-${index}`}>
        <ContextMenuSubTrigger>{item.icon}{item.label}</ContextMenuSubTrigger>
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
  const shown = nest(items).filter(Boolean) as Shown[]
  // Nothing to offer: the row's own right click, not an empty menu.
  if (!shown.some((item) => item !== 'separator')) return children
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="w-60"
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
