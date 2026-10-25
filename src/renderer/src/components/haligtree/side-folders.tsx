import { useEffect, useState } from 'react'

import { haligtree } from '@/lib/haligtree'
import { DEPTH } from '@/lib/group-layout'
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
 * A folder dragged onto another goes inside it (three levels at most), and
 * onto the list's own row back to the top level.
 */
export function SideFolders({ list, open, shown, here, onOpen, onUnfold }: {
  list: 'article' | 'nugget'
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
  const kids = (parent: string | null): NoteGroup[] => all.filter((one) => (one.parent && all.some((other) => other.id === one.parent) ? one.parent : null) === parent)
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
  const rows = (parent: string | null, depth: number): React.JSX.Element[] =>
    kids(parent).flatMap((group) => [
      <Folder key={group.id} list={list} group={group} depth={depth} n={count(group)} here={here === group.id} naming={naming === group.id} onNamed={() => setNaming(null)} onRename={() => setNaming(group.id)} onOpen={onOpen} onNest={nest} />,
      ...rows(group.id, depth + 1)
    ])
  const top = rows(null, 0)
  if (!top.length) return null
  return (
    <Unfold open={open}>
      <div data-side-folders={list} className="flex flex-col gap-px">{top}</div>
    </Unfold>
  )
}

const HOT = 'bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] text-foreground ring-1 ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)]'

function Folder({ list, group, depth, n, here, naming, onNamed, onRename, onOpen, onNest }: {
  list: 'article' | 'nugget'
  group: NoteGroup
  depth: number
  n: number
  here: boolean
  naming: boolean
  onNamed: () => void
  onRename: () => void
  onOpen: (id: string) => void
  onNest: (id: string, parent: string | null) => void
}): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const [over, setOver] = useState(false)
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
  const left = `${1.75 + depth * 0.875}rem`
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
          // Carried by its row onto another folder, it goes inside that one.
          draggable={!naming}
          onDragStart={(event) => (event.dataTransfer.setData('haligtree/folder', group.id), (event.dataTransfer.effectAllowed = 'move'))}
          onDragOver={(event) => event.dataTransfer.types.includes('haligtree/folder') && (event.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => (setOver(false), onNest(event.dataTransfer.getData('haligtree/folder'), group.id))}>
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
                className={`flex w-full min-w-0 items-center gap-2 rounded-md py-1 pr-2 ${here ? 'text-foreground' : 'text-foreground/80'} ${over ? HOT : ''} data-[queue-hot]:bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] data-[queue-hot]:text-foreground data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--tt-color-text-blue)_45%,transparent)] data-[folder-no]:cursor-not-allowed data-[folder-no]:opacity-50`}
              >
                {/* Room for the icon, which is its own button over this one. */}
                <span className="size-4 shrink-0" />
                <Weighted on={here} className="flex-1 text-left">{group.name}</Weighted>
                <Count n={n} className="text-xs text-muted-foreground" />
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
