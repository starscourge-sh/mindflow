import { Extension } from "@tiptap/core"
import { Plugin, type EditorState, type Transaction } from "@tiptap/pm/state"
import { closeHistory, isHistoryTransaction } from "@tiptap/pm/history"

/** Is one of these changes an Undo or a Redo, or added to one by a plugin? */
export const restoring = (transactions: readonly Transaction[]): boolean =>
  transactions.some((tr) => isHistoryTransaction((tr.getMeta("appendedTransaction") as Transaction | undefined) ?? tr))

/**
 * Do these changes only set attributes (a picture marked not found, a line given a name)? Such a change brings no
 * words. Known by the step's own field, as only an attribute step has one: the bundle can hold two copies of its class.
 */
export const attributesOnly = (transactions: readonly Transaction[]): boolean =>
  transactions.every((tr) => tr.steps.every((step) => "attr" in step))

/**
 * Undo puts back what was there, as it was, and quickly.
 *
 * A plugin that tidies words as they are typed (an emoji typed as text made
 * an emoji, an address made a link) went over every word an Undo of a whole
 * long note brought back: seconds of it. Wrapped here, such a plugin is not
 * asked at all on Undo and Redo, nor on changes that bring no words: the 296
 * pictures of a whole note pasted back, marked not found in one change, cost
 * each of them a second, every step of it laid on the whole note again.
 */
export function notOnUndo<T extends Plugin>(plugin: T): T {
  const append = plugin.spec.appendTransaction
  if (append) plugin.spec.appendTransaction = (transactions, before, after) => (restoring(transactions) || attributesOnly(transactions) ? null : append.call(plugin, transactions, before, after))
  return plugin
}

/** The plugins' own tidying already kept off Undo's change (below). */
const leftAlone = new WeakSet<object>()

/**
 * What a plugin adds to an Undo or a Redo goes in only if it leaves the note as Undo put it back.
 *
 * Plugins that tidy the note after any change took Undo's own change for one to tidy: a cut across two lists side by
 * side, undone, came back with the lists made one (extensions/join-lists.ts), and ⇧⌘Z and ⌘Z kept them so. Others
 * tidy the same way (a meeting put back, footnotes numbered, a table's shape mended, a line kept at the end). What a
 * plugin adds that only moves the caret or opens a fold round it still goes in.
 */
function leavesUndoAlone(plugin: Plugin): void {
  const append = plugin.spec.appendTransaction
  if (!append || leftAlone.has(append)) return
  const guarded = (transactions: readonly Transaction[], before: EditorState, after: EditorState): Transaction | null | undefined => {
    const tr = append.call(plugin, transactions, before, after)
    return tr?.docChanged && restoring(transactions) ? null : tr
  }
  leftAlone.add(guarded)
  plugin.spec.appendTransaction = guarded
}

/**
 * Undo and Redo give back exactly the note that was there, word for word and mark for mark.
 *
 * Words picked (⌘A, a drag, ⇧ and the arrows) start a new Undo step: within half a second of typing, a change was
 * added to the words just typed, so ⌘A and Delete straight after typing, then ⌘Z, brought the note back without the
 * last words typed, and a second ⌘Z had nothing left to give back.
 */
export const UndoExact = Extension.create({
  name: "undoExact",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, before, after) =>
          before.selection.empty && !after.selection.empty && transactions.every((one) => !one.docChanged) ? closeHistory(after.tr) : null,
      }),
      // Every plugin of the editor, its own and the library's. A plugin's view is made again whenever the editor's
      // plugins change, so one added later is covered too.
      new Plugin({
        view: (view) => {
          view.state.plugins.forEach(leavesUndoAlone)
          return {}
        },
      }),
    ]
  },
})
