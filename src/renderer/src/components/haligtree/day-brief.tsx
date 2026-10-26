import { useEffect, useState, type ReactNode } from 'react'
import { useReading } from '@/lib/reads-in'
import { byKeys } from '@/lib/motion'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { chime } from '@/lib/sound'
import { issues, type Repeat } from '@/lib/issues'
import { unloaded, useLive, haligtree, whenInLine, type Finished, type Item, type Settings, type Task } from '@/lib/haligtree'
import { Rolling, Tags, Tip, Typed, quietly, toast } from './ui'
import { Rule, Struck, Tick } from './marks'
import { stickOnDesktop } from './sticky-note'
import { PictureCredit, Scenery, sceneCredit, useDayScene } from './scenery'
import { GrainFill, useCover, useCoversRead } from './grain'
import { openPass } from './pass'
import { KindBack, backLine, returning, type Returning } from './kind-back'
import { NextMark } from './milestones'
import { doneOnToday, onToday, taskName, todaySaid } from '@/lib/tasks'
import { PriorityMark, byPriority, markRoom } from './task-input'
import { RowMenu } from './row-menu'
import { taskMenu, useTaskNow, type TaskNow } from './tasks-view'
import { DayList, readCleared, writtenLayout } from './day-list'
import { TomorrowBox } from './tomorrow-lines'
import { frogFirst, frogOn } from '@/lib/day-plan'
import { useMacEvents } from '@/lib/mac-calendar'
import { DayTimeline } from './day-timeline'
import { useSessionsSpan } from './session-span'
import { CalendarNote } from './week-fit'
import { countdown, nextOf, useMilestones } from '@/lib/milestones'
import { ago, dayjs, dayKey, num } from '../../../../main/dates'
import { clock, useMinute } from '@/lib/clock'
import { ArrowRight, Brain, Check } from '@/components/ui/icons'

/**
 * The top of today's page, read like a morning paper: the day's picture with
 * its name across it and the date and time standing in the margins, one short
 * line on what the day holds, then today's tasks, tickable where they are,
 * and whatever else has come back. All from what is already here; nothing is
 * asked of anyone. It scrolls away with the page, so writing below is never covered.
 */

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const say = (n: number): string => WORDS[n] ?? 'several'
const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)
/** "a, b and c"; "a, at noon, and b" when a part has its own comma. */
const list = (parts: string[]): string => parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')}${parts.some((part) => part.includes(',')) ? ',' : ''} and ${parts[parts.length - 1]}`

/** When a task is for: the day it is due, else its deadline's. */
const dueDay = (task: Task): string | null => (task.dueAt ? dayKey(task.dueAt) : task.deadline ? dayKey(task.deadline) : null)

/** A row under the tasks: a decision or experiment back, the deciding pass, an idea that keeps coming back, a clue, the review. */
type Row = { key: string; mark: ReactNode; title: string; text: string; run: () => void; extra?: ReactNode }

/** A task ticked here: kept in its place, struck through, with what to put back if it is unticked. */
type Ticked = { task: Task; was?: Finished; /** Ticked with the pointer: its pen line is written, not just there. */ pen?: boolean }

