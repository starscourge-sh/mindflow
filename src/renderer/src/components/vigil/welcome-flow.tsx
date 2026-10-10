import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Gem, Sparkles } from 'lucide-react'
import { EASE } from '@/lib/motion'
import { alive } from '@/components/ui/alive-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import StackIcon from '@/components/ui/stack-icon'
import CheckedIcon from '@/components/ui/checked-icon'

/**
 * The welcome's "The flow": how most notes are born, drawn as the Family
 * tree draws a note's lineage (lineage.tsx), left to right along a time
 * axis. A spark at the bus stop; caught in quick capture; written out into a
 * note, its lines written in; two of those lines lit, and a new thought
 * branching off each, caught from the note; then the same two cards change
 * kind where they stand, one into a task and one into a gem Review asks
 * about, what they were left faint behind them. Each line draws with the
 * card it leads to, and each step's label lands under its moment on the
 * axis with a bold lead-in. Still (a skip, Motion off, Reduce motion), it is
 * the whole tree at once.
 */

// The Family tree's own drawings for each kind, in the colours its cards have elsewhere.
const Capture = alive(StackIcon)
const Article = alive(FileDescriptionIcon)
const Task = alive(CheckedIcon)
const LOOK = {
  spark: { Icon: Sparkles, tint: 'orange' },
  capture: { Icon: Capture, tint: 'blue' },
  article: { Icon: Article, tint: 'brown' },
  task: { Icon: Task, tint: 'green' },
  nugget: { Icon: Gem, tint: 'pink' }
} as const
type Look = keyof typeof LOOK

/** A card in the family: `span` slots wide from `slot`; `then` is what it turns into at step 5, in place. */
type Kin = { id: string; slot: number; span: number; row: -1 | 0 | 1; kind: Look; title: string; is: string; step: number; parent?: string; from?: string; then?: { kind: Look; is: string } }

/** The family, oldest on the left. `step` is when each one arrives; `from` is the note's line it was caught from. */
const FAMILY: Kin[] = [
  { id: 'spark', slot: 0, span: 1, row: 0, kind: 'spark', title: 'At the bus stop', is: 'A passing thought', step: 1 },
  { id: 'caught', slot: 1, span: 1, row: 0, kind: 'capture', title: 'Who tells the story?', is: 'Caught in quick capture', step: 2, parent: 'spark' },
  { id: 'note', slot: 2, span: 1, row: 0, kind: 'article', title: 'Who is the monster?', is: 'Note', step: 3, parent: 'caught' },
  { id: 'read', slot: 3, span: 2, row: -1, kind: 'capture', title: 'Read Paradise Lost', is: 'Caught from this note', step: 4, parent: 'note', from: 'reads', then: { kind: 'task', is: 'Now a task, due Saturday' } },
  { id: 'speak', slot: 3, span: 2, row: 1, kind: 'capture', title: 'He learns to speak', is: 'Caught from this note', step: 4, parent: 'note', from: 'speaks', then: { kind: 'nugget', is: 'Now a gem, asked in Review' } }
]

/** The note's own lines, written in as it grows; two are lit once a thought is caught from them. */
const LINES: [string, string | null][] = [['Victor runs from it.', null], ['It reads Paradise Lost.', 'reads'], ['It learns to speak.', 'speaks']]

/** When each moment happened, along the axis. */
const WHEN = ['Mon 8:12', 'Mon 8:13', 'Wed 21:40', 'Wed 21:52', 'Thu 7:30']

/** What each step is, under its moment: a bold lead-in, then the rest. */
const SAID: [string, string][] = [
  ['A spark.', 'An idea at the bus stop.'],
  ['Caught', 'in quick capture, before it goes.'],
  ['Fleshed out', 'into a note, when there is time.'],
  ['New ideas', 'come from lines you write, each caught from the note.'],
  ['Put to work:', 'one becomes a task, one a gem for Review.']
]

export const FLOW_LAST = 'Most notes start as a passing thought. Vigil keeps the whole family.'

export type FlowShot = { step: number; grown: boolean; last: boolean }

