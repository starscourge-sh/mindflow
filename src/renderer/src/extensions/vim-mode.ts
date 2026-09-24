import { Extension } from "@tiptap/core"
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import { addRowAfter, goToNextCell, isInTable } from "@tiptap/pm/tables"
import type { EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { EditorView } from "@tiptap/pm/view"
import { Fragment } from "@tiptap/pm/model"
import type { Node as ProseMirrorNode, NodeType, ResolvedPos } from "@tiptap/pm/model"
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list"
import { undo, redo } from "@tiptap/pm/history"

// --- Lib ---
import { wordRangeAt } from "@/lib/word-range"

/**
 * A deliberately small vim mode. It is off unless you pass `enabled: true`.
 *
 *   modes         i I a A o O v(V) Esc
 *   motions       h j k l w e b 0 $ { } gg G, with counts (5j)
 *   scrolling     Ctrl-f Ctrl-b (page), Ctrl-d Ctrl-u (half page)
 *   operators     x dd yy diw yiw p J
 *   search        / opens the panel, n and N step through matches
 *   history       u, Ctrl-r
 *   insert        jk (typed as a chord) leaves insert mode
 *   Backspace     deletes and enters insert, from normal or visual
 *
 * ProseMirror is a tree, not a buffer, so "line" means the block under the
 * cursor - a paragraph, heading, or list item. `j`/`k` still move by visual
 * row, because they walk screen coordinates rather than positions.
 */

export type VimModeName = "normal" | "insert" | "visual" | "visualLine"

export interface VimModeOptions {
  /** Master switch. Everything below is inert while this is false. */
  enabled: boolean
  /** Called when `/` is pressed, so the app can open its search panel. */
  onSearch?: () => void
  /**
   * The document holds one line, as a title field does.
   *
   * Motions, text objects, case changes and the rest are unaffected. What
   * changes is the handful of commands that add or remove whole lines: there
   * is nowhere to open one, and taking the only paragraph away would leave a
   * document the schema refuses. `dd` and `yy` work on the line's text instead,
   * which in a one line document is the same thing a user means by them.
   */
  singleLine?: boolean
}

/** A yank is either whole blocks or a run of text, and `p` differs for each. */
type VimRegister =
  // The text as well as the nodes: a code block's lines live inside one node,
  // so there is nothing for `nodesInRange` to collect and only the text says
  // what was taken.
  | { kind: "line"; nodes: unknown[]; text: string }
  // `nodes` as well as the text, because an emoji or a picture is a node with
  // no text of its own: the text alone put back nothing at all.
  | { kind: "char"; text: string; nodes: unknown[] }
  | null

/** Everything an operator can be. `c` also drops into insert mode. */
type Operator = "d" | "y" | "c" | "gU" | "gu"

/** `>` and `<` wait for a target like an operator, but rewrite shape, not text. */
type Pending = Operator | ">" | "<"

interface LineSpan {
  from: number
  to: number
}

interface VimState {
  enabled: boolean
  mode: VimModeName
  /** Digits typed so far, e.g. "12" in `12j`. */
  count: string
  /** An operator waiting for its target, as in `dd`, `ciw` or `gUiw`. */
  operator: Pending | null
  /** Whether `g` was just pressed, for `gg`, `gU` and `gu`. */
  pendingG: boolean
  /** Whether `i` was just pressed, for the `iw` text object. */
  /** `i` or `a` was just pressed, for `iw` and `aw`. */
  pendingTextObject: "i" | "a" | null
  /** Where a visual selection started. */
  visualAnchor: number | null
  /**
   * Where the cursor is in a visual selection. Not the live selection head:
   * that one has been pushed a character further out so the character under
   * the cursor is highlighted, and measuring the next motion from there would
   * move twice as far.
   */
  visualHead: number | null
  /** The last visual selection, for `gv`. */
  lastVisual: { anchor: number; head: number; linewise: boolean } | null
  /** `r` waiting for the character to put in place. */
  pendingReplace: boolean
  /** `f`, `F`, `t` or `T` waiting for the character to look for. */
  pendingFind: FindKind | null
  /** The last one that ran, for `;` and `,`. */
  lastFind: { kind: FindKind; char: string } | null
  /** A `j` just typed in insert mode, for the `jk` escape. */
  pendingJ: { pos: number; at: number } | null
  /** Recent places a long motion left from, oldest first. */
  jumps: number[]
  /** Where `Ctrl-O` and `Ctrl-I` sit in that list; its length means the present. */
  jumpAt: number
  register: VimRegister
}

const vimPluginKey = new PluginKey<VimState>("vimMode")

/**
 * How long after typing `j` a `k` still counts as the escape chord. Beyond
 * this the two are treated as ordinary text - so `jk` in a word or a snippet
 * survives, as long as you did not type it as a chord.
 */
const JK_TIMEOUT_MS = 250

/** Keys that must not fall through to the browser's editing behaviour. */
const BLOCKED_NAMED_KEYS = ["Enter", "Delete", "Tab"]

/**
 * Keys that are not keystrokes.
 *
 * Holding shift fires its own keydown, so `>` arrives as `Shift` then `>` and
 * `gU` as `g`, `Shift`, `U`. Treating those as input would abandon the command
 * halfway through typing it.
 */
const MODIFIER_KEYS = ["Shift", "Control", "Alt", "Meta", "CapsLock"]

/** The four ways of jumping to a character on the line. */
type FindKind = "f" | "F" | "t" | "T"

const CLEARED = {
  count: "",
  operator: null,
  pendingG: false,
  pendingTextObject: null,
  pendingFind: null,
  pendingReplace: false,
} as const

/** Is a command half typed: a count, an operator, a prefix waiting for more? */
/** The waiting operator, if it is one a find can be a target for. */
const rangeOperator = (vim: VimState): Operator | null =>
  vim.operator === ">" || vim.operator === "<" ? null : vim.operator

const isPending = (vim: VimState): boolean =>
  !!(
    vim.count ||
    vim.operator ||
    vim.pendingG ||
    vim.pendingTextObject ||
    vim.pendingFind ||
    vim.pendingReplace
  )

const NORMAL = {
  mode: "normal" as const,
  visualAnchor: null,
  visualHead: null,
  pendingJ: null,
  ...CLEARED,
}

function patch(view: EditorView, next: Partial<VimState>): void {
  view.dispatch(view.state.tr.setMeta(vimPluginKey, next))
}

/**
 * `bias` is the direction to search when the position itself cannot hold a
 * cursor. Moving up out of a list lands between nodes, and searching forward
 * from there would drop straight back into the list.
 */
function select(view: EditorView, pos: number, bias: 1 | -1 = 1): void {
  const { state } = view
  const clamped = Math.max(0, Math.min(state.doc.content.size, pos))
  const $pos = state.doc.resolve(clamped)

  // A rule or an image holds no text, so `Selection.near` would search straight
  // past it and land in the block beyond. Select the node itself instead.
  const node = $pos.nodeAfter
  const selection =
    node && node.isBlock && node.isLeaf && NodeSelection.isSelectable(node)
      ? NodeSelection.create(state.doc, clamped)
      : TextSelection.near($pos, bias)

  view.dispatch(state.tr.setSelection(selection).scrollIntoView())
}

/**
 * Put the caret back onto a character.
 *
 * The block cursor sits on one, never past the last. A caret left at the end of
 * a line - by leaving insert mode after typing there, or by clicking past the
 * text - has nothing under it, and `x` and its friends quietly do nothing. The
 * motions already clamp; these are the other two ways in.
 */
function clampToLine(view: EditorView): void {
  const { $head, empty } = view.state.selection
  if (!empty || !$head.parent.isTextblock) return
  if ($head.pos !== $head.end() || $head.pos === $head.start()) return
  select(view, $head.pos - 1)
}

/**
 * How vim measures each motion when an operator is waiting on it.
 *
 * Exclusive is the default and stops short of where the cursor lands. Inclusive
 * takes the character under it as well, which is why `d$` clears the line and
 * `dw` leaves the next word alone. Linewise ignores columns entirely and takes
 * whole lines.
 */
const INCLUSIVE_MOTIONS = ["e", "$"]
const LINEWISE_MOTIONS = ["j", "k", "G"]

/** A bullet, a number or a checkbox: the things a list line can be. */
const isListItem = (type: NodeType): boolean =>
  type.name === "listItem" || type.name === "taskItem"

/**
 * Where the line under the cursor begins and ends inside its own textblock.
 *
 * Everywhere but a code block a block IS a line, so these are its own bounds. A
 * code block keeps many lines in one textblock separated by newlines, and
 * treating it as a single line is why `dd` used to delete the whole snippet and
 * `$` jumped to the bottom of it.
 */
function textLineAt($pos: ResolvedPos): { start: number; end: number } {
  const start = $pos.start()
  if (!$pos.parent.type.spec.code) return { start, end: $pos.end() }

  const text = $pos.parent.textContent
  const offset = $pos.pos - start
  const breaks = text.indexOf("\n", offset)
  return {
    start: start + text.lastIndexOf("\n", offset - 1) + 1,
    end: start + (breaks === -1 ? text.length : breaks),
  }
}

/**
 * The depth of the node acting as the current "line": a list item when the
 * cursor is in one, otherwise the block it sits in directly. Using the block
 * rather than the top-level ancestor keeps `dd` inside a blockquote or a table
 * cell from taking the whole container with it.
 */
function lineDepth($pos: ResolvedPos): number {
  for (let depth = $pos.depth; depth >= 1; depth--) {
    if (isListItem($pos.node(depth).type)) return depth
  }
  return Math.max(1, $pos.depth)
}

/**
 * Nest or lift every list item a range touches: `>` and `<`.
 *
 * In a document there is no whitespace to add to the front of a line, so these
 * mean the one thing indenting can mean here, which is moving an item in or out
 * a level. Anything that is not a list item is left alone rather than given a
 * fake indent.
 */
function indentLines(
  view: EditorView,
  from: number,
  to: number,
  out: boolean
): void {
  const { doc } = view.state
  const at = (pos: number): ResolvedPos =>
    doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))

  // `between` snaps to real text positions inside the blocks, which the ends of
  // a line span are not: they sit around the item, not in it.
  const covering = TextSelection.between(at(from), at(to))
  if (!inList(covering.$from)) return

  // Both commands read the selection, so covering the range is how a count, or
  // a visual selection, reaches more than one item.
  if (!view.state.selection.eq(covering)) {
    view.dispatch(view.state.tr.setSelection(covering))
  }

  const item = covering.$from.node(lineDepth(covering.$from)).type
  const run = out ? liftListItem : sinkListItem
  run(item)(view.state, view.dispatch)
  collapseSelection(view)
}

