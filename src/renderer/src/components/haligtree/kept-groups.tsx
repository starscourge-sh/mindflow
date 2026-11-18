import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { small } from '@/lib/small-picture'
import { dragWords } from '@/lib/drag-words'
import { NameInPlace } from './name-in-place'
import { DndContext, MeasuringStrategy, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, type SortingStrategy } from '@dnd-kit/sortable'

/** dnd-kit moves no row itself: where each one slides is worked out once, for rows and panels alike (Shaped). */
const unmoved: SortingStrategy = () => null
import type { MotionValue } from 'motion/react'
import { ChevronRight, GripVertical, ImagePlus, Layers, Plus, X as Cross } from 'lucide-react'
import { saveImage } from '@/extensions/image-drop'

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { IconPicker } from '@/components/emoji/icon-picker'
import { offerTag } from './side-folders'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { chime, click } from '@/lib/sound'
import { pastEdge } from '@/lib/drag-edge'
import { moveToBin } from '@/lib/to-bin'
import { archive } from '@/lib/notes'
import { byKeys, still } from '@/lib/motion'
import { GROUP_COLORS, groups, tintOf } from '@/lib/groups'
import { KEY, groupOf, groupsAround, isGroup, type How, type Layout } from '@/lib/group-layout'
import { cn } from '@/lib/cn'
import { DROP_LIT, Overlay, SETTLE, upDown } from './sortable'
import { CarriedCard, CarriedCount, CarryRow, Carrying, Hand, useCardPlace, INDENT, OUT, OUTDENT, PanelParts, REST, Shaped, pointerAt, pointerNow, rowAt, sideOf, useAim, useCarriedLeft, useRest, useTall, useTargets, headRow, offWindow, Slid, type Aim, type Parts, type Places } from './carry'
import { Hinted, copy } from './row-menu'
import { Count, Rolling, Tip, VirtualList, refuse, toast, quietly } from './ui'
import type { Entry } from './note-list'
import { ROW_PAD, ROW_SHAPE, ROW_TILE } from './row-shape'
/** A group's title bar: as tall as a thumbnail, no taller (the old panels' slim head). */
const HEAD = 'h-9 py-0'
import { num } from '../../../../main/dates'


/**
 * Groups in a kept list, Dia's way with tabs: a row with an icon, a name in
 * bold and a chevron, folding its notes away under it. Pointed at, a soft
 * panel in the group's colour gathers the row and its notes, with an × to
 * separate them again (the notes stay; only the group goes).
 *
 * A carried row says what letting go would do before it happens. Over the
 * middle of a row, that row lifts and a panel opens around it with room for
 * the carried one: the group about to form (or the group it would join).
 * Near a row's top or bottom edge, only a line shows where it would go. And
 * a note carried out of its group leaves a gap its group closes over. A
 * small label by the pointer says it in words.
 */

export type GroupView = { id: string; name: string; /** A folder: a place that opens, never a panel that folds. */ folder: boolean; icon: string | null; color: string | null; open: boolean; members: string[]; /** Coming apart (left with one note): drawn going. */ parting?: boolean; /** Its imported notes not yet sorted. */ unsorted?: string[] }
/** A part of a group: one of its notes, or a subgroup and its notes. */
export type Part = { entry: Entry } | { group: GroupView; entries: Entry[]; /** Its own notes and subgroups, three levels deep. */ parts?: Part[] }
/** The rows a part shows: one for a note, and an open subgroup's own on show, folded ones inside it left out. */
const onShow = (part: Part): number => ('entry' in part ? 1 : !part.group.open ? 0 : part.parts ? part.parts.reduce((sum, one) => sum + onShow(one), 0) : part.entries.length)
/** A line of the list: one note at the top level, or a group and its notes (every one, its subgroups' too), with `parts` in the order they show.
 * `head`: a loose note that starts a section of a list grouped by kind or date, the section's name and how many loose notes it holds. */
export type Bundle = { group?: GroupView; entries: Entry[]; parts?: Part[]; head?: [string, number] }
/**
 * A list's own way to head a section, where a name alone says too little
 * (Gems grouped by source: the source's face, its person, its count, a way to
 * its page). Given the section's name, its head, or nothing for the plain one.
 */
export const SectionHeads = createContext<((name: string, count: number, first: boolean) => ReactNode) | null>(null)

/** A section's name over its rows, in a list grouped by kind or date. */
export const SectionHead = ({ head, first, day = false }: { head: [string, number]; first: boolean; /** As Tasks' Upcoming heads its days. */ day?: boolean }): React.JSX.Element => {
  const own = useContext(SectionHeads)?.(head[0], head[1], first)
  if (own) return <>{own}</>
  return (
  // A list filed A to Z: its letter as a dictionary prints it, large in the heading face, the count quiet beside it.
  [...head[0]].length === 1 ? (
    <div data-group-head={head[0]} data-group-count={head[1]} data-letter-head="" className={`flex items-baseline gap-2 px-2 pb-1.5 ${first ? 'pt-1' : 'pt-5'}`}>
      <span className="font-heading text-lead font-semibold text-foreground">{head[0]}</span>
      <span className="text-meta text-muted-foreground tabular-nums"><Rolling text={head[1]} /></span>
    </div>
  ) :
  // A heading is its part's name to a carried row (`data-row-part`): lit while letting go would move the row to it, as Tasks' are.
  <div data-group-head={head[0]} data-group-count={head[1]} data-row-part={head[0]} className={day ? `mx-2 mb-1 border-b pb-1.5 text-meta font-medium text-foreground ${DROP_LIT} data-[drop-hot]:rounded-md data-[drop-hot]:border-transparent data-[drop-hot]:ring-offset-4 data-[drop-hot]:ring-offset-accent ${first ? 'mt-1' : 'mt-6'}` : `px-2 pb-1 text-xs text-muted-foreground ${first ? 'pt-1' : 'pt-4'}`}>
    {head[0]} <span className={`tabular-nums ${day ? 'font-normal text-muted-foreground' : ''}`}><Rolling text={head[1]} /></span>
  </div>
  )
}

/** The rows a group shows while open: its notes, and a subgroup's while that is open too. */
const shownIn = (one: { entries: Entry[]; parts?: Part[] }): number => (one.parts ? one.parts.reduce((n, part) => n + ('entry' in part ? 1 : part.group.open ? part.entries.length : 0), 0) : one.entries.length)

export type Folds = {
  bundles: Bundle[]
  /** In your own order: false while sorted some other way, when only joining or leaving a group means anything. */
  ordered: boolean
  /** What a drop would leave, worked out as the drop itself is: the layout before and after, and the rows on show after, in order. Null when nothing would change. */
  /** `root`: the folder open as the page, if any: being in it is being loose in this list. */
  preview: (ids: string[], target: string, how: How) => { before: Layout; after: Layout; shown: string[]; root: string | null } | null
  /** A drop, for the list to work out and save: `ids` is everything carried, in the order it is read. */
  onDrop: (ids: string[], target: string, how: How) => void
  /** The rows picked (⌘-click, ⇧-click, x): carrying one of them carries them all. */
  picked: string[]
  /** Carrying a row that is not picked lets the picks go, as Finder does. */
  onLetGo: () => void
  onFold: (group: GroupView, open: boolean) => void
  /** A note just made in a group, to open. */
  onNewNote: (id: string) => void
  /** A folder opened, as Finder opens one: the list shows only what it holds. */
  onOpenFolder?: (id: string) => void
  /** The group whose name is being written, as one just made is. */
  renaming: string | null
  /** A first name offered for the group being named. */
  suggested?: { id: string; name: string } | null
  onRenaming: (id: string | null) => void
  /** A group just made, which arrives rather than appears. */
  born: string | null
  /** What the list holds, for a folder's count: "page", "gem", "question". */
  noun?: string
  /** Its sections are days, headed as Tasks' Upcoming heads its days (Goals). */
  days?: boolean
  /** The list it is. */
  list?: string
  /** "Sort these": a pass through a group's notes not yet sorted. */
  onSort?: (ids: string[]) => void
  /** Kept as they are: these notes sorted, or back to not yet sorted (for Undo). */
  onSorted?: (ids: string[], sorted: boolean) => void
  /**
   * The list's sections as parts, where a rule of the list's own says which a row is in (a goal's day, a page's
   * kind): a row carried over another part's rows opens no room there (carry.tsx's useTargets, as Tasks).
   */
  parts?: Parts
  /** Places on the page a carried row can be let go on (the page's tabs). */
  places?: Places
  /** The list keeps a sort of its own that moving a row never switches (Goals): “Move here” says no more. */
  own?: boolean
  /** What carrying a row does here, said once in a line over the list until “Got it”. In your own order, the list's usual line. */
  hint?: { name: string; said: string }
}

/** Over a row, that row; in the hair between two, the nearest. */
const collide: CollisionDetection = (args) => {
  const hit = pointerWithin(args)
  return hit.length ? hit : closestCenter(args)
}



