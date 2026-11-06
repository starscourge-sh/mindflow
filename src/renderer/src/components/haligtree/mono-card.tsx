/*
 * Cards in the look of Amicro's Mono Charts (https://amicro.dev/mono-charts):
 * a big number first, small chips beside it, a tiny switch, and single-ink
 * rounded geometry on a soft stage, with a line under it that shows the value
 * under the pointer. Shapes and sizes follow Amicro's MonoActivityHeatmap,
 * MonoRoundedBarChart, MonoRoundedGaugeArc, MonoRoundedLineChart,
 * MonoRoundedStackedBarChart and MonoRoundedFunnelChart, drawn here in the
 * theme's ink, without their demo data or recharts.
 *
 * Amicro: MIT License, Copyright (c) 2026 SYED SUBHAN UDDIN. Permission is
 * hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the
 * Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to
 * do so, subject to the following conditions: The above copyright notice and
 * this permission notice shall be included in all copies or substantial
 * portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
 * OF ANY KIND.
 */
/*
 * What each Amicro chart does when touched, and how it is carried over here
 * (values from its source; recharts' own defaults where Amicro leaves them):
 * - Card entry: opacity 0, scale 0.98, y 6 to rest, 0.25s on [0.16, 1, 0.3, 1].
 * - Bars and lines: grow from the baseline and draw in over 280ms (recharts
 *   animationDuration 280, easing "ease"), and on a range change glide from
 *   the old values to the new over the same 280ms.
 * - Pointing: recharts' tooltip follows the pointer, gliding to it over 400ms
 *   "ease"; on bars a faint band lights the column under it, on lines a guide
 *   line stands at the point (dashed "3 3" on Amicro's scatter and bubble).
 * - Line dots: resting r 3.5 with a 2px ring of the card, the one pointed at
 *   r 5.5 with a 2px mid-grey ring; the dashed line is 1.5px, "4 4".
 * - Heatmap dots: whileHover scale 1.35, the readout line under the grid
 *   says the cell's count and date.
 * - Tiles and stages (treemap, pyramid): stagger in at 0.05s each, 0.25s,
 *   from scale 0.92 (or scaleX 0.85); pointed at, scale 1.02 to 1.03 over 200ms.
 * Added here for Haligtree: the other bars dim while one is pointed at, the
 * switch is the app's own sliding pill (Chips), and the big number rolls.
 * With reduced motion or motion off, every one of these shows its end at once.
 */
import { useId, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion, MotionGlobalConfig } from 'motion/react'
import { Rolling } from './ui'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { line as path, area as fill, curveMonotoneX } from 'd3-shape'
import { Chips } from './display'
import { useSeen } from '@/lib/reads-in'

const EASE = [0.16, 1, 0.3, 1] as const
/** recharts' "ease" (CSS ease), the curve its bars and lines grow and morph on. */
const RECHARTS_EASE = [0.25, 0.1, 0.25, 1] as const
const DRAW = 0.28
const useStillness = (): boolean => !!useReducedMotion() || !!MotionGlobalConfig.skipAnimations
/**
 * Whether a chart may play its entry: once the page it is on is on show. A
 * Stats page is laid out unseen until every part has read (lib/reads-in.tsx),
 * and an entry started then had finished before anyone could see it.
 */
const useArrived = (): boolean => {
  // Both hooks every render, in one order.
  const seen = useSeen()
  const still = useStillness()
  return seen || still
}

/**
 * A tone of the ink: Amicro's three steps, lifted so the faintest still passes
 * 3:1 against the card on every theme and finish (qa/charts-pass.mjs measures
 * it), and the faint track for what is not data (a day with none, the rest of a gauge).
 */
const INK = 'var(--foreground)'
export const TONES = [1, 0.8, 0.62]
/** The faintest a mark that is data may be: below it, a mark fails 3:1 on the paper. */
export const INK_FLOOR = 0.62
/**
 * A heatmap's five steps of ink, as GitHub's and Anki's have: none (faint, not data), then four by share of the busiest
 * day, the lightest still 3:1 against its card on every theme and finish. Every day grid in the app shades from these.
 */
export const INK_STEPS = [9, 62, 75, 88, 100]
export const inkShade = (step: number): string => `color-mix(in oklab, var(--foreground) ${INK_STEPS[step]}%, transparent)`

