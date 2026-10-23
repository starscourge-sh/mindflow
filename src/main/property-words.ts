import { parseDate } from 'chrono-node'

/**
 * Properties: a name and a value on any note or page, kept in its `fields`
 * (one JSON object, as a kind's fields always were), so a kind's fields are
 * properties already. How they are read from typed words, shared by the main
 * process, the windows and the tests: nothing here needs Node or Electron.
 */

export type PropType = 'text' | 'number' | 'date' | 'bool' | 'choice' | 'link'
export const PROP_TYPES: { id: PropType; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'number', label: 'Number' },
  { id: 'date', label: 'Date' },
  { id: 'bool', label: 'Yes or no' },
  { id: 'choice', label: 'Choice' },
  { id: 'link', label: 'Link' }
]

/**
 * A line that is a property: `Author:: Ursula Le Guin`. No space before the
 * `::`, so `question :: answer` stays a review card (study.ts). The name starts
 * with a letter, holds letters, digits, spaces and - _ ' . only, and is at
 * most 40 characters; the value may be empty.
 */
export function propertyLine(line: string): { name: string; value: string } | null {
  const match = /^\s*(\p{L}[\p{L}\p{N} _'’.-]{0,39}?)::(?:\s+(.*?))?\s*$/u.exec(line)
  if (!match || /\s$/.test(match[1])) return null
  return { name: match[1].trim(), value: (match[2] ?? '').trim() }
}

const YES = /^(yes|y|true|on|done)$/i
const NO = /^(no|n|false|off)$/i

/**
 * What typed words are, as a property's value: yes or no, a number, a date,
 * a link to a note, or words. A type already given (the property's own, or
 * its super tag's) wins over the guess, and words it cannot read as that type
 * are kept as they were typed, never lost.
 */
export function readValue(raw: string, type?: PropType | null, now = new Date()): { type: PropType; value: string | number | boolean } {
  const text = raw.trim()
  const asBool = YES.test(text) ? true : NO.test(text) ? false : null
  const asNumber = /^-?\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : null
  const link = /^\[\[(.+)\]\]$/.exec(text)?.[1] ?? null
  const asDate = (): string | null => {
    const day = /^\d{4}-\d\d-\d\d$/.test(text) ? new Date(`${text}T12:00:00`) : parseDate(text, now, { forwardDate: true })
    if (!day || Number.isNaN(day.getTime())) return null
    day.setHours(12, 0, 0, 0)
    return day.toISOString()
  }
  if (type === 'bool') return { type, value: asBool ?? text }
  if (type === 'number') return { type, value: asNumber ?? text }
  if (type === 'date') return { type, value: asDate() ?? text }
  if (type === 'link') return { type, value: link ?? text }
  if (type === 'text' || type === 'choice') return { type, value: text }
  if (asBool !== null) return { type: 'bool', value: asBool }
  if (asNumber !== null) return { type: 'number', value: asNumber }
  if (link) return { type: 'link', value: link }
  // A date only when the words are all date: "next friday", "2026-11-03", "3 Nov". "Read it friday" stays words.
  const date = text.length <= 24 && /^(\d{4}-\d\d-\d\d|today|tomorrow|yesterday|next \w+|in \d+ \w+|\d{1,2} \w{3,9}( \d{4})?|\w{3,9} \d{1,2}(,? \d{4})?|mon\w*|tue\w*|wed\w*|thu\w*|fri\w*|sat\w*|sun\w*)$/i.test(text) ? asDate() : null
  if (date) return { type: 'date', value: date }
  return { type: 'text', value: text }
}

/** Every `name:: value` line taken out of plain words: what is left, and what they set. */
export function takeProperties(text: string): { text: string; found: { name: string; value: string }[] } {
  const found: { name: string; value: string }[] = []
  const kept = text.split('\n').filter((line) => {
    const one = propertyLine(line)
    if (one) found.push(one)
    return !one
  })
  return { text: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), found }
}

/**
 * `name:value` in a search: a property filter, when the name is one in use
 * (a name of two words is written with a dash: `pages-read:`). Its value runs
 * on to the next filter, so `author:le guin` is one; words for the search
 * itself go first. `name:` alone asks for notes that have it.
 */
export function propertyFilters(words: string[], known: string[]): { filters: { name: string; value: string }[]; rest: string[] } {
  const names = new Map(known.map((name) => [name.toLowerCase().replace(/\s+/g, '-'), name]))
  const filters: { name: string; value: string }[] = []
  const rest: string[] = []
  for (const word of words) {
    const match = /^([^:]+):(.*)$/.exec(word)
    const name = match && names.get(match[1].toLowerCase())
    if (match && name && match[1] !== 'kind') filters.push({ name, value: match[2] })
    else if (filters.length && !word.includes(':')) filters[filters.length - 1].value = `${filters[filters.length - 1].value} ${word}`.trim()
    else rest.push(word)
  }
  return { filters, rest }
}

/** Whether a note's fields pass every filter: the value contains the words, any case; "yes"/"no" read a yes or no. */
export function passes(fields: Record<string, unknown> | null | undefined, filters: { name: string; value: string }[]): boolean {
  return filters.every(({ name, value }) => {
    const key = Object.keys(fields ?? {}).find((one) => one.toLowerCase() === name.toLowerCase())
    if (!key) return false
    const held = fields![key]
    if (held === null || held === undefined || held === '') return false
    if (!value) return true
    if (typeof held === 'boolean') return YES.test(value) ? held : NO.test(value) ? !held : false
    return String(held).toLowerCase().includes(value.toLowerCase())
  })
}

type Part = { type?: string; text?: string; content?: Part[] }
const textOf = (part: Part): string => part.text ?? (part.content ?? []).map(textOf).join('')

/**
 * A note's `name:: value` lines, as it arrives from quick capture: each line
 * of its own (never the first, its title) taken out and handed back to be
 * kept as properties. Plain words or a document alike.
 */
export function takeBodyProperties(body: unknown): { body: unknown; found: { name: string; value: string }[] } {
  if (typeof body === 'string') {
    const [first, ...rest] = body.split('\n')
    const taken = takeProperties(rest.join('\n'))
    return taken.found.length ? { body: [first, taken.text].filter(Boolean).join('\n'), found: taken.found } : { body, found: [] }
  }
  const doc = body as Part | null
  if (!doc || !Array.isArray(doc.content)) return { body, found: [] }
  const found: { name: string; value: string }[] = []
  const content = doc.content.filter((part, at) => {
    const one = at > 0 && part.type === 'paragraph' ? propertyLine(textOf(part)) : null
    if (one) found.push(one)
    return !one
  })
  return found.length ? { body: { ...doc, content }, found } : { body, found: [] }
}
