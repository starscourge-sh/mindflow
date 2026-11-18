import { createRoot, type Root } from 'react-dom/client'
import type { EditorView } from '@tiptap/pm/view'
import { NodeSelection } from '@tiptap/pm/state'
import { Fragment, type Node as Block } from '@tiptap/pm/model'
import { Bookmark, Code, Columns2, Heading, Image, List, ListOrdered, ListTodo, Minus, Quote, Table, Type } from 'lucide-react'
import { CardAt, CarriedCard, CarriedCount, DropLine, RoomAt, clearWay, makeWay, rester, restBox, roomWait, sideOf, swallowClick, swallowRelease, type Spot } from '@/components/haligtree/carry'
import { LISTS, MOST, columnFor, dropBeside, moveBlocks, takeOut, type Beside } from '@/extensions/columns'
import { ITEMS, pickBetween } from '@/extensions/picked-blocks'
import { NodeRangeSelection } from '@tiptap/extension-node-range'
import { chime } from './sound'
import { slotTicker } from './proximity'
import { still } from './motion'
import { cut } from '../../../main/clip'
import '@/lib/carry-cursor'

/**
 * A note's block carried by its grip, as the sidebar carries a folder (side-folders.tsx), in the one look every carry
 * has (components/haligtree/carry.tsx): past 5px the block lifts into the carried card, with its words (or its picture)
 * and what letting go would do; its own place is the quiet band; the blocks between glide aside on the one clock to
 * open room where it will land, the band with the one line through it; each new place a tick. Near another block's
 * outer quarter a line stands up beside that block, which leans aside: letting go makes a row of columns. Esc, or
 * letting go anywhere it cannot land, puts it back. The move is one step ⌘Z takes back.
 *
 * Carried by the pointer itself, not the browser's drag: during that, the pointer cannot be the grabbing hand.
 */

/** The block the grip stands beside now, as the drag handle says (its `onNodeChange`): what a carry from it lifts. */
const gripped = new WeakMap<EditorView, number>()
export const gripOn = (view: EditorView, pos: number): void => void gripped.set(view, pos)

/** How far the pointer goes with the button held before the block lifts: the sidebar's own. */
const LIFT = 5
/**
 * Where a block carried near another's side goes beside it: its right quarter (and past it), and at its left a band
 * 20px into its words (a carry from the grip drifts 30px and more into the words on its way down, and
 * that must stay a carry down).
 */
const SIDE = 0.25
const NEAR_LEFT = 20

type Piece = { el: HTMLElement; pos: number; end: number; node: Block }
type Aim =
  | { kind: 'line'; gap: number; at: number; by: Piece; key: string; holds: string }
  | { kind: 'beside'; beside: Beside; box: { top: number; left: number; height: number; width: number }; lean: HTMLElement; words: string; refused: boolean; key: string; holds: string }
  | { kind: 'into'; into: Piece; words: string; key: string; holds: string }
type Held = {
  view: EditorView
  from: number
  to: number
  nodes: Block[]
  sources: HTMLElement[]
  /** The blocks it makes way among, in the note's order, as laid out at the lift. */
  pieces: Piece[]
  /**
   * Where each of them rests (the carried one among them, the rest in hand left out), from the note's top, read once at
   * the lift; a list's item carried among others, each item's own first line too (`head`), the middle it rests on to go in.
   */
  laid: { piece: Piece; top: number; height: number; left: number; width: number; head?: { top: number; height: number } }[]
  me: HTMLElement
  tall: number
  x: number
  y: number
  copy: boolean
  /** The column it sits in, if any (its content's start and end): carried out of it, its row keeps its other columns. */
  column: { start: number; end: number } | null
  aim: Aim | null
  room: Spot | null
  /**
   * The room's own name while it is drawn (RoomAt's `place`): a new one at each place the pointer brings it to, so it
   * waits there for the blocks to make way; kept while the note's scroll brings it on (`scrolled`), the blocks are there
   * at once and the band with its line stays in sight, moved.
   */
  place: string
  scrolled: boolean
  kept: { key: string; how: 'before' | 'after' } | null
  ticks: ReturnType<typeof slotTicker>
  ring: string
  title: string
  icon: React.ReactNode
  /** Resting on an item's middle, as a list's row rests on another to become its step (carry.tsx `rester`). */
  rest: ReturnType<typeof rester>
  /** Carried by the browser's own drag (a picture or file taken by itself): the system draws what is in hand. */
  away: boolean
  /** Lifted from a pick: let go, they are still picked where they land. */
  picked: boolean
  /** How many blocks are in hand, as their boxes counted them (a list picked whole, its items): the card says it. */
  count: number
}

let held: Held | null = null
let down: { view: EditorView; pos: number; x: number; y: number } | null = null