/** A small round chip beside the big number: "5 of 7 days", "12 weeks". */
export function Chip({ children }: { children: ReactNode }): React.JSX.Element {
  return <span data-mono-chip className="inline-flex items-center gap-1 rounded-[4px] border border-foreground/10 bg-foreground/[0.04] px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground">{children}</span>
}

/** The tiny switch on a card (7 days / 30 days), the app's own chips, whose pill slides to the one picked. */
export function Switch<T extends string>({ options, value, pick }: { options: { id: T; label: string }[]; value: T; pick: (id: T) => void }): React.JSX.Element {
  return <span data-mono-switch={value} className="shrink-0"><Chips options={options} on={(id) => id === value} pick={(id) => pick(id as T)} className="flex-nowrap" /></span>
}

/**
 * One card per idea: the number, what it counts, chips, a switch on the
 * right, the picture straight on the card (never a darker panel inside it),
 * then one bold line that says the point, with an arrow when it says a rise or
 * a fall, and under it in quiet ink what the marks are. While a mark is pointed at, its value takes the number's place.
 * With too little to draw (`enough` false) the card keeps its number and says
 * one sentence in the picture's place: never a chart that is mostly empty frame.
 */
export function MonoCard({ name, title, value, unit, chips, side, point, trend, note, children, hovered, enough = true, sparse }: {
  name: string; title: string; value: string | number; unit?: string; chips?: ReactNode; side?: ReactNode; point: ReactNode; trend?: 'up' | 'down'; children?: ReactNode; hovered?: string | null
  /** Under the point in quiet ink, as shadcn's range line: what the marks are. */ note?: ReactNode
  /** Whether there is enough to draw a chart from. */ enough?: boolean
  /** Said in the chart's place while there is not enough. */ sparse?: ReactNode
}): React.JSX.Element {
  const still = useStillness()
  const arrived = useArrived()
  const stage = useRef<HTMLDivElement>(null)
  // As Amicro's cards do, the big number turns to the mark pointed at ("6" and "reviews, Sat 31 Oct"), and back on leaving.
  const swap = hovered ? (/^([\d,.]+%?)\s+(.*)$/.exec(hovered) ?? (/^No /.test(hovered) ? [hovered, '0', hovered.replace(/^No /, '')] : [hovered, typeof value === 'number' ? value.toLocaleString() : value, hovered])) : null
  const Arrow = trend === 'up' ? TrendingUp : TrendingDown
  return (
    <motion.section data-mono-card={name} aria-label={title} className="mf-chart flex min-w-0 flex-col gap-2"
      initial={still ? false : { opacity: 0, scale: 0.98, y: 6 }} animate={arrived ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.98, y: 6 }} transition={{ duration: 0.25, ease: EASE }}>
      <p className="mf-chart-title">{title}</p>
      {/* One line, at rest and while a mark is pointed at: the readout takes the number's place here and nowhere else, so nothing grows. */}
      <div data-mono-head className="flex flex-nowrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-nowrap items-baseline gap-2 overflow-hidden">
          <span data-mono-value={value} data-mono-shown={swap ? swap[1] : value} className="text-2xl leading-none font-semibold text-foreground tabular-nums"><Rolling text={swap ? swap[1] : typeof value === 'number' ? value.toLocaleString() : value} /></span>
          {(swap ? swap[2] : unit) && <span className="min-w-0 truncate text-sm text-muted-foreground">{swap ? swap[2] : unit}</span>}
          {chips && <span className={`flex shrink-0 gap-1 ${swap ? 'invisible' : ''}`}>{chips}</span>}
        </div>
        {side}
      </div>
      {enough && children && <div ref={stage} data-mono-stage className="relative py-1">{children}</div>}
      {/* Too little to draw: the one sentence takes the point's place, which would only describe marks that are not there. */}
      {enough || !sparse ? <p data-mono-point className="flex min-h-5 items-center gap-1.5 text-sm font-medium text-foreground">{point}{trend && <Arrow aria-label={trend === 'up' ? 'up' : 'down'} className="size-4 shrink-0" />}</p>
        : <p data-mono-point data-chart-sparse className="min-h-5 text-sm font-medium text-foreground">{sparse}</p>}
      {note && enough && <p data-mono-note className="-mt-1.5 text-xs text-muted-foreground">{note}</p>}
    </motion.section>
  )
}

/** Hover state for a card's marks: what the tip and the line under the stage say while one is pointed at. */
export function useHover(): [string | null, (said: string | null) => void] {
  return useState<string | null>(null)
}

