import { dayjs } from '../../../main/dates'

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
  first: () => call<string | null>('issues:first'),
  past: (scale: 'week' | 'month', before: string, count = 3) => call<PastIssue[]>('issues:past', scale, before, count),
  month: (month: string) => call<MonthTold>('issues:month', month),
  repeats: (ids: string[]) => call<Record<string, Repeat>>('repeats', ids),
  repeatArticle: (ids: string[]) => call<string>('repeats:article', ids)
}

/**
 * Which issue a week or month is: the first one you caught anything in is
 * No. 1. Before then, or with nothing caught yet, there is no number.
 */
export const issueNumber = (first: string | null, start: string, scale: 'week' | 'month'): number | null => {
  if (!first) return null
  const n = dayjs(start).startOf(scale).diff(dayjs(first).startOf(scale), scale) + 1
  return n >= 1 ? n : null
}

/** "No. 041": three figures, the way a run of issues is numbered. */
export const issueLabel = (n: number): string => `No. ${String(n).padStart(3, '0')}`
