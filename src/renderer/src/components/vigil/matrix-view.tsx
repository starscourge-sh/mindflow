import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { moveToBin } from '@/lib/to-bin'
import { motion } from 'motion/react'
import { byKeys } from '@/lib/motion'
import { useFluidHover } from './glide'
import { DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection } from '@dnd-kit/core'

import { chime } from '@/lib/sound'
import { slotTicker } from '@/lib/proximity'
import { placed, taskName } from '@/lib/tasks'
import { unloaded, useLastAsked, useLive, vigil, whenInLine, type Task, type TaskFull } from '@/lib/vigil'
import { exampleTasks } from '@/lib/examples'
import { Example } from './example'
import { useOpened } from '@/lib/nav'
import { isUrgent, quadrantOf, type Quadrant } from '../../../../main/task-words'
import { dayjs } from '../../../../main/dates'
import { Page, Pressed, Rolling, Tags, toast, typing, quietly } from './ui'
import { markRoom } from './task-input'
import { TaskDetail, TaskPriority, TaskWhen, completeTask, taskMenu, useTaskNow } from './tasks-view'
import { RowMenu } from './row-menu'
import { Overlay, SETTLE, underPointer } from './sortable'
import { Button } from '@/components/ui/button'
import { useHere } from '@/lib/split'
import { PICKED_ROW, useTaskPick } from './task-pick'

