import { chime } from '@/lib/sound'
import { call, unloaded, useLive } from '@/lib/haligtree'
import { num } from '../../../../main/dates'
import { Empty, toast } from './ui'
import { Button } from '@/components/ui/button'

type Topic = { deck: string; label: string; cards: number; held: number }
export type Shelf = { name: string; cover: string | null; cards: number; fresh: number; due: number; held: number; shown: boolean; topics: Topic[] }

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
export function DeckShelf(): React.JSX.Element {
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
            <span aria-hidden className="grid size-24 shrink-0 place-items-center rounded-lg bg-accent font-serif text-3xl text-muted-foreground">{shelf.name.slice(0, 1)}</span>
          )}
          <div className="grid min-w-0 flex-1 content-start gap-2">
            <h3 className="font-serif text-lg leading-tight text-foreground">{shelf.name}</h3>
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
                    <span className="text-muted-foreground tabular-nums">{num(topic.cards)}</span>
                    <Button variant="ghost" size="sm" className="h-6 cursor-pointer rounded-full px-2.5" data-topic-start={topic.deck}
                      onClick={() => startDeck(topic.deck, topic.label, topic.held > 0)}>
                      {topic.held > 0 ? 'Start' : 'Hold'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" className="cursor-pointer" data-deck-start onClick={() => startDeck(shelf.name, shelf.name, shelf.held > 0)}>
                {shelf.held > 0 ? (shelf.held === shelf.cards ? 'Start' : 'Start the rest') : 'Hold new cards'}
              </Button>
              <Button variant="ghost" size="sm" className="cursor-pointer" data-deck-gems aria-pressed={shelf.shown} onClick={() => show(shelf)}>
                {shelf.shown ? 'Keep out of Gems' : 'Show in Gems'}
              </Button>
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
