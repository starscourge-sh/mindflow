import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, MeasuringStrategy, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type Modifier } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, type SortingStrategy } from '@dnd-kit/sortable'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Layers } from 'lucide-react'

import { alive } from '@/components/ui/alive-icon'
import XIcon from '@/components/ui/x-icon'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { IconPicker } from '@/components/emoji/icon-picker'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { chime, click } from '@/lib/sound'
import { slotTicker } from '@/lib/proximity'
import { archive } from '@/lib/notes'
import { spring as springs } from '@/lib/motion'
import { GROUP_COLORS, groups, tintOf } from '@/lib/groups'
import { KEY, isGroup, type How } from '@/lib/group-layout'
import { cn } from '@/lib/cn'
import { Lifted, Overlay, SETTLE, snapshot } from './sortable'
import { copy } from './row-menu'
import { Tip, VirtualList, refuse, toast } from './ui'
import type { Entry } from './note-list'

const X = alive(XIcon)

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

export type GroupView = { id: string; name: string; icon: string | null; color: string | null; open: boolean; members: string[] }
/** A line of the list: one note at the top level, or a group and the notes it shows. */
export type Bundle = { group?: GroupView; entries: Entry[] }

export type Folds = {
  bundles: Bundle[]
  /** A drop, for the list to work out and save. */
  onDrop: (active: string, target: string, how: How) => void
  onFold: (group: GroupView, open: boolean) => void
  /** A note just made in a group, to open. */
  onNewNote: (id: string) => void
  /** The group whose name is being written, as one just made is. */
  renaming: string | null
  onRenaming: (id: string | null) => void
  /** A group just made, which arrives rather than appears. */
  born: string | null
}

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
/** Up and down only. */
const upDown: Modifier = ({ transform }) => ({ ...transform, x: 0 })
/** Over a row, that row; in the hair between two, the nearest. */
const collide: CollisionDetection = (args) => {
  const hit = pointerWithin(args)
  return hit.length ? hit : closestCenter(args)
}
/** Emil's ease-out, the curve everything here settles on. */
const OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const INDENT = 16

/** What letting go now would do, and the words for it. */
type Aim = { target: string; how: How; into: string | null; label: string | null; tint?: string }
type Carry = {
  aim: Aim | null
  /** The carried row's height: the room a preview makes. */
  height: number
  /** A note being carried out of its group: that group closes over its place. */
  leaving: { group: string; id: string } | null
  /** Dragging down (the rows between move up to make room) or up. */
  down: boolean
}
const Carrying = createContext<Carry>({ aim: null, height: 0, leaving: null, down: false })

