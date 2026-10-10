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
 * note, the line growing into a page; two new ideas branching off it while
 * writing, each caught and linked back; then one becomes a task and the
 * other a gem Review asks about. Each line draws in order, and each step's
 * label lands under its column with a bold lead-in. Still (a skip, Motion
 * off, Reduce motion), it is the whole tree at once.
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

type Kin = { id: string; col: number; row: -1 | 0 | 1; kind: keyof typeof LOOK; title: string; is: string; step: number; parent?: string }

/** The family, oldest on the left. `step` is when each one arrives. */
const FAMILY: Kin[] = [
  { id: 'spark', col: 0, row: 0, kind: 'spark', title: 'At the bus stop', is: 'A passing thought', step: 1 },
  { id: 'caught', col: 1, row: 0, kind: 'capture', title: 'Is the monster the one telling the truth?', is: 'Capture', step: 2, parent: 'spark' },
  { id: 'note', col: 2, row: 0, kind: 'article', title: 'Who is the monster?', is: 'Note', step: 3, parent: 'caught' },
  { id: 'read', col: 3, row: -1, kind: 'capture', title: 'Read Paradise Lost', is: 'Capture, links back', step: 4, parent: 'note' },
  { id: 'wall', col: 3, row: 1, kind: 'capture', title: 'He learns to speak through a wall', is: 'Capture, links back', step: 4, parent: 'note' },
  { id: 'task', col: 4, row: -1, kind: 'task', title: 'Read Paradise Lost', is: 'Task, due Saturday', step: 5, parent: 'read' },
  { id: 'gem', col: 4, row: 1, kind: 'nugget', title: 'He learns to speak through a wall', is: 'Gem, asked in Review', step: 5, parent: 'wall' }
]

/** When each column happened, along the axis. */
const WHEN = ['Mon 8:12', 'Mon 8:13', 'Wed 21:40', 'Wed 21:52', 'Thu 7:30']

/** What each step is, under its column: a bold lead-in, then the rest. */
const SAID: [string, string][] = [
  ['A spark.', 'An idea at the bus stop.'],
  ['Caught', 'in quick capture, before it goes.'],
  ['Fleshed out', 'into a note, when there is time.'],
  ['New ideas', 'branch off while you write, each linked back.'],
  ['Put to work:', 'one becomes a task, one a gem for Review.']
]

export const FLOW_LAST = 'Most notes start as a passing thought. Vigil keeps the whole family.'

export type FlowShot = { step: number; grown: boolean; last: boolean }

const COLS = 5
// The tree's measures, in px.
const ROW = 64 // from the middle row to the one above or below
const LINE = 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)'