/** The editor a grip belongs to: it sits beside the page it carries in. */
function viewOf(handle: HTMLElement): EditorView | null {
  for (let at = handle.parentElement; at; at = at.parentElement) {
    const root = at.querySelector<HTMLElement & { editor?: { view: EditorView } }>('.ProseMirror')
    if (root) return root.editor?.view ?? null
  }
  return null
}

/**
 * Written on the note's own blocks out of the editor's sight: seen, it reads a change as an edit and draws the block
 * again without it. The writes of one frame go together.
 */
const queued: (() => void)[] = []
function quietly(view: EditorView, change: () => void): void {
  queued.push(change)
  if (queued.length > 1) return
  queueMicrotask(() => {
    const all = queued.splice(0)
    const observer = view.isDestroyed ? null : (view as unknown as { domObserver?: { stop(): void; start(): void } }).domObserver
    observer?.stop()
    for (const one of all) one()
    observer?.start()
  })
}

/**
 * The blocks a carried one makes way among, in the note's order: each block of the note, a list's items standing for
 * the list, the carried block's own neighbours wherever it sits (inside a list item, a callout, a column: only its
 * own column, as the others stand beside it).
 */
function runOf(view: EditorView, from: number, to: number): Piece[] {
  const pieces: Piece[] = []
  const walk = (parent: Block, start: number, top: boolean): void =>
    parent.forEach((node, offset) => {
      const pos = start + offset
      const end = pos + node.nodeSize
      const inHand = pos >= from && end <= to
      const holds = !inHand && pos < from && to < end
      // A column carried by its own grip: its row stands as one piece, beside whose columns it can go.
      const ownRow = holds && node.type.name === 'columns' && view.state.doc.nodeAt(from)?.type.name === 'column'
      if (!inHand && !ownRow && node.type.name === 'columns') {
        if (holds) node.forEach((column, at) => void (pos + 1 + at < from && to < pos + 1 + at + column.nodeSize && walk(column, pos + 2 + at, false)))
        if (holds) return
      } else if (!inHand && !ownRow && (holds || (top && LISTS.has(node.type.name)))) return void walk(node, pos + 1, false)
      const el = view.nodeDOM(pos)
      if (el instanceof HTMLElement && el.getClientRects().length) pieces.push({ el, pos, end, node })
    })
  walk(view.state.doc, 0, true)
  return pieces
}

const KINDS: Record<string, [string, React.ComponentType<{ className?: string }>]> = {
  paragraph: ['', Type], heading: ['', Heading], listItem: ['', List], bulletList: ['', List], orderedList: ['', ListOrdered], taskItem: ['', ListTodo], taskList: ['', ListTodo],
  blockquote: ['Quote', Quote], codeBlock: ['Code', Code], table: ['Table', Table], horizontalRule: ['Divider', Minus], columns: ['Columns', Columns2], bookmark: ['Link', Bookmark], image: ['Picture', Image]
}
/** What the card says it carries: the block's first words, or what it is called (a link's title, a picture's words). */
function nameOf(node: Block): string {
  const words = node.textBetween(0, node.content.size, '\n', ' ').split('\n').map((line) => line.trim()).find(Boolean)
  const attrs = node.attrs as Record<string, unknown>
  const named = [attrs.title, attrs.alt, attrs.caption, attrs.label, attrs.name, attrs.href].find((one): one is string => typeof one === 'string' && !!one.trim())
  return cut(words ?? named ?? KINDS[node.type.name]?.[0] ?? '', 80) || (node.isTextblock ? 'Empty line' : 'Block')
}
/** Its picture where it has one (a picture, a link's card), else the mark of its kind. */
function iconOf(node: Block): React.ReactNode {
  const attrs = node.attrs as Record<string, unknown>
  const src = [attrs.src, attrs.image, attrs.icon].find((one): one is string => typeof one === 'string' && /^(https?|haligtree|data|file):/.test(one))
  if (src) return <img src={src} alt="" draggable={false} className="size-5 shrink-0 rounded-[4px] object-cover" />
  const Kind = KINDS[node.type.name]?.[1] ?? Type
  return <Kind className="size-3.5 shrink-0 text-muted-foreground" />
}

