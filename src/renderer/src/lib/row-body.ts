import type { JSONContent } from '@tiptap/react'

/** A line's words alone: no tags, no punctuation, no case. */
const bare = (text: string): string => text.replace(/(^|\s)#[^\s#]+/gu, ' ').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
/** A line of nothing but tags: "#bit #career". */
const tagsOnly = (text: string): boolean => /^\s*(#[^\s#]+\s*)+$/u.test(text)
const textOf = (nodes: JSONContent[]): string => nodes.map((node) => node.text ?? textOf(node.content ?? [])).join('')

/** A paragraph's lines, split at its line breaks. */
const linesOf = (block: JSONContent): JSONContent[][] =>
  (block.content ?? []).reduce<JSONContent[][]>((lines, node) => (node.type === 'hardBreak' ? lines.push([]) : lines[lines.length - 1].push(node), lines), [[]])
const joined = (block: JSONContent, lines: JSONContent[][]): JSONContent | null =>
  lines.length ? { ...block, content: lines.flatMap((line, i) => (i ? [{ type: 'hardBreak' }, ...line] : line)) } : null

/**
 * A row's words as a list shows them under its title and beside its tags:
 * without a first line that only says the title again (case, punctuation
 * and tags aside), and without a last line of nothing but tags, which the
 * row's tag column already shows. Words left empty are kept whole unless a
 * title stands in for them.
 */
export function rowBody<T extends JSONContent | string | null>(body: T, title = ''): T {
  const same = (text: string): boolean => !!bare(title) && bare(text) === bare(title)
  if (typeof body === 'string') {
    const lines = body.split('\n')
    const first = lines.findIndex((line) => line.trim())
    if (first >= 0 && same(lines[first])) lines.splice(0, first + 1)
    while (lines.length && (!lines[lines.length - 1].trim() || tagsOnly(lines[lines.length - 1]))) lines.pop()
    return (lines.join('\n').trim() || bare(title) ? lines.join('\n') : body) as T
  }
  if (!body || !Array.isArray(body.content)) return body
  let blocks = body.content.filter((block) => !(block.type === 'paragraph' && !block.content?.length))
  const head = blocks[0]
  if (head?.type === 'paragraph' || head?.type === 'heading') {
    const lines = linesOf(head)
    if (same(textOf(lines[0]))) blocks = [joined(head, lines.slice(1)), ...blocks.slice(1)].filter((one): one is JSONContent => !!one)
  }
  const tail = blocks[blocks.length - 1]
  if (tail?.type === 'paragraph') {
    const lines = linesOf(tail)
    while (lines.length && tagsOnly(textOf(lines[lines.length - 1]))) lines.pop()
    blocks = [...blocks.slice(0, -1), joined(tail, lines)].filter((one): one is JSONContent => !!one)
  }
  return (blocks.length || bare(title) ? { ...(body as JSONContent), content: blocks } : body) as T
}
