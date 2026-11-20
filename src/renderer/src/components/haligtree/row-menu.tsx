import { MENU_LINE } from '@/lib/float'
import { useRef, useState, type ReactElement, type ReactNode } from 'react'

import { refuse, toast } from './ui'
import { chime } from '@/lib/sound'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { keyFor } from '@/lib/keys'
import { noteLinkText } from '@/lib/capture-links'
import { MenuGlyph } from '@/components/ui/menu-icon'

/** One line of a right-click menu, a line that opens a few more beside it, or a rule between groups. */
export type MenuItem = { label: string; /** What it means, on a quiet line under the name: the label stays a short name. */ hint?: string; run: () => void; keys?: string; danger?: boolean; icon?: ReactNode; trail?: ReactNode; /** A name for it on the page (data-menu-item), for a probe. */ id?: string
  /** About the whole list or picking in it, not the thing right-clicked (Select, Select all, every goal on a sticky): never in an item's menu, only in the list's own. */
  about?: 'list'
  /** Whether it can run here, read as the menu opens: false leaves it out, so a menu never offers what then refuses. */
  can?: () => boolean } | 'separator' | false | null | undefined
/** A row menu's line can also open a few more beside it (Group with…). */
/** A menu line with what it means on a quiet line under its name, the one way every menu draws one (a menu built by hand too). */
export const Hinted = ({ label, hint, icon }: { label: string; hint: string; icon?: ReactNode }): React.JSX.Element => (
  <>
    {icon ?? <MenuGlyph label={label} small />}
    <span className="flex min-w-0 flex-col"><span className={MENU_LINE}>{label}</span><span data-menu-hint className="max-w-64 text-xs leading-snug whitespace-normal text-muted-foreground">{hint}</span></span>
  </>
)
export type RowItem = MenuItem | { label: string; items: RowItem[]; icon?: ReactNode } | { heading: string }
  /** A line that opens a small tool beside it (a calendar to pick a card's day): it closes the menu itself once used. */
  | { label: string; panel: ReactNode; icon?: ReactNode }
  /** A row of colour swatches, the one in use ticked (an event's colour). */
  | { swatches: { color: string; label: string; on: boolean; run: () => void }[] }
export type Shown = Exclude<RowItem, false | null | undefined>

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

/** One order in every menu: a line that takes the thing away (Move to the Bin, Delete) comes last, after a rule, wherever its menu put it. */
export const dangerLast = (items: RowItem[]): RowItem[] => {
  const away = items.filter((item) => item && item !== 'separator' && 'run' in item && item.danger)
  return away.length ? [...items.filter((item) => !away.includes(item)), 'separator', ...away] : items
}

/** Rules only between groups of lines: never first, last or twice in a row, whatever was left out. */
export const tidy = <T,>(items: (T | 'separator')[]): (T | 'separator')[] =>
  // A rule is kept only with a line before it and a line after it: two rules ending a menu left one hanging (20 Nov).
  items.filter((item, index) => item !== 'separator' || (items.slice(0, index).some((one) => one !== 'separator') && items[index - 1] !== 'separator' && items.slice(index + 1).some((one) => one !== 'separator')))

/**
 * Lines that belong together, folded into one line that opens them beside it,
 * so a long menu reads as a few choices: where to open it, the queue, and the
 * copies. Only where two or more of a kind are there; one alone stays a line.
 */
const OPEN_IN = 'Open in…'
/** The other ways to open a thing, most used first: the order they take inside "Open in…". */
const WAYS_TO_OPEN = ['open in a new tab', 'open to the side', 'open in a new window', 'open in a small window', 'read']
const NESTS: [string, RegExp][] = [
  // Every way to open it other than plain "Open", in one place (11 Nov: "Open", "Open in…", "Read" and "Open in a
  // new tab" stood in four places down one menu).
  [OPEN_IN, new RegExp(`^(${WAYS_TO_OPEN.join('|')})$`, 'i')],
  ['Queue', /^(add to queue|read next)$/i],
  ['Copy', /^copy\b/i]
]
const labelOf = (item: RowItem): string => (item && item !== 'separator' && 'run' in item ? item.label : '')
export function nest(items: RowItem[]): RowItem[] {
  let out: RowItem[] = [...items]
  for (const [label, rule] of NESTS) {
    const fits = (item: RowItem): boolean => rule.test(labelOf(item))
    const found = out.filter(fits)
    if (found.length < 2) continue
    let at = out.findIndex(fits)
    if (label === OPEN_IN) {
      found.sort((a, b) => WAYS_TO_OPEN.indexOf(labelOf(a).toLowerCase()) - WAYS_TO_OPEN.indexOf(labelOf(b).toLowerCase()))
      // Right under "Open" where the menu has one: a thing's own ways in come first, together.
      const open = out.findIndex((item) => labelOf(item) === 'Open')
      if (open >= 0 && open < at) at = open + 1
    }
    const rest = out.filter((item, index) => index < at || !fits(item))
    rest.splice(at, 0, { label, items: found })
    out = rest
  }
  return out
}

