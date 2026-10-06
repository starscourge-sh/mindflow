import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowRightIcon from '@/components/ui/arrow-narrow-right-icon'
import BrainCircuitIcon from '@/components/ui/brain-circuit-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { chime } from '@/lib/sound'
import { issues, type Repeat } from '@/lib/issues'
import { useLive, vigil, whenInLine, type Finished, type Item, type Settings, type Task } from '@/lib/vigil'
import { Rolling, Tip, Typed, toast } from './ui'
import { Scenery, useDayScene } from './scenery'
import { openPass } from './pass'
import { KindBack, backLine, returning, type Returning } from './kind-back'
import { ago, clock, dayjs, dayKey, num } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowRight = alive(ArrowNarrowRightIcon)
const Brain = alive(BrainCircuitIcon)
const Check = alive(SimpleCheckedIcon)

/**
 * The top of today's page, read like a morning paper: the day's picture with
 * its name across it and the date and time standing in the margins, one short
 * line on what the day holds, then today's to-dos, tickable where they are,
 * and whatever else has come back. All from what is already here; nothing is
 * asked of anyone. It scrolls away with the page, so writing below is never covered.
 */

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const say = (n: number): string => WORDS[n] ?? 'several'
const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)
/** "a, b and c"; "a, at noon, and b" when a part has its own comma. */
const list = (parts: string[]): string => parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')}${parts.some((part) => part.includes(',')) ? ',' : ''} and ${parts[parts.length - 1]}`

/** Words fit to print: not a camera's counter, a hash or a random upload name. */
const readable = (raw?: string): string | null => {
  const words = raw?.replace(/_+/g, ' ').replace(/\S+\.(com|net|org|io|co)\b|\(\d+\)|\bwallpapers?\b/gi, ' ').trim().replace(/^[\d\s._-]+(?=\D)/, '').replace(/(?<=\w)-(?=\w)/g, ' ').replace(/\s+/g, ' ').trim()
  if (!words || /^(img|dsc|dscn|pxl|photo|image|screenshot|screen shot)\b/i.test(words)) return null
  return words.split(' ').some((word) => /^[A-Z]?[a-z]{2,}[,.]?$/.test(word)) ? words : null
}
/** A credit for the day's picture, the way a caption names a painting: its name, then where it hangs. */
const credit = (name?: string, folder?: string): string | null =>
  [readable(name), readable(folder)].filter(Boolean).join(', ') || null

/** The time now, said again on each new minute. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer = 0
    const next = (): void => {
      timer = window.setTimeout(() => (setNow(new Date()), next()), 60_000 - (Date.now() % 60_000) + 50)
    }
    next()
    return () => clearTimeout(timer)
  }, [])
  return now
}

/** When a task is for: the day it is due, else its deadline's. */
const dueDay = (task: Task): string | null => (task.dueAt ? dayKey(task.dueAt) : task.deadline ? dayKey(task.deadline) : null)

/** A row under the tasks: a decision or experiment back, the deciding pass, an idea that keeps coming back, a clue, the review. */
type Row = { key: string; mark: ReactNode; title: string; text: string; run: () => void; extra?: ReactNode }

/** A task ticked here: kept in its place, struck through, with what to put back if it is unticked. */
type Ticked = { task: Task; was?: Finished }

