import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { CalendarDays } from 'lucide-react'
import { EASE, spring } from '@/lib/motion'
import { chime, click, type Cue } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { ASKS, CAPTURE_TYPES, type CaptureType } from '@/components/capture-kinds/capture-kind-picker'
import { STARTERS, type Starter } from '@/lib/welcome-box'
import { dayjs, when } from '../../../../main/dates'
import { readTask } from '../../../../main/task-words'
import { kindOf } from '../../../../main/import'
import { MemoryPostcard } from './memory-postcard'
import { Signed } from './signature'
import { Flip } from './review-view'
import { TaskChips } from './task-input'
import { Rolling } from './ui'

/**
 * The welcome's reel: the parts it is filmed with.
 *
 * - a timeline (`useScript`): each chapter is a list of beats, and what is on
 *   screen is worked out from how far it has got, so settling a chapter is
 *   jumping to its last beat, never a race of timers
 * - the stage: the capture box drawn as it is, from its own parts, which a
 *   ghost types into
 * - the ghost hand, which moves on arcs and presses like a finger
 * - what each kind becomes: a task row, next year's postcard, a Review card
 * - a small map the three join, drawn as the notes map draws
 *
 * Two springs carry it, named once here: CAM for anything that changes shape
 * or place between shots (every layoutId), LAND for an object set down.
 */

/** The camera: every shared-element morph. */
export const CAM = { type: 'spring' as const, duration: 0.55, bounce: 0 }
/** An object set down: the postcard, the radar. The only bounce in the reel. */
export const LAND = { type: 'spring' as const, duration: 0.45, bounce: 0.18 }
/** A fold or a flight, from fly-home. */
export const DRAWER = [0.32, 0.72, 0, 1] as const

export type Kind = Starter['kind']
export const KINDS: Kind[] = ['todo', 'quote', 'word']
export const starterOf = (kind: Kind): Starter => STARTERS.find((one) => one.kind === kind) as Starter
export const typeOf = (kind: string): (typeof CAPTURE_TYPES)[number] => CAPTURE_TYPES.find((type) => type.id === kind) ?? CAPTURE_TYPES[0]

// --- the timeline ------------------------------------------------------------------

/** A beat: at `at` ms from the chapter's start, the state takes `to`, and `cue` is heard. */
export type Beat<S> = { at: number; to: Partial<S>; cue?: () => void }

/**
 * A chapter's beats, played from the start, or settled at once: shown at its
 * end, silent. What is on screen is the state folded up to the beat reached,
 * so any frame can be jumped to.
 */
export function useScript<S extends object>(start: S, beats: Beat<S>[], play: boolean): { state: S; done: boolean; settle: () => void } {
  const [at, setAt] = useState(play ? -1 : beats.length - 1)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    if (!play) return
    timers.current = beats.map((beat, i) => setTimeout(() => {
      setAt(i)
      beat.cue?.()
    }, beat.at))
    return () => timers.current.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const settle = (): void => {
    timers.current.forEach(clearTimeout)
    setAt(beats.length - 1)
  }
  const state = useMemo(() => beats.slice(0, at + 1).reduce<S>((now, beat) => ({ ...now, ...beat.to }), start), [at]) // eslint-disable-line react-hooks/exhaustive-deps
  return { state, done: at >= beats.length - 1, settle }
}

/** The same uneven hand every run: a seeded random number from 0 to 1. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A line typed by a person: 42 to 74ms a letter, a little longer before a
 * long word, a breath after a stop or a comma. One soft click per letter.
 * Gives a beat per letter, setting `field` to the words so far.
 */
export function typed<S>(text: string, from: number, field: (sofar: string) => Partial<S>, random: () => number, quick = 1): { beats: Beat<S>[]; end: number } {
  const beats: Beat<S>[] = []
  let at = from
  for (let i = 0; i < text.length; i++) {
    const letter = text[i]
    const word = /\s/.test(text[i - 1] ?? ' ') ? text.slice(i).split(/\s/)[0] : ''
    at += (42 + random() * 32 + (word.length > 6 ? 120 : 0) + (/[.,!?:]/.test(text[i - 1] ?? '') ? 260 : 0)) * quick
    beats.push({ at, to: field(text.slice(0, i + 1)), cue: /\s/.test(letter) ? undefined : () => click('soft') })
  }
  return { beats, end: at }
}