/** Is the cursor on a list item, where Tab nests and Shift-Tab lifts it? */
const inList = ($pos: ResolvedPos): boolean =>
  $pos.depth >= 1 && isListItem($pos.node(lineDepth($pos)).type)

/** The span of the line containing a position. */
function lineSpanAt(state: EditorState, pos: number): LineSpan | null {
  let $pos: ResolvedPos
  try {
    $pos = state.doc.resolve(Math.max(0, Math.min(state.doc.content.size, pos)))
  } catch {
    return null
  }
  if ($pos.depth < 1) return null

  if ($pos.parent.type.spec.code) {
    const line = textLineAt($pos)
    const text = $pos.parent.textContent
    // Take the newline with the line, so `dd` closes the gap. On the last line
    // there is none after it, so the one before it goes instead.
    if (line.end < $pos.start() + text.length) return { from: line.start, to: line.end + 1 }
    return { from: Math.max($pos.start(), line.start - 1), to: line.end }
  }

  const depth = lineDepth($pos)
  return { from: $pos.before(depth), to: $pos.after(depth) }
}

/** The span covering `count` lines starting at the cursor. */
function lineRange(state: EditorState, count: number): LineSpan | null {
  // A clicked image or rule is a whole-node selection with no textblock
  // around it, so the node itself is the line.
  if (state.selection instanceof NodeSelection) {
    return { from: state.selection.from, to: state.selection.to }
  }

  const { $head } = state.selection
  if ($head.depth < 1) return null

  const span = lineSpanAt(state, $head.pos)
  if (!span) return null

  const depth = lineDepth($head)
  const parent = $head.node(depth - 1)
  const index = $head.index(depth - 1)

  let { to } = span
  for (let i = 1; i < count; i++) {
    const next = parent.maybeChild(index + i)
    if (!next) break
    to += next.nodeSize
  }

  return { from: span.from, to }
}

function nodesInRange(
  state: EditorState,
  from: number,
  to: number
): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = []
  let pos = from
  while (pos < to) {
    const node = state.doc.resolve(pos).nodeAfter
    if (!node) break
    nodes.push(node)
    pos += node.nodeSize
  }
  return nodes
}

// --- motions ---------------------------------------------------------------

/** h and l - clamped to the current block, so they never wrap onto another. */
/**
 * `past` is for `a` and `A`, which type after a character. Normal mode sits *on*
 * one, so `l` and `$` stop one short of the same position. An infinite delta is
 * how `0` and `$` reach the line edges.
 */
function moveHorizontal(view: EditorView, delta: number, past = false): void {
  const { $head } = view.state.selection
  if (!$head.parent.isTextblock) return
  const line = textLineAt($head)
  const max = past ? line.end : Math.max(line.start, line.end - 1)
  select(view, Math.max(line.start, Math.min(max, $head.pos + delta)))
}

/**
 * Walk `count` visual rows from a position without touching the selection.
 * Screen coordinates are the only way to respect wrapped lines.
 *
 * Probing a single half-line is not enough: list padding, heading margins and
 * the gap around a horizontal rule are all several line-heights tall, so a
 * short hop lands back on the row it started from. Each step therefore probes
 * further and further until it finds a position on a genuinely different row.
 */
/**
 * Probes step in small pixel increments rather than by line height. Sampling a
 * line-height apart can straddle a shorter row entirely - a 21px row sitting
 * between two 24px samples is invisible - which shows up as `k` skipping the
 * last item of a list and landing on the one before it.
 */
const ROW_PROBE_STEP = 4
const MAX_ROW_PROBE_DISTANCE = 400

interface ScreenBox {
  top: number
  bottom: number
  left: number
}

/**
 * The screen box to walk away from.
 *
 * `coordsAtPos` reports a zero-height caret beside a leaf like an image or a
 * horizontal rule, so fall back to the node's own rectangle.
 */
function boxAt(view: EditorView, pos: number, nodePos?: number): ScreenBox | null {
  let box: ScreenBox
  try {
    const { top, bottom, left } = view.coordsAtPos(pos)
    box = { top, bottom, left }
  } catch {
    return null
  }

  const degenerate = box.bottom - box.top < 2
  if (!degenerate && nodePos === undefined) return box

  const dom = view.nodeDOM(nodePos ?? pos)
  const element =
    dom instanceof HTMLElement
      ? dom
      : dom instanceof Text
        ? dom.parentElement
        : null
  if (!element) return box

  const rect = element.getBoundingClientRect()
  if (rect.height <= 0) return box
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: degenerate ? rect.left + 2 : box.left,
  }
}

/** Every block you can put a selection in, including leaves like a rule. */
function blockRanges(doc: ProseMirrorNode): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      ranges.push({ from: pos + 1, to: pos + node.nodeSize - 1 })
      return false
    }
    // A horizontal rule or an image has no inside; the position before it is
    // what a selection lands on.
    if (node.isBlock && node.isLeaf) {
      ranges.push({ from: pos, to: pos + node.nodeSize })
      return false
    }
    return true
  })
  return ranges
}

/**
 * A single row of movement can never legitimately skip a whole block.
 *
 * Probing by screen coordinates can: stepping up from a paragraph whose left
 * edge sits outside an indented list, or past a rule that occupies a row but
 * holds no text, the probe resolves to a position beyond them entirely.
 *
 * Only a landing that clears the whole neighbouring block is corrected, so a
 * move that legitimately lands part-way into it keeps its column.
 */
function clampToNeighbour(
  state: EditorState,
  from: number,
  to: number,
  dir: 1 | -1
): number {
  const $from = state.doc.resolve(from)
  if (!$from.parent.isTextblock) return to

  const ranges = blockRanges(state.doc)

  if (dir < 0) {
    const previous = ranges.filter((range) => range.to < $from.start()).pop()
    return previous && to < previous.from ? previous.from : to
  }

  const next = ranges.find((range) => range.from > $from.end())
  return next && to > next.to ? next.from : to
}

function positionAfterRows(
  view: EditorView,
  start: number,
  dir: 1 | -1,
  count: number,
  startBox?: ScreenBox | null
): number {
  let pos = start

  for (let step = 0; step < count; step++) {
    const from = step === 0 && startBox ? startBox : boxAt(view, pos)
    if (!from) return pos

    let next = pos

    for (
      let offset = ROW_PROBE_STEP;
      offset <= MAX_ROW_PROBE_DISTANCE;
      offset += ROW_PROBE_STEP
    ) {
      const top = dir > 0 ? from.bottom + offset : from.top - offset

      let found: { pos: number } | null = null
      try {
        found = view.posAtCoords({ left: from.left, top })
      } catch {
        found = null
      }
      if (!found || found.pos === pos) continue

      // Must also be the right way through the document. Superscripts and
      // other raised inline boxes sit higher than the text they share a line
      // with, and would otherwise read as a row above.
      const rightWay = dir > 0 ? found.pos > pos : found.pos < pos
      if (!rightWay) continue

      const candidate = boxAt(view, found.pos)
      if (!candidate) continue

      // Clear of the starting box entirely, not merely offset within it.
      const onAnotherRow =
        dir > 0
          ? candidate.top >= from.bottom - 1
          : candidate.bottom <= from.top + 1
      if (onAnotherRow) {
        next = clampToNeighbour(view.state, pos, found.pos, dir)
        break
      }
    }

    if (next === pos) break
    pos = next
  }

  return pos
}

/** j and k - by visual row, dispatched once however far you travel. */
function moveVertical(view: EditorView, dir: 1 | -1, count: number): void {
  const { selection } = view.state

  // A whole node is selected - an image or a rule clicked on. Walk away from
  // the node's own rectangle, or every probe lands back inside it.
  if (selection instanceof NodeSelection) {
    const anchor = dir > 0 ? selection.to : selection.from
    const box = boxAt(view, anchor, selection.from)
    const to = positionAfterRows(view, anchor, dir, count, box)
    select(view, to === anchor ? anchor : to, dir)
    return
  }

  const from = selection.head
  const to = positionAfterRows(view, from, dir, count)
  if (to !== from) select(view, to, dir)
}

