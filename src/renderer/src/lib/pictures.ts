import { thumbHashToAverageRGBA, thumbHashToDataURL } from "thumbhash"

/**
 * A stored picture keeps its place before it has loaded, and shows a soft blur
 * of its own colours there until it has.
 *
 * Every stored picture's size and a few bytes of its colours (a ThumbHash)
 * are kept by the main process (src/main/pictures.ts). They are all read once
 * when the window opens, so a note opened later knows each picture's shape
 * before it draws a word; one not known yet is asked for and worked out then.
 */

/**
 * Width, height, the ThumbHash in base64 (empty when its colours could not be
 * read), and the share of its height taken by black bands baked in at the top
 * and the bottom, which are left out wherever it is shown.
 */
type Look = [number, number, string, number, number]

const looks = new Map<string, Look | null>()
const waiting = new Map<string, Set<() => void>>()
const blurs = new Map<string, string>()

/** A stored picture's name in the store, from its address. */
const nameOf = (src: string | null | undefined): string | null => /^mindflow:\/\/assets\/([a-f0-9]{64}\.[a-z0-9]+)$/.exec(src ?? "")?.[1] ?? null

const told = (name: string): void => {
  waiting.get(name)?.forEach((then) => then())
  waiting.delete(name)
}

const call = (channel: string, ...args: unknown[]): Promise<unknown> | undefined =>
  (window as { api?: { vigil?: (channel: string, ...args: unknown[]) => Promise<unknown> } }).api?.vigil?.(channel, ...args)

// Everything known so far, as the window opens.
const all = call("pictures:looks")?.then((found) => {
  for (const [name, look] of Object.entries((found ?? {}) as Record<string, Look>)) if (!looks.has(name)) looks.set(name, look)
  for (const name of [...waiting.keys()]) if (looks.has(name)) told(name)
}, () => undefined)

// The rest asked for together, a moment after the note that shows them is drawn.
let asking: Set<string> | null = null
const ask = (name: string): void => {
  if (asking) return void asking.add(name)
  asking = new Set([name])
  setTimeout(async () => {
    await all
    const names = [...(asking ?? [])].filter((one) => !looks.has(one))
    asking = null
    // A few at a time, in the note's order: the first pictures get theirs
    // without waiting for the hundredth, each worked out in turn by the main process.
    for (let at = 0; at < names.length; at += 6) {
      const some = names.slice(at, at + 6)
      const found = ((await call("pictures:look", some)?.catch(() => null)) ?? []) as (Look | null)[]
      some.forEach((name, i) => {
        looks.set(name, found[i] ?? null)
        told(name)
      })
    }
  }, 30)
}

/** A picture's size and colours, when known: at once from what is kept here. */
export function lookOf(src: string | null | undefined): Look | null {
  const name = nameOf(src)
  return (name && looks.get(name)) || null
}

/** Its colours as a small picture, made once per picture. */
const blurOf = (hash: string): string => {
  let url = blurs.get(hash)
  if (!url) blurs.set(hash, (url = thumbHashToDataURL(Uint8Array.from(atob(hash), (c) => c.charCodeAt(0)))))
  return url
}

// A blur takes a millisecond or two to make: the ones not needed at once are
// made while the window is idle, a few at a time, so a note of a hundred
// pictures opens as fast as one without.
const jobs: (() => void)[] = []
const drain = (deadline: IdleDeadline): void => {
  do jobs.shift()?.()
  while (jobs.length && deadline.timeRemaining() > 3)
  if (jobs.length) requestIdleCallback(drain, { timeout: 400 })
}
const later = (job: () => void): void => void (jobs.push(job) === 1 && requestIdleCallback(drain, { timeout: 400 }))

const still = (): boolean => document.documentElement.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Keep a picture's place, and show its colours there until it is drawn, then
 * fade it in over them (180ms; at once with Motion off or Reduce motion).
 * A picture whose look is not known yet is given one when it is, if it is
 * still waiting by then. Its place is kept at once, and its colours drawn
 * with the words for one at the very top (`soon`); the rest are painted in
 * idle moments just after, long before they are scrolled to.
 */
