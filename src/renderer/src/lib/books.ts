import { createElement, useEffect, useState } from 'react'
import { Book as BookIcon } from 'lucide-react'

import { SANDBOX, barsOf, enterSandbox, gatherCarry, leaveSandbox, momentOn } from './sandbox'
import { haligtree } from './haligtree'
import { refuse } from '@/components/haligtree/ui'
import { moveToBin } from './to-bin'
import { EASING, byKeys, still } from '@/lib/motion'
import { num } from '../../../main/dates'

/**
 * Books, as a window sees them: more than one Haligtree of your own, each its own
 * folder (see src/main/books.ts). Switching is the sandbox's restart, so it
 * looks and sounds the same.
 */
/** `openedAt`: when it was last opened, which sets the order main lists them in (the open one, then the one you were just in); null for one not opened since that was kept. */
export type Book = { id: string; name: string; createdAt: string | null; current: boolean; color: Hue | null; openedAt?: number | null }
export type Shelf = { current: string; name: string; books: Book[]; color: Hue | null }
/** A capture or a note (captures), or an idea, article, question or goal (nuggets). */
export type BookRef = { table: 'captures' | 'nuggets'; id: string }

export const shelf = (): Promise<Shelf> => window.api.haligtree<Shelf>('books:list')

/** Another book's reader card on the shelf (main/books.ts cardOf): the seed kept in its settings and the facts behind its stamps. */
export type BookCard = { seed: number | null; facts: { notes: number; since: string | null; linked: boolean; journal: number; reviewed: boolean } }
const cards = new Map<string, Promise<BookCard | null>>()
/** Each card once it has come: a book pulled out after it came wears it in its first frame, never a blank cover first. */
const cardsCome = new Map<string, BookCard | null>()
/** Asked once per book while the shelf is up (main keeps each until its file changes). */
export const bookCardOf = (id: string): Promise<BookCard | null> => {
  let one = cards.get(id)
  if (!one) cards.set(id, (one = window.api.haligtree<BookCard | null>('books:card', id).catch(() => null).then((card) => (cardsCome.set(id, card), card))))
  return one
}
/** The card already come, or undefined while it is on its way. */
export const bookCardNow = (id: string): BookCard | null | undefined => cardsCome.get(id)
/** As the shelf opens: every other book's card asked afresh (main answers at once for a book unchanged since). */
export const askCards = (ids: string[]): void => {
  cards.clear()
  for (const id of ids) void bookCardOf(id)
}

// --- a book's colour: Arc's spaces, each with its own ------------------------------------

