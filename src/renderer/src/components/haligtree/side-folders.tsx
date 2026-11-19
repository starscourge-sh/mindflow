import { openItems } from '@/lib/split'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NameInPlace } from './name-in-place'
import { newFolderHere } from './side-folder-section'
import { Branches } from './branches'

import { haligtree } from '@/lib/haligtree'
import { DEPTH, KEY, layoutOf, moveTo } from '@/lib/group-layout'
import { notes } from '@/lib/notes'
import { groups, isFolder, useGroups, useKept, type NoteGroup } from '@/lib/groups'
import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Unfold, Weighted } from './glide'
import { GroupIcon, IconChoice, binGroup } from './kept-groups'
import { CardAt, CarriedCard, RoomAt, clearWay, makeWay, offWindow, restBox, swallowClick, swallowRelease, type Spot } from './carry'
import { DROP_LIT } from './sortable'
import { pastEdge } from '@/lib/drag-edge'
import { slotTicker } from '@/lib/proximity'
import { RowMenu, openFromGrip, type RowItem } from './row-menu'
import { FolderPen, FolderHeart, Plus } from 'lucide-react'
import { Count, Tip, quietly, refuse, sayNow, toast } from './ui'
import { GROUP_KEY, GroupMark, changeRule, removeGroup, renameGroup, ruleSaid, tagsSaid, useGathered, useSmartGroups, type SmartGroup } from '@/lib/smart-groups'
import '@/lib/carry-cursor'

/** A new, empty folder, in Folders (one tree for the whole book), named as it is made. */
export const newFolder = (_list: 'article' | 'nugget', parent: string | null = null): void => newFolderHere(parent)

/**
 * A folder named as a tag is (case aside, "Money" and #money), once: an offer
 * to move that tag's notes of this list in, never done unasked.
 */
export async function offerTag(list: 'article' | 'nugget' | null, id: string, name: string): Promise<void> {
  // Named in the list itself, whose list is the one holding it.
  list ??= (await groups.list('article')).some((one) => one.id === id) ? 'article' : 'nugget'
  const tag = (await haligtree.tags()).find((one) => one.tag.toLowerCase() === name.trim().toLowerCase())?.tag
  if (!tag) return
  const seen = `folder-tag-offer:${id}:${tag.toLowerCase()}`
  try {
    if (localStorage.getItem(seen)) return
    localStorage.setItem(seen, '1')
  } catch {
    // Offered again next time, at worst.
  }
  const ids = (await haligtree.tag(tag)).filter((one) => one.type === list).map((one) => one.id)
  if (!ids.length) return
  const n = ids.length === 1 ? 'the 1 note' : `the ${num(ids.length)} notes`
  toast(`Move ${n} tagged #${tag} in?`, undefined, 'info', {
    label: 'Move in', key: 'M',
    run: () => void groups.place(ids.map((one) => ({ id: one, group: id }))).then((was) => (chime('gather'), toast(`Moved ${n} tagged #${tag} in`, () => void groups.place(was))))
  })
}

/**
 * A list's groups as folders under its sidebar row (Writing's or Gems'), the
 * way Apple Notes and Notion keep theirs: each with its icon, its name, how
 * many notes it holds (its subgroups' too) and its subgroups indented below.
 * A click opens the list on that group alone; a click on the icon changes it.
 * A folder dragged onto another goes inside it (three levels at most);
 * dropped by another's top or bottom edge, it moves to just before or after
 * it, in the list's own order, as in Finder's sidebar.
 */
