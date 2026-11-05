/**
 * Cards from a picture (Anki's image occlusion): covers drawn over a picture's
 * labels, each group of covers one card. Every measure is a share of the
 * picture (0 to 1, from the top left), so a cover stays put at any size.
 */
export type CoverKind = 'box' | 'oval' | 'shape' | 'brush'
export type Cover = {
  kind: CoverKind
  x: number
  y: number
  w: number
  h: number
  /** A free shape's corners, or a brush's path. */
  points?: [number, number][]
  /** A brush's width, as a share of the picture's width. */
  size?: number
  /** Covers with the same group are asked together, as one card. */
  group: number
  /** The card's answer in words: the label it hides when one was found there, or words typed on the cover. */
  text?: string
  /** The editor's own name for it while drawing, so it lands and lifts as itself; never kept on a card. */
  id?: number
}
/** "one": only the asked cover hides its label; "all": every cover hides, the asked one glows. */
export type Hide = 'one' | 'all'
/** `question`: one line asked over the picture on every card (Anki's Header), or the plain "What is hidden?". */
export type Occlusion = { src: string; covers: Cover[]; ask: number; hide: Hide; question?: string }
export type Label = { text: string; x: number; y: number; w: number; h: number }

/** A card's picture and covers, from its fields, if it was made from a picture. */
export function occlusionOf(fields: unknown): Occlusion | null {
  try {
    const parsed = typeof fields === 'string' ? JSON.parse(fields) : fields
    const one = (parsed as { occlusion?: Occlusion } | null)?.occlusion
    return one && typeof one.src === 'string' && Array.isArray(one.covers) ? one : null
  } catch {
    return null
  }
}

/** A found label's cover: its box with a little room round it, so no stroke of a letter shows. */
export function coverOf(label: Label, group: number): Cover {
  const padX = Math.max(0.004, label.h * 0.25)
  const padY = label.h * 0.25
  const x = Math.max(0, label.x - padX)
  const y = Math.max(0, label.y - padY)
  return { kind: 'box', x, y, w: Math.min(1 - x, label.w + padX * 2), h: Math.min(1 - y, label.h + padY * 2), group, text: label.text }
}

/** How much of `a` lies over `b`, as a share of `a`. */
export function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? (w * h) / Math.max(1e-6, a.w * a.h) : 0
}

/**
 * A box or oval drawn near a found label snaps to it: most of the label
 * under it, or the drawn one mostly over the label. Labels the same size
 * (Clara: "make the labels like the same size") come of snapping to them.
 */
export function snapped(drawn: Cover, labels: Label[]): Cover {
  if (drawn.kind !== 'box' && drawn.kind !== 'oval') return drawn
  const near = labels.map((label) => ({ label, score: Math.max(overlap(label, drawn), overlap(drawn, label)) })).filter((one) => one.score > 0.5).sort((a, b) => b.score - a.score)[0]
  return near ? { ...coverOf(near.label, drawn.group), kind: drawn.kind } : drawn
}

