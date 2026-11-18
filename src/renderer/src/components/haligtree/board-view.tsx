import { TOOL } from './note-extras'
import { small } from '@/lib/small-picture'
import { dragWords } from '@/lib/drag-words'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { getText, getTextSerializersFromSchema, type Editor, type JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { redo, undo } from '@tiptap/pm/history'
import { DndContext, MeasuringStrategy, PointerSensor, closestCorners, useDndContext, useDroppable, useSensor, useSensors, type CollisionDetection, type DragOverEvent, type DragEndEvent, type UniqueIdentifier } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Archive, Plus, CalendarDays } from 'lucide-react'
import { TagChip } from './tag-icon'
import { NameInPlace } from './name-in-place'
import { useThumb } from '@/lib/notes'

import { HaligtreeEditor, TAGS } from '../haligtree'
import { Calendar } from '@/components/ui/calendar'
import { RowMenu, openFromGrip, type RowItem } from './row-menu'
import { OnceHint } from './page-hint'
import type { BlockColor } from '@/extensions/block-color'
import { tagColors } from '@/extensions/tokens'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import { chime, click } from '@/lib/sound'
import { edge } from '@/lib/haptics'
import { findCaptures } from '@/lib/capture-links'
import { notes, type NoteTable } from '@/lib/notes'
import { taskSaid, haligtree } from '@/lib/haligtree'
import { dayMonth, num } from '../../../../main/dates'
import { Overlay, SETTLE } from './sortable'
import { CarriedCard, HELD, Hand, RoomIn, atOnce, offWindow, titleOf } from './carry'
import { Count, Tip, listEnd, refuse, toast, untoast, whyFailed } from './ui'
import { useHere } from '@/lib/split'
import { followLink } from '@/components/pdf/pdf-reader'
import { ofTheWriting } from '@/lib/writing-floats'
import { Check, ChevronDown, ChevronRight, Search, X } from '@/components/ui/icons'
import { EASING, still } from '@/lib/motion'
import { markRoom } from '@/extensions/block-room'
import { followGhost } from '@/extensions/note-link'

/**
 * A note seen as a board: each heading a list, side by side, each item under
 * it a card. Only a way of looking at the same words: every change here is
 * an edit to the note itself, saved the way typing is, so the note and its
 * Markdown always say the same as the board.
 */

// --- reading the note as lists and cards

type Card = { pos: number; node: PMNode; list: PMNode }
type Lane = { title: string; heading: PMNode; blocks: PMNode[]; cards: Card[] }
/**
 * A board read from headings, or from bullets: a list whose top items each
 * hold a list of their own (`outer`), each top item a list on the board.
 * Whatever is not the board heads it, before or after it in the note.
 */
type Shape = { level: number; head: { pos: number; node: PMNode }[]; lanes: Lane[]; outer?: { node: PMNode; at: number } }

const LISTS = ['bulletList', 'orderedList', 'taskList']

/** A heading's words as written, emoji and links included: a list named "🌿🌿🌿" read as no name at all. */
const wordsOf = (node: PMNode | null | undefined): string => (node ? getText(node, { blockSeparator: ' ', textSerializers: getTextSerializersFromSchema(node.type.schema) }).trim() : '')

/**
 * The note's headings at one level are its lists: the second level when it
 * has any (a first heading is usually the note's own title), otherwise the
 * highest it has. Whatever comes before the first one heads the board.
 */
function byHeadings(doc: PMNode): Shape {
  const levels: number[] = []
  doc.forEach((node) => void (node.type.name === 'heading' && levels.push(node.attrs.level as number)))
  const level = levels.includes(2) ? 2 : Math.min(...levels, 2)
  const shape: Shape = { level, head: [], lanes: [] }
  doc.forEach((node, offset) => {
    if (node.type.name === 'heading' && node.attrs.level === level) return void shape.lanes.push({ title: wordsOf(node), heading: node, blocks: [], cards: [] })
    const lane = shape.lanes[shape.lanes.length - 1]
    if (!lane) return void shape.head.push({ pos: offset, node })
    lane.blocks.push(node)
    if (LISTS.includes(node.type.name)) node.forEach((item, at) => lane.cards.push({ pos: offset + 1 + at, node: item, list: node }))
  })
  return shape
}

/** Whether any item of a list holds a list of its own. */
const nests = (list: PMNode): boolean => {
  let found = false
  list.forEach((item) => item.forEach((child) => void (LISTS.includes(child.type.name) && (found = true))))
  return found
}

/**
 * The first list in the note with a list inside one of its items, read as a
 * board: each top item a list, named by its first line, the items under it
 * its cards.
 */
function byBullets(doc: PMNode): Shape | null {
  let outer: { node: PMNode; at: number } | undefined
  doc.forEach((node, offset) => void (!outer && LISTS.includes(node.type.name) && nests(node) && (outer = { node, at: offset })))
  if (!outer) return null
  const { node: list, at: start } = outer
  const shape: Shape = { level: 0, head: [], lanes: [], outer }
  doc.forEach((node, offset) => void (offset !== start && shape.head.push({ pos: offset, node })))
  list.forEach((item, at) => {
    const pos = start + 1 + at
    const lane: Lane = { title: wordsOf(item.firstChild), heading: item, blocks: [], cards: [] }
    item.forEach((child, from, index) => {
      if (index === 0) return
      lane.blocks.push(child)
      if (LISTS.includes(child.type.name)) child.forEach((one, within) => lane.cards.push({ pos: pos + 1 + from + 1 + within, node: one, list: child }))
    })
    shape.lanes.push(lane)
  })
  return shape
}

/** Headings first; a note with no heading over a list, by its bullets. */
function shapeOf(doc: PMNode): Shape {
  const headings = byHeadings(doc)
  return headings.lanes.some((lane) => lane.cards.length) ? headings : (byBullets(doc) ?? headings)
}

/** Whether a note reads as a board at all: a heading with a list under it, or bullets with bullets under them. */
const fitsBoard = (doc: PMNode): boolean => shapeOf(doc).lanes.some((lane) => lane.cards.length)

/**
 * Said, in place of a board, when a note has nothing to make one of: what this
 * note is missing, not the whole rule. A reading note with headings and no
 * bullets was told to add headings it already had.
 */
function noBoard(doc: PMNode): string {
  const headings = shapeOf(doc).lanes.length
  let lists = false
  doc.forEach((node) => void (LISTS.includes(node.type.name) && (lists = true)))
  if (headings) return `Its ${headings === 1 ? 'heading is' : `${num(headings)} headings are`} ready to be columns, but no bullets sit under ${headings === 1 ? 'it' : 'them'}. A card is a bullet or a checklist line under a heading: add a few, and it can be a board.`
  if (lists) return 'These bullets have no columns to go in: put ## and a name above each group, or indent bullets under a bullet that names their column.'
  return 'Nothing here to make a board of yet: its columns are ## headings, and its cards the bullets under each.'
}

/**
 * The note as plain data to rearrange. A list left untouched is written back
 * exactly as it was; one that changed is its heading, its other blocks, then
 * its cards, each run of the same kind of list kept as one list. On a board
 * of bullets a list's "heading" is its whole top item, and `outer` is the
 * list they sit in and where it goes among the other blocks.
 */
type Model = {
  head: JSONContent[]
  outer?: { at: number; list: JSONContent }
  lanes: { heading: JSONContent; rest: JSONContent[]; after?: JSONContent[]; cards: { item: JSONContent; list: { type: string; attrs: Record<string, unknown> } }[]; same?: JSONContent[] }[]
}

const first = (lane: Lane): number => {
  const at = lane.blocks.findIndex((node) => LISTS.includes(node.type.name))
  return at < 0 ? lane.blocks.length : at
}

function modelOf(doc: PMNode): Model {
  const shape = shapeOf(doc)
  const outer = shape.outer
  return {
    head: shape.head.map((one) => one.node.toJSON()),
    outer: outer && { at: shape.head.filter((one) => one.pos < outer.at).length, list: outer.node.toJSON() },
    lanes: shape.lanes.map((lane) => ({
      heading: lane.heading.toJSON(),
      // Its other blocks keep their side of its cards: a line under them (the note's last, empty one, say) stays under them.
      rest: lane.blocks.slice(0, first(lane)).filter((node) => !LISTS.includes(node.type.name)).map((node) => node.toJSON()),
      after: lane.blocks.slice(first(lane)).filter((node) => !LISTS.includes(node.type.name)).map((node) => node.toJSON()),
      cards: lane.cards.map((card) => ({ item: card.node.toJSON(), list: { type: card.list.type.name, attrs: card.list.attrs } })),
      same: outer ? [lane.heading.toJSON()] : [lane.heading.toJSON(), ...lane.blocks.map((node) => node.toJSON())]
    }))
  }
}

function docOf(model: Model): JSONContent {
  const blocks = (lane: Model['lanes'][number]): JSONContent[] => {
    if (lane.same) return lane.same
    const lists: JSONContent[] = []
    for (const card of lane.cards) {
      const last = lists[lists.length - 1]
      if (last?.type === card.list.type) last.content!.push(card.item)
      else lists.push({ type: card.list.type, attrs: card.list.attrs, content: [card.item] })
    }
    if (!model.outer) return [lane.heading, ...lane.rest, ...lists, ...(lane.after ?? [])]
    // A bullet's list: its own first line, then what else it held, then its cards.
    return [{ ...lane.heading, content: [lane.heading.content?.[0] ?? { type: 'paragraph' }, ...lane.rest, ...lists, ...(lane.after ?? [])] }]
  }
  if (!model.outer) return { type: 'doc', content: [...model.head, ...model.lanes.flatMap(blocks)] }
  const content = [...model.head]
  content.splice(model.outer.at, 0, { ...model.outer.list, content: model.lanes.flatMap(blocks) })
  return { type: 'doc', content }
}

/** A new list's heading: a heading at the board's level, or on a board of bullets a bullet named for it. */
function laneHead(shape: Shape, title: string): JSONContent {
  const words = [{ type: 'text', text: title }]
  if (!shape.outer) return { type: 'heading', attrs: { level: shape.level }, content: words }
  const kind = shape.outer.node.firstChild!.type.name
  return { type: kind, ...(kind === 'taskItem' ? { attrs: { checked: false } } : {}), content: [{ type: 'paragraph', content: words }] }
}

