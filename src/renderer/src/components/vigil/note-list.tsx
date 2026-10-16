import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode
} from 'react'
import { Minimize2 } from 'lucide-react'

import { notes, smallPicture, useThumb, type NoteTable } from '@/lib/notes'
import { openApart } from '@/lib/apart'
import { useLive } from '@/lib/vigil'
import { chime } from '@/lib/sound'
import { RowMenu, type RowItem } from './row-menu'
import { SortableList, SortableRow } from './sortable'
import { GroupIcon, GroupedList, type Folds } from './kept-groups'
import { Rolling, Tags, Tip, VirtualList, typing } from './ui'
import { Button } from '@/components/ui/button'
import type { Density, Pane } from './display'
import { GrainFill, onPaper, PAPER_INK, useNoteCover } from './grain'
import { Tilt } from './tilt'
import { useHere, usePaneMark } from '@/lib/split'
import { knowRow } from './row-card'
import { loud, type Loud } from '@/lib/loud'
import { Highlight, useFluidHover } from './glide'
import { Fit as Maximize2, PanelLeftClose, PanelLeftOpen, Search as SearchIcon, X } from '@/components/ui/icons'

/** How a done thing's words look in every list: struck through, faintly. */
export const DONE_WORDS = 'line-through decoration-foreground/40'

/**
 * One note in a list, whatever it is: a capture, a nugget, an article or a
 * question. The list draws it at any of Display's four sizes from this.
 */
export type Entry = {
  id: string
  /** What a ⌘-click opens it as. */
  type: string
  title: string
  tags: string[]
  icon: ComponentType<{ className?: string; style?: CSSProperties }>
  tint?: string
  /** How long ago, short, and its colour once it is going stale. */
  age?: string
  ageTint?: string
  /** The age is important (a task late or due today): drawn larger, never small and grey. */
  ageLoud?: Loud
  /** The age made pressable (a task's date opens its calendar). */
  ageEdit?: (age: React.ReactNode) => React.ReactNode
  /** Something that must be read first on the line under the title: a deadline. */
  alert?: { text: string; kind: Loud }
  /** The rest of the line under the title: where it came from, who said it. */
  sub?: ReactNode
  /** Small marks after the title: a pin, private. */
  marks?: ReactNode
  /** A bar under the line in a list, for what fills as it goes: a goal's road. */
  bar?: ReactNode
  /** Shown on the row under the pointer or the keyboard only: its handle. */
  hint?: string
  dim?: boolean
  /** A task ticked off: its words struck through, as Recent and Today's list strike them. */
  done?: boolean
  private?: boolean
  /** Its own words rather than a name (a nugget): two lines of them in a list, not one. */
  wrap?: boolean
  menu?: RowItem[]
  /** Drawn in the icon's place, outside the row's own button so it can be pressed: a task's tick. */
  lead?: ReactNode
  /** A group drawn as a tile: a folder in its colour, its first notes small inside it. */
  folder?: { icon: string | null; color: string | null; count: number; members: Entry[] }
}

/** A note's first picture, made small (or tile-sized) once. Undefined: it has none; null: on its way; '': too big to show. */
function usePicture(id: string, large: boolean): [string | null | undefined, () => void] {
  const src = useThumb(id)
  const [shown, setShown] = useState<string | null>(null)
  // A picture whose file has gone is no picture: the note falls back to its cover, as Home's cards do.
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    setShown(null)
    setBroken(false)
    if (src) void smallPicture(src, large).then(setShown, () => setBroken(true))
  }, [src, large])
  return [src && !broken ? shown : undefined, () => setBroken(true)]
}

const tileTint = (tint?: string): CSSProperties => ({
  background: tint ? `color-mix(in srgb, ${tint} 9%, var(--accent))` : 'var(--accent)'
})

/**
 * What stands for a note in a grid: its picture, or a quiet tile of its first
 * words under its kind's icon, so a grid of notes without pictures still
 * reads as notes, not as blanks.
 */
