import { canJoin } from "@tiptap/pm/transform"
import { TextSelection } from "@tiptap/pm/state"
import type { Editor } from "@tiptap/react"
import type { Node as ProseMirrorNode, NodeType } from "@tiptap/pm/model"
import type { EditorState, Transaction } from "@tiptap/pm/state"

/** The item type each kind of list holds. */
const ITEM_OF: Record<string, string> = {
  bulletList: "listItem",
  orderedList: "listItem",
  taskList: "taskItem"
}

const ITEMS = ["listItem", "taskItem"]

/** The three kinds of list, which is what a retype has to find the edges of. */
const LISTS = Object.keys(ITEM_OF)

/**
 * Retype the list items the selection touches, leaving the rest of the list
 * alone. Returns false when there is no list to retype.
 *
 * TipTap's own `toggleList` cannot do this at all between a checklist and the
 * other two: it converts by calling `setNodeMarkup` on the list node, which
 * needs the new list to accept the items already there - and `taskList` holds
 * `taskItem` where `bulletList` holds `listItem`, so the test never passes. It
 * falls through to wrapping instead, and because a `listItem` here may legally
 * hold a `taskList` (which `liftToOuterList` requires), the wrap succeeds and
 * you end up with a checklist nested inside the bullets rather than instead of
 * them.
 *
 * So the list is rebuilt rather than retyped, which is also the only way to
 * change some of a list and not all of it.
 */
export function retypeList(editor: Editor, list: string): boolean {
  return editor.commands.command(({ state, tr, dispatch }) => {
    const type = state.schema.nodes[list]
    // A checklist holds `taskItem` and the other two hold `listItem`, so
    // the item has to change type along with the list around it.
    const item = state.schema.nodes[ITEM_OF[list]]
    const { $from, $to } = state.selection
    // Every item the selection touches, not just the one the caret is in:
    // dragging over four lines and asking for checkboxes means four.
    const range = $from.blockRange($to, (node) => LISTS.includes(node.type.name))
    if (!type || !item) return false

    // No single list holds both ends of the selection. That is what a run
    // looks like once part of it has been converted - a checklist and a bullet
    // list side by side are two lists, not one - so each is rebuilt in place.
    if (!range) return retypeEach(tr, state, $from.pos, $to.pos, type, item, dispatch)
    if (!ITEMS.includes(range.parent.child(range.startIndex).type.name)) return false

    // Later edge first throughout, here and in the joins below: cutting the
    // earlier one would move every position after it.
    if (range.endIndex < range.parent.childCount) tr.split(range.end, 1)
    if (range.startIndex > 0) tr.split(range.start, 1)

    const start = range.start - 1
    const at = tr.mapping.map(range.start) - 1
    const was = tr.doc.nodeAt(at)
    if (!was || was.type === type) return false

    // Rebuilt in one step, not retyped in two: a list is only ever valid
    // holding its own kind of item, so changing the list and then the item
    // passes through a state the schema rejects and the whole thing throws.
    const items: ProseMirrorNode[] = []
    was.forEach((child) =>
      items.push(child.type === item ? child : item.create(null, child.content))
    )
    const next = type.create(was.attrs, items)
    tr.replaceWith(at, at + was.nodeSize, next)
    // The rebuilt items hold the same content at the same offsets, so the
    // selection is where the transaction says it went. Left to itself the
    // caret maps into the list that follows, and the next press converts
    // the wrong line.
    // By arithmetic, not by the mapping. Replacing a node counts everything
    // inside it as deleted, so every interior position maps to the node's far
    // edge - the caret came out on the line below the one just converted, and
    // the next press then acted on that line instead.
    //
    // The rebuilt items hold the same content at the same offsets, so an
    // offset from the start of the list still names the same place.
    const inside = (pos: number): number =>
      Math.max(at + 1, Math.min(at + next.nodeSize - 1, at + (pos - start)))
    tr.setSelection(
      TextSelection.between(tr.doc.resolve(inside($from.pos)), tr.doc.resolve(inside($to.pos)))
    )

    // Two lists of the SAME kind side by side are one list, or converting a
    // line and converting it back would leave the run cut in three where
    // the split was. The type test is not redundant: `canJoin` only asks
    // whether the content matches, and every list holds `listItem+`, so it
    // would happily merge the numbered line straight back in.
    const joinable = (pos: number): boolean =>
      canJoin(tr.doc, pos) &&
      tr.doc.resolve(pos).nodeBefore?.type ===
        tr.doc.resolve(pos).nodeAfter?.type

    if (joinable(at + next.nodeSize)) tr.join(at + next.nodeSize)
    if (joinable(at)) tr.join(at)

    if (dispatch) dispatch(tr.scrollIntoView())
    return true
  })
}

/**
 * Rebuild every list the selection touches, where it sits.
 *
 * The path above splits one list and rebuilds the middle, which is what
 * "convert three of these twenty" needs. This is for the case with no middle:
 * two lists side by side, each converted whole.
 */
function retypeEach(
  tr: Transaction,
  state: EditorState,
  from: number,
  to: number,
  type: NodeType,
  item: NodeType,
  dispatch: ((tr: Transaction) => void) | undefined
): boolean {
  const edits: { pos: number; node: ProseMirrorNode }[] = []

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!LISTS.includes(node.type.name)) return true
    // Already this kind, or nested inside one about to be rebuilt anyway.
    if (node.type !== type) edits.push({ pos, node })
    return false
  })
  if (!edits.length) return false

  // Later edge first, so an earlier rebuild cannot move a position after it.
  for (const { pos, node } of edits.reverse()) {
    const items: ProseMirrorNode[] = []
    node.forEach((child) =>
      items.push(child.type === item ? child : item.create(null, child.content))
    )
    tr.replaceWith(pos, pos + node.nodeSize, type.create(node.attrs, items))
  }

  // Two lists of the same kind, now adjacent, are one list. Lists only: the
  // same test without that clause happily joins two paragraphs, and a run of
  // items came back as one item holding all the text.
  for (let pos = tr.doc.content.size; pos >= 0; pos--) {
    const $pos = tr.doc.resolve(pos)
    const before = $pos.nodeBefore
    if (!before || before.type !== $pos.nodeAfter?.type) continue
    if (!LISTS.includes(before.type.name)) continue
    if (canJoin(tr.doc, pos)) tr.join(pos)
  }

  // Rebuilding preserves every content size, so the old positions still name
  // the same places - but a join above removes a boundary, so the far end can
  // now be past the end of the document. Unclamped, resolving it throws, the
  // transaction is abandoned, and the whole command silently does nothing.
  const at = (pos: number): number => Math.max(0, Math.min(tr.doc.content.size, pos))
  tr.setSelection(TextSelection.between(tr.doc.resolve(at(from)), tr.doc.resolve(at(to))))
  if (dispatch) dispatch(tr.scrollIntoView())
  return true
}
