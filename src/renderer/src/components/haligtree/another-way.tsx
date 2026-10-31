import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { haligtree, type Due } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { Kbd, refuse, toast } from './ui'

/**
 * "Ask another way" (A in Review): one topic asked from many angles, the way
 * a doctor keeps a whole topic on the back and writes "80 different attack
 * angles" at it (Prag), or Anki's Frozen Fields keep the extra while only the
 * question changes. The new card keeps this one's context, source and #tags,
 * so only a question and its answer are written; the box stays open for the
 * next angle, and says how many were made.
 */
export function AnotherWay({ card, onClose }: { card: Due; onClose: () => void }): React.JSX.Element {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [made, setMade] = useState(0)
  const ask = useRef<HTMLTextAreaElement>(null)
  const kept = [card.context && 'its context', (card.attribution || card.medium || card.passage) && 'its source', /#[\p{L}\p{N}_-]/u.test(`${card.title} ${JSON.stringify(card.body ?? '')}`) && 'its #tags'].filter(Boolean) as string[]
  const save = (): void => {
    if (!question.trim()) return void (ask.current?.focus(), refuse('Write the new question first'))
    if (!answer.trim()) return refuse('Write its answer too')
    void haligtree.another(card.id, question, answer).then((fresh) => {
      if (!fresh) return refuse('This card is not there any more')
      chime('added')
      setMade((n) => n + 1)
      setQuestion('')
      setAnswer('')
      ask.current?.focus()
      toast('A new card on the same thing: it comes up as a new card', () => void haligtree.unlift('nugget', fresh).then(() => setMade((n) => Math.max(0, n - 1))))
    })
  }
  const keys = (event: React.KeyboardEvent<HTMLTextAreaElement>, next?: () => void): void => {
    event.stopPropagation()
    if (event.key === 'Escape') return void (event.preventDefault(), onClose())
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (next) next()
    else save()
  }
  return (
    <section data-another-way className="-mt-2 flex flex-col gap-2 rounded-lg border px-4 py-3">
      <p className="text-body font-medium text-foreground">Ask another way</p>
      <p className="-mt-1.5 text-sm text-muted-foreground">
        {kept.length ? `The new card keeps ${kept.join(', ').replace(/, ([^,]*)$/, ' and $1')}: write only the question and its answer.` : 'A new question on the same thing: one topic from many angles is how it sticks.'}
      </p>
      <Textarea ref={ask} autoFocus rows={1} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => keys(event, () => document.querySelector<HTMLTextAreaElement>('[data-another-answer]')?.focus())}
        placeholder="The new question, from another angle" aria-label="New question" data-another-question className="min-h-0 resize-none text-body" />
      <Textarea rows={2} value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => keys(event)}
        placeholder="Its answer" aria-label="Its answer" data-another-answer className="resize-none text-body" />
      <div className="flex items-center gap-2">
        <Button size="sm" data-another-save onClick={save}>Make the card</Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onClose}>{made ? 'Done' : 'Cancel'}</Button>
        <span data-another-made className="ml-auto text-sm text-muted-foreground tabular-nums">
          {made ? `${made} new ${made === 1 ? 'angle' : 'angles'} on this` : <>↵ next field, <Kbd>Esc</Kbd> closes</>}
        </span>
      </div>
    </section>
  )
}
