import { ContinueReading } from '@/components/pdf/pdf-library'
import { showMediaKind } from './media-view'
import { useResumeCards, WelcomeBack } from './resume-cards'
import { useReadsIn } from '@/lib/reads-in'
import { TimeGone } from './time-gone'
import { Children, isValidElement, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { useCaptures } from '@/components/capture-list'
import { textOf } from '@/components/rot-cards'
import { chime } from '@/lib/sound'
import { issues, type Repeat } from '@/lib/issues'
import { smallPicture, thumbsRead, useThumb } from '@/lib/notes'
import { useDecoded } from '@/lib/decoded'
import { openApart, openSmall, smallHolds } from '@/lib/apart'
import { backSaid, placed, taskName } from '@/lib/tasks'
import { dayKey, dayjs, num, plural, startOfDay } from '../../../../main/dates'
import { quoted } from '../../../../main/clip'
import { splitTags, unloaded, unread, useLive, haligtree, whenInLine, type Pin as Pinned, type Settings, type Task } from '@/lib/haligtree'
import { useKept } from '@/lib/nav'
import { MenuButton, useTint } from './collection-header'
import { GrainFill, onPaper, PAPER_INK, useNoteCover } from './grain'
import { ReadThrough, type Readable } from './read-through'
import { RowMenu, copyLinkItem, flat as flatMenu, type MenuItem, type RowItem } from './row-menu'
import { binItem } from '@/lib/to-bin'
import { tagColour } from './tag-read'
import { Avatar } from './avatar'
import { openSource, sources, type SourceSummary } from '@/lib/sources'
import { TaskPriority, TaskWhen, completeTask, taskMenu, useTaskNow } from './tasks-view'
import { SessionDot, SpentTip, useTaskTime, type TaskTime } from './task-time'
import { sideMenu, useFullMenu } from './side-menu'
import { byPriority, markRoom } from './task-input'
import { Tags, Tip, pin, sayNow } from './ui'
import { NowSlot } from './now-slot'
import { Example } from './example'
import { Button } from '@/components/ui/button'
import { Inbox } from 'lucide-react'
import { MonthPlan } from './month-plan'
import { exampleIdeas, exampleInbox, exampleQuestions, exampleTasks } from '@/lib/examples'
import { Signed } from './signature'
import { hoverNote } from './note-preview'
import { byKeys, glideWay, spring, still, useFirstVisit } from '@/lib/motion'
import { Highlight, useChosen, useFluidHover, Weighted } from './glide'
import { KindBack, backLine, type Returning } from './kind-back'
import { GoalStrip } from './goals-view'
import { NextMark } from './milestones'
import { QueuePanel } from './queue-view'
import { StillWondering } from './questions-view'
import { GettingStarted, LINGER } from './getting-started'
import { useOnboarding } from '@/lib/onboarding'
import { PowersLine } from './powers-view'
import { WhatsNewCard } from './whats-new'
import { TodaysFeedCard } from './feed-view'
import { CloseDayOffer } from './close-day'
import { PracticeNow } from './practice-now'
import { MorningSortOffer } from './sort-out'
import { WeeklyDigest } from './weekly-digest'
import { Tilt } from './tilt'
import { LeavingPicture, useLeaving } from './picture-leaving'
import { openItems, useHere } from '@/lib/split'
import { queueItems } from '@/lib/reading-queue'
import { usePickMixed, type Pickable } from './pick-mixed'
import { heroOpen } from '@/lib/hero'
import { ArrowRight, BookOpen, Check, Gem, ChevronLeft, ChevronRight, Orbit, Bookmark as Pin, Repeat as Repeat2 } from '@/components/ui/icons'

/**
 * Home: where things come back to you. Laid out the way a music app's home
 * is, because the job is the same: a few tiles to jump back to, one thing
 * picked for today, then what is worth another look. Each part takes the
 * shape of what it holds: tasks as a list you can tick, kept words as
 * quotes, pictures as pictures. Read from your own notes only, never as a
 * count to clear.
 */

type Kind = 'capture' | 'nugget' | 'article' | 'question' | 'task'
type Card = { type: Kind; id: string; title: string; kind: string; private: number; at: string; excerpt?: string; sub?: string; clue?: string | null; count?: number; foot?: ReactNode; who?: string | null; where?: string | null; year?: string | null }
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
const home = (): Promise<HomeData> => window.api.haligtree<HomeData>('home')

const CHIPS = [
  { id: 'all', label: 'All', keep: () => true },
  { id: 'notes', label: 'Notes', keep: (type: Kind) => type === 'capture' },
  { id: 'nuggets', label: 'Gems', keep: (type: Kind) => type === 'nugget' || type === 'article' },
  { id: 'questions', label: 'Questions', keep: (type: Kind) => type === 'question' },
  { id: 'tasks', label: 'Tasks', keep: (type: Kind) => type === 'task' }
] as const
type Chip = (typeof CHIPS)[number]['id']

/** A note opening turns a page, which is its one sound. */
const turns = (type: string): boolean => type === 'capture' || type === 'nugget' || type === 'article' || type === 'question'
const KIND_NAME: Record<Kind, string> = { capture: 'Note', nugget: 'Gem', article: 'Page', question: 'Question', task: 'Task' }
const kindOf = (card: Pick<Card, 'type' | 'kind'>): (typeof CAPTURE_TYPES)[number] =>
  CAPTURE_TYPES.find((type) => type.id === (card.type === 'task' ? 'todo' : card.kind)) ?? CAPTURE_TYPES[0]
/** A kept thing's colour is its tier's, as the sidebar gives Gems and Pages theirs. */
const tintOf = (card: Pick<Card, 'type' | 'kind'>): string =>
  card.type === 'nugget' ? 'var(--tt-color-text-pink)' : card.type === 'article' ? 'var(--tt-color-text-brown)' : card.type === 'question' ? 'var(--tt-color-text-gray)' : kindOf(card).tint
/** The icon that goes with its label: a Gem's gem, a Page's book, a note's kind. */
const iconOf = (card: Pick<Card, 'type' | 'kind'>): typeof Orbit => (card.type === 'question' ? Orbit : card.type === 'nugget' ? Gem : card.type === 'article' ? BookOpen : kindOf(card).icon)
const kindLabel = (card: Card): string => (card.type === 'capture' ? kindOf(card).label : KIND_NAME[card.type])
/** A card's name without its `#tags`: the heading over it says those. */
const nameOf = (card: Pick<Card, 'title'>): string => splitTags(card.title).text || card.title || 'New note'
/** A few words after the name, tags out: they are said elsewhere. */
const wordsOf = (text?: string): string => (text ? splitTags(text).text : '')
/** Words only, for telling whether two say the same: no case, marks or spacing. */
const flat = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const readable = (card: Card): boolean => card.type !== 'task'

/** A note's first picture, full size; a video's first frame. Private ones show none. */
function usePicture(card: Pick<Card, 'id' | 'private' | 'type'>): string | undefined {
  const src = useThumb(card.type === 'task' ? '' : card.id)
  const video = !!src && /\.(mp4|m4v|mov|webm)$/i.test(src)
  const [frame, setFrame] = useState<string>()
  useEffect(() => void (video && src && smallPicture(src).then((made) => setFrame(made || undefined))), [src, video])
  // Decoded before the card is first drawn, a moment at most (a video's frame waits to be made too): never an empty cover, then the picture.
  const picture = !src ? undefined : video ? frame : src
  useDecoded(picture, !thumbsRead() || (video && !frame))
  // A private note keeps its picture, blurred like its name until you point at it, as lists do.
  return picture
}

/** A picture that steps aside when it cannot load, so the card falls back to words. */
function Picture({ src, className = '', onBroken }: { src: string; className?: string; onBroken: () => void }): React.JSX.Element {
  return <img src={src} alt="" decoding="async" draggable={false} onError={onBroken} className={`private-text size-full object-cover ${className}`} />
}

/**
 * What a tile shows with no picture: its grain cover, tinted its kind's
 * colour, the kind's icon faint on it; with no Covers folder, the icon on a
 * soft square of that colour.
 */
function KindMark({ card, className = '', grain = true }: { card: Card; className?: string; grain?: boolean }): React.JSX.Element {
  const Icon = iconOf(card)
  const tint = tintOf(card)
  const cover = useNoteCover(grain ? card.id : null)
  if (cover)
    return (
      <span className={`relative flex items-center justify-center overflow-hidden ${className}`}>
        <GrainFill cover={cover} tint={tint} shade={cover.paper ? 'all' : 'none'} />
        <KindIcon card={card} paper={cover.paper} className="relative size-4 text-white/60 drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]" />
      </span>
    )
  return (
    <span className={`flex items-center justify-center ${className}`} style={{ background: `color-mix(in oklab, ${tint} 16%, transparent)` }}>
      <Icon className="size-4" style={{ color: tint }} aria-hidden />
    </span>
  )
}

/** The kind's icon alone. */
function KindIcon({ card, className = '', paper = false }: { card: Card; className?: string; paper?: boolean }): React.JSX.Element {
  const Icon = iconOf(card)
  // On a paper drawing: in ink, not white.
  return <Icon className={paper ? className.replace(/\S*(text-white|drop-shadow)\S*/g, '') : className} style={paper ? onPaper(tintOf(card)) : undefined} aria-hidden />
}

/** Read, as a round button: what a card or tile offers on hover. 30px, its tip kept clear of it. */
function RoundRead({ onRead, className = '' }: { onRead: () => void; className?: string }): React.JSX.Element {
  return (
    <Tip label="Read it, full screen" offset={6}>
      {/* In the tab order after its card, so the keyboard finds it where the pointer does. */}
      <button
        type="button"
        onClick={(event) => (event.stopPropagation(), onRead())}
        className={`flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_color-mix(in_oklab,var(--mf-shadow-ink)_45%,transparent)] transition-[opacity,translate,scale] duration-250 ease-(--mf-ease) motion-safe:hover:scale-[1.04] active:scale-[0.95] ${className}`}
      >
        <BookOpen className="size-3.5" />
      </button>
    </Tip>
  )
}

/** A picked card, wherever on Home it sits: the accent's tint and a ring in it. */
const PICKED_CARD = '[&_[data-picked]]:bg-[color-mix(in_srgb,var(--tt-brand-color-400)_18%,transparent)] [&_[data-picked]]:shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--tt-brand-color-400)_70%,transparent)]'
/** `open` with ⇧ held picks instead; `picked` says whether a card is; `menu` puts the page's picking into a card's menu. */
/** `task` gives a task card the menu every list gives a task (tasks-view.tsx `taskMenu`). */
type Actions = { open: (card: Card, event?: React.MouseEvent) => void; read: (cards: Card[], at: number) => void; picked?: (card: Card) => boolean; menu?: (card: Card, own: RowItem[]) => RowItem[]; task?: (card: Card) => RowItem[] | null; note?: (card: Card) => RowItem[] }
const menuFor = (card: Card, { open, read, menu, task, note }: Actions, list: Card[], at: number, pinned?: boolean): RowItem[] => {
  // A task: the same menu as on Today and the Tasks page, a focus session first.
  const asTask = card.type === 'task' ? task?.(card) : null
  if (asTask) return menu ? menu(card, asTask) : asTask
  // A note: the sidebar's menu (done, a task, pin, link, the Bin), with Read and the queue after Open.
  const asNote = card.type !== 'task' ? note?.(card) : null
  if (asNote) {
    const [first, ...rest] = asNote
    const own: RowItem[] = [first, readable(card) && { label: 'Read it, full screen', run: () => read(list, at) }, ...queueItems(card.id), ...rest]
    return menu ? menu(card, own) : own
  }
  // A note or a gem can be pinned and linked to from here, as from its own list.
  const table = card.type === 'capture' ? 'captures' : card.type === 'nugget' || card.type === 'article' ? 'nuggets' : null
  const own: MenuItem[] = [
    { label: 'Open', run: () => open(card) },
    card.type !== 'task' && { label: 'Open in a new window', run: () => openApart(card.type, card.id) },
    card.type !== 'task' && smallHolds(card.type) && { label: 'Open in a small window', hint: 'Keeps writing there while quick capture stays free', run: () => openSmall(card.type, card.id) },
    ...openItems(card.type, card.id),
    ...(card.type === 'task' ? [] : queueItems(card.id)),
    readable(card) && { label: 'Read it, full screen', run: () => read(list, at) },
    'separator',
    table && pinned !== undefined && { label: pinned ? 'Unpin' : 'Pin to the sidebar', run: () => pin(table, card.id, !pinned) },
    card.type !== 'task' && copyLinkItem(card.id, nameOf(card)),
    'separator',
    binItem([{ type: card.type, id: card.id }])
  ]
  return menu ? menu(card, own) : own
}

/** One quick tile: its picture or kind at the left, the name in bold, Read sliding in at the right. */
function Tile({ card, pinned, actions, onHover }: { card: Card; pinned: boolean; actions: Actions; onHover: (look: { src?: string; colour: string } | null) => void }): React.JSX.Element {
  const src = usePicture(card)
  const [broken, setBroken] = useState(false)
  const look = { src: broken ? undefined : src, colour: tintOf(card) }
  // Its picture deleted or changed, the old one fades out over what takes its place (picture-leaving.tsx).
  const [leaving, left] = useLeaving(look.src, card.id)
  return (
    <RowMenu items={() => menuFor(card, actions, [card], 0, pinned)}>
      <div className="group/tile relative min-w-0" onPointerEnter={() => onHover(look)} onPointerLeave={() => onHover(null)}>
        <button
          type="button"
          data-nav
          data-private={card.private ? '' : undefined}
          onFocus={() => onHover(look)}
          onBlur={() => onHover(null)}
          data-picked={actions.picked?.(card) || undefined} data-drag-open={`${card.type}:${card.id}`} onClick={(event) => actions.open(card, event)}
          className="flex h-12 w-full min-w-0 items-center gap-3 overflow-hidden rounded-md bg-foreground/[0.05] pr-10 text-left outline-none transition-colors duration-150 hover:bg-foreground/[0.09] focus-visible:bg-foreground/[0.09] focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {src && !broken
            ? <span className="relative aspect-square h-full shrink-0 overflow-hidden rounded-l-md shadow-[2px_0_10px_-4px_color-mix(in_oklab,var(--mf-shadow-ink)_30%,transparent)]"><Picture src={src} onBroken={() => setBroken(true)} /><LeavingPicture src={leaving} onDone={left} /></span>
            : <span className="relative aspect-square h-full shrink-0 overflow-hidden rounded-l-md"><KindMark card={card} className="size-full" /><LeavingPicture src={leaving} onDone={left} /></span>}
          <span className="private-text line-clamp-2 min-w-0 flex-1 text-control leading-tight font-medium hyphens-auto [overflow-wrap:break-word] text-foreground">{nameOf(card)}</span>
          {pinned && <Pin className="absolute right-3 size-3.5 text-muted-foreground transition-opacity group-focus-within/tile:opacity-0 group-hover/tile:opacity-0" aria-label="Pinned" />}
        </button>
        {readable(card) && (
          <RoundRead onRead={() => actions.read([card], 0)}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 translate-x-1 opacity-0 group-focus-within/tile:translate-x-0 group-focus-within/tile:opacity-100 group-hover/tile:translate-x-0 group-hover/tile:opacity-100" />
        )}
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
function RowCard({ card, list, at, actions }: { card: Card; list: Card[]; at: number; actions: Actions }): React.JSX.Element {
  const src = usePicture(card)
  const [broken, setBroken] = useState(false)
  const real = !!src && !broken
  // No picture of its own: its grain cover stands in, so a row of cards reads as one shelf.
  const grain = useNoteCover(real ? null : card.id)
  const picture = real || !!grain
  // Its picture deleted or changed, the old one fades out over the cover that takes its place.
  const [leaving, left] = useLeaving(real ? src : undefined, card.id, picture)
  return (
    <RowMenu items={() => menuFor(card, actions, list, at)}>
      <div className="group/card relative flex w-(--card) shrink-0 snap-start">
        <div className="relative flex w-full">
        <button
          type="button"
          data-nav
          data-private={card.private ? '' : undefined}
          data-picked={actions.picked?.(card) || undefined} data-drag-open={`${card.type}:${card.id}`} onClick={(event) => actions.open(card, event)}
          className={`flex w-full flex-col text-left outline-none transition-[background-color,scale] duration-200 ease-(--mf-ease) focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.985] ${picture ? 'gap-2 rounded-xl bg-foreground/[0.04] p-1.5 hover:bg-foreground/[0.07]' : 'min-h-[7.5rem] gap-1.5 overflow-hidden rounded-xl bg-foreground/[0.04] p-3.5 hover:bg-foreground/[0.07]'}`}
        >
          {picture ? (
            <>
              <span className="relative aspect-square w-full overflow-hidden rounded-lg shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--mf-shadow-ink)_35%,transparent)]">
                {real ? <Picture src={src!} onBroken={() => setBroken(true)} /> : grain && (
                  <>
                    <GrainFill cover={grain} tint={tintOf(card)} shade={wordsOf(card.excerpt) ? 'foot' : 'none'} />
                    {/* Its kind, and its first words where a picture would be: white on the dark of the cover. */}
                    <span className={`absolute inset-0 flex flex-col justify-between p-3 ${grain.paper ? '' : 'text-white'}`}>
                      <KindIcon card={card} paper={grain.paper} className="size-4 text-white/80 drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]" />
                      {wordsOf(card.excerpt) && <span className={`private-text line-clamp-4 text-xs leading-snug hyphens-auto [overflow-wrap:break-word] ${grain.paper ? '' : 'text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]'}`} style={grain.paper ? { color: PAPER_INK } : undefined}>{wordsOf(card.excerpt)}</span>}
                    </span>
                  </>
                )}
                <LeavingPicture src={leaving} onDone={left} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 pb-2">
                <span className="private-text line-clamp-2 text-control leading-snug font-medium hyphens-auto [overflow-wrap:break-word] text-foreground">{nameOf(card)}</span>
                {card.sub && (
                  <span className="mt-auto flex min-w-0 items-center gap-2 pt-1 text-xs text-muted-foreground">
                    <span className="truncate">{card.sub}</span>
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              {/* Its right end left free for Read, which sits level with it. */}
              <span className="flex min-w-0 items-center gap-1.5 pr-8 text-xs text-muted-foreground">
                <KindMark card={card} grain={false} className="size-5 rounded-[5px] [&_svg]:size-3" />
                {kindLabel(card)}
              </span>
              <span className="private-text line-clamp-3 text-[0.9375rem] leading-snug font-semibold hyphens-auto [overflow-wrap:break-word] text-foreground">{nameOf(card)}</span>
              {wordsOf(card.excerpt) && <span className="private-text line-clamp-3 text-xs hyphens-auto [overflow-wrap:break-word] leading-relaxed text-muted-foreground">{wordsOf(card.excerpt)}</span>}
              {/* The date at the foot: down here Read never covers it. The row's heading names the tag, so the card does not again. */}
              {card.sub && (
                <span className="mt-auto flex min-w-0 items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span className="truncate">{card.sub}</span>
                </span>
              )}
            </>
          )}
        </button>
        {readable(card) && (
          // Over the picture's corner, 8px in from both edges; on words, level with the kind.
          <span className={`pointer-events-none absolute flex justify-end ${picture ? 'inset-x-1.5 top-1.5 aspect-square items-end p-2' : 'top-[9px] right-[9px]'}`}>
            <RoundRead onRead={() => actions.read(list, at)}
              className="pointer-events-auto scale-90 opacity-0 group-focus-within/card:scale-100 group-focus-within/card:opacity-100 group-hover/card:scale-100 group-hover/card:opacity-100 group-hover/card:delay-100" />
          </span>
        )}
        </div>
      </div>
    </RowMenu>
  )
}

/** A part's heading: plain, smaller than a page title, with Show all at its end. */
function Heading({ title, onAll, extra }: { title: ReactNode; onAll?: () => void; extra?: ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="min-w-0 flex-1 truncate font-heading text-heading font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
      {onAll && (
        <button type="button" onClick={() => (chime('tap'), onAll())}
          className="-mr-2 inline-flex h-6 shrink-0 items-center rounded-md px-2 text-meta font-medium text-muted-foreground transition-colors duration-80 hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          Show all
        </button>
      )}
      {extra}
    </div>
  )
}

/** A row that scrolls sideways, with › and ‹ on hover and its edges faded where there is more. */
function Row({ title, over, lead, onAll, menu, children }: { title: ReactNode; /** A small line over the title. */ over?: string; /** Held still at the left while the cards slide beside it, under its own heading. */ lead?: { over: string; title: ReactNode; node: ReactNode }; onAll?: () => void; /** The row's own choices, last in the group on the right. */ menu?: MenuItem[]; children: ReactNode }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  // Where the row is, for the dot track under it: what share is in view, and from where.
  const [span, setSpan] = useState({ from: 0, to: 1 })
  // As the row slides, each dot it lights is a bead of sound; never more than one a frame.
  const lastLit = useRef(-1)
  const measure = (): void => {
    const box = scroller.current
    // Out of the layout (Home on its way out as another page shows): nothing slid, so no bead.
    if (!box || !box.clientWidth) return
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
    // Measured again when the cards change, not on every draw of Home: each
    // measure lays out the whole window, and Home draws again as you leave it.
  }, [Children.toArray(children).map((one) => (isValidElement(one) ? one.key : String(one))).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const page = (by: -1 | 1): void => {
    const box = scroller.current
    if (!box) return
    chime('riffle')
    box.scrollBy({ left: by * box.clientWidth * 0.8, behavior: glideWay() })
  }
  const mask = `linear-gradient(to right, ${edges.left ? 'transparent 0, black 2rem' : 'black 0'}, ${edges.right ? 'black calc(100% - 3rem), transparent 100%' : 'black 100%'})`
  return (
    <section className="group/shelf flex flex-col gap-1 [--card:9rem] @[44rem]/page:[--card:10.5rem]">
      {/* ‹ and › beside Show all, never over a card's words. */}
      <div className={lead ? 'flex flex-col gap-3 @[44rem]/page:flex-row @[44rem]/page:gap-6 @[44rem]/page:pl-8' : ''}>
      {lead && (
        <div className="flex min-w-0 shrink-0 flex-col gap-1 px-5 @[44rem]/page:w-[50%] @[44rem]/page:px-0">
          <p className="text-xs text-muted-foreground">{lead.over}</p>
          <Heading title={lead.title} />
          {/* As tall as a whole tile beside it, picture and words: the row's own height, never the picture's alone. */}
          <div className="flex min-h-0 flex-1 pt-1 pb-1">{lead.node}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className={lead ? 'px-5 @[44rem]/page:pr-8 @[44rem]/page:pl-0' : 'px-5 @[44rem]/page:px-8'}>
        {over && <p className="text-xs text-muted-foreground">{over}</p>}
        <Heading title={title} onAll={onAll} extra={(edges.left || edges.right || menu) && (
          <span className="flex shrink-0 items-center gap-1 self-center">
            {(edges.left || edges.right) && (['left', 'right'] as const).map((side) => (
              <Tip key={side} label={side === 'left' ? 'Back' : 'More'}>
                <button type="button" tabIndex={-1} disabled={!edges[side]} onClick={() => page(side === 'left' ? -1 : 1)}
                  className="flex size-7 items-center justify-center rounded-full shrink-0 text-muted-foreground transition-[color,background-color,opacity,scale] duration-150 hover:bg-foreground/[0.07] hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-30">
                  {side === 'left' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
              </Tip>
            ))}
            {menu && <MenuButton small label="Row options" name="home-row" items={menu} />}
          </span>
        )} />
      </div>
      <div className={lead ? 'relative min-w-0 flex-1 @[44rem]/page:-ml-6.5' : 'relative min-w-0 flex-1'}>
        <div ref={scroller} onScroll={measure} className="flex snap-x scroll-px-3.5 items-stretch gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-3.5 py-1 [scrollbar-width:none] @[44rem]/page:scroll-px-6.5 @[44rem]/page:px-6.5 [&::-webkit-scrollbar]:hidden"
          style={{ maskImage: mask, WebkitMaskImage: mask }}>
          {children}
        </div>
      </div>
      </div>
      </div>
      {(edges.left || edges.right) && <DotTrack from={span.from} to={span.to} onPick={(at) => {
        const box = scroller.current
        if (!box) return
        chime('riffle')
        box.scrollTo({ left: at * box.scrollWidth - box.clientWidth / 2, behavior: glideWay() })
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
            <span className={`size-[3px] rounded-full transition-[background-color,scale] duration-200 motion-safe:group-hover/dot:scale-150 ${lit ? 'bg-foreground/70' : 'bg-foreground/15 group-hover/dot:bg-foreground/40'}`} />
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
    <RowMenu items={() => menuFor(card, actions, [card], 0)}>
      <div className="group/row relative flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/50 has-[[data-nav]:focus-visible]:bg-accent/50">
        {lead}
        <button type="button" data-nav data-private={card.private ? '' : undefined} data-picked={actions.picked?.(card) || undefined} data-drag-open={`${card.type}:${card.id}`} onClick={(event) => actions.open(card, event)}
          className="-my-2 flex min-w-0 flex-1 flex-col items-start gap-0.5 py-2 text-left outline-none [&>*]:max-w-full">
          {children}
        </button>
        {aside}
      </div>
    </RowMenu>
  )
}

/** A task you can tick from here, the same circle as Today's. */
function TaskRow({ task, actions, room = false, time }: { task: Task; actions: Actions; room?: boolean; /** The session running now, for its dot (task-time.tsx). */ time?: TaskTime }): React.JSX.Element {
  const [done, setDone] = useState(false)
  const at = placed(task)
  const card: Card = { type: 'task', id: task.id, title: task.title, kind: 'todo', private: 0, at: task.createdAt }
  return (
    <ListRow card={card} actions={actions} lead={<>
      {/* A focus session running on it: the dot in the margin, as Today's rows have it. */}
      {time && <SessionDot id={task.id} time={time} className="absolute right-full mr-1 flex w-3 items-center justify-end top-2 h-5" />}
      <Tip label="Mark it done">
        <button type="button" data-task-tick aria-label="Complete" onClick={() => done || (chime('done'), setDone(true), setTimeout(() => void completeTask(task, true), still() ? 0 : 280))}
          className="group/tick relative mt-0.5 flex size-[18px] shrink-0 after:absolute after:-inset-[3px] after:rounded-full items-center justify-center rounded-full border-[1.5px] border-muted-foreground/60 transition-colors hover:bg-accent"
          style={done ? { background: 'var(--tt-color-text-green)', borderColor: 'var(--tt-color-text-green)' } : undefined}>
          <Check className={`size-3 transition-opacity ${done ? 'text-background opacity-100' : 'opacity-0 group-hover/tick:opacity-60'}`} />
        </button>
      </Tip>
    </>
    // The shared day piece, as every task list has it: its day, “Due by”, and the repeat mark.
    } aside={at || task.recurrence ? <span className="mt-0.5 flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><TaskWhen task={task} /></span> : undefined}>
      <span className="flex min-w-0 items-start gap-2">
        {room && <span className="mt-[0.3rem]"><TaskPriority task={task} room /></span>}
        {/* The time spent on it: in its name's tip, the row having no small line. */}
        <SpentTip task={task} time={time}><span data-task-title className={`line-clamp-2 hyphens-auto [overflow-wrap:break-word] transition-colors ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{nameOf(card)}</span></SpentTip>
        {/* The tags give way before the name does: a tag with no room joins the "+N", which never gives way. */}
        <span className="mt-[0.2rem] flex max-w-[40%] shrink-[4]"><Tags tags={taskName(task.title).tags} alone /></span>
      </span>
    </ListRow>
  )
}

/** One thing that comes back today, set large: its picture blurred behind it, what it is, and what to do. */
function Feature({ card, line, actions }: { card: Card; line: string; actions: Actions }): React.JSX.Element {
  const src = usePicture(card)
  const [broken, setBroken] = useState(false)
  const real = !!src && !broken
  const tint = tintOf(card)
  // No picture of its own: its grain cover, behind it and as its square.
  const grain = useNoteCover(real ? null : card.id)
  const picture = real || !!grain
  const backdrop = real ? src : grain?.small
  // Its picture deleted or changed, the old one fades out over its square's new cover.
  const [leaving, left] = useLeaving(real ? src : undefined, card.id, picture)
  return (
    <RowMenu items={() => menuFor(card, actions, [card], 0)}>
      <div data-home-feature className="relative mx-5 overflow-hidden rounded-xl @[44rem]/page:mx-8" data-private={card.private ? '' : undefined}>
        <div aria-hidden className="absolute inset-0" style={{ background: `color-mix(in oklab, ${tint} 12%, var(--background))` }} />
        {picture && <img aria-hidden src={backdrop} alt="" className="absolute inset-0 size-full scale-125 object-cover opacity-40 blur-2xl saturate-150" />}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-background/70 via-background/45 to-background/10" />
        <div className="relative flex items-center gap-4 p-4 @[44rem]/page:gap-5 @[44rem]/page:p-5">
          {picture && (
            <Tilt className="shrink-0 rounded-lg">
            <button type="button" tabIndex={-1} data-picked={actions.picked?.(card) || undefined} data-drag-open={`${card.type}:${card.id}`} onClick={(event) => actions.open(card, event)} aria-label={`Open ${nameOf(card)}`}
              className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-lg shadow-[0_10px_30px_-10px_color-mix(in_oklab,var(--mf-shadow-ink)_50%,transparent)] transition-transform duration-200 ease-(--mf-ease) motion-safe:hover:scale-[1.02] active:scale-[0.98] @[44rem]/page:w-28">
              {real ? <Picture src={src!} onBroken={() => setBroken(true)} /> : grain && (
                <span className="relative flex size-full items-center justify-center">
                  <GrainFill cover={grain} tint={tint} shade={grain.paper ? 'all' : 'none'} />
                  <KindIcon card={card} paper={grain.paper} className="relative size-7 text-white/75 drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)] @[44rem]/page:size-9" />
                </span>
              )}
              <LeavingPicture src={leaving} onDone={left} />
            </button>
            </Tilt>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-(--mf-muted-strong)">{line}</span>
            <h2 className="private-text line-clamp-2 font-heading text-[1.25rem] leading-[1.15] font-semibold tracking-[-0.02em] text-balance text-foreground @[44rem]/page:text-[1.5rem]">{nameOf(card)}</h2>
            {!real && wordsOf(card.excerpt) && <p className="private-text line-clamp-2 max-w-[60ch] text-control text-muted-foreground">{wordsOf(card.excerpt)}</p>}
            <Signed who={card.who} where={card.where} year={card.year} className="private-text text-control text-muted-foreground" />
            <div className="mt-2 flex items-center gap-1.5">
              <button type="button" data-nav data-drag-open={`${card.type}:${card.id}`} onClick={(event) => actions.open(card, event)}
                className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-control font-semibold text-primary-foreground shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--mf-shadow-ink)_50%,transparent)] outline-none transition-transform duration-150 motion-safe:hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]">
                Open <ArrowRight className="size-3.5" />
              </button>
              {readable(card) && (
                <Tip label="Read it, full screen">
                  <button type="button" onClick={() => actions.read([card], 0)}
                    className="flex size-8 items-center justify-center rounded-full shrink-0 text-muted-foreground transition-[color,background-color,scale] duration-150 hover:bg-foreground/[0.07] hover:text-foreground active:scale-95">
                    <BookOpen className="size-4" />
                  </button>
                </Tip>
              )}
              <MenuButton small items={() => flatMenu(menuFor(card, actions, [card], 0))} />
              <span className="ml-auto hidden text-xs text-muted-foreground @[36rem]/page:inline">{kindLabel(card)}</span>
            </div>
          </div>
        </div>
      </div>
    </RowMenu>
  )
}

/** Kept words, set as quotes in a few columns: a row's cards share one height, their line about why at the foot. */
/** Home's own shelves, filled from lib/examples.ts, for a first start with nothing in it. */
/** The Inbox, said plainly on Home: how many captures wait to be sorted, and the way in. */
function InboxLine({ count, onOpen }: { count: number | null; onOpen: () => void }): React.JSX.Element {
  return (
    <section data-home-inbox className="flex flex-col gap-2">
      <Heading title="Inbox" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-body text-foreground">
          {count === null ? ' ' : count ? <><strong className="font-semibold tabular-nums">{num(count)}</strong> {count === 1 ? 'capture waits' : 'captures wait'} to be sorted.</> : 'Nothing waits to be sorted. What you catch with ⌘. lands here.'}
        </p>
        <Button variant="secondary" size="sm" data-open-inbox onClick={() => (chime('open'), onOpen())}><Inbox /> Open the Inbox</Button>
      </div>
    </section>
  )
}

function ExampleHome(): React.JSX.Element {
  const none: Actions = { open: () => undefined, read: () => undefined }
  const card = (one: { id: string; kind: string; private: number; attribution: string | null }, type: Kind, title: string, at: string, extra: Partial<Card> = {}): Card =>
    ({ type, id: one.id, title, kind: one.kind, private: 0, at, who: one.attribution, ...extra })
  const tiles = exampleInbox().slice(0, 4).map((one) => card(one, 'capture', one.label, one.capturedAt))
  const ideas = exampleIdeas().slice(0, 3).map((one) => card(one, 'nugget', one.title, one.createdAt))
  const held = exampleQuestions().filter((one) => !one.closedAt).slice(0, 3).map((one) => card(one, 'question', one.title, one.createdAt, { clue: null }))
  return (
    <div className="flex flex-col gap-8 pt-2 pb-10">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-2 px-5 @[44rem]/page:px-8">
        {tiles.map((one) => <Tile key={one.id} card={one} pinned={false} actions={none} onHover={() => undefined} />)}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-8 px-3 @[44rem]/page:grid-cols-2 @[44rem]/page:px-6">
        <List title="Next up">{exampleTasks().slice(0, 3).map((task, _, all) => <TaskRow key={task.id} task={task} actions={none} room={markRoom(all)} />)}</List>
        <List title="Questions you're holding">
          {held.map((one) => (
            <ListRow key={one.id} card={one} actions={none} lead={<Orbit className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}>
              <span className="line-clamp-2 text-foreground">{one.title}</span>
            </ListRow>
          ))}
        </List>
      </div>
      <Quotes title="Coming back" cards={ideas} actions={none} />
    </div>
  )
}

/** A drawing's colour: its first tag's, else a tag colour picked from its id. */
const coverTint = (card: Card): string => tagColour(splitTags(card.title).tags[0] ?? card.id, null)

/**
 * No picture: Haligtree's own paper drawing in its colour, as every other card
 * without one wears, with its word set large over the shaded foot, the way a
 * radio cover is a name over its picture.
 */
function WordCover({ seed, tint, words, icon }: { seed: string; tint: string; words: string; icon?: ReactNode }): React.JSX.Element | null {
  const cover = useNoteCover(seed)
  if (!cover) return null
  return (
    <span aria-hidden className="absolute inset-0">
      <GrainFill cover={cover} tint={tint} shade={words ? 'foot' : 'none'} />
      {/* As every row's card: its kind, and its first words where a picture would be. */}
      <span className={`absolute inset-0 flex flex-col justify-between p-3 ${cover.paper ? '' : 'text-white'}`}>
        {icon ?? <span />}
        {words && <span className={`private-text line-clamp-4 text-xs leading-snug hyphens-auto [overflow-wrap:break-word] ${cover.paper ? '' : 'text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]'}`} style={cover.paper ? { color: PAPER_INK } : undefined}>{words}</span>}
      </span>
    </span>
  )
}


/** A card's own picture, or its own word on its colour where it has none. */
function Cover({ card, className = '' }: { card: Card; className?: string }): React.JSX.Element {
  const src = usePicture(card)
  const [broken, setBroken] = useState(false)
  const real = !!src && !broken
  return (
    <span className={`${className.includes('absolute') ? '' : 'relative'} overflow-hidden ${className}`}>
      {real ? <Picture src={src} onBroken={() => setBroken(true)} /> : (
        <WordCover seed={card.id} tint={coverTint(card)} words={wordsOf(card.excerpt)} icon={<KindIcon card={card} paper className="size-4 text-white/80 drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]" />} />
      )}
    </span>
  )
}

/**
 * What is coming back, laid out as a music app's "New release from" row:
 * the one most due held still on the left, the rest as numbered square
 * tiles that slide sideways beside it. Narrow, the feature sits on top.
 */
function Quotes({ title, onAll, onReview, cards, actions }: { title: ReactNode; onAll?: () => void; onReview?: () => void; cards: Card[]; actions: Actions }): React.JSX.Element {
  const [lead, ...rest] = cards
  const feature = (
    <RowMenu items={() => menuFor(lead, actions, cards, 0)}>
      <div data-coming-feature className="group/card relative flex h-full w-full min-w-0" data-private={lead.private ? '' : undefined}>
        {/* The tiles' own inset (ComingTile, p-1.5): its cover lines up with theirs, and its name gets the room, three lines of it. */}
        <div className="relative flex h-full w-full min-w-0 flex-col gap-3 overflow-hidden rounded-lg p-1.5 transition-colors duration-150 hover:bg-foreground/[0.05]">
          {/* The whole card opens it; the round buttons sit over it. */}
          <button type="button" aria-label={nameOf(lead)} data-nav data-private={lead.private ? '' : undefined} data-picked={actions.picked?.(lead) || undefined} data-drag-open={`${lead.type}:${lead.id}`} onClick={(event) => actions.open(lead, event)}
            className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
          <div className="pointer-events-none relative flex min-h-[calc(var(--card)-0.75rem)] flex-1 items-stretch gap-4">
            <Cover card={lead} className="aspect-square h-full shrink-0 rounded-lg shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--mf-shadow-ink)_35%,transparent)]" />
            <div className="flex min-w-[10rem] flex-1 flex-col justify-center gap-1 py-3 pr-4">
              <span className="truncate text-xs text-muted-foreground">{kindLabel(lead)} · {lead.sub ?? 'Coming back'}</span>
              <span className="private-text line-clamp-3 text-heading leading-tight font-semibold tracking-[-0.01em] hyphens-auto [overflow-wrap:break-word] text-foreground">{nameOf(lead)}</span>
              {/* Review now first, then Read, then the menu. */}
              <span className="pointer-events-auto flex items-center gap-2 pt-2 [&_button]:shrink-0">
                {onReview && (
                  <Tip label="Review now" offset={6}>
                    <button type="button" onClick={() => (chime('tap'), onReview())}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_color-mix(in_oklab,var(--mf-shadow-ink)_45%,transparent)] transition-[scale] duration-150 motion-safe:hover:scale-[1.04] active:scale-[0.95]">
                      <Repeat2 className="size-4" />
                    </button>
                  </Tip>
                )}
                {readable(lead) && <RoundRead onRead={() => actions.read(cards, 0)} className="!size-9 !bg-foreground/[0.08] !text-foreground !shadow-none hover:!bg-foreground/[0.12]" />}
                <Tip label="More" offset={6}><span className="flex"><MenuButton small items={() => flatMenu(menuFor(lead, actions, cards, 0))} /></span></Tip>
              </span>
            </div>
          </div>
          {lead.foot && <div className="relative px-1.5 pb-1.5">{lead.foot}</div>}
        </div>
      </div>
    </RowMenu>
  )
  return (
    <Row title="Also due" over="Waiting for you" onAll={onAll} lead={{ over: 'Due back today', title, node: feature }}>
      {rest.map((card, at) => <ComingTile key={`${card.type}:${card.id}`} card={card} list={cards} at={at + 1} actions={actions} />)}
    </Row>
  )
}

/** A square tile: its cover (picture, or its word on its colour), and what it says in grey under it. */
function ComingTile({ card, list, at, actions }: { card: Card; list: Card[]; at: number; actions: Actions }): React.JSX.Element {
  return (
    <RowMenu items={() => menuFor(card, actions, list, at)}>
      <div className="group/card relative flex w-(--card) shrink-0 snap-start">
        <div className="relative flex w-full">
          <button type="button" data-nav data-private={card.private ? '' : undefined} data-picked={actions.picked?.(card) || undefined} data-drag-open={`${card.type}:${card.id}`} onClick={(event) => actions.open(card, event)}
            className="flex w-full flex-col gap-2 rounded-lg p-1.5 text-left outline-none transition-[background-color,scale] duration-200 ease-(--mf-ease) hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.985]">
            <span className="relative block aspect-square w-full">
              <Cover card={card} className="absolute inset-0 rounded-lg shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--mf-shadow-ink)_35%,transparent)]" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 px-1 pb-1">
              <span className="private-text line-clamp-2 text-control leading-snug font-medium hyphens-auto [overflow-wrap:break-word] text-foreground">{nameOf(card)}</span>
              {card.sub && <span className="truncate pt-1 text-xs text-muted-foreground">{card.sub}</span>}
            </span>
          </button>
          {card.foot && <div className="px-1.5 pb-1.5">{card.foot}</div>}
          {readable(card) && (
            <span className="pointer-events-none absolute top-3 right-3">
              <RoundRead onRead={() => actions.read(list, at)}
                className="pointer-events-auto scale-90 opacity-0 group-focus-within/card:scale-100 group-focus-within/card:opacity-100 group-hover/card:scale-100 group-hover/card:opacity-100 group-hover/card:delay-100" />
            </span>
          )}
        </div>
      </div>
    </RowMenu>
  )
}

type Opened = { on: string; first: string }
const openedNow = (): Opened | null => {
  try {
    return JSON.parse(sessionStorage.getItem('haligtree:book-opened') ?? 'null') as Opened | null
  } catch {
    return null
  }
}

/**
 * The welcome's end, said on Home for the rest of the session: the day the
 * book was opened, on its own line in the book's hand, and the first thing
 * written in it during the welcome, if anything was. `fresh` while it has
 * just been said: Home's parts then come in after it, a little apart.
 */
function useOpened(): { opened: Opened | null; fresh: boolean } {
  const [opened, setOpened] = useState(openedNow)
  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    let off: ReturnType<typeof setTimeout> | undefined
    const now = (): void => {
      setOpened(openedNow())
      setFresh(true)
      clearTimeout(off)
      off = setTimeout(() => setFresh(false), 2400)
    }
    window.addEventListener('haligtree:book-opened', now)
    return () => (clearTimeout(off), window.removeEventListener('haligtree:book-opened', now))
  }, [])
  return { opened, fresh }
}

function BookOpened({ opened }: { opened: Opened }): React.JSX.Element {
  return (
    <div data-book-opened="" className="page-column relative w-full px-5 pt-6 @[44rem]/page:px-8">
      <p className="font-heading text-title font-light tracking-[-0.01em] text-foreground">Your book, opened {opened.on}.</p>
      {opened.first && <p className="mt-1 text-reading text-(--mf-muted-strong)">The first thing in it: <span className="font-heading italic">{quoted(opened.first)}</span></p>}
    </div>
  )
}

/**
 * "Caught this week" on the Week's page: the notes Home's "From this week"
 * row shows, as the same cards, so its Show all lands on what it promised.
 * Only this week's page has them: Home reads the current week alone.
 */
/** Set by Home's Show all: the Week's page opens at its notes. */
const TO_CAUGHT = 'haligtree:to-caught'
export function WeekCaught({ onOpen }: { onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const data = useLive(home, NONE, [], ['capture', 'item'])
  const captures = useCaptures()
  const fullMenu = useFullMenu()
  const pins = useLive(haligtree.pins, [] as Pinned[])
  const [reading, setReading] = useState<{ items: Readable[]; start: number } | null>(null)
  const opening = (card: Card): void => (chime('open'), onOpen?.(card.type, card.id))
  const actions: Actions = {
    open: (card, event) => (turns(card.type) ? heroOpen(event, () => onOpen?.(card.type, card.id)) : opening(card)),
    note: (card) => {
      const capture = card.type === 'capture' ? captures.find((one) => one.id === card.id) : null
      return fullMenu(card.type, card.id, () => opening(card)) ?? sideMenu(card.type, card.id, nameOf(card), { onOpen: () => opening(card), pinned: pins.some((pin) => pin.id === card.id), kind: capture?.kind, status: capture?.status })
    },
    read: (list, at) => {
      const items = list.filter(readable)
      setReading({ items: items.map((one) => ({ type: one.type, id: one.id })), start: Math.max(0, items.indexOf(list[at])) })
    }
  }
  const week = data.week.map((card) => ({ ...card, sub: card.sub ?? whenInLine(card.at) }))
  if (!week.length) return null
  return (
    <div data-week-caught className="-mx-5 mt-8 scroll-mt-6" ref={(box) => {
      // Opened from Home's Show all: brought into view once, as it first shows.
      if (box && sessionStorage.getItem(TO_CAUGHT)) (sessionStorage.removeItem(TO_CAUGHT), box.scrollIntoView({ block: 'start', behavior: glideWay() }))
    }}>
      <Row title="Caught this week">
        {week.map((card, at) => <RowCard key={`${card.type}:${card.id}`} card={card} list={week} at={at} actions={actions} />)}
      </Row>
      {reading && <ReadThrough items={reading.items} start={reading.start} onClose={() => setReading(null)} />}
    </div>
  )
}

export function HomeView({ onOpen, onView }: { onOpen: (type: string, id: string) => void; onView: (id: string, focus?: string) => void }): React.JSX.Element {
  // Left part way: a Review sitting, a quick capture draft, articles (beside the books in Continue reading).
  const resume = useResumeCards(onView)
  const data = useLive(home, NONE, [], ['capture', 'item'])
  const { opened, fresh } = useOpened()
  // Opened by pointer, the shelves come in top down, 20ms apart; by G H, or
  // back again this session, they are simply there. Decided once, as the page opens.
  const first = useFirstVisit('home')
  const [enter] = useState(() => first && !byKeys())
  const pins = useLive(haligtree.pins, [] as Pinned[])
  const fullMenu = useFullMenu()
  const tasks = useLive(haligtree.tasks, [] as Task[])
  const settings = useLive(haligtree.settings, null as Settings | null)
  const taskNow = useTaskNow()
  const taskTime = useTaskTime()
  const captures = useCaptures()
  const hidden = useLive(haligtree.snoozed, [] as string[])
  const showSnoozed = !!useLive(haligtree.settings, null as Settings | null)?.showSnoozed
  const [chip, setChip] = useState<Chip>('all')
  // The chosen chip's dark pill travels to the next one; pointing lights the nearest chip, never the gap.
  const chipRow = useRef<HTMLDivElement>(null)
  const chipHover = useFluidHover(chipRow, { items: ':scope > button', axis: 'xy' })
  const chipChosen = useChosen(chipRow, ':scope > button[aria-selected="true"]', chip)
  // The kind picked is kept in the step, so Back finds Home as you left it.
  useKept('tab', chip, setChip, 'all')
  const [reading, setReading] = useState<{ items: Readable[]; start: number } | null>(null)
  const [hover, setHover] = useState<{ src?: string; colour: string } | null>(null)
  const band = useTint(hover?.src, hover?.colour)
  const keep = (CHIPS.find((one) => one.id === chip) ?? CHIPS[0]).keep as (type: Kind) => boolean

  // Rot, drawn once a visit like the box's cards: never reshuffled under you.
  const [rot, setRot] = useState<Card[]>(() => unread([]))
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
    // ⇧-click picks, as in every list; a plain click opens.
    // A note's page turn is its one sound; a task or an event opens with a chime.
    // A note's tile grows into the note (lib/hero.ts).
    open: (card, event) => (event && several.click(event, card)) || (turns(card.type) ? heroOpen(event, () => onOpen(card.type, card.id)) : (chime('open'), onOpen(card.type, card.id))),
    picked: (card) => several.picked(card),
    menu: (card, own) => several.menu(card) ?? [...own, ...several.rowItems(card)],
    note: (card) => {
      const capture = card.type === 'capture' ? captures.find((one) => one.id === card.id) : null
      return fullMenu(card.type, card.id, () => (chime('open'), onOpen(card.type, card.id))) ?? sideMenu(card.type, card.id, nameOf(card), { onOpen: () => (chime('open'), onOpen(card.type, card.id)), pinned: pinned.has(card.id), kind: capture?.kind, status: capture?.status })
    },
    task: (card) => {
      const one = tasks.find((task) => task.id === card.id)
      return one ? taskMenu(one, { open: () => (chime('open'), onOpen('task', one.id)), now: taskNow }) : null
    },
    read: (list, at) => {
      const items = list.filter(readable)
      setReading({ items: items.map((one) => ({ type: one.type, id: one.id })), start: Math.max(0, items.indexOf(list[at])) })
    }
  }

  // The tiles: pinned first, then what you opened last, then what you changed last.
  const pinCards: Card[] = pins.map((pin) => ({ type: pin.type, id: pin.id, title: pin.title, kind: pin.kind, private: pin.private, at: pin.pinnedAt }))
  const tileSeen = new Set<string>()
  // What went to the Bin leaves Home at once, as it leaves every list.
  // So does what is settled: a capture made a task, a gem or marked done, a task done or in the Bin. Only a pin keeps one here, since a pin is asked for.
  const pinned = new Set(pins.map((pin) => pin.id))
  const binned = new Set([
    ...captures.filter((one) => one.status !== 'open').map((one) => one.id),
    ...tasks.filter((task) => task.status !== 'open').map((task) => task.id),
    // And what is hidden until a later day, unless asked for.
    ...(showSnoozed ? [] : hidden)
  ])
  const tiles = [...pinCards, ...data.opened, ...data.edited, ...(chip === 'questions' ? data.questions : [])]
    .filter((card) => keep(card.type) && (!binned.has(card.id) || (pinned.has(card.id) && captures.find((one) => one.id === card.id)?.status !== 'discarded' && tasks.find((task) => task.id === card.id)?.status !== 'dropped')) && !tileSeen.has(card.id) && (tileSeen.add(card.id), true))

  // Most pressing first, as the Tasks page has it, then by day.
  // Each task's day worked out once, not once per comparison: thousands of open tasks sorted on every draw.
  const nextUp = keep('task') ? tasks.filter((task) => task.status === 'open').map((task) => ({ task, at: placed(task) ?? Infinity }))
    .sort((a, b) => byPriority(a.task, b.task) || a.at - b.at).slice(0, chip === 'tasks' ? 12 : 5).map((one) => one.task) : []
  // Show all goes where the list's tasks are: Today when any is due by today, else Upcoming (later days and no date).

  // A letter to future you ("@1y") back today leads, set large, saying when you wrote it.
  const letter = captures.find((one) => one.snoozedUntil === dayKey() && one.status !== 'discarded' && backSaid(one) !== 'Back today')
  const feature = [
    letter && { card: { type: 'capture', id: letter.id, title: letter.label, kind: letter.kind, private: letter.private, at: letter.capturedAt, excerpt: '' } as Card, line: backSaid(letter) },
    data.memory && { card: data.memory, line: data.memory.memory },
    data.due[0] && { card: data.due[0], line: 'Due for review today' },
    data.article && { card: data.article, line: 'Your newest page' }
  ].find((one) => one && keep(one.card.type)) || null

  const dated = (card: Card): Card => ({ ...card, sub: card.sub ?? whenInLine(card.at) })
  const only = (cards: Card[]): Card[] => cards.filter((card) => keep(card.type) && !binned.has(card.id) && card.id !== feature?.card.id)
  // Not what the tiles already show: further back in what you had open or changed.
  const jumpSeen = new Set(tiles.slice(0, 8).map((card) => card.id))
  const jump = only([...data.opened, ...data.edited].filter((card) => !jumpSeen.has(card.id) && (jumpSeen.add(card.id), true)).map(dated)).slice(0, 12)
  // A decision or experiment whose day has come leads, settled right on its card.
  const returned = data.returning.map((one): Card => ({ ...one, type: one.type as Kind, excerpt: '', sub: backLine(one), foot: <KindBack one={one} onOpen={(type, id) => onOpen(type, id)} /> }))
  // A note back from hiding today leads too, saying so: a letter to future you says when you wrote it.
  const cameBack = captures.filter((one) => one.snoozedUntil === dayKey() && one.status !== 'discarded').map((one): Card => ({ type: 'capture', id: one.id, title: one.label, kind: one.kind, private: one.private, at: one.capturedAt, sub: backSaid(one) }))
  const back = only([...returned, ...cameBack, ...data.due.map((card) => ({ ...card, sub: 'Due for review' })), ...data.unseen.map((card) => ({ ...card, sub: 'Not seen in a while' }))]).slice(0, Math.max(6, returned.length))
  const questions = only(data.questions).slice(0, chip === 'questions' ? 12 : 4)
  const tidy = only(rot)
  const again = only(clusters)
  const tagRows = data.tags.map((one) => ({ ...one, cards: only(one.cards.map(dated)) })).filter((one) => one.cards.length)
  const week = only(data.week.map(dated))
  const [wide, setWide] = useState(true)
  // Every card on show, once each, for ⇧-click, x and ⌘A to pick from; a capture's status says whether it can still become a task.
  const statusOf = new Map(captures.map((one) => [one.id, one.status]))
  // Next up's tasks too, so ⇧-click, ⌘A and ⌫ reach them as everywhere else.
  const onShow: Pickable[] = [...tiles.slice(0, wide ? 8 : 4), ...(feature ? [feature.card] : []), ...nextUp.map((task) => ({ type: 'task', id: task.id, title: task.title, private: 0, status: task.status })), ...jump, ...back, ...questions, ...tidy, ...again, ...tagRows.flatMap((one) => one.cards), ...week]
    .map((card) => ({ type: card.type, id: card.id, title: card.title, private: card.private, status: card.type === 'capture' ? statusOf.get(card.id) : card.type === 'task' ? (card as { status?: string }).status : undefined }))
  const several = usePickMixed(onShow, { here: useHere() })

  // Arrows move to the nearest card that way, ↵ opens: each card is a button.
  const root = useRef<HTMLDivElement>(null)
  // Split, only the pane in front answers keys.
  const ours = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!ours()) return
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
        to.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: glideWay() })
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

  // Not while Home is still loading: an empty page flashed first took the
  // page's one voice from its hint (lib/motion.ts).
  const loading = [data, captures, tasks, pins].some(unloaded)
  // Drawn once, with every card's read in (lib/reads-in.tsx): before, the goals, the marked day and the cards came in one by one, each pushing the rest down.
  const { provide, style: readsStyle } = useReadsIn(loading || unloaded(hidden) || unloaded(repeats) || unloaded(rot))
  const empty = !loading && !captures.length && !data.edited.length && !tasks.length && !pins.length
  // Getting started on screen (GettingStarted's own rule): one guide at a time, so no Example under it.
  const guide = useOnboarding()
  const starting = !!guide && !guide.sandbox && !!guide.welcomed && !guide.hidden && !(guide.doneAt && Date.now() - new Date(guide.doneAt).getTime() > LINGER)
  // Four tiles across with room for them, two in a small window (its state is kept up top, with what is on show).
  useLayoutEffect(() => {
    const box = root.current
    if (!box) return
    const watch = new ResizeObserver(() => setWide(box.clientWidth >= 704))
    watch.observe(box)
    return () => watch.disconnect()
  }, [])
  const shownTiles = tiles.slice(0, wide ? 8 : 4)
  const nothing = !loading && !feature && !nextUp.length && !jump.length && !back.length && !questions.length && !tidy.length && !again.length && !tagRows.length && !week.length

  return provide(
    <div ref={root} style={readsStyle} className={`mf-more relative flex min-w-0 flex-1 flex-col overflow-y-auto ${PICKED_CARD} ${fresh ? 'mf-opened' : ''}`}>
      {/* What is picked, and what can be done with it all: held at the top while you scroll. Opaque, never over the cards see-through. */}
      {several.bar && (
        <div data-pick-bar className="sticky top-0 z-30 w-full border-b bg-background">
          <div className="page-column flex min-h-11 items-center px-5 py-1.5 @[44rem]/page:px-8">{several.bar}</div>
        </div>
      )}
      {/* The band: the colour of the tile you point at, run down behind the top and faded into the page. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[20rem] transition-[background-color] duration-500 ease-(--mf-ease)"
        style={{ backgroundColor: band ?? 'transparent', maskImage: 'linear-gradient(to bottom, black 0%, black 20%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 20%, transparent 100%)' }} />
      {opened && <BookOpened opened={opened} />}
      {/* Back after a long absence: the one thing you were last in, one click back. */}
      <WelcomeBack onOpen={onOpen} onView={onView} />
      {/* Your goals, quiet, above everything else, once asked for: the nearest few or the ones chosen (Settings, “Goals on Home”; a goal's “Show on Home”). */}
      <GoalStrip onOpen={(type, id) => (type === 'view' ? onView(id) : onOpen(type, id))} className="page-column relative w-full px-3 pt-3 @[44rem]/page:px-6" />
      {/* Now: the one card that fits the moment on top, the rest behind "2
          more" (now-slot.tsx). Each keeps its own moment; ranked here by how
          much it belongs to right now: the evening's close, Sunday's week, a
          marked day coming, what is new, then the steady ones. */}
      <NowSlot inset>
      {/* The next marked day, counted down, under the goals. */}
      <div data-now={3} className="page-column relative w-full px-3 pt-1 empty:hidden @[44rem]/page:px-6"><NextMark className="w-full px-2 py-1.5 hover:bg-foreground/[0.045]" /></div>
      {/* The reading queue, small: the next few, and Start reading. */}
      <div data-now={5} className="page-column relative w-full px-3 pt-2 empty:hidden @[44rem]/page:px-6"><QueuePanel onView={(id) => onView(id)} /></div>
      {/* Once a week, the oldest question still held: an old question should not look like a new one. */}
      <div data-now={4.5} className="page-column relative w-full px-3 pt-2 empty:hidden @[44rem]/page:px-6"><StillWondering onOpen={onOpen} /></div>
      {/* After the welcome: the firsts, ticking themselves, until they are done. */}
      <div className="page-column relative w-full px-3 pt-4 empty:hidden @[44rem]/page:px-6"><GettingStarted onOpen={onOpen} onView={onView} /></div>
      <div data-now={6} className="page-column relative w-full px-3 pt-3 empty:hidden @[44rem]/page:px-6"><PowersLine onView={onView} /></div>
      {/* A practice at its time: asked here while this window is in front, and waiting here once the corner's card has let it go. */}
      <div data-now={0.5} className="page-column relative w-full px-3 pt-3 empty:hidden @[44rem]/page:px-6"><PracticeNow /></div>
      {/* In the evening, once: the offer to close the day. */}
      <div data-now={1} className="page-column relative w-full px-3 pt-3 empty:hidden @[44rem]/page:px-6"><CloseDayOffer /></div>
      {/* In the morning, once: the offer to sort the Inbox in about ten minutes. */}
      <div data-now={1} className="page-column relative w-full px-3 pt-3 empty:hidden @[44rem]/page:px-6"><MorningSortOffer /></div>
      {/* On Sundays: the week in four numbers. */}
      <div data-now={2} className="page-column relative w-full px-3 pt-3 empty:hidden @[44rem]/page:px-6"><WeeklyDigest onView={onView} /></div>
      {/* After an update, once: what is new since you last looked. */}
      <div data-now={4} className="page-column relative w-full px-3 pt-3 empty:hidden @[44rem]/page:px-6"><WhatsNewCard onView={onView} /></div>
      {/* The day's Feed, until you reach its end. */}
      <div data-now={4.6} className="page-column relative w-full px-3 pt-3 empty:hidden @[44rem]/page:px-6"><TodaysFeedCard onView={onView} /></div>
      </NowSlot>
      {/* On Home: the month, once turned on in Settings, and what waits in the Inbox. */}
      <div data-home-plan className="page-column relative flex w-full flex-col gap-6 px-5 pt-4 @[44rem]/page:px-8">
        {/* The first week of a month: last month, card by card, Wrapped's way. */}
        {dayjs().date() <= 7 && <p data-home-your-month className="text-body text-(--mf-muted-strong)"><button type="button" className="cursor-pointer font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60" onClick={() => (chime('slide'), onView('stats', 'yourmonth'))}>Your {dayjs().subtract(1, 'month').format('MMMM')} is ready</button>, card by card.</p>}
        {settings?.homeTimeGone === true && <TimeGone heading={<Heading title="Time gone" />} />}
        {settings?.homeCalendar === true && <MonthPlan tasks={tasks} onDay={(day) => onView('day', day)} onOpen={onOpen} onWeek={(monday) => onView('weekpage', monday)} onMonth={(month) => onView('monthpage', month)} />}
        <div className="grid gap-x-8 gap-y-6 @[44rem]/page:grid-cols-[minmax(0,1fr)_auto]">
          <InboxLine count={unloaded(captures) ? null : captures.filter((one) => one.status === 'open' && !one.archivedAt).length} onOpen={() => onView('inbox')} />
        </div>
      </div>
      {empty && starting ? null : empty ? (
        // Nothing yet: Home as it will look, with a few made-up shelves, dimmed and out of reach.
        <Example className="page-column relative w-full" tryIt={<>
          <strong><button type="button" onClick={() => (chime('open'), window.api.showPrompt())} className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">catch a thought</button> with ⌘. from anywhere, or <button type="button" onClick={() => void window.api.importFrom('vault')} className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">bring your notes in</button>.</strong> What you open, keep and wonder about gathers here.
        </>}>
          <ExampleHome />
        </Example>
      ) : (
        <div className={`page-column relative flex flex-col gap-8 pt-8 pb-10 @[44rem]/page:pt-9 ${enter ? 'mf-stagger' : ''}`}>
          <div className="flex flex-col gap-4">
            {/* What the page holds: first, so nothing above it changes as a chip is picked. */}
            <div ref={chipRow} {...chipHover.handlers} role="tablist" aria-label="Show" className="relative isolate flex flex-wrap gap-1.5 px-5 @[44rem]/page:px-8">
              <Highlight chosen={chipChosen} travel={spring.moderate} className="rounded-full bg-foreground" />
              <Highlight light={chipHover.light} className="rounded-full bg-foreground/[0.05]" />
              {CHIPS.map((one) => (
                <button key={one.id} type="button" role="tab" aria-selected={chip === one.id}
                  onClick={() => void (chip !== one.id && (chime('tap'), setChip(one.id)))}
                  className={`h-7 rounded-full px-3 text-control transition-[background-color,color] duration-160 ${chip === one.id ? 'text-background' : 'bg-foreground/[0.06] text-foreground/85'}`}>
                  <Weighted on={chip === one.id}>{one.label}</Weighted>
                </button>
              ))}
            </div>
            {/* What comes back to you today, first under the chips, as the page's own line says; the shelves of what you kept under it. */}
            {feature && <Feature card={feature.card} line={feature.line} actions={actions} />}
          </div>
          <div className="flex flex-col gap-4 empty:hidden">
            {/* What the tiles are, said once: a newcomer should not have to guess. Under the
                chips, so a chip with no tiles never moves the chips under the pointer. */}
            {shownTiles.length > 0 && <div className="px-5 @[44rem]/page:px-8"><Heading title={pins.length ? 'Pinned, and what you opened lately' : 'What you opened lately'} /></div>}
            {shownTiles.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-2 px-5 @[44rem]/page:px-8">
                {shownTiles.map((card) => <Tile key={card.id} card={card} pinned={pinned.has(card.id)} actions={actions} onHover={(look) => startTransition(() => setHover(look))} />)}
              </div>
            )}
          </div>

          {/* The books part way through: each opens at the page you left it. */}
          <ContinueReading extra={resume} heading={() => <Heading title="Continue reading" onAll={() => (showMediaKind('pdf'), onView('media'))} />} />

          {(nextUp.length > 0 || questions.length > 0) && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-8 px-3 @[44rem]/page:grid-cols-2 @[44rem]/page:px-6">
              {nextUp.length > 0 && (
                <List title="Next up" onAll={() => onView(nextUp.some((task) => (placed(task) ?? Infinity) < startOfDay(1)) ? 'today' : 'upcoming')}>
                  {nextUp.map((task) => <TaskRow key={task.id} task={task} actions={actions} room={markRoom(nextUp)} time={taskTime} />)}
                </List>
              )}
              {questions.length > 0 && (
                <List title="Questions you're holding" onAll={() => onView('questions')}>
                  {questions.map((card) => (
                    <ListRow key={card.id} card={card} actions={actions} lead={<Orbit className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}>
                      <span className="private-text line-clamp-2 hyphens-auto [overflow-wrap:break-word] text-foreground">{nameOf(card)}</span>
                      {/* Never the question again: a first clue that only repeats its words is left out. */}
                      {!(card.clue && flat(card.title) && flat(card.clue).startsWith(flat(card.title))) && <span className="line-clamp-1 text-xs text-muted-foreground">{card.clue ? `${quoted(card.clue.replace(/\s+/g, ' '), 80)}` : 'No clues yet'}</span>}
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

          {back.length > 0 && <Quotes title="Coming back" onAll={() => onView('review')} onReview={() => onView('review')} cards={back} actions={actions} />}

          <SourcesRow onAll={() => onView('sources')} />

          {(tidy.length > 0 || again.length > 0) && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-8 px-3 @[44rem]/page:grid-cols-2 @[44rem]/page:px-6">
              {tidy.length > 0 && (
                <List title="Old captures to tidy" onAll={() => onView('inbox')}>
                  {tidy.map((card) => (
                    <ListRow key={card.id} card={card} actions={actions} lead={<KindMark card={card} grain={false} className="mt-px size-5 shrink-0 rounded-[5px] [&_svg]:size-3" />}
                      aside={<span className="mt-0.5 shrink-0 text-xs text-muted-foreground">{whenInLine(card.at)}</span>}>
                      <span className="private-text line-clamp-2 hyphens-auto [overflow-wrap:break-word] text-foreground">{nameOf(card)}</span>
                    </ListRow>
                  ))}
                </List>
              )}
              {again.length > 0 && (
                <List title="You keep coming back to this">
                  {again.map((card) => (
                    <ListRow key={card.id} card={card} actions={actions} lead={<Repeat2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                      aside={<span className="mt-0.5 shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{card.count}×</span>}>
                      <span className="private-text line-clamp-2 hyphens-auto [overflow-wrap:break-word] text-foreground">{nameOf(card)}</span>
                      {card.sub && <span className="text-xs text-muted-foreground">{card.sub}</span>}
                    </ListRow>
                  ))}
                </List>
              )}
            </div>
          )}

          {tagRows.map(({ tag: name, color, cards }) => (
            <Row key={name} title={<>More from <button type="button" data-home-tag={name} {...hoverNote('tag', name)} onClick={() => (chime('page'), onView('tags', name))}
              className="rounded px-0.5 decoration-1 underline-offset-4 transition-colors duration-80 hover:bg-[color-mix(in_oklab,var(--tag-ink)_18%,transparent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              style={{ color: tagColour(name, color), '--tag-ink': tagColour(name, color) } as React.CSSProperties}>#{name}</button></>} onAll={() => onView('tags', name)}
              menu={[{ label: `Hide #${name} from Home`, hint: 'Another tag takes its place. Bring it back from the tag’s own page.', run: () => sayNow(haligtree.setTag(name, { homeHidden: true }), `#${name} is off Home`, () => void haligtree.setTag(name, { homeHidden: false })) }]}>
              {cards.map((card, at) => <RowCard key={`${card.type}:${card.id}`} card={card} list={cards} at={at} actions={actions} />)}
            </Row>
          ))}

          {week.length > 0 && (
            <Row title="From this week" onAll={() => (sessionStorage.setItem(TO_CAUGHT, '1'), onView('weekpage'))}>
              {week.map((card, at) => <RowCard key={`${card.type}:${card.id}`} card={card} list={week} at={at} actions={actions} />)}
            </Row>
          )}

          {nothing && (
            <p className="px-5 text-control text-muted-foreground @[44rem]/page:px-8">
              {chip === 'all' ? 'Nothing is waiting to come back yet. It will, as you open and keep things.' : `No ${CHIPS.find((one) => one.id === chip)!.label.toLowerCase()} to bring back yet.`}
            </p>
          )}
          {settings?.safeMode && <p data-safe-note className="px-5 text-body text-foreground @[44rem]/page:px-8"><strong className="font-semibold">Safe mode is on</strong>, so nothing comes back on its own.</p>}
        </div>
      )}
      {reading && <ReadThrough items={reading.items} start={reading.start} onClose={() => setReading(null)} />}
    </div>
  ) as React.JSX.Element
}

/** How much of your notes a person or work holds, as the Sources page says it. */
const tallyOf = (one: SourceSummary): string => {
  const rest = one.count - one.quotes
  return [one.quotes ? plural(one.quotes, 'quote') : '', rest ? plural(rest, one.quotes ? 'other note' : 'note') : ''].filter(Boolean).join(' · ')
}

/**
 * The people and works your notes come from, the ones you took from last
 * first: a person as a round face, a work as a square cover with its name on
 * its own colour, the way a music app mixes artists and albums in one row.
 */
function SourcesRow({ onAll }: { onAll: () => void }): React.JSX.Element | null {
  const list = useLive(sources.list, [] as SourceSummary[])
  const shown = list.filter((one) => one.count > 0 && !one.work).sort((a, b) => b.last.localeCompare(a.last)).slice(0, 12)
  if (shown.length < 2) return null
  return (
    <Row title="Your sources" over="Who and what you took from lately" onAll={onAll}>
      {shown.map((one) => {
        const person = one.field === 'attribution'
        return (
          <div key={`${one.field}:${one.name}`} className="flex w-(--card) shrink-0 snap-start">
            <button type="button" data-home-source={one.name} onClick={(event) => (chime('page'), heroOpen(event, () => openSource(one.field, one.name)))}
              className="group/src flex w-full flex-col gap-2 rounded-lg p-1.5 text-left outline-none transition-[background-color,scale] duration-200 ease-(--mf-ease) hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.985]">
              {person
                ? <span className="block aspect-square w-full overflow-hidden rounded-full"><Avatar name={one.name} size={160} className="!size-full" /></span>
                : (
                  <span className="relative block aspect-square w-full overflow-hidden rounded-lg shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--mf-shadow-ink)_35%,transparent)] [filter:brightness(0.82)_contrast(1.35)] transition-[filter] duration-200 ease-(--mf-ease) group-hover/src:[filter:none] group-focus-visible/src:[filter:none]"><WordCover seed={`source:${one.name}`} tint={tagColour(one.name, null)} words="" /></span>
                )}
              <span className="flex min-w-0 flex-col gap-0.5 px-1 pb-1">
                <span className="truncate text-control font-medium text-foreground">{one.name}</span>
                <span className="truncate text-xs text-muted-foreground">{person ? 'Person' : 'Source'} · {tallyOf(one)}</span>
              </span>
            </button>
          </div>
        )
      })}
    </Row>
  )
}
