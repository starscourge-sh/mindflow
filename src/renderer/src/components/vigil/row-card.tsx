import type { Entry } from './note-list'

/**
 * Every row a list draws, by its id: its name, kind and menu, for whatever
 * needs a row's own menu away from its list (a pane's ··· menu). Resting the
 * pointer on a row brings up nothing: what a hover card once offered (Pin,
 * Open to the side, Copy link) is in the row's right-click menu.
 */
const known = new Map<string, Entry>()
export const knowRow = (entry: Entry): void => void known.set(entry.id, entry)
/** A row as its list last drew it: its name, kind and menu. */
export const rowOf = (id: string): Entry | undefined => known.get(id)
