import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { TaskAddress, TaskSite } from './task-site'
import { Plus } from 'lucide-react'
import { AnimatePresence, PresenceContext, motion } from 'motion/react'
import { EASE, byKeys, shift } from '@/lib/motion'

import { chime } from '@/lib/sound'
import { unloaded, useLive, haligtree, type Task } from '@/lib/haligtree'
import { exampleTasks } from '@/lib/examples'
import { Example } from './example'
import { BUCKETS, bucket, makeListTasks, makeTask, placed, taskName } from '@/lib/tasks'
import { readLines, tasksOf } from '../../../../main/day-lines'
import { Count, Empty, Kbd, Tags, typing, useListKeys, Strip, VirtualList } from './ui'
import { Orb } from './orb'
import { Chips, Display, arrange, useView } from './display'
import { TaskPriority, TaskWhen, landed, useTickOff, moveTo, taskFacets, taskMenu, useTaskNow } from './tasks-view'
import { DOT_IN_LINE, SessionDot, TaskSpent, useTaskTime, type TaskTime } from './task-time'
import { frogOn } from '@/lib/day-plan'
import { TaskInput, keptIn, markRoom, setPriority, useKept } from './task-input'
import { RowMenu } from './row-menu'
import { Tip } from '@/components/haligtree/ui'
import { Rest } from './scenery'
import { GlossButton, GlossLine } from './gloss-line'
import { num, startOfDay } from '../../../../main/dates'
import { useHere } from '@/lib/split'
import { readAhead } from '@/lib/early-read'
import { PICKED_ROW, useTaskPick } from './task-pick'
import { Check } from '@/components/ui/icons'
import { ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ThreeMark, dayThree } from './day-list'

const endOfToday = (): number => startOfDay(1)
const startOfToday = (): number => startOfDay()
/** Placed on a day already gone. */
const isLate = (task: Task): boolean => (placed(task) ?? Infinity) < startOfToday()

/** The task lists' sorts: by when each was made, either way; your own order is the list's as it stands. */
const TASK_SORTS: Record<string, (a: Task, b: Task) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt)
}
type Scope = 'today' | 'upcoming' | 'routines' | keyof typeof BUCKETS | 'backlog' | 'waiting' | 'new'
/** How far back "New" reaches: a task taken in the last two days, whatever list its date put it in. */
const NEW_MS = 2 * 864e5
const EMPTY: Record<Scope, { title: string; text: string }> = {
  today: { title: 'Nothing due today', text: 'A clear day. Anything with a date lands here on the day, and anything late stays on top until it is done.' },
  upcoming: { title: 'Nothing coming up', text: 'Put a day in the words, “friday” or “in 3 days”, and it waits here until then.' },
  routines: { title: 'No routines', text: '“bins every week” comes back each week on the same day. “every! 3 days” counts from when you last did it.' },
  month: { title: 'Nothing this month', text: 'Say “this month” in the words for something with no day yet that should still happen soon.' },
  year: { title: 'Nothing this year', text: '“this year” or “next month” keeps a task here, without a day, until you give it one.' },
  next: { title: 'Nothing next year', text: '“next year” keeps a task here, without a day, until the year comes round.' },
  someday: { title: 'Nothing for someday', text: '“learn Spanish someday”: the things you might do, kept where they do not nag.' },
  backlog: { title: 'Nothing without a date', text: 'A task with no date goes here, out of the way until you give it one.' },
  waiting: { title: 'Waiting on no one', text: 'Fill in “Waiting on…” on a task’s page and it comes here, with a day to chase them.' },
  new: { title: 'Nothing new', text: 'A task taken in the last two days waits here, newest first, whatever day it is for: open it to add to it or put it right.' }
}
// A task shows on the day it is scheduled, or the day it is due by if that is sooner.
const SCOPES: Record<Scope, { label: string; test: (task: Task) => boolean }> = {
  today: { label: 'Today', test: (task) => !task.waitingOn && (placed(task) ?? Infinity) < endOfToday() },
  upcoming: { label: 'Upcoming', test: (task) => !task.waitingOn && !task.recurrence && (placed(task) ?? -Infinity) >= endOfToday() },
  // Next to Upcoming, in sight: a list made from the box is mostly here.
  backlog: { label: 'No date', test: (task) => !task.waitingOn && placed(task) === null && !bucket(task) },
  routines: { label: 'Routines', test: (task) => !!task.recurrence },
  month: { label: BUCKETS.month, test: (task) => !task.waitingOn && bucket(task) === 'month' },
  year: { label: BUCKETS.year, test: (task) => !task.waitingOn && bucket(task) === 'year' },
  next: { label: BUCKETS.next, test: (task) => !task.waitingOn && bucket(task) === 'next' },
  someday: { label: BUCKETS.someday, test: (task) => !task.waitingOn && bucket(task) === 'someday' },
  waiting: { label: 'Waiting', test: (task) => !!task.waitingOn },
  // As a note just taken is on top of the Inbox: a task just taken, wherever its date sent it (note 7ce1ac77).
  new: { label: 'New', test: (task) => Date.now() - Date.parse(task.createdAt) < NEW_MS }
}
/**
 * A task from a typed line, for the list in front: said where it went when that is not this list (a later day, a
 * later list, or a routine). Taken back, `onUndo` has the words again. Quick capture's glance line adds through it
 * too (box-glance.tsx), so a task typed there is read, placed and said the same.
 */
