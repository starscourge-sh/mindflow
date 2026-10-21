import * as chrono from 'chrono-node'
import type { ParsedComponents } from 'chrono-node'
import dayjs from 'dayjs'

// What a #tag is, as in tag-words.ts (test/tag-words.test.ts keeps the two the same):
// written out here because node's test runner loads this file on its own.
export const TAG_HERE = String.raw`[\p{L}\p{Extended_Pictographic}][\p{L}\p{M}\p{N}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f\u20e3_-]*`

// --- dates read out of words

/**
 * Short forms chrono does not know, said as it knows them. Sure: "tmrw",
 * "tues", "2 wks" mean one thing. Each is swapped only for the reading; the
 * words as typed are what is lit and kept.
 */
const SHORT: [RegExp, string][] = [
  [/\b(?:tmrw?|tmw|tmrrw|2moro|2mor+ow|2mrw|tomoz)\b/gi, 'tomorrow'],
  [/\btues\b/gi, 'tuesday'],
  [/\bweds\b/gi, 'wednesday'],
  [/\bwks\b/gi, 'weeks'],
  [/\bwk\b/gi, 'week'],
  [/\b(?:a )?fortnight\b/gi, '2 weeks'],
  [/\bnxt\b/gi, 'next'],
  [/\b(?:this )?coming(?= (?:mon|tue|wed|thu|fri|sat|sun))/gi, 'this'],
  [/\bmidday\b/gi, 'noon'],
  [/\blater today\b/gi, 'today']
]
/** Slips of the keys: read as the word they nearly are, and always marked as a guess. */
const SLIPS: [RegExp, string][] = [
  [/\b(?!tomorrow\b)(?:tom+or+ow|tomor+w|tomr+ow|tmor+ow|tomoro|tomrw|tomorow)\b/gi, 'tomorrow'],
  [/\b(?:tody|tdy|todya)\b/gi, 'today'],
  [/\b(?:mondy|monady|mnday|moday)\b/gi, 'monday'],
  [/\b(?:tuseday|tusday|tuesdy|teusday|tueday|tuesay)\b/gi, 'tuesday'],
  [/\b(?:wensday|wendsday|wednsday|wedensday|wednesay|wedsday|wenesday|wednseday|wedneday)\b/gi, 'wednesday'],
  [/\b(?:thrusday|thurday|thursdy|thusday|thurdsay|thursay)\b/gi, 'thursday'],
  [/\b(?:firday|fridy|frday|friady|fiday)\b/gi, 'friday'],
  [/\b(?:saturdy|satuday|saterday|satruday|saturay)\b/gi, 'saturday'],
  [/\b(?:sundy|sunady|sundya)\b/gi, 'sunday'],
  [/\b(?:janurary|januray|janaury)\b/gi, 'january'],
  [/\b(?:febuary|feburary|febrary|februrary)\b/gi, 'february'],
  [/\b(?:agust|augst)\b/gi, 'august'],
  [/\b(?:septmber|setpember|sepember)\b/gi, 'september'],
  [/\b(?:ocotber|octber|octobre)\b/gi, 'october'],
  [/\b(?:novmber|novemebr|novembre)\b/gi, 'november'],
  [/\b(?:decmber|decemebr|decembre)\b/gi, 'december'],
  [/\bnetx\b/gi, 'next']
]
/** A day word, then an hour with nothing after it: "tmrw 3", "fri 10.30". Read as "at 3". */
const DAY_THEN_HOUR = /\b(?:today|tomorrow|tmrw?|tonight|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)(\s+)(?:(?:1[0-2]|0?[1-9])|(?:[01]?\d|2[0-3])[.:][0-5]\d)(?=\s*$|\s*[,;!?]|\s*\.(?:\s|$))/gi

type Edit = { from: number; to: number; with: string; slip: boolean }
/** The words as chrono should read them, and where each of its letters came from in the words as typed. */
function mend(text: string): { fixed: string; starts: number[]; ends: number[]; edits: Edit[] } {
  const edits: Edit[] = []
  const free = (from: number, to: number): boolean => !edits.some((one) => one.from < to && one.to > from)
  for (const [list, slip] of [[SHORT, false], [SLIPS, true]] as const)
    for (const [pattern, word] of list)
      for (const match of text.matchAll(pattern)) if (free(match.index, match.index + match[0].length)) edits.push({ from: match.index, to: match.index + match[0].length, with: word, slip })
  for (const match of text.matchAll(DAY_THEN_HOUR)) {
    const from = match.index + match[0].indexOf(match[1], 1)
    if (free(from, from + match[1].length)) edits.push({ from, to: from + match[1].length, with: ' at ', slip: false })
  }
  edits.sort((a, b) => a.from - b.from)
  let fixed = ''
  const starts: number[] = []
  const ends: number[] = []
  let at = 0
  for (const one of [...edits, { from: text.length, to: text.length, with: '', slip: false }]) {
    for (; at < one.from; at++) (fixed += text[at], starts.push(at), ends.push(at + 1))
    for (const letter of one.with) (fixed += letter, starts.push(one.from), ends.push(one.to))
    at = one.to
  }
  return { fixed, starts, ends, edits }
}

