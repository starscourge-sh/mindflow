import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Gem, Inbox, ListTodo, Brain } from 'lucide-react'

import { MindflowEditor, TAGS } from '../mindflow'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { Button } from '@/components/ui/button'
import { findCaptures, follow } from '@/lib/capture-links'
import { dayOf, notes, type Day, type DayEntry } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { useLive } from '@/lib/vigil'
import { Island, Kbd, Page, Rolling, Tip, Typed, toast, typing } from './ui'

/** A day's date, as you would say it: "Monday 5 October". */
const named = (day: string): string =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: day.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' })
const shift = (day: string, by: number): string => {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + by)
  return dayOf(date)
}

/**
 * A page a day, the daily note: somewhere to write about the day, and below
 * it what the day held, written down by the app, not by you. The page exists
 * only once you write in it (or tick it reviewed); every day still shows what
 * happened. ← and → step through the days.
 */
export function DayView({ onOpen }: { onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const [day, setDay] = useState(dayOf())
  const data = useLive(() => notes.day(day), null as Day | null, [day])
  const today = dayOf()
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
          <Tip label="The day before  ←">
            <Button variant="ghost" size="icon-sm" aria-label="The day before" onClick={() => go(shift(day, -1))}><ArrowLeft className="size-3.5" /></Button>
          </Tip>
          <Tip label="The day after  →">
            <Button variant="ghost" size="icon-sm" aria-label="The day after" disabled={day >= today} onClick={() => go(shift(day, 1))}><ArrowRight className="size-3.5" /></Button>
          </Tip>
          {day !== today && <Button variant="ghost" size="sm" onClick={() => go(today)}>Today <Kbd>T</Kbd></Button>}
          <Button variant={data?.reviewed ? 'secondary' : 'ghost'} size="sm" aria-pressed={!!data?.reviewed} onClick={tick}>
            <Check className="size-3.5" /> <Rolling text={data?.reviewed ? 'Reviewed' : 'Mark reviewed'} by="word" />
          </Button>
        </span>
      }
    >
      <div className="mx-auto w-full max-w-[44rem] px-5 pt-6 pb-16 [--mf-padding:0.5rem_0]">
        <h1 className="text-title font-semibold"><Rolling text={day === today ? `Today, ${named(day)}` : named(day)} by="word" /></h1>
        {data && !data.exists && (
          <p className="mt-1 text-meta text-muted-foreground"><Typed text="No page for this day yet. Write below and it keeps one." step={28} /></p>
        )}
        {/* Only once this day's words are in: a page that opened on the day
            before's would save them here. */}
        {data?.day === day && (
          <MindflowEditor
            key={day}
            host={window.api}
            tokens={TAGS}
            placeholder="How did the day go?"
            // Formatting on a selection only, as in every other page: a bar of its
            // own would sit over the first line.
            toolbar={{ fixed: false }}
            documentId={`day-${day}`}
            defaultContent={(data.body as JSONContent | string | null) ?? ''}
            findNotes={findCaptures}
            onOpenNote={(link) => onOpen && follow(link, onOpen)}
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
              return (
                <button key={`${title}-${entry.id}`} type="button" data-private={entry.private ? '' : undefined}
                  onClick={() => onOpen?.(entry.type, entry.id)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-accent/50">
                  <Mark className="size-4 shrink-0" style={kind && entry.type === 'capture' ? { color: kind.tint } : undefined} />
                  <span className="private-text flex-1 truncate">{entry.title || 'Untitled'}</span>
                  {entry.status && <span className="text-xs text-muted-foreground">{entry.status}</span>}
                </button>
              )
            }) : <p className="px-4 py-2 text-xs text-muted-foreground">Nothing</p>}
          </Island>
        ))}
      </div>
    </Page>
  )
}
