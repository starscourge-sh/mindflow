import { Extension } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin } from "@tiptap/pm/state"

/** A bullet, a number, a checkbox. */
const ITEMS = new Set(["listItem", "taskItem"])
/** A bulleted, numbered or checked list. */
const LISTS = new Set(["bulletList", "orderedList", "taskList"])

/**
 * A list item whose only children are lists: the line of words was lifted out
 * (a heading, a quote) and the item stayed behind, so its bullet or checkbox
 * draws on the first child's line.
 *
 * The item goes, and the lists it held take its place. A list can hold items,
 * not lists, so the list around the item splits: what was before it, then
 * these lists, then what was after it.
 */
function bareItems(doc: ProseMirrorNode): number[] {
  const at: number[] = []
  doc.descendants((node, pos) => {
    if (!ITEMS.has(node.type.name) || node.childCount === 0) return true
    let lists = true
    node.forEach((child) => {
      if (!LISTS.has(child.type.name)) lists = false
    })
    if (lists) at.push(pos)
    return true
  })
  return at
}

export const UnwrapBareLists = Extension.create({
  name: "unwrapBareLists",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          const tr = state.tr
          let changed = false
          for (let guard = 0; guard < 12; guard++) {
            const found = bareItems(tr.doc)
            if (!found.length) break
            const pos = found[found.length - 1]
            const item = tr.doc.nodeAt(pos)
            const $pos = tr.doc.resolve(pos)
            const list = $pos.parent
            if (!item || !LISTS.has(list.type.name)) break
            const index = $pos.index()
            const listStart = $pos.before()
            const before: ProseMirrorNode[] = []
            const after: ProseMirrorNode[] = []
            list.forEach((child, _offset, i) => {
              if (i < index) before.push(child)
              else if (i > index) after.push(child)
            })
            const inner: ProseMirrorNode[] = []
            item.forEach((child) => inner.push(child))
            const pieces: ProseMirrorNode[] = [
              ...(before.length ? [list.type.create(list.attrs, before)] : []),
              ...inner,
              ...(after.length ? [list.type.create(list.attrs, after)] : []),
            ]
            tr.replaceWith(listStart, listStart + list.nodeSize, pieces)
            changed = true
          }
          return changed ? tr : null
        },
      }),
    ]
  },
})
