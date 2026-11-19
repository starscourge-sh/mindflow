import { useEffect, useRef, useState } from 'react'
import { keepIn, type FolderKind } from '@/lib/folders'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useMotionValue, useSpring, type MotionValue } from 'motion/react'
import { AppWindow, Columns2 } from 'lucide-react'

import { chime, click } from '@/lib/sound'
import { detent } from '@/lib/haptics'
import { canSplit } from '@/lib/split'
import { enqueue } from '@/lib/reading-queue'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { still } from '@/lib/motion'
import { refuse } from './ui'
import { CarriedCard, swallowClick, swallowRelease, titleOf } from './carry'
import { gapIn, setCarry } from './tab-row'
import '@/lib/carry-cursor'

/**
 * Drag to split, Dia's way with tabs: carry a row, a Home tile, a pinned
 * note, a search result or an @ link over the page, and two tall dashed
 * places come up at its left and right edges. Let go over one and what you
 * carried opens in a new pane on that side. Carried over a pane's row of
 * tabs, a gap opens where it would land, and letting go makes it a tab there.
 *
 * The places and the carried card pull toward each other as they near, the
 * way React Bits' Magnet pulls a thing toward the pointer: within about
 * 120px, on a spring, the place leans out and grows a touch, and the card is
 * drawn in until, over it, it shrinks into a small card inside it. Escape
 * puts it all down. With Reduce motion nothing leans or grows; the places
 * still light.
 *
 * The Matrix's boxes offer no places at all (data-no-split): a card carried
 * there goes to another box, and across its two columns it left its own.
 *
 * A row or card that drags inside its own list or board (your own order,
 * the week's days) keeps doing that, with its own lifted
 * picture as the only one: the places come up only while the pointer is
 * truly at the page's left or right edge, narrow, so they never cover a box
 * or a day it could be dropped in, and go again when it comes back in.
 */

export type Side = 'left' | 'right' | 'between'

/**
 * Where the carried card was let go, for the pane it opens to glide out of
 * (panes.tsx), so you see where it went. Kept a moment only: a pane opened
 * any other way never takes it.
 */
let landing: { rect: DOMRect; at: number } | null = null
export const takeLanding = (): DOMRect | null => {
  const was = landing
  landing = null
  return was && performance.now() - was.at < 600 ? was.rect : null
}
/** What was carried: `type:id` to open, a list row in a pane (its id, and which pane), or a tab (which, and whose). */
export type Carried = { open?: string; row?: { pane: string; id: string }; tab?: { pane: string; key: string }; title: string; kind?: string }

/** How near, in px, the pull begins. */
const REACH = 120
/** How near the page's left or right edge a list's own drag goes before the places come up. */
const EDGE = 48
/** A place's width beside a list's own drag: a strip at the edge, never over what it could drop in. The page makes room for it (main.css). */
const NARROW = 104
/** How far a place sits in from the page's side. */
const INSET = 24
/** What a strip at an edge takes from the page beside it: the strip and its inset, and a little air. */
const ROOM = 136
/** How far past a list's column, to either side, a list's own drag goes before the places come up. */
const OUTSIDE = 24
/** How far the pointer moves before anything is carried. */
const START = 8

/** What can be carried from where the pointer went down, or null for anything else. */
function sourceOf(target: EventTarget | null): { node: HTMLElement; carried: Carried; column: boolean; edgeOnly?: boolean } | null {
  if (!(target instanceof Element)) return null
  if (target.closest('input, textarea, select, [data-no-split], [role="menu"], [role="separator"]')) return null
  const tab = target.closest<HTMLElement>('[data-tab]')
  const row = tab?.closest<HTMLElement>('[data-tab-row]')
  if (tab && row) return { node: tab, carried: { tab: { pane: row.dataset.tabRow!, key: tab.dataset.tab! }, open: tab.dataset.tabOpen, title: tab.dataset.dragTitle ?? 'New note' }, column: false }
  const chip = target.closest<HTMLElement>('a.tiptap-note-link[data-note]')
  if (chip) {
    const raw = chip.getAttribute('data-note') ?? ''
    const [type, id] = raw.includes(':') ? [raw.slice(0, raw.indexOf(':')), raw.slice(raw.indexOf(':') + 1)] : ['capture', raw]
    if (type === 'person' || type === 'character' || type === 'tag' || !id) return null
    return { node: chip, carried: { open: `${type}:${id}`, title: (chip.textContent ?? '').replace(/^@/, '').trim() }, column: false }
  }
  if (target.closest('[contenteditable="true"]')) return null
  const own = target.closest<HTMLElement>('[data-drag-open]')
  // One in a list of your own order (a pin in the sidebar) moves there first, as a list row does.
  if (own) return { node: own, carried: { open: own.dataset.dragOpen, title: titleOf(own), kind: own.dataset.dragKind }, column: !!own.closest('[data-sortable-id]') }
  const listed = target.closest<HTMLElement>('[data-pane] [data-row][data-id]')
  const pane = listed?.closest('[data-pane]')?.getAttribute('data-pane')
  if (!listed || !pane || listed.closest('[data-group-row]')) return null
  // A row that drags into your own order waits until it leaves its column.
  // Any other list row (a task in Today, Upcoming, Later) waits too, until the
  // pointer is at the page's very edge: a row nudged up or down in its list,
  // or carried over the task open beside it, never brings the places up, nor
  // lets go into one by surprise. Today's rows sort by a drag and still wait for the edge (data-split-edge).
  // Several picked travel as one list drag. A split place takes one thing, so it stays down while more than one is picked (16 Nov).
  if (document.querySelectorAll('[data-row][data-picked]').length > 1) return null
  const sorts = !!listed.closest('[data-sortable-id]')
  return { node: listed, carried: { row: { pane, id: listed.dataset.id! }, title: titleOf(listed), kind: listed.dataset.dragKind }, column: true, edgeOnly: !sorts || !!listed.closest('[data-split-edge]') }
}

