import { useEffect, useMemo, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { call, haligtree, useLive, type Due } from '@/lib/haligtree'
import { canSplit, openAside, useHere } from '@/lib/split'
import { binItem } from '@/lib/to-bin'
import type { Editor } from '@tiptap/react'
import { HaligtreeEditor } from './haligtree-editor'
import { CircleAlert } from 'lucide-react'
import { num } from '../../../../main/dates'
import { Chips, Display, arrange, useView, type Choice, type Density, type Facet } from './display'
import { IslandBox, useIslands } from './islands'
import { ListSearch } from './note-list'
import { usePickMixed } from './pick-mixed'
import { RowMenu, type RowItem } from './row-menu'
import { WithPictures } from './with-pictures'
import { PasteCards } from './paste-cards'
import { Flip } from './review-view'
import { SplitForm } from './study'
import { AnotherWay } from './another-way'
import { Empty, Tip, toast, typing } from './ui'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/** One card as the browser lists it (haligtree.ts `cards:all`). */
export type BrowsedCard = { id: string; prompt: string; title: string; answer: string; tags: string[]; dueAt: string | null; createdAt: string; paused: boolean; difficulty: number | null; reviews: number; stage: 'new' | 'learning' | 'learnt'; /** Remembered across a gap of 15 days or more. */ known: boolean; /** Things the answer asks for; past 4 it is too big. */ things: number; /** Seconds it takes you, from 2 or more timed reviews. */ seconds: number | null
  /** Times forgotten after being learnt; a leech at 4. */ lapses: number; leech: boolean
  /** The book, video or shared deck it came from, and where in it ("p. 3", "12:40"). */ source: string; at: string
  made: 'pdf' | 'line' | 'deck' | 'typed'; picture: string | null }

const DAY = 86400000
const today = (): number => new Date().setHours(0, 0, 0, 0)

// The words Anki users know, each in the colour the counts above use.
const STAGES: { id: string; label: string; tint: string }[] = [
  { id: 'new', label: 'New', tint: 'var(--tt-color-text-blue)' },
  { id: 'learning', label: 'Learning', tint: 'var(--tt-color-text-orange)' },
  { id: 'learnt', label: 'Learnt', tint: 'var(--tt-color-text-green)' },
  { id: 'known', label: 'Known', tint: 'var(--tt-color-text-purple)' }
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

/** The deck it came in, or its first tag: what a person means by "which deck". */
const deckOf = (card: BrowsedCard): string => (card.made === 'deck' ? card.source : card.tags[0] ? `#${card.tags[0].split('-')[0]}` : 'No tag')

const SORTS: Choice[] = [
  { id: 'due', label: 'Due soonest' },
  { id: 'newest', label: 'Newest' },
  // Not 'oldest': useView reads a kept 'oldest' as Oldest untouched, another list's order.
  { id: 'first', label: 'Oldest' },
  { id: 'hard', label: 'Hardest' },
  { id: 'slow', label: 'Slowest' },
  { id: 'forgot', label: 'Most forgotten' },
  { id: 'az', label: 'A to Z' },
  { id: 'page', label: 'Page order', tip: 'By source, then page or time in it' }
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
  { id: 'deck', label: 'Deck or tag' },
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
  deck: { of: deckOf, rank: (name, list) => (name === 'No tag' ? 1e9 : -list.length) },
  source: { of: (card) => card.source || 'No source', rank: (name) => `${Number(name === 'No source')}${name.toLowerCase()}` },
  stage: { of: (card) => STAGES.find((one) => one.id === stageOf(card))!.label, rank: (name) => STAGES.findIndex((one) => one.label === name) },
  due: { of: dueBand, rank: (name) => DUES.indexOf(name) },
  hard: { of: hardBand, rank: (name) => HARDS.indexOf(name) },
  made: { of: (card) => month(card.createdAt), rank: (_, list) => -Date.parse(list[0].createdAt) },
  needs: { of: (card) => NEED_NAME(needs(card)[0] ?? ''), rank: (name) => { const at = NEEDS.findIndex((one) => one.label === name); return at < 0 ? 99 : at } }
}

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
    if (lead.test(answer)) return answer.replace(lead, '').replace(/^\p{Ll}/u, (one) => one.toUpperCase())
  }
  return answer
}