export function DayBrief({ day, onOpen, onListed }: {
  day: string
  onOpen?: (type: string, id: string) => void
  /** The tasks the brief lists, so the page below does not list them again. */
  onListed?: (ids: string[]) => void
}): React.JSX.Element {
  const now = useMinute()
  const scene = useDayScene(day)
  const settings = useLive(vigil.settings, null as Settings | null)
  const tasks = useLive(vigil.tasks, [] as Task[])
  const waiting = useLive(vigil.passWaiting, { tidy: 0, decide: 0 })
  const reviews = useLive(vigil.dueCount, 0)
  const questions = useLive(() => vigil.items('question'), [] as Item[], [], ['item'])
  // Decisions on their look-again day, experiments past their run-until.
  const backs = useLive(returning, [] as Returning[], [], ['capture', 'item']).filter((one) => !one.private).slice(0, 2)
  // The same idea caught three times or more, among the last fortnight's captures.
  const repeats = useLive<Record<string, Repeat>>(async () => {
    const ids = (await vigil.recent(14)).filter((one) => one.type === 'capture' && !one.private).map((one) => one.id).slice(0, 80)
    return ids.length ? issues.repeats(ids) : {}
  }, {} as Record<string, Repeat>, [], ['capture', 'item'])
  const [ticked, setTicked] = useState<Record<string, Ticked>>({})

  const today = dayKey(now)
  const open = tasks.filter((task) => task.status === 'open' && (dueDay(task) ?? '9') <= today)
  const late = open.filter((task) => (dueDay(task) ?? '') < today)
  const dueToday = open.filter((task) => dueDay(task) === today)
  const timed = dueToday.filter((task) => task.dueAt && !task.allDay && Date.parse(task.dueAt) > now.getTime())
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))
  const deciding = settings?.weeklyReview !== false && now.getDay() === settings?.weeklyDay && waiting.decide > 0
  const repeat = Object.entries(repeats).filter(([, one]) => !one.article).sort((a, b) => b[1].n - a[1].n)[0]
  const week = dayjs(now).subtract(7, 'day').toISOString()
  const clue = questions.filter((one) => !one.closedAt && !one.archivedAt && !one.private && one.clues > 0 && (one.updatedAt ?? '') >= week)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]

  // Today's to-dos: what is due or late, and those of them done today, so the
  // count reads "2 / 4" and a tick stays where it was made. A routine ticked
  // here moves on to its next day, so it is kept from the tick itself.
  const doneToday = tasks.filter((task) => task.status === 'done' && task.completedAt && dayKey(task.completedAt) === today && (dueDay(task) ?? '9') <= today)
  const byId = new Map([...doneToday, ...open].map((task) => [task.id, task]))
  for (const [id, one] of Object.entries(ticked)) if (!byId.has(id)) byId.set(id, one.task)
  const todos = [...byId.values()].sort((a, b) => b.important - a.important || (a.dueAt ?? a.deadline ?? '').localeCompare(b.dueAt ?? b.deadline ?? '') || a.number - b.number)
  const struck = (task: Task): boolean => !!ticked[task.id] || task.status === 'done'
  const shown = todos.slice(0, 5)
  const finished = todos.filter(struck).length
  const listed = shown.map((task) => task.id).join(' ')
  useEffect(() => onListed?.(listed ? listed.split(' ') : []), [listed, onListed])

  const forget = (id: string): void => setTicked(({ [id]: _, ...rest }) => rest)
  const tick = (task: Task): void => {
    const was = ticked[task.id]?.was
    if (was) {
      chime('off')
      forget(task.id)
      void vigil.undoneTask(task.id, was)
      return
    }
    chime('done')
    setTicked((all) => ({ ...all, [task.id]: { task } }))
    void vigil.doneTask(task.id).then((was) => {
      setTicked((all) => ({ ...all, [task.id]: { task, was } }))
      toast(finished + 1 === todos.length ? 'Done. That is everything for today' : 'Done', () => {
        chime('undo')
        forget(task.id)
        void vigil.undoneTask(task.id, was)
      })
    })
  }

  // Below the tasks, what else has come back today, each a row of the same list.
  const prompt: Row | null = deciding ? {
    key: 'decide',
    mark: <ArrowRight className="size-4" />,
    title: 'Decide what you set aside',
    text: 'It is deciding day. What you marked to come back to is waiting, each with its ways out.',
    run: () => openPass('decide')
  } : repeat ? {
    key: 'repeat',
    mark: <ArrowRight className="size-4" />,
    title: repeat[1].ids.find((one) => one.id === repeat[0])?.title ?? 'An idea you keep catching',
    text: `Caught ${num(repeat[1].n)} times. An article that links each one could let it rest.`,
    run: () => void issues.repeatArticle(repeat[1].ids.map((one) => one.id)).then((article) => {
      chime('promote')
      toast(`An article, from ${num(repeat[1].n)} captures of the same idea`)
      onOpen?.('article', article)
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
      return { key: one.id, mark: <Mark className="size-4" style={{ color: kind?.tint }} />, title: one.title, text: backLine(one), run: () => onOpen?.(one.type, one.id), extra: <KindBack one={one} onOpen={onOpen} /> }
    }),
    ...(prompt ? [prompt] : []),
    ...(reviews > 0 ? [{
      key: 'review',
      mark: <Brain className="size-4" />,
      title: 'Go through today’s review',
      text: `${cap(say(reviews))} ${reviews === 1 ? 'thing comes' : 'things come'} back to you today. A few minutes keeps them yours.`,
      run: () => window.api.openInHome('view', 'review')
    }] : [])
  ]
  // The seal starts on the first thing not yet done.
  const first = shown.find((task) => !struck(task))
  const start = first ? () => window.api.openInHome('task', first.id) : rows[0]?.run

  // One sentence, calm and short: what lands when, then what else is waiting.
  const parts: string[] = []
  const morning = now.getHours() < 12
  if (dueToday.length && timed.length && morning && dayjs(timed[0].dueAt!).hour() >= 12)
    parts.push(`your morning is open until ${clock(timed[0].dueAt!)}`)
  else if (dueToday.length && timed.length) parts.push(`${say(dueToday.length)} ${dueToday.length === 1 ? 'thing is' : 'things are'} due, the next at ${clock(timed[0].dueAt!)}`)
  else if (dueToday.length) parts.push(`${say(dueToday.length)} ${dueToday.length === 1 ? 'thing is' : 'things are'} due today`)
  if (late.length) parts.push(`${late.length === 1 ? 'one from before is' : 'a few from before are'} still open`)
  if (backs.length) parts.push(backs[0].kind === 'decision' ? 'a decision comes back' : 'an experiment has run its time')
  if (deciding) parts.push('it is deciding day')
  if (prompt?.key === 'clue') parts.push('a question has a new clue')
  if (waiting.tidy) parts.push('new captures wait for a tidy')
  if (reviews) parts.push('a few things come back for review')
  // Two clauses at most, so the line under the picture never runs to three.
  const said = parts.length
    ? `${cap(list(parts.slice(0, 2)))}.`
    : morning ? 'Nothing is due and nothing is waiting, so ease into it.' : 'Nothing is due and nothing is waiting. The rest is yours.'
  const weekday = dayjs(now).format('dddd')
  const greeting = `Happy ${weekday}. ${said}`

  const named = credit(scene?.name, scene?.folder)
  const picture = !!scene
  const date = dayjs(now).format('DD MMM YYYY').toUpperCase()
  const time = dayjs(now).format('HH:mm')

  return (
    <div className="pt-5 @min-[66rem]/page:pt-8">
      <div className="relative">
        <Upright text={date} side="left" />
        <div className={`relative isolate overflow-hidden rounded-2xl ${picture ? 'h-[clamp(8.5rem,34vh,24rem)]' : 'py-6 min-[900px]:py-10'}`}>
          {picture && (
            <>
              <Scenery place="today" seed={`day:${day}`} mood={['day', 'dusk', 'night', 'interior']} className="absolute inset-0 -z-10" rounded="rounded-2xl" soft />
              {/* A soft dark pool behind the words, never a band: the
                  painting still reads at the edges, the title on any of it. */}
              <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_75%_70%_at_50%_55%,rgb(0_0_0/0.44),rgb(0_0_0/0.16)_70%,rgb(0_0_0/0.06))]" />
            </>
          )}
          <h2 className={`flex size-full flex-col justify-center px-6 leading-[0.92] ${picture ? 'items-center text-center' : 'items-start'}`}
            style={{
              fontFamily: 'var(--font-heading)',
              color: picture ? 'color-mix(in oklab, var(--tt-brand-color-400) 42%, white)' : 'var(--tt-brand-color-400)',
              textShadow: picture ? '0 1px 2px rgb(0 0 0 / 0.25), 0 4px 28px rgb(0 0 0 / 0.35)' : undefined
            }}>
            <span className="mf-typed -mb-[0.1em] text-[clamp(1.25rem,3.2vw,2.5rem)] italic" style={{ animationDelay: '80ms', marginInlineStart: picture ? '-3.5em' : undefined }}>The</span>
            <span className="mf-typed font-semibold tracking-[-0.02em] text-[clamp(2.4rem,7.4vw,5.75rem)] text-balance" style={{ animationDelay: '160ms' }}>{weekday} Brief</span>
          </h2>
        </div>
        <Upright text={time} side="right" />
      </div>
      <div className="pt-2.5">
        {/* The margins' date and time, on one plain line when there are no margins to stand in. */}
        <p className="mb-0.5 text-xs font-medium text-foreground tabular-nums @min-[66rem]/page:hidden">{dayjs(now).format('dddd D MMMM')}, {time}</p>
        <div className="flex items-start gap-6">
          <p className="line-clamp-2 min-w-0 flex-1 text-[0.9375rem] leading-snug text-pretty text-muted-foreground italic" style={{ fontFamily: 'var(--font-heading)' }}>
            <Typed text={greeting} delay={350} step={22} />
          </p>
          {named && <span className="max-w-[35%] min-w-0 truncate pt-0.5 text-right font-mono text-[0.625rem] tracking-wide text-muted-foreground/80" title={named}>{named}</span>}
        </div>
      </div>
      {(shown.length > 0 || rows.length > 0) && (
        <section className="@container mt-8 border-t border-border/70 pt-6">
          <div className="grid gap-x-10 gap-y-4 @[34rem]:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <div className="flex items-center justify-between gap-4 @[34rem]:flex-col @[34rem]:items-start @[34rem]:justify-start">
              <div>
                <p className="text-[1.375rem] leading-tight text-foreground italic" style={{ fontFamily: 'var(--font-heading)' }}>{todos.length ? 'Today’s to-dos' : 'Coming back to you'}</p>
                {todos.length > 0 && (
                  <p className="mt-1 font-mono text-[0.6875rem] tracking-wide text-muted-foreground tabular-nums">
                    <Rolling text={finished} /> / {num(todos.length)} done
                  </p>
                )}
              </div>
              {start && <Seal onClick={start} />}
            </div>
            <ul className="min-w-0 divide-y divide-border/50">
              {shown.map((task) => (
                <TaskRow key={task.id} task={task} today={today} done={struck(task)}
                  // One done elsewhere stays ticked: its undo lives where it was done.
                  locked={task.status === 'done' && !ticked[task.id]?.was} onTick={() => tick(task)} />
              ))}
              {todos.length > shown.length && (
                <li>
                  <button type="button" onClick={() => (chime('open'), window.api.openInHome('view', 'today'))}
                    className="flex w-full items-center gap-3 py-2.5 text-left text-sm text-muted-foreground hover:text-foreground">
                    <span aria-hidden className="w-[1.125rem] shrink-0" />
                    {num(todos.length - shown.length)} more in Today <ArrowRight className="size-3.5" />
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
    </div>
  )
}

/** A to-do as a line of the list: a round tick, its title, and when it is for. */
function TaskRow({ task, today, done, locked, onTick }: { task: Task; today: string; done: boolean; locked: boolean; onTick: () => void }): React.JSX.Element {
  const due = dueDay(task)
  const late = !!due && due < today
  const when = late ? `From ${whenInLine(task.dueAt ?? task.deadline, !task.dueAt || !!task.allDay)}, still open`
    : task.dueAt && !task.allDay ? `Today at ${clock(task.dueAt)}` : 'Today, any time'
  const text = [done ? 'Done' : when, task.blocker ? `In the way: ${task.blocker}` : task.waitingOn ? `Waiting on ${task.waitingOn}` : ''].filter(Boolean).join(' · ')
  return (
    <li className="flex items-start gap-3 py-3">
      <Tip label={locked ? 'Done' : done ? 'Not done after all' : 'Done'}>
        <button type="button" role="checkbox" aria-checked={done} aria-label={task.title} disabled={locked} onClick={onTick}
          className="mt-[0.1875rem] grid size-[1.125rem] shrink-0 place-items-center rounded-full border-[1.5px] transition-[background-color,border-color,scale] duration-150 ease-out outline-none active:scale-90 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default"
          style={{
            // Amber for late, as the Today list has it; green once done.
            borderColor: done ? 'var(--tt-color-text-green)' : late ? 'var(--tt-color-text-orange)' : 'color-mix(in oklab, var(--muted-foreground) 70%, transparent)',
            background: done ? 'var(--tt-color-text-green)' : undefined
          }}>
          <Check className={`size-2.5 text-white transition-[opacity,scale] duration-150 ease-out ${done ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} strokeWidth={3} />
        </button>
      </Tip>
      <button type="button" onClick={() => (chime('open'), window.api.openInHome('task', task.id))} className="group/row min-w-0 flex-1 text-left">
        <span className={`block truncate text-[0.9375rem] font-semibold underline-offset-4 transition-colors ${done ? 'text-muted-foreground line-through decoration-foreground/40' : 'text-foreground group-hover/row:underline group-hover/row:decoration-foreground/30'}`}>{task.title}</span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">{text}</span>
      </button>
    </li>
  )
}

/** Date or time set on its side in the page's margin, centred on the picture and in the margin, as a newspaper's spine. */
function Upright({ text, side }: { text: string; side: 'left' | 'right' }): React.JSX.Element {
  return (
    <span aria-hidden className={`absolute inset-y-0 hidden w-[calc((100cqw-100%)/2)] items-center justify-center @min-[66rem]/page:flex ${side === 'left' ? 'right-full' : 'left-full'}`}>
      <span className={`leading-none whitespace-nowrap text-foreground/80 italic tabular-nums [writing-mode:vertical-rl] ${side === 'left' ? 'rotate-180' : ''}`}
        style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.75rem, min(3.1cqw, 5.4vh), 3.25rem)' }}>
        {text}
      </span>
    </span>
  )
}

/** The seal's outline: a round with soft points, like a sticker off a sheet. */
const SEAL = (() => {
  const points = 22
  const path: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI * i) / points - Math.PI / 2
    const r = i % 2 ? 43 : 50
    path.push(`${(50 + r * Math.cos(angle)).toFixed(2)},${(50 + r * Math.sin(angle)).toFixed(2)}`)
  }
  return `M${path.join('L')}Z`
})()

/** "Let's do it": a sticker off a sheet, starting on the first thing still to do. */
function Seal({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <motion.button
      type="button"
      onClick={() => (chime('open'), onClick())}
      initial={{ rotate: -9 }}
      whileHover={{ rotate: -3, scale: 1.05 }}
      whileTap={{ scale: 0.95, rotate: -6 }}
      transition={{ type: 'spring', stiffness: 520, damping: 17, mass: 0.7 }}
      className="relative grid size-[4.75rem] shrink-0 place-items-center rounded-full text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background @[34rem]:mt-5"
    >
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full drop-shadow-[0_2px_3px_color-mix(in_oklab,var(--mf-shadow-ink,black)_22%,transparent)]">
        <path d={SEAL} fill="var(--tt-brand-color-400)" stroke="var(--tt-brand-color-400)" strokeWidth="5" strokeLinejoin="round" />
      </svg>
      <span className="relative text-center text-[0.875rem] leading-[1.05] font-semibold italic" style={{ fontFamily: 'var(--font-heading)' }}>
        Let’s<br />do it <ArrowRight className="inline size-3.5 translate-y-[-1px]" strokeWidth={2.25} />
      </span>
    </motion.button>
  )
}
