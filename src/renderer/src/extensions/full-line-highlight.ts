import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

import { onlyWordsChanged } from "@/lib/tiptap-utils"

/** The band for one line, when the whole of it wears one highlight. */
function band(node: ProseMirrorNode, pos: number): Decoration | null {
  const highlight = node.type.schema.marks.highlight
  if (!highlight || !node.isTextblock || node.content.size === 0) return null
  // Every piece of it, in one colour. A half-marked line is a highlight of
  // some words, and an empty inline - an image, a card - is not text to mark.
  let colour: string | null | undefined
  let all = true
  node.forEach((child) => {
    const mark = highlight.isInSet(child.marks)
    if (!child.isText || !mark) all = false
    else if (colour === undefined) colour = mark.attrs.color
    else if (colour !== mark.attrs.color) all = false
  })
  if (!all) return null
  return Decoration.node(pos, pos + node.nodeSize, {
    class: "mf-line-highlight",
    // The mark's own colour, or nothing - the stylesheet falls back to the
    // same default an unpainted `mark` wears.
    ...(colour ? { style: `--mf-line-highlight: ${colour}` } : {}),
  })
}

/**
 * A highlight covering a whole line is drawn as a band across it.
 *
 * Marking a few words should hug the words; marking the line should look like
 * the line is marked, which means a band the width of the block rather than
 * one that stops where the text does and breaks wherever the text breaks. It
 * is what Notion does, and the difference shows most on a list of links: hug
 * them and you get a row of ragged patches, band them and you get a list.
 *
 * CSS cannot tell the two apart - `mark` is inline either way, and no selector
 * asks "is the rest of this block marked too". So the check happens here, and
 * the block gets a class the stylesheet can paint.
 */
function bands(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const one = band(node, pos)
    if (one) decorations.push(one)
    return false
  })
  return DecorationSet.create(doc, decorations)
}

export const FullLineHighlight = Extension.create({
  name: "fullLineHighlight",

  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>("fullLineHighlight")
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => bands(state.doc),
          // Words typed in a line: only that line is looked at again. Walking
          // the whole note on every key was slow in a long one.
          apply: (tr, set) => {
            if (!tr.docChanged) return set
            if (!onlyWordsChanged(tr)) return bands(tr.doc)
            let next = set.map(tr.mapping, tr.doc)
            tr.mapping.maps.forEach((map, index) => {
              const after = tr.mapping.slice(index + 1)
              map.forEach((_from, _to, start, end) => {
                for (const at of [after.map(start, -1), after.map(end, 1)]) {
                  const $at = tr.doc.resolve(Math.min(at, tr.doc.content.size))
                  if (!$at.parent.isTextblock || !$at.depth) continue
                  const from = $at.before()
                  next = next.remove(next.find(from, $at.after(), undefined).filter((one) => one.from === from))
                  const one = band($at.parent, from)
                  if (one) next = next.add(tr.doc, [one])
                }
              })
            })
            return next
          },
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ]
  },
})
