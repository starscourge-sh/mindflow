import { TAG, tagsIn, tagWritten } from './tag-words.ts'

/**
 * A note's #tags out of its name. A note is named by its first line, so a tag
 * typed there ("credit note, invoice #work", "#app-idea video editor") showed
 * in every name, list, tab and heading. Each such tag goes to a line of its own
 * at the end (after a line of tags already there), where it is still the
 * note's tag: tags are read from a note's words. Tags kept as plain text
 * (`keep`), a first line that is only tags, and code are left as they are.
 * Gives the words moved, or null when nothing moves; asked again, it moves nothing.
 */
type Node = { type?: string; text?: string; marks?: { type: string }[]; content?: Node[]; attrs?: Record<string, unknown> }

// A front tag takes the comma or colon that only parted it from the words ("#app-idea: video editor"), as lists show names (tag-words.ts `nameWithoutTags`).
const FRONT = new RegExp(String.raw`^(\s*)#(${TAG})\s*(?:[,;:]|[-–](?=\s))?\s*`, 'u')
const cut = (text: string, tags: string[]): string =>
  tags.reduce((line, tag) => line.replace(tagWritten(tag), '$1'), text.replace(FRONT, (all, space, tag) => (tags.includes(tag.toLowerCase()) ? space : all))).replace(/[ \t]{2,}/g, ' ')
const onlyTags = (text: string): boolean => !!text.trim() && !cut(text, tagsIn(text)).trim()
const plainOf = (node: Node): string => (node.text ?? '') + (node.content ?? []).map(plainOf).join(node.type === 'doc' ? '\n' : '')

export function tagsOffName(body: unknown, keep: string[] = []): unknown | null {
  if (typeof body === 'string') {
    const lines = body.split('\n')
    const at = lines.findIndex((line) => line.trim())
    if (at < 0 || /^\s*(```|~~~)/.test(lines[at])) return null
    const tags = tagsIn(lines[at]).filter((tag) => !keep.includes(tag))
    const name = cut(lines[at], tags).trimEnd()
    if (!tags.length || !name.replace(/^\s*#{1,6}\s*/, '').trim()) return null
    lines[at] = name
    const rest = tagsIn(lines.slice(at + 1).join('\n'))
    const moving = tags.filter((tag) => !rest.includes(tag)).map((tag) => `#${tag}`).join(' ')
    if (!moving) return lines.join('\n')
    const last = lines.findLastIndex((line) => line.trim())
    if (last > at && onlyTags(lines[last])) lines[last] = `${lines[last].trimEnd()} ${moving}`
    else lines.splice(last + 1, 0, '', moving)
    return lines.join('\n')
  }
  const doc = body as Node | null
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) return null
  const first = doc.content.findIndex((block) => plainOf(block).trim())
  const block = doc.content[first]
  if (!block || !['paragraph', 'heading'].includes(block.type ?? '') || !block.content?.every((one) => one.type === 'text' || one.type === 'hardBreak')) return null
  const words = (block.content ?? []).filter((one) => one.type === 'text' && !one.marks?.some((mark) => mark.type === 'code'))
  const tags = [...new Set(words.flatMap((one) => tagsIn(one.text ?? '')))].filter((tag) => !keep.includes(tag))
  if (!tags.length) return null
  const content = (block.content ?? [])
    .map((one) => (words.includes(one) ? { ...one, text: cut(one.text ?? '', tags) } : one))
    .filter((one) => one.type !== 'text' || one.text)
  // The name's own ends trimmed, as it was typed without the tag.
  const ends = content.filter((one) => one.type === 'text')
  if (ends.length) {
    ends[0].text = ends[0].text!.replace(/^\s+/, '')
    ends[ends.length - 1].text = ends[ends.length - 1].text!.replace(/\s+$/, '')
  }
  if (!plainOf({ content }).trim()) return null
  const blocks = doc.content.map((one, index) => (index === first ? { ...block, content: content.filter((part) => part.type !== 'text' || part.text) } : one))
  return { ...doc, content: withTagLine(blocks, first, tags) }
}

/** The blocks with each tag not already in them after `from` on a line of tags at the end: the last one if it is only tags, else a new one. */
function withTagLine(blocks: Node[], from: number, tags: string[]): Node[] {
  const rest = tagsIn(blocks.slice(from + 1).map(plainOf).join('\n'))
  const moving = tags.filter((tag) => !rest.includes(tag)).map((tag) => `#${tag}`).join(' ')
  if (!moving) return blocks
  const last = blocks.findLastIndex((one) => plainOf(one).trim())
  const tail = blocks[last]
  if (last > from && tail.type === 'paragraph' && onlyTags(plainOf(tail)) && tail.content?.every((one) => one.type === 'text'))
    return blocks.with(last, { ...tail, content: [{ type: 'text', text: `${plainOf(tail).trimEnd()} ${moving}` }] })
  return blocks.toSpliced(last + 1, 0, { type: 'paragraph', content: [{ type: 'text', text: moving }] })
}

/**
 * The tags on a note's last line when that line is only tags, where a name's tags go (above): read from the end of
 * its words as kept, so a list shows them on its row as it shows a name's, without reading a long note whole.
 * Space-separated, or empty.
 */
export function tagLine(raw: string): string {
  if (!raw.includes('#')) return ''
  const tail = raw.slice(-4096)
  // Kept as Markdown (a JSON string): its last line. Kept as a document: its last run of text.
  const last = raw.startsWith('"') ? tail.replace(/"\s*$/, '').split('\\n').findLast((line) => line.trim()) : [...tail.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].at(-1)?.[1]
  try {
    const text = JSON.parse(`"${last ?? ''}"`) as string
    return onlyTags(text) ? tagsIn(text).join(' ') : ''
  } catch {
    return ''
  }
}
