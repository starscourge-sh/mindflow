import { Extension } from "@tiptap/core"
import type { Fragment, Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, type EditorState, type Transaction } from "@tiptap/pm/state"
import { ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform"

/** A bullet, a number, a checkbox. */
const ITEMS = new Set(["listItem", "taskItem"])

/**
 * An item that opens on anything but its line of words: a list straight inside it ("-" alone on its line over an
 * indented list, read from Markdown or brought in whole), with no line of its own. Its bullet then drew on its child's
 * line beside the child's own, two bullets and two line numbers on one line (16 Nov: "◦ ▪ 1.35 storage").
 */
const lineless = (node: ProseMirrorNode): boolean => ITEMS.has(node.type.name) && node.firstChild?.type.name !== "paragraph"

/** Whether what came in holds such an item: a typed letter holds no item, so this costs a key nothing. */
function holdsLineless(content: Fragment): boolean {
  let found = false
  content.descendants((node) => {
    if (found) return false
    if (lineless(node)) found = true
    return !node.isTextblock
  })
  return found
}

/**
 * Each such item given its empty line back, where it would be had it been written in the editor: an empty bullet with
 * the list under it, as Obsidian draws the same Markdown. Nothing moves a level and no words change. Last first, so an
 * item inside another keeps its place while the outer one is mended.
 */
function mend(state: EditorState): Transaction | null {
  const at: number[] = []
  state.doc.descendants((node, pos) => {
    if (lineless(node)) at.push(pos)
    return !node.isTextblock
  })
  if (!at.length) return null
  const tr = state.tr
  for (const pos of at.reverse()) tr.insert(pos + 1, state.schema.nodes.paragraph.create())
  return tr
}

/**
 * Items always open on a line of words. Mended as a note opens (its first content, or content set in), and whenever
 * something brought in holds such an item (a paste, a join, a template): never by reading the whole note on a key.
 */
export const UnwrapBareLists = Extension.create({
  name: "unwrapBareLists",

  onCreate() {
    const tr = mend(this.editor.state)
    if (tr) this.editor.view.dispatch(tr.setMeta("addToHistory", false))
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          const brought = transactions.some((tr) => tr.docChanged && tr.steps.some((step) => (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) && holdsLineless(step.slice.content)))
          return brought ? mend(state) : null
        },
      }),
    ]
  },
})
