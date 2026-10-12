import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { CalendarDays } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import ClockIcon from '@/components/ui/clock-icon'
import RefreshIcon from '@/components/ui/refresh-icon'

import { chime } from '@/lib/sound'
import { slotTicker } from '@/lib/proximity'
import { placed } from '@/lib/tasks'
import { unloaded, useLive, vigil, when, whenInLine, type Task, type TaskFull } from '@/lib/vigil'
import { exampleTasks } from '@/lib/examples'
import { Example } from './example'
import { useOpened } from '@/lib/nav'
import { isUrgent, quadrantOf, type Quadrant } from '../../../../main/task-words'
import { dayjs, startOfDay } from '../../../../main/dates'
import { Page, Pressed, Rolling, Tip, toast, typing } from './ui'
import { PriorityMark } from './task-input'
import { TaskDetail, completeTask, taskMenu, useTaskNow } from './tasks-view'
import { RowMenu } from './row-menu'
import { Overlay, SETTLE, underPointer } from './sortable'
import { Button } from '@/components/ui/button'
import { useHere } from '@/lib/split'

// itshover drawings in lucide's place, moving when their control is pointed at.
const CalendarClock = alive(ClockIcon)
const Repeat = alive(RefreshIcon)

/** The four boxes, in reading order: top row important, left column urgent. */
const QUADS: { id: Quadrant; title: string; said: string; tint: string }[] = [
  { id: 'do', title: 'Do now', said: 'Urgent and important. Today, if you can.', tint: 'red' },
  { id: 'plan', title: 'Plan', said: 'Important, not urgent. Give each a day.', tint: 'blue' },
  { id: 'handoff', title: 'Hand off or batch', said: 'Urgent, not important. Pass on, or do in one go.', tint: 'orange' },
  { id: 'drop', title: 'Drop or later', said: 'Neither. Let go, or put in Later.', tint: 'gray' }
]
const important = (q: Quadrant): boolean => q === 'do' || q === 'plan'
const urgent = (q: Quadrant): boolean => q === 'do' || q === 'handoff'

/** The same moment on another day from today: a task keeps its time of day. */
const onDay = (days: number, from: string | null): string => {
  const time = from ? dayjs(from) : null
  return dayjs().add(days, 'day').hour(time ? time.hour() : 9).minute(time ? time.minute() : 0).startOf('minute').toISOString()
}

/**
 * Eisenhower's matrix: open tasks in four boxes by urgent (late, or within
 * two days) and important (the flag Urgent and High priority carry). A task
 * dragged, or sent with 1 to 4, to another box takes that box's importance;
 * into an urgent box it is scheduled today, and out of one it asks how far
 * to push the date. Each move is undoable from its notice.
 */
