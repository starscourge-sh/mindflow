import { Lean } from './lean'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowRightIcon from '@/components/ui/arrow-narrow-right-icon'
import BookIcon from '@/components/ui/book-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import RightChevronIcon from '@/components/ui/right-chevron'
import QuestionMarkIcon from '@/components/ui/question-mark'
import BookmarkIcon from '@/components/ui/bookmark-icon'
import RefreshIcon from '@/components/ui/refresh-icon'

import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { useCaptures } from '@/components/capture-list'
import { textOf } from '@/components/rot-cards'
import { chime } from '@/lib/sound'
import { issues, type Repeat } from '@/lib/issues'
import { openWindow, smallPicture, useThumb } from '@/lib/notes'
import { placed } from '@/lib/tasks'
import { splitTags, useLive, vigil, whenInLine, type Pin as Pinned, type Settings, type Task } from '@/lib/vigil'
import { MenuButton, useTint } from './collection-header'
import { ReadThrough, type Readable } from './read-through'
import { RowMenu, type MenuItem } from './row-menu'
import { tagColour } from './tag-read'
import { completeTask } from './tasks-view'
import { Empty, Pressed, Tip } from './ui'
import { byKeys } from '@/lib/motion'
import { KindBack, backLine, type Returning } from './kind-back'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowRight = alive(ArrowNarrowRightIcon)
const BookOpen = alive(BookIcon)
const Check = alive(SimpleCheckedIcon)
const ChevronLeft = alive(RightChevronIcon, 'rotate-180')
const ChevronRight = alive(RightChevronIcon)
const Orbit = alive(QuestionMarkIcon)
const Pin = alive(BookmarkIcon)
const Repeat2 = alive(RefreshIcon)

/**
 * Home: where things come back to you. Laid out the way a music app's home
 * is, because the job is the same: a few tiles to jump back to, one thing
 * picked for today, then what is worth another look. Each part takes the
 * shape of what it holds: tasks as a list you can tick, kept words as
 * quotes, pictures as pictures. Read from your own notes only, never as a
 * count to clear.
 */

type Kind = 'capture' | 'nugget' | 'article' | 'question' | 'task'
type Card = { type: Kind; id: string; title: string; kind: string; private: number; at: string; excerpt?: string; sub?: string; clue?: string | null; count?: number; foot?: ReactNode }
type HomeData = {
  opened: Card[]
  edited: Card[]
  due: Card[]
  unseen: Card[]
  questions: Card[]
  tags: { tag: string; color: string | null; cards: Card[] }[]
  week: Card[]
  memory: (Card & { memory: string }) | null
  article: Card | null
  returning: Returning[]
}
const NONE: HomeData = { opened: [], edited: [], due: [], unseen: [], questions: [], tags: [], week: [], memory: null, article: null, returning: [] }
const home = (): Promise<HomeData> => window.api.vigil('home') as Promise<HomeData>

const CHIPS = [
  { id: 'all', label: 'All', keep: () => true },
  { id: 'notes', label: 'Notes', keep: (type: Kind) => type === 'capture' },
  { id: 'nuggets', label: 'Nuggets', keep: (type: Kind) => type === 'nugget' || type === 'article' },
  { id: 'questions', label: 'Questions', keep: (type: Kind) => type === 'question' },
  { id: 'tasks', label: 'Tasks', keep: (type: Kind) => type === 'task' }
] as const
type Chip = (typeof CHIPS)[number]['id']

const KIND_NAME: Record<Kind, string> = { capture: 'Note', nugget: 'Nugget', article: 'Article', question: 'Question', task: 'Task' }
const kindOf = (card: Pick<Card, 'type' | 'kind'>): (typeof CAPTURE_TYPES)[number] =>
  CAPTURE_TYPES.find((type) => type.id === (card.type === 'task' ? 'todo' : card.kind)) ?? CAPTURE_TYPES[0]
/** A kept thing's colour is its tier's, as the sidebar gives Nuggets, Articles and Holding theirs. */
const tintOf = (card: Pick<Card, 'type' | 'kind'>): string =>
  card.type === 'nugget' ? 'var(--tt-color-text-pink)' : card.type === 'article' ? 'var(--tt-color-text-brown)' : card.type === 'question' ? 'var(--tt-color-text-gray)' : kindOf(card).tint
const kindLabel = (card: Card): string => (card.type === 'capture' ? kindOf(card).label : KIND_NAME[card.type])
/** A card's name without its `#tags`: the heading over it says those. */
const nameOf = (card: Pick<Card, 'title'>): string => splitTags(card.title).text || card.title || 'Untitled'
/** A few words after the name, tags out: they are said elsewhere. */
const wordsOf = (text?: string): string => (text ? splitTags(text).text : '')
const readable = (card: Card): boolean => card.type !== 'task'
const motionOff = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

