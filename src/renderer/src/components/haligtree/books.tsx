import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSideEnds } from '@/lib/side-ends'
import { animate, motion, useMotionValue, useSpring, useTransform, useVelocity, type MotionValue } from 'motion/react'
import { still } from '@/lib/motion'
import { onlyRealLeaves, realMove } from '@/lib/real-move'
import { BookBox, inked } from './book-box'
import { OtherCover, ShelfCover } from './reader-card'
import { Book as BookIcon, Plus } from 'lucide-react'

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { SortableList, SortableRow, useCarried as useHeldInRow } from './sortable'
import { pointerAt } from './carry'
import { HUES, askBook, moveBook, askCards, bookCardNow, bookCardOf, copyToBook, followBookHue, hueName, markInk, newBook, pickBookColor, shelf, switchBook, useShelf, type Book, type BookCard, type BookRef, type Hue, type RunningAsk } from '@/lib/books'
import { SANDBOX } from '@/lib/sandbox'
import { chime } from '@/lib/sound'
import { applyTheme, currentTheme } from '@/lib/theme'
import { haligtree } from '@/lib/haligtree'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { ago } from '../../../../main/dates'
import './shelf.css'
import { refuse, toast, whyFailed } from './ui'
import { NameInMenu } from './name-in-place'
import type { RowItem } from './row-menu'
import { APP_NAME } from '../../../../main/name'
import { cut, quoted } from '../../../../main/clip'

/** The box's two asks. Going to a book has no box: the sidebar's menu and ⌘K list them. */
type Asked = { mode: 'copy' | 'import'; refs?: BookRef[]; what?: 'vault' | 'files' }

const TITLE: Record<Asked['mode'], string> = {
  copy: 'Copy into which book…',
  import: 'Import into which book…'
}

/**
 * Name a new book, then go into it: from ⌘K and the menu bar, the sidebar's book menu opens with its "New book…" row
 * turned into the name (NewBookRow, home.tsx), as choosing that row does. Never a box with a title over a field.
 */
export function askNewBook(): void {
  if (SANDBOX) return refuse('Leave the sandbox first, then make a new book')
  window.dispatchEvent(new CustomEvent('haligtree:book-naming'))
}

/**
 * The "New book…" row in the sidebar's book menu, turned into the new book's name where it was chosen (NameInMenu): a
 * blank book in the theme's own colour beside it. Enter or a click away makes the book and opens it, Esc leaves it
 * unmade. The menu holds open while it is typed (home.tsx).
 */
