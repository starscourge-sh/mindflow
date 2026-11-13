import { Selection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/**
 * A press under the last line, on the note's own box or on the bare room under it in its scroller, puts the caret at
 * the note's end, as Notes and Obsidian do. The browser has no line there: it took the nearest place on the last line
 * (a short note), the first drawn block (a long note, whose blocks far from the screen are not drawn: 72 blocks up
 * from the end of a 7,017-block note, off the screen), or nothing at all (the room below: the keys left the note). The
 * last block is found by its place in the note, never as the box's last child (the offers' slot, with no height).
 * Every editor asks it (haligtree-editor.tsx), and a sticky for the room of its own card (sticky-note.tsx).
 */
export function pressUnderLastLine(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || !view.editable) return false
  const { doc } = view.state
  const last = doc.lastChild ? view.nodeDOM(doc.content.size - doc.lastChild.nodeSize) : null
  if (!(last instanceof HTMLElement) || !last.getClientRects().length || event.clientY < last.getBoundingClientRect().bottom) return false
  event.preventDefault()
  view.dispatch(view.state.tr.setSelection(Selection.atEnd(doc)))
  view.focus()
  return true
}
