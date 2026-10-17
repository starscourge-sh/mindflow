/**
 * Frecency: how often and how recently something is used, in one number.
 * Each use counts 1 on the day, half after a week, a quarter after three
 * weeks, and so on, so a kind used a lot last year is passed by one used a
 * few times this week. main/notes.ts sums these the same way in SQL.
 */
export const weightOf = (ageDays: number): number => 1 / (1 + Math.max(0, ageDays) / 7)

/** The ids, most used and most recent first; ones never used keep their own order, after the rest. */
export function byFrecency<T extends string>(ids: readonly T[], scores: Record<string, number>): T[] {
  return ids
    .map((id, at) => ({ id, at, score: scores[id] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .map(({ id }) => id)
}
