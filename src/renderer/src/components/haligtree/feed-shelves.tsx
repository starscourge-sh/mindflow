import { useRef } from 'react'
import { ChevronLeft, ChevronRight, FileText, Heart } from 'lucide-react'

import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { openSource } from '@/lib/sources'
import { asideItem } from '@/lib/split'
import { still } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { dayjs } from '../../../../main/dates'
import type { Shelf, ShelfCard } from '../../../../main/feed'
import { Avatar } from './avatar'
import { useSideways } from './display'
import { Cover } from './note-list'
import { RowMenu } from './row-menu'
import { openTag } from './ui'

/** A card's width: about four to a row, the next one showing past the edge. */
const CARD = 180
const GAP = 16

/** How long it has been, in plain words: "4 weeks", "3 months", "a year". */
const quietFor = (at: string): string => {
  const weeks = dayjs().diff(dayjs(at), 'week')
  if (weeks < 8) return `${weeks} weeks`
  const months = dayjs().diff(dayjs(at), 'month')
  if (months < 12) return `${months} months`
  const years = dayjs().diff(dayjs(at), 'year')
  return years === 1 ? 'a year' : `${years} years`
}

/**
 * Rows of your own notes under Today's read, as a music app sets out more
 * by one artist: who or what they are from at the left with "Show all" at the
 * right, and a row of cards that scrolls sideways. Never anything from outside
 * your book.
 */
export function FeedShelves({ shelves, onOpen }: { shelves: Shelf[]; onOpen: (type: string, id: string) => void }): React.JSX.Element | null {
  if (!shelves.length) return null
  return (
    <div data-reading-shelves className="mb-4 flex w-full flex-col [contain:inline-size] gap-8 border-b pb-8 pt-4">
      {shelves.map((shelf) => <ShelfRow key={`${shelf.kind}:${shelf.name}`} shelf={shelf} onOpen={onOpen} />)}
    </div>
  )
}

function ShelfRow({ shelf, onOpen }: { shelf: Shelf; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const row = useSideways()
  const box = useRef<HTMLElement | null>(null)
  const over = shelf.kind === 'source' ? 'More from' : shelf.kind === 'liked' ? 'Because you liked' : `Not heard from in ${quietFor(shelf.last)}`
  const showAll = (): void => {
    chime('page')
    if (shelf.kind === 'liked') openTag(shelf.tag)
    else openSource('attribution', shelf.name)
  }
  const along = (way: 1 | -1): void => {
    const node = box.current
    if (!node) return
    chime('tap')
    // Whole cards at a time, one card's room left over so the reader keeps their place.
    const step = Math.max(CARD + GAP, Math.floor((node.clientWidth - CARD) / (CARD + GAP)) * (CARD + GAP))
    node.scrollBy({ left: way * step, behavior: still() ? 'auto' : 'smooth' })
  }
  return (
    <section data-reading-shelf={shelf.kind} data-shelf-name={shelf.name} className="flex flex-col gap-3">
      <header className="flex items-center gap-3">
        {shelf.kind === 'liked' ? (
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-[var(--tt-color-text-red)]"><Heart className="size-5" fill="currentColor" /></span>
        ) : (
          <span data-shelf-face className="shrink-0"><Avatar name={shelf.name} size={44} /></span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-control text-muted-foreground">{over}</span>
          <span data-shelf-title className="truncate font-heading text-[1.25rem] font-semibold leading-tight tracking-[-0.01em] text-foreground">{shelf.name}</span>
        </span>
        <button type="button" data-shelf-all onClick={showAll}
          className="shrink-0 rounded-md px-2 py-1 text-control font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
          Show all
        </button>
      </header>
      <div className="relative">
        <ol data-shelf-row ref={(node) => { box.current = node; row.ref(node) }} style={row.style} className={cn('flex', row.className)}>
          {shelf.cards.map((card, at) => (
            <li key={card.id} style={{ width: CARD, marginLeft: at ? GAP : 0 }}><Card card={card} onOpen={onOpen} /></li>
          ))}
        </ol>
        {/* Over the pictures, each only while there is more that way; they take no room, so nothing moves. */}
        <Along way={-1} shown={row.edges.left} onClick={() => along(-1)} />
        <Along way={1} shown={row.edges.right} onClick={() => along(1)} />
      </div>
    </section>
  )
}

function Along({ way, shown, onClick }: { way: 1 | -1; shown: boolean; onClick: () => void }): React.JSX.Element {
  const Icon = way > 0 ? ChevronRight : ChevronLeft
  return (
    <button type="button" data-shelf-along={way > 0 ? 'next' : 'back'} aria-label={way > 0 ? 'More' : 'Back'} aria-hidden={!shown} tabIndex={shown ? 0 : -1} onClick={onClick}
      style={{ top: CARD / 2 }}
      className={cn('absolute z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition-[opacity,background-color] duration-200 hover:bg-accent',
        way > 0 ? 'right-1' : 'left-1', shown ? 'opacity-100' : 'pointer-events-none opacity-0')}>
      <Icon className="size-4" />
    </button>
  )
}

const kindOf = (id: string): (typeof CAPTURE_TYPES)[number] => CAPTURE_TYPES.find((type) => type.id === id) ?? CAPTURE_TYPES[0]

/** One note: its picture, or its cover, square; its title; and what kind it is. */
function Card({ card, onOpen }: { card: ShelfCard; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const kind = kindOf(card.kind)
  const entry = { id: card.id, type: card.type, title: card.title, tags: [], icon: card.type === 'article' ? FileText : kind.icon, tint: kind.tint }
  const open = (): void => (chime('open'), onOpen(card.type, card.id))
  return (
    <RowMenu items={[{ label: 'Open', run: open }, asideItem(card.type, card.id)]}>
      <button type="button" data-shelf-card={card.id} data-shelf-type={card.type} onClick={open}
        className="group flex w-full flex-col gap-2 rounded-lg text-left">
        <Cover entry={entry} words={card.words} large className="aspect-square w-full rounded-lg border transition-[filter] duration-200 group-hover:brightness-[0.97]" />
        <span className="flex flex-col gap-0.5 px-0.5">
          <span data-shelf-card-title className="line-clamp-2 text-body font-medium leading-snug text-foreground group-hover:underline group-hover:decoration-foreground/30 group-hover:underline-offset-4">{card.title}</span>
          <span data-shelf-card-line className="truncate text-control text-muted-foreground">{card.line}</span>
        </span>
      </button>
    </RowMenu>
  )
}
