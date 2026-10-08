import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { alive, AliveIcon } from '@/components/ui/alive-icon'
import XIcon from '@/components/ui/x-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import { Minus } from 'lucide-react'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'

import '@/assets/styles/_variables.scss'
import './sticky-note.scss'
import { chime } from '@/lib/sound'
import { byKeys } from '@/lib/motion'
import { useAppearance, useLive, vigil, type Finished, type Task } from '@/lib/vigil'
import { clock, dayKey } from '../../../../main/dates'
import { Rolling } from './ui'
import { Struck, Tick } from './marks'
import { StickyCelebration, type Moment } from './celebrate'
import { SandboxStamp } from '@/components/vigil/sandbox'
import { Frost } from './frost'
import { Tape } from './tape'
import { CARD, DRAG, GLASS, GRACE, PAPER, STILL, stir, tiltOf } from './sticky-note'

// itshover drawings in lucide's place, moving when their control is pointed at.
const X = alive(XIcon)
const Check = alive(SimpleCheckedIcon)

/** When a task is for: the day it is due, else its deadline's. */
const dueDay = (task: Task): string | null => (task.dueAt ? dayKey(task.dueAt) : task.deadline ? dayKey(task.deadline) : null)

/** A task ticked here: kept in its place, struck through, with what to put back if it is unticked. */
type Ticked = { task: Task; was?: Finished; pen?: boolean }

/**
 * Today's tasks as one sticky on the desktop: what is due today or late,
 * live, each tickable where it is. A tick strikes it through by hand and it
 * stays, so the count reads "2/5"; the done ones fade out when the day ends.
 * A task added for today joins on its own. All ticked, it is celebrated as a
 * sticky's list is. The same paper, glass, tape and rules as any sticky.
 */
