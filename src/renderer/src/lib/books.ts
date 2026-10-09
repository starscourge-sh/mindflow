import { useEffect, useState } from 'react'

import { hum } from './sound'
import { SANDBOX, enterSandbox, gatherCarry, going, leaveSandbox } from './sandbox'

/**
 * Books, as a window sees them: more than one Vigil of your own, each its own
 * folder (see src/main/books.ts). Switching is the sandbox's restart, so it
 * looks and sounds the same.
 */
export type Book = { id: string; name: string; createdAt: string | null; current: boolean }
export type Shelf = { current: string; name: string; books: Book[] }
/** A capture or a note (captures), or an idea, article, question or goal (nuggets). */
export type BookRef = { table: 'captures' | 'nuggets'; id: string }

const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(`books:${channel}`, ...args) as Promise<T>
export const shelf = (): Promise<Shelf> => call<Shelf>('list')

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
  if (id === 'sandbox') return enterSandbox()
  if (SANDBOX) {
    // The sandbox's own way out, to the book asked for.
    await call('last', id)
    return leaveSandbox()
  }
  const now = await shelf()
  // Already here: nothing to restart.
  if (now.current === id) return
  const name = now.books.find((one) => one.id === id)?.name ?? 'the book'
  const said = going(`Opening ${name}`, () => hum(true))
  const carry = await gatherCarry(CARRY_MORE)
  await said
  await call('switch', id, carry, then)
}

/** A new, empty book by this name, and straight into it. */
export async function newBook(name: string): Promise<void> {
  const id = await call<string | null>('create', name)
  if (id) await switchBook(id)
}

export const renameBook = (id: string, name: string): Promise<boolean> => call<boolean>('rename', id, name)
export const revealBook = (id: string): Promise<boolean> => call<boolean>('reveal', id)
/** Where its full copy was kept, or null when it was not deleted. */
export const deleteBook = (id: string): Promise<string | null> => call<string | null>('delete', id)
/** How many were copied into that book. */
export const copyToBook = (refs: BookRef[], id: string): Promise<number> => call<number>('copy', refs, id)

/** The pickers, over the page: which book to go to, copy into, or import into. */
export const askBook = (mode: 'switch' | 'copy' | 'import', detail: { refs?: BookRef[]; what?: 'vault' | 'files' } = {}): void =>
  void window.dispatchEvent(new CustomEvent('vigil:book-ask', { detail: { mode, ...detail } }))

/** The row menus' line: copies of these, with their pictures and files, into another book. */
export const copyToBookItem = (refs: BookRef[]): { label: string; run: () => void } | false =>
  refs.length > 0 && { label: refs.length > 1 ? `Copy ${refs.length} to book…` : 'Copy to book…', run: () => askBook('copy', { refs }) }
