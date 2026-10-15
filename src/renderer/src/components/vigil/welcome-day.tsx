import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlignCenter, AlignLeft, ArrowUpRight, Captions, ChevronDown, Eye, EyeOff, Flag, Gem, Inbox, ListTodo, Pencil, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { EASE, spring } from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { dayjs } from '../../../../main/dates'
import { Journey } from './goals-view'
import { Flip } from './review-view'
import { Tape } from './tape'
import { CARD, PAPER } from './sticky-note'
import { LAND, typeOf } from './welcome-reel'
import deliveryOfTheKeys from '@/assets/welcome/delivery-of-the-keys.webp'
import { Rolling } from './ui'
import { slashItems } from '@/components/slash/slash-items'
import { Toolbar, ToolbarGroup, ToolbarSeparator } from '@/components/tiptap-ui-primitive/toolbar'
import { Button as ToolButton } from '@/components/tiptap-ui-primitive/button'

/**
 * The parts of "A day with Vigil", the welcome's chapter on what happens once
 * it is in use, each drawn from the app's own: the hint card as the box shows
 * it, Today's sticky note, a goal's road, two Review cards. Pictures only:
 * nothing here takes a click or reads your data.
 */

/** A beat's words: the hour leading the problem's line, the problem struck through once answered, and the answer. */
export function Moment({ hour, problem, answer, answered, children }: { hour: string; problem: string; answer: ReactNode; answered: boolean; children: ReactNode }): React.JSX.Element {
  return (
    <div className="grid h-full w-full grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center gap-x-[clamp(1.5rem,4vw,4rem)]">
      <div className="flex flex-col gap-3">
        <p className={`font-heading text-[clamp(1.25rem,min(2.4vw,3.4vh),1.875rem)] leading-tight transition-colors duration-300 ${answered ? 'text-(--mf-wl-quiet)' : 'text-foreground'}`}>
          {/* When, as a timestamp (as the flow dates its cards), never struck: a bare "Evening." would read as a greeting. */}
          <span data-stamp className="font-sans text-[0.8em] tabular-nums text-(--mf-wl-body)">{hour} ·</span>{' '}
          {/* Answered: struck through in the accent, as a crossed-off line. */}
          <span className={`decoration-primary/70 decoration-2 transition-[text-decoration-color] duration-500 ${answered ? 'line-through' : 'decoration-transparent'}`}>{problem}</span>
        </p>
        <motion.p className="font-heading text-[clamp(1.125rem,min(2.1vw,3vh),1.625rem)] leading-snug text-foreground" initial={false} animate={{ opacity: answered ? 1 : 0, y: answered ? 0 : 4 }} transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: answered ? 0.25 : 0 }}>
          {answer}
        </motion.p>
      </div>
      <div className="flex min-w-0 items-center justify-center">{children}</div>
    </div>
  )
}

const PANEL = 'w-full max-w-[28rem] overflow-hidden rounded-xl border border-foreground/10 bg-popover text-popover-foreground shadow-(--mf-panel-shadow)'

/**
 * The box on an ordinary morning: its header's count of what waits for you,
 * and under the empty line a hint, something kept coming back on its own
 * (hint-card.tsx). Thumbs up asks for a question, and with one it is tested
 * in Review.
 */
