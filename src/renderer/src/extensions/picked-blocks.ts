import { Extension } from "@tiptap/core"
import { NodeRangeSelection, getSelectionRanges } from "@tiptap/extension-node-range"
import { Fragment, type Node as Block, type ResolvedPos } from "@tiptap/pm/model"
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list"
import { NodeSelection, Plugin, Selection, SelectionRange, TextSelection } from "@tiptap/pm/state"
import type { Mappable } from "@tiptap/pm/transform"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import { edgeScroll } from "@/lib/edge-scroll"
import { chime } from "@/lib/sound"
import { LISTS } from "./columns"

/**
 * Blocks picked as blocks, as Notion picks them (the user, 15 Nov: "notion even lets you select which you want to drag
 * and where"): a click on a block's grip picks it, ⇧ and the grip or ⇧↑ ⇧↓ from a picked block pick a run, and a box
 * drawn from the margin picks every block it touches. Each picked block wears its own soft box (haligtree-editor.scss
 * `.mf-picked`), a list's items each their own. Picked, they answer ⌫, ⌘C, ⌘X (the editor's own, on the pick), ⌘D,
 * Tab and ⇧Tab, and the grip's menu acts on them all; carried by any one's grip, they go together (lib/block-carry.tsx).
 * Esc, Enter or a click in the words lets go.
 *
 * The pick is TipTap's own run of whole blocks (the drag handle's NodeRangeSelection): one run of blocks side by side
 * in one parent, except that a list at either end the run reaches only part of gives the items it reached, as Notion
 * picks them; a list reached whole is the list, its items each boxed.
 */

/** A list's own items: each picked block of its own. */
export const ITEMS = new Set(["listItem", "taskItem"])

/** Told to a note's own element: "Move to…" asked for its picked blocks by ⇧⌘P. */
export const MOVE_TO = "haligtree:move-picked"

/**
 * The pick. Read again from where its ends went whenever the note changes under it, at the depth they then share: a
 * change that moves the blocks (a carry out of a list) never leaves it reading a depth that is gone.
 */
export class Picked extends NodeRangeSelection {
  constructor($anchor: ResolvedPos, $head: ResolvedPos, depth: number) {
    super($anchor, $head, depth)
    // Into a list only as far as the pick's ends reach: its own ends then stand at those items, so it maps and undoes so.
    const ranges = touched(this.ranges, $anchor.min($head).pos, $anchor.max($head).pos)
    if (ranges === this.ranges) return
    const [$first, $last] = [ranges[0].$from, ranges[ranges.length - 1].$to]
    Object.assign(this, { ranges, ...($head.pos >= $anchor.pos ? { $anchor: $first, $head: $last } : { $anchor: $last, $head: $first }) })
  }

  map(doc: Block, mapping: Mappable): NodeRangeSelection {
    return pickBetween(doc, mapping.map(this.anchor), mapping.map(this.head)) as NodeRangeSelection
  }

  // ⌘Z puts the pick back with the blocks, read again the same way.
  getBookmark(): ReturnType<NodeRangeSelection["getBookmark"]> {
    return new Mark(this.anchor, this.head) as never
  }
}

/** A list the pick's ends (`from`, `to`) reach only part of: the items they reach, each a range of its own. */
function touched(ranges: readonly SelectionRange[], from: number, to: number): readonly SelectionRange[] {
  let split = false
  const out = ranges.flatMap((range) => {
    const list = range.$from.nodeAfter
    const start = range.$from.pos
    if (!list || !LISTS.has(list.type.name) || (from <= start && to >= range.$to.pos)) return [range]
    const items: SelectionRange[] = []
    list.forEach((item, offset) => {
      const at = start + 1 + offset
      if (at + item.nodeSize > from && at < to) items.push(new SelectionRange(range.$from.doc.resolve(at), range.$from.doc.resolve(at + item.nodeSize)))
    })
    // Every item reached: the list itself, as before.
    if (!items.length || items.length === list.childCount) return [range]
    split = true
    return items
  })
  return split ? out : ranges
}

class Mark {
  constructor(readonly anchor: number, readonly head: number) {}
  map(mapping: Mappable): Mark {
    return new Mark(mapping.map(this.anchor), mapping.map(this.head))
  }
  resolve(doc: Block): Selection {
    return pickBetween(doc, this.anchor, this.head)
  }
}

