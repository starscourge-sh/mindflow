import { useState } from 'react'
import { alive } from '@/components/ui/alive-icon'
import LockIcon from '@/components/ui/lock-icon'

import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { notes, type NoteTable } from '@/lib/notes'
import { toast } from './ui'
import { dayMonth, dayjs } from '../../../../main/dates'

/**
 * A decision on its look-again day, or an experiment past its run-until:
 * things come back to you. A decision shows its call and what would justify
 * reopening it, so "still holds" is a two-second answer; an experiment asks
 * what you found. Home, the day's brief and the box all show it the same way.
 */
export type Returning = {
  type: string
  id: string
  title: string
  kind: string
  private: number
  /** The day it came back on. */
  at: string
  call: string
  reopen: string
  question: string
  outcome: string
}

export const returning = (): Promise<Returning[]> => window.api.vigil('returning') as Promise<Returning[]>
/** One for the box, at most once a day each: null when none is due or it is quiet hours. */
export const returningHint = (): Promise<Returning | null> => window.api.vigil('returning:hint') as Promise<Returning | null>

// itshover's drawing, moving when its button is pointed at.
const Lock = alive(LockIcon)

const tableOf = (one: Returning): NoteTable => (one.type === 'capture' ? 'captures' : 'nuggets')
const DAY = 86_400_000

/** What a coming-back card says above its title: "Look again today", "Ran until 3 Oct". */
export const backLine = (one: Returning): string => {
  const today = dayjs(one.at).isSame(dayjs(), 'day')
  return one.kind === 'decision' ? (today ? 'Look again today' : `Look again, since ${dayMonth(one.at)}`) : `Ran until ${dayMonth(one.at)}`
}

/** Several fields at once, and the same back again for the undo. */
async function patch(one: Returning, next: Record<string, string | null>): Promise<() => void> {
  const table = tableOf(one)
  const was = await notes.fields(table, one.id)
  await Promise.all(Object.entries(next).map(([key, value]) => notes.setField(table, one.id, key, value)))
  return () => void Promise.all(Object.keys(next).map((key) => notes.setField(table, one.id, key, was[key] ?? null))).then(() => chime('undo'))
}

/**
 * Still holds: asked again twice as far out as last time, a month at the
 * least and two years at most, so a call that keeps holding fades from view.
 */
export async function stillHolds(one: Returning): Promise<void> {
  const fields = await notes.fields(tableOf(one), one.id)
  const from = Date.parse(String(fields.heldAt ?? fields.decidedAt ?? '')) || Date.parse(one.at) - 90 * DAY
  const gap = Math.min(730 * DAY, Math.max(30 * DAY, 2 * (Date.parse(one.at) - from)))
  const next = dayjs(Date.now() + gap).hour(12).startOf('hour').toISOString()
  const undo = await patch(one, { revisit: next, heldAt: new Date().toISOString() })
  chime('decided')
  toast(`Still holds. It comes back ${dayMonth(next)}`, undo, 'success', {
    label: 'Stop asking', key: 's', run: () => void patch(one, { revisit: null }).then(() => (chime('off'), toast('It will not come back on its own')))
  })
}

/** Reopen: back to deciding, the date it was decided and the look-again let go. */
export async function reopen(one: Returning): Promise<void> {
  const undo = await patch(one, { state: 'Deciding', decidedAt: null, revisit: null })
  chime('weigh')
  toast('Reopened: weigh it up again under “Working out”', undo)
}

/** Finished, with what you found if you said it. */
export async function finish(one: Returning, found: string): Promise<void> {
  const undo = await patch(one, { status: 'Finished', ...(found.trim() ? { outcome: found.trim() } : {}) })
  chime('finding')
  toast(found.trim() || one.outcome ? 'Finished, and the finding is kept' : 'Finished. Write the outcome when it comes to you', undo)
}

/** Keep going: a week more, from today if the date has passed. */
export async function keepGoing(one: Returning): Promise<void> {
  const next = dayjs(Math.max(Date.parse(one.at), Date.now())).add(7, 'day').hour(12).startOf('hour').toISOString()
  const undo = await patch(one, { until: next })
  chime('trial')
  toast(`Running until ${dayMonth(next)}`, undo)
}

/**
 * The body of a coming-back card, under its title: the call and the reopen
 * condition with Still holds and Reopen, or the question and "What did you
 * find?" with Finish and Keep going. `onOpen` follows Reopen to the note;
 * `onDone` is told once it is settled, and offers Not now.
 */
export function KindBack({ one, onOpen, onDone, flush }: {
  one: Returning
  onOpen?: (type: string, id: string) => void
  onDone?: () => void
  /** In a list whose rows start flush: the buttons' own inset is taken back, so their words line up with the text above. */
  flush?: boolean
}): React.JSX.Element {
  const [found, setFound] = useState(one.outcome)
  const then = (work: Promise<void>): void => void work.then(() => onDone?.())
  const line = (label: string, text: string, empty: string): React.JSX.Element => (
    <p className="text-xs leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground/80">{label}</span>{' '}
      <span className={`private-text ${text ? 'text-foreground' : 'italic'}`}>{text || empty}</span>
    </p>
  )
  if (one.kind === 'decision')
    return (
      <div className="flex flex-col gap-1">
        {line('The call:', one.call, 'not written down')}
        {line('Reopen only if:', one.reopen, 'nothing said, so ask whether anything has changed')}
        <div className={`mt-1.5 flex items-center gap-1 ${flush ? '-ml-2' : ''}`}>
          <Button variant="ghost" size="sm" className="text-foreground" onClick={() => then(stillHolds(one))}><Lock className="size-3" /> Still holds</Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => then(reopen(one).then(() => onOpen?.(one.type, one.id)))}>Reopen</Button>
          {onDone && <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => (chime('fold'), onDone())}>Not now</Button>}
        </div>
      </div>
    )
  return (
    <div className="flex flex-col gap-1.5">
      {one.question && line('Asking:', one.question, '')}
      <textarea
        rows={1}
        value={found}
        onChange={(event) => setFound(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            then(finish(one, found))
          }
        }}
        placeholder="What did you find?"
        aria-label="What did you find?"
        className="private-text w-full resize-none rounded-md bg-foreground/[0.05] px-2.5 py-1.5 text-control text-foreground outline-none [field-sizing:content] placeholder:text-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      <div className={`flex items-center gap-1 ${flush ? '-ml-2' : ''}`}>
        <Button variant="ghost" size="sm" className="text-foreground" onClick={() => then(finish(one, found))}>Finish</Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => then(keepGoing(one))}>Keep going a week</Button>
        {onDone && <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => (chime('fold'), onDone())}>Not now</Button>}
      </div>
    </div>
  )
}
