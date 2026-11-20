import { afterLayout } from '@/lib/after-layout'
import { Fragment, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type ReactNode } from "react"
import { ChevronDown, Plus, X } from 'lucide-react'

import ArrowNarrowLeftIcon from '@/components/ui/arrow-narrow-left-icon'
import ArrowNarrowRightIcon from '@/components/ui/arrow-narrow-right-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import { Pressed, Tip } from './ui'
import { RowMenu, openFromGrip, type RowItem } from './row-menu'
import { RoomAcross } from './carry'
import { plural } from '../../../../main/dates'

/** A tab as its row draws it. `open`: `type:id` for a tab on a note, so carrying it can pin it. `pinned`: drawn small, at the left. */
export type TabShown = { key: string; pinned?: boolean; label: string; private?: boolean; icon: ComponentType<{ className?: string; style?: CSSProperties }>; tint?: string; open?: string }
export type TabGroup = { pane: string; tabs: TabShown[]; active: string; front: boolean }
export type TabActions = {
  select: (pane: string, tab: string) => void
  close: (pane: string, tab: string) => void
  add: (pane: string) => void
  menu: (pane: string, tab: string) => RowItem[]
  step: (pane: string, by: -1 | 1) => void
  canStep: (pane: string, by: -1 | 1) => boolean
  /** Back's or Forward's menu: this tab's own steps that way, nearest first, then "Show all history". */
  history: (pane: string, by: -1 | 1) => RowItem[]
}

/** How long Back or Forward is held before its menu opens, as a browser's does (and the swipe's list, swipe-back.tsx). */
const HOLD = 450

// What a carried tab or row is over, said by split-drop.tsx and drawn here:
// the tab being carried, and the gap it would land in.
type Carry = { from: string | null; gap: { pane: string; at: number; width: number } | null }
let carry: Carry = { from: null, gap: null }
const told = new Set<() => void>()
const follow = (tell: () => void): (() => void) => (told.add(tell), () => void told.delete(tell))
export function setCarry(next: Carry): void {
  if (next.from === carry.from && next.gap?.pane === carry.gap?.pane && next.gap?.at === carry.gap?.at) return
  carry = next
  told.forEach((tell) => tell())
}
/**
 * Which gap of a row the pointer is nearest, counted without the tab in the hand: a pinned tab's among the pinned
 * ones, anything else's after them, so the line only shows where it can land.
 */
export const gapIn = (row: Element, x: number, from: string | null): number => {
  const tabs = [...row.querySelectorAll<HTMLElement>('[data-tab]')].filter((one) => one.dataset.tab !== from)
  const at = tabs.filter((one) => {
    const box = one.getBoundingClientRect()
    return box.left + box.width / 2 < x
  }).length
  const pinned = tabs.filter((one) => one.dataset.tabPinned !== undefined).length
  return carriedPinned(from) ? Math.min(at, pinned) : Math.max(at, pinned)
}
/** Whether the tab in the hand is a pinned one: the gap it opens is a pinned tab's width. */
export const carriedPinned = (from: string | null): boolean => !!from && document.querySelector(`[data-tab="${CSS.escape(from)}"]`)?.hasAttribute('data-tab-pinned') === true

const ROUND = 'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,scale] duration-[120ms] hover:bg-accent/60 hover:text-foreground active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5'

/**
 * The tab's foot, either side: it rises out of the page as one surface. It overlaps the tab by a pixel (butted
 * edge to edge, the seam let a hairline of the frame through). Coloured by the pane (panes.tsx), so every theme
 * and both kinds of focus draw it from their own tokens.
 */
const Foot = ({ side }: { side: 'left' | 'right' }): React.JSX.Element => (
  // A small inward curve where the tab meets the page, as a browser's tab has: the tab's top corners are round
  // of themselves, so its sides stand straight and it never reads as a flat-topped ridge.
  <svg aria-hidden data-tab-foot viewBox="0 0 8 8" className={`pointer-events-none absolute bottom-0 size-2 ${side === 'left' ? 'right-[calc(100%-1px)]' : 'left-[calc(100%-1px)] -scale-x-100'}`}>
    <path d="M8 0 V8 H0 A8 8 0 0 0 8 0 Z" fill="var(--mf-tab)" />
    <path d="M0 7.5 A7.5 7.5 0 0 0 7.5 0" fill="none" stroke="var(--mf-tab-line)" vectorEffect="non-scaling-stroke" />
  </svg>
)

