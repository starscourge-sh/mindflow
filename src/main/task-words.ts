import * as chrono from 'chrono-node'

/**
 * Reading a task out of one line of words, Todoist's way. Shared: the main
 * process makes the task from it, and the box and the add fields read it as
 * you type, to show the date it understood and light up the words it took.
 */

// Named days, alone or listed: "every mon, wed", "every tuesday and friday".
const DAY = '(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*'
export const RECURRENCE = new RegExp(`\\bevery(!)?\\s+(day|weekday|week|month|year|\\d+\\s+(?:days?|weeks?|months?)|${DAY}(?:\\s*(?:,|and|&)\\s*${DAY})*)\\b`, 'i')
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
/** The days of the week a "every mon, wed" rule falls on, or none. */
const namedDays = (unit: string): number[] =>
  /^(?:mon|tue|wed|thu|fri|sat|sun)/i.test(unit) ? [...unit.toLowerCase().matchAll(/(mon|tue|wed|thu|fri|sat|sun)/g)].map((m) => DAYS.indexOf(m[1])) : []

/** The next date in a series, from `from`. `every 3 days`, `every weekday`, `every mon, wed`. */
export function advance(from: Date, rule: string): Date {
  const next = new Date(from)
  const [, , unit] = RECURRENCE.exec(rule) ?? []
  const count = Number(/\d+/.exec(unit ?? '')?.[0] ?? 1)
  const named = namedDays(unit ?? '')
  if (named.length) do next.setDate(next.getDate() + 1); while (!named.includes(next.getDay()))
  else if (/day/.test(unit) && !/weekday/.test(unit)) next.setDate(next.getDate() + count)
  else if (/weekday/.test(unit)) do next.setDate(next.getDate() + 1); while ([0, 6].includes(next.getDay()))
  else if (/week/.test(unit)) next.setDate(next.getDate() + 7 * count)
  else if (/month/.test(unit)) next.setMonth(next.getMonth() + count)
  else if (/year/.test(unit)) next.setFullYear(next.getFullYear() + 1)
  return next
}

/** Linear's four, by number: 1 is Urgent, 4 is Low, 0 is none. */
export const PRIORITY_NAMES = ['No priority', 'Urgent', 'High', 'Medium', 'Low'] as const

/** "2026-10" for a month, "2026" for a year, or "someday": a when without a day. */
export const monthKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

/** Which of the three later lists a plan sits in today. A month gone by is still this month's, so nothing slips off. */
export function bucketOf(plan: string | null, at = new Date()): 'month' | 'year' | 'someday' | null {
  if (!plan) return null
  if (plan === 'someday') return 'someday'
  if (plan.length === 7) return plan <= monthKey(at) ? 'month' : 'year'
  return 'year'
}

/** A part of the words that was read as something, by where it sits in them. */
export type Span = { from: number; to: number; kind: 'date' | 'deadline' | 'repeat' | 'priority' | 'plan' }
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
  spans: Span[]
}

/**
 * A task from one line of text: "collect parcel tomorrow 5pm", "water the
 * plants every! 3 days", "file taxes by friday !!", "learn welsh someday".
 * Each part found is blanked out where it stood rather than cut, so the spans
 * still point at the words as typed; the title is what is left.
 */
export function readTask(text: string, at = new Date()): ReadTask {
  let rest = text
  const spans: Span[] = []
  const take = (from: number, to: number, kind: Span['kind']): void => {
    spans.push({ from, to, kind })
    rest = rest.slice(0, from) + ' '.repeat(to - from) + rest.slice(to)
  }
  const find = (pattern: RegExp): RegExpExecArray | null => pattern.exec(rest)

  // The ways people say a repeat without the word "every".
  let recurrence: string | null = null
  for (const [pattern, rule] of [
    [/(?<!every\s)\b(?:on\s+)?weekdays\b/i, 'every weekday'],
    [/(?<!every\s)\bdaily\b/i, 'every day'],
    [/(?<!every\s)\bweekly\b/i, 'every week'],
    [/(?<!every\s)\bmonthly\b/i, 'every month'],
    [/(?<!every\s)\b(?:yearly|annually)\b/i, 'every year']
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
    const next = new Date(at.getFullYear(), at.getMonth() + (word === 'next month' ? 1 : 0), 1)
    plan = word.endsWith('day') ? 'someday' : word.endsWith('month') ? monthKey(next) : String(at.getFullYear() + (word === 'next year' ? 1 : 0))
    take(later.index, later.index + later[0].length, 'plan')
  }

  // Each date found, with whether "by", "due" or "before" came first: that
  // one is when it must be done by, the other when you mean to do it.
  type Found = { index: number; length: number; date: Date; timed: boolean; by: boolean }
  const dates: Found[] = []
  const lead = (index: number): RegExpExecArray | null => /\b(?:due\s+by|by|due|before)\s+$/i.exec(rest.slice(0, index))
  const add = (index: number, length: number, date: Date, timed: boolean): void => {
    const by = lead(index)
    const from = by ? by.index : index
    dates.push({ index: from, length: index + length - from, date, timed, by: !!by })
    take(from, index + length, by ? 'deadline' : 'date')
  }
  // Said as words: end of the day is five, end of the week is Friday at five.
  for (const [pattern, said] of [[/\b(?:eod|end of (?:the )?day)\b/i, 'today 5pm'], [/\b(?:eow|end of (?:the )?week)\b/i, 'friday 5pm']] as const) {
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
    // Built whole, month and day together, so the 31st never spills over.
    add(ordinal.index, ordinal[0].length, new Date(at.getFullYear(), at.getMonth() + (at.getDate() > day ? 1 : 0), day), false)
    onDay = dates[dates.length - 1]
  }
  for (const found of chrono.parse(rest, at, { forwardDate: true }).slice(0, 2)) {
    // "on the 1st at 3pm": the day from the ordinal, the time from chrono.
    const timeOnly = found.start.isCertain('hour') && !found.start.isCertain('day') && !found.start.isCertain('weekday')
    if (onDay && timeOnly) {
      onDay.date.setHours(found.start.get('hour') ?? 9, found.start.get('minute') ?? 0)
      onDay.timed = true
      take(found.index, found.index + found.text.length, onDay.by ? 'deadline' : 'date')
    } else add(found.index, found.text.length, found.start.date(), found.start.isCertain('hour'))
  }

  const deadlineAt = dates.find((one) => one.by)
  const scheduled = dates.find((one) => !one.by)
  let due = scheduled?.date ?? null
  // A series of named days starts on the first of them, today included.
  const named = namedDays(recurrence ? (RECURRENCE.exec(recurrence)?.[2] ?? '') : '')
  if (!due && named.length) {
    due = new Date(at)
    while (!named.includes(due.getDay())) due.setDate(due.getDate() + 1)
  }
  if (!due && recurrence) due = new Date(at)
  const allDay = !!due && !scheduled?.timed
  if (due && allDay) due.setHours(9, 0, 0, 0)
  const deadline = deadlineAt ? new Date(deadlineAt.date) : null
  if (deadline && !deadlineAt?.timed) deadline.setHours(9, 0, 0, 0)

  // A word left hanging where a date was taken out: "email Sam on". Only
  // then, so "sign up for" keeps its "for".
  let title = rest.replace(/\s+/g, ' ').trim()
  if (dates.length) title = title.replace(/\s+(?:by|on|at|due|before|for|from)$/i, '').trim()
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
    spans: spans.sort((a, b) => a.from - b.from)
  }
}
