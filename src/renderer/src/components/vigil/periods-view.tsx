import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowLeftIcon from '@/components/ui/arrow-narrow-left-icon'
import ArrowNarrowRightIcon from '@/components/ui/arrow-narrow-right-icon'
import BookIcon from '@/components/ui/book-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import HistoryCircleIcon from '@/components/ui/history-circle-icon'

import { MindflowEditor, TAGS } from '../mindflow'
import { Button } from '@/components/ui/button'
import { findCaptures, findHeadings, follow } from '@/lib/capture-links'
import { dayOf } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { unloaded, useLive, vigil, type PeriodPage } from '@/lib/vigil'
import { useKept } from '@/lib/nav'
import { Chips } from './display'
import { DayBanner } from './scenery'
import { MonthReflect } from './reflect-view'
import { IssueLine, EarlierPages, SERIF, weekOfYear, weekSpan } from './issue'
import { Island, Page, Rolling, Tip, Typed, typing, Pressed } from './ui'
import { dayjs, noon } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowLeft = alive(ArrowNarrowLeftIcon)
const ArrowRight = alive(ArrowNarrowRightIcon)
const BookOpenText = alive(BookIcon)

/**
 * Pages for wider stretches of time, each asking for less the wider it gets,
 * since nobody remembers last month in detail and should not be asked to:
 * a day's page (its own view) has everything, a week's page a few lines and
 * the week in notes, a month's page two fields, and a year is its months'
 * seasons of life in a row.
 */

export type Scale = 'day' | 'week' | 'month' | 'year'
/** The view each scale is in the main window. */
export const SCALE_VIEW: Record<Scale, string> = { day: 'day', week: 'weekpage', month: 'monthpage', year: 'yearpage' }

/** Day, Week, Month, Year: the same four on each of the pages. */
export function ScaleSwitch({ scale, onScale }: { scale: Scale; onScale?: (scale: Scale) => void }): React.JSX.Element | null {
  if (!onScale) return null
  return (
    <Chips className="shrink-0" options={[{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'year', label: 'Year' }]}
      on={(id) => id === scale} pick={(id) => id !== scale && onScale(id as Scale)} />
  )
}

// --- dates

/** The Monday a week starts on, as a day. */
export const mondayOf = (date = new Date()): string => dayOf(dayjs(date).startOf('week').toDate())
const addDays = (day: string, by: number): string => dayOf(noon(day).add(by, 'day').toDate())
const monthOf = (date = new Date()): string => dayjs(date).format('YYYY-MM')
const addMonths = (month: string, by: number): string => monthOf(dayjs(`${month}-01`).add(by, 'month').toDate())
const monthName = (month: string, year = true): string => dayjs(`${month}-01`).format(year ? 'MMMM YYYY' : 'MMMM')
/** "5 – 11 October", or "29 September – 5 October" across a month. */
const weekName = (monday: string): string => {
  const start = noon(monday)
  const end = start.add(6, 'day')
  const last = end.format(end.year() !== dayjs().year() ? 'D MMMM YYYY' : 'D MMMM')
  return `${start.format(start.month() === end.month() ? 'D' : 'D MMMM')} – ${last}`
}

// --- the pieces

/** ← and →, and T for now, the way the day's page steps. */
function useSteps(go: (by: -1 | 1 | 0) => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'ArrowLeft') go(-1)
      else if (event.key === 'ArrowRight') go(1)
      else if (event.key === 't') go(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
}

function Steps({ name, now, atNow, go }: { name: string; now: string; atNow: boolean; go: (by: -1 | 1 | 0) => void }): React.JSX.Element {
  return (
    <>
      <Tip label={`The ${name} before  ←`}>
        <Button variant="ghost" size="icon-sm" aria-label={`The ${name} before`} onClick={() => go(-1)}><ArrowLeft className="size-3.5" /></Button>
      </Tip>
      <Tip label={`The ${name} after  →`}>
        <Button variant="ghost" size="icon-sm" aria-label={`The ${name} after`} disabled={atNow} onClick={() => go(1)}><ArrowRight className="size-3.5" /></Button>
      </Tip>
      {!atNow && <Button variant="ghost" size="sm" onClick={() => go(0)}>{now} <Pressed keys="T" /></Button>}
    </>
  )
}

/**
 * One field of a period's page: a name, why it is there, and room to write.
 * Kept on leaving it, never required.
 */
