import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowLeftIcon from '@/components/ui/arrow-narrow-left-icon'
import ArrowNarrowRightIcon from '@/components/ui/arrow-narrow-right-icon'
import DoubleCheckIcon from '@/components/ui/double-check-icon'
import LibraryIcon from '@/components/ui/library-icon'
import StackIcon from '@/components/ui/stack-icon'
import BrainCircuitIcon from '@/components/ui/brain-circuit-icon'

import { MindflowEditor, TAGS } from '../mindflow'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { Button } from '@/components/ui/button'
import { findCaptures, findHeadings, follow, statusSaid } from '@/lib/capture-links'
import { dayOf, notes, type Day, type DayEntry } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { useLive, vigil, type Pin, type Task } from '@/lib/vigil'
import { RowMenu } from './row-menu'
import { taskMenu, useTaskNow } from './tasks-view'
import { sideMenu } from './open-today'
import { exampleDay } from '@/lib/examples'
import { Example } from './example'
import { useKept } from '@/lib/nav'
import { Island, Page, Rolling, Tip, Typed, toast, typing, Pressed } from './ui'
import { DayBanner } from './scenery'
import { DayBrief } from './day-brief'
import { DayMarks } from './milestones'
import { markDay } from '@/lib/milestones'
import { FlagTriangleRight } from 'lucide-react'
import { GoalStrip } from './goals-view'
import { GlossButton, GlossLine } from './gloss-line'
import { DaySessions } from './session-timeline'
import { Versions } from './note-extras'
import { ScaleSwitch, type Scale } from './periods-view'
import { dayKey, dayName, noon } from '../../../../main/dates'
import { AliveIcon } from '@/components/ui/alive-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import { useHere } from '@/lib/split'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowLeft = alive(ArrowNarrowLeftIcon)
const ArrowRight = alive(ArrowNarrowRightIcon)
const CheckCircle2 = alive(DoubleCheckIcon)
const Gem = alive(LibraryIcon)
const Inbox = alive(StackIcon)
const ListTodo = alive(CheckedIcon)
const Brain = alive(BrainCircuitIcon)

/** A day's date, as you would say it: "Monday 5 October". */
const named = (day: string): string => dayName(noon(day))
const shift = (day: string, by: number): string => dayKey(noon(day).add(by, 'day'))

/**
 * A page a day, the daily note: somewhere to write about the day, and below
 * it what the day held, written down by the app, not by you. The page exists
 * only once you write in it (or tick it reviewed); every day still shows what
 * happened. ← and → step through the days.
 */
