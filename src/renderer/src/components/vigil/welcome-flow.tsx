import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays, Gem, Inbox, ListTodo, NotebookText, Quote } from 'lucide-react'
import { EASE, spring } from '@/lib/motion'
import { STORY_DAY } from '@/lib/welcome-box'
import { when } from '@/lib/clock'
import { readTask } from '../../../../main/task-words'
import { FileText as Article, ListTodo as Check } from '@/components/ui/icons'

/**
 * The welcome's Write chapter: the thought caught in Catch grows into a
 * long note, and two of its lines are picked out with the selection bar,
 * one made a task (its day read from the words, by the same reader the app
 * uses, task-words.ts) and one a gem with a question for Review. Every card
 * is drawn as the app draws it (the box, a note, the bar, a task row with
 * its date, the gem card), each picked line and the card it becomes in one
 * colour, a line drawn from the very words to the card. Pictures only:
 * nothing here takes a click. Still (a skip, Motion off, Reduce motion), it
 * is all there at once.
 */

/** The two things the note becomes, each in its own colour: its mark in the note and its card share it. */
export const HUE = {
  task: { ink: 'var(--primary)', wash: 'color-mix(in oklab, var(--primary) 16%, transparent)' },
  gem: { ink: 'var(--tt-color-text-pink)', wash: 'color-mix(in oklab, var(--tt-color-text-pink) 22%, transparent)' }
} as const

/** The note's lines; the two picked out say what they become. */
const LINES: { text: string; becomes?: 'task' | 'gem' }[] = [
  { text: 'Yoda was a puppet, and you can feel his weight.' },
  { text: 'High resolution removes physical resistance.' },
  { text: `Draft intro for film essay on ${STORY_DAY}`, becomes: 'task' },
  { text: 'Perfection erases human presence.', becomes: 'gem' }
]

/** The story's words, for Catch, Remember and the sandbox to tell the same story (sandbox-seed.ts). */
export const FLOW_WORDS = {
  /** The thought caught on a walk, in Catch. */
  caught: 'Why do old movies feel more real?',
  /** The note it grows into. */
  note: 'Why old movies feel real',
  lines: LINES.map((line) => line.text),
  task: LINES[2].text,
  gem: LINES[3].text,
  /** The gem's question, as Review asks it. */
  question: 'What does perfection erase, in film?',
  answer: 'Human presence.'
}

/** What each card says of itself, under it. */
export const FLOW_SAID = {
  caught: 'Caught on a walk',
  task: `Now a task, due ${STORY_DAY}`,
  gem: 'A gem, with a question for Review'
}

export const FLOW_LAST = 'Nothing copied out: each one keeps a link to its note.'

/**
 * How far it has got: `shown` cards set down (the caught thought, the note,
 * the task, the gem), the line `picked` with the bar over it and whether its
 * button is `pressed`, `lit` lines marked in the note, the gem's question
 * typed so far, and the closing line.
 */
export type FlowShot = { shown: number; picked: 'task' | 'gem' | null; pressed: boolean; lit: number; question: string; last: boolean }
export const FLOW_START: FlowShot = { shown: 1, picked: null, pressed: false, lit: 0, question: '', last: false }
export const FLOW_END: FlowShot = { shown: 4, picked: null, pressed: false, lit: 2, question: FLOW_WORDS.question, last: true }

const CARD = 'rounded-xl border border-foreground/10 bg-popover text-popover-foreground shadow-(--mf-panel-shadow)'
const EDITOR_FONT = { fontFamily: 'var(--mf-font, "Fraunces Variable", Georgia, serif)', fontVariationSettings: '"SOFT" 20, "WONK" 1' }
const SUB = 'text-[0.9375rem] leading-snug text-(--mf-wl-body)'
const HEAD = 'flex items-center gap-1.5 text-[0.8125rem] font-medium text-(--mf-wl-quiet)'
const SPINE = 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)'