function Field({ label, hint, value, placeholder, long = false, onSave }: {
  label: string
  hint?: string
  value: string
  placeholder: string
  long?: boolean
  onSave: (text: string) => void
}): React.JSX.Element {
  const keep = (text: string): void => {
    if (text.trim() !== value) onSave(text.trim())
  }
  return (
    <label className="flex cursor-text flex-col gap-1 px-4 py-3 focus-within:bg-accent/40">
      <span className="text-control font-medium text-foreground">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {long ? (
        <textarea defaultValue={value} placeholder={placeholder} aria-label={label} onBlur={(event) => keep(event.target.value)}
          className="mt-1 min-h-[3lh] resize-none bg-transparent text-body text-foreground outline-none [field-sizing:content] placeholder:text-foreground/55" />
      ) : (
        <input defaultValue={value} placeholder={placeholder} aria-label={label} onBlur={(event) => keep(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          className="mt-0.5 bg-transparent text-body text-foreground outline-none placeholder:text-foreground/55" />
      )}
    </label>
  )
}

/** A period's page as stored, read again whenever anything is written; tagged with its key. */
const usePeriod = (period: string): PeriodPage | null => {
  const page = useLive(() => vigil.period(period), null as PeriodPage | null, [period])
  return page?.period === period ? page : null
}
const saveField = (period: string, key: string, text: string): void =>
  void vigil.savePeriod(period, { fields: { [key]: text || null } }).then(() => chime('noted'))

/**
 * The top of a week's or month's page: its facts in a line, then
 * the headline, in the heading face. Until you name the stretch, its dates
 * stand in, quieter.
 */
function Masthead({ parts, headline, named }: { parts: React.ReactNode[]; headline: string; named: boolean }): React.JSX.Element {
  return (
    <header>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-border/60 pb-2">
        <IssueLine parts={parts} />
      </div>
      <h1 className={`mt-5 ${SERIF} text-[clamp(1.625rem,3.6vw,2.25rem)] leading-[1.15] font-medium tracking-[-0.015em] text-balance ${named ? 'text-foreground' : 'text-foreground/80'}`}>
        {/* A title, so simply there: the line under it is the one that speaks (lib/motion.ts). */}
        {headline}
      </h1>
    </header>
  )
}

// --- a week's page

/**
 * A week, high level only: a few lines on how it went, who was in it, what
 * it was about, what you worked on; then the week in notes, in plain prose,
 * written with Recent open beside it, for the connections a day at a time
 * hides. ← and → step through the weeks.
 */
export function WeekPage({ start, onOpen, onScale, onRecent, recentOpen }: {
  /** The Monday to open on, when Back returns to a week gone by. */
  start?: string
  onOpen?: (type: string, id: string) => void
  onScale?: (scale: Scale) => void
  /** Recent beside the page, reaching back from the end of this week (or now). */
  onRecent?: (until: string | null | 'close') => void
  recentOpen?: boolean
}): React.JSX.Element {
  const thisWeek = mondayOf()
  const [monday, setMonday] = useState(start && start <= thisWeek ? start : thisWeek)
  // The week on show is kept in the step, so Back finds the week you left.
  useKept('focus', monday, setMonday, thisWeek)
  const key = `week:${monday}`
  const page = usePeriod(key)
  const current = monday === thisWeek
  const go = (by: -1 | 1 | 0): void => {
    const to = by === 0 ? thisWeek : addDays(monday, by * 7)
    if (to > thisWeek || to === monday) return
    chime('season')
    setMonday(to)
  }
  useSteps(go)
  // The Recent panel follows the week shown: a week gone by shows what was made in it.
  const end = `${addDays(monday, 6)}T23:59:59`
  useEffect(() => {
    if (recentOpen) onRecent?.(current ? null : new Date(end).toISOString())
  }, [monday]) // eslint-disable-line react-hooks/exhaustive-deps
  const fields = page?.fields ?? {}
  return (
    <Page
      title="Week's page"
      actions={
        <span className="flex items-center gap-1">
          <ScaleSwitch scale="week" onScale={onScale} />
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <Steps name="week" now="This week" atNow={current} go={go} />
          {onRecent && (
            <Tip label="Everything made this week, beside the page  ⇧⌘Y">
              <Button variant={recentOpen ? 'secondary' : 'ghost'} size="sm" aria-pressed={!!recentOpen}
                onClick={() => (chime(recentOpen ? 'fold' : 'slide'), onRecent(recentOpen ? 'close' : current ? null : new Date(end).toISOString()))}>
                <AliveIcon icon={HistoryCircleIcon} size={14} /> Recent
              </Button>
            </Tip>
          )}
        </span>
      }
    >
      <div className="page-narrow mx-auto w-full px-5 pt-6 pb-16 [--mf-padding:0.5rem_0]">
        <DayBanner day={monday} seed={`week:${monday}`} />
        <Masthead parts={[`Week ${weekOfYear(monday)}`, weekSpan(monday), current && 'This week']}
          headline={fields.theme || fields.summary?.split(/(?<=[.!?])\s|\n/)[0] || weekName(monday)} named={!!(fields.theme || fields.summary)} />
        <p className="mt-2 text-meta text-muted-foreground">
          <Typed key={key} text={`${current ? 'This week. ' : ''}${page?.exists ? 'High level only: what you would still say about it in a month.' : 'No page for it yet: a few words in any field keeps one.'}`} step={28} />
        </p>
        {page && (
          <div key={key} className="mt-6">
            <Island>
              <Field label="Summary" long value={fields.summary ?? ''} placeholder="How did the week go, in a sentence or two?" onSave={(text) => saveField(key, 'summary', text)} />
              <Field label="People" value={fields.people ?? ''} placeholder="Who was in it" onSave={(text) => saveField(key, 'people', text)} />
              <Field label="Theme" value={fields.theme ?? ''} placeholder="What it was about, or what you were going for" onSave={(text) => saveField(key, 'theme', text)} />
              <Field label="Projects" value={fields.projects ?? ''} placeholder="What you worked on" onSave={(text) => saveField(key, 'projects', text)} />
            </Island>
            <h2 className="mt-8 mb-1 flex items-baseline gap-2 text-body font-semibold">
              This week in notes
              <span className="text-xs font-normal text-muted-foreground">{"plain prose, a bird's-eye view"}</span>
            </h2>
            <MindflowEditor
              key={`week-${monday}`}
              host={window.api}
              tokens={TAGS}
              placeholder="What led to what this week: a journal entry that sparked a video, which sparked a note…"
              toolbar={{ fixed: false }}
              documentId={`period-${key}`}
              defaultContent={(page.body as JSONContent | string | null) ?? ''}
              findNotes={findCaptures}
              findHeadings={findHeadings}
              onOpenNote={(link, heading) => onOpen && follow(link, onOpen, heading)}
              onTokenClick={(token) => token.name === 'tag' && onOpen?.('tag', token.value)}
              outline={false}
              autofocus={false}
              onChange={(body) => void vigil.savePeriod(key, { body })}
            />
          </div>
        )}
        <EarlierPages scale="week" current={monday} onPick={(start) => setMonday(start)} />
      </div>
    </Page>
  )
}

// --- a month's page

/**
 * A month, two fields and no numbers: where to put your energy, looking
 * forward, and the season of life it was, looking back. ← and → step months.
 */
export function MonthPage({ onScale, start }: { onScale?: (scale: Scale) => void; start?: string }): React.JSX.Element {
  const thisMonth = monthOf()
  const [month, setMonth] = useState(start && start <= thisMonth ? start : thisMonth)
  useKept('focus', month, setMonth, thisMonth)
  const key = `month:${month}`
  const page = usePeriod(key)
  const current = month === thisMonth
  // Its numbers, told back over the page: kept off the page itself, which asks for none.
  const [reflect, setReflect] = useState(false)
  const go = (by: -1 | 1 | 0): void => {
    const to = by === 0 ? thisMonth : addMonths(month, by)
    if (to > thisMonth || to === month) return
    chime('season')
    setMonth(to)
  }
  useSteps(go)
  const fields = page?.fields ?? {}
  return (
    <>
    {/* Over the whole view, its own bar in place of the page's. */}
    {reflect && <MonthReflect start={month} onClose={() => (chime('fold'), setReflect(false))} />}
    <Page
      title="Month's page"
      actions={
        <span className="flex items-center gap-1">
          <ScaleSwitch scale="month" onScale={onScale} />
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <Steps name="month" now="This month" atNow={current} go={go} />
          <Tip label="Read it back: the month told from what you caught in it">
            <Button variant="ghost" size="icon-sm" aria-label="Read the month back" onClick={() => (chime('slide'), setReflect(true))}><BookOpenText className="size-3.5" /></Button>
          </Tip>
        </span>
      }
    >
      <div className="page-narrow mx-auto w-full px-5 pt-6 pb-16">
        <DayBanner day={`${month}-01`} seed={`month:${month}`} />
        <Masthead parts={[dayjs(`${month}-01`).format("MMMM 'YY"), `${dayjs(`${month}-01`).daysInMonth()} days`, current && 'This month']}
          headline={fields.season || monthName(month)} named={!!fields.season} />
        <p className="mt-2 text-meta text-muted-foreground">
          <Typed key={key} text="Two fields, no numbers: a name for this stretch of time." step={28} />
        </p>
        {page && (
          <Island key={key} className="mt-6">
            <Field label="Focus" long hint="Looking ahead: where to put your energy this month." value={fields.focus ?? ''}
              placeholder="e.g. Finish the draft; protect mornings" onSave={(text) => saveField(key, 'focus', text)} />
            <Field label="Season of life" long hint="Looking back: was there a story happening that you did not notice at the time?" value={fields.season ?? ''}
              placeholder="e.g. The month I stopped waiting for permission" onSave={(text) => saveField(key, 'season', text)} />
          </Island>
        )}
        <EarlierPages scale="month" current={month} onPick={(start) => setMonth(start.slice(0, 7))} />
      </div>
    </Page>
    </>
  )
}

// --- a year

/**
 * A year as its months' seasons of life, in order: life in stages, read top
 * to bottom. Each month opens its page.
 */
export function YearPage({ start, onScale, onMonth }: { start?: string; onScale?: (scale: Scale) => void; onMonth: (month: string) => void }): React.JSX.Element {
  const thisYear = String(dayjs().year())
  const [year, setYear] = useState(start && start <= thisYear ? start : thisYear)
  useKept('focus', year, setYear, thisYear)
  const months = useLive(() => vigil.year(year), [] as Awaited<ReturnType<typeof vigil.year>>, [year])
  const current = year === thisYear
  const go = (by: -1 | 1 | 0): void => {
    const to = by === 0 ? thisYear : String(Number(year) + by)
    if (to > thisYear || to === year) return
    chime('season')
    setYear(to)
  }
  useSteps(go)
  // Every month so far this year; a year gone by has all twelve.
  const last = current ? dayjs().month() + 1 : 12
  const all = Array.from({ length: last }, (_, at) => `${year}-${String(at + 1).padStart(2, '0')}`)
  const named = months.filter((one) => one.season).length
  return (
    <Page
      title="Year"
      actions={
        <span className="flex items-center gap-1">
          <ScaleSwitch scale="year" onScale={onScale} />
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <Steps name="year" now="This year" atNow={current} go={go} />
        </span>
      }
    >
      <div className="page-narrow mx-auto w-full px-5 pt-6 pb-16">
        <h1 className="text-title font-semibold tabular-nums"><Rolling text={year} /></h1>
        <p className="mt-1 text-meta text-muted-foreground">
          {!unloaded(months) && <Typed key={`${year}-${named}`} text={named ? `Your seasons of life, month by month: ${named} of ${all.length} named so far.` : 'No season of life named yet. Each month\'s page has a field for it, looking back.'} step={28} />}
        </p>
        <ol className="mt-6 flex flex-col">
          {all.map((month) => {
            const page = months.find((one) => one.month === month)
            // The month you are in, marked quietly: a soft fill, its name in full ink and a dot.
            const now = month === dayjs().format('YYYY-MM')
            return (
              <li key={month}>
                <button type="button" onClick={() => (chime('season'), onMonth(month))} aria-current={now ? 'date' : undefined}
                  className={`grid w-full grid-cols-[6.5rem_1fr] items-baseline gap-4 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent/50 ${now ? 'bg-accent/30' : ''}`}>
                  <span className={`flex items-baseline gap-1.5 text-control ${now ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                    {monthName(month, false)}
                    {now && <span aria-hidden className="size-1.5 shrink-0 self-center rounded-full bg-[var(--tt-brand-color-400)]" />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-body text-pretty ${page?.season ? 'text-foreground' : 'text-muted-foreground/70'}`}>{page?.season || 'No season named'}</span>
                    {page?.focus && <span className="mt-0.5 block truncate text-xs text-muted-foreground">Focus: {page.focus}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </Page>
  )
}
