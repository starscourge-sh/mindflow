import { alive } from '@/components/ui/alive-icon'
import StackIcon from '@/components/ui/stack-icon'
import LibraryIcon from '@/components/ui/library-icon'
import ClockIcon from '@/components/ui/clock-icon'

import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { useLive, vigil, type DaySession, type LogEntry } from '@/lib/vigil'
import { rewordText } from './reword'
import { Island, Rolling, Tip } from './ui'

/**
 * A session's log as a timeline: what you noted, the context you gave it and
 * the pictures you added while it ran, each by the moment it was added.
 * Shown once the session is over, under it in the task's log and on the
 * day's page. One click on an entry opens the reword card on its words, to
 * keep as a capture or an idea.
 */

const Inbox = alive(StackIcon)
const Gem = alive(LibraryIcon)
const Timer = alive(ClockIcon)

/** 14:05, in the clock you read. */
export const clockTime = (at: string): string => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const PICTURE = /\.(png|jpe?g|gif|webp|avif|bmp|heic|svg)$/i

/** What an entry carries besides its words: a picture to look at, or a file to open. */
export function Attached({ entry, className }: { entry: LogEntry; className?: string }): React.JSX.Element | null {
  if (!entry.asset) return null
  if (PICTURE.test(entry.asset))
    return (
      <button type="button" onClick={() => void window.api.openFile(entry.asset!)} aria-label="Open the picture" className={cn('block overflow-hidden rounded-md border bg-accent/40', className)}>
        <img src={entry.asset} alt={entry.assetName ?? ''} draggable={false} className="block max-h-40 w-auto max-w-full object-contain" />
      </button>
    )
  return (
    <button type="button" onClick={() => void window.api.openFile(entry.asset!)} className={cn('inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground', className)}>
      <span className="truncate">{entry.assetName || 'File'}</span>
    </button>
  )
}

/** The timeline itself: a time on the left of each moment, a thread down through them. */
export function SessionTimeline({ entries, className }: { entries: LogEntry[]; className?: string }): React.JSX.Element | null {
  if (!entries.length) return null
  return (
    <ol data-session-log className={cn('relative ml-0.5 mt-1.5', className)}>
      {entries.map((entry, index) => (
        <li key={entry.id} data-log-entry className="group/entry relative grid grid-cols-[2.75rem_auto_minmax(0,1fr)] items-start gap-x-2 py-0.5">
          <time dateTime={entry.at} className="pt-px text-right text-xs text-muted-foreground tabular-nums">{clockTime(entry.at)}</time>
          <span aria-hidden className="relative flex h-full w-2 justify-center">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/70" />
            {index < entries.length - 1 && <span className="absolute top-3.5 -bottom-1.5 w-px bg-border" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-start gap-1">
              {entry.text && <p className="private-text min-w-0 flex-1 text-control whitespace-pre-line text-foreground wrap-break-word">{entry.text}</p>}
              {entry.text && (
                <span className="flex shrink-0 opacity-0 transition-opacity duration-150 group-hover/entry:opacity-100 focus-within:opacity-100">
                  <Tip label="Keep as a capture">
                    <button type="button" aria-label="Keep as a capture" onClick={() => rewordText('capture', entry.text, { said: 'In your inbox' })}
                      className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-3.5"><Inbox /></button>
                  </Tip>
                  <Tip label="Keep as a gem">
                    <button type="button" aria-label="Keep as a gem" onClick={() => rewordText('nugget', entry.text)}
                      className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-3.5"><Gem /></button>
                  </Tip>
                </span>
              )}
            </div>
            <Attached entry={entry} className={entry.text ? 'mt-1' : ''} />
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Time worked in a session, the way you would say it: 25 min, 1 h 20 min. */
const spent = (one: DaySession): string => {
  const minutes = Math.max(1, Math.round((new Date(one.endedAt).getTime() - new Date(one.startedAt).getTime() - one.pausedMs) / 60000))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
}

/**
 * The day's page: each focus session that ended that day, from when to when,
 * with its timeline. Nothing worked on, nothing shown.
 */
export function DaySessions({ day, onOpen }: { day: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const sessions = useLive(() => vigil.daySessions(day), [] as DaySession[], [day])
  if (!sessions.length) return null
  return (
    <Island className="mt-6" title={
      <span className="flex items-center gap-2">
        <Timer className="size-4 text-muted-foreground" /> Sessions <span className="font-normal text-muted-foreground tabular-nums"><Rolling text={sessions.length} /></span>
      </span>
    }>
      {sessions.map((one) => (
        <div key={one.id} data-day-session={one.id} className="px-4 py-2">
          <button type="button" onClick={() => (chime('tap'), onOpen?.('task', one.taskId))} className="flex w-full items-baseline gap-2 text-left text-sm hover:underline decoration-foreground/30 underline-offset-2">
            <span className="private-text min-w-0 flex-1 truncate font-medium">{one.title || 'Focus'}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{clockTime(one.startedAt)} to {clockTime(one.endedAt)} · {spent(one)}</span>
          </button>
          {one.recap?.trim() && <p className="private-text mt-0.5 text-control text-muted-foreground">{one.recap}</p>}
          <SessionTimeline entries={one.entries} />
        </div>
      ))}
    </Island>
  )
}
