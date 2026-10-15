import * as chrono from 'chrono-node'
import dayjs from 'dayjs'

/**
 * Reading a task out of one line of words, Todoist's way. Shared: the main
 * process makes the task from it, and the box and the add fields read it as
 * you type, to show the date it understood and light up the words it took.
 */

// Named days, alone or listed: "every mon, wed", "every tuesday and friday".
// Not "month", which starts like Monday.
const DAY = '(?:mon(?!th)|tue|wed|thu|fri|sat|sun)[a-z]*'
export const RECURRENCE = new RegExp(`\\bevery(!)?\\s+(day|weekday|week|month|year|\\d+\\s+(?:days?|weeks?|months?)|${DAY}(?:\\s*(?:,|and|&)\\s*${DAY})*)\\b`, 'i')
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
/** The days of the week a "every mon, wed" rule falls on, or none. */
const namedDays = (unit: string): number[] =>
  /^(?:mon(?!th)|tue|wed|thu|fri|sat|sun)/i.test(unit) ? [...unit.toLowerCase().matchAll(/(mon|tue|wed|thu|fri|sat|sun)/g)].map((m) => DAYS.indexOf(m[1])) : []

/**
 * The next date in a series, from `from`. `every 3 days`, `every weekday`, `every mon, wed`.
 * `day` is the day of the month a monthly series began on: the 31st falls on
 * the 28th in February and is back on the 31st in March.
 */
export function advance(from: Date, rule: string, day?: number): Date {
  let next = dayjs(from)
  const [, , unit] = RECURRENCE.exec(rule) ?? []
  // "every 0 days" is every day: never a series that stays where it is.
  const count = Math.max(1, Number(/\d+/.exec(unit ?? '')?.[0] ?? 1))
  const named = namedDays(unit ?? '')
  // Days, weeks, months and years on the calendar: a clock change keeps the
  // time of day, and a month too short for the day takes its last one.
  if (named.length) do next = next.add(1, 'day'); while (!named.includes(next.day()))
  else if (/day/.test(unit) && !/weekday/.test(unit)) next = next.add(count, 'day')
  else if (/weekday/.test(unit)) do next = next.add(1, 'day'); while ([0, 6].includes(next.day()))
  else if (/week/.test(unit)) next = next.add(count, 'week')
  else if (/month/.test(unit)) {
    next = next.add(count, 'month')
    if (day) next = next.date(Math.min(day, next.daysInMonth()))
  }
  else if (/year/.test(unit)) next = next.add(1, 'year')
  return next.toDate()
}

/** Linear's four, by number: 1 is Urgent, 4 is Low, 0 is none. */
export const PRIORITY_NAMES = ['No priority', 'Urgent', 'High', 'Medium', 'Low'] as const

/** "2026-10" for a month, "2026" for a year, or "someday": a when without a day. */
export const monthKey = (date: Date): string => dayjs(date).format('YYYY-MM')

/**
 * Which of the later lists a plan sits in today. A month gone by is still this
 * month's, so nothing slips off; anything in a year after this one, "next
 * year" or "next month" said in December, is next year's, not this year's.
 */
export function bucketOf(plan: string | null, at = new Date()): 'month' | 'year' | 'next' | 'someday' | null {
  if (!plan) return null
  if (plan === 'someday') return 'someday'
  if (Number(plan.slice(0, 4)) > dayjs(at).year()) return 'next'
  if (plan.length === 7) return plan <= monthKey(at) ? 'month' : 'year'
  return 'year'
}