export function NewBookRow({ onDone }: { onDone: () => void }): React.JSX.Element {
  return (
    <NameInMenu data-new-book mark={<BookMark hue={null} />} placeholder="Name the new book" label="New book name" onDone={onDone}
      onMake={(words) => {
        chime('settled')
        void newBook(words).catch((cause: unknown) => refuse(`Could not make ${quoted(words, 80)}: ${whyFailed(cause)}`, 'error'))
      }} />
  )
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
 * A book's colour picked where the picker then goes away (⌘K, its right-click, its "…" in Settings): said, with Undo.
 */
export function colourBook(book: Book, hue: Hue | null): void {
  if (hue === book.color) return chime('nope')
  chime('tap')
  pickBookColor(book, hue)
  toast(hue ? `${cut(book.name, 40)} is ${hueName(hue).toLowerCase()} now` : `${cut(book.name, 40)} wears the theme’s own colour now`, () => pickBookColor(book, book.color), 'info')
}

/** A book's nine as swatches, the one worn ticked: in its right-click menu, its row's menu in Settings and the sidebar's book menu. */
export const colourSwatches = (book: Book): { color: string; label: string; on: boolean; run: () => void }[] =>
  NINE.map(({ hue, label, ink }) => ({ color: ink, label, on: hue === book.color, run: () => colourBook(book, hue) }))

/** “Book colour…” in ⌘K: the nine as its second step, each marked as the book would be, the one worn said. */
export const colourChoices = (book: Book): { label: string; note?: string; mark: React.JSX.Element; run: () => void }[] =>
  NINE.map(({ hue, label }) => ({ label, note: hue === book.color ? 'worn now' : undefined, mark: <BookMark hue={hue} />, run: () => colourBook(book, hue) }))

/** The words over a book's nine, the one wording wherever they show: its right-click menu and the sidebar's book menu. */
export const colourHeading = (book: Book): string => `Colour of ${cut(book.name, 28)}`

/**
 * A book's own menu: the one list, wherever a book is right-clicked (the book's name at the sidebar's foot, a spine
 * on the shelf in its menu, its row in Settings › Books and that row's "…"). Its colour (the nine, in the menu
 * itself: a submenu holding one row of swatches was a second step for nothing, the user, 21 Nov), Rename…, Show in
 * Settings (left out where it already is Settings), and Delete…, asked in the book's own row in Settings. Your
 * first book and the open one are never deleted (switch to another book first). The sandbox is someone else's
 * book: nothing of a book can be changed from inside it, so only the way to Settings is left there.
 */
export const bookMenu = (book: Book, { rename, remove, show }: { rename: () => void; remove: () => void; show?: () => void }): RowItem[] => [
  ...(SANDBOX ? [] : [
    { heading: colourHeading(book) },
    { swatches: colourSwatches(book) },
    'separator' as const,
    { label: 'Rename…', run: rename }
  ]),
  ...(show ? [{ label: 'Show in Settings', run: show }] : []),
  ...(SANDBOX ? [] : [{ label: 'Delete…', danger: true, can: () => !book.current && book.id !== 'default', run: remove }])
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
  // "Into a new book…" chosen with nothing typed: the box's field takes the new book's name.
  const [naming, setNaming] = useState(false)
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
      setNaming(false)
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
  // A new book, by the words typed in the box's own field: made, then copied or imported into. Never made and left
  // empty. Nothing typed yet, the field says it now takes the new book's name, never a second box asking for it.
  const fresh = async (): Promise<void> => {
    const name = typed.trim()
    if (!name) return (chime('tap'), setNaming(true))
    close()
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
          <CommandInput autoFocus value={typed} onValueChange={setTyped} placeholder={naming ? 'Name the new book, then ↵' : TITLE[asked.mode]} />
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
 * books look like they are on a shelf and hover shows a little more"; 20 Nov: "why not actual 3d like the other book?
 * the one on the last page of the welcome"; 21 Nov: "the book in the settings needs to be your reference, and don't
 * forget about the realistic grain"). Each book is the Settings book (book-box.tsx), scaled: every spine one height, in
 * woven cloth of its own colour with foil rules, its name up it whole in the serif in foil (gold, or bronze on a pale
 * spine), never cut (22 Nov: "the name of the book on the back rim gets cut off with an ellipsis"). The one
 * pointed at, or reached by the keys, is pulled out and turns on its spine to face you, wearing its
 * own reader card on the cream paper cover, crisp, as Settings shows it. The rest each stand turned a few degrees, so a sliver of
 * cover shows beside every spine, as books on a real shelf never face dead sideways. Turned or not, every book stands on
 * the ledge at one height, as the user's references stand theirs (21 Nov: a row of VHS tapes, one out to its cover; a
 * row of design books, one turned): the one turned out is wider, never raised. Under the shelf, its name and whether it is open now
 * or when you were last in it, as a video shelf names the tape it has out. The open book stands turned when nothing
 * is pointed at, so the shelf keeps one width and the spines never move out from under the pointer: the books either
 * side part for the one turning by just what the one turning back gives up, on one spring. A press opens the book
 * (the open one: its name and colour in Settings); a right-click, its menu.
 */
/** A shelf book: every one the same, six times as tall as its spine is wide, its cover two wide to three tall (the Settings book's shape, so the label on its cloth is the reader card scaled), its boards thin. */
const SHELF_BOOK = { thick: 24, wide: 96, high: 144, board: 1.5, overhang: 1.5 }
/** The room a turned book takes on the shelf: its cover turned, a little of its spine, and a gap either side. */
const TURNED_ROOM = 112
/**
 * A book at rest is turned this far off square, so about 8px of its cover shows at the right of its spine (96 wide at
 * 6 degrees; 10 degrees would show 16px, a strip, not a sliver), and its room on the shelf holds both: 24 of spine,
 * the sliver, and a hair over.
 */
const LEAN = 6
const SPINE_ROOM = 32
/** Turned out, it stays turned a little, its spine and depth showing at its edge, as a book held up to you. */
const TURNED = 18
/** How far the eye is from the shelf, in pixels: the books' perspective. */
const EYE = 700
/** Pulled out and turned, and back: one spring for all, so the one turning out takes just what the one turning back gives up. */
const PULL = { stiffness: 260, damping: 26 }
/**
 * The books not pulled out stand a little back in the shelf's shade (the user, 22 Nov: "slightly dim non-active
 * books"): a black veil this strong over each (85% as bright), lifted as a book turns out, on its turn's own spring.
 * Its foil still reads at 3:1 or more on every spine through it (qa/book-shelf.mjs).
 */
const HELD_BACK = 0.15
/**
 * And the sliver of cover beside each spine deeper still, turned away into the shelf's shade, so its card's colours
 * read as a hint of a cover, never bright fragments beside the spines (22 Nov).
 */
const SLIVER_SHADE = 0.42
/**
 * Each colour's spine, as OKLCH lightness and strength, the hue the theme's own: deep ones and pale ones, as a real
 * shelf has, every one far enough from its foil (bright gold on the deep, antique bronze on the pale, picked by lightness in
 * shelf.css) to read at 3:1 or more. The deep ones deep enough for pale gold, as a leather binding is.
 */
const SPINE: Record<Hue, [number, number]> = { blue: [0.45, 0.13], purple: [0.44, 0.14], pink: [0.76, 0.11], red: [0.46, 0.16], orange: [0.74, 0.14], yellow: [0.87, 0.14], green: [0.45, 0.1], gray: [0.71, 0.01] }
/**
 * The spines' colours along the shelf. A book with no colour wears one of the theme's two neutrals (shelf.css), the
 * two taking turns, so two such books never stand alike; two books of one colour side by side, the second a shade
 * deeper (or paler), so no two neighbours ever match.
 */
function spinesOf(books: Book[]): string[] {
  let plain = 0
  let before = ''
  return books.map((book) => {
    if (!book.color) return (before = `var(--mf-spine-plain-${plain++ % 2})`)
    const [light, strength] = SPINE[book.color]
    const again = before === book.color
    before = again ? '' : book.color
    return inked(book.color, again ? (light > 0.8 ? light - 0.13 : light < 0.64 ? light - 0.12 : light + 0.1) : light, strength)
  })
}

/** Picked up, a book rises this far off the ledge, as one slid along a shelf is lifted just clear of it. */
const LIFT = 4
/** Its lean as it is slid, by how fast: degrees for each pixel a second, and never past this. */
const LEAN_BY_SPEED = 0.004
const MOST_LEAN = 4

/**
 * A book picked up and carried along the shelf (the user, 22 Nov, of a grey box and a title pill: "wtf"): the book
 * itself goes with the pointer, turned back to its spine, lifted a little off the ledge with a shadow under it and
 * leaning with how fast it is slid, as a real book is slid along a shelf; the others part to show where it will land.
 * Its middle rides under the pointer: taken by its cover, the pointer's place on it is pulled in to the spine's middle
 * as it turns back. Let go, it glides to its place (Esc: back to where it was) on one spring.
 */
function useSlid(carried: boolean, width: MotionValue<number>, at: number): { x: MotionValue<number>; y: MotionValue<number>; rotate: MotionValue<number>; shade: MotionValue<number>; held: MotionValue<number>; ref: React.RefObject<HTMLDivElement | null> } {
  const ref = useRef<HTMLDivElement>(null)
  const calm = still()
  // While held: where the pointer is, where its room on the shelf starts, and how far off its middle it was taken.
  const held = useMotionValue(0)
  const pointer = useMotionValue(0)
  const home = useMotionValue(0)
  const grip = useRef({ off: 0, wide: SPINE_ROOM })
  // Let go: how far it still is from its place, gliding to none.
  const back = useMotionValue(0)
  const settling = useRef(false)
  const x = useTransform(() => {
    const wide = width.get()
    if (!held.get()) return back.get()
    const { off, wide: was } = grip.current
    const pulled = was > SPINE_ROOM + 1 ? off * Math.min(1, Math.max(0, (wide - SPINE_ROOM) / (was - SPINE_ROOM))) : off
    return pointer.get() - pulled - home.get() - wide / 2
  })
  const speed = useVelocity(x)
  const leaning = useTransform(() => (held.get() && !calm ? Math.max(-MOST_LEAN, Math.min(MOST_LEAN, speed.get() * LEAN_BY_SPEED)) : 0))
  const lean = useSpring(leaning, { stiffness: 400, damping: 30 })
  const rise = useMotionValue(0)
  const risen = useSpring(rise, { stiffness: 500, damping: 34 })
  const y = calm ? rise : risen
  const shade = useTransform(y, (by) => Math.min(1, Math.max(0, -by / LIFT)))
  const roomOf = (): HTMLElement | null => ref.current?.parentElement ?? null
  useLayoutEffect(() => {
    const room = roomOf()
    if (!room) return undefined
    if (carried) {
      const left = room.getBoundingClientRect().left
      const wide = width.get()
      const now = back.get()
      back.stop()
      pointer.set(pointerAt().x)
      home.set(left)
      grip.current = { off: pointerAt().x - left - wide / 2 - now, wide }
      held.set(1)
      rise.set(-LIFT)
      settling.current = false
      const follow = (event: PointerEvent): void => (home.set(room.getBoundingClientRect().left), pointer.set(event.clientX))
      const scrolled = (): void => home.set(room.getBoundingClientRect().left)
      window.addEventListener('pointermove', follow, true)
      window.addEventListener('scroll', scrolled, true)
      return () => (window.removeEventListener('pointermove', follow, true), window.removeEventListener('scroll', scrolled, true))
    }
    if (!held.get() && !settling.current) return undefined
    // Let go (or put back): from where it was on screen to its room now, wherever that is, on one spring.
    const left = room.getBoundingClientRect().left
    const from = (held.get() ? x.get() : back.get()) + home.get() - left
    held.set(0)
    home.set(left)
    rise.set(0)
    back.set(from)
    if (calm) return void back.set(0)
    settling.current = true
    const glide = animate(back, 0, { type: 'spring', stiffness: 420, damping: 36, onComplete: () => void (settling.current = false) })
    return () => glide.stop()
  }, [carried, at]) // eslint-disable-line react-hooks/exhaustive-deps
  return { x, y, rotate: lean, shade, held, ref }
}

function ShelfBook({ book, said, up: pointedAt, spine, at, keyed, lit, onPick, onMenu, onShift }: { book: Book; said: string; up: boolean; spine: string; at: number; keyed: () => boolean; lit: MotionValue<number>; onPick: () => void; onMenu: (event: React.MouseEvent) => void; /** ⌥← and ⌥→: one place along. */ onShift: (by: -1 | 1) => void }): React.JSX.Element {
  // Picked up, it turns back to its spine for as long as it is carried.
  const carried = useHeldInRow()
  const up = pointedAt && !carried
  // 0 a spine, 1 pulled out and turned: the book's turn, its room on the shelf and what stands in front, all from it.
  // A plain value moved by animate() (as the reader card's spin is), so a book caught mid-turn goes on from where it is.
  const out = useMotionValue(up ? 1 : 0)
  const flat = still()
  const turn = useTransform(out, (at) => 90 - LEAN - (90 - LEAN - (flat ? 0 : TURNED)) * at)
  const width = useTransform(out, (at) => SPINE_ROOM + (TURNED_ROOM - SPINE_ROOM) * at)
  const slid = useSlid(carried, width, at)
  // The one carried stands in front of every other, and gliding to its place after.
  const zIndex = useTransform(() => (slid.held.get() || Math.abs(slid.x.get()) > 0.5 ? 2 : out.get() > 0.01 ? 1 : 0))
  const shadeY = useTransform(slid.y, (by) => -by)
  // Held back while it stands a spine, lifted as it turns out: the spring may overshoot, the veil never goes past either end.
  const back = useTransform(out, (at) => 1 - Math.min(1, Math.max(0, at)))
  const veil = {
    spine: useTransform(back, (at) => HELD_BACK * at),
    cover: useTransform(back, (at) => (1 - (1 - HELD_BACK) * (1 - SLIVER_SHADE)) * at)
  }
  // Seen as tall as it is, whichever way it is turned: its nearest corner (where the spine meets the cover) stands
  // nearer the eye than the book's middle, by half its width and half its thickness as far as each is turned toward
  // you, so it is scaled back by just that, from the foot, and every book, spine or cover, stands on the ledge one
  // height, its foot on the ledge's line: turned out it is wider, never raised.
  const scale = useTransform(() => {
    const rad = (turn.get() * Math.PI) / 180
    const near = (SHELF_BOOK.thick / 2) * Math.abs(Math.cos(rad)) + (SHELF_BOOK.wide / 2) * Math.abs(Math.sin(rad))
    return (EYE - near) / EYE
  })
  // Reduce Motion or Motion off, or reached by the keys: there at once. Otherwise it swings round on the spring.
  // A passive effect, after the transforms above have listened again for this render: set in a layout effect, a book
  // reached by the keys changed while they were between listeners and stood still as a spine.
  // Whether the keys did it is read as the change is drawn, in the key's own update: read later, in the effect, a
  // pointer event the page sends as the books part under a pointer that has not moved could come first and make a
  // key's turn a slow swing.
  const byKeys = useRef(false)
  const was = useRef(up)
  if (was.current !== up) {
    was.current = up
    byKeys.current = keyed()
  }
  useEffect(() => {
    if (!(flat || byKeys.current)) {
      const swing = animate(out, up ? 1 : 0, { type: 'spring', ...PULL, restDelta: 0.001 })
      return () => swing.stop()
    }
    out.stop()
    out.set(up ? 1 : 0)
    return undefined
  }, [up]) // eslint-disable-line react-hooks/exhaustive-deps
  // Another book's reader card, read from its file (asked for every book as the shelf opens) and drawn as it comes:
  // the sliver of cover beside every spine shows the edge of its card, never a blank strip. Asked again as it is
  // pulled out, so a card changed since shows as it is now.
  const [card, setCard] = useState<BookCard | null | undefined>(() => (book.current ? undefined : bookCardNow(book.id)))
  useEffect(() => {
    if (book.current) return undefined
    let live = true
    void bookCardOf(book.id).then((one) => live && setCard(one))
    return () => void (live = false)
  }, [up]) // eslint-disable-line react-hooks/exhaustive-deps
  const pitch = useMotionValue(0)
  return (
    <DropdownMenuItem asChild data-book={book.id} data-shelf-book={book.id} data-carried={carried || undefined} aria-current={book.current || undefined} aria-label={`${book.name}, ${said.toLowerCase()}`}
      onContextMenu={onMenu} onSelect={onPick} onPointerLeave={onlyRealLeaves}
      onKeyDown={(event) => {
        if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
        event.preventDefault()
        event.stopPropagation()
        onShift(event.key === 'ArrowLeft' ? -1 : 1)
      }}>
      <motion.div ref={slid.ref} className="mf-spine" style={{ width, height: SHELF_BOOK.high, zIndex, x: slid.x, y: slid.y, rotate: slid.rotate, '--mf-spine-bg': spine } as React.ComponentProps<typeof motion.div>['style']}>
        {/* Its shadow on the ledge while it is lifted off it, staying on the ledge as the book rises. */}
        <motion.span aria-hidden className="mf-spine-lift" style={{ opacity: slid.shade, y: shadeY }} />
        {/* Every book wears its own reader card (reader-card.tsx), the one Settings shows, scaled: the open one read as
            Settings reads it, any other from its own file. */}
        <BookBox size={SHELF_BOOK} pitch={pitch} turn={turn} lit={lit} scale={scale} perspective={EYE} name={book.name} edges={false} shelf veil={veil}
          className="mf-book absolute bottom-0 left-1/2" style={{ marginLeft: -SHELF_BOOK.wide / 2, transformOrigin: '50% 100%' }}
          cover={{ className: 'mf-card-cover' }}>
          {book.current ? <ShelfCover name={book.name} size={SHELF_BOOK} /> : card !== undefined && <OtherCover name={book.name} size={SHELF_BOOK} card={card} />}
        </BookBox>
        {book.current && <span data-book-open className="sr-only">Open now</span>}
      </motion.div>
    </DropdownMenuItem>
  )
}

export function BookShelf({ books, menuFor = null, onPick, onMenu }: { books: Book[]; /** The book whose own menu is up: it stands pulled out until that menu shuts. */ menuFor?: string | null; onPick: (book: Book) => void; onMenu: (event: React.MouseEvent, book: Book) => void }): React.JSX.Element {
  // More books than the menu is wide (30, say): the shelf scrolls sideways under the wheel or the trackpad, the side
  // with more fading out, opened on the open book; the keys bring the book they reach into view, as focus does.
  const row = useRef<HTMLDivElement>(null)
  const { style } = useSideEnds(row)
  // A body in braces: this Chromium's scrollIntoView answers with a promise, and an effect that returns one stops the page.
  useLayoutEffect(() => {
    row.current?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [])
  // The book the pointer or the keys are on (the menu lights a row by focusing it), else none and the open one stands turned.
  const [pointed, setPointed] = useState<string | null>(null)
  const keyed = useRef(false)
  const lit = useMotionValue(1)
  // Each opening asks every other book's reader card afresh, so each is there before the book is pulled out.
  useState(() => askCards(books.filter((one) => !one.current).map((one) => one.id)))
  // The one you were in last, wherever it stands on the shelf (its order may be yours).
  const last = books.filter((one) => !one.current && one.openedAt).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))[0]?.id
  const saidOf = (book: Book): string => (book.current ? 'Open now' : book.id === last ? 'In it last' : book.openedAt ? `Opened ${ago(book.openedAt)}` : 'Not opened yet')
  const lead = menuFor ?? pointed
  const shown = Math.max(0, books.findIndex((one) => (lead ? one.id === lead : one.current)))
  return (
    <>
      <div ref={row} role="group" aria-label="Your books" data-book-shelf data-unlit className="mf-shelf" style={style}
        onWheel={(event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY }}
        onKeyDownCapture={() => void (keyed.current = true)}
        // Only a pointer that really moved takes over from the keys: the page also sends one, unmoved, as the books part under it.
        onPointerMove={(event) => void (realMove(event) && (keyed.current = false))}
        // While a book is carried, the one turned out stays as it was: the shelf never reshapes under the hand.
        onFocus={(event) => document.documentElement.dataset.dragging === undefined && setPointed(event.target.closest('[data-book]')?.getAttribute('data-book') ?? null)}
        onBlur={(event) => document.documentElement.dataset.dragging === undefined && !(event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-book-shelf] [data-book]')) && setPointed(null)}
        // A book carried and let go opens nothing: the shared drag swallows the click that ends a carry (dnd-kit).
        >
        {/* Your books in your own order: a book pressed and carried along the shelf goes where it is let go (the shared
            drag, sortable.tsx), saved on the shelf for every list of them (Settings › Books too). */}
        <SortableList axis="x" self items={books} keyOf={(book) => book.id} onMove={SANDBOX ? undefined : (id, target) => moveBook(books.map((one) => one.id), id, target)}>
          {(order) => {
            const spines = spinesOf(order)
            const ids = order.map((one) => one.id)
            // ⌥← and ⌥→ on a book: one place along, gliding there (SortableRow's glide), the focus still on it.
            const shift = (id: string, by: -1 | 1): void => {
              const target = ids[ids.indexOf(id) + by]
              if (SANDBOX || !target) return chime('nope')
              chime('tap')
              moveBook(ids, id, target)
            }
            return order.map((book, at) => (
              <SortableRow key={book.id} id={book.id} glide={`shelf-book-${book.id}`} className="flex-none">
                <ShelfBook book={book} said={saidOf(book)} up={book.id === books[shown]?.id} spine={spines[at]} at={at} keyed={() => keyed.current} lit={lit}
                  onPick={() => onPick(book)} onMenu={(event) => onMenu(event, book)} onShift={(by) => shift(book.id, by)} />
              </SortableRow>
            ))
          }}
        </SortableList>
      </div>
      {/* The turned book named under the shelf, as a video shelf names the tape it has out. */}
      {books[shown] && (
        <div aria-hidden data-book-caption className="mf-shelf-caption">
          <span className="mf-spine-said-name">{books[shown].name}</span>
          <span className="mf-spine-said">{saidOf(books[shown])}</span>
        </div>
      )}
    </>
  )
}
