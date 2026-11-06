import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

import { useHas } from '@/lib/needs'
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

/** Under a clue offered for a question: one line on why it may help, written on this Mac. */
export function WhyLine({ question, note }: { question: string; note: string }): React.JSX.Element | null {
  const has = useHas('ai')
  const [said, setSaid] = useState<string | null>(null)
  useEffect(() => {
    if (!has) return
    let live = true
    void window.api.haligtree<Written>('ai:why', question, note).then((one) => live && 'text' in one && setSaid(one.text), () => undefined)
    return () => void (live = false)
  }, [has, question, note])
  if (!has || !said) return null
  return <p data-mac-needs="ai" data-ai-why className="text-meta text-muted-foreground"><Sparkles aria-hidden className="mr-1 inline size-3 align-[-1px]" />{said} <span className="opacity-80">Written on this Mac.</span></p>
}

/** A name for a note that starts with no words of its own (a picture, a recording), from the words further in. */
export async function nameFor(text: string): Promise<string | null> {
  const said = await window.api.haligtree<Written>('ai:name', text).catch(() => null)
  return said && 'text' in said ? said.text.replace(/^["“']|["”'.]$/g, '').trim() || null : null
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
