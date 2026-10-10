import { Children, cloneElement, createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SlotText } from 'slot-text/react'
import { CircleX, type LucideIcon } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowDownIcon from '@/components/ui/arrow-narrow-down-icon'
import ArrowNarrowUpIcon from '@/components/ui/arrow-narrow-up-icon'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, byKeys, hush, shift, speak, speakAfter, useFirstVisit } from '@/lib/motion'
import { detent, slotTicker } from '@/lib/proximity'
import { Arrow } from './marks'
import { Coolshape, type shapeTypes } from 'coolshapes-react'
import Lenis from 'lenis'
import { useLive, vigil } from '@/lib/vigil'
import { chime, soundOn } from '@/lib/sound'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { useStoredFlag } from '@/lib/use-stored-flag'
import { useDetailsShown } from '@/lib/reading'
import { keyFor, useKeyChanges, withKeys } from '@/lib/keys'
import { Kbd as ShadKbd, KbdGroup } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { KindAsker } from './note-extras'
import { QuestionAsker } from './questions-view'
import { BookAsker } from './books'
import { GoalAsker } from './goals-view'
import { MilestoneAsker } from './milestones'
import { num } from '../../../../main/dates'
import { AliveIcon } from '@/components/ui/alive-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { OrbState } from 'thinking-orbs'
import { Orb } from './orb'
import type { AnimatedIconHandle, AnimatedIconProps } from '@/components/ui/types'
import Volume2Icon from '@/components/ui/volume-2-icon'
import VolumeXIcon from '@/components/ui/volume-x-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import InfoCircleIcon from '@/components/ui/info-circle-icon'
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon'
import { GHOST } from './ghost'
import { Avatar, PersonMenu } from './avatar'
import { pickAvatar, setAvatar } from '@/lib/people'
import { near } from '../../../../main/near'
import { useHere, usePane } from '@/lib/split'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowDown = alive(ArrowNarrowDownIcon)
const ArrowUp = alive(ArrowNarrowUpIcon)

/**
 * The few parts every view is built from, so the views read as one app. The
 * look follows Linear and Todoist: a quiet header with a count, rows that are
 * one line of meaning and one of detail, properties down the right, and an
 * empty state that says what the view is for and how to fill it.
 */

/**
 * How wide a list is beside an open page: one width for every list, dragged
 * at its right edge (double-click puts it back), kept between visits. A list
 * of titles needs a column, not half the window.
 */
const LIST_WIDTH = 'list-width'
function useListWidth(): [string, React.JSX.Element] {
  const [width, setWidth] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(LIST_WIDTH)) || 400
    } catch {
      return 400
    }
  })
  const keep = (next: number): void => {
    setWidth(next)
    try {
      localStorage.setItem(LIST_WIDTH, String(Math.round(next)))
    } catch {
      // This window only.
    }
  }
  const grip = (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize the list"
      title="Drag to resize · double-click to reset"
      data-home={width === 400 || undefined}
      className="group/grip absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize"
      onDoubleClick={() => keep(400)}
      onPointerDown={(event) => {
        event.preventDefault()
        const section = event.currentTarget.parentElement
        const page = section?.parentElement
        if (!section || !page) return
        const left = section.getBoundingClientRect().left
        const most = page.getBoundingClientRect().width * 0.6
        // The usual width is a detent: drawn in from a few pixels either side, with a tick on arriving.
        const tick = slotTicker()
        tick.start(Math.round(section.getBoundingClientRect().width) === 400 ? 'home' : null)
        const move = (at: PointerEvent): void => {
          const next = detent(Math.min(most, Math.max(280, at.clientX - left)), 400, 10)
          if (next === 400) tick('home')
          else tick.start(null)
          keep(next)
        }
        const up = (): void => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          document.body.style.removeProperty('cursor')
        }
        document.body.style.cursor = 'col-resize'
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-[background-color,scale] duration-150 ease-(--mf-ease) group-hover/grip:bg-ring/60 group-active/grip:bg-ring group-data-home/grip:group-active/grip:scale-x-[3] motion-reduce:transition-none" />
    </div>
  )
  return [`${width}px`, grip]
}

/**
 * A page's actions, on the right of its header line, as long as they fit
 * there. A narrow pane of a split page (or a narrow window) has less room
 * than they need: then they wait behind one ⋯ button, in the same order.
 * Measured on the line itself, so it follows the pane, not the window.
 */
function FitActions({ children }: { children: ReactNode }): React.JSX.Element {
  const line = useRef<HTMLDivElement>(null)
  // The width they took the last time they were all on the line.
  const need = useRef(0)
  const [folded, setFolded] = useState(false)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const box = line.current
    if (!box) return
    const fit = (): void => {
      if (!folded) {
        need.current = box.scrollWidth
        if (box.scrollWidth > box.clientWidth + 1) setFolded(true)
      } else if (box.clientWidth >= need.current) setFolded(false)
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(box)
    return () => watch.disconnect()
  })
  useEffect(() => void (!folded && setOpen(false)), [folded])
  return (
    // Overflowing to the right, never the left, so the line can measure what does not fit.
    <div ref={line} className="flex min-w-0 flex-1 items-center overflow-hidden">
      <div className="ml-auto flex shrink-0 items-center gap-1">
      {folded ? (
        <Popover open={open} onOpenChange={setOpen}>
          <Tip label="More">
            <PopoverTrigger asChild>
              <button type="button" aria-label="More" className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground data-[state=open]:bg-accent/60 data-[state=open]:text-foreground">
                <AliveIcon icon={DotsHorizontalIcon} size={16} />
              </button>
            </PopoverTrigger>
          </Tip>
          <PopoverContent align="end" className="w-auto max-w-[min(22rem,calc(100vw-2rem))] p-1.5 text-xs text-muted-foreground [&>*]:flex-wrap [&>*]:justify-end">
            {children}
          </PopoverContent>
        </Popover>
      ) : children}
      </div>
    </div>
  )
}

