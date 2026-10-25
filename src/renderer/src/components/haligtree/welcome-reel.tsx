import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import { CalendarDays } from 'lucide-react'
import { spring } from '@/lib/motion'
import { chime, click, type Cue } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { CAPTURE_TYPES, type CaptureType } from '@/components/capture-kinds/capture-kind-picker'
import { STARTERS, type Starter } from '@/lib/welcome-box'
import { seeded, typingWaits } from '@/lib/typing'
export { seeded }
import { dayjs } from '../../../../main/dates'
import { MemoryPostcard } from './memory-postcard'
import { Signed } from './signature'
// Dunes at sunset, Great Sand Dunes National Park: NPS, Debra Miller, public domain. The sandbox's Dune link wears the same picture.
import dunesUrl from '@/assets/welcome/dunes.webp'

/**
 * The welcome's reel: the parts it is filmed with.
 *
 * - a timeline (`useScript`): each chapter is a list of beats, and what is on
 *   screen is worked out from how far it has got, so settling a chapter is
 *   jumping to its last beat, never a race of timers
 * - the stage: the capture box drawn as it is, from its own parts, which a
 *   ghost types into, and the list it files what it caught into
 * - next year's postcard, as a quote comes back on Home
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

export type Kind = Starter['kind']
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

export function useScript<S extends object>(start: S, beats: Beat<S>[], play: boolean, pace = PACE, lead = 0): { state: S; done: boolean; settle: () => void; onward: () => void; back: () => boolean; waiting: boolean; part: Part | null } {
  const [at, setAt] = useState(play ? -1 : beats.length - 1)
  // Gone back to the end of an earlier part: held there, whole, until a press goes on.
  const [held, setHeld] = useState(false)
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
    setHeld(false)
    setAt(k)
    beats[k].cue?.()
    from(k)
  }
  // A press while the words are still being read starts the demo now; once it plays, a press shows its end.
  const settle = (): void => {
    if (shift > 0 && now.current < 1 && beats.length > 1) return jump(1)
    timers.current.forEach(clearTimeout)
    setHeld(false)
    setAt(beats.length - 1)
  }
  const onward = (): void => {
    if (shift > 0 && now.current < 1 && beats.length > 1) return jump(1)
    const next = beats.findIndex((beat, i) => i > now.current && beat.stop)
    if (next < 0) {
      timers.current.forEach(clearTimeout)
      setHeld(false)
      return setAt(beats.length - 1)
    }
    jump(next)
  }
  // Back a part: to the end of the one before the part on screen, held there whole. False on the first part: Back is the page's to take.
  const back = (): boolean => {
    const begin = [...beats.keys()].reverse().find((i) => i <= now.current && beats[i].stop)
    if (begin === undefined) return false
    timers.current.forEach(clearTimeout)
    setAt(begin - 1)
    setHeld(true)
    return true
  }
  const state = useMemo(() => beats.slice(0, at + 1).reduce<S>((now, beat) => ({ ...now, ...beat.to }), start), [at]) // eslint-disable-line react-hooks/exhaustive-deps
  const done = at >= beats.length - 1
  // The part playing: from the last place a press goes on to (or the start), to the next one (or the end).
  let part: Part | null = null
  if (!done && !held) {
    const stops = beats.map((beat, i) => (beat.stop ? i : -1)).filter((i) => i >= 0)
    const end = stops.find((i) => i > at) ?? beats.length - 1
    const begin = [...stops].reverse().find((i) => i <= at) ?? -1
    const on = (i: number): number => clock.current.at + (time(i) - time(clock.current.k)) * pace
    part = { from: on(begin), to: on(end) }
  }
  return { state, done, settle, onward, back, waiting: held && !done, part }
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
 * draws the caret after them); then Haligtree sorts them, and what it read lifts
 * out of the line into its place: a day into the date pill, a name into Who
 * said it. `fold` is the line folded to a square, on its way to a slot.
 */
export type Box = { text: string; page: boolean; lit: string | null; kind: CaptureType; date: string | null; tail: { who: string; where: string } | null; who: string; where: string; press: boolean; fold: boolean; item: Kind | null; typing?: boolean }
export const EMPTY_BOX: Box = { text: '', page: false, lit: null, kind: 'note', date: null, tail: null, who: '', where: '', press: false, fold: false, item: null }

/** The editor's own face and size, so the stage's words are the box's words. */
const EDITOR_FONT = { fontFamily: 'var(--mf-font, "Fraunces Variable", Georgia, serif)', fontVariationSettings: '"SOFT" 20, "WONK" 1', fontSize: 'calc(1rem * var(--mf-text-scale, 1))' }
/** Who said it and Where from, as the box draws them (App.tsx FIELD). */
const FIELD = 'inline-flex h-[1.4rem] shrink-0 items-center overflow-hidden rounded-full border border-foreground/10 px-2 text-meta whitespace-nowrap text-foreground/85'
/** What a todo's words were read as, as the box's date pill draws it. */
const DATE_PILL = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs whitespace-nowrap'

/**
 * The box, drawn from its own parts, as the welcome keeps it (lesson mode,
 * App.tsx: no menu, no Create more, no word count): the words in the editor's
 * face, the date or the who and where Haligtree read in them, the kind chip
 * guessing, and Create. A picture, never a control: nothing in it takes a click.
 */