export function SideFolders({ list, counted, open, shown, here, noteRow, onOpen, onUnfold, onNewPage }: {
  list: 'article' | 'nugget'
  /** Each folder's count shown, as the sidebar's own counts are (Customize sidebar). */
  counted: boolean
  /** Unfolded under the row. */
  open: boolean
  /** The list's notes, so a folder counts only what the list shows. */
  shown: Set<string>
  /** The group open now, if one is. */
  here?: string
  /** The note open now, its row hung under that group, on the same lines. */
  noteRow?: React.ReactNode
  onOpen: (id: string) => void
  onUnfold: () => void
  /** Writing's folders: a page made inside one, by its + or its menu (Notion's "Add a page inside"). */
  onNewPage?: (folder: string) => void
}): React.JSX.Element | null {
  const all = useGroups(list)
  const smart = useSmartGroups(list)
  // Many groups: the first few, the one open now, and the rest a press away, so they never push the sidebar long.
  const [everyGroup, setEveryGroup] = useState(false)
  const [naming, setNaming] = useState<string | null>(null)
  // A new folder, empty, its name open for typing.
  useEffect(() => {
    const onNew = (event: Event): void => {
      const { list: theirs, parent } = (event as CustomEvent<{ list: string; parent: string | null }>).detail
      if (theirs !== list) return
      onUnfold()
      void groups.make(list, 'New folder', parent).then((id) => (chime('promote'), setNaming(id), quietly(() => void groups.remove(id))))
    }
    window.addEventListener('haligtree:folder-new', onNew)
    return () => window.removeEventListener('haligtree:folder-new', onNew)
  }, [list, onUnfold])
  // The folders in the list's own order: where each group stands among the notes, and among its parent's.
  const order = useKept(`order:${list}`, () => notes.order(list), [] as string[], [list])
  const ranked = new Set(order)
  const layout = layoutOf([...order, ...all.flatMap((one) => one.members.filter((id) => !ranked.has(id)))], all)
  // The saved order drawn: everything at once where it now stands.
  useLayoutEffect(() => void (landing && (clearWay(true), setLanding(null))), [all, order]) // eslint-disable-line react-hooks/exhaustive-deps
  // Each folder's subfolders in the list's order, sorted once a draw: worked out per folder for every count, with
  // 300 folders it read every folder against every other and took seconds to draw the sidebar.
  const known = new Set(all.map((one) => one.id))
  const under = new Map<string | null, NoteGroup[]>()
  for (const one of all) {
    const parent = one.parent && known.has(one.parent) ? one.parent : null
    const these = under.get(parent)
    if (these) these.push(one)
    else under.set(parent, [one])
  }
  for (const [parent, these] of under) {
    const at = new Map((parent ? layout.groups[parent] ?? [] : layout.top).map((key, i) => [key, i]))
    these.sort((a, b) => (at.get(KEY + a.id) ?? -1) - (at.get(KEY + b.id) ?? -1))
  }
  const kids = (parent: string | null): NoteGroup[] => under.get(parent) ?? []
  // A folder being carried, and where it would land: inside one, or just before or after one.
  const [carried, setCarried] = useState<{ id: string; x: number; y: number } | null>(null)
  const [aim, setAim] = useState<Aim | null>(null)
  // Where the room is: the other folders make way for it, as a list's rows do (carry.tsx, makeWay).
  const [room, setRoom] = useState<Spot | null>(null)
  // Let go with a move: the folders stay where the drop put them until the saved order is drawn, so nothing jumps back.
  const [landing, setLanding] = useState<string | null>(null)
  const count = (group: NoteGroup): number => group.members.filter((id) => shown.has(id)).length + kids(group.id).reduce((sum, one) => sum + count(one), 0)
  const levelOf = (id: string | null): number => (id ? 1 + levelOf(all.find((one) => one.id === id)?.parent ?? null) : 0)
  const heightOf = (id: string): number => 1 + Math.max(0, ...kids(id).map((one) => heightOf(one.id)))
  const inside = (id: string, of: string): boolean => id === of || kids(of).some((one) => inside(id, one.id))
  // A folder carried onto another: inside it, if that stays three levels deep and is not itself inside the carried one.
  // Each says whether anything moved: a drop that moved something holds its place until the saved order is drawn.
  const nest = (id: string, parent: string | null): boolean => {
    const group = all.find((one) => one.id === id)
    if (!group || group.parent === parent) return false
    if (parent && inside(parent, id)) return (refuse('A folder can’t go inside itself'), false)
    if (levelOf(parent) + heightOf(id) > DEPTH) return (refuse(`Folders go ${DEPTH} levels deep`), false)
    const was = group.parent
    chime('gather')
    sayNow(groups.nest(id, parent), parent ? `Moved ${group.name} into ${all.find((one) => one.id === parent)?.name}` : `Moved ${group.name} to the top`, () => void groups.nest(id, was))
    return true
  }
  // Dropped by a folder's edge: just before or after it, beside it in what holds it.
  const reorder = (id: string, target: string, how: 'before' | 'after'): boolean => {
    const group = all.find((one) => one.id === id)
    const by = all.find((one) => one.id === target)
    if (!group || !by || id === target) return false
    const parent = by.parent && all.some((one) => one.id === by.parent) ? by.parent : null
    if (parent && inside(parent, id)) return (refuse('A folder can’t go inside itself'), false)
    if (levelOf(parent) + heightOf(id) > DEPTH) return (refuse(`Folders go ${DEPTH} levels deep`), false)
    const beside = (parent ? layout.groups[parent] ?? [] : layout.top).filter((key) => key !== KEY + id)
    const after = how === 'after' ? KEY + target : beside[beside.indexOf(KEY + target) - 1] ?? null
    if (beside.indexOf(after ?? '') + 1 === (parent ? layout.groups[parent] ?? [] : layout.top).indexOf(KEY + id) && group.parent === parent) return (chime('stay'), false)
    const next = moveTo(layout, KEY + id, { group: parent, after })
    const was = layout
    chime('gather')
    sayNow(groups.arrange(list, next), `Moved ${group.name} ${how} ${by.name}`, () => void groups.arrange(list, was))
    return true
  }
  // Carried as a list's row is: the same hand, the same card, Esc puts it back, and its folder's real edge says in or out.
  const ticks = useRef(slotTicker()).current
  const within = useRef(new Set<string>())
  const aimRef = useRef<Aim | null>(null)
  const lineOf = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-side-folders="${list}"] [data-side-folder="${CSS.escape(id)}"]`)?.closest<HTMLElement>('[data-folder-line]') ?? null
  // Where each folder's row rests, its slide left out: read off where they glide to, the room would chase itself.
  const rowBox = (id: string): DOMRect | undefined => {
    const line = lineOf(id)
    if (!line?.getClientRects().length) return undefined
    const box = restBox(line)
    return new DOMRect(box.left, box.top, box.width, box.height)
  }
  const treeOf = (id: string): string[] => [id, ...kids(id).filter(isFolder).flatMap((one) => treeOf(one.id))]
  const parentIn = (id: string | null | undefined): string | null => (id && all.find((one) => one.id === id)?.parent) || null
  /** Letting go there would put it deeper than folders go: refused, as the drop itself would be. */
  const tooDeep = (id: string, to: Aim): boolean => levelOf(to.how === 'into' ? to.target : parentIn(to.target)) + heightOf(id) > DEPTH
  const read = (id: string, x: number, y: number): Aim | null => {
    const tree = document.querySelector(`[data-side-folders="${list}"]`)?.getBoundingClientRect()
    // Off the sidebar's side, nothing here takes it; the same for far under the last folder, and out of the window
    // (carried up past the window's top, it went before the first folder unseen).
    if (!tree || offWindow() || x < tree.left - 24 || x > tree.right + 24 || y > tree.bottom + 56) return null
    const mine = treeOf(id)
    let over: { id: string; top: number; height: number } | null = null
    let far = Infinity
    for (const one of all.filter(isFolder)) {
      const box = mine.includes(one.id) ? undefined : rowBox(one.id)
      if (!box) continue
      const off = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0
      if (off < far) (far = off), (over = { id: one.id, top: box.top, height: box.height })
    }
    if (!over) return null
    const chain = (at: string): string[] => [...(parentIn(at) ? chain(parentIn(at)!) : []), at]
    const boxes = chain(over.id).flatMap((at) => {
      const shown = treeOf(at).map(rowBox).filter((one): one is DOMRect => !!one)
      return shown.length ? [{ id: at, top: Math.min(...shown.map((one) => one.top)), bottom: Math.max(...shown.map((one) => one.bottom)) }] : []
    })
    const line = (at: string, how: 'before' | 'after'): Aim => {
      const shown = treeOf(at).map(rowBox).filter((one): one is DOMRect => !!one)
      const row = rowBox(at)!
      return { target: at, how, y: how === 'before' ? row.top - 1 : Math.max(...shown.map((one) => one.bottom)) + 1, left: row.left, right: tree.right - 4 }
    }
    const past = pastEdge(boxes, y, within.current)
    if (past) return line(past.id, past.how)
    const at = (y - over.top) / over.height
    return at < 0.3 ? line(over.id, 'before') : at > 0.7 ? line(over.id, 'after') : { target: over.id, how: 'into', y: 0, left: 0, right: 0 }
  }
  /** The room for what letting go would do: among the folders, they make way and the room opens; into one, or off them, its own place. */
  const way = (id: string, next: Aim | null): void => {
    const me = lineOf(id)
    if (!me) return setRoom(null)
    const lines = [...document.querySelectorAll<HTMLElement>(`[data-side-folders="${list}"] [data-folder-line]`)].filter((one) => one.offsetHeight > 0)
    const tall = me.offsetHeight
    const here = restBox(me)
    const own: Spot = { ...here, height: tall, own: true }
    if (!next || next.how === 'into' || tooDeep(id, next)) return void (makeWay(lines, me, null, tall), setRoom(own))
    const laid = lines.map((el) => ({ el, top: restBox(el).top })).sort((a, b) => a.top - b.top)
    const at = (el: HTMLElement | null): number => laid.findIndex((one) => one.el === el)
    const gap = next.how === 'before' ? at(lineOf(next.target)) - 1 : Math.max(...treeOf(next.target).map(lineOf).map(at))
    const spot = makeWay(lines, me, gap, tall)
    // At the level it would land: beside the folder it goes before or after.
    const level = lineOf(next.target)
    const by = level ? restBox(level) : here
    setRoom(spot && { ...spot, left: by.left, width: by.width })
  }
  const carry = (event: React.PointerEvent, id: string): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    const [x0, y0] = [event.clientX, event.clientY]
    let lifted = false
    let ring = parentIn(id)
    const point = (next: Aim | null): void => {
      if (JSON.stringify(aimRef.current) === JSON.stringify(next)) return
      aimRef.current = next
      setAim(next)
      // Deeper than folders go: the pointer says no, as the card says why.
      if (next && tooDeep(id, next)) document.documentElement.dataset.dragRefused = ''
      else delete document.documentElement.dataset.dragRefused
      if (!next) return
      // What would hold it: crossing a folder's edge either way is the firm tap, a new place among the same folder's the light one.
      const holds = next.how === 'into' ? next.target : parentIn(next.target)
      ticks(`${next.how}:${next.target}`, holds !== ring)
      ring = holds
    }
    const move = (e: PointerEvent): void => {
      if (!lifted) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return
        lifted = true
        within.current.clear()
        ticks.start(id)
        setLanding(null)
        chime('lift')
        document.documentElement.dataset.dragging = ''
        document.getSelection()?.removeAllRanges()
      }
      setCarried({ id, x: e.clientX, y: e.clientY })
      at = { x: e.clientX, y: e.clientY }
      point(read(id, e.clientX, e.clientY))
    }
    // The sidebar scrolled under a still pointer: the place under it is read again and its room is there at once (carry.tsx `scrolled`).
    let at = { x: x0, y: y0 }
    const scrolled = (): void => void (lifted && (point(read(id, at.x, at.y)), way(id, aimRef.current)))
    const finish = (): void => {
      window.removeEventListener('scroll', scrolled, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('keydown', key, true)
      delete document.documentElement.dataset.dragging
      delete document.documentElement.dataset.dragRefused
      aimRef.current = null
      setAim(null)
      setCarried(null)
      setRoom(null)
    }
    const cancel = (): void => {
      finish()
      // Put back: the folders glide home.
      clearWay(false)
      if (lifted) chime('stay')
    }
    const up = (): void => {
      const now = aimRef.current
      finish()
      if (!lifted) return
      swallowClick()
      if (!now) return (clearWay(false), chime('stay'))
      // A move: held where the drop put them until the saved order is drawn (above); anything else goes home now.
      const moved = now.how === 'into' ? nest(id, now.target) : reorder(id, now.target, now.how)
      if (moved && now.how !== 'into') setLanding(id)
      else clearWay(false)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !lifted) return
      e.preventDefault()
      e.stopPropagation()
      swallowRelease()
      cancel()
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('scroll', scrolled, true)
  }
  // Read once each change is drawn: folded to its one row in the hand, its subfolders gone from under it.
  useLayoutEffect(() => void (carried && way(carried.id, aim)), [aim, carried?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const drag: Drag = { carried: carried?.id ?? landing, aim, carry }
  const lifted = carried && all.find((one) => one.id === carried.id)
  // Each level hung off a thin trunk from the row above it, a curved branch to each folder, as Pinned and
  // Tags are; the way down to the folder you are in lit. Each level steps in under its parent's icon.
  // The folder you are in, or one it sits inside: the lit way down runs through each.
  const holds = (id: string): boolean => id === here || kids(id).some((one) => holds(one.id))
  const rows = (parent: string | null, depth: number): React.JSX.Element | null => {
    const these = kids(parent).filter(isFolder)
    // Groups that gather by a rule hang after the folders, off the same trunk: folders first, as a beginner meets them.
    const many = smart.length > GROUPS_SHOWN && !everyGroup
    const gathered = parent === null ? (many ? smart.filter((one, at) => at < GROUPS_SHOWN || here === GROUP_KEY + one.id) : smart) : []
    const noted = !!noteRow && parent === here && parent !== null
    if (!these.length && !gathered.length && !noted) return null
    const lit = these.findIndex((one) => holds(one.id))
    const litGroup = gathered.findIndex((one) => here === GROUP_KEY + one.id)
    const before = these.length
    return (
      <Branches current={noted ? before : lit >= 0 ? lit : litGroup >= 0 ? before + litGroup : -1} className="ml-5 flex flex-col gap-px">
        {these.flatMap((group) => {
          const inner = rows(group.id, depth + 1)
          return [
            <Folder key={group.id} list={list} group={group} depth={depth} n={counted ? count(group) : null} here={here === group.id && !noteRow} naming={naming === group.id} onNamed={() => setNaming(null)} onRename={() => setNaming(group.id)} onNewPage={onNewPage} onOpen={onOpen} onNest={nest} drag={drag} />,
            inner && <div key={`${group.id}:in`} data-no-twig="">{inner}</div>
          ]
        })}
        {gathered.map((group) => <SmartRow key={group.id} group={group} shown={shown} counted={counted} here={here === GROUP_KEY + group.id} onOpen={() => onOpen(GROUP_KEY + group.id)} />)}
        {noted && noteRow}
        {parent === null && smart.length > GROUPS_SHOWN && (
          <button type="button" data-side-row data-groups-more={smart.length} onClick={() => (chime(everyGroup ? 'fold' : 'slide'), setEveryGroup(!everyGroup))}
            className="flex w-full min-w-0 items-center gap-2 rounded-md py-1 pr-2 pl-2 text-muted-foreground hover:text-foreground">
            <span className="size-4 shrink-0" />
            <span className="flex-1 text-left">{everyGroup ? 'Show fewer groups' : `Show all ${num(smart.length)} groups`}</span>
          </button>
        )}
      </Branches>
    )
  }
  const top = rows(null, 0)
  if (!top) return null
  return (
    <Unfold open={open}>
      <div data-side-folders={list}>{top}</div>
      {/* The folder carried, as a row is carried in the list: lifted under the pointer, in the app's own look. */}
      {/* It says what letting go would do, as a list's card does: beside a folder, or inside the one that is lit. It rides clear of the line, as a list's card does. */}
      {lifted && (
        <CardAt x={carried.x} y={carried.y}>
          <CarriedCard attrs={{ 'data-folder-ghost': lifted.id }} icon={<GroupIcon icon={lifted.icon} color={lifted.color} className="size-3.5" />} title={lifted.name} refused={!!aim && tooDeep(lifted.id, aim)}
            words={!aim ? null : tooDeep(lifted.id, aim) ? `Folders go ${DEPTH} levels deep` : aim.how === 'into' ? `Move into ${all.find((one) => one.id === aim.target)?.name ?? 'it'}` : 'Move here'} />
        </CardAt>
      )}
      {/* Where it lands: the room the folders open, with the line every list draws through it (carry.tsx); its own place, the band alone. */}
      {lifted && room && <RoomAt at={room} how={aim?.how ?? 'own'} />}
    </Unfold>
  )
}

/** Groups listed before the rest fold behind "Show all". */
const GROUPS_SHOWN = 6

type Aim = { target: string; how: 'into' | 'before' | 'after'; /** Its line, where one is drawn. */ y: number; left: number; right: number }
type Drag = { carried: string | null; aim: Aim | null; carry: (event: React.PointerEvent, id: string) => void }


function Folder({ list, group, depth, n, here, naming, onNamed, onRename, onOpen, onNest, onNewPage, drag }: {
  list: 'article' | 'nugget'
  group: NoteGroup
  depth: number
  /** Its count, or null with the counts off. */
  n: number | null
  here: boolean
  naming: boolean
  onNamed: () => void
  onRename: () => void
  onOpen: (id: string) => void
  onNest: (id: string, parent: string | null) => void
  onNewPage?: (folder: string) => void
  drag: Drag
}): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const over = drag.aim?.target === group.id && drag.aim.how === 'into'
  const pick = (icon: string | null): void => {
    const was = group.icon
    chime('tap')
    setPicking(false)
    void groups.set(group.id, { icon }).then(() => quietly(() => void groups.set(group.id, { icon: was })))
  }
  const name = (next: string): void => {
    onNamed()
    const words = next.trim()
    if (!words || words === group.name) return void (words && offerTag(list, group.id, words))
    // ⌘Z takes the old name back, as a folder renamed in the list does (kept-groups' change).
    const was = group.name
    void groups.set(group.id, { name: words }).then(() => (quietly(() => void groups.set(group.id, { name: was })), offerTag(list, group.id, words)))
  }
  // The level's own step in is its trunk's (rows above); within it, the rows' own edge.
  const left = '0.5rem'
  const menu: RowItem[] = [
    { label: 'Open', run: () => onOpen(group.id) },
    // Beside the page in front, as a page's row offers it (⌥-click on the row does it too).
    ...openItems('folder', `${list}:${group.id}`),
    { label: 'Rename…', run: onRename },
    { label: 'Change icon…', run: () => setPicking(true) },
    onNewPage && { label: 'New page inside', run: () => onNewPage(group.id) },
    depth < DEPTH - 1 && { label: 'New folder inside', run: () => newFolder(list, group.id) },
    group.parent ? { label: 'Move to the top', run: () => onNest(group.id, null) } : null,
    'separator',
    // Its notes go to the Bin with it, as a deleted folder's do in Finder; keeping them is the second choice.
    group.members.length > 0 && { label: 'Delete folder', hint: 'Its notes go to the Bin too', danger: true, run: () => void binGroup(group.id) },
    { label: group.members.length ? 'Delete folder, keep its notes' : 'Delete folder', hint: group.members.length ? 'They move up a level' : undefined, danger: !group.members.length, run: () => {
      const { id, name: was, icon, color, parent, members } = group
      chime('separate')
      sayNow(groups.remove(id), `Deleted ${was}: its notes stay`, () => void (async () => {
        const back = await groups.make(list, was, parent)
        await groups.set(back, { icon, color })
        await groups.place(members.map((one, at) => ({ id: one, group: back, order: at })))
      })())
    } }
  ]
  return (
    <Popover open={picking} onOpenChange={setPicking}>
      <PopoverAnchor asChild>
        <div className="group/folder relative flex items-center data-[carried-folder]:invisible" data-folder-line="" data-carry-held={drag.carried === group.id ? '' : undefined}
          // Carried by its row onto another folder, it goes inside that one; by its top or bottom edge, before or after it.
          data-carried-folder={drag.carried === group.id ? '' : undefined}
          onPointerDown={(event) => !naming && !(event.target as Element).closest('[data-folder-icon]') && drag.carry(event, group.id)}>
          {naming ? (
            <NameInPlace initial={group.name} data-folder-name={group.id} label="Folder name" placeholder="Name the folder"
              onDone={(words) => (words === null ? onNamed() : name(words))}
              style={{ paddingLeft: `calc(${left} + 1.5rem)` }}
              className="w-full min-w-0 rounded-md bg-accent/60 py-1 pr-2 text-foreground outline-none ring-1 ring-ring/40" />
          ) : (
            <RowMenu items={menu}>
              <button
                type="button"
                data-side-row
                data-side-folder={group.id}
                // A row carried here goes in (split-drop.tsx); lit while it is over it, as the Queue's row is. One of the other list stays unlit.
                data-folder-drop={group.id}
                data-folder-list={list}
                data-folder-name={group.name}
                // Past two lines, the whole name on pointing (title-tips.tsx shows it only when cut).
                title={group.name}
                aria-current={here ? 'page' : undefined}
                onClick={() => onOpen(group.id)}
                // Under the row's own icon, a step in for each level.
                style={{ paddingLeft: left }}
                // A long name ("Words worth knowing" at the sidebar's narrowest) goes on to a second line rather than
                // being cut; the count stays on its first line, on the same baseline as every other row's.
                data-drop-hot={over ? '' : undefined}
                className={`flex w-full min-w-0 items-baseline gap-2 rounded-md py-1 pr-2 ${here ? 'text-foreground' : 'text-(--mf-muted-strong)'} ${DROP_LIT} data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:text-foreground data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)] data-[folder-no]:cursor-not-allowed data-[folder-no]:opacity-50`}
              >
                {/* Room for the icon, which is its own button over this one. */}
                <span className="size-4 shrink-0" />
                <Weighted on={here} className={`flex-1 text-left truncate ${n === 0 && !here ? 'text-muted-foreground' : ''}`}>{group.name}</Weighted>
                {n !== null && <Count n={n} className={`text-xs text-muted-foreground ${onNewPage ? 'transition-opacity duration-80 group-hover/folder:opacity-0' : ''}`} />}
              </button>
            </RowMenu>
          )}
          <button type="button" aria-label={`Change the icon of ${group.name}`} data-folder-icon={group.id} onClick={() => setPicking(true)}
            style={{ left: `calc(${left} - 0.125rem)` }}
            // Pressed anywhere in the row's height round it (28px,
            // as the row's own targets), not just the 20px tile it draws.
            className="absolute top-1 flex size-5 cursor-pointer items-center before:absolute before:-inset-1 before:content-[''] justify-center rounded-md transition-[background-color,box-shadow] duration-100 hover:bg-foreground/10 hover:ring-1 hover:ring-foreground/20">
            {/* Nothing in it: its icon faint in a dashed outline, as an empty folder is drawn in its list. */}
            {n === 0
              ? <span data-folder-empty="" className="flex size-5 items-center justify-center rounded-[4px] border border-dashed border-foreground/35"><span className="opacity-45 grayscale-[0.6]"><GroupIcon icon={group.icon} color={group.color} className="size-3" /></span></span>
              : <GroupIcon icon={group.icon} color={group.color} className="size-3.5" />}
          </button>
          {/* A page inside it: a quiet + in the count's place, until pointed at (Notion's "Add a page inside"). */}
          {onNewPage && !naming && (
            <Tip label="Add a page inside">
              <button type="button" data-folder-new-page={group.id} aria-label={`Add a page inside ${group.name}`} onClick={() => onNewPage(group.id)}
                className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-[opacity,background-color] duration-80 group-hover/folder:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 [:root[data-dragging]_&]:!opacity-0">
                <Plus className="size-3.5" />
              </button>
            </Tip>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0" onFocusOutside={(event) => event.preventDefault()}>
        <IconChoice group={group} onPick={pick} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * A group in the sidebar, after the folders: its own look (a sparkle where a folder has its icon, its name in
 * italic), its rule said when pointed at, and a count of what it gathers. Nothing is dragged into it: it gathers.
 */
function SmartRow({ group, shown, counted, here, onOpen }: { group: SmartGroup; shown: Set<string>; counted: boolean; here: boolean; onOpen: () => void }): React.JSX.Element {
  const gathered = useGathered(group)
  const n = gathered ? [...gathered].filter((id) => shown.has(id)).length : null
  const [naming, setNaming] = useState(false)
  // Renamed in its row, as a folder is: the same field, Enter or a click away keeps it, Esc leaves it.
  if (naming)
    return (
      <div className="flex w-full min-w-0 items-center gap-2 py-1 pr-2 pl-2">
        <span className="flex size-4 shrink-0 items-center justify-center"><GroupMark className="size-3.5" style={{ color: 'var(--tt-color-text-purple)' }} /></span>
        <NameInPlace initial={group.name} data-group-name={group.id} label="Group name" placeholder="Name the group" onDone={(words) => (setNaming(false), words && void renameGroup(group, words))}
          className="min-w-0 flex-1 rounded-md bg-accent/60 px-1 text-foreground italic outline-none ring-1 ring-ring/40" />
      </div>
    )
  return (
    <RowMenu items={[
      { label: 'Open', run: onOpen },
      { label: 'Rename…', run: () => setNaming(true) },
      { label: 'Change the rule…', hint: ruleSaid(group), run: () => void changeRule(group) },
      'separator',
      { label: 'Remove the group', hint: 'Its notes stay where they are', run: () => void removeGroup(group) }
    ]}>
      <Tip label={`${ruleSaid(group)}. A group gathers; it moves nothing`}>
        <button type="button" data-side-row data-side-group={group.id} aria-current={here ? 'page' : undefined} onClick={() => (chime('page'), onOpen())}
          className={`flex w-full min-w-0 items-center gap-2 rounded-md py-1 pr-2 pl-2 ${here ? 'text-foreground' : 'text-(--mf-muted-strong)'}`}>
          <span className="flex size-4 shrink-0 items-center justify-center"><GroupMark className="size-3.5" style={{ color: 'var(--tt-color-text-purple)' }} /></span>
          <Weighted on={here} className="flex-1 text-left italic">{group.name}</Weighted>
          {counted && n !== null && <Count n={n} className="text-xs text-muted-foreground" />}
        </button>
      </Tip>
    </RowMenu>
  )
}

/**
 * On the sidebar's icon rail, where there is no room for a tree: one button under Writing's or Gems' icon that
 * opens its folders and groups as a menu, folders first, each folder holding its subfolders as a submenu (the
 * tree, kept), then the groups by their rule. A click opens one, as its row in the full sidebar does.
 */
export function RailFolders({ list, onOpen }: { list: 'article' | 'nugget'; onOpen: (id: string) => void }): React.JSX.Element | null {
  const all = useGroups(list)
  const smart = useSmartGroups(list)
  if (!all.some(isFolder) && !smart.length) return null
  const under = (parent: string | null): RowItem[] => all.filter((one) => isFolder(one) && (one.parent ?? null) === parent).map((group) => {
    const kids = under(group.id)
    const icon = <GroupIcon icon={group.icon} color={group.color} className="size-3.5" />
    return kids.length ? { label: group.name, icon, items: [{ label: `Open ${group.name}`, icon, run: () => onOpen(group.id) }, 'separator', ...kids] } : { label: group.name, icon, run: () => onOpen(group.id) }
  })
  const items: RowItem[] = [
    ...(all.some(isFolder) ? [{ heading: 'Folders' } as RowItem, ...under(null)] : []),
    ...(smart.length ? [{ heading: 'Groups: gathered by tags' } as RowItem, ...smart.map((group) => ({ label: group.name, hint: tagsSaid(group.tags), icon: <GroupMark className="size-3.5" style={{ color: 'var(--tt-color-text-purple)' }} />, run: () => onOpen(GROUP_KEY + group.id) }))] : [])
  ]
  const name = list === 'article' ? 'Writing' : 'Gems'
  // Each list's own folder: a pen for Writing's, a heart for Gems', each named on hover, so the two are never one icon twice.
  const Icon = list === 'article' ? FolderPen : FolderHeart
  return (
    <RowMenu items={items}>
      <div className="flex w-full">
        <Tip label={`${name}'s folders`} side="right">
          <button type="button" data-side-row data-rail-folders={list} aria-label={`${name}'s folders and groups`} onClick={openFromGrip}
            className="flex w-full cursor-pointer items-center justify-center rounded-md py-1.5 text-(--mf-muted-strong)">
            <Icon className="size-4" />
          </button>
        </Tip>
      </div>
    </RowMenu>
  )
}
