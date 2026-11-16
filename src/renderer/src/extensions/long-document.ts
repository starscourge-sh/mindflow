import { Extension, type Editor } from "@tiptap/core"
import { AllSelection, Plugin, PluginKey, Selection, TextSelection, type EditorState } from "@tiptap/pm/state"
import { DecorationSet, type EditorView } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

/** Past this many positions (about 60,000 words) a document counts as long. */
const LONG = 200_000
export const long = (state: EditorState): boolean => state.doc.content.size > LONG

/**
 * Told on a long note's own element each time the blocks drawn change (`detail`: the first and last drawn, by
 * place among its elements, or null when every block is drawn): what is worked out only for the blocks drawn
 * (code's colours, extensions/code-colours.ts) is worked out for those that came.
 */
export const DRAWN = "mf:drawn"

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

/** What a block's height is guessed from, in px: the column's width, the size of its type, and a letter's width. */
type Column = { width: number; em: number; letter: number }

const HEADING = [1.5, 1.25, 1.125, 1, 1, 1]
/** Lines a run of `chars` letters takes in `width`, with `breaks` line breaks of its own; a line loses about a word's width to wrapping. */
const linesOf = (chars: number, breaks: number, width: number, letter: number): number => breaks + Math.max(1, Math.ceil((chars * letter) / Math.max(letter * 8, width - letter * 5)))

/**
 * How tall a block's own box will be once drawn, near enough, from its words
 * and the column's width: nothing on the page is asked. The numbers are the
 * stylesheet's (a paragraph's line is 1.6 of its type, a code line 1.4 of
 * 0.875). The air between it and the next block is not in it: that is learnt
 * from the blocks that are drawn (`nearScreen`).
 */
function tallOf(node: ProseMirrorNode, column: Column, width = column.width): number {
  const { em, letter } = column
  const name = node.type.name
  if (name === "codeBlock") {
    // Its code wraps where the block ends; a line of it is 1.4 of 0.875 of the type, in a box padded top and bottom.
    const inside = Math.max(em * 8, width - em * 2)
    let rows = 0
    for (const row of node.textContent.split("\n")) rows += Math.max(1, Math.ceil((row.length * em * 0.875 * 0.6) / inside))
    return rows * em * 0.875 * 1.4 + em * 5.9
  }
  if (node.isTextblock) {
    const size = name === "heading" ? (HEADING[Number(node.attrs.level ?? 1) - 1] ?? 1) : 1
    let breaks = 0
    node.forEach((child) => void (child.type.name === "hardBreak" && breaks++))
    return linesOf(node.content.size, breaks, width, letter * size) * em * size * (name === "heading" ? 1.3 : 1.6)
  }
  if (name === "table") {
    // Each row is as tall as its tallest cell; a column is never narrower than 160px (the table scrolls sideways past the page).
    let tall = 0
    node.forEach((row) => {
      const cell = Math.max(160, width / Math.max(1, row.childCount)) - em * 1.5
      let most = em * 1.6
      row.forEach((one) => {
        let inside = 0
        one.forEach((part) => void (inside += tallOf(part, column, cell)))
        most = Math.max(most, inside)
      })
      tall += most + em
    })
    // Measured: a table's cells are wider than their share of the column says, so its rows are shorter.
    return tall * 0.82
  }
  if (name === "bookmark") return em * 11.3
  if (name === "imagePlaceholder") return em * 6.2
  if (name === "horizontalRule") return 1
  if (name === "image") return Number(node.attrs.height) || em * 18
  if (node.isLeaf || !node.childCount) return em * 3
  // A list, a quote, a callout, a fold: its parts one under another, set in a little from the column's edge.
  const list = name === "bulletList" || name === "orderedList" || name === "taskList"
  const inner = list || name === "blockquote" ? width - em * 1.5 : width
  let tall = 0
  node.forEach((child, _offset, index) => void (tall += tallOf(child, column, inner) + (index && !list && child.type.name === "paragraph" ? em * 1.25 : 0)))
  return tall
}

/** A letter's width in the note's own type, from a line of ordinary words: asked of a canvas, not of the page. */
function letterOf(font: string, em: number): number {
  const sample = "The quick brown fox jumps over the lazy dog, and then it reads forty more pages before bed."
  const context = document.createElement("canvas").getContext("2d")
  if (!context) return em * 0.5
  context.font = font
  const wide = context.measureText(sample).width
  return wide > 0 ? wide / sample.length : em * 0.5
}

/** The column of the last long note drawn in this window: the next one is most likely as wide. */
let lastColumn: Column | null = null

/** Of `count` elements down the page (the `i`th is `at(i)`), from `low` on, the first whose bottom reaches `y`: by halves. */
function below(count: number, at: (i: number) => Element, y: number, low = 0): number {
  let high = count - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (at(middle).getBoundingClientRect().bottom < y) low = middle + 1
    else high = middle
  }
  return low
}

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

/**
 * A long note's blocks as tall as each was last drawn, to be kept for the next time it is opened: by block, with
 * each block's size in the note to know it by (-1 for a block never drawn), the column they were drawn in, and
 * the air learnt between blocks of each kind ("" for all kinds), so the blocks never drawn are guessed the same.
 */
export type KeptHeights = { width: number; em: number; sizes: number[]; talls: number[]; airs: [kind: string, sum: number, n: number][] }

/** What the rest of the app may ask of a long note's drawn blocks, by the editor's own element. */
const drawnOf = new WeakMap<Element, { screen: () => { first: number; last: number } | null; show: (index: number) => void; kept: () => KeptHeights | null; take: (kept: KeptHeights) => void }>()

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

