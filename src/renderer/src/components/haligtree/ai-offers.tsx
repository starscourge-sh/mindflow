import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

import { meets, useCaps, useHas } from '@/lib/needs'
import { useReading } from '@/lib/reads-in'
import { chime } from '@/lib/sound'
import { Orb } from './orb'

/**
 * What Apple Intelligence writes for you on this Mac (main/write.ts), only where
 * the Mac has it: nothing here is drawn at all on a Mac without it (What
 * Haligtree can do says "Needs Apple Intelligence" instead). Always offered,
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
 * The room an answer written on this Mac is held in: two lines from the first frame, then its own height once its
 * words are in, the height eased (interpolate-size lets `auto` ease) so the lines under it glide down rather than jump.
 * With Reduce motion, or Motion off, it is simply its height.
 */
const WORDS_ROOM = 'overflow-hidden [interpolate-size:allow-keywords] transition-[height] duration-200 ease-(--mf-ease) motion-reduce:transition-none [[data-motion=off]_&]:transition-none'

/**
 * The page holds its first drawing a moment for this Mac's words (1.2 s at most), so they come in with it, whole, and
 * nothing under them moves as they open their room. Past that, the held room shows the orb and eases open after.
 */
function useWordsWait(waiting: boolean): void {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!waiting) return
    const wait = setTimeout(() => setLate(true), 1200)
    return () => clearTimeout(wait)
  }, [waiting])
  useReading(waiting && !late)
}

/** Under a clue offered for a question: one line on why it may help, written on this Mac. */
export function WhyLine({ question, note }: { question: string; note: string }): React.JSX.Element | null {
  // Whether this Mac can write it is known before the page shows, so its room is there from the first frame or never.
  const caps = useCaps()
  useReading(caps === null)
  const has = meets(caps, 'ai')
  const [said, setSaid] = useState<Written | null>(null)
  useEffect(() => {
    if (!has) return
    let live = true
    setSaid(null)
    void window.api.haligtree<Written>('ai:why', question, note).then((one) => live && setSaid(one), (error: Error) => live && setSaid({ error: error.message }))
    return () => void (live = false)
  }, [has, question, note])
  useWordsWait(has && said === null)
  if (!has) return null
  // Two lines held from the first frame: the orb while this Mac writes, then its words in that room, whole: a longer
  // answer opens the room to its own height, eased, so what is under it moves on smoothly and never jumps (WORDS_ROOM).
  const words = said && 'text' in said ? `${said.text} Written on this Mac.` : said ? `Not written: ${said.error}.` : null
  return (
    <p data-mac-needs="ai" data-ai-why data-room-held className={`${WORDS_ROOM} ${words === null ? 'h-[2lh]' : 'h-auto min-h-[2lh]'} text-meta text-muted-foreground`}>
      {words === null ? <Orb label="Asking this Mac why…" /> : <span><Sparkles aria-hidden className="mr-1 inline size-3 align-[-1px]" />{words}</span>}
    </p>
  )
}

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
  useWordsWait(has && said === null)
  if (!has) return null
  const from = [...new Set(notes.map((one) => one.title))].slice(0, 3).map((title) => `“${title}”`)
  const named = from.length > 1 ? `${from.slice(0, -1).join(', ')} and ${from.at(-1)}` : from[0]
  const words = said && 'text' in said ? `${said.text} From ${named}, written on this Mac.` : said ? `Not answered: ${said.error}.` : null
  return (
    // Two lines held from the first frame, as WhyLine holds its room: the orb while this Mac writes, then the answer
    // whole, the room opening to it eased (WORDS_ROOM): it was cut to two lines with "…", the rest only on pointing.
    <p data-mac-needs="ai" data-ai-answer data-room-held className={`mt-1 ${WORDS_ROOM} ${words === null ? 'h-[2lh]' : 'h-auto min-h-[2lh]'} text-body text-foreground`}>
      {words === null ? <Orb label="Asking this Mac from your notes…" /> : <span><Sparkles aria-hidden className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" />{words}</span>}
    </p>
  )
}

/** A name for a note that starts with no words of its own (a picture, a recording), from the words further in. */
export async function nameFor(text: string): Promise<string | null> {
  const said = await window.api.haligtree<Written>('ai:name', text).catch(() => null)
  // Its first line: the Mac's model may answer a name and then a line on why (group-name.ts cleanName).
  return said && 'text' in said ? (said.text.split('\n').find((one) => one.trim()) ?? '').trim().replace(/^["“']|["”'.]$/g, '').trim() || null : null
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
