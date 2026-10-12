/**
 * Lines of a written list, read the way people write them in Raycast Notes or
 * Apple Notes: "- [ ] call the bank", "  - [x] send the form" (indented: a
 * step of the line above). Tags are Vigil's own #tag, as everywhere. Shared: Today's written page, the box's paste offer and
 * "Sort this out" all read lines with these, and the tests run them as they are.
 */

export type Line = { text: string; depth: number; done: boolean }

/** A list mark at the start of a line: "- ", "* ", "• ", "1. ", "a) ", with a "[ ]" or "[x]" after it or alone. */
const MARK = /^(?:[-*+•▪◦‣]\s+|\d{1,3}[.)]\s+|[a-z][.)]\s+(?=\S))?(?:\[( |x|X)\]\s*)?/

/** How deep a line sits: a tab or two spaces a step, a list mark alone counting nothing. */
const depthOf = (lead: string): number => Math.floor(lead.replace(/\t/g, '  ').length / 2)

/**
 * Pasted or typed lines, each with its depth and whether it was ticked.
 * Blank lines go; a line of only a mark goes too. Depth is counted from the
 * shallowest line, so a list copied from halfway in starts at nought.
 */
export function readLines(text: string): Line[] {
  const raw = text.replace(/\r\n?/g, '\n').split('\n')
  const lines = raw
    .map((line) => {
      const lead = /^[\t ]*/.exec(line)![0]
      const rest = line.slice(lead.length)
      const mark = MARK.exec(rest)!
      const words = rest.slice(mark[0].length).trim()
      return { text: words, depth: depthOf(lead), done: !!mark[1] && mark[1].toLowerCase() === 'x' }
    })
    .filter((line) => line.text)
  const least = Math.min(...lines.map((line) => line.depth))
  return lines.map((line) => ({ ...line, depth: line.depth - (Number.isFinite(least) ? least : 0) }))
}

/** Whether words are a list rather than a thought: two or more lines that each read as an item. */
export const isList = (text: string): boolean => readLines(text).length >= 2

/** A leading "[acme]": in "Sort this out", offered as a tag you can choose, never applied by itself. */
const PROJECT = /^\[([^\]\s][^\]]{0,30})\]\s*/

/** A heading or project name as a tag: "Big Co" → "big-co". */
export const tagOf = (name: string): string =>
  name.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').replace(/^(\d)/, 'p$1')

/** The tag a line's leading "[word]" could be, if it has one ("[x]" is a tick, never a tag). */
export const suggestedTag = (line: string): string | null => {
  const found = PROJECT.exec(line.trim())
  return found && !/^x$/i.test(found[1]) ? tagOf(found[1]) || null : null
}

/** The tasks a list makes: each top line, with the lines indented under it as its steps. */
export type ListTask = { text: string; done: boolean; steps: { text: string; done: boolean }[] }
export function tasksOf(lines: Line[]): ListTask[] {
  const out: ListTask[] = []
  for (const line of lines) {
    const parent = out[out.length - 1]
    if (line.depth > 0 && parent) parent.steps.push({ text: line.text, done: line.done })
    else out.push({ text: line.text, done: line.done, steps: [] })
  }
  // "camping:" over its steps is a heading for them: the task is named without the colon.
  return out.map((task) => (task.steps.length && /:$/.test(task.text) && task.text.length > 1 ? { ...task, text: task.text.replace(/\s*:$/, '') } : task))
}

/** What a list will make, said plainly: "7 tasks, 5 steps", "a task with 2 steps". */
export function tasksSaid(tasks: { steps: unknown[] }[]): string {
  const steps = tasks.reduce((sum, task) => sum + task.steps.length, 0)
  const head = tasks.length === 1 ? 'a task' : `${tasks.length} tasks`
  return steps ? `${head}${tasks.length === 1 ? ' with' : ','} ${steps} ${steps === 1 ? 'step' : 'steps'}` : head
}

// --- Sort this out --------------------------------------------------------

/** What a line of a mixed page is best kept as. */
export type Sort = 'task' | 'link' | 'word' | 'saying' | 'note' | 'skip'
export type Sorted = { id: string; kind: Sort; text: string; steps: { text: string; done: boolean }[]; done: boolean; under: string | null; tag: string | null
  /** A leading "[word]" read as a tag you may choose: shown, never applied unless picked. */
  suggest: string | null }