/** Lifts the block the grip is on (or the picked blocks round it, the handle's own rule), its place held. `away`: by the browser's own drag. */
function lift(view: EditorView, pos: number, x: number, y: number, copy: boolean, away = false): Held | null {
  const { state } = view
  const node = state.doc.nodeAt(pos)
  if (!node || !view.editable) return null
  let [from, to] = [pos, pos + node.nodeSize]
  const $pos = state.doc.resolve(pos)
  const { selection } = state
  // Picked blocks (extensions/picked-blocks.ts), the grip's own among them: all of them, together.
  const picked = selection instanceof NodeRangeSelection && pos >= selection.from && pos < selection.to
  if (picked) [from, to] = [selection.from, selection.to]
  else if (!selection.empty && !(selection instanceof NodeSelection)) {
    const [$a, $b] = [state.doc.resolve(selection.from), state.doc.resolve(selection.to)]
    const depth = $pos.depth
    if ($a.depth > depth && $b.depth > depth && $a.node(depth) === $pos.parent && $b.node(depth) === $pos.parent) {
      const [first, last] = [$a.before(depth + 1), $b.after(depth + 1)]
      if (first <= from && to <= last) [from, to] = [first, last]
    }
  }
  // What goes, as whole blocks: a pick that reaches into a list takes its items in a list of their own.
  const nodes: Block[] = []
  state.doc.slice(from, to).content.forEach((one) => void nodes.push(one))
  const sources: HTMLElement[] = []
  state.doc.nodesBetween(from, to, (one, at) => {
    if (at < from || at + one.nodeSize > to) return true
    const dom = view.nodeDOM(at)
    if (dom instanceof HTMLElement) sources.push(dom)
    return false
  })
  if (!sources.length) return null
  const pieces = runOf(view, from, to)
  const me = pieces.find((one) => one.pos === from)?.el ?? sources[0]
  const [first, last] = [sources[0].getBoundingClientRect(), sources[sources.length - 1].getBoundingClientRect()]
  // What the editor's own drop and the beside code read: the block in hand (lib/columns.ts draggedOf).
  ;(view as unknown as { dragging: unknown }).dragging = { slice: state.doc.slice(from, to), move: !copy, node: nodes.length === 1 ? NodeSelection.create(state.doc, from) : undefined }
  // A copy (⌥ held at the lift) leaves the block where it is, in sight: only the room where the copy lands opens.
  quietly(view, () => {
    if (!copy) for (const one of sources) (one.dataset.carried = ''), (one.dataset.carryHeld = '')
    view.dom.dataset.carrying = ''
  })
  const ticks = slotTicker()
  const ring = holderOf(view, from)
  ticks.start(`own:${from}`)
  const page = view.dom.getBoundingClientRect().top
  // A list's items in hand (never a copy): each other item's own first line is where it rests to go in under that one.
  const items = !copy && nodes.every((one) => ITEMS.has(one.type.name))
  const laid = pieces.filter((piece) => piece.el === me || !sources.includes(piece.el)).map((piece) => {
    const box = piece.el.getBoundingClientRect()
    const line = items && piece.el !== me && ITEMS.has(piece.node.type.name) ? view.nodeDOM(piece.pos + 1) : null
    const head = line instanceof HTMLElement ? line.getBoundingClientRect() : null
    return { piece, top: box.top - page, height: box.height, left: box.left, width: box.width, head: head ? { top: head.top - page, height: head.height } : undefined }
  }).sort((a, b) => a.top - b.top)
  const $in = state.doc.resolve(from)
  const column = $in.parent.type.name === 'column' ? { start: $in.start(), end: $in.end() } : null
  // Held still on an item's middle: the aim is read again, as no move comes.
  const rest = rester(() => void (held && point(held)))
  const count = nodes.reduce((sum, one) => sum + (picked && LISTS.has(one.type.name) ? one.childCount : 1), 0)
  return { view, from, to, nodes, sources, pieces, laid, me, tall: last.bottom - first.top, x, y, copy, column, aim: null, room: null, place: 'own', scrolled: false, kept: null, ticks, ring, title: nameOf(picked ? nodes[0] : node), icon: iconOf(picked ? nodes[0] : node), rest, away, picked, count }
}

/** What holds a place in the note: a crossing of it is the firm tick. */
const holderOf = (view: EditorView, at: number): string => {
  const $at = view.state.doc.resolve(Math.min(at, view.state.doc.content.size))
  return $at.depth ? `${$at.before()}` : 'note'
}