/** A sound for a beat, only ever heard while the chapter plays. */
export const cue = (name: Cue): (() => void) => () => chime(name)

// --- the stage: the capture box as it is drawn -----------------------------------

export type Box = { text: string; who: string; where: string; at: 'text' | 'who' | 'where' | null; press: boolean; pasted: number; item: Kind | null }
export const EMPTY_BOX: Box = { text: '', who: '', where: '', at: 'text', press: false, pasted: 0, item: null }

/** The kind the box guesses from the first line, as the real one does. */
export const guess = (text: string): CaptureType => (kindOf(text.split('\n')[0]) ?? 'note') as CaptureType

/** The editor's own face and size, so the stage's words are the box's words. */
const EDITOR_FONT = { fontFamily: 'var(--mf-font, "Fraunces Variable", Georgia, serif)', fontVariationSettings: '"SOFT" 20, "WONK" 1', fontSize: 'calc(1rem * var(--mf-text-scale, 1))' }
/** Who said it and Where from, as the box draws them (App.tsx FIELD). */
const FIELD = 'inline-flex h-[1.4rem] min-w-28 max-w-60 shrink-0 items-center overflow-hidden rounded-full border px-2 text-meta whitespace-nowrap transition-colors duration-150'

/**
 * The box, drawn from its own parts at its own size: the words in the
 * editor's face, the who and where fields, the kind chip guessing, Create
 * more and Create. A picture, never a control: nothing in it takes a click.
 */
export function Stage({ box, quiet, caret = true }: { box: Box; quiet: boolean; caret?: boolean }): React.JSX.Element {
  const kind = guess(box.text)
  const asks = ASKS[kind]
  const lines = box.text.split('\n')
  const read = kind === 'todo' ? readTask(lines[0]) : null
  const showCaret = caret && !quiet
  return (
    <motion.div layoutId="reel-box" transition={CAM} inert aria-hidden
      className="relative w-[min(40rem,100%)] shrink-0 overflow-hidden rounded-[14px] border border-foreground/10 bg-popover text-popover-foreground"
      style={{ boxShadow: 'var(--mf-panel-shadow), inset 0 1px 0 rgb(255 255 255 / 0.06)' }}>
      {/* The strip the window is held by, with its rule. */}
      <div className="h-10 px-[4.75rem] pt-[1.35rem]"><div className="h-px bg-foreground/[0.07]" /></div>
      <div className="min-h-[5.25rem] px-[4.75rem] pt-[0.5rem] pb-2 text-foreground" style={EDITOR_FONT}>
        {box.text && box.item ? (
          <motion.div layoutId={`reel-item-${box.item}`} transition={CAM} className="leading-[1.6]">
            {lines.map((line, i) => (
              <p key={i} className={i ? 'text-foreground/85' : ''}>
                <motion.span key={box.pasted} initial={box.pasted && i === 0 && !quiet ? { filter: 'blur(2px)', opacity: 0.6 } : false} animate={{ filter: 'blur(0px)', opacity: 1 }} transition={{ duration: 0.12, ease: EASE }}>
                  {i === 0 && read ? <Lit line={line} spans={read.spans} /> : line}
                </motion.span>
                {showCaret && box.at === 'text' && i === lines.length - 1 && <span className="mf-ghost-caret" data-typing="" />}
              </p>
            ))}
          </motion.div>
        ) : (
          <p className="leading-[1.6] text-muted-foreground/70">{showCaret && box.at === 'text' && <span className="mf-ghost-caret -ml-px mr-px" />}Type / for commands…</p>
        )}
      </div>
      {/* Under the writing: what a todo read, who said it and where from. In
          the welcome the box keeps only these (lesson mode, App.tsx), and so does this. */}
      <div className="flex min-h-[2.6rem] flex-wrap items-center gap-1.5 px-[4.75rem] py-2">
        {read && <TaskChips read={read} />}
        {box.text && asks.who && <Field label={asks.who} value={box.who} on={box.at === 'who'} caret={showCaret} />}
        {box.text && asks.where && <Field label={asks.where} value={box.where} on={box.at === 'where'} caret={showCaret} />}
      </div>
      <div className="flex items-center gap-1 bg-linear-to-t from-[var(--accent)]/40 px-[4.75rem] pt-2 pb-3">
        <KindChip kind={kind} />
        <span className="flex-1" />
        <motion.span data-ghost="create" className="inline-flex rounded-md" animate={{ scale: box.press ? 0.97 : 1 }} transition={box.press ? { duration: 0.06 } : spring.fast}>
          <Button variant="secondary" tabIndex={-1} className={`text-control transition-shadow duration-150 ${box.press ? 'shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_35%,transparent)]' : ''}`}>
            Create <kbd className="font-sans text-key opacity-70">⌘↵</kbd>
          </Button>
        </motion.span>
      </div>
    </motion.div>
  )
}

