/**
 * Turning a Markdown file of jottings into captures.
 *
 * One capture per top-level line, with whatever is indented under it. A code
 * block is one capture whole. Headings, quotes, rules and blank lines only
 * separate things, and a `## Related` section ends the file. The body stays
 * Markdown; the editor reads it as such the first time it is opened.
 */
export function chunks(text: string): string[] {
  const lines = text.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n')
  const out: string[] = []
  let current: string[] | null = null
  let fenced = false
  const flush = (): void => {
    if (current) out.push(current.join('\n').trim())
    current = null
  }

  for (const line of lines) {
    if (fenced) {
      current?.push(line)
      if (line.trim().startsWith('```')) fenced = false
      continue
    }
    if (/^## Related/.test(line)) break
    if (line.trim().startsWith('```')) {
      flush()
      current = [line]
      fenced = true
    } else if (!line.trim() || /^(#|>|---)/.test(line)) flush()
    else if (/^\s/.test(line) && current) current.push(line)
    else {
      flush()
      current = [line]
    }
  }
  flush()
  return out.filter(Boolean)
}

/**
 * The first line as plain words: no list marker, no bold, links as their text.
 * Past a code block's opening fence, or every block of commands is "bash".
 */
export const titleOfMarkdown = (chunk: string): string =>
  (chunk.split('\n').find((line) => !line.trim().startsWith('```')) ?? '')
    .replace(/^\s*([-*]|\d+\.)\s+(\[[ x]\]\s+)?/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim()

/** When the file says it was made, or nothing. */
export const createdOf = (text: string): string | null =>
  /^created:\s*(\S+)/m.exec(text)?.[1] ?? null

/**
 * A best guess at what a jotting is, from the cheap signals only: the tags the
 * old inbox used, a name and a colon, a question, a lone word, a link, length.
 * Anything it cannot place is the file's own kind. It is a first pass for
 * triage to correct, not a judgement.
 */
export function guessKind(chunk: string, fallback: string): string {
  const text = titleOfMarkdown(chunk)
  // The old inbox's own tags, mapped onto the eight kinds: a tip, an idea or
  // a question is a note; a goal is a todo.
  const tag = /#(tip|idea|quote|bit|goal|question|word)\b/.exec(chunk)?.[1]
  if (tag) return { goal: 'todo', tip: 'note', idea: 'note', question: 'note' }[tag] ?? tag
  if (/^\s*[-*]\s+\[ \]/.test(chunk)) return 'todo'
  if (chunk.length > 600) return 'excerpt'
  return kindOf(text.replace(/^\s*[-*]\s*\[?/, '')) ?? fallback
}

/** The old inbox's "$2026-06-05 08:34:42$ 💭 »" prefix: its time, and the text without it. */
export function unstamp(chunk: string): { text: string; at: string | null } {
  const match = /\$(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\$\s*💭\s*»\s*/.exec(chunk)
  return match
    ? { text: chunk.replace(match[0], ''), at: new Date(match[1].replace(' ', 'T')).toISOString() }
    : { text: chunk, at: null }
}

/**
 * What a line of text most likely is, from how it is worded: the kind the
 * capture box suggests as you type, and the import's guess. Null when it reads
 * as a plain note.
 */
export function kindOf(line: string): string | null {
  const text = line.trim()
  if (/^https?:\/\/\S+$/.test(text)) return 'link'
  if (/^(todo|to do|fix|add|buy|call|book|email|ask|look into|remind|cancel|pay|get|send|order|renew|schedule|return|pick up|text|message|reply|finish|sort out|need to|must|remember to)\b/i.test(text)) return 'todo'
  if (/^(decided|decision|going with|chose|we('ll| will) go with)\b/i.test(text)) return 'decision'
  if (/^(joke|bit)\b/i.test(text)) return 'bit'
  if (/^["“].+["”]/.test(text) || /^[A-Z][\w .'-]{1,30}( \([^)]*\))?: \S/.test(text) || /^["“'].+["”']\s*[-—]\s*\w/.test(text)) return 'quote'
  if (/^[\w'-]+$/.test(text) || /\bmeaning$/i.test(text) || /^(define|what does .+ mean)/i.test(text)) return 'word'
  return null
}

type Node = { type?: string; text?: string; content?: Node[] }
/**
 * The first line with words in it: what a capture is called. From the
 * editor's JSON, a line runs to the end of its block or a line break, with its
 * bold and links kept whole; from Markdown, its first line without markers.
 */
export function firstLine(body: unknown): string {
  if (typeof body === 'string') return titleOfMarkdown(body.replace(/^\s*\n/, ''))
  const text = (node: Node): string => (node.type === 'hardBreak' ? '\n' : node.text ?? (node.content ?? []).map(text).join(''))
  const blocks = (node: Node): Node[] =>
    node.content?.some((child) => child.text !== undefined || child.type === 'hardBreak') ? [node] : (node.content ?? []).flatMap(blocks)
  for (const block of body ? blocks(body as Node) : []) {
    const line = text(block).split('\n').find((one) => one.trim())
    if (line) return line.trim()
  }
  return ''
}
