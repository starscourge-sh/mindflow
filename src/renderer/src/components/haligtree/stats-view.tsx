import { YearOfAnswers } from './journal'
import { HabitGrid } from './habits'
import { Children, useState, type ReactNode } from 'react'

import { CAPTURE_TYPES, byKind } from '../capture-kinds/capture-kind-picker'
import { useFocusTools, useLive, haligtree, type Stats } from '@/lib/haligtree'
import { DaysHeatmap } from './days-heatmap'
import { TONES } from './mono-card'
import { KeptCard, StudySection } from './study-stats'
import { WritingSection } from './writing-stats'
import { ReadingSections } from './reading-stats'
import { ForgottenSection, GoalStepsSection, TaskTimingSection, UnsortedSection, UntouchedSection } from './more-stats'
import { Count, ISLAND, Page, Rolling } from './ui'
import { Button } from '@/components/ui/button'
import { useFold } from './islands'
import { Activity, BookCheck, BookOpen, Brain, CalendarCheck, CalendarDays, CalendarRange, ChevronRight, Clock, FileText, Flag, Hash, Hourglass, LayoutGrid, ListChecks, MessageSquareText, PenLine, Repeat, Search, Shapes, ShieldBan, Split, Sprout, Sun, Target, Timer, type LucideIcon } from 'lucide-react'
import { Tip } from '@/components/haligtree/ui'
import { chime } from '@/lib/sound'
import { Recap } from './recap-view'
import { FocusSections, GoalSection, HabitSections, TagSection, timeSaid } from './focus-stats'
import { MonthReflect } from './reflect-view'
import { YourMonth } from './your-month'
import { PracticeStats } from './practices-view'
import { PageContents } from './page-contents'
import { TabChips } from './tab-chips'
import { ReadsIn } from '@/lib/reads-in'
import { useStepped } from '@/lib/nav'
import { UsageSections } from './usage-stats'
import { dayjs, monthName, num, plural } from '../../../../main/dates'
import { quoted } from '../../../../main/clip'

const percent = (part: number, whole: number): string => (whole ? `${Math.round((part / whole) * 100)}%` : 'none')
/** Time spent: "40 minutes" under an hour, "1.5 hours" from one. */
// One way to say a length, as the focus sections do: "45 min", "9 h 30 min".
const spent = (minutes: number): string => (minutes < 0.5 ? 'under a minute' : timeSaid(minutes))
// Days said as Review says them: "under a day", "1 day", "3 days".
const daysSaid = (days: number): string => (days < 1 ? 'under a day' : days < 1.5 ? '1 day' : `${num(Math.round(days))} days`)

/** A number inside a sentence, set apart only by weight and even figures. It rolls into place. */
// Each figure is wrapped with the mark after it (whitespace-nowrap), so a comma never starts a line.
export function N({ children }: { children: ReactNode }): React.JSX.Element {
  return <strong className="font-semibold text-foreground proportional-nums">{typeof children === 'string' || typeof children === 'number' ? <Rolling text={children} /> : children}</strong>
}

/**
 * Each section's mark in its head, as the Inbox's kinds wear theirs: found by
 * its title, so every part of Stats (and Review's, the Journal's) gets one
 * from here. A title not listed has none.
 */
const SECTION_ICONS: [RegExp, LucideIcon][] = [
  [/^Writing$/, PenLine], [/^Remembering/, Brain], [/^This week$|^The week, in the work$/, CalendarRange], [/^Days you opened it$/, CalendarCheck],
  [/^Pages you open most$/, FileText], [/^How you find things$/, Search], [/^Today$/, Sun], [/^Focus$/, Timer], [/^How sessions end$/, Flag],
  [/^When you focus$|^When you capture$/, Clock], [/^Sites it kept you off$/, ShieldBan], [/^Where your focus went$/, Hash], [/^How long each task took$/, Hourglass], [/^Kept up$/, Repeat],
  [/^Habits$/, Repeat], [/^Goals$/, Target], [/^The doing, this week$/, ListChecks], [/^Is it working$/, Activity], [/so far$/, CalendarDays],
  [/^Tasks, on time or late$/, CalendarCheck], [/^Left unsorted$/, Shapes], [/^Cards you keep forgetting$/, Brain], [/^Pages started, never touched again$/, FileText], [/^Steps toward your goals$/, Target], [/^Finished or left part way$/, BookCheck], [/^What reading turned into$/, Sprout], [/^What you capture$/, Shapes], [/^Where captures go$/, Split], [/^By tag$/, Hash], [/in your own words$/, BookOpen]
]
const iconOf = (title: string): LucideIcon | undefined => SECTION_ICONS.find(([test]) => test.test(title))?.[1]