function Cover({
  entry,
  words,
  large,
  className = ''
}: {
  entry: Entry
  words?: string
  large: boolean
  className?: string
}): React.JSX.Element {
  // A tile is a tile whichever grid it is in: always the tile-sized picture, or a small grid blurs.
  const [picture, broken] = usePicture(entry.id, true)
  // No picture of its own: its grain cover, its words in white on it.
  const grain = useNoteCover(picture === undefined ? entry.id : null)
  const paper = !!grain?.paper
  if (picture)
    return (
      <Tilt caption={entry.title || undefined} className={`private-text overflow-hidden bg-accent ${className}`}>
        <img
          src={picture}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={broken}
          className="size-full object-cover animate-in fade-in-0 duration-200"
        />
      </Tilt>
    )
  return (
    <span
      className={`relative flex flex-col overflow-hidden ${large ? 'gap-1.5 p-3' : 'gap-1 p-2'} ${className}`}
      style={grain ? undefined : tileTint(entry.tint)}
    >
      {grain && <GrainFill cover={grain} tint={entry.tint} shade="all" />}
      <entry.icon
        className={`relative ${large ? 'size-4' : 'size-3.5'} shrink-0 ${grain && !paper ? 'text-white/80' : ''}`}
        style={paper ? onPaper(entry.tint) : grain ? undefined : { color: entry.tint }}
      />
      {picture !== null && (
        <span
          style={paper ? { color: PAPER_INK } : undefined}
          className={`private-text relative whitespace-pre-line ${paper ? '' : grain ? 'text-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]' : 'text-muted-foreground'} ${large ? 'line-clamp-5 text-xs leading-snug' : 'line-clamp-4 text-[10px] leading-tight'}`}
        >
          {(large ? rest(words, entry.title) : words) || entry.title || 'Untitled'}
        </span>
      )}
    </span>
  )
}

/** A note's first words less its name, which the tile's foot already says. A small tile has no foot: it keeps them. */
const rest = (words: string | undefined, title: string): string =>
  (words ?? '')
    .split('\n')
    .filter(
      (line) =>
        line.trim() &&
        !title.startsWith(line.trim().slice(0, 40)) &&
        !line.trim().startsWith(title.slice(0, 40))
    )
    .join('\n')