/** What letting go here would do, read off the blocks as they lay at the lift: so the room never chases itself. */
function aimOf(one: Held): Aim | null {
  const { view, x, y } = one
  const page = view.dom.getBoundingClientRect()
  // Off the note: nowhere, and letting go puts it back.
  if (x < page.left - 96 || x > page.right + 96 || y < page.top - 48 || y > page.bottom + 96) return null
  // Where each rests now: as at the lift, moved by as much as the note has scrolled since.
  const top = page.top
  const laid = one.laid.map((each) => ({ piece: each.piece, box: { top: top + each.top, height: each.height, left: each.left, width: each.width } }))
  let over = laid[0]
  let off = Infinity
  for (const each of laid) {
    const far = y < each.box.top ? each.box.top - y : y > each.box.top + each.box.height ? y - each.box.top - each.box.height : 0
    if (far < off) (off = far), (over = each)
  }
  if (!over) return null
  const beside = off === 0 && over.piece.el !== one.me ? besideOf(one, over.piece, over.box) : null
  if (beside) return beside
  // Rested on another item's own line, its middle: in under it. Until then, it only moves beside it.
  const head = one.laid[laid.indexOf(over)].head
  const middle = head ? (y - top - head.top) / Math.max(1, head.height) : -1
  const into = middle > 0.28 && middle < 0.72 ? intoOf(one, over.piece) : null
  if (!into) one.rest.undwell()
  else if (one.rest.rested(into.key)) return into
  const key = String(over.piece.pos)
  const how = sideOf(one.kept, key, (y - over.box.top) / Math.max(1, over.box.height))
  one.kept = { key, how }
  const index = laid.indexOf(over)
  const at = how === 'before' ? over.piece.pos : over.piece.end
  return { kind: 'line', gap: how === 'before' ? index - 1 : index, at, by: over.piece, key: `line:${at}`, holds: holderOf(view, at) }
}

/**
 * A list's items rested on another item: in under it, after its own items, as Tab puts an item under the one above.
 * The words are the lists' own: a task's step as in Tasks, any other item as a sidebar folder is moved into.
 */
function intoOf(one: Held, piece: Piece): Extract<Aim, { kind: 'into' }> | null {
  const list = one.view.state.doc.resolve(one.from).parent
  const item = piece.node
  if (!ITEMS.has(item.type.name) || !LISTS.has(list.type.name)) return null
  // Its last list takes them where it is of their kind; else a list of their kind goes at its end, where it may hold one.
  if (item.lastChild?.type !== list.type && !item.contentMatchAt(item.childCount).matchType(list.type)) return null
  // Short enough to leave the card room for what it carries: the words never wrap or push its title out.
  const whole = nameOf(item)
  const name = whole.length > 20 ? `${cut(whole, 19).trimEnd()}…` : whole
  const step = item.type.name === 'taskItem' && one.nodes[0].type.name === 'taskItem'
  return { kind: 'into', into: piece, words: step ? `Make it a step of “${name}”` : `Move into “${name}”`, key: `into:${piece.pos}`, holds: `into:${piece.pos}` }
}

/** Lets go on an item: the carried items go in under it, one step for ⌘Z. A list they emptied goes with them. */
function nestInto(one: Held, piece: Piece): boolean {
  const { view, from, to, nodes } = one
  const { state } = view
  const list = state.doc.resolve(from).parent
  const item = state.doc.nodeAt(piece.pos)
  if (!item) return false
  const join = item.lastChild?.type === list.type
  const at = piece.pos + item.nodeSize - (join ? 2 : 1)
  const tr = state.tr.deleteRange(from, to)
  tr.insert(tr.mapping.map(at), join ? Fragment.from(nodes) : list.type.create(null, nodes))
  view.dispatch(tr.setMeta('hideDragHandle', true))
  return true
}

/** The item letting go would put the carried ones under: lit as a sidebar folder is (haligtree-editor.scss). */
let lit: HTMLElement | null = null
function light(view: EditorView, el: HTMLElement | null): void {
  if (lit === el) return
  const was = lit
  lit = el
  quietly(view, () => {
    if (was) delete was.dataset.dropHot
    if (el) el.dataset.dropHot = ''
  })
}