/**
 * The list itself, in place of the plain one. `face` draws a note's row as
 * every list does; `index` counts rows on show, which is what the keyboard's
 * cursor counts.
 */
export function GroupedList({ bundles, ordered, preview, onDrop, picked, onLetGo, onFold, onNewNote, onOpenFolder, renaming, suggested, onRenaming, born, noun, days, onSort, onSorted, parts, places, own: ownSort, hint, face, after, arrived, cursor, estimate, className }: Folds & {
  face: (entry: Entry, index: number) => React.JSX.Element
  after?: (entry: Entry) => ReactNode
  arrived: (id: string) => boolean
  cursor: number
  estimate: number
  className?: string
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [carried, setCarried] = useState<string | null>(null)
  // A group carried is folded while it is in the hand: one card, its row, and what it holds goes with it, so the room
  // it opens is a row's and nothing it leaves behind is a hole. It opens again where it is let go.
  const open = (group: GroupView): boolean => group.open && carried !== KEY + group.id
  const partKeys = (one: Bundle): string[] => (one.parts ?? one.entries.map((entry) => ({ entry }))).flatMap((part) => ('entry' in part ? [part.entry.id] : [KEY + part.group.id, ...(open(part.group) ? part.entries.map((entry) => entry.id) : [])]))
  const keys = bundles.flatMap((one) => (one.group ? [KEY + one.group.id, ...(open(one.group) ? partKeys(one) : [])] : one.entries.map((entry) => entry.id)))
  const subsOf = (one: Bundle): { group: GroupView; entries: Entry[] }[] => (one.parts ?? []).filter((part): part is { group: GroupView; entries: Entry[] } => 'group' in part)
  const info = useMemo(() => new Map(bundles.flatMap((one) => (one.group ? [[one.group.id, one.group] as const, ...subsOf(one).map((sub) => [sub.group.id, sub.group] as const)] : []))), [bundles]) // eslint-disable-line react-hooks/exhaustive-deps
  // The group each row on show is in (the innermost), for what a drop would mean.
  const home = useMemo(() => new Map(bundles.flatMap((one) => (one.group ? [
    ...one.entries.map((entry) => [entry.id, one.group!.id] as const),
    ...subsOf(one).flatMap((sub) => sub.entries.map((entry) => [entry.id, sub.group.id] as const))
  ] : []))), [bundles]) // eslint-disable-line react-hooks/exhaustive-deps
  // Each subgroup's group.
  const parentOf = useMemo(() => new Map(bundles.flatMap((one) => (one.group ? subsOf(one).map((sub) => [sub.group.id, one.group!.id] as const) : []))), [bundles]) // eslint-disable-line react-hooks/exhaustive-deps
  // The rows on show in each group's block, its own row first: what its panel follows.
  const blockRows = useMemo(() => bundles.flatMap((one) => (one.group ? [
    { id: one.group.id, rows: [KEY + one.group.id, ...(open(one.group) ? partKeys(one) : [])] },
    ...subsOf(one).map((sub) => ({ id: sub.group.id, rows: [KEY + sub.group.id, ...(open(one.group!) && open(sub.group) ? sub.entries.map((entry) => entry.id) : [])] }))
  ] : [])), [bundles, carried]) // eslint-disable-line react-hooks/exhaustive-deps
  // Everything carried, in the order it is read: the row in hand, and the rest picked with it.
  const [many, setMany] = useState<string[]>([])
  const manyRef = useRef<string[]>([])
  manyRef.current = many
  const shelfLit = useRef<HTMLElement | null>(null)
  const lightShelf = (next: HTMLElement | null): void => {
    if (shelfLit.current === next) return
    if (shelfLit.current) delete shelfLit.current.dataset.dropHot
    if (next) next.dataset.dropHot = ''
    shelfLit.current = next
  }
  // Where the row was taken hold of, across it: the chip sits just past it.
  const [grab, setGrab] = useState(60)
  const [from, setFrom] = useState<number | null>(null)
  // The room what is carried takes: a row for each note, or a group's folded block.
  const [span, setSpan] = useState(0)
  // A group lifted, open: how tall it was, so the list keeps that height while it is folded in the hand and a list
  // scrolled to its end does not jump.
  const [unfolded, setUnfolded] = useState(0)
  const [rowH, setRowH] = useState(0)
  // Let go with a drop: until the next lift, rows go straight to their places.
  const [snap, setSnap] = useState(false)
  const spanRef = useRef(0)
  spanRef.current = span
  // A group carried: how far its row sits inside its block's air.
  const [inset, setInset] = useState(0)
  const insetRef = useRef(0)
  insetRef.current = inset
  // Each new place ticks and taps once, and crossing a group's edge the firmer way.
  const { aim, aimed, start: startAim, point } = useAim()
  const card = useCardPlace(aim, (now) => !!now.make)
  // The groups the pointer last read as inside, for their edges' dead band.
  const inside = useRef(new Set<string>())
  // The pane the row was lifted in: its headings are read there alone (two panes can hold lists with the same parts).
  const pane = useRef<HTMLElement | null>(null)
  // Where what is carried was lifted from.
  const homeOf = (id: string | null): string | null => (id ? (isGroup(id) ? parentOf.get(id.slice(KEY.length)) : home.get(id)) ?? null : null)
  const onDragStart = ({ active, activatorEvent }: DragStartEvent): void => {
    const id = String(active.id)
    const pressed = activatorEvent?.target
    pane.current = pressed instanceof Element ? pressed.closest<HTMLElement>('[data-pane]') : null
    setFrom(activatorEvent instanceof PointerEvent ? activatorEvent.clientX : null)
    inside.current.clear()
    setSnap(false)
    chime('lift')
    startAim(id, homeOf(id))
    card.lift()
    setCarried(id)
    const all = bundles.flatMap((one) => one.entries.map((entry) => entry.id))
    if (!isGroup(id) && picked.includes(id) && picked.length > 1) setMany(all.filter((one) => picked.includes(one)))
    else {
      setMany([id])
      if (picked.length) onLetGo()
    }
    // Measured off the row itself: the drag's own first measure is not always taken yet at the lift.
    const start = document.querySelector<HTMLElement>(`[data-sortable-id="${CSS.escape(id)}"]`)?.getBoundingClientRect() ?? active.rect.current.initial
    setGrab(start && activatorEvent instanceof PointerEvent ? activatorEvent.clientX - start.left : 60)
    const row = start?.height ?? 48
    setRowH(row)
    const wrap = isGroup(id) ? document.querySelector<HTMLElement>(`[data-group-block="${CSS.escape(id.slice(KEY.length))}"]`)?.parentElement : null
    setInset(wrap && start ? start.top - wrap.getBoundingClientRect().top : 0)
    // A group's room is its block folded: as tall as it is less what it holds, from the lift on. Several notes carried
    // open the room of the one in hand (the others wait in their places): a room for all of them was a tall empty band.
    const holds = wrap?.querySelector<HTMLElement>(':scope > [data-group-block] > [data-fold]')?.getBoundingClientRect().height ?? 0
    setSpan(wrap ? wrap.getBoundingClientRect().height - holds : row)
    setUnfolded(wrap ? wrap.getBoundingClientRect().height : 0)
  }
  // Held over a folded group's row for a moment, the group opens, as a folder
  // does in Finder when something is held over it.
  const spring = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  const unspring = (): void => {
    if (spring.current) clearTimeout(spring.current.timer)
    spring.current = null
  }
  // Rested on a row's middle: once it has been there DWELL, letting go there makes a new folder, and the row lights to say so.
  const { rested, undwell } = useRest(() => lastMove.current && onDragMove(lastMove.current))
  // A tab, or another part's heading, lit while the carried row would go there (carry.tsx, one for every list).
  const targets = useTargets(places, parts, !!carried, () => lastMove.current && onDragMove(lastMove.current))
  // Aimed at the rows themselves (or at nothing): nothing else on the page stays lit.
  const aimAt = (next: Aim | null, mine?: boolean): void => (targets.dim(), point(next, mine))
  const name = (group: string | null | undefined): string => info.get(group ?? '')?.name ?? 'the group'
  // A group carried over the middle of anything inside a top-level group (its row, a subgroup's row, a note) aims at that group as a whole.
  const outerOf = (key: string): string | undefined => {
    const inner = isGroup(key) ? key.slice(KEY.length) : home.get(key)
    return inner ? parentOf.get(inner) ?? inner : undefined
  }
  const onDragMove = (event: DragMoveEvent): void => {
    lastMove.current = event
    const { active, activatorEvent, delta } = event
    const held = active.rect.current.initial
    if (held) card.follow(held.top + held.height / 2 + delta.y)
    const id = String(active.id)
    // A group's room is its block folded, measured once it has folded.
    if (isGroup(id)) {
      const wrap = document.querySelector<HTMLElement>(`[data-group-block="${CSS.escape(id.slice(KEY.length))}"]`)?.parentElement
      const tall = wrap?.getBoundingClientRect().height
      if (tall && Math.abs(tall - spanRef.current) > 0.5) setSpan(tall)
    }
    // Where the pointer is on the page, never the drag's own delta: that takes in the list's scroll as well, so held still
    // at the list's foot while it scrolled, it ran on past every row and the room went.
    const pointer = activatorEvent instanceof PointerEvent ? pointerAt() : null
    // With the split places up, letting go opens it there: nothing in the list lights too, whatever row it is level with.
    // Out of the window, nothing is aimed at, and letting go puts it back.
    if (!pointer || offWindow() || 'splitDrag' in document.documentElement.dataset) return (unspring(), undwell(), lightShelf(null), aimAt(null))
    // Several notes over a shelf folder: into that folder, not into whichever list row sits at the same height.
    if (manyRef.current.length > 1 && !isGroup(id)) {
      const folder = document.elementsFromPoint(pointer.x, pointer.y).reduce<HTMLElement | null>((found, node) => found ?? (node instanceof Element ? node.closest<HTMLElement>('[data-folder-drop]') : null), null)
      if (folder?.dataset.folderDrop) {
        const listKind = folder.dataset.folderList
        const row = document.querySelector<HTMLElement>(`[data-row][data-id="${CSS.escape(id)}"]`)
        const wrong = !!listKind && !!row?.dataset.type && row.dataset.type !== listKind
        const called = folder.dataset.folderName || 'this folder'
        lightShelf(folder)
        return aimAt({
          target: `folder:${folder.dataset.folderDrop}`,
          how: 'join',
          into: folder.dataset.folderDrop,
          label: wrong ? (listKind === 'nugget' ? 'Gems folders hold gems: make it a gem first' : 'Writing folders hold writing: make it a page first') : `Move ${num(manyRef.current.length)} into ${called}`,
          gap: null,
          around: [],
          refused: wrong || undefined,
          act: 'shelf',
        })
      }
    }
    lightShelf(null)
    // One row carried (not a group, not several) can go to a place on the page or to another part of the list.
    const alone = !isGroup(id) && manyRef.current.length < 2
    // A place on the page (a tab): it lights, and the card says what letting go there does.
    const spot = alone ? targets.place(id) : null
    if (spot) return (unspring(), undwell(), point(spot))
    // The row whose place the pointer is over, as the list lies before anything slid aside (as a sortable list reads it:
    // the room then opens just where the pointer is, and what it shows never feeds back into what is aimed at).
    // (Level with a part's heading, that part's first loose row: on a heading its part is meant, whichever row is nearer.)
    const over = (alone ? headRow(parts, () => keys.filter((key) => !isGroup(key) && !home.has(key)), pointer.y, pane.current) : null) ?? rowAt(new Set(keys), pointer.y)
    if (!over) return aimAt(null)
    const target = over.id
    // Past the real edge of a group round that row, for any group however far down the list: out of it, even with no row
    // below to be nearer to. Its own block is no edge to a group carried.
    const mine = isGroup(id) ? document.querySelector(`[data-group-block="${CSS.escape(id.slice(KEY.length))}"]`) : null
    const round: { id: string; top: number; bottom: number }[] = []
    for (let el = over.node.closest<HTMLElement>('[data-group-block]'); el; el = el.parentElement?.closest<HTMLElement>('[data-group-block]') ?? null) {
      // A group carried reads another group's whole block as beside it, below; only what holds it has an edge to leave by.
      if (el === mine || (mine && !el.contains(mine))) continue
      const box = el.getBoundingClientRect()
      round.unshift({ id: el.dataset.groupBlock!, top: box.top, bottom: box.bottom })
    }
    const past = pastEdge(round, pointer.y, inside.current)
    // Over its own place: nothing changes.
    // Carried well to the left: out of its folder, never into a new one, even over its own place.
    const outward = activatorEvent instanceof PointerEvent && activatorEvent.clientX - pointerNow() > OUTDENT
    if (target === id && !past && !outward) return aimAt(null, true)
    const shut = target && !isGroup(id) ? info.get(target.slice(KEY.length)) : undefined
    if (!shut || shut.open || !isGroup(target!)) unspring()
    else if (spring.current?.key !== target) {
      unspring()
      spring.current = { key: target!, timer: setTimeout(() => (click('tick'), onFold(shut, true), (spring.current = null)), 600) }
    }
    if (!past && manyRef.current.length > 1 && manyRef.current.includes(target)) return aimAt(null)
    const ids = manyRef.current.length > 1 ? manyRef.current : [id]
    const at = (pointer.y - over.top) / over.height
    const mover = ids[0]
    const homeFolder = isGroup(mover) ? parentOf.get(mover.slice(KEY.length)) : home.get(mover)
    const middle = !past && !outward && at > 0.28 && at < 0.72
    if (!middle) undwell()
    // A group carried over anything inside another group's block goes beside that whole block, so which side is read
    // against the block, not the row under the pointer: else every row's middle inside it flipped the room from above
    // the block to below it.
    let beside = target
    let side = at
    if (isGroup(id)) {
      const mine = document.querySelector(`[data-group-block="${CSS.escape(id.slice(KEY.length))}"]`)
      const chain: Element[] = []
      for (let el = document.querySelector(`[data-sortable-id="${CSS.escape(target)}"]`)?.closest('[data-group-block]'); el; el = el.parentElement?.closest('[data-group-block]') ?? null) chain.unshift(el)
      const unit = chain.find((one) => !mine || !one.contains(mine))
      if (unit) {
        const box = unit.getBoundingClientRect()
        beside = KEY + (unit as HTMLElement).dataset.groupBlock
        side = (pointer.y - box.top) / box.height
      }
    }
    // A row makes way for what comes over it, as Dia's do: the room opens where the pointer is, so what was under it moves
    // off, up if what is carried came from above, down if from below. Only the ends of a group keep a band for going
    // just inside them, first or last, where the row stays and the panel grows round the room.
    const way = (): 'before' | 'after' => {
      const [mine, overAt] = [keys.indexOf(mover), keys.indexOf(target)]
      const holder = home.get(target)
      if (mine < overAt) return holder && home.get(keys[overAt - 1]) !== holder && at < 0.28 ? 'before' : 'after'
      return holder && home.get(keys[overAt + 1]) !== holder && at > 0.72 ? 'after' : 'before'
    }
    // A group's own row is its edge: which half says in or out.
    const how = isGroup(id) || isGroup(target) ? sideOf(sided.current, beside, side) : way()
    sided.current = { key: beside, how }
    // What to try, in turn: over a row's middle, gathering with it (or going into its group); else, or where that does nothing, beside it.
    const tries: [string, How][] = []
    if (past) tries.push([KEY + past.id, past.how === 'after' ? 'out' : 'before'])
    else {
      // Left of where it was, over its own folder's rows (or that folder's own row): out of the folder, to just under it.
      if (outward && homeFolder && (target === KEY + homeFolder || home.get(target) === homeFolder || (isGroup(target) && parentOf.get(target.slice(KEY.length)) === homeFolder))) tries.push([KEY + homeFolder, 'out'])
      // Once going inside a group, a group carried stays going inside it while the pointer is anywhere but its block's ends.
      const whole = isGroup(id) ? outerOf(target) : undefined
      const going = !!whole && aimed.current?.how === 'join' && aimed.current.target === KEY + whole && side > 0.2 && side < 0.8
      if ((middle || going) && isGroup(id)) {
        if (whole && KEY + whole !== id) tries.push([KEY + whole, 'join'])
      } else if (middle) tries.push([target, 'join'])
      tries.push([beside, how])
      // Where the list's own rule places its rows, a place beside a group is none: the group's whole row takes the carried one in.
      if ((parts || ownSort) && isGroup(target) && !isGroup(id) && !middle) tries.push([target, 'join'])
    }
    for (const [where, how] of tries) {
      const land = preview(ids, where, how)
      if (!land) continue
      const lead = ids[0]
      const here = (group: string | undefined): string | null => (group && group !== land.root ? group : null)
      const own = here(groupOf(land.before, lead))
      const into = here(groupOf(land.after, lead))
      const held = groupsAround(land.after, lead)
      const around = land.root && held.includes(land.root) ? held.slice(0, held.indexOf(land.root)) : held
      const make = !!land.after.make
      // A new folder only once the pointer has rested on the row: until then it is a move beside it.
      if (make && how === 'join' && !rested(where)) continue
      // The room opens after the row it will follow on show, leaving out what is carried and what a carried group takes along.
      const known = new Set(keys)
      const seq = land.shown.filter((key) => key === lead || (known.has(key) && !ids.includes(key)))
      const prev = seq[seq.indexOf(lead) - 1]
      // Into a folded group it goes out of sight, and in a list sorted some other way it takes its sorted place in its new group:
      // either way nothing opens, only that group lights.
      const gap = !seq.includes(lead) || (!ordered && (into !== own || make)) ? null : prev === undefined ? -1 : keys.indexOf(prev)
      const n = ids.length
      const some = n > 1 ? `${num(n)} ` : ''
      const outer = make ? groupOf(land.after, KEY + into) ?? null : null
      // Inside a folder a new group is simply a group there; inside a group it is a subgroup, as the old list said.
      const sub = !!outer && !info.get(outer)?.folder
      const words =
        make ? (sub ? (n > 1 ? `New subgroup of ${num(n + 1)}` : `New subgroup in ${name(outer)}`) : n > 1 ? `New group of ${num(n + 1)}` : 'New group')
        : into !== own ? (into ? (isGroup(lead) ? `Put inside ${name(into)}` : own ? `Move ${some}to ${name(into)}` : `Add ${some}to ${name(into)}`) : isGroup(lead) ? `Move out of ${name(own)}` : `Remove ${some}from ${name(own)}`)
        : `${n > 1 ? `Move ${num(n)} here` : 'Move here'}${ordered || ownSort ? '' : ' · Custom order'}`
      // In the gap row's own group (or first in the group whose row it is), the room sits close under it.
      const gapRow = gap !== null && gap >= 0 ? keys[gap] : undefined
      // First in its part, the row before it on show is another part's: the room sits just over the next row, under their heading.
      const snug = gapRow !== undefined && (isGroup(gapRow) ? gapRow.slice(KEY.length) === (make ? outer : into) : (home.get(gapRow) ?? null) === (make ? outer : into) && (!parts || parts.of(gapRow) === parts.of(lead)))
      // A group's block sits in 8px of air at the top level and 4px inside a group.
      const fit = isGroup(lead) ? (into ? 4 : 8) - (own ? 4 : 8) : 0
      // Last in a group whose next row on show is outside it (Group 3 carried below Group 2, the last thing in Apple Notes /
      // Notes): the room ends where that group's rows end, not just over the next row, past the group's own edge and air.
      const landing = make ? outer : into
      const next = gap !== null && !snug ? keys[gap + 1] : undefined
      const box = landing ? document.querySelector<HTMLElement>(`[data-group-block="${CSS.escape(landing)}"]`) : null
      const list = box?.querySelector<HTMLElement>(':scope > [data-fold] > div > div > div')
      const node = next && document.querySelector(`[data-sortable-id="${CSS.escape(next)}"]`)
      const until = list && node && !box!.contains(node) ? Math.round(list.getBoundingClientRect().bottom - parseFloat(getComputedStyle(list).paddingBottom)) : undefined
      return aimAt({ target: where, how, into: make ? outer : into, label: words, make, gap, snug, fit, until, around: make ? around.slice(1) : around, tint: tintOf(info.get((make ? outer : into) ?? own ?? '')?.color) })
    }
    // Over a row of another part, where the list's own rule says which part a row is in: nothing opens. That part's
    // heading lights (the row itself, where no heading stands over it) and the card says what letting go does, or why
    // it cannot go there. Never a quiet band that says nothing.
    const other = alone && !isGroup(target) ? targets.part(id, target, pane.current, over.node) : null
    if (other) return point(other)
    if (parts && !alone && !isGroup(id) && !isGroup(target) && parts.of(target) !== undefined) return aimAt({ target, how: 'join', into: null, label: 'Carry one at a time to move it there', gap: null, around: [], refused: true })
    aimAt(null)
  }
  useCarriedLeft(from, !!carried, () => lastMove.current && onDragMove(lastMove.current))
  // Rows changed under a still pointer (a folded group sprung open): aimed afresh once they have settled.
  const lastMove = useRef<DragMoveEvent | null>(null)
  // The side last chosen, and beside what: kept through the dead band round the middle.
  const sided = useRef<{ key: string; how: 'before' | 'after' } | null>(null)
  const shape = keys.join('\n')
  useEffect(() => {
    if (!carried || !lastMove.current) return
    const again = setTimeout(() => lastMove.current && onDragMove(lastMove.current), 240)
    return () => clearTimeout(again)
  }, [shape]) // eslint-disable-line react-hooks/exhaustive-deps
  const end = (): void => {
    lastMove.current = null
    sided.current = null
    unspring()
    undwell()
    lightShelf(null)
    setMany([])
    setCarried(null)
    aimAt(null)
  }
  const onDragEnd = ({ active }: DragEndEvent): void => {
    const carriedIds = manyRef.current.length > 1 ? manyRef.current.slice() : [String(active.id)]
    const now = aimed.current
    end()
    if (now?.act === 'shelf') {
      if (now.refused) return refuse(now.label ?? '')
      const ids = carriedIds.filter((one) => !isGroup(one))
      if (now.into && ids.length) window.dispatchEvent(new CustomEvent('haligtree:folder-drop', { detail: { group: now.into, ids } }))
      return
    }
    if (!now || now.target === String(active.id)) return chime('stay')
    // A refusal, a tab or another part's heading: said or done by the list's own rule, and no row changes place.
    const done = targets.drop(String(active.id), now)
    if (done) return void (done.said !== undefined && refuse(done.said))
    setSnap(true)
    onDrop(manyRef.current.length > 1 ? manyRef.current : [String(active.id)], now.target, now.how)
  }
  let index = 0
  const lines = bundles.map((one) => {
    const start = index
    if (!one.group || one.group.open) index += shownIn(one)
    return { one, start }
  })
  // A group drawn as a panel (a folder is a plain row) stands 12px clear of whatever is next to it, as the islands do.
  const panel = (n: number): boolean => !!lines[n]?.one.group && !lines[n].one.group?.folder
  const airAbove = (n: number): string => (n > 0 && !lines[n].one.head && (panel(n) || panel(n - 1)) ? 'pt-2.5' : '')
  const line = lines.findIndex(({ one, start }) => cursor >= start && cursor < start + ((!one.group || one.group.open) ? shownIn(one) : 0))
  const row = (entry: Entry, at: number, inner?: CSSProperties, indent?: number): React.JSX.Element => (
    <CarryRow key={entry.id} id={entry.id} inner={inner} indent={indent}>
      <div className={`group/item relative ${arrived(entry.id) ? 'mf-arrive' : ''}`}>
        {face(entry, at)}
        {after?.(entry)}
      </div>
    </CarryRow>
  )
  // A group's block, and inside it each subgroup's, drawn the same way one level in.
  const block = (group: GroupView, entries: Entry[], parts: Part[] | undefined, start: number, inner = false): React.JSX.Element => (
    <GroupBlock key={group.id} group={group} entries={entries} parts={parts} start={start} cursor={cursor} estimate={estimate} row={row} inner={inner} carried={carried === KEY + group.id} renaming={renaming === group.id} suggested={suggested?.id === group.id ? suggested.name : null}
      born={born === group.id} onRenaming={(on) => onRenaming(on ? group.id : null)} onFold={(open) => onFold(group, open)} onNewNote={onNewNote} onOpenFolder={onOpenFolder} onSort={onSort} onSorted={onSorted} noun={noun}
      sub={(child, at) => block(child.group, child.entries, child.parts, at, true)} />
  )
  return (
    // The list scrolls by itself only in the last tenth by its top and bottom edges: a row near an edge can still be aimed at.
    <DndContext accessibility={dragWords} sensors={sensors} collisionDetection={collide} modifiers={[upDown]} autoScroll={{ threshold: { x: 0, y: 0.1 } }} measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
      onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => (end(), chime('stay'))}>
      <SortableContext items={keys} strategy={unmoved}>
        <Shaped aim={aim} keys={keys} hand={carried} home={homeOf(carried)} many={many} span={span} inset={inset} row={rowH} snap={snap} blocks={blockRows}>
          {(hint || ordered) && <DragHint {...(hint ?? OWN_ORDER)} />}
          <VirtualList items={lines} held={carried} keyOf={({ one }) => (one.group ? KEY + one.group.id + (shownIn(one) > BIG ? ':big' : '') : one.entries[0].id)} holds={({ one }, id) => one.entries.some((entry) => entry.id === id)} cursor={line >= 0 ? line : undefined} estimate={estimate} className={className}
            // A big group's line is keyed apart from a small one's: emptied in one step (2,500 rows to none), the list
            // would place every row under it by the height it measured before, scroll there and draw it all twice.
            sizeOf={({ one }) => (one.group?.open ? estimate * (1 + shownIn(one)) : estimate)}>
            {({ one, start }, n) =>
              one.group ? (
                // A folder row keeps the rows' own rhythm, as Finder's list does: no air of its own above or below.
                <div className={airAbove(n)}>
                {block(one.group, one.entries, one.parts, start)}
                </div>
              ) : one.head ? (
                <>
                  {/* A group forming on a row above it moves every row after that row down: the heading goes with them. */}
                  <Slid row={one.entries[0].id}><SectionHead head={one.head} first={start === 0} day={days} /></Slid>
                  {row(one.entries[0], start)}
                </>
              ) : airAbove(n) ? (
                <div className={airAbove(n)}>{row(one.entries[0], start)}</div>
              ) : (
                row(one.entries[0], start)
              )
            }
          </VirtualList>
          {carried && unfolded > span && <div aria-hidden data-kept-height="" style={{ height: unfolded - span }} />}
        </Shaped>
      </SortableContext>
      <Overlay dropAnimation={still() ? null : SETTLE}>
        {carried && <Ghost carried={carried} bundles={bundles} many={many} aim={aim} grab={grab} from={from} rest={card.rest} />}
      </Overlay>
    </DndContext>
  )
}