export const addTyped = (text: string, scope: Scope, onUndo: () => void, plain?: { from: number; to: number }[]): void =>
  void makeTask({ text, today: scope === 'today', plain }, async (made) => {
    const task = await haligtree.task(made.id)
    return task && SCOPES[scope].test(task) ? 'Task added' : landed(made, scope)
  }, { onUndo })
/** A pasted list is a task a line, its indented lines their steps; one Undo for all. One line is left to the field. */
export const pasteTasks = (event: React.ClipboardEvent, scope: Scope): void => {
  const list = tasksOf(readLines(event.clipboardData.getData('text/plain')))
  if (list.length < 2 && !list[0]?.steps.length) return
  event.preventDefault()
  void makeListTasks(list, { today: scope === 'today' })
}
/** The lists as chips, and the rest in the "More" menu beside them. */
const NEAR: Scope[] = ['today', 'upcoming', 'backlog', 'new']
const LATER: Scope[] = ['routines', 'month', 'year', 'next', 'someday', 'waiting']

/**
 * Today, sized for the prompt: what is due or late, a line to add one, and the
 * circle to tick it off. A task opens here in the prompt, notes and all, so
 * nothing about it needs the main window. The keys: j and k move, Enter opens,
 * e completes, t, m and w move it to today, tomorrow or next week, 1 to 4
 * give it a priority and 0 none, a adds.
 */
