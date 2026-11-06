import { useEffect, useState } from 'react'
import { WhyLine } from './ai-offers'
import { BookOpen, X } from 'lucide-react'

import { call, haligtree } from '@/lib/haligtree'
import { follow } from '@/lib/capture-links'
import { chime } from '@/lib/sound'
import { clock } from '@/lib/clock'
import { toast } from './ui'
import type { MacEvent } from '@/lib/mac-calendar'

/**
 * Notes from your own book on what something is about, by shared root words
 * (main/offers.ts): on a question, "A clue for your question"; on Today, the
 * notes for the next event ("Notes at the right moment"). Offered, never added:
 * a clue is kept only with "Keep as a clue", and each line goes for good with ×.
 */

type About = { key: string; title: string; words: string }
const SEEN = 'offers-about:dismissed'
const gone = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
const putAway = (id: string): void => localStorage.setItem(SEEN, JSON.stringify([...gone(), id].slice(-500)))

function useAbout(text: string | null, leave?: string): About[] | null {
  const [found, setFound] = useState<About[] | null>(null)
  const [on, setOn] = useState(true)
  useEffect(() => void haligtree.settings().then((settings) => setOn(settings.noteOffers !== false)), [])
  useEffect(() => {
    if (!text || !on) return setFound(null)
    let live = true
    void call<About[]>('offers:about', text, leave).then((list) => live && setFound(list)).catch(() => undefined)
    return () => void (live = false)
  }, [text, leave, on])
  return found
}

/** On a question's page: notes of yours that may answer it, each kept as a clue only when asked. */
export function QuestionClues({ id, title, onOpen }: { id: string; title: string; onOpen: (type: string, id: string) => void }): React.JSX.Element | null {
  const found = useAbout(title, `question:${id}`)
  const [shown, setShown] = useState<Set<string>>(() => gone())
  const list = (found ?? []).filter((one) => !shown.has(`${id}|${one.key}`))
  if (!list.length) return null
  return (
    <section data-offer-clues aria-label="From your notes" className="mt-4 rounded-xl border bg-[color-mix(in_oklab,var(--foreground)_2.5%,transparent)] px-3.5 py-3">
      <p className="text-control text-muted-foreground"><b className="font-medium text-foreground">From your notes.</b> A clue for this question?</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {list.map((one) => (
          <li key={one.key} data-offer-clue={one.key} className="flex items-center gap-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <button type="button" className="cursor-pointer truncate rounded-sm text-left text-body text-foreground hover:underline" onClick={() => (chime('open'), follow(one.key, onOpen))}>{one.title}</button>
              <WhyLine question={title} note={`${one.title}. ${one.words}`} />
            </span>
            <button type="button" data-offer-keep className="mf-note-offer-button" onClick={() => void haligtree.addClue(id, `${one.title}: ${one.words}`).then((clue) => (chime('clue'), putAway(`${id}|${one.key}`), setShown(gone()), toast('Kept as a clue', clue ? () => void haligtree.dropClue(clue) : undefined)))}>Keep as a clue</button>
            <button type="button" aria-label="Not it" title="Not it" className="mf-note-offer-close" onClick={() => (chime('fold'), putAway(`${id}|${one.key}`), setShown(gone()))}><X className="size-3.5" /></button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** On Today: the next event's notes, a line before it ("Seminar at 14:00: your notes on Stoicism"). */
export function EventNotes({ events, now, onOpen }: { events: MacEvent[]; now: Date; onOpen: (type: string, id: string) => void }): React.JSX.Element | null {
  const next = events.find((one) => !one.allDay && new Date(one.start) > now)
  const found = useAbout(next?.title ?? null)
  const [hidden, setHidden] = useState(() => gone())
  if (!next || !found?.length || hidden.has(`event|${next.title}|${next.start}`)) return null
  return (
    <p data-event-notes className="mf-note-offer mt-3">
      <BookOpen aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        <b className="font-medium text-foreground">{next.title} at {clock(next.start)}:</b> your notes on{' '}
        {found.slice(0, 2).map((one, at) => (
          <span key={one.key}>{at > 0 && ' and '}<button type="button" className="cursor-pointer rounded-sm font-medium text-foreground hover:underline" onClick={() => (chime('open'), follow(one.key, onOpen))}>{one.title}</button></span>
        ))}
      </span>
      <button type="button" aria-label="Not for this event" title="Not for this event" className="mf-note-offer-close" onClick={() => (chime('fold'), putAway(`event|${next.title}|${next.start}`), setHidden(gone()))}><X className="size-3.5" /></button>
    </p>
  )
}
