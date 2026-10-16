import type { CSSProperties } from 'react'
import { chime } from '@/lib/sound'
import { useLive, vigil, type SpanSession } from '@/lib/vigil'
import { TIME_COLUMN, clock } from '@/lib/clock'
import { RowMenu, type RowItem } from './row-menu'
import { Tip, toast } from './ui'

/**
 * A focus session in time: when it began and when it ends. A running one
 * ends when its time left runs out from now, so a pause, ten more minutes
 * or a break moves it; an ended one ended when it did. Null with no length.
 */
export const sessionEnd = (one: { startedAt: string; plannedMs: number | null; pausedMs: number; pausedAt: string | null; endedAt?: string | null }, now = Date.now()): number | null => {
  if (one.endedAt) return Date.parse(one.endedAt)
  if (!one.plannedMs) return null
  const worked = now - Date.parse(one.startedAt) - one.pausedMs - (one.pausedAt ? now - Date.parse(one.pausedAt) : 0)
  return now + one.plannedMs - worked
}

/** "21:24 → 21:49", in the clock you read: a session's start and end, under its time. */
export function SpanPill({ from, to, className = '' }: { from: number; to: number | null; className?: string }): React.JSX.Element {
  const said = `${clock(from)} → ${to === null ? 'no end set' : clock(to)}`
  return (
    <Tip label={to === null ? `Started at ${clock(from)}, with no end set` : `From ${clock(from)} to ${clock(to)}`}>
      <span data-span-pill className={`inline-flex h-6 shrink-0 items-center rounded-full bg-accent px-2.5 text-[12px] font-semibold whitespace-nowrap text-foreground tabular-nums ${className}`}>
        {said}
      </span>
    </Tip>
  )
}

/** The focus sessions that touch a stretch of time, running or ended; read again as anything changes. */
export const useSessionsSpan = (from: number, to: number): SpanSession[] =>
  useLive(() => vigil.sessionsSpan(new Date(from).toISOString(), new Date(to).toISOString()), [] as SpanSession[], [from, to])

/**
 * A session's block: running, in the accent's diagonal stripes (the time
 * still ahead of it); ended, a plain faint block. Right-click opens it or,
 * while it runs, ends it early.
 */
const STRIPES: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, color-mix(in oklab, var(--tt-brand-color-400) 34%, var(--background)) 0 5px, color-mix(in oklab, var(--tt-brand-color-400) 10%, var(--background)) 5px 10px)'
}
const FAINT: CSSProperties = { background: 'color-mix(in oklab, var(--tt-brand-color-400) 9%, var(--background))' }

const sessionMenu = (one: SpanSession): RowItem[] => [
  { label: 'Open the session', hint: 'Its task, with this session in its log', run: () => (chime('open'), window.api.openInHome('task', one.taskId)) },
  !one.endedAt && {
    label: 'End it early', hint: 'Ends it now and counts the time so far',
    run: () => void vigil.endSession(one.id, '', false).then(() => {
      chime('done')
      toast('Session ended early, its time counted', () => void vigil.unendSession(one.id).then((back) => (back ? (chime('back'), window.api.showFocus(true)) : chime('nope'))))
    })
  }
]

/** What a block says under its name: from and to, and how it stands. */
const standing = (one: SpanSession, end: number | null, now: number): string => {
  const to = end === null ? 'no end set' : clock(end)
  if (one.endedAt) return `${clock(one.startedAt)} to ${to} · Done`
  if (one.pausedAt) return `${clock(one.startedAt)} to ${to} · Paused`
  return `${clock(one.startedAt)} to ${to} · ${end !== null && end <= now ? "Time's up" : 'Now'}`
}

/** A session in Today's line by the hour: the time on the left, as an event's is, and its block. */
export function SessionRow({ one, now }: { one: SpanSession; now: number }): React.JSX.Element {
  const end = sessionEnd(one, now)
  const running = !one.endedAt
  return (
    <RowMenu items={sessionMenu(one)}>
      <li data-line-session={one.id} data-running={running || undefined} className="flex items-start gap-3 py-1">
        <span className={`${TIME_COLUMN} shrink-0 pt-1.5 text-right text-sm text-muted-foreground tabular-nums`}>{clock(one.startedAt)}</span>
        <button type="button" onClick={() => (chime('open'), window.api.openInHome('task', one.taskId))}
          data-session-block style={running ? STRIPES : FAINT}
          className={`min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-left ring-1 ring-inset transition-[filter] hover:brightness-[0.98] ${running ? 'ring-[color-mix(in_oklab,var(--tt-brand-color-400)_45%,transparent)]' : 'ring-[color-mix(in_oklab,var(--tt-brand-color-400)_18%,transparent)]'}`}>
          {/* Full ink over the stripes: anything fainter falls under 4.5:1 on Paper's. */}
          <span data-session-name className={`block truncate text-[0.9375rem] font-semibold ${running ? 'text-foreground' : 'text-foreground/80'}`}>{one.title || 'Focus'}</span>
          <span data-session-when className="mt-0.5 block truncate text-sm text-foreground tabular-nums">Focus session · {standing(one, end, now)}</span>
        </button>
      </li>
    </RowMenu>
  )
}

/** A session in a day of the week: small, its start and name, in the same stripes or faint block. */
export function SessionChip({ one, now }: { one: SpanSession; now: number }): React.JSX.Element {
  const end = sessionEnd(one, now)
  const running = !one.endedAt
  return (
    <RowMenu items={sessionMenu(one)}>
      <button type="button" data-week-session={one.id} data-running={running || undefined} onClick={() => (chime('open'), window.api.openInHome('task', one.taskId))}
        style={running ? STRIPES : FAINT}
        className={`flex w-full min-w-0 flex-col items-start rounded-md px-2 py-1 text-left text-xs ring-1 ring-inset ${running ? 'ring-[color-mix(in_oklab,var(--tt-brand-color-400)_45%,transparent)]' : 'ring-[color-mix(in_oklab,var(--tt-brand-color-400)_18%,transparent)]'}`}>
        {/* The tip on the words inside: the right-click menu needs the button itself. */}
        <Tip label={`Focus session: ${one.title || 'Focus'}, ${standing(one, end, now)}`}>
          <span className="flex w-full min-w-0 flex-col items-start">
            {/* A narrow week wraps these, never cuts them to a letter or two. */}
            <span data-session-name className="line-clamp-2 w-full font-semibold break-words text-foreground">{one.title || 'Focus'}</span>
            <span data-session-when className="w-full text-foreground tabular-nums">{clock(one.startedAt)} <span className="whitespace-nowrap">to {end === null ? 'no end' : clock(end)}</span></span>
          </span>
        </Tip>
      </button>
    </RowMenu>
  )
}
