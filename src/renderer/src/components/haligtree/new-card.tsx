import { useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { refuse, toast } from './ui'
import { deckTagOf, deckTitle } from './decks'
import { haligtree, useLive } from '@/lib/haligtree'
import { plural } from '../../../../main/dates'
import { CARD_FIELD, CardForm, CardFormFoot, tagsIn } from './card-form'

/**
 * "Make a card" in a deck: one card, the question then its answer, written
 * straight on the card. Tab moves between them, ⌘↵ keeps it, Esc closes. The
 * form stays open for the next card and says how many it made.
 */
export function NewCard({ deck: aimed, onClose }: { deck?: string; onClose: () => void }): React.JSX.Element {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [deck, setDeck] = useState(aimed ?? '')
  const [tags, setTags] = useState('')
  const [made, setMade] = useState(0)
  // Anki's "Basic (and reversed card)": a second card asks the answer first. Kept on for the next card.
  const [both, setBoth] = useState(false)
  const ask = useRef<HTMLTextAreaElement>(null)
  const tag = deckTagOf(deck)
  const marks = [tag, ...tagsIn(tags)].filter(Boolean)
  // The deck's names for its two sides ("English", "Spanish"), when it has them: the deck itself or the nearest one above it.
  const named = useLive(haligtree.tagStudy, null as Awaited<ReturnType<typeof haligtree.tagStudy>> | null, [], ['item'])?.sides ?? {}
  const sides = tag ? named[tag] ?? Object.entries(named).filter(([parent]) => tag.startsWith(`${parent}-`)).sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? null : null
  const save = (): void => {
    if (!question.trim()) return void (ask.current?.focus(), refuse('Write the question first'))
    if (!answer.trim()) return refuse('Write its answer too')
    const card = { term: question.trim(), meaning: marks.length ? `${answer.trim()}\n\n${marks.map((one) => `#${one}`).join(' ')}` : answer.trim(), both }
    void window.api.haligtree<string[]>('cards:list', [card]).then((ids) => {
      chime('added')
      setMade((n) => n + ids.length)
      setQuestion('')
      setAnswer('')
      ask.current?.focus()
      toast(`${ids.length > 1 ? 'Two cards made, one each way,' : 'Card made'}${tag ? ` in the deck ${deckTitle(tag)}` : ''}`, () => void window.api.haligtree('cards:list:undo', ids).then(() => (chime('undo'), setMade((n) => Math.max(0, n - ids.length)))), 'success', undefined, { type: 'nugget', id: ids[0], title: card.term })
    })
  }
  const keys = (event: React.KeyboardEvent): void => {
    // Typing stays in the form; the app's own chords (⌘K, ⌘F) still reach the app.
    if (!event.metaKey && !event.ctrlKey) event.stopPropagation()
    if (event.key === 'Escape') return void (event.preventDefault(), onClose())
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) return void (event.preventDefault(), event.stopPropagation(), save())
  }
  return (
    <CardForm data-new-card head={`New card${tag ? ` in ${deckTitle(tag)}` : ''}`} line={`${sides ? `${sides[0]}, then ${sides[1]}` : 'A question, then its answer'}: one thing a card.`} keys={keys}
      foot={<CardFormFoot mark="new-save" deck={deck} onDeck={(to) => (setDeck(to), ask.current?.focus())} tags={tags} onTags={setTags} both={both} onBoth={setBoth}
        status={made ? <span data-new-made className="tabular-nums">{plural(made, 'card')} made</span> : undefined}
        cancel={made ? 'Done' : 'Cancel'} onCancel={onClose} go="Make the card" ready={!!question.trim() && !!answer.trim()} onGo={save} />}>
      <textarea ref={ask} autoFocus rows={1} value={question} onChange={(event) => setQuestion(event.target.value)}
        placeholder={sides ? sides[0] : 'The question'} aria-label={sides ? sides[0] : 'Question'} data-new-question className={`${CARD_FIELD} font-serif text-2xl leading-snug font-semibold`} />
      <div aria-hidden className="border-t border-dashed border-foreground/15" />
      <textarea rows={2} value={answer} onChange={(event) => setAnswer(event.target.value)}
        placeholder={sides ? sides[1] : 'Its answer'} aria-label={sides ? sides[1] : 'Answer'} data-new-answer className={`${CARD_FIELD} text-body leading-relaxed`} />
    </CardForm>
  )
}