export function DayView({ onOpen, start, onScale }: {
  onOpen?: (type: string, id: string) => void
  /** The day to open on, from a link to its page; today if not given. */
  start?: string
  onScale?: (scale: Scale) => void
}): React.JSX.Element {
  const valid = (to?: string): string => (to && /^\d{4}-\d{2}-\d{2}$/.test(to) && to <= dayOf() ? to : dayOf())
  const [day, setDay] = useState(valid(start))
  // The day on show is kept in the step, so Back finds the day you left.
  useKept('focus', day, (to) => setDay(valid(to)), dayOf())
  // Only this day's answer: on a quick ← or → the day before's lists, counts
  // and Reviewed would otherwise sit under this day's name for a moment.
  const read = useLive(() => notes.day(day), null as Day | null, [day])
  // A row's right click: a task's menu as on Today, a note's as in the sidebar.
  const tasks = useLive(vigil.tasks, [] as Task[])
  const pins = useLive(vigil.pins, [] as Pin[])
  const taskNow = useTaskNow()
  const data = read?.day === day ? read : null
  const today = dayOf()
  // The row a thought is being written under: one at a time, by its section,
  // since the same note can be both captured and dealt with in a day.
  const [glossing, setGlossing] = useState<string | null>(null)
  // An earlier version shown in place of the page; and the words read again
  // after one is restored, with a new key so the editor opens on them.
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  const [restored, setRestored] = useState<{ day: string; body: unknown; rev: number } | null>(null)
  // The tasks today's brief lists, done or not: the Done list below leaves them to it.
  const [listed, setListed] = useState<string[]>([])
  const go = (to: string): void => {
    if (to > today || to === day) return
    chime('page')
    setDay(to)
  }
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'ArrowLeft') go(shift(day, -1))
      else if (event.key === 'ArrowRight') go(shift(day, 1))
      else if (event.key === 't') go(today)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const tick = (): void => {
    const on = !data?.reviewed
    chime(on ? 'done' : 'off')
    void notes.saveDay(day, { reviewed: on }).then(() =>
      toast(on ? 'Day looked back on' : 'Tick taken off', () => void notes.saveDay(day, { reviewed: !on })))
  }
  // A first day with nothing in it: what the page gathers, shown with a made-up day under your own words.
  const example = !!data && data.day === day && day === today && !data.exists && !data.captured.length && !data.resolved.length && !data.studied.length && !data.done.length
  const held = example ? exampleDay(day) : data
  const sections: [string, typeof Inbox, DayEntry[]][] = held
    ? [['Captured', Inbox, held.captured], ['Dealt with', CheckCircle2, held.resolved], ['Studied', Brain, held.studied],
      ['Done', ListTodo, day === today ? held.done.filter((entry) => !(entry.type === 'task' && listed.includes(entry.id))) : held.done]]
    : []

  return (
    <Page
      title={day === today ? "Today's page" : 'Day page'}
      actions={
        <span className="flex items-center gap-1">
          <ScaleSwitch scale="day" onScale={onScale} />
          {onScale && <span aria-hidden className="mx-1 h-4 w-px bg-border" />}
          <Tip label="The day before  ←">
            <Button variant="ghost" size="icon-sm" aria-label="The day before" onClick={() => go(shift(day, -1))}><ArrowLeft className="size-3.5" /></Button>
          </Tip>
          <Tip label="The day after  →">
            <Button variant="ghost" size="icon-sm" aria-label="The day after" disabled={day >= today} onClick={() => go(shift(day, 1))}><ArrowRight className="size-3.5" /></Button>
          </Tip>
          {day !== today && <Button variant="ghost" size="sm" onClick={() => go(today)}>Today <Pressed keys="T" /></Button>}
          <Tip label="Name what this day is for, like Exam or Launch">
            <Button variant="ghost" size="sm" onClick={() => void markDay(day)}><FlagTriangleRight className="size-3.5" /> Mark</Button>
          </Tip>
          <Tip label={data?.reviewed ? 'You looked back over this day. Click to take the tick off' : 'Tick once you have looked back over this day'}>
          <Button variant={data?.reviewed ? 'secondary' : 'ghost'} size="sm" aria-pressed={!!data?.reviewed} onClick={tick}>
            <AliveIcon icon={CheckedIcon} size={14} /> <Rolling text={data?.reviewed ? 'Looked back' : 'Mark looked back'} by="word" />
          </Button>
          </Tip>
        </span>
      }
    >
      {/* Today opens as a brief: the day's picture and name, a line on what
          it holds, and its to-dos. The brief and the page under it share one
          centred column, so they read as one sheet; the margins either side
          hold the brief's date and time. Other days keep their strip. */}
      <div className={day === today ? 'page-sheet mx-auto w-full px-5' : undefined}>
      {day === today && <DayBrief day={day} onOpen={onOpen} onListed={setListed} />}
      {day === today && <GoalStrip onOpen={onOpen} className="mt-4 -mx-2" />}
      <div className={`${day === today ? '' : 'page-narrow mx-auto w-full px-5'} pt-6 pb-16 [--mf-padding:0.5rem_0]`}>
        {day !== today && <DayBanner day={day} />}
        {/* Today, the brief says the date (on its spine, or a line when narrow): this stays for screen readers. */}
        <h1 className={`text-title font-semibold ${day === today ? 'sr-only' : ''}`}><Rolling text={day === today ? `Today, ${named(day)}` : named(day)} by="word" /></h1>
        {/* What the day is marked for, if anything: a chip each, to change it. */}
        <DayMarks key={`marks-${day}`} day={day} />
        {data && !data.exists && (
          <p className="mt-1 text-meta text-muted-foreground"><Typed text="No page for this day yet. Write below and it keeps one." step={28} /></p>
        )}
        {/* Only once this day's words are in: a page that opened on the day
            before's would save them here. */}
        {data?.day === day && (
          <div className="mt-2 flex justify-end">
            <Versions table="day" id={`day:${day}`} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })}
              onRestored={() => void notes.day(day).then((fresh) => setRestored((was) => ({ day, body: fresh.body, rev: (was?.rev ?? 0) + 1 })))} />
          </div>
        )}
        {data?.day === day && past && (
          <MindflowEditor key={`past-${past.key}`} defaultContent={(past.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        )}
        {data?.day === day && !past && (
          <MindflowEditor
            key={`${day}-${restored?.day === day ? restored.rev : 0}`}
            host={window.api}
            tokens={TAGS}
            placeholder="How did the day go?"
            // Formatting on a selection only, as in every other page: a bar of its
            // own would sit over the first line.
            toolbar={{ fixed: false }}
            documentId={`day-${day}`}
            defaultContent={((restored?.day === day ? restored.body : data.body) as JSONContent | string | null) ?? ''}
            findNotes={findCaptures}
            findHeadings={findHeadings}
            onOpenNote={(link, heading) => onOpen && follow(link, onOpen, heading)}
            onTokenClick={(token) => token.name === 'tag' && onOpen?.('tag', token.value)}
            outline={false}
            autofocus={false}
            onChange={(body) => void notes.saveDay(day, { body })}
          />
        )}
        <Example on={example} flush className="mt-6" tryIt="write a line about your day above. What you catch, finish and review today gathers underneath on its own.">
        {/* Only what the day has: four headings over nothing say less than one line. */}
        {held && sections.every(([, , list]) => !list.length) && (
          <p data-day-nothing className="mt-6 text-body text-muted-foreground">{day === today ? 'What you capture, finish and study today gathers here.' : 'Nothing was captured, finished or studied that day.'}</p>
        )}
        {sections.filter(([, , list]) => list.length).map(([title, Icon, list]) => (
          <Island key={title} className="mt-6 first:mt-6" title={
            <span className="flex items-center gap-2">
              <Icon className="size-4 text-muted-foreground" /> {title} <span className="font-normal text-muted-foreground tabular-nums"><Rolling text={list.length} /></span>
            </span>
          }>
            {list.length ? list.map((entry) => {
              const kind = CAPTURE_TYPES.find((type) => type.id === entry.kind)
              const Mark = entry.type === 'task' ? ListTodo : entry.type === 'capture' ? kind?.icon ?? Inbox : Gem
              // A task takes no gloss: what you wrote does, captures and kept things alike.
              const glossable = entry.type !== 'task'
              return (
                <div key={`${title}-${entry.id}`} className="group/item relative">
                <RowMenu items={example || !onOpen ? [] : entry.type === 'task'
                  ? (() => { const task = tasks.find((one) => one.id === entry.id); return task ? taskMenu(task, { open: () => onOpen(entry.type, entry.id), now: taskNow }) : [] })()
                  : sideMenu(entry.type, entry.id, entry.title, { onOpen, pinned: pins.some((one) => one.id === entry.id), kind: entry.kind, status: entry.status })}>
                <button type="button" data-private={entry.private ? '' : undefined}
                  onClick={() => onOpen?.(entry.type, entry.id)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-accent/50">
                  <Mark className="size-4 shrink-0" style={kind && entry.type === 'capture' ? { color: kind.tint } : undefined} />
                  {/* Dealt with, it stays where it was made, struck through: the page keeps what you meant to do and that you did it. */}
                  <span className={`private-text flex-1 truncate ${title === 'Captured' && entry.status && entry.status !== 'open' ? 'text-muted-foreground line-through decoration-foreground/40' : ''}`}>{entry.title || 'Untitled'}</span>
                  {/* Why a row is struck or where it went, in words: never the stored status. */}
                  {entry.status && entry.status !== 'open' && !(title === 'Done' && entry.status === 'done') && <span className="text-xs text-muted-foreground">{({ done: 'Done', dropped: 'Closed without doing', closed: 'Closed' } as Record<string, string>)[entry.status] ?? statusSaid(entry.status)}</span>}
                  {glossable && <span aria-hidden className="w-6 shrink-0" />}
                </button>
                </RowMenu>
                {glossable && <GlossButton className="top-1.5 right-2" onClick={() => setGlossing(`${title}-${entry.id}`)} />}
                {glossing === `${title}-${entry.id}` && <GlossLine id={entry.id} open onDone={() => setGlossing(null)} className="px-4 pb-2" />}
                </div>
              )
            }) : <p className="px-4 py-2 text-sm text-muted-foreground">{day === today ? 'Nothing here yet today.' : 'Nothing that day.'}</p>}
          </Island>
        ))}
        {/* The focus sessions that ended this day, each with the timeline of what was logged in it. */}
        {!example && <DaySessions day={day} onOpen={onOpen} />}
        </Example>
      </div>
      </div>
    </Page>
  )
}
