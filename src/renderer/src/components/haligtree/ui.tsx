import { Children, cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { afterLayout } from '@/lib/after-layout'
import { scrollerOf } from '@/lib/note-place'
import { useToolKeys } from '@/lib/tool-keys'
import { caretTakesEscape, layerOpen } from '@/lib/menu-keys'
import { tagHue } from '@/extensions/tokens'
import { createPortal, flushSync } from 'react-dom'
import { elementScroll, useVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual'
import { Check, ChevronRight, CircleX, type LucideIcon } from 'lucide-react'
import { AliveIcon } from '@/components/ui/alive-icon'
import XIcon from '@/components/ui/x-icon'
import { AnimatePresence, motion } from 'motion/react'
import { byKeys, EASE, glideWay, glides, hush, shift, speak, speakAfter, spring as springs, still, useFirstVisit } from '@/lib/motion'
import { stepTap } from '@/lib/haptics'
import { detent, slotTicker } from '@/lib/proximity'
import { Arrow } from './marks'
import Lenis from 'lenis'
import { afterPaint, call, useLive, haligtree } from '@/lib/haligtree'
import { UNATTRIBUTED } from '@/lib/sources'
import { useReading, useReadsIn, useSeen } from '@/lib/reads-in'
import { useDecoded } from '@/lib/decoded'
import { chime, quietFor, setVolume, soundOn, type Cue } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { useStoredChoice, useStoredFlag } from '@/lib/use-stored-flag'
import { useDetailsShown } from '@/lib/reading'
import { keyFor, useKeyChanges, withKeys } from '@/lib/keys'
import { Kbd as ShadKbd, KbdGroup, TipText } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TermInfo, TermPlain } from './term'
import { wordFor } from '@/lib/words'
import { KindAsker } from './note-extras'
import { QuestionAsker } from './questions-view'
import { BookAsker } from './books'
import { VaultPicker } from './vault-picker'
import { ImportFolders } from './import-folders'
import { GoalAsker } from './goals-view'
import { MilestoneAsker } from './milestones'
import { RestoreAsker } from './restore-ask'
import { HashField, asTag, isTag } from './hash-field'
import { brief, num } from '../../../../main/dates'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { OrbState } from 'thinking-orbs'
import { Orb } from './orb'
import { SaveTroubleLine } from './save-trouble'
import { RecordingLeftLine, useRecordingsLeft } from './recording-left'
import { ImportDoneCard, ImportProgress } from './import-done'
import { ApkgAskSheet } from './apkg-ask'
import { chooseBackupFolder } from '@/lib/backups'
import { useSaveTrouble } from '@/lib/save-trouble'
import { Beam, beam, startWorking } from './beam'
import type { AnimatedIconHandle, AnimatedIconProps } from '@/components/ui/types'
import { Slider } from '@/components/ui/slider'
import CheckedIcon from '@/components/ui/checked-icon'
import InfoCircleIcon from '@/components/ui/info-circle-icon'
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon'
import { GHOST } from './ghost'
import { Avatar, PersonMenu } from './avatar'
import { pasteAvatar, pickAvatar, setAvatar } from '@/lib/people'
import { near } from '../../../../main/near'
import { asideItem, canSplit, openAside, useHere, usePane } from '@/lib/split'
import { RowMenu, copyLinkItem, type RowItem } from './row-menu'
import { openApart, openSmall, smallHolds } from '@/lib/apart'
import { hoverNote } from './note-preview'
import { quoted } from '../../../../main/clip'
import { ArrowDown, ArrowUp } from '@/components/ui/icons'
import { APP_NAME } from '../../../../main/name'
import { formatBarShown } from '@/components/selection/selection-menu'
import { NoteQuestions, useQuestionsHere } from './note-questions'
import '@/lib/carry-cursor'

/**
 * True from a press in the words that picks some of them until the pick is let
 * go: the pointer that just picked words, coming to rest on a control (quick
 * capture's kind button sits at the end of its one line), opens no tip over them.
 * Asked only when a tip would open, of the selection's own ends: read on every
 * change of the selection, the browser laid the page out for it each time (a
 * long paste moved the caret once a stretch, and the whole note was laid out).
 */
let pressInWords = false
const pickingWords = (): boolean => {
  const selection = document.getSelection()
  return pressInWords && !!selection?.rangeCount && !selection.getRangeAt(0).collapsed
}
/**
 * How many popovers that are tied to a thing on the page and hold the stage are up (the Calendar's, on a draft or
 * on an event or a task): while one is, no tip comes up beside or over it from anything outside it, the thing's
 * own name included. One floating thing at a time, as with the format bar. Counted, so two never leave it stuck.
 */
let staged = 0
/** Call as such a popover comes up; what it gives back is called as it goes. */
export const stage = (): (() => void) => (staged++, () => void staged--)
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (event) => {
    pressInWords = event.target instanceof Element && !!event.target.closest('[contenteditable=true]')
  }, true)
}

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
          delete document.documentElement.dataset.resizing
        }
        document.documentElement.dataset.resizing = ''
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
export function FitActions({ children, keep, room }: { children: ReactNode; /** Never folded behind ⋯: a list's search, a box to type in, not a menu line. */ keep?: ReactNode; /** What sets the line's width (the list narrowed beside a note): measured again, at once, when it changes. */ room?: unknown }): React.JSX.Element {
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
    // Measured by the observer alone, which reports once as it starts and again as sizes change, each
    // time after the browser's own layout and before the frame is painted: measured a frame later, a
    // narrow line drew every button and then folded them into "More"; measured here and now, it made
    // the browser lay out the whole window in the middle of opening a note.
    const watch = new ResizeObserver(() => flushSync(fit))
    watch.observe(box)
    if (box.firstElementChild) watch.observe(box.firstElementChild)
    return () => watch.disconnect()
  }, [folded, room, seen])
  useEffect(() => void (!folded && setOpen(false)), [folded])
  return (
    // Overflowing to the right, never the left, so the line can measure what does not fit.
    // Never narrower than the ⋯ itself: a crowded line gives up its count before its menu.
    <div ref={line} className="flex min-w-7 flex-1 items-center overflow-hidden">
      <div className="ml-auto flex shrink-0 items-center gap-1">
      {keep}
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
          {/* Folded and shut, they stay on the page unseen, so their keys still answer:
              F opens Display (as a sheet, its button out of sight) beside an open note too. */}
          {!open && <div hidden>{children}</div>}
        </Popover>
      ) : children}
      </div>
    </div>
  )
}