/** A row's lead: the note's picture, small, or its kind's icon on a quiet square of the same size. */
export function Lead({
  entry,
  className = 'size-9'
}: {
  entry: Entry
  className?: string
}): React.JSX.Element {
  const [picture, broken] = usePicture(entry.id, false)
  const grain = useNoteCover(picture === undefined ? entry.id : null)
  return (
    <span
      // A paper cover is a light drawing: on a dark page a column of them read as bright squares, so there it is a quiet square instead (main.css, data-lead-paper).
      data-lead-paper={!picture && grain?.paper ? '' : undefined}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-md ${picture ? 'private-text bg-accent' : ''} ${className}`}
      style={picture || grain ? undefined : tileTint(entry.tint)}
    >
      {picture ? (
        <img
          src={picture}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={broken}
          className="size-full object-cover animate-in fade-in-0 duration-200"
        />
      ) : grain ? (
        <>
          {/* On paper, a wash so the small icon stands clear of the drawing's lines. */}
          <GrainFill cover={grain} tint={entry.tint} shade={grain.paper ? 'all' : 'none'} />
          <entry.icon className={`relative size-4 ${grain.paper ? '' : 'text-white/80'}`} style={grain.paper ? onPaper(entry.tint) : undefined} />
        </>
      ) : (
        <entry.icon className="size-4" style={{ color: entry.tint }} />
      )}
    </span>
  )
}

/** A line of the list as drawn: a row, or a row of tiles, with its group's name over the first. */
type Line = { key: string; head?: [string, number]; start: number; entries: Entry[] }

const TILE = { small: 92, grid: 184 }

/**
 * Which rows just turned up: a few ids new since the list first drew, joining
 * rows that were already there, for a moment, so a capture just sent or one
 * put back by Undo eases into the rows instead of popping in. A whole new set
 * at once (a filter, another view) is a different list, and is simply drawn.
 */
export function useArrivals(ids: string[], scope = ''): (id: string) => boolean {
  const seen = useRef<Map<string, number> | null>(null)
  // Another list in the same place (Today to Upcoming) starts afresh.
  const was = useRef(scope)
  if (was.current !== scope) {
    was.current = scope
    seen.current = null
  }
  const now = performance.now()
  if (!seen.current) {
    if (ids.length) seen.current = new Map(ids.map((id) => [id, 0]))
    return () => false
  }
  const fresh = ids.filter((id) => !seen.current!.has(id))
  // Arriving means joining rows already here; none of them left is another list.
  const joining = fresh.length <= 3 && fresh.length < ids.length
  for (const id of fresh) seen.current.set(id, joining ? now : 0)
  // Asked as each row draws, which can be later than this list drew (a scroll):
  // the moment is over by then, and a row scrolled back into view stays still.
  return (id) => performance.now() - (seen.current!.get(id) ?? 0) < 400
}

/**
 * A list of notes at one of Display's four sizes: Compact (a line each), List
 * (a picture or the kind, the title, and a quiet line under it), Small grid
 * (pictures, the title when pointed at) and Grid (picture, title, line). Rows
 * are drawn only in view. j and k (or the arrows) move through any of them; in
 * a grid ← and → step along a row and ↑ ↓ j k move by rows. The ring of the
 * keyboard sits inside each tile's padding, so the list's edge never cuts it.
 */
export function NoteList({
  groups,
  density,
  table,
  cursor,
  onCursor,
  selected,
  chosen = [],
  onPick,
  onOpen,
  onChoose,
  onRange,
  pickWithCommand,
  onMove,
  after,
  folds,
  className = ''
}: {
  groups: [string, Entry[]][]
  density: Density
  /** Where a tile's first words are read from. */
  table: NoteTable
  cursor: number
  /** Only a grid needs it: rows and columns are the list's to work out. */
  onCursor?: (index: number) => void
  /** The one open (or looked at), lit. */
  selected?: string
  /** Picked with x, tinted. */
  chosen?: string[]
  onPick: (id: string) => void
  /** A double-click: opened fully, where a click only looks. */
  onOpen?: (id: string) => void
  /** Shift-click picks it, as x does. */
  onChoose?: (id: string) => void
  /** Shift-click picks every row from the last one picked to this one. */
  onRange?: (id: string) => void
  /** ⌘-click picks, as in Finder and Dia (the default where rows can be picked); ⌥⌘-click opens a window of its own. */
  pickWithCommand?: boolean
  /** Your own order: rows (never tiles) dragged into it. */
  onMove?: (id: string, target: string, after: boolean) => void
  /** Drawn under a row: a thought being written under it. */
  after?: (entry: Entry) => ReactNode
  /** Your own order with groups in it: drawn as groups that fold, in place of `groups`. Rows only, never tiles. */
  folds?: Folds
  className?: string
}): React.JSX.Element {
  const grid = density === 'small' || density === 'grid'
  // Where ⇧-click runs from: the last row picked, as Finder keeps it.
  const anchor = useRef<string | null>(null)
  const choose = (id: string): void => ((anchor.current = id), onChoose?.(id))
  // ⇧-click: every row from the last one picked to this one, picked; a list
  // with its own range keeps it.
  const range = (id: string): void => {
    if (onRange) return onRange(id)
    const ids = groups.flatMap(([, list]) => list.map((one) => one.id))
    const a = anchor.current ? ids.indexOf(anchor.current) : -1
    const b = ids.indexOf(id)
    if (a < 0 || b < 0) return choose(id)
    for (const one of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) if (!chosen.includes(one)) onChoose?.(one)
    anchor.current = id
  }
  const arrived = useArrivals(groups.flatMap(([, list]) => list.map((one) => one.id)))
  const box = useRef<HTMLDivElement>(null)
  // One light over the rows, gliding to the nearest, so the gap between two never goes dark (glide.tsx). Tiles keep their ring.
  const hover = useFluidHover(box, { items: '[data-row]' })
  const glide = grid ? {} : { ...hover.handlers, className: 'relative isolate' }
  const light = grid ? null : <Highlight spot={hover.spot} session={hover.session} snap={hover.snap} className="bg-accent/50" />
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const fit = (): void => setWidth(element.clientWidth)
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(element)
    return () => watch.disconnect()
  }, [])
  const gap = density === 'grid' ? 12 : 8
  const across = grid
    ? Math.max(1, Math.floor((width + gap) / (TILE[density as 'small' | 'grid'] + gap)))
    : 1
  // A tile's first words, asked for only while tiles are drawn.
  const glance = useLive(
    () => (grid ? notes.glance(table) : Promise.resolve({} as Record<string, string>)),
    {} as Record<string, string>,
    [table, grid]
  )
  const draw = (sorted: Entry[]): React.JSX.Element => {
    // Back into the groups, in the order the drag left them.
    const order = new Map(sorted.map((one, at) => [one.id, at]))
    const lines: Line[] = []
    let start = 0
    for (const [name, list] of groups) {
      const here = [...list].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      for (let at = 0; at < here.length; at += across) {
        const entries = here.slice(at, at + across)
        lines.push({
          key: entries[0].id,
          head: at === 0 && name ? [name, here.length] : undefined,
          start: start + at,
          entries
        })
      }
      start += here.length
    }
    const line = lines.findIndex(
      (one) => cursor >= one.start && cursor < one.start + one.entries.length
    )
    return (
      <>
        <GridKeys on={grid} lines={lines} cursor={cursor} onCursor={onCursor} />
        <VirtualList
          items={lines}
          keyOf={(one) => one.key}
          cursor={line >= 0 ? line : undefined}
          estimate={
            density === 'compact'
              ? 30
              : density === 'list'
                ? 50
                : density === 'small'
                  ? TILE.small + gap
                  : 260
          }
          className={className}
        >
          {(one) => (
            <>
              {one.head && (
                <div
                  className={`px-2 pb-1 text-xs text-muted-foreground ${one.start === 0 ? 'pt-1' : 'pt-4'}`}
                >
                  {one.head[0]} <span className="tabular-nums"><Rolling text={one.head[1]} /></span>
                </div>
              )}
              {grid ? (
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))`,
                    gap,
                    paddingBottom: gap - 2
                  }}
                >
                  {one.entries.map((entry, at) => (
                    <div key={entry.id} className={arrived(entry.id) ? 'mf-arrive' : undefined}>{face(entry, one.start + at, glance[entry.id])}</div>
                  ))}
                </div>
              ) : (
                one.entries.map((entry) => (
                  <SortableRow key={entry.id} id={entry.id}>
                    <div className={`group/item relative ${arrived(entry.id) ? 'mf-arrive' : ''}`}>
                      {face(entry, one.start)}
                      {after?.(entry)}
                    </div>
                  </SortableRow>
                ))
              )}
            </>
          )}
        </VirtualList>
      </>
    )
  }
  // A function, not a component: one made inside here would be new each
  // render, and every row would be drawn again from nothing, pictures and all.
  const face = (entry: Entry, index: number, words?: string): React.JSX.Element => {
    const at = index === cursor
    const open = entry.id === selected
    const picked = chosen.includes(entry.id)
    knowRow(entry)
    const row = (
      <button
        type="button"
        data-row
        data-id={entry.id}
        data-cursor={at || undefined}
        data-private={entry.private ? '' : undefined}
        data-open={open ? '' : undefined}
        data-picked={picked ? '' : undefined}
        // As in Finder: ⌘-click picks one more (or one less), ⇧-click a run;
        // ⌥⌘-click opens a window of its own. A list you cannot pick from
        // keeps ⌘-click for the window.
        onClick={(event) =>
          event.metaKey && pickWithCommand !== false && onChoose && !event.altKey
            ? choose(entry.id)
            : event.metaKey
              ? openApart(entry.type, entry.id)
              : event.shiftKey && (onRange ?? onChoose)
                ? range(entry.id)
                : onPick(entry.id)
        }
        onDoubleClick={onOpen ? () => onOpen(entry.id) : undefined}
        className={
          grid
            ? tileClass(at, open, picked, entry.dim)
            : rowClass(at, open, picked, entry.dim, density === 'compact')
        }
      >
        {density === 'compact' ? (
          <CompactRow entry={entry} lit={at || open} />
        ) : density === 'list' ? (
          <ListRow entry={entry} lit={at || open} />
        ) : entry.folder ? (
          <FolderTile entry={entry} large={density === 'grid'} />
        ) : density === 'small' ? (
          <SmallTile entry={entry} words={words} />
        ) : (
          <GridTile entry={entry} words={words} />
        )}
      </button>
    )
    const menued = entry.menu ? <RowMenu items={entry.menu}>{row}</RowMenu> : row
    // A tick of its own over the icon's room, a sibling of the row so a press on it never opens the row.
    return entry.lead && !grid ? (
      <div className="relative">
        {menued}
        <span className={`pointer-events-none absolute top-1/2 left-2 flex -translate-y-1/2 items-center justify-center *:pointer-events-auto ${density === 'compact' ? 'size-4' : 'size-9'}`}>{entry.lead}</span>
      </div>
    ) : menued
  }
  const flat = groups.flatMap(([, list]) => list)
  if (folds && !grid)
    return (
      <div ref={box} {...glide}>
        {light}
        <GroupedList {...folds} face={face} after={after} arrived={arrived} cursor={cursor} estimate={density === 'compact' ? 30 : 50} className={className} />
      </div>
    )
  return (
    <div ref={box} {...glide}>
      {light}
      {/* Tiles never drag: your own order is set in the lists. */}
      <SortableList items={flat} keyOf={(one) => one.id} onMove={grid ? undefined : onMove}>
        {draw}
      </SortableList>
    </div>
  )
}