/** A date chrono found in the words: where it sits in them as typed, the moment, and why it is only a guess, if it is. */
export type DateFound = { index: number; text: string; date: Date; start: ParsedComponents; guess?: string }

/**
 * Every date in the words, read the British way (1/11 is the 1st of
 * November), the next one to come. A reading that could as well have been
 * another says so in `guess`, so it is shown as one and never set silently.
 */
export function datesIn(text: string, at = new Date()): DateFound[] {
  const { fixed, starts, ends, edits } = mend(text)
  return chrono.en.GB.parse(fixed, at, { forwardDate: true }).map((found) => {
    const from = starts[found.index]
    const to = ends[found.index + found.text.length - 1]
    let date = found.start.date()
    // "this morning" read after the morning is still this morning, not tomorrow's.
    if (/^this (?:morning|afternoon)$/i.test(found.text) && !dayjs(date).isSame(at, 'day')) date = dayjs(at).hour(dayjs(date).hour()).minute(0).toDate()
    // "oct 30" is the 30th of October, never October 2030.
    const monthDay = /^([a-z]+)\.?\s+(\d{2})$/i.exec(found.text)
    if (monthDay && found.start.isCertain('year')) date = chrono.en.GB.parseDate(`${monthDay[2]} ${monthDay[1]}`, at, { forwardDate: true }) ?? date
    const slip = edits.find((one) => one.slip && one.from < to && one.to > from)
    const said = text.slice(from, to)
    let guess: string | undefined
    if (slip) guess = `Read “${text.slice(slip.from, slip.to)}” as ${slip.with}`
    // "1/11": the 1st of November, or January the 11th.
    const numbers = /\d{4}-\d/.test(found.text) ? null : /(?<![\d/.-])(\d{1,2})[/.-](\d{1,2})(?!\d)/.exec(found.text)
    if (!guess && numbers && !/[:]/.test(found.text) && Number(numbers[1]) <= 12 && Number(numbers[2]) <= 12 && numbers[1] !== numbers[2] && !/^\d{1,2}\.\d{2}$/.test(found.text.trim()))
      guess = `Read ${numbers[0]} as ${dayjs(date).format('D MMMM')}, the day first`
    // "next friday" said before this week's Friday: that one, or the week after's?
    const next = /^next\s+((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)/i.exec(fixed.slice(found.index, found.index + found.text.length))
    if (!guess && next && dayjs(date).subtract(7, 'day').isAfter(at, 'day'))
      guess = `Read as ${dayjs(date).format('ddd D MMM')}, next week's. Say “this ${next[1].slice(0, 3).toLowerCase()}” for ${dayjs(date).subtract(7, 'day').format('D MMM')}`
    return { index: from, text: said, date, start: found.start, ...(guess && { guess }) }
  })
}

/**
 * Reading a task out of one line of words, Todoist's way. Shared: the main
 * process makes the task from it, and the box and the add fields read it as
 * you type, to show the date it understood and light up the words it took.
 */

// Named days, alone or listed: "every mon, wed", "every tuesday and friday".
// Not "month", which starts like Monday.
const DAY = '(?:mon(?!th)|tue|wed|thu|fri|sat|sun)[a-z]*'
export const RECURRENCE = new RegExp(`\\bevery(!)?\\s+(day|weekday|week|month|year|\\d+\\s+(?:days?|weeks?|months?)|last\\s+${DAY}|${DAY}(?:\\s*(?:,|and|&)\\s*${DAY})*)\\b`, 'i')
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
/** The days of the week a "every mon, wed" rule falls on, or none. */
/** "every last friday": the weekday a month's last-of rule falls on, or -1. */
const lastDay = (unit: string): number => {
  const said = /^last\s+(mon|tue|wed|thu|fri|sat|sun)/i.exec(unit)
  return said ? DAYS.indexOf(said[1].toLowerCase()) : -1
}
/** That weekday's last day in the month `month` falls in, at the time it has. */
const lastIn = (month: dayjs.Dayjs, weekday: number): dayjs.Dayjs => {
  let day = month.date(month.daysInMonth())
  while (day.day() !== weekday) day = day.subtract(1, 'day')
  return day
}
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
  const last = lastDay(unit ?? '')
  if (last >= 0) {
    // The last Friday of the month after this one's, or of this month if that is still to come.
    const here = lastIn(next, last)
    return (here.isAfter(next, 'day') ? here : lastIn(next.date(1).add(1, 'month'), last)).toDate()
  }
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

/** "3 days before", "1 week before": a get-ready lead said as the menus say it. */
export const readySaid = (days: number): string =>
  days % 7 ? `${days} ${days === 1 ? 'day' : 'days'} before` : `${days / 7} ${days === 7 ? 'week' : 'weeks'} before`

/** A part of the words that was read as something, by where it sits in them. */
export type Span = {
  from: number
  to: number
  kind: 'date' | 'deadline' | 'repeat' | 'priority' | 'plan' | 'notify' | 'length' | 'snooze' | 'ready'
  /** Why this reading is only a guess ("Read “tomorow” as tomorrow"): shown, never set silently. */
  guess?: string
  /** A deadline said as a week, "this week" or "next week": said so, not as its last day. */
  week?: 'this week' | 'next week'
}
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
  /** Out of sight until this day ("2026-11-03"), from "show again monday" or "snooze until 3 nov". */
  snooze: string | null
  /** How many days before its due-by date it comes up to get ready for, from "get ready 1 week before". */
  getReady: number | null
  spans: Span[]
}