export function Stage({ box }: { box: Box }): React.JSX.Element {
  const lines = box.text.split('\n')
  const words = useRef<HTMLDivElement>(null)
  // Where the words sit now, kept for the chip that will fly from them.
  useLayoutEffect(() => noteCaught(words.current))
  // What Haligtree read moves to its place by position alone: its letters are never stretched to the size of where it lands.
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
                  {/* What Haligtree will lift out, lit where it sits in the line until it goes. */}
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
      {/* Under the writing: only what Haligtree read, once it has read it. */}
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
export const shortOf = (kind: Kind): string => ({ note: 'Why do old movies…', todo: 'Rewatch Empire…', quote: 'Do or do not…', word: 'petrichor', link: LINK_PAGE.title })[kind]

/** The link's page as Haligtree would fetch it, kept here so the welcome works offline. */
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
      {/* Flown in, it has no layout animation to undo, so its words sit still in it: a layout-tracked child here was left part-way down when the page around it moved, its words cut by the chip's edge. */}
      {fly
        ? <span className="flex items-center gap-1.5"><Icon className="size-4 shrink-0" style={{ color: type.tint }} />{shortOf(kind)}</span>
        : <Unstretched className="flex items-center gap-1.5"><Icon className="size-4 shrink-0" style={{ color: type.tint }} />{shortOf(kind)}</Unstretched>}
    </motion.div>
  )
}

/** An empty slot's size: the chip that will land in it, unseen. */
function ChipSize({ kind }: { kind: Kind }): React.JSX.Element {
  const Icon = typeOf(kind).icon
  return <span aria-hidden className="invisible flex h-9 items-center gap-1.5 border border-transparent px-3 text-[0.9375rem] whitespace-nowrap"><Icon className="size-4 shrink-0" />{shortOf(kind)}</span>
}

/**
 * What was caught, a row a kind: a dashed slot until its chip flies in from
 * the box, and beside it what Haligtree did with it, a bold lead-in then why it
 * helps, there from the moment Haligtree did it and staying, so the box can
 * move on while it is read.
 */
export function Caught({ kinds, filled, said, lines }: { kinds: Kind[]; filled: Kind[]; said: Kind[]; lines: Partial<Record<Kind, [string, string]>> }): React.JSX.Element {
  return (
    <ul aria-live="polite" className="flex flex-col gap-[clamp(0.625rem,2vh,1.125rem)]">
      {kinds.map((kind) => (
        <li key={kind} className="flex flex-col items-start gap-1.5">
          {/* Each slot the size of what lands in it, empty or filled. */}
          <div data-slot={kind} className={`flex h-9 items-center justify-center rounded-full border border-dashed transition-colors duration-300 ${filled.includes(kind) ? 'border-transparent' : 'border-foreground/20'}`}>
            {filled.includes(kind) ? <Chip kind={kind} fly /> : <ChipSize kind={kind} />}
          </div>
          <motion.p data-aha={kind} className="text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.3125rem)] leading-snug text-balance text-foreground"
            initial={false} animate={{ opacity: said.includes(kind) ? 1 : 0, y: said.includes(kind) ? 0 : 4 }} transition={{ duration: 0.25, ease: EASE }}>
            <strong className="font-semibold">{lines[kind]?.[0]}</strong> {lines[kind]?.[1]}
          </motion.p>
        </li>
      ))}
    </ul>
  )
}

// --- what a quote becomes --------------------------------------------------------

/** A quote, as it comes back a year from today: a postcard, signed, set down a little askew. */
export function PostcardResult({ words, who, where, signed, id = 'reel-item-quote', themed = false, write = false }: { words: string; who: string; where?: string; signed: boolean; id?: string; /** Its white print frame in the page's own colours, to wear the theme with it. */ themed?: boolean; /** The line written onto the card as it lands, a word at a time, as ink takes. */ write?: boolean }): React.JSX.Element {
  return (
    <motion.div layoutId={id} transition={CAM} style={{ borderRadius: 12 }} className="w-full" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <Unstretched>
      <div>
        {/* Postmarked the day it was caught: a year ago today. */}
        <MemoryPostcard at={dayjs().subtract(1, 'year').toISOString()} seed="welcome-quote" hold={false}
          className={`!shadow-[0_2px_3px_color-mix(in_oklab,var(--mf-shadow-ink)_14%,transparent),0_22px_44px_-16px_color-mix(in_oklab,var(--mf-shadow-ink)_42%,transparent)] ${themed ? '!bg-[color-mix(in_oklab,var(--foreground)_10%,var(--background))]' : 'dark:bg-[color-mix(in_oklab,white_88%,var(--background))]'}`}>
          <p className="text-meta text-(--mf-wl-quiet)">Saved a year ago today</p>
          <p aria-label={words.replace(/^[“"]|[”"]$/g, '')} className="clear-both mt-1 font-heading text-[1.0625rem] leading-snug text-foreground">
            {/* Written on as it lands: each word comes up out of a soft blur, as ink taking on the card, one after another. */}
            {words.replace(/^[“"]|[”"]$/g, '').split(' ').map((word, i, all) => (
              <Fragment key={i}>
                <motion.span aria-hidden data-written={word} className="inline-block" initial={write ? { opacity: 0, filter: 'blur(3px)', y: 2 } : false}
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }} transition={{ duration: 0.42, ease: EASE, delay: 0.35 + i * 0.11 }}>
                  {word}
                </motion.span>
                {i < all.length - 1 && ' '}
              </Fragment>
            ))}
          </p>
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
