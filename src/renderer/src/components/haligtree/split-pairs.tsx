import { shownName } from '@/lib/haligtree'
import { useState, useSyncExternalStore, type ComponentType, type CSSProperties } from 'react'
import { Pin, X } from 'lucide-react'

import { chime } from '@/lib/sound'
import type { Step } from '@/lib/nav'
import { MCard, MLines, Peek } from './peek'
import { RowMenu, type RowItem } from './row-menu'
import { toast } from './ui'
import { cut } from '../../../../main/clip'

/**
 * A split pinned on purpose: its panes read as ONE row in the sidebar's
 * Pinned section, their names joined, and pointed at, a card previews it. It
 * stays there after the split has ended, and a click lays it out again, each
 * pane as one tab.
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
export const pinLayout = (views: Step[], sizes: number[]): void => {
  chime('pin')
  save([...pinned, { id: `l${Date.now().toString(36)}`, views: views.map(({ id, focus, tab, folder }) => ({ id, focus, tab, folder })), sizes }])
}
/** A pinned split let go: it leaves Pinned, said with Undo. */
export const dropLayout = (id: string, said: string): void => {
  const was = pinned
  chime('unpin')
  save(pinned.filter((one) => one.id !== id))
  toast(said, () => save(was))
}

/** One pane's name in the row: its note (kind icon and title), or the page it is on. */
export type PaneName = { title: string; icon: ComponentType<{ className?: string; style?: CSSProperties }>; tint?: string; private?: boolean; /** What it is, said on the row's card: "Quote", "Page"; none for a place in the app. */ kind?: string }

/** A name in a menu line or a notice: whole, or cut at a word with "…" so the line never runs on. */
export const short = (title: string): string => (title.length > 32 ? `${cut(title, 30).replace(/\s+\S*$/, '')}…` : title)

/** The split drawn as one icon for the narrow sidebar: a small rounded window, divided, each half holding its pane's mark. */
function SplitMark({ names }: { names: PaneName[] }): React.JSX.Element {
  return (
    <span aria-hidden data-split-mark className="flex h-6 w-[37px] shrink-0 items-stretch rounded-[5px] bg-foreground/[0.035] ring-1 ring-foreground/25">
      {names.slice(0, 2).map((one, index) => (
        <span key={index} data-split-half={index} className={`flex flex-1 items-center justify-center ${index ? 'border-l border-foreground/25' : ''}`}>
          <one.icon className="size-4 shrink-0" style={{ color: one.tint }} />
        </span>
      ))}
    </span>
  )
}

/** The row: each pane's icon and name side by side, a thin line between, and one ✕ at its end that unpins it. Its menu opens or unpins it. */
export function PinnedSplit({ names, narrow, onOpen, onUnpin }: { names: PaneName[]; narrow: boolean; onOpen: (index: number) => void; onUnpin: () => void }): React.JSX.Element {
  const both = names.map((one) => shownName(one.title)).join(' | ')
  // The unpin ✕ pointed at: the names beside it dim (a row's own state; a :has() rule restyled the whole page on every change).
  const [unpinHot, setUnpinHot] = useState(false)
  const items: RowItem[] = [{ label: 'Open this split', run: () => onOpen(0) }, 'separator', { label: 'Unpin this split', run: onUnpin }]
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
  const text = narrow ? `**${both}.** A pinned split. Click to open it. Right-click for more.` : '**A pinned split.** Click a name to open it with that side in front. Right-click for more.'
  if (narrow) {
    return (
      <RowMenu items={items}>
        <div className="flex flex-col">
          <Peek art={art} text={text}>
            <button type="button" data-side-row data-pair-row="pinned" aria-label={both} onClick={() => onOpen(0)} className="-mx-1 flex items-center justify-center rounded-md py-1">
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
        <Peek art={art} text={text}>
          <div data-pair-row="pinned" data-pinned="" data-x-hover={unpinHot || undefined} aria-label={both} className="group/pair flex h-8 min-w-0 items-center rounded-md px-0.5 ring-1 ring-inset ring-foreground/8">
            {names.map((one, index) => (
              <span key={index} className="relative flex min-w-0 flex-1 items-center">
                {index > 0 && <span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-foreground/15" />}
                <button type="button" data-side-row data-pair-pane={index} data-private={one.private ? '' : undefined} onClick={() => onOpen(index)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pr-1 pl-1.5 text-left text-control text-foreground/85 transition-colors duration-[120ms] group-data-[x-hover]/pair:text-muted-foreground hover:text-foreground">
                  {index === 0 ? <Pin className="size-3.5 shrink-0 text-muted-foreground" /> : <one.icon className="size-3.5 shrink-0" style={{ color: one.tint }} />}
                  <span data-pair-title className={`private-text min-w-0 flex-1 truncate ${index === names.length - 1 ? 'group-hover/pair:[mask-image:linear-gradient(to_left,transparent_16px,#000_30px)]' : ''}`}>{one.title}</span>
                </button>
                {index === names.length - 1 && (
                  <button type="button" data-pair-x-all aria-label={`Unpin this split, ${both}`} onClick={onUnpin}
                    onPointerEnter={() => setUnpinHot(true)} onPointerLeave={() => setUnpinHot(false)}
                    className="absolute top-1/2 right-0.5 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[5px] text-muted-foreground opacity-0 transition-[opacity,scale] duration-[120ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/pair:opacity-100 group-focus-within/pair:opacity-100 hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-ring/70 active:scale-[0.97]">
                    <X aria-hidden className="size-3.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </Peek>
      </div>
    </RowMenu>
  )
}
