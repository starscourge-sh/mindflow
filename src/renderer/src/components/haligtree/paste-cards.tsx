import { useState } from 'react'
import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'
import { Chips } from './display'
import { toast } from './ui'
import { Button } from '@/components/ui/button'

import { SEPARATORS, cardsOf, guessSeparator, headingsOf, listLines as lines, type Separator } from '../../../../main/card-lists'

/** One card a line, or two: the second asks the back first (a word and its meaning, a symptom and its disease). */
const WAYS = [{ id: 'one', label: 'Front first' }, { id: 'both', label: 'Both ways', tip: 'Two cards a line: front first and back first. Never both on one day' }] as const

/** A deck or tag as a #tag: "Spanish::Verbs" or "spanish verbs" becomes #spanish-verbs. */
const tagOf = (words: string): string =>
  words.trim().toLowerCase().replace(/^#/, '').split(/::|\//).map((part) => part.replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('-')

/**
 * Paste cards straight in, one a line: the separator is found on its own
 * (and can be switched), the fronts and backs show in two columns as you
 * type, and a deck and tags go on every card. A .txt or .csv dropped on the
 * box reads in too. Adding them is one step with one Undo.
 */
export function PasteCards({ onClose, deck: aimed }: { onClose: () => void; /** The deck the cards go in, filled in. */ deck?: string }): React.JSX.Element {
  const [text, setText] = useState('')
  const [chosen, setChosen] = useState<Separator | null>(null)
  const [deck, setDeck] = useState(aimed ?? '')
  const [tags, setTags] = useState('')
  // Anki's "Basic (and reversed card)": each line asked front first and back first, one of the two a day.
  const [both, setBoth] = useState(false)
  const separator = chosen ?? guessSeparator(text)
  const cards = cardsOf(text, separator)
  const headings = headingsOf(text, separator)
  const threes = cards.filter((card) => card.three).length
  const skipped = lines(text).length - (headings ? 1 : 0) - cards.length
  const marks = [tagOf(deck), ...tags.split(/[\s,]+/).map(tagOf)].filter(Boolean)
  const add = (): void => {
    if (!cards.length) return
    const tagged = cards.map(({ term, meaning }) => ({ term, meaning: marks.length ? `${meaning}\n\n${marks.map((one) => `#${one}`).join(' ')}` : meaning, both }))
    void window.api.haligtree<string[]>('cards:list', tagged).then((ids) => {
      chime('noted')
      toast(`${ids.length === 1 ? 'Card made' : `${num(ids.length)} cards made`}${marks.length ? ` in ${deck.trim() ? 'the deck ' : ''}#${marks[0]}` : ''}`, () => void window.api.haligtree('cards:list:undo', ids).then(() => chime('undo')), 'success', undefined, ids.length === 1 ? { type: 'nugget', id: ids[0], title: tagged[0].term } : undefined)
      setText('')
      onClose()
    })
  }
  return (
    // On the same card stock as All cards' index cards: a heading in the serif, the
    // lines written straight onto ruled paper, and the cards they make laid out below.
    <section data-paste-cards className="mf-index-card flex flex-col gap-3 px-5 pt-4 pb-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="flex-1 font-heading text-heading font-semibold">{aimed ? `Paste cards into #${tagOf(aimed)}` : 'Paste cards'}</h3>
        <span className="text-control text-foreground/70">One card a line, front then back, or drop a .txt, .csv or .tsv here</span>
      </div>
      <div aria-hidden className="mf-index-rule" />
      <textarea data-paste-text autoFocus value={text} onChange={(event) => setText(event.target.value)} rows={5}
        placeholder={'What does GPT stand for? | Generative Pre-trained Transformer\nhola | hello'}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const file = [...event.dataTransfer.files].find((one) => /\.(txt|csv|tsv)$/i.test(one.name))
          if (!file) return
          event.preventDefault()
          event.stopPropagation()
          void file.text().then((read) => (chime('noted'), setText(read)))
        }}
        className="mf-index-lines w-full resize-y bg-transparent text-body leading-[1.75rem] outline-none placeholder:text-muted-foreground/70" />
      <div className="flex flex-wrap items-center gap-2 text-control">
        <span className="text-foreground/70">Split at</span>
        <Chips options={SEPARATORS} on={(id) => id === separator} pick={(id) => setChosen(id as Separator)} />
        {!chosen && text.trim() && <span className="text-foreground/70">found on its own</span>}
        <span className="ml-2 text-foreground/70">Ask</span>
        <span data-paste-ways><Chips options={WAYS} on={(id) => (id === 'both') === both} pick={(id) => setBoth(id === 'both')} /></span>
        {headings && <span data-paste-headings className="text-foreground/70">The first line names the columns, so it is not a card</span>}
        {threes > 0 && <span data-paste-threes className="text-foreground/70">{num(threes)} {threes === 1 ? 'line splits' : 'lines split'} in three or more: split at the first, the rest kept on the back</span>}
      </div>
      {cards.length > 0 && (
        // The cards it will make, as cards: front over the rule, back under it.
        <div data-paste-preview className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2.5 overflow-auto p-0.5">
          {cards.slice(0, 50).map((card, at) => (
            <div key={at} className="mf-index-card flex aspect-[5/3] min-h-0 flex-col gap-1 overflow-hidden px-3 pt-2 pb-1.5 text-sm">
              <span className="line-clamp-2 font-heading font-semibold leading-snug">{card.term}</span>
              <div aria-hidden className="mf-index-rule" />
              <span className="line-clamp-2 text-foreground/75">{card.meaning.replace(/\n+/g, ' · ')}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed pt-2.5 text-control">
        <label className="flex items-center gap-1.5"><span className="text-foreground/70">Deck</span>
          <input data-paste-deck value={deck} onChange={(event) => setDeck(event.target.value)} placeholder="Spanish::Verbs" className="w-40 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/70" /></label>
        <label className="flex items-center gap-1.5"><span className="text-foreground/70">Tags</span>
          <input data-paste-tags value={tags} onChange={(event) => setTags(event.target.value)} placeholder="more tags" className="w-32 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/70" /></label>
        <span className="flex-1 text-foreground/70">
          {marks.length ? `Each card gets ${marks.map((one) => `#${one}`).join(' ')}` : ''}
          {skipped > 0 ? `${marks.length ? '. ' : ''}${num(skipped)} ${skipped === 1 ? 'line has no back and stays' : 'lines have no back and stay'} out` : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" data-paste-add disabled={!cards.length} onClick={add}>{cards.length ? `Add ${num(cards.length * (both ? 2 : 1))} ${cards.length * (both ? 2 : 1) === 1 ? 'card' : 'cards'}` : 'Add cards'}</Button>
      </div>
    </section>
  )
}
