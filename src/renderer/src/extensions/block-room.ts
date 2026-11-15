import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

// The room over a block that depends on what is before it, kept on the block as a class: a paragraph after a
// paragraph ("mf-after-p") or after a heading ("mf-after-h"), set by BlockRoom (main.css, the reading rhythm), and the
// block right under the property strip or a caption ("mf-under-widget", set by those; heading-node.scss). Asked in
// CSS as ".mf-p + p" or ".ProseMirror-widget + h1", a line put in (Enter, a paste, ⌘Z) had Chromium restyle every
// paragraph or heading of the note, 3,472 and 744 in the largest: a sibling rule is asked of the whole parent. A
// class is asked only of the block that has it (test/has-narrow.test.ts holds the sibling rules out).

/** The block straight after each widget in `set` (the strip, a caption) marked "mf-under-widget". */
export function under(doc: ProseMirrorNode, set: DecorationSet | undefined): DecorationSet {
  const marks = (set?.find() ?? []).flatMap((one) => {
    const next = one.from === one.to ? doc.nodeAt(one.to) : null
    return next && !next.isInline ? [Decoration.node(one.to, one.to + next.nodeSize, { class: "mf-under-widget" })] : []
  })
  return marks.length && set ? set.add(doc, marks) : (set ?? DecorationSet.empty)
}

/**
 * The same marks on blocks drawn outside an editor (a web page in the reader, a board's copies of a note's lines),
 * read from the elements as they stand in `holder`: a copy keeps the marks of its place in the note, not of its new one.
 */
export function markRoom(holder: ParentNode): void {
  for (const one of holder.children) {
    const before = one.previousElementSibling?.tagName ?? ""
    one.classList.remove("mf-after-p", "mf-after-h", "mf-under-widget")
    if (one.tagName === "P" && /^(?:P|H[1-4])$/.test(before)) one.classList.add(before === "P" ? "mf-after-p" : "mf-after-h")
  }
}

/** The marks of the note's top-level blocks from the one holding `start` to the one after the one holding `end`, and where they run. */
function marks(doc: ProseMirrorNode, start: number, end: number): { from: number; to: number; found: Decoration[] } {
  const $start = doc.resolve(start)
  let index = Math.min($start.index(0), doc.childCount - 1)
  let pos = $start.posAtIndex(index, 0)
  const from = pos
  const last = Math.min(doc.childCount - 1, doc.resolve(end).index(0) + 1)
  const found: Decoration[] = []
  for (; index <= last; index++) {
    const node = doc.child(index)
    const before = index > 0 ? doc.child(index - 1).type.name : ""
    if (node.type.name === "paragraph" && (before === "paragraph" || before === "heading"))
      found.push(Decoration.node(pos, pos + node.nodeSize, { class: before === "paragraph" ? "mf-after-p" : "mf-after-h" }))
    pos += node.nodeSize
  }
  return { from, to: pos, found }
}

export const BlockRoom = Extension.create({
  name: "blockRoom",

  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>("blockRoom")
    return [
      new Plugin({
        key,
        state: {
          init: (_, { doc }) => DecorationSet.create(doc, marks(doc, 0, doc.content.size).found),
          // Only the blocks around what changed are asked again; the rest move with the words.
          apply: (tr, set) => {
            if (!tr.docChanged) return set
            let start = Infinity
            let end = -Infinity
            tr.mapping.maps.forEach((map, i) =>
              map.forEach((_from, _to, from, to) => {
                const rest = tr.mapping.slice(i + 1)
                start = Math.min(start, rest.map(from, -1))
                end = Math.max(end, rest.map(to, 1))
              }),
            )
            const moved = set.map(tr.mapping, tr.doc)
            if (start > end) return moved
            const { from, to, found } = marks(tr.doc, start, end)
            return moved.remove(moved.find(from + 1, to - 1)).add(tr.doc, found)
          },
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ]
  },
})
