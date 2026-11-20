import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AudioLines, Pause } from 'lucide-react'
import { waveformOf } from '@/lib/waveform'
import { markOpened } from '@/lib/media-opened'
import { chime } from '@/lib/sound'
import { sizeOf } from '@/components/pdf/book-head'
import { VirtualList } from './ui'
import { RowMenu, type RowItem } from './row-menu'
import { TABLE_CURSOR, TABLE_NAME, TABLE_QUIET, TABLE_ROW, TABLE_WHEN, TableHead } from './table-look'
import { PICKED_ROW } from './task-pick'
import { Cover, kindWord, nameOf, shelfOf, type Shelf } from './files-shelves'
import type { Choice } from './display'
import { num, plural, when } from '../../../../main/dates'
import type { Media, MediaUse } from '../../../../main/media'

/**
 * Files as a table, the Bin's look (table-look.tsx): one line a file, its small
 * face first (a book's first page, a picture's small copy, a recording's mark),
 * then its name, what it is, how long, how big, when it came, when it was last
 * opened and the notes it is in. Only the rows on screen are drawn, and each
 * face comes from the caches the grids already fill, so thousands of rows
 * scroll as a handful do.
 */

/** Each file's facts the table sorts and shows by, worked out once per list. */
export type FileFacts = { pages: (one: Media) => number | null; /** When last opened as itself; '' when never. */ opened: (one: Media) => string; book: (one: Media) => string | null }

/** The last time it was opened or added, whichever is later: what Recent goes by. */
export const touchedAt = (one: Media, facts: FileFacts): string => ((opened) => (opened > one.at ? opened : one.at))(facts.opened(one))

/** The orders Files' Display offers in Table, the first its own. */
export const FILE_SORTS: Choice[] = [
  // Each pair is one row in Sort by, turned round by its arrow (display.tsx SortList).
  { id: 'newest', label: 'Newest', reverse: { id: 'oldest', label: 'Oldest' } },
  { id: 'opened', label: 'Recent', hint: 'Last opened or added first' },
  { id: 'az', label: 'A to Z', reverse: { id: 'za', label: 'Z to A' } },
  { id: 'kind', label: 'Kind' },
  { id: 'largest', label: 'Largest', reverse: { id: 'smallest', label: 'Smallest' } },
  { id: 'longest', label: 'Longest', hint: 'Books by pages, recordings by time', reverse: { id: 'shortest', label: 'Shortest' } },
  { id: 'notes', label: 'In most notes' }
]

const KIND_RANK: Record<Shelf, number> = { pdf: 0, picture: 1, audio: 2, video: 3, document: 4 }
/** Compared as written: ISO dates sort as text. */
const plain = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const words = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** A book's pages or a recording's seconds: what "Longest" goes by, a kind at a time. */
const lengthOf = (one: Media, facts: FileFacts): number | null => (one.kind === 'pdf' ? facts.pages(one) : one.kind === 'audio' ? one.seconds ?? null : null)

/** How each order compares two files; unknowns (no size, no length, never opened) always last. */
export function fileOrder(facts: FileFacts): Record<string, (a: Media, b: Media) => number> {
  const name = (one: Media): string => facts.book(one) || nameOf(one)
  const last = (x: number | null, y: number | null, by: (x: number, y: number) => number): number => (x === null ? (y === null ? 0 : 1) : y === null ? -1 : by(x, y))
  const long = (down: boolean) => (a: Media, b: Media): number =>
    KIND_RANK[shelfOf(a)] - KIND_RANK[shelfOf(b)] || last(lengthOf(a, facts), lengthOf(b, facts), (x, y) => (down ? y - x : x - y))
  return {
    newest: (a, b) => plain(b.at, a.at),
    oldest: (a, b) => plain(a.at, b.at),
    opened: (a, b) => plain(touchedAt(b, facts), touchedAt(a, facts)),
    az: (a, b) => words.compare(name(a), name(b)),
    za: (a, b) => words.compare(name(b), name(a)),
    kind: (a, b) => KIND_RANK[shelfOf(a)] - KIND_RANK[shelfOf(b)] || plain(b.at, a.at),
    largest: (a, b) => last(a.size || null, b.size || null, (x, y) => y - x),
    smallest: (a, b) => last(a.size || null, b.size || null, (x, y) => x - y),
    longest: long(true),
    shortest: long(false),
    notes: (a, b) => b.uses.length - a.uses.length || plain(b.at, a.at)
  }
}