/** The hues a book can wear, the theme's own so each suits every theme; null is the theme's accent. */
export const HUES = ['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'gray'] as const
export type Hue = (typeof HUES)[number]
export const hueName = (hue: Hue | null): string => (hue ? hue[0].toUpperCase() + hue.slice(1) : 'No colour')
/** A hue as a colour the page can paint with. */
export const hueVar = (hue: Hue | null): string => (hue ? `var(--tt-color-text-${hue})` : 'var(--muted-foreground)')
/** What a book's mark is drawn in: its hue, or the theme's own accent when it has none (the theme's, not the one this window wears for the open book). */
export const markInk = (hue: Hue | null): string => (hue ? `var(--tt-color-text-${hue})` : 'var(--mf-theme-accent, var(--primary))')

const HUE_KEY = 'book-hue'
const worn = (): Hue | null => (document.documentElement.dataset.bookHue as Hue | undefined) ?? null
/**
 * The colour this window is on its way to (a turn or a wash still under way): as good as worn to anything that
 * asks. Word of the same change coming back from the shelf a moment after a pick then starts nothing a second time.
 */
let turning: { hue: Hue | null } | null = null
const wearing = (): Hue | null => (turning ? turning.hue : worn())
/** Worn now. Anything still on its way to another colour gives way: the last word wins, never the slower one. */
const wear = (hue: Hue | null): void => {
  turning = null
  if (hue) document.documentElement.dataset.bookHue = hue
  else delete document.documentElement.dataset.bookHue
  try {
    if (hue) localStorage.setItem(HUE_KEY, hue)
    else localStorage.removeItem(HUE_KEY)
  } catch {
    // Worn for now; the next start finds it from the shelf.
  }
}

let turns = 0
/**
 * A book's colour changed where you are, picked here or in another window: what wears it (the sidebar's tint,
 * and the accent wherever it shows: links, the caret, what is selected, ticks and marks) glides from the old colour
 * to the new in 300ms, through the colours between (main.css, data-book-glide), the menu it was picked in still open
 * and live. A wash across the whole window for a tint on the sidebar read as a flash, so it is kept for arriving in
 * another book. Reached by a key, with Motion off or Reduce motion, or in a window out of sight, the colour is simply there.
 */
export function turnTo(hue: Hue | null): void {
  if (hue === wearing()) return
  const root = document.documentElement
  const eased = !still() && !byKeys() && !document.hidden
  // For a probe: each turn, and whether it eased.
  ;((window as unknown as { haligtreeTurns?: string[] }).haligtreeTurns ??= []).push(`${hue ?? 'none'}:${eased ? 'eased' : 'at once'}`)
  if (!eased) return wear(hue)
  const mine = (turning = { hue })
  const turn = ++turns
  // From no colour, from the theme's own accent; the colour it starts from read once, so the glide starts there.
  if (!root.dataset.bookHue) root.dataset.bookHue = 'none'
  root.setAttribute('data-book-glide', '')
  getComputedStyle(root).getPropertyValue('--book-hue')
  root.dataset.bookHue = hue ?? 'none'
  setTimeout(() => {
    if (turn !== turns) return
    root.removeAttribute('data-book-glide')
    if (turning === mine) wear(hue)
  }, 320)
}

/**
 * Arriving in another book after a switch, where the whole page changes: its colour washed across the window
 * from the left, as Arc does when you move to another space. A soft band of it sweeps over in 300ms, the accent
 * and the sidebar turn as it passes the middle, and the band fades. Only then: a colour picked or changed in
 * place eases in where it is worn (turnTo). With Motion off, the colour is simply there.
 */
function washIn(hue: Hue | null): void {
  if (still() || document.hidden) return wear(hue)
  ;((window as unknown as { haligtreeWashes?: string[] }).haligtreeWashes ??= []).push(hue ?? 'none')
  const band = document.createElement('div')
  band.dataset.bookWash = hue ?? 'none'
  band.setAttribute('aria-hidden', 'true')
  band.style.setProperty('--wash', hueVar(hue))
  document.body.appendChild(band)
  const sweep = band.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }], { duration: 300, easing: EASING, fill: 'forwards' })
  // The turn itself, as the band passes the middle: part of the wash's own timing, not a wait for anything.
  // Only if this wash is still the last word (a colour changed since has taken its place otherwise).
  const mine = (turning = { hue })
  setTimeout(() => turning === mine && wear(hue), 150)
  void sweep.finished.then(() => band.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' }).finished).catch(() => undefined).finally(() => band.remove())
}

/**
 * A book carried to another's place (the shelf, Settings › Books): your books in that order from now on, kept on the
 * shelf so every list of them, in every window, keeps it. `ids` the order as it is drawn now.
 */
export function moveBook(ids: string[], id: string, target: string): void {
  const from = ids.indexOf(id)
  const to = ids.indexOf(target)
  if (from < 0 || to < 0 || from === to) return
  const next = ids.filter((one) => one !== id)
  next.splice(to, 0, id)
  void window.api.haligtree<boolean>('books:order', next)
}

/** A book's colour, kept on the shelf: every window hears of it. */
export const setBookColor = (id: string, hue: Hue | null): Promise<boolean> => window.api.haligtree<boolean>('books:color', id, hue)
/**
 * A book's colour picked, wherever it is picked (Settings, ⌘K, its right-click): what wears the open book's
 * colour in this window eases into it at once, and the shelf keeps it for every other window and list.
 */
export function pickBookColor(book: Pick<Book, 'id' | 'current'>, hue: Hue | null): void {
  if (!SANDBOX && book.current) turnTo(hue)
  void setBookColor(book.id, hue)
}

