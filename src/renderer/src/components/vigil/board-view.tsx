import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { redo, undo } from '@tiptap/pm/history'
import { DndContext, MeasuringStrategy, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragOverEvent, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Archive, Plus, GripVertical as Grip } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import DownChevronIcon from '@/components/ui/down-chevron'
import RightChevronIcon from '@/components/ui/right-chevron'
import MagnifierIcon from '@/components/ui/magnifier-icon'
import XIcon from '@/components/ui/x-icon'

import { MindflowEditor, TAGS, readMarkdown } from '../mindflow'
import { Calendar } from '@/components/ui/calendar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import { chime } from '@/lib/sound'
import { slotTicker } from '@/lib/proximity'
import { notes, type NoteTable } from '@/lib/notes'
import { taskSaid, vigil } from '@/lib/vigil'
import { keyFor } from '@/lib/keys'
import { dayMonth } from '../../../../main/dates'
import { Overlay, SETTLE, snapshot } from './sortable'
import { Rolling, Tip, refuse, toast, untoast, whyFailed } from './ui'
import { useHere } from '@/lib/split'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Check = alive(SimpleCheckedIcon)
const ChevronDown = alive(DownChevronIcon)
const ChevronRight = alive(RightChevronIcon)
const Search = alive(MagnifierIcon)
const X = alive(XIcon)

/**
 * A note seen as a board: each heading a list, side by side, each item under
 * it a card. Only a way of looking at the same words: every change here is
 * an edit to the note itself, saved the way typing is, so the note and its
 * Markdown always say the same as the board.
 */

// --- reading the note as lists and cards

type Card = { pos: number; node: PMNode; list: PMNode }
type Lane = { title: string; heading: PMNode; blocks: PMNode[]; cards: Card[] }
type Shape = { level: number; head: { pos: number; node: PMNode }[]; lanes: Lane[] }

const LISTS = ['bulletList', 'orderedList', 'taskList']

/**
 * The note's headings at one level are its lists: the second level when it
 * has any (a first heading is usually the note's own title), otherwise the
 * highest it has. Whatever comes before the first one heads the board.
 */
function shapeOf(doc: PMNode): Shape {
  const levels: number[] = []
  doc.forEach((node) => void (node.type.name === 'heading' && levels.push(node.attrs.level as number)))
  const level = levels.includes(2) ? 2 : Math.min(...levels, 2)
  const shape: Shape = { level, head: [], lanes: [] }
  doc.forEach((node, offset) => {
    if (node.type.name === 'heading' && node.attrs.level === level) return void shape.lanes.push({ title: node.textContent.trim(), heading: node, blocks: [], cards: [] })
    const lane = shape.lanes[shape.lanes.length - 1]
    if (!lane) return void shape.head.push({ pos: offset, node })
    lane.blocks.push(node)
    if (LISTS.includes(node.type.name)) node.forEach((item, at) => lane.cards.push({ pos: offset + 1 + at, node: item, list: node }))
  })
  return shape
}

/** Whether a note reads as a board at all: a heading with a list under it. */
const fitsBoard = (doc: PMNode): boolean => shapeOf(doc).lanes.some((lane) => lane.cards.length)

/**
 * The note as plain data to rearrange. A list left untouched is written back
 * exactly as it was; one that changed is its heading, its other blocks, then
 * its cards, each run of the same kind of list kept as one list.
 */
type Model = { head: JSONContent[]; lanes: { heading: JSONContent; rest: JSONContent[]; cards: { item: JSONContent; list: { type: string; attrs: Record<string, unknown> } }[]; same?: JSONContent[] }[] }

