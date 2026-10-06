import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { ArrowLeft, ArrowRight, CheckCircle2, Gem, Inbox, ListTodo, Brain } from 'lucide-react'

import { MindflowEditor, TAGS } from '../mindflow'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { Button } from '@/components/ui/button'
import { findCaptures, findHeadings, follow } from '@/lib/capture-links'
import { dayOf, notes, type Day, type DayEntry } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { useLive } from '@/lib/vigil'
import { Island, Kbd, Page, Rolling, Tip, Typed, toast, typing } from './ui'
import { DayBanner } from './scenery'
import { GlossButton, GlossLine } from './gloss-line'
import { Versions } from './note-extras'
import { ScaleSwitch, type Scale } from './periods-view'
import { dayKey, dayName, noon } from '../../../../main/dates'
import { AliveIcon } from '@/components/ui/alive-icon'
import CheckedIcon from '@/components/ui/checked-icon'

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
  const [day, setDay] = useState(start && /^\d{4}-\d{2}-\d{2}$/.test(start) && start <= dayOf() ? start : dayOf())
  const data = useLive(() => notes.day(day), null as Day | null, [day])
  const today = dayOf()
  // The row a thought is being written under: one at a time, by its section,
  // since the same note can be both captured and dealt with in a day.
  const [glossing, setGlossing] = useState<string | null>(null)
  // An earlier version shown in place of the page; and the words read again
  // after one is restored, with a new key so the editor opens on them.
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  const [restored, setRestored] = useState<{ day: string; body: unknown; rev: number } | null>(null)
  const go = (to: string): void => {
    if (to > today || to === day) return
    chime('page')
    setDay(to)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
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
      toast(on ? 'Day reviewed' : 'Not reviewed after all', () => void notes.saveDay(day, { reviewed: !on })))
  }
  const sections: [string, typeof Inbox, DayEntry[]][] = data
    ? [['Captured', Inbox, data.captured], ['Dealt with', CheckCircle2, data.resolved], ['Reviewed', Brain, data.studied], ['Done', ListTodo, data.done]]
    : []

  return (
    <Page
      title="Today's page"
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
          {day !== today && <Button variant="ghost" size="sm" onClick={() => go(today)}>Today <Kbd>T</Kbd></Button>}
          <Button variant={data?.reviewed ? 'secondary' : 'ghost'} size="sm" aria-pressed={!!data?.reviewed} onClick={tick}>
            <AliveIcon icon={CheckedIcon} size={14} /> <Rolling text={data?.reviewed ? 'Reviewed' : 'Mark reviewed'} by="word" />
          </Button>
        </span>
      }
    >
      <div className="page-narrow mx-auto w-full px-5 pt-6 pb-16 [--mf-padding:0.5rem_0]">
        <DayBanner day={day} />
        <h1 className="text-title font-semibold"><Rolling text={day === today ? `Today, ${named(day)}` : named(day)} by="word" /></h1>
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
        {sections.map(([title, Icon, list]) => (
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
                <button type="button" data-private={entry.private ? '' : undefined}
                  onClick={() => onOpen?.(entry.type, entry.id)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-accent/50">
                  <Mark className="size-4 shrink-0" style={kind && entry.type === 'capture' ? { color: kind.tint } : undefined} />
                  {/* Dealt with, it stays where it was made, struck through: the page keeps what you meant to do and that you did it. */}
                  <span className={`private-text flex-1 truncate ${title === 'Captured' && entry.status && entry.status !== 'open' ? 'text-muted-foreground line-through decoration-foreground/40' : ''}`}>{entry.title || 'Untitled'}</span>
                  {entry.status && title !== 'Captured' && <span className="text-xs text-muted-foreground">{entry.status}</span>}
                  {glossable && <span aria-hidden className="w-6 shrink-0" />}
                </button>
                {glossable && <GlossButton className="top-1.5 right-2" onClick={() => setGlossing(`${title}-${entry.id}`)} />}
                {glossing === `${title}-${entry.id}` && <GlossLine id={entry.id} open onDone={() => setGlossing(null)} className="px-4 pb-2" />}
                </div>
              )
            }) : <p className="px-4 py-2 text-xs text-muted-foreground">Nothing</p>}
          </Island>
        ))}
      </div>
    </Page>
  )
}