/** A view's frame: title, a muted count, actions on the right, then the body. */
export function Page({ title, lead, count, unit = ['item', 'items'], actions, search, children, aside = false, wide = false, fit = false, beside, waiting = false, apart = false, dock = false }: {
  title: ReactNode
  /** The body takes the whole width and height under the line, for a panel docked at the page's right edge (Media's PDFs): the line keeps its column, and the body's parts scroll inside themselves. */
  dock?: boolean
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
  /** The list's search, before the actions: it stays on the line when they fold behind ⋯. */
  search?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  // A list never takes more than the drag allows (60%), so a width kept from a wider window cannot squeeze the page.
  const [listWidth, grip] = useListWidth()
  // Drawn once, when its reads and those of every part on it are in (lib/reads-in.tsx).
  const { provide, style } = useReadsIn(waiting, apart)
  // A list beside an open item is never narrower than its tabs: dragged in, or kept from a wider list, a tab was cut to "Goa".
  const leadBox = useRef<HTMLSpanElement>(null)
  const [leadNeed, setLeadNeed] = useState(0)
  useLayoutEffect(() => {
    const node = leadBox.current?.querySelector<HTMLElement>('[data-list-tabs]')
    if (!aside || !node) return setLeadNeed(0)
    // The tabs whole, and the count beside them whole too ("5 open", never "5 oper"). The count's room is held
    // from the first frame, at its widest (three figures, or more once there are more): a list sent here for one
    // note comes in a beat after it, and taking the count's room then moved the note over (a question, 39px).
    const measure = (): void => {
      const header = node.closest('header')
      const count = header?.querySelector<HTMLElement>('[data-list-count]')
      const room = header?.querySelector<HTMLElement>('[data-count-room]')
      const said = Math.max(count?.scrollWidth ?? 0, room?.scrollWidth ?? 0)
      setLeadNeed(node.offsetWidth + (said ? said + 30 : 0))
    }
    const watch = new ResizeObserver(measure)
    watch.observe(node)
    measure()
    return () => watch.disconnect()
  }, [aside, !!lead, count]) // eslint-disable-line react-hooks/exhaustive-deps
  const countSaid = count ? <span data-list-count={count} data-count-apart={lead ? '' : undefined}
    // Beside tabs, set apart by a hairline and a smaller size, so it never reads as one more tab.
    className={cn('min-w-0 truncate whitespace-nowrap tabular-nums', lead && 'mr-2 border-l border-foreground/15 pl-3 text-xs', unit[1] === 'selected' && 'font-medium text-foreground')}><Rolling text={count} /> {count === 1 ? unit[0] : unit[1]}</span> : null
  return provide(
    <section data-chrome={aside || undefined} data-apart={apart ? 'list' : undefined} className={cn('relative flex min-w-0 flex-1 flex-col', aside && 'hidden flex-none @[56rem]/page:flex')}
      style={{ ...(aside ? { width: listWidth, maxWidth: '60%', minWidth: leadNeed ? leadNeed + 48 : undefined } : {}), ...style }}>
      {aside && grip}
      {/* The window's toolbar already names the section, so this line only
          carries what it shows (lead), the count and the actions, and goes when it has none. */}
      {(count !== undefined || actions || lead || search) && (
        // Clipped to its own column, so it never draws over the page beside it; beside an open item the list keeps the room its tabs and count need (leadNeed).
        <header data-chrome={aside || undefined} className={`${wide ? '' : 'page-column '}flex h-10 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b px-5 text-muted-foreground`}>
          {typeof title === 'string' && title.startsWith('#') ? <span className="font-medium text-foreground">{title}</span> : null}
          {lead && <span ref={leadBox} className="contents">{lead}</span>}
          {lead && aside && count !== undefined && <span aria-hidden data-count-room className="invisible absolute mr-2 border-l pl-3 text-xs whitespace-nowrap tabular-nums">{num(Math.max(count ?? 0, 888))} {unit[1]}</span>}
          {/* With tabs or a switch at the line's left (lead), the count goes to the right, before the actions, so it is
              never read as one more tab; without, it opens the line. Said plainly when it counts what is picked. */}
          {count && !lead ? countSaid : null}
          {/* The count is on the same line: measured again the moment it comes or changes, not a frame later by the observer. */}
          <FitActions keep={lead && count ? <>{countSaid}{search}</> : search} room={`${aside ? listWidth : 'page'} ${count ?? ''} ${count === 1 ? unit[0] : unit[1]}`}>{actions}</FitActions>
        </header>
      )}
      <SmoothScroll wide={wide || dock} fit={fit || dock} beside={beside}>{children}</SmoothScroll>
    </section>
  ) as React.JSX.Element
}

/** Marks a line tells you to type ([[, @, /, #), standing alone as a word: drawn as code, so they read as what to press. */
export const TYPED_MARKS = ['[[', '@', '/', '#']
export function TypedMark({ children }: { children: string }): React.JSX.Element {
  return <code className="rounded bg-accent px-1 font-mono text-[0.92em]">{children}</code>
}
/** Plain words with any mark standing alone in them drawn as a TypedMark. */
export function WithMarks({ text }: { text: string }): React.JSX.Element {
  return <>{text.split(/(\s+)/).map((word, i) => (TYPED_MARKS.includes(word) ? <TypedMark key={i}>{word}</TypedMark> : word))}</>
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
  // Another line on screen already has the voice: this one is simply there (lib/motion.ts, speakAfter).
  const [hushed, setHushed] = useState(false)
  const speaks = turn.current.speaks && !hushed && root.dataset.motion !== 'off'
  const line = useRef<HTMLSpanElement>(null)
  // Its place in the queue, found once the page it is on is the one showing
  // (a page just left no longer counts), and before anything is painted.
  // Once for each set of words: React's development checks stop and start
  // every effect, and asked twice the line would queue behind itself and its
  // words would start late twice over.
  const queued = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (story || queued.current === text) return
    queued.current = text
    if (!turn.current?.speaks || root.dataset.motion === 'off') return
    // Set before the first paint, so a line that does not speak is never seen typing.
    setHushed(speakAfter(id, long) === null)
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
              : TYPED_MARKS.includes(word) ? <TypedMark>{word}</TypedMark> : word}
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
        <div className={`${page} shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_20%,transparent)]`} style={{ background: paper }}>
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
        <motion.div className="absolute top-[6px] left-[10px] h-[44px] w-[37px] rounded-r-[4px] rounded-l-[2px] shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_2px_4px_color-mix(in_oklab,var(--mf-shadow-ink)_18%,transparent)]"
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
          <motion.div className="absolute right-[2px] bottom-[2px] flex size-[20px] items-center justify-center rounded-full shadow-[0_1px_3px_color-mix(in_oklab,var(--mf-shadow-ink)_25%,transparent)]"
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
export function Empty({ shaped = false, title, children, action, compact = false, art, arrow = true }: {
  /** Done, not empty: the book's pages turn, it shuts, and a tick sits on it. */
  shaped?: boolean
  /** A picture of the place itself (a folder's own icon) in the book's stead. */
  art?: ReactNode
  /** The small hand-drawn arrow beside the action. */
  arrow?: boolean
  title: ReactNode
  children: ReactNode
  action?: ReactNode
  /** Sized for the prompt's narrow panel: less height above, a smaller shape. */
  compact?: boolean
}): React.JSX.Element {
  return (
    <div data-empty className={`flex max-w-sm flex-col items-start gap-3 ${compact ? 'px-2 py-10' : 'px-5 py-[16vh]'}`}>
      {art ?? <Book size={compact ? 44 : 56} seed={typeof title === 'string' ? title : 'empty'} done={shaped} />}
      {/* A rest is a moment, not a missing list: its line at title size in the
          heading font, a step down in the prompt's narrow panel. */}
      <h2 className={compact ? 'text-heading font-semibold' : 'text-title font-medium'}>{title}</h2>
      <p className="leading-relaxed text-muted-foreground">{typeof children === 'string' ? <Typed text={children} step={30} /> : children}</p>
      {/* The one thing to do, with a small arrow in the margin pointing to it. */}
      {action && (
        <div className="flex items-center gap-1.5">
          {action}
          {arrow && <Arrow seed={typeof title === 'string' ? title : 'empty'} draw={() => !byKeys()} className="-mt-6" />}
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
  // Study questions from the note, while they are out, take the Details' place, as the reader's chapter cards do
  // (the number of the asking, 0 when there are none).
  const asking = useQuestionsHere()
  const questions = asking > 0
  // Asked for (Details pressed, questions made), the column comes into sight. Beside the note it already is; in a
  // narrow window it stands under the whole note, and the note's own scroller brings it up. Marked as just shown, so
  // a menu that asked for it gives the focus to it as it closes (lib/quiet-focus.ts), not back to its button above.
  const box = useRef<HTMLElement>(null)
  const open = !fold || shown || questions
  const was = useRef(open)
  useLayoutEffect(() => {
    if (open && (!was.current || asking) && box.current) {
      box.current.scrollIntoView({ block: 'nearest' })
      box.current.dataset.revealed = ''
    }
    was.current = open
  }, [open, asking])
  if (fold && !shown && !questions) return null
  // One size for every row, whatever window it sits in: the prompt's larger
  // base made some rows grow and others not. A caller's classes are merged
  // over these, so the prompt's drawer can drop the width and the rule.
  // Questions take the Details' own width: wider, they squeezed the note to a letter a line beside a list.
  const aside = <aside ref={box} tabIndex={-1} data-chrome className={cn('flex w-full shrink-0 flex-col gap-px overflow-y-auto border-t p-3 pt-4 text-control text-muted-foreground outline-none @[40rem]/page:w-64 @[40rem]/page:border-t-0 @[40rem]/page:border-l', fold && 'mf-details', className)}>{fold && questions ? <NoteQuestions /> : children}</aside>
  return fold ? <FoldIslands.Provider value>{aside}</FoldIslands.Provider> : aside
}
/** Where reading a list starts: the note open now, else the keyboard cursor, else the top. */
export const startAt = (list: { id: string }[], open: string | null | undefined, cursor: number): number => {
  const at = open ? list.findIndex((one) => one.id === open) : -1
  return at >= 0 ? at : Math.max(0, cursor)
}

/**
 * The ✕ that puts away what is open beside a list (a task's page and its
 * details), drawn as a split pane's own ✕: the same size, icon and place at
 * the right of its top row. Esc does the same from the list.
 */
export function CloseBeside({ onClose, className = '' }: { onClose: () => void; className?: string }): React.JSX.Element {
  return (
    <Tip label="Close  Esc">
      <button type="button" data-close-beside aria-label="Close" onClick={() => (chime('fold'), onClose())}
        className={`flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${className}`}>
        <AliveIcon icon={XIcon} size={14} />
      </button>
    </Tip>
  )
}

/**
 * Where an open item sits in its list, and the way to the next and the one
 * before, the way Linear's issue view has it: "3 / 426 ↓ ↑". ↓ and ↑ step
 * through the list whenever you are not typing.
 */
/** Whether the focus is in a page that takes its own list keys (↑ ↓ ⌫ ⌘A), as a note seen as a board does: the list round it stands down. */
export const ownKeys = (): boolean => !!(document.activeElement as HTMLElement | null)?.closest?.('[data-own-keys]')

export function Stepper({ at, total, onStep, turns = false }: { at: number; total: number; onStep: (to: number) => void; /** What it steps to turns a page as it opens: that is the step's one sound. */ turns?: boolean }): React.JSX.Element | null {
  const latest = useRef({ at, total, onStep, turns })
  latest.current = { at, total, onStep, turns }
  // Split, only the pane in front steps.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // ⇧↑ and ⇧↓ are the list's, picking a run.
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || typing() || event.defaultPrevented || !here()) return
      // A page that takes its own list keys (a note seen as a board, its cards) keeps them while it has the focus.
      if (ownKeys()) return
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
    <div data-stepper className="flex shrink-0 items-center gap-1 text-control text-muted-foreground">
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
export function PropInput({ icon: Icon, value, placeholder, onSave, suffix, type = 'text', ghost, does, lead }: {
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
  /** A quiet word before what was saved, saying what it is ("Waiting on Sam"), as a date picker's lead does. */
  lead?: string
}): React.JSX.Element {
  const field = (
    <label data-ghost-field={ghost && !value ? '' : undefined} className="flex w-full cursor-text items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent focus-within:bg-accent">
      <Icon className="size-4 shrink-0" />
      {lead && value && <span data-lead className="shrink-0 text-control text-muted-foreground">{lead}</span>}
      <input
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 5 : undefined}
        defaultValue={value}
        placeholder={ghost ?? placeholder}
        aria-label={ghost ? placeholder : undefined}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        onBlur={(event) => onSave(event.target.value.trim())}
        className={cn('min-w-0 flex-1 bg-transparent text-control text-foreground tabular-nums outline-none placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none', ghost && GHOST)}
      />
      {suffix && <span className="shrink-0 text-meta">{suffix}</span>}
    </label>
  )
  return does && !value ? <Tip label={does}>{field}</Tip> : field
}

export function Prop({ icon: Icon, alive, children, onClick, active, tint, secret, tip, named }: {
  icon?: LucideIcon
  /** Its name read out, where its words are wrapped in something (a mark for a probe) and it has a tip: the tip never takes the name's place. */
  named?: string
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
      aria-label={tip ? (typeof children === 'string' ? children : named) : undefined}
      data-private={secret ? '' : undefined}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${onClick ? 'hover:bg-accent hover:text-foreground' : ''} ${active ? 'text-foreground' : ''}`}
    >
      {alive
        ? <AliveIcon icon={alive} size={16} style={tint ? { color: `var(--tt-color-text-${tint})` } : undefined} />
        : Icon && <Icon className="size-4 shrink-0" style={tint ? { color: `var(--tt-color-text-${tint})` } : undefined} />}
      {/* A long name takes a second line rather than being cut in the narrow details column. */}
      <span className={`min-w-0 line-clamp-2 hyphens-auto [overflow-wrap:break-word] ${secret ? 'private-text' : ''}`}>{children}</span>
    </Tag>
  )
  return tip ? <Tip label={tip} side="left">{prop}</Tip> : prop
}

/** Tags as Todoist draws them: a small tag glyph and the word, in a quiet colour. */
// A thought can carry six routes back to it: a row shows the first few and
// counts the rest, "+3", named in full on hover.
// The title always wins the room: the tags take at most two fifths of the
// row, a long tag ends in "…" at 10rem, and only a cut one names itself in full on hover.
// A tag shows whole or not at all: where the row has no room for it, it joins the count (at 560 wide two tags
// shrank to "#r…" and "#…"), down to the count alone, which never gives way.
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
  const shown = tags.slice(0, max)
  // How many of the shown tags have room to stand whole; the others wait unseen, out of the line, and are counted.
  const [fit, setFit] = useState(shown.length)
  // The room every shown tag takes whole (the box asks for it whatever is hidden, so it grows back when the row does),
  // and the least it takes: the count alone.
  const [room, setRoom] = useState<{ whole: number; least: number } | null>(null)
  const key = shown.join(' ')
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = (): void => {
      const words = [...el.querySelectorAll<HTMLElement>('[data-tag]')]
      const now = words.filter((one) => one.scrollWidth > one.clientWidth + 1).map((one) => one.dataset.tag!)
      setCut((was) => (was.join(' ') === now.join(' ') ? was : now))
      const widths = words.map((one) => one.offsetWidth)
      // The widest the count can be ("+N" of every tag), so a tag let in never pushes it out.
      const count = el.querySelector<HTMLElement>('[data-tags-ruler]')?.offsetWidth ?? 0
      const need = (n: number): number => widths.slice(0, n).reduce((sum, one) => sum + one, 0) + 8 * Math.max(0, n - 1) + (n < tags.length ? (n ? 8 : 0) + count : 0)
      let n = widths.length
      while (n > 0 && need(n) > el.clientWidth + 0.5) n--
      setFit(n)
      setRoom((was) => (was?.whole === need(widths.length) && was.least === need(0) ? was : { whole: need(widths.length), least: need(0) }))
    }
    // Measured by the observer, which reports once as soon as the row is laid
    // out: measured here, every row with tags laid out the page as it was drawn.
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [key, tags.length])
  if (!tags.length) return null
  const rest = tags.slice(Math.min(fit, shown.length))
  // Waiting for room: still laid out at its own width, to be measured, but unseen, unreached and out of the line.
  const away = (at: number): boolean => at >= fit
  return (
    // It gives way far faster than the title beside it, so the title keeps the room.
    <span ref={box} data-tags style={{ flexBasis: room?.whole, minWidth: room?.least }} className={`relative flex min-w-0 ${alone ? 'max-w-full' : 'max-w-[40%]'} shrink-[20] items-center gap-2 overflow-hidden text-xs`}>
      {shown.map((tag, at) => {
        const color = { color: `var(--tt-color-text-${tagHue(tag, colors[tag])})` }
        const hidden = away(at) ? { 'aria-hidden': true, 'data-tag-away': '' } : {}
        if (!go) {
          const word = <span key={tag} data-tag={tag} {...hidden} className={`max-w-[10rem] shrink-0 truncate ${away(at) ? 'invisible absolute' : ''}`} style={color}>#{tag}</span>
          return cut.includes(tag) && !away(at) ? <Tip key={tag} label={<>#{tag}</>}>{word}</Tip> : word
        }
        // A tag looks like a link, so it is one: its page, never the row it sits in,
        // and never the start of a drag. Under the pointer it lights in its own colour
        // and underlines, so it never reads as the row's own highlight.
        const hold = (event: React.SyntheticEvent): void => event.stopPropagation()
        return (
          // A rest shows the tag's card (note-preview.tsx), as a tag does everywhere.
          <span key={tag} role="button" tabIndex={away(at) ? -1 : 0} data-tag={tag} data-tag-go {...hidden} {...hoverNote('tag', tag)}
              onPointerDown={hold} onMouseDown={hold}
              onClick={(event) => (event.stopPropagation(), event.preventDefault(), openTag(tag, event.altKey))}
              onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.stopPropagation(); event.preventDefault(); openTag(tag) }}
              className={`-my-1 max-w-[10rem] shrink-0 cursor-pointer truncate rounded px-0.5 py-1 decoration-1 underline-offset-2 transition-colors duration-80 hover:bg-[color-mix(in_oklab,var(--tag-ink)_18%,transparent)] hover:underline focus-visible:bg-[color-mix(in_oklab,var(--tag-ink)_18%,transparent)] focus-visible:outline-none ${away(at) ? 'invisible absolute' : ''}`} style={{ ...color, '--tag-ink': color.color } as React.CSSProperties}>#{tag}</span>
        )
      })}
      {rest.length > 0 && (
        <Tip label={rest.map((tag) => `#${tag}`).join('  ')}>
          <span data-tags-more className="shrink-0 rounded-full bg-accent px-1.5 tabular-nums text-muted-foreground">+{brief(rest.length)}</span>
        </Tip>
      )}
      {/* Its number drawn from an attribute, so it is measured but is never part of the row's words. */}
      <span data-tags-ruler data-count={`+${brief(tags.length)}`} aria-hidden className="invisible absolute rounded-full px-1.5 tabular-nums after:content-[attr(data-count)]" />
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
  // A control inside a note (a meeting's time or speaker, a player's button, any block's own piece): still the note's,
  // so ⌫ there is never the list's "to the Bin" for the note around it.
  if (active?.closest('.ProseMirror')) return 'editor'
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
function rowPlace(top: number, bottom: number, view: { top: number; bottom: number }): 'still' | 'edge' | 'centre' {
  if (top >= view.top && bottom <= view.bottom) return 'still'
  const near = (bottom - top) * 2.5
  return bottom > view.top - near && top < view.bottom + near ? 'edge' : 'centre'
}

/**
 * A row drawn on the page, brought into view by the rule above. Measured once
 * the frame it was drawn in has been laid out (an IntersectionObserver first
 * reports then), never at once: reading where it is in the middle of opening
 * a note made the browser lay out the whole new page early, 30 to 60ms.
 */
export function showRow(row: Element | null | undefined): void {
  if (!row) return
  const watch = new IntersectionObserver(() => (watch.disconnect(), row.isConnected && placeRow(row)))
  watch.observe(row)
}
function placeRow(row: Element): void {
  // A page being put back where it was (Back, another tab: panes.tsx) is already where you left it, open row and all.
  if (row.closest('[data-placing]')) return
  let box = row.parentElement
  while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  if (!box) return
  const at = row.getBoundingClientRect()
  // Under a band held at the scroller's top (its scroll-padding, a tag's head), a row is not in view.
  const view = box.getBoundingClientRect()
  const place = rowPlace(at.top, at.bottom, { top: view.top + (parseFloat(getComputedStyle(box).scrollPaddingTop) || 0), bottom: view.bottom })
  if (place !== 'still') row.scrollIntoView({ block: place === 'edge' ? 'nearest' : 'center' })
}

/**
 * Moving through a list the way the editor moves through a document: j and k,
 * or the arrows; gg and G for the ends; Enter to open. Escape only lets go of
 * something passing, like the words in a search (onEscape): it never goes
 * back, which is ⌘['s job. Inside
 * a text box only Ctrl-J and Ctrl-K move, so typing a j is still a j, and in
 * the editor none of it: the editor has its own vim. The same
 * keys in every list in the app, which is the whole point of having one hook.
 */
/**
 * G and g g, a list's last and first row, read one way for every list: this
 * hook's and those with keys of their own (a board, the matrix, the day's
 * lines). Asked once per key, before anything else turns it away, so the
 * first g of a pair is heard; asked twice for one key (two lists listening),
 * it answers the same.
 */
const ends: { event: Event | null; said: 'first' | 'last' | null; last: string } = { event: null, said: null, last: '' }
export function listEnd(event: KeyboardEvent | React.KeyboardEvent): 'first' | 'last' | null {
  const raw = 'nativeEvent' in event ? event.nativeEvent : event
  if (ends.event === raw) return ends.said
  if (raw.key === 'Shift') return null
  const said = raw.metaKey || raw.ctrlKey || raw.altKey ? null : raw.key === 'G' ? 'last' : raw.key === 'g' && ends.last === 'g' ? 'first' : null
  // A finished g g starts over, so a third g is the start of the next pair.
  Object.assign(ends, { event: raw, said, last: said === 'first' ? '' : raw.key })
  return said
}

export function useListKeys(count: number, { onOpen, onEscape, enabled = true, opened = -1, onExtend, across = 1, upDown }: {
  onOpen?: (index: number) => void
  /** Where ↑ and ↓ go from a row, where lines are not all `across` long (a grid cut into months): by `across` otherwise. */
  upDown?: (at: number, by: 1 | -1) => number
  /** Rows side by side on a line (a two-column page): ↑ ↓ go to the one above or under, ← → to the one beside. */
  across?: number
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
  const latest = useRef({ count, onOpen, onEscape, onExtend, at, across, upDown })
  latest.current = { count, onOpen, onEscape, onExtend, at, across, upDown }
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
      const { count, onOpen, onEscape, onExtend, at, across, upDown } = latest.current
      // A key something in front already took, like search over this list.
      if (event.defaultPrevented || !here()) return
      // The editor has its own vim, and its menus their own Ctrl-J and K.
      if (focus() === 'editor') return
      const inBox = focus() === 'box'
      const chord = event.ctrlKey && !event.metaKey
      const move = (to: number): void => {
        event.preventDefault()
        setAt(Math.max(0, Math.min(count - 1, to)))
        // The arrows took the keys, so the list has them now: a button clicked a moment before (a sort chip) lets go,
        // or the next Enter would press it again instead of opening the row the cursor is on. A field keeps its caret.
        const held = document.activeElement
        if (!inBox && held instanceof HTMLButtonElement && !held.closest('[data-row], [data-cursor]')) held.blur()
      }
      if (event.metaKey || event.altKey) return
      const by = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
      if (by && event.shiftKey && !chord && !inBox && onExtend && count) {
        const to = at < 0 ? 0 : Math.max(0, Math.min(count - 1, at + by))
        move(to)
        return onExtend(at < 0 ? to : at, to)
      }
      if ((chord && event.key === 'j') || (!inBox && !chord && (event.key === 'j' || event.key === 'ArrowDown'))) return move(at < 0 ? 0 : upDown ? upDown(at, 1) : at + across)
      if ((chord && event.key === 'k') || (!inBox && !chord && (event.key === 'k' || event.key === 'ArrowUp'))) return move(upDown && at >= 0 ? upDown(at, -1) : at - across)
      // A list's own line (data-list-line: quick capture's glance line, box-glance.tsx): ↓ and ↑ walk the list from
      // the line, the caret staying in it, and ↵ opens the row they reached unless the line took it first.
      if (inBox && !chord && document.activeElement?.closest('[data-list-line]')) {
        if (by && !event.shiftKey) return move(at < 0 ? 0 : at + by * across)
        if (event.key === 'Enter' && onOpen && at >= 0 && at < count) (event.preventDefault(), onOpen(at))
      }
      if (inBox) return
      if (across > 1 && !chord && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) return move(at < 0 ? 0 : at + (event.key === 'ArrowRight' ? 1 : -1))
      const end = listEnd(event)
      if (end) return move(end === 'last' ? count - 1 : 0)
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
      // With Vim on, Escape stays in the note, as in vim and Obsidian (18 Nov): only with Vim off does it let go.
      free = !!editor && !editor.hasAttribute('data-vim-mode') && (window.getSelection()?.isCollapsed ?? true) &&
        !layerOpen('.tiptap-find-bar:not([inert])') && !caretTakesEscape()
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
type ToastAction = { label: string; key: string; run: () => void }
/** What a toast means, so its colour and mark say it too: done, only news, careful, or not done. */
type ToastTone = 'success' | 'info' | 'warning' | 'error'
/** What a toast tells of (a card made, a gem kept, the Bin), so its words open it. `title` lets its menu copy a link. */
export type Made = { type: string; id: string; title?: string; /** Where in it to land: the ids a Bin toast moved there. */ at?: string }
/**
 * Say what an action did, briefly, with a way back. The answer to "did that
 * work?" and the plan's undo-everywhere in one: three seconds, then gone.
 * Given what it made, a click on the words opens that, as a row's click does.
 */
export const toast = (text: string, undo?: () => void, tone: ToastTone = 'success', action?: ToastAction, made?: Made): void => {
  beam(tone)
  window.dispatchEvent(new CustomEvent('haligtree:toast', { detail: { text, undo, tone, action, made } }))
}

/** A notice with Undo for a change still being saved: said at once, so a quick ⌘Z takes back this change and not the one
 *  before; its Undo waits for the save first. */
export const sayNow = (saved: Promise<unknown>, text: string, undo: () => void, tone?: ToastTone): void => toast(text, () => void saved.then(undo), tone)

/** Open what a toast made: in the main window's page, or to the side (⌥-click), as rows open. */
const openMade = (made: Made, aside = false): void => {
  if (aside && canSplit()) return openAside(made.type, made.id)
  window.api.openInHome(made.type, made.id, made.at)
}
/** A toast's right click: the lines every row's menu has for opening it, from the same helpers. */
const madeMenu = (made: Made, done: () => void): RowItem[] => {
  const page = made.type === 'view'
  const aside = asideItem(made.type, made.id)
  const link = !page && made.title ? copyLinkItem(made.type === 'capture' ? made.id : `${made.type}:${made.id}`, made.title) : null
  // Chosen, a line has done what the toast was for: it goes.
  return [
    { label: 'Open', run: () => (done(), openMade(made)) },
    aside && { ...aside, run: () => (done(), aside.run()) },
    // A person, a tag or a task is a page in the main window, with no window of its own.
    !page && !['task', 'person', 'character', 'tag', 'event', 'day', 'pdf', 'web'].includes(made.type) && { label: 'Open in a new window', run: () => (done(), openApart(made.type, made.id)) },
    !page && smallHolds(made.type) && made.type !== 'task' && { label: 'Open in a small window', run: () => (done(), openSmall(made.type, made.id)) },
    link && link !== 'separator' && { ...link, run: () => (done(), link.run()) }
  ]
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
  const { text, ok, made, cue, undo } = (event as CustomEvent<{ text: string; ok: boolean; made?: Made; cue?: Cue; undo?: () => void }>).detail
  // One sound: the one the act names (lib/host.ts `said`), else a copy's or a refusal's.
  chime(cue ?? (ok ? 'copy' : 'nope'))
  toast(text, undo, ok ? 'success' : 'error', undefined, made)
})

/** The toast up now goes: what it offered to take back was taken back another way. */
export const untoast = (): void => void window.dispatchEvent(new CustomEvent('haligtree:untoast'))

/**
 * A real wait said in words: an orb chip where toasts come up, for as long as
 * the work takes. For work started from a menu, with no button to hold it.
 * Given the job's name (main/jobs.ts), the chip carries “Stop”.
 */
export async function waiting<T>(label: string, state: OrbState, work: Promise<T>, job?: string): Promise<T> {
  window.dispatchEvent(new CustomEvent('haligtree:wait', { detail: { label, state, job } }))
  // The beam turns with it: the window's edge says so as well as the chip.
  const end = startWorking()
  try {
    return await work
  } finally {
    end()
    window.dispatchEvent(new CustomEvent('haligtree:wait', { detail: null }))
  }
}

/** “Stop” on a long job (main/jobs.ts): it takes back what it wrote, and its caller says “Stopped”. */
export const stopJob = (name: string): void => void window.api.haligtree('job-stop', name)

/** Give a nugget its question, so review can test it: asked in place. */
export const askQuestion = (id: string): Promise<void> =>
  ask('The question it answers, for review', 'A question this answers', { action: 'Test me on it' }).then((prompt) => {
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
 * The microphone could not be used, said plainly, with the way to the Mac's Privacy › Microphone page (S): every
 * place that starts recording (talk to type, "/ Dictate", a voice note) says it this one way. `denied`: macOS said
 * no; else no microphone answered at all.
 */
export const refuseMic = (denied: boolean): void => {
  chime('nope')
  toast(denied ? `${APP_NAME} may not use the microphone. Allow it in System Settings › Privacy & Security › Microphone` : 'No microphone found. Connect one, or check it is allowed in System Settings › Privacy & Security › Microphone', undefined, 'warning', { label: 'Open Microphone settings', key: 'S', run: () => void window.api.haligtree('mic:privacy') })
}

/**
 * Why a save failed, in plain words, from the error the main process sent
 * back: the database's own wording means nothing to someone writing a note,
 * so the common ones say what to do instead. `button`: a "Try again" button
 * stands beside the words, so they do not say it too.
 */
export const whyFailed = (error: unknown, button = false): string => {
  const raw = String((error as Error | undefined)?.message ?? error ?? '').replace(/^Error invoking remote method[^:]*:\s*(?:\w*Error:\s*)?/, '').split('\n')[0].trim()
  if (/full|SQLITE_FULL|ENOSPC/i.test(raw)) return 'your disk is full. Free up some space, then try again'
  if (/locked|busy/i.test(raw)) return `your notes were busy for a moment${button ? '' : '. Try again'}`
  if (/readonly|read-only|EACCES|EPERM/i.test(raw)) return `${APP_NAME} is not allowed to write to its folder. Check its permissions in Finder, then try again`
  return `${raw || 'something went wrong'}. ${button ? 'If it keeps happening, restart' : 'Try again, and restart'} ${APP_NAME}${button ? '' : ' if it keeps happening'}`
}

// A page's read that failed (lib/haligtree.ts `useLive`): said, with a way to ask again, never a page left waiting in
// silence (the user, 15 Nov 2026: "why is this hanging?").
window.addEventListener('mf-read-failed', (event) => {
  const { error, again } = (event as CustomEvent<{ error: unknown; again: () => void }>).detail
  toast(`Part of this window could not be read: ${whyFailed(error, true)}`, undefined, 'warning', { label: 'Try again', key: 'T', run: again })
})

/** How a question is asked: the field it needs, a guess, its ways out, the word on its button, and what opened it. */
export type AskOptions = {
  /** A tag ("#" drawn in the field), or a name typed before (completes as you type). */
  field?: 'attribution' | 'medium' | 'tag'
  /** A guess already in the field, offered, never kept unasked. */
  initial?: string
  /** Its label ("Keep it without"): the line is asked for, never forced; it resolves to ''. */
  skip?: string
  /** One more way out ("Not a quote"): it runs, and the question resolves to null. */
  instead?: { label: string; run: () => void }
  /** The primary button, naming what it does: "Make deck", "Tag 3", "Rename". */
  action: string
  /** What opened it, when the caller knows better than the last press (a row, a button). */
  at?: Element | null
}

/**
 * A question that needs a line from you before something can go on. Asked in a
 * small sheet that grows out of what opened it (the row right-clicked, the
 * button pressed), or, opened by a key, just under the window's top: the page
 * stays as it is behind it. Its button says what it does; Enter does the same,
 * Esc or a click away lets it go. Resolves to the words, or null.
 */
export const ask = (question: string, placeholder: string, options: AskOptions): Promise<string | null> =>
  new Promise((answer) => void window.dispatchEvent(new CustomEvent('haligtree:ask', { detail: { question, placeholder, ...options, at: options.at ?? opener(), review: inReview(options.at), answer } })))

/**
 * What a sheet grows out of: the last thing pressed outside a menu (a row
 * right-clicked, a button), as its row or button; a key pressed since means it
 * was asked by keys (⌘K), and the sheet sits under the window's top instead.
 */
let pressed: { el: Element; x: number; y: number } | null = null
const ASIDE = '[role="menu"], [data-ask], [data-sure]'
if (typeof window !== 'undefined') {
  const press = (event: PointerEvent | MouseEvent): void => {
    const el = event.target instanceof Element ? event.target : null
    if (el && !el.closest(ASIDE)) pressed = { el, x: event.clientX, y: event.clientY }
  }
  window.addEventListener('pointerdown', press, true)
  window.addEventListener('contextmenu', press, true)
  window.addEventListener('keydown', (event) => {
    if (!(event.target instanceof Element && event.target.closest(ASIDE))) pressed = null
  }, true)
}
/** Asked from Review: the sheet wears Review's finish (Satin's metal or Paper's stock), as Review's own cards do. */
const inReview = (at?: Element | null): boolean => !!(at ?? pressed?.el)?.closest('[data-review-page]')
const PRESSABLE = 'button, [role="button"], [role="row"], [data-row-menu], [data-side-row], [data-pick], li, label'
/** The box a sheet hangs from: the pressed row or button, or the point pressed when that is a page-sized thing (the writing, a long list). */
function opener(): DOMRect | null {
  if (!pressed) return null
  const { el, x, y } = pressed
  const host = el.closest(PRESSABLE) ?? el
  const box = host.isConnected ? host.getBoundingClientRect() : null
  return box && box.height > 0 && box.height <= 280 ? box : new DOMRect(x, y, 0, 0)
}

/** The app's own field (ui/input.tsx's frame, as hash-field.tsx's INPUT_FRAME), the one Tasks and Settings type in, its words at ⌘K's size (14px): a line you write, not small grey type. */
const ASK_FIELD = `min-w-0 rounded-md border border-input bg-input/20 px-2 py-0.5 transition-colors focus-within:border-foreground/25 dark:bg-input/30 h-7 w-full text-body text-foreground placeholder:text-muted-foreground [&_input]:placeholder:text-muted-foreground`

/**
 * The question said at the app's own size: its question as a short bold line, what led to it as a quiet line under.
 * "A line in your own words, beside it. What does it say to you?" is "What does it say to you?" over the rest.
 */
export const askParts = (question: string): { title: string; hint: string } => {
  const sentences = question.match(/[^.?!]+[.?!]?/g)?.map((one) => one.trim()).filter(Boolean) ?? [question]
  const at = sentences.findIndex((one) => one.endsWith('?'))
  if (at < 0 || sentences.length < 2) return { title: question, hint: '' }
  return { title: sentences[at], hint: sentences.filter((_, i) => i !== at).join(' ') }
}

/**
 * The one sheet a question or a yes-or-no is asked in: the floating material
 * at a card's corners, hung from what opened it (or under the window's top),
 * no dimming. A heading line and a quiet line, what it holds, then the ways
 * out on the left and Cancel and the one button that says what it does on the
 * right. Esc, a click away or Cancel lets it go.
 */
function AskSheet({ at, review, label, onLeave, children, ...rest }: { at: Element | DOMRect | null; review: boolean; label: string; onLeave: () => void; children: ReactNode } & React.ComponentProps<'div'>): React.JSX.Element {
  // Opened by keys: just under the window's top, in the middle, as ⌘K sits.
  const anchor = { current: { getBoundingClientRect: () => (at instanceof Element ? at.getBoundingClientRect() : at ?? new DOMRect(window.innerWidth / 2, Math.round(window.innerHeight * 0.18), 0, 0)) } }
  return (
    <Popover open onOpenChange={(open) => !open && onLeave()}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent side="bottom" align={at ? 'start' : 'center'} sideOffset={8} collisionPadding={{ top: 52, right: 12, bottom: 12, left: 12 }} aria-label={label} data-finish-sheet={review || undefined} {...rest}
        // The field takes the focus, not the sheet; a menu closing never takes it back (quietClose).
        onOpenAutoFocus={(event) => { event.preventDefault(); (event.currentTarget as HTMLElement).querySelector<HTMLElement>('input, [data-sure-yes]')?.focus() }}
        // Only a press outside, Esc or Cancel lets it go: the menu that opened it still moves the focus about as it closes.
        onFocusOutside={(event) => event.preventDefault()}
        className="z-[80] w-[min(22rem,calc(100vw-1.5rem))] gap-2.5 rounded-xl p-3 text-control">
        {children}
      </PopoverContent>
    </Popover>
  )
}

/** A sheet's heading: its question in bold at the app's size, and the quiet line that led to it. */
function AskHead({ title, hint }: { title: string; hint?: ReactNode }): React.JSX.Element {
  return (
    <div className="grid gap-0.5">
      <h2 data-ask-title className="text-heading font-semibold text-balance text-foreground">{title}</h2>
      {hint && <p data-ask-hint className="text-control text-pretty text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">{hint}</p>}
    </div>
  )
}

/** A sheet's foot: other ways out on the left, Cancel and the one button on the right, each with its key. */
function AskFoot({ go, ready = true, danger = false, onGo, onCancel, children }: { go: string; ready?: boolean; /** Deleting: the button in the red tint every destructive action wears, never the accent. */ danger?: boolean; onGo: () => void; onCancel: () => void; children?: ReactNode }): React.JSX.Element {
  return (
    <div data-ask-keys className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {children}
      <span className="flex-1" />
      <Button type="button" variant="ghost" size="sm" data-ask-cancel className="cursor-pointer" onClick={onCancel}>Cancel <ShadKbd>Esc</ShadKbd></Button>
      <Button type="button" size="sm" variant={danger ? 'destructive' : 'default'} data-ask-go data-sure-yes="" disabled={!ready} className="cursor-pointer" onClick={onGo}>{go} <ShadKbd>↵</ShadKbd></Button>
    </div>
  )
}

type Asked = AskOptions & { question: string; placeholder: string; at: Element | DOMRect | null; review: boolean; answer: (words: string | null) => void }

function Asker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<Asked | null>(null)
  const [words, setWords] = useState('')
  useEffect(() => {
    const onAsk = (event: Event): void => {
      const detail = (event as CustomEvent<Asked>).detail
      chime('open')
      setWords(detail.field === 'tag' ? asTag(detail.initial ?? '') : detail.initial ?? '')
      setAsked(detail)
    }
    window.addEventListener('haligtree:ask', onAsk)
    return () => window.removeEventListener('haligtree:ask', onAsk)
  }, [])
  if (!asked) return null
  const done = (said: string | null): void => {
    if (said?.trim()) chime('tap')
    // Optional, nothing written is an answer (kept without); Escape still is not.
    asked.answer(said?.trim() || (asked.skip && said !== null ? '' : null))
    setAsked(null)
  }
  const go = (): void => {
    if (asked.field !== 'tag') return done(words)
    const kept = words.replace(/-+$/, '')
    if (kept && !isTag(kept)) return void chime('nope')
    done(kept)
  }
  const keys = (event: React.KeyboardEvent): void => {
    event.stopPropagation()
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) (event.preventDefault(), go())
  }
  const { title, hint } = askParts(asked.question)
  return (
    <AskSheet at={asked.at} review={asked.review} label={asked.question} onLeave={() => done(null)} data-ask="">
      <AskHead title={title} hint={hint} />
      {asked.field === 'tag' ? (
        // A tag: the "#" drawn in the field, fixed, so it is never a question whether to type it.
        <HashField data-ask-field value={words} onChange={setWords} placeholder={asked.placeholder} aria-label="Tag" className={ASK_FIELD} onKeyDown={keys} />
      ) : asked.field ? (
        // Who said it before, completing as you type: it gets quicker with use.
        <Remembered data-ask-field field={asked.field} value={words} onChange={setWords} placeholder={asked.placeholder} className={ASK_FIELD} onKeyDown={keys} />
      ) : (
        <input data-ask-field className={ASK_FIELD} placeholder={asked.placeholder} value={words} onChange={(event) => setWords(event.target.value)} onKeyDown={keys} />
      )}
      <AskFoot go={asked.action} ready={!!words.trim() || !!asked.skip} onGo={go} onCancel={() => done(null)}>
        {asked.skip && <Button type="button" variant="ghost" size="sm" data-ask-skip className="-ml-1 cursor-pointer text-muted-foreground" onClick={() => done('')}>{asked.skip}</Button>}
        {asked.instead && <Button type="button" variant="ghost" size="sm" data-ask-instead className="cursor-pointer text-muted-foreground" onClick={() => { const run = asked.instead!.run; done(null); run() }}>{asked.instead.label}</Button>}
      </AskFoot>
    </AskSheet>
  )
}

/** A yes or no, asked in the same sheet as a question: true for `yes`, false for Cancel, Escape or a click away. */
export const askSure = (question: string, detail: ReactNode, yes: string, { at, danger = false }: { at?: Element | null; /** It deletes or replaces: the button in the red tint. */ danger?: boolean } = {}): Promise<boolean> =>
  new Promise((answer) => void window.dispatchEvent(new CustomEvent('haligtree:sure', { detail: { question, detail, yes, danger, at: at ?? opener(), review: inReview(at), answer } })))

function SureAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ question: string; detail: ReactNode; yes: string; danger: boolean; at: Element | DOMRect | null; review: boolean; answer: (ok: boolean) => void } | null>(null)
  useEffect(() => {
    const onAsk = (event: Event): void => (chime('open'), setAsked((event as CustomEvent).detail))
    window.addEventListener('haligtree:sure', onAsk)
    return () => window.removeEventListener('haligtree:sure', onAsk)
  }, [])
  if (!asked) return null
  const answer = (ok: boolean): void => {
    chime(ok ? 'tap' : 'fold')
    asked.answer(ok)
    setAsked(null)
  }
  return (
    <AskSheet at={asked.at} review={asked.review} label={asked.question} onLeave={() => answer(false)} data-sure="" role="alertdialog"
      // Its keys stay its own; Enter presses the button that has the focus (the yes, at first), as a button does.
      onKeyDown={(event) => event.stopPropagation()}>
      <AskHead title={asked.question} hint={asked.detail} />
      <AskFoot go={asked.yes} danger={asked.danger} onGo={() => answer(true)} onCancel={() => answer(false)} />
    </AskSheet>
  )
}


/** When anything was last typed into a field or the editor. */
let lastEdit = 0

// What a toast must never cover: an open dialog, sheet or menu, and the
// footer (and its Keys panel) of a view that fills the window, like Read through,
// and the composer pinned under a page, where you are typing.
// The page's hint line at its foot is stepped round too: a notice sat over its words, text over text (16 Nov 2026).
// So are a note's word counts while they show (count/word-count.tsx): the picked words' at the foot of the note, the
// whole note's past its last line. A notice sat over them (18 Nov 2026).
const PANELS = '[role="dialog"],[role="alertdialog"],[role="menu"],[data-slot="sheet-content"],[data-slot="popover-content"],[data-composer],[data-hint-line],[data-picked-count]:not([data-on-words]),.tiptap-word-count[data-clear]'

/**
 * Where the toast goes, clear of open panels: its usual place at the bottom
 * when that is free, else just under them, else just above them, else at the top.
 * Checked while something is shown, so a panel opening under it moves it.
 */
/** The toast stepping aside for a celebration: a glide on a transform, not a jump. */
const STEP_ASIDE = 'transform 220ms var(--mf-ease)'

function useClearSpot(on: boolean, lane: React.RefObject<HTMLDivElement | null>): { spot: React.CSSProperties | undefined; style: React.CSSProperties | undefined } {
  const [spot, setSpot] = useState<React.CSSProperties>()
  // Whether it has been placed since it came up: 0 not yet, 1 just now, 2 since. Its place is first read two frames
  // after it comes (below), and in those frames it stood at its usual place, over the hint line, then glided up over
  // it (18 Nov 2026). So it waits unseen until it is placed, and its first placing is a jump, not a glide.
  const [placed, setPlaced] = useState<0 | 1 | 2>(0)
  // When the notice came back out from under a menu (-1 while it is under one, 0 once it is fully back).
  const held = useRef(0)
  useEffect(() => {
    // Gone: it leaves from where it stood (put back at once, a leaving one glided down over the hint line as it faded),
    // and the next is placed afresh.
    if (!on) return void setPlaced(0)
    const check = (): void => {
      const { innerWidth: width, innerHeight: height } = window
      const boxes: DOMRect[] = []
      // A menu or a popover is stepped round by holding still and fading, never by moving: a toast that flew up over a
      // context menu opened on it, then went, read as a glitch (the user, 15 Nov 2026).
      const menus: DOMRect[] = []
      for (const one of document.querySelectorAll<HTMLElement>(PANELS)) {
        // A menu on its way out (a line in it was just picked, which is often what made the toast)
        // is not stepped round: the toast went over it for a moment, then dropped to the bottom.
        if (one.closest('[data-state="closed"]')) continue
        // A box that is only placed (a bare popover, components/ui/popover.tsx) is as tall as its card's tallest state:
        // what is drawn is its card. Read by the box, a notice under the empty room below the Calendar's popover was
        // hidden, its Undo out of reach while the popover held words.
        const at = (one.classList.contains('mf-pop-hold') ? one.querySelector(':scope > .mf-pop-card') ?? one : one).getBoundingClientRect()
        if (!at.width || !at.height) continue
        if (one.matches('[role="menu"],[data-slot="popover-content"]')) {
          menus.push(at)
          continue
        }
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
      const placed: React.CSSProperties | undefined = !meets.length ? clear
        // Moved from where it would be by a transform: the lane's right edge in to the card
        // (its centred toast goes half as far), or the toast lifted to just above the card.
        : Math.min(...meets.map((at) => at.left)) - left >= 360 ? { ...clear, transform: `translateX(${(Math.min(...meets.map((at) => at.left)) - 12 - right) / 2}px)`, transition: STEP_ASIDE }
        : { ...clear, transform: `translateY(${Math.min(...meets.map((at) => at.top)) - 8 - low}px)`, transition: STEP_ASIDE }
      // Under an open menu where it stands: it fades there and comes back there, never moved. Hidden once faded: the
      // notices sit over menus (z 60 to their 50), and a faded one still took the clicks meant for the menu's lines.
      // Back out as quickly as it went, for a beat after the menu goes: the day's page fades the lane slowly, a beat
      // late (main.css, data-day-aside), which is for writing, not for a menu closing.
      const under = menus.some((at) => at.top < low && at.bottom > low - tall && at.right > middle - half && at.left < middle + half)
      const now = performance.now()
      held.current = under ? -1 : held.current === -1 ? now : held.current && now - held.current < 300 ? held.current : 0
      const quick = [placed?.transition, 'opacity 120ms var(--mf-ease)'].filter(Boolean).join(', ')
      const next: React.CSSProperties | undefined = under ? { ...placed, opacity: 0, visibility: 'hidden', transition: `${quick}, visibility 0s linear 120ms` }
        : held.current ? { ...placed, transition: quick }
        : placed
      setSpot((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next))
      setPlaced((was) => (was ? 2 : 1))
    }
    // Read only once a frame is painted, so it reads the page as already laid out: read in the
    // frame its toast came with (a move to the Bin opening the next note), it laid that note out
    // there and then, 30 to 112ms. First looked a frame on: picking a menu's line shows the toast
    // before that menu has begun to close.
    let off = afterPaint(() => (off = afterPaint(check)))
    const timer = setInterval(() => (off(), (off = afterPaint(check))), 150)
    return () => (off(), clearInterval(timer))
  }, [on])
  const style: React.CSSProperties | undefined = !on ? spot : !placed ? { ...spot, visibility: 'hidden', transition: 'none' } : placed === 1 ? { ...spot, transition: 'none' } : spot
  return { spot, style }
}

/** How many notice areas this window has up: with none, a failed save is said on the nudge card instead (main.tsx). */
export let toasters = 0

export function Toaster(): React.JSX.Element | null {
  const [shown, setShown] = useState<{ text: string; undo?: () => void; tone?: ToastTone; action?: ToastAction; made?: Made; key: number } | null>(null)
  const shownNow = useRef(shown)
  shownNow.current = shown
  // The steps ⌘Z holds besides the notice's own, oldest first: changes made quietly, and the Undo of each notice a
  // newer one took the place of, so ⌫ twice then ⌘Z twice brings both back, newest first. Kept a while after the last.
  const [held, setHeld] = useState<{ undo: () => void; key: number; nudge?: boolean }[]>([])
  const heldClock = useRef<ReturnType<typeof setTimeout>>(undefined)
  const keepHeld = (): void => (clearTimeout(heldClock.current), void (heldClock.current = setTimeout(() => setHeld([]), 10000)))
  /** The notice's time is up: it goes, and with its Undo every older step held (⌘Z never takes one back out of turn). */
  const expire = (): void => {
    const gone = shownNow.current
    setShown(null)
    if (gone?.undo) setHeld((was) => was.filter((one) => one.key > gone.key))
  }
  const [wait, setWait] = useState<{ label: string; state: OrbState; job?: string } | null>(null)
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
  // A job main ran stopped with nothing kept (an import): said as every “Stop” says it.
  useEffect(() => {
    const onStopped = (event: Event): void => toast((event as CustomEvent<string>).detail, undefined, 'info')
    window.addEventListener('haligtree:job-stopped', onStopped)
    return () => window.removeEventListener('haligtree:job-stopped', onStopped)
  }, [])
  // The first launch after the rename: the notes were copied in from the old folder, kept as it was (main/old-data.ts).
  useEffect(() => {
    const onMoved = (event: Event): void => {
      chime('settled')
      toast(`Your notes from Vigil are here. The old copy is kept in ${(event as CustomEvent<string>).detail} as a backup`, undefined, 'success')
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
    at.timer = setTimeout(() => (at.timer = undefined, at.left = 0, expire()), at.left)
  }, [])
  useEffect(() => {
    const blur = (): void => hold('blur')
    const focus = (): void => release('blur')
    const seen = (): void => (document.hidden ? hold('hidden') : release('hidden'))
    // A note being opened again from the book (lib/same-words.ts `reread`): the notice of what changed it waits until
    // the note is drawn, so a long one's seconds of reading never use up the time to reach its Undo.
    const drawing = (event: Event): void => ((event as CustomEvent<boolean>).detail ? hold('drawing') : release('drawing'))
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', seen)
    window.addEventListener('haligtree:note-drawing', drawing)
    return () => {
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', seen)
      window.removeEventListener('haligtree:note-drawing', drawing)
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
      // A notice over one that had an Undo: that Undo stays ⌘Z's, a step behind this one's (if it has one).
      const before = shownNow.current
      if (before?.undo && before.undo !== detail.undo) window.dispatchEvent(new CustomEvent('haligtree:undoable', { detail: { undo: before.undo, at: before.key } }))
      setShown({ ...detail, key: Date.now() })
      // Longer when it can be taken back, so the undo is there to reach.
      // A problem stays as long, so what to do about it can be read.
      at.left = detail.undo || detail.action || detail.tone === 'error' || detail.tone === 'warning' ? 6000 : 3200
      at.since = Date.now()
      // A new toast is not under the pointer yet, whatever the old one was, nor its menu open.
      at.held.delete('pointer')
      at.held.delete('menu')
      if (document.hidden) at.held.add('hidden')
      if (!at.held.size) at.timer = setTimeout(() => (at.timer = undefined, at.left = 0, expire()), at.left)
    }
    // A save that failed on the way to the database says so, rather than the
    // success toast just never coming.
    const onFail = (event: PromiseRejectionEvent): void => {
      const message = String(event.reason?.message ?? event.reason ?? '')
      if (message.includes('Error invoking remote method')) refuse(`Not saved: ${whyFailed(event.reason)}.`, 'error')
    }
    // Closed by whoever showed it; with words given, only while those words are the ones shown.
    const onGone = (event: Event): void => {
      const text = (event as CustomEvent<{ text?: string } | null>).detail?.text
      if (text && shownNow.current?.text !== text) return
      stop()
      setShown(null)
    }
    window.addEventListener('haligtree:toast', onToast)
    window.addEventListener('haligtree:untoast', onGone)
    window.addEventListener('unhandledrejection', onFail)
    toasters++
    return () => {
      toasters--
      stop()
      window.removeEventListener('haligtree:untoast', onGone)
      window.removeEventListener('haligtree:toast', onToast)
      window.removeEventListener('unhandledrejection', onFail)
    }
  }, [])
  // A change made without a toast (quietly), or a notice's Undo a newer notice took the place of: held out of sight, for ⌘Z.
  useEffect(() => {
    const hold = (one: { undo: () => void; key: number; nudge?: boolean }): void => (setHeld((was) => [...was, one].sort((a, b) => a.key - b.key)), keepHeld())
    const onHeld = (event: Event): void => {
      const { undo, at } = (event as CustomEvent<{ undo: () => void; at?: number }>).detail
      hold({ undo, key: at ?? Date.now() })
    }
    window.addEventListener('haligtree:undoable', onHeld)
    // An answer on a nudge card or the focus pill (their windows rarely have the keys): ⌘Z here
    // takes it back, until their own Undo did (said with no words).
    const offNudge = window.api?.onFloatUndoable?.((words) => {
      if (!words) return setHeld((was) => was.filter((one) => !one.nudge))
      hold({ undo: () => window.api.floatUndo(), key: Date.now(), nudge: true })
    })
    return () => (clearTimeout(heldClock.current), offNudge?.(), window.removeEventListener('haligtree:undoable', onHeld))
  }, [])
  // The toast's next step on its own key, while it is up and you are not writing: a tool's key
  // (lib/tool-keys.ts), asked before the app's own, so a toast's C is never also a new capture.
  useToolKeys(shown?.action ? (event) => {
    if (!shown.action || event.metaKey || event.ctrlKey || event.altKey || typing() || event.key.toLowerCase() !== shown.action.key.toLowerCase()) return false
    setShown(null)
    shown.action.run()
    return true
  } : null)
  // ⌘Z takes back what the toast offers (or the newer quiet change), outside a
  // field or the editor, which keep their own undo.
  useEffect(() => {
    // Whichever came last is what ⌘Z takes back; the next ⌘Z, the one before it.
    const top = held.at(-1)
    const back = top && (!shown?.undo || top.key > shown.key) ? top : shown?.undo ? { undo: shown.undo, key: shown.key } : null
    if (!back && !shown?.action) return
    const undo = (): void => {
      if (!back) return
      chime('undo')
      quietFor(UNDO_HUSH)
      back.undo()
      if (back === top) setHeld((was) => was.filter((one) => one !== top))
      else setShown(null)
      keepHeld()
    }
    const onKey = (event: KeyboardEvent): void => {
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
  const left = useRecordingsLeft()
  const { spot, style } = useClearSpot(!!shown || !!wait || !!trouble || !!left.one, lane)
  // Hidden under an open menu, the notice's clock stops, as it does with the window away: its words and its Undo are
  // still there to read when the menu goes (its 3.2 s ran out unseen under a menu otherwise).
  const covered = !!shown && spot?.visibility === 'hidden'
  useEffect(() => (covered ? hold('covered') : release('covered')), [covered, hold, release])
  // Asker always in the same place, so a toast coming or going never
  // remounts it and loses a question being answered.
  return (
    <>
    <Asker />
    <SureAsker />
    <KindAsker />
    <QuestionAsker />
    <BookAsker />
    <VaultPicker />
    <ImportFolders />
    <ImportDoneCard />
    <ApkgAskSheet />
    <GoalAsker />
    <MilestoneAsker />
    <RestoreAsker />
    <Beam />
    {wait && !wait.job && !shown && <div style={style} className="pointer-events-none fixed right-[var(--toast-right,0px)] bottom-[var(--toast-bottom,1.25rem)] left-[var(--toast-left,0px)] z-[60] flex justify-center">
      <Orb state={wait.state} label={wait.label} className="bg-popover shadow-(--mf-panel-shadow) animate-in fade-in-0 slide-in-from-bottom-2 duration-200" />
    </div>}
    {/* Centred along the bottom, where the eye drops after acting. It
        leaves the way it came, and a new one takes its place at once. */}
    <div ref={lane} style={style} className="pointer-events-none fixed top-[var(--toast-top,auto)] right-[var(--toast-right,0px)] bottom-[var(--toast-bottom,1.25rem)] left-[var(--toast-left,0px)] z-[60] flex flex-col items-center gap-2 transition-[bottom] duration-200 ease-[var(--mf-ease)] motion-reduce:transition-none">
    {/* Words not saved yet: one line above the toasts, up until they are in. */}
    <SaveTroubleLine />
    <ImportProgress />
    {/* A job that can be stopped keeps its “Stop” in reach above any toast, never hidden behind one. */}
    {wait?.job && <Orb state={wait.state} label={wait.label} stop={() => stopJob(wait.job!)} className="bg-popover shadow-(--mf-panel-shadow) animate-in fade-in-0 slide-in-from-bottom-2 duration-200" />}
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
      {shown.made ? (() => {
        const made = shown.made
        // What it made, one click away: the words open it (⌥ to the side), a right click offers the row's ways in.
        return (
          <RowMenu items={madeMenu(made, () => setShown(null))} onOpenChange={(open) => (open ? hold('menu') : release('menu'))}>
            <span
              role="link"
              tabIndex={0}
              data-toast-made={`${made.type}:${made.id}`}
              className={`${shown.text.length > 40 ? 'min-w-[min(13rem,100%)] flex-1' : 'min-w-0'} ${shown.undo || (shown.action && shown.tone !== 'error') ? 'line-clamp-3' : ''} cursor-pointer text-pretty wrap-break-word decoration-muted-foreground/50 underline-offset-2 hover:underline`}
              title={shown.undo || shown.action ? shown.text : undefined}
              onClick={(event) => (setShown(null), openMade(made, event.altKey))}
              onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), setShown(null), openMade(made, event.altKey))}
            >{shown.text}</span>
          </RowMenu>
        )
      })() : <span className={`${shown.text.length > 40 ? 'min-w-[min(13rem,100%)] flex-1' : 'min-w-0'} ${shown.undo || (shown.action && shown.tone !== 'error') ? 'line-clamp-3 text-pretty wrap-break-word' : 'text-pretty wrap-break-word'}`} title={shown.undo || shown.action ? shown.text : undefined}>{shown.text}</span>}
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
          <span className="underline decoration-muted-foreground/50 underline-offset-2 group-hover/act:decoration-foreground">{shown.action.label}</span> <kbd className="ml-0.5 font-sans text-key text-muted-foreground">{shown.action.key}</kbd>
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
            keepHeld()
          }}
        >
          Undo <kbd className="ml-0.5 font-sans text-key text-muted-foreground">⌘Z</kbd>
        </button>
      )}
    </motion.div>}
    </AnimatePresence>
    {/* Last, at the lane's foot: a toast comes above it, so “Keep” and “Discard” never move under the hand. */}
    <RecordingLeftLine left={left} />
    </div>
    </>
  )
}

