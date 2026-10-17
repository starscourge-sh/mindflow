import { useEffect, useState } from 'react'

import { SANDBOX, enterSandbox, gatherCarry, leaveSandbox, saberOn } from './sandbox'
import { vigil } from './vigil'
import { still } from '@/lib/motion'

/**
 * Books, as a window sees them: more than one Vigil of your own, each its own
 * folder (see src/main/books.ts). Switching is the sandbox's restart, so it
 * looks and sounds the same.
 */
export type Book = { id: string; name: string; createdAt: string | null; current: boolean; color: Hue | null }
export type Shelf = { current: string; name: string; books: Book[]; color: Hue | null }
/** A capture or a note (captures), or an idea, article, question or goal (nuggets). */
export type BookRef = { table: 'captures' | 'nuggets'; id: string }

export const shelf = (): Promise<Shelf> => window.api.vigil<Shelf>('books:list')

// --- a book's colour: Arc's spaces, each with its own ------------------------------------

/** The hues a book can wear, the theme's own so each suits every theme; null is the theme's accent. */
export const HUES = ['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'gray'] as const
export type Hue = (typeof HUES)[number]
export const hueName = (hue: Hue | null): string => (hue ? hue[0].toUpperCase() + hue.slice(1) : 'No colour')
/** A hue as a colour the page can paint with. */
export const hueVar = (hue: Hue | null): string => (hue ? `var(--tt-color-text-${hue})` : 'var(--muted-foreground)')

const HUE_KEY = 'book-hue'
const worn = (): Hue | null => (document.documentElement.dataset.bookHue as Hue | undefined) ?? null
const wear = (hue: Hue | null): void => {
  if (hue) document.documentElement.dataset.bookHue = hue
  else delete document.documentElement.dataset.bookHue
  try {
    if (hue) localStorage.setItem(HUE_KEY, hue)
    else localStorage.removeItem(HUE_KEY)
  } catch {
    // Worn for now; the next start finds it from the shelf.
  }
}

/**
 * The new colour washed across the window from the left, as Arc does when
 * you move to another space: a soft band of it sweeps over in 300ms, the
 * accent and the sidebar turn as it passes the middle, and the band fades.
 * With Motion off, the colour is simply there.
 */
export function washTo(hue: Hue | null, always = false): void {
  if (hue === worn() && !always) return
  if (still() || document.hidden) return wear(hue)
  ;((window as unknown as { vigilWashes?: string[] }).vigilWashes ??= []).push(hue ?? 'none')
  const band = document.createElement('div')
  band.dataset.bookWash = hue ?? 'none'
  band.setAttribute('aria-hidden', 'true')
  band.style.setProperty('--wash', hueVar(hue))
  document.body.appendChild(band)
  const sweep = band.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }], { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' })
  setTimeout(() => wear(hue), 150)
  void sweep.finished.then(() => band.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' }).finished).catch(() => undefined).finally(() => band.remove())
}

/** A book's colour, chosen in the switcher or in Settings. The open book washes into it. */
export const setBookColor = (id: string, hue: Hue | null): Promise<boolean> => window.api.vigil<boolean>('books:color', id, hue)

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
 * window opens, washed in after a switch into this book, and washed again
 * when it is changed here or anywhere else.
 */
export function followBookHue(): void {
  if (followed || SANDBOX) return
  followed = true
  const look = (arriving: boolean): void => void shelf().then((now) => {
    if (!arriving || now.color === null) return now.color === worn() ? undefined : document.hasFocus() ? washTo(now.color) : wear(now.color)
    // Arrived by a switch: once the window is on screen, its colour washes across it.
    const go = (): void => void setTimeout(() => washTo(now.color, true), 180)
    if (!document.hidden) go()
    else document.addEventListener('visibilitychange', go, { once: true })
  })
  void window.api.vigil<boolean>('books:arrived').then(look, () => look(false))
  window.addEventListener('vigil:books-changed', () => look(false))
  window.addEventListener('storage', (event) => event.key === HUE_KEY && !document.hasFocus() && wear((event.newValue as Hue | null) ?? null))
}

/** The books, kept current as one is made, renamed or deleted. */
export function useShelf(): Shelf | null {
  const [now, setNow] = useState<Shelf | null>(null)
  useEffect(() => {
    const load = (): void => void shelf().then(setNow)
    load()
    window.addEventListener('vigil:books-changed', load)
    return () => window.removeEventListener('vigil:books-changed', load)
  }, [])
  return now
}

/** Scenery comes along too: your look feels the same in every book. */
const CARRY_MORE = ['scenery', 'sceneryFolders', 'coversFolder'] as const

/**
 * To another book, or the sandbox. Your look comes along; anything being
 * typed is written down first, where it was. `then` is an import to run there.
 */
export async function switchBook(id: string, then?: 'vault' | 'files'): Promise<void> {
  if (!(await leaveSession(id))) return
  if (id === 'sandbox') return enterSandbox()
  if (SANDBOX) {
    // The sandbox's own way out, to the book asked for.
    await window.api.vigil('books:last', id)
    return leaveSandbox()
  }
  const now = await shelf()
  // Already here: nothing to restart.
  if (now.current === id) return
  const name = now.books.find((one) => one.id === id)?.name ?? 'the book'
  const said = saberOn(`Opening ${name}`)
  const carry = await gatherCarry(CARRY_MORE)
  await said
  await window.api.vigil('books:switch', id, carry, then)
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
  const running = await vigil.focusNow().catch(() => null)
  const now = await shelf()
  // Already in that book: nothing to leave.
  if (!running || now.current === to) return true
  const here = now.name
  const ask: Partial<RunningAsk> = { book: here, goal: running.goal }
  const choice = await new Promise<'end' | 'keep' | null>((answer) => {
    ask.answer = answer
    window.dispatchEvent(new CustomEvent('vigil:book-running', { detail: ask }))
    // Asked from a window without the book asker (the box): the main window asks instead.
    if (!ask.heard) (answer(null), void window.api.vigil('books:go', to))
  })
  if (choice === 'keep') await window.api.vigil('books:keep')
  if (choice === 'end')
    for (let i = 0; i < 3; i++) {
      const now = await vigil.focusNow().catch(() => null)
      if (!now) break
      await (now.taskId === '' ? window.api.vigil('session:cancel', now.id) : window.api.vigil('session:end', now.id, '', false))
    }
  return choice !== null
}

/** A new, empty book by this name, and straight into it. */
export async function newBook(name: string): Promise<void> {
  const id = await window.api.vigil<string | null>('books:create', name)
  if (id) await switchBook(id)
}

export const renameBook = (id: string, name: string): Promise<boolean> => window.api.vigil<boolean>('books:rename', id, name)
export const revealBook = (id: string): Promise<boolean> => window.api.vigil<boolean>('books:reveal', id)
/** Where its full copy was kept, or null when it was not deleted. */
export const deleteBook = (id: string): Promise<string | null> => window.api.vigil<string | null>('books:delete', id)
/** How many were copied into that book. */
export const copyToBook = (refs: BookRef[], id: string): Promise<number> => window.api.vigil<number>('books:copy', refs, id)

/** The pickers, over the page: which book to go to, copy into, or import into. */
export const askBook = (mode: 'switch' | 'copy' | 'import', detail: { refs?: BookRef[]; what?: 'vault' | 'files' } = {}): void =>
  void window.dispatchEvent(new CustomEvent('vigil:book-ask', { detail: { mode, ...detail } }))

/** The row menus' line: copies of these, with their pictures and files, into another book. */
export const copyToBookItem = (refs: BookRef[]): { label: string; run: () => void } | false =>
  refs.length > 0 && { label: refs.length > 1 ? `Copy ${refs.length} to book…` : 'Copy to book…', run: () => askBook('copy', { refs }) }
