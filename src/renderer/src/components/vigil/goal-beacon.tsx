import { Tape } from './tape'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Flag } from 'lucide-react'
import { motion } from 'motion/react'
import { AliveIcon } from '@/components/ui/alive-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import RightChevronIcon from '@/components/ui/right-chevron'
import XIcon from '@/components/ui/x-icon'
import { toast } from './ui'

import { EASE, shift } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { useAppearance, useLive, vigil } from '@/lib/vigil'
import { DotMatrix } from './dot-matrix'
import { Answers, Journey, useToday, warmth } from './goals-view'
import { dayKey, dayMonth } from '../../../../main/dates'
import { daysLeft, percent, wayThrough } from '../../../../main/goal-days'
import { SandboxStamp } from '@/components/vigil/sandbox'
import { SANDBOX } from '@/lib/sandbox'
import { Frost } from './frost'

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const STILL = { WebkitAppRegion: 'no-drag' } as CSSProperties

/** How often the stack rolls its top card to the back while it sits there. */
const ROLL_EVERY = 45_000
/** Made as real glass (the setting): the stack lives inside its window, its cards behind as edges at the foot. */
const GLASS = new URLSearchParams(location.search).has('glass')
/** The cards drawn behind the top one: enough to read as a stack, never a pile. */
const BEHIND = 3
/** As glass, how far each card behind shows under the one in front of it. */
// Deep enough that the cards under it read as a stack at a glance, not a hairline.
const EDGE = 9
/** Each card behind sits a little lower and to the right, and leans its own way, as loose paper does. */
const TILT = [0, 1.3, -1, 1.8]
const pose = (depth: number): string => GLASS
  // As glass: straight, each one lower by an edge and a little narrower, as a stack seen from the front.
  ? `translate(0px, ${Math.min(depth, BEHIND) * EDGE}px) rotate(0deg) scale(${1 - Math.min(depth, BEHIND) * 0.035})`
  // Brutal: square, each one an equal step down and right, outlined (brutal.css), a stack of printed cards.
  : document.documentElement.dataset.style === 'brutal'
    ? `translate(${Math.min(depth, BEHIND) * 5}px, ${Math.min(depth, BEHIND) * 5}px) rotate(0deg) scale(1)`
    : `translate(${Math.min(depth, BEHIND) * 2}px, ${Math.min(depth, BEHIND) * 8}px) rotate(${TILT[Math.min(depth, BEHIND)]}deg) scale(1)`
/** The top card picked up: towards you, turned a little, kept inside the window. */
const LIFT = GLASS ? 'translate(0px, -3px) rotate(0deg) scale(0.985)' : 'translate(8px, -2px) rotate(-2.5deg) scale(1.025)'
/** Motion off or Reduce motion: the stack changes at once, nothing travels. */
const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
/** A goal in its last week, due today or past its day: it stays on top and is drawn warm. */
const pressing = (goalAt: string | null | undefined, today: string): boolean => Boolean(goalAt) && daysLeft(goalAt!, today) <= 7

/** The card's foot: on glass in the sandbox, room for the stamp. */
const FOOT = GLASS && SANDBOX ? 'pb-6' : 'pb-4'

/** The paper of a card behind: the theme's own, a shade off the top card so its edge reads. */
const PAPER = 'color-mix(in oklab, var(--foreground) 5%, var(--popover))'

type Flight = { id: string; back: boolean; out: boolean }

