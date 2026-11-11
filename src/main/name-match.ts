/**
 * When some words truly name another note: the one rule set behind "Mentions X, a note of yours" (roots.ts
 * linksIn), "N unlinked mentions" and "Names N other notes without a link" (the mentions handler), and the link
 * each of them makes. A title standing in a text is offered as a link only when it reads as that note's name:
 *
 * - whole words, the whole title, inside one line; never inside code, a link, a web address or a file's path;
 * - never "Untitled", a number, a date, or a name under four letters;
 * - a title of one everyday word ("Protocol", "Glossary", "Queue") only where it is written as a name: with a
 *   capital, in the middle of a sentence, in a line that is not all capitals or a Title Case heading;
 * - a title of two everyday words ("Reading queue") the same; three or more read as a phrase of their own;
 * - a title that many notes hold (more than one in twenty, or three in a small book) names nothing.
 *
 * Measured on the user's own book (11 Nov 2026): see test/name-match.test.ts for each class of false offer.
 */

import { readFileSync } from 'node:fs'

/** A leading "the", "a" or "an" in a name may be left out where it is written. */
const ARTICLES = new Set(['the', 'a', 'an'])
/** Words that carry no subject: a name made only of these and everyday words needs the capitals of a name. */
const SMALL = new Set('the a an and or of in on at to for with by from as is are was were be it its this that these those my your our his her their i you we they not no do does did how what why when where which who'.split(' '))

export type Name = { key: string; title: string; words: string[] }
export type Hit = { key: string; title: string; line: number; from: number; to: number; words: string }
type Token = { lower: string; from: number; to: number }