/** The note becomes `json`, changing only the part that differs: one step for ⌘Z, and saved like typing. */
function commit(editor: Editor, json: JSONContent): void {
  const next = editor.schema.nodeFromJSON(json)
  const now = editor.state.doc
  const start = now.content.findDiffStart(next.content)
  if (start === null) return
  let { a, b } = now.content.findDiffEnd(next.content) ?? { a: now.content.size, b: next.content.size }
  const overlap = start - Math.min(a, b)
  if (overlap > 0) {
    a += overlap
    b += overlap
  }
  editor.view.dispatch(editor.state.tr.replace(start, a, next.slice(start, b)))
}

/** Change the note through its model: `change` edits it and names the lists it touched. */
function edit(editor: Editor, change: (model: Model) => number[] | void): void {
  const model = modelOf(editor.state.doc)
  const touched = change(model)
  for (const at of touched ?? []) if (model.lanes[at]) model.lanes[at].same = undefined
  commit(editor, docOf(model))
}

/** One checklist card holding the words typed for it, a note picked with @ kept as its link. */
const newCard = (words: JSONContent[]): Model['lanes'][number]['cards'][number] => ({
  item: { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: words }] },
  list: { type: 'taskList', attrs: {} }
})

// --- board or note, per note

/**
 * Whether this note shows as a board: as you last left it, or, for a note
 * that never said, as a board when it came from Obsidian's Kanban plugin.
 * ⌥⌘B switches; on a note with nothing to make a board of, it says how
 * to give it one instead.
 */
/** Whether a note was last seen as a board, kept for the session: a note opened again is a board from its first frame. */
const seenBoard = new Map<string, boolean>()
/** What is known now, without waiting: the person's own switch, this session's answer, or the note's fields when given. */
function boardNow(id: string | undefined, fields?: string | null): boolean | undefined {
  if (!id) return false
  try {
    const said = localStorage.getItem(`board:${id}`)
    if (said !== null) return said === 'on'
  } catch {
    // Not remembered: the note decides.
  }
  if (seenBoard.has(id)) return seenBoard.get(id)
  if (fields != null) {
    try {
      return (JSON.parse(fields) as Record<string, unknown>)?.['kanban-plugin'] === 'board'
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * A note drawn as a board or as words. Decided before the first frame wherever it can be (the note's fields when the
 * caller has them, the switch, this session), so a board never shows as words for a moment first.
 */
export function useBoard(table: NoteTable, id: string | undefined, editor: Editor | null, fields?: string | null): { on: boolean; fits: boolean; toggle: () => void } {
  const [held, setHeld] = useState(() => ({ id, on: boardNow(id, fields) ?? false }))
  // A new note: its answer now, in this same draw, not after it.
  if (held.id !== id) setHeld({ id, on: boardNow(id, fields) ?? false })
  const on = held.id === id ? held.on : boardNow(id, fields) ?? false
  const setOn = (next: boolean): void => setHeld({ id, on: next })
  const [fits, setFits] = useState(false)
  useEffect(() => {
    if (!id || boardNow(id, fields) !== undefined) return
    // The note before's answer, come back late, is not this note's.
    let current = true
    void notes.fields(table, id).then((all) => {
      const board = all['kanban-plugin'] === 'board'
      seenBoard.set(id, board)
      if (current) setHeld({ id, on: board })
    })
    return () => void (current = false)
  }, [table, id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editor || editor.isDestroyed) return setFits(false)
    // On every change to its words, typed or not: words laid in without an edit (a paste set in place, a note's
    // words arriving after it opened) left the first answer, an empty page's, standing.
    const read = (): void => setFits(fitsBoard(editor.state.doc))
    const changed = ({ transaction }: { transaction: { docChanged: boolean } }): void => void (transaction.docChanged && read())
    read()
    editor.on('transaction', changed)
    return () => void editor.off('transaction', changed)
  }, [editor])
  const toggle = (): void => {
    if (!id) return
    // Asked of the words as they are now, never only of what was last heard.
    const can = editor && !editor.isDestroyed ? fitsBoard(editor.state.doc) : fits
    if (!on && !can) return void (chime('nope'), toast(editor && !editor.isDestroyed ? noBoard(editor.state.doc) : 'Nothing here to make a board of yet.', undefined, 'info'))
    chime(on ? 'fold' : 'slide')
    try {
      localStorage.setItem(`board:${id}`, on ? 'off' : 'on')
    } catch {
      // Kept for this window only.
    }
    setOn(!on)
    if (id) seenBoard.set(id, !on)
  }
  const latest = useRef({ toggle, can: !!id })
  latest.current = { toggle, can: !!id }
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (!(event.metaKey && event.altKey && event.code === 'KeyB') || !latest.current.can) return
      event.preventDefault()
      latest.current.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return { on, fits, toggle }
}

// --- the board

/**
 * Where a carried card or list would land, by what it is over: a card, or a
 * list (its heading, or the room under its cards), each list one place.
 */
const placeOf = (id: string | number | undefined): string | null => (id === undefined ? null : String(id).replace(/^(lane:\d+):drop$/, '$1'))

/**
 * Heard and felt once for each new place a carried card would land, as a
 * dragged row in a list is (proximity.ts slotTicker): the drag's tick and the
 * trackpad's firm tap (haptics.ts, never two closer than its gap). `start`
 * names where the drag began, which is not an arrival.
 */
function landTicker(): ((place: string | null) => void) & { start: (place: string | null) => void } {
  let last: string | null = null
  const tick = (place: string | null): void => {
    if (place === null || place === last) return
    last = place
    click('tick')
    edge()
  }
  return Object.assign(tick, { start: (place: string | null) => void (last = place) })
}

/**
 * A change that moves cards (a key, a menu line), played as motion: each card
 * glides from where it stood to where it now stands, on the drop's spring,
 * rather than jumping. Cards are known by their words, as their places change.
 */
function glide(board: Element | null, change: () => void, kind = '[data-board-card]'): void {
  const cards = (): HTMLElement[] => [...(board?.querySelectorAll<HTMLElement>(kind) ?? [])]
  const was = new Map<string, DOMRect[]>()
  for (const one of cards()) {
    const key = one.textContent ?? ''
    was.set(key, [...(was.get(key) ?? []), one.getBoundingClientRect()])
  }
  // Drawn in their new places at once, so they are measured there before the frame is painted.
  flushSync(change)
  if (still()) return
  for (const one of cards()) {
    const from = was.get(one.textContent ?? '')?.shift()
    if (!from) continue
    const to = one.getBoundingClientRect()
    const dx = from.left - to.left
    const dy = from.top - to.top
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
    one.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], SETTLE as { duration: number; easing: string })
  }
}

/**
 * Thrown away in order, as everywhere: it fades and shrinks a little where it
 * stands, then goes, and what was after it glides up (or along) into its room.
 * The faded element is given back its look once the board is drawn without
 * it, as it may now be drawing the card that took its place.
 */
function throwAway(gone: Element | null | undefined, board: Element | null, change: () => void, kind?: string): void {
  if (!gone || still()) return change()
  const fade = gone.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.96' }], { duration: 140, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' })
  void fade.finished.then(() => (glide(board, change, kind), fade.cancel()), () => undefined)
}

/** Lists moved by a key or a menu line glide to their new places, as cards do. */
const glideLanes = (board: Element | null, change: () => void): void => glide(board, change, '[data-lane]')

/** Cards a list draws at first, and how many more each time it is scrolled near its end: 5,000 cards drawn at once took seconds per key. */
const STEP = 60

/** The rest of a long list, said as a count, drawn as it comes into view (or at a click). */
function MoreCards({ n, onMore }: { n: number; onMore: () => void }): React.JSX.Element {
  const line = useRef<HTMLButtonElement>(null)
  const more = useRef(onMore)
  more.current = onMore
  useEffect(() => {
    const el = line.current
    if (!el) return
    const watch = new IntersectionObserver((seen) => void (seen.some((one) => one.isIntersecting) && more.current()), { rootMargin: '400px 0px' })
    watch.observe(el)
    return () => watch.disconnect()
  }, [n])
  return (
    <button ref={line} type="button" data-more-cards="" onClick={() => more.current()}
      className="flex h-8 w-full shrink-0 cursor-pointer items-center justify-center rounded-[6px] px-2 text-control text-muted-foreground tabular-nums transition-[background-color,color] duration-150 hover:bg-foreground/[0.06] hover:text-foreground">
      {num(n)} more {n === 1 ? 'card' : 'cards'}
    </button>
  )
}

/** Done cards in one list from which its foot offers to archive them. */
const PILE = 5
/** A small button that takes a press 32px across, a step past what it draws (the tick's way). */
const REACH = 'relative after:absolute after:-inset-1 after:content-[""]'
/** A list's name, typed in place: its heading's own size and weight. */
const LANE_NAME_FIELD = 'min-w-0 flex-1 rounded-sm bg-transparent text-heading font-semibold outline-none placeholder:text-muted-foreground'

const cardId = (lane: number, at: number): string => `card:${lane}:${at}`
/** The list done cards are archived to, by any of its usual names ("Archive", "Archived", any case), as Obsidian's board writes it. */
const isArchive = (title: string): boolean => /^archived?$/i.test(title.trim())
const laneId = (lane: number): string => `lane:${lane}`

/** The lists folded to a strip in this note, by name, remembered. */
function useFolds(id: string): [string[], (title: string) => void, (from: string, to: string) => void] {
  const key = `board-folds:${id}`
  const [folds, setFolds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const flip = (title: string): void =>
    setFolds((was) => {
      const next = was.includes(title) ? was.filter((one) => one !== title) : [...was, title]
      chime(was.includes(title) ? 'open' : 'fold')
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Kept for this window only.
      }
      return next
    })
  // A list renamed stays folded under its new name, quietly.
  const rename = (from: string, to: string): void =>
    setFolds((was) => {
      const next = was.map((one) => (one === from ? to : one))
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Kept for this window only.
      }
      return next
    })
  return [folds, flip, rename]
}

