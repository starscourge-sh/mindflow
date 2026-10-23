import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'

import { HaligtreeEditor, TAGS } from '../haligtree'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { Button } from '@/components/ui/button'
import { findCaptures, findHeadings, follow, statusSaid } from '@/lib/capture-links'
import { dayOf, notes, type Day, type DayEntry } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { unloaded, useLive, haligtree, type Pin, type Task } from '@/lib/haligtree'
import { RowMenu } from './row-menu'
import { taskMenu, useTaskNow } from './tasks-view'
import { sideMenu, useFullMenu } from './side-menu'
import { exampleDay } from '@/lib/examples'
import { Example } from './example'
import { useKept } from '@/lib/nav'
import { Island, Page, Rolling, Tags, Tip, typing, Pressed, quietly } from './ui'
import { PICKED_MARK, usePickMixed } from './pick-mixed'
import { taskName } from '@/lib/tasks'
import { DayBanner } from './scenery'
import { DayBrief } from './day-brief'
import { DayMarks } from './milestones'
import { markDay } from '@/lib/milestones'
import { FlagTriangleRight } from 'lucide-react'
import { GoalStrip } from './goals-view'
import { GlossButton, GlossLine } from './gloss-line'
import { DaySessions } from './session-timeline'
import { DayLog } from './day-log'
import { DayAhead } from './day-ahead'
import { DayMoments } from './day-moments'
import { useSeen } from '@/lib/reads-in'
import { Versions } from './note-extras'
import { ScaleSwitch, type Scale } from './periods-view'
import { dayKey, dayName, noon } from '../../../../main/dates'
import { AliveIcon } from '@/components/ui/alive-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import { useHere } from '@/lib/split'
import { ArrowLeft, ArrowRight, Brain, CheckCircle2, Gem, Inbox, ListTodo } from '@/components/ui/icons'

/** A day's date, as you would say it: "Monday 5 October". */
const named = (day: string): string => dayName(noon(day))
const shift = (day: string, by: number): string => dayKey(noon(day).add(by, 'day'))

/**
 * A page a day, the "Today" row: somewhere to write about the day on top, a
 * box that looks like one with the caret in it, then today's tasks under it,
 * then what the day held, written down by the app, not by you. Home folded
 * into it: what still matters from there sits at its foot (day-moments.tsx).
 * The page exists only once you write in it (or tick it reviewed); every day
 * still shows what happened. ← and → step through the days.
 */
