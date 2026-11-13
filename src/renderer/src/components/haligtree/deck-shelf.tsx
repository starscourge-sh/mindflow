import { useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { call, haligtree, unloaded, useLive } from '@/lib/haligtree'
import { num, plural } from '../../../../main/dates'
import { Decoded, FIRST_PICTURES, ask, askSure, quietly, refuse, toast } from './ui'
import { ReadsIn } from '@/lib/reads-in'
import { EXAMPLE_TAG } from '../../../../main/name'
import { Button } from '@/components/ui/button'
import { Chip, Chips } from './display'
import { INPUT_FRAME } from './hash-field'
import { SCRUB, ScrubField } from '../pdf/scrub-field'
import { Tree, treeOf } from './branches'
import { GroupCover } from './group-cover'
import { groupTint } from './card-shelves'
import { small } from '@/lib/small-picture'
import { RowMenu, openFromGrip, type RowItem } from './row-menu'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, BookmarkPlus, ChevronRight, Eye, EyeOff, FolderPlus, GraduationCap, Hourglass, Image, Layers, LayoutGrid, Link, List as ListIcon, ListPlus, Pencil, Plus, Share, SlidersHorizontal, Trash2, type LucideIcon } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { AliveIcon } from '@/components/ui/alive-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { StudyYear } from './study-stats'
import type { Settings } from '@/lib/haligtree'
import { moveToBin } from '@/lib/to-bin'
import { cardsSaid, deckTagOf, deckTitle, madeDeck, nameFit, sayDeck, softBreaks, useNewDeckAsked, useOwnDecks, type OwnDeck } from './decks'
import { NameInPlace } from './name-in-place'
import { Coverage, coverageOf, type BrowsedCard } from './card-browser'
import { TabControls, useToolbarCompact } from './review-toolbar'
import { Tip } from './ui'
import { motion } from 'motion/react'
import { EASE, still } from '@/lib/motion'
import { PileEdges } from './deck-pile'
import { OnceHint } from './page-hint'
import { quoted } from '../../../../main/clip'
import { heroAround, heroOpen } from '@/lib/hero'

type Topic = { deck: string; label: string; cards: number; held: number }
export type Shelf = { name: string; cover: string | null; sample: string; pictures: number; cards: number; fresh: number; due: number; held: number; shown: boolean; topics: Topic[] }