// Rows flush, Linear's way: one plain highlight for the one open, a fainter
// one under the keyboard, a tint for the picked. Tiles take a ring instead,
// drawn inside their own edge so nothing around them can cut it.
// A picked row keeps its tint while its menu is open, so every picked row reads the same.
// A tint alone was too faint on Paper's cream: a ring in the accent goes with it, so a picked row reads in every theme.
const PICKED = 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_18%,transparent)] shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--tt-brand-color-400)_65%,transparent)] data-[state=open]:bg-[color-mix(in_srgb,var(--tt-brand-color-400)_24%,transparent)]!'
const rowClass = (
  at: boolean,
  open: boolean,
  picked: boolean,
  dim = false,
  compact = false
): string =>
  `group/row relative flex w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors ${compact ? 'py-1' : 'py-1.5'} ${dim ? 'opacity-50' : ''} ${picked ? PICKED : open ? 'bg-accent' : at ? 'bg-accent/50' : ''}`
// The ring is drawn over the tile, not under it, so a picture never hides it.
const tileClass = (at: boolean, open: boolean, picked: boolean, dim = false): string =>
  `group/row relative flex w-full flex-col overflow-hidden rounded-lg text-left after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-inset after:transition-[box-shadow] ${dim ? 'opacity-50' : ''} ${picked ? `${PICKED} after:ring-2 after:ring-[var(--tt-brand-color-400)]` : at ? 'after:ring-2 after:ring-ring' : open ? 'after:ring-2 after:ring-foreground/40' : 'after:ring-1 after:ring-border hover:after:ring-foreground/25'}`

