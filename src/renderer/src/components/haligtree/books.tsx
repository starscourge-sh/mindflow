import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSideEnds } from '@/lib/side-ends'
import { Book as BookIcon, Plus } from 'lucide-react'

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { HUES, askBook, copyToBook, followBookHue, hueName, markInk, newBook, pickBookColor, shelf, switchBook, useShelf, type Book, type BookRef, type Hue, type RunningAsk } from '@/lib/books'
import { SANDBOX } from '@/lib/sandbox'
import { chime } from '@/lib/sound'
import { applyTheme, currentTheme } from '@/lib/theme'
import { haligtree } from '@/lib/haligtree'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { ago } from '../../../../main/dates'
import './shelf.css'
import { Tip, ask, refuse, toast, whyFailed } from './ui'
import { Swatch, type RowItem } from './row-menu'
import { APP_NAME } from '../../../../main/name'
import { cut, quoted } from '../../../../main/clip'

/** The box's two asks. Going to a book has no box: the sidebar's menu and ⌘K list them. */
type Asked = { mode: 'copy' | 'import'; refs?: BookRef[]; what?: 'vault' | 'files' }

const TITLE: Record<Asked['mode'], string> = {
  copy: 'Copy into which book…',
  import: 'Import into which book…'
}

/** Name a new book, then go into it. From the sidebar's menu, ⌘K and the menu bar. */
export async function askNewBook(): Promise<void> {
  if (SANDBOX) return refuse('Leave the sandbox first, then make a new book')
  const name = (await ask('Name the new book', 'e.g. Fresh start, or Notion test', { action: 'Make the book' }))?.trim()
  if (name) await newBook(name)
}

/**
 * A book's mark, wherever books are listed (the sidebar's menu, ⌘K, the box, Settings): a small book in its
 * colour, or in the theme's own accent when it has none. Never a dot: hollow and filled dots down a list read
 * as radio buttons.
 */
export function BookMark({ hue, className = 'size-3.5' }: { hue: Hue | null; className?: string }): React.JSX.Element {
  // The stroke said outright as well as the colour: a lit menu row turns the `color` of everything inside it to
  // the lit ink, and an icon's lines take `currentColor` from themselves, so the mark went to ink under the pointer.
  return <BookIcon aria-hidden data-book-mark={hue ?? 'none'} className={`shrink-0 ${className}`} style={{ color: markInk(hue), stroke: markInk(hue) }} />
}

/** The nine a book can wear, the theme's own first, as every picker of them names and paints them. */
const NINE = ([null, ...HUES] as (Hue | null)[]).map((hue) => ({ hue, label: hue ? hueName(hue) : 'No colour: the theme’s own', ink: markInk(hue) }))

/**
 * A book's colour, picked from its nine swatches in Settings: the theme's own, or one of the theme's hues, drawn
 * as a right-click's swatches are (row-menu.tsx), the one worn ticked and named beside them. What wears the
 * open book's colour eases into it in place.
 */
export function HueDots({ book }: { book: Book }): React.JSX.Element {
  const pick = (hue: Hue | null): void => {
    if (hue === book.color) return chime('nope')
    chime('tap')
    pickBookColor(book, hue)
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span role="radiogroup" aria-label="Book colour" className="flex items-center gap-1">
        {NINE.map(({ hue, label, ink }) => (
          <Tip key={hue ?? 'none'} label={label}>
            <button type="button" role="radio" aria-checked={hue === book.color} aria-label={hueName(hue)} data-hue={hue ?? 'none'} onClick={() => pick(hue)}
              className="grid size-6 place-items-center rounded-md transition-[background-color,scale] duration-100 hover:bg-foreground/10 active:scale-[0.94]">
              <Swatch color={ink} on={hue === book.color} />
            </button>
          </Tip>
        ))}
      </span>
      {/* The one worn, in words: nobody has to point at a swatch to learn its name. */}
      <span data-book-colour-name className="text-control text-muted-foreground">{book.color ? hueName(book.color) : 'The theme’s own colour'}</span>
    </span>
  )
}