// Before the first paint: the colour this book wore last time, so the window never flashes the theme's.
if (!SANDBOX) {
  try {
    const kept = localStorage.getItem(HUE_KEY) as Hue | null
    if (kept && (HUES as readonly string[]).includes(kept)) document.documentElement.dataset.bookHue = kept
  } catch {
    // Read from the shelf in a moment instead.
  }
}
let followed = false
/**
 * The open book's colour, kept worn in this window: from the shelf as the
 * window opens, washed in once after a switch into this book, and eased into
 * in place when it is changed here or anywhere else.
 */
export function followBookHue(): void {
  if (followed || SANDBOX) return
  followed = true
  const look = (arriving: boolean): void => void shelf().then((now) => {
    if (!arriving || now.color === null) return now.color === wearing() ? undefined : document.hasFocus() ? turnTo(now.color) : wear(now.color)
    // Arrived by a switch: once the window is on screen, its colour washes across it.
    const go = (): void => void setTimeout(() => washIn(now.color), 180)
    if (!document.hidden) go()
    else document.addEventListener('visibilitychange', go, { once: true })
  })
  void window.api.haligtree<boolean>('books:arrived').then(look, () => look(false))
  window.addEventListener('haligtree:books-changed', () => look(false))
  window.addEventListener('storage', (event) => event.key === HUE_KEY && !document.hasFocus() && wear((event.newValue as Hue | null) ?? null))
}

/** The shelf as this window last read it: a list of books drawn later (Settings, the box) is whole in its first frame, never dropped in a moment after. */
let lastShelf: Shelf | null = null
/** The books, kept current as one is made, renamed, coloured or deleted, in any window. */
export function useShelf(): Shelf | null {
  const [now, setNow] = useState<Shelf | null>(lastShelf)
  useEffect(() => {
    const load = (): void => void shelf().then((read) => setNow((lastShelf = read)))
    load()
    window.addEventListener('haligtree:books-changed', load)
    return () => window.removeEventListener('haligtree:books-changed', load)
  }, [])
  return now
}

/** Scenery comes along too: your look feels the same in every book. */
const CARRY_MORE = ['scenery', 'sceneryFolders', 'coversFolder'] as const

/**
 * To another book, or the sandbox. Your look comes along; anything being
 * typed is written down first, where it was. `then` is an import to run there.
 */
export async function switchBook(id: string, then?: 'vault' | 'files' | { root: string }): Promise<void> {
  if (!(await leaveSession(id))) return
  if (id === 'sandbox') return enterSandbox()
  if (SANDBOX) {
    // The sandbox's own way out, to the book asked for.
    await window.api.haligtree('books:last', id)
    return leaveSandbox()
  }
  const now = await shelf()
  // Already here: nothing to restart.
  if (now.current === id) return
  const name = now.books.find((one) => one.id === id)?.name ?? 'the book'
  const bars = barsOf(id)
  const said = momentOn(`Opening ${name}`, bars)
  const carry = await gatherCarry(CARRY_MORE)
  // A book that has its own bars keeps them; only a new one wears yours.
  if (await bars) delete carry.settings.progressBars
  await said
  // The window restarts into the book from here. Refused (its folder not found), or the ask failed, nothing restarts:
  // the screen goes and says why, never left over the app.
  const went = await window.api.haligtree<boolean>('books:switch', id, carry, then).then((ok) => (ok ? null : 'its folder could not be found'), (error: unknown) => String((error as Error)?.message ?? error))
  if (went === null) return
  window.dispatchEvent(new CustomEvent('haligtree:going', { detail: null }))
  refuse(`Could not open ${name}: ${went}`, 'error')
}

/** What the main window's book asker is told when a session is running as you switch: answered with the choice, or null to stay. */
export type RunningAsk = { book: string; goal: string; answer: (choice: 'end' | 'keep' | null) => void; heard?: boolean }

/**
 * A focus session running as you switch: asked “End it” or “Keep it
 * running”. Ended, it is saved here first, as the pill's Stop saves it (a
 * plain timer simply goes). Kept, it runs on in this book's own database, and
 * the next book's pill names it. False: stay here.
 */