/**
 * A list's colour: one picked from its list menu, else the next in a fixed
 * order, so neighbouring lists never share one (a colour worked out from the
 * name gave twins). Brown and grey come last: they read as the page.
 */
const LANE_HUES: BlockColor[] = ['blue', 'green', 'orange', 'purple', 'red', 'yellow', 'pink', 'brown', 'gray']
const hueTint = (hue: BlockColor): string => `var(--tt-color-text-${hue})`

/** The colours picked for this note's lists, by name, remembered. */
function useColours(id: string): [Record<string, BlockColor>, (title: string, hue: BlockColor | null) => void] {
  const key = `board-colours:${id}`
  const [colours, setColours] = useState<Record<string, BlockColor>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, BlockColor>
    } catch {
      return {}
    }
  })
  const set = (title: string, hue: BlockColor | null): void =>
    setColours((was) => {
      const next = { ...was }
      if (hue) next[title] = hue
      else delete next[title]
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Kept for this window only.
      }
      return next
    })
  return [colours, set]
}

export function Board({ editor, id, tools }: { editor: Editor; id: string; /** Where in the header its tools go. */ tools: HTMLElement | null }): React.JSX.Element {
  // Read again after every change to the note, wherever it came from.
  const [, setVersion] = useState(0)
  useEffect(() => {
    const bump = (): void => setVersion((n) => n + 1)
    editor.on('transaction', bump)
    return () => void editor.off('transaction', bump)
  }, [editor])
  const shape = shapeOf(editor.state.doc)
  const [folds, flipFold, renameFold] = useFolds(id)
  const [colours, setColour] = useColours(id)
  const hueOf = (at: number): BlockColor => colours[shape.lanes[at]?.title ?? ''] ?? LANE_HUES[at % LANE_HUES.length]
  const [renaming, setRenaming] = useState<number | null>(null)
  // How many cards each long list draws so far (STEP at first).
  const [drawn, setDrawn] = useState<Record<number, number>>({})
  const [cursor, setCursor] = useState<{ lane: number; card: number } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState<number | null>(null)
  const [newList, setNewList] = useState(false)
  const [query, setQuery] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  // The board takes the keys as it opens, not the hidden note under it.
  useEffect(() => {
    const timer = setTimeout(() => root.current?.focus({ preventScroll: true }), 60)
    return () => clearTimeout(timer)
  }, [])

  // --- what the board does to the note

  const tick = (pos: number): void => {
    const node = editor.state.doc.nodeAt(pos)
    if (!node) return
    // A bullet has no box to tick: say so rather than do nothing.
    if (node.type.name !== 'taskItem') return void (chime('nope'), toast('Only checklist cards can be ticked', undefined, 'info'))
    chime(node.attrs.checked ? 'off' : 'done')
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }))
  }
  const move = (from: [number, number], to: [number, number]): void =>
    edit(editor, (model) => {
      const [card] = model.lanes[from[0]].cards.splice(from[1], 1)
      model.lanes[to[0]].cards.splice(Math.max(0, Math.min(to[1], model.lanes[to[0]].cards.length)), 0, card)
      return [from[0], to[0]]
    })
  /** Undone from its toast by putting the note back as it was. */
  const undoable = (said: string, cue: Parameters<typeof chime>[0], change: (model: Model) => number[] | void): void => {
    const before = editor.getJSON()
    edit(editor, change)
    chime(cue)
    toast(said, () => (commit(editor, before), chime('undo')))
  }
  const archiveDone = (only?: number): void => {
    const done = shape.lanes.reduce((sum, lane, at) => sum + (isArchive(lane.title) || (only !== undefined && at !== only) ? 0 : lane.cards.filter((card) => card.node.attrs.checked).length), 0)
    if (!done) return void (chime('nope'), toast('Nothing ticked to archive', undefined, 'info'))
    undoable(`Archived ${num(done)} done ${done === 1 ? 'card' : 'cards'}`, 'shelve', (model) => {
      // At the end, under its own heading, as Obsidian's board keeps them.
      let archive = shape.lanes.findIndex((lane) => isArchive(lane.title))
      if (archive < 0) {
        archive = model.lanes.push({ heading: laneHead(shape, 'Archive'), rest: [], cards: [] }) - 1
      }
      const touched = [archive]
      model.lanes.forEach((lane, at) => {
        if (at === archive || (only !== undefined && at !== only)) return
        const kept = lane.cards.filter((card) => !card.item.attrs?.checked)
        if (kept.length === lane.cards.length) return
        model.lanes[archive].cards.push(...lane.cards.filter((card) => card.item.attrs?.checked))
        lane.cards = kept
        touched.push(at)
      })
      return touched
    })
  }
  const addList = (title: string): void =>
    edit(editor, (model) => void model.lanes.push({ heading: laneHead(shape, title), rest: [], cards: [] }))
  /** A list named again: its heading's words in the note, and its fold and colour kept with it. */
  const renameList = (at: number, title: string): void => {
    const was = shape.lanes[at]?.title ?? ''
    if (!title || title === was) return void chime('fold')
    chime('noted')
    edit(editor, (model) => {
      const heading = model.lanes[at].heading
      const words = [{ type: 'text', text: title }]
      // A heading's words are its own; a bullet's are its first line's, whatever else it holds kept.
      model.lanes[at].heading = shape.outer ? { ...heading, content: [{ type: 'paragraph', content: words }, ...(heading.content?.slice(1) ?? [])] } : { ...heading, content: words }
      return [at]
    })
    if (colours[was]) (setColour(title, colours[was]), setColour(was, null))
    if (folds.includes(was)) renameFold(was, title)
  }
  /** A list moved one place left or right, cards and all, gliding there. */
  const moveList = (at: number, by: -1 | 1): void => {
    const to = at + by
    if (to < 0 || to >= shape.lanes.length) return void chime('nope')
    chime('shift')
    edge()
    // Its colour goes with it: a list keeps the colour it had, wherever it stands.
    const [a, b] = [shape.lanes[at].title, shape.lanes[to].title]
    if (!colours[a]) setColour(a, hueOf(at))
    if (!colours[b]) setColour(b, hueOf(to))
    glideLanes(root.current, () => edit(editor, (model) => void (model.lanes = arrayMove(model.lanes, at, to))))
    setCursor((was) => (was && was.lane === at ? { ...was, lane: to } : was))
  }
  /** A list and its cards gone from the note, back with Undo or ⌘Z. */
  const deleteList = (at: number): void => {
    const lane = shape.lanes[at]
    const count = lane.cards.length
    const gone = root.current?.querySelectorAll('[data-lane]')[at]
    throwAway(gone, root.current, () => undoable(`Deleted the list ${lane.title || 'New list'}${count ? ` and its ${count === 1 ? 'card' : `${num(count)} cards`}` : ''}`, 'away', (model) => void model.lanes.splice(at, 1)), '[data-lane]')
    setCursor(null)
  }
  /**
   * A card made a study card for Review: its first line asks, what is under it
   * (or what follows "::" on its line) answers, its end tags go with it.
   */
  const study = (lane: number, at: number): void => {
    const node = shape.lanes[lane].cards[at].node
    const line = node.firstChild?.textContent ?? ''
    const foot = footOf(line)
    let term = line.slice(0, line.length - foot.cut).trim()
    const under: string[] = []
    node.forEach((child, _, index) => void (index > 0 && under.push(child.textBetween(0, child.content.size, '\n', '\n').trim())))
    let answer = under.filter(Boolean).join('\n')
    const split = term.split(/\s*::\s*/)
    if (!answer && split.length === 2 && split[0] && split[1]) [term, answer] = split
    if (!term) return void refuse('Write something on the card first', 'info')
    if (!answer) return void refuse('A study card needs its answer: write it under the card’s first line, or as “question :: answer”', 'info')
    const meaning = foot.tags.length ? `${answer}\n\n${foot.tags.map((one) => `#${one}`).join(' ')}` : answer
    void window.api.haligtree<string[]>('cards:list', [{ term, meaning, both: false }]).then(
      (ids) => {
        chime('added')
        toast('Study card made: it comes up in Review', () => void window.api.haligtree('cards:list:undo', ids).then(() => chime('undo')), 'success', undefined, { type: 'nugget', id: ids[0], title: term })
      },
      (error: unknown) => refuse(`The study card couldn't be made: ${whyFailed(error)}.`, 'error')
    )
  }

  // --- keys: arrows or H J K L to move, X ticks, Enter edits, Escape leaves

  const latest = useRef({ shape, cursor, editing, query, folds, remove: (lane: number, at: number): void => void [lane, at], moveList, flipFold })
  latest.current = { shape, cursor, editing, query, folds, remove: (lane, at) => remove(lane, at), moveList, flipFold }
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      const { shape, cursor, editing, query, folds } = latest.current
      const box = root.current
      if (!box || !box.contains(document.activeElement)) return
      // A card being written in keeps every key but Escape and ⌘↵.
      const active = document.activeElement as HTMLElement | null
      const writing = !!active && (active.isContentEditable || ['INPUT', 'TEXTAREA'].includes(active.tagName))
      const take = (): void => {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      if (writing) {
        if (editing && (event.key === 'Escape' || (event.key === 'Enter' && event.metaKey))) {
          take()
          box.dispatchEvent(new CustomEvent('board:done'))
        }
        return
      }
      // ⌘Z takes back the board's last change, as it would in the note.
      if (event.metaKey && !event.altKey && event.code === 'KeyZ') {
        take()
        const done = (event.shiftKey ? redo : undo)(editor.state, editor.view.dispatch)
        // A toast offering to undo is out of date once the note has moved under it.
        if (done) untoast()
        return chime(done ? 'undo' : 'nope')
      }
      // ⌘F finds a card, as it finds words in the note.
      if (event.metaKey && !event.altKey && !event.shiftKey && event.code === 'KeyF') return void (take(), chime('search'), setQuery((was) => was ?? ''))
      if (event.metaKey || event.ctrlKey) return
      const lanes = shape.lanes
      const open = lanes.map((lane, at) => ({ lane, at })).filter(({ lane }) => !folds.includes(lane.title))
      const shown = (lane: number): number => lanes[lane]?.cards.length ?? 0
      const at = cursor ?? (open[0] ? { lane: open[0].at, card: shown(open[0].at) ? 0 : -1 } : null)
      if (!at) return
      const key = event.key
      // G and g g: the last card of the list the cursor is in, and its first.
      const end = event.altKey ? null : listEnd(event)
      if (end) {
        take()
        const count = shown(at.lane)
        return setCursor({ lane: at.lane, card: count ? (end === 'last' ? count - 1 : 0) : -1 })
      }
      const down = key === 'ArrowDown' || key === 'j'
      const up = key === 'ArrowUp' || key === 'k'
      const left = key === 'ArrowLeft' || key === 'h'
      const right = key === 'ArrowRight' || key === 'l'
      // ⌥⇧ and an arrow moves the whole list the cursor is in.
      if (event.altKey && event.shiftKey && (left || right || ['Ó', 'Ò'].includes(key) || ['KeyH', 'KeyL'].includes(event.code))) {
        take()
        const by = left || event.code === 'KeyH' ? -1 : 1
        return latest.current.moveList(at.lane, by)
      }
      if (event.altKey) {
        // ⌥ carries the card: up and down in its list, or to the list beside it.
        if (!cursor || cursor.card < 0 || !(up || down || left || right || ['∆', '˚', '˙', '¬'].includes(key))) return
        take()
        const code = event.code
        const by = code === 'KeyJ' || key === 'ArrowDown' ? [0, 1] : code === 'KeyK' || key === 'ArrowUp' ? [0, -1] : code === 'KeyH' || key === 'ArrowLeft' ? [-1, 0] : [1, 0]
        if (by[0]) {
          const next = open.findIndex(({ at }) => at === cursor.lane) + by[0]
          if (next < 0 || next >= open.length) return chime('nope')
          const to = open[next].at
          const index = Math.min(cursor.card, shown(to))
          glide(root.current, () => move([cursor.lane, cursor.card], [to, index]))
          chime('move')
          edge()
          return setCursor({ lane: to, card: index })
        }
        const index = cursor.card + by[1]
        if (index < 0 || index >= shown(cursor.lane)) return chime('nope')
        glide(root.current, () => move([cursor.lane, cursor.card], [cursor.lane, index]))
        chime('shift')
        edge()
        return setCursor({ lane: cursor.lane, card: index })
      }
      if (down || up) {
        take()
        if (!cursor) return setCursor(at)
        const count = shown(at.lane)
        return setCursor({ lane: at.lane, card: count ? Math.max(0, Math.min(count - 1, at.card + (down ? 1 : -1))) : -1 })
      }
      if (left || right) {
        take()
        if (!cursor) return setCursor(at)
        const next = open.findIndex(({ at: lane }) => lane === at.lane) + (right ? 1 : -1)
        if (next < 0 || next >= open.length) return
        const lane = open[next].at
        return setCursor({ lane, card: shown(lane) ? Math.min(Math.max(at.card, 0), shown(lane) - 1) : -1 })
      }
      const card = cursor && cursor.card >= 0 ? lanes[cursor.lane]?.cards[cursor.card] : undefined
      if (key === 'x' && card) return void (take(), tick(card.pos))
      if (key === 'Enter' && card) return void (take(), chime('open'), setEditing(cardId(cursor!.lane, cursor!.card)))
      if (key === 'n' && cursor) return void (take(), setAdding(cursor.lane))
      // R names the list the cursor is in again, F folds it.
      if (key === 'r' && cursor) return void (take(), chime('tap'), setRenaming(cursor.lane))
      if (key === 'f' && cursor) return void (take(), latest.current.flipFold(lanes[cursor.lane].title))
      if ((key === 'Backspace' || key === 'Delete') && card && cursor) {
        take()
        return latest.current.remove(cursor.lane, cursor.card)
      }
      if (key === 'Escape') {
        if (query !== null) return void (take(), chime('fold'), setQuery(null))
        if (cursor) return void (take(), chime('fold'), setCursor(null))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // The card under the cursor stays in view.
  useEffect(() => {
    if (cursor) root.current?.querySelector('[data-board-cursor]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [cursor])

  const remove = (lane: number, at: number): void => {
    const gone = root.current?.querySelector(`[data-card-place="${cardId(lane, at)}"]`)
    throwAway(gone, root.current, () => undoable('Deleted the card', 'away', (model) => {
      model.lanes[lane].cards.splice(at, 1)
      return [lane]
    }))
    setCursor((was) => (was && was.lane === lane ? { lane, card: Math.min(at, shape.lanes[lane].cards.length - 2) } : was))
  }

  // --- dragging cards between lists, and the lists themselves

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // While a card is carried, where it would land: card ids per list.
  const [draft, setDraft] = useState<string[][] | null>(null)
  // The card or list in the hand, carried as every row in the app is (carry.tsx): its name, where it was taken hold of,
  // and what letting go now would do (null: over its own place, where it stays).
  const [lifted, setLifted] = useState<{ id: string; title: string; grab: number; top: number } | null>(null)
  const order = draft ?? shape.lanes.map((lane, at) => lane.cards.map((_, index) => cardId(at, index)))
  // A card's place is its name while carried (list and place): once it lands, the card now at its new place
  // answers to the name it was carried by, so the drop settles on it there, not on the card that took its old place.
  const [alias, setAlias] = useState<{ id: string; at: string; doc: PMNode } | null>(null)
  const swap = alias && alias.doc === editor.state.doc ? alias : null
  const sid = (place: string): string => (!swap ? place : place === swap.at ? swap.id : place === swap.id ? `${swap.id}~` : place)
  const real = (id: string): string => {
    // A list's drop room is named for its list.
    const room = id.endsWith(':drop')
    const name = room ? id.slice(0, -5) : id
    const place = !swap ? name : name === swap.id ? swap.at : name === `${swap.id}~` ? swap.id : name
    return room ? `${place}:drop` : place
  }
  const laneOf = (id: string): number => (id.startsWith('lane:') ? Number(id.split(':')[1]) : order.findIndex((ids) => ids.includes(id)))
  // A tick and the trackpad's firm tap as a carried card or list comes over each new place it would land.
  const ticks = useRef(landTicker()).current
  /** The card or list taken hold of: its name, and where on it the pointer took it, so the card under the hand keeps that point. */
  const liftOf = (id: string, event: Event): { id: string; title: string; grab: number; top: number } => {
    const node = document.querySelector<HTMLElement>(`[data-board] [data-sortable-id="${CSS.escape(id)}"]`)
    const box = node?.getBoundingClientRect()
    const [x, y] = event instanceof PointerEvent ? [event.clientX, event.clientY] : [box?.left ?? 0, box?.top ?? 0]
    const title = real(id).startsWith('lane:') ? node?.querySelector('[data-lane-name]')?.textContent || 'New list' : node ? titleOf(node) : ''
    return { id: real(id), title, grab: x - (box?.left ?? x), top: y - (box?.top ?? y) }
  }
  /** What letting go there would do, for the card in the hand: its own place says nothing; its list, "Move here"; another, its name. */
  const aimOf = (from: string, to: string | null, lane = to ? laneOf(to) : -1): string | null => {
    if (!to || lane < 0) return null
    if (from.startsWith('lane:')) return lane === Number(from.slice(5)) ? null : 'Move here'
    const home = Number(from.split(':')[1])
    if (lane !== home) return `Move to “${shape.lanes[lane]?.title || 'New list'}”`
    // Over its own list's heading or the room under its cards, it stays where it is (the drop below).
    return to === from || to.startsWith('lane:') ? null : 'Move here'
  }
  // Just moved into another list, the card is read as over the place it was moved to until that list is drawn again.
  // Read afresh mid-move, the lists still stood as before: the drag read it as over the list it had left, moved it back,
  // then over the new one again, each move measuring the lists anew, until React stopped the window ("Maximum update
  // depth exceeded" in the drag's own measuring, DndContext). dnd-kit's own way for lists side by side.
  const moved = useRef(false)
  const lastOver = useRef<UniqueIdentifier | null>(null)
  useEffect(() => {
    if (!moved.current) return
    const frame = requestAnimationFrame(() => void (moved.current = false))
    return () => cancelAnimationFrame(frame)
  }, [draft])
  const collide: CollisionDetection = (args) => {
    // Carried out of the window, it is over nothing: let go there, it goes back (the nearest list took it before).
    if (offWindow()) return (lastOver.current = null), []
    if (moved.current) return lastOver.current === null ? [] : [{ id: lastOver.current }]
    const found = closestCorners(args)
    lastOver.current = found[0]?.id ?? null
    return found
  }
  const onDragOver = ({ active, over }: DragOverEvent): void => {
    ticks(placeOf(over ? real(String(over.id)) : undefined))
    // Over nothing (out of the window): back in its own list until it is over one again.
    if (!over) return setDraft(null)
    const from = real(String(active.id))
    if (!from.startsWith('card:') || !over) return
    const to = real(String(over.id))
    const a = laneOf(from)
    const b = laneOf(to)
    if (a < 0 || b < 0 || a === b) return
    // Into the other list: before the card it is over, or at the end.
    const next = order.map((ids) => ids.filter((one) => one !== from))
    const at = next[b].indexOf(to)
    next[b].splice(at < 0 ? next[b].length : at, 0, from)
    // In its new list it is over itself until that list is drawn (above).
    moved.current = true
    lastOver.current = active.id
    setDraft(next)
  }
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    const title = lifted?.title ?? ''
    setLifted(null)
    const from = real(String(active.id))
    const to = over ? real(String(over.id)) : null
    if (from.startsWith('lane:')) {
      setDraft(null)
      const a = Number(from.slice(5))
      const b = to ? laneOf(to) : -1
      if (b < 0 || a === b) return chime('stay')
      edge()
      // Said where it went, with Undo, as every drop is; ⌘Z takes it back too (the note's own history, above).
      undoable(`Moved “${title || 'New list'}”`, 'shift', (model) => void (model.lanes = arrayMove(model.lanes, a, b)))
      return setAlias({ id: String(active.id), at: laneId(b), doc: editor.state.doc })
    }
    const next = order.map((ids) => [...ids])
    const lane = laneOf(from)
    if (to && laneOf(to) === lane && to !== from && !to.startsWith('lane:')) {
      const ids = next[lane]
      next[lane] = arrayMove(ids, ids.indexOf(from), ids.indexOf(to))
    }
    setDraft(null)
    const [, l, i] = from.split(':').map(Number)
    const at = next[lane].indexOf(from)
    if (lane < 0 || (lane === l && at === i)) return chime('stay')
    // Landed: the firm tap with its sound, as the card settles into its place, said where it went with Undo.
    edge()
    undoable(lane === l ? `Moved “${title}”` : `Moved “${title}” to “${shape.lanes[lane]?.title || 'New list'}”`, lane === l ? 'shift' : 'move', (model) => {
      const [card] = model.lanes[l].cards.splice(i, 1)
      model.lanes[lane].cards.splice(Math.max(0, Math.min(at, model.lanes[lane].cards.length)), 0, card)
      return [l, lane]
    })
    setAlias({ id: String(active.id), at: cardId(lane, at), doc: editor.state.doc })
  }

  const cardsOf = (lane: number): { id: string; card: Card; at: number }[] =>
    order[lane].map((id) => {
      const [, l, i] = id.split(':').map(Number)
      return { id, card: shape.lanes[l].cards[i], at: i }
    }).filter((one) => one.card && (!query || one.card.node.textContent.toLowerCase().includes(query.toLowerCase())))

  /** An empty card above or below this one, open to write in; left empty, it goes again. */
  const fresh = useRef<string | null>(null)
  const insert = (lane: number, at: number): void => {
    edit(editor, (model) => {
      const { item, list } = model.lanes[lane].cards[Math.min(at, model.lanes[lane].cards.length - 1)]
      const blank = { type: item.type, ...(item.type === 'taskItem' ? { attrs: { checked: false } } : {}), content: [{ type: 'paragraph' }] }
      model.lanes[lane].cards.splice(at, 0, { item: blank, list })
      return [lane]
    })
    chime('open')
    fresh.current = cardId(lane, at)
    setEditing(fresh.current)
  }
  /** The card's words become a note of their own, and the card a link to it. */
  const toNote = async (lane: number, at: number): Promise<void> => {
    const card = shape.lanes[lane].cards[at]
    const title = card.node.firstChild?.textContent.trim() || 'New note'
    const before = editor.getJSON()
    // Said with why, and what to do, when it cannot be made.
    const made = await window.api.captures.create({ body: { type: 'doc', content: card.node.toJSON().content ?? [{ type: 'paragraph' }] }, origin: id })
      .catch((error: unknown) => (refuse(`The card couldn't become a note: ${whyFailed(error)}.`, 'error'), null))
    if (!made) return
    edit(editor, (model) => {
      const item = model.lanes[lane].cards[at].item
      model.lanes[lane].cards[at].item = { ...item, content: [{ type: 'paragraph', content: [{ type: 'noteLink', attrs: { id: made, label: title } }] }] }
      return [lane]
    })
    chime('noted')
    toast(`Made a note: ${title}`, () => (commit(editor, before), void haligtree.unmakeCapture(made, id), chime('undo')), 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('capture', made) }, { type: 'capture', id: made, title })
  }
  /** A date on a card makes it a task on that day, linked back to this note. */
  const dated = async (lane: number, at: number, day: Date): Promise<void> => {
    const text = shape.lanes[lane].cards[at].node.firstChild?.textContent.trim()
    if (!text) return void (chime('nope'), toast('Write something on the card first', undefined, 'info'))
    const due = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12).toISOString()
    // Said with why when it cannot be made; a task made here is taken back out by Undo, one already on the list is left.
    const made = await haligtree.addTask(text, id).then(async (one) => (one.existed || (await haligtree.saveTask(one.id, { due })), one))
      .catch((error: unknown) => (refuse(`The task couldn't be added: ${whyFailed(error)}.`, 'error'), null))
    if (!made) return
    chime(made.existed ? 'nope' : 'noted')
    toast(taskSaid(made, `Task added for ${dayMonth(due)}`), made.existed ? undefined : () => void haligtree.unmakeTask(made.id, false, [], []).then(() => chime('undo')), 'success', undefined, { type: 'task', id: made.id })
  }

  /**
   * A card's one menu, opened by a right click where it was clicked or by its ⋯ under the ⋯: what it is first
   * (edit, done), then what it can become, then where it goes; Delete last, after a rule, with Undo.
   */
  const cardItems = (lane: number, at: number): RowItem[] => {
    const card = shape.lanes[lane].cards[at]
    const last = shape.lanes[lane].cards.length - 1
    // Closed as Escape closes it, once a day is picked: the calendar is not a line of the menu.
    const shut = (from: EventTarget | null | undefined): void => void (from instanceof Element && from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    return [
      { label: 'Edit card', keys: '↵', run: () => (chime('open'), setEditing(cardId(lane, at))) },
      card.node.type.name === 'taskItem' && { label: card.node.attrs.checked ? 'Not done' : 'Done', keys: 'X', run: () => tick(card.pos) },
      'separator',
      { label: 'Make a study card', hint: 'Its first line asks; what is under it answers', run: () => study(lane, at) },
      { label: 'Make it a note', run: () => void toNote(lane, at) },
      { label: 'Add a date', panel: <Calendar mode="single" className="bg-transparent" onSelect={(day, _picked, _mods, event) => day && (shut(event?.target), void dated(lane, at, day))} /> },
      'separator',
      { label: 'Add a card above', run: () => insert(lane, at) },
      { label: 'Add a card below', run: () => insert(lane, at + 1) },
      { label: 'Duplicate', run: () => (chime('copy'), edit(editor, (model) => (model.lanes[lane].cards.splice(at + 1, 0, structuredClone(model.lanes[lane].cards[at])), [lane]))) },
      'separator',
      // Only where it would move: a line that cannot run is left out, never shown greyed.
      at > 0 && { label: 'Move to top', run: () => (chime('shift'), edge(), glide(root.current, () => move([lane, at], [lane, 0]))) },
      at < last && { label: 'Move to bottom', run: () => (chime('shift'), edge(), glide(root.current, () => move([lane, at], [lane, last]))) },
      shape.lanes.length > 1 && {
        label: 'Move to list',
        items: shape.lanes.map((other, to): RowItem => to !== lane && { label: other.title || 'New list', icon: <span aria-hidden className="mx-[3px] size-2 shrink-0 rounded-full" style={{ background: hueTint(hueOf(to)) }} />, run: () => (chime('move'), edge(), glide(root.current, () => move([lane, at], [to, other.cards.length]))) })
      },
      { label: 'Delete card', keys: '⌫', danger: true, run: () => remove(lane, at) }
    ]
  }
  /** A list's one menu, from a right click on its heading or its ⋯. */
  const laneItems = (at: number): RowItem[] => {
    const lane = shape.lanes[at]
    const folded = folds.includes(lane.title)
    const done = lane.cards.filter((card) => card.node.attrs.checked).length
    return [
      { label: 'Add a card', keys: 'N', run: () => setAdding(at) },
      { label: 'Rename list', keys: 'R', run: () => (chime('tap'), setRenaming(at)) },
      { label: folded ? 'Unfold' : 'Fold', keys: 'F', run: () => flipFold(lane.title) },
      { swatches: LANE_HUES.map((hue) => ({ color: hueTint(hue), label: hue[0].toUpperCase() + hue.slice(1), on: hueOf(at) === hue, run: () => (chime('tap'), setColour(lane.title, hue)) })) },
      'separator',
      at > 0 && { label: 'Move left', keys: '⌥⇧←', run: () => moveList(at, -1) },
      at < shape.lanes.length - 1 && { label: 'Move right', keys: '⌥⇧→', run: () => moveList(at, 1) },
      !isArchive(lane.title) && done > 0 && { label: `Archive ${num(done)} done`, run: () => archiveDone(at) },
      { label: 'Delete list', hint: lane.cards.length ? lane.cards.length === 1 ? 'And its card; Undo brings them back' : `And its ${num(lane.cards.length)} cards; Undo brings them back` : 'Undo brings it back', danger: true, run: () => deleteList(at) }
    ]
  }

  // Lists past the board's width scroll sideways, never squashed: the side with more to see fades out.
  const strip = useRef<HTMLDivElement>(null)
  const [ends, setEnds] = useState({ left: false, right: false })
  const readEnds = useRef(() => {})
  readEnds.current = () => {
    const box = strip.current
    if (!box) return
    const left = box.scrollLeft > 1
    const right = box.scrollLeft + box.clientWidth < box.scrollWidth - 1
    setEnds((was) => (was.left === left && was.right === right ? was : { left, right }))
  }
  // Read on every draw (a list added, folded or renamed changes how far it reaches), on scrolling and on resizing.
  useLayoutEffect(() => readEnds.current())
  useEffect(() => {
    const box = strip.current
    if (!box) return
    const read = (): void => readEnds.current()
    const watch = new ResizeObserver(read)
    watch.observe(box)
    box.addEventListener('scroll', read, { passive: true })
    return () => (watch.disconnect(), box.removeEventListener('scroll', read))
  }, [])
  // Only the field being typed in shows focus: the picked card's ring waits while a card or list is written.
  const quiet = adding === null && editing === null && !newList
  const done = shape.lanes.reduce((sum, lane) => sum + (isArchive(lane.title) ? 0 : lane.cards.filter((card) => card.node.attrs.checked).length), 0)
  return (
    <div ref={root} tabIndex={-1} data-board data-own-keys className="flex min-h-[18rem] min-w-0 flex-1 flex-col outline-none" onPointerDown={(event) => {
      // A click on the board keeps its keys; one into a field keeps the field, and a menu it opened (a ⋯, a right click) keeps the keys too.
      if (event.button === 0 && !(event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) setTimeout(() => !root.current?.contains(document.activeElement) && !document.activeElement?.closest('[role="menu"]') && root.current?.focus({ preventScroll: true }))
    }}>
      {/* What the note says before its first list, as it reads in the note. */}
      {shape.head.length > 0 && <Head editor={editor} at={shape.head.map((one) => one.pos)} />}
      {/* The first board you open says what it is and its keys, once, on the lists' own left edge. */}
      <div className="px-3 empty:hidden @[40rem]/page:px-6 [&>*]:mb-2"><OnceHint name="board" when /></div>
      {/* Its tools sit in the note's own header row, given a place there. */}
      {tools && createPortal(
        <>
          {query !== null && (
            <label className="flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-accent/60 px-2 text-control">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input autoFocus aria-label="Find a card" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a card"
                onKeyDown={(event) => event.key === 'Escape' && (event.preventDefault(), chime('fold'), setQuery(null), root.current?.focus())}
                className="w-28 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground" />
              <button type="button" aria-label="Stop finding" onClick={() => (chime('fold'), setQuery(null))} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
            </label>
          )}
          {query === null && (
            <Tip label="Find a card  ⌘F">
              <button type="button" onClick={() => (chime('search'), setQuery(''))} className={TOOL}><Search /></button>
            </Tip>
          )}
          <Tip label={done ? `Archive ${num(done)} done` : 'Archive done cards'}>
            <button type="button" onClick={() => archiveDone()} className={TOOL}><Archive /></button>
          </Tip>
          <Tip label="Add a list">
            <button type="button" onClick={() => (chime('tap'), setNewList(true))} className={TOOL}><Plus /></button>
          </Tip>
        </>,
        tools
      )}
      <DndContext accessibility={dragWords} sensors={sensors} collisionDetection={collide} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        autoScroll={{ threshold: { x: 0.08, y: 0.12 }, acceleration: 6 }}
        onDragStart={({ active, activatorEvent }) => (chime('lift'), ticks.start(real(String(active.id))), setLifted(liftOf(String(active.id), activatorEvent)))}
        onDragOver={onDragOver} onDragEnd={atOnce(onDragEnd)} onDragCancel={() => (setDraft(null), setLifted(null), chime('stay'))}>
        <SortableContext items={shape.lanes.map((_, at) => sid(laneId(at)))} strategy={horizontalListSortingStrategy}>
          <div ref={strip} data-board-strip="" data-fade-left={ends.left || undefined} data-fade-right={ends.right || undefined}
            style={ends.left || ends.right ? { maskImage: `linear-gradient(to right, ${ends.left ? 'transparent, black 2rem' : 'black'}, ${ends.right ? 'black calc(100% - 2rem), transparent' : 'black'})` } : undefined}
            className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto px-3 pt-2 pb-4 @[40rem]/page:px-6">
            {shape.lanes.map((lane, at) => {
              const folded = folds.includes(lane.title)
              const every = cardsOf(at)
              // A long list draws its first cards and more as it is scrolled (or the cursor goes) near its end.
              const upTo = Math.max(drawn[at] ?? STEP, cursor?.lane === at ? cursor.card + STEP / 2 : 0, every.findIndex((one) => one.id === editing || one.id === fresh.current) + 1)
              const cards = every.slice(0, upTo)
              return (
                <LaneBox key={laneId(at)} id={sid(laneId(at))} folded={folded} title={lane.title} tint={hueTint(hueOf(at))} count={lane.cards.length} onFold={() => flipFold(lane.title)}
                  here={quiet && cursor?.lane === at && cursor.card < 0}
                  renaming={renaming === at} onRename={() => (chime('tap'), setRenaming(at))}
                  onRenamed={(words) => (setRenaming(null), words !== null && renameList(at, words), root.current?.focus({ preventScroll: true }))}
                  menu={laneItems(at)}>
                  <SortableContext items={cards.map((one) => sid(one.id))} strategy={verticalListSortingStrategy}>
                    {cards.map(({ id: key, card, at: index }) => (
                      <CardBox key={key} id={sid(key)} place={key} editor={editor} card={card} disabled={query !== null || editing === key} lane={at}
                        here={!!cursor && quiet && cursor.lane === at && cursor.card === index}
                        onPick={() => setCursor({ lane: at, card: index })}
                        onTick={() => tick(card.pos)}
                        editing={editing === key}
                        onEdit={() => (chime('open'), setEditing(key))}
                        onEdited={(content) => {
                          setEditing(null)
                          root.current?.focus({ preventScroll: true })
                          const wasFresh = fresh.current === key
                          fresh.current = null
                          const empty = !content || !content.some((block) => block.content?.length)
                          if (wasFresh && empty) return edit(editor, (model) => (model.lanes[at].cards.splice(index, 1), [at]))
                          if (!content) return
                          chime('noted')
                          edit(editor, (model) => {
                            const item = model.lanes[at].cards[index].item
                            model.lanes[at].cards[index].item = { ...item, content: content.length ? content : [{ type: 'paragraph' }] }
                            return [at]
                          })
                        }}
                        menu={cardItems(at, index)} />
                    ))}
                  </SortableContext>
                  {every.length > cards.length && <MoreCards n={every.length - cards.length} onMore={() => setDrawn((was) => ({ ...was, [at]: upTo + STEP }))} />}
                  {adding === at ? (
                    <AddCard onAdd={(words) => {
                      chime('noted')
                      edit(editor, (model) => (model.lanes[at].cards.push(newCard(words)), [at]))
                    }} onClose={() => (setAdding(null), root.current?.focus({ preventScroll: true }))} placeholder="A card, then ↵" />
                  ) : (
                    // Faint until the list is pointed at, so its room never looks empty; an empty list shows it fully, as it is the only thing to do there.
                    <button type="button" data-add-card="" onClick={() => (chime('tap'), setAdding(at))}
                      className={`flex h-8 w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 text-control text-muted-foreground transition-[opacity,background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:opacity-100 active:scale-[0.97]`}>
                      <Plus className="size-3.5" /> Add a card
                    </button>
                  )}
                  {/* A pile of done cards is offered a way out, quietly, at its foot. */}
                  {!isArchive(lane.title) && lane.cards.filter((card) => card.node.attrs.checked).length >= PILE && (
                    <button type="button" data-archive-pile="" onClick={() => archiveDone(at)}
                      className="flex h-8 w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 text-control text-muted-foreground transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]">
                      <Archive className="size-3.5" /> Archive {num(lane.cards.filter((card) => card.node.attrs.checked).length)} done
                    </button>
                  )}
                </LaneBox>
              )
            })}
            {newList ? (
              // Named in place, as a new folder is in Finder: a list already there, its name picked to type over.
              <section data-new-list="" className="flex w-64 shrink-0 flex-col rounded-[14px] pb-1.5" style={lanePanel(hueTint(LANE_HUES[shape.lanes.length % LANE_HUES.length]))}>
                {/* Its dot and name where every list's sit, past the room of a chevron. */}
                <header className="flex h-10 items-center gap-1.5 pr-1.5 pl-1.5">
                  <span aria-hidden className="size-6 shrink-0" />
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: 'var(--lane-tint)' }} />
                  <NameInPlace initial="New list" label="List name" placeholder="Name the list"
                    onDone={(words) => (setNewList(false), words ? (chime('noted'), addList(words)) : chime('fold'), root.current?.focus({ preventScroll: true }))}
                    className={LANE_NAME_FIELD} />
                </header>
              </section>
            ) : (
              <button type="button" data-add-list="" onClick={() => (chime('tap'), setNewList(true))}
                className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-[8px] px-3 text-control text-muted-foreground transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]">
                <Plus className="size-3.5" /> Add a list
              </button>
            )}
          </div>
        </SortableContext>
        <Overlay dropAnimation={still() ? null : SETTLE}>
          {/* The card or list in the hand: the one card every list carries, where it was taken hold of, saying what letting go would do. */}
          {lifted && (
            <Hand grab={lifted.grab} from={null} at={lifted.top}>
              <BoardCard lifted={lifted} aimOf={(over) => aimOf(lifted.id, over && real(over))} />
            </Hand>
          )}
        </Overlay>
      </DndContext>
    </div>
  )
}

