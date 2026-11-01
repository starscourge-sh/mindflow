import { useState } from 'react'
import { chime } from '@/lib/sound'
import { call, haligtree, unloaded, useLive } from '@/lib/haligtree'
import { num } from '../../../../main/dates'
import { ask, askSure, openTag, quietly, refuse, toast } from './ui'
import { EXAMPLE_TAG } from '../../../../main/name'
import { Button } from '@/components/ui/button'
import { Chip } from './display'
import { OptionsMenu, type Section } from './options-menu'
import { SCRUB, ScrubField } from '../pdf/scrub-field'
import { Tree, treeOf } from './branches'
import { GroupCover } from './group-cover'
import { groupTint } from './card-shelves'
import { RowMenu, type MenuItem, type RowItem } from './row-menu'
import { Check, ChevronRight } from 'lucide-react'
import { StudyYear } from './study-stats'
import type { Settings } from '@/lib/haligtree'
import { moveToBin } from '@/lib/to-bin'
import { cardsSaid, deckTagOf, deckTitle, makeDeck, sayDeck, useOwnDecks, type OwnDeck } from './decks'
import { Coverage, coverageOf, type BrowsedCard } from './card-browser'

type Topic = { deck: string; label: string; cards: number; held: number }
export type Shelf = { name: string; cover: string | null; sample: string; pictures: number; cards: number; fresh: number; due: number; held: number; shown: boolean; topics: Topic[] }