/**
 * Split, a row whose note is open in a pane says which: a small L, M or R
 * just before its title, in its own room, so it never covers the picture.
 */
function PaneMark({ id }: { id: string }): React.JSX.Element | null {
  const mark = usePaneMark(id)
  if (!mark) return null
  const side = mark === 'L' ? 'left' : mark === 'R' ? 'right' : 'middle'
  return (
    <span data-pane-mark={mark} role="img" aria-label={`Open in the ${side} pane`} title={`Open in the ${side} pane`}
      className="pointer-events-none flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--tt-brand-color-400)] text-[10px] leading-none font-semibold mf-on-accent">
      {mark}
    </span>
  )
}

/** The title's own marks, and its handle on the row under the pointer or the keyboard. */
function Tail({ entry, lit }: { entry: Entry; lit: boolean }): React.JSX.Element {
  return (
    <>
      {entry.marks}
      {/* The handle is for copying and linking, not reading: it shows on the
          row under the pointer or the cursor, in room the title gives up. */}
      {entry.hint && (
        <span
          className={`shrink-0 text-xs text-muted-foreground tabular-nums ${lit ? '' : 'hidden group-hover/row:inline'}`}
        >
          {entry.hint}
        </span>
      )}
    </>
  )
}
const Age = ({ entry }: { entry: Entry }): React.JSX.Element | null => {
  if (!entry.age) return null
  const age = (
    <span {...loud(entry.ageLoud, 'shrink-0 tabular-nums')} style={{ color: entry.ageLoud ? undefined : entry.ageTint }}>
      {entry.age}
    </span>
  )
  return entry.ageEdit ? <>{entry.ageEdit(age)}</> : age
}
const Dot = (): React.JSX.Element => (
  <span aria-hidden className="text-muted-foreground/60">
    ·
  </span>
)

