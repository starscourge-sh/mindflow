import { readMarkdown } from '../components/haligtree'
import { cardsUp } from './link-card'

let running = false

/**
 * One note's Markdown made the editor's own document, as `convertImports` makes each; at once for a note a link
 * brought in from the vault, before it opens (opened as Markdown while this ran, the two would each write it).
 * False when there is no editor on the page to read with yet.
 */
export async function convertOne(tbl: string, id: string): Promise<boolean> {
  const raw = await window.api.haligtree<string | null>('imports:body', tbl, id)
  const markdown: unknown = raw ? JSON.parse(raw) : null
  if (typeof markdown !== 'string') return true
  const doc = readMarkdown(markdown)
  if (!doc) return false
  await window.api.haligtree('imports:converted', tbl, id, markdown, doc)
  return true
}

/**
 * Notes from a vault arrive as Markdown. Each is turned into the editor's own
 * document here, once, one at a time with a breath between, so a long one
 * opens at once afterwards instead of being read again on every opening.
 * Nothing happens until a document editor is on the page to read with.
 */
export function convertImports(): void {
  if (running) return
  running = true
  void (async () => {
    try {
      const pending = await window.api.haligtree<{ tbl: string; id: string }[]>('imports:pending')
      for (const { tbl, id } of pending) {
        if (!(await convertOne(tbl, id))) return
        await new Promise((breathe) => setTimeout(breathe, 0))
      }
      // Cards in what came in keep their pictures now, not at the next launch.
      if (pending.length) await cardsUp()
    } finally {
      running = false
    }
  })()
}
