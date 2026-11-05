import { shownName } from '@/lib/haligtree'
import { useState, useSyncExternalStore, type ComponentType, type CSSProperties } from 'react'
import { Pin, X } from 'lucide-react'

import { chime } from '@/lib/sound'
import type { Step } from '@/lib/nav'
import { MCard, MLines, Peek } from './peek'
import { RowMenu, openFromGrip, type RowItem } from './row-menu'
import { quietly, Tip, toast } from './ui'
import { cut } from '../../../../main/clip'
import { num } from '../../../../main/dates'

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

/** One pane of a pinned layout closed (its half's ✕): a layout of one is no layout, so it goes, and Undo brings it back. */
export const closeInLayout = (id: string, index: number, title: string): void => {
  const was = pinned
  const one = pinned.find((layout) => layout.id === id)
  if (!one) return
  chime('fold')
  const views = one.views.filter((_, at) => at !== index)
  const sizes = one.sizes.filter((_, at) => at !== index)
  const total = sizes.reduce((sum, size) => sum + size, 0) || 1
  save(views.length < 2 ? pinned.filter((layout) => layout.id !== id) : pinned.map((layout) => (layout.id === id ? { ...layout, views, sizes: sizes.map((size) => size / total) } : layout)))
  toast(`Closed ${quoted(shownName(title))} from the split`, () => save(was))
}

/** One pane's name in a pair: its note (kind icon and title), or the page it is on. */
export type PaneName = { title: string; icon: ComponentType<{ className?: string; style?: CSSProperties }>; tint?: string; private?: boolean; /** What it is, said on the pair's card: "Quote", "Page"; none for a place in the app. */ kind?: string }

