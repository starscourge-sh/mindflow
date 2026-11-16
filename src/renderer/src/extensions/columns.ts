import { Node, type JSONContent } from "@tiptap/core"
import { Fragment, type Node as Block } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { click } from "@/lib/sound"

/**
 * One column: any blocks at all. `isolating` so Backspace at its start does
 * not pull its words into the column beside it.
 */
export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,

  addAttributes() {
    return {
      // Its share of the row against its neighbours (1 each, equal, when unset), set by dragging the gap between two.
      width: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute("data-width")) || null,
        renderHTML: (attributes) => (attributes.width ? { "data-width": attributes.width, style: `flex-grow: ${attributes.width}` } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-column]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-column": "", class: "mf-column" }, 0]
  },

  renderMarkdown(node, { renderChildren }) {
    return renderChildren(node, "\n\n")
  },
})

/** The marks Markdown is written with: comments, so anywhere else it reads as sections one after another. */
const OPEN = "<!-- columns -->"
/** A row whose columns wear the card look (`look: "cards"`). */
const OPEN_CARDS = "<!-- columns cards -->"
const SPLIT = "<!-- column -->"
const CLOSE = "<!-- /columns -->"

/**
 * Blocks side by side. Markdown has no columns, so a row is written as its
 * sections between comment marks that only Haligtree reads. The outer element is
 * what the stylesheet measures, so a narrow pane stacks them.
 */
export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column+",
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      // "cards": each column a quiet card of its own (the slash menu's "Cards in a row", or the row's own menu).
      look: {
        default: null,
        parseHTML: (element) => (element.getAttribute("data-look") === "cards" ? "cards" : null),
        renderHTML: (attributes) => (attributes.look === "cards" ? { "data-look": "cards" } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-columns]", contentElement: ".mf-columns-row" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-columns": "", class: "mf-columns" }, ["div", { class: "mf-columns-row" }, 0]]
  },

  markdownTokenizer: {
    name: "columns",
    level: "block",
    start: (src: string) => src.indexOf("<!-- columns"),
    tokenize: (src, _tokens, lexer) => {
      const match = /^ {0,3}<!-- columns( cards)? -->[ \t]*\n([\s\S]*?)\n[ \t]*<!-- \/columns -->[ \t]*(?:\n|$)/.exec(src)
      if (!match) return undefined
      const columns = match[2].split(/^[ \t]*<!-- column -->[ \t]*$/m).map((part) => ({ tokens: lexer.blockTokens(part.trim()) }))
      return { type: "columns", raw: match[0], columns, cards: !!match[1] }
    },
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode(
      "columns",
      token.cards ? { look: "cards" } : {},
      (token.columns as Array<{ tokens: never[] }>).map((column) => {
        const content = helpers.parseChildren(column.tokens)
        return helpers.createNode("column", {}, content.length ? content : [{ type: "paragraph" }])
      }),
    ),

  addProseMirrorPlugins() {
    return [columnDrop(), columnResize()]
  },

  renderMarkdown(node, { renderChildren }) {
    const columns = (node.content ?? []).map((column: JSONContent) => renderChildren(column, "\n\n"))
    return [node.attrs?.look === "cards" ? OPEN_CARDS : OPEN, columns.join(`\n\n${SPLIT}\n\n`), CLOSE].join("\n\n")
  },
})

/** A row of `count` empty columns, for `/columns`; `cards`, each a card of its own ("Cards in a row"). */
export const emptyColumns = (count: number, cards = false): JSONContent => ({
  type: "columns",
  ...(cards ? { attrs: { look: "cards" } } : {}),
  content: Array.from({ length: count }, () => ({ type: "column", content: [{ type: "paragraph" }] })),
})

/* Dropping a block beside another ----------------------------------------- */

/** Most columns a row holds; past that each is too narrow to write in. */
export const MOST = 4
/** How near a block's side the pointer must be. Left is narrow: a drag down the gutter passes close to it. */
const NEAR_LEFT = 24
const NEAR_RIGHT = 56

