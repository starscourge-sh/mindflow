import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Transaction } from "@tiptap/pm/state"
import { ReplaceStep } from "@tiptap/pm/transform"

/** What each changed note was found to have changed from the note before it. */
const spans = new WeakMap<ProseMirrorNode, { before: ProseMirrorNode; span: { from: number; oldTo: number; newTo: number } | null }>()

/**
 * What a change touched, as one stretch: where the two documents first differ, and where they last do in each.
 * Comparing them skips every block both share, so it costs what changed, however many steps made it. TipTap's
 * getChangedRanges carries each step's change through every step after it and back (a whole long note pasted
 * back: 898 steps, a quarter of a second for each pass that asked).
 */
export function changedSpan(before: ProseMirrorNode, after: ProseMirrorNode): { from: number; oldTo: number; newTo: number } | null {
  // Asked by every plugin of the same change: compared once.
  const known = spans.get(after)
  if (known?.before === before) return known.span
  const from = before.content.findDiffStart(after.content)
  let span: { from: number; oldTo: number; newTo: number } | null = null
  if (from !== null) {
    let { a: oldTo, b: newTo } = before.content.findDiffEnd(after.content)!
    // Words added beside the same words (a letter typed twice over): the two ends come out before the start.
    if (oldTo < from && before.content.size < after.content.size) ((newTo = from + newTo - oldTo), (oldTo = from))
    else if (newTo < from) ((oldTo = from + oldTo - newTo), (newTo = from))
    span = { from, oldTo, newTo }
  }
  spans.set(after, { before, span })
  return span
}

/**
 * The note's own blocks a change touched, in the note after it: `changedSpan` widened to the start of the first and
 * the end of the last of them. What a plugin draws from those blocks alone is drawn again there, and the rest moved.
 */
export function changedBlocks(before: ProseMirrorNode, after: ProseMirrorNode): { from: number; to: number } | null {
  const span = changedSpan(before, after)
  if (!span) return null
  const $from = after.resolve(span.from)
  const $to = after.resolve(span.newTo)
  return { from: $from.depth ? $from.before(1) : span.from, to: $to.depth ? $to.after(1) : span.newTo }
}

/**
 * The lines a change wrote words into, when it did nothing else: a key typed,
 * a word deleted, a word pasted inside one line. Each is given where it starts
 * in the note before the change and after it. Null for anything that adds,
 * splits, joins or removes a block, or changes one's kind: those can change
 * more than the line they touch.
 *
 * Marks worked out from the whole note on every change (cards, kept passages)
 * use it to redo only the line typed in, so a key in a long note costs that
 * line, not thousands of blocks.
 */
export function linesTyped(tr: Transaction): { before: number; after: number }[] | null {
  if (!tr.docChanged) return []
  const lines: { before: number; after: number }[] = []
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i]
    if (!(step instanceof ReplaceStep)) return null
    const { slice, from, to } = step
    if (slice.openStart || slice.openEnd) return null
    let inline = true
    slice.content.forEach((node) => void (inline &&= node.isInline))
    if (!inline) return null
    const doc = tr.docs[i]
    const $from = doc.resolve(from)
    const $to = doc.resolve(to)
    if (!$from.sameParent($to) || !$from.parent.isTextblock) return null
    const start = $from.before()
    // Where this line starts in the note before the whole change, and after it.
    const before = tr.mapping.slice(0, i).invert().map(start, 1)
    const after = tr.mapping.slice(i).map(start, 1)
    if (!lines.some((one) => one.after === after)) lines.push({ before, after })
  }
  return lines
}

/**
 * The lines (textblocks) a change touched, in the note after it, each by where it starts and ends, with the lines
 * either side of each place it changed: what is read from a line's own words (dates, tags) is read again only there.
 */
export function linesTouched(tr: Transaction): Map<number, number> {
  const lines = new Map<number, number>()
  const { doc } = tr
  tr.mapping.maps.forEach((map, index) => {
    const after = tr.mapping.slice(index + 1)
    map.forEach((_from, _to, from, to) => {
      doc.nodesBetween(Math.max(0, after.map(from, -1) - 1), Math.min(doc.content.size, after.map(to, 1) + 1), (node, pos) => {
        if (!node.isTextblock) return true
        lines.set(pos, pos + node.nodeSize)
        return false
      })
    })
  })
  return lines
}
