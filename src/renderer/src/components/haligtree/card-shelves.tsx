import { deckTitle } from './decks'
import { haligtree, useLive, type Settings } from '@/lib/haligtree'
import { useEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { still } from '@/lib/motion'
import { num } from '../../../../main/dates'
import { useSideways } from './display'
import { Flip } from './review-view'
import { tagTint } from './tag-icon'
import { GroupCover } from './group-cover'
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

/** A group's cover where it has no picture: its Coolshapes cover (group-cover.tsx), with no name on it, as the name is said beside it. */
export function Cover({ name, tint, className = '' }: { name: string; tint: string; className?: string }): React.JSX.Element {
  return <GroupCover name={name} tint={tint} label={null} className={className} />
}

/**
 * A quiet line figure for a card with no picture, in its tag's colour: one of
 * six families (a grid, arcs, waves, rings, steps, dots), picked and shaped by
 * the card itself, so a shelf of cards never repeats the same drawing.
 */
export function Figure({ id, tint }: { id: string; tint: string }): React.JSX.Element {
  const n = seed(id)
  const family = n % 6
  const count = 6 + ((n >>> 3) % 6)
  const shift = (n >>> 7) % 30
  const lines: React.ReactNode[] = []
  if (family === 0) for (let at = 0; at <= count; at++) lines.push(<line key={`v${at}`} x1={10 + at * (80 / count)} y1="5" x2={10 + at * (80 / count) + shift / 3} y2="45" />, <line key={`h${at}`} x1="10" y1={5 + at * (40 / count)} x2="90" y2={5 + at * (40 / count)} />)
  else if (family === 1) for (let at = 0; at < count; at++) lines.push(<path key={at} d={`M ${10 + at * 4} 48 A ${36 - at * 3} ${36 - at * 3} 0 0 1 ${82 - at * 2} 48`} />)
  else if (family === 2) for (let at = 0; at < count + 3; at++) { const y = 6 + at * (38 / (count + 3)); const bend = 4 + ((n >>> at) % 14); lines.push(<path key={at} d={`M0 ${y} C 30 ${y - bend}, 60 ${y + bend}, 100 ${y}`} />) }
  else if (family === 3) for (let at = 0; at < count + 2; at++) lines.push(<circle key={at} cx={30 + shift} cy="25" r={2.5 + at * 2.6} />)
  else if (family === 4) { let d = 'M 8 44'; for (let at = 0; at < count; at++) d += ` h ${84 / count} v ${-((((n >>> at) % 5) + 2) * 1.2)}`; for (let at = 0; at < 4; at++) lines.push(<path key={at} d={d} transform={`translate(0 ${-at * 3})`} />) }
  else for (let row = 0; row < 6; row++) for (let col = 0; col < 14; col++) { const r = 0.4 + (((n >>> ((row + col) % 20)) % 4) * 0.35); lines.push(<circle key={`${row}-${col}`} cx={8 + col * 6.4} cy={8 + row * 6.8} r={r} fill={tint} stroke="none" />) }
  return (
    <svg viewBox="0 0 100 50" aria-hidden data-figure={family} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      <g fill="none" stroke={tint} strokeWidth="0.6" opacity="0.8">{lines}</g>
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
export function Poster({ card, over, onTurn, picked, onPick, question, answer, size = 'md', ledge = false }: {
  card: BrowsedCard
  over: boolean
  onTurn: (over: boolean) => void
  picked: boolean
  onPick: (event: React.PointerEvent) => void
  question: React.ReactNode
  answer: string
  size?: 'sm' | 'md' | 'lg'
  /** Standing on a shelf: a band of bare paper at its foot for the glass ledge, its words above it. */
  ledge?: boolean
}): React.JSX.Element {
  const tint = cardTint(card)
  const lean = useLean()
  const stage = card.known ? 'known' : card.stage
  const where = [card.source, card.at].filter(Boolean).join(', ')
  const face = (side: 'front' | 'back', children: React.ReactNode): React.JSX.Element => (
    <div data-card-face={side} className={`mf-poster relative flex aspect-[4/5] w-full min-w-0 flex-col overflow-hidden rounded-lg ${size === 'lg' ? 'p-6' : ledge ? 'p-4 pb-12' : 'p-4'} ${picked ? 'ring-2 ring-[var(--tt-brand-color-400)]' : ''}`} style={{ '--tint': tint } as React.CSSProperties}>
      {children}
      <div className="mt-auto flex items-end justify-between gap-2 pt-2 text-[11px] leading-tight text-foreground/70">
        <span className="min-w-0 truncate">{where || (card.tags[0] ? deckTitle(card.tags[0]) : '')}</span>
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

/**
 * The group's cover drawn on its glass front, the shapes in its own tones over
 * the glass's tint (no page behind them), so a pocket says which it is at a
 * glance. `quiet` fades them where words sit on the glass.
 */
const Front = ({ name, tint, quiet = false }: { name: string; tint: string; quiet?: boolean }): React.JSX.Element => (
  <GroupCover name={name} tint={tint} label={null} className="pointer-events-none !absolute inset-0" style={{ background: 'transparent', opacity: quiet ? 0.45 : 0.9 }} />
)

/** Four screws, one in each corner of a glass front or ledge. */
const Screws = (): React.JSX.Element => (
  <>{['top-2 left-2', 'top-2 right-2', 'bottom-2 left-2', 'bottom-2 right-2'].map((at) => <span key={at} aria-hidden className={`mf-screw absolute ${at}`} />)}</>
)

/**
 * A group as a pocket: its cards fanned out of the top, the cover drawn from
 * its name at the back, a glass front in its colour with the count and what is
 * due on it. Pointed at, the fan opens and its cards come round in turn.
 */
export function Pocket({ name, title = name, cards, onOpen }: { name: string; /** Its name as shown: a deck's words, never its #tag. */ title?: string; cards: BrowsedCard[]; onOpen: () => void }): React.JSX.Element {
  const shapes = useLive(haligtree.settings, null as Settings | null)?.deckShapes === true
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
  const fresh = cards.filter((one) => !one.paused && one.stage === 'new').length
  const fan = [-8, -3, 3, 8]
  // By default a pocket is the Decks tab's tile: satin in the theme's ink, square, its count large; "Shapes on decks" brings back the coloured glass.
  if (!shapes)
    return (
      <button type="button" data-pocket={name} data-pocket-plain onClick={() => (chime('open'), onOpen())}
        className="mf-metal mf-metal-hover transition-transform duration-100 ease-out active:scale-[0.985] grid aspect-square min-w-0 cursor-pointer grid-rows-[minmax(0,1fr)_auto] gap-2 rounded-[5px] p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-baseline gap-1.5 self-start">
          <span className="font-serif text-4xl leading-none text-foreground tabular-nums">{num(due || cards.length)}</span>
          <span className="text-sm text-muted-foreground">{due ? 'due' : cards.length === 1 ? 'card' : 'cards'}</span>
          {due > 0 && <span aria-hidden className="mb-1 size-1.5 self-center rounded-full bg-primary" />}
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate font-serif text-base leading-tight text-foreground">{title}</span>
          <span className="truncate text-sm text-muted-foreground tabular-nums">{num(cards.length)} {cards.length === 1 ? 'card' : 'cards'}{due ? ` · ${num(due)} due` : fresh ? ` · ${num(fresh)} new` : ''}</span>
        </span>
      </button>
    )
  return (
    <button type="button" data-pocket={name} onClick={() => (chime('open'), onOpen())} onPointerEnter={() => setHover(true)} onPointerLeave={() => (setHover(false), setTurn(0))}
      className="group/pocket flex flex-col items-center gap-2 rounded-xl p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="relative h-52 w-full max-w-[15rem] [overflow-x:clip]">
        {/* The cover at the back, then up to three of its own cards, fanned. */}
        <div className="mf-fan absolute inset-x-12 top-1 h-40 overflow-hidden rounded-md shadow-sm" style={{ '--fan': `${fan[0]}deg`, '--fan-x': '-8%', zIndex: 1 } as React.CSSProperties}>
          <Cover name={name} tint={tint} className="h-full w-full" />
        </div>
        {shown.slice(0, 3).map((card, at) => {
          const order = (at + turn) % Math.min(3, shown.length)
          // Only the card in front shows its words; those behind show their drawing, so no clipped half-words.
          const front = order === Math.min(3, shown.length) - 1
          return (
            <div key={card.id} data-fan-front={front || undefined} className="mf-fan mf-poster absolute inset-x-12 top-3 flex h-40 flex-col gap-1 overflow-hidden rounded-md p-2.5 shadow-sm" style={{ '--tint': cardTint(card), '--fan': `${fan[order + 1]}deg`, '--fan-x': `${(order - 1) * 8}%`, zIndex: 2 + order } as React.CSSProperties}>
              {front
                ? <span className="line-clamp-4 font-heading text-[11px] font-semibold leading-snug text-foreground">{card.prompt.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim()}</span>
                : <div className="h-14 opacity-70"><Figure id={card.id} tint={cardTint(card)} /></div>}
              {front && card.picture && <img src={card.picture} alt="" onError={(event) => (event.currentTarget.hidden = true)} className="mt-auto max-h-14 w-full rounded-sm object-cover" />}
            </div>
          )
        })}
        {/* The glass front, in the group's colour, its cover's shapes on it. */}
        <div className="mf-glass absolute inset-x-0 bottom-0 z-10 flex h-[46%] flex-col justify-end overflow-hidden rounded-xl px-4 pb-3" style={{ '--tint': tint } as React.CSSProperties}>
          <Front name={name} tint={tint} />
          <Screws />
          {due > 0 && <span data-pocket-due className="relative self-end rounded-full bg-background/85 px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">{num(due)} due</span>}
        </div>
      </div>
      <span className="flex max-w-full items-baseline gap-1.5 text-control">
        <span className="truncate font-medium text-foreground">{title}</span>
        <span className="shrink-0 text-foreground/60 tabular-nums">· {num(cards.length)} {cards.length === 1 ? 'card' : 'cards'}</span>
      </span>
    </button>
  )
}

/**
 * A deck made by hand with no cards yet, as a pocket in the same look: its
 * cover behind the glass, no cards fanned, and the two ways to fill it.
 */
export function EmptyPocket({ deck, onPaste }: { deck: string; /** Paste cards into it, or (one) make a single card. */ onPaste: (one: boolean) => void }): React.JSX.Element {
  const name = `#${deck}`
  const tint = groupTint(name)
  const shapes = useLive(haligtree.settings, null as Settings | null)?.deckShapes === true
  if (!shapes)
    return (
      <div data-pocket={name} data-pocket-empty={deck} data-pocket-plain className="mf-metal grid aspect-square min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-2 rounded-[5px] p-3">
        <span className="flex flex-wrap content-start gap-1.5">
          <button type="button" data-pocket-make onClick={() => (chime('open'), onPaste(true))} className="h-8 cursor-pointer rounded-md border border-foreground/10 bg-background px-2.5 text-control font-medium text-foreground hover:bg-accent">Make a card</button>
          <button type="button" data-pocket-paste onClick={() => (chime('open'), onPaste(false))} className="h-8 cursor-pointer rounded-md border border-foreground/10 bg-background px-2.5 text-control font-medium text-foreground hover:bg-accent">Add many</button>
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate font-serif text-base leading-tight text-foreground">{deckTitle(deck)}</span>
          <span className="text-sm text-muted-foreground">Empty deck</span>
        </span>
      </div>
    )
  return (
    <div data-pocket={name} data-pocket-empty={deck} className="flex flex-col items-center gap-2 rounded-xl p-2">
      <div className="relative h-52 w-full max-w-[15rem] [overflow-x:clip]">
        <div className="absolute inset-x-12 top-1 h-40 overflow-hidden rounded-md opacity-60 shadow-sm"><Cover name={name} tint={tint} className="h-full w-full" /></div>
        <div className="mf-glass absolute inset-x-0 bottom-0 z-10 flex h-[46%] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl px-4" style={{ '--tint': tint } as React.CSSProperties}>
          <Front name={name} tint={tint} quiet />
          <Screws />
          <span className="relative text-control text-foreground">Make a card or add many at once</span>
          <span className="relative flex gap-1.5">
            <button type="button" data-pocket-paste onClick={() => (chime('open'), onPaste(false))} className="cursor-pointer rounded-md bg-background/85 px-2 py-0.5 text-xs font-medium text-foreground hover:bg-background">Add many</button>
            <button type="button" data-pocket-make onClick={() => (chime('open'), onPaste(true))} className="cursor-pointer rounded-md bg-background/85 px-2 py-0.5 text-xs font-medium text-foreground hover:bg-background">Make one</button>
          </span>
        </div>
      </div>
      <span className="flex max-w-full items-baseline gap-1.5 text-control">
        <span className="truncate font-medium text-foreground">{deckTitle(deck)}</span>
        <span className="shrink-0 text-foreground/60">· empty deck</span>
      </span>
    </div>
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
  // Its cards are made only while the shelf is within two screens of sight: 300 shelves cost 300 headings, not 7,000 cards.
  const shelf = useRef<HTMLElement | null>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const node = shelf.current
    if (!node) return
    const watch = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '200% 0px' })
    watch.observe(node)
    return () => watch.disconnect()
  }, [])
  const slide = (way: 1 | -1): void => {
    chime('tap')
    box.current?.scrollBy({ left: way * box.current.clientWidth * 0.8, behavior: still() ? 'auto' : 'smooth' })
  }
  return (
    <section ref={shelf} data-shelf={name} className="mt-6 first:mt-1">
      <header className="mb-2 flex items-baseline gap-3 px-1">
        <Cover name={name} tint={tint} className="size-12 shrink-0 self-center rounded-lg" />
        <button type="button" onClick={onOpen} className="min-w-0 truncate font-heading text-heading font-semibold text-foreground hover:underline">{name}</button>
        <span className="ml-auto shrink-0 text-control text-foreground/60 tabular-nums">{num(count)} {count === 1 ? 'card' : 'cards'}</span>
        <button type="button" aria-label="Back along" disabled={!row.edges.left} onClick={() => slide(-1)} className="rounded p-1 text-foreground/70 hover:bg-accent disabled:opacity-30"><ChevronLeft className="size-4" /></button>
        <button type="button" aria-label="On along" disabled={!row.edges.right} onClick={() => slide(1)} className="rounded p-1 text-foreground/70 hover:bg-accent disabled:opacity-30"><ChevronRight className="size-4" /></button>
      </header>
      <div className="relative">
        <div ref={(node) => { box.current = node; row.ref(node) }} style={row.style} className={`${row.className} flex min-h-[19rem] gap-4 px-4 pt-2 pb-2`}>{near ? children : null}</div>
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
  // Two a side, a clear gap between each; the next one out is there only to fade in from nothing.
  const near = cards.map((card, n) => ({ card, n })).filter(({ n }) => Math.abs(n - at) <= 3)
  return (
    <div data-flip-through className="relative flex h-[30rem] items-center justify-center overflow-hidden [perspective:1400px]">
      {near.map(({ card, n }) => {
        const off = n - at
        const side = Math.sign(off)
        const away = Math.abs(off)
        const transform = off === 0 ? 'translateX(0) translateZ(0) rotateY(0deg)' : `translateX(${side * (6 + away * 9.5)}rem) translateZ(-${100 + away * 60}px) rotateY(${-side * 48}deg)`
        return (
          <div key={card.id} data-flip-at={off} onClickCapture={(event) => off !== 0 && (event.stopPropagation(), chime('tap'), onAt(n))}
            aria-hidden={away > 2 || undefined} className={`mf-flow absolute w-64 ${away > 2 ? 'invisible' : ''}`} style={{ transform, zIndex: 100 - away, opacity: away > 2 ? 0 : 1 }}>
            {render(card, off === 0)}
            {/* Further out, further into the page's own colour: a solid veil, never see-through text. */}
            {away > 0 && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg bg-background" style={{ opacity: away * 0.28 }} />}
          </div>
        )
      })}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-control text-foreground/70 tabular-nums">{num(at + 1)} of {num(cards.length)} · ← → to move, Space turns it over</div>
    </div>
  )
}

/**
 * A long run of cards drawn only near the screen: cut into runs of 24, each
 * drawn while within a screen's height of what shows and kept, when away, as
 * an empty space of the height it last had. So a book of 5,000 cards scrolls as
 * one grid while only a few dozen cards exist at once.
 */
export function Windowed<T>({ items, render, className }: { items: T[]; render: (item: T) => React.ReactNode; className: string }): React.JSX.Element {
  const runs: T[][] = []
  for (let at = 0; at < items.length; at += 24) runs.push(items.slice(at, at + 24))
  // The height a drawn run took, for the runs not yet drawn.
  const usual = useRef(1200)
  // Each run's cards are made only when it is near: a far run costs one empty box.
  return <>{runs.map((run, at) => <Run key={at} first={at === 0} usual={usual} className={className} draw={() => run.map(render)} />)}</>
}

function Run({ first, usual, className, draw }: { first: boolean; usual: React.RefObject<number>; className: string; draw: () => React.ReactNode }): React.JSX.Element {
  const box = useRef<HTMLDivElement | null>(null)
  const [near, setNear] = useState(first)
  const [height, setHeight] = useState<number | null>(null)
  useEffect(() => {
    const node = box.current
    if (!node) return
    const watch = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting && node.offsetHeight) setHeight(node.offsetHeight)
      setNear(entry.isIntersecting)
    }, { rootMargin: '200% 0px' })
    watch.observe(node)
    return () => watch.disconnect()
  }, [])
  // The first run on screen, marked once drawn: the moment the page shows cards.
  useEffect(() => {
    if (first && near) performance.mark('cards:first-run')
  }, [first, near])
  // Measured once drawn, so the space it leaves when away is its own.
  useEffect(() => {
    if (near && box.current?.offsetHeight) usual.current = box.current.offsetHeight
  })
  return (
    <div ref={box} data-card-run={near ? 'drawn' : 'away'} className={near ? className : undefined} style={near ? undefined : { height: height ?? usual.current }}>
      {near ? draw() : null}
    </div>
  )
}
