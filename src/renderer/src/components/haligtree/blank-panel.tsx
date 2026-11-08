import { useState } from 'react'
import { haligtree } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { BLANK, addsUp, answersOf, blanksIn, clozeNumbers, onlyBlank, onlyCloze } from '@/lib/blanks'
import { Chips } from './display'
import { GHOST, GhostText } from './ghost'
import { refuse, toast } from './ui'
import { num } from '../../../../main/dates'
import { quoted } from '../../../../main/clip'

/**
 * Anki's blanks typed by hand with two or more numbers ({{c1::...}} and
 * {{c2::...}}): one card for each number, as Anki makes them. This card keeps
 * c1; each other number is a new card with the gem's own answer, context,
 * source and tags. Gives back this card's question and the new cards' ids.
 */
export async function cardPerNumber(id: string, prompt: string, text: string, body: unknown): Promise<{ prompt: string; made: string[] } | null> {
  const numbers = clozeNumbers(prompt)
  if (numbers.length < 2) return null
  const made = await Promise.all(numbers.slice(1).map((n) => haligtree.another(id, onlyCloze(prompt, n), text || prompt, body)))
  return { prompt: onlyCloze(prompt, numbers[0]), made: made.filter((one): one is string => !!one) }
}

/** A blank's hint written into the question: "_____ (how many mL)", or the bare blank again. */
function withHint(prompt: string, which: number, hint: string): string {
  let n = -1
  return prompt.replace(/_____(?: \([^)\n]{1,80}\))?/g, (gap) => (++n === which ? (hint.trim() ? `${BLANK} (${hint.trim()})` : BLANK) : gap))
}

/**
 * Under a fill-in-the-blank card's question, on the gem's page: each blank
 * with its answer and a hint you can write inside it, and with two or more,
 * whether they are asked together (one card) or apart (a card each). Numbers
 * that add up are asked together, with the reason; `notes` are what the last
 * blank did (a unit kept outside, an "an" taken in, an item of a list).
 */
export function BlankPanel({ id, prompt, text, body, notes, onPrompt }: { id: string; prompt: string; text: string; /** The gem's words as its editor holds them: each card asked apart keeps them whole. */ body: unknown; notes: string[]; onPrompt: (next: string) => void }): React.JSX.Element | null {
  const blanks = blanksIn(prompt)
  const answers = answersOf(prompt, text)
  const [split, setSplit] = useState(false)
  if (!blanks.length) return null
  const reason = blanks.length > 1 && answers ? addsUp(answers, text) : null
  const apart = (): void => {
    if (!answers || answers.length !== blanks.length) return refuse('The note has changed since these blanks were made: blank them again')
    const questions = blanks.map((_, n) => onlyBlank(prompt, answers, n))
    const before = prompt
    setSplit(true)
    void Promise.all(questions.slice(1).map((question) => haligtree.another(id, question, text, body))).then((made) => {
      onPrompt(questions[0])
      chime('separate')
      toast(`Asked apart: ${num(blanks.length)} cards, one blank each`, () => {
        for (const one of made) if (one) void haligtree.unlift('nugget', one)
        onPrompt(before)
        setSplit(false)
      })
    })
  }
  return (
    <div data-blank-panel className="flex flex-col gap-1 px-2 py-1.5">
      {blanks.map((blank, n) => {
        const answer = answers?.[n]
        // What this blank did (a unit kept as the cue, an item of a list), said under it once:
        // only for blanks the card still has, so one filled back in takes its note with it.
        const said = answer ? notes.filter((note) => note.startsWith(`${quoted(answer, 80)}`)) : []
        return (
          <div key={n} className="flex flex-col gap-1 rounded-md px-1 py-1.5">
            <label className="flex items-baseline gap-2 text-sm">
              <span className="shrink-0 font-semibold text-foreground tabular-nums">{answer ?? <GhostText>not found in the note</GhostText>}</span>
              <input data-blank-hint defaultValue={blank.hint ?? ''} placeholder="add a hint inside the blank"
                onBlur={(event) => event.target.value.trim() !== (blank.hint ?? '') && onPrompt(withHint(prompt, n, event.target.value))}
                onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                className={`min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-0.5 text-sm text-foreground outline-none transition-colors hover:bg-foreground/[0.045] focus:bg-[var(--mf-surface)] ${GHOST}`}
                aria-label={`Hint for blank ${n + 1}`} />
            </label>
            {said.map((note) => (
              <p key={note} data-blank-note className="flex gap-2 text-sm leading-relaxed text-foreground/80">
                <span aria-hidden className="mt-[0.55em] size-1 shrink-0 rounded-full bg-[var(--tt-color-text-orange)]" />
                <span>{note.slice(`${quoted(answer, 80)}`.length).replace(/^[:,]?\s*/, '').replace(/^\p{Ll}/u, (first) => first.toUpperCase())}</span>
              </p>
            ))}
          </div>
        )
      })}
      {blanks.length > 1 && !split && (
        <div className="flex flex-col gap-1.5">
          <Chips options={[{ id: 'together', label: 'Ask together' }, { id: 'apart', label: 'Ask apart' }]} on={(choice) => choice === 'together'} pick={(choice) => choice === 'apart' && apart()} />
          <p data-blank-reason className="text-sm text-muted-foreground">
            {reason ?? 'Together: one card, every blank at once. Apart: a card each, the others filled in, so you only redo the one you miss.'}
          </p>
        </div>
      )}
    </div>
  )
}
