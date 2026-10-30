import { useRef, useState, type ReactElement, type ReactNode } from 'react'

import { Tip, refuse, toast } from './ui'
import { chime } from '@/lib/sound'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { keyFor } from '@/lib/keys'
import { noteLinkText } from '@/lib/capture-links'

/** One line of a right-click menu, a line that opens a few more beside it, or a rule between groups. */
export type MenuItem = { label: string; /** What it means, as a tip to its right: the label stays a short name. */ hint?: string; run: () => void; keys?: string; danger?: boolean; icon?: ReactNode; trail?: ReactNode; /** A name for it on the page (data-menu-item), for a probe. */ id?: string
  /** About the whole list or picking in it, not the thing right-clicked (Select, Select all, every goal on a sticky): never in an item's menu, only in the list's own. */
  about?: 'list'
  /** Whether it can run here, read as the menu opens: false leaves it out, so a menu never offers what then refuses. */
  can?: () => boolean } | 'separator' | false | null | undefined
/** A row menu's line can also open a few more beside it (Group with…). */
export type RowItem = MenuItem | { label: string; items: RowItem[]; icon?: ReactNode } | { heading: string }
  /** A row of colour swatches, the one in use ticked (an event's colour). */
  | { swatches: { color: string; label: string; on: boolean; run: () => void }[] }
type Shown = Exclude<RowItem, false | null | undefined>

/**
 * The one rule every menu passes through: a line shows only where it fits.
 * An item's menu (a row, a pin, a card) leaves out what is about the whole
 * list, and every menu leaves out a line that cannot run where it was opened,
 * so nothing is offered that then says no. Nested lines are held to it too.
 */
export const fits = (items: RowItem[], list = false): RowItem[] =>
  items.flatMap((item): RowItem[] => {
    if (!item || item === 'separator') return [item]
    if ('items' in item) {
      const inner = fits(item.items, list)
      return inner.some((one) => one && one !== 'separator') ? [{ ...item, items: inner }] : []
    }
    if (!('run' in item)) return [item]
    return (item.about === 'list' && !list) || (item.can && !item.can()) ? [] : [item]
  })

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
  fits(items).flatMap((item): MenuItem[] => (item && item !== 'separator' && 'items' in item ? flat(item.items) : item && item !== 'separator' && ('heading' in item || 'swatches' in item) ? [] : [item as MenuItem]))

/** The lines of a menu, drawn: shared by the menu and the ones that open beside it. */
const lines = (items: Shown[]): React.ReactNode =>
  tidy(items).map((item, index) =>
    item === 'separator' ? (
      <ContextMenuSeparator key={`separator-${index}`} />
    ) : 'swatches' in item ? (
      <div key={`swatches-${index}`} role="group" aria-label="Its colour" className="flex items-center gap-1 px-1.5 py-1">
        {item.swatches.map((one) => (
          <ContextMenuItem key={one.label} aria-label={one.label} aria-checked={one.on} role="menuitemradio" onSelect={one.run}
            className="flex size-6 items-center justify-center rounded-md p-0 focus:bg-accent">
            <span aria-hidden className="flex size-4 items-center justify-center rounded-[4px]" style={{ background: one.color }}>
              {one.on && <svg viewBox="0 0 12 12" className="size-3 text-background"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </span>
          </ContextMenuItem>
        ))}
      </div>
    ) : 'heading' in item ? (
      <ContextMenuLabel key={`heading-${item.heading}`}>{item.heading}</ContextMenuLabel>
    ) : 'items' in item ? (
      <ContextMenuSub key={`${item.label}-${index}`}>
        <ContextMenuSubTrigger>{item.icon}{item.label}</ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-52">{lines(item.items.filter(Boolean) as Shown[])}</ContextMenuSubContent>
      </ContextMenuSub>
    ) : (
      <Tip key={item.label} label={item.hint} side="right">
      <ContextMenuItem variant={item.danger ? 'destructive' : 'default'} onSelect={item.run}>
        {item.icon}
        {item.label}
        {item.trail}
        {item.keys && keyFor(item.keys) && <ContextMenuShortcut>{keyFor(item.keys)}</ContextMenuShortcut>}
      </ContextMenuItem>
      </Tip>
    )
  )

/** Where the words right-clicked are: the field, and what was picked in it then. */
type Writing = { field: HTMLElement; from: number; to: number; picked: boolean }
const fieldOf = (target: EventTarget | null): HTMLElement | null => {
  const node = target instanceof Element ? target.closest<HTMLElement>('textarea, input, [contenteditable="true"]') : null
  return node instanceof HTMLInputElement && !/^(text|search|url|email)$/.test(node.type) ? null : node
}
const writingAt = (field: HTMLElement): Writing => {
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
    const from = field.selectionStart ?? 0
    const to = field.selectionEnd ?? from
    return { field, from, to, picked: to > from }
  }
  const picked = !!window.getSelection()?.toString() && field.contains(window.getSelection()?.anchorNode ?? null)
  return { field, from: 0, to: 0, picked }
}
/** The field given its caret and pick back, as they were when it was right-clicked. */
const backTo = ({ field, from, to }: Writing): void => {
  if (!field.isConnected) return
  field.focus({ preventScroll: true })
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) field.setSelectionRange(from, to)
}
/** Words pasted as a paste: the field's own paste (a list a line a task) first, plain words if it takes none. */
const pasteInto = (field: HTMLElement): void =>
  void navigator.clipboard.readText().then((text) => {
    if (!text) return
    const data = new DataTransfer()
    data.setData('text/plain', text)
    if (field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))) document.execCommand('insertText', false, text)
  })

