import { type CSSProperties, type ReactNode, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear, scalePow } from 'd3-scale'
import { cubicBezier, motion } from 'motion/react'
import { Gem, ListTodo, Quote } from 'lucide-react'
import { EASE } from '@/lib/motion'
import { STORY_DAY } from '@/lib/welcome-box'
import { clock, dayjs } from '../../../../main/dates'
import { Flip } from './review-view'
import { Tape } from './tape'
import { CARD, PAPER } from './sticky-note'
import { FLOW_WORDS, HUE } from './welcome-flow'
import { LAND, PostcardResult, QUOTE } from './welcome-reel'

/**
 * The welcome's Remember chapter: the three things kept so far (the task and
 * the gem from Write, the quote from Catch), each coming back, left to
 * right, as the app brings it back: the task on the day's sticky on the
 * desktop, the gem's question in Review, the quote a year on as a postcard
 * on Home. All three stay up once shown. Each drawn from the app's own parts;
 * pictures only: nothing here takes a click or reads your data.
 */

/** The story's day's tasks on the sticky note: the one from the note first, ticked off there; the film from Catch. */
const TODAY: [string, string?][] = [['Find photos of the Yoda puppet'], ['Rewatch The Empire Strikes Back', clock(dayjs().hour(20).minute(0))], ['Return the library books']]

/**
 * The day's sticky on the desktop, over another app's window, drawn as plain
 * shapes so it is no one's real app: the paper, the tape, the lean, and a
 * small lift now and then, as the real stickies do.
 */
