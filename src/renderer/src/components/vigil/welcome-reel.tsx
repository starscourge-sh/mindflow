import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { CalendarDays } from 'lucide-react'
import { spring } from '@/lib/motion'
import { chime, click, type Cue } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { CAPTURE_TYPES, type CaptureType } from '@/components/capture-kinds/capture-kind-picker'
import { STARTERS, type Starter } from '@/lib/welcome-box'
import { seeded, typingWaits } from '@/lib/typing'
export { seeded }
import { dayjs, when } from '../../../../main/dates'
import { readTask } from '../../../../main/task-words'
import { kindOf } from '../../../../main/import'
import { MemoryPostcard } from './memory-postcard'
import { Signed } from './signature'
import { Flip } from './review-view'
// Dunes at sunset, Great Sand Dunes National Park: NPS, Debra Miller, public domain. The sandbox's Dune link wears the same picture.
import dunesUrl from '@/assets/welcome/dunes.webp'

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
 * - a small map the things caught join, drawn as the notes map draws
 *
 * Two springs carry it, named once here: CAM for anything that changes shape
 * or place between shots (every layoutId), LAND for an object set down.
 */

/**
 * The welcome's one easing set (Emil Kowalski's): a strong ease-out for
 * anything arriving, an ease-in-out for anything moving while on screen, and
 * springs for things that fly. Entrances start from scale 0.95 and nothing,
 * never from far away; only transform and opacity ever animate.
 */
export const ENTER = [0.23, 1, 0.32, 1] as const
export const MOVE = [0.65, 0, 0.35, 1] as const
const EASE = ENTER
/** How long a reader needs for a line: 225 words a minute, and a second to find it. */
export const readMs = (text: string): number => 1000 + (text.trim().split(/\s+/).filter(Boolean).length * 60000) / 225
/**
 * How long a page's own headline and line hold the stage before its demo
 * starts: a heading is skimmed, not read word by word, so about 400 words a
 * minute and never under 1.2s (a headline and one line, ~20 words: 3s). The
 * words stay up while the demo plays, so nothing is lost by starting sooner.
 */
export const leadMs = (text: string): number => Math.max(1200, (text.trim().split(/\s+/).filter(Boolean).length * 60000) / 400)

/** The camera: every shared-element morph. */
export const CAM = { type: 'spring' as const, duration: 0.55, bounce: 0 }
/** The caught words shrinking into their slot: slow enough to follow with the eye. */
export const MORPH = { type: 'spring' as const, duration: 0.75, bounce: 0 }
/** An object set down: the postcard, the radar. The only bounce in the reel. */
export const LAND = { type: 'spring' as const, duration: 0.45, bounce: 0.18 }
/** A fold or a flight, from fly-home. */
export const DRAWER = [0.32, 0.72, 0, 1] as const

export type Kind = Starter['kind']
/** The four Catch catches, in order: a thought first, the todo last. */
export const KINDS: Kind[] = ['quote', 'word', 'link', 'todo']
/** What Become shows: a plain note first, the thing most often caught, then the four. */
export const BECOMES: Kind[] = ['note', ...KINDS]
export const starterOf = (kind: Kind): Starter => STARTERS.find((one) => one.kind === kind) as Starter
export const typeOf = (kind: string): (typeof CAPTURE_TYPES)[number] => CAPTURE_TYPES.find((type) => type.id === kind) ?? CAPTURE_TYPES[0]

// --- the timeline ------------------------------------------------------------------

/** A beat: at `at` ms from the chapter's start, the state takes `to`, and `cue` is heard. */
export type Beat<S> = { at: number; to: Partial<S>; cue?: () => void; /** A place a press goes on to, in a chapter played in parts: the next part, not the end. */ stop?: boolean }

/**
 * A chapter's beats, played from the start, or settled at once: shown at its
 * end, silent. What is on screen is the state folded up to the beat reached,
 * so any frame can be jumped to. `onward` goes on to the next beat marked
 * `stop` and plays on from there (the end, when there is none): a reader's
 * press in a chapter told in parts.
 */
/** How fast the reel plays: 0.68 is about a third quicker than it was written. Write keeps 1, its pace is right for following; Catch is timed in real milliseconds. */
export const PACE = 0.68

/** The part of a chapter now playing, on the page's clock (performance.now): from its start to the next place a press goes on to, or the end. */
export type Part = { from: number; to: number }