/** A title's own words, its #tags left off ("Frankenstein #book" is "Frankenstein"). */
export const nameOf = (title: string): string => title.replace(/(?:^|\s)#[\p{L}\p{N}_/-]+/gu, '').replace(/\*\*|__|[“”"]/g, '').replace(/\s+/g, ' ').trim()

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?'
const DAY = '(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\\s+)?'
const DATE = new RegExp(`^${DAY}(?:\\d{1,4}[-/.]\\d{1,2}(?:[-/.]\\d{1,4})?|\\d{1,2}\\s+${MONTH}(?:\\s+\\d{2,4})?|${MONTH}\\s+\\d{1,2}(?:,?\\s+\\d{2,4})?|${MONTH}\\s+\\d{4})$`, 'i')

/** A title that can name its note in another's words at all; null for "Untitled", a number, a date, too short, too long. */
export function nameFrom(key: string, title: string): Name | null {
  const name = nameOf(title)
  const letters = name.replace(/[^\p{L}]/gu, '')
  if (letters.length < 4 || /^(?:untitled|new note)$/i.test(name) || DATE.test(name)) return null
  let words = tokensOf(name).map((one) => one.lower)
  // "The Picture of Dorian Gray" may be written without its "the"; "The Scroll" keeps it, or any "scrolls" would name it.
  if (words.length > 2 && ARTICLES.has(words[0])) words = words.slice(1)
  if (!words.length || words.length > 8 || name.length > 80) return null
  return { key, title: name, words }
}

/** A line with its web addresses, mail addresses and file paths blanked out, place for place, so what is left keeps its positions. */
export const withoutAddresses = (line: string): string =>
  line.replace(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+|\S+@\S+\.\S+|(?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+|[\w-]+\.[a-z]{1,5}\b(?!\.)/g, (hit) => ' '.repeat(hit.length))

const tokensOf = (line: string): Token[] => [...line.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)].map((match) => ({ lower: match[0].toLowerCase().replace(/['’]s$/, ''), from: match.index, to: match.index + match[0].length }))

/** A written word against a name's: the same, or its plain plural ("protocols" for "protocol"). */
const sameWord = (written: string, word: string): boolean => written === word || (word.length >= 4 && (written === `${word}s` || written === `${word}es`))

const capital = (word: string): boolean => /^\p{Lu}/u.test(word)

/** Whether an everyday word is one: as written, or as its singular ("notes" for "note"). */
const everydayWord = (word: string, everyday: (word: string) => boolean): boolean =>
  SMALL.has(word) || /^\d+$/.test(word) || everyday(word) || (word.endsWith('s') && everyday(word.slice(0, -1))) || (word.endsWith('es') && everyday(word.slice(0, -2))) || (word.endsWith('ies') && everyday(`${word.slice(0, -3)}y`))

/** A name made only of everyday words: it must be written as a name to count. Three or more words of substance are a phrase of their own. */
export function ordinary(name: Name, everyday: (word: string) => boolean): boolean {
  if (!name.words.every((word) => everydayWord(word, everyday))) return false
  return name.words.filter((word) => !SMALL.has(word) && !/^\d+$/.test(word)).length < 3
}

/**
 * Written as a name: a word of substance in it has a capital that its place does not explain. Not at the start
 * of the line or a sentence, and not in a line that is mostly capitals (a heading in Title Case, a shout).
 */
export function writtenAsName(line: string, from: number, to: number): boolean {
  const written = [...line.slice(from, to).matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({ word: match[0], at: from + match.index }))
  // The line's other words mostly capitals, with enough of them to tell: the capital is the line's, not the name's.
  const others = [...line.matchAll(/\p{L}{4,}/gu)].filter((match) => match.index < from || match.index >= to).map((match) => match[0])
  if (others.length >= 2 && others.filter(capital).length / others.length > 0.6) return false
  const before = line.slice(0, from)
  const starts = !before.trim() || /[.!?:;—–|]["'”’)\]]*\s*$/.test(before) || /\s-\s*$/.test(before) || /^[\s>*\-+•·#\d.)\]\[xX]*$/.test(before)
  // One word beside another capital ("Language Server Protocol", "Emperor Justinian") is a part of that longer name, not this one.
  if (written.length === 1 && (/\p{Lu}[\p{L}\p{N}]*\s+$/u.test(before) || /^\s+\p{Lu}/u.test(line.slice(to)))) return false
  return written.some((one, index) => !SMALL.has(one.word.toLowerCase()) && capital(one.word) && !(index === 0 && starts))
}

/**
 * Looks names up in lines of words, the words read once: a name is found by its first word, then checked word by
 * word. `lines` are plain words free of code and links (linkableLines). Each name is found once, where it first
 * reads as a name; `leave` are names not to look for (the note itself, ones already linked).
 */
export class NameBook {
  private byFirst = new Map<string, Name[]>()
  readonly names: Name[]
  constructor(names: Name[], everyday: (word: string) => boolean = () => false) {
    this.names = names
    for (const name of names) {
      const list = this.byFirst.get(name.words[0])
      if (list) list.push(name)
      else this.byFirst.set(name.words[0], [name])
    }
    for (const name of names) this.plain.set(name.key, ordinary(name, everyday))
  }
  private plain = new Map<string, boolean>()

  /**
   * Every name some lines hold, each once, where it first reads as a name. Two notes of one name (a capture and the
   * gem made from it) are offered once, the first; a name the same as `own` is the note itself or its twin, never
   * offered. `strict` false counts any whole-word standing (for how common a name is).
   */
  find(lines: string[], leave: Set<string> = new Set(), strict = true, own = ''): Hit[] {
    const out: Hit[] = []
    const seen = new Set<string>()
    const said = new Set<string>(own ? [nameOf(own).toLowerCase()] : [])
    lines.forEach((raw, row) => {
      const line = withoutAddresses(raw)
      const tokens = tokensOf(line)
      for (let i = 0; i < tokens.length; i++) {
        const first = tokens[i].lower
        const candidates = this.byFirst.get(first) ?? (first.endsWith('es') ? this.byFirst.get(first.slice(0, -2)) : undefined) ?? (first.endsWith('s') ? this.byFirst.get(first.slice(0, -1)) : undefined)
        if (!candidates) continue
        for (const name of candidates) {
          if (seen.has(name.key) || leave.has(name.key) || i + name.words.length > tokens.length) continue
          // Word for word, with nothing between two of them that ends a sentence or stands for code or a link.
          if (!name.words.every((word, j) => sameWord(tokens[i + j].lower, word) && (j === 0 || !/\u2063|[.!?]\s/.test(line.slice(tokens[i + j - 1].to, tokens[i + j].from))))) continue
          const from = tokens[i].from
          const to = tokens[i + name.words.length - 1].to
          if (strict && this.plain.get(name.key) && !writtenAsName(line, from, to)) continue
          seen.add(name.key)
          if (strict && said.has(name.title.toLowerCase())) continue
          said.add(name.title.toLowerCase())
          out.push({ key: name.key, title: name.title, line: row, from, to, words: raw.slice(from, to) })
        }
      }
    })
    return out
  }
}

/** The Mac's own word list (lower case only: everyday words), read once, for telling a name from a word. None off a Mac: every name then counts as one. */
let macWords: Set<string> | null = null
export const everyday = (word: string): boolean => {
  if (!macWords) {
    try {
      macWords = new Set(readFileSync('/usr/share/dict/words', 'utf8').split('\n').filter((one) => one && one === one.toLowerCase()))
    } catch {
      macWords = new Set()
    }
  }
  return macWords.has(word)
}

/** How many notes may hold a name before it names nothing: one in twenty, or three in a small book. */
export const tooCommon = (notesWith: number, total: number): boolean => notesWith > Math.max(3, total / 20)

type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type?: string }[]; content?: Node[] }
const INLINE = new Set(['text', 'noteLink', 'hardBreak', 'emoji', 'mention', 'math', 'inlineMath'])
/** Text that can never become a link to a note: code, and what is already a link. */
export const unlinkable = (node: Node): boolean => !!node.marks?.some((mark) => mark.type === 'code' || mark.type === 'link')

/**
 * A document's words where a name could be made a link, a block a line: code blocks, inline code, links, note
 * links and web addresses left out (a gap in their place, so a name never joins across one). Markdown the same.
 */
export function linkableLines(body: unknown): string[] {
  if (typeof body === 'string') {
    return body
      .replace(/```[\s\S]*?(?:```|$)/g, '\n')
      .replace(/`[^`\n]+`/g, ' ⁣ ')
      .replace(/\[\[[^\]]*\]\]/g, ' ⁣ ')
      .replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, ' ⁣ ')
      .split('\n')
  }
  const lines: string[] = []
  const walk = (node: Node): void => {
    if (!node || node.type === 'codeBlock' || node.type === 'meeting') return
    const kids = node.content ?? []
    if (kids.length && kids.every((kid) => INLINE.has(kid.type ?? ''))) {
      // A gap mark where code or a link stood: no word, so no name is read across it.
      lines.push(...kids.map((kid) => (kid.type === 'hardBreak' ? '\n' : kid.type !== 'text' || unlinkable(kid) ? ' ⁣ ' : kid.text ?? '')).join('').split('\n'))
      return
    }
    for (const kid of kids) walk(kid)
  }
  if (body && typeof body === 'object') walk(body as Node)
  return lines
}
