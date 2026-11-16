import { useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'

import { heightsOf, screenBlocks, scrolledItself, showBlock, takeHeights, type KeptHeights } from '@/extensions/long-document'

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
  /** Left within its last screen: read to its end. */
  done?: boolean
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

/**
 * How tall each block of a long note stood when it was last open, kept beside its place: only the blocks near the
 * screen of a long note are on its page (extensions/long-document.ts), the rest stand as space that is guessed
 * until each has been drawn once, and with these the page is as tall as it truly is from the moment it opens.
 * One entry a note; the last 8 long notes are kept.
 */
const TALLS = 'note-heights'
const KEEP_TALLS = 8

function keepHeights(id: string, heights: KeptHeights): void {
  try {
    const ids = (JSON.parse(localStorage.getItem(TALLS) ?? '[]') as string[]).filter((one) => one !== id)
    ids.push(id)
    for (const old of ids.splice(0, Math.max(0, ids.length - KEEP_TALLS))) localStorage.removeItem(`${TALLS}:${old}`)
    localStorage.setItem(`${TALLS}:${id}`, JSON.stringify(heights))
    localStorage.setItem(TALLS, JSON.stringify(ids))
  } catch {
    // Kept for this run only.
  }
}

function heightsKept(id: string): KeptHeights | null {
  try {
    const kept = JSON.parse(localStorage.getItem(`${TALLS}:${id}`) ?? 'null') as KeptHeights | null
    return kept && Array.isArray(kept.sizes) && Array.isArray(kept.talls) && Array.isArray(kept.airs) ? kept : null
  } catch {
    return null
  }
}

/**
 * The element the note scrolls in: the nearest one above it that scrolls. A box held still for now because all it
 * shows fits (ui.tsx useScrollOnlyWhenNeeded hides its overflow and marks it `data-scroll-held`) is that box all
 * the same: read by its overflow alone it was no scroller at all, so a list whose rows came back into it (the
 * Inbox emptied into the Bin beside an open note, then Undo) found none, drew no rows, and so the box went on
 * fitting and the rows never showed.
 */
export function scrollerOf(element: Element): HTMLElement | null {
  for (let at = element.parentElement; at; at = at.parentElement) {
    if (at.hasAttribute('data-scroll-held')) return at
    const { overflowY } = getComputedStyle(at)
    if (/(auto|scroll)/.test(overflowY)) return at
  }
  return null
}

/**
 * The mark on a scroller whose place is kept here (components/haligtree/haligtree-editor.tsx puts it on a note's own
 * scroller). The pane keeps how far every other box of a page was scrolled and puts each back by that distance,
 * frame by frame, when a step is returned to (components/haligtree/panes.tsx); a note's place is a block, not a
 * distance (the sizes above the screen of a long note are guesses that move), so its scroller is this file's alone.
 * With both at it, Back to a long note landed where the two left it between them.
 */
export const PLACED = 'data-note-place'
export const placedHere = (box: Element): boolean => box.hasAttribute(PLACED)

/**
 * Whether the page now opening is one returned to (Back, Forward, another tab chosen): said by the shell as it steps
 * (home.tsx), unsaid as it opens anything new. Returned to, a note is exactly where it was left, its very end
 * included; opened anew, a note read to its end starts over at its top.
 */
let returned = false
export const comingBack = (on: boolean): void => void (returned = on)

/**
 * THE RULE, kept here and nowhere else: a place someone asked for (a link to a heading, to a line or to a picture,
 * a line of the contents, find's match) always wins over the place the note was last left at, however late it is
 * asked; the kept place is only for a note opened with nowhere to go.
 *
 * Whoever sends a note somewhere says so first (`sentElsewhere`): a note not yet put back is then never put back,
 * and one being held where it was left is let go of there and then. It is said, never left to be found out from
 * the scrolls that follow. Found out, it was a race: a note opened by a link to a heading was first put back where
 * it was last left (at its first layout), the heading was only taken about 100 ms later (when its editor told of
 * its own making), and the jump to it then had to be told apart from a long note's own settling scrolls, which
 * are put right, not given way to. Taken for one of those, the jump was undone and the note stayed where it was
 * last left (qa/long-note-held.mjs: 5 runs of 5 on a busy Mac, and where it did win the kept place showed first).
 */
const elsewhere = new WeakSet<Editor>()
/** What lets go of each note now being held at its kept place. */
const lettingGo = new WeakMap<Editor, () => void>()
export const sentElsewhere = (editor: Editor): void => {
  elsewhere.add(editor)
  lettingGo.get(editor)?.()
}

/**
 * The block at the top of the scroller (its position in the note) and how far above the scroller's top edge it
 * starts. `seen`: the blocks on the screen as a long note itself tells them (most of its blocks are off the page,
 * and looking through them by halves ended on the note's last block, so a long note was never found again).
 */
function anchorOf(view: EditorView, scroller: HTMLElement, seen: { first: number; last: number } | null): { block: number; into: number } | null | undefined {
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
  // A long note's screen standing, for this moment, on blocks that are not drawn (its drawn blocks are on their way
  // to it): the block there is only a guess from remembered sizes, and it has no place on the page to read. Nothing
  // to keep: what was read last stays.
  if (seen && !blocks[low].getClientRects().length) return undefined
  // The first block that starts on the screen, not the one cut by its edge: a picture above it may load at another
  // height, and a place partway into it could not be found again. The cut one only when nothing else starts on screen.
  const next = blocks[low + 1]
  const top = blocks[low].getBoundingClientRect().top < edge - 0.5 && next?.getClientRects().length && next.getBoundingClientRect().top < edge + scroller.clientHeight / 2 ? next : blocks[low]
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
    // Set up once the note is laid out, where the page scrolls read then for nothing (a size watch tells of an
    // element after the page next lays itself out and before that frame is painted, as lib/after-layout.ts does).
    // And only once it is on the page: a long note is taken off it for a moment as its blocks are drawn
    // (extensions/long-document.ts), and told of then, it had no scroller: it was never put back where it was
    // left, nor was its place kept as it was closed. The watch tells again when it comes back and has a size.
    let undo = (): void => undefined
    const laidOut = new ResizeObserver(() => dom.isConnected && (laidOut.disconnect(), (undo = follow())))
    laidOut.observe(dom)
    const off = (): void => laidOut.disconnect()
    const follow = (): (() => void) => {
    const scroller = scrollerOf(dom)
    // A long note's blocks as tall as they were last drawn, before it is put back where it was left.
    const talls = heightsKept(id)
    if (talls) takeHeights(editor, talls)
    const kept = elsewhere.has(editor) ? null : placeOf(id)
    // Read to its last screen, a note is finished with: opened anew it starts at its top, not at the bottom with
    // nothing left to read. Returned to (Back, Forward, its tab chosen) it is where it was left, like any other.
    let done = !!kept?.done
    let holding = !!scroller && !!kept && kept.top > 0 && (!done || returned)
    // Left as kept until you move it: a note closed again before that keeps its place.
    let top = holding && kept ? kept.top : (scroller?.scrollTop ?? 0)
    let anchor = holding && kept?.block != null && kept.into != null ? { block: kept.block, into: kept.into } : null
    let from = editor.state.selection.from
    // Where the scroller stood when last looked at, and how far a long note had by then moved it by itself: what
    // it has moved by since, beyond the note's own share, is someone else's doing. Looked at after each scroll made
    // here, so a scroll of this file's own is no reason to let go either.
    let seen: [top: number, own: number] = [scroller?.scrollTop ?? 0, scroller ? scrolledItself(scroller) : 0]
    const look = (): void => void (scroller && (seen = [scroller.scrollTop, scrolledItself(scroller)]))
    const go = (to: number): void => {
      if (!scroller) return
      scroller.scrollTo({ top: to, behavior: 'instant' })
      look()
    }
    // How far the kept block has moved from where it was left; null when it is not on the page.
    const drift = (): number | null => {
      if (!anchor || !scroller || anchor.block >= editor.state.doc.content.size) return null
      const block = view.nodeDOM(anchor.block)
      if (!(block instanceof HTMLElement) || block.parentElement !== dom || !block.getClientRects().length) return null
      return block.getBoundingClientRect().top - scroller.getBoundingClientRect().top + anchor.into
    }
    // A long note keeps only the blocks near its screen on its page: the one it was left at is brought onto it as
    // it opens, and again if it has gone from the page while the place is still held. (Later, the place was then
    // taken from the distance kept instead, which is no place in a long note: the sizes above it are guesses that
    // move as its blocks are drawn, and it came back some 200 blocks further on.) Whatever takes the screen
    // elsewhere on purpose lets go of the place first (`stop`).
    const put = (): void => {
      // Not while the note is off the page or hidden with its pane: nothing has a place then, and the layout that
      // brings it back tells again.
      if (!holding || !kept || !scroller || !dom.isConnected || !scroller.clientHeight) return
      let by = drift()
      if (by === null && anchor) {
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
    // Sent somewhere from now on (sentElsewhere, the rule above): the place is let go of there and then.
    lettingGo.set(editor, stop)
    if (kept) {
      const size = editor.state.doc.content.size
      // The caret where it was, without taking the keys: the next click or key in the note starts there.
      if (kept.from > 0 && kept.from < size) editor.commands.setTextSelection(kept.from)
      put()
    }
    // Where you are now, read when you scroll and when the note changes size under a still screen (a picture loads above it).
    const read = (): void => {
      // Not as the note is taken off the page (closed, or its pane hidden): nothing is where it was then, the
      // scroller reads as at its top, and the place just read was lost in the moment before it was kept.
      if (!scroller || holding || !dom.isConnected || !scroller.clientHeight) return
      const now = scroller.scrollTop
      const found = now ? anchorOf(view, scroller, screenBlocks(editor)) : null
      if (found === undefined) return
      top = now
      anchor = found
      // Within its last screen: read to its end (`done`, above). The place itself is kept all the same.
      done = now > 0 && scroller.scrollHeight - scroller.clientHeight - now < scroller.clientHeight
    }
    // Held there as the note grows above it: told after each layout, before it is painted. And as what stands
    // beside the note in the same scroller changes size (the strip under its title, what comes after its words:
    // filled a moment after the note is on the page, later still while the app is starting): that moves the note
    // on the screen without changing its size, and nothing was told of it. Not a long note's space kept for the
    // blocks it has not drawn: that is set as the note holds its own screen still, in the same moment
    // (extensions/long-document.ts `keep`), and watched here too, the browser could not tell of its change in
    // that frame and said so as an error on the page.
    const grows = new ResizeObserver(() => (holding ? put() : read()))
    grows.observe(dom)
    const besides = (): void => { if (scroller) for (const one of scroller.children) if (!one.hasAttribute('data-long-end')) grows.observe(one) }
    const beside = new MutationObserver(besides)
    if (scroller) (besides(), beside.observe(scroller, { childList: true }))
    const onScroll = (): void => {
      if (!scroller) return
      // Moved by something else (a link to a heading, find), that wins. The browser's own scroll anchoring keeps the block where it was, so never counts.
      // Its block no longer on the page (a long note's screen sent far off) is moved as well.
      const by = drift()
      // A long note's own scroll, as it puts right the space kept above its drawn blocks, is not a move by something
      // else, even when the kept block is off its place by then (a font or a picture arriving in the same moment,
      // as they do while the app is starting): taken for one, the place was let go of, and the note launched again
      // came back some blocks from where it was left. It is put back instead. Only that scroll and this file's
      // own count: the scroller is where it was last seen plus what the note has moved it by since, to the pixel.
      // Anything more is a scroll someone asked for (the app sending the note to its top, a jump, a hand), and
      // that is never undone: the place is let go of.
      const own = Math.abs(scroller.scrollTop - (seen[0] + scrolledItself(scroller) - seen[1])) <= 1
      look()
      if (holding && !own && (by === null ? !!anchor : Math.abs(by) > 1)) holding = false
      if (holding && own && by !== null && Math.abs(by) >= 0.5) put()
      read()
    }
    const onSelect = (): void => void (from = editor.state.selection.from)
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    scroller?.addEventListener('wheel', stop, { passive: true })
    // A press anywhere lets go of the place, not only one in the note: a heading pressed in the contents beside it
    // is a jump, and the screen is going there. (A caret asked into view with no press and no key is the app's own
    // doing, as when the note is given the keys while it opens: the place is kept through that.)
    window.addEventListener('pointerdown', stop, true)
    window.addEventListener('keydown', stop, true)
    editor.on('selectionUpdate', onSelect)
    const save = (): void => {
      // Only a place worth coming back to: the top with the caret at the start is where it opens anyway.
      if (top > 0 || from > 1) keep(id, { top, from, at: Date.now(), ...(top > 0 && anchor ? anchor : {}), ...(top > 0 && done ? { done: true } : {}) })
      const heights = heightsOf(editor)
      if (heights) keepHeights(id, heights)
    }
    window.addEventListener('pagehide', save)
    // Asked before the note's window goes or another takes it up (the welcome played again, main: remakeHome): its place goes first, as its words do.
    window.addEventListener('haligtree:flush', save)
    return () => {
      save()
      if (lettingGo.get(editor) === stop) lettingGo.delete(editor)
      grows.disconnect()
      beside.disconnect()
      scroller?.removeEventListener('scroll', onScroll)
      scroller?.removeEventListener('wheel', stop)
      window.removeEventListener('pointerdown', stop, true)
      window.removeEventListener('keydown', stop, true)
      window.removeEventListener('pagehide', save)
      window.removeEventListener('haligtree:flush', save)
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
