import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { AppWindow, Pencil, Pin } from 'lucide-react'
import { onScrollAway } from '@/lib/scroll-away'

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
export type PaneName = { title: string; icon: ComponentType<{ className?: string; style?: CSSProperties }>; tint?: string; private?: boolean; /** What it is, said on the pair's card: "Quote", "Writing", "Page". */ kind?: string }

/**
 * The pair's row, Dia's way: ONE row with each pane's icon and name side by
 * side, each cut short, a thin line between (or the pair's name, once
 * renamed), tinted while it is the split on screen. Pointed at, a card beside
 * it lists each pane on its own line with what it is, to open alone or close,
 * and the split to rename or close. A right click has the pair's menu,
 * "Rename" and "Close" first when they are offered. Folded to icons, the
 * panes' kinds stacked.
 */
export function PairRow({ names, live, isPinned, narrow, menu, onOpen, onClose, onAlone, name, onRename, onForget }: {
  names: PaneName[]
  live: boolean
  isPinned: boolean
  narrow: boolean
  menu: RowItem[]
  onOpen: (index: number) => void
  onClose?: (index: number) => void
  /** One pane opened on its own, the split kept under "Side by side". */
  onAlone?: (index: number) => void
  /** The pair's own name, given with "Rename". */
  name?: string
  onRename?: (name: string) => void
  /** "Close": the pair goes from the sidebar. */
  onForget?: () => void
}): React.JSX.Element {
  const [renaming, setRenaming] = useState(false)
  const [card, setCard] = useState<DOMRect | null>(null)
  const row = useRef<HTMLDivElement>(null)
  const cardBox = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // A moment's grace on leaving, so the pointer can cross to the card.
  const leave = (): void => (clearTimeout(timer.current), void (timer.current = setTimeout(() => setCard(null), 160)))
  useEffect(() => (card ? onScrollAway(() => row.current, () => setCard(null), () => cardBox.current) : undefined), [card])
  useEffect(() => () => clearTimeout(timer.current), [])
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
  const ask = (): void => {
    setCard(null)
    setTimeout(() => setRenaming(true), 120)
  }
  return (
    <RowMenu items={items}>
      <div
        ref={row}
        data-pair-row={live ? 'live' : isPinned ? 'pinned' : 'kept'}
        data-pinned={isPinned ? '' : undefined}
        aria-label={said}
        onPointerEnter={() => (clearTimeout(timer.current), (timer.current = setTimeout(() => !renaming && setCard(row.current?.getBoundingClientRect() ?? null), card ? 0 : 450)))}
        onPointerLeave={leave}
        onContextMenu={() => (clearTimeout(timer.current), setCard(null))}
        className={`flex h-8 min-w-0 items-center rounded-md px-0.5 ${live ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_9%,transparent)]' : 'ring-1 ring-inset ring-foreground/8 hover:bg-accent/60'}`}
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
            className="mx-1 min-w-0 flex-1 rounded-sm bg-background px-1.5 py-0.5 text-control text-foreground outline-none ring-1 ring-ring/50"
          />
        ) : name ? (
          // Named: both panes' icons, then the name.
          <button type="button" data-side-row data-pair-name onClick={() => onOpen(-1)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-1.5 text-left text-control text-foreground">
            {isPinned && !live ? <Pin className="size-3.5 shrink-0 text-muted-foreground" /> : (
              <span className="flex shrink-0 items-center">
                {names.slice(0, 2).map((one, index) => <one.icon key={index} className={`size-3.5 ${index ? '-ml-1' : ''}`} style={{ color: one.tint }} />)}
              </span>
            )}
            <span className="min-w-0 truncate">{name}</span>
          </button>
        ) : (
          // Dia's way: each pane's icon and name side by side in the one row, each cut short, a thin line between.
          names.map((one, index) => (
            <span key={index} className="flex min-w-0 flex-1 items-center">
              {index > 0 && <span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-foreground/15" />}
              <button type="button" data-side-row data-pair-pane={index} data-private={one.private ? '' : undefined} onClick={() => onOpen(index)}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pl-1.5 pr-1 text-left text-control text-foreground/85 hover:text-foreground">
                {isPinned && !live && index === 0 ? <Pin className="size-3.5 shrink-0 text-muted-foreground" /> : <one.icon className="size-3.5 shrink-0" style={{ color: one.tint }} />}
                <span className="private-text min-w-0 flex-1 truncate">{one.title}</span>
              </button>
            </span>
          ))
        )}
      {card && !renaming && createPortal(
        // Pointed at: a card beside the row with each pane on its own line, in the look of a note's preview.
        <div ref={cardBox} data-pair-card role="dialog" aria-label={said}
          onPointerEnter={() => clearTimeout(timer.current)} onPointerLeave={leave}
          style={{ left: card.right + 8, top: Math.min(card.top - 6, innerHeight - 64 - names.length * 44) }}
          className="fixed z-[70] w-72 rounded-lg border bg-popover p-1.5 text-control shadow-(--mf-panel-shadow) animate-in fade-in-0 duration-150">
          {names.map((one, index) => (
            <div key={index} data-pair-card-pane={index} className="group/line flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
              <one.icon className="size-4 shrink-0" style={{ color: one.tint }} />
              <button type="button" onClick={() => (setCard(null), onOpen(index))} className="min-w-0 flex-1 text-left">
                <span className="private-text block truncate text-body text-foreground" data-private={one.private ? '' : undefined}>{one.title}</span>
                <span className="block text-control text-muted-foreground">{one.kind ?? 'Page'}</span>
              </button>
              {onAlone && <Act label="Open this alone" data="alone" run={() => (setCard(null), onAlone(index))}><AppWindow className="size-3.5" /></Act>}
              {onClose && <Act label="Close this pane" data="close" run={() => (setCard(null), onClose(index))}><AliveIcon icon={XIcon} size={12} /></Act>}
            </div>
          ))}
          {(onRename || onForget) && (
            <div className="mt-1 flex items-center gap-1 border-t px-1 pt-1.5">
              {onRename && <button type="button" data-pair-card-rename onClick={ask} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-control text-foreground hover:bg-accent"><Pencil className="size-3.5" />Rename</button>}
              {onForget && <button type="button" data-pair-card-forget onClick={() => (setCard(null), onForget())} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-control text-foreground hover:bg-accent"><AliveIcon icon={XIcon} size={12} />Close the split</button>}
            </div>
          )}
        </div>,
        document.body
      )}
      </div>
    </RowMenu>
  )
}

/** A small icon button on a line of the pair's card, saying what it does on hover. */
function Act({ label, data, run, children }: { label: string; data: string; run: () => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" data-pair-card-act={data} aria-label={label} onClick={run}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground">
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