function CompactRow({ entry, lit }: { entry: Entry; lit: boolean }): React.JSX.Element {
  return (
    <>
      {entry.lead ? <span aria-hidden className="size-4 shrink-0" /> : <entry.icon className="size-4 shrink-0" style={{ color: entry.tint }} />}
      <PaneMark id={entry.id} />
      <span className={`private-text min-w-0 flex-auto truncate ${entry.done ? DONE_WORDS : ''}`}>{entry.title || 'Untitled'}</span>
      <Tags tags={entry.tags} max={2} />
      <Tail entry={entry} lit={lit} />
      <span className="text-xs text-muted-foreground">
        <Age entry={entry} />
      </span>
    </>
  )
}

function ListRow({ entry, lit }: { entry: Entry; lit: boolean }): React.JSX.Element {
  return (
    <>
      {entry.lead ? <span aria-hidden className="size-9 shrink-0" /> : <Lead entry={entry} />}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <PaneMark id={entry.id} />
          <span
            className={`private-text min-w-0 flex-1 ${entry.wrap ? 'line-clamp-2 [overflow-wrap:anywhere]' : 'truncate'} ${entry.done ? DONE_WORDS : ''}`}
          >
            {entry.title || 'Untitled'}
          </span>
          <Tail entry={entry} lit={lit} />
        </span>
        <Under entry={entry} />
        {entry.bar && <span className="mt-1 block pr-2">{entry.bar}</span>}
      </span>
    </>
  )
}

/** The quiet line under a title: when, where it came from or who said it, then its tags. */
function Under({ entry }: { entry: Entry }): React.JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {entry.alert && <span {...loud(entry.alert.kind, 'shrink-0')}>{entry.alert.text}</span>}
      {entry.alert && entry.age && <Dot />}
      <Age entry={entry} />
      {(entry.age || entry.alert) && entry.sub && <Dot />}
      {entry.sub && <span className="min-w-0 truncate">{entry.sub}</span>}
      {entry.tags.length > 0 && (entry.age || entry.sub) && <Dot />}
      <Tags tags={entry.tags} max={2} alone />
    </span>
  )
}

/**
 * A group as a tile: a folder tinted in the group's colour holding its first
 * four notes as small pictures, two by two, and under it the group's icon,
 * name and how many it holds. A click opens it in place.
 */