export function DeskSticky({ on, ticked }: { on: boolean; ticked: boolean }): React.JSX.Element {
  return (
    // The window grows to hold the note when a narrow column wraps its tasks, so the note never hangs over what is under it.
    <div inert className="relative flex min-h-[clamp(9rem,calc(18vh+2.75rem),14rem)] w-full max-w-[22rem] items-start justify-end pt-[clamp(1.25rem,3.5vh,2rem)] pr-[5%] pb-1.5 select-none">
      {/* Another app's window: a calm shape, a title bar and some lines. */}
      <div aria-hidden className="absolute inset-0 rounded-xl border border-foreground/10 bg-foreground/[0.04]">
        <div className="flex h-6 items-center gap-1.5 border-b border-foreground/10 px-3">
          {[0, 1, 2].map((i) => <span key={i} className="size-2 rounded-full bg-foreground/15" />)}
        </div>
        <div className="flex flex-col gap-2.5 p-4">
          {[78, 92, 64, 85, 40].map((w, i) => <span key={i} className="h-2 rounded-full bg-foreground/[0.08]" style={{ width: `${w}%` }} />)}
        </div>
      </div>
      {on && (
        <motion.div className="relative w-[min(15rem,90%)]"
          initial={{ opacity: 0, y: -8, rotate: -4, scale: 1.02 }} animate={{ opacity: 1, y: [0, 0, -3, 0], rotate: -2.5, scale: 1 }}
          transition={{ ...LAND, y: { duration: 3.2, times: [0, 0.6, 0.75, 1], repeat: Infinity, repeatDelay: 1.6, ease: EASE } }}>
          <div className={CARD} style={{ '--tilt': '0deg', ...PAPER } as unknown as CSSProperties}>
            <Tape />
            <div className="flex items-center gap-1 px-3 pt-2">
              <p className="grow font-medium">{STORY_DAY}</p>
              <span className="text-xs text-muted-foreground tabular-nums">{ticked ? '1/3 done' : '0/3 done'}</span>
            </div>
            <ul className="px-3 pt-1 pb-3">
              {TODAY.map(([title, time], i) => {
                const done = ticked && i === 0
                return (
                  <li key={title} className="flex items-start gap-2 py-1">
                    <span className="mt-[0.2em] grid size-3.5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-150"
                      style={{ borderColor: done ? 'var(--tt-color-text-green)' : 'color-mix(in oklab, var(--muted-foreground) 70%, transparent)', background: done ? 'var(--tt-color-text-green)' : undefined }} />
                    <span className={`relative min-w-0 flex-1 leading-snug ${done ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {title}
                      <motion.span aria-hidden className="absolute top-[55%] left-0 h-px w-full origin-left bg-foreground/50" initial={false} animate={{ scaleX: done ? 1 : 0 }} transition={{ duration: 0.35, ease: EASE }} />
                    </span>
                    {time && <span className="shrink-0 pt-px text-xs text-muted-foreground tabular-nums">{time}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        </motion.div>
      )}
    </div>
  )
}

/** The gem's question in Review, turning over to its answer, with where it came from. */
export function EveningReview({ over }: { over: boolean }): React.JSX.Element {
  const face = 'flex h-full min-h-[8.5rem] flex-col justify-center rounded-xl border bg-popover px-5 py-4 text-popover-foreground shadow-(--mf-panel-shadow)'
  return (
    // Played, never handled: the card turns by itself, and takes no click or drag.
    <div inert className="pointer-events-none relative w-full max-w-[22rem] select-none">
      <div aria-hidden className={`${face} absolute inset-0 translate-x-2.5 translate-y-2.5 rotate-2 opacity-60`} />
      <div className="relative">
        <Flip over={over} onTurn={() => undefined}
          front={<div className={face}><p className="text-xs text-muted-foreground">Review · 3 due</p><h2 className="mt-1.5 font-heading text-[1.1875rem] leading-snug font-semibold text-foreground">{FLOW_WORDS.question}</h2></div>}
          back={<div className={face}><p className="text-xs text-muted-foreground">{FLOW_WORDS.question}</p><p className="mt-1.5 font-heading text-[1.125rem] leading-snug text-foreground">{FLOW_WORDS.gem}</p><p className="mt-2 text-xs text-muted-foreground">From “{FLOW_WORDS.note}”</p></div>} />
      </div>
    </div>
  )
}

/** How far Remember has got: moments shown (0 to 3), the sticky's task ticked, the card turned, the curve under them come, the postcard signed. */
export type BackShot = { shown: number; ticked: boolean; over: boolean; curve: boolean; signed: boolean }
export const BACK_START: BackShot = { shown: 0, ticked: false, over: false, curve: false, signed: false }
export const BACK_END: BackShot = { shown: 3, ticked: true, over: true, curve: true, signed: true }

/** Each thing kept and how it comes back: what it is, when, and what Haligtree does, its key words *marked*. */
export const BACK: { kind: 'task' | 'gem' | 'quote'; kept: string; when: string; said: string }[] = [
  { kind: 'task', kept: 'Find photos of the puppet', when: `${STORY_DAY}, ${clock(dayjs().hour(9).minute(0))}`, said: 'With “Stick Today on the desktop”, your tasks *sit on your desktop*. Tick them off there.' },
  { kind: 'gem', kept: 'Perfection erases…', when: `${dayjs().add(5, 'day').format('dddd')}, ${clock(dayjs().hour(21).minute(30))}`, said: 'Your gem *comes back as a question* in “Review”, and waits longer each time you remember it.' },
  { kind: 'quote', kept: 'Do or do not…', when: 'A year on', said: 'The line you saved *comes back in “Journal”*, like a postcard from your past self.' }
]
const ICON = { task: ListTodo, gem: Gem, quote: Quote }
const TINT = { task: HUE.task.ink, gem: HUE.gem.ink, quote: 'var(--tt-color-text-purple)' }

/**
 * The three moments side by side, the same width each: on top, what was
 * kept, there from the start; under it, when it comes back and how, said
 * and shown together; `said` draws the words, the key ones shining. Under
 * all three, the forgetting curve: why the gem, in the middle, comes back
 * when it does, coming a beat after the gem's card.
 */
export function ComeBack({ shot, quiet, said }: { shot: BackShot; quiet: boolean; said: (text: string) => ReactNode }): React.JSX.Element {
  const fade = quiet ? { duration: 0 } : { duration: 0.35, ease: EASE }
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-y-[clamp(0.75rem,calc(4vh-0.75rem),2.25rem)] pt-[clamp(0rem,calc(4vh-1.75rem),1rem)]">
      <div data-moments className="grid w-full shrink-0 grid-cols-3 items-start gap-x-[clamp(1rem,3vw,2.5rem)]">
        {BACK.map((one, i) => {
          const Icon = ICON[one.kind]
          const on = shot.shown > i
          return (
            <div key={one.kind} data-moment={i} data-shown={on || undefined} className="flex min-w-0 flex-col items-start gap-[clamp(0.5rem,1.6vh,0.875rem)]">
              {/* What was kept, as a chip: the same words the chapters before made. */}
              <span data-kept={one.kind} className="flex h-9 max-w-full items-center gap-1.5 overflow-hidden rounded-full border border-foreground/15 bg-popover px-3 text-[0.9375rem] whitespace-nowrap text-foreground shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_12%,transparent)]">
                <Icon className="size-4 shrink-0" style={{ color: TINT[one.kind] }} /><span className="truncate">{one.kept}</span>
              </span>
              {/* Down to how it comes back, drawn as it does. */}
              <motion.span aria-hidden className="ml-4 h-[clamp(0.5rem,calc(4vh-1.25rem),1.5rem)] w-[2px] origin-top rounded-full" style={{ background: `color-mix(in oklab, ${TINT[one.kind]} 60%, transparent)` }}
                initial={false} animate={{ scaleY: on ? 1 : 0 }} transition={fade} />
              <motion.div className="flex w-full flex-col gap-1" initial={false} animate={{ opacity: on ? 1 : 0, y: on ? 0 : 6 }} transition={fade}>
                <p data-stamp className="text-[clamp(0.875rem,min(1.5vw,2.2vh),1rem)] font-medium tabular-nums text-(--mf-wl-quiet)">{one.when}</p>
                <p data-answer aria-label={one.said.replace(/\*/g, '')} className="text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.3125rem)] leading-snug text-pretty text-foreground">{said(one.said)}</p>
              </motion.div>
              <motion.div className="w-full pt-1" initial={false} animate={{ opacity: on ? 1 : 0 }} transition={fade}>
                {one.kind === 'task' && <DeskSticky on={on} ticked={shot.ticked} />}
                {one.kind === 'gem' && <EveningReview over={shot.over} />}
                {one.kind === 'quote' && (
                  // The postcard a year on, floating in once, as it does on Home; nothing in its place until it comes. A little smaller on a short window, so the curve under it has room.
                  <motion.div className="w-full max-w-[21rem] [@media(max-height:760px)]:[zoom:0.82]" initial={false}
                    animate={{ opacity: on ? 1 : 0, y: on ? 0 : 12, rotate: on ? -2 : 0 }} transition={quiet ? { duration: 0 } : { type: 'spring', duration: 0.7, bounce: 0.15 }}>
                    {on && <PostcardResult id="day-postcard" words={QUOTE.text} who={QUOTE.who!} where={QUOTE.where} signed={shot.signed} write={!quiet && shot !== BACK_END} />}
                  </motion.div>
                )}
              </motion.div>
            </div>
          )
        })}
      </div>
      <ForgettingCurve on={shot.curve} quiet={quiet || shot === BACK_END} />
    </div>
  )
}

/*
 * Why a gem comes back when it does, drawn once: how well you remember a
 * thing over the month after you keep it, from remembered at the top to
 * forgotten at the foot. Asked in Review (a ring each time), it climbs back
 * to the top, and fades more slowly after every review, so each one can
 * wait longer than the last (the scheduler, main/haligtree.ts, asks again as
 * recall drops). From each ring a dashed line runs on down to forgotten:
 * the fall that review saved you from, the first (left alone) the steepest.
 * A picture of the idea, not of anyone's data: no figures for how much is
 * kept, only words at the top and foot and the time along the bottom.
 */
/** The days a review asks it again, each gap longer than the last. */
const REVIEWS = [1, 3, 8, 19]
/** Where each fade starts, and how slowly it fades: each hold longer than the last. */
const FROM = [0, ...REVIEWS]
const HOLD = [2, 4, 10, 22, 40]
const ORDINAL = ['1st review', '2nd', '3rd', '4th']
const MARKS: [number, string][] = [[0, 'Today'], [7, 'A week'], [30, 'A month']]
const GRID = [1, 0.75, 0.5, 0.25]
/** Room over the top for the count over each ring. */
const COUNTS = 17
type Pt = [number, number]
const d = (pts: Pt[]): string => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
/** The line draws on `--mf-ease`: the moment it has drawn a given share of its length. */
const SETTLE = cubicBezier(...EASE)
const whenAt = (share: number): number => {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (SETTLE(mid) < share) lo = mid
    else hi = mid
  }
  return hi
}

/** The drawing at a given size, in pixels: where each line runs, and how far along the line each ring sits. */
function plot(w: number, h: number): { x: (day: number) => number; y: (kept: number) => number; saw: string; area: string; falls: string[]; along: number[] } {
  // The early days spread out, so the first reviews have room.
  const x = scalePow().exponent(0.42).domain([0, 30]).range([2, w - 2])
  const y = scaleLinear().domain([0, 1]).range([h - 1, COUNTS])
  /** A fade from the top that began on `from`, between two days, as points evenly spaced along the foot. */
  const fall = (from: number, hold: number, a: number, b: number): Pt[] =>
    Array.from({ length: 33 }, (_, i) => {
      const day = x.invert(x(a) + ((x(b) - x(a)) * i) / 32)
      return [x(day), y(Math.exp(-(day - from) / hold))]
    })
  // With reviews: each fade until the next review, then straight back up to the top.
  const saw = FROM.flatMap((from, i) => fall(from, HOLD[i], from, REVIEWS[i] ?? 30))
  let run = 0
  const at: number[] = []
  saw.forEach(([px, py], i) => {
    if (!i) return
    run += Math.hypot(px - saw[i - 1][0], py - saw[i - 1][1])
    if (saw[i - 1][0] === px) at.push(run)
  })
  return {
    x, y, saw: d(saw), area: `${d(saw)}L${x(30)},${y(0)}L${x(0)},${y(0)}Z`,
    // From each review on, the fade that would have gone on without it.
    falls: REVIEWS.map((day, i) => d(fall(FROM[i], HOLD[i], day, 30))),
    along: at.map((one) => one / run)
  }
}

/** A box's size, as it changes. */
function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const look = (): void => setSize((was) => (was.w === el.clientWidth && was.h === el.clientHeight ? was : { w: el.clientWidth, h: el.clientHeight }))
    look()
    const watch = new ResizeObserver(look)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  return [ref, size]
}

/** The two kinds of line, drawn small, to stand in the words as a chart's key. */
function Key({ kind, ink }: { kind: 'alone' | 'reviewed'; ink: string }): React.JSX.Element {
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden className="mr-1 inline-block align-[-0.05em]">
      {kind === 'alone'
        ? <line x1="1" x2="17" y1="5" y2="5" stroke={ink} strokeWidth={1.75} strokeDasharray="3 3" strokeLinecap="round" />
        : <><line x1="1" x2="17" y1="5" y2="5" stroke={ink} strokeWidth={2.25} strokeLinecap="round" /><circle cx="9" cy="5" r="3.4" fill="var(--background)" stroke={ink} strokeWidth={1.75} /></>}
    </svg>
  )
}

/**
 * Drawn on as the gem's moment comes: the line with reviews draws, each
 * ring lights as it reaches it, and the dashed fall it saved you from fades
 * in under it. Still (Motion off, Reduce motion, a page seen before, or
 * skipped ahead), it is simply there, whole. It says what it is for and its
 * point beside it (over it, on a narrow window), names its top and foot in
 * words, and takes the height left under the three moments, up to a calm
 * shape, so it never runs under the footer.
 */
export function ForgettingCurve({ on, quiet }: { on: boolean; quiet: boolean }): React.JSX.Element {
  const drawn = on || quiet
  const [box, { w, h }] = useSize<HTMLDivElement>()
  const { x, y, saw, area, falls, along } = useMemo(() => plot(Math.max(w, 1), Math.max(h, COUNTS + 2)), [w, h])
  const fill = `curve-${useId().replace(/[^\w-]/g, '')}`
  const LINE = { delay: 0.3, duration: 2.8 }
  const draw = (delay: number, duration: number): object => (quiet ? { duration: 0 } : { duration, delay, ease: EASE })
  const ring = along.map((share) => LINE.delay + LINE.duration * whenAt(share))
  const ink = HUE.gem.ink
  const small = 'text-[clamp(0.75rem,min(1.2vw,1.7vh),0.875rem)] leading-none'
  return (
    // A banner under all three moments, named for the gem in the middle, and come a beat after its card. On a wide window the words stand left of the chart; on a narrow one, over it.
    <motion.figure data-curve className="mx-auto flex max-h-[clamp(6rem,24vh,13rem)] min-h-min w-full max-w-[62rem] flex-1 flex-col gap-x-[clamp(1.5rem,3vw,2.75rem)] gap-y-[clamp(0.25rem,1vh,0.625rem)] @min-[46rem]:flex-row"
      aria-label="Memory fades fast when a thing is left alone. Each review brings it back to the top, and it fades more slowly after each one."
      initial={false} animate={{ opacity: drawn ? 1 : 0, y: drawn ? 0 : 8 }} transition={quiet ? { duration: 0 } : { duration: 0.45, ease: EASE }}>
      {/* What it is for, then the point, a line for each kind of line, with the chart’s key in its words. */}
      <figcaption data-curve-says className="shrink-0 text-[clamp(0.75rem,min(1.3vw,1.85vh),0.9375rem)] leading-snug text-pretty text-(--mf-wl-body) @min-[46rem]:w-[clamp(13rem,21vw,18.5rem)] @min-[46rem]:pt-[0.6rem]">
        <span data-curve-lead className="mb-[0.3em] flex items-center gap-1.5 font-medium text-foreground"><Gem className="size-[1.1em] shrink-0" style={{ color: ink }} />Why the gem waits longer</span>
        <span className="flex flex-wrap gap-x-5 @min-[46rem]:flex-col">
          <span data-curve-label="alone"><span className="whitespace-nowrap"><Key kind="alone" ink={ink} />Left alone,</span> it’s forgotten in days.</span>
          <span data-curve-label="reviewed"><span className="whitespace-nowrap"><Key kind="reviewed" ink={ink} />Each review</span> brings it back, fading slower.</span>
        </span>
      </figcaption>
      <div data-curve-chart className="flex min-h-0 min-w-0 flex-1 flex-col @min-[46rem]:max-w-[46rem]">
        <div className="flex min-h-[4rem] flex-1">
          <div ref={box} className="relative min-w-0 flex-1">
            {w > 0 && (
              <svg width={w} height={h} className="absolute inset-0 block overflow-visible" aria-hidden>
                <defs>
                  <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: ink, stopOpacity: 0.5 }} />
                    <stop offset="65%" style={{ stopColor: ink, stopOpacity: 0.16 }} />
                    <stop offset="100%" style={{ stopColor: ink, stopOpacity: 0.03 }} />
                  </linearGradient>
                </defs>
                {/* Faint lines across, and a firmer floor: no figures on any of them. */}
                {GRID.map((kept) => <line key={kept} x1={x(0)} x2={x(30)} y1={y(kept)} y2={y(kept)} stroke="var(--foreground)" strokeOpacity={0.1} />)}
                <line x1={x(0)} x2={x(30)} y1={y(0)} y2={y(0)} stroke="var(--foreground)" strokeOpacity={0.3} />
                <motion.path data-curve-area d={area} fill={`url(#${fill})`}
                  initial={false} animate={{ opacity: drawn ? 1 : 0 }} transition={draw(LINE.delay + 0.3, 1.6)} />
                {falls.map((path, i) => (
                  <motion.path key={i} data-curve-fall={i} data-curve-line={i === 0 ? 'alone' : undefined} d={path} fill="none" stroke={ink} strokeOpacity={i === 0 ? 0.85 : 0.6}
                    strokeWidth={1.6} strokeDasharray="3.5 3.5" strokeLinecap="round"
                    initial={false} animate={{ opacity: drawn ? 1 : 0 }} transition={draw(ring[i] + 0.15, 0.7)} />
                ))}
                <motion.path data-curve-line="reviewed" d={saw} fill="none" stroke={ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                  initial={false} animate={{ pathLength: drawn ? 1 : 0 }} transition={draw(LINE.delay, LINE.duration)} />
                {REVIEWS.map((day, i) => (
                  <motion.circle key={day} data-curve-dot cx={x(day)} cy={y(1)} r={4.5} fill="var(--background)" stroke={ink} strokeWidth={2}
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                    initial={false} animate={{ opacity: drawn ? 1 : 0, scale: drawn ? 1 : 0.4 }} transition={draw(ring[i], 0.35)} />
                ))}
              </svg>
            )}
            {/* Each review counted over its ring: a count, not a day. */}
            {/* The first one, named in full, ends just past its ring, so the next count has room. */}
            {w > 0 && REVIEWS.map((day, i) => (
              <motion.span key={day} data-curve-ord className={`pointer-events-none absolute -translate-y-full whitespace-nowrap ${small} ${i === 0 ? 'text-right' : '-translate-x-1/2'} text-(--mf-wl-quiet)`}
                style={i === 0 ? { left: 0, right: w - x(day) - 10, top: y(1) - 8 } : { left: x(day), top: y(1) - 8 }}
                initial={false} animate={{ opacity: drawn ? 1 : 0 }} transition={draw(ring[i], 0.4)}>{ORDINAL[i]}</motion.span>
            ))}
          </div>
          {/* The top and the foot named in words, where the lines end. */}
          {w > 0 && (
            <div className={`relative shrink-0 pl-2 ${small} text-(--mf-wl-quiet)`}>
              <span className="invisible block h-0 overflow-hidden">Remembered</span>
              <span data-curve-top className="absolute left-2 -translate-y-1/2 whitespace-nowrap" style={{ top: y(1) }}>Remembered</span>
              <span data-curve-foot className="absolute left-2 -translate-y-1/2 whitespace-nowrap" style={{ top: y(0) }}>Forgotten</span>
            </div>
          )}
        </div>
        {/* Time along the bottom, and nothing else: no figures for how much is kept. */}
        <div className="relative mt-[0.4em] h-[1.1em] shrink-0 text-[clamp(0.875rem,min(1.4vw,2vh),1rem)] leading-none text-(--mf-wl-body)">
          {w > 0 && MARKS.map(([day, said], i) => (
            <span key={said} className={`absolute top-0 whitespace-nowrap ${i === 0 ? '' : i === MARKS.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: x(day) }}>{said}</span>
          ))}
        </div>
      </div>
    </motion.figure>
  )
}
