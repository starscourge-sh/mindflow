import { NodeSelection } from "@tiptap/pm/state"
import type { Node as PMNode } from "@tiptap/pm/model"

/**
 * Which events a plain node view keeps from ProseMirror: the same answer
 * TipTap's own node views give (NodeView.stopEvent in @tiptap/core), so a
 * block drawn without React picks, drags, copies and clicks as it did.
 * Fields, buttons and anything editable inside it own their events; a press
 * elsewhere picks the block; dragging the block's own element is left to the
 * grip, as before.
 */
export function stopLikeTiptap(event: Event, dom: HTMLElement, contentDOM: HTMLElement | null, node: PMNode): boolean {
  const target = event.target as HTMLElement
  if (!dom.contains(target) || contentDOM?.contains(target)) return false
  const drag = event.type.startsWith("drag")
  const drop = event.type === "drop"
  if ((["INPUT", "BUTTON", "SELECT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable) && !drop && !drag) return true
  const draggable = !!node.type.spec.draggable
  const selectable = NodeSelection.isSelectable(node)
  if (drag && target === dom) {
    if (draggable || selectable) event.preventDefault()
    if (draggable) return false
  }
  return !(event.type === "dragover" || event.type === "dragenter" || drop || event.type === "copy" || event.type === "paste" || event.type === "cut" || (event.type === "mousedown" && selectable))
}
