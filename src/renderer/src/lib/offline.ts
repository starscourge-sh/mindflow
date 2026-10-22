import type { Editor } from '@tiptap/core'
import { still } from '@/lib/motion'

/**
 * Being offline, said once a session in one small line, the same for
 * everything that needs the internet (a word's definition, a link's card):
 * "Offline: definitions and link previews will fill in when you're back."
 * Each then fills in by itself once the connection is back.
 */
let said = false
export const offline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false

/** Says it, once a session, and only when the Mac really is offline. */
export function noteOffline(): void {
  if (said || !offline()) return
  said = true
  void import('@/components/haligtree/ui').then(({ toast }) => toast("Offline: definitions and link previews will fill in when you're back.", undefined, 'info'))
}

/** Runs once the connection is back (at once when it is up). */
export function whenOnline(run: () => void): () => void {
  if (!offline()) return (run(), () => undefined)
  const back = (): void => run()
  window.addEventListener('online', back, { once: true })
  return () => window.removeEventListener('online', back)
}

/** A card just filled in late, after being offline: it fades up rather than popping. */
export function fadeFilled(editor: Editor, at: number): void {
  if (still()) return
  requestAnimationFrame(() => (editor.view.nodeDOM(at) as HTMLElement | null)?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' }))
}
