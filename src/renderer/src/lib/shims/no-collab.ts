import { PluginKey, type Transaction } from "@tiptap/pm/state"

/**
 * What the drag handle gets when it asks for the live-collaboration pieces
 * (`@tiptap/y-tiptap`, `@tiptap/extension-collaboration`; see the vite
 * config).
 *
 * The handle only uses them when an editor is shared live, which it finds out
 * by looking for the sync plugin. Vigil's editors never are, so the plugin is
 * never there and the rest is never called; standing in for them keeps that
 * library (and Yjs behind it) out of every window.
 */
export const ySyncPluginKey = new PluginKey("y-sync")

export const isChangeOrigin = (transaction: Transaction): boolean => !!transaction.getMeta(ySyncPluginKey)

const unreachable = (): never => {
  throw new Error("Live collaboration is not part of Vigil")
}
export const absolutePositionToRelativePosition = unreachable
export const relativePositionToAbsolutePosition = unreachable
