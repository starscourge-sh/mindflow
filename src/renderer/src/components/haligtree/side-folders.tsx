import { useState } from 'react'

import { groups, useGroups, type NoteGroup } from '@/lib/groups'
import { chime } from '@/lib/sound'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Unfold, Weighted } from './glide'
import { GroupIcon, IconChoice } from './kept-groups'
import { Count, quietly } from './ui'

/**
 * A list's groups as folders under its sidebar row (Writing's or Gems'), the
 * way Apple Notes and Notion keep theirs: each with its icon, its name, how
 * many notes it holds (its subgroups' too) and its subgroups indented below.
 * A click opens the list on that group alone; a click on the icon changes it.
 */
export function SideFolders({ list, open, shown, here, onOpen }: {
  list: 'article' | 'nugget'
  /** Unfolded under the row. */
  open: boolean
  /** The list's notes, so a folder counts only what the list shows. */
  shown: Set<string>
  /** The group open now, if one is. */
  here?: string
  onOpen: (id: string) => void
}): React.JSX.Element | null {
  const all = useGroups(list)
  const kids = (parent: string | null): NoteGroup[] => all.filter((one) => one.parent === parent)
  const count = (group: NoteGroup): number => group.members.filter((id) => shown.has(id)).length + kids(group.id).reduce((sum, one) => sum + count(one), 0)
  const rows = (parent: string | null, depth: number): React.JSX.Element[] =>
    kids(parent).flatMap((group) => [<Folder key={group.id} group={group} depth={depth} n={count(group)} here={here === group.id} onOpen={onOpen} />, ...rows(group.id, depth + 1)])
  const top = rows(null, 0)
  if (!top.length) return null
  return (
    <Unfold open={open}>
      <div data-side-folders={list} className="flex flex-col gap-px">{top}</div>
    </Unfold>
  )
}

function Folder({ group, depth, n, here, onOpen }: { group: NoteGroup; depth: number; n: number; here: boolean; onOpen: (id: string) => void }): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const pick = (icon: string | null): void => {
    const was = group.icon
    chime('tap')
    setPicking(false)
    void groups.set(group.id, { icon }).then(() => quietly(() => void groups.set(group.id, { icon: was })))
  }
  return (
    <Popover open={picking} onOpenChange={setPicking}>
      <PopoverAnchor asChild>
        <div className="relative flex items-center">
          <button
            type="button"
            data-side-row
            data-side-folder={group.id}
            aria-current={here ? 'page' : undefined}
            onClick={() => onOpen(group.id)}
            // Under the row's own icon, a step in for each level.
            style={{ paddingLeft: `${1.75 + depth * 0.875}rem` }}
            className={`flex w-full min-w-0 items-center gap-2 rounded-md py-1 pr-2 ${here ? 'text-foreground' : 'text-foreground/80'}`}
          >
            {/* Room for the icon, which is its own button over this one. */}
            <span className="size-4 shrink-0" />
            <Weighted on={here} className="flex-1 text-left">{group.name}</Weighted>
            <Count n={n} className="text-xs text-muted-foreground" />
          </button>
          <button type="button" aria-label={`Change the icon of ${group.name}`} data-folder-icon={group.id} onClick={() => setPicking(true)}
            style={{ left: `${1.75 + depth * 0.875 - 0.125}rem` }}
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