/** A section with too little in it yet, said in its own place in one quiet line: "Writing: shows after a few days of writing". */
export function Later({ title, when }: { title: string; when: string }): React.JSX.Element {
  return <p data-stats-later={title} className="mt-8 px-2 text-control text-muted-foreground">{title}: {when}</p>
}

/**
 * One island per section, the Inbox's: a small head with its icon, name and a
 * fold (kept between visits), then its one number set large, then each
 * sentence, chart or fact a row of its own under a hairline; a row left out
 * leaves no gap.
 */
export function Section({ title, big, icon, children }: { title: string; big?: { value: string | number; label: string }; icon?: LucideIcon; children: ReactNode }): React.JSX.Element {
  const fold = useFold(`stats:${title.replace(/\d{4}/, 'year')}`, { total: 0 })
  const Icon = icon ?? iconOf(title)
  return (
    <section data-group={title} data-folded={fold.folded || undefined} className="mt-8 first:mt-6">
      <h2 className="mb-2">
        <button type="button" data-island-head={title} aria-expanded={!fold.folded} onClick={() => fold.onFold()}
          className="group/head flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-control font-semibold text-foreground transition-colors hover:bg-accent/50">
          {Icon && <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 truncate">{title}</span>
          <ChevronRight aria-hidden className={`ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-(--mf-ease) group-hover/head:text-foreground ${fold.folded ? '' : 'rotate-90'}`} />
        </button>
      </h2>
      {!fold.folded && (
        <div className={`${ISLAND} rounded-xl`}>
          {Children.toArray(children).map((row, index) => (
            <div key={index} className="space-y-3 px-4 py-3 leading-relaxed text-muted-foreground">
              {index === 0 && big && (
                <p className="flex items-baseline gap-2 pt-1">
                  <span className="mf-big-number text-[2.25rem] leading-none text-foreground"><Rolling text={big.value} /></span>
                  <span className="text-sm">{big.label}</span>
                </p>
              )}
              {row}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * One fact in a section, a row of its own: what it counts on the left, in
 * the page's own words, and the number on the right in full ink; a quiet
 * line under the words says what to make of it.
 */
export function Fact({ label, value, note }: { label: ReactNode; value: ReactNode; note?: ReactNode }): React.JSX.Element {
  return (
    <div data-fact className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <p className="text-body text-foreground">{label}</p>
        {note && <p className="mt-0.5 text-control leading-snug text-muted-foreground">{note}</p>}
      </div>
      <span className="shrink-0 text-body font-semibold text-foreground tabular-nums">{typeof value === 'string' || typeof value === 'number' ? <Rolling text={value} /> : value}</span>
    </div>
  )
}

/**
 * The numbers, written as a scientist would and never as a judge: each card
 * leads with its one number, then sentences that set it beside something,
 * so nothing reads as a score. No streaks, no targets. The two the plan calls
 * load-bearing are here: days opened, the only one that notices the app being
 * abandoned, and time to first use, which says whether it works at all.
 */
type Part = 'now' | 'month' | 'year'

export function StatsView({ recap: asked }: { recap?: string }): React.JSX.Element {
  const stats = useLive(haligtree.stats, null as Stats | null)
  // The focus timer turned off (Settings, Tasks): no focus sections.
  const focusTools = useFocusTools()
  // The month or the year, Wrapped's way, over the page; from here or ⌘K.
  // The column, for the contents beside it to read.
  const [column, setColumn] = useState<HTMLDivElement | null>(null)
  const [recap, setRecap] = useState<'month' | 'year' | 'cards' | null>(asked === 'month' || asked === 'year' ? asked : asked === 'yourmonth' ? 'cards' : null)
  // Which page of Stats: the few parts that matter most, or the rest by the month or the year. Asked for a recap, its page.
  const [part, setPart] = useState<Part>(asked === 'month' || asked === 'year' ? asked : asked === 'yourmonth' ? 'month' : 'now')
  useStepped(part, setPart)
  const wrap = (period: 'month' | 'year' | 'cards'): void => {
    chime('slide')
    setRecap(period)
  }
  if (!stats) return <Page title="Stats" waiting><div /></Page>

  const by = Object.fromEntries(stats.exits.map((row) => [row.status, row.n]))
  const total = stats.exits.reduce((sum, row) => sum + row.n, 0)
  const change = stats.lastWeek ? Math.round(((stats.week - stats.lastWeek) / stats.lastWeek) * 100) : null
  const busiest = [...stats.hours].sort((a, b) => b.n - a.n)[0]
  const maxHour = Math.max(1, ...stats.hours.map((row) => row.n))
  const opened = new Set(stats.days)
  // Only what happened today, each its own clause: tasks closed count as much as captures caught.
  const today = [
    stats.day.captured > 0 && <>noted down <N>{plural(stats.day.captured, 'thing', 'things')}</N></>,
    stats.day.exits > 0 && <>dealt with <N>{plural(stats.day.exits, 'thing', 'things')}</N> from your Inbox</>,
    stats.day.tasks > 0 && <>closed <N>{plural(stats.day.tasks, 'task', 'tasks')}</N></>,
    stats.day.reviews > 0 && <>reviewed <N>{plural(stats.day.reviews, 'card', 'cards')}</N></>
  ].filter(Boolean)
  const exits = [
    { status: 'promoted', label: 'became gems', tone: TONES[0] },
    // Kept behind a page or a question, not a gem: counted as what they became (main's `stats`), and shown once there are any.
    ...(by.writing ? [{ status: 'writing', label: 'moved to Writing', tone: TONES[0] * 0.8 }] : []),
    ...(by.question ? [{ status: 'question', label: 'went into questions', tone: TONES[0] * 0.64 }] : []),
    { status: 'resolved', label: 'resolved', tone: TONES[1] },
    { status: 'discarded', label: 'moved to the Bin', tone: TONES[2] }
  ]

  return (
    <>
    {/* The month is told back in sentences; the year keeps its pages, Wrapped's way. */}
    {recap === 'month' && <MonthReflect onClose={() => (chime('fold'), setRecap(null))} />}
    {recap === 'year' && <Recap period={recap} onClose={() => (chime('fold'), setRecap(null))} />}
    {recap === 'cards' && <YourMonth onClose={() => (chime('fold'), setRecap(null))} />}
    <Page title="Stats" beside={(box) => <PageContents key={part} page={column} scroller={box} label="Sections on this page" />} actions={part === 'now' ? undefined : (
      // The month or the year played back over the page: the bar's right, where every page keeps its own actions.
      <span data-stats-recap className="flex items-center gap-1">
        {part === 'month' ? <>
          <Button variant="ghost" size="sm" onClick={() => wrap('month')}><MessageSquareText className="size-3.5" /> Tell me my month</Button>
          <Button variant="ghost" size="sm" data-your-month-open onClick={() => wrap('cards')}><LayoutGrid className="size-3.5" /> Card by card</Button>
        </> : <Button variant="ghost" size="sm" onClick={() => wrap('year')}><BookOpen className="size-3.5" /> Your year, page by page</Button>}
      </span>
    )} lead={
      // Four or five parts at a glance; the rest a chip away, by the month and by the year. On the
      // bar's left, where every page keeps its tabs, in one place whichever is picked.
      <TabChips name="stats" tabs={[{ value: 'now', label: 'At a glance' }, { value: 'month', label: 'Your month' }, { value: 'year', label: 'Your year' }] as { value: Part; label: string }[]} value={part} onChange={setPart} />
    }>
      <div ref={setColumn} className="max-w-[calc(62ch+2.5rem)] px-5 pb-20">
        {/* Each page of Stats drawn whole once its parts are read, never a part popping in after the rest. */}
        <ReadsIn key={part} className="contents">
        {part === 'now' ? <>
        <WritingSection />
        <KeptCard />
        <StudySection brief />
        {/* What reading in the reader really was: finished or left part way, and what it turned into. */}
        <ReadingSections />

        <Section title="This week" big={{ value: stats.week, label: stats.week === 1 ? 'thing noted down' : 'things noted down' }}>
          <p>
            You noted down <N>{stats.week}</N> {stats.week === 1 ? 'thing' : 'things'} in the last seven days
            {change === null ? ', with nothing the week before to set it against.' : change === 0 ? ', the same as the week before.' : <>, {change > 0 ? 'up' : 'down'} <N>{`${Math.abs(change)}%`}</N> on the week before.</>}{' '}
            You closed <N>{plural(stats.tasksDone, 'task', 'tasks')}</N>.
          </p>
        </Section>

        <Section title="Days you opened it" big={{ value: opened.size, label: 'of the last 84 days' }}>
          {/* Drawn once three days are in; before then the number and the sentence say it all. */}
          {opened.size >= 3 && <div data-chart="opened"><DaysHeatmap opened={opened} /></div>}
          <p>
            <N>{opened.size}</N> of the last 84 days. This is the one number that notices if the app stops being opened at all, so it is the one to watch.
          </p>
        </Section>

        <UsageSections />

        </> : part === 'month' ? <>
        <Section title="Today" big={{ value: stats.day.captured, label: stats.day.captured === 1 ? 'thing noted down' : 'things noted down' }}>
          <p>
            {today.length ? (
              <>
                You {today.map((part, index) => (
                  <span key={index}>{part}{index < today.length - 2 ? ', ' : index === today.length - 2 ? ' and ' : '.'}</span>
                ))}
              </>
            ) : 'A quiet day here. That is allowed.'}
          </p>
        </Section>

        <Section title="Remembering, the last 30 days" big={stats.reviews.n ? { value: percent(stats.reviews.recalled ?? 0, stats.reviews.n), label: 'remembered' } : undefined}>
          <p>
            {stats.reviews.n ? (
              <>
                You remembered <N>{percent(stats.reviews.recalled ?? 0, stats.reviews.n)}</N> of <N>{plural(stats.reviews.n, 'review', 'reviews')}</N>, and you aim to remember <N>{Math.round(stats.retention * 100)}%</N>.
              </>
            ) : 'Nothing has been reviewed yet.'}
          </p>
        </Section>

        {/* Each read from what the book keeps (main/stats-more.ts), never guessed. */}
        <TaskTimingSection /><UnsortedSection /><ForgottenSection /><UntouchedSection /><GoalStepsSection />
        {/* Focus time has its own sections just below; this one is what the week gathered around. */}
        <Section title="The week, in the work">
          <p>
            {Object.keys(stats.tagsWeek).length ? (
              <>
                What you captured gathered around{' '}
                {Object.entries(stats.tagsWeek).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag], index, all) => (
                  <span key={tag}><N>#{tag}</N>{index < all.length - 2 ? ', ' : index === all.length - 2 ? ' and ' : '.'}</span>
                ))}
              </>
            ) : 'Nothing you captured carried a tag.'}
          </p>
          {focusTools && stats.estimates.estimated ? (
            <p>
              Tasks you estimated at <N>{spent(stats.estimates.estimated)}</N> took <N>{spent(stats.estimates.spent ?? 0)}</N> in sessions.
            </p>
          ) : null}
        </Section>

        {focusTools && <FocusSections />}

        <HabitSections />

        <HabitGrid />

        <PracticeStats />

        <GoalSection />

        <Section title="The doing, this week" big={{ value: stats.lead.exits, label: stats.lead.exits === 1 ? 'thing from your Inbox dealt with' : 'things from your Inbox dealt with' }}>
          <p>No target here, only the trend: the last seven days.</p>
          <Fact label="Thoughts added to your notes" value={num(stats.lead.glosses)} />
          <Fact label="Days you reviewed cards" value={num(stats.lead.reviewDays)} />
          <Fact label="Pages started" value={num(stats.lead.articles)} />
          <Fact label="Captures waiting in your Inbox" value={num(stats.unprocessed.now)} note={`${num(stats.unprocessed.weekAgo)} a week ago`} />
          {stats.leeches.length > 0 && (
            <Fact label="Cards forgotten four times or more" value={num(stats.leeches.length)}
              note={<>Worth rewriting: {stats.leeches.slice(0, 5).map((title, index) => <span key={title}>{index ? ', ' : ''}{quoted(title, 80)}</span>)}{stats.leeches.length > 5 ? ` and ${num(stats.leeches.length - 5)} more, under “Struggling” in Review` : ''}.</>} />
          )}
        </Section>

        <Section title="Is it working" big={stats.firstUse === null ? undefined : { value: daysSaid(stats.firstUse).replace(/^u/, 'U'), label: 'to first use' }}>
          {stats.firstUse === null ? (
            <p>No capture has been opened, acted on or dealt with yet, so there is nothing to measure here yet.</p>
          ) : (
            <p>A capture waits <N>{daysSaid(stats.firstUse)}</N> on average before it is first opened, acted on or dealt with. If that falls over the months, the app is doing what it is for.</p>
          )}
          {stats.hints.shown ? (
            <Fact label="Hints that stopped you this month" value={percent(stats.stopped, stats.hints.shown)}
              note={`Of ${plural(stats.hints.shown, 'hint', 'hints')}: voted up, or kept on screen four seconds or more. If that falls, show fewer, not more.`} />
          ) : (
            <Fact label="Hints that stopped you this month" value="none yet" note="About one opening in ten shows one, from your gems and old captures." />
          )}
          <Fact label="Gems you keep" value={num(stats.nuggets)} note={`${num(stats.recall)} of them tested`} />
          <Fact label="Pages written from them" value={num(stats.articles)} />
        </Section>

        </> : <>
        <Section title={`${dayjs().year()} so far`} big={{ value: stats.year.captured, label: stats.year.captured === 1 ? 'capture' : 'captures' }}>
          <p>
            <span className="whitespace-nowrap"><N>{plural(stats.year.captured, 'capture', 'captures')}</N>,</span> <N>{plural(stats.year.nuggets, 'gem', 'gems')}</N> kept and{' '}
            <N>{plural(stats.year.articles, 'page', 'pages')}</N> written.
            {stats.year.month && <> Your busiest month was <span className="whitespace-nowrap"><N>{monthName(Number(stats.year.month) - 1)}</N>.</span></>}
          </p>
        </Section>

        <Section title="When you capture" big={busiest ? { value: `${busiest.hour}:00`, label: 'your busiest hour' } : undefined}>
          {busiest ? <>
          {/* Pills of the one ink on the card's own surface; an hour with none draws nothing. */}
          <div data-chart="hours" className="flex h-16 items-end gap-[3px] border-b border-foreground/20 pt-5">
            {Array.from({ length: 24 }, (_, hour) => {
              const n = stats.hours.find((row) => row.hour === hour)?.n ?? 0
              return (
                <Tip key={hour} label={`${hour}:00 · ${num(n)}`}>
                  <div className="flex h-full flex-1 items-end justify-center">
                    {n > 0 && <span data-mark className="relative block w-1.5 rounded-none bg-foreground" style={{ height: `max(6px, ${(n / maxHour) * 100}%)`, opacity: hour === busiest.hour ? 1 : 0.55 }}>
                      {hour === busiest.hour && <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-control font-semibold text-foreground tabular-nums">{num(n)}</span>}
                    </span>}
                  </div>
                </Tip>
              )
            })}
          </div>
          <div className="flex justify-between text-control text-muted-foreground">
            <span>midnight</span><span>6 am</span><span>noon</span><span>6 pm</span><span>11 pm</span>
          </div>
          <p>Every capture you have made, by the hour it was caught. Most come around <span className="whitespace-nowrap"><N>{`${busiest.hour}:00`}</N>.</span></p>
          </> : <p>Nothing captured yet, so no hours to show.</p>}
        </Section>

        <Section title="What you capture" big={stats.kinds[0] ? { value: stats.kinds[0].n, label: `${plural(stats.kinds[0].n, (CAPTURE_TYPES.find((one) => one.id === stats.kinds[0].kind) ?? CAPTURE_TYPES[0]).label.toLowerCase()).replace(/^[\d,]+ /, "")}, the most of any kind` } : undefined}>
          <div data-chart="kinds" className="space-y-2">
            {/* The bars in the one order of kinds, Note first (kindRank); the big number says which is most. */}
            {[...stats.kinds].sort((a, b) => byKind(a.kind, b.kind)).map(({ kind, n }) => {
              const type = CAPTURE_TYPES.find((one) => one.id === kind) ?? CAPTURE_TYPES[0]
              return (
                <div key={kind} className="flex items-center gap-3 text-sm">
                  <type.icon className="size-4 shrink-0" style={{ color: type.tint }} />
                  <span className="w-24 text-foreground">{type.label}</span>
                  {/* The bar in the one ink; the kind's own colour stays on its icon, which names it. */}
                  <span className="h-1.5 flex-1">
                    <span data-mark className="block h-full min-w-1.5 rounded-none bg-foreground" style={{ width: percent(n, Math.max(...stats.kinds.map((one) => one.n))) }} />
                  </span>
                  <span className="min-w-10 shrink-0 text-right font-semibold text-foreground"><Count n={n} /></span>
                </div>
              )
            })}
          </div>
        </Section>
        <YearOfAnswers />

        <Section title="Where captures go" big={total ? { value: percent(total - (by.open ?? 0), total), label: 'dealt with' } : undefined}>
          {/* No bar until something has taken an exit: an empty one reads as a failing grade. */}
          {exits.some((exit) => by[exit.status]) && (
            <div data-chart="exits">
              <div className="flex h-2.5 gap-0.5 overflow-hidden">
                {/* Tones of the one ink, a 2 px gap between parts; what is still in the Inbox is the faint rest. */}
                {exits.filter((exit) => by[exit.status]).map((exit) => (
                  <div key={exit.status} data-mark style={{ flex: `${by[exit.status]} 1 0`, minWidth: 6, background: 'var(--foreground)', opacity: exit.tone }} />
                ))}
                {!!by.open && <div style={{ flex: `${by.open} 1 0`, background: 'var(--foreground)', opacity: 0.1 }} />}
              </div>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-control">
                {exits.map((exit) => <span key={exit.status} className="inline-flex items-center gap-1.5"><span className="size-2" style={{ background: 'var(--foreground)', opacity: exit.tone }} /><strong className="font-semibold text-foreground tabular-nums">{num(by[exit.status] ?? 0)}</strong> {exit.label}</span>)}
                {!!by.open && <span className="inline-flex items-center gap-1.5"><span className="size-2" style={{ background: 'var(--foreground)', opacity: 0.1 }} /><strong className="font-semibold text-foreground tabular-nums">{num(by.open)}</strong> still in your Inbox</span>}
              </p>
            </div>
          )}
          <p>
            Of all <N>{total}</N> captures you have made, <N>{by.open ?? 0}</N> still wait in your Inbox. Letting one go counts as much as saving it as a gem; the split says what you tend to capture.
          </p>
        </Section>

        <TagSection />

        </>}
        </ReadsIn>
      </div>
    </Page>
    </>
  )
}