export function useScript<S extends object>(start: S, beats: Beat<S>[], play: boolean, pace = PACE, lead = 0): { state: S; done: boolean; settle: () => void; onward: () => void; part: Part | null } {
  const [at, setAt] = useState(play ? -1 : beats.length - 1)
  const now = useRef(at)
  now.current = at
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  // When the timers were last set going, and from which beat: the clock the part is read from.
  const clock = useRef({ k: -1, at: performance.now() })
  // The words over the stage are read first: the demo's first beat waits until `lead` ms (real time) have gone.
  const shift = beats.length > 1 ? Math.max(0, lead / pace - beats[1].at) : 0
  const time = (i: number): number => (i < 0 ? 0 : beats[i].at + (i >= 1 ? shift : 0))
  const from = (k: number): void => {
    clock.current = { k, at: performance.now() }
    timers.current.forEach(clearTimeout)
    timers.current = beats.map((beat, i) => (i <= k ? undefined : setTimeout(() => {
      setAt(i)
      beat.cue?.()
    }, (time(i) - time(k)) * pace))).filter((one) => one !== undefined)
  }
  useEffect(() => {
    if (!play) return
    from(-1)
    return () => timers.current.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const jump = (k: number): void => {
    setAt(k)
    beats[k].cue?.()
    from(k)
  }
  // A press while the words are still being read starts the demo now; once it plays, a press shows its end.
  const settle = (): void => {
    if (shift > 0 && now.current < 1 && beats.length > 1) return jump(1)
    timers.current.forEach(clearTimeout)
    setAt(beats.length - 1)
  }
  const onward = (): void => {
    if (shift > 0 && now.current < 1 && beats.length > 1) return jump(1)
    const next = beats.findIndex((beat, i) => i > now.current && beat.stop)
    if (next < 0) {
      timers.current.forEach(clearTimeout)
      return setAt(beats.length - 1)
    }
    jump(next)
  }
  const state = useMemo(() => beats.slice(0, at + 1).reduce<S>((now, beat) => ({ ...now, ...beat.to }), start), [at]) // eslint-disable-line react-hooks/exhaustive-deps
  const done = at >= beats.length - 1
  // The part playing: from the last place a press goes on to (or the start), to the next one (or the end).
  let part: Part | null = null
  if (!done) {
    const stops = beats.map((beat, i) => (beat.stop ? i : -1)).filter((i) => i >= 0)
    const end = stops.find((i) => i > at) ?? beats.length - 1
    const begin = [...stops].reverse().find((i) => i <= at) ?? -1
    const on = (i: number): number => clock.current.at + (time(i) - time(clock.current.k)) * pace
    part = { from: on(begin), to: on(end) }
  }
  return { state, done, settle, onward, part }
}

/**
 * A line typed by a person (lib/typing.ts): an uneven hand, a breath between
 * words, a pause at a stop or a comma, now and then a hesitation, never longer
 * than `cap` in all. One soft click per letter. Gives a beat per letter,
 * setting `field` to the words so far.
 */
export function typed<S>(text: string, from: number, field: (sofar: string) => Partial<S>, random: () => number, quick = 1, cap = Infinity): { beats: Beat<S>[]; end: number } {
  const beats: Beat<S>[] = []
  let at = from
  typingWaits(text, random, quick, cap).forEach((wait, i) => {
    at += wait
    beats.push({ at, to: field(text.slice(0, i + 1)), cue: /\s/.test(text[i]) ? undefined : () => click('soft') })
  })
  return { beats, end: at }
}

/** A sound for a beat, only ever heard while the chapter plays. */
export const cue = (name: Cue): (() => void) => () => chime(name)

// --- the stage: the capture box as it is drawn -----------------------------------

/**
 * The box at one moment. Words are typed in by a person's hand (`typing`
 * draws the caret after them); then Vigil sorts them, and what it read lifts
 * out of the line into its place: a day into the date pill, a name into Who
 * said it. `fold` is the line folded to a square, on its way to a slot.
 */
export type Box = { text: string; page: boolean; lit: string | null; kind: CaptureType; date: string | null; tail: { who: string; where: string } | null; who: string; where: string; press: boolean; fold: boolean; item: Kind | null; typing?: boolean }
export const EMPTY_BOX: Box = { text: '', page: false, lit: null, kind: 'note', date: null, tail: null, who: '', where: '', press: false, fold: false, item: null }

/** The kind the box guesses from the first line, as the real one does. */
export const guess = (text: string): CaptureType => (kindOf(text.split('\n')[0]) ?? 'note') as CaptureType

/** The editor's own face and size, so the stage's words are the box's words. */
const EDITOR_FONT = { fontFamily: 'var(--mf-font, "Fraunces Variable", Georgia, serif)', fontVariationSettings: '"SOFT" 20, "WONK" 1', fontSize: 'calc(1rem * var(--mf-text-scale, 1))' }
/** Who said it and Where from, as the box draws them (App.tsx FIELD). */
const FIELD = 'inline-flex h-[1.4rem] shrink-0 items-center overflow-hidden rounded-full border border-foreground/10 px-2 text-meta whitespace-nowrap text-foreground/85'
/** What a todo's words were read as, as the box's date pill draws it. */
const DATE_PILL = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs whitespace-nowrap'

/**
 * The box, drawn from its own parts, as the welcome keeps it (lesson mode,
 * App.tsx: no menu, no Create more, no word count): the words in the editor's
 * face, the date or the who and where Vigil read in them, the kind chip
 * guessing, and Create. A picture, never a control: nothing in it takes a click.
 */
export function Stage({ box }: { box: Box }): React.JSX.Element {
  const lines = box.text.split('\n')
  const words = useRef<HTMLDivElement>(null)
  // Where the words sit now, kept for the chip that will fly from them.
  useLayoutEffect(() => noteCaught(words.current))
  // What Vigil read moves to its place by position alone: its letters are never stretched to the size of where it lands.
  const lift = box.typing ? {} : ({ layout: 'position', transition: { ...spring.moderate, duration: 0.32 } } as const)
  return (
    <motion.div layoutId="reel-box" transition={CAM} inert aria-hidden
      className="relative w-full overflow-hidden rounded-[14px] border border-foreground/10 bg-popover text-popover-foreground"
      style={{ boxShadow: 'var(--mf-panel-shadow), inset 0 1px 0 rgb(255 255 255 / 0.06)' }}>
      {/* The box changes size as one thing; what is in it is held at its own size (Unstretched). */}
      <Unstretched>
      <div className="relative min-h-[5.75rem] px-7 pt-6 pb-2 text-foreground" style={EDITOR_FONT}>
        {/* The words themselves are what is caught: sent, this block is the chip in the slot below
            (one layoutId), so the eye follows the words all the way there. */}
          {box.text && !box.fold && (
            <div ref={words} key={box.item ?? 'line'} data-caught className="origin-top-left leading-[1.6]">
              {lines.map((line, i) => (
                <p key={i} className={i ? 'text-foreground/80' : ''}>
                  {line}
                  {/* What Vigil will lift out, lit where it sits in the line until it goes. */}
                  {i === 0 && box.lit && <>{' '}<motion.span layoutId={box.typing ? undefined : 'reel-date'} {...lift} className="inline-block rounded-[0.2em] bg-primary/12 px-[0.1em] text-primary">{box.lit}</motion.span></>}
                  {i === 0 && box.tail && (
                    <span className="text-foreground/80">{' - '}<motion.span layoutId={box.typing ? undefined : 'reel-who'} {...lift} className="inline-block rounded-[0.2em] bg-primary/12 px-[0.1em] text-primary">{box.tail.who}</motion.span>{box.tail.where && <>{', '}<motion.span layoutId={box.typing ? undefined : 'reel-where'} {...lift} className="inline-block rounded-[0.2em] bg-primary/12 px-[0.1em] text-primary">{box.tail.where}</motion.span></>}</span>
                  )}
                  {/* The caret, after the last letter typed. */}
                  {box.typing && i === lines.length - 1 && <span className="mf-ghost-caret" data-typing="" />}
                </p>
              ))}
            </div>
          )}
        {!box.text && <p className="leading-[1.6]"><span className="mf-ghost-caret -ml-px" data-typing={box.typing ? '' : undefined} /></p>}
      </div>
      {/* Under the writing: only what Vigil read, once it has read it. */}
      <div className="flex min-h-[2.6rem] flex-wrap items-center gap-1.5 px-7 py-2">
        {box.date && !box.fold && (
          <motion.span layoutId="reel-date" {...lift} className={DATE_PILL} style={{ background: 'var(--tt-color-highlight-blue)', color: 'var(--tt-color-text-blue)' }}>
            <CalendarDays className="size-3" />{box.date}
          </motion.span>
        )}
        {box.who && !box.fold && <span className={FIELD}><motion.span layoutId="reel-who" {...lift} className="inline-block">{box.who}</motion.span></span>}
        {box.where && !box.fold && <span className={FIELD}><motion.span layoutId="reel-where" {...lift} className="inline-block">{box.where}</motion.span></span>}
        {/* A link: the page answers with its name and picture (a stored example here: nothing is fetched). */}
        {box.page && !box.fold && (
          <motion.span className="flex items-center gap-2 rounded-lg border border-foreground/10 py-1 pr-3 pl-1 text-meta" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: EASE }}>
            <span className="relative size-7 overflow-hidden rounded-md bg-[color-mix(in_oklab,var(--tt-color-text-brown)_35%,var(--background))]"><img src={dunesUrl} alt="" draggable={false} className="absolute inset-0 size-full object-cover" /></span>
            <span className="font-medium text-foreground">{LINK_PAGE.title}</span><span className="text-muted-foreground">{LINK_PAGE.site}</span>
          </motion.span>
        )}
      </div>
      <div className="flex items-center gap-1 bg-linear-to-t from-[var(--accent)]/40 px-7 pt-2 pb-3">
        <KindChip kind={box.kind} />
        <span className="flex-1" />
        <motion.span data-ghost="create" className="inline-flex rounded-md" animate={{ scale: box.press ? 0.97 : 1 }} transition={box.press ? { duration: 0.06 } : spring.fast}>
          <Button variant="secondary" tabIndex={-1} className={`text-control transition-shadow duration-150 ${box.press ? 'shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_35%,transparent)]' : ''}`}>
            Create <kbd className="font-sans text-key opacity-70">⌘↵</kbd>
          </Button>
        </motion.span>
      </div>
      </Unstretched>
    </motion.div>
  )
}