/**
 * A book's colour picked where the picker then goes away (⌘K, its right-click): said, with Undo. In Settings
 * the swatches stay in view and say it themselves.
 */
export function colourBook(book: Book, hue: Hue | null): void {
  if (hue === book.color) return chime('nope')
  chime('tap')
  pickBookColor(book, hue)
  toast(hue ? `${cut(book.name, 40)} is ${hueName(hue).toLowerCase()} now` : `${cut(book.name, 40)} wears the theme’s own colour now`, () => pickBookColor(book, book.color), 'info')
}

/** “Book colour…” in ⌘K: the nine as its second step, each marked as the book would be, the one worn said. */
export const colourChoices = (book: Book): { label: string; note?: string; mark: React.JSX.Element; run: () => void }[] =>
  NINE.map(({ hue, label }) => ({ label, note: hue === book.color ? 'worn now' : undefined, mark: <BookMark hue={hue} />, run: () => colourBook(book, hue) }))

/**
 * A book's own right-click menu, wherever it is listed: its colour (the nine, as a calendar's), its name, and
 * where everything else about it is. `inSettings`: Settings on “Your book”, with its name ready to type when
 * asked. The sandbox is someone else's book, and no book's colour or name can be changed from inside it.
 */
export const bookMenu = (book: Book, inSettings: (rename: boolean) => void): RowItem[] => [
  ...(SANDBOX ? [] : [
    { heading: `Colour of ${cut(book.name, 28)}` },
    { swatches: NINE.map(({ hue, label, ink }) => ({ color: ink, label, on: hue === book.color, run: () => colourBook(book, hue) })) },
    'separator' as const,
    { label: 'Rename…', run: () => inSettings(true) }
  ]),
  { label: 'Show in Settings', run: () => inSettings(false) }
]

/** What the main window wears as a book opens: your look as it came along, once. */
function useCarried(): void {
  useEffect(() => {
    if (SANDBOX || new URLSearchParams(location.search).get('view') !== 'home') return
    void (window.api.haligtree<{ local?: Record<string, string>; settings?: Record<string, unknown> } | null>('books:carry')).then(async (carry) => {
      if (!carry) return
      for (const [key, value] of Object.entries(carry.local ?? {})) {
        try {
          localStorage.setItem(key, value)
        } catch {
          // Worn for now, not remembered.
        }
      }
      if (carry.local?.theme) applyTheme(currentTheme(), false)
      if (carry.settings && Object.keys(carry.settings).length) await haligtree.setSettings(carry.settings)
    })
  }, [])
}

/**
 * The box over the page, for the two asks where a new book's name can be typed: “Copy into which book…” and
 * “Import into which book…”. Type to narrow, Enter to choose, or name a new book by the words typed. Your
 * other books, the one you were in last first; never the open one (both asks are about another book), never
 * the Sandbox. It also asks about a session running as you switch, from any way of switching.
 */