/** The lines drawn between the cards: from where each one leaves to where it lands, in its colour. */
const LINKS: { id: string; from: string; to: string; at: number; ink: string }[] = [
  { id: 'note', from: 'caught', to: 'note', at: 2, ink: SPINE },
  { id: 'task', from: 'line:task', to: 'task', at: 3, ink: `color-mix(in oklab, ${HUE.task.ink} 70%, transparent)` },
  { id: 'gem', from: 'line:gem', to: 'gem', at: 4, ink: `color-mix(in oklab, ${HUE.gem.ink} 75%, transparent)` }
]

/** A card set down in its place: it fades and grows in, never moves anything else. */
function Landed({ id, on, quiet, className = '', children }: { id: string; on: boolean; quiet: boolean; className?: string; children: ReactNode }): React.JSX.Element {
  return (
    <motion.div data-flow={id} data-shown={on || undefined} className={`relative w-full ${className}`}
      initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.95 }} transition={quiet ? { duration: 0 } : { duration: 0.35, ease: EASE }}>
      {children}
    </motion.div>
  )
}

/** The selection bar over a picked line, as the editor shows it (selection-actions.tsx): Capture, Gem, Task, the one chosen pressed. A picture of it: it takes no pointer and no focus. */
function Bar({ on, pressed }: { on: 'task' | 'gem'; pressed: boolean }): React.JSX.Element {
  const button = (name: string, Icon: typeof Inbox, lit: boolean): React.JSX.Element => (
    <span className={`flex h-7 items-center gap-1.5 rounded-md px-2 transition-[background-color,color,box-shadow] duration-150 ${lit ? 'bg-accent text-foreground shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_45%,transparent)]' : ''}`}>
      <Icon className="size-4" />{name}
    </span>
  )
  return (
    <motion.span data-overlay data-bar={on} inert aria-hidden className="pointer-events-none absolute -top-10 left-[1.4em] z-20 flex items-center gap-0.5 rounded-lg border border-foreground/15 bg-[color-mix(in_oklab,var(--foreground)_5%,var(--popover))] p-1 font-sans text-[0.8125rem] whitespace-nowrap text-muted-foreground shadow-(--mf-panel-shadow) select-none"
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={spring.fast}>
      {button('Capture', Inbox, false)}
      {button('Gem', Gem, pressed && on === 'gem')}
      {button('Task', ListTodo, pressed && on === 'task')}
    </motion.span>
  )
}

