import { Children, cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { layerOpen } from '@/lib/menu-keys'
import { tagHue } from '@/extensions/tokens'
import { createPortal, flushSync } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SlotText } from 'slot-text/react'
import { Check, ChevronRight, CircleX, type LucideIcon } from 'lucide-react'
import { AliveIcon } from '@/components/ui/alive-icon'
import { AnimatePresence, motion } from 'motion/react'
import { byKeys, EASE, glideWay, hush, shift, speak, speakAfter, spring as springs, still, useFirstVisit } from '@/lib/motion'
import { detent, slotTicker } from '@/lib/proximity'
import { Arrow } from './marks'
import Lenis from 'lenis'
import { useLive, haligtree } from '@/lib/haligtree'
import { useReadsIn, useSeen } from '@/lib/reads-in'
import { chime, quietFor, soundOn } from '@/lib/sound'
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
import { VaultPicker } from './vault-picker'
import { ImportFolders } from './import-folders'
import { GoalAsker } from './goals-view'
import { MilestoneAsker } from './milestones'
import { RestoreAsker } from './restore-ask'
import { HashField, INPUT_FRAME, asTag, isTag } from './hash-field'
import { brief, num } from '../../../../main/dates'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { OrbState } from 'thinking-orbs'
import { Orb } from './orb'
import { SaveTroubleLine } from './save-trouble'
import { ImportDoneCard, ImportProgress } from './import-done'
import { chooseBackupFolder } from '@/lib/backups'
import { useSaveTrouble } from '@/lib/save-trouble'
import { Beam, beam, startWorking } from './beam'
import type { AnimatedIconHandle, AnimatedIconProps } from '@/components/ui/types'
import Volume2Icon from '@/components/ui/volume-2-icon'
import VolumeXIcon from '@/components/ui/volume-x-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import InfoCircleIcon from '@/components/ui/info-circle-icon'
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon'
import { GHOST } from './ghost'
import { Avatar, PersonMenu } from './avatar'
import { pasteAvatar, pickAvatar, setAvatar } from '@/lib/people'
import { near } from '../../../../main/near'
import { canSplit, openAside, useHere, usePane } from '@/lib/split'
import { quoted } from '../../../../main/clip'
import { ArrowDown, ArrowUp } from '@/components/ui/icons'
import { APP_NAME } from '../../../../main/name'