export function BookAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<Asked | null>(null)
  const [typed, setTyped] = useState('')
  // Kept current: a book renamed or deleted in another window while the box is up is renamed or gone here too.
  const now = useShelf()
  // A session running as you switch: End it, or Keep it running.
  const [running, setRunning] = useState<RunningAsk | null>(null)
  useEffect(() => {
    const onRunning = (event: Event): void => {
      const detail = (event as CustomEvent<RunningAsk>).detail
      detail.heard = true
      chime('open')
      setRunning(detail)
    }
    window.addEventListener('haligtree:book-running', onRunning)
    return () => window.removeEventListener('haligtree:book-running', onRunning)
  }, [])
  useCarried()
  useEffect(followBookHue, [])
  useEffect(() => {
    const onAsk = (event: Event): void => {
      const detail = (event as CustomEvent<Asked>).detail
      // Only its two asks: there is no box for going to a book.
      if (detail?.mode !== 'copy' && detail?.mode !== 'import') return
      chime('open')
      setTyped('')
      setAsked(detail)
    }
    // From the menu bar, which has no page of its own to ask on.
    const onSwitch = (event: Event): void => void switchBook(String((event as CustomEvent).detail))
    const onNew = (): void => void askNewBook()
    const onImport = (): void => askBook('import')
    window.addEventListener('haligtree:book-ask', onAsk)
    window.addEventListener('haligtree:book-switch', onSwitch)
    window.addEventListener('haligtree:book-new', onNew)
    window.addEventListener('haligtree:book-import', onImport)
    return () => {
      window.removeEventListener('haligtree:book-ask', onAsk)
      window.removeEventListener('haligtree:book-switch', onSwitch)
      window.removeEventListener('haligtree:book-new', onNew)
      window.removeEventListener('haligtree:book-import', onImport)
    }
  }, [])
  if (running) {
    const answer = (choice: 'end' | 'keep' | null): void => (setRunning(null), running.answer(choice))
    return (
      <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={() => answer(null)}>
        <div role="dialog" aria-modal="true" aria-label="A focus session is running" data-book-running className="w-[min(26rem,90vw)] rounded-xl bg-popover p-4 shadow-(--mf-panel-shadow)" onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.key === 'Escape' && (event.stopPropagation(), answer(null))}>
          <p className="text-[15px] leading-5 font-semibold">A focus session is running in {running.book}</p>
          <p className="mt-1 truncate text-[14px] leading-5">{running.goal}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" data-running-choice="end" onClick={() => answer('end')}>End it</Button>
            <Button autoFocus data-running-choice="keep" onClick={() => answer('keep')}>Keep it running</Button>
          </div>
        </div>
      </div>
    )
  }
  if (!asked || !now) return null
  const close = (): void => setAsked(null)
  const pick = async (id: string, name = now.books.find((one) => one.id === id)?.name ?? 'the book'): Promise<void> => {
    close()
    if (asked.mode === 'import') return switchBook(id, asked.what ?? 'vault')
    const made = await copyToBook(asked.refs ?? [], id)
    if (!made) return refuse('Nothing was copied')
    chime('copy')
    toast(made === 1 ? `Copied one into ${name}, with its pictures and files. It shows there next time you open it` : `Copied ${made} into ${name}, with their pictures and files. They show there next time you open it`)
  }
  // A new book, by the words typed or by a name asked for: made, then copied or imported into. Never made and left empty.
  const fresh = async (): Promise<void> => {
    close()
    const name = typed.trim() || (await ask('Name the new book', 'e.g. Fresh start, or Notion test', { action: asked.mode === 'import' ? 'Make it and import' : 'Make it and copy' }))?.trim()
    if (!name) return
    const id = await window.api.haligtree<string>('books:create', name).catch(() => null)
    if (!id) return refuse(`Could not make ${quoted(name, 80)}`, 'error')
    // Made, but what was to go into it did not: said, never dropped.
    await pick(id, name).catch((cause: unknown) => refuse(`Made ${quoted(name, 80)}, but ${asked.mode === 'import' ? 'the import' : 'the copy'} did not work: ${whyFailed(cause)}`, 'error'))
  }
  const listed = now.books.filter((one) => !one.current)
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label={TITLE[asked.mode]} className="w-[min(24rem,90vw)] overflow-hidden rounded-xl bg-popover shadow-(--mf-panel-shadow)" onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === 'Escape' && (event.stopPropagation(), close())}>
        <Command onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') close()
        }}>
          <CommandInput autoFocus value={typed} onValueChange={setTyped} placeholder={TITLE[asked.mode]} />
          <CommandList className="max-h-[min(22rem,50vh)]">
            <CommandEmpty>No book by that name yet.</CommandEmpty>
            {listed.map((one) => (
              <CommandItem key={one.id} value={`${one.name} ${one.id}`} data-book={one.id} onSelect={() => void pick(one.id)}>
                <BookMark hue={one.color} />
                {/* Cut where it runs long, the whole name on rest (a title is shown only when its words are cut: title-tips.tsx). */}
                <span title={one.name} className="min-w-0 flex-1 truncate">{one.name}</span>
              </CommandItem>
            ))}
            {!SANDBOX && (
              <CommandItem value={`new book ${typed}`} forceMount data-book-fresh onSelect={() => void fresh()}>
                <Plus className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{typed.trim() ? `Into a new book: ${quoted(typed.trim(), 80)}` : 'Into a new book…'}</span>
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </div>
    </div>
  )
}

