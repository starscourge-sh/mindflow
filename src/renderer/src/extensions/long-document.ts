import { Extension } from "@tiptap/core"
import { Plugin, Selection, TextSelection, type EditorState } from "@tiptap/pm/state"
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

/** Blocks either side of the screen kept drawn, and how close the screen or the caret may come to the edge of them. */
const AROUND = 150
const SLACK = 50
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
  const style = document.createElement("style")
  const heights = new WeakMap<Element, number>()
  let band: [number, number] | null = null
  let spaced: [number, number] = [0, 0]
  let leap = false
  let last: EditorState | null = null
  const at = `.tiptap.ProseMirror.mindflow-editor[data-long="${name}"]`
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
  const draw = (from: number, to: number): void => {
    const all = blocks()
    from = Math.max(0, from)
    to = Math.min(all.length - 1, to)
    band = [from, to]
    let above = 0
    let below = 0
    for (let i = 0; i < from; i++) above += tall(all[i])
    for (let i = to + 1; i < all.length; i++) below += tall(all[i])
    spaced = [above, below]
    style.textContent =
      `${at} > :nth-child(-n+${from}), ${at} > :nth-child(n+${to + 2}) { display: none !important; }` +
      `${at}::before { content: ""; display: block; height: ${above}px; }` +
      `${at}::after { content: ""; display: block; height: ${below}px; }`
  }
  const clear = (): void => {
    band = null
    style.textContent = ""
  }
  /** Shift the band, keeping the block at the top of the screen where it is, or where the sizes say it should be. */
  const shift = (from: number, to: number, anchor: Element | null, at?: number): void => {
    measure()
    const before = at ?? anchor?.getBoundingClientRect().top
    draw(from, to)
    const scroller = view.dom.parentElement
    // Only when it is still drawn: a band moved far, after the caret, has nothing to keep still.
    // At once, never eased: the words have to stay where they were.
    if (anchor && before !== undefined && scroller && anchor.getClientRects().length) scroller.scrollBy({ top: anchor.getBoundingClientRect().top - before, behavior: "instant" })
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
    const end = all[band[1]].getBoundingClientRect()
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
  document.head.appendChild(style)
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
      const went = !last || !state.selection.eq(last.selection) || state.doc !== last.doc
      last = state
      if (went && band && (index < band[0] || index > band[1])) {
        measure()
        draw(index - AROUND, index + AROUND)
        leap = true
      }
    },
    update: (previous) => {
      // And it lands at once: eased over tens of thousands of pixels, while
      // the band moved under the glide, it stopped far short of the caret.
      const scroller = view.dom.parentElement
      if (leap && scroller) {
        scroller.style.scrollBehavior = "auto"
        requestAnimationFrame(() => (scroller.style.scrollBehavior = ""))
      }
      leap = false
      if (!view.dom.hasAttribute("data-long")) return band ? clear() : undefined
      // Where the caret went, without measuring anything, so a key stays cheap.
      // Near either edge of the band it moves: the arrow keys never reach a
      // block that is not drawn. Only when the caret or the words moved: a
      // change that leaves both (a mark redrawn) pulled the band back to a
      // caret left far from the screen, which went blank.
      const index = view.state.selection.$head.index(0)
      const count = blocks().length
      const moved = view.state.doc !== previous.doc || !view.state.selection.eq(previous.selection)
      if (!band) {
        draw(index - AROUND, index + AROUND)
        requestAnimationFrame(settle)
      } else if (band[1] > count - 1 || (moved && ((index - band[0] < SLACK && band[0] > 0) || (band[1] - index < SLACK && band[1] < count - 1)))) {
        const top = onScreen()
        shift(index - AROUND, index + AROUND, top?.anchor ?? null, top?.at)
      }
    },
    destroy: () => {
      style.remove()
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
      new Plugin({
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
            if (away || !parent || !view.dom.isConnected) return
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
