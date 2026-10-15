import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'

import { chime } from '@/lib/sound'
import { vigil, type Due, type Item } from '@/lib/vigil'
import { closeness, suggestGrade } from '../../../../main/study'
import { num } from '../../../../main/dates'
import { textOf } from '../rot-cards'
import { MindflowEditor } from '../mindflow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProgressBar } from './progress-bar'
import { Kbd, Pressed, toast, typing } from './ui'
import { TAG } from '../../../../main/tag-words'
import { clip } from '../../../../main/clip'

/** A card's answer as one short line, for a choice or a typed check. */
export const answerLine = (body: unknown): string => {
  const text = textOf(body).replace(new RegExp(`#${TAG}`, 'gu'), '').replace(/\s+/g, ' ').trim()
  return clip(text, 140)
}

type Step = { card: Due; kind: 'choice' | 'written' }

/**
 * Learn mode: the new cards, learnt before they join the schedule. Each is
 * asked twice, first as a choice of answers and then written out; a miss
 * comes round again a little later. Once both are right it is learnt, and
 * graded for its first time (Good, or Hard if it was ever missed). The bar
 * fills with every right answer.
 */
export function LearnMode({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [cards, setCards] = useState<Due[] | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [right, setRight] = useState(0)
  const [missed, setMissed] = useState<Set<string>>(new Set())
  const [said, setSaid] = useState<{ ok: boolean; picked?: string } | null>(null)
  const [typed, setTyped] = useState('')
  const started = useRef(Date.now())
  useEffect(() => void vigil.round('new').then((found) => {
    const some = found.slice(0, 8)
    setCards(some)
    setSteps(some.map((card) => ({ card, kind: some.length > 1 ? 'choice' : 'written' })))
  }), [])
  const step = steps[0]
  // Left partway: what was learnt is kept, and the rest stay new for next time.
  const leave = (): void => {
    if (step && cards?.length) toast(right ? `${num(right)} of ${num(total)} right so far. The rest stay new for next time` : 'The new cards stay new for next time')
    onDone()
  }
  const total = (cards?.length ?? 0) * ((cards?.length ?? 0) > 1 ? 2 : 1)
  // The choices: the right answer and up to three others, in an order fixed for this step.
  const choices = useMemo(() => {
    if (!step || step.kind !== 'choice' || !cards) return []
    const others = cards.filter((one) => one.id !== step.card.id).map((one) => answerLine(one.body)).filter(Boolean)
    const pool = [answerLine(step.card.body), ...others.sort(() => Math.random() - 0.5).slice(0, 3)]
    return pool.sort(() => Math.random() - 0.5)
  }, [step, cards])

  const answer = (ok: boolean, picked?: string): void => {
    if (!step || said) return
    chime(ok ? 'good' : 'again')
    setSaid({ ok, picked })
    if (ok) setRight((n) => n + 1)
    else setMissed((all) => new Set(all).add(step.card.id))
  }
  const next = (): void => {
    if (!step || !said) return
    const rest = steps.slice(1)
    if (!said.ok) rest.splice(Math.min(2, rest.length), 0, step)
    else if (step.kind === 'choice') rest.push({ card: step.card, kind: 'written' })
    else void vigil.grade(step.card.id, missed.has(step.card.id) ? 2 : 3, Date.now() - started.current)
    if (!rest.length) chime('reviewed')
    setSteps(rest)
    setSaid(null)
    setTyped('')
    started.current = Date.now()
  }
  const check = (): void => {
    if (!step || said || !typed.trim()) return
    answer(suggestGrade(closeness(typed, answerLine(step.card.body))) >= 3)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey) return
      if (said && (event.key === 'Enter' || (event.key === ' ' && !typing()))) {
        event.preventDefault()
        return next()
      }
      if (step?.kind === 'choice' && !said && /^[1-4]$/.test(event.key) && choices[Number(event.key) - 1]) {
        event.preventDefault()
        const picked = choices[Number(event.key) - 1]
        answer(picked === answerLine(step.card.body), picked)
      }
      if (event.key === 'Escape' && !typing()) leave()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!cards) return <div />
  return (
    <section aria-label="Learn mode" data-learn-mode className="flex flex-col gap-5 px-5 pt-6 pb-8">
      <div className="flex items-center gap-3 text-sm">
        <p className="flex-1"><strong className="font-semibold">Learn mode.</strong> <span className="text-muted-foreground">Each new card twice, picked then written, until it is learnt.</span></p>
        <Button variant="ghost" size="sm" onClick={leave}>Leave <Kbd>Esc</Kbd></Button>
      </div>
      {total > 0 && <ProgressBar value={Math.min(1, right / total)} label={`${right} of ${total} right`} thick={4} />}
      {!step ? (
        <div className="flex flex-col items-start gap-3" data-learn-done>
          <h2 className="font-heading text-title font-semibold tracking-[-0.018em]">{cards.length ? `All ${num(cards.length)} learnt` : 'No new cards to learn'}</h2>
          <p className="text-sm text-muted-foreground">{cards.length ? 'They are in your schedule now, and come back in Review when they are due.' : 'Give a gem a question and it waits here as a new card.'}</p>
          <Button variant="outline" size="sm" onClick={onDone}>Back to Review</Button>
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-accent/30 px-5 py-6">
            <p className="text-xs text-muted-foreground">{step.kind === 'choice' ? 'Pick the answer' : 'Write the answer'}</p>
            <h2 className="mt-1 font-heading text-title font-semibold tracking-[-0.018em] text-balance">{step.card.prompt}</h2>
          </div>
          {step.kind === 'choice' ? (
            <div className="grid gap-2" data-choices>
              {choices.map((choice, at) => {
                const isRight = choice === answerLine(step.card.body)
                const tone = said && (isRight ? 'border-[var(--tt-color-text-green)] bg-[color-mix(in_srgb,var(--tt-color-text-green)_10%,var(--background))]' : said.picked === choice ? 'border-[var(--tt-color-text-red)] bg-[color-mix(in_srgb,var(--tt-color-text-red)_8%,var(--background))]' : 'opacity-60')
                return (
                  <button key={choice} type="button" disabled={!!said} onClick={() => answer(isRight, choice)}
                    className={`relative flex items-start gap-3 rounded-md border bg-background px-3 py-2.5 text-left text-sm transition-colors enabled:hover:bg-accent/50 ${tone || ''}`}>
                    <Kbd className="mt-0.5 shrink-0">{at + 1}</Kbd>
                    <span className="min-w-0 flex-1">{choice}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Input autoFocus value={typed} disabled={!!said} onChange={(event) => setTyped(event.target.value)} placeholder="In your own words is fine"
                onKeyDown={(event) => event.key === 'Enter' && !said && (event.preventDefault(), event.stopPropagation(), check())} className="h-10 text-base" />
              {said && (
                <div className="rounded-lg border px-4 py-3 text-sm [--mf-padding:0] [&_.tiptap-word-count]:hidden">
                  <p className="mb-1 text-xs text-muted-foreground">The answer</p>
                  <MindflowEditor defaultContent={(step.card.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
                </div>
              )}
            </div>
          )}
          {said ? (
            <div className="flex items-center gap-3">
              <p className={`flex-1 text-base font-semibold ${said.ok ? 'text-[var(--tt-color-text-green)]' : 'text-[var(--tt-color-text-orange)]'}`}>
                {said.ok ? 'Right.' : 'Not this time: it comes round again shortly.'}
              </p>
              <Button size="sm" onClick={next}>Continue <Kbd>↵</Kbd></Button>
            </div>
          ) : step.kind === 'written' && <Button size="sm" className="self-start" onClick={check}>Check <Kbd>↵</Kbd></Button>}
        </>
      )}
    </section>
  )
}

/**
 * Practise a tag without counting: its cards one after another, the answer
 * on Space, and nothing scheduled or graded. J or → for the next, K or ← for
 * the one before, Esc to stop.
 */
export function PractiseTag({ tag, onClose }: { tag: string; onClose: () => void }): React.JSX.Element {
  const [cards, setCards] = useState<(Item & { body: unknown })[] | null>(null)
  const [at, setAt] = useState(0)
  const [shown, setShown] = useState(false)
  useEffect(() => void vigil.tagCards(tag).then(setCards), [tag])
  const go = (by: number): void => {
    if (!cards?.length) return
    const to = Math.max(0, Math.min(cards.length - 1, at + by))
    if (to === at) return void chime('nope')
    chime('page')
    setAt(to)
    setShown(false)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || typing()) return
      const run = { ' ': () => (shown ? go(1) : (chime('reveal'), setShown(true))), j: () => go(1), ArrowRight: () => go(1), k: () => go(-1), ArrowLeft: () => go(-1), Escape: onClose }[event.key]
      if (!run) return
      event.preventDefault()
      event.stopPropagation()
      run()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  if (!cards) return <div />
  const card = cards[at]
  return (
    <section aria-label="Practise" data-practise className="flex flex-col gap-4 px-5 py-6">
      <div className="flex items-center gap-3 text-sm">
        <p className="flex-1"><strong className="font-semibold">Practise #{tag}.</strong> <span className="text-muted-foreground">Nothing here is counted or scheduled.</span></p>
        <span className="text-muted-foreground tabular-nums">{cards.length ? `${num(at + 1)} of ${num(cards.length)}` : ''}</span>
        <Button variant="ghost" size="sm" onClick={onClose}>Stop <Kbd>Esc</Kbd></Button>
      </div>
      {!card ? <p className="text-sm text-muted-foreground">No card carries #{tag} yet. Give one of its gems a question, or write a line as question :: answer.</p> : (
        <>
          <div className="rounded-lg border bg-accent/30 px-5 py-6">
            <h2 className="font-heading text-title font-semibold tracking-[-0.018em] text-balance">{card.prompt}</h2>
          </div>
          {shown ? (
            <div key={card.id} className="rounded-lg border bg-accent/30 [--mf-padding:0.625rem_1rem_0.625rem_1.25rem] [&_.tiptap-word-count]:hidden" data-practise-answer>
              <MindflowEditor defaultContent={(card.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
            </div>
          ) : (
            <Button variant="outline" size="lg" onClick={() => (chime('reveal'), setShown(true))} className="self-start text-sm text-muted-foreground">Show the answer <Kbd>Space</Kbd></Button>
          )}
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Pressed keys="J" /> next <Pressed keys="K" /> back</p>
        </>
      )}
    </section>
  )
}
