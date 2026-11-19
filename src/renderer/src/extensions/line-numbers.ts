import { Extension } from "@tiptap/core"
import { NodeSelection, Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model"
import { DRAWN } from "./long-document"
import { LISTS, QUOTE, itemLines, linesIn } from "@/lib/note-size"

/**
 * Line numbers in a note's left margin, as Obsidian draws them: one number per line a person reads as one.
 *
 * A paragraph is one however it wraps, and so is a heading, a picture, a table, a code block, a divider, a callout
 * and a whole column layout; each item of a list is one, nested ones too, and each paragraph of a quote. Empty
 * paragraphs count, as empty lines do in Obsidian. With “Relative” on they count out from the caret's line, Vim's
 * number and relativenumber together: the caret's own line shows its real number, the rest how far away they are.
 * With Vim's “Jump by line numbers” on, its counts (`4j`, `7G`) go by these same lines (`caretLine`, `lineSpan`), so a
 * jump lands where the margin says, shown or not.
 *
 * The numbers are drawn in a layer of their own beside the note, never in it: nothing is added to the note's page,
 * so ProseMirror sees no change and the words never move. Each number stands on the baseline of its block's first
 * line: its row is set in that line's own size and height, so the small number sits on the same baseline whatever
 * the font. Only the blocks that are drawn are numbered (long-document.ts draws a band of a long note): a block's
 * number comes from how many lines the blocks before it hold, kept by block and counted again only from the first
 * block a change touched, never by walking the note on each key. Moving the caret only rewrites the numbers' words.
 */

const key = new PluginKey("lineNumbers")

/**
 * Told on a note's own element when its column of numbers comes, goes or changes width, once it stands where it
 * will: whatever is placed beside the numbers (the block handle, haligtree-editor.tsx) is placed again then.
 */
export const LINES = "mf:lines"

/** Whether notes show their line numbers, and counted out from the caret's line, for every editor on the page at once (Settings, “Line numbers” and “Relative”). */
let on = true
let counted = false
const views = new Set<EditorView>()
export function setLineNumbers(shown: boolean, relative: boolean): void {
  if (on === shown && counted === relative) return
  on = shown
  counted = relative
  for (const view of views) view.dispatch(view.state.tr.setMeta(key, true))
}

/** Which of a block's lines (from 0) holds a place, `depth` being the block's depth in the note. */
function lineWithin(node: ProseMirrorNode, $head: ResolvedPos, depth: number): number {
  if ($head.depth < depth) return 0
  const name = node.type.name
  const at = $head.index(depth)
  if (LISTS.has(name)) {
    let before = 0
    for (let i = 0; i < at && i < node.childCount; i++) before += itemLines(node.child(i))
    const item = node.maybeChild(at)
    if (!item || $head.depth <= depth) return before
    // In the item's own words, or in a list inside it.
    const inner = $head.index(depth + 1)
    let lines = 1
    for (let i = 0; i < inner && i < item.childCount; i++) if (LISTS.has(item.child(i).type.name)) lines += linesIn(item.child(i))
    const child = item.maybeChild(inner)
    return child && LISTS.has(child.type.name) && $head.depth > depth + 1 ? before + lines + lineWithin(child, $head, depth + 2) : before
  }
  if (name === QUOTE) {
    let before = 0
    for (let i = 0; i < at && i < node.childCount; i++) before += linesIn(node.child(i))
    const child = node.maybeChild(at)
    return child && $head.depth > depth ? before + lineWithin(child, $head, depth + 1) : before
  }
  return 0
}

/**
 * The line (from 1) a place in the note is on, as the margin numbers it. `before` says how many lines come before a
 * top-level block: the margin keeps them, a Vim count adds them up.
 */
export function lineOf(doc: ProseMirrorNode, pos: number, before = (index: number): number => {
  let lines = 0
  for (let i = 0; i < index; i++) lines += linesIn(doc.child(i))
  return lines
}): number {
  if (!doc.childCount) return 0
  const $at = doc.resolve(pos)
  const index = Math.min($at.index(0), doc.childCount - 1)
  return before(index) + 1 + lineWithin(doc.child(index), $at, 1)
}

/** The caret's line: a picture or a divider picked whole is its own, not the one after it. */
export const caretLine = (state: EditorState, before?: (index: number) => number): number =>
  lineOf(state.doc, state.selection instanceof NodeSelection ? state.selection.from : state.selection.head, before)

/**
 * Where line `n` (from 1) stands, from before to after what holds it: a block, a list's item (the items nested in
 * it with it) or a quote's paragraph. Past the note's end, its last line; before its start, its first.
 */
export function lineSpan(doc: ProseMirrorNode, n: number): { from: number; to: number } {
  let left = Math.max(1, n) - 1
  let pos = 0
  for (let i = 0; i < doc.childCount; i++) {
    const block = doc.child(i)
    const lines = linesIn(block)
    if (left < lines || i === doc.childCount - 1) return spanWithin(block, pos, Math.min(left, lines - 1))
    left -= lines
    pos += block.nodeSize
  }
  return { from: 0, to: doc.content.size }
}

/** Line `left` (from 0) of a block standing at `pos`, in the order `rowsOf` numbers its rows. */
function spanWithin(node: ProseMirrorNode, pos: number, left: number): { from: number; to: number } {
  const list = LISTS.has(node.type.name)
  if (!list && node.type.name !== QUOTE) return { from: pos, to: pos + node.nodeSize }
  let at = pos + 1
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    // An item is its own line and then the lines of the lists inside it; a quote's child, its own lines.
    const lines = list ? itemLines(child) : linesIn(child)
    if (left < lines) {
      if (!list) return spanWithin(child, at, left)
      if (left === 0) return { from: at, to: at + child.nodeSize }
      left -= 1
      let inner = at + 1
      for (let j = 0; j < child.childCount; j++) {
        const sub = child.child(j)
        if (LISTS.has(sub.type.name)) {
          if (left < linesIn(sub)) return spanWithin(sub, inner, left)
          left -= linesIn(sub)
        }
        inner += sub.nodeSize
      }
    }
    left -= lines
    at += child.nodeSize
  }
  return { from: pos, to: pos + node.nodeSize }
}

