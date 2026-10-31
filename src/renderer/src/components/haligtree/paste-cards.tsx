import { useState } from 'react'
import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'
import { Chips } from './display'
import { toast } from './ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

/** What can stand between a card's front and back, as people write them: Anki's export, a spreadsheet, a quick list. */
export const SEPARATORS = [
  { id: '\t', label: 'Tab' },
  { id: '|', label: '|' },
  { id: ';', label: ';' },
  { id: ' - ', label: '“ - ”' },
  { id: ',', label: ',' }
] as const
export type Separator = (typeof SEPARATORS)[number]['id']

const lines = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))

/** The separator that splits the most lines in two, the first in the list winning a tie. */
export function guessSeparator(text: string): Separator {
  const all = lines(text)
  let best: Separator = '\t'
  let most = 0
  for (const { id } of SEPARATORS) {
    const split = all.filter((line) => line.split(id).filter((part) => part.trim()).length >= 2).length
    if (split > most) (best = id), (most = split)
  }
  return best
}

/** Words a spreadsheet's first row uses to name its columns: "Front,Back", "English;Spanish", "Question | Answer". */
const HEADING = /^(front|back|question|answer|term|definition|word|meaning|english|spanish|french|german|italian|portuguese|japanese|chinese|korean|russian|native|target|sentence|translation|notes?|extra|tags?|side ?[12])$/i

/** The first line's columns, when they name the columns rather than make a card: kept as the sides' names. */
export function headingsOf(text: string, separator: Separator): string[] | null {
  const parts = (lines(text)[0] ?? '').split(separator).map((part) => part.trim())
  return parts.length >= 2 && parts.slice(0, 2).every((part) => HEADING.test(part)) ? parts : null
}

/** Each line as a front and a back; columns after the second join the back as an extra line. A first line of column names is not a card. */
export function cardsOf(text: string, separator: Separator): { term: string; meaning: string }[] {
  return lines(text).slice(headingsOf(text, separator) ? 1 : 0).flatMap((line) => {
    const [front = '', ...rest] = line.split(separator).map((part) => part.trim())
    const back = rest.filter(Boolean)
    return front && back.length ? [{ term: front, meaning: back.join('\n\n') }] : []
  })
}

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
  const skipped = lines(text).length - (headings ? 1 : 0) - cards.length
  const marks = [tagOf(deck), ...tags.split(/[\s,]+/).map(tagOf)].filter(Boolean)
  const add = (): void => {
    if (!cards.length) return
    const tagged = cards.map((card) => ({ ...card, meaning: marks.length ? `${card.meaning}\n\n${marks.map((one) => `#${one}`).join(' ')}` : card.meaning }))
    void window.api.haligtree<string[]>('cards:list', tagged).then((ids) => {
      chime('noted')
      toast(`${num(ids.length)} ${ids.length === 1 ? 'card' : 'cards'} added${marks.length ? ` to #${marks[0]}` : ''}`, () => void window.api.haligtree('cards:list:undo', ids).then(() => chime('undo')))
      setText('')
      onClose()
    })
  }
  return (
    <section data-paste-cards className="flex flex-col gap-3 rounded-lg border bg-accent/30 p-4">
      <div className="flex items-baseline gap-3">
        <h3 className="flex-1 text-base font-semibold">Paste cards</h3>
        <span className="text-xs text-muted-foreground">One card a line: front, then back. Or drop a .txt or .csv here.</span>
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