/** A recording's length as a player says it: "4:07", "1:02:30". */
export const clockOf = (seconds: number): string => {
  const whole = Math.round(seconds)
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60]
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/**
 * The one recording a table plays: one sound for the whole page, so starting one stops the last, as a music app's
 * list does. Rows read which is playing from here.
 */
let sound: HTMLAudioElement | null = null
let playing: string | null = null
const heard = new Set<() => void>()
const tell = (): void => heard.forEach((one) => one())
const onSound = (call: () => void): (() => void) => (heard.add(call), () => void heard.delete(call))
export function playFile(src: string): void {
  if (!sound) {
    sound = new Audio()
    sound.addEventListener('pause', () => ((playing = null), tell()))
    sound.addEventListener('ended', () => ((playing = null), tell()))
  }
  if (playing === src) return void (chime('off'), sound.pause())
  chime('open')
  sound.src = src
  playing = src
  markOpened(src)
  void sound.play().catch(() => ((playing = null), tell()))
  tell()
}
/** Stops what a table was playing, as its page goes. */
export const stopFile = (): void => void sound?.pause()

/** Each column's box, the same in the head and every row; the quiet ones fold away as the page narrows. */
const COL = {
  face: 'size-7 shrink-0',
  kind: `${TABLE_QUIET} w-16 shrink-0 @max-[34rem]/page:hidden`,
  length: `${TABLE_WHEN} w-[4.5rem] @max-[22rem]/page:hidden`,
  size: `${TABLE_WHEN} w-16 @max-[44rem]/page:hidden`,
  added: `${TABLE_WHEN} w-[5.5rem] @max-[38rem]/page:hidden`,
  opened: `${TABLE_WHEN} w-[5.5rem] @max-[50rem]/page:hidden`,
  notes: `${TABLE_QUIET} w-40 shrink-0 @max-[58rem]/page:hidden`
}

export function FilesTable({ kind, rows, facts, sort, onSort, cursor, chosen, keyOf, menuFor, onClick, onUse }: {
  kind: 'all' | Shelf
  rows: Media[]
  facts: FileFacts
  sort: string
  onSort: (sort: string) => void
  cursor: number
  chosen: string[]
  keyOf: (one: Media) => string
  menuFor: (one: Media) => RowItem[]
  onClick: (one: Media, event: React.MouseEvent) => void
  onUse: (use: MediaUse, src: string) => void
}): React.JSX.Element {
  const now = useSyncExternalStore(onSound, () => playing)
  // The page's ways in, held still for the rows: a row is drawn again only when what it shows changes, never on each frame of a scroll.
  const ways = useRef({ menuFor, onClick, onUse })
  ways.current = { menuFor, onClick, onUse }
  const picked = useMemo(() => new Set(chosen), [chosen])
  // Clicked, a column orders the list by it; clicked again, the other way.
  const by = (label: string, first: string, second: string, className: string): { label: string; className: string; sort: { on: boolean; down: boolean; pick: () => void } } => ({
    label, className,
    sort: { on: sort === first || sort === second, down: first === second || sort !== second, pick: () => (chime('tap'), onSort(sort === first ? second : first)) }
  })
  // A column only where it says something: a kind on a page of one kind does not; pictures have no length.
  const showKind = kind === 'all' || kind === 'picture' || kind === 'document'
  const showLength = kind !== 'picture' && kind !== 'video' && kind !== 'document'
  const lengthWord = kind === 'pdf' ? 'Pages' : 'Length'
  const columns = [
    { label: '', className: COL.face },
    by('Name', 'az', 'za', TABLE_NAME),
    ...(showKind ? [by('Kind', 'kind', 'kind', COL.kind)] : []),
    ...(showLength ? [by(lengthWord, 'longest', 'shortest', COL.length)] : []),
    by('Size', 'largest', 'smallest', COL.size),
    by('Added', 'newest', 'oldest', COL.added),
    by('Opened', 'opened', 'opened', COL.opened),
    by('In', 'notes', 'notes', COL.notes)
  ]
  return (
    <div data-files-table role="table" aria-label="Files" className="pb-6">
      {/* The head stays at the top while the rows pass under it, on the page's own paint. */}
      <div className="sticky top-0 z-[1] bg-background pt-1">
        <TableHead columns={columns} />
      </div>
      <VirtualList items={rows} keyOf={keyOf} cursor={cursor >= 0 ? cursor : undefined} estimate={45} rowClass="">
        {(one, at) => (
          <Row one={one} at={at === cursor} picked={picked.has(keyOf(one))} playing={now === one.src} facts={facts} showKind={showKind} showLength={showLength} ways={ways} />
        )}
      </VirtualList>
    </div>
  )
}

