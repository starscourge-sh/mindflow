import { readMarkdown } from '../components/mindflow'

let running = false

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
      const pending = await window.api.vigil<{ tbl: string; id: string }[]>('imports:pending')
      for (const { tbl, id } of pending) {
        const raw = await window.api.vigil<string | null>('imports:body', tbl, id)
        const markdown: unknown = raw ? JSON.parse(raw) : null
        if (typeof markdown !== 'string') continue
        const doc = readMarkdown(markdown)
        if (!doc) return
        await window.api.vigil('imports:converted', tbl, id, markdown, doc)
        await new Promise((breathe) => setTimeout(breathe, 0))
      }
    } finally {
      running = false
    }
  })()
}