function Node({ id, children, inner, indent = 0 }: { id: string; children: ReactNode; inner?: CSSProperties; indent?: number }): React.JSX.Element {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
    transition: still() ? null : { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' }
  })
  const { aim, height } = useContext(Carrying)
  const here = aim?.target === id ? aim : null
  const lifted = here?.how === 'join'
  // A new group would form here: the panel around this row and the room under it.
  const forming = lifted && !here.into
  return (
    <div
      ref={setNodeRef}
      data-sortable-id={id}
      data-aim={here?.how}
      {...attributes}
      {...listeners}
      tabIndex={-1}
      role={undefined}
      className="relative isolate"
      style={{ transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined, transition, opacity: isDragging ? 0.3 : undefined }}
    >
      <AnimatePresence>
        {forming && (
          <motion.div
            key="forming"
            aria-hidden
            data-preview=""
            className="pointer-events-none absolute -inset-x-1 -top-1 -z-10 origin-top rounded-lg bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent)]"
            style={{ height: `calc(100% + ${height + 6}px)` }}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={still() ? { duration: 0 } : springs.moderate}
          >
            {/* Where the carried row would land: a quiet dashed place under the row it joins. */}
            <span className="absolute inset-x-2 bottom-1.5 rounded-md border border-dashed border-foreground/15" style={{ height: height - 6 }} />
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className="transition-[scale,translate,opacity] duration-200 motion-reduce:transition-none"
        style={{ transitionTimingFunction: OUT, scale: lifted ? 1.02 : 1, paddingLeft: indent || undefined, ...inner }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * The list itself, in place of the plain one while it is in your own order.
 * `face` draws a note's row as every list does; `index` counts rows on show,
 * which is what the keyboard's cursor counts.
 */
export function GroupedList({ bundles, onDrop, onFold, onNewNote, renaming, onRenaming, born, face, after, arrived, cursor, estimate, className }: Folds & {
  face: (entry: Entry, index: number) => React.JSX.Element
  after?: (entry: Entry) => ReactNode
  arrived: (id: string) => boolean
  cursor: number
  estimate: number
  className?: string
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const keys = bundles.flatMap((one) => (one.group ? [KEY + one.group.id, ...(one.group.open ? one.entries.map((entry) => entry.id) : [])] : one.entries.map((entry) => entry.id)))
  const info = useMemo(() => new Map(bundles.flatMap((one) => (one.group ? [[one.group.id, one.group] as const] : []))), [bundles])
  // The group each row on show is in, for what a drop would mean.
  const home = useMemo(() => new Map(bundles.flatMap((one) => (one.group ? one.entries.map((entry) => [entry.id, one.group!.id] as const) : []))), [bundles])
  const [carried, setCarried] = useState<string | null>(null)
  const [height, setHeight] = useState(0)
  const [aim, setAim] = useState<Aim | null>(null)
  const aimed = useRef<Aim | null>(null)
  const [shot, setShot] = useState<{ id: string; html: string; width: number; height: number } | null>(null)
  const ticks = useRef(slotTicker()).current
  const label = useRef<HTMLDivElement>(null)
  const rule = useRef<HTMLDivElement>(null)
  // Over the middle of a row, room opens just after it (or after the last of
  // its group's notes): where the carried row would land. Anywhere else
  // nothing moves; a line says where it would go. A group carried by its row
  // leaves its own notes where they are.
  const mine = carried && isGroup(carried) ? new Set(bundles.find((one) => one.group && KEY + one.group.id === carried)?.entries.map((entry) => entry.id)) : null
  const anchor = (target: string): string => {
    if (!isGroup(target)) return target
    const group = info.get(target.slice(KEY.length))
    return group?.open ? group.members.filter((id) => keys.includes(id)).pop() ?? target : target
  }
  const gapAfter = aim?.how === 'join' ? anchor(aim.target) : null
  const down = !!carried && !!gapAfter && keys.indexOf(carried) < keys.indexOf(gapAfter)
  const strategy: SortingStrategy = useMemo(
    () => (args) => {
      if (!gapAfter || (mine && mine.has(keys[args.index]))) return null
      const at = keys.indexOf(gapAfter)
      return verticalListSortingStrategy({ ...args, overIndex: args.activeIndex < at ? at : at + 1 })
    },
    [gapAfter, carried, keys.join('\n')] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const point = (next: Aim | null): void => {
    const was = aimed.current
    if (was?.target === next?.target && was?.how === next?.how && was?.label === next?.label) return
    aimed.current = next
    setAim(next)
  }
  const onDragStart = ({ active }: DragStartEvent): void => {
    const id = String(active.id)
    chime('lift')
    ticks.start(id)
    setCarried(id)
    setHeight(active.rect.current.initial?.height ?? 48)
    // A group lifts whole: its row and its notes.
    if (isGroup(id)) {
      const block = document.querySelector<HTMLElement>(`[data-group-block="${CSS.escape(id.slice(KEY.length))}"]`)
      const box = block?.getBoundingClientRect()
      setShot(block && box ? { id, html: block.innerHTML, width: box.width, height: box.height } : null)
    } else setShot(snapshot(id))
  }
  // Held over a folded group's row for a moment, the group opens, as a folder
  // does in Finder when something is held over it.
  const spring = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  const unspring = (): void => {
    if (spring.current) clearTimeout(spring.current.timer)
    spring.current = null
  }
  const onDragMove = ({ active, over, activatorEvent, delta }: DragMoveEvent): void => {
    const id = String(active.id)
    const target = over && String(over.id)
    const pointer = activatorEvent instanceof PointerEvent ? { x: activatorEvent.clientX + delta.x, y: activatorEvent.clientY + delta.y } : null
    // The words ride at the right end of the lifted row, clear of its title and of the rows under it.
    const lifted = active.rect.current.translated
    if (label.current && lifted) label.current.style.translate = `${Math.round(lifted.right - 14)}px ${Math.round(lifted.top + lifted.height / 2)}px`
    // The line sits over everything, the lifted row too, so it is never hidden under it.
    if (rule.current && over) {
      const node = document.querySelector<HTMLElement>(`[data-sortable-id="${CSS.escape(String(over.id))}"]`)
      const box = node?.getBoundingClientRect()
      if (box) rule.current.style.cssText = `left:${box.left}px;width:${box.width}px;top:${box.top}px;height:${box.height}px`
    }
    const shut = target && !isGroup(id) ? info.get(target.slice(KEY.length)) : undefined
    if (!shut || shut.open || !isGroup(target!)) unspring()
    else if (spring.current?.key !== target) {
      unspring()
      spring.current = { key: target!, timer: setTimeout(() => (click('tick'), onFold(shut, true), (spring.current = null)), 600) }
    }
    if (!target || target === id || !pointer) return point(null)
    const at = (pointer.y - over.rect.top) / over.rect.height
    const own = home.get(id)
    const targetGroup = isGroup(target) ? target.slice(KEY.length) : home.get(target)
    // A group never goes into another, and a note's own group is no new home.
    const joinable = !isGroup(id) && !(own && own === targetGroup)
    const how: How = joinable && at > 0.28 && at < 0.72 ? 'join' : at < 0.5 ? 'before' : 'after'
    const into = isGroup(id) ? null : how === 'join' ? targetGroup ?? null : isGroup(target) ? (how === 'after' && info.get(targetGroup!)?.open ? targetGroup! : null) : targetGroup ?? null
    const name = (group: string | null | undefined): string => info.get(group ?? '')?.name ?? 'the group'
    const words =
      isGroup(id) ? null
      : how === 'join' ? (into ? `Add to ${name(into)}` : 'New group')
      : own && into !== own ? (into ? `Move to ${name(into)}` : `Remove from ${name(own)}`)
      : !own && into ? `Add to ${name(into)}`
      : null
    point({ target, how, into, label: words, tint: tintOf(info.get(into ?? own ?? '')?.color) })
  }
  const end = (): void => {
    unspring()
    setShot(null)
    setCarried(null)
    point(null)
  }
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    const now = aimed.current
    end()
    if (!over || !now || now.target === String(active.id)) return chime('stay')
    onDrop(String(active.id), now.target, now.how)
  }
  const own = carried ? home.get(carried) : undefined
  const leaving = own && aim && aim.into !== own ? { group: own, id: carried! } : null
  let index = 0
  const lines = bundles.map((one) => {
    const start = index
    if (!one.group || one.group.open) index += one.entries.length
    return { one, start }
  })
  const line = lines.findIndex(({ one, start }) => cursor >= start && cursor < start + ((!one.group || one.group.open) ? one.entries.length : 0))
  const row = (entry: Entry, at: number, inner?: CSSProperties, indent?: number): React.JSX.Element => (
    <Node key={entry.id} id={entry.id} inner={inner} indent={indent}>
      <div className={`group/item relative ${arrived(entry.id) ? 'mf-arrive' : ''}`}>
        {face(entry, at)}
        {after?.(entry)}
      </div>
    </Node>
  )
  return (
    <DndContext sensors={sensors} collisionDetection={collide} modifiers={[upDown]} measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
      onDragStart={onDragStart} onDragMove={onDragMove} onDragOver={({ over }) => ticks(over?.id)} onDragEnd={onDragEnd} onDragCancel={end}>
      <SortableContext items={keys} strategy={strategy}>
        <Carrying.Provider value={{ aim, height, leaving, down }}>
          <VirtualList items={lines} keyOf={({ one }) => (one.group ? KEY + one.group.id : one.entries[0].id)} cursor={line >= 0 ? line : undefined} estimate={estimate} className={className}>
            {({ one, start }) =>
              one.group ? (
                <GroupBlock group={one.group} entries={one.entries} start={start} row={row} carried={carried === KEY + one.group.id} renaming={renaming === one.group.id}
                  born={born === one.group.id} onRenaming={(on) => onRenaming(on ? one.group!.id : null)} onFold={(open) => onFold(one.group!, open)} onNewNote={onNewNote} />
              ) : (
                row(one.entries[0], start)
              )
            }
          </VirtualList>
        </Carrying.Provider>
      </SortableContext>
      <Overlay dropAnimation={still() ? null : SETTLE}>
        {/* Over the middle of a row the lifted one draws in a little, so the row it would gather with shows lit around it. */}
        <div className="transition-[scale] duration-150 motion-reduce:transition-none" style={{ transitionTimingFunction: OUT, scale: aim?.how === 'join' ? 0.94 : 0.98 }}>
          <Lifted shot={shot} />
        </div>
      </Overlay>
      {createPortal(
        <div ref={rule} aria-hidden className="pointer-events-none fixed z-[1000]">
          {carried && aim && aim.how !== 'join' && (
            <span
              data-line={aim.how}
              className="absolute right-2 h-0.5 rounded-full bg-(--tt-brand-color-400) shadow-[0_0_0_2px_var(--background)] animate-in fade-in-0 duration-100 before:absolute before:-top-[3px] before:-left-2 before:size-2 before:rounded-full before:border-2 before:border-(--tt-brand-color-400) before:bg-background"
              style={{ left: (home.has(aim.target) ? INDENT : 0) + (isGroup(aim.target) && aim.into ? INDENT : 0) + 12, [aim.how === 'before' ? 'top' : 'bottom']: -1.5 }}
            />
          )}
        </div>,
        document.body
      )}
      {createPortal(
        <div ref={label} aria-hidden className="pointer-events-none fixed top-0 left-0 z-[1001]">
          <AnimatePresence>
            {carried && aim?.label && (
              <motion.span
                key={aim.label}
                data-drag-label=""
                className="flex -translate-x-full -translate-y-1/2 items-center gap-1.5 rounded-md bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.06 } }}
                transition={still() ? { duration: 0 } : springs.fast}
              >
                <span className="size-1.5 rounded-full" style={{ background: aim.tint ?? 'var(--muted-foreground)' }} />
                {aim.label}
              </motion.span>
            )}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </DndContext>
  )
}

/** A group's icon: an emoji, a kind's drawing, or the stack every group starts with, in its colour. */
export function GroupIcon({ icon, color, className = 'size-4' }: { icon: string | null; color: string | null; className?: string }): React.JSX.Element {
  const kind = icon?.startsWith('kind:') ? CAPTURE_TYPES.find((one) => one.id === icon.slice(5)) : undefined
  const tint = tintOf(color)
  if (kind) return <kind.icon className={className} style={{ color: tint ?? kind.tint }} />
  if (icon) return <span className="text-[0.95rem] leading-none">{icon}</span>
  return <Layers className={cn(className, !tint && 'text-muted-foreground')} style={{ color: tint }} />
}

/** Set a group's look, and say so with a way back. */
const change = (group: GroupView, patch: Parameters<typeof groups.set>[1], said: string): void => {
  const was = { name: group.name, icon: group.icon, color: group.color }
  void groups.set(group.id, patch).then(() => toast(said, () => void groups.set(group.id, was)))
}

function GroupBlock({ group, entries, start, row, carried, renaming, born, onRenaming, onFold, onNewNote }: {
  group: GroupView
  entries: Entry[]
  start: number
  row: (entry: Entry, at: number, inner?: CSSProperties, indent?: number) => React.JSX.Element
  carried: boolean
  renaming: boolean
  born: boolean
  onRenaming: (on: boolean) => void
  onFold: (open: boolean) => void
  onNewNote: (id: string) => void
}): React.JSX.Element {
  const [menu, setMenu] = useState(false)
  const [picking, setPicking] = useState(false)
  const [pointing, setPointing] = useState(false)
  const [parting, setParting] = useState(false)
  // Just made: its row unfolds above the two notes, a moment after it is drawn.
  const [arrived, setArrived] = useState(!born || still())
  useEffect(() => {
    if (arrived) return
    const frame = requestAnimationFrame(() => setArrived(true))
    return () => cancelAnimationFrame(frame)
  }, [arrived])
  const count = entries.length
  const tint = tintOf(group.color)
  const key = KEY + group.id
  const { aim, height, leaving, down } = useContext(Carrying)
  const joining = aim?.how === 'join' && aim.into === group.id
  const losing = leaving?.group === group.id ? entries.findIndex((entry) => entry.id === leaving.id) : -1
  // The panel follows what is about to happen: wider for one about to join, closing over one about to leave.
  const stretch = joining ? (down ? { top: -height } : { bottom: -height }) : losing >= 0 ? { bottom: height } : {}
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
      if (!was) return (setParting(false), refuse('That group is already gone'))
      toast(`Separated: ${count === 1 ? 'the note stays' : `all ${count} notes stay`}`, () => void groups.restore(was).then(() => chime('gather')))
    }, still() ? 0 : 140 + count * 40)
  }
  const rename = (name: string): void => {
    onRenaming(false)
    if (name.trim() && name.trim() !== group.name) change(group, { name: name.trim() }, `Renamed ${name.trim()}`)
  }
  const shown = (menu || picking || renaming || joining || losing >= 0 || pointing || !arrived || born) && !parting
  return (
    <div
      data-group-block={group.id}
      data-active={shown ? '' : undefined}
      className="group/fold relative isolate"
      style={{ '--group-tint': tint ?? 'var(--foreground)' } as CSSProperties}
    >
      {/* The panel: only while pointed at, or while something is about to happen to it. */}
      <div
        aria-hidden
        data-panel=""
        className={cn(
          'pointer-events-none absolute inset-0 -z-10 origin-top rounded-lg opacity-0 transition-[opacity,scale,top,bottom,background-color] duration-200 group-hover/fold:opacity-100 group-data-[active]/fold:opacity-100 motion-reduce:transition-none',
          carried && 'opacity-0!',
          parting && 'scale-[0.98] opacity-0!',
          !arrived && 'scale-[0.97]'
        )}
        style={{
          transitionTimingFunction: OUT,
          background: `color-mix(in srgb, var(--group-tint) ${(tint ? 9 : 4.5) * (pointing ? 1.7 : joining ? 1.4 : 1)}%, transparent)`,
          ...stretch
        }}
      />
      {/* The row: folded away until a group just made unfolds it, and as a separated one goes. */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none"
        style={{ transitionTimingFunction: OUT, gridTemplateRows: arrived && !parting ? '1fr' : '0fr', opacity: arrived && !parting ? 1 : 0, transitionDelay: parting ? `${count * 40}ms` : undefined }}
      >
        <div className={cn('min-h-0', (!arrived || parting) && 'overflow-hidden')}>
          <Node id={key}>
            <Popover open={picking} onOpenChange={setPicking}>
              <ContextMenu onOpenChange={setMenu}>
                <ContextMenuTrigger asChild>
                  {renaming ? (
                    <div className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 data-[state=open]:bg-transparent!">
                      <PopoverAnchor asChild><span className="flex w-9 shrink-0 justify-center"><GroupIcon icon={group.icon} color={group.color} /></span></PopoverAnchor>
                      <input
                        autoFocus
                        defaultValue={group.name}
                        aria-label="Group name"
                        onFocus={(event) => event.target.select()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') rename(event.currentTarget.value)
                          if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), onRenaming(false))
                        }}
                        onBlur={(event) => rename(event.target.value)}
                        className="min-w-0 flex-1 rounded-sm bg-transparent text-control font-semibold outline-none placeholder:text-muted-foreground"
                        placeholder="Name the group"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-group-row={group.id}
                      aria-expanded={group.open}
                      onClick={fold}
                      onDoubleClick={() => onRenaming(true)}
                      // ← folds and → unfolds, as a folder in a list does.
                      onKeyDown={(event) => {
                        if ((event.key === 'ArrowLeft' && group.open) || (event.key === 'ArrowRight' && !group.open)) (event.preventDefault(), fold())
                      }}
                      // The panel marks it while its menu is open: no second mark on the row.
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 pr-9 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-transparent!"
                    >
                      <PopoverAnchor asChild><span className="flex w-9 shrink-0 justify-center"><GroupIcon icon={group.icon} color={group.color} /></span></PopoverAnchor>
                      <span className="min-w-0 truncate text-control font-semibold">{group.name}</span>
                      <ChevronRight
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none"
                        style={{ transitionTimingFunction: OUT, transform: `rotate(${group.open ? 90 : 0}deg)` }}
                      />
                      {/* Folded, how many it holds, coming out of the chevron. */}
                      <AnimatePresence initial={false}>
                        {!group.open && (
                          <motion.span
                            key="count"
                            data-count=""
                            className="shrink-0 rounded-full px-1.5 text-xs leading-5 text-muted-foreground tabular-nums"
                            style={{ background: `color-mix(in srgb, var(--group-tint) ${tint ? 14 : 8}%, transparent)` }}
                            initial={{ opacity: 0, scale: 0.6, x: -6 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.6, x: -6, transition: { duration: 0.08 } }}
                            transition={still() ? { duration: 0 } : springs.moderate}
                          >
                            {count}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </button>
                  )}
                </ContextMenuTrigger>
                <GroupMenu group={group} members={entries.map((entry) => entry.id)} onSeparate={separate} onRename={() => onRenaming(true)} onIcon={() => setPicking(true)} onNewNote={onNewNote} />
              </ContextMenu>
              <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0">
                <IconChoice group={group} onPick={(icon) => (change(group, { icon }, 'Icon changed'), chime('tap'), setPicking(false))} />
              </PopoverContent>
            </Popover>
            {!renaming && (
              <Tip label={`Separate: keeps ${count === 1 ? 'the note' : `all ${count} notes`}`}>
                <button
                  type="button"
                  onClick={separate}
                  onMouseEnter={() => setPointing(true)}
                  onMouseLeave={() => setPointing(false)}
                  // Not a handle: pressing here never lifts the group.
                  onPointerDown={(event) => event.stopPropagation()}
                  className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 cursor-pointer! items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/fold:opacity-100 group-data-[active]/fold:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </Tip>
            )}
          </Node>
        </div>
      </div>
      <Fold open={group.open}>
        <div className="pb-1">
          {entries.map((entry, at) =>
            row(entry, start + at, {
              // Its notes sit in by a step; separating, they slide back out to the list's edge one after another.
              translate: parting ? `-${INDENT}px 0` : losing >= 0 && at > losing ? `0 -${height}px` : undefined,
              opacity: losing === at ? 0 : undefined,
              transitionDelay: parting ? `${at * 40}ms` : undefined
            }, INDENT)
          )}
        </div>
      </Fold>
    </div>
  )
}

/**
 * What a group holds, opening to its height and closing to nothing on the
 * grid-rows trick, its notes drawing up into the row as they go: under a
 * quarter of a second, easing out, and at once with Reduce motion. Shut, its
 * notes leave the page, so nothing hidden can be dropped on.
 */
function Fold({ open, children }: { open: boolean; children: ReactNode }): React.JSX.Element {
  const instant = still()
  const [kept, setKept] = useState(open)
  const [settled, setSettled] = useState(open)
  const was = useRef(open)
  if (was.current !== open) {
    was.current = open
    if (open && !kept) setKept(true)
    setSettled(instant)
    if (!open && instant) setKept(false)
  }
  return (
    <div
      inert={!open}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows') return
        setSettled(true)
        if (!open) setKept(false)
      }}
      className="grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none"
      style={{ transitionTimingFunction: OUT, gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
    >
      {/* Cut only while it moves: open and still, a row lifted past its edge shows whole. */}
      <div className={cn('min-h-0', !(open && settled) && 'overflow-hidden')}>
        <div className="transition-[translate] duration-200 motion-reduce:transition-none" style={{ transitionTimingFunction: OUT, translate: open ? '0 0' : '0 -8px' }}>
          {kept && children}
        </div>
      </div>
    </div>
  )
}

/** A right click on a group's row: Vigil's own menu, with its colours as a row of dots. */
function GroupMenu({ group, members, onSeparate, onRename, onIcon, onNewNote }: {
  group: GroupView
  members: string[]
  onSeparate: () => void
  onRename: () => void
  onIcon: () => void
  onNewNote: (id: string) => void
}): React.JSX.Element {
  const later = (run: () => void) => () => void setTimeout(run, 0)
  return (
    <ContextMenuContent className="w-56" onCloseAutoFocus={(event) => event.preventDefault()}>
      <ContextMenuItem onSelect={() => void groups.note(group.id).then((id) => id && (chime('promote'), onNewNote(id)))}>New note in group</ContextMenuItem>
      <ContextMenuItem onSelect={onSeparate}>Separate</ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void groups.duplicate(group.id).then((made) => made && (chime('copy'), toast('Duplicated, with a copy of each note', () => void groups.unclone(made.ids))))
        }
      >
        Duplicate group
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void groups.links(group.id).then((links) => (links.length ? copy(links.join('\n'), `Copied ${links.length === 1 ? 'one link' : `${links.length} links`}`) : refuse('No web links in this group')))
        }
      >
        Copy all links
      </ContextMenuItem>
      <ContextMenuSeparator />
      <div role="group" aria-label="Colour" className="flex items-center justify-between px-1 py-0.5">
        {GROUP_COLORS.map((color) => (
          <ContextMenuItem
            key={color}
            aria-label={color}
            data-color-dot={color}
            className="size-6 min-h-0 justify-center rounded-full p-0"
            // A colour is a glance: the menu stays open to see it land.
            onSelect={(event) => {
              event.preventDefault()
              chime('tap')
              const next = group.color === color ? null : color
              change(group, { color: next }, next ? `Coloured ${next}` : 'Colour taken off')
            }}
          >
            <span
              className={cn('size-3 rounded-full transition-transform duration-150', group.color === color && 'scale-125 shadow-[0_0_0_2px_var(--popover),0_0_0_3.5px_currentColor]')}
              style={{ background: `var(--tt-color-text-${color})`, color: `var(--tt-color-text-${color})` }}
            />
          </ContextMenuItem>
        ))}
      </div>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={later(onRename)}>Rename…</ContextMenuItem>
      <ContextMenuItem onSelect={later(onIcon)}>Change icon…</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => void archive('nuggets', members, true)}>Archive group</ContextMenuItem>
    </ContextMenuContent>
  )
}

/** The kinds' own drawings first, then any emoji. */
function IconChoice({ group, onPick }: { group: GroupView; onPick: (icon: string | null) => void }): React.JSX.Element {
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
      </div>
      <IconPicker icon={group.icon ?? ''} className="rounded-none! border-0! bg-transparent! shadow-none!" onPick={({ icon }) => icon && onPick(icon)} />
    </div>
  )
}
