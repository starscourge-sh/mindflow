import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { TIP } from '@/lib/float'
import { GAP, STEP, STROKE_INK, StrokeAxis, StrokeRule, Strokes, placeNames, strokeAt, textWidth } from './time-strokes'
import { useReading } from '@/lib/reads-in'
import { FlagTriangleRight } from 'lucide-react'

import { chime } from '@/lib/sound'
import { unloaded, useLive, haligtree, type Recent } from '@/lib/haligtree'
import { findCaptures, follow } from '@/lib/capture-links'
import { MARK_COLORS, MARK_ICONS, countdown, inkOf, markDay, marks, nextOf, onDay, openMark, useMilestones, type Milestone } from '@/lib/milestones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RowMenu, type RowItem } from './row-menu'
import { DatePicker } from './date-picker'
import { Rolling, Tip, refuse, toast } from './ui'
import { dayKey, dayMonth, dayName, dayjs, noon, num, plural } from '../../../../main/dates'
import { daysBetween } from '../../../../main/goal-days'

/**
 * Marked days on the page: the asker that sets one, the small flag a day
 * wears in a grid, the right-click that marks a day anywhere, the year as a
 * ruler with the marked days standing tall and named, and the countdown to the
 * next one. The data is lib/milestones.ts.
 */

// --- asking

type Asked = { answer: (value: (Partial<Milestone> & { day: string; title: string }) | 'drop' | null) => void; day: string; existing: Milestone | null }