/** The four boxes, in reading order: top row important, left column urgent. */
export const QUADS: { id: Quadrant; title: string; said: string; tint: string }[] = [
  { id: 'do', title: 'Do now', said: 'Urgent and important. Today, if you can.', tint: 'red' },
  { id: 'plan', title: 'Plan', said: 'Important, not urgent. Give each a day.', tint: 'blue' },
  { id: 'handoff', title: 'Hand off or batch', said: 'Urgent, not important. Pass on, or do in one go.', tint: 'orange' },
  { id: 'drop', title: 'Drop or later', said: 'Neither. Close it without doing, or put it in Later.', tint: 'gray' }
]
/** Over a card before its box, so a card let go on another lands beside it; never on itself. */
const cardsFirst: CollisionDetection = (args) => {
  const hits = pointerWithin(args).filter((hit) => hit.id !== `on:${args.active.id}`)
  return [...hits.filter((hit) => String(hit.id).startsWith('on:')), ...hits.filter((hit) => !String(hit.id).startsWith('on:'))]
}
/** Within a box: your own order first, then by date, then priority. */
export const inBox = (a: Task, b: Task): number =>
  (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || (placed(a) ?? Infinity) - (placed(b) ?? Infinity) || (a.priority || 5) - (b.priority || 5) || a.number - b.number
/** Tasks in the Matrix's order: Do now, Plan, Hand off, Drop, each box as it sorts itself. */
export const byMatrix = (tasks: Task[]): Task[] => QUADS.flatMap((quad) => tasks.filter((task) => quadrantOf(task) === quad.id).sort(inBox))
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
 * to push the date. Each move is undoable from its notice. Within a box the
 * cards keep your own order once you give one (dragged up or down, or ⌥↑ ⌥↓),
 * saved as each task's own order as the week board and Today's page keep it;
 * the rest follow by date, then priority.
 */
export function MatrixView({ focus, onOpen, today }: { focus?: string; onOpen?: (type: string, id: string) => void; today?: TodayScope }): React.JSX.Element {
  const real = useLive(vigil.tasks, [] as Task[])
  const taskNow = useTaskNow()
  // No open tasks yet: four boxes of made-up ones show how it sorts them, dimmed and out of reach. Today's own Matrix says it is empty instead.
  const example = !today && !unloaded(real) && !real.some((task) => task.status === 'open')
  const examples = useMemo(exampleTasks, [])
  const tasks = example ? examples : real
  const [open, setOpen] = useState<TaskFull | null>(null)
  const [at, setAt] = useState<{ q: number; id: string | null }>({ q: 0, id: null })
  const [over, setOver] = useState<Quadrant | null>(null)
  const overRef = useRef<Quadrant | null>(null)
  const [carried, setCarried] = useState<{ task: Task; width: number } | null>(null)
  // Just moved here: shown in its new box at once while the move saves.
  const [landing, setLanding] = useState<{ id: string; q: Quadrant } | null>(null)
  useEffect(() => setLanding(null), [tasks])
  // Out of an urgent box: how far its date goes is asked in the box it went to.
  const [pushing, setPushing] = useState<{ task: Task; to: Quadrant } | null>(null)
  // A box's new order, shown at once while each task's place saves; the saved one takes over once all are in.
  const [held, setHeld] = useState<string[] | null>(null)
  const saving = useRef(0)
  useEffect(() => void (saving.current || setHeld(null)), [tasks])
  // Where a card carried in its own box will go: above or below the card under it.
  const [between, setBetween] = useState<{ id: string; after: boolean } | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // A soft tick as a carried task comes over each new box.
  const ticks = useRef(slotTicker()).current

  // What you are waiting on is chased, not done: it stays out of the boxes.
  const live = tasks.filter((task) => task.status === 'open' && !task.waitingOn && (!today || today.ids.includes(task.id)))
    .sort(inBox)
  const boxOf = (task: Task): Quadrant => (landing?.id === task.id ? landing.q : pushing?.task.id === task.id ? pushing.to : quadrantOf(task))
  const boxes = QUADS.map((quad) => live.filter((task) => boxOf(task) === quad.id))
  // The mark's room is kept in every box once any task has a mark, so titles start in one place across the four.
  const room = markRoom(live)
  if (held) for (const box of boxes) if (box.every((task) => held.includes(task.id))) box.sort((a, b) => held.indexOf(a.id) - held.indexOf(b.id))
  const boxWith = (id: string): number => boxes.findIndex((box) => box.some((task) => task.id === id))
  const column = boxes[at.q] ?? []
  const row = column.findIndex((task) => task.id === at.id)
  const chosen = row >= 0 ? column[row] : undefined

  // Each box scrolls inside itself: the task the keys move to is brought into view there.
  useEffect(() => {
    if (at.id) document.querySelector(`[data-sortable-id="${CSS.escape(at.id)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [at.id, at.q])

  // Only the last pick lands: a late answer for the task before is dropped.
  const asked = useLastAsked()
  const pick = (id: string): void => asked(vigil.task(id), setOpen)
  // Opening a task is a step Back returns from.
  useOpened(open?.id, focus, pick, () => (asked(), setOpen(null)), { shown: example ? [] : live.map((task) => task.id), kind: 'task' })

  /** Saved with one notice, whose undo puts back its importance, its dates and what the move reset. */
  const save = (task: Task, patch: { important?: number; due?: string; deadline?: string }, said: string): void => {
    const was = { priority: task.priority, due: task.dueAt, deadline: task.deadline, plan: task.planFor }
    void vigil.saveTask(task.id, patch).then((before) => {
      chime('shift')
      const back = (): void => void vigil.saveTask(task.id, { ...was, ...(before === true ? {} : before) })
      // Only importance changed: the card landing in its box says it all. A date moved is worth the words.
      if (patch.due || patch.deadline) toast(said, back)
      else quietly(back)
    })
  }
  /** A box's cards in a new order, kept as each task's own order; undoable. */
  const reorder = (list: Task[]): void => {
    const was = list.map((task) => [task.id, task.sortOrder] as const)
    setHeld(list.map((task) => task.id))
    chime('shift')
    saving.current++
    void Promise.all(list.map((task, index) => vigil.saveTask(task.id, { sortOrder: index }))).then(() => {
      saving.current--
      quietly(() => void Promise.all(was.map(([id, sortOrder]) => vigil.saveTask(id, { sortOrder }))))
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
  // ⌘A, ⇧- or ⌘-click pick several, to do, move or bin together, as in every task list.
  const several = useTaskPick(example ? [] : live, chosen ? live.indexOf(chosen) : -1, { here, off: example })
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || example) return
      if (event.altKey && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      const key = event.key
      const take = (run: () => void): void => (event.preventDefault(), run())
      // The push asked for: ↵ takes a week, Esc keeps it where it was.
      if (pushing && key === 'Escape') return take(() => push(null))
      if (pushing && key === 'Enter') return take(() => push(7))
      // ⌥↑ and ⌥↓ move the card up and down its box, as on the week board.
      if (event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
        if (!chosen) return
        const to = row + (key === 'ArrowUp' ? -1 : 1)
        if (to < 0 || to >= column.length) return take(() => chime('nope'))
        const order = [...column]
        ;[order[row], order[to]] = [order[to], order[row]]
        return take(() => reorder(order))
      }
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
      // ⌫ as in every list: closed without doing, into the Bin, with Undo.
      if (key === 'Backspace' || key === 'Delete') return take(() => void moveToBin([{ type: 'task', id: chosen.id, status: chosen.status }]))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <Page aside={!!open} wide fit="columns" title={today ? 'today' : 'matrix'} count={example ? undefined : several.chosen.length || live.length} unit={several.chosen.length ? ['selected', 'selected'] : today ? ['task today', 'tasks today'] : ['task', 'tasks']} actions={several.bar ?? today?.actions ??
        <span className="hidden text-xs whitespace-nowrap @[52rem]/page:inline">
          Urgent: late, or within two days · <Pressed keys="H" /> <Pressed keys="J" /> <Pressed keys="K" /> <Pressed keys="L" /> move · <Pressed keys="⌥↑" /> <Pressed keys="⌥↓" /> order · <Pressed keys="1" /> to <Pressed keys="4" /> send to a box
        </span>
      }>
        <DndContext
          sensors={sensors}
          collisionDetection={cardsFirst}
          onDragStart={({ active }) => {
            chime('lift')
            setLanding(null)
            const task = live.find((one) => one.id === String(active.id))
            const node = document.querySelector(`[data-sortable-id="${CSS.escape(String(active.id))}"]`)
            if (task) setCarried({ task, width: node?.getBoundingClientRect().width ?? 224 })
            ticks.start(task ? quadrantOf(task) : null)
          }}
          onDragMove={({ active, over }) => {
            // Over a card: its box lights; in the card's own box, a line shows which side it goes.
            const card = over && String(over.id).startsWith('on:') ? String(over.id).slice(3) : null
            const q = card ? boxWith(card) : -1
            const box = card ? (QUADS[q]?.id ?? null) : over ? (String(over.id) as Quadrant) : null
            if (box !== overRef.current) setOver((overRef.current = box))
            const rect = active.rect.current.translated
            const next = card && q === boxWith(String(active.id)) && rect && over ? { id: card, after: rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 } : null
            if (next?.id !== between?.id || next?.after !== between?.after) setBetween(next)
            ticks(next ? `${next.id}:${next.after}` : box)
          }}
          onDragCancel={() => (setCarried(null), setOver((overRef.current = null)), setBetween(null))}
          onDragEnd={({ active, over }) => {
            setCarried(null)
            setOver((overRef.current = null))
            const place = between
            setBetween(null)
            const task = live.find((one) => one.id === String(active.id))
            const card = over && String(over.id).startsWith('on:') ? String(over.id).slice(3) : null
            const to = card ? QUADS[boxWith(card)]?.id : over ? (String(over.id) as Quadrant) : undefined
            if (!task || !to) return chime('stay')
            // In its own box, beside the card it was let go on: a new order for the box.
            if (to === boxOf(task)) {
              if (!place) return chime('stay')
              const list = boxes[boxWith(task.id)]
              const order = list.filter((one) => one !== task)
              order.splice(order.findIndex((one) => one.id === place.id) + (place.after ? 1 : 0), 0, task)
              if (order.every((one, index) => one === list[index])) return chime('stay')
              return reorder(order)
            }
            send(task, to)
          }}
        >
          {today && <TodayLine left={live.length} done={today.done} ready={!unloaded(tasks)} onAll={today.onAll} />}
          <Example on={example} className="@[34rem]/page:min-h-0 @[34rem]/page:flex-1" tryIt="add a task in Today, like ‘finish the essay by Friday !!’, and see which box it lands in. Drag it to another box to change how much it matters.">
          {/* The four boxes share the window in equal rows, never taller than it. A box with more
              than fits scrolls inside itself, so its title always shows. */}
          <div className="grid grid-cols-1 gap-3 p-3 @[34rem]/page:min-h-0 @[34rem]/page:flex-1 @[34rem]/page:grid-cols-2 @[34rem]/page:[grid-template-rows:var(--matrix-rows)]"
            style={{ '--matrix-rows': matrixRows() } as React.CSSProperties}>
            {QUADS.map((quad, q) => (
              <Box key={quad.id} id={quad.id}
                className={`flex min-h-[7rem] min-w-0 flex-col @[34rem]/page:min-h-0 gap-1 rounded-lg border p-2 transition-colors ${over === quad.id ? 'bg-accent/60 ring-1 ring-ring' : q === at.q ? 'bg-accent/25' : ''}`}>
                <header className="mb-1 shrink-0 px-1">
                  <h2 className="flex items-baseline gap-2 text-heading font-semibold" style={{ color: `var(--tt-color-text-${quad.tint})` }}>
                    <span>{quad.title}</span>
                    <span className="text-xs font-normal text-muted-foreground tabular-nums"><Rolling text={`${boxes[q].length} ${boxes[q].length === 1 ? 'task' : 'tasks'}`} by="word" /></span>
                    {/* The key only while a task is picked, and said in words: a bare 1 to 4 read as a count. */}
                    {chosen && q !== at.q && <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-muted-foreground">Send it here <Pressed keys={String(q + 1)} /></span>}
                  </h2>
                  <p className="text-xs text-muted-foreground">{quad.said}</p>
                </header>
                {pushing?.to === quad.id && (
                  <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-md border border-dashed border-ring/60 px-2 py-1.5 text-xs text-muted-foreground">
                    <span className="mr-auto min-w-0 truncate">Not urgent, so push “{taskName(pushing.task.title).text}” out:</span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => push(7)}>A week <Pressed keys="↵" /></Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => push(14)}>Two weeks</Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => push(null)}>Cancel <Pressed keys="Esc" /></Button>
                  </div>
                )}
                <BoxList className="mf-fade-end mf-fade-tall -mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-1 pb-0.5">
                  {boxes[q].map((task) => (
                    <motion.div key={task.id} className="relative"
                      // Just dropped here: it settles in from the chip's tilt. Sent by a key (1 to 4) it is simply there: the ring and the chime answer.
                      initial={!byKeys() && (landing?.id === task.id || pushing?.task.id === task.id) ? { opacity: 0.4, scale: 0.97, rotate: -1.5 } : false}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }}>
                      {/* Where a card carried in its own box will go: a line above or below this one. */}
                      {between?.id === task.id && <span aria-hidden data-between className={`absolute inset-x-1 z-10 h-0.5 rounded-full bg-ring ${between.after ? '-bottom-[3px]' : '-top-[3px]'}`} />}
                      <Carried id={task.id}>
                        <RowMenu items={example ? [] : several.menu(task) ?? taskMenu(task, { open: () => (setAt({ q, id: task.id }), pick(task.id)), now: taskNow })}>
                          <div><Card task={task} at={at.id === task.id && at.q === q} open={open?.id === task.id} picked={several.chosen.includes(task.id)} room={room} onClick={(event) => (setAt({ q, id: task.id }), event.shiftKey || event.metaKey ? several.toggle(task.id) : pick(task.id))} /></div>
                        </RowMenu>
                      </Carried>
                    </motion.div>
                  ))}
                  {/* Said only once the tasks are read, so coming back never flashes it. */}
                  {!boxes[q].length && !unloaded(tasks) && <p data-box-empty className="px-1 py-2 text-control text-muted-foreground">{emptySaid(quad.id, !!carried, !!today)}</p>}
                </BoxList>
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
                <span className="min-w-0 flex-1 truncate">{taskName(carried.task.title).text}</span>
              </motion.div>
            ) : null}
          </Overlay>
        </DndContext>
      </Page>
      {open && <TaskDetail key={open.id} task={open} onClose={() => setOpen(null)} onOpen={onOpen} />}
    </>
  )
}

/** Today's tasks only, what the Today page passes in: their ids, what is done today, and its own header. */
type TodayScope = { ids: string[]; done: number; actions: ReactNode; onAll: () => void }

/** The two rows of boxes, always equal: a box with more than fits scrolls inside itself (in a short window the page scrolls rather than squash either row below 12rem). */
export const matrixRows = (): string => 'minmax(12rem, 1fr) minmax(12rem, 1fr)'

/** An empty box, said for where it is. Every task on today is due soon, so on Today the two calm boxes are where a task goes to leave the day. */
const emptySaid = (box: Quadrant, carrying: boolean, today: boolean): string =>
  !today ? (carrying ? 'Drop a task here' : 'Nothing here')
    : urgent(box) ? (carrying ? 'Drop a task here' : 'Nothing here today')
    : carrying ? 'Drop it here to move it off today' : 'Today’s tasks are all due soon, so none sit here. Drag one here to move it to a later day.'

/** Over Today's boxes: whose tasks these are, and the way to all of them. */
function TodayLine({ left, done, ready, onAll }: { left: number; done: number; ready: boolean; onAll: () => void }): React.JSX.Element {
  const said = !ready || left ? 'Today’s tasks, by how soon and how much they matter' : done ? 'Everything on today is done' : 'Nothing on today yet'
  return (
    <div data-today-scope data-said={said} className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 text-[0.9375rem]">
      <span className="font-medium text-foreground"><Rolling text={said} by="word" /></span>
      {ready && !left && !done && <span className="text-muted-foreground">Add one from “List”, or see what is coming in the full Matrix.</span>}
      <Button data-all-matrix variant="ghost" size="sm" className="ml-auto h-7 gap-2 px-2 text-sm" onClick={onAll}>All tasks in Matrix <Pressed keys="G Q" /></Button>
    </div>
  )
}

/** One task, as the week draws it: its priority, its name, and when. */
function Card({ task, at, open, picked, room, onClick }: { task: Task; at: boolean; open: boolean; picked: boolean; room: boolean; onClick: (event: React.MouseEvent) => void }): React.JSX.Element {
  const { text, tags } = taskName(task.title)
  return (
    <button type="button" data-row data-id={task.id} data-picked={picked || undefined} data-cursor={at || undefined} onClick={onClick}
      className={`relative flex w-full touch-none items-start gap-1.5 rounded-md border bg-background px-2 py-1.5 text-left text-control transition-colors data-[fluid-hover-active]:bg-accent/60 ${at ? 'border-ring bg-accent/50' : ''} ${open ? 'bg-accent' : ''} ${picked ? PICKED_ROW : ''}`}>
      {/* The mark in a column of its own, kept only when a task in the box has one: the title and its line start in one place. */}
      {room && <span className="mt-[3px] flex shrink-0"><TaskPriority task={task} room /></span>}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
      <span data-task-title className="line-clamp-2 min-w-0 text-pretty [overflow-wrap:anywhere]">{text}</span>
      <span data-task-meta className="flex min-w-0 flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground">
        <TaskWhen task={task} />
        {!task.dueAt && !task.deadline && <span>No date</span>}
        <Tags tags={tags} alone />
      </span>
      </span>
    </button>
  )
}

/**
 * A box's cards: the one nearest the pointer is lit, so moving down the box
 * through the gap between two cards never goes dark (glide.tsx). The cards are
 * opaque, so the light is each card's own fill rather than one gliding under them.
 */
function BoxList({ className, children }: { className: string; children: ReactNode }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(box, { items: '[data-row]' })
  // How many cards sit below the box's edge: said under it, so a full box reads as one that scrolls.
  const [below, setBelow] = useState(0)
  useEffect(() => {
    const list = box.current
    if (!list) return
    const count = (): void => {
      const edge = list.getBoundingClientRect().bottom
      setBelow([...list.children].filter((one) => one.getBoundingClientRect().top + 12 > edge).length)
    }
    count()
    const watch = new ResizeObserver(count)
    watch.observe(list)
    for (const one of list.children) watch.observe(one)
    list.addEventListener('scroll', count, { passive: true })
    return () => (watch.disconnect(), list.removeEventListener('scroll', count))
  })
  return (
    <>
      <div ref={box} data-matrix-list {...hover.handlers} className={`relative ${className}`}>{children}</div>
      {below > 0 && (
        <button type="button" data-more-below className="mx-auto -mt-1 shrink-0 rounded-full px-2.5 py-0.5 text-control font-medium text-foreground hover:bg-accent"
          onClick={() => box.current?.scrollBy({ top: box.current.clientHeight * 0.8, behavior: 'smooth' })}>
          +{below} more ↓
        </button>
      )}
    </>
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
  // Also somewhere to drop: another card let go on it goes beside it.
  const { setNodeRef: dropOn } = useDroppable({ id: `on:${id}` })
  return <div ref={(node) => (setNodeRef(node), dropOn(node))} data-sortable-id={id} {...listeners} className={isDragging ? 'opacity-30' : undefined}>{children}</div>
}