/** Blocks of the note shown as the note draws them: a picture of the editor's own drawing. */
function useDrawn(editor: Editor, positions: number[], pick?: (node: HTMLElement) => ParentNode, /** What it shows, when known: drawn again only when that changes, not on every change to the note (5,000 cards were each copied again on every key). */ shows?: unknown[]): React.RefObject<HTMLDivElement | null> {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const into = box.current
    if (!into || editor.isDestroyed) return
    const parts: Node[] = []
    for (const pos of positions) {
      const drawn = editor.view.nodeDOM(pos) as HTMLElement | null
      if (!drawn) continue
      const copy = drawn.cloneNode(true) as HTMLElement
      // A tick is a property, not an attribute: copied by hand.
      const ticks = drawn.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      copy.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input, at) => (input.checked = ticks[at]?.checked ?? false))
      copy.classList.remove('mf-fold-hidden')
      parts.push(...(pick ? [...pick(copy).childNodes] : [copy]))
    }
    into.replaceChildren(...parts)
    // The room over each copied paragraph, from its place here rather than in the note (extensions/block-room.ts).
    markRoom(into)
  }, shows ?? [editor.state.doc, positions.join(' ')]) // eslint-disable-line react-hooks/exhaustive-deps
  return box
}

/** A link in a card opens where links open; a tick on a sub-task ticks it in the note. */
function useCardClicks(editor: Editor, pos: number): (event: React.MouseEvent) => boolean {
  return (event) => {
    const target = event.target as HTMLElement
    // A link to another note opens it, the way it does in the note.
    const note = target.closest('[data-note]')
    if (note) {
      event.preventDefault()
      event.stopPropagation()
      const to = note.getAttribute('data-note')
      const open = editor.extensionManager.extensions.find((one) => one.name === 'noteLink')?.options.onOpenNote as ((id: string, heading?: string) => void) | undefined
      if (to) open?.(to, note.getAttribute('data-heading') || undefined)
      // A link to a note not here yet, as the click in the note follows it: brought in from the vault, or made.
      else followGhost(editor, { label: note.getAttribute('data-label') ?? '', heading: note.hasAttribute('data-block') ? `^${note.getAttribute('data-block')}` : note.getAttribute('data-heading') ?? '' }, { x: event.clientX, y: event.clientY })
      return true
    }
    // A link opens as it does in the note (pdf-reader.tsx followLink): a PDF's in the reader at its page, which
    // opened nothing here, and a web page on ⌥-click in the reader, which went to the browser.
    const link = target.closest('a[href]') as HTMLAnchorElement | null
    if (link) {
      event.preventDefault()
      event.stopPropagation()
      const href = link.getAttribute('href')
      if (href) followLink(href, event)
      return true
    }
    if (!(target instanceof HTMLInputElement && target.type === 'checkbox')) return false
    event.preventDefault()
    event.stopPropagation()
    const drawn = editor.view.nodeDOM(pos) as HTMLElement | null
    const shown = [...(event.currentTarget as HTMLElement).querySelectorAll('input[type="checkbox"]')]
    const real = drawn?.querySelectorAll('li[data-checked] input[type="checkbox"]')[shown.indexOf(target)]
    const item = real?.closest('li[data-checked]')
    if (!item) return true
    const $at = editor.state.doc.resolve(editor.view.posAtDOM(item, 0))
    for (let depth = $at.depth; depth > 0; depth--) {
      const node = $at.node(depth)
      if (node.type.name !== 'taskItem') continue
      chime(node.attrs.checked ? 'off' : 'done')
      editor.view.dispatch(editor.state.tr.setNodeMarkup($at.before(depth), undefined, { ...node.attrs, checked: !node.attrs.checked }))
      break
    }
    return true
  }
}

