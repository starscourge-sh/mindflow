import { tagsIn, withoutTags } from '../../../main/tag-words.ts'

type Node = { type?: string; text?: string; content?: Node[] }

/** A block's own words, a line break as a space. */
const textOf = (node: Node): string => node.text ?? (node.type === 'hardBreak' ? ' ' : (node.content ?? []).map(textOf).join(''))

/** Every block of words in a stored body, in order: each paragraph and heading (inside lists and quotes too), or each line of Markdown. */
function blocksOf(body: unknown): string[] {
  if (typeof body === 'string')
    return body.split('\n').map((line) => line.replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, '').trim()).filter(Boolean)
  const out: string[] = []
  const walk = (node: Node): void => {
    if (node.type === 'paragraph' || node.type === 'heading') {
      const text = textOf(node).trim()
      if (text) out.push(text)
      return
    }
    for (const child of node.content ?? []) walk(child)
  }
  if (body && typeof body === 'object') walk(body as Node)
  return out
}

/** Tags at the end of a line are its filing, not its words. */
const untailed = (line: string): string => line.replace(/(?:^|\s+)(?:#[^\s#]+\s*)+$/u, '').trim()

/**
 * The blocks a tag is written on, when it is written on some blocks of a
 * longer note rather than on the note as a whole: what a tag page shows in
 * the note's place, as Capacities and Tana show a tagged block. Null when the
 * tag files the whole note (a line of tags alone, or every block carrying it),
 * so the note reads as itself. `#physics` is carried by `#physics/optics` too.
 */
export function taggedBlocks(body: unknown, tag: string, most = 3): { lines: string[]; more: number } | null {
  const want = tag.toLowerCase()
  const blocks = blocksOf(body)
  const has = (line: string): boolean => tagsIn(line).some((one) => one === want || one.startsWith(`${want}/`))
  // A line of tags alone carrying it files the whole note.
  if (blocks.some((line) => has(line) && !withoutTags(line).trim())) return null
  const carry = blocks.filter((line) => has(line) && withoutTags(line).trim())
  if (!carry.length || carry.length >= blocks.filter((line) => withoutTags(line).trim()).length) return null
  return { lines: carry.slice(0, most).map((line) => untailed(line) || line), more: Math.max(0, carry.length - most) }
}
