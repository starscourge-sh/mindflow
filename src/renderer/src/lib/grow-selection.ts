import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model"
import { AllSelection, NodeSelection, Selection, TextSelection, type EditorState } from "@tiptap/pm/state"
import { CellSelection, TableMap } from "@tiptap/pm/tables"
import type { Mappable } from "@tiptap/pm/transform"
import { headingRank } from "@/extensions/toggle-heading"

/**
 * Whole blocks from one place between blocks to another, for a step that ends on a picture, a rule or a card:
 * a selection of words cannot end after one, so a section closing on a picture was picked without it. Drawn,
 * copied and typed over as the whole note's selection is (`AllSelection`), over a part of it.
 */
export class BlocksSelection extends Selection {
  constructor($from: ResolvedPos, $to: ResolvedPos) {
    super($from, $to)
  }
  map(doc: ProseMirrorNode, mapping: Mappable): Selection {
    const from = mapping.mapResult(this.from, 1)
    const to = mapping.mapResult(this.to, -1)
    if (from.deleted || to.deleted || to.pos <= from.pos) return Selection.near(doc.resolve(from.pos))
    return new BlocksSelection(doc.resolve(from.pos), doc.resolve(to.pos))
  }
  eq(other: Selection): boolean {
    return other instanceof BlocksSelection && other.from === this.from && other.to === this.to
  }
  toJSON(): { type: string; anchor: number; head: number } {
    return { type: "blocks", anchor: this.from, head: this.to }
  }
  static fromJSON(doc: ProseMirrorNode, json: { anchor: number; head: number }): BlocksSelection {
    return new BlocksSelection(doc.resolve(json.anchor), doc.resolve(json.head))
  }
}
Selection.jsonID("blocks", BlocksSelection)

/** The places a selection reaches, all its ranges together: a table's picked cells are several. */
const reach = (selection: Selection): [number, number] => [Math.min(...selection.ranges.map((one) => one.$from.pos)), Math.max(...selection.ranges.map((one) => one.$to.pos))]

/** The first and last of the words and pictures inside a reach: what a person sees picked. */
function held(doc: ProseMirrorNode, [from, to]: [number, number]): [number, number] {
  const first = Selection.findFrom(doc.resolve(from), 1)
  const last = Selection.findFrom(doc.resolve(to), -1)
  return [first && first.from <= to ? first.from : from, last && last.to >= from ? last.to : to]
}

/** Whole blocks from `from` to `to`: as words when they start and end in words (the bar, Vim and every tool take those), else as blocks. */
function blocks(doc: ProseMirrorNode, from: number, to: number): Selection {
  const words = TextSelection.between(doc.resolve(from), doc.resolve(to))
  const [first, last] = held(doc, [from, to])
  return words.from === first && words.to === last ? words : new BlocksSelection(doc.resolve(from), doc.resolve(to))
}

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

/** A table's cell, its row, then the whole table, as cells (the way a drag across them picks). `$cell` is just before the cell. */
function cellSteps($cell: ResolvedPos): Selection[] {
  const map = TableMap.get($cell.node(-1))
  const start = $cell.start(-1)
  return [new CellSelection($cell), CellSelection.rowSelection($cell), CellSelection.create($cell.doc, start + map.map[0], start + map.map[map.map.length - 1])]
}

/**
 * The ranges round the place `$at`, smallest first, each worked out only when asked for: the words of its block;
 * each block round it whole (a code block, a table's cell, row and table, a list item, a task, a quote, a callout,
 * a column, a row of columns, a list, the list that holds it), with the sections among each one's neighbours
 * between it and the block that holds them.
 */
function* ranges($at: ResolvedPos): Generator<Selection> {
  const doc = $at.doc
  if ($at.parent.isTextblock) yield TextSelection.create(doc, $at.start(), $at.end())
  else for (const [from, to] of sections($at.parent, $at.index(), $at.pos)) yield blocks(doc, from, to)
  for (let depth = $at.depth; depth > 0; depth--) {
    const node = $at.node(depth)
    const before = $at.before(depth)
    const role = node.type.spec.tableRole as string | undefined
    if (role === "cell" || role === "header_cell") yield* cellSteps(doc.resolve(before))
    else if (role !== "row" && role !== "table") yield node.type.spec.code ? NodeSelection.create(doc, before) : blocks(doc, before, $at.after(depth))
    for (const [from, to] of sections($at.node(depth - 1), $at.index(depth - 1), before)) yield blocks(doc, from, to)
  }
}

/**
 * The next selection ⌘A picks, as Obsidian and VS Code grow theirs: the smallest range holding the selection
 * that picks something more, or the same words taken whole as the thing that holds them (a code block, a table's
 * cell); the whole note last, as ⌘A always picked it, and at once where a step would pick everything in it (a
 * note of one paragraph, quick capture's line). Null once the whole note is picked. Each press looks only at the
 * blocks round the caret and stops at the first range that grows, so it costs the same in a note of seven
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
      // The same words, taken as the block they are in: a step of its own only where that block is a thing apart.
      const apart = (next instanceof NodeSelection || next instanceof CellSelection) && (span[0] < now[0] || span[1] > now[1])
      if (picks[0] < words[0] || picks[1] > words[1] || apart) return next
    }
  return new AllSelection(doc)
}

/** Selections ⌘A made: the selection bar waits a moment before offering itself on them, as on the whole note. */
const stepped = new WeakSet<Selection>()
export const grownByKey = (selection: Selection): boolean => selection instanceof AllSelection || stepped.has(selection)
export const markGrown = (selection: Selection): Selection => (stepped.add(selection), selection)