function Head({ editor, at }: { editor: Editor; at: number[] }): React.JSX.Element {
  const box = useDrawn(editor, at)
  return (
    // On the lists' own left edge, not the note's reading column: the title heads the board, so it starts where the board does.
    <div data-board-head="" className="mb-3 px-3 @[40rem]/page:px-6">
      <div ref={box} className="tiptap ProseMirror haligtree-editor max-h-40 overflow-y-auto [--mf-padding:0] [&>*]:!mx-0 [&>*]:!max-w-none [&>*]:!px-0" />
    </div>
  )
}

/** A list's panel, as a group's is (kept-groups.tsx): its colour faint behind it and a hairline of it round it, no box of its own. */
const lanePanel = (tint: string): React.CSSProperties => ({
  '--lane-tint': tint,
  background: 'color-mix(in srgb, var(--lane-tint) 5%, transparent)',
  boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--lane-tint) 13%, transparent)'
}) as React.CSSProperties

/** A card's own fill: the page's paper, a step lighter on a dark page (main.css). */
const CARD_FILL = 'bg-(--board-card)'

/** Tags and a date at the end of a card's first line, read off it to sit at its foot: `#later`, `@{2026-11-12}`, `📅 2026-11-12`. */
const ENDS = /(?:^|\s+)(#[\p{L}\p{N}_/-]+|@\{\d{4}-\d{2}-\d{2}\}|📅\s*\d{4}-\d{2}-\d{2})\s*$/u
export function footOf(line: string): { tags: string[]; date: string | null; cut: number } {
  const tags: string[] = []
  let date: string | null = null
  let rest = line.replace(/\s+$/, '')
  for (let found = ENDS.exec(rest); found && found.index > 0; found = ENDS.exec(rest)) {
    const one = found[1]
    if (one.startsWith('#')) tags.unshift(one.slice(1))
    else date ??= one.match(/\d{4}-\d{2}-\d{2}/)![0]
    rest = rest.slice(0, found.index)
  }
  return { tags, date, cut: line.length - rest.length }
}

/** The last `cut` letters taken off the end of a drawn line, across the tags' own marks. */
function cutEnd(line: Element, cut: number): void {
  while (cut > 0) {
    let last: Node | null = line.lastChild
    while (last && last.nodeType !== Node.TEXT_NODE && last.lastChild) last = last.lastChild
    if (!last || last === line) return
    const text = last.textContent ?? ''
    if (text.length <= cut) {
      cut -= text.length
      // A mark left empty goes with its words.
      let gone: Node = last
      while (gone.parentNode && gone.parentNode !== line && gone.parentNode.childNodes.length === 1) gone = gone.parentNode
      gone.parentNode?.removeChild(gone)
    } else {
      last.textContent = text.slice(0, text.length - cut)
      cut = 0
    }
  }
}

function LaneBox({ id, title, tint, count, folded, here, renaming, onFold, onRename, onRenamed, menu, children }: {
  id: string
  title: string
  /** Its colour, as CSS. */
  tint: string
  count: number
  folded: boolean
  here: boolean
  /** Its name open to type over, in place. */
  renaming: boolean
  onFold: () => void
  /** Its name opened to type over (a double click on it). */
  onRename: () => void
  /** The new name (maybe empty), or null when left as it was. */
  onRenamed: (words: string | null) => void
  menu: RowItem[]
  children: ReactNode
}): React.JSX.Element {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, transition: still() ? null : { duration: 220, easing: EASING } })
  // An empty list still takes a card dropped on it.
  const { setNodeRef: dropRef } = useDroppable({ id: `${id}:drop`, data: { lane: id } })
  const name = title || 'New list'
  // In the hand, its own place is the quiet band every carried thing leaves (carry.tsx), never a faded copy of the list.
  const style = { ...(isDragging ? {} : lanePanel(tint)), transform: transform ? `translate3d(${Math.round(transform.x)}px, 0, 0)` : undefined, transition }
  const dot = <span aria-hidden data-lane-dot="" className="size-2 shrink-0 rounded-full" style={{ background: 'var(--lane-tint)' }} />
  if (folded)
    return (
      // As tall as what it says, not the whole board: a folded list is a tab, not a wall.
      <RowMenu list items={menu}>
        <section ref={setNodeRef} data-sortable-id={id} data-lane="" data-folded="" style={style} data-board-cursor={here || undefined}
          className={`flex max-h-full w-10 shrink-0 flex-col items-center rounded-[14px] py-1.5 ${here ? 'ring-2 ring-ring/60' : ''} ${isDragging ? HELD : ''}`}>
          {isDragging && <RoomIn moves={false} how={id} />}
          <Tip label={`Unfold ${name}  F`}>
            <button type="button" onClick={onFold} className={`${TOOL} size-7 cursor-pointer`}><ChevronRight /></button>
          </Tip>
          <button type="button" onClick={onFold} {...attributes} {...listeners} tabIndex={-1}
            className="mt-1.5 flex min-h-0 cursor-pointer items-start gap-2 py-1 text-heading font-semibold [writing-mode:vertical-rl]">
            {dot}
            <span data-lane-name="" className="max-h-64 truncate">{name}</span>
            <Count n={count} className="text-meta font-normal text-muted-foreground tabular-nums" />
          </button>
        </section>
      </RowMenu>
    )
  return (
    <section ref={setNodeRef} data-sortable-id={id} data-lane="" style={style}
      className={`group/lane flex max-h-full w-64 shrink-0 flex-col rounded-[14px] ${here ? 'ring-2 ring-ring/60' : ''} ${isDragging ? HELD : ''}`} data-board-cursor={here || undefined}>
      {isDragging && <RoomIn moves={false} how={id} />}
      {/* The heading is the list's handle: drag it to move the list; its chevron and ⋯ answer a click, a right click opens its menu where it was clicked. */}
      <RowMenu list items={renaming ? [] : menu}>
        <header {...(renaming ? {} : { ...attributes, ...listeners })} tabIndex={-1} aria-label={`Drag ${name}`} role="group"
          className="flex h-10 shrink-0 touch-none items-center gap-1.5 pr-1.5 pl-1.5 outline-none">
          <Tip label={`Fold ${name}  F`}>
            <button type="button" onClick={onFold} className={`${TOOL} ${REACH} size-6 cursor-pointer [&_svg]:size-3.5`}><ChevronDown /></button>
          </Tip>
          {dot}
          {renaming ? (
            <NameInPlace initial={title} label="List name" placeholder="Name the list" onDone={onRenamed} className={LANE_NAME_FIELD} />
          ) : (
            <>
              {/* Its whole name in a tip only when it is cut short. */}
              <Tip label={name}>
                <h3 data-lane-name="" onDoubleClick={onRename}
                  className="min-w-0 truncate text-heading font-semibold">{name}</h3>
              </Tip>
              <Count n={count} className="text-meta text-muted-foreground tabular-nums" />
            </>
          )}
          {!renaming && (
            <Tip label="More">
              <button type="button" aria-label={`${name} menu`} data-lane-more="" onClick={openFromGrip} onPointerDown={(event) => event.stopPropagation()}
                className={`${TOOL} ${REACH} ml-auto size-6 cursor-pointer opacity-0 group-hover/lane:opacity-100 focus-visible:opacity-100`}><AliveIcon icon={DotsHorizontalIcon} size={16} /></button>
            </Tip>
          )}
        </header>
      </RowMenu>
      <div ref={dropRef} className="flex min-h-10 flex-col gap-1.5 overflow-y-auto px-1.5 pt-1 pb-1.5">{children}</div>
    </section>
  )
}