/** How tall each block of a long note was last drawn, to keep as the note is left; null for a note that is not long, or not drawn yet. */
export const heightsOf = (editor: Editor): KeptHeights | null => (editor.isDestroyed ? null : (drawnOf.get(editor.view.dom)?.kept() ?? null))

/** The heights kept when a long note was last open, given back as it opens: its page is as tall as it was, before anything is scrolled to. */
export const takeHeights = (editor: Editor, kept: KeptHeights): void => void (editor.isDestroyed || drawnOf.get(editor.view.dom)?.take(kept))

/**
 * How far a long note has scrolled the scroller it is in by itself, in all, as it puts its sizes right (`rest`).
 * Whoever keeps the note's place reads it at each scroll: what the scroller moved by since the last reading that is
 * not in this is someone else's doing (a hand, a jump, the app sending the note to its top). It was once only where
 * the note last left the scroller, and a scroll set by the app to the note's very top, where the note puts its
 * sizes right in the same breath, was taken for the note's own: the kept place pulled the note back from it.
 */
const ownScrolls = new WeakMap<Element, number>()
export const scrolledItself = (scroller: Element): number => ownScrolls.get(scroller) ?? 0

/**
 * A note put back where it was left is held there by whoever put it back (lib/note-place.ts) until the person moves
 * it, by the note's own element: meanwhile the note holds nothing of its own (`keep`). Both at once, each held a
 * block of its own, one by the space kept above and one by a scroll, and the note opened again some blocks and
 * hundreds of pixels from where it was left (qa/long-note-held.mjs).
 */
const placesHeld = new WeakMap<Element, () => boolean>()
export const placeHeld = (dom: Element, held: (() => boolean) | null): void => void (held ? placesHeld.set(dom, held) : placesHeld.delete(dom))

