import dayjs from 'dayjs'
import { datesIn } from './task-words.ts'

/**
 * Dates and times in written words, read by the app's one date reader
 * (task-words.ts, datesIn) and kept only where they are surely a date: a note
 * is prose, and in prose "a second", "the 1960s", "sun" and "March of the
 * penguins" are not days. A reading is kept when it names a day (today,
 * Friday), a month with its day or year (14 Nov, May 2020), a written date
 * (14/11, 2026-11-14) or a clock time (3pm, 10:30, noon).
 */

const DAY = /\b(?:today|tonight|tomorrow|yesterday|tmrw|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b/i
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const MONTH_DAY = new RegExp(`\\b${MONTH}\\.?\\s+\\d|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b`, 'i')
const WRITTEN = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/
const CLOCK = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b\d{1,2}:\d{2}\b|\bnoon\b|\bmidnight\b/i
/** Words a block must hold before the reader is asked at all: most lines of prose hold none. */
const MAYBE = new RegExp(`\\d|${DAY.source.slice(2, -2)}|\\bnoon\\b|\\bmidnight\\b`, 'i')

export type DateWord = {
  /** Offsets into the text. */
  from: number
  to: number
  text: string
  /** The day it was read as, said in full: "Friday 7 November, 15:00". */
  said: string
}

/** "The Sunday Times", "Good Friday Agreement": a day's name inside a name, followed by another capital. */
const named = (text: string, at: number, said: string): boolean =>
  /^[A-Z][a-z]+day$/.test(said.trim()) && /^\s+[A-Z]/.test(text.slice(at + said.length))

const sure = (text: string): boolean => DAY.test(text) || MONTH_DAY.test(text) || WRITTEN.test(text) || CLOCK.test(text)

/**
 * The dates and times in a line of prose, read as on `at` (the day the words
 * were written: "tomorrow" in last month's note is the day after it was
 * written, and its tip says which day that was).
 */
export function dateWords(text: string, at: Date, clock: (date: Date) => string): DateWord[] {
  if (!MAYBE.test(text)) return []
  // "Today" alone is the day the words were written, which the note already says: only a time with it is lit.
  return datesIn(text, at).filter((found) => sure(found.text) && !named(text, found.index, found.text) && !/^(?:today|tonight|this (?:morning|afternoon|evening))$/i.test(found.text.trim())).map((found) => {
    const { start } = found
    const date = dayjs(found.date)
    const day = start.isCertain('day') || start.isCertain('weekday') || DAY.test(found.text)
    const year = date.year() !== dayjs(at).year() ? ' YYYY' : ''
    const time = start.isCertain('hour') ? clock(found.date) : ''
    const dayed = day ? date.format(`dddd D MMMM${year}`) : start.isCertain('month') ? date.format(`MMMM${year || ' YYYY'}`) : ''
    // "on Friday at 3pm" is lit from "Friday": the little word before it is not the date.
    const lead = /^(?:on|at|by|from|until|till|due|before|after|this|next)\s+(?=\S)/i.exec(found.text)?.[0].length ?? 0
    const keep = /^(?:this|next)\s/i.test(found.text) ? 0 : lead
    // "14 Nov." at a sentence's end: the full stop is the sentence's.
    const words = found.text.slice(keep).replace(/\.$/, '')
    return { from: found.index + keep, to: found.index + keep + words.length, text: words, said: [dayed, time].filter(Boolean).join(', ') }
  }).filter((one) => one.said)
}