/** Near the outer quarter of a block it can stand beside: where that row's new column would be. */
function besideOf(one: Held, piece: Piece, box: { top: number; left: number; height: number; width: number }): Aim | null {
  const { view, x } = one
  const { doc } = view.state
  // What a new column would hold: the blocks in hand (a list's items in a list of their own kind), never a copy.
  if (one.copy || !columnFor(doc, one.from, one.to)) return null
  const $from = doc.resolve(one.from)
  const $at = doc.resolve(piece.pos)
  // What it stands beside: a row's column (the one under the pointer, for a row itself), else the note's block holding it.
  let row: Block | null = null
  let rowPos = -1
  let pos = $at.depth ? $at.before(1) : piece.pos
  let dom = view.nodeDOM(pos)
  // A row's columns as laid out at rest: the row's own slide left out.
  let slid = 0
  if (piece.node.type.name === 'columns' || $at.node(1)?.type.name === 'columns') {
    rowPos = piece.node.type.name === 'columns' ? piece.pos : $at.before(1)
    row = doc.nodeAt(rowPos)
    if (!row) return null
    const rowEl = view.nodeDOM(rowPos)
    slid = rowEl instanceof HTMLElement ? new DOMMatrixReadOnly(getComputedStyle(rowEl).transform).m42 : 0
    // The column under the pointer, by its whole box: a narrow page stacks a row's columns one under another.
    let found = -1
    row.forEach((_column, offset) => {
      const el = view.nodeDOM(rowPos + 1 + offset)
      const area = el instanceof HTMLElement ? el.getBoundingClientRect() : null
      if (area && found < 0 && x >= area.left - 12 && x <= area.right + 12 && one.y >= area.top - slid - 8 && one.y <= area.bottom - slid + 8) found = rowPos + 1 + offset
    })
    if (found < 0) return null
    pos = found
    dom = view.nodeDOM(found)
  }
  const target = doc.nodeAt(pos)
  if (!target || !(dom instanceof HTMLElement)) return null
  // An empty line is a place to drop into, not beside.
  if (target.isTextblock && !target.content.size) return null
  // Beside what it is part of is where it already is.
  if (one.from >= pos && one.to <= pos + target.nodeSize && !row) return null
  // As laid out at rest: a row's column by the row's slide left out, any other block by its own.
  const drawn = dom.getBoundingClientRect()
  const area = row ? { top: drawn.top - slid, left: drawn.left, width: drawn.width, height: drawn.height } : pos === piece.pos ? box : restBox(dom)
  const side = x < area.left + Math.min(area.width * SIDE, NEAR_LEFT) ? 'left' : x > area.left + area.width * (1 - SIDE) ? 'right' : null
  if (!side || x < area.left) return null
  // Taken out of this row as it goes (all its column holds, or a column of it carried by its grip): one fewer there.
  const column = one.nodes.length === 1 && one.nodes[0].type.name === 'column'
  const whole = $from.parent.type.name === 'column' && one.from === $from.start() && one.to === $from.end()
  const leaving = !!row && (column ? $from.before() === rowPos : whole && $from.before($from.depth - 1) === rowPos)
  if (row && leaving && (column ? pos === one.from : $from.before() === pos)) return null
  const count = row ? row.childCount - (leaving ? 1 : 0) : 1
  const refused = count >= MOST
  const beside: Beside = { kind: row ? 'column' : 'wrap', pos, side }
  const words = refused ? `A row holds ${MOST} side by side at most` : row ? `Add a column, ${count + 1} side by side` : 'Side by side'
  return { kind: 'beside', beside, box: { top: area.top, left: area.left, height: area.height, width: area.width }, lean: dom, words, refused, key: `beside:${pos}:${side}`, holds: `beside:${pos}` }
}

/** The block a carried one would stand beside leans away from its line, a little; `now`, it is simply back. */
let leaning: { el: HTMLElement; move: Animation } | null = null
function lean(el: HTMLElement | null, by: number, now = false): void {
  if (leaning?.el === el) return
  const was = leaning
  leaning = null
  if (was && now) was.move.cancel()
  else if (was) {
    was.move.reverse()
    was.move.onfinish = () => was.move.cancel()
  }
  if (!el || still()) return
  leaning = { el, move: el.animate([{ translate: '0 0' }, { translate: `${by}px 0` }], { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'forwards' }) }
}
/** Reads the aim afresh, makes way for it, ticks a new place and draws the card; `again`, the note scrolled under it: the room and its line are placed again too. */
function point(one: Held, again = false): void {
  const next = aimOf(one)
  if (again || next?.key !== one.aim?.key) {
    // A new place the scroll brought under a still pointer: the scroll is the motion, so the blocks are there at once
    // and the room keeps its name (the band and its line in sight, moved); a new place the pointer brought, a new room.
    if (next?.key !== one.aim?.key) (one.scrolled = again), (one.place = again ? one.place : next?.key ?? 'own')
    const now = one.scrolled
    one.aim = next
    const quiet = (change: () => void): void => quietly(one.view, change)
    const all = one.pieces.filter((piece) => piece.el === one.me || !one.sources.includes(piece.el)).map((piece) => piece.el)
    if (next?.kind === 'line') {
      // Its own place is where it lands in the note, not its neighbour in the run: a column's last block (or a list's
      // last item) carried to just past its row (or list) moves out, though nothing comes between them in the run. It
      // closes nothing there (its row keeps its other column), so only the room where it lands opens.
      // Out of its column to anywhere, the same: its row stands as it was, its other columns holding it open.
      const me = one.laid.findIndex((each) => each.piece.el === one.me)
      const away = !!one.column && (next.at < one.column.start || next.at > one.column.end)
      // A copy leaves no place to close over: its block stays.
      const leaves = one.copy || away || (next.at !== one.from && next.at !== one.to && (next.gap === me || next.gap === me - 1))
      const spot = leaves ? makeWay(all.filter((el) => el !== one.me), one.me, next.gap >= me ? next.gap - 1 : next.gap, one.tall, quiet, now) : makeWay(all, one.me, next.gap, one.tall, quiet, now)
      // At the level it would land: beside the block it goes before or after.
      const by = restBox(next.by.el)
      one.room = spot && { ...spot, left: by.left, width: by.width }
      lean(null, 0)
    } else {
      // Beside a block, into an item, or nowhere: nothing opens, all at home, its own place the band.
      makeWay(all, one.me, null, one.tall, quiet, now)
      const home = restBox(one.me)
      one.room = one.copy ? null : { ...home, height: one.tall, own: true }
      lean(next?.kind === 'beside' && !next.refused ? next.lean : null, next?.kind === 'beside' ? (next.beside.side === 'left' ? 8 : -8) : 0)
    }
    // Its own line lit (a task's line sits inside the task's own view, which keeps nothing written on itself).
    const line = next?.kind === 'into' ? one.view.nodeDOM(next.into.pos + 1) : null
    light(one.view, line instanceof HTMLElement ? line : null)
    if (next?.kind === 'beside' && next.refused) document.documentElement.dataset.dragRefused = ''
    else delete document.documentElement.dataset.dragRefused
    const holds = next ? next.holds : one.ring
    const own = !next || (next.kind === 'line' && !!one.room?.own)
    one.ticks(own ? `own:${one.from}` : next!.key, holds !== one.ring)
    one.ring = holds
  }
  draw()
}