/** The whole blocks between two places, at the depth the two share; no whole block left between them, the words between. */
export function pickBetween(doc: Block, anchor: number, head: number): Selection {
  const [from, to] = anchor < head ? [anchor, head] : [head, anchor]
  const $from = doc.resolve(Math.max(0, Math.min(from, doc.content.size)))
  if (to <= from || to > doc.content.size) return Selection.near($from)
  const depth = $from.sharedDepth(to)
  if ($from.node(depth).inlineContent || !getSelectionRanges($from, doc.resolve(to), depth).length) return TextSelection.between($from, doc.resolve(to))
  return new Picked(doc.resolve(anchor), doc.resolve(head), depth)
}

/** From the block at `a` to the block at `b` (either way round), picked. */
export function pickRun(doc: Block, a: number, b: number): Selection {
  const end = (pos: number): number => pos + (doc.nodeAt(pos)?.nodeSize ?? 0)
  return a <= b ? pickBetween(doc, a, end(b)) : pickBetween(doc, end(a), b)
}

/** The blocks picked, each as it wears its box: a list picked whole is its items. Only the picked ones are read. */
export function pickedBlocks(selection: Selection): { pos: number; node: Block }[] {
  if (!(selection instanceof NodeRangeSelection)) return []
  const found: { pos: number; node: Block }[] = []
  for (const { $from } of selection.ranges) {
    const node = $from.nodeAfter
    if (!node) continue
    if (LISTS.has(node.type.name)) node.forEach((item, offset) => void found.push({ pos: $from.pos + 1 + offset, node: item }))
    else found.push({ pos: $from.pos, node })
  }
  return found
}

/** The pick's two ends, as blocks: where it was started from, and where it has grown to. */
function endsOf(selection: NodeRangeSelection): { anchor: number; head: number } {
  const first = selection.ranges[0].$from.pos
  const last = selection.ranges[selection.ranges.length - 1].$from.pos
  return selection.isForwards ? { anchor: first, head: last } : { anchor: last, head: first }
}

/** The block after (1) or before (-1) the one at `pos`: its next sibling, else the next of what holds it, out to the note's own blocks. */
function stepFrom(doc: Block, pos: number, dir: 1 | -1): number | null {
  let at = pos
  for (;;) {
    const $at = doc.resolve(at)
    const index = $at.index()
    if (dir > 0 && index + 1 < $at.parent.childCount) return at + $at.parent.child(index).nodeSize
    if (dir < 0 && index > 0) return at - $at.parent.child(index - 1).nodeSize
    if (!$at.depth) return null
    at = $at.before()
  }
}

/** A grip clicked: its block picked (kept, when it is one of a pick already: the menu then acts on them all); with ⇧, the run from the pick's start to it. */
export function pickFromGrip(view: EditorView, pos: number, grow: boolean): void {
  const { state } = view
  const { selection, doc } = state
  if (!doc.nodeAt(pos)) return
  const held = selection instanceof NodeRangeSelection && pos >= selection.from && pos < selection.to
  let next: Selection | null = held && !grow ? null : pickRun(doc, pos, pos)
  if (grow) {
    // From the pick's own start, else from the block the caret is in (the note's own block, or a list's item).
    const from = selection instanceof NodeRangeSelection ? endsOf(selection).anchor : selection instanceof NodeSelection && selection.node.isBlock ? selection.from : blockOf(doc, selection.from)
    if (from !== null) next = pickRun(doc, from, pos)
  }
  if (next && !next.eq(selection)) view.dispatch(state.tr.setSelection(next))
  view.focus()
}

/** The block a place is in, as a pick takes it: a list's item, else the note's own block. */
function blockOf(doc: Block, pos: number): number | null {
  const $at = doc.resolve(pos)
  for (let depth = $at.depth; depth > 0; depth--) if (ITEMS.has($at.node(depth).type.name)) return $at.before(depth)
  return $at.depth ? $at.before(1) : null
}

/** A copy of the picked blocks, right after them, picked in their place: the copies take no lasting names. */
export function duplicatePicked(view: EditorView): boolean {
  const { state } = view
  const { selection } = state
  if (!(selection instanceof NodeRangeSelection)) return false
  const unnamed = (fragment: Fragment): Fragment => {
    const nodes: Block[] = []
    fragment.forEach((node) => void nodes.push(node.isText ? node : node.type.create(node.attrs.blockId === undefined ? node.attrs : { ...node.attrs, blockId: null }, unnamed(node.content), node.marks)))
    return Fragment.from(nodes)
  }
  const content = unnamed(state.doc.slice(selection.from, selection.to).content)
  // After the run's last block: a pick that reaches into a list ends among its items, where a copy of the rest cannot stand.
  const depth = selection.depth ?? 0
  const at = selection.$to.depth > depth ? selection.$to.after(depth + 1) : selection.to
  const tr = state.tr.insert(at, content)
  view.dispatch(tr.setSelection(pickBetween(tr.doc, at, at + content.size)).scrollIntoView())
  return true
}

