/**
 * Study questions drafted from a note's own words and shape, on every Mac
 * (note-questions.tsx draws them): a definition ("X is …"), a bold or
 * highlighted term as a gap to fill, a list's lead-in, a heading and the words
 * under it. Every answer is cut from the line it came from, so no question
 * asks for what the note does not hold; none is a card until it is kept.
 */
import { num } from './dates.ts'

type Node ={ type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string }[]; content?: Node[] }

export type Rule = 'definition' | 'gap' | 'list' | 'heading' | 'line'
export type QuestionDraft = {
  question: string
  answer: string
  /** The line it came from, as it stands in the note: the card's passage, found again by "Show in its note". */
  from: string
  rule: Rule
}

type Block = { kind: 'heading' | 'para' | 'item' | 'list'; text: string; marked: [number, number][]; items?: string[] }

const inline = (node: Node): string =>
  node.type === 'text' ? node.text ?? '' : node.type === 'hardBreak' ? '\n' : node.content ? node.content.map(inline).join('') : typeof node.attrs?.label === 'string' ? node.attrs.label : ''

/** A block's words, and where its bold and highlighted words are in them. */
function words(node: Node): Pick<Block, 'text' | 'marked'> {
  let text = ''
  const marked: [number, number][] = []
  const walk = (one: Node): void => {
    if (one.type !== 'text') return void (one.content ? one.content.forEach(walk) : (text += inline(one)))
    const start = text.length
    text += one.text ?? ''
    if (!one.marks?.some((mark) => mark.type === 'bold' || mark.type === 'highlight')) return
    const last = marked.at(-1)
    if (last && last[1] === start) last[1] = text.length
    else marked.push([start, text.length])
  }
  walk(node)
  return { text, marked }
}

/** A "question :: answer" line is a card the note already owns. */
const isCardLine = (text: string): boolean => /\s::\s|\s::$/.test(text)

/**
 * The note's blocks in reading order, one at a time (a long note is read only
 * as far as it is needed): headings, paragraphs, lists and their items;
 * tables, code, tasks, pictures and embeds left out.
 */
function* blocks(node: Node): Generator<Block> {
  switch (node.type) {
    case 'heading':
      return yield { kind: 'heading', ...words(node) }
    case 'paragraph': {
      const one = words(node)
      if (one.text.trim() && !isCardLine(one.text)) yield { kind: 'para', ...one }
      return
    }
    case 'bulletList':
    case 'orderedList': {
      const items = (node.content ?? []).map((item) => (item.content ?? []).find((part) => part.type === 'paragraph')).filter((part): part is Node => !!part).map(words)
      yield { kind: 'list', text: '', marked: [], items: items.map((one) => one.text.trim()) }
      for (const one of items) if (one.text.trim() && !isCardLine(one.text)) yield { kind: 'item', ...one }
      return
    }
    case 'blockquote':
    case 'callout':
    case 'details':
    case 'detailsContent':
    case 'column':
    case 'columns':
    case 'doc':
      for (const child of node.content ?? []) yield* blocks(child)
  }
}

/** Words as compared: no case, accents or punctuation. */
export const flat = (text: string): string => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const count = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0)

/** Whether an answer is the note's own words: every word of it, in order, somewhere in the note (`flatNote`: the note already flattened, for many answers). */
export function answerInNote(answer: string, note: string, flatNote = ` ${flat(note)} `): boolean {
  const said = flat(answer.replace(/…$/, ''))
  return !!said && flatNote.includes(` ${said} `)
}
/** Whether a question gives its answer away. */
export const givesAway = (question: string, answer: string): boolean => {
  const said = flat(answer)
  return !!said && ` ${flat(question)} `.includes(` ${said} `)
}