/** A part of the words that was read as something, by where it sits in them. */
export type Span = { from: number; to: number; kind: 'date' | 'deadline' | 'repeat' | 'priority' | 'plan' | 'notify' | 'length' }
/** How a task tells you its time has come, over the setting: "!pull", "!quiet" or "!alert". */
export type Notify = 'pull' | 'quiet' | 'alerts'
export type ReadTask = {
  title: string
  /** When you mean to do it: "Scheduled". */
  due: string | null
  allDay: boolean
  recurrence: string | null
  until: string | null
  /** When it must be done by: "Due by", from "by friday". */
  deadline: string | null
  deadlineTimed: boolean
  /** 0 to 4, as in PRIORITY_NAMES. */
  priority: number
  /** "someday", "2026-10" or "2026", from "someday", "this month", "next year". */
  plan: string | null
  /** Its own reminder level, from a trailing "!alert", "!quiet" or "!pull"; null keeps the setting. */
  notify: Notify | null
  /** How long it should take, in minutes, from "~30m" or "~1h": null when not said. */
  estimate: number | null
  spans: Span[]
}

/**
 * "~30m", "~1h", "~1h30m", "~1.5h", "~90 min": how long a task should take,
 * in minutes. The tilde is what says it, so "read 20 min" stays in the name.
 */
export const LENGTH_SAID = /(?:^|\s)(~\s?(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|m|mins?|minutes?)(?:\s*(\d+)\s*(?:m|mins?|minutes?))?)(?=\s|$|[,.;!])/i
export function minutesOf(said: string): number | null {
  const match = LENGTH_SAID.exec(` ${said.trim()}`)
  if (!match) return null
  const n = Number(match[2])
  const minutes = Math.round(/^h/i.test(match[3]) ? n * 60 + Number(match[4] ?? 0) : n)
  return minutes >= 1 && minutes <= 24 * 60 ? minutes : null
}

/** Words that only ever follow a verb: "#figure out", "#look up the times", "#sort the post". */
const AFTER_A_VERB = /^(?:out|up|down|off|over|back|about|through|around|away|into|onto|to|the|a|an|my|our|your|their|his|her|its|it|this|that|these|those|me|him|them|us|why|how|what|whether)\b/i

/**
 * A #tag at the front of a task's words, read as a person meant it. The
 * punctuation that only parted the tag from the rest goes: "#work, send the
 * invoice" is "#work send the invoice", never a task named ", send the
 * invoice". Given the tags already in use, a #word that is not one of them
 * and runs on into the sentence ("#figure out how to pay myself") is the
 * sentence's first word, kept in the title without its #, so no one-off tag
 * is made of a verb and the title still reads whole.
 */
export function leadingTag(title: string, known?: (tag: string) => boolean): string {
  const match = /^#([a-z][\w-]*)(\s*(?:[,;:]|[-–—](?=\s)))?\s+/i.exec(title)
  if (!match) return title
  const rest = title.slice(match[0].length)
  if (known && !match[2] && AFTER_A_VERB.test(rest) && !known(match[1].toLowerCase())) return `${match[1]} ${rest}`
  return `#${match[1]} ${rest}`
}

/**
 * A task from one line of text: "collect parcel tomorrow 5pm", "water the
 * plants every! 3 days", "file taxes by friday !!", "learn welsh someday".
 * Each part found is blanked out where it stood rather than cut, so the spans
 * still point at the words as typed; the title is what is left.
 */
