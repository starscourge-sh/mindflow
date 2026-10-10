import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, GripVertical, ListEnd, ListStart, RotateCcw } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import XIcon from '@/components/ui/x-icon'

import { chime } from '@/lib/sound'
import { EASE } from '@/lib/motion'
import { unloaded } from '@/lib/vigil'
import { dequeue, enqueue, openLink, readQueue, readingQueue, useQueue, type QueueRow } from '@/lib/reading-queue'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { Button } from '@/components/ui/button'
import { ProgressBar } from './progress-bar'
import { Highlight, useFluidHover } from './glide'
import { ReadThrough } from './read-through'
import { RowMenu, type MenuItem } from './row-menu'
import { SortableList, SortableRow } from './sortable'
import { Empty, Island, Page, Rolling, Tip, toast } from './ui'
import { ago, dayMonth, num } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const X = alive(XIcon)

/**
 * The reading queue, in the main window: what you mean to read next, in
 * order, Spotify's way. Drag to reorder, × or a swipe sideways to take one
 * off, Start reading to read it through, one after the other. What was read
 * waits under Read, dated.
 */

const TIER: Record<string, string> = { nugget: 'Idea', article: 'Writing', question: 'Question' }
/** What it is, in a word: its kind for a capture, its tier for a kept thing. */
const kindOf = (row: QueueRow): (typeof CAPTURE_TYPES)[number] | undefined => CAPTURE_TYPES.find((one) => one.id === row.kind)
const saidOf = (row: QueueRow): string => (row.bare && row.url ? hostOf(row.url) : row.type === 'capture' ? kindOf(row)?.label ?? 'Note' : TIER[row.type] ?? 'Note')
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'A link'
  }
}

/**
 * How far through the queue you are: the ones read since the oldest one still
 * waiting was added, out of those and the ones waiting. "4 of 12".
 */
export function progressOf({ queue, read }: { queue: QueueRow[]; read: QueueRow[] }): { done: number; total: number } {
  if (!queue.length) return { done: 0, total: 0 }
  const since = queue.reduce((first, row) => (row.addedAt < first ? row.addedAt : first), queue[0].addedAt)
  const done = read.filter((row) => row.addedAt >= since).length
  return { done, total: done + queue.length }
}

/** Open one entry: a link that is only a link in the browser, anything else read from there on. */
const play = (rows: QueueRow[], at: number): void => {
  const row = rows[at]
  if (!row) return
  if (row.bare && row.url) return openLink(row)
  readQueue(at)
}

/** Swiped sideways on a trackpad, far enough: off the queue. A short swipe springs back. */
function useSwipeOff(onOff: () => void): { x: number; onWheel: (event: React.WheelEvent) => void } {
  const [x, setX] = useState(0)
  const pushed = useRef(0)
  const rest = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(rest.current), [])
  const onWheel = (event: React.WheelEvent): void => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
    pushed.current = Math.max(-220, Math.min(220, pushed.current - event.deltaX))
    setX(pushed.current)
    clearTimeout(rest.current)
    if (Math.abs(pushed.current) > 140) {
      pushed.current = 0
      setX(0)
      return onOff()
    }
    rest.current = setTimeout(() => ((pushed.current = 0), setX(0)), 140)
  }
  return { x, onWheel }
}

