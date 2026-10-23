import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { notes, type NoteTable } from '@/lib/notes'
import { toast } from './ui'
import { dayMonth, dayjs } from '../../../../main/dates'

/**
 * A Check back on its day: a date, then a question back to you. It shows
 * what it asks and what you said last time, takes your answer in place, and
 * can ask again later. Home, the day's brief and the box all show it the same way.
 */
export type Returning = {
  type: string
  id: string
  title: string
  kind: string
  private: number
  /** The day it came back on. */
  at: string
  /** What it asks you. */
  ask: string
  /** What you said last time, if it asked before. */
  answer: string
}

export const returning = (): Promise<Returning[]> => window.api.haligtree<Returning[]>('returning')
/** One for the box, at most once a day each: null when none is due or it is quiet hours. */
export const returningHint = (): Promise<Returning | null> => window.api.haligtree<Returning | null>('returning:hint')

const tableOf = (one: Returning): NoteTable => (one.type === 'capture' ? 'captures' : 'nuggets')

/** What a coming-back card says above its title: "Check back today", "Check back, since 3 Oct". */
export const backLine = (one: Returning): string =>
  dayjs(one.at).isSame(dayjs(), 'day') ? 'Check back today' : `Check back, since ${dayMonth(one.at)}`

/** Several fields at once, and the same back again for the undo. */
async function patch(one: Returning, next: Record<string, string | null>): Promise<() => void> {
  const table = tableOf(one)
  const was = await notes.fields(table, one.id)
  await Promise.all(Object.entries(next).map(([key, value]) => notes.setField(table, one.id, key, value)))
  return () => void Promise.all(Object.keys(next).map((key) => notes.setField(table, one.id, key, (was[key] as string | undefined) ?? null))).then(() => chime('undo'))
}

/** Asked again later: a new day, from today if the day has passed. */
export async function askAgain(one: Returning, days: number): Promise<void> {
  const next = dayjs(Math.max(Date.parse(one.at), Date.now())).add(days, 'day').hour(12).startOf('hour').toISOString()
  const undo = await patch(one, { back: next })
  chime('pin')
  toast(`It asks again on ${dayMonth(next)}`, undo)
}

/** Answered: what you said kept under it, and it does not come back unless asked to. */
export async function answer(one: Returning, said: string, onUndo?: (said: string) => void): Promise<void> {
  const words = said.trim()
  const undo = await patch(one, { answeredAt: new Date().toISOString(), ...(words ? { answer: words } : {}) })
  chime('finding')
  // Undone, what you wrote is handed back for its field, not thrown away with the answer.
  toast(words ? 'Answered, and kept under it' : 'Answered. Write what you found when it comes to you', () => (undo(), onUndo?.(said)), 'success', {
    label: 'Ask again in a month', key: 'a', run: () => void askAgain(one, 30)
  })
}

/**
 * The body of a coming-back card, under its title: its question, your answer,
 * then "Answer" or "Ask again in a week". `onDone` is told once it is
 * settled, and offers "Not now".
 */
export function KindBack({ one, onDone, flush, again, onUndone }: {
  one: Returning
  onOpen?: (type: string, id: string) => void
  onDone?: () => void
  /** An answer taken back with Undo: its words, in the field again. */
  again?: string
  /** Answering here was undone: the card is wanted back with what was written. */
  onUndone?: (said: string) => void
  /** In a list whose rows start flush: the buttons' own inset is taken back, so their words line up with the text above. */
  flush?: boolean
}): React.JSX.Element {
  const [said, setSaid] = useState(again ?? '')
  const back = (words: string): void => (setSaid(words), onUndone?.(words))
  const then = (work: Promise<void>): void => void work.then(() => onDone?.())
  const line = (label: string, text: string): React.JSX.Element => (
    <p className="text-xs leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground/80">{label}</span>{' '}
      <span className="private-text text-foreground">{text}</span>
    </p>
  )
  return (
    <div data-check-back className="flex flex-col gap-1.5">
      {line('It asks:', one.ask || 'How did it go?')}
      {one.answer && line('Last time:', one.answer)}
      <textarea
        rows={1}
        value={said}
        onChange={(event) => setSaid(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            then(answer(one, said, back))
          }
        }}
        placeholder="Your answer"
        aria-label="Your answer"
        className="private-text w-full resize-none rounded-md bg-foreground/[0.05] px-2.5 py-1.5 text-control text-foreground outline-none [field-sizing:content] placeholder:text-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      <div className={`flex items-center gap-1 ${flush ? '-ml-2' : ''}`}>
        <Button variant="ghost" size="sm" className="text-foreground" onClick={() => then(answer(one, said, back))}>Answer</Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => then(askAgain(one, 7))}>Ask again in a week</Button>
        {onDone && <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => (chime('fold'), onDone())}>Not now</Button>}
      </div>
    </div>
  )
}
