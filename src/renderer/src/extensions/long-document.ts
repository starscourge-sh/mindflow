import { Extension, type Editor } from "@tiptap/core"
import { Plugin, PluginKey, Selection, TextSelection, type EditorState } from "@tiptap/pm/state"
import { DecorationSet, type EditorView } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

/** Past this many positions (about 60,000 words) a document counts as long. */
const LONG = 200_000
const long = (state: EditorState): boolean => state.doc.content.size > LONG

/**
 * Drawing a change visits every block in the note and asks each set of marks
 * (fold arrows, code colours) for that block's share, and a set looked for it
 * from its first entry onward: thousands of blocks times thousands of entries
 * on every key in a long note. Looked up by halves instead, with the same answer.
 */
type Inside = { children: readonly (number | DecorationSet)[]; local: unknown }
const forChild = DecorationSet.prototype.forChild as (this: Inside, offset: number, node: ProseMirrorNode) => unknown
Object.assign(DecorationSet.prototype, {
  forChild(this: Inside, offset: number, node: ProseMirrorNode) {
    const children = this.children
    if (children.length < 96) return forChild.call(this, offset, node)
    let low = 0
    let high = children.length / 3
    while (low < high) {
      const middle = (low + high) >> 1
      if ((children[middle * 3] as number) < offset) low = middle + 1
      else high = middle
    }
    const near: Inside = Object.create(DecorationSet.prototype)
    near.local = this.local
    near.children = children.slice(low * 3, low * 3 + 3)
    return forChild.call(near, offset, node)
  },
})

let made = 0

/**
 * The page's selection, kept to the blocks that are drawn.
 *
 * A selection reaching past them (⌘A, a long ⇧-click) was handed to the
 * browser whole, across thousands of blocks taken off the page, and the
 * browser worked out the look of every one of them to place it: seconds per
 * selection, again on every change it caused, and the editor froze for good.
 * The note's own selection is still the whole of it (copy, delete, typing
 * over it and Undo all go by that); only what the browser is told to paint
 * stops at the edge of what is drawn, which is all it could show anyway. It
 * follows the drawn blocks as they move (`resync` below).
 *
 * ProseMirror gives no way in to this, so its one method that hands the
 * selection to the browser is wrapped, for the editors marked here only.
 */
type Desc = { dom: Node; setSelection: (anchor: number, head: number, view: EditorView, force?: boolean) => void }
/** Where the browser is told the selection is; null when it is not to be told at all. */
type Clamp = (anchor: number, head: number) => [number, number] | null
const clamps = new WeakMap<Node, Clamp>()
let wrapped = false
function keepSelectionDrawn(view: EditorView, clamp: Clamp): () => void {
  clamps.set(view.dom, clamp)
  if (!wrapped) {
    let proto = Object.getPrototypeOf((view as unknown as { docView: Desc }).docView) as Desc | null
    while (proto && !Object.prototype.hasOwnProperty.call(proto, "setSelection")) proto = Object.getPrototypeOf(proto) as Desc | null
    if (proto) {
      wrapped = true
      const setSelection = proto.setSelection
      proto.setSelection = function (this: Desc, anchor, head, view, force) {
        const kept = clamps.get(this.dom)
        if (kept) {
          const told = kept(anchor, head)
          if (!told) return
          ;[anchor, head] = told
        }
        return setSelection.call(this, anchor, head, view, force)
      }
    }
  }
  return () => void clamps.delete(view.dom)
}

/**
 * The caret went somewhere, or what it sits in changed (typing, an Undo that lands on it). Words changed elsewhere
 * in the note are neither: a link card's picture kept as it comes on show, a task ticked from its list, another
 * window's edit. Taken as the caret moving, each of those brought the drawn blocks back to a caret the screen had
 * been scrolled away from, and the next frame took them back to the screen.
 */
function caretWent(before: EditorState, state: EditorState): boolean {
  if (state.doc === before.doc) return !state.selection.eq(before.selection)
  return state.doc.maybeChild(state.selection.$head.index(0)) !== before.doc.maybeChild(before.selection.$head.index(0))
}

