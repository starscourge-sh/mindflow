import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { chime } from '@/lib/sound'
import { EASE, byKeys, sheetMotion } from '@/lib/motion'
import { unloaded, useLive, vigil, type Settings, type Task } from '@/lib/vigil'
import { placed, taskName } from '@/lib/tasks'
import { hoursSaid } from '@/lib/day-plan'
import { moveToBin } from '@/lib/to-bin'
import { AliveIcon } from './alive-icon'
import ClockIcon from '@/components/ui/clock-icon'
import { Chips } from './display'
import { RowMenu, copy, type RowItem } from './row-menu'
import { Kbd, Rolling, Tags, Tip, toast, quietly } from './ui'
import { LengthChip, completeTask, startOn, taskMenu, useTaskNow } from './tasks-view'
import { PICKED_ROW } from './task-pick'
import { QUADS, byMatrix } from './matrix-view'
import { quadrantOf } from '../../../../main/task-words'
import { num, startOfDay } from '../../../../main/dates'

/**
 * “I have 15 minutes”: the open tasks short enough for the time there is, in
 * the Matrix's order (urgent and important first), each with its length. One
 * picked starts a focus session on it, as long as its estimate. Tasks with no
 * length yet come after, each a key away from having one. The length asked
 * for is remembered for next time.
 */

/** The lengths offered: a key each, 1 to 5, in the sheet. */
export const FIT_CHOICES = [5, 10, 15, 30, 60] as const
const DEFAULT_MINUTES = 15

/** Open the list, for a length or the last one asked for. */
export const openFits = (minutes?: number): void => void window.dispatchEvent(new CustomEvent('vigil:fits', { detail: minutes }))

/**
 * Words typed in ⌘K that ask for it: “i have 20”, “20 min”, “I’ve got 45
 * minutes”. A bare number is left to search, which it more likely means.
 */