/** Tab or ⇧Tab on picked list items: in under the item above, or out a level, one step for ⌘Z, still picked. */
function shift(view: EditorView, selection: NodeRangeSelection, out: boolean): boolean {
  const items = pickedBlocks(selection)
  const type = items[0]?.node.type
  const [first, last] = [items[0], items[items.length - 1]]
  // Only items of one list move a level: other blocks have no level to move.
  if (!type || !ITEMS.has(type.name) || items.some((one) => one.node.type !== type) || selection.ranges.length !== (selection.ranges[0].$from.nodeAfter?.type === type ? items.length : 1)) return chime("nope"), true
  // The list's own command, on the items' words (what it reads), and the items picked again where they went.
  const { state } = view
  const inside = state.apply(state.tr.setSelection(TextSelection.between(state.doc.resolve(first.pos + 1), state.doc.resolve(last.pos + last.node.nodeSize - 1))))
  const moved = (out ? liftListItem : sinkListItem)(type)(inside, (tr) => view.dispatch(tr.setSelection(pickBetween(tr.doc, tr.mapping.map(first.pos, 1), tr.mapping.map(last.pos + last.node.nodeSize, -1)))))
  if (!moved) chime("nope")
  return true
}

export const PickedBlocks = Extension.create({
  name: "pickedBlocks",
  // Ahead of the other keys: a pick's Enter, Tab and Escape never reach what would write over it.
  priority: 1000,

  addProseMirrorPlugins() {
    // Worked out once per pick: the view asks on every update.
    let last: { doc: Block; from: number; to: number; set: DecorationSet } | null = null
    return [
      new Plugin({
        view: () => (installBox(), {}),
        props: {
          decorations: (state) => {
            const { selection, doc } = state
            if (!(selection instanceof NodeRangeSelection)) return null
            if (last && last.doc === doc && last.from === selection.from && last.to === selection.to) return last.set
            const set = DecorationSet.create(doc, pickedBlocks(selection).map(({ pos, node }) => Decoration.node(pos, pos + node.nodeSize, { class: "mf-picked" })))
            last = { doc, from: selection.from, to: selection.to, set }
            return set
          },
          // Typed over a pick, a letter goes nowhere: the blocks are never written over by a stray key.
          handleTextInput: (view) => view.state.selection instanceof NodeRangeSelection,
          handleKeyDown: (view, event) => {
            const { selection, doc } = view.state
            const picked = selection instanceof NodeRangeSelection
            const plain = !event.metaKey && !event.ctrlKey && !event.altKey
            // ⇧↑ ⇧↓ from a picked block (a run, or a picture or card picked alone): the run grows or shrinks a block.
            if (plain && event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
              const ends = picked ? endsOf(selection) : selection instanceof NodeSelection && selection.node.isBlock ? { anchor: selection.from, head: selection.from } : null
              if (!ends) return false
              const head = stepFrom(doc, ends.head, event.key === "ArrowDown" ? 1 : -1)
              if (head !== null) view.dispatch(view.state.tr.setSelection(pickRun(doc, ends.anchor, head)).scrollIntoView())
              return true
            }
            if (!picked) return false
            if (event.key === "Escape" || (event.key === "Enter" && plain && !event.shiftKey)) {
              // Let go: the caret at the end of the last block picked, as a click there would leave it.
              const end = selection.ranges[selection.ranges.length - 1].$to.pos
              view.dispatch(view.state.tr.setSelection(Selection.near(doc.resolve(end), -1)))
              return true
            }
            if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) return shift(view, selection, event.shiftKey)
            if (event.code === "KeyD" && event.metaKey && !event.shiftKey && !event.altKey && !event.ctrlKey) return duplicatePicked(view)
            // ⇧⌘P, Notion's "Move to": the grip's menu asks which note (components/turn-into/block-menu.tsx).
            if (event.code === "KeyP" && event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey) return view.dom.dispatchEvent(new CustomEvent(MOVE_TO)), true
            return false
          },
        },
      }),
    ]
  },
})

