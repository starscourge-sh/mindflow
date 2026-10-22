/**
 * A new book's sidebar starts small and grows with you: the writing pages,
 * Review, Today and Calendar, and the way out (Bin, Archived, What Haligtree can
 * do). Every other page joins it, for good, the first time you open it or
 * once the book has one of its things (a gem, a question, a goal). Read by
 * main (haligtree.ts, a new book's first start) and the sidebar (places.tsx).
 * The sandbox keeps every page shown.
 */
export const FIRST_SHOWN = ['home', 'inbox', 'articles', 'all', 'review', 'today', 'calendar', 'discarded', 'archived', 'powers']

/** Tasks' pages past Today and Calendar: in a growing sidebar they wait under "More" until used. */
export const TASKS_WAITING = ['week', 'upcoming', 'matrix', 'routines', 'later', 'tomorrow']

/** The Notes group's other pages: Writing goes first among them. */
const NOTES = ['all', 'day', 'weekpage', 'monthpage']

/**
 * A book made before the sidebar put writing first, moved to it once: it grows
 * from now on, as a new book does. Every page it showed still shows, except
 * Tasks' pages it has no use for (`used` says which hold something), which wait
 * under "More". A page you hid stays hidden, and does not wait under "More" or
 * come back on its own. Your own order is kept, with Writing moved to the head
 * of Notes, where it now lives, instead of trailing it from where Saved was.
 */
export function writingFirst({ shown, all, order, used }: { shown: string[]; all: string[]; order: string[]; used: string[] }): {
  sidebarGrows: true; sidebarShown: string[]; sidebarMet: string[]; sidebarOrder: string[]
} {
  const hidden = all.filter((id) => !shown.includes(id))
  const kept = shown.filter((id) => !TASKS_WAITING.includes(id) || used.includes(id))
  let sidebarOrder = order
  if (order.includes('articles')) {
    const rest = order.filter((id) => id !== 'articles')
    const head = rest.findIndex((id) => NOTES.includes(id))
    if (head >= 0) sidebarOrder = [...rest.slice(0, head), 'articles', ...rest.slice(head)]
  }
  return { sidebarGrows: true, sidebarShown: kept, sidebarMet: [...new Set([...kept, ...hidden])], sidebarOrder }
}