/** A view's frame: title, a muted count, actions on the right, then the body. */
export function Page({ title, count, unit = ['item', 'items'], actions, children, aside = false, wide = false }: {
  title: ReactNode
  /** Every bit of the window's width, even with a page-wide reading column: a week of days needs the room. */
  wide?: boolean
  /** What the count counts, one and many. */
  unit?: [string, string]
  /** A list beside an open item: in focus it goes, and the item has the window. */
  aside?: boolean
  count?: number
  actions?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  // A list never takes more than the drag allows (60%), so a width kept from a wider window cannot squeeze the page.
  const [listWidth, grip] = useListWidth()
  return (
    <section data-chrome={aside || undefined} className={cn('relative flex min-w-0 flex-1 flex-col', aside && 'hidden flex-none @[56rem]/page:flex')}
      style={aside ? { width: listWidth, maxWidth: '60%' } : undefined}>
      {aside && grip}
      {/* The window's toolbar already names the section, so this line only
          carries the count and the actions, and goes when it has neither. */}
      {(count !== undefined || actions) && (
        <header data-chrome={aside || undefined} className={`${wide ? '' : 'page-column '}flex h-10 shrink-0 items-center gap-2 border-b px-5 text-muted-foreground`}>
          {typeof title === 'string' && title.startsWith('#') ? <span className="font-medium text-foreground">{title}</span> : null}
          {count ? <span className="whitespace-nowrap tabular-nums"><Rolling text={count} /> {count === 1 ? unit[0] : unit[1]}</span> : null}
          <FitActions>{actions}</FitActions>
        </header>
      )}
      <SmoothScroll wide={wide}>{children}</SmoothScroll>
    </section>
  )
}

/**
 * A sentence that tells you something, typed out a word at a time as it
 * arrives, a beat after the page paints so the motion is seen rather than
 * lost in the opening frame, so the app reads as if it is talking to you rather than showing a
 * label (textmotion.dev's word reveal). Typed again when the words change.
 * Plain text when Motion is off.
 */
export function Typed({ text, className, step = 40, delay: asked = 700, story = false }: { text: string; className?: string; step?: number; delay?: number; story?: boolean }): React.JSX.Element {
  // Never sooner than a beat after it appears: typed with the first paint it
  // reads as noise, not as something said to you. Only a line that answers
  // what you just did (delay 0) starts at once.
  const delay = asked === 0 ? 0 : Math.max(asked, 600)
  const words = text.split(/(\s+)/)
  // Paced like someone typing it: a word takes as long as its letters (about
  // 28ms each at the usual step), a short gap between words, a breath after a
  // comma and a longer one after a full stop. Even spacing read as a reveal,
  // and too fast to feel said.
  const starts: number[] = []
  let at = 0
  for (const word of words) {
    starts.push(at)
    if (/^\s+$/.test(word)) continue
    at += word.length * step * 0.7 + 70 + (/[.!?:]$/.test(word) ? 200 : /[,;]$/.test(word) ? 100 : 0)
  }
  // One voice at a time (lib/motion.ts): settled when the words arrive, so a
  // later render never starts it again. A second line waits its turn.
  const id = useId()
  const turn = useRef<{ text: string; speaks: boolean } | null>(null)
  const long = delay + at + 364
  const root = document.documentElement
  // A line in a sequence takes its turn as told; any other may always speak,
  // except while the welcome holds the screen, and its turn is found below.
  if (turn.current?.text !== text) turn.current = { text, speaks: story ? speak(id, text, long, true) : !root.hasAttribute('data-welcoming') && !root.hasAttribute('data-welcome-ph') }
  const speaks = turn.current.speaks && root.dataset.motion !== 'off'
  const line = useRef<HTMLSpanElement>(null)
  // Its place in the queue, found once the page it is on is the one showing
  // (a page just left no longer counts), and before anything is painted.
  useLayoutEffect(() => {
    if (story || !speaks) return
    const wait = speakAfter(id, long) ?? 0
    if (wait) line.current?.querySelectorAll<HTMLElement>('.mf-typed').forEach((one) => void (one.style.animationDelay = `${parseFloat(one.style.animationDelay) + wait}ms`))
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => hush(id), [id])
  return (
    <span key={text} ref={line} data-line={id} className={className} aria-label={text}>
      {words.map((word, index) =>
        /^\s+$/.test(word) ? word : (
          <span key={index} aria-hidden className={speaks ? 'mf-typed' : 'inline-block'}
          style={speaks ? { animationDelay: `${delay + starts[index]}ms` } : undefined}>
            {/* A shortcut in a sentence is drawn as keys, one cap each. */}
            {/[⌃⌥⇧⌘]/.test(word)
              ? (() => {
                  // "⌘↵," ends a clause: the comma is the sentence's, not a key. "⌘," stays a key.
                  const [, keys, mark = ''] = word.match(/^(.*[⌃⌥⇧⌘].*[^⌃⌥⇧⌘])([.,;:])$/) ?? [, word]
                  return <><KbdGroup className="translate-y-[-1px] align-middle">{Array.from(keys!).map((key, n) => <Kbd key={n}>{key}</Kbd>)}</KbdGroup>{mark}</>
                })()
              : word}
          </span>
        )
      )}
    </span>
  )
}

// The folder's papers: where each sits tucked in, and where it rises to when
// the folder opens, fanned a little either way.
const PAPERS = [
  { left: 9, width: 34, tone: 0.9, open: { y: -9, x: -3, rotate: -9 } },
  { left: 12, width: 33, tone: 0.95, open: { y: -13, x: 1, rotate: 3 } },
  { left: 15, width: 31, tone: 0.99, open: { y: -8, x: 4, rotate: 11 } }
]

/**
 * What an empty page shows over its line: a folder in the accent's colour
 * with a few papers tucked in, nothing on them yet. Pointed at, it opens a
 * little and the papers rise and fan; on the first visit this session it
 * does so once by itself, a beat after the page paints. Drawn at 56 and
 * scaled, so the narrow panel's 44 is the same drawing. Reached by a key, it
 * does not open by itself; with Motion off it stays shut and still.
 */
function Folder({ size, seed }: { size: number; seed: string }): React.JSX.Element {
  const calm = useState(() => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches)[0]
  const first = useFirstVisit(`empty:${seed}`)
  const [peek, setPeek] = useState(false)
  useEffect(() => {
    if (calm || !first || byKeys()) return
    const open = setTimeout(() => setPeek(true), 450)
    const shut = setTimeout(() => setPeek(false), 1500)
    return () => (clearTimeout(open), clearTimeout(shut))
  }, [calm, first])
  const back = 'color-mix(in oklab, var(--primary) 58%, var(--background))'
  const front = 'color-mix(in oklab, var(--primary) 82%, var(--background))'
  const spring = { type: 'spring', stiffness: 260, damping: 20 } as const
  return (
    <motion.div aria-hidden className="mb-3 shrink-0" style={{ width: size, height: size }} initial={false}
      animate={peek ? 'open' : 'shut'} whileHover={calm ? undefined : 'open'}>
      <div className="relative size-14 origin-top-left" style={{ scale: String(size / 56), perspective: 160 }}>
        {/* The back, its tab on the left. */}
        <div className="absolute top-[9px] left-[3px] h-[8px] w-[20px] rounded-t-[4px]" style={{ background: back }} />
        <div className="absolute top-[13px] right-[3px] bottom-[5px] left-[3px] rounded-[5px] rounded-tl-none" style={{ background: back }} />
        {PAPERS.map((paper, at) => (
          <motion.div key={at} className="absolute top-[18px] h-[26px] rounded-[3px] shadow-[0_1px_2px_rgb(0_0_0/0.18)]"
            style={{ left: paper.left, width: paper.width, background: `oklch(${paper.tone} 0.008 80)`, originY: 1 }}
            variants={{ shut: { y: 0, x: 0, rotate: 0 }, open: paper.open }} transition={{ ...spring, delay: at * 0.03 }}>
            {/* A line or two on it, so it reads as paper. */}
            <div className="mx-[5px] mt-[5px] h-[2px] w-1/2 rounded-full bg-black/15" />
            <div className="mx-[5px] mt-[3px] h-[2px] w-2/3 rounded-full bg-black/10" />
          </motion.div>
        ))}
        {/* The front, swinging down from its foot as the folder opens. */}
        <motion.div className="absolute right-[3px] bottom-[5px] left-[3px] h-[29px] rounded-[5px] shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_-1px_3px_rgb(0_0_0/0.12)]"
          style={{ background: front, originY: 1 }}
          variants={{ shut: { rotateX: 0 }, open: { rotateX: -32 } }} transition={spring} />
      </div>
    </motion.div>
  )
}

/**
 * What an empty view is for, and the one thing that fills it. A folder with
 * nothing filed in it yet, in place of a grey icon: an empty view is the first
 * thing a new feature shows you, and it should not read as an error.
 */
export function Empty({ shape, shaped = false, title, children, action, compact = false }: {
  /** The coolshape drawn in the folder's place, when `shaped`. */
  shape: [shapeTypes, number]
  /** The shape, not the folder: a finished queue is done, not empty. */
  shaped?: boolean
  title: ReactNode
  children: ReactNode
  action?: ReactNode
  /** Sized for the prompt's narrow panel: less height above, a smaller shape. */
  compact?: boolean
}): React.JSX.Element {
  return (
    <div className={`flex max-w-sm flex-col items-start gap-3 ${compact ? 'px-2 py-10' : 'px-5 py-[16vh]'}`}>
      {shaped
        ? <Coolshape type={shape[0]} index={shape[1]} noise={false} size={compact ? 44 : 56} className="mb-3" />
        : <Folder size={compact ? 44 : 56} seed={typeof title === 'string' ? title : 'empty'} />}
      {/* A rest is a moment, not a missing list: its line at title size in the
          heading font, a step down in the prompt's narrow panel. */}
      <h2 className={compact ? 'text-heading font-semibold' : 'text-title font-medium'}>{title}</h2>
      <p className="leading-relaxed text-muted-foreground">{typeof children === 'string' ? <Typed text={children} step={30} /> : children}</p>
      {/* The one thing to do, with a small arrow in the margin pointing to it. */}
      {action && (
        <div className="flex items-center gap-1.5">
          {action}
          <Arrow seed={typeof title === 'string' ? title : 'empty'} draw={() => !byKeys()} className="-mt-6" />
        </div>
      )}
    </div>
  )
}

/** A key, the way a menu shows a shortcut. */
/** A key, as shadcn draws one, with a hairline edge so it reads as a cap. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <ShadKbd className={cn('rounded border border-border/80 text-key', className)}>{children}</ShadKbd>
}

/**
 * A shortcut's keys as you press them now: changed in Settings, the new keys;
 * cleared, nothing. One cap per step (G I is two), or with `each` one per key
 * (⌘ and K apart).
 */
export function Pressed({ keys, each = false, className }: { keys: string; each?: boolean; className?: string }): React.JSX.Element | null {
  useKeyChanges()
  const now = keyFor(keys)
  if (!now) return null
  const caps = now.split(' ').flatMap((step) => (each ? (step.match(/[⌃⌥⇧⌘]|[^⌃⌥⇧⌘]+/g) ?? [step]) : [step]))
  return <>{caps.map((key, n) => <Kbd key={n} className={className}>{key}</Kbd>)}</>
}

/** A labelled run of properties, the right-hand column of an open item. */
export function Props({ children, className, fold = false }: { children: ReactNode; className?: string; fold?: boolean }): React.JSX.Element | null {
  // Beside an open note (`fold`), put away until asked for: the note opens as
  // a page to read. The details button over the note brings them out.
  const shown = useDetailsShown()
  if (fold && !shown) return null
  // One size for every row, whatever window it sits in: the prompt's larger
  // base made some rows grow and others not. A caller's classes are merged
  // over these, so the prompt's drawer can drop the width and the rule.
  return <aside data-chrome className={cn('flex w-full shrink-0 flex-col gap-px overflow-y-auto border-t p-3 pt-4 text-control text-muted-foreground @[40rem]/page:w-64 @[40rem]/page:border-t-0 @[40rem]/page:border-l', fold && 'mf-details', className)}>{children}</aside>
}
export function PropLabel({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="mt-3 mb-1 px-2 text-meta font-medium first:mt-0">{children}</div>
}
/** Where reading a list starts: the note open now, else the keyboard cursor, else the top. */
export const startAt = (list: { id: string }[], open: string | null | undefined, cursor: number): number => {
  const at = open ? list.findIndex((one) => one.id === open) : -1
  return at >= 0 ? at : Math.max(0, cursor)
}

/**
 * Where an open item sits in its list, and the way to the next and the one
 * before, the way Linear's issue view has it: "3 / 426 ↓ ↑". ↓ and ↑ step
 * through the list whenever you are not typing.
 */
export function Stepper({ at, total, onStep }: { at: number; total: number; onStep: (to: number) => void }): React.JSX.Element | null {
  const latest = useRef({ at, total, onStep })
  latest.current = { at, total, onStep }
  // Split, only the pane in front steps.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing() || event.defaultPrevented || !here()) return
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const { at, total, onStep } = latest.current
      const to = at + (event.key === 'ArrowDown' ? 1 : -1)
      if (to < 0 || to >= total) return
      event.preventDefault()
      event.stopPropagation()
      chime('tap')
      onStep(to)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  if (at < 0 || total < 2) return null
  const go = (by: 1 | -1): void => {
    chime('tap')
    onStep(at + by)
  }
  return (
    <div className="flex shrink-0 items-center gap-1 text-control text-muted-foreground">
      <span className="mr-1 shrink-0 whitespace-nowrap tabular-nums"><span className="text-foreground"><Rolling text={at + 1} /></span> / <Rolling text={total} /></span>
      <Tip label="Next  ↓"><button type="button" aria-label="Next" disabled={at >= total - 1} onClick={() => go(1)} className="flex size-7 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-35"><ArrowDown className="size-4" /></button></Tip>
      <Tip label="Previous  ↑"><button type="button" aria-label="Previous" disabled={at <= 0} onClick={() => go(-1)} className="flex size-7 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-35"><ArrowUp className="size-4" /></button></Tip>
    </div>
  )
}

/**
 * A property you type into, shaped exactly like a Prop row beside it: an
 * icon, the words, a hover. No boxes of different shapes down one column.
 * Enter or leaving keeps it.
 */
export function PropInput({ icon: Icon, value, placeholder, onSave, suffix, type = 'text', ghost, does }: {
  icon: LucideIcon
  value: string
  placeholder: string
  onSave: (value: string) => void
  suffix?: string
  type?: 'text' | 'number'
  /** A faint example shown while it is empty, in place of the placeholder: never saved. */
  ghost?: string
  /** What the field does, in a line on hover, while it is empty. */
  does?: string
}): React.JSX.Element {
  const field = (
    <label data-ghost-field={ghost && !value ? '' : undefined} className="flex w-full cursor-text items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent focus-within:bg-accent">
      <Icon className="size-4 shrink-0" />
      <input
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 5 : undefined}
        defaultValue={value}
        placeholder={ghost ?? placeholder}
        aria-label={ghost ? placeholder : undefined}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        onBlur={(event) => onSave(event.target.value.trim())}
        className={cn('min-w-0 flex-1 bg-transparent text-control text-foreground tabular-nums outline-none placeholder:text-foreground/70 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none', ghost && GHOST)}
      />
      {suffix && <span className="shrink-0 text-meta">{suffix}</span>}
    </label>
  )
  return does && !value ? <Tip label={does}>{field}</Tip> : field
}

export function Prop({ icon: Icon, alive, children, onClick, active, tint, secret }: {
  icon?: LucideIcon
  /** One of itshover's animated icons instead, for a Prop that is a button. */
  alive?: React.ComponentType<AnimatedIconProps & React.RefAttributes<AnimatedIconHandle>>
  /** Private: blurred at rest, as in any list. */
  secret?: boolean
  /** A theme colour for the icon, where the colour means something. */
  tint?: string
  children: ReactNode
  onClick?: () => void
  active?: boolean
}): React.JSX.Element {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      data-private={secret ? '' : undefined}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${onClick ? 'hover:bg-accent hover:text-foreground' : ''} ${active ? 'text-foreground' : ''}`}
    >
      {alive
        ? <AliveIcon icon={alive} size={16} style={tint ? { color: `var(--tt-color-text-${tint})` } : undefined} />
        : Icon && <Icon className="size-4 shrink-0" style={tint ? { color: `var(--tt-color-text-${tint})` } : undefined} />}
      <span className={`min-w-0 truncate ${secret ? 'private-text' : ''}`}>{children}</span>
    </Tag>
  )
}


/** Tags as Todoist draws them: a small tag glyph and the word, in a quiet colour. */
// A thought can carry six routes back to it: a row shows the first few and
// counts the rest, "+3", named in full on hover.
export function Tags({ tags, max = 3 }: { tags: string[]; max?: number }): React.JSX.Element | null {
  const colors = useTagColors()
  if (!tags.length) return null
  const rest = tags.slice(max)
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      {tags.slice(0, max).map((tag) => (
        <span key={tag} style={{ color: `var(--tt-color-text-${colors[tag] ?? 'blue'})` }}>#{tag}</span>
      ))}
      {rest.length > 0 && (
        <Tip label={rest.map((tag) => `#${tag}`).join('  ')}>
          <span className="rounded-full bg-accent px-1.5 tabular-nums text-muted-foreground">+{rest.length}</span>
        </Tip>
      )}
    </span>
  )
}

