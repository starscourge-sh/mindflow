import { useState, useSyncExternalStore, type ComponentType, type CSSProperties } from 'react'
import { Pin } from 'lucide-react'

import { chime } from '@/lib/sound'
import type { Step } from '@/lib/nav'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import XIcon from '@/components/ui/x-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import { RowMenu, type RowItem } from './row-menu'
import { quietly } from './ui'

/**
 * Split pairs, Dia's way: the panes open side by side read as ONE row in the
 * sidebar's Pinned section, their names joined ("Memory × | Reading ×"), and
 * pointed at, a small card lists each. A layout you pin stays there after the
 * split is closed, and a click lays it out again.
 */

export type PinnedLayout = { id: string; views: Step[]; sizes: number[] }
const KEY = 'split-pins'
let pinned: PinnedLayout[] = read()
const told = new Set<() => void>()
function read(): PinnedLayout[] {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? '[]') as PinnedLayout[]
    return Array.isArray(kept) ? kept.filter((one) => Array.isArray(one?.views) && one.views.length > 1 && one.views.every((view) => typeof view?.id === 'string')) : []
  } catch {
    return []
  }
}
const save = (next: PinnedLayout[]): void => {
  pinned = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Kept for this run only.
  }
  told.forEach((tell) => tell())
}
const follow = (tell: () => void): (() => void) => (told.add(tell), () => void told.delete(tell))
export const usePinnedLayouts = (): PinnedLayout[] => useSyncExternalStore(follow, () => pinned)

/** The same panes, in the same order, each on the same page and note. */
export const sameLayout = (a: Step[], b: Step[]): boolean => a.length === b.length && a.every((one, at) => one.id === b[at].id && (one.focus ?? null) === (b[at].focus ?? null))
const bare = (views: Step[]): Step[] => views.map(({ id, focus, tab }) => ({ id, focus, tab }))
export const pinLayout = (views: Step[], sizes: number[]): void => {
  chime('pin')
  save([...pinned, { id: `l${Date.now().toString(36)}`, views: bare(views), sizes }])
}
export const unpinLayout = (id: string): void => {
  const was = pinned
  chime('unpin')
  save(pinned.filter((one) => one.id !== id))
  quietly(() => save(was))
}

/** One pane's name in a pair: its note (kind icon and title), or the page it is on. */
export type PaneName = { title: string; icon: ComponentType<{ className?: string; style?: CSSProperties }>; tint?: string; private?: boolean }

/**
 * The pair's row, Dia's way: each pane's name on its own line with its own ×,
 * the pair's name (once renamed) over them, the whole tinted while it is the
 * split on screen. A right click has the pair's menu, "Rename" and "Close"
 * first when they are offered. Folded to icons, the panes' kinds stacked.
 */
export function PairRow({ names, live, isPinned, narrow, menu, onOpen, onClose, name, onRename, onForget }: {
  names: PaneName[]
  live: boolean
  isPinned: boolean
  narrow: boolean
  menu: RowItem[]
  onOpen: (index: number) => void
  onClose?: (index: number) => void
  /** The pair's own name, given with "Rename". */
  name?: string
  onRename?: (name: string) => void
  /** "Close": the pair goes from the sidebar. */
  onForget?: () => void
}): React.JSX.Element {
  const [renaming, setRenaming] = useState(false)
  const items: RowItem[] = [
    onRename && { label: 'Rename', run: () => void setTimeout(() => setRenaming(true), 120) },
    onForget && { label: 'Close', run: onForget },
    (onRename || onForget) && 'separator',
    ...menu
  ]
  const said = name || names.map((one) => one.title).join(' and ')
  if (narrow) {
    return (
      <RowMenu items={items}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" data-side-row data-pair-row={live ? 'live' : isPinned ? 'pinned' : 'kept'} aria-label={said} onClick={() => onOpen(0)}
              className={`flex items-center justify-center rounded-md py-1.5 ${live ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_9%,transparent)]' : ''}`}>
              {names.slice(0, 2).map((one, index) => (
                <span key={index} className={`flex size-4.5 items-center justify-center rounded-full bg-background shadow-[0_0_0_1.5px_var(--background)] ${index ? '-ml-1.5' : ''}`} style={{ zIndex: 3 - index }}>
                  <one.icon className="size-3" style={{ color: one.tint }} />
                </span>
              ))}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-64">{said}</TooltipContent>
        </Tooltip>
      </RowMenu>
    )
  }
  return (
    <RowMenu items={items}>
      <div
        data-pair-row={live ? 'live' : isPinned ? 'pinned' : 'kept'}
        data-pinned={isPinned ? '' : undefined}
        aria-label={said}
        className={`flex min-w-0 flex-col rounded-md py-0.5 ${live ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_9%,transparent)]' : 'ring-1 ring-inset ring-foreground/8'}`}
      >
        {renaming ? (
          <input
            autoFocus
            data-pair-rename
            defaultValue={name ?? ''}
            placeholder={names.map((one) => one.title).join(' and ')}
            onBlur={(event) => (setRenaming(false), onRename?.(event.currentTarget.value.trim()))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), (event.currentTarget.value = name ?? ''), event.currentTarget.blur())
            }}
            className="mx-1 mt-0.5 rounded-sm bg-background px-1.5 py-0.5 text-meta text-foreground outline-none ring-1 ring-ring/50"
          />
        ) : name ? (
          <button type="button" data-pair-name onClick={() => onOpen(-1)} className="flex min-w-0 items-center gap-1 px-2 pt-0.5 text-left text-meta text-muted-foreground hover:text-foreground">
            {isPinned && !live && <Pin className="size-3 shrink-0" />}
            <span className="min-w-0 truncate">{name}</span>
          </button>
        ) : null}
        {names.map((one, index) => (
          <span key={index} className="group/pane flex min-w-0 items-center">
            <button type="button" data-side-row data-pair-pane={index} data-private={one.private ? '' : undefined} onClick={() => onOpen(index)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-2 text-left text-control text-foreground/80 hover:text-foreground">
              {isPinned && !live && !name && index === 0 ? <Pin className="size-3.5 shrink-0 text-muted-foreground" /> : <one.icon className="size-3.5 shrink-0" style={{ color: one.tint }} />}
              <span className="private-text min-w-0 flex-1 truncate">{one.title}</span>
            </button>
            {onClose && (
              <button type="button" data-pair-close={index} aria-label={`Close ${one.title}`} onClick={() => onClose(index)}
                className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity duration-80 group-hover/pane:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
                <AliveIcon icon={XIcon} size={12} />
              </button>
            )}
          </span>
        ))}
      </div>
    </RowMenu>
  )
}
