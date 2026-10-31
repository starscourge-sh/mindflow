/**
 * A pasted list of cards, read one way wherever it is pasted: into a note
 * (extensions/line-cards.ts) or Review's "Paste cards" sheet
 * (components/haligtree/paste-cards.tsx). Tests: test/card-lists.test.ts.
 */
import { isEquation, lineCard } from './study.ts'

/** What can stand between a card's front and back, as people write them: Haligtree's own lines, Anki's export, a spreadsheet, an AI's list. */
export const SEPARATORS = [
  { id: ' :: ', label: '::' },
  { id: '\t', label: 'Tab' },
  { id: '|', label: '|' },
  { id: ';', label: ';' },
  { id: ' - ', label: '“ - ”' },
  { id: ',', label: ',' }
] as const
export type Separator = (typeof SEPARATORS)[number]['id']

/** A pasted card: its front, its back, and whether the line split in three or more (kept at the first split). */
export type PastedCard = { term: string; meaning: string; three: boolean }

/** The lines that could be cards: blank lines and # comment lines (Anki's export header) left out. */
export const listLines = (text: string): string[] => text.split(/\r?\n/).map((line) => line.replace(/^﻿/, '').trim()).filter((line) => line && !/^#(?:separator|html|tags|columns|notetype|deck|guid)?:|^#\s/i.test(line) && line !== '#')

/** Where a line splits: never at a " - " or "," inside an equation ("a - b = c"), never at a :: inside code or a formula. */
function partsOf(line: string, separator: Separator): string[] {
  if ((separator === ' - ' || separator === ',') && isEquation(line)) return [line]
  if (separator === ' :: ') {
    const card = lineCard(line)
    if (!card) return [line]
    const more = lineCard(card.answer)
    return more ? [card.question, more.question, more.answer] : [card.question, card.answer]
  }
  // A quoted spreadsheet cell keeps its separators: "Paris, France",capital
  if (separator === ',' || separator === ';' || separator === '\t') {
    const cells: string[] = []
    let cell = ''
    let quoted = false
    for (let at = 0; at < line.length; at++) {
      const char = line[at]
      if (char === '"' && quoted && line[at + 1] === '"') (cell += '"'), at++
      else if (char === '"' && (quoted || !cell.trim())) quoted = !quoted
      else if (char === separator && !quoted) cells.push(cell.trim()), (cell = '')
      else cell += char
    }
    return [...cells, cell.trim()]
  }
  return line.split(separator).map((part) => part.trim())
}

/** The separator that splits the most lines in two, the first in the list winning a tie: counted, never asked. */
export function guessSeparator(text: string): Separator {
  const all = listLines(text)
  let best: Separator = SEPARATORS[0].id
  let most = 0
  for (const { id } of SEPARATORS) {
    const split = all.filter((line) => partsOf(line, id).filter(Boolean).length >= 2).length
    if (split > most) (best = id), (most = split)
  }
  return best
}

/** Words a spreadsheet's first row uses to name its columns: "Front,Back", "English;Spanish", "Question | Answer". */
const HEADING = /^(front|back|question|answer|term|definition|word|meaning|english|spanish|french|german|italian|portuguese|japanese|chinese|korean|russian|native|target|sentence|translation|notes?|extra|tags?|side ?[12]|prompt|response|concept|explanation|date|event|name|who|what|when|where|formula|value)$/i

/** The first line's columns, when they name the columns rather than make a card: kept as the sides' names. */
export function headingsOf(text: string, separator: Separator): string[] | null {
  const parts = partsOf(listLines(text)[0] ?? '', separator)
  return parts.length >= 2 && parts.slice(0, 2).every((part) => HEADING.test(part)) ? parts : null
}

/** Each line as a front and a back; a line split in three or more keeps its first split, the rest joining the back, and says so. A first line of column names is not a card. */
export function cardsOf(text: string, separator: Separator): PastedCard[] {
  return listLines(text).slice(headingsOf(text, separator) ? 1 : 0).flatMap((line) => {
    const [front = '', ...rest] = partsOf(line, separator)
    const back = rest.filter(Boolean)
    return front && back.length ? [{ term: front, meaning: back.join(separator === ' :: ' ? ' :: ' : '\n\n'), three: back.length > 1 }] : []
  })
}

/**
 * A paste that is plainly a list of cards, for a note: two cards or more,
 * split by ::, a tab, | or ; (a " - " or "," list stays text and is offered
 * as cards instead, since prose has those too), on most of its lines. Null
 * for anything else, which pastes as it always has.
 */
export function cardListOf(text: string): { separator: Separator; headings: string[] | null; cards: PastedCard[] } | null {
  const all = listLines(text)
  if (all.length < 2) return null
  const separator = guessSeparator(text)
  if (separator === ' - ' || separator === ',') return null
  // A Markdown table ("| a | b |") is a table.
  if (separator === '|' && all.filter((line) => line.startsWith('|')).length >= all.length / 2) return null
  const headings = headingsOf(text, separator)
  const cards = cardsOf(text, separator)
  // Most rows in three columns or more: a table to keep, not a card list.
  if (cards.filter((card) => card.three).length > cards.length / 2) return null
  return cards.length >= 2 && cards.length >= (all.length - (headings ? 1 : 0)) * 0.7 ? { separator, headings, cards } : null
}