/** ProseMirror's own record of what a piece of the page stands for. */
type Desc = { node?: ProseMirrorNode | null; dom: Node; children: Desc[] }
const descOf = (dom: Element): Desc | undefined => (dom as unknown as { pmViewDesc?: Desc }).pmViewDesc

/** The elements that carry a block's numbers, in the order of its lines. */
function rowsOf(desc: Desc, out: HTMLElement[]): void {
  const name = desc.node!.type.name
  if (LISTS.has(name)) {
    for (const item of desc.children) {
      if (!item.node) continue
      out.push(item.dom as HTMLElement)
      for (const child of item.children) if (child.node && LISTS.has(child.node.type.name)) rowsOf(child, out)
    }
  } else if (name === QUOTE) {
    const before = out.length
    for (const child of desc.children) if (child.node && !child.node.isText) rowsOf(child, out)
    if (out.length === before) out.push(desc.dom as HTMLElement)
  } else out.push(desc.dom as HTMLElement)
}

/** Where a row's first line is set, and in what size: from the block that holds it. */
type Line = { size: string; height: string; font: string }

/**
 * The drawn blocks of each long note, by its element. ProseMirror makes every plugin's view again when a plugin is
 * added to an open note or taken from it (it happens in a note's first second): the band it drew does not move
 * then, so it says nothing, and a gutter made again starts from what the last one was told.
 */
const bands = new WeakMap<Element, [number, number] | null>()