/**
 * What is carried: one small card beside the pointer, the same one the whole
 * way, whatever it is over. Its words change in place (Move here, Add to
 * Memory, New group), and it stays under the pointer the whole way. Where
 * letting go would do nothing, it says why. A group shows by its icon and name;
 * several notes, the one in hand on a small pile with their count (CarriedCount).
 */
function Ghost({ carried, bundles, many, aim, grab, from, rest }: { carried: string; bundles: Bundle[]; many: string[]; aim: Aim | null; grab: number; from: number | null; rest: MotionValue<number> }): React.JSX.Element {
  const group = isGroup(carried) ? bundles.flatMap((one) => (one.group ? [one.group, ...(one.parts ?? []).flatMap((part) => ('group' in part ? [part.group] : []))] : [])).find((one) => KEY + one.id === carried) : undefined
  const entry = group ? undefined : bundles.flatMap((one) => one.entries).find((one) => one.id === carried)
  return (
    <Hand grab={grab} from={from} rest={rest}>
      <CarriedCard attrs={{ 'data-ghost': '' }} icon={group ? <GroupIcon icon={group.icon} color={group.color} /> : entry ? <entry.icon className="size-4 shrink-0" style={{ color: entry.tint }} /> : null}
        title={group?.name ?? (entry?.title || 'New note')} strong={!!group} words={aim?.label ?? (aim ? 'Move here' : null)} tint={aim?.tint} refused={!!aim?.refused} />
      {/* How many this card is talking about. A new group takes the row it rests on as well, so the badge names that group, the same number as the sentence. */}
      {many.length > 1 && <CarriedCount n={aim?.make ? many.length + 1 : many.length} carried={many.length} />}
    </Hand>
  )
}