/** A note's first picture, full size; a video's first frame. Private ones show none. */
function usePicture(card: Pick<Card, 'id' | 'private' | 'type'>): string | undefined {
  const src = useThumb(card.type === 'task' ? '' : card.id)
  const video = !!src && /\.(mp4|m4v|mov|webm)$/i.test(src)
  const [frame, setFrame] = useState<string>()
  useEffect(() => void (video && src && smallPicture(src).then((made) => setFrame(made || undefined))), [src, video])
  // A private note keeps its picture, blurred like its name until you point at it, as lists do.
  if (!src) return undefined
  return video ? frame : src
}

/** A picture that steps aside when it cannot load, so the card falls back to words. */
function Picture({ src, className = '', onBroken }: { src: string; className?: string; onBroken: () => void }): React.JSX.Element {
  return <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={onBroken} className={`private-text size-full object-cover ${className}`} />
}

/** The kind's icon on a soft square of its colour: what a tile shows with no picture. */
function KindMark({ card, className = '' }: { card: Card; className?: string }): React.JSX.Element {
  const Icon = card.type === 'question' ? Orbit : kindOf(card).icon
  const tint = tintOf(card)
  return (
    <span className={`flex items-center justify-center ${className}`} style={{ background: `color-mix(in oklab, ${tint} 16%, transparent)` }}>
      <Icon className="size-4" style={{ color: tint }} aria-hidden />
    </span>
  )
}

/** Read, as a round button: what a card or tile offers on hover. 30px, its tip kept clear of it. */
function RoundRead({ onRead, className = '' }: { onRead: () => void; className?: string }): React.JSX.Element {
  return (
    <Tip label="Read" offset={6}>
      <button
        type="button"
        tabIndex={-1}
        onClick={(event) => (event.stopPropagation(), onRead())}
        className={`flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_rgb(0_0_0/0.45)] transition-[opacity,translate,scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:scale-[1.04] active:scale-[0.95] ${className}`}
      >
        <BookOpen className="size-3.5" />
      </button>
    </Tip>
  )
}

type Actions = { open: (card: Card) => void; read: (cards: Card[], at: number) => void }
const menuFor = (card: Card, { open, read }: Actions, list: Card[], at: number): MenuItem[] => [
  { label: 'Open', run: () => open(card) },
  card.type !== 'task' && { label: 'Open in a new window', run: () => openWindow(card.type, card.id) },
  readable(card) && { label: 'Read', run: () => read(list, at) }
]

/** One quick tile: its picture or kind at the left, the name in bold, Read sliding in at the right. */
function Tile({ card, pinned, actions, onHover }: { card: Card; pinned: boolean; actions: Actions; onHover: (look: { src?: string; colour: string } | null) => void }): React.JSX.Element {
  const src = usePicture(card)
  const [broken, setBroken] = useState(false)
  const look = { src: broken ? undefined : src, colour: tintOf(card) }
  return (
    <RowMenu items={menuFor(card, actions, [card], 0)}>
      <div className="group/tile relative min-w-0" onPointerEnter={() => onHover(look)} onPointerLeave={() => onHover(null)}>
        <Lean by={3}>
        <button
          type="button"
          data-nav
          data-private={card.private ? '' : undefined}
          onFocus={() => onHover(look)}
          onBlur={() => onHover(null)}
          onClick={() => actions.open(card)}
          className="flex h-12 w-full min-w-0 items-center gap-3 overflow-hidden rounded-md bg-foreground/[0.05] pr-10 text-left outline-none transition-colors duration-150 hover:bg-foreground/[0.09] focus-visible:bg-foreground/[0.09] focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {src && !broken
            ? <span className="aspect-square h-full shrink-0 overflow-hidden shadow-[2px_0_10px_-4px_rgb(0_0_0/0.3)]"><Picture src={src} onBroken={() => setBroken(true)} /></span>
            : <KindMark card={card} className="aspect-square h-full shrink-0" />}
          <span className="private-text line-clamp-2 min-w-0 flex-1 text-control leading-tight font-medium [overflow-wrap:anywhere] text-foreground">{nameOf(card)}</span>
          {pinned && <Pin className="absolute right-3 size-3.5 rotate-45 text-muted-foreground transition-opacity group-focus-within/tile:opacity-0 group-hover/tile:opacity-0" aria-label="Pinned" />}
        </button>
        {readable(card) && (
          <RoundRead onRead={() => actions.read([card], 0)}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 translate-x-1 opacity-0 group-focus-within/tile:translate-x-0 group-focus-within/tile:opacity-100 group-hover/tile:translate-x-0 group-hover/tile:opacity-100" />
        )}
        </Lean>
      </div>
    </RowMenu>
  )
}

/**
 * A card on a sideways row. With a picture, the picture is the card and the
 * name sits under it; without one, the words are the card: the first line
 * set larger, a few words after it, the date small. Never both. Every card
 * in a row is as tall as the tallest, its date at the foot, so dates line up.
 */
