import { chime } from './sound'
import { haligtree } from './haligtree'
import { makeTask } from './tasks'
import { toast } from '@/components/haligtree/ui'
import type { Keep } from '@/components/search'

/**
 * Words typed into ⌘K that matched nothing, kept as something new, the way
 * Arc's command bar turns a search into a page: a note in the Inbox, a task,
 * a question held, or the words carried into quick capture to finish there.
 * Each says what it made, with Undo, and opens it to write more. Undone,
 * `back` is given the words: ⌘K open on them again, off the page that went.
 */
export async function keepTyped(as: Keep, text: string, open: (type: string, id: string) => void, back?: (text: string) => void): Promise<void> {
  if (as === 'box') return window.api.showPrompt(text)
  if (as === 'task') {
    const made = await makeTask({ text }, 'Kept as a task', { onUndo: () => back?.(text) })
    if (made) open('task', made.id)
    return
  }
  if (as === 'question') {
    const id = await haligtree.newQuestion(text)
    chime('hold')
    toast('Kept as a question: add clues as they come', () => void haligtree.dropQuestion(id).then(() => back?.(text)))
    return open('question', id)
  }
  const id = await window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } })
  chime('noted')
  // Undone, it goes to the Bin like any note let go, never lost by a slip.
  toast('Kept as a note in your Inbox', () => void window.api.captures.save(id, { status: 'discarded' }).then(() => back?.(text)))
  open('capture', id)
}