/** A list in your own order: rows can be carried, and gathered. */
const OWN_ORDER = { name: 'own-order', said: "Drag a row to move it, or past its group's edge to take it out. Hold it on another row to make a group." }

/** What carrying a row does in this list, said once in a line over it (each kind of list once, by `name`) until “Got it”: the grip on a row promises only what this says. */
function DragHint({ name, said }: { name: string; said: string }): React.JSX.Element | null {
  const said_ = (kind: string): boolean => {
    try {
      return !!localStorage.getItem(`hint:${kind}`)
    } catch {
      return true
    }
  }
  // Which kind of list's line this is, and whether it is up. A kind already said stays unsaid, with one exception:
  // the list changes kind under a line that is showing (a row let go in a sorted list turns it to your own order).
  // Then the new kind's line takes the old one's place, so the rows do not jump up by a line under the row just let
  // go (qa/group-drag-hints.mjs, "it sits where the room was": 26px off before this).
  const [up, setUp] = useState(() => ({ name, on: !said_(name) }))
  if (up.name !== name) setUp({ name, on: up.on || !said_(name) })
  if (!up.on || up.name !== name) return null
  const done = (): void => {
    setUp({ name, on: false })
    try {
      localStorage.setItem(`hint:${name}`, '1')
    } catch {
      // Not kept: it shows again next time, which is harmless.
    }
  }
  return (
    <p data-drag-hint={name} {...(name === OWN_ORDER.name ? { 'data-own-order-hint': '' } : {})} className="mb-1 flex items-center gap-2 px-2 text-xs text-muted-foreground animate-in fade-in-0 duration-300">
      <GripVertical aria-hidden className="size-3 shrink-0" />
      <span className="min-w-0 flex-1">{said}</span>
      <button type="button" onClick={done} className="flex h-6 shrink-0 items-center rounded px-1.5 hover:bg-accent hover:text-foreground">Got it</button>
    </p>
  )
}