/** A pane's name in a menu line: whole, or cut at a word with "…" so the line never runs on. */
export const short = (title: string): string => (title.length > 32 ? `${cut(title, 30).replace(/\s+\S*$/, '')}…` : title)
/** A pane's name inside a menu line, in curly quotes: a quote that already carries its own marks is not wrapped twice. */
const quoted = (title: string): string => (/^["“'‘]/.test(title) ? short(title) : `“${short(title)}”`)

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
/** What a pair's row is given, here and in the fold of many (PairFold). */
export type PairProps = {
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
}

/**
 * A pair's own menu lines: each pane opened alone or closed, Rename… (where
 * the row has room to rename in), Close the split, then the pair's menu.
 */
const pairItems = ({ names, menu, onClose, onAlone, onRename, onForget, forgetLabel = 'Close the split' }: PairProps, rename?: () => void): RowItem[] => [
  ...(onAlone ? names.map((one, index): RowItem => ({ label: `Open ${quoted(shownName(one.title))} alone`, icon: <one.icon className="size-3.5 shrink-0" style={{ color: one.tint }} />, run: () => onAlone(index) })) : []),
  'separator',
  ...(onClose ? names.map((one, index): RowItem => ({ label: `Close ${quoted(shownName(one.title))}`, run: () => onClose(index) })) : []),
  'separator',
  onRename && rename && { label: 'Rename…', run: rename },
  // A plain ✕ either way: a kept split let go from the list goes nowhere near the Bin.
  onForget && { label: forgetLabel, icon: <X aria-hidden data-menu-icon="" className="size-3.5 shrink-0 text-muted-foreground" />, run: onForget },
  'separator',
  ...menu
]

/** The pair's panes named the way a hover says them: "MOC - YouTube | Tasks". */
const bothNames = (names: PaneName[]): string => names.map((one) => shownName(one.title)).join(' | ')

/**
 * A split drawn as one icon for the narrow sidebar: a small rounded window
 * divided down the middle, each half holding its pane's own mark at the
 * sidebar's icon size. Two marks squeezed over each other read as a broken icon.
 */
export function SplitMark({ names, size = 'rail' }: { names: PaneName[]; /** rail: the narrow sidebar's, at its icon size; row: a wide sidebar row's, at that row's icon size; menu: a menu line's, the size of the other lines' icons. */ size?: 'rail' | 'row' | 'menu' }): React.JSX.Element {
  const two = names.slice(0, 2)
  return (
    <span aria-hidden data-split-mark className={`flex shrink-0 items-stretch rounded-[5px] bg-foreground/[0.035] ring-1 ring-foreground/25 ${size === 'menu' ? 'h-3 w-4' : size === 'row' ? 'h-5 w-[31px]' : 'h-6 w-[37px]'}`}>
      {two.map((one, index) => (
        <span key={index} data-split-half={index} className={`flex flex-1 items-center justify-center ${index ? 'border-l border-foreground/25' : ''}`}>
          {size !== 'menu' && <one.icon className={`${size === 'row' ? 'size-3.5' : 'size-4'} shrink-0`} style={{ color: one.tint }} />}
        </span>
      ))}
    </span>
  )
}

export function PairRow(props: PairProps): React.JSX.Element {
  const { names, live, isPinned, narrow, onOpen, onClose, name, onRename } = props
  const [renaming, setRenaming] = useState(false)
  // Folded to icons there is no room to type a name in: Rename… waits for the wide sidebar.
  const items = pairItems(props, narrow ? undefined : () => void setTimeout(() => setRenaming(true), 120))
  const said = name || names.map((one) => one.title).join(' and ')
  // The split drawn small, each pane where it sits on screen.
  const art = (): React.ReactNode => (
    <div data-pair-card className="flex h-full gap-1.5">
      {names.map((one, index) => (
        <MCard key={index} className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span data-pair-card-pane={index} data-private={one.private ? '' : undefined} className="flex w-full min-w-0 flex-col items-start gap-1">
            <one.icon className="size-4 shrink-0" style={{ color: one.tint }} />
            <span className="private-text line-clamp-3 text-[12px] leading-snug font-semibold hyphens-auto [overflow-wrap:break-word]">{one.title}</span>
            {one.kind && <span className="text-[10px] text-muted-foreground">{one.kind}</span>}
            <span className="w-full pt-1"><MLines widths={[92, 74, 84]} /></span>
          </span>
        </MCard>
      ))}
    </div>
  )
  // Folded to icons, the hover names both pages first: the icon alone cannot.
  const text = narrow ? `**${name ? `“${name}”: ` : ''}${bothNames(names)}.** ${live ? 'Side by side, on screen now.' : isPinned ? 'A pinned layout.' : 'Kept for later.'} Click to open it. Right-click for more.` : `**${name ? `“${name}”, side by side.` : live ? 'Side by side, on screen now.' : isPinned ? 'A pinned layout.' : 'Side by side, kept for later.'}** ${narrow || name ? 'Click to open it.' : 'Click a name to open that side.'} Right-click for more.`
  if (narrow) {
    return (
      <RowMenu items={items}>
        {/* A box of its own for the menu to hold: the preview holds the row. */}
        <div className="flex flex-col">
        <Peek art={art} text={text}>
        <button type="button" data-side-row data-pair-row={live ? 'live' : isPinned ? 'pinned' : 'kept'} aria-label={bothNames(names)} onClick={() => onOpen(0)}
          className={`-mx-1 flex items-center justify-center rounded-md py-1 ${live ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_9%,transparent)]' : ''}`}>
          <SplitMark names={names} />
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
        className={`group/pair flex h-8 min-w-0 items-center rounded-md px-0.5 ${live ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_9%,transparent)]' : 'ring-1 ring-inset ring-foreground/8'}`}
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
          // Named: the split-window icon the narrow sidebar shows, then the name.
          <button type="button" data-side-row data-pair-name onClick={() => onOpen(-1)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-1.5 text-left text-control text-foreground">
            {isPinned && !live ? <Pin className="size-3.5 shrink-0 text-muted-foreground" /> : <SplitMark names={names} size="row" />}
            <span className="min-w-0 truncate">{name}</span>
          </button>
        ) : (
          // Dia's way: each pane's icon and name side by side in the one row, each cut short, a thin line between.
          // Pointed at, each half has its own ✕ at its right end, inside its light, as Dia's has: it closes that
          // half alone. It sits over the name, which fades out under it, so no name moves when it shows.
          names.map((one, index) => (
            <span key={index} className="relative flex min-w-0 flex-1 items-center">
              {index > 0 && <span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-foreground/15" />}
              <button type="button" data-side-row data-pair-pane={index} data-private={one.private ? '' : undefined} onClick={() => onOpen(index)}
                className="peer flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pl-1.5 pr-1 text-left text-control text-foreground/85 hover:text-foreground">
                {isPinned && !live && index === 0 ? <Pin className="size-3.5 shrink-0 text-muted-foreground" /> : <one.icon className="size-3.5 shrink-0" style={{ color: one.tint }} />}
                <span data-pair-title className={`private-text min-w-0 flex-1 truncate ${onClose ? 'group-hover/pair:[mask-image:linear-gradient(to_left,transparent_16px,#000_30px)] group-has-[:focus-visible]/pair:[mask-image:linear-gradient(to_left,transparent_16px,#000_30px)]' : ''}`}>{one.title}</span>
              </button>
              {onClose && (
                <button type="button" data-pair-x={index} aria-label={`Close ${quoted(shownName(one.title))}`} onClick={() => onClose(index)}
                  className="absolute top-1/2 right-0.5 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[5px] text-muted-foreground opacity-0 transition-[opacity,scale] duration-[120ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/pair:opacity-100 group-has-[:focus-visible]/pair:opacity-100 hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-ring/70 active:scale-[0.97]">
                  <X aria-hidden className="size-3.5" />
                </button>
              )}
            </span>
          ))
        )}
      </div>
      </Peek>
      </div>
    </RowMenu>
  )
}

/**
 * More than three splits in the narrow sidebar: one split icon with their
 * count, which opens them all as a menu, each opened from its line or its
 * own lines kept under it, the menu its row would have had.
 */
export function PairFold({ pairs }: { pairs: (PairProps & { key: string })[] }): React.JSX.Element {
  const live = pairs.some((one) => one.live)
  const items: RowItem[] = [
    { heading: `${num(pairs.length)} splits` },
    ...pairs.map((one): RowItem => ({
      label: one.name || short(bothNames(one.names)),
      icon: <SplitMark names={one.names} size="menu" />,
      items: [{ label: 'Open the split', run: () => one.onOpen(one.name ? -1 : 0) }, 'separator', ...pairItems(one)]
    }))
  ]
  return (
    <RowMenu items={items}>
      <div className="flex flex-col">
        <Tip label={`${num(pairs.length)} splits: click to see them all`} side="right">
          <button type="button" data-side-row data-pair-fold={pairs.length} aria-label={`${num(pairs.length)} splits`} onClick={openFromGrip}
            className={`relative -mx-1 flex items-center justify-center rounded-md py-1 ${live ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_9%,transparent)]' : ''}`}>
            <SplitMark names={pairs.find((one) => one.live)?.names ?? pairs[0].names} />
            <span data-pair-count className="absolute -top-1 -right-0.5 flex h-3.5 min-w-3.5 ring-2 ring-background items-center justify-center rounded-full bg-foreground px-1 text-[9px] leading-none font-semibold tabular-nums text-background">{num(pairs.length)}</span>
          </button>
        </Tip>
      </div>
    </RowMenu>
  )
}
