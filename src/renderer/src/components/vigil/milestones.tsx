import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { FlagTriangleRight } from 'lucide-react'

import { chime } from '@/lib/sound'
import { findCaptures, follow } from '@/lib/capture-links'
import { MARK_COLORS, MARK_ICONS, countdown, inkOf, markDay, nextOf, onDay, useMilestones, type Milestone } from '@/lib/milestones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RowMenu, type RowItem } from './row-menu'
import { DatePicker } from './date-picker'
import { Rolling, Tip, refuse } from './ui'
import { dayKey, dayMonth, dayName, dayjs, noon, num } from '../../../../main/dates'
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
      if (detail.existing?.note) void window.api.vigil('link:title', detail.existing.note).then((row) => {
        const named = row as { title?: string } | null
        if (named?.title) setNote({ link: detail.existing!.note!, label: named.title })
      })
    }
    window.addEventListener('vigil:mark-day', onAsk)
    return () => window.removeEventListener('vigil:mark-day', onAsk)
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
          {left !== null && <span className="text-xs text-muted-foreground"><Rolling by="word" text={left === 0 ? 'today' : left > 0 ? `in ${num(left)} ${left === 1 ? 'day' : 'days'}` : `${num(-left)} ${left === -1 ? 'day' : 'days'} ago`} /></span>}
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
    onOpenDay && day <= dayKey() && 'separator',
    onOpenDay && day <= dayKey() && { label: "Open the day's page", run: () => onOpenDay(day) }
  ]
}

/** Right-click anything that stands for a day to mark it. */
export function DayMarkMenu({ day, all, onOpenDay, children }: { day: string; all: Milestone[]; onOpenDay?: (day: string) => void; children: ReactElement }): React.JSX.Element {
  return <RowMenu items={dayMenu(day, all, onOpenDay)}>{children}</RowMenu>
}

/** The marks on a day, as small flags: in a week's or a month's grid. With `named`, the first one's name beside it. */
export function DayFlags({ marks, named = false, className = '' }: { marks: Milestone[]; named?: boolean; className?: string }): React.JSX.Element | null {
  if (!marks.length) return null
  const first = marks[0]
  return (
    <Tip label={marks.map((one) => `${one.icon ? `${one.icon} ` : ''}${one.title} · ${countdown(one).replace(` to ${one.title}`, ' to go').replace(`${one.title} `, '')}`).join('\n')}>
      <span data-mark-flag className={`inline-flex min-w-0 items-center gap-1 ${className}`} style={{ color: inkOf(first) }}>
        {first.icon ? <span className="text-[0.8em] leading-none">{first.icon}</span> : <FlagTriangleRight className="size-3 shrink-0" fill="currentColor" strokeWidth={2} />}
        {named && <span className="truncate text-[0.6875rem] leading-tight font-medium">{first.title}</span>}
        {marks.length > 1 && <span className="text-[0.625rem] text-muted-foreground tabular-nums">+{marks.length - 1}</span>}
      </span>
    </Tip>
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
 */
export function DayGrid({ days, onOpenDay, label }: { days: string[]; onOpenDay?: (day: string) => void; label: string }): React.JSX.Element {
  const all = useMilestones(days[0], days[days.length - 1])
  const today = dayKey()
  const lead = (noon(days[0]).day() + 6) % 7
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
          return (
            <DayMarkMenu key={day} day={day} all={all} onOpenDay={onOpenDay}>
              <button type="button" data-grid-day={day} aria-current={now ? 'date' : undefined}
                aria-label={`${dayName(noon(day))}${here.length ? `, ${here.map((one) => one.title).join(', ')}` : ''}`}
                onClick={() => (chime('tap'), gone || now ? onOpenDay?.(day) : void markDay(day, here[0]))}
                className={`flex h-12 min-w-0 flex-col items-start gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent/60 ${now ? 'bg-accent/40' : ''}`}
                style={here.length ? { background: `color-mix(in oklab, ${inkOf(here[0])} ${now ? 16 : 9}%, transparent)` } : undefined}>
                <span className={`text-xs tabular-nums ${now ? 'font-semibold text-[var(--tt-brand-color-400)]' : gone ? 'text-muted-foreground' : 'text-foreground'}`}>{noon(day).date()}</span>
                <DayFlags marks={here} named className="max-w-full" />
              </button>
            </DayMarkMenu>
          )
        })}
      </div>
    </div>
  )
}

// --- the year as a ruler

/** Rough width of a label, to keep two from running into each other. */
const labelWidth = (one: Milestone): number => Math.min(150, one.title.length * 6.2 + (one.icon ? 16 : 6) + 6)