/** The first cursor position inside every textblock, in document order. */
function textblockStarts(doc: ProseMirrorNode): number[] {
  const starts: number[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    starts.push(pos + 1)
    return false
  })
  return starts
}

/** gg and G. `index` is 1-based; Infinity means the last block. */
function gotoBlock(view: EditorView, index: number): void {
  const starts = textblockStarts(view.state.doc)
  if (!starts.length) return

  const last = index === Infinity
  const i = last
    ? starts.length - 1
    : Math.min(starts.length, Math.max(1, index)) - 1
  select(view, starts[i])

  // scrollIntoView only scrolls the minimum, so the first block still sits
  // under the padding. gg and G mean the very top and the very bottom.
  if (i !== 0 && !last) return
  const scroller = scrollParent(view.dom as HTMLElement)
  const top = i === 0 ? 0 : (scroller?.scrollHeight ?? document.body.scrollHeight)
  if (scroller) scroller.scrollTop = top
  else window.scrollTo({ top })
}

/** Every character of every textblock, paired with its document position. */
function textStream(
  state: EditorState,
  from = 0,
  to = state.doc.content.size
): { pos: number; ch: string }[] {
  const stream: { pos: number; ch: string }[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    // A break between blocks, or a word run carries straight on into the next
    // one: `e` on the last word of a line ran past it and stopped at the end
    // of the first word of the line below. Never landed on, because every
    // motion here steps over anything that is not a word character.
    if (stream.length) stream.push({ pos, ch: "\n" })
    // A one-character placeholder keeps positions lined up with the text.
    const text = state.doc.textBetween(
      pos + 1,
      pos + node.nodeSize - 1,
      undefined,
      "\ufffc"
    )
    for (let i = 0; i < text.length; i++) {
      const at = pos + 1 + i
      if (at >= from && at <= to) stream.push({ pos: at, ch: text[i] })
    }
    return false
  })
  return stream
}

// `\ufffc` stands in for a node with no text of its own, an emoji or a
// picture. Counting it as a word means the motions stop on it rather than
// stepping over it as if it were a space, which sent `b` past the emoji and
// onto the line above.
const WORD_CHAR_RE = /[\p{L}\p{N}_\uFFFC]/u

/**
 * w, e and b. Punctuation counts as a separator rather than its own word,
 * which is the one place this differs from vim.
 */
/** `r`: put one character in place of what is under the cursor. */
function replaceChars(view: EditorView, char: string, count: number): void {
  const { $head, head } = view.state.selection
  if (!$head.parent.isTextblock || [...char].length !== 1) return

  const to = Math.min(head + count, textLineAt($head).end)
  if (to <= head) return
  view.dispatch(view.state.tr.insertText(char.repeat(to - head), head, to))
  select(view, to - 1)
}

/**
 * Where `f`, `F`, `t` and `T` land, or null if the character is not there.
 *
 * The line only, which is what makes these different from a search: vim never
 * carries them onto the line below. `t` and `T` stop one short of the
 * character, and because that leaves the cursor right next to it, a repeat
 * starts one further along or it would keep finding the same one.
 */
function findInLine(
  state: EditorState,
  kind: FindKind,
  char: string,
  count: number,
  from: number
): number | null {
  const $pos = state.doc.resolve(from)
  if (!$pos.parent.isTextblock) return null

  const start = $pos.start()
  const text = state.doc.textBetween(start, $pos.end(), undefined, "\ufffc")
  const forward = kind === "f" || kind === "t"
  const step = forward ? 1 : -1
  let i = from - start

  if (kind === "t" && text[i + 1] === char) i += 1
  if (kind === "T" && text[i - 1] === char) i -= 1

  for (let n = 0; n < count; n++) {
    i += step
    while (i >= 0 && i < text.length && text[i] !== char) i += step
    if (i < 0 || i >= text.length) return null
  }

  return start + (kind === "t" ? i - 1 : kind === "T" ? i + 1 : i)
}

/**
 * Jump to a character on the line, or act on everything up to it.
 *
 * Forward takes the character it landed on with it, backward does not, which
 * is what makes `dfx` delete through the x and `dFx` stop before the cursor.
 * `t` and `T` land one short, so their range comes out one short too, with no
 * special case needed here.
 */
function runFind(
  view: EditorView,
  kind: FindKind,
  char: string,
  count: number,
  // Only the operators that take a range. `>` and `<` work on whole lines, so
  // a find is not a target they can use.
  operator: Operator | null
): boolean {
  const head = view.state.selection.head
  const target = findInLine(view.state, kind, char, count, head)
  if (target === null) return false

  if (!operator) {
    select(view, target)
    return true
  }

  const forward = kind === "f" || kind === "t"
  const [from, to] = forward ? [head, target + 1] : [target, head]
  if (from < to) applyToRange(view, operator, from, to, false)
  if (operator !== "c") collapseSelection(view, from)
  return true
}

/** Characters either side of the cursor a word motion is built over first. */
const WORD_WINDOW = 4000

/** Where a word motion lands, as an index into the stream it was given. */
function walkWords(
  stream: { pos: number; ch: string }[],
  head: number,
  kind: "w" | "e" | "b",
  count: number,
  big = false
): number {
  /**
   * Which of vim's three kinds a character belongs to: space, punctuation, or
   * word. A run of one kind is a word, which is why `a.b` is three of them and
   * `»` between two words is one of its own rather than a gap.
   *
   * A WORD, as vim spells it, has only two kinds: space, and everything else.
   */
  const kindOf = (at: number): number => {
    const ch = stream[at]?.ch
    if (ch === undefined || /\s/.test(ch)) return 0
    if (big) return 1
    return WORD_CHAR_RE.test(ch) ? 2 : 1
  }
  let i = stream.findIndex((entry) => entry.pos >= head)
  if (i === -1) i = stream.length - 1

  // At the end of a block the cursor sits past the last character, so there is
  // no current word to skip - `$w` must land on the next block's first word.
  let onChar = i < stream.length && stream[i].pos === head

  for (let step = 0; step < count; step++, onChar = true) {
    if (kind === "w") {
      // Off the end of the run the cursor is in, then over any space.
      const here = kindOf(i)
      if (onChar && here !== 0) while (i < stream.length && kindOf(i) === here) i++
      while (i < stream.length && kindOf(i) === 0) i++
    } else if (kind === "e") {
      i++
      while (i < stream.length && kindOf(i) === 0) i++
      const run = kindOf(i)
      if (run !== 0) while (i + 1 < stream.length && kindOf(i + 1) === run) i++
    } else {
      i--
      while (i >= 0 && kindOf(i) === 0) i--
      const run = kindOf(i)
      if (run !== 0) while (i - 1 >= 0 && kindOf(i - 1) === run) i--
    }
    // Off the end of what we were given. Not `i <= 0`: sitting on the first
    // character is a legitimate place to be, and a count starting there was
    // abandoned before it ran. Backwards has to stop at -1 though, or the next
    // pass reads past the start.
    if (i < 0 || i >= stream.length) break
  }
  return i
}

/**
 * `w`, `e` and `b`.
 *
 * Built over a window around the cursor rather than the whole document. A word
 * is a few characters away and the document can be a hundred thousand of them,
 * and paying for all of them on every press made these the slowest keys in the
 * editor by a factor of ten. The window is only widened when the motion runs
 * off its edge with document still to go, which a count large enough to leave
 * it is the only way to do.
 */
function wordMotion(
  view: EditorView,
  kind: "w" | "e" | "b",
  count: number,
  big = false
): void {
  const head = view.state.selection.head
  const size = view.state.doc.content.size

  for (const radius of [WORD_WINDOW, size]) {
    const from = Math.max(0, head - radius)
    const to = Math.min(size, head + radius)
    const stream = textStream(view.state, from, to)
    if (!stream.length) return

    const landed = walkWords(stream, head, kind, count, big)
    const ranOff =
      landed <= 0 ? from > 0 : landed >= stream.length - 1 ? to < size : false
    if (ranOff && radius !== size) continue

    const entry = stream[Math.max(0, Math.min(stream.length - 1, landed))]
    select(view, entry.pos)
    return
  }
}

/** The depth of the nearest isolating ancestor - a table cell, a summary. */
function isolatingDepth($pos: ResolvedPos): number {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.spec.isolating) return depth
  }
  return 0
}

/** { and } - jump to the previous or next block. */
/**
 * `}` and `{`: to the next blank line, not the next block.
 *
 * Vim moves by paragraph, and a paragraph ends where an empty line begins. A
 * run of bullets is one paragraph to it, so stepping one block at a time made
 * `}` behave like `j` wherever the text was dense.
 */
