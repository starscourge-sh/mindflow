import { Node, type JSONContent } from "@tiptap/core"
import type { Fragment } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

/**
 * One column: any blocks at all. `isolating` so Backspace at its start does
 * not pull its words into the column beside it.
 */
export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-column]" }]
  },

  renderHTML() {
    return ["div", { "data-column": "", class: "mf-column" }, 0]
  },

  renderMarkdown(node, { renderChildren }) {
    return renderChildren(node, "\n\n")
  },
})

/** The marks Markdown is written with: comments, so anywhere else it reads as sections one after another. */
const OPEN = "<!-- columns -->"
const SPLIT = "<!-- column -->"
const CLOSE = "<!-- /columns -->"

/**
 * Blocks side by side. Markdown has no columns, so a row is written as its
 * sections between comment marks that only Vigil reads. The outer element is
 * what the stylesheet measures, so a narrow pane stacks them.
 */
export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column+",
  isolating: true,
  draggable: true,

  parseHTML() {
    return [{ tag: "div[data-columns]", contentElement: ".mf-columns-row" }]
  },

  renderHTML() {
    return ["div", { "data-columns": "", class: "mf-columns" }, ["div", { class: "mf-columns-row" }, 0]]
  },

  markdownTokenizer: {
    name: "columns",
    level: "block",
    start: (src: string) => src.indexOf(OPEN),
    tokenize: (src, _tokens, lexer) => {
      const match = /^ {0,3}<!-- columns -->[ \t]*\n([\s\S]*?)\n[ \t]*<!-- \/columns -->[ \t]*(?:\n|$)/.exec(src)
      if (!match) return undefined
      const columns = match[1].split(/^[ \t]*<!-- column -->[ \t]*$/m).map((part) => ({ tokens: lexer.blockTokens(part.trim()) }))
      return { type: "columns", raw: match[0], columns }
    },
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode(
      "columns",
      {},
      (token.columns as Array<{ tokens: never[] }>).map((column) => {
        const content = helpers.parseChildren(column.tokens)
        return helpers.createNode("column", {}, content.length ? content : [{ type: "paragraph" }])
      }),
    ),

  addProseMirrorPlugins() {
    return [columnDrop()]
  },

  renderMarkdown(node, { renderChildren }) {
    const columns = (node.content ?? []).map((column: JSONContent) => renderChildren(column, "\n\n"))
    return [OPEN, columns.join(`\n\n${SPLIT}\n\n`), CLOSE].join("\n\n")
  },
})

/** A row of `count` empty columns, for `/columns`. */
export const emptyColumns = (count: number): JSONContent => ({
  type: "columns",
  content: Array.from({ length: count }, () => ({ type: "column", content: [{ type: "paragraph" }] })),
})

/* Dropping a block beside another ----------------------------------------- */

/** Most columns a row holds; past that each is too narrow to write in. */
const MOST = 3
/** How near a block's side the pointer must be. Left is narrow: a drag down the gutter passes close to it. */
const NEAR_LEFT = 24
const NEAR_RIGHT = 56

/** Where a dragged block would land beside another: a new row, or a new column in a row. */
type Beside = { kind: "wrap" | "column"; pos: number; side: "left" | "right" }

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
const LISTS = new Set(["bulletList", "orderedList", "taskList"])

/**
 * Take a block out, and whatever it leaves empty: the list it was the only
 * item of, the column it was the only block in, and the row that leaves with
 * one column - a row of one is just its blocks, so they go back in line.
 */
export function removeBlock(tr: Transaction, from: number, to: number): void {
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
export function moveOutOfColumn(tr: Transaction, dragged: NodeSelection, target: number, content: Fragment): boolean {
  const parent = dragged.$from.parent
  if (parent.type.name !== "column" && !(LISTS.has(parent.type.name) && parent.childCount === 1)) return false
  // Into itself would take away what was just put in.
  if (target > dragged.from && target < dragged.to) return true
  tr.insert(target, content)
  removeBlock(tr, tr.mapping.map(dragged.from, 1), tr.mapping.map(dragged.to, -1))
  return true
}

/**
 * The drop itself, when it is beside a block: one step, so one undo puts it
 * all back. Returns false for an ordinary drop.
 */
export function dropBeside(view: EditorView, moved: boolean): boolean {
  const beside = besideKey.getState(view.state)
  const dragged = draggedOf(view)
  if (!beside || !moved || !dragged) return false
  const { schema } = view.state
  const tr = view.state.tr
  const fresh = schema.nodes.column.create(null, dragged.node)
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
  removeBlock(tr, tr.mapping.map(dragged.from, 1), tr.mapping.map(dragged.to, -1))
  // The handle forgets the block it was on, as after any move.
  view.dispatch(tr.setMeta(besideKey, null).setMeta("hideDragHandle", true).scrollIntoView())
  return true
}

/** The upright line beside a block that says "it goes here, next to this". */
class BesideLine {
  private line: HTMLElement | null = null
  constructor(private view: EditorView) {}

  update(): void {
    const beside = besideKey.getState(this.view.state)
    // Nothing to draw and nothing drawn: asking where the page sits would lay
    // out the whole note, on every key.
    if (!beside && !this.line) return
    const parent = this.view.dom.offsetParent as HTMLElement | null
    // The flat line between blocks steps aside while this one shows.
    parent?.classList.toggle("mf-drop-beside", !!beside)
    const dom = beside && this.view.nodeDOM(beside.pos)
    if (!beside || !(dom instanceof HTMLElement) || !parent) return this.remove()
    if (!this.line) {
      this.line = parent.appendChild(document.createElement("div"))
      this.line.className = "mf-column-drop"
    }
    const box = dom.getBoundingClientRect()
    const frame = parent.getBoundingClientRect()
    // Half the gap a row leaves between columns, so it sits where the seam will be.
    const x = beside.side === "left" ? box.left - 10 : box.right + 8
    this.line.style.left = `${x - frame.left + parent.scrollLeft}px`
    this.line.style.top = `${box.top - frame.top + parent.scrollTop}px`
    this.line.style.height = `${box.height}px`
  }

  remove(): void {
    ;(this.view.dom.offsetParent as HTMLElement | null)?.classList.remove("mf-drop-beside")
    this.line?.remove()
    this.line = null
  }

  destroy(): void {
    this.remove()
  }
}

/** Watches a drag for the sides of blocks, and draws where it would land. */
export const columnDrop = (): Plugin<Beside | null> =>
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
