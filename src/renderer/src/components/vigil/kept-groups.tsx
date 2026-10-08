import { createContext, useContext, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DndContext, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type Modifier } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, type SortingStrategy } from '@dnd-kit/sortable'
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
import { GROUP_COLORS, groups, tintOf } from '@/lib/groups'
import { KEY, isGroup } from '@/lib/group-layout'
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
 * Rows drag as in any list in your own order. Let go over the middle of a
 * row, and the two are gathered into a group (or the row joins that row's
 * group); let go between rows, and it only moves. A group's own row carries
 * the whole group.
 */

export type GroupView = { id: string; name: string; icon: string | null; color: string | null; open: boolean; members: string[] }
/** A line of the list: one note at the top level, or a group and the notes it shows. */
export type Bundle = { group?: GroupView; entries: Entry[] }

export type Folds = {
  bundles: Bundle[]
  /** A drop, for the list to work out and save: `join` when let go over the middle of `over`. */
  onDrop: (active: string, over: string, join: boolean) => void
  onFold: (group: GroupView, open: boolean) => void
  /** A note just made in a group, to open. */
  onNewNote: (id: string) => void
  /** The group whose name is being written, as one just made is. */
  renaming: string | null
  onRenaming: (id: string | null) => void
}

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
/** Up and down only. */
const upDown: Modifier = ({ transform }) => ({ ...transform, x: 0 })
/** Over a row, that row; in the hair between two, the nearest. */
const collide: CollisionDetection = (args) => {
  const hit = pointerWithin(args)
  return hit.length ? hit : closestCenter(args)
}

/** Which row a carried one would gather with if let go now. */
const Joining = createContext<string | null>(null)

/** The look for a row something would be gathered with: lit in the brand's colour, as picked rows are. */
const JOIN = 'rounded-md bg-[color-mix(in_srgb,var(--tt-brand-color-400)_12%,transparent)] shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--tt-brand-color-400)_55%,transparent)]'

function Node({ id, children, className }: { id: string; children: ReactNode; className?: string }): React.JSX.Element {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
    transition: still() ? null : { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' }
  })
  const join = useContext(Joining) === id
  return (
    <div
      ref={setNodeRef}
      data-sortable-id={id}
      data-join={join ? '' : undefined}
      {...attributes}
      {...listeners}
      tabIndex={-1}
      role={undefined}
      className={cn('relative transition-[background-color,box-shadow] duration-150', join && JOIN, className)}
      style={{ transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined, transition, opacity: isDragging ? 0.3 : undefined }}
    >
      {children}
    </div>
  )
}

/**
 * The list itself, in place of the plain one while it is in your own order.
 * `face` draws a note's row as every list does; `index` counts rows on show,
 * which is what the keyboard's cursor counts.
 */
