import { useEffect, useState } from 'react'
import { AnswerLine, WhyLine } from './ai-offers'
import { BookOpen, X } from 'lucide-react'

import { call, haligtree } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'
import { chime } from '@/lib/sound'
import { OfferNote } from './note-offers'
import { clock } from '@/lib/clock'
import { toast } from './ui'
import type { MacEvent } from '@/lib/mac-calendar'

/**
 * Notes from your own book on what something is about, by shared root words
 * (main/offers.ts): on a question, "A clue for your question"; on Today, the
 * notes for the next event ("Notes at the right moment"). Offered, never added:
 * a clue is kept only with "Keep as a clue", and each line goes for good with ×.
 * Each note named is a link, as under a note (note-offers.tsx, OfferNote): its
 * card on rest, a click opens it beside, ⌘-click in a new tab.
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
  // Found for which words: a line found for the note before is never shown under this one.
  const [found, setFound] = useState<{ of: string; list: About[] } | null>(null)
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => void haligtree.settings().then((settings) => setOn(settings.noteOffers !== false)), [])
  const of = `${text}|${leave}`
  useEffect(() => {
    if (!text || !on) return
    let live = true
    void call<About[]>('offers:about', text, leave).then((list) => live && setFound({ of, list })).catch(() => live && setFound({ of, list: [] }))
    return () => void (live = false)
  }, [text, leave, on]) // eslint-disable-line react-hooks/exhaustive-deps
  // The page waits for them: a question's clues from your notes came in over its words and pushed them 148px down.
  useReading(on === null || (!!text && on && found?.of !== of))
  return on && text && found?.of === of ? found.list : null
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
              <OfferNote link={one.key} onOpen={onOpen} className="cursor-pointer truncate rounded-sm text-left text-body text-foreground hover:underline">{one.title}</OfferNote>
              <WhyLine question={title} note={`${one.title}. ${one.words}`} />
            </span>
            <button type="button" data-offer-keep className="mf-note-offer-button" onClick={() => void haligtree.addClue(id, `${one.title}: ${one.words}`).then((clue) => (chime('clue'), putAway(`${id}|${one.key}`), setShown(gone()), toast('Kept as a clue', clue ? () => void haligtree.dropClue(clue) : undefined)))}>Keep as a clue</button>
            <button type="button" aria-label="Not it" title="Not it" className="mf-note-offer-close" onClick={() => (chime('fold'), putAway(`${id}|${one.key}`), setShown(gone()))}><X className="size-3.5" /></button>
          </li>
        ))}
      </ul>
      {/* Last in the island: the answer opens to its own height as it comes (WORDS_ROOM), and from here that moves
          only the island's own end, never the clues (it sat over them and pushed them 21 to 72px down as it came). */}
      <AnswerLine question={title} notes={list} />
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
          <span key={one.key}>{at > 0 && ' and '}<OfferNote link={one.key} onOpen={onOpen} className="cursor-pointer rounded-sm font-medium text-foreground hover:underline">{one.title}</OfferNote></span>
        ))}
      </span>
      <button type="button" aria-label="Not for this event" title="Not for this event" className="mf-note-offer-close" onClick={() => (chime('fold'), putAway(`event|${next.title}|${next.start}`), setHidden(gone()))}><X className="size-3.5" /></button>
    </p>
  )
}
