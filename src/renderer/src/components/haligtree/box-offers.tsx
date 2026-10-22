import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Flag } from 'lucide-react'

import { menuShowing } from '@/lib/menu-keys'
import { EASE, shift } from '@/lib/motion'
import { useLive, haligtree, type Item, type PinnedQuestion, type Settings } from '@/lib/haligtree'
import { PinnedQuestions } from './pinned-questions'
import { GoalChips, goalsToLog } from './goals-view'
import { Kbd, Tip } from './ui'
import { clip } from '../../../../main/clip'
import { Orbit } from '@/components/ui/icons'
import { hoverNote } from './note-preview'

/** Words too common to say what a note is about. */
const COMMON = new Set('this that with from have what when where which will would about there their them they then than into your just like some more most also been were very much many only over such even does done make made after before because could should still here start keep first every thing things want need know think good time really something going back down well right same each other while being these those'.split(' '))

/** The words of a line that say what it is about, cut to their first four letters: "walking" and "walk" meet. */
const stems = (text: string): Set<string> =>
  new Set((text.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((word) => !COMMON.has(word)).map((word) => word.slice(0, 4)))

type Offer = { kind: 'question'; one: PinnedQuestion; shared: number } | { kind: 'goal'; one: Item; shared: number } | { kind: 'ask'; one: { id: string; title: string }; shared: number }

/** The first line that ends in "?", not a clue line ("+name: …"): what "Keep as a question" would keep. */
export const askedLine = (words: string): string | null =>
  words.split('\n').map((line) => line.trim()).find((line) => line.length > 1 && line.endsWith('?') && !line.startsWith('+')) ?? null

const short = (text: string, n = 40): string => clip(text, n) || 'Untitled'

/**
 * Where else the box's words could go, kept calm: one quiet line, and only
 * when the words are plainly about one thing. A question is offered when two
 * of its words are written (half of them in a long one, or its one word); a
 * goal only when three in four are, so a note is not asked about every goal
 * you have; nothing it already links to, and nothing under a long piece. Tab or a
 * click adds it. The rest wait in the gear menu (`onHidden` says how many,
 * `all` shows them all as chips). With none of those, a line ending in "?"
 * is offered as a question of its own: "Keep as a question", on the same key.
 */
export function BoxOffers({ words, linked, all, onHidden, onClue, onLog, onAsk }: { words: string; /** The note as saved (JSON): what it links to already. */ linked?: string; all: boolean; onHidden: (count: number) => void; onClue: (question: PinnedQuestion) => void; onLog: (goal: Item) => void; /** Keep the box's words as a new question, this line its name. */ onAsk: (line: string) => void }): React.JSX.Element | null {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const pinned = useLive(haligtree.pinnedQuestions, [] as PinnedQuestion[])
  const goals = useLive(() => haligtree.items('goal'), [] as Item[], [], ['item'])
  // Added once: the line goes, so it is not offered twice.
  const [taken, setTaken] = useState<string[]>([])
  const said = stems(words)
  const count = (title: string): number => [...stems(title)].filter((stem) => said.has(stem)).length
  const questions = settings?.pinnedQuestions === false ? [] : pinned
  const offers: Offer[] = [
    ...questions.map((one) => ({ kind: 'question' as const, one, shared: count(one.title) })),
    ...goalsToLog(goals).map((one) => ({ kind: 'goal' as const, one, shared: count(one.title) }))
  ]
  // A question: half its words at least, and two once it has two. A goal: three in four, and two at least.
  const strong = (offer: Offer): boolean => {
    const size = stems(offer.one.title).size
    return offer.shared >= (offer.kind === 'goal' ? Math.max(2, Math.ceil(size * 0.75)) : Math.max(Math.min(2, size), Math.ceil(size / 2)))
  }
  // The best one: the most words in common, a question before a goal.
  // One the note already links to is not offered again; nor is anything for a
  // long piece, which shares a few words with everything (the gear menu has them).
  const long = words.trim().split(/\s+/).length > 80
  const matched = all || long ? undefined : offers.filter((offer) => strong(offer) && !taken.includes(offer.one.id) && !linked?.includes(offer.one.id)).sort((a, b) => b.shared - a.shared)[0]
  const hidden = all ? 0 : offers.length - (matched ? 1 : 0)
  // Nothing it is about yet, and a line asks something: it can be a question of its own.
  const asked = askedLine(words)
  const best: Offer | undefined = matched ?? (all || long || !asked || taken.includes(`ask:${asked}`) ? undefined : { kind: 'ask', one: { id: `ask:${asked}`, title: asked }, shared: 0 })
  useEffect(() => onHidden(hidden), [hidden]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onHidden(0), []) // eslint-disable-line react-hooks/exhaustive-deps
  const take = (): void => {
    if (!best) return
    setTaken((was) => [...was, best.one.id])
    if (best.kind === 'question') onClue(best.one)
    else if (best.kind === 'ask') onAsk(best.one.title)
    else onLog(best.one)
  }
  const latest = useRef(take)
  latest.current = take
  // Tab in the writing adds it, once nothing else has taken Tab (a list's
  // indent, a word's meaning, a menu of suggestions).
  const on = !!best
  useEffect(() => {
    if (!on) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || event.defaultPrevented || event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return
      if (!(event.target as HTMLElement | null)?.closest?.('.ProseMirror') || menuShowing('.tiptap-suggestion-popup')) return
      event.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])
  if (all) {
    if (!offers.length) return null
    return (
      <div data-chrome data-box-offers className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-[4.75rem] pb-1">
        <PinnedQuestions onPick={onClue} />
        <GoalChips onPick={onLog} />
      </div>
    )
  }
  return (
    <AnimatePresence initial={false}>
      {best && (
        <motion.div key={best.kind === 'ask' ? 'ask' : best.one.id} data-chrome data-box-offers data-offer={best.kind}
          initial={{ opacity: 0, transform: shift('translateY(3px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
          className="flex min-w-0 items-center gap-1.5 px-[4.75rem] pb-1 text-xs text-muted-foreground">
          {best.kind === 'ask' ? (
            <>
              <Orbit className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate text-foreground/80">“{short(best.one.title, 48)}”</span>
              <span aria-hidden className="shrink-0">·</span>
              <Tip label="A question of its own in Writing: it collects dated clues until you know the answer">
                <button type="button" onClick={take} className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground">
                  Keep as a question <Kbd>⇥</Kbd>
                </button>
              </Tip>
            </>
          ) : <>
          {best.kind === 'question' ? <Orbit className="size-3.5 shrink-0" /> : <Flag className="size-3.5 shrink-0" />}
          <span className="min-w-0 truncate">
            {best.kind === 'question' ? 'Helps answer' : 'Log to'}{' '}
            <span {...hoverNote(best.kind, best.one.id)} data-private={best.kind === 'goal' && best.one.private ? '' : undefined} className={`text-foreground/80 ${best.kind === 'goal' ? 'private-text' : ''}`}>“{short(best.one.title)}”</span>
          </span>
          <span aria-hidden className="shrink-0">·</span>
          <Tip label={best.kind === 'question' ? `Add this to “${short(best.one.title, 60)}” as a clue, a piece of the answer` : `Log this against “${short(best.one.title, 60)}”`}>
            <button type="button" onClick={take} className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground">
              Add <Kbd>⇥</Kbd>
            </button>
          </Tip>
          </>}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