/** A folder's small drawing, in exactly the box a page's thumbnail takes (row-shape.ts), so the list's left column never changes size. */
function GroupTile({ group, empty = false, ...rest }: { group: GroupView; empty?: boolean } & React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return (
    <span {...rest} data-group-tile="" data-row-mark="" className={ROW_TILE}>
      <FolderMark icon={group.icon} color={group.color} empty={empty} className="h-[1.75rem] w-9" />
    </span>
  )
}

/**
 * A click on a group's icon changes it, as in Notion; the rest of the row folds. The press is noted as it is pressed,
 * so the click that follows can land on the row instead: the row reads this and opens the picker rather than folding.
 */
let iconPressed = 0
const pressedIcon = (): boolean => {
  const was = Date.now() - iconPressed < 1000
  iconPressed = 0
  return was
}

/** A group's small icon and its chevron, side by side in the box a page's thumbnail takes, so its name starts where a page's title does. */
function PanelTile({ group, onIcon, ...rest }: { group: GroupView; onIcon?: () => void } & React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return (
    <span {...rest} data-group-tile="" data-row-mark="" className="flex size-9 shrink-0 items-center justify-center gap-0.5">
      <span data-group-icon="" role="button" aria-label="Change icon" className="-m-0.5 grid cursor-pointer place-items-center rounded-sm p-0.5 transition-colors hover:bg-foreground/10"
        onPointerDown={() => void (onIcon && (iconPressed = Date.now()))}
        onClick={(event) => onIcon && (event.stopPropagation(), event.preventDefault(), (iconPressed = 0), chime('open'), onIcon())}>
        <GroupIcon icon={group.icon} color={group.color} className="size-3.5" />
      </span>
      <ChevronRight
        aria-hidden
        className="size-3 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none"
        style={{ transitionTimingFunction: OUT, transform: `rotate(${group.open ? 90 : 0}deg)` }}
      />
    </span>
  )
}

/**
 * A folder drawn small, for a row: its tab and back, its front in the folder's colour (the theme's ink where it has
 * none), and its emoji or icon on the front, so a folder row reads as a folder beside a page's tile.
 */
export function FolderMark({ icon, color, className, empty = false }: { icon: string | null; color: string | null; className?: string; /** Nothing in it: drawn open and hollow, no front, so an empty folder reads as empty at a glance. */ empty?: boolean }): React.JSX.Element {
  const ink = color ? `var(--tt-color-text-${color})` : 'var(--foreground)'
  if (empty)
    return (
      <span data-folder-mark="" data-folder-empty="" aria-hidden className={cn('relative block h-[1.375rem] w-[1.75rem] shrink-0 transition-transform duration-150 ease-out group-active/row:scale-[0.94] motion-reduce:transition-none', className)} style={{ '--ink': ink } as CSSProperties}>
        {/* Only its outline, dashed, the inside the page's own colour: a folder with nothing in it. */}
        <svg viewBox="0 0 28 22" className="absolute inset-0 size-full overflow-visible">
          <path d="M1 3a2 2 0 0 1 2-2h6.2a2 2 0 0 1 1.4.6l1.4 1.4h13a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2Z"
            style={{ fill: 'transparent', stroke: 'color-mix(in oklab, var(--ink) var(--mark-edge), transparent)', strokeWidth: 1, strokeDasharray: '2.5 2' }} />
        </svg>
        {icon && <span className="absolute inset-x-0 bottom-0 top-[4px] flex items-center justify-center opacity-45 grayscale-[0.6] [&>span]:text-[0.6875rem] [&_svg]:size-3"><GroupIcon icon={icon} color={color} className="size-3" /></span>}
      </span>
    )
  return (
    <span data-folder-mark="" aria-hidden className={cn('relative block h-[1.375rem] w-[1.75rem] shrink-0 transition-transform duration-150 ease-out group-active/row:scale-[0.94] motion-reduce:transition-none', className)} style={{ '--ink': ink } as CSSProperties}>
      {/* The back, with its tab. */}
      <svg viewBox="0 0 28 22" className="absolute inset-0 size-full overflow-visible">
        <path d="M1 3a2 2 0 0 1 2-2h6.2a2 2 0 0 1 1.4.6l1.4 1.4h13a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2Z"
          style={{ fill: 'color-mix(in oklab, var(--ink) var(--mark-back), var(--background))', stroke: 'color-mix(in oklab, var(--ink) var(--mark-edge), transparent)', strokeWidth: 0.75 }} />
      </svg>
      {/* The front, its icon on it. */}
      <span className="absolute inset-x-[1px] bottom-[1px] top-[5px] flex items-center justify-center rounded-[2.5px] shadow-[inset_0_1px_0_color-mix(in_oklab,white_45%,transparent)] [&>span]:text-[0.6875rem] [&_svg]:size-3"
        style={{ background: 'color-mix(in oklab, var(--ink) var(--mark-front), var(--background))', border: '0.75px solid color-mix(in oklab, var(--ink) var(--mark-edge), transparent)' }}>
        {icon ? <GroupIcon icon={icon} color={color} className="size-3" /> : null}
      </span>
    </span>
  )
}