/** Each tag's chosen colour, read once and again whenever anything changes. */
function useTagColors(): Record<string, string> {
  const meta = useLive(vigil.tagMeta, [] as { tag: string; color: string | null }[])
  return Object.fromEntries(meta.filter((row) => row.color).map((row) => [row.tag, row.color!]))
}

/** Where the focus is: a text box, the editor, or nothing that takes letters. */
const focus = (): 'box' | 'editor' | null => {
  const active = document.activeElement as HTMLElement | null
  if (active?.isContentEditable) return 'editor'
  return active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) ? 'box' : null
}
/**
 * Whether a key is going into something you are writing in, not to the page:
 * a field, the editor, or anything held over the page (Read, Details, a
 * question), whose keys the lists underneath must not act on.
 */
export const typing = (): boolean => focus() !== null || !!document.querySelector('[role="dialog"]')

/** Pin or unpin, and say so when the three places are full. */
export const pin = (table: 'captures' | 'nuggets', id: string, on: boolean): void =>
  void vigil.pin(table, id, on).then((ok) => (ok ? chime(on ? 'pin' : 'unpin') : refuse('Three pins at most: unpin one first')))

/**
 * Moving through a list the way the editor moves through a document: j and k,
 * or the arrows; gg and G for the ends; Enter to open. Escape only lets go of
 * something passing, like the words in a search (onEscape): it never goes
 * back, which is ⌘['s job. Inside
 * a text box only Ctrl-J and Ctrl-K move, so typing a j is still a j, and in
 * the editor none of it: the editor has its own vim. The same
 * keys in every list in the app, which is the whole point of having one hook.
 */