const SLOTS = 5
// From the middle row to the one above or below, in px.
const ROW = 66
const LINE = 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)'

export function FlowTree({ shot, quiet }: { shot: FlowShot; quiet: boolean }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  // Where each card's edges and the note's lit lines sit, measured: a line leaves the very line it came from.
  const [spots, setSpots] = useState<Record<string, { x0: number; x1: number; y: number }>>({})
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = (): void => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const cw = size.w / SLOTS
  const mid = size.h / 2
  const at = (kin: Kin): { x: number; y: number; w: number } => {
    // The note a little wider than the rest, so each of its lines stays on one line.
    const w = kin.id === 'note' ? Math.min(cw - 10, 260) : Math.min(kin.span * cw - 28, kin.span > 1 ? 300 : 240)
    return { x: kin.slot * cw + (kin.span * cw - w) / 2, y: mid + kin.row * ROW, w }
  }
  useLayoutEffect(() => {
    const root = box.current
    if (!root || !size.w) return
    const next: Record<string, { x0: number; x1: number; y: number }> = {}
    for (const card of root.querySelectorAll<HTMLElement>('[data-flow]')) {
      const kin = FAMILY.find((one) => one.id === card.dataset.flow)!
      const { x, y, w } = at(kin)
      const top = y - card.offsetHeight / 2
      next[kin.id] = { x0: x, x1: x + w, y }
      for (const line of card.querySelectorAll<HTMLElement>('[data-from]')) {
        let off = line.offsetHeight / 2
        for (let el: HTMLElement | null = line; el && el !== card; el = el.offsetParent as HTMLElement | null) off += el.offsetTop
        next[`line:${line.dataset.from}`] = { x0: x, x1: x + w, y: top + off }
      }
    }
    setSpots(next)
  }, [size.w, size.h]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (kin: Kin): boolean => shot.step >= kin.step
  // A line and the card it leads to arrive together: no line ever runs on to nothing.
  const draw = quiet ? { duration: 0 } : { duration: 0.4, ease: EASE }
  const land = quiet ? { duration: 0 } : { duration: 0.35, ease: EASE }
  return (
    <figure aria-label="How a thought grows: a spark, caught, written out into a note, two new thoughts caught from its lines, then one becomes a task and one a gem for Review" className="flex min-h-0 w-full flex-1 flex-col">
      <div ref={box} className="relative min-h-[13rem] flex-1">
        {size.w > 0 && (
          <>
            <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
              {FAMILY.filter((kin) => kin.parent).map((kin) => {
                const from = spots[kin.from ? `line:${kin.from}` : kin.parent!]
                const to = spots[kin.id]
                if (!from || !to) return null
                const [x1, y1, x2, y2] = [from.x1, from.y, to.x0, to.y]
                const mx = (x1 + x2) / 2
                return (
                  <motion.path key={kin.id} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={LINE} strokeWidth={1.5}
                    initial={false} animate={{ pathLength: shown(kin) ? 1 : 0, opacity: shown(kin) ? 1 : 0 }} transition={draw} />
                )
              })}
            </svg>
            {FAMILY.map((kin) => {
              const { x, y, w } = at(kin)
              const turned = !!kin.then && shot.step >= 5
              const look = turned ? kin.then!.kind : kin.kind
              const { Icon, tint } = LOOK[look]
              const face = `flex flex-col gap-1 rounded-lg border bg-popover px-2.5 py-2 text-popover-foreground shadow-(--mf-panel-shadow) ${kin.kind === 'spark' ? 'border-dashed border-foreground/25' : 'border-foreground/10'}`
              return (
                <motion.div key={kin.id} data-flow={kin.id} className="absolute -translate-y-1/2" style={{ left: x, top: y, width: w }}
                  initial={false} animate={{ opacity: shown(kin) ? 1 : 0, scale: shown(kin) ? 1 : 0.92 }} transition={land}>
                  {/* What it was, left faint behind it once it has changed kind: the card's edge only, so nothing of it is cut off by the card in front. */}
                  {kin.then && (
                    <motion.div aria-hidden className={`${face} absolute inset-0 border-dashed`} initial={false}
                      animate={{ opacity: turned ? 0.7 : 0, x: turned ? -14 : 0, y: turned ? -14 : 0 }} transition={land} />
                  )}
                  <div className={`${face} relative`}>
                    <p className="flex items-start gap-1.5 text-[0.8125rem] leading-snug font-medium text-foreground">
                      <motion.span key={look} className="mt-[0.15em] shrink-0" initial={quiet ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', duration: 0.4, bounce: 0.3 }}>
                        <Icon className="size-3.5" style={{ color: `var(--tt-color-text-${tint})` }} />
                      </motion.span>
                      <span className="min-w-0">{kin.title}</span>
                    </p>
                    <motion.p key={turned ? 'then' : 'is'} className="pl-5 text-[0.75rem] leading-tight text-muted-foreground" initial={quiet || !turned ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={land}>
                      {turned ? kin.then!.is : kin.is}
                    </motion.p>
                    {/* The note's own lines, written in as it grows; the two a thought was caught from, lit. */}
                    {kin.id === 'note' && (
                      <div className="mt-1 flex flex-col gap-0.5 border-t border-foreground/10 pt-1.5 text-[0.75rem] leading-snug whitespace-nowrap text-foreground/80">
                        {LINES.map(([line, from], i) => (
                          <motion.span key={line} data-from={from ?? undefined} className={`rounded-[3px] px-0.5 -mx-0.5 transition-colors duration-300 ${from && shot.step >= 4 ? 'bg-primary/15 text-foreground' : ''}`}
                            initial={false} animate={{ opacity: shot.grown ? 1 : 0 }} transition={quiet ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: 0.1 + i * 0.18 }}>
                            {line}
                          </motion.span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </>
        )}
      </div>
      {/* The time axis: drawn as far as the story has got, each moment on it. */}
      <div aria-hidden className="relative mt-3 h-8 shrink-0">
        <motion.span className="absolute top-1 h-px origin-left bg-foreground/30" style={{ left: `${100 / SLOTS / 2}%`, width: `${100 - 100 / SLOTS}%` }}
          initial={false} animate={{ scaleX: Math.max(0, shot.step - 1) / (SLOTS - 1) }} transition={draw} />
        {WHEN.map((when, i) => (
          <motion.span key={when} className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1" style={{ left: `${((i + 0.5) * 100) / SLOTS}%` }}
            initial={false} animate={{ opacity: shot.step > i ? 1 : 0 }} transition={land}>
            <span className="size-2 rounded-full bg-foreground/50" />
            <span className="text-[0.75rem] whitespace-nowrap text-(--mf-wl-quiet) tabular-nums">{when}</span>
          </motion.span>
        ))}
      </div>
      {/* Each step said under its moment, a bold lead-in first. */}
      <ol className="mt-2 grid shrink-0" style={{ gridTemplateColumns: `repeat(${SLOTS}, minmax(0, 1fr))` }}>
        {SAID.map(([lead, rest], i) => (
          <motion.li key={lead} className="px-2 text-center text-[clamp(0.8125rem,min(1.5vw,2.2vh),1rem)] leading-snug text-balance text-foreground"
            initial={false} animate={{ opacity: shot.step > i ? 1 : 0, y: shot.step > i ? 0 : 6 }} transition={land}>
            <strong className="font-semibold">{lead}</strong> {rest}
          </motion.li>
        ))}
      </ol>
      <motion.p className="mt-[clamp(0.75rem,3vh,1.75rem)] shrink-0 text-center font-heading text-[clamp(1.25rem,min(2.6vw,3.8vh),2rem)] leading-tight text-balance text-foreground"
        initial={false} animate={{ opacity: shot.last ? 1 : 0, y: shot.last ? 0 : 8 }} transition={quiet ? { duration: 0 } : { duration: 0.45, ease: EASE }}>
        {FLOW_LAST}
      </motion.p>
    </figure>
  )
}
