import { useEffect, useState } from 'react'
import { Branches } from './branches'
import { createPortal } from 'react-dom'

import { haligtree, useLive } from '@/lib/haligtree'
import { DEPTH, KEY, layoutOf, moveTo } from '@/lib/group-layout'
import { notes } from '@/lib/notes'
import { groups, useGroups, type NoteGroup } from '@/lib/groups'
import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Unfold, Weighted } from './glide'
import { GroupIcon, IconChoice } from './kept-groups'
import { RowMenu, type RowItem } from './row-menu'
import { Count, quietly, refuse, toast } from './ui'

/** Asks the sidebar for a new, empty folder in a list (from the row's +, or its right click), named as it is made. */
export const newFolder = (list: 'article' | 'nugget', parent: string | null = null): void =>
  void window.dispatchEvent(new CustomEvent('haligtree:folder-new', { detail: { list, parent } }))

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
export function SideFolders({ list, counted, open, shown, here, onOpen, onUnfold }: {
  list: 'article' | 'nugget'
  /** Each folder's count shown, as the sidebar's own counts are (Customize sidebar). */
  counted: boolean
  /** Unfolded under the row. */
  open: boolean
  /** The list's notes, so a folder counts only what the list shows. */
  shown: Set<string>
  /** The group open now, if one is. */
  here?: string
  onOpen: (id: string) => void
  onUnfold: () => void
}): React.JSX.Element | null {
  const all = useGroups(list)
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
  const order = useLive(() => notes.order(list), [] as string[], [list], undefined, `order:${list}`)
  const ranked = new Set(order)
  const layout = layoutOf([...order, ...all.flatMap((one) => one.members.filter((id) => !ranked.has(id)))], all)
  const kids = (parent: string | null): NoteGroup[] => {
    const at = parent ? layout.groups[parent] ?? [] : layout.top
    return all.filter((one) => (one.parent && all.some((other) => other.id === one.parent) ? one.parent : null) === parent).sort((a, b) => at.indexOf(KEY + a.id) - at.indexOf(KEY + b.id))
  }
  // A folder being carried, and where it would land: inside one, or by one's top or bottom edge.
  const [carried, setCarried] = useState<{ id: string; x: number; y: number } | null>(null)
  const [aim, setAim] = useState<Aim | null>(null)
  useEffect(() => {
    if (!carried) return
    const follow = (event: DragEvent): void => setCarried((was) => was && { ...was, x: event.clientX, y: event.clientY })
    document.addEventListener('dragover', follow)
    return () => document.removeEventListener('dragover', follow)
  }, [!!carried]) // eslint-disable-line react-hooks/exhaustive-deps
  const count = (group: NoteGroup): number => group.members.filter((id) => shown.has(id)).length + kids(group.id).reduce((sum, one) => sum + count(one), 0)
  const levelOf = (id: string | null): number => (id ? 1 + levelOf(all.find((one) => one.id === id)?.parent ?? null) : 0)
  const heightOf = (id: string): number => 1 + Math.max(0, ...kids(id).map((one) => heightOf(one.id)))
  const inside = (id: string, of: string): boolean => id === of || kids(of).some((one) => inside(id, one.id))
  // A folder carried onto another: inside it, if that stays three levels deep and is not itself inside the carried one.
  const nest = (id: string, parent: string | null): void => {
    const group = all.find((one) => one.id === id)
    if (!group || group.parent === parent) return
    if (parent && inside(parent, id)) return refuse('A folder can’t go inside itself')
    if (levelOf(parent) + heightOf(id) > DEPTH) return refuse(`Folders go ${DEPTH} levels deep`)
    const was = group.parent
    chime('gather')
    void groups.nest(id, parent).then(() => toast(parent ? `Moved ${group.name} into ${all.find((one) => one.id === parent)?.name}` : `Moved ${group.name} to the top`, () => void groups.nest(id, was)))
  }
  // Dropped by a folder's edge: just before or after it, beside it in what holds it.
  const reorder = (id: string, target: string, how: 'before' | 'after'): void => {
    const group = all.find((one) => one.id === id)
    const by = all.find((one) => one.id === target)
    if (!group || !by || id === target) return
    const parent = by.parent && all.some((one) => one.id === by.parent) ? by.parent : null
    if (parent && inside(parent, id)) return refuse('A folder can’t go inside itself')
    if (levelOf(parent) + heightOf(id) > DEPTH) return refuse(`Folders go ${DEPTH} levels deep`)
    const beside = (parent ? layout.groups[parent] ?? [] : layout.top).filter((key) => key !== KEY + id)
    const after = how === 'after' ? KEY + target : beside[beside.indexOf(KEY + target) - 1] ?? null
    const next = moveTo(layout, KEY + id, { group: parent, after })
    const was = layout
    chime('gather')
    void groups.arrange(list, next).then(() => toast(`Moved ${group.name} ${how} ${by.name}`, () => void groups.arrange(list, was)))
  }
  const drag: Drag = {
    carried: carried?.id ?? null,
    aim,
    lift: (id, x, y) => setCarried({ id, x, y }),
    over: setAim,
    drop: (target, how) => {
      const id = carried?.id
      setAim(null)
      setCarried(null)
      if (!id || id === target) return
      if (how === 'into') nest(id, target)
      else reorder(id, target, how)
    },
    end: () => (setAim(null), setCarried(null))
  }
  const lifted = carried && all.find((one) => one.id === carried.id)
  // Each level hung off a thin trunk from the row above it, a curved branch to each folder, as Pinned and
  // Tags are; the way down to the folder you are in lit. Each level steps in under its parent's icon.
  // The folder you are in, or one it sits inside: the lit way down runs through each.
  const holds = (id: string): boolean => id === here || kids(id).some((one) => holds(one.id))
  const rows = (parent: string | null, depth: number): React.JSX.Element | null => {
    const these = kids(parent)
    if (!these.length) return null
    return (
      <Branches current={these.findIndex((one) => holds(one.id))} className="ml-5 flex flex-col gap-px">
        {these.flatMap((group) => {
          const inner = rows(group.id, depth + 1)
          return [
            <Folder key={group.id} list={list} group={group} depth={depth} n={counted ? count(group) : null} here={here === group.id} naming={naming === group.id} onNamed={() => setNaming(null)} onRename={() => setNaming(group.id)} onOpen={onOpen} onNest={nest} drag={drag} />,
            inner && <div key={`${group.id}:in`} data-no-twig="">{inner}</div>
          ]
        })}
      </Branches>
    )
  }
  const top = rows(null, 0)
  if (!top) return null
  return (
    <Unfold open={open}>
      <div data-side-folders={list}>{top}</div>
      {/* The folder carried, as a row is carried in the list: lifted under the pointer, in the app's own look. */}
      {lifted && carried.x > 0 && createPortal(
        <div aria-hidden data-folder-ghost={lifted.id} className="pointer-events-none fixed z-[80] flex items-center gap-2 rounded-md bg-background px-2.5 py-1 text-control shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)] ring-1 ring-foreground/10" style={{ left: carried.x + 10, top: carried.y - 14 }}>
          <GroupIcon icon={lifted.icon} color={lifted.color} className="size-3.5" />
          <span className="max-w-48 truncate">{lifted.name}</span>
        </div>,
        document.body
      )}
    </Unfold>
  )
}

