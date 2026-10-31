import { useState } from 'react'
import { chime } from '@/lib/sound'
import { call, unloaded, useLive } from '@/lib/haligtree'
import { num } from '../../../../main/dates'
import { Empty, toast } from './ui'
import { Button } from '@/components/ui/button'
import { Chip } from './display'

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
export function DeckShelf({ onOpen, onStudy }: { onOpen: (type: string, id: string) => void; /** Study a deck's or topic's tag in Today. */ onStudy: (tag: string) => void }): React.JSX.Element {
  const [gallery, setGallery] = useState<string | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const shelves = useLive(() => call<Shelf[]>('decks:list'), null as Shelf[] | null, [], ['item'])
  if (unloaded(shelves)) return <div />
  if (!shelves?.length)
    return (
      <Empty title="No decks yet">
        An Anki deck (.apkg) dropped on this window, or brought in from File › Import, sits here on its own shelf, out of Gems, with its cards started a topic at a time.
      </Empty>
    )
  const show = (shelf: Shelf): void =>
    void call<number>('decks:show', shelf.name, !shelf.shown).then(() => {
      chime(shelf.shown ? 'fold' : 'noted')
      toast(shelf.shown ? `${shelf.name} is back on its shelf, out of Gems` : `${shelf.name} shows in Gems, Feed and Home now`, () => void call('decks:show', shelf.name, shelf.shown).then(() => chime('undo')))
    })
  return (
    <div data-deck-shelf className="grid gap-3 px-5 pt-4 pb-20">
      {shelves.map((shelf) => (
        <section key={shelf.name} data-deck={shelf.name} className="flex gap-4 rounded-xl border border-foreground/10 bg-accent/25 p-4">
          {shelf.cover ? (
            <img src={shelf.cover} alt="" className="size-24 shrink-0 rounded-lg object-cover" />
          ) : (
            // No pictures: its first question as the cover, the way a card would ask it.
            <span aria-hidden data-deck-cover-card className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-foreground/10 bg-background p-2 text-center font-serif text-sm leading-snug text-foreground shadow-sm [overflow-wrap:anywhere]">
              <span className="line-clamp-4">{shelf.sample || shelf.name}</span>
            </span>
          )}
          <div className="grid min-w-0 flex-1 content-start gap-2">
            {/* One line, however long the deck's name: the whole of it shows on hover. */}
            <h3 title={shelf.name} className="truncate font-serif text-lg leading-tight text-foreground">{shelf.name}</h3>
            {/* The counts that matter on their own line, in the body's size: new, due today, and held. */}
            <p data-deck-counts className="text-sm text-foreground tabular-nums">
              {cards(shelf.cards)}
              {shelf.fresh > 0 && <> · {num(shelf.fresh)} new</>}
              {shelf.due > 0 && <> · {num(shelf.due)} due</>}
              {shelf.held > 0 && <> · <b className="font-semibold">{num(shelf.held)} held</b> until you start them</>}
            </p>
            {shelf.topics.length > 1 && (
              <ul data-deck-topics className="flex flex-wrap gap-1.5">
                {shelf.topics.map((topic) => (
                  <li key={topic.deck} className="flex items-center gap-1 rounded-full border border-foreground/10 bg-background py-0.5 pr-0.5 pl-3 text-control">
                    <span>{topic.label}</span>
                    {topic.held < topic.cards && (
                      <Button variant="ghost" size="sm" className="h-6 cursor-pointer rounded-full px-2.5" data-topic-study={topic.deck}
                        onClick={() => (chime('riffle'), onStudy(deckTag(topic.deck)))}>Study</Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 cursor-pointer rounded-full px-2.5" data-topic-start={topic.deck}
                      onClick={() => startDeck(topic.deck, topic.label, topic.held > 0)}>
                      {topic.held > 0 ? `Start ${num(topic.held)}` : 'Hold'}
                    </Button>
                  </li>
                ))}
              </ul>
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