/**
 * The card under the hand on a board: the one card every list carries, saying what letting go would do, read off the
 * drag itself as the pointer goes (set from the drag's own handler, the words drew the board again inside it, and a
 * card carried into another list went round that for ever).
 */
function BoardCard({ lifted, aimOf }: { lifted: { id: string; title: string }; aimOf: (over: string | null) => string | null }): React.JSX.Element {
  const { over } = useDndContext()
  return <CarriedCard attrs={{ 'data-board-lifted': '' }} title={lifted.title} strong={lifted.id.startsWith('lane:')} words={aimOf(over ? String(over.id) : null)} />
}

/** What a card shows of what it is: the first picture in it, or the cover of a note it links to. */
function useCover(node: PMNode): string | undefined {
  let picture: string | undefined
  let linked = ''
  node.descendants((one) => {
    if (picture || linked) return false
    if (one.type.name === 'image' && one.attrs.src) picture = String(one.attrs.src)
    if (one.type.name === 'noteLink' && one.attrs.id) linked = String(one.attrs.id)
    return true
  })
  const thumb = useThumb(linked)
  return picture ?? (linked ? thumb : undefined)
}

function CardBox({ id, place, lane, editor, card, here, editing, disabled, onPick, onTick, onEdit, onEdited, menu }: {
  /** The list it is drawn in now (a carried card is drawn in the list it would land in). */
  lane: number
  id: string
  /** Its list and place in it, whatever it is called while carried. */
  place: string
  editor: Editor
  card: Card
  here: boolean
  editing: boolean
  disabled: boolean
  onPick: () => void
  onTick: () => void
  onEdit: () => void
  /** The card's new content, or null when nothing changed. */
  onEdited: (content: JSONContent[] | null) => void
  /** Its one menu's lines, opened by a right click where it was clicked, or by its ⋯ under the ⋯. */
  menu: RowItem[]
}): React.JSX.Element {
  // Cards make room around a carried card as it moves (the sorting's own transform); once it lands they are
  // simply in their places. Played again from a card's old place as the lists are read afresh, a card
  // flashed over its neighbour for a frame after each drop.
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled, animateLayoutChanges: () => false, transition: still() ? null : { duration: 220, easing: EASING } })
  // Carried: letting go would put it somewhere new once it is in another list, or has moved along its own.
  const moves = isDragging && (Number(place.split(':')[1]) !== lane || Math.abs(transform?.y ?? 0) > 1)
  const task = card.node.type.name === 'taskItem'
  const checked = !!card.node.attrs.checked
  const cover = useCover(card.node)
  const foot = footOf(card.node.firstChild?.textContent ?? '')
  // A task's words sit in its second part, after the box the board draws itself; its picture shows at its head instead, and its end tags and date at its foot.
  const body = useDrawn(editor, editing ? [] : [card.pos], (copy) => {
    const words = task ? (copy.querySelector(':scope > div') ?? copy) : copy
    if (cover) words.querySelectorAll('img').forEach((one) => (one.closest('[data-node-view-wrapper], .node-image, figure') ?? one).remove())
    const line = words.querySelector(':scope > p')
    if (line && foot.cut) cutEnd(line, foot.cut)
    return words
  }, [card.node, editing, cover, foot.cut])
  const clicks = useCardClicks(editor, card.pos)
  return (
    // Being written in, its right click is the words' own.
    <RowMenu items={editing ? [] : menu}>
    <div ref={setNodeRef} data-sortable-id={id} data-card-place={place} data-board-cursor={here || undefined} data-board-card="" {...attributes} {...listeners} tabIndex={-1} role={undefined}
      style={{ transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined, transition }}
      onClick={(event) => !clicks(event) && onPick()}
      onDoubleClick={() => !editing && onEdit()}
      className={`group/card relative flex shrink-0 cursor-pointer touch-none flex-col overflow-hidden rounded-[6px] text-control transition-[box-shadow,scale,background-color] duration-150 ease-(--mf-ease) active:scale-[0.97] ${
        // Carried away: the place it left stays open as a faint slot in the list's colour, the size of the card.
        isDragging ? '[&>*:not([data-own-room],[data-drop-room],[data-drop-line])]:invisible' : `${CARD_FILL} shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_14%,transparent)] ring-1 ring-foreground/[0.07] hover:bg-[color-mix(in_oklab,var(--foreground)_4%,var(--board-card))]`
      } ${here ? 'ring-2! ring-ring/70!' : ''}`}>
      {cover && !editing && <img src={small(cover, 640)} alt="" draggable={false} decoding="async" data-card-cover="" className="h-20 w-full shrink-0 object-cover" />}
      <div className="flex min-w-0 items-start gap-2 px-2.5 py-2">
        {task && (
          <button type="button" role="checkbox" aria-checked={checked} aria-label={checked ? 'Not done' : 'Done'} onClick={(event) => (event.stopPropagation(), onTick())}
            onPointerDown={(event) => event.stopPropagation()}
            className="group/tick relative after:absolute after:-inset-1 after:rounded-full mt-[3px] flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-muted-foreground/50 transition-colors hover:border-[var(--tt-color-text-green)]"
            style={checked ? { background: 'var(--tt-color-text-green)', borderColor: 'var(--tt-color-text-green)' } : undefined}>
            <Check className={`size-2.5 transition-opacity ${checked ? 'text-background opacity-100' : 'opacity-0 group-hover/tick:opacity-60'}`} strokeWidth={3} />
          </button>
        )}
        {editing ? (
          <CardEditor content={card.node.toJSON().content ?? []} onDone={onEdited} />
        ) : (
          // Its first line, the title, to three lines; what it holds under that fades out past a few more.
          <div ref={body} style={{ fontSize: 'calc(0.875rem * var(--mf-text-scale, 1))' }}
            className={`tiptap ProseMirror haligtree-editor max-h-48 min-w-0 flex-1 overflow-hidden pr-4 [--mf-padding:0] [mask-image:linear-gradient(to_bottom,black_9rem,transparent)] [&>p:first-child]:line-clamp-3 ${checked ? '[&>p:first-child]:text-muted-foreground [&>p:first-child]:line-through' : ''}`} />
        )}
      </div>
      {!editing && (foot.tags.length > 0 || foot.date) && (
        <div data-card-foot="" className="-mt-1 flex flex-wrap items-center gap-1 px-2.5 pb-2 text-xs">
          {foot.date && (
            <span data-card-date={foot.date} className="flex items-center gap-1 rounded-full bg-foreground/[0.06] py-0.5 pr-2 pl-1.5 text-muted-foreground tabular-nums">
              <CalendarDays className="size-3" /> {dayMonth(foot.date)}
            </span>
          )}
          {/* Grey unless the tag was given a colour: a board of many tags is not a box of paints, and two never look alike by chance. */}
          {foot.tags.map((tag) => <TagChip key={tag} tag={tag} color={tagColors.get(tag.toLowerCase()) ?? 'gray'} className="pr-2" />)}
        </div>
      )}
      {!editing && (
        // Round, on the card's own paper, so over a picture it reads as a button, not a square cut out of it.
        <button type="button" aria-label="Card menu" onPointerDown={(event) => event.stopPropagation()} onClick={openFromGrip}
          data-card-more="" className={`${TOOL} ${REACH} absolute! top-1 right-1 size-6 cursor-pointer rounded-full bg-(--board-card) opacity-0 focus-visible:opacity-100`}>
          <AliveIcon icon={DotsHorizontalIcon} size={14} />
        </button>
      )}
      {/* In the hand, its place is the room the cards round it make: the band, and the one line once it would land somewhere new. Last, so the card's own parts stay first. */}
      {isDragging && <RoomIn moves={moves} how={place} />}
    </div>
    </RowMenu>
  )
}

