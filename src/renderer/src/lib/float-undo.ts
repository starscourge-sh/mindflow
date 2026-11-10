import { chime } from './sound'

/**
 * Undo for what floats on its own (the nudge card, the focus pill), whose
 * windows rarely have the keys: the newest answer that can be taken back is
 * told to the main window, so ⌘Z there takes it back, and so does ⌘Z here
 * when this window does have them. Kept after its line goes, for as long as
 * the main window holds it (about ten seconds), and taken back once.
 */
let last: { undo: () => Promise<unknown>; onDone?: () => void } | null = null
let listening = false

/** Take back the newest answer: its own Undo button, ⌘Z here, or ⌘Z in the main window. */
export function takeBack(): Promise<unknown> | undefined {
  const was = last
  last = null
  if (!was) return
  // Spent: the main window forgets it.
  window.api.floatUndoable('')
  // Not taken back (a save that failed): said with its sound, the line left as it was.
  return was.undo().then(() => was.onDone?.(), () => chime('nope'))
}

/**
 * Offer `undo` for ⌘Z while `words` are on screen; `onDone` closes the line
 * that says them. Returns what to call as that line goes: its ⌘Z stays, only
 * the line it would close is let go.
 */
export function offerUndo(words: string, undo: () => Promise<unknown>, onDone?: () => void): () => void {
  if (!listening) {
    listening = true
    window.api.onFloatUndo(() => void takeBack())
    // This window has the keys (the pill, while "What stuck?" asks): ⌘Z outside a field is the answer's.
    window.addEventListener('keydown', (event) => {
      if (!event.metaKey || event.key !== 'z' || event.shiftKey || event.altKey || !last) return
      const at = document.activeElement
      if (at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement || (at as HTMLElement | null)?.isContentEditable) return
      event.preventDefault()
      chime('undo')
      void takeBack()
    })
  }
  const mine: NonNullable<typeof last> = { undo, onDone }
  last = mine
  window.api.floatUndoable(words)
  return () => void (last === mine && (mine.onDone = undefined))
}