/**
 * A scrolling area that eases, as Lenis does it: the wheel and trackpad move
 * toward where you sent them over a few frames instead of in fixed jumps. The
 * editor scrolls itself and is left alone; this is the lists and pages.
 */
/**
 * A page with a side column docked at its right edge, full height, its
 * hairline on the left, as a book's panel in Media and the reader sit: the
 * page's own column scrolls by itself at the left (on the same left edge as
 * the line above), the side column holds still and scrolls inside itself
 * only when it holds more than the window. For a `Page` with `dock`.
 */
export function Docked({ side, children }: { side: ReactNode; children: ReactNode }): React.JSX.Element {
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  useSmooth(box)
  return (
    <div className="page-dock" data-page-dock>
      <div className="page-dock-main">
        <div ref={setBox} className="page-dock-scroll" data-page-dock-scroll>
          <div className="page-dock-column">{children}</div>
        </div>
        <BackToTop target={box} />
      </div>
      {side}
    </div>
  )
}

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
      // Still the box its lists scroll in, said so for whoever looks for it by its overflow (lib/note-place.ts scrollerOf).
      box.toggleAttribute('data-scroll-held', fits)
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
      box.removeAttribute('data-scroll-held')
    }
  }, [box])
}

/** The root's smooth-scroll word changing (lib/haligtree.ts sets it from Settings). */
const watchSmoothSetting = (changed: () => void): (() => void) => {
  const watch = new MutationObserver(changed)
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-smooth-scroll'] })
  return () => watch.disconnect()
}

