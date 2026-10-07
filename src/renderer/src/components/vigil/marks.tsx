import { useState, type CSSProperties, type ReactNode } from 'react'

/**
 * Margin marks: the few things in Vigil drawn as if by hand, the way you
 * would mark your own page. A tick and a line struck through a to-do the
 * moment you finish it, a loose ring round today, a small arrow when there is nothing
 * yet, a pen rule under the day's brief, and the ink line under the first
 * thing you caught. Rare on purpose: they belong to moments, never to rows.
 *
 * Each one wobbles a little differently, seeded by what it marks, so no two
 * look stamped; the same thing always gets the same wobble. Drawn with the
 * pen's speed only when your pointer did the thing that brought it; reached
 * by a key, or with Motion off, it is simply there. Margin marks off in
 * Settings (data-marks="off" on the root) hides every one, and the plain
 * line each replaces comes back (main.css).
 */

/**
 * Whether to write it with the pen, settled when the mark first appears: a
 * later render never starts it again or cuts it short. A function is asked
 * once, then.
 */
type Pen = boolean | (() => boolean)
const usePen = (draw: Pen = false): boolean => useState(draw)[0]

/** A steady run of numbers from a word: 0 to 1, the same run every time for the same word. */
export function seeded(key: string): () => number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let t = Math.imul(h ^ (h >>> 15), 1 | h)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Between -1 and 1. */
const wobble = (rand: () => number): number => rand() * 2 - 1
const f = (n: number): string => n.toFixed(2)

/** The ink line under a word `w` wide and 6 tall: one easy stroke, dipping and lifting. */
export function inkPath(w: number, seed: string): string {
  const r = seeded(seed)
  return `M1 ${f(3.6 + wobble(r) * 0.5)} C ${f(w * (0.28 + wobble(r) * 0.06))} ${f(1.4 + wobble(r) * 0.5)}, ${f(w * (0.55 + wobble(r) * 0.06))} ${f(5.4 - r() * 0.6)}, ${f(w - 1)} ${f(2.2 + wobble(r) * 0.5)}`
}

/**
 * A loose ring round a point: started a little left of the top, taken once
 * round and a bit past, the end not quite meeting the start, as a quick pen
 * makes it. In the caller's units, so it can sit inside another drawing.
 */
export function ringPath(cx: number, cy: number, rx: number, ry: number, seed: string): string {
  const r = seeded(seed)
  const tilt = wobble(r) * 0.18
  const from = -Math.PI * (0.62 + r() * 0.12)
  const turn = Math.PI * 2 * (1.08 + r() * 0.06)
  const steps = 12
  const drift = 0.08 + r() * 0.07
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = from + turn * t
    // Fuller on one side than the other, and opening out as it closes.
    const k = 1 + wobble(r) * 0.045 + drift * t * t
    const x = Math.cos(a) * rx * k
    const y = Math.sin(a) * ry * k
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)])
  }
  // Catmull-Rom through the points, as curves.
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)]
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
  }
  return d
}

/** A line nearly level across 0 to 100, at about `y`, with `bends` easy swells no taller than `lift`. */
function levelPath(seed: string, y: number, lift: number, bends: number): string {
  const r = seeded(seed)
  const start = y + wobble(r) * lift
  let d = `M0 ${f(start)}`
  for (let i = 0; i < bends; i++) {
    const x0 = (100 * i) / bends, x1 = (100 * (i + 1)) / bends
    d += ` C${f(x0 + (x1 - x0) * 0.35)} ${f(y + wobble(r) * lift)} ${f(x0 + (x1 - x0) * 0.65)} ${f(y + wobble(r) * lift)} ${f(x1)} ${f(y + wobble(r) * lift * 0.6)}`
  }
  return d
}

const STRETCH: CSSProperties = { vectorEffect: 'non-scaling-stroke' }

/**
 * A pen line through a finished to-do, a touch past the words at each end,
 * rising a hair as it goes. `draw` when it was ticked with the pointer just
 * now: then it is written left to right, once.
 */
export function Strike({ seed, draw: asked }: { seed: string; draw?: Pen }): React.JSX.Element {
  const draw = usePen(asked)
  const r = seeded(`strike:${seed}`)
  // Starts low and a little before the words, bows, and lifts off past them.
  const a = 8.2 + wobble(r) * 0.8, b = 3.6 + wobble(r) * 0.8
  const bow = 1.4 + r() * 1.2
  return (
    <svg aria-hidden viewBox="0 0 100 12" preserveAspectRatio="none"
      className={`mf-mark pointer-events-none absolute top-[calc(50%-0.3rem)] -left-[4px] h-3 w-[calc(100%+10px)] overflow-visible text-foreground ${draw ? 'mf-pen-across mf-now' : ''}`}>
      <path d={`M0 ${f(a)} C${f(28 + wobble(r) * 6)} ${f(a - bow)}, ${f(62 + wobble(r) * 6)} ${f(b + bow * 0.3)}, 100 ${f(b)}`} fill="none" stroke="currentColor" strokeOpacity={0.6} strokeWidth={1.6} strokeLinecap="round" style={STRETCH} />
    </svg>
  )
}

/**
 * The words with a pen line through them, sized to the words themselves
 * (not their row), for a to-do once it is done. Margin marks off, the plain
 * line-through it stands in for comes back.
 */