function modelOf(doc: PMNode): Model {
  const shape = shapeOf(doc)
  return {
    head: shape.head.map((one) => one.node.toJSON()),
    lanes: shape.lanes.map((lane) => ({
      heading: lane.heading.toJSON(),
      rest: lane.blocks.filter((node) => !LISTS.includes(node.type.name)).map((node) => node.toJSON()),
      cards: lane.cards.map((card) => ({ item: card.node.toJSON(), list: { type: card.list.type.name, attrs: card.list.attrs } })),
      same: [lane.heading.toJSON(), ...lane.blocks.map((node) => node.toJSON())]
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
    return [lane.heading, ...lane.rest, ...lists]
  }
  return { type: 'doc', content: [...model.head, ...model.lanes.flatMap(blocks)] }
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

/** One card, as Markdown would write it: `- [ ] words`, read by the editor's own reader. */
const newCard = (text: string): Model['lanes'][number]['cards'][number] => {
  const read = readMarkdown(`- [ ] ${text}`)
  const item = read?.content?.[0]?.content?.[0] ?? { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
  return { item, list: { type: 'taskList', attrs: {} } }
}

// --- board or note, per note

/**
 * Whether this note shows as a board: as you last left it, or, for a note
 * that never said, as a board when it came from Obsidian's Kanban plugin.
 * ⌥⌘B switches, while the note reads as one.
 */
export function useBoard(table: NoteTable, id: string | undefined, editor: Editor | null): { on: boolean; fits: boolean; toggle: () => void } {
  const [on, setOn] = useState(false)
  const [fits, setFits] = useState(false)
  useEffect(() => {
    setOn(false)
    if (!id) return
    let said: string | null = null
    try {
      said = localStorage.getItem(`board:${id}`)
    } catch {
      // Not remembered: the note decides.
    }
    if (said !== null) return setOn(said === 'on')
    // The note before's answer, come back late, is not this note's.
    let current = true
    void notes.fields(table, id).then((fields) => current && setOn(fields['kanban-plugin'] === 'board'))
    return () => void (current = false)
  }, [table, id])
  useEffect(() => {
    if (!editor || editor.isDestroyed) return setFits(false)
    const read = (): void => setFits(fitsBoard(editor.state.doc))
    read()
    editor.on('update', read)
    return () => void editor.off('update', read)
  }, [editor])
  const toggle = (): void => {
    if (!id) return
    chime(on ? 'fold' : 'slide')
    try {
      localStorage.setItem(`board:${id}`, on ? 'off' : 'on')
    } catch {
      // Kept for this window only.
    }
    setOn(!on)
  }
  const latest = useRef({ toggle, can: fits || on })
  latest.current = { toggle, can: fits || on }
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

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
const TOOL = 'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground [&_svg]:size-4'
const cardId = (lane: number, at: number): string => `card:${lane}:${at}`
const laneId = (lane: number): string => `lane:${lane}`

/** The lists folded to a strip in this note, by name, remembered. */
function useFolds(id: string): [string[], (title: string) => void] {
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
  return [folds, flip]
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
  const [folds, flipFold] = useFolds(id)
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
    const done = shape.lanes.reduce((sum, lane, at) => sum + (lane.title === 'Archive' || (only !== undefined && at !== only) ? 0 : lane.cards.filter((card) => card.node.attrs.checked).length), 0)
    if (!done) return void (chime('nope'), toast('Nothing ticked to archive', undefined, 'info'))
    undoable(`Archived ${done} done ${done === 1 ? 'card' : 'cards'}`, 'shelve', (model) => {
      // At the end, under its own heading, as Obsidian's board keeps them.
      let archive = shape.lanes.findIndex((lane) => lane.title === 'Archive')
      if (archive < 0) {
        archive = model.lanes.push({ heading: { type: 'heading', attrs: { level: shape.level }, content: [{ type: 'text', text: 'Archive' }] }, rest: [], cards: [] }) - 1
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
    edit(editor, (model) => void model.lanes.push({ heading: { type: 'heading', attrs: { level: shape.level }, content: [{ type: 'text', text: title }] }, rest: [], cards: [] }))

  // --- keys: arrows or H J K L to move, X ticks, Enter edits, Escape leaves

  const latest = useRef({ shape, cursor, editing, query, folds, remove: (lane: number, at: number): void => void [lane, at] })
  latest.current = { shape, cursor, editing, query, folds, remove: (lane, at) => remove(lane, at) }
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
      if (event.metaKey || event.ctrlKey) return
      const lanes = shape.lanes
      const open = lanes.map((lane, at) => ({ lane, at })).filter(({ lane }) => !folds.includes(lane.title))
      const shown = (lane: number): number => lanes[lane]?.cards.length ?? 0
      const at = cursor ?? (open[0] ? { lane: open[0].at, card: shown(open[0].at) ? 0 : -1 } : null)
      if (!at) return
      const key = event.key
      const down = key === 'ArrowDown' || key === 'j'
      const up = key === 'ArrowUp' || key === 'k'
      const left = key === 'ArrowLeft' || key === 'h'
      const right = key === 'ArrowRight' || key === 'l'
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
          move([cursor.lane, cursor.card], [to, index])
          chime('move')
          return setCursor({ lane: to, card: index })
        }
        const index = cursor.card + by[1]
        if (index < 0 || index >= shown(cursor.lane)) return chime('nope')
        move([cursor.lane, cursor.card], [cursor.lane, index])
        chime('shift')
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
    undoable('Deleted the card', 'away', (model) => {
      model.lanes[lane].cards.splice(at, 1)
      return [lane]
    })
    setCursor((was) => (was && was.lane === lane ? { lane, card: Math.min(at, shape.lanes[lane].cards.length - 2) } : was))
  }

  // --- dragging cards between lists, and the lists themselves

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // While a card is carried, where it would land: card ids per list.
  const [draft, setDraft] = useState<string[][] | null>(null)
  const [lifted, setLifted] = useState<{ id: string; html: string; width: number; height: number } | null>(null)
  const order = draft ?? shape.lanes.map((lane, at) => lane.cards.map((_, index) => cardId(at, index)))
  const laneOf = (id: string): number => (id.startsWith('lane:') ? Number(id.split(':')[1]) : order.findIndex((ids) => ids.includes(id)))
  // A soft tick as a carried card or list comes over each new place.
  const ticks = useRef(slotTicker()).current
  const onDragOver = ({ active, over }: DragOverEvent): void => {
    ticks(over?.id)
    const from = String(active.id)
    if (!from.startsWith('card:') || !over) return
    const to = String(over.id)
    const a = laneOf(from)
    const b = laneOf(to)
    if (a < 0 || b < 0 || a === b) return
    // Into the other list: before the card it is over, or at the end.
    const next = order.map((ids) => ids.filter((one) => one !== from))
    const at = next[b].indexOf(to)
    next[b].splice(at < 0 ? next[b].length : at, 0, from)
    setDraft(next)
  }
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    setLifted(null)
    const from = String(active.id)
    const to = over ? String(over.id) : null
    if (from.startsWith('lane:')) {
      setDraft(null)
      const a = Number(from.slice(5))
      const b = to ? laneOf(to) : -1
      if (b < 0 || a === b) return chime('stay')
      chime('shift')
      return edit(editor, (model) => void (model.lanes = arrayMove(model.lanes, a, b)))
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
    chime(lane === l ? 'shift' : 'move')
    move([l, i], [lane, at])
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
    const title = card.node.firstChild?.textContent.trim() || 'Untitled'
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
    toast(`Made a note: ${title}`, () => (commit(editor, before), void vigil.unmakeCapture(made, id), chime('undo')), 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('capture', made) })
  }
  /** A date on a card makes it a task on that day, linked back to this note. */
  const dated = async (lane: number, at: number, day: Date): Promise<void> => {
    const text = shape.lanes[lane].cards[at].node.firstChild?.textContent.trim()
    if (!text) return void (chime('nope'), toast('Write something on the card first', undefined, 'info'))
    const made = await vigil.addTask(text, id)
    const due = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12).toISOString()
    if (!made.existed) await vigil.saveTask(made.id, { due })
    chime('noted')
    toast(taskSaid(made, `Task added for ${dayMonth(due)}`))
  }

  const menuFor = (lane: number, at: number) => (close: () => void): ReactNode => {
    const card = shape.lanes[lane].cards[at]
    const last = shape.lanes[lane].cards.length - 1
    return (
      <>
        <DropdownMenuItem onSelect={() => (chime('open'), setEditing(cardId(lane, at)))}>Edit card<DropdownMenuShortcut>↵</DropdownMenuShortcut></DropdownMenuItem>
        {card.node.type.name === 'taskItem' && <DropdownMenuItem onSelect={() => tick(card.pos)}>{card.node.attrs.checked ? 'Not done' : 'Done'}<DropdownMenuShortcut>{keyFor('X')}</DropdownMenuShortcut></DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => insert(lane, at)}>Add a card above</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => insert(lane, at + 1)}>Add a card below</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void toNote(lane, at)}>Make it a note</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Add a date</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="p-0">
            <Calendar mode="single" className="bg-transparent" onSelect={(day) => day && (close(), void dated(lane, at, day))} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={at === 0} onSelect={() => (chime('shift'), move([lane, at], [lane, 0]))}>Move to top</DropdownMenuItem>
        <DropdownMenuItem disabled={at === last} onSelect={() => (chime('shift'), move([lane, at], [lane, last]))}>Move to bottom</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to list</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {shape.lanes.map((other, to) => (
              <DropdownMenuItem key={to} disabled={to === lane} onSelect={() => (chime('move'), move([lane, at], [to, other.cards.length]))}>{other.title || 'Untitled'}</DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => (chime('copy'), edit(editor, (model) => (model.lanes[lane].cards.splice(at + 1, 0, structuredClone(model.lanes[lane].cards[at])), [lane])))}>Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => remove(lane, at)}>Delete card<DropdownMenuShortcut>⌫</DropdownMenuShortcut></DropdownMenuItem>
      </>
    )
  }

  const done = shape.lanes.reduce((sum, lane) => sum + (lane.title === 'Archive' ? 0 : lane.cards.filter((card) => card.node.attrs.checked).length), 0)
  return (
    <div ref={root} tabIndex={-1} data-board className="flex min-h-[18rem] min-w-0 flex-1 flex-col outline-none" onPointerDown={(event) => {
      // A click on the board keeps its keys; one into a field keeps the field.
      if (!(event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) setTimeout(() => !root.current?.contains(document.activeElement) && root.current?.focus({ preventScroll: true }))
    }}>
      {/* What the note says before its first list, as it reads in the note. */}
      {shape.head.length > 0 && <Head editor={editor} at={shape.head.map((one) => one.pos)} />}
      {/* Its tools sit in the note's own header row, given a place there. */}
      {tools && createPortal(
        <>
          {query !== null && (
            <label className="flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-accent/60 px-2 text-control">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a card"
                onKeyDown={(event) => event.key === 'Escape' && (event.preventDefault(), chime('fold'), setQuery(null), root.current?.focus())}
                className="w-28 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground" />
              <button type="button" aria-label="Stop finding" onClick={() => (chime('fold'), setQuery(null))} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
            </label>
          )}
          {query === null && (
            <Tip label="Find a card">
              <button type="button" onClick={() => (chime('search'), setQuery(''))} className={TOOL}><Search /></button>
            </Tip>
          )}
          <Tip label={done ? `Archive ${done} done` : 'Archive done cards'}>
            <button type="button" onClick={() => archiveDone()} className={TOOL}><Archive /></button>
          </Tip>
          <Tip label="Add a list">
            <button type="button" onClick={() => (chime('tap'), setNewList(true))} className={TOOL}><Plus /></button>
          </Tip>
        </>,
        tools
      )}
      <DndContext sensors={sensors} collisionDetection={closestCorners} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        autoScroll={{ threshold: { x: 0.08, y: 0.12 }, acceleration: 6 }}
        onDragStart={({ active }) => (chime('lift'), ticks.start(String(active.id)), setLifted(snapshot(String(active.id))))}
        onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setDraft(null), setLifted(null))}>
        <SortableContext items={shape.lanes.map((_, at) => laneId(at))} strategy={horizontalListSortingStrategy}>
          <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto px-3 pt-2 pb-4 @[40rem]/page:px-6">
            {shape.lanes.map((lane, at) => {
              const folded = folds.includes(lane.title)
              const cards = cardsOf(at)
              return (
                <LaneBox key={laneId(at)} id={laneId(at)} folded={folded} title={lane.title} count={lane.cards.length} onFold={() => flipFold(lane.title)}
                  here={cursor?.lane === at && cursor.card < 0}
                  menu={
                    <>
                      <DropdownMenuItem onSelect={() => setAdding(at)}>Add a card<DropdownMenuShortcut>{keyFor('N')}</DropdownMenuShortcut></DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => flipFold(lane.title)}>{folded ? 'Unfold' : 'Fold'}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => archiveDone(at)}>Archive done cards</DropdownMenuItem>
                    </>
                  }>
                  <SortableContext items={cards.map((one) => one.id)} strategy={verticalListSortingStrategy}>
                    {cards.map(({ id: key, card, at: index }) => (
                      <CardBox key={key} id={key} editor={editor} card={card} disabled={query !== null || editing === key}
                        here={!!cursor && cursor.lane === at && cursor.card === index}
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
                        menu={menuFor(at, index)} />
                    ))}
                  </SortableContext>
                  {adding === at ? (
                    <AddCard onAdd={(text) => {
                      chime('noted')
                      edit(editor, (model) => (model.lanes[at].cards.push(newCard(text)), [at]))
                    }} onClose={() => (setAdding(null), root.current?.focus({ preventScroll: true }))} placeholder="A card, then ↵" />
                  ) : (
                    <button type="button" onClick={() => (chime('tap'), setAdding(at))}
                      className="flex h-8 w-full shrink-0 items-center gap-1.5 rounded-md px-2 text-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <Plus className="size-3.5" /> Add a card
                    </button>
                  )}
                </LaneBox>
              )
            })}
            {newList ? (
              <div className="w-72 shrink-0 rounded-xl border bg-accent/25 p-1.5">
                <AddCard placeholder="Name the list, then ↵" onAdd={(title) => (chime('noted'), addList(title), setNewList(false))} onClose={() => (setNewList(false), root.current?.focus({ preventScroll: true }))} />
              </div>
            ) : (
              <button type="button" onClick={() => (chime('tap'), setNewList(true))}
                className="flex h-9 w-44 shrink-0 items-center gap-1.5 rounded-xl border border-dashed px-3 text-control text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground">
                <Plus className="size-3.5" /> Add a list
              </button>
            )}
          </div>
        </SortableContext>
        <Overlay dropAnimation={still() ? null : SETTLE}>
          {/* The card or list as it was, lifted off the board a little. */}
          {lifted && (
            <div style={{ width: lifted.width }} dangerouslySetInnerHTML={{ __html: lifted.html }}
              className={`flex cursor-grabbing items-start gap-2 border bg-background shadow-[0_10px_24px_-8px_color-mix(in_oklab,var(--mf-shadow-ink,black)_45%,transparent),0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink,black)_18%,transparent)] ${lifted.id.startsWith('lane:') ? 'flex-col rounded-xl' : '-rotate-1 rounded-lg px-2.5 py-2 text-control'}`} />
          )}
        </Overlay>
      </DndContext>
    </div>
  )
}

/** Blocks of the note shown as the note draws them: a picture of the editor's own drawing. */
function useDrawn(editor: Editor, positions: number[], pick?: (node: HTMLElement) => ParentNode): React.RefObject<HTMLDivElement | null> {
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
  }, [editor.state.doc, positions.join(' ')]) // eslint-disable-line react-hooks/exhaustive-deps
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
      return true
    }
    const link = target.closest('a[href]') as HTMLAnchorElement | null
    if (link) {
      event.preventDefault()
      event.stopPropagation()
      if (/^https?:/.test(link.href)) window.open(link.href)
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
    <div className="mb-3 px-3 @[40rem]/page:px-6">
      <div ref={box} className="tiptap ProseMirror mindflow-editor max-h-40 overflow-y-auto [--mf-padding:0]" />
    </div>
  )
}