export function GroupedList({ bundles, onDrop, onFold, onNewNote, renaming, onRenaming, face, after, arrived, cursor, estimate, className }: Folds & {
  face: (entry: Entry, index: number) => React.JSX.Element
  after?: (entry: Entry) => ReactNode
  arrived: (id: string) => boolean
  cursor: number
  estimate: number
  className?: string
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const keys = bundles.flatMap((one) => (one.group ? [KEY + one.group.id, ...(one.group.open ? one.entries.map((entry) => entry.id) : [])] : one.entries.map((entry) => entry.id)))
  // The group each row on show is in, for what a drop would mean.
  const home = useMemo(() => new Map(bundles.flatMap((one) => (one.group ? one.entries.map((entry) => [entry.id, one.group!.id] as const) : []))), [bundles])
  const [carried, setCarried] = useState<string | null>(null)
  const [join, setJoin] = useState<string | null>(null)
  const joining = useRef<string | null>(null)
  const [shot, setShot] = useState<{ id: string; html: string; width: number; height: number } | null>(null)
  const ticks = useRef(slotTicker()).current
  // While a row is held over the middle of another, nothing makes room: the
  // row under it stays put, lit, to be gathered with. A group carried by its
  // row leaves its own notes where they are, faded.
  const mine = carried && isGroup(carried) ? new Set(bundles.find((one) => one.group && KEY + one.group.id === carried)?.entries.map((entry) => entry.id)) : null
  const strategy: SortingStrategy = useMemo(
    () => (args) => (join || (mine && mine.has(keys[args.index])) ? null : verticalListSortingStrategy(args)),
    [join, carried, keys.join('\n')] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const aim = (next: string | null): void => {
    if (next === joining.current) return
    joining.current = next
    setJoin(next)
  }
  const onDragStart = ({ active }: DragStartEvent): void => {
    const id = String(active.id)
    chime('lift')
    ticks.start(id)
    setCarried(id)
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
    const shut = target && !isGroup(id) ? bundles.find((one) => one.group && !one.group.open && KEY + one.group.id === target)?.group : undefined
    if (!shut) unspring()
    else if (spring.current?.key !== target) {
      unspring()
      spring.current = { key: target!, timer: setTimeout(() => (click('tick'), onFold(shut, true), (spring.current = null)), 600) }
    }
    if (!target || target === id || isGroup(id) || !(activatorEvent instanceof PointerEvent)) return aim(null)
    // Its own group, or a row of it, is no new home.
    const own = home.get(id)
    if (own && (target === KEY + own || home.get(target) === own)) return aim(null)
    const y = activatorEvent.clientY + delta.y
    const at = (y - over.rect.top) / over.rect.height
    aim(at > 0.25 && at < 0.75 ? target : null)
  }
  const end = (): void => {
    unspring()
    setShot(null)
    setCarried(null)
    aim(null)
  }
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    const gathered = joining.current
    end()
    if (!over || over.id === active.id) return chime('stay')
    onDrop(String(active.id), String(over.id), gathered === String(over.id))
  }
  let index = 0
  const lines = bundles.map((one) => {
    const start = index
    if (!one.group || one.group.open) index += one.entries.length
    return { one, start }
  })
  const line = lines.findIndex(({ one, start }) => cursor >= start && cursor < start + ((!one.group || one.group.open) ? one.entries.length : 0))
  const row = (entry: Entry, at: number): React.JSX.Element => (
    <Node key={entry.id} id={entry.id}>
      <div className={`group/item relative ${arrived(entry.id) ? 'mf-arrive' : ''}`}>
        {face(entry, at)}
        {after?.(entry)}
      </div>
    </Node>
  )
  return (
    <DndContext sensors={sensors} collisionDetection={collide} modifiers={[upDown]} onDragStart={onDragStart} onDragMove={onDragMove}
      onDragOver={({ over }) => ticks(over?.id)} onDragEnd={onDragEnd} onDragCancel={end}>
      <SortableContext items={keys} strategy={strategy}>
        <Joining.Provider value={join}>
          <VirtualList items={lines} keyOf={({ one }) => (one.group ? KEY + one.group.id : one.entries[0].id)} cursor={line >= 0 ? line : undefined} estimate={estimate} className={className}>
            {({ one, start }) =>
              one.group ? (
                <GroupBlock group={one.group} count={one.entries.length} carried={carried === KEY + one.group.id} renaming={renaming === one.group.id}
                  onRenaming={(on) => onRenaming(on ? one.group!.id : null)} onFold={(open) => onFold(one.group!, open)} onNewNote={onNewNote}
                  members={one.entries.map((entry) => entry.id)}>
                  {one.entries.map((entry, at) => row(entry, start + at))}
                </GroupBlock>
              ) : (
                row(one.entries[0], start)
              )
            }
          </VirtualList>
        </Joining.Provider>
      </SortableContext>
      <Overlay dropAnimation={still() ? null : SETTLE}>
        {/* Over the middle of a row, the lifted one draws in a little, so the row it would gather with shows lit around it. */}
        <div className="transition-[scale] duration-150 ease-out motion-reduce:transition-none" style={{ scale: join ? 0.92 : 1 }}>
          <Lifted shot={shot} />
        </div>
      </Overlay>
    </DndContext>
  )
}

/** A group's icon: an emoji, a kind's drawing, or the stack every group starts with, in its colour. */
function GroupIcon({ icon, color, className = 'size-4' }: { icon: string | null; color: string | null; className?: string }): React.JSX.Element {
  const kind = icon?.startsWith('kind:') ? CAPTURE_TYPES.find((one) => one.id === icon.slice(5)) : undefined
  const tint = tintOf(color)
  if (kind) return <kind.icon className={className} style={{ color: tint ?? kind.tint }} />
  if (icon) return <span className="text-[0.95rem] leading-none">{icon}</span>
  return <Layers className={cn(className, !tint && 'text-muted-foreground')} style={{ color: tint }} />
}

function GroupBlock({ group, count, members, carried, renaming, onRenaming, onFold, onNewNote, children }: {
  group: GroupView
  count: number
  members: string[]
  carried: boolean
  renaming: boolean
  onRenaming: (on: boolean) => void
  onFold: (open: boolean) => void
  onNewNote: (id: string) => void
  children: ReactNode
}): React.JSX.Element {
  const [menu, setMenu] = useState(false)
  const [picking, setPicking] = useState(false)
  const tint = tintOf(group.color)
  const key = KEY + group.id
  const joined = useContext(Joining) === key
  const fold = (): void => {
    chime(group.open ? 'tuck' : 'untuck')
    onFold(!group.open)
  }
  const separate = async (): Promise<void> => {
    const was = await groups.separate(group.id)
    if (!was) return refuse('That group is already gone')
    chime('separate')
    toast(`Separated: the ${count === 1 ? 'note stays' : `${count} notes stay`} where ${count === 1 ? 'it was' : 'they were'}`, () => void groups.restore(was).then(() => chime('gather')))
  }
  const set = (patch: Parameters<typeof groups.set>[1]): void => void groups.set(group.id, patch)
  const rename = (name: string): void => {
    onRenaming(false)
    if (name.trim() && name.trim() !== group.name) set({ name: name.trim() })
  }
  return (
    <div
      data-group-block={group.id}
      data-active={menu || picking || renaming || joined ? '' : undefined}
      className="group/fold relative isolate"
      style={{ '--group-tint': tint ?? 'var(--foreground)' } as CSSProperties}
    >
      {/* The panel: only while pointed at (or its menu, its name or its icon is being changed). */}
      <div aria-hidden className={cn(
        'pointer-events-none absolute inset-0 -z-10 rounded-lg opacity-0 transition-opacity duration-150 ease-out group-hover/fold:opacity-100 group-data-[active]/fold:opacity-100',
        carried && 'opacity-0! transition-none',
        tint ? 'bg-[color-mix(in_srgb,var(--group-tint)_9%,transparent)]' : 'bg-[color-mix(in_srgb,var(--group-tint)_4.5%,transparent)]'
      )} />
      <Node id={key}>
        <Popover open={picking} onOpenChange={setPicking}>
          <ContextMenu onOpenChange={setMenu}>
            <ContextMenuTrigger asChild>
              {renaming ? (
                <div className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5">
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
                    className="min-w-0 flex-1 bg-transparent text-control font-semibold outline-none placeholder:text-muted-foreground"
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
                  // The panel marks it while its menu is open: no second mark on the row.
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 pr-9 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-transparent!"
                >
                  <PopoverAnchor asChild><span className="flex w-9 shrink-0 justify-center"><GroupIcon icon={group.icon} color={group.color} /></span></PopoverAnchor>
                  <span className="min-w-0 truncate text-control font-semibold">{group.name}</span>
                  <ChevronRight
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
                    style={{ transform: `rotate(${group.open ? 90 : 0}deg)` }}
                  />
                  {!group.open && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>}
                </button>
              )}
            </ContextMenuTrigger>
            <GroupMenu group={group} members={members} onSeparate={() => void separate()} onRename={() => onRenaming(true)} onIcon={() => setPicking(true)}
              onColor={(color) => set({ color })} onNewNote={onNewNote} />
          </ContextMenu>
          <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0">
            <IconChoice group={group} onPick={(icon) => (set({ icon }), chime('tap'), setPicking(false))} />
          </PopoverContent>
        </Popover>
        {!renaming && (
          <Tip label="Separate">
            <button
              type="button"
              onClick={() => void separate()}
              // Not a handle: pressing here never lifts the group.
              onPointerDown={(event) => event.stopPropagation()}
              className="absolute top-1/2 right-1.5 flex size-6 cursor-pointer! -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/fold:opacity-100 group-data-[active]/fold:opacity-100 hover:bg-[color-mix(in_srgb,var(--group-tint)_12%,transparent)] hover:text-foreground focus-visible:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </Tip>
        )}
      </Node>
      <Fold open={group.open}>
        <div className="pb-1 pl-4">{children}</div>
      </Fold>
    </div>
  )
}

/**
 * What a group holds, opening to its height and closing to nothing on the
 * grid-rows trick: under a quarter of a second, easing out, and at once with
 * Reduce motion. Shut, its notes leave the page, so nothing hidden can be
 * dropped on.
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
      className="grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
    >
      {/* Cut only while it moves: open and still, a row lifted past its edge shows whole. */}
      <div className={cn('min-h-0', !(open && settled) && 'overflow-hidden')}>{kept && children}</div>
    </div>
  )
}

/** A right click on a group's row: Vigil's own menu, with its colours as a row of dots. */
function GroupMenu({ group, members, onSeparate, onRename, onIcon, onColor, onNewNote }: {
  group: GroupView
  members: string[]
  onSeparate: () => void
  onRename: () => void
  onIcon: () => void
  onColor: (color: string | null) => void
  onNewNote: (id: string) => void
}): React.JSX.Element {
  const later = (run: () => void) => () => void setTimeout(run, 0)
  return (
    <ContextMenuContent className="w-56" onCloseAutoFocus={(event) => event.preventDefault()}>
      <ContextMenuItem onSelect={() => void groups.note(group.id).then((id) => id && (chime('promote'), onNewNote(id)))}>New note in group</ContextMenuItem>
      <ContextMenuItem onSelect={onSeparate}>Separate</ContextMenuItem>
      <ContextMenuItem onSelect={() => void groups.duplicate(group.id).then((id) => id && (chime('copy'), toast(`Duplicated, with a copy of each note`)))}>Duplicate group</ContextMenuItem>
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
              onColor(group.color === color ? null : color)
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