export function useListKeys(count: number, { onOpen, onEscape, enabled = true }: {
  onOpen?: (index: number) => void
  onEscape?: () => void
  enabled?: boolean
}): [number, (index: number) => void] {
  // -1 until a key is pressed: the ring belongs to the keyboard, so a list you
  // only ever click never shows one.
  const [at, setAt] = useState(-1)
  const last = useRef('')
  const latest = useRef({ count, onOpen, onEscape, at })
  latest.current = { count, onOpen, onEscape, at }
  useEffect(() => setAt((index) => Math.min(index, Math.max(0, count - 1))), [count])
  // Split, each pane's list has its own cursor, and only the front one's moves.
  const pane = usePane()
  const here = useHere()
  // The row the cursor is on stays in view. Rows mark themselves with
  // data-cursor, since a ref on an animated row is only read once.
  useEffect(() => {
    if (at >= 0) document.querySelector(pane ? `[data-pane="${pane}"] [data-cursor]` : '[data-cursor]')?.scrollIntoView({ block: 'nearest' })
  }, [at]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      const { count, onOpen, onEscape, at } = latest.current
      // A key something in front already took, like search over this list.
      if (event.defaultPrevented || !here()) return
      // The editor has its own vim, and its menus their own Ctrl-J and K.
      if (focus() === 'editor') return
      const inBox = focus() === 'box'
      const chord = event.ctrlKey && !event.metaKey
      const move = (to: number): void => {
        event.preventDefault()
        setAt(Math.max(0, Math.min(count - 1, to)))
      }
      if (event.metaKey || event.altKey) return
      if ((chord && event.key === 'j') || (!inBox && !chord && (event.key === 'j' || event.key === 'ArrowDown'))) return move(at + 1)
      if ((chord && event.key === 'k') || (!inBox && !chord && (event.key === 'k' || event.key === 'ArrowUp'))) return move(at - 1)
      if (inBox) return
      if (event.key === 'G') return move(count - 1)
      // A finished G G starts over, so a third g is the start of the next pair.
      if (event.key === 'g' && last.current === 'g') return void ((last.current = ''), move(0))
      last.current = event.key
      // Enter on a button or field reached with Tab is that control's own,
      // unless it is one of the rows.
      const held = document.activeElement
      const control = held instanceof HTMLElement && held.matches('button, a[href], input, textarea, select, [role="button"], [contenteditable="true"]') && !held.closest('[data-row], [data-cursor]')
      if (event.key === 'Enter' && onOpen && at >= 0 && at < count && !control) {
        event.preventDefault()
        onOpen(at)
      }
      if (event.key === 'Escape' && onEscape) onEscape()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])

  return [at, setAt]
}


/**
 * Escape in a note, once nothing else wants it, lets go of the note: the
 * editor gives up the keys, and the page stays where it is. Vim's insert or
 * visual mode, selected words, a menu or the find bar each take an Escape
 * first, one per press. The editor marks every Escape as handled, so whether
 * it is free is read on the way down, before the editor sees it.
 */
export function useEscapeLeavesEditor(): void {
  useEffect(() => {
    let free = false
    const before = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const editor = (event.target as Element | null)?.closest?.('.ProseMirror')
      const mode = editor?.getAttribute('data-vim-mode')
      free = !!editor && (!mode || mode === 'normal') && (window.getSelection()?.isCollapsed ?? true) &&
        !document.querySelector('[role=menu], [role=listbox], [role=dialog], .tiptap-suggestion-popup, [cmdk-root], .tiptap-find-bar:not([inert])')
    }
    const after = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !free) return
      free = false
      const held = document.activeElement
      if (held instanceof HTMLElement && held.closest('.ProseMirror')) held.blur()
    }
    window.addEventListener('keydown', before, true)
    window.addEventListener('keydown', after)
    return () => {
      window.removeEventListener('keydown', before, true)
      window.removeEventListener('keydown', after)
    }
  }, [])
}

/**
 * A list's top bar, set above the scrolling area rather than in it: blur
 * behind a sticky bar does not reach through this window, so rows scrolled
 * under it showed through. A panel offers the place (StripSlot); without one
 * the bar sits where it is written.
 */
export const StripSlot = createContext<HTMLElement | null>(null)
export function Strip({ className, children }: { className?: string; children: ReactNode }): React.JSX.Element {
  const slot = useContext(StripSlot)
  const bar = <div className={className}>{children}</div>
  return slot ? createPortal(bar, slot) : bar
}

/**
 * Say what an action did, briefly, with a way back. The answer to "did that
 * work?" and the plan's undo-everywhere in one: three seconds, then gone.
 */
/** One next step a toast can offer beside its undo, with a key: Q, for a question. */
export type ToastAction = { label: string; key: string; run: () => void }
/** What a toast means, so its colour and mark say it too: done, only news, careful, or not done. */
export type ToastTone = 'success' | 'info' | 'warning' | 'error'
export const toast = (text: string, undo?: () => void, tone: ToastTone = 'success', action?: ToastAction): void => {
  beam(tone)
  window.dispatchEvent(new CustomEvent('vigil:toast', { detail: { text, undo, tone, action } }))
}

// What the editor says it did (a copy, from its own menus), said the app's way.
addEventListener('mindflow:said', (event) => {
  const { text, ok } = (event as CustomEvent<{ text: string; ok: boolean }>).detail
  chime(ok ? 'copy' : 'nope')
  toast(text, undefined, ok ? 'success' : 'error')
})

/** The toast up now goes: what it offered to take back was taken back another way. */
export const untoast = (): void => void window.dispatchEvent(new CustomEvent('vigil:untoast'))

/**
 * A real wait said in words: an orb chip where toasts come up, for as long as
 * the work takes. For work started from a menu, with no button to hold it.
 */
export async function waiting<T>(label: string, state: OrbState, work: Promise<T>): Promise<T> {
  window.dispatchEvent(new CustomEvent('vigil:wait', { detail: { label, state } }))
  try {
    return await work
  } finally {
    window.dispatchEvent(new CustomEvent('vigil:wait', { detail: null }))
  }
}

/** Give a nugget its question, so review can test it: asked in place. */
export const askQuestion = (id: string): Promise<void> =>
  ask('The question it answers, for review', 'e.g. What does MVCC stand for?').then((prompt) => {
    if (prompt) void vigil.saveItem(id, { prompt }).then(() => toast('Now tested: it will come up in review'))
  })

/**
 * Say why something was not done, with the "not allowed" sound: amber for a
 * request that cannot be done as asked, red only when something failed.
 */
export const refuse = (text: string, tone: ToastTone = 'warning'): void => {
  chime('nope')
  toast(text, undefined, tone)
}

/**
 * Why a save failed, in plain words, from the error the main process sent
 * back: the database's own wording means nothing to someone writing a note,
 * so the common ones say what to do instead.
 */
export const whyFailed = (error: unknown): string => {
  const raw = String((error as Error | undefined)?.message ?? error ?? '').replace(/^Error invoking remote method[^:]*:\s*(?:\w*Error:\s*)?/, '').split('\n')[0].trim()
  if (/full|SQLITE_FULL|ENOSPC/i.test(raw)) return 'your disk is full. Free up some space, then try again'
  if (/locked|busy/i.test(raw)) return 'your notes were busy for a moment. Try again'
  if (/readonly|read-only|EACCES|EPERM/i.test(raw)) return 'Vigil is not allowed to write to its folder. Check its permissions in Finder, then try again'
  return `${raw || 'something went wrong'}. Try again, and restart Vigil if it keeps happening`
}

export type BeamState = ToastTone | null
/**
 * The light along the window's top edge, the way Raycast's does it: a green
 * sweep when something worked, blue for news, amber for a careful-now, a red
 * flicker when it did not. Seen from the corner of the eye, without reading
 * a word. Only answers: a wait is the Orb's (see waiting), so the app has one
 * look for "on its way" rather than a light here and an orb there.
 */
