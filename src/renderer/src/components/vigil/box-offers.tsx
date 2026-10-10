import { useEffect } from 'react'

import { useLive, vigil, type Item, type PinnedQuestion, type Settings } from '@/lib/vigil'
import { PinnedQuestions } from './pinned-questions'
import { GoalChips, goalsToLog } from './goals-view'

/** Words too common to say what a note is about. */
const COMMON = new Set('this that with from have what when where which will would about there their them they then than into your just like some more most also been were very much many only over such even does done make made after before because could should'.split(' '))

/** The words of a line that say what it is about, cut to their first four letters: "walking" and "walk" meet. */
const stems = (text: string): Set<string> =>
  new Set((text.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((word) => !COMMON.has(word)).map((word) => word.slice(0, 4)))

/**
 * Where else the box's words could go: a clue for a question kept in view, a
 * log for an open goal. Offered only where the words share one with its name,
 * so a note about tea is not asked about your exam; the rest wait in the
 * box's one ⋯ menu (`onHidden` says how many, `all` shows them).
 */
export function BoxOffers({ words, all, onHidden, onClue, onLog }: { words: string; all: boolean; onHidden: (count: number) => void; onClue: (question: PinnedQuestion) => void; onLog: (goal: Item) => void }): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
  const pinned = useLive(vigil.pinnedQuestions, [] as PinnedQuestion[])
  const goals = useLive(() => vigil.items('goal'), [] as Item[], [], ['item'])
  const said = stems(words)
  const near = (title: string): boolean => [...stems(title)].some((stem) => said.has(stem))
  const offered = [...(settings?.pinnedQuestions === false ? [] : pinned), ...goalsToLog(goals)]
  const hidden = all ? 0 : offered.filter((one) => !near(one.title)).length
  useEffect(() => onHidden(hidden), [hidden]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onHidden(0), []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!offered.length || hidden === offered.length) return null
  return (
    <div data-chrome data-box-offers className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-[4.75rem] pb-1">
      <PinnedQuestions onPick={onClue} only={all ? undefined : near} />
      <GoalChips onPick={onLog} only={all ? undefined : near} />
    </div>
  )
}