/** Where a dragged block would land beside another: a new row, or a new column in a row. */
export type Beside = { kind: "wrap" | "column"; pos: number; side: "left" | "right" }

const besideKey = new PluginKey<Beside | null>("columnDrop")

/**
 * The block being moved by its handle, if any. The handle hands over the
 * block itself, or, when it lost track of which block it was on, the range
 * it selected instead: one block in that range is the same thing.
 */
export const draggedOf = (view: EditorView): NodeSelection | null => {
  const dragging = view.dragging as { node?: NodeSelection } | null
  if (!dragging) return null
  if (dragging.node instanceof NodeSelection) return dragging.node
  const { from, to } = view.state.selection
  const node = view.state.doc.nodeAt(from)
  return node && from + node.nodeSize === to ? NodeSelection.create(view.state.doc, from) : null
}

/** Is the column at `columnPos` the one holding only `dragged`, so taking it out removes the column? */
const onlyChildOf = (dragged: NodeSelection, columnPos: number): boolean => {
  const $from = dragged.$from
  return $from.parent.type.name === "column" && $from.parent.childCount === 1 && $from.before() === columnPos
}

/** The place beside a block the pointer points at, or null for an ordinary drop. */
function besideAt(view: EditorView, event: DragEvent): Beside | null {
  const dragged = draggedOf(view)
  if (!dragged || event.altKey) return null
  const { doc, schema } = view.state
  // Only what a column can hold, and never a row inside a row.
  if (dragged.node.type.name === "columns" || !schema.nodes.column.contentMatch.matchType(dragged.node.type)) return null
  const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!at) return null
  const $at = doc.resolve(at.pos)
  if ($at.depth < 1) return null
  const top = $at.before(1)
  const block = doc.nodeAt(top)
  if (!block) return null

  let kind: Beside["kind"] = "wrap"
  let pos = top
  if (block.type.name === "columns") {
    if ($at.depth < 2) return null
    kind = "column"
    pos = $at.before(2)
    // A row that is full, unless the moved block leaves one of its columns.
    const $from = dragged.$from
    const leaving = $from.parent.type.name === "column" && $from.parent.childCount === 1 && $from.before($from.depth - 1) === top
    if (block.childCount - (leaving ? 1 : 0) >= MOST) return null
  } else if (dragged.from >= top && dragged.to <= top + block.nodeSize) return null // beside itself, or inside what it is part of
  else if (block.isTextblock && !block.content.size) return null // an empty line is a place to drop into, not beside

  const dom = view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return null
  const box = dom.getBoundingClientRect()
  if (event.clientY < box.top || event.clientY > box.bottom) return null
  const side = event.clientX >= box.left && event.clientX < box.left + NEAR_LEFT ? "left" : event.clientX > box.right - NEAR_RIGHT ? "right" : null
  if (!side) return null
  // Beside its own lone column is where it already is.
  if (kind === "column" && onlyChildOf(dragged, pos)) return null
  return { kind, pos, side }
}

/** Lists, which an item leaving alone would leave holding one empty item. */
export const LISTS = new Set(["bulletList", "orderedList", "taskList"])

/**
 * Take a block out, and whatever it leaves empty: the list it was the only
 * item of, the column it was the only block in, and the row that leaves with
 * one column - a row of one is just its blocks, so they go back in line.
 */
function removeBlock(tr: Transaction, from: number, to: number): void {
  const $from = tr.doc.resolve(from)
  const parent = $from.parent
  const whole = from === $from.start() && to === $from.end()
  if (whole && LISTS.has(parent.type.name) && $from.depth > 0) return removeBlock(tr, $from.before(), $from.after())
  if (!whole || parent.type.name !== "column") {
    tr.delete(from, to)
    return
  }
  const row = $from.node($from.depth - 1)
  const rowPos = $from.before($from.depth - 1)
  if (row.childCount > 2) {
    tr.delete($from.before(), $from.after())
    return
  }
  const other = row.firstChild === parent ? row.lastChild! : row.firstChild!
  tr.replaceWith(rowPos, rowPos + row.nodeSize, other.content)
}