export const beam = (state: BeamState): void => void window.dispatchEvent(new CustomEvent('vigil:beam', { detail: state }))
export function Beam(): React.JSX.Element | null {
  const [state, setState] = useState<{ tone: BeamState; key: number }>({ tone: null, key: 0 })
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onBeam = (event: Event): void => {
      clearTimeout(timer)
      const tone = (event as CustomEvent<BeamState>).detail
      setState({ tone, key: Date.now() })
      // An answer fades on its own.
      if (tone) timer = setTimeout(() => setState({ tone: null, key: Date.now() }), 1400)
    }
    window.addEventListener('vigil:beam', onBeam)
    return () => window.removeEventListener('vigil:beam', onBeam)
  }, [])
  if (!state.tone) return null
  return <div key={state.key} aria-hidden className={`mf-beam mf-beam-${state.tone}`} />
}

/**
 * A question that needs a line from you before something can go on, asked in
 * place: Enter answers, Escape lets it go. Resolves to the words, or null.
 */
export const ask = (question: string, placeholder = '', field?: 'attribution' | 'medium', initial = ''): Promise<string | null> =>
  new Promise((answer) => void window.dispatchEvent(new CustomEvent('vigil:ask', { detail: { question, placeholder, field, initial, answer } })))

/** The question's field when it is a name typed before: completes as you type, as Remembered does. */
function AskRemembered({ field, initial, placeholder, onDone }: { field: 'attribution' | 'medium'; initial: string; placeholder: string; onDone: (words: string | null) => void }): React.JSX.Element {
  const [words, setWords] = useState(initial)
  return (
    <Remembered field={field} value={words} onChange={setWords} placeholder={placeholder} autoFocus
      className="h-9 w-full rounded-md border px-3 text-body"
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') onDone(words)
        if (event.key === 'Escape') onDone(null)
      }} />
  )
}

function Asker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ question: string; placeholder: string; field?: 'attribution' | 'medium'; initial?: string; answer: (words: string | null) => void } | null>(null)
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
      setAsked((event as CustomEvent).detail)
    }
    window.addEventListener('vigil:ask', onAsk)
    return () => window.removeEventListener('vigil:ask', onAsk)
  }, [])
  if (!asked) return null
  const done = (words: string | null): void => {
    if (words?.trim()) chime('tap')
    asked.answer(words?.trim() || null)
    setAsked(null)
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={() => done(null)}>
      {/* A click on its padding keeps the focus in the box, so Escape still answers it. */}
      <div role="dialog" aria-modal="true" aria-label={asked.question} className="w-[min(32rem,90vw)] rounded-xl bg-popover p-4 shadow-(--mf-panel-shadow)"
        onMouseDown={(event) => {
          event.stopPropagation()
          if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
        }}>
        <p className="mb-2 text-sm">{asked.question}</p>
        {asked.field ? (
          // Who said it before, completing as you type: it gets quicker with use.
          <AskRemembered field={asked.field} initial={asked.initial ?? ''} placeholder={asked.placeholder} onDone={done} />
        ) : (
        <Input
          autoFocus
          // Again a beat later: a right-click menu hands the focus back to
          // its row as it closes, after autofocus has already run.
          ref={(input) => void (input && setTimeout(() => input.focus(), 30))}
          placeholder={asked.placeholder}
          // A guess (a name already in the words) is offered, never kept unasked.
          defaultValue={asked.initial}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') done(event.currentTarget.value)
            if (event.key === 'Escape') done(null)
          }}
        />
        )}
        <p className="mt-2 text-xs text-muted-foreground">Enter to keep · Escape to leave it</p>
      </div>
    </div>
  )
}

/** When anything was last typed into a field or the editor. */
let lastEdit = 0

// What a toast must never cover: an open dialog, sheet or menu, and the
// footer (and its Keys panel) of a view that fills the window, like Read through.
const PANELS = '[role="dialog"],[role="alertdialog"],[role="menu"],[data-slot="sheet-content"],[data-slot="popover-content"]'

/**
 * Where the toast goes, clear of open panels: its usual place at the bottom
 * when that is free, else just under them, else just above them, else at the top.
 * Checked while something is shown, so a panel opening under it moves it.
 */
function useClearSpot(on: boolean, lane: React.RefObject<HTMLDivElement | null>): React.CSSProperties | undefined {
  const [spot, setSpot] = useState<React.CSSProperties>()
  useEffect(() => {
    if (!on) return setSpot(undefined)
    const check = (): void => {
      const { innerWidth: width, innerHeight: height } = window
      const boxes: DOMRect[] = []
      for (const one of document.querySelectorAll<HTMLElement>(PANELS)) {
        const at = one.getBoundingClientRect()
        if (!at.width || !at.height) continue
        // Read through, Tidy and Decide are the page itself while they are up: only their footer and Keys count,
        // so a toast sits just above the keys, never over the header's words.
        if (one.getAttribute('aria-label') === 'Reading' || one.hasAttribute('data-pass')) {
          for (const part of one.querySelectorAll<HTMLElement>('footer, [aria-label="Keys"]')) boxes.push(part.getBoundingClientRect())
        } else boxes.push(at)
      }
      // The toast's lane: the middle of the window, as wide as a toast gets.
      const strip = lane.current?.getBoundingClientRect()
      const middle = strip ? (strip.left + strip.right) / 2 : width / 2
      const half = Math.min(576, (strip?.width ?? width) - 32) / 2
      const hit = boxes.filter((at) => at.height && at.right > middle - half && at.left < middle + half)
      // Its usual height off the bottom, as the window sets it (the box lifts it over its own footer).
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
      const given = lane.current ? getComputedStyle(lane.current).getPropertyValue('--toast-bottom').trim() : ''
      const usual = given ? parseFloat(given) * (given.endsWith('rem') ? rem : 1) : rem * 1.25
      const tall = 48
      const free = (bottom: number): boolean => hit.every((at) => height - bottom < at.top - 4 || height - bottom - tall > at.bottom + 4)
      const below = hit.length ? height - Math.max(...hit.map((at) => at.bottom)) : height
      const above = hit.length ? Math.min(...hit.map((at) => at.top)) : 0
      const next: React.CSSProperties | undefined = free(usual) ? undefined
        : below >= tall + 16 ? { bottom: Math.min(usual, below - tall - 8) }
        : above >= tall + 16 ? { bottom: height - above + 8 }
        : { top: 12, bottom: 'auto' }
      setSpot((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next))
    }
    check()
    const timer = setInterval(check, 150)
    return () => clearInterval(timer)
  }, [on])
  return spot
}