/* The box drawn from the margin ------------------------------------------------------------------------------------ */

/** How far the pointer goes before a press in the margin starts the box, as the grip's carry lifts. */
const START = 4

type Box = {
  view: EditorView
  /** Where the press was, and the note's scroll then. */
  x: number
  y: number
  top: number
  scroller: HTMLElement
  drawn: HTMLElement | null
  onPage: boolean
  /** The pointer, last heard. */
  at: { x: number; y: number }
  /** The block the press was level with, read as the box starts, while it is in sight. */
  anchor: number | null
  /** Held at the note's top or bottom edge, the note scrolls on, as under a carried block. */
  edge: ReturnType<typeof edgeScroll>
}
let box: Box | null = null

/**
 * The editor whose bare margin was pressed: the page itself in its padding, or a bare box holding it (its scroller,
 * the page round it), level with its words and inside the box that holds it. Never a control: those are the target.
 */
function marginOf(target: EventTarget | null, x: number, y: number): EditorView | null {
  if (!(target instanceof HTMLElement)) return null
  const roots = target.classList.contains("ProseMirror") ? [target] : [...target.querySelectorAll<HTMLElement>(".haligtree-editor-wrapper.has-handles .ProseMirror")]
  for (const root of roots) {
    const view = (root as HTMLElement & { editor?: { view: EditorView } }).editor?.view
    const page = root.closest(".haligtree-editor-wrapper")?.parentElement?.getBoundingClientRect()
    const box = root.getBoundingClientRect()
    if (view?.editable && root.closest(".has-handles") && page && x >= page.left && x <= page.right && y >= box.top && y <= box.bottom) return view
  }
  return null
}

/** The words' own column: inside the page's padding. */
function columnOf(view: EditorView): { left: number; right: number; top: number; bottom: number } {
  const area = view.dom.getBoundingClientRect()
  const style = getComputedStyle(view.dom)
  return { left: area.left + (parseFloat(style.paddingLeft) || 0), right: area.right - (parseFloat(style.paddingRight) || 0), top: area.top + (parseFloat(style.paddingTop) || 0), bottom: area.bottom - (parseFloat(style.paddingBottom) || 0) }
}

/**
 * The block level with a height in the column: a list's item, else the note's own block. In the gap between two
 * blocks, the one the box's edge has reached: above the gap for its foot (`side` -1), below it for its head (1).
 */
function blockAtY(view: EditorView, x: number, y: number, side: 1 | -1): number | null {
  const found = view.posAtCoords({ left: x, top: y })
  if (!found) return null
  const { doc } = view.state
  const at = found.inside >= 0 ? found.inside : found.pos
  const node = found.inside >= 0 ? doc.nodeAt(at) : null
  if (node?.isLeaf && node.isBlock && doc.resolve(at).depth === 0) return at
  const $at = doc.resolve(at)
  if (!node && !$at.parent.inlineContent) {
    const next = side > 0 ? $at.nodeAfter ?? $at.nodeBefore : $at.nodeBefore ?? $at.nodeAfter
    if (!next) return null
    const start = next === $at.nodeAfter ? at : at - next.nodeSize
    return next.isLeaf && !$at.depth ? start : blockOf(doc, next.isLeaf ? start : start + 1)
  }
  return blockOf(doc, node && !node.isLeaf ? at + 1 : at)
}

function press(event: PointerEvent): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || box) return
  const view = marginOf(event.target, event.clientX, event.clientY)
  if (!view) return
  const column = columnOf(view)
  // Beside the words, never on them: a press in the words is the words' own (a caret, a text selection); and under
  // the last line is the note's end (lib/press-under.ts).
  if (event.clientX >= column.left - 2 && event.clientX <= column.right + 2) return
  if (event.clientY > (view.dom.lastElementChild?.getBoundingClientRect().bottom ?? Infinity)) return
  const scroller = (view.dom.closest(".haligtree-editor-content") as HTMLElement | null) ?? view.dom
  // No caret moved and no words picked by the press itself: the box, or a click, decides.
  event.preventDefault()
  const at = { x: event.clientX, y: event.clientY }
  box = { view, ...at, top: scroller.scrollTop, scroller, drawn: null, onPage: event.target === view.dom, at, anchor: null, edge: edgeScroll(scroller) }
  window.addEventListener("pointermove", move, true)
  window.addEventListener("pointerup", up, true)
  window.addEventListener("pointercancel", stop, true)
  window.addEventListener("keydown", key, true)
  // The note scrolling under a still pointer (at its edge) grows the box with it.
  scroller.addEventListener("scroll", scrolled, { passive: true })
}