export function fitsHeard(typed: string): number | null {
  const said = typed.trim().toLowerCase().replace(/[’']/g, "'")
  const match = /^(?:(i\s*(?:have|'ve got|'ve|got)|have)\s+(?:about\s+|only\s+)?)?(\d{1,3})\s*(m|min|mins|minute|minutes)?\.?(?:\s+(?:free|spare|to spare|left))?$/.exec(said)
  if (!match || (!match[1] && !match[3])) return null
  const minutes = Number(match[2])
  return minutes >= 1 && minutes <= 240 ? minutes : null
}

/** What can be done now: open, not waiting on anyone, and no routine before its day. */
const doable = (task: Task): boolean =>
  task.status === 'open' && !task.waitingOn && (!task.recurrence || (placed(task) ?? Infinity) < startOfDay(1))

const calm = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

/** On Today's header: the length last asked for, one click from what fits it. */
export function FitsButton(): React.JSX.Element {
  const settings = useLive(vigil.settings, null as Settings | null)
  const minutes = settings?.fitMinutes ?? DEFAULT_MINUTES
  return (
    <Tip label="What fits in the time you have, to start one">
      <button type="button" data-fits-button onClick={() => openFits()}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-control whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground">
        <AliveIcon icon={ClockIcon} size={14} />
        <span>I have <Rolling text={minutes} /> min</span>
      </button>
    </Tip>
  )
}

/** The sheet, over the main window, when asked for. */
export function FitsSheet(): React.JSX.Element {
  const [asked, setAsked] = useState<number | null>(null)
  useEffect(() => {
    const ask = (event: Event): void => {
      const given = (event as CustomEvent<number | undefined>).detail
      void vigil.settings().then((settings) => {
        const minutes = given ?? settings.fitMinutes ?? DEFAULT_MINUTES
        if (given && given !== settings.fitMinutes) void vigil.setSettings({ fitMinutes: given })
        chime('slide')
        setAsked(minutes)
      })
    }
    window.addEventListener('vigil:fits', ask)
    return () => window.removeEventListener('vigil:fits', ask)
  }, [])
  return <AnimatePresence>{asked !== null && <Fits key="fits" start={asked} onClose={() => setAsked(null)} />}</AnimatePresence>
}

function Fits({ start, onClose }: { start: number; onClose: () => void }): React.JSX.Element {
  const [sheet] = useState(() => sheetMotion(byKeys(), 0.18))
  const [minutes, setMinutes] = useState(start)
  const all = useLive(vigil.tasks, [] as Task[])
  const now = useTaskNow()
  const open = useMemo(() => all.filter(doable), [all])
  const fit = useMemo(() => byMatrix(open.filter((task) => task.estimate !== null && task.estimate <= minutes)), [open, minutes])
  const unsized = useMemo(() => byMatrix(open.filter((task) => task.estimate === null)), [open])
  const longer = open.filter((task) => task.estimate !== null && task.estimate > minutes)
  const shortest = longer.length ? Math.min(...longer.map((task) => task.estimate!)) : null
  const rows = useMemo(() => [...fit, ...unsized], [fit, unsized])
  const [at, setAt] = useState(0)
  const [picked, setPicked] = useState<string[]>([])
  const live = picked.filter((id) => rows.some((task) => task.id === id))
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => void setAt((was) => Math.min(was, Math.max(rows.length - 1, 0))), [rows.length])
  useEffect(() => void list.current?.querySelector('[data-fit-at]')?.scrollIntoView({ block: 'nearest' }), [at])

  const choices = FIT_CHOICES.includes(minutes as (typeof FIT_CHOICES)[number]) ? [...FIT_CHOICES] : [...FIT_CHOICES, minutes].sort((a, b) => a - b)
  const pickLength = (next: number): void => {
    if (next === minutes) return
    setMinutes(next)
    setAt(0)
    void vigil.setSettings({ fitMinutes: next })
  }
  const close = (): void => (chime('fold'), onClose())
  /** Start: a task with a length for its length; one with none for the time there is. */
  const begin = (task: Task): void => {
    onClose()
    startOn(task.estimate === null ? { ...task, estimate: minutes } : task)
  }
  const openTask = (task: Task): void => (onClose(), window.api.openInHome('task', task.id))
  /** A length for a task that had none, or a new one: heard, undoable, and it moves up if it fits now. */
  const giveLength = (task: Task, length: number): void => {
    if (task.estimate === length) return chime('nope')
    const was = task.estimate
    void vigil.saveTask(task.id, { estimate: length }).then(() => {
      chime('tap')
      quietly(() => void vigil.saveTask(task.id, { estimate: was }))
    })
  }
  const toggle = (id: string): void => setPicked((ids) => (chime(ids.includes(id) ? 'off' : 'on'), ids.includes(id) ? ids.filter((one) => one !== id) : [...ids, id]))
  const chosen = (): Task[] => (live.length ? rows.filter((task) => live.includes(task.id)) : rows[at] ? [rows[at]] : [])
  const toBin = (): void => void moveToBin(chosen().map((task) => ({ type: 'task', id: task.id, status: task.status }))).then((n) => n && setPicked([]))
  const copyThem = (): void => {
    const lines = chosen().map((task) => taskName(task.title).text)
    if (lines.length) copy(lines.join('\n'), lines.length === 1 ? 'Task copied' : `Copied ${num(lines.length)}, one to a line`)
  }
  const doneThem = (): void => {
    const tasks = chosen()
    setPicked([])
    if (tasks.length === 1) return void completeTask(tasks[0])
    chime('done')
    void Promise.all(tasks.map((task) => vigil.doneTask(task.id))).then((was) =>
      toast(`${num(tasks.length)} done`, () => void Promise.all(tasks.map((task, index) => vigil.undoneTask(task.id, was[index])))))
  }
  const menuOf = (task: Task): RowItem[] => live.length > 1 && live.includes(task.id)
    ? [
        { label: `Mark ${num(live.length)} done`, run: doneThem },
        { label: `Copy ${num(live.length)}`, keys: '⌘C', run: copyThem },
        { label: 'Clear the selection', keys: 'Esc', run: () => (chime('off'), setPicked([])) },
        'separator',
        { label: `Move ${num(live.length)} to the Bin`, keys: '⌫', danger: true, run: toBin }
      ]
    : [
        ...(task.estimate === null ? [{ label: `Start a focus session, ${hoursSaid(minutes)}`, run: () => begin(task) }] : []),
        // Its own length line below, in this sheet's lengths, takes the place of the menu's.
        ...taskMenu(task, { open: () => openTask(task), now }).filter((item) => !(item && typeof item === 'object' && 'label' in item && ((task.estimate === null && item.label.startsWith('Start a focus session')) || item.label.startsWith('How long it takes')))),
        'separator',
        { label: task.estimate === null ? 'Give it a length' : 'Change its length', items: FIT_CHOICES.map((length, index) => ({ label: `~${hoursSaid(length)}`, keys: String(index + 1), run: () => giveLength(task, length) })) }
      ]

  // The keys, while it is open: taken before the page under it hears them.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {})
  keys.current = (event) => {
    if (document.querySelector('[role="menu"]')) return
    const task = rows[at]
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey
    const index = choices.indexOf(minutes)
    if (event.key === 'Escape') live.length ? (chime('off'), setPicked([])) : close()
    else if (plain && (event.key === 'ArrowDown' || event.key === 'j')) setAt((n) => Math.min(n + 1, rows.length - 1))
    else if (plain && (event.key === 'ArrowUp' || event.key === 'k')) setAt((n) => Math.max(n - 1, 0))
    else if (plain && event.key === 'ArrowRight' && index < choices.length - 1) (chime('tap'), pickLength(choices[index + 1]))
    else if (plain && event.key === 'ArrowLeft' && index > 0) (chime('tap'), pickLength(choices[index - 1]))
    else if (plain && event.key === 'Enter' && task) begin(task)
    else if (plain && /^[1-5]$/.test(event.key) && task) giveLength(task, FIT_CHOICES[Number(event.key) - 1])
    else if (plain && event.key === 'x' && task) toggle(task.id)
    else if (event.metaKey && !event.shiftKey && event.code === 'KeyA') rows.length && rows.every((one) => live.includes(one.id)) ? chime('nope') : (chime('on'), setPicked(rows.map((one) => one.id)))
    else if ((event.key === 'Backspace' || event.key === 'Delete') && !event.ctrlKey && !event.altKey && (live.length || task)) toBin()
    else if (event.metaKey && !event.shiftKey && event.code === 'KeyC' && (window.getSelection()?.isCollapsed ?? true) && (live.length || task)) copyThem()
    else return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => keys.current(event)
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const still = calm() || byKeys()
  const row = (task: Task, index: number): React.JSX.Element => {
    const quad = QUADS.find((one) => one.id === quadrantOf(task))!
    const here = index === at
    const length = task.estimate
    return (
      <motion.li key={task.id} layout={!still} transition={{ duration: 0.25, ease: EASE }}>
        <RowMenu items={menuOf(task)}>
          <div role="button" tabIndex={-1} data-fit-row={task.id} data-fit-at={here || undefined} data-picked={live.includes(task.id) || undefined}
            onMouseMove={() => index !== at && setAt(index)}
            onClick={(event) => (event.shiftKey || event.metaKey ? toggle(task.id) : begin(task))}
            className={`group/fit flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 ${live.includes(task.id) ? PICKED_ROW : here ? 'bg-accent' : ''}`}>
            <Tip label={`${quad.title}: ${quad.said.split('.')[0].toLowerCase()}`}>
              <span role="img" aria-label={quad.title} data-quad={quad.id} className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: `var(--tt-color-text-${quad.tint})` }} />
            </Tip>
            <span className="line-clamp-2 min-w-0 flex-auto text-body text-foreground [overflow-wrap:anywhere]">{taskName(task.title).text || 'Untitled task'}</span>
            <Tags tags={taskName(task.title).tags} max={2} />
            {length !== null ? (
              <>
                {here && <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Kbd>↵</Kbd> start</span>}
                <LengthChip minutes={length} />
              </>
            ) : (
              <span className="flex shrink-0 items-center gap-0.5" data-give-length>
                {FIT_CHOICES.map((one, at_) => (
                  <Tip key={one} label={`Give it ~${hoursSaid(one)}`}>
                    <button type="button" aria-label={`Give it ~${hoursSaid(one)}`} onClick={(event) => (event.stopPropagation(), giveLength(task, one))}
                      className={`flex h-5 min-w-6 items-center justify-center gap-1 rounded-md px-1 text-xs tabular-nums hover:bg-background hover:text-foreground ${here ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {here && <kbd className="font-sans text-[0.625rem] opacity-55">{at_ + 1}</kbd>}{one}
                    </button>
                  </Tip>
                ))}
              </span>
            )}
          </div>
        </RowMenu>
      </motion.li>
    )
  }

  const nobody = !unloaded(all) && !open.length
  return (
    <motion.div role="dialog" aria-modal aria-label="What fits in the time you have" data-fits data-fits-minutes={minutes}
      {...sheet.scrim}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]" onMouseDown={close}>
      <motion.div
        {...sheet.panel}
        className="flex max-h-[78vh] w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow)"
        onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-5 pt-3.5 pb-3">
          <h2 className="font-heading text-heading font-semibold text-foreground">I have</h2>
          <Chips options={choices.map((one) => ({ id: String(one), label: String(one) }))} on={(id) => Number(id) === minutes} pick={(id) => pickLength(Number(id))} className="flex-nowrap" />
          <h2 className="font-heading text-heading font-semibold text-foreground">minutes</h2>
          <span className="flex-1" />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={list} className="mf-more min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-3">
          {unloaded(all) ? null : nobody ? (
            <p data-fits-empty className="px-2 py-4 text-body text-foreground">Nothing on your list. The {hoursSaid(minutes)} are yours.</p>
          ) : (
            <>
              {fit.length ? (
                <p data-fits-said className="px-2 pb-2 text-body text-foreground">
                  <strong className="font-semibold"><Rolling text={fit.length === 1 ? 'One task fits' : `${num(fit.length)} tasks fit`} by="word" /></strong>
                  <span className="text-foreground/75">, most urgent and important first. Pick one to start a focus session.</span>
                </p>
              ) : (
                <div data-fits-empty className="px-2 pb-2">
                  <p className="text-base font-semibold text-foreground">Nothing fits in {hoursSaid(minutes)}.</p>
                  <p className="mt-0.5 text-body text-foreground/80">
                    {unsized.length ? <>{unsized.length === 1 ? 'One task has' : `${num(unsized.length)} tasks have`} no length yet: give {unsized.length === 1 ? 'it' : 'them'} one below.</> : null}
                    {unsized.length && shortest ? ' ' : null}
                    {shortest ? <>The shortest takes {hoursSaid(shortest)}.{' '}
                      {choices.find((one) => one >= shortest) && (
                        <button type="button" data-fits-longer onClick={() => (chime('tap'), pickLength(choices.find((one) => one >= shortest)!))} className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground/70">
                          Try {choices.find((one) => one >= shortest)} minutes
                        </button>
                      )}</> : null}
                  </p>
                </div>
              )}
              <ul data-fits-list className="flex flex-col">
                {fit.map((task, index) => row(task, index))}
              </ul>
              {unsized.length > 0 && (
                <>
                  <div className="mt-3 flex items-baseline gap-2 px-2 pb-1">
                    <h3 className="text-control font-semibold text-foreground">No length yet</h3>
                    <span className="text-control text-foreground/70">Press 1 to 5, or click a length, and it moves up if it fits.</span>
                  </div>
                  <ul data-fits-unsized className="flex flex-col">
                    {unsized.map((task, index) => row(task, fit.length + index))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t px-5 py-2 text-xs text-muted-foreground">
          {live.length ? (
            <>
              <span className="font-medium text-foreground">{num(live.length)} selected</span>
              <span className="flex items-center gap-1.5"><Kbd>⌫</Kbd> to the Bin</span>
              <span className="flex items-center gap-1.5"><Kbd>⌘C</Kbd> copy</span>
              <span className="flex items-center gap-1.5"><Kbd>esc</Kbd> clear</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5"><span className="flex gap-0.5"><Kbd>↑</Kbd><Kbd>↓</Kbd></span> move</span>
              <span className="flex items-center gap-1.5"><span className="flex gap-0.5"><Kbd>←</Kbd><Kbd>→</Kbd></span> more or less time</span>
              <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> start</span>
              <span className="flex items-center gap-1.5"><Kbd>1</Kbd>-<Kbd>5</Kbd> a length</span>
              <span className="flex items-center gap-1.5"><Kbd>esc</Kbd> close</span>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