/**
 * The open tab's drawn shape: round top corners, straight sides and a small foot either side, one surface with what
 * it stands on (`--mf-tab` its fill, `--mf-tab-line` its hairline). Quick capture's glance tabs wear it too, standing
 * on the pill (box-glance.tsx), so a tab is one shape wherever the app draws one.
 */
export const TabShape = (): React.JSX.Element => (
  // As wide as the tab's own place, as the other tabs' shapes are: drawn a quarter rem in from each side, its
  // icon and its ✕ sat half as far from its edge as theirs do from theirs ("tab looks thin on the sides", 12 Nov).
  <span aria-hidden className="pointer-events-none absolute inset-0 rounded-t-[9px] border border-b-0 border-(--mf-tab-line) bg-(--mf-tab)">
    <Foot side="left" /><Foot side="right" />
  </span>
)

function OneTab({ tab, group, actions, faint }: { tab: TabShown; group: TabGroup; actions: TabActions; faint: boolean }): React.JSX.Element {
  const on = tab.key === group.active
  const strong = on && group.front
  const Icon = tab.icon
  // Its name in a tip only while the tab has cut it short: a tip never repeats what is there to read.
  const [cut, setCut] = useState(false)
  // Which way its words run, read from its first letter: the fade goes on the end they run out at.
  const rtl = /^[^\p{L}]*[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(tab.label)
  // Pinned: its icon alone, a fixed small width at the left of the row, no ✕ (Safari's and Chrome's pinned tabs).
  const pinned = !!tab.pinned
  return (
    <RowMenu items={() => actions.menu(group.pane, tab.key)}>
      <div data-tab={tab.key} data-tab-on={on ? '' : undefined} data-tab-pinned={pinned ? '' : undefined} data-drag-title={tab.label} data-tab-open={tab.open}
        onAuxClick={(event) => event.button === 1 && (event.preventDefault(), actions.close(group.pane, tab.key))}
        onMouseDown={(event) => event.button === 1 && event.preventDefault()}
        // Never narrower than its name, up to about ten letters' room (or its icon alone, open, beside it): a short
        // name reads whole and a long one keeps enough to know it; past that the row scrolls (10 Nov).
        style={pinned ? undefined : { minWidth: Math.min(54 + [...tab.label].length * 7, 124) }}
        // The open tab stands on the page, 4px under the bar's top (its shape joins the page); the others are pills the
        // arrows' and "+"'s height, on the bar's middle line with them, never low against the page (20 Nov).
        className={`group/tab relative mx-0.5 flex items-stretch ${pinned ? 'w-10 shrink-0' : 'max-w-52 flex-[1_1_0]'} ${on ? 'z-10 mt-1 py-[3px]' : 'h-6 self-center'} ${faint ? 'opacity-40' : ''}`}>
        {on && <TabShape />}
        <Tip label={pinned ? tab.label : cut ? tab.label : ''}>
          <button type="button" role="tab" aria-selected={on} aria-label={pinned ? `${tab.label}, pinned` : undefined} onClick={() => actions.select(group.pane, tab.key)}
            onPointerEnter={(event) => { const name = event.currentTarget.querySelector('span'); setCut(!!name && name.scrollWidth > name.clientWidth) }}
            className={`relative flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-full text-control transition-[color,background-color,scale] duration-[120ms] outline-none focus-visible:ring-[1.5px] focus-visible:ring-ring/70 active:scale-[0.97] ${pinned ? 'justify-center' : 'pl-2'} ${
              on ? (strong ? 'font-medium text-foreground' : 'text-muted-foreground') : 'bg-foreground/[0.035] text-muted-foreground shadow-[inset_0_0_0_1px_var(--mf-tab-edge)] hover:bg-foreground/[0.07] hover:text-foreground'}`}>
            <Icon className="size-3.5 shrink-0" style={{ color: tab.tint }} />
            {/* Its end fades out before the ✕, with clear air; nothing moves when the ✕ shows (split.css). */}
            {!pinned && (
              <span data-tab-name dir={rtl ? 'rtl' : 'ltr'} data-private={tab.private ? '' : undefined} className="private-text min-w-0 flex-1 overflow-hidden text-left whitespace-nowrap">
                {tab.label}
              </span>
            )}
          </button>
        </Tip>
        {/* Its tip hangs below, into the page: beside, it covered the next tab (10 Nov). */}
        {!pinned && <Tip side="bottom" label={<span className="flex items-center gap-1.5">Close tab <Pressed keys="⌃W" /></span>}>
        <button type="button" data-tab-close data-no-split aria-label={`Close ${tab.label}`} onClick={() => actions.close(group.pane, tab.key)}
          className={`mf-hit absolute top-1/2 right-2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-[opacity,scale,color,background-color] duration-[120ms] hover:bg-foreground/[0.07] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-ring/70 active:scale-[0.97] ${on ? '' : 'opacity-0 group-hover/tab:opacity-100'}`}>
          <X className="size-3" strokeWidth={2.25} />
        </button>
        </Tip>}
      </div>
    </RowMenu>
  )
}

/** One pane's tabs: they share the room evenly down to a least width, then the row scrolls, the open one kept in view. */
function Tabs({ group, actions }: { group: TabGroup; actions: TabActions }): React.JSX.Element {
  const now = useSyncExternalStore(follow, () => carry)
  const box = useRef<HTMLDivElement>(null)
  // Read once the row is laid out, before it is painted, never in the middle of a pane mounting (lib/after-layout.ts).
  useLayoutEffect(() => {
    const row = box.current
    if (!row) return
    return afterLayout(row, () => {
      const on = row.querySelector<HTMLElement>('[data-tab-on]')
      if (!on || row.scrollWidth <= row.clientWidth) return
      const [left, right] = [on.offsetLeft - 16, on.offsetLeft + on.offsetWidth + 16]
      if (left < row.scrollLeft) row.scrollLeft = left
      else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth
    })
  }, [group.active, group.tabs.length])
  const gap = now.gap?.pane === group.pane ? now.gap : null
  const shown = now.gap ? group.tabs.filter((one) => one.key !== now.from) : group.tabs
  const parts = shown.map((tab) => <OneTab key={tab.key} tab={tab} group={group} actions={actions} faint={tab.key === now.from} />)
  // The gap it would land in: the app's one room and drop line (carry.tsx), in this row or another pane's.
  if (gap) parts.splice(gap.at, 0, <span key="gap" data-tab-gap aria-hidden className="relative mx-0.5 my-1 shrink-0" style={{ flexBasis: gap.width, maxWidth: gap.width, flexGrow: 0 }}><RoomAcross how={`${gap.pane}:${gap.at}`} /></span>)
  return (
    <div ref={box} role="tablist" aria-label="Tabs" data-tab-row={group.pane} style={{ flex: `${Math.max(1, group.tabs.length)} 1 0` }}
      // A tab with the keys: ← → to its neighbours, ⌫ closes it, as a list's row does.
      onKeyDown={(event) => {
        const key = (event.target as Element).closest<HTMLElement>('[data-tab]')?.dataset.tab
        const at = group.tabs.findIndex((one) => one.key === key)
        if (at < 0 || (event.target as Element).getAttribute('role') !== 'tab' || event.metaKey || event.ctrlKey || event.altKey) return
        if (event.key === 'Backspace' || event.key === 'Delete') (event.preventDefault(), event.stopPropagation(), actions.close(group.pane, group.tabs[at].key))
        const by = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
        if (!by) return
        event.preventDefault()
        event.stopPropagation()
        const next = group.tabs[(at + by + group.tabs.length) % group.tabs.length]
        box.current?.querySelector<HTMLElement>(`[data-tab="${next.key}"] [role="tab"]`)?.focus()
      }}
      className="mf-tabs-fade relative flex h-full min-w-0 overflow-x-auto overflow-y-hidden px-4 [scrollbar-width:none] data-[queue-hot]:bg-transparent">
      {parts}
    </div>
  )
}

/**
 * Back or Forward: a click steps once; held, or right-clicked, its menu lists
 * where that tab has been that way, as Dia's and Safari's do, and ends with
 * "Show all history", every tab's.
 */
function StepButton({ by, label, keys, icon, pane, actions }: { by: -1 | 1; label: string; keys: string; icon: typeof ArrowNarrowLeftIcon; pane: string; actions: TabActions }): React.JSX.Element {
  const hold = useRef(0)
  // The press that opened the menu is not also a click.
  const held = useRef(false)
  const letGo = (): void => window.clearTimeout(hold.current)
  return (
    <RowMenu items={() => actions.history(pane, by)}>
      {/* The menu's trigger, around the tip: a tip passes nothing on to its button. A segment of its pill (mf-seg, main.css .mf-segs). */}
      <span className="mf-seg flex">
      <Tip label={<span className="flex items-center gap-1.5">{label} <Pressed keys={keys} /></span>}>
        <button type="button" aria-label={label} data-tab-step={by < 0 ? 'back' : 'forward'} disabled={!actions.canStep(pane, by)}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            held.current = false
            const button = event.currentTarget
            hold.current = window.setTimeout(() => {
              held.current = true
              const box = button.getBoundingClientRect()
              button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left, clientY: box.bottom + 4, button: 2 }))
            }, HOLD)
          }}
          onPointerUp={letGo} onPointerLeave={letGo}
          onClick={() => (held.current ? (held.current = false) : actions.step(pane, by))}
          className="relative flex size-[22px] cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,scale] duration-[120ms] active:scale-[0.97] after:absolute after:-inset-0.5 after:rounded-full hover:bg-accent/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40">
          <AliveIcon icon={icon} size={14} />
        </button>
      </Tip>
      </span>
    </RowMenu>
  )
}