type Ways = React.RefObject<{ menuFor: (one: Media) => RowItem[]; onClick: (one: Media, event: React.MouseEvent) => void; onUse: (use: MediaUse, src: string) => void }>

const Row = memo(function Row({ one, at, picked, playing, facts, showKind, showLength, ways }: {
  one: Media; at: boolean; picked: boolean; playing: boolean; facts: FileFacts; showKind: boolean; showLength: boolean; ways: Ways
}): React.JSX.Element {
  // Its menu made as it opens, not as the row is drawn.
  const menu = (): RowItem[] => ways.current.menuFor(one)
  const onClick = (event: React.MouseEvent): void => ways.current.onClick(one, event)
  const onUse = (use: MediaUse): void => ways.current.onUse(use, one.src)
  const seconds = useSeconds(one)
  const pages = one.kind === 'pdf' ? facts.pages(one) : null
  const length = one.kind === 'pdf' ? (pages ? plural(pages, 'page') : '') : one.kind === 'audio' && seconds ? clockOf(seconds) : ''
  const opened = facts.opened(one)
  const name = facts.book(one) || nameOf(one)
  return (
    <RowMenu items={menu}>
      <div role="row" data-table-row data-files-row data-media={one.kind} data-src={one.src} data-id={one.src} data-cursor={at || undefined} data-picked={picked || undefined} data-playing={playing || undefined}
        onClick={onClick} className={`${TABLE_ROW} border-b border-border/60 [contain:layout_style] ${picked ? PICKED_ROW : at ? TABLE_CURSOR : ''}`}>
        {one.kind === 'audio' ? (
          // A recording's face is its play mark: it plays where it sits, as on the Audio list.
          <span data-files-face className={`${COL.face} flex items-center justify-center rounded-[4px] bg-[color-mix(in_oklab,var(--foreground)_80%,var(--card))] text-[color-mix(in_oklab,var(--card)_85%,transparent)]`}>
            {playing ? <Pause className="size-3.5" /> : <AudioLines className="size-4" />}
          </span>
        ) : (
          <Cover one={one} tiny className={`${COL.face} rounded-[4px] ring-1 ring-foreground/10`} />
        )}
        <span dir="auto" data-table-name className={`${TABLE_NAME} ${one.private ? 'private-text' : ''}`}>{name}</span>
        {showKind && <span data-col="kind" className={COL.kind}>{kindWord(one)}</span>}
        {showLength && <span data-col="length" className={COL.length}>{length}</span>}
        <span data-col="size" className={COL.size}>{one.size ? sizeOf(one.size) : ''}</span>
        <span data-col="added" className={COL.added}>{when(one.at)}</span>
        <span data-col="opened" className={COL.opened}>{opened ? when(opened) : ''}</span>
        <Notes one={one} onUse={onUse} />
      </div>
    </RowMenu>
  )
})

/** The notes it is in: the newest a way there, and how many more; or that no note holds it. */
function Notes({ one, onUse }: { one: Media; onUse: (use: MediaUse) => void }): React.JSX.Element {
  if (one.gone) return <span data-col="notes" className={`${COL.notes} text-foreground`}>File gone from the book</span>
  if (!one.uses.length) return <span data-col="notes" className={COL.notes}>{one.how === 'attachment' && one.letGoAt ? 'Unlinked' : 'In no note'}</span>
  const first = one.uses[0]
  return (
    <span data-col="notes" className={`${COL.notes} flex items-baseline gap-1`}>
      <button type="button" data-files-use className={`min-w-0 cursor-pointer truncate underline decoration-foreground/25 underline-offset-2 hover:text-foreground hover:decoration-foreground ${first.private ? 'private-text' : ''}`}
        onClick={(event) => (event.stopPropagation(), onUse(first))}>{first.title || 'New note'}</button>
      {one.uses.length > 1 && <span className="shrink-0 tabular-nums">+{num(one.uses.length - 1)}</span>}
    </span>
  )
}

/** A recording's length: kept with the list once known, else worked out once from its sound when its row first shows. */
function useSeconds(one: Media): number | null {
  const [seconds, setSeconds] = useState<number | null>(one.seconds ?? null)
  useEffect(() => {
    if (one.kind !== 'audio' || one.seconds || one.gone) return
    let live = true
    void waveformOf(one.src).then((made) => live && made && setSeconds(made.seconds))
    return () => void (live = false)
  }, [one.src, one.kind, one.seconds, one.gone])
  return one.seconds ?? seconds
}
