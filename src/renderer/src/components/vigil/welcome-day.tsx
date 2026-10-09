import type { CSSProperties, ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, EyeOff, Flag, Gem, Inbox, ListTodo, Pencil, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { EASE, spring } from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { dayjs } from '../../../../main/dates'
import { Journey } from './goals-view'
import { Flip } from './review-view'
import { Tape } from './tape'
import { CARD, PAPER } from './sticky-note'
import { LAND } from './welcome-reel'
import { Scenery } from './scenery'

/**
 * The parts of "A day with Vigil", the welcome's chapter on what happens once
 * it is in use, each drawn from the app's own: the hint card as the box shows
 * it, Today's sticky note, a goal's road, two Review cards. Pictures only:
 * nothing here takes a click or reads your data.
 */

/** A beat's words: the hour, the problem, struck through once answered, and the answer. */
export function Moment({ hour, problem, answer, answered, children }: { hour: string; problem: string; answer: ReactNode; answered: boolean; children: ReactNode }): React.JSX.Element {
  return (
    <div className="grid h-full w-full grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center gap-x-[clamp(1.5rem,4vw,4rem)] px-[clamp(1.5rem,5vw,4rem)]">
      <div className="flex flex-col gap-3">
        <p className="text-[0.875rem] font-medium text-(--mf-wl-quiet)">{hour}</p>
        <p className={`font-heading text-[clamp(1.25rem,min(2.4vw,3.4vh),1.875rem)] leading-tight transition-colors duration-500 ${answered ? 'text-(--mf-wl-quiet)' : 'text-foreground'}`}>
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
                  <span className="mr-auto text-xs">Saved · a note idea</span>
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
const TODAY = ['Send the deck to Priya', 'Book the Star Wars marathon', 'Call the dentist back']

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

/**
 * A long note, as the editor draws one: headings, an outline down the side,
 * a callout and a picture, scrolled like a real page. Then a line in it is
 * picked out, the selection bar offers Capture, Idea and Task, and the small
 * card rewords it before it is kept as an idea that remembers this note.
 */
export function LongNote({ scroll, picked, bar, card, edited, saved }: { scroll: number; picked: boolean; bar: boolean; card: boolean; edited: string; saved: boolean }): React.JSX.Element {
  const heads = ['Frankenstein, as I read it', 'Volume One', 'The creature’s story', 'Who is the monster?']
  const lit = scroll < 0.3 ? 0 : scroll < 0.6 ? 1 : scroll < 0.95 ? 2 : 3
  const p = 'mb-3 leading-[1.65] text-foreground/90'
  return (
    <div className="relative flex w-full max-w-[52rem] gap-6">
      <div className={`${PANEL_PAGE} relative h-[clamp(18rem,52vh,28rem)] flex-1 overflow-hidden`}>
        <motion.div className="px-10 pt-8 pb-24" style={{ fontFamily: 'var(--mf-font, "Fraunces Variable", Georgia, serif)', fontVariationSettings: '"SOFT" 20, "WONK" 1' }}
          initial={false} animate={{ y: `${-scroll * 52}%` }} transition={{ type: 'spring', duration: 1.6, bounce: 0 }}>
          <h1 className="mb-1 text-[1.75rem] leading-tight font-semibold text-foreground">{heads[0]}</h1>
          <p className="mb-5 text-[0.8125rem] text-muted-foreground">Study notes · #reading · 2,340 words</p>
          <h2 className="mb-2 text-[1.25rem] font-semibold text-foreground">{heads[1]}</h2>
          <p className={p}>Walton writes to his sister from the ice. He wants glory; Victor, half frozen, warns him what wanting it cost.</p>
          <div className="mb-4 flex gap-3 rounded-lg border border-[color-mix(in_srgb,var(--tt-color-text-purple)_22%,transparent)] bg-[color-mix(in_srgb,var(--tt-color-text-purple)_6%,transparent)] px-4 py-3 text-[0.9375rem] leading-snug text-foreground">
            {/* The note's own callout: an even hairline and a whisper of its colour, never a stripe down one side. */}
            <span aria-hidden>💡</span>Mary Shelley began it at eighteen, at Lake Geneva in 1816, the year without a summer.
          </div>
          <div className="relative mb-4 h-36 overflow-hidden rounded-lg bg-[color-mix(in_oklab,var(--tt-color-text-brown)_25%,var(--background))]">
            <Scenery place="recap" seed="welcome-note" mood={['night']} wide soft className="absolute inset-0" rounded="rounded-lg" />
          </div>
          <h2 className="mb-2 text-[1.25rem] font-semibold text-foreground">{heads[2]}</h2>
          <p className={`${p} relative`}>
            Hidden in the hovel, <span className={`rounded-[2px] transition-colors duration-300 ${picked ? 'bg-primary/30 text-foreground' : ''}`}>{PICKED}</span>, and reads Milton, Plutarch and Goethe.
            <AnimatePresence>
              {bar && !card && (
                <motion.span key="bar" className="absolute -top-11 left-24 z-10 flex items-center gap-0.5 rounded-lg border bg-popover p-1 font-sans text-control text-muted-foreground shadow-(--mf-panel-shadow)"
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={spring.fast}>
                  <span className="flex h-7 items-center gap-1.5 px-2"><Inbox className="size-4" />Capture</span>
                  <span data-ghost="idea" className={`flex h-7 items-center gap-1.5 rounded-md px-2 ${card ? 'bg-accent text-foreground' : ''}`}><Gem className="size-4" />Idea</span>
                  <span className="flex h-7 items-center gap-1.5 px-2"><ListTodo className="size-4" />Task</span>
                </motion.span>
              )}
            </AnimatePresence>
            {/* The reword card, 8px under the whole paragraph, as the app places it: the picked words stay in view. */}
            <AnimatePresence>
              {card && !saved && (
                <motion.div key="card" className="absolute top-[calc(100%+8px)] left-0 z-20 w-[min(24rem,80%)] rounded-xl border bg-popover p-3 font-sans text-popover-foreground shadow-(--mf-panel-shadow)"
                  initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 260, y: -120, scale: 0.4, filter: 'blur(2px)', transition: { duration: 0.5, ease: EASE } }} transition={spring.slow}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--tt-color-text-purple)' }}><Gem className="size-3.5" />Idea</p>
                  <p className="min-h-[3em] text-[0.9375rem] leading-snug text-foreground" style={{ fontFamily: 'var(--font-sans, system-ui)' }}>{edited}<span className="mf-ghost-caret" data-typing="" /></p>
                  <p className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>From Frankenstein, as I read it</span><span>Save ⌘↵</span></p>
                </motion.div>
              )}
            </AnimatePresence>
          </p>
          <p className={p}>Language is what lets him see himself, and what makes the rejection unbearable.</p>
          <h2 className="mb-2 text-[1.25rem] font-semibold text-foreground">{heads[3]}</h2>
          <p className={p}>Victor runs from what he made. The creature asks for one companion. Which one is the monster?</p>
        </motion.div>
      </div>
      {/* The outline down the side, its heading lit as the page passes it. */}
      <div className="hidden w-44 shrink-0 flex-col gap-2 pt-8 text-[0.8125rem] sm:flex">
        <p className="text-xs font-medium text-muted-foreground">On this page</p>
        {heads.map((head, i) => (
          <p key={head} className={`border-l-2 pl-2 transition-colors duration-300 ${i === lit ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}>{head}</p>
        ))}
        <AnimatePresence>
          {saved && (
            <motion.div key="kept" className="mt-4 rounded-lg border bg-popover p-2.5 text-xs text-popover-foreground shadow-(--mf-panel-shadow)" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={LAND}>
              <p className="mb-1 flex items-center gap-1 font-medium" style={{ color: 'var(--tt-color-text-purple)' }}><Gem className="size-3.5" />In Ideas</p>
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