function moveByBlock(view: EditorView, dir: 1 | -1, count: number): void {
  // An empty table cell is an empty block, but it is not a blank line: the
  // table is one thing in the flow of the page and a paragraph does not end
  // inside it. Anything sealed off from the text around it, which is what a
  // cell is, can be passed through but never stopped on.
  const blocks: { pos: number; empty: boolean }[] = []
  const walk = (node: ProseMirrorNode, from: number, sealed: boolean): void => {
    node.forEach((child, offset) => {
      const at = from + offset
      if (child.isTextblock) {
        blocks.push({ pos: at + 1, empty: !sealed && child.content.size === 0 })
      } else if (child.isBlock) {
        walk(child, at + 1, sealed || child.type.spec.isolating === true)
      }
    })
  }
  walk(view.state.doc, 0, false)
  if (!blocks.length) return

  const { head } = view.state.selection
  let at = 0
  for (let i = 0; i < blocks.length; i++) if (blocks[i].pos <= head) at = i

  for (let step = 0; step < count; step++) {
    let next = at + dir
    // Past the last blank line there is only the end of the document, which is
    // where vim stops too.
    while (next > 0 && next < blocks.length - 1 && !blocks[next].empty) next += dir
    at = Math.max(0, Math.min(blocks.length - 1, next))
  }

  select(view, blocks[at].pos, dir)
}

/**
 * One line down or up, for `j` and `k` in visual-line mode.
 *
 * Not `moveByBlock`, which is `{` and `}` and stops only at a blank line: a
 * page of bullets has none, so growing the selection with it would swallow
 * everything to the end of the document in one press.
 */
function stepBlock(view: EditorView, dir: 1 | -1, count: number): void {
  const starts = textblockStarts(view.state.doc)
  if (!starts.length) return

  const { head } = view.state.selection
  let at = 0
  for (let i = 0; i < starts.length; i++) if (starts[i] <= head) at = i

  const next = Math.max(0, Math.min(starts.length - 1, at + dir * count))
  select(view, starts[next], dir)
}

/** Motions worth coming back from. A `j` is not one: the list would fill with
 * places nobody wants to return to, and the two nearby ones would be lost. */
const JUMPS = ["G", "{", "}"]

/** How many to keep. Snapping back a few places is the point; a history is not. */
const JUMP_LIMIT = 10

/** Remember where the cursor is, so `Ctrl-O` can come back to it. */
function markJump(view: EditorView): void {
  const vim = vimPluginKey.getState(view.state)
  if (!vim) return

  // Anything ahead is dropped: jumping somewhere new abandons the way forward,
  // the same way taking a different turn does on a browser's back stack.
  const jumps = [...vim.jumps.slice(0, vim.jumpAt), view.state.selection.head].slice(
    -JUMP_LIMIT
  )
  patch(view, { jumps, jumpAt: jumps.length })
}

/** Step back or forward through them: `Ctrl-O` and `Ctrl-I`. */
function jump(view: EditorView, back: boolean): void {
  const vim = vimPluginKey.getState(view.state)
  if (!vim) return

  // Stepping back from the present records the present first, or there would
  // be nothing for `Ctrl-I` to come forward to.
  const jumps =
    back && vim.jumpAt === vim.jumps.length
      ? [...vim.jumps, view.state.selection.head]
      : vim.jumps

  const at = back ? vim.jumpAt - 1 : vim.jumpAt + 1
  if (at < 0 || at >= jumps.length) return

  patch(view, { jumps, jumpAt: at })
  select(view, jumps[at])
}

/** The nearest ancestor that actually scrolls, for page-sized motions. */
function scrollParent(node: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = node
  while (el) {
    const { overflowY } = getComputedStyle(el)
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight
    ) {
      return el
    }
    el = el.parentElement
  }
  return null
}

/** How many visual rows fit on screen, for Ctrl-f and friends. */
/**
 * One line, measured from the editor's own styling.
 *
 * Not from the selection: a card or a picture is one node with no line height
 * of its own, and measuring the selection while it sat on one collapsed the
 * step to a few pixels a press.
 */
function lineHeight(view: EditorView): number {
  const styled = parseFloat(getComputedStyle(view.dom).lineHeight)
  if (styled > 0) return styled
  const size = parseFloat(getComputedStyle(view.dom).fontSize)
  return size > 0 ? size * 1.5 : 20
}

function rowsPerPage(view: EditorView): number {
  const scroller = scrollParent(view.dom as HTMLElement)
  const height = scroller ? scroller.clientHeight : window.innerHeight
  return Math.max(1, Math.floor(height / lineHeight(view)))
}

/** Lines of context kept between the cursor and the edge, as vim's scrolloff. */
const SCROLL_MARGIN = 3

/**
 * Move the window over the document, for Ctrl-e and Ctrl-y.
 *
 * Unlike every other motion here, the cursor is not what moves: the view
 * slides and the cursor stays on the line it was on. It only moves when the
 * scroll would carry it off the screen, and then only back to the edge, which
 * is what vim does when there is nowhere else for it to be.
 */
function scrollLines(view: EditorView, direction: 1 | -1, lines: number): void {
  const scroller = scrollParent(view.dom as HTMLElement)
  if (!scroller) return

  const step = lineHeight(view)
  scroller.scrollTop += step * lines * direction

  const box = scroller.getBoundingClientRect()
  const caret = view.coordsAtPos(view.state.selection.head)
  const above = caret.top < box.top + step * SCROLL_MARGIN
  const below = caret.bottom > box.bottom - step * SCROLL_MARGIN
  if (!above && !below) return

  const edge = above
    ? box.top + step * (SCROLL_MARGIN + 0.5)
    : box.bottom - step * (SCROLL_MARGIN + 0.5)
  const found = view.posAtCoords({ left: caret.left, top: edge })
  if (!found) return

  // Only onto text. A card or a picture is one whole node, and landing on it
  // gives a node selection, which has no line to keep and no caret to show.
  const to = TextSelection.near(view.state.doc.resolve(found.pos), direction)
  if (!(to instanceof TextSelection)) return
  view.dispatch(view.state.tr.setSelection(to))
}

/** Half a screen, for Ctrl-d and Ctrl-u. */
function halfPage(view: EditorView): number {
  return Math.max(1, Math.floor(rowsPerPage(view) / 2))
}

/** Every motion, shared by normal and visual mode. */
function runMotion(
  view: EditorView,
  key: string,
  count: number,
  hadCount: boolean
): boolean {
  switch (key) {
    case "h":
      moveHorizontal(view, -count)
      return true
    case "l":
      moveHorizontal(view, count)
      return true
    case "j":
      moveVertical(view, 1, count)
      return true
    case "k":
      moveVertical(view, -1, count)
      return true
    case "0":
      moveHorizontal(view, -Infinity)
      return true
    case "$":
      moveHorizontal(view, Infinity)
      return true
    case "G":
      gotoBlock(view, hadCount ? count : Infinity)
      return true
    case "}":
      moveByBlock(view, 1, count)
      return true
    case "{":
      moveByBlock(view, -1, count)
      return true
    case "w":
    case "e":
    case "b":
      wordMotion(view, key, count)
      return true
    case "W":
    case "E":
    case "B":
      wordMotion(view, key.toLowerCase() as "w" | "e" | "b", count, true)
      return true
    case "^": {
      // The first character that is not a space, which is where a line of
      // indented text actually begins.
      const { $head } = view.state.selection
      if (!$head.parent.isTextblock) return true
      const { start, end } = textLineAt($head)
      const text = view.state.doc.textBetween(start, end, undefined, "\ufffc")
      const first = text.search(/\S/)
      select(view, start + (first < 0 ? 0 : first))
      return true
    }
    default:
      return false
  }
}

// --- operators -------------------------------------------------------------

/**
 * Every operator funnels through here, whatever picked the range: a text
 * object, a whole line, or a visual selection.
 */
/** The inline nodes in a range, as JSON, so a put can build them again. */
function inlineRange(state: EditorState, from: number, to: number): unknown[] {
  const nodes: unknown[] = []
  state.doc.slice(from, to).content.forEach((node) => nodes.push(node.toJSON()))
  return nodes
}

/**
 * The sub-list hanging off a list item, if it has one.
 *
 * An item here is `(paragraph|details) block*`, so a list among the children
 * after the first is the item's own sub-items rather than part of its line.
 */
function subList(node: ProseMirrorNode): ProseMirrorNode | null {
  for (let i = 1; i < node.childCount; i++) {
    const child = node.child(i)
    if (child.type.name.endsWith("List")) return child
  }
  return null
}

/** The same item without its sub-list: the line the cursor is actually on. */
function withoutSubList(item: ProseMirrorNode, sub: ProseMirrorNode): ProseMirrorNode {
  const kept: ProseMirrorNode[] = []
  item.content.forEach((child) => {
    if (child !== sub) kept.push(child)
  })
  return item.copy(Fragment.fromArray(kept))
}

