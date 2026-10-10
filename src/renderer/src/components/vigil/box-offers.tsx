import { useState } from 'react'
import { Ellipsis } from 'lucide-react'

import { chime } from '@/lib/sound'
import { useLive, vigil, type Item, type PinnedQuestion, type Settings } from '@/lib/vigil'
import { PinnedQuestions } from './pinned-questions'
import { GoalChips, goalsToLog } from './goals-view'
import { Tip } from './ui'

/** Words too common to say what a note is about. */
const COMMON = new Set('this that with from have what when where which will would about there their them they then than into your just like some more most also been were very much many only over such even does done make made after before because could should'.split(' '))

/** The words of a line that say what it is about, cut to their first four letters: "walking" and "walk" meet. */
const stems = (text: string): Set<string> =>
  new Set((text.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((word) => !COMMON.has(word)).map((word) => word.slice(0, 4)))

/**
 * Where else the box's words could go: a clue for a question kept in view, a
 * log for an open goal. Offered only where the words share one with its name,
 * so a note about tea is not asked about your exam; the rest wait behind ⋯.
 */
export function BoxOffers({ words, onClue, onLog }: { words: string; onClue: (question: PinnedQuestion) => void; onLog: (goal: Item) => void }): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
  const pinned = useLive(vigil.pinnedQuestions, [] as PinnedQuestion[])
  const goals = useLive(() => vigil.items('goal'), [] as Item[], [], ['item'])
  const [all, setAll] = useState(false)
  const said = stems(words)
  const near = (title: string): boolean => [...stems(title)].some((stem) => said.has(stem))
  const offered = [...(settings?.pinnedQuestions === false ? [] : pinned), ...goalsToLog(goals)]
  if (!offered.length) return null
  const hidden = all ? 0 : offered.filter((one) => !near(one.title)).length
  // With none offered, the button says what it holds; after some, ⋯ is enough.
  const none = hidden === offered.length
  return (
    <div data-chrome data-box-offers className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-[4.75rem] pb-1">
      <PinnedQuestions onPick={onClue} only={all ? undefined : near} />
      <GoalChips onPick={onLog} only={all ? undefined : near} />
      {hidden > 0 && (
        <Tip label="Add it as a clue to a question, or log it to a goal">
          <button type="button" data-box-offers-more aria-label="Add it as a clue, or log it to a goal"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => (chime('tap'), setAll(true))}
            className="flex h-5 items-center gap-1.5 rounded-full px-1.5 text-xs text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground">
            <Ellipsis className="size-3.5" />
            {none && 'Clue or log'}
          </button>
        </Tip>
      )}
    </div>
  )
}