export function FlowTree({ shot, quiet }: { shot: FlowShot; quiet: boolean }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = (): void => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const cw = size.w / COLS
  const nw = Math.min(cw - 28, 240)
  const mid = size.h / 2
  const at = (kin: Kin): { x: number; y: number } => ({ x: kin.col * cw + (cw - nw) / 2, y: mid + kin.row * ROW })
  const byId = new Map(FAMILY.map((kin) => [kin.id, kin]))
  const shown = (kin: Kin): boolean => shot.step >= kin.step
  // A line and what it leads to arrive together: no line ever runs on to nothing.
  const draw = quiet ? { duration: 0 } : { duration: 0.4, ease: EASE }
  const land = quiet ? { duration: 0 } : { duration: 0.35, ease: EASE }
  return (
    <figure aria-label="How a thought grows: a spark, caught, written out, branching into new ideas, then a task and a gem for Review" className="flex min-h-0 w-full flex-1 flex-col">
      <div ref={box} className="relative min-h-[12rem] flex-1">
        {size.w > 0 && (
          <>
            <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
              {FAMILY.filter((kin) => kin.parent).map((kin) => {
                const parent = byId.get(kin.parent!)!
                const [a, b] = [at(parent), at(kin)]
                const [x1, y1, x2, y2] = [a.x + nw, a.y, b.x, b.y]
                const mx = (x1 + x2) / 2
                return (
                  <motion.path key={kin.id} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={LINE} strokeWidth={1.5}
                    initial={false} animate={{ pathLength: shown(kin) ? 1 : 0, opacity: shown(kin) ? 1 : 0 }} transition={draw} />
                )
              })}
            </svg>
            {FAMILY.map((kin) => {
              const { x, y } = at(kin)
              const { Icon, tint } = LOOK[kin.kind]
              const page = kin.id === 'note'
              return (
                <motion.div key={kin.id} data-flow={kin.id} className="absolute -translate-y-1/2" style={{ left: x, top: y, width: nw }}
                  initial={false} animate={{ opacity: shown(kin) ? 1 : 0, scale: shown(kin) ? 1 : 0.92 }} transition={land}>
                  <div className={`flex flex-col gap-1 rounded-lg border bg-popover px-2.5 py-2 text-popover-foreground shadow-(--mf-panel-shadow) ${kin.kind === 'spark' ? 'border-dashed border-foreground/25' : 'border-foreground/10'}`}>
                    <p className="flex items-start gap-1.5 text-[0.8125rem] leading-snug font-medium text-foreground">
                      <Icon className="mt-[0.15em] size-3.5 shrink-0" style={{ color: `var(--tt-color-text-${tint})` }} />
                      <span className="line-clamp-2 min-w-0">{kin.title}</span>
                    </p>
                    {/* The line grows into a page: its lines drawn in under the title. */}
                    {page && (
                      <motion.div className="flex flex-col gap-1.5 overflow-hidden" initial={false} animate={{ height: shot.grown ? 'auto' : 0, opacity: shot.grown ? 1 : 0 }} transition={quiet ? { duration: 0 } : { duration: 0.45, ease: EASE }}>
                        {[94, 80, 88, 62, 74].map((w, i) => (
                          <motion.span key={i} className="h-1.5 origin-left rounded-full bg-foreground/12" style={{ width: `${w}%` }}
                            initial={false} animate={{ scaleX: shot.grown ? 1 : 0 }} transition={quiet ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: 0.15 + i * 0.08 }} />
                        ))}
                      </motion.div>
                    )}
                    <p className="pl-5 text-[0.75rem] leading-tight text-muted-foreground">{kin.is}</p>
                  </div>
                </motion.div>
              )
            })}
          </>
        )}
      </div>
      {/* The time axis: drawn as far as the story has got, each column's moment on it. */}
      <div aria-hidden className="relative mt-3 h-8 shrink-0">
        <motion.span className="absolute top-1 h-px origin-left bg-foreground/30" style={{ left: `${100 / COLS / 2}%`, width: `${100 - 100 / COLS}%` }}
          initial={false} animate={{ scaleX: Math.max(0, shot.step - 1) / (COLS - 1) }} transition={draw} />
        {WHEN.map((when, col) => (
          <motion.span key={when} className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1" style={{ left: `${((col + 0.5) * 100) / COLS}%` }}
            initial={false} animate={{ opacity: shot.step > col ? 1 : 0 }} transition={land}>
            <span className="size-2 rounded-full bg-foreground/50" />
            <span className="text-[0.75rem] whitespace-nowrap text-(--mf-wl-quiet) tabular-nums">{when}</span>
          </motion.span>
        ))}
      </div>
      {/* Each step said under its column, a bold lead-in first. */}
      <ol className="mt-2 grid shrink-0" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
        {SAID.map(([lead, rest], col) => (
          <motion.li key={lead} className="px-2 text-center text-[clamp(0.8125rem,min(1.5vw,2.2vh),1rem)] leading-snug text-balance text-foreground"
            initial={false} animate={{ opacity: shot.step > col ? 1 : 0, y: shot.step > col ? 0 : 6 }} transition={land}>
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
