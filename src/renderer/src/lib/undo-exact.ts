import type { Plugin, Transaction } from "@tiptap/pm/state"
import { isHistoryTransaction } from "@tiptap/pm/history"

/** Is one of these changes an Undo or a Redo? */
export const restoring = (transactions: readonly Transaction[]): boolean => transactions.some(isHistoryTransaction)

/**
 * Undo puts back what was there, as it was.
 *
 * A plugin that tidies words as they are typed (an emoji typed as text made
 * an emoji, an address made a link) ran on the words Undo brought back too:
 * the note came back changed, and an Undo of a whole long note spent seconds
 * going over every word in it. Wrapped here, such a plugin leaves Undo and
 * Redo alone.
 */
export function notOnUndo<T extends Plugin>(plugin: T): T {
  const append = plugin.spec.appendTransaction
  if (append) plugin.spec.appendTransaction = (transactions, before, after) => (restoring(transactions) ? null : append.call(plugin, transactions, before, after))
  return plugin
}