/** A todo's line with the day and time it read lit, as the box lights them. */
function Lit({ line, spans }: { line: string; spans: { from: number; to: number }[] }): React.JSX.Element {
  const parts: ReactNode[] = []
  let from = 0
  ;[...spans].sort((a, b) => a.from - b.from).forEach((span, i) => {
    if (span.to > line.length) return
    parts.push(line.slice(from, span.from), <span key={i} className="rounded-[0.2em] bg-primary/12 px-[0.1em] text-primary">{line.slice(span.from, span.to)}</span>)
    from = span.to
  })
  parts.push(line.slice(from))
  return <>{parts}</>
}

function Field({ label, value, on, caret }: { label: string; value: string; on: boolean; caret: boolean }): React.JSX.Element {
  return (
    <motion.span layout="size" transition={spring.moderate} data-ghost={label}
      className={`${FIELD} ${on ? 'border-foreground/25 bg-accent/50 text-foreground' : value ? 'border-foreground/10 text-foreground/80' : 'border-foreground/10 text-muted-foreground'}`}>
      {value || (!on && label)}
      {on && caret && <span className="mf-ghost-caret" data-typing="" />}
    </motion.span>
  )
}

/** The kind chip: dashed while it is a guess, ringed in the accent while the welcome runs, its name rolling as the guess changes. */
function KindChip({ kind }: { kind: CaptureType }): React.JSX.Element {
  const type = typeOf(kind)
  const Icon = type.icon
  return (
    <motion.span layout transition={spring.moderate}
      className="relative inline-flex h-7 items-center gap-1.5 overflow-hidden rounded-full border border-dashed border-primary px-2.5 text-[0.8125rem] font-medium text-foreground shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={kind} className="flex items-center gap-1.5" initial={{ transform: 'translateY(100%)', opacity: 0 }} animate={{ transform: 'translateY(0%)', opacity: 1 }} exit={{ transform: 'translateY(-100%)', opacity: 0 }} transition={{ duration: 0.16, ease: EASE }}>
          <Icon className="size-4" style={{ color: type.tint }} />{type.label}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}

/** A short name for a thing caught, for a chip or a dot. */
export const shortOf = (kind: Kind): string => ({ todo: 'Call Sam', quote: 'Waste no more time…', word: 'sonder' })[kind]

/** A caught thing, small: its kind's icon and a few of its words. Shares its layoutId with the line it was and the thing it becomes. */
export function Chip({ kind, quiet }: { kind: Kind; quiet: boolean }): React.JSX.Element {
  const type = typeOf(kind)
  const Icon = type.icon
  return (
    <motion.div layoutId={`reel-item-${kind}`} transition={CAM} className="flex h-9 items-center gap-1.5 overflow-hidden rounded-full border border-foreground/15 bg-popover px-3 text-[0.8125rem] whitespace-nowrap text-foreground shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_12%,transparent)]"
      initial={quiet ? false : { filter: 'blur(3px)' }} animate={{ filter: 'blur(0px)' }}>
      <Icon className="size-4 shrink-0" style={{ color: type.tint }} />{shortOf(kind)}
    </motion.div>
  )
}

/** Three slots under the box, dashed till a thing lands in each, and the count beside them. */
export function Slots({ filled, quiet }: { filled: Kind[]; quiet: boolean }): React.JSX.Element {
  const said = ['Three kinds to catch', 'One caught', 'Two caught', 'Three caught'][filled.length]
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {KINDS.map((kind) => (
        <div key={kind} className={`flex h-9 min-w-[9.5rem] items-center justify-center rounded-full border border-dashed transition-colors duration-300 ${filled.includes(kind) ? 'border-transparent' : 'border-foreground/20'}`}>
          {filled.includes(kind) && <Chip kind={kind} quiet={quiet} />}
        </div>
      ))}
      <span className="ml-2 min-w-[8.5rem] text-[0.875rem] text-(--mf-wl-quiet) tabular-nums"><Rolling text={said} by="word" /></span>
    </div>
  )
}