function applyToRange(
  view: EditorView,
  operator: Operator,
  from: number,
  to: number,
  linewise: boolean
): void {
  const { state } = view
  if (to <= from) return

  // Removing every child of a list or quote would leave an empty container,
  // which the schema forbids and ProseMirror silently refuses. Take the
  // container with it instead.
  while (linewise && operator !== "y") {
    const $from = state.doc.resolve(from)
    if ($from.depth < 1) break
    // A table cell is isolating: walking out of one takes the cell itself,
    // leaving the row a column short.
    if ($from.node().type.spec.isolating) break
    if ($from.start() !== from || $from.end() !== to) break
    from = $from.before()
    to = $from.after()
  }

  if (operator === "gU" || operator === "gu") {
    changeCase(view, from, to, operator === "gU")
    return
  }

  // A bullet with sub-bullets is not one line. Taking the subtree with it
  // removes text that is nowhere near the cursor and leaves nothing on screen
  // to say so, which is the one way `dd` should never surprise anyone.
  //
  // The children are lifted into the item's place first, and the operator then
  // runs again on what is left - a plain item, the line it looked like all
  // along. Two transactions a moment apart, so undo takes them as one.
  const item = linewise ? state.doc.nodeAt(from) : null
  const sub =
    item && isListItem(item.type) && to === from + item.nodeSize ? subList(item) : null

  if (item && sub) {
    const line = withoutSubList(item, sub)
    if (operator === "y") {
      // A yank changes nothing, so there is nothing to lift: only the register
      // needs to hold the line rather than the whole branch.
      view.dispatch(
        state.tr.setMeta(vimPluginKey, {
          register: remember({ kind: "line", nodes: [line.toJSON()], text: line.textContent }),
        })
      )
      collapseSelection(view, from)
      return
    }

    const lifted: ProseMirrorNode[] = [line]
    sub.content.forEach((child) => lifted.push(child))
    view.dispatch(state.tr.replaceWith(from, to, lifted))
    applyToRange(view, operator, from, from + line.nodeSize, linewise)
    return
  }

  const register: VimRegister = linewise
    ? {
        kind: "line",
        nodes: nodesInRange(state, from, to).map((node) => node.toJSON()),
        text: state.doc.textBetween(from, to, "\n"),
      }
    : {
        kind: "char" as const,
        text: state.doc.textBetween(from, to),
        nodes: inlineRange(state, from, to),
      }

  const tr = state.tr.setMeta(vimPluginKey, { register: remember(register) })
  if (operator !== "y") tr.delete(from, to)

  // A linewise change empties the lines but leaves one to type on, as vim
  // does - without this the container is deleted out from under the cursor.
  const blank =
    operator === "c" && linewise
      ? state.schema.nodes.paragraph.createAndFill()
      : null
  if (blank) tr.insert(from, blank)

  view.dispatch(tr.scrollIntoView())

  if (operator === "c") {
    if (blank) select(view, from + 1)
    patch(view, { mode: "insert", ...CLEARED })
  }
  else if (operator === "y") collapseSelection(view, from)
  else if (linewise) {
    // Land on the line that took its place, or on the one before it when we
    // removed the last item of a list - otherwise the cursor escapes the list.
    const { doc } = view.state
    const at = Math.min(from, doc.content.size)
    try {
      select(view, at, doc.resolve(at).nodeAfter ? 1 : -1)
    } catch {
      select(view, at, -1)
    }
  }
}

/** gU and gu. Rewrites each text node in place so marks survive. */
function changeCase(
  view: EditorView,
  from: number,
  to: number,
  toUpper: boolean
): void {
  const { state } = view
  const tr = state.tr

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) return
    const start = Math.max(pos, from)
    const end = Math.min(pos + node.nodeSize, to)
    if (end <= start) return

    const slice = node.text.slice(start - pos, end - pos)
    const next = toUpper ? slice.toUpperCase() : slice.toLowerCase()
    if (next === slice) return

    tr.replaceWith(
      tr.mapping.map(start),
      tr.mapping.map(end),
      state.schema.text(next, node.marks)
    )
  })

  if (tr.docChanged) view.dispatch(tr.scrollIntoView())
}

/** x - forward within the block, or the whole node when one is selected. */
function deleteChars(view: EditorView, count: number): void {
  const { state } = view

  if (state.selection instanceof NodeSelection) {
    const node = state.selection.node
    view.dispatch(
      state.tr
        .setMeta(vimPluginKey, {
          register: remember({
            kind: "line",
            nodes: [node.toJSON()],
            text: node.textContent,
          }),
        })
        .deleteSelection()
        .scrollIntoView()
    )
    return
  }

  const { $head } = state.selection
  if (!$head.parent.isTextblock) return
  applyToRange(
    view,
    "d",
    $head.pos,
    Math.min($head.end(), $head.pos + count),
    false
  )
}

/**
 * vim's register and the system clipboard, kept as one.
 *
 * vim holds them apart because `d`, `c` and `x` all overwrite the unnamed
 * register, and a delete that wiped the system clipboard would be a menace.
 * That is a fair trade in a terminal with named registers to fall back on;
 * here there are none, and the surprise of `p` putting back something other
 * than what was just copied costs more than the one it avoids. This is what
 * vim calls `clipboard=unnamedplus`.
 */
function remember(register: VimRegister): VimRegister {
  if (register?.text) {
    // Nothing to do if it fails - the register still holds what was taken.
    navigator.clipboard.writeText(register.text).catch(() => {})
  }
  return register
}

/** Text from outside, shaped so it can be put back the way a yank would be. */
function asRegister(text: string): VimRegister {
  if (!text.includes("\n")) return { kind: "char", text, nodes: [{ type: "text", text }] }
  return {
    kind: "line",
    text,
    nodes: text.split("\n").map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  }
}

/**
 * `p` and `P`, taking whichever of the two was written last.
 *
 * Everything this editor yanks or deletes goes to the system clipboard too, so
 * a register that no longer matches it means the copy came from somewhere else
 * - another app, or this one's own Cmd-C. The register is preferred when they
 * agree, because it carries the nodes: an emoji or a picture comes back whole,
 * where the text alone would put back nothing.
 */
async function putEither(
  view: EditorView,
  register: VimRegister,
  count: number,
  singleLinePut = false,
  before = false
): Promise<void> {
  let text = ""
  try {
    text = await navigator.clipboard.readText()
  } catch {
    // No clipboard to read: the register is all there is.
  }

  putRegister(
    view,
    text && text !== register?.text ? asRegister(text) : register,
    count,
    singleLinePut,
    before
  )
}

/** p - put the register back. Linewise after the line, charwise after the cursor. */
function putRegister(
  view: EditorView,
  register: VimRegister,
  count: number,
  singleLinePut = false,
  before = false
): void {
  if (!register) return
  const { state } = view
  const { $head } = state.selection

  if (register.kind === "char") {
    if (!$head.parent.isTextblock || !register.nodes.length) return
    const at = before ? $head.pos : Math.min($head.end(), $head.pos + 1)

    // Rebuilt from the nodes rather than the text, so an emoji comes back as
    // an emoji instead of as nothing.
    const inline: ProseMirrorNode[] = []
    for (let i = 0; i < count; i++) {
      for (const json of register.nodes) inline.push(state.schema.nodeFromJSON(json))
    }

    const tr = state.tr.insert(at, inline)
    const landed = inline.reduce((total, node) => total + node.nodeSize, 0)
    view.dispatch(
      tr.setSelection(TextSelection.near(tr.doc.resolve(at + landed))).scrollIntoView()
    )
    return
  }

  if (singleLinePut || $head.parent.type.spec.code) {
    // Blocks cannot go inside a code block or a one line document, so what
    // lands there is the text.
    const text = register.text.replace(/\n$/, "")
    if (!text) return
    const line = textLineAt($head)
    const tr = state.tr.insertText(`\n${text}`.repeat(count), line.end)
    view.dispatch(
      tr
        .setSelection(TextSelection.near(tr.doc.resolve(line.end + 1)))
        .scrollIntoView()
    )
    return
  }

  if (!register.nodes.length || $head.depth < 1) return
  const at = $head.after(lineDepth($head))

  const nodes: ProseMirrorNode[] = []
  for (let i = 0; i < count; i++) {
    for (const json of register.nodes) {
      nodes.push(state.schema.nodeFromJSON(json))
    }
  }

  try {
    const tr = state.tr.insert(at, nodes)
    view.dispatch(
      tr
        .setSelection(TextSelection.near(tr.doc.resolve(at + 1)))
        .scrollIntoView()
    )
  } catch {
    // The register does not fit here - a list item put at the top level, say.
    // Do nothing, as vim would beep.
  }
}

/**
 * J - pull the next line onto this one with a space between.
 *
 * Replacing the range from the end of this block to the start of the next one
 * removes the boundary and merges them in a single step. `3J` joins three
 * lines, as vim counts them.
 */
function joinLines(view: EditorView, count: number): void {
  const { state } = view
  if (!state.selection.$head.parent.isTextblock) return

  // All the joins go into one transaction, so `3J` is a single undo step.
  const tr = state.tr
  let caret = state.selection.head

  for (let joins = Math.max(1, count - 1); joins > 0; joins--) {
    const $end = tr.doc.resolve(caret)

    // A code block's lines are newlines, not blocks: joining them is replacing
    // one character. Looking for the next textblock would reach past the whole
    // snippet and pull the paragraph after it inside.
    if ($end.parent.type.spec.code) {
      const line = textLineAt($end)
      if (line.end >= $end.end()) break
      const separator = tr.doc.textBetween(line.end - 1, line.end) === " " ? "" : " "
      tr.replaceWith(line.end, line.end + 1, state.schema.text(separator || " "))
      caret = line.end
      continue
    }

    const end = $end.end()
    const next = textblockStarts(tr.doc).find((start) => start > end)
    if (next === undefined) break
    // Joining across an isolating boundary - out of a table cell, or INTO a
    // collapsible section's summary - eats the node in between. Both ends have
    // to be checked: the summary is isolating, the paragraph before it is not.
    const $next = tr.doc.resolve(next)
    if (
      $next.sharedDepth(end) <
      Math.max(isolatingDepth($end), isolatingDepth($next))
    ) {
      break
    }

    // Do not double up when the line already ends in a space.
    const separator = tr.doc.textBetween(end - 1, end) === " " ? "" : " "
    tr.insertText(separator, end, next)
    caret = end
  }

  if (!tr.docChanged) return
  // vim leaves the cursor on the join itself.
  view.dispatch(
    tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView()
  )
}

