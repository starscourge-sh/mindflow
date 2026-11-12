/**
 * The links written in a note's words. No Electron in it, so main and the
 * reading thread (reader.ts) read a note's links the same way.
 */
type Doc = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Doc[] }
const parse = (text: string | null | undefined): unknown => {
  try {
    return JSON.parse(text ?? 'null')
  } catch {
    return text
  }
}

// The links written in a note's words, as the editor keeps them or an import left them.
// Each note linked to, with how many times the words link to it.
export const mentionsIn = (body: string | null | undefined): Map<string, number> => {
  const out = new Map<string, number>()
  const add = (id: string): void => void out.set(id, (out.get(id) ?? 0) + 1)
  const walk = (node: Doc | string | null): void => {
    if (!node) return
    if (typeof node === 'string') return void [...node.matchAll(/\[\[@([^|#\]]+)/g)].forEach((match) => add(match[1]))
    if (node.type === 'noteLink' && node.attrs?.id) add(String(node.attrs.id))
    node.content?.forEach(walk)
  }
  walk(parse(body) as Doc | string | null)
  return out
}
/** The notes among these with a link either way to another of them: the Map's linked notes; the rest are its "not linked to anything yet". */
export const linkedAmong = (rows: { id: string; body: string | null }[]): Set<string> => {
  const known = new Set(rows.map((row) => row.id))
  const out = new Set<string>()
  for (const row of rows)
    for (const link of mentionsIn(row.body).keys()) {
      // A link names its note as `id` or `tier:id`.
      const to = link.includes(':') ? link.split(':')[1] : link
      if (to !== row.id && known.has(to)) (out.add(row.id), out.add(to))
    }
  return out
}
