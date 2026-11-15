import { Extension } from "@tiptap/core"
import { Plugin, type Transaction } from "@tiptap/pm/state"
import { closeHistory, isHistoryTransaction } from "@tiptap/pm/history"

/** Is one of these changes an Undo or a Redo? */
export const restoring = (transactions: readonly Transaction[]): boolean => transactions.some(isHistoryTransaction)

/**
 * Do these changes only set attributes (a picture marked not found, a line given a name)? Such a change brings no
 * words. Known by the step's own field, as only an attribute step has one: the bundle can hold two copies of its class.
 */
export const attributesOnly = (transactions: readonly Transaction[]): boolean =>
  transactions.every((tr) => tr.steps.every((step) => "attr" in step))

/**
 * Undo puts back what was there, as it was.
 *
 * A plugin that tidies words as they are typed (an emoji typed as text made
 * an emoji, an address made a link) ran on the words Undo brought back too:
 * the note came back changed, and an Undo of a whole long note spent seconds
 * going over every word in it. Wrapped here, such a plugin leaves Undo and
 * Redo alone, and changes that bring no words: the 296 pictures of a whole
 * note pasted back, marked not found in one change, cost each of them a
 * second, every step of it laid on the whole note again.
 */
export function notOnUndo<T extends Plugin>(plugin: T): T {
  const append = plugin.spec.appendTransaction
  if (append) plugin.spec.appendTransaction = (transactions, before, after) => (restoring(transactions) || attributesOnly(transactions) ? null : append.call(plugin, transactions, before, after))
  return plugin
}

/**
 * Words picked (⌘A, a drag, ⇧ and the arrows) start a new Undo step.
 *
 * Within half a second of typing, a change was added to the words just typed:
 * ⌘A and Delete straight after typing, then ⌘Z, brought the note back without
 * the last words typed, and a second ⌘Z had nothing left to give back.
 */
export const PickedStartsUndoStep = Extension.create({
  name: "pickedStartsUndoStep",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, before, after) =>
          before.selection.empty && !after.selection.empty && transactions.every((one) => !one.docChanged) ? closeHistory(after.tr) : null,
      }),
    ]
  },
})