export function Struck({ seed, draw, children }: { seed: string; draw?: Pen; children: ReactNode }): React.JSX.Element {
  return (
    <span className="relative">
      {children}
      <Strike seed={seed} draw={draw} />
    </span>
  )
}

/**
 * A tick by hand, for a round box once it is done: a short stroke down and
 * a longer one up, in one go. Sized by its box; `draw` writes it once.
 */
export function Tick({ seed, draw: asked, className = '' }: { seed: string; draw?: Pen; className?: string }): React.JSX.Element {
  const draw = usePen(asked)
  const r = seeded(`tick:${seed}`)
  const d = `M${f(2 + wobble(r) * 0.3)} ${f(5.3 + wobble(r) * 0.4)} C${f(3 + wobble(r) * 0.2)} ${f(6.1 + wobble(r) * 0.3)}, ${f(3.7 + wobble(r) * 0.2)} ${f(7 + wobble(r) * 0.2)}, ${f(4.2 + wobble(r) * 0.2)} ${f(7.9 + wobble(r) * 0.2)} C${f(5.2 + wobble(r) * 0.3)} ${f(5.7 + wobble(r) * 0.4)}, ${f(6.6 + wobble(r) * 0.3)} ${f(3.7 + wobble(r) * 0.4)}, ${f(8.5 + wobble(r) * 0.3)} ${f(2 + wobble(r) * 0.4)}`
  return (
    <svg aria-hidden viewBox="0 0 10 10" className={`mf-mark pointer-events-none overflow-visible ${className}`}>
      <path d={d} pathLength={1} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        className={draw ? 'mf-pen mf-now' : ''} style={{ strokeDasharray: 1, strokeDashoffset: draw ? 1 : 0 }} />
    </svg>
  )
}

/** A pen rule along the top of whatever it is put in (which should be `relative`), in place of a hairline border. */
export function Rule({ seed, className = '' }: { seed: string; className?: string }): React.JSX.Element {
  return (
    <svg aria-hidden viewBox="0 0 100 6" preserveAspectRatio="none" className={`mf-mark pointer-events-none absolute inset-x-0 -top-[3px] h-1.5 w-full overflow-visible ${className}`}>
      <path d={levelPath(`rule:${seed}`, 3, 1.4, 4)} fill="none" stroke="color-mix(in oklab, var(--foreground) 16%, transparent)" strokeWidth={1.25} strokeLinecap="round" style={STRETCH} />
    </svg>
  )
}

/**
 * A loose ring round a small thing (a day's number), in `ink` or the
 * text's own colour, with room made for it either side. `draw` writes it once round, with a pen's speed.
 */
export function Ring({ seed, draw: asked, ink = 'currentColor', children, className = '' }: { seed: string; draw?: Pen; ink?: string; children: ReactNode; className?: string }): React.JSX.Element {
  const draw = usePen(asked)
  return (
    <span className={`mf-ringed relative inline-grid place-items-center ${className}`}>
      {children}
      <svg aria-hidden viewBox="0 0 30 22" className="mf-mark pointer-events-none absolute top-1/2 left-1/2 h-[1.6em] w-[1.95em] -translate-x-1/2 -translate-y-1/2 overflow-visible">
        <path d={ringPath(15, 11, 12.5, 9.5, `ring:${seed}`)} pathLength={1} fill="none" stroke={ink} strokeWidth={1.2} strokeLinecap="round" strokeOpacity={0.8}
          className={draw ? 'mf-pen' : ''} style={{ strokeDasharray: 1, strokeDashoffset: draw ? 1 : 0 }} />
      </svg>
    </span>
  )
}

/**
 * A small arrow from the margin, curling down and round to point left at
 * what sits beside it: the one thing to do when there is nothing yet.
 */
export function Arrow({ seed, draw: asked, className = '' }: { seed: string; draw?: Pen; className?: string }): React.JSX.Element {
  const draw = usePen(asked)
  const r = seeded(`arrow:${seed}`)
  const sx = 38 + wobble(r) * 2, sy = 3 + wobble(r) * 1.5
  const ex = 6 + wobble(r), ey = 25 + wobble(r) * 1.5
  const shaft = `M${f(sx)} ${f(sy)} C${f(sx + 6 + wobble(r) * 2)} ${f(14 + wobble(r) * 2)}, ${f(26 + wobble(r) * 3)} ${f(ey + 2 + wobble(r))}, ${f(ex)} ${f(ey)}`
  // The head: two short strokes back from the point, not quite even.
  const head = `M${f(ex + 6.5 + wobble(r))} ${f(ey - 5 + wobble(r))} L${f(ex)} ${f(ey)} L${f(ex + 7 + wobble(r))} ${f(ey + 3.5 + wobble(r) * 0.8)}`
  const pen = (delay: number): CSSProperties => ({ strokeDasharray: 1, strokeDashoffset: draw ? 1 : 0, animationDelay: draw ? `${delay}ms` : undefined })
  return (
    <svg aria-hidden viewBox="0 0 46 32" className={`mf-mark pointer-events-none h-8 w-[2.875rem] shrink-0 overflow-visible text-primary ${className}`}>
      <g fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.75}>
        <path d={shaft} pathLength={1} className={draw ? 'mf-pen' : ''} style={pen(420)} />
        <path d={head} pathLength={1} className={draw ? 'mf-pen mf-pen-quick' : ''} style={pen(420 + 340)} />
      </g>
    </svg>
  )
}
