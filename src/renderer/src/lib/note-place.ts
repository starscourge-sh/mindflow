import { useEffect } from 'react'
import type { Editor } from '@tiptap/core'

/**
 * Where you were in each note: how far down it was scrolled and where the
 * caret sat, kept as you leave it and put back when it opens again (later
 * the same day, or after a restart), so a long note reopens where you were
 * reading or writing instead of at the top. The last 300 notes are kept.
 */
type Place = { top: number; from: number; at: number }
const KEY = 'note-places'
const KEEP = 300

const read = (): Record<string, Place> => {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Place>
    return kept && typeof kept === 'object' ? kept : {}
  } catch {
    return {}
  }
}

/** The place kept for a note, if any. */
export const placeOf = (id: string): Place | null => read()[id] ?? null

function keep(id: string, place: Place): void {
  try {
    const all = read()
    all[id] = place
    const ids = Object.keys(all)
    if (ids.length > KEEP) for (const old of ids.sort((a, b) => all[a].at - all[b].at).slice(0, ids.length - KEEP)) delete all[old]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Kept for this run only.
  }
}

/** The element the note scrolls in: the nearest one above it that scrolls. */
function scrollerOf(element: Element): HTMLElement | null {
  for (let at = element.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at)
    if (/(auto|scroll)/.test(overflowY)) return at
  }
  return null
}

/**
 * Keep and restore one note's place. The scroll is put back once the note is
 * tall enough to hold it (pictures load late): any scroll, key or click of
 * yours first stops it trying, so it never pulls the page from under you.
 * A link to a heading in the note lands there instead (it scrolls after).
 */
export function useNotePlace(editor: Editor | null, id: string | null, on: boolean): void {
  useEffect(() => {
    if (!on || !editor || !id) return
    const dom = editor.view.dom
    const scroller = scrollerOf(dom)
    const kept = placeOf(id)
    let top = scroller?.scrollTop ?? 0
    let from = editor.state.selection.from
    let settled = !kept || !scroller
    const stop = (): void => void (settled = true)
    const put = (): void => {
      if (settled || !kept || !scroller) return
      if (scroller.scrollHeight - scroller.clientHeight >= kept.top - 1) {
        scroller.scrollTop = kept.top
        settled = true
      }
    }
    if (kept) {
      const size = editor.state.doc.content.size
      // The caret where it was, without taking the keys: the next click or key in the note starts there.
      if (kept.from > 0 && kept.from < size) editor.commands.setTextSelection(kept.from)
      put()
    }
    const grows = new ResizeObserver(put)
    grows.observe(dom)
    const onScroll = (): void => void (scroller && (top = scroller.scrollTop))
    const onSelect = (): void => void (from = editor.state.selection.from)
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    scroller?.addEventListener('wheel', stop, { passive: true })
    scroller?.addEventListener('pointerdown', stop)
    window.addEventListener('keydown', stop, true)
    editor.on('selectionUpdate', onSelect)
    const save = (): void => {
      // Only a place worth coming back to: the top with the caret at the start is where it opens anyway.
      if (top > 0 || from > 1) keep(id, { top, from, at: Date.now() })
    }
    window.addEventListener('pagehide', save)
    return () => {
      save()
      grows.disconnect()
      scroller?.removeEventListener('scroll', onScroll)
      scroller?.removeEventListener('wheel', stop)
      scroller?.removeEventListener('pointerdown', stop)
      window.removeEventListener('keydown', stop, true)
      window.removeEventListener('pagehide', save)
      editor.off('selectionUpdate', onSelect)
    }
  }, [editor, id, on])
}

/**
 * Where you were in each web article: how far down (and the share of it
 * read), with its title and when, so it reopens there and joins Home's
 * "Continue reading" beside the books. The last 100 are kept.
 */
export type WebPlace = { top: number; share: number; at: number; title: string; /** Its lead picture, for its card in Continue reading. */ picture?: string | null }
const WEB = 'web-places'

export const webPlaces = (): Record<string, WebPlace> => {
  try {
    const kept = JSON.parse(localStorage.getItem(WEB) ?? '{}') as Record<string, WebPlace>
    return kept && typeof kept === 'object' ? kept : {}
  } catch {
    return {}
  }
}

export function keepWebPlace(href: string, place: WebPlace): void {
  try {
    const all = webPlaces()
    all[href] = place
    const hrefs = Object.keys(all)
    if (hrefs.length > 100) for (const old of hrefs.sort((a, b) => all[a].at - all[b].at).slice(0, hrefs.length - 100)) delete all[old]
    localStorage.setItem(WEB, JSON.stringify(all))
  } catch {
    // Kept for this run only.
  }
}

/** An article put down part way through (past the first screen, short of the end), newest first. */
export const articlesOnTheGo = (): (WebPlace & { href: string })[] =>
  Object.entries(webPlaces()).map(([href, one]) => ({ ...one, href })).filter((one) => one.share > 0.03 && one.share < 0.95).sort((a, b) => b.at - a.at)
