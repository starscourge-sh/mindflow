import { deckTitle } from './decks'
import { useState } from 'react'
import { chime } from '@/lib/sound'
import { num, plural } from '../../../../main/dates'
import { Chips } from './display'
import { toast } from './ui'
import { CARD_FIELD, CardForm, CardFormFoot, tagsIn } from './card-form'

import { SEPARATORS, cardsOf, guessSeparator, headingsOf, listLines as lines, type Separator } from '../../../../main/card-lists'

/** A deck or tag as a #tag: "Spanish::Verbs" or "spanish verbs" becomes #spanish-verbs. */
const tagOf = (words: string): string =>
  words.trim().toLowerCase().replace(/^#/, '').split(/::|\//).map((part) => part.replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('-')

/**
 * Paste cards straight in, one a line: the separator is found on its own
 * (and can be switched), the fronts and backs show in two columns as you
 * type, and a deck and tags go on every card. A .txt or .csv dropped on the
 * box reads in too. Adding them is one step with one Undo.
 */
export function PasteCards({ onClose, deck: aimed, onShow }: { onClose: () => void; /** The deck the cards go in, filled in. */ deck?: string; /** Show just the cards made, from the toast's "Show them". */ onShow?: (ids: string[]) => void }): React.JSX.Element {
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
  const marks = [tagOf(deck), ...tagsIn(tags)].filter(Boolean)
  const add = (): void => {
    if (!cards.length) return
    const tagged = cards.map(({ term, meaning }) => ({ term, meaning: marks.length ? `${meaning}\n\n${marks.map((one) => `#${one}`).join(' ')}` : meaning, both }))
    void window.api.haligtree<string[]>('cards:list', tagged).then((ids) => {
      chime('noted')
      toast(`${ids.length === 1 ? 'Card made' : `${num(ids.length)} cards made`}${marks.length ? ` in ${deck.trim() ? `the deck ${deckTitle(marks[0])}` : `#${marks[0]}`}` : ''}`, () => void window.api.haligtree('cards:list:undo', ids).then(() => chime('undo')), 'success', onShow && ids.length > 1 ? { label: 'Show them', key: 'S', run: () => onShow(ids) } : undefined, ids.length === 1 ? { type: 'nugget', id: ids[0], title: tagged[0].term } : undefined)
      setText('')
      onClose()
    })
  }
  const count = cards.length * (both ? 2 : 1)
  const keys = (event: React.KeyboardEvent): void => {
    // Typing stays in the form; the app's own chords (⌘K, ⌘F) still reach the app.
    if (!event.metaKey && !event.ctrlKey) event.stopPropagation()
    if (event.key === 'Escape') return void (event.preventDefault(), onClose())
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) return void (event.preventDefault(), event.stopPropagation(), add())
  }
  // What goes on every card, and what is left out, said once over the foot.
  const said = [marks.length ? `Each card gets ${marks.map((one) => `#${one}`).join(' ')}` : '', skipped > 0 ? plural(skipped, 'line has no back and stays', 'lines have no back and stay') + ' out' : ''].filter(Boolean).join('. ')
  return (
    // The same form as "Make a card": the lines written straight onto the card, the cards they make laid out under them.
    <CardForm data-paste-cards head={aimed ? `Add many at once into ${deckTitle(tagOf(aimed))}` : 'Add many at once'} keys={keys}
      line="Paste a list or a spreadsheet, one card a line, front then back, or drop a .txt, .csv or .tsv on it."
      foot={<CardFormFoot mark="paste-add" deck={deck} onDeck={setDeck} tags={tags} onTags={setTags} both={both} onBoth={setBoth} status={said || undefined}
        onCancel={onClose} go={count ? `Add ${plural(count, 'card')}` : 'Add the cards'} ready={!!cards.length} onGo={add} />}>
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
        className={`${CARD_FIELD} min-h-[7.5rem] text-body leading-relaxed`} />
      <div className="flex flex-wrap items-center gap-2 text-control">
        <span className="text-foreground/70">Split at</span>
        <Chips options={SEPARATORS} on={(id) => id === separator} pick={(id) => setChosen(id as Separator)} />
        {!chosen && text.trim() && <span className="text-foreground/70">found on its own</span>}
        {headings && <span data-paste-headings className="text-foreground/70">The first line names the columns, so it is not a card</span>}
        {threes > 0 && <span data-paste-threes className="text-foreground/70">{num(threes)} {threes === 1 ? 'line splits' : 'lines split'} in three or more: split at the first, the rest kept on the back</span>}
      </div>
      {cards.length > 0 && (
        // The cards it will make, as small cards: front over the dashed rule, back under it, as on the form itself.
        <div data-paste-preview className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2.5 overflow-auto p-0.5">
          {cards.slice(0, 50).map((card, at) => (
            <div key={at} className="flex aspect-[5/3] min-h-0 flex-col gap-1 overflow-hidden rounded-[4px] border border-foreground/12 bg-background/40 px-3 pt-2 pb-1.5 text-control">
              <span className="line-clamp-2 font-semibold leading-snug">{card.term}</span>
              <div aria-hidden className="border-t border-dashed border-foreground/15" />
              <span className="line-clamp-2 text-foreground/75">{card.meaning.replace(/\n+/g, ' · ')}</span>
            </div>
          ))}
        </div>
      )}
    </CardForm>
  )
}