export function Toaster(): React.JSX.Element | null {
  const [shown, setShown] = useState<{ text: string; undo?: () => void; tone?: ToastTone; action?: ToastAction; key: number } | null>(null)
  const [wait, setWait] = useState<{ label: string; state: OrbState } | null>(null)
  useEffect(() => {
    const onWait = (event: Event): void => setWait((event as CustomEvent).detail)
    window.addEventListener('vigil:wait', onWait)
    return () => window.removeEventListener('vigil:wait', onWait)
  }, [])
  // The stickies tidied down the right of the screen (⌃⌥⌘T, ⌘K, the menu bar, a
  // sticky's right click), said in the one window main picks, with the way back.
  useEffect(() => window.api.onStickiesTidied((count) => {
    chime('gather')
    toast(count === 1 ? 'Sticky tidied' : `${count} stickies tidied`, undefined, 'success', { label: 'Put them back', key: 'B', run: () => (chime('back'), window.api.untidyStickies()) })
  }), [])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onToast = (event: Event): void => {
      clearTimeout(timer)
      const detail = (event as CustomEvent).detail
      setShown({ ...detail, key: Date.now() })
      // Longer when it can be taken back, so the undo is there to reach.
      // A problem stays as long, so what to do about it can be read.
      timer = setTimeout(() => setShown(null), detail.undo || detail.action || detail.tone === 'error' || detail.tone === 'warning' ? 6000 : 3200)
    }
    // A save that failed on the way to the database says so, rather than the
    // success toast just never coming.
    const onFail = (event: PromiseRejectionEvent): void => {
      const message = String(event.reason?.message ?? event.reason ?? '')
      if (message.includes('Error invoking remote method')) refuse(`Not saved: ${whyFailed(event.reason)}.`, 'error')
    }
    const onGone = (): void => (clearTimeout(timer), setShown(null))
    window.addEventListener('vigil:toast', onToast)
    window.addEventListener('vigil:untoast', onGone)
    window.addEventListener('unhandledrejection', onFail)
    return () => {
      window.removeEventListener('vigil:untoast', onGone)
      window.removeEventListener('vigil:toast', onToast)
      window.removeEventListener('unhandledrejection', onFail)
    }
  }, [])
  // ⌘Z takes back what the toast offers, outside a field or the editor, which
  // keep their own undo.
  useEffect(() => {
    if (!shown?.undo && !shown?.action) return
    const onKey = (event: KeyboardEvent): void => {
      // The toast's next step on its own key, while it is up and you are not writing.
      if (shown.action && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === shown.action.key.toLowerCase() && !typing()) {
        event.preventDefault()
        setShown(null)
        return shown.action.run()
      }
      // Reading full screen counts as a list, not as typing, unless writing in it.
      const reading = !!document.activeElement?.closest?.('[aria-label="Reading"]') && !document.activeElement?.closest?.('[contenteditable="true"]')
      if (!shown.undo || !event.metaKey || event.key !== 'z' || event.shiftKey || (typing() && !reading)) return
      event.preventDefault()
      chime('undo')
      shown.undo?.()
      setShown(null)
    }
    // Writing, ⌘Z is the toast's when nothing was typed since it came up: the
    // note has nothing newer of its own to take back. Heard first, before the
    // editor spends the key on an older edit.
    const onWritingUndo = (event: KeyboardEvent): void => {
      if (!shown.undo || !event.metaKey || event.key !== 'z' || event.shiftKey || event.altKey) return
      if (focus() === null || lastEdit > shown.key) return
      event.preventDefault()
      event.stopPropagation()
      chime('undo')
      shown.undo()
      setShown(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onWritingUndo, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onWritingUndo, true)
    }
  }, [shown])
  // When anything was last typed, so ⌘Z knows whose undo it is. Any key in a
  // field counts, not only ones that change it: guessing "edited" when it was
  // not only leaves ⌘Z with the note, which is the safe way to be wrong.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (['Meta', 'Shift', 'Alt', 'Control'].includes(event.key) || (event.metaKey && event.key.toLowerCase() === 'z')) return
      if (focus() !== null) lastEdit = Date.now()
    }
    const onEdit = (): void => void (lastEdit = Date.now())
    window.addEventListener('keydown', onKey, true)
    for (const kind of ['input', 'paste', 'drop']) window.addEventListener(kind, onEdit, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      for (const kind of ['input', 'paste', 'drop']) window.removeEventListener(kind, onEdit, true)
    }
  }, [])
  const lane = useRef<HTMLDivElement>(null)
  const spot = useClearSpot(!!shown || !!wait, lane)
  // Asker always in the same place, so a toast coming or going never
  // remounts it and loses a question being answered.
  return (
    <>
    <Asker />
    <KindAsker />
    <QuestionAsker />
    <BookAsker />
    <GoalAsker />
    <Beam />
    {wait && !shown && <div style={spot} className="pointer-events-none fixed right-[var(--toast-right,0px)] bottom-[var(--toast-bottom,1.25rem)] left-[var(--toast-left,0px)] z-[60] flex justify-center">
      <Orb state={wait.state} label={wait.label} className="bg-popover shadow-(--mf-panel-shadow) animate-in fade-in-0 slide-in-from-bottom-2 duration-200" />
    <MilestoneAsker />
    </div>}
    {/* Centred along the bottom, where the eye drops after acting. It
        leaves the way it came, and a new one takes its place at once. */}
    <div ref={lane} style={spot} className="pointer-events-none fixed right-[var(--toast-right,0px)] bottom-[var(--toast-bottom,1.25rem)] left-[var(--toast-left,0px)] z-[60] flex justify-center">
    <AnimatePresence mode="popLayout" initial={false}>
    {shown && <motion.div
      key={shown.key}
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, transform: 'translateY(8px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      exit={{ opacity: 0, transform: 'translateY(8px)', transition: { duration: 0.15 } }}
      // An edge and a mark, with the buttons' corners: it has to be seen
      // from the corner of the eye, on any theme.
      className="pointer-events-auto mx-4 flex max-w-[min(36rem,calc(100%-2rem))] min-w-0 items-center gap-2 rounded-md border border-border bg-popover py-1.5 pr-3.5 pl-2.5 text-sm font-medium shadow-(--mf-panel-shadow)"
    >
      {/* The mark says what kind of news it is: a tick only for something done. It
          moves once as it lands; an error's cross keeps still. */}
      {shown.tone === 'error'
        ? <CircleX className="size-4 shrink-0 text-[var(--tt-color-text-red)]" />
        : shown.tone === 'warning'
          ? <AliveIcon play icon={TriangleAlertIcon} size={16} className="text-[var(--tt-color-text-orange)]" />
          : shown.tone === 'info'
            ? <AliveIcon play icon={InfoCircleIcon} size={16} className="text-[var(--tt-color-text-blue)]" />
            : <AliveIcon play icon={CheckedIcon} size={16} className="text-[var(--tt-color-text-green)]" />}
      {/* With a button beside it, one line: a long quoted title ends in an ellipsis rather than pushing Undo onto two lines. */}
      <span className={`min-w-0 ${shown.undo || shown.action ? 'truncate' : 'text-pretty wrap-break-word'}`} title={shown.undo || shown.action ? shown.text : undefined}>{shown.text}</span>
      {shown.action && (
        <button
          type="button"
          className="shrink-0 font-medium whitespace-nowrap text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
          onClick={() => {
            setShown(null)
            shown.action?.run()
          }}
        >
          {shown.action.label} <kbd className="ml-0.5 font-sans text-key opacity-70">{shown.action.key}</kbd>
        </button>
      )}
      {shown.undo && (
        <button
          type="button"
          className="shrink-0 font-medium whitespace-nowrap text-[var(--tt-brand-color-400)] hover:underline"
          onClick={() => {
            chime('undo')
            shown.undo?.()
            setShown(null)
          }}
        >
          Undo <kbd className="ml-0.5 font-sans text-key opacity-70">⌘Z</kbd>
        </button>
      )}
    </motion.div>}
    </AnimatePresence>
    </div>
    </>
  )
}

/**
 * A scrolling area that eases, as Lenis does it: the wheel and trackpad move
 * toward where you sent them over a few frames instead of in fixed jumps. The
 * editor scrolls itself and is left alone; this is the lists and pages.
 */
export function SmoothScroll({ children, wide = false }: { children: ReactNode; wide?: boolean }): React.JSX.Element {
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  useSmooth(box)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={setBox} className="min-h-0 flex-1 overflow-y-auto">
        <div className={wide ? undefined : 'page-column'}>{children}</div>
      </div>
      <BackToTop target={box} />
    </div>
  )
}

/** The same easing on any scrolling box, whose first child is what scrolls. */
export function useSmooth(box: HTMLElement | null): void {
  useEffect(() => {
    const wrapper = box
    if (!wrapper || document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ wrapper, content: wrapper.firstElementChild as HTMLElement, lerp: 0.14, smoothWheel: true })
    // Anything that moves this box itself goes through Lenis, or the two fight.
    smooth.set(wrapper, lenis)
    // Ticks only while a glide is under way. The box and the glow keep running
    // while hidden (they never throttle), so a loop that never stops would
    // spend every frame of the day on a window nobody can see.
    let frame = 0
    let idle = 0
    const loop = (time: number): void => {
      lenis.raf(time)
      idle = lenis.isScrolling ? 0 : idle + 1
      frame = idle > 2 ? 0 : requestAnimationFrame(loop)
    }
    const wake = (): void => {
      idle = 0
      if (!frame) frame = requestAnimationFrame(loop)
    }
    const off = lenis.on('virtual-scroll', wake)
    const scrollTo = lenis.scrollTo.bind(lenis)
    lenis.scrollTo = (...args) => {
      scrollTo(...args)
      wake()
    }
    return () => {
      off()
      cancelAnimationFrame(frame)
      smooth.delete(wrapper)
      lenis.destroy()
    }
  }, [box])
}
const smooth = new WeakMap<HTMLElement, Lenis>()

/**
 * Back to the top, once you are far enough down for it to be a trip: a small
 * button that rises in at the bottom right of the scrolling area it watches,
 * and glides you back. Gone again at the top.
 */
