import type { Editor, JSONContent } from '@tiptap/core'
import { chime } from './sound'
import { vigil } from './vigil'
import { linesIn } from './line-tasks'
import { guessKind } from '../../../main/import'
import { num } from '../../../main/dates'
import { refuse, toast } from '@/components/vigil/ui'

/**
 * Dump mode: many lines, pasted or typed, each its own capture. A line keeps
 * its words and #tags as written, and its kind is read from them as the box
 * reads one ("buy milk" a task, a lone word a Word, a link a Link, `#quote` a
 * quote). In a note the lines stay; taken out of quick capture they leave it,
 * so a send keeps them once. One Undo takes every capture back.
 */
export const dumpKind = (text: string): string => guessKind(text, 'note')

export async function makeLineCaptures(editor: Editor, from: number, to: number, origin?: string | null, takeOut = false): Promise<number> {
  const lines = linesIn(editor, from, to)
  if (lines.length < 2) {
    refuse('Pick two lines or more: each becomes a capture of its own')
    return 0
  }
  const start = editor.state.doc
  const made: string[] = []
  const kept: typeof lines = []
  for (const line of lines) {
    try {
      made.push(await window.api.captures.create({ kind: dumpKind(line.text) as never, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: line.text }] }] }, markdown: line.text, ...(origin ? { origin } : {}) }))
      kept.push(line)
    } catch {
      // A line that could not be kept is left where it is.
    }
  }
  if (!made.length) return refuse('Could not keep those lines', 'error'), 0
  const before = editor.state.doc
  // Only the lines kept leave, found again if anything was written while they were saved.
  const gone: JSONContent[] = []
  if (takeOut && !editor.isDestroyed) {
    let leaving = kept
    if (before !== start) {
      const now = linesIn(editor, 0, before.content.size)
      leaving = kept.flatMap((line) => {
        const same = now.filter((one) => one.text === line.text).sort((a, b) => Math.abs(a.pos - line.pos) - Math.abs(b.pos - line.pos))[0]
        if (!same) return []
        now.splice(now.indexOf(same), 1)
        return [same]
      })
    }
    editor.chain().command(({ tr }) => {
      for (const line of [...leaving].sort((a, b) => b.pos - a.pos)) {
        const $at = tr.doc.resolve(line.pos + 1)
        const item = $at.depth > 1 && /^(listItem|taskItem)$/.test($at.node($at.depth - 1).type.name) ? $at.depth - 1 : $at.depth
        gone.unshift($at.node(item).toJSON() as JSONContent)
        tr.deleteRange($at.before(item), $at.after(item))
      }
      return true
    }).run()
  }
  const after = editor.state.doc
  chime('promote')
  toast(`${num(made.length)} captures, one a line, in your Inbox`, () => {
    void Promise.all(made.map((id) => vigil.unlift('capture', id))).then(() => chime('undo'))
    if (!takeOut || editor.isDestroyed) return
    // Taken out of quick capture: the lines come back, as they were if nothing was written since.
    if (editor.state.doc.eq(after)) editor.commands.setContent(before.toJSON())
    else if (gone.length) editor.commands.insertContentAt(editor.state.doc.content.size, gone)
  }, 'success', { label: 'Open the Inbox', key: 'I', run: () => window.api.openInHome('view', 'inbox') })
  return made.length
}
