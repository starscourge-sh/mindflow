/**
 * Where each link card's picture came from, and the copy of it kept with the
 * book: written beside the notes, not into them.
 *
 * A card's picture and icon are kept with the book so the card still shows
 * offline and after its site changes. The kept copy's address used to be
 * written into the card itself, by the card as it was first shown and by a
 * sweep of every card a little after launch: a note was rewritten with no
 * key pressed (five blocks of the 7,017-block "Exam Cliff Notes", seconds
 * after it opened). Now the note keeps the address it had, and where the
 * copy is, is kept here: the newest 2,000, per book, in this window's own
 * store. A card is drawn from the copy when there is one.
 */
const KEPT = 2000
const remote = (src: string): boolean => /^https?:/i.test(src)

let known: Map<string, string> | null = null
let writing = 0
const key = (): string => `card-pictures ${(window as { api?: { book?: () => string } }).api?.book?.() ?? ""}`

function all(): Map<string, string> {
  if (known) return known
  known = new Map()
  try {
    for (const [from, to] of Object.entries(JSON.parse(localStorage.getItem(key()) ?? "{}") as Record<string, unknown>)) if (typeof to === "string") known.set(from, to)
  } catch {
    // Kept for this run only.
  }
  return known
}

function write(): void {
  // Once per spare moment, however many pictures were kept in it.
  writing ||= requestIdleCallback(() => {
    writing = 0
    try {
      localStorage.setItem(key(), JSON.stringify(Object.fromEntries(all())))
    } catch {
      // Kept for this run only.
    }
  })
}

/** The copy kept with the book of a picture still on its site, or the address itself when none is kept. */
export const keptOf = (src: string): string => (src && remote(src) ? (all().get(src) ?? src) : src)

/** The picture at `from` is kept with the book at `to`. An address still on the web is no copy, and is not written down. */
export function remember(from: string, to: string): void {
  const kept = all()
  if (!from || !to || !remote(from) || remote(to) || kept.get(from) === to) return
  kept.delete(from)
  kept.set(from, to)
  while (kept.size > KEPT) kept.delete(kept.keys().next().value as string)
  write()
}

/** A kept copy that is gone: the site's own address is used again, and kept again when it next shows. */
export const forget = (from: string): void => void (all().delete(from) && write())
