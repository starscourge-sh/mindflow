import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { Brain, CalendarClock, ChevronLeft, ChevronRight, Repeat } from 'lucide-react'

import { chime } from '@/lib/sound'
import { useLive, vigil, when, whenInLine, type Task, type TaskFull } from '@/lib/vigil'
import { Kbd, Page, Rolling, Tip, toast, typing } from './ui'
import { PriorityIcon, setPriority } from './task-input'
import { TaskDetail, completeTask } from './tasks-view'
import { Button } from '@/components/ui/button'
import { Lifted, SETTLE, snapshot } from './sortable'

// Days are counted on the calendar, not in hours, so a clock change never
// repeats or skips one.
const dayStart = (offset: number): number => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).getTime()
}

/** One card in a day: a task on the day it is scheduled, or on the day it is due by. */
type Card = { task: Task; kind: 'scheduled' | 'deadline' }

/** The same moment, `by` days over: a task keeps its time of day when it moves. */
const shifted = (iso: string, by: number): string => {
  const date = new Date(iso)
  date.setDate(date.getDate() + by)
  return date.toISOString()
}

/**
 * A week at a glance: seven days side by side, each with what is scheduled,
 * what is due by then, and how much reviewing falls on it, so a heavy review
 * day can be planned around. The keyboard walks it: H and L across the days,
 * J and K down one, ⇧H and ⇧L move the task a day, [ and ] change the week,
 * and the lists' own keys work on the card: E, T, M, W, 1 to 4.
 */