export function BackToTop({ target }: { target: HTMLElement | null }): React.JSX.Element {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const box = target
    setShown(false)
    if (!box) return
    const check = (): void => setShown(box.scrollTop > box.clientHeight * 1.5)
    box.addEventListener('scroll', check, { passive: true })
    return () => box.removeEventListener('scroll', check)
  }, [target])
  return (
    // Bottom right, in a strip of its own, so the spring can own the button's transform.
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-end pr-5">
    <AnimatePresence>
      {shown && (
        <motion.button
          type="button"
          aria-label="Back to top"
        
          // It shows mid-scroll, so the whole transform is animated, off the
          // main thread; it grows from its own corner, and goes quicker than it came.
          initial={{ opacity: 0, transform: shift('translateY(8px) scale(0.95)') }}
          animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
          exit={{ opacity: 0, transform: shift('translateY(8px) scale(0.95)'), transition: { duration: 0.14, ease: EASE } }}
          transition={{ duration: 0.22, ease: EASE }}
          style={{ transformOrigin: 'bottom right' }}
          onClick={() => {
            // From far down, jump most of the way and glide the last stretch:
            // a glide over a few hundred rows is a wait, not a motion.
            if (!target) return
            const lenis = smooth.get(target)
            if (target.scrollTop > target.clientHeight * 2) {
              if (lenis) lenis.scrollTo(target.clientHeight, { immediate: true })
              else target.scrollTop = target.clientHeight
            }
            if (lenis) lenis.scrollTo(0, { duration: 0.6 })
            else target.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          // Dressed like the app's other floating controls: the popover surface, a
          // hairline edge, the shared panel shadow, the text size of every control.
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border bg-popover py-1 pr-3 pl-2.5 text-control text-muted-foreground shadow-(--mf-panel-shadow) transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowUp className="size-3.5" /> Top
        </motion.button>
      )}
    </AnimatePresence>
    </div>
  )
}

/** What you have typed before in a field, most used first, for its autocomplete. */
export function Remembered({ field, value, onChange, placeholder, className: given = 'field-sizing-content min-w-16 max-w-48 px-1.5 py-0.5', complete = true, onKeyDown, onBlur, onPaste, ...rest }: {
  field: 'attribution' | 'medium'
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
  /** Off, nothing is offered from the names used before: the welcome's lesson keeps your history out of it. */
  complete?: boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>): React.JSX.Element {
  // The names you have used before, most used first: the rest of the nearest
  // one is written in faint after what you typed, and Tab or → takes it. A
  // name that is one you know but for its capitals or a slip of a key ("Pink
  // floyd", "Pnik Floyd") becomes that one as you leave the field.
  const values = useLive(() => vigil.values(field), [] as string[])
  const typed = complete ? value.trim().toLowerCase() : ''
  const match = typed ? values.find((one) => one.toLowerCase().startsWith(typed) && one.length > typed.length) : undefined
  const ahead = match ? match.slice(value.length) : ''
  // A who with a name wears that person's face at its start: a click on it
  // adds a picture, as does a picture pasted in, or a right click.
  const person = field === 'attribution' ? value.trim() : ''
  const className = person ? cn(given, 'pl-6') : given
  const known = (): string | undefined => {
    if (!typed) return undefined
    const same = values.find((one) => one.toLowerCase() === typed)
    if (same) return same
    return typed.length >= 4 ? values.find((one) => near(one.toLowerCase(), typed)) : undefined
  }
  const chip = (
    <span className={cn('relative inline-grid [&>*]:col-start-1 [&>*]:row-start-1', /\bw-full\b/.test(className) && 'w-full')}>
      <input
        {...rest}
        onPaste={(event) => {
          const picture = person ? [...event.clipboardData.files].find((file) => file.type.startsWith('image/')) : undefined
          if (!picture) return onPaste?.(event)
          event.preventDefault()
          void setAvatar(person, picture).then((done) => done && toast(`A picture for ${person}`))
        }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          const end = event.currentTarget.selectionStart === value.length
          if (ahead && end && (event.key === 'Tab' || event.key === 'ArrowRight')) {
            event.preventDefault()
            chime('tap')
            onChange(match!)
            return
          }
          onKeyDown?.(event)
        }}
        onBlur={(event) => {
          const fixed = known()
          if (fixed && fixed !== value.trim()) onChange(fixed)
          onBlur?.(event)
        }}
        placeholder={placeholder}
        className={cn('rounded-md bg-transparent text-muted-foreground outline-none placeholder:text-foreground/70/60 hover:bg-accent/50 focus:bg-accent/50 focus:text-foreground', className, ahead && 'min-w-0')}
      />
      {/* The rest of the name, faint, after the typed part: it sits under the
          input's own text and gives the field its width. */}
      {ahead && (
        // Only the field's spacing and type: its border and fill drawn again
        // read as a second field on top of the first.
        <span aria-hidden className={cn('pointer-events-none overflow-hidden whitespace-pre', className.split(/\s+/).filter((one) => /^(p[xylrtb]?-|text-(xs|sm|meta|control|body|base|lg)$|font-|leading-|tracking-)/.test(one)).join(' '), /\bborder\b/.test(className) && 'border border-transparent')}>
          <span className="invisible">{value}</span><span className="text-muted-foreground/45">{ahead}</span>
        </span>
      )}
      {person && (
        <Tip label="Add a picture… or paste one in">
          <button type="button" data-who-avatar tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => void pickAvatar(person).then((done) => done && toast(`A picture for ${person}`))}
            className="z-10 ml-1 cursor-pointer self-center justify-self-start rounded-full transition-transform hover:scale-110">
            <Avatar name={person} size={16} />
          </button>
        </Tip>
      )}
    </span>
  )
  return field === 'attribution' ? <PersonMenu name={person}>{chip}</PersonMenu> : chip
}


/**
 * Who said it, asked in place: one key from a rot card or a search result
 * opens it, Enter keeps it, Escape leaves it as it was.
 */
export function AskWho({ id, initial = '', onDone }: { id: string; initial?: string; onDone: (who?: string) => void }): React.JSX.Element {
  // Starts from the name it has, so a fix is an edit rather than a retype.
  const [who, setWho] = useState(initial)
  return (
    <Remembered
      autoFocus
      field="attribution"
      value={who}
      onChange={setWho}
      placeholder="Who said it?  ↵"
      className="w-full px-1.5 py-0.5 text-control"
      onBlur={() => onDone()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') onDone()
        if (event.key !== 'Enter') return
        event.preventDefault()
        // Emptied and Enter clears it: a wrong name can be taken off.
        void vigil.setCapture(id, 'attribution', who.trim() || null).then(() => toast(who.trim() ? `Said by ${who.trim()}` : 'Who said it: cleared'))
        onDone(who.trim())
      }}
    />
  )
}

/**
 * A label on hover, shadcn's tooltip rather than the system's: says what a
 * button does, and its key if it has one.
 */
export function Tip({ label: given, offset, children }: { label: ReactNode; /** Space between the tip and its control, for a control that grows on hover. */ offset?: number; children: React.ReactElement<{ 'aria-label'?: string; children?: ReactNode }> }): React.JSX.Element {
  // Its keys as you press them now, if you changed them in Settings.
  useKeyChanges()
  const label = typeof given === 'string' ? withKeys(given) : given
  if (!label) return children
  // A plain-text tip names an icon-only button, so it can be read out, not
  // only hovered. A button with words of its own keeps them as its name.
  const worded = Children.toArray(children.props.children).some((child) => typeof child === 'string' || typeof child === 'number')
  const named = typeof label === 'string' && !worded && !children.props['aria-label'] ? cloneElement(children, { 'aria-label': label }) : children
  return <Tipped label={label} offset={offset}>{named}</Tipped>
}

/**
 * A tip never repeats what the control already shows: worded the same as its
 * visible words it stays shut, and "Settings  ⌘," over a row that says
 * Settings shows only ⌘,. Checked on opening, so a row that is an icon at one
 * width and words at another gets its tip only when it needs one.
 */