export function DayView({ onOpen, start, onScale, onView }: {
  onOpen?: (type: string, id: string) => void
  /** A page by name, from the cards at the foot of today's page. */
  onView?: (id: string, focus?: string) => void
  /** The day to open on, from a link to its page; today if not given. */
  start?: string
  onScale?: (scale: Scale) => void
}): React.JSX.Element {
  const valid = (to?: string): string => (to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : dayOf())
  const [day, setDay] = useState(valid(start))
  // The day on show is kept in the step, so Back finds the day you left.
  useKept('focus', day, (to) => setDay(valid(to)), dayOf())
  // Only this day's answer: on a quick ← or → the day before's lists, counts
  // and Reviewed would otherwise sit under this day's name for a moment.
  const read = useLive(() => notes.day(day), null as Day | null, [day])
  // A row's right click: a task's menu as on Today, a note's as in the sidebar.
  const tasks = useLive(haligtree.tasks, [] as Task[])
  const pins = useLive(haligtree.pins, [] as Pin[])
  const fullMenu = useFullMenu()
  const taskNow = useTaskNow()
  const data = read?.day === day ? read : null
  const today = dayOf()
  // A day still to come: what is planned for it, not what it held.
  const ahead = day > today
  // The row a thought is being written under: one at a time, by its section,
  // since the same note can be both captured and dealt with in a day.
  const [glossing, setGlossing] = useState<string | null>(null)
  // An earlier version shown in place of the page; and the words read again
  // after one is restored, with a new key so the editor opens on them.
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  const [restored, setRestored] = useState<{ day: string; body: unknown; rev: number } | null>(null)
  // The tasks today's brief lists, done or not: the Done list below leaves them to it.
  const [listed, setListed] = useState<string[]>([])
  // The day's writing, once its editor is made: the caret goes in it as the page shows (CaretIn).
  const [writer, setWriter] = useState<Editor | null>(null)
  const go = (to: string): void => {
    if (to === day) return
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
      quietly(() => void notes.saveDay(day, { reviewed: !on })))
  }
  // A first day with nothing in it: what the page gathers, shown with a made-up day under your own words.
  const example = !!data && data.day === day && day === today && !data.exists && !data.captured.length && !data.resolved.length && !data.studied.length && !data.done.length
  const held = example ? exampleDay(day) : data
  const sections: [string, typeof Inbox, DayEntry[]][] = held
    ? [['Captured', Inbox, held.captured], ['Resolved', CheckCircle2, held.resolved], ['Studied', Brain, held.studied],
      ['Done', ListTodo, day === today ? held.done.filter((entry) => !(entry.type === 'task' && listed.includes(entry.id))) : held.done]]
    : []
  // Every row on the page picks as every list does: ⇧- or ⌘-click, x, ⌘A, ⌫ to the Bin with Undo, Esc.
  const several = usePickMixed(example || ahead ? [] : sections.flatMap(([, , list]) => list).map((entry) => ({ type: entry.type, id: entry.id, title: entry.title, private: entry.private, status: entry.status })), { here })

  const writing = (<>
        {/* Only once this day's words are in: a page that opened on the day
            before's would save them here. */}
        {data?.day === day && (
          <div className="mt-2 flex justify-end">
            <Versions table="day" id={`day:${day}`} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })}
              onRestored={() => void notes.day(day).then((fresh) => setRestored((was) => ({ day, body: fresh.body, rev: (was?.rev ?? 0) + 1 })))} />
          </div>
        )}
        {data?.day === day && past && (
          <HaligtreeEditor key={`past-${past.key}`} defaultContent={(past.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        )}
        {data?.day === day && !past && (
          // A box that reads as a place to type: its own surface and edge, the prompt inside it while empty, a click anywhere on it puts the caret in.
          <div data-day-write onClick={(event) => void (event.target === event.currentTarget && writer?.commands.focus('end'))}
            className="mt-2 min-h-36 cursor-text rounded-xl border border-border bg-background px-4 py-2 shadow-xs transition-colors focus-within:border-ring hover:border-foreground/25 [--mf-padding:0.25rem_0]">
          <HaligtreeEditor
            key={`${day}-${restored?.day === day ? restored.rev : 0}`}
            host={window.api}
            tokens={TAGS}
            placeholder={ahead ? 'Notes for this day: what you mean to do, who you will see' : day === today ? 'Write about today: what happened, what is on your mind' : 'How did the day go?'}
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
            onReady={setWriter}
            onChange={(body) => void notes.saveDay(day, { body })}
          />
          <CaretIn editor={writer} day={day} />
          </div>
        )}
  </>)
  return (
    <Page
      // The day's notes, its tasks and pins, and every part of the brief: drawn once all are in.
      waiting={!data || unloaded(tasks) || unloaded(pins)}
      title={day === today ? "Today's page" : 'Day page'}
      actions={
        <span className="flex items-center gap-1">
          <ScaleSwitch scale="day" onScale={onScale} />
          {onScale && <span aria-hidden className="mx-1 h-4 w-px bg-border" />}
          <Tip label="The day before  ←">
            <Button variant="ghost" size="icon-sm" aria-label="The day before" onClick={() => go(shift(day, -1))}><ArrowLeft className="size-3.5" /></Button>
          </Tip>
          <Tip label="The day after  →">
            <Button variant="ghost" size="icon-sm" aria-label="The day after" onClick={() => go(shift(day, 1))}><ArrowRight className="size-3.5" /></Button>
          </Tip>
          {/* Always here, greyed on today: nothing in the bar comes or goes as you step through the days. */}
          <Button variant="ghost" size="sm" disabled={day === today} onClick={() => go(today)}>Today <Pressed keys="T" /></Button>
          <Tip label="Name what this day is for, like Exam or Launch">
            <Button variant="ghost" size="sm" onClick={() => void markDay(day)}><FlagTriangleRight className="size-3.5" /> Mark</Button>
          </Tip>
          {/* Always here and one width, whichever it says; greyed on a day still to come. */}
          <Tip label={ahead ? 'A day still to come: look back once it has been' : data?.reviewed ? 'You looked back over this day. Click to take the tick off' : 'Tick once you have looked back over this day'}>
          <Button data-looked-back variant={data?.reviewed ? 'secondary' : 'ghost'} size="sm" disabled={ahead} aria-pressed={!!data?.reviewed} onClick={tick}>
            <AliveIcon icon={CheckedIcon} size={14} />
            <span className="grid [&>*]:col-start-1 [&>*]:row-start-1">
              <span aria-hidden className="invisible">Mark looked back</span>
              <Rolling text={data?.reviewed ? 'Looked back' : 'Mark looked back'} by="word" />
            </span>
          </Button>
          </Tip>
        </span>
      }
    >
      {/* Today opens as a brief: the day's picture and name, a line on what
          it holds, and its tasks. The brief and the page under it share one
          centred column, so they read as one sheet; the margins either side
          hold the brief's date and time. Other days keep their strip. */}
      <div className={day === today ? 'page-sheet mx-auto w-full px-5' : undefined}>
      {/* Today: the day's name, then its writing, then its tasks (the brief), then what Home kept for the moment. */}
      {day === today && <DayBrief day={day} onOpen={onOpen} onListed={setListed} between={
        <div className="pt-6">
          <h1 className="sr-only">{`Today, ${named(day)}`}</h1>
          <DayMarks key={`marks-${day}`} day={day} />
          {writing}
        </div>
      } />}
      {day === today && <GoalStrip onOpen={onOpen} className="mt-4 -mx-2" />}
      {day === today && <div className="mt-4"><DayMoments onOpen={onOpen} onView={onView} /></div>}
      <div className={`${day === today ? '' : 'page-narrow mx-auto w-full px-5'} pt-6 pb-16 [--mf-padding:0.5rem_0]`}>
        {day !== today && <DayBanner day={day} />}
        {/* Today, the brief says the date and its marks sit over the writing above. */}
        {day !== today && <h1 className="text-title font-semibold"><Rolling text={named(day)} by="word" /></h1>}
        {/* What the day is marked for, if anything: a chip each, to change it. */}
        {day !== today && <DayMarks key={`marks-${day}`} day={day} />}
        {day !== today && writing}
        {ahead && <DayAhead day={day} tasks={tasks} onOpen={onOpen} menuFor={(task) => (onOpen ? taskMenu(task, { open: () => onOpen('task', task.id), now: taskNow }) : [])} />}
        {/* The day as a time log: everything caught, dealt with, studied, done or dated, each at its time. */}
        {!ahead && !example && <DayLog day={day} given={data} onOpen={onOpen} className="mt-6" />}
        {!ahead && <Example on={example} flush className="mt-6" tryIt="write a line about your day above. What you catch, finish and review today gathers underneath on its own.">
        {/* Only what the day has: four headings over nothing say less than one line. */}
        {held && sections.every(([, , list]) => !list.length) && (
          <p data-day-nothing className="mt-6 text-body text-muted-foreground">{day === today ? 'What you capture, finish and study today gathers here.' : 'Nothing was captured, finished or studied that day.'}</p>
        )}
        {several.bar && <div data-pick-bar className="sticky top-0 z-20 mt-4 flex min-h-11 items-center border-b bg-background py-1.5">{several.bar}</div>}
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
                <RowMenu items={example || !onOpen ? [] : several.menu(entry) ?? [...(entry.type === 'task'
                  ? (() => { const task = tasks.find((one) => one.id === entry.id); return task ? taskMenu(task, { open: () => onOpen(entry.type, entry.id), now: taskNow }) : [] })()
                  : fullMenu(entry.type, entry.id, () => onOpen(entry.type, entry.id)) ?? sideMenu(entry.type, entry.id, entry.title, { onOpen, pinned: pins.some((one) => one.id === entry.id), kind: entry.kind, status: entry.status })), ...several.rowItems(entry)]}>
                <button type="button" data-private={entry.private ? '' : undefined}
                  data-pick={`${entry.type}:${entry.id}`} data-picked={several.picked(entry) || undefined}
                  onClick={(event) => several.click(event, entry) || onOpen?.(entry.type, entry.id)}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-accent/50 ${PICKED_MARK}`}>
                  <Mark className="size-4 shrink-0" style={kind && entry.type === 'capture' ? { color: kind.tint } : undefined} />
                  {/* Dealt with, it stays where it was made, struck through: the page keeps what you meant to do and that you did it. */}
                  {/* A task reads as it does in every list: its words without the #tags, the tags small and coloured after. */}
                  <span className={`private-text flex min-w-0 flex-1 items-center gap-1.5 ${title === 'Captured' && entry.status && entry.status !== 'open' ? 'text-muted-foreground line-through decoration-foreground/40' : ''}`}>
                    <span className="truncate">{(entry.type === 'task' ? taskName(entry.title).text : entry.title) || 'Untitled'}</span>
                    {entry.type === 'task' && <Tags tags={taskName(entry.title).tags} />}
                  </span>
                  {/* Why a row is struck or where it went, in words: never the stored status. */}
                  {entry.status && entry.status !== 'open' && !(title === 'Done' && entry.status === 'done') && <span className="text-xs text-muted-foreground">{({ done: 'Done', dropped: 'In the Bin', closed: 'Closed' } as Record<string, string>)[entry.status] ?? statusSaid(entry.status)}</span>}
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
        {!example && <DaySessions day={day} onOpen={onOpen} menuFor={(taskId) => { const task = tasks.find((one) => one.id === taskId); return task && onOpen ? taskMenu(task, { open: () => onOpen('task', taskId), now: taskNow }) : [] }} />}
        </Example>}
      </div>
      </div>
    </Page>
  )
}

/**
 * The caret in the day's writing once its page is on show, so you can just
 * start typing: once for each day opened, and never while you are typing
 * somewhere else (a search, a field). A button just clicked (the sidebar's
 * row) hands its keys over.
 */
function CaretIn({ editor, day }: { editor: Editor | null; day: string }): null {
  const seen = useSeen()
  const placed = useRef('')
  useEffect(() => {
    if (!seen || !editor || editor.isDestroyed || placed.current === day) return
    placed.current = day
    const frame = requestAnimationFrame(() => {
      const held = document.activeElement
      if (held?.matches('input, textarea, select, [contenteditable="true"]') && !held.closest('[data-day-write]')) return
      editor.commands.focus('end', { scrollIntoView: false })
    })
    return () => cancelAnimationFrame(frame)
  }, [seen, editor, day])
  return null
}
