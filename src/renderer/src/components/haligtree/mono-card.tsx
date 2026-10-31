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
import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion, MotionGlobalConfig } from 'motion/react'
import { Rolling } from './ui'
import { chime } from '@/lib/sound'

const EASE = [0.16, 1, 0.3, 1] as const
const useStillness = (): boolean => !!useReducedMotion() || !!MotionGlobalConfig.skipAnimations

/** A tone of the ink: Amicro's three steps (full, 0.52, 0.22) and its faint track. */
const INK = 'var(--foreground)'
const TONES = [1, 0.52, 0.22]

/** A small round chip beside the big number: "5 of 7 days", "12 weeks". */
export function Chip({ children }: { children: ReactNode }): React.JSX.Element {
  return <span data-mono-chip className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.04] px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground">{children}</span>
}

/** The tiny segmented switch on a card: 7 days / 30 days. */
export function Switch<T extends string>({ options, value, pick }: { options: { id: T; label: string }[]; value: T; pick: (id: T) => void }): React.JSX.Element {
  return (
    <span role="radiogroup" className="inline-flex shrink-0 items-center rounded-lg border border-foreground/10 bg-foreground/[0.04] p-0.5 text-xs">
      {options.map((one) => (
        <button key={one.id} type="button" role="radio" aria-checked={value === one.id} data-mono-switch={one.id}
          onClick={() => value !== one.id && (chime('tap'), pick(one.id))}
          className={`cursor-pointer rounded-md px-2 py-0.5 whitespace-nowrap transition-colors active:scale-[0.97] ${value === one.id ? 'bg-foreground font-semibold text-background' : 'text-muted-foreground hover:text-foreground'}`}>
          {one.label}
        </button>
      ))}
    </span>
  )
}

/**
 * One card per idea: the number, what it counts, chips, a switch on the
 * right, the picture on its stage, then one line that says the point, or,
 * while the pointer is on a mark, that mark's value.
 */
export function MonoCard({ name, title, value, unit, chips, side, point, children, hovered }: {
  name: string; title: string; value: string | number; unit?: string; chips?: ReactNode; side?: ReactNode; point: ReactNode; children?: ReactNode; hovered?: string | null
}): React.JSX.Element {
  return (
    <section data-mono-card={name} aria-label={title} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span data-mono-value={value} className="text-[1.75rem] leading-none font-semibold text-foreground tabular-nums"><Rolling text={typeof value === 'number' ? value.toLocaleString() : value} /></span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          {chips}
        </div>
        {side}
      </div>
      {children && <div className="rounded-lg bg-foreground/[0.035] p-3">{children}</div>}
      <p data-mono-point className="min-h-5 text-sm text-muted-foreground" aria-live="polite">{hovered ?? point}</p>
    </section>
  )
}

/** Hover state for a card's marks: what the line under the stage says while one is pointed at. */
export function useHover(): [string | null, (said: string | null) => void] {
  return useState<string | null>(null)
}

/**
 * Dot-matrix days: one round dot per day in columns of weeks, the darker the
 * more. The dots fill in, oldest first, unless motion is off.
 */
