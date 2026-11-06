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

async function place(img: HTMLImageElement): Promise<void> {
  if (!STORED.test(img.src) || img.dataset.focused !== undefined || img.style.objectPosition) return
  if (getComputedStyle(img).objectFit !== 'cover' || !img.naturalWidth) return
  img.dataset.focused = ''
  const at = await focusOf(img.src)
  if (!at) return
  const [bw, bh] = [img.clientWidth, img.clientHeight]
  if (!bw || !bh) return
  const scale = Math.max(bw / img.naturalWidth, bh / img.naturalHeight)
  img.style.objectPosition = `${along(at.x, img.naturalWidth * scale, bw).toFixed(1)}% ${along(at.y, img.naturalHeight * scale, bh).toFixed(1)}%`
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.api) {
  // An image's load does not bubble; heard on the way down instead.
  document.addEventListener('load', (event) => event.target instanceof HTMLImageElement && void place(event.target), true)
  // Those already drawn before this was listening.
  const now = (): void => document.querySelectorAll('img').forEach((img) => img.complete && void place(img))
  if (document.readyState === 'complete') now()
  else window.addEventListener('load', now, { once: true })
}
