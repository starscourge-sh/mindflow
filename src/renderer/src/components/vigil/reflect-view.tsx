import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { shift } from '@/lib/motion'
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowLeftIcon from '@/components/ui/arrow-narrow-left-icon'
import ArrowNarrowRightIcon from '@/components/ui/arrow-narrow-right-icon'
import XIcon from '@/components/ui/x-icon'

import { chime } from '@/lib/sound'
import { useLive } from '@/lib/vigil'
import { issues, type MonthTold } from '@/lib/issues'
import { Button } from '@/components/ui/button'
import { Kbd, Rolling, Tip, Typed } from './ui'
import { IssueLine, SERIF } from './issue'
import { dayjs, num, weekdayName } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowLeft = alive(ArrowNarrowLeftIcon)
const ArrowRight = alive(ArrowNarrowRightIcon)
const X = alive(XIcon)

/**
 * Your month, told back: a line that names it, a few sentences made only
 * from what you caught, three figures, the month as one line rising and
 * falling, and what it was about as one bar. Nothing is sent anywhere and
 * nothing is guessed: every word comes from counts in your own notes. A
 * season you named on the month's page is the headline, since your words
 * for it beat any the app could find.
 */

const EASE = [0.16, 1, 0.3, 1] as const
/** Topic colours, always in this order; anything past them is Other, in grey. */
const TOPIC = ['purple', 'blue', 'green', 'orange', 'pink'].map((name) => `var(--tt-color-text-${name})`)

const plural = (n: number, one: string, many = `${one}s`): string => `${num(n)} ${n === 1 ? one : many}`
const list = (words: string[]): string => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)
const quoted = (text: string): string => `“${text.length > 60 ? `${text.slice(0, 58).trimEnd()}…` : text}”`

/** The topics, each with its share of every tag used that month; past five, one Other. */
function topics(told: MonthTold): { name: string; share: number; color: string }[] {
  const total = told.tags.reduce((sum, tag) => sum + tag.n, 0)
  if (!total) return []
  const head = told.tags.slice(0, TOPIC.length).map((tag, index) => ({ name: `#${tag.name}`, share: tag.n / total, color: TOPIC[index] }))
  const rest = 1 - head.reduce((sum, one) => sum + one.share, 0)
  return rest > 0.005 ? [...head, { name: 'Other', share: rest, color: 'var(--tt-color-text-gray)' }] : head
}
const percent = (share: number): string => `${Math.max(1, Math.round(share * 100))}%`

/** The one line at the top: your season if you named it, else what the month leaned on. */
function headline(told: MonthTold, name: string): string {
  if (told.fields.season) return told.fields.season
  const [a, b] = topics(told)
  if (!told.captures) return `${name}, quiet.`
  if (a && a.name !== 'Other' && a.share >= 0.35) return `${name}, mostly ${a.name}.`
  if (a && b && b.name !== 'Other') return `${name}, between ${a.name} and ${b.name}.`
  if (told.questions.length) return `${name}, a month of questions.`
  return `${name}, in ${plural(told.captures, 'capture')}.`
}