/**
 * Inside a shape that morphs (a layoutId changing size), its contents kept at
 * their own size: moved by position alone, the morph's stretch undone on them,
 * so words are never squashed or pulled wide on the way.
 */
export function Unstretched({ children, className = '' }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <motion.div layout="position" transition={CAM} className={className}>{children}</motion.div>
}

/** The kind chip: dashed while it is a guess, ringed in the accent while the welcome runs, its name rolling as the guess changes. */
function KindChip({ kind }: { kind: CaptureType }): React.JSX.Element {
  const type = typeOf(kind)
  const Icon = type.icon
  return (
    <motion.span layout transition={spring.moderate}
      className="relative inline-flex h-7 items-center gap-1.5 overflow-hidden rounded-full border border-dashed border-primary px-2.5 text-[0.8125rem] font-medium text-foreground shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={kind} layout="position" className="flex items-center gap-1.5" initial={{ y: '100%', opacity: 0 }} animate={{ y: '0%', opacity: 1 }} exit={{ y: '-100%', opacity: 0 }} transition={{ duration: 0.16, ease: EASE, layout: spring.moderate }}>
          <Icon className="size-4" style={{ color: type.tint }} />{type.label}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}

/** A short name for a thing caught, for a chip or a dot. */
export const shortOf = (kind: Kind): string => ({ note: 'In Frankenstein…', todo: 'Book Hamlet tickets', quote: 'Do or do not…', word: 'petrichor', link: LINK_PAGE.title })[kind]

/** The link's page as Vigil would fetch it, kept here so the welcome works offline. */
export const LINK_PAGE = { title: 'Dune (novel)', site: 'en.wikipedia.org' }

/** Where the caught words last sat in the box, on screen: their chip flies from there. */
let caughtAt: DOMRect | null = null
/** Kept fresh by the box as it draws its words (Stage, `data-caught`). */
export const noteCaught = (el: Element | null): void => void (el && (caughtAt = el.getBoundingClientRect()))

/** A caught thing, small: its kind's icon and a few of its words. Shares its layoutId with the thing it becomes. */
export function Chip({ kind, fly = false }: { kind: Kind; /** Just caught: it flies in from the box's words, one transform on the compositor. */ fly?: boolean }): React.JSX.Element {
  const type = typeOf(kind)
  const Icon = type.icon
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const scale = useMotionValue(1)
  const opacity = useMotionValue(1)
  useLayoutEffect(() => {
    const el = ref.current
    const from = caughtAt
    if (!fly || !el || !from) return
    // FLIP: measured where it lands, set back to where the words were (one uniform scale, so nothing squashes), then let go.
    const to = el.getBoundingClientRect()
    const k = Math.min(1.6, Math.max(0.6, from.height / to.height))
    x.jump(from.left - to.left)
    y.jump(from.top + from.height / 2 - (to.top + to.height / 2))
    scale.jump(k)
    opacity.jump(0.4)
    el.style.willChange = 'transform'
    const flight = { type: 'spring' as const, duration: 0.7, bounce: 0.12 }
    const runs = [animate(x, 0, flight), animate(y, 0, flight), animate(scale, 1, flight), animate(opacity, 1, { duration: 0.25, ease: EASE })]
    void Promise.all(runs).then(() => void (el.style.willChange = ''))
    return () => runs.forEach((run) => run.stop())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.div ref={ref} layoutId={fly ? undefined : `reel-item-${kind}`} transition={MORPH} className="flex h-9 origin-left items-center gap-1.5 overflow-hidden border border-foreground/15 bg-popover px-3 text-[0.9375rem] whitespace-nowrap text-foreground shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_12%,transparent)]"
      style={{ borderRadius: 18, x, y, scale, opacity }}>
      <Unstretched className="flex items-center gap-1.5"><Icon className="size-4 shrink-0" style={{ color: type.tint }} />{shortOf(kind)}</Unstretched>
    </motion.div>
  )
}

/** An empty slot's size: the chip that will land in it, unseen. */
function ChipSize({ kind }: { kind: Kind }): React.JSX.Element {
  const Icon = typeOf(kind).icon
  return <span aria-hidden className="invisible flex h-9 items-center gap-1.5 border border-transparent px-3 text-[0.9375rem] whitespace-nowrap"><Icon className="size-4 shrink-0" />{shortOf(kind)}</span>
}

/** A slot a kind under the box, dashed till a thing lands in each; the newest flies in from the box. */
export function Slots({ filled, kinds = KINDS }: { filled: Kind[]; kinds?: Kind[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {kinds.map((kind) => (
        // Each slot the size of what lands in it, empty or filled, so the gaps between them match.
        <div key={kind} data-slot={kind} className={`flex h-9 items-center justify-center rounded-full border border-dashed transition-colors duration-300 ${filled.includes(kind) ? 'border-transparent' : 'border-foreground/20'}`}>
          {filled.includes(kind) ? <Chip kind={kind} fly /> : <ChipSize kind={kind} />}
        </div>
      ))}
    </div>
  )
}

// --- the camera -----------------------------------------------------------------

/** Where the camera looks: how close (`k`), and how far the world is moved under it, in px. */
export type Shot = { k: number; x: number; y: number }
export const WIDE: Shot = { k: 1, x: 0, y: 0 }

/**
 * The world a chapter is set in, framed by one camera: pushed in, followed,
 * pulled back, all on one slow spring, by transform alone. The chapters move
 * it only when no shared-element morph is under way inside it. With
 * Reduce motion or Motion off (MotionConfig), the camera cuts and only fades.
 */
export function Camera({ shot, children, className = '', cut = false }: { shot: Shot; children: ReactNode; className?: string; /** Put there at once, as a cut: the first shot, before anything is seen. */ cut?: boolean }): React.JSX.Element {
  return (
    <motion.div className={`origin-center ${className}`} initial={false} animate={{ scale: shot.k, x: shot.x, y: shot.y }}
      transition={cut ? { duration: 0 } : { type: 'spring', duration: 1.1, bounce: 0 }}>
      {children}
    </motion.div>
  )
}

/**
 * A shot that frames `[data-frame=…]` inside `world` at `k`: worked out from
 * where it sits with the camera wide, so it is right whatever the camera does now.
 */
export function frameOn(world: HTMLElement | null, name: string | null, k: number): Shot {
  const el = name ? world?.querySelector<HTMLElement>(`[data-frame="${CSS.escape(name)}"]`) : null
  if (!world || !el) return WIDE
  let [x, y] = [el.offsetWidth / 2, el.offsetHeight / 2]
  // Summed up to the world, which is positioned so that it is every offset's parent in the end.
  for (let at: HTMLElement | null = el; at && at !== world; at = at.offsetParent as HTMLElement | null) {
    x += at.offsetLeft
    y += at.offsetTop
  }
  return { k, x: (world.offsetWidth / 2 - x) * k, y: (world.offsetHeight / 2 - y) * k }
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
    const [tx, ty] = [b.right - a.left - 2, b.bottom - a.top - 2]
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
export function TaskResult({ line, id = 'reel-item-todo' }: { line: string; id?: string }): React.JSX.Element {
  const read = readTask(line)
  const place = !read.due ? 'Backlog' : dayjs(read.due).isSame(dayjs(), 'day') ? 'Today' : 'Upcoming'
  return (
    <motion.div layoutId={id} transition={CAM} style={{ borderRadius: 12 }} className={`${PANEL} w-full`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <Unstretched>
      <p className="flex items-baseline gap-2 px-4 pt-3 pb-1 text-[0.8125rem] font-medium text-foreground">Tasks <span className="font-normal text-muted-foreground">{place}</span></p>
      {/* As the Tasks list draws a row: the box, then the title across the card's width, its date under it. */}
      <div className="flex items-start gap-3 px-4 pt-2 pb-3.5">
        <svg aria-hidden viewBox="0 0 16 16" className="mt-[0.2rem] size-4 shrink-0 text-foreground/40"><motion.circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, ease: EASE, delay: 0.3 }} /></svg>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span className="text-[0.9375rem] leading-snug text-pretty text-foreground">{read.title.trim() || line}</span>
          {read.due && (
            <span data-accent-ok className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.75rem] font-medium whitespace-nowrap text-primary tabular-nums">
              <CalendarDays className="size-3.5" />{when(read.due, read.allDay)}
            </span>
          )}
        </div>
      </div>
      </Unstretched>
    </motion.div>
  )
}

/** A quote, as it comes back a year from today: a postcard, signed, set down a little askew. */
export function PostcardResult({ words, who, where, signed, id = 'reel-item-quote', themed = false }: { words: string; who: string; where?: string; signed: boolean; id?: string; /** Its white print frame in the page's own colours, to wear the theme with it. */ themed?: boolean }): React.JSX.Element {
  return (
    <motion.div layoutId={id} transition={CAM} style={{ borderRadius: 12 }} className="w-full" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <Unstretched>
      <div>
        {/* Postmarked the day it was caught: a year ago today. */}
        <MemoryPostcard at={dayjs().subtract(1, 'year').toISOString()} seed="welcome-quote" hold={false}
          className={`!shadow-[0_2px_3px_color-mix(in_oklab,var(--mf-shadow-ink)_14%,transparent),0_22px_44px_-16px_color-mix(in_oklab,var(--mf-shadow-ink)_42%,transparent)] ${themed ? '!bg-[color-mix(in_oklab,var(--foreground)_10%,var(--background))]' : 'dark:bg-[color-mix(in_oklab,white_88%,var(--background))]'}`}>
          <p className="text-meta text-(--mf-wl-quiet)">Saved a year ago today</p>
          <p className="clear-both mt-1 font-heading text-[1.0625rem] leading-snug text-foreground">{words.replace(/^[“"]|[”"]$/g, '')}</p>
          {/* Signed whole and never cut short: "said by" and the pen's stroke arrive together, the name
              drawn left to right (its clip reaches past the letters, so no swash shows early), and
              where it is from wraps under it when the line is full ("in The Empire Strikes Back", which reads on either line where a dot would be left starting one). */}
          <p className="mt-1 flex min-h-[1.6em] flex-wrap items-baseline gap-x-1.5 text-meta text-(--mf-wl-quiet) [&_.mf-signature]:overflow-visible [&_.mf-signature]:text-clip">
            {signed && (
              <motion.span className="inline-flex shrink-0" initial={{ clipPath: 'inset(-40% 100% -40% -20%)' }} animate={{ clipPath: 'inset(-40% -20% -40% -20%)' }} transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}>
                <Signed who={who} />
              </motion.span>
            )}
            {where && signed && <span className="min-w-0">in {where}</span>}
          </p>
        </MemoryPostcard>
      </div>
      </Unstretched>
    </motion.div>
  )
}

/** A note, as the Inbox keeps it: your words as you wrote them, waiting to grow into something longer. */
export function NoteResult({ words }: { words: string }): React.JSX.Element {
  return (
    <motion.div layoutId="reel-item-note" transition={CAM} style={{ borderRadius: 12 }} className={`${PANEL} w-full`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <Unstretched>
      <p className="flex items-baseline gap-2 px-4 pt-3 pb-1 text-[0.8125rem] font-medium text-foreground">Inbox <span className="font-normal text-muted-foreground">Note</span></p>
      <p className="px-4 pt-1 pb-3.5 text-[0.9375rem] leading-snug text-pretty text-foreground" style={EDITOR_FONT}>{words}</p>
      </Unstretched>
    </motion.div>
  )
}

/** A link, as it is kept: the page's picture, its name and where it lives, not its address. */
export function LinkResult(): React.JSX.Element {
  return (
    <motion.div layoutId="reel-item-link" transition={CAM} style={{ borderRadius: 12 }} className={`${PANEL} w-full`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <Unstretched>
      {/* The page's own picture, as a kept link shows it: Dune is a desert planet. */}
      <div className="relative h-20 w-full bg-[color-mix(in_oklab,var(--tt-color-text-brown)_30%,var(--background))]"><img src={dunesUrl} alt="" draggable={false} className="absolute inset-0 size-full object-cover" /></div>
      <div className="px-4 py-3">
        {/* Title and site each on one line. */}
        <p className="truncate text-[0.9375rem] font-medium whitespace-nowrap text-foreground">{LINK_PAGE.title}</p>
        <p className="truncate text-[0.75rem] whitespace-nowrap text-muted-foreground">{LINK_PAGE.site}</p>
      </div>
      </Unstretched>
    </motion.div>
  )
}

/** A word, as Review asks it: the question on its face, the meaning on its back. */
export function CardResult({ term, meaning, over, onTurn }: { term: string; meaning: string; over: boolean; onTurn: (over: boolean) => void }): React.JSX.Element {
  // Sized to the narrowest column it gets: the term on its face never pushes the card wider than its place.
  const face = 'flex h-full min-h-[9.5rem] flex-col justify-center rounded-xl border bg-popover px-4 py-5 text-popover-foreground shadow-(--mf-panel-shadow)'
  return (
    <motion.div layoutId="reel-item-word" transition={CAM} style={{ borderRadius: 12 }} className="w-full" data-ghost="card" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <Unstretched>
      <Flip over={over} onTurn={onTurn}
        front={<div className={face}><p className="text-xs text-muted-foreground">Review</p><h2 className="mt-1.5 font-heading text-[clamp(1rem,1.5vw,1.25rem)] leading-snug font-semibold tracking-[-0.015em] text-balance text-foreground">What does “{term}” mean?</h2></div>}
        back={<div className={face}><p className="text-xs text-muted-foreground">What does “{term}” mean?</p><p className="mt-1.5 font-heading text-[1.0625rem] leading-snug text-foreground">{meaning}</p></div>} />
      </Unstretched>
    </motion.div>
  )
}

// --- the map the three join ------------------------------------------------------

type Dot = SimulationNodeDatum & { id: string; title: string; kind: string; links: number }
type Edge = SimulationLinkDatum<Dot>

/**
 * A year of notes in miniature: the quote just caught, the note that links
 * to it, and around them an example of a year's links, each one a reader made.
 */
const NODES: [string, string, string][] = [
  ['todo', 'Book tickets for Hamlet at the Globe', 'todo'], ['link', 'Dune (novel)', 'link'], ['quote', 'Do or do not. There is no try.', 'quote'], ['word', 'petrichor', 'word'],
  ['note', 'Essay on grit', 'note'], ['meditations', 'The Empire Strikes Back', 'note'],
  ['stoics', 'Films that stayed with me', 'note'], ['kinder', 'Try the thing you are scared of', 'note'], ['sorrows', 'Words for weather', 'note'],
  ['lisbon', 'Friday night plans', 'note'], ['birthday', 'Plays to see this year', 'note'], ['walk', 'Walking as a way to think', 'note'],
  ['seneca', 'Fear is the path to the dark side.', 'quote'], ['letters', 'The Phantom Menace', 'note'], ['mono', 'apricity', 'word'],
  ['flights', 'Book dinner after Hamlet', 'todo'], ['cook', 'Cooking for friends', 'note'], ['read', 'How to read a book', 'link'], ['hiraeth', 'virga', 'word']
]
/** The link made in the scene itself: the note written beside the quote, to it. */
const MADE: [string, string][] = [['note', 'quote']]
const EDGES: [string, string][] = [
  ...MADE, ['link', 'todo'], ['link', 'stoics'], ['quote', 'meditations'], ['note', 'meditations'], ['quote', 'stoics'], ['quote', 'kinder'], ['word', 'sorrows'], ['word', 'kinder'], ['mono', 'sorrows'], ['hiraeth', 'sorrows'],
  ['todo', 'birthday'], ['todo', 'lisbon'], ['lisbon', 'flights'], ['seneca', 'letters'], ['seneca', 'stoics'], ['letters', 'stoics'], ['meditations', 'stoics'],
  ['walk', 'kinder'], ['walk', 'stoics'], ['cook', 'birthday'], ['read', 'walk']
]
/** What the scene draws itself, not the example around it. */
const OURS = new Set(['todo', 'quote', 'word', 'link', 'note'])
/** Bigger the more links touch it, as on the notes map. */
const radius = (links: number): number => Math.min(9, 3 + Math.sqrt(links) * 1.6)

let laid: { dots: Dot[]; edges: [Dot, Dot][] } | null = null
/** Settled once, out of sight: the map never jiggles on screen. */
function layout(): { dots: Dot[]; edges: [Dot, Dot][] } {
  if (laid) return laid
  const dots: Dot[] = NODES.map(([id, title, kind], i) => ({ id, title, kind, links: EDGES.filter((edge) => edge.includes(id)).length, x: Math.cos(i * 2.4) * 80, y: Math.sin(i * 2.4) * 60 }))
  const byId = new Map(dots.map((dot) => [dot.id, dot]))
  const links: Edge[] = EDGES.map(([a, b]) => ({ source: byId.get(a)!, target: byId.get(b)! }))
  forceSimulation(dots)
    .force('link', forceLink<Dot, Edge>(links).distance(46).strength(0.7))
    .force('charge', forceManyBody<Dot>().strength(-140))
    .force('collide', forceCollide<Dot>(16))
    .force('x', forceX<Dot>(0).strength(0.08))
    .force('y', forceY<Dot>(0).strength(0.12))
    .stop()
    .tick(300)
  // The note is written right beside the quote it links to: the pair is the shot.
  const [quote, note] = [byId.get('quote')!, byId.get('note')!]
  note.x = quote.x! - 34
  note.y = quote.y! + 4
  laid = { dots, edges: EDGES.map(([a, b]) => [byId.get(a)!, byId.get(b)!]) }
  return laid
}

export type MapShot = { dots: boolean; note: string; suggest: boolean; linked: boolean; folded: boolean; pulled: boolean; lit: string | null }

/**
 * A link being made, then the map it joins. Close in, the quote is a dot;
 * a note beside it is written, "@Do or" asks for a note by name, and the
 * suggestion is taken; the note folds into a dot of its own and the lines
 * draw, note to book to quote. Then the camera pulls back and an example
 * year of links draws in around them, nearest first.
 */
export function LinkScene({ shot, quiet, onLight, hint = null }: { shot: MapShot; quiet: boolean; onLight: (id: string | null) => void; /** A dot to point at: a soft ring pulses round it. */ hint?: string | null }): React.JSX.Element {
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
  // The camera: 0 close on the link being made, 1 the whole map. Every position is worked out from it, so dots stay dot-sized.
  const cam = useMotionValue(shot.pulled ? 1 : 0)
  const [t, setT] = useState(cam.get())
  useEffect(() => cam.on('change', setT), [cam])
  useEffect(() => {
    const run = animate(cam, shot.pulled ? 1 : 0, quiet ? { duration: 0 } : { duration: 1.1, ease: DRAWER })
    return () => run.stop()
  }, [shot.pulled]) // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map(dots.map((dot) => [dot.id, dot]))
  const xs = dots.map((dot) => dot.x!), ys = dots.map((dot) => dot.y!)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const fit = { k: Math.min(2.4, (size.w - 160) / (x1 - x0 || 1), (size.h - 70) / (y1 - y0 || 1)), x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
  // Close in, the pair fills the middle of the frame: the note being written, and the quote.
  const [quote, noteDot] = [byId.get('quote')!, byId.get('note')!]
  // Composed as one line across the middle: the note card, its dot, the link, the quote's dot, its name.
  const nk = Math.max(fit.k * 1.3, 2)
  const near = { k: nk, x: (noteDot.x! - 290 / nk + quote.x! + 230 / nk) / 2, y: quote.y! }
  const view = { k: near.k + (fit.k - near.k) * t, x: near.x + (fit.x - near.x) * t, y: near.y + (fit.y - near.y) * t }
  const px = (dot: Dot): [number, number] => [size.w / 2 + (dot.x! - view.x) * view.k, size.h / 2 + (dot.y! - view.y) * view.k]
  // The example draws in a ring at a time, by how far each dot is from the three.
  const ring = (dot: Dot): number => (quiet ? 0 : Math.min(0.9, Math.hypot(dot.x! - near.x, dot.y! - near.y) / 180))
  const shown = (id: string): boolean => (id === 'note' ? shot.folded : id === 'quote' ? shot.dots : shot.pulled)
  const lit = shot.lit
  const around = lit ? new Set(EDGES.filter((edge) => edge.includes(lit)).flat()) : null
  const on = (id: string): boolean => !around || around.has(id)
  const made = (a: Dot, b: Dot): boolean => MADE.some(([p, q]) => (p === a.id && q === b.id) || (p === b.id && q === a.id))
  const note = byId.get('note')!
  const litDot = lit ? byId.get(lit) : null
  return (
    <div ref={frame} className="relative h-full min-h-[16rem] w-full" onPointerLeave={() => onLight(null)}>
      {size.w > 0 && (
        <>
          <svg aria-hidden className="absolute inset-0 size-full overflow-visible">
            {edges.map(([a, b]) => {
              const [ax, ay] = px(a), [bx, by] = px(b)
              const ours = made(a, b)
              const bright = !!lit && (a.id === lit || b.id === lit)
              const visible = ours ? shot.linked : shot.pulled && shown(a.id) && shown(b.id)
              return <motion.path key={`${a.id}-${b.id}`} d={`M${ax} ${ay}L${bx} ${by}`} stroke="var(--foreground)" strokeWidth={ours || bright ? 1.5 : 1} fill="none"
                initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: visible ? 1 : 0, opacity: !visible ? 0 : bright ? 0.6 : lit ? 0.06 : ours ? 0.55 : 0.2 }}
                transition={{ duration: quiet ? 0 : ours ? 0.4 : 0.45, ease: EASE, delay: ours || lit ? 0 : ring(a) + 0.15 }} />
            })}
            {dots.map((dot) => {
              const [x, y] = px(dot)
              const ours = OURS.has(dot.id)
              return <motion.circle key={dot.id} data-ghost={`dot-${dot.id}`} cx={x} cy={y} r={radius(dot.links) + (ours ? 1.5 : 0)} fill={typeOf(dot.kind).tint} stroke="var(--background)" strokeWidth={1.5}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: !shown(dot.id) ? 0 : !on(dot.id) ? 0.15 : ours ? 1 : 0.7, scale: shown(dot.id) ? 1 : 0.4 }}
                transition={{ duration: quiet ? 0 : 0.35, ease: EASE, delay: ours || lit ? 0 : ring(dot) }}
                onPointerEnter={() => onLight(dot.id)} />
            })}
            {hint && dots.filter((dot) => dot.id === hint).map((dot) => {
              const [x, y] = px(dot)
              return <circle key="hint" className="mf-pulse-ring pointer-events-none" cx={x} cy={y} r={radius(dot.links) + 4} fill="none" stroke="var(--primary)" strokeWidth={2} />
            })}
          </svg>
          {/* Our dots name themselves while the camera is close; once it pulls back, only the lit ones do. */}
          {dots.filter((dot) => shown(dot.id) && ((!lit && (dot.id === 'quote' || dot.id === 'note')) || (!!lit && around!.has(dot.id) && dot.id !== lit))).map((dot) => {
            const [x, y] = px(dot)
            const r = radius(dot.links) + 6
            const left = litDot ? x <= px(litDot)[0] : dot.id === 'note'
            return (
              <motion.span key={dot.id} data-dot-label className="pointer-events-none absolute -translate-y-1/2 text-[0.9375rem] font-medium whitespace-nowrap text-foreground [paint-order:stroke] [-webkit-text-stroke:3px_var(--background)]"
                style={left ? { right: size.w - x + r, top: y } : { left: x + r, top: y }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring.fast}>
                {dot.title}
              </motion.span>
            )
          })}
          {/* The note being written beside the quote, until its link is made. */}
          <AnimatePresence>
            {shot.dots && !shot.folded && (
              <NoteBeing key="note" at={px(note)} text={shot.note} suggest={shot.suggest} quiet={quiet} />
            )}
          </AnimatePresence>
          {litDot && <MapCard dot={litDot} at={px(litDot)} links={around!.size - 1} frame={size} blocked={[...dots.filter((dot) => shown(dot.id) && !around!.has(dot.id)).map((dot) => {
            const [x, y] = px(dot)
            return [x - 8, y - 8, x + 8, y + 8]
          }), ...dots.filter((dot) => around!.has(dot.id)).flatMap((dot) => {
            const [x, y] = px(dot)
            const r = radius(dot.links) + 6
            const words = dot.id === lit ? 0 : dot.title.length * 7
            const left = x < px(litDot)[0]
            const [lx, ly] = px(litDot)
            // Its line to the lit dot, as a row of small boxes the card must not sit on.
            const line = Array.from({ length: 8 }, (_, i) => [lx + ((x - lx) * (i + 0.5)) / 8 - 4, ly + ((y - ly) * (i + 0.5)) / 8 - 4, lx + ((x - lx) * (i + 0.5)) / 8 + 4, ly + ((y - ly) * (i + 0.5)) / 8 + 4])
            return [[x - r, y - r, x + r, y + r], left ? [x - r - words, y - 9, x - r, y + 9] : [x + r, y - 9, x + r + words, y + 9], ...line]
          })]} />}
          <motion.p className="absolute bottom-1 left-0 text-[0.9375rem] text-(--mf-wl-quiet)" initial={false} animate={{ opacity: shot.pulled ? 1 : 0 }} transition={{ duration: 0.3, delay: shot.pulled && !quiet ? 0.6 : 0 }}>
            Around them, an example of a year’s links
          </motion.p>
        </>
      )}
    </div>
  )
}