function move(event: PointerEvent): void {
  const one = box
  if (!one) return
  if (!(event.buttons & 1)) return stop()
  one.at = { x: event.clientX, y: event.clientY }
  draw(one)
}

const scrolled = (): void => void (box?.drawn && draw(box))

/** The box from the press to the pointer, and the blocks it touches picked. */
function draw(one: Box): void {
  const { x, y } = one.at
  // Where the press was, moved with the note's scroll since.
  const y0 = one.y - (one.scroller.scrollTop - one.top)
  const column = columnOf(one.view)
  if (!one.drawn) {
    if (Math.hypot(x - one.x, y - y0) < START) return
    one.drawn = Object.assign(document.createElement("div"), { className: "mf-pick-box" })
    one.drawn.setAttribute("aria-hidden", "true")
    document.body.append(one.drawn)
    // The box's head when it is drawn down, its foot when drawn up.
    one.anchor = blockAtY(one.view, column.left + 1, Math.min(Math.max(y0, column.top + 1), column.bottom - 1), y >= y0 ? 1 : -1)
    one.view.focus()
  }
  one.edge.follow(y)
  const [left, right, top, bottom] = [Math.min(one.x, x), Math.max(one.x, x), Math.min(y0, y), Math.max(y0, y)]
  // Drawn in the note's own room: what has scrolled out of sight is still in it, never drawn over the page's head.
  const room = one.scroller.getBoundingClientRect()
  const [shown, foot] = [Math.max(top, room.top), Math.min(bottom, room.bottom)]
  Object.assign(one.drawn.style, { translate: `${left}px ${shown}px`, width: `${right - left}px`, height: `${Math.max(0, foot - shown)}px` })
  // What it touches: the blocks from the press's to the pointer's, once it reaches the words' column.
  const { state } = one.view
  let next: Selection = Selection.near(state.selection.$head)
  if (right >= column.left && left <= column.right && bottom >= column.top && top <= column.bottom) {
    const at = blockAtY(one.view, column.left + 1, Math.min(Math.max(y, column.top + 1, room.top + 1), column.bottom - 1, room.bottom - 1), y >= y0 ? -1 : 1)
    if (one.anchor !== null && at !== null) next = pickRun(state.doc, one.anchor, at)
  }
  if (!next.eq(state.selection)) one.view.dispatch(state.tr.setSelection(next))
}

function up(event: PointerEvent): void {
  const one = box
  stop()
  if (!one) return
  // A click in the page's own margin, not a box: the caret to the line beside it, as before. Further out, a click
  // only lets go of a pick.
  if (!one.drawn) {
    const column = columnOf(one.view)
    const found = one.onPage ? one.view.posAtCoords({ left: Math.min(Math.max(event.clientX, column.left + 1), column.right - 1), top: event.clientY }) : null
    const { state } = one.view
    if (found) one.view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(found.pos))))
    else if (state.selection instanceof NodeRangeSelection) one.view.dispatch(state.tr.setSelection(Selection.near(state.selection.$head)))
    if (found) one.view.focus()
    return
  }
  if (one.view.state.selection instanceof NodeRangeSelection) chime("select")
}

/** Esc while drawing: the box and what it picked go. */
function key(event: KeyboardEvent): void {
  if (event.key !== "Escape" || !box) return
  event.preventDefault()
  event.stopPropagation()
  const { view } = box
  stop()
  if (view.state.selection instanceof NodeRangeSelection) view.dispatch(view.state.tr.setSelection(Selection.near(view.state.selection.$head)))
}

function stop(): void {
  box?.drawn?.remove()
  box?.edge.stop()
  box?.scroller.removeEventListener("scroll", scrolled)
  box = null
  window.removeEventListener("pointermove", move, true)
  window.removeEventListener("pointerup", up, true)
  window.removeEventListener("pointercancel", stop, true)
  window.removeEventListener("keydown", key, true)
}

let installed = false
/** Once for the whole page: every note with grips draws the box the same way. */
function installBox(): void {
  if (installed) return
  installed = true
  window.addEventListener("pointerdown", press, true)
}
