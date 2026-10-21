import * as chrono from 'chrono-node'
import dayjs from 'dayjs'
import type { Repeat } from './event-repeat'

/**
 * An event read out of one line of words, the way Google Calendar's quick
 * add and Fantastical read them: "lunch with Sam fri 1-2pm @Cafe" is lunch
 * with Sam, on Friday from 1 to 2, at Cafe, with Sam. Shared: the side panel
 * reads it as you type to show what it understood, and makes the event from
 * it. Written with plain imports so node's test runner loads it on its own.
 */
export type ReadEvent = {
  title: string
  /** When it starts and ends; null when the words name no day (the slot clicked fills it in). */
  start: string | null
  end: string | null
  allDay: boolean
  place: string | null
  people: string[]
  repeat: Repeat | null
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
// "every …" as task-words.ts reads it (written out here so node's test runner loads this file on its own).
const DAY = '(?:mon(?!th)|tue|wed|thu|fri|sat|sun)[a-z]*'
const RECURRENCE = new RegExp(`\\bevery\\s+(day|weekday|week|month|year|\\d+\\s+(?:days?|weeks?|months?)|last\\s+${DAY}|${DAY}(?:\\s*(?:,|and|&)\\s*${DAY})*)\\b`, 'i')
const LENGTH = /\bfor\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hr|hrs|hours?)\b/i
const ALL_DAY = /\ball[ -]day\b/i
const PLACE = /(?:^|\s)@\s*(\S.*)$/
/** "with Sam", "with Sam and Jo", "with Ann, Bo & Cy": names start with a capital, or are names you already have. */
const WITH = /\bwith\s+(\S+(?:\s*(?:,|and|&)\s*\S+)*)/i

/** The repeat said as "every …" (what follows the word), as a rule; null when the words say none. "last friday" is monthly, on the last one. */
export function repeatOf(unit: string): Repeat | null {
  const word = unit.toLowerCase().trim()
  if (/^last\s+/.test(word)) return { freq: 'monthly', by: 'nth', nth: -1 }
  const named = [...word.matchAll(/(mon|tue|wed|thu|fri|sat|sun)/g)].map((m) => DAYS.indexOf(m[1]))
  if (/^(?:mon(?!th)|tue|wed|thu|fri|sat|sun)/.test(word) && named.length) return { freq: 'weekly', days: named }
  const n = Number(/\d+/.exec(word)?.[0] ?? 1)
  if (word === 'weekday') return { freq: 'weekly', days: [1, 2, 3, 4, 5] }
  if (/day/.test(word)) return { freq: 'daily', every: n }
  if (/week/.test(word)) return { freq: 'weekly', every: n }
  if (/month/.test(word)) return { freq: 'monthly', every: n }
  if (/year/.test(word)) return { freq: 'yearly' }
  return null
}

/** The words with one span taken out, the space around it closed up. */
const without = (text: string, from: number, length: number): string => `${text.slice(0, from)} ${text.slice(from + length)}`.replace(/\s+/g, ' ').trim()

export function readEvent(words: string, now = new Date(), known: string[] = []): ReadEvent {
  let text = words.replace(/\s+/g, ' ').trim()
  // Where: everything after an @, once the date is out of it.
  let repeat: Repeat | null = null
  const every = RECURRENCE.exec(text)
  if (every) (repeat = repeatOf(every[1])), (text = without(text, every.index, every[0].length))
  let minutes: number | null = null
  const length = LENGTH.exec(text)
  if (length) {
    const n = Number(length[1])
    minutes = Math.round(/^h/i.test(length[2]) ? n * 60 : n)
    text = without(text, length.index, length[0].length)
  }
  let allDay = false
  const whole = ALL_DAY.exec(text)
  if (whole) (allDay = true), (text = without(text, whole.index, whole[0].length))
  let start: Date | null = null
  let end: Date | null = null
  const found = chrono.en.GB.parse(text, now, { forwardDate: true })[0]
  if (found) {
    start = found.start.date()
    end = found.end?.date() ?? null
    if (!found.start.isCertain('hour')) allDay = true
    text = without(text, found.index, found.text.length)
  }
  let place: string | null = null
  const at = PLACE.exec(text)
  if (at) (place = at[1].trim() || null), (text = text.slice(0, at.index).trim())
  // Who: names after "with", kept in the title too ("Lunch with Sam").
  const people: string[] = []
  const said = WITH.exec(text)
  if (said) {
    for (const raw of said[1].split(/\s*(?:,|\band\b|&)\s*/i)) {
      const name = raw.replace(/[^\p{L}\p{M}'-]/gu, '')
      const kept = known.find((one) => one.toLowerCase() === name.toLowerCase() || one.split(' ')[0].toLowerCase() === name.toLowerCase())
      if (kept) people.push(kept)
      else if (/^\p{Lu}/u.test(name)) people.push(name)
      else break
    }
  }
  const title = text.replace(/\s+/g, ' ').trim()
  if (start && allDay) {
    start = dayjs(start).startOf('day').toDate()
    end = null
  } else if (start && !end) end = dayjs(start).add(minutes ?? 60, 'minute').toDate()
  else if (start && end && end <= start) end = dayjs(end).add(1, 'day').toDate()
  return {
    title: title ? title[0].toUpperCase() + title.slice(1) : '',
    start: start?.toISOString() ?? null,
    end: end?.toISOString() ?? null,
    allDay,
    place,
    people: [...new Set(people)],
    repeat
  }
}
