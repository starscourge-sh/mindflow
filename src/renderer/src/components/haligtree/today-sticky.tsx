import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { TaskSite } from './task-site'
import { AnimatePresence, motion } from 'motion/react'
import { AliveIcon } from '@/components/ui/alive-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import { Minus } from 'lucide-react'

import '@/assets/styles/_variables.scss'
import './sticky-note.scss'
import { chime } from '@/lib/sound'
import { useStickyDo } from '@/lib/sticky-do'
import { byKeys, EASE, shift } from '@/lib/motion'
import { useAppearance, useLive, haligtree, type Finished, type Task } from '@/lib/haligtree'
import { dayKey, num } from '../../../../main/dates'
import { clock } from '@/lib/clock'
import { Rolling, Tags, Tip } from './ui'
import { Struck, Tick } from './marks'
import { StickyCelebration, type Moment } from './celebrate'
import { SandboxStamp } from '@/components/haligtree/sandbox'
import { Frost } from './frost'
import { Tape } from './tape'
import { Grabber } from './grabber'
import { CARD, DRAG, GLASS, GRACE, Grip, PAPER, STICKY_BUTTON, STILL, StickyHead, tiltOf, useStickyMotion } from './sticky-note'
import { doneOnToday, onToday, taskName, todaySaid } from '@/lib/tasks'
import { PriorityMark, byPriority, markRoom } from './task-input'
import { stickyMenu } from './row-menu'
import { taskMenu, useTaskNow } from './tasks-view'
import { SessionDot, SpentTip, useTaskTime } from './task-time'
import { loud } from '@/lib/loud'
import { Check, X } from '@/components/ui/icons'
import { APP_NAME } from '../../../../main/name'
import { liftCard } from '@/lib/card-pointer'
import { usePillWords } from './desk-pill'

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
  const tasks = useLive(haligtree.tasks, undefined as Task[] | undefined)
  // A session running and the frog, for each task's right-click menu.
  const taskNow = useTaskNow()
  // The time on these tasks and the session running on one (task-time.tsx).
  const time = useTaskTime()
  // Looked at again each minute, so midnight turns the day over.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const [ticked, setTicked] = useState<Record<string, Ticked>>({})
  const [asking, setAsking] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const tilt = GLASS ? 0 : tiltOf('today', Number(new URLSearchParams(location.search).get('nth')) || 0)
  useStickyMotion(card, tilt)
  // Taking it down: the first press asks, the second peels it off and the window in sight offers "Put it back".
  const takeDown = (): void => {
    if (!asking) return (chime('tap'), setAsking(true))
    chime('unstick')
    window.api.takeDownSticky('Today')
  }
  const keyDown = useRef(takeDown)
  keyDown.current = takeDown
  // Its right-click menu's own lines: open Today as its ↗ does, and take it down at once (choosing the line was the asking).
  useStickyDo({
    open: () => (chime('open'), window.api.openSticky('view', 'today', 'Today', false)),
    down: () => (chime('unstick'), window.api.takeDownSticky('Today'))
  })
  // A see-through window: only the card is drawn.
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.dataset.sticky = GLASS ? 'glass' : 'paper'
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') return setAsking(false)
      // ⌘W does just what its X does: the window has no close of its own.
      if (!event.metaKey || event.key.toLowerCase() !== 'w') return
      event.preventDefault()
      keyDown.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])

  // What is on Today, by the rule the sidebar and Today's brief count by, and
  // those of them done today; a tick here keeps its row even once a routine
  // has moved on to its next day.
  const today = dayKey(now)
  const all = tasks ?? []
  // Only what is for today: late ones are not mixed in, but counted on one quiet line under the list that opens them.
  const isLate = (task: Task): boolean => (dueDay(task) ?? today) < today
  const lateOnes = all.filter(onToday).filter(isLate)
  const open = all.filter(onToday).filter((task) => !isLate(task))
  const doneToday = all.filter((task) => doneOnToday(task))
  const byId = new Map([...doneToday, ...open].map((task) => [task.id, task]))
  // A tick made today, that is: one from yesterday fades with the rest.
  for (const [id, one] of Object.entries(ticked)) if (!byId.has(id) && dayKey(one.was?.doneAt ?? now) === today) byId.set(id, one.task)
  const todos = [...byId.values()].sort((a, b) => byPriority(a, b) || (a.dueAt ?? a.deadline ?? '').localeCompare(b.dueAt ?? b.deadline ?? '') || a.number - b.number)
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
      void haligtree.undoneTask(task.id, was)
      return
    }
    // One task ticked gets the tick's sound and its own stroke, nothing more:
    // the card is kept for the list all done (All done, below).
    chime('done')
    const pen = !byKeys()
    setTicked((one) => ({ ...one, [task.id]: { task, pen } }))
    void haligtree.doneTask(task.id).then((was) => setTicked((one) => ({ ...one, [task.id]: { task, was, pen } })))
  }

  // From some left to none left, held a moment so an untick straight after takes it back unseen.
  const allDone = todos.length > 0 && finished === todos.length
  // Its pill in the desk's stack: its tick ring and what is left, as the card's own count says.
  usePillWords(tasks === undefined ? null : { words: 'Today', number: !todos.length ? 'Nothing due' : allDone ? 'All done' : `${num(todos.length - finished)} left`, ring: { gone: todos.length ? finished / todos.length : 0, ink: 'var(--tt-color-text-green)' } })
  const wasDone = useRef<boolean | undefined>(undefined)
  const [cheer, setCheer] = useState<Moment | null>(null)
  const loaded = tasks !== undefined
  useEffect(() => {
    if (!loaded) return
    const before = wasDone.current
    wasDone.current = allDone
    if (before !== false || !allDone) return
    const timer = setTimeout(() => void haligtree.stickyDone('today').then((moment) => moment && setCheer(moment)), GRACE)
    return () => clearTimeout(timer)
  }, [allDone, loaded])

  return (
    <div data-clear className={GLASS ? 'h-screen' : 'h-screen p-[20px]'}>
      <div ref={card} onPointerEnter={(event) => GLASS && liftCard(event)} onPointerMove={GLASS ? liftCard : undefined} onMouseLeave={() => setAsking(false)} className={CARD}
        style={{ ...DRAG, '--tilt': `${tilt}deg`, ...PAPER } as unknown as CSSProperties}>
        {!GLASS && <Frost tint="--mf-paper-tint" lift />}
        <SandboxStamp />
        <Tape inside={GLASS} />
        <Grabber label="Move this sticky" inside={GLASS} />
        <StickyHead title="Today" open={asking}
          count={todos.length > 0 && (
            <span role="img" className="text-xs whitespace-nowrap tabular-nums" style={{ color: allDone ? 'var(--tt-color-text-green)' : 'var(--muted-foreground)' }} aria-label={todaySaid(todos.length - finished, finished)}>
              <Rolling text={todaySaid(todos.length - finished, finished)} by="word" />
            </span>
          )}
          controls={<>
            <Tip label={`Open Today in ${APP_NAME} (⌥-click: and take it down)`}>
            <button type="button" aria-label="Open Today"
              onClick={(event) => (chime('open'), window.api.openSticky('view', 'today', 'Today', event.altKey))} className={STICKY_BUTTON}>
              <AliveIcon icon={ExternalLinkIcon} size={14} />
            </button></Tip>
            <Tip label="Fold it into its pill at the screen's edge  ⌃⌥⌘H folds them all">
            <button type="button" aria-label="Fold it into its pill"
              onClick={() => (chime('tuck'), window.api.pinSticky(false))} className={STICKY_BUTTON}>
              <Minus className="size-3.5" strokeWidth={2.25} />
            </button></Tip>
            <Tip label="Take it off the desktop  ⌘W">
            <button type="button" aria-label="Take it off the desktop" onClick={takeDown}
              className={`${STICKY_BUTTON} gap-1 ${asking ? 'w-auto px-1.5 text-xs text-foreground' : ''}`}>
              {asking && <Rolling by="word" text="Take down?" />}
              <X className="size-3.5" />
            </button></Tip>
          </>} />
        <div style={STILL} onScroll={(event) => event.currentTarget.toggleAttribute('data-scrolled', event.currentTarget.scrollTop > 0)}
          className="sticky-text min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-6 [mask-image:linear-gradient(to_bottom,#000_calc(100%-1.75rem),transparent)]">
          {loaded && !todos.length && <p className="my-1 text-muted-foreground">Nothing due today. A task you give today's date shows up here.</p>}
          <ul>
            <AnimatePresence initial={false}>
              {todos.map((task) => {
                const done = struck(task)
                const late = (dueDay(task) ?? '') < today
                const pen = !!ticked[task.id]?.pen
                return (
                  <motion.li key={task.id} layout="position" className="relative flex items-start gap-2 py-1"
                    initial={{ opacity: 0, transform: shift('translateY(-4px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}>
                    {/* A focus session running on it: the dot in the middle of the paper's side room, level with the tick. */}
                    <SessionDot id={task.id} time={time} className="absolute top-1 right-full mr-[0.2rem] flex h-[calc(0.4em+0.875rem)] w-1.5 items-center" />
                    <button type="button" data-task-tick role="checkbox" aria-checked={done} aria-label={task.title} onClick={() => tick(task)}
                      className="relative after:absolute after:-inset-[5px] after:rounded-full mt-[0.2em] grid size-3.5 shrink-0 place-items-center rounded-full border-[1.5px] transition-[background-color,border-color,scale] duration-150 ease-out outline-none active:scale-90 focus-visible:ring-2 focus-visible:ring-ring/40"
                      style={{
                        borderColor: done ? 'var(--tt-color-text-green)' : late ? 'var(--tt-color-text-red)' : 'color-mix(in oklab, var(--muted-foreground) 70%, transparent)',
                        background: done ? 'var(--tt-color-text-green)' : undefined
                      }}>
                      <Check className={`mf-unmarked size-2 text-white transition-[opacity,scale] duration-150 ease-out ${done ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} strokeWidth={3} />
                      {done && <Tick seed={task.id} draw={pen} className="size-2.5 text-white" />}
                    </button>
                    {/* Done, on one line: a pen line is drawn across one line of words. */}
                    {/* Its words open it in Haligtree, its day, notes and steps all there. */}
                    {/* Its priority's room kept, ticked too, so every title starts in line, when any task here has one. */}
                    {markRoom(todos) && <span className="pt-0.5"><PriorityMark level={done ? 0 : task.priority} room /></span>}
                    {done ? (
                      <span data-task-title className="mf-hand-struck min-w-0 flex-1 truncate leading-snug text-muted-foreground line-through decoration-foreground/40 transition-colors">
                        <Struck seed={task.id} draw={pen}>{taskName(task.title).text}</Struck>
                      </span>
                    ) : (
                      <span className="flex min-w-0 flex-1 items-start gap-2">
                      {/* Right-clicked, the menu a task has on every list, drawn by the Mac: ours would not fit the sticky. The sticky's own menu stays on the rest of it. */}
                      {/* The time spent on it: said in its name's tip, the row having no small line. */}
                      {task.link && <span className="flex pt-[0.2rem]"><TaskSite task={task} /></span>}
                      <SpentTip task={task} time={time}>
                      <button type="button" data-task-title data-sticky-task={task.id} onClick={() => (chime('open'), window.api.openSticky('task', task.id, task.title, false))}
                        onContextMenu={(event) => (event.preventDefault(), void stickyMenu(taskMenu(task, { open: () => (chime('open'), window.api.openSticky('task', task.id, task.title, false)), complete: () => tick(task), now: taskNow }), { x: event.clientX, y: event.clientY }))}
                        className="relative min-w-0 text-left leading-snug text-foreground decoration-foreground/30 underline-offset-2 after:absolute after:-inset-y-1 after:inset-x-0 hover:underline">
                        {taskName(task.title).text}
                      </button>
                      </SpentTip>
                      {/* The tag right after the words, as every list has it. */}
                      <span className="flex min-w-0 max-w-[40%] shrink-0 pt-0.5"><Tags tags={taskName(task.title).tags} alone /></span>
                      </span>
                    )}
                    {!done && (late || (task.dueAt && !task.allDay)) && (
                      <span {...loud(late ? 'late' : undefined, `shrink-0 pt-px tabular-nums ${late ? '' : 'text-xs text-muted-foreground'}`)}>
                        {late ? 'Late' : clock(task.dueAt!)}
                      </span>
                    )}
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
          {loaded && lateOnes.length > 0 && (
            <Tip label={`Open Today in ${APP_NAME}, where the late ones are`}>
              <button type="button" data-sticky-late onClick={(event) => (chime('open'), window.api.openSticky('view', 'today', 'Today', event.altKey))}
                className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 text-control font-semibold text-[color-mix(in_oklab,var(--tt-color-text-red)_78%,var(--foreground))] underline-offset-2 hover:underline">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-(--tt-color-text-red)" />
                {num(lateOnes.length)} late
              </button>
            </Tip>
          )}
        </div>
        {/* Its size, from the corner: shown on hover. */}
        <Grip />
        {cheer && <StickyCelebration moment={cheer} onDone={() => setCheer(null)} />}
      </div>
    </div>
  )
}
