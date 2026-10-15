import { Fragment, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { EASE, byKeys, shift, useFirstVisit } from '@/lib/motion'
import isoWeek from 'dayjs/plugin/isoWeek.js'

import { chime } from '@/lib/sound'
import { useLive } from '@/lib/vigil'
import { issues, type PastIssue } from '@/lib/issues'
import { dayjs, noon, num } from '../../../../main/dates'

dayjs.extend(isoWeek)

/**
 * A week's or a month's page: a line of plain facts in the typewriter face
 * along the top, a headline in the heading face, and the weeks or months
 * before it lined up at the bottom. The headline is yours: what you said the stretch was about, or
 * its dates until you say.
 */

/**
 * The page's display face: the heading font chosen in Settings, the same one
 * notes' headings wear, so the page is set like the rest of what you read.
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
 * Earlier weeks or months: the three before this one, each a card with its
 * dates and its headline; picked, the page turns to it. Weeks and months
 * with no page yet still show, with how much was caught in them, since the
 * point is that they come back to you.
 */
export function EarlierPages({ scale, current, onPick }: { scale: 'week' | 'month'; current: string; onPick: (start: string) => void }): React.JSX.Element | null {
  const past = useLive(() => issues.past(scale, current, 3), [] as PastIssue[], [scale, current])
  // The page's one short stagger, the first visit only, never by keys (lib/motion.ts, rule 4).
  const firstVisit = useFirstVisit(`issues:${scale}`)
  const [enter] = useState(() => firstVisit && !byKeys())
  if (!past.length) return null
  return (
    <section className="mt-16 border-t pt-8" aria-label={scale === 'week' ? 'Earlier weeks' : 'Earlier months'}>
      <h2 className={`mb-5 text-center text-title font-normal text-foreground ${SERIF}`}>{scale === 'week' ? 'Earlier weeks' : 'Earlier months'}</h2>
      <ol className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11.5rem,1fr))]">
        {past.map((issue, index) => {
          const headline = scale === 'week' ? issue.fields.theme || firstLine(issue.fields.summary) : issue.fields.season || issue.fields.focus
          const date = scale === 'week' ? `Week ${weekOfYear(issue.start)}` : dayjs(issue.start).format("MMM 'YY")
          return (
            <motion.li key={issue.key} initial={enter ? { opacity: 0, transform: shift('translateY(8px)') } : false} animate={{ opacity: 1, transform: shift('translateY(0px)') }} transition={{ delay: Math.min(index, 3) * 0.02, duration: 0.18, ease: EASE }}>
                <button type="button" onClick={() => (chime('season'), onPick(issue.start))}
                  className="mf-island group flex h-full w-full flex-col items-center gap-2 rounded-xl border bg-accent/25 px-4 pt-4 pb-5 text-center transition-[background-color,translate] duration-200 ease-(--mf-ease) pointer-fine:hover:-translate-y-0.5 hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <IssueLine className="justify-center" parts={[date, !!headline && scale === 'week' && weekSpan(issue.start)]} />
                  <span className={`line-clamp-3 ${SERIF} text-[1.0625rem] leading-snug text-balance ${headline ? 'text-foreground' : 'text-muted-foreground italic'}`}>
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