function QueueLine({ row, at, rows }: { row: QueueRow; at: number; rows: QueueRow[] }): React.JSX.Element {
  const kind = kindOf(row)
  const swipe = useSwipeOff(() => void dequeue(row))
  const menu: MenuItem[] = [
    { label: row.bare ? 'Open the page' : 'Read from here', keys: '↵', run: () => play(rows, at) },
    at > 0 && { label: 'Read next', run: () => void enqueue([row.itemId], true) },
    { label: 'Open', run: () => window.api.openInHome(row.type, row.itemId) },
    'separator',
    { label: 'Read', run: () => void readingQueue.done(row.id).then(() => (chime('done'), toast('Moved to Read', () => void readingQueue.undone(row.id)))) },
    { label: 'Take off the queue', danger: true, run: () => void dequeue(row) }
  ]
  return (
    <RowMenu items={menu}>
      <div data-row data-id={row.itemId} data-queue-row={row.id} data-private={row.private ? '' : undefined} onWheel={swipe.onWheel}
        className="group/q relative flex cursor-grab items-center gap-3 rounded-md px-3 py-2 transition-[background-color,transform,opacity] duration-150 hover:bg-accent/50"
        style={{ transform: swipe.x ? `translateX(${swipe.x}px)` : undefined, opacity: swipe.x ? 1 - Math.min(0.6, Math.abs(swipe.x) / 300) : undefined, transition: swipe.x ? 'none' : undefined }}>
        {/* Its place in line; pointed at, a grip in its place, since the row drags. */}
        <span className="relative w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          <span className="transition-opacity duration-150 group-hover/q:opacity-0">{at + 1}</span>
          <GripVertical aria-hidden className="absolute top-1/2 right-0 size-3.5 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover/q:opacity-100" />
        </span>
        <button type="button" onClick={() => play(rows, at)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none">
          {kind ? <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} /> : <ListStart className="size-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1">
            <span className="private-text block truncate text-body text-foreground">{row.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{saidOf(row)} · added {ago(row.addedAt)}{row.bare ? ' · opens in your browser' : ''}</span>
          </span>
        </button>
        <Tip label="Take it off the queue">
          <button type="button" aria-label="Take it off the queue" onClick={() => void dequeue(row)}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/q:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
            <X className="size-3.5" />
          </button>
        </Tip>
      </div>
    </RowMenu>
  )
}

/** The Queue page: the queue to read next, how far through it you are, and what was read. */
export function QueueView(): React.JSX.Element {
  const all = useQueue()
  const { queue, read } = all
  const { done, total } = progressOf(all)
  const loading = unloaded(all)
  return (
    <Page title="Queue" count={queue.length} unit={['to read', 'to read']}
      actions={queue.length > 0 && (
        <span className="flex items-center gap-1">
          <Button size="sm" onClick={() => readQueue(0)}><BookOpen className="size-3.5" /> Start reading</Button>
        </span>
      )}>
      <div className="page-narrow mx-auto w-full px-5 pt-6 pb-16">
        {!loading && !queue.length && !read.length ? (
          <Empty shape={['ellipse', 1]} title="Nothing queued yet">
            Right-click any note, idea or piece of writing and choose Add to queue, or Read next to read it first. Then read them one after the other.
          </Empty>
        ) : (
          <>
            {queue.length > 0 ? (
              <div data-queue-progress className="mb-5 flex flex-col gap-2">
                <p className="flex items-baseline gap-2 text-body">
                  <span className="font-semibold text-foreground tabular-nums"><Rolling text={done} /> of <Rolling text={total} /></span>
                  <span className="text-muted-foreground">read</span>
                </p>
                <ProgressBar value={total ? done / total : 0} label={`${num(done)} of ${num(total)} read`} thick={3} />
              </div>
            ) : (
              <p className="mb-5 text-body text-muted-foreground">The queue is empty: everything in it has been read.</p>
            )}
            {queue.length > 0 && (
              <Island title="Up next">
                <SortableList items={queue} keyOf={(row) => row.id} onMove={(id, target, after) => void readingQueue.move(id, target, after).then(() => chime('settled'))}>
                  {(rows) => rows.map((row, at) => (
                    <SortableRow key={row.id} id={row.id}><QueueLine row={row} at={at} rows={rows} /></SortableRow>
                  ))}
                </SortableList>
              </Island>
            )}
            {read.length > 0 && (
              <Island className="mt-8" title={<span className="flex items-center gap-2">Read <span className="font-normal text-muted-foreground tabular-nums">{num(read.length)}</span></span>}
                actions={<Button variant="ghost" size="sm" onClick={() => void readingQueue.forget().then(() => (chime('away'), toast('Read is cleared')))}>Clear</Button>}>
                <AnimatePresence initial={false}>
                  {read.slice(0, 50).map((row) => {
                    const kind = kindOf(row)
                    return (
                      <motion.div key={row.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16, ease: EASE }}
                        data-read-row data-private={row.private ? '' : undefined} className="group/r flex items-center gap-3 px-3 py-2">
                        {kind ? <kind.icon className="size-4 shrink-0 opacity-60" style={{ color: kind.tint }} /> : <ListStart className="size-4 shrink-0 text-muted-foreground" />}
                        <button type="button" onClick={() => window.api.openInHome(row.type, row.itemId)} className="private-text min-w-0 flex-1 truncate text-left text-body text-muted-foreground hover:text-foreground">{row.title}</button>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{dayMonth(row.doneAt!)}</span>
                        <Tip label="Back on the queue, to read next">
                          <button type="button" aria-label="Read it again" onClick={() => void readingQueue.undone(row.id).then(() => chime('undo'))}
                            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/r:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
                            <RotateCcw className="size-3.5" />
                          </button>
                        </Tip>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </Island>
            )}
          </>
        )}
      </div>
    </Page>
  )
}

/**
 * The queue, small: on Home, the next few to read and Start reading. Nothing
 * while the queue is empty.
 */
export function QueuePanel({ onView, className = '' }: { onView: (id: string) => void; className?: string }): React.JSX.Element | null {
  const all = useQueue()
  const { queue } = all
  // One light over the rows, gliding to the nearest, as Home's other lists do.
  const rows = useRef<HTMLOListElement>(null)
  const hover = useFluidHover(rows, { items: '[data-queue-next]' })
  if (!queue.length) return null
  return (
    <section data-queue-panel aria-label="Your reading queue" className={`flex flex-col gap-1 rounded-xl border bg-[color-mix(in_oklab,var(--foreground)_2.5%,transparent)] p-2 ${className}`}>
      <div className="flex items-center gap-2 px-1.5 pt-0.5">
        <ListStart className="size-4 shrink-0 text-[var(--tt-color-text-blue)]" />
        <button type="button" onClick={() => (chime('open'), onView('queue'))} className="truncate text-control font-semibold whitespace-nowrap text-foreground hover:underline hover:decoration-foreground/30 hover:underline-offset-4">Up next to read</button>
        <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">{num(queue.length)} to read</span>
        <Tip label={<span className="flex items-center gap-2">Read the queue, one after the other</span>}>
          <Button size="sm" className="ml-auto" onClick={() => readQueue(0)}><BookOpen className="size-3" /> Start reading</Button>
        </Tip>
      </div>
      <ol ref={rows} {...hover.handlers} className="relative isolate flex flex-col">
        <Highlight spot={hover.spot} session={hover.session} snap={hover.snap} className="bg-foreground/[0.045]" />
        {queue.slice(0, 3).map((row, at) => {
          const kind = kindOf(row)
          return (
            <li key={row.id}>
              <button type="button" data-queue-next data-private={row.private ? '' : undefined} onClick={() => play(queue, at)}
                className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-control">
                <span className="w-3 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{at + 1}</span>
                {kind ? <kind.icon className="size-3.5 shrink-0" style={{ color: kind.tint }} /> : <ListStart className="size-3.5 shrink-0 text-muted-foreground" />}
                <span className="private-text min-w-0 flex-1 truncate text-foreground">{row.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{saidOf(row)}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {queue.length > 3 && (
        <button type="button" onClick={() => (chime('open'), onView('queue'))} className="flex items-center gap-1.5 self-start rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground">
          <ListEnd className="size-3" /> and {num(queue.length - 3)} more
        </button>
      )}
    </section>
  )
}

/**
 * Reading the queue, over the main window: asked for by Start reading from
 * anywhere (lib/reading-queue.ts, readQueue). The queue as it was when you
 * started, so taking one off on the way never shifts the page under you.
 */
export function QueueReader(): React.JSX.Element | null {
  const [reading, setReading] = useState<{ rows: QueueRow[]; start: number } | null>(null)
  useEffect(() => {
    const onRead = (event: Event): void => {
      const { start } = (event as CustomEvent<{ start: number }>).detail
      void readingQueue.list().then(({ queue }) => queue.length && setReading({ rows: queue, start: Math.min(start, queue.length - 1) }))
    }
    window.addEventListener('vigil:queue-read', onRead)
    return () => window.removeEventListener('vigil:queue-read', onRead)
  }, [])
  if (!reading) return null
  return (
    <ReadThrough
      queue={reading.rows}
      items={reading.rows.map((row) => ({ type: row.type, id: row.itemId }))}
      start={reading.start}
      onClose={() => setReading(null)}
    />
  )
}