/**
 * Move a dragged block, cleaning up a column or list it leaves empty: the new
 * copy goes in first, then the original comes out, so where it lands is never
 * inside what was taken away.
 */
function moveOutOfColumn(tr: Transaction, range: { from: number; to: number }, target: number, content: Fragment): boolean {
  const $from = tr.doc.resolve(range.from)
  const parent = $from.parent
  // All a list holds (one item, or every item picked) leaves it empty.
  if (parent.type.name !== "column" && !(LISTS.has(parent.type.name) && range.from === $from.start() && range.to === $from.end())) return false
  // Into itself would take away what was just put in.
  if (target > range.from && target < range.to) return true
  tr.insert(target, content)
  removeBlock(tr, tr.mapping.map(range.from, 1), tr.mapping.map(range.to, -1))
  return true
}

/**
 * Take carried blocks out of where they were, after their copy went in (`tr` has mapped them): a column carried by its
 * own grip (`node`) takes its row with it when that leaves a row of one, as blocks taken out of their column do.
 */
export function takeOut(tr: Transaction, dragged: { from: number; to: number; node?: Block | null }): void {
  const column = dragged.node?.type.name === "column" ? 1 : 0
  removeBlock(tr, tr.mapping.map(dragged.from + column, 1), tr.mapping.map(dragged.to - column, -1))
}

/**
 * Move dragged blocks (`range`; `dragged`, the one block when it is one) to
 * `target`, as one step: out of a column or a list they leave empty, those go
 * too. False when the target is inside what moves: nothing to do.
 */
export function moveBlocks(tr: Transaction, range: { from: number; to: number }, dragged: NodeSelection | null, target: number, content: Fragment): boolean {
  if (moveOutOfColumn(tr, dragged ?? range, target, content)) return true
  if (target > range.from && target < range.to) return false
  tr.delete(range.from, range.to)
  tr.insert(tr.mapping.map(target), content)
  return true
}

/**
 * What a column is given for carried blocks (`from` to `to`, side by side in one parent): a list's items come in a
 * list of their own kind, which a column can hold; a column carried by its own grip goes as itself.
 */
export const columnFor = (doc: Block, from: number, to: number): Block | null => {
  const { schema } = doc.type
  const first = doc.nodeAt(from)
  if (!first) return null
  if (first.type.name === "column" && from + first.nodeSize === to) return first
  const list = doc.resolve(from).parent
  const nodes = doc.slice(from, to).content
  const body = LISTS.has(list.type.name) ? Fragment.from(list.type.create(list.attrs, nodes)) : nodes
  let fits = true
  body.forEach((one) => void (fits &&= one.type.name !== "columns"))
  return fits && schema.nodes.column.validContent(body) ? schema.nodes.column.create(null, body) : null
}
/**
 * The drop itself, when it is beside a block: one step, so one undo puts it
 * all back. Returns false for an ordinary drop. `beside`: where, when the carry
 * worked it out itself (lib/block-carry.tsx).
 */
export function dropBeside(view: EditorView, moved: boolean, beside: Beside | null = besideKey.getState(view.state) ?? null, dragged: { from: number; to: number; node?: Block | null } | null = draggedOf(view)): boolean {
  if (!beside || !moved || !dragged) return false
  const { schema } = view.state
  const tr = view.state.tr
  const fresh = columnFor(view.state.doc, dragged.from, dragged.to)
  if (!fresh) return false
  if (beside.kind === "wrap") {
    const target = tr.doc.nodeAt(beside.pos)
    if (!target) return false
    const own = schema.nodes.column.create(null, target)
    const row = schema.nodes.columns.create(null, beside.side === "left" ? [fresh, own] : [own, fresh])
    tr.replaceWith(beside.pos, beside.pos + target.nodeSize, row)
  } else {
    const target = tr.doc.nodeAt(beside.pos)
    if (!target) return false
    tr.insert(beside.side === "left" ? beside.pos : beside.pos + target.nodeSize, fresh)
  }
  takeOut(tr, dragged)
  // The handle forgets the block it was on, as after any move.
  view.dispatch(tr.setMeta(besideKey, null).setMeta("hideDragHandle", true).scrollIntoView())
  return true
}

