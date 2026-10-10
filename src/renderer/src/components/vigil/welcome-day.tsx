import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, ChevronDown, EyeOff, Flag, Gem, Heading2, ImagePlus, Inbox, Lightbulb, ListTodo, Pencil, Table as TableIcon, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { EASE, spring } from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { dayjs } from '../../../../main/dates'
import { Journey } from './goals-view'
import { Flip } from './review-view'
import { Tape } from './tape'
import { CARD, PAPER } from './sticky-note'
import { LAND, typeOf } from './welcome-reel'
import { Scenery } from './scenery'

/**
 * The parts of "A day with Vigil", the welcome's chapter on what happens once
 * it is in use, each drawn from the app's own: the hint card as the box shows
 * it, Today's sticky note, a goal's road, two Review cards. Pictures only:
 * nothing here takes a click or reads your data.
 */

/** A beat's words: the hour leading the problem's line, the problem struck through once answered, and the answer. */
export function Moment({ hour, problem, answer, answered, children }: { hour: string; problem: string; answer: ReactNode; answered: boolean; children: ReactNode }): React.JSX.Element {
  return (
    <div className="grid h-full w-full grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center gap-x-[clamp(1.5rem,4vw,4rem)] px-[clamp(1.5rem,5vw,4rem)]">
      <div className="flex flex-col gap-3">
        <p className={`font-heading text-[clamp(1.25rem,min(2.4vw,3.4vh),1.875rem)] leading-tight transition-colors duration-500 ${answered ? 'text-(--mf-wl-quiet)' : 'text-foreground'}`}>
          {/* The hour starts the line, never struck: it is when, not the problem. */}
          <span className="text-foreground">{hour}.</span>{' '}
          {/* Answered: struck through in the accent, as a crossed-off line. */}
          <span className={`decoration-primary/70 decoration-2 transition-[text-decoration-color] duration-500 ${answered ? 'line-through' : 'decoration-transparent'}`}>{problem}</span>
        </p>
        <motion.p className="text-[clamp(1rem,min(1.9vw,2.8vh),1.375rem)] leading-snug text-foreground" initial={false} animate={{ opacity: answered ? 1 : 0, y: answered ? 0 : 6 }} transition={{ duration: 0.35, ease: EASE, delay: answered ? 0.2 : 0 }}>
          {answer}
        </motion.p>
      </div>
      <div className="flex min-w-0 items-center justify-center">{children}</div>
    </div>
  )
}

