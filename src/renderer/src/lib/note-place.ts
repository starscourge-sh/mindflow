import { afterLayout } from './after-layout'
import { useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'

import { screenBlocks, showBlock } from '@/extensions/long-document'

/**
 * Where you were in each note: the block at the top of the screen (and how
 * far down the note that was) and where the caret sat, kept as you leave it and put back when it opens again (later
 * the same day, or after a restart), so a long note reopens where you were
 * reading or writing instead of at the top; one read to its end starts over.
 * The last 300 notes are kept.
 */
type Place = {
  top: number
  from: number
  at: number
  /** The block at the top of the screen, as its position in the note, and how far the screen's top edge is into it. */
  block?: number
  into?: number
}
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
export function scrollerOf(element: Element): HTMLElement | null {
  for (let at = element.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at)
    if (/(auto|scroll)/.test(overflowY)) return at
  }
  return null
}

/** Notes opened somewhere on purpose (by a link to one of their headings): not put back where they were last left. */
const elsewhere = new WeakSet<Editor>()
export const openedElsewhere = (editor: Editor): void => void elsewhere.add(editor)

/**
 * The block at the top of the scroller (its position in the note) and how far above the scroller's top edge it
 * starts. `seen`: the blocks on the screen as a long note itself tells them (most of its blocks are off the page,
 * and looking through them by halves ended on the note's last block, so a long note was never found again).
 */
function anchorOf(view: EditorView, scroller: HTMLElement, seen: { first: number; last: number } | null): { block: number; into: number } | null {
  const blocks = view.dom.children
  if (!blocks.length) return null
  const edge = scroller.getBoundingClientRect().top
  // The first block reaching below the edge, found by halves: a dozen reads in a note of thousands of blocks.
  let low = seen ? Math.min(seen.first, blocks.length - 1) : 0
  let high = seen ? low : blocks.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (blocks[middle].getBoundingClientRect().bottom <= edge) low = middle + 1
    else high = middle
  }
  // The first block that starts on the screen, not the one cut by its edge: a picture above it may load at another
  // height, and a place partway into it could not be found again. The cut one only when nothing else starts on screen.
  const next = blocks[low + 1]
  const top = blocks[low].getBoundingClientRect().top < edge - 0.5 && next && next.getBoundingClientRect().top < edge + scroller.clientHeight / 2 ? next : blocks[low]
  try {
    const at = view.posAtDOM(top, 0)
    const $at = view.state.doc.resolve(at)
    return { block: $at.depth ? $at.before(1) : at, into: edge - top.getBoundingClientRect().top }
  } catch {
    return null
  }
}

/**
 * Keep and restore one note's place. Kept as the block at the top of the
 * screen and how far into it the screen starts, not as a distance from the
 * note's top: the parts above it (code coloured after drawing, pictures and
 * link cards that load late) are not their final height as a note opens, so
 * a distance landed short and the note then grew under it. The note is put
 * at that block before its first frame is painted, at once (the pane's own
 * scroll eases, and a glide down from the top read as the note jumping
 * about), and held there each time the note changes size, until you scroll,
 * press a key or click, or something else scrolls it (a link to a heading
 * lands there instead: it scrolls after).
 */
export function useNotePlace(editor: Editor | null, id: string | null, on: boolean): void {
  useEffect(() => {
    if (!on || !editor || !id) return
    const view = editor.view
    const dom = view.dom
    // Set up once the note is laid out, where the page scrolls read then for nothing (lib/after-layout.ts).
    let undo = (): void => undefined
    const off = afterLayout(dom, () => (undo = follow()))
    const follow = (): (() => void) => {
    const scroller = scrollerOf(dom)
    const kept = elsewhere.has(editor) ? null : placeOf(id)
    let holding = !!scroller && !!kept && kept.top > 0
    // Left as kept until you move it: a note closed again before that keeps its place.
    let top = holding && kept ? kept.top : (scroller?.scrollTop ?? 0)
    let anchor = holding && kept?.block != null && kept.into != null ? { block: kept.block, into: kept.into } : null
    let from = editor.state.selection.from
    // Where this last scrolled the note to: its own scroll is no reason to let go.
    let mine = -1
    const go = (to: number): void => {
      if (!scroller) return
      scroller.scrollTo({ top: to, behavior: 'instant' })
      mine = scroller.scrollTop
    }
    // How far the kept block has moved from where it was left; null when it is not on the page.
    const drift = (): number | null => {
      if (!anchor || !scroller || anchor.block >= editor.state.doc.content.size) return null
      const block = view.nodeDOM(anchor.block)
      if (!(block instanceof HTMLElement) || block.parentElement !== dom || !block.getClientRects().length) return null
      return block.getBoundingClientRect().top - scroller.getBoundingClientRect().top + anchor.into
    }
    // `opening`: a long note keeps only the blocks near its screen on its page, and the one it was left at is brought
    // onto it as it opens. Only then: later, off the page means something else took the screen elsewhere.
    const put = (opening = false): void => {
      if (!holding || !kept || !scroller) return
      let by = drift()
      if (by === null && anchor && opening) {
        showBlock(editor, anchor.block)
        by = drift()
      }
      if (by !== null) {
        if (Math.abs(by) >= 0.5) go(scroller.scrollTop + by)
      } else if (scroller.scrollHeight - scroller.clientHeight >= kept.top - 1) {
        // Kept before blocks were, or its block is gone: the distance from the top, once the note is tall enough.
        go(kept.top)
        holding = false
      }
    }
    const stop = (): void => void (holding = false)
    if (kept) {
      const size = editor.state.doc.content.size
      // The caret where it was, without taking the keys: the next click or key in the note starts there.
      if (kept.from > 0 && kept.from < size) editor.commands.setTextSelection(kept.from)
      put(true)
    }
    // Where you are now, read when you scroll and when the note changes size under a still screen (a picture loads above it).
    const read = (): void => {
      if (!scroller || holding) return
      // Read to its last screen, a note is finished with: it opens at its top next time, not at the bottom with nothing left to read.
      top = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < scroller.clientHeight ? 0 : scroller.scrollTop
      anchor = top ? anchorOf(view, scroller, screenBlocks(editor)) : null
    }
    // Held there as the note grows above it: told after each layout, before it is painted.
    const grows = new ResizeObserver(() => (holding ? put() : read()))
    grows.observe(dom)
    const onScroll = (): void => {
      if (!scroller) return
      // Moved by something else (a link to a heading, find), that wins. The browser's own scroll anchoring keeps the block where it was, so never counts.
      // Its block no longer on the page (a long note's screen sent far off) is moved as well.
      const by = drift()
      if (holding && Math.abs(scroller.scrollTop - mine) > 1 && (by === null ? !!anchor : Math.abs(by) > 1)) holding = false
      read()
    }
    const onSelect = (): void => void (from = editor.state.selection.from)
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    scroller?.addEventListener('wheel', stop, { passive: true })
    scroller?.addEventListener('pointerdown', stop)
    window.addEventListener('keydown', stop, true)
    editor.on('selectionUpdate', onSelect)
    const save = (): void => {
      // Only a place worth coming back to: the top with the caret at the start is where it opens anyway.
      if (top > 0 || from > 1) keep(id, { top, from, at: Date.now(), ...(top > 0 && anchor ? anchor : {}) })
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
    }
    return () => (off(), undo())
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
