import { useState } from 'react'
import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'
import { Chips } from './display'
import { toast } from './ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { SEPARATORS, cardsOf, guessSeparator, headingsOf, listLines as lines, type Separator } from '../../../../main/card-lists'

/** A deck or tag as a #tag: "Spanish::Verbs" or "spanish verbs" becomes #spanish-verbs. */
const tagOf = (words: string): string =>
  words.trim().toLowerCase().replace(/^#/, '').split('::').map((part) => part.replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('-')

/**
 * Paste cards straight in, one a line: the separator is found on its own
 * (and can be switched), the fronts and backs show in two columns as you
 * type, and a deck and tags go on every card. A .txt or .csv dropped on the
 * box reads in too. Adding them is one step with one Undo.
 */
export function PasteCards({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const [chosen, setChosen] = useState<Separator | null>(null)
  const [deck, setDeck] = useState('')
  const [tags, setTags] = useState('')
  const separator = chosen ?? guessSeparator(text)
  const cards = cardsOf(text, separator)
  const headings = headingsOf(text, separator)
  const threes = cards.filter((card) => card.three).length
  const skipped = lines(text).length - (headings ? 1 : 0) - cards.length
  const marks = [tagOf(deck), ...tags.split(/[\s,]+/).map(tagOf)].filter(Boolean)
  const add = (): void => {
    if (!cards.length) return
    const tagged = cards.map(({ term, meaning }) => ({ term, meaning: marks.length ? `${meaning}\n\n${marks.map((one) => `#${one}`).join(' ')}` : meaning }))
    void window.api.haligtree<string[]>('cards:list', tagged).then((ids) => {
      chime('noted')
      toast(`${ids.length === 1 ? 'Card made' : `${num(ids.length)} cards made`}${marks.length ? ` in #${marks[0]}` : ''}`, () => void window.api.haligtree('cards:list:undo', ids).then(() => chime('undo')), 'success', undefined, ids.length === 1 ? { type: 'nugget', id: ids[0], title: tagged[0].term } : undefined)
      setText('')
      onClose()
    })
  }
  return (
    <section data-paste-cards className="flex flex-col gap-3 rounded-lg border bg-accent/30 p-4">
      <div className="flex items-baseline gap-3">
        <h3 className="flex-1 text-base font-semibold">Paste cards</h3>
        <span className="text-xs text-muted-foreground">One card a line: front, then back. Or drop a .txt, .csv or .tsv here.</span>
      </div>
      <Textarea data-paste-text autoFocus value={text} onChange={(event) => setText(event.target.value)} rows={5}
        placeholder={'What does GPT stand for? | Generative Pre-trained Transformer\nhola | hello'}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const file = [...event.dataTransfer.files].find((one) => /\.(txt|csv|tsv)$/i.test(one.name))
          if (!file) return
          event.preventDefault()
          event.stopPropagation()
          void file.text().then((read) => (chime('noted'), setText(read)))
        }}
        className="font-mono text-sm" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Split at</span>
        <Chips options={SEPARATORS} on={(id) => id === separator} pick={(id) => setChosen(id as Separator)} />
        {!chosen && text.trim() && <span className="text-xs text-muted-foreground">found on its own</span>}
        {headings && <span data-paste-headings className="text-xs text-muted-foreground">The first line names the columns, so it is not a card</span>}
        {threes > 0 && <span data-paste-threes className="text-xs text-muted-foreground">{num(threes)} {threes === 1 ? 'line splits' : 'lines split'} in three or more: split at the first, the rest kept on the back</span>}
      </div>
      {cards.length > 0 && (
        <div data-paste-preview className="max-h-56 overflow-auto rounded-md border bg-background">
          <table className="w-full table-fixed text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-1.5 font-medium">{headings?.[0] ?? 'Front'}</th><th className="px-3 py-1.5 font-medium">{headings?.[1] ?? 'Back'}</th></tr>
            </thead>
            <tbody>
              {cards.slice(0, 50).map((card, at) => (
                <tr key={at} className="border-t">
                  <td className="truncate px-3 py-1.5">{card.term}</td>
                  <td className="truncate px-3 py-1.5 text-muted-foreground">{card.meaning.replace(/\n+/g, ' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input data-paste-deck value={deck} onChange={(event) => setDeck(event.target.value)} placeholder="Deck, as a tag (Spanish::Verbs)" className="h-8 w-60 text-sm" />
        <Input data-paste-tags value={tags} onChange={(event) => setTags(event.target.value)} placeholder="More tags" className="h-8 w-44 text-sm" />
        <span className="flex-1 text-xs text-muted-foreground">
          {marks.length ? `Each card gets ${marks.map((one) => `#${one}`).join(' ')}` : ''}
          {skipped > 0 ? `${marks.length ? '. ' : ''}${num(skipped)} ${skipped === 1 ? 'line has no back and stays' : 'lines have no back and stay'} out` : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" data-paste-add disabled={!cards.length} onClick={add}>{cards.length ? `Add ${num(cards.length)} ${cards.length === 1 ? 'card' : 'cards'}` : 'Add cards'}</Button>
      </div>
    </section>
  )
}
