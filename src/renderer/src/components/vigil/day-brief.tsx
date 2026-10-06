import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowRightIcon from '@/components/ui/arrow-narrow-right-icon'

import { chime } from '@/lib/sound'
import { issues, type Repeat } from '@/lib/issues'
import { useLive, vigil, whenInLine, type Item, type Settings, type Task } from '@/lib/vigil'
import { Typed, toast } from './ui'
import { Scenery, useDayScene } from './scenery'
import { openPass } from './pass'
import { KindBack, returning, type Returning } from './kind-back'
import { ago, clock, dayjs, dayKey, num } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowRight = alive(ArrowNarrowRightIcon)

/**
 * The top of today's page, read like a morning paper: the day's picture with
 * its name across it, one sentence on what the day holds, and the one thing
 * most worth doing next. All from what is already here; nothing is asked of
 * anyone. It scrolls away with the page, so writing below is never covered.
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

type Next = { label: string; title: string; text: string; run: () => void; private?: boolean; extra?: ReactNode }

export function DayBrief({ day, onOpen }: { day: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const now = useMinute()
  const scene = useDayScene(day)
  const settings = useLive(vigil.settings, null as Settings | null)
  const tasks = useLive(vigil.tasks, [] as Task[])
  const waiting = useLive(vigil.passWaiting, { tidy: 0, decide: 0 })
  const reviews = useLive(vigil.dueCount, 0)
  const questions = useLive(() => vigil.items('question'), [] as Item[], [], ['item'])
  // A decision on its look-again day, an experiment past its run-until.
  const back = useLive(returning, [] as Returning[], [], ['capture', 'item']).filter((one) => !one.private)[0]
  // The same idea caught three times or more, among the last fortnight's captures.
  const repeats = useLive<Record<string, Repeat>>(async () => {
    const ids = (await vigil.recent(14)).filter((one) => one.type === 'capture' && !one.private).map((one) => one.id).slice(0, 80)
    return ids.length ? issues.repeats(ids) : {}
  }, {} as Record<string, Repeat>, [], ['capture', 'item'])

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

  // The one thing, in order of what helps most: a task that is due, a
  // decision or experiment whose day has come, the deciding pass on its day, an idea that keeps coming back, a question
  // with a new clue, then the review.
  const task = [...late, ...dueToday].sort((a, b) => b.important - a.important || (a.dueAt ?? a.deadline ?? '').localeCompare(b.dueAt ?? b.deadline ?? ''))[0]
  const next: Next | null = task ? {
    label: 'Move one thing on',
    title: task.title,
    text: [
      dueDay(task)! < today ? `It was for ${whenInLine(task.dueAt ?? task.deadline, !task.dueAt || !!task.allDay)} and is still open. Doing it or moving it both count.`
        : task.dueAt && !task.allDay ? `It is for ${clock(task.dueAt)} today.` : 'It is for today, whenever suits you.',
      task.blocker ? `In the way: ${task.blocker}.` : task.waitingOn ? `Waiting on ${task.waitingOn}.` : ''
    ].filter(Boolean).join(' '),
    run: () => window.api.openInHome('task', task.id)
  } : back ? {
    label: back.kind === 'decision' ? 'Look again' : 'Write the finding',
    title: back.title,
    text: back.kind === 'decision'
      ? 'You set today to check this call still holds. If nothing in its reopen condition has happened, it stands.'
      : `It was to run until ${whenInLine(back.at)}. Whatever happened is a finding, even “nothing changed”.`,
    run: () => onOpen?.(back.type, back.id),
    extra: <KindBack one={back} onOpen={onOpen} />
  } : deciding ? {
    label: 'Make the calls',
    title: 'Decide what you set aside',
    text: 'It is deciding day. What you marked to come back to is waiting, each with its ways out. A few minutes is plenty.',
    run: () => openPass('decide')
  } : repeat ? {
    label: 'Finish the thought',
    title: repeat[1].ids.find((one) => one.id === repeat[0])?.title ?? 'An idea you keep catching',
    text: `You have caught this ${num(repeat[1].n)} times. An article that links each time could let it rest.`,
    run: () => void issues.repeatArticle(repeat[1].ids.map((one) => one.id)).then((article) => {
      chime('promote')
      toast(`An article, from ${num(repeat[1].n)} captures of the same idea`)
      onOpen?.('article', article)
    })
  } : clue ? {
    label: 'Follow the clue',
    title: clue.title,
    text: `A new clue came in ${ago(clue.updatedAt!)}. With ${say(clue.clues)} ${clue.clues === 1 ? 'clue' : 'clues'} now, it may be ready for an answer.`,
    run: () => onOpen?.('question', clue.id)
  } : reviews > 0 ? {
    label: 'Let it come back',
    title: 'Go through today’s review',
    text: 'Some of what you kept is due to come back today. It takes a few minutes, and it is how it stays yours.',
    run: () => window.api.openInHome('view', 'review')
  } : null

  // One sentence, calm: what lands when, then what is waiting, never as a queue.
  const parts: string[] = []
  const morning = now.getHours() < 12
  if (dueToday.length && timed.length && morning && dayjs(timed[0].dueAt!).hour() >= 12)
    parts.push(`your morning is open and nothing lands until ${clock(timed[0].dueAt!)}`)
  else if (dueToday.length && timed.length) parts.push(`${say(dueToday.length)} ${dueToday.length === 1 ? 'thing is' : 'things are'} due today, the first at ${clock(timed[0].dueAt!)}`)
  else if (dueToday.length) parts.push(`${say(dueToday.length)} ${dueToday.length === 1 ? 'thing is' : 'things are'} due today, at no set time`)
  if (late.length) parts.push(`${late.length === 1 ? 'one thing from before is' : 'a few things from before are'} still open`)
  if (back) parts.push(back.kind === 'decision' ? 'a decision comes back for a look' : 'an experiment has run its time')
  if (deciding) parts.push('it is deciding day')
  if (waiting.tidy) parts.push('new captures are ready for a tidy when you like')
  if (reviews) parts.push(reviews === 1 ? 'one thing comes back for review' : 'a few things come back for review')
  if (clue && next?.title === clue.title) parts.push('a question you hold has a new clue')
  const said = parts.length
    ? `${cap(list(parts.slice(0, 4)))}.`
    : morning ? 'Nothing is due and nothing is waiting, so ease into it. The day is yours.' : 'Nothing is due and nothing is waiting. The rest of the day is yours.'
  const weekday = dayjs(now).format('dddd')
  const greeting = `Happy ${weekday}. ${said}`

  const named = credit(scene?.name, scene?.folder)
  const picture = !!scene
  const date = dayjs(now).format('DD MMM YYYY').toUpperCase()
  const time = dayjs(now).format('HH:mm')

  return (
    <div className="mx-auto w-full max-w-[64rem] px-5 pt-5 min-[900px]:pt-7">
      <div className="grid items-stretch gap-x-5 min-[900px]:grid-cols-[2.5rem_minmax(0,1fr)_2.5rem]">
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
        <Gap />
        <div className="pt-2.5">
          {/* The spine's date and time, on one plain line when the window is too narrow for it. */}
          <p className="mb-0.5 text-xs font-medium text-foreground tabular-nums min-[900px]:hidden">{dayjs(now).format('dddd D MMMM')}, {time}</p>
          <div className="flex items-start gap-6">
            <p className="min-w-0 flex-1 text-[0.9375rem] leading-snug text-pretty text-muted-foreground italic" style={{ fontFamily: 'var(--font-heading)' }}>
              <Typed text={greeting} delay={350} step={22} />
            </p>
            {named && <span className="max-w-[35%] min-w-0 truncate pt-0.5 text-right font-mono text-[0.625rem] tracking-wide text-muted-foreground/80" title={named}>{named}</span>}
          </div>
        </div>
        <Gap />
        {next && <><Gap /><NextCard next={next} /><Gap /></>}
      </div>
    </div>
  )
}