/**
 * The row over a pane: its Back and Forward, its tabs, a + and a list of all
 * of them. Always there, one tab or fifty, so nothing jumps when a second opens.
 * In a window too narrow for two panes, the one on show carries every pane's
 * tabs, a thin line between each pane's.
 */
export function TabRow({ groups, actions, pane, lead, tail }: { groups: TabGroup[]; actions: TabActions; pane: string; /** The window's controls before the tabs (the first pane) and after them (the last): panes.tsx. */ lead?: ReactNode; tail?: ReactNode }): React.JSX.Element {
  const all: RowItem[] = groups.flatMap((group, at) => [
    at > 0 && ('separator' as const),
    ...group.tabs.map((tab): RowItem => ({ label: tab.label, icon: <tab.icon className="size-3.5 shrink-0" style={{ color: tab.tint }} />, hint: tab.key === group.active ? 'Open now' : undefined, run: () => actions.select(group.pane, tab.key) }))
  ])
  const count = groups.reduce((sum, group) => sum + group.tabs.length, 0)
  return (
    // The window's top row: its empty parts move the window (the tab row is the title bar now, as Dia's is), what is in
    // it is pressed as ever.
    <div data-tabs={pane} data-drag-strip="" className="mf-tab-bar relative z-[1] -mb-px flex h-[34px] shrink-0 items-end gap-0.5" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
      {lead}
      <span data-tab-arrows className="mf-segs ml-1 flex h-6 self-center shrink-0 items-center overflow-hidden rounded-full border">
        {([[-1, 'Back', '⌘[', ArrowNarrowLeftIcon], [1, 'Forward', '⌘]', ArrowNarrowRightIcon]] as const).map(([by, label, keys, icon]) => (
          <StepButton key={label} by={by} label={label} keys={keys} icon={icon} pane={pane} actions={actions} />
        ))}
      </span>
      <div data-tab-room className="flex h-full min-w-0 flex-1">
        {groups.map((group, at) => (
          <Fragment key={group.pane}>
            {at > 0 && <span aria-hidden className="my-1.5 w-px shrink-0 bg-foreground/15" />}
            <Tabs group={group} actions={actions} />
          </Fragment>
        ))}
      </div>
      <span className="mr-1 flex shrink-0 items-center gap-0.5 self-center">
        <Tip label={<span className="flex items-center gap-1.5">New tab <Pressed keys="⌘T" /></span>}>
          <button type="button" data-tab-add aria-label="New tab" onClick={() => actions.add(pane)} className={ROUND}><Plus /></button>
        </Tip>
        <RowMenu items={[{ heading: plural(count, 'tab', 'tabs') }, ...all]}>
          <span className="flex">
            <Tip label="Every tab">
              <button type="button" data-tab-all aria-label="Every tab" onClick={openFromGrip} className={ROUND}><ChevronDown /></button>
            </Tip>
          </span>
        </RowMenu>
      </span>
      {tail}
    </div>
  )
}