const PANEL = 'w-full max-w-[28rem] overflow-hidden rounded-[14px] border border-foreground/10 bg-popover text-popover-foreground shadow-(--mf-panel-shadow)'

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
      <div className="flex h-9 items-center justify-end px-4">
        {/* The header's chip, as the box draws it with the side panel shut. */}
        <motion.span className="flex h-5 items-center gap-1 rounded-full bg-accent px-2 text-key leading-none text-muted-foreground" initial={false} animate={{ opacity: shown ? 1 : 0 }}>
          2 to revisit<span>·</span>1 waiting
        </motion.span>
      </div>
      <div className="min-h-[3rem] px-6 pt-1 font-heading text-[1.0625rem] text-muted-foreground/60">
        <span className="mf-ghost-caret -ml-px" />
      </div>
      <div className="px-6 pb-4">
        <AnimatePresence>
          {shown && !kept && (
            <motion.div key="hint" className="relative rounded-lg border border-[color-mix(in_srgb,var(--tt-brand-color-400)_22%,transparent)] bg-[color-mix(in_srgb,var(--tt-brand-color-400)_10%,transparent)] px-3 py-2.5 text-sm"
              initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.9, filter: 'blur(2px)', transition: { duration: 0.35, ease: EASE } }} transition={{ duration: 0.24, ease: EASE }}>
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
const TODAY = ['Send the deck to Priya', 'Book tickets for Hamlet', 'Call the dentist back']

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
  const logs = [at(33, '3k, slow'), at(26, '5k'), at(19, '5k in the rain'), at(12, '6k'), at(5, '7k, no stopping'), ...(logged ? [at(0, '8k today')] : [])]
  return (
    <div className="flex w-full max-w-[30rem] flex-col gap-3">
      {/* The box, taking a log for the goal rather than a capture. */}
      <div className="rounded-[14px] border border-foreground/10 bg-popover px-5 py-3 text-popover-foreground shadow-(--mf-panel-shadow)">
        <p className="min-h-[1.6em] font-heading text-[1.0625rem] text-foreground">{line}{!logged && <span className="mf-ghost-caret" data-typing="" />}</p>
        <div className="mt-2 flex items-center gap-2">
          <AnimatePresence>
            {chip && (
              <motion.span key="chip" className="flex min-w-0 items-center gap-1.5 rounded-2xl border px-2.5 py-0.5 text-xs text-muted-foreground" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring.fast}>
                <Flag className="size-3.5 shrink-0 text-[var(--tt-brand-color-400)]" />A log for “Run a half marathon”
              </motion.span>
            )}
          </AnimatePresence>
          <span className="flex-1" />
          <Button variant="secondary" tabIndex={-1} data-ghost="add-log" className="text-control">{chip ? 'Add log' : 'Create'} <kbd className="font-sans text-key opacity-70">⌘↵</kbd></Button>
        </div>
      </div>
      <div className="rounded-[14px] border border-foreground/10 bg-popover p-4 text-popover-foreground shadow-(--mf-panel-shadow)">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="font-medium text-foreground">Run a half marathon</p>
          <p className="text-xs text-muted-foreground tabular-nums">52 days to go</p>
        </div>
        <Journey from={from} target={target} today={today} logs={logs} />
        <AnimatePresence>
          {logged && (
            <motion.p key="log" className="mt-2 text-[0.8125rem] text-foreground" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
              <span className="text-muted-foreground">Today · </span>8k today
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

/** The words picked out of the note, and what they become once reworded. */
export const PICKED = 'the monster learns language from listening through a wall'
export const REWORDED = 'Frankenstein’s creature learns to speak by listening to a family through a wall.'

/** The note at one moment of the Write chapter: what has been added to it so far, and where the page is. */
export type NoteShot = {
  /** The hashes typed on the empty line, before the space turns them into a heading. */
  hashes: string; headOn: boolean; head: string
  slash: string; callout: boolean; table: number; pic: boolean; caption: string
  /** The line with a link in it, typed so far; then the suggestion list, then the link made. */
  at: string; suggest: boolean; linked: boolean
  folded: boolean
  /** The part of the page kept in view (`data-at`), and the heading lit in the outline. */
  focus: string; lit: number
  picked: boolean; bar: boolean; card: boolean; edited: string; saved: boolean
}
/** The picture's caption, the line typed with a link in it (up to the words "@" asks with), and the quote it links to. */
export const CAPTION = 'Lake Geneva, the summer of 1816'
export const LINK_LINE = 'The epigraph is Milton’s: @Did I'
const EPIGRAPH = 'Did I request thee, Maker, from my clay'
export const NOTE_START: NoteShot = { hashes: '', headOn: false, head: '', slash: '', callout: false, table: 0, pic: false, caption: '', at: '', suggest: false, linked: false, folded: false, focus: 'top', lit: 0, picked: false, bar: false, card: false, edited: '', saved: false }

/** The block menu's first rows, as "/" lists them, each with its icon. */
const BLOCKS: [typeof Heading2, string][] = [[Heading2, 'Heading 2'], [Lightbulb, 'Callout'], [TableIcon, 'Table'], [ImagePlus, 'Image']]
/** Who wants what in the book, and what they get: the note's table. */
const TABLE = [['Who', 'Wants', 'Gets'], ['Victor', 'To know everything', 'Ruin'], ['The creature', 'One companion', 'Refused'], ['Walton', 'Glory at the Pole', 'Turns back']]

/**
 * A long note, as the editor draws one: headings, an outline down the side,
 * a callout, a table and a picture. In the Write chapter it is built up a
 * power at a time (## makes a heading, / a callout, a table, a picture and
 * its caption, @ a link to a kept quote, a heading folded and opened, the
 * outline taking you down the page); then a line in it is picked out, the
 * selection bar offers Capture, Gem and Task, and the small card rewords it
 * before it is kept as a gem that remembers this note.
 */
export function LongNote({ shot }: { shot: NoteShot }): React.JSX.Element {
  const s = shot
  const heads = ['Frankenstein, as I read it', ...(s.headOn && s.head === 'Volume One' ? ['Volume One'] : []), 'The creature’s story', 'Who is the monster?']
  const lit = heads[s.lit] ? s.lit : heads.length - 2
  const p = 'mb-3 leading-[1.65] text-foreground/90'
  const h2 = 'mb-2 text-[1.25rem] leading-snug font-semibold text-foreground'
  const page = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [y, setY] = useState(0)
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
      setY(-Math.max(0, Math.min(top - 28, root.offsetHeight - page.current.clientHeight)))
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
  const blocks = BLOCKS.filter(([, title]) => title.toLowerCase().startsWith(query))
  const caret = <span className="mf-ghost-caret" data-typing="" />
  return (
    <div className="relative flex w-full max-w-[52rem] gap-6">
      <div ref={page} className={`${PANEL_PAGE} relative h-[clamp(16rem,48vh,28rem)] flex-1 overflow-hidden`}>
        <motion.div ref={body} className="relative px-10 pt-8 pb-24" style={{ fontFamily: 'var(--mf-font, "Fraunces Variable", Georgia, serif)', fontVariationSettings: '"SOFT" 20, "WONK" 1' }}
          initial={false} animate={{ y }} transition={{ type: 'spring', duration: 1, bounce: 0 }}>
          <div data-at="top">
            <h1 className="mb-1 text-[1.75rem] leading-tight font-semibold text-foreground">{heads[0]}</h1>
            <p className="mb-5 text-[0.8125rem] text-muted-foreground">Study notes · #reading · 2,340 words</p>
          </div>
          {/* "##" and a space: the line becomes a heading, and the words typed after are the heading's. */}
          <div data-at="head" className="relative">
            {s.headOn ? (
              <h2 className={h2}>
                {/* Its fold handle, in the margin, as the editor shows it beside a heading. */}
                {s.head === 'Volume One' && (
                  <span data-ghost="fold" className="absolute top-[0.2em] -left-7 flex size-5 items-center justify-center rounded text-muted-foreground">
                    <ChevronDown className="size-4 transition-transform duration-200" style={{ rotate: s.folded ? '-90deg' : '0deg' }} />
                  </span>
                )}
                {s.head}{s.head !== 'Volume One' && caret}
              </h2>
            ) : (
              <p className={`${p} text-muted-foreground`}>{s.hashes}{caret}</p>
            )}
          </div>
          {/* Folded, everything under the heading tucks away until it is opened again. */}
          <motion.div style={{ overflow: clip || s.folded ? 'hidden' : 'visible' }} initial={false} animate={{ height: s.folded ? 0 : 'auto', opacity: s.folded ? 0 : 1 }} transition={{ duration: 0.35, ease: EASE }}
            onAnimationStart={() => setClip(true)} onAnimationComplete={() => setClip(false)}>
            <p className={p}>Walton writes to his sister from the ice. He wants glory; Victor, half frozen, warns him what wanting it cost.</p>
            <div data-at="slash" className="relative">
              {s.callout ? (
                <motion.div className="mb-4 flex gap-3 rounded-lg border border-[color-mix(in_srgb,var(--tt-color-text-purple)_22%,transparent)] bg-[color-mix(in_srgb,var(--tt-color-text-purple)_6%,transparent)] px-4 py-3 text-[0.9375rem] leading-snug text-foreground"
                  initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: EASE }}>
                  {/* The note's own callout: an even hairline and a whisper of its colour, never a stripe down one side. */}
                  <span aria-hidden>💡</span>Mary Shelley began it at eighteen, at Lake Geneva in 1816, the year without a summer.
                </motion.div>
              ) : s.slash ? (
                <p className={`${p} !mb-1`}>{s.slash}{caret}</p>
              ) : null}
              {/* The block menu, as "/" opens it, under the line, narrowing as the name is typed; the lines below make room. */}
              <AnimatePresence>
                {s.slash && !s.callout && (
                  <motion.div key="menu" className="relative z-10 mb-3 w-52 rounded-lg border bg-popover p-1 font-sans text-popover-foreground shadow-(--mf-panel-shadow)"
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={spring.fast}>
                    {blocks.map(([Icon, title], i) => (
                      <div key={title} className={`flex h-8 items-center gap-2 rounded-md px-2 text-[0.8125rem] ${i === 0 ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}>
                        <Icon className="size-4 shrink-0" />{title}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {s.table > 0 && (
              <div data-at="table" className="mb-4 overflow-hidden rounded-lg border border-foreground/12 font-sans text-[0.8125rem]">
                {TABLE.slice(0, s.table).map((row, r) => (
                  <motion.div key={r} className={`grid grid-cols-[1fr_1.3fr_1fr] ${r ? 'border-t border-foreground/10' : 'bg-foreground/[0.04] font-medium text-foreground'}`}
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE }}>
                    {row.map((cell, c) => <span key={c} className={`px-3 py-1.5 ${c ? 'border-l border-foreground/10' : ''} ${r ? 'text-foreground/85' : ''}`}>{cell}</span>)}
                  </motion.div>
                ))}
              </div>
            )}
            {s.pic && (
              <motion.figure data-at="pic" className="mb-4" initial={{ opacity: 0, scale: 1.04, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={LAND}>
                <div className="relative h-32 overflow-hidden rounded-lg bg-[color-mix(in_oklab,var(--tt-color-text-brown)_25%,var(--background))]">
                  <Scenery place="recap" seed="welcome-note" mood={['night']} wide soft className="absolute inset-0" rounded="rounded-lg" />
                </div>
                <figcaption className="mt-1.5 min-h-[1.4em] text-center text-[0.8125rem] text-muted-foreground italic">{s.caption}{s.caption && s.caption !== CAPTION && caret}</figcaption>
              </motion.figure>
            )}
            {s.at && (
              <div data-at="link" className="relative">
                <p className={p}>
                  {s.linked ? (
                    <>
                      {s.at.slice(0, asking)}
                      {/* The link as the editor draws it: its kind's icon, in its kind's colour, then the name. */}
                      <motion.span className="rounded-[0.25rem] bg-(--mf-surface) px-[0.125rem] text-[var(--tt-brand-color-400)]" initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                        <Quote className="mr-1 inline-block size-[0.85em] align-[-0.1em]" style={{ color: quote.tint }} />{EPIGRAPH}…
                      </motion.span>
                    </>
                  ) : (
                    <>{s.at.slice(0, asking < 0 ? undefined : asking)}{asking >= 0 && <span className="rounded-[0.2em] bg-primary/12 px-[0.1em] text-primary">{s.at.slice(asking)}</span>}{caret}</>
                  )}
                </p>
                <AnimatePresence>
                  {s.suggest && !s.linked && (
                    <motion.div key="suggest" className="absolute top-[calc(100%-0.5rem)] left-24 z-10 w-72 rounded-lg border bg-popover p-1 font-sans text-popover-foreground shadow-(--mf-panel-shadow)"
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={spring.fast}>
                      <div className="flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-[0.8125rem] text-foreground">
                        <Quote className="size-3.5 shrink-0" style={{ color: quote.tint }} /><span className="flex-1 truncate">{EPIGRAPH}…</span><span className="text-xs text-muted-foreground">Quote</span>
                      </div>
                      <div className="flex items-center gap-2 px-2 py-1.5 text-[0.8125rem] text-muted-foreground">
                        <Book className="size-3.5 shrink-0" style={{ color: book.tint }} /><span className="flex-1 truncate">Did Victor ever love it?</span><span className="text-xs">Note</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
          <h2 data-at="story" className={h2}>{heads[heads.length - 2]}</h2>
          {/* A block, not a paragraph: the reword card it holds is a block of its own. */}
          <div data-at="hovel" className={`${p} relative`}>
            Hidden in the hovel, <span className={`rounded-[2px] transition-colors duration-300 ${s.picked ? 'bg-primary/30 text-foreground' : ''}`}>{PICKED}</span>, and reads Milton, Plutarch and Goethe.
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
            {/* The reword card, 8px under the whole paragraph, as the app places it: the picked words stay in view. */}
            <AnimatePresence>
              {s.card && !s.saved && (
                <motion.div key="card" className="absolute top-[calc(100%+8px)] left-0 z-20 w-[min(24rem,80%)] rounded-xl border bg-popover p-3 font-sans text-popover-foreground shadow-(--mf-panel-shadow)"
                  initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 260, y: -120, scale: 0.4, filter: 'blur(2px)', transition: { duration: 0.5, ease: EASE } }} transition={spring.slow}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--tt-color-text-purple)' }}><Gem className="size-3.5" />Gem</p>
                  <p className="min-h-[3em] text-[0.9375rem] leading-snug text-foreground" style={{ fontFamily: 'var(--font-sans, system-ui)' }}>{s.edited}{caret}</p>
                  <p className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>From Frankenstein, as I read it</span><span>Save ⌘↵</span></p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <p className={p}>Language is what lets him see himself, and what makes the rejection unbearable.</p>
          <h2 className={h2}>{heads[heads.length - 1]}</h2>
          <p className={p}>Victor runs from what he made. The creature asks for one companion. Which one is the monster?</p>
        </motion.div>
      </div>
      {/* The outline down the side, its heading lit as the page passes it; a heading in it takes you there. */}
      <div className="hidden w-44 shrink-0 flex-col gap-2 pt-8 text-[0.8125rem] sm:flex">
        <p className="text-xs font-medium text-muted-foreground">On this page</p>
        {heads.map((head, i) => (
          <motion.p key={head} layout="position" data-ghost={i === heads.length - 2 ? 'outline-story' : undefined}
            className={`border-l-2 pl-2 transition-colors duration-300 ${i === lit ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>{head}</motion.p>
        ))}
        <AnimatePresence>
          {s.saved && (
            <motion.div key="kept" className="mt-4 rounded-lg border bg-popover p-2.5 text-xs text-popover-foreground shadow-(--mf-panel-shadow)" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={LAND}>
              <p className="mb-1 flex items-center gap-1 font-medium" style={{ color: 'var(--tt-color-text-purple)' }}><Gem className="size-3.5" />In Gems</p>
              <p className="leading-snug text-foreground">{REWORDED}</p>
              <p className="mt-1 text-muted-foreground">↩ From Frankenstein, as I read it</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

const PANEL_PAGE = 'rounded-[14px] border border-foreground/10 bg-popover text-popover-foreground shadow-(--mf-panel-shadow)'