// --- the ghost hand ---------------------------------------------------------------

/**
 * A finger's place on the screen: a small ring in the accent. It travels on an
 * arc, lifted at the middle, eases in like a hand slowing to aim, rests a beat,
 * and presses by shrinking. It points at `[data-ghost=…]` inside `root`.
 */
export function GhostHand({ to, down, root }: { to: string | null; down: boolean; root: RefObject<HTMLElement | null> }): React.JSX.Element {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [seen, setSeen] = useState(false)
  const was = useRef<string | null>(null)
  useLayoutEffect(() => {
    const frame = root.current
    const el = to ? frame?.querySelector<HTMLElement>(`[data-ghost="${CSS.escape(to)}"]`) : null
    if (!frame || !el) return setSeen(false)
    const a = frame.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    const [tx, ty] = [b.left - a.left + b.width * 0.62, b.top - a.top + b.height * 0.6]
    if (!was.current) {
      // Comes in from below and to the right, where a hand rests.
      x.jump(tx + 90)
      y.jump(ty + 70)
    }
    was.current = to
    setSeen(true)
    const [fx, fy] = [x.get(), y.get()]
    const lift = Math.min(fy, ty) - 18
    const travel = { duration: 0.52, ease: DRAWER, times: [0, 0.5, 1] }
    const runs = [animate(x, [fx, (fx + tx) / 2, tx], travel), animate(y, [fy, lift, ty], travel)]
    return () => runs.forEach((run) => run.stop())
  }, [to]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.span aria-hidden className="pointer-events-none absolute top-0 left-0 z-20 -mt-[7px] -ml-[7px] size-[14px] rounded-full border-2 border-primary bg-primary/20 shadow-[0_2px_6px_color-mix(in_oklab,var(--mf-shadow-ink)_35%,transparent)]"
      style={{ x, y }} initial={false} animate={{ opacity: seen ? 1 : 0, scale: down ? 0.9 : 1 }} transition={down ? { duration: 0.06 } : spring.fast} />
  )
}

// --- what each kind becomes --------------------------------------------------------

/** A panel as the app draws one. */
const PANEL = 'overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-(--mf-panel-shadow)'

/** A todo, as your tasks hold it: filed under the day it read, the day and time on its row. */
export function TaskResult({ line }: { line: string }): React.JSX.Element {
  const read = readTask(line)
  const place = !read.due ? 'Backlog' : dayjs(read.due).isSame(dayjs(), 'day') ? 'Today' : 'Upcoming'
  return (
    <motion.div layoutId="reel-item-todo" transition={CAM} className={`${PANEL} w-full`} initial={{ filter: 'blur(4px)' }} animate={{ filter: 'blur(0px)' }}>
      <p className="flex items-baseline gap-2 px-4 pt-3 pb-1 text-[0.8125rem] font-medium text-foreground">Tasks <span className="font-normal text-muted-foreground">{place}</span></p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pt-2 pb-3.5">
        <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-foreground/40"><motion.circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, ease: EASE, delay: 0.3 }} /></svg>
        <span className="flex-1 text-[0.9375rem] leading-snug whitespace-nowrap text-foreground">{read.title.trim() || line}</span>
        {read.due && (
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.75rem] font-medium text-primary tabular-nums">
            <CalendarDays className="size-3.5" />{when(read.due, read.allDay)}
          </span>
        )}
      </div>
    </motion.div>
  )
}