/** o - open a fresh line below and drop into insert mode. */
function openLine(view: EditorView, dir: 1 | -1): void {
  const { state } = view
  const { $head, from, to } = state.selection

  // A code block keeps its lines as newlines inside one textblock, so opening a
  // line there is a character, not a node. Inserting a node lands after the
  // whole block, which is how this used to jump out of the snippet entirely.
  if ($head.parent.type.spec.code) {
    const line = textLineAt($head)
    const at = dir > 0 ? line.end : line.start

    const tr = state.tr.insertText("\n", at)
    // `o` lands on the line it just made, below; `O` lands on the blank one it
    // pushed the current line off.
    view.dispatch(
      tr
        .setSelection(TextSelection.create(tr.doc, at + (dir > 0 ? 1 : 0)))
        .scrollIntoView()
    )
    return
  }

  // A whole-node selection - an image, a rule, a bookmark card - sits between
  // blocks rather than inside one, so it has no enclosing line to open around.
  // Its own edges are where the new paragraph goes.
  let at = dir > 0 ? to : from
  let type = state.schema.nodes.paragraph

  if ($head.depth >= 1) {
    const depth = lineDepth($head)
    at = dir > 0 ? $head.after(depth) : $head.before(depth)
    // Opening a line inside a list makes another item, not a paragraph.
    const line = $head.node(depth).type
    if (isListItem(line)) type = line
  }

  const node = type.createAndFill()
  if (!node) return

  const tr = state.tr.insert(at, node)
  view.dispatch(
    tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1))).scrollIntoView()
  )
}

// --- visual mode -----------------------------------------------------------

/** Leaving visual mode collapses the range, or normal mode inherits it. */
function collapseSelection(view: EditorView, pos?: number): void {
  if (view.state.selection.empty) return
  select(view, pos ?? view.state.selection.from)
}

/**
 * One past a position, without escaping the block it sits in.
 *
 * `$pos.end()` is the end of the whole document at depth 0, so a position
 * between blocks - which is where an image or a rule leaves the cursor - has
 * to be left alone rather than clamped.
 *
 * The `try` is live: `visualAnchor` is never remapped, so an undo can shrink
 * the document out from under it.
 */
function inclusiveEnd(state: EditorState, pos: number): number {
  try {
    const $pos = state.doc.resolve(pos)
    return $pos.parent.isTextblock ? Math.min(pos + 1, $pos.end()) : pos
  } catch {
    return pos
  }
}

/** The document range a visual selection currently covers. */
function visualRange(
  state: EditorState,
  anchor: number,
  head: number,
  linewise: boolean
): LineSpan | null {
  let from = Math.min(anchor, head)
  let to = inclusiveEnd(state, Math.max(anchor, head))

  if (linewise) {
    const first = lineSpanAt(state, from)
    const last = lineSpanAt(state, to)
    if (!first || !last) return null
    from = first.from
    to = last.to
  }

  return { from, to }
}

/** A line span with any sub-list trimmed off: what an operator will take. */
function lineOnly(state: EditorState, span: LineSpan): LineSpan {
  const node = state.doc.nodeAt(span.from)
  const sub = node && isListItem(node.type) ? subList(node) : null
  return sub ? { from: span.from, to: span.to - sub.nodeSize } : span
}

/**
 * Redraw the selection after a motion has moved the head.
 *
 * The head has to stay on whichever end is moving. Pinning it to the bottom of
 * the range would make the next `k` measure from the bottom again, so the
 * selection could never grow upwards.
 */
function showVisual(
  view: EditorView,
  anchor: number,
  head: number,
  linewise: boolean
): void {
  const { doc } = view.state

  // Extend whichever end is the far one, so a backward selection still covers
  // the character it started on.
  const forward = head >= anchor
  let selAnchor = forward ? anchor : inclusiveEnd(view.state, anchor)
  let selHead = forward ? inclusiveEnd(view.state, head) : head

  if (linewise) {
    // Trimmed, because that is what `d` and `y` will take. Highlighting a
    // bullet's sub-bullets and then leaving them behind is the same surprise
    // the other way round.
    const first = lineSpanAt(view.state, anchor)
    const last = lineSpanAt(view.state, head)
    if (!first || !last) return
    const anchorLine = lineOnly(view.state, first)
    const headLine = lineOnly(view.state, last)

    const upwards = headLine.from < anchorLine.from
    selAnchor = upwards ? anchorLine.to - 1 : anchorLine.from + 1
    selHead = upwards ? headLine.from + 1 : headLine.to - 1
  }

  const clamp = (pos: number) => Math.max(0, Math.min(doc.content.size, pos))
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(doc, clamp(selAnchor), clamp(selHead)))
      .scrollIntoView()
  )
}

// --- extension -------------------------------------------------------------

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    vimMode: {
      /** Turn vim mode on or off at runtime. */
      setVimMode: (enabled: boolean) => ReturnType
      /** Flip vim mode. */
      toggleVimMode: () => ReturnType
      /**
       * Drop into insert mode. For anything that hands the user a fresh place
       * to type - a menu, a button - where normal mode would swallow it.
       */
      enterInsertMode: () => ReturnType
    }
  }
}