/**
 * Dot-matrix days: one round dot per day in columns, the darker the more.
 * The dots fill in, oldest first; the one pointed at grows to 1.35.
 */
export function DotMatrix({ days, say, onHover, columns = 7, dot = 14 }: { days: { day: string; n: number }[]; say: (day: { day: string; n: number }) => string; onHover: (said: string | null) => void; /** Rows: 7 for a year of weeks, fewer for a month in one wide band. */ columns?: number; /** The widest a dot may grow, in px. */ dot?: number }): React.JSX.Element {
  const still = useStillness()
  const arrived = useArrived()
  const most = Math.max(1, ...days.map((one) => one.n))
  const tone = (n: number): number => (n === 0 ? 0.1 : INK_FLOOR + (1 - INK_FLOOR) * Math.min(1, n / most))
  const across = Math.ceil(days.length / columns)
  return (
    // Packed tight at their own size, never spread to fill the stage (memory compact-dots: spaced-out dots read as low effort).
    <div data-mono-dots className="mx-auto grid w-fit max-w-full" style={{ gridTemplateColumns: `repeat(${across}, ${dot}px)`, gridTemplateRows: `repeat(${columns}, auto)`, gridAutoFlow: 'column', gap: Math.max(2, Math.min(3, dot / 4)) }} onPointerLeave={() => onHover(null)}>
      {days.map((one, at) => (
        <motion.span key={one.day} data-day={one.day} data-n={one.n} data-say={say(one)}
          onPointerEnter={() => onHover(say(one))}
          initial={still ? false : { opacity: 0, scale: 0.4 }} animate={arrived ? { opacity: tone(one.n), scale: 1 } : { opacity: 0, scale: 0.4 }} whileHover={still ? undefined : { scale: 1.35, zIndex: 10 }}
          transition={{ duration: 0.25, ease: EASE, delay: still ? 0 : Math.min(0.6, at * 0.008) }}
          className="aspect-square w-full rounded-[2px]" style={{ background: INK }} />
      ))}
    </div>
  )
}

/**
 * Bars, one per value, the same width in every chart (6 px pills, round at both
 * ends as Mono's pill pillars are), standing on one hairline baseline, with
 * a quiet hairline at the tallest and its value: the scale. A day with none
 * draws nothing. Pointing at a bar dims the others; nothing moves or redraws.
 */