/** How many changes so far asked for their caret to be shown (`scrollIntoView`): a jump, a key, an Undo. */
const shown = new PluginKey<number>("longDocumentShown")
const asks = (state: EditorState): number => shown.getState(state) ?? 0

/** What the rest of the app may ask of a long note's drawn blocks, by the editor's own element. */
const drawnOf = new WeakMap<Element, { screen: () => { first: number; last: number } | null; show: (index: number) => void }>()

/** The blocks on the screen of a long note, as their places among its blocks; null for a note with every block drawn. */
export const screenBlocks = (editor: Editor): { first: number; last: number } | null => drawnOf.get(editor.view.dom)?.screen() ?? null

/**
 * Draw the block at `pos` in a long note, with those round it: only the blocks near the screen are on the page, and
 * one that is not cannot be measured or scrolled to. Whoever asks puts the screen there next, in the same breath.
 */
export function showBlock(editor: Editor, pos: number): void {
  const { doc } = editor.state
  if (pos >= 0 && pos <= doc.content.size) drawnOf.get(editor.view.dom)?.show(doc.resolve(pos).index(0))
}

/** The keys the browser itself answers where its selection is, beside the letters: those that move it or rub out. */
const LANDS = new Set(["Enter", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Process", "Dead"])

/** The mark on a block that is off the page. */
const OFF = "data-off"

/** Blocks either side of the screen kept drawn, and how close the screen or the caret may come to the edge of them. */
const AROUND = 150
const SLACK = 50
/** How many blocks in from the drawn edge a caret left behind is told to the browser, when it must be told one. */
const PARK = 20
/** A block never drawn yet is taken to be this tall until it is. */
const GUESS = 32

/**
 * Only the blocks near the screen are on the page.
 *
 * Every key typed makes the browser lay out, and find what is under the
 * pointer, across every block in the note, drawn or not: thousands of them in
 * a long note, most of what each key cost. So the blocks far from the screen
 * are taken out of the page, with space kept for them above and below, sized
 * from when each was last drawn. The band that is drawn follows the screen as
 * it scrolls and the caret as it moves, and the words on screen stay put when
 * it shifts. The document itself never changes.
 */
function nearScreen(view: EditorView, name: string): { ahead: (state: EditorState) => void; update: (previous: EditorState) => void; destroy: () => void } {
  // Which blocks are drawn, and the space kept for the rest. A block off the
  // page carries a mark, and one rule that never changes hides the marked:
  // moving the drawn blocks then touches only the blocks that change sides.
  // (The rule used to name the drawn ones by their place, `:nth-child`, and
  // was written again at each move: every rewriting had the browser work out
  // the look of the whole window again, about 70 ms on a 7,000-block note
  // whatever moved, several times a second in a fast scroll.) The space kept
  // is in a sheet of its own, which touches only the note's own edges.
  const style = document.createElement("style")
  const spaces = document.createElement("style")
  const heights = new WeakMap<Element, number>()
  let band: [number, number] | null = null
  let spaced: [number, number] = [0, 0]
  // The drawn blocks have just gone to a far caret: "shown" when the change asked for its caret to be shown.
  let leap: false | "shown" | "set" = false
  // How many asks to show the caret had been counted in the last state read.
  let asked = asks(view.state)
  // Drawn ahead of the blocks it is for: the space kept for them is worked out again once they are there.
  let early = false
  let last: EditorState | null = null
  const at = `.tiptap.ProseMirror.haligtree-editor[data-long="${name}"]`
  const blocks = (): HTMLCollection => view.dom.children
  // A block never drawn is taken to be as tall as the drawn ones are on average.
  let sum = 0
  let counted = 0
  const tall = (block: Element): number => heights.get(block) ?? (counted ? sum / counted : GUESS)
  // Remember how tall the drawn blocks are, from where each next one starts.
  // Not while the note is off the page as it opens: every block reads as no
  // height there, and the space kept above and below came out as none, so the
  // scrollbar lied and gg and G landed in the wrong place.
  const measure = (): void => {
    if (!band || !view.dom.isConnected) return
    const all = blocks()
    const last = Math.min(band[1], all.length - 1)
    for (let i = band[0]; i < last; i++) {
      const here = all[i] as HTMLElement
      const next = all[i + 1] as HTMLElement
      const height = next.offsetTop - here.offsetTop
      if (height < 0) continue
      const had = heights.get(here)
      if (had === undefined) counted++
      sum += height - (had ?? 0)
      heights.set(here, height)
    }
  }
  const draw = (from: number, to: number, coming?: number): void => {
    const all = blocks()
    from = Math.max(0, from)
    // Drawn ahead of a change (`coming`: how many elements the note is about
    // to have), it is not cut to the blocks on the page now: for Undo bringing
    // back the whole note, the blocks it is drawn for are not there yet, and a
    // band cut to the old few was no band at all.
    to = coming === undefined ? Math.min(all.length - 1, to) : Math.max(from, Math.min(coming - 1, to))
    band = [from, to]
    let above = 0
    let below = 0
    for (let i = 0; i < from; i++) above += tall(all[i])
    for (let i = to + 1; i < all.length; i++) below += tall(all[i])
    spaced = [above, below]
    mark()
    const room = `${at}::before { content: ""; display: block; height: ${above}px; }` + `${at}::after { content: ""; display: block; height: ${below}px; }`
    if (spaces.textContent !== room) spaces.textContent = room
  }
  // Before the blocks holding the browser's selection are taken off the page, it is let go of: left in them, the
  // browser looked through the hidden blocks for somewhere to show it, each time it drew. It is told the
  // selection again, as far as it is drawn, straight after (ProseMirror with a change, `resync` with a scroll).
  const letGo = (from: number, to: number): void => {
    const selection = view.dom.ownerDocument.getSelection()
    if (!selection?.rangeCount) return
    const all = blocks()
    const leaves = (node: Node | null, offset: number): boolean => {
      if (!node || !view.dom.contains(node)) return false
      // Between two blocks (a picture picked whole): by how many blocks come before it.
      if (node === view.dom) return offset < from || offset > to + 1
      let block = node
      while (block.parentNode && block.parentNode !== view.dom) block = block.parentNode
      const index = Array.prototype.indexOf.call(all, block)
      return index < from || index > to
    }
    if (leaves(selection.anchorNode, selection.anchorOffset) || leaves(selection.focusNode, selection.focusOffset)) selection.removeAllRanges()
  }
  /** Whether the browser's selection is in this note now. */
  const held = (): boolean => {
    const selection = view.dom.ownerDocument.getSelection()
    return !!selection?.rangeCount && view.dom.contains(selection.anchorNode)
  }
  /**
   * Each block's mark put right: on for those outside the drawn ones, off for those among them. Every block is
   * looked at (a glance each) and only those on the wrong side are touched. ProseMirror is not told: a mark is no
   * change to the note, and it would read each as one.
   */
  const mark = (): void => {
    const all = blocks()
    const watch = (view as unknown as { domObserver: { stop: () => void; start: () => void } }).domObserver
    let stopped = false
    for (let i = 0; i < all.length; i++) {
      const off = !!band && (i < band[0] || i > band[1])
      if (off === all[i].hasAttribute(OFF)) continue
      if (!stopped) (watch.stop(), (stopped = true))
      all[i].toggleAttribute(OFF, off)
    }
    if (stopped) watch.start()
  }
  // A block ProseMirror makes again (a change far from the screen, its React blocks drawn afresh) comes without
  // its mark: told of each block put on the page, before the frame is drawn, and the marks are put right then.
  // Nothing is read on a key that only changes the words of a block.
  const made = new MutationObserver((records) => {
    if (band && records.some((record) => record.addedNodes.length)) mark()
  })
  made.observe(view.dom, { childList: true })
  const clear = (): void => {
    band = null
    mark()
    spaces.textContent = ""
  }
  /** Shift the band, keeping the block at the top of the screen where it is, or where the sizes say it should be. */
  const shift = (from: number, to: number, anchor: Element | null, at?: number): void => {
    measure()
    const before = at ?? anchor?.getBoundingClientRect().top
    letGo(from, to)
    draw(from, to)
    const scroller = view.dom.parentElement
    // Only when it is still drawn: a band moved far, after the caret, has nothing to keep still.
    // At once, never eased: the words have to stay where they were.
    if (anchor && before !== undefined && scroller && anchor.getClientRects().length) scroller.scrollBy({ top: anchor.getBoundingClientRect().top - before, behavior: "instant" })
    resync()
  }
  // The block at the top of the screen, as an index into the note, and its element when it is drawn.
  const onScreen = (): { first: number; last: number; anchor: Element | null; at?: number } | null => {
    const all = blocks()
    const scroller = view.dom.parentElement
    if (!all.length || !scroller || !band) return null
    const box = scroller.getBoundingClientRect()
    const top = Math.max(box.top, 0)
    const bottom = Math.min(box.bottom, window.innerHeight)
    const shown = all[band[0]].getBoundingClientRect()
    const end = all[Math.min(band[1], all.length - 1)].getBoundingClientRect()
    if (shown.top <= bottom && end.bottom >= top) {
      // Among the drawn ones, by halves.
      const find = (edge: number): number => {
        let low = band![0]
        let high = band![1]
        while (low < high) {
          const middle = (low + high) >> 1
          if (all[middle].getBoundingClientRect().bottom < edge) low = middle + 1
          else high = middle
        }
        return low
      }
      const first = find(top)
      return { first, last: find(bottom), anchor: all[first] }
    }
    // Scrolled into the space kept for the others: counted from the remembered sizes.
    let y = shown.top - spaced[0]
    let first = 0
    while (first < all.length - 1 && y + tall(all[first]) < top) y += tall(all[first++])
    const at = y
    let last = first
    while (last < all.length - 1 && y < bottom) y += tall(all[last++])
    return { first, last, anchor: all[first], at }
  }
  const follow = (): void => {
    if (!band || !view.dom.isConnected) return
    const seen = onScreen()
    if (!seen) return
    const { first, last, anchor, at } = seen
    // Still well inside the band: nothing to change.
    if ((first - band[0] >= SLACK || band[0] === 0) && (band[1] - last >= SLACK || band[1] >= blocks().length - 1)) return
    shift(first - AROUND, last + AROUND, anchor, at)
  }
  const scrolled = (event: Event): void => {
    if (event.target instanceof Node && event.target.contains(view.dom)) follow()
  }
  // The first and last places inside the drawn blocks.
  const drawnEdges = (): [number, number] | null => {
    if (!band) return null
    const all = blocks()
    const desc = (i: number): { node?: unknown; posAtStart: number; posAtEnd: number } | null => (all[i] as unknown as { pmViewDesc?: { node?: unknown; posAtStart: number; posAtEnd: number } } | undefined)?.pmViewDesc ?? null
    let first = Math.min(band[0], all.length - 1)
    let end = Math.min(band[1], all.length - 1)
    while (first < end && !desc(first)?.node) first++
    while (end > first && !desc(end)?.node) end--
    const [one, two] = [desc(first), desc(end)]
    return one && two ? [one.posAtStart, two.posAtEnd] : null
  }
  const unclamp = keepSelectionDrawn(view, (anchor, head) => {
    const edges = view.dom.hasAttribute("data-long") ? drawnEdges() : null
    if (!edges) return [anchor, head]
    // No part of it drawn (a caret left behind as the screen went elsewhere): the browser is not told. Told where
    // it is, among blocks taken off the page, it looked through every hidden block for somewhere to show it, each
    // time it drew, and the window stopped answering for minutes. Only as the note is given the keys is it told
    // the edge of the drawn blocks nearest the caret, well off the screen (`parking`, below). A key lands at the
    // true caret all the same: the note comes back to it first (`keyed`).
    if (Math.max(anchor, head) < edges[0] || Math.min(anchor, head) > edges[1]) {
      const at = parking ? parked(Math.max(anchor, head) < edges[0]) : null
      return at === null ? null : [at, at]
    }
    const keep = (at: number): number => Math.min(Math.max(at, edges[0]), edges[1])
    return [keep(anchor), keep(head)]
  })
  // Where a caret with no part drawn is told to the browser as the note is given the keys: the start of a block
  // some way in from the drawn edge nearest it. Off the screen (the drawn blocks reach further past it than
  // that), and with drawn blocks either side: at the very edge, next to the hidden ones, the browser looked
  // through those for the caret's place.
  const parked = (before: boolean): number | null => {
    if (!band) return null
    const all = blocks()
    const first = Math.min(band[0], all.length - 1)
    const end = Math.min(band[1], all.length - 1)
    const block = all[before ? Math.min(first + PARK, end) : Math.max(end - PARK, first)] as unknown as { pmViewDesc?: { node?: unknown; posAtStart: number } } | undefined
    return block?.pmViewDesc?.node ? block.pmViewDesc.posAtStart : null
  }
  // The drawn blocks moved: the browser is told the selection again when some of it is drawn now (a range's new
  // edge, the caret itself once its blocks are back). One with no part drawn stays untold.
  const resync = (): void => {
    if (!view.hasFocus()) return
    const { from, to } = view.state.selection
    const edges = drawnEdges()
    if (edges && to >= edges[0] && from <= edges[1]) focus()
  }
  // Given the keys with no selection in it, the browser puts a caret of its own at the note's very first place:
  // off the page in a long note scrolled down, and it looked through every hidden block from there for somewhere
  // to show it (seconds). So a selection is in the note before the keys are: the note's own, or with none of
  // that drawn, the drawn edge nearest it.
  let parking = false
  const focus = view.focus.bind(view)
  view.focus = (): void => {
    if (band && view.dom.isConnected && !view.hasFocus() && !held()) {
      const { anchor, head } = view.state.selection
      parking = true
      try {
        ;(view as unknown as { docView: Desc }).docView.setSelection(anchor, head, view)
      } finally {
        parking = false
      }
    }
    focus()
  }
  /** Draw the blocks round block `index`, if it is not among the drawn ones. */
  const show = (index: number): void => {
    if (!band || !view.dom.isConnected || (index >= band[0] && index <= band[1])) return
    measure()
    letGo(index - AROUND, index + AROUND)
    draw(index - AROUND, index + AROUND)
  }
  /**
   * The screen put where the caret is, at once, the caret's line in its middle. ProseMirror brings the caret to the
   * screen only in a note that holds the keys, and a frame later was too late: asked from find's field, a link or
   * the contents before the note had them, the screen stayed where it was, the drawn blocks went back to it, and
   * the place gone to was not on the page to scroll to.
   */
  const bring = (): void => {
    const scroller = view.dom.parentElement
    if (!scroller || !view.dom.isConnected) return
    const caret = view.coordsAtPos(Math.min(view.state.selection.head, view.state.doc.content.size))
    const box = scroller.getBoundingClientRect()
    // Nowhere (inside a section folded shut), or on the screen already.
    if ((!caret.top && !caret.bottom) || (caret.top >= box.top + 48 && caret.bottom <= box.bottom - 48)) return
    scroller.scrollBy({ top: (caret.top + caret.bottom) / 2 - (box.top + box.bottom) / 2, behavior: "instant" })
  }
  // A key the browser answers itself (a letter, Return, an arrow), pressed with the caret left behind in blocks no
  // longer drawn: the note comes back to the caret first, as any editor does, so the key lands where the caret is.
  const keyed = (event: Event): void => {
    if (!band || document.activeElement !== view.dom) return
    // Any words on their way in (dictation, a held accent), or one of those keys.
    if (event instanceof KeyboardEvent && (event.metaKey || event.ctrlKey || (event.key.length !== 1 && !LANDS.has(event.key)))) return
    const { from, to, $head } = view.state.selection
    const edges = drawnEdges()
    if (!edges || (to >= edges[0] && from <= edges[1])) return
    show($head.index(0))
    focus()
    bring()
  }
  style.textContent = `${at} > [${OFF}] { display: none !important; }`
  drawnOf.set(view.dom, {
    screen: () => {
      const seen = band && view.dom.isConnected ? onScreen() : null
      return seen && { first: seen.first, last: seen.last }
    },
    show,
  })
  view.dom.addEventListener("keydown", keyed, true)
  view.dom.addEventListener("beforeinput", keyed, true)
  document.head.append(style, spaces)
  document.addEventListener("scroll", scrolled, { capture: true, passive: true })
  window.addEventListener("resize", follow)
  // Once the note is on the page: drawn round a caret at the end before it
  // was, the note opened on blank space until it was scrolled.
  const settle = (): void => {
    if (view.isDestroyed) return
    if (view.dom.isConnected) follow()
    else requestAnimationFrame(settle)
  }
  return {
    // A jump out of the band (gg, G, a search, the outline) draws its
    // destination before the caret is put there: placed in a block that is not
    // drawn, the browser walked every hidden letter to find where it could
    // show, seconds on a long note. Only for a caret that moved: one left far
    // from the screen stays where it is until it does.
    ahead: (state) => {
      const index = state.selection.$head.index(0)
      const before = last
      const went = !before || caretWent(before, state)
      // Asked to show its caret (a jump, an Undo, a key): gone to even when the caret itself is where it was, as
      // when the same heading is pressed again in the contents after scrolling away from it.
      const show = asks(state) !== asked
      asked = asks(state)
      last = state
      // A stretch picked across the drawn blocks (⌘A, a long ⇧-click) has its drawn part to show where the screen
      // is: gone to its far end with nothing asking, the screen was left on empty space for a frame.
      const edges = show || state.selection.empty || !band ? null : drawnEdges()
      const across = !!edges && state.selection.to >= edges[0] && state.selection.from <= edges[1]
      // And a note that grows long while open (Undo bringing back a whole
      // long note): drawn round the caret before its blocks arrive, or every
      // one of them was laid out, and the selection placed across them all.
      if ((went || show) && !across && (!band || index < band[0] || index > band[1])) {
        if (band) (measure(), letGo(index - AROUND, index + AROUND))
        // As many elements as now (the note's blocks, and what is drawn among them), with the blocks this change adds.
        draw(index - AROUND, index + AROUND, before && blocks().length ? blocks().length + state.doc.childCount - before.doc.childCount : Infinity)
        leap = show ? "shown" : "set"
        early = true
      }
    },
    update: (previous) => {
      // And it lands at once: eased over tens of thousands of pixels, while
      // the band moved under the glide, it stopped far short of the caret.
      const scroller = view.dom.parentElement
      const leapt = leap
      if (leap && scroller) {
        scroller.style.scrollBehavior = "auto"
        requestAnimationFrame(() => (scroller.style.scrollBehavior = ""))
      }
      leap = false
      if (!view.dom.hasAttribute("data-long")) {
        early = false
        return band ? clear() : undefined
      }
      // Where the caret went, without measuring anything, so a key stays cheap.
      // Near either edge of the band it moves: the arrow keys never reach a
      // block that is not drawn. Only when the caret or the words moved: a
      // change that leaves both (a mark redrawn) pulled the band back to a
      // caret left far from the screen, which went blank.
      const index = view.state.selection.$head.index(0)
      const count = blocks().length
      const moved = caretWent(previous, view.state)
      if (!band || early) {
        early = false
        draw(index - AROUND, index + AROUND)
        // The browser told the selection where the drawn blocks now are (a change that only asks for the caret to
        // be shown hands it nothing), and the screen goes with a caret that asked to be shown, in the same breath.
        if (leapt) resync()
        if (leapt === "shown") bring()
        requestAnimationFrame(settle)
      } else if (band[1] > count - 1 || (moved && index >= band[0] && index <= band[1] && ((index - band[0] < SLACK && band[0] > 0) || (band[1] - index < SLACK && band[1] < count - 1)))) {
        // Only for a caret among the drawn blocks, near their edge. One outside them was left where it is on
        // purpose (`ahead`): ⌘A's far end took the drawn blocks to the note's last lines, and the screen went blank.
        const top = onScreen()
        shift(index - AROUND, index + AROUND, top?.anchor ?? null, top?.at)
      }
    },
    destroy: () => {
      unclamp()
      drawnOf.delete(view.dom)
      made.disconnect()
      view.dom.removeEventListener("keydown", keyed, true)
      view.dom.removeEventListener("beforeinput", keyed, true)
      style.remove()
      spaces.remove()
      document.removeEventListener("scroll", scrolled, { capture: true })
      window.removeEventListener("resize", follow)
    },
  }
}

/**
 * A very long document opens quickly.
 *
 * Each code block and callout, as it is first drawn, asks the browser where
 * the selection is, and the browser lays out the whole document to answer.
 * Once per block, on a megabyte note, that was most of a minute. So while
 * those blocks are being drawn the document is taken off the page, where
 * there is nothing to lay out, and put back straight after.
 *
 * It is marked too, so the stylesheet lays out only the blocks near the screen.
 */
export const LongDocument = Extension.create({
  name: "longDocument",

  addProseMirrorPlugins() {
    const editor = this.editor
    const name = `long-${++made}`
    let near: ReturnType<typeof nearScreen> | undefined
    return [
      new Plugin<number>({
        key: shown,
        state: { init: () => 0, apply: (tr, count) => (tr.scrolledIntoView ? count + 1 : count) },
        props: {
          // Read with each new state before its selection reaches the page: the
          // one moment to draw where the caret is going.
          attributes: (state): Record<string, string> => {
            if (!long(state)) return {}
            near?.ahead(state)
            return { "data-long": name }
          },
          // ⌘↑ and ⌘↓ are left to the browser elsewhere, which would stop at
          // the last block drawn: here they go to the true start and end.
          handleKeyDown: (view, event) => {
            if (!long(view.state) || !event.metaKey || event.altKey || event.ctrlKey) return false
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false
            const { doc, selection } = view.state
            const to = event.key === "ArrowUp" ? Selection.atStart(doc) : Selection.atEnd(doc)
            const next = event.shiftKey ? TextSelection.between(selection.$anchor, to.$head) : to
            view.dispatch(view.state.tr.setSelection(next).scrollIntoView())
            return true
          },
        },
        view: (view) => {
          let views = view.props.nodeViews
          let away = false
          near = nearScreen(view, name)
          const { update, destroy } = near
          const aside = (): void => {
            const parent = view.dom.parentNode
            // Never while it holds the caret (Undo bringing back a long note):
            // taken off the page, it lost it. Its far blocks are hidden by then
            // (`ahead`), so there is little to lay out.
            if (away || !parent || !view.dom.isConnected || view.hasFocus()) return
            const next = view.dom.nextSibling
            away = true
            view.dom.remove()
            setTimeout(() => {
              away = false
              if (!view.isDestroyed && !view.dom.parentNode) parent.insertBefore(view.dom, next?.parentNode === parent ? next : null)
              // Asked to take the caret while it was away.
              if (editor.options.autofocus && !view.hasFocus()) editor.commands.focus(editor.options.autofocus)
            })
          }
          return {
            // When its blocks are drawn: on mounting, or when a page read from
            // Markdown arrives after the editor was made.
            update: (_view, previous) => {
              const drawn = view.props.nodeViews !== views
              views = view.props.nodeViews
              if (long(view.state) && (drawn || !long(previous))) aside()
              update(previous)
            },
            destroy,
          }
        },
      }),
    ]
  },
})