export function MorningBox({ shown, tip, asking, question, kept }: { shown: boolean; tip: boolean; asking: boolean; question: string; kept: boolean }): React.JSX.Element {
  const actions = [ArrowUpRight, Pencil, ThumbsUp, ThumbsDown, X, EyeOff]
  return (
    <div className={`${PANEL} relative`}>
      <div className="flex h-9 items-center px-4">
        <span className="mr-auto text-[0.875rem] font-medium text-muted-foreground">Quick capture</span>
        {/* The header's chip, as the box draws it with the side panel shut. */}
        <motion.span className="flex h-5 items-center gap-1 rounded-full bg-accent px-2 text-key leading-none text-muted-foreground" initial={false} animate={{ opacity: shown ? 1 : 0 }}>
          2 to revisit<span>·</span>1 waiting
        </motion.span>
      </div>
      <div data-box-line className="min-h-[3rem] px-6 pt-1 font-heading text-[1.0625rem] text-muted-foreground">
        <span className="mf-ghost-caret -ml-px" />Type anything worth keeping…
      </div>
      <div className="px-6 pb-4">
        <AnimatePresence>
          {shown && !kept && (
            <motion.div key="hint" className="relative rounded-lg border border-[color-mix(in_srgb,var(--tt-brand-color-400)_22%,transparent)] bg-[color-mix(in_srgb,var(--tt-brand-color-400)_10%,transparent)] px-3 py-2.5 text-sm"
              initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2, ease: [0.65, 0, 0.35, 1] } }} transition={{ duration: 0.24, ease: EASE }}>
              <p className="text-foreground">A commonplace book: a notebook of lines worth keeping, copied out by hand.</p>
              {asking ? (
                <div className="mt-2 flex h-8 items-center rounded-md border bg-background px-2.5 text-[0.8125rem]">
                  {question ? <span className="text-foreground">{question}<span className="mf-ghost-caret" data-typing="" /></span> : <span className="text-muted-foreground">Worth testing? Write the question and press Enter</span>}
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-1 text-muted-foreground [&_svg]:size-3.5">
                  <span className="mr-auto text-xs">Saved · a gem</span>
                  {actions.map((Icon, i) => (
                    <span key={i} data-ghost={Icon === ThumbsUp ? 'thumbs' : undefined} className="relative flex size-7 items-center justify-center rounded-md">
                      <Icon />
                      {Icon === ThumbsUp && (
                        <AnimatePresence>
                          {tip && (
                            <motion.span className="absolute bottom-[calc(100%+6px)] left-1/2 z-10 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background"
                              initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={spring.fast}>
                              Worth knowing: test me on it in review<kbd className="ml-2 font-sans opacity-70">⌃⇧↑</kbd>
                            </motion.span>
                          )}
                        </AnimatePresence>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {kept && (
            <motion.p key="toast" className="rounded-lg bg-foreground/[0.06] px-3 py-2 text-[0.8125rem] text-foreground" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: 0.25 }}>
              Now tested: it will come up in review
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** The day's three tasks on the sticky note, the second struck through once ticked. */
const TODAY = ['Send the seminar slides', 'Mark the first-year essays', 'Reply to the journal editor']

/**
 * Today's sticky on the desktop, over another app's window, drawn as plain
 * shapes so it is no one's real app: the paper, the tape, the lean, and a
 * small lift now and then, as the real stickies do.
 */
export function DeskSticky({ on, ticked }: { on: boolean; ticked: boolean }): React.JSX.Element {
  return (
    <div className="relative h-[clamp(14rem,40vh,20rem)] w-full max-w-[30rem]">
      {/* Another app's window: a calm shape, a title bar and some lines. */}
      <div aria-hidden className="absolute inset-0 rounded-xl border border-foreground/10 bg-foreground/[0.04]">
        <div className="flex h-7 items-center gap-1.5 border-b border-foreground/10 px-3">
          {[0, 1, 2].map((i) => <span key={i} className="size-2 rounded-full bg-foreground/15" />)}
        </div>
        <div className="flex flex-col gap-2.5 p-5">
          {[78, 92, 64, 85, 40, 70].map((w, i) => <span key={i} className="h-2 rounded-full bg-foreground/[0.08]" style={{ width: `${w}%` }} />)}
        </div>
      </div>
      <AnimatePresence>
        {on && (
          <motion.div key="sticky" className="absolute top-[18%] right-[6%] h-[11.5rem] w-[13.5rem]"
            initial={{ opacity: 0, y: -24, rotate: -8, scale: 1.04 }} animate={{ opacity: 1, y: [0, 0, -3, 0], rotate: -2.5, scale: 1 }}
            transition={{ ...LAND, y: { duration: 3.2, times: [0, 0.6, 0.75, 1], repeat: Infinity, repeatDelay: 1.6, ease: EASE } }}>
            <div className={CARD} style={{ '--tilt': '0deg', ...PAPER } as unknown as CSSProperties}>
              <Tape />
              <div className="flex items-center gap-1 px-3 pt-2">
                <p className="grow font-medium">Today</p>
                <span className="text-xs text-muted-foreground tabular-nums">{ticked ? '1/3 done' : '0/3 done'}</span>
              </div>
              <ul className="px-3 pt-1 pb-3">
                {TODAY.map((title, i) => {
                  const done = ticked && i === 1
                  return (
                    <li key={title} className="flex items-start gap-2 py-1">
                      <span data-ghost={i === 1 ? 'tick' : undefined} className="mt-[0.2em] grid size-3.5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-150"
                        style={{ borderColor: done ? 'var(--tt-color-text-green)' : 'color-mix(in oklab, var(--muted-foreground) 70%, transparent)', background: done ? 'var(--tt-color-text-green)' : undefined }} />
                      <span className={`relative min-w-0 flex-1 leading-snug ${done ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {title}
                        <motion.span aria-hidden className="absolute top-[55%] left-0 h-px w-full origin-left bg-foreground/50" initial={false} animate={{ scaleX: done ? 1 : 0 }} transition={{ duration: 0.35, ease: EASE }} />
                      </span>
                      {i === 0 && <span className="shrink-0 pt-px text-xs text-muted-foreground tabular-nums">10:00</span>}
                    </li>
                  )
                })}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** The goal on the road, and the line typed in quick capture to log a step on it (+ its name, a colon, what was done). */
const GOAL = 'Finish chapter three'
const GOAL_LOG = '600 words today'
export const GOAL_LINE = `+chapter three: ${GOAL_LOG}`

/**
 * A goal and its road, as the Goals page draws it (Journey): the day it was
 * set, today, the day itself ringed, and above it the box taking a log with
 * "+name:", which lights today's dot.
 */
export function GoalRoad({ line, chip, logged }: { line: string; chip: boolean; logged: boolean }): React.JSX.Element {
  const today = dayjs().format('YYYY-MM-DD')
  const from = dayjs().subtract(40, 'day').format('YYYY-MM-DD')
  const target = dayjs().add(52, 'day').format('YYYY-MM-DD')
  const at = (n: number, body: string): { id: string; body: string; author: 'user'; createdAt: string } => ({ id: body, body, author: 'user', createdAt: dayjs().subtract(n, 'day').hour(19).toISOString() })
  const logs = [at(33, 'Outline, at last'), at(26, '400 words'), at(19, '650 words'), at(12, 'Cut the second section'), at(5, '900 words, a good day'), ...(logged ? [at(0, GOAL_LOG)] : [])]
  return (
    <div className="flex w-full max-w-[30rem] flex-col gap-3">
      {/* The box, taking a log for the goal rather than a capture. */}
      <div className="rounded-xl border border-foreground/10 bg-popover px-5 py-3 text-popover-foreground shadow-(--mf-panel-shadow)">
        <p className="min-h-[1.6em] font-heading text-[1.0625rem] text-foreground">{line}{!logged && <span className="mf-ghost-caret" data-typing="" />}</p>
        <div className="mt-2 flex items-center gap-2">
          <AnimatePresence>
            {chip && (
              <motion.span key="chip" className="flex min-w-0 items-center gap-1.5 rounded-2xl border px-2.5 py-0.5 text-xs text-muted-foreground" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring.fast}>
                <Flag className="size-3.5 shrink-0 text-[var(--tt-brand-color-400)]" />A log for “{GOAL}”
              </motion.span>
            )}
          </AnimatePresence>
          <span className="flex-1" />
          <Button variant="secondary" tabIndex={-1} data-ghost="add-log" className="text-control">{chip ? 'Add log' : 'Create'} <kbd className="font-sans text-key opacity-70">⌘↵</kbd></Button>
        </div>
      </div>
      <div className="rounded-xl border border-foreground/10 bg-popover p-4 text-popover-foreground shadow-(--mf-panel-shadow)">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="font-medium text-foreground">{GOAL}</p>
          <p className="text-xs text-muted-foreground tabular-nums">52 days to go</p>
        </div>
        <Journey from={from} target={target} today={today} logs={logs} />
        <AnimatePresence>
          {logged && (
            <motion.p key="log" className="mt-2 text-[0.8125rem] text-foreground" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
              <span className="text-muted-foreground">Today · </span>{GOAL_LOG}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Two Review cards, the front one turning over to its answer. */
export function EveningReview({ over }: { over: boolean }): React.JSX.Element {
  const face = 'flex h-full min-h-[9rem] flex-col justify-center rounded-xl border bg-popover px-5 py-5 text-popover-foreground shadow-(--mf-panel-shadow)'
  return (
    <div className="relative w-full max-w-[24rem]">
      <div aria-hidden className={`${face} absolute inset-0 translate-x-3 translate-y-3 rotate-2 opacity-60`} />
      <div data-ghost="review" className="relative">
        <Flip over={over} onTurn={() => undefined}
          front={<div className={face}><p className="text-xs text-muted-foreground">Review · 2 due</p><h2 className="mt-1.5 font-heading text-[1.25rem] leading-snug font-semibold text-foreground">What is a commonplace book?</h2></div>}
          back={<div className={face}><p className="text-xs text-muted-foreground">What is a commonplace book?</p><p className="mt-1.5 font-heading text-[1.0625rem] leading-snug text-foreground">A notebook of lines worth keeping, copied out by hand.</p></div>} />
      </div>
    </div>
  )
}

/** The line picked out of the note, and the gem it becomes once tidied into a sentence of its own. */
// Leonardo, Notebooks, section 19, in J. P. Richter's 1883 translation (public domain; assets/welcome/CREDITS.txt).
export const PICKED = 'practice must always be founded on sound theory'
export const REWORDED = 'Practice must always be founded on sound theory. Leonardo, Notebooks, tr. Richter.'

/** The note at one moment of the Write chapter: what has been added to it so far, and where the page is. */
export type NoteShot = {
  /** The hashes typed on the empty line, before the space turns them into a heading. */
  hashes: string; headOn: boolean; head: string
  /** What is typed after "/", the row of the block menu picked as ↓ walks it, and the callout it puts in. */
  slash: string; row: number; callout: boolean; table: number; pic: boolean; caption: string
  /** The picture's own bar, as clicking it shows: there to write its caption. */
  tools: boolean
  /** The line with a link in it, typed so far; then the suggestion list, then the link made. */
  at: string; suggest: boolean; linked: boolean
  folded: boolean
  /** The part of the page kept in view (`data-at`), and the heading lit in the outline. */
  focus: string; lit: number
  /** A line picked out, the bar over it, the gem card, its words, and the gem saved into Gems beside the page. */
  picked: boolean; bar: boolean; card: boolean; edited: string; saved: boolean
}
/** The picture's caption, the line typed with a link in it (up to the words "@" asks with), and the quote it links to. */
export const CAPTION = 'Perugino, The Delivery of the Keys, 1481-82'
export const HEAD = 'Part one'
export const LINK_LINE = 'Worth keeping beside it: @All we'
const LINKED = 'All we have to decide is what to do with the time'
export const NOTE_START: NoteShot = { hashes: '', headOn: false, head: '', slash: '', row: 0, callout: false, table: 0, pic: false, caption: '', tools: false, at: '', suggest: false, linked: false, folded: false, focus: 'top', lit: 0, picked: false, bar: false, card: false, edited: '', saved: false }

/**
 * What "/" offers, from the editor's own list (slash-items.tsx): every block
 * a note can hold, in its groups. The rows that only mean something inside a
 * table, and the exports, are left out, as the menu leaves them out on an empty line.
 */
export const SLASH = slashItems.filter((item) => !item.when)
/** What "/" holds, said in a few plain words: only those the menu really has. */
const KINDS_SAID: [string, string][] = [['Heading 1', 'headings'], ['Bulleted list', 'lists'], ['Checklist', 'checklists'], ['Quote', 'quotes'], ['Code', 'code'], ['Math', 'math'], ['Callout', 'callouts'], ['Two columns', 'columns'], ['Table', 'tables'], ['Image', 'pictures'], ['Drawing', 'drawings'], ['YouTube', 'videos']]
export const SLASH_SAID = KINDS_SAID.filter(([title]) => SLASH.some((item) => item.title === title)).map(([, word]) => word)

/** Who painted what, and what it changed: the note's table. */
export const TABLE = [['Painter', 'Work', 'What it changed'], ['Masaccio', 'Holy Trinity, 1427', 'A flat wall seems to open'], ['Piero', 'The Flagellation, 1460s', 'Space you could measure'], ['Leonardo', 'The Last Supper, 1498', 'Every line leads to Christ']]

/** Seen the picture's bar once: the hint under it is for the first time only. */
let captionHinted = (() => {
  try {
    return localStorage.getItem('welcome-caption-hint') === '1'
  } catch {
    return false
  }
})()

/**
 * The picture, as a note holds it: pointed at, or pressed by the ghost, its
 * own bar shows in its top corner (the editor's image menu: size, alignment,
 * Caption, Look), “Caption” ringed. The first time, a line under the bar says
 * what it does. Press “Caption” and the line under the picture takes the caret.
 */
function NotePicture({ caption, tools }: { caption: string; tools: boolean }): React.JSX.Element {
  const [over, setOver] = useState(false)
  const [hint, setHint] = useState(false)
  const line = useRef<HTMLElement>(null)
  const show = tools || over
  const point = (on: boolean): void => {
    setOver(on)
    if (on && !captionHinted) {
      captionHinted = true
      setHint(true)
      try {
        localStorage.setItem('welcome-caption-hint', '1')
      } catch {
        // Shown again next time; nothing lost.
      }
    }
  }
  const write = (): void => {
    const el = line.current
    if (!el) return
    el.contentEditable = 'plaintext-only'
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    getSelection()?.removeAllRanges()
    getSelection()?.addRange(range)
  }
  const caret = <span className="mf-ghost-caret" data-typing="" />
  return (
    <motion.figure data-at="pic" className="relative mb-4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      onPointerEnter={() => point(true)} onPointerLeave={() => point(false)}>
      <div data-picture className="relative h-32 overflow-hidden rounded-md bg-[color-mix(in_oklab,var(--tt-color-text-brown)_25%,var(--background))]">
        {/* Perugino, The Delivery of the Keys, Sistine Chapel, 1481-82: public domain (assets/welcome/CREDITS.txt). The piazza's lines run to the temple door. */}
        <img src={deliveryOfTheKeys} alt="Perugino's Delivery of the Keys: a crowd before a wide paved square whose lines run back to a domed temple" draggable={false} className="absolute inset-0 size-full object-cover object-[50%_42%]" />
      </div>
      <AnimatePresence>
        {show && (
          <motion.div key="bar" data-picture-bar data-overlay className="absolute top-2 left-2 z-10 flex flex-col items-start gap-1.5 font-sans"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={spring.fast}>
            <Toolbar variant="floating">
              <ToolbarGroup>
                {['S', 'M', 'L'].map((size) => (
                  <ToolButton key={size} data-style="ghost" data-active-state={size === 'L' ? 'on' : 'off'} tabIndex={-1} aria-label={`${size} width`}><span className="tiptap-button-text">{size}</span></ToolButton>
                ))}
              </ToolbarGroup>
              <ToolbarSeparator />
              <ToolbarGroup>
                <ToolButton data-style="ghost" data-active-state="on" tabIndex={-1} aria-label="Align left"><AlignLeft className="tiptap-button-icon" /></ToolButton>
                <ToolButton data-style="ghost" tabIndex={-1} aria-label="Align center"><AlignCenter className="tiptap-button-icon" /></ToolButton>
              </ToolbarGroup>
              <ToolbarSeparator />
              <ToolbarGroup>
                <ToolButton data-style="ghost" data-ghost="caption" data-active-state={caption ? 'on' : 'off'} aria-label="Caption" tooltip="Caption"
                  className="shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_55%,transparent)]" onClick={write}>
                  <Captions className="tiptap-button-icon" />
                </ToolButton>
                <ToolButton data-style="ghost" tabIndex={-1} aria-label="Look"><Eye className="tiptap-button-icon" /></ToolButton>
              </ToolbarGroup>
            </Toolbar>
            {hint && (
              <motion.p data-caption-hint className="rounded-md border bg-popover px-2.5 py-1.5 text-[0.8125rem] leading-snug text-popover-foreground shadow-(--mf-panel-shadow)"
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE, delay: 0.15 }}>
                <strong className="font-semibold">“Caption”</strong> writes a line under any picture. Click a picture in a note for this bar.
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <figcaption ref={line} suppressContentEditableWarning className="mt-1.5 min-h-[1.4em] text-center text-[0.9375rem] text-muted-foreground italic outline-none"
        onBlur={(event) => void (event.currentTarget.contentEditable = 'false')}>
        {caption}{caption && caption !== CAPTION && caret}
      </figcaption>
    </motion.figure>
  )
}

/**
 * A long note, as the editor draws one: headings, an outline down the side,
 * a callout, a table and a picture. In the Write chapter it is built up a
 * power at a time (## makes a heading; / opens the block menu, walked from
 * top to bottom, then narrowed to a callout; a table; a picture and its
 * caption, from the picture's own bar; @ a link to a kept quote); then a line
 * in it is picked out, the selection bar offers Capture, Gem and Task, the
 * gem card tidies it, and it flies to Gems beside the page.
 */
export function LongNote({ shot, tag = 'reading' }: { shot: NoteShot; /** The tag the example note carries: yours, when you gave one. */ tag?: string }): React.JSX.Element {
  const s = shot
  const heads = ['How Florence learned perspective', ...(s.headOn && s.head === HEAD ? [HEAD] : []), 'Leonardo’s rule', 'For the seminar']
  const p = 'mb-3 leading-[1.65] text-foreground/90'
  const h2 = 'mb-2 text-[1.25rem] leading-snug font-semibold text-foreground'
  const page = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const shelf = useRef<HTMLSpanElement>(null)
  const [y, setY] = useState(0)
  // Where the gem card flies to: Gems, beside the page, measured once the card is up.
  const [fly, setFly] = useState({ x: 260, y: -120 })
  // Clipped only while folding or folded: open, the / and @ menus reach past it.
  const [clip, setClip] = useState(false)
  // The page kept on the part being worked on: measured, so it follows whatever has been added above it.
  useLayoutEffect(() => {
    const measure = (): void => {
      const root = body.current
      const el = root?.querySelector<HTMLElement>(`[data-at="${s.focus}"]`)
      if (!root || !el || !page.current) return
      let top = 0
      for (let at: HTMLElement | null = el; at && at !== root; at = at.offsetParent as HTMLElement | null) top += at.offsetTop
      setY(-Math.max(0, Math.min(top - 24, root.offsetHeight - page.current.clientHeight)))
    }
    measure()
    const watch = new ResizeObserver(measure)
    if (body.current) watch.observe(body.current)
    return () => watch.disconnect()
  }, [s.focus])
  const asking = s.at.lastIndexOf('@')
  const quote = typeOf('quote')
  const Quote = quote.icon
  const book = typeOf('note')
  const Book = book.icon
  const query = s.slash.slice(1).toLowerCase()
  const blocks = query ? SLASH.filter((item) => item.title.toLowerCase().includes(query)) : SLASH
  const row = query ? 0 : Math.min(s.row, blocks.length - 1)
  // The row picked kept in view, as ↓ walks the real menu.
  useLayoutEffect(() => {
    const menu = list.current
    const el = menu?.querySelector<HTMLElement>('.is-selected')
    if (!menu || !el) return
    menu.scrollTop = Math.max(0, el.offsetTop - menu.clientHeight / 2 + el.offsetHeight / 2)
  }, [row, query, s.slash])
  useLayoutEffect(() => {
    const from = card.current?.getBoundingClientRect()
    const to = shelf.current?.getBoundingClientRect()
    if (!s.card || !from || !to) return
    setFly({ x: to.left + to.width / 2 - (from.left + from.width / 2), y: to.top + to.height / 2 - (from.top + from.height / 2) })
  }, [s.card])
  const caret = <span className="mf-ghost-caret" data-typing="" />
  let group: string | null = null
  return (
    <div className="relative flex w-full max-w-[60rem]">
      <div data-example-note className={`${PANEL_PAGE} relative flex h-[clamp(16rem,46vh,27rem)] flex-1 flex-col overflow-hidden`}>
        {/* The note's own bar, as the app draws a page's top: where it is, and Gems, where a gem goes. Part of the card, so nothing ever sits over the page. */}
        <div className="relative z-30 flex h-11 shrink-0 items-center gap-3 border-b border-foreground/10 px-4 font-sans text-[0.9375rem] text-muted-foreground">
          <span className="truncate">Reading notes</span>
          <motion.span ref={shelf} data-gems-shelf className="ml-auto flex h-8 items-center gap-1.5 rounded-md border bg-popover px-2.5 font-medium text-popover-foreground"
            initial={false} animate={{ scale: s.saved ? [1, 1.08, 1] : 1 }} transition={{ duration: 0.45, delay: 0.45, ease: [0.65, 0, 0.35, 1] }}>
            <Gem className="size-4" style={{ color: 'var(--tt-color-text-purple)' }} />Gems
            <span className="ml-1 text-muted-foreground tabular-nums"><Rolling text={s.saved ? 1 : 0} /></span>
          </motion.span>
        </div>
        <div ref={page} className="relative min-h-0 flex-1 overflow-hidden">
        {/* The page's edges fade, so a block cut by the edge reads as the page going on, not as clipped. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 h-6 bg-linear-to-b from-popover to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-12 bg-linear-to-t from-popover to-transparent" />
        <motion.div ref={body} className="relative px-10 pt-6 pb-24" style={{ fontFamily: 'var(--mf-font, "Fraunces Variable", Georgia, serif)', fontVariationSettings: '"SOFT" 20, "WONK" 1' }}
          initial={false} animate={{ y }} transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1] }}>
          <div data-at="top">
            <h1 className="mb-1 text-[1.75rem] leading-tight font-semibold text-foreground">{heads[0]}</h1>
            <p className="mb-5 text-[0.8125rem] text-muted-foreground">Reading notes · #{tag} · 2,340 words</p>
          </div>
          {/* "##" and a space: the line becomes a heading, and the words typed after are the heading's. */}
          <div data-at="head" className="relative">
            {s.headOn ? (
              <h2 className={h2}>
                {/* Its fold handle, in the margin, as the editor shows it beside a heading. */}
                {s.head === HEAD && (
                  <span data-ghost="fold" className="absolute top-[0.2em] -left-7 flex size-5 items-center justify-center rounded text-muted-foreground">
                    <ChevronDown className="size-4 transition-transform duration-200" style={{ rotate: s.folded ? '-90deg' : '0deg' }} />
                  </span>
                )}
                {s.head}{s.head !== HEAD && caret}
              </h2>
            ) : (
              <p className={`${p} text-muted-foreground`}>{s.hashes}{caret}</p>
            )}
          </div>
          {/* Folded, everything under the heading tucks away until it is opened again. */}
          <motion.div style={{ overflow: clip || s.folded ? 'hidden' : 'visible' }} initial={false} animate={{ height: s.folded ? 0 : 'auto', opacity: s.folded ? 0 : 1 }} transition={{ duration: 0.35, ease: EASE }}
            onAnimationStart={() => setClip(true)} onAnimationComplete={() => setClip(false)}>
            <p className={p}>Around 1415 Brunelleschi stood in the cathedral doorway with a small painted panel and a mirror, and showed Florence that a flat picture could hold real depth.</p>
            <div data-at="slash" className="relative">
              {s.callout ? (
                <motion.div className="mb-4 flex gap-3 rounded-md border border-[color-mix(in_srgb,var(--tt-color-text-purple)_22%,transparent)] bg-[color-mix(in_srgb,var(--tt-color-text-purple)_6%,transparent)] px-4 py-3 text-[0.9375rem] leading-snug text-foreground"
                  initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: EASE }}>
                  {/* The note's own callout: an even hairline and a whisper of its colour, never a stripe down one side. */}
                  <span aria-hidden>💡</span>Alberti wrote the method down in 1435, in On Painting: a picture is a window you look through.
                </motion.div>
              ) : s.slash ? (
                <p className={`${p} !mb-1`}>{s.slash}{caret}</p>
              ) : null}
              {/* The block menu as "/" opens it, the editor's own, under the line: walked from top to bottom, then narrowed as a name is typed. */}
              <AnimatePresence>
                {s.slash && !s.callout && (
                  <motion.div key="menu" data-slash-glance inert className="tiptap-slash-menu relative z-10 mb-3 w-64 font-sans text-popover-foreground shadow-(--mf-panel-shadow)"
                    style={{ maxHeight: 'min(15rem, 36vh)' }}
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={spring.fast}>
                    <div ref={list} className="tiptap-slash-menu-list" style={{ scrollBehavior: 'smooth' }}>
                      {blocks.map((item, i) => {
                        const header = !query && item.group !== group ? item.group : null
                        group = item.group
                        return (
                          <Fragment key={item.title}>
                            {header && <div className="tiptap-slash-menu-group">{header}</div>}
                            <button type="button" tabIndex={-1} className={i === row ? 'is-selected' : undefined}>
                              {item.icon}
                              <span className="tiptap-slash-menu-title">{item.title}</span>
                              {item.hint && <span className="tiptap-slash-menu-hint">{item.hint}</span>}
                            </button>
                          </Fragment>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {s.table > 0 && (
              <div data-at="table" className="mb-4 overflow-hidden rounded-md border border-foreground/12 font-sans text-[0.8125rem]">
                {TABLE.slice(0, s.table).map((cells, r) => (
                  <motion.div key={r} className={`grid grid-cols-[1fr_1.3fr_1fr] ${r ? 'border-t border-foreground/10' : 'bg-foreground/[0.04] font-medium text-foreground'}`}
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE }}>
                    {cells.map((cell, c) => <span key={c} className={`px-3 py-1.5 ${c ? 'border-l border-foreground/10' : ''} ${r ? 'text-foreground/85' : ''}`}>{cell}</span>)}
                  </motion.div>
                ))}
              </div>
            )}
            {s.pic && <NotePicture caption={s.caption} tools={s.tools} />}
            {s.at && (
              <div data-at="link" className="relative">
                <p className={p}>
                  {s.linked ? (
                    <>
                      {s.at.slice(0, asking)}
                      {/* The link as the editor draws it: its kind's icon, in its kind's colour, then the name. */}
                      <motion.span className="rounded-[0.25rem] bg-(--mf-surface) px-[0.125rem] text-[var(--tt-brand-color-400)]" initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                        <Quote className="mr-1 inline-block size-[0.85em] align-[-0.1em]" style={{ color: quote.tint }} />{LINKED}…
                      </motion.span>
                    </>
                  ) : (
                    <>{s.at.slice(0, asking < 0 ? undefined : asking)}{asking >= 0 && <span data-accent-ok className="rounded-[0.2em] bg-primary/12 px-[0.1em] text-primary">{s.at.slice(asking)}</span>}{caret}</>
                  )}
                </p>
                <AnimatePresence>
                  {s.suggest && !s.linked && (
                    <motion.div key="suggest" className="absolute top-[calc(100%-0.5rem)] left-24 z-10 w-80 rounded-lg border bg-popover p-1 font-sans text-popover-foreground shadow-(--mf-panel-shadow)"
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={spring.fast}>
                      <div className="flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-[0.8125rem] text-foreground">
                        <Quote className="size-3.5 shrink-0" style={{ color: quote.tint }} /><span className="flex-1 truncate">{LINKED}…</span><span className="text-xs text-muted-foreground">Quote</span>
                      </div>
                      <div className="flex items-center gap-2 px-2 py-1.5 text-[0.8125rem] text-muted-foreground">
                        <Book className="size-3.5 shrink-0" style={{ color: book.tint }} /><span className="flex-1 truncate">Why does the Trinity look so deep?</span><span className="text-xs">Note</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
          <h2 data-at="story" className={h2}>{heads[heads.length - 2]}</h2>
          {/* A block, not a paragraph: the gem card it holds is a block of its own. */}
          <div data-at="hovel" className={`${p} relative`}>
            Leonardo filled notebooks with the rules of sight, and was blunt about why they matter: <span className={`rounded-[2px] transition-colors duration-300 ${s.picked ? 'bg-primary/30 text-foreground' : ''}`}>{PICKED}</span>.
            <AnimatePresence>
              {s.bar && !s.card && (
                <motion.span key="bar" className="absolute -top-11 left-24 z-10 flex items-center gap-0.5 rounded-lg border bg-popover p-1 font-sans text-control text-muted-foreground shadow-(--mf-panel-shadow)"
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={spring.fast}>
                  <span className="flex h-7 items-center gap-1.5 px-2"><Inbox className="size-4" />Capture</span>
                  <span data-ghost="idea" className={`flex h-7 items-center gap-1.5 rounded-md px-2 ${s.card ? 'bg-accent text-foreground' : ''}`}><Gem className="size-4" />Gem</span>
                  <span className="flex h-7 items-center gap-1.5 px-2"><ListTodo className="size-4" />Task</span>
                </motion.span>
              )}
            </AnimatePresence>
            {/* The gem card, 8px under the whole paragraph, as the app places it: the picked words stay in view. Saved, it flies to Gems. */}
            <AnimatePresence>
              {s.card && !s.saved && (
                <motion.div ref={card} key="card" className="absolute top-[calc(100%+8px)] left-0 z-20 w-[min(24rem,80%)] rounded-lg border bg-popover p-3 font-sans text-popover-foreground shadow-(--mf-panel-shadow)"
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, x: fly.x, y: fly.y, scale: 0.3, transition: { type: 'spring', duration: 0.6, bounce: 0 } }} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[0.875rem] font-medium" style={{ color: 'var(--tt-color-text-purple)' }}><Gem className="size-3.5" />Gem</p>
                  <p className="min-h-[3em] text-[0.9375rem] leading-snug text-foreground" style={{ fontFamily: 'var(--font-sans, system-ui)' }}>{s.edited}{caret}</p>
                  <p className="mt-2 flex items-center justify-between text-[0.875rem] text-muted-foreground"><span>From your reading note</span><span>Save ⌘↵</span></p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <p className={p}>The century in one line: learn the rule first, then the freedom comes.</p>
          <h2 className={h2}>{heads[heads.length - 1]}</h2>
          <p className={p}>Did perspective make painting truer, or only more convincing?</p>
        </motion.div>
        </div>
      </div>
    </div>
  )
}

/** The example note's page: the app's card radius (10px), a step under the panels that float over it. */
const PANEL_PAGE = 'rounded-lg border border-foreground/10 bg-popover text-popover-foreground shadow-(--mf-panel-shadow)'
