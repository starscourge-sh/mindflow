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
  /** The label it hides, when it was found on the picture: the card's answer. */
  text?: string
}
/** "one": only the asked cover hides its label; "all": every cover hides, the asked one glows. */
export type Hide = 'one' | 'all'
export type Occlusion = { src: string; covers: Cover[]; ask: number; hide: Hide }
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
  return { covers, hide: all ? 'all' : 'one' }
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
  const ok = covers.filter((one) => [one.x, one.y, one.w, one.h].every(Number.isFinite))
  return ok.some((one) => one.group === 1) ? { covers: ok, hide: ok.some((one) => one.group !== 1) ? 'all' : 'one' } : null
}

/** Anki's notes from before its covers were kept as shares hold them in the picture's pixels: brought to shares here. */
export function inShares(covers: Cover[], width: number, height: number): Cover[] {
  if (!covers.some((one) => one.x > 1.001 || one.y > 1.001 || one.w > 1.001 || one.h > 1.001) || !(width > 0 && height > 0)) return covers
  return covers.map((one) => ({ ...one, x: one.x / width, y: one.y / height, w: one.w / width, h: one.h / height, points: one.points?.map(([x, y]) => [x / width, y / height] as [number, number]) }))
}
