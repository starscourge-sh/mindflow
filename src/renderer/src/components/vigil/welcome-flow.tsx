import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { CalendarDays, Gem, NotebookText, Sparkles } from 'lucide-react'
import { EASE } from '@/lib/motion'
import { alive } from '@/components/ui/alive-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import { dayjs, when } from '../../../../main/dates'
import { readTask } from '../../../../main/task-words'

/**
 * The welcome's "The flow": how a passing thought becomes an essay's work,
 * one moment at a time. A spark on a walk; caught in quick capture; written
 * out into a note; two of its lines picked out, each in the colour of what
 * it becomes; then one becomes a task with its day and one a gem. Each
 * moment is said first, its time and what happened, under where it happens,
 * and then shown. Every card is drawn as the app draws it (the box, a note,
 * a task row with its date, a gem), and the task's day is read from the
 * note's own words by the same reader the app uses (task-words.ts). Still (a
 * skip, Motion off, Reduce motion), it is the whole family at once.
 */

const Article = alive(FileDescriptionIcon)
const Check = alive(CheckedIcon)

/** The two things the note becomes, each in its own colour: its mark in the note and its card share it. */
export const HUE = {
  task: { ink: 'var(--primary)', wash: 'color-mix(in oklab, var(--primary) 16%, transparent)' },
  gem: { ink: 'var(--tt-color-text-pink)', wash: 'color-mix(in oklab, var(--tt-color-text-pink) 22%, transparent)' }
} as const

/** The note's lines; the two picked out say what they become. */
const LINES: { text: string; becomes?: 'task' | 'gem' }[] = [
  { text: 'High digital resolution removes physical resistance.' },
  { text: 'Draft intro for film essay on Saturday', becomes: 'task' },
  { text: 'Perfection erases human presence.', becomes: 'gem' }
]

/** The family's words, for the sandbox to tell the same story (sandbox-seed.ts). */
export const FLOW_WORDS = {
  spark: 'Why old movies feel real',
  caught: 'Film grain and nostalgia',
  note: 'Texture and Authenticity in Cinema',
  lines: LINES.map((line) => line.text),
  task: LINES[1].text,
  gem: LINES[2].text
}

/** Each moment, said under where it happens: when, a bold lead-in, then the rest. */
export const FLOW_SAID: [string, string, string][] = [
  ['Mon 09:12', 'A spark:', 'An observation on a walk, in the archives or the reading room.'],
  ['Mon 09:13', 'Caught:', 'Secured in quick capture before context switches.'],
  ['Wed 21:40', 'Fleshed out:', 'Built into a structured note during deep work.'],
  ['Wed 21:52', 'Highlighted:', 'Key claims and actions selected directly from your prose.'],
  ['Thu 07:30', 'Put to work:', 'One becomes a writing milestone, one a thesis gem for Review.']
]

export const FLOW_LAST = 'Most good work starts as a passing thought. Vigil keeps the whole family.'

/** What the gem card says of itself: what a gem is, and that nothing was copied out to make it. */
export const GEM_SAID = ['Saved as a gem: a line worth keeping, on its own.', 'Straight from your writing: nothing to copy out.']

/**
 * How far the story has got: `said` moments told, `shown` cards set down
 * (spark, caught, note, task, gem), `lit` lines picked out in the note, and
 * the closing line.
 */
export type FlowShot = { said: number; shown: number; lit: number; last: boolean }

const CARD = 'rounded-xl border border-foreground/10 bg-popover text-popover-foreground shadow-(--mf-panel-shadow)'
const EDITOR_FONT = { fontFamily: 'var(--mf-font, "Fraunces Variable", Georgia, serif)', fontVariationSettings: '"SOFT" 20, "WONK" 1' }
const SUB = 'text-[0.875rem] leading-snug text-(--mf-wl-body)'
const SPINE = 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)'