function FolderTile({ entry, large }: { entry: Entry; large: boolean }): React.JSX.Element {
  const folder = entry.folder!
  const tint = folder.color ? `var(--tt-color-text-${folder.color})` : 'var(--foreground)'
  return (
    <>
      <span data-folder="" className={`grid w-full grid-cols-2 grid-rows-2 gap-1 ${large ? 'aspect-[4/3] p-2.5' : 'aspect-square p-1.5'}`}
        style={{ background: `color-mix(in srgb, ${tint} ${folder.color ? 12 : 6}%, var(--accent))` }}>
        {Array.from({ length: 4 }, (_, at) => folder.members[at] ? (
          <Lead key={folder.members[at].id} entry={folder.members[at]} className="size-full rounded-sm shadow-(--mf-shadow-control)" />
        ) : (
          <span key={at} className="rounded-sm border border-dashed border-foreground/10" />
        ))}
      </span>
      {large ? (
        <span className="flex min-w-0 items-center gap-1.5 px-2.5 pt-2 pb-2.5 text-sm">
          <GroupIcon icon={folder.icon} color={folder.color} className="size-4" />
          <span className="min-w-0 flex-1 truncate font-semibold">{entry.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{folder.count}</span>
        </span>
      ) : (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 truncate bg-linear-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5 text-[11px] font-semibold text-white">
          <span className="min-w-0 flex-1 truncate">{entry.title}</span>
          <span className="tabular-nums opacity-80">{folder.count}</span>
        </span>
      )}
    </>
  )
}

function SmallTile({ entry, words }: { entry: Entry; words?: string }): React.JSX.Element {
  return (
    <>
      <Cover entry={entry} words={words} large={false} className="aspect-square w-full" />
      {/* The name, pointed at or under the keyboard, over the foot of the tile. */}
      <span
        className={`private-text pointer-events-none absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5 text-[11px] font-medium text-white opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-data-[cursor]/row:opacity-100`}
      >
        {entry.title || 'Untitled'}
      </span>
    </>
  )
}

function GridTile({ entry, words }: { entry: Entry; words?: string }): React.JSX.Element {
  return (
    <>
      <Cover entry={entry} words={words} large className="aspect-[4/3] w-full" />
      <span className="flex min-w-0 flex-col gap-0.5 px-2.5 pt-2 pb-2.5">
        <span className="flex items-center gap-1.5 text-sm">
          <span className="private-text min-w-0 flex-1 truncate font-medium">
            {entry.title || 'Untitled'}
          </span>
          {entry.marks}
        </span>
        <Under entry={entry} />
      </span>
    </>
  )
}

/**
 * The keys a grid adds to the list's own: ← and → along a row, ↑ ↓ j k a
 * row at a time, staying in the same column. Taken before the list's own
 * handler, which then leaves the key alone.
 */
function GridKeys({
  on,
  lines,
  cursor,
  onCursor
}: {
  on: boolean
  lines: Line[]
  cursor: number
  onCursor?: (index: number) => void
}): null {
  const latest = useRef({ lines, cursor })
  latest.current = { lines, cursor }
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    if (!on || !onCursor) return
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing())
        return
      const { lines, cursor } = latest.current
      const count = lines.reduce((n, one) => n + one.entries.length, 0)
      if (!count) return
      const down = event.key === 'ArrowDown' || event.key === 'j'
      const up = event.key === 'ArrowUp' || event.key === 'k'
      const side = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (!down && !up && !side) return
      event.preventDefault()
      if (cursor < 0) return onCursor(0)
      if (side) return onCursor(Math.max(0, Math.min(count - 1, cursor + side)))
      const row = lines.findIndex(
        (one) => cursor >= one.start && cursor < one.start + one.entries.length
      )
      const next = lines[row + (down ? 1 : -1)]
      if (next) onCursor(next.start + Math.min(cursor - lines[row].start, next.entries.length - 1))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [on, onCursor])
  return null
}

/**
 * The list folded to a rail, Spotify's collapsed library: a square for each
 * note (its picture, or its kind), its name when pointed at, and at the top
 * the way back to the whole list. j and k still move through it.
 */
export function NoteRail({
  entries,
  cursor,
  selected,
  onPick,
  onShow,
  label = 'Show the list'
}: {
  entries: Entry[]
  cursor: number
  selected?: string
  onPick: (id: string) => void
  onShow: () => void
  label?: string
}): React.JSX.Element {
  return (
    <div data-chrome className="mf-rail hidden w-14 shrink-0 flex-col items-center @[56rem]/page:flex">
      <div className="flex h-10 w-full shrink-0 items-center justify-center border-b">
        <Tip label={label}>
          <button
            type="button"
            onClick={() => (chime('slide'), onShow())}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        </Tip>
      </div>
      <div className="min-h-0 w-full flex-1 overflow-y-auto px-1.5 py-2 [scrollbar-width:none]">
        <VirtualList items={entries} keyOf={(one) => one.id} cursor={cursor} estimate={46}>
          {(entry, index) => {
            const face = (
              <button
                type="button"
                data-row
                data-id={entry.id}
                data-cursor={index === cursor || undefined}
                data-private={entry.private ? '' : undefined}
                data-open={entry.id === selected ? '' : undefined}
                onClick={(event) =>
                  event.metaKey ? openApart(entry.type, entry.id) : onPick(entry.id)
                }
                className={`flex w-full items-center justify-center rounded-lg p-1 ring-inset transition-[box-shadow,background-color] hover:bg-accent/60 ${entry.dim ? 'opacity-50' : ''} ${index === cursor ? 'ring-2 ring-ring' : entry.id === selected ? 'bg-accent' : ''}`}
              >
                {/* Never a private note's name: names show in a screen share. */}
                <Tip label={entry.private ? 'Private' : entry.title || 'Untitled'}>
                  <span className="flex">
                    <Lead entry={entry} />
                  </span>
                </Tip>
              </button>
            )
            return entry.menu ? <RowMenu items={entry.menu}>{face}</RowMenu> : face
          }}
        </VirtualList>
      </div>
    </div>
  )
}