/**
 * The year along a ruler, a tick a day, January at the left, the welcome's
 * ruler on the year page: the days gone drawn darker, today in the accent,
 * and each marked day a tall tick in its own colour with its name over it.
 * Pointed at, a day says which it is; right-clicked, it can be marked.
 */
export function YearMarks({ year, onOpenDay }: { year: string; onOpenDay?: (day: string) => void }): React.JSX.Element {
  const all = useMilestones(`${year}-01-01`, `${year}-12-31`)
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
  const step = w / days
  const x = (d: number): number => Math.round((d + 0.5) * step) + 0.5
  const H = 30
  const dayAt = (d: number): string => dayKey(start.add(d, 'day'))
  const indexOf = (day: string): number => daysBetween(`${year}-01-01`, day)
  const ticks = (pick: (d: number) => boolean, tall: (d: number) => number): string => {
    let path = ''
    for (let d = 0; d < days; d++) if (pick(d)) path += `M${x(d)} ${H}V${H - tall(d)}`
    return path
  }
  const first = (d: number): boolean => start.add(d, 'day').date() === 1
  const marked = new Set(all.map((one) => indexOf(one.day)))
  // Labels on up to three lines, to the right of their tick or, crowded there, to its left. The
  // days ahead are placed first (nearest first), then the ones gone (latest first); one with no
  // room left is said when pointed at.
  const taken: [number, number][][] = [[], [], []]
  const free = (line: number, from: number, to: number): boolean => taken[line].every(([a, b]) => to + 6 < a || from > b + 6)
  const order = [...all].sort((a, b) => (a.day >= today) !== (b.day >= today) ? (a.day >= today ? -1 : 1) : a.day >= today ? a.day.localeCompare(b.day) : b.day.localeCompare(a.day))
  const spots = new Map<string, { line: number; flip: boolean }>()
  for (const one of order) {
    const left = x(indexOf(one.day))
    const width = labelWidth(one)
    let spot: { line: number; flip: boolean } | null = null
    // Its tick runs down through every line under its name: those must be clear at its x too.
    const below = (line: number): boolean => [1, 2].every((under) => under <= line || free(under, left - 1, left + 1))
    for (let line = 0; line < 3 && !spot; line++) {
      if (!below(line)) continue
      if (left + 3 + width <= w && free(line, left, left + 3 + width)) spot = { line, flip: false }
      else if (left - 3 - width >= 0 && free(line, left - 3 - width, left)) spot = { line, flip: true }
    }
    if (spot) {
      taken[spot.line].push(spot.flip ? [left - 3 - width, left] : [left, left + 3 + width])
      for (let under = spot.line + 1; under < 3; under++) taken[under].push([left - 1, left + 1])
    }
    spots.set(one.id, spot ?? { line: -1, flip: false })
  }
  const placed = all.map((one) => ({ one, left: x(indexOf(one.day)), ...spots.get(one.id)! }))
  const fromPointer = (clientX: number): number => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect || !step) return 0
    return Math.max(0, Math.min(days - 1, Math.floor((clientX - rect.left) / step)))
  }
  const months = Array.from({ length: 12 }, (_, m) => ({ name: start.add(m, 'month').format('MMM'), d: indexOf(dayKey(start.add(m, 'month').startOf('month'))) }))
  const near = hover === null ? null : all.find((one) => Math.abs(indexOf(one.day) - hover) <= Math.max(1, Math.round(4 / Math.max(step, 0.5))))
  const shownDay = near ? indexOf(near.day) : hover
  return (
    <DayMarkMenu day={aimed} all={all} onOpenDay={onOpenDay}>
      <figure data-year-marks aria-label={`${year}, with ${num(all.length)} marked ${all.length === 1 ? 'day' : 'days'}`} className="relative w-full"
        onContextMenuCapture={(event) => setAimed(near && hover !== null ? near.day : dayAt(fromPointer(event.clientX)))}>
        <div ref={box} className="relative h-[calc(48px+30px+1.9rem)] cursor-default"
          onPointerMove={(event) => setHover(fromPointer(event.clientX))} onPointerLeave={() => setHover(null)}
          onClick={() => {
            if (shownDay === null) return
            const day = dayAt(shownDay)
            const one = near ?? onDay(all, day)[0]
            chime('tap')
            if (one) void markDay(one.day, one)
            else if (day <= today) onOpenDay?.(day)
            else void markDay(day)
          }}>
          {w > 0 && (
            <>
              {placed.map(({ one, left, line, flip }) => line >= 0 && (
                <span key={one.id} data-mark-label className="absolute flex max-w-[150px] items-center gap-1 truncate text-[0.6875rem] leading-[1rem] font-medium whitespace-nowrap"
                  style={{ ...(flip ? { right: w - left + 3 } : { left: left + 3 }), top: line * 16, color: inkOf(one) }}>
                  {one.icon && <span className="leading-none">{one.icon}</span>}
                  <span className="truncate">{one.title}</span>
                </span>
              ))}
              <svg aria-hidden width={w} height={H + 48} className="absolute top-[0.1rem] left-0 overflow-visible">
                <g transform="translate(0 48)">
                  <path d={ticks((d) => d < at && !marked.has(d), (d) => (first(d) ? 16 : 9))} stroke="var(--foreground)" strokeWidth={1} fill="none" opacity={0.42} />
                  <path d={ticks((d) => d > at && !marked.has(d), (d) => (first(d) ? 16 : 6))} stroke="var(--foreground)" strokeWidth={1} fill="none" opacity={0.22} />
                  {at >= 0 && at < days && <path d={`M${x(at)} ${H}V${H - 26}`} stroke="var(--primary)" strokeWidth={2} fill="none" />}
                  {placed.map(({ one, left, line }) => (
                    // Tall and in its colour, reaching up to its name.
                    <path key={one.id} d={`M${left} ${H}V${line < 0 ? 2 : line * 16 - 48}`} stroke={inkOf(one)} strokeWidth={1.75} fill="none" opacity={indexOf(one.day) < at ? 0.75 : 1} />
                  ))}
                  {shownDay !== null && <path d={`M${x(shownDay)} ${H + 2}V${H - 30}`} stroke="var(--foreground)" strokeWidth={1} fill="none" opacity={0.35} />}
                </g>
              </svg>
              {months.map((month) => (
                <span key={month.name} className="absolute top-[calc(48px+30px+0.55rem)] text-[0.6875rem] leading-none text-muted-foreground" style={{ left: x(month.d) - 0.5 }}>{month.name}</span>
              ))}
              {shownDay !== null && (
                <span className="pointer-events-none absolute -bottom-1 z-10 -translate-x-1/2 translate-y-full rounded-md bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10"
                  style={{ left: Math.max(70, Math.min(w - 70, x(shownDay))) }}>
                  <span className="font-medium">{dayMonth(`${dayAt(shownDay)}T12:00`, 'never')}</span>
                  <span className="text-muted-foreground"> · {near ? `${near.icon ? `${near.icon} ` : ''}${near.title}` : dayAt(shownDay) <= today ? 'click for its page' : 'click to mark it'}</span>
                </span>
              )}
            </>
          )}
        </div>
      </figure>
    </DayMarkMenu>
  )
}