/** The keys the browser itself answers where its selection is, beside the letters: those that move it or rub out. */
const LANDS = new Set(["Enter", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Process", "Dead"])

/** The mark on a block that is off the page. */
const OFF = "data-off"
/** The mark on a long note while a change's blocks arrive, before they are marked: none of them is laid out. */
const ARRIVING = "data-arriving"

/**
 * Blocks either side of the screen kept drawn, and how close the screen or the caret may come to the edge of them.
 * Every drawn block is laid out in full, so each move of the drawn blocks costs what its new blocks cost to lay
 * out: they are moved a few at a time (`STEP` further each side than they reach now), and a screen sent somewhere
 * far in one step (a hard push of the wheel, a jump, the thumb dragged) gets only the blocks round it (`NEAR`),
 * the rest as the page rests.
 */
const AROUND = 90
const SLACK = 45
const NEAR = 40
const STEP = 30
/** How many blocks in from the drawn edge a caret left behind is told to the browser, when it must be told one. */
const PARK = 20
/** A block never drawn is taken to be this tall until the column's width is known, and its height guessed from that. */
const GUESS = 32
/** How many blocks of a kind the air between blocks is learnt from. */
const AIR = 60
/** How many widths of column a note's learnt heights are kept for. */
const WIDTHS = 4

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
function nearScreen(view: EditorView): { view: EditorView; release: () => void; chose: () => void; edges: () => [number, number] | null; ahead: (state: EditorState) => void; update: (previous: EditorState) => void; destroy: () => void } {
  // Which blocks are drawn, and the space kept for the rest. A block off the
  // page carries a mark, and one rule in main.css that never changes hides the
  // marked: moving the drawn blocks then touches only the blocks that change
  // sides. (The rule used to name the drawn ones by their place, `:nth-child`,
  // and was written again at each move: every rewriting had the browser work
  // out the look of the whole window again, about 70 ms on a 7,000-block note
  // whatever moved, several times a second in a fast scroll.) The space kept
  // is the height of the two places for a caret at the note's ends (`ends`,
  // below), set on each: a sheet of its own, written again at each move, still
  // cost about 25 ms of styles a time, where showing a block costs 1.
  let band: [number, number] | null = null
  let spaced: [number, number] = [0, 0]
  // What the space kept above is out by, on purpose (`hold`): put right when the scrolling comes to rest.
  let slip = 0
  // The drawn blocks have just gone to a far caret: "shown" when the change asked for its caret to be shown.
  let leap: false | "shown" | "set" = false
  // How many asks to show the caret had been counted in the last state read.
  let asked = asks(view.state)
  // Drawn ahead of the blocks it is for: the space kept for them is worked out again once they are there.
  let early = false
  let last: EditorState | null = null
  const blocks = (): HTMLCollection => view.dom.children
  // How tall each block stands, from its top to the top of the next: as it was when last drawn, or, never drawn,
  // guessed from its own words and the column's width. (Never-drawn blocks were all taken to be as tall as the
  // drawn ones on average. The average moved with every block drawn, so the whole page's height moved with it, by
  // hundreds of thousands of pixels on a 7,017-block note: where the screen was in the note changed under a wheel
  // that had not, and the words went against it.) A drawn height is kept by the block itself, not its element,
  // which ProseMirror makes again: it holds for as long as the note is open and the block is not changed.
  //
  // And the air between a block and the next, which no guess holds: what the first blocks drawn of each kind stood
  // above their guess, then fixed, so the guesses for the rest of the note hold still.
  //
  // All of it is for one width of column, and kept by width: a pane sliding open passes through a dozen widths,
  // and what was learnt at the width it comes back to is still there (the last few widths are kept).
  type Known = { real: WeakMap<object, number>; guesses: WeakMap<ProseMirrorNode, number>; airs: Map<string, { sum: number; n: number }>; air: { sum: number; n: number } }
  const fresh = (): Known => ({ real: new WeakMap(), guesses: new WeakMap(), airs: new Map(), air: { sum: 0, n: 0 } })
  const widths = new Map<string, Known>()
  let known = fresh()
  let column: Column | null = lastColumn
  const nodeOf = (block: Element): ProseMirrorNode | undefined => (block as unknown as { pmViewDesc?: { node?: ProseMirrorNode } }).pmViewDesc?.node
  const rawOf = (node: ProseMirrorNode): number => {
    let raw = known.guesses.get(node)
    if (raw === undefined) known.guesses.set(node, (raw = column ? tallOf(node, column) : GUESS))
    return raw
  }
  const tall = (block: Element): number => {
    // Folded away under its heading: it takes no room, drawn or not.
    if (block.classList.contains("mf-fold-hidden")) return 0
    const node = nodeOf(block)
    const drawn = known.real.get(node ?? block)
    if (drawn !== undefined) return drawn
    // What is no block of the note (a mark ProseMirror puts between them) takes no room until it is seen to.
    if (!node) return 0
    const kind = known.airs.get(node.type.name)
    return rawOf(node) + (kind?.n ? kind.sum / kind.n : known.air.n ? known.air.sum / known.air.n : 0)
  }
  const learn = (block: Element, height: number): void => {
    const node = nodeOf(block)
    const key = node ?? block
    const had = known.real.get(key)
    // Before the block above it (set apart from the others, out of their run): no height to learn.
    if (had === height || height < 0) return
    known.real.set(key, height)
    if (!node || had !== undefined) return
    let kind = known.airs.get(node.type.name)
    if (!kind) known.airs.set(node.type.name, (kind = { sum: 0, n: 0 }))
    for (const one of [kind, known.air]) if (one.n < AIR) ((one.sum += height - rawOf(node)), one.n++)
  }
  // The column the guesses are made for: read with the sizes, and when it is another (the window resized, the
  // text made larger), what is known is what was learnt at that width, or nothing yet.
  const sizeUp = (): void => {
    const look = getComputedStyle(view.dom)
    const width = view.dom.clientWidth - (parseFloat(look.paddingLeft) || 0) - (parseFloat(look.paddingRight) || 0)
    const em = parseFloat(look.fontSize) || 16
    if (width <= 0) return
    if (!sized || !column || Math.abs(column.width - width) >= 1 || column.em !== em) {
      column = lastColumn = { width, em, letter: letterOf(`${look.fontStyle} ${look.fontWeight} ${em}px ${look.fontFamily}`, em) }
      const key = `${Math.round(width)} ${em}`
      const had = widths.get(key)
      widths.delete(key)
      widths.set(key, (known = had ?? fresh()))
      if (widths.size > WIDTHS) widths.delete(widths.keys().next().value as string)
    }
    sized = true
    handOver()
  }
  // The heights kept from the last time the note was open (`takeHeights`), used when this column is the one they
  // were read in (at once, or when the pane comes to that width): each goes to the block at the same place in
  // the note, if it is still as long.
  let sized = false
  let handed: KeptHeights | null = null
  const handOver = (): void => {
    const given = handed
    if (!given || !column || !sized || Math.abs(given.width - column.width) >= 1 || given.em !== column.em) return
    handed = null
    view.state.doc.forEach((node, _offset, index) => {
      const was = given.talls[index]
      if (was >= 0 && given.sizes[index] === node.nodeSize && known.real.get(node) === undefined) known.real.set(node, was)
    })
    for (const [kind, sum, n] of given.airs) {
      if (kind) known.airs.set(kind, { sum, n })
      else ((known.air.sum = sum), (known.air.n = n))
    }
  }
  const kept = (): KeptHeights | null => {
    if (!column || !sized || !band) return null
    const sizes: number[] = []
    const talls: number[] = []
    let any = false
    view.state.doc.forEach((node) => {
      const tall = known.real.get(node)
      sizes.push(node.nodeSize)
      talls.push(tall === undefined ? -1 : Math.round(tall * 100) / 100)
      if (tall !== undefined) any = true
    })
    return any ? { width: column.width, em: column.em, sizes, talls, airs: [["", known.air.sum, known.air.n], ...[...known.airs].map(([kind, one]): [string, number, number] => [kind, one.sum, one.n])] } : null
  }
  // Remember how tall the drawn blocks are, from where each next one starts.
  // Not while the note is off the page as it opens, or hidden with its pane:
  // every block reads as no height there, and the space kept above and below
  // came out as none, so the scrollbar lied and gg and G landed in the wrong place.
  const measure = (): void => {
    if (!band || !view.dom.isConnected || !(view.dom as HTMLElement).offsetHeight) return
    sizeUp()
    const all = blocks()
    const end = Math.min(band[1], all.length - 1)
    let before: HTMLElement | null = null
    for (let i = band[0]; i <= end; i++) {
      const here = all[i] as HTMLElement
      // Not laid out (folded away): it takes no room, and the block before it ends where the next laid-out one starts.
      if (!here.offsetParent) continue
      if (before) learn(before, here.offsetTop - before.offsetTop)
      before = here
    }
    // The note's last block has no next one to end at.
    if (before && end === all.length - 1) learn(before, before.offsetHeight)
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
    // Drawn elsewhere with nothing on the screen held (a jump: the screen goes there next), what was held may stand
    // anywhere now: it is chosen again, never held against (`keep`). Moved with the screen held, it is kept (`shift`).
    pin = null
    view.dom.dispatchEvent(new CustomEvent(DRAWN, { detail: [from, to] }))
    let above = 0
    let below = 0
    // Drawn ahead of a change, the page still holds the blocks from before it: a note emptied (⌘A and ⌫) and the
    // whole of it pasted back has one block on the page, and the band is thousands of blocks in. Only the blocks on
    // the page are counted; the space is worked out again once the change's blocks are there (`early`). Counting
    // the ones not there yet threw, before ProseMirror drew the paste: the page showed one block of the note.
    for (let i = 0; i < Math.min(from, all.length); i++) above += tall(all[i])
    for (let i = to + 1; i < all.length; i++) below += tall(all[i])
    spaced = [above, below]
    mark()
    // Nothing may stand above the note's first block: what the space is out by is put right now.
    if (from === 0 && slip) rest()
    else space()
  }
  // Only the two places' own heights change: no style but theirs is worked out again.
  const space = (): void => {
    fence()
    const room = [`${Math.max(0, spaced[0] + slip)}px`, `${spaced[1]}px`]
    ends.forEach((end, i) => void (end.style.height !== room[i] && (end.style.height = room[i])))
  }
  /**
   * The words on screen kept where they are when the blocks just drawn above them stand taller or shorter than
   * was guessed (`moved`: how far the block at the top of the screen went). The space kept above takes up the
   * difference, and the scroll is left alone. Scrolled back by the difference instead, as it used to be, the
   * wheel lost its place: a scroll set from here replaces what the wheel has moved since the frame began, so
   * the words jumped back against the wheel (319 of 1,020 frames of a push up a 7,017-block note) and more than
   * half of what the wheel sent was thrown away, so the note's end was never reached. What the space is out by
   * is put right when the scrolling comes to rest (`rest`), or at once where it cannot wait: at the note's
   * first block, which nothing may stand above, and when the space would have to be less than none.
   */
  const hold = (moved: number): void => {
    if (!band || Math.abs(moved) < 0.01) return
    slip -= moved
    if (band[0] === 0 || spaced[0] + slip < 0) rest()
    else space()
  }
  /**
   * The space kept above made what the sizes say, and the scroll moved by what it was out by: nothing on screen
   * moves. The browser's own way of holding the screen still when what is above it changes height is switched
   * off for a long note (`overflow-anchor`, below), so this is the one thing that scrolls: the browser does it
   * for a note that does not hold the keys and not for one that does, so with it on, a note opened again came
   * back twice as far on (scrolled here and by the browser), and left to the browser alone, a note being typed
   * in was not scrolled at all and its words jumped.
   */
  const rest = (): void => {
    if (!slip) return
    const by = -slip
    slip = 0
    space()
    const scroller = view.dom.parentElement
    if (!scroller) return
    const before = scroller.scrollTop
    scroller.scrollBy({ top: by, behavior: "instant" })
    ownScrolls.set(scroller, scrolledItself(scroller) + scroller.scrollTop - before)
  }
  const rested = (event: Event): void => {
    if (event.target instanceof Node && event.target.contains(view.dom)) rest()
  }
  /**
   * What the person is looking at, held still while what is above it changes height by itself: a link card filling
   * in, a picture arriving at its own size, a block drawn late, a fold opening above. It is the block under the
   * caret while the caret is on the screen, the block last pressed until the caret or the screen moves (a fold
   * opened by its arrow keeps its heading under the pointer), and else the block under the screen's top line: the
   * deepest block there, kept as where it stands in the scroller's content (`at`), which no scroll moves. Told
   * after each layout that changed the note's height, before it is painted, the block is put back by the change
   * measured, as when the drawn blocks move (`hold`). The browser does this for a short note; for a long one its
   * way is off (`overflow-anchor`, `rest`), and until this nothing did it: a link card filling in above the screen
   * carried the words 150 px down, and after a whole note pasted back, what grew above the caret (2,661 px of it
   * under a busy machine) carried the caret off the screen (qa/hold-the-screen.mjs, qa/whole-note-paste.mjs).
   */
  let pin: { el: Element; at: number } | null = null
  // How far down the drawn blocks a block stands: moved only by what is drawn above it changing height, never by a
  // scroll or by the space kept above the drawn blocks (`hold`, `rest`). Blocks drawn or taken off above it move it
  // too: that is the drawn blocks moving (`draw`), and what is held is chosen again then.
  const deep = (el: Element): number => el.getBoundingClientRect().top - view.dom.getBoundingClientRect().top
  /** The deepest drawn block at height `y`: the block there, or in a list, a quote or a table, its part at that height. */
  const blockAt = (y: number): Element | null => {
    const all = blocks()
    if (!band || !all.length) return null
    const last = Math.min(band[1], all.length - 1)
    type Part = { dom: Node; node?: ProseMirrorNode; children: Part[] }
    let part = (all[below(last + 1, (i) => all[i], y, Math.min(band[0], last))] as unknown as { pmViewDesc?: Part }).pmViewDesc
    while (part?.node && !part.node.isTextblock) {
      const parts = part.children.filter((one) => one.node?.isBlock && one.dom instanceof Element && one.dom.getClientRects().length)
      const next = parts[below(parts.length, (i) => parts[i].dom as Element, y)]
      if (!next || (next.dom as Element).getBoundingClientRect().top > y) break
      part = next
    }
    return part?.dom instanceof Element && part.dom.getClientRects().length ? part.dom : null
  }
  /** What is held from now on: the block under the press at `y`, or under the caret if it is on the screen, or under the screen's top line. */
  const choose = (y?: number): void => {
    pin = null
    const scroller = view.dom.parentElement
    if (!band || !scroller || !view.dom.isConnected || !(view.dom as HTMLElement).offsetHeight) return
    const box = scroller.getBoundingClientRect()
    const top = Math.max(box.top, 0)
    let el: Element | null = null
    if (y !== undefined) el = blockAt(y)
    else {
      const { $head } = view.state.selection
      const caret = view.nodeDOM($head.depth ? $head.before() : $head.pos)
      const shown = caret instanceof Element && caret.getClientRects().length ? caret.getBoundingClientRect() : null
      if (shown && shown.bottom > top && shown.top < Math.min(box.bottom, window.innerHeight)) el = caret as Element
    }
    el ??= blockAt(top)
    if (el) pin = { el, at: deep(el) }
  }
  /** The held block put back on the screen by what it moved since it was last seen. */
  const keep = (): void => {
    if (!band) return
    if (!pin || !pin.el.isConnected || !pin.el.getClientRects().length || placesHeld.get(view.dom)?.()) return choose()
    const moved = deep(pin.el) - pin.at
    if (Math.abs(moved) >= 0.5) hold(moved)
    pin.at = deep(pin.el)
  }
  const sizes = new ResizeObserver(keep)
  sizes.observe(view.dom)
  const pointed = (event: PointerEvent): void => {
    if (band && event.target instanceof Node && view.dom.parentElement?.contains(event.target)) choose(event.clientY)
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
    slip = 0
    pin = null
    view.dom.removeAttribute(ARRIVING)
    mark()
    view.dom.dispatchEvent(new CustomEvent(DRAWN, { detail: null }))
    for (const end of ends) end.style.height = "0px"
  }
  /** Shift the band, keeping the block at the top of the screen where it is, or where the sizes say it should be. */
  const shift = (from: number, to: number, anchor: Element | null, at?: number): void => {
    measure()
    const before = at ?? anchor?.getBoundingClientRect().top
    const was = pin
    letGo(from, to)
    draw(from, to)
    // Only when it is still drawn: a band moved far, after the caret, has nothing to keep still.
    if (anchor && before !== undefined && anchor.getClientRects().length) {
      hold(anchor.getBoundingClientRect().top - before)
      // Held where it was on the screen, so is everything under it: what was held stays held, read again among the
      // blocks drawn now. Not when the screen stood on space kept for blocks not drawn (`at`): its block is put where
      // the sizes say, not where it was.
      if (at === undefined && was?.el.isConnected && was.el.getClientRects().length) pin = { el: was.el, at: deep(was.el) }
    }
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
    // Among the drawn ones that are on the page: a change that took blocks off the note's end (a paste's last line
    // joined, two lines deleted there) leaves the drawn ones reaching past it until they are drawn again, and looked
    // for there, the window stopped on a block that was gone.
    const lastDrawn = Math.min(band[1], all.length - 1)
    const firstDrawn = Math.min(band[0], lastDrawn)
    const shown = all[firstDrawn].getBoundingClientRect()
    const end = all[lastDrawn].getBoundingClientRect()
    if (shown.top <= bottom && end.bottom >= top) {
      const find = (edge: number): number => below(lastDrawn + 1, (i) => all[i], edge, firstDrawn)
      const first = find(top)
      return { first, last: find(bottom), anchor: all[first] }
    }
    // Scrolled into the space kept for the others: counted from the remembered sizes.
    let y = shown.top - spaced[0]
    let first = 0
    for (let height = tall(all[0]); first < all.length - 1 && y + height < top; height = tall(all[first])) ((y += height), first++)
    const at = y
    let last = first
    while (last < all.length - 1 && y < bottom) y += tall(all[last++])
    return { first, last, anchor: all[first], at }
  }
  /**
   * The drawn blocks a step nearer to reaching `AROUND` blocks either side of `first`..`last` (the screen, or the
   * caret's block): the side that has come short gets `STEP` more, the other is cut back to `AROUND`.
   */
  const step = (first: number, last: number): [number, number] => {
    const [from, to] = band!
    return [first - from < SLACK ? Math.max(first - AROUND, from - STEP) : Math.max(from, first - AROUND), to - last < SLACK ? Math.min(last + AROUND, to + STEP) : Math.min(to, last + AROUND)]
  }
  /** The drawn blocks brought round the screen, when it has come near their edge: whether they moved. */
  const follow = (): boolean => {
    if (!band || !view.dom.isConnected) return false
    // What grew above the held block since it was last seen is held first, before the screen is read.
    keep()
    const seen = onScreen()
    if (!seen) return false
    const { first, last, anchor, at } = seen
    // Still well inside the band: nothing to change.
    if ((first - band[0] >= SLACK || band[0] === 0) && (band[1] - last >= SLACK || band[1] >= blocks().length - 1)) return false
    // Gone outside the drawn blocks altogether: only the blocks round the screen for now. Else a step further.
    if (at !== undefined) shift(first - NEAR, last + NEAR, anchor, at)
    else shift(...step(first, last), anchor)
    more()
    return true
  }
  // The rest of the blocks round the screen, a step at a time, each when the page has nothing else to do; and
  // once they are all there, how tall each stands is read, so it is known before the note is next moved or left.
  let resting = 0
  const more = (): void => {
    cancelIdleCallback(resting)
    resting = requestIdleCallback(() => void (view.isDestroyed || follow() || measure()), { timeout: 400 })
  }
  /**
   * The sizes read again and the space kept above and below worked out from them, the block at the top of the
   * screen kept where it is: once the note is first on the page (its column's width is known only then, and the
   * air between its blocks), and when the window changes size.
   */
  const respace = (): void => {
    if (!band || !view.dom.isConnected || follow()) return
    const top = onScreen()
    shift(band[0], band[1], top?.anchor ?? null, top?.at)
    more()
  }
  // What is held after a scroll is what is on the screen then.
  const scrolled = (event: Event): void => {
    if (!(event.target instanceof Node && event.target.contains(view.dom))) return
    follow()
    choose()
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
  // A press the note has not read yet. The browser puts its caret where a press lands at once, and the note reads it
  // a moment later (as `selectionchange`). As a long note opens that moment can be long, the page busy drawing it,
  // and anything that changed the note meanwhile (a link card's picture kept, a fold, the drawn blocks moving)
  // told the browser the note's selection from before the press again, over it: the press was lost, and the letters
  // typed next went to the note's first line (qa/long-note-press-early.mjs). Until the note has chosen a selection
  // since the press (read the press, or made one of its own: a picture picked, a key), its old one is not told over
  // the press, and the press is read straight after.
  const inner = view as unknown as { domObserver: { currentSelection: { eq: (sel: unknown) => boolean; clear: () => void }; flush: () => void }; domSelectionRange: () => unknown }
  const observer = inner.domObserver
  let pressed = false
  const press = (event: MouseEvent): void => void (event.button === 0 && (pressed = true))
  // The press read now, as the note reads the browser's selection when it is told it changed.
  const readPress = (): void => {
    if (view.isDestroyed || !pressed) return
    pressed = false
    observer.currentSelection.clear()
    observer.flush()
  }
  const unread = (): boolean => {
    if (!pressed) return false
    const selection = view.dom.ownerDocument.getSelection()
    if (view.hasFocus() && selection?.rangeCount && view.dom.contains(selection.anchorNode) && !observer.currentSelection.eq(inner.domSelectionRange())) {
      queueMicrotask(readPress)
      return true
    }
    pressed = false
    return false
  }
  view.dom.addEventListener("mousedown", press, true)
  const unclamp = keepSelectionDrawn(view, (anchor, head) => {
    if (unread()) return null
    const edges = view.dom.hasAttribute("data-long") ? drawnEdges() : null
    if (!edges) return [anchor, head]
    // No part of it drawn (a caret left behind as the screen went elsewhere): the browser is told a place that
    // stands in for it, some blocks in from the edge of the drawn ones nearest the caret, well off the screen
    // (`parked`, below). Told where it truly is, among blocks taken off the page, it looked through every hidden
    // block for somewhere to show it, each time it drew, and the window stopped answering for minutes. And told
    // nothing, as it once was while the note held the keys, the browser put a caret of its own at the note's very
    // first place the next time it had cause to (a press anywhere, the window coming to the front), and from then
    // on walked from there through every hidden block to the first drawn one each time it laid the page out or
    // was asked where the selection was: 5 to 12 seconds a time, ten times over for one press on "New tab". A
    // key lands at the true caret all the same: the note comes back to it first (`keyed`).
    if (Math.max(anchor, head) < edges[0] || Math.min(anchor, head) > edges[1]) {
      const at = parked(Math.max(anchor, head) < edges[0])
      return at === null ? null : [at, at]
    }
    // An end that is past the drawn blocks (⌘A, a long ⇧-click) is told as a place some blocks in from their edge,
    // as a caret left behind is: told as the edge itself, next to the hidden blocks, the browser looked through
    // every one of them for somewhere to show it, on every change (⌘A in a 7,017-block note: over a minute).
    // The screen is further in than that, so what it shows as picked is the same. Never past the other end.
    const inside = (at: number): number => Math.min(Math.max(at, edges[0]), edges[1])
    const keep = (at: number, other: number): number => {
      if (at >= edges[0] && at <= edges[1]) return at
      const before = at < edges[0]
      const near = parked(before)
      return near === null || (before ? near > other : near < other) ? other : near
    }
    return [keep(anchor, inside(head)), keep(head, inside(anchor))]
  })
  // Where a caret with no part drawn is told to the browser: the start of a block some way in from the drawn
  // edge nearest it. Off the screen (the drawn blocks reach further past it than
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
  // The drawn blocks moved: a note that holds the keys is told its selection again, as far as it is drawn now (a
  // range's new edge, the caret itself once its blocks are back), or the place that stands in for it. A note with
  // the keys is never left with no selection: the browser then makes one of its own, at the note's first place.
  const resync = (): void => {
    if (view.hasFocus() && drawnEdges()) focus()
  }
  // The browser's selection taken out of this note.
  const release = (): void => {
    if (held()) view.dom.ownerDocument.getSelection()?.removeAllRanges()
  }
  // Whether the note is off the page whole: not in it, hidden with what holds it, or held as a picture under the
  // page taking its place (`inert`, components/haligtree/page-swap.tsx). It can take no keys then.
  const away = (): boolean => !view.dom.isConnected || !!view.dom.closest("[inert]") || !view.dom.checkVisibility()
  // A note that is off the page whole keeps no selection. All its blocks are off the page then, and a selection
  // left among them (the caret's, a range's, the stand-in's) is looked for through every one of them each time
  // the browser lays out: with the caret deep in a long note, a press that changed the page stopped the window
  // for seconds. What hides a note is said on something above it (an attribute: inert, hidden, a style, a class),
  // so those are watched, and the selection is let go of before the browser next lays the page out.
  //
  // Whether a change took the note off the page is read from the changed box itself (inert, hidden, not displayed
  // by its own style, or wearing the app's class for that), and only those four things are listened for. Asked of
  // the browser instead (where the selection is, whether the note can be seen), it brought every style in the
  // window up to date there and then, in the middle of the page's own work: 140 ms with a long note open, on any
  // change at all to any box above the note.
  const hides = (above: Node): boolean => above instanceof HTMLElement && (above.inert || above.hidden || above.style.display === "none" || above.style.contentVisibility === "hidden" || above.classList.contains("hidden"))
  const hidden = new MutationObserver((records) => void (records.some((record) => hides(record.target)) && release()))
  const watchAbove = (): void => {
    hidden.disconnect()
    for (let above = view.dom.parentElement; above; above = above.parentElement) hidden.observe(above, { attributes: true, attributeFilter: ["inert", "hidden", "style", "class"] })
  }
  // A place a caret can be, kept on the page at each end of the note, beside it in its scroller. Whenever the
  // browser's selection is at a place no caret can be (the edge of a box: where a press on bare chrome puts it,
  // or where an editor that held it has just been taken away), the browser looks from there, forward and back
  // through the page, letter by letter, for the nearest place one can be, each time it lays out. With a long
  // note in its way that was every block of the note that is not drawn: 5 to 12 seconds a time, half a minute
  // and more for one press. The walk now ends at the note's edge. Each is a line break in a box as tall as the
  // blocks not drawn on its side (`space`): nothing to see, nothing to press, outside the note's own words, and
  // never what the browser holds still as the page changes above it (the note itself is not either).
  const ends = [0, 1].map(() => {
    const end = document.createElement("span")
    end.setAttribute("data-long-end", "")
    end.setAttribute("aria-hidden", "true")
    end.contentEditable = "false"
    end.style.cssText = "display:block;flex:none;height:0;overflow:hidden;overflow-anchor:none;pointer-events:none"
    end.append(document.createElement("br"))
    return end
  })
  const fence = (): void => {
    if (!view.dom.parentElement) return
    if (ends[0].nextSibling !== view.dom) view.dom.before(ends[0])
    if (ends[1].previousSibling !== view.dom) view.dom.after(ends[1])
  }
  // Given the keys with no selection in it, the browser puts a caret of its own at the note's very first place:
  // off the page in a long note scrolled down, and it looked through every hidden block from there for somewhere
  // to show it (seconds). So a selection is in the note before the keys are: the note's own, or with none of
  // that drawn, the place that stands in for it. A note that cannot take the keys is given none, and one that
  // did not get them keeps none.
  const focus = view.focus.bind(view)
  view.focus = (): void => {
    if (band && !view.hasFocus() && !held() && !away()) {
      const { anchor, head } = view.state.selection
      ;(view as unknown as { docView: Desc }).docView.setSelection(anchor, head, view)
    }
    focus()
    if (band && !view.hasFocus()) release()
  }
  /** Draw the blocks round block `index`, if it is not among the drawn ones. */
  const show = (index: number): void => {
    if (!band || !view.dom.isConnected || (index >= band[0] && index <= band[1])) return
    measure()
    letGo(index - NEAR, index + NEAR)
    draw(index - NEAR, index + NEAR)
    resync()
    more()
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
    // Where the caret is: a press not read yet is read first.
    if (unread()) readPress()
    const { from, to, $head } = view.state.selection
    const edges = drawnEdges()
    if (!edges || (to >= edges[0] && from <= edges[1])) return
    show($head.index(0))
    focus()
    bring()
  }
  // Edit > Select All from the menu bar reaches the page as an event that a list may take (lib/select-all.ts).
  // Left alone, the page runs the browser's own "select all" (src/preload), which puts the selection at the
  // note's very first and last places, among blocks that are not drawn, and the browser looks through every
  // hidden block for where to show each end. A long note that holds the keys takes it, and picks itself whole
  // as ⌘A does.
  const pickAll = (event: Event): void => {
    if (!band || event.defaultPrevented || !view.hasFocus()) return
    event.preventDefault()
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
  }
  drawnOf.set(view.dom, {
    screen: () => {
      const seen = band && view.dom.isConnected ? onScreen() : null
      return seen && { first: seen.first, last: seen.last }
    },
    show,
    kept,
    // Given before the note is first measured, they wait for that (`sizeUp`); after, the page is spaced by them now.
    take: (kept) => {
      handed = kept
      if (sized) (handOver(), respace())
    },
  })
  view.dom.addEventListener("keydown", keyed, true)
  view.dom.addEventListener("beforeinput", keyed, true)
  document.addEventListener("scroll", scrolled, { capture: true, passive: true })
  document.addEventListener("scrollend", rested, { capture: true, passive: true })
  document.addEventListener("pointerdown", pointed, true)
  window.addEventListener("resize", respace)
  window.addEventListener("haligtree:select-all", pickAll)
  // Once the note is on the page: drawn round a caret at the end before it
  // was, the note opened on blank space until it was scrolled.
  const settle = (): void => {
    if (view.isDestroyed) return
    if (view.dom.isConnected) (watchAbove(), fence(), respace())
    else requestAnimationFrame(settle)
  }
  return {
    view,
    release,
    // The note chose a selection of its own (it read the press, or made one): the press is no longer waiting.
    chose: () => void (pressed = false),
    edges: drawnEdges,
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
      //
      // Only a caret that asked to be shown takes the drawn blocks with it, once there are drawn blocks. One that
      // was only set (the caret put back where it was left as a note opens, a change landing in its block from
      // elsewhere) took them away from the screen, which stood on empty space until they came back by guess: a
      // note left far down opened again some 200 blocks from where it was left. A caret set off the drawn blocks
      // is not told to the browser (`keepSelectionDrawn`), and a key pressed there brings the note to it (`keyed`).
      if ((show || (went && !band)) && !across && (!band || index < band[0] || index > band[1])) {
        if (band) (measure(), letGo(index - NEAR, index + NEAR))
        // As many elements as now (the note's blocks, and what is drawn among them), with the blocks this change adds:
        // counted from the document the page shows, not the last long one seen (a note emptied, then pasted back
        // whole, was last seen long before it was emptied).
        const showing = (view as unknown as { docView: { node: ProseMirrorNode } }).docView.node
        const adds = state.doc.childCount - showing.childCount
        draw(index - NEAR, index + NEAR, blocks().length ? blocks().length + adds : Infinity)
        // The blocks a change brings come with no mark: when it brings more than a drawn band holds (a whole note
        // pasted back, an Undo bringing one back), none of the note's blocks is laid out until they are marked
        // (`update`, before anything is shown). Made visible, the largest note pasted back was laid out in full,
        // and again each time the browser was told where the selection is, before the drawn blocks were known.
        if (adds > 2 * AROUND) view.dom.setAttribute(ARRIVING, "")
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
        draw(index - NEAR, index + NEAR)
        view.dom.removeAttribute(ARRIVING)
        // The browser told the selection where the drawn blocks now are (a change that only asks for the caret to
        // be shown hands it nothing), and the screen goes with a caret that asked to be shown, in the same breath.
        if (leapt) resync()
        if (leapt === "shown") bring()
        requestAnimationFrame(settle)
      } else if (band[1] > count - 1 || (moved && index >= band[0] && index <= band[1] && ((index - band[0] < SLACK && band[0] > 0) || (band[1] - index < SLACK && band[1] < count - 1)))) {
        // Only for a caret among the drawn blocks, near their edge. One outside them was left where it is on
        // purpose (`ahead`): ⌘A's far end took the drawn blocks to the note's last lines, and the screen went blank.
        const top = onScreen()
        shift(...step(index, index), top?.anchor ?? null, top?.at)
      }
      // A caret moved, or asked to be shown, is where the person is now: what to hold is chosen once the change is done
      // with and ProseMirror has brought the screen to the caret (held against too, a fold toggled by its command moved
      // the screen twice: scrolled to the caret, then held). A change that left the caret where it was and asked for
      // nothing (a card's preview kept, a fold opened by its arrow or for all, another window's edit) is held against.
      if (moved || leapt || !pin || asks(view.state) !== asks(previous)) queueMicrotask(choose)
    },
    destroy: () => {
      unclamp()
      drawnOf.delete(view.dom)
      made.disconnect()
      hidden.disconnect()
      for (const end of ends) end.remove()
      view.dom.removeEventListener("keydown", keyed, true)
      view.dom.removeEventListener("beforeinput", keyed, true)
      view.dom.removeEventListener("mousedown", press, true)
      document.removeEventListener("scroll", scrolled, { capture: true })
      document.removeEventListener("scrollend", rested, { capture: true })
      document.removeEventListener("pointerdown", pointed, true)
      sizes.disconnect()
      window.removeEventListener("resize", respace)
      window.removeEventListener("haligtree:select-all", pickAll)
      cancelIdleCallback(resting)
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
        state: {
          init: () => 0,
          apply: (tr, count) => {
            // A selection chosen by the note (a press read, a picture picked, a key): no press is left unread.
            if (tr.selectionSet) near?.chose()
            return tr.scrolledIntoView ? count + 1 : count
          },
        },
        props: {
          // Read with each new state before its selection reaches the page: the
          // one moment to draw where the caret is going.
          attributes: (state): Record<string, string> => {
            if (!long(state)) return {}
            near?.ahead(state)
            return { "data-long": name }
          },
          // ⇧-click with the selection's fixed end left behind in blocks no longer drawn. The browser stretches its
          // own selection to the click, and it has none there to stretch (a selection with no part drawn is not
          // told to it): it started from the note's very first place, looking through every hidden block on the
          // way (23 seconds on a 7,017-block note), and what was picked began at the first drawn block, not at
          // the caret. Picked here instead, from where the selection was begun to the place clicked.
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (!event.shiftKey || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || !long(view.state)) return false
              const edges = near?.edges()
              const { $anchor } = view.state.selection
              if (!edges || ($anchor.pos >= edges[0] && $anchor.pos <= edges[1])) return false
              const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
              if (!at) return false
              event.preventDefault()
              view.dispatch(view.state.tr.setSelection(TextSelection.between($anchor, view.state.doc.resolve(at.pos))))
              view.focus()
              return true
            },
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
          // What is known of a note's drawn blocks is the note's, made once and kept until the note itself goes.
          // ProseMirror makes every plugin's view again each time a plugin is added to an open note or taken
          // from it (a menu, a preview: it happens within a note's first second), and made again with it, the
          // drawn blocks went back to the caret, the screen stood on empty space until they came back to it by
          // guess, and every height learnt, or kept from the last time the note was open, was thrown away.
          const mine = near?.view === view ? near : (near?.destroy(), (near = nearScreen(view)))
          const { update } = mine
          const aside = (): void => {
            const parent = view.dom.parentNode
            // Never while it holds the caret (Undo bringing back a long note):
            // taken off the page, it lost it. Its far blocks are hidden by then
            // (`ahead`), so there is little to lay out.
            if (away || !parent || !view.dom.isConnected || view.hasFocus()) return
            const next = view.dom.nextSibling
            away = true
            // Its selection goes first: taken off the page with one in it, the browser kept it at the place the
            // note had been, a place no caret can be, and looked from there through the note's hidden blocks.
            mine.release()
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
            // Asked a moment later, when it is known whether the note went or only its plugins changed.
            destroy: () => void queueMicrotask(() => void (view.isDestroyed && (mine.destroy(), near === mine && (near = undefined)))),
          }
        },
      }),
    ]
  },
})
