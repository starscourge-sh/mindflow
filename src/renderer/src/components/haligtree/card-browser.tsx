import type { Occlusion } from '../../../../main/occlusion'
import { DOT_INK, DotEnds, DotRule, SQUARE, SQUARE_GAP, SQUARE_STEP, pagesPerDot } from './time-dots'
import { TabControls, useToolbarCompact } from './review-toolbar'
import { swallowRelease } from './carry'
import { TABLE_LEAD, TABLE_NAME, TABLE_QUIET, TABLE_ROW, TABLE_WHEN, TableHead } from './table-look'
import { PICKED_ROW } from './task-pick'
import { TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { call, haligtree, useLive, type Due } from '@/lib/haligtree'
import { canSplit, openAside, useHere } from '@/lib/split'
import { ofTheWriting } from '@/lib/writing-floats'
import { binItem } from '@/lib/to-bin'
import type { Node as ProseNode } from '@tiptap/pm/model'
import { HaligtreeEditor } from './haligtree-editor'
import { num, plural } from '../../../../main/dates'
import { Chips, Display, arrange, useView, type Choice, type Density, type Facet } from './display'
import { IslandBox, useIslands } from './islands'
import { ListSearch } from './note-list'
import { usePickMixed } from './pick-mixed'
import { RowMenu, type RowItem } from './row-menu'
import { WithPictures } from './with-pictures'
import { PasteCards } from './paste-cards'
import { NewCard } from './new-card'
import { SplitForm } from './study'
import { AnotherWay } from './another-way'
import { FlipThrough, Poster, Windowed, groupTint } from './card-shelves'
import { deckTitle, makeDeck, useMadeDecks } from './decks'
import { Empty, Tip, toast, typing } from './ui'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/** One card as the browser lists it (haligtree.ts `cards:all`). */
export type BrowsedCard = { id: string; prompt: string; title: string; answer: string; tags: string[]; dueAt: string | null; createdAt: string; paused: boolean; difficulty: number | null; reviews: number; stage: 'new' | 'learning' | 'learnt'; /** Remembered across a gap of 15 days or more. */ known: boolean; /** Things the answer asks for; past 4 it is too big. */ things: number; /** Seconds it takes you, from 2 or more timed reviews. */ seconds: number | null
  /** Times forgotten after being learnt; a leech at 4. */ lapses: number; leech: boolean
  /** The book, video or shared deck it came from, and where in it ("p. 3", "12:40"). */ source: string; at: string
  made: 'pdf' | 'line' | 'deck' | 'typed'; picture: string | null
  /** Made by covering a picture: drawn as Study draws it, never as its words alone. */
  occlusion?: Occlusion | null }

const DAY = 86400000
const today = (): number => new Date().setHours(0, 0, 0, 0)

// The words Anki users know, each in the colour the counts above use.
/** Each stage: its full name for the Stage filter and grouping, where it is explained once, and one short word for a row's cell. */
const STAGES: { id: string; label: string; word: string; tint: string }[] = [
  { id: 'new', label: 'Not studied yet', word: 'Not studied', tint: 'var(--tt-color-text-blue)' },
  { id: 'learning', label: 'Learning', word: 'Learning', tint: 'var(--tt-color-text-orange)' },
  { id: 'learnt', label: 'Learnt (gaps under 15 days)', word: 'Learnt', tint: 'var(--tt-color-text-green)' },
  { id: 'known', label: 'Known (remembered after 15 days)', word: 'Known', tint: 'var(--tt-color-text-purple)' }
]
const stageOf = (card: BrowsedCard): string => (card.known ? 'known' : card.stage)
const tintOf = (card: BrowsedCard): string => STAGES.find((one) => one.id === stageOf(card))!.tint

// When it is due, in bands: overdue before today, today, the next 7 days, later.
const DUES = ['Overdue', 'Today', 'This week', 'Later', 'New', 'Paused']
function dueBand(card: BrowsedCard): string {
  if (card.paused) return 'Paused'
  if (!card.dueAt) return 'New'
  const at = Date.parse(card.dueAt)
  return at < today() ? 'Overdue' : at < today() + DAY ? 'Today' : at < today() + 8 * DAY ? 'This week' : 'Later'
}

// How hard, by FSRS's difficulty (1 to 10).
const HARDS = ['Very hard', 'Hard', 'Medium', 'Easy', 'Not reviewed yet']
const hardBand = (card: BrowsedCard): string => card.difficulty === null ? 'Not reviewed yet' : card.difficulty >= 8 ? 'Very hard' : card.difficulty >= 6 ? 'Hard' : card.difficulty >= 4 ? 'Medium' : 'Easy'

// Needs work, by the numbers the research gives: 40 seconds or more, more than 4 things, forgotten twice, a leech at 4.
const NEEDS: Choice[] = [
  { id: 'leech', label: 'Leeches', tip: 'Forgotten 4 times or more after being learnt' },
  { id: 'forgot', label: 'Forgotten often', tip: 'Forgotten 2 or 3 times after being learnt' },
  { id: 'big', label: 'Too big', tip: 'The answer asks for more than 4 things' },
  { id: 'slow', label: 'Slow', tip: '40 seconds or more each time' }
]
const needs = (card: BrowsedCard): string[] => [card.leech && 'leech', card.lapses >= 2 && !card.leech && 'forgot', card.things > 4 && 'big', (card.seconds ?? 0) >= 40 && 'slow'].filter(Boolean) as string[]
const NEED_NAME = (id: string): string => NEEDS.find((one) => one.id === id)?.label ?? 'Fine as they are'

const MADE: Choice[] = [
  { id: 'pdf', label: 'A PDF' },
  { id: 'line', label: 'A note line' },
  { id: 'deck', label: 'A shared deck' },
  { id: 'typed', label: 'Typed' }
]

/** Where in its source a card sits, as a number: "p. 12" is 12, "1:02:03" is 3723 seconds. */
function spot(card: BrowsedCard): number {
  if (/\d:\d/.test(card.at)) return card.at.split(':').reduce((sum, part) => sum * 60 + (Number(part.replace(/\D/g, '')) || 0), 0)
  const page = /\d+/.exec(card.at)
  return page ? Number(page[0]) : Infinity
}
const pageOf = (card: BrowsedCard): number | null => (/\d:\d/.test(card.at) ? null : /\d+/.exec(card.at) ? Number(/\d+/.exec(card.at)![0]) : null)

/** The deck it came in, or its first tag, the whole of it (#biology-cells, not #biology): what a person means by "which deck". */
const deckOf = (card: BrowsedCard): string => (card.made === 'deck' ? card.source : card.tags[0] ? `#${card.tags[0]}` : 'No deck')

const SORTS: Choice[] = [
  { id: 'due', label: 'Due soonest' },
  // Turned round, Oldest: 'first', not 'oldest', which useView reads as Oldest untouched, another list's order.
  { id: 'newest', label: 'Newest', reverse: { id: 'first', label: 'Oldest' } },
  { id: 'hard', label: 'Hardest' },
  { id: 'slow', label: 'Slowest' },
  { id: 'forgot', label: 'Most forgotten' },
  { id: 'az', label: 'A to Z' },
  { id: 'page', label: 'Page order', hint: 'By source, then page or time in it' }
]
/** Dates and the like, compared as they are written: localeCompare skips punctuation, so it misorders times. */
const plain = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const ORDER: Record<string, (a: BrowsedCard, b: BrowsedCard) => number> = {
  // Due first, then new (never asked), then paused.
  due: (a, b) => plain(a.paused ? '~' : a.dueAt ?? '9', b.paused ? '~' : b.dueAt ?? '9'),
  newest: (a, b) => plain(b.createdAt, a.createdAt),
  first: (a, b) => plain(a.createdAt, b.createdAt),
  hard: (a, b) => (b.difficulty ?? -1) - (a.difficulty ?? -1),
  slow: (a, b) => (b.seconds ?? -1) - (a.seconds ?? -1),
  forgot: (a, b) => b.lapses - a.lapses,
  az: (a, b) => a.prompt.localeCompare(b.prompt, undefined, { sensitivity: 'base', numeric: true }),
  page: (a, b) => Number(!a.source) - Number(!b.source) || a.source.localeCompare(b.source) || spot(a) - spot(b)
}

const GROUPS: Choice[] = [
  { id: 'none', label: 'None' },
  { id: 'deck', label: 'Deck' },
  { id: 'source', label: 'Source' },
  { id: 'stage', label: 'Stage' },
  { id: 'due', label: 'When due' },
  { id: 'hard', label: 'How hard' },
  { id: 'made', label: 'Month made' },
  { id: 'needs', label: 'Needs work' }
]
const month = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
/** Each grouping: what a card's group is called, and the order the groups go in. */
const GROUPING: Record<string, { of: (card: BrowsedCard) => string; rank: (name: string, list: BrowsedCard[]) => number | string }> = {
  deck: { of: deckOf, rank: (name, list) => (name === 'No deck' ? 1e9 : -list.length) },
  source: { of: (card) => card.source || 'No source', rank: (name) => `${Number(name === 'No source')}${name.toLowerCase()}` },
  stage: { of: (card) => STAGES.find((one) => one.id === stageOf(card))!.label, rank: (name) => STAGES.findIndex((one) => one.label === name) },
  due: { of: dueBand, rank: (name) => DUES.indexOf(name) },
  hard: { of: hardBand, rank: (name) => HARDS.indexOf(name) },
  made: { of: (card) => month(card.createdAt), rank: (_, list) => -Date.parse(list[0].createdAt) },
  needs: { of: (card) => NEED_NAME(needs(card)[0] ?? ''), rank: (name) => { const at = NEEDS.findIndex((one) => one.label === name); return at < 0 ? 99 : at } }
}

/** All cards' columns after the stage, the same in List and Table (and Table's heads over them). */
const COLUMNS = { name: 'basis-0', answer: 'flex-1 basis-0', decks: 'w-32 text-right', when: 'w-[5.5rem]' }

/** When it is next asked, in words: "due now", "in 3 days", "new". */
function dueSaid(card: BrowsedCard): string {
  if (card.paused) return 'paused'
  if (!card.dueAt) return 'new'
  const at = Date.parse(card.dueAt)
  if (at <= Date.now()) return 'due now'
  // Counted in whole days from today, as the counts above count "due now".
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - today()) / DAY)
  return days === 0 ? 'later today' : days === 1 ? 'tomorrow' : `in ${num(days)} days`
}