function RowCard({ card, list, at, actions, tag }: { card: Card; list: Card[]; at: number; actions: Actions; tag?: { name: string; colour: string } }): React.JSX.Element {
  const src = usePicture(card)
  const [broken, setBroken] = useState(false)
  const picture = !!src && !broken
  return (
    <RowMenu items={menuFor(card, actions, list, at)}>
      <div className="group/card relative flex w-(--card) shrink-0 snap-start">
        <Lean className="flex w-full" inner="flex">
        <button
          type="button"
          data-nav
          data-private={card.private ? '' : undefined}
          onClick={() => actions.open(card)}
          className={`flex w-full flex-col text-left outline-none transition-[background-color,scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.985] ${picture ? 'gap-2 rounded-xl bg-foreground/[0.04] p-1.5 hover:bg-foreground/[0.07]' : 'min-h-[7.5rem] gap-1.5 overflow-hidden rounded-xl bg-foreground/[0.04] p-3.5 hover:bg-foreground/[0.07]'}`}
        >
          {picture ? (
            <>
              <span className="relative aspect-square w-full overflow-hidden rounded-lg shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)]">
                <Picture src={src} onBroken={() => setBroken(true)} />
                {/* A mix's name bar, the way a music app labels its mixes: the tag, in its colour. */}
                {tag && <span className="absolute inset-x-0 bottom-0 truncate px-2.5 py-1 text-xs font-semibold text-white" style={{ background: tag.colour }}>{tag.name}</span>}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 pb-2">
                <span className="private-text line-clamp-2 text-control leading-snug font-medium [overflow-wrap:anywhere] text-foreground">{nameOf(card)}</span>
                {card.sub && <span className="mt-auto truncate pt-1 text-xs text-muted-foreground">{card.sub}</span>}
              </span>
            </>
          ) : (
            <>
              {/* Its right end left free for Read, which sits level with it. */}
              <span className="flex min-w-0 items-center gap-1.5 pr-8 text-xs text-muted-foreground">
                <KindMark card={card} className="size-5 rounded-[5px] [&_svg]:size-3" />
                {kindLabel(card)}
              </span>
              <span className="private-text line-clamp-3 text-[0.9375rem] leading-snug font-semibold [overflow-wrap:anywhere] text-foreground">{nameOf(card)}</span>
              {wordsOf(card.excerpt) && <span className="private-text line-clamp-3 text-xs [overflow-wrap:anywhere] leading-relaxed text-muted-foreground">{wordsOf(card.excerpt)}</span>}
              {/* The date at the foot, the tag at its end: down here Read never covers it. */}
              {(card.sub || tag) && (
                <span className="mt-auto flex min-w-0 items-center gap-2 pt-1 text-xs text-muted-foreground/80">
                  <span className="truncate">{card.sub}</span>
                  {tag && <span className="ml-auto max-w-[60%] shrink-0 truncate font-medium" style={{ color: tag.colour }}>{tag.name}</span>}
                </span>
              )}
            </>
          )}
        </button>
        {readable(card) && (
          // Over the picture's corner, 8px in from both edges and above the tag's bar; on words, level with the kind.
          <span className={`pointer-events-none absolute flex justify-end ${picture ? `inset-x-1.5 top-1.5 aspect-square items-end p-2 ${tag ? 'pb-8' : ''}` : 'top-[9px] right-[9px]'}`}>
            <RoundRead onRead={() => actions.read(list, at)}
              className="pointer-events-auto translate-y-1 opacity-0 group-focus-within/card:translate-y-0 group-focus-within/card:opacity-100 group-hover/card:translate-y-0 group-hover/card:opacity-100" />
          </span>
        )}
        </Lean>
      </div>
    </RowMenu>
  )
}

/** A part's heading: plain, smaller than a page title, with Show all at its end. */
function Heading({ title, onAll }: { title: ReactNode; onAll?: () => void }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="min-w-0 flex-1 truncate font-heading text-heading font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
      {onAll && (
        <button type="button" onClick={() => (chime('tap'), onAll())}
          className="shrink-0 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          Show all
        </button>
      )}
    </div>
  )
}