export function MatrixView({ focus, onOpen }: { focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const real = useLive(vigil.tasks, [] as Task[])
  const taskNow = useTaskNow()
  // No open tasks yet: four boxes of made-up ones show how it sorts them, dimmed and out of reach.
  const example = !unloaded(real) && !real.some((task) => task.status === 'open')
  const examples = useMemo(exampleTasks, [])
  const tasks = example ? examples : real
  const [open, setOpen] = useState<TaskFull | null>(null)
  const [at, setAt] = useState<{ q: number; id: string | null }>({ q: 0, id: null })
  const [over, setOver] = useState<Quadrant | null>(null)
  const [carried, setCarried] = useState<{ task: Task; width: number } | null>(null)
  // Just moved here: shown in its new box at once while the move saves.
  const [landing, setLanding] = useState<{ id: string; q: Quadrant } | null>(null)
  useEffect(() => setLanding(null), [tasks])
  // Out of an urgent box: how far its date goes is asked in the box it went to.
  const [pushing, setPushing] = useState<{ task: Task; to: Quadrant } | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // A soft tick as a carried task comes over each new box.
  const ticks = useRef(slotTicker()).current

  // What you are waiting on is chased, not done: it stays out of the boxes.
  const live = tasks.filter((task) => task.status === 'open' && !task.waitingOn)
    .sort((a, b) => (placed(a) ?? Infinity) - (placed(b) ?? Infinity) || (a.priority || 5) - (b.priority || 5) || a.number - b.number)
  const boxOf = (task: Task): Quadrant => (landing?.id === task.id ? landing.q : pushing?.task.id === task.id ? pushing.to : quadrantOf(task))
  const boxes = QUADS.map((quad) => live.filter((task) => boxOf(task) === quad.id))
  const column = boxes[at.q] ?? []
  const row = column.findIndex((task) => task.id === at.id)
  const chosen = row >= 0 ? column[row] : undefined

  const pick = (id: string): void => void vigil.task(id).then(setOpen)
  // Opening a task is a step Back returns from.
  useOpened(open?.id, focus, pick, () => setOpen(null))

  /** Saved with one notice, whose undo puts back its importance, its dates and what the move reset. */
  const save = (task: Task, patch: { important?: number; due?: string; deadline?: string }, said: string): void => {
    const was = { priority: task.priority, due: task.dueAt, deadline: task.deadline, plan: task.planFor }
    void vigil.saveTask(task.id, patch).then((before) => {
      chime('shift')
      toast(said, () => void vigil.saveTask(task.id, { ...was, ...(before === true ? {} : before) }))
    })
  }
  /** A task to another box: its importance, and its date when it goes into an urgent one. */
  const send = (task: Task, to: Quadrant): void => {
    const from = quadrantOf(task)
    if (from === to) return chime('nope')
    setAt({ q: QUADS.findIndex((quad) => quad.id === to), id: task.id })
    const name = QUADS.find((quad) => quad.id === to)!.title
    // Out of urgent: it is asked, and nothing is saved until it is answered.
    if (urgent(from) && !urgent(to)) return (chime('tap'), setPushing({ task, to }))
    setLanding({ id: task.id, q: to })
    save(task, {
      ...(important(from) !== important(to) ? { important: important(to) ? 1 : 0 } : {}),
      ...(!urgent(from) && urgent(to) ? { due: onDay(0, task.dueAt) } : {})
    }, !urgent(from) && urgent(to) ? `${name}: scheduled today` : `${name}: ${important(to) ? 'marked important' : 'no longer important'}`)
  }
  /** The push asked for: the dates that made it urgent go that many days out; 0 keeps them. */
  const push = (days: number | null): void => {
    if (!pushing) return
    const { task, to } = pushing
    setPushing(null)
    if (days === null) return chime('stay')
    const name = QUADS.find((quad) => quad.id === to)!.title
    const soon = (iso: string | null): boolean => isUrgent({ dueAt: iso, deadline: null })
    setLanding({ id: task.id, q: to })
    save(task, {
      ...(important(quadrantOf(task)) !== important(to) ? { important: important(to) ? 1 : 0 } : {}),
      ...(soon(task.dueAt) ? { due: onDay(days, task.dueAt) } : {}),
      ...(soon(task.deadline) ? { deadline: onDay(days, task.deadline) } : {})
    }, `${name}: moved to ${whenInLine(onDay(days, task.dueAt ?? task.deadline), !!task.allDay)}`)
  }

  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || example) return
      const key = event.key
      const take = (run: () => void): void => (event.preventDefault(), run())
      // The push asked for: ↵ takes a week, Esc keeps it where it was.
      if (pushing && key === 'Escape') return take(() => push(null))
      if (pushing && key === 'Enter') return take(() => push(7))
      // Across: the box beside, at the same height where it has one.
      const across = (q: number): void => {
        const list = boxes[q]
        const next = list[Math.min(Math.max(row, 0), list.length - 1)]
        setAt({ q, id: next?.id ?? null })
      }
      if (key === 'h' || key === 'ArrowLeft') return take(() => at.q % 2 && across(at.q - 1))
      if (key === 'l' || key === 'ArrowRight') return take(() => at.q % 2 || across(at.q + 1))
      // Down and up the box, and on into the box below or above it.
      if (key === 'j' || key === 'ArrowDown' || key === 'k' || key === 'ArrowUp') {
        const down = key === 'j' || key === 'ArrowDown'
        const to = row + (down ? 1 : -1)
        if (to >= 0 && to < column.length) return take(() => setAt({ q: at.q, id: column[to].id }))
        const q = at.q + (down ? 2 : -2)
        if (q < 0 || q > 3) return take(() => chime('nope'))
        const list = boxes[q]
        return take(() => setAt({ q, id: (down ? list[0] : list[list.length - 1])?.id ?? null }))
      }
      if (!chosen) return
      if (/^[1-4]$/.test(key)) return take(() => send(chosen, QUADS[Number(key) - 1].id))
      if (key === 'Enter') return take(() => pick(chosen.id))
      if (key === 'e') return take(() => void completeTask(chosen))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <Page aside={!!open} wide title="matrix" count={example ? undefined : live.length} unit={['task', 'tasks']} actions={
        <span className="hidden text-xs whitespace-nowrap @[52rem]/page:inline">
          Urgent: late, or within two days · <Pressed keys="H" /> <Pressed keys="J" /> <Pressed keys="K" /> <Pressed keys="L" /> move · <Pressed keys="1" /> to <Pressed keys="4" /> send to a box
        </span>
      }>
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={({ active }) => {
            chime('lift')
            setLanding(null)
            const task = live.find((one) => one.id === String(active.id))
            const node = document.querySelector(`[data-sortable-id="${CSS.escape(String(active.id))}"]`)
            if (task) setCarried({ task, width: node?.getBoundingClientRect().width ?? 224 })
            ticks.start(task ? quadrantOf(task) : null)
          }}
          onDragOver={({ over }) => (setOver(over ? (String(over.id) as Quadrant) : null), ticks(over?.id))}
          onDragCancel={() => (setCarried(null), setOver(null))}
          onDragEnd={({ active, over }) => {
            setCarried(null)
            setOver(null)
            const task = live.find((one) => one.id === String(active.id))
            if (!task || !over || over.id === quadrantOf(task)) return chime('stay')
            send(task, String(over.id) as Quadrant)
          }}
        >
          <Example on={example} tryIt="add a task in Today, like ‘finish the essay by Friday !!’, and see which box it lands in. Drag it to another box to change how much it matters.">
          <div className="grid grid-cols-1 gap-3 p-3 @[34rem]/page:grid-cols-2">
            {QUADS.map((quad, q) => (
              <Box key={quad.id} id={quad.id}
                className={`flex min-h-[12rem] min-w-0 flex-col @[34rem]/page:min-h-[calc(50vh-4.5rem)] gap-1 rounded-lg border p-2 transition-colors ${over === quad.id ? 'bg-accent/60 ring-1 ring-ring' : q === at.q ? 'bg-accent/25' : ''}`}>
                <header className="mb-1 px-1">
                  <h3 className="flex items-baseline gap-2 text-heading font-semibold" style={{ color: `var(--tt-color-text-${quad.tint})` }}>
                    <span>{quad.title}</span>
                    <span className="text-xs font-normal text-muted-foreground tabular-nums"><Rolling text={`${boxes[q].length} ${boxes[q].length === 1 ? 'task' : 'tasks'}`} by="word" /></span>
                    {/* The key only while a task is picked, and said in words: a bare 1 to 4 read as a count. */}
                    {chosen && q !== at.q && <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-muted-foreground">Send it here <Pressed keys={String(q + 1)} /></span>}
                  </h3>
                  <p className="text-xs text-muted-foreground">{quad.said}</p>
                </header>
                {pushing?.to === quad.id && (
                  <div className="flex flex-wrap items-center gap-1 rounded-md border border-dashed border-ring/60 px-2 py-1.5 text-xs text-muted-foreground">
                    <span className="mr-auto min-w-0 truncate">Not urgent, so push “{pushing.task.title}” out:</span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => push(7)}>A week <Pressed keys="↵" /></Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => push(14)}>Two weeks</Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => push(null)}>Cancel <Pressed keys="Esc" /></Button>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  {boxes[q].map((task) => (
                    <motion.div key={task.id} className="relative"
                      // Just sent here: it settles in from the chip's tilt.
                      initial={landing?.id === task.id || pushing?.task.id === task.id ? { opacity: 0.4, scale: 0.97, rotate: -1.5 } : false}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }}>
                      <Carried id={task.id}>
                        <RowMenu items={example ? [] : taskMenu(task, { open: () => (setAt({ q, id: task.id }), pick(task.id)), now: taskNow })}>
                          <div><Card task={task} at={at.id === task.id && at.q === q} open={open?.id === task.id} onClick={() => (setAt({ q, id: task.id }), pick(task.id))} /></div>
                        </RowMenu>
                      </Carried>
                    </motion.div>
                  ))}
                  {/* Said only once the tasks are read, so coming back never flashes it. */}
                  {!boxes[q].length && !unloaded(tasks) && <p className="px-1 py-2 text-xs text-muted-foreground/70">{carried ? 'Drop a task here' : 'Nothing here'}</p>}
                </div>
              </Box>
            ))}
          </div>
          </Example>
          <Overlay modifiers={[underPointer]} dropAnimation={document.documentElement.dataset.motion === 'off' || landing ? null : SETTLE}>
            {carried ? (
              <motion.div initial={{ rotate: 0, scale: 1 }} animate={{ rotate: -2.5, scale: 1.03 }} transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                style={{ width: Math.min(carried.width, 260) }}
                className="flex cursor-grabbing items-center gap-2 rounded-md border bg-background py-1 pr-2.5 pl-1.5 text-control shadow-[0_10px_24px_-8px_color-mix(in_oklab,var(--mf-shadow-ink,black)_45%,transparent),0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink,black)_18%,transparent)]">
                <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: `var(--tt-color-text-${QUADS.find((quad) => quad.id === quadrantOf(carried.task))!.tint})` }} />
                <span className="min-w-0 flex-1 truncate">{carried.task.title}</span>
              </motion.div>
            ) : null}
          </Overlay>
        </DndContext>
      </Page>
      {open && <TaskDetail key={open.id} task={open} onClose={() => setOpen(null)} onOpen={onOpen} />}
    </>
  )
}

