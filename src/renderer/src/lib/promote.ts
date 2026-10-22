import { shownEditor } from '@/extensions/note-link'
import { chime } from './sound'
import { toast } from '@/components/haligtree/ui'
import { APP_NAME } from '../../../main/name'

/**
 * Quick capture's ⌘O, Little Arc's "Open in Arc": what you were writing goes
 * to the main window as the same note, the caret where you left it. The box
 * says where the caret was; the main window, given the note, puts it there.
 * Both windows share this page's storage, so nothing else carries it.
 */
const KEY = 'vigil:promoted'

/** In the box, just before the glide: this note, with the caret at `at`. */
export const notePromoted = (id: string, at: number): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, at, when: Date.now() }))
  } catch {
    // No room to say it: the note still opens, at its start.
  }
}

/**
 * In the main window, as a note is sent to it: one promoted from the box a
 * moment ago gets the caret where it was, and a word that it came across.
 */
export function landPromoted(type: string, id: string): void {
  if (type !== 'capture') return
  let said: { id: string; at: number; when: number } | null = null
  try {
    said = JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    said = null
  }
  if (!said || said.id !== id || Date.now() - said.when > 5000) return
  localStorage.removeItem(KEY)
  const at = said.at
  chime('window')
  toast(`Opened in ${APP_NAME}: carry on where you were`)
  // The note's editor mounts a few frames after the page opens.
  let tries = 0
  const land = (): void => {
    const editor = shownEditor(`capture-${id}`)
    if (editor && !editor.isDestroyed) return void editor.commands.focus(Math.min(at, editor.state.doc.content.size - 1))
    if (tries++ < 90) requestAnimationFrame(land)
  }
  requestAnimationFrame(land)
}
