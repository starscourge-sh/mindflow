import { EventLine, useMacEvents, type MacEvent } from '@/lib/mac-calendar'
import { moveToBin } from '@/lib/to-bin'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DndContext, MeasuringStrategy, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection } from '@dnd-kit/core'
import { alive } from '@/components/ui/alive-icon'
import BrainCircuitIcon from '@/components/ui/brain-circuit-icon'
import ClockIcon from '@/components/ui/clock-icon'
import RightChevronIcon from '@/components/ui/right-chevron'
import RefreshIcon from '@/components/ui/refresh-icon'

import { chime } from '@/lib/sound'
import { slotTicker } from '@/lib/proximity'
import { unloaded, useLive, vigil, when, type Task, type TaskFull } from '@/lib/vigil'
import { exampleTasks } from '@/lib/examples'
import { Example } from './example'
import { useOpened } from '@/lib/nav'
import { Page, Rolling, Tags, Tip, typing, Pressed, quietly } from './ui'
import { taskName } from '@/lib/tasks'
import { PriorityMark, markRoom, setPriority } from './task-input'
import { TaskDetail, completeTask, taskMenu, useTaskNow } from './tasks-view'
import { RowMenu } from './row-menu'
import { Button } from '@/components/ui/button'
import { Overlay, SETTLE, snapshot, underPointer } from './sortable'
import { GlossButton, GlossLine } from './gloss-line'
import { Ring } from './marks'
import { byKeys } from '@/lib/motion'
import { clock, dayKey, dayMonth, dayjs, startOfDay } from '../../../../main/dates'
import { useHere } from '@/lib/split'
import { PICKED_ROW, useTaskPick } from './task-pick'
import { DayFlags, DayMarkMenu } from './milestones'
import { onDay, useMilestones } from '@/lib/milestones'
import { CalendarNote, DayLoadLine, eventsOn, useWorkRoom } from './week-fit'
import { loadOf, placeEvents } from '../../../../main/day-load'
import { loud } from '@/lib/loud'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Brain = alive(BrainCircuitIcon)
const CalendarClock = alive(ClockIcon)
const ChevronLeft = alive(RightChevronIcon, 'rotate-180')
const ChevronRight = alive(RightChevronIcon)
const Repeat = alive(RefreshIcon)

// Days are counted on the calendar, not in hours, so a clock change never
// repeats or skips one.
const dayStart = (offset: number): number => startOfDay(offset)

/**
 * Today's ring is written with the pen the first time the week is opened
 * with the pointer that day, in this window; after that, and by a key, it
 * is simply there.
 */
let ringed = 0
const penToday = (start: number): boolean => {
  if (ringed === start) return false
  ringed = start
  return !byKeys()
}

/** Over a card, the card wins over the day it sits in: dropped on one in its own day, a card goes beside it. */
const cardsFirst: CollisionDetection = (args) => {
  const hits = pointerWithin(args).filter((hit) => hit.id !== `on:${args.active.id}`)
  return [...hits.filter((hit) => String(hit.id).startsWith('on:')), ...hits.filter((hit) => !String(hit.id).startsWith('on:'))]
}

/** One card in a day: a task on the day it is scheduled, or on the day it is due by. */
type Card = { task: Task; kind: 'scheduled' | 'deadline' }

/** When a card is for, if at a time: the scheduled time, or a deadline's hour. */
const timeOf = (card: Card): string | null => (card.kind === 'scheduled' && !card.task.allDay ? card.task.dueAt : card.kind === 'deadline' && card.task.deadlineTimed ? card.task.deadline : null)

/** The same moment, `by` days over: a task keeps its time of day when it moves. */
const shifted = (iso: string, by: number): string => dayjs(iso).add(by, 'day').toISOString()

/**
 * A week at a glance: seven days side by side, each with what is scheduled,
 * what is due by then, and how much reviewing falls on it, so a heavy review
 * day can be planned around. The keyboard walks it: H and L across the days,
 * J and K down one, ⇧H and ⇧L move the task a day, ⌥↑ and ⌥↓ move it up and
 * down its day (as dragging it there does), [ and ] change the week,
 * and the lists' own keys work on the card: E, T, M, W, 1 to 4.
 */