export function WeekView({ onOpen }: { onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const tasks = useLive(vigil.tasks, [] as Task[])
  // Which week, as days from today: 0, 7, 14.
  const [from, setFrom] = useState(0)
  // Reviews ahead only: a week gone by has none left to plan around.
  const load = useLive(() => (from + 7 > 0 ? vigil.reviewLoad(from + 7) : Promise.resolve([])), [] as number[], [from])
  const [at, setAt] = useState<{ col: number; id: string | null }>({ col: 0, id: null })
  const [open, setOpen] = useState<TaskFull | null>(null)
  // The day a dragged card is over, lit and opening a gap where it will land;
  // the card as it looked when picked up, carried under the pointer.
  const [over, setOver] = useState<number | null>(null)
  const [shot, setShot] = useState<ReturnType<typeof snapshot>>(null)
  // A card just dropped on a day, shown there at once while the move saves, so
  // it settles into its new place rather than jumping back first.
  const [landing, setLanding] = useState<{ id: string; col: number } | null>(null)
  useEffect(() => setLanding(null), [tasks])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const live = tasks.filter((task) => task.status === 'open')
  const days = Array.from({ length: 7 }, (_, index) => {
    const start = dayStart(from + index)
    const end = dayStart(from + index + 1)
    // Today's column carries what is late, so nothing overdue falls off the week.
    const inDay = (iso: string | null): boolean => !!iso && new Date(iso).getTime() < end && (new Date(iso).getTime() >= start || (from === 0 && index === 0))
    const cards: Card[] = [
      ...live.filter((task) => inDay(task.dueAt)).map((task) => ({ task, kind: 'scheduled' as const })),
      ...live.filter((task) => inDay(task.deadline)).map((task) => ({ task, kind: 'deadline' as const }))
    ]
    return { start, cards, reviews: load[from + index] ?? 0 }
  })
  if (landing) {
    const at = days.findIndex((day) => day.cards.some((card) => `${card.kind}:${card.task.id}` === landing.id))
    const card = at >= 0 ? days[at].cards.find((one) => `${one.kind}:${one.task.id}` === landing.id) : undefined
    if (card && at !== landing.col) {
      days[at].cards = days[at].cards.filter((one) => one !== card)
      days[landing.col].cards = [...days[landing.col].cards, card]
    }
  }
  const cardOf = (id: string): { card: Card; col: number } | null => {
    for (const [col, day] of days.entries()) {
      const card = day.cards.find((one) => `${one.kind}:${one.task.id}` === id)
      if (card) return { card, col }
    }
    return null
  }
  const column = days[at.col]?.cards ?? []
  const row = column.findIndex((card) => `${card.kind}:${card.task.id}` === at.id)
  const chosen = row >= 0 ? column[row] : undefined

  const pick = (id: string): void => void vigil.task(id).then(setOpen)
  /** Move a card a number of days, said and undoable; its time of day stays. */
  const move = (card: Card, by: number): void => {
    const field = card.kind === 'scheduled' ? 'due' : 'deadline'
    const was = card.kind === 'scheduled' ? card.task.dueAt : card.task.deadline
    if (!was) return
    // Something late moves from today, not from the day it was missed.
    const now = new Date()
    const base = new Date(was).getTime() < dayStart(0) ? new Date(new Date(was).setFullYear(now.getFullYear(), now.getMonth(), now.getDate())).toISOString() : was
    const to = shifted(base, by)
    if (new Date(to).setHours(0, 0, 0, 0) === new Date(was).setHours(0, 0, 0, 0)) return chime('nope')
    void vigil.saveTask(card.task.id, { [field]: to }).then(() => {
      chime('shift')
      toast(`${card.kind === 'scheduled' ? 'Moved to' : 'Due by'} ${whenInLine(to, card.kind === 'scheduled' ? !!card.task.allDay : !card.task.deadlineTimed)}`, () => void vigil.saveTask(card.task.id, { [field]: was }))
    })
  }
  const go = (col: number): void => {
    // Past either edge, the week turns.
    if (col < 0 || col > 6) {
      chime('page')
      setFrom((week) => week + (col < 0 ? -7 : 7))
      return setAt({ col: col < 0 ? 6 : 0, id: null })
    }
    const cards = days[col].cards
    const next = cards[Math.min(Math.max(row, 0), cards.length - 1)]
    setAt({ col, id: next ? `${next.kind}:${next.task.id}` : null })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key
      const take = (run: () => void): void => {
        event.preventDefault()
        run()
      }
      if (key === 'H' || (event.shiftKey && key === 'ArrowLeft')) return chosen && take(() => (move(chosen, -1), setAt({ col: Math.max(0, at.col - 1), id: at.id })))
      if (key === 'L' || (event.shiftKey && key === 'ArrowRight')) return chosen && take(() => (move(chosen, 1), setAt({ col: Math.min(6, at.col + 1), id: at.id })))
      if (key === 'h' || key === 'ArrowLeft') return take(() => go(at.col - 1))
      if (key === 'l' || key === 'ArrowRight') return take(() => go(at.col + 1))
      if (key === 'j' || key === 'ArrowDown' || key === 'k' || key === 'ArrowUp') {
        const next = column[Math.max(0, Math.min(column.length - 1, row + (key === 'j' || key === 'ArrowDown' ? 1 : -1)))]
        return take(() => setAt({ col: at.col, id: next ? `${next.kind}:${next.task.id}` : null }))
      }
      if (key === '[' || key === ']') return take(() => (chime('page'), setFrom((week) => week + (key === '[' ? -7 : 7))))
      if (key === 'Escape' && open) return take(() => setOpen(null))
      if (!chosen) return
      if (key === 'Enter') return take(() => pick(chosen.task.id))
      if (key === 'e') return take(() => void completeTask(chosen.task))
      if (/^[0-4]$/.test(key)) return take(() => setPriority(chosen.task, Number(key)))
      // T, M and W as in the lists: today, tomorrow, a week from today.
      const to = { t: 0, m: 1, w: 7 }[key]
      if (to !== undefined) return take(() => move(chosen, to - (from + at.col)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const first = new Date(days[0].start)
  const last = new Date(days[6].start)
  return (
    <>
      <Page aside={!!open} title="week" actions={
        <span className="flex items-center gap-2 text-xs">
          <span className="hidden whitespace-nowrap @[60rem]/page:inline"><Kbd>H</Kbd> <Kbd>L</Kbd> days · <Kbd>⇧H</Kbd> <Kbd>⇧L</Kbd> move a day · <Kbd>[</Kbd> <Kbd>]</Kbd> week</span>
          <Tip label="Week before  [">
            <Button variant="ghost" size="icon-sm" onClick={() => (chime('page'), setFrom(from - 7))} aria-label="Week before"><ChevronLeft className="size-4" /></Button>
          </Tip>
          {/* The dates, which take you back to this week from any other. */}
          <Tip label="Back to this week">
            <button type="button" onClick={() => (chime('tap'), setFrom(0))} className="rounded px-1 text-foreground hover:bg-accent">
              <Rolling by="word" className="whitespace-nowrap" text={`${first.toLocaleDateString([], { day: 'numeric', month: 'short' })} to ${last.toLocaleDateString([], { day: 'numeric', month: 'short' })}`} />
            </button>
          </Tip>
          <Tip label="Week after  ]">
            <Button variant="ghost" size="icon-sm" onClick={() => (chime('page'), setFrom(from + 7))} aria-label="Week after"><ChevronRight className="size-4" /></Button>
          </Tip>
        </span>
      }>
        {/* Picked up and carried by the pointer; let go over a day and it
            moves there. The days scroll by themselves near the edges. */}
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={({ active }) => {
            chime('tap')
            setShot(snapshot(String(active.id)))
          }}
          onDragOver={({ over }) => setOver(over ? Number(over.id) : null)}
          onDragCancel={() => (setShot(null), setOver(null))}
          onDragEnd={({ active, over }) => {
            setShot(null)
            setOver(null)
            const from = cardOf(String(active.id))
            const to = over ? Number(over.id) : null
            if (!from || to === null || to === from.col) return chime('fold')
            setLanding({ id: String(active.id), col: to })
            move(from.card, to - from.col)
          }}
        >
        <div className="grid min-h-0 flex-1 gap-px overflow-x-auto p-3 [grid-template-columns:repeat(7,minmax(8rem,1fr))]">
          {days.map((day, col) => {
            const date = new Date(day.start)
            const today = day.start === dayStart(0)
            return (
              <Day
                key={day.start}
                col={col}
                className={`flex min-h-[calc(100vh-9rem)] min-w-0 flex-col gap-1 rounded-md p-1.5 transition-colors ${over === col ? 'bg-accent/60 ring-1 ring-ring' : col === at.col ? 'bg-accent/30' : ''}`}
              >
                <header className="mb-1 flex items-baseline gap-1.5 px-1">
                  <span className={`text-meta font-medium ${today ? 'text-[var(--tt-color-text-orange)]' : ''}`}>{date.toLocaleDateString([], { weekday: 'short' })}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{date.getDate()}</span>
                  {/* How much reviewing falls on the day: a heavy one is a light day for tasks. */}
                  {day.reviews > 0 && (
                    <Tip label={`${day.reviews} ${day.reviews === 1 ? 'review' : 'reviews'} due`}>
                      <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums" style={{ color: day.reviews >= 30 ? 'var(--tt-color-text-purple)' : undefined }}>
                        <Brain className="size-3" />
                        <Rolling text={day.reviews} />
                      </span>
                    </Tip>
                  )}
                </header>
                {day.cards.map((card) => {
                  const id = `${card.kind}:${card.task.id}`
                  const late = card.kind === 'scheduled' ? new Date(card.task.dueAt!).getTime() < dayStart(0) : new Date(card.task.deadline!).getTime() < dayStart(0)
                  return (
                    <Carried key={id} id={id}>
                    <button
                      type="button"
                      data-cursor={at.id === id || undefined}
                      onClick={() => (setAt({ col, id }), pick(card.task.id))}
                      className={`relative flex w-full touch-none flex-col items-start gap-0.5 rounded-md border bg-background px-2 py-1.5 text-left text-control transition-colors hover:bg-accent/60 ${at.id === id && at.col === col ? 'border-ring bg-accent/50' : ''} ${open?.id === card.task.id ? 'bg-accent' : ''}`}
                    >
                      <span className="flex w-full items-start gap-1.5">
                        {card.task.priority ? <PriorityIcon level={card.task.priority} className="mt-0.5 size-3 shrink-0" /> : null}
                        <span className="line-clamp-2 min-w-0">{card.task.title}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground" style={{ color: late ? 'var(--tt-color-text-red)' : undefined }}>
                        {card.kind === 'deadline' ? (
                          <span className="flex items-center gap-1" style={{ color: 'var(--tt-color-text-red)' }}><CalendarClock className="size-3" /> Due by{card.task.deadlineTimed ? ` ${new Date(card.task.deadline!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
                        ) : late ? (
                          when(card.task.dueAt, !!card.task.allDay)
                        ) : !card.task.allDay ? (
                          new Date(card.task.dueAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                        ) : null}
                        {card.task.recurrence && <Repeat className="size-3" />}
                      </span>
                    </button>
                    </Carried>
                  )
                })}
                {/* The day under a carried card opens a gap for it at the end. */}
                <AnimatePresence initial={false}>
                  {shot && over === col && cardOf(String(shot.id))?.col !== col && (
                    <motion.div
                      key="gap"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: shot.height, opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 45 }}
                      className="shrink-0 rounded-md border border-dashed border-ring/60"
                    />
                  )}
                </AnimatePresence>
              </Day>
            )
          })}
        </div>
        <DragOverlay dropAnimation={document.documentElement.dataset.motion === 'off' ? null : SETTLE}>
          <Lifted shot={shot} />
        </DragOverlay>
        </DndContext>
      </Page>
      {open && <TaskDetail key={open.id} task={open} onClose={() => setOpen(null)} onOpen={onOpen} />}
    </>
  )
}

/** A day the cards can be dropped on. */
function Day({ col, className, children }: { col: number; className: string; children: ReactNode }): React.JSX.Element {
  const { setNodeRef } = useDroppable({ id: col })
  return <section ref={setNodeRef} data-day={col} className={className}>{children}</section>
}

/** A card that can be picked up; the place it left stays, faint, until it lands. */
function Carried({ id, children }: { id: string; children: ReactNode }): React.JSX.Element {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id })
  return <div ref={setNodeRef} data-sortable-id={id} {...listeners} className={isDragging ? 'opacity-30' : undefined}>{children}</div>
}