/** The lines drawn between the cards: from where each one leaves to where it lands, in its colour. */
const LINKS: { id: string; from: string; to: string; at: number; ink: string }[] = [
  { id: 'caught', from: 'spark', to: 'caught', at: 2, ink: SPINE },
  { id: 'note', from: 'caught', to: 'note', at: 3, ink: SPINE },
  { id: 'task', from: 'line:task', to: 'task', at: 4, ink: `color-mix(in oklab, ${HUE.task.ink} 70%, transparent)` },
  { id: 'gem', from: 'line:gem', to: 'gem', at: 5, ink: `color-mix(in oklab, ${HUE.gem.ink} 75%, transparent)` }
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

export function FlowTree({ shot, quiet }: { shot: FlowShot; quiet: boolean }): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [spots, setSpots] = useState<Record<string, { x0: number; x1: number; y: number }>>({})
  // The task, as the app reads it from the note's line: its name, and the day it read.
  const task = useMemo(() => readTask(FLOW_WORDS.task), [])
  const day = task.due ? when(task.due, task.allDay) : dayjs().day(6).format('dddd')
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
  const fade = quiet ? { duration: 0 } : { duration: 0.35, ease: EASE }
  const said = (i: number): boolean => shot.said > i
  return (
    <figure aria-label="How a thought grows: a spark on a walk, caught in quick capture, written out into a note, two of its lines picked out, then one becomes a task and one a gem" className="flex min-h-0 w-full flex-1 flex-col justify-center">
      <div ref={root} className="relative flex shrink-0 flex-col">
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
          {LINKS.map((link) => {
            const [from, to] = [spots[link.from], spots[link.to]]
            if (!from || !to) return null
            const [x1, y1, x2, y2] = [from.x1, from.y, to.x0, to.y]
            const mx = (x1 + x2) / 2
            const on = shot.shown >= link.at
            return (
              <motion.path key={link.id} data-link={link.id} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={link.ink} strokeWidth={link.at > 3 ? 2 : 1.5} strokeLinecap="round"
                initial={false} animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={draw} />
            )
          })}
        </svg>
        {/* The family, oldest on the left; what the note becomes, one above the other, at the right. */}
        <div className="grid shrink-0 items-center gap-x-[clamp(1.25rem,3.2vw,2.75rem)]" style={{ gridTemplateColumns: COLUMNS }}>
          <Landed id="spark" on={shot.shown >= 1} quiet={quiet}>
            <div className="flex flex-col gap-1 rounded-xl border border-dashed border-foreground/30 bg-popover px-3 py-2.5 text-popover-foreground">
              <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-(--mf-wl-quiet)"><Sparkles className="size-3.5" style={{ color: 'var(--tt-color-text-orange)' }} />A thought</p>
              <p className="font-heading text-[1rem] leading-snug text-foreground">{FLOW_WORDS.spark}</p>
              <p className={SUB}>Overheard on a walk</p>
            </div>
          </Landed>
          <Landed id="caught" on={shot.shown >= 2} quiet={quiet}>
            {/* Quick capture, as the box draws itself: the words in the editor's face, the kind chip, Create. */}
            <div className="overflow-hidden rounded-[14px] border border-foreground/10 bg-popover text-popover-foreground" style={{ boxShadow: 'var(--mf-panel-shadow), inset 0 1px 0 rgb(255 255 255 / 0.06)' }}>
              <div className="px-3.5 pt-3 pb-1.5">
                <p className="text-[1rem] leading-snug text-foreground" style={EDITOR_FONT}>{FLOW_WORDS.caught}</p>
                <p className={`${SUB} mt-1`}>Saved in seconds</p>
              </div>
              <div className="flex items-center gap-1.5 bg-linear-to-t from-[var(--accent)]/40 px-3 pt-1.5 pb-2.5">
                <span className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-primary px-2 text-[0.75rem] font-medium text-foreground">
                  <NotebookText className="size-3.5" style={{ color: 'var(--tt-color-text-gray)' }} />Note
                </span>
                <span className="flex-1" />
                <span className="inline-flex h-6 items-center gap-1 rounded-md bg-secondary px-2 text-[0.75rem] font-medium text-secondary-foreground">Create</span>
              </div>
            </div>
          </Landed>
          <Landed id="note" on={shot.shown >= 3} quiet={quiet}>
            <div className={`${CARD} px-3.5 pt-3 pb-3.5`}>
              <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-(--mf-wl-quiet)">
                <Article className="size-3.5" style={{ color: 'var(--tt-color-text-brown)' }} />Note
              </p>
              <p className="mt-1 font-heading text-[1.0625rem] leading-snug text-foreground">{FLOW_WORDS.note}</p>
              <div className="mt-1.5 flex flex-col gap-1 border-t border-foreground/10 pt-2 text-[0.9375rem] leading-snug text-foreground" style={EDITOR_FONT}>
                {LINES.map((line) => {
                  const hue = line.becomes && HUE[line.becomes]
                  const lit = !!line.becomes && shot.lit >= (line.becomes === 'task' ? 1 : 2)
                  const Mark = line.becomes === 'task' ? Check : Gem
                  return (
                    <p key={line.text} className="relative pl-[1.4em]">
                      {/* Picked out: a band of its colour behind the whole line, and its mark in the margin. Each fades in; the words never move. */}
                      {hue && (
                        <>
                          <motion.span aria-hidden data-wash={line.becomes} className="absolute -inset-x-1 -inset-y-0.5 rounded-[5px]" style={{ background: hue.wash }}
                            initial={false} animate={{ opacity: lit ? 1 : 0 }} transition={fade} />
                          <motion.span aria-hidden data-ink={line.becomes} className="absolute top-[0.3em] left-0 flex" style={{ color: hue.ink }}
                            initial={false} animate={{ opacity: lit ? 1 : 0, scale: lit ? 1 : 0.6 }} transition={fade}>
                            <Mark className="size-[0.95em]" />
                          </motion.span>
                        </>
                      )}
                      <span data-mark={line.becomes} className="relative">{line.text}</span>
                    </p>
                  )
                })}
              </div>
            </div>
          </Landed>
          <div className={`flex flex-col gap-[clamp(0.875rem,3vh,1.75rem)] ${BRANCH}`}>
            <Landed id="task" on={shot.shown >= 4} quiet={quiet}>
              {/* A task, as the Tasks list draws its row: the box, the name, its day under it. */}
              <div className={`${CARD} px-3.5 pt-3 pb-3`}>
                <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-(--mf-wl-quiet)"><span data-ink="task" className="flex" style={{ color: HUE.task.ink }}><Check className="size-3.5" /></span>Task</p>
                <div className="mt-1.5 flex items-start gap-2.5">
                  <svg aria-hidden viewBox="0 0 16 16" className="mt-[0.2rem] size-4 shrink-0 text-foreground/40"><circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                  <div className="flex min-w-0 flex-col items-start gap-1.5">
                    <span className="text-[0.9375rem] leading-snug text-foreground">{task.title}</span>
                    <span data-wash="task" className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.8125rem] font-medium whitespace-nowrap tabular-nums" style={{ background: HUE.task.wash, color: HUE.task.ink }}>
                      <CalendarDays className="size-3.5" />{day}
                    </span>
                  </div>
                </div>
                <p className={`${SUB} mt-2`}>Now a task, due {dayjs(task.due ?? undefined).format('dddd')}</p>
              </div>
            </Landed>
            <Landed id="gem" on={shot.shown >= 5} quiet={quiet}>
              {/* A gem, as Home and a preview mark one: the diamond, and the line kept on its own. */}
              <div className={`${CARD} px-3.5 pt-3 pb-3`}>
                <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-(--mf-wl-quiet)"><span data-ink="gem" className="flex" style={{ color: HUE.gem.ink }}><Gem className="size-3.5" /></span>Gem</p>
                <p className="mt-1.5 font-heading text-[1.0625rem] leading-snug text-foreground">
                  <span data-wash="gem" className="rounded-[3px] [box-decoration-break:clone] px-0.5" style={{ background: HUE.gem.wash }}>{FLOW_WORDS.gem}</span>
                </p>
                <p className={`${SUB} mt-2`}>{GEM_SAID[0]} {GEM_SAID[1]}</p>
              </div>
            </Landed>
          </div>
        </div>
        {/* Each moment told under where it happens, a time and a bold lead-in first: the note's two moments under the note. */}
        <div className="mt-[clamp(0.75rem,2.5vh,1.5rem)] grid shrink-0 items-start gap-x-[clamp(1.25rem,3.2vw,2.75rem)]" style={{ gridTemplateColumns: COLUMNS }}>
          {[[0], [1], [2, 3], [4]].map((moments) => (
            <div key={moments[0]} className={`flex flex-col gap-2 ${moments[0] === 4 ? BRANCH : ''}`}>
              {moments.map((i) => (
                <motion.p key={i} data-said={i} className="text-[clamp(0.875rem,min(1.35vw,2vh),1rem)] leading-snug text-pretty text-foreground"
                  initial={false} animate={{ opacity: said(i) ? 1 : 0, y: said(i) ? 0 : 4 }} transition={fade}>
                  <span className="font-medium text-(--mf-wl-quiet) tabular-nums">{FLOW_SAID[i][0]}</span> · <strong className="font-semibold">{FLOW_SAID[i][1]}</strong> {FLOW_SAID[i][2]}
                </motion.p>
              ))}
            </div>
          ))}
        </div>
      </div>
      <motion.p data-flow-last className="mt-[clamp(0.75rem,3vh,1.75rem)] shrink-0 font-heading text-[clamp(1.25rem,min(2.6vw,3.8vh),2rem)] leading-tight text-balance text-foreground"
        initial={false} animate={{ opacity: shot.last ? 1 : 0, y: shot.last ? 0 : 8 }} transition={quiet ? { duration: 0 } : { duration: 0.45, ease: EASE }}>
        {FLOW_LAST}
      </motion.p>
    </figure>
  )
}

/** Spark, caught, the note (a little wider, so its lines mostly keep to one), and what it becomes. */
const COLUMNS = 'minmax(0,0.85fr) minmax(0,0.95fr) minmax(0,1.45fr) minmax(0,1.55fr)'
/** Room before what the note becomes, for the two lines to part. */
const BRANCH = 'pl-[clamp(0.5rem,2.5vw,2rem)]'