/** How long after an Undo's sound the undone thing stays quiet as it puts itself back: one action, one sound. */
const UNDO_HUSH = 900

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
function FitActions({ children, room }: { children: ReactNode; /** What sets the line's width (the list narrowed beside a note): measured again, at once, when it changes. */ room?: unknown }): React.JSX.Element {
  const line = useRef<HTMLDivElement>(null)
  // The width they took the last time they were all on the line.
  const need = useRef(0)
  const [folded, setFolded] = useState(false)
  const [open, setOpen] = useState(false)
  // Not measured while the page it is on waits unseen for its reads: a list
  // held back beside a note would lay out the whole window in the note's
  // first frame. Measured in the frame it goes on show, before it is painted.
  const seen = useSeen()
  // Measured when the line or what is on it changes size, never on every
  // draw: each measure in the middle of a draw lays out the whole window.
  useLayoutEffect(() => {
    const box = line.current
    if (!box || !seen) return
    const fit = (): void => {
      if (!folded) {
        need.current = box.scrollWidth
        if (box.scrollWidth > box.clientWidth + 1) setFolded(true)
      } else if (box.clientWidth >= need.current) setFolded(false)
    }
    // Once now, and again as sizes change, each time before the frame is painted: measured a frame
    // later, a narrow line drew every button and then folded them into "More".
    fit()
    const watch = new ResizeObserver(() => flushSync(fit))
    watch.observe(box)
    if (box.firstElementChild) watch.observe(box.firstElementChild)
    return () => watch.disconnect()
  }, [folded, room, seen])
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
export function Page({ title, lead, count, unit = ['item', 'items'], actions, children, aside = false, wide = false, fit = false, beside, waiting = false, apart = false }: {
  title: ReactNode
  /**
   * A list beside the note it was opened onto: it comes in whole on its own,
   * in its own place, and never keeps the note waiting (lib/reads-in.tsx).
   */
  apart?: boolean
  /**
   * A read the page is drawn from has not answered yet: the page waits whole,
   * its line and its body, so nothing on it (the count, a box, a sorted list)
   * comes a beat after the rest. Never longer than its slowest read. A part
   * on it with reads of its own says so with `useReading`.
   */
  waiting?: boolean
  /** On the left of the line, before the count: what the page is showing, like a week's dates. */
  lead?: ReactNode
  /** Drawn over the scrolling body, given it: the page's contents. */
  beside?: (box: HTMLDivElement | null) => ReactNode
  /** The body is exactly the window's height: a page of boxes or columns that each scroll inside themselves (the week, the Matrix), so the page itself never does. 'columns': only once there is room for two columns; narrower, the boxes stack and the page scrolls. */
  fit?: boolean | 'columns'
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
  // Drawn once, when its reads and those of every part on it are in (lib/reads-in.tsx).
  const { provide, style } = useReadsIn(waiting, apart)
  return provide(
    <section data-chrome={aside || undefined} data-apart={apart ? 'list' : undefined} className={cn('relative flex min-w-0 flex-1 flex-col', aside && 'hidden flex-none @[56rem]/page:flex')}
      style={{ ...(aside ? { width: listWidth, maxWidth: '60%' } : {}), ...style }}>
      {aside && grip}
      {/* The window's toolbar already names the section, so this line only
          carries what it shows (lead), the count and the actions, and goes when it has none. */}
      {(count !== undefined || actions || lead) && (
        <header data-chrome={aside || undefined} className={`${wide ? '' : 'page-column '}flex h-10 shrink-0 items-center gap-2 border-b px-5 text-muted-foreground`}>
          {typeof title === 'string' && title.startsWith('#') ? <span className="font-medium text-foreground">{title}</span> : null}
          {lead}
          {/* What is picked is what the buttons act on: said plainly, never in grey. */}
          {count ? <span className={cn('whitespace-nowrap tabular-nums', unit[1] === 'selected' && 'font-medium text-foreground')}><Rolling text={count} /> {count === 1 ? unit[0] : unit[1]}</span> : null}
          {/* The count is on the same line: measured again the moment it comes or changes, not a frame later by the observer. */}
          <FitActions room={`${aside ? listWidth : 'page'} ${count ?? ''} ${count === 1 ? unit[0] : unit[1]}`}>{actions}</FitActions>
        </header>
      )}
      <SmoothScroll wide={wide} fit={fit} beside={beside}>{children}</SmoothScroll>
    </section>
  ) as React.JSX.Element
}

/**
 * A sentence that tells you something, typed out a word at a time as it
 * arrives, a beat after the page paints so the motion is seen rather than
 * lost in the opening frame, so the app reads as if it is talking to you rather than showing a
 * label (textmotion.dev's word reveal). Typed again when the words change.
 * Plain text when Motion is off.
 */
export function Typed({ text, className, step = 40, delay: asked = 700, story = false, within }: { text: string; className?: string; step?: number; delay?: number; story?: boolean; /** Every word under way by this many ms: a line that has to be read at once (a page's hint). */ within?: number }): React.JSX.Element {
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
  // Squeezed to fit, the same rhythm faster: the last word starts by `within`.
  const last = starts.at(-1) ?? 0
  if (within !== undefined && last > within) {
    for (let i = 0; i < starts.length; i += 1) starts[i] = Math.round((starts[i] * within) / last)
    at = within
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
  // Once for each set of words: React's development checks stop and start
  // every effect, and asked twice the line would queue behind itself and its
  // words would start late twice over.
  const queued = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (story || !speaks || queued.current === text) return
    queued.current = text
    const wait = speakAfter(id, long) ?? 0
    if (wait) line.current?.querySelectorAll<HTMLElement>('.mf-typed').forEach((one) => void (one.style.animationDelay = `${parseFloat(one.style.animationDelay) + wait}ms`))
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps
  // Its turn given up a moment after it goes, not at once: the same checks
  // stop this effect while the line is still on screen and start it again.
  const going = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    clearTimeout(going.current)
    return () => void (going.current = setTimeout(() => hush(id)))
  }, [id])
  return (
    <span key={text} ref={line} data-line={id} className={className} role="note" aria-label={text}>
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

/**
 * What an empty page shows over its line: a commonplace book, shut, in the
 * accent's colour, with its ribbon hanging out. Pointed at, the cover swings
 * open on blank pages; on the first visit this session it does so once by
 * itself, a beat after the page paints. Done (a round, a day, the Inbox), a
 * few pages turn over, the cover shuts on them and a tick sits on it. Drawn at
 * 56 and scaled, so the narrow panel's 44 is the same drawing. Reached by a
 * key, it does not open by itself; with Motion off it stays still.
 */
export function Book({ size, seed, done = false, className = 'mb-3' }: { size: number; seed: string; done?: boolean; className?: string }): React.JSX.Element {
  const calm = useState(() => still())[0]
  const first = useFirstVisit(`empty:${seed}`)
  const [peek, setPeek] = useState(false)
  useEffect(() => {
    if (done || calm || !first || byKeys()) return
    const open = setTimeout(() => setPeek(true), 450)
    const shut = setTimeout(() => setPeek(false), 1600)
    return () => (clearTimeout(open), clearTimeout(shut))
  }, [done, calm, first])
  const cover = 'color-mix(in oklab, var(--primary) 82%, var(--background))'
  const spine = 'color-mix(in oklab, var(--primary) 58%, var(--background))'
  const paper = 'oklch(0.97 0.008 80)'
  // The app's slow spring, for a whole thing turning (lib/motion.ts).
  const spring = springs.slow
  // Done: the cover starts open and the pages turn, then it shuts.
  const flipping = done && !calm
  const page = 'absolute top-[8px] left-[12px] h-[40px] w-[37px] rounded-r-[3px]'
  const lines = (
    <>
      <div className="mx-[6px] mt-[8px] h-[2px] w-1/2 rounded-full bg-black/12" />
      <div className="mx-[6px] mt-[4px] h-[2px] w-2/3 rounded-full bg-black/10" />
      <div className="mx-[6px] mt-[4px] h-[2px] w-2/5 rounded-full bg-black/10" />
    </>
  )
  return (
    <motion.div aria-hidden className={cn('shrink-0', className)} style={{ width: size, height: size }} initial={false}
      animate={peek ? 'open' : 'shut'} whileHover={calm || done ? undefined : 'open'}>
      <div className="relative size-14 origin-top-left" style={{ scale: String(size / 56), perspective: 180 }}>
        {/* The page block, its edges showing at the foot and the open side. */}
        <div className={`${page} shadow-[0_1px_2px_rgb(0_0_0/0.2)]`} style={{ background: paper }}>
          {lines}
          <div className="absolute inset-y-[3px] right-[1px] w-[2px] border-r border-black/10" />
        </div>
        {/* Pages turning over, done. */}
        {flipping && [0, 1, 2].map((at) => (
          <motion.div key={at} className={page} style={{ background: paper, originX: 0, transformStyle: 'preserve-3d' }}
            initial={{ rotateY: 0 }} animate={{ rotateY: -172, opacity: [1, 1, 0] }}
            transition={{ duration: 0.42, ease: EASE, delay: 0.12 + at * 0.13 }}>
            {lines}
          </motion.div>
        ))}
        {/* The ribbon, hanging from the foot near the spine. */}
        <div className="absolute top-[44px] left-[30px] h-[9px] w-[4px] rounded-b-[1px]" style={{ background: 'var(--tt-color-text-red)', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%)' }} />
        {/* The cover, hinged at the spine. */}
        <motion.div className="absolute top-[6px] left-[10px] h-[44px] w-[37px] rounded-r-[4px] rounded-l-[2px] shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_2px_4px_rgb(0_0_0/0.18)]"
          style={{ background: cover, originX: 0 }}
          variants={{ shut: { rotateY: 0 }, open: { rotateY: -62 } }}
          initial={flipping ? { rotateY: -70 } : false} animate={flipping ? { rotateY: 0 } : undefined}
          transition={flipping ? { ...spring, delay: 0.6 } : spring}>
          {/* A label on the front, as a notebook has. */}
          <div className="absolute top-[11px] left-[9px] h-[9px] w-[20px] rounded-[2px] bg-white/25" />
        </motion.div>
        <div className="absolute top-[6px] left-[8px] h-[44px] w-[4px] rounded-l-[2px]" style={{ background: spine }} />
        {/* Done: a tick on the cover once it is shut. */}
        {done && (
          <motion.div className="absolute right-[2px] bottom-[2px] flex size-[20px] items-center justify-center rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.25)]"
            style={{ background: 'var(--tt-color-text-green)' }}
            initial={calm ? false : { transform: shift('scale(0.92)'), opacity: 0 }} animate={{ transform: 'scale(1)', opacity: 1 }} transition={{ ...spring, delay: calm ? 0 : 0.95 }}>
            <Check className="size-[13px] text-background" strokeWidth={3} />
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

/**
 * What an empty view is for, and the one thing that fills it. A commonplace
 * book with nothing written in it yet, in place of a grey icon: an empty view is the first
 * thing a new feature shows you, and it should not read as an error.
 */
export function Empty({ shaped = false, title, children, action, compact = false }: {
  /** Done, not empty: the book's pages turn, it shuts, and a tick sits on it. */
  shaped?: boolean
  title: ReactNode
  children: ReactNode
  action?: ReactNode
  /** Sized for the prompt's narrow panel: less height above, a smaller shape. */
  compact?: boolean
}): React.JSX.Element {
  return (
    <div data-empty className={`flex max-w-sm flex-col items-start gap-3 ${compact ? 'px-2 py-10' : 'px-5 py-[16vh]'}`}>
      <Book size={compact ? 44 : 56} seed={typeof title === 'string' ? title : 'empty'} done={shaped} />
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
  const aside = <aside data-chrome className={cn('flex w-full shrink-0 flex-col gap-px overflow-y-auto border-t p-3 pt-4 text-control text-muted-foreground @[40rem]/page:w-64 @[40rem]/page:border-t-0 @[40rem]/page:border-l', fold && 'mf-details', className)}>{children}</aside>
  return fold ? <FoldIslands.Provider value>{aside}</FoldIslands.Provider> : aside
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
export function Stepper({ at, total, onStep, turns = false }: { at: number; total: number; onStep: (to: number) => void; /** What it steps to turns a page as it opens: that is the step's one sound. */ turns?: boolean }): React.JSX.Element | null {
  const latest = useRef({ at, total, onStep, turns })
  latest.current = { at, total, onStep, turns }
  // Split, only the pane in front steps.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // ⇧↑ and ⇧↓ are the list's, picking a run.
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || typing() || event.defaultPrevented || !here()) return
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const { at, total, onStep, turns } = latest.current
      const to = at + (event.key === 'ArrowDown' ? 1 : -1)
      if (to < 0 || to >= total) return
      event.preventDefault()
      event.stopPropagation()
      if (!turns) chime('tap')
      onStep(to)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  if (at < 0 || total < 2) return null
  const go = (by: 1 | -1): void => {
    if (!turns) chime('tap')
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

export function Prop({ icon: Icon, alive, children, onClick, active, tint, secret, tip }: {
  icon?: LucideIcon
  /** What it does, when its short name leaves it unsaid. */
  tip?: string
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
  const prop = (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      // Named by its own words, so its tip reads as what it does and never takes the name's place.
      aria-label={tip && typeof children === 'string' ? children : undefined}
      data-private={secret ? '' : undefined}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${onClick ? 'hover:bg-accent hover:text-foreground' : ''} ${active ? 'text-foreground' : ''}`}
    >
      {alive
        ? <AliveIcon icon={alive} size={16} style={tint ? { color: `var(--tt-color-text-${tint})` } : undefined} />
        : Icon && <Icon className="size-4 shrink-0" style={tint ? { color: `var(--tt-color-text-${tint})` } : undefined} />}
      {/* A long name takes a second line rather than being cut in the narrow details column. */}
      <span className={`min-w-0 line-clamp-2 [overflow-wrap:anywhere] ${secret ? 'private-text' : ''}`}>{children}</span>
    </Tag>
  )
  return tip ? <Tip label={tip} side="left">{prop}</Tip> : prop
}

/** Tags as Todoist draws them: a small tag glyph and the word, in a quiet colour. */
// A thought can carry six routes back to it: a row shows the first few and
// counts the rest, "+3", named in full on hover.
// The title always wins the room: the tags take at most two fifths of the
// row, a long tag ends in "…", and only a cut one names itself in full on hover.
/** A tag's page: in the front pane, or beside it with ⌥ held (as every row opens to the side). */
export const openTag = (tag: string, aside = false): void => {
  chime('open')
  if (aside && canSplit()) openAside('tag', tag)
  else window.api.openInHome('tag', tag)
}

export function Tags({ tags, max = 3, alone = false, go = true }: { tags: string[]; max?: number; /** On a line of its own (a card's meta row), not beside a title: it may take the whole line. */ alone?: boolean; /** Each word opens its tag's page; off inside a sheet or search, where leaving would lose the place. */ go?: boolean }): React.JSX.Element | null {
  const colors = useTagColors()
  const box = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState<string[]>([])
  // As narrow as it may get: whole when short, about four letters of a long one.
  const [least, setLeast] = useState(0)
  const shown = tags.slice(0, max)
  const key = shown.join(' ')
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = (): void => {
      const now = [...el.querySelectorAll<HTMLElement>('[data-tag]')].filter((one) => one.scrollWidth > one.clientWidth + 1).map((one) => one.dataset.tag!)
      setCut((was) => (was.join(' ') === now.join(' ') ? was : now))
      const parts = [...el.children] as HTMLElement[]
      const natural = parts.reduce((sum, one) => sum + one.scrollWidth, 0) + 8 * Math.max(0, parts.length - 1)
      setLeast(Math.min(natural, 64))
    }
    // Measured by the observer, which reports once as soon as the row is laid
    // out: measured here, every row with tags laid out the page as it was drawn.
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [key])
  if (!tags.length) return null
  const rest = tags.slice(max)
  return (
    // It gives way far faster than the title beside it, so the title keeps the room.
    <span ref={box} data-tags style={{ minWidth: (!alone && least) || undefined }} className={`flex min-w-0 ${alone ? 'max-w-full' : 'max-w-[40%]'} shrink-[20] items-center gap-2 overflow-hidden text-xs`}>
      {shown.map((tag) => {
        const color = { color: `var(--tt-color-text-${tagHue(tag, colors[tag])})` }
        if (!go) {
          const word = <span key={tag} data-tag={tag} className="min-w-0 max-w-[10rem] shrink truncate" style={color}>#{tag}</span>
          return cut.includes(tag) ? <Tip key={tag} label={<>#{tag}</>}>{word}</Tip> : word
        }
        // A tag looks like a link, so it is one: its page, never the row it sits in,
        // and never the start of a drag.
        const hold = (event: React.SyntheticEvent): void => event.stopPropagation()
        return (
          <Tip key={tag} label={canSplit() ? `Open #${tag}; ⌥-click to open it to the side` : `Open #${tag} in ${APP_NAME}`}>
            <span role="button" tabIndex={0} data-tag={tag} data-tag-go
              onPointerDown={hold} onMouseDown={hold}
              onClick={(event) => (event.stopPropagation(), event.preventDefault(), openTag(tag, event.altKey))}
              onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.stopPropagation(); event.preventDefault(); openTag(tag) }}
              className="-my-1 min-w-0 max-w-[10rem] shrink cursor-pointer truncate rounded px-0.5 py-1 transition-colors duration-80 hover:bg-accent/70 focus-visible:bg-accent/70 focus-visible:outline-none" style={color}>#{tag}</span>
          </Tip>
        )
      })}
      {rest.length > 0 && (
        <Tip label={rest.map((tag) => `#${tag}`).join('  ')}>
          <span className="shrink-0 rounded-full bg-accent px-1.5 tabular-nums text-muted-foreground">+{brief(rest.length)}</span>
        </Tip>
      )}
    </span>
  )
}

/** Each tag's chosen colour, read once and again whenever anything changes. */
function useTagColors(): Record<string, string> {
  const meta = useLive(haligtree.tagMeta, [] as { tag: string; color: string | null }[])
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
export const typing = (): boolean => focus() !== null || !!document.querySelector(HELD) || (!!document.activeElement?.closest('[data-beside]') && !chord)
/**
 * Something over the page that keeps its keys. A panel beside the list
 * (data-beside: a task opened from the week) is not: with it open, the page
 * keeps its keys, and with the keys in the panel a plain key stays there
 * (T, the arrows) while ⌘ or ⌃ with one (⌘Z, ⌘A), and ⌫, still reach the list.
 */
export const HELD = '[role="dialog"]:not([data-beside])'
/** Whether the key being pressed now is held with ⌘ or ⌃ (or is ⌫, which a panel has nothing to take), heard before anything else hears it. */
let chord = false
addEventListener('keydown', (event) => void (chord = event.metaKey || event.ctrlKey || event.key === 'Backspace' || event.key === 'Delete'), true)

/** Pin or unpin, and say so when the three places are full. */
export const pin = (table: 'captures' | 'nuggets', id: string, on: boolean): void =>
  void haligtree.pin(table, id, on).then(() => {
    chime(on ? 'pin' : 'unpin')
    // Unpinned by a slip: back in its place at the top with one Undo.
    if (!on) quietly(() => void haligtree.pin(table, id, true))
  })

/**
 * How a list brings a row into view, as Finder and Mail do: left still when it
 * shows already, nudged to the edge when it is the next one past it (a step
 * with ↓), and centred when it was far off (opened from a link, ⌘K, Back).
 * `top` and `bottom` are where the row is, `view` the box that scrolls.
 */
export function rowPlace(top: number, bottom: number, view: { top: number; bottom: number }): 'still' | 'edge' | 'centre' {
  if (top >= view.top && bottom <= view.bottom) return 'still'
  const near = (bottom - top) * 2.5
  return bottom > view.top - near && top < view.bottom + near ? 'edge' : 'centre'
}

/** A row drawn on the page, brought into view by the rule above. */
export function showRow(row: Element | null | undefined): void {
  if (!row) return
  let box = row.parentElement
  while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  if (!box) return
  const at = row.getBoundingClientRect()
  const place = rowPlace(at.top, at.bottom, box.getBoundingClientRect())
  if (place !== 'still') (row.scrollIntoView({ block: place === 'edge' ? 'nearest' : 'center' }), rowShown())
}

/** Said when a list scrolls itself to its open row: Back's putting the page where it was lets go then (panes.tsx), so the row stays in sight. */
const rowShown = (): void => void window.dispatchEvent(new Event('haligtree:row-shown'))

/**
 * Moving through a list the way the editor moves through a document: j and k,
 * or the arrows; gg and G for the ends; Enter to open. Escape only lets go of
 * something passing, like the words in a search (onEscape): it never goes
 * back, which is ⌘['s job. Inside
 * a text box only Ctrl-J and Ctrl-K move, so typing a j is still a j, and in
 * the editor none of it: the editor has its own vim. The same
 * keys in every list in the app, which is the whole point of having one hook.
 */
export function useListKeys(count: number, { onOpen, onEscape, enabled = true, opened = -1, onExtend }: {
  onOpen?: (index: number) => void
  /** ⇧↑ or ⇧↓: the cursor moved from one row to the next, for picking a run (lib/pick-range.ts). */
  onExtend?: (from: number, to: number) => void
  onEscape?: () => void
  enabled?: boolean
  /**
   * Where the note open beside the list sits in it, or -1. The cursor follows
   * it however it was opened (a click, ↓ over the note, a tag page's link), so
   * ⌫, ↵ and the row menu's other keys act on the one you see open.
   */
  opened?: number
}): [number, (index: number) => void] {
  // -1 until a key is pressed: the ring belongs to the keyboard, so a list you
  // only ever click never shows one.
  const [at, setAt] = useState(-1)
  const last = useRef('')
  const latest = useRef({ count, onOpen, onEscape, onExtend, at })
  latest.current = { count, onOpen, onEscape, onExtend, at }
  useEffect(() => setAt((index) => Math.min(index, Math.max(0, count - 1))), [count])
  useEffect(() => void (opened >= 0 && setAt(opened)), [opened])
  // Split, each pane's list has its own cursor, and only the front one's moves.
  const pane = usePane()
  const here = useHere()
  // The row the cursor is on stays in view. Rows mark themselves with
  // data-cursor, since a ref on an animated row is only read once.
  useEffect(() => {
    if (at >= 0) showRow(document.querySelector(pane ? `[data-pane="${pane}"] [data-cursor]` : '[data-cursor]'))
  }, [at]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      const { count, onOpen, onEscape, onExtend, at } = latest.current
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
      const by = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
      if (by && event.shiftKey && !chord && !inBox && onExtend && count) {
        const to = at < 0 ? 0 : Math.max(0, Math.min(count - 1, at + by))
        move(to)
        return onExtend(at < 0 ? to : at, to)
      }
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
        !layerOpen('.tiptap-find-bar:not([inert])')
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

/** One next step a toast can offer beside its undo, with a key: Q, for a question. */
export type ToastAction = { label: string; key: string; run: () => void }
/** What a toast means, so its colour and mark say it too: done, only news, careful, or not done. */
export type ToastTone = 'success' | 'info' | 'warning' | 'error'
/**
 * Say what an action did, briefly, with a way back. The answer to "did that
 * work?" and the plan's undo-everywhere in one: three seconds, then gone.
 */
export const toast = (text: string, undo?: () => void, tone: ToastTone = 'success', action?: ToastAction): void => {
  beam(tone)
  window.dispatchEvent(new CustomEvent('haligtree:toast', { detail: { text, undo, tone, action } }))
}

/**
 * A change you can already see (a row moved, a tick, a panel shown): no toast
 * to read, but ⌘Z still takes it back for a little while, as a toast's Undo would.
 */
export const quietly = (undo?: () => void): void => {
  if (undo) window.dispatchEvent(new CustomEvent('haligtree:undoable', { detail: { undo } }))
}

// What the editor says it did (a copy, from its own menus), said the app's way.
addEventListener('haligtree:said', (event) => {
  const { text, ok } = (event as CustomEvent<{ text: string; ok: boolean }>).detail
  chime(ok ? 'copy' : 'nope')
  toast(text, undefined, ok ? 'success' : 'error')
})

/** The toast up now goes: what it offered to take back was taken back another way. */
export const untoast = (): void => void window.dispatchEvent(new CustomEvent('haligtree:untoast'))

/**
 * A real wait said in words: an orb chip where toasts come up, for as long as
 * the work takes. For work started from a menu, with no button to hold it.
 */
export async function waiting<T>(label: string, state: OrbState, work: Promise<T>): Promise<T> {
  window.dispatchEvent(new CustomEvent('haligtree:wait', { detail: { label, state } }))
  // The beam turns with it: the window's edge says so as well as the chip.
  const end = startWorking()
  try {
    return await work
  } finally {
    end()
    window.dispatchEvent(new CustomEvent('haligtree:wait', { detail: null }))
  }
}

/** Give a nugget its question, so review can test it: asked in place. */
export const askQuestion = (id: string): Promise<void> =>
  ask('The question it answers, for review', 'A question this answers').then((prompt) => {
    if (prompt) void haligtree.saveItem(id, { prompt }).then(() => toast('Now tested: it will come up in review'))
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
  if (/readonly|read-only|EACCES|EPERM/i.test(raw)) return `${APP_NAME} is not allowed to write to its folder. Check its permissions in Finder, then try again`
  return `${raw || 'something went wrong'}. Try again, and restart ${APP_NAME} if it keeps happening`
}

/**
 * A question that needs a line from you before something can go on, asked in
 * place: Enter answers, Escape lets it go. Resolves to the words, or null.
 */
export const ask = (question: string, placeholder = '', field?: 'attribution' | 'medium' | 'tag', initial = ''): Promise<string | null> =>
  new Promise((answer) => void window.dispatchEvent(new CustomEvent('haligtree:ask', { detail: { question, placeholder, field, initial, answer } })))

/** The question's field when it is a tag: "#" drawn before the caret, and what is typed read as a tag (hash-field.tsx). */
function AskTag({ initial, placeholder, onDone }: { initial: string; placeholder: string; onDone: (words: string | null) => void }): React.JSX.Element {
  const [tag, setTag] = useState(() => asTag(initial))
  return (
    <HashField ref={(input) => void (input && setTimeout(() => input.focus(), 30))} autoFocus value={tag} onChange={setTag} placeholder={placeholder} aria-label="Tag"
      className={`${INPUT_FRAME} h-7 w-full`}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          const kept = tag.replace(/-+$/, '')
          if (kept && !isTag(kept)) return void chime('nope')
          onDone(kept)
        }
        if (event.key === 'Escape') onDone(null)
      }} />
  )
}

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
  const [asked, setAsked] = useState<{ question: string; placeholder: string; field?: 'attribution' | 'medium' | 'tag'; initial?: string; answer: (words: string | null) => void } | null>(null)
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
      setAsked((event as CustomEvent).detail)
    }
    window.addEventListener('haligtree:ask', onAsk)
    return () => window.removeEventListener('haligtree:ask', onAsk)
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
        {asked.field === 'tag' ? (
          // A tag: the "#" drawn in the field, fixed, so it is never a question whether to type it.
          <AskTag initial={asked.initial ?? ''} placeholder={asked.placeholder} onDone={done} />
        ) : asked.field ? (
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
// footer (and its Keys panel) of a view that fills the window, like Read through,
// and the composer pinned under a page, where you are typing.
const PANELS = '[role="dialog"],[role="alertdialog"],[role="menu"],[data-slot="sheet-content"],[data-slot="popover-content"],[data-composer]'

/**
 * Where the toast goes, clear of open panels: its usual place at the bottom
 * when that is free, else just under them, else just above them, else at the top.
 * Checked while something is shown, so a panel opening under it moves it.
 */
/** The toast stepping aside for a celebration: a glide on a transform, not a jump. */
const STEP_ASIDE = 'transform 220ms var(--mf-ease)'

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
      const clear: React.CSSProperties | undefined = free(usual) ? undefined
        : below >= tall + 16 ? { bottom: Math.min(usual, below - tall - 8) }
        : above >= tall + 16 ? { bottom: height - above + 8 }
        : { top: 12, bottom: 'auto' }
      // A celebration showing where the toast would land: the toast steps aside,
      // centred in the room left of the card, or, with too little room there
      // (the box's card is centred), sits just above it. Never over it.
      const party = [...document.querySelectorAll<HTMLElement>('[data-celebration] > *')].map((one) => one.getBoundingClientRect()).filter((at) => at.width && at.height)
      const low = clear?.top === undefined ? height - (typeof clear?.bottom === 'number' ? clear.bottom : usual) : 12 + tall
      // Against the lane where it would be, not where it has stepped to, so it does not swing back and forth.
      const left = strip?.left ?? 0
      const right = width - (parseFloat(lane.current ? getComputedStyle(lane.current).getPropertyValue('--toast-right') : '') || 0)
      const reach = Math.min(576, right - left - 32) / 2
      const meets = party.filter((at) => at.top < low && at.bottom > low - tall && at.right > (left + right) / 2 - reach && at.left < (left + right) / 2 + reach)
      const next: React.CSSProperties | undefined = !meets.length ? clear
        // Moved from where it would be by a transform: the lane's right edge in to the card
        // (its centred toast goes half as far), or the toast lifted to just above the card.
        : Math.min(...meets.map((at) => at.left)) - left >= 360 ? { ...clear, transform: `translateX(${(Math.min(...meets.map((at) => at.left)) - 12 - right) / 2}px)`, transition: STEP_ASIDE }
        : { ...clear, transform: `translateY(${Math.min(...meets.map((at) => at.top)) - 8 - low}px)`, transition: STEP_ASIDE }
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
  const shownNow = useRef(shown)
  shownNow.current = shown
  const [wait, setWait] = useState<{ label: string; state: OrbState } | null>(null)
  useEffect(() => {
    const onWait = (event: Event): void => setWait((event as CustomEvent).detail)
    window.addEventListener('haligtree:wait', onWait)
    return () => window.removeEventListener('haligtree:wait', onWait)
  }, [])
  // The stickies tidied down the right of the screen (⌃⌥⌘T, ⌘K, the menu bar, a
  // sticky's right click), said in the one window main picks, with the way back.
  useEffect(() => window.api.onStickiesTidied((count) => {
    chime('gather')
    toast(count === 1 ? 'Sticky tidied to the right of your screen' : `${num(count)} stickies tidied down the right of your screen`, undefined, 'success', { label: 'Put them back', key: 'B', run: () => (chime('back'), window.api.untidyStickies()) })
  }), [])
  // A sticky taken down from its own X or ⌘W, said in the window in sight, with the way back.
  useEffect(() => window.api.onStickyTaken((title) => {
    toast(title ? `${quoted(title, 40)} taken off the desktop` : 'Taken off the desktop', undefined, 'success', { label: 'Put it back', key: 'B', run: () => (chime('stick'), window.api.putStickyBack()) })
  }), [])
  // Back from a restore: which copy this is now, said once (main/index.ts, tellRestored).
  useEffect(() => {
    const onRestored = (event: Event): void => {
      chime('rewind')
      toast(`Restored from ${(event as CustomEvent<string>).detail}. What you had just before is kept with the backups, so this can be undone the same way`, undefined, 'success')
    }
    window.addEventListener('haligtree:restored', onRestored)
    return () => window.removeEventListener('haligtree:restored', onRestored)
  }, [])
  // The first launch after the rename: the notes were copied in from the old folder, kept as it was (main/old-data.ts).
  useEffect(() => {
    const onMoved = (event: Event): void => {
      chime('settled')
      toast(`Your notes from Vigil are here. The old copy is kept in ${(event as CustomEvent<string>).detail} as a backup`, undefined, 'success', { label: 'Show the old copy', key: 'S', run: () => void window.api.showOldCopy() })
    }
    window.addEventListener('haligtree:moved-in', onMoved)
    return () => window.removeEventListener('haligtree:moved-in', onMoved)
  }, [])
  // The daily backup, failed twice in a row (main says why), or working again.
  useEffect(() => window.api.onBackupTrouble?.((reason) => {
    window.dispatchEvent(new CustomEvent('haligtree:backups'))
    if (!reason) return (chime('settled'), toast('Backups are running again'))
    chime('nope')
    toast(`Backups have stopped: ${reason}.`, undefined, 'error', { label: 'Choose another folder', key: 'C', run: () => void chooseBackupFolder() })
  }), [])
  // The toast's clock: it stops while the pointer rests on the toast or the
  // window is away (another app, hidden), and starts again with the time it
  // had left, so the Undo is still there when the hand or the eye comes back.
  const clock = useRef<{ timer?: ReturnType<typeof setTimeout>; left: number; since: number; held: Set<string> }>({ left: 0, since: 0, held: new Set() })
  const hold = useCallback((why: string): void => {
    const at = clock.current
    if (at.held.has(why)) return
    at.held.add(why)
    if (at.timer === undefined) return
    clearTimeout(at.timer)
    at.timer = undefined
    at.left = Math.max(0, at.left - (Date.now() - at.since))
  }, [])
  const release = useCallback((why: string): void => {
    const at = clock.current
    if (!at.held.delete(why) || at.held.size || at.timer !== undefined || !at.left) return
    at.left = Math.max(1500, at.left)
    at.since = Date.now()
    at.timer = setTimeout(() => (at.timer = undefined, at.left = 0, setShown(null)), at.left)
  }, [])
  useEffect(() => {
    const blur = (): void => hold('blur')
    const focus = (): void => release('blur')
    const seen = (): void => (document.hidden ? hold('hidden') : release('hidden'))
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', seen)
    return () => {
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', seen)
    }
  }, [hold, release])
  useEffect(() => {
    const at = clock.current
    const stop = (): void => { clearTimeout(at.timer); at.timer = undefined; at.left = 0 }
    const onToast = (event: Event): void => {
      const detail = (event as CustomEvent).detail
      // Quick capture put away (or on its way out): news of what it did is not
      // left waiting for the next time it opens. Its Undo is still held for ⌘Z.
      if (document.documentElement.hasAttribute('data-box-away') && detail.tone !== 'error' && detail.tone !== 'warning') {
        if (detail.undo) quietly(detail.undo)
        return
      }
      stop()
      // A notice with nothing to take back, over one that had an Undo: that Undo stays ⌘Z's.
      const before = shownNow.current
      if (before?.undo && !detail.undo) quietly(before.undo)
      setShown({ ...detail, key: Date.now() })
      // Longer when it can be taken back, so the undo is there to reach.
      // A problem stays as long, so what to do about it can be read.
      at.left = detail.undo || detail.action || detail.tone === 'error' || detail.tone === 'warning' ? 6000 : 3200
      at.since = Date.now()
      // A new toast is not under the pointer yet, whatever the old one was.
      at.held.delete('pointer')
      if (document.hidden) at.held.add('hidden')
      if (!at.held.size) at.timer = setTimeout(() => (at.timer = undefined, at.left = 0, setShown(null)), at.left)
    }
    // A save that failed on the way to the database says so, rather than the
    // success toast just never coming.
    const onFail = (event: PromiseRejectionEvent): void => {
      const message = String(event.reason?.message ?? event.reason ?? '')
      if (message.includes('Error invoking remote method')) refuse(`Not saved: ${whyFailed(event.reason)}.`, 'error')
    }
    const onGone = (): void => (stop(), setShown(null))
    window.addEventListener('haligtree:toast', onToast)
    window.addEventListener('haligtree:untoast', onGone)
    window.addEventListener('unhandledrejection', onFail)
    return () => {
      stop()
      window.removeEventListener('haligtree:untoast', onGone)
      window.removeEventListener('haligtree:toast', onToast)
      window.removeEventListener('unhandledrejection', onFail)
    }
  }, [])
  // A change made without a toast (quietly): its undo held out of sight, for ⌘Z.
  const [held, setHeld] = useState<{ undo: () => void; key: number } | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onHeld = (event: Event): void => {
      clearTimeout(timer)
      setHeld({ undo: (event as CustomEvent<{ undo: () => void }>).detail.undo, key: Date.now() })
      timer = setTimeout(() => setHeld(null), 10000)
    }
    window.addEventListener('haligtree:undoable', onHeld)
    return () => (clearTimeout(timer), window.removeEventListener('haligtree:undoable', onHeld))
  }, [])
  // ⌘Z takes back what the toast offers (or the newer quiet change), outside a
  // field or the editor, which keep their own undo.
  useEffect(() => {
    // Whichever came last is what ⌘Z takes back.
    const back = held && (!shown?.undo || held.key > shown.key) ? held : shown?.undo ? { undo: shown.undo, key: shown.key } : null
    if (!back && !shown?.action) return
    const undo = (): void => {
      if (!back) return
      chime('undo')
      quietFor(UNDO_HUSH)
      back.undo()
      if (back === held) setHeld(null)
      else setShown(null)
    }
    const onKey = (event: KeyboardEvent): void => {
      // The toast's next step on its own key, while it is up and you are not writing.
      if (shown?.action && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === shown.action.key.toLowerCase() && !typing()) {
        event.preventDefault()
        setShown(null)
        return shown.action.run()
      }
      // Reading full screen counts as a list, not as typing, unless writing in it.
      const reading = !!document.activeElement?.closest?.('[aria-label="Reading"]') && !document.activeElement?.closest?.('[contenteditable="true"]')
      if (!back || !event.metaKey || event.key !== 'z' || event.shiftKey || (typing() && !reading)) return
      event.preventDefault()
      undo()
    }
    // Writing, ⌘Z is the toast's when nothing was typed since it came up: the
    // note has nothing newer of its own to take back. Heard first, before the
    // editor spends the key on an older edit.
    const onWritingUndo = (event: KeyboardEvent): void => {
      if (!back || !event.metaKey || event.key !== 'z' || event.shiftKey || event.altKey) return
      if (focus() === null || lastEdit > back.key) return
      event.preventDefault()
      event.stopPropagation()
      undo()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onWritingUndo, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onWritingUndo, true)
    }
  }, [shown, held])
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
  const trouble = useSaveTrouble()
  const spot = useClearSpot(!!shown || !!wait || !!trouble, lane)
  // Asker always in the same place, so a toast coming or going never
  // remounts it and loses a question being answered.
  return (
    <>
    <Asker />
    <KindAsker />
    <QuestionAsker />
    <BookAsker />
    <VaultPicker />
    <ImportFolders />
    <ImportDoneCard />
    <GoalAsker />
    <MilestoneAsker />
    <RestoreAsker />
    <Beam />
    {wait && !shown && <div style={spot} className="pointer-events-none fixed right-[var(--toast-right,0px)] bottom-[var(--toast-bottom,1.25rem)] left-[var(--toast-left,0px)] z-[60] flex justify-center">
      <Orb state={wait.state} label={wait.label} className="bg-popover shadow-(--mf-panel-shadow) animate-in fade-in-0 slide-in-from-bottom-2 duration-200" />
    </div>}
    {/* Centred along the bottom, where the eye drops after acting. It
        leaves the way it came, and a new one takes its place at once. */}
    <div ref={lane} style={spot} className="pointer-events-none fixed right-[var(--toast-right,0px)] bottom-[var(--toast-bottom,1.25rem)] left-[var(--toast-left,0px)] z-[60] flex flex-col items-center gap-2">
    {/* Words not saved yet: one line above the toasts, up until they are in. */}
    <SaveTroubleLine />
    <ImportProgress />
    <AnimatePresence mode="popLayout" initial={false}>
    {shown && <motion.div
      key={shown.key}
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, transform: shift('translateY(8px)') }}
      animate={{ opacity: 1, transform: shift('translateY(0px)') }}
      exit={{ opacity: 0, transform: shift('translateY(8px)'), transition: { duration: 0.15 } }}
      onPointerEnter={() => hold('pointer')}
      onPointerLeave={() => release('pointer')}
      // An edge and a mark, with the buttons' corners: it has to be seen
      // from the corner of the eye, on any theme.
      className="pointer-events-auto mx-4 flex max-w-[min(36rem,calc(100%-2rem))] min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-popover py-1.5 pr-3.5 pl-2.5 text-sm font-medium shadow-(--mf-panel-shadow)"
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
      {/* With a button beside it, the words keep room to be read: in a narrow place (the box's foot) the
          buttons go under them rather than squeezing them to a word a line, and a long one ends in an
          ellipsis on its third line, so what it says (where things went) is never cut to "Made ...". */}
      <span className={`${shown.text.length > 40 ? 'min-w-[min(13rem,100%)] flex-1' : 'min-w-0'} ${shown.undo || (shown.action && shown.tone !== 'error') ? 'line-clamp-3 text-pretty wrap-break-word' : 'text-pretty wrap-break-word'}`} title={shown.undo || shown.action ? shown.text : undefined}>{shown.text}</span>
      {shown.action && (
        <button
          type="button"
          className="group/act shrink-0 font-medium whitespace-nowrap text-foreground"
          onClick={() => {
            setShown(null)
            shown.action?.run()
          }}
        >
          {/* The words underlined, not the key beside them. */}
          <span className="underline decoration-muted-foreground/50 underline-offset-2 group-hover/act:decoration-foreground">{shown.action.label}</span> <kbd className="ml-0.5 font-sans text-key opacity-70">{shown.action.key}</kbd>
        </button>
      )}
      {shown.undo && (
        <button
          type="button"
          className="shrink-0 font-medium whitespace-nowrap text-[var(--tt-brand-color-400)] hover:underline"
          onClick={() => {
            chime('undo')
            quietFor(UNDO_HUSH)
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
export function SmoothScroll({ children, wide = false, fit = false, beside }: { children: ReactNode; wide?: boolean; fit?: boolean | 'columns'; /** Drawn over the box, not in it, given the box: a page's contents. */ beside?: (box: HTMLDivElement | null) => ReactNode }): React.JSX.Element {
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  useSmooth(box)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {beside?.(box)}
      <div ref={setBox} className="min-h-0 flex-1 overflow-y-auto">
        {/* Room under the last line for the floating "Top" button, so it never sits on the page's last words. */}
        <div className={cn(!wide && 'page-column', fit && 'flex flex-col', fit === 'columns' ? '@[34rem]/page:h-full' : fit ? 'h-full' : 'pb-16')}>{children}</div>
      </div>
      <BackToTop target={box} />
    </div>
  )
}

/**
 * Where the last thing a scrolling box shows really ends: down the child that
 * reaches lowest, until a line of words, a box that clips or scrolls itself,
 * or a list given its full height (a long list draws only the rows in view).
 * Padding and margins below it are air, not content.
 */
function contentEnd(box: HTMLElement): number {
  let el: Element = box
  for (let depth = 0; depth < 60; depth++) {
    if (el !== box) {
      const css = getComputedStyle(el)
      if (css.overflowY !== 'visible' || (el as HTMLElement).style?.height) break
      if ([...el.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim())) {
        return el.getBoundingClientRect().bottom - parseFloat(css.paddingBottom) - parseFloat(css.borderBottomWidth)
      }
    }
    let next: Element | null = null
    let lowest = -Infinity
    for (const child of el.children) {
      const rect = child.getBoundingClientRect()
      if (rect.height && rect.bottom > lowest) (lowest = rect.bottom, next = child)
    }
    if (!next) break
    el = next
  }
  return el.getBoundingClientRect().bottom
}

/**
 * A box scrolls only when what it shows does not fit: room left at its foot
 * (a page's bottom padding, an empty state's air) never makes it scroll, so
 * no scrollbar shows and no wheel moves a page that has nothing more to show.
 */
function useScrollOnlyWhenNeeded(box: HTMLElement | null): void {
  useEffect(() => {
    if (!box) return
    let frame = 0
    const check = (): void => {
      frame = 0
      const over = box.scrollHeight - box.clientHeight
      const fits = over > 1 && contentEnd(box) - (box.getBoundingClientRect().top + box.clientTop) + box.scrollTop <= box.clientHeight + 1
      if (fits === (box.style.overflowY === 'hidden')) return
      if (fits) {
        smooth.get(box)?.scrollTo(0, { immediate: true })
        box.scrollTop = 0
      }
      box.style.overflowY = fits ? 'hidden' : ''
    }
    const soon = (): void => void (frame ||= requestAnimationFrame(check))
    const watch = new ResizeObserver(soon)
    watch.observe(box)
    const content = box.firstElementChild
    if (content) watch.observe(content)
    if (content?.firstElementChild) watch.observe(content.firstElementChild)
    // A list that changes inside a box of fixed height (a panel filled to its foot) changes no size above it.
    const changes = new MutationObserver(soon)
    changes.observe(box, { childList: true, subtree: true })
    soon()
    return () => {
      cancelAnimationFrame(frame)
      watch.disconnect()
      changes.disconnect()
      box.style.overflowY = ''
    }
  }, [box])
}

/** The same easing on any scrolling box, whose first child is what scrolls. */
export function useSmooth(box: HTMLElement | null): void {
  useScrollOnlyWhenNeeded(box)
  useEffect(() => {
    const wrapper = box
    if (!wrapper || still()) return
    // A box inside the page that can still scroll the way the wheel goes (a
    // sample excerpt, a GIF grid, a list in a panel) takes the wheel itself;
    // the page only moves once that box is at its end.
    const lenis = new Lenis({ wrapper, content: wrapper.firstElementChild as HTMLElement, lerp: 0.14, smoothWheel: true, allowNestedScroll: true,
      // Nothing past the fold (useScrollOnlyWhenNeeded): the wheel leaves it be.
      virtualScroll: () => wrapper.style.overflowY !== 'hidden' })
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
 * Brings a scrolling box to `top`: a glide with Motion on (through the box's own
 * smooth scrolling, so the two never fight), there at once with it off.
 */
export function glideTo(box: HTMLElement, top: number): void {
  const lenis = smooth.get(box)
  // Motion can be turned off after the box was set up to glide.
  const calm = still()
  if (lenis) return lenis.scrollTo(top, calm ? { immediate: true } : { duration: 0.4 })
  box.scrollTo({ top, behavior: calm ? 'instant' : 'smooth' })
}

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
    // Read once a frame, at its start, with the box's height kept from its
    // resizes: read on every scroll event, in the middle of a long list
    // drawing its next rows, it made the page lay itself out again each time.
    let height = box.clientHeight
    let asked = 0
    const sized = new ResizeObserver(() => (height = box.clientHeight))
    sized.observe(box)
    const check = (): void => {
      if (asked) return
      asked = requestAnimationFrame(() => ((asked = 0), setShown(box.scrollTop > height * 1.5)))
    }
    box.addEventListener('scroll', check, { passive: true })
    return () => (box.removeEventListener('scroll', check), sized.disconnect(), cancelAnimationFrame(asked))
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
            // A glide, or there at once with Motion off or Reduce motion.
            glideTo(target, 0)
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
  const values = useLive(() => haligtree.values(field), [] as string[])
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
          // A pasted file that will not open: the clipboard's own picture instead.
          void setAvatar(person, picture).then((done) => done || pasteAvatar(person))
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
          <span className="invisible">{value}</span><span className="text-muted-foreground">{ahead}</span>
        </span>
      )}
      {person && (
        <Tip label="Add a picture… or paste one in">
          <button type="button" data-who-avatar tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => void pickAvatar(person)}
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
 * A quote is someone's words, so its who is never cleared by a slip: emptied,
 * the name goes back and a notice asks first, with "Clear it" (and Undo after).
 */
export const askClearWho = (name: string, clear: () => Promise<unknown>, putBack: () => void): void => {
  putBack()
  chime('nope')
  toast(`A quote keeps who said it. Clear “${name}” anyway?`, undefined, 'warning', {
    label: 'Clear it', key: 'C',
    run: () => void clear().then(() => (chime('off'), toast(`Cleared ${name}`, undefined, 'success')))
  })
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
        // Emptied and Enter clears it: a wrong name can be taken off, once asked.
        if (!who.trim() && initial.trim()) return void (askClearWho(initial.trim(), () => haligtree.setCapture(id, 'attribution', null), () => setWho(initial)), onDone(initial.trim()))
        void haligtree.setCapture(id, 'attribution', who.trim() || null)
        onDone(who.trim())
      }}
    />
  )
}

/**
 * A label on hover, shadcn's tooltip rather than the system's: says what a
 * button does, and its key if it has one.
 */
/**
 * Where the tips inside open, when a place says so: the session bubble under
 * the notch opens them below, and keeps them out of the notch's band at the
 * top of the screen (`clearTop`), where they could not be read.
 */
export const TipPlace = createContext<{ side?: 'top' | 'bottom'; clearTop?: number; /** Told as a tip opens and closes, for a window to make room for it. */ onShow?: (open: boolean) => void }>({})

export function Tip({ label: given, offset, side, children }: { label: ReactNode; /** Space between the tip and its control, for a control that grows on hover. */ offset?: number; /** Where it opens: above unless said; a menu line's opens to its right. */ side?: 'top' | 'right' | 'bottom' | 'left'; children: React.ReactElement<{ 'aria-label'?: string; children?: ReactNode }> }): React.JSX.Element {
  // Its keys as you press them now, if you changed them in Settings.
  useKeyChanges()
  const label = typeof given === 'string' ? withKeys(given) : given
  if (!label) return children
  // A plain-text tip names an icon-only button, so it can be read out, not
  // only hovered. A button with words of its own keeps them as its name.
  const worded = Children.toArray(children.props.children).some((child) => typeof child === 'string' || typeof child === 'number')
  // A plain span or div so named is a mark (a repeat sign, a colour bar):
  // read out as a picture with that name, since a name on a bare span is skipped.
  const wordsIn = (node: ReactNode): boolean => Children.toArray(node).some((one) => typeof one === 'string' || typeof one === 'number' || (isValidElement<{ children?: ReactNode }>(one) && typeof one.type === 'string' && wordsIn(one.props.children)))
  const mark = (children.type === 'span' || children.type === 'div') && !(children.props as { role?: string }).role && !wordsIn(children.props.children)
  const named = typeof label === 'string' && !worded && !children.props['aria-label'] ? cloneElement(children, { 'aria-label': label, ...(mark ? { role: 'img' } : {}) } as object) : children
  return <Tipped label={label} offset={offset} side={side}>{named}</Tipped>
}

/**
 * A tip never repeats what the control already shows: worded the same as its
 * visible words it stays shut, and "Settings  ⌘," over a row that says
 * Settings shows only ⌘,. Checked on opening, so a row that is an icon at one
 * width and words at another gets its tip only when it needs one.
 */
function Tipped({ label, offset, side, children }: { label: ReactNode; offset?: number; side?: 'top' | 'right' | 'bottom' | 'left'; children: React.ReactElement }): React.JSX.Element {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const place = useContext(TipPlace)
  // Kept as it closes, so the tip fades out with its words still in it.
  const [shown, setShown] = useState<ReactNode>(label)
  const onOpenChange = (next: boolean): void => {
    place.onShow?.(next)
    if (!next || typeof label !== 'string') return (setShown(next ? label : shown), setOpen(next))
    const seen = (trigger.current?.innerText ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    const said = label.toLowerCase()
    // Words already on show need no tip, unless they are cut off: then the tip gives them whole.
    const cut = (el: Element | null): boolean => !!el && [el, ...el.querySelectorAll('*')].some((one) => one.scrollWidth > one.clientWidth + 1 || one.scrollHeight > one.clientHeight + 2)
    if (seen && said === seen && !cut(trigger.current)) return (place.onShow?.(false), setOpen(false))
    // Two spaces part a name from its keys, so what is left after them is only keys.
    setShown(seen && said.startsWith(`${seen}  `) ? label.slice(seen.length).trim() : label)
    setOpen(true)
  }
  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild ref={trigger}>{children}</TooltipTrigger>
      <TooltipContent sideOffset={offset} side={side ?? place.side} {...(place.clearTop ? { collisionPadding: { top: place.clearTop, right: 8, bottom: 4, left: 8 } } : {})}>{shown}</TooltipContent>
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
  // The nearest parent that scrolls. Looked for again until found: a list
  // that mounts while its page is still settling (a list emptied into the Bin
  // and brought back with Undo) can find none at first, and with no scroller
  // it would draw no rows at all.
  const findScroller = (): boolean => {
    let parent = box.current?.parentElement ?? null
    while (parent && !/auto|scroll/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement
    if (parent) setScroller(parent)
    return !!parent
  }
  useLayoutEffect(() => {
    if (findScroller()) return
    const again = setInterval(() => findScroller() && clearInterval(again), 100)
    return () => clearInterval(again)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Where the list starts in its scroller, read whenever what holds it changes
  // size (after layout, from the observer), never in the middle of a draw:
  // read on every draw, it laid out the whole page each time a list showed.
  useLayoutEffect(() => {
    if (!scroller?.isConnected) return void findScroller()
    const list = box.current
    if (!list) return
    const read = (): void => {
      if (!list.isConnected || !scroller.isConnected) return
      setMargin(Math.round(list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop))
    }
    const watch = new ResizeObserver(read)
    for (const one of [scroller, ...scroller.children]) watch.observe(one)
    if (list.parentElement) watch.observe(list.parentElement)
    return () => watch.disconnect()
  }, [scroller, items.length])
  const rows = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller,
    estimateSize: () => estimate,
    overscan: 10,
    scrollMargin: margin,
    getItemKey: (index) => keyOf(items[index])
  })
  // The keyboard's row, drawn or not yet: left still if it shows, to the edge
  // for a step, centred for a jump. Asked again once the scroller is found, so
  // a list opened onto a row far down (a link, ⌘K) lands on it too. A frame
  // later, so where the list starts in its scroller is known by then.
  useEffect(() => {
    if (!scroller || cursor === undefined || cursor < 0 || cursor >= items.length) return
    const frame = requestAnimationFrame(() => {
      const row = rows.measurementsCache[cursor]
      if (!row || !scroller.isConnected) return
      const place = rowPlace(row.start, row.end, { top: scroller.scrollTop, bottom: scroller.scrollTop + scroller.clientHeight })
      if (place !== 'still') (rows.scrollToIndex(cursor, { align: place === 'edge' ? 'auto' : 'center' }), rowShown())
    })
    return () => cancelAnimationFrame(frame)
  }, [cursor, scroller]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={box} className={`relative ${className}`} style={{ height: rows.getTotalSize() }}>
      {/* The rows on show stand one under the other, in the page's own flow from where the first one starts: a row that
          changes height (a group folding, or taking in a dropped row) moves the ones under it in the same frame, never
          drawn over them while the measure catches up. */}
      <div style={{ paddingTop: (rows.getVirtualItems()[0]?.start ?? margin) - margin }}>
        {rows.getVirtualItems().map(({ index, key }) => (
          // A sliver of room under each row, so two lit rows (the open one and the
          // cursor) never touch. Padding, not margin: the measure counts padding.
          <div key={key} data-index={index} ref={rows.measureElement} className="w-full pb-0.5">
            {children(items[index], index)}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Sounds on or off in one click, from the top of either window. */
export function SoundToggle({ className = '' }: { className?: string }): React.JSX.Element | null {
  const settings = useLive(haligtree.settings, null as Awaited<ReturnType<typeof haligtree.settings>> | null)
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
          void haligtree.setSettings({ sounds: !on })
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
export function Rolling({ text, className = '', by = 'character', eager = false, up: said }: {
  text: string | number
  className?: string
  by?: 'character' | 'word'
  /** Rolls from its first change, for a number shown only while you drag it. */
  eager?: boolean
  /** Which way it rolls, for words that count up or down (a time dragged earlier rolls down). */
  up?: boolean
}): React.JSX.Element {
  const last = useRef(text)
  const up = said ?? (typeof text === 'number' && typeof last.current === 'number' ? text >= last.current : true)
  useEffect(() => void (last.current = text), [text])
  // A number arriving with its page is not a change you saw: in its first
  // second it simply takes its value (lib/motion.ts, rule 3).
  const [born] = useState(() => performance.now())
  const calm = still() || (!eager && performance.now() - born < 1000)
  // In that first second, a new face for each value: changed in place, it still eased its width,
  // and what came after it (" / 147") slid along although nothing rolled. The face changes only
  // with the value: swapped on the first redraw after that second (a pointer resting on a tab),
  // the new face was drawn a few pixels wide for a frame, the bar shrank, and the click landed
  // beside the tab.
  const face = useRef(String(text))
  if (calm && !still()) face.current = String(text)
  return (
    <SlotText
      key={face.current}
      text={typeof text === 'number' ? num(text) : text}
      className={className}
      // On the app's own curve with only a trace of overshoot: the library's
      // springy default read as bouncy beside everything else, which settles.
      options={{ direction: up ? 'up' : 'down', rollBy: by, duration: calm ? 0 : 260, stagger: calm ? 0 : by === 'word' ? 22 : 35, exitOffset: calm ? 0 : 40, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', bounce: 0.2 }}
    />
  )
}

/**
 * A count in a badge, a pill or a tight row, one rule app-wide (the Mac's):
 * whole up to 9,999, then "12k" or "1.4M" with the whole number in its tip.
 * Its digits are all one width, so a count that changes never nudges what
 * sits beside it. `tip={false}` where a tip around it already says the number.
 */
export function Count({ n, className = '', tip = true }: { n: number; className?: string; tip?: boolean }): React.JSX.Element {
  const said = brief(n)
  const shown = <span data-count={n} className={`whitespace-nowrap tabular-nums ${className}`}><Rolling text={said} /></span>
  return tip && said !== num(n) ? <Tip label={num(n)}>{shown}</Tip> : shown
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
/** Inside a note's details sidebar, every island folds by its heading. */
const FoldIslands = createContext(false)
/** Open at first, of the details sidebar's groups: where a note sits and what it is. The rest wait folded. */
const OPEN_AT_FIRST = new Set(['Family', 'Links', 'Details'])

export function Island({ title, actions, children, className, compact, name, group }: {
  title?: ReactNode
  /** Named in the page's contents (page-contents.tsx), by this name. */
  group?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  /**
   * For a narrow column beside an open note: tighter spacing, a smaller
   * heading, each child a square row (fields lose their own box), and the
   * island gone while nothing in it is shown.
   */
  compact?: boolean
  /** What its fold is remembered by, where the title is more than words. */
  name?: string
}): React.JSX.Element {
  const folds = useContext(FoldIslands) && compact && !!title
  const key = name ?? (typeof title === 'string' ? title : '')
  if (folds && key) return <FoldingIsland title={title} name={key} actions={actions} className={className}>{children}</FoldingIsland>
  return (
    <section data-group={group} className={cn(compact ? 'mt-3 first:mt-0 has-[>div:last-child:empty]:hidden' : 'mt-6 first:mt-0', className)}>
      {(title || actions) && (
        <div className={cn('flex items-center gap-2 px-1', compact ? 'mb-1' : 'mb-2')}>
          {title && <h2 className={cn('font-semibold text-foreground', compact ? 'text-meta' : 'text-body')}>{title}</h2>}
          {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
        </div>
      )}
      <div className={cn(ISLAND, compact ? ISLAND_COMPACT : 'rounded-xl')}>{children}</div>
    </section>
  )
}
const ISLAND = 'mf-island divide-y divide-border/60 overflow-hidden border bg-accent/25'
const ISLAND_COMPACT = 'rounded-lg [&>*]:rounded-none [&>button]:w-full [&>textarea]:border-0 [&>textarea]:bg-transparent [&>textarea]:shadow-none [&>textarea]:focus-visible:ring-0 [&>input]:border-0 [&>input]:bg-transparent [&>input]:shadow-none [&>input]:focus-visible:ring-0'

/**
 * Put the caret in a field beside the page, whatever stands between: the
 * details opening (it may not be drawn yet), or its group folded shut (a
 * folded group is inert, so focus would quietly do nothing). `find` is asked
 * again until the field has the caret, for up to two seconds.
 */
export function focusField(find: () => HTMLElement | null | undefined): void {
  const started = performance.now()
  const ask = (): void => {
    const field = find()
    const shut = field?.closest('[data-details-group]:not([data-open])')?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')
    if (shut) shut.click()
    else if (field) (field.scrollIntoView({ block: 'nearest', behavior: glideWay() }), field.focus({ preventScroll: true }))
    if ((!field || document.activeElement !== field) && performance.now() - started < 2000) setTimeout(ask, 60)
  }
  ask()
}

/** A details group that folds by its heading, remembered per group; Family, Links and Details start open. */
function FoldingIsland({ title, name, actions, className, children }: { title: ReactNode; name: string; actions?: ReactNode; className?: string; children: ReactNode }): React.JSX.Element {
  const [open, setOpen] = useStoredFlag(`details-open:${name}`, OPEN_AT_FIRST.has(name))
  const toggle = (): void => {
    chime(open ? 'fold' : 'open')
    setOpen(!open)
  }
  return (
    <section data-details-group={name} data-open={open ? '' : undefined} className={cn('mt-2 first:mt-0 has-[[data-island-body]:empty]:hidden', className)}>
      <div className="group/fold flex items-center gap-1 px-1">
        <button type="button" aria-expanded={open} onClick={toggle}
          className="-mx-1 flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-left text-foreground hover:bg-accent/60">
          <ChevronRight aria-hidden className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--mf-ease)] motion-reduce:transition-none group-hover/fold:text-foreground', open && 'rotate-90')} />
          <h2 className="min-w-0 truncate text-meta font-semibold">{title}</h2>
        </button>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      <div className="grid transition-[grid-template-rows] duration-200 ease-[var(--mf-ease)] motion-reduce:transition-none" style={{ gridTemplateRows: open ? '1fr' : '0fr' }} inert={!open}>
        <div className="min-h-0 overflow-hidden">
          <div data-island-body className={cn(ISLAND, ISLAND_COMPACT, 'mt-1 mb-1')}>{children}</div>
        </div>
      </div>
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
