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
import { Check } from 'lucide-react'
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

export function DeckShelf({ onOpen, onStudy, onPaste }: { onOpen: (type: string, id: string) => void; /** Study a deck's or topic's tag in Today. */ onStudy: (tag: string) => void; /** Paste cards into a deck, or make one card in it, in All cards. */ onPaste: (deck: string | null, one?: boolean) => void }): React.JSX.Element {
  const [gallery, setGallery] = useState<string | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const [allTags, setAllTags] = useState(false)
  const shelves = useLive(() => call<Shelf[]>('decks:list'), null as Shelf[] | null, [], ['item'])
  const own = useOwnDecks()
  const study = useLive(haligtree.tagStudy, { typed: {}, newPerDay: {}, retention: {} } as Awaited<ReturnType<typeof haligtree.tagStudy>>, [], ['item'])
  if (unloaded(shelves) || !own) return <div />
  const newDeck = (inside?: string): void => void makeDeck(inside)
  // The most due first. With many, the decks you made and the tags with cards in Review lead; the rest wait behind a fold.
  const tops = own.filter((deck) => deck.depth === 0).sort((a, b) => b.due - a.due || b.cards - a.cards || a.tag.localeCompare(b.tag))
  const many = tops.length > MANY
  const shown = many ? tops.filter((deck) => deck.made || deck.active > 0) : tops
  const folded = tops.filter((deck) => !shown.includes(deck))
  if (!shelves?.length && !own.length)
    return (
      <Empty title="No decks yet" action={
        <span className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="cursor-pointer" data-deck-new onClick={() => (chime('open'), newDeck())}>New deck</Button>
          <Button variant="ghost" size="sm" className="cursor-pointer" data-deck-paste onClick={() => (chime('open'), onPaste(null))}>Paste cards</Button>
          <Button variant="ghost" size="sm" className="cursor-pointer" data-deck-import onClick={() => (chime('open'), void window.api.importFrom('files'))}>Import an Anki deck</Button>
        </span>
      }>
        A deck is a tag your cards share. Make one, or paste cards.
      </Empty>
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
    <div data-deck-shelf className="grid gap-3 px-5 pt-4 pb-20">
      {/* Your own decks and the shared ones in one list, in one look: a deck is a tag your cards share. */}
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">A deck is a tag your cards share. Shared decks keep their own shelf, out of Gems.</p>
        <Button size="sm" className="cursor-pointer" data-deck-new onClick={() => (chime('open'), newDeck())}>New deck</Button>
      </div>
      {shown.map((deck) => (
        <OwnDeckShelf key={deck.tag} deck={deck} inside={own.filter((one) => one.tag.startsWith(`${deck.tag}-`))} onStudy={onStudy} onPaste={onPaste} onNew={newDeck} />
      ))}
      {folded.length > 0 && (
        <button type="button" data-deck-fold aria-expanded={allTags} onClick={() => (chime(allTags ? 'fold' : 'open'), setAllTags(!allTags))}
          className="cursor-pointer justify-self-start rounded-md px-2 py-1 text-control font-medium text-foreground/80 hover:bg-accent/50 hover:text-foreground">
          {allTags ? 'Hide the other tags' : `Show all tags with cards (${num(folded.length)} more)`}
        </button>
      )}
      {allTags && folded.map((deck) => (
        <OwnDeckShelf key={deck.tag} deck={deck} inside={own.filter((one) => one.tag.startsWith(`${deck.tag}-`))} onStudy={onStudy} onPaste={onPaste} onNew={newDeck} />
      ))}
      {(shelves ?? []).map((shelf) => (
        <RowMenu key={shelf.name} items={() => rowItems(sharedMenu(shelf))}>
        <section data-deck={shelf.name} className="flex gap-4 rounded-xl border border-foreground/10 bg-accent/25 p-4">
          {shelf.cover ? (
            <img src={shelf.cover} alt="" className="size-24 shrink-0 rounded-lg object-cover" />
          ) : (
            // No pictures: its cover drawn from its name, in its colour (its name is said beside it).
            <GroupCover name={shelf.name} tint={groupTint(shelf.name)} label={null} className="size-24 shrink-0 rounded-lg shadow-sm" />

          )}
          <div className="grid min-w-0 flex-1 content-start gap-2">
            {/* One line, however long the deck's name: the whole of it shows on hover. */}
            <div className="flex items-center gap-2">
              <h3 title={shelf.name} className="min-w-0 flex-1 truncate font-serif text-lg leading-tight text-foreground">{shelf.name}</h3>
              <OptionsMenu sections={sharedMenu(shelf)} label="Deck options" side="bottom" align="end" className="cursor-pointer" />
            </div>
            {/* The counts that matter on their own line, in the body's size: new, due today, and held. */}
            <p data-deck-counts className="text-sm text-foreground tabular-nums">
              {cards(shelf.cards)}
              {shelf.fresh > 0 && <> · {num(shelf.fresh)} new</>}
              {shelf.due > 0 && <> · {num(shelf.due)} due</>}
              {shelf.held > 0 && <> · <b className="font-semibold">{num(shelf.held)} held</b> until you start them</>}
            </p>
            {shelf.topics.length > 1 && (
              // Its topics hung off the one trunk every nested list in the app uses, as your own decks' are: the name, its count, and its own two actions.
              <div data-deck-topics className="max-w-md pl-2">
                <Tree here={-1} className="pl-3" nodes={treeOf([...shelf.topics].sort((a, b) => a.deck.localeCompare(b.deck)), (topic) => topic.deck.split('::').length)} row={({ item: topic }) => (
                  <div key={topic.deck} className="flex items-center gap-1 py-0.5 text-control">
                    <span className="min-w-0 flex-1 truncate text-foreground">{topic.label}</span>
                    <span className="pr-1 text-sm text-muted-foreground tabular-nums">{cards(topic.cards)}</span>
                    {topic.held < topic.cards && (
                      <Button variant="ghost" size="sm" className="h-7 cursor-pointer px-2.5" data-topic-study={topic.deck}
                        onClick={() => (chime('riffle'), onStudy(deckTag(topic.deck)))}>Study</Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 cursor-pointer px-2.5" data-topic-start={topic.deck}
                      onClick={() => startDeck(topic.deck, topic.label, topic.held > 0)}>
                      {topic.held > 0 ? `Start ${num(topic.held)}` : 'Hold'}
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
function OwnDeckShelf({ deck, inside, onStudy, onPaste, onNew }: { deck: OwnDeck; inside: OwnDeck[]; onStudy: (tag: string) => void; onPaste: (deck: string, one?: boolean) => void; onNew: (inside?: string) => void }): React.JSX.Element {
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
    <section data-deck={`#${deck.tag}`} data-own-deck={deck.tag} className="flex gap-4 rounded-xl border border-foreground/10 bg-accent/25 p-4">
      {/* Its cover drawn from its #tag, the one its pocket wears in All cards; faded while it has no cards. */}
      <GroupCover name={`#${deck.tag}`} tint={groupTint(`#${deck.tag}`)} label={null} className={`size-24 shrink-0 rounded-lg shadow-sm ${deck.cards ? '' : 'opacity-60'}`} />
      <div className="grid min-w-0 flex-1 content-start gap-2">
        <div className="flex items-center gap-2">
          <h3 title={`#${deck.tag}`} className="min-w-0 flex-1 truncate font-serif text-lg leading-tight text-foreground">{deck.label}</h3>
          <OptionsMenu sections={menu(deck.tag)} label="Deck options" side="bottom" align="end" className="cursor-pointer" />
        </div>
        <p data-deck-counts className="text-sm text-foreground tabular-nums">
          {deck.cards ? <>
            {cardsSaid(deck.cards)}
            {deck.fresh > 0 && <> · {num(deck.fresh)} new</>}
            {deck.due > 0 && <> · {num(deck.due)} due</>}
          </> : <span data-deck-empty>Empty. Paste cards or make one.</span>}
        </p>
        {inside.length > 0 && (
          // The decks inside it, hung off the one trunk every nested list in the app uses.
          <div data-deck-inside className="max-w-md pl-2">
            <Tree nodes={treeOf(inside, (one) => one.depth)} here={-1} className="pl-3" row={({ item: one }) => (
              <RowMenu key={one.tag} items={() => rowItems(menu(one.tag))}>
              <div data-deck-child={one.tag} onContextMenu={(event) => event.stopPropagation()} className="flex items-center gap-1 py-0.5 text-control">
                <span title={`#${one.tag}`} className="min-w-0 flex-1 truncate text-foreground">{one.label}</span>
                <span className="pr-1 text-sm text-muted-foreground tabular-nums">{one.cards ? cardsSaid(one.cards) : 'empty'}</span>
                {one.cards > 0
                  ? <Button variant="ghost" size="sm" className="h-7 cursor-pointer px-2.5" data-child-study={one.tag} onClick={() => (chime('riffle'), onStudy(one.tag))}>Study</Button>
                  : <Button variant="ghost" size="sm" className="h-7 cursor-pointer px-2.5" data-child-paste={one.tag} onClick={() => (chime('open'), onPaste(one.tag))}>Paste cards</Button>}
                <OptionsMenu sections={menu(one.tag)} label="Deck options" side="bottom" align="end" className="size-7 cursor-pointer" />
              </div>
              </RowMenu>
            )} />
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {deck.cards > 0 && <Button size="sm" className="cursor-pointer" data-deck-study onClick={() => (chime('riffle'), onStudy(deck.tag))}>Study</Button>}
          <Button size="sm" variant={deck.cards ? 'ghost' : 'default'} className="cursor-pointer" data-deck-paste onClick={() => (chime('open'), onPaste(deck.tag))}>Paste cards</Button>
          <Button variant="ghost" size="sm" className="cursor-pointer" data-deck-make onClick={() => (chime('open'), onPaste(deck.tag, true))}>Make a card</Button>
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