/** One task, as the week draws it: its priority, its name, and when. */
function Card({ task, at, open, onClick }: { task: Task; at: boolean; open: boolean; onClick: () => void }): React.JSX.Element {
  const late = (iso: string | null): boolean => !!iso && new Date(iso).getTime() < startOfDay()
  const today = (iso: string | null): boolean => !!iso && !late(iso) && new Date(iso).getTime() < startOfDay(1)
  const tone = (iso: string | null): string | undefined => (late(iso) ? 'var(--tt-color-text-red)' : today(iso) ? 'var(--tt-color-text-orange)' : undefined)
  return (
    <button type="button" data-cursor={at || undefined} onClick={onClick}
      className={`relative flex w-full touch-none flex-col items-start gap-0.5 rounded-md border bg-background px-2 py-1.5 text-left text-control transition-colors hover:bg-accent/60 ${at ? 'border-ring bg-accent/50' : ''} ${open ? 'bg-accent' : ''}`}>
      <span className="flex w-full items-start gap-1.5">
        {task.priority ? <span className="mt-0.5"><PriorityMark level={task.priority} /></span> : null}
        <span className="line-clamp-2 min-w-0 text-pretty">{task.title}</span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground">
        {task.dueAt && <span className="flex items-center gap-1" style={{ color: tone(task.dueAt) }}><CalendarDays className="size-3" />{when(task.dueAt, !!task.allDay)}</span>}
        {task.deadline && <span className="flex items-center gap-1" style={{ color: tone(task.deadline) }}><CalendarClock className="size-3" />Due by {whenInLine(task.deadline, !task.deadlineTimed)}</span>}
        {!task.dueAt && !task.deadline && <span>No date</span>}
        {task.recurrence && <Tip label={task.recurrence}><span><Repeat className="size-3" /></span></Tip>}
      </span>
    </button>
  )
}

/** A box a task can be dropped in. */
function Box({ id, className, children }: { id: Quadrant; className: string; children: ReactNode }): React.JSX.Element {
  const { setNodeRef } = useDroppable({ id })
  return <section ref={setNodeRef} data-quadrant={id} className={className}>{children}</section>
}

/** A card that can be picked up; the place it left stays, faint, until it lands. */
function Carried({ id, children }: { id: string; children: ReactNode }): React.JSX.Element {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id })
  return <div ref={setNodeRef} data-sortable-id={id} {...listeners} className={isDragging ? 'opacity-30' : undefined}>{children}</div>
}