/**
 * The goal stack: every goal's beacon that is out, in one small window on
 * every Space, made by the sticky notes' machinery (see `beacons` in main).
 * The nearest goal is the card on top, frosted; the others peek out under
 * it as plain paper edges, each in its goal's warmth. As glass (the setting)
 * it all stays inside the window: the top card fills it and the edges of
 * the next one or two show in a strip at its foot. Every 45 seconds or so
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
      if (now) (setShown((count) => count + 1), setAt(0))
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
      // As glass the top card fills the window, less a strip at the foot for the edges behind it.
      className={GLASS ? 'group h-screen' : 'group h-screen pt-3.5 pr-[22px] pb-[42px] pl-3.5'}
      style={GLASS ? { paddingBottom: Math.min(n - 1, BEHIND) * EDGE } : undefined}
      onPointerEnter={() => (setHovered(true), window.api.holdBeacon(true), GLASS && window.api.lift())}
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
          // As glass the top card's pane lets a tenth through, so a card under it travels blank,
          // and the new top card stays blank while the old one is lifted over it.
          const covered = GLASS && !flying && Boolean(flight?.out && !flight.back)
          return (
            <motion.div
              key={id}
              className="absolute inset-0"
              // As glass, one at rest behind is only its edge: none of its paper dims the glass under the top card.
              style={{ zIndex: z, transformOrigin: GLASS ? '50% 100%' : '50% 60%', clipPath: GLASS && depth > 0 && !flying ? `inset(calc(100% - ${EDGE + 11}px) 0 0 0)` : undefined }}
              initial={false}
              animate={{ transform: flying?.out ? LIFT : pose(depth) }}
              transition={still() ? { duration: 0 } : flying?.out ? { duration: 0.15, ease: EASE } : { duration: flying ? 0.24 : 0.3, ease: EASE }}
            >
              <Card id={id} today={today} front={front} shows={(front && !covered) || (!GLASS && Boolean(flying))} stacked={n > 1} count={n > 1 && depth === 0 ? `${top + 1} of ${n}` : ''}
                flip={(step) => roll(step, 'riffle')} />
            </motion.div>
          )
        })}
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: n + 2 }}><SandboxStamp /></div>
        {/* The tape holding the stack to the desk; the cards roll beneath it. */}
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: n + 3 }}><Tape inside={GLASS} /></div>
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
 * road. Behind: plain paper tinted by the theme, its
 * bottom edge in the goal's warmth, its words drawn only while it is
 * moving (`shows`), so nothing under the top card catches the pointer.
 */