/** A quote, as it comes back a year from today: a postcard, signed, set down a little askew. */
export function PostcardResult({ words, who, where, landed, signed }: { words: string; who: string; where?: string; landed: boolean; signed: boolean }): React.JSX.Element {
  return (
    <motion.div layoutId="reel-item-quote" transition={CAM} className="w-full" initial={{ filter: 'blur(4px)' }} animate={{ filter: 'blur(0px)' }}>
      <motion.div className="origin-center [&>div]:shadow-[0_2px_3px_color-mix(in_oklab,var(--mf-shadow-ink)_14%,transparent),0_22px_44px_-16px_color-mix(in_oklab,var(--mf-shadow-ink)_42%,transparent)] dark:[&>div]:bg-[color-mix(in_oklab,white_88%,var(--background))]"
        initial={false} animate={{ rotate: landed ? -2.5 : 0 }} transition={LAND}>
        <MemoryPostcard at={new Date().toISOString()} seed="welcome-quote">
          <p className="text-meta text-(--mf-wl-quiet)">You kept this a year ago today</p>
          <p className="clear-both mt-1 font-heading text-[1.0625rem] leading-snug text-foreground">{words.replace(/^[“"]|[”"]$/g, '')}</p>
          <p className="mt-1 flex min-h-[1.6em] items-baseline gap-1.5 text-meta text-(--mf-wl-quiet)">
            <motion.span className="inline-flex min-w-0" initial={false} animate={{ clipPath: signed ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)' }} transition={{ duration: signed ? 0.9 : 0, ease: [0.65, 0, 0.35, 1] }}>
              <Signed who={who} />
            </motion.span>
            {where && signed && <span className="shrink-0">· {where}</span>}
          </p>
        </MemoryPostcard>
      </motion.div>
    </motion.div>
  )
}

/** A word, as Review asks it: the question on its face, the meaning on its back. */
export function CardResult({ term, meaning, over, onTurn }: { term: string; meaning: string; over: boolean; onTurn: (over: boolean) => void }): React.JSX.Element {
  const face = 'flex h-full min-h-[9.5rem] flex-col justify-center rounded-xl border bg-popover px-5 py-5 text-popover-foreground shadow-(--mf-panel-shadow)'
  return (
    <motion.div layoutId="reel-item-word" transition={CAM} className="w-full" data-ghost="card" initial={{ filter: 'blur(4px)' }} animate={{ filter: 'blur(0px)' }}>
      <Flip over={over} onTurn={onTurn}
        front={<div className={face}><p className="text-xs text-muted-foreground">Review</p><h2 className="mt-1.5 font-heading text-[1.25rem] leading-snug font-semibold tracking-[-0.015em] text-balance text-foreground">What does “{term}” mean?</h2></div>}
        back={<div className={face}><p className="text-xs text-muted-foreground">What does “{term}” mean?</p><p className="mt-1.5 font-heading text-[1.0625rem] leading-snug text-foreground">{meaning}</p></div>} />
    </motion.div>
  )
}

// --- the map the three join ------------------------------------------------------

type Dot = SimulationNodeDatum & { id: string; title: string; kind: string; links: number }
type Edge = SimulationLinkDatum<Dot>

/** A year of notes in miniature, the three just caught among them, each link one a reader would make. */
const NODES: [string, string, string][] = [
  ['todo', 'Call Sam tomorrow at 6pm', 'todo'], ['quote', 'Waste no more time arguing…', 'quote'], ['word', 'sonder', 'word'],
  ['meditations', 'Meditations', 'book'], ['stoics', 'Notes on the Stoics', 'note'], ['kinder', 'Be kinder to strangers', 'note'],
  ['sorrows', 'The Dictionary of Obscure Sorrows', 'book'], ['lisbon', 'Lisbon with Sam in May', 'note'], ['birthday', 'Ideas for Sam’s birthday', 'note'],
  ['walk', 'What the long walk was about', 'note'], ['seneca', 'We suffer more in imagination than in reality.', 'quote'], ['letters', 'Letters from a Stoic', 'book'],
  ['mono', 'monachopsis', 'word'], ['flights', 'Book the Lisbon flights', 'todo'], ['cook', 'Cooking for friends', 'note'], ['read', 'How to read a book', 'link'],
  ['train', 'The train people', 'note'], ['hiraeth', 'hiraeth', 'word']
]
const EDGES: [string, string][] = [
  ['quote', 'meditations'], ['quote', 'stoics'], ['quote', 'kinder'], ['word', 'sorrows'], ['word', 'kinder'], ['word', 'train'], ['mono', 'sorrows'], ['hiraeth', 'sorrows'],
  ['todo', 'birthday'], ['todo', 'lisbon'], ['lisbon', 'flights'], ['seneca', 'letters'], ['seneca', 'stoics'], ['letters', 'stoics'], ['meditations', 'stoics'],
  ['walk', 'kinder'], ['walk', 'stoics'], ['cook', 'birthday'], ['read', 'walk'], ['train', 'kinder']
]
/** Bigger the more links touch it, as on the notes map. */
const radius = (links: number): number => Math.min(16, 3 + Math.sqrt(links) * 2.2)

let laid: { dots: Dot[]; edges: [Dot, Dot][] } | null = null
/** Settled once, out of sight: the map never jiggles on screen. */
function layout(): { dots: Dot[]; edges: [Dot, Dot][] } {
  if (laid) return laid
  const dots: Dot[] = NODES.map(([id, title, kind], i) => ({ id, title, kind, links: EDGES.filter((edge) => edge.includes(id)).length, x: Math.cos(i * 2.4) * 80, y: Math.sin(i * 2.4) * 60 }))
  const byId = new Map(dots.map((dot) => [dot.id, dot]))
  const links: Edge[] = EDGES.map(([a, b]) => ({ source: byId.get(a)!, target: byId.get(b)! }))
  forceSimulation(dots)
    .force('link', forceLink<Dot, Edge>(links).distance(48).strength(0.7))
    .force('charge', forceManyBody<Dot>().strength(-150))
    .force('collide', forceCollide<Dot>(18))
    .force('x', forceX<Dot>(0).strength(0.08))
    .force('y', forceY<Dot>(0).strength(0.12))
    .stop()
    .tick(300)
  laid = { dots, edges: EDGES.map(([a, b]) => [byId.get(a)!, byId.get(b)!]) }
  return laid
}

/**
 * The three things on a map of a year's notes. They arrive as dots (shared
 * with the cards they were); the rest fades in around them, nearest first,
 * already settled. One dot lit lights its neighbours and names them, the
 * rest stepping back, as the notes map does when a dot is pointed at.
 */
export function MiniMap({ shown, lit, onLight, quiet }: { shown: boolean; lit: string | null; onLight: (id: string | null) => void; quiet: boolean }): React.JSX.Element {
  const { dots, edges } = layout()
  const frame = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = (): void => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const xs = dots.map((dot) => dot.x!), ys = dots.map((dot) => dot.y!)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const k = Math.min(2.2, (size.w - 120) / (x1 - x0 || 1), (size.h - 60) / (y1 - y0 || 1))
  const px = (dot: Dot): [number, number] => [size.w / 2 + (dot.x! - (x0 + x1) / 2) * k, size.h / 2 + (dot.y! - (y0 + y1) / 2) * k]
  const near = lit ? new Set(EDGES.filter((edge) => edge.includes(lit)).flat()) : null
  const on = (id: string): boolean => !near || near.has(id)
  const delay = (dot: Dot): number => (quiet ? 0 : Math.min(0.45, Math.hypot(dot.x!, dot.y!) * k / 2000))
  const litDot = lit ? dots.find((dot) => dot.id === lit) : null
  return (
    <div ref={frame} className="relative h-full min-h-[16rem] w-full" onPointerLeave={() => onLight(null)}>
      {size.w > 0 && (
        <>
          <svg aria-hidden className="absolute inset-0 size-full overflow-visible">
            {edges.map(([a, b]) => {
              const [ax, ay] = px(a), [bx, by] = px(b)
              const bright = !!lit && (a.id === lit || b.id === lit)
              return <motion.line key={`${a.id}-${b.id}`} x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--foreground)" strokeWidth={bright ? 1.4 : 1}
                initial={{ opacity: 0 }} animate={{ opacity: !shown ? 0 : bright ? 0.55 : lit ? 0.05 : 0.18 }} transition={{ duration: 0.3, ease: EASE, delay: lit ? 0 : delay(a) }} />
            })}
            {dots.filter((dot) => !KINDS.includes(dot.id as Kind)).map((dot) => {
              const [x, y] = px(dot)
              return <motion.circle key={dot.id} cx={x} cy={y} r={radius(dot.links)} fill={typeOf(dot.kind).tint} stroke="var(--background)" strokeWidth={1.5}
                initial={{ opacity: 0 }} animate={{ opacity: !shown ? 0 : on(dot.id) ? 1 : 0.15 }} transition={{ duration: 0.3, ease: EASE, delay: lit ? 0 : delay(dot) }}
                onPointerEnter={() => onLight(dot.id)} />
            })}
          </svg>
          {/* The three just caught: dots of the page, so they can be what the cards became. */}
          {KINDS.map((kind) => {
            const dot = dots.find((one) => one.id === kind)!
            const [x, y] = px(dot)
            const r = radius(dot.links) + 1
            return (
              <motion.div key={kind} layoutId={`reel-item-${kind}`} transition={{ ...CAM, ease: DRAWER }} onPointerEnter={() => onLight(kind)}
                className="absolute rounded-full" style={{ left: x - r, top: y - r, width: r * 2, height: r * 2, background: typeOf(kind).tint, boxShadow: '0 0 0 1.5px var(--background), 0 0 0 4px color-mix(in oklab, var(--primary) 30%, transparent)' }}
                animate={{ opacity: on(kind) ? 1 : 0.25 }} />
            )
          })}
          {/* Names beside the lit dots, on the side away from the one pointed at. */}
          {lit && dots.filter((dot) => near!.has(dot.id) && dot.id !== lit).map((dot) => {
            const [x, y] = px(dot)
            const left = x < px(litDot!)[0]
            const r = radius(dot.links) + 4
            return (
              <motion.span key={dot.id} className="pointer-events-none absolute -translate-y-1/2 text-[0.6875rem] font-medium whitespace-nowrap text-foreground [paint-order:stroke] [-webkit-text-stroke:3px_var(--background)]"
                style={left ? { right: size.w - x + r, top: y } : { left: x + r, top: y }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring.fast}>
                {dot.title.length > 30 ? `${dot.title.slice(0, 29)}…` : dot.title}
              </motion.span>
            )
          })}
          {litDot && <MapCard dot={litDot} at={px(litDot)} links={near!.size - 1} />}
        </>
      )}
    </div>
  )
}

