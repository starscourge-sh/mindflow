/**
 * Your pace through a book: from the furthest page reached on each day you
 * read it, the pages a day you go at, and the day you would finish at that
 * pace. Said only once there are two days of reading to go by, and never for
 * a book already finished. Every Mac; nothing but your own reading.
 */
export type Day = { day: string; furthest: number }

const DAY = 86_400_000

/** The day you finish, "YYYY-MM-DD", or null when there is not enough to say. */
export function finishBy(days: Day[], page: number, pages: number, today: string): string | null {
  if (page >= pages) return null
  const read = [...days].sort((a, b) => a.day.localeCompare(b.day))
  if (read.length < 2) return null
  const first = read[0]
  const span = Math.max(1, (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${first.day}T12:00:00Z`)) / DAY)
  // Pages gone through since the first day (that day's own pages counted once it is over).
  const gone = Math.max(...read.map((one) => one.furthest)) - first.furthest
  if (gone <= 0) return null
  const perDay = gone / span
  const left = Math.ceil((pages - page) / perDay)
  // Further than a year off says nothing useful.
  if (left > 365) return null
  return new Date(Date.parse(`${today}T12:00:00Z`) + left * DAY).toISOString().slice(0, 10)
}
