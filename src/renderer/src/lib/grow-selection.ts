import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model"
import { AllSelection, Selection, TextSelection, type EditorState } from "@tiptap/pm/state"
import { CellSelection } from "@tiptap/pm/tables"
import { NodeRangeSelection } from "@tiptap/extension-node-range"
import { headingRank } from "@/extensions/toggle-heading"
import { pickBetween } from "@/extensions/picked-blocks"

/** The places a selection reaches, all its ranges together: a table's picked cells are several, and so are picked blocks. */
const reach = (selection: Selection): [number, number] => [Math.min(...selection.ranges.map((one) => one.$from.pos)), Math.max(...selection.ranges.map((one) => one.$to.pos))]

/** The first and last of the words and pictures inside a reach: what a person sees picked. */
function held(doc: ProseMirrorNode, [from, to]: [number, number]): [number, number] {
  const first = Selection.findFrom(doc.resolve(from), 1)
  const last = Selection.findFrom(doc.resolve(to), -1)
  return [first && first.from <= to ? first.from : from, last && last.to >= from ? last.to : to]
}

/**
 * A step that holds the words of the step before and no more, and is still a step of its own: a code block or a
 * table taken whole after its words, a cell after its words. Elsewhere (a line's block, a quote round its one line)
 * the same words picked again would be a press that picks nothing new.
 */
const apart = (selection: Selection): boolean =>
  selection instanceof CellSelection ||
  (selection instanceof NodeRangeSelection && selection.ranges.length === 1 && !!selection.$from.nodeAfter && (!!selection.$from.nodeAfter.type.spec.code || selection.$from.nodeAfter.type.spec.tableRole === "table"))

/**
 * The sections round the block at `index` of `parent` (which starts at `pos`), smallest first: from the nearest
 * heading above it (the block itself, when it is one) to the next heading of the same rank or higher, then the
 * section of the heading above that one. Walked from the block outwards, one heading at a time, as each is asked for.
 */
function* sections(parent: ProseMirrorNode, index: number, pos: number): Generator<[number, number]> {
  if (index >= parent.childCount) return
  let rank = Infinity
  for (let at = index; at >= 0 && rank > 1; at--) {
    if (at < index) pos -= parent.child(at).nodeSize
    const level = headingRank(parent.child(at))
    if (level === null || level >= rank) continue
    rank = level
    let to = pos
    for (let i = at; i < parent.childCount && (i === at || (headingRank(parent.child(i)) ?? Infinity) > level); i++) to += parent.child(i).nodeSize
    yield [pos, to]
  }
}

/** A table's cell, then its row, as cells (the way a drag across them picks). `$cell` is just before the cell. */
const cellSteps = ($cell: ResolvedPos): Selection[] => [new CellSelection($cell), CellSelection.rowSelection($cell)]

/**
 * The ranges round the place `$at`, smallest first, each worked out only when asked for: the words of its block;
 * each block round it whole, picked as blocks as a grip or a box picks them (extensions/picked-blocks.ts: a code
 * block, a table's cell and row as cells then the table, a list item, a task, a quote, a callout, a column, a row of
 * columns, a list, the list that holds it), with the sections among each one's neighbours between it and the block
 * that holds them.
 */
function* ranges($at: ResolvedPos): Generator<Selection> {
  const doc = $at.doc
  if ($at.parent.isTextblock) yield TextSelection.create(doc, $at.start(), $at.end())
  else for (const [from, to] of sections($at.parent, $at.index(), $at.pos)) yield pickBetween(doc, from, to)
  for (let depth = $at.depth; depth > 0; depth--) {
    const role = $at.node(depth).type.spec.tableRole as string | undefined
    const before = $at.before(depth)
    if (role === "cell" || role === "header_cell") yield* cellSteps(doc.resolve(before))
    else if (role !== "row") yield pickBetween(doc, before, $at.after(depth))
    for (const [from, to] of sections($at.node(depth - 1), $at.index(depth - 1), before)) yield pickBetween(doc, from, to)
  }
}

/**
 * The next selection ⌘A picks, as Obsidian and VS Code grow theirs: the smallest range holding the selection
 * that picks something more, or the same words taken whole as the thing that holds them (a code block, a table's
 * cell, a table); the whole note last, as ⌘A always picked it, and at once where a step would pick everything in
 * it (a note of one paragraph, quick capture's line). Null once the whole note is picked. Each press looks only at
 * the blocks round the caret and stops at the first range that grows, so it costs the same in a note of seven
 * thousand blocks as in one of seven, until the last step picks the note whole.
 */
export function grow(state: EditorState, from: Selection = state.selection): Selection | null {
  if (from instanceof AllSelection) return null
  const { doc } = state
  const all = held(doc, [0, doc.content.size])
  const now = reach(from)
  const words = held(doc, now)
  if (words[0] > all[0] || words[1] < all[1])
    for (const next of ranges(doc.resolve(now[0]))) {
      const span = reach(next)
      const picks = held(doc, span)
      if (picks[0] > words[0] || picks[1] < words[1] || span[0] > now[0] || span[1] < now[1]) continue
      if (picks[0] <= all[0] && picks[1] >= all[1]) break
      if (picks[0] < words[0] || picks[1] > words[1] || (apart(next) && (span[0] < now[0] || span[1] > now[1]))) return next
    }
  return new AllSelection(doc)
}

/** Selections ⌘A made: the selection bar waits a moment before offering itself on them, as on the whole note. */
const stepped = new WeakSet<Selection>()
export const grownByKey = (selection: Selection): boolean => selection instanceof AllSelection || stepped.has(selection)
export const markGrown = (selection: Selection): Selection => (stepped.add(selection), selection)