export function WeekView({ focus, onOpen }: { focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const real = useLive(vigil.tasks, [] as Task[])
  const taskNow = useTaskNow()
  // Nothing with a day yet: a made-up week shows what this holds, dimmed and out of reach.
  const example = !unloaded(real) && !real.some((task) => task.status === 'open' && (task.dueAt || task.deadline))
  const examples = useMemo(exampleTasks, [])
  const tasks = example ? examples : real
  // Which week, as days from today: 0, 7, 14.
  const [from, setFrom] = useState(0)
  // Reviews ahead only: a week gone by has none left to plan around.
  const load = useLive(() => (from + 7 > 0 ? vigil.reviewLoad(from + 7) : Promise.resolve([])), [] as number[], [from])
  const [at, setAt] = useState<{ col: number; id: string | null }>({ col: 0, id: null })
  const [open, setOpen] = useState<TaskFull | null>(null)
  // The card a thought is being written under, without opening the task.
  const [glossing, setGlossing] = useState<string | null>(null)
  // The day a dragged card is over, lit and opening a gap where it will land;
  // the card as it looked when picked up, carried under the pointer.
  const [over, setOver] = useState<number | null>(null)
  const [shot, setShot] = useState<ReturnType<typeof snapshot>>(null)
  // A card just dropped on a day, shown there at once while the move saves, so
  // it settles into its new place rather than jumping back first.
  const [landing, setLanding] = useState<{ id: string; col: number } | null>(null)
  // A day put in a new order, shown so at once while it saves.
  const [held, setHeld] = useState<string[] | null>(null)
  useEffect(() => (setLanding(null), setHeld(null)), [tasks])
  // The card a dragged one is over in its own day, and which side it goes.
  const [between, setBetween] = useState<{ id: string; after: boolean } | null>(null)
  // A soft tick as a carried card comes over each new day, or each new gap in its own.
  const ticks = useRef(slotTicker()).current
  // In a narrow window the seven days scroll sideways: the edge with more days
  // past it fades, so it is plain there is more, and the day the keys are on
  // is always brought into view.
  const strip = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const measure = (): void => {
    const el = strip.current
    if (el) setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
  }
  // Measured as the strip itself changes size (the sidebar folding, a pane opening), not only the window.
  useEffect(() => {
    measure()
    const watch = new ResizeObserver(measure)
    if (strip.current) watch.observe(strip.current)
    return () => watch.disconnect()
  }, [])
  useEffect(() => {
    strip.current?.querySelector(`[data-day="${at.col}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    // Each day scrolls inside itself: the card the keys move to is brought into view there.
    strip.current?.querySelector('[data-cursor]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [at.col, at.id, from])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // The marked days in the seven on show.
  const marked = useMilestones(dayKey(dayStart(from)), dayKey(dayStart(from + 6)))
  // Your Mac's calendar across the seven, read only, when Settings has it on.
  const mac = useMacEvents(new Date(dayStart(from)), new Date(dayStart(from + 7)))
  // A working day's length, for whether each day fits.
  const room = useWorkRoom()
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
    // In your own order where you gave one (dragged or ⌥↑ ⌥↓), the rest after as they come.
    cards.sort((a, b) => (a.task.sortOrder ?? Infinity) - (b.task.sortOrder ?? Infinity))
    // With calendar events, the day reads as a line by the hour: its timed cards in time
    // order, in the places timed cards hold; the rest keep your order.
    if (eventsOn(mac.events, dayKey(start)).length) {
      const places = cards.flatMap((card, at) => (timeOf(card) ? [at] : []))
      const timed = places.map((at) => cards[at]).sort((a, b) => Date.parse(timeOf(a)!) - Date.parse(timeOf(b)!))
      places.forEach((at, n) => (cards[at] = timed[n]))
    }
    return { start, cards, reviews: load[from + index] ?? 0 }
  })
  if (held) for (const day of days) if (day.cards.some((card) => held.includes(`${card.kind}:${card.task.id}`)))
    day.cards.sort((a, b) => held.indexOf(`${a.kind}:${a.task.id}`) - held.indexOf(`${b.kind}:${b.task.id}`))
  if (landing) {
    const at = days.findIndex((day) => day.cards.some((card) => `${card.kind}:${card.task.id}` === landing.id))
    const card = at >= 0 ? days[at].cards.find((one) => `${one.kind}:${one.task.id}` === landing.id) : undefined
    if (card && at !== landing.col) {
      days[at].cards = days[at].cards.filter((one) => one !== card)
      // In the place it will have once saved, so nothing shuffles when the save comes back.
      const rank = (one: Card): number => (one.kind === 'deadline' ? live.length : 0) + live.indexOf(one.task)
      days[landing.col].cards = [...days[landing.col].cards, card].sort((x, y) => rank(x) - rank(y))
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
  // Opening a task is a step Back returns from.
  // Every task the week shows, once each (a task due and scheduled shows twice), in the order of the days.
  const onShow = example ? [] : [...new Map(days.flatMap((day) => day.cards.map((card) => [card.task.id, card.task] as const))).values()]
  useOpened(open?.id, focus, pick, () => setOpen(null), { shown: onShow.map((task) => task.id), kind: 'task' })
  /** Move a card a number of days, said and undoable; its time of day stays. */
  const move = (card: Card, by: number): void => {
    const field = card.kind === 'scheduled' ? 'due' : 'deadline'
    const was = card.kind === 'scheduled' ? card.task.dueAt : card.task.deadline
    if (!was) return
    // Something late moves from today, not from the day it was missed.
    const now = dayjs()
    const base = new Date(was).getTime() < dayStart(0) ? dayjs(was).year(now.year()).month(now.month()).date(now.date()).toISOString() : was
    const to = shifted(base, by)
    if (dayjs(to).isSame(was, 'day')) return chime('nope')
    // Undone, the reschedule it counted and the reminder it reset go back too.
    void vigil.saveTask(card.task.id, { [field]: to }).then((before) => {
      chime('shift')
      quietly(() => void vigil.saveTask(card.task.id, { [field]: was, ...(before === true ? {} : before) }))
    })
  }
  /** A day's cards in a new order, kept as each task's own order; undoable. */
  const reorder = (cards: Card[]): void => {
    const was = cards.map((card) => [card.task.id, card.task.sortOrder] as const)
    setHeld(cards.map((card) => `${card.kind}:${card.task.id}`))
    chime('shift')
    void Promise.all(cards.map((card, index) => vigil.saveTask(card.task.id, { sortOrder: index }))).then(() =>
      quietly(() => void Promise.all(was.map(([id, sortOrder]) => vigil.saveTask(id, { sortOrder })))))
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

  // Split, only the pane in front answers keys.
  const here = useHere()
  // ⌘A, ⇧- or ⌘-click pick several, to do, move or bin together, as in every task list.
  const several = useTaskPick(onShow, chosen ? onShow.indexOf(chosen.task) : -1, { here, off: example })
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || example) return
      const key = event.key
      const take = (run: () => void): void => {
        event.preventDefault()
        run()
      }
      // ⌥↑ and ⌥↓ move the card up and down its day.
      if (event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
        const to = row + (key === 'ArrowUp' ? -1 : 1)
        if (!chosen) return
        if (to < 0 || to >= column.length) return take(() => chime('nope'))
        const order = [...column]
        ;[order[row], order[to]] = [order[to], order[row]]
        return take(() => reorder(order))
      }
      if (event.altKey) return
      if (key === 'H' || (event.shiftKey && key === 'ArrowLeft')) return chosen && take(() => (move(chosen, -1), setAt({ col: Math.max(0, at.col - 1), id: at.id })))
      if (key === 'L' || (event.shiftKey && key === 'ArrowRight')) return chosen && take(() => (move(chosen, 1), setAt({ col: Math.min(6, at.col + 1), id: at.id })))
      if (key === 'h' || key === 'ArrowLeft') return take(() => go(at.col - 1))
      if (key === 'l' || key === 'ArrowRight') return take(() => go(at.col + 1))
      if (key === 'j' || key === 'ArrowDown' || key === 'k' || key === 'ArrowUp') {
        const next = column[Math.max(0, Math.min(column.length - 1, row + (key === 'j' || key === 'ArrowDown' ? 1 : -1)))]
        return take(() => setAt({ col: at.col, id: next ? `${next.kind}:${next.task.id}` : null }))
      }
      if (key === '[' || key === ']') return take(() => (chime('page'), setFrom((week) => week + (key === '[' ? -7 : 7))))
      if (!chosen) return
      if (key === 'Enter') return take(() => pick(chosen.task.id))
      if (key === 'e') return take(() => void completeTask(chosen.task))
      // ⌫ as in every list: closed without doing, into the Bin, with Undo.
      if (key === 'Backspace' || key === 'Delete') return take(() => void moveToBin([{ type: 'task', id: chosen.task.id, status: chosen.task.status }]))
      // ; a thought on the card, into the task's log; with the task open, its log takes the key.
      if (key === ';' && !open) return take(() => (chime('tap'), setGlossing(at.id)))
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
  // Each day's events placed among its cards by time, six at most (the rest counted).
  const hidden: number[] = []
  const placed = days.map((day, col) => {
    const events = eventsOn(mac.events, dayKey(day.start))
    hidden[col] = Math.max(0, events.length - 6)
      return placeEvents(events.slice(0, 6), day.cards.map((card) => ({ key: `${card.kind}:${card.task.id}`, at: timeOf(card) })))
  })
  const eventRow = (event: MacEvent): React.JSX.Element => (
    <Tip key={`mac-${event.start}-${event.title}`} label="From your Mac's calendar: change it there"><span data-week-event className="px-1"><EventLine event={event} compact /></span></Tip>
  )
  return (
    <>
      <Page aside={!!open} wide fit title="week" count={several.chosen.length || undefined} unit={['selected', 'selected']} actions={several.bar ??
        <span className="flex items-center gap-2 text-xs">
          <span className="hidden whitespace-nowrap @[60rem]/page:inline"><Pressed keys="H" /> <Pressed keys="L" /> days · <Pressed keys="⇧H" /> <Pressed keys="⇧L" /> move a day · <Pressed keys="⌥↑" /> <Pressed keys="⌥↓" /> order · <Pressed keys="[" /> <Pressed keys="]" /> week</span>
          <Tip label="Week before  [">
            <Button variant="ghost" size="icon-sm" onClick={() => (chime('page'), setFrom(from - 7))} aria-label="Week before"><ChevronLeft className="size-4" /></Button>
          </Tip>
          {/* The dates, which take you back to this week from any other. */}
          <Tip label="Back to this week">
            <button type="button" onClick={() => (chime('tap'), setFrom(0))} className="rounded px-1 text-foreground hover:bg-accent">
              <Rolling by="word" className="whitespace-nowrap" text={`${dayMonth(first, 'never')} to ${dayMonth(last, 'never')}`} />
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
          collisionDetection={cardsFirst}
          // Scroll only right at the edges, gently, so a day near the edge can
          // still be dropped on; and the days are measured again as they scroll,
          // or a drop after scrolling lands nowhere.
          autoScroll={{ threshold: { x: 0.06, y: 0.1 }, acceleration: 4 }}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={({ active }) => {
            chime('lift')
            ticks.start(cardOf(String(active.id))?.col)
            setLanding(null)
            setShot(snapshot(String(active.id)))
          }}
          onDragMove={({ active, over }) => {
            // Over a card: its day lights; in the card's own day, a line shows which side it goes.
            const target = over && String(over.id).startsWith('on:') ? cardOf(String(over.id).slice(3)) : null
            setOver(target ? target.col : over ? Number(over.id) : null)
            const box = active.rect.current.translated
            const same = target && target.col === cardOf(String(active.id))?.col
            const next = same && box && over ? { id: String(over.id).slice(3), after: box.top + box.height / 2 > over.rect.top + over.rect.height / 2 } : null
            if (next?.id !== between?.id || next?.after !== between?.after) setBetween(next)
            ticks(next ? `${next.id}:${next.after}` : target ? target.col : over ? Number(over.id) : null)
          }}
          onDragCancel={() => (setShot(null), setOver(null), setBetween(null))}
          onDragEnd={({ active, over }) => {
            setShot(null)
            setOver(null)
            const place = between
            setBetween(null)
            const from = cardOf(String(active.id))
            const onCard = over && String(over.id).startsWith('on:') ? cardOf(String(over.id).slice(3)) : null
            const to = onCard ? onCard.col : over ? Number(over.id) : null
            if (!from || to === null) return chime('stay')
            // In its own day, beside the card it was let go on: a new order for the day.
            if (to === from.col) {
              if (!place) return chime('stay')
              const order = days[to].cards.filter((card) => card !== from.card)
              const at = order.findIndex((card) => `${card.kind}:${card.task.id}` === place.id) + (place.after ? 1 : 0)
              order.splice(at, 0, from.card)
              if (order.every((card, index) => card === days[to].cards[index])) return chime('stay')
              return reorder(order)
            }
            setLanding({ id: String(active.id), col: to })
            move(from.card, to - from.col)
          }}
        >
        {/* Calendar on but refused by macOS: said, with the way to allow it. */}
        <CalendarNote said={mac} className="mx-3 mt-3" />
        <Example on={example} className="min-h-0 flex-1" tryIt="give a task a day, like ‘send the reading list Thursday’, in Today or Upcoming. It shows here on that day.">
        <div ref={strip} onScroll={measure}
          style={{ maskImage: edges.left || edges.right ? `linear-gradient(to right, ${edges.left ? 'transparent, black 3rem' : 'black'}, ${edges.right ? 'black calc(100% - 3rem), transparent' : 'black'})` : undefined }}
          className="grid min-h-0 flex-1 gap-px overflow-x-auto p-3 [grid-template-columns:repeat(7,minmax(5rem,1fr))] [grid-template-rows:minmax(0,1fr)]">
          {days.map((day, col) => {
            const date = new Date(day.start)
            const today = day.start === dayStart(0)
            return (
              <Day
                key={day.start}
                col={col}
                className={`mf-fade-end flex min-h-0 min-w-0 flex-col gap-1 overflow-y-auto overscroll-contain rounded-md p-1.5 transition-colors ${over === col ? 'bg-accent/60 ring-1 ring-ring' : col === at.col ? 'bg-accent/30' : ''}`}
              >
                <DayMarkMenu day={dayKey(date)} all={marked} onOpenDay={(day) => onOpen?.('day', day)}>
                <header className="mb-1 flex min-w-0 items-baseline gap-1.5 px-1">
                  <span className={`text-meta font-medium ${today ? 'text-[var(--tt-color-text-orange)]' : ''}`}>{dayjs(date).format('ddd')}</span>
                  {today
                    ? <Ring seed={String(day.start)} draw={() => penToday(day.start)} ink="var(--tt-color-text-orange)" className="text-xs text-muted-foreground tabular-nums">{date.getDate()}</Ring>
                    : <span className="text-xs text-muted-foreground tabular-nums">{date.getDate()}</span>}
                  {/* A marked day: its flag and name, beside the date. */}
                  <DayFlags marks={onDay(marked, dayKey(date))} named className="min-w-0 self-center" />
                  {/* How much reviewing falls on the day: a heavy one is a light day for tasks. */}
                  {day.reviews > 0 && (
                    <Tip label={`${day.reviews} ${day.reviews === 1 ? 'card' : 'cards'} to review${day.reviews >= 30 ? ': a heavy day for reviews, so plan fewer tasks' : ''}`}>
                      <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums" style={{ color: day.reviews >= 30 ? 'var(--tt-color-text-purple)' : undefined }}>
                        <Brain className="size-3" />
                        <Rolling text={day.reviews} />
                      </span>
                    </Tip>
                  )}
                </header>
                </DayMarkMenu>
                {/* How full the day is: its meetings and tasks against the working day. Each task counted once. */}
                {(() => {
                  const events = eventsOn(mac.events, dayKey(date))
                  const tasks = day.cards.filter((card) => card.kind === 'scheduled' || !card.task.dueAt).map((card) => card.task)
                  return example ? null : <DayLoadLine load={loadOf(dayKey(date), events, tasks, room)} />
                })()}
                {/* The day's events from your Mac's calendar, read only, in one line with the
                    timed tasks by time; the cards keep their own order. */}
                {placed[col].get('top')?.map(eventRow)}
                {day.cards.map((card) => {
                  const id = `${card.kind}:${card.task.id}`
                  const late = card.kind === 'scheduled' ? new Date(card.task.dueAt!).getTime() < dayStart(0) : new Date(card.task.deadline!).getTime() < dayStart(0)
                  return [...(placed[col].get(id) ?? []).map(eventRow), (
                    <motion.div key={id} className="group/item relative"
                      // Just dropped here from another day: it settles in from the chip's tilt.
                      initial={landing?.id === id && landing.col === col ? { opacity: 0.4, scale: 0.97, rotate: -1.5 } : false}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }}>
                    {/* Where a card dragged in its own day will go: a line above or below this one. */}
                    {between?.id === id && <span aria-hidden className={`absolute inset-x-1 z-10 h-0.5 rounded-full bg-ring ${between.after ? '-bottom-[3px]' : '-top-[3px]'}`} />}
                    <Carried id={id}>
                    <RowMenu items={several.menu(card.task) ?? taskMenu(card.task, { open: () => (setAt({ col, id }), pick(card.task.id)), complete: () => void completeTask(card.task), now: taskNow, thought: () => setGlossing(id) })}>
                    <button
                      type="button"
                      data-row data-id={card.task.id} data-picked={several.chosen.includes(card.task.id) || undefined}
                      data-cursor={at.id === id || undefined}
                      onClick={(event) => (setAt({ col, id }), event.shiftKey || event.metaKey ? several.toggle(card.task.id) : pick(card.task.id))}
                      className={`@container/card relative flex w-full touch-none items-start gap-1.5 rounded-md border bg-background px-2 py-1.5 text-left text-control transition-colors hover:bg-accent/60 ${at.id === id && at.col === col ? 'border-ring bg-accent/50' : ''} ${open?.id === card.task.id ? 'bg-accent' : ''} ${several.chosen.includes(card.task.id) ? PICKED_ROW : ''}`}
                    >
                      {/* The mark in a column of its own, kept only when a task that day has one: the title and its time start in one place. */}
                      {/* In a card too narrow for it, the mark moves down beside the time, so the words keep the width. */}
                      {markRoom(day.cards.map((one) => one.task)) && <span className="mt-[3px] hidden shrink-0 @[7.5rem]/card:flex"><PriorityMark level={card.task.priority} room /></span>}
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                      <span data-task-title className="line-clamp-2 min-w-0 max-w-full text-pretty [overflow-wrap:break-word]">{taskName(card.task.title).text}</span>
                      <span data-task-meta className="flex w-full min-w-0 flex-wrap items-center gap-1.5 pr-5 text-xs text-muted-foreground" style={{ color: late ? 'var(--tt-color-text-red)' : undefined }}>
                        {!!card.task.priority && <span className="flex @[7.5rem]/card:hidden"><PriorityMark level={card.task.priority} /></span>}
                        {card.kind === 'deadline' ? (
                          <span {...loud(late ? 'late' : 'deadline', 'flex items-center gap-1')}><CalendarClock className="size-3" /> {card.task.deadlineTimed ? `Due by ${clock(card.task.deadline!)}` : 'Due'}</span>
                        ) : late ? (
                          <LateSaid said={when(card.task.dueAt, !!card.task.allDay)} />
                        ) : !card.task.allDay ? (
                          clock(card.task.dueAt!)
                        ) : null}
                        {card.task.recurrence && <Tip label={`Repeats: ${card.task.recurrence}`}><span className="flex"><Repeat className="size-3" /></span></Tip>}
                        <Tags tags={taskName(card.task.title).tags} alone />
                      </span>
                      </span>
                    </button>
                    </RowMenu>
                    </Carried>
                    {/* A thought without opening it: on hover, or ; on the card. Over the
                        corner on its own ground while shown, so the title keeps the
                        card's whole width the rest of the time. */}
                    <GlossButton className="top-1 right-1 bg-background" onClick={() => setGlossing(id)} />
                    {glossing === id && <GlossLine id={card.task.id} open onDone={() => setGlossing(null)} placeholder="A thought on it, kept in its log" className="pt-1" />}
                    </motion.div>
                  )]
                })}
                {placed[col].get('end')?.map(eventRow)}
                {hidden[col] > 0 && <span className="px-1 text-xs text-muted-foreground">and {hidden[col]} more in your calendar</span>}
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
        </Example>
        {/* Settling back is shown only when it goes back: one let go over
            another day lands there at once, where its card fades in. */}
        <Overlay modifiers={[underPointer]} dropAnimation={document.documentElement.dataset.motion === 'off' || landing ? null : SETTLE}>
          {shot && cardOf(String(shot.id)) ? <Chip card={cardOf(String(shot.id))!.card} width={shot.width} /> : null}
        </Overlay>
        </DndContext>
      </Page>
      {open && <TaskDetail key={open.id} task={open} onClose={() => setOpen(null)} onOpen={onOpen} />}
    </>
  )
}

/**
 * "Late · 10 Sept 14:00" in a narrow column: it may break before the time,
 * never inside the date, and a date wider than the card ends in "…".
 */
function LateSaid({ said }: { said: string }): React.JSX.Element {
  const [, day, time] = /^(.*?)(?: (\d{1,2}:\d\d))?$/.exec(said) ?? [said, said, '']
  return (
    <span {...loud('late', 'flex min-w-0 max-w-full flex-wrap gap-x-1')}>
      <span className="whitespace-nowrap">Late ·</span>
      <span className="max-w-full truncate">{day}</span>
      {time && <span className="whitespace-nowrap">{time}</span>}
    </span>
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
  // Also somewhere to drop: another card let go on it goes beside it.
  const { setNodeRef: dropOn } = useDroppable({ id: `on:${id}` })
  return <div ref={(node) => (setNodeRef(node), dropOn(node))} data-sortable-id={id} {...listeners} className={isDragging ? 'opacity-30' : undefined}>{children}</div>
}

/**
 * What the pointer carries: the card made small, one line with its colour
 * down the side (red for a deadline, orange when urgent, the accent
 * otherwise), tilted a little as a card is when lifted off a table.
 */
function Chip({ card, width }: { card: Card; width: number }): React.JSX.Element {
  const color = card.kind === 'deadline' ? 'var(--tt-color-text-red)' : card.task.priority === 1 ? 'var(--tt-color-text-orange)' : 'var(--tt-brand-color-400)'
  const time = card.kind === 'deadline' ? (card.task.deadlineTimed ? clock(card.task.deadline!) : 'Due') : !card.task.allDay && card.task.dueAt ? clock(card.task.dueAt) : ''
  return (
    <motion.div
      initial={{ rotate: 0, scale: 1 }}
      animate={{ rotate: -2.5, scale: 1.03 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      style={{ width: Math.min(width, 224) }}
      className="flex cursor-grabbing items-center gap-2 rounded-md border bg-background py-1 pr-2.5 pl-1.5 text-control shadow-(--mf-shadow-lift)"
    >
      <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate">{taskName(card.task.title).text}</span>
      {time && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{time}</span>}
    </motion.div>
  )
}
