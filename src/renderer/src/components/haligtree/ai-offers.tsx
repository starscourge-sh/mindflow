import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

import { meets, useCaps, useHas } from '@/lib/needs'
import { useReading } from '@/lib/reads-in'
import { chime } from '@/lib/sound'
import { Orb } from './orb'

/**
 * What Apple Intelligence writes for you on this Mac (main/write.ts), only where
 * the Mac has it: nothing here is drawn at all on a Mac without it, nor listed
 * in What Haligtree can do. Always offered,
 * shown before it is kept, never put in unasked, and said to be written on this Mac.
 */

type Written = { text: string } | { error: string }
const ON_THIS_MAC = 'Written on this Mac by Apple Intelligence, from your notes. Change it as you like.'

/** "Your week, in a paragraph": asked for, read, and kept as the week's summary only with "Keep it". */
export function WeekParagraph({ monday, had, onKeep }: { monday: string; had: string; onKeep: (text: string) => void }): React.JSX.Element | null {
  const has = useHas('ai')
  const [state, setState] = useState<'idle' | 'writing' | Written>('idle')
  useEffect(() => setState('idle'), [monday])
  if (!has) return null
  const ask = (): void => {
    chime('tap')
    setState('writing')
    void window.api.haligtree<Written>('ai:week', monday).then(setState, () => setState({ error: 'It could not be written just now' }))
  }
  return (
    <section data-mac-needs="ai" data-ai-week className="mt-6">
      {state === 'idle' && (
        <button type="button" data-ai-week-ask onClick={ask} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-control font-medium text-foreground/85 transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden /> Your week, in a paragraph
        </button>
      )}
      {state === 'writing' && <Orb label="Writing your week on this Mac…" />}
      {typeof state === 'object' && 'error' in state && <p className="text-control text-muted-foreground">{state.error}.</p>}
      {typeof state === 'object' && 'text' in state && (
        <div data-ai-week-text className="rounded-xl border bg-[color-mix(in_oklab,var(--foreground)_2.5%,transparent)] px-4 py-3">
          <p className="text-body text-foreground text-pretty">{state.text}</p>
          <p className="mt-1.5 text-meta text-muted-foreground">{ON_THIS_MAC}</p>
          <div className="mt-2 flex items-center gap-1.5">
            <button type="button" data-ai-keep className="mf-note-offer-button" onClick={() => (chime('noted'), onKeep(had.trim() ? `${had.trim()}\n\n${state.text}` : state.text), setState('idle'))}>{had.trim() ? 'Add it to the summary' : 'Keep it as the summary'}</button>
            <button type="button" className="mf-note-offer-button" onClick={() => (chime('fold'), setState('idle'))}>Not now</button>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * The room an answer written on this Mac is held in: two lines, from the first frame and for good, so nothing under it
 * ever moves when the words come in (this Mac may take seconds). Longer words end in "…", whole on pointing (`title`).
 */
const WORDS_ROOM = 'h-[2lh] overflow-hidden'
const WORDS_CUT = 'block line-clamp-2'

/**
 * Ask your book, on a question's page: one sentence answering it from the notes found for it, those only, each named.
 * Only where the Mac has Apple Intelligence; elsewhere the notes alone are the answer (offers-about.tsx).
 */
export function AnswerLine({ question, notes }: { question: string; notes: { title: string; words: string }[] }): React.JSX.Element | null {
  const caps = useCaps()
  useReading(caps === null)
  const has = meets(caps, 'ai') && notes.length > 0
  const asked = notes.map((one) => `${one.title}. ${one.words}`)
  const [said, setSaid] = useState<Written | null>(null)
  useEffect(() => {
    if (!has) return
    let live = true
    setSaid(null)
    void window.api.haligtree<Written>('ai:answer', question, asked).then((one) => live && setSaid(one), (error: Error) => live && setSaid({ error: error.message }))
    return () => void (live = false)
  }, [has, question, asked.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!has) return null
  // The notes it read are the list just above, so the answer alone: naming them again after it ran it past two lines,
  // cut mid-word ("…written on"). When the notes do not answer it, the page says so in its own few words.
  const words = said && 'text' in said ? said.text || 'Your notes do not answer this yet.' : said ? `Not answered: ${said.error}.` : null
  const answered = !!said && 'text' in said && !!said.text
  return (
    // Two lines held from the first frame: the orb while this Mac writes, then the answer in that same room.
    <p data-mac-needs="ai" data-ai-answer data-room-held title={answered ? `${words} Written on this Mac from the notes above.` : words ?? undefined} className={`mt-1 ${WORDS_ROOM} text-body ${answered ? 'text-foreground' : 'text-muted-foreground'}`}>
      {words === null ? <Orb label="Asking this Mac from your notes…" /> : <span className={`${WORDS_CUT} animate-in fade-in-0 duration-200`}>{answered && <Sparkles aria-hidden className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" />}{words}</span>}
    </p>
  )
}

/** A name for a note that starts with no words of its own (a picture, a recording), from the words further in. */
export async function nameFor(text: string): Promise<string | null> {
  const said = await window.api.haligtree<Written>('ai:name', text).catch(() => null)
  // The title field the Mac's model filled (main/write.ts `titled`): a name alone, nothing to read out of it.
  return said && 'text' in said ? said.text.trim() || null : null
}

/** The last card of a week's Wrapped: the week in a paragraph, written on this Mac (kept from the Week page). */
export function WrappedParagraph({ monday }: { monday: string }): React.JSX.Element | null {
  const has = useHas('ai')
  const [said, setSaid] = useState<string | null>(null)
  useEffect(() => {
    if (!has) return
    let live = true
    void window.api.haligtree<Written>('ai:week', monday).then((one) => live && 'text' in one && setSaid(one.text), () => undefined)
    return () => void (live = false)
  }, [has, monday])
  if (!has || !said) return null
  return (
    <div data-mac-needs="ai" data-ai-wrapped className="space-y-1.5 pt-2">
      <p className="text-body text-foreground text-pretty">{said}</p>
      <p className="text-meta text-muted-foreground">Written on this Mac by Apple Intelligence, from your notes. Keep it on the Week page.</p>
    </div>
  )
}