/** Lets go: where the card said (a move, or a row of columns), or back home (Esc, nowhere, a refusal). `heard`: its sound. */
function end(drop: boolean, heard = true): void {
  const one = held
  held = null
  down = null
  stopListening()
  if (!one) return
  const { view, aim, sources, from, to, nodes } = one
  delete document.documentElement.dataset.dragging
  delete document.documentElement.dataset.dragRefused
  delete document.documentElement.dataset.blockCarry
  let moved = false
  one.rest.undwell()
  light(view, null)
  if (drop && aim && !view.isDestroyed) {
    if (aim.kind === 'beside' && !aim.refused) moved = dropBeside(view, true, aim.beside, { from, to, node: nodes.length === 1 ? nodes[0] : null })
    else if (aim.kind === 'into') moved = nestInto(one, aim.into)
    else if (aim.kind === 'line' && !one.room?.own) {
      const tr = view.state.tr
      const content = Fragment.from(nodes)
      const dragged = nodes.length === 1 ? NodeSelection.create(view.state.doc, from) : null
      if (one.copy) moved = !!tr.insert(aim.at, content)
      // A column out of its row stands alone: its blocks go in at the line, and its row folds as it leaves.
      else if (dragged && nodes[0].type.name === 'column') moved = !!(tr.insert(aim.at, nodes[0].content), takeOut(tr, dragged), true)
      else moved = moveBlocks(tr, { from, to }, dragged, aim.at, content)
      // Carried from a pick, they are still picked where they landed, as Notion leaves them.
      if (moved && one.picked) tr.setSelection(pickBetween(tr.doc, tr.mapping.map(aim.at, -1), tr.mapping.map(aim.at, 1)))
      // The handle forgets the block it was on: left alone it keeps a position from before the move.
      if (moved) view.dispatch(tr.setMeta('hideDragHandle', true))
    }
  }
  ;(view as unknown as { dragging: unknown }).dragging = null
  // Let go with a move: at once as the drop left it, nothing gliding there a second time. Put back: they glide home.
  clearWay(moved)
  lean(null, 0, moved)
  quietly(view, () => {
    for (const el of sources) delete el.dataset.carried, delete el.dataset.carryHeld
    delete view.dom.dataset.carrying
  })
  draw()
  if (heard) chime(moved ? 'gather' : 'stay')
  if (moved) view.focus()
}

/* The card and the room, drawn by carry.tsx's own pieces ------------------------------------------------------------ */