/** A tag, and the tags under it: #biology takes in #biology-cells. */
const under = (tags: string[], tag: string): boolean => tags.some((one) => one === tag || one.startsWith(`${tag}-`))

/**
 * A group's next 30 days of reviews as 30 thin bars, today first (with what
 * is overdue): where a deck's reviews are about to pile up, seen before they do.
 */
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
      <span data-due-ahead={total} aria-label={said} className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
        <svg width={60} height={14} viewBox="0 0 60 14" aria-hidden className="text-foreground/55">
          {days.map((n, at) => <rect key={at} x={at * 2} y={14 - Math.max(n ? 2 : 1, (n / most) * 14)} width={1.4} height={Math.max(n ? 2 : 1, (n / most) * 14)} fill="currentColor" opacity={n ? (at === peak ? 1 : 0.7) : 0.2} />)}
        </svg>
        <span className="tabular-nums">{num(total)} in 30 days</span>
      </span>
    </Tip>
  )
}

/**
 * A book's pages as one thin bar, from page 1 to the last page with a card:
 * marked where a page has cards, bare where it has none, so the parts of a
 * book you never made cards from show at a glance.
 */
function Coverage({ cards }: { cards: BrowsedCard[] }): React.JSX.Element | null {
  const pages = [...new Set(cards.map(pageOf).filter((one): one is number => one !== null))]
  if (pages.length < 2) return null
  const last = Math.max(...pages)
  const cells = Math.min(last, 120)
  const lit = new Set(pages.map((page) => Math.min(cells - 1, Math.floor(((page - 1) / last) * cells))))
  const gaps = cells - lit.size
  return (
    <div data-coverage className="flex items-center gap-3 px-2 pt-1 pb-2 text-xs text-muted-foreground">
      <div className="flex h-1.5 flex-1 gap-px overflow-hidden rounded-full" aria-hidden>
        {Array.from({ length: cells }, (_, at) => <span key={at} className={`flex-1 ${lit.has(at) ? 'bg-[var(--tt-brand-color-400)]' : 'bg-foreground/10'}`} />)}
      </div>
      <span className="shrink-0 tabular-nums">Cards on {num(pages.length)} of {num(last)} pages{gaps > cells / 3 ? ', the bare stretches have none' : ''}</span>
    </div>
  )
}

/**
 * A card opened to edit where it sits: the question over the answer, in the
 * card's own type with no boxes, as Things and Linear open a row. The answer
 * is the app's editor (formatting, formulas, pictures, #tags); the source is
 * a line under it. Enter keeps (⇧Enter a new line in the answer), Esc drops.
 */