/**
 * "~30m", "~1h", "~1h30m", "~1.5h", "~90 min", "~2p" (pomodoros): how long a task should take,
 * in minutes. The tilde is what says it, so "read 20 min" stays in the name.
 */
export const LENGTH_SAID = /(?:^|\s)(~\s?(\d+(?:\.\d+)?)\s*(pomodoros?|poms?|p|h|hrs?|hours?|m|mins?|minutes?)(?:\s*(\d+)\s*(?:m|mins?|minutes?))?)(?=\s|$|[,.;!])/i
/** One pomodoro: 25 minutes, so "~2p" or "~3 pomodoros" is a length like any other. */
export const POMODORO = 25
export function minutesOf(said: string): number | null {
  const match = LENGTH_SAID.exec(` ${said.trim()}`)
  if (!match) return null
  const n = Number(match[2])
  const minutes = Math.round(/^p/i.test(match[3]) ? n * POMODORO : /^h/i.test(match[3]) ? n * 60 + Number(match[4] ?? 0) : n)
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
  const match = new RegExp(String.raw`^#(${TAG_HERE})(\s*(?:[,;:]|[-–—](?=\s)))?\s+`, 'u').exec(title)
  if (!match) return title
  const rest = title.slice(match[0].length)
  if (known && !match[2] && AFTER_A_VERB.test(rest) && !known(match[1].toLowerCase())) return `${match[1]} ${rest}`
  return `#${match[1]} ${rest}`
}

