import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { AliveIcon } from '@/components/ui/alive-icon'
import HistoryCircleIcon from '@/components/ui/history-circle-icon'

import { MindflowEditor, TAGS } from '../mindflow'
import { Button } from '@/components/ui/button'
import { findCaptures, findHeadings, follow } from '@/lib/capture-links'
import { dayOf } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { unloaded, useLive, vigil, type Item, type PeriodPage } from '@/lib/vigil'
import { KeepOrDrop } from './keep-drop'
import { openOnes } from './goals-view'
import { exampleMonth, exampleYear } from '@/lib/examples'
import { Example } from './example'
import { useKept } from '@/lib/nav'
import { Chips } from './display'
import { DayBanner } from './scenery'
import { MonthReflect } from './reflect-view'
import { EarlierPages, SERIF, weekSpan } from './issue'
import { Island, Page, Rolling, Tip, Typed, typing, Pressed } from './ui'
import { dayjs, noon, num } from '../../../../main/dates'
import { useHere } from '@/lib/split'
import { DayGrid, YearMarks } from './milestones'
import { ArrowLeft, ArrowRight, BookOpen as BookOpenText } from '@/components/ui/icons'
import { PlannedVsDid } from './planned-did'

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
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
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
        <Button variant="ghost" size="icon-sm" aria-label={`The ${name} after`} onClick={() => go(1)}><ArrowRight className="size-3.5" /></Button>
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
          className="mt-1 min-h-[3lh] resize-none bg-transparent text-body text-foreground outline-none [field-sizing:content] placeholder:text-foreground/70" />
      ) : (
        <input defaultValue={value} placeholder={placeholder} aria-label={label} onBlur={(event) => keep(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          className="mt-0.5 bg-transparent text-body text-foreground outline-none placeholder:text-foreground/70" />
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
 * The top of a week's or month's page: the headline, in the heading face,
 * then its facts in one plain line under it. Until you name the stretch, its
 * dates stand in, quieter.
 */
function Masthead({ parts, headline, named }: { parts: React.ReactNode[]; headline: string; named: boolean }): React.JSX.Element {
  return (
    <header>
      <h1 className={`mt-5 ${SERIF} text-[clamp(1.625rem,3.6vw,2.25rem)] leading-[1.15] font-medium tracking-[-0.015em] text-balance ${named ? 'text-foreground' : 'text-foreground/80'}`}>
        {/* A title, so simply there: the line under it is the one that speaks (lib/motion.ts). */}
        {headline}
      </h1>
      <p className="mt-1 text-meta text-muted-foreground tabular-nums">{parts.filter(Boolean).join(' · ')}</p>
    </header>
  )
}

/**
 * What the period before meant to do, at the top of this one's review, and
 * for a week the month's own aims: so a review starts from what you said
 * you would do, not from a blank page.
 */
function CarriedOver({ lines }: { lines: [string, string][] }): React.JSX.Element | null {
  const shown = lines.filter(([, text]) => text.trim())
  if (!shown.length) return null
  return (
    <Island className="mt-5">
      {shown.map(([label, text]) => (
        <p key={label} data-carried={label} className="flex flex-col gap-0.5 px-4 py-2.5">
          <span className="text-control font-medium text-foreground/80">{label}</span>
          <span className="text-body whitespace-pre-line text-foreground">{text}</span>
        </p>
      ))}
    </Island>
  )
}

// --- a week's page

/**
 * A week, high level only: a few lines on how it went, who was in it, what
 * it was about, what you worked on; then the week in notes, in plain prose,
 * written with Recent open beside it, for the connections a day at a time
 * hides. ← and → step through the weeks.
 */
export function WeekPage({ start, onOpen, onScale, onRecent, recentOpen, onDay }: {
  /** The Monday to open on, when Back returns to a week gone by. */
  start?: string
  /** A day of the week opened: its page. */
  onDay?: (day: string) => void
  onOpen?: (type: string, id: string) => void
  onScale?: (scale: Scale) => void
  /** Recent beside the page, reaching back from the end of this week (or now). */
  onRecent?: (until: string | null | 'close') => void
  recentOpen?: boolean
}): React.JSX.Element {
  const thisWeek = mondayOf()
  const [monday, setMonday] = useState(start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? mondayOf(noon(start).toDate()) : thisWeek)
  // The week on show is kept in the step, so Back finds the week you left.
  useKept('focus', monday, setMonday, thisWeek)
  const key = `week:${monday}`
  const page = usePeriod(key)
  const current = monday === thisWeek
  const go = (by: -1 | 1 | 0): void => {
    const to = by === 0 ? thisWeek : addDays(monday, by * 7)
    if (to === monday) return
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
  // Last week's intentions, and the aims of the month this week falls in (by its Thursday).
  const before = usePeriod(`week:${addDays(monday, -7)}`)
  const inMonth = addDays(monday, 3).slice(0, 7)
  const monthPage = usePeriod(`month:${inMonth}`)
  const goals = openOnes(useLive(() => vigil.items('goal'), [] as Item[], [], ['item'])).filter((goal) => goal.goalAt!.slice(0, 7) === inMonth)
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
        <Masthead parts={[weekSpan(monday), current && 'This week']}
          headline={fields.theme || fields.summary?.split(/(?<=[.!?])\s|\n/)[0] || weekName(monday)} named={!!(fields.theme || fields.summary)} />
        <p className="mt-2 min-h-lh text-meta text-muted-foreground">
          {/* Only once the page is read: never "Nothing written" on the way to the real line. */}
          {page && <Typed key={key} text={`${page.exists ? 'The big picture: what you would still say about this week in a month.' : 'Nothing written for this week yet. Type in any box below and the page is kept.'}`} step={28} />}
        </p>
        {/* The week's seven days, each wearing its mark: right-click one to mark it. */}
        <div data-week-carried>
          <CarriedOver lines={[
            ['Last week you meant to', before?.fields.intentions ?? ''],
            [`${monthName(inMonth, false)}'s focus`, monthPage?.fields.focus ?? ''],
            [`Goals due in ${monthName(inMonth, false)}`, goals.map((goal) => `${goal.title}, by ${dayjs(goal.goalAt!).format('D MMMM')}`).join('\n')]
          ]} />
        </div>
        <div className="mt-5"><DayGrid label="The week's days" days={Array.from({ length: 7 }, (_, at) => addDays(monday, at))} onOpenDay={onDay} /></div>
        {page && (
          <div key={key} className="mt-6">
            <Island>
              <Field label="Summary" long value={fields.summary ?? ''} placeholder="How did the week go, in a sentence or two?" onSave={(text) => saveField(key, 'summary', text)} />
              <Field label="People" value={fields.people ?? ''} placeholder="Who was in it" onSave={(text) => saveField(key, 'people', text)} />
              <Field label="Theme" value={fields.theme ?? ''} placeholder="What it was about, or what you were going for" onSave={(text) => saveField(key, 'theme', text)} />
              <Field label="Projects" value={fields.projects ?? ''} placeholder="What you worked on" onSave={(text) => saveField(key, 'projects', text)} />
            </Island>
            {/* The weekly review: wins, what was learned, and what you mean to do next. */}
            <h2 className="mt-8 mb-1 text-body font-semibold text-foreground">The week's review</h2>
            <div data-week-review><Island>
              <Field label="Wins" long value={fields.wins ?? ''} placeholder="What went well, big or small" onSave={(text) => saveField(key, 'wins', text)} />
              <Field label="What failed" long value={fields.failed ?? ''} placeholder="What did not work, said plainly" onSave={(text) => saveField(key, 'failed', text)} />
              <Field label="What I learned" long value={fields.learned ?? ''} placeholder="What it taught you" onSave={(text) => saveField(key, 'learned', text)} />
              <Field label="Next time" long value={fields.nextTime ?? ''} placeholder="What you would do differently" onSave={(text) => saveField(key, 'nextTime', text)} />
              <Field label="Intentions for next week" long hint="They show at the top of next week's page." value={fields.intentions ?? ''} placeholder="What you mean to do next week" onSave={(text) => saveField(key, 'intentions', text)} />
            </Island></div>
            <div className="mt-8"><PlannedVsDid monday={monday} /></div>
            <KeepOrDrop scale="week" period={key} page={page} />
            <h2 className="mt-8 mb-1 flex items-baseline gap-2 text-body font-semibold">
              This week in notes
              <span className="text-xs font-normal text-muted-foreground">{"write freely about the week as a whole"}</span>
            </h2>
            <MindflowEditor
              key={`week-${monday}`}
              host={window.api}
              tokens={TAGS}
              placeholder="How one thing led to another this week: a talk that sent you to a book, which gave you an idea…"
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
export function MonthPage({ onScale, start, onDay }: { onScale?: (scale: Scale) => void; start?: string; onDay?: (day: string) => void }): React.JSX.Element {
  const thisMonth = monthOf()
  // Opened on any day in a month ("2026-10-12" from a link) or the month itself: always kept as "2026-10".
  const asked = start?.slice(0, 7)
  const [month, setMonth] = useState(asked && /^\d{4}-\d{2}$/.test(asked) ? asked : thisMonth)
  useKept('focus', month, (to) => setMonth(to.slice(0, 7)), thisMonth)
  const key = `month:${month}`
  const page = usePeriod(key)
  const current = month === thisMonth
  // Its numbers, told back over the page: kept off the page itself, which asks for none.
  const [reflect, setReflect] = useState(false)
  const go = (by: -1 | 1 | 0): void => {
    const to = by === 0 ? thisMonth : addMonths(month, by)
    if (to === month) return
    chime('season')
    setMonth(to)
  }
  useSteps(go)
  const fields = page?.fields ?? {}
  const before = usePeriod(`month:${addMonths(month, -1)}`)
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
          <Tip label="Read the month back, told from what you noted down in it">
            <Button variant="ghost" size="icon-sm" aria-label="Read the month back" onClick={() => (chime('slide'), setReflect(true))}><BookOpenText className="size-3.5" /></Button>
          </Tip>
        </span>
      }
    >
      <div className="page-narrow mx-auto w-full px-5 pt-6 pb-16">
        <DayBanner day={`${month}-01`} seed={`month:${month}`} />
        <Masthead parts={[!!fields.season && dayjs(`${month}-01`).format('MMMM YYYY'), current && 'This month']}
          headline={fields.season || monthName(month)} named={!!fields.season} />
        {/* Both fields empty: the same two, filled in, to show the kind of thing
            that goes in them. Above the days, so it is seen without scrolling. */}
        {page && !fields.focus && !fields.season && (
          <Example flush className="mt-4" tryIt="write a “Focus” as the month starts, and name its “Season of life” as it ends.">
            <Island>
              {([['Focus', exampleMonth.focus], ['Season of life', exampleMonth.season]] as const).map(([label, text]) => (
                <p key={label} className="flex flex-col gap-0.5 px-4 py-2.5">
                  <span className="text-control font-medium text-foreground">{label}</span>
                  <span className="text-body text-foreground">{text}</span>
                </p>
              ))}
            </Island>
          </Example>
        )}
        <div data-month-carried><CarriedOver lines={[[`Last month you meant to`, before?.fields.intentions ?? '']]} /></div>
        {/* The month's days, each wearing its mark: right-click one to mark it. */}
        <div className="mt-5"><DayGrid key={month} calendar label={`${monthName(month)}, day by day`} days={Array.from({ length: dayjs(`${month}-01`).daysInMonth() }, (_, at) => `${month}-${String(at + 1).padStart(2, '0')}`)} onOpenDay={onDay} /></div>
        {page && (
          <Island key={key} className="mt-6">
            <Field label="Focus" long hint="Looking ahead: where to put your energy this month." value={fields.focus ?? ''}
              placeholder="e.g. Finish the draft; protect mornings" onSave={(text) => saveField(key, 'focus', text)} />
            <Field label="Season of life" long hint="Looking back: was there a story happening that you did not notice at the time?" value={fields.season ?? ''}
              placeholder="e.g. The month I stopped waiting for permission" onSave={(text) => saveField(key, 'season', text)} />
            <Field label="Intentions for next month" long hint="They show at the top of next month's page." value={fields.intentions ?? ''}
              placeholder="What you mean to do next month" onSave={(text) => saveField(key, 'intentions', text)} />
          </Island>
        )}
        {page && <KeepOrDrop scale="month" period={key} page={page} />}
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
export function YearPage({ start, onScale, onMonth, onDay }: { start?: string; onScale?: (scale: Scale) => void; onMonth: (month: string) => void; onDay?: (day: string) => void }): React.JSX.Element {
  const thisYear = String(dayjs().year())
  const [year, setYear] = useState(start && /^\d{4}/.test(start) ? start.slice(0, 4) : thisYear)
  useKept('focus', year, setYear, thisYear)
  const real = useLive(() => vigil.year(year), [] as Awaited<ReturnType<typeof vigil.year>>, [year])
  const current = year === thisYear
  const go = (by: -1 | 1 | 0): void => {
    const to = by === 0 ? thisYear : String(Number(year) + by)
    if (to === year) return
    chime('season')
    setYear(to)
  }
  useSteps(go)
  // Every month so far this year; a year gone by has all twelve.
  const last = current ? dayjs().month() + 1 : 12
  const all = Array.from({ length: last }, (_, at) => `${year}-${String(at + 1).padStart(2, '0')}`)
  const named = real.filter((one) => one.season).length
  // No season named in any month yet: a made-up year shows what the page becomes, dimmed and out of reach.
  const example = !unloaded(real) && !named && current
  const months = example ? exampleYear(year, all.length) : real
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
          {!unloaded(months) && <Typed key={`${year}-${named}`} text={named ? `Your seasons of life, month by month: ${named} of ${num(all.length)} named so far.` : 'No month has a name yet. Looking back, give one a name on its month\'s page.'} step={28} />}
        </p>
        {/* The year as a ruler, the marked days standing tall and named: right-click a day to mark it. */}
        <div className="mt-6"><YearMarks key={year} year={year} onOpenDay={onDay} /></div>
        <Example on={example} flush className="mt-6" tryIt={<><strong><button type="button" onClick={() => (chime('season'), onMonth(dayjs().format('YYYY-MM')))} className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">open this month's page</button> and give it a name, looking back.</strong> Each month you name lines up here.</>}>
        <ol className={example ? 'flex flex-col' : 'mt-6 flex flex-col'}>
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
                    <span className={`block text-body text-pretty ${page?.season ? 'text-foreground' : 'text-muted-foreground'}`}>{page?.season || (now ? 'Not named yet: open it to name it' : 'Not named')}</span>
                    {page?.focus && <span className="mt-0.5 block truncate text-xs text-muted-foreground">Focus: {page.focus}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        </Example>
      </div>
    </Page>
  )
}
