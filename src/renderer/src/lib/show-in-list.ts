import { createContext, useContext, useEffect, useRef } from 'react'
import { still } from './motion'
import { useHere } from './split'
import { refuse } from '@/components/haligtree/ui'

export type ShowLine = { label: string; keys?: string; run: () => void }
/** The open note's “Show in list”, from the page whose list holds it: its header's ⋯ menu and its right-click menu read it. */
export const ShowInListContext = createContext<ShowLine | null>(null)
export const useShowLine = (): ShowLine | null => useContext(ShowInListContext)

/** The key for “Show in list”: free everywhere in the app. */
export const SHOW_KEY = '⌥⌘L'
const isShowKey = (event: KeyboardEvent): boolean => event.metaKey && event.altKey && !event.shiftKey && event.code === 'KeyL'

/**
 * The open one's row in the list beside it, as Finder's “Show in Enclosing
 * Folder” does: a long list scrolls to its place first (VirtualList hears
 * `haligtree:show-row`, so a row not drawn yet is drawn), then it is centred
 * and lit once with the arrival flash. Said plainly when it is not there.
 */
export function showInList(id: string, tries = 6): void {
  window.dispatchEvent(new CustomEvent('haligtree:show-row', { detail: id }))
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const page = document.activeElement?.closest('[data-page]') ?? document.querySelector('[data-page]')
    const row = page?.querySelector<HTMLElement>(`[data-row][data-id="${CSS.escape(id)}"], [data-task-row][data-id="${CSS.escape(id)}"]`)
    if (!row) return void (tries > 0 ? setTimeout(() => showInList(id, tries - 1), 80) : refuse('It is not in this list'))
    row.scrollIntoView({ block: 'center', behavior: still() ? 'auto' : 'smooth' })
    row.classList.remove('mf-arrive')
    void row.offsetWidth
    row.classList.add('mf-arrive')
    setTimeout(() => row.classList.remove('mf-arrive'), 1200)
  }))
}

/**
 * “Show in list” for a page with one open beside its list: `bringOut` shows
 * whatever hides the row (the list folded away, a filter, a search, a folded
 * group), then its row is shown. ⌥⌘L does it from the page in front. Gives
 * back the line for the open one's menus.
 */
export function useShowInList(id: string | undefined, bringOut: () => void): ShowLine {
  const here = useHere()
  const now = useRef({ id, bringOut })
  now.current = { id, bringOut }
  const run = (): void => {
    const { id, bringOut } = now.current
    if (!id) return
    bringOut()
    // A frame for what was brought out to be drawn.
    requestAnimationFrame(() => showInList(id))
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => void (isShowKey(event) && now.current.id && here() && (event.preventDefault(), run()))
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return { label: 'Show in list', keys: SHOW_KEY, run }
}