/** A few sentences, each one only if there is something true to say. */
function prose(told: MonthTold, name: string, before: string): string {
  const said: string[] = []
  const change = told.before ? (told.captures > told.before ? `, up from ${num(told.before)} in ${before}` : told.captures < told.before ? `, down from ${num(told.before)} in ${before}` : `, the same as ${before}`) : ''
  said.push(`You caught ${plural(told.captures, 'thing')} in ${name}${change}.`)
  if (told.weekday && told.hour) said.push(`Most of it came on ${weekdayName(told.weekday.day)}s, around ${told.hour.hour}:00.`)
  const shown = topics(told).filter((one) => one.name !== 'Other').slice(0, 3)
  if (shown.length) said.push(`It gathered around ${list(shown.map((one, index) => (index < 2 ? `${one.name} (${percent(one.share)})` : one.name)))}.`)
  if (told.sources.length) said.push(`You listened most to ${list(told.sources.slice(0, 2).map((one) => one.name))}.`)
  if (told.kept || told.letGo) said.push(told.kept ? `You kept ${plural(told.kept, 'nugget')}${told.letGo ? ` and let ${num(told.letGo)} go` : ''}.` : `You let ${num(told.letGo)} go, which keeps the promise as well as keeping does.`)
  if (told.articles.length) said.push(`You started ${told.articles.length === 1 ? `an article, ${quoted(told.articles[0])}` : `${num(told.articles.length)} articles, the first ${quoted(told.articles[0])}`}.`)
  if (told.questions.length) said.push(`You began holding ${told.questions.length === 1 ? `a question: ${quoted(told.questions[0])}` : `${num(told.questions.length)} questions, the newest ${quoted(told.questions.at(-1)!)}`}.`)
  if (told.reviewed) said.push(`The one you came back to most was ${quoted(told.reviewed.title)}, ${plural(told.reviewed.n, 'time')}.`)
  return said.join(' ')
}

/** A label in small spaced capitals, over a hairline when it heads a section. */
function Label({ children, rule = false }: { children: React.ReactNode; rule?: boolean }): React.JSX.Element {
  return <h3 className={`text-[0.6875rem] font-medium tracking-[0.12em] text-muted-foreground uppercase ${rule ? 'border-b border-border/70 pb-2' : 'mt-1.5'}`}>{children}</h3>
}

/**
 * A smooth line through each day's count that never dips below nothing or
 * bulges past a peak (Fritsch and Carlson's monotone curve), as an SVG path
 * in a box `w` by `h`.
 */
function smooth(values: number[], w: number, h: number, top: number): { line: string; area: string } {
  const n = values.length
  const x = (i: number): number => (n < 2 ? w / 2 : (i / (n - 1)) * w)
  const y = (v: number): number => h - (v / top) * (h - 6)
  const slopes = values.slice(1).map((v, i) => (v - values[i]) / (x(i + 1) - x(i)))
  const tangent = values.map((_, i) => {
    if (i === 0) return slopes[0] ?? 0
    if (i === n - 1) return slopes[n - 2] ?? 0
    const [a, b] = [slopes[i - 1], slopes[i]]
    return (Math.sign(a) + Math.sign(b)) * Math.min(Math.abs(a), Math.abs(b), Math.abs(a + b) / 4)
  })
  let line = `M${x(0)},${y(values[0] ?? 0)}`
  for (let i = 0; i < n - 1; i++) {
    const dx = (x(i + 1) - x(i)) / 3
    line += ` C${x(i) + dx},${y(values[i]) - tangent[i] * dx * ((h - 6) / top)} ${x(i + 1) - dx},${y(values[i + 1]) + tangent[i + 1] * dx * ((h - 6) / top)} ${x(i + 1)},${y(values[i + 1])}`
  }
  return { line, area: `${line} L${x(n - 1)},${h} L${x(0)},${h} Z` }
}

