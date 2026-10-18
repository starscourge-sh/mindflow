import { type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
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
const TODAY: [string, string?][] = [['Draft intro for film essay'], ['Rewatch The Empire Strikes Back', clock(dayjs().hour(20).minute(0))], ['Return the library books']]

/**
 * The day's sticky on the desktop, over another app's window, drawn as plain
 * shapes so it is no one's real app: the paper, the tape, the lean, and a
 * small lift now and then, as the real stickies do.
 */
export function DeskSticky({ on, ticked }: { on: boolean; ticked: boolean }): React.JSX.Element {
  return (
    <div inert className="relative h-[clamp(11rem,30vh,14rem)] w-full max-w-[22rem] select-none">
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
        <motion.div className="absolute top-[14%] right-[5%] w-[min(15rem,82%)]"
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

/** How far Remember has got: moments shown (0 to 3), the sticky's task ticked, the card turned, the postcard signed. */
export type BackShot = { shown: number; ticked: boolean; over: boolean; signed: boolean }
export const BACK_START: BackShot = { shown: 0, ticked: false, over: false, signed: false }
export const BACK_END: BackShot = { shown: 3, ticked: true, over: true, signed: true }

/** Each thing kept and how it comes back: what it is, when, and what Vigil does, its key words *marked*. */
export const BACK: { kind: 'task' | 'gem' | 'quote'; kept: string; when: string; said: string }[] = [
  { kind: 'task', kept: 'Draft intro for film essay', when: `${STORY_DAY}, ${clock(dayjs().hour(9).minute(0))}`, said: 'With “Keep Today on screen”, your tasks *sit on your desktop*. Tick them off there.' },
  { kind: 'gem', kept: FLOW_WORDS.gem, when: `${dayjs().add(5, 'day').format('dddd')}, ${clock(dayjs().hour(21).minute(30))}`, said: 'Your gem *comes back as a question* in “Review”, later each time you know it.' },
  { kind: 'quote', kept: 'Do or do not…', when: 'A year on', said: 'The line you saved *comes back on “Home”*, like a postcard from your past self.' }
]
const ICON = { task: ListTodo, gem: Gem, quote: Quote }
const TINT = { task: HUE.task.ink, gem: HUE.gem.ink, quote: 'var(--tt-color-text-purple)' }

/**
 * The three moments side by side: on top, what was kept, there from the
 * start; under it, when it comes back and how, said and shown together;
 * `said` draws the words, the key ones shining.
 */
export function ComeBack({ shot, quiet, said }: { shot: BackShot; quiet: boolean; said: (text: string) => ReactNode }): React.JSX.Element {
  const fade = quiet ? { duration: 0 } : { duration: 0.35, ease: EASE }
  return (
    <div className="grid min-h-0 w-full flex-1 grid-cols-3 items-start gap-x-[clamp(1rem,3vw,2.5rem)] pt-[clamp(0.25rem,2vh,1rem)]">
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
            <motion.span aria-hidden className="ml-4 h-[clamp(0.75rem,2.5vh,1.5rem)] w-[2px] origin-top rounded-full" style={{ background: `color-mix(in oklab, ${TINT[one.kind]} 60%, transparent)` }}
              initial={false} animate={{ scaleY: on ? 1 : 0 }} transition={fade} />
            <motion.div className="flex w-full flex-col gap-1" initial={false} animate={{ opacity: on ? 1 : 0, y: on ? 0 : 6 }} transition={fade}>
              <p data-stamp className="text-[clamp(0.875rem,min(1.5vw,2.2vh),1rem)] font-medium tabular-nums text-(--mf-wl-quiet)">{one.when}</p>
              <p data-answer aria-label={one.said.replace(/\*/g, '')} className="text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.3125rem)] leading-snug text-pretty text-foreground">{said(one.said)}</p>
            </motion.div>
            <motion.div className="w-full pt-1" initial={false} animate={{ opacity: on ? 1 : 0 }} transition={fade}>
              {one.kind === 'task' && <DeskSticky on={on} ticked={shot.ticked} />}
              {one.kind === 'gem' && (
                <div className="flex w-full flex-col gap-[clamp(0.75rem,2.4vh,1.5rem)]">
                  <EveningReview over={shot.over} />
                  <ForgettingCurve on={on} quiet={quiet || shot === BACK_END} />
                </div>
              )}
              {one.kind === 'quote' && (
                // The postcard a year on, floating in once, as it does on Home; nothing in its place until it comes.
                <motion.div className="w-full max-w-[21rem]" initial={false}
                  animate={{ opacity: on ? 1 : 0, y: on ? 0 : 12, rotate: on ? -2 : 0 }} transition={quiet ? { duration: 0 } : { type: 'spring', duration: 0.7, bounce: 0.15 }}>
                  {on && <PostcardResult id="day-postcard" words={QUOTE.text} who={QUOTE.who!} where={QUOTE.where} signed={shot.signed} />}
                </motion.div>
              )}
            </motion.div>
          </div>
        )
      })}
    </div>
  )
}

/*
 * Why a gem comes back when it does, drawn once: how well you remember a
 * thing over the month after you keep it. Left alone, it slips away fast.
 * Asked in Review (a dot each time), it climbs back, and fades more slowly
 * after every review, so each one can wait longer than the last (the
 * scheduler, main/vigil.ts, asks again as recall drops). A picture of the
 * idea, not of anyone's data: no figures on it, only the time along the foot.
 */
