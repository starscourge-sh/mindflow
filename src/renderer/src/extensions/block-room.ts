import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

// The room over a block that depends on what is before it, kept on the block as a class: a paragraph after a
// paragraph ("mf-after-p") or after a heading ("mf-after-h"), put on by BlockRoom (main.css, the reading rhythm), and
// the block right under the property strip or a caption ("mf-under-widget", set by those; heading-node.scss). Asked in
// CSS as ".mf-p + p" or ".ProseMirror-widget + h1", a line put in (Enter, a paste, ⌘Z) had Chromium restyle every
// paragraph or heading of the note, 3,472 and 744 in the largest: a sibling rule is asked of the whole parent. A
// class is asked only of the block that has it (test/has-narrow.test.ts holds the sibling rules out).

const ROOM = ["mf-after-p", "mf-after-h"]

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
    // Any block under a heading (a quote, a picture, a list): the web reader sets it close to its heading (pdf.css).
    else if (/^H[1-6]$/.test(before)) one.classList.add("mf-after-h")
  }
}

/** The room the top-level block at `index` wears: a paragraph after a paragraph or after a heading. */
export function roomOf(doc: ProseMirrorNode, index: number): string | null {
  if (!index || doc.child(index).type.name !== "paragraph") return null
  const before = doc.child(index - 1).type.name
  return before === "paragraph" ? "mf-after-p" : before === "heading" ? "mf-after-h" : null
}

/** The top-level blocks of `doc` that a change from `prev` reached, and the one after them, by index; null when none. */
export function reached(prev: ProseMirrorNode, doc: ProseMirrorNode): [number, number] | null {
  const start = prev.content.findDiffStart(doc.content)
  if (start == null) return null
  const end = prev.content.findDiffEnd(doc.content)?.b ?? doc.content.size
  const last = doc.childCount - 1
  return [Math.min(last, doc.resolve(Math.min(start, end)).index(0)), Math.min(last, doc.resolve(Math.max(start, end)).index(0) + 1)]
}

/**
 * The room put on the elements of the top-level blocks from index `first` to `last`, each read from where it stands
 * in the note. On the elements themselves, as extensions/long-document.ts marks its far blocks: a mark is no change to
 * the note, so ProseMirror is not told. (As node decorations, one on each of a long note's 1,600 such paragraphs,
 * ProseMirror went through all of them for every block it drew on each key: ten million steps a key in the largest.)
 */
function paint(view: EditorView, first: number, last: number): void {
  const { doc } = view.state
  const watch = (view as unknown as { domObserver: { stop: () => void; start: () => void } }).domObserver
  let index = 0
  let stopped = false
  // The page's children are the blocks in order, with the widgets and long-document.ts's spaces among them.
  for (const one of view.dom.children) {
    if (index > last) break
    const node = (one as unknown as { pmViewDesc?: { node?: ProseMirrorNode } }).pmViewDesc?.node
    if (!node || node !== doc.maybeChild(index)) continue
    if (index >= first) {
      const want = roomOf(doc, index)
      if (ROOM.some((name) => one.classList.contains(name) !== (name === want))) {
        if (!stopped) (watch.stop(), (stopped = true))
        for (const name of ROOM) one.classList.toggle(name, name === want)
      }
    }
    index++
  }
  if (stopped) watch.start()
}

export const BlockRoom = Extension.create({
  name: "blockRoom",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: (view) => {
          paint(view, 0, view.state.doc.childCount - 1)
          return {
            // Only the blocks a change reached are asked again, and the one after them; the rest keep their elements.
            update: (view, prev) => {
              const at = view.state.doc === prev.doc ? null : reached(prev.doc, view.state.doc)
              if (at) paint(view, at[0], at[1])
            },
          }
        },
      }),
    ]
  },
})
