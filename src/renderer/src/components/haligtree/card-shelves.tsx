import { CoveredPicture } from './picture-cards'
import { GroupCover } from './group-cover'
import { small } from '@/lib/small-picture'
import { Decoded } from './ui'
import { deckTitle } from './decks'
import { useEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { still } from '@/lib/motion'
import { num } from '../../../../main/dates'
import { Flip } from './review-view'
import { tagTint } from './tag-icon'
import type { BrowsedCard } from './card-browser'

/**
 * All cards drawn as cards: a grid of single card faces, and "Flip through"
 * (a cover flow of the cards on show). Never a stack: a stack is a deck, on
 * the Decks tab. Every card is a poster: the question large in the
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
      <div className={`${side === 'front' ? 'mt-3' : 'mt-auto pt-2'} flex items-end justify-between gap-2 text-[11px] leading-tight text-muted-foreground`}>
        <span className="min-w-0 truncate">{where || (card.tags[0] ? deckTitle(card.tags[0]) : '')}</span>
        <span className="flex shrink-0 items-center gap-1">
          {dueShort(card) !== 'new' && <span>{dueShort(card)}</span>}
          <span data-card-stage className="flex items-center gap-1"><span aria-hidden className="size-1.5 rounded-full shrink-0" style={{ background: STAGE_TINT[stage] }} />{stage}</span>
        </span>
      </div>
      {/* The lamp: a soft light where the pointer is. */}
      <span aria-hidden className="mf-poster-lamp pointer-events-none absolute inset-0" />
      {card.known && <span aria-hidden data-card-sheen className="mf-poster-sheen pointer-events-none absolute inset-0" />}
    </div>
  )
  return (
    <div ref={lean.ref} {...lean.handlers} data-pick={`nugget:${card.id}`} tabIndex={0} role="button" aria-selected={picked} aria-label={card.prompt} data-turned={over || undefined} data-set-aside={card.paused ? '' : undefined}
      className="mf-lean min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onPointerUpCapture={(event) => (event.metaKey || event.shiftKey) && (event.stopPropagation(), onPick(event))}>
      <Flip over={over} onTurn={(to) => (chime('tap'), onTurn(to))}
        front={face('front', <>
          <div className={`font-heading font-semibold leading-[1.15] text-pretty text-foreground ${size === 'lg' ? 'text-2xl line-clamp-5' : size === 'sm' ? 'text-sm line-clamp-4' : 'text-[1.05rem] line-clamp-4'}`}>{question}</div>
          {/* Laid in, not sized by: a picture or figure never widens the card. One size on every card and
              always at the foot, above the deck's name, however long the question is. */}
          <div className="relative mt-auto h-[40%] shrink-0">
            {card.occlusion ? <div className="absolute inset-0 grid place-items-center overflow-hidden rounded"><CoveredPicture occlusion={card.occlusion} shown={false} all={card.occlusion.hide === 'all'} fit="max-h-full" /></div>
              : card.picture ? <Decoded src={small(card.picture, 640)} onError={(event) => (event.currentTarget.hidden = true)} className="absolute inset-0 h-full w-full rounded object-cover" />
              // No picture: a Coolshape in the card's colour, as groups and decks wear, never a line drawing.
              : <GroupCover name={card.id} tint={tint} label={null} lone className="absolute inset-0 rounded" />}
          </div>
        </>)}
        back={face('back', <>
          {card.occlusion ? <div className="mb-3 grid max-h-[55%] place-items-center overflow-hidden rounded"><CoveredPicture occlusion={card.occlusion} shown all={card.occlusion.hide === 'all'} fit="max-h-full" /></div>
            : card.picture && <Decoded src={small(card.picture, 640)} onError={(event) => (event.currentTarget.hidden = true)} className="-mx-4 -mt-4 mb-3 max-h-[55%] w-[calc(100%+2rem)] max-w-none object-cover" />}
          <p className={`text-foreground ${size === 'lg' ? 'text-lg leading-relaxed line-clamp-[10]' : 'text-sm leading-relaxed line-clamp-[8]'}`}>{answer || 'No answer yet'}</p>
        </>)} />
    </div>
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
      <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-control text-muted-foreground tabular-nums">{num(at + 1)} of {num(cards.length)} · ← → to move, Space turns it over</div>
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