/** A row that scrolls sideways, with › and ‹ on hover and its edges faded where there is more. */
function Row({ title, onAll, children }: { title: ReactNode; onAll?: () => void; children: ReactNode }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  // Where the row is, for the dot track under it: what share is in view, and from where.
  const [span, setSpan] = useState({ from: 0, to: 1 })
  // As the row slides, each dot it lights is a bead of sound; never more than one a frame.
  const lastLit = useRef(-1)
  const measure = (): void => {
    const box = scroller.current
    if (!box) return
    const lit = Math.round((box.scrollLeft / Math.max(1, box.scrollWidth - box.clientWidth)) * 15)
    if (lastLit.current >= 0 && lit !== lastLit.current) chime('bead')
    lastLit.current = lit
    setEdges({ left: box.scrollLeft > 2, right: box.scrollLeft + box.clientWidth < box.scrollWidth - 2 })
    setSpan({ from: box.scrollLeft / box.scrollWidth, to: (box.scrollLeft + box.clientWidth) / box.scrollWidth })
  }
  useLayoutEffect(() => {
    measure()
    const box = scroller.current
    if (!box) return
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    return () => watch.disconnect()
  }, [children])
  const page = (by: -1 | 1): void => {
    const box = scroller.current
    if (!box) return
    chime('riffle')
    box.scrollBy({ left: by * box.clientWidth * 0.8, behavior: motionOff() ? 'auto' : 'smooth' })
  }
  const mask = `linear-gradient(to right, ${edges.left ? 'transparent 0, black 2rem' : 'black 0'}, ${edges.right ? 'black calc(100% - 3rem), transparent 100%' : 'black 100%'})`
  return (
    <section className="group/shelf flex flex-col gap-1 [--card:9rem] @[44rem]/page:[--card:10.5rem]">
      <div className="px-5 @[44rem]/page:px-8"><Heading title={title} onAll={onAll} /></div>
      <div className="relative">
        <div ref={scroller} onScroll={measure} className="flex snap-x scroll-px-3.5 items-stretch gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-3.5 py-1 [scrollbar-width:none] @[44rem]/page:scroll-px-6.5 @[44rem]/page:px-6.5 [&::-webkit-scrollbar]:hidden"
          style={{ maskImage: mask, WebkitMaskImage: mask }}>
          {children}
        </div>
        {(['left', 'right'] as const).map((side) => edges[side] && (
          <Tip key={side} label={side === 'left' ? 'Back' : 'More'}>
            <button type="button" tabIndex={-1} onClick={() => page(side === 'left' ? -1 : 1)}
              className={`absolute top-[calc((var(--card)-1.5rem)/2)] flex size-8 items-center justify-center rounded-full bg-background text-foreground shadow-[0_6px_16px_-6px_rgb(0_0_0/0.4),0_0_0_1px_var(--border)] transition-[opacity,scale] duration-150 hover:scale-105 active:scale-95 ${side === 'left' ? 'left-2' : 'right-2'} opacity-0 group-focus-within/shelf:opacity-100 group-hover/shelf:opacity-100`}>
              {side === 'left' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          </Tip>
        ))}
      </div>
      {(edges.left || edges.right) && <DotTrack from={span.from} to={span.to} onPick={(at) => {
        const box = scroller.current
        if (!box) return
        chime('riffle')
        box.scrollTo({ left: at * box.scrollWidth - box.clientWidth / 2, behavior: motionOff() ? 'auto' : 'smooth' })
      }} />}
    </section>
  )
}

/**
 * Home's own way of saying where a row is, found nowhere else in the app: a
 * line of dots like the focus timer's dot-matrix figures, the ones in view
 * lit and the rest faint. A dot is also a place: click one to go there.
 */
function DotTrack({ from, to, onPick }: { from: number; to: number; onPick: (at: number) => void }): React.JSX.Element {
  const DOTS = 16
  return (
    <div aria-hidden className="flex justify-center gap-[3px] pt-1.5">
      {Array.from({ length: DOTS }, (_, n) => {
        const at = (n + 0.5) / DOTS
        const lit = at >= from && at <= to
        return (
          <button key={n} type="button" tabIndex={-1} onClick={() => onPick(at)}
            className="group/dot flex size-3 items-center justify-center">
            <span className={`size-[3px] rounded-full transition-[background-color,scale] duration-200 group-hover/dot:scale-150 ${lit ? 'bg-foreground/70' : 'bg-foreground/15 group-hover/dot:bg-foreground/40'}`} />
          </button>
        )
      })}
    </div>
  )
}

/** A short list: the shape for things you act on one by one. */
function List({ title, onAll, children }: { title: ReactNode; onAll?: () => void; children: ReactNode }): React.JSX.Element {
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <div className="px-2"><Heading title={title} onAll={onAll} /></div>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

/** A list's row: the same height, padding and hover as Inbox's and Today's. */
function ListRow({ card, actions, lead, children, aside }: { card: Card; actions: Actions; lead: ReactNode; children: ReactNode; aside?: ReactNode }): React.JSX.Element {
  return (
    <RowMenu items={menuFor(card, actions, [card], 0)}>
      <div className="group/row flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/50 has-[[data-nav]:focus-visible]:bg-accent/50">
        {lead}
        <button type="button" data-nav data-private={card.private ? '' : undefined} onClick={() => actions.open(card)}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left outline-none">
          {children}
        </button>
        {aside}
      </div>
    </RowMenu>
  )
}

/** A task you can tick from here, the same circle as Today's. */
function TaskRow({ task, actions }: { task: Task; actions: Actions }): React.JSX.Element {
  const [done, setDone] = useState(false)
  const at = placed(task)
  const card: Card = { type: 'task', id: task.id, title: task.title, kind: 'todo', private: 0, at: task.createdAt }
  return (
    <ListRow card={card} actions={actions} lead={
      <Tip label="Complete">
        <button type="button" aria-label="Complete" onClick={() => (setDone(true), setTimeout(() => void completeTask(task), motionOff() ? 0 : 280))}
          className="group/tick mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/60 transition-colors hover:bg-accent"
          style={done ? { background: 'var(--tt-color-text-green)', borderColor: 'var(--tt-color-text-green)' } : undefined}>
          <Check className={`size-3 transition-opacity ${done ? 'text-background opacity-100' : 'opacity-0 group-hover/tick:opacity-60'}`} />
        </button>
      </Tip>
    } aside={at ? <span className="mt-0.5 shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs text-muted-foreground">{whenInLine(new Date(at).toISOString(), !!task.allDay)}</span> : undefined}>
      <span className={`line-clamp-2 [overflow-wrap:anywhere] transition-colors ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{nameOf(card)}</span>
    </ListRow>
  )
}

/** One thing that comes back today, set large: its picture blurred behind it, what it is, and what to do. */
function Feature({ card, line, actions }: { card: Card; line: string; actions: Actions }): React.JSX.Element {
  const src = usePicture(card)
  const [broken, setBroken] = useState(false)
  const picture = !!src && !broken
  const tint = tintOf(card)
  return (
    <RowMenu items={menuFor(card, actions, [card], 0)}>
      <div className="relative mx-5 overflow-hidden rounded-xl @[44rem]/page:mx-8" data-private={card.private ? '' : undefined}>
        <div aria-hidden className="absolute inset-0" style={{ background: `color-mix(in oklab, ${tint} 12%, var(--background))` }} />
        {picture && <img aria-hidden src={src} alt="" className="absolute inset-0 size-full scale-125 object-cover opacity-40 blur-2xl saturate-150" />}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-background/70 via-background/45 to-background/10" />
        <div className="relative flex items-center gap-4 p-4 @[44rem]/page:gap-5 @[44rem]/page:p-5">
          {picture && (
            <button type="button" tabIndex={-1} onClick={() => actions.open(card)} aria-label={`Open ${nameOf(card)}`}
              className="aspect-square w-20 shrink-0 overflow-hidden rounded-lg shadow-[0_10px_30px_-10px_rgb(0_0_0/0.5)] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:scale-[1.02] active:scale-[0.98] @[44rem]/page:w-28">
              <Picture src={src} onBroken={() => setBroken(true)} />
            </button>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-foreground/80">{line}</span>
            <h2 className="private-text line-clamp-2 font-heading text-[1.25rem] leading-[1.15] font-semibold tracking-[-0.02em] text-balance text-foreground @[44rem]/page:text-[1.5rem]">{nameOf(card)}</h2>
            {!picture && wordsOf(card.excerpt) && <p className="private-text line-clamp-2 max-w-[60ch] text-control text-muted-foreground">{wordsOf(card.excerpt)}</p>}
            <div className="mt-2 flex items-center gap-1.5">
              <button type="button" data-nav onClick={() => actions.open(card)}
                className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-control font-semibold text-primary-foreground shadow-[0_6px_16px_-8px_rgb(0_0_0/0.5)] outline-none transition-transform duration-150 hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]">
                Open <ArrowRight className="size-3.5" />
              </button>
              {readable(card) && (
                <Tip label="Read">
                  <button type="button" onClick={() => actions.read([card], 0)}
                    className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,scale] duration-150 hover:bg-foreground/[0.07] hover:text-foreground active:scale-95">
                    <BookOpen className="size-4" />
                  </button>
                </Tip>
              )}
              <MenuButton small items={menuFor(card, actions, [card], 0)} />
              <span className="ml-auto hidden text-xs text-muted-foreground @[36rem]/page:inline">{kindLabel(card)}</span>
            </div>
          </div>
        </div>
      </div>
    </RowMenu>
  )
}

/** Kept words, set as quotes in a few columns: a row's cards share one height, their line about why at the foot. */
function Quotes({ title, onAll, cards, actions }: { title: ReactNode; onAll?: () => void; cards: Card[]; actions: Actions }): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2 px-5 @[44rem]/page:px-8">
      <Heading title={title} onAll={onAll} />
      <div className="grid grid-cols-1 gap-2 @[24rem]/page:grid-cols-2 @[60rem]/page:grid-cols-3">
        {cards.map((card, at) => (
          <RowMenu key={card.id} items={menuFor(card, actions, cards, at)}>
            <div className="group/card relative" data-private={card.private ? '' : undefined}>
              {/* A card that is settled in place carries its answer under it, in the same paper. */}
              <Lean by={4} className="h-full" inner={`flex flex-col ${card.foot ? 'rounded-xl bg-foreground/[0.04]' : ''}`}>
              <button type="button" data-nav data-private={card.private ? '' : undefined} onClick={() => actions.open(card)}
                className={`flex w-full flex-1 flex-col gap-2 rounded-xl p-4 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 ${card.foot ? 'pb-2 hover:bg-foreground/[0.03]' : 'bg-foreground/[0.04] hover:bg-foreground/[0.07]'}`}>
                <span className="private-text pr-7 font-heading text-[1.0625rem] leading-snug [overflow-wrap:anywhere] text-foreground">{nameOf(card)}</span>
                {wordsOf(card.excerpt) && <span className="private-text line-clamp-3 text-xs leading-relaxed text-muted-foreground">{wordsOf(card.excerpt)}</span>}
                <span className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground/80">
                  <KindMark card={card} className="size-4 rounded-[4px] [&_svg]:size-2.5" />{card.sub}
                </span>
              </button>
              {card.foot && <div className="px-4 pb-3">{card.foot}</div>}
              <span className="pointer-events-none absolute top-2 right-2">
                <RoundRead onRead={() => actions.read(cards, at)}
                  className="pointer-events-auto translate-y-1 opacity-0 group-focus-within/card:translate-y-0 group-focus-within/card:opacity-100 group-hover/card:translate-y-0 group-hover/card:opacity-100" />
              </span>
              </Lean>
            </div>
          </RowMenu>
        ))}
      </div>
    </section>
  )
}

export function HomeView({ onOpen, onView }: { onOpen: (type: string, id: string) => void; onView: (id: string, focus?: string) => void }): React.JSX.Element {
  const data = useLive(home, NONE, [], ['capture', 'item'])
  // Opened by pointer, the shelves come in top down, 40ms apart; by G H they
  // are simply there. Decided once, as the page opens.
  const [enter] = useState(() => !byKeys())
  const pins = useLive(vigil.pins, [] as Pinned[])
  const tasks = useLive(vigil.tasks, [] as Task[])
  const settings = useLive(vigil.settings, null as Settings | null)
  const captures = useCaptures()
  const [chip, setChip] = useState<Chip>('all')
  const [reading, setReading] = useState<{ items: Readable[]; start: number } | null>(null)
  const [hover, setHover] = useState<{ src?: string; colour: string } | null>(null)
  const band = useTint(hover?.src, hover?.colour)
  const keep = CHIPS.find((one) => one.id === chip)!.keep as (type: Kind) => boolean

  // Rot, drawn once a visit like the box's cards: never reshuffled under you.
  const [rot, setRot] = useState<Card[]>([])
  useEffect(() => void window.api.captures.rot().then((found) =>
    setRot(found.map((one) => ({ type: 'capture', id: one.id, title: String(one.label || one.title || ''), kind: one.kind, private: Number(one.private ?? 0), at: one.capturedAt, excerpt: textOf(one.body).split('\n').slice(1).join(' ').slice(0, 200) })))), [])

  // The same idea caught three times or more: one row per idea.
  const ids = useMemo(() => captures.filter((one) => one.status !== 'discarded' && !one.archivedAt).slice(0, 150).map((one) => one.id), [captures])
  const repeats = useLive(() => (ids.length ? issues.repeats(ids) : Promise.resolve({} as Record<string, Repeat>)), {} as Record<string, Repeat>, [ids.join()], ['capture'])
  const clusters = useMemo(() => {
    const seen = new Set<string>()
    return Object.entries(repeats).flatMap(([id, found]) => {
      const key = found.ids.map((one) => one.id).sort().join()
      if (seen.has(key)) return []
      seen.add(key)
      const meta = captures.find((one) => one.id === id)
      const card: Card = found.article
        ? { type: 'article', id: found.article.id, title: found.article.title, kind: 'note', private: 0, at: meta?.capturedAt ?? '', count: found.n, sub: 'You wrote the thing' }
        : { type: 'capture', id, title: found.ids[0]?.title ?? '', kind: meta?.kind ?? 'note', private: 0, at: meta?.capturedAt ?? '', count: found.n }
      return [card]
    }).slice(0, 5)
  }, [repeats, captures])

  const actions: Actions = {
    open: (card) => (chime('open'), onOpen(card.type, card.id)),
    read: (list, at) => {
      const items = list.filter(readable)
      chime('read')
      setReading({ items: items.map((one) => ({ type: one.type, id: one.id })), start: Math.max(0, items.indexOf(list[at])) })
    }
  }

  // The tiles: pinned first, then what you opened last, then what you changed last.
  const pinCards: Card[] = pins.map((pin) => ({ type: pin.type, id: pin.id, title: pin.title, kind: pin.kind, private: pin.private, at: pin.pinnedAt }))
  const tileSeen = new Set<string>()
  const tiles = [...pinCards, ...data.opened, ...data.edited, ...(chip === 'questions' ? data.questions : [])]
    .filter((card) => keep(card.type) && !tileSeen.has(card.id) && (tileSeen.add(card.id), true))
  const pinned = new Set(pins.map((pin) => pin.id))

  const nextUp = keep('task') ? tasks.filter((task) => task.status === 'open')
    .sort((a, b) => b.important - a.important || (placed(a) ?? Infinity) - (placed(b) ?? Infinity)).slice(0, chip === 'tasks' ? 12 : 5) : []

  const feature = [
    data.memory && { card: data.memory, line: data.memory.memory },
    data.due[0] && { card: data.due[0], line: 'Due for review today' },
    data.article && { card: data.article, line: 'Your newest article' }
  ].find((one) => one && keep(one.card.type)) || null

  const dated = (card: Card): Card => ({ ...card, sub: card.sub ?? whenInLine(card.at) })
  const only = (cards: Card[]): Card[] => cards.filter((card) => keep(card.type) && card.id !== feature?.card.id)
  // Not what the tiles already show: further back in what you had open or changed.
  const jumpSeen = new Set(tiles.slice(0, 8).map((card) => card.id))
  const jump = only([...data.opened, ...data.edited].filter((card) => !jumpSeen.has(card.id) && (jumpSeen.add(card.id), true)).map(dated)).slice(0, 12)
  // A decision or experiment whose day has come leads, settled right on its card.
  const returned = data.returning.map((one): Card => ({ ...one, type: one.type as Kind, excerpt: '', sub: backLine(one), foot: <KindBack one={one} onOpen={(type, id) => onOpen(type, id)} /> }))
  const back = only([...returned, ...data.due.map((card) => ({ ...card, sub: 'Due for review' })), ...data.unseen.map((card) => ({ ...card, sub: 'Not seen in a while' }))]).slice(0, Math.max(6, returned.length))
  const questions = only(data.questions).slice(0, chip === 'questions' ? 12 : 4)
  const tidy = only(rot)
  const again = only(clusters)
  const tagRows = data.tags.map((one) => ({ ...one, cards: only(one.cards.map(dated)) })).filter((one) => one.cards.length)
  const week = only(data.week.map(dated))

  // Arrows move to the nearest card that way, ↵ opens: each card is a button.
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!/^Arrow(Up|Down|Left|Right)$/.test(event.key) || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || reading) return
      const box = root.current
      if (!box || document.querySelector('[role="dialog"], [role="menu"]')) return
      const here = document.activeElement as HTMLElement | null
      const inside = !!here && box.contains(here) && here.hasAttribute('data-nav')
      if (!inside && here && here !== document.body && !box.contains(here)) return
      const all = [...box.querySelectorAll<HTMLElement>('[data-nav]')]
      if (!all.length) return
      event.preventDefault()
      const go = (to: HTMLElement | undefined): void => {
        if (!to) return
        to.focus({ preventScroll: true })
        to.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: motionOff() ? 'auto' : 'smooth' })
      }
      if (!inside) return go(all[0])
      const from = here.getBoundingClientRect()
      const across = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
      const ahead = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      // Across: the next one in the same line. Down or up: the nearest line that way, then the closest across.
      const near = all.filter((one) => one !== here).map((one) => ({ one, at: one.getBoundingClientRect() })).filter(({ at }) => across
        ? Math.abs(at.top - from.top) < from.height / 2 && (ahead ? at.left >= from.right - 4 : at.right <= from.left + 4)
        : ahead ? at.top >= from.bottom - 4 : at.bottom <= from.top + 4)
      if (!near.length) return
      const gap = ({ at }: { at: DOMRect }): number => (across ? Math.abs(at.left - from.left) : Math.abs(ahead ? at.top - from.bottom : from.top - at.bottom))
      const line = Math.min(...near.map(gap))
      go(near.filter((one) => gap(one) < line + 12).sort((a, b) => Math.abs(a.at.left - from.left) - Math.abs(b.at.left - from.left))[0]?.one)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reading])

  const empty = !captures.length && !data.edited.length && !tasks.length && !pins.length
  // Four tiles across with room for them, two in a small window.
  const [wide, setWide] = useState(true)
  useLayoutEffect(() => {
    const box = root.current
    if (!box) return
    const watch = new ResizeObserver(() => setWide(box.clientWidth >= 704))
    watch.observe(box)
    return () => watch.disconnect()
  }, [])
  const shownTiles = tiles.slice(0, wide ? 8 : 4)
  const tag = (name: string, color: string | null): { name: string; colour: string } => ({ name: `#${name}`, colour: tagColour(name, color) })
  const nothing = !feature && !nextUp.length && !jump.length && !back.length && !questions.length && !tidy.length && !again.length && !tagRows.length && !week.length

  return (
    <div ref={root} className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
      {/* The band: the colour of the tile you point at, run down behind the top and faded into the page. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[20rem] transition-[background-color] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ backgroundColor: band ?? 'transparent', maskImage: 'linear-gradient(to bottom, black 0%, black 20%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 20%, transparent 100%)' }} />
      {empty ? (
        <div className="relative px-3 @[44rem]/page:px-6">
          <Empty shape={['flower', 2]} title="Things come back to you here" action={
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => (chime('open'), window.api.showPrompt())}
                className="flex h-8 items-center gap-2 rounded-full bg-primary px-3.5 text-control font-semibold text-primary-foreground transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97]">
                Catch a thought <Pressed keys="⌘." className="border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground" />
              </button>
              <button type="button" onClick={() => void window.api.importFrom('vault')}
                className="flex h-8 items-center rounded-full px-3.5 text-control font-medium text-foreground transition-colors hover:bg-foreground/[0.07]">
                Import your notes…
              </button>
            </div>
          }>
            Catch a thought with ⌘. from anywhere, or bring your notes in. What you open, keep and keep circling will wait here for you.
          </Empty>
        </div>
      ) : (
        <div className={`page-column relative flex flex-col gap-8 pt-4 pb-10 @[44rem]/page:pt-5 ${enter ? 'mf-stagger' : ''}`}>
          <div className="flex flex-col gap-4">
            {/* What the page holds. */}
            <div role="tablist" aria-label="Show" className="flex flex-wrap gap-1.5 px-5 @[44rem]/page:px-8">
              {CHIPS.map((one) => (
                <button key={one.id} type="button" role="tab" aria-selected={chip === one.id}
                  onClick={() => void (chip !== one.id && (chime('tap'), setChip(one.id)))}
                  className={`h-7 rounded-full px-3 text-control transition-[background-color,color,scale] duration-150 active:scale-[0.96] ${chip === one.id ? 'bg-foreground font-medium text-background' : 'bg-foreground/[0.06] text-foreground/85 hover:bg-foreground/[0.1]'}`}>
                  {one.label}
                </button>
              ))}
            </div>
            {shownTiles.length > 0 && (
              <div className="grid grid-cols-2 gap-2 px-5 @[44rem]/page:grid-cols-4 @[44rem]/page:px-8">
                {shownTiles.map((card) => <Tile key={card.id} card={card} pinned={pinned.has(card.id)} actions={actions} onHover={setHover} />)}
              </div>
            )}
          </div>

          {feature && <Feature card={feature.card} line={feature.line} actions={actions} />}

          {(nextUp.length > 0 || questions.length > 0) && (
            <div className="grid gap-x-6 gap-y-8 px-3 @[44rem]/page:grid-cols-2 @[44rem]/page:px-6">
              {nextUp.length > 0 && (
                <List title="Next up" onAll={() => onView('today')}>
                  {nextUp.map((task) => <TaskRow key={task.id} task={task} actions={actions} />)}
                </List>
              )}
              {questions.length > 0 && (
                <List title="Questions you're holding" onAll={() => onView('questions')}>
                  {questions.map((card) => (
                    <ListRow key={card.id} card={card} actions={actions} lead={<Orbit className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}>
                      <span className="private-text line-clamp-2 [overflow-wrap:anywhere] text-foreground">{nameOf(card)}</span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">{card.clue ? `“${card.clue.replace(/\s+/g, ' ')}”` : 'No clues yet'}</span>
                    </ListRow>
                  ))}
                </List>
              )}
            </div>
          )}

          {jump.length > 0 && (
            <Row title="Jump back in" onAll={() => onView('all')}>
              {jump.map((card, at) => <RowCard key={`${card.type}:${card.id}`} card={card} list={jump} at={at} actions={actions} />)}
            </Row>
          )}

          {back.length > 0 && <Quotes title="Coming back" onAll={() => onView('review')} cards={back} actions={actions} />}

          {(tidy.length > 0 || again.length > 0) && (
            <div className="grid gap-x-6 gap-y-8 px-3 @[44rem]/page:grid-cols-2 @[44rem]/page:px-6">
              {tidy.length > 0 && (
                <List title="Worth a tidy" onAll={() => onView('inbox')}>
                  {tidy.map((card) => (
                    <ListRow key={card.id} card={card} actions={actions} lead={<KindMark card={card} className="mt-px size-5 shrink-0 rounded-[5px] [&_svg]:size-3" />}
                      aside={<span className="mt-0.5 shrink-0 text-xs text-muted-foreground">{whenInLine(card.at)}</span>}>
                      <span className="private-text line-clamp-2 [overflow-wrap:anywhere] text-foreground">{nameOf(card)}</span>
                    </ListRow>
                  ))}
                </List>
              )}
              {again.length > 0 && (
                <List title="You keep coming back to this" onAll={() => onView('all')}>
                  {again.map((card) => (
                    <ListRow key={card.id} card={card} actions={actions} lead={<Repeat2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                      aside={<span className="mt-0.5 shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{card.count}×</span>}>
                      <span className="private-text line-clamp-2 [overflow-wrap:anywhere] text-foreground">{nameOf(card)}</span>
                      {card.sub && <span className="text-xs text-muted-foreground">{card.sub}</span>}
                    </ListRow>
                  ))}
                </List>
              )}
            </div>
          )}

          {tagRows.map(({ tag: name, color, cards }) => (
            <Row key={name} title={<>More like <span style={{ color: tagColour(name, color) }}>#{name}</span></>} onAll={() => onView('tags', name)}>
              {cards.map((card, at) => <RowCard key={`${card.type}:${card.id}`} card={card} list={cards} at={at} actions={actions} tag={tag(name, color)} />)}
            </Row>
          ))}

          {week.length > 0 && (
            <Row title="From this week" onAll={() => onView('weekpage')}>
              {week.map((card, at) => <RowCard key={`${card.type}:${card.id}`} card={card} list={week} at={at} actions={actions} />)}
            </Row>
          )}

          {nothing && (
            <p className="px-5 text-control text-muted-foreground @[44rem]/page:px-8">
              {chip === 'all' ? 'Nothing is waiting to come back yet. It will, as you open and keep things.' : `No ${CHIPS.find((one) => one.id === chip)!.label.toLowerCase()} to bring back yet.`}
            </p>
          )}
          {settings?.safeMode && <p className="px-5 text-xs text-muted-foreground @[44rem]/page:px-8">Safe mode is on, so nothing comes back on its own.</p>}
        </div>
      )}
      {reading && <ReadThrough items={reading.items} start={reading.start} onClose={() => setReading(null)} />}
    </div>
  )
}