function LaneBox({ id, title, count, folded, here, onFold, menu, children }: {
  id: string
  title: string
  count: number
  folded: boolean
  here: boolean
  onFold: () => void
  menu: ReactNode
  children: ReactNode
}): React.JSX.Element {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, transition: still() ? null : { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' } })
  // An empty list still takes a card dropped on it.
  const { setNodeRef: dropRef } = useDroppable({ id: `${id}:drop`, data: { lane: id } })
  const style = { transform: transform ? `translate3d(${Math.round(transform.x)}px, 0, 0)` : undefined, transition, opacity: isDragging ? 0.4 : undefined }
  const name = title || 'Untitled'
  if (folded)
    return (
      <section ref={setNodeRef} data-sortable-id={id} style={style} data-board-cursor={here || undefined}
        className={`mf-island flex h-full max-h-full w-10 shrink-0 flex-col items-center rounded-xl border bg-accent/25 py-1.5 ${here ? 'ring-1 ring-ring' : ''}`}>
        <Tip label={`Unfold ${name}`}>
          <button type="button" onClick={onFold} className={TOOL}><ChevronRight /></button>
        </Tip>
        <button type="button" onClick={onFold} {...attributes} {...listeners} tabIndex={-1}
          className="mt-1 flex min-h-0 flex-1 cursor-pointer items-start gap-2 py-1 text-meta font-medium [writing-mode:vertical-rl]">
          <span className="text-muted-foreground tabular-nums"><Rolling text={count} /></span>
          <span className="truncate">{name}</span>
        </button>
      </section>
    )
  return (
    <section ref={setNodeRef} data-sortable-id={id} style={style}
      className={`mf-island group/lane flex max-h-full w-72 shrink-0 flex-col rounded-xl border bg-accent/25 ${here ? 'ring-1 ring-ring' : ''}`} data-board-cursor={here || undefined}>
      <header className="flex h-10 shrink-0 items-center gap-0.5 pr-1.5 pl-1">
        <button type="button" aria-label={`Drag ${name}`} {...attributes} {...listeners} tabIndex={-1}
          className="flex h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover/lane:opacity-60 hover:opacity-100 active:cursor-grabbing">
          <Grip className="size-3.5" />
        </button>
        <Tip label={`Fold ${name}`}>
          <button type="button" onClick={onFold} className={`${TOOL} size-6`}><ChevronDown /></button>
        </Tip>
        <h3 className="ml-1 min-w-0 truncate text-meta font-semibold">{name}</h3>
        <span className="ml-1.5 text-xs text-muted-foreground tabular-nums"><Rolling text={count} /></span>
        <DropdownMenu modal={false}>
          <Tip label="More">
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`${name} menu`} className={`${TOOL} ml-auto`}><AliveIcon icon={DotsHorizontalIcon} size={16} /></button>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent align="end" className="w-52">{menu}</DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div ref={dropRef} className="flex min-h-10 flex-col gap-1.5 overflow-y-auto px-1.5 pb-1.5">{children}</div>
    </section>
  )
}