export function PillBars({ values, keys, say, onHover, className = 'h-20', unit = '' }: { values: number[]; keys?: string[]; say: (at: number) => string; onHover: (said: string | null) => void; className?: string; /** Said after the top value ("min"). */ unit?: string }): React.JSX.Element {
  const still = useStillness()
  const arrived = useArrived()
  const [on, setOn] = useState<number | null>(null)
  const most = Math.max(1, ...values)
  return (
    <div data-focus-bars data-hovered={on ?? undefined} className={`relative ${className}`} onPointerLeave={() => (setOn(null), onHover(null))}>
      {/* The scale: a hairline at the tallest bar with its value, and the baseline. */}
      <span aria-hidden data-bars-top className="pointer-events-none absolute inset-x-0 top-0 border-t border-foreground/10" />
      <span aria-hidden className="pointer-events-none absolute top-0 right-0 -translate-y-full pb-0.5 text-[10px] leading-none text-muted-foreground tabular-nums">{Math.round(most).toLocaleString()}{unit && ` ${unit}`}</span>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-foreground/20" />
      <div className="absolute inset-0 flex items-end">
        {values.map((n, at) => (
          <span key={keys?.[at] ?? at} data-bar={at} data-say={say(at)} onPointerEnter={() => (setOn(at), onHover(say(at)))}
            className={`flex h-full flex-1 items-end justify-center rounded-[2px] ${on === at ? 'bg-foreground/[0.06]' : ''}`}>
            {n > 0 && (
              <motion.span initial={still ? false : { scaleY: 0 }} animate={{ scaleY: arrived ? 1 : 0, opacity: on === null || on === at ? 1 : 0.35 }}
                transition={{ scaleY: { duration: still ? 0 : DRAW, ease: RECHARTS_EASE, delay: still ? 0 : Math.min(0.3, at * 0.012) }, opacity: { duration: 0.12 } }}
                className="block w-1.5 origin-bottom rounded-full" style={{ height: `max(6px, ${(n / most) * 100}%)`, background: INK }} />
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Amicro's arc gauge: a rounded semi-circle, the ink for the share, a faint track for the rest; it fills on arrival. */
export function Arc({ percent, label, className = 'max-w-[220px]' }: { percent: number; label: string; className?: string }): React.JSX.Element {
  const still = useStillness()
  const arrived = useArrived()
  const r = 64
  const path = `M ${80 - r} 80 A ${r} ${r} 0 0 1 ${80 + r} 80`
  return (
    <div data-mono-arc data-percent={percent} className={`relative mx-auto w-full ${className}`}>
      <svg viewBox="0 0 160 90" className="w-full" role="img" aria-label={label}>
        <path d={path} fill="none" stroke={INK} strokeOpacity={0.1} strokeWidth={14} strokeLinecap="round" />
        <motion.path d={path} fill="none" stroke={INK} strokeWidth={14} strokeLinecap="round"
          initial={still ? false : { pathLength: 0 }} animate={{ pathLength: arrived ? Math.max(0.001, percent / 100) : 0 }} transition={{ duration: 0.6, ease: EASE }} />
      </svg>
      <span className="absolute inset-x-0 bottom-0 text-center text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

/**
 * Lines through points on a monotone curve (it bends between points but never
 * swings past them or below zero, as shadcn's and Mono's splines do), every
 * series continuous to the last point; a dashed one to set the full one
 * against. The full line has a soft wash under it, a filled dot on every point
 * and, with few points, its value over each. Pointing stands a guide at the
 * nearest point and rings its dot; nothing grows or redraws.
 */
export function Spline({ lines, say, onHover }: { lines: { values: number[]; dashed?: boolean; name: string }[]; say: (at: number) => string; onHover: (said: string | null) => void }): React.JSX.Element {
  const still = useStillness()
  const arrived = useArrived()
  const [on, setOn] = useState<number | null>(null)
  const wash = useId()
  const count = lines[0]?.values.length ?? 0
  const most = Math.max(1, ...lines.flatMap((line) => line.values))
  const [w, h] = [300, 90]
  const x = (at: number): number => (count < 2 ? w / 2 : (at / (count - 1)) * (w - 12) + 6)
  const y = (n: number): number => h - 8 - (Math.max(0, n) / most) * (h - 22)
  const curve = (values: number[]): string => path<number>().x((_, at) => x(at)).y((n) => y(n)).curve(curveMonotoneX)(values) ?? ''
  const under = (values: number[]): string => fill<number>().x((_, at) => x(at)).y0(h - 8).y1((n) => y(n)).curve(curveMonotoneX)(values) ?? ''
  const full = lines.find((line) => !line.dashed)
  // A value over each point only while there are few enough to read (shadcn's labelled line): six or fewer.
  const labelled = count <= 6
  return (
    <div data-mono-spline data-hovered={on ?? undefined} className="relative h-24" onPointerLeave={() => (setOn(null), onHover(null))}>
      {/* Faded in as a whole, never drawn along its length: a drawn-in line dashes itself and can stop short. */}
      <motion.svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label={lines.map((line) => line.name).join(' and ')}
        initial={still ? false : { opacity: 0 }} animate={{ opacity: arrived ? 1 : 0 }} transition={{ duration: still ? 0 : 0.3, ease: EASE }}>
        <defs><linearGradient id={wash} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={INK} stopOpacity={0.16} /><stop offset="100%" stopColor={INK} stopOpacity={0} /></linearGradient></defs>
        <line x1={0} x2={w} y1={h - 8} y2={h - 8} stroke={INK} strokeOpacity={0.2} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <line data-mono-guide x1={x(on ?? 0)} x2={x(on ?? 0)} y1={0} y2={h} stroke={INK} strokeOpacity={on === null ? 0 : 0.3} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {full && <path data-mono-wash d={under(full.values)} fill={`url(#${wash})`} />}
        {lines.map((line) => (
          <path key={line.name} data-mono-line={line.dashed ? 'dashed' : 'full'} d={curve(line.values)} fill="none" stroke={INK} strokeOpacity={line.dashed ? 0.56 : 1} strokeWidth={2} strokeDasharray={line.dashed ? '5 4' : undefined} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
      </motion.svg>
      {/* The full line's dots as filled round marks over the stretched drawing, so they stay round; no ring of a fixed colour, which showed as a dark bead on a finish's own paper. The one pointed at gets a ring of ink. */}
      {full && full.values.map((n, at) => (
        <span key={at} data-mono-dot={at} className="pointer-events-none absolute size-[7px] rounded-full"
          style={{ left: `${(x(at) / w) * 100}%`, top: `${(y(n) / h) * 100}%`, translate: '-50% -50%', background: INK, boxShadow: on === at ? '0 0 0 2px color-mix(in oklab, var(--foreground) 35%, transparent)' : undefined }} />
      ))}
      {full && labelled && full.values.map((n, at) => (
        <span key={`v${at}`} aria-hidden data-mono-label className="pointer-events-none absolute text-[10px] leading-none text-muted-foreground tabular-nums"
          style={{ left: `${(x(at) / w) * 100}%`, top: `${(y(n) / h) * 100}%`, translate: '-50% -14px' }}>{Math.round(n).toLocaleString()}</span>
      ))}
      <div className="absolute inset-0 flex">
        {Array.from({ length: count }, (_, at) => <span key={at} data-say={say(at)} className="h-full flex-1" onPointerEnter={() => (setOn(at), onHover(say(at)))} />)}
      </div>
    </div>
  )
}

/** One bar split in tones of the ink, each part named under it with its count; the part pointed at stands out. */
export function ToneBar({ parts }: { parts: { name: string; n: number }[] }): React.JSX.Element {
  const still = useStillness()
  const arrived = useArrived()
  const total = parts.reduce((sum, one) => sum + one.n, 0)
  return (
    <div data-mono-tones>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {parts.filter((one) => one.n).map((one, at) => (
          <motion.span key={one.name} aria-label={`${one.name}: ${one.n.toLocaleString()}`} className="h-full origin-left" style={{ flex: `${one.n} 1 0`, minWidth: 12, background: INK, opacity: TONES[parts.indexOf(one)] ?? INK_FLOOR }}
            initial={still ? false : { scaleX: 0.85, opacity: 0 }} animate={arrived ? { scaleX: 1, opacity: TONES[parts.indexOf(one)] ?? INK_FLOOR } : { scaleX: 0.85, opacity: 0 }} transition={{ delay: still ? 0 : at * 0.05, duration: 0.25 }} />
        ))}
        {!total && <span className="h-full flex-1" style={{ background: INK, opacity: 0.1 }} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {parts.map((one, at) => (
          <span key={one.name} data-tone={one.name} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: INK, opacity: TONES[at] ?? INK_FLOOR }} />{one.name} <strong className="font-semibold text-foreground tabular-nums">{one.n.toLocaleString()}</strong></span>
        ))}
      </div>
    </div>
  )
}

/** Amicro's stage funnel: one rounded bar a row, widest first, staggered in at 0.05s; pointing dims the other rows, nothing grows. */
export function Funnel({ rows, say, onHover }: { rows: { name: string; n: number }[]; say: (row: { name: string; n: number }) => string; onHover: (said: string | null) => void }): React.JSX.Element {
  const still = useStillness()
  const arrived = useArrived()
  const [on, setOn] = useState<string | null>(null)
  const most = Math.max(1, ...rows.map((one) => one.n))
  return (
    <div data-mono-funnel className="space-y-1.5" onPointerLeave={() => (setOn(null), onHover(null))}>
      {rows.map((one, at) => (
        <div key={one.name} data-say={say(one)} onPointerEnter={() => (setOn(one.name), onHover(say(one)))} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-xs transition-opacity duration-200" style={{ opacity: on === null || on === one.name ? 1 : 0.4 }}>
          <span className="truncate text-muted-foreground">{one.name}</span>
          <span className="h-2">
            <motion.span className="block h-full origin-left rounded-full" style={{ width: `${Math.max(4, (one.n / most) * 100)}%`, background: INK }}
              initial={still ? false : { scaleX: 0.85, opacity: 0 }} animate={arrived ? { scaleX: 1, opacity: 1 } : { scaleX: 0.85, opacity: 0 }} transition={{ delay: still ? 0 : at * 0.05, duration: 0.25 }} />
          </span>
          <strong className="font-semibold text-foreground tabular-nums">{one.n.toLocaleString()}</strong>
        </div>
      ))}
    </div>
  )
}

/** Two words at each end of a chart's axis. */
export function Ends({ left, right }: { left: string; right: string }): React.JSX.Element {
  return <p className="mt-1.5 flex justify-between text-xs text-muted-foreground"><span>{left}</span><span>{right}</span></p>
}
