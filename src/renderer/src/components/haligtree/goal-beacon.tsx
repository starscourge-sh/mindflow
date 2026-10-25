import { Tape } from './tape'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Flag, Minus } from 'lucide-react'
import { motion } from 'motion/react'
import { AliveIcon } from '@/components/ui/alive-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import XIcon from '@/components/ui/x-icon'
import { Tip, toast } from './ui'

import { EASE, shift, still } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { useAppearance, useLive, haligtree, type ItemFull } from '@/lib/haligtree'
import { useMilestones, type Milestone } from '@/lib/milestones'
import { DotMatrix } from './dot-matrix'
import { Answers, Journey, goalInk, markOf, openOnes, useToday, warmth } from './goals-view'
import { dayKey, dayMonth, num } from '../../../../main/dates'
import { daysBetween, daysLeft, leftSaid, percent, wayThrough } from '../../../../main/goal-days'
import { SandboxStamp } from '@/components/haligtree/sandbox'
import { SANDBOX } from '@/lib/sandbox'
import { Frost } from './frost'

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const STILL = { WebkitAppRegion: 'no-drag' } as CSSProperties

/** Made as real glass (the setting): the card fills its window. */
const GLASS = new URLSearchParams(location.search).has('glass')
/** A goal in its last week, due today or past its day: drawn warm. */
const pressing = (goalAt: string | null | undefined, today: string): boolean => Boolean(goalAt) && daysLeft(goalAt!, today) <= 7

/** The card's foot: on glass in the sandbox, room for the stamp. */
const FOOT = GLASS && SANDBOX ? 'pb-6' : 'pb-4'

/** A card's paper, lit from the top: solid theme paper (frosted over the desktop picture), or a 90% pane as glass. */
const PAPER = GLASS
  ? 'linear-gradient(rgb(255 255 255 / 0.05), transparent 40%), linear-gradient(color-mix(in oklab, var(--popover) 90%, transparent), color-mix(in oklab, var(--popover) 90%, transparent))'
  : 'linear-gradient(rgb(255 255 255 / 0.05), transparent 40%), linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))'
const SHADOW = GLASS ? '0 1px 2px rgb(0 0 0 / 0.16)' : '0 1px 2px rgb(0 0 0 / 0.14), 0 6px 16px -4px rgb(0 0 0 / 0.22)'
const CARD = `relative isolate flex h-full flex-col gap-2.5 ${GLASS ? 'rounded-[10px]' : 'rounded-xl border'} px-4 pt-3 ${FOOT} text-control text-foreground`
const HOVER_BUTTON = 'flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.97]'

type Goal = ItemFull

/** A sticky window's own: see-through round the card, and counted each time it is shown, so it arrives again rather than turning into wallpaper. */
function useArrival(): number {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    const onShow = (): void => void (document.visibilityState === 'visible' && setShown((count) => count + 1))
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])
  return shown
}

/** The window round a card: it comes in, keeps the card taped down, and on glass rises a little when pointed at. */
function Desk({ shown, children, onEnter, onLeave }: { shown: number; children: React.ReactNode; onEnter?: () => void; onLeave?: () => void }): React.JSX.Element {
  return (
    <motion.div
      key={shown}
      initial={still() ? false : { opacity: 0, transform: shift('translateY(8px) scale(0.98)') }}
      animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
      transition={{ duration: 0.24, ease: EASE }}
      // Paper keeps room round the card for its shadow (main's insetOf); glass is the card.
      className={GLASS ? 'group h-screen' : 'group h-screen p-5'}
      onPointerEnter={() => (onEnter?.(), GLASS && window.api.lift())}
      onPointerLeave={onLeave}
    >
      <div className="relative h-full">
        {children}
        <div className="pointer-events-none absolute inset-0 z-30"><SandboxStamp /></div>
        {/* The tape holding it to the desk. */}
        <div className="pointer-events-none absolute inset-0 z-30"><Tape inside={GLASS} /></div>
      </div>
    </motion.div>
  )
}

/**
 * One goal's card on the desktop, in a window of its own (see `beacons` in
 * main): that goal alone, its days left, its road with its logs, and the
 * days marked for it. Nothing of any other goal's. Pointed at, it stays
 * out; its X tucks it away till its next moment.
 */