type Aim = { target: string; how: 'into' | 'before' | 'after' }
type Drag = { carried: string | null; aim: Aim | null; lift: (id: string, x: number, y: number) => void; over: (aim: Aim | null) => void; drop: (target: string, how: Aim['how']) => void; end: () => void }
/** Handed to the browser as a carried folder's picture: nothing, so only the app's own lifted row shows. */
const BLANK = typeof Image === 'undefined' ? null : Object.assign(new Image(), { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' })

const HOT = 'bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] text-foreground ring-1 ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)]'

function Folder({ list, group, depth, n, here, naming, onNamed, onRename, onOpen, onNest, drag }: {
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
  drag: Drag
}): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const aimed = drag.aim?.target === group.id && drag.carried !== group.id ? drag.aim.how : null
  const over = aimed === 'into'
  // Its top or bottom third: before or after it; the middle: inside.
  const aimAt = (event: React.DragEvent<HTMLElement>): void => {
    if (!event.dataTransfer.types.includes('haligtree/folder')) return
    event.preventDefault()
    const box = event.currentTarget.getBoundingClientRect()
    const at = (event.clientY - box.top) / box.height
    const how = at < 0.3 ? 'before' : at > 0.7 ? 'after' : 'into'
    if (drag.aim?.target !== group.id || drag.aim.how !== how) drag.over({ target: group.id, how })
  }
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
    void groups.set(group.id, { name: words }).then(() => offerTag(list, group.id, words))
  }
  // The level's own step in is its trunk's (rows above); within it, the rows' own edge.
  const left = '0.5rem'
  const menu: RowItem[] = [
    { label: 'Open', run: () => onOpen(group.id) },
    { label: 'Rename…', run: () => setTimeout(onRename, 120) },
    { label: 'Change icon…', run: () => setTimeout(() => setPicking(true), 120) },
    depth < DEPTH - 1 && { label: 'New folder inside', run: () => newFolder(list, group.id) },
    group.parent ? { label: 'Move to the top', run: () => onNest(group.id, null) } : null,
    'separator',
    { label: 'Delete folder', hint: 'Its notes stay, where they are', run: () => {
      const { id, name: was, icon, color, parent, members } = group
      chime('separate')
      void groups.remove(id).then(() => toast(`Deleted ${was}: its notes stay`, () => void (async () => {
        const back = await groups.make(list, was, parent)
        await groups.set(back, { icon, color })
        await groups.place(members.map((one, at) => ({ id: one, group: back, order: at })))
      })()))
    } }
  ]
  return (
    <Popover open={picking} onOpenChange={setPicking}>
      <PopoverAnchor asChild>
        <div className="relative flex items-center"
          // Carried by its row onto another folder, it goes inside that one; by its top or bottom edge, before or after it.
          draggable={!naming}
          data-carried-folder={drag.carried === group.id ? '' : undefined}
          onDragStart={(event) => {
            event.dataTransfer.setData('haligtree/folder', group.id)
            event.dataTransfer.effectAllowed = 'move'
            if (BLANK) event.dataTransfer.setDragImage(BLANK, 0, 0)
            drag.lift(group.id, event.clientX, event.clientY)
          }}
          onDragEnd={drag.end}
          onDragEnter={aimAt}
          onDragOver={aimAt}
          // Only once the pointer is off the row: passing between its own parts is no leaving.
          onDragLeave={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            const off = event.clientY < box.top || event.clientY >= box.bottom || event.clientX < box.left || event.clientX >= box.right
            if (off && drag.aim?.target === group.id) drag.over(null)
          }}
          onDrop={(event) => (event.preventDefault(), drag.carried ? drag.drop(group.id, aimed ?? 'into') : onNest(event.dataTransfer.getData('haligtree/folder'), group.id))}>
          {(aimed === 'before' || aimed === 'after') && (
            // Where it lands, as the list draws it: a line with a ring at its start, at the folder's own indent.
            <span aria-hidden data-drop-line={aimed}
              className="pointer-events-none absolute right-1 z-10 h-0.5 -translate-y-1/2 rounded-full bg-(--tt-brand-color-400) before:absolute before:-top-[3px] before:-left-2 before:size-2 before:rounded-full before:border-2 before:border-(--tt-brand-color-400) before:bg-background"
              style={{ left: `calc(${left} + 0.5rem)`, top: aimed === 'before' ? -1 : 'calc(100% + 1px)' }} />
          )}
          {naming ? (
            <input autoFocus defaultValue={group.name} data-folder-name={group.id} aria-label="Folder name"
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') name(event.currentTarget.value)
                if (event.key === 'Escape') (event.stopPropagation(), onNamed())
              }}
              onBlur={(event) => name(event.target.value)}
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
                aria-current={here ? 'page' : undefined}
                onClick={() => onOpen(group.id)}
                // Under the row's own icon, a step in for each level.
                style={{ paddingLeft: left }}
                className={`flex w-full min-w-0 items-center gap-2 rounded-md py-1 pr-2 ${here ? 'text-foreground' : 'text-foreground/80'} ${over ? HOT : ''} ${drag.carried === group.id ? 'opacity-40' : ''} data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:text-foreground data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)] data-[folder-no]:cursor-not-allowed data-[folder-no]:opacity-50`}
              >
                {/* Room for the icon, which is its own button over this one. */}
                <span className="size-4 shrink-0" />
                <Weighted on={here} className="flex-1 text-left">{group.name}</Weighted>
                {n !== null && <Count n={n} className="text-xs text-muted-foreground" />}
              </button>
            </RowMenu>
          )}
          <button type="button" aria-label={`Change the icon of ${group.name}`} data-folder-icon={group.id} onClick={() => setPicking(true)}
            style={{ left: `calc(${left} - 0.125rem)` }}
            className="absolute flex size-5 items-center justify-center rounded transition-colors hover:bg-accent">
            <GroupIcon icon={group.icon} color={group.color} className="size-3.5" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0" onFocusOutside={(event) => event.preventDefault()}>
        <IconChoice group={group} onPick={pick} />
      </PopoverContent>
    </Popover>
  )
}
