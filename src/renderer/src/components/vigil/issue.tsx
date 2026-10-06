import { Fragment, type ReactNode } from 'react'
import { motion } from 'motion/react'
import isoWeek from 'dayjs/plugin/isoWeek.js'

import { chime } from '@/lib/sound'
import { useLive } from '@/lib/vigil'
import { issueLabel, issueNumber, issues, type PastIssue } from '@/lib/issues'
import { Rolling } from './ui'
import { dayjs, noon, num } from '../../../../main/dates'

dayjs.extend(isoWeek)

/**
 * A week's or a month's page as an issue: a line of plain facts in the
 * typewriter face along the top, the issue's number turning over in its own
 * boxes, a headline in the heading face, and the issues before it lined up at
 * the bottom. The headline is yours: what you said the stretch was about, or
 * its dates until you say.
 */

/**
 * The issue's display face: the heading font chosen in Settings, the same one
 * notes' headings wear, so an issue is set like the rest of what you read.
 * Headlines and the month's prose use it.
 */
// Marked important: it wins over the text font on a <p> as well as on headings.
export const SERIF = 'font-heading!'

/** "6–12 Oct '26", or "29 Sept – 5 Oct '26" across a month. */
export const weekSpan = (monday: string): string => {
  const start = noon(monday)
  const end = start.add(6, 'day')
  return start.month() === end.month() ? `${start.format('D')}–${end.format("D MMM 'YY")}` : `${start.format('D MMM')} – ${end.format("D MMM 'YY")}`
}
/** The week of the year, Monday first, as a calendar prints it. */
export const weekOfYear = (monday: string): number => noon(monday).isoWeek()

/** Facts in a row, set in the typewriter face, a quiet dot between each. */
export function IssueLine({ parts, className = '' }: { parts: ReactNode[]; className?: string }): React.JSX.Element {
  return (
    <p className={`flex min-w-0 flex-wrap items-baseline gap-x-2 font-mono text-[0.6875rem] tracking-[0.02em] text-muted-foreground tabular-nums ${className}`}>
      {parts.filter((part) => part !== null && part !== false && part !== '').map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <span aria-hidden className="text-muted-foreground/45">·</span>}
          <span className="whitespace-nowrap">{part}</span>
        </Fragment>
      ))}
    </p>
  )
}

/**
 * The issue's number in a row of little boxes, one figure each, like the
 * wheels of a counter: stepping to another issue turns only the wheels that
 * change.
 */
export function Odometer({ n, label = 'Issue No.' }: { n: number; label?: string }): React.JSX.Element {
  const digits = String(n).padStart(3, '0').split('')
  return (
    <span className="flex shrink-0 items-center gap-1.5 font-mono text-[0.6875rem] text-muted-foreground" aria-label={`${label} ${n}`}>
      <span aria-hidden>{label}</span>
      <span aria-hidden className="flex">
        {digits.map((digit, index) => (
          <span key={index} className="-ml-px grid h-[1.125rem] w-3.5 place-items-center border border-foreground/20 text-foreground tabular-nums first:ml-0 first:rounded-l-[3px] last:rounded-r-[3px]">
            <Rolling text={digit} />
          </span>
        ))}
      </span>
    </span>
  )
}

/** The first thing you ever caught: issue No. 1 is the week (or month) it fell in. */
export const useFirstCapture = (): string | null => useLive(issues.first, null as string | null)

/** The number an issue goes by, or null before your first. */
export const useIssue = (start: string, scale: 'week' | 'month'): number | null => issueNumber(useFirstCapture(), start, scale)

/**
 * Past issues: the three before this one, each a card with its dates, its
 * number and its headline; picked, the page turns to it. Weeks and months
 * with no page yet still show, with how much was caught in them, since the
 * point is that they come back to you.
 */
export function PastIssues({ scale, current, onPick }: { scale: 'week' | 'month'; current: string; onPick: (start: string) => void }): React.JSX.Element | null {
  const first = useFirstCapture()
  const past = useLive(() => issues.past(scale, current, 3), [] as PastIssue[], [scale, current])
  if (!past.length) return null
  return (
    <section className="mt-16 border-t pt-8" aria-label="Past issues">
      <h2 className={`mb-5 text-center text-title font-normal text-foreground ${SERIF}`}>Past issues</h2>
      <ol className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11.5rem,1fr))]">
        {past.map((issue, index) => {
          const number = issueNumber(first, issue.start, scale)
          const headline = scale === 'week' ? issue.fields.theme || firstLine(issue.fields.summary) : issue.fields.season || issue.fields.focus
          const date = scale === 'week' ? `Week ${weekOfYear(issue.start)}` : dayjs(issue.start).format("MMM 'YY")
          return (
            <motion.li key={issue.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * index, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                <button type="button" onClick={() => (chime('season'), onPick(issue.start))}
                  className="mf-island group flex h-full w-full flex-col items-center gap-2 rounded-xl border bg-accent/25 px-4 pt-4 pb-5 text-center transition-[background-color,translate] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <IssueLine className="justify-center" parts={[date, number && issueLabel(number)]} />
                  <span className={`line-clamp-3 ${SERIF} text-[1.0625rem] leading-snug text-balance ${headline ? 'text-foreground' : 'text-muted-foreground/70 italic'}`}>
                    {headline || (scale === 'week' ? weekSpan(issue.start) : dayjs(issue.start).format('MMMM'))}
                  </span>
                  <span className="mt-auto pt-1 text-meta text-muted-foreground">
                    {issue.captures ? `${num(issue.captures)} caught` : 'Nothing caught'}{headline ? '' : ' · no page yet'}
                  </span>
                </button>
            </motion.li>
          )
        })}
      </ol>
    </section>
  )
}

/** The first sentence or line of something written, for a headline. */
const firstLine = (text?: string): string => (text ?? '').split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? ''