/** A deck's #tag, as the import made it: "Great Works of Art::Artists" is great-works-of-art-artists. */
export const deckTag = (name: string): string =>
  name.toLowerCase().split('::').map((part) => part.trim().replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('-')

const cards = (n: number): string => `${num(n)} ${n === 1 ? 'card' : 'cards'}`

/** Start a held deck or topic, or hold it again, with Undo; starting says to meet the material first. */
export function startDeck(deck: string, label: string, on: boolean): void {
  void call<number>('decks:start', deck, on).then((n) => {
    if (!n) return
    chime(on ? 'unshelve' : 'shelve')
    toast(on ? `${label}: ${cards(n)} start in Review. Read or watch it first; the cards will make sense.` : `${label}: ${cards(n)} held, out of Review until you start them`,
      () => void call('decks:start', deck, !on).then(() => chime('undo')))
  })
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

export function DeckShelf({ onOpen, onStudy, onPaste, onPicture }: { onOpen: (type: string, id: string) => void; /** Study a deck's or topic's tag in Today. */ onStudy: (tag: string) => void; /** Paste cards into a deck, or make one card in it, in All cards. */ onPaste: (deck: string | null, one?: boolean) => void; /** Make cards from a picture, into a deck or none. */ onPicture: (deck: string | null) => void }): React.JSX.Element {
  const [gallery, setGallery] = useState<string | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const [allTags, setAllTags] = useState(false)
  const [look, setLook] = useDeckLook()
  const [kidsOpen, setKidsOpen] = useState<Set<string>>(new Set())
  const openKids = (key: string): void => { const next = new Set(kidsOpen); chime(next.delete(key) ? 'fold' : (next.add(key), 'open')); setKidsOpen(next) }
  const shapes = useLive(haligtree.settings, null as Settings | null)?.deckShapes === true
  const shelves = useLive(() => call<Shelf[]>('decks:list'), null as Shelf[] | null, [], ['item'])
  const own = useOwnDecks()
  const study = useLive(haligtree.tagStudy, { sides: {}, timer: {}, place: {}, typed: {}, newPerDay: {}, retention: {} } as Awaited<ReturnType<typeof haligtree.tagStudy>>, [], ['item'])
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const sets = useLive(() => call<{ name: string; tag: string }[]>('sets:list'), [] as { name: string; tag: string }[], [], ['item'])
  if (unloaded(shelves) || !own) return <div />
  const newDeck = (inside?: string): void => void makeDeck(inside)
  // In the order you dragged them to, then the most due first.
  const tops = ownOrder(own.filter((deck) => deck.depth === 0), study.place)
  const many = tops.length > MANY
  // At most POCKETS on show at once, the most due first: a big collection reads better in the List, which the fold offers.
  const shown = (many ? tops.filter((deck) => deck.made || deck.active > 0) : tops).slice(0, POCKETS)
  const folded = tops.filter((deck) => !shown.includes(deck))
  // The three ways cards come in, always at the top, whatever is below: as Anki's "Create Deck" and "Import File" are.
  const top = (
    <div data-deck-top className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" className="h-8 cursor-pointer px-3" data-deck-make onClick={() => (chime('open'), onPaste(null, true))}>Make a card</Button>
      <Button variant="outline" size="sm" className="h-8 cursor-pointer px-3" data-deck-paste onClick={() => (chime('open'), onPaste(null))}>Add many at once</Button>
      <Button variant="outline" size="sm" className="h-8 cursor-pointer px-3" data-deck-picture onClick={() => onPicture(null)}>From a picture</Button>
      <Button variant="outline" size="sm" className="h-8 cursor-pointer px-3" data-deck-import onClick={() => (chime('open'), void window.api.importFrom('files'))}>Import<span className="font-normal text-muted-foreground">Anki or CSV</span></Button>
      <span className="flex-1" />
      <Button variant="ghost" size="sm" className="h-8 cursor-pointer px-3" data-deck-new onClick={() => (chime('open'), newDeck())}>New deck</Button>
      {/* Pockets or a plain list, in the same two-part control as Review's tabs beside it. */}
      <span role="radiogroup" aria-label="Show decks as" data-deck-look-pick className="flex h-8 items-center max-sm:h-9 rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-control">
        {(['pockets', 'list'] as const).map((one) => (
          <button key={one} type="button" role="radio" aria-checked={look === one} data-deck-look-to={one} onClick={() => void (look !== one && (chime('tap'), setLook(one)))}
            className={`h-7 cursor-pointer rounded-md max-sm:h-8 border px-3 transition-colors ${look === one ? 'border-foreground/15 bg-background text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{one === 'pockets' ? 'Pockets' : 'List'}</button>
        ))}
      </span>
    </div>
  )
  // No cards of your own yet (the example deck is not yours): the ways in, each with a tiny example, and the example deck to learn by doing.
  if (!shelves?.length && !own.some((deck) => deck.tag !== EXAMPLE_TAG))
    return (
      <div data-deck-shelf data-deck-first className="grid grid-cols-[minmax(0,1fr)] gap-4 px-5 pt-4 pb-20">
        {top}
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
        <BookCoverage />
        <DeckList own={own} shelves={shelves ?? []} onStudy={onStudy} place={study.place} />
      </div>
    )
  // A shared deck's menu, the same as one of your own: its review settings, then what its buttons do, and Delete, which takes the imported deck away.
  const sharedMenu = (shelf: Shelf): Section[] => [
    ...deckSettings(deckTag(shelf.name), study),
    { items: [
      ...(shelf.held < shelf.cards ? [{ label: 'Study', run: () => (chime('riffle'), onStudy(deckTag(shelf.name))) }] : []),
      { label: shelf.held > 0 ? 'Start the held cards' : 'Hold new cards', run: () => startDeck(shelf.name, shelf.name, shelf.held > 0) },
      { label: shelf.shown ? 'Keep out of Gems' : 'Show in Gems', run: () => show(shelf) },
      { label: 'Links…', run: () => (chime('open'), setLinking(shelf.name)) },
      { label: 'Delete deck…', hint: 'Takes the imported deck away, to the Bin', run: () => void removeShared(shelf) }
    ] }
  ]
  const show = (shelf: Shelf): void =>
    void call<number>('decks:show', shelf.name, !shelf.shown).then(() => {
      chime(shelf.shown ? 'fold' : 'noted')
      toast(shelf.shown ? `${shelf.name} is back on its shelf, out of Gems` : `${shelf.name} shows in Gems, Feed and Home now`, () => void call('decks:show', shelf.name, shelf.shown).then(() => chime('undo')))
    })
  // Your own deck's menu: its review settings, then what can be done with it. The example deck's: study it, or take it away.
  const ownMenu = (deck: OwnDeck): Section[] => deck.tag === EXAMPLE_TAG ? exampleMenu(onStudy) : [
    ...deckSettings(deck.tag, study),
    { items: [
      ...(deck.cards ? [{ label: 'Study', run: () => (chime('riffle'), onStudy(deck.tag)) }] : []),
      ...(deck.cards ? [{ label: 'Save as a study set…', hint: 'A name for an occasion, like an exam: one click drills every card in it', run: () => void saveSet(deck.tag) }] : []),
      { label: 'Name its two sides…', hint: study.sides[deck.tag] ? `Now “${study.sides[deck.tag][0]}” and “${study.sides[deck.tag][1]}”` : 'Like “English” and “Spanish”, in place of question and answer', run: () => void nameSides(deck.tag, study.sides[deck.tag] ?? null) },
      ...(deck.cards ? [{ label: 'Share as an Anki deck…', hint: 'Saves an .apkg file anyone can open in Anki', run: () => void shareDeck(deck.tag, deckName(deck)) }] : []),
      { label: 'Make a card', run: () => (chime('open'), onPaste(deck.tag, true)) },
      { label: 'Add many at once', run: () => (chime('open'), onPaste(deck.tag)) },
      { label: 'Make cards from a picture', run: () => onPicture(deck.tag) },
      { label: 'New deck inside', run: () => newDeck(deck.tag) },
      // Without a mouse: the same move as dragging it, one place at a time.
      ...(deck.depth === 0 && tops.indexOf(deck) > 0 ? [{ label: 'Move earlier', run: () => move(deck.tag, -1) }] : []),
      ...(deck.depth === 0 && tops.indexOf(deck) >= 0 && tops.indexOf(deck) < tops.length - 1 ? [{ label: 'Move later', run: () => move(deck.tag, 1) }] : []),
      { label: 'Open its page', hint: 'Everything tagged with it, on the tag’s page', run: () => openTag(deck.tag) },
      { label: 'Rename deck…', run: () => void renameDeck(deck.tag) },
      { label: 'Delete deck…', hint: 'Its cards are kept', run: () => void deleteDeck(deck.tag) }
    ] }
  ]
  const sharedTiles = (shelves ?? []).map((shelf) => {
    const topics = shelf.topics.length > 1 ? treeOf([...shelf.topics].sort((a, b) => a.deck.localeCompare(b.deck)), (topic) => topic.deck.split('::').length).length : 0
    const allHeld = shelf.held > 0 && shelf.held === shelf.cards
    return (
      <DeckTile key={shelf.name} id={shelf.name} name={shelf.name} title={shelf.name} due={shelf.due} fresh={shelf.fresh} all={shelf.cards} held={shelf.held} cover={shelf.cover} shapes={shapes}
        kids={topics} open={kidsOpen.has(shelf.name)} onKids={() => openKids(shelf.name)} menu={[...sharedMenu(shelf).slice(0, -1), { items: [...sharedMenu(shelf).at(-1)!.items, ...(shelf.pictures > 0 ? [{ label: gallery === shelf.name ? 'Hide pictures' : 'Pictures', run: () => (chime('open'), setGallery(gallery === shelf.name ? null : shelf.name)) }] : [])] }]}
        onClick={() => (allHeld ? startDeck(shelf.name, shelf.name, true) : (chime('riffle'), onStudy(deckTag(shelf.name))))} />
    )
  })
  // A deck one place earlier or later, from its menu: the keyboard's way to reorder, with Undo.
  const move = (tag: string, by: number): void => {
    const was = tops.map((one) => one.tag)
    const order = [...was]
    const at = order.indexOf(tag)
    order.splice(at, 1)
    order.splice(at + by, 0, tag)
    void call('decks:order', order).then(() => (chime('settled'), quietly(() => void call('decks:order', was))))
  }
  // Dropped on another deck, a deck takes its place and the rest move along; the order is kept.
  const drop = (onto: string): void => {
    const from = dragging
    setDragging(null)
    setOver(null)
    if (!from || from === onto) return
    const order = tops.map((one) => one.tag).filter((tag) => tag !== from)
    order.splice(order.indexOf(onto), 0, from)
    const was = tops.map((one) => one.tag)
    void call('decks:order', order).then(() => (chime('settled'), quietly(() => void call('decks:order', was))))
  }
  const tile = (deck: OwnDeck): React.JSX.Element => (
    <DeckTile key={deck.tag} id={deck.tag} own drag={deck.depth === 0 ? { over: over === deck.tag && dragging !== deck.tag, lifted: dragging === deck.tag, start: () => setDragging(deck.tag), enter: () => dragging && setOver(deck.tag), end: () => (setDragging(null), setOver(null)), drop: () => drop(deck.tag) } : undefined} name={deckName(deck)} title={deckTitle(deck.tag, own.map((one) => one.tag))} due={deck.due} fresh={deck.fresh} all={deck.cards} held={0} cover={null} shapes={shapes}
      kids={own.filter((one) => one.tag.startsWith(`${deck.tag}-`) && one.depth === deck.depth + 1).length} open={kidsOpen.has(deck.tag)} onKids={() => openKids(deck.tag)} menu={ownMenu(deck)}
      onClick={() => (deck.cards ? (chime('riffle'), onStudy(deck.tag)) : (chime('open'), onPaste(deck.tag, true)))} />
  )
  return (
    <div data-deck-shelf data-deck-look="pockets" className="grid grid-cols-[minmax(0,1fr)] gap-4 px-5 pt-4 pb-20">
      {top}
      <StudyYear compact />
      <StudySets sets={sets} onStudy={onStudy} />
      <BookCoverage />
      {/* Pockets: squarish tiles, 2 to 4 across by width; each studies when clicked, its actions in its ⋯ menu and on right-click. */}
      <div data-deck-grid className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
        {shown.map(tile)}
        {allTags && folded.map(tile)}
        {sharedTiles}
      </div>
      {folded.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          <button type="button" data-deck-fold aria-expanded={allTags} onClick={() => (chime(allTags ? 'fold' : 'open'), setAllTags(!allTags))}
            className="cursor-pointer rounded-md px-2 py-1 text-control font-medium text-foreground/80 hover:bg-accent/50 hover:text-foreground">
            {allTags ? 'Hide the other decks' : `Show ${num(folded.length)} more ${folded.length === 1 ? 'deck' : 'decks'}`}
          </button>
          <button type="button" data-deck-fold-list onClick={() => (chime('tap'), setLook('list'))}
            className="cursor-pointer rounded-md px-2 py-1 text-control font-medium text-foreground/80 hover:bg-accent/50 hover:text-foreground">See every deck in the List</button>
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
            <DeckList own={deck ? own.filter((one) => one === deck || one.tag.startsWith(`${deck.tag}-`)) : []} shelves={shelf ? [shelf] : []} onStudy={onStudy} />
          </section>
        )
      })}
      {linking && <Links deck={linking} onDone={() => setLinking(null)} />}
      {gallery && <Gallery deck={gallery} onOpen={onOpen} />}
    </div>
  )
}

/**
 * A deck as a pocket: a squarish tile with how many are due large in ink (a
 * small accent dot says some are), its name and "N due · N new" under it, and
 * "+N sub-decks" when it has them. The whole tile studies it; everything else
 * is in its ⋯ menu and on right-click.
 */
function DeckTile({ id, own = false, drag, name, title, due, fresh, all, held, cover, shapes, kids, open, onKids, menu, onClick }: {
  id: string; own?: boolean; /** A top deck of your own drags to a new place among the others. */ drag?: { over: boolean; lifted: boolean; start: () => void; enter: () => void; end: () => void; drop: () => void }; name: string; title: string; due: number; fresh: number; all: number; held: number; cover: string | null; shapes: boolean
  kids: number; open: boolean; onKids: () => void; menu: Section[]; onClick: () => void
}): React.JSX.Element {
  const big = due || fresh || all
  return (
    <RowMenu items={() => rowItems(menu)}>
      <div role="button" tabIndex={0} title={title} data-deck={own ? `#${id}` : id} {...(own ? { 'data-own-deck': id } : {})} onClick={onClick}
        {...(drag ? { draggable: true, 'data-deck-drop': drag.over ? '' : undefined, onDragStart: (event: React.DragEvent) => (event.dataTransfer.effectAllowed = 'move', event.dataTransfer.setData('text/plain', `#${id}`), drag.start()),
          onDragEnter: drag.enter, onDragOver: (event: React.DragEvent) => event.preventDefault(), onDragEnd: drag.end, onDrop: (event: React.DragEvent) => (event.preventDefault(), drag.drop()) } : {})}
        onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget && (event.preventDefault(), onClick())}
        className={`relative grid aspect-square min-w-0 cursor-pointer grid-rows-[minmax(0,1fr)_auto] gap-2 rounded-[5px] mf-metal mf-metal-hover p-3 text-left outline-none transition-transform duration-100 ease-out active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-ring ${drag?.lifted ? 'opacity-40' : ''} ${drag?.over ? 'ring-2 ring-primary/60' : ''}`}>
        <span className="absolute top-1.5 right-1.5" onClick={(event) => event.stopPropagation()}>
          <OptionsMenu sections={menu} label="Deck options" side="bottom" align="end" className="cursor-pointer" />
        </span>
        <span data-deck-face={own ? `#${id}` : id} className="flex min-h-0 items-start gap-2">
          {cover ? <img src={cover} alt="" className="size-12 shrink-0 rounded-[4px] object-cover" />
            : shapes ? <GroupCover name={own ? `#${id}` : id} tint={groupTint(own ? `#${id}` : id)} label={null} className="size-12 shrink-0 rounded-[4px]" /> : null}
          <span className="flex items-baseline gap-1.5">
            <span className={`font-serif text-4xl leading-none tabular-nums ${big ? 'text-foreground' : 'text-foreground/35'}`}>{num(big)}</span>
            <span className="text-sm text-muted-foreground">{due ? 'due' : fresh ? 'new' : all ? (all === 1 ? 'card' : 'cards') : 'cards'}</span>
            {due > 0 && <span aria-hidden data-due-dot className="mb-1 size-1.5 self-center rounded-full bg-primary" />}
          </span>
        </span>
        <span className="grid min-w-0 gap-0.5">
          <h3 className="truncate font-serif text-base leading-tight text-foreground">{name}</h3>
          <span data-deck-counts className="truncate text-sm text-muted-foreground tabular-nums">
            {all ? <><Counts due={due} fresh={fresh} />{held > 0 && <> · {num(held)} held</>}</> : <span data-deck-empty>Empty: click to make a card</span>}
          </span>
          {kids > 0 && (
            <button type="button" data-deck-kids={id} aria-expanded={open} onClick={(event) => (event.stopPropagation(), onKids())}
              className="cursor-pointer justify-self-start rounded-[4px] px-1 -mx-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">{open ? 'Hide' : '+'}{open ? ' sub-decks' : `${num(kids)} ${kids === 1 ? 'sub-deck' : 'sub-decks'}`}</button>
          )}
        </span>
      </div>
    </RowMenu>
  )
}

/** A deck's pictures as a gallery, each once, with who made it under it; clicked, its card opens. */
function Gallery({ deck, onOpen }: { deck: string; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const pictures = useLive(() => call<{ id: string; src: string; who: string | null }[]>('decks:pictures', deck), null as { id: string; src: string; who: string | null }[] | null, [deck], ['item'])
  if (unloaded(pictures)) return <div className="h-24" />
  return (
    <ul data-deck-pictures className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
      {(pictures ?? []).map((one) => (
        <li key={one.id}>
          <button type="button" className="group grid w-full cursor-pointer gap-1 text-left" onClick={() => (chime('tap'), onOpen('nugget', one.id))}>
            <img src={one.src} alt="" loading="lazy" className="aspect-square w-full rounded-md object-cover transition-opacity group-hover:opacity-90" />
            {one.who && <span className="truncate text-meta text-muted-foreground">{one.who}</span>}
          </button>
        </li>
      ))}
    </ul>
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
      toast(`${deck}: links changed on ${num(n)} ${n === 1 ? 'card' : 'cards'}`, () => void call('decks:relink', deck, links.who, links.kinds).then(() => chime('undo')))
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

/** A deck's review settings, from its menu: its own new cards a day and how its typed answers are checked (the tag's own, as on its page). */
function deckSettings(tag: string, study: { typed: Record<string, string>; newPerDay: Record<string, number>; retention: Record<string, number>; timer: Record<string, number> }): Section[] {
  const perDay = study.newPerDay[tag]
  const timer = study.timer[tag]
  const setTimer = (to: number | null): void => void haligtree.setTag(tag, { timer: to }).then(() => (chime('settled'), quietly(() => void haligtree.setTag(tag, { timer: timer ?? null }))))
  const keep = study.retention[tag]
  const setKeep = (to: number | null): void => void haligtree.setTag(tag, { retention: to }).then(() => (chime('settled'), quietly(() => void haligtree.setTag(tag, { retention: keep ?? null }))))
  const typed = study.typed[tag] ?? ''
  const setPerDay = (to: number | null): void => void haligtree.setTag(tag, { newPerDay: to }).then(() => (chime('settled'), quietly(() => void haligtree.setTag(tag, { newPerDay: perDay ?? null }))))
  const setTyped = (to: 'exact' | 'meaning' | null): void => void haligtree.setTag(tag, { typed: to }).then(() => (chime('settled'), quietly(() => void haligtree.setTag(tag, { typed: (typed || null) as 'exact' | 'meaning' | null }))))
  return [
    { label: 'New cards a day', items: [
      { label: 'As in Settings', on: perDay === undefined, set: (on: boolean) => void (on && setPerDay(null)) },
      // Its own number: dragged sideways, stepped with the arrows, or typed (a sum too: +5, 20*2).
      { label: 'Its own', field: <ScrubField label={`New cards a day for ${tag}`} min={0} max={999} value={perDay ?? 10} onChange={(n) => void haligtree.setTag(tag, { newPerDay: n })} className={SCRUB} /> },
      { label: 'None', hint: 'Only reviews: no new cards start', on: perDay === 0, set: (on: boolean) => void (on && setPerDay(0)) }
    ] },
    // Anki's desired retention per deck: a language seen more often, an old exam's deck less.
    { label: 'How much to remember', items: [
      { label: 'As in Settings', on: keep === undefined, set: (on: boolean) => void (on && setKeep(null)) },
      { label: 'Its own', field: <span className="flex items-center gap-0.5"><ScrubField label={`How much to remember of ${tag}`} min={70} max={99} value={Math.round((keep ?? 0.9) * 100)} onChange={(n) => void haligtree.setTag(tag, { retention: n / 100 })} className={SCRUB} />%</span> }
    ] },
    // An on-screen clock on each card: when it runs out the answer shows, as Anki's "maximum answer seconds" with its answer shown.
    { label: 'Timer on each card', items: [
      { label: 'None', on: timer === undefined, set: (on: boolean) => void (on && setTimer(null)) },
      ...[10, 20, 30, 60].map((seconds) => ({ label: `${seconds} seconds`, hint: 'A clock counts down under the card; at the end its answer shows', on: timer === seconds, set: (on: boolean) => void (on && setTimer(seconds)) }))
    ] },
    { label: 'How typed answers are checked', items: [
      { label: 'Usual', hint: 'An accent or unit left out is part wrong; a slip of a letter can count; capitals do not', on: !typed, set: (on: boolean) => void (on && setTyped(null)) },
      { label: 'Exact', hint: 'Every mark counts, capitals too: formulas, symbols, case names', on: typed === 'exact', set: (on: boolean) => void (on && setTyped('exact')) },
      { label: 'Meaning', hint: 'Accents and small slips pass: names, terms, dates in words', on: typed === 'meaning', set: (on: boolean) => void (on && setTyped('meaning')) }
    ] }
  ]
}

/** The ⋯ menu's sections as a right-click menu: each labelled part a line opening its choices beside it, the one in use ticked. */
const rowItems = (sections: Section[]): RowItem[] => sections.flatMap((section): RowItem[] => {
  const lines = section.items.flatMap((item): MenuItem[] => typeof item === 'string' || 'more' in item || 'field' in item ? [] : [
    'set' in item ? { label: item.label, hint: item.hint, run: () => item.set(true), trail: item.on ? <Check className="size-3.5" /> : undefined } : { label: item.label, hint: item.hint, run: item.run, danger: /^Delete/.test(item.label) }
  ])
  return section.label ? [{ label: section.label, items: lines }] : ['separator', ...lines]
})

/** Your own top decks in the order you dragged them to; the ones never placed after, the most due first. */
export const ownOrder = (decks: OwnDeck[], place: Record<string, number>): OwnDeck[] =>
  [...decks].sort((a, b) => (place[a.tag] ?? Infinity) - (place[b.tag] ?? Infinity) || b.due - a.due || b.cards - a.cards || a.tag.localeCompare(b.tag))

/** Save a deck as a study set, named for the occasion, with Undo. */
async function saveSet(tag: string): Promise<void> {
  const name = await ask(`A study set from ${deckTitle(tag)}`, 'Name it for the occasion: Biology exam, Friday')
  if (!name?.trim()) return
  await call('sets:save', name, tag)
  chime('noted')
  toast(`“${name.trim()}” is a study set: it drills every card in ${deckTitle(tag)}, due or not`, () => void call('sets:remove', name.trim()).then(() => chime('undo')))
}

/** Name a deck's two sides ("English / Spanish"), with Undo; empty puts back question and answer. */
async function nameSides(tag: string, was: [string, string] | null): Promise<void> {
  const words = await ask(`What are the two sides of ${deckTitle(tag)} called?`, 'English / Spanish', undefined, was ? `${was[0]} / ${was[1]}` : '')
  if (words === null || words === undefined) return
  const parts = words.split('/').map((one) => one.trim())
  if (words.trim() && (parts.length !== 2 || !parts[0] || !parts[1])) return refuse('Two names with a / between them: English / Spanish')
  await haligtree.setTag(tag, { sides: words.trim() ? [parts[0], parts[1]] : null })
  chime('settled')
  toast(words.trim() ? `Cards in ${deckTitle(tag)} ask in “${parts[0]}” and answer in “${parts[1]}”` : `${deckTitle(tag)} asks a question and its answer again`, () => void haligtree.setTag(tag, { sides: was }).then(() => chime('undo')))
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
      <span className="text-foreground/70">Study sets</span>
      {sets.map((set) => (
        <RowMenu key={set.name} items={[{ label: 'Study', run: () => (chime('riffle'), onStudy(set.tag)) }, 'separator', { label: 'Remove the set', hint: 'The deck and its cards stay', danger: true, run: () => void call('sets:remove', set.name).then(() => (chime('fold'), toast(`“${set.name}” is no longer a study set`, () => void call('sets:save', set.name, set.tag).then(() => chime('undo'))))) }]}>
          <button type="button" data-study-set={set.name} title={`Every card in ${deckTitle(set.tag)}, due or not`} onClick={() => (chime('riffle'), onStudy(set.tag))}
            className="h-8 max-w-64 cursor-pointer truncate rounded-[5px] mf-metal mf-metal-hover px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:h-9">{set.name}</button>
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
    <section data-book-coverage className="grid gap-1 rounded-[5px] mf-metal px-3 py-2">
      <span className="text-control text-foreground/70">How much of each book has cards</span>
      {(every ? books : books.slice(0, 3)).map(([book, cards]) => (
        <div key={book} data-book-covered={book} className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] items-center gap-x-3 max-sm:grid-cols-1">
          <span className="truncate pt-1 text-control text-foreground" title={book}>{book}</span>
          <Coverage cards={cards} />
        </div>
      ))}
      {books.length > 3 && <button type="button" data-book-coverage-all onClick={() => (chime(every ? 'fold' : 'open'), setEvery(!every))} className="cursor-pointer justify-self-start rounded-md px-2 py-1 text-control font-medium text-foreground/80 hover:bg-accent/50 hover:text-foreground">{every ? 'Show three' : `Show all ${num(books.length)} books`}</button>}
    </section>
  )
}

/** Rename a deck: the tag is renamed everywhere it is written, with Undo. */
async function renameDeck(tag: string): Promise<void> {
  const words = await ask(`Rename the deck ${deckTitle(tag)}`, 'Its new name', undefined, sayDeck(tag))
  const to = words && deckTagOf(words)
  if (!to || to === tag) return
  const done = await haligtree.renameTag(tag, to)
  if (!done) return refuse('That name cannot be a deck')
  chime('noted')
  toast(`The deck ${deckTitle(tag)} is ${deckTitle(done)} now`, () => void haligtree.undoRenameTag().then(() => chime('undo')))
}

/** Delete a deck: the tag comes off its cards, which stay, with Undo. */
async function deleteDeck(tag: string): Promise<void> {
  const holding = (await call<{ id: string; tags: string[] }[]>('cards:all')).filter((card) => card.tags.includes(tag)).map((card) => card.id)
  const sure = await askSure(`Delete the deck ${deckTitle(tag)}?`, holding.length ? `Its ${cardsSaid(holding.length)} leave the deck. The cards themselves are kept, in All cards.` : 'It holds no cards. Nothing else changes.', 'Delete deck')
  if (!sure) return
  const before = holding.length ? await call<{ id: string; body: string | null }[]>('cards:retag', holding, tag, false) : []
  await haligtree.setTag(tag, { deck: false })
  chime('fold')
  toast(`The deck ${deckTitle(tag)} is gone; its ${cardsSaid(holding.length)} kept`, () => void Promise.all([call('cards:retag:undo', before), haligtree.setTag(tag, { deck: true })]).then(() => chime('undo')))
}

/** Delete an imported deck: asked first, then all its cards go to the Bin together, with one Undo. */
async function removeShared(shelf: Shelf): Promise<void> {
  const ids = await call<string[]>('decks:cards', shelf.name)
  const sure = await askSure(`Delete the deck ${shelf.name}?`, `This removes the imported deck: its ${cardsSaid(ids.length)} go to the Bin, with their progress. Undo, or the Bin, brings them back. Your own decks and cards stay as they are.`, 'Delete deck')
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
function Fold({ id, kids, open, name, flip }: { /** The deck's tag or a shared topic's path, for probes: the name shown can change. */ id: string; kids: number; open: boolean; name: string; flip: () => void }): React.JSX.Element {
  if (!kids) return <span aria-hidden className="size-5 shrink-0" />
  return (
    <button type="button" data-deck-fold-kids={id} aria-expanded={open} aria-label={`${open ? 'Fold' : 'Unfold'} the decks inside ${name}`} onClick={(event) => (event.stopPropagation(), flip())}
      className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-[4px] text-muted-foreground hover:bg-accent hover:text-foreground">
      <ChevronRight className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
    </button>
  )
}

/** Due first, in ink and bold when there are some, as Anki users read a deck; then new. */
function Counts({ due, fresh }: { due: number; fresh: number }): React.JSX.Element {
  return (
    <>
      <span data-count-due={due} className={due ? 'font-semibold text-foreground' : ''}>{num(due)} due</span>
      <span> · {num(fresh)} new</span>
    </>
  )
}


/**
 * A deck's face: by default a plain index-card box in the theme's one tone,
 * the number due today large in the accent (what an Anki user reads first),
 * or, with none due, the new ones in ink. With "Shapes on decks" on in Settings, the
 * Coolshapes cover drawn from its name instead.
 */
export function DeckFace({ name, due, fresh, shapes, faded = false, small = false }: { name: string; due: number; fresh: number; shapes: boolean; faded?: boolean; /** The size Settings shows it at. */ small?: boolean }): React.JSX.Element {
  const size = small ? 'size-14 [&_.text-3xl]:text-lg [&_.text-xs]:text-[10px]' : 'size-24'
  if (shapes) return <GroupCover name={name} tint={groupTint(name)} label={null} className={`${size} shrink-0 rounded-[5px] shadow-sm ${faded ? 'opacity-60' : ''}`} />
  return (
    <div aria-hidden data-deck-face={name} className={`grid ${size} shrink-0 content-center justify-items-center gap-0.5 rounded-[5px] mf-metal ${faded ? 'opacity-60' : ''}`}>
      <span className={`font-serif text-3xl leading-none tabular-nums ${due ? 'text-primary' : fresh ? 'text-foreground' : 'text-foreground/35'}`}>{num(due || fresh)}</span>
      <span className="text-xs text-muted-foreground">{fresh && !due ? 'new' : 'due'}</span>
    </div>
  )
}

/**
 * Every deck as a plain table, as Anki's deck list: the name, then Due (in
 * the accent), New and Cards in columns; sub-decks hang off the trunk under
 * their deck and fold with its chevron. Clicking a name studies it.
 */
function DeckList({ own, shelves, onStudy, place = {} }: { own: OwnDeck[]; shelves: Shelf[]; onStudy: (tag: string) => void; /** The order you dragged the decks to. */ place?: Record<string, number> }): React.JSX.Element {
  const [shut, flip] = useShut()
  const cols = 'grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] items-center gap-x-2'
  const row = (key: string, name: string, title: string, due: number, fresh: number, all: number, kids: number, study: (() => void) | null): React.JSX.Element => (
    <div key={key} data-deck-row={key} className={`${cols} min-h-8 text-control`}>
      <span className="flex min-w-0 items-center gap-1">
        <Fold id={key} kids={kids} open={!shut.has(key)} name={name} flip={() => flip(key)} />
        {study ? <button type="button" title={title} data-deck-row-study={key} onClick={() => (chime('riffle'), study())} className="min-w-0 cursor-pointer truncate rounded-[4px] px-1 text-left text-foreground hover:bg-accent">{name}</button>
          : <span title={title} className="min-w-0 truncate px-1 text-muted-foreground">{name}</span>}
      </span>
      <span className={`flex items-center justify-end gap-1.5 tabular-nums ${due > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground/60'}`}>{due > 0 && <span aria-hidden className="size-1.5 rounded-full bg-primary" />}{due < 0 ? '–' : num(due)}</span>
      <span className={`text-right tabular-nums ${fresh > 0 ? 'text-foreground' : 'text-muted-foreground/60'}`}>{fresh < 0 ? '–' : num(fresh)}</span>
      <span className="text-right text-muted-foreground tabular-nums">{num(all)}</span>
    </div>
  )
  const tops = ownOrder(own.filter((deck) => deck.depth === 0), place)
  return (
    <div data-deck-list role="table" aria-label="Decks" className="grid rounded-[5px] mf-metal px-3 py-2">
      <div className={`${cols} border-b border-foreground/10 pb-1.5 text-sm text-muted-foreground`}>
        <span className="pl-6">Deck</span><span className="text-right">Due</span><span className="text-right">New</span><span className="text-right">Cards</span>
      </div>
      {tops.map((deck) => {
        const inside = own.filter((one) => one.tag.startsWith(`${deck.tag}-`))
        return (
          <div key={deck.tag}>
            {row(deck.tag, deckName(deck), deckName(deck), deck.due, deck.fresh, deck.cards, inside.filter((one) => one.depth === 1).length, deck.cards ? () => onStudy(deck.tag) : null)}
            {inside.length > 0 && !shut.has(deck.tag) && (
              <div className="pl-3">
                <Tree nodes={treeOf(inside, (one) => one.depth)} here={-1} className="pl-3" open={(node) => !shut.has(node.item.tag)}
                  row={({ item: one, kids }) => row(one.tag, sayDeck(one.label), deckTitle(one.tag, own.map((deck) => deck.tag)), one.due, one.fresh, one.cards, kids.length, one.cards ? () => onStudy(one.tag) : null)} />
              </div>
            )}
          </div>
        )
      })}
      {shelves.map((shelf) => {
        const topics = shelf.topics.length > 1 ? [...shelf.topics].sort((a, b) => a.deck.localeCompare(b.deck)) : []
        return (
          <div key={shelf.name}>
            {row(shelf.name, shelf.name, shelf.name, shelf.due, shelf.fresh, shelf.cards, topics.length ? treeOf(topics, (topic) => topic.deck.split('::').length).length : 0, shelf.held < shelf.cards ? () => onStudy(deckTag(shelf.name)) : null)}
            {topics.length > 0 && !shut.has(shelf.name) && (
              <div className="pl-3">
                <Tree nodes={treeOf(topics, (topic) => topic.deck.split('::').length)} here={-1} className="pl-3" open={(node) => !shut.has(node.item.deck)}
                  row={({ item: topic, kids }) => row(topic.deck, topic.label, topic.deck, -1, -1, topic.cards, kids.length, topic.held < topic.cards ? () => onStudy(deckTag(topic.deck)) : null)} />
              </div>
            )}
          </div>
        )
      })}
    </div>
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
const exampleMenu = (onStudy: (tag: string) => void): Section[] => [
  { items: [
    { label: 'Study', run: () => (chime('riffle'), onStudy(EXAMPLE_TAG)) },
    { label: 'Remove the example deck', hint: 'All ten cards, for good; it never counted in your stats', run: removeExample }
  ] }
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
        <p className="max-w-[62ch] leading-relaxed text-muted-foreground">A card asks one question. Review brings it back just before you would forget it, and waits longer each time you remember.</p>
      </span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Way id="make" title="Make your first card" line="Type a question, then its answer." onClick={onMake}>
          <span className="font-serif text-base leading-snug font-semibold text-foreground">What is the capital of Peru?</span>
          <span className="border-t border-dashed border-foreground/15" />
          <span className="text-sm text-foreground/80">Lima</span>
        </Way>
        <Way id="import" title="Import from Anki" line="A deck someone shared with you, or a spreadsheet of words and meanings." onClick={() => (chime('open'), void window.api.importFrom('files'))}>
          <span className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate text-foreground">Biology.apkg</span><span className="shrink-0 text-muted-foreground">Anki deck</span></span>
          <span className="border-t border-foreground/10" />
          <span className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate text-foreground">Spanish words.csv</span><span className="shrink-0 text-muted-foreground">spreadsheet</span></span>
        </Way>
        <Way id="picture" title="Make cards from a picture" line="A diagram with labels: cover them, and each becomes a card." onClick={onPicture}>
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
            {example ? <><Counts due={example.due} fresh={example.fresh} />. The example deck: never counted in your streak or stats.</>
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