/**
 * What a right click on a row offers: the same things its keys and buttons
 * do, gathered where a mouse looks for them first.
 *
 * `writes`: the row holds words you write in (a line on Today's page). A right
 * click in them keeps Cut, Copy and Paste at the end of the menu, and the caret
 * goes back where it was once the menu shuts, unless a line chosen took you on.
 * Given an element, the lines act on it (a note's editor) whatever was clicked.
 * `items` may be read as the menu opens, from the field right-clicked.
 */
export function RowMenu({ items, writes, list = false, children }: { items: RowItem[] | ((field: HTMLElement | null) => RowItem[]); writes?: boolean | HTMLElement; /** The list's own menu (its empty space, its heading): lines about the whole list belong here. */ list?: boolean; children: ReactElement }): React.JSX.Element {
  const [writing, setWriting] = useState<Writing | null>(null)
  // Read again each time it opens: whether a line can run (a note on show to picture) is a question of that moment.
  const [, setOpened] = useState(0)
  // A line chosen that moves on (Open, Pick a date…) keeps where it went; an edit line, or none, comes back to the words.
  const after = useRef<'back' | 'stay' | (() => void)>('back')
  const editable = !!writing && !(writing.field instanceof HTMLTextAreaElement || writing.field instanceof HTMLInputElement ? writing.field.readOnly || writing.field.disabled : false)
  const edits: RowItem[] = writes && writing
    ? [
        'separator',
        editable && writing.picked && { label: 'Cut', keys: '⌘X', run: () => void (after.current = () => document.execCommand('cut')) },
        writing.picked && { label: 'Copy', keys: '⌘C', run: () => void (after.current = () => document.execCommand('copy')) },
        editable && { label: 'Paste', keys: '⌘V', run: () => void (after.current = () => pasteInto(writing.field)) }
      ]
    : []
  const own = fits(typeof items === 'function' ? items(writing?.field ?? null) : items, list)
  const mark = (list: RowItem[]): RowItem[] => list.map((item) => (item && item !== 'separator' && 'run' in item ? { ...item, run: () => ((after.current = 'stay'), item.run()) } : item && item !== 'separator' && 'items' in item ? { ...item, items: mark(item.items) } : item))
  // The edit lines after the nesting: their Copy is the words', never folded in with the row's copies.
  const shown = [...nest(writes ? mark(own) : own), ...edits].filter(Boolean) as Shown[]
  // Nothing to offer: the row's own right click, not an empty menu.
  if (!writes && !shown.some((item) => item !== 'separator')) return children
  return (
    <ContextMenu onOpenChange={(open) => open && ((after.current = 'back'), setOpened((count) => count + 1))}>
      <ContextMenuTrigger asChild onContextMenuCapture={writes ? (event) => {
        const field = writes instanceof HTMLElement ? writes : fieldOf(event.target)
        setWriting(field ? writingAt(field) : null)
        // Off the words with nothing of the row's own to offer: no empty menu.
        if (!field && !own.some((item) => item && item !== 'separator')) event.preventDefault()
      } : undefined}>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="w-60"
        // An item that opens its own picker (Change kind…) keeps the keys
        // there: the menu would otherwise hand focus back to the row.
        onCloseAutoFocus={(event) => {
          const then = after.current
          if (writes && writing && then !== 'stay') {
            event.preventDefault()
            backTo(writing)
            if (typeof then === 'function') then()
            return
          }
          // A line chosen took you on (a panel, a calendar): the words do not take the caret back from it.
          if (writes) event.preventDefault()
          const picker = document.querySelector<HTMLElement>('[aria-modal="true"]')
          if (!picker) return
          event.preventDefault()
          picker.querySelector<HTMLElement>('input, textarea, button')?.focus()
        }}
        // The key a row shows works here too, on the row that was
        // right-clicked: press R with the menu open and that row resolves.
        onKeyDown={(event) => {
          // ⌘X, ⌘C and ⌘V do as the edit lines say, with the menu open.
          const chord = event.metaKey && !event.ctrlKey && !event.altKey ? `⌘${event.key.toUpperCase()}` : ''
          // A line folded into one beside it keeps its key too (Do it next week, W, under Later).
          const every = flat(shown)
          if ((event.ctrlKey || event.altKey || event.metaKey) && !every.some((one) => one && one !== 'separator' && one.keys === chord)) return
          const item = every.find((one) => one && one !== 'separator' && (chord ? one.keys === chord : one.keys?.length === 1 && one.keys.toLowerCase() === event.key.toLowerCase()))
          if (!item || item === 'separator') return
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

/**
 * A row's grip, clicked (not dragged): its right-click menu, opened under the
 * grip, as the editor's block handle and Notion's do. A right click on the
 * words would put the caret in them first; the grip never does.
 */
export function openFromGrip(event: React.MouseEvent<HTMLElement>): void {
  event.preventDefault()
  event.stopPropagation()
  const box = event.currentTarget.getBoundingClientRect()
  event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left, clientY: box.bottom + 4, button: 2 }))
}

/** Put text on the clipboard and say so. */
export const copy = (text: string, said = 'Copied'): void => void navigator.clipboard.writeText(text).then(() => {
    chime('copy')
    toast(said)
  }, () => refuse('Could not copy it', 'error'))

/** A link to anything (a note, a task, an event, a day), put on the clipboard to paste into a note. */
export const copyLink = (key: string, words: string): void => copy(noteLinkText(key, words), 'Copied a link: paste it into any note')
/** "Copy link", as every kind's menu says it. */
export const copyLinkItem = (key: string, words: string): MenuItem => ({ label: 'Copy link', hint: 'Paste it into any note to link here', run: () => copyLink(key, words) })

/**
 * The same lines in a menu the Mac draws, for a window too small to hold one
 * of ours (a sticky): the line chosen runs as it would in the row's menu.
 */
export async function nativeMenu(items: RowItem[], list = false): Promise<void> {
  // Folded as the row's menu folds them, at the top only: what is folded in stays as it is.
  const shown = (list: RowItem[]): Shown[] => tidy(list.filter((one) => one && !(one !== 'separator' && 'heading' in one)) as Shown[])
  const lines = (list: Shown[]): unknown[] => list.map((one) => (one === 'separator' ? { separator: true } : 'items' in one ? { label: one.label, submenu: lines(shown(one.items)) } : { label: 'label' in one ? one.label : '' }))
  const top = shown(nest(fits(items, list)))
  const path = await window.api.stickyMenu(lines(top))
  if (!path) return
  let at: Shown | undefined = top[path[0]]
  for (const step of path.slice(1)) at = at && at !== 'separator' && 'items' in at ? shown(at.items)[step] : undefined
  if (at && at !== 'separator' && 'run' in at) at.run()
}
