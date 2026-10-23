import type { Usage, Via } from '../../../main/usage'

export type { Usage, Via }

/**
 * The usage counts' one rule (main/usage.ts): whatever sends you somewhere
 * says how, just before; the main window, seeing the page change, counts the
 * page and that way together. Said more than three seconds before (a note
 * that took long to load aside), it is forgotten, and the change counts as
 * "other".
 */
let pending: { way: Via; at: number } | null = null
export const via = (way: Via): void => void (pending = { way, at: Date.now() })
/** The way said for this change, once. */
export function takeWay(): Via | null {
  const said = pending
  pending = null
  return said && Date.now() - said.at < 3000 ? said.way : null
}
/** One page opened (null: only the way counts, another note on the same page), and how. */
export const countUse = (page: string | null, way: Via): void => void window.api.haligtree('usage:count', page, way).catch(() => undefined)
export const usage = (days = 30): Promise<Usage> => window.api.haligtree<Usage>('usage', days)

/** Each way said plainly, for Stats. */
export const WAY_NAMES: Record<Via, string> = {
  palette: '⌘K commands, like “Go to Inbox”',
  sidebar: 'The sidebar',
  keys: 'Keys, like G then I',
  link: 'A link in a note',
  search: 'Search results',
  home: 'A card on Today',
  back: 'Back and Forward',
  notification: 'A notification',
  capture: 'Quick capture',
  window: 'A sticky, a note window or the menu bar',
  other: 'Something else on a page'
}