/** A deck's #tag, as the import made it: "Great Works of Art::Artists" is great-works-of-art-artists. */
export const deckTag = (name: string): string =>
  name.toLowerCase().split('::').map((part) => part.trim().replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('-')

const cards = (n: number): string => `${plural(n, 'card')}`

/** Start a held deck or topic, or hold it again, with Undo; starting says to meet the material first. */
export function startDeck(deck: string, label: string, on: boolean): void {
  void call<number>('decks:start', deck, on).then((n) => {
    if (!n) return
    chime(on ? 'unshelve' : 'shelve')
    toast(on ? `${label}: ${cards(n)} start in Review. Read or watch it first; the cards will make sense.` : `${label}: ${cards(n)} held, out of Review until you start them`,
      () => void call('decks:start', deck, !on).then(() => chime('undo')))
  })
}

/** What is open on the Decks tab: the decks inside a deck (each opened from its "+N sub-decks"), a shared deck's pictures, its links. */
export type DeckPlace = { inside: string[]; pictures: string | null; links: string | null }
export const NO_PLACE: DeckPlace = { inside: [], pictures: null, links: null }
/** The Decks tab and what is open on it, as the words of a step: "decks", or "decks?inside=zoo&pictures=Paintings". */
export const placeWords = (place: DeckPlace): string => {
  const words = new URLSearchParams()
  for (const one of place.inside) words.append('inside', one)
  if (place.pictures) words.set('pictures', place.pictures)
  if (place.links) words.set('links', place.links)
  return words.size ? `decks?${words}` : 'decks'
}
export const placeOf = (words: string): DeckPlace => {
  const said = new URLSearchParams(words.split('?')[1] ?? '')
  return { inside: said.getAll('inside'), pictures: said.get('pictures'), links: said.get('links') }
}

/**
 * Review's Decks page: the shared decks you imported, each on its own shelf
 * with its cover, how many cards are new, due and held, and its topics, each
 * started when you study it. Their cards stay out of Gems, Media, Feed, hints
 * and Home unless "Show in Gems" is on, so your own never drown.
 */
/** Past this many decks of your own, only those made as decks or with cards in Review show before the fold. */
const MANY = 8
/** The most pockets drawn before the fold. */
const POCKETS = 24

export function DeckShelf({ place, onPlace, onOpen, onStudy, onPaste, onPicture, onShow }: { /** What is open on the shelf, kept by Review as a step of its own. */ place: DeckPlace; onPlace: (place: DeckPlace) => void; /** Show these cards in All cards, and only them. */ onShow: (ids: string[]) => void; onOpen: (type: string, id: string) => void; /** Study a deck's or topic's tag in Today. */ onStudy: (tag: string) => void; /** Paste cards into a deck, or make one card in it, in All cards. */ onPaste: (deck: string | null, one?: boolean) => void; /** Make cards from a picture, into a deck or none. */ onPicture: (deck: string | null) => void }): React.JSX.Element {
  const { pictures: gallery, links: linking } = place
  const setGallery = (deck: string | null): void => onPlace({ ...place, pictures: deck })
  const setLinking = (deck: string | null): void => onPlace({ ...place, links: deck })
  const [allTags, setAllTags] = useState(false)
  const [look, setLook] = useDeckLook()
  const kidsOpen = new Set(place.inside)
  const openKids = (key: string): void => { const next = new Set(kidsOpen); chime(next.delete(key) ? 'fold' : (next.add(key), 'open')); onPlace({ ...place, inside: [...next] }) }
  const shapes = useLive(haligtree.settings, null as Settings | null)?.deckShapes === true
  const shelves = useLive(() => call<Shelf[]>('decks:list'), null as Shelf[] | null, [], ['item'])
  const own = useOwnDecks()
  const study = useLive(haligtree.tagStudy, { sides: {}, timer: {}, place: {}, typed: {}, newPerDay: {}, retention: {} } as Awaited<ReturnType<typeof haligtree.tagStudy>>, [], ['item'])
  const compact = useToolbarCompact()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const sets = useLive(() => call<{ name: string; tag: string }[]>('sets:list'), [] as { name: string; tag: string }[], [], ['item'])
  // The deck whose settings are open, beside its pocket or row.
  const [sheet, setSheet] = useState<{ tag: string; name: string; at: HTMLElement } | null>(null)
  // A deck being named where it will stand, as Finder names a new folder: a new one (inside another, or not), or one renamed.
  const [naming, setNaming] = useState<{ inside?: string } | { tag: string } | null>(null)
  useNewDeckAsked(() => setNaming({}))
  if (unloaded(shelves) || !own) return <div />
  const newDeck = (inside?: string): void => setNaming({ inside })
  const renaming = naming && 'tag' in naming ? naming.tag : null
  const named = (words: string | null): void => {
    const was = naming
    setNaming(null)
    if (!was || !words) return
    // A deck inside another shows only its own part ("Cells"): it stays inside.
    const deck = 'tag' in was ? own.find((one) => one.tag === was.tag) : undefined
    if (deck) return void renameDeck(deck.tag, deck.label === deck.tag ? words : `${deck.tag.slice(0, -deck.label.length - 1)}/${words}`)
    if ('tag' in was) return
    void madeDeck(words, was.inside)
  }
  // The new deck's own tile, its name field ready: first in the grid, under the button that made it.
  const fresh = naming && !('tag' in naming) ? <NamingTile key="naming" inside={naming.inside} onDone={named} /> : null
  // In the order you dragged them to, then the most due first.
  const tops = ownOrder(own.filter((deck) => deck.depth === 0), study.place)
  // A deck one place earlier or later, from its menu: the keyboard's way to reorder, with Undo.
  const move = (tag: string, by: number): void => {
    const was = tops.map((one) => one.tag)
    const order = [...was]
    const at = order.indexOf(tag)
    order.splice(at, 1)
    order.splice(at + by, 0, tag)
    void call('decks:order', order).then(() => (chime('settled'), quietly(() => void call('decks:order', was))))
  }
  const show = (shelf: Shelf): void =>
    void call<number>('decks:show', shelf.name, !shelf.shown).then(() => {
      chime(shelf.shown ? 'fold' : 'noted')
      toast(shelf.shown ? `${shelf.name} is back on its shelf, out of Gems` : `${shelf.name} shows in Gems, Feed and Home now`, () => void call('decks:show', shelf.name, shelf.shown).then(() => chime('undo')))
    })
  const settings = (tag: string, name: string, at: HTMLElement | null): void => void (at && (chime('open'), setSheet({ tag, name, at })))
  // A deck's cards in All cards, and only them: its sub-decks' too, as studying it takes them.
  const cardsOf = (tag: string): void => void call<{ id: string; tags: string[] }[]>('cards:all').then((all) => onShow(all.filter((card) => card.tags.some((one) => one === tag || one.startsWith(`${tag}-`))).map((card) => card.id)))
  const sideways = look === 'pockets'
  /**
   * One menu for a deck, the same from its ⋯ and from a right click, on a
   * pocket and on a List row: study it, make cards in it, its settings, keep
   * or share it, arrange it, and Delete last. In the order they are used.
   */
  const ownItems = (deck: OwnDeck, at: () => HTMLElement | null): RowItem[] => {
    if (deck.tag === EXAMPLE_TAG) return exampleItems(onStudy)
    const place = tops.indexOf(deck)
    return [
      // Use it: study it, or see what is in it.
      deck.cards > 0 && { label: 'Study', keys: 'S', icon: glyph(GraduationCap), run: () => (chime('riffle'), onStudy(deck.tag)) },
      deck.cards > 0 && { label: 'Show its cards', icon: glyph(Layers), run: () => cardsOf(deck.tag) },
      'separator',
      // Fill it.
      { label: 'Make a card', icon: glyph(Plus), run: () => (chime('open'), onPaste(deck.tag, true)) },
      { label: 'Add many at once', icon: glyph(ListPlus), run: () => (chime('open'), onPaste(deck.tag)) },
      { label: 'Cards from a picture', icon: glyph(Image), run: () => onPicture(deck.tag) },
      'separator',
      // Arrange it.
      { label: 'Rename…', icon: glyph(Pencil), run: () => setNaming({ tag: deck.tag }) },
      { label: 'New deck inside', icon: glyph(FolderPlus), run: () => newDeck(deck.tag) },
      // Without a mouse: the same move as dragging it, one place at a time, folded into one line.
      deck.depth === 0 && place >= 0 && tops.length > 1 && { label: 'Move in the list', icon: glyph(ArrowUpDown), items: [
        place > 0 && { label: 'Earlier', icon: glyph(sideways ? ArrowLeft : ArrowUp), run: () => move(deck.tag, -1) },
        place < tops.length - 1 && { label: 'Later', icon: glyph(sideways ? ArrowRight : ArrowDown), run: () => move(deck.tag, 1) }
      ] },
      { label: 'Deck settings…', icon: glyph(SlidersHorizontal), run: () => settings(deck.tag, deckName(deck), at()) },
      'separator',
      // Take it elsewhere.
      deck.cards > 0 && { label: 'Save as a study set…', hint: 'A named set to study for, like an exam', icon: glyph(BookmarkPlus), run: () => void saveSet(deck.tag) },
      deck.cards > 0 && { label: 'Export for Anki…', hint: 'An .apkg file to share or open in Anki', icon: glyph(Share), run: () => void shareDeck(deck.tag, deckName(deck)) },
      { label: 'Delete deck…', hint: 'Its cards stay, in All cards', danger: true, icon: glyph(Trash2), run: () => void deleteDeck(deck.tag) }
    ]
  }
  // A shared deck's menu, in the same order as one of your own, with what an import adds (held cards, Gems, links).
  const sharedItems = (shelf: Shelf, at: () => HTMLElement | null): RowItem[] => [
    shelf.held < shelf.cards && { label: 'Study', keys: 'S', icon: glyph(GraduationCap), run: () => (chime('riffle'), onStudy(deckTag(shelf.name))) },
    { label: shelf.held > 0 ? 'Start the held cards' : 'Hold new cards', icon: glyph(Hourglass), run: () => startDeck(shelf.name, shelf.name, shelf.held > 0) },
    'separator',
    { label: 'Deck settings…', icon: glyph(SlidersHorizontal), run: () => settings(deckTag(shelf.name), shelf.name, at()) },
    { label: shelf.shown ? 'Keep out of Gems' : 'Show in Gems', icon: glyph(shelf.shown ? EyeOff : Eye), run: () => show(shelf) },
    { label: 'Links…', icon: glyph(Link), run: () => (chime('open'), setLinking(shelf.name)) },
    'separator',
    shelf.pictures > 0 && { label: gallery === shelf.name ? 'Hide pictures' : 'Pictures', icon: glyph(Image), run: () => (chime('open'), setGallery(gallery === shelf.name ? null : shelf.name)) },
    { label: 'Show its cards', icon: glyph(Layers), run: () => void call<string[]>('decks:cards', shelf.name).then(onShow) },
    { label: 'Delete deck…', hint: 'Its cards go to the Bin', danger: true, icon: glyph(Trash2), run: () => void removeShared(shelf) }
  ]
  const listMenu = (target: { own: OwnDeck } | { shelf: Shelf }, at: () => HTMLElement | null): RowItem[] => ('own' in target ? ownItems(target.own, at) : sharedItems(target.shelf, at))
  const settingsSheet = sheet && <DeckSettings key={sheet.tag} tag={sheet.tag} name={sheet.name} at={sheet.at} study={study} onClose={() => setSheet(null)} />
  const many = tops.length > MANY
  // At most POCKETS on show at once, the most due first: a big collection reads better in the List, which the fold offers.
  // While a deck is dragged over another, the others make room live: the dragged one stands where it would land.
  const preview = (list: OwnDeck[]): OwnDeck[] => {
    if (!dragging || !over || dragging === over) return list
    const moving = list.find((one) => one.tag === dragging)
    const rest = list.filter((one) => one.tag !== dragging)
    const at = rest.findIndex((one) => one.tag === over)
    if (!moving || at < 0) return list
    return [...rest.slice(0, at + (list.indexOf(moving) < list.findIndex((one) => one.tag === over) ? 1 : 0)), moving, ...rest.slice(at + (list.indexOf(moving) < list.findIndex((one) => one.tag === over) ? 1 : 0))]
  }
  const shown = preview((many ? tops.filter((deck) => deck.made || deck.active > 0) : tops).slice(0, POCKETS))
  const folded = tops.filter((deck) => !shown.includes(deck))
  // The first time a deck has a card due, what "due" means, once, just over the decks and their counts.
  const dueHint = <OnceHint name="deck-due" when={own.some((deck) => deck.due > 0) || (shelves ?? []).some((shelf) => shelf.due > 0)} />
  // The three ways cards come in, always at the top, whatever is below: as Anki's "Create Deck" and "Import File" are.
  const top = (
    <TabControls>
      {/* A real button, outlined as Review's toolbar buttons are. Narrow, in icons before they would ever be cut: a + for New deck, the switch as two icons; each named on hover. */}
      {compact
        ? <Tip label="New deck"><Button variant="outline" size="sm" aria-label="New deck" className="size-8 cursor-pointer p-0" data-deck-new onClick={() => (chime('open'), newDeck())}><Plus className="size-4" /></Button></Tip>
        : <Button variant="outline" size="sm" className="h-8 cursor-pointer px-3" data-deck-new onClick={() => (chime('open'), newDeck())}><Plus className="size-3.5" />New deck</Button>}
      {/* Stacks (code name "pockets") or a plain list, in the same two-part control as Review's tabs beside it. */}
      <span role="radiogroup" aria-label="Show decks as" data-deck-look-pick className="flex h-8 items-center rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-control">
        {(['pockets', 'list'] as const).map((one) => (
          <button key={one} type="button" role="radio" aria-checked={look === one} aria-label={one === 'pockets' ? 'Stacks' : 'List'} data-deck-look-to={one} onClick={() => void (look !== one && (chime('tap'), setLook(one)))}
            className={`h-7 cursor-pointer rounded-md border ${compact ? 'px-2' : 'px-3'} transition-colors ${look === one ? 'border-foreground/15 bg-background text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{compact ? (one === 'pockets' ? <LayoutGrid className="size-3.5" /> : <ListIcon className="size-3.5" />) : one === 'pockets' ? 'Stacks' : 'List'}</button>
        ))}
      </span>
    </TabControls>
  )
  // No cards of your own yet (the example deck is not yours): the ways in, each with a tiny example, and the example deck to learn by doing.
  if (!shelves?.length && !own.some((deck) => deck.tag !== EXAMPLE_TAG))
    return (
      <div data-deck-shelf data-deck-first className="grid grid-cols-[minmax(0,1fr)] gap-4 px-5 pt-4 pb-20">
        {top}
        {fresh && <div data-deck-grid className={GRID}>{fresh}</div>}
        <FirstWays example={own.find((deck) => deck.tag === EXAMPLE_TAG) ?? null} onMake={() => (chime('open'), onPaste(null, true))} onPicture={() => onPicture(null)} onStudy={onStudy} />
        <StudyYear />
      </div>
    )
  if (look === 'list')
    return (
      <div data-deck-shelf data-deck-look="list" className="grid grid-cols-[minmax(0,1fr)] gap-4 px-5 pt-4 pb-20">
        {top}
        <StudyYear compact />
        <StudySets sets={sets} onStudy={onStudy} />
        {dueHint}
        <DeckList own={own} shelves={shelves ?? []} onStudy={onStudy} place={study.place} menu={listMenu} fresh={naming && !('tag' in naming) ? naming : null} renaming={renaming} onNamed={named} />
        {/* Under the decks, never over them: Decks opens on the decks, as Anki's does (1 Nov), what the books hold after. */}
        <BookCoverage />
        {linking && <Links deck={linking} onDone={() => setLinking(null)} />}
        {gallery && <Gallery deck={gallery} onOpen={onOpen} />}
        {settingsSheet}
      </div>
    )
  const sharedTiles = (shelves ?? []).map((shelf) => {
    const topics = shelf.topics.length > 1 ? treeOf([...shelf.topics].sort((a, b) => a.deck.localeCompare(b.deck)), (topic) => topic.deck.split('::').length).length : 0
    const allHeld = shelf.held > 0 && shelf.held === shelf.cards
    return (
      <DeckTile key={shelf.name} id={shelf.name} name={shelf.name} title={shelf.name} due={shelf.due} fresh={shelf.fresh} all={shelf.cards} held={shelf.held} cover={shelf.cover} shapes={shapes}
        kids={topics} open={kidsOpen.has(shelf.name)} onKids={() => openKids(shelf.name)} items={(at) => sharedItems(shelf, at)}
        onClick={() => (allHeld ? startDeck(shelf.name, shelf.name, true) : (chime('riffle'), onStudy(deckTag(shelf.name))))} />
    )
  })
  // Dropped on another deck, a deck takes its place and the rest move along; the order is kept.
  // Dropped anywhere on the decks (the dragged one itself stands where it will land): the order shown while dragging is kept.
  const drop = (): void => {
    const order = preview(tops).map((one) => one.tag)
    const was = tops.map((one) => one.tag)
    setDragging(null)
    setOver(null)
    if (order.join() === was.join()) return
    void call('decks:order', order).then(() => (chime('settled'), quietly(() => void call('decks:order', was))))
  }
  const tile = (deck: OwnDeck): React.JSX.Element => (
    <DeckTile key={deck.tag} id={deck.tag} own drag={deck.depth === 0 ? { over: false, lifted: dragging === deck.tag, start: () => setDragging(deck.tag), enter: () => dragging && deck.tag !== dragging && setOver(deck.tag), end: () => (setDragging(null), setOver(null)), drop } : undefined} name={deckName(deck)} title={deckTitle(deck.tag, own.map((one) => one.tag))} due={deck.due} fresh={deck.fresh} all={deck.cards} held={0} cover={null} shapes={shapes}
      kids={own.filter((one) => one.tag.startsWith(`${deck.tag}-`) && one.depth === deck.depth + 1).length} open={kidsOpen.has(deck.tag)} onKids={() => openKids(deck.tag)} items={(at) => ownItems(deck, at)}
      renaming={renaming === deck.tag} onNamed={named}
      onClick={() => (deck.cards ? (chime('riffle'), onStudy(deck.tag)) : (chime('open'), onPaste(deck.tag, true)))} />
  )
  return (
    <div data-deck-shelf data-deck-look="pockets" className="grid grid-cols-[minmax(0,1fr)] gap-4 px-5 pt-4 pb-20">
      {top}
      <StudyYear compact />
      <StudySets sets={sets} onStudy={onStudy} />
      {dueHint}
      {/* Pockets: squarish tiles, 2 to 4 across by width; each studies when clicked, its actions in its ⋯ menu and on right-click. */}
      <div data-deck-grid className={GRID}>
        {fresh}
        {shown.map(tile)}
        {allTags && folded.map(tile)}
        {sharedTiles}
      </div>
      {folded.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          <button type="button" data-deck-fold aria-expanded={allTags} onClick={() => (chime(allTags ? 'fold' : 'open'), setAllTags(!allTags))}
            className="cursor-pointer rounded-md px-2 py-1 text-control font-medium text-(--mf-muted-strong) hover:bg-accent/50 hover:text-foreground">
            {allTags ? 'Hide the other decks' : `Show ${num(folded.length)} more ${folded.length === 1 ? 'deck' : 'decks'}`}
          </button>
          <button type="button" data-deck-fold-list onClick={() => (chime('tap'), setLook('list'))}
            className="cursor-pointer rounded-md px-2 py-1 text-control font-medium text-(--mf-muted-strong) hover:bg-accent/50 hover:text-foreground">See every deck in the List</button>
        </span>
      )}
      {/* The sub-decks of each deck opened from its "+N sub-decks", under the grid: the same tree as the List, trunk lines and chevrons. */}
      {[...kidsOpen].map((key) => {
        const deck = own.find((one) => one.tag === key)
        const shelf = (shelves ?? []).find((one) => one.name === key)
        if (!deck && !shelf) return null
        return (
          <section key={key} data-deck-inside-of={key} className="grid gap-1">
            <button type="button" onClick={() => openKids(key)} aria-expanded className="flex cursor-pointer items-center gap-1 justify-self-start rounded-[4px] px-1 text-control font-medium text-foreground hover:bg-accent/50">
              <ChevronRight className="size-3.5 rotate-90 text-muted-foreground" />Inside {deck ? deck.label : shelf!.name}
            </button>
            <DeckList own={deck ? own.filter((one) => one === deck || one.tag.startsWith(`${deck.tag}-`)) : []} shelves={shelf ? [shelf] : []} onStudy={onStudy} menu={listMenu} renaming={renaming} onNamed={named} />
          </section>
        )
      })}
      {/* Under the decks, never over them: Decks opens on the decks, as Anki's does (1 Nov), what the books hold after. */}
      <BookCoverage />
      {linking && <Links deck={linking} onDone={() => setLinking(null)} />}
      {gallery && <Gallery deck={gallery} onOpen={onOpen} />}
      {settingsSheet}
    </div>
  )
}

/** The decks' grid: squarish tiles, 2 to 4 across by width. */
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(calc(9.5rem_+_15px),1fr))] gap-x-3 gap-y-1 [&>*]:max-w-[calc(13rem_+_15px)]'

/** A deck's name typed on its tile: the tile's own serif at the tile's size, ringed while it is written. */
const NAME_FIELD = 'min-w-0 rounded-[4px] bg-transparent px-1 -mx-1 font-serif leading-snug text-foreground outline-none ring-1 ring-ring/45 placeholder:text-muted-foreground'

/**
 * A new deck's tile while it is named, where it will stand: an empty pile on
 * the decks' own surface, its name field ready. Enter or a click away makes it
 * (if named); Esc takes the tile away again.
 */
function NamingTile({ inside, onDone }: { inside?: string; onDone: (words: string | null) => void }): React.JSX.Element {
  return (
    <div data-deck-naming={inside ?? ''} className="mf-pile min-w-0 self-start">
      <PileEdges cards={0} due={0} />
      <div data-pile-top className="mf-pile-top mf-metal @container flex flex-col gap-1.5 overflow-hidden rounded-[6px] p-3.5">
        <NameInPlace placeholder={inside ? 'Name the deck inside' : 'Name the deck'} label="Deck name" onDone={onDone} className={NAME_FIELD} style={{ fontSize: '1.125rem' }} />
        <span className="text-sm text-muted-foreground">{inside ? `Inside ${deckTitle(inside)}` : 'A new deck, empty'}</span>
      </div>
    </div>
  )
}

/**
 * A deck as a pocket: a squarish tile with how many are due large in ink (a
 * small accent dot says some are), its name and "N due · N not studied yet" under it, and
 * "+N sub-decks" when it has them. The whole tile studies it; everything else
 * is in its ⋯ menu and on right-click.
 */
function DeckTile({ id, own = false, drag, name, title, due, fresh, all, held, cover, shapes, kids, open, onKids, items, onClick, renaming = false, onNamed }: {
  id: string; own?: boolean; /** A top deck of your own drags to a new place among the others. */ drag?: { over: boolean; lifted: boolean; start: () => void; enter: () => void; end: () => void; drop: () => void }; name: string; title: string; due: number; fresh: number; all: number; held: number; cover: string | null; shapes: boolean
  kids: number; open: boolean; onKids: () => void; /** Its one menu, from ⋯ and from a right click; given the pocket, so its settings open beside it. */ items: (at: () => HTMLElement | null) => RowItem[]; onClick: () => void
  /** Its name being changed where it stands. */ renaming?: boolean; onNamed?: (words: string | null) => void
}): React.JSX.Element {
  void title
  const box = useRef<HTMLDivElement | null>(null)
  return (
    <RowMenu items={() => items(() => box.current)}>
      {/* Laid out by motion: when a dragged deck passes over, the others slide to make room (at once with motion off). */}
      <motion.div ref={box} layout={!still()} transition={{ duration: 0.2, ease: EASE }} role="button" tabIndex={0} data-deck={own ? `#${id}` : id} {...(own ? { 'data-own-deck': id } : {})} onClick={(event) => (all ? heroOpen(event, onClick) : onClick())}
        onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget && (event.preventDefault(), onClick())}
        {...(drag && !renaming ? { draggable: true, onDragStart: (event: React.DragEvent) => (event.dataTransfer.effectAllowed = 'move', event.dataTransfer.setData('text/plain', `#${id}`), drag.start()),
          onDragEnter: drag.enter, onDragOver: (event: React.DragEvent) => event.preventDefault(), onDragEnd: drag.end, onDrop: (event: React.DragEvent) => (event.preventDefault(), drag.drop()) } : {}) as Record<string, unknown>}
        className={`mf-pile min-w-0 cursor-pointer self-start text-left outline-none active:scale-[0.985] motion-reduce:active:scale-100 ${drag?.lifted ? 'opacity-40' : ''}`}>
        {/* The deck as a pile: its edges under the top card, more as it grows, one standing proud when some are due. */}
        <PileEdges cards={all} due={due} />
        <div data-pile-top className="mf-pile-top mf-metal mf-metal-hover @container flex flex-col gap-1.5 overflow-hidden rounded-[6px] p-3.5">
        <span className="absolute top-1.5 right-1.5"><MenuDots /></span>
        {(cover || shapes) && (
          <span data-deck-face={own ? `#${id}` : id} className="flex">
            {cover ? <img src={small(cover)} alt="" decoding="async" className="size-10 shrink-0 rounded-[4px] object-cover" />
              : <GroupCover name={own ? `#${id}` : id} tint={groupTint(own ? `#${id}` : id)} label={null} className="size-10 shrink-0 rounded-[4px]" />}
          </span>
        )}
        {renaming && onNamed
          ? <NameInPlace initial={name} placeholder="Name the deck" label="Deck name" onDone={onNamed} className={`${NAME_FIELD} mr-7`} style={nameFit(name, '1.75rem')} />
          : <h3 className="line-clamp-2 pr-7 font-serif leading-snug text-foreground hyphens-manual [overflow-wrap:normal]" style={nameFit(name, '1.75rem')}>{softBreaks(name)}</h3>}
        <span data-deck-counts className="text-sm text-muted-foreground tabular-nums">
          {all ? <CountLine parts={[
            { key: 'due', said: `${num(due)} due`, className: due ? 'font-semibold text-foreground' : '', mark: { 'data-count-due': due } },
            { key: 'fresh', said: `${num(fresh)} not studied yet`, mark: { 'data-count-fresh': fresh } },
            ...(held > 0 ? [{ key: 'held', said: `${num(held)} held` }] : [])
          ]} /> : <span data-deck-empty>Empty: click to make a card</span>}
        </span>
        {/* No big number: the counts under the name already say it. At the foot, how many in all, and a dot when some are due. */}
        {/* The foot is one line, never wrapped or hyphenated: "3 cards · +1 inside", the second part giving way first. */}
        <span data-deck-foot className="mt-auto flex min-w-0 items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground tabular-nums">
          <span className="flex shrink-0 items-center gap-1.5">{all ? plural(all, 'card') : ''}</span>
          {kids > 0 && (
            <>
              {all > 0 && <span aria-hidden>·</span>}
              <button type="button" data-deck-kids={id} aria-expanded={open} onClick={(event) => (event.stopPropagation(), onKids())}
                className="min-w-0 cursor-pointer truncate rounded-[4px] px-1 -mx-1 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">{open ? 'Hide inside' : `+${num(kids)} inside`}</button>
            </>
          )}
        </span>
        </div>
      </motion.div>
    </RowMenu>
  )
}

/** A deck's pictures as a gallery, each once, with who made it under it; clicked, its card opens. */
function Gallery({ deck, onOpen }: { deck: string; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const pictures = useLive(() => call<{ id: string; src: string; who: string | null }[]>('decks:pictures', deck), null as { id: string; src: string; who: string | null }[] | null, [deck], ['item'])
  if (unloaded(pictures)) return <div className="h-24" />
  return (
    // Comes in whole, its first pictures drawn in its first frame (each a small copy, never a whole photo for a square).
    <ReadsIn>
    <ul data-deck-pictures className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
      {(pictures ?? []).map((one, at) => (
        <li key={one.id}>
          <button type="button" className="group grid w-full cursor-pointer gap-1 text-left" onClick={() => (chime('tap'), onOpen('nugget', one.id))}>
            <Decoded src={small(one.src, 640)} ahead={at < FIRST_PICTURES} className="aspect-square w-full rounded-md object-cover transition-opacity group-hover:opacity-90" />
            {one.who && <span className="truncate text-meta text-muted-foreground">{one.who}</span>}
          </button>
        </li>
      ))}
    </ul>
    </ReadsIn>
  )
}

/**
 * Which of a deck's own fields are links, changed when the import guessed
 * wrong: the field that names who made each thing (each a Sources page) and
 * the fields whose values become #tags (a movement, a period).
 */
function Links({ deck, onDone }: { deck: string; onDone: () => void }): React.JSX.Element {
  const links = useLive(() => call<{ fields: string[]; who: string | null; kinds: string[] }>('decks:links', deck), null as { fields: string[]; who: string | null; kinds: string[] } | null, [deck])
  const [who, setWho] = useState<string | null | undefined>(undefined)
  const [kinds, setKinds] = useState<string[] | undefined>(undefined)
  if (unloaded(links) || !links) return <div className="h-16" />
  const pickedWho = who === undefined ? links.who : who
  const pickedKinds = kinds ?? links.kinds
  if (!links.fields.length) return <p className="text-sm text-muted-foreground">This deck came in before its fields were kept: import it again to choose its links.</p>
  const apply = (): void =>
    void call<number>('decks:relink', deck, pickedWho, pickedKinds).then((n) => {
      chime('noted')
      toast(`${deck}: links changed on ${plural(n, 'card')}`, () => void call('decks:relink', deck, links.who, links.kinds).then(() => chime('undo')))
      onDone()
    })
  return (
    <div data-deck-links-panel className="mt-1 grid gap-3 rounded-lg border border-foreground/10 bg-background p-3">
      <div className="grid gap-1.5">
        <p className="text-sm text-foreground"><b className="font-semibold">Who made it</b>: each card’s who, a Sources page each</p>
        <div data-links-who className="flex flex-wrap gap-1 text-xs">
          <Chip on={!pickedWho} onClick={() => (chime('tap'), setWho(null))}>None</Chip>
          {links.fields.map((name) => <Chip key={name} on={pickedWho === name} onClick={() => (chime('tap'), setWho(name))}>{name}</Chip>)}
        </div>
      </div>
      <div className="grid gap-1.5">
        <p className="text-sm text-foreground"><b className="font-semibold">Tags from</b>: each value a #tag, so the deck meets your own notes</p>
        <div data-links-kinds className="flex flex-wrap gap-1 text-xs">
          {links.fields.map((name) => (
            <Chip key={name} on={pickedKinds.includes(name)} onClick={() => (chime('tap'), setKinds(pickedKinds.includes(name) ? pickedKinds.filter((one) => one !== name) : [...pickedKinds, name]))}>{name}</Chip>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => (chime('fold'), onDone())}>Cancel</Button>
        <Button size="sm" className="cursor-pointer" data-links-apply onClick={apply}>Change links</Button>
      </div>
    </div>
  )
}

/** Your own top decks in the order you dragged them to; the ones never placed after, the most due first. */
export const ownOrder = (decks: OwnDeck[], place: Record<string, number>): OwnDeck[] =>
  [...decks].sort((a, b) => (place[a.tag] ?? Infinity) - (place[b.tag] ?? Infinity) || b.due - a.due || b.cards - a.cards || a.tag.localeCompare(b.tag))

/** Save a deck as a study set, named for the occasion, with Undo. */
async function saveSet(tag: string): Promise<void> {
  const name = await ask(`A study set from ${deckTitle(tag)}`, 'Name it for the occasion: Biology exam, Friday', { action: 'Save the set' })
  if (!name?.trim()) return
  await call('sets:save', name, tag)
  chime('noted')
  toast(`${quoted(name.trim(), 80)} is a study set: it drills every card in ${deckTitle(tag)}, due or not`, () => void call('sets:remove', name.trim()).then(() => chime('undo')))
}

/** Save one deck as an Anki package where you pick. */
async function shareDeck(tag: string, name: string): Promise<void> {
  const done = await call<{ saved: boolean; cards: number; pictureOnly: number; file?: string }>('decks:apkg', tag, name)
  const left = done.pictureOnly ? ` ${cardsSaid(done.pictureOnly)} from a picture stayed behind: Anki keeps picture covers its own way.` : ''
  if (!done.cards) return refuse(done.pictureOnly ? `Only cards from a picture are in ${deckTitle(tag)}: Anki keeps picture covers its own way` : `${deckTitle(tag)} holds no cards to share yet`)
  if (!done.saved) return
  chime('noted')
  toast(`Saved ${done.file}: ${cardsSaid(done.cards)} anyone can open in Anki.${left}`)
}

/**
 * Study sets: a deck saved under the name of an occasion ("Biology exam,
 * Friday"), Anki's filtered deck in plain words. One click drills every card
 * in it, due or not; right-click to take the set away.
 */
function StudySets({ sets, onStudy }: { sets: { name: string; tag: string }[]; onStudy: (tag: string) => void }): React.JSX.Element | null {
  if (!sets.length) return null
  return (
    <div data-study-sets className="flex flex-wrap items-center gap-2 text-control">
      <span className="text-muted-foreground">Study sets, every card in each, due or not</span>
      {sets.map((set) => (
        <RowMenu key={set.name} items={[{ label: 'Study', run: () => (chime('riffle'), onStudy(set.tag)) }, 'separator', { label: 'Remove the set', hint: 'The deck and its cards stay', danger: true, run: () => void call('sets:remove', set.name).then(() => (chime('fold'), toast(`${quoted(set.name, 80)} is no longer a study set`, () => void call('sets:save', set.name, set.tag).then(() => chime('undo'))))) }]}>
          <button type="button" data-study-set={set.name} onClick={() => (chime('riffle'), onStudy(set.tag))}
            className="h-8 max-w-64 cursor-pointer truncate rounded-[6px] mf-metal mf-metal-hover px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:h-9">{set.name}</button>
        </RowMenu>
      ))}
    </div>
  )
}

/**
 * How much of each book you have made cards from, on the first screen: the
 * same thin bar All cards shows grouped by source, for the books with cards
 * on two pages or more, the most carded first.
 */
function BookCoverage(): React.JSX.Element | null {
  const all = useLive(() => call<BrowsedCard[]>('cards:all'), [] as BrowsedCard[], [], ['item'])
  const [every, setEvery] = useState(false)
  const books = [...Map.groupBy(all.filter((card) => card.made === 'pdf' && card.source), (card) => card.source)].filter(([, cards]) => coverageOf(cards)).sort((a, b) => b[1].length - a[1].length)
  if (!books.length) return null
  return (
    <section data-book-coverage className="@container/cover grid min-w-0 gap-2 rounded-[6px] mf-metal p-3">
      <span className="mf-chart-title">How much of each book has cards</span>
      {(every ? books : books.slice(0, 3)).map(([book, cards]) => (
        // Its name over its strip in a narrow card (the window's width said nothing of the card's: in a split it ran off its edge).
        <div key={book} data-book-covered={book} className="grid min-w-0 grid-cols-1 items-center gap-x-3 @[36rem]/cover:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          <Tip label={book}><span className="truncate pt-1 text-control text-foreground">{book}</span></Tip>
          <Coverage cards={cards} />
        </div>
      ))}
      {books.length > 3 && <button type="button" data-book-coverage-all onClick={() => (chime(every ? 'fold' : 'open'), setEvery(!every))} className="cursor-pointer justify-self-start rounded-md px-2 py-1 text-control font-medium text-(--mf-muted-strong) hover:bg-accent/50 hover:text-foreground">{every ? 'Show three' : `Show all ${num(books.length)} books`}</button>}
    </section>
  )
}

/** A deck's name typed in its List row: the row's own words, ringed while written. */
const ROW_NAME = 'min-w-0 rounded-[4px] bg-transparent px-1 text-foreground outline-none ring-1 ring-ring/45 placeholder:text-muted-foreground'

/** Rename a deck to `words` (typed on its tile or row): the tag is renamed everywhere it is written, with Undo. */
async function renameDeck(tag: string, words: string): Promise<void> {
  const to = deckTagOf(words)
  if (!to || to === tag) return
  const done = await haligtree.renameTag(tag, to)
  if (!done) return refuse('That name cannot be a deck')
  chime('noted')
  toast(`The deck ${deckTitle(tag)} is ${deckTitle(done)} now`, () => void haligtree.undoRenameTag().then(() => chime('undo')))
}

/** Delete a deck: the tag comes off its cards, which stay, with Undo. */
async function deleteDeck(tag: string): Promise<void> {
  const holding = (await call<{ id: string; tags: string[] }[]>('cards:all')).filter((card) => card.tags.includes(tag)).map((card) => card.id)
  const sure = await askSure(`Delete the deck ${deckTitle(tag)}?`, holding.length ? `Its ${cardsSaid(holding.length)} leave the deck. The cards themselves are kept, in All cards.` : 'It holds no cards. Nothing else changes.', 'Delete deck', { danger: true })
  if (!sure) return
  const before = holding.length ? await call<{ id: string; body: string | null }[]>('cards:retag', holding, tag, false) : []
  await haligtree.setTag(tag, { deck: false })
  chime('fold')
  toast(`The deck ${deckTitle(tag)} is gone; its ${cardsSaid(holding.length)} kept`, () => void Promise.all([call('cards:retag:undo', before), haligtree.setTag(tag, { deck: true })]).then(() => chime('undo')))
}

/** Delete an imported deck: asked first, then all its cards go to the Bin together, with one Undo. */
async function removeShared(shelf: Shelf): Promise<void> {
  const ids = await call<string[]>('decks:cards', shelf.name)
  const sure = await askSure(`Delete the deck ${shelf.name}?`, `This removes the imported deck: its ${cardsSaid(ids.length)} go to the Bin, with their progress. Undo, or the Bin, brings them back. Your own decks and cards stay as they are.`, 'Delete deck', { danger: true })
  if (!sure) return
  await moveToBin(ids.map((id) => ({ type: 'nugget', id })))
}

/** Pockets or a plain list, as chosen last time on this Mac. */
function useDeckLook(): ['pockets' | 'list', (to: 'pockets' | 'list') => void] {
  const [look, setLook] = useState<'pockets' | 'list'>(() => (localStorage.getItem('haligtree:deck-look') === 'list' ? 'list' : 'pockets'))
  return [look, (to) => (localStorage.setItem('haligtree:deck-look', to), setLook(to))]
}

/** The decks whose sub-decks are folded away, kept on this Mac. */
function useShut(): [Set<string>, (name: string) => void] {
  const [shut, setShut] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem('haligtree:deck-shut') ?? '[]') as string[]))
  return [shut, (name) => {
    const next = new Set(shut)
    if (!next.delete(name)) next.add(name)
    localStorage.setItem('haligtree:deck-shut', JSON.stringify([...next]))
    chime(next.has(name) ? 'fold' : 'open')
    setShut(next)
  }]
}

/** The chevron that folds a deck's sub-decks away, or the same room kept empty, so names line up. */
/**
 * The decks inside a deck hang off the sidebar's own branch (branches.tsx): its trunk runs down from under the
 * fold arrow of the deck above (a row's 6px inset and half the 20px arrow, less the trunk's 4.5px offset), and each
 * twig ends at the row's arrow, or at its name when it has nothing inside (no empty arrow's room to cross).
 */
const NEST = 'pl-[20.5px]'
const TWIGS = '[&>[data-no-twig]]:pl-[20.5px] [&_[data-fold-none]]:w-0'

function Fold({ id, kids, open, name, flip }: { /** The deck's tag or a shared topic's path, for probes: the name shown can change. */ id: string; kids: number; open: boolean; name: string; flip: () => void }): React.JSX.Element {
  if (!kids) return <span aria-hidden data-fold-none="" className="size-5 shrink-0" />
  return (
    <button type="button" data-deck-fold-kids={id} aria-expanded={open} aria-label={`${open ? 'Fold' : 'Unfold'} the decks inside ${name}`} onClick={(event) => (event.stopPropagation(), flip())}
      className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-[4px] text-muted-foreground hover:bg-accent hover:text-foreground">
      <ChevronRight className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
    </button>
  )
}

/**
 * A deck's counts: due first, in ink and bold when there are some, as Anki users read a deck; then those never
 * studied, never "new", which Anki users read as today's new cards. On a line that wraps between its parts, each part
 * after the first with its dot in front of it in room of its own. The line hides what stands left of its edge, so the
 * dot of a part that starts a line is never seen: a wrapped tile reads "1 due" over "17 not studied yet", never
 * "1 due ·" with the dot left hanging.
 */
function CountLine({ parts }: { parts: { key: string; said: string; className?: string; mark?: Record<string, number> }[] }): React.JSX.Element {
  return (
    <span className="flex flex-wrap gap-x-[1.1em] overflow-hidden">
      {parts.map((part, at) => (
        <span key={part.key} {...part.mark} className={`relative whitespace-nowrap ${at ? '-ml-[1.1em] pl-[1.1em]' : ''} ${part.className ?? ''}`}>
          {at > 0 && <span aria-hidden className="absolute left-0 w-[1.1em] text-center font-normal text-muted-foreground"> · </span>}
          {part.said}
        </span>
      ))}
    </span>
  )
}


/**
 * A deck's face: by default a plain index-card box in the theme's one tone,
 * the number due today large in the accent (what an Anki user reads first),
 * or, with none due, those not studied yet in ink. With "Shapes on decks" on in Settings, the
 * Coolshapes cover drawn from its name instead.
 */
export function DeckFace({ name, due, fresh, shapes, faded = false, small = false }: { name: string; due: number; fresh: number; shapes: boolean; faded?: boolean; /** The size Settings shows it at. */ small?: boolean }): React.JSX.Element {
  const size = small ? 'size-14 [&_.text-3xl]:text-lg [&_.text-xs]:text-[10px]' : 'size-24'
  if (shapes) return <GroupCover name={name} tint={groupTint(name)} label={null} className={`${size} shrink-0 rounded-[5px] shadow-sm ${faded ? 'opacity-60' : ''}`} />
  return (
    <div aria-hidden data-deck-face={name} data-set-aside={faded ? '' : undefined} className={`grid ${size} shrink-0 content-center justify-items-center gap-0.5 rounded-[6px] mf-metal`}>
      <span className={`font-serif text-3xl leading-none tabular-nums ${due ? 'text-primary' : fresh ? 'text-foreground' : 'text-muted-foreground'}`}>{num(due || fresh)}</span>
      <span className="px-1 text-center text-xs leading-tight text-balance text-muted-foreground">{fresh && !due ? 'not studied yet' : 'due'}</span>
    </div>
  )
}

/**
 * Every deck as a plain table, as Anki's deck list: the name, then Due (in
 * the accent), Not studied and Cards in columns; sub-decks hang off the trunk under
 * their deck and fold with its chevron. Clicking a name studies it.
 */
type Target = { own: OwnDeck } | { shelf: Shelf }
function DeckList({ own, shelves, onStudy, place = {}, menu, fresh = null, renaming = null, onNamed }: { own: OwnDeck[]; shelves: Shelf[]; onStudy: (tag: string) => void; /** The order you dragged the decks to. */ place?: Record<string, number>
  /** A new deck being named, on its own row at the top; a deck being renamed, in its row. */ fresh?: { inside?: string } | null; renaming?: string | null; onNamed?: (words: string | null) => void
  /** A deck's one menu, the same as its pocket's: on the row's ⋯ and on a right click. */ menu: (target: Target, at: () => HTMLElement | null) => RowItem[] }): React.JSX.Element {
  const [shut, flip] = useShut()
  const cols = 'grid grid-cols-[minmax(0,1fr)_3.5rem_5.5rem_4rem_2rem] items-center gap-x-2'
  const row = (key: string, name: string, _title: string, due: number, fresh: number, all: number, kids: number, study: (() => void) | null, target: Target | null = null): React.JSX.Element => {
    const at = (): HTMLElement | null => document.querySelector<HTMLElement>(`[data-deck-row="${CSS.escape(key)}"]`)
    const line = (
    // The whole row lights under the pointer and studies on a click, as the rows of Sources' islands do: never a pill behind the name alone.
    <div key={key} data-deck-row={key} onClick={study ? (event) => void ((event.target as HTMLElement).closest('button, input') || (chime('riffle'), heroOpen(event, study))) : undefined}
      className={`${cols} min-h-8 rounded-[3px] px-1.5 text-control hover:bg-accent/60 focus-within:bg-accent/60 ${study ? 'cursor-pointer' : ''}`}>
      <span className="flex min-w-0 items-center gap-1">
        <Fold id={key} kids={kids} open={!shut.has(key)} name={name} flip={() => flip(key)} />
        {renaming === key && onNamed ? <NameInPlace initial={name} placeholder="Name the deck" label="Deck name" onDone={onNamed} className={`${ROW_NAME} flex-1`} />
          : study ? <button type="button" data-deck-row-study={key} onClick={(event) => (chime('riffle'), heroOpen(heroAround(event, '[data-deck-row]'), study))} className="line-clamp-2 min-w-0 cursor-pointer rounded-[4px] px-1 text-left text-foreground outline-none hyphens-auto [overflow-wrap:break-word]">{name}</button>
          : <span className="line-clamp-2 min-w-0 px-1 text-muted-foreground hyphens-auto [overflow-wrap:break-word]">{name}</span>}
      </span>
      <span className={`flex items-center justify-end gap-1.5 tabular-nums ${due > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{due > 0 && <span aria-hidden className="size-1.5 rounded-full shrink-0 bg-primary" />}{due < 0 ? '–' : num(due)}</span>
      <span className={`text-right tabular-nums ${fresh > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{fresh < 0 ? '–' : num(fresh)}</span>
      <span className="text-right text-muted-foreground tabular-nums">{num(all)}</span>
      {/* Its menu, or the same room kept empty (a shared deck's topic has none), so the numbers line up. */}
      <span className="flex justify-end">{target && <MenuDots />}</span>
    </div>
    )
    return target ? <RowMenu key={key} items={() => menu(target, at)}>{line}</RowMenu> : line
  }
  const tops = ownOrder(own.filter((deck) => deck.depth === 0), place)
  return (
    <div data-deck-list role="table" aria-label="Decks" className="grid rounded-[6px] mf-metal px-3 py-2">
      <div className={`${cols} border-b border-foreground/10 px-1.5 pb-1.5 text-sm text-muted-foreground`}>
        <span className="pl-6">Deck</span><span className="text-right">Due</span><span className="text-right">Not studied</span><span className="text-right">Cards</span><span />
      </div>
      {fresh && onNamed && (
        <div data-deck-naming={fresh.inside ?? ''} className={`${cols} min-h-8 text-control`}>
          <span className="flex min-w-0 items-center gap-1 pl-5">
            <NameInPlace placeholder={fresh.inside ? `Name the deck inside ${deckTitle(fresh.inside)}` : 'Name the deck'} label="Deck name" onDone={onNamed} className={`${ROW_NAME} flex-1`} />
          </span>
        </div>
      )}
      {tops.map((deck) => {
        const inside = own.filter((one) => one.tag.startsWith(`${deck.tag}-`))
        return (
          <div key={deck.tag}>
            {row(deck.tag, deckName(deck), deckName(deck), deck.due, deck.fresh, deck.cards, inside.filter((one) => one.depth === 1).length, deck.cards ? () => onStudy(deck.tag) : null, { own: deck })}
            {inside.length > 0 && !shut.has(deck.tag) && (
              <div className={NEST}>
                <Tree nodes={treeOf(inside, (one) => one.depth)} here={-1} className={TWIGS} open={(node) => !shut.has(node.item.tag)}
                  row={({ item: one, kids }) => row(one.tag, sayDeck(one.label), deckTitle(one.tag, own.map((deck) => deck.tag)), one.due, one.fresh, one.cards, kids.length, one.cards ? () => onStudy(one.tag) : null, { own: one })} />
              </div>
            )}
          </div>
        )
      })}
      {shelves.map((shelf) => {
        const topics = shelf.topics.length > 1 ? [...shelf.topics].sort((a, b) => a.deck.localeCompare(b.deck)) : []
        return (
          <div key={shelf.name}>
            {row(shelf.name, shelf.name, shelf.name, shelf.due, shelf.fresh, shelf.cards, topics.length ? treeOf(topics, (topic) => topic.deck.split('::').length).length : 0, shelf.held < shelf.cards ? () => onStudy(deckTag(shelf.name)) : null, { shelf })}
            {topics.length > 0 && !shut.has(shelf.name) && (
              <div className={NEST}>
                <Tree nodes={treeOf(topics, (topic) => topic.deck.split('::').length)} here={-1} className={TWIGS} open={(node) => !shut.has(node.item.deck)}
                  row={({ item: topic, kids }) => row(topic.deck, topic.label, topic.deck, -1, -1, topic.cards, kids.length, topic.held < topic.cards ? () => onStudy(deckTag(topic.deck)) : null)} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** A menu line's drawing, at the size every menu draws one. */
const glyph = (Icon: LucideIcon): React.JSX.Element => <Icon aria-hidden data-menu-icon="" className="size-3.5 shrink-0 text-muted-foreground" />

/**
 * A deck's ⋯: opens the deck's right-click menu under it, the one menu,
 * so the two can never say different things (the app's rule: a ⋯ is its
 * right click, for a mouse that does not think of one).
 */
function MenuDots(): React.JSX.Element {
  return (
    <button type="button" aria-label="Deck menu" data-deck-dots onClick={openFromGrip}
      className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:active:scale-100 max-sm:size-8">
      <AliveIcon icon={DotsHorizontalIcon} size={16} />
    </button>
  )
}

/** What each timer and typed-answer check does, said once under its row: the one chosen. */
const TIMERS = [0, 10, 20, 30, 60]
const TYPED: { id: string; label: string; says: string }[] = [
  { id: '', label: 'Usual', says: 'An accent or unit left out is part wrong; a slip of a letter can count; capitals do not.' },
  { id: 'exact', label: 'Exact', says: 'Every mark counts, capitals too: formulas, symbols, case names.' },
  { id: 'meaning', label: 'Meaning', says: 'Accents and small slips pass: names, terms, dates in words.' }
]

/** One setting in the sheet: its name, its choices, and what the one chosen does, on a quiet line under. */
function Setting({ name, says, children, id }: { name: string; says?: string; children: React.ReactNode; id: string }): React.JSX.Element {
  return (
    <div data-deck-setting={id} className="grid gap-1.5">
      <span className="text-control font-medium text-foreground">{name}</span>
      <div className="flex min-h-8 flex-wrap items-center gap-1.5 text-xs">{children}</div>
      {says && <span className="text-xs leading-snug text-muted-foreground">{says}</span>}
    </div>
  )
}

/**
 * A deck's settings, opened from its menu's "Deck settings…" beside its
 * pocket or row: new cards a day, how much to remember, the timer, how typed
 * answers are checked and what its two sides are called. Each a row of
 * choices, the one in use lit, what it does said once under it. Every change
 * is kept at once, with Undo.
 */
function DeckSettings({ tag, name, at, study, onClose }: { tag: string; name: string; at: HTMLElement; study: { sides: Record<string, [string, string]>; typed: Record<string, string>; newPerDay: Record<string, number>; retention: Record<string, number>; timer: Record<string, number> }; onClose: () => void }): React.JSX.Element {
  const perDay = study.newPerDay[tag]
  const keep = study.retention[tag]
  const timer = study.timer[tag] ?? 0
  const typed = study.typed[tag] ?? ''
  const sides = study.sides[tag] ?? null
  const set = (change: Parameters<typeof haligtree.setTag>[1], back: Parameters<typeof haligtree.setTag>[1]): void =>
    void haligtree.setTag(tag, change).then(() => (chime('settled'), quietly(() => void haligtree.setTag(tag, back))))
  const [front, setFront] = useState(sides?.[0] ?? '')
  const [back, setBack] = useState(sides?.[1] ?? '')
  // Both named, or both left empty for question and answer; kept as you leave the field.
  const saveSides = (): void => {
    const to: [string, string] | null = front.trim() && back.trim() ? [front.trim(), back.trim()] : null
    if (JSON.stringify(to) === JSON.stringify(sides) || (!to && (front.trim() || back.trim()))) return
    set({ sides: to }, { sides })
  }
  return (
    <Popover open onOpenChange={(open) => void (!open && (chime('fold'), onClose()))}>
      <PopoverAnchor virtualRef={{ current: at }} />
      {/* Beside the deck, never over it: what it is set for stays in view. */}
      <PopoverContent side={window.innerWidth < 720 ? "bottom" : "left"} align="start" sideOffset={8} data-deck-settings={tag} data-finish-sheet className="w-80 max-w-[calc(100vw-1rem)] gap-3.5 p-4 text-control" onFocusOutside={(event) => event.preventDefault()}>
        <span className="font-serif text-lg leading-tight text-foreground [overflow-wrap:break-word]">{name}</span>
        <Setting id="new" name="New cards a day" says={perDay === 0 ? 'Only reviews: no new cards start.' : undefined}>
          <Chips options={[{ id: '', label: 'As in Settings' }, { id: 'own', label: 'Its own' }, { id: 'none', label: 'None' }]}
            on={(id) => id === (perDay === undefined ? '' : perDay === 0 ? 'none' : 'own')}
            pick={(id) => set({ newPerDay: id === '' ? null : id === 'none' ? 0 : (perDay || 10) }, { newPerDay: perDay ?? null })} />
          {perDay !== undefined && perDay > 0 && <ScrubField label={`New cards a day for ${name}`} min={1} max={999} value={perDay} className={SCRUB} onChange={(n) => void haligtree.setTag(tag, { newPerDay: n })} />}
        </Setting>
        <Setting id="keep" name="How much to remember" says={keep !== undefined ? 'Higher brings its cards back sooner and more often.' : undefined}>
          <Chips options={[{ id: '', label: 'As in Settings' }, { id: 'own', label: 'Its own' }]} on={(id) => (id === 'own') === (keep !== undefined)}
            pick={(id) => set({ retention: id === '' ? null : (keep ?? 0.9) }, { retention: keep ?? null })} />
          {keep !== undefined && <span className="flex items-center gap-0.5"><ScrubField label={`How much to remember of ${name}`} min={70} max={99} value={Math.round(keep * 100)} className={SCRUB} onChange={(n) => void haligtree.setTag(tag, { retention: n / 100 })} />%</span>}
        </Setting>
        <Setting id="timer" name="Timer on each card" says={timer ? 'A clock counts down under the card; at the end its answer shows.' : undefined}>
          <Chips options={TIMERS.map((seconds) => ({ id: String(seconds), label: seconds ? `${seconds} s` : 'None' }))} on={(id) => id === String(timer)}
            pick={(id) => set({ timer: Number(id) || null }, { timer: study.timer[tag] ?? null })} />
        </Setting>
        <Setting id="typed" name="Typed answers" says={TYPED.find((one) => one.id === typed)?.says}>
          <Chips options={TYPED} on={(id) => id === typed} pick={(id) => set({ typed: (id || null) as 'exact' | 'meaning' | null }, { typed: (typed || null) as 'exact' | 'meaning' | null })} />
        </Setting>
        <Setting id="sides" name="Its two sides" says="Like English and Spanish, in place of question and answer.">
          {[[front, setFront, 'Question'], [back, setBack, 'Answer']].map(([value, change, hint]) => (
            <input key={hint as string} aria-label={`${hint as string} side`} value={value as string} placeholder={hint as string} onChange={(event) => (change as (to: string) => void)(event.target.value)}
              onBlur={saveSides} onKeyDown={(event) => event.key === 'Enter' && (event.currentTarget.blur())}
              className={`${INPUT_FRAME} h-8 w-0 flex-1 text-control`} />
          ))}
        </Setting>
      </PopoverContent>
    </Popover>
  )
}

/** A deck's name as a person reads it: the example deck in plain words, the rest as tagged. */
const deckName = (deck: OwnDeck): string => (deck.tag === EXAMPLE_TAG ? 'How remembering works' : sayDeck(deck.label))

/** Take the example deck away, all of it, with Undo (which brings it back fresh). */
const removeExample = (): void =>
  void haligtree.exampleRemove().then((n) => {
    if (!n) return
    chime('shelve')
    toast('The example deck is gone', () => void haligtree.exampleAdd().then(() => chime('undo')))
  })

/** The example deck's menu, on its pocket and its row: study it, or take it away. */
const exampleItems = (onStudy: (tag: string) => void): RowItem[] => [
  { label: 'Study', keys: 'S', icon: glyph(GraduationCap), run: () => (chime('riffle'), onStudy(EXAMPLE_TAG)) },
  { label: 'Remove the example deck', hint: 'All ten cards, for good; it never counted in your stats', danger: true, icon: glyph(Trash2), run: removeExample }
]

/** One way in: a tile like a deck's pocket, its name, what it does in a line, and a tiny example of what you will make. */
function Way({ id, title, line, onClick, children }: { id: string; title: string; line: string; onClick: () => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <div role="button" tabIndex={0} data-first-way={id} onClick={onClick}
      onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget && (event.preventDefault(), onClick())}
      className="grid min-w-0 cursor-pointer content-start gap-3 rounded-[5px] border border-foreground/10 bg-accent/25 p-4 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid gap-1">
        <h3 className="font-serif text-xl leading-tight text-foreground">{title}</h3>
        <span className="text-sm leading-snug text-muted-foreground">{line}</span>
      </span>
      {/* The example, in the app's card look: what this way makes. */}
      <span aria-hidden data-first-sample className="grid gap-1.5 rounded-[4px] border border-foreground/10 bg-background px-3 py-2.5">{children}</span>
    </div>
  )
}

/**
 * Review's Decks page before you have a card of your own: the ways in, each
 * with a tiny example of what it makes, and the example deck that teaches
 * spaced repetition by doing it.
 */
function FirstWays({ example, onMake, onPicture, onStudy }: { example: OwnDeck | null; onMake: () => void; onPicture: () => void; onStudy: (tag: string) => void }): React.JSX.Element {
  const tryIt = (): void => void haligtree.exampleAdd().then(() => (chime('riffle'), onStudy(EXAMPLE_TAG)))
  return (
    <section data-first-ways className="grid gap-3 pt-2">
      <span className="grid gap-1">
        <h2 className="font-serif text-2xl leading-tight text-foreground">Your first cards</h2>
        <p className="max-w-[62ch] leading-relaxed text-muted-foreground">A card asks one question. Review brings it back as you start to forget it, and waits longer each time you remember.</p>
      </span>
      <div className="grid grid-cols-1 gap-3 @[40rem]/page:grid-cols-3">
        <Way id="make" title="Make your first card" line="Type a question, then its answer." onClick={onMake}>
          <span className="font-serif text-base leading-snug font-semibold text-foreground">What is the capital of Peru?</span>
          <span className="border-t border-dashed border-foreground/15" />
          <span className="text-sm text-(--mf-muted-strong)">Lima</span>
        </Way>
        <Way id="import" title="Import from Anki" line="A deck someone shared with you, or a spreadsheet of words and meanings." onClick={() => (chime('open'), void window.api.importFrom('files'))}>
          <span className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate text-foreground">Biology.apkg</span><span className="shrink-0 text-muted-foreground">Anki deck</span></span>
          <span className="border-t border-foreground/10" />
          <span className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate text-foreground">Spanish words.csv</span><span className="shrink-0 text-muted-foreground">spreadsheet</span></span>
        </Way>
        <Way id="picture" title="Make cards from a picture" line="A diagram, a map or a painting: cover parts of it, and each cover becomes a card." onClick={onPicture}>
          {/* A drawn diagram: a cell, its labels covered, the one asked glowing in the theme's colour. */}
          <svg viewBox="0 0 120 44" className="h-11 w-full" aria-hidden>
            <circle cx="60" cy="22" r="17" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />
            <circle cx="63" cy="20" r="6" fill="currentColor" fillOpacity="0.18" />
            <path d="M28 10 L47 16 M92 12 L68 19 M28 34 L45 29" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
            <rect x="2" y="6" width="26" height="8" rx="1" fill="color-mix(in oklab, var(--foreground) 72%, var(--background))" />
            <rect x="92" y="8" width="26" height="8" rx="1" fill="var(--primary)" />
            <rect x="2" y="30" width="26" height="8" rx="1" fill="color-mix(in oklab, var(--foreground) 72%, var(--background))" />
          </svg>
        </Way>
      </div>
      {/* The example deck: offered, or there with its counts, a way to study it and one click to take it away. */}
      <div data-first-example={example ? 'added' : 'offered'} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[5px] border border-dashed border-foreground/15 px-4 py-3">
        <span className="grid min-w-0 flex-1 basis-64 gap-0.5">
          <span className="font-serif text-base leading-tight text-foreground">{example ? 'How remembering works' : 'Or learn how it works by doing it'}</span>
          <span className="text-sm leading-snug text-muted-foreground">
            {/* Its counts on a line of their own, as a deck's tile has them (CountLine), so a dot never hangs at a line's end. */}
            {example ? <><CountLine parts={[
              { key: 'due', said: `${num(example.due)} due`, className: example.due ? 'font-semibold text-foreground' : '', mark: { 'data-count-due': example.due } },
              { key: 'fresh', said: `${num(example.fresh)} not studied yet`, mark: { 'data-count-fresh': example.fresh } }
            ]} />The example deck: never counted in your streak or stats.</>
              : 'An example deck of 10 cards, about five minutes. It never counts in your streak or stats, and one click takes it away.'}
          </span>
        </span>
        {example ? (
          <span className="flex flex-wrap items-center gap-2">
            {example.due + example.fresh > 0 && <Button variant="outline" size="sm" className="h-8 cursor-pointer px-3" data-example-study onClick={() => (chime('riffle'), onStudy(EXAMPLE_TAG))}>Study it</Button>}
            <Button variant="ghost" size="sm" className="h-8 cursor-pointer px-3" data-example-remove onClick={removeExample}>Remove the example deck</Button>
          </span>
        ) : <Button variant="outline" size="sm" className="h-8 cursor-pointer px-3" data-example-try onClick={tryIt}>Try the example deck</Button>}
      </div>
    </section>
  )
}