export const VimMode = Extension.create<VimModeOptions>({
  name: "vimMode",

  // Ahead of the editing keymaps, so normal mode sees keys first.
  priority: 2000,

  addOptions() {
    return { enabled: false, onSearch: undefined }
  },

  addCommands() {
    return {
      setVimMode:
        (enabled: boolean) =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(
              state.tr.setMeta(vimPluginKey, {
                enabled,
                ...NORMAL,
                mode: enabled ? "normal" : "insert",
              })
            )
          }
          return true
        },

      toggleVimMode:
        () =>
        ({ state, commands }) => {
          const vim = vimPluginKey.getState(state)
          return commands.setVimMode(!vim?.enabled)
        },

      enterInsertMode:
        () =>
        ({ state, dispatch }) => {
          const vim = vimPluginKey.getState(state)
          if (!vim?.enabled || vim.mode === "insert") return false
          if (dispatch) {
            dispatch(
              state.tr.setMeta(vimPluginKey, { mode: "insert", ...CLEARED })
            )
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const { enabled: initiallyEnabled, onSearch, singleLine } = this.options
    const { editor } = this

    return [
      new Plugin<VimState>({
        key: vimPluginKey,

        state: {
          init: () => ({
            enabled: initiallyEnabled,
            mode: initiallyEnabled ? "normal" : "insert",
            count: "",
            operator: null,
            pendingG: false,
            pendingTextObject: null,
            pendingFind: null,
            pendingReplace: false,
            lastFind: null,
            lastVisual: null,
            visualAnchor: null,
            visualHead: null,
            pendingJ: null,
            jumps: [],
            jumpAt: 0,
            register: null,
          }),
          apply: (tr, value) => {
            const meta = tr.getMeta(vimPluginKey) as
              | Partial<VimState>
              | undefined
            const next = meta ? { ...value, ...meta } : value

            // A jump is a place in the document, so typing above one moves it.
            // Mapping here is the whole reason `Ctrl-O` still lands where it
            // was pointed after the text around it has been edited.
            if (tr.docChanged) {
              return { ...next, jumps: next.jumps.map((pos) => tr.mapping.map(pos)) }
            }
            if (meta) return next

            // A caret moved by something that is not a vim command - an arrow
            // key, a click - abandons whatever was half typed. A count is
            // invisible while it waits, so leaving it armed silently turns the
            // next `dd` into `2dd`. Motions read their count before they move,
            // so clearing here costs them nothing.
            return value
          },
        },

        props: {
          /**
           * Stand in for the block cursor on an emoji or any other inline atom.
           *
           * `caret-shape: block` is the browser's own and it sizes itself to a
           * character. An atom is one node with no character in it, so there is
           * nothing to size to and it falls back to a thin line, as if normal
           * mode had quietly ended.
           */
          decorations: (state) => {
            const vim = vimPluginKey.getState(state)
            if (!vim?.enabled || vim.mode !== "normal") return null

            const { empty, $head } = state.selection
            // Not text: a text node is a leaf too, so it answers to isAtom,
            // and the whole run would be covered rather than one character.
            const node = empty ? $head.nodeAfter : null
            if (!node || node.isText || !node.isAtom || !node.isInline) return null

            return DecorationSet.create(state.doc, [
              Decoration.inline($head.pos, $head.pos + node.nodeSize, {
                class: "vim-block-cursor",
              }),
            ])
          },

          // Lets CSS show which mode you are in, e.g. a different caret colour.
          attributes: (state): Record<string, string> => {
            const vim = vimPluginKey.getState(state)
            return vim?.enabled ? { "data-vim-mode": vim.mode } : {}
          },

          // A click abandons a half typed command. The count is invisible
          // while it waits, so leaving it armed turns the next `dd` into
          // `2dd`, which is exactly as confusing as it sounds.
          handleClick: (view) => {
            const vim = vimPluginKey.getState(view.state)
            if (vim?.enabled && isPending(vim)) patch(view, CLEARED)
            return false
          },

          // A click past the last character of a line, which normal mode has
          // nowhere to put the cursor.
          createSelectionBetween: (view, $anchor, $head) => {
            const vim = vimPluginKey.getState(view.state)
            if (!vim?.enabled || vim.mode !== "normal") return null
            if ($anchor.pos !== $head.pos || !$head.parent.isTextblock) return null
            if ($head.pos !== $head.end() || $head.pos === $head.start()) return null
            return TextSelection.create(view.state.doc, $head.pos - 1)
          },

          // Normal and visual mode must never type.
          handleTextInput: (view) => {
            const vim = vimPluginKey.getState(view.state)
            return !!vim?.enabled && vim.mode !== "insert"
          },

          handleKeyDown: (view, event) => {
            const vim = vimPluginKey.getState(view.state)
            if (!vim?.enabled) return false

            const linewise = vim.mode === "visualLine"
            const inVisual = vim.mode === "visual" || linewise
            const anchor = vim.visualAnchor

            if (event.key === "Escape") {
              const held =
                inVisual && anchor !== null
                  ? { lastVisual: { anchor, head: vim.visualHead ?? anchor, linewise } }
                  : {}
              patch(view, { ...NORMAL, ...held })
              if (inVisual) collapseSelection(view)
              else clampToLine(view)
              return true
            }

            const key = event.key

            if (vim.mode === "insert") {
              if (event.metaKey || event.ctrlKey || event.altKey) return false

              // `jk` leaves insert mode. The `j` is already in the document, so
              // remove it and switch in one transaction - one undo step.
              if (
                key === "k" &&
                vim.pendingJ &&
                view.state.selection.head === vim.pendingJ.pos + 1 &&
                Date.now() - vim.pendingJ.at <= JK_TIMEOUT_MS
              ) {
                view.dispatch(
                  view.state.tr
                    .delete(vim.pendingJ.pos, vim.pendingJ.pos + 1)
                    .setMeta(vimPluginKey, NORMAL)
                    .scrollIntoView()
                )
                // Removing the `j` can leave the caret at the end of the line.
                clampToLine(view)
                return true
              }

              if (key === "j") {
                patch(view, {
                  pendingJ: { pos: view.state.selection.head, at: Date.now() },
                })
              } else if (vim.pendingJ) {
                patch(view, { pendingJ: null })
              }
              return false
            }

            if (event.metaKey || event.altKey) return false

            // Motions read the selection head, so undo the display extension
            // before any of them run. Anything that cannot be a motion - a bare
            // modifier, a count, the `i` of `iw` or the `g` of `gg` - is left
            // alone, or the highlight blinks out for a keystroke that moved
            // nothing.
            if (
              inVisual &&
              vim.visualHead !== null &&
              key.length === 1 &&
              !/^[0-9ig]$/.test(key) &&
              view.state.selection.head !== vim.visualHead
            ) {
              select(view, vim.visualHead)
            }

            const count = Math.max(1, parseInt(vim.count || "1", 10))
            const hadCount = vim.count !== ""

            /** A motion in visual mode moved the head - redraw the range. */
            const afterMotion = (): true => {
              const head = view.state.selection.head
              if (inVisual && anchor !== null) {
                showVisual(view, anchor, head, linewise)
              }
              patch(view, { ...CLEARED, ...(inVisual ? { visualHead: head } : {}) })
              return true
            }

            /** Run an operator over the current visual selection and exit. */
            const applyToVisual = (operator: Pending): true => {
              const range =
                anchor === null || vim.visualHead === null
                  ? null
                  : visualRange(view.state, anchor, vim.visualHead, linewise)
              patch(view, NORMAL)
              if (!range) return true

              if (operator === ">" || operator === "<") {
                indentLines(view, range.from, range.to, operator === "<")
                return true
              }

              applyToRange(view, operator, range.from, range.to, linewise)
              if (operator !== "c") collapseSelection(view, range.from)
              return true
            }

            /**
             * The word under the cursor, for `iw`, and for `aw` the space
             * after it as well. Vim falls back to the space before when there
             * is none after, so deleting the last word of a line does not
             * leave it ending in one.
             */
            const word = (around: boolean): { from: number; to: number } | null => {
              const range = wordRangeAt(view.state.doc, view.state.selection.head)
              if (!range || !around) return range

              const { $head } = view.state.selection
              if (!$head.parent.isTextblock) return range
              const { start, end } = textLineAt($head)
              const text = view.state.doc.textBetween(start, end, undefined, "\ufffc")

              let to = range.to
              while (to < end && /\s/.test(text[to - start])) to += 1
              if (to > range.to) return { from: range.from, to }

              let from = range.from
              while (from > start && /\s/.test(text[from - start - 1])) from -= 1
              return { from, to: range.to }
            }

            // Ctrl is only ours for scrolling, block jumps, and redo.
            if (event.ctrlKey) {
              switch (key.toLowerCase()) {
                case "r":
                  redo(view.state, view.dispatch)
                  break
                case "o":
                  jump(view, true)
                  break
                case "i":
                  jump(view, false)
                  break
                case "f":
                  moveVertical(view, 1, rowsPerPage(view) * count)
                  break
                case "b":
                  moveVertical(view, -1, rowsPerPage(view) * count)
                  break
                case "d":
                  moveVertical(view, 1, halfPage(view) * count)
                  break
                case "u":
                  moveVertical(view, -1, halfPage(view) * count)
                  break
                case "e":
                  scrollLines(view, 1, count)
                  break
                case "y":
                  scrollLines(view, -1, count)
                  break
                case "}":
                case "]":
                  moveByBlock(view, 1, count)
                  break
                case "{":
                case "[":
                  moveByBlock(view, -1, count)
                  break
                default:
                  return false
              }
              return afterMotion()
            }

            // Backspace deletes and drops into insert, so fixing a typo from
            // normal mode is one key rather than three.
            if (key === "Backspace") {
              if (inVisual && anchor !== null) return applyToVisual("c")

              const { $head } = view.state.selection
              if (!$head.parent.isTextblock || $head.pos <= $head.start()) {
                // Nothing left in this block - let ProseMirror join with the
                // previous one, which is what Backspace does there anyway.
                patch(view, { mode: "insert", ...CLEARED })
                return false
              }
              // `c` deletes and enters insert in one go.
              applyToRange(view, "c", $head.pos - 1, $head.pos, false)
              return true
            }

            // Named keys: arrows and friends still navigate, editing keys
            // don't. Tab is the exception, because nesting a list item is a
            // structural change rather than typing - vim's own `>>`, on the key
            // the rest of the editor already uses for it.
            if (key.length > 1) {
              // Arrows, Enter, Tab and the rest are not part of any command
              // here, so anything half typed before them is abandoned rather
              // than left armed. A count is invisible while it waits, and the
              // next `dd` silently becomes `2dd`.
              if (!MODIFIER_KEYS.includes(key) && isPending(vim)) {
                patch(view, CLEARED)
              }

              if (key === "Tab" && !inVisual) {
                // In a table, Tab is how you reach the next cell. Past the last
                // one it makes a row, because that is where the next cell would
                // be and it is what every other editor does.
                if (isInTable(view.state)) {
                  const forward = !event.shiftKey
                  const step = (): boolean =>
                    goToNextCell(forward ? 1 : -1)(view.state, view.dispatch)
                  if (!step() && forward) {
                    addRowAfter(view.state, view.dispatch)
                    step()
                  }
                  return true
                }

                // Handled here rather than left to fall through: an item with
                // nothing above it cannot be nested, and a Tab that no one
                // handles walks the focus out of the document.
                const { head } = view.state.selection
                indentLines(view, head, head, event.shiftKey)
                return true
              }
              return BLOCKED_NAMED_KEYS.includes(key)
            }

            // The character `r` was waiting for, before anything else reads it.
            if (vim.pendingReplace) {
              patch(view, { ...CLEARED })
              replaceChars(view, key, count)
              return true
            }

            if (key === "r" && !inVisual) {
              patch(view, { pendingReplace: true })
              return true
            }

            // The character f, F, t or T was waiting for. Taken before counts
            // and operators, since any key at all is a target here, digits
            // included.
            if (vim.pendingFind) {
              const kind = vim.pendingFind
              patch(view, { pendingFind: null, lastFind: { kind, char: key } })
              if (runFind(view, kind, key, count, rangeOperator(vim)) && !vim.operator) {
                return afterMotion()
              }
              patch(view, CLEARED)
              return true
            }

            if ("fFtT".includes(key) && key.length === 1) {
              patch(view, { pendingFind: key as FindKind })
              return true
            }

            // `;` repeats the last one, `,` repeats it the other way.
            if ((key === ";" || key === ",") && vim.lastFind) {
              const { kind, char } = vim.lastFind
              const REVERSED: Record<FindKind, FindKind> = { f: "F", F: "f", t: "T", T: "t" }
              const again = key === ";" ? kind : REVERSED[kind]
              if (runFind(view, again, char, count, rangeOperator(vim)) && !vim.operator) {
                return afterMotion()
              }
              patch(view, CLEARED)
              return true
            }

            // Counts. A leading 0 is the motion, not a digit.
            if (/[1-9]/.test(key) || (key === "0" && vim.count)) {
              patch(view, { count: vim.count + key })
              return true
            }

            // --- the g prefix: gg, gU, gu ---
            if (vim.pendingG) {
              if (key === "g") {
                markJump(view)
                gotoBlock(view, hadCount ? count : 1)
                return afterMotion()
              }
              // `gv` puts back what was selected last.
              if (key === "v" && vim.lastVisual) {
                const { anchor: from, head: to, linewise: lines } = vim.lastVisual
                patch(view, {
                  ...CLEARED,
                  mode: lines ? "visualLine" : "visual",
                  visualAnchor: from,
                  visualHead: to,
                })
                showVisual(view, from, to, lines)
                return true
              }

              if (key === "U" || key === "u") {
                const operator: Operator = key === "U" ? "gU" : "gu"
                if (inVisual) return applyToVisual(operator)
                patch(view, { pendingG: false, operator })
                return true
              }
              patch(view, CLEARED)
              return true
            }

            // --- visual mode ---
            if (inVisual && anchor !== null) {
              if (key === "i" || key === "a") {
                patch(view, { pendingTextObject: key })
                return true
              }

              if (vim.pendingTextObject) {
                const around = vim.pendingTextObject === "a"
                patch(view, CLEARED)
                const range = key === "w" ? word(around) : null
                if (range) {
                  patch(view, {
                    visualAnchor: range.from,
                    visualHead: Math.max(range.from, range.to - 1),
                  })
                  view.dispatch(
                    view.state.tr.setSelection(
                      TextSelection.create(view.state.doc, range.from, range.to)
                    )
                  )
                }
                return true
              }

              switch (key) {
                case "d":
                case "x":
                  return applyToVisual("d")
                case "y":
                  return applyToVisual("y")
                case "c":
                  return applyToVisual("c")
                case ">":
                case "<":
                  return applyToVisual(key)
                case "U":
                  return applyToVisual("gU")
                case "u":
                  return applyToVisual("gu")
                case "v":
                case "V":
                  patch(view, NORMAL)
                  collapseSelection(view)
                  return true
                case "g":
                  patch(view, { pendingG: true })
                  return true
              }

              // Visual-line grows by whole lines. Walking visual rows would
              // get stuck inside a list item that wraps.
              if (linewise && (key === "j" || key === "k")) {
                stepBlock(view, key === "j" ? 1 : -1, count)
                return afterMotion()
              }

              if (runMotion(view, key, count, hadCount)) return afterMotion()
              patch(view, CLEARED)
              return true
            }

            // --- an operator waiting for its target ---
            if (vim.operator) {
              const operator = vim.operator

              if ((key === "i" || key === "a") && !vim.pendingTextObject) {
                patch(view, { pendingTextObject: key })
                return true
              }

              const doubled =
                !vim.pendingTextObject &&
                (key === operator ||
                  (operator === "gU" && key === "U") ||
                  (operator === "gu" && key === "u"))

              patch(view, CLEARED)

              if (operator === ">" || operator === "<") {
                if (doubled) {
                  // A count takes lines, as in `3>>`, not levels.
                  const span = lineRange(view.state, count)
                  if (span) indentLines(view, span.from, span.to, operator === "<")
                }
                return true
              }

              if (vim.pendingTextObject && key === "w") {
                const range = word(vim.pendingTextObject === "a")
                if (range) applyToRange(view, operator, range.from, range.to, false)
              } else if (doubled && operator === "c") {
                // `cc` empties the line but keeps the block, as vim does.
                const { $head } = view.state.selection
                if ($head.parent.isTextblock) {
                  applyToRange(view, "c", $head.start(), $head.end(), false)
                }
              } else if (doubled) {
                const { $head } = view.state.selection
                if (singleLine && $head.parent.isTextblock) {
                  // The paragraph is the whole document, so take its text.
                  applyToRange(view, operator, $head.start(), $head.end(), false)
                } else {
                  const span = lineRange(view.state, count)
                  if (span) applyToRange(view, operator, span.from, span.to, true)
                }
              } else {
                // An operator with a motion: `dw`, `c$`, `y}`. Run the motion to
                // find where it lands, then work on everything in between.
                const start = view.state.selection.head
                // `cw` behaves like `ce`: vim's own exception, so that changing
                // a word does not swallow the space after it.
                const measure = operator === "c" && key === "w" ? "e" : key
                if (!runMotion(view, measure, count, hadCount)) return true

                const landed = view.state.selection.head
                const [from, to] = [
                  Math.min(start, landed),
                  Math.max(start, landed),
                ]

                if (LINEWISE_MOTIONS.includes(key)) {
                  const first = lineSpanAt(view.state, from)
                  const last = lineSpanAt(view.state, to)
                  if (first && last) {
                    applyToRange(view, operator, first.from, last.to, true)
                    if (operator !== "c") collapseSelection(view, first.from)
                  }
                } else if (from !== to) {
                  const end = to + (INCLUSIVE_MOTIONS.includes(measure) ? 1 : 0)
                  applyToRange(view, operator, from, end, false)
                  if (operator !== "c") collapseSelection(view, from)
                }
              }
              return true
            }

            // --- normal mode ---
            switch (key) {
              case "i":
              case "I":
                if (key === "I") moveHorizontal(view, -Infinity)
                patch(view, { mode: "insert", ...CLEARED })
                return true
              case "a":
              case "A":
                if (key === "a") moveHorizontal(view, 1, true)
                else moveHorizontal(view, Infinity, true)
                patch(view, { mode: "insert", ...CLEARED })
                return true
              case "o":
              case "O":
                // Nowhere to open a line when the document is one line, so this
                // just puts you in insert mode where you already are.
                if (!singleLine) openLine(view, key === "o" ? 1 : -1)
                patch(view, { mode: "insert", ...CLEARED })
                return true

              case "v":
              case "V": {
                const head = view.state.selection.head
                patch(view, {
                  // Linewise visual has no second line to reach for here.
                  mode: key === "V" && !singleLine ? "visualLine" : "visual",
                  visualAnchor: head,
                  visualHead: head,
                  ...CLEARED,
                })
                // A node selection - an image or a rule - has no character to
                // extend, and drawing over it would lose the node.
                if (view.state.selection instanceof TextSelection) {
                  showVisual(view, head, head, key === "V")
                }
                return true
              }

              case "d":
              case "y":
              case "c":
              case ">":
              case "<":
                patch(view, { operator: key })
                return true
              case "g":
                patch(view, { pendingG: true })
                return true

              case "/":
                onSearch?.()
                return true
              case "n":
                editor.commands.goToNextResult()
                break
              case "N":
                editor.commands.goToPreviousResult()
                break

              case "u":
                undo(view.state, view.dispatch)
                break
              case "J":
                joinLines(view, count)
                break
              case "x":
                deleteChars(view, count)
                break
              case "p":
              case "P":
                // Reading the clipboard is asynchronous, so the put lands a
                // tick later. The key is still ours either way.
                void putEither(view, vim.register, count, singleLine, key === "P")
                break

              // The shorthands, each the same as the operator and motion it
              // stands for: D is d$, C is c$, Y is yy, S is cc and s is cl.
              case "D":
              case "C": {
                const { $head, head } = view.state.selection
                if (!$head.parent.isTextblock) break
                applyToRange(view, key === "D" ? "d" : "c", head, textLineAt($head).end, false)
                break
              }
              case "Y": {
                const span = lineRange(view.state, count)
                if (span) applyToRange(view, "y", span.from, span.to, true)
                break
              }
              case "S": {
                const { $head } = view.state.selection
                if ($head.parent.isTextblock) {
                  applyToRange(view, "c", $head.start(), $head.end(), false)
                }
                break
              }
              case "s": {
                const { $head, head } = view.state.selection
                if (!$head.parent.isTextblock) break
                applyToRange(view, "c", head, Math.min(head + count, textLineAt($head).end), false)
                break
              }
              case "~": {
                // Swap the case of what is under the cursor and step over it,
                // which is how vim lets you run along a word with it.
                const { $head, head } = view.state.selection
                if (!$head.parent.isTextblock) break
                const at = Math.min(head + count, textLineAt($head).end)
                const text = view.state.doc.textBetween(head, at, undefined, "\ufffc")
                if (!text) break
                changeCase(view, head, at, text !== text.toUpperCase())
                select(view, at)
                break
              }

              default:
                if (JUMPS.includes(key)) markJump(view)
                runMotion(view, key, count, hadCount)
            }

            // Anything else is swallowed, so normal mode never inserts text.
            patch(view, CLEARED)
            return true
          },
        },
      }),
    ]
  },
})

export default VimMode
