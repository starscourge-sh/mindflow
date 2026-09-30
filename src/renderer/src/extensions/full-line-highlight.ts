import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

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
export const FullLineHighlight = Extension.create({
  name: "fullLineHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const highlight = state.schema.marks.highlight
            if (!highlight) return null

            const decorations: Decoration[] = []
            state.doc.descendants((node: ProseMirrorNode, pos) => {
              if (!node.isTextblock || node.content.size === 0) return true

              // Every piece of it, in one colour. A half-marked line is a
              // highlight of some words, and an empty inline - an image, a
              // card - is not text to mark.
              let colour: string | null | undefined
              let all = true
              node.forEach((child) => {
                const mark = highlight.isInSet(child.marks)
                if (!child.isText || !mark) all = false
                else if (colour === undefined) colour = mark.attrs.color
                else if (colour !== mark.attrs.color) all = false
              })
              if (!all) return false

              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: "mf-line-highlight",
                  // The mark's own colour, or nothing - the stylesheet falls
                  // back to the same default an unpainted `mark` wears.
                  ...(colour ? { style: `--mf-line-highlight: ${colour}` } : {}),
                })
              )
              return false
            })

            if (!decorations.length) return null
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