function EditCard({ card, tint, onDone }: { card: BrowsedCard; tint: string; onDone: () => void }): React.JSX.Element {
  const [body, setBody] = useState<unknown>(undefined)
  const [prompt, setPrompt] = useState(card.prompt)
  const [source, setSource] = useState(card.made === 'deck' ? '' : card.source)
  const editor = useRef<Editor | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => void haligtree.item(card.id).then((full) => setBody(full?.body ?? '')), [card.id])
  const keep = (): void => {
    const next = editor.current?.getJSON()
    const asked = prompt.trim() || card.prompt
    const was = { prompt: card.prompt, body, medium: card.made === 'deck' ? undefined : card.source || null }
    void haligtree.saveItem(card.id, { prompt: asked, ...(next ? { body: next } : {}), ...(card.made === 'deck' ? {} : { medium: source.trim() || null }) }).then(() => {
      chime('noted')
      toast('Card kept', () => void haligtree.saveItem(card.id, { prompt: was.prompt, body: was.body, ...(was.medium !== undefined ? { medium: was.medium } : {}) }).then(() => chime('undo')))
    })
    onDone()
  }
  const drop = (): void => (chime('fold'), onDone())
  const keys = (event: React.KeyboardEvent | KeyboardEvent): boolean => {
    if (event.key === 'Escape') return (event.preventDefault(), event.stopPropagation(), drop(), true)
    if (event.key === 'Enter' && !event.shiftKey && !('nativeEvent' in event ? event.nativeEvent : event).isComposing) return (event.preventDefault(), event.stopPropagation(), keep(), true)
    return false
  }
  return (
    <div ref={box} data-card-editing={card.id} onClick={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}
      // Clicked away, it is kept, as a row edited in Things is.
      onBlur={(event) => !box.current?.contains(event.relatedTarget as Node | null) && event.relatedTarget && keep()}
      className="relative my-1 flex flex-col gap-1 rounded-lg border border-l-[3px] bg-background px-4 pt-3 pb-2.5 shadow-sm" style={{ borderLeftColor: tint }}>
      <input autoFocus data-card-edit aria-label="Question" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={keys}
        className="w-full bg-transparent text-body font-medium leading-snug outline-none placeholder:text-muted-foreground" placeholder="The question" />
      <div aria-hidden className="my-1 border-t border-dashed" />
      <div data-card-edit-answer className="min-h-12 [--mf-padding:0] [&_.haligtree-editor]:!text-[length:calc(0.875rem*var(--mf-text-scale,1))] [&_.tiptap-word-count]:hidden">
        {body !== undefined && <HaligtreeEditor defaultContent={(body as never) ?? ''} toolbar={{ fixed: false }} handles={false} outline={false} search={false} vim={false} autofocus={false}
          onReady={(one) => (editor.current = one)} onKeyDown={(event) => keys(event)} />}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        {card.made !== 'deck' && <input data-card-edit-source aria-label="Source" value={source} onChange={(event) => setSource(event.target.value)} onKeyDown={keys}
          placeholder="Source: a book or video" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70" />}
        <span className="ml-auto shrink-0">#tags go in the answer · ↩ keep · esc drop</span>
      </div>
    </div>
  )
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
export function CardBrowser({ onOpen, pasting: pastingFirst = false }: { onOpen: (type: string, id: string) => void; /** Open with "Paste cards" out (⌘K). */ pasting?: boolean }): React.JSX.Element {
  const [pasting, setPasting] = useState(pastingFirst)
  const cards = useLive(() => call<BrowsedCard[]>('cards:all'), null as BrowsedCard[] | null, [], ['item'])
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [view, setView] = useView('cards', { sort: 'due', group: 'none' })
  const density: Density = view.density ?? 'list'
  const [editing, setEditing] = useState<string | null>(null)
  const [fixing, setFixing] = useState<{ id: string; how: 'split' | 'another'; card?: Due } | null>(null)
  const [tagging, setTagging] = useState('')
  // Turned over in the grid: by hand, by Space, or all at once.
  const [over, setOver] = useState<Set<string>>(new Set())
  const [hovered, setHovered] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const here = useHere()
  // The tags on cards, the most used first: the top ones as chips.
  const tags = useMemo(() => {
    const count = new Map<string, number>()
    for (const card of cards ?? []) for (const one of card.tags) count.set(one, (count.get(one) ?? 0) + 1)
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([one]) => one)
  }, [cards])
  const sources = useMemo(() => [...new Set((cards ?? []).map((one) => one.source).filter(Boolean))].sort(), [cards])
  const facets: Facet<BrowsedCard>[] = [
    { key: 'stage', label: 'Stage', options: STAGES.map(({ id, label }) => ({ id, label })), test: (card, id) => stageOf(card) === id },
    { key: 'due', label: 'Due', options: DUES.map((id) => ({ id, label: id })), test: (card, id) => dueBand(card) === id },
    { key: 'tag', label: 'Tag', options: tags.slice(0, 20).map((one) => ({ id: one, label: `#${one}` })), test: (card, id) => under(card.tags, id) },
    { key: 'source', label: 'Source', options: sources.map((one) => ({ id: one, label: one })), test: (card, id) => card.source === id },
    { key: 'needs', label: 'Needs work', options: NEEDS, test: (card, id) => needs(card).includes(id) },
    { key: 'paused', label: 'Paused', options: [{ id: 'paused', label: 'Paused' }, { id: 'active', label: 'Not paused' }], test: (card, id) => card.paused === (id === 'paused') },
    { key: 'made', label: 'Made from', options: MADE, test: (card, id) => card.made === id }
  ]
  const words = query.trim().toLowerCase()
  const found = (cards ?? [])
    .filter((card) => !tag || under(card.tags, tag))
    .filter((card) => !words || `${card.prompt} ${card.answer} ${card.source} ${card.tags.map((one) => `#${one}`).join(' ')}`.toLowerCase().includes(words))
  const [[, ordered]] = arrange(found, view, facets, ORDER)
  // Cut into groups, each in its own order; a book's cards in page order whatever the sort, as a book is read.
  const grouping = GROUPING[view.group]
  const groups: [string, BrowsedCard[]][] = useMemo(() => {
    if (!grouping) return [['', ordered]]
    const out = new Map<string, BrowsedCard[]>()
    for (const card of ordered) out.set(grouping.of(card), [...(out.get(grouping.of(card)) ?? []), card])
    if (view.group === 'source') for (const [name, one] of out) if (name !== 'No source') out.set(name, [...one].sort((a, b) => spot(a) - spot(b) || ORDER[view.sort]?.(a, b) || 0))
    const rank = (entry: [string, BrowsedCard[]]): number | string => grouping.rank(entry[0], entry[1])
    return [...out].sort((a, b) => { const [x, y] = [rank(a), rank(b)]; return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)) })
  }, [ordered, grouping, view.group, view.sort]) // eslint-disable-line react-hooks/exhaustive-deps
  const island = useIslands('cards', !!grouping && view.islands !== false)
  const { groups: drawn, islands } = island(groups)
  const shown = drawn.flatMap(([, one]) => one)
  const several = usePickMixed(ordered.map((card) => ({ type: 'nugget', id: card.id, title: card.prompt })), { here })
  const picked = ordered.filter((card) => several.picked({ type: 'nugget', id: card.id }))
  const pause = (ids: string[], on: boolean): void => void call('cards:pause', ids, on).then(() => {
    chime(on ? 'shelve' : 'unshelve')
    toast(`${on ? 'Paused' : 'Back in Review'}: ${num(ids.length)} ${ids.length === 1 ? 'card' : 'cards'}`, () => void call('cards:pause', ids, !on).then(() => chime('undo')))
  })
  const retag = (ids: string[], on: boolean): void => {
    const word = tagging.trim().replace(/^#/, '').toLowerCase()
    if (!word) return
    void call<{ id: string; body: string | null }[]>('cards:retag', ids, word, on).then((before) => {
      chime(on ? 'noted' : 'fold')
      setTagging('')
      toast(`#${word} ${on ? 'on' : 'off'} ${num(before.length)} ${before.length === 1 ? 'card' : 'cards'}`, () => void call('cards:retag:undo', before).then(() => chime('undo')))
    })
  }
  // Moved to a deck or tag: the new one on, the card's others off, one Undo for both.
  const move = (card: BrowsedCard, word: string): void => void (async () => {
    const before = new Map<string, string | null>()
    const keepFirst = (rows: { id: string; body: string | null }[]): void => rows.forEach((one) => !before.has(one.id) && before.set(one.id, one.body))
    keepFirst(await call<{ id: string; body: string | null }[]>('cards:retag', [card.id], word, true))
    for (const old of card.tags.filter((one) => one !== word)) keepFirst(await call<{ id: string; body: string | null }[]>('cards:retag', [card.id], old, false))
    chime('noted')
    toast(`Moved to #${word}`, () => void call('cards:retag:undo', [...before].map(([id, body]) => ({ id, body }))).then(() => chime('undo')))
  })()
  // Back to new, as if never reviewed; Undo puts its progress back.
  const reset = (ids: string[]): void => void call<{ id: string; state: string | null; dueAt: string | null }[]>('cards:reset', ids).then((before) => {
    chime('fold')
    toast(`Progress reset: ${num(before.length)} ${before.length === 1 ? 'card is' : 'cards are'} new again`, () => void call('cards:reset:undo', before).then(() => chime('undo')))
  })
  const copy = (card: BrowsedCard): void => void navigator.clipboard.writeText(`${card.prompt}\n${card.answer}`).then(() => (chime('tap'), toast('Card copied')))
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
  const now = useRef({ shown, density, turnAll, editing })
  now.current = { shown, density, turnAll, editing }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const box = list.current
      if (!box) return
      const items = [...box.querySelectorAll<HTMLElement>('[data-pick]')]
      const at = items.findIndex((one) => one.contains(document.activeElement))
      const card = at >= 0 ? now.current.shown.find((one) => `nugget:${one.id}` === items[at].dataset.pick) : undefined
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
      if (key === 'ArrowDown' || key === 'j') go(grid && key === 'ArrowDown' ? below(1) : at + 1)
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
  const paste = pasting ? <PasteCards onClose={() => (chime('fold'), setPasting(false))} /> : null
  if (!cards.length)
    return (
      <div className="flex flex-col gap-3 px-5 pt-5 pb-10">
        {paste ?? <Empty title="No cards yet" action={<Button size="sm" data-paste-open onClick={() => (chime('open'), setPasting(true))}>Paste cards</Button>}>Paste a list of cards, write the question a gem answers under “Review”, or import an Anki deck from File › Import.</Empty>}
      </div>
    )

  const menu = (card: BrowsedCard): RowItem[] => several.menu({ type: 'nugget', id: card.id }) ?? [
    { label: 'Edit', keys: 'E', run: () => setEditing(card.id) },
    { label: 'Open', keys: '↩', run: () => onOpen('nugget', card.id) },
    canSplit() && { label: 'Open to the side', run: () => openAside('nugget', card.id) },
    density === 'grid' && { label: over.has(card.id) ? 'Turn face up' : 'Turn over', keys: 'space', run: () => turn(card.id) },
    'separator',
    { label: 'Ask another way', run: () => fix(card, 'another') },
    { label: 'Split in two', run: () => fix(card, 'split') },
    { label: card.paused ? 'Bring back' : 'Pause', run: () => pause([card.id], !card.paused) },
    card.reviews > 0 && { label: 'Reset progress', run: () => reset([card.id]) },
    tags.length > 0 && { label: 'Move to deck or tag', items: tags.filter((one) => !(card.tags.length === 1 && card.tags[0] === one)).slice(0, 12).map((one) => ({ label: `#${one}`, run: () => move(card, one) })) },
    { label: 'Copy', run: () => copy(card) },
    'separator',
    binItem([{ type: 'nugget', id: card.id }]),
    ...several.rowItems({ type: 'nugget', id: card.id })
  ]
  const question = (card: BrowsedCard, className = ''): React.JSX.Element => (
    <span className={`min-w-0 ${className}`}><WithPictures text={card.prompt.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim() || card.prompt} small /></span>
  )
  // What needs work: a small mark, said in full on hover. Its fixes, one click
  // each, where you asked to see what needs work (grouped or filtered by it).
  const working = view.group === 'needs' || (view.filter.needs ?? []).length > 0
  const said = (card: BrowsedCard): string => [card.lapses >= 2 && `Forgotten ${num(card.lapses)} times${card.leech ? ', a leech' : ''}`, card.things > 4 && `asks for ${num(card.things)} things (more than 4)`, (card.seconds ?? 0) >= 40 && `takes ${num(card.seconds!)} seconds each time`].filter(Boolean).join('; ')
  // Grouped or filtered by it, the fixes line says it in words instead.
  const mark = (card: BrowsedCard): React.JSX.Element | null => !needs(card).length || working ? null : (
    <Tip label={`${said(card).replace(/^./, (one) => one.toUpperCase())}. Split it, or ask it another way`}>
      <span data-card-needs={needs(card).join(' ')} data-card-big={needs(card).some((one) => one === 'big' || one === 'slow') || undefined} aria-label={said(card)} className="inline-flex shrink-0 text-[var(--tt-color-text-orange)]">
        <CircleAlert className="size-3.5" />
      </span>
    </Tip>
  )
  const link = 'rounded px-1 font-medium text-foreground underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground/60'
  const fixes = (card: BrowsedCard): React.JSX.Element | null => !working || !needs(card).length ? null : (
    <span data-card-fixes className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs" onPointerUp={(event) => event.stopPropagation()}>
      <span className="mr-0.5 text-[var(--tt-color-text-orange)]">{said(card)}</span>
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
  const where = (card: BrowsedCard): string => [card.source, card.at].filter(Boolean).join(', ')

  const row = (card: BrowsedCard): React.JSX.Element => {
    const on = several.picked(pick(card))
    const common = {
      'data-pick': `nugget:${card.id}`, role: 'button', tabIndex: 0, 'aria-selected': on,
      onClick: (event: React.MouseEvent) => several.click(event, pick(card)) || (chime('tap'), setEditing(editing === card.id ? null : card.id))
    }
    // The Anki Browser's table: one line a card, its columns lined up down the page.
    if (density === 'compact')
      return (
        <div {...common} className={`grid cursor-pointer grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6.5rem_5rem_8rem] items-center gap-x-3 border-b border-border/50 px-3 py-1 text-xs outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/60 ${on ? 'bg-accent' : ''} ${card.paused ? 'opacity-60' : ''}`}>
          {question(card, 'truncate text-control font-medium')}
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">{mark(card)}<span className="truncate">{answerShown(card) || 'No answer yet'}</span></span>
          <span className={`text-right tabular-nums ${dueSaid(card) === 'due now' ? 'text-foreground' : 'text-muted-foreground'}`}>{dueSaid(card) === 'new' ? '' : dueSaid(card)}</span>
          <span className="flex items-center gap-1.5 text-muted-foreground"><span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: tintOf(card) }} />{STAGES.find((one) => one.id === stageOf(card))!.label}</span>
          <span className="truncate text-right text-muted-foreground">{card.tags.slice(0, 2).map((one) => `#${one}`).join(' ')}</span>
        </div>
      )
    // The list: the question over its answer on the left; when, stage and tags in one column on the right.
    return (
      <div {...common} className={`grid cursor-pointer grid-cols-[1fr_10rem] items-center gap-x-4 rounded-md px-3 py-2 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/60 ${on ? 'bg-accent' : ''} ${card.paused ? 'opacity-60' : ''}`}>
        <span className="flex min-w-0 flex-col gap-0.5">
          {question(card, 'truncate text-sm font-medium')}
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {mark(card)}
            <span className="min-w-0 truncate">{answerShown(card) || 'No answer yet'}</span>
          </span>
          {fixes(card)}
        </span>
        <span className="flex min-w-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            {/* "new" is said once, by the stage. */}
            {dueSaid(card) !== 'new' && <>
              <span className={`tabular-nums ${dueSaid(card) === 'due now' ? 'text-foreground' : ''}`}>{dueSaid(card)}</span>
              <span aria-hidden className="text-foreground/25">·</span>
            </>}
            <span data-card-stage className="flex items-center gap-1"><span aria-hidden className="size-1.5 rounded-full" style={{ background: tintOf(card) }} />{STAGES.find((one) => one.id === stageOf(card))!.label.toLowerCase()}</span>
          </span>
          {card.tags.length > 0 && <span className="max-w-full truncate">{card.tags.slice(0, 2).map((one) => `#${one}`).join(' ')}</span>}
        </span>
      </div>
    )
  }

  // A real flashcard: the question face up, the answer on its back, its stage colour down its edge.
  const flash = (card: BrowsedCard): React.JSX.Element => {
    const on = several.picked(pick(card))
    const turned = over.has(card.id) !== (hovered === card.id)
    const face = (side: 'front' | 'back', children: React.ReactNode): React.JSX.Element => (
      <div data-card-face={side} className={`relative flex h-full min-h-40 flex-col gap-2 overflow-hidden rounded-lg border border-l-[3px] bg-background px-4 pt-3.5 pb-3 ${on ? 'ring-2 ring-[var(--tt-brand-color-400)]' : ''}`} style={{ borderLeftColor: tintOf(card) }}>
        {children}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{where(card) || card.tags.slice(0, 2).map((one) => `#${one}`).join(' ')}</span>
          <span className={`shrink-0 tabular-nums ${dueSaid(card) === 'due now' ? 'text-foreground' : ''}`}>{dueSaid(card)}</span>
        </div>
      </div>
    )
    return (
      <div data-pick={`nugget:${card.id}`} tabIndex={0} role="button" aria-selected={on} aria-label={card.prompt} data-turned={turned || undefined}
        className={`h-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring ${card.paused ? 'opacity-60' : ''}`}
        onPointerEnter={() => setHovered(card.id)} onPointerLeave={() => setHovered(null)}
        // ⌘- and ⇧-click pick, as everywhere; a plain click turns it over (Flip).
        onPointerUpCapture={(event) => (event.metaKey || event.shiftKey) && (event.stopPropagation(), several.click(event, pick(card)))}>
        <Flip over={turned} onTurn={(to) => (chime('tap'), turn(card.id, hovered === card.id ? !to : to))}
          front={face('front', <>
            {card.picture && <img src={card.picture} alt="" className="max-h-28 w-full rounded object-contain" />}
            <span className="flex items-start gap-1.5">{question(card, 'line-clamp-4 flex-1 text-body font-medium leading-snug')}{mark(card)}</span>
            {fixes(card)}
          </>)}
          back={face('back', <p className="line-clamp-6 text-sm leading-relaxed text-foreground/90">{answerShown(card) || 'No answer yet'}</p>)} />
      </div>
    )
  }

  const cell = (card: BrowsedCard): React.JSX.Element => (
    <div key={card.id} data-card-row={card.id} className="contents">
      {editing === card.id
        ? <div className={density === 'grid' ? 'col-span-full' : ''}><EditCard card={card} tint={tintOf(card)} onDone={() => { setEditing(null); requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-pick="nugget:${card.id}"]`)?.focus()) }} /></div>
        : <RowMenu items={menu(card)}>{density === 'grid' ? <div className="h-full">{flash(card)}</div> : row(card)}</RowMenu>}
      {fixer(card)}
    </div>
  )
  const body = (list: BrowsedCard[]): React.JSX.Element => density === 'grid'
    ? <div data-card-grid className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 p-1">{list.map(cell)}</div>
    : <div className={`flex flex-col ${density === 'compact' ? 'text-xs' : ''}`}>{list.map(cell)}</div>
  const head = density === 'compact' && (
    <div aria-hidden className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6.5rem_5rem_8rem] gap-x-3 border-b px-3 pb-1 text-xs font-medium text-muted-foreground">
      <span>Question</span><span>Answer</span><span className="text-right">Due</span><span>Stage</span><span className="text-right">Tags</span>
    </div>
  )
  const allOver = shown.length > 0 && shown.every((card) => over.has(card.id))

  return (
    <div data-card-browser data-density={density} className="flex flex-col gap-3 px-5 pt-5 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-1"><ListSearch value={query} onChange={setQuery} onDone={() => {}} placeholder="Search cards" /></div>
        {density === 'grid' && (
          <Tip label="Turn every card on show over, to test yourself  ⇧Space">
            <Button variant="ghost" size="sm" data-turn-all aria-pressed={allOver} onClick={turnAll}>{allOver ? 'All face up' : 'Turn all over'}</Button>
          </Tip>
        )}
        <Button variant="ghost" size="sm" data-paste-open aria-expanded={pasting} onClick={() => (chime(pasting ? 'fold' : 'open'), setPasting(!pasting))}>Paste cards</Button>
        <Display view={view} onChange={setView} facets={facets} items={cards} count={cards.length} sorts={SORTS} groups={GROUPS}
          sortNote={view.group === 'source' ? 'Within each book or video, cards go in page or time order.' : undefined}
          density={density} onDensity={(next) => setView({ ...view, density: next })} densities={['compact', 'list', 'grid']} names={{ grid: 'Cards' }} />
      </div>
      {paste}
      <Chips options={[{ id: '', label: `All ${num(cards.length)}` }, ...tags.slice(0, 12).map((one) => ({ id: one, label: `#${one}` }))]} on={(id) => (tag ?? '') === id} pick={(id) => setTag(id || null)} />
      {several.count > 0 && (
        <div data-card-picked className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent/30 px-3 py-2 text-sm">
          <span className="font-medium">{num(several.count)} picked</span>
          <Button variant="ghost" size="sm" data-cards-pause onClick={() => pause(picked.map((one) => one.id), !picked.every((one) => one.paused))}>
            {picked.every((one) => one.paused) ? 'Bring back' : 'Pause'}
          </Button>
          <Input value={tagging} onChange={(event) => setTagging(event.target.value)} placeholder="#tag" className="h-7 w-32 text-sm"
            onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), retag(picked.map((one) => one.id), true))} />
          <Button variant="ghost" size="sm" data-cards-tag onClick={() => retag(picked.map((one) => one.id), true)}>Add tag</Button>
          <Button variant="ghost" size="sm" data-cards-untag onClick={() => retag(picked.map((one) => one.id), false)}>Take tag off</Button>
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">⌫ to the Bin, Esc to let go</span>
        </div>
      )}
      {several.bar}
      {/* New, learning and due, as Anki users count a deck: for what is on show. */}
      <p data-card-counts className="flex flex-wrap gap-x-4 text-sm">
        <span><strong className="font-semibold text-[var(--tt-color-text-blue)] tabular-nums">{num(ordered.filter((one) => one.stage === 'new' && !one.paused).length)}</strong> new</span>
        <span><strong className="font-semibold text-[var(--tt-color-text-orange)] tabular-nums">{num(ordered.filter((one) => one.stage === 'learning' && !one.paused).length)}</strong> learning</span>
        <span><strong className="font-semibold text-[var(--tt-color-text-green)] tabular-nums">{num(ordered.filter((one) => one.dueAt && Date.parse(one.dueAt) <= Date.now() && !one.paused).length)}</strong> due now</span>
        <span data-card-known><strong className="font-semibold text-[var(--tt-color-text-purple)] tabular-nums">{num(ordered.filter((one) => one.known).length)}</strong> known <span className="text-muted-foreground">(remembered after 15 days or more)</span></span>
        <span className="text-muted-foreground">{num(ordered.length)} of {num(cards.length)} cards{tag ? ` with #${tag}` : ''}</span>
      </p>
      {!ordered.length ? (
        <Empty title="No card matches" action={<button type="button" onClick={() => (chime('undo'), setQuery(''), setTag(null), setView({ ...view, filter: {} }))} className="text-control font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">Clear the filters</button>}>
          None of your cards has those words or fits those filters.
        </Empty>
      ) : (
        <div ref={list} data-card-list>
          {head}
          {drawn.map(([name, one]) => {
            const whole = groups.find(([key]) => key === name)?.[1] ?? one
            const inner = <>{view.group === 'source' && <Coverage cards={whole} />}{body(one)}</>
            if (!name) return <div key="all">{inner}</div>
            return islands?.[name]
              ? <IslandBox key={name} name={name} island={islands[name]} shown={one.length} extra={<DueAhead cards={whole} />}>{inner}</IslandBox>
              : (
                <section key={name} data-card-group={name} className="mt-4 first:mt-0">
                  <h2 className="flex items-center gap-2 px-2 pb-1.5 text-control font-semibold">{name}<span className="font-normal text-muted-foreground tabular-nums">{num(whole.length)}</span><span className="ml-auto"><DueAhead cards={whole} /></span></h2>
                  {inner}
                </section>
              )
          })}
        </div>
      )}
    </div>
  )
}