let root: Root | null = null
function draw(): void {
  const one = held
  if (!root) {
    if (!one) return
    const host = Object.assign(document.createElement('div'), { className: 'contents' })
    host.dataset.blockCarryLayer = ''
    document.body.append(host)
    root = createRoot(host)
  }
  if (!one) return root.render(null)
  const { aim, room } = one
  const many = one.count > 1 ? one.count : 0
  const words = !aim ? null : aim.kind !== 'line' ? aim.words : room?.own ? null : `${one.copy ? 'Copy' : 'Move'}${many ? ` ${many}` : ''} here`
  const side = aim?.kind === 'beside' ? aim : null
  root.render(
    <>
      {/* Carried by the browser's own drag, the system draws what is in hand (the picture, or the file's card): one thing in the hand. */}
      {!one.away && (
        <CardAt x={one.x} y={one.y}>
          <div className="relative">
            <CarriedCard attrs={{ 'data-block-card': '' }} icon={one.icon} title={one.title} words={words} refused={!!side?.refused} />
            {/* How many, hanging under the card, as Writing's lists carry several. */}
            {many ? <CarriedCount n={many} /> : null}
          </div>
        </CardAt>
      )}
      {room && <RoomAt at={room} how={aim?.kind === 'line' ? `block:${aim.at}` : 'own'} place={aim?.kind === 'line' ? one.place : 'own'} now={one.scrolled} />}
      {/* Beside a block: the line stands up at the seam its new column will open at, the height of the block. */}
      {side && !side.refused && (
        <DropLine fixed upright how={`beside:${side.beside.side}`} style={{ top: side.box.top, height: side.box.height, left: side.beside.side === 'left' ? side.box.left - 10 : side.box.left + side.box.width + 8, animation: roomWait() }} />
      )}
    </>
  )
}

/* The pointer and the keys -------------------------------------------------------------------------------------------- */

/** In hand: the page knows it is carrying, the column's grip goes, and (`heard`) the lift is heard. */
function begin(heard: boolean): void {
  document.documentElement.dataset.dragging = ''
  document.documentElement.dataset.blockCarry = ''
  hideColumnGrip()
  if (heard) chime('lift')
}

function move(event: PointerEvent): void {
  if (!down) return
  if (!(event.buttons & 1)) return end(false)
  if (!held) {
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) < LIFT) return
    held = lift(down.view, down.pos, event.clientX, event.clientY, event.altKey)
    if (!held) return void ((down = null), stopListening())
    begin(true)
  }
  held.x = event.clientX
  held.y = event.clientY
  point(held)
}

/* A picture or file carried by itself: the browser's own drag, or the system's (extensions/drag-out.ts) ---------------- */

/**
 * Taken by its body, a picture or file goes by the browser's own drag (the system's, for one kept in the app, carrying
 * the real file): it can leave for other apps. Over its own note the blocks make way for it as for the grip's carry, the
 * room with its line, a tick a place, its own place the band, and let go there it moves, one step for ⌘Z. Out of the
 * window everything is at home again, the block back in sight; brought back in, the room opens again.
 */
let away: { view: EditorView; pos: number; heard: boolean; landed: boolean; x: number; y: number } | null = null
const AWAY = ['dragover', 'drop', 'dragleave', 'dragend', 'pointerdown', 'pointermove'] as const
const IN_NOTE = ['dragenter', 'dragover', 'drop'] as const
export function carryAway(view: EditorView, pos: number): void {
  forget()
  away = { view, pos, heard: false, landed: false, x: NaN, y: NaN }
  for (const kind of AWAY) window.addEventListener(kind, heardAway, true)
  for (const kind of IN_NOTE) view.dom.addEventListener(kind, inNote, true)
}
/** The drag is over: ended, or the pointer is pressed or moves with no button held (the system's drag says no more). */
function forget(): void {
  const was = away
  if (!was) return
  away = null
  for (const kind of AWAY) window.removeEventListener(kind, heardAway, true)
  for (const kind of IN_NOTE) was.view.dom.removeEventListener(kind, inNote, true)
  if (held?.away) end(false, false)
}
/** Inside its own note the carry answers alone: the editor's drop line and drop never hear it (its edge scroll, round the note, does). */
const inNote = (event: Event): void => event.stopImmediatePropagation()
function heardAway(event: Event): void {
  const now = away
  if (!now) return
  if (event instanceof PointerEvent) return void ((event.type === 'pointerdown' || !event.buttons) && forget())
  const drag = event as DragEvent
  if (drag.type === 'dragend') return forget()
  // Out of the window: all home, the block in sight again, nothing heard (it may be landing in another app).
  if (drag.type === 'dragleave') return void (!drag.relatedTarget && held?.away && end(false, false))
  if (!held && drag.type === 'dragover' && !now.landed && !now.view.isDestroyed) {
    held = lift(now.view, now.pos, drag.clientX, drag.clientY, false, true)
    if (held) begin(!now.heard)
    now.heard = true
  }
  if (!held?.away) return
  // A field of its own beside the note (quick capture's “Who said it”) takes its own drops: not the note's to take there.
  const field = drag.target instanceof Element && !now.view.dom.contains(drag.target) && !!drag.target.closest('input, textarea, [contenteditable="true"]')
  // The browser says dragover again and again while the pointer rests: a rest at the note's edge is the note scrolling
  // under it, a new place the scroll brings (as the grip's carry hears it from the scroll itself).
  const still = drag.clientX === now.x && drag.clientY === now.y
  ;[now.x, now.y] = [drag.clientX, drag.clientY]
  held.x = field ? -1e4 : drag.clientX
  held.y = field ? -1e4 : drag.clientY
  if (drag.type === 'dragover') point(held, still)
  // Off its note, or beside a full row: not the note's to take, as for the grip; let go there, it is all home.
  const aim = held.aim
  const takes = !!aim && !(aim.kind === 'beside' && aim.refused)
  if (takes) drag.preventDefault()
  if (takes && drag.dataTransfer) drag.dataTransfer.dropEffect = 'move'
  if (drag.type === 'drop') (now.landed = true), end(takes, takes)
}
const up = (event: PointerEvent): void => {
  if (!held) return void ((down = null), stopListening())
  event.preventDefault()
  swallowClick()
  end(true)
}
const cancel = (): void => end(false)
const key = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape' || !held) return
  event.preventDefault()
  event.stopPropagation()
  swallowRelease()
  end(false)
}
/** The page scrolled under a still pointer (the note's own scroll at its edge): the aim is read again. */
const scrolled = (): void => void (held && point(held, true))
function stopListening(): void {
  window.removeEventListener('pointermove', move, true)
  window.removeEventListener('pointerup', up, true)
  window.removeEventListener('pointercancel', cancel, true)
  window.removeEventListener('keydown', key, true)
  window.removeEventListener('scroll', scrolled, true)
  window.removeEventListener('blur', cancel)
}

