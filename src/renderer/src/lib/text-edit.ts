import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Transaction } from "@tiptap/pm/state"
import { ReplaceStep } from "@tiptap/pm/transform"

/**
 * What a change touched, as one stretch: where the two documents first differ, and where they last do in each.
 * Comparing them skips every block both share, so it costs what changed, however many steps made it. TipTap's
 * getChangedRanges carries each step's change through every step after it and back (a whole long note pasted
 * back: 898 steps, a quarter of a second for each pass that asked).
 */
export function changedSpan(before: ProseMirrorNode, after: ProseMirrorNode): { from: number; oldTo: number; newTo: number } | null {
  const from = before.content.findDiffStart(after.content)
  if (from === null) return null
  let { a: oldTo, b: newTo } = before.content.findDiffEnd(after.content)!
  // Words added beside the same words (a letter typed twice over): the two ends come out before the start.
  if (oldTo < from && before.content.size < after.content.size) ((newTo = from + newTo - oldTo), (oldTo = from))
  else if (newTo < from) ((oldTo = from + oldTo - newTo), (newTo = from))
  return { from, oldTo, newTo }
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