function CardBox({ id, editor, card, here, editing, disabled, onPick, onTick, onEdit, onEdited, menu }: {
  id: string
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
  menu: (close: () => void) => ReactNode
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled, transition: still() ? null : { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' } })
  const task = card.node.type.name === 'taskItem'
  const checked = !!card.node.attrs.checked
  // A task's words sit in its second part, after the box the board draws itself.
  const body = useDrawn(editor, editing ? [] : [card.pos], (copy) => (task ? (copy.querySelector(':scope > div') ?? copy) : copy))
  const clicks = useCardClicks(editor, card.pos)
  return (
    <div ref={setNodeRef} data-sortable-id={id} data-board-cursor={here || undefined} {...attributes} {...listeners} tabIndex={-1} role={undefined}
      style={{ transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined, transition, opacity: isDragging ? 0.3 : undefined }}
      onClick={(event) => !clicks(event) && onPick()}
      onDoubleClick={() => !editing && onEdit()}
      className={`group/card relative flex shrink-0 touch-none items-start gap-2 rounded-lg border bg-background px-2.5 py-2 text-control transition-colors hover:border-foreground/15 ${here ? 'border-ring ring-1 ring-ring' : ''}`}>
      {task && (
        <button type="button" role="checkbox" aria-checked={checked} aria-label={checked ? 'Not done' : 'Done'} onClick={(event) => (event.stopPropagation(), onTick())}
          onPointerDown={(event) => event.stopPropagation()}
          className="group/tick mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/50 transition-colors hover:border-[var(--tt-color-text-green)]"
          style={checked ? { background: 'var(--tt-color-text-green)', borderColor: 'var(--tt-color-text-green)' } : undefined}>
          <Check className={`size-2.5 transition-opacity ${checked ? 'text-background opacity-100' : 'opacity-0 group-hover/tick:opacity-60'}`} strokeWidth={3} />
        </button>
      )}
      {editing ? (
        <CardEditor content={card.node.toJSON().content ?? []} onDone={onEdited} />
      ) : (
        <div ref={body} style={{ fontSize: 'calc(0.875rem * var(--mf-text-scale, 1))' }}
          className={`tiptap ProseMirror mindflow-editor max-h-64 min-w-0 flex-1 overflow-hidden pr-4 [--mf-padding:0] [mask-image:linear-gradient(to_bottom,black_13rem,transparent)] ${checked ? '[&>p:first-child]:text-muted-foreground [&>p:first-child]:line-through' : ''}`} />
      )}
      {!editing && (
        <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Card menu" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
              className={`${TOOL} absolute top-1 right-1 size-6 bg-background opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100`}>
              <AliveIcon icon={DotsHorizontalIcon} size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">{menu(() => setMenuOpen(false))}</DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
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
      if (!box.current?.contains(target) && !target.closest('[data-radix-popper-content-wrapper], [role="menu"], [role="dialog"]')) done()
    }
    board?.addEventListener('board:done', done)
    document.addEventListener('pointerdown', away, true)
    return () => {
      board?.removeEventListener('board:done', done)
      document.removeEventListener('pointerdown', away, true)
    }
  }, [])
  return (
    <div ref={box} className="min-w-0 flex-1 [--mf-padding:0] [&_.mindflow-editor]:!text-[length:calc(0.875rem*var(--mf-text-scale,1))] [&_.tiptap-word-count]:hidden" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <MindflowEditor defaultContent={{ type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }} tokens={TAGS}
        toolbar={{ fixed: false }} handles={false} outline={false} search={false} vim={false} autofocus="end" onReady={(editor) => (ed.current = editor)} />
    </div>
  )
}

/** A line to type a new card or list into: ↵ adds and stays for the next, Escape closes. */
function AddCard({ placeholder, onAdd, onClose }: { placeholder: string; onAdd: (text: string) => void; onClose: () => void }): React.JSX.Element {
  const [text, setText] = useState('')
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
      <input autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder={placeholder}
        onBlur={() => !text.trim() && onClose()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') return void (event.preventDefault(), chime('fold'), onClose())
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
          event.preventDefault()
          if (!text.trim()) return onClose()
          onAdd(text.trim())
          setText('')
        }}
        className="h-6 min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-muted-foreground" />
    </div>
  )
}
