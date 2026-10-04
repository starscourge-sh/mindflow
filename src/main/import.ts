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