/** Words after a day's name that keep it a day: "sat 11am", "sun at 3", "fri next week", "mon and tue". */
const DAY_GOES_ON = /^\s*(?:$|[,.;:!?)]|\d|(?:at|by|on|in|and|or|to|until|till|from|before|after|am|pm|morning|afternoon|evening|night|noon|midday|midnight|next|this|week|p[1-4]|every|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)\b|[~!#@-])/i
/**
 * What chrono reads as a date that a person meant as words: "the friday
 * newsletter", "sun cream", "sat nav", "march of the penguins", "the august
 * issue", "plan the week ahead", "a weekend bag".
 */
function notADate(said: string, before: string, after: string): boolean {
  const word = said.trim().replace(/,$/, '')
  // A day or month after "the", "a" or "my" names a thing: "the friday newsletter".
  if (/\b(?:the|a|an|my|our|your|his|her|their|its)\s+$/i.test(before) && /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|week|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)$/i.test(word)) return true
  if ((/\bthe\s+$/i.test(before) && /^[a-z]+\s*-\s*[a-z]+$/i.test(word)) || /^the\s+[a-z]+\s*-\s*[a-z]+$/i.test(word)) return true
  // "the mon-fri rota": a span of days named as a thing, either half of it.
  if (/\bthe\s+[a-z]+\s*-\s*$/i.test(before) || (/\bthe\s+$/i.test(before) && /^\s*-/.test(after))) return true
  // "week" on its own is no day: "this week" and "next week" say which. Nor
  // is "the weekend", unless it is when: "on the weekend", "by the weekend".
  if (/^(?:the\s+)?week$/i.test(word)) return true
  if (/^(?:the\s+)?weekend$/i.test(word) && !/\b(?:on|by|over|at|for|during|before|until)\s+(?:the\s+)?$/i.test(before)) return true
  // "a day" is how often, not when: "read 2 chapters a day".
  if (/^(?:a|one)\s+(?:day|week|month|year)$/i.test(word)) return true
  // "sun", "sat" and "wed" before a word that is not when are words: "sun cream", "sat nav".
  if (/^(?:sun|sat|wed)$/i.test(word) && !/\bon\s+$/i.test(before) && !DAY_GOES_ON.test(after)) return true
  // A month's name alone, with no day, is a date only once it says when: "in march", "by august".
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+of)?$/i.test(word) && !/\b(?:in|by|until|till|before|for|during|next|this|early|late|mid|end of|start of)\s+$/i.test(before)) return true
  return false
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
  const take = (from: number, to: number, kind: Span['kind'], more: Pick<Span, 'guess' | 'week'> = {}): void => {
    spans.push({ from, to, kind, ...more })
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
  // "on mondays": every Monday.
  const weekly = !recurrence && find(/(?<!every\s)\bon\s+(mon|tues|wednes|thurs|fri|satur|sun)days\b/i)
  if (weekly) {
    recurrence = `every ${weekly[1].toLowerCase()}day`
    take(weekly.index, weekly.index + weekly[0].length, 'repeat')
  }
  // "show again monday", "snooze until 3 nov": hidden until that day. Read
  // before "until", so its day is neither a series' end nor the due date.
  let snooze: string | null = null
  const hide = find(/\b(?:show (?:it )?again(?: on)?|snooze(?: (?:until|till))?)\s+/i)
  const back = hide && datesIn(rest.slice(hide.index + hide[0].length), at)[0]
  if (hide && back && back.index === 0) {
    // "show again monday" said on a Monday is next Monday, never today.
    const day = dayjs(back.date)
    snooze = (day.isAfter(at, 'day') ? day : day.add(back.start.isCertain('weekday') && !back.start.isCertain('day') ? 7 : 1, 'day')).format('YYYY-MM-DD')
    take(hide.index, hide.index + hide[0].length + back.text.length, 'snooze', back.guess ? { guess: back.guess } : {})
  }
  // "get ready 1 week before": comes up on Today that long before its due-by date.
  let getReady: number | null = null
  const ready = find(/\bget ready (a|an|one|\d+) (days?|weeks?) (?:before|ahead)\b/i)
  if (ready) {
    getReady = (Number(ready[1]) || 1) * (/^w/i.test(ready[2]) ? 7 : 1)
    take(ready.index, ready.index + ready[0].length, 'ready')
  }
  // "until December": a series can end. Read first, so its date is not the due date.
  const ending = find(/\buntil\s+(.+)$/i)
  const until = ending ? (datesIn(ending[1], at)[0]?.date ?? null) : null
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

  // Each date found, with whether "by", "due" or "before" came first: that
  // one is when it must be done by, the other when you mean to do it.
  // A repeat has no deadline: "every week by friday" starts on Friday, so the
  // series keeps one date to move on.
  type Found = { index: number; length: number; date: Date; timed: boolean; by: boolean; timeOnly?: boolean }
  const dates: Found[] = []
  const lead = (index: number): RegExpExecArray | null => /\b(?:due\s+by|by|due|before)\s+$/i.exec(rest.slice(0, index))
  type More = { timeOnly?: boolean; by?: boolean; guess?: string; week?: Span['week'] }
  const add = (index: number, length: number, date: Date, timed: boolean, more: More = {}): void => {
    const by = lead(index)
    const from = by ? by.index : index
    const isBy = (!!by || !!more.by) && !recurrence
    dates.push({ index: from, length: index + length - from, date, timed, by: isBy, timeOnly: more.timeOnly })
    take(from, index + length, isBy ? 'deadline' : 'date', { ...(more.guess && { guess: more.guess }), ...(more.week && isBy && { week: more.week }) })
  }
  // Said as words, worked out here rather than by chrono, which reads a week
  // as one day in it. End of the day is five, end of the week Friday at five,
  // tonight eight. "this week" is by the end of this week, Sunday, and "next
  // week" by the end of next week: a week, never one day of it.
  const today = dayjs(at).startOf('day')
  const monday = today.subtract((today.day() + 6) % 7, 'day')
  const hourOf = (day: dayjs.Dayjs, hour: number, minute = 0): Date => day.hour(hour).minute(minute).toDate()
  const named = (word: string): number => DAYS.indexOf(word.slice(0, 3).toLowerCase())
  const comingDay = (weekday: number): dayjs.Dayjs => today.add((weekday - today.day() + 7) % 7, 'day')
  const lastOf = (month: dayjs.Dayjs): dayjs.Dayjs => month.date(month.daysInMonth())
  type Said = { date: Date; timed: boolean; by?: boolean; week?: Span['week']; guess?: string }
  const WORDS: [RegExp, (match: RegExpExecArray) => Said][] = [
    [/\b(?:the\s+)?(?:eod|end of (?:the )?day)\b/i, () => ({ date: hourOf(today, 17), timed: true })],
    [/\b(?:the\s+)?day after (?:tomorrow|tmrw?|tmw)\b/i, () => ({ date: today.add(2, 'day').toDate(), timed: false })],
    [/\b(?:the\s+)?end of next week\b/i, () => ({ date: hourOf(monday.add(11, 'day'), 17), timed: true })],
    [/\b(?:the\s+)?(?:eow|end of (?:the |this )?week)\b/i, () => {
      const friday = dayjs(hourOf(comingDay(5), 17))
      return { date: (friday.isBefore(at) ? friday.add(7, 'day') : friday).toDate(), timed: true }
    }],
    [/\b(?:tonight|tonite|this evening)(?:\s+(?:at\s+)?(1[0-2]|[1-9])(?:[.:]([0-5]\d))?(?:\s*pm)?)?\b/i, (match) => {
      const hour = match[1] ? Number(match[1]) : 8
      return { date: hourOf(today, hour + (hour < 12 ? 12 : 0), Number(match[2] ?? 0)), timed: true }
    }],
    [/\b(?:the\s+)?(?:start|beginning) of next week\b|\bearly next week\b/i, () => ({ date: monday.add(7, 'day').toDate(), timed: false })],
    [/\b(?:mid|middle of)[\s-]next week\b/i, () => ({ date: monday.add(9, 'day').toDate(), timed: false })],
    [/\b(?:the\s+)?week after next\b/i, () => ({ date: monday.add(14, 'day').toDate(), timed: false })],
    [new RegExp(`\\b(?:a|one) week (?:from|after|on) (today|now|tomorrow|${DAY})\\b`, 'i'), (match) => {
      const word = match[1].toLowerCase()
      const from = word === 'today' || word === 'now' ? today : word === 'tomorrow' ? today.add(1, 'day') : comingDay(named(word))
      return { date: from.add(7, 'day').toDate(), timed: false }
    }],
    // "friday week": the British way of saying a week on Friday.
    [new RegExp(`\\b(${DAY}) week\\b`, 'i'), (match) => {
      const day = comingDay(named(match[1])).add(7, 'day')
      return { date: day.toDate(), timed: false, guess: `Read as a week on ${day.format('dddd')}, ${day.format('D MMM')}` }
    }],
    [/\b(?:(?:some ?time|later)\s+)?this week\b/i, () => ({ date: monday.add(6, 'day').toDate(), timed: false, by: true, week: 'this week' })],
    [new RegExp(`(?<!\\b(?:${DAY}|the|of|mid|middle)\\s+)\\b(?:some ?time\\s+)?n(?:e)?xt week\\b`, 'i'), () => ({ date: monday.add(13, 'day').toDate(), timed: false, by: true, week: 'next week' })],
    [/\b(?:the\s+)?end of next month\b/i, () => ({ date: lastOf(today.date(1).add(1, 'month')).toDate(), timed: false })],
    [/\b(?:the\s+)?(?:start|beginning) of next month\b/i, () => ({ date: today.date(1).add(1, 'month').toDate(), timed: false })],
    [/\b(?:the\s+)?(?:eom|end of (?:the |this )?month)\b/i, () => ({ date: lastOf(today).toDate(), timed: false })],
    [/\b(?:the\s+)?end of (?:the |this )?year\b/i, () => ({ date: today.month(11).date(31).toDate(), timed: false })]
  ]
  for (const [pattern, read] of WORDS) {
    const match = find(pattern)
    if (!match) continue
    const said = read(match)
    add(match.index, match[0].length, said.date, said.timed, { by: said.by, week: said.week, guess: said.guess })
  }
  // "first thing tomorrow": that day, at nine.
  const early = find(/(?<!\bthe\s)\bfirst thing(?: in the morning)?\b/i)
  if (early) take(early.index, early.index + early[0].length, 'date')

  // A when with no day: put it somewhere later without pretending to a date.
  let plan: string | null = null
  const later = find(/\b(someday|some day|this month|next month|this year|next year)\b/i)
  if (later) {
    const word = later[1].toLowerCase()
    const next = dayjs(at).add(word === 'next month' ? 1 : 0, 'month')
    plan = word.endsWith('day') ? 'someday' : word.endsWith('month') ? monthKey(next.toDate()) : String(dayjs(at).add(word === 'next year' ? 1 : 0, 'year').year())
    take(later.index, later.index + later[0].length, 'plan')
  }

  // "on the 1st": the next time the month reaches that day. Only with "on",
  // so "read the 2nd chapter" stays a title. The time, if any, comes after.
  const ordinal = find(/(?:\bon\s+(?:the\s+)?|(?<=\b(?:by|before|due)\s+)(?:the\s+)?)(\d{1,2})(?:st|nd|rd|th)\b(?!\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i)
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
  // "gym mon wed fri": days listed without "every". The first of them, and
  // marked as a guess, since a repeat may have been meant.
  const listed = find(new RegExp(`\\b(?:on\\s+)?${DAY}(?:\\s*(?:,|and|&|\\s)\\s*${DAY})+\\b`, 'i'))
  if (listed) {
    const first = [...listed[0].matchAll(/(mon|tue|wed|thu|fri|sat|sun)/gi)].map((one) => comingDay(named(one[1])))
    const soonest = first.reduce((a, b) => (b.isBefore(a) ? b : a))
    add(listed.index, listed[0].length, soonest.toDate(), false, { guess: `Read as ${soonest.format('dddd')} alone. Say “every ${listed[0].replace(/^on\s+/i, '')}” to repeat on each` })
  }
  // Without the blanks a word taken from the end left: a long run of them after "30 oct" reads as October alone.
  for (const found of datesIn(rest.trimEnd(), at).slice(0, 2)) {
    // A day looked back on is part of the words, not when: "the doctor's note
    // from Tuesday", "ill since Monday", "notes from last week", "2 days ago".
    const said = found.text.toLowerCase()
    const before = rest.slice(0, found.index)
    const timeAlone = found.start.isCertain('hour') && !found.start.isCertain('day') && !found.start.isCertain('weekday')
    if (/^(?:last|past|previous)\b/.test(said) || /\bago$/.test(said) || (!timeAlone && /\b(?:from|since)\s+(?:last\s+|the\s+)?$/i.test(before))) continue
    if (notADate(said, before, rest.slice(found.index + found.text.length))) continue
    // A month alone is a when with no day, as "this month" is: "in march", "for march".
    if (/^(?:in\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?$/i.test(said) && !lead(found.index)) {
      const word = /\b(?:in|for|during|sometime in|some time in)\s+$/i.exec(before)
      plan ??= monthKey(found.date)
      take(word ? word.index : found.index, found.index + found.text.length, 'plan', found.guess ? { guess: found.guess } : {})
      continue
    }
    // "on the 1st at 3pm": the day from the ordinal, the time from chrono.
    const timeOnly = found.start.isCertain('hour') && !found.start.isCertain('day') && !found.start.isCertain('weekday')
    // "call Sam at 3": a bare 1 to 6 with no am or pm is the afternoon, as a
    // calendar reads it, never 3 in the night. A time alone is then the next
    // 3pm to come; with a day, that day's.
    const bare = found.start.isCertain('hour') && !found.start.isCertain('meridiem') && !/\b0\d[:.]/.test(found.text) && (found.start.get('hour') ?? 0) >= 1 && (found.start.get('hour') ?? 0) <= 6
    const hour = (found.start.get('hour') ?? 9) + (bare ? 12 : 0)
    let date = found.date
    // A 7 or 8 with no am or pm is the morning, but could as well be the evening.
    const either = found.start.isCertain('hour') && !found.start.isCertain('meridiem') && !/\b0\d[:.]/.test(found.text) && [7, 8].includes(found.start.get('hour') ?? 0)
    const guess = found.guess ?? (bare ? `Read “${found.text.trim()}” as ${found.start.get('hour')} in the afternoon` : either ? `Read “${found.text.trim()}” as ${found.start.get('hour')} in the morning` : undefined)
    if (bare) {
      const same = dayjs(timeOnly ? at : date).hour(hour).minute(found.start.get('minute') ?? 0).startOf('minute')
      date = (timeOnly && !same.isAfter(at) ? same.add(1, 'day') : same).toDate()
    }
    if (onDay && timeOnly) {
      onDay.date.setHours(found.start.isCertain('hour') ? hour : 9, found.start.get('minute') ?? 0)
      onDay.timed = true
      take(found.index, found.index + found.text.length, onDay.by ? 'deadline' : 'date', guess ? { guess } : {})
    } else {
      // "on the 2nd of november": the "on the" goes with the day.
      const the = /^(?:\d|weekend)/.test(said) ? /(?:\b(?:on|over|during|at)\s+)?\bthe\s+$/i.exec(before) : null
      const from = the ? the.index : found.index
      add(from, found.index + found.text.length - from, date, found.start.isCertain('hour'), { timeOnly, guess })
    }
  }

  // "first thing" on the day said, or today's first thing still to come.
  if (early) {
    const day = dates.find((one) => !one.by)
    if (day && !day.timed) (day.date.setHours(9, 0, 0, 0), (day.timed = true))
    else if (!day) {
      const nine = dayjs(hourOf(today, 9))
      dates.push({ index: early.index, length: early[0].length, date: (nine.isAfter(at) ? nine : nine.add(1, 'day')).toDate(), timed: true, by: false })
    }
  }
  const deadlineAt = dates.find((one) => one.by)
  const scheduled = dates.find((one) => !one.by)
  let due = scheduled?.date ?? null
  // A series of named days starts on the first of them, today included.
  const rule = recurrence ? (RECURRENCE.exec(recurrence)?.[2] ?? '') : ''
  const series = /^weekdays?$/i.test(rule) ? [1, 2, 3, 4, 5] : namedDays(rule)
  if (!due && series.length) {
    let day = dayjs(at)
    while (!series.includes(day.day())) day = day.add(1, 'day')
    due = day.toDate()
  }
  // "every last friday" starts on this month's last Friday, or next month's once it has gone.
  if (!due && lastDay(rule) >= 0) {
    const here = lastIn(dayjs(at), lastDay(rule))
    due = (here.isBefore(at, 'day') ? lastIn(dayjs(at).date(1).add(1, 'month'), lastDay(rule)) : here).toDate()
  }
  // "every friday at 4pm": the first of those days, at that time.
  if (due && scheduled?.timeOnly && series.length) {
    let day = dayjs(due)
    while (!series.includes(day.day()) || !day.isAfter(at)) day = day.add(1, 'day')
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
  if (dates.length) title = title.replace(/\s+(?:by|on|at|@|due|before|for|from)$/i, '').trim()
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
    snooze,
    getReady,
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

// --- the Calendar's words

/**
 * Words typed into ⌘K that the Calendar answers: a day to go to ("fri",
 * "next tuesday", "3 nov", "in 2 weeks", "christmas"), and what to do with
 * the task picked on it ("move this to friday 3pm", "+1h", "make it 45
 * minutes", "every last friday", "delete", "duplicate to next week",
 * "open"). Read with readTask, the same reading a new task gets.
 */

/** Days with a name of their own, as month and day. Each is the next one to come, today included. */
const NAMED: [RegExp, number, number][] = [
  [/^christmas eve$/, 12, 24],
  [/^(?:christmas|xmas)(?: day)?$/, 12, 25],
  [/^boxing day$/, 12, 26],
  [/^new year'?s eve$/, 12, 31],
  [/^new year'?s?(?: day)?$/, 1, 1],
  [/^hall?owe'?en$/, 10, 31],
  [/^valentine'?s?(?: day)?$/, 2, 14]
]
/** A month's name alone ("may", "march") is too often the start of a word to be a day. */
const MONTH_ALONE = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*$/

/** A day (and a time, if one was said) the words mean, read as a whole: none if anything else is in them. */
export function daySaid(text: string, at = new Date()): { due: string; timed: boolean } | null {
  const words = text.trim().toLowerCase().replace(/[.!?]+$/, '').replace(/^(?:go to|goto|jump to|show(?: me)?|open)\s+/, '').trim()
  if (words.length < 3 || MONTH_ALONE.test(words)) return null
  for (const [said, month, day] of NAMED) {
    if (!said.test(words)) continue
    let when = dayjs(at).month(month - 1).date(day).hour(9).minute(0).second(0).millisecond(0)
    if (when.isBefore(at, 'day')) when = when.add(1, 'year')
    return { due: when.toISOString(), timed: false }
  }
  // A week to go to is its Monday: a task said "this week" is due by its end instead.
  const week = /^(this|next|the following) week$/.exec(words)
  if (week) {
    const day = dayjs(at).startOf('day')
    return { due: day.subtract((day.day() + 6) % 7, 'day').add(week[1] === 'this' ? 0 : 7, 'day').hour(9).toISOString(), timed: false }
  }
  const read = readTask(words, at)
  if (read.title.replace(/[\s,]+/g, '') || !read.due || read.recurrence || read.deadline) return null
  return { due: read.due, timed: !read.allDay }
}

/** Where the picked task sits now: its day and time, whether it has a time, how long it takes. */
export type Placed = { dueAt: string | null; allDay: number | boolean; estimate: number | null }

/** One thing to do to the picked task, read from the words. */
export type Command =
  | { kind: 'move'; due: string; allDay: boolean }
  | { kind: 'length'; minutes: number }
  | { kind: 'repeat'; rule: string | null; due: string | null }
  | { kind: 'copy'; due: string; allDay: boolean }
  | { kind: 'bin' }
  | { kind: 'open' }

const UNIT: Record<string, number> = { m: 1, h: 60, d: 24 * 60, w: 7 * 24 * 60 }
const unitOf = (word: string): number => UNIT[word.startsWith('mo') ? 'x' : word[0].toLowerCase()] ?? 0

/** A day said for the task: its own time kept when only a day was said and it had one. */
function landing(said: { due: string; timed: boolean }, task: Placed): { due: string; allDay: boolean } {
  if (said.timed || !task.dueAt || task.allDay) return { due: said.due, allDay: !said.timed }
  const own = dayjs(task.dueAt)
  return { due: dayjs(said.due).hour(own.hour()).minute(own.minute()).toISOString(), allDay: false }
}

/** What the words ask of the picked task, or null when they ask nothing of it. */
export function commandFor(text: string, task: Placed, at = new Date()): Command | null {
  const words = text.trim().toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ')
  if (!words) return null
  if (/^open(?: (?:it|this))?$/.test(words)) return { kind: 'open' }
  if (/^(?:delete|remove|bin|trash|drop|move (?:it |this )?to (?:the )?bin)(?: (?:it|this))?$/.test(words)) return { kind: 'bin' }
  if (/^(?:no repeat|don'?t repeat|stop repeating|never repeat)$/.test(words)) return { kind: 'repeat', rule: null, due: null }

  // "+1h", "-30m", "+2d", "push 1 hour", "1h later", "30 min earlier": the same day and time, moved by that much.
  const by = /^(?:(?:push|move|shift)(?: (?:it|this))?(?: by)? )?([+-])? ?(\d+(?:\.\d+)?) ?(m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?)( later| earlier)?$/.exec(words)
  if (by && (by[1] || by[4] || /^(?:push|move|shift)/.test(words)) && task.dueAt) {
    const minutes = Math.round(Number(by[2]) * unitOf(by[3])) * (by[1] === '-' || by[4] === ' earlier' ? -1 : 1)
    const due = dayjs(task.dueAt).add(minutes, 'minute')
    // Hours on a task with no time give it one: nine, moved by that much.
    const timedNow = !task.allDay || Math.abs(minutes) % (24 * 60) !== 0
    return { kind: 'move', due: (task.allDay && timedNow ? dayjs(task.dueAt).hour(9).minute(0).add(minutes, 'minute') : due).toISOString(), allDay: !timedNow }
  }

  // "make it 45 minutes", "45 min", "takes 1h30", "1.5 hours long".
  const long = /^(?:make it |takes? |length |for |make it take )?(\d+(?:\.\d+)? ?(?:m|mins?|minutes?|h|hrs?|hours?|p|poms?|pomodoros?)(?: ?\d+ ?(?:m|mins?|minutes?)?)?)(?: long)?$/.exec(words)
  if (long) {
    // "1h30" is an hour and thirty minutes.
    const minutes = minutesOf(`~${long[1].replace(/ /g, '').replace(/(h|hrs?|hours?)(\d+)$/, '$1$2m')}`)
    if (minutes) return { kind: 'length', minutes }
  }

  // "every last friday", "repeat every week", "daily".
  const again = /^(?:repeat |make it repeat )?(.+)$/.exec(words)![1]
  if (/^(?:every|daily|weekly|monthly|yearly|annually|on weekdays|weekdays)\b/.test(again)) {
    const read = readTask(again, at)
    if (read.recurrence && !read.title.replace(/[\s,]+/g, '')) return { kind: 'repeat', rule: read.recurrence, due: read.due }
  }

  // "duplicate", "duplicate to next week", "copy to friday": a copy, on that day.
  const copy = /^(?:duplicate|copy)(?: (?:it|this))?(?: (?:to|for|on|into) (.+))?$/.exec(words)
  if (copy) {
    const from = task.dueAt ?? dayjs(at).hour(9).minute(0).toISOString()
    const allDay = !task.dueAt || !!task.allDay
    if (!copy[1]) return { kind: 'copy', due: from, allDay }
    const weeks = /^(?:the )?(next|following) (week|month)$/.exec(copy[1])
    if (weeks) return { kind: 'copy', due: dayjs(from).add(1, weeks[2] as 'week' | 'month').toISOString(), allDay }
    const said = daySaid(copy[1], at)
    return said ? { kind: 'copy', ...landing(said, task) } : null
  }

  // "move this to friday 3pm", "friday 3pm", "tomorrow", "next week".
  const rest = words.replace(/^(?:move|reschedule|put|push|shift|do|set|plan)(?: (?:it|this))?(?: (?:to|for|on|until|till))? ?/, '')
  if (/^(?:the )?next (week|month)$/.test(rest) && task.dueAt)
    return { kind: 'move', due: dayjs(task.dueAt).add(1, /month/.test(rest) ? 'month' : 'week').toISOString(), allDay: !!task.allDay }
  const said = daySaid(rest, at)
  return said ? { kind: 'move', ...landing(said, task) } : null
}