/** The month, a day at a time: a crosshair and the day's count under the pointer. */
function Activity({ days, month }: { days: number[]; month: string }): React.JSX.Element {
  const [at, setAt] = useState<number | null>(null)
  const top = Math.max(2, ...days)
  const [w, h] = [600, 120]
  const { line, area } = smooth(days, w, h, top)
  const still = document.documentElement.dataset.motion === 'off'
  const x = (i: number): string => `${days.length < 2 ? 50 : (i / (days.length - 1)) * 100}%`
  const date = (i: number): string => dayjs(`${month}-01`).add(i, 'day').format('ddd D MMM')
  return (
    <div className="relative mt-4">
      <div className="pointer-events-none absolute inset-x-0 top-[6px] flex items-center gap-2" aria-hidden>
        <span className="w-6 text-right font-mono text-[0.625rem] text-muted-foreground tabular-nums">{num(top)}</span>
        <span className="h-px flex-1 border-t border-dashed border-border" />
      </div>
      <span aria-hidden className="pointer-events-none absolute bottom-6 left-0 w-6 text-right font-mono text-[0.625rem] leading-none text-muted-foreground">0</span>
      <div
        className="relative ml-8 h-[7.5rem]"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setAt(Math.max(0, Math.min(days.length - 1, Math.round(((event.clientX - box.left) / box.width) * (days.length - 1)))))
        }}
        onPointerLeave={() => setAt(null)}
      >
        {/* Drawn left to right, the month passing: a wipe, since a stroke that
            keeps its width cannot be traced along its length. */}
        <motion.svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible"
          initial={still ? false : { clipPath: 'inset(-4px 100% -4px -4px)' }} animate={{ clipPath: 'inset(-4px -4px -4px -4px)' }} transition={{ duration: 1.2, ease: EASE }} role="img" aria-label={`Captures a day through ${dayjs(`${month}-01`).format('MMMM')}`}>
          <defs>
            <linearGradient id="mf-reflect-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--tt-brand-color-400)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--tt-brand-color-400)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" x2={w} y1={h} y2={h} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          <path d={area} fill="url(#mf-reflect-fill)" />
          <path d={line} fill="none" stroke="var(--tt-brand-color-400)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </motion.svg>
        {at !== null && (
          <>
            <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-foreground/25" style={{ left: x(at) }} />
            <span aria-hidden className="pointer-events-none absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-background bg-[var(--tt-brand-color-400)]"
              style={{ left: x(at), bottom: `${(days[at] / top) * (1 - 6 / h) * 100}%` }} />
            <span className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md border bg-popover px-2 py-0.5 text-meta whitespace-nowrap text-popover-foreground shadow-[0_4px_14px_-6px_rgb(0_0_0/0.35)]"
              style={{ left: `clamp(3.5rem, ${x(at)}, calc(100% - 3.5rem))` }}>
              {date(at)} · <span className="tabular-nums">{plural(days[at], 'capture')}</span>
            </span>
          </>
        )}
      </div>
      <div className="ml-8 mt-2 flex justify-between font-mono text-[0.625rem] text-muted-foreground tabular-nums">
        <span>{date(0)}</span>
        {days.length > 20 && <span>{date(Math.floor((days.length - 1) / 2))}</span>}
        <span>{date(days.length - 1)}</span>
      </div>
    </div>
  )
}