export function GoalSticky({ id }: { id: string }): React.JSX.Element {
  useAppearance()
  const today = useToday()
  const shown = useArrival()
  // Tucked away by the clock to a slim tab at the screen's edge (main's shapeCard); pointed at, it opens.
  const [peek, setPeek] = useState<{ side: 'left' | 'right'; nudge: boolean } | null>(null)
  // Every sticky tucked away is drawn by the window's own tab (windows/sticky.tsx), not this one.
  useEffect(() => window.api.onBeaconPeek((one) => setPeek(one?.tucked ? null : one)), [])
  if (peek) return <PeekingCard id={id} today={today} side={peek.side} nudge={peek.nudge} />
  return (
    <Desk shown={shown} onEnter={() => window.api.holdBeacon(true)} onLeave={() => window.api.holdBeacon(false)}>
      <Card id={id} today={today} />
    </Desk>
  )
}

/**
 * One goal's card: frosted, the days left as the hero, in the focus timer's
 * dot figures and warming as the day nears, its next marked day, then the
 * road. Its flag wears the goal's colour, as on the goals' sticky.
 */
function Card({ id, today, preview }: { id: string; today: string; /** A goal not saved yet, shown as its card will look (the welcome): nothing on it acts, and it is not a window to drag. */ preview?: Goal }): React.JSX.Element | null {
  const live = useLive(() => (preview ? Promise.resolve(undefined) : haligtree.item(id)), undefined as Goal | undefined, [id, !!preview])
  const goal = preview ?? live
  const left = goal?.goalAt ? daysLeft(goal.goalAt, today) : 1
  // Only the days marked for this goal: never one marked for another goal, or for nothing in particular.
  const marks = useMilestones(today, goal?.goalAt ?? today).filter((one) => markOf(one) === id)
  // Its day reached, the road full: the card lights up all the way, once, the first time it is seen.
  const glow = useRef<HTMLSpanElement>(null)
  const full = left <= 0 && !preview && !!goal
  useEffect(() => {
    if (!full) return
    try {
      if (localStorage.getItem(`beacon-full:${id}`)) return
      localStorage.setItem(`beacon-full:${id}`, today)
    } catch {
      return
    }
    chime('goal')
    if (!still()) glow.current?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0.85, offset: 0.6 }, { opacity: 0 }], { duration: 2200, easing: 'ease-out' })
  }, [full, id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Past its day, the answer is given here: said back for a moment, with a way back, then the goal is settled.
  const [said, setSaid] = useState<'made it' | 'missed' | 'let go' | null>(null)
  useEffect(() => {
    if (!said) return
    // Settled, and still one Undo away: the toast opens it again, back on screen.
    const settled = setTimeout(() => void haligtree.closeGoal(id, said).then(() => toast(said === 'made it' ? 'Made it: kept under “Ended” in Goals' : said === 'missed' ? 'Missed: kept under “Ended” in Goals' : 'Gave it up: kept under “Ended” in Goals', () => void haligtree.reopenGoal(id))), 2600)
    return () => clearTimeout(settled)
  }, [said, id])
  if (!goal?.goalAt) return null
  const from = goal.goalFrom ?? dayKey(goal.createdAt)
  const warm = warmth(Math.max(left, 0))
  const urgent = pressing(goal.goalAt, today)
  const next = marks.find((one) => one.day >= today)
  return (
    <div
      data-private={goal.private ? '' : undefined}
      data-goal-card={id}
      style={{
        ...(!preview ? DRAG : {}),
        backgroundImage: PAPER,
        backgroundColor: GLASS ? undefined : 'Canvas',
        // In its last week, a warm rim as well.
        boxShadow: `${urgent ? `inset 0 0 0 1px color-mix(in oklab, ${warm} 45%, transparent), ${GLASS ? '' : `0 0 0 3px color-mix(in oklab, ${warm} 12%, transparent), `}` : ''}${SHADOW}`
      }}
      className={`${CARD} ${urgent ? 'border-transparent' : ''}`}
    >
      {!GLASS && !preview && <Frost />}
      {/* The once-only light of a full road: the goal's warmth all round the card, coming and going. */}
      <span ref={glow} aria-hidden className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0"
        style={{ boxShadow: `0 0 0 2px color-mix(in oklab, ${warm} 70%, transparent), 0 0 24px 2px color-mix(in oklab, ${warm} 45%, transparent), inset 0 0 18px color-mix(in oklab, ${warm} 22%, transparent)` }} />
      <div className="flex items-start gap-1.5">
        <Flag data-goal-flag className="mt-[0.2em] size-3.5 shrink-0" style={{ color: goalInk(goal) }} />
        {/* The whole goal, over two lines if it needs them: a goal cut short is not the goal. */}
        <p className="private-text line-clamp-2 min-w-0 flex-1 leading-snug font-medium text-balance">{goal.title}</p>
        <SandboxStamp inline />
        {/* Over the end of the title, only while pointed at: the title has the whole row the rest of the time. */}
        {!preview && (
          <span className="absolute top-2 right-2 z-10 flex items-center rounded-lg bg-popover opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100" style={STILL}>
            <button type="button" aria-label="Open it" title="Open it" onClick={() => (chime('open'), window.api.openInHome('goal', id))} className={HOVER_BUTTON}>
              <AliveIcon icon={ExternalLinkIcon} size={14} />
            </button>
            {/* A − as on a task's sticky, not a ×: it only steps out of sight, the goal is kept as it is. */}
            <Tip label="Hide it for now. The goal stays as it is, and the card comes back">
              <button type="button" aria-label="Hide it for now" onClick={() => (chime('tuck'), window.api.tuckBeacon(id))} className={HOVER_BUTTON}>
                <Minus className="size-3.5" strokeWidth={2.25} />
              </button>
            </Tip>
          </span>
        )}
      </div>
      {said ? (
        <div data-beacon-said className="flex flex-col gap-1">
          <p className="font-heading text-2xl font-bold tracking-tight">{said === 'made it' ? 'Made it.' : said === 'missed' ? 'Missed.' : 'Gave it up.'}</p>
          <span className="flex items-center gap-2 text-control text-muted-foreground">
            {said === 'made it' ? 'Well done.' : 'Kept under “Ended”.'}
            <button type="button" style={STILL} onClick={() => (chime('undo'), setSaid(null))} className="rounded-full px-2 py-0.5 font-semibold text-foreground hover:bg-accent">Undo</button>
          </span>
        </div>
      ) : left < 0 ? (
        // The question comes to you: answered here, not only on the Goals page.
        <div className="flex flex-col gap-2">
          <p className="font-heading text-2xl font-bold tracking-tight">Did you make it?</p>
          <span style={STILL} className="self-start">
            <Answers item={goal} small onPick={(how) => (chime(how === 'made it' ? 'answered' : how === 'missed' ? 'called' : 'release'), setSaid(how))} />
          </span>
          <span className="text-control text-muted-foreground">{dayMonth(`${goal.goalAt}T12:00`)} has passed.</span>
        </div>
      ) : (
        <div className="flex items-end gap-3" style={{ color: left > 30 ? 'var(--foreground)' : warmth(left) }}>
          {left === 0
            ? <span className="font-heading text-4xl leading-none font-bold tracking-tight">Today</span>
            : <DotMatrix text={String(left)} className="h-12" />}
          <span className="pb-0.5 text-xs leading-tight text-muted-foreground">
            {left === 0 ? 'is the day' : left === 1 ? 'day left' : 'days left'}<br />
            to {dayMonth(`${goal.goalAt}T12:00`)} · {percent(wayThrough(from, goal.goalAt))}
          </span>
        </div>
      )}
      {/* The next day marked for this goal, if there is one before its day. */}
      {next && !said && left >= 0 && (
        <p data-goal-next={next.id} className="flex min-w-0 items-center gap-1.5 text-control leading-snug">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: next.color ? `var(--tt-color-text-${next.color})` : goalInk(goal) }} />
          <span title={next.title} className="private-text min-w-0 truncate">{next.icon ? `${next.icon} ` : ''}{next.title}</span>
          <span className="shrink-0 text-muted-foreground tabular-nums">{inDays(next.day, today)}</span>
        </p>
      )}
      <div className="min-h-0 flex-1 text-foreground"><Journey compact goal={id} from={from} target={goal.goalAt} today={today} logs={goal.glosses} /></div>
    </div>
  )
}

