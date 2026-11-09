/**
 * Faces and subjects framed: wherever one of your pictures is cut to a shape
 * (a person's round photo, a square tile, a card's cover), the cut is centred
 * on the largest face in it, or else on what the eye goes to first, as your
 * Mac's Vision sees it (main/labels.ts, "picture:focus"), never on the middle
 * by chance. One place for every surface: any stored picture drawn with
 * object-fit: cover is placed as it loads, unless its own style already says
 * where. Read once a picture and kept.
 */

const STORED = /^(?:haligtree|mindflow):\/\/assets\/[a-f0-9]{64}\.(?:png|jpe?g|webp|heic|gif|tiff?)$/i
const known = new Map<string, Promise<{ x: number; y: number } | null>>()
const focusOf = (src: string): Promise<{ x: number; y: number } | null> => {
  let one = known.get(src)
  if (!one) {
    one = window.api.haligtree<{ x: number; y: number } | null>('picture:focus', src).catch(() => null)
    known.set(src, one)
  }
  return one
}

/** The share along one side to place a cut at, so the point lands in its middle and the cut stays inside the picture. */
const along = (point: number, shown: number, box: number): number => {
  const spare = shown - box
  if (spare <= 0.5) return 50
  return (Math.min(spare, Math.max(0, point * shown - box / 2)) / spare) * 100
}

// Pictures are measured and moved together once a frame, every reading before any writing: one at a time, each
// size read after another picture moved made the browser lay the whole page out again, 52 times over in a note of
// link cards as it opened (10 Nov).
let loaded: HTMLImageElement[] = []
let focused: [HTMLImageElement, { x: number; y: number }][] = []
let focusFrame = 0
const focusSoon = (): void => void (focusFrame ||= requestAnimationFrame(settleFocus))
function settleFocus(): void {
  focusFrame = 0
  const fresh = loaded.filter((img) => STORED.test(img.src) && img.dataset.focused === undefined && !img.style.objectPosition && img.naturalWidth && getComputedStyle(img).objectFit === 'cover')
  loaded = []
  for (const img of fresh) {
    img.dataset.focused = ''
    void focusOf(img.src).then((at) => at && (focused.push([img, at]), focusSoon()))
  }
  const sized = focused.map(([img, at]) => [img, at, img.clientWidth, img.clientHeight] as const)
  focused = []
  for (const [img, at, bw, bh] of sized) {
    if (!bw || !bh) continue
    const scale = Math.max(bw / img.naturalWidth, bh / img.naturalHeight)
    img.style.objectPosition = `${along(at.x, img.naturalWidth * scale, bw).toFixed(1)}% ${along(at.y, img.naturalHeight * scale, bh).toFixed(1)}%`
  }
}
const place = (img: HTMLImageElement): void => void (loaded.push(img), focusSoon())

if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.api) {
  // An image's load does not bubble; heard on the way down instead.
  document.addEventListener('load', (event) => event.target instanceof HTMLImageElement && place(event.target), true)
  // Those already drawn before this was listening.
  const now = (): void => document.querySelectorAll('img').forEach((img) => img.complete && place(img))
  if (document.readyState === 'complete') now()
  else window.addEventListener('load', now, { once: true })
}
