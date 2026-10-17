import { useEffect, useState, type ReactElement } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { chime } from '@/lib/sound'
import { EASE, shift } from '@/lib/motion'
import { useLive, vigil, type Item, type Recap, type Settings, type SpanSession, type Task } from '@/lib/vigil'
import { taskName } from '@/lib/tasks'
import { Button } from '@/components/ui/button'
import { X } from '@/components/ui/icons'
import { Big, Ranked } from './recap-view'
import { Scenery } from './scenery'
import { Kbd, Tip, Typed, toast } from './ui'
import { PlanDid, plannedVsDid, shortSaid } from './planned-did'
import { streaks } from '../../../../main/focus-numbers'
import { dayjs, dayKey, dayName, noon, num, plural } from '../../../../main/dates'

/**
 * A month or a week, wrapped: a story of a few cards, one thing each, the
 * way Spotify Wrapped tells a year. What you captured most, your busiest
 * day, the hours of focus, planned against did, the gems kept, the longest
 * run of days, and what you said went well. Only cards with something true
 * to say are shown. ← and → (or a click on either side) turn, Esc closes.
 * Made from your own notes, on this Mac.
 *
 * It comes to you: once a month ends, the first open after the 1st offers
 * "Your October, wrapped" (WrapOffer), and the Sunday digest opens the week's.
 */

/** "month:2026-10" or "week:2026-10-12". */
export const openWrap = (id: string): void => void window.dispatchEvent(new CustomEvent('vigil:wrap', { detail: id }))
/** The month to wrap now: the one before until the 7th, as the recap reads it. */
export const monthToWrap = (): string => `month:${(dayjs().date() < 7 ? dayjs().subtract(1, 'month') : dayjs()).format('YYYY-MM')}`

type Span = { period: 'week' | 'month'; from: string; to: string }
const spanOf = (id: string): Span => {
  const [period, at] = id.split(':') as ['week' | 'month', string]
  const from = dayjs(period === 'month' ? `${at}-01` : at).startOf(period)
  return { period, from: dayKey(from), to: dayKey(from.endOf(period)) }
}

type Wrapped = {
  name: string
  recap: Recap
  focus: { minutes: number; sessions: number }
  plan: ReturnType<typeof plannedVsDid>
  gems: Item[]
  run: number
  well: string[]
}

async function wrapOf({ period, from, to }: Span): Promise<Wrapped> {
  const [since, until] = [dayjs(from).startOf('day').toISOString(), dayjs(to).endOf('day').toISOString()]
  const mondays: string[] = []
  for (let monday = dayjs(from).startOf('week'); dayKey(monday) <= to; monday = monday.add(1, 'week')) mondays.push(dayKey(monday))
  const [recap, sessions, tasks, gems, days, pages] = await Promise.all([
    vigil.recap(period, since),
    vigil.sessionsSpan(since, until) as Promise<SpanSession[]>,
    vigil.tasks() as Promise<Task[]>,
    vigil.items('nugget'),
    vigil.dayCaptures(from, to),
    Promise.all(mondays.map((monday) => vigil.period(`week:${monday}`)))
  ])
  const minutes = new Map<string, number>()
  const worked = new Set<string>()
  let total = 0
  for (const one of sessions) {
    const n = Math.max(0, ((one.endedAt ? Date.parse(one.endedAt) : Date.now()) - Date.parse(one.startedAt) - (one.pausedMs || 0)) / 60_000)
    minutes.set(one.taskId, (minutes.get(one.taskId) ?? 0) + n)
    worked.add(dayKey(one.startedAt))
    total += n
  }
  // A run of days with something caught or focused on, inside the span.
  const busy = new Set([...worked, ...Object.entries(days.counts).filter(([, n]) => n > 0).map(([day]) => day)].filter((day) => day >= from && day <= to))
  // What went well, in your words: each week's summary from Close the week, and its page's wins.
  const well = pages.flatMap((page) => [page.fields.summary, page.fields.wins]).flatMap((text) => (text ?? '').split('\n')).map((line) => line.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)
  return {
    name: period === 'month' ? dayjs(from).format(dayjs(from).isSame(dayjs(), 'year') ? 'MMMM' : 'MMMM YYYY') : `the week of ${dayjs(from).format('D MMMM')}`,
    recap,
    focus: { minutes: Math.round(total), sessions: sessions.length },
    plan: plannedVsDid(tasks, minutes, from, to),
    gems: gems.filter((gem) => !gem.private && dayKey(gem.createdAt) >= from && dayKey(gem.createdAt) <= to),
    run: streaks(busy, to).best,
    well: [...new Set(well)]
  }
}