export function FlowTree({ shot, quiet }: { shot: FlowShot; quiet: boolean }): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [spots, setSpots] = useState<Record<string, { x0: number; x1: number; y: number }>>({})
  // The task, as the app reads it from the note's line: its name, and the day it read.
  const task = useMemo(() => readTask(FLOW_WORDS.task), [])
  const day = task.due ? when(task.due, task.allDay) : STORY_DAY
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const watch = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  // Where each card and each picked line sits, by layout (not by its scale while it lands), so a line leaves the very words it came from.
  useLayoutEffect(() => {
    const el = root.current
    if (!el || !size.w) return
    const place = (one: HTMLElement): { x0: number; x1: number; y: number } => {
      let [x, y] = [0, 0]
      for (let at: HTMLElement | null = one; at && at !== el; at = at.offsetParent as HTMLElement | null) (x += at.offsetLeft, (y += at.offsetTop))
      return { x0: x, x1: x + one.offsetWidth, y: y + one.offsetHeight / 2 }
    }
    const next: Record<string, { x0: number; x1: number; y: number }> = {}
    for (const one of el.querySelectorAll<HTMLElement>('[data-flow]')) next[one.dataset.flow!] = place(one)
    // A picked line leaves from the note's own edge, at the line's height.
    for (const one of el.querySelectorAll<HTMLElement>('[data-mark]')) next[`line:${one.dataset.mark}`] = { ...next.note, y: place(one).y }
    setSpots(next)
  }, [size.w, size.h])
  const draw = quiet ? { duration: 0 } : { duration: 0.45, ease: EASE }
  const fade = quiet ? { duration: 0 } : { duration: 0.3, ease: EASE }
  const typing = shot.question.length > 0 && shot.question !== FLOW_WORDS.question
  return (
    <figure aria-label="The thought caught on a walk becomes a note; one of its lines becomes a task, another a gem with a question for Review" className="flex min-h-0 w-full flex-1 flex-col justify-center">
      <div ref={root} className="relative flex shrink-0 flex-col">
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
          {LINKS.map((link) => {
            const [from, to] = [spots[link.from], spots[link.to]]
            if (!from || !to) return null
            const [x1, y1, x2, y2] = [from.x1, from.y, to.x0, to.y]
            const mx = (x1 + x2) / 2
            const on = shot.shown >= link.at
            return (
              <motion.path key={link.id} data-link={link.id} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={link.ink} strokeWidth={link.at > 2 ? 2 : 1.5} strokeLinecap="round"
                initial={false} animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={draw} />
            )
          })}
        </svg>
        {/* The caught thought on the left, the note it grew into, and what the note becomes, one above the other, at the right. */}
        <div className="grid shrink-0 items-center gap-x-[clamp(1.25rem,3.2vw,2.75rem)]" style={{ gridTemplateColumns: COLUMNS }}>
          <div className="flex flex-col gap-2">
            <Landed id="caught" on={shot.shown >= 1} quiet={quiet}>
              {/* Quick capture, as the box draws itself: the words in the editor's face, the kind chip, Create. */}
              <div className="overflow-hidden rounded-[14px] border border-foreground/10 bg-popover text-popover-foreground" style={{ boxShadow: 'var(--mf-panel-shadow), inset 0 1px 0 rgb(255 255 255 / 0.06)' }}>
                <p className="px-3.5 pt-3 pb-2 text-[1rem] leading-snug text-foreground" style={EDITOR_FONT}>{FLOW_WORDS.caught}</p>
                <div className="flex items-center gap-1.5 bg-linear-to-t from-[var(--accent)]/40 px-3 pt-1.5 pb-2.5">
                  <span className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-primary px-2 text-[0.75rem] font-medium text-foreground">
                    <NotebookText className="size-3.5" style={{ color: 'var(--tt-color-text-gray)' }} />Note
                  </span>
                </div>
              </div>
            </Landed>
            <p className={SUB}>{FLOW_SAID.caught}</p>
          </div>
          <Landed id="note" on={shot.shown >= 2} quiet={quiet}>
            <div className={`${CARD} px-4 pt-3 pb-4`}>
              <p className={HEAD}><Article className="size-3.5" style={{ color: 'var(--tt-color-text-brown)' }} />Note</p>
              <p className="mt-1 font-heading text-[1.1875rem] leading-snug font-semibold text-foreground">{FLOW_WORDS.note}</p>
              <div className="mt-2 flex flex-col gap-1.5 border-t border-foreground/10 pt-2.5 text-[0.9375rem] leading-snug text-foreground" style={EDITOR_FONT}>
                {/* The quote caught beside the thought, linked in as the editor draws a link: its kind's icon and colour, then its words. */}
                <p className="text-foreground/90">
                  <span data-accent-ok className="rounded-[0.25rem] bg-(--mf-surface) px-[0.125rem] text-[var(--tt-brand-color-400)]">
                    <Quote className="mr-1 inline-block size-[0.85em] align-[-0.1em]" style={{ color: 'var(--tt-color-text-purple)' }} />Do or do not. There is no try.
                  </span>
                </p>
                {LINES.map((line) => {
                  const hue = line.becomes && HUE[line.becomes]
                  const lit = !!line.becomes && shot.lit >= (line.becomes === 'task' ? 1 : 2)
                  const picked = !!line.becomes && shot.picked === line.becomes
                  const Mark = line.becomes === 'task' ? Check : Gem
                  return (
                    // A div, not a p: the tick mark draws itself inside a div of its own.
                    <div key={line.text} className="relative pl-[1.4em]">
                      {/* Picked: the selection's own colour behind the words, and the bar over them. Then marked: a band of what it became, and its mark in the margin. The words never move. */}
                      {hue && (
                        <>
                          <motion.span aria-hidden className="absolute -inset-x-1 -inset-y-0.5 rounded-[5px] bg-primary/25"
                            initial={false} animate={{ opacity: picked && !lit ? 1 : 0 }} transition={fade} />
                          <motion.span aria-hidden data-wash={line.becomes} className="absolute -inset-x-1 -inset-y-0.5 rounded-[5px]" style={{ background: hue.wash }}
                            initial={false} animate={{ opacity: lit ? 1 : 0 }} transition={fade} />
                          <motion.span aria-hidden data-ink={line.becomes} className="absolute top-[0.3em] left-0 flex" style={{ color: hue.ink }}
                            initial={false} animate={{ opacity: lit ? 1 : 0, scale: lit ? 1 : 0.6 }} transition={fade}>
                            <Mark className="size-[0.95em]" />
                          </motion.span>
                        </>
                      )}
                      <span data-mark={line.becomes} className="relative">{line.text}</span>
                      <AnimatePresence>{picked && line.becomes && <Bar key="bar" on={line.becomes} pressed={shot.pressed} />}</AnimatePresence>
                    </div>
                  )
                })}
              </div>
            </div>
          </Landed>
          <div className={`flex flex-col gap-[clamp(0.875rem,3vh,1.75rem)] ${BRANCH}`}>
            <Landed id="task" on={shot.shown >= 3} quiet={quiet}>
              {/* A task, as the Tasks list draws its row: the box, the name, its day under it. */}
              <div className={`${CARD} px-3.5 pt-3 pb-3`}>
                <div className={HEAD}><span data-ink="task" className="flex" style={{ color: HUE.task.ink }}><Check className="size-3.5" /></span>Task</div>
                <div className="mt-1.5 flex items-start gap-2.5">
                  <svg aria-hidden viewBox="0 0 16 16" className="mt-[0.2rem] size-4 shrink-0 text-foreground/40"><circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                  <div className="flex min-w-0 flex-col items-start gap-1.5">
                    <span className="text-[0.9375rem] leading-snug text-foreground">{task.title}</span>
                    <span data-wash="task" className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.8125rem] font-medium whitespace-nowrap tabular-nums" style={{ background: HUE.task.wash, color: HUE.task.ink }}>
                      <CalendarDays className="size-3.5" />{day}
                    </span>
                  </div>
                </div>
                <p className={`${SUB} mt-2`}>{FLOW_SAID.task}</p>
              </div>
            </Landed>
            <Landed id="gem" on={shot.shown >= 4} quiet={quiet}>
              {/* A gem, as its card keeps one: the line on its own, and the question it answers, for Review (reword.tsx). */}
              <div className={`${CARD} px-3.5 pt-3 pb-3`}>
                <p className={HEAD}><span data-ink="gem" className="flex" style={{ color: HUE.gem.ink }}><Gem className="size-3.5" /></span>Gem</p>
                <p className="mt-1.5 font-heading text-[1.0625rem] leading-snug text-foreground">
                  <span data-wash="gem" className="rounded-[3px] [box-decoration-break:clone] px-0.5" style={{ background: HUE.gem.wash }}>{FLOW_WORDS.gem}</span>
                </p>
                <p data-question className="mt-2 flex min-h-8 items-center rounded-md border border-foreground/10 px-2 text-[0.875rem] text-foreground">
                  {shot.question || <span className="text-muted-foreground">The question it answers, for review</span>}
                  {typing && !quiet && <span className="mf-ghost-caret" data-typing="" />}
                </p>
                <p className={`${SUB} mt-2`}>{FLOW_SAID.gem}</p>
              </div>
            </Landed>
          </div>
        </div>
      </div>
      <motion.p data-flow-last className="mt-[clamp(1rem,3.5vh,2rem)] shrink-0 font-heading text-[clamp(1.25rem,min(2.6vw,3.8vh),2rem)] leading-tight text-balance text-foreground"
        initial={false} animate={{ opacity: shot.last ? 1 : 0, y: shot.last ? 0 : 8 }} transition={quiet ? { duration: 0 } : { duration: 0.45, ease: EASE }}>
        {FLOW_LAST}
      </motion.p>
    </figure>
  )
}

/** The caught thought, the note (the widest, so its lines mostly keep to one), and what it becomes. */
const COLUMNS = 'minmax(0,0.8fr) minmax(0,1.6fr) minmax(0,1.3fr)'
/** Room before what the note becomes, for the two lines to part. */
const BRANCH = 'pl-[clamp(0.5rem,2.5vw,2rem)]'
