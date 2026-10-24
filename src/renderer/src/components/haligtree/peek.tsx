import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { FLOAT } from '@/lib/float'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { realMove } from '@/lib/real-move'
import { splitLead } from './lead'
import { Pressed } from './ui'

/**
 * Notion's slash-menu preview, for anything whose name alone does not say
 * what it is: a small picture of the thing with made-up content in Haligtree's
 * voice, one bold line on what it is for, and its keys. The sidebar shows one
 * beside a page's row (page-peeks.tsx), the editor's `/` menu beside a block
 * (slash/slash-peek.tsx).
 *
 * Opaque, never blurred: backdrop blur does not draw in the main window.
 */

/** The card's own surface: the one floating material (lib/float.ts). */
export const PEEK_SURFACE = `w-[17rem] rounded-xl p-1.5 ${FLOAT}`

/** True while something is being carried: a list row, a note, a split. */
export const carrying = (): boolean => {
  const root = document.documentElement.dataset
  return 'dragging' in root || 'splitDrag' in root
}

/** Page previews switched off in Settings (home.tsx marks the page): no card on pointing. */
export const previewsOff = (): boolean => 'noPreviews' in document.documentElement.dataset

/** The picture, the line and the keys; `text` is `**Lead.** The rest.` */
export function PeekCard({ art, text, keys, fit = false, whole = false }: { art: ReactNode; text: string; keys?: string; /** As tall as the picture needs, up to the usual height: a block is often one line. */ fit?: boolean; /** A picture that fits whole: not faded at its foot. */ whole?: boolean }): React.JSX.Element {
  const { lead, rest } = splitLead(text)
  return (
    <div data-peek-card className="flex flex-col gap-0">
      {/* A picture of the thing, never a control: nothing in it can be reached. */}
      <div aria-hidden inert className={`pointer-events-none relative ${fit ? 'max-h-[8.75rem] min-h-[4rem]' : 'h-[8.75rem]'} overflow-hidden rounded-lg border border-foreground/[0.08] bg-background px-3 py-2.5 text-[10.5px] leading-[1.4] text-foreground select-none ${whole ? '' : '[mask-image:linear-gradient(to_bottom,black_calc(100%-1.25rem),rgb(0_0_0/0.25))]'}`}>
        {art}
      </div>
      <div className="flex items-end gap-2 px-1.5 pt-2 pb-1">
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-foreground/75">
          {lead && <strong className="font-semibold text-foreground">{lead}</strong>}
          {lead && rest && ' '}
          {rest}
        </p>
        {keys && <span className="flex shrink-0 gap-0.5 pb-px"><Pressed keys={keys} /></span>}
      </div>
    </div>
  )
}

/**
 * A row's preview, opened after the pointer rests on it a moment. Once one
 * is up, the next row's swaps in at once with no fade (the provider's skip
 * delay), the way tooltips do. A pointer at rest while the list moves under
 * it opens nothing (lib/real-move.ts), and nor does one carrying something.
 */
export function Peek({ art, text, keys, children }: { art: () => ReactNode; text: string; keys?: string; children: ReactElement }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  // Only for a resting pointer: Tab through the sidebar moves on without a
  // large card opening over the page at each stop (the row says its own name).
  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && !carrying() && !previewsOff() && !!trigger.current?.matches(':hover'))} delayDuration={450} disableHoverableContent>
      <TooltipTrigger asChild ref={trigger} onPointerMove={(event) => {
        if (!realMove(event) || event.buttons || carrying()) event.preventDefault()
      }}>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} collisionPadding={8}
        className={`block max-w-none gap-0 px-1.5 py-1.5 text-sm motion-reduce:animate-none has-data-[slot=kbd]:pr-1.5 ${PEEK_SURFACE}`}>
        {/* Drawn whenever the card is there, its fade out too: emptied on close, it shrank to a thin blank strip as it went. */}
        <PeekCard art={art()} text={text} keys={keys} />
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * A card beside a menu that is already open (the `/` menu, the Haligtree menu),
 * level with its chosen row: on the right where there is room, else on the
 * left, else under or over it, and never past the window's edges.
 */