/** Sentences of a block, each as it stands; never cut after "e.g.", "i.e.", "Dr." and the like. */
const sentences = (text: string): string[] => text.split(/(?<=(?<!\b(?:[Ee]\.g|[Ii]\.e|etc|vs|Mr|Mrs|Ms|Dr|St|cf|al|No|approx))[.!?])\s+(?=["“(]?[\p{Lu}\p{N}])/u).map((one) => one.trim()).filter(Boolean)

const NOT_A_SUBJECT = new Set('this that these those it its he she they there here which what who whom whose why how where whether one i we you everything something nothing all some most many each every such so and but or if when then also still just now my our your his her their me us them today yesterday tomorrow life for in on at to with by from of as after before about into over under both either neither another other others nearly almost only even perhaps maybe really actually probably usually often finally'.split(' '))
/** What a definition's answer starts with: what it is ("a …", "the …", "how …"), not how it is ("small", "on fire"). */
const WHAT_IT_IS = /^(a|an|the|one|any|what|how|when|where|why|someone|something|anything|everything|people|those)\b/i
/** A subject that names something: words, not a code, a tag, a quote or a path. */
const NAMES = (subject: string): boolean => !/[\d#@/."“”]/.test(subject)
const VERBS: [RegExp, (subject: string, verb: string) => string][] = [
  [/^(is|are|was|were)$/, (subject, verb) => `What ${verb} ${subject}?`],
  [/^means$/, (subject) => `What does ${subject} mean?`],
  [/^refers to$/, (subject) => `What does ${subject} refer to?`],
  [/^stands for$/, (subject) => `What does ${subject} stand for?`],
]
/** "X is Y.": a short subject that names something, then at least three words saying what it is. */
function definition(sentence: string): { question: string; answer: string } | null {
  // Measured before the pattern is tried, so a long paragraph costs nothing.
  if (sentence.length > 300) return null
  const shape = /^(?:(the|a|an)\s+)?([^,;:()]{2,60}?)\s+(is|are|was|were|means|refers to|stands for)\s+(.+?)[.!]?$/i.exec(sentence.trim())
  if (!shape) return null
  const [, article, subject, verb, answer] = shape
  const first = subject.split(/\s+/)[0].toLowerCase()
  if (count(subject) > 6 || NOT_A_SUBJECT.has(first) || !NAMES(subject) || /\?/.test(sentence)) return null
  if (count(answer) < 3 || count(answer) > 40 || (/^(is|are|was|were)$/i.test(verb) && !WHAT_IT_IS.test(answer))) return null
  const ask = VERBS.find(([match]) => match.test(verb.toLowerCase()))
  // "A sonnet is …" asks "What is a sonnet?": the article kept, in small letters, mid-question; "Code you cannot
  // modify is …" asks about "code you cannot modify", a word that only began the sentence put in small letters.
  const words = subject.trim().split(/\s+/)
  const named = words.length > 1 && words.slice(1).every((one) => one === one.toLowerCase()) ? `${words[0][0].toLowerCase()}${subject.trim().slice(1)}` : subject.trim()
  return ask ? { question: ask[1](`${article ? `${article.toLowerCase()} ` : ''}${named}`, verb.toLowerCase()), answer: answer.trim() } : null
}

/** Bold words that lead a line as a label ("Now:", "Example:"), not a term to learn. */
const LABEL = /^(now|note|nb|pro tip|tip|warning|example|e\.?g|update|edit|todo|to do|source|why|how|what|when|where|who|answer|question|key point|summary|result|results|pros|cons|verdict|takeaway|idea|problem|solution|goal|context|background|rule|fix|cause|effect|before|after|old|new|step|part|day|week|today|tomorrow|yesterday|important|remember|quote)\b/i
const isTerm = (term: string): boolean => !!term && count(term) <= 4 && NAMES(term) && !/[()]/.test(term) &&!LABEL.test(term) && !NOT_A_SUBJECT.has(term.split(/\s+/)[0].toLowerCase()) && !/^(the|a|an)$/i.test(term.split(/\s+/)[0])

/** "**Term**: what it is" (the colon or dash inside the bold or after it): a bold term leading its line, then the words saying what it is. */
function boldTerm(block: Block): { question: string; answer: string } | null {
  const [first] = block.marked
  if (!first || first[0] !== 0) return null
  const lead = block.text.slice(0, first[1])
  const term = lead.replace(/[:\u2013\u2014\s-]+$/, '').trim()
  const rest = /[:\u2013\u2014-]\s*$/.test(lead) ? /^\s*(.+)$/s.exec(block.text.slice(first[1])) : /^\s*[:\u2013\u2014-]\s*(.+)$/s.exec(block.text.slice(first[1]))
  if (!rest || !isTerm(term) || count(rest[1]) < 3) return null
  const answer = sentences(rest[1].trim())[0]?.replace(/[.!]$/, '') ?? ''
  return count(answer) >= 3 && count(answer) <= 40 ? { question: `What is ${term}?`, answer } : null
}

/** A bold or highlighted term (a few words) in a sentence of its own: the sentence with a gap where it stood. */
function gap(block: Block): { question: string; answer: string; from: string } | null {
  for (const [start, end] of block.marked) {
    const term = block.text.slice(start, end).trim()
    // A bold lead-in ("**Now:**", "**Term**" and a dash) is a label or a term's name, never a gap.
    if (!term || count(term) > 6 || start === 0 && (/[:\u2013\u2014-]$/.test(term) || /^\s*[:\u2013\u2014-]/.test(block.text.slice(end)))) continue
    // The sentence round the term: back to the stop before it, on to the stop after it (one pass each way).
    const before = Math.max(block.text.lastIndexOf('.', start - 1), block.text.lastIndexOf('!', start - 1), block.text.lastIndexOf('?', start - 1)) + 1
    const tail = /[.!?](\s|$)/.exec(block.text.slice(end, end + 400))?.index ?? -1
    const sentence = block.text.slice(before, tail < 0 ? Math.min(block.text.length, end + 400) : end + tail + 1).trim()
    // A bold run that opens its sentence is a lead-in ("**Hassle.** Native permissions…", "**Protect your headspace**"), not a word to recall.
    if (sentence.length > 280 || sentence.startsWith(term)) continue
    const blanked = sentence.replace(block.text.slice(start, end).trim(), '_____').replace(/\s+/g, ' ')
    if (count(sentence) - count(term) < 5 || !blanked.includes('_____')) continue
    return { question: `Fill the gap: ${blanked}`, answer: term.replace(/[.,;:]$/, ''), from: sentence }
  }
  return null
}

const GENERIC = /^(connected( to)?|linked( notes)?|notes?|links?|to ?do|tasks?|summary|ideas?|questions?|references?|sources?|misc|other|introduction|intro|conclusion|overview|background|resources?|further reading|see also|related|contents|table of contents|tl;?dr|thoughts|takeaways?|key takeaways|highlights?|quotes?|bits?|log|journal|updates?|drafts?|outline|examples?|definitions?|steps|done|next|later|inbox|untitled)$/i

/** The opening words of a paragraph, whole sentences up to about forty words. */
function opening(text: string): string {
  let said = ''
  for (const one of sentences(text)) {
    if (said && count(said) + count(one) > 40) break
    said = said ? `${said} ${one}` : one
    if (count(said) >= 8) break
  }
  if (count(said) <= 40) return said
  const cut = said.split(/\s+/).slice(0, 40).join(' ')
  return `${cut.replace(/[,;:]$/, '')}…`
}

const leadIn = (text: string): string => text.trim().replace(/[:\s]+$/, '')

/** The order rules take turns in: what tests best first. */
const ORDER: Rule[] = ['definition', 'gap', 'list', 'heading']

type Found = QuestionDraft & { at: number; /** The words its answer was cut from, as they stand in the note. */ source: string }
const listShaped = (next: Block | undefined): next is Block & { items: string[] } =>
  next?.kind === 'list' && !!next.items && next.items.length >= 2 && next.items.length <= 8 && next.items.every((item) => item && item.length <= 160)

/** What one block offers, read with the block after it (a heading's paragraph, a lead-in's list). */
function offered(block: Block, next: Block | undefined, at: number): Found | null {
  if (block.kind === 'heading') {
    const title = block.text.trim()
    if (title.length < 3 || title.length > 80 || GENERIC.test(title.replace(/[:.]$/, '')) || /^\d[\d\s/.-]*$/.test(title)) return null
    if (listShaped(next)) return { at, rule: 'list', question: `${leadIn(title)}… (${num(next.items.length)})`, answer: next.items.join('; '), from: title, source: next.items.join('\n') }
    // The note's own name (a heading that opens it) is not a topic inside it; words under a heading are prose, not a link or a path.
    if (at === 0 || next?.kind !== 'para' || count(next.text) < 8 || !/^[\p{L}"“]/u.test(next.text.trim()) || /\.\.\/|https?:|\.(png|jpe?g|gif|webp|pdf)\b/i.test(next.text) || /^(references?|sources?|see|links?)\b/i.test(next.text.trim())) return null
    const answer = opening(next.text).replace(/\s+/g, ' ')
    // A lead-in to what follows ("In the context of research:") says nothing yet.
    return count(answer) >= 6 && !/:$/.test(answer) ?{ at, rule: 'heading', question: /\?$/.test(title) ? title : `What does your note say about “${title}”?`, answer, from: next.text.trim(), source: next.text } : null
  }
  if (block.kind === 'list') return null
  const text = block.text.trim()
  if (block.kind === 'para' && /:$/.test(text) && text.length <= 140 && count(text) >= 2 && listShaped(next)) {
    return { at, rule: 'list', question: `${leadIn(text)}… (${num(next.items.length)})`, answer: next.items.join('; '), from: text, source: next.items.join('\n') }
  }
  const term = boldTerm(block)
  if (term) return { at, rule: 'definition', ...term, from: text, source: text }
  for (const sentence of sentences(text)) {
    const said = definition(sentence)
    if (said) return { at, rule: 'definition', ...said, from: sentence, source: sentence }
  }
  const blank = gap(block)
  return blank ? { at, rule: 'gap', ...blank, source: blank.from } : null
}

/** Whether a draft's answer is in the words it was cut from (a list's: each item). */
const holds = (one: Found): boolean => {
  const source = ` ${flat(one.source)} `
  return (one.rule === 'list' ? one.answer.split('; ') : [one.answer]).every((part) => answerInNote(part, '', source))
}

/**
 * Three to five drafts from a note (fewer when that is all its shape holds,
 * none when it holds nothing to ask about): the rules take turns so one kind
 * does not crowd out the rest, one draft a line, then put back in the note's
 * own order. Read from the top only until every rule has `most` (or there are
 * plenty), so a note of a million letters costs no more than a long page.
 * Every answer is checked against the words it was cut from.
 */
export function draftQuestions(doc: unknown, most = 5): QuestionDraft[] {
  if (!doc || typeof doc !== 'object') return []
  const found: Found[] = []
  const per: Record<string, number> = {}
  let previous: Block | undefined
  let at = 0
  const take = (block: Block, next: Block | undefined): void => {
    const one = offered(block, next, at++)
    if (one && !givesAway(one.question, one.answer) && holds(one)) (found.push(one), (per[one.rule] = (per[one.rule] ?? 0) + 1))
  }
  let plenty = false
  for (const block of blocks(doc as Node)) {
    if (previous) take(previous, block)
    previous = block
    if ((plenty = found.length >= most * 12 || ORDER.every((rule) => (per[rule] ?? 0) >= most))) break
  }
  if (previous && !plenty) take(previous, undefined)
  const chosen: Found[] = []
  const used = new Set<string>()
  while (chosen.length < most) {
    const before = chosen.length
    for (const rule of ORDER) {
      const one = chosen.length < most && found.find((draft) => draft.rule === rule && !chosen.includes(draft) && !used.has(draft.from))
      if (one) (chosen.push(one), used.add(one.from))
    }
    if (chosen.length === before) break
  }
  return chosen.sort((a, b) => a.at - b.at).map(({ at: _, source: __, ...one }) => one)
}

/** All of a note's words, as one text: what the truth check reads answers against. */
export const noteText = (doc: unknown): string => [...blocks(doc as Node)].filter((one) => one.kind !== 'list').map((one) => one.text).join('\n')

/**
 * One draft from words picked in a note, read with the line round them
 * (`around`): a definition when they are one, a gap where a few words stood
 * in their sentence, or, for a longer passage, its opening with the rest to
 * finish. Null when there is too little to ask about.
 */
export function draftFromWords(picked: string, around = picked): QuestionDraft | null {
  const words = picked.replace(/\s+/g, ' ').trim()
  if (!words) return null
  for (const sentence of sentences(words)) {
    const said = definition(sentence)
    if (said && !givesAway(said.question, said.answer)) return { rule: 'definition', ...said, from: sentence }
  }
  const line = around.replace(/\s+/g, ' ').trim()
  if (count(words) <= 6) {
    const at = line.indexOf(words)
    if (at < 0) return null
    const blank = gap({ kind: 'para', text: line, marked: [[at, at + words.length]] })
    return blank ? { rule: 'gap', ...blank } : null
  }
  // A passage to finish: its first third or so, the rest the answer.
  const all = words.split(' ')
  const lead = Math.min(Math.max(3, Math.round(all.length * 0.4)), 12)
  return { rule: 'line', question: `Finish the line: “${all.slice(0, lead).join(' ')}…”`, answer: all.slice(lead).join(' '), from: words }
}