const MOODS = ['day', 'day', 'dusk', 'dusk', 'interior', 'night', 'night', 'night'] as const
/** At most this many cards: the first and the last always, the rest by what there is to say. */
const MOST = 8

/** The story, over the window, when asked for (openWrap). */
export function WrapSheet(): React.JSX.Element | null {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    const ask = (event: Event): void => (chime('slide'), setId((event as CustomEvent<string>).detail))
    window.addEventListener('vigil:wrap', ask)
    return () => window.removeEventListener('vigil:wrap', ask)
  }, [])
  return <AnimatePresence>{id && <Story key={id} id={id} onClose={() => (chime('fold'), setId(null))} />}</AnimatePresence>
}

function Story({ id, onClose }: { id: string; onClose: () => void }): React.JSX.Element {
  const span = spanOf(id)
  const [data, setData] = useState<Wrapped | null>(null)
  useEffect(() => void wrapOf(span).then(setData), [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [at, setAt] = useState(0)
  const [dir, setDir] = useState(1)
  // Motion off skips every animation (lib/vigil.ts); Reduce motion keeps the fades and `shift` drops the slide.

  const cards: ReactElement[] = []
  if (data) {
    const { recap, focus, plan, gems, run, well, name } = data
    const title = span.period === 'month' ? `Your ${name}, wrapped` : 'Your week, wrapped'
    const quiet = !recap.captures && !focus.sessions && !plan.rows.length && !gems.length && !well.length
    cards.push(
      <div key="intro" className="space-y-3">
        <p className="text-heading text-muted-foreground">{span.period === 'month' ? 'Your month' : `${dayjs(span.from).format('D MMMM')} to ${dayjs(span.to).format('D MMMM')}`}</p>
        <h2 className="text-[clamp(2.25rem,8vw,4rem)] leading-none font-semibold text-foreground">{title}</h2>
        <p className="text-muted-foreground"><Typed story text={quiet ? `A quiet ${span.period}: nothing caught or focused on yet.` : 'What you caught, kept and gave your time to. → to go on.'} /></p>
      </div>
    )
    const middle: [number, ReactElement][] = []
    if (recap.tags.length) middle.push([1, (
      <div key="tags" className="space-y-5">
        <p className="text-title"><Typed story text={`${plural(recap.captures, 'thing')} caught. What you captured most:`} /></p>
        <Ranked rows={recap.tags} prefix="#" />
      </div>
    )])
    else if (recap.captures) middle.push([1, <div key="tags"><Big n={recap.captures}>{recap.captures === 1 ? 'thing caught' : 'things caught'}</Big></div>])
    if (focus.minutes >= 1) middle.push([2, (
      <div key="focus" className="space-y-6">
        {focus.minutes >= 60
          ? <Big n={Math.round(focus.minutes / 60)}>{Math.round(focus.minutes / 60) === 1 ? 'hour of focus' : 'hours of focus'}</Big>
          : <Big n={focus.minutes}>{focus.minutes === 1 ? 'minute of focus' : 'minutes of focus'}</Big>}
        <p className="text-title"><Typed story delay={1600} text={`Over ${plural(focus.sessions, 'session')}.`} /></p>
      </div>
    )])
    if (plan.rows.length) {
      const gaps = [...plan.rows].sort((a, b) => Math.abs(b.did - b.planned) - Math.abs(a.did - a.planned)).slice(0, 3)
      middle.push([3, (
        <div key="plan" className="space-y-6">
          <p className="text-title"><Typed story text={`You planned ${shortSaid(plan.planned)} and did ${shortSaid(plan.did)}.`} /></p>
          <ul className="space-y-2 text-heading">
            {gaps.map((row) => (
              <li key={row.task.id} className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate text-foreground">{taskName(row.task.title).text}</span>
                <PlanDid planned={row.planned} did={row.did} className="shrink-0 text-body text-foreground" />
              </li>
            ))}
          </ul>
        </div>
      )])
    }
    if (gems.length) middle.push([4, (
      <div key="gems" className="space-y-6">
        <Big n={gems.length}>{gems.length === 1 ? 'gem kept' : 'gems kept'}</Big>
        <ul className="space-y-1.5 text-heading text-foreground">{gems.slice(0, 3).map((gem) => <li key={gem.id} className="truncate">“{gem.title || 'Untitled'}”</li>)}</ul>
      </div>
    )])
    if (well.length) middle.push([5, (
      <div key="well" className="space-y-5">
        <p className="text-title"><Typed story text="What went well, in your words" /></p>
        <ul className="space-y-2 text-heading text-foreground">{well.slice(0, 4).map((line) => <li key={line}>“{line}”</li>)}</ul>
      </div>
    )])
    if (run >= 2) middle.push([6, (
      <div key="run" className="space-y-4">
        <Big n={run}>days in a row</Big>
        <p className="text-title"><Typed story delay={1400} text="Your longest run with something caught or focused on. Not a streak to keep: just how it went." /></p>
      </div>
    )])
    if (recap.busiestDay) middle.push([7, (
      <p key="busiest" className="text-title"><Typed story text={`Your busiest day was ${dayName(noon(recap.busiestDay.name), 'never')}: ${plural(recap.busiestDay.n, 'capture')}.`} /></p>
    )])
    // The most to say first, as many as fit between the first card and the last.
    cards.push(...middle.sort((a, b) => a[0] - b[0]).slice(0, MOST - 2).map(([, card]) => card))
    cards.push(
      <div key="outro" className="space-y-3">
        <p className="text-title"><Typed story text={`That was ${name}.`} /></p>
        <p className="text-muted-foreground"><Typed story delay={1200} text="Nothing here is a score. It is only what happened." /></p>
      </div>
    )
  }

  const last = cards.length - 1
  const key = String(cards[at]?.key ?? 'none')
  const go = (to: number): void => {
    const next = Math.max(0, Math.min(last, to))
    if (next === at) return
    chime(next === last ? 'wrapped' : 'page')
    setDir(next > at ? 1 : -1)
    setAt(next)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') onClose()
      else if (['ArrowRight', ' ', 'Enter', 'l', 'j'].includes(event.key)) go(at + 1)
      else if (['ArrowLeft', 'h', 'k'].includes(event.key)) go(at - 1)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <motion.div role="dialog" aria-modal aria-label={data ? `${span.period === 'month' ? data.name : 'Your week'}, wrapped` : 'Wrapped'} data-wrap-story={id}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col bg-[color-mix(in_srgb,var(--tt-brand-color-400)_8%,var(--background))]">
      <Scenery place="recap" seed={`wrap:${id}:${key}`} mood={[MOODS[Math.min(at, MOODS.length - 1)]]} text="left" className="absolute inset-0" />
      <div className="relative flex items-center gap-3 px-5 pt-4 [-webkit-app-region:no-drag]">
        {/* Where you are, as bars that fill: Wrapped's own way of saying how far. */}
        <div className="flex flex-1 gap-1.5">
          {cards.map((_, index) => (
            <button key={index} type="button" aria-label={`Card ${index + 1} of ${cards.length}`} aria-current={index === at || undefined} onClick={() => go(index)}
              className={`h-1 flex-1 rounded-full transition-colors duration-200 motion-reduce:transition-none ${index <= at ? 'bg-foreground' : 'bg-foreground/20'}`} />
          ))}
        </div>
        <span className="text-xs text-muted-foreground"><Kbd>←</Kbd> <Kbd>→</Kbd></span>
        <Tip label="Close  Esc"><Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}><X /></Button></Tip>
      </div>
      <div data-wrap-card={key} className="relative flex min-h-0 flex-1 items-center px-[8%]" onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        go(event.clientX - box.left > box.width / 3 ? at + 1 : at - 1)
      }}>
        <AnimatePresence mode="popLayout" custom={dir}>
          <motion.div key={at} className="w-full max-w-2xl font-heading"
            initial={{ opacity: 0, transform: shift(`translateX(${8 * dir}px)`) }}
            animate={{ opacity: 1, transform: shift('translateX(0px)'), transition: { duration: 0.2, ease: EASE } }}
            exit={{ opacity: 0, transform: shift(`translateX(${-8 * dir}px)`), transition: { duration: 0.12, ease: EASE } }}>
            {cards[at] ?? null}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

/**
 * The month's wrap, come to you: on the first open after a month ends,
 * "Your October, wrapped", once. Opened, or put away with Not now; a line
 * turns these offers off (Settings has it too). The very first time Vigil
 * sees a month go by it only notes it, so a new book is never greeted with
 * a month it was not there for.
 */
export function WrapOffer(): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
  const [offer, setOffer] = useState<string | null>(null)
  const month = dayjs().subtract(1, 'month').format('YYYY-MM')
  useEffect(() => {
    if (!settings || settings.wrapOffer === false || offer) return
    const seen = settings.wrapOffered ?? ''
    if (seen >= month) return
    if (!seen) return void vigil.setSettings({ wrapOffered: month })
    // Offered once, said so at once: a second window or a reload never offers it again.
    void vigil.setSettings({ wrapOffered: month })
    void vigil.recap('month', `${month}-01`).then((recap) => {
      if (!recap.captures && !recap.reviews) return
      setTimeout(() => (chime('noted'), setOffer(month)), 1500)
    })
  }, [settings, month]) // eslint-disable-line react-hooks/exhaustive-deps
  const name = offer ? dayjs(`${offer}-01`).format('MMMM') : ''
  const close = (): void => (chime('fold'), setOffer(null))
  const never = (): void => {
    close()
    void vigil.setSettings({ wrapOffer: false }).then(() => toast('No more monthly wraps offered. Settings has them, under What comes back to you', () => void vigil.setSettings({ wrapOffer: true })))
  }
  return (
    <AnimatePresence>
    {offer && <motion.aside data-wrap-offer={offer} aria-label={`Your ${name}, wrapped`}
      initial={{ opacity: 0, transform: shift('translateY(8px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} transition={{ duration: 0.3, ease: EASE }}
      exit={{ opacity: 0, transform: shift('translateY(8px)'), transition: { duration: 0.15, ease: EASE } }}
      className="fixed right-5 bottom-5 z-40 flex w-80 flex-col gap-3 rounded-xl border bg-background p-4 shadow-(--mf-panel-shadow)">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-heading text-heading font-semibold text-foreground">Your {name}, wrapped</p>
          <p className="mt-0.5 text-body text-foreground/85">{name} is over. A few cards on what it held: what you caught, your focus, planned against did.</p>
        </div>
        <Tip label="Not now"><button type="button" aria-label="Not now" onClick={close} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><X className="size-3.5" /></button></Tip>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" data-wrap-open onClick={() => (setOffer(null), openWrap(`month:${offer}`))}>Open</Button>
        <Button size="sm" variant="ghost" onClick={close}>Not now</Button>
        <span className="flex-1" />
        <button type="button" onClick={never} className="text-control text-foreground/75 underline-offset-2 hover:text-foreground hover:underline">Don't offer these</button>
      </div>
    </motion.aside>}
    </AnimatePresence>
  )
}

/** The Settings row's own words, so they read the same as the offer. */
export const WRAP_SETTING: { title: string; note: string; more: string } = {
  title: 'Your month, wrapped',
  note: 'After a month ends, the first time you open Vigil it offers that month as a few cards, once.',
  more: `What you captured most, your busiest day, focus hours, planned against did, gems kept, your longest run and what went well. The Sunday notification opens the week's. ${num(MOST)} cards at most; nothing leaves this Mac.`
}