/** Whether a sidebar place takes what is carried: Pinned takes a note (never a task or a list's row), the Queue anything but a task. */
const takes = (place: HTMLElement, carried: Carried, node: HTMLElement | undefined): boolean => {
  const task = carried.open?.startsWith('task:') || !!node?.closest('[data-task-row]')
  if (place.dataset.sideDrop) return !!carried.open && !task
  if (place.dataset.queueDrop !== undefined) return !task
  // Writing's own row takes a capture alone: it becomes a page there (lib/capture-links.tsx, `toWriting`).
  if (place.dataset.writingDrop !== undefined) return node?.dataset.type === 'capture'
  return true
}

/** A capture carried over Writing's row or one of its folders: letting go makes it a page there. What the card says, or null. */
const toWritingSaid = (place: HTMLElement | null, node: HTMLElement | undefined): string | null => {
  if (!place || node?.dataset.type !== 'capture') return null
  if (place.dataset.writingDrop !== undefined) return 'Move to Writing'
  return place.dataset.folderList === 'article' ? `Move to “${place.dataset.folderName ?? 'this folder'}”` : null
}

/** A sidebar folder of one list, and a row of the other carried over it. */
const wrongFolder = (place: HTMLElement, node: HTMLElement | undefined): boolean =>
  !!place.dataset.folderList && !!node?.dataset.type && node.dataset.type !== place.dataset.folderList && !toWritingSaid(place, node)

/** `reach`: the card and everything between it and its side of the page, top to bottom: the pointer at the very edge is in it too. */
type Zone = { key: string; side: Side; at: number; left: number; top: number; width: number; height: number; reach: { left: number; right: number; top: number; bottom: number } }
/**
 * Dia's two places: a tall card a little in from each side, centred top to
 * bottom, the same size on both sides and there whole from the start, never
 * a thin strip that grows. Beside a list's own drag, only as wide as the room
 * either side of its column allows, so it never covers what it could drop in.
 */
const zonesIn = (area: DOMRect, gaps: number[], column?: DOMRect, edge = false): Zone[] => {
  const full = Math.max(180, Math.min(320, area.width * 0.24))
  // Brought up only at the page's edge (a task row): a strip there, never over the list or the task open beside it.
  const width = edge ? NARROW : column ? Math.max(NARROW, Math.min(full, column.left - area.left - INSET - OUTSIDE - 8, area.right - column.right - INSET - OUTSIDE - 8)) : full
  const height = Math.max(220, Math.min(640, area.height * 0.72))
  const top = area.top + (area.height - height) / 2
  // A place on each divider too, a pane's edge in the middle of the page, for what is not a list's own drag.
  const middle = Math.min(width, ...[area.left, ...gaps, area.right].slice(1).map((x, at) => (x - [area.left, ...gaps][at]) * 0.34))
  return [
    { key: 'left', side: 'left', at: 0, left: area.left + INSET, top, width, height, reach: { left: area.left - 40, right: area.left + INSET + width, top: area.top, bottom: area.bottom } },
    ...(column || edge ? [] : gaps.map((x, at): Zone => ({ key: `gap${at}`, side: 'between', at: at + 1, left: x - middle / 2, top, width: middle, height, reach: { left: x - middle / 2, right: x + middle / 2, top: area.top, bottom: area.bottom } }))),
    { key: 'right', side: 'right', at: gaps.length + 1, left: area.right - INSET - width, top, width, height, reach: { left: area.right - INSET - width, right: area.right + 40, top: area.top, bottom: area.bottom } }
  ]
}
/** How far the pointer is from a place: 0 inside it. */
const distance = (zone: Zone, x: number, y: number): number => {
  const dx = Math.max(zone.left - x, 0, x - (zone.left + zone.width))
  const dy = Math.max(zone.top - y, 0, y - (zone.top + zone.height))
  return Math.hypot(dx, dy)
}