export function TodaySticky(): React.JSX.Element {
  useAppearance()
  const tasks = useLive(vigil.tasks, undefined as Task[] | undefined)
  // Looked at again each minute, so midnight turns the day over.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const [ticked, setTicked] = useState<Record<string, Ticked>>({})
  const [asking, setAsking] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const lastKey = useRef(0)
  // A see-through window: only the card is drawn.
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.dataset.sticky = ''
    const key = (event: KeyboardEvent): void => {
      lastKey.current = Date.now()
      // ⌘W takes it down as its X does: the window has no close of its own.
      if (!event.metaKey || event.key.toLowerCase() !== 'w') return
      event.preventDefault()
      chime('unstick')
      window.api.stick('today', 'today', false)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  useEffect(() => window.api.onStir(() => stir(card.current, lastKey.current)), [])

  // What is due or late and open, and those of them done today; a tick here
  // keeps its row even once a routine has moved on to its next day.
  const today = dayKey(now)
  const all = tasks ?? []
  const open = all.filter((task) => task.status === 'open' && (dueDay(task) ?? '9') <= today)
  const doneToday = all.filter((task) => task.status === 'done' && task.completedAt && dayKey(task.completedAt) === today && (dueDay(task) ?? '9') <= today)
  const byId = new Map([...doneToday, ...open].map((task) => [task.id, task]))
  // A tick made today, that is: one from yesterday fades with the rest.
  for (const [id, one] of Object.entries(ticked)) if (!byId.has(id) && dayKey(one.was?.doneAt ?? now) === today) byId.set(id, one.task)
  const todos = [...byId.values()].sort((a, b) => b.important - a.important || (a.dueAt ?? a.deadline ?? '').localeCompare(b.dueAt ?? b.deadline ?? '') || a.number - b.number)
  const struck = (task: Task): boolean => !!ticked[task.id] || task.status === 'done'
  const finished = todos.filter(struck).length

  const forget = (id: string): void => setTicked(({ [id]: _, ...rest }) => rest)
  const tick = (task: Task): void => {
    const was = ticked[task.id]?.was ?? (task.status === 'done' && task.completedAt
      ? { dueAt: task.dueAt, doneAt: task.completedAt, notifiedAt: new Date().toISOString(), deadlineAt: task.deadline }
      : undefined)
    // Still saving the tick: nothing to put back yet.
    if (ticked[task.id] && !was) return
    if (was) {
      chime('off')
      forget(task.id)
      void vigil.undoneTask(task.id, was)
      return
    }
    chime('done')
    const pen = !byKeys()
    setTicked((one) => ({ ...one, [task.id]: { task, pen } }))
    void vigil.doneTask(task.id).then((was) => setTicked((one) => ({ ...one, [task.id]: { task, was, pen } })))
  }

  // From some left to none left, held a moment so an untick straight after takes it back unseen.
  const allDone = todos.length > 0 && finished === todos.length
  const wasDone = useRef<boolean | undefined>(undefined)
  const [cheer, setCheer] = useState<Moment | null>(null)
  const loaded = tasks !== undefined
  useEffect(() => {
    if (!loaded) return
    const before = wasDone.current
    wasDone.current = allDone
    if (before !== false || !allDone) return
    const timer = setTimeout(() => void vigil.stickyDone('today').then((moment) => moment && setCheer(moment)), GRACE)
    return () => clearTimeout(timer)
  }, [allDone, loaded])

  return (
    <div className={GLASS ? 'h-screen' : 'h-screen p-5'}>
      <div ref={card} onMouseLeave={() => setAsking(false)} className={CARD}
        style={{ ...DRAG, '--tilt': GLASS ? '0deg' : `${tiltOf('today', Number(new URLSearchParams(location.search).get('nth')) || 0)}deg`, ...PAPER } as unknown as CSSProperties}>
        {!GLASS && <Frost tint="--mf-paper-tint" lift />}
        <SandboxStamp />
        <Tape inside={GLASS} />
        <div className="flex items-center gap-1 px-3 pt-2">
          <p className="min-w-0 grow truncate font-medium">Today</p>
          {todos.length > 0 && (
            <span className="shrink-0 pl-1 text-xs tabular-nums" style={{ color: allDone ? 'var(--tt-color-text-green)' : 'var(--muted-foreground)' }} aria-label={`${finished} of ${todos.length} done`}>
              <Rolling text={allDone ? 'All done' : `${finished}/${todos.length} done`} by="word" />
            </span>
          )}
          {/* Shown on hover, so at rest it is only the list. */}
          <span className={`grid transition-[grid-template-columns,opacity] duration-300 ease-(--mf-ease) group-hover:grid-cols-[1fr] group-hover:opacity-100 ${asking ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0'}`} style={STILL}>
            <span className="flex min-w-0 items-center justify-end overflow-hidden">
              <button type="button" title="Open Today" aria-label="Open Today" onClick={() => (chime('open'), window.api.openInHome('view', 'today'))} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <AliveIcon icon={ExternalLinkIcon} size={14} />
              </button>
              <button type="button" title="Hide this one till sticky notes are next shown  ⌃⌥⌘N" aria-label="Hide this one"
                onClick={() => (chime('tuck'), window.api.hideSticky('today', 'today'))}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <Minus className="size-3.5" strokeWidth={2.25} />
              </button>
              <button type="button" title="Take it off the desktop" aria-label="Take it off the desktop"
                onClick={() => {
                  if (!asking) return (chime('tap'), setAsking(true))
                  chime('unstick')
                  window.api.stick('today', 'today', false)
                }}
                className={`flex h-6 items-center justify-center gap-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground ${asking ? 'px-1.5 text-xs text-foreground' : 'w-6'}`}>
                {asking && <Rolling by="word" text="Take down?" />}
                <X className="size-3.5" />
              </button>
            </span>
          </span>
        </div>
        <div style={STILL} onScroll={(event) => event.currentTarget.toggleAttribute('data-scrolled', event.currentTarget.scrollTop > 0)}
          className="sticky-text min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-6 [mask-image:linear-gradient(to_bottom,#000_calc(100%-1.75rem),transparent)]">
          {loaded && !todos.length && <p className="my-1 text-muted-foreground">Nothing due today. Anything you add for today shows here.</p>}
          <ul>
            <AnimatePresence initial={false}>
              {todos.map((task) => {
                const done = struck(task)
                const late = (dueDay(task) ?? '') < today
                const pen = !!ticked[task.id]?.pen
                return (
                  <motion.li key={task.id} layout="position" className="flex items-start gap-2 py-1"
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.6 } }}>
                    <button type="button" role="checkbox" aria-checked={done} aria-label={task.title} onClick={() => tick(task)}
                      className="mt-[0.2em] grid size-3.5 shrink-0 place-items-center rounded-full border-[1.5px] transition-[background-color,border-color,scale] duration-150 ease-out outline-none active:scale-90 focus-visible:ring-2 focus-visible:ring-ring/40"
                      style={{
                        borderColor: done ? 'var(--tt-color-text-green)' : late ? 'var(--tt-color-text-orange)' : 'color-mix(in oklab, var(--muted-foreground) 70%, transparent)',
                        background: done ? 'var(--tt-color-text-green)' : undefined
                      }}>
                      <Check className={`mf-unmarked size-2 text-white transition-[opacity,scale] duration-150 ease-out ${done ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} strokeWidth={3} />
                      {done && <Tick seed={task.id} draw={pen} className="size-2.5 text-white" />}
                    </button>
                    {/* Done, on one line: a pen line is drawn across one line of words. */}
                    <span className={`min-w-0 flex-1 leading-snug transition-colors ${done ? 'mf-hand-struck truncate text-muted-foreground line-through decoration-foreground/40' : 'text-foreground'}`}>
                      {done ? <Struck seed={task.id} draw={pen}>{task.title}</Struck> : task.title}
                    </span>
                    {!done && (late || (task.dueAt && !task.allDay)) && (
                      <span className="shrink-0 pt-px text-xs text-muted-foreground tabular-nums" style={{ color: late ? 'var(--tt-color-text-red)' : undefined }}>
                        {late ? 'Late' : clock(task.dueAt!)}
                      </span>
                    )}
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </div>
        {/* Its size, from the corner: shown on hover. The window cannot be resized by the system (see stick in main). */}
        <span aria-hidden style={STILL} onPointerDown={(event) => {
          const from = { x: event.clientX, y: event.clientY, width: window.innerWidth, height: window.innerHeight }
          event.currentTarget.setPointerCapture(event.pointerId)
          event.currentTarget.onpointermove = (move) => window.api.resizeSticky(from.width + move.clientX - from.x, from.height + move.clientY - from.y)
          event.currentTarget.onpointerup = (up) => void ((up.currentTarget as HTMLElement).onpointermove = null)
        }}
          className="absolute right-0.5 bottom-0.5 flex size-4 cursor-nwse-resize items-end justify-end p-0.5 text-muted-foreground/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <svg viewBox="0 0 8 8" className="size-2"><path d="M7 1 1 7M7 4 4 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" /></svg>
        </span>
        {cheer && <StickyCelebration moment={cheer} onDone={() => setCheer(null)} />}
      </div>
    </div>
  )
}