/** A card written in place, in the note's own editor; done on Escape, ⌘↵ or a click away. */
function CardEditor({ content, onDone }: { content: JSONContent[]; onDone: (content: JSONContent[] | null) => void }): React.JSX.Element {
  const ed = useRef<Editor | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const was = useRef(JSON.stringify(content))
  const finished = useRef(false)
  const finish = (): void => {
    if (finished.current) return
    finished.current = true
    const now = ed.current?.getJSON().content ?? null
    onDone(now && JSON.stringify(now) !== was.current ? now : null)
  }
  const latest = useRef(finish)
  latest.current = finish
  useEffect(() => {
    const board = box.current?.closest('[data-board]')
    const done = (): void => latest.current()
    // A press anywhere outside the card, menus the editor opened aside.
    const away = (event: PointerEvent): void => {
      const target = event.target as HTMLElement
      if (!box.current?.contains(target) && !ofTheWriting(target)) done()
    }
    board?.addEventListener('board:done', done)
    document.addEventListener('pointerdown', away, true)
    return () => {
      board?.removeEventListener('board:done', done)
      document.removeEventListener('pointerdown', away, true)
    }
  }, [])
  return (
    <div ref={box} className="min-w-0 flex-1 [--mf-padding:0] [&_.haligtree-editor]:!text-[length:calc(0.875rem*var(--mf-text-scale,1))] [&_.tiptap-word-count]:hidden" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <HaligtreeEditor defaultContent={{ type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }} tokens={TAGS}
        findNotes={findCaptures} toolbar={{ fixed: false }} handles={false} outline={false} search={false} vim={false} autofocus="end" onReady={(editor) => (ed.current = editor)} />
    </div>
  )
}

