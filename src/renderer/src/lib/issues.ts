
/** The issues' channels, typed: see src/main/issues.ts. */
const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

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
/** The same idea caught again: how many times, each one, and an article already written from them. */
export type Repeat = { n: number; ids: { id: string; number: number; title: string }[]; article: { id: string; title: string } | null }

export const issues = {
  past: (scale: 'week' | 'month', before: string, count = 3) => call<PastIssue[]>('issues:past', scale, before, count),
  month: (month: string) => call<MonthTold>('issues:month', month),
  repeats: (ids: string[]) => call<Record<string, Repeat>>('repeats', ids),
  repeatArticle: (ids: string[]) => call<string>('repeats:article', ids)
}
