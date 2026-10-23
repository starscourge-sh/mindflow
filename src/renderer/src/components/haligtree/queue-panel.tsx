import { ListStart } from 'lucide-react'
import { cn } from '@/lib/cn'
import { kindOf, saidOf, type QueueRow } from '@/lib/reading-queue'
import { taskName } from '@/lib/tasks'
import { ago, num } from '../../../../main/dates'
import { X } from '@/components/ui/icons'
import { RowMenu } from './row-menu'
import { ROW_PAD, ROW_SHAPE, ROW_TILE, tileTint } from './row-shape'
import { SortableList, SortableRow } from './sortable'
import { Tip } from './ui'

/**
 * The queue beside the page while it is read, Spotify's way: what you are
 * reading now, what comes up next (click to go there, drag to reorder,
 * right-click to take one out), and what you read before it this time.
 */
export function QueuePanel({ queue, at, read, onJump, onMove, onRemove, onClose }: {
  queue: QueueRow[]
  at: number
  read: Set<string>
  onJump: (at: number) => void
  onMove: (id: string, target: string, after: boolean) => void
  onRemove: (row: QueueRow) => void
  onClose: () => void
}): React.JSX.Element {
  const now = queue[at]
  const next = queue.slice(at + 1)
  const before = queue.slice(0, at)
  return (
    <aside
      data-queue-panel=""
      aria-label="Queue"
      // Narrow, as quick capture's panel is: rows fill it, their words 8px in from the row's edge.
      style={{ '--list-edge': '0px', '--list-ink': '0.5rem' } as React.CSSProperties}
      className="absolute top-12 right-3 bottom-3 z-20 flex w-[19rem] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-(--mf-shadow-lift) [-webkit-app-region:no-drag]"
    >
      <header className="flex shrink-0 items-center justify-between py-2 pr-2 pl-4">
        <h2 className="text-body font-semibold">Queue</h2>
        <Tip label="Hide the queue  ⇧⌘U">
          <button type="button" aria-label="Hide the queue" onClick={onClose} className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </Tip>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Heading>Now reading</Heading>
        {now && <div data-queue-now={now.id}><Line row={now} now read={read.has(now.id)} /></div>}
        <Heading>Up next{next.length > 0 && <span className="ml-1.5 font-normal tabular-nums">{num(next.length)}</span>}</Heading>
        {next.length ? (
          <div data-queue-next="">
            <SortableList items={next} keyOf={(row) => row.id} onMove={onMove}>
              {(rows) => rows.map((row) => (
                <SortableRow key={row.id} id={row.id}>
                  <RowMenu items={[
                    { label: 'Read it now', keys: '↵', run: () => onJump(queue.indexOf(row)) },
                    'separator',
                    { label: 'Take out of queue', danger: true, run: () => onRemove(row) }
                  ]}>
                    <Line row={row} read={read.has(row.id)} grab onClick={() => onJump(queue.indexOf(row))} />
                  </RowMenu>
                </SortableRow>
              ))}
            </SortableList>
          </div>
        ) : <p className="list-ink py-1 text-meta text-muted-foreground">Nothing after this one</p>}
        {before.length > 0 && (
          <>
            <Heading>Read before</Heading>
            <div data-queue-before="">
              {before.map((row, n) => (
                <RowMenu key={row.id} items={[
                  { label: 'Go back to it', keys: '↵', run: () => onJump(n) },
                  'separator',
                  { label: 'Take out of queue', danger: true, run: () => onRemove(row) }
                ]}>
                  <Line row={row} read={read.has(row.id)} onClick={() => onJump(n)} />
                </RowMenu>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

function Heading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h3 className="mt-3 mb-1 flex items-baseline list-ink text-meta font-medium text-muted-foreground first:mt-0">{children}</h3>
}

/** One entry (the right-click menu's trigger, so it takes the menu's props): its kind's tile, its name, and what it is and when it was queued. */
function Line({ row, now, read, grab, onClick, ...menu }: { row: QueueRow; now?: boolean; read: boolean; grab?: boolean; onClick?: () => void } & React.HTMLAttributes<HTMLElement>): React.JSX.Element {
  const kind = kindOf(row)
  const name = taskName(row.title).text
  const body = (
    <>
      <span className={ROW_TILE} style={tileTint(kind?.tint)}>
        {kind ? <kind.icon className="size-4" style={{ color: kind.tint }} /> : <ListStart className="size-4 text-muted-foreground" />}
      </span>
      <span className="min-w-0 flex-1">
        <span data-private={row.private ? '' : undefined} className={cn('private-text block truncate text-body', now ? 'font-semibold text-foreground' : 'text-foreground')}>{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{saidOf(row)} · added {ago(row.addedAt)}{read ? ' · read' : ''}</span>
      </span>
    </>
  )
  if (!onClick) return <div data-queue-line={row.id} className={cn(ROW_SHAPE, ROW_PAD, 'bg-accent/60')}>{body}</div>
  return (
    <button type="button" {...menu} data-queue-line={row.id} onClick={onClick}
      className={cn(ROW_SHAPE, ROW_PAD, 'transition-colors duration-80 hover:bg-accent/50', grab && 'cursor-grab', read && 'opacity-70')}>
      {body}
    </button>
  )
}