async function leaveSession(to: string): Promise<boolean> {
  const running = await haligtree.focusNow().catch(() => null)
  const now = await shelf()
  // Already in that book: nothing to leave.
  if (!running || now.current === to) return true
  const here = now.name
  const ask: Partial<RunningAsk> = { book: here, goal: running.goal }
  const choice = await new Promise<'end' | 'keep' | null>((answer) => {
    ask.answer = answer
    window.dispatchEvent(new CustomEvent('haligtree:book-running', { detail: ask }))
    // Asked from a window without the book asker (the box): the main window asks instead.
    if (!ask.heard) (answer(null), void window.api.haligtree('books:go', to))
  })
  if (choice === 'keep') await window.api.haligtree('books:keep')
  if (choice === 'end')
    for (let i = 0; i < 3; i++) {
      const now = await haligtree.focusNow().catch(() => null)
      if (!now) break
      await (now.taskId === '' && now.kind !== 'focus' ? window.api.haligtree('session:cancel', now.id) : window.api.haligtree('session:end', now.id, '', false))
    }
  return choice !== null
}

/** A new, empty book by this name, and straight into it. */
export async function newBook(name: string): Promise<void> {
  const id = await window.api.haligtree<string | null>('books:create', name)
  if (id) await switchBook(id)
}

export const renameBook = (id: string, name: string): Promise<boolean> => window.api.haligtree<boolean>('books:rename', id, name)
/** Where its full copy was kept, or null when it was not deleted. */
/** The copy's folder once deleted; 'leaving' for the open book, which another book's run deletes once this one has left it. */
export const deleteBook = (id: string): Promise<string | 'leaving' | null> => window.api.haligtree<string | 'leaving' | null>('books:delete', id)
/** "… is deleted", once, in the run that deleted a book it had just left. */
export const deletedNote = (): Promise<string | null> => window.api.haligtree<string | null>('books:deleted-note')
/** How many were copied into that book. */
export const copyToBook = (refs: BookRef[], id: string): Promise<number> => window.api.haligtree<number>('books:copy', refs, id)

/**
 * The box over the page, for the two asks where a new book's name can be typed: which book to copy into, or to
 * import into. Going to a book needs no box: the sidebar's menu and ⌘K list them.
 */
export const askBook = (mode: 'copy' | 'import', detail: { refs?: BookRef[]; what?: 'vault' | 'files' } = {}): void =>
  void window.dispatchEvent(new CustomEvent('haligtree:book-ask', { detail: { mode, ...detail } }))

/**
 * Move to book ▸, as Arc's "Move Tabs to Profile" (the user, 22 Nov): every book in the submenu, the open one ticked, a
 * choice taking these there at once, no box to type in. A copy is written for that book (it takes it in when it next
 * opens) and these go to this book's Bin, with one notice saying where they went; Undo brings them back here and takes
 * the copy back while that book has not opened. With one book, no line.
 */
export const moveToBookItem = (refs: BookRef[], kinds: { type: string; id: string; status?: string }[]): { label: string; run: () => void } | { label: string; items: { label: string; icon: ReturnType<typeof createElement>; run: () => void }[] } | false => {
  const others = (lastShelf?.books ?? []).filter((book) => !book.current)
  if (!refs.length || !others.length) return false
  const n = refs.length > 1 ? `${num(refs.length)} ` : ''
  const to = (book: Book) => (): void => void window.api.haligtree<string | null>('books:move', refs, book.id).then((parcel) => {
    if (!parcel) return refuse(`Not moved to ${book.name}: its copy could not be written`)
    void moveToBin(kinds, () => void window.api.haligtree('books:unmove', book.id, parcel), `Moved ${n}to ${book.name}. It is there when you open it`)
  })
  // One other book: its own line, never a submenu of one row.
  if (others.length === 1) return { label: `Move ${n}to ${others[0].name}`, run: to(others[0]) }
  // Each book with its own mark in its own colour, as the shelf and Settings show it (books.tsx BookMark).
  const mark = (book: Book): ReturnType<typeof createElement> => createElement(BookIcon, { 'aria-hidden': true, className: 'size-4 shrink-0', style: { color: markInk(book.color), stroke: markInk(book.color) } })
  return { label: `Move ${n}to book`, items: others.map((book) => ({ label: book.name, icon: mark(book), run: to(book) })) }
}
// Read once as the window opens and on every change, so a menu built in a moment knows the books.
if (typeof window !== 'undefined' && window.api) {
  const read = (): void => void shelf().then((one) => (lastShelf = one)).catch(() => undefined)
  read()
  window.addEventListener('haligtree:books-changed', read)
}

