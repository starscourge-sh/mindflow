import { useEffect, useRef, useState } from 'react'
import { useReading } from '@/lib/reads-in'
import { X as Clear } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, GripVertical, ListEnd, ListStart, RotateCcw } from 'lucide-react'

import { chime } from '@/lib/sound'
import { EASE } from '@/lib/motion'
import { unloaded } from '@/lib/haligtree'
import { dequeue, enqueue, finishAll, openLink, readQueue, readingQueue, useQueue, type QueueRow } from '@/lib/reading-queue'
import { useSelectAll } from '@/lib/select-all'
import { useHere } from '@/lib/split'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { Button } from '@/components/ui/button'
import { ProgressBar } from './progress-bar'
import { Highlight, useFluidHover } from './glide'
import { ReadThrough } from './read-through'
import { RowMenu, copy, type MenuItem } from './row-menu'
import { SortableList, SortableRow } from './sortable'
import { Empty, Island, Page, Rolling, Tags, Tip, toast, typing, useListKeys } from './ui'
import { taskName } from '@/lib/tasks'
import { PICKED_MARK } from './pick-mixed'
import { listInFront, useListScope } from '@/lib/list-front'
import { Rest } from './scenery'
import { ago, dayMonth, num } from '../../../../main/dates'
import { X } from '@/components/ui/icons'

/**
 * The reading queue, in the main window: what you mean to read next, in
 * order, Spotify's way. Drag to reorder, × or a swipe sideways to take one
 * off, Start reading to read it through, one after the other. What was read
 * waits under Read, dated.
 */

const TIER: Record<string, string> = { nugget: 'Gem', article: 'Article', question: 'Question' }
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

/** Picking several in the queue: what is picked, and what a row's click and menu do with it. */
type Picking = {
  picked: boolean
  cursor: boolean
  /** ⌘-click picks one more, ⇧-click a run, as in Finder. */
  onPickClick: (event: React.MouseEvent) => boolean
  /** The menu for every picked row, when this one is among several picked. */
  menu: MenuItem[] | null
  /** Select, Select all, for a single row's menu. */
  rowItems: MenuItem[]
}