/** The box round a list of points. */
export function boxOf(points: [number, number][]): { x: number; y: number; w: number; h: number } {
  const xs = points.map((one) => one[0])
  const ys = points.map((one) => one[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** The room a cover takes on the picture: a brush's path with its stroke's width round it. */
export function extent(cover: Cover, aspect = 1): { x: number; y: number; w: number; h: number } {
  if (cover.kind !== 'brush' || !cover.points) return { x: cover.x, y: cover.y, w: cover.w, h: cover.h }
  const box = boxOf(cover.points)
  const rx = (cover.size ?? 0.03) / 2
  const ry = rx * aspect
  return { x: box.x - rx, y: box.y - ry, w: box.w + rx * 2, h: box.h + ry * 2 }
}

/** Twice the area of a free shape (any sign), as a share of the picture's: a shape drawn as a line has none. */
const area = (points: [number, number][]): number => Math.abs(points.reduce((sum, [x, y], at) => {
  const [nx, ny] = points[(at + 1) % points.length]
  return sum + x * ny - nx * y
}, 0)) / 2

/**
 * Whether a cover is big enough to be seen and meant, on a picture shown `w`
 * by `h` points: at least `least` points each way (a free shape as much area
 * as a square that size, a brush stroke that long). A click, or a tremble of
 * the hand while clicking, makes nothing; every cover that counts is one you
 * can see and number.
 */
export function seen(cover: Cover, w: number, h: number, least = 10): boolean {
  if (![cover.x, cover.y, cover.w, cover.h].every(Number.isFinite)) return false
  if (cover.kind === 'brush') {
    const points = cover.points ?? []
    const long = points.slice(1).reduce((sum, [x, y], at) => sum + Math.hypot((x - points[at][0]) * w, (y - points[at][1]) * h), 0)
    return points.length > 1 && long >= least
  }
  if (cover.kind === 'shape') return (cover.points?.length ?? 0) > 2 && area(cover.points!) * w * h >= least * least && cover.w * w >= least / 2 && cover.h * h >= least / 2
  return cover.w * w >= least && cover.h * h >= least
}

/** Kept inside the picture: moved back in where it pokes out (a brush's stroke too), never cut down. */
export function inside(cover: Cover, aspect = 1): Cover {
  const box = extent(cover, aspect)
  const dx = box.x < 0 ? -box.x : box.x + box.w > 1 ? 1 - box.x - box.w : 0
  const dy = box.y < 0 ? -box.y : box.y + box.h > 1 ? 1 - box.y - box.h : 0
  return dx || dy ? moved(cover, dx, dy) : cover
}

/** A cover moved by a share of the picture. */
export function moved(cover: Cover, dx: number, dy: number): Cover {
  return { ...cover, x: cover.x + dx, y: cover.y + dy, points: cover.points?.map(([x, y]) => [x + dx, y + dy] as [number, number]) }
}

/** A cover stretched to a new box: a free shape's corners and a brush's path go with it. */
export function resized(cover: Cover, to: { x: number; y: number; w: number; h: number }): Cover {
  const sx = cover.w ? to.w / cover.w : 1
  const sy = cover.h ? to.h / cover.h : 1
  return { ...cover, ...to, points: cover.points?.map(([x, y]) => [to.x + (x - cover.x) * sx, to.y + (y - cover.y) * sy] as [number, number]) }
}

/** Whether two covers are one laid on the other: each lies almost wholly over the other. */
export const stacked = (a: Cover, b: Cover): boolean => overlap(a, b) > 0.85 && overlap(b, a) > 0.85

/** The groups in order, each once: card 1, card 2 and so on. */
export const groupsOf = (covers: Cover[]): number[] => [...new Set(covers.map((one) => one.group))].sort((a, b) => a - b)

/**
 * Anki's image occlusion note (23.10 and later) as covers: its Occlusion field
 * holds `{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.05:oi=1}}`,
 * one per cover, each cloze number one card. `oi=1` hides every cover.
 */
export function fromAnki(field: string): { covers: Cover[]; hide: Hide } {
  const covers: Cover[] = []
  let all = false
  for (const match of field.matchAll(/\{\{c(\d+)::image-occlusion:(rect|ellipse|polygon|text)((?::[a-z]+=[^:}]*)*)\}\}/gi)) {
    const group = Number(match[1])
    const values = new Map([...match[3].matchAll(/:([a-z]+)=([^:}]*)/gi)].map((one) => [one[1].toLowerCase(), one[2]]))
    const n = (key: string): number => Number(values.get(key) ?? 0) || 0
    if (values.get('oi') === '1') all = true
    const kind = match[2].toLowerCase()
    if (kind === 'polygon') {
      const points = (values.get('points') ?? '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number) as [number, number]).filter((one) => one.length === 2 && one.every(Number.isFinite))
      if (points.length > 2) covers.push({ kind: 'shape', ...boxOf(points), points, group })
    } else if (kind === 'ellipse') {
      const rx = n('rx')
      const ry = n('ry')
      // Anki keeps an ellipse by its top left corner and its two radii.
      covers.push({ kind: 'oval', x: n('left'), y: n('top'), w: rx * 2, h: ry * 2, group })
    } else if (kind === 'rect') covers.push({ kind: 'box', x: n('left'), y: n('top'), w: n('width'), h: n('height'), group })
  }
  // A cover with no size hides nothing and would ask about nothing: never kept.
  return { covers: covers.filter((one) => one.w > 0 && one.h > 0), hide: all ? 'all' : 'one' }
}

/**
 * The common add-on's note (Image Occlusion Enhanced): its Question Mask is an
 * SVG the picture's size, the asked shapes marked `qshape`, the others `shape`
 * (there only when it hides all). Read as covers, the asked ones group 1.
 */
export function fromAddOn(svg: string): { covers: Cover[]; hide: Hide } | null {
  const attr = (tag: string, name: string): number => Number(new RegExp(`\\s${name}="([-\\d.]+)`).exec(tag)?.[1] ?? NaN)
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? ''
  const view = /viewBox="[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/.exec(root)
  const W = attr(root, 'width') || Number(view?.[1])
  const H = attr(root, 'height') || Number(view?.[2])
  if (!(W > 0 && H > 0)) return null
  const covers: Cover[] = []
  for (const [tag] of svg.matchAll(/<(?:rect|ellipse|polygon)\b[^>]*>/gi)) {
    const kind = /class="([^"]*)"/.exec(tag)?.[1] ?? ''
    if (!/\bq?shape\b/.test(kind)) continue
    const group = /\bqshape\b/.test(kind) ? 1 : 2 + covers.length
    if (/^<rect/i.test(tag)) covers.push({ kind: 'box', x: attr(tag, 'x') / W, y: attr(tag, 'y') / H, w: attr(tag, 'width') / W, h: attr(tag, 'height') / H, group })
    else if (/^<ellipse/i.test(tag)) {
      const [cx, cy, rx, ry] = ['cx', 'cy', 'rx', 'ry'].map((one) => attr(tag, one))
      covers.push({ kind: 'oval', x: (cx - rx) / W, y: (cy - ry) / H, w: (rx * 2) / W, h: (ry * 2) / H, group })
    } else {
      const points = (/points="([^"]*)"/.exec(tag)?.[1] ?? '').trim().split(/\s+/).map((pair) => {
        const [x, y] = pair.split(',').map(Number)
        return [x / W, y / H] as [number, number]
      }).filter((one) => one.every(Number.isFinite))
      if (points.length > 2) covers.push({ kind: 'shape', ...boxOf(points), points, group })
    }
  }
  const ok = covers.filter((one) => [one.x, one.y, one.w, one.h].every(Number.isFinite) && one.w > 0 && one.h > 0)
  return ok.some((one) => one.group === 1) ? { covers: ok, hide: ok.some((one) => one.group !== 1) ? 'all' : 'one' } : null
}

/** Anki's notes from before its covers were kept as shares hold them in the picture's pixels: brought to shares here. */
export function inShares(covers: Cover[], width: number, height: number): Cover[] {
  if (!covers.some((one) => one.x > 1.001 || one.y > 1.001 || one.w > 1.001 || one.h > 1.001) || !(width > 0 && height > 0)) return covers
  return covers.map((one) => ({ ...one, x: one.x / width, y: one.y / height, w: one.w / width, h: one.h / height, points: one.points?.map(([x, y]) => [x / width, y / height] as [number, number]) }))
}