function gutter(view: EditorView): { update: (view: EditorView, previous: EditorState) => void; destroy: () => void } {
  const layer = document.createElement("div")
  layer.className = "mf-lines"
  layer.setAttribute("aria-hidden", "true")
  // Lines before each top-level block: [i] is how many come before block i, good up to its length.
  let doc = view.state.doc
  let before = [0]
  const linesBefore = (index: number): number => {
    while (before.length <= index) before.push(before[before.length - 1] + linesIn(doc.child(before.length - 1)))
    return before[index]
  }
  // The drawn blocks of a long note, as places among the note's elements; null: every block is drawn.
  let band: [number, number] | null = bands.get(view.dom) ?? null
  // The numbered elements drawn, and each one's number.
  let rows: HTMLElement[] = []
  let numbers: number[] = []
  let marks: HTMLElement[] = []
  // What the editor draws between blocks that is no block (a widget), watched with the rows.
  let widgets: HTMLElement[] = []
  let caret = 0
  let relative = false
  // Each kind of first line's size, read once per size of the note's words.
  const kinds = new Map<string, Line>()
  let em = ""
  let sized = false
  let frame = 0
  let total = 0

  const shown = (): boolean => on && view.editable

  /** Which blocks are numbered and with what, from the note and what is drawn of it: nothing is measured here. */
  const collect = (): void => {
    rows = []
    numbers = []
    // A long note is numbered once it has said which of its blocks are drawn.
    if (!shown() || (!band && view.dom.hasAttribute("data-long"))) return
    const all = view.dom.children
    const from = band ? band[0] : 0
    const to = band ? Math.min(band[1], all.length - 1) : all.length - 1
    let index = -1
    for (let i = from; i <= to; i++) {
      const element = all[i] as HTMLElement
      const desc = descOf(element)
      if (!desc?.node) continue
      // The first block drawn: its place in the note, once; the rest follow it.
      index = index < 0 ? doc.resolve((desc as unknown as { posBefore: number }).posBefore).index(0) : index + 1
      if (element.hasAttribute("data-off") || element.classList.contains("mf-fold-hidden")) continue
      const first = linesBefore(index) + 1
      const start = rows.length
      rowsOf(desc, rows)
      for (let line = start; line < rows.length; line++) numbers.push(first + line - start)
    }
  }

  /** The words of each number: the caret's line its own, the others theirs or, with “Relative”, how far they are from it. */
  const label = (): void => {
    caret = caretLine(view.state, linesBefore)
    relative = counted
    for (let i = 0; i < marks.length; i++) {
      const n = numbers[i]
      const words = String(relative && n !== caret ? Math.abs(n - caret) : n)
      const mark = marks[i]
      const text = mark.firstChild as HTMLElement
      if (text.textContent !== words) text.textContent = words
      mark.toggleAttribute("data-here", n === caret)
    }
  }

  /** Each number set on its block's first line: what is drawn is read once, after the browser has laid it out. */
  const place = (): void => {
    frame = 0
    // Read again as it is now: a block drawn by a view of its own (a task) can be made again with no change to the note.
    collect()
    if (!rows.length) {
      layer.replaceChildren()
      marks = []
      told(false)
      return
    }
    size()
    const top = view.dom.getBoundingClientRect().top
    while (marks.length < rows.length) {
      const mark = document.createElement("div")
      mark.className = "mf-line"
      mark.append(document.createElement("span"))
      layer.append(mark)
      marks.push(mark)
    }
    while (marks.length > rows.length) marks.pop()!.remove()
    // Each numbered block watched for its size: one that grows a line moves those under it, and one made again by
    // its own view (a task, as the style or Vim changes) is told by the old one going to nothing.
    // And what the editor draws between blocks that is no block (a widget: the Properties strip under the title):
    // it growing moves every block under it without any of them changing size, and the note itself keeps its least
    // height, so nothing else is told; its numbers stood a frame where the lines had been.
    const between = (widgets = [...view.dom.children].filter((one): one is HTMLElement => one instanceof HTMLElement && !descOf(one)?.node))
    const now = new Set([...rows, ...between])
    for (const row of watched) if (!now.has(row)) (resized.unobserve(row), watched.delete(row), fresh.delete(row))
    // A widget's first report is heard too: its holder is made afresh each time the editor places it (property-lines.ts),
    // so a strip grown as it was placed again is told only by that first report.
    for (const row of rows) if (!watched.has(row)) (resized.observe(row), watched.add(row), fresh.add(row))
    for (const one of between) if (!watched.has(one)) (resized.observe(one), watched.add(one))
    // Every place read first, then every number set: a number set between two readings had the browser lay the
    // page out again for the next one, once per row (some 300 times in the largest note, as it opened and as its
    // drawn blocks moved under a scroll).
    const places: { y: string; line: Line }[] = []
    for (const row of rows) {
      // Its first line: the block itself, or the first words inside one counted whole (a callout, a table).
      const first = row.matches("p, h1, h2, h3, h4, h5, h6, li") ? row : (row.querySelector<HTMLElement>("p, h1, h2, h3, h4, h5, h6, pre") ?? row)
      // By what holds it and what it is: a quote's or a callout's words may be set apart from the page's.
      const kind = `${first === row ? "" : `${row.tagName}.${row.className.split(" ")[0]}>`}${first.tagName}`
      let line = kinds.get(kind)
      if (!line) {
        const text = first.tagName === "LI" ? (first.querySelector<HTMLElement>("p") ?? first) : first.tagName === "PRE" ? (first.querySelector<HTMLElement>("code") ?? first) : first
        const style = getComputedStyle(text)
        line = { size: style.fontSize, height: style.lineHeight, font: style.fontFamily }
        kinds.set(kind, line)
      }
      const pad = first.tagName === "PRE" ? parseFloat(getComputedStyle(first).paddingTop) || 0 : 0
      places.push({ y: `${Math.round((first.getBoundingClientRect().top - top + pad) * 100) / 100}px`, line })
    }
    places.forEach(({ y, line }, i) => {
      const mark = marks[i]
      if (mark.style.top !== y) mark.style.top = y
      if (mark.style.fontSize !== line.size) mark.style.fontSize = line.size
      if (mark.style.lineHeight !== line.height) mark.style.lineHeight = line.height
      if (mark.style.fontFamily !== line.font) mark.style.fontFamily = line.font
    })
    label()
    told(true)
  }

  // The layer in place (last in the note's scroller, after what a long note keeps at its ends, laid at the note's own
  // top) and the note's own size of words and left room, read again only when the note changed size or a font
  // arrived. Done where the numbers are first asked for, in the same breath as the words they stand beside, never a
  // frame after: the room given then narrowed the words, every line under it moved down, and a press made on the
  // first screen landed lines above where it was aimed (qa/long-note-press-early.mjs, 15 Nov 2026).
  const size = (): void => {
    if (!layer.isConnected) view.dom.parentElement?.append(layer)
    if (sized || !layer.isConnected) return
    sized = true
    roomy()
    const look = getComputedStyle(view.dom)
    if (look.fontSize !== em) (kinds.clear(), (em = look.fontSize))
    if (layer.style.getPropertyValue("--mf-lines-pad") !== look.paddingLeft) layer.style.setProperty("--mf-lines-pad", look.paddingLeft)
  }

  // Room for the column and the slim grip beside it inside what holds the note. Beside a list a note's pane leaves
  // 81px left of its words: enough for two digits, and a note of a hundred lines or more had its grip cut off at
  // the pane's edge. The note's left room grows by what is missing then, the gutter's own room, and by nothing where
  // there is enough; it goes back when the numbers go.
  let extra = 0
  const roomy = (): void => {
    const holder = view.dom.closest(".haligtree-editor-wrapper")
    if (!holder || !layer.isConnected) return
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    // The fold arrow's room, the column, 4px, the grip where the note has one, and 2px from the edge.
    const grip = holder.querySelector(".tiptap-drag-handle") ? 4 + 1.5 * rem : 0
    const need = 1.75 * rem + layer.getBoundingClientRect().width + grip + 2
    // The stylesheet's own room, read with the room given here taken off: it is another at another width of pane
    // (a narrow note's is smaller), and the room given at the last width is no part of it.
    if (extra) view.dom.style.paddingLeft = ""
    const base = parseFloat(getComputedStyle(view.dom).paddingLeft) || 0
    const have = view.dom.getBoundingClientRect().left + base - holder.getBoundingClientRect().left
    extra = Math.max(0, Math.ceil(need - have))
    view.dom.style.paddingLeft = extra ? `${base + extra}px` : ""
  }

  // Whether the column stands, as last told (`LINES`): told again only when it comes, goes or changes width.
  let standing = false
  const told = (now: boolean, wider = false): void => {
    if (now === standing && !wider) return
    standing = now
    view.dom.dispatchEvent(new CustomEvent(LINES))
  }

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(place)
  }

  // How many digits the note's last number has, for the column's width.
  const count = (): void => {
    const lines = linesBefore(doc.childCount)
    if (lines === total) return
    total = lines
    const digits = String(Math.max(2, String(lines).length))
    if (layer.style.getPropertyValue("--mf-line-digits") === digits) return
    layer.style.setProperty("--mf-line-digits", digits)
    // One more digit: the column grew to the left, its room is looked at again, and what stands beside it moves.
    sized = false
    if (rows.length) schedule()
    if (standing) told(true, true)
  }

  const redraw = (): void => {
    collect()
    if (!rows.length) {
      cancelAnimationFrame(frame)
      frame = 0
      layer.replaceChildren()
      marks = []
      layer.remove()
      for (const row of watched) resized.unobserve(row)
      watched.clear()
      fresh.clear()
      // The room given for the numbers goes with them.
      if (extra) ((extra = 0), (view.dom.style.paddingLeft = ""), (sized = false))
      told(false)
      return
    }
    // The column's width counted now, before the frame the numbers are drawn in. Counted later, when the page had
    // nothing else to do, the column grew from two digits to the note's own after the first screen, the note's left
    // room grew with it, and every word moved under a press made then (qa/long-note-press-early.mjs, 15 Nov 2026).
    // Each block's lines are kept (`counts`, `before`), so after a change this walks only from the change on.
    count()
    size()
    schedule()
  }

  // Told in the middle of the note's own update, before its page is drawn: only noted, and read when it is.
  const drawn = (event: Event): void => {
    band = (event as CustomEvent<[number, number] | null>).detail
    bands.set(view.dom, band)
    if (shown()) schedule()
  }
  // A block just watched reports its size once at once: it was placed in the same breath, so that report is let
  // pass (it placed every number a second time, each time a long note's drawn blocks moved). The note's own
  // element changing size has its size of words and room read again.
  const fresh = new Set<Element>()
  let width = -1
  const resized = new ResizeObserver((entries) => {
    let moved = false
    for (const entry of entries) {
      // The note's own element widened or narrowed (first laid out on the page, or the window or pane changed): its
      // room is given here, after the browser laid it out and before it paints, so no frame ever shows its words
      // without it. Only grown taller or shorter (words coming in), its room stays as it is: read again then (its
      // room taken off and the note laid out again without it), a long paste coming in a stretch at a time had the
      // whole note laid out twice over for each stretch.
      if (entry.target === view.dom) {
        const wide = entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width
        moved = true
        if (wide !== width) ((width = wide), (sized = false), rows.length && size())
      } else if (!fresh.delete(entry.target)) moved = true
    }
    // Placed now, after the browser laid the blocks out and before it paints them: placed a frame later, the numbers
    // stood one frame where the blocks had been (a gem's Properties coming in above its words left "2" 59px high).
    if (moved && rows.length) (cancelAnimationFrame(frame), place())
  })
  const watched = new Set<HTMLElement>()
  // Its outer box only: the room given inside it changes its inner size, which would be told again at once.
  resized.observe(view.dom, { box: "border-box" })
  const fonts = (): void => void (kinds.clear(), (em = ""), (sized = false), rows.length && schedule())
  document.fonts.addEventListener("loadingdone", fonts)
  view.dom.addEventListener(DRAWN, drawn)
  views.add(view)
  redraw()

  return {
    update: (view, previous) => {
      if (view.state.doc !== doc) {
        const changed = view.state.doc.content.findDiffStart(doc.content)
        doc = view.state.doc
        if (changed !== null) before.length = Math.min(before.length, doc.resolve(Math.min(changed, doc.content.size)).index(0) + 1)
        return redraw()
      }
      // Switched on or off (Settings), or the note locked or unlocked; or a block made again by its own view (a
      // task, as Vim's line comes or goes): numbered and set again. A glance at each row, nothing laid out.
      if (!!rows.length !== shown() || (!rows.length && shown()) || rows.some((row) => !row.isConnected) || widgets.some((one) => !one.isConnected)) return redraw()
      // Only the caret moved, or “Relative” was switched: the words of the numbers, nothing measured.
      if ((!view.state.selection.eq(previous.selection) || counted !== relative) && !frame && marks.length) label()
    },
    destroy: () => {
      cancelAnimationFrame(frame)
      resized.disconnect()
      document.fonts.removeEventListener("loadingdone", fonts)
      view.dom.removeEventListener(DRAWN, drawn)
      views.delete(view)
      layer.remove()
      before = [0]
    },
  }
}

/** Line numbers beside a note's words, while Settings' “Line numbers” is on and the note can be written in. */
export const LineNumbers = Extension.create({
  name: "lineNumbers",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          // Marked for the stylesheet: a narrow note's margin then makes room for the numbers and the grip beside them.
          attributes: (): Record<string, string> => (on ? { "data-lines": "" } : {}),
        },
        view: (view) => gutter(view),
      }),
    ]
  },
})
