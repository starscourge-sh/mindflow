import { gitHubEmojis, shortcodeToEmoji } from '@tiptap/extension-emoji'

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
  // Past the frontmatter, rules, and lines that are only a picture: "---" or
  // "!" is no name for a note.
  (chunk.replace(/^---\n[\s\S]*?\n---(\n|$)/, '').split('\n').find((line) => {
    const words = line.replace(/!\[\[.*?\]\](?!\])|!\[[^\]]*\]\([^)]*\)/g, '').trim()
    return words && !words.startsWith('```') && !/^([-*_])(\s*\1){2,}$/.test(words)
  }) ?? '')
    .replace(/!\[\[.*?\]\](?!\])|!\[[^\]]*\]\([^)]*\)/g, '')
    // A heading's #s, a quote's >, and a callout's [!type] are marks, not words.
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*(>\s*)+(\[![\w-]+\][+-]?\s*)?/, '')
    .replace(/^\s*([-*]|\d+\.)\s+(\[[ x]\]\s+)?/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Obsidian's own marks: [[page|shown]], [[page]], $maths$, ==highlight==, ~~struck~~.
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\$(?=\S)([^$\n]*?\S)\$(?!\d)/g, '$1')
    .replace(/==|~~/g, '')
    .replace(/[*_`]/g, '')
    .trim()

/** A file or folder name without the 32-character id a Notion export adds: "Classes e2293dde…" is "Classes". */
export const withoutNotionId = (name: string): string => name.replace(/\s+[0-9a-f]{32}$/i, '')

/**
 * A note's frontmatter as plain words: `key: value`, `key: [a, b]`, and a
 * key with a list of `- a` lines under it, each list joined with commas.
 * Not a whole YAML reader; Obsidian's properties are only ever these shapes.
 */
export function propertiesOf(front: string): Record<string, string> {
  const unquote = (text: string): string => text.trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim()
  const found: Record<string, string> = {}
  let key = ''
  for (const line of front.split('\n')) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && key) {
      found[key] = [found[key], unquote(item[1])].filter(Boolean).join(', ')
      continue
    }
    const pair = /^([^\s:#-][^:]*):(?:\s+(.*))?$/.exec(line)
    if (!pair) continue
    key = pair[1].trim()
    const value = (pair[2] ?? '').trim()
    found[key] = /^\[.*\]$/.test(value) ? value.slice(1, -1).split(',').map(unquote).filter(Boolean).join(', ') : unquote(value)
  }
  return Object.fromEntries(Object.entries(found).filter(([, value]) => value))
}

/**
 * A file that holds credentials themselves, not notes about them: `.env`,
 * `credentials.csv`, `passwords.md`, keys and keychains, and folders named for
 * them. "Secrets Manager" and "Store credentials in SSM" are study notes and
 * come in.
 */
export const isPrivateFile = (name: string, folder: boolean): boolean =>
  folder
    ? /^((r-)?creds?|credentials|secrets|passwords|private[-_ ]?keys?)$/i.test(name)
    : /^\.env(\..*)?$|(^|[-_ .])(credentials?|passwords?|creds|secrets)(\.\w+)?$|\.(pem|key|p12|pfx|kdbx|keychain)$|^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$|private[-_ ]?key/i.test(name)

/**
 * A name that is about passwords and logins without being a key file: a note
 * called "Passwords 2024", "Recovery codes" or "AWS logins", or anything in a
 * folder called that, or "Private" or "Keys". It comes in, marked private,
 * rather than being left behind. "Secrets Manager" is a study note and comes in as it is.
 */
export const looksPrivate = (path: string): boolean =>
  path.split(/[/\\]/).some((part, at, all) =>
    /(?<![a-z])(passwords?|credentials?|creds|recovery[-_ ]?codes?|api[-_ ]?keys?|logins?)(?![a-z])/i.test(part) ||
    (at < all.length - 1 && /^(private|keys)$/i.test(part)) ||
    isPrivateFile(part, at < all.length - 1))

/** When the file says it was made, or nothing. */
export const createdOf = (text: string): string | null => {
  const said = /^created:\s*(\S+)/m.exec(text)?.[1]
  // "created: soon" is no date: the file's own is used instead.
  return said && !Number.isNaN(Date.parse(said)) ? said : null
}

/**
 * A best guess at what a jotting is, from the cheap signals only: the tags the
 * old inbox used, a name and a colon, a question, a lone word, a link, length.
 * Anything it cannot place is the file's own kind. It is a first pass for
 * triage to correct, not a judgement.
 */
export function guessKind(chunk: string, fallback: string): string {
  const text = titleOfMarkdown(chunk)
  // The old inbox's own tags, where they name a kind: a goal is a todo.
  // #bit is a tag of its own now: the note keeps it, and is private by it.
  const tag = /#(quote|goal|word)\b/.exec(chunk)?.[1]
  if (tag) return tag === 'goal' ? 'todo' : tag
  if (/^\s*[-*]\s+\[ \]/.test(chunk)) return 'todo'
  // A long block is a quote: what was an excerpt, the container for what comes out of it.
  if (chunk.length > 600) return 'quote'
  return kindOf(text.replace(/^\s*[-*]\s*\[?/, '')) ?? fallback
}

/** The old inbox's "$2026-06-05 08:34:42$ 💭 »" prefix: its time, and the text without it. */
export function unstamp(chunk: string): { text: string; at: string | null } {
  const match = /\$(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\$\s*💭\s*»\s*/.exec(chunk)
  const at = match ? new Date(match[1].replace(' ', 'T')) : null
  // A stamp that is no real time ("2026-13-45") keeps the words, undated.
  return match
    ? { text: chunk.replace(match[0], ''), at: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null }
    : { text: chunk, at: null }
}

/** A joke or a bit by its first words: a note that gets #bit, and so stays private. */
export const isBit = (line: string): boolean => /^(joke|bit)\b/i.test(line.trim())

/**
 * What a line of text most likely is, from how it is worded: the kind the
 * capture box suggests as you type, and the import's guess. Null when it reads
 * as a plain note.
 */
export function kindOf(line: string): string | null {
  const text = line.trim()
  if (/^https?:\/\/\S+$/.test(text)) return 'link'
  // Starts with something to do, or to tell someone: "tell rory to", "ping Sam".
  if (/^(todo|to do|fix|add|buy|call|phone|ring|book|email|mail|ask|tell|ping|text|message|reply|respond|chase|follow up|check|look into|look up|find|remind|cancel|pay|get|send|order|renew|schedule|arrange|organise|organize|plan|prepare|return|pick up|drop off|collect|finish|start|sort out|set up|install|update|clean|tidy|move|write|read|watch|try|visit|meet|contact|confirm|sign|submit|file|build|make|create|design|draft|research|learn|study|practi[cs]e|review|refactor|deploy|ship|implement|test|debug|publish|post|upload|download|back up|prep|apply|register|sign up|wash|cook|bake|repair|replace|print|scan|share|invite|thank|figure out|work on|need to|have to|must|should|remember to|don'?t forget)\b(?!\s*:)/i.test(text) && !/\?\s*$/.test(text)) return 'todo'
  // "Book: Thinking, Fast and Slow" is a label, not something to do; but
  // anything that comes round again ("water the plants every 3 days") is.
  if (/\b(every!?\s+(other )?(\d+ )?(day|week|month|year|morning|evening|night|weekday|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?|daily|weekly|fortnightly|monthly|yearly)\b/i.test(text) && !/\?\s*$/.test(text)) return 'todo'
  if (/^(decided|decision|going with|chose|we('ll| will) go with)\b/i.test(text)) return 'decision'
  // A question is a question, not a todo; "Name: words" is a quote only when
  // there are words enough to be said, not a label like "Shopping list: eggs".
  if (/^["“].+["”]/.test(text) || /^[A-Z][\w.'-]*(?: [A-Z][\w.'-]*){0,2}( \([^)]*\))?: (?:\S+\s+){4,}\S/.test(text) || /^["“'].+["”']\s*[-—]\s*\w/.test(text)) return 'quote'
  if (/^[\w'-]+$/.test(text) || /\bmeaning$/i.test(text) || /^(define|what does .+ mean)/i.test(text)) return 'word'
  return null
}

type Node = { type?: string; text?: string; attrs?: { latex?: string; label?: string; name?: string }; content?: Node[] }

/**
 * A node's own words, as a reader sees them: text, the source of its maths,
 * and an emoji as its character, which the editor stores only by name.
 */
export const wordsOf = (node: Node): string =>
  node.type === 'hardBreak'
    ? '\n'
    : node.type === 'noteLink'
      ? (node.attrs?.label ?? '')
    : node.type === 'emoji'
      ? (shortcodeToEmoji(node.attrs?.name ?? '', gitHubEmojis)?.emoji ?? '')
      : (node.text ?? node.attrs?.latex ?? (node.content ?? []).map(wordsOf).join(''))
/** The blocks that hold words directly: paragraphs and headings, however deep. */
const textBlocks = (node: Node): Node[] =>
  node.content?.some((child) => child.text !== undefined || child.type === 'hardBreak' || child.type === 'emoji' || child.type === 'noteLink' || child.attrs?.latex !== undefined) ? [node] : (node.content ?? []).flatMap(textBlocks)

/**
 * The first line with words in it: what a capture is called. From the
 * editor's JSON, a line runs to the end of its block or a line break, with its
 * bold and links kept whole; from Markdown, its first line without markers.
 */
export function firstLine(body: unknown): string {
  if (typeof body === 'string') return titleOfMarkdown(body.replace(/^\s*\n/, ''))
  // A line of tags alone ("#bit" over a joke) names nothing: the first line
  // with words does, its tags kept after it so lists still show them.
  let tags = ''
  for (const block of body ? textBlocks(body as Node) : []) {
    for (const one of wordsOf(block).split('\n')) {
      const line = one.trim()
      if (!line) continue
      if (!line.replace(/(?:^|\s)#[a-z][\w/-]*/gi, '').trim()) {
        tags ||= line
        continue
      }
      return tags ? `${line} ${tags}` : line
    }
  }
  return tags
}
