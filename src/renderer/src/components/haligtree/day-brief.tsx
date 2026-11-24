import { isMorning } from '../../../../main/day-parts'
import { TaskSite } from './task-site'
import { useEffect, useState, type ReactNode } from 'react'
import { useReading } from '@/lib/reads-in'
import { byKeys } from '@/lib/motion'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { chime } from '@/lib/sound'
import { issues, type Repeat } from '@/lib/issues'
import { unloaded, useLive, haligtree, whenInLine, type Finished, type Item, type Settings, type Task } from '@/lib/haligtree'
import { Rolling, Tags, Tip, quietly, toast } from './ui'
import { Rule, Struck, Tick } from './marks'
import { stickOnDesktop } from './sticky-note'
import { AnotherPicture, PictureCredit, Scenery, sceneCredit, useDayScene } from './scenery'
import { GrainFill, useCover, useCoversRead } from './grain'
import { openPass } from './pass'
import { KindBack, backLine, returning, type Returning } from './kind-back'
import { NextMark } from './milestones'
import { doneOnToday, onToday, taskName, todaySaid } from '@/lib/tasks'
import { PriorityMark, markRoom } from './task-input'
import { ThreeMark, dayOrder, dayThree } from './day-list'
import { RowMenu } from './row-menu'
import { taskMenu, useTaskNow, type TaskNow } from './tasks-view'
import { DOT_IN_MARGIN, SessionDot, TaskSpentWords, useTaskTime, type TaskTime } from './task-time'
import { TomorrowBox } from './tomorrow-lines'
import { frogFirst, frogOn } from '@/lib/day-plan'
import { useMacEvents } from '@/lib/mac-calendar'
import { EventNotes } from './offers-about'
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

/** The title over a picture: white, with a soft shadow to lift it off any painting. */
const WHITE = 'text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.25),0_4px_28px_rgb(0_0_0/0.35)]'
/** The pool under the report's title, by how light the painting is (0 black, 1 white): full on a light painting,
 * a sixth of that on a night one, whose own dark already carries white words. */