function press(event: PointerEvent): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey) return
  const target = event.target as HTMLElement | null
  const handle = target?.closest?.<HTMLElement>('.tiptap-drag-handle')
  const column = target?.closest?.('.mf-column-grip') ? gripColumn : null
  if (!handle && !column) return
  // ⇧ and the grip picks a run (its click: extensions/picked-blocks.ts), never a carry; and the press picks no words.
  if (event.shiftKey) return void event.preventDefault()
  const view = column ? column.view : viewOf(handle!)
  const pos = column ? column.pos : view ? gripped.get(view) : undefined
  if (!view || pos === undefined || pos < 0) return
  // No text picked and no focus moved by the press: a press alone still clicks (the grip's menu, the +).
  event.preventDefault()
  end(false)
  down = { view, pos, x: event.clientX, y: event.clientY }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', cancel, true)
  window.addEventListener('keydown', key, true)
  window.addEventListener('scroll', scrolled, true)
  window.addEventListener('blur', cancel)
}

/* A column's own grip ---------------------------------------------------------------------------------------------- */

/** One grip, over the top of the column the pointer is in, as the block grip stands by the block it is beside. */
let columnGrip: HTMLElement | null = null
let gripColumn: { view: EditorView; pos: number } | null = null
function overColumn(event: PointerEvent): void {
  if (held || down || event.buttons) return
  const target = event.target as HTMLElement | null
  if (target?.closest?.('.mf-column-grip')) return
  const column = target?.closest?.<HTMLElement>('.mf-column')
  const root = column?.closest<HTMLElement & { editor?: { view: EditorView } }>('.ProseMirror')
  const view = root?.editor?.view
  const pos = view && column ? view.posAtDOM(column, 0) - 1 : -1
  if (!view || !column || !view.editable || view.state.doc.nodeAt(pos)?.type.name !== 'column') return hideColumnGrip()
  gripColumn = { view, pos }
  const box = column.getBoundingClientRect()
  columnGrip ??= Object.assign(document.createElement('div'), { className: 'mf-column-grip', ariaLabel: 'Carry the column' })
  if (!columnGrip.firstChild) columnGrip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="9" r="1"/><circle cx="12" cy="9" r="1"/><circle cx="19" cy="9" r="1"/><circle cx="5" cy="15" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="19" cy="15" r="1"/></svg>'
  columnGrip.style.translate = `${Math.round(box.left + box.width / 2 - 10)}px ${Math.round(box.top - 11)}px`
  if (!columnGrip.isConnected) document.body.append(columnGrip)
  columnGrip.hidden = false
}
function hideColumnGrip(): void {
  gripColumn = null
  if (columnGrip) columnGrip.hidden = true
}

let installed = false
/** Once for the whole page: every editor's grip carries the same way. */
export function installBlockCarry(): void {
  if (installed) return
  installed = true
  window.addEventListener('pointerdown', press, true)
  // A column's grip shows over the column the pointer is in, and goes as the page scrolls under it.
  window.addEventListener('pointermove', overColumn, { capture: true, passive: true })
  window.addEventListener('scroll', hideColumnGrip, { capture: true, passive: true })
  // The browser's own drag of the grip never starts: the carry above is the one.
  window.addEventListener('dragstart', (event) => void ((event.target as HTMLElement | null)?.closest?.('.tiptap-drag-handle') && (event.preventDefault(), event.stopPropagation())), true)
}
