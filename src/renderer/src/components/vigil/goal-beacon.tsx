import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Flag } from 'lucide-react'
import { motion } from 'motion/react'
import { AliveIcon } from '@/components/ui/alive-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import RightChevronIcon from '@/components/ui/right-chevron'
import XIcon from '@/components/ui/x-icon'

import { EASE, shift } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { useAppearance, useLive, vigil } from '@/lib/vigil'
import { DotMatrix } from './dot-matrix'
import { Journey, TempusBars, useToday, warmth } from './goals-view'
import { dayKey, dayMonth } from '../../../../main/dates'
import { daysLeft, percent, wayThrough } from '../../../../main/goal-days'
import { SandboxStamp } from '@/components/vigil/sandbox'
import { Frost } from './frost'

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const STILL = { WebkitAppRegion: 'no-drag' } as CSSProperties

/** How often the stack rolls its top card to the back while it sits there. */
const ROLL_EVERY = 45_000
/** The cards drawn behind the top one: enough to read as a stack, never a pile. */
const BEHIND = 3
/** Each card behind sits a little lower and to the right, and leans its own way, as loose paper does. */
const TILT = [0, 1.3, -1, 1.8]
const pose = (depth: number): string =>
  `translate(${Math.min(depth, BEHIND) * 2}px, ${Math.min(depth, BEHIND) * 8}px) rotate(${TILT[Math.min(depth, BEHIND)]}deg) scale(1)`
/** The top card picked up: towards you, turned a little, kept inside the window. */
const LIFT = 'translate(8px, -2px) rotate(-2.5deg) scale(1.025)'
/** Motion off or Reduce motion: the stack changes at once, nothing travels. */
const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
/** A goal in its last week, due today or past its day: it stays on top and is drawn warm. */
const pressing = (goalAt: string | null | undefined, today: string): boolean => Boolean(goalAt) && daysLeft(goalAt!, today) <= 7

/** The paper of a card behind: the theme's own, a shade off the top card so its edge reads. */
const PAPER = 'color-mix(in oklab, var(--foreground) 5%, var(--popover))'

type Flight = { id: string; back: boolean; out: boolean }

/**
 * The goal stack: every goal's beacon that is out, in one small window on
 * every Space, made by the sticky notes' machinery (see `beacons` in main).
 * The nearest goal is the card on top, frosted; the others peek out under
 * it as plain paper edges, each in its goal's warmth. Every 45 seconds or so
 * the top card is picked up and slipped to the back, unless it is pointed at
 * or its goal is in its last week. Its wheel, its ‹ › and the edges flip it
 * by hand. It comes back each time it is shown, so it reads as arriving
 * rather than as wallpaper.
 */