/**
 * The answer as the list shows it: where it opens with the question's own
 * term ("Dot product: An operation on..."), the repeat is dropped.
 */
function answerShown(card: BrowsedCard): string {
  const answer = card.answer || ''
  const quoted = /[“"]([^”"]{2,80})[”"]/.exec(card.prompt)?.[1]
  for (const term of [quoted, card.title, card.prompt.replace(/\?$/, '')].filter(Boolean) as string[]) {
    const lead = new RegExp(`^${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:\u2013\u2014-]\\s*`, 'i')
    if (lead.test(answer)) return answer.replace(lead, '').replace(/^\p{Ll}/u, (one) => one.toUpperCase()).replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, '').trim()
  }
  return answer.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, '').trim()
}

/** A tag, and the tags under it: #biology takes in #biology-cells. */
const under = (tags: string[], tag: string): boolean => tags.some((one) => one === tag || one.startsWith(`${tag}-`))

/**
 * A group's next 30 days of reviews as 30 thin bars, today first (with what
 * is overdue): where a deck's reviews are about to pile up, seen before they do.
 */
/** How many of a group's cards are due now, said in its heading beside the count; nothing when none are. */
function DueNow({ cards }: { cards: BrowsedCard[] }): React.JSX.Element | null {
  const due = cards.filter((card) => !card.paused && card.dueAt && Date.parse(card.dueAt) <= Date.now()).length
  return due ? <span data-group-due={due} className="text-xs font-medium text-foreground tabular-nums">{num(due)} due now</span> : null
}

function DueAhead({ cards }: { cards: BrowsedCard[] }): React.JSX.Element | null {
  const days = Array.from({ length: 30 }, () => 0)
  for (const card of cards) {
    if (card.paused || !card.dueAt) continue
    const at = Math.max(0, Math.floor((Date.parse(card.dueAt) - today()) / DAY))
    if (at < 30) days[at] += 1
  }
  const total = days.reduce((sum, n) => sum + n, 0)
  if (!total) return null
  const most = Math.max(...days)
  const peak = days.indexOf(most)
  const when = peak === 0 ? 'today' : peak === 1 ? 'tomorrow' : new Date(today() + peak * DAY).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const said = `${num(total)} due in the next 30 days, most ${when} (${num(most)})`
  return (
    <Tip label={said}>
      <span role="img" data-due-ahead={total} aria-label={said} className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
        <svg width={60} height={14} viewBox="0 0 60 14" aria-hidden className="text-(--mf-muted-strong)">
          {days.map((n, at) => <rect key={at} x={at * 2} y={14 - Math.max(n ? 2 : 1, (n / most) * 14)} width={1.4} height={Math.max(n ? 2 : 1, (n / most) * 14)} fill="currentColor" opacity={n ? (at === peak ? 1 : 0.75) : 0.3} />)}
        </svg>
        <span className="tabular-nums">{num(total)} in 30 days</span>
      </span>
    </Tip>
  )
}