/**
 * The marked days on the welcome's ruler, drawn into its box: each a tick the
 * ruler's full height in its colour, named above where there is room (never
 * over today's own label).
 */
export function RulerMarks({ start, days, width, today }: { start: string; days: number; width: number; today: string }): React.JSX.Element | null {
  const all = useMilestones(start, dayKey(noon(start).add(days - 1, 'day')))
  if (!width || !all.length) return null
  const step = width / days
  const x = (day: string): number => Math.round((daysBetween(start, day) + 0.5) * step) + 0.5
  const todayX = x(today)
  let end = -Infinity
  return (
    <>
      {all.map((one) => {
        const left = x(one.day)
        const named = Math.abs(left - todayX) > 90 && left > end + 8
        if (named) end = left + labelWidth(one)
        return (
          <span key={one.id} aria-hidden data-ruler-mark>
            <span className="absolute top-[1.4rem] h-[32px] w-[1.75px] -translate-x-1/2" style={{ left, background: inkOf(one), opacity: one.day < today ? 0.75 : 1 }} />
            {named && (
              <span className="absolute top-0 flex -translate-x-[1px] items-center gap-1 text-[0.75rem] leading-[1.1rem] font-medium whitespace-nowrap" style={{ left, color: inkOf(one) }}>
                {one.icon && <span>{one.icon}</span>}{one.title}
              </span>
            )}
          </span>
        )
      })}
    </>
  )
}

// --- the countdown

/** The next marked day, counted down: "3 days to Exam", a click to change it. Nothing when none is ahead. */
export function NextMark({ className = '', withinDays = 365 }: { className?: string; withinDays?: number }): React.JSX.Element | null {
  const today = dayKey()
  const all = useMilestones(today, dayKey(noon(today).add(withinDays, 'day')))
  const next = nextOf(all, today)
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