/** The upright line beside a block that says "it goes here, next to this". */
class BesideLine {
  private line: HTMLElement | null = null
  /** The page marked while the line shows, so taking it off never asks where the page sits. */
  private marked: HTMLElement | null = null
  constructor(private view: EditorView) {}

  update(): void {
    const beside = besideKey.getState(this.view.state)
    // Nothing to draw and nothing drawn: asking where the page sits would lay
    // out the whole note, on every key.
    if (!beside && !this.line) return
    const parent = this.view.dom.offsetParent as HTMLElement | null
    // The flat line between blocks steps aside while this one shows.
    parent?.classList.toggle("mf-drop-beside", !!beside)
    if (beside && parent) this.marked = parent
    const dom = beside && this.view.nodeDOM(beside.pos)
    if (!beside || !(dom instanceof HTMLElement) || !parent) return this.remove()
    const box = dom.getBoundingClientRect()
    const frame = parent.getBoundingClientRect()
    // Half the gap a row leaves between columns, so it sits where the seam will be.
    const x = beside.side === "left" ? box.left - 10 : box.right + 8
    // One transform (main.scss .mf-column-drop is a 100px line at the corner), so moving it lays nothing out.
    const transform = `translate(${x - frame.left + parent.scrollLeft}px, ${box.top - frame.top + parent.scrollTop}px) scaleY(${box.height / 100})`
    // Placed before it is put in the page: put in first, it glided in from the page's top left corner.
    const fresh = !this.line
    this.line ??= Object.assign(document.createElement("div"), { className: "mf-column-drop" })
    this.line.style.transform = transform
    if (fresh) parent.appendChild(this.line)
  }

  // Every editor's plugin views are taken down and made again as it opens:
  // reading offsetParent here would lay out the whole page each time.
  remove(): void {
    this.marked?.classList.remove("mf-drop-beside")
    this.marked = null
    this.line?.remove()
    this.line = null
  }

  destroy(): void {
    this.remove()
  }
}

/** Watches a drag for the sides of blocks, and draws where it would land. */
const columnDrop = (): Plugin<Beside | null> =>
  new Plugin<Beside | null>({
    key: besideKey,
    state: {
      init: () => null,
      apply: (tr, old) => {
        const meta = tr.getMeta(besideKey) as Beside | null | undefined
        if (meta !== undefined) return meta
        return tr.docChanged ? null : old
      },
    },
    view: (view) => new BesideLine(view),
    props: {
      handleDOMEvents: {
        dragover: (view, event) => {
          const next = besideAt(view, event)
          const now = besideKey.getState(view.state)
          if (next?.pos !== now?.pos || next?.side !== now?.side || next?.kind !== now?.kind) view.dispatch(view.state.tr.setMeta(besideKey, next))
          return false
        },
        dragleave: (view, event) => {
          const into = event.relatedTarget as globalThis.Node | null
          if (!into || !view.dom.contains(into)) if (besideKey.getState(view.state)) view.dispatch(view.state.tr.setMeta(besideKey, null))
          return false
        },
        dragend: (view) => {
          if (besideKey.getState(view.state)) view.dispatch(view.state.tr.setMeta(besideKey, null))
          return false
        },
      },
    },
  })

/* Dragging the gap between two columns ------------------------------------ */

/** The narrowest a column is dragged down to, in pixels. */
const NARROWEST = 96
/** Shares a gap is drawn into as it passes: halves, thirds, quarters. */
const RESTS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4]
/** How near a rest the gap must come, as a share of the two columns. */
const PULL = 0.025

type Seam = { row: HTMLElement; left: HTMLElement; right: HTMLElement }

