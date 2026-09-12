import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model"

/** Letters, digits, underscore and apostrophe - so "don't" counts as one word. */
const WORD_CHAR = /[\p{L}\p{N}_']/u

/**
 * The document range of the word surrounding a position, or null when that
 * position is not inside a word.
 *
 * Shared by the whole-word mark toggles and by vim's `iw` text object.
 */
export function wordRangeAt(
  doc: ProseMirrorNode,
  pos: number
): { from: number; to: number } | null {
  let $pos: ResolvedPos
  try {
    $pos = doc.resolve(pos)
  } catch {
    return null
  }
  if (!$pos.parent.isTextblock) return null

  const blockStart = $pos.start()
  // A one-character placeholder keeps offsets lined up with positions for
  // inline atoms like images and math, which never count as word characters.
  const text = doc.textBetween(blockStart, $pos.end(), undefined, "￼")
  const offset = $pos.pos - blockStart

  let from = offset
  while (from > 0 && WORD_CHAR.test(text[from - 1])) from--
  let to = offset
  while (to < text.length && WORD_CHAR.test(text[to])) to++

  if (from === to) return null
  return { from: blockStart + from, to: blockStart + to }
}
