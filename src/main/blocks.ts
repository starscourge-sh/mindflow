/**
 * A line's lasting name (`blockId` on a paragraph or heading), read without
 * an editor: by the main process, which names a line a link was made to, and
 * by the editor (extensions/block-ids.ts). Plain data in, plain data out.
 */

type JSONContent = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: JSONContent[]; [key: string]: unknown }

/** The kinds of line a link can land on. */
export const BLOCK_TYPES = ['paragraph', 'heading']

/** A short name, unlikely to meet another in one note: six letters and digits. */
export const newBlockId = (): string => Math.random().toString(36).slice(2, 8).padEnd(6, '0')

/**
 * A body kept as plain words (a gem, an import never opened) as the editor's
 * document, a paragraph a line, so one of its lines can be named. Only words
 * with no Markdown in them: anything marked up is left for the editor to read.
 */
export function plainDoc(body: unknown): JSONContent | null {
  if (typeof body !== 'string') return (body as JSONContent | null) ?? null
  if (/[*_`#>|~=![\]<\\]|^\s*([-+]|\d+\.)\s/m.test(body)) return null
  const lines = body.split(/\n+/).map((one) => one.trim()).filter(Boolean)
  return { type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) }
}

/** The line named `id` in a stored body, as JSON, for a link's card or an embed. */
export function blockIn(body: unknown, id: string): JSONContent | null {
  let found: JSONContent | null = null
  const walk = (node: JSONContent | undefined): void => {
    if (found || !node || typeof node !== 'object') return
    if (node.attrs?.blockId === id) return void (found = node)
    node.content?.forEach(walk)
  }
  walk(body as JSONContent)
  return found
}

/** The words of a stored line, plainly: a link reads as its name. */
export const wordsOf = (node: JSONContent | null | undefined): string =>
  !node ? '' : node.type === 'noteLink' ? String(node.attrs?.text || node.attrs?.label || '') : node.text ?? (node.content ?? []).map(wordsOf).join('')

/**
 * Every line of a stored body that a link could land on, in order, with its
 * name if it has one: what `[[Note#` offers beside the headings.
 */
export function linesIn(stored: unknown): { index: number; text: string; id: string | null; heading: boolean }[] {
  const body = plainDoc(stored)
  const out: { index: number; text: string; id: string | null; heading: boolean }[] = []
  let index = 0
  const walk = (node: JSONContent | undefined): void => {
    if (!node || typeof node !== 'object') return
    if (node.type && BLOCK_TYPES.includes(node.type)) {
      const text = wordsOf(node).trim()
      if (text) out.push({ index, text, id: typeof node.attrs?.blockId === 'string' ? node.attrs.blockId : null, heading: node.type === 'heading' })
      index++
      return
    }
    node.content?.forEach(walk)
  }
  walk(body as JSONContent)
  return out
}

/**
 * The body with each named line ending in its `^id`, as Obsidian writes a
 * block it can link to: what Markdown is made from, so a link into a line
 * still finds it there.
 */
export function withBlockMarks(doc: JSONContent): JSONContent {
  const walk = (node: JSONContent): JSONContent => {
    const id = node.attrs?.blockId
    const kids = node.content?.map(walk)
    if (id && node.type && BLOCK_TYPES.includes(node.type)) return { ...node, content: [...(kids ?? []), { type: 'text', text: ` ^${id}` }] }
    return kids ? { ...node, content: kids } : node
  }
  return walk(doc)
}

/**
 * The line at `index` (as linesIn counts them) given a lasting name, if it
 * still says `text`; else the first line that does. The body is copied, never
 * changed. Null when no such line is there.
 */
export function nameLineIn(stored: unknown, index: number, text: string): { body: unknown; id: string } | null {
  const body = plainDoc(stored)
  if (!body) return null
  let at = 0
  let hit: JSONContent | null = null
  let byWords: JSONContent | null = null
  const wanted = text.trim().slice(0, 60)
  const look = (node: JSONContent | undefined): void => {
    if (!node || typeof node !== 'object') return
    if (node.type && BLOCK_TYPES.includes(node.type)) {
      const words = wordsOf(node).trim()
      if (at === index && (!wanted || words.startsWith(wanted))) hit = node
      if (!byWords && wanted && words.startsWith(wanted)) byWords = node
      at++
      return
    }
    node.content?.forEach(look)
  }
  look(body as JSONContent)
  const target = (hit ?? byWords) as JSONContent | null
  if (!target) return null
  if (typeof target.attrs?.blockId === 'string') return { body: stored, id: target.attrs.blockId }
  const id = newBlockId()
  const copy = (node: JSONContent): JSONContent =>
    node === target ? { ...node, attrs: { ...node.attrs, blockId: id } } : node.content ? { ...node, content: node.content.map(copy) } : node
  return { body: copy(body as JSONContent), id }
}
