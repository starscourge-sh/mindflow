import type { Repeat } from '../../../main/issues'
export type { Repeat }

export type PastIssue = { key: string; start: string; fields: Record<string, string>; captures: number }
export type MonthTold = {
  month: string
  captures: number
  /** Caught the month before, to set this one beside. */
  before: number
  /** One count a day of the month. */
  days: number[]
  weekday: { day: number; n: number } | null
  hour: { hour: number; n: number } | null
  kept: number
  tags: { name: string; n: number }[]
  sources: { name: string; n: number }[]
  questions: string[]
  articles: string[]
  promoted: number
  letGo: number
  reviewed: { title: string; n: number } | null
  fields: Record<string, string>
}

export const issues = {
  past: (scale: 'week' | 'month', before: string, count = 3) => window.api.vigil<PastIssue[]>('issues:past', scale, before, count),
  month: (month: string) => window.api.vigil<MonthTold>('issues:month', month),
  repeats: (ids: string[]) => window.api.vigil<Record<string, Repeat>>('repeats', ids),
  repeatArticle: (ids: string[]) => window.api.vigil<string>('repeats:article', ids)
}
