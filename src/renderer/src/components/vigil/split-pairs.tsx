import { useSyncExternalStore, type ComponentType, type CSSProperties } from 'react'
import { Pin } from 'lucide-react'

import { chime } from '@/lib/sound'
import type { Step } from '@/lib/nav'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RowMenu, type RowItem } from './row-menu'
import { toast } from './ui'

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
  toast('Layout unpinned', () => save(was))
}

/** One pane's name in a pair: its note (kind icon and title), or the page it is on. */
export type PaneName = { title: string; icon: ComponentType<{ className?: string; style?: CSSProperties }>; tint?: string; private?: boolean }

/**
 * The pair's row: each pane's kind stacked, the first name and how many
 * more ("Notes on Zettelkasten + 2"), the whole list on hover. Its menu is
 * the pair's, where each pane closes.
 */
export function PairRow({ names, live, isPinned, narrow, menu, onOpen }: {
  names: PaneName[]
  live: boolean
  isPinned: boolean
  narrow: boolean
  menu: RowItem[]
  onOpen: (index: number) => void
  onClose?: (index: number) => void
}): React.JSX.Element {
  return (
    <RowMenu items={menu}>
      <span className="flex min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              data-side-row
              data-pair-row={live ? 'live' : 'pinned'}
              data-pinned={isPinned ? '' : undefined}
              className={`group/pair flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 text-foreground/80 ${narrow ? 'justify-center px-0' : 'px-2'} ${live ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_9%,transparent)]' : ''}`}
            >
              {/* Each pane's kind, stacked; then the first name, cut short once at most, and how many more. */}
              <span className="flex shrink-0 items-center">
                {isPinned && !live && <Pin className="mr-1 size-3.5 shrink-0 text-muted-foreground" />}
                {names.slice(0, narrow ? 1 : 3).map((name, index) => (
                  <span key={index} className={`flex size-4.5 items-center justify-center rounded-full bg-background shadow-[0_0_0_1.5px_var(--background)] ${index ? '-ml-1.5' : ''}`} style={{ zIndex: 3 - index }}>
                    <name.icon className="size-3" style={{ color: name.tint }} />
                  </span>
                ))}
              </span>
              {!narrow && (<>
                <button type="button" data-pair-pane={0} data-private={names[0]?.private ? '' : undefined} onClick={() => onOpen(0)}
                  className="private-text min-w-0 flex-1 truncate text-left text-control hover:text-foreground">
                  {names[0]?.title}
                </button>
                {names.length > 1 && <span data-pair-more className="shrink-0 text-control text-muted-foreground tabular-nums">+ {names.length - 1}</span>}
              </>)}
            </span>
          </TooltipTrigger>
          {/* Pointed at, the pair says what is in it, each pane in turn. */}
          <TooltipContent side="right" className="flex max-w-64 flex-col items-stretch gap-1 py-1.5">
            <span className="text-meta opacity-70">{live ? 'Open side by side' : 'Pinned layout'}</span>
            {names.map((name, index) => (
              <span key={index} data-private={name.private ? '' : undefined} className="flex min-w-0 items-center gap-1.5">
                <name.icon className="size-3.5 shrink-0" style={{ color: name.tint }} />
                <span className="private-text min-w-0 truncate">{name.title}</span>
              </span>
            ))}
          </TooltipContent>
        </Tooltip>
      </span>
    </RowMenu>
  )
}
