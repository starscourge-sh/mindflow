import type { Settings } from '@/lib/haligtree'
import { useHas } from '@/lib/needs'
import type { Verdict } from '../../../main/study-ai'
export { VERDICT_SAID, cutWords, hintedTimes, meaningGrade, chapterRange, chapterText, type Verdict } from '../../../main/study-ai'

/**
 * Apple Intelligence in Review and the reader (main/understand.ts): offered
 * only on a Mac that has it turned on, and while Settings keeps it on. Never a
 * dead button elsewhere: where this is false, nothing of it is drawn.
 */
export function useStudyAi(settings: Settings | null): boolean {
  return useHas('ai') && !!settings && settings.aiStudy !== false
}

type Failed = { error: string }
export type Judged = { verdict: Verdict; missing: string } | Failed
export type Hinted = { text: string } | Failed
export type MadeCard = { question: string; answer: string; page: number }
export type Carded = { cards: MadeCard[] } | Failed

export const judge = (question: string, answer: string, said: string): Promise<Judged> => window.api.haligtree<Judged>('ai:judge', question, answer, said)
export const hint = (question: string, answer: string, level: 1 | 2): Promise<Hinted> => window.api.haligtree<Hinted>('ai:hint', question, answer, level)
export const cardsFrom = (title: string, text: string, count: number): Promise<Carded> => window.api.haligtree<Carded>('ai:cards', title, text, count)

/** An answer's own words, pictures, links and #tags left out: what a hint or a check by meaning is built from. */
export const wordsOf = (text: string): string => text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/(?<=^|\s)#[\p{L}\p{N}_/-]+/gu, ' ').replace(/\s+/g, ' ').trim()
