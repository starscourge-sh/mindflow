import type { JSONContent } from '@tiptap/core'

import { writeMarkdown } from '../components/haligtree'
import { notes } from './notes'

let running = false
/** Nothing was left owed, or all of it is written: main is not asked again this run (only a launch finds any). */
let none = false

/**
 * Long notes whose Markdown copy was still owed when the app last ended (it died, or a window could not hand its
 * copy over as it quit). The copy on disk is their last whole one. Each is written here from its words as stored,
 * by an editor on the page, the way its own editor would have written it, one at a time with a breath between.
 * Main takes each only while those are still the words stored (src/main/captures.ts `copies_owed`). Nothing
 * happens until a document editor is on the page to write with: it is tried again as each one opens.
 */
export function writeOwedCopies(): void {
  if (running || none) return
  running = true
  void (async () => {
    try {
      const left = await window.api.haligtree<{ id: string; copy: number }[]>('copies:left')
      for (const { id, copy } of left) {
        const body = await notes.body('captures', id)
        // Words kept as Markdown already are their own copy.
        const markdown = typeof body === 'string' ? body : body && typeof body === 'object' ? writeMarkdown(body as JSONContent) : ''
        if (markdown === null) return
        await window.api.captures.save(id, { markdown, copy })
        await new Promise((breathe) => setTimeout(breathe, 0))
      }
      none = true
    } finally {
      running = false
    }
  })()
}