export function readTask(text: string, at = new Date(), plain: { from: number; to: number }[] = []): ReadTask {
  // Words you said to keep as plain text: covered while reading, so nothing
  // is taken from them, and put back for the title.
  const kept = plain.filter((one) => one.from >= 0 && one.to <= text.length && one.from < one.to)
  let rest = kept.reduce((words, one) => words.slice(0, one.from) + '\uE000'.repeat(one.to - one.from) + words.slice(one.to), text)
  const spans: Span[] = []
  const take = (from: number, to: number, kind: Span['kind']): void => {
    spans.push({ from, to, kind })
    rest = rest.slice(0, from) + ' '.repeat(to - from) + rest.slice(to)
  }
  const find = (pattern: RegExp): RegExpExecArray | null => pattern.exec(rest)

  // The ways people say a repeat without the word "every". "Weekly" and the
  // rest are a repeat only where they say when: at the end, or before a
  // when-word ("weekly on monday"). Before a noun or after "the" they are part
  // of the name: "write the weekly review", "weekly review notes".
  const said = (word: string): RegExp =>
    new RegExp(`(?<!every\\s)(?<!\\b(?:the|a|an|my|our|your|this|that|his|her|their)\\s)\\b(?:${word})\\b(?=\\s*$|\\s*[,.;!]|\\s+(?:on|at|from|until|by|before|due|starting|in|p[1-4])\\b)`, 'i')
  let recurrence: string | null = null
  for (const [pattern, rule] of [
    [/(?<!every\s)\b(?:on\s+)?weekdays\b/i, 'every weekday'],
    [said('daily'), 'every day'],
    [said('weekly'), 'every week'],
    [said('monthly'), 'every month'],
    [said('yearly|annually'), 'every year']
  ] as const) {
    const match = find(pattern)
    if (!match || recurrence) continue
    recurrence = rule
    take(match.index, match.index + match[0].length, 'repeat')
  }
  // "until December": a series can end. Read first, so its date is not the due date.
  const ending = find(/\buntil\s+(.+)$/i)
  const until = ending ? chrono.parseDate(ending[1], at, { forwardDate: true }) : null
  if (ending && until) take(ending.index, ending.index + ending[0].trimEnd().length, 'repeat')
  const repeat = find(RECURRENCE)
  if (repeat && !recurrence) {
    recurrence = repeat[0]
    take(repeat.index, repeat.index + repeat[0].length, 'repeat')
  }

  // Its own reminder level: "!alert", "!quiet", "!pull". A word straight after
  // the !, so it never reads as a priority's !s on their own.
  let notify: Notify | null = null
  const level = find(/(?:^|\s)(!(pull|quiet|alerts?))(?=\s|$)/i)
  if (level) {
    notify = level[2].toLowerCase().startsWith('alert') ? 'alerts' : (level[2].toLowerCase() as Notify)
    const from = level.index + level[0].length - level[1].length
    take(from, from + level[1].length, 'notify')
  }

  // How long it takes, said with a tilde: "~30m", "~1h". Read before the bare
  // lengths below, which only keep a length in the name.
  let estimate: number | null = null
  const sized = find(LENGTH_SAID)
  if (sized) {
    const minutes = minutesOf(sized[1])
    if (minutes) {
      estimate = minutes
      const from = sized.index + sized[0].length - sized[1].length
      take(from, from + sized[1].length, 'length')
    }
  }

  // Priority as Todoist types it: p1 to p4, or one to three !s on their own.
  let priority = 0
  const flag = find(/(?:^|\s)(!{1,3}|p[1-4])(?=\s|$)/i)
  if (flag) {
    priority = flag[1].startsWith('!') ? 4 - flag[1].length : Number(flag[1][1])
    const from = flag.index + flag[0].length - flag[1].length
    take(from, from + flag[1].length, 'priority')
  }

  // A when with no day: put it somewhere later without pretending to a date.
  let plan: string | null = null
  const later = find(/\b(someday|some day|this month|next month|this year|next year)\b/i)
  if (later) {
    const word = later[1].toLowerCase()
    const next = dayjs(at).add(word === 'next month' ? 1 : 0, 'month')
    plan = word.endsWith('day') ? 'someday' : word.endsWith('month') ? monthKey(next.toDate()) : String(dayjs(at).add(word === 'next year' ? 1 : 0, 'year').year())
    take(later.index, later.index + later[0].length, 'plan')
  }

  // Each date found, with whether "by", "due" or "before" came first: that
  // one is when it must be done by, the other when you mean to do it.
  // A repeat has no deadline: "every week by friday" starts on Friday, so the
  // series keeps one date to move on.
  type Found = { index: number; length: number; date: Date; timed: boolean; by: boolean; timeOnly?: boolean }
  const dates: Found[] = []
  const lead = (index: number): RegExpExecArray | null => /\b(?:due\s+by|by|due|before)\s+$/i.exec(rest.slice(0, index))
  const add = (index: number, length: number, date: Date, timed: boolean, timeOnly = false): void => {
    const by = lead(index)
    const from = by ? by.index : index
    dates.push({ index: from, length: index + length - from, date, timed, by: !!by && !recurrence, timeOnly })
    take(from, index + length, by && !recurrence ? 'deadline' : 'date')
  }
  // Said as words: end of the day is five, end of the week is Friday at five.
  // Tonight and this evening are at eight.
  for (const [pattern, said] of [[/\b(?:eod|end of (?:the )?day)\b/i, 'today 5pm'], [/\b(?:eow|end of (?:the )?week)\b/i, 'friday 5pm'], [/\b(?:tonight|this evening)\b/i, 'today 8pm']] as const) {
    const match = find(pattern)
    const date = match && chrono.parseDate(said, at, { forwardDate: true })
    if (match && date) add(match.index, match[0].length, date, true)
  }
  // "on the 1st": the next time the month reaches that day. Only with "on",
  // so "read the 2nd chapter" stays a title. The time, if any, comes after.
  const ordinal = find(/\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)\b/i)
  let onDay: Found | null = null
  if (ordinal) {
    const day = Number(ordinal[1])
    // A month too short for the day takes its last one: the 31st in
    // November is the 30th, the 30th in February the 28th, never March.
    const month = dayjs(at).startOf('month').add(dayjs(at).date() > day ? 1 : 0, 'month')
    add(ordinal.index, ordinal[0].length, month.date(Math.min(day, month.daysInMonth())).toDate(), false)
    onDay = dates[dates.length - 1]
  }
  // How long it takes is not when: "10 min walk every day", "read 20 min
  // tomorrow". A bare length is covered while the dates are read, and kept in
  // the name; "in 10 min" is still a time from now.
  const lengths: { from: number; to: number }[] = []
  for (const match of rest.matchAll(/(?<!\b(?:in|within|after)\s+)\b\d+(?:[.,]\d+)?\s*(?:m|mins?|minutes?|h|hrs?|hours?|secs?|seconds?)\b/gi)) {
    lengths.push({ from: match.index, to: match.index + match[0].length })
    rest = rest.slice(0, match.index) + ''.repeat(match[0].length) + rest.slice(match.index + match[0].length)
  }
  for (const found of chrono.parse(rest, at, { forwardDate: true }).slice(0, 2)) {
    // "on the 1st at 3pm": the day from the ordinal, the time from chrono.
    const timeOnly = found.start.isCertain('hour') && !found.start.isCertain('day') && !found.start.isCertain('weekday')
    // "call Sam at 3": a bare 1 to 6 with no am or pm is the afternoon, as a
    // calendar reads it, never 3 in the night. A time alone is then the next
    // 3pm to come; with a day, that day's.
    const bare = found.start.isCertain('hour') && !found.start.isCertain('meridiem') && !/\b0\d[:.]/.test(found.text) && (found.start.get('hour') ?? 0) >= 1 && (found.start.get('hour') ?? 0) <= 6
    const hour = (found.start.get('hour') ?? 9) + (bare ? 12 : 0)
    let date = found.start.date()
    if (bare) {
      const same = dayjs(timeOnly ? at : date).hour(hour).minute(found.start.get('minute') ?? 0).startOf('minute')
      date = (timeOnly && !same.isAfter(at) ? same.add(1, 'day') : same).toDate()
    }
    if (onDay && timeOnly) {
      onDay.date.setHours(found.start.isCertain('hour') ? hour : 9, found.start.get('minute') ?? 0)
      onDay.timed = true
      take(found.index, found.index + found.text.length, onDay.by ? 'deadline' : 'date')
    } else add(found.index, found.text.length, date, found.start.isCertain('hour'), timeOnly)
  }

  const deadlineAt = dates.find((one) => one.by)
  const scheduled = dates.find((one) => !one.by)
  let due = scheduled?.date ?? null
  // A series of named days starts on the first of them, today included.
  const rule = recurrence ? (RECURRENCE.exec(recurrence)?.[2] ?? '') : ''
  const named = /^weekdays?$/i.test(rule) ? [1, 2, 3, 4, 5] : namedDays(rule)
  if (!due && named.length) {
    let day = dayjs(at)
    while (!named.includes(day.day())) day = day.add(1, 'day')
    due = day.toDate()
  }
  if (!due && recurrence) due = new Date(at)
  const allDay = !!due && !scheduled?.timed
  if (due && allDay) due.setHours(9, 0, 0, 0)
  const deadline = deadlineAt ? new Date(deadlineAt.date) : null
  if (deadline && !deadlineAt?.timed) deadline.setHours(9, 0, 0, 0)
  // "call mom tomorrow by 5pm": a time alone is on the day it is scheduled.
  if (deadline && deadlineAt?.timeOnly && scheduled) {
    const on = dayjs(scheduled.date)
    deadline.setTime(dayjs(deadline).year(on.year()).month(on.month()).date(on.date()).valueOf())
  }

  // A word left hanging where a date was taken out: "email Sam on". Only
  // then, so "sign up for" keeps its "for".
  for (const one of [...kept, ...lengths]) rest = rest.slice(0, one.from) + text.slice(one.from, one.to) + rest.slice(one.to)
  let title = rest.replace(/\s+/g, ' ').trim()
  if (dates.length) title = title.replace(/\s+(?:by|on|at|due|before|for|from)$/i, '').trim()
  // A sentence's own full stop, left alone where the date before it was taken: "Draft the intro on Saturday." is "Draft the intro."
  if (dates.length) title = title.replace(/(?:\s+(?:by|on|at|due|before|for|from))?[\s,;:]+([.!?]+)$/i, '$1').trim()
  // Punctuation that only joined a taken word to the rest: "Someday: learn
  // Welsh", "call Sam, tomorrow".
  title = title.replace(/^(?:[:;,]|[-–—](?=\s))\s*/, '').replace(/\s*[:;,]$/, '').trim()
  title = leadingTag(title)
  // A date word taken from the front leaves the next word starting the
  // title: "every monday water plants" is "Water plants". Words typed in
  // lowercase anywhere else are left as typed.
  const start = text.search(/\S/)
  if (start >= 0 && rest[start] === ' ') title = title.charAt(0).toUpperCase() + title.slice(1)
  return {
    title,
    due: due?.toISOString() ?? null,
    allDay,
    recurrence,
    until: until?.toISOString() ?? null,
    deadline: deadline?.toISOString() ?? null,
    deadlineTimed: !!deadlineAt?.timed,
    priority,
    // A day wins over a vaguer when.
    plan: due ? null : plan,
    notify,
    estimate,
    spans: spans.sort((a, b) => a.from - b.from)
  }
}

/**
 * Eisenhower's four. Urgent is late, or scheduled or due by within two days
 * (today, tomorrow or the day after); important is the important flag.
 */
export type Quadrant = 'do' | 'plan' | 'handoff' | 'drop'
export const isUrgent = (task: { dueAt: string | null; deadline: string | null }, at = new Date()): boolean => {
  const soon = dayjs(at).startOf('day').add(3, 'day').valueOf()
  return [task.dueAt, task.deadline].some((one) => !!one && new Date(one).getTime() < soon)
}
export function quadrantOf(task: { dueAt: string | null; deadline: string | null; important: number | boolean }, at = new Date()): Quadrant {
  const urgent = isUrgent(task, at)
  return task.important ? (urgent ? 'do' : 'plan') : urgent ? 'handoff' : 'drop'
}