/** A picture of your own as a folder's icon: stored with the book's pictures (a GIF keeps moving). */
const isPicture = (icon: string | null): icon is string => !!icon && icon.startsWith('haligtree://assets/')

/** A group's icon: a picture of your own, an emoji, a kind's drawing, or the stack every group starts with, in its colour. */
export function GroupIcon({ icon, color, className = 'size-4' }: { icon: string | null; color: string | null; className?: string }): React.JSX.Element {
  const kind = icon?.startsWith('kind:') ? CAPTURE_TYPES.find((one) => one.id === icon.slice(5)) : undefined
  const tint = tintOf(color)
  if (kind) return <kind.icon className={className} style={{ color: tint ?? kind.tint }} />
  if (isPicture(icon)) return <img data-folder-picture src={small(icon)} alt="" draggable={false} className={cn(className, 'shrink-0 rounded-[3px] object-contain')} />
  if (icon) return <span className="text-[0.95rem] leading-none">{icon}</span>
  return <Layers className={cn(className, !tint && 'text-muted-foreground')} style={{ color: tint }} />
}

/** Set a group's look: it shows in place, and ⌘Z takes it back. */
export const change = (group: GroupView, patch: Parameters<typeof groups.set>[1]): void => {
  const was = { name: group.name, icon: group.icon, color: group.color }
  void groups.set(group.id, patch).then(() => {
    quietly(() => void groups.set(group.id, was))
    // Named as a tag is: an offer to move that tag's notes in (side-folders.tsx).
    if (patch.name) void offerTag(null, group.id, patch.name)
  })
}

/**
 * A group made a folder (its notes then live only in it, and it opens as a place) or a folder made a group (its notes
 * back in the list, in a panel): said, with Undo. Refused, with the reason, where that kind cannot stand.
 */
export const convert = (group: { id: string; name: string; folder: number | boolean }): void => {
  const folder = !group.folder
  void groups.set(group.id, { folder }).then((ok) => {
    if (!ok) return refuse(folder ? 'A folder cannot stand inside a group' : 'It holds a folder: a group cannot')
    chime('tap')
    toast(folder ? `${group.name} is a folder now: its notes live only in it` : `${group.name} is a group now: its notes are in the list again`,
      () => void groups.set(group.id, { folder: !folder }))
  })
}