function QueueLine({ row, at, rows, pick }: { row: QueueRow; at: number; rows: QueueRow[]; pick: Picking }): React.JSX.Element {
  const kind = kindOf(row)
  const swipe = useSwipeOff(() => void dequeue(row))
  const menu: MenuItem[] = pick.menu ?? [
    { label: row.bare ? 'Open the page' : 'Read from here', keys: '↵', run: () => play(rows, at) },
    at > 0 && { label: 'Read next', run: () => void enqueue([row.itemId], true) },
    // The drag's moves, for the keyboard and for anyone who never finds the grip.
    at > 0 && { label: 'Move up', run: () => void readingQueue.move(row.id, rows[at - 1].id, false).then(() => chime('settled')) },
    at < rows.length - 1 && { label: 'Move down', run: () => void readingQueue.move(row.id, rows[at + 1].id, true).then(() => chime('settled')) },
    { label: 'Open', run: () => window.api.openInHome(row.type, row.itemId) },
    !!row.bare && !!row.url && { label: 'Copy the link', run: () => copy(row.url!) },
    'separator',
    { label: 'Mark as read', run: () => void readingQueue.done(row.id).then(() => (chime('done'), toast('Moved to Read', () => void readingQueue.undone(row.id, true)))) },
    { label: 'Take out of queue', keys: '⌫', danger: true, run: () => void dequeue(row) },
    ...pick.rowItems
  ]
  return (
    <RowMenu items={menu}>
      <div data-row data-id={row.itemId} data-queue-row={row.id} data-private={row.private ? '' : undefined} onWheel={swipe.onWheel}
        data-picked={pick.picked ? '' : undefined} data-cursor={pick.cursor || undefined}
        onClickCapture={(event) => pick.onPickClick(event) && (event.preventDefault(), event.stopPropagation())}
        className={`group/q relative flex cursor-grab items-center gap-3 rounded-md px-3 py-2 transition-[background-color,transform,opacity] duration-150 hover:bg-accent/50 data-[cursor]:bg-accent/50 ${PICKED_MARK}`}
        style={{ transform: swipe.x ? `translateX(${swipe.x}px)` : undefined, opacity: swipe.x ? 1 - Math.min(0.6, Math.abs(swipe.x) / 300) : undefined, transition: swipe.x ? 'none' : undefined }}>
        {/* Its place in line; pointed at, a grip in its place, since the row drags. */}
        <span className="relative w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          <span className="transition-opacity duration-150 group-hover/q:opacity-0 group-data-[cursor]/q:opacity-0">{at + 1}</span>
          <GripVertical aria-hidden className="absolute top-1/2 right-0 size-3.5 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover/q:opacity-100 group-data-[cursor]/q:opacity-100" />
        </span>
        <button type="button" onClick={() => play(rows, at)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none">
          {kind ? <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} /> : <ListStart className="size-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5"><span className="private-text min-w-0 truncate text-body text-foreground">{taskName(row.title).text}</span><Tags tags={taskName(row.title).tags} /></span>
            <span className="block truncate text-xs text-muted-foreground">{saidOf(row)} · added {ago(row.addedAt)}{row.bare ? ' · opens in your browser' : ''}</span>
          </span>
        </button>
        <Tip label="Take it out of the queue: it stays where it is">
          <button type="button" aria-label="Take it out of the queue" onClick={() => void dequeue(row)}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/q:opacity-100 group-data-[cursor]/q:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
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
  // Emptied in front of you (the last one read, or taken off): the clear chord.
  // Not under the reading page, which has its own ending.
  const had = useRef<number | null>(null)
  useEffect(() => {
    if (loading) return
    if (had.current && !queue.length && !document.querySelector('[role="dialog"][aria-label="Reading"]')) chime('clear')
    had.current = queue.length
  }, [loading, queue.length])
  // Several picked, as every list picks: ⌘A, ⌘-click, ⇧-click, x; ⌫ takes them
  // out of the queue (they stay where they are), Esc lets them go, ⌘C copies their names.
  const ids = queue.map((row) => row.id)
  const [chosen, setChosen] = useState<string[]>([])
  const live = chosen.filter((id) => ids.includes(id))
  const rowsOf = (list: string[]): QueueRow[] => queue.filter((row) => list.includes(row.id))
  const [cursor, setCursor] = useListKeys(queue.length, { onOpen: (index) => play(queue, index) })
  const here = useHere()
  const anchor = useRef<string | null>(null)
  const takeOut = (list: string[]): void => void dequeue(rowsOf(list)).then(() => setChosen([]))
  const markRead = (list: string[]): void => void finishAll(rowsOf(list)).then(() => setChosen([]))
  // Read, below: picked on its own, with its own ⌫ (out of Read, the note stays where it is).
  const readIds = read.slice(0, 50).map((row) => row.id)
  const [readChosen, setReadChosen] = useState<string[]>([])
  const readLive = readChosen.filter((id) => readIds.includes(id))
  const readRows = (list: string[]): QueueRow[] => read.filter((row) => list.includes(row.id))
  const focusedRead = (): string | undefined => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-read-row]')?.dataset.readId
  const forgetRead = (list: string[]): void => {
    const rows = readRows(list)
    if (!rows.length) return
    void Promise.all(rows.map((row) => readingQueue.remove(row.id))).then((was) => {
      setReadChosen([])
      chime('away')
      toast(rows.length === 1 ? 'Out of Read: it stays where it was' : `Took ${num(rows.length)} out of Read: they stay where they were`,
        () => void Promise.all(was.filter((one) => !!one).map((one) => readingQueue.restore(one!))).then(() => chime('undo')))
    })
  }
  const readAgain = (list: string[]): void => {
    const rows = readRows(list)
    void Promise.all(rows.map((row) => readingQueue.undone(row.id))).then(() => {
      setReadChosen([])
      chime('unshelve')
      toast(rows.length === 1 ? 'Back on the queue, next' : `${num(rows.length)} back on the queue, next`, () => void Promise.all(rows.map((row) => readingQueue.done(row.id, row.doneAt ?? undefined))))
    })
  }
  const readToggle = (id: string): void => setReadChosen((was) => (chime(was.includes(id) ? 'off' : 'on'), was.includes(id) ? was.filter((one) => one !== id) : [...was, id]))
  // Two lists on one page: the keys go to the one under the pointer or last
  // clicked (lib/list-front.ts), else to Read while something there is picked.
  const nextBox = useRef<HTMLDivElement>(null)
  const readBox = useRef<HTMLDivElement>(null)
  useListScope(nextBox)
  useListScope(readBox)
  const readInFront = (): boolean => {
    const front = listInFront()
    return front ? front === readBox.current : now.current.readLive.length > 0 || !!focusedRead()
  }
  const nextInFront = (): boolean => {
    const front = listInFront()
    return front ? front === nextBox.current : !now.current.readLive.length && !focusedRead()
  }
  const selectAllRead = useSelectAll(() => readIds, readLive, setReadChosen, {
    scoped: true, here: () => here() && readInFront(), onDelete: forgetRead, current: focusedRead, deleteSaid: '⌫ takes them out of Read',
    titleOf: (id) => read.find((row) => row.id === id)?.title
  })
  const selectAll = useSelectAll(() => ids, live, setChosen, {
    scoped: true, here: () => here() && nextInFront(), onDelete: takeOut, current: () => now.current.ids[now.current.cursor], deleteSaid: '⌫ takes them out of the queue',
    titleOf: (id) => queue.find((row) => row.id === id)?.title
  })
  const now = useRef({ ids, cursor, live, readLive })
  now.current = { ids, cursor, live, readLive }
  const toggle = (id: string): void => setChosen((was) => (chime(was.includes(id) ? 'off' : 'on'), was.includes(id) ? was.filter((one) => one !== id) : [...was, id]))
  const clear = (): void => (chime('off'), setChosen([]))
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape' && (now.current.live.length || now.current.readLive.length) && !document.querySelector('[role="menu"]')) {
        event.preventDefault()
        event.stopPropagation()
        return void (chime('off'), setChosen([]), setReadChosen([]))
      }
      const readRow = focusedRead()
      if (event.key === 'x' && readRow) return void (event.preventDefault(), readToggle(readRow))
      const id = now.current.ids[now.current.cursor]
      if (event.key === 'x' && id) (event.preventDefault(), toggle(id))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const allPicked = ids.length > 0 && ids.every((id) => live.includes(id))
  const pickOf = (row: QueueRow, at: number): Picking => ({
    picked: live.includes(row.id),
    cursor: at === cursor,
    onPickClick: (event) => {
      if (event.altKey || (!event.metaKey && !event.shiftKey)) return false
      setCursor(at)
      if (event.metaKey) (toggle(row.id), (anchor.current = row.id))
      else {
        // A run from the last one picked to this one, added to what is picked.
        const from = Math.max(0, ids.indexOf(anchor.current ?? live[live.length - 1] ?? row.id))
        const run = ids.slice(Math.min(from, at), Math.max(from, at) + 1)
        chime('on')
        setChosen((was) => [...new Set([...was, ...run])])
      }
      return true
    },
    menu: live.includes(row.id) && live.length > 1 ? [
      { label: `Read these ${num(live.length)} next`, run: () => void enqueue(rowsOf(live).map((one) => one.itemId), true).then(() => setChosen([])) },
      { label: `Mark ${num(live.length)} as read`, run: () => markRead(live) },
      { label: 'Copy their names', keys: '⌘C', run: () => copy(rowsOf(live).map((one) => one.title).join('\n')) },
      'separator',
      { label: `Take ${num(live.length)} out of the queue`, keys: '⌫', danger: true, run: () => takeOut(live) },
      'separator',
      !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll },
      { label: 'Clear the selection', keys: 'esc', run: clear }
    ] : null,
    rowItems: ['separator', { label: live.includes(row.id) ? 'Unselect' : 'Select', keys: 'X', run: () => toggle(row.id) }, !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll }]
  })
  return (
    <Page title="Queue" count={live.length || queue.length} unit={live.length ? ['selected', 'selected'] : ['to read', 'to read']}
      actions={live.length > 0 ? (
        <span data-queue-bar className="flex items-center gap-1">
          <Tip label="Into Read, dated today"><Button variant="ghost" size="sm" onClick={() => markRead(live)}>Mark as read</Button></Tip>
          <Tip label={`Off this list only: ${live.length === 1 ? 'it stays' : 'they stay'} where ${live.length === 1 ? 'it is' : 'they are'}  ⌫`}>
            <Button variant="ghost" size="sm" onClick={() => takeOut(live)}>Take out of queue</Button>
          </Tip>
          {!allPicked && <Tip label="Every one in the queue  ⌘A"><Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button></Tip>}
          <Tip label="Clear the selection  Esc"><Button variant="ghost" size="icon-sm" aria-label="Clear the selection" onClick={clear}><Clear className="size-3.5" /></Button></Tip>
        </span>
      ) : queue.length > 0 && (
        <span className="flex items-center gap-1">
          <Button size="sm" onClick={() => readQueue(0)}><BookOpen className="size-3.5" /> Start reading</Button>
        </span>
      )}>
      <div className="w-full px-5 pt-6 pb-16">
        {!loading && !queue.length && !read.length ? (
          <Empty title="Nothing queued yet">
            Right-click any note, gem or article and choose “Queue”, then “Add to queue”, or “Read next” to read it first. Then read them one after the other.
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
              // Everything read: a rest, not a flat line, and the way to fill it again.
              <Rest seed="queue-read" strip>
                <div data-queue-empty className="mb-6 flex flex-col items-start gap-2 px-1">
                  <p className="text-body"><strong className="font-semibold">Everything in the queue is read.</strong> <span className="text-muted-foreground">Queue up what you mean to read next.</span></p>
                  <Button variant="outline" size="sm" onClick={() => (chime('open'), window.api.openInHome('view', 'nuggets'))}>Add some from Gems</Button>
                </div>
              </Rest>
            )}
            {queue.length > 0 && (
              <Island title="Up next">
                <div ref={nextBox}>
                <SortableList items={queue} keyOf={(row) => row.id} onMove={(id, target, after) => void readingQueue.move(id, target, after).then(() => chime('settled'))}>
                  {(rows) => rows.map((row, at) => (
                    <SortableRow key={row.id} id={row.id}><QueueLine row={row} at={at} rows={rows} pick={pickOf(row, at)} /></SortableRow>
                  ))}
                </SortableList>
                </div>
              </Island>
            )}
            {read.length > 0 && (
              <Island className="mt-8" title={<span className="flex items-center gap-2">Read <span className="text-foreground tabular-nums">{num(read.length)}</span></span>}
                actions={<Button variant="ghost" size="sm" onClick={() => {
                  // Cleared with a count, and one undo puts every one back, dated as it was.
                  const was = read
                  void readingQueue.forget().then(() => (chime('away'), toast(`Cleared ${num(was.length)} from Read`, () =>
                    void Promise.all(was.map((row) => readingQueue.restore({ id: row.id, item_type: row.type, item_id: row.itemId, position: 0, added_at: row.addedAt, done_at: row.doneAt }))))))
                }}>Clear</Button>}>
                <div ref={readBox}>
                <AnimatePresence initial={false}>
                  {read.slice(0, 50).map((row) => {
                    const kind = kindOf(row)
                    const picked = readLive.includes(row.id)
                    // The same gestures as Up next: right-click, ⌘- or ⇧-click and x to pick, ⌘A, ⌫ out of Read, Esc.
                    const menu: MenuItem[] = picked && readLive.length > 1 ? [
                      { label: `Read these ${num(readLive.length)} again`, run: () => readAgain(readLive) },
                      { label: 'Copy their names', keys: '⌘C', run: () => copy(readRows(readLive).map((one) => one.title).join('\n')) },
                      'separator',
                      { label: `Take ${num(readLive.length)} out of Read`, keys: '⌫', danger: true, run: () => forgetRead(readLive) },
                      'separator',
                      readLive.length < readIds.length && { label: 'Select all', keys: '⌘A', run: selectAllRead },
                      { label: 'Clear the selection', keys: 'esc', run: () => (chime('off'), setReadChosen([])) }
                    ] : [
                      { label: 'Open', run: () => window.api.openInHome(row.type, row.itemId) },
                      { label: 'Read it again', hint: 'Back on the queue, next', run: () => readAgain([row.id]) },
                      { label: 'Copy its name', run: () => copy(row.title) },
                      'separator',
                      { label: 'Take out of Read', hint: 'It stays where it is', keys: '⌫', danger: true, run: () => forgetRead([row.id]) },
                      'separator',
                      { label: picked ? 'Unselect' : 'Select', keys: 'X', run: () => readToggle(row.id) },
                      readLive.length < readIds.length && { label: 'Select all', keys: '⌘A', run: selectAllRead }
                    ]
                    return (
                      <RowMenu key={row.id} items={menu}>
                      <motion.div layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16, ease: EASE }}
                        data-read-row data-read-id={row.id} data-picked={picked ? '' : undefined} data-private={row.private ? '' : undefined}
                        onClickCapture={(event) => (event.metaKey || event.shiftKey) && !event.altKey && (event.preventDefault(), event.stopPropagation(), readToggle(row.id))}
                        className={`group/r flex items-center gap-3 rounded-md px-3 py-2 ${PICKED_MARK}`}>
                        {kind ? <kind.icon className="size-4 shrink-0 opacity-60" style={{ color: kind.tint }} /> : <ListStart className="size-4 shrink-0 text-muted-foreground" />}
                        <button type="button" onClick={() => window.api.openInHome(row.type, row.itemId)} className="private-text -my-0.5 min-w-0 flex-1 truncate py-0.5 text-left text-body text-muted-foreground hover:text-foreground">{row.title}</button>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{dayMonth(row.doneAt!)}</span>
                        <Tip label="Read it again: back on the queue, next">
                          <button type="button" aria-label="Read it again" onClick={() => void readingQueue.undone(row.id).then(() => (chime('unshelve'), toast('Back on the queue, next', () => void readingQueue.done(row.id, row.doneAt ?? undefined))))}
                            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/r:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
                            <RotateCcw className="size-3.5" />
                          </button>
                        </Tip>
                      </motion.div>
                      </RowMenu>
                    )
                  })}
                </AnimatePresence>
                </div>
                {/* The fifty most recent are listed; the count above is all of them, so the rest are said. */}
                {read.length > 50 && <p className="px-3 py-2 text-control text-muted-foreground">And {num(read.length - 50)} read before these. “Clear” takes them all.</p>}
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
  useReading(unloaded(all))
  // One light over the rows, gliding to the nearest, as Home's other lists do.
  const rows = useRef<HTMLOListElement>(null)
  const hover = useFluidHover(rows, { items: '[data-queue-next]' })
  if (!queue.length) return null
  return (
    <section data-queue-panel aria-label="Your reading queue" className={`flex flex-col gap-1 rounded-xl border bg-[color-mix(in_oklab,var(--foreground)_2.5%,transparent)] p-2 ${className}`}>
      <div className="flex items-center gap-2 px-1.5 pt-0.5">
        <ListStart className="size-4 shrink-0 text-[var(--tt-color-text-blue)]" />
        <button type="button" onClick={() => (chime('open'), onView('queue'))} className="truncate text-control font-semibold whitespace-nowrap text-foreground hover:underline hover:decoration-foreground/30 hover:underline-offset-4">Up next to read</button>
        <span className="shrink-0 text-control whitespace-nowrap text-muted-foreground tabular-nums"><strong className="font-semibold text-foreground">{num(queue.length)}</strong> to read</span>
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
              {/* Right-click: what the Queue page's own row offers most. */}
              <RowMenu items={[
                { label: row.bare ? 'Open the page' : 'Read from here', keys: '↵', run: () => play(queue, at) },
                at > 0 && { label: 'Read next', run: () => void enqueue([row.itemId], true) },
                { label: 'Open', run: () => window.api.openInHome(row.type, row.itemId) },
                'separator',
                { label: 'Mark as read', run: () => void readingQueue.done(row.id).then(() => (chime('done'), toast('Moved to Read', () => void readingQueue.undone(row.id, true)))) },
                { label: 'Take out of queue', danger: true, run: () => void dequeue(row) }
              ]}>
              <button type="button" data-queue-next data-private={row.private ? '' : undefined} onClick={() => play(queue, at)}
                className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-control">
                <span className="w-3 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{at + 1}</span>
                {kind ? <kind.icon className="size-3.5 shrink-0" style={{ color: kind.tint }} /> : <ListStart className="size-3.5 shrink-0 text-muted-foreground" />}
                <span className="private-text min-w-0 flex-1 truncate text-foreground">{taskName(row.title).text}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{saidOf(row)}</span>
              </button>
              </RowMenu>
            </li>
          )
        })}
      </ol>
      {queue.length > 3 && (
        <button type="button" onClick={() => (chime('open'), onView('queue'))} className="flex min-h-6 items-center gap-1.5 self-start rounded-md px-1.5 text-meta text-foreground/75 transition-colors duration-80 hover:bg-accent/60 hover:text-foreground">
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
    window.addEventListener('haligtree:queue-read', onRead)
    return () => window.removeEventListener('haligtree:queue-read', onRead)
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