function Card({ id, today, front, shows, stacked, count, flip }: { id: string; today: string; front: boolean; shows: boolean; stacked: boolean; count: string; flip: (step: 1 | -1) => void }): React.JSX.Element | null {
  const goal = useLive(() => vigil.item(id), undefined as Awaited<ReturnType<typeof vigil.item>> | undefined, [id])
  const left = goal?.goalAt ? daysLeft(goal.goalAt, today) : 1
  // Its day reached, the road full: the card lights up all the way, once, the first time it is seen on top.
  const glow = useRef<HTMLSpanElement>(null)
  const full = front && shows && left <= 0
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
    // Settled, and still one Undo away: the toast opens it again, back on the stack.
    const settled = setTimeout(() => void vigil.closeGoal(id, said).then(() => toast(said === 'made it' ? 'Made it: kept under Ended in Goals' : said === 'missed' ? 'Missed: kept under Ended in Goals' : 'Let go: kept under Ended in Goals', () => void vigil.reopenGoal(id))), 2600)
    return () => clearTimeout(settled)
  }, [said, id])
  if (!goal?.goalAt) return null
  const from = goal.goalFrom ?? dayKey(goal.createdAt)
  const warm = warmth(Math.max(left, 0))
  const urgent = pressing(goal.goalAt, today)
  return (
    <div
      data-private={goal.private ? '' : undefined}
      // Brutal draws the cards behind as plain outlined paper (brutal.css).
      data-stack-card={front ? 'front' : 'behind'}
      data-stacked={stacked || undefined}
      // Solid, as a sticky is: lit from the top, never see-through; on top, frosted over the desktop picture.
      style={{
        ...(front ? DRAG : {}),
        // As glass: the Mac's blur through a 90% pane of the theme's paper, the edges behind a little more solid.
        backgroundImage: GLASS
          ? front
            ? 'linear-gradient(rgb(255 255 255 / 0.05), transparent 40%), linear-gradient(color-mix(in oklab, var(--popover) 90%, transparent), color-mix(in oklab, var(--popover) 90%, transparent))'
            : `linear-gradient(color-mix(in oklab, color-mix(in oklab, ${warm} 12%, ${PAPER}) 96%, transparent), color-mix(in oklab, color-mix(in oklab, ${warm} 12%, ${PAPER}) 96%, transparent))`
          : front
            ? 'linear-gradient(rgb(255 255 255 / 0.05), transparent 40%), linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))'
            : `linear-gradient(rgb(255 255 255 / 0.04), transparent 50%), linear-gradient(color-mix(in oklab, ${warm} 12%, ${PAPER}), color-mix(in oklab, ${warm} 12%, ${PAPER})), linear-gradient(var(--background), var(--background))`,
        backgroundColor: GLASS ? undefined : 'Canvas',
        // Its warmth along the edge that shows; on top in its last week, a warm rim as well.
        boxShadow: front
          ? `${urgent ? `inset 0 0 0 1px color-mix(in oklab, ${warm} 45%, transparent), ${GLASS ? '' : `0 0 0 3px color-mix(in oklab, ${warm} 12%, transparent), `}` : ''}${GLASS ? '0 1px 2px rgb(0 0 0 / 0.16)' : '0 1px 2px rgb(0 0 0 / 0.14), 0 6px 16px -4px rgb(0 0 0 / 0.22)'}`
          : GLASS
            ? `inset 0 -2px 0 color-mix(in oklab, ${warm} 60%, transparent), 0 1px 2px rgb(0 0 0 / 0.12)`
            : `inset 0 -3px 0 color-mix(in oklab, ${warm} 55%, transparent), 0 1px 2px rgb(0 0 0 / 0.12), 0 3px 8px -3px rgb(0 0 0 / 0.18)`
      }}
      className={`relative isolate flex h-full flex-col gap-2.5 ${GLASS ? 'rounded-[10px]' : 'rounded-xl border'} px-4 pt-3 ${FOOT} text-control text-foreground ${urgent && front ? 'border-transparent' : ''}`}
    >
      {front && !GLASS && <Frost />}
      {/* The once-only light of a full road: the goal's warmth all round the card, coming and going. */}
      <span ref={glow} aria-hidden className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0"
        style={{ boxShadow: `0 0 0 2px color-mix(in oklab, ${warm} 70%, transparent), 0 0 24px 2px color-mix(in oklab, ${warm} 45%, transparent), inset 0 0 18px color-mix(in oklab, ${warm} 22%, transparent)` }} />
      {shows && (
        <>
          <div className={`flex items-start gap-1.5 ${stacked ? 'pr-8' : ''}`}>
            <Flag className="mt-[0.2em] size-3.5 shrink-0" style={{ color: warm }} />
            {/* The whole goal, over two lines if it needs them: a goal cut short is not the goal. */}
            <p className="private-text line-clamp-2 min-w-0 flex-1 leading-snug font-medium text-balance">{goal.title}</p>
            {front && <SandboxStamp inline />}
            {/* Where this card is in the stack, till the controls take the corner. */}
            {count && <span className="absolute top-3 right-3.5 text-[11px] leading-none font-medium text-foreground/70 tabular-nums transition-opacity duration-200 group-hover:opacity-0">{count}</span>}
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
          {said ? (
            <div data-beacon-said className="flex flex-col gap-1">
              <p className="font-heading text-2xl font-bold tracking-tight">{said === 'made it' ? 'Made it.' : said === 'missed' ? 'Missed.' : 'Let go.'}</p>
              <span className="flex items-center gap-2 text-control text-muted-foreground">
                {said === 'made it' ? 'Well done.' : 'Kept under Ended.'}
                <button type="button" style={front ? STILL : undefined} onClick={() => (chime('undo'), setSaid(null))} className="rounded-full px-2 py-0.5 font-semibold text-foreground hover:bg-accent">Undo</button>
              </span>
            </div>
          ) : left < 0 ? (
            // The question comes to you: answered here, not only on the Goals page.
            <div className="flex flex-col gap-2">
              <p className="font-heading text-2xl font-bold tracking-tight">Did you make it?</p>
              <span style={front ? STILL : undefined} className="self-start">
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
          <div className="min-h-0 flex-1 text-foreground">{front ? <Journey compact from={from} target={goal.goalAt} today={today} logs={goal.glosses} /> : null}</div>
        </>
      )}
    </div>
  )
}
