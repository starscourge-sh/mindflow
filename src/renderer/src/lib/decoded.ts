import { useEffect, useState } from 'react'

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
export function warm(url: string): Promise<boolean> {
  let done = warming.get(url)
  if (!done) {
    const image = new Image()
    image.src = url
    done = image.decode().then(
      () => (decoded.add(url), image.naturalHeight && shapes.set(url, image.naturalWidth / image.naturalHeight), true),
      () => (warming.delete(url), false)
    )
    warming.set(url, done)
  }
  return done
}
/** How long a page holds its first paint for a picture: past it, the stand-in, then the picture when it comes. */
export const WAIT = 150

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