/** The open book's name, where the sidebar's foot says which Haligtree this is. */
export function BookName(): React.JSX.Element {
  const [name, setName] = useState('')
  useEffect(() => {
    const load = (): void => void shelf().then((now) => setName(now.name))
    load()
    window.addEventListener('haligtree:books-changed', load)
    return () => window.removeEventListener('haligtree:books-changed', load)
  }, [])
  return <>{name || APP_NAME}</>
}

/**
 * Your books on a shelf, at the head of the sidebar foot's menu (the user, 17 Nov, of Stripe Press's catalogue: "the
 * books look like they are on a shelf and hover shows a little more"). Each book stands as a spine in its colour, its
 * name down it; the one pointed at, or reached by the keys, is pulled out and turned to its face: its whole name, and
 * whether it is open now or when you were last in it. The open book stands turned when nothing is pointed at, so the
 * shelf keeps one width and the spines never move out from under the pointer: the one turned widens towards the one
 * turned before. A press opens the book (the open one: its name and colour in Settings); a right-click, its menu.
 */
/** Books on a shelf stand a little taller or shorter than each other: one of these by its id, the same every time. */
const TALL = [92, 98, 88, 100, 95]
export function BookShelf({ books, onPick, onMenu }: { books: Book[]; onPick: (book: Book) => void; onMenu: (event: React.MouseEvent, book: Book) => void }): React.JSX.Element {
  // More books than the menu is wide (30, say): the shelf scrolls sideways under the wheel or the trackpad, the side
  // with more fading out, opened on the open book; the keys bring the book they reach into view, as focus does.
  const row = useRef<HTMLDivElement>(null)
  const { style } = useSideEnds(row)
  // A body in braces: this Chromium's scrollIntoView answers with a promise, and an effect that returns one stops the page.
  useLayoutEffect(() => {
    row.current?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [])
  return (
    // Reached by the keys, a book turns at once; by the pointer, it slides out.
    <div ref={row} role="group" aria-label="Your books" data-book-shelf className="mf-shelf" style={style}
      onWheel={(event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY }}
      onKeyDownCapture={(event) => event.currentTarget.setAttribute('data-keyed', '')} onPointerMove={(event) => event.currentTarget.removeAttribute('data-keyed')}>
      {books.map((book, at) => {
        const said = book.current ? 'Open now' : at === 1 && book.openedAt ? 'You were in it last' : book.openedAt ? `Opened ${ago(book.openedAt)}` : 'Not opened yet'
        return (
          <DropdownMenuItem key={book.id} asChild data-book={book.id} aria-current={book.current || undefined} aria-label={`${book.name}, ${said.toLowerCase()}`}
            onContextMenu={(event) => onMenu(event, book)} onSelect={() => onPick(book)}>
            <div className="mf-spine" style={{ '--spine': markInk(book.color), '--tall': `${TALL[[...book.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % TALL.length]}px` } as React.CSSProperties}>
              <span aria-hidden className="mf-spine-side">{book.name}</span>
              <span aria-hidden className="mf-spine-face">
                <span className="mf-spine-name">{book.name}</span>
                <span className="mf-spine-said">{said}</span>
              </span>
              {book.current && <span data-book-open className="sr-only">Open now</span>}
            </div>
          </DropdownMenuItem>
        )
      })}
    </div>
  )
}