export function DotMatrix({ days, say, onHover, columns = 7 }: { days: { day: string; n: number }[]; say: (day: { day: string; n: number }) => string; onHover: (said: string | null) => void; columns?: number }): React.JSX.Element {
  const still = useStillness()
  const most = Math.max(1, ...days.map((one) => one.n))
  const tone = (n: number): number => (n === 0 ? 0.08 : 0.3 + 0.7 * Math.min(1, n / most))
  return (
    <div data-mono-dots className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${Math.ceil(days.length / columns)}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${columns}, auto)`, gridAutoFlow: 'column' }} onPointerLeave={() => onHover(null)}>
      {days.map((one, at) => (
        <motion.span key={one.day} data-day={one.day} data-n={one.n} data-say={say(one)}
          onPointerEnter={() => onHover(say(one))}
          initial={still ? false : { opacity: 0, scale: 0.4 }} animate={{ opacity: tone(one.n), scale: 1 }} whileHover={{ scale: 1.3 }}
          transition={{ duration: 0.25, ease: EASE, delay: still ? 0 : Math.min(0.6, at * 0.008) }}
          className="aspect-square w-full cursor-default rounded-full" style={{ background: INK, maxWidth: 14, justifySelf: 'center' }} />
      ))}
    </div>
  )
}

/** Rounded pill bars, one per value, the full ink; a value of 0 a faint stub. */
export function PillBars({ values, say, onHover, className = 'h-20' }: { values: number[]; say: (at: number) => string; onHover: (said: string | null) => void; className?: string }): React.JSX.Element {
  const still = useStillness()
  const most = Math.max(1, ...values)
  return (
    <div data-focus-bars className={`flex items-end gap-[3px] ${className}`} onPointerLeave={() => onHover(null)}>
      {values.map((n, at) => (
        <span key={at} data-say={say(at)} onPointerEnter={() => onHover(say(at))} className="flex h-full flex-1 items-end">
          <motion.span initial={still ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.28, ease: EASE, delay: still ? 0 : at * 0.01 }}
            className="block w-full origin-bottom rounded-full" style={{ height: `${n ? Math.max(8, (n / most) * 100) : 4}%`, background: INK, opacity: n ? 1 : 0.12 }} />
        </span>
      ))}
    </div>
  )
}

/** Amicro's arc gauge: a rounded semi-circle, the ink for the share, a faint track for the rest. */
export function Arc({ percent, label }: { percent: number; label: string }): React.JSX.Element {
  const still = useStillness()
  const r = 64
  const path = `M ${80 - r} 80 A ${r} ${r} 0 0 1 ${80 + r} 80`
  return (
    <div data-mono-arc data-percent={percent} className="relative mx-auto w-full max-w-[220px]">
      <svg viewBox="0 0 160 90" className="w-full" role="img" aria-label={label}>
        <path d={path} fill="none" stroke={INK} strokeOpacity={0.1} strokeWidth={14} strokeLinecap="round" />
        <motion.path d={path} fill="none" stroke={INK} strokeWidth={14} strokeLinecap="round"
          initial={still ? false : { pathLength: 0 }} animate={{ pathLength: Math.max(0.001, percent / 100) }} transition={{ duration: 0.6, ease: EASE }} />
      </svg>
      <span className="absolute inset-x-0 bottom-0 text-center text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

/** A soft spline through points, with a dashed one to set it against. */
export function Spline({ lines, say, onHover }: { lines: { values: number[]; dashed?: boolean; name: string }[]; say: (at: number) => string; onHover: (said: string | null) => void }): React.JSX.Element {
  const still = useStillness()
  const count = lines[0]?.values.length ?? 0
  const most = Math.max(1, ...lines.flatMap((line) => line.values))
  const [w, h] = [300, 90]
  const x = (at: number): number => (count < 2 ? w / 2 : (at / (count - 1)) * (w - 8) + 4)
  const y = (n: number): number => h - 6 - (n / most) * (h - 14)
  // Catmull-Rom through the points, as cubic Beziers: soft, and through every point.
  const curve = (values: number[]): string => values.map((n, at) => {
    if (at === 0) return `M ${x(0)} ${y(n)}`
    const [p0, p1, p2, p3] = [values[Math.max(0, at - 2)], values[at - 1], n, values[Math.min(values.length - 1, at + 1)]]
    const c1 = [x(at - 1) + (x(at) - x(Math.max(0, at - 2))) / 6, y(p1) + (y(p2) - y(p0)) / 6]
    const c2 = [x(at) - (x(Math.min(values.length - 1, at + 1)) - x(at - 1)) / 6, y(p2) - (y(p3) - y(p1)) / 6]
    return `C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x(at)} ${y(n)}`
  }).join(' ')
  return (
    <div data-mono-spline className="relative" onPointerLeave={() => onHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none" role="img" aria-label={lines.map((line) => line.name).join(' and ')}>
        {lines.map((line) => (
          <motion.path key={line.name} d={curve(line.values)} fill="none" stroke={INK} strokeOpacity={line.dashed ? 0.4 : 1} strokeWidth={line.dashed ? 1.5 : 2.5} strokeDasharray={line.dashed ? '4 4' : undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke"
            initial={still || line.dashed ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: EASE }} />
        ))}
      </svg>
      <div className="absolute inset-0 flex">
        {Array.from({ length: count }, (_, at) => <span key={at} data-say={say(at)} className="h-full flex-1" onPointerEnter={() => onHover(say(at))} />)}
      </div>
    </div>
  )
}

/** One bar split in tones of the ink, each part named under it with its count. */
export function ToneBar({ parts }: { parts: { name: string; n: number }[] }): React.JSX.Element {
  const total = parts.reduce((sum, one) => sum + one.n, 0)
  return (
    <div data-mono-tones>
      <div className="flex h-4 gap-[3px]">
        {parts.filter((one) => one.n).map((one) => (
          <span key={one.name} title={`${one.name}: ${one.n.toLocaleString()}`} className="h-full rounded-full" style={{ flex: one.n, background: INK, opacity: TONES[parts.indexOf(one)] ?? 0.22 }} />
        ))}
        {!total && <span className="h-full flex-1 rounded-full" style={{ background: INK, opacity: 0.08 }} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {parts.map((one, at) => (
          <span key={one.name} data-tone={one.name} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: INK, opacity: TONES[at] ?? 0.22 }} />{one.name} <strong className="font-semibold text-foreground tabular-nums">{one.n.toLocaleString()}</strong></span>
        ))}
      </div>
    </div>
  )
}

/** Amicro's stage funnel: one rounded bar a row, widest first, its name on the left and count on the right. */
export function Funnel({ rows, say, onHover }: { rows: { name: string; n: number }[]; say: (row: { name: string; n: number }) => string; onHover: (said: string | null) => void }): React.JSX.Element {
  const most = Math.max(1, ...rows.map((one) => one.n))
  return (
    <div data-mono-funnel className="space-y-1.5" onPointerLeave={() => onHover(null)}>
      {rows.map((one) => (
        <div key={one.name} data-say={say(one)} onPointerEnter={() => onHover(say(one))} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-xs">
          <span className="truncate text-muted-foreground">{one.name}</span>
          <span className="h-3"><span className="block h-full rounded-full" style={{ width: `${Math.max(4, (one.n / most) * 100)}%`, background: INK }} /></span>
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
