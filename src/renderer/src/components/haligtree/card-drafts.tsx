import { Check } from 'lucide-react'
import { chime } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { num, plural } from '../../../../main/dates'
import './card-drafts.css'

/** A drafted card, shown to keep, change or drop: none is made until it is kept. */
export type CardDraft = { question: string; answer: string; state: 'open' | 'kept' | 'dropped' }

/**
 * The one list of drafted cards, for "Five cards from a chapter" in the reader
 * (pdf/chapter-cards.tsx) and study questions from a note (note-questions.tsx):
 * each question and answer can be changed in place, then kept (a card in
 * Review) or dropped (with a way back); `link` says where each came from.
 */
export function DraftList<T extends CardDraft>({ cards, onSet, onKeep, link }: {
  cards: T[]
  onSet: (n: number, patch: Partial<T>) => void
  onKeep: (n: number) => void
  link: (one: T) => { label: string; run: () => void; mark?: Record<string, string | number> }
}): React.JSX.Element {
  return (
    <ol className="chapter-cards-list">
      {cards.map((one, n) => {
        const from = link(one)
        return (
          <li key={n} data-chapter-card={one.state} className="chapter-card">
            {one.state === 'dropped' ? (
              <p className="chapter-card-gone">Dropped. <button type="button" className="chapter-card-link" onClick={() => (chime('undo'), onSet(n, { state: 'open' } as Partial<T>))}>Bring it back</button></p>
            ) : (
              <>
                <textarea aria-label="Question" rows={1} className="chapter-card-question" value={one.question} readOnly={one.state === 'kept'}
                  onChange={(event) => onSet(n, { question: event.target.value } as Partial<T>)}
                  onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), onKeep(n))} />
                <textarea aria-label="Answer" rows={1} className="chapter-card-answer" value={one.answer} readOnly={one.state === 'kept'}
                  onChange={(event) => onSet(n, { answer: event.target.value } as Partial<T>)}
                  onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), onKeep(n))} />
                <div className="chapter-card-foot">
                  <button type="button" className="chapter-card-link" {...from.mark} onClick={() => (chime('tap'), from.run())}>{from.label}</button>
                  {one.state === 'kept' ? (
                    <span className="chapter-card-kept"><Check className="size-3.5" /> Made, in Review</span>
                  ) : (
                    <span className="chapter-card-actions">
                      <Button variant="ghost" size="sm" data-chapter-card-drop onClick={() => (chime('fold'), onSet(n, { state: 'dropped' } as Partial<T>))}>Drop</Button>
                      <Button variant="outline" size="sm" data-chapter-card-keep disabled={!one.question.trim() || !one.answer.trim()} onClick={() => onKeep(n)}>Keep</Button>
                    </span>
                  )}
                </div>
              </>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** The list's foot: how many are made, and keeping the rest at once (or Done once one is left). */
export function DraftFoot({ cards, onKeepAll, onDone }: { cards: CardDraft[]; onKeepAll: () => void; onDone: () => void }): React.JSX.Element {
  const open = cards.filter((one) => one.state === 'open').length
  const kept = cards.filter((one) => one.state === 'kept').length
  return (
    <div className="chapter-cards-foot">
      <span className="chapter-cards-count">{kept ? `${plural(kept, 'card')} made` : 'None made yet'}</span>
      {open > 1 ? (
        <Button size="sm" data-chapter-cards-all onClick={onKeepAll}>{`Keep the ${num(open)} left`}</Button>
      ) : (
        <Button size="sm" variant="outline" onClick={onDone}>Done</Button>
      )}
    </div>
  )
}
