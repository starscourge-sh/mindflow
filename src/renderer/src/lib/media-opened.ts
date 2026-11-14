import { call } from './haligtree'

/**
 * A stored file opened as itself (a picture looked at, a book opened in the reader, a recording played), written down
 * for Files' "Last opened" column and its Recent cards. Said at once to the page in this window, so its row moves
 * without the whole list being read again.
 */
const STORED = /^(?:haligtree|mindflow):\/\/assets\/[a-f0-9]{64}\.[a-z0-9]+$/i
const opened = new Map<string, string>()

/** When this window last opened it, if it did since the list was read. */
export const openedHere = (src: string): string | undefined => opened.get(src)

const said = (src: string): void => void window.dispatchEvent(new CustomEvent('haligtree:media-opened', { detail: src }))

export function markOpened(src: string): void {
  if (!STORED.test(src)) return
  opened.set(src, new Date().toISOString())
  void call('media:opened', src).catch(() => undefined)
  said(src)
}

/** A video's length, and where it was left and when, as this window last heard it (main keeps them: media.ts, media_place). */
export type Place = { seconds: number; played?: number; playedAt?: string }
const places = new Map<string, Place>()

/** A video's place: what this window heard or what the list read, whichever was watched later (another window may have played it since). */
export const placeOf = (one: { src: string; seconds?: number; played?: number; playedAt?: string }): Place | null => {
  const mine = places.get(one.src)
  const listed = one.seconds ? { seconds: one.seconds, played: one.played, playedAt: one.playedAt } : null
  if (!mine || !listed) return mine ?? listed
  return (mine.playedAt ?? '') > (listed.playedAt ?? '') ? mine : { ...listed, seconds: listed.seconds || mine.seconds }
}

/** Where a video stopped (a pause, its end, its player put away), kept for "Carry on watching". */
export function keepPlace(src: string, at: number, seconds: number): void {
  if (!STORED.test(src) || !(seconds > 0)) return
  places.set(src, { seconds, played: at, playedAt: new Date().toISOString() })
  void call('media:place', src, seconds, at).catch(() => undefined)
  said(src)
}

/** A video's length, read by a tile from the file itself, kept so it is known from then on. */
export function keepLength(src: string, seconds: number): void {
  if (!STORED.test(src) || !(seconds > 0) || places.get(src)?.seconds) return
  places.set(src, { seconds })
  void call('media:place', src, seconds).catch(() => undefined)
  said(src)
}
