import { useState, useSyncExternalStore, type ComponentType, type CSSProperties } from 'react'
import { Pin, X } from 'lucide-react'

import { chime } from '@/lib/sound'
import type { Step } from '@/lib/nav'
import { MCard, MLines, Peek } from './peek'
import { RowMenu, type RowItem } from './row-menu'
import { quietly } from './ui'
import { cut } from '../../../../main/clip'

/**
 * Split pairs, Dia's way: the panes open side by side read as ONE row in the
 * sidebar's Pinned section, their names joined ("Memory × | Reading ×"), and
 * pointed at, a card previews the split. A layout you pin stays there after the
 * split is closed, and a click lays it out again.
 */

type PinnedLayout = { id: string; views: Step[]; sizes: number[] }
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
export type PaneName = { title: string; icon: ComponentType<{ className?: string; style?: CSSProperties }>; tint?: string; private?: boolean; /** What it is, said on the pair's card: "Quote", "Page"; none for a place in the app. */ kind?: string }

/** A pane's name in a menu line: whole, or cut at a word with "…" so the line never runs on. */
const short = (title: string): string => (title.length > 32 ? `${cut(title, 30).replace(/\s+\S*$/, '')}…` : title)

/**
 * The pair's row, Dia's way: ONE row with each pane's icon and name side by
 * side, each cut short, a thin line between (or the pair's name, once
 * renamed), tinted while it is the split on screen. Pointed at, it has the
 * preview every sidebar row has (peek.tsx), the same wait, look and swap from
 * row to row: the split drawn small, each pane where it sits with its icon,
 * name and kind. Nothing in it to press: everything to do with it is in its
 * right-click menu, each pane opened alone or closed, Rename…, Close the
 * split, then the pair's menu. Folded to icons, the panes' kinds stacked.
 */
export function PairRow({ names, live, isPinned, narrow, menu, onOpen, onClose, onAlone, name, onRename, onForget, forgetLabel = 'Close the split' }: {
  names: PaneName[]
  live: boolean
  isPinned: boolean
  narrow: boolean
  menu: RowItem[]
  onOpen: (index: number) => void
  onClose?: (index: number) => void
  /** One pane opened on its own, the split kept under "Side by side". */
  onAlone?: (index: number) => void
  /** The pair's own name, given with "Rename…". */
  name?: string
  onRename?: (name: string) => void
  /** The pair goes: the split on screen closed, or one kept let go. */
  onForget?: () => void
  forgetLabel?: string
}): React.JSX.Element {
  const [renaming, setRenaming] = useState(false)
  const items: RowItem[] = [
    ...(onAlone ? names.map((one, index): RowItem => ({ label: `Open “${short(one.title)}” alone`, icon: <one.icon className="size-3.5 shrink-0" style={{ color: one.tint }} />, run: () => onAlone(index) })) : []),
    'separator',
    ...(onClose ? names.map((one, index): RowItem => ({ label: `Close “${short(one.title)}”`, run: () => onClose(index) })) : []),
    'separator',
    onRename && { label: 'Rename…', run: () => void setTimeout(() => setRenaming(true), 120) },
    // A plain ✕ either way: a kept split let go from the list goes nowhere near the Bin.
    onForget && { label: forgetLabel, icon: <X aria-hidden data-menu-icon="" className="size-3.5 shrink-0 text-muted-foreground" />, run: onForget },
    'separator',
    ...menu
  ]
  const said = name || names.map((one) => one.title).join(' and ')
  // The split drawn small, each pane where it sits on screen.
  const art = (): React.ReactNode => (
    <div data-pair-card className="flex h-full gap-1.5">
      {names.map((one, index) => (
        <MCard key={index} className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span data-pair-card-pane={index} data-private={one.private ? '' : undefined} className="flex w-full min-w-0 flex-col items-start gap-1">
            <one.icon className="size-4 shrink-0" style={{ color: one.tint }} />
            <span className="private-text line-clamp-3 text-[12px] leading-snug font-semibold [overflow-wrap:anywhere]">{one.title}</span>
            {one.kind && <span className="text-[10px] text-muted-foreground">{one.kind}</span>}
            <span className="w-full pt-1"><MLines widths={[92, 74, 84]} /></span>
          </span>
        </MCard>
      ))}
    </div>
  )
  const text = `**${name ? `“${name}”, side by side.` : live ? 'Side by side, on screen now.' : isPinned ? 'A pinned layout.' : 'Side by side, kept for later.'}** ${narrow || name ? 'Click to open it.' : 'Click a name to open that side.'} Right-click for more.`
  if (narrow) {
    return (
      <RowMenu items={items}>
        {/* A box of its own for the menu to hold: the preview holds the row. */}
        <div className="flex flex-col">
        <Peek art={art} text={text}>
        <button type="button" data-side-row data-pair-row={live ? 'live' : isPinned ? 'pinned' : 'kept'} aria-label={said} onClick={() => onOpen(0)}
          className={`flex items-center justify-center rounded-md py-1.5 ${live ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_9%,transparent)]' : ''}`}>
          {names.slice(0, 2).map((one, index) => (
            <span key={index} className={`flex size-4.5 items-center justify-center rounded-full bg-background shadow-[0_0_0_1.5px_var(--background)] ${index ? '-ml-1.5' : ''}`} style={{ zIndex: 3 - index }}>
              <one.icon className="size-3" style={{ color: one.tint }} />
            </span>
          ))}
        </button>
        </Peek>
        </div>
      </RowMenu>
    )
  }
  return (
    <RowMenu items={items}>
      <div className="flex min-w-0 flex-col">
      <Peek art={art} text={text} off={renaming}>
      <div
        data-pair-row={live ? 'live' : isPinned ? 'pinned' : 'kept'}
        data-pinned={isPinned ? '' : undefined}
        aria-label={said}
        // No light of its own: the sidebar's one light lies on the half pointed at. A second, the whole row's, went
        // at once on leaving while that one faded, so the light seemed to shrink to the half.
        className={`flex h-8 min-w-0 items-center rounded-md px-0.5 ${live ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_9%,transparent)]' : 'ring-1 ring-inset ring-foreground/8'}`}
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
      </div>
      </Peek>
      </div>
    </RowMenu>
  )
}