export function DayBrief({ day, onOpen, onListed, between }: {
  day: string
  /** The day's writing, between the day's name and its tasks: what you write comes before what you do. */
  between?: ReactNode
  onOpen?: (type: string, id: string) => void
  /** The tasks the brief lists, so the page below does not list them again. */
  onListed?: (ids: string[]) => void
}): React.JSX.Element {
  const now = useMinute()
  const taskNow = useTaskNow()
  // Today's weather, from the same source each capture's comes from; asked
  // again every half hour, and simply left out when off or offline.
  // Not asked yet (undefined) is not none (null): the line it ends is centred, so it waits for it.
  const [sky, setSky] = useState<string | null | undefined>(undefined)
  // Waited for only a moment: asked of the internet, it can be slow, and the page is not held for it.
  const [skyWaited, setSkyWaited] = useState(false)
  useEffect(() => {
    const enough = setTimeout(() => setSkyWaited(true), 250)
    return () => clearTimeout(enough)
  }, [])
  const half = Math.floor(now.getTime() / 1_800_000)
  useEffect(() => {
    let current = true
    void haligtree.weatherNow().then((said) => current && setSky(said), () => current && setSky(null))
    return () => void (current = false)
  }, [half])
  const scene = useDayScene(day)
  // Scenery off, or no pictures: the day's grain cover, the same all day.
  const grain = useCover(scene ? null : `day:${day}`)
  const coversRead = useCoversRead()
  const settings = useLive(haligtree.settings, null as Settings | null)
  const tasks = useLive(haligtree.tasks, [] as Task[])
  const waiting = useLive(haligtree.passWaiting, { tidy: 0, decide: 0 })
  const due = useLive(haligtree.dueCount, null as number | null)
  const reviews = due ?? 0
  const questions = useLive(() => haligtree.items('question'), [] as Item[], [], ['item'])
  // Decisions on their look-again day, experiments past their run-until.
  const back = useLive(returning, [] as Returning[], [], ['capture', 'item'])
  const backs = back.filter((one) => !one.private).slice(0, 2)
  // The same idea caught three times or more, among the last fortnight's captures.
  const repeats = useLive<Record<string, Repeat>>(async () => {
    const ids = (await haligtree.recent(14)).filter((one) => one.type === 'capture' && !one.private).map((one) => one.id).slice(0, 80)
    return ids.length ? issues.repeats(ids) : {}
  }, {} as Record<string, Repeat>, [], ['capture', 'item'])
  const [ticked, setTicked] = useState<Record<string, Ticked>>({})
  // Today written out as a page: the brief shows that page in place of its own list.
  const written = writtenLayout()
  // The next marked day, said in the line when it is close.
  const marks = useMilestones(dayKey(now), dayjs(now).add(14, 'day').format('YYYY-MM-DD'))
  const coming = nextOf(marks, dayKey(now))

  const today = dayKey(now)
  // Your Mac's calendar for the day, read only, when Settings has it on.
  const dayFrom = dayjs(day).startOf('day')
  const mac = useMacEvents(dayFrom.toDate(), dayFrom.add(1, 'day').toDate())
  // The day's focus sessions, running or done: blocks in the line by the hour, which they bring even with no calendar.
  const sessions = useSessionsSpan(dayFrom.valueOf(), dayFrom.add(1, 'day').valueOf())
  const lined = mac.events.length > 0 || sessions.length > 0
  // The day's page is drawn once all of these are in (lib/reads-in.tsx): drawn before, the marked day's line, a question's
  // clue and the review line came in one by one and pushed the tasks down. The weather too, as it ends the centred date
  // line and moved it; asked of the internet, it is waited for a quarter of a second at most.
  // The picture too: the words sit centred over it, or plain with none, so whether there is one is known first.
  useReading(scene === undefined || (!scene && !coversRead) || (sky === undefined && !skyWaited) || !settings || unloaded(tasks) || unloaded(waiting) || due === null || unloaded(questions) || unloaded(back) || unloaded(repeats) || unloaded(marks) || unloaded(mac) || unloaded(sessions))
  // On Today by the one rule the sidebar and the Today sticky count by: late ones in, "Waiting on" out.
  const open = tasks.filter(onToday)
  const late = open.filter((task) => (dueDay(task) ?? '') < today)
  const dueToday = open.filter((task) => dueDay(task) === today)
  const timed = dueToday.filter((task) => task.dueAt && !task.allDay && Date.parse(task.dueAt) > now.getTime())
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))
  const deciding = settings?.weeklyReview !== false && now.getDay() === settings?.weeklyDay && waiting.decide > 0
  const repeat = Object.entries(repeats).filter(([, one]) => !one.article).sort((a, b) => b[1].n - a[1].n)[0]
  const week = dayjs(now).subtract(7, 'day').toISOString()
  const clue = questions.filter((one) => !one.closedAt && !one.archivedAt && !one.private && one.clues > 0 && (one.updatedAt ?? '') >= week)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]

  // Today's tasks: what is due or late, and those of them done today, so the
  // count reads "2 / 4" and a tick stays where it was made. A routine ticked
  // here moves on to its next day, so it is kept from the tick itself.
  // Ticked lines cleared from Today's page are out of this count as well.
  const cleared = writtenLayout() ? readCleared(today) : []
  const doneToday = tasks.filter((task) => doneOnToday(task, cleared))
  const byId = new Map([...doneToday, ...open].map((task) => [task.id, task]))
  for (const [id, one] of Object.entries(ticked)) if (!byId.has(id)) byId.set(id, one.task)
  // The frog, picked last night to do first, leads; the rest by importance and time.
  const frog = frogOn(settings, today)
  const todos = frogFirst([...byId.values()].sort((a, b) => byPriority(a, b) || (a.dueAt ?? a.deadline ?? '').localeCompare(b.dueAt ?? b.deadline ?? '') || a.number - b.number), frog)
  const struck = (task: Task): boolean => !!ticked[task.id] || task.status === 'done'
  // With events on the calendar today, the tasks with a time go in one line with them, by the hour.
  const inLine = lined ? todos.filter((task) => task.dueAt && !task.allDay && dayKey(task.dueAt) === today) : []
  const shown = todos.filter((task) => !inLine.includes(task)).slice(0, 5)
  const finished = todos.filter(struck).length
  const listed = [...inLine, ...shown].map((task) => task.id).join(' ')
  useEffect(() => onListed?.(listed ? listed.split(' ') : []), [listed, onListed])

  const forget = (id: string): void => setTicked(({ [id]: _, ...rest }) => rest)
  const tick = (task: Task): void => {
    // Ticked here, what the tick gave back; done elsewhere, the same read off
    // the task: its date and deadline as they were (a one-off keeps them),
    // done at its completed time, and counted as told about, so opening it
    // again does not set off an alert for something you are looking at.
    const was = ticked[task.id]?.was ?? (task.status === 'done' && task.completedAt
      ? { dueAt: task.dueAt, doneAt: task.completedAt, notifiedAt: new Date().toISOString(), deadlineAt: task.deadline }
      : undefined)
    if (was) {
      chime('off')
      forget(task.id)
      void haligtree.undoneTask(task.id, was)
      return
    }
    chime('done')
    const pen = !byKeys()
    setTicked((all) => ({ ...all, [task.id]: { task, pen } }))
    void haligtree.doneTask(task.id).then((was) => {
      setTicked((all) => ({ ...all, [task.id]: { task, was, pen } }))
      const back = (): void => {
        chime('undo')
        forget(task.id)
        void haligtree.undoneTask(task.id, was)
      }
      // The tick is in front of you; only the last one of the day is worth words.
      if (finished + 1 === todos.length) toast('Done. That is everything for today', back)
      else quietly(back)
    })
  }

  // Below the tasks, what else has come back today, each a row of the same list.
  const prompt: Row | null = deciding ? {
    key: 'decide',
    mark: <ArrowRight className="size-4" />,
    title: 'Decide what you set aside',
    text: 'Today is the day you set to decide on the things you put aside. Each one is waiting, with its choices.',
    run: () => openPass('decide')
  } : repeat ? {
    key: 'repeat',
    mark: <ArrowRight className="size-4" />,
    title: repeat[1].ids.find((one) => one.id === repeat[0])?.title ?? 'An idea you keep catching',
    text: `You noted this ${num(repeat[1].n)} times. Click to gather them into one page that links each one.`,
    // Made, then said with a way to open it and Undo: one click never leaves something you did not mean.
    run: () => void issues.repeatArticle(repeat[1].ids.map((one) => one.id)).then((article) => {
      chime('promote')
      toast(`Gathered ${num(repeat[1].n)} notes of the same idea into one page`,
        () => void haligtree.toBin(article).then(() => haligtree.forgetBinned('article', article)),
        'success', { label: 'Open', key: 'o', run: () => onOpen?.('article', article) })
    })
  } : clue ? {
    key: 'clue',
    mark: <ArrowRight className="size-4" />,
    title: clue.title,
    text: `A new clue came in ${ago(clue.updatedAt!)}. With ${say(clue.clues)} ${clue.clues === 1 ? 'clue' : 'clues'} now, it may be ready for an answer.`,
    run: () => onOpen?.('question', clue.id)
  } : null
  const rows: Row[] = [
    ...backs.map((one): Row => {
      const kind = CAPTURE_TYPES.find((type) => type.id === one.kind)
      const Mark = kind?.icon ?? ArrowRight
      return { key: one.id, mark: <Mark className="size-4" style={{ color: kind?.tint }} />, title: one.title, text: backLine(one), run: () => onOpen?.(one.type, one.id), extra: <KindBack one={one} onOpen={onOpen} flush /> }
    }),
    ...(prompt ? [prompt] : []),
    ...(reviews > 0 ? [{
      key: 'review',
      mark: <Brain className="size-4" />,
      title: 'Go through today’s review',
      text: `${cap(say(reviews))} ${reviews === 1 ? 'thing comes' : 'things come'} back to you today. A few minutes helps you remember them.`,
      run: () => window.api.openInHome('view', 'review')
    }] : [])
  ]
  // One sentence, calm and short: what lands when, then what else is waiting.
  const parts: string[] = []
  const morning = now.getHours() < 12
  if (dueToday.length && timed.length && morning && dayjs(timed[0].dueAt!).hour() >= 12)
    parts.push(`your morning is open until ${clock(timed[0].dueAt!)}`)
  else if (dueToday.length && timed.length) parts.push(`${say(dueToday.length)} ${dueToday.length === 1 ? 'thing is' : 'things are'} due, the next at ${clock(timed[0].dueAt!)}`)
  else if (dueToday.length) parts.push(`${say(dueToday.length)} ${dueToday.length === 1 ? 'thing is' : 'things are'} due today`)
  if (late.length) parts.push(`${late.length === 1 ? 'one from before is' : 'a few from before are'} still open`)
  if (backs.length) parts.push(backs.length === 1 ? 'a Check back asks you something' : 'a few Check backs ask you something')
  if (deciding) parts.push('it is deciding day')
  if (prompt?.key === 'clue') parts.push('a question has a new clue')
  if (waiting.tidy) parts.push('new notes are waiting to be sorted')
  if (reviews) parts.push('a few things come back for review')
  // A marked day a week away or nearer leads: it is what the day is counting toward.
  if (coming && dayjs(coming.day).diff(dayjs(dayKey(now)), 'day') <= 7) parts.unshift(countdown(coming, dayKey(now)))
  // Two clauses at most, so the line under the picture never runs to three.
  const said = parts.length
    ? `${cap(list(parts.slice(0, 2)))}.`
    : morning ? 'Nothing is due and nothing is waiting, so ease into it.' : 'Nothing is due and nothing is waiting. The rest is yours.'
  const weekday = dayjs(now).format('dddd')
  const greeting = `Happy ${weekday}. ${said}`

  const named = sceneCredit(scene)
  const picture = !!scene || !!grain
  const time = clock(now)

  return (
    <div className="pt-5 @min-[66rem]/page:pt-8">
      <div className="relative">
        {/* One height with a picture or without: the day's picture can come a beat after
            the page, and the page under it never moves when it does. */}
        <div className="relative isolate h-[clamp(6rem,20vh,12rem)] overflow-hidden rounded-2xl">
          {picture && (
            <>
              {scene
                ? <Scenery place="today" seed={`day:${day}`} mood={['day', 'dusk', 'night', 'interior']} cloudy={!!sky && /cloud|overcast|rain|drizzle|shower|fog|mist|storm|snow/i.test(sky)} className="absolute inset-0 -z-10" rounded="rounded-2xl" soft />
                : grain && <GrainFill cover={grain} large shade="none" className="-z-10" />}
              {/* A soft dark pool behind the words, never a band: the
                  painting still reads at the edges, the title on any of it.
                  Only once the painting is up: alone on the bare page it read
                  as a broken gradient for the moment the picture took. */}
              <div aria-hidden className="absolute inset-0 -z-10 transition-opacity duration-500 [[data-scene]:not([data-shown])~&]:opacity-0 bg-[radial-gradient(ellipse_75%_70%_at_50%_55%,rgb(0_0_0/0.44),rgb(0_0_0/0.16)_70%,rgb(0_0_0/0.06))]" />
            </>
          )}
          <h2 className={`flex size-full flex-col justify-center px-6 leading-[0.92] ${picture ? 'items-center text-center' : 'items-start'}`}
            style={{
              fontFamily: 'var(--font-heading)',
              color: picture ? 'white' : 'var(--foreground)',
              textShadow: picture ? '0 1px 2px rgb(0 0 0 / 0.25), 0 4px 28px rgb(0 0 0 / 0.35)' : undefined
            }}>
            {/* The title is simply there: the greeting below is the line that speaks (lib/motion.ts). */}
            <span className="font-semibold tracking-[-0.02em] text-[clamp(1.75rem,4.2vw,3rem)] text-balance">The {weekday} Brief</span>
            {/* The date, the time (each new minute) and the weather: one calm line under the title. */}
            <span data-today-line className="mt-3 font-sans text-[clamp(0.9375rem,1.5vw,1.125rem)] leading-normal font-medium tracking-normal tabular-nums" style={{ opacity: picture ? 0.92 : 0.8 }}>
              {[dayjs(now).format('D MMMM'), time, sky].filter(Boolean).join(' · ')}
            </span>
          </h2>
        </div>
      </div>
      <div className="pt-2.5">
        <div className="flex items-start gap-6">
          <p className="line-clamp-2 min-w-0 flex-1 text-[0.9375rem] leading-snug text-pretty text-muted-foreground">
            {/* Not before the day is read: "Nothing is due" typed over a full day was wrong for a moment. */}
            {!unloaded(tasks) && <Typed text={greeting} delay={350} step={22} />}
          </p>
          {named && <PictureCredit className="max-w-[35%] pt-0.5 text-right">{named}</PictureCredit>}
        </div>
      </div>
      {/* The next marked day, counted down: a click changes it. */}
      <NextMark className="mt-3 -mx-1 px-1 py-1 hover:bg-foreground/[0.035]" />
      {/* The day's events from your Mac's calendar, read only, in one line with the tasks that have a time. */}
      {lined && (
        <DayTimeline events={mac.events} tasks={inLine} sessions={sessions} now={now} done={struck} pen={(task) => !!ticked[task.id]?.pen} onTick={tick} />
      )}
      <CalendarNote said={mac} className="mt-5" />
      {between}
      {(shown.length > 0 || rows.length > 0 || written) && (
        <section className="@container mf-hand-ruled relative mt-8 border-t border-border/70 pt-6">
          <Rule seed={day} />
          <div className="grid gap-x-10 gap-y-4 @[44rem]:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <div className="flex items-center justify-between gap-4 @[44rem]:flex-col @[44rem]:items-start @[44rem]:justify-start">
              <div>
                <p className="text-lg leading-tight font-semibold text-foreground">{todos.length || written ? 'Today’s tasks' : 'Coming back to you'}</p>
                {todos.length > 0 && settings?.dayHints === true && (
                  <p data-day-count className="mt-1 text-sm tabular-nums" style={{ color: finished === todos.length ? 'var(--tt-color-text-green)' : 'var(--muted-foreground)' }}>
                    <Rolling text={todaySaid(todos.length - finished, finished)} by="word" />
                  </p>
                )}
                {/* The same list as a sticky, ticked off on the desktop through the day. */}
                {todos.length > 0 && (
                  <button type="button" onClick={() => stickOnDesktop('today', 'today')}
                    className="mt-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                    Stick on the desktop
                  </button>
                )}
              </div>
            </div>
            <ul className="min-w-0 divide-y divide-border/50">
              {/* Written out (“Write out my day”): the same page here, to write on and tick. */}
              {written && <li className="py-2"><DayList compact /></li>}
              {!written && shown.map((task) => (
                <TaskRow key={task.id} task={task} today={today} first={task.id === frog} done={struck(task)} pen={!!ticked[task.id]?.pen} onTick={() => tick(task)} now={taskNow} room={markRoom(shown)} />
              ))}
              {!written && todos.length - inLine.length > shown.length && (
                <li>
                  <button type="button" onClick={() => (chime('open'), window.api.openInHome('view', 'today'))}
                    className="flex w-full items-center gap-3 py-2.5 text-left text-sm text-muted-foreground hover:text-foreground">
                    <span aria-hidden className="w-[1.125rem] shrink-0" />
                    {num(todos.length - inLine.length - shown.length)} more in Today <ArrowRight className="size-3.5" />
                  </button>
                </li>
              )}
              {rows.map((row) => (
                <li key={row.key} className="py-3">
                  <button type="button" onClick={() => (chime('open'), row.run())} className="group/row flex w-full items-start gap-3 text-left">
                    <span className="grid size-[1.125rem] shrink-0 translate-y-[0.1rem] place-items-center text-muted-foreground">{row.mark}</span>
                    <span className="min-w-0 flex-1">
                      <span className="private-text block truncate text-[0.9375rem] font-semibold text-foreground underline-offset-4 group-hover/row:underline group-hover/row:decoration-foreground/30">{row.title}</span>
                      <span className="mt-0.5 block text-sm leading-snug text-pretty text-muted-foreground">{row.text}</span>
                    </span>
                  </button>
                  {row.extra && <div className="mt-2 pl-[1.875rem]">{row.extra}</div>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      {/* In the evening: tomorrow written down before bed, a task a line (tomorrow-lines.tsx). */}
      <TomorrowBox className="mt-8" />
    </div>
  )
}

/** A task as a line of the list: a round tick, its title, and when it is for. */
function TaskRow({ task, today, first, done, pen, onTick, now, room = false }: { task: Task; today: string; first?: boolean; done: boolean; pen: boolean; onTick: () => void; now: TaskNow; room?: boolean }): React.JSX.Element {
  const due = dueDay(task)
  const late = !!due && due < today
  const when = late ? `From ${whenInLine(task.dueAt ?? task.deadline, !task.dueAt || !!task.allDay)}, still open`
    : task.dueAt && !task.allDay ? `Today at ${clock(task.dueAt)}` : 'Today, any time'
  const name = taskName(task.title)
  const text = [done ? 'Done' : first ? `First, as you picked · ${when}` : when, task.blocker && task.blockedByStatus !== 'done' ? `In the way: ${task.blockedByTitle ?? task.blocker}` : task.waitingOn ? `Waiting on ${task.waitingOn}` : ''].filter(Boolean).join(' · ')
  // The menu every task has: a focus session, done, when (tasks-view.tsx).
  return (
    <RowMenu items={taskMenu(task, { open: () => (chime('open'), window.api.openInHome('task', task.id)), complete: onTick, now })}>
    <li className="flex items-start gap-3 py-3">
      <Tip label={done ? 'Not done after all' : 'Done'}>
        <button type="button" data-task-tick role="checkbox" aria-checked={done} aria-label={task.title} onClick={onTick}
          className="relative mt-[0.1875rem] grid size-[1.125rem] shrink-0 place-items-center rounded-full before:absolute before:-inset-1.5 before:content-[''] border-[1.5px] transition-[background-color,border-color,scale] duration-150 ease-out outline-none active:scale-90 focus-visible:ring-2 focus-visible:ring-ring/40"
          style={{
            // Amber for late, as the Today list has it; green once done.
            borderColor: done ? 'var(--tt-color-text-green)' : late ? 'var(--tt-color-text-orange)' : 'color-mix(in oklab, var(--muted-foreground) 70%, transparent)',
            background: done ? 'var(--tt-color-text-green)' : undefined
          }}>
          <Check className={`mf-unmarked size-2.5 text-white transition-[opacity,scale] duration-150 ease-out ${done ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} strokeWidth={3} />
          {/* By hand once done: the tick written as you make it. */}
          {done && <Tick seed={task.id} draw={pen} className="size-3 text-white" />}
        </button>
      </Tip>
      {/* The mark in a column of its own, kept only when a task here has one: the title and the line under it start in one place. */}
      {room && <span className="-mx-1 mt-[5px] flex shrink-0"><PriorityMark level={task.priority} room /></span>}
      <button type="button" onClick={() => (chime('open'), window.api.openInHome('task', task.id))} className="group/row min-w-0 flex-1 text-left">
        <span className="flex min-w-0 items-center gap-2">
        <span data-task-title className={`block min-w-0 truncate text-[0.9375rem] font-semibold underline-offset-4 transition-colors ${done ? 'mf-hand-struck text-muted-foreground line-through decoration-foreground/40' : 'text-foreground group-hover/row:underline group-hover/row:decoration-foreground/30'}`}>
          {done ? <Struck seed={task.id} draw={pen}>{name.text}</Struck> : name.text}
        </span>
        <Tags tags={name.tags} />
        </span>
        <span data-task-meta className="mt-0.5 block truncate text-sm text-muted-foreground">{text}</span>
      </button>
    </li>
    </RowMenu>
  )
}