function Tipped({ label, offset, children }: { label: ReactNode; offset?: number; children: React.ReactElement }): React.JSX.Element {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  // Kept as it closes, so the tip fades out with its words still in it.
  const [shown, setShown] = useState<ReactNode>(label)
  const onOpenChange = (next: boolean): void => {
    if (!next || typeof label !== 'string') return (setShown(next ? label : shown), setOpen(next))
    const seen = (trigger.current?.innerText ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    const said = label.toLowerCase()
    if (seen && said === seen) return setOpen(false)
    // Two spaces part a name from its keys, so what is left after them is only keys.
    setShown(seen && said.startsWith(`${seen}  `) ? label.slice(seen.length).trim() : label)
    setOpen(true)
  }
  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild ref={trigger}>{children}</TooltipTrigger>
      <TooltipContent sideOffset={offset}>{shown}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Focus: everything but the thing you are on goes, until ⇧⌘F again. Each
 * window keeps its own; the parts that go are marked data-chrome.
 */
export function useFocusMode(name: string): boolean {
  const [on, setOn] = useStoredFlag(`focus:${name}`)
  const now = useRef(on)
  now.current = on
  useEffect(() => void (document.documentElement.dataset.focus = on ? 'on' : 'off'), [on])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.shiftKey || event.code !== 'KeyF') return
      event.preventDefault()
      // Heard as a switch, the way safe mode is.
      chime(now.current ? 'off' : 'on')
      setOn(!now.current)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  return on
}

/** The way out of focus, small, in a corner. */
export function FocusNote(): React.JSX.Element {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-30 hidden rounded-full bg-popover px-3 py-1 font-sans text-xs text-muted-foreground shadow [[data-focus=on]_&]:block">
      Focus · ⇧⌘F to come back
    </div>
  )
}

/**
 * A long list that draws only the rows in view, with TanStack Virtual. It
 * scrolls with whatever box holds it, from where it sits in that box, so it can
 * sit under cards or headings; the keyboard's row is scrolled to even before it
 * is drawn, so gg and G land.
 */
export function VirtualList<T>({ items, keyOf, cursor, estimate = 48, className = '', children }: {
  items: T[]
  keyOf: (item: T) => string
  /** The row the keyboard is on, scrolled into view when it moves. */
  cursor?: number
  estimate?: number
  className?: string
  children: (item: T, index: number) => ReactNode
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const [margin, setMargin] = useState(0)
  useLayoutEffect(() => {
    let parent = box.current?.parentElement ?? null
    while (parent && !/auto|scroll/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement
    setScroller(parent)
  }, [])
  useLayoutEffect(() => {
    if (!box.current || !scroller) return
    const at = Math.round(box.current.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop)
    if (at !== margin) setMargin(at)
  })
  const rows = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller,
    estimateSize: () => estimate,
    overscan: 10,
    scrollMargin: margin,
    getItemKey: (index) => keyOf(items[index])
  })
  useEffect(() => {
    if (cursor !== undefined && cursor >= 0 && cursor < items.length) rows.scrollToIndex(cursor)
  }, [cursor]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={box} className={`relative ${className}`} style={{ height: rows.getTotalSize() }}>
      {rows.getVirtualItems().map(({ index, key, start }) => (
        // A sliver of room under each row, so two lit rows (the open one and the
        // cursor) never touch. Padding, not margin: the measure counts padding.
        <div key={key} data-index={index} ref={rows.measureElement} className="absolute top-0 left-0 w-full pb-0.5" style={{ transform: `translateY(${start - margin}px)` }}>
          {children(items[index], index)}
        </div>
      ))}
    </div>
  )
}

/** Sounds on or off in one click, from the top of either window. */
export function SoundToggle({ className = '' }: { className?: string }): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Awaited<ReturnType<typeof vigil.settings>> | null)
  if (!settings) return null
  const on = settings.sounds
  return (
    <Tip label={on ? 'Sounds on: click for quiet' : 'Sounds off: click to hear them'}>
      <button
        type="button"
        // Never where the focus lands: opening the window is for typing.
        tabIndex={-1}
        aria-label={on ? 'Turn sounds off' : 'Turn sounds on'}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={() => {
          // Set first, so the sound of turning it on is heard.
          soundOn(!on)
          chime(!on ? 'on' : 'off')
          void vigil.setSettings({ sounds: !on })
        }}
        className={className}
      >
        <AliveIcon icon={on ? Volume2Icon : VolumeXIcon} size={16} />
      </button>
    </Tip>
  )
}

/**
 * Text that rolls into place when it changes, slot-text's way: a count that
 * goes up rolls up, one that goes down rolls down, and only the digits that
 * moved turn over. Still when motion is off, so it is plain text then.
 */
export function Rolling({ text, className = '', by = 'character' }: { text: string | number; className?: string; by?: 'character' | 'word' }): React.JSX.Element {
  const last = useRef(text)
  const up = typeof text === 'number' && typeof last.current === 'number' ? text >= last.current : true
  useEffect(() => void (last.current = text), [text])
  // A number arriving with its page is not a change you saw: in its first
  // second it simply takes its value (lib/motion.ts, rule 3).
  const [born] = useState(() => performance.now())
  const still = document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches || performance.now() - born < 1000
  return (
    <SlotText
      text={typeof text === 'number' ? num(text) : text}
      className={className}
      // On the app's own curve with only a trace of overshoot: the library's
      // springy default read as bouncy beside everything else, which settles.
      options={{ direction: up ? 'up' : 'down', rollBy: by, duration: still ? 0 : 260, stagger: still ? 0 : by === 'word' ? 22 : 35, exitOffset: still ? 0 : 40, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', bounce: 0.2 }}
    />
  )
}

/**
 * ⇧⌘R: read through the list on screen, one note at a time. One handler for
 * every list that offers it; `read` is called only when it has rows.
 */
export function useReadKey(read: () => void, rows: number, enabled = true): void {
  const latest = useRef(read)
  latest.current = read
  const here = useHere()
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.shiftKey || event.key.toLowerCase() !== 'r' || !rows || !here()) return
      event.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [rows, enabled])
}

/**
 * The open note's first line once it has scrolled out of sight, for the main
 * window's top bar to show faintly: the box keeps its own.
 */
let topTitle: string | null = null
const topTitleListeners = new Set<(title: string | null) => void>()
export function showTopTitle(title: string | null): void {
  topTitle = title
  for (const listen of topTitleListeners) listen(title)
}
export function useTopTitle(): string | null {
  const [title, setTitle] = useState(topTitle)
  useEffect(() => {
    topTitleListeners.add(setTitle)
    return () => void topTitleListeners.delete(setTitle)
  }, [])
  return title
}

/**
 * Things that belong together, in one rounded island under an optional
 * heading, rows divided by hairlines: the macOS settings look, used for
 * every grouped panel so they all read the same.
 */
export function Island({ title, actions, children, className, compact }: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /**
   * For a narrow column beside an open note: tighter spacing, a smaller
   * heading, each child a square row (fields lose their own box), and the
   * island gone while nothing in it is shown.
   */
  compact?: boolean
}): React.JSX.Element {
  return (
    <section className={cn(compact ? 'mt-3 first:mt-0 has-[>div:last-child:empty]:hidden' : 'mt-6 first:mt-0', className)}>
      {(title || actions) && (
        <div className={cn('flex items-center gap-2 px-1', compact ? 'mb-1' : 'mb-2')}>
          {title && <h2 className={cn('font-semibold text-foreground', compact ? 'text-meta' : 'text-body')}>{title}</h2>}
          {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
        </div>
      )}
      <div className={cn('mf-island divide-y divide-border/60 overflow-hidden border bg-accent/25', compact
        ? 'rounded-lg [&>*]:rounded-none [&>button]:w-full [&>textarea]:border-0 [&>textarea]:bg-transparent [&>textarea]:shadow-none [&>textarea]:focus-visible:ring-0 [&>input]:border-0 [&>input]:bg-transparent [&>input]:shadow-none [&>input]:focus-visible:ring-0'
        : 'rounded-xl')}>{children}</div>
    </section>
  )
}

/** One row of an island: a label on the left, its value or control on the right. */
export function IslandRow({ label, note, children, className }: { label?: ReactNode; note?: ReactNode; children?: ReactNode; className?: string }): React.JSX.Element {
  return (
    <div className={cn('flex items-center justify-between gap-4 px-4 py-2.5', className)}>
      {(label || note) && (
        <div className="min-w-0">
          {label && <div className="text-body text-foreground">{label}</div>}
          {note && <p className="mt-0.5 text-meta leading-relaxed text-muted-foreground">{note}</p>}
        </div>
      )}
      {children !== undefined && <div className="flex min-w-0 shrink-0 items-center gap-2 text-control">{children}</div>}
    </div>
  )
}
