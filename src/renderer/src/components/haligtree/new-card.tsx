import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { chime } from '@/lib/sound'
import { Kbd, refuse, toast } from './ui'
import { deckTagOf } from './decks'

/** Written straight onto the card, as "Ask another way" writes: no box, the faint italic line says where. */
const FIELD = 'field-sizing-content w-full resize-none bg-transparent text-foreground outline-none placeholder:italic placeholder:font-normal placeholder:text-muted-foreground'

/**
 * "Make a card" in a deck: one card, the question then its answer, on the
 * same card box as "Ask another way". Tab moves between them, ⌘↵ keeps it,
 * Esc closes. The box stays open for the next card and says how many it made.
 */
export function NewCard({ deck: aimed, onClose }: { deck?: string; onClose: () => void }): React.JSX.Element {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [deck, setDeck] = useState(aimed ?? '')
  const [made, setMade] = useState(0)
  // Anki's "Basic (and reversed card)": a second card asks the answer first. Kept on for the next card.
  const [both, setBoth] = useState(false)
  const ask = useRef<HTMLTextAreaElement>(null)
  const tag = deckTagOf(deck)
  const save = (): void => {
    if (!question.trim()) return void (ask.current?.focus(), refuse('Write the question first'))
    if (!answer.trim()) return refuse('Write its answer too')
    const card = { term: question.trim(), meaning: tag ? `${answer.trim()}\n\n#${tag}` : answer.trim(), both }
    void window.api.haligtree<string[]>('cards:list', [card]).then((ids) => {
      chime('added')
      setMade((n) => n + ids.length)
      setQuestion('')
      setAnswer('')
      ask.current?.focus()
      toast(`${ids.length > 1 ? 'Two cards made, one each way,' : 'Card made'}${tag ? ` in the deck #${tag}` : ''}`, () => void window.api.haligtree('cards:list:undo', ids).then(() => (chime('undo'), setMade((n) => Math.max(0, n - ids.length)))), 'success', undefined, { type: 'nugget', id: ids[0], title: card.term })
    })
  }
  const keys = (event: React.KeyboardEvent): void => {
    event.stopPropagation()
    if (event.key === 'Escape') return void (event.preventDefault(), onClose())
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) return void (event.preventDefault(), save())
  }
  return (
    <section data-new-card onKeyDown={keys} className="flex flex-col gap-3 rounded-lg border bg-accent/30 px-5 pt-4 pb-3">
      <p className="text-sm text-foreground/80">
        <b className="font-semibold text-foreground">New card{tag ? ` in #${tag}` : ''}.</b> A question, then its answer: one thing a card.
      </p>
      <textarea ref={ask} autoFocus rows={1} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={keys}
        placeholder="The question" aria-label="Question" data-new-question className={`${FIELD} font-serif text-2xl leading-snug font-semibold`} />
      <div aria-hidden className="border-t border-dashed border-foreground/15" />
      <textarea rows={2} value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={keys}
        placeholder="Its answer" aria-label="Answer" data-new-answer className={`${FIELD} text-body leading-relaxed`} />
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" className="cursor-pointer" data-new-save onClick={save}>Make the card</Button>
        <Button variant="ghost" size="sm" className="cursor-pointer text-muted-foreground" onClick={onClose}>{made ? 'Done' : 'Cancel'}</Button>
        <label className="flex items-center gap-1.5 text-control"><span className="text-foreground/70">Deck</span>
          <input data-new-deck value={deck} onChange={(event) => setDeck(event.target.value)} onKeyDown={keys} placeholder="none" className="w-36 bg-transparent text-foreground outline-none placeholder:italic placeholder:text-muted-foreground" /></label>
        <label className="flex cursor-pointer items-center gap-1.5 text-control" title="A second card asks the answer first. Turn on when you will meet the answer first, like a word you hear before you need it">
          <Switch size="sm" data-new-both checked={both} onCheckedChange={setBoth} className="cursor-pointer" /><span className="text-foreground/70">Both ways</span></label>
        <span data-new-made className="ml-auto text-sm text-muted-foreground tabular-nums">
          {made ? `${made} ${made === 1 ? 'card' : 'cards'} made` : <><Kbd>Tab</Kbd> next field, <Kbd>⌘↵</Kbd> keeps it, <Kbd>Esc</Kbd> closes</>}
        </span>
      </div>
    </section>
  )
}
