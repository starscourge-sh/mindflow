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
import { useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion, MotionGlobalConfig } from 'motion/react'
import { Rolling } from './ui'
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

/** A tone of the ink: Amicro's three steps (full, 0.52, 0.22) and its faint track. */
const INK = 'var(--foreground)'
const TONES = [1, 0.52, 0.22]

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
 * right, the picture on its stage, then one line that says the point. While
 * a mark is pointed at, its value follows the pointer in a tip and takes the
 * place of the point.
 */
export function MonoCard({ name, title, value, unit, chips, side, point, children, hovered }: {
  name: string; title: string; value: string | number; unit?: string; chips?: ReactNode; side?: ReactNode; point: ReactNode; children?: ReactNode; hovered?: string | null
}): React.JSX.Element {
  const still = useStillness()
  const arrived = useArrived()
  const stage = useRef<HTMLDivElement>(null)
  // As Amicro's cards do, the big number turns to the mark pointed at ("6" and "reviews, Sat 31 Oct"), and back on leaving.
  const swap = hovered ? (/^([\d,.]+%?)\s+(.*)$/.exec(hovered) ?? (/^No /.test(hovered) ? [hovered, '0', hovered.replace(/^No /, '')] : [hovered, typeof value === 'number' ? value.toLocaleString() : value, hovered])) : null
  return (
    <motion.section data-mono-card={name} aria-label={title} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4"
      initial={still ? false : { opacity: 0, scale: 0.98, y: 6 }} animate={arrived ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.98, y: 6 }} transition={{ duration: 0.25, ease: EASE }}>
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {/* One line, at rest and while a mark is pointed at: the readout takes the number's place here and nowhere else, so nothing grows. */}
      <div data-mono-head className="flex flex-nowrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-nowrap items-baseline gap-2 overflow-hidden">
          <span data-mono-value={value} data-mono-shown={swap ? swap[1] : value} className="text-[1.75rem] leading-none font-semibold text-foreground tabular-nums"><Rolling text={swap ? swap[1] : typeof value === 'number' ? value.toLocaleString() : value} /></span>
          {(swap ? swap[2] : unit) && <span className="min-w-0 truncate text-sm text-muted-foreground">{swap ? swap[2] : unit}</span>}
          {chips && <span className={`flex shrink-0 gap-1 ${swap ? 'invisible' : ''}`}>{chips}</span>}
        </div>
        {side}
      </div>
      {children && (
        <div ref={stage} className="relative rounded-lg bg-foreground/[0.035] p-3">
          {children}
        </div>
      )}
      <p data-mono-point className="min-h-5 text-sm text-muted-foreground">{point}</p>
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
  const tone = (n: number): number => (n === 0 ? 0.08 : 0.3 + 0.7 * Math.min(1, n / most))
  const across = Math.ceil(days.length / columns)
  return (
    <div data-mono-dots className="mx-auto grid gap-1" style={{ gridTemplateColumns: `repeat(${across}, minmax(0, ${dot}px))`, gridTemplateRows: `repeat(${columns}, auto)`, gridAutoFlow: 'column', justifyContent: 'space-between', maxWidth: across * (dot + 8) }} onPointerLeave={() => onHover(null)}>
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
 * Bars, one per value, the same width in every chart (6 px, the heatmap's 2 px corner at
 * the top, square on the baseline), standing on one hairline baseline, with
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
                className="block w-1.5 origin-bottom rounded-t-[2px]" style={{ height: `${Math.max(4, (n / most) * 100)}%`, background: INK }} />
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
 * Lines through points, straight from one to the next (a curve would swing
 * below zero or past a point between them), every series continuous to the
 * last point; a dashed one to set the full one against. Pointing stands a
 * guide at the nearest point and rings its dot; nothing grows or redraws.
 */
export function Spline({ lines, say, onHover }: { lines: { values: number[]; dashed?: boolean; name: string }[]; say: (at: number) => string; onHover: (said: string | null) => void }): React.JSX.Element {
  const still = useStillness()
  const arrived = useArrived()
  const [on, setOn] = useState<number | null>(null)
  const count = lines[0]?.values.length ?? 0
  const most = Math.max(1, ...lines.flatMap((line) => line.values))
  const [w, h] = [300, 90]
  const x = (at: number): number => (count < 2 ? w / 2 : (at / (count - 1)) * (w - 12) + 6)
  const y = (n: number): number => h - 8 - (Math.max(0, n) / most) * (h - 16)
  const straight = (values: number[]): string => values.map((n, at) => `${at ? 'L' : 'M'} ${x(at).toFixed(2)} ${y(n).toFixed(2)}`).join(' ')
  const full = lines.find((line) => !line.dashed)
  return (
    <div data-mono-spline data-hovered={on ?? undefined} className="relative h-24" onPointerLeave={() => (setOn(null), onHover(null))}>
      {/* Faded in as a whole, never drawn along its length: a drawn-in line dashes itself and can stop short. */}
      <motion.svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label={lines.map((line) => line.name).join(' and ')}
        initial={still ? false : { opacity: 0 }} animate={{ opacity: arrived ? 1 : 0 }} transition={{ duration: still ? 0 : 0.3, ease: EASE }}>
        <line x1={0} x2={w} y1={h - 8} y2={h - 8} stroke={INK} strokeOpacity={0.2} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <line data-mono-guide x1={x(on ?? 0)} x2={x(on ?? 0)} y1={0} y2={h} stroke={INK} strokeOpacity={on === null ? 0 : 0.3} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        {lines.map((line) => (
          <path key={line.name} data-mono-line={line.dashed ? 'dashed' : 'full'} d={straight(line.values)} fill="none" stroke={INK} strokeOpacity={line.dashed ? 0.45 : 1} strokeWidth={2} strokeDasharray={line.dashed ? '5 4' : undefined} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
      </motion.svg>
      {/* The full line's dots as round marks over the stretched drawing, so they stay round; the one pointed at gets a ring, its size never changes. */}
      {full && full.values.map((n, at) => (
        <span key={at} data-mono-dot={at} className="pointer-events-none absolute size-[5px] rounded-full"
          style={{ left: `${(x(at) / w) * 100}%`, top: `${(y(n) / h) * 100}%`, translate: '-50% -50%', background: INK, boxShadow: `0 0 0 1.5px var(--card)${on === at ? ', 0 0 0 3px color-mix(in oklab, var(--foreground) 45%, transparent)' : ''}` }} />
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
      <div className="flex h-3 gap-px">
        {parts.filter((one) => one.n).map((one, at) => (
          <motion.span key={one.name} aria-label={`${one.name}: ${one.n.toLocaleString()}`} className="h-full origin-left rounded-[2px]" style={{ flex: `${one.n} 1 0`, minWidth: 12, background: INK, opacity: TONES[parts.indexOf(one)] ?? 0.22 }}
            initial={still ? false : { scaleX: 0.85, opacity: 0 }} animate={arrived ? { scaleX: 1, opacity: TONES[parts.indexOf(one)] ?? 0.22 } : { scaleX: 0.85, opacity: 0 }} transition={{ delay: still ? 0 : at * 0.05, duration: 0.25 }} />
        ))}
        {!total && <span className="h-full flex-1 rounded-[2px]" style={{ background: INK, opacity: 0.08 }} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {parts.map((one, at) => (
          <span key={one.name} data-tone={one.name} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: INK, opacity: TONES[at] ?? 0.22 }} />{one.name} <strong className="font-semibold text-foreground tabular-nums">{one.n.toLocaleString()}</strong></span>
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
          <span className="h-2.5">
            <motion.span className="block h-full origin-left rounded-[2px]" style={{ width: `${Math.max(4, (one.n / most) * 100)}%`, background: INK }}
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