/** The card over the dot pointed at: its kind, its name, how many it links to. */
function MapCard({ dot, at, links }: { dot: Dot; at: [number, number]; links: number }): React.JSX.Element {
  const type = typeOf(dot.kind)
  const Icon = type.icon
  return (
    <motion.div key={dot.id} className="pointer-events-none absolute z-10 w-max max-w-[16rem] -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-(--mf-panel-shadow)"
      style={{ left: at[0], bottom: `calc(100% - ${at[1] - radius(dot.links) - 26}px)` }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={spring.fast}>
      <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-foreground"><Icon className="size-3.5 shrink-0" style={{ color: type.tint }} /><span className="truncate">{dot.title}</span></p>
      <p className="text-[0.75rem] text-muted-foreground">{links} {links === 1 ? 'link' : 'links'}</p>
    </motion.div>
  )
}

// --- titles ----------------------------------------------------------------------

/**
 * A title that rises into place a word at a time from under a mask, the way
 * film credits do: no fade and no blur, only the words coming up into a
 * line that was already there. Still, it is simply there.
 */
export function Rise({ text, still, delay = 0 }: { text: string; still: boolean; delay?: number }): React.JSX.Element {
  const words = text.split(' ')
  return (
    <span aria-label={text}>
      {words.map((word, i) => (
        <Fragment key={i}>
          <span aria-hidden className="-mb-[0.14em] inline-block overflow-clip pb-[0.14em] align-top">
            <motion.span className="inline-block" initial={still ? false : { transform: 'translateY(105%)' }} animate={{ transform: 'translateY(0%)' }}
              transition={{ duration: 0.52, ease: EASE, delay: delay + i * 0.045 }}>
              {word}
            </motion.span>
          </span>
          {i < words.length - 1 && ' '}
        </Fragment>
      ))}
    </span>
  )
}

/** The three starters' parts, as the stage and the results show them. */
export const QUOTE = starterOf('quote')
export const WORD = { term: STARTERS[2].text.split('\n')[0], meaning: STARTERS[2].text.split('\n')[1] }
