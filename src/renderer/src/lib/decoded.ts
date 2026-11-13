import { useEffect, useRef, useState } from 'react'

import { useReading } from './reads-in'

/**
 * Pictures decoded before they are drawn. A window just opened (a book switch
 * starts a new one, its cache empty) drew a picture's empty box, or its
 * stand-in, then the picture a few frames later: a flash. A picture is
 * decoded as soon as something picks it, and the page it is on holds its
 * first paint for it, a moment at most, so its first frame already has it.
 */

/** Pictures already decoded in this window: shown without waiting again. */
export const decoded = new Set<string>()
/** Each picture's shape (width over height), known once it is decoded. */
const shapes = new Map<string, number>()
/** Each picture's decode, started once, as soon as a place picks it. */
const warming = new Map<string, Promise<boolean>>()
/**
 * The decoded pictures themselves, the latest few hundred, held by the window. A picture decoded and then held by
 * nothing is let go at the page's next clean-up (its garbage collection), and the row drawn after that read its
 * file again: two to five milliseconds, so its picture came frames after the row (a data: picture alone is read in
 * place). One let go is no longer counted decoded, so the next place to draw it decodes it again first. Only
 * pictures of a list's size are held (a small copy, a drawing, a face), never a whole photo of megabytes.
 */
const held = new Map<string, HTMLImageElement>()
const HELD = 200
const HELD_PIXELS = 1_000_000
export function warm(url: string): Promise<boolean> {
  let done = warming.get(url)
  if (!done) {
    const image = new Image()
    image.src = url
    done = image.decode().then(
      () => {
        decoded.add(url)
        if (image.naturalHeight) shapes.set(url, image.naturalWidth / image.naturalHeight)
        if (image.naturalWidth * image.naturalHeight <= HELD_PIXELS) held.set(url, image)
        const oldest = held.size > HELD ? held.keys().next().value : undefined
        if (oldest !== undefined) (held.delete(oldest), decoded.delete(oldest), warming.delete(oldest))
        return true
      },
      () => (warming.delete(url), false)
    )
    warming.set(url, done)
  }
  return done
}
/** How long a page holds its first paint for a picture: past it, the stand-in, then the picture when it comes. */
export const WAIT = 150

/** Each picture a place had made for it (a note's small copy, a file's face), by the place's key, once decoded. */
const made = new Map<string, string>()
/**
 * A picture that is made before it can be drawn (a note's small copy from main, a file's face from Quick Look),
 * ready in the first frame of the row that draws it: made and decoded as the row first asks, its page holding its
 * first paint for it (`WAIT` at most), and drawn at once by every row after. Undefined with no key; null while not
 * ready, when a row draws its still square in the picture's own tone, which the picture then replaces in one frame;
 * the picture's address once decoded, or '' when none could be made or decoded.
 */
export function useMade(key: string | null | undefined, make: () => Promise<string>, now?: () => string | undefined): string | null | undefined {
  const [, redraw] = useState(0)
  const [late, setLate] = useState<string | null>(null)
  // `now`: the picture already made elsewhere (made ahead), at hand in this first draw.
  const url = key ? (made.get(key) ?? now?.()) : undefined
  // Made, and still decoded (one let go long since is decoded again first).
  const ready = url !== undefined && (!url || decoded.has(url))
  // Once drawn here it stays drawn: its <img> holds it, and a picture let go later is decoded again behind it.
  const shown = useRef<{ key: string; url: string } | null>(null)
  if (key && ready) shown.current = { key, url: url! }
  useReading(!!key && !ready && late !== key && shown.current?.key !== key)
  useEffect(() => {
    if (!key || ready) return
    let gone = false
    const budget = setTimeout(() => !gone && setLate(key), WAIT)
    const had = made.get(key)
    void (had !== undefined ? Promise.resolve(had) : make().catch(() => ''))
      .then((url) => (url ? warm(url).then((whole) => (whole ? url : '')) : ''))
      .then((url) => (made.set(key, url), !gone && (clearTimeout(budget), redraw((n) => n + 1))))
    return () => void ((gone = true), clearTimeout(budget))
  }, [key, ready]) // eslint-disable-line react-hooks/exhaustive-deps
  return !key ? undefined : ready ? url : shown.current?.key === key ? shown.current.url : null
}

/**
 * A picture about to be drawn: decoded now, its page held for it up to
 * `WAIT` (and while `waiting`, for what says which picture it is), and
 * `late` once that is spent, the only time a stand-in should show.
 */
export function useDecoded(url: string | null | undefined, waiting = false): { ready: boolean; late: boolean; shape: number | null } {
  const [, redraw] = useState(0)
  const [late, setLate] = useState<string | null>(null)
  if (url) void warm(url)
  const ready = !!url && decoded.has(url)
  useReading(waiting || (!!url && !ready && late !== url))
  useEffect(() => {
    if (!url || decoded.has(url)) return
    let gone = false
    const budget = setTimeout(() => !gone && setLate(url), WAIT)
    void warm(url).then(() => !gone && (clearTimeout(budget), redraw((n) => n + 1)))
    return () => void ((gone = true), clearTimeout(budget))
  }, [url])
  return { ready, late: !!url && late === url, shape: url ? (shapes.get(url) ?? null) : null }
}