export function holdPlace(img: HTMLImageElement, soon = false): void {
  const src = img.getAttribute("src")
  const name = nameOf(src)
  if (!name) return
  const look = looks.get(name)
  if (look === undefined) {
    const then = (): void => void (img.getAttribute("src") === src && holdPlace(img, soon))
    waiting.set(name, (waiting.get(name) ?? new Set()).add(then))
    return void (all ? all.then(() => !looks.has(name) && ask(name)) : ask(name))
  }
  if (!look) return
  const [width, height, hash, top, bottom] = look
  // With black bands baked in, only the picture between them: its own shape, and the bands cut away.
  const tall = height * (1 - top - bottom)
  img.style.setProperty("aspect-ratio", `auto ${width} / ${tall}`)
  img.style.setProperty("--mf-pic-w", `${width}px`)
  img.style.setProperty("--mf-pic-r", String(width / tall))
  // Seen through a box without the bands, the picture is as if it never had them.
  if (top || bottom) img.style.setProperty("object-view-box", `inset(${top * 100}% 0 ${bottom * 100}%)`)
  img.dataset.held = ""
  // Kept from the file's first bytes, its shape can be wrong (a camera's turn
  // read one way here and another by the browser): once drawn, the picture's
  // own shape wins, so its box is never another shape than it is.
  const own = (): void => {
    if (top || bottom || !img.naturalWidth || Math.abs((img.naturalWidth / img.naturalHeight) / (width / tall) - 1) < 0.02) return
    img.style.setProperty("aspect-ratio", `auto ${img.naturalWidth} / ${img.naturalHeight}`)
    img.style.setProperty("--mf-pic-w", `${img.naturalWidth}px`)
    img.style.setProperty("--mf-pic-r", String(img.naturalWidth / img.naturalHeight))
  }
  if (img.complete) own()
  else img.addEventListener("load", own, { once: true })
  if ((img.complete && img.naturalWidth) || !hash || img.dataset.waiting !== undefined) return
  img.dataset.waiting = ""
  let blur = ""
  const paint = (): void => {
    if (blur || img.dataset.waiting === undefined) return
    blur = `url(${blurOf(hash)})`
    img.style.backgroundImage = blur
  }
  if (soon) paint()
  else later(paint)
  const done = (): void => {
    img.style.removeProperty("background-image")
    delete img.dataset.waiting
    fade?.cancel()
  }
  let fade: Animation | undefined
  const shown = (): void => {
    // A banded one is simply put in place: its blur is of the picture without its bands, drawn another size.
    if (!img.isConnected || still() || !img.naturalWidth || top || bottom) return done()
    paint()
    // The picture itself is drawn as the background for the fade, over its
    // blur, and is let through once the fade is done: the same pixels, so the
    // hand-over cannot be seen.
    fade = img.animate([{ backgroundImage: blur }, { backgroundImage: `url(${JSON.stringify(img.currentSrc || img.src)})` }], { duration: 180, easing: "cubic-bezier(0, 0, 0.2, 1)", fill: "forwards" })
    fade.finished.then(done, done)
  }
  img.addEventListener("load", () => void img.decode().then(shown, done), { once: true })
  img.addEventListener("error", () => {
    done()
    for (const one of ["aspect-ratio", "--mf-pic-w", "--mf-pic-r", "object-view-box"]) img.style.removeProperty(one)
    delete img.dataset.held
  }, { once: true })
}

/** The view box that leaves out a picture's baked-in bands, for object-view-box, or nothing when it has none. */
export function withoutBands(src: string | null | undefined): string | undefined {
  const look = lookOf(src)
  return look && (look[3] || look[4]) ? `inset(${look[3] * 100}% 0 ${look[4] * 100}%)` : undefined
}

/** A picture's colours as a CSS image, to stand in its place until it loads, or nothing when they are not known. */
export function blurFor(src: string | null | undefined): string | undefined {
  const hash = lookOf(src)?.[2]
  return hash ? `url(${blurOf(hash)})` : undefined
}

/** A picture's average colour, for a small box to wear until its picture arrives: next to no work, however many there are. */
export function tintFor(src: string | null | undefined): string | undefined {
  const hash = lookOf(src)?.[2]
  if (!hash) return undefined
  const { r, g, b } = thumbHashToAverageRGBA(Uint8Array.from(atob(hash), (c) => c.charCodeAt(0)))
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`
}

/**
 * Its colours behind a picture until it loads, painted while the window is
 * idle, for a picture whose box is already its size (a link card's).
 */
export function paintWhileLoading(img: HTMLImageElement | null): void {
  if (!img || img.dataset.painted !== undefined) return
  img.dataset.painted = ""
  later(() => {
    const blur = !(img.complete && img.naturalWidth) && blurFor(img.getAttribute("src"))
    if (!blur) return
    img.style.backgroundImage = blur
    img.addEventListener("load", () => void (img.style.backgroundImage = ""), { once: true })
  })
}
