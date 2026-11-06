import { ListChecks, UserRound } from 'lucide-react'
import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'
import { call, useLive } from '@/lib/haligtree'
import { aimAt } from '@/lib/meeting'

type OpenItem = { note: string; meeting: string; held: string; id: string; text: string; owner: string; date: string | null; at: number }

/**
 * A meeting's action items still open (not ticked, not yet a task), on Today and the week: each with who owns it and
 * the meeting it came from, opened on the meeting, where it is ticked or made a task.
 */
export function MeetingItems({ since, onOpen, className }: { since: string; onOpen: (type: string, id: string) => void; className?: string }): React.JSX.Element | null {
  const items = useLive(() => call<OpenItem[]>('meeting:open-items', since), [] as OpenItem[], [since])
  if (!items.length) return null
  return (
    <section data-meeting-open-items className={className}>
      <h2 className="mb-1 flex items-center gap-1.5 text-body font-semibold text-foreground"><ListChecks className="size-4" />From your recordings<span className="text-control font-normal text-muted-foreground tabular-nums">{num(items.length)}</span></h2>
      <ul className="divide-y divide-border/50">
        {items.slice(0, 12).map((item) => (
          <li key={`${item.note}-${item.id}`}>
            <button type="button" data-meeting-open-item={item.id} onClick={() => (chime('open'), aimAt(item.note, undefined), onOpen('capture', item.note))}
              className="flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50 -mx-2">
              <span className="text-[0.9375rem] text-foreground">{item.text}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-medium text-foreground/80"><UserRound className="size-3" />{item.owner}</span>
                {item.date && <span>{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
                <span className="min-w-0 truncate">{item.meeting}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