const W = 300
const H = 90
const TOP = 28
const FOOT = 86
/** Days along the foot: the early days spread out, so the first reviews have room. */
const xOf = (day: number): number => 6 + (W - 12) * Math.sqrt(day / 30)
const yOf = (kept: number): number => FOOT - (FOOT - TOP) * kept
/** The days a review asks it again, each gap longer than the last. */
const REVIEWS = [1, 3, 8, 19]
/** How slowly it fades after each review: each hold longer than the last. */
const HOLD = [2, 4, 10, 22, 40]
/** A fade from the top, from one day to another, as points along a path. */
const fall = (from: number, to: number, hold: number, steps = 18): string =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const day = from + ((to - from) * i) / steps
    return `${xOf(day).toFixed(1)},${yOf(Math.exp(-(day - from) / hold)).toFixed(1)}`
  }).join(' L')
/** Left alone: one steep fall. */
const ALONE = `M${fall(0, 30, HOLD[0], 40)}`
/** With reviews: a fall, back up to the top at each review, then a gentler fall. */
const REVIEWED = [0, ...REVIEWS].map((from, i) => `${i ? `L${xOf(from).toFixed(1)},${yOf(1).toFixed(1)} L` : 'M'}${fall(from, REVIEWS[i] ?? 30, HOLD[i])}`).join(' ')
const MARKS: [number, string][] = [[0, 'Today'], [7, 'A week'], [30, 'A month']]

/**
 * Drawn on as the gem's moment comes: the fall left alone first, then the
 * reviewed line, a dot as it reaches each review. Still (Motion off, Reduce
 * motion, a page seen before), it is simply there, whole.
 */
export function ForgettingCurve({ on, quiet }: { on: boolean; quiet: boolean }): React.JSX.Element {
  const drawn = on || quiet
  const draw = (delay: number, duration: number): object => (quiet ? { duration: 0 } : { duration, delay, ease: EASE })
  const ink = HUE.gem.ink
  // Where a point of the drawing sits in the figure, for the words laid over it.
  const at = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` })
  const label = 'pointer-events-none absolute whitespace-nowrap text-[clamp(0.875rem,min(1.4vw,2vh),1rem)] leading-none'
  return (
    // As wide as there is room for, and never so tall that it pushes the page into a scroll: its height follows the window's.
    <figure data-curve className="w-[min(100%,22rem,48vh)]" aria-label="Memory fades fast when a thing is left alone. Each review brings it back, and it fades more slowly after each one.">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" aria-hidden>
          {/* The wall and the floor, in the page's quiet ink. */}
          <path d={`M6,${TOP - 6} V${FOOT} H${W - 4}`} fill="none" stroke="var(--mf-wl-quiet)" strokeOpacity={0.4} strokeWidth={1} strokeLinecap="round" />
          <motion.path data-curve-line="alone" d={ALONE} fill="none" stroke="var(--mf-wl-body)" strokeOpacity={0.5} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
            initial={false} animate={{ pathLength: drawn ? 1 : 0 }} transition={draw(0.3, 0.9)} />
          <motion.path data-curve-line="reviewed" d={REVIEWED} fill="none" stroke={ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
            initial={false} animate={{ pathLength: drawn ? 1 : 0 }} transition={draw(0.7, 2)} />
          {REVIEWS.map((day) => (
            <motion.circle key={day} data-curve-dot cx={xOf(day)} cy={yOf(1)} r={3.6} fill={ink} stroke="var(--background)" strokeWidth={1.5}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              initial={false} animate={{ opacity: drawn ? 1 : 0, scale: drawn ? 1 : 0.4 }} transition={draw(0.7 + 2 * (xOf(day) / W) * 0.9, 0.3)} />
          ))}
        </svg>
        {/* Each line named where it runs, in its own colour, at the size of the words around it: the reviews over their dots, the fall along the floor. */}
        <motion.span data-curve-label="reviewed" className={`${label} -translate-y-full pb-1 font-semibold`} style={{ ...at(xOf(1) + 8, TOP - 4), color: ink }}
          initial={false} animate={{ opacity: drawn ? 1 : 0 }} transition={draw(0.9, 0.4)}>With “Review”</motion.span>
        <motion.span data-curve-label="alone" className={`${label} -translate-x-1/2 -translate-y-full pb-1 text-(--mf-wl-body)`} style={at(xOf(9), FOOT)}
          initial={false} animate={{ opacity: drawn ? 1 : 0 }} transition={draw(0.6, 0.4)}>Left alone</motion.span>
      </div>
      {/* Time along the foot, and nothing else: no figures for how much is kept. */}
      <figcaption className="relative mt-1 h-[1.2em] text-[clamp(0.875rem,min(1.4vw,2vh),1rem)] leading-none text-(--mf-wl-body)">
        {MARKS.map(([day, said], i) => (
          <span key={said} className={`absolute top-0 whitespace-nowrap ${i === 0 ? '' : i === MARKS.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${(xOf(day) / W) * 100}%` }}>{said}</span>
        ))}
      </figcaption>
    </figure>
  )
}