/**
 * A goal's card peeking: its window is a slim tab at the screen's edge, and
 * the tab is the goal's ring of time gone, in its colour, over the days left.
 * Pointed at, the card opens out of it, with paper's slide.
 */
function PeekingCard({ id, today, side, nudge }: { id: string; today: string; side: 'left' | 'right'; nudge: boolean }): React.JSX.Element {
  const goal = useLive(() => haligtree.item(id), undefined as Goal | undefined, [id])
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])
  const from = goal?.goalAt ? goal.goalFrom ?? dayKey(goal.createdAt) : today
  return (
    <div className="h-screen w-screen" onPointerEnter={() => (chime('slide'), window.api.holdBeacon(true))}>
      <GoalTab side={side} nudge={nudge} gone={goal?.goalAt ? wayThrough(from, goal.goalAt) : 0} left={goal?.goalAt ? daysLeft(goal.goalAt, today) : null} ink={goal ? goalInk(goal) : 'var(--muted-foreground)'} title={goal?.title ?? ''} />
    </div>
  )
}

/** The tab itself: square on the screen's edge, round on the side facing in. Also Settings' preview of it. */
export function GoalTab({ side, nudge = false, gone, left, ink, title, className = '' }: { side: 'left' | 'right'; nudge?: boolean; gone: number; left: number | null; ink: string; title: string; className?: string }): React.JSX.Element {
  const R = 11
  const round = 2 * Math.PI * R
  const away = side === 'right' ? 24 : -24
  // Out by itself after days tucked: it comes in with a small wiggle, to be seen, then rests.
  const wiggle = side === 'right' ? [away, -6, 3, -2, 0] : [away, 6, -3, 2, 0]
  return (
    <motion.div
      data-goal-tab={side}
      aria-label={`${title}: ${left === null ? '' : left < 0 ? 'past its day' : `${left} ${left === 1 ? 'day' : 'days'} left`}`}
      initial={still() ? false : { opacity: 0, x: away }}
      animate={{ opacity: 1, x: nudge && !still() ? wiggle : 0 }}
      transition={nudge ? { duration: 0.7, ease: EASE } : { duration: 0.24, ease: EASE }}
      style={{ backgroundImage: PAPER, backgroundColor: 'Canvas', boxShadow: SHADOW }}
      className={`flex h-full flex-col items-center justify-center gap-1.5 border ${side === 'right' ? 'rounded-l-xl border-r-0' : 'rounded-r-xl border-l-0'} text-foreground ${className}`}
    >
      <svg viewBox="0 0 28 28" className="size-7 -rotate-90" aria-hidden>
        <circle cx="14" cy="14" r={R} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={3} />
        <circle cx="14" cy="14" r={R} fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${round * Math.min(1, Math.max(0, gone))} ${round}`} />
      </svg>
      <span className="font-heading text-base leading-none font-bold tabular-nums">{left === null ? '' : left < 0 ? '!' : num(left)}</span>
      <span className="text-[10px] leading-none text-muted-foreground">{left !== null && left >= 0 ? (left === 1 ? 'day' : 'days') : ''}</span>
    </motion.div>
  )
}

/** "today", "tomorrow", "in 12 days". */
const inDays = (day: string, today: string): string => {
  const left = daysBetween(today, day)
  return left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${num(left)} days`
}

/**
 * A goal's card as it will sit on the desktop, before it is saved: the real
 * card, filled with the words and day given, taped down, nothing on it to
 * press. The welcome shows it as a goal is typed.
 */
export function GoalCardPreview({ title, goalAt }: { title: string; goalAt: string }): React.JSX.Element {
  const today = useToday()
  const goal = { id: 'preview', title, goalAt, goalFrom: today, private: 0, createdAt: new Date().toISOString(), glosses: [] } as unknown as Goal
  return (
    <div data-goal-preview className="relative h-[328px] w-[268px]">
      <Card id="preview" today={today} preview={goal} />
      <div className="pointer-events-none absolute inset-0"><Tape /></div>
    </div>
  )
}

/** Something on the way for one goal: a day marked for it, or its own day. */
type Coming = { goal: Goal; day: string; title: string; icon?: string | null; mark?: Milestone }

/**
 * Every open goal on one sticky, put up by hand ("Show all goals on one
 * sticky"): a lane each on one shared stretch of days, from the first goal's
 * start to the last goal's day, with a line for today across them all. Each
 * lane, its logs, its marked days and its day wear its goal's colour; what
 * comes next is listed under them; the legend at the foot names each colour.
 * A legend entry clicked brings that goal forward and dims the rest; clicked
 * again, or Esc, all of them again.
 */
/** How many goals the shared sticky draws a lane for, the nearest first. */
const LANES = 6

export function GoalsSticky(): React.JSX.Element {
  useAppearance()
  const today = useToday()
  const shown = useArrival()
  const goals = useLive(async () => Promise.all(openOnes(await haligtree.items('goal')).map((one) => haligtree.item(one.id))).then((all) => all.filter((one): one is Goal => !!one?.goalAt)),
    [] as Goal[], [], undefined, 'goals-sticky')
  const marks = useMilestones(null, null)
  const [focus, setFocus] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  // The goal focused has ended or gone: all of them again.
  const focused = goals.find((one) => one.id === focus) ?? null
  const focusNow = useRef(focus)
  focusNow.current = focus
  const takeDown = useRef<() => void>(() => undefined)
  takeDown.current = (): void => {
    if (!asking) return (chime('tap'), setAsking(true))
    chime('unstick')
    window.api.takeDownSticky('All goals')
  }
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setAsking(false)
        if (focusNow.current) (chime('off'), setFocus(null))
        return
      }
      // ⌘W does just what its X does: the window has no close of its own.
      if (!event.metaKey || event.key.toLowerCase() !== 'w') return
      event.preventDefault()
      takeDown.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  // The nearest few, each named on its own lane; the rest counted, a click away in Goals.
  const near = [...goals].sort((a, b) => a.goalAt!.localeCompare(b.goalAt!)).slice(0, LANES)
  const more = goals.length - near.length

  // One stretch of days for every lane: the first start to the last day, today always on it.
  const start = goals.reduce((first, one) => ((one.goalFrom ?? dayKey(one.createdAt)) < first ? (one.goalFrom ?? dayKey(one.createdAt)) : first), today)
  const end = goals.reduce((last, one) => (one.goalAt! > last ? one.goalAt! : last), today)
  const span = Math.max(1, daysBetween(start, end))
  const x = (day: string): number => Math.min(100, Math.max(0, (daysBetween(start, day) / span) * 100))
  const marksOf = (goal: Goal): Milestone[] => marks.filter((one) => markOf(one) === goal.id)
  const dim = (goal: Goal): number => (focused && focused.id !== goal.id ? 0.18 : 1)
  // What comes next, for every goal or the one focused: its marked days still ahead, then its own day.
  const coming: Coming[] = (focused ? [focused] : goals)
    .flatMap((goal): Coming[] => [
      ...marksOf(goal).filter((one) => one.day >= today && one.day <= goal.goalAt!).map((mark) => ({ goal, day: mark.day, title: mark.title, icon: mark.icon, mark })),
      { goal, day: goal.goalAt!, title: goal.title }
    ])
    .sort((a, b) => a.day.localeCompare(b.day))
    // A few: a goal rested on says itself in full above them.
    .slice(0, focused ? 2 : 3)
  return (
    <Desk shown={shown}>
      <div data-goals-sticky style={{ ...DRAG, backgroundImage: PAPER, backgroundColor: GLASS ? undefined : 'Canvas', boxShadow: SHADOW }} className={CARD}>
        {!GLASS && <Frost />}
        <div className="flex items-center gap-1.5">
          <Flag className="size-3.5 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 truncate font-medium">Goals</p>
          <SandboxStamp inline />
          <span className="text-[11px] leading-none font-medium text-foreground/70 tabular-nums transition-opacity duration-200 group-hover:opacity-0">
            {goals.length === 1 ? '1 goal' : `${num(goals.length)} goals`}
          </span>
          <span className="absolute top-2 right-2 z-10 flex items-center rounded-lg bg-popover opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100" style={STILL}>
            <button type="button" title="Open Goals" aria-label="Open Goals" onClick={() => (chime('open'), window.api.openInHome(focused ? 'goal' : 'view', focused ? focused.id : 'goals'))} className={HOVER_BUTTON}>
              <AliveIcon icon={ExternalLinkIcon} size={14} />
            </button>
            <button type="button" data-goals-takedown title={asking ? 'Press again to take it down' : 'Take it down'} aria-label="Take it down" onClick={() => takeDown.current()}
              className={`${HOVER_BUTTON} ${asking ? 'bg-accent text-foreground' : ''}`}>
              <AliveIcon icon={XIcon} size={14} />
            </button>
          </span>
        </div>
        {asking && <p className="text-control font-medium">Take this sticky down? Press its X again. Esc keeps it.</p>}
        {!goals.length ? (
          <p className="text-control text-foreground">No open goals. Set one in Goals and it shows here.</p>
        ) : (
          <>
            {/* The lanes, one stretch of days, today a line across them all. */}
            <div data-goals-lanes className="relative flex flex-col gap-1.5 pt-3">
              <span aria-hidden className="absolute top-0 bottom-0 w-px bg-foreground/40" style={{ left: `${x(today)}%` }} />
              <span className="absolute top-0 -translate-x-1/2 text-[10px] leading-none font-medium text-foreground/80" style={{ left: `clamp(1.25rem, ${x(today)}%, calc(100% - 1.25rem))` }}>Today</span>
              {near.map((goal) => {
                const ink = goalInk(goal)
                const from = goal.goalFrom ?? dayKey(goal.createdAt)
                return (
                  // Named on its own lane, never by colour alone (two goals may share one):
                  // resting on it says it in full below, a click opens it.
                  <button key={goal.id} type="button" data-goals-lane={goal.id} data-color={goal.goalColor ?? ''} title={`Open “${goal.title}”`}
                    onPointerEnter={() => setFocus(goal.id)} onPointerLeave={() => setFocus((was) => (was === goal.id ? null : was))} onFocus={() => setFocus(goal.id)} onBlur={() => setFocus(null)}
                    onClick={() => (chime('open'), window.api.openInHome('goal', goal.id))}
                    className="-mx-1 block rounded-md px-1 pt-0.5 text-left transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.04]" style={{ opacity: dim(goal) }}>
                  <span className="flex min-w-0 items-baseline gap-2 text-[11px] leading-tight">
                    <span data-goals-name className="private-text min-w-0 flex-1 truncate font-medium text-foreground">{goal.title}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">{inDays(goal.goalAt!, today)}</span>
                  </span>
                  <span className="relative block h-3.5">
                    {/* The whole road faint, the part gone solid. */}
                    <span className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ left: `${x(from)}%`, width: `${Math.max(1, x(goal.goalAt!) - x(from))}%`, background: `color-mix(in oklab, ${ink} 28%, transparent)` }} />
                    <span className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ left: `${x(from)}%`, width: `${Math.max(0, Math.min(x(today), x(goal.goalAt!)) - x(from))}%`, background: ink }} />
                    {/* Its logs, small dots above the road. */}
                    {[...new Set(goal.glosses.map((one) => dayKey(one.createdAt)))].map((day) => (
                      <span key={day} data-goals-log className="absolute top-0 size-1 -translate-x-1/2 rounded-full" style={{ left: `${x(day)}%`, background: ink }} />
                    ))}
                    {/* The days marked for it: rings. */}
                    {marksOf(goal).filter((one) => one.day >= from && one.day <= goal.goalAt!).map((one) => (
                      <span key={one.id} data-goals-mark={one.id} title={one.title} className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-popover" style={{ left: `${x(one.day)}%`, borderColor: ink }} />
                    ))}
                    {/* Its day: a full dot, ringed. */}
                    <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(goal.goalAt!)}%`, background: ink, boxShadow: `0 0 0 2px var(--popover), 0 0 0 3px ${ink}` }} />
                  </span>
                  </button>
                )
              })}
              {more > 0 && (
                <button type="button" data-goals-more onClick={() => (chime('open'), window.api.openInHome('view', 'goals'))}
                  className="self-start rounded-md px-1 text-[11px] font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground">and {num(more)} more</button>
              )}
            </div>
            {/* The goal focused, said in full. */}
            {focused && (
              <p data-goals-focus={focused.id} className="text-control leading-snug">
                <span className="private-text font-semibold">{focused.title}</span>
                <span className="text-foreground"> · {leftSaid(daysLeft(focused.goalAt!, today))}, {percent(wayThrough(focused.goalFrom ?? dayKey(focused.createdAt), focused.goalAt!))} of the way</span>
              </p>
            )}
            {/* What comes next, in the colour of the goal it is for. */}
            <ul className="flex flex-col gap-1">
              {coming.map((one) => (
                <li key={`${one.goal.id}:${one.mark?.id ?? 'day'}`} data-goals-item={one.goal.id} data-goals-item-mark={one.mark?.id} className="flex min-w-0 items-center gap-1.5 text-control leading-snug">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: goalInk(one.goal) }} />
                  {/* A goal's own day carries its flag; a day marked for it, its emoji. */}
                  {!one.mark && <Flag aria-label="The goal's day" className="size-3 shrink-0" style={{ color: goalInk(one.goal) }} />}
                  <span title={one.title} className="private-text min-w-0 truncate">{one.mark ? `${one.icon ? `${one.icon} ` : ''}${one.title}` : one.title}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">{inDays(one.day, today)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Desk>
  )
}
