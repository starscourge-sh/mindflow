import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'

import { AnimatePresence, motion } from 'motion/react'

import { MindflowEditor } from '../mindflow'
import { chime } from '@/lib/sound'
import { interval, vigil, type Due } from '@/lib/vigil'
import { Empty, Kbd, Page, toast, typing } from './ui'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'

/** The four grades, as the plan defines them: how the retrieval felt, not whether it was right. */
const GRADES = [
  { grade: 1, label: 'Again', hint: 'Could not recall it', tone: 'var(--tt-color-text-red)' },
  { grade: 2, label: 'Hard', hint: 'Got it, barely', tone: 'var(--tt-color-text-orange)' },
  { grade: 3, label: 'Good', hint: 'Normal effort', tone: 'var(--tt-color-text-green)' },
  { grade: 4, label: 'Easy', hint: 'Instant', tone: 'var(--tt-color-text-blue)' }
] as const

/**
 * The review session, the one surface allowed a definition of done. One card:
 * the prompt, then Space for the answer, then a grade. The queue is taken once
 * when the session starts and capped by the day's limits, so it can always be
 * finished, and an item stays in front of you until you grade it.
 */
export function ReviewView(): React.JSX.Element {
  const [queue, setQueue] = useState<Due[] | null>(null)
  const [at, setAt] = useState(0)
  const [shown, setShown] = useState(false)
  // Explain it back: your own words first, then the answer beside them.
  const [said, setSaid] = useState('')
  const started = useRef(Date.now())
  useEffect(() => void vigil.queue().then(setQueue), [])
  const card = queue?.[at]

  const reveal = (): void => {
    if (shown) return
    chime('reveal')
    setShown(true)
    // Out of the box, so 1 to 4 grade straight away.
    ;(document.activeElement as HTMLElement | null)?.blur()
  }
  const grade = (value: 1 | 2 | 3 | 4): void => {
    if (!card || !shown) return
    void vigil.grade(card.id, value, Date.now() - started.current)
    chime((['again', 'hard', 'good', 'easy'] as const)[value - 1])
    // Again is not failure, it is a short gap: the card comes round once more
    // before the session ends.
    if (value === 1) setQueue((cards) => [...(cards ?? []), card])
    setShown(false)
    setSaid('')
    setAt((index) => index + 1)
    started.current = Date.now()
  }
  // Bury: not today. The schedule is untouched; it is back tomorrow.
  const bury = (): void => {
    if (!card) return
    void vigil.bury(card.id).then(() => toast('Buried until tomorrow'))
    setShown(false)
    setSaid('')
    setAt((index) => index + 1)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey) return
      // Never while typing: in the prompt the editor sits beside the review.
      if (typing()) return
      if (event.key === ' ' && card) {
        event.preventDefault()
        reveal()
      }
      if (['1', '2', '3', '4'].includes(event.key)) grade(Number(event.key) as 1 | 2 | 3 | 4)
      if (event.key === 'b') bury()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!queue) return <Page title="Review"><div /></Page>
  if (!card)
    return (
      <Page title="Review">
        {queue.length ? (
          <Empty shape={['star', 2]} title={`Done: ${queue.length} reviewed`}>
            That is today’s queue finished. What you could not recall comes back soonest; the rest waits until just before you would forget it.
          </Empty>
        ) : (
          <Empty shape={['moon', 1]} title="Nothing to review">
            Review holds only what you chose to be tested on. Open a nugget and write it a question, and it joins the queue tomorrow at the latest.
          </Empty>
        )}
      </Page>
    )

  return (
    <Page title="Review" count={queue.length - at}>
      <div className="h-0.5 bg-border">
        <div className="h-full bg-[var(--tt-brand-color-400)] transition-[width] duration-300" style={{ width: `${(at / queue.length) * 100}%` }} />
      </div>
      <AnimatePresence mode="wait">
      <motion.div
        key={`${card.id}-${at}`}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -24 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-[10vh]"
      >
        <h2 className="text-2xl leading-snug font-semibold text-balance">{card.prompt}</h2>
        {card.lapses >= 4 && (
          <p className="-mt-3 text-sm text-[var(--tt-color-text-orange)]">
            Forgotten {card.lapses} times. If it goes again, rewrite the prompt rather than drilling it.
          </p>
        )}

        {shown ? (
          <>
            {said.trim() && (
              <div className="-mb-2 flex items-start gap-3 text-sm text-muted-foreground">
                <p className="flex-1 whitespace-pre-line">You said: {said}</p>
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() =>
                  void vigil.gloss(card.id, said.trim()).then(() => {
                    setSaid('')
                    toast('Kept as a gloss')
                  })
                }>Keep as a gloss</Button>
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-xl border bg-accent/30"
            >
              <MindflowEditor
                defaultContent={(card.body as JSONContent | string | null) ?? ''}
                readOnly
                toolbar={false}
                handles={false}
                slash={false}
                outline={false}
                search={false}
                autofocus={false}
              />
            </motion.div>
            {/* Context: what makes the answer learnable, shown only after it, or
                it would give the prompt away. */}
            {card.context && <p className="-mt-2 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{card.context}</p>}
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map(({ grade: value, label, hint, tone }) => (
                <Tip key={value} label={hint}>
                <button
                  type="button"
                
                  onClick={() => grade(value)}
                  className="flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 transition-all hover:-translate-y-px hover:bg-accent active:translate-y-0"
                >
                  <span className="font-medium" style={{ color: tone }}>{label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {interval(card.intervals[value])} · <Kbd>{value}</Kbd>
                  </span>
                </button>
                </Tip>
              ))}
            </div>
          </>
        ) : (
          <>
          <Textarea
            value={said}
            onChange={(event) => setSaid(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.metaKey) {
                event.preventDefault()
                reveal()
              } else if (event.key === 'Escape') event.currentTarget.blur()
            }}
            rows={3}
            placeholder="Say it back in your own words first, if you like. ⌘↵ to check."
            className="resize-none text-[15px]"
          />
          <Button variant="outline" size="lg"
 onClick={reveal}
 className="self-start text-sm text-muted-foreground"
>
            Show the answer <Kbd>Space</Kbd>
          </Button>
          </>
        )}
        {!shown && (
          <Button variant="ghost" size="sm" onClick={bury} className="-mt-3 self-start text-muted-foreground">
            Not today <Kbd>B</Kbd>
          </Button>
        )}
      </motion.div>
      </AnimatePresence>
    </Page>
  )
}