/** Whether pages glide when scrolled (Settings' smoothScroll), kept live: the note menu's tick reads it. */
export const useSmoothScrollOn = (): boolean => useSyncExternalStore(watchSmoothSetting, () => document.documentElement.dataset.smoothScroll !== 'off')

/** The same easing on any scrolling box, whose first child is what scrolls. */
export function useSmooth(box: HTMLElement | null): void {
  useScrollOnlyWhenNeeded(box)
  // "Smooth scrolling" in a note's "…" menu (Settings' smoothScroll, said on the root): off, the box scrolls as the Mac does.
  const plain = useSyncExternalStore(watchSmoothSetting, () => document.documentElement.dataset.smoothScroll === 'off')
  useEffect(() => {
    const wrapper = box
    if (!wrapper || still() || plain) return
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
  }, [box, plain])
}
const smooth = new WeakMap<HTMLElement, Lenis>()

/**
 * Brings a scrolling box to `top`: a glide with Motion on (through the box's own
 * smooth scrolling, so the two never fight), there at once with it off.
 */
/** Straight to a place, no glide: through the box's smooth scrolling when it has one, which otherwise takes a plain scrollTop back to where it was heading. */
export function jumpTo(box: HTMLElement, top: number): void {
  const lenis = smooth.get(box)
  if (lenis) lenis.scrollTo(top, { immediate: true, force: true })
  else box.scrollTop = top
}
export function glideTo(box: HTMLElement, top: number): void {
  const lenis = smooth.get(box)
  // Motion or "Smooth scrolling" can be turned off after the box was set up to glide.
  const calm = !glides()
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
  // In a narrow column (the list beside a note) the arrow alone: two "Top"s side by side read as one word said twice (11 Nov).
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const box = target
    setShown(false)
    if (!box) return
    // The scroll read in the scroll event itself, where the page is already laid out, with the box's height kept
    // from its resizes: read in the next frame's callback instead, after pages and rows had changed, it made the
    // whole page lay itself out again in the middle of a fast scroll.
    // Its height first read when the size watch tells of it, once laid out: read here, as the page mounted, it laid it all out there and then.
    let height = Infinity
    const sized = new ResizeObserver(() => ((height = box.clientHeight), setNarrow(box.clientWidth < 512)))
    sized.observe(box)
    const check = (): void => setShown(box.scrollTop > height * 1.5)
    box.addEventListener('scroll', check, { passive: true })
    return () => (box.removeEventListener('scroll', check), sized.disconnect())
  }, [target])
  return (
    // Bottom right, in a strip of its own, so the spring can own the button's transform.
    // Over a bar floated at the foot (main.css [data-docked]), it rises above the bar.
    <div data-back-to-top className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-end pr-5">
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
          className={`pointer-events-auto flex items-center gap-1.5 rounded-full border bg-popover text-control text-muted-foreground shadow-(--mf-panel-shadow) transition-colors hover:bg-accent hover:text-foreground ${narrow ? 'size-8 justify-center' : 'py-1 pr-3 pl-2.5'}`}
        >
          <ArrowUp className="size-3.5" />{!narrow && ' Top'}
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
    // A different number is never a slip of a key: "The Law Book, p. 83" stays p. 83 beside a p. 93 used before.
    const digits = (text: string): string => text.replace(/\D/g, '')
    return typed.length >= 4 ? values.find((one) => digits(one) === digits(typed) && near(one.toLowerCase(), typed)) : undefined
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
        className={cn('rounded-md bg-transparent text-muted-foreground outline-none placeholder:text-muted-foreground hover:bg-accent/50 focus:bg-accent/50 focus:text-foreground', className, ahead && 'min-w-0')}
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
  toast(`A quote keeps who said it. Clear ${quoted(name, 80)} anyway?`, undefined, 'warning', {
    label: 'Clear it', key: 'C',
    run: () => void clear().then(() => (chime('off'), toast(`Cleared ${name}`, undefined, 'success')))
  })
}