/** A menu with its nested lines laid out flat again, for a menu that cannot open one beside it. */
export const flat = (items: RowItem[]): MenuItem[] =>
  fits(items).flatMap((item): MenuItem[] => (item && item !== 'separator' && 'items' in item ? flat(item.items) : item && item !== 'separator' && ('heading' in item || 'swatches' in item || 'panel' in item) ? [] : [item as MenuItem]))

/** One colour to pick, as every row of them draws it (a menu's swatches, a book's nine in Settings): a small square of it, ticked and outlined when it is the one in use. */
export const Swatch = ({ color, on }: { color: string; on: boolean }): React.JSX.Element => (
  <span aria-hidden data-swatch={on ? 'on' : ''} className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] ${on ? 'outline-2 outline-offset-1 outline-foreground/60' : ''}`} style={{ background: color }}>
    {on && <svg viewBox="0 0 12 12" className="size-3 text-background"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
  </span>
)

/** The lines of a menu, drawn: shared by the menu and the ones that open beside it, and by a sticky's menu window (windows/menu.tsx). */
export const lines =(items: Shown[]): React.ReactNode =>
  tidy(items).map((item, index) =>
    item === 'separator' ? (
      <ContextMenuSeparator key={`separator-${index}`} />
    ) : 'swatches' in item ? (
      <div key={`swatches-${index}`} role="group" aria-label="Its colour" className="flex items-center gap-1 px-1.5 py-1">
        {item.swatches.map((one) => (
          <ContextMenuItem key={one.label} aria-label={one.label} aria-checked={one.on} role="menuitemradio" onSelect={one.run}
            className="flex size-6 items-center justify-center rounded-md p-0 focus:bg-accent">
            <Swatch color={one.color} on={one.on} />
          </ContextMenuItem>
        ))}
      </div>
    ) : 'heading' in item ? (
      <ContextMenuLabel key={`heading-${item.heading}`}>{item.heading}</ContextMenuLabel>
    ) : 'panel' in item ? (
      <ContextMenuSub key={`${item.label}-${index}`}>
        <ContextMenuSubTrigger>{item.icon}{item.icon ? <span className={MENU_LINE}>{item.label}</span> : item.label}</ContextMenuSubTrigger>
        <ContextMenuSubContent className="p-0">{item.panel}</ContextMenuSubContent>
      </ContextMenuSub>
    ) : 'items' in item ? (
      <ContextMenuSub key={`${item.label}-${index}`}>
        <ContextMenuSubTrigger>{item.icon}{item.icon ? <span className={MENU_LINE}>{item.label}</span> : item.label}</ContextMenuSubTrigger>
        {/* Wider where a line carries a hint under its name, so the hint keeps to two lines. */}
        <ContextMenuSubContent className={item.items.some((one) => one && one !== 'separator' && 'hint' in one && one.hint) ? 'w-64' : 'w-52'}>{lines(item.items.filter(Boolean) as Shown[])}</ContextMenuSubContent>
      </ContextMenuSub>
    ) : (
      // Its hint on a quiet second line under its name, never a tip: a menu row shows no floating surface.
      <ContextMenuItem key={item.label} variant={item.danger ? 'destructive' : 'default'} onSelect={item.run}>
        {/* A line with a hint under its name begins with markup, not words, so it is given its drawing here: every line has one. */}
        {item.hint ? <Hinted label={item.label} hint={item.hint} icon={item.icon} /> : item.icon ? <>{item.icon}<span className={MENU_LINE}>{item.label}</span></> : item.label /* Its words bare, never in a fragment: the menu draws their icon only for a line that starts with words. */}
        {item.trail}
        {item.keys && keyFor(item.keys) && <ContextMenuShortcut>{keyFor(item.keys)}</ContextMenuShortcut>}
      </ContextMenuItem>
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
/** Whether any line of a menu would show, stopping at the first that does: what a row needs to know before its menu is built. */
const anyFits = (items: RowItem[], list: boolean): boolean =>
  items.some((item) => !!item && item !== 'separator' && ('items' in item ? anyFits(item.items, list) : !('run' in item) || !((item.about === 'list' && !list) || (item.can && !item.can()))))

export function RowMenu({ items, writes, list = false, onOpenChange, children }: { items: RowItem[] | ((field: HTMLElement | null) => RowItem[]); writes?: boolean | HTMLElement; /** The list's own menu (its empty space, its heading): lines about the whole list belong here. */ list?: boolean; /** Told as it opens and shuts (a toast stays up while its menu is open). */ onOpenChange?: (open: boolean) => void; children: ReactElement }): React.JSX.Element {
  const [writing, setWriting] = useState<Writing | null>(null)
  // Built only while open, read again each time it opens: whether a line can run (a note on show to picture) is a
  // question of that moment. A list of hundreds of rows built hundreds of menus on every render and froze the window.
  const [open, setOpen] = useState(false)
  // A line chosen that moves on (Open, Pick a date…) keeps where it went; an edit line, or none, comes back to the words.
  const after = useRef<'back' | 'stay' | (() => void)>('back')
  // The lines last built: kept while the menu fades out, and read by its keys while it is open.
  const built = useRef<{ shown: Shown[]; drawn: ReactNode }>({ shown: [], drawn: null })
  const own = (field: HTMLElement | null): RowItem[] => dangerLast(fits(typeof items === 'function' ? items(field) : items, list))
  if (open) {
    const editable = !!writing && !(writing.field instanceof HTMLTextAreaElement || writing.field instanceof HTMLInputElement ? writing.field.readOnly || writing.field.disabled : false)
    const edits: RowItem[] = writes && writing
      ? [
          'separator',
          editable && writing.picked && { label: 'Cut', keys: '⌘X', run: () => void (after.current = () => document.execCommand('cut')) },
          writing.picked && { label: 'Copy', keys: '⌘C', run: () => void (after.current = () => document.execCommand('copy')) },
          editable && { label: 'Paste', keys: '⌘V', run: () => void (after.current = () => pasteInto(writing.field)) }
        ]
      : []
    const mark = (list: RowItem[]): RowItem[] => list.map((item) => (item && item !== 'separator' && 'run' in item ? { ...item, run: () => ((after.current = 'stay'), item.run()) } : item && item !== 'separator' && 'items' in item ? { ...item, items: mark(item.items) } : item))
    const mine = own(writing?.field ?? null)
    // The edit lines after the nesting: their Copy is the words', never folded in with the row's copies.
    const shown = [...nest(writes ? mark(mine) : mine), ...edits].filter(Boolean) as Shown[]
    built.current = { shown, drawn: lines(shown) }
  }
  // Nothing to offer: the row's own right click, not an empty menu. Lines handed over as a list are asked without
  // building the menu; lines made as it opens (a function) are asked as it opens.
  if (!writes && typeof items !== 'function' && !anyFits(items, list)) return children
  return (
    <ContextMenu onOpenChange={(now) => (onOpenChange?.(now), now && (after.current = 'back'), setOpen(now))}>
      <ContextMenuTrigger asChild data-row-menu onContextMenuCapture={(event) => {
        // A row stays filled while its menu is open; anything taller (a deck's stack, a card, a tile) is ringed
        // instead (main.css), as Finder rings an icon: a fill behind a card read as the page dimming.
        event.currentTarget.toggleAttribute('data-menu-tall', event.currentTarget.getBoundingClientRect().height > 56)
        const shows = (field: HTMLElement | null): boolean => own(field).some((item) => item && item !== 'separator')
        if (!writes) {
          // Lines made as it opens, and none of them to show: no empty menu.
          if (typeof items === 'function' && !shows(null)) event.preventDefault()
          return
        }
        const field = writes instanceof HTMLElement ? writes : fieldOf(event.target)
        setWriting(field ? writingAt(field) : null)
        // Off the words with nothing of the row's own to offer: no empty menu.
        if (!field && !shows(null)) event.preventDefault()
      }}>{children}</ContextMenuTrigger>
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
          // A sheet over the page, or a popover a line opened to write in (the Calendar's new event): it keeps the keys.
          const picker = document.querySelector<HTMLElement>('[aria-modal="true"], [data-takes-keys]')
          if (!picker) return
          event.preventDefault()
          // A popover to write in gives the keys to its line, not to the first button over it.
          ;((picker.matches('[data-takes-keys]') ? picker.querySelector<HTMLElement>('input, textarea') : null) ?? picker.querySelector<HTMLElement>('input, textarea, button'))?.focus()
        }}
        // The key a row shows works here too, on the row that was
        // right-clicked: press R with the menu open and that row resolves.
        onKeyDown={(event) => {
          // ⌘X, ⌘C and ⌘V do as the edit lines say, with the menu open.
          const chord = event.metaKey && !event.ctrlKey && !event.altKey ? `⌘${event.key.toUpperCase()}` : ''
          // A line folded into one beside it keeps its key too (Do it next week, W, under Later).
          const every = flat(built.current.shown)
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
        {built.current.drawn}
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
 * The same lines in Haligtree's menu window over a sticky (main's popup-menu.ts), for a window too small to
 * hold the menu itself: opened at `at`, where it was right-clicked, and the line chosen runs as it would in
 * the row's menu.
 */
export async function stickyMenu(items: RowItem[], point?: { x: number; y: number }, list = false): Promise<void> {
  // Folded as the row's menu folds them, at the top only: what is folded in stays as it is.
  const shown = (list: RowItem[]): Shown[] => tidy(list.filter((one) => one && !(one !== 'separator' && ('heading' in one || 'swatches' in one))) as Shown[])
  const lines = (list: Shown[]): unknown[] => list.map((one) => (one === 'separator' ? { separator: true } : 'items' in one ? { label: one.label, submenu: lines(shown(one.items)) } : 'run' in one ? { label: one.label, keys: one.keys, danger: one.danger } : { label: '' }))
  const top = shown(nest(dangerLast(fits(items, list))))
  const path = await window.api.stickyMenu(lines(top), point)
  if (!path) return
  let at: Shown | undefined = top[path[0]]
  for (const step of path.slice(1)) at = at && at !== 'separator' && 'items' in at ? shown(at.items)[step] : undefined
  if (at && at !== 'separator' && 'run' in at) at.run()
}
