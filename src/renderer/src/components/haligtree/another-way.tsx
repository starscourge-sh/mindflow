import { PlainField, type PlainHandle } from './presets'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { haligtree, type Due } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { Kbd, refuse, toast } from './ui'

/**
 * "Ask another way" (A in Review): one topic asked from many angles, the way
 * a doctor keeps a whole topic on the back and writes "80 different attack
 * angles" at it (Prag), or Anki's Frozen Fields keep the extra while only the
 * question changes. The new card keeps what is behind this one's answer, its source and #tags,
 * so only a question and its answer are written; the box stays open for the
 * next angle, and says how many were made.
 */
/** Written straight onto the card: no box, so the faint italic line stays while the caret is in it and says where. */
const FIELD = 'w-full text-foreground [&_.is-empty]:before:italic [&_.is-empty]:before:font-normal'

export function AnotherWay({ card, onClose }: { card: Due; onClose: () => void }): React.JSX.Element {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [made, setMade] = useState(0)
  const ask = useRef<PlainHandle>(null)
  const reply = useRef<PlainHandle>(null)
  const kept = [(card.context || card.why) && 'what is behind the answer', (card.attribution || card.medium || card.passage) && 'its source', /#[\p{L}\p{N}_-]/u.test(`${card.title} ${JSON.stringify(card.body ?? '')}`) && 'its #tags'].filter(Boolean) as string[]
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
      toast('Card made: it comes up in Review as a new one', () => void haligtree.unlift('nugget', fresh).then(() => setMade((n) => Math.max(0, n - 1))), 'success', undefined, { type: 'nugget', id: fresh, title: question })
    })
  }
  const keys = (event: KeyboardEvent, next?: () => void): void => {
    event.stopPropagation()
    if (event.key === 'Escape') return void (event.preventDefault(), onClose())
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (next) next()
    else save()
  }
  return (
    // A second card under the one asked, in its look: the new question written
    // where a question sits (the serif, no box), its answer under a fold.
    <section data-another-way className="-mt-2 flex flex-col gap-3 rounded-lg border bg-accent/30 px-5 pt-4 pb-3">
      <p className="text-sm text-(--mf-muted-strong)">
        <b className="font-semibold text-foreground">Ask another way.</b>{' '}
        {kept.length ? `The new card keeps ${kept.join(', ').replace(/, ([^,]*)$/, ' and $1')}: write only the question and its answer.` : 'A new question on the same thing: one topic from many angles is how it sticks.'}
      </p>
      <PlainField handle={ask} autoFocus vimStart="insert" value={question} onChange={setQuestion} onKey={(event) => keys(event, () => reply.current?.focus())}
        placeholder="The new question, from another angle" label="New question" data-another-question className={`${FIELD} font-serif text-2xl leading-snug font-semibold`} />
      <div aria-hidden className="border-t border-dashed border-foreground/15" />
      <PlainField handle={reply} vimStart="insert" value={answer} onChange={setAnswer} onKey={(event) => keys(event)}
        placeholder="Its answer" label="Its answer" data-another-answer className={`${FIELD} min-h-[2lh] text-body leading-relaxed`} />
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="cursor-pointer" data-another-save onClick={save}>Make the card</Button>
        <Button variant="ghost" size="sm" className="cursor-pointer text-muted-foreground" onClick={onClose}>{made ? 'Done' : 'Cancel'}</Button>
        <span data-another-made className="ml-auto text-sm text-muted-foreground tabular-nums">
          {made ? `${made} new ${made === 1 ? 'angle' : 'angles'} on this` : <>↵ next field, <Kbd>Esc</Kbd> closes</>}
        </span>
      </div>
    </section>
  )
}