/** The mark on a day, asked over the page: its name, the day, an emoji, a colour and a note it points at. */
export function MilestoneAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<Asked | null>(null)
  const [title, setTitle] = useState('')
  const [day, setDay] = useState<string | null>(null)
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [note, setNote] = useState<{ link: string; label: string } | null>(null)
  const [finding, setFinding] = useState('')
  const [found, setFound] = useState<{ id: string; label: string }[]>([])
  useEffect(() => {
    const onAsk = (event: Event): void => {
      const detail = (event as CustomEvent<Asked>).detail
      chime('open')
      setTitle(detail.existing?.title ?? '')
      setDay(noon(detail.existing?.day ?? detail.day).toISOString())
      setIcon(detail.existing?.icon ?? '')
      setColor(detail.existing?.color ?? null)
      setNote(detail.existing?.note ? { link: detail.existing.note, label: 'A note' } : null)
      setFinding('')
      setFound([])
      setAsked(detail)
      // The linked note's name, read once it is known.
      if (detail.existing?.note) void window.api.haligtree('link:title', detail.existing.note).then((row) => {
        const named = row as { title?: string } | null
        if (named?.title) setNote({ link: detail.existing!.note!, label: named.title })
      })
    }
    window.addEventListener('haligtree:mark-day', onAsk)
    return () => window.removeEventListener('haligtree:mark-day', onAsk)
  }, [])
  // Notes to point at, as an @ link finds them; only notes, not people or tags.
  useEffect(() => {
    if (!finding.trim()) return setFound([])
    let live = true
    void findCaptures(finding).then((rows) => live && setFound(rows.filter((row) => !/^(person|tag|task):/.test(row.id)).slice(0, 5).map((row) => ({ id: row.id, label: row.label }))))
    return () => void (live = false)
  }, [finding])
  if (!asked) return null
  const done = (value: Parameters<Asked['answer']>[0]): void => {
    asked.answer(value)
    setAsked(null)
  }
  const keep = (): void => {
    if (!title.trim()) return refuse('Name the day first: what is it for?')
    if (!day) return refuse('Pick the day')
    done({ day: dayKey(day), title: title.trim(), icon: icon.trim() || null, color, note: note?.link ?? null })
  }
  const left = day ? daysBetween(dayKey(), dayKey(day)) : null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[16vh]" onMouseDown={() => done(null)}>
      <div role="dialog" aria-modal="true" aria-label={asked.existing ? 'Change the marked day' : 'Mark a day'} className="flex w-[min(30rem,90vw)] flex-col gap-3 rounded-xl bg-popover p-4 shadow-(--mf-panel-shadow)"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') done(null)
          if (event.key === 'Enter' && !(event.target as HTMLElement).closest('[data-slot="popover-content"], [data-note-pick]')) (event.preventDefault(), keep())
        }}>
        <p className="flex items-center gap-2 text-sm">
          <FlagTriangleRight className="size-4" style={{ color: inkOf({ color }) }} />
          {asked.existing ? 'The marked day' : 'Mark a day: what is it for?'}
        </p>
        <div className="flex items-center gap-2">
          <Input value={icon} onChange={(event) => setIcon([...event.target.value].slice(-2).join(''))} aria-label="Emoji" placeholder="✦" className="w-10 shrink-0 text-center" />
          <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Exam, Launch, Mum's birthday" aria-label="What the day is for" maxLength={60} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-control">
          <span className="text-muted-foreground">On</span>
          <DatePicker value={day} onChange={setDay} placeholder="Pick the day" suggest={['tomorrow', 'next friday', 'in 1 month', 'in 3 months']} className="border bg-accent/30" />
          {left !== null && <span className="text-xs text-muted-foreground"><Rolling by="word" text={left === 0 ? 'today' : left > 0 ? `in ${plural(left, 'day')}` : `${num(-left)} ${left === -1 ? 'day' : 'days'} ago`} /></span>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {MARK_ICONS.map((one) => (
            <button key={one} type="button" aria-pressed={icon === one} onClick={() => (chime('tap'), setIcon(icon === one ? '' : one))}
              className={`grid size-7 place-items-center rounded-md text-[0.95rem] transition-colors hover:bg-accent ${icon === one ? 'bg-accent ring-1 ring-foreground/15' : ''}`}>{one}</button>
          ))}
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          {MARK_COLORS.map((one) => (
            <Tip key={one} label={one[0].toUpperCase() + one.slice(1)}>
              <button type="button" aria-label={one} aria-pressed={color === one} onClick={() => (chime('tap'), setColor(color === one ? null : one))}
                className={`grid size-6 place-items-center rounded-full transition-transform hover:scale-110 ${color === one ? 'ring-2 ring-foreground/30 ring-offset-1 ring-offset-popover' : ''}`}>
                <span className="size-3.5 rounded-full" style={{ background: `var(--tt-color-text-${one})` }} />
              </button>
            </Tip>
          ))}
        </div>
        {note ? (
          <p className="flex items-center gap-2 text-control">
            <span className="text-muted-foreground">Note</span>
            <span className="private-text min-w-0 flex-1 truncate">{note.label}</span>
            <button type="button" onClick={() => (chime('off'), setNote(null))} className="text-xs text-muted-foreground hover:text-foreground">Unlink</button>
          </p>
        ) : (
          <div className="relative" data-note-pick>
            <Input value={finding} onChange={(event) => setFinding(event.target.value)} placeholder="Link a note to it (if you want to)" aria-label="Link a note"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && found[0]) (event.preventDefault(), event.stopPropagation(), chime('tap'), setNote({ link: found[0].id, label: found[0].label }), setFinding(''))
              }} />
            {found.length > 0 && (
              <div className="absolute inset-x-0 top-full z-10 mt-1 flex flex-col rounded-md border bg-popover p-1 shadow-(--mf-panel-shadow)">
                {found.map((one) => (
                  <button key={one.id} type="button" onClick={() => (chime('tap'), setNote({ link: one.id, label: one.label }), setFinding(''))}
                    className="private-text truncate rounded px-2 py-1 text-left text-control hover:bg-accent">{one.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2">
          <p className="mr-auto text-xs text-muted-foreground">Enter to keep it · Escape to leave it</p>
          {asked.existing && <Button variant="ghost" size="sm" onClick={() => done('drop')}>Unmark</Button>}
          <Button variant="ghost" size="sm" onClick={() => done(null)}>Cancel</Button>
          <Button size="sm" onClick={keep} disabled={!title.trim() || !day}>{asked.existing ? 'Keep it' : 'Mark the day'}</Button>
        </div>
      </div>
    </div>
  )
}

// --- a day, anywhere

/** What a right-click on a day offers: mark it, change or take away its mark, open its page. */
export function dayMenu(day: string, all: Milestone[], onOpenDay?: (day: string) => void): RowItem[] {
  const here = onDay(all, day)
  return [
    { heading: dayName(noon(day)) },
    ...here.map((one): RowItem => ({ label: one.exam ? `${one.title}: open the tag` : `Change ${one.title}…`, run: () => void markDay(day, one) })),
    { label: here.length ? 'Mark it again…' : 'Mark this day…', run: () => void markDay(day) },
    here.some((one) => !!one.note) && 'separator',
    ...here.filter((one) => !!one.note).map((one): RowItem => ({ label: `Open the note for ${one.title}`, run: () => follow(one.note!, (type, id) => window.api.openInHome(type, id)) })),
    onOpenDay && 'separator',
    onOpenDay && { label: "Open the day's page", run: () => onOpenDay(day) }
  ]
}

/** Right-click anything that stands for a day to mark it. */
function DayMarkMenu({ day, all, onOpenDay, children }: { day: string; all: Milestone[]; onOpenDay?: (day: string) => void; children: ReactElement }): React.JSX.Element {
  return <RowMenu items={dayMenu(day, all, onOpenDay)}>{children}</RowMenu>
}

/** The marks on a day, as small flags: in a week's or a month's grid. With `named`, the first one's name beside it. */
function DayFlags({ marks, named = false, className = '' }: { marks: Milestone[]; named?: boolean; className?: string }): React.JSX.Element | null {
  if (!marks.length) return null
  const first = marks[0]
  return (
    <Tip label={marks.map((one) => `${one.icon ? `${one.icon} ` : ''}${one.title} · ${countdown(one).replace(` to ${one.title}`, ' to go').replace(`${one.title} `, '')}`).join('\n')}>
      <span data-mark-flag className={`inline-flex min-w-0 items-center gap-1 ${className}`} style={{ color: inkOf(first) }}>
        {first.icon ? <span className="text-[0.8em] leading-none">{first.icon}</span> : <FlagTriangleRight className="size-3 shrink-0" fill="currentColor" strokeWidth={2} />}
        {named && <span className="truncate text-[0.6875rem] leading-tight font-medium">{first.title}</span>}
        {marks.length > 1 && <span className="text-[0.625rem] text-muted-foreground tabular-nums">+{num(marks.length - 1)}</span>}
      </span>
    </Tip>
  )
}

/** What a right-click on one mark offers: open what it belongs to, change it, unmark it, its day's page. */
function markMenu(one: Milestone, open: (type: string, id: string) => void, onOpenDay?: (day: string) => void): RowItem[] {
  return [
    { heading: `${one.icon ? `${one.icon} ` : ''}${one.title}` },
    { label: one.exam ? 'Open the tag' : one.note ? 'Open the note' : `Change ${one.title}…`, run: () => openMark(one, open) },
    !one.exam && !!one.note && { label: `Change ${one.title}…`, run: () => void markDay(one.day, one) },
    !one.exam && { label: 'Unmark', run: () => void marks.drop(one.id).then((was) => (chime('away'), toast(`${one.title} is no longer marked`, was ? () => void marks.set(was) : undefined))) },
    onOpenDay && 'separator',
    onOpenDay && { label: "Open the day's page", run: () => onOpenDay(one.day) }
  ]
}

/** What a mark's tip says: its countdown, and what a click on it does. */
const markTip = (one: Milestone): string =>
  `${one.icon ? `${one.icon} ` : ''}${one.title} · ${countdown(one).replace(` to ${one.title}`, ' to go').replace(`${one.title} `, '')}\n${one.exam ? 'Click to open the tag' : one.note ? 'Click to open its note' : 'Click to change it'}`

/**
 * One mark on a day as a chip, the way a task's chip is in a calendar: one
 * line with its emoji, clicked to open what it belongs to, right-clicked for
 * its menu. Anything else given (a drag's listeners, a ref) goes on the button.
 */
export function MarkChip({ one, open, onOpenDay, className = '', ...rest }: { one: Milestone; open: (type: string, id: string) => void; onOpenDay?: (day: string) => void; className?: string } & Omit<React.ComponentPropsWithRef<'button'>, 'className'>): React.JSX.Element {
  return (
    <RowMenu items={markMenu(one, open, onOpenDay)}>
      <span className="flex min-w-0 max-w-full shrink-0">
        <Tip label={markTip(one)}>
          <button type="button" data-mark-flag={one.id} {...rest} onClick={(event) => (event.stopPropagation(), openMark(one, open))}
            className={`mf-hit relative flex h-5 min-w-0 max-w-full items-center gap-1 rounded-sm px-1 text-left text-control leading-snug font-medium transition-colors hover:bg-accent ${className}`}
            style={{ color: inkOf(one) }}>
            {one.icon ? <span className="shrink-0 text-[0.8em] leading-none">{one.icon}</span> : <FlagTriangleRight className="size-3 shrink-0" fill="currentColor" strokeWidth={2} />}
            <span className="truncate">{one.title}</span>
          </button>
        </Tip>
      </span>
    </RowMenu>
  )
}

/** The mark on a day's page, under its date: each one a chip that opens it to change. */
export function DayMarks({ day, className = 'mt-2' }: { day: string; className?: string }): React.JSX.Element | null {
  const all = useMilestones(day, day)
  if (!all.length) return null
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {all.map((one) => (
        <button key={one.id} type="button" data-day-mark onClick={() => (chime('open'), void markDay(day, one))}
          className="flex h-6 items-center gap-1.5 rounded-full px-2.5 text-control font-medium transition-colors"
          style={{ color: inkOf(one), background: `color-mix(in oklab, ${inkOf(one)} 12%, transparent)` }}>
          {one.icon ? <span className="leading-none">{one.icon}</span> : <FlagTriangleRight className="size-3.5" fill="currentColor" />}
          {one.title}
        </button>
      ))}
    </div>
  )
}

// --- a month or a week as a grid

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/**
 * Days in rows of seven, Monday first: a month (with the days before its first
 * left blank) or a week. Each day wears its flag; a click opens a day gone by
 * (or marks one ahead), a right-click marks it.
 *
 * As the month's calendar (`calendar`), each day also says what it held, read
 * by the key under it: a dot for a page written, a tint for reviews done (the
 * more, the deeper), a ring for a marked day, a flag for an exam, and ahead of
 * today, how many cards fall due.
 */
export function DayGrid({ days, onOpenDay, label, calendar = false }: { days: string[]; onOpenDay?: (day: string) => void; label: string; calendar?: boolean }): React.JSX.Element {
  const all = useMilestones(days[0], days[days.length - 1])
  const today = dayKey()
  const lead = (noon(days[0]).day() + 6) % 7
  // What you kept on each day gone by (captures and notes, not tasks), counted in its cell.
  const last = days[days.length - 1] < today ? days[days.length - 1] : today
  const made = useLive(() => (days[0] > today ? Promise.resolve([] as Recent[]) : haligtree.recent(daysBetween(days[0], last) + 1, noon(last).endOf('day').toISOString())),
    [] as Recent[], [days[0], last], ['capture', 'item'])
  const kept = new Map<string, number>()
  for (const one of made) if (one.type !== 'task') kept.set(dayKey(one.at), (kept.get(dayKey(one.at)) ?? 0) + 1)
  // The calendar's own marks: pages and reviews on the days gone, cards due on the days ahead.
  const marked = useLive(() => (calendar ? haligtree.dayMarks(days[0], days[days.length - 1]) : Promise.resolve({ pages: [] as string[], reviews: {} as Record<string, number> })),
    { pages: [] as string[], reviews: {} as Record<string, number> }, [calendar, days[0], days[days.length - 1]])
  const ahead = days[days.length - 1] >= today ? daysBetween(today, days[days.length - 1]) + 1 : 0
  const load = useLive(() => (calendar && ahead > 0 ? haligtree.reviewLoad(ahead) : Promise.resolve([] as number[])), [] as number[], [calendar, ahead], ['item'])
  // Its page waits for these (lib/reads-in.tsx): before, each day's "6 kept" and its marks came a beat after the days.
  useReading(unloaded(all) || unloaded(made) || unloaded(marked) || unloaded(load))
  const pages = new Set(marked.pages)
  const most = Math.max(1, ...Object.values(marked.reviews))
  return (
    <div role="grid" aria-label={label} className="select-none">
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[0.6875rem] text-muted-foreground">
        {WEEKDAYS.map((one, at) => <span key={at}>{one}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, at) => <span key={`lead-${at}`} />)}
        {days.map((day) => {
          const here = onDay(all, day)
          const now = day === today
          const gone = day < today
          const exams = here.filter((one) => one.exam)
          const own = here.filter((one) => !one.exam)
          const reviews = calendar ? (marked.reviews[day] ?? 0) : 0
          const due = calendar && day >= today ? (load[daysBetween(today, day)] ?? 0) : 0
          const page = calendar && pages.has(day)
          // A calendar day: reviews done tint it, a marked day rings it; elsewhere a mark tints it, as before. Every day
          // has its cell, quiet when empty and today's stronger, so the row reads as one even strip: with a box only on
          // the day something was kept, the other days were bare numbers and the row looked broken (the user's "when
          // no box, it looks broken").
          const style: React.CSSProperties | undefined = calendar
            ? {
                background: reviews ? `color-mix(in oklab, var(--tt-color-text-purple) ${Math.round(6 + (reviews / most) * 16)}%, transparent)` : undefined,
                // An outline, not a shadow: Brutal turns a drawn shadow into its hard one.
                outline: own.length ? `1.5px solid ${inkOf(own[0])}` : undefined,
                outlineOffset: own.length ? '-1.5px' : undefined
              }
            : here.length ? { background: `color-mix(in oklab, ${inkOf(here[0])} ${now ? 16 : 9}%, transparent)` } : undefined
          const said = [
            here.length && here.map((one) => one.title).join(', '),
            !calendar && kept.get(day) && `${kept.get(day)} kept`,
            page && 'a page written',
            reviews && `${plural(reviews, 'review')} done`,
            due && `${plural(due, 'card')} due`
          ].filter(Boolean)
          return (
            <DayMarkMenu key={day} day={day} all={all} onOpenDay={onOpenDay}>
              <button type="button" data-grid-day={day} data-page={page || undefined} data-reviews={reviews || undefined} data-due={due || undefined} aria-current={now ? 'date' : undefined}
                aria-label={`${dayName(noon(day))}${said.length ? `, ${said.join(', ')}` : ''}`}
                onClick={() => (chime('tap'), onOpenDay ? onOpenDay(day) : void markDay(day, here[0]))}
                className={`@container relative flex min-h-12 min-w-0 flex-col items-start gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent/60 ${now && !(calendar && reviews) ? 'bg-accent' : 'bg-foreground/[0.04]'}`}
                style={style}>
                <span className="flex w-full items-baseline gap-1">
                  <span className={`text-xs tabular-nums ${now ? 'font-semibold text-[var(--tt-brand-color-400)]' : gone ? 'text-muted-foreground' : 'text-foreground'}`}>{noon(day).date()}</span>
                  {!calendar && !!kept.get(day) && <span className="ml-auto shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">{num(kept.get(day)!)}<span className="hidden @min-[4.75rem]:inline"> kept</span></span>}
                  {due > 0 && <span data-due-count className="ml-auto shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">{num(due)}<span className="hidden @min-[4.75rem]:inline"> due</span></span>}
                </span>
                {calendar ? (
                  <>
                    {exams.length > 0 && <DayFlags marks={exams} named className="max-w-full" />}
                    {own.length > 0 && <span className="max-w-full truncate text-[0.6875rem] leading-tight font-medium" style={{ color: inkOf(own[0]) }}>{own[0].icon ? `${own[0].icon} ` : ''}{own[0].title}</span>}
                    {page && <span data-page-dot aria-hidden className="absolute bottom-1.5 left-1.5 size-[5px] rounded-full" style={{ background: 'color-mix(in oklab, var(--foreground) 55%, transparent)' }} />}
                  </>
                ) : <DayFlags marks={here} named className="max-w-full" />}
              </button>
            </DayMarkMenu>
          )
        })}
      </div>
      {calendar && <CalendarKey />}
    </div>
  )
}

/** What the month's marks mean, small, under the days. */
function CalendarKey(): React.JSX.Element {
  const item = 'flex items-center gap-1.5'
  return (
    <div data-month-legend className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.75rem] text-muted-foreground">
      <span className={item}><span aria-hidden className="size-[6px] rounded-full" style={{ background: 'color-mix(in oklab, var(--foreground) 55%, transparent)' }} />A page written</span>
      <span className={item}><span aria-hidden className="h-3 w-4 rounded-[3px]" style={{ background: 'color-mix(in oklab, var(--tt-color-text-purple) 18%, transparent)' }} />Reviews done</span>
      <span className={item}><span aria-hidden className="h-3 w-4 rounded-[3px]" style={{ outline: '1.5px solid var(--tt-brand-color-400)', outlineOffset: '-1.5px' }} />A marked day</span>
      <span className={item}><FlagTriangleRight aria-hidden className="size-3 text-[var(--tt-brand-color-400)]" fill="currentColor" />An exam</span>
      <span className={item}><span aria-hidden className="font-medium text-foreground tabular-nums">12</span>Cards due</span>
      <span>Click a day to open it</span>
    </div>
  )
}

// --- the year as strokes

/** A mark's name as it is drawn over its stroke: its icon, then its title. */
const markName = (one: Milestone): string => `${one.icon ? `${one.icon} ` : ''}${one.title}`
/** The height of one line of names over the strokes. */
const NAME_LINE = 16

/**
 * The year as strokes (time-strokes.tsx): a hairline a day, January at the
 * left. The days gone in solid ink, the days ahead faint, today a taller
 * stroke in the accent, and each marked day a taller stroke in its own colour
 * reaching up to its name, which never sits on another name or runs past the
 * chart; a name with no room is said under the year. The months are named
 * under the strokes. A window too narrow for the whole year draws it in two,
 * three or four bands of months, never squeezing a day. Pointed at, a day
 * says which it is; clicked, it opens or is marked; right-clicked, it can be marked.
 */
export function YearMarks({ year, onOpenDay }: { year: string; onOpenDay?: (day: string) => void }): React.JSX.Element {
  const all = useMilestones(`${year}-01-01`, `${year}-12-31`)
  useReading(unloaded(all))
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  const [aimed, setAimed] = useState<string>(`${year}-01-01`)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = (): void => setW(el.clientWidth)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const start = dayjs(`${year}-01-01`).hour(12)
  const days = start.endOf('year').diff(start.startOf('day'), 'day') + 1
  const today = dayKey()
  const at = today.startsWith(year) ? daysBetween(`${year}-01-01`, today) : today < year ? -1 : days
  const dayAt = (d: number): string => dayKey(start.add(d, 'day'))
  const indexOf = (day: string): number => daysBetween(`${year}-01-01`, day)
  const monthStart = (m: number): number => (m >= 12 ? days : indexOf(dayKey(start.add(m, 'month').startOf('month'))))
  // The whole year in one band when it fits, else two, three or four bands of whole months.
  const parts = [1, 2, 3, 4].find((n) => !w || Array.from({ length: n }, (_, b) => (monthStart(((b + 1) * 12) / n) - monthStart((b * 12) / n)) * STEP - GAP).every((one) => one <= w)) ?? 4
  const bands = Array.from({ length: parts }, (_, b) => ({ from: monthStart((b * 12) / parts), to: monthStart(((b + 1) * 12) / parts), firstMonth: (b * 12) / parts, months: 12 / parts }))
  const sorted = [...all].sort((a, b) => a.day.localeCompare(b.day))
  const markOn = new Map<number, Milestone>()
  for (const one of sorted) if (!markOn.has(indexOf(one.day))) markOn.set(indexOf(one.day), one)
  // Each band's names over its marked strokes, on up to three lines; the rest are said under the year.
  // Each band's hairlines spread across the card, as the year always was: never closer than the one step.
  const stepOf = (band: { from: number; to: number }): number => (w ? Math.max(STEP, (w + GAP) / (band.to - band.from)) : STEP)
  const placed = bands.map((band) => {
    const step = stepOf(band)
    const width = (band.to - band.from) * step - GAP
    const marks = [...markOn.entries()].filter(([d]) => d >= band.from && d < band.to).map(([d, one]) => ({ one, d, x: (d - band.from) * step, w: textWidth(markName(one), 11, 500) + 2 }))
    // Names may run on past the band's last day, up to the chart's own edge.
    return placeNames(marks, Math.max(width, w), 3)
  })
  const named = new Set(placed.flat().filter((one) => one.row !== null).map((one) => one.one.id))
  const fromPointer = (clientX: number, svg: SVGSVGElement | null, band: { from: number; to: number }): number | null => {
    if (!svg) return null
    const d = strokeAt(clientX, svg.getBoundingClientRect().left, band.to - band.from, stepOf(band))
    return d === null ? null : band.from + d
  }
  const near = hover === null ? null : markOn.get(hover) ?? null
  const gone = Math.max(0, Math.min(days, at))
  const open = (): void => {
    if (hover === null) return
    const day = dayAt(hover)
    const one = markOn.get(hover) ?? onDay(all, day)[0]
    chime('tap')
    if (one) void markDay(one.day, one)
    else if (onOpenDay) onOpenDay(day)
    else void markDay(day)
  }
  return (
    <DayMarkMenu day={aimed} all={all} onOpenDay={onOpenDay}>
      <figure data-year-marks aria-label={`${year}, with ${num(all.length)} marked ${all.length === 1 ? 'day' : 'days'}`} className="mf-chart relative grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2"
        onContextMenuCapture={() => setAimed(dayAt(hover ?? Math.max(0, Math.min(days - 1, at))))}>
        <p data-year-marks-said className="text-control font-medium text-foreground tabular-nums">
          {at < 0 ? `${year} is ahead` : at >= days ? `${year} is gone` : `Day ${num(at + 1)} of ${num(days)}`}{all.length ? `, ${plural(all.length, 'day', 'days')} marked` : ''}
        </p>
        <StrokeRule>Each stroke is a day, the solid ones gone; a taller coloured stroke is a day you marked</StrokeRule>
        <div ref={box} className="grid w-full min-w-0 gap-3">
          {bands.map((band, b) => {
            const count = band.to - band.from
            const step = stepOf(band)
            const width = count * step - GAP
            const names = placed[b]
            const lines = Math.max(0, ...names.map((one) => (one.row ?? -1) + 1))
            const rowOf = new Map(names.map((one) => [one.d, one.row]))
            const ticks = Array.from({ length: band.months }, (_, m) => ({ x: (monthStart(band.firstMonth + m) - band.from) * step, text: start.add(band.firstMonth + m, 'month').format('MMM') }))
            return (
              <div key={band.from} data-year-band className="relative" style={{ width }}>
                {lines > 0 && (
                  <div data-year-names className="relative" style={{ height: lines * NAME_LINE }}>
                    {names.filter((one) => one.row !== null).map(({ one, row, left }) => (
                      <span key={one.id} data-mark-label className="absolute text-[11px] leading-4 font-medium whitespace-nowrap"
                        style={{ left, top: (lines - 1 - (row ?? 0)) * NAME_LINE, color: inkOf(one) }}>{markName(one)}</span>
                    ))}
                  </div>
                )}
                <Strokes count={count} step={step} role="img" aria-label={b === 0 ? `${num(gone)} of ${num(days)} days gone` : undefined} className="cursor-pointer"
                  ink={(i) => { const d = band.from + i; const one = markOn.get(d); return one ? inkOf(one) : d === at ? STROKE_INK.here : d < at ? STROKE_INK.gone : STROKE_INK.ahead }}
                  tall={(i) => { const d = band.from + i; const row = rowOf.get(d); return row !== undefined ? (row === null ? true : row * NAME_LINE + NAME_LINE / 2) : d === at || hover === d }}
                  attrs={(i) => { const one = markOn.get(band.from + i); return { 'data-year-day': dayAt(band.from + i), 'data-year-marked': one?.title } }}
                  onPointerMove={(event) => setHover(fromPointer(event.clientX, event.currentTarget, band))} onPointerLeave={() => setHover(null)} onClick={open} />
                <div data-year-months><StrokeAxis ticks={ticks} width={width} /></div>
                {hover !== null && hover >= band.from && hover < band.to && (
                  <span className={`pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap ${TIP}`}
                    style={{ left: Math.max(70, Math.min(Math.max(width, 140) - 70, (hover - band.from) * step)), top: '100%', marginTop: 4 }}>
                    <span className="font-medium">{dayMonth(`${dayAt(hover)}T12:00`)}</span>
                    <span className="text-muted-foreground"> · {near ? markName(near) : onOpenDay ? 'click for its page' : 'click to mark it'}</span>
                  </span>
                )}
              </div>
            )
          })}
          {/* The marks with no room over their strokes, named here, in date order: none is left to a hover alone. */}
          {all.length > named.size && (
            <p data-year-also className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-4 text-muted-foreground">
              <span>Also marked:</span>
              {sorted.filter((one) => !named.has(one.id)).map((one) => (
                <span key={one.id} data-mark-label className="font-medium whitespace-nowrap" style={{ color: inkOf(one) }}>{markName(one)} <span className="font-normal text-muted-foreground">{dayMonth(`${one.day}T12:00`)}</span></span>
              ))}
            </p>
          )}
        </div>
      </figure>
    </DayMarkMenu>
  )
}

// --- the countdown

/** The next marked day, counted down: "3 days to Exam", a click to change it. Nothing when none is ahead. */
export function NextMark({ className = '', withinDays = 365 }: { className?: string; withinDays?: number }): React.JSX.Element | null {
  const today = dayKey()
  const all = useMilestones(today, dayKey(noon(today).add(withinDays, 'day')))
  const next = nextOf(all, today)
  useReading(unloaded(all))
  if (!next) return null
  const left = daysBetween(today, next.day)
  return (
    <button type="button" data-next-mark onClick={() => (chime('open'), void markDay(next.day, next))}
      className={`group/mark flex min-w-0 items-center gap-2 rounded-md text-left text-control transition-colors ${className}`}>
      <span className="grid size-[1.125rem] shrink-0 place-items-center" style={{ color: inkOf(next) }}>
        {next.icon ? <span className="text-[0.9rem] leading-none">{next.icon}</span> : <FlagTriangleRight className="size-4" fill="currentColor" />}
      </span>
      <span className="min-w-0 truncate">
        <span className="font-semibold text-foreground underline-offset-4 group-hover/mark:underline group-hover/mark:decoration-foreground/30">{countdown(next, today)}</span>
        <span className="text-muted-foreground"> · {dayName(noon(next.day))}</span>
      </span>
      {left <= 30 && left > 0 && <span aria-hidden className="ml-auto flex shrink-0 gap-[3px]">{Array.from({ length: Math.min(left, 14) }, (_, at) => <span key={at} className="size-1 rounded-full" style={{ background: inkOf(next), opacity: 0.25 + (0.75 * (at + 1)) / Math.min(left, 14) }} />)}</span>}
    </button>
  )
}
