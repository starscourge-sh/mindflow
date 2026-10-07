/** What the `/` menu needs of an item to find it. */
export interface Findable {
  title: string
  group: string
  hint?: string
  keywords?: string[]
}

const words = (text: string): string[] => text.toLowerCase().split(/\s+/).filter(Boolean)
/** A text's words, and the parts of a joined one: To-do is found by `to-do` and by `do`. */
const parts = (text: string): string[] => words(text).flatMap((word) => [word, ...word.split('-').filter(Boolean)])

/** Every word typed starts some word here, in any order: `row above` finds Insert row above. */
const startsWords = (typed: string[], text: string): boolean => {
  const own = parts(text)
  return typed.every((word) => own.some((that) => that.startsWith(word)))
}

/**
 * How well an item answers what was typed after `/`, lower first, or null when
 * it does not. Only the starts of words count, so `hr` is not found in "Three".
 */
export function rank(item: Findable, query: string): number | null {
  const term = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!term) return 0
  const typed = words(term)
  const title = item.title.toLowerCase()
  if (title === term) return 0
  if (title.startsWith(term)) return 1
  if (startsWords(typed, title)) return 2
  if (item.keywords?.some((word) => word === term)) return 3
  if (item.keywords?.some((word) => startsWords(typed, word))) return 4
  if (item.hint && (item.hint.toLowerCase().startsWith(term) || startsWords(typed, item.hint))) return 5
  if (startsWords(typed, item.group)) return 6
  return null
}

/** The items that answer, best first, keeping the menu's own order between equals. */
export function findItems<T extends Findable>(items: T[], query: string): T[] {
  return items
    .map((item, at) => ({ item, at, score: rank(item, query) }))
    .filter((found): found is { item: T; at: number; score: number } => found.score !== null)
    .sort((a, b) => a.score - b.score || a.at - b.at)
    .map(({ item }) => item)
}
