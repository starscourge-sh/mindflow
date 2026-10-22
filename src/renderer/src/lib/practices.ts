import { chime } from '@/lib/sound'
import { toast } from '@/components/haligtree/ui'
import { call, useLive } from '@/lib/haligtree'
import { addBreakSource } from '@/lib/break-moment'
import type { Ended, LoadKind, Loaded, Offer, Practice, PracticeRow } from '../../../main/practices'
import { START_MIN, minutesOf, offerDue } from '../../../main/practice-rules'
import { num } from '../../../main/dates'
export type { Ended, LoadKind, Loaded, Offer, Practice, PracticeRow }

/**
 * Practices in the windows: read and written through main's practices.ts.
 * A practice is offered at its time, starts with 5 minutes, opens loaded with
 * your material, and ends with a log line and "What stuck?".
 */
export const practices = {
  list: () => call<PracticeRow[]>('practices:list'),
  save: (practice: Partial<Practice>) => call<string | null>('practices:save', practice),
  bin: (id: string) => call<boolean>('practices:bin', id),
  unbin: (id: string) => call<boolean>('practices:unbin', id),
  offer: () => call<Offer | null>('practices:offer'),
  answer: (id: string, answer: 'skip' | 'later') => call<boolean>('practices:answer', id, answer),
  unanswer: (id: string) => call<boolean>('practices:unanswer', id),
  move: (id: string, at: string | null) => call<boolean>('practices:move', id, at),
  start: (id: string) => call<string | null>('practices:start', id),
  idle: (session: string, since: string) => call<boolean>('practices:idle', session, since),
  end: (session: string) => call<Ended | null>('practices:end', session),
  stuck: (session: string, text: string) => call<string | null>('practices:stuck', session, text),
  unstuck: (gem: string, session: string) => call<boolean>('practices:unstuck', gem, session),
  load: (id: string) => call<Loaded | null>('practices:load', id),
  spot: (capture: string, page: string) => call<boolean>('practices:spot', capture, page)
}

/** "HH:MM" said the way the Mac tells the time: 21:00, or 9pm on a 12-hour clock. */
export function timeSaid(hhmm: string, short = false): string {
  const minutes = minutesOf(hhmm)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!window.api?.twelveHour) return `${h}:${String(m).padStart(2, '0')}`
  const hour = h % 12 || 12
  return short && !m ? `${hour}${h < 12 ? 'am' : 'pm'}` : `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
/** The offer's one line: "9:00 Design patterns, 5 minutes?" */
export const offerSaid = (offer: Pick<Offer, 'name' | 'at' | 'later'>): string => `${offer.later ? 'Again:' : timeSaid(offer.at)} ${offer.name}, ${START_MIN} minutes?`
/** Moving it: "You keep skipping 9pm. Mornings at 7 seem to work for you." */
export const suggestSaid = (suggest: NonNullable<PracticeRow['suggest']>): string =>
  `You keep skipping ${timeSaid(suggest.from, true)}. ${suggest.part} at ${timeSaid(suggest.to, true).replace(/:00$/, '')} seem to work for you.`
/** The honest record: "planned 30, averaging 22". */
export const honestSaid = (honest: NonNullable<PracticeRow['honest']>): string => `planned ${honest.planned}, averaging ${honest.average}`

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
export const DAYS = [1, 2, 3, 4, 5, 6, 0].map((day) => ({ id: String(day), label: DAY_LETTERS[day], tip: DAY_NAMES[day] }))
/** "Every day at 21:00", "Weekdays at 7:00", "Mondays and Thursdays at 9:00". */
export function whenSaid(practice: Pick<Practice, 'days' | 'at'>): string {
  const days = [...practice.days].sort()
  const at = timeSaid(practice.at)
  if (days.length === 7) return `Every day at ${at}`
  if (days.join() === '1,2,3,4,5') return `Weekdays at ${at}`
  if (days.join() === '0,6') return `Weekends at ${at}`
  if (!days.length) return 'Never offered: no days picked'
  const names = [1, 2, 3, 4, 5, 6, 0].filter((day) => days.includes(day)).map((day) => DAY_NAMES[day])
  return `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]} at ${at}`
}
/** What it opens with, said plainly. */
export const loadSaid = (practice: Pick<Practice, 'loadKind' | 'load'>, problemTitle?: string): string =>
  practice.loadKind === 'tag' ? `Opens #${practice.load}`
    : practice.loadKind === 'source' ? `Opens ${practice.load?.replace(/^(attribution|medium):/, '')}`
      : practice.loadKind === 'queue' ? 'Opens your reading queue'
        : practice.loadKind === 'problems' ? `Opens the next problem${problemTitle ? ` in ${problemTitle}` : ''}`
          : 'Opens nothing: just the time'

/** The offer up now, if any, kept fresh as practices change. */
export const useOffer = (): Offer | null => useLive(practices.offer, null as Offer | null, [], ['item'])
export const usePractices = (): PracticeRow[] => useLive(practices.list, [] as PracticeRow[], [], ['item'])

/** ↵ on the offer: the session starts, 5 minutes to begin, and the main window opens on what it loads. */
export async function startPractice(id: string): Promise<string | null> {
  const session = await practices.start(id)
  if (!session) return (chime('nope'), null)
  chime('slide')
  window.api.showFocus(true)
  window.api.openInHome('practice', id)
  return session
}
/** N or S on the offer: gone until tomorrow, or asked again in 30 minutes. Said quietly, with Undo for N. */
export function answerOffer(offer: Offer, answer: 'skip' | 'later'): void {
  void practices.answer(offer.id, answer).then(() => {
    chime(answer === 'skip' ? 'fold' : 'later')
    const undo = (): void => void practices.unanswer(offer.id).then(() => chime('back'))
    if (answer === 'later') toast(`${offer.name} again in 30 minutes`, undo)
    else toast(`Not tonight. ${offer.name} is back next time`, undo)
  })
}

/**
 * ⌘K's rows: start any practice now, make a new one, or open the page. The
 * same in the main window and quick capture.
 */
export function usePracticeActions(): { label: string; hint?: string; cue: null; run: () => void }[] {
  const all = usePractices()
  return [
    { label: 'New practice…', hint: 'Something you repeat with no end: offered at its time, 5 minutes to start', cue: null, run: () => (chime('open'), window.api.openInHome('practice', 'new')) },
    { label: 'Go to Practices', hint: 'Reading, Spanish, a problem a day: each with its time', cue: null, run: () => window.api.openInHome('view', 'practices') },
    ...all.map((one) => ({ label: `Start practice: ${one.name}`, hint: `${START_MIN} minutes to start, ${num(one.targetMin)} min target`, cue: null as null, run: () => void startPractice(one.id) }))
  ]
}

/**
 * A break's one card can be a practice (lib/break-moment.ts): one still to
 * come today, said with its time, opening the Practices page. Asked first,
 * and only ever when there is one left today, so most breaks still get a gem.
 */
addBreakSource(async () => {
  const all = await practices.list().catch(() => [] as PracticeRow[])
  const now = new Date()
  const minute = now.getHours() * 60 + now.getMinutes()
  const next = all.filter((one) => !one.ranToday && one.days.includes(now.getDay()) && minutesOf(one.at) > minute && !offerDue(one, now, { ranToday: false, skippedToday: false, laterAt: null }))
    .sort((a, b) => minutesOf(a.at) - minutesOf(b.at))[0]
  return next ? { label: 'Later today', text: `${next.name} at ${timeSaid(next.at)}, ${START_MIN} minutes to start`, open: { type: 'practice', id: next.id } } : null
}, true)