/** An empty side column, beside the rows under the picture. */
const Gap = (): React.JSX.Element => <span aria-hidden className="hidden min-[900px]:block" />

/** Date or time set on its side down one edge of the picture, as a newspaper's spine. */
function Upright({ text, side }: { text: string; side: 'left' | 'right' }): React.JSX.Element {
  return (
    <span aria-hidden className={`hidden items-center justify-center whitespace-nowrap text-[1.85rem] leading-none text-foreground/85 italic tabular-nums [writing-mode:vertical-rl] min-[900px]:flex ${side === 'left' ? 'rotate-180' : ''}`}
      style={{ fontFamily: 'var(--font-heading)' }}>
      {text}
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

function NextCard({ next }: { next: Next }): React.JSX.Element {
  const go = (): void => {
    chime('open')
    next.run()
  }
  return (
    <div className="@container mt-6 rounded-2xl bg-muted/55 px-5 py-5 ring-1 ring-foreground/[0.04]">
      <div className="grid gap-x-8 gap-y-3 @[34rem]:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <div className="flex items-center justify-between gap-4 @[34rem]:flex-col @[34rem]:items-start">
          <p className="text-[1.375rem] leading-tight text-foreground italic" style={{ fontFamily: 'var(--font-heading)' }}>{next.label}</p>
          <motion.button
            type="button"
            onClick={go}
            initial={{ rotate: -9 }}
            whileHover={{ rotate: -3, scale: 1.05 }}
            whileTap={{ scale: 0.95, rotate: -6 }}
            transition={{ type: 'spring', stiffness: 520, damping: 17, mass: 0.7 }}
            className="relative grid size-[5.25rem] shrink-0 place-items-center rounded-full text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full drop-shadow-[0_2px_3px_color-mix(in_oklab,var(--mf-shadow-ink,black)_22%,transparent)]">
              <path d={SEAL} fill="var(--tt-brand-color-400)" stroke="var(--tt-brand-color-400)" strokeWidth="5" strokeLinejoin="round" />
            </svg>
            <span className="relative text-center text-[0.9375rem] leading-[1.05] font-semibold italic" style={{ fontFamily: 'var(--font-heading)' }}>
              Let’s<br />do it <ArrowRight className="inline size-3.5 translate-y-[-1px]" strokeWidth={2.25} />
            </span>
          </motion.button>
        </div>
        <div className="min-w-0 @[34rem]:pt-0.5">
          <p className="private-text line-clamp-2 text-[0.9375rem] font-semibold text-foreground">{next.title}</p>
          <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-pretty text-muted-foreground">{next.text}</p>
          {next.extra && <div className="mt-3 max-w-[60ch]">{next.extra}</div>}
        </div>
      </div>
    </div>
  )
}