export function GoalStack(): React.JSX.Element | null {
  useAppearance()
  const today = useToday()
  const [ids, setIds] = useState<string[]>([])
  const [at, setAt] = useState(0)
  const [flight, setFlight] = useState<Flight | null>(null)
  const [hovered, setHovered] = useState(false)
  // Turned since it was shown: Tempus's bars light up as it arrives, not on every turn.
  const [rolled, setRolled] = useState(false)
  // Shown again (tucked, then out at its moment): it arrives again, nearest goal on top.
  const [shown, setShown] = useState(0)
  const [visible, setVisible] = useState(document.visibilityState === 'visible')
  const topId = useRef<string | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const wheeled = useRef(0)
  const n = ids.length
  const top = n ? ((at % n) + n) % n : 0
  topId.current = ids[top] ?? null

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    // A new list keeps the same card on top where it can; one that left takes the first with it.
    let was = ''
    const take = (next: string[]): void => {
      if (next.join() === was) return
      was = next.join()
      const keep = topId.current ? next.indexOf(topId.current) : -1
      setIds(next)
      setAt(keep < 0 ? 0 : keep)
    }
    void window.api.beaconStack().then(take)
    const off = window.api.onBeaconStack(take)
    const onShow = (): void => {
      const now = document.visibilityState === 'visible'
      setVisible(now)
      if (now) (setShown((count) => count + 1), setAt(0), setRolled(false))
    }
    document.addEventListener('visibilitychange', onShow)
    return () => {
      off()
      document.removeEventListener('visibilitychange', onShow)
      timers.current.forEach(clearTimeout)
    }
  }, [])

  const first = useLive(() => (ids[0] ? vigil.item(ids[0]) : Promise.resolve(undefined)), undefined as Awaited<ReturnType<typeof vigil.item>> | undefined, [ids[0]])
  const firstPressing = pressing(first?.goalAt, today)

  /** One card from the top to the back (or back to the top), as a hand shuffles paper. */
  const roll = (step: 1 | -1, cue: 'page' | 'riffle'): void => {
    if (n < 2 || flight) return
    chime(cue)
    setRolled(true)
    const next = top + step
    setAt(next)
    if (still()) return
    const id = step === 1 ? ids[top] : ids[((next % n) + n) % n]
    timers.current.forEach(clearTimeout)
    setFlight({ id, back: step === -1, out: true })
    timers.current = [
      setTimeout(() => setFlight({ id, back: step === -1, out: false }), 150),
      setTimeout(() => setFlight(null), 390)
    ]
  }

  // On a schedule while it is out and left alone. A goal in its last week stays
  // on top: the stack goes round once more to it and then holds.
  useEffect(() => {
    if (n < 2 || hovered || !visible) return
    if (firstPressing && top === 0) return
    const timer = setTimeout(() => roll(1, 'page'), ROLL_EVERY)
    return () => clearTimeout(timer)
  }, [n, top, hovered, visible, firstPressing, flight === null])

  if (!n) return null
  const cards = ids
    .map((id, index) => ({ id, depth: (index - top + n) % n }))
    .filter(({ id, depth }) => depth <= BEHIND || flight?.id === id)
  return (
    <motion.div
      key={shown}
      initial={still() ? false : { opacity: 0, transform: shift('translateY(8px) scale(0.98)') }}
      animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
      transition={{ duration: 0.45, ease: EASE }}
      className="group h-screen pt-3.5 pr-[22px] pb-[42px] pl-3.5"
      onPointerEnter={() => (setHovered(true), window.api.holdBeacon(true))}
      onPointerLeave={() => (setHovered(false), window.api.holdBeacon(false))}
      onWheel={(event) => {
        // A flick of the wheel or two fingers turns one card, however long the swipe runs on.
        if (Math.abs(event.deltaY) < 12 || Date.now() - wheeled.current < 600) return
        wheeled.current = Date.now()
        roll(event.deltaY > 0 ? 1 : -1, 'riffle')
      }}
    >
      <div className="relative h-full">
        {cards.map(({ id, depth }) => {
          const flying = flight?.id === id ? flight : null
          // Picked up: over everything going out, under everything coming back (and the reverse for a card brought back).
          const z = flying ? (flying.out !== flying.back ? n + 1 : 0) : n - depth
          const front = depth === 0 || Boolean(flying?.out && !flying.back)
          return (
            <motion.div
              key={id}
              className="absolute inset-0"
              style={{ zIndex: z, transformOrigin: '50% 60%' }}
              initial={false}
              animate={{ transform: flying?.out ? LIFT : pose(depth) }}
              transition={still() ? { duration: 0 } : flying?.out ? { duration: 0.15, ease: EASE } : { duration: flying ? 0.24 : 0.3, ease: EASE }}
            >
              <Card id={id} today={today} front={front} shows={front || Boolean(flying)} stacked={n > 1} count={n > 1 && depth === 0 ? `${top + 1} of ${n}` : ''} ignite={!rolled}
                flip={(step) => roll(step, 'riffle')} />
            </motion.div>
          )
        })}
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: n + 2 }}><SandboxStamp /></div>
        {/* The edges peeking out under the top card: pointed at, the next one comes up. */}
        {n > 1 && <button type="button" tabIndex={-1} aria-label="The next goal" title="The next goal" onClick={() => roll(1, 'riffle')}
          className="absolute inset-x-0 top-[calc(100%-2px)] h-6 cursor-pointer" style={STILL} />}
      </div>
    </motion.div>
  )
}

/**
 * One goal's card. On top (`front`): frosted, with the days left as the hero,
 * in the focus timer's dot figures and warming as the day nears, then the
 * road and Tempus's four bars. Behind: plain paper tinted by the theme, its
 * bottom edge in the goal's warmth, its words drawn only while it is
 * moving (`shows`), so nothing under the top card catches the pointer.
 */
