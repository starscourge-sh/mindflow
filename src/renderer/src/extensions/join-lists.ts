import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { canJoin } from "@tiptap/pm/transform"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

const LISTS = ["bulletList", "orderedList", "taskList"]

/**
 * Two lists of the same kind, side by side, become one.
 *
 * Pasting a list from somewhere else often gives one list per line. They look
 * exactly like a single list with several items, but they do not behave like
 * one: Tab cannot nest an item under the line above it, because inside its own
 * list that item is the first and has nothing to nest under. It reads as Tab
 * being broken at random.
 *
 * Matching the type as well as asking `canJoin` is the point. Every list holds
 * `listItem+`, so a bullet list and an ordered list are content compatible and
 * `canJoin` says yes to both, which would quietly turn a numbered list into
 * bullets.
 */
export const JoinLists = Extension.create({
  name: "joinLists",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null

          const points: number[] = []
          const scan = (node: ProseMirrorNode, start: number): void => {
            node.forEach((child, offset, index) => {
              const at = start + offset
              if (
                index > 0 &&
                LISTS.includes(child.type.name) &&
                node.child(index - 1).type === child.type
              ) {
                points.push(at)
              }
              if (child.isBlock) scan(child, at + 1)
            })
          }
          scan(state.doc, 0)
          if (!points.length) return null

          // Back to front, so joining one does not move the ones still to do.
          const tr = state.tr
          let joined = false
          for (const at of points.reverse()) {
            if (!canJoin(tr.doc, at)) continue
            tr.join(at)
            joined = true
          }
          return joined ? tr : null
        },
      }),
    ]
  },
})