export function BesidePeek({ menu: find, row, fresh, slashed = false, children }: {
  menu: () => HTMLElement | null; row: (menu: HTMLElement) => Element | null; fresh: boolean; slashed?: boolean; children: ReactNode
}): React.JSX.Element {
  const card = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const place = (): void => {
      // Read each time: the menu can be laid out after this card is.
      const menu = find()
      if (!menu) return
      const box = menu.getBoundingClientRect()
      const width = el.offsetWidth
      const height = el.offsetHeight
      const gap = 6
      const edge = 8
      const right = box.right + gap
      const left = box.left - gap - width
      const beside = right + width <= innerWidth - edge ? 'right' : left >= edge ? 'left' : null
      let x: number
      let y: number
      if (beside) {
        // Level with the chosen row, slid up or down to stay in the window.
        x = beside === 'right' ? right : left
        // A row scrolled out of the menu's own list is held to the menu's edge, never left floating where it was.
        const at = Math.min(Math.max(row(menu)?.getBoundingClientRect().top ?? box.top, box.top), box.bottom - 24)
        y = Math.min(Math.max(edge, at - 8), innerHeight - edge - height)
      } else {
        // A window too narrow for either side: under the menu, or over it.
        x = Math.min(Math.max(edge, box.left), innerWidth - edge - width)
        y = box.bottom + gap + height <= innerHeight - edge ? box.bottom + gap : box.top - gap - height
      }
      el.style.left = `${Math.max(edge, x)}px`
      el.style.top = `${Math.max(edge, y)}px`
      el.dataset.side = beside ?? (y > box.top ? 'bottom' : 'top')
    }
    place()
    // Once more after the menu has been moved into place.
    const frame = requestAnimationFrame(place)
    const watch = new ResizeObserver(place)
    const menu = find()
    if (menu) watch.observe(menu)
    // The menu moved, not resized: the page scrolled and its popup was placed
    // again by the caret (a style change, a moment after the scroll). Followed
    // here, so the card never stays where the menu used to be.
    const moved = new MutationObserver(place)
    for (let at: HTMLElement | null = menu; at && at !== document.body; at = at.parentElement) moved.observe(at, { attributes: true, attributeFilter: ['style'] })
    const later = (): void => void requestAnimationFrame(place)
    const scrolled = (): void => (place(), later())
    addEventListener('scroll', scrolled, true)
    addEventListener('resize', place)
    return () => (cancelAnimationFrame(frame), watch.disconnect(), moved.disconnect(), removeEventListener('scroll', scrolled, true), removeEventListener('resize', place))
  })
  return createPortal(
    <div ref={card} data-slash-peek={slashed ? '' : undefined} data-menu-peek={slashed ? undefined : ''} role="tooltip"
      className={`pointer-events-none fixed z-[60] ${PEEK_SURFACE} ${fresh ? 'mf-peek-in' : ''}`}>
      {children}
    </div>,
    document.body
  )
}

// --- the pieces the pictures are drawn with

/** A theme colour by name: `blue` is the theme's own blue. */
export const tinted = (tint: string): CSSProperties => ({ color: tint.startsWith('var(') ? tint : `var(--tt-color-text-${tint})` })
const wash = (tint: string, amount = 14): CSSProperties => ({ backgroundColor: `color-mix(in oklab, ${tint.startsWith('var(') ? tint : `var(--tt-color-text-${tint})`} ${amount}%, transparent)` })

/** A page's title, as the page sets it, smaller. */
export function MTitle({ children, count }: { children: ReactNode; count?: string | number }): React.JSX.Element {
  return (
    <div className="mb-1.5 flex items-baseline gap-1.5">
      <span className="text-[12.5px] font-semibold tracking-tight">{children}</span>
      {count !== undefined && <span className="text-[9.5px] text-muted-foreground tabular-nums">{count}</span>}
    </div>
  )
}

/** A plain heading over a group of rows, in sentence case. */
export function MLabel({ children, className = '' }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <div className={`mt-1.5 mb-0.5 text-[11px] font-semibold text-muted-foreground ${className}`}>{children}</div>
}

/** A list row: an icon or a box to tick, the words, and something at its end. */
export function MRow({ icon: Icon, tint = 'gray', check, children, meta, faded, struck }: {
  icon?: LucideIcon; tint?: string; check?: boolean | 'done'; children: ReactNode; meta?: ReactNode; faded?: boolean; struck?: boolean
}): React.JSX.Element {
  return (
    <div className={`flex items-center gap-1.5 border-b border-foreground/[0.06] py-[3px] last:border-b-0 ${faded ? 'opacity-55' : ''}`}>
      {check !== undefined && <MCheck done={check === 'done'} tint={tint} />}
      {Icon && <Icon className="size-3 shrink-0" style={tinted(tint)} strokeWidth={2.2} />}
      <span className={`min-w-0 flex-1 truncate ${struck ? 'line-through decoration-foreground/40' : ''}`}>{children}</span>
      {meta !== undefined && <span className="shrink-0 text-[9.5px] text-muted-foreground tabular-nums">{meta}</span>}
    </div>
  )
}

/** A task's round box, ticked or not. */
export function MCheck({ done = false, tint = 'gray' }: { done?: boolean; tint?: string }): React.JSX.Element {
  return (
    <span className="grid size-2.5 shrink-0 place-items-center rounded-full border" style={{ borderColor: tinted(tint).color, ...(done ? wash(tint, 70) : {}) }}>
      {done && <span className="size-1 rounded-full bg-background" />}
    </span>
  )
}

/** A small pill: a tag, a count, a state. */
export function MChip({ tint = 'gray', children, className = '' }: { tint?: string; children: ReactNode; className?: string }): React.JSX.Element {
  return <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-medium ${className}`} style={{ ...wash(tint), ...tinted(tint) }}>{children}</span>
}

/** A raised card inside the picture: a Review card, a tile. */
export function MCard({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }): React.JSX.Element {
  return <div className={`rounded-md border border-foreground/10 bg-card px-2 py-1.5 shadow-[0_2px_6px_-3px_rgb(0_0_0/0.3)] ${className}`} style={style}>{children}</div>
}

/** A line of grey bars standing in for text nobody needs to read. */
export function MLines({ widths = [92, 80, 60] }: { widths?: number[] }): React.JSX.Element {
  return <div className="flex flex-col gap-1 py-0.5">{widths.map((width, n) => <span key={n} className="h-1 rounded-full bg-foreground/[0.12]" style={{ width: `${width}%` }} />)}</div>
}