/** Whether a book's cards sit on two pages or more: enough for a coverage bar. */
export const coverageOf = (cards: BrowsedCard[]): boolean => new Set(cards.map(pageOf).filter((one) => one !== null)).size >= 2

/**
 * A book's pages as a row of squares (time-dots.tsx), from page 1 to the last
 * page with a card: solid where a stretch of pages has cards, faint where it
 * has none, so the parts of a book you never made cards from show at a glance.
 * The point first, then what a square is; the squares wrap, never stretch.
 */
export function Coverage({ cards }: { cards: BrowsedCard[] }): React.JSX.Element | null {
  const pages = [...new Set(cards.map(pageOf).filter((one): one is number => one !== null))]
  if (!coverageOf(cards)) return null
  const last = Math.max(...pages)
  const per = pagesPerDot(last)
  const dots = Math.ceil(last / per)
  const lit = new Set(pages.map((page) => Math.floor((page - 1) / per)))
  return (
    <div data-coverage className="grid min-w-0 gap-1.5 px-2 pt-1 pb-2">
      <DotRule><span data-coverage-said className="font-medium text-foreground tabular-nums">{num(pages.length)} of {num(last)} pages have cards.</span> Each square is {per === 1 ? 'a page' : `${num(per)} pages`}, solid where there are cards.</DotRule>
      <div className="max-w-full" style={{ width: Math.min(dots, 30) * SQUARE_STEP - SQUARE_GAP }}>
        <div aria-hidden data-coverage-dots className="grid" style={{ gridTemplateColumns: `repeat(auto-fill, ${SQUARE}px)`, gap: SQUARE_GAP }}>
          {Array.from({ length: dots }, (_, at) => <span key={at} data-dot={lit.has(at) ? 'lit' : 'none'} className="size-2.5 rounded-[2px]" style={{ background: lit.has(at) ? DOT_INK.gone : DOT_INK.ahead }} />)}
        </div>
        <DotEnds left="p. 1" right={`p. ${num(last)}`} />
      </div>
    </div>
  )
}

/**
 * A card opened to edit where it sits: the question over the answer, in the
 * card's own type with no boxes, as Things and Linear open a row. The answer
 * is the app's editor (formatting, formulas, pictures, #tags); the source is
 * a line under it. Enter keeps (⇧Enter a new line in the answer), Esc drops.
 */