function GroupBlock({ group, entries, parts, start, cursor, estimate, row, carried, renaming, suggested, born, onRenaming, onFold, onNewNote, onOpenFolder, onSort, onSorted, sub, noun = 'note', inner = false }: {
  onOpenFolder?: (id: string) => void
  /** What this list holds, for its count: "17 pages", "17 gems", "17 questions". */
  noun?: string
  group: GroupView
  entries: Entry[]
  /** Its notes and subgroups in order; left out, its notes alone. */
  parts?: Part[]
  /** A subgroup's own block. */
  sub: (part: { group: GroupView; entries: Entry[]; parts?: Part[] }, start: number) => React.JSX.Element
  /** A subgroup, drawn inside its group. */
  inner?: boolean
  start: number
  /** The keyboard's row, counted over the whole list, and a row's height before it is measured. */
  cursor: number
  estimate: number
  row: (entry: Entry, at: number, inner?: CSSProperties, indent?: number) => React.JSX.Element
  carried: boolean
  renaming: boolean
  born: boolean
  suggested?: string | null
  onRenaming: (on: boolean) => void
  onFold: (open: boolean) => void
  onNewNote: (id: string) => void
  onSort?: (ids: string[]) => void
  onSorted?: (ids: string[], sorted: boolean) => void
}): React.JSX.Element {
  const [menu, setMenu] = useState(false)
  const [picking, setPicking] = useState(false)
  const [pointing, setPointing] = useState(false)
  const [parted, setParting] = useState(false)
  const parting = parted || !!group.parting
  // A folder is a place: one row that opens it. A group is the panel it always was, its notes inside it in the list.
  const place = group.folder
  // Just made: its row unfolds above the two notes, a moment after it is drawn.
  const [arrived, setArrived] = useState(!born || still() || byKeys())
  useEffect(() => {
    if (arrived) return
    const frame = requestAnimationFrame(() => setArrived(true))
    return () => cancelAnimationFrame(frame)
  }, [arrived])
  const count = entries.length
  // Each part in turn, a note's row or a subgroup's block, with the rows on show counted as they go; and the one the keyboard is in.
  let next = start
  const placed = (parts ?? entries.map((entry) => ({ entry }))).map((part) => {
    const at = next
    next += onShow(part)
    return { part, at }
  })
  const inside = placed.findIndex(({ part, at }) => cursor >= at && cursor < at + onShow(part))
  const tint = tintOf(group.color)
  const key = KEY + group.id
  const { aim, shapes, hand, snap } = useContext(Carrying)
  // Carrying, the panel lights only when letting go would leave the row in this very group, never one around it.
  const landing = !!aim && aim.into === group.id
  // Its edges follow its rows as they make room or close over a gap, on the compositor.
  const shape = shapes.get(group.id) ?? REST
  const block = useRef<HTMLDivElement>(null)
  const tall = useTall(block)
  const fold = (): void => {
    chime(group.open ? 'tuck' : 'untuck')
    onFold(!group.open)
  }
  // Separate: the panel fades, the notes slide back out to the list's edge one
  // after another, the row folds away, and only then is it done.
  const separate = (): void => {
    chime('separate')
    setParting(true)
    setTimeout(async () => {
      const was = await groups.separate(group.id)
      if (!was) return (setParting(false), refuse(place ? 'That folder is already gone' : 'That group is already gone'))
      toast(place ? `Deleted ${group.name}: ${count === 1 ? 'its note moved up' : count ? `its ${num(count)} notes moved up` : 'it was empty'}` : `Separated: ${count === 1 ? 'the note stays' : `all ${num(count)} notes stay`}`,
        () => void groups.restore(was).then(() => chime('gather')))
    }, still() ? 0 : 140 + count * 40)
  }
  // A new name shows at once and stays, never the old one flashing back while the save is on its way.
  const [named, setNamed] = useState<string | null>(null)
  useEffect(() => void (named !== null && named === group.name && setNamed(null)), [named, group.name])
  const name = named ?? group.name
  const rename = (next: string): void => {
    onRenaming(false)
    if (!next.trim() || next.trim() === group.name) return
    setNamed(next.trim())
    change(group, { name: next.trim() })
  }
  const shown = (menu || picking || renaming || landing || pointing || !arrived || born) && !parting
  // Pointed at: its own panel deepens, never a subgroup's inside it.
  const [over, setOver] = useState(false)
  // Deeper while pointed at. While something is carried, every panel rests, and only the one it would land in lights (PanelParts' wash).
  const depth = (tint ? 6 : 3.5) * (hand ? 1 : pointing ? 2.2 : shown || over ? 1.6 : 1)
  return (
    <div
      ref={block}
      data-group-block={group.id}
      data-subgroup={inner ? '' : undefined}
      data-active={shown ? '' : undefined}
      data-landing={landing ? '' : undefined}
      onPointerOver={(event) => setOver(!(event.target as Element).closest('[data-group-block]') || (event.target as Element).closest('[data-group-block]') === event.currentTarget)}
      onPointerLeave={() => setOver(false)}
      // At the top level its panel is the rows' own box: folded, it is one row's box, and what is in it starts and ends where every other row does (qa/row-shape.mjs).
      data-folder-row={place ? '' : undefined}
      // A group inside a group stands in from its parent's sides, its panel inside the parent's, never edge to edge (16 Nov).
      className={cn('group/fold relative isolate', inner && !place && 'mx-3 px-1 py-0.5')}
      style={{ '--group-tint': tint ?? 'var(--foreground)' } as CSSProperties}
    >
      {/* The panel: always there, faint, with a hairline round it; deeper while pointed at, or while something is about to happen to it. */}
      <div
        aria-hidden
        data-panel=""
        className={cn(
          'pointer-events-none absolute inset-0 -z-10 origin-top transition-[opacity,scale] duration-200 motion-reduce:transition-none',
          carried && 'opacity-0!',
          // A folder has no box of its own: its panel shows only to light where a drop would land. A group's is always there.
          place && !landing && 'opacity-0',
          parting && 'scale-[0.98] opacity-0!',
          !arrived && 'scale-[0.97] opacity-0'
        )}
        style={{
          transitionTimingFunction: OUT,
          '--panel-fill': `color-mix(in srgb, var(--group-tint) ${depth}%, transparent)`,
          '--panel-edge': `color-mix(in srgb, var(--group-tint) ${tint ? 16 : 9}%, transparent)`,
          '--panel-lit': `color-mix(in srgb, var(--group-tint) ${tint ? 6 : 4}%, transparent)`
        } as CSSProperties}
      >
        <PanelParts id={group.id} shape={shape} tall={tall} lit={landing} snap={snap} />
      </div>
      {/* The row: folded away until a group just made unfolds it, and as a separated one goes. */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none"
        style={{ transitionTimingFunction: OUT, gridTemplateRows: arrived && !parting ? '1fr' : '0fr', opacity: arrived && !parting ? 1 : 0, transitionDelay: parting ? `${count * 40}ms` : undefined }}
      >
        <div className={cn('min-h-0 min-w-0', (!arrived || parting) && 'overflow-hidden')}>
          <CarryRow id={key}>
            <Popover open={picking} onOpenChange={setPicking}>
              <ContextMenu onOpenChange={setMenu}>
                <ContextMenuTrigger asChild data-row-menu>
                  {renaming ? (
                    <div className={cn(ROW_SHAPE, place ? ROW_PAD : HEAD, 'data-[state=open]:bg-transparent!')}>
                      <PopoverAnchor asChild>{place ? <GroupTile group={group} empty={count === 0} /> : <PanelTile group={group} onIcon={() => setPicking(true)} />}</PopoverAnchor>
                      <NameInPlace
                        initial={group.name}
                        suggested={suggested}
                        label={place ? 'Folder name' : 'Group name'}
                        onDone={(words) => (words === null ? onRenaming(false) : rename(words))}
                        className={cn('min-w-0 flex-1 rounded-sm bg-transparent outline-none placeholder:text-muted-foreground', place ? 'text-control font-medium' : 'text-xs font-semibold')}
                        placeholder={place ? 'Name the folder' : 'Name the group'}
                      />
                    </div>
                  ) : place ? (
                    <button
                      type="button"
                      data-group-row={group.id}
                      aria-label={name}
                      // A folder is a place, as in Finder: a click or Enter opens it, and nothing unfolds in the list.
                      onClick={() => onOpenFolder && (chime('open'), onOpenFolder(group.id))}
                      onKeyDown={(event) => {
                        if ((event.key === 'Enter' || event.key === ' ') && onOpenFolder) return (event.preventDefault(), event.stopPropagation(), chime('open'), onOpenFolder(group.id))
                        if (event.key === 'F2') (event.preventDefault(), onRenaming(true))
                      }}
                      // A row as tall as a page's, its folder in the thumbnail's own box, its name on the titles' line, its count on the right.
                      className={cn(ROW_SHAPE, ROW_PAD, 'cursor-pointer hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent/60')}
                      style={{ paddingRight: group.unsorted?.length && onSort ? '19rem' : undefined }}
                    >
                      <PopoverAnchor asChild><GroupTile group={group} empty={count === 0} /></PopoverAnchor>
                      <span data-folder-row-name="" className="min-w-0 flex-1 truncate text-control font-medium text-foreground">{name}</span>
                      {/* How many it holds, on the right as Finder says it, in this list's own word. */}
                      <span className="shrink-0 text-meta text-muted-foreground tabular-nums"><Count n={count} /> {count === 1 ? noun : `${noun}s`}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-group-row={group.id}
                      aria-expanded={group.open}
                      onClick={() => (pressedIcon() ? (chime('open'), setPicking(true)) : fold())}
                      onDoubleClick={() => onRenaming(true)}
                      // ← folds and → unfolds, as a folder in a list does; F2 renames it.
                      onKeyDown={(event) => {
                        if ((event.key === 'ArrowLeft' && group.open) || (event.key === 'ArrowRight' && !group.open)) (event.preventDefault(), fold())
                        if (event.key === 'F2') (event.preventDefault(), onRenaming(true))
                      }}
                      // A slim title bar: its box and focus ring are a page row's (row-shape.ts), its icon and chevron sit in a page's tile column,
                      // so its name starts on the page titles' line; only its right side keeps room for its buttons.
                      className={cn(ROW_SHAPE, HEAD, 'cursor-pointer data-[state=open]:bg-transparent!')}
                      style={{ paddingRight: group.unsorted?.length && onSort ? '12.5rem' : '0.5rem' }}
                    >
                      <PopoverAnchor asChild><PanelTile group={group} onIcon={() => setPicking(true)} /></PopoverAnchor>
                      <span className="min-w-0 truncate text-xs font-semibold">{name}</span>
                      {/* How many it holds, open or folded, on the right as a folder's row says it: one place whatever the name's length. */}
                      <span className={cn('ml-auto shrink-0 pl-3 text-xs text-muted-foreground tabular-nums transition-opacity duration-150', (over || shown) && 'opacity-0')}><Count n={count} /> {count === 1 ? noun : `${noun}s`}</span>
                      {/* Open, a hairline under it, inside the group's box. */}
                      {group.open && <span aria-hidden data-head-line="" className="pointer-events-none absolute inset-x-2 bottom-0 h-px" style={{ background: `color-mix(in srgb, var(--group-tint) ${tint ? 18 : 10}%, transparent)` }} />}
                    </button>
                  )}
                </ContextMenuTrigger>
                <GroupMenu group={group} members={entries.map((entry) => entry.id)} holdsGroups={!!parts?.some((one) => 'group' in one)} onOpenFolder={onOpenFolder && (() => (chime('open'), onOpenFolder(group.id)))} onSeparate={separate} onRename={() => onRenaming(true)} onIcon={() => setPicking(true)} onNewNote={onNewNote} onSort={onSort} onSorted={onSorted} noun={noun === 'goal' ? 'goal' : 'note'} />
              </ContextMenu>
              {/* Open until an icon is picked, Esc, or a click elsewhere: the focus moving on as the menu shuts never closes it. */}
              <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0" onFocusOutside={(event) => event.preventDefault()}>
                <IconChoice group={group} onPick={(icon) => (change(group, { icon }), chime('tap'), setPicking(false))} />
              </PopoverContent>
            </Popover>
            {/* What is left to sort, on its own pill by the name, a click from the pass through them. */}
            {!renaming && !!group.unsorted?.length && onSort && (
              <Tip label="Go through them one at a time: keep, tag, move or bin each">
                <button
                  type="button"
                  data-sort-these={group.unsorted.length}
                  onClick={() => onSort(group.unsorted!)}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="absolute top-1/2 flex h-6 -translate-y-1/2 cursor-pointer! items-center gap-1.5 rounded-full px-2.5 text-control font-medium text-foreground transition-[filter] hover:brightness-95 dark:hover:brightness-125"
                  style={{ right: place ? '6rem' : '2rem', background: `color-mix(in srgb, var(--tt-color-text-orange) 14%, var(--background))` }}
                >
                  <span aria-hidden className="size-1.5 rounded-full shrink-0 bg-[var(--tt-color-text-orange)]" />
                  <span className="tabular-nums"><Rolling text={group.unsorted.length} /> to sort</span>
                  <span aria-hidden className="text-foreground/40">·</span>
                  <span>Sort these</span>
                </button>
              </Tip>
            )}
            {/* A group's ×, shown while it is pointed at: Separate, its notes staying where they are. */}
            {!place && !renaming && (
              <Tip label={`Separate: keeps ${count === 1 ? 'the note' : `all ${num(count)} notes`}`}>
                <button
                  type="button"
                  data-group-separate=""
                  aria-label="Separate"
                  onClick={separate}
                  onMouseEnter={() => setPointing(true)}
                  onMouseLeave={() => setPointing(false)}
                  // Not a handle: pressing here never lifts the group.
                  onPointerDown={(event) => event.stopPropagation()}
                  className={cn('absolute top-[1.125rem] right-0.5 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100', over || shown ? 'opacity-100' : 'opacity-0')}
                >
                  <Cross className="size-3.5" />
                </button>
              </Tip>
            )}
          </CarryRow>
        </div>
      </div>
      <Fold open={!place && group.open && !carried}>
        {(() => {
          const one = ({ part, at }: (typeof placed)[number], index: number): React.JSX.Element =>
            'entry' in part
              // Separating, they fade one after another.
              ? row(part.entry, at, { transitionDelay: parting ? `${index * 40}ms` : undefined, opacity: parting ? 0.6 : undefined }, INDENT)
              // Its twig meets its heading's middle, not the middle of all it holds.
              : <div key={part.group.id} data-twig-top={20} className="py-0.5">{sub(part, at)}</div>
          // A big group draws only the rows near the screen, as a plain list does: one of 2,500 drew every one, and ⌘A or a
          // fold froze the window. A small one draws them all, the way its carried rows and panel are measured.
          return placed.length > BIG ? (
            <div className="pb-[3px]">
              <VirtualList items={placed} keyOf={({ part }) => ('entry' in part ? part.entry.id : part.group.id)} cursor={inside >= 0 ? inside : undefined} estimate={estimate} rowClass="pb-px">
                {one}
              </VirtualList>
            </div>
          ) : placed.length ? (
            // Inside its panel, as a group always showed them: the panel round them is what holds them.
            <div className="flex flex-col gap-px pb-1">{placed.map(one)}</div>
          ) : (
            // A folder made empty, or emptied: it stays, as a row of its own in the list's shape (a dashed tile,
            // a line and a quiet line under it, on the page titles' edge), and a click starts its first note.
            <div className="pb-1">
              <button type="button" data-group-empty onClick={() => (chime('open'), onNewNote(group.id))} className={cn(ROW_SHAPE, ROW_PAD, 'hover:bg-accent/60')}>
                <span className={cn(ROW_TILE, 'border border-dashed border-foreground/20 text-muted-foreground')}><Plus className="size-4" /></span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-control text-foreground">{group.folder ? 'Nothing in it yet' : 'Nothing in this group yet'}</span>
                  <span className="text-meta text-muted-foreground">{group.folder ? 'Drag notes in, or click to start one' : 'Drag a note onto it, or click to start one'}</span>
                </span>
              </button>
            </div>
          )
        })()}
      </Fold>
    </div>
  )
}

/** Past this many rows, a group draws only those near the screen. */
const BIG = 150

/**
 * What a group holds: there when open, gone when shut, at once. No slide: the
 * box snaps to its header and the rows under it move up in the same frame, for
 * three notes or for six hundred (a slide left a tall empty box under the
 * header while it ran, and in a big group drawn a screenful at a time it read
 * as broken). Shut, its notes leave the page, so nothing hidden can be dropped on.
 */
function Fold({ open, children }: { open: boolean; children: ReactNode }): React.JSX.Element {
  // min-w-0: as wide as the panel, so the rows' titles end in an ellipsis instead of running past it.
  return (
    <div data-fold="" inert={!open} className="min-w-0">
      {open && children}
    </div>
  )
}

/** A right click on a group's row: Haligtree's own menu, with its colours as a row of dots. */
/** A group and everything in it to the Bin, with one notice and one Undo; from the Bin later, its notes come back loose. */
export async function binGroup(id: string): Promise<void> {
  const { notes, groups: inner } = await groups.holds(id)
  let parted: Promise<Awaited<ReturnType<typeof groups.separate>>[]> = Promise.resolve([])
  // Back outermost first: each then takes its own notes back from the one that held them.
  const undo = (): void => void parted.then(async (was) => {
    for (const one of [...was].reverse()) if (one) await groups.restore(one)
  })
  const going = moveToBin(notes, undo)
  parted = going.then(async (n) => {
    if (!n) return []
    const was = []
    for (const one of inner) was.push(await groups.separate(one))
    return was
  })
}

export function GroupMenu({ group, members, holdsGroups = false, onOpenFolder, onSeparate, onRename, onIcon, onNewNote, onSort, onSorted, noun = 'note' }: {
  group: GroupView
  /** Groups inside it: Separate takes those out with its notes, and says so. */
  holdsGroups?: boolean
  /** What a new one in it is: a note, a goal. */
  noun?: string
  onOpenFolder?: () => void
  members: string[]
  onSeparate: () => void
  onRename: () => void
  onIcon: () => void
  onNewNote: (id: string) => void
  onSort?: (ids: string[]) => void
  onSorted?: (ids: string[], sorted: boolean) => void
}): React.JSX.Element {
  const later = (run: () => void) => () => void setTimeout(run, 0)
  const left = group.unsorted ?? []
  // A folder's menu says folder; a group's says group, as its menu always did.
  const word = group.folder ? 'folder' : 'group'
  // Read as the menu opens (it is drawn only while open): its notes' web links, for "Copy all links".
  const [links, setLinks] = useState<string[]>([])
  useEffect(() => void groups.links(group.id).then(setLinks), [group.id])
  return (
    <ContextMenuContent className="w-56" onCloseAutoFocus={(event) => event.preventDefault()}>
      {onOpenFolder && <ContextMenuItem data-group-open onSelect={later(onOpenFolder)}>{group.folder ? 'Open folder' : 'Open as a page'}</ContextMenuItem>}
      {onOpenFolder && <ContextMenuSeparator />}
      {left.length > 0 && onSort && <ContextMenuItem onSelect={later(() => onSort(left))}>Sort these ({num(left.length)})</ContextMenuItem>}
      {left.length > 0 && onSorted && <ContextMenuItem onSelect={() => onSorted(left, true)}>Mark all as sorted</ContextMenuItem>}
      {left.length > 0 && <ContextMenuSeparator />}
      <ContextMenuItem onSelect={() => void groups.note(group.id).then((id) => id && (chime('promote'), onNewNote(id)))}>New {noun} in {word}</ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void groups.duplicate(group.id).then((made) => made && (chime('copy'), toast('Duplicated, with a copy of each note', () => void groups.unclone(made.ids))))
        }
      >
        Duplicate {word}
      </ContextMenuItem>
      {/* Only when its notes hold a web link: a line that would say "no links" is not offered. */}
      {links.length > 0 && (
        <ContextMenuItem onSelect={() => copy(links.join('\n'), `Copied ${links.length === 1 ? 'one link' : `${num(links.length)} links`}`)}>
          Copy all links
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <div role="group" aria-label="Colour" className="flex items-center justify-between px-1 py-0.5">
        {GROUP_COLORS.map((color) => (
          <ContextMenuItem
            key={color}
            aria-label={color}
            data-color-dot={color}
            className="size-6 min-h-0 justify-center rounded-full shrink-0 p-0"
            // A colour is a glance: the menu stays open to see it land.
            onSelect={(event) => {
              event.preventDefault()
              chime('tap')
              const next = group.color === color ? null : color
              change(group, { color: next })
            }}
          >
            <span
              className={cn('size-3 rounded-full shrink-0 transition-transform duration-150', group.color === color && 'scale-125 shadow-[0_0_0_2px_var(--popover),0_0_0_3.5px_currentColor]')}
              style={{ background: `var(--tt-color-text-${color})`, color: `var(--tt-color-text-${color})` }}
            />
          </ContextMenuItem>
        ))}
      </div>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={later(onRename)}>Rename…</ContextMenuItem>
      <ContextMenuItem onSelect={later(onIcon)}>Change icon…</ContextMenuItem>
      {/* The one thing that tells a folder from a group, either way (16 Nov: "convert a group into a folder and vice versa"). */}
      <ContextMenuItem data-group-kind onSelect={() => convert(group)}>
        {group.folder ? <Hinted label="Make it a group" hint={`Its ${noun}s back in the list`} /> : <Hinted label="Make it a folder" hint={`Its ${noun}s live only in it`} />}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => void archive('nuggets', members, true)}>Archive {word}</ContextMenuItem>
      {/* Deleting a folder or group takes what is in it to the Bin, as Finder
          and Notion do; keeping the notes is the other choice. Drawn as the
          sidebar's folder menu draws them: a hint under each, the delete last, in red. */}
      {members.length > 0 && <ContextMenuItem data-folder-delete data-group-separate-item onSelect={onSeparate}>{group.folder ? <Hinted label={`Delete folder, keep its ${noun}s`} hint="They move up a level" /> : <Hinted label="Separate" hint={holdsGroups ? `Its ${noun}s and the groups in it stay in the list` : `Its ${noun}s stay in the list`} />}</ContextMenuItem>}
      <ContextMenuItem data-group-bin variant="destructive" onSelect={() => (members.length ? void binGroup(group.id) : onSeparate())}>{members.length ? <Hinted label={group.folder ? 'Delete folder' : 'Delete group'} hint={`Its ${noun}s go to the Bin too`} /> : group.folder ? 'Delete folder' : 'Delete group'}</ContextMenuItem>
    </ContextMenuContent>
  )
}

/** The kinds' own drawings first, then any emoji. */
export function IconChoice({ group, onPick }: { group: Pick<GroupView, 'icon' | 'color'>; onPick: (icon: string | null) => void }): React.JSX.Element {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-0.5 border-b px-2 py-1.5">
        <Tip label="The stack">
          <button type="button" onClick={() => onPick(null)} data-active={!group.icon ? '' : undefined}
            className="flex size-7 items-center justify-center rounded-md hover:bg-accent data-[active]:bg-accent">
            <GroupIcon icon={null} color={group.color} />
          </button>
        </Tip>
        {CAPTURE_TYPES.map((kind) => (
          <Tip key={kind.id} label={kind.label}>
            <button type="button" onClick={() => onPick(`kind:${kind.id}`)} data-active={group.icon === `kind:${kind.id}` ? '' : undefined}
              className="flex size-7 items-center justify-center rounded-md hover:bg-accent data-[active]:bg-accent">
              <GroupIcon icon={`kind:${kind.id}`} color={group.color} />
            </button>
          </Tip>
        ))}
        <span className="flex-1" />
        {/* A picture of your own, as Notion lets you: a GIF keeps moving. */}
        <Tip label="Upload a picture: PNG, JPG, GIF or SVG">
          <label data-folder-upload className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-control text-muted-foreground hover:bg-accent hover:text-foreground">
            <ImagePlus aria-hidden className="size-4" />Upload
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif" className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void saveImage(file).then(onPick, () => chime('nope'))
              }} />
          </label>
        </Tip>
      </div>
      <IconPicker icon={group.icon ?? ''} className="rounded-none! border-0! bg-transparent! shadow-none!" onPick={({ icon }) => icon && onPick(icon)} />
    </div>
  )
}