/** The headings people give a running page, and what is under each. */
const TASK_HEADS = /^(now|next|later|todo|to do|to-do|tasks?|today|tomorrow|this week|holding|doing|backlog|errands?)$/i
const SAYING_HEADS = /^(bits|quotes?|sayings?|lines?|words to live by)$/i
const WORD_HEADS = /^(words?|vocab|vocabulary|to learn)$/i
const LINK_HEADS = /^(links?|reading|to read|read later|watch(list)?|to watch)$/i
const KNOWN = [TASK_HEADS, SAYING_HEADS, WORD_HEADS, LINK_HEADS]

/** A heading: "Now:", "## Next", "LATER", a short line ending in a colon with nothing after it. */
export function headingOf(line: string): string | null {
  const text = line.trim()
  const hashed = /^#{1,6}\s+(.+)$/.exec(text)
  if (hashed) return hashed[1].replace(/:$/, '').trim()
  const colon = /^([^:]{1,40}):$/.exec(text)
  if (colon && colon[1].split(/\s+/).length <= 5) return colon[1].trim()
  return null
}

const URL = /^(?:<)?(https?:\/\/\S+?)(?:>)?$/i
const URL_IN = /https?:\/\/\S+/i
/** A short saying: quoted, or a short line with a dash and a name after it. */
const QUOTED = /^["“'‘].+["”'’](?:\s*[-–—]\s*.+)?$/
const BY = /^.{8,200}\s[-–—]\s?[A-Z][\w.' ]{1,40}$/

/**
 * A pasted page, line by line, as what each line is best kept as. A line
 * under a task heading ("Now:", "Next:", "Todo") is a task, its indented lines
 * its steps; a ticked line ("[x]") anywhere is a task already done; a bare
 * link is a link; a single word is a word to learn; a quoted line, or one
 * under "Bits" or "Quotes", is a saying; the rest are notes, tagged with the
 * heading they sat under. Headings themselves are only read, never kept.
 * Nothing is decided here: the sheet shows it, and you change any of it.
 */
export function sortOut(text: string): Sorted[] {
  const raw = text.replace(/\r\n?/g, '\n').split('\n')
  const out: Sorted[] = []
  let under: string | null = null
  let n = 0
  const least = Math.min(...raw.filter((line) => line.trim()).map((line) => depthOf(/^[\t ]*/.exec(line)![0])))
  for (const line of raw) {
    if (!line.trim()) continue
    const lead = /^[\t ]*/.exec(line)![0]
    const depth = depthOf(lead) - (Number.isFinite(least) ? least : 0)
    const rest = line.slice(lead.length)
    const mark = MARK.exec(rest)!
    const words = rest.slice(mark[0].length).trim()
    if (!words) continue
    const ticked = !!mark[1]
    const done = ticked && mark[1].toLowerCase() === 'x'
    let head = depth === 0 && !ticked && !mark[0] ? headingOf(words) : null
    // Under Now or Todo, "Address the changes:" with lines under it is a task
    // with steps, not a new heading; a known heading ("Next:") still is one.
    if (head && under && TASK_HEADS.test(under) && !KNOWN.some((known) => known.test(head!))) head = null
    if (head) {
      under = head
      continue
    }
    const parent = out[out.length - 1]
    const taskHead = !!under && TASK_HEADS.test(under)
    // An indented line under a task is one of its steps.
    if (depth > 0 && parent?.kind === 'task') {
      parent.steps.push({ text: words, done })
      continue
    }
    const tag = under && !TASK_HEADS.test(under) ? tagOf(under) || null : null
    const kind: Sort =
      ticked || taskHead ? 'task'
      : URL.test(words) || (LINK_HEADS.test(under ?? '') && URL_IN.test(words)) ? 'link'
      : WORD_HEADS.test(under ?? '') || /^[\p{L}'-]{2,30}$/u.test(words) ? 'word'
      : SAYING_HEADS.test(under ?? '') || QUOTED.test(words) || BY.test(words) ? 'saying'
      : 'note'
    // An indented line under anything else rides with it as a note of its own.
    out.push({ id: `l${n++}`, kind, text: words.replace(/:$/, ''), steps: [], done, under, tag, suggest: suggestedTag(words) })
  }
  return out
}

/** Whether a paste looks like a page to sort: eight lines or more, with headings or a mix of kinds. */
export function worthSorting(text: string): boolean {
  const sorted = sortOut(text)
  if (sorted.length < 5) return false
  // A line of one word is as likely a to-do ("laundry") or a step ("outline")
  // as a word to learn: only a heading for words makes it a kind of its own.
  const kinds = new Set(sorted.map((one) => (one.kind === 'word' && !WORD_HEADS.test(one.under ?? '') ? 'note' : one.kind)))
  const heads = text.split('\n').filter((line) => headingOf(line) && !MARK.exec(line.trim())![0]).length
  return kinds.size >= 2 || heads >= 2
}