function Card({ id, today, front, shows, stacked, count, ignite, flip }: { id: string; today: string; front: boolean; shows: boolean; stacked: boolean; count: string; ignite: boolean; flip: (step: 1 | -1) => void }): React.JSX.Element | null {
  const goal = useLive(() => vigil.item(id), undefined as Awaited<ReturnType<typeof vigil.item>> | undefined, [id])
  if (!goal?.goalAt) return null
  const from = goal.goalFrom ?? dayKey(goal.createdAt)
  const left = daysLeft(goal.goalAt, today)
  const warm = warmth(Math.max(left, 0))
  const urgent = pressing(goal.goalAt, today)
  return (
    <div
      data-private={goal.private ? '' : undefined}
      // Solid, as a sticky is: lit from the top, never see-through; on top, frosted over the desktop picture.
      style={{
        ...(front ? DRAG : {}),
        backgroundImage: front
          ? 'linear-gradient(rgb(255 255 255 / 0.05), transparent 40%), linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))'
          : `linear-gradient(rgb(255 255 255 / 0.04), transparent 50%), linear-gradient(color-mix(in oklab, ${warm} 12%, ${PAPER}), color-mix(in oklab, ${warm} 12%, ${PAPER})), linear-gradient(var(--background), var(--background))`,
        backgroundColor: 'Canvas',
        // Its warmth along the edge that shows; on top in its last week, a warm rim as well.
        boxShadow: front
          ? `${urgent ? `inset 0 0 0 1px color-mix(in oklab, ${warm} 45%, transparent), 0 0 0 3px color-mix(in oklab, ${warm} 12%, transparent), ` : ''}0 1px 2px rgb(0 0 0 / 0.14), 0 6px 16px -4px rgb(0 0 0 / 0.22)`
          : `inset 0 -3px 0 color-mix(in oklab, ${warm} 55%, transparent), 0 1px 2px rgb(0 0 0 / 0.12), 0 3px 8px -3px rgb(0 0 0 / 0.18)`
      }}
      className={`relative isolate flex h-full flex-col gap-2.5 rounded-xl border px-4 pt-3 pb-4 text-control text-foreground ${urgent && front ? 'border-transparent' : ''}`}
    >
      {front && <Frost />}
      {shows && (
        <>
          <div className="flex items-start gap-1.5">
            <Flag className="mt-[0.2em] size-3.5 shrink-0" style={{ color: warm }} />
            {/* The whole goal, over two lines if it needs them: a goal cut short is not the goal. */}
            <p className={`private-text line-clamp-2 min-w-0 flex-1 leading-snug font-medium text-balance ${stacked ? 'pr-8' : ''}`}>{goal.title}</p>
            {/* Where this card is in the stack, till the controls take the corner. */}
            {count && <span className="absolute top-3 right-3.5 text-[10px] leading-none text-muted-foreground tabular-nums transition-opacity duration-200 group-hover:opacity-0">{count}</span>}
            {/* Over the end of the title, only while pointed at: the title has the whole row the rest of the time. */}
            {front && (
              <span className="absolute top-2 right-2 z-10 flex items-center rounded-lg bg-popover opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={STILL}>
                {stacked && (
                  <>
                    <button type="button" title="The goal before" aria-label="The goal before" onClick={() => flip(-1)}
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground active:scale-[0.97]">
                      <AliveIcon icon={RightChevronIcon} size={14} className="rotate-180" />
                    </button>
                    <button type="button" title="The next goal" aria-label="The next goal" onClick={() => flip(1)}
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground active:scale-[0.97]">
                      <AliveIcon icon={RightChevronIcon} size={14} />
                    </button>
                  </>
                )}
                <button type="button" title="Open it" aria-label="Open it" onClick={() => (chime('open'), window.api.openInHome('goal', id))}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                  <AliveIcon icon={ExternalLinkIcon} size={14} />
                </button>
                <button type="button" title="Put it away for now" aria-label="Put it away for now" onClick={() => (chime('tuck'), window.api.tuckBeacon(id))}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                  <AliveIcon icon={XIcon} size={14} />
                </button>
              </span>
            )}
          </div>
          {left < 0 ? (
            <div className="flex flex-col gap-1">
              <p className="font-heading text-2xl font-bold tracking-tight">Did you make it?</p>
              <button type="button" style={front ? STILL : undefined} onClick={() => (chime('open'), window.api.openInHome('goal', id))} className="self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                {dayMonth(`${goal.goalAt}T12:00`)} has passed. Say how it went
              </button>
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
          <div className="min-h-0 flex-1 text-foreground">{front ? <Journey compact from={from} target={goal.goalAt} today={today} logs={goal.glosses} /> : null}</div>
          {front ? <TempusBars ignite={ignite} /> : <div className="h-[52px]" />}
        </>
      )}
    </div>
  )
}