export function TodayPanel({ onOpen, open, glance = false }: { onOpen: (id: string) => void; open?: string; /** Under quick capture's one line (box-glance.tsx): today's list alone, the rows as they are here; the pill's own line adds, so no chips and no line of its own. */ glance?: boolean }): React.JSX.Element {
  const real = useLive(haligtree.tasks, [] as Task[])
  // No open tasks yet: each list shows a few made-up ones, dimmed and out of reach.
  // Never in the glance, which shows only what is there: its one line says what the tab is for instead.
  const example = !glance && !unloaded(real) && !real.some((task) => task.status === 'open')
  const examples = useMemo(exampleTasks, [])
  const tasks = example ? examples : real
  const [draft, setDraft] = useState('')
  const kept = useKept()
  const { ticking, tickOff: tick } = useTickOff(260)
  // The row a thought is being written under, without opening the task.
  const [glossing, setGlossing] = useState<string | null>(null)
  // Every task list, not only today's: the same cuts as the main window.
  const [scope, setScope] = useState<Scope>('today')
  // Narrowed as in the main window: marked, tag, where it came from.
  // Newest first to start: what was caught last is on top. Your own order is a choice in Display.
  // The glance has no Display of its own, so a narrowing chosen in the side panel never hides today's tasks there.
  const [view, setView] = useView(glance ? 'glance:today' : 'prompt:tasks', { sort: 'newest', group: 'none' })
  const facets = taskFacets(tasks)
  // Today, Upcoming and Routines keep their own order (the first three, the days); the sort is for the lists with no day.
  // Those keep their order whatever is picked, so Display offers them no order to pick.
  const dayOrdered = ['today', 'upcoming', 'routines', 'new'].includes(scope)
  const [[, narrowed]] = arrange(tasks, view, facets, dayOrdered ? {} : TASK_SORTS)
  const listed = narrowed.filter((task) => task.status === 'open' && SCOPES[scope].test(task))
  // New is newest first always: the one just taken on top, as in the Inbox. The glance puts what is late on top, then
  // today's, each in the list's own order: at a glance, what is late is what to see first.
  const due = scope === 'new' ? [...listed].sort(TASK_SORTS.newest) : glance ? [...listed.filter(isLate), ...listed.filter((task) => !isLate(task))] : listed

  const add = useRef<HTMLInputElement>(null)
  const [cursor] = useListKeys(example ? 0 : due.length, { onOpen: (index) => onOpen(due[index].id), opened: due.findIndex((task) => task.id === open), onExtend: (from, to) => several.extend(due[from]?.id, due[to].id) })
  // The main window's wording, time kept and undo and all.
  const move = moveTo
  // Today's first task, so the menu can offer it or take it back.
  const settings = useLive(haligtree.settings, null as Awaited<ReturnType<typeof haligtree.settings>> | null)
  const frog = frogOn(settings)
  const now = useTaskNow()
  // The time on these tasks and the session running on one: one read for the list (task-time.tsx).
  const time = useTaskTime()
  // Split, only the pane in front answers keys.
  const here = useHere()
  // Several at once, as on the Tasks pages: x, ⇧-click, ⌘A, ⌫ to the Bin, Esc to let go.
  const several = useTaskPick(example ? [] : due, cursor, { here, off: example })
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'a') {
        event.preventDefault()
        // In the glance the line that adds is the pill's own.
        return (add.current ?? document.querySelector<HTMLInputElement>('[data-list-line] input'))?.focus()
      }
      const task = example ? undefined : due[cursor]
      if (!task) return
      const days = { t: 0, m: 1, w: 7 }[event.key]
      if (/^[0-4]$/.test(event.key)) setPriority(task, Number(event.key))
      // ; a thought on the row, into the task's log; with the task open, its log takes the key.
      else if (event.key === ';' && !open) (event.preventDefault(), chime('tap'), setGlossing(task.id))
      else if (event.key === 'e') tick(task)
      else if (days !== undefined) move(task, days)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })


  // What a row does, read when it is used: each row is drawn again only when
  // its own task or marks change, so opening one redraws two rows, not all of
  // them (a long No date list took a fifth of a second to draw over on a click).
  const act = useRef<RowActs>(null as unknown as RowActs)
  act.current = { onOpen, tick, move, frog, now, several, gloss: setGlossing, endGloss: () => setGlossing(null) }
  const room = markRoom(due)
  // Today's three, numbered as on Today's page: a column for the numbers only when one of them is here.
  const three = scope === 'today' && !example ? dayThree(real) : []
  const ranked = due.some((task) => three.includes(task.id))

  // How many open tasks a list holds, counted from yours only, as the Display narrows them: an example never adds to a number.
  const count = (id: Scope): number => narrowed.filter((task) => real.includes(task) && task.status === 'open' && SCOPES[id].test(task)).length

  // Drawn once the tasks are read: before, the list chips showed "Upcoming", then "Upcoming 9", and moved along.
  // The glance has room of its own to fill meanwhile: the app's one loader, only once the wait can be seen.
  if (unloaded(real) || !settings) return <div className="flex flex-col gap-1 text-sm">{glance && <div className="mf-after-a-beat px-2 py-1.5"><Orb label="Reading today’s tasks" /></div>}</div>
  return (
    <div className="flex flex-col gap-1 text-sm">
      {/* Each list with how many it holds, so a task sent to the backlog is seen landing there. */}
      {!glance && <>
      <Strip className="flex h-8 items-center gap-1 px-1">
      <Chips
        // The three lists used most as chips, the rest under "More": every chip
        // whole in the panel, never a list cut off behind the view button.
        // New goes without a number: what it holds is said by its rows, newest first, and four counts did not fit the box's panel.
        options={NEAR.map((id) => ({ id, label: count(id) && id !== 'new' ? `${SCOPES[id].label} ${num(count(id))}` : SCOPES[id].label }))}
        on={(id) => id === scope}
        pick={(id) => setScope(id as Scope)}
        sideways
        className="min-w-0 shrink"
      />
      <DropdownMenu modal={false} onOpenChange={(open) => open && chime('open')}>
        <DropdownMenuTrigger asChild>
          <button type="button" data-later-lists aria-pressed={LATER.includes(scope)}
            className={`flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs whitespace-nowrap transition-colors ${LATER.includes(scope) ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {LATER.includes(scope) ? `${SCOPES[scope].label}${count(scope) ? ` ${num(count(scope))}` : ''}` : 'More'}
            <ChevronDown className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="text-control">
          {LATER.map((id) => (
            <DropdownMenuItem key={id} onSelect={() => (chime('tap'), setScope(id))} className={id === scope ? 'font-semibold' : ''}>
              <span className="flex-1">{SCOPES[id].label}</span>
              {count(id) > 0 && <Count n={count(id)} className="text-xs text-muted-foreground" />}
              {id === scope && <Check className="size-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="ml-auto shrink-0"><Display compact view={view} onChange={setView} facets={facets} items={tasks} sorts={dayOrdered ? [] : [{ id: 'newest', label: 'Newest' }, { id: 'oldest', label: 'Oldest' }, { id: 'manual', label: 'Your order' }]} /></span>
      </Strip>
      <form
        className="list-box mb-2 flex items-center gap-2 rounded-md border py-1.5 pr-2 focus-within:border-foreground/25"
        onPasteCapture={(event) => pasteTasks(event, scope)}
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.trim()) return
          const text = draft
          const plain = keptIn(kept.list, text)
          setDraft('')
          kept.set([])
          // Taken back, the words are in the field again, ahead of anything typed since.
          addTyped(text, scope, () => {
            setDraft((now) => (now.trim() ? `${text} ${now}` : text))
            requestAnimationFrame(() => (add.current?.focus(), add.current?.setSelectionRange(text.length, text.length)))
          }, plain)
        }}
      >
        <Plus className="list-plus size-4 text-muted-foreground" />
        <TaskInput
          inputRef={add}
          onKeyDown={(event) => event.key === 'Escape' && (event.preventDefault(), event.currentTarget.blur())}
          value={draft}
          onChange={setDraft}
          kept={kept}
          placeholder="Add a task, with the date in the words"
        />
      </form>
      </>}
      {several.bar && (
        <div data-picked-bar className="-mt-1 mb-1 flex flex-wrap items-center gap-1 px-1 [&>span]:flex-wrap">
          <span className="mr-1 text-sm font-medium whitespace-nowrap text-foreground tabular-nums">{num(several.chosen.length)} selected</span>
          {several.bar}
        </div>
      )}
      <Example on={example && due.length > 0} compact tryIt="type a task in the line above with the day in the words, like ‘call Mum Friday 6pm’.">
      {(() => {
        // A long list draws only the rows in sight, without the slide away: 400 tasks with no date, each drawn and
        // watched for its place, took over a second to answer a click that opened one (qa/open-speed-big.mjs).
        // Out of the page's own going, as the Bin's long list is: a row scrolled out mid-exit never says it has gone.
        const long = due.length > DRAWN_WHOLE
        const row = (task: Task, index: number): React.JSX.Element => (
          <TaskRow key={task.id} task={task} act={act} scope={scope} room={room} rank={ranked ? three.indexOf(task.id) + 1 : undefined}
            open={task.id === open} cursor={index === cursor} picked={several.chosen.includes(task.id)} picking={several.chosen.length}
            ticking={ticking(task.id)} glossing={glossing === task.id} frog={frog} focus={now.focus} long={long} time={time} />
        )
        return long ? (
          <PresenceContext.Provider value={null}>
            <VirtualList items={due} keyOf={(task) => task.id} cursor={cursor} estimate={44} rowClass="pb-1">{row}</VirtualList>
          </PresenceContext.Provider>
        ) : (
          <AnimatePresence initial={false}>{due.map(row)}</AnimatePresence>
        )
      })()}
      </Example>
      {!due.length && !unloaded(tasks) && (glance ? (
        // One line under the pill: what the tab is for, and the one thing to do.
        <p data-glance-empty className="px-2 py-1.5 text-body text-foreground/85"><span className="font-semibold text-foreground">{EMPTY.today.title}.</span> Type a task on the line above and <Kbd>↵</Kbd> adds it for today.</p>
      ) : (
        <Rest compact seed="today" off={scope !== 'today'}><Empty compact title={EMPTY[scope].title}>{EMPTY[scope].text}</Empty></Rest>
      ))}
    </div>
  )
}

/** How many tasks the panel draws whole, each sliding away as it is done; past this it draws only those in sight. */
const DRAWN_WHOLE = 80

type RowActs = {
  onOpen: (id: string) => void
  tick: (task: Task) => void
  move: typeof moveTo
  frog: ReturnType<typeof frogOn>
  now: ReturnType<typeof useTaskNow>
  several: ReturnType<typeof useTaskPick>
  gloss: (id: string) => void
  endGloss: () => void
}

/**
 * One task's row. Drawn again only when what it shows changes: its task, its
 * marks (open, cursor, picked, ticking), how many are picked (its menu), the
 * frog or a focus session (its menu too).
 */
const TaskRow = memo(function TaskRow({ task, act, scope, room, rank, open, cursor, picked, picking, ticking, glossing, long, time }: {
  task: Task
  /** The time on the list's tasks and the session running on one: the same thing until a read or the minute changes it. */
  time: TaskTime
  /** In a long list drawn only where it shows: no gliding to a new place, which measured every row on each change. */
  long?: boolean
  /** Its number among today's three (0 for none), with a column kept for it when the list has any. */
  rank?: number
  act: React.RefObject<RowActs>
  scope: Scope
  room: boolean
  open: boolean
  cursor: boolean
  picked: boolean
  picking: number
  ticking: boolean
  glossing: boolean
  frog: unknown
  focus: unknown
}): React.JSX.Element {
  void picking
  const late = (placed(task) ?? Infinity) < startOfToday()
  const later = bucket(task)
  const { several, move, frog, now, gloss } = act.current
  return (
    <motion.div
      layout={long ? false : 'position'}
      initial={long ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      // Done by a key, it simply goes; by a click it slides off the way a tick sends it.
      variants={{ gone: () => (byKeys() ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: shift('translateX(16px)'), transition: { duration: 0.16, ease: EASE } }) }}
      exit="gone"
      className={`group group/item relative flex flex-wrap items-start gap-2 rounded-md px-2 py-1.5 pr-8 hover:bg-accent/50 ${picked ? PICKED_ROW : open ? "bg-accent" : cursor ? "bg-accent/50" : ""}`}
    >
      {/* A focus session running on it: the dot stands in the number's column while it runs, as in Tasks, and nothing in the row moves. */}
      {rank !== undefined && <span data-rank-column className="mt-px flex w-2.5 shrink-0 justify-center">{time.running?.taskId === task.id ? <SessionDot id={task.id} time={time} className="relative flex h-[1.125rem] items-center" /> : rank > 0 && <ThreeMark n={rank} />}</span>}
      <Tip label="Complete">
      <button
        type="button"
        data-task-tick
        onClick={() => act.current.tick(task)}
        // The tick shows only over the circle itself: the row opens the
        // task, and a tick there read as if a click would complete it.
        className="group/tick relative after:absolute after:-inset-1 after:rounded-full mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors"
        style={{
          // Red only for late, amber for today's, plain for later days: an
          // amber ring on a task weeks off read as if it were already pressing.
          borderColor: late ? 'var(--tt-color-text-red)' : scope === 'today' ? 'var(--tt-color-text-orange)' : 'var(--muted-foreground)',
          background: ticking ? 'var(--tt-color-text-green)' : undefined
        }}
      >
        <Check className={`size-2.5 transition-opacity ${ticking ? 'opacity-100' : 'opacity-0 group-hover/tick:opacity-60'}`} />
      </button>
      </Tip>
      {/* The mark in a column of its own, so the title and the line under it start in one place. */}
      {room && <span className="mt-[3px] flex shrink-0"><TaskPriority task={task} room /></span>}
      {/* The row opens the task where its notes and sessions are. */}
      <RowMenu items={() => several.menu(task) ?? [
        ...taskMenu(task, { open: () => act.current.onOpen(task.id), complete: () => act.current.tick(task), move, frog, now, thought: () => act.current.gloss(task.id) }),
        ...several.rowItems(task.id)
      ]}>
      <button type="button" data-row data-id={task.id} data-open={open || undefined} data-cursor={cursor || undefined} data-picked={picked || undefined} className={`min-w-0 flex-1 text-left ${open ? 'font-medium' : ''}`}
        // Read while the pointer rests on it: the click then opens it on its words in the same frame.
        onPointerEnter={() => readAhead('task', [task.id])} onClick={(event) => act.current.several.click(event, task.id) || act.current.onOpen(task.id)}>
        <p className="flex items-center gap-1.5">
          <TaskSite task={task} />
          <span data-task-title className={`truncate ${ticking ? 'mf-strike' : ''}`}>{taskName(task.title).text}</span>
          <Tags tags={taskName(task.title).tags} />
        </p>
        <p data-task-meta className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {/* A list with no number column has no room beside the tick (8px): there the dot leads the small line. */}
          {rank === undefined && <SessionDot id={task.id} time={time} className={DOT_IN_LINE} />}
          <TaskWhen task={task} />
          {later && !task.dueAt && <span>{BUCKETS[later]}</span>}
          <TaskAddress task={task} className="max-w-full" />
          <TaskSpent task={task} time={time} />
        </p>
      </button>
      </RowMenu>
      {/* A thought without opening it: on hover, top right, or ; on the row. */}
      <GlossButton onClick={() => gloss(task.id)} />
      {glossing && <GlossLine id={task.id} open onDone={act.current.endGloss} placeholder="A thought on it, kept with its logs" className="basis-full pl-6" />}
    </motion.div>
  )
})
