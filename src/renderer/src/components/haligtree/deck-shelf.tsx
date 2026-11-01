import { useState } from 'react'
import { chime } from '@/lib/sound'
import { call, haligtree, unloaded, useLive } from '@/lib/haligtree'
import { num } from '../../../../main/dates'
import { Empty, ask, askSure, openTag, quietly, refuse, toast } from './ui'
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
import { cardsSaid, deckTagOf, makeDeck, useOwnDecks, type OwnDeck } from './decks'

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

export function DeckShelf({ onOpen, onStudy, onPaste }: { onOpen: (type: string, id: string) => void; /** Study a deck's or topic's tag in Today. */ onStudy: (tag: string) => void; /** Paste cards into a deck, or make one card in it, in All cards. */ onPaste: (deck: string | null, one?: boolean) => void }): React.JSX.Element {
  const [gallery, setGallery] = useState<string | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const [allTags, setAllTags] = useState(false)
  const [look, setLook] = useDeckLook()
  const [shut, flip] = useShut()
  const shapes = useLive(haligtree.settings, null as Settings | null)?.deckShapes === true
  const shelves = useLive(() => call<Shelf[]>('decks:list'), null as Shelf[] | null, [], ['item'])
  const own = useOwnDecks()
  const study = useLive(haligtree.tagStudy, { typed: {}, newPerDay: {}, retention: {} } as Awaited<ReturnType<typeof haligtree.tagStudy>>, [], ['item'])
  if (unloaded(shelves) || !own) return <div />
  const newDeck = (inside?: string): void => void makeDeck(inside)
  // The most due first. With many, the decks you made and the tags with cards in Review lead; the rest wait behind a fold.
  const tops = own.filter((deck) => deck.depth === 0).sort((a, b) => b.due - a.due || b.cards - a.cards || a.tag.localeCompare(b.tag))
  const many = tops.length > MANY
  // At most POCKETS on show at once, the most due first: a big collection reads better in the List, which the fold offers.
  const shown = (many ? tops.filter((deck) => deck.made || deck.active > 0) : tops).slice(0, POCKETS)
  const folded = tops.filter((deck) => !shown.includes(deck))
  // The three ways cards come in, always at the top, whatever is below: as Anki's "Create Deck" and "Import File" are.
  const top = (
    <div data-deck-top className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" className="cursor-pointer" data-deck-make onClick={() => (chime('open'), onPaste(null, true))}>Make a card</Button>
      <Button variant="outline" size="sm" className="cursor-pointer" data-deck-paste onClick={() => (chime('open'), onPaste(null))}>Add many at once</Button>
      <Button variant="outline" size="sm" className="cursor-pointer" data-deck-import onClick={() => (chime('open'), void window.api.importFrom('files'))}>Import<span className="font-normal text-muted-foreground">Anki or CSV</span></Button>
      <span className="flex-1" />
      <Button variant="ghost" size="sm" className="cursor-pointer" data-deck-new onClick={() => (chime('open'), newDeck())}>New deck</Button>
      {/* Pockets or a plain list, in the same two-part control as Review's tabs beside it. */}
      <span role="radiogroup" aria-label="Show decks as" data-deck-look-pick className="flex h-8 items-center rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-control">
        {(['pockets', 'list'] as const).map((one) => (
          <button key={one} type="button" role="radio" aria-checked={look === one} data-deck-look-to={one} onClick={() => void (look !== one && (chime('tap'), setLook(one)))}
            className={`h-7 cursor-pointer rounded-md border px-3 transition-colors ${look === one ? 'border-foreground/15 bg-background text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{one === 'pockets' ? 'Pockets' : 'List'}</button>
        ))}
      </span>
    </div>
  )
  if (!shelves?.length && !own.length)
    return (
      <div data-deck-shelf className="grid grid-cols-[minmax(0,1fr)] gap-4 px-5 pt-4 pb-20">
        {top}
        <Empty title="No decks yet">
          A deck is a set of cards you study together. Make a card, add many at once from a list or a spreadsheet, or import a deck from Anki (.apkg, .colpkg) or a CSV file.
        </Empty>
        <StudyYear />
      </div>
    )
  if (look === 'list')
    return (
      <div data-deck-shelf data-deck-look="list" className="grid grid-cols-[minmax(0,1fr)] gap-4 px-5 pt-4 pb-20">
        {top}
        <DeckList own={own} shelves={shelves ?? []} onStudy={onStudy} />
        <StudyYear />
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
  return (
    <div data-deck-shelf data-deck-look="pockets" className="grid grid-cols-[minmax(0,1fr)] gap-3 px-5 pt-4 pb-20">
      {/* Your own decks and the shared ones in one list, in one look: a deck is a tag your cards share. */}
      {top}
      {shown.map((deck) => (
        <OwnDeckShelf key={deck.tag} deck={deck} inside={own.filter((one) => one.tag.startsWith(`${deck.tag}-`))} onStudy={onStudy} onPaste={onPaste} onNew={newDeck} shapes={shapes} />
      ))}
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
      {allTags && folded.map((deck) => (
        <OwnDeckShelf key={deck.tag} deck={deck} inside={own.filter((one) => one.tag.startsWith(`${deck.tag}-`))} onStudy={onStudy} onPaste={onPaste} onNew={newDeck} shapes={shapes} />
      ))}
      {(shelves ?? []).map((shelf) => (
        <RowMenu key={shelf.name} items={() => rowItems(sharedMenu(shelf))}>
        <section data-deck={shelf.name} className="flex gap-4 rounded-[5px] border border-foreground/10 bg-accent/25 p-4">
          {shelf.cover ? (
            <img src={shelf.cover} alt="" className="size-24 shrink-0 rounded-[5px] object-cover" />
          ) : <DeckFace name={shelf.name} due={shelf.due} fresh={shelf.fresh} shapes={shapes} />}
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-2">
            {/* One line, however long the deck's name: the whole of it shows on hover. */}
            <div className="flex items-center gap-2">
              <h3 title={shelf.name} className="min-w-0 flex-1 truncate font-serif text-lg leading-tight text-foreground">{shelf.name}</h3>
              <OptionsMenu sections={sharedMenu(shelf)} label="Deck options" side="bottom" align="end" className="cursor-pointer" />
            </div>
            {/* The counts that matter on their own line, in the body's size: new, due today, and held. */}
            <p data-deck-counts className="text-sm text-foreground tabular-nums">
              <Counts due={shelf.due} fresh={shelf.fresh} cards={shelf.cards} />
              {shelf.held > 0 && <> · <b className="font-semibold">{num(shelf.held)} held</b> until you start them</>}
            </p>
            {shelf.topics.length > 1 && (
              // Its topics hung off the one trunk every nested list in the app uses, as your own decks' are: the name, its count, and its own two actions; a topic with its own fold shut.
              <div data-deck-topics className="max-w-md pl-2">
                <Tree here={-1} className="pl-3" open={(node) => !shut.has(node.item.deck)} nodes={treeOf([...shelf.topics].sort((a, b) => a.deck.localeCompare(b.deck)), (topic) => topic.deck.split('::').length)} row={(node) => (
                  <div key={node.item.deck} className="flex items-center gap-1 py-0.5 text-control">
                    <Fold kids={node.kids.length} open={!shut.has(node.item.deck)} name={node.item.label} flip={() => flip(node.item.deck)} />
                    <span className="min-w-0 flex-1 truncate text-foreground">{node.item.label}</span>
                    <span className="pr-1 text-sm text-muted-foreground tabular-nums">{cards(node.item.cards)}</span>
                    {node.item.held < node.item.cards && (
                      <Button variant="ghost" size="sm" className="h-7 cursor-pointer px-2.5" data-topic-study={node.item.deck}
                        onClick={() => (chime('riffle'), onStudy(deckTag(node.item.deck)))}>Study</Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 cursor-pointer px-2.5" data-topic-start={node.item.deck}
                      onClick={() => startDeck(node.item.deck, node.item.label, node.item.held > 0)}>
                      {node.item.held > 0 ? `Start ${num(node.item.held)}` : 'Hold'}
                    </Button>
                  </div>
                )} />
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {/* Study what is started; start what is held. The deck-wide button says it is for all of it, the topics' each their count. */}
              {shelf.held < shelf.cards && (
                <Button size="sm" className="cursor-pointer" data-deck-study onClick={() => (chime('riffle'), onStudy(deckTag(shelf.name)))}>Study</Button>
              )}
              <Button size="sm" variant={shelf.held > 0 && shelf.held === shelf.cards ? 'default' : 'ghost'} className="cursor-pointer" data-deck-start onClick={() => startDeck(shelf.name, shelf.name, shelf.held > 0)}>
                {shelf.held > 0 ? (shelf.held === shelf.cards ? 'Start all' : 'Start the rest') : 'Hold new cards'}
              </Button>
              <Button variant="ghost" size="sm" className="cursor-pointer" data-deck-gems aria-pressed={shelf.shown} onClick={() => show(shelf)}>
                {shelf.shown ? 'Keep out of Gems' : 'Show in Gems'}
              </Button>
              <Button variant="ghost" size="sm" className="cursor-pointer" data-deck-links aria-expanded={linking === shelf.name}
                onClick={() => (chime(linking === shelf.name ? 'fold' : 'open'), setLinking(linking === shelf.name ? null : shelf.name))}>Links</Button>
              {shelf.pictures > 0 && (
                <Button variant="ghost" size="sm" className="cursor-pointer" data-deck-gallery aria-expanded={gallery === shelf.name}
                  onClick={() => (chime(gallery === shelf.name ? 'fold' : 'open'), setGallery(gallery === shelf.name ? null : shelf.name))}>
                  {gallery === shelf.name ? 'Hide pictures' : 'Pictures'}
                </Button>
              )}
            </div>
            {linking === shelf.name && <Links deck={shelf.name} onDone={() => setLinking(null)} />}
            {gallery === shelf.name && <Gallery deck={shelf.name} onOpen={onOpen} />}
          </div>
        </section>
        </RowMenu>
      ))}
      <StudyYear />
    </div>
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
function deckSettings(tag: string, study: { typed: Record<string, string>; newPerDay: Record<string, number>; retention: Record<string, number> }): Section[] {
  const perDay = study.newPerDay[tag]
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
    { label: 'How typed answers are checked', items: [
      { label: 'Usual', hint: 'An accent or unit left out is part wrong; a slip of a letter can count; capitals do not', on: !typed, set: (on: boolean) => void (on && setTyped(null)) },
      { label: 'Exact', hint: 'Every mark counts, capitals too: formulas, symbols, case names', on: typed === 'exact', set: (on: boolean) => void (on && setTyped('exact')) },
      { label: 'Meaning', hint: 'Accents and small slips pass: names, terms, dates in words', on: typed === 'meaning', set: (on: boolean) => void (on && setTyped('meaning')) }
    ] }
  ]
}

/**
 * One of your own decks, on a shelf in the same look as a shared deck's: a
 * card of it as the cover, its counts, the decks inside it as rows, and its
 * actions. An empty one says how to fill it, with both ways.
 */
function OwnDeckShelf({ deck, inside, onStudy, onPaste, onNew, shapes }: { deck: OwnDeck; inside: OwnDeck[]; onStudy: (tag: string) => void; onPaste: (deck: string, one?: boolean) => void; onNew: (inside?: string) => void; shapes: boolean }): React.JSX.Element {
  const [shut, flip] = useShut()
  const study = useLive(haligtree.tagStudy, { typed: {}, newPerDay: {}, retention: {} } as Awaited<ReturnType<typeof haligtree.tagStudy>>, [], ['item'])
  const menu = (tag: string): Section[] => [
    ...deckSettings(tag, study),
    { items: [
      { label: 'New deck inside', run: () => onNew(tag) },
      { label: 'Open its page', hint: 'Its notes, gems and cards, on the tag’s page', run: () => openTag(tag) },
      { label: 'Rename deck…', run: () => void renameDeck(tag) },
      { label: 'Delete deck…', hint: 'Its cards are kept', run: () => void deleteDeck(tag) }
    ] }
  ]
  return (
    <RowMenu items={() => rowItems(menu(deck.tag))}>
    <section data-deck={`#${deck.tag}`} data-own-deck={deck.tag} className="flex gap-4 rounded-[5px] border border-foreground/10 bg-accent/25 p-4">
      <DeckFace name={`#${deck.tag}`} due={deck.due} fresh={deck.fresh} shapes={shapes} faded={!deck.cards} />
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-2">
        <div className="flex items-center gap-2">
          <h3 title={`#${deck.tag}`} className="min-w-0 flex-1 truncate font-serif text-lg leading-tight text-foreground">{deck.label}</h3>
          <OptionsMenu sections={menu(deck.tag)} label="Deck options" side="bottom" align="end" className="cursor-pointer" />
        </div>
        <p data-deck-counts className="text-sm text-foreground tabular-nums">
          {deck.cards ? <Counts due={deck.due} fresh={deck.fresh} cards={deck.cards} /> : <span data-deck-empty>Empty. Make a card or add many at once.</span>}
        </p>
        {inside.length > 0 && (
          // The decks inside it, hung off the one trunk every nested list in the app uses.
          <div data-deck-inside className="max-w-md pl-2">
            <Tree nodes={treeOf(inside, (one) => one.depth)} here={-1} className="pl-3" open={(node) => !shut.has(node.item.tag)} row={({ item: one, kids }) => (
              <RowMenu key={one.tag} items={() => rowItems(menu(one.tag))}>
              <div data-deck-child={one.tag} onContextMenu={(event) => event.stopPropagation()} className="flex items-center gap-1 py-0.5 text-control">
                <Fold kids={kids.length} open={!shut.has(one.tag)} name={one.label} flip={() => flip(one.tag)} />
                <span title={`#${one.tag}`} className="min-w-0 flex-1 truncate text-foreground">{one.label}</span>
                <span className="pr-1 text-sm text-muted-foreground tabular-nums">{one.cards ? <><DueFirst due={one.due} />{cardsSaid(one.cards)}</> : 'empty'}</span>
                {one.cards > 0
                  ? <Button variant="ghost" size="sm" className="h-7 cursor-pointer px-2.5" data-child-study={one.tag} onClick={() => (chime('riffle'), onStudy(one.tag))}>Study</Button>
                  : <Button variant="ghost" size="sm" className="h-7 cursor-pointer px-2.5" data-child-paste={one.tag} onClick={() => (chime('open'), onPaste(one.tag))}>Add many at once</Button>}
                <OptionsMenu sections={menu(one.tag)} label="Deck options" side="bottom" align="end" className="size-7 cursor-pointer" />
              </div>
              </RowMenu>
            )} />
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {deck.cards > 0 && <Button size="sm" className="cursor-pointer" data-deck-study onClick={() => (chime('riffle'), onStudy(deck.tag))}>Study</Button>}
          <Button size="sm" variant={deck.cards ? 'ghost' : 'default'} className="cursor-pointer" data-deck-make onClick={() => (chime('open'), onPaste(deck.tag, true))}>Make a card</Button>
          <Button variant="ghost" size="sm" className="cursor-pointer" data-deck-paste onClick={() => (chime('open'), onPaste(deck.tag))}>Add many at once</Button>
        </div>
      </div>
    </section>
    </RowMenu>
  )
}

/** The ⋯ menu's sections as a right-click menu: each labelled part a line opening its choices beside it, the one in use ticked. */
const rowItems = (sections: Section[]): RowItem[] => sections.flatMap((section): RowItem[] => {
  const lines = section.items.flatMap((item): MenuItem[] => typeof item === 'string' || 'more' in item || 'field' in item ? [] : [
    'set' in item ? { label: item.label, hint: item.hint, run: () => item.set(true), trail: item.on ? <Check className="size-3.5" /> : undefined } : { label: item.label, hint: item.hint, run: item.run, danger: /^Delete/.test(item.label) }
  ])
  return section.label ? [{ label: section.label, items: lines }] : ['separator', ...lines]
})

/** Rename a deck: the tag is renamed everywhere it is written, with Undo. */
async function renameDeck(tag: string): Promise<void> {
  const words = await ask(`Rename the deck #${tag}`, 'Its new name', undefined, tag)
  const to = words && deckTagOf(words)
  if (!to || to === tag) return
  const done = await haligtree.renameTag(tag, to)
  if (!done) return refuse('That name cannot be a deck')
  chime('noted')
  toast(`The deck #${tag} is #${done} now`, () => void haligtree.undoRenameTag().then(() => chime('undo')))
}

/** Delete a deck: the tag comes off its cards, which stay, with Undo. */
async function deleteDeck(tag: string): Promise<void> {
  const holding = (await call<{ id: string; tags: string[] }[]>('cards:all')).filter((card) => card.tags.includes(tag)).map((card) => card.id)
  const sure = await askSure(`Delete the deck #${tag}?`, holding.length ? `The #${tag} tag comes off its ${cardsSaid(holding.length)}. The cards themselves are kept, in All cards.` : 'It holds no cards. Nothing else changes.', 'Delete deck')
  if (!sure) return
  const before = holding.length ? await call<{ id: string; body: string | null }[]>('cards:retag', holding, tag, false) : []
  await haligtree.setTag(tag, { deck: false })
  chime('fold')
  toast(`The deck #${tag} is gone; its ${cardsSaid(holding.length)} kept`, () => void Promise.all([call('cards:retag:undo', before), haligtree.setTag(tag, { deck: true })]).then(() => chime('undo')))
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
function Fold({ kids, open, name, flip }: { kids: number; open: boolean; name: string; flip: () => void }): React.JSX.Element {
  if (!kids) return <span aria-hidden className="size-5 shrink-0" />
  return (
    <button type="button" data-deck-fold-kids={name} aria-expanded={open} aria-label={`${open ? 'Fold' : 'Unfold'} the decks inside ${name}`} onClick={(event) => (event.stopPropagation(), flip())}
      className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-[4px] text-muted-foreground hover:bg-accent hover:text-foreground">
      <ChevronRight className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
    </button>
  )
}

/** Due first, in the one accent, as Anki users read a deck; then new, then how many in all. */
function Counts({ due, fresh, cards: all }: { due: number; fresh: number; cards: number }): React.JSX.Element {
  return (
    <>
      <span data-count-due={due} className={due ? 'font-semibold text-primary' : 'text-muted-foreground'}>{num(due)} due</span>
      <span> · {num(fresh)} new · </span>
      <span>{cards(all)}</span>
    </>
  )
}

const DueFirst = ({ due }: { due: number }): React.JSX.Element | null => (due ? <span className="mr-2 font-semibold text-primary">{num(due)} due</span> : null)

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
    <div aria-hidden data-deck-face={name} className={`grid ${size} shrink-0 content-center justify-items-center gap-0.5 rounded-[5px] border border-foreground/10 bg-background shadow-sm ${faded ? 'opacity-60' : ''}`}>
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
function DeckList({ own, shelves, onStudy }: { own: OwnDeck[]; shelves: Shelf[]; onStudy: (tag: string) => void }): React.JSX.Element {
  const [shut, flip] = useShut()
  const cols = 'grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] items-center gap-x-2'
  const row = (key: string, name: string, title: string, due: number, fresh: number, all: number, kids: number, study: (() => void) | null): React.JSX.Element => (
    <div key={key} data-deck-row={key} className={`${cols} min-h-8 text-control`}>
      <span className="flex min-w-0 items-center gap-1">
        <Fold kids={kids} open={!shut.has(key)} name={name} flip={() => flip(key)} />
        {study ? <button type="button" title={title} data-deck-row-study={key} onClick={() => (chime('riffle'), study())} className="min-w-0 cursor-pointer truncate rounded-[4px] px-1 text-left text-foreground hover:bg-accent">{name}</button>
          : <span title={title} className="min-w-0 truncate px-1 text-muted-foreground">{name}</span>}
      </span>
      <span className={`text-right tabular-nums ${due > 0 ? 'font-semibold text-primary' : 'text-muted-foreground/60'}`}>{due < 0 ? '–' : num(due)}</span>
      <span className={`text-right tabular-nums ${fresh > 0 ? 'text-foreground' : 'text-muted-foreground/60'}`}>{fresh < 0 ? '–' : num(fresh)}</span>
      <span className="text-right text-muted-foreground tabular-nums">{num(all)}</span>
    </div>
  )
  const tops = own.filter((deck) => deck.depth === 0)
  return (
    <div data-deck-list role="table" aria-label="Decks" className="grid rounded-[5px] border border-foreground/10 bg-accent/25 px-3 py-2">
      <div className={`${cols} border-b border-foreground/10 pb-1.5 text-sm text-muted-foreground`}>
        <span className="pl-6">Deck</span><span className="text-right">Due</span><span className="text-right">New</span><span className="text-right">Cards</span>
      </div>
      {tops.map((deck) => {
        const inside = own.filter((one) => one.tag.startsWith(`${deck.tag}-`))
        return (
          <div key={deck.tag}>
            {row(deck.tag, deck.label, `#${deck.tag}`, deck.due, deck.fresh, deck.cards, inside.filter((one) => one.depth === 1).length, deck.cards ? () => onStudy(deck.tag) : null)}
            {inside.length > 0 && !shut.has(deck.tag) && (
              <div className="pl-3">
                <Tree nodes={treeOf(inside, (one) => one.depth)} here={-1} className="pl-3" open={(node) => !shut.has(node.item.tag)}
                  row={({ item: one, kids }) => row(one.tag, one.label, `#${one.tag}`, one.due, one.fresh, one.cards, kids.length, one.cards ? () => onStudy(one.tag) : null)} />
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