/**
 * Search in this list, for the list spread over the page: the words narrow
 * what is shown as you type. Escape empties it and gives the keys back to the
 * list; ↓ or Enter go to the first match.
 */
export function ListSearch({
  value,
  onChange,
  onDone,
  placeholder
}: {
  value: string
  onChange: (value: string) => void
  onDone: () => void
  placeholder: string
}): React.JSX.Element {
  return (
    <label className="flex h-7 w-56 max-w-full items-center gap-1.5 rounded-md bg-accent/60 px-2 text-control text-muted-foreground focus-within:bg-accent focus-within:text-foreground">
      <SearchIcon className="size-3.5 shrink-0" />
      <input
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onChange('')
            event.currentTarget.blur()
          }
          if (event.key === 'ArrowDown' || event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
            onDone()
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear the search"
          onClick={() => onChange('')}
          className="rounded-sm text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </label>
  )
}

/** Whether a note's title holds every word searched for, in any order. */
export const matches = (title: string, query: string): boolean => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const said = title.toLowerCase()
  return words.every((word) => said.includes(word))
}

/**
 * The top of the panel beside the spread-out list: the note's picture (or its
 * tile), its name and its line, and the way into it.
 */
export function Peek({
  entry,
  table,
  onOpen,
  children
}: {
  entry: Entry
  table: NoteTable
  onOpen: () => void
  children?: ReactNode
}): React.JSX.Element {
  const glance = useLive(() => notes.glance(table), {} as Record<string, string>, [table])
  return (
    <aside
      data-chrome
      className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l @[48rem]/page:flex"
      data-private={entry.private ? '' : undefined}
    >
      <div className="flex flex-col gap-2 p-4 pb-2">
        <Cover
          entry={entry}
          words={glance[entry.id]}
          large
          className="aspect-[4/3] w-full rounded-lg"
        />
        <div className="private-text mt-1 text-body font-semibold leading-snug">
          {entry.title || 'Untitled'}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {entry.alert && <span {...loud(entry.alert.kind)}>{entry.alert.text}</span>}
          <Age entry={entry} />
          {entry.sub && <span>{entry.sub}</span>}
          <Tags tags={entry.tags} max={4} alone />
        </div>
        <Tip label="Open it  ↵">
          <button
            type="button"
            onClick={onOpen}
            className="mt-1 h-8 rounded-md bg-accent text-control font-medium text-foreground hover:bg-accent/70"
          >
            Open
          </button>
        </Tip>
      </div>
      {children}
    </aside>
  )
}

/**
 * The list's own width, at the end of its header: spread it over the page,
 * fold it to a rail of pictures (only beside an open note, which takes the
 * room), or bring it back beside the note.
 */
export function PaneButtons({
  pane,
  onPane,
  fold
}: {
  pane: Pane
  onPane: (pane: Pane) => void
  fold: boolean
}): React.JSX.Element {
  const to = (next: Pane, cue: 'slide' | 'fold'): void => {
    chime(cue)
    // The keys go back to the list, not this button, which then moves away.
    ;(document.activeElement as HTMLElement | null)?.blur()
    onPane(next)
  }
  if (pane === 'wide')
    return (
      <Tip label="Back beside the note">
        <Button variant="ghost" size="icon-sm" onClick={() => to('list', 'fold')}>
          <Minimize2 className="size-3.5" />
        </Button>
      </Tip>
    )
  return (
    <>
      {fold && (
        <Tip label="Fold the list to pictures">
          <Button variant="ghost" size="icon-sm" onClick={() => to('rail', 'fold')}>
            <PanelLeftClose className="size-3.5" />
          </Button>
        </Tip>
      )}
      <Tip label="Spread the list over the page">
        <Button variant="ghost" size="icon-sm" onClick={() => to('wide', 'slide')}>
          <Maximize2 className="size-3.5" />
        </Button>
      </Tip>
    </>
  )
}