const pool = (light = 0.5): string => {
  const k = Math.min(1, Math.max(1 / 6, (light - 0.2) / 0.3))
  const a = (n: number): string => (n * k).toFixed(3)
  return `radial-gradient(ellipse 75% 70% at 50% 55%, rgb(0 0 0 / ${a(0.44)}), rgb(0 0 0 / ${a(0.16)}) 70%, rgb(0 0 0 / ${a(0.06)}))`
}

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
  const taskTime = useTaskTime()
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
  // Its folders still being looked through ('coming', the first time, a whole folder): never waited for. The painting's
  // room and the title's place are kept, and the painting comes in place when found.
  const found = useDayScene(day)
  const looking = found === 'coming'
  const scene = looking ? undefined : found
  // Scenery off, or no pictures: the day's grain cover, the same all day. Only once that is known: while the paintings
  // were still being read in, the grain cover showed first and the painting replaced it, a flash of a grainy gradient.
  const grain = useCover(scene === null ? `day:${day}` : null)
  const coversRead = useCoversRead()
  const settings = useLive(haligtree.settings, null as Settings | null)
  const tasks = useLive(haligtree.tasks, [] as Task[])
  const waiting = useLive(haligtree.passWaiting, { tidy: 0, decide: 0 })
  const due = useLive(haligtree.dueCount, null as number | null)
  const reviews = due ?? 0
  // Of them, the new ones: counted from today's queue, as Review's own line counts them.
  const fresh = useLive(haligtree.newToday, null as number | null, [], ['item'])
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
  useReading((!looking && (scene === undefined || (!scene && !coversRead))) || (sky === undefined && !skyWaited) || !settings || unloaded(tasks) || unloaded(waiting) || due === null || fresh === null || unloaded(questions) || unloaded(back) || unloaded(repeats) || unloaded(marks) || unloaded(mac) || unloaded(sessions))
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
  const doneToday = tasks.filter((task) => doneOnToday(task))
  const byId = new Map([...doneToday, ...open].map((task) => [task.id, task]))
  for (const [id, one] of Object.entries(ticked)) if (!byId.has(id)) byId.set(id, one.task)
  // The frog, picked last night to do first, leads; the rest in Today's own order (late first, then your order), so a
  // task stands in the same place here as on Today's page, and today's three are the same three (the user, 23 Nov).
  const frog = frogOn(settings, today)
  const three = dayThree(tasks)
  // Today's three first, in their numbered order (1, 2, 3, as Tasks shows them), then the rest in Today's order: sorted
  // by date alone, the numbers came 1, 3, 2 with done ones between them (the owner, 24 Nov).
  const rank = (task: Task): number => (three.includes(task.id) ? three.indexOf(task.id) : 3)
  const todos = frogFirst([...byId.values()].sort((a, b) => rank(a) - rank(b) || dayOrder(a, b)), frog)
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
      text: `${cap(say(reviews))} ${reviews === 1 ? 'card' : 'cards'} today, ${fresh ? (fresh === reviews ? (reviews === 1 ? 'a new one' : 'all of them new') : `${say(fresh)} of them new`) : 'no new ones'}. A few minutes helps you remember them.`,
      run: () => window.api.openInHome('view', 'review', ':today')
    }] : [])
  ]
  // One sentence, calm and short: what lands when, then what else is waiting.
  const parts: string[] = []
  // From 4 (main/day-parts.ts): before it, it is still the night before, and "ease into it" reads wrong at 3am.
  const morning = isMorning(now.getHours())
  if (dueToday.length && timed.length && morning && dayjs(timed[0].dueAt!).hour() >= 12)
    parts.push(`your morning is open until ${clock(timed[0].dueAt!)}`)
  else if (dueToday.length && timed.length) parts.push(`${say(dueToday.length)} ${dueToday.length === 1 ? 'thing is' : 'things are'} due, the next at ${clock(timed[0].dueAt!)}`)
  else if (dueToday.length) parts.push(`${say(dueToday.length)} ${dueToday.length === 1 ? 'thing is' : 'things are'} due today`)
  if (late.length) parts.push(`${late.length === 1 ? 'one from before is' : 'a few from before are'} still open`)
  if (backs.length) parts.push(backs.length === 1 ? 'a Check back asks you something' : 'a few Check backs ask you something')
  if (deciding) parts.push('it is deciding day')
  if (prompt?.key === 'clue') parts.push('a question has a new clue')
  if (waiting.tidy) parts.push('new notes are waiting to be tidied')
  if (reviews) parts.push('a few things come back for review')
  // A marked day a week away or nearer leads: it is what the day is counting toward.
  if (coming && dayjs(coming.day).diff(dayjs(dayKey(now)), 'day') <= 7) parts.unshift(countdown(coming, dayKey(now)))
  // Two clauses at most, so the line under the picture never runs to three.
  const said = parts.length
    ? `${cap(list(parts.slice(0, 2)))}.`
    : morning ? 'Nothing is due and nothing is waiting, so ease into it.' : 'Nothing is due and nothing is waiting. The rest is yours.'
  const weekday = dayjs(now).format('dddd')
  const greeting = `Happy ${weekday}. ${said}`
  // Everything the greeting speaks of, read: said before, it was typed again a moment later, longer.
  const heard = ![tasks, waiting, questions, back, repeats, marks].some(unloaded) && due !== null && !!settings

  const named = sceneCredit(scene)
  const picture = !!scene || !!grain || looking
  const time = clock(now)
  // Where today sits in the year, as a log is numbered: "Day 302". In December, the count runs down to the new year instead: "T-minus 3".
  const year = dayjs(now).startOf('year')
  const left = year.add(1, 'year').diff(dayjs(now).startOf('day'), 'day')
  const count = dayjs(now).month() === 11
    ? { text: `T-minus ${left}`, tip: `${left === 1 ? 'The last day' : `${left} days left`} of ${year.year()}` }
    : { text: `Day ${dayjs(now).startOf('day').diff(year, 'day') + 1}`, tip: `Day ${dayjs(now).startOf('day').diff(year, 'day') + 1} of ${year.add(1, 'year').diff(year, 'day')} in ${year.year()}` }

  return (
    <div className="pt-5 @min-[66rem]/page:pt-8">
      <div className="relative">
        {/* One height with a picture or without: the day's picture can come a beat after
            the page, and the page under it never moves when it does. */}
        <div className="relative isolate h-[clamp(6rem,20vh,12rem)] overflow-hidden rounded-2xl">
          {(scene || grain) && (
            <>
              {scene
                ? <Scenery place="today" seed={`day:${day}`} mood={['day', 'dusk', 'night', 'interior']} cloudy={!!sky && /cloud|overcast|rain|drizzle|shower|fog|mist|storm|snow/i.test(sky)} className="absolute inset-0 -z-10" rounded="rounded-2xl" soft />
                : grain && <GrainFill cover={grain} large shade="none" className="-z-10" />}
              {/* A soft dark pool behind the words, never a band: the
                  painting still reads at the edges, the title on any of it.
                  Only as dark as the painting needs: a light one gets the full
                  pool, a night one (already dark under white words) only a
                  touch, or a moonlit river read as a black slab.
                  Only once the painting is up: alone on the bare page it read
                  as a broken gradient for the moment the picture took. */}
              <div aria-hidden data-report-pool className="absolute inset-0 -z-10 transition-opacity duration-500 [[data-scene]:not([data-shown])~&]:opacity-0"
                style={{ backgroundImage: pool(scene?.light) }} />
            </>
          )}
          {/* White over the grain, or over the painting once it is up (turning white as it fades in, when it does); in
              the page's own colour until then, never white on the bare page. */}
          <h2 className={`flex size-full flex-col justify-center px-6 leading-[0.92] ${picture ? 'items-center text-center' : 'items-start'} ${grain ? WHITE : 'text-foreground ease-out [[data-scene][data-fades]~&]:transition-[color,text-shadow] [[data-scene][data-fades]~&]:duration-[900ms] [[data-scene][data-shown]~&]:text-white [[data-scene][data-shown]~&]:[text-shadow:0_1px_2px_rgb(0_0_0/0.25),0_4px_28px_rgb(0_0_0/0.35)]'}`}
            style={{ fontFamily: 'var(--font-heading)' }}>
            {/* The title is simply there: the greeting below is the line that speaks (lib/motion.ts). */}
            <span className="font-semibold tracking-[-0.02em] text-[clamp(1.5rem,6cqi,3rem)] text-balance">The {weekday} Report</span>
            {/* The date, the day of the year, the time (each new minute) and the weather: one calm line under the title. */}
            <span data-today-line className="mt-2.5 font-sans text-[clamp(0.8125rem,1.8cqi,0.9375rem)] leading-normal font-normal tracking-[0.01em] tabular-nums" style={picture ? undefined : { color: 'var(--muted-foreground)' }}>
              {/* Four facts, each its own: a quiet dot between them with room either side, and the weather as "20°C clear", no comma to make a fifth stop. */}
              {[dayjs(now).format('D MMMM'), <Tip key="count" label={count.tip}><span data-report-count>{count.text}</span></Tip>, time, sky?.replace(/,\s*/, ' ')]
                .filter(Boolean)
                .map((fact, at) => <span key={at} className="whitespace-nowrap">{at > 0 && <span aria-hidden className="mx-[0.6em] opacity-50">·</span>}{fact}</span>)}
            </span>
          </h2>
        </div>
      </div>
      <div className="pt-2.5">
        <div className="flex items-start gap-6">
          {/* With a painting, or one coming, the greeting keeps to the room its credit leaves: the credit arriving with the
              painting rewrapped the words beside it. */}
          <p data-day-greeting className={`relative line-clamp-2 min-h-[2lh] min-w-0 flex-1 text-[0.9375rem] leading-snug text-pretty text-muted-foreground ${scene || looking ? 'max-w-[calc(65%_-_1.5rem)]' : ''}`}>
            {/* Two lines kept from the first frame, the most it ever shows: a one-line greeting that ran to two as it
                typed, or as a late read (a review due, a mark coming) made it longer, dropped the page under it 22px.
                Only once everything it speaks of is read, so it is said once, never changed a moment later. Plain words, not
                typed in: the Journal's box below types its own hints, and two lines typing at once fought for the eye. */}
            {heard && greeting}
          </p>
          {named && <span className="flex max-w-[35%] items-start justify-end gap-1"><PictureCredit className="pt-0.5 text-right">{named}</PictureCredit><AnotherPicture /></span>}
        </div>
      </div>
      {/* The next marked day, counted down: a click changes it. */}
      <NextMark className="mt-3 -mx-1 px-1 py-1 hover:bg-foreground/[0.035]" />
      {/* The day's events from your Mac's calendar, read only, in one line with the tasks that have a time. */}
      {lined && (
        <DayTimeline events={mac.events} tasks={inLine} sessions={sessions} now={now} done={struck} pen={(task) => !!ticked[task.id]?.pen} onTick={tick} time={taskTime} />
      )}
      {/* The next event's notes from your book, a line before it. */}
      {day === dayjs(now).format('YYYY-MM-DD') && <EventNotes events={mac.events} now={now} onOpen={(type, id) => onOpen?.(type, id)} />}
      <CalendarNote said={mac} className="mt-5" />
      {between}
      {(shown.length > 0 || rows.length > 0) && (
        <section className="@container mf-hand-ruled relative mt-8 border-t border-border/70 pt-6">
          <Rule seed={day} />
          {/* One column, on the page's own left edge as the words above and "For tomorrow" below: its heading over its
              list, never a label column pushing the list off to the right. */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-lg leading-tight font-semibold text-foreground">{todos.length ? 'Today’s tasks' : 'Coming back to you'}</p>
                {todos.length > 0 && settings?.dayHints === true && (
                  <p data-day-count className="text-sm tabular-nums" style={{ color: finished === todos.length ? 'var(--tt-color-text-green)' : 'var(--muted-foreground)' }}>
                    <Rolling text={todaySaid(todos.length - finished, finished)} by="word" />
                  </p>
                )}
                {/* The same list as a sticky, ticked off on the desktop through the day. */}
                {todos.length > 0 && (
                  <button type="button" onClick={() => stickOnDesktop('today', 'today')}
                    className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                    Stick on the desktop
                  </button>
                )}
              </div>
            </div>
            <ul className="min-w-0 divide-y divide-border/50">
              {shown.map((task) => (
                <TaskRow key={task.id} task={task} today={today} first={task.id === frog} done={struck(task)} pen={!!ticked[task.id]?.pen} onTick={() => tick(task)} now={taskNow} time={taskTime} rank={three.includes(task.id) ? three.indexOf(task.id) + 1 : undefined} room={markRoom(shown)} />
              ))}
              {todos.length - inLine.length > shown.length && (
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
function TaskRow({ task, today, first, done, pen, onTick, now, time, room = false, rank }: { task: Task; today: string; first?: boolean; done: boolean; pen: boolean; onTick: () => void; now: TaskNow; time: TaskTime; room?: boolean; /** Its place among today's three, if one of them. */ rank?: number }): React.JSX.Element {
  const due = dueDay(task)
  const late = !!due && due < today
  const when = late ? `From ${whenInLine(task.dueAt ?? task.deadline, !task.dueAt || !!task.allDay)}, still open`
    : task.dueAt && !task.allDay ? `Today at ${clock(task.dueAt)}` : 'Today, any time'
  const name = taskName(task.title)
  const text = [done ? 'Done' : first ? `First, as you picked · ${when}` : when, task.blocker && task.blockedByStatus !== 'done' ? `In the way: ${task.blockedByTitle ?? task.blocker}` : task.waitingOn ? `Waiting on ${task.waitingOn}` : ''].filter(Boolean).join(' · ')
  // The menu every task has: a focus session, done, when (tasks-view.tsx).
  return (
    <RowMenu items={() => taskMenu(task, { open: () => (chime('open'), window.api.openInHome('task', task.id)), complete: onTick, now })}>
    <li className="relative flex items-start gap-3 py-3">
      {/* A focus session running on it: the dot in the margin, as Today's rows have it. */}
      <SessionDot id={task.id} time={time} className={`${DOT_IN_MARGIN} top-3 h-6`} />
      {/* The circle's own column, as on Today's page: one of today's three wears its number under it. */}
      <span className="flex shrink-0 flex-col items-center gap-1">
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
      {rank ? <ThreeMark n={rank} className="leading-4" /> : null}
      </span>
      {/* The mark in a column of its own, kept only when a task here has one: the title and the line under it start in one place. */}
      {room && <span className="-mx-1 mt-[5px] flex shrink-0"><PriorityMark level={task.priority} room /></span>}
      <button type="button" onClick={() => (chime('open'), window.api.openInHome('task', task.id))} className="group/row min-w-0 flex-1 text-left">
        <span className="flex min-w-0 items-center gap-2">
        <TaskSite task={task} />
        <span data-task-title className={`block min-w-0 truncate text-[0.9375rem] underline-offset-4 transition-colors ${done ? 'mf-hand-struck text-muted-foreground line-through decoration-foreground/40' : 'text-foreground group-hover/row:underline group-hover/row:decoration-foreground/30'}`}>
          {done ? <Struck seed={task.id} draw={pen}>{name.text}</Struck> : name.text}
        </span>
        <Tags tags={name.tags} />
        </span>
        <span data-task-meta className="mt-0.5 block truncate text-sm text-muted-foreground">{text}{/* The time spent on it, last in its line: “so far” while it is open, its final time once done (task-time.tsx). */}<TaskSpentWords task={{ id: task.id, estimate: task.estimate, status: done ? 'done' : task.status }} time={time} /></span>
      </button>
    </li>
    </RowMenu>
  )
}