/** Cancel a list's own drag (dnd-kit), as leaving the window would. */
const dropListDrag = (): void => void window.dispatchEvent(new Event('visibilitychange'))

export function SplitDrop({ onDrop, onRow }: { onDrop: (carried: Carried, at: number) => void; onRow: (carried: Carried, pane: string, at: number) => void }): React.JSX.Element | null {
  const [carried, setCarried] = useState<Carried | null>(null)
  // What letting go here will do, said under the pointer: only where a capture is over Writing or a folder of it.
  const [said, setSaid] = useState<string | null | undefined>(undefined)
  // Carried by a list's own drag, which draws its own lifted picture: no second one here.
  const [zones, setZones] = useState<Zone[]>([])
  const [hot, setHot] = useState<string | null>(null)
  // The other pane's page it would open in, drawn as a place like the edges'.
  const [takeBox, setTakeBox] = useState<DOMRect | null>(null)
  const dropRef = useRef({ onDrop, onRow })
  dropRef.current = { onDrop, onRow }
  // The pointer, and where the card is drawn toward.
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const cardX = useMotionValue(0)
  const cardY = useMotionValue(0)
  const card = { x: useSpring(cardX, { stiffness: 520, damping: 38, mass: 0.6 }), y: useSpring(cardY, { stiffness: 520, damping: 38, mass: 0.6 }) }
  const shrink = useMotionValue(1)
  const cardScale = useSpring(shrink, { stiffness: 420, damping: 34 })
  // Each place's lean toward the pointer and its growth, sprung.
  const lean = { left: useMotionValue(0), right: useMotionValue(0) }
  const grow = { left: useMotionValue(1), right: useMotionValue(1) }
  const leanS = { left: useSpring(lean.left, { stiffness: 300, damping: 24 }), right: useSpring(lean.right, { stiffness: 300, damping: 24 }) }
  const growS = { left: useSpring(grow.left, { stiffness: 300, damping: 24 }), right: useSpring(grow.right, { stiffness: 300, damping: 24 }) }

  useEffect(() => {
    if (!canSplit()) return
    let down: { x: number; y: number; source: NonNullable<ReturnType<typeof sourceOf>>; column: DOMRect } | null = null
    let active = false
    let shown: Zone[] = []
    let over: Zone | null = null
    // Every place a carried tab could make a new pane, and where its row is at.
    let places: Zone[] = []
    let gapped: { pane: string; at: number } | null = null
    // Where on the thing it was taken hold of: the card keeps that side under the pointer (scaled to the card, which is smaller), never jumping to its middle.
    let grab = { x: 0, y: 0 }
    // The Queue's row in the sidebar, while the carried thing is over it: let go there, it joins the queue.
    // Pinned in the sidebar takes a note the same way (side-menu.tsx).
    let queued: HTMLElement | null = null
    // The height the card rests at while over that place: just clear of its row.
    let rest: number | null = null
    // Another pane's page, while the carried thing is over it: let go there, it opens there as a new tab.
    let taking: HTMLElement | null = null
    const takeAt = (px: number, py: number): HTMLElement | null => {
      if (!down || document.querySelectorAll('[data-pane]').length < 2) return null
      const from = down.source.carried.tab?.pane ?? down.source.node.closest('[data-pane]')?.getAttribute('data-pane')
      for (const one of document.elementsFromPoint(px, py)) {
        const card = one.closest<HTMLElement>('[data-pane-card]')
        if (card) return card.closest('[data-pane]')?.getAttribute('data-pane') === from ? null : card
      }
      return null
    }
    const letTake = (): void => void (taking && (delete taking.dataset.paneTake, setTakeBox(null)), (taking = null))
    // Read under the carried picture too: over the list's path bar it sits right under the pointer.
    const queueAt = (px: number, py: number): HTMLElement | null => {
      for (const one of document.elementsFromPoint(px, py)) {
        const place = one.closest<HTMLElement>('[data-queue-drop], [data-side-drop], [data-folder-drop], [data-keep-drop], [data-writing-drop], [data-tab-row]')
        if (place) return place
      }
      return null
    }
    // The panes' pages: the rows of tabs over them are places of their own.
    // Read from its holder, which never moves: the pages themselves step back by a scale while the strips are up (below),
    // and the edges, the strips and "back in from the edge" are the window's, not the scaled page's.
    const area = (): DOMRect | null => {
      const box = document.querySelector('[data-split-area]')?.parentElement?.getBoundingClientRect()
      if (!box) return null
      const under = Math.max(box.top, ...[...document.querySelectorAll('[data-tabs]')].map((one) => one.getBoundingClientRect().bottom))
      return new DOMRect(box.left, under, box.width, box.bottom - under)
    }
    const dividers = (): number[] => [...document.querySelectorAll('[data-pane-divider]')].map((one) => { const box = one.getBoundingClientRect(); return box.left + box.width / 2 })
    /** The gap in a row of tabs shown no more. */
    const letGap = (): void => {
      gapped = null
      setCarry({ from: down?.source.carried.tab?.key ?? null, gap: null })
    }

    let quiet = still()
    // The places put away while the drag goes on.
    const hide = (): void => {
      letTake()
      active = false
      shown = []
      over = null
      if (queued) (delete queued.dataset.queueHot, delete queued.dataset.folderNo)
      queued = null
      gapped = null
      setCarry({ from: null, gap: null })
      delete document.documentElement.dataset.splitDrag
      delete document.documentElement.dataset.splitRoom
      delete document.documentElement.dataset.splitPin
      setCarried(null)
      setSaid(undefined)
      setHot(null)
    }
    const reset = (): void => {
      letTake()
      down = null
      active = false
      shown = []
      over = null
      if (queued) (delete queued.dataset.queueHot, delete queued.dataset.folderNo)
      queued = null
      gapped = null
      setCarry({ from: null, gap: null })
      delete document.documentElement.dataset.splitDrag
      delete document.documentElement.dataset.splitRoom
      delete document.documentElement.dataset.splitPin
      setCarried(null)
      setSaid(undefined)
      setHot(null)
    }
    const follow = (px: number, py: number): void => {
      x.set(px)
      y.set(py)
      let target: Zone | null = null
      let toX = px - grab.x
      let toY = py - grab.y
      for (const zone of shown) {
        const far = distance(zone, px, py)
        const pull = Math.max(0, 1 - far / REACH)
        const middle = { x: zone.left + zone.width / 2, y: Math.max(zone.top + 40, Math.min(zone.top + zone.height - 40, py)) }
        let leant = 0
        const within = px >= zone.reach.left && px <= zone.reach.right && py >= zone.reach.top && py <= zone.reach.bottom
        if (far === 0 || within) target = zone
        // The place leans out toward the pointer and grows a touch; the card is drawn in.
        if (zone.side !== 'between') {
          leant = quiet ? 0 : Math.max(-14, Math.min(14, (px - middle.x) * 0.1 * pull))
          lean[zone.side].set(leant)
          grow[zone.side].set(quiet ? 1 : 1 + 0.035 * pull)
        }
        // In the place: the card rests just under its words, never over them.
        if (far === 0 || within) (toX = zone.left + zone.width / 2 + leant), (toY = zone.top + zone.height / 2 + 64)
        else if (pull > 0 && !quiet) (toX = px - grab.x + (middle.x - px) * 0.32 * pull), (toY = py - grab.y + (middle.y - py) * 0.32 * pull)
      }
      const found = target ? null : queueAt(px, py)
      // A place that would not take it stays unlit: lit, it promises what letting go there would not do.
      const queue = found && down && !takes(found, down.source.carried, down.source.node) ? null : found
      // Over a row of tabs: the gap it would land in opens there, and the row scrolls on when pressed against its end.
      const row = queue?.dataset.tabRow ? queue : null
      if (row && down) {
        const from = down.source.carried.tab?.key ?? null
        const at = gapIn(row, px, from)
        const box = row.getBoundingClientRect()
        row.scrollLeft += px < box.left + 24 ? -12 : px > box.right - 24 ? 12 : 0
        gapped = { pane: row.dataset.tabRow!, at }
        setCarry({ from, gap: { ...gapped, width: Math.min(120, Math.max(44, box.width / (row.querySelectorAll('[data-tab]').length + 1))) } })
      } else if (gapped) letGap()
      // A tab's places come up once it is off the rows, down over the page; a lone tab of a lone pane has none to go to.
      if (down?.source.carried.tab) {
        const want = py > (area()?.top ?? 0) + 8 ? places : []
        if (want.length !== shown.length) (shown = want), setZones(want)
      }
      if (queue !== queued) {
        if (queued) (delete queued.dataset.queueHot, delete queued.dataset.folderNo)
        // A folder of the other list takes no note: it stays unlit, and says why on letting go.
        if (queue && wrongFolder(queue, down?.source.node)) queue.dataset.folderNo = ''
        // A tab carried says nothing until it lands: moving one is one act, one sound.
        // A light tap on the trackpad too, as a row coming over a new place in a list gives (lib/haptics.ts).
        else if (queue) (queue.dataset.queueHot = ''), down?.source.carried.tab || (click('tick'), detent())
        queued = queue
        // "Not in a folder" (and the Folders heading) take it out of the one it is in.
        if (queue?.dataset.keepDrop) setSaid(queue.dataset.keepDrop === 'none' ? 'Take out of its folder' : `Keep in “${queue.dataset.folderName ?? 'this folder'}”`)
        else if (down?.source.node.dataset.type === 'capture') setSaid(toWritingSaid(queue, down.source.node))
        else setSaid(undefined)
        // Where the card rests while it is over this place, read once as it comes over it.
        const box = queue && !row ? queue.getBoundingClientRect() : null
        const tall = (document.querySelector<HTMLElement>('[data-split-card]')?.offsetHeight ?? 32) * 0.86
        rest = box && (box.bottom + 6 + tall <= innerHeight - 8 ? box.bottom + 6 + tall / 2 : box.top - 6 - tall / 2)
      }
      // Over a place in the sidebar (Writing, a folder, the Queue, Pinned): the card rests just under that row (over
      // it where there is no room under), so the name it is aimed at is never covered; sideways it keeps the side it
      // was taken by.
      if (queue && !row && rest !== null) toY = rest
      // Over a row of tabs, the card rides just under it, so the room opening there is never under the card.
      if (row) toY = row.getBoundingClientRect().bottom + 6 + (document.querySelector<HTMLElement>('[data-split-card]')?.offsetHeight ?? 32) * 0.43
      if (quiet) {
        card.x.jump(toX)
        card.y.jump(toY)
      } else {
        cardX.set(toX)
        cardY.set(toY)
      }
      const take = target || queue ? null : takeAt(px, py)
      if (take !== taking) {
        letTake()
        if (take) (take.dataset.paneTake = ''), down?.source.carried.tab || click('tick')
        taking = take
      }
      // Measured as it goes: the pages ease aside for the edges' places while the drag begins.
      if (take) {
        const box = take.getBoundingClientRect()
        setTakeBox((was) => (was && Math.abs(was.left - box.left) < 1 && Math.abs(was.width - box.width) < 1 && Math.abs(was.top - box.top) < 1 ? was : box))
      }
      shrink.set(target || queue || take ? 0.86 : 1)
      if (target !== over) {
        over = target
        setHot((target as Zone | null)?.key ?? null)
        if (target && !down?.source.carried.tab) click('tick')
      }
    }
    const begin = (px: number, py: number): void => {
      const box = area()
      if (!box || !down) return
      active = true
      quiet = still()
      shown = zonesIn(box, dividers(), down.source.column ? down.column : undefined, !!down.source.edgeOnly)
      const tabbed = down.source.carried.tab
      if (tabbed) {
        // A pane's only tab: a new pane beside its own (its own two edges) would rebuild the layout it already has
        // ("but im moving the only tab causing the 2 splits in the first place"). Only what changes something is
        // offered: the other pane's tabs or page (merging the two), or the far side (the panes swap).
        const panes = [...document.querySelectorAll<HTMLElement>('[data-split-area] [data-pane]')]
        const own = panes.findIndex((one) => one.dataset.pane === tabbed.pane)
        const alone = own >= 0 && panes[own].querySelectorAll('[data-tab]').length === 1
        places = alone ? shown.filter((zone) => zone.at !== own && zone.at !== own + 1) : shown
        shown = []
        setCarry({ from: tabbed.key, gap: null })
      }
      // Up only at an edge, only that edge's place: the other side's would sit over the list for nothing.
      if (down.source.edgeOnly) shown = shown.filter((zone) => zone.side === (px < box.left + box.width / 2 ? 'left' : 'right'))
      document.documentElement.dataset.splitDrag = ''
      // Narrow strips at the edge: the pages step back from a side where a strip would lie over a place to drop, by a
      // scale (main.css), so the strip sits beside what is there. A scale, not narrower pages: their layout holds still
      // (a narrower page laid itself out again, and the Calendar's header jumped between two shapes).
      const drops = [...document.querySelectorAll('[data-pane] :is([data-row][data-id], [data-quadrant])')].map((one) => one.getBoundingClientRect())
      const crowded = (zone: Zone): boolean => !!down?.source.edgeOnly || drops.some((one) => one.width && one.left < zone.left + zone.width && one.right > zone.left)
      const room = shown.every((zone) => zone.width <= NARROW) ? shown.filter(crowded).map((zone) => zone.side) : []
      if (room.length) {
        document.documentElement.style.setProperty('--mf-split-room', String(Math.max(0.5, (box.width - ROOM * room.length) / box.width)))
        document.documentElement.style.setProperty('--mf-split-from', room.length > 1 ? 'center' : room[0] === 'left' ? 'right center' : 'left center')
        document.documentElement.dataset.splitRoom = room.join(' ')
      }
      // Pinned's "Drop here to pin" comes up only for what it takes (home.tsx).
      if (down.source.carried.open && !down.source.carried.open.startsWith('task:')) document.documentElement.dataset.splitPin = ''
      document.getSelection()?.removeAllRanges()
      // A list row in your own order already sounded its lift; anything else lifts now.
      if ((!down.source.column || down.source.edgeOnly) && !tabbed) chime('lift')
      // The card starts where the thing was, held by the spot taken hold of, not flying in from the corner.
      const from = down.source.node.getBoundingClientRect()
      grab = { x: Math.max(-34, Math.min(34, (down.x - (from.left + from.width / 2)) * 0.5)), y: Math.max(-14, Math.min(14, down.y - (from.top + from.height / 2))) }
      card.x.jump(px - grab.x)
      card.y.jump(py - grab.y)
      cardScale.jump(1)
      for (const side of ['left', 'right'] as const) (leanS[side].jump(0), growS[side].jump(1))
      setZones(shown)
      setCarried(down.source.carried)
      setSaid(down.source.node.dataset.type === 'capture' ? null : undefined)
      follow(px, py)
      // Up with the pointer already in a place (a list against the page's edge): the card is simply at rest there.
      if (over) (card.x.jump(cardX.get()), card.y.jump(cardY.get()), cardScale.jump(shrink.get()))
    }
    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0 || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
      const source = sourceOf(event.target)
      down = source && { x: event.clientX, y: event.clientY, source, column: source.node.getBoundingClientRect() }
    }
    const onMove = (event: PointerEvent): void => {
      if (!down) return
      if (!(event.buttons & 1)) return reset()
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) < START) return
      if (down.source.column) {
        // A list's own drag first: the places only while the pointer is at the page's edge.
        const box = area()
        const px = event.clientX
        // Over the sidebar's Queue or Pinned (not the one it came from): it can go there too.
        const side = queueAt(px, event.clientY)
        const elsewhere = !!side && !side.contains(down.source.node)
        const nearEdge = !!box && ((px >= box.left && px < box.left + EDGE) || (px <= box.right && px > box.right - EDGE))
        // Over a place on the page that takes rows (a page's tab): the list's own drag has it there, even at the page's
        // edge. The first tab of a page stands in that edge, and carried onto it a row was offered a split, never the tab.
        // Looked for only at the edge (or with the places up): a carry down the middle of a long list reads nothing more.
        const onPlace = (nearEdge || active) && document.elementsFromPoint(px, event.clientY).some((one) => !!one.closest('[data-row-drop]'))
        const atEdge = nearEdge && !onPlace
        // Out past the list's own column to either side (Pages' rows sit in a narrow column): the list is left, the places come up.
        const out = !down.source.edgeOnly && (px < down.column.left - OUTSIDE || px > down.column.right + OUTSIDE)
        const edge = elsewhere || atEdge || out
        // Back in over its column, away from the edge: they go, and the list's drag carries on.
        const back = !elsewhere && !out && (onPlace || !box || (px > box.left + INSET + NARROW && px < box.right - INSET - NARROW) || px < box.left || px > box.right)
        if (active && back) return hide()
        if (!active && !edge) return
      }
      if (active) return follow(event.clientX, event.clientY)
      begin(event.clientX, event.clientY)
    }
    const onUp = (event: PointerEvent): void => {
      // A task row carried and let go short of the edge was a drag, not a click: it does not open.
      if (!active && down?.source.edgeOnly && Math.hypot(event.clientX - down.x, event.clientY - down.y) >= START) swallowClick()
      if (!active || !down) return void (down = null)
      const side = over as Zone | null
      const what = down.source.carried
      const id = what.open ? what.open.slice(what.open.indexOf(':') + 1) : what.row?.id
      if (!side && gapped) {
        dropListDrag()
        event.preventDefault()
        swallowClick()
        dropRef.current.onRow(what, gapped.pane, gapped.at)
      } else if (!side && taking) {
        // Into another pane's page: a new tab there, at the end of its row.
        const pane = taking.closest('[data-pane]')?.getAttribute('data-pane')
        dropListDrag()
        event.preventDefault()
        swallowClick()
        if (pane) dropRef.current.onRow(what, pane, document.querySelectorAll(`[data-tab-row="${CSS.escape(pane)}"] [data-tab]`).length)
      } else if (!side && queued?.dataset.sideDrop && what.open) {
        dropListDrag()
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('haligtree:side-drop', { detail: { to: queued.dataset.sideDrop, open: what.open } }))
      } else if (!side && what.row && toWritingSaid(queued, down.source.node)) {
        // A capture onto Writing or one of its folders: a page there, with every picked capture if it is one (captures-view.tsx).
        dropListDrag()
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('haligtree:to-writing', { detail: { ids: [what.row.id], folder: queued?.dataset.folderDrop ?? null } }))
      } else if (!side && queued?.dataset.keepDrop && (what.row || what.open)) {
        // Onto a folder of Folders: kept there, any kind; a list with picked rows answers for all of them (items-view.tsx).
        // A page or note carried from under another folder in the sidebar comes by what it opens (`data-drag-open`).
        dropListDrag()
        event.preventDefault()
        const opened = !what.row && what.open ? [what.open.slice(0, what.open.indexOf(':')), what.open.slice(what.open.indexOf(':') + 1)] : null
        const type = opened ? opened[0] : down.source.node?.dataset.type
        const thing = { type: (['article', 'nugget', 'question', 'capture', 'task'].includes(type ?? '') ? type : down.source.node?.closest('[data-task-row]') ? 'task' : 'nugget') as FolderKind, id: opened ? opened[1] : what.row!.id }
        const folder = queued.dataset.keepDrop === 'none' ? null : { id: queued.dataset.keepDrop, name: queued.dataset.folderName ?? 'the folder' }
        if (window.dispatchEvent(new CustomEvent('haligtree:keep-drop', { cancelable: true, detail: { folder, thing } }))) void keepIn([thing], folder)
      } else if (!side && queued?.dataset.folderNo !== undefined && what.row) {
        dropListDrag()
        event.preventDefault()
        const gems = queued.dataset.folderList === 'nugget'
        refuse(gems ? 'Gems folders hold gems: make it a gem first' : 'Writing folders hold writing: make it a page first')
      } else if (!side && queued?.dataset.folderDrop && what.row) {
        // Onto a folder in the sidebar: into that group, with every picked row if it is one (items-view.tsx).
        dropListDrag()
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('haligtree:folder-drop', { detail: { group: queued.dataset.folderDrop, ids: [what.row.id] } }))
      } else if (!side && queued && queued.dataset.queueDrop !== undefined && id) {
        dropListDrag()
        event.preventDefault()
        void enqueue([id])
      } else if (side) {
        // Where the card was let go, read first, while the page is still as last drawn: read after the drag lets go
        // of the page, it worked out every element's style again in the middle of the drop.
        const card = document.querySelector('[data-split-card]')?.getBoundingClientRect()
        dropListDrag()
        event.preventDefault()
        swallowClick()
        landing = card ? { rect: card, at: performance.now() } : null
        // The new pane is made a frame after the drop, not inside the mouse-up: the drop's own
        // clearing (the card, the zones, the drag's styles) is drawn first and the page is laid out
        // once for the pane, where doing both in one go laid it out about eight times over.
        const at = side.at
        requestAnimationFrame(() => dropRef.current.onDrop(what, at))
      }
      reset()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // A list's own drag put back with Esc: the press is over, so moving on while still held starts nothing here.
      if (!active) return void (down = null)
      event.preventDefault()
      event.stopPropagation()
      swallowRelease()
      dropListDrag()
      chime('stay')
      reset()
    }
    // Links and pictures would start the browser's own drag instead.
    const onDragStart = (event: DragEvent): void => void (down && event.preventDefault())
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', reset, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('dragstart', onDragStart, true)
    // The window losing the keys mid-carry (another app, or a window of this one, taking focus) puts the places away
    // but keeps the press: the button is still held, so the carry goes on and the places come back at the edge. Ending
    // it there left a task carried to the right edge with no places at all, until it was picked up again.
    window.addEventListener('blur', hide)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', reset, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('dragstart', onDragStart, true)
      window.removeEventListener('blur', hide)
      delete document.documentElement.dataset.splitDrag
      delete document.documentElement.dataset.splitRoom
      delete document.documentElement.dataset.splitPin
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Resting in a strip, the card stays inside it.
  const strip = zones.find((zone) => zone.key === hot && zone.width <= NARROW)
  const kind = carried?.kind ? CAPTURE_TYPES.find((one) => one.id === carried.kind) : undefined
  return createPortal(
    <AnimatePresence>
      {carried && (
        <motion.div
          key="split-drop"
          data-split-drop=""
          className="pointer-events-none fixed inset-0 z-[80]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: 0.12 }}
        >
          <AnimatePresence>
            {takeBox && (
              <motion.div key="take" data-pane-take-box="" aria-label="Open here" className="absolute flex items-start justify-center pt-10"
                style={{ left: takeBox.left, top: takeBox.top, width: takeBox.width, height: takeBox.height }}
                initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ type: 'spring', duration: 0.22, bounce: 0 }}>
                <span aria-hidden className="absolute inset-2 rounded-[15px] border-2 border-dashed border-[var(--tt-brand-color-400)] bg-[color-mix(in_oklab,var(--tt-brand-color-400)_6%,transparent)]" />
                <span className="relative flex items-center gap-2 rounded-full border bg-popover px-3.5 py-2 font-medium text-control text-foreground shadow-(--mf-panel-shadow)">
                  <AppWindow className="size-4 text-[var(--tt-brand-color-400)]" />Open here
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          {zones.map((zone) => (
            <ZoneBox key={zone.key} zone={zone} hot={hot === zone.key} lean={zone.side === 'between' ? undefined : leanS[zone.side]} grow={zone.side === 'between' ? undefined : growS[zone.side]} />
          ))}
          <motion.div className="absolute top-0 left-0" style={{ x: card.x, y: card.y, scale: cardScale, translateX: '-50%', translateY: '-50%', maxWidth: strip ? strip.width - 16 : '14rem' }}>
            <CarriedCard attrs={{ 'data-split-card': '' }} words={said} tint="var(--tt-color-text-brown)" className={strip ? 'w-full max-w-full' : undefined} title={carried.title} icon={kind ? <kind.icon className="size-3.5 shrink-0" style={{ color: kind.tint }} /> : <Columns2 className="size-3.5 shrink-0 opacity-70" />} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function ZoneBox({ zone, hot, lean, grow }: { zone: Zone; hot: boolean; lean?: MotionValue<number>; grow?: MotionValue<number> }): React.JSX.Element {
  // No limit on panes: a drop always adds one where it lands.
  const label = zone.side === 'between' ? 'Open between' : `Open on the ${zone.side}`
  // A narrow card beside a list's own drag: its words break evenly, clear of the dashed edge.
  const narrow = zone.width <= NARROW
  return (
    <motion.div
      data-split-zone={zone.side}
      data-hot={hot ? '' : undefined}
      aria-label={label}
      // Dia's card: dark and solid on the page, a dashed edge just inside it; the edge takes the accent while it is the place.
      className="absolute flex flex-col items-center justify-center gap-2.5 rounded-[22px] border bg-popover text-foreground shadow-[0_24px_60px_-24px_color-mix(in_oklab,var(--mf-shadow-ink)_50%,transparent)]"
      style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height, x: lean, scale: grow, transformOrigin: zone.side === 'left' ? 'left center' : zone.side === 'right' ? 'right center' : 'center' }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', duration: 0.24, bounce: 0 }}
    >
      <span aria-hidden className={`pointer-events-none absolute inset-2 rounded-[15px] border-2 border-dashed transition-colors duration-150 ${hot ? 'border-[var(--tt-brand-color-400)]' : 'border-foreground/20'}`} />
      <span className={`relative flex items-center justify-center transition-colors duration-150 [&_svg]:size-5 ${hot ? 'text-[var(--tt-brand-color-400)]' : 'text-muted-foreground'}`}><SplitMark side={zone.side} /></span>
      <span className={`relative text-center font-medium text-control transition-colors duration-150 ${narrow ? 'max-w-16 leading-tight text-balance' : 'px-2'} ${hot ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
    </motion.div>
  )
}

/** Two panes side by side, the half that would be new filled in. */
function SplitMark({ side }: { side: Side }): React.JSX.Element {
  if (side === 'between') {
    return (
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
        <rect x="5.6" y="3.6" width="4.8" height="8.8" rx="1" fill="currentColor" stroke="none" opacity="0.55" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M8 2.5v11" />
      <rect x={side === 'left' ? 2.6 : 8.6} y="3.6" width="4.8" height="8.8" rx="1" fill="currentColor" stroke="none" opacity="0.55" />
    </svg>
  )
}
