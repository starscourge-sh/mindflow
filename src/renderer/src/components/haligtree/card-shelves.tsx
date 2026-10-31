import { useEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { still } from '@/lib/motion'
import { num } from '../../../../main/dates'
import { useSideways } from './display'
import { Flip } from './review-view'
import { tagTint } from './tag-icon'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { BrowsedCard } from './card-browser'

/**
 * All cards drawn as things you can pick up: pockets (one a deck or tag, its
 * cards fanned out of a glass front), shelves (a group's cards standing behind
 * a glass ledge in its colour), a plain grid of cards, and "Flip through" (a
 * cover flow of one group). Every card is a poster: the question large in the
 * serif, a snip's picture or a quiet figure drawn from its tag, and its source
 * small at the foot, on card stock tinted with its tag's colour.
 */

/** A number from words, the same each time: what the drawn covers and figures are seeded by. */
export const seed = (words: string): number => {
  let n = 2166136261
  for (const letter of words) n = Math.imul(n ^ letter.charCodeAt(0), 16777619)
  return n >>> 0
}

/** A group's colour: its tag's own, else one picked from its name. */
export const groupTint = (name: string): string => tagTint(name.replace(/^#/, '').split('-')[0] || name)

/** A card's colour: its first tag's, or its deck's. */
export const cardTint = (card: BrowsedCard): string => groupTint(card.tags[0] ?? card.source ?? card.id)

/**
 * A cover drawn from a name, for a group with no pictures: its first letters
 * set huge in outline, with arcs and rules placed by the name, so no two covers
 * match and none needs a picture (drawn here, so it ships).
 */
export function Cover({ name, tint, className = '' }: { name: string; tint: string; className?: string }): React.JSX.Element {
  const n = seed(name)
  const letters = name.replace(/^#/, '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2) || '?'
  const arcs = Array.from({ length: 3 }, (_, at) => ({ x: (n >> (at * 5)) % 100, y: (n >> (at * 7 + 3)) % 140, r: 18 + ((n >> (at * 3)) % 34) }))
  return (
    <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" aria-hidden className={className} style={{ background: `color-mix(in oklab, ${tint} 78%, black)` }}>
      <g fill="none" stroke={`color-mix(in oklab, ${tint} 55%, white)`} strokeWidth="2.2" strokeDasharray={n % 2 ? '7 4' : undefined}>
        {arcs.map((arc, at) => <circle key={at} cx={arc.x} cy={arc.y} r={arc.r} />)}
        <line x1="0" y1={(n % 60) + 40} x2="100" y2={((n >> 4) % 60) + 40} />
      </g>
      <text x="6" y="132" fontSize="78" fontWeight="700" fill="none" stroke={`color-mix(in oklab, ${tint} 40%, white)`} strokeWidth="1.6" style={{ fontFamily: 'var(--font-heading, serif)' }}>{letters}</text>
    </svg>
  )
}

/** A quiet line figure for a card with no picture: waves or rings, by the card, in its tag's colour. */
function Figure({ id, tint }: { id: string; tint: string }): React.JSX.Element {
  const n = seed(id)
  const rings = n % 3 === 0
  const lines = 9 + (n % 6)
  return (
    <svg viewBox="0 0 100 50" aria-hidden className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      <g fill="none" stroke={tint} strokeWidth="0.6" opacity="0.75">
        {rings
          ? Array.from({ length: lines }, (_, at) => <circle key={at} cx={35 + (n % 30)} cy="25" r={3 + at * 2.4} />)
          : Array.from({ length: lines }, (_, at) => {
              const y = 6 + at * (38 / lines)
              const bend = 6 + ((n >> at) % 12)
              return <path key={at} d={`M0 ${y} C 30 ${y - bend}, 60 ${y + bend}, 100 ${y}`} />
            })}
      </g>
    </svg>
  )
}

/**
 * Leans toward the pointer and lights where it is, as a card held under a lamp:
 * the lean eases (a spring-like curve), and with Reduce motion it stays flat.
 */
function useLean(): { ref: React.RefObject<HTMLDivElement | null>; handlers: React.HTMLAttributes<HTMLDivElement> } {
  const ref = useRef<HTMLDivElement | null>(null)
  const set = (x: number, y: number, on: boolean): void => {
    const node = ref.current
    if (!node) return
    node.style.setProperty('--rx', `${on ? (0.5 - y) * 10 : 0}deg`)
    node.style.setProperty('--ry', `${on ? (x - 0.5) * 12 : 0}deg`)
    node.style.setProperty('--mx', `${x * 100}%`)
    node.style.setProperty('--my', `${y * 100}%`)
    node.style.setProperty('--lit', on ? '1' : '0')
  }
  return {
    ref,
    handlers: {
      onPointerMove: (event) => {
        if (still()) return
        const box = event.currentTarget.getBoundingClientRect()
        set((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height, true)
      },
      onPointerLeave: () => set(0.5, 0.5, false)
    }
  }
}

/** When it is next asked, short. */
export function dueShort(card: BrowsedCard): string {
  if (card.paused) return 'paused'
  if (!card.dueAt) return 'new'
  const days = Math.round((new Date(card.dueAt).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
  return Date.parse(card.dueAt) <= Date.now() ? 'due now' : days <= 0 ? 'later today' : days === 1 ? 'tomorrow' : `in ${num(days)} days`
}

const STAGE_TINT: Record<string, string> = { new: 'var(--tt-color-text-blue)', learning: 'var(--tt-color-text-orange)', learnt: 'var(--tt-color-text-green)', known: 'var(--tt-color-text-purple)' }

/**
 * One card as a poster. A click (or Space with the focus on it) turns it over
 * to its answer; ⌘- and ⇧-click pick it. Only a known card (remembered after
 * 15 days) carries a sheen: its reward, and nothing else shines.
 */
export function Poster({ card, over, onTurn, picked, onPick, question, answer, size = 'md' }: {
  card: BrowsedCard
  over: boolean
  onTurn: (over: boolean) => void
  picked: boolean
  onPick: (event: React.PointerEvent) => void
  question: React.ReactNode
  answer: string
  size?: 'sm' | 'md' | 'lg'
}): React.JSX.Element {
  const tint = cardTint(card)
  const lean = useLean()
  const stage = card.known ? 'known' : card.stage
  const where = [card.source, card.at].filter(Boolean).join(', ')
  const face = (side: 'front' | 'back', children: React.ReactNode): React.JSX.Element => (
    <div data-card-face={side} className={`mf-poster relative flex aspect-[4/5] w-full min-w-0 flex-col overflow-hidden rounded-lg ${size === 'lg' ? 'p-6' : 'p-4'} ${picked ? 'ring-2 ring-[var(--tt-brand-color-400)]' : ''}`} style={{ '--tint': tint } as React.CSSProperties}>
      {children}
      <div className="mt-auto flex items-end justify-between gap-2 pt-2 text-[11px] leading-tight text-foreground/70">
        <span className="min-w-0 truncate">{where || (card.tags[0] ? `#${card.tags[0]}` : '')}</span>
        <span className="flex shrink-0 items-center gap-1">
          {dueShort(card) !== 'new' && <span>{dueShort(card)}</span>}
          <span data-card-stage className="flex items-center gap-1"><span aria-hidden className="size-1.5 rounded-full" style={{ background: STAGE_TINT[stage] }} />{stage}</span>
        </span>
      </div>
      {/* The lamp: a soft light where the pointer is. */}
      <span aria-hidden className="mf-poster-lamp pointer-events-none absolute inset-0" />
      {card.known && <span aria-hidden data-card-sheen className="mf-poster-sheen pointer-events-none absolute inset-0" />}
    </div>
  )
  return (
    <div ref={lean.ref} {...lean.handlers} data-pick={`nugget:${card.id}`} tabIndex={0} role="button" aria-selected={picked} aria-label={card.prompt} data-turned={over || undefined}
      className={`mf-lean min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring ${card.paused ? 'opacity-60' : ''}`}
      onPointerUpCapture={(event) => (event.metaKey || event.shiftKey) && (event.stopPropagation(), onPick(event))}>
      <Flip over={over} onTurn={(to) => (chime('tap'), onTurn(to))}
        front={face('front', <>
          <div className={`font-heading font-semibold leading-[1.15] text-pretty text-foreground ${size === 'lg' ? 'text-2xl line-clamp-5' : size === 'sm' ? 'text-sm line-clamp-4' : 'text-[1.05rem] line-clamp-4'}`}>{question}</div>
          {/* Laid in, not sized by: a picture or figure never widens the card. */}
          <div className="relative my-3 min-h-0 flex-1">
            {card.picture ? <img src={card.picture} alt="" onError={(event) => (event.currentTarget.hidden = true)} className="absolute inset-0 h-full w-full rounded object-cover" /> : <div className="absolute inset-0"><Figure id={card.id} tint={tint} /></div>}
          </div>
        </>)}
        back={face('back', <>
          {card.picture && <img src={card.picture} alt="" onError={(event) => (event.currentTarget.hidden = true)} className="-mx-4 -mt-4 mb-3 max-h-[55%] w-[calc(100%+2rem)] max-w-none object-cover" />}
          <p className={`text-foreground/90 ${size === 'lg' ? 'text-lg leading-relaxed line-clamp-[10]' : 'text-sm leading-relaxed line-clamp-[8]'}`}>{answer || 'No answer yet'}</p>
        </>)} />
    </div>
  )
}

/** Four screws, one in each corner of a glass front or ledge. */
const Screws = (): React.JSX.Element => (
  <>{['top-2 left-2', 'top-2 right-2', 'bottom-2 left-2', 'bottom-2 right-2'].map((at) => <span key={at} aria-hidden className={`mf-screw absolute ${at}`} />)}</>
)

/**
 * A group as a pocket: its cards fanned out of the top, the cover drawn from
 * its name at the back, a glass front in its colour with the count and what is
 * due on it. Pointed at, the fan opens and its cards come round in turn.
 */
export function Pocket({ name, cards, onOpen }: { name: string; cards: BrowsedCard[]; onOpen: () => void }): React.JSX.Element {
  const tint = groupTint(name)
  const [turn, setTurn] = useState(0)
  const [hover, setHover] = useState(false)
  const shown = cards.slice(0, 4)
  // Pointed at, the front card goes to the back every 1.6 s, as a hand riffles a pack.
  useEffect(() => {
    if (!hover || shown.length < 2 || still()) return
    const every = setInterval(() => setTurn((at) => at + 1), 1600)
    return () => clearInterval(every)
  }, [hover, shown.length])
  const due = cards.filter((one) => !one.paused && one.dueAt && Date.parse(one.dueAt) <= Date.now()).length
  const fan = [-11, -4, 4, 11]
  return (
    <button type="button" data-pocket={name} onClick={() => (chime('open'), onOpen())} onPointerEnter={() => setHover(true)} onPointerLeave={() => (setHover(false), setTurn(0))}
      className="group/pocket flex flex-col items-center gap-2 rounded-xl p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="relative h-52 w-full max-w-[15rem]">
        {/* The cover at the back, then up to three of its own cards, fanned. */}
        <div className="mf-fan absolute inset-x-12 top-1 h-40 overflow-hidden rounded-md shadow-sm" style={{ '--fan': `${fan[0]}deg`, '--fan-x': '-12%', zIndex: 1 } as React.CSSProperties}>
          <Cover name={name} tint={tint} className="h-full w-full" />
        </div>
        {shown.slice(0, 3).map((card, at) => {
          const order = (at + turn) % Math.min(3, shown.length)
          return (
            <div key={card.id} className="mf-fan mf-poster absolute inset-x-12 top-3 flex h-40 flex-col gap-1 overflow-hidden rounded-md p-2.5 shadow-sm" style={{ '--tint': cardTint(card), '--fan': `${fan[order + 1]}deg`, '--fan-x': `${(order - 1) * 11}%`, zIndex: 2 + order } as React.CSSProperties}>
              <span className="line-clamp-4 font-heading text-[11px] font-semibold leading-snug text-foreground">{card.prompt.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim()}</span>
              {card.picture && <img src={card.picture} alt="" onError={(event) => (event.currentTarget.hidden = true)} className="mt-auto max-h-14 w-full rounded-sm object-cover" />}
            </div>
          )
        })}
        {/* The glass front, in the group's colour, its feet showing through. */}
        <div className="mf-glass absolute inset-x-0 bottom-0 z-10 flex h-[46%] flex-col justify-end rounded-xl px-4 pb-3" style={{ '--tint': tint } as React.CSSProperties}>
          <Screws />
          {due > 0 && <span data-pocket-due className="self-end rounded-full bg-background/85 px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">{num(due)} due</span>}
        </div>
      </div>
      <span className="flex max-w-full items-baseline gap-1.5 text-control">
        <span className="truncate font-medium text-foreground">{name}</span>
        <span className="shrink-0 text-foreground/60 tabular-nums">· {num(cards.length)} {cards.length === 1 ? 'card' : 'cards'}</span>
      </span>
    </button>
  )
}

/**
 * A group as a shelf: its name and count, ‹ › to slide along, and its cards
 * standing behind a glass ledge in its colour. A long group shows its first
 * cards and a last one that opens the rest.
 */
export function Shelf({ name, count, onOpen, children }: { name: string; count: number; onOpen?: () => void; children: React.ReactNode }): React.JSX.Element {
  const row = useSideways()
  const box = useRef<HTMLDivElement | null>(null)
  const tint = groupTint(name)
  const slide = (way: 1 | -1): void => {
    chime('tap')
    box.current?.scrollBy({ left: way * box.current.clientWidth * 0.8, behavior: still() ? 'auto' : 'smooth' })
  }
  return (
    <section data-shelf={name} className="mf-shelf mt-6 first:mt-1">
      <header className="mb-2 flex items-baseline gap-3 px-1">
        <button type="button" onClick={onOpen} className="min-w-0 truncate font-heading text-heading font-semibold text-foreground hover:underline">{name}</button>
        <span className="ml-auto shrink-0 text-control text-foreground/60 tabular-nums">{num(count)} {count === 1 ? 'card' : 'cards'}</span>
        <button type="button" aria-label="Back along" disabled={!row.edges.left} onClick={() => slide(-1)} className="rounded p-1 text-foreground/70 hover:bg-accent disabled:opacity-30"><ChevronLeft className="size-4" /></button>
        <button type="button" aria-label="On along" disabled={!row.edges.right} onClick={() => slide(1)} className="rounded p-1 text-foreground/70 hover:bg-accent disabled:opacity-30"><ChevronRight className="size-4" /></button>
      </header>
      <div className="relative">
        <div ref={(node) => { box.current = node; row.ref(node) }} style={row.style} className={`${row.className} flex gap-4 px-4 pt-2 pb-2`}>{children}</div>
        <div aria-hidden className="mf-glass mf-ledge pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-xl" style={{ '--tint': tint } as React.CSSProperties}><Screws /></div>
      </div>
    </section>
  )
}

/**
 * "Flip through": one group as a cover flow. The card in the middle stands
 * flat and large; the rest lean away on each side and fade. ← and → (or a
 * click on one) bring the next to the middle, Space turns it over.
 */
export function FlipThrough({ cards, render, at, onAt }: { cards: BrowsedCard[]; render: (card: BrowsedCard, centre: boolean) => React.ReactNode; at: number; onAt: (at: number) => void }): React.JSX.Element {
  const near = cards.map((card, n) => ({ card, n })).filter(({ n }) => Math.abs(n - at) <= 5)
  return (
    <div data-flip-through className="relative flex h-[30rem] items-center justify-center overflow-hidden [perspective:1400px]">
      {near.map(({ card, n }) => {
        const off = n - at
        const side = Math.sign(off)
        const transform = off === 0 ? 'translateX(0) translateZ(0) rotateY(0deg)' : `translateX(${side * (11 + Math.abs(off) * 5.5)}rem) translateZ(-${120 + Math.abs(off) * 40}px) rotateY(${-side * 52}deg)`
        return (
          <div key={card.id} data-flip-at={off} onClickCapture={(event) => off !== 0 && (event.stopPropagation(), chime('tap'), onAt(n))}
            className="mf-flow absolute w-64" style={{ transform, zIndex: 100 - Math.abs(off), opacity: Math.max(0, 1 - Math.abs(off) * 0.18) }}>
            {render(card, off === 0)}
          </div>
        )
      })}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-control text-foreground/70 tabular-nums">{num(at + 1)} of {num(cards.length)} · ← → to move, Space turns it over</div>
    </div>
  )
}
