import { Extension, type Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"

/**
 * A line's own lasting name, so a link can land on one paragraph and an embed
 * can show one line, as Obsidian's `^id` does. Given only when something
 * links to the line: a note nobody points into carries none, and an old note
 * reads as it always did.
 */
import { BLOCK_TYPES, newBlockId } from "../../../main/blocks"

export { BLOCK_TYPES, blockIn, linesIn, newBlockId, withBlockMarks, wordsOf } from "../../../main/blocks"

/** The line with this name, and where it is. */
export function findBlock(doc: ProseMirrorNode, id: string): { node: ProseMirrorNode; pos: number } | null {
  let found: { node: ProseMirrorNode; pos: number } | null = null
  doc.descendants((node, pos) => {
    if (found) return false
    if (node.attrs?.blockId === id) found = { node, pos }
    return !node.isTextblock
  })
  return found
}

/** The line at `pos` (or the one holding it), given a name if it had none. Not an undo step: it is the same line. */
export function nameBlock(editor: Editor, pos: number): string | null {
  const { state } = editor
  const $pos = state.doc.resolve(Math.min(pos + 1, state.doc.content.size))
  let at = -1
  for (let depth = $pos.depth; depth > 0; depth--) if (BLOCK_TYPES.includes($pos.node(depth).type.name)) (at = $pos.before(depth), (depth = 0))
  const node = at >= 0 ? state.doc.nodeAt(at) : state.doc.nodeAt(pos)
  if (at < 0 && node && BLOCK_TYPES.includes(node.type.name)) at = pos
  if (at < 0 || !node || !BLOCK_TYPES.includes(node.type.name)) return null
  if (node.attrs.blockId) return node.attrs.blockId
  const id = newBlockId()
  editor.view.dispatch(state.tr.setNodeMarkup(at, undefined, { ...node.attrs, blockId: id }).setMeta("addToHistory", false))
  return id
}

const dedupe = new PluginKey("blockIdsOnce")

export const BlockIds = Extension.create({
  name: "blockIds",

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          blockId: {
            default: null,
            // A line split in two keeps its name on the first half only.
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attributes) => (attributes.blockId ? { "data-block-id": attributes.blockId } : {}),
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      // A line pasted or dropped in again, or copied whole, would carry the
      // same name twice: the copy loses it, so a link still has one place to land.
      new Plugin({
        key: dedupe,
        appendTransaction: (transactions, old, state) => {
          if (!transactions.some((tr) => tr.docChanged && (tr.getMeta("uiEvent") === "paste" || tr.getMeta("uiEvent") === "drop" || tr.getMeta("paste") || tr.getMeta("blockCopy")))) return null
          const places = new Map<string, number[]>()
          state.doc.descendants((node, pos) => {
            const id = node.attrs?.blockId
            if (id) places.set(id, [...(places.get(id) ?? []), pos])
            return !id && !node.isTextblock
          })
          const tr = state.tr
          for (const [id, all] of places) {
            if (all.length < 2) continue
            // The one that was there before keeps the name; with none, the first.
            const was = findBlock(old.doc, id)?.pos
            const now = was === undefined ? all[0] : transactions.reduce((at, one) => one.mapping.map(at), was)
            const keep = all.includes(now) ? now : all[0]
            for (const pos of all) if (pos !== keep) tr.setNodeMarkup(pos, undefined, { ...state.doc.nodeAt(pos)!.attrs, blockId: null })
          }
          return tr.docChanged ? tr.setMeta("addToHistory", false) : null
        },
      }),
    ]
  },
})