/** What it was about: one bar cut by topic, each named under it with its share. */
function About({ told }: { told: MonthTold }): React.JSX.Element | null {
  const parts = topics(told)
  if (!parts.length) return null
  return (
    <section className="mt-10">
      <Label rule>What it was about</Label>
      {/* Laid out at its shares once, then wiped in from the left: a clip
          rather than growing each part, so nothing is laid out again. */}
      <motion.div className="mt-4 flex h-2.5 gap-[2px]" initial={{ clipPath: 'inset(0 100% 0 0)' }} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ delay: 0.3, duration: 0.8, ease: EASE }}>
        {parts.map((part) => (
          <Tip key={part.name} label={`${part.name} · ${percent(part.share)}`}>
            <span className="h-full first:rounded-l-full last:rounded-r-full" style={{ background: part.color, flexGrow: part.share }} />
          </Tip>
        ))}
      </motion.div>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {parts.map((part) => (
          <li key={part.name} className="flex min-w-0 items-baseline gap-2 text-body">
            <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] self-center rounded-full" style={{ background: part.color }} />
            <span className="max-w-48 truncate text-foreground">{part.name}</span>
            <span className="font-mono text-meta text-muted-foreground tabular-nums">{percent(part.share)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The month told back, over the page it was opened from. ← and → step
 * through the months; Escape closes.
 */
export function MonthReflect({ start, onClose }: { start?: string; onClose: () => void }): React.JSX.Element {
  const thisMonth = dayjs().format('YYYY-MM')
  // Early in a month there is little to tell: the month before, unless asked.
  const [month, setMonth] = useState(start ?? (dayjs().date() < 7 ? dayjs().subtract(1, 'month').format('YYYY-MM') : thisMonth))
  const told = useLive(() => issues.month(month), null as MonthTold | null, [month])
  const ready = told?.month === month ? told : null
  const go = (by: number): void => {
    const to = dayjs(`${month}-01`).add(by, 'month').format('YYYY-MM')
    if (to > thisMonth) return chime('nope')
    chime('season')
    setMonth(to)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft') go(-1)
      else if (event.key === 'ArrowRight') go(1)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  const at = dayjs(`${month}-01`)
  const name = at.format('MMMM')
  // The days so far, for this month: tomorrow has nothing to say yet.
  const days = ready ? (month === thisMonth ? ready.days.slice(0, dayjs().date()) : ready.days) : []
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
      className="absolute inset-0 z-40 flex flex-col bg-background" role="dialog" aria-label={`${name}, told back`}>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-5 text-muted-foreground">
        <span className="mr-auto text-control">Your month <span className="text-muted-foreground/70">· made from your notes, on this Mac</span></span>
        <Tip label="The month before  ←"><Button variant="ghost" size="icon-sm" aria-label="The month before" onClick={() => go(-1)}><ArrowLeft className="size-3.5" /></Button></Tip>
        <Tip label="The month after  →"><Button variant="ghost" size="icon-sm" aria-label="The month after" disabled={month === thisMonth} onClick={() => go(1)}><ArrowRight className="size-3.5" /></Button></Tip>
        <Tip label={<span className="flex items-center gap-2">Close <Kbd>Esc</Kbd></span>}><Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}><X className="size-4" /></Button></Tip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto w-full max-w-[42rem] px-6 pt-8 pb-20">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-border/60 pb-2">
            <IssueLine parts={[at.format("MMMM 'YY"), ready ? `${plural(ready.captures, 'capture')}` : '']} />
          </div>
          {ready && (
            <motion.div key={month} initial={{ opacity: 0, transform: shift('translateY(6px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} transition={{ duration: 0.3, ease: EASE }}>
              <h1 className={`mt-6 ${SERIF} text-[clamp(1.5rem,3.4vw,2.125rem)] leading-[1.15] font-medium tracking-[-0.015em] text-balance text-foreground`}>
                <Typed text={headline(ready, name)} step={18} delay={80} />
              </h1>
              {ready.fields.season && <p className="mt-1.5 text-meta text-muted-foreground">Your words for it, from {name}&rsquo;s page.</p>}
              {ready.captures > 0 ? (
                <>
                  <p className={`mt-5 ${SERIF} text-[1.0625rem] leading-[1.7] text-pretty text-foreground/85`}>{prose(ready, name, at.subtract(1, 'month').format('MMMM'))}</p>
                  <dl className="mt-10 grid grid-cols-3 gap-x-6 gap-y-6">
                    {[
                      [ready.weekday ? weekdayName(ready.weekday.day) : '–', 'Most active day'],
                      [ready.hour ? `${ready.hour.hour}:00` : '–', 'Peak hour'],
                      [ready.kept, 'Kept']
                    ].map(([value, label]) => (
                      <div key={String(label)} className="min-w-0">
                        <dd className={`truncate ${SERIF} text-[clamp(1.375rem,3vw,1.875rem)] leading-tight text-foreground tabular-nums`}><Rolling text={value} /></dd>
                        <dt><Label>{label}</Label></dt>
                      </div>
                    ))}
                  </dl>
                  <section className="mt-10">
                    <Label rule>When you caught things</Label>
                    <Activity days={days} month={month} />
                  </section>
                  <About told={ready} />
                </>
              ) : (
                <p className={`mt-5 ${SERIF} text-[1.0625rem] leading-[1.7] text-muted-foreground`}>Nothing was caught in {name}. That is allowed: a month can be lived rather than written down.</p>
              )}
            </motion.div>
          )}
        </article>
      </div>
    </motion.div>
  )
}