/**
 * The line a new card is typed into: the app's own editor line, as Today's and
 * the "For tomorrow" box's are, so @ picks a note, #tags light and a paste
 * reads as it does everywhere. Return adds the card and stays for the next,
 * Escape, or a click away with nothing typed, closes it.
 */
function AddCard({ placeholder, onAdd, onClose }: { placeholder: string; onAdd: (words: JSONContent[]) => void; onClose: () => void }): React.JSX.Element {
  const ed = useRef<Editor | null>(null)
  const words = (): JSONContent[] => ed.current?.getJSON().content?.[0]?.content ?? []
  const empty = (): boolean => !ed.current || (!ed.current.state.doc.textContent.trim() && !words().some((one) => one.type !== 'text'))
  return (
    // At the cards' own size and padding, so the card it becomes stands where it was typed.
    <div data-add-card-line="" className="flex shrink-0 items-center rounded-[6px] bg-(--board-card) px-2.5 py-2 ring-2 ring-ring/60 [&_.tiptap]:!text-[length:calc(0.875rem*var(--mf-text-scale,1))] [&_p]:!text-[length:calc(0.875rem*var(--mf-text-scale,1))]"
      onKeyDown={(event) => event.stopPropagation()}
      onBlur={(event) => {
        // Into its own @ menu: still being written.
        const into = event.relatedTarget as Element | null
        if (into && (event.currentTarget.contains(into) || into.closest('[role=menu], [role=listbox], .tiptap-suggestion-popup'))) return
        if (empty()) onClose()
      }}>
      <HaligtreeEditor shape="line" autofocus="end" handles={false} slash={false} outline={false} search={false} vim={false} math={false} smoothScroll={false}
        toolbar={false} tokens={TAGS} findNotes={findCaptures} placeholder={placeholder}
        style={{ '--mf-padding': '0' } as React.CSSProperties}
        onReady={(editor) => (ed.current = editor)}
        onSubmit={() => {
          if (empty()) return onClose()
          onAdd(words())
          ed.current?.commands.clearContent()
        }}
        onKeyDown={(event) => (event.key === 'Escape' ? (chime('fold'), onClose(), true) : false)} />
    </div>
  )
}