/**
 * Who said it, asked in place: one key from a search result opens it, Enter
 * keeps it, Escape leaves it as it was. "Unattributed" beside it, as the sheet
 * asking for a gem's source has: not known is an answer, never asked again.
 */
export function AskWho({ id, initial = '', onDone }: { id: string; initial?: string; onDone: (who?: string) => void }): React.JSX.Element {
  // Starts from the name it has, so a fix is an edit rather than a retype.
  const [who, setWho] = useState(initial)
  const keep = (name: string): void => {
    void haligtree.setCapture(id, 'attribution', name || null)
    onDone(name)
  }
  return (
    <div data-ask-who className="flex items-center gap-1">
      <Remembered
        autoFocus
        field="attribution"
        value={who}
        onChange={setWho}
        placeholder="Who said it?  ↵"
        className="min-w-0 flex-1 px-1.5 py-0.5 text-control"
        onBlur={() => onDone()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') onDone()
          if (event.key !== 'Enter') return
          event.preventDefault()
          // Emptied and Enter clears it: a wrong name can be taken off, once asked.
          if (!who.trim() && initial.trim()) return void (askClearWho(initial.trim(), () => haligtree.setCapture(id, 'attribution', null), () => setWho(initial)), onDone(initial.trim()))
          keep(who.trim())
        }}
      />
      {/* Pressed without taking the focus from the field, so its blur does not close the line first. */}
      <button type="button" data-ask-who-unattributed className="shrink-0 cursor-pointer rounded-md px-2 py-0.5 text-meta text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        onPointerDown={(event) => event.preventDefault()} onClick={() => keep(UNATTRIBUTED)}>{UNATTRIBUTED}</button>
      {/* Never a quote at all: a note again, with Undo, and the line closes. */}
      <button type="button" data-ask-who-not-quote className="shrink-0 cursor-pointer rounded-md px-2 py-0.5 text-meta text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        onPointerDown={(event) => event.preventDefault()} onClick={() => void call<{ kind: string; fields: string | null } | null>('notes:kind', 'captures', id, 'note').then((was) => { onDone(); if (was) (chime('retag'), toast('Not a quote: kept as a note of yours', () => void call('notes:kind:undo', 'captures', id, was))) })}>Not a quote</button>
    </div>
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
export const TipPlace = createContext<{ side?: 'top' | 'bottom'; clearTop?: number; /** Room kept from the edges, for a window whose edge is a card's (the session bubble): a tip sits inside it, never against it. */ inset?: number; /** Told as a tip opens and closes, for a window to make room for it. */ onShow?: (open: boolean) => void }>({})

/**
 * What a trigger around a tip hands it (a right-click menu's `asChild`, a popover's): its handlers and its ref, passed
 * on to the control. Without them a row inside a tip inside a right-click menu never opened its menu, so a sidebar
 * group's "Rename…" could not be reached (qa/group-rename.mjs).
 */
type Handed = Omit<React.HTMLAttributes<HTMLElement>, 'children'> & { ref?: React.Ref<HTMLElement> }

export function Tip({ label: given, offset, side, children, ...handed }: { label: ReactNode; /** Space between the tip and its control, for a control that grows on hover. */ offset?: number; /** Where it opens: above unless said; a menu line's opens to its right. */ side?: 'top' | 'right' | 'bottom' | 'left'; children: React.ReactElement<{ 'aria-label'?: string; children?: ReactNode }> } & Handed): React.JSX.Element {
  // Its keys as you press them now, if you changed them in Settings.
  useKeyChanges()
  const label = typeof given === 'string' ? withKeys(given) : given
  // No words is a tip that stays shut, never the control bare: the control must
  // keep the same parents whether its tip has words or not. A tip that went
  // quiet as a menu opened (a folder's row, while its menu is up) dropped the
  // tooltip around it, so React made the row, and the right-click menu's
  // trigger inside it, anew; the new trigger had forgotten the pointer and the
  // menu opened at 0,0, the window's corner (qa/menu-anchor.mjs).
  if (!label) return <Tipped label="" offset={offset} side={side} handed={handed}>{children}</Tipped>
  // A plain-text tip names an icon-only button, so it can be read out, not
  // only hovered. A button with words of its own keeps them as its name.
  const worded = Children.toArray(children.props.children).some((child) => typeof child === 'string' || typeof child === 'number')
  // A plain span or div so named is a mark (a repeat sign, a colour bar):
  // read out as a picture with that name, since a name on a bare span is skipped.
  const wordsIn = (node: ReactNode): boolean => Children.toArray(node).some((one) => typeof one === 'string' || typeof one === 'number' || (isValidElement<{ children?: ReactNode }>(one) && typeof one.type === 'string' && wordsIn(one.props.children)))
  const mark = (children.type === 'span' || children.type === 'div') && !(children.props as { role?: string }).role && !wordsIn(children.props.children)
  const named = typeof label === 'string' && !worded && !children.props['aria-label'] ? cloneElement(children, { 'aria-label': label, ...(mark ? { role: 'img' } : {}) } as object) : children
  return <Tipped label={label} offset={offset} side={side} handed={handed}>{named}</Tipped>
}

/**
 * A tip never repeats what the control already shows: worded the same as its
 * visible words it stays shut, and "Settings  ⌘," over a row that says
 * Settings shows only ⌘,. Checked on opening, so a row that is an icon at one
 * width and words at another gets its tip only when it needs one.
 */
function Tipped({ label, offset, side, handed: { ref: outer, ...handed } = {}, children }: { label: ReactNode; offset?: number; side?: 'top' | 'right' | 'bottom' | 'left'; handed?: Handed; children: React.ReactElement }): React.JSX.Element {
  const trigger = useRef<HTMLButtonElement>(null)
  // The tip's own ref and the one handed to it, both given the control; kept steady, as Radix stores the trigger it is given.
  const both = useCallback((el: HTMLButtonElement | null) => {
    trigger.current = el
    if (typeof outer === 'function') outer(el)
    else if (outer) (outer as React.RefObject<HTMLElement | null>).current = el
  }, [outer])
  const [open, setOpen] = useState(false)
  const place = useContext(TipPlace)
  // Words gone while it is up (a menu opened from its control): it shuts, and says so.
  useEffect(() => void (!label && open && (setOpen(false), place.onShow?.(false))), [label, open, place])
  // Kept as it closes, so the tip fades out with its words still in it.
  const [shown, setShown] = useState<ReactNode>(label)
  const onOpenChange = (next: boolean): void => {
    // No tip while a format bar is up, while a drag is picking words, or from outside a popover that holds the stage
    // (its own controls keep theirs): one floating thing at a time.
    if (next && (!label || formatBarShown() || pickingWords() || (staged > 0 && !trigger.current?.closest('[data-takes-keys]')))) return
    place.onShow?.(next)
    if (!next || typeof label !== 'string') return (setShown(next ? label : shown), setOpen(next))
    const seen = (trigger.current?.innerText ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    const said = label.toLowerCase()
    // Words already on show need no tip, unless they are cut off: then the tip gives them whole.
    const cut = (el: Element | null): boolean => !!el && [el, ...el.querySelectorAll('*')].some((one) => one.scrollWidth > one.clientWidth + 1 || one.scrollHeight > one.clientHeight + 2)
    if (seen && said === seen && !cut(trigger.current)) return (place.onShow?.(false), setOpen(false))
    // Two spaces part a name from its keys, so what is left after them is only keys.
    setShown(seen && said.startsWith(`${seen}  `) ? label.slice(seen.length) : label)
    setOpen(true)
  }
  return (
    <Tooltip open={open && !!label} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild {...handed} ref={both}>{children}</TooltipTrigger>
      <TooltipContent sideOffset={offset} side={side ?? place.side} {...(place.clearTop || place.inset ? { collisionPadding: { top: place.clearTop ?? place.inset ?? 8, right: place.inset ?? 8, bottom: place.inset ?? 4, left: place.inset ?? 8 } } : {})}>{typeof shown === 'string' ? <TipText text={shown} /> : shown}</TooltipContent>
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
 * A picture in a grid or a list, whole in the first frame it is drawn: decoded before the page it is on first paints,
 * the page waiting a moment at most (lib/decoded.ts `useDecoded`), never loaded lazily or faded in. A grid or a list
 * that comes in after its page holds itself for its pictures the same way inside a `ReadsIn`. `ahead` false: a picture
 * far down a long grid, loaded as it nears the screen, so a grid of thousands never decodes them all at once.
 */
export function Decoded({ src, ahead = true, alt = '', ...rest }: Omit<React.ComponentProps<'img'>, 'src' | 'loading'> & { src: string; ahead?: boolean }): React.JSX.Element {
  useDecoded(ahead ? src : null)
  return <img src={src} alt={alt} draggable={false} decoding="async" loading={ahead ? undefined : 'lazy'} {...rest} />
}
/** How many of a long grid's pictures are drawn whole in its first frame: more than a window shows at once. */
export const FIRST_PICTURES = 30

/**
 * A long list that draws only the rows in view, with TanStack Virtual. It
 * scrolls with whatever box holds it, from where it sits in that box, so it can
 * sit under cards or headings; the keyboard's row is scrolled to even before it
 * is drawn, so gg and G land.
 */
/** A list longer than this measures its new rows once laid out, not as they come in. */
const LAZY = 500

/**
 * Whether a row that changed height moves the scroll by as much: only a row
 * above the screen, judged by where it is on the page, not by where the list
 * was last read to start (its scroll margin, read after layout). A list low in
 * a note (its links), measured before its start was known, took its rows for
 * rows above the screen and pushed a note just put back at its place 20px on,
 * gliding. Measured before, only a row wholly above the screen and not while
 * scrolling up, as the virtualizer's own rule (one spanning the edge grows below it).
 */
function aboveScreen(item: VirtualItem, delta: number, list: Virtualizer<HTMLElement, Element>): boolean {
  const row = list.elementsCache.get(item.key)
  const pane = list.scrollElement
  if (!row?.isConnected || !pane) return false
  const edge = pane.getBoundingClientRect().top
  const at = row.getBoundingClientRect()
  return list.itemSizeCache.has(item.key) ? at.bottom - delta <= edge && list.scrollDirection !== 'backward' : at.top < edge
}

export function VirtualList<T>({ items, keyOf, holds, held, cursor, estimate = 48, sizeOf, className = '', rowClass = 'pb-0.5', children }: {
  items: T[]
  /** Whether a row holds this id, where a row is more than one (a line of tiles): its key is asked otherwise. */
  holds?: (item: T, id: string) => boolean
  /**
   * The row in hand while a list's row is carried: kept drawn at its own place however far the list scrolls under the
   * pointer, as the room it opens and the line through it are drawn by that row (carry.tsx `Carried`).
   */
  held?: string | null
  /** A row's height before it is measured, when rows differ (a group's line holds its rows): `estimate` otherwise. */
  sizeOf?: (item: T) => number
  keyOf: (item: T) => string
  /** Each row's own box: a sliver of room under it by default. */
  rowClass?: string
  /** The row the keyboard is on, scrolled into view when it moves. */
  cursor?: number
  estimate?: number
  className?: string
  children: (item: T, index: number) => ReactNode
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const [margin, setMargin] = useState(0)
  // Bumped to place the keyboard's row again, once where the list starts is read afresh.
  const [again, setAgain] = useState(0)
  // The page the list is on waits for its first rows (lib/reads-in.tsx), and so for what they wait on (their pictures):
  // drawn once the list is laid out, after the page had its first say, the rows came into a page already counted
  // ready, and each showed its square a few frames before its picture. Looked once is enough, scroller or none.
  const [looked, setLooked] = useState(false)
  useReading(!looked)
  // The nearest parent that scrolls. Looked for again until found: a list
  // that mounts while its page is still settling (a list emptied into the Bin
  // and brought back with Undo) can find none at first, and with no scroller
  // it would draw no rows at all.
  const findScroller = (now?: boolean): boolean => {
    // A box held still while all it shows fits is found too (scrollerOf): the rows drawn in it are what stop it fitting.
    const parent = box.current ? scrollerOf(box.current) : null
    const take = (): void => (parent && setScroller(parent), setLooked(true))
    if (now) flushSync(take)
    else take()
    return !!parent
  }
  // Looked for once the list is laid out, before that frame is painted, its first rows drawn in the same frame:
  // looked for as it mounted, every list in a pane opening worked out the half-built page's styles again (lib/after-layout.ts).
  useLayoutEffect(() => {
    let again = 0
    const off = box.current ? afterLayout(box.current, () => void (findScroller(true) || (again = window.setInterval(() => findScroller() && clearInterval(again), 100)))) : (setLooked(true), () => undefined)
    return () => (off(), clearInterval(again))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // The list keeps its own place as rows above the screen change height (the
  // virtualizer moves the scroll by as much), so the browser's own anchoring
  // is off in its scroller: both at once, a group opened at the list's end
  // grew upward, its heading sliding away from the pointer, as the browser
  // held the row under it still.
  useLayoutEffect(() => {
    if (!scroller) return
    const was = scroller.style.overflowAnchor
    scroller.style.overflowAnchor = 'none'
    return () => void (scroller.style.overflowAnchor = was)
  }, [scroller])
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
    // Taken up by its scroller where that scroller already is: the virtualizer otherwise scrolls it to where it
    // thought it was (the top, read before it had a scroller). A list low in a note (its links) found its scroller
    // after the note had gone to a picture, a heading or a search hit, and threw the note back to the top.
    enabled: !!scroller,
    initialOffset: () => scroller?.scrollTop ?? 0,
    estimateSize: (index) => (sizeOf ? sizeOf(items[index]) : estimate),
    overscan: items.length > LAZY ? 4 : 10,
    scrollMargin: margin,
    // Keeping what is on screen still as rows above it change height is done at once, never eased: in a scroller
    // that eases its own scrolls (a note's), the correction glided, and the page drifted under the reader.
    scrollToFn: (offset, options, list) => elementScroll(offset, options.adjustments ? { ...options, behavior: 'instant' } : options, list),
    getItemKey: (index) => keyOf(items[index]),
    // In a long list, a row newly drawn is measured by the observer once laid out, never read at once: read as each
    // row came in, the whole page was laid out there and then (unfolding a 2,500-note folder spent about 30 ms on it).
    // Short lists read at once still: carrying a row in one leans on its rows' heights from the first draw.
    measureElement: (row, seen, list) => {
      const box = seen?.borderBoxSize?.[0]
      if (box) return Math.round(box.blockSize)
      if (!seen) {
        const index = list.indexFromElement(row)
        const known = list.itemSizeCache.get(list.options.getItemKey(index))
        if (known !== undefined) return known
        if (list.options.count > LAZY) return list.options.estimateSize(index)
      }
      return (row as HTMLElement).offsetHeight
    }
  })
  rows.shouldAdjustScrollPositionOnItemSizeChange = aboveScreen
  // The keyboard's row, drawn or not yet: left still if it shows, to the edge
  // for a step, centred for a jump. Asked again once the scroller is found, so
  // a list opened onto a row far down (a link, ⌘K) lands on it too. A frame
  // later, so where the list starts in its scroller is known by then.
  useEffect(() => {
    if (!scroller || cursor === undefined || cursor < 0 || cursor >= items.length) return
    const frame = requestAnimationFrame(() => {
      const row = rows.measurementsCache[cursor]
      if (!row || !scroller.isConnected || !box.current) return
      // A page being put back where it was (Back, another tab: panes.tsx) is already where you left it.
      if (scroller.closest('[data-placing]')) return
      // A row that is a list of its own (a group's): that list places the keyboard's row inside it.
      if (box.current.querySelector(`:scope > div > [data-index="${cursor}"] [data-vlist]`)) return
      // Where the list starts, read now: a list under others that just grew (an island opened above it) has moved
      // since it was last read, and the row would be placed by the old start. Read again, then placed.
      const start = Math.round(box.current.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop)
      if (Math.abs(start - margin) > 1) return void (setMargin(start), setAgain((n) => n + 1))
      // Under a band held at the scroller's top (its scroll-padding, a tag's head), a row is not in view: one stepped
      // to above it stops just under the band.
      const pad = parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0
      const place = rowPlace(row.start, row.end, { top: scroller.scrollTop + pad, bottom: scroller.scrollTop + scroller.clientHeight })
      if (place === 'edge' && pad && row.start < scroller.scrollTop + pad) (scroller.scrollTop = row.start - pad)
      else if (place !== 'still') rows.scrollToIndex(cursor, { align: place === 'edge' ? 'auto' : 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [cursor, scroller, again]) // eslint-disable-line react-hooks/exhaustive-deps
  // “Show in list” (lib/show-in-list.ts): the row asked for scrolled to its place, drawn or not yet.
  const now = useRef({ items, keyOf, holds })
  now.current = { items, keyOf, holds }
  useEffect(() => {
    if (!scroller) return
    const show = (event: Event): void => {
      const id = (event as CustomEvent<string>).detail
      const { items, keyOf, holds } = now.current
      const at = items.findIndex((one) => keyOf(one) === id || !!holds?.(one, id))
      if (at >= 0 && box.current?.isConnected) rows.scrollToIndex(at, { align: 'center' })
    }
    window.addEventListener('haligtree:show-row', show)
    return () => window.removeEventListener('haligtree:show-row', show)
  }, [scroller]) // eslint-disable-line react-hooks/exhaustive-deps
  const drawn = rows.getVirtualItems()
  // Out of the rows drawn, the row in hand stands on its own at its place, so the list's flow under it never moves.
  const heldAt = held ? items.findIndex((one) => keyOf(one) === held || !!holds?.(one, held)) : -1
  const away = heldAt >= 0 && !drawn.some((one) => one.index === heldAt) ? rows.measurementsCache[heldAt] : undefined
  return (
    // As tall as the rows drawn and the room kept for those above and below them, never a height of its own: a height
    // set from the measure was a frame or two behind a group folding inside it, so the list stayed long while the group
    // shut, and at the list's end the rows under it rose and then dropped back as the scroll caught up.
    <div ref={box} data-vlist="" className={`relative ${className}`}
      style={{ paddingBottom: Math.max(0, rows.getTotalSize() - (drawn.length ? drawn[drawn.length - 1].end - margin : 0)) }}>
      {/* The rows on show stand one under the other, in the page's own flow from where the first one starts: a row that
          changes height (a group folding, or taking in a dropped row) moves the ones under it in the same frame, never
          drawn over them while the measure catches up. */}
      <div style={{ paddingTop: (drawn[0]?.start ?? margin) - margin }}>
        {drawn.map(({ index, key }) => (
          // A sliver of room under each row, so two lit rows (the open one and the
          // cursor) never touch. Padding, not margin: the measure counts padding.
          <div key={key} data-index={index} ref={rows.measureElement} className={`w-full ${rowClass}`}>
            {children(items[index], index)}
          </div>
        ))}
      </div>
      {away && (
        <div key={away.key} data-index={away.index} className={`absolute inset-x-0 ${rowClass}`} style={{ top: away.start - margin }}>
          {children(items[away.index], away.index)}
        </div>
      )}
    </div>
  )
}

/** How many waves the speaker shows at a level: none at 0, then one, two or three as it gets louder. */
const wavesAt = (on: boolean, level: number): 0 | 1 | 2 | 3 => (!on || level <= 0 ? 0 : level <= 0.34 ? 1 : level <= 0.67 ? 2 : 3)

const WAVES = ['M15.5 10a2.8 2.8 0 0 1 0 4', 'M18 7.6a6.2 6.2 0 0 1 0 8.8', 'M20.5 5.2a9.6 9.6 0 0 1 0 13.6']

/** A speaker that shows the level it plays at: its waves draw in and out as it changes, a cross when it is silent. */
function Speaker({ waves }: { waves: 0 | 1 | 2 | 3 }): React.JSX.Element {
  const calm = still()
  const line = { duration: calm ? 0 : 0.16, ease: EASE }
  return (
    <svg data-waves={waves} viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      {WAVES.map((d, i) => (
        <motion.path key={d} d={d} initial={false} animate={{ pathLength: i < waves ? 1 : 0, opacity: i < waves ? 1 : 0 }} transition={{ ...line, delay: calm ? 0 : i * 0.03 }} />
      ))}
      <motion.g initial={false} animate={{ opacity: waves ? 0 : 1 }} transition={line}>
        <path d="M22 9l-6 6" />
        <path d="M16 9l6 6" />
      </motion.g>
    </svg>
  )
}

/** How long a press is held before it opens the volume: long enough that a quick click never does. */
const HOLD_MS = 350

/**
 * Sounds on or off in one click, from the top of either window. Held, it opens
 * the volume from the button: keep holding and slide to set it (right or up is
 * louder), or let go and use the slider. Each step ticks at its new level, the
 * way a Mac's volume keys do, and the speaker shows it in waves.
 */
export function SoundToggle({ className = '' }: { className?: string }): React.JSX.Element | null {
  const settings = useLive(haligtree.settings, null as Awaited<ReturnType<typeof haligtree.settings>> | null)
  const [open, setOpen] = useState(false)
  const [holding, setHolding] = useState(false)
  // The level as you move it, ahead of the save coming back, so nothing flicks to the old one.
  const [live, setLive] = useState<number | null>(null)
  const press = useRef<{ x: number; y: number; from: number; timer: ReturnType<typeof setTimeout>; opened: boolean; moved: boolean } | null>(null)
  // A press that opened the volume is not a click as well.
  const swallow = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const tick = useRef({ at: -Infinity, timer: undefined as ReturnType<typeof setTimeout> | undefined })
  useEffect(() => () => {
    clearTimeout(saveTimer.current)
    clearTimeout(closeTimer.current)
    clearTimeout(tick.current.timer)
    if (press.current) clearTimeout(press.current.timer)
  }, [])
  const stored = settings?.volume ?? 1
  useEffect(() => void (live !== null && Math.abs(live - stored) < 0.001 && setLive(null)), [stored, live])
  if (!settings) return null
  const on = settings.sounds
  const level = live ?? stored
  const waves = wavesAt(on, level)

  const set = (raw: number): void => {
    const next = Math.round(Math.max(0, Math.min(1, raw)) * 100) / 100
    if (next === level && (on || next === 0)) return
    setLive(next)
    setVolume(next)
    // Turned up from silence: sounds come back on, as a Mac's volume key unmutes it.
    const wake = !on && next > 0
    if (wake) soundOn(true)
    // A soft tick at the new level, at most one every 90ms (and a last one where it stops), the way a Mac's volume
    // keys sound. Out of the event, so a run of arrow keys ticks on each press, not only the first.
    clearTimeout(tick.current.timer)
    const wait = Math.max(0, 90 - (performance.now() - tick.current.at))
    tick.current.timer = setTimeout(() => ((tick.current.at = performance.now()), chime('tap')), wait)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void haligtree.setSettings(wake ? { volume: next, sounds: true } : { volume: next }), 120)
  }

  const up = (): void => {
    const was = press.current
    if (!was) return
    clearTimeout(was.timer)
    press.current = null
    setHolding(false)
    // Slid straight from the hold: let go and it is set, and closes a moment later.
    if (was.opened && was.moved) closeTimer.current = setTimeout(() => setOpen(false), 700)
  }
  const tip = on ? 'Sounds on: click for quiet, hold for volume' : 'Sounds off: click to hear them, hold for volume'
  const calm = still()
  return (
    <Popover open={open} onOpenChange={(next) => (clearTimeout(closeTimer.current), setOpen(next))}>
      <Tip label={tip}>
        <PopoverAnchor asChild>
          <button
            type="button"
            data-sound-toggle
            // Never where the focus lands: opening the window is for typing.
            tabIndex={-1}
            aria-label={on ? 'Turn sounds off' : 'Turn sounds on'}
            style={{ WebkitAppRegion: 'no-drag', touchAction: 'none' } as React.CSSProperties}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              swallow.current = false
              event.currentTarget.setPointerCapture(event.pointerId)
              setHolding(true)
              const timer = setTimeout(() => {
                if (!press.current) return
                press.current.opened = true
                swallow.current = true
                clearTimeout(closeTimer.current)
                setHolding(false)
                setOpen(true)
              }, HOLD_MS)
              press.current = { x: event.clientX, y: event.clientY, from: level, timer, opened: false, moved: false }
            }}
            onPointerMove={(event) => {
              const was = press.current
              if (!was?.opened) return
              // Right or up is louder; about 160px from silent to full.
              const by = (event.clientX - was.x - (event.clientY - was.y)) / 160
              if (!was.moved && Math.abs(by) < 0.02) return
              was.moved = true
              set(was.from + by)
            }}
            onPointerUp={up}
            onPointerCancel={up}
            onLostPointerCapture={up}
            onClick={() => {
              if (swallow.current) return void (swallow.current = false)
              // Set first, so the sound of turning it on is heard.
              soundOn(!on)
              chime(!on ? 'on' : 'off')
              void haligtree.setSettings({ sounds: !on })
            }}
            className={cn('relative', className)}
          >
            {/* The hold building: a ring draws itself round the button, and the volume opens as it closes. */}
            <svg aria-hidden data-hold-ring={holding || undefined} className="pointer-events-none absolute inset-0 size-full! overflow-visible text-foreground/70">
              <rect x="0.75" y="0.75" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5" pathLength={1} strokeDasharray="1 1"
                style={calm
                  ? { width: 'calc(100% - 1.5px)', height: 'calc(100% - 1.5px)', strokeDashoffset: 0, opacity: holding ? 1 : 0, transition: `opacity ${holding ? HOLD_MS : 120}ms ease-out` }
                  : { width: 'calc(100% - 1.5px)', height: 'calc(100% - 1.5px)', strokeDashoffset: holding ? 0 : 1, opacity: holding ? 1 : 0, transition: holding ? `stroke-dashoffset ${HOLD_MS}ms cubic-bezier(0.4, 0, 0.6, 1), opacity 80ms ease-out` : 'stroke-dashoffset 0ms 140ms, opacity 140ms ease-out' }} />
            </svg>
            <Speaker waves={waves} />
          </button>
        </PopoverAnchor>
      </Tip>
      <PopoverContent align="end" sideOffset={6} data-volume-control className={cn('w-56 gap-2 p-3', calm && 'data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100')}
        // The slider takes the keys at once, for the arrows.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[role="slider"]')?.focus({ preventScroll: true })
        }}
        // The button itself is no outside click: a click on it still turns sounds on or off, with the volume kept open.
        onInteractOutside={(event) => void ((event.target as HTMLElement | null)?.closest?.('[data-sound-toggle]') && event.preventDefault())}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-foreground">Volume</span>
          <span data-volume-level className="text-sm text-muted-foreground tabular-nums">{!on ? 'Off' : level <= 0 ? 'Silent' : `${Math.round(level * 100)}%`}</span>
        </div>
        <Slider aria-label="Volume" min={0} max={1} step={0.05} value={[level]}
          onValueChange={([raw]) => {
            clearTimeout(closeTimer.current)
            const next = byKeys() ? Math.round(raw / 0.05) * 0.05 : raw
            // A light trackpad tap at each 5%; silent and full, firmly.
            const notch = Math.round(next / 0.05)
            if (notch !== Math.round(level / 0.05)) stepTap(notch, 0, 20)
            set(next)
          }} />
      </PopoverContent>
    </Popover>
  )
}

/** Whether each rolling text is on screen, told by one watcher that never makes the page lay itself out. */
const inView = new WeakMap<Element, boolean>()
let viewWatch: IntersectionObserver | null = null
const watchView = (el: Element): (() => void) => {
  viewWatch ??= new IntersectionObserver((seen) => seen.forEach((one) => inView.set(one.target, one.isIntersecting)))
  viewWatch.observe(el)
  return () => viewWatch?.unobserve(el)
}

/**
 * Text that rolls into place when it changes: a count that goes up rolls up,
 * one that goes down rolls down, and only the digits that moved turn over,
 * each in a column of its old and new face sliding by its own line height.
 * Words cross-fade with a short slide. All of it is CSS on transform and
 * opacity: nothing is measured, so a roll never lays out the page (the
 * library it replaced read every letter's width, 17 to 50ms a roll). Digits
 * are all one width, so a count never nudges what sits beside it.
 * Still when motion is off, in its first second, off screen or in a hidden
 * window: then it simply takes its new value. A change in the middle of a
 * roll starts a fresh one from the value it was heading for.
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
  // A number arriving with its page is not a change you saw: in its first
  // second it simply takes its value (lib/motion.ts, rule 3).
  const [born] = useState(() => performance.now())
  const el = useRef<HTMLSpanElement>(null)
  const words = typeof text === 'number' ? num(text) : text
  const [roll, setRoll] = useState<{ now: string; was: string | null; up: boolean; n: number; last: string | number }>(() => ({ now: words, was: null, up: true, n: 0, last: text }))
  if (roll.now !== words) {
    const span = el.current
    const calm = still() || (!eager && performance.now() - born < 1000) || document.hidden || !span || !inView.get(span)
    const up = said ?? (typeof text === 'number' && typeof roll.last === 'number' ? text >= roll.last : true)
    setRoll({ now: words, was: calm ? null : roll.now, up, n: roll.n + 1, last: text })
  }
  useEffect(() => watchView(el.current!), [])
  const { now, was, up, n } = roll
  // The roll is over once the last cell to move has settled: its old faces go.
  const settled = (event: React.AnimationEvent): void => {
    if ((event.target as HTMLElement).hasAttribute('data-roll-last')) setRoll((at) => (at.n === n ? { ...at, was: null } : at))
  }
  return (
    <span role="img" ref={el} data-roll="" className={cn('mf-roll', className)} aria-label={now} onAnimationEnd={was === null ? undefined : settled}>
      {was === null ? now : by === 'word' ? wordCells(was, now, up, n) : charCells(was, now, up, n)}
    </span>
  )
}

/** A count's characters line up from the right (12 to 9 turns the last digit), other text's from the left. */
const numeric = (text: string): boolean => /^[\d\s.,:%+−-]*$/.test(text)

/** Each changed character in a clipped cell, its column sliding the new face in as the old one leaves. */
function charCells(was: string, now: string, up: boolean, n: number): React.ReactNode[] {
  const [a, b] = [Array.from(was), Array.from(now)]
  const right = numeric(was) && numeric(now)
  const pad = b.length - a.length
  const old = (i: number): string => (right ? a[i - pad] : a[i]) ?? ''
  const moving = b.map((one, i) => one !== old(i))
  // The digits turn from the right for a count, from the left for words; the last to start ends the roll.
  const order = moving.map((on, i) => (on ? (right ? b.length - 1 - i : i) : -1))
  const final = Math.max(...order)
  let k = 0
  const steps = new Map([...order.entries()].filter(([, at]) => at >= 0).sort((x, y) => x[1] - y[1]).map(([i]) => [i, k++]))
  return b.map((one, i) => {
    if (!moving[i]) return <span key={right ? i - b.length : i} aria-hidden>{one}</span>
    return (
      <span key={`${n}:${i}`} aria-hidden className="mf-roll-cell">
        <span className="mf-roll-col" data-up={up || undefined} data-roll-last={order[i] === final || undefined} style={{ animationDelay: `${steps.get(i)! * 35}ms` }}>
          {one}
          <span className="mf-roll-old">{old(i)}</span>
        </span>
      </span>
    )
  })
}

/** Each changed word fades and slides in over the old one fading out the other way. */
function wordCells(was: string, now: string, up: boolean, n: number): React.ReactNode[] {
  const split = (text: string): string[] => text.split(/(\s+)/)
  const [a, b] = [split(was), split(now)]
  const moving = b.map((one, i) => one !== a[i] && /\S/.test(one))
  const final = moving.lastIndexOf(true)
  let k = 0
  return b.map((one, i) => {
    if (!moving[i]) return <span key={i} aria-hidden>{one}</span>
    const delay = { animationDelay: `${k++ * 22}ms` }
    return (
      <span key={`${n}:${i}`} aria-hidden className="mf-roll-word" data-up={up || undefined}>
        <span className="mf-roll-in" data-roll-last={i === final || undefined} style={delay}>{one}</span>
        {a[i] && /\S/.test(a[i]) && <span className="mf-roll-out" style={delay}>{a[i]}</span>}
      </span>
    )
  })
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
/** Open at first, of the details sidebar's groups: what can be done with a note, where it sits and what it is. The rest wait folded. */
const OPEN_AT_FIRST = new Set(['Status', 'Family', 'Links', 'Details', 'In the margin', 'Words to use'])

export function Island({ title, actions, children, className, compact, name, group, filled }: {
  title?: ReactNode
  /**
   * In a note's details sidebar: whether it holds something written or set.
   * Given, it starts open when it does and folded when it is empty, unless
   * the person has opened or folded it themselves, which is remembered and wins.
   */
  filled?: boolean
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
  if (folds && key) return <FoldingIsland title={title} name={key} filled={filled} actions={actions} className={className}>{children}</FoldingIsland>
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
export const ISLAND = 'mf-island divide-y divide-border/60 overflow-hidden border bg-accent/25'
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
function FoldingIsland({ title, name, filled, actions, className, children }: { title: ReactNode; name: string; filled?: boolean; actions?: ReactNode; className?: string; children: ReactNode }): React.JSX.Element {
  // The person's own choice, when they made one; else open while it holds something.
  const [chosen, choose] = useStoredChoice(`details-open:${name}`)
  const open = chosen ?? filled ?? OPEN_AT_FIRST.has(name)
  const toggle = (): void => {
    chime(open ? 'fold' : 'open')
    choose(!open)
  }
  return (
    <section data-details-group={name} data-open={open ? '' : undefined} className={cn('mt-2 first:mt-0 has-[[data-island-body]:empty]:hidden', className)}>
      <div className="group/fold flex items-center gap-1 px-1">
        <button type="button" aria-expanded={open} onClick={toggle}
          className="-mx-1 flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-left text-foreground hover:bg-accent/60">
          <ChevronRight aria-hidden className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--mf-ease)] motion-reduce:transition-none group-hover/fold:text-foreground', open && 'rotate-90')} />
          <h2 className="min-w-0 truncate text-meta font-semibold"><TermPlain.Provider value>{title}</TermPlain.Provider></h2>
        </button>
        {/* The words fold it; what the name means sits apart, at the end. */}
        {(actions || wordFor(name)) && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {actions}
            <TermInfo text={name} />
          </div>
        )}
      </div>
      <div className="grid" style={{ gridTemplateRows: open ? '1fr' : '0fr' }} inert={!open}>
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