/** The gap between two columns side by side under the pointer, if any: rows stacked on a narrow page have none. */
function seamAt(view: EditorView, event: MouseEvent): Seam | null {
  const row = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".mf-columns-row")
  if (!row || !view.dom.contains(row) || getComputedStyle(row).flexDirection === "column") return null
  const columns = [...row.children] as HTMLElement[]
  for (let i = 0; i + 1 < columns.length; i++) {
    const a = columns[i].getBoundingClientRect()
    const b = columns[i + 1].getBoundingClientRect()
    if (event.clientX >= a.right - 2 && event.clientX <= b.left + 2 && event.clientY >= Math.min(a.top, b.top) && event.clientY <= Math.max(a.bottom, b.bottom)) {
      return { row, left: columns[i], right: columns[i + 1] }
    }
  }
  return null
}

/** Where a column's own node starts, from its element. */
const columnPos = (view: EditorView, dom: HTMLElement): number => view.posAtDOM(dom, 0) - 1

/** Writes on a column's element without the editor reading it as an edit. */
function quietly(view: EditorView, change: () => void): void {
  const observer = (view as unknown as { domObserver?: { stop(): void; start(): void } }).domObserver
  observer?.stop()
  change()
  observer?.start()
}

/**
 * The gap between two columns is a handle: the pointer over it shows the
 * resize arrows and a line in the gap, and a drag moves the share between the
 * two, drawn into halves, thirds and quarters as it passes them. Letting go
 * keeps it, in one step ⌘Z takes back.
 */
export const columnResize = (): Plugin =>
  new Plugin({
    props: {
      handleDOMEvents: {
        mousemove: (view, event) => {
          if (event.buttons) return false
          const seam = seamAt(view, event)
          quietly(view, () => view.dom.classList.toggle("mf-on-seam", !!seam))
          return false
        },
        mouseleave: (view) => {
          quietly(view, () => view.dom.classList.remove("mf-on-seam"))
          return false
        },
        mousedown: (view, event) => {
          if (event.button !== 0 || !view.editable) return false
          const seam = seamAt(view, event)
          if (!seam) return false
          event.preventDefault()
          const leftPos = columnPos(view, seam.left)
          const rightPos = columnPos(view, seam.right)
          const leftNode = view.state.doc.nodeAt(leftPos)
          const rightNode = view.state.doc.nodeAt(rightPos)
          if (leftNode?.type.name !== "column" || rightNode?.type.name !== "column") return false
          const a = seam.left.getBoundingClientRect().width
          const b = seam.right.getBoundingClientRect().width
          const share = (Number(leftNode.attrs.width) || 1) + (Number(rightNode.attrs.width) || 1)
          const startX = event.clientX
          let ratio = a / (a + b)
          let rest: number | null = null
          quietly(view, () => view.dom.classList.add("mf-resizing"))
          const move = (next: MouseEvent): void => {
            const raw = Math.min(Math.max(a + next.clientX - startX, NARROWEST), a + b - NARROWEST) / (a + b)
            const near = RESTS.find((one) => Math.abs(raw - one) < PULL) ?? null
            if (near !== null && near !== rest) {
              click("tick")
              ;(window as { api?: { tap?: () => void } }).api?.tap?.()
            }
            rest = near
            ratio = near ?? raw
            quietly(view, () => {
              seam.left.style.flexGrow = String(share * ratio)
              seam.right.style.flexGrow = String(share * (1 - ratio))
            })
          }
          const up = (): void => {
            window.removeEventListener("mousemove", move)
            window.removeEventListener("mouseup", up)
            quietly(view, () => view.dom.classList.remove("mf-resizing"))
            const round = (n: number): number => Math.round(n * 1000) / 1000
            const left = view.state.doc.nodeAt(leftPos)
            const right = view.state.doc.nodeAt(rightPos)
            if (left?.type.name !== "column" || right?.type.name !== "column") return
            view.dispatch(
              view.state.tr
                .setNodeMarkup(leftPos, undefined, { ...left.attrs, width: round(share * ratio) })
                .setNodeMarkup(rightPos, undefined, { ...right.attrs, width: round(share * (1 - ratio)) }),
            )
          }
          window.addEventListener("mousemove", move)
          window.addEventListener("mouseup", up)
          return true
        },
      },
    },
  })