/**
 * A note as the box writes it, small, beside the dot it will become: its
 * words, then "@" asking for another note by name, and the suggestion list
 * the editor shows, one row lit. Taken, it folds into its dot.
 */
function NoteBeing({ at, text, suggest, quiet }: { at: [number, number]; text: string; suggest: boolean; quiet: boolean }): React.JSX.Element {
  const asking = text.lastIndexOf('@')
  const quote = typeOf('quote')
  const Quote = quote.icon
  const book = typeOf('note')
  const Book = book.icon
  return (
    <motion.div className="absolute z-10 w-[17rem] origin-right -translate-y-1/2" style={{ right: `calc(100% - ${at[0] + 4}px)`, top: at[1] }}
      initial={quiet ? false : { opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.05, transition: { duration: 0.3, ease: DRAWER } }} transition={{ duration: 0.3, ease: EASE }}>
      <div className="rounded-xl border border-foreground/10 bg-popover px-4 py-3 text-popover-foreground shadow-(--mf-panel-shadow)" style={EDITOR_FONT}>
        <p className="text-[0.95em] leading-[1.5]">
          {asking < 0 ? text : <>{text.slice(0, asking)}<span data-accent-ok className="rounded-[0.2em] bg-primary/12 px-[0.1em] text-primary">{text.slice(asking)}</span></>}
          {/* The link taken: its words as the editor shows a link to a note, reaching right to the dot. */}
          <span className="mf-ghost-caret" data-typing="" />
        </p>
      </div>
      <AnimatePresence>
        {suggest && (
          <motion.div className="absolute top-[calc(100%+6px)] left-3 w-60 rounded-lg border bg-popover p-1 text-popover-foreground shadow-(--mf-panel-shadow)"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={spring.fast}>
            <div className="flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-[0.8125rem] text-foreground">
              <Quote className="size-3.5 shrink-0" style={{ color: quote.tint }} /><span className="flex-1 truncate">Do or do not. There is no try.</span><kbd className="font-sans text-key opacity-60">↵</kbd>
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 text-[0.8125rem] text-muted-foreground">
              <Book className="size-3.5 shrink-0" style={{ color: book.tint }} /><span className="flex-1 truncate">The Empire Strikes Back</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/**
 * The card for the dot pointed at, placed as the notes map places it: of
 * eight spots around the dot, the one that covers the fewest lit dots and
 * names and stays inside the frame.
 */
function MapCard({ dot, at, links, frame, blocked }: { dot: Dot; at: [number, number]; links: number; frame: { w: number; h: number }; blocked: number[][] }): React.JSX.Element {
  const type = typeOf(dot.kind)
  const Icon = type.icon
  const card = useRef<HTMLDivElement>(null)
  const [spot, setSpot] = useState<[number, number] | null>(null)
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const w = el.offsetWidth, h = el.offsetHeight, gap = 12 + radius(dot.links)
    const [x, y] = at
    // Above and to the left first, as a hand pointing from below right leaves it clear.
    const spots = [
      [x - gap - w, y - gap - h], [x - w / 2, y - gap - h], [x + gap, y - gap - h], [x - gap - w, y - h / 2],
      [x + gap, y - h / 2], [x - gap - w, y + gap], [x - w / 2, y + gap], [x + gap, y + gap]
    ]
    // The names as drawn, measured: what the card must cover least of, beside the estimates it was given.
    const box = el.parentElement!.getBoundingClientRect()
    // Measured on the screen, put back into the frame's own pixels (the page may still be easing in, scaled).
    const k = box.width / (el.parentElement!.offsetWidth || box.width || 1)
    const names = [...el.parentElement!.querySelectorAll('[data-dot-label]')].map((one) => {
      const r = one.getBoundingClientRect()
      return [(r.left - box.left) / k - 4, (r.top - box.top) / k - 2, (r.right - box.left) / k + 4, (r.bottom - box.top) / k + 2]
    })
    const cost = ([sx, sy]: number[]): number => {
      let covered = 0
      for (const [x0, y0, x1, y1] of [...blocked, ...names, ...names]) covered += Math.max(0, Math.min(sx + w, x1) - Math.max(sx, x0)) * Math.max(0, Math.min(sy + h, y1) - Math.max(sy, y0))
      const outside = Math.max(0, 8 - sx) + Math.max(0, sx + w - frame.w + 8) + Math.max(0, 8 - sy) + Math.max(0, sy + h - frame.h + 8)
      return covered + outside * 1000
    }
    setSpot(spots.reduce((a, b) => (cost(b) < cost(a) ? b : a)) as [number, number])
  }, [dot.id, Math.round(at[0]), Math.round(at[1]), frame.w, frame.h]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.div ref={card} key={dot.id} className="pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-(--mf-panel-shadow)"
      style={{ left: spot?.[0] ?? 0, top: spot?.[1] ?? 0, visibility: spot ? 'visible' : 'hidden' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring.fast}>
      <div className="flex items-center gap-1.5 text-[0.9375rem] font-medium text-foreground"><Icon className="size-3.5 shrink-0" style={{ color: type.tint }} /><span className="text-balance">{dot.title}</span></div>
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

/** The starters' parts, as the stage and the results show them. */
export const QUOTE = starterOf('quote')
export const WORD = { term: starterOf('word').text.split('\n')[0], meaning: starterOf('word').text.split('\n')[1] }
