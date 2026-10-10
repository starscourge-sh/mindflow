import { alive } from '@/components/ui/alive-icon'
import QuestionMarkIcon from '@/components/ui/question-mark'
import { AnimatePresence, motion } from 'motion/react'

import { chime } from '@/lib/sound'
import { useLive, vigil, type PinnedQuestion, type Settings } from '@/lib/vigil'
import { Tip, refuse, toast } from './ui'
import { num } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Orbit = alive(QuestionMarkIcon)

const short = (text: string, n = 36): string => (text.length > n ? `${text.slice(0, n)}…` : text) || 'Untitled'

/**
 * Keep a question in view, or stop; twelve at most, as Feynman kept twelve
 * problems. Undoable.
 */
export async function pinQuestion(id: string, title: string, on: boolean, quiet = false): Promise<void> {
  const done = await vigil.pinQuestion(id, on)
  if (!done) return refuse('Twelve questions are in view already. Take one out of view first')
  chime(on ? 'watch' : 'unpin')
  if (!quiet) toast(on ? `In view: “${short(title)}” shows while you capture` : 'Out of view', () => void pinQuestion(id, title, !on, true))
}

/**
 * A capture's words as a clue in one of the questions kept in view. With a
 * capture already kept, it moves into the question; with words not yet sent,
 * `text` is the clue.
 */
export async function clueInto(question: PinnedQuestion, from: { captureId?: string; text?: string }, onUndo?: () => void): Promise<boolean> {
  const clue = await vigil.addClue(question.id, from.text ?? '', from.captureId)
  if (!clue) {
    refuse('That capture already took an exit. Put it back in the inbox first')
    return false
  }
  chime('clue')
  toast(`A clue in “${short(question.title)}”`, () => void vigil.dropClue(clue).then(() => (chime('undo'), onUndo?.())))
  return true
}

/**
 * The questions you keep in view, small, beside something new: while you
 * capture, and while you tidy the inbox. One click matches the new thing to
 * what you are actually trying to work out. Nothing at all with none in
 * view, or with the setting off.
 */
export function PinnedQuestions({ onPick, className = '', only }: { onPick: (question: PinnedQuestion) => void; className?: string; /** Only the ones this says yes to: the box offers those its words are about. */ only?: (title: string) => boolean }): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
  const every = useLive(vigil.pinnedQuestions, [] as PinnedQuestion[])
  const pinned = only ? every.filter((one) => only(one.title)) : every
  if (!pinned.length || settings?.pinnedQuestions === false) return null
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground ${className}`}>
      <span className="mr-0.5 flex shrink-0 items-center gap-1.5">
        <Orbit className="size-3.5" />
        Clue for
      </span>
      <AnimatePresence initial={false}>
        {pinned.map((question, index) => (
          <motion.span key={question.id} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.18, delay: index * 0.025, ease: [0.16, 1, 0.3, 1] }}>
            <Tip label={`${question.title} · ${question.clues === 1 ? '1 clue' : `${num(question.clues)} clues`}`}>
              <button type="button" onClick={() => onPick(question)}
                className="max-w-48 truncate rounded-full border px-2 py-0.5 text-foreground/80 transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground">
                {short(question.title, 40)}
              </button>
            </Tip>
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  )
}