function EditCard({ card, tint, onDone }: { card: BrowsedCard; tint: string; /** `next`: another card clicked while this one was open, to open now. */ onDone: (next?: string) => void }): React.JSX.Element {
  const [body, setBody] = useState<unknown>(undefined)
  const [prompt, setPrompt] = useState(card.prompt)
  const [source, setSource] = useState(card.made === 'deck' ? '' : card.source)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => void haligtree.item(card.id).then((full) => setBody(full?.body ?? '')), [card.id])
  // What it held when opened (or last kept), and its answer as it is now: a card closed any other way than Esc
  // (Back, ⌘[, a swipe, another page) is kept if it changed since then, and only then, so opening it saves nothing.
  const kept = useRef({ prompt: card.prompt, source: card.made === 'deck' ? '' : card.source, doc: null as ProseNode | null })
  const doc = useRef<ProseNode | null>(null)
  const dropped = useRef(false)
  const changed = (): boolean => prompt !== kept.current.prompt || source !== kept.current.source || !!(doc.current && kept.current.doc && !doc.current.eq(kept.current.doc))
  // `close` false: kept, and left open for a Back or Forward press to move off, as its step says.
  const keep = (other?: string, close = true): void => {
    const next = doc.current?.toJSON()
    kept.current = { prompt, source, doc: doc.current }
    const asked = prompt.trim() || card.prompt
    const was = { prompt: card.prompt, body, medium: card.made === 'deck' ? undefined : card.source || null }
    void haligtree.saveItem(card.id, { prompt: asked, ...(next ? { body: next } : {}), ...(card.made === 'deck' ? {} : { medium: source.trim() || null }) }).then(() => {
      chime('noted')
      toast('Card kept', () => void haligtree.saveItem(card.id, { prompt: was.prompt, body: was.body, ...(was.medium !== undefined ? { medium: was.medium } : {}) }).then(() => chime('undo')))
    })
    if (close) onDone(other)
  }
  const drop = (): void => ((dropped.current = true), chime('fold'), onDone())
  // Clicked away, it is kept, as a row edited in Things is. A click, not a blur:
  // focus moved by something else (a closing menu handing focus back to its row)
  // must not end the edit under the person's hands.
  const keepNow = useRef(keep)
  keepNow.current = keep
  const changedNow = useRef(changed)
  changedNow.current = changed
  // Closed for any reason but Esc: its edits kept. React's dev double mount closes it untouched, so nothing is saved then.
  useEffect(() => () => void (!dropped.current && changedNow.current() && keepNow.current(undefined, false)), [])
  useEffect(() => {
    const away = (event: PointerEvent): void => {
      const target = event.target as Element | null
      // Its own parts, and what it opens (the editor's menus and tips, in portals), are not away.
      if (!target || box.current?.contains(target) || ofTheWriting(target)) return
      // Another card pressed: it opens as this one is kept, in the same moment. Left to its click, the list had
      // already closed up under the pointer and the click landed on nothing.
      const other = target.closest?.('[data-card-row]')?.getAttribute('data-card-row') ?? undefined
      // Back or Forward pressed (the tab's arrows, or the mouse's side buttons): kept, but not closed here. Closed as a
      // step of its own, the press then stepped back onto this same card, so Back seemed to do nothing.
      const stepping = event.button === 3 || event.button === 4 || !!target.closest?.('[data-tab-step]')
      keepNow.current(other !== card.id ? other : undefined, !stepping)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [])
  const keys = (event: React.KeyboardEvent | KeyboardEvent): boolean => {
    if (event.key === 'Escape') return (event.preventDefault(), event.stopPropagation(), drop(), true)
    if (event.key === 'Enter' && !event.shiftKey && !('nativeEvent' in event ? event.nativeEvent : event).isComposing) return (event.preventDefault(), event.stopPropagation(), keep(), true)
    return false
  }
  return (
    <div ref={box} data-card-editing={card.id} onClick={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}
      className="mf-index-card relative my-1 flex flex-col gap-1 px-4 pt-3 pb-2.5">
      <input autoFocus data-card-edit aria-label="Question" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={keys}
        className="w-full bg-transparent font-heading text-heading font-semibold leading-snug outline-none placeholder:text-muted-foreground" placeholder="The question" />
      <div aria-hidden className="mf-index-rule my-1" />
      <div data-card-edit-answer className="min-h-12 [--mf-padding:0] [&_.haligtree-editor]:!text-[length:calc(0.875rem*var(--mf-text-scale,1))] [&_.tiptap-word-count]:hidden">
        {body !== undefined && <HaligtreeEditor defaultContent={(body as never) ?? ''} toolbar={{ fixed: false }} handles={false} outline={false} search={false} vimStart="insert" autofocus={false}
          onReady={(one) => {
            doc.current = kept.current.doc = one.state.doc
            one.on('update', () => void (doc.current = one.state.doc))
          }} onKeyDown={(event) => keys(event)} />}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        {card.made !== 'deck' && <input data-card-edit-source aria-label="Source" value={source} onChange={(event) => setSource(event.target.value)} onKeyDown={keys}
          placeholder="Source: a book or video" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />}
        <Tip label="#tags are written in the answer. Enter keeps, ⇧Enter a new line, Esc drops">
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-muted-foreground"><span aria-hidden className="size-1.5 rounded-full shrink-0" style={{ background: tint }} />↩ keep</span>
        </Tip>
      </div>
    </div>
  )
}

/** What each card says on its front, by its id, so the step a card was opened in is named by it in Back's menu. */
const fronts = new Map<string, string>()
export const cardFront = (id: string): string | undefined => fronts.get(id)
const nameCards = (cards: readonly BrowsedCard[]): void => {
  for (const one of cards) fronts.set(one.id, one.prompt.replace(/\s+/g, ' ').trim().slice(0, 60))
}

/**
 * Every card, the way an Anki Browser shows them and further: grouped (deck,
 * source in page order, stage, when due, how hard, month made, needs work),
 * ordered, filtered and drawn as compact rows, the list, or a grid of real
 * cards that turn over, all through Display and kept per browser. A group's
 * head carries its next 30 days of reviews; a book's cards carry which pages
 * have cards; a card that needs work offers its fix in place. Picked cards
 * (⇧-click, x, ⌘A) are paused, tagged or untagged together, or sent to the Bin.
 */
export function CardBrowser({ onOpen, aim, only, newest, onAll, onShow, onAimDone, open, onOpenCard }: { /** The card open for editing, when Review keeps it as a step of Back and Forward. */ open?: string | null; onOpenCard?: (id: string | null) => void; /** Its form closed: the toolbar's button is no longer pressed. */ onAimDone?: () => void; onOpen: (type: string, id: string) => void; /** Open with "Add many at once" out (⌘K), aimed at a deck, or for one card in it. */ aim?: { deck: string | null; one: boolean } | null
  /** Just these cards (the ones an import or "Add many at once" made), with a way back to all. */ only?: string[] | null; /** Just the newest this many cards (an import's), with the same way back. */ newest?: number | null; onAll?: () => void; /** Show just the cards just made. */ onShow?: (ids: string[]) => void }): React.JSX.Element {
  const [pasting, setPasting] = useState(!!aim)
  const [aimed, setAimed] = useState(aim ?? null)
  // Marked for the probes and the Performance panel: how long the cards take to come, and to be drawn (card-shelves.tsx).
  // The decks made by hand, empty ones too: where "Move to deck…" can send a card.
  const made = useMadeDecks()
  const cards = useLive(() => (performance.mark('cards:asked'), call<BrowsedCard[]>('cards:all').then((all) => (performance.mark('cards:came'), all))), null as BrowsedCard[] | null, [], ['item'])
  // Each card's front, for naming the step a card opened is in Back's menu.
  useEffect(() => void (cards && nameCards(cards)), [cards])
  const compact = useToolbarCompact()
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [view, setView] = useView('cards', { sort: 'due', group: 'none' })
  // The cards themselves, one row a card, soonest due first: a list unless the grid of card faces or the table is chosen.
  // Never a stack: decks are the Decks tab's. The old "Pockets" choice, kept in a saved view, reads as the list.
  const density: Density = view.density === 'grid' || view.density === 'compact' ? view.density : 'list'
  // The grid's cards flipped through one at a time, and which is in the middle.
  const [flowing, setFlowing] = useState(false)
  const [flowAt, setFlowAt] = useState(0)
  // A few hundred drawn at a time: a book of 5,000 cards opens at once, and shows more as asked.
  const [limit, setLimit] = useState(200)
  const [ownEditing, setOwnEditing] = useState<string | null>(null)
  // Held by Review when it is given (each card opened is a step), else here.
  const editing = open !== undefined ? open : ownEditing
  const setEditing = (id: string | null): void => (onOpenCard ? onOpenCard(id) : setOwnEditing(id))
  const [fixing, setFixing] = useState<{ id: string; how: 'split' | 'another'; card?: Due } | null>(null)
  const [tagging, setTagging] = useState('')
  // Turned over in the grid: by hand, by Space, or all at once.
  const [over, setOver] = useState<Set<string>>(new Set())
  const list = useRef<HTMLDivElement>(null)
  const here = useHere()
  // The tags on cards, the most used first: the top ones as chips.
  const tags = useMemo(() => {
    const count = new Map<string, number>()
    for (const card of cards ?? []) for (const one of card.tags) count.set(one, (count.get(one) ?? 0) + 1)
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([one]) => one)
  }, [cards])
  // The top of each tag, the most used first: what the pockets and the chips are named by.
  const tops = useMemo(() => {
    const count = new Map<string, number>()
    for (const card of cards ?? []) for (const one of new Set(card.tags.map((t) => t.split('-')[0]))) count.set(one, (count.get(one) ?? 0) + 1)
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([one]) => one)
  }, [cards])
  // A group's name as shown: a deck by its name ("Biology / Cells"), never as its #tag.
  const shownGroup = (name: string): string => (name.startsWith('#') ? deckTitle(name.slice(1), tags) : name)
  const sources = useMemo(() => [...new Set((cards ?? []).map((one) => one.source).filter(Boolean))].sort(), [cards])
  const facets: Facet<BrowsedCard>[] = [
    { key: 'stage', label: 'Stage', options: STAGES.map(({ id, label }) => ({ id, label })), test: (card, id) => stageOf(card) === id },
    { key: 'due', label: 'Due', options: DUES.map((id) => ({ id, label: id })), test: (card, id) => dueBand(card) === id },
    { key: 'tag', label: 'Deck', options: tags.map((one) => ({ id: one, label: deckTitle(one, tags), tint: groupTint(one) })), test: (card, id) => under(card.tags, id) },
    { key: 'source', label: 'Source', options: sources.map((one) => ({ id: one, label: one })), test: (card, id) => card.source === id },
    { key: 'needs', label: 'Needs work', options: NEEDS, test: (card, id) => needs(card).includes(id) },
    { key: 'paused', label: 'Paused', options: [{ id: 'paused', label: 'Paused' }, { id: 'active', label: 'Not paused' }], test: (card, id) => card.paused === (id === 'paused') },
    { key: 'made', label: 'Made from', options: MADE, test: (card, id) => card.made === id }
  ]
  const words = query.trim().toLowerCase()
  // The cards an import just made: the newest so many, by when each was made.
  const latest = useMemo(() => (newest && cards ? [...cards].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, newest).map((one) => one.id) : null), [newest, cards])
  const justIds = only ?? latest
  const just = justIds ? new Set(justIds) : null
  const found = (cards ?? [])
    .filter((card) => !just || just.has(card.id))
    .filter((card) => !tag || under(card.tags, tag))
    .filter((card) => !words || `${card.prompt} ${card.answer} ${card.source} ${card.tags.map((one) => `#${one}`).join(' ')}`.toLowerCase().includes(words))
  const [[, ordered]] = arrange(found, view, facets, ORDER)
  // Cut into groups, each in its own order; a book's cards in page order whatever the sort, as a book is read.
  // Grouped only when asked, in Display: each group a heading over its own cards.
  const grouping = GROUPING[view.group]
  const groups: [string, BrowsedCard[]][] = useMemo(() => {
    if (!grouping) return [['', ordered]]
    const out = new Map<string, BrowsedCard[]>()
    for (const card of ordered) out.set(grouping.of(card), [...(out.get(grouping.of(card)) ?? []), card])
    if (view.group === 'source') for (const [name, one] of out) if (name !== 'No source') out.set(name, [...one].sort((a, b) => spot(a) - spot(b) || ORDER[view.sort]?.(a, b) || 0))
    const rank = (entry: [string, BrowsedCard[]]): number | string => grouping.rank(entry[0], entry[1])
    return [...out].sort((a, b) => { const [x, y] = [rank(a), rank(b)]; return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)) })
  }, [ordered, grouping, view.group, view.sort]) // eslint-disable-line react-hooks/exhaustive-deps
  // Each group folds under its heading, in every density: in the grid, a deck's first card faces and "Show more".
  const island = useIslands('cards', !!grouping && view.islands !== false)
  const { groups: drawn, islands } = island(groups)
  const shown = drawn.flatMap(([, one]) => one)
  const several = usePickMixed(ordered.map((card) => ({ type: 'nugget', id: card.id, title: card.prompt })), { here })
  const picked = ordered.filter((card) => several.picked({ type: 'nugget', id: card.id }))
  const pause = (ids: string[], on: boolean): void => void call('cards:pause', ids, on).then(() => {
    chime(on ? 'shelve' : 'unshelve')
    toast(`${on ? 'Paused' : 'Back in Review'}: ${plural(ids.length, 'card')}`, () => void call('cards:pause', ids, !on).then(() => chime('undo')))
  })
  const retag = (ids: string[], on: boolean): void => {
    const word = tagging.trim().replace(/^#/, '').toLowerCase()
    if (!word) return
    void call<{ id: string; body: string | null }[]>('cards:retag', ids, word, on).then((before) => {
      chime(on ? 'noted' : 'fold')
      setTagging('')
      toast(`${plural(before.length, 'card')} ${on ? 'added to' : 'taken out of'} the deck ${deckTitle(word)}`, () => void call('cards:retag:undo', before).then(() => chime('undo')))
    })
  }
  // Moved to a deck: the new one on, each card's others off, one Undo for all of it.
  const move = (moving: BrowsedCard[], word: string): void => void (async () => {
    const before = new Map<string, string | null>()
    const keepFirst = (rows: { id: string; body: string | null }[]): void => rows.forEach((one) => !before.has(one.id) && before.set(one.id, one.body))
    keepFirst(await call<{ id: string; body: string | null }[]>('cards:retag', moving.map((card) => card.id), word, true))
    for (const card of moving) for (const old of card.tags.filter((one) => one !== word)) keepFirst(await call<{ id: string; body: string | null }[]>('cards:retag', [card.id], old, false))
    chime('noted')
    several.clear()
    toast(`${moving.length === 1 ? 'Moved' : `${num(moving.length)} cards moved`} to the deck ${deckTitle(word)}`, () => void call('cards:retag:undo', [...before].map(([id, body]) => ({ id, body }))).then(() => chime('undo')))
  })()
  // "Move to deck…": a new deck first, named in place, then the decks there are.
  const moveItem = (moving: BrowsedCard[]): RowItem => ({ label: moving.length > 1 ? `Move ${num(moving.length)} to deck…` : 'Move to deck…', items: [
    { label: 'New deck…', run: () => void makeDeck().then((word) => word && move(moving, word)) },
    'separator',
    ...[...new Set([...tags, ...made])].filter((one) => !moving.every((card) => card.tags.length === 1 && card.tags[0] === one)).slice(0, 12).map((one) => ({ label: deckTitle(one, tags), run: () => move(moving, one) }))
  ] })
  // Back to new, as if never reviewed; Undo puts its progress back.
  const reset = (ids: string[]): void => void call<{ id: string; state: string | null; dueAt: string | null }[]>('cards:reset', ids).then((before) => {
    chime('fold')
    toast(`Progress reset: ${plural(before.length, 'card is', 'cards are')} new again`, () => void call('cards:reset:undo', before).then(() => chime('undo')))
  })
  const copy = (card: BrowsedCard): void => void navigator.clipboard.writeText(`${card.prompt}\n${card.answer}`).then(() => (chime('copy'), toast('Card copied')))
  const turn = (id: string, to?: boolean): void => setOver((was) => {
    const next = new Set(was)
    if (to ?? !was.has(id)) next.add(id)
    else next.delete(id)
    return next
  })
  // Every card on show at once, for a sweep of self-testing; again, all back face up.
  const turnAll = (): void => {
    const all = shown.length > 0 && shown.every((card) => over.has(card.id))
    chime(all ? 'fold' : 'open')
    setOver(all ? new Set() : new Set(shown.map((card) => card.id)))
  }
  const fix = (card: BrowsedCard, how: 'split' | 'another'): void => {
    chime('open')
    if (how === 'split') return setFixing({ id: card.id, how })
    void haligtree.item(card.id).then((full) => full && setFixing({ id: card.id, how, card: full as unknown as Due }))
  }
  // The keys, as the Anki Browser and the app's lists have them: arrows and
  // J/K move, Space turns a card over (⇧Space, every card), Enter opens, E edits.
  // ⌘A, x, ⌫ and Esc come from picking (usePickMixed), on the card with the focus.
  const now = useRef({ shown, density, turnAll, editing, flowing, flowAt })
  now.current = { shown, density, turnAll, editing, flowing, flowAt }
  const lastKey = useRef('')
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const box = list.current
      if (!box) return
      const items = [...box.querySelectorAll<HTMLElement>('[data-pick]')]
      const at = items.findIndex((one) => one.contains(document.activeElement))
      const card = at >= 0 ? now.current.shown.find((one) => `nugget:${one.id}` === items[at].dataset.pick) : undefined
      // Flip through: ← and → bring the next card to the middle, Space turns it over.
      if (now.current.flowing) {
        const centre = now.current.shown[now.current.flowAt]
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault()
          chime('tap')
          return setFlowAt(Math.max(0, Math.min(now.current.shown.length - 1, now.current.flowAt + (event.key === 'ArrowRight' ? 1 : -1))))
        }
        if (event.key === ' ' && centre) return (event.preventDefault(), chime('tap'), turn(centre.id))
        if (event.key === 'Enter' && centre) return (event.preventDefault(), chime('open'), onOpen('nugget', centre.id))
      }
      const grid = now.current.density === 'grid'
      const go = (to: number): void => {
        const next = items[Math.max(0, Math.min(items.length - 1, to))]
        next?.focus()
        next?.scrollIntoView({ block: 'nearest' })
      }
      // Down and up in the grid go to the card straight below or above.
      const below = (way: 1 | -1): number => {
        if (at < 0) return 0
        const from = items[at].getBoundingClientRect()
        const row = items.map((one, n) => ({ n, box: one.getBoundingClientRect() })).filter(({ box }) => (way > 0 ? box.top > from.top + 4 : box.top < from.top - 4))
        if (!row.length) return at
        const nearest = way > 0 ? Math.min(...row.map(({ box }) => box.top)) : Math.max(...row.map(({ box }) => box.top))
        return row.filter(({ box }) => box.top === nearest).sort((a, b) => Math.abs(a.box.left - from.left) - Math.abs(b.box.left - from.left))[0].n
      }
      const key = event.key
      // G to the last card, g g to the first, as every list does (ui.tsx useListKeys).
      const afterG = lastKey.current === 'g'
      lastKey.current = key === 'g' && !afterG ? 'g' : ''
      if (key === 'G' && event.shiftKey) go(items.length - 1)
      else if (key === 'g' && afterG) go(0)
      else if (key === 'ArrowDown' || key === 'j') go(grid && key === 'ArrowDown' ? below(1) : at + 1)
      else if (key === 'ArrowUp' || key === 'k') go(grid && key === 'ArrowUp' ? below(-1) : at < 0 ? 0 : at - 1)
      else if (grid && key === 'ArrowRight') go(at + 1)
      else if (grid && key === 'ArrowLeft') go(at - 1)
      else if (key === ' ' && grid && (event.shiftKey || !card)) now.current.turnAll()
      else if (key === ' ' && grid && card) (chime('tap'), turn(card.id))
      else if (key === 'Enter' && card) (chime('open'), onOpen('nugget', card.id))
      else if ((key === 'e' || key === 'E') && card) setEditing(card.id)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!cards) return <div />
  // "Make a card" (a deck's, ⌘K's "New card in"): the two-field card; otherwise the paste box.
  const closePaste = (): void => (chime('fold'), setPasting(false), setAimed(null), onAimDone?.())
  const paste = !pasting ? null : aimed?.one
    ? <NewCard key={`one:${aimed.deck}`} deck={aimed.deck ?? undefined} onClose={closePaste} />
    : <PasteCards key={`${aimed?.deck}`} deck={aimed?.deck ?? undefined} onClose={closePaste} onShow={onShow} />
  if (!cards.length)
    return (
      <div className="flex flex-col gap-3 px-5 pt-4 pb-10">
        {paste ?? <Empty title="No cards yet" action={<span className="flex flex-wrap items-center gap-2"><Button size="sm" data-make-open onClick={() => (chime('open'), setAimed({ deck: null, one: true }), setPasting(true))}>Make a card</Button><Button variant="ghost" size="sm" data-paste-open onClick={() => (chime('open'), setAimed(null), setPasting(true))}>Add many at once</Button><Button variant="ghost" size="sm" data-cards-import onClick={() => (chime('open'), void window.api.importFrom('files'))}>Import from Anki or a spreadsheet</Button></span>}>Make one card, paste a list or a spreadsheet of them, or bring in an Anki deck (.apkg, .colpkg) or a CSV.</Empty>}
      </div>
    )

  const menu = (card: BrowsedCard): RowItem[] => (several.menu({ type: 'nugget', id: card.id }) && [moveItem(picked), 'separator', ...several.menu({ type: 'nugget', id: card.id })!]) || [
    { label: 'Edit', keys: 'E', run: () => setEditing(card.id) },
    { label: 'Open', keys: '↩', run: () => onOpen('nugget', card.id) },
    canSplit() && { label: 'Open to the side', run: () => openAside('nugget', card.id) },
    density === 'grid' && { label: over.has(card.id) ? 'Turn face up' : 'Turn over', keys: 'space', run: () => turn(card.id) },
    'separator',
    { label: 'Ask another way', run: () => fix(card, 'another') },
    { label: 'Split in two', run: () => fix(card, 'split') },
    { label: card.paused ? 'Bring back' : 'Pause', run: () => pause([card.id], !card.paused) },
    card.reviews > 0 && { label: 'Reset progress', run: () => reset([card.id]) },
    moveItem([card]),
    { label: 'Copy', run: () => copy(card) },
    'separator',
    binItem([{ type: 'nugget', id: card.id }]),
    ...several.rowItems({ type: 'nugget', id: card.id })
  ]
  const question = (card: BrowsedCard, className = ''): React.JSX.Element => (
    <span className={`min-w-0 ${className}`}><WithPictures text={card.prompt.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim() || card.prompt} small /></span>
  )
  // What needs work, in words on the card ("Forgotten 3 times"), in ink with
  // a small warning mark: orange is Learning's and red is danger's, so it takes neither. Its fixes, one click each, where you asked
  // to see what needs work (grouped or filtered by it).
  const working = view.group === 'needs' || (view.filter.needs ?? []).length > 0
  const said = (card: BrowsedCard): string => [card.lapses >= 2 && `Forgotten ${num(card.lapses)} times${card.leech ? ', a leech' : ''}`, card.things > 4 && `${num(card.things)} answers to recall at once: more than 4 is hard to keep`, (card.seconds ?? 0) >= 40 && `takes ${num(card.seconds!)} seconds each time`].filter(Boolean).join('; ')
  // Grouped or filtered by it, the fixes line says it in words instead.
  const short = (card: BrowsedCard): string => [card.lapses >= 2 && `Forgotten ${num(card.lapses)} times`, card.things > 4 && `${num(card.things)} answers to recall at once`, (card.seconds ?? 0) >= 40 && `Slow: ${num(card.seconds!)}s`].filter(Boolean)[0] as string
  const mark = (card: BrowsedCard): React.JSX.Element | null => !needs(card).length || working ? null : (
    <span data-card-needs={needs(card).join(' ')} data-card-big={needs(card).some((one) => one === 'big' || one === 'slow') || undefined} aria-label={said(card)}
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[4px] bg-foreground/[0.06] px-1.5 text-xs leading-4 font-medium text-foreground">
      <TriangleAlert aria-hidden className="size-3 text-muted-foreground" />{short(card)}
    </span>
  )
  const link = 'rounded px-1 font-medium text-foreground underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground/60'
  const fixes = (card: BrowsedCard): React.JSX.Element | null => !working || !needs(card).length ? null : (
    <span data-card-fixes className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs" onPointerUp={(event) => event.stopPropagation()}>
      <span className="mr-0.5 inline-flex items-center gap-1 text-foreground"><TriangleAlert aria-hidden className="size-3 text-muted-foreground" />{said(card)}</span>
      <button type="button" data-fix="split" onClick={(event) => (event.stopPropagation(), fix(card, 'split'))} className={link}>Split</button>
      <button type="button" data-fix="another" onClick={(event) => (event.stopPropagation(), fix(card, 'another'))} className={link}>Ask another way</button>
      {!card.paused && <button type="button" data-fix="pause" onClick={(event) => (event.stopPropagation(), pause([card.id], true))} className={link}>Pause</button>}
    </span>
  )
  const fixer = (card: BrowsedCard): React.JSX.Element | null => fixing?.id !== card.id ? null : (
    <div data-card-fixer className={`rounded-lg border bg-background p-4 ${density === 'grid' ? 'col-span-full' : 'my-1'}`}>
      {fixing.how === 'split'
        ? <SplitForm card={{ id: card.id, prompt: card.prompt } as never} onDone={() => setFixing(null)} onCancel={() => (chime('fold'), setFixing(null))} />
        : fixing.card && <AnotherWay card={fixing.card} onClose={() => (chime('fold'), setFixing(null))} />}
    </div>
  )
  const pick = (card: BrowsedCard) => ({ type: 'nugget', id: card.id })

  const row = (card: BrowsedCard): React.JSX.Element => {
    const on = several.picked(pick(card))
    const common = {
      'data-pick': `nugget:${card.id}`, role: 'button', tabIndex: 0, 'aria-selected': on,
      onClick: (event: React.MouseEvent) => several.click(event, pick(card)) || (chime('tap'), setEditing(editing === card.id ? null : card.id))
    }
    // The Bin's table (table-look.tsx), one line a card: its stage first, quiet, as the Bin says a kind; the question
    // in ink; in Table its answer too; its decks; when it is next asked, flush right. Fixes, where asked for, on a line under.
    const when = dueSaid(card) === 'new' ? '' : dueSaid(card)
    const fixing = fixes(card)
    return (
      <div {...common} data-picked={on || undefined} data-set-aside={card.paused ? '' : undefined} data-table-row
        className={`${TABLE_ROW} border-b border-border/60 ${fixing ? 'flex-wrap' : ''} ${on ? PICKED_ROW : ''}`}>
        <span data-table-lead data-card-stage className={`${TABLE_LEAD} flex items-center gap-1.5`}><span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: tintOf(card) }} />{STAGES.find((one) => one.id === stageOf(card))!.word}</span>
        {question(card, `${TABLE_NAME} ${COLUMNS.name}`)}
        {mark(card)}
        {density === 'compact' && <span data-card-answer className={`${TABLE_QUIET} ${COLUMNS.answer}`}>{answerShown(card) || 'No answer yet'}</span>}
        <span data-card-decks className={`${TABLE_QUIET} ${COLUMNS.decks}`}>{card.tags.slice(0, 2).map((one) => deckTitle(one, tags)).join(', ')}</span>
        <span data-table-when className={`${TABLE_WHEN} ${COLUMNS.when} ${when === 'due now' ? 'text-foreground' : ''}`}>{when}</span>
        {fixing && <span className="basis-full pl-[6.75rem]">{fixing}</span>}
      </div>
    )
  }

  const poster = (card: BrowsedCard, size: 'sm' | 'md' | 'lg' = 'md'): React.JSX.Element => (
    <Poster card={card} size={size} over={over.has(card.id)} onTurn={(to) => turn(card.id, to)} picked={several.picked(pick(card))}
      onPick={(event) => several.click(event, pick(card))} question={question(card)} answer={answerShown(card)} />
  )

  const cell = (card: BrowsedCard): React.JSX.Element => (
    <div key={card.id} data-card-row={card.id} className="contents">
      {editing === card.id
        ? <div className={density === 'grid' ? 'col-span-full' : ''}><EditCard card={card} tint={tintOf(card)} onDone={(next) => { if (next) return void (swallowRelease(), chime('tap'), setEditing(next)); setEditing(null); requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-pick="nugget:${card.id}"]`)?.focus()) }} /></div>
        : <RowMenu items={() => menu(card)}>{density === 'grid' ? <div className="relative min-w-0">{poster(card)}{/* A card too big, slow or often forgotten is marked on its poster too, as in a list. */}{mark(card) && <span className="flex pt-1.5">{mark(card)}</span>}</div> : row(card)}</RowMenu>}
      {fixer(card)}
    </div>
  )
  const more = (list: BrowsedCard[]): React.JSX.Element | null => list.length <= limit ? null : (
    <button type="button" data-card-more onClick={() => (chime('open'), setLimit(limit + 200))} className="mt-3 w-full rounded-md py-2 text-control font-medium text-(--mf-muted-strong) hover:bg-accent/50 hover:text-foreground">
      Show {num(Math.min(200, list.length - limit))} more <span className="font-normal text-muted-foreground">of {num(list.length - limit)}</span>
    </button>
  )
  // The grid of cards is drawn where you are looking (and a screen either side), however many thousand it holds.
  const body = (list: BrowsedCard[]): React.JSX.Element => density === 'grid'
    ? <div data-card-grid><Windowed items={list} render={cell} className="grid grid-cols-[repeat(auto-fill,minmax(min(10rem,calc(50%-0.5rem)),1fr))] items-start gap-4 p-1 @max-[40rem]/page:gap-3" /></div>
    : <><div className="flex flex-col">{list.slice(0, limit).map(cell)}</div>{more(list)}</>
  // Table names its columns, in the rows' own boxes.
  const head = density === 'compact' && (
    <TableHead columns={[{ label: 'Stage', className: TABLE_LEAD }, { label: 'Question', className: `${TABLE_NAME} ${COLUMNS.name}` }, { label: 'Answer', className: `${TABLE_QUIET} ${COLUMNS.answer}` },
      { label: 'Decks', className: `${TABLE_QUIET} ${COLUMNS.decks}` }, { label: 'Next', className: `${TABLE_WHEN} ${COLUMNS.when}` }]} />
  )
  const allOver = shown.length > 0 && shown.every((card) => over.has(card.id))

  // The grid's own two actions: in the toolbar's right end, or, when the window is too narrow for them there, in a line of their own above the counts.
  const gridActions = density === 'grid' && (
    <>
      {!flowing && (
        <Tip label="Turn every card on show over, to test yourself  ⇧Space">
          <Button variant="ghost" size="sm" data-turn-all aria-pressed={allOver} onClick={turnAll}>{allOver ? 'All face up' : 'Turn all over'}</Button>
        </Tip>
      )}
      <Tip label="The cards on show one at a time, large  ← →">
        <Button variant="ghost" size="sm" data-card-flow aria-pressed={flowing} onClick={() => (chime(flowing ? 'fold' : 'open'), setFlowing(!flowing), setFlowAt(0))}>{flowing ? 'All at once' : 'Flip through'}</Button>
      </Tip>
    </>
  )

  return (
    <div data-card-browser data-density={density} data-group={view.group} className="flex flex-col gap-3 px-5 pt-4 pb-20">
      {/* Its own controls in the toolbar's right end, never a row of their own. */}
      <TabControls>
        <div className={compact ? 'w-28' : 'w-44'}><ListSearch value={query} onChange={setQuery} onDone={() => {}} placeholder={compact ? 'Search' : 'Search cards'} /></div>
        {!compact && gridActions}
        <Display view={view} onChange={setView} facets={facets} items={cards} count={cards.length} sorts={SORTS} groups={GROUPS} compact={compact}
          sortNote={view.group === 'source' ? 'Within each book or video, cards go in page or time order.' : undefined}
          density={density} onDensity={(next) => setView({ ...view, density: next })} densities={['list', 'grid', 'compact']} names={{ grid: 'Cards', compact: 'Table' }} />
      </TabControls>
      {paste}
      {just && (
        // Just what came in: said in a line of its own, with the way back to every card.
        <p data-cards-only={just.size} className="flex flex-wrap items-center gap-x-2 text-body text-foreground">
          <span>Showing the {num(just.size)} {just.size === 1 ? 'card' : 'cards'} just added.</span>
          <button type="button" data-cards-all onClick={onAll} className="cursor-pointer font-medium underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">Show every card</button>
        </p>
      )}
      {/* One line of the most used decks, sliding sideways, never wrapping; every one is in Display's Deck filter. */}
      {/* Named by the top of each tag (#learn takes in #learn-haligtree). */}
      <Chips sideways className="" options={[{ id: '', label: `All ${num(cards.length)}` }, ...tops.slice(0, 12).map((one) => ({ id: one, label: deckTitle(one, tags) }))]} on={(id) => (tag ?? '') === id} pick={(id) => (setTag(id || null), setFlowAt(0))} />
      {/* One bar for what is picked: the cards' own actions in the app's shared one, after its count. */}
      {several.barWith(several.count > 0 && (
        <span data-card-picked className="contents">
          <Button variant="ghost" size="sm" data-cards-pause onClick={() => pause(picked.map((one) => one.id), !picked.every((one) => one.paused))}>
            {picked.every((one) => one.paused) ? 'Bring back' : 'Pause'}
          </Button>
          <Input value={tagging} onChange={(event) => setTagging(event.target.value)} placeholder="#deck" className="h-7 w-32 text-sm"
            onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), retag(picked.map((one) => one.id), true))} />
          <Button variant="ghost" size="sm" data-cards-tag onClick={() => retag(picked.map((one) => one.id), true)}>Add to deck</Button>
          <Button variant="ghost" size="sm" data-cards-untag onClick={() => retag(picked.map((one) => one.id), false)}>Take out of deck</Button>
        </span>
      ))}
      {compact && gridActions && <div data-card-actions className="-ml-3 flex items-center gap-1">{gridActions}</div>}
      {/* The four stages the rows wear, each counted in its row colour and word, then what is due, in plain ink (due is
          when, not a stage): one word and one colour for each thing, here and on every row. */}
      <p data-card-counts className="flex flex-wrap gap-x-4 text-sm">
        {STAGES.map((stage) => (
          <span key={stage.id} data-card-stage-count={stage.id} title={stage.label}>
            <strong className="font-semibold tabular-nums" style={{ color: stage.tint }}>{num(ordered.filter((one) => stageOf(one) === stage.id && (!one.paused || stage.id === 'known')).length)}</strong> {stage.word.toLowerCase()}
          </span>
        ))}
        <span><strong className="font-semibold text-foreground tabular-nums">{num(ordered.filter((one) => one.dueAt && Date.parse(one.dueAt) <= Date.now() && !one.paused).length)}</strong> due now</span>
        <span className="text-muted-foreground">{num(ordered.length)} of {num(cards.length)} cards{tag ? ` in the deck ${deckTitle(tag, tags)}` : ''}</span>
      </p>
      {!ordered.length ? (
        <Empty title="No card matches" action={<button type="button" onClick={() => (chime('undo'), setQuery(''), setTag(null), setView({ ...view, filter: {} }))} className="text-control font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">Clear the filters</button>}>
          None of your cards has those words or fits those filters.
        </Empty>
      ) : (
        <div ref={list} data-card-list>
          {flowing && density === 'grid' ? (
            // Flip through: the cards on show one at a time, the one in the middle large.
            <div data-card-flowing>
              <FlipThrough cards={shown} at={Math.min(flowAt, shown.length - 1)} onAt={setFlowAt} render={(card) => <RowMenu items={() => menu(card)}><div>{poster(card, 'lg')}</div></RowMenu>} />
            </div>
          ) : <>
          {head}
          {drawn.map(([name, one]) => {
            const whole = groups.find(([key]) => key === name)?.[1] ?? one
            const inner = <>{view.group === 'source' && <Coverage cards={whole} />}{body(one)}</>
            if (!name) return <div key="all">{inner}</div>
            return islands?.[name]
              ? <IslandBox key={name} name={shownGroup(name)} island={islands[name]} shown={one.length} unit={['card', 'cards']} extra={<span className="flex items-center gap-3"><DueNow cards={whole} /><DueAhead cards={whole} /></span>}>{inner}</IslandBox>
              : (
                <section key={name} data-card-group={name} className="mt-4 first:mt-0">
                  <h2 className="flex items-center gap-2 px-2 pb-1.5 text-control font-semibold">{shownGroup(name)}<span className="font-normal text-muted-foreground tabular-nums">· {num(whole.length)} {whole.length === 1 ? 'card' : 'cards'}</span><span className="ml-auto flex items-center gap-3"><DueNow cards={whole} /><DueAhead cards={whole} /></span></h2>
                  {inner}
                </section>
              )
          })}
          </>}
        </div>
      )}
    </div>
  )
}
