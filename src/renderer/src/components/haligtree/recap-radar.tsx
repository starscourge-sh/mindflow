import { useEffect, useRef, useState } from 'react'
import { animate, motion, MotionGlobalConfig, useInView, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import { curveCardinalClosed, lineRadial } from 'd3-shape'
import { scaleSqrt } from 'd3-scale'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { EASE, spring } from '@/lib/motion'
import { num } from '../../../../main/dates'

type Counted = { kind: string; n: number }

/** What a year mostly of one kind says you were doing. */
const DOING: Record<string, string> = {
  note: 'thinking things through',
  todo: 'getting things done',
  quote: 'reading',
  word: 'reading',
  link: 'following links',
  checkback: 'checking back on things',
  goal: 'aiming for things'
}

const typeOf = (kind: string): (typeof CAPTURE_TYPES)[number] | undefined => CAPTURE_TYPES.find((type) => type.id === kind)
const many = (kind: string): string => `${(typeOf(kind)?.label ?? kind).toLowerCase()}s`
const doing = (...kinds: string[]): string => [...new Set(kinds.map((kind) => DOING[kind] ?? 'catching things'))].join(' and ')
/** Only the kinds Haligtree has, most first. */
const known = (kinds: Counted[]): Counted[] => kinds.filter((one) => typeOf(one.kind) && one.n > 0).sort((a, b) => b.n - a.n)

/**
 * The shape read back in one plain line, from a few simple rules: one kind
 * with half or more and nothing close behind, two kinds that make most of
 * it, or no kind that took over.
 */
export function readShape(kinds: Counted[]): string {
  const ranked = known(kinds)
  const total = ranked.reduce((sum, one) => sum + one.n, 0)
  const [a, b, c] = ranked
  if (!a) return 'Nothing caught yet to give it a shape.'
  if (!b) return `All ${many(a.kind)}: you were ${doing(a.kind)}.`
  const [first, second] = [a.n / total, b.n / total]
  if (first >= 0.5 && second < 0.15) return `Mostly ${many(a.kind)}: you were ${doing(a.kind)}.`
  if (first + second >= 0.6) return `Mostly ${many(a.kind)} and ${many(b.kind)}: you were ${doing(a.kind, b.kind)}.`
  return `No one kind took over: ${many(a.kind)}, ${many(b.kind)}${c ? ` and ${many(c.kind)}` : ''} in near equal parts.`
}

/** The kind most caught, as a word: "mostly notes". */
const mostly = (kinds: Counted[]): string | null => {
  const [a] = known(kinds)
  return a ? many(a.kind) : null
}

/** The kinds that get a spoke: any caught in either span, and at least five, in the box's own order. */
const spokesFor = (kinds: Counted[], before: Counted[]): string[] => {
  const caught = new Set([...known(kinds), ...known(before)].map((one) => one.kind))
  for (const kind of ['note', 'todo', 'quote', 'word', 'link']) if (caught.size < 5) caught.add(kind)
  return CAPTURE_TYPES.map((type) => type.id as string).filter((kind) => caught.has(kind))
}

const SIZE = 360
const R = 118
const RINGS = [0.25, 0.5, 0.75, 1]
/** Fewer things than this in the span before, and it is not drawn. */
const FEW_BEFORE = 10
/** How far out a kind caught even once sits, as a share of the rim. */
const FLOOR = 0.24
const at = (angle: number, r: number): [number, number] => [Math.sin(angle) * r, -Math.cos(angle) * r]
const radial = lineRadial<number>().angle((_, i, all) => (i * 2 * Math.PI) / all.length).radius((r) => r).curve(curveCardinalClosed.tension(0.4))

/** One kind's dot, riding out along its spoke as the shape grows. */
function Dot({ angle, r, grow, tint, near }: { angle: number; r: number; grow: MotionValue<number>; tint: string; near: boolean }): React.JSX.Element {
  const cx = useTransform(grow, (g) => at(angle, r * g)[0])
  const cy = useTransform(grow, (g) => at(angle, r * g)[1])
  // Grown on a transform about its own middle (r is geometry, repainted each frame).
  return <motion.circle cx={cx} cy={cy} r={3.5} initial={false} animate={{ transform: near ? 'scale(1.57)' : 'scale(1)' }} transition={spring.fast} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} fill={tint} stroke="var(--background)" strokeWidth={1.5} />
}

/**
 * The shape of what was caught: a ring for each quarter of the most of any
 * kind, a spoke for each kind, and the year drawn over them in the app's own
 * colour, a dot in each kind's colour where it reaches. The span before, when
 * there was one, is the faint dashed line under it. It grows out from the
 * middle as it is first seen; pointing at a spoke says its count.
 */
export function RecapRadar({ kinds, before: asked }: { kinds: Counted[]; before: { label: string; kinds: Counted[] } | null }): React.JSX.Element {
  // A span before with only a few things in it would draw a line that says nothing.
  const before = asked && known(asked.kinds).reduce((sum, one) => sum + one.n, 0) >= FEW_BEFORE ? asked : null
  const spokes = spokesFor(kinds, before?.kinds ?? [])
  const count = (list: Counted[], kind: string): number => list.find((one) => one.kind === kind)?.n ?? 0
  const now = spokes.map((kind) => count(kinds, kind))
  const was = before ? spokes.map((kind) => count(before.kinds, kind)) : null
  // By area, and anything caught at all clear of the middle, so one kind caught
  // most does not leave the rest a point at the centre; pointed at, each says its true count.
  const sqrt = scaleSqrt().domain([0, Math.max(1, ...now, ...(was ?? []))]).range([R * FLOOR, R])
  const scale = (n: number): number => (n > 0 ? sqrt(n) : 0)
  const radii = now.map((n) => scale(n))
  const angle = (i: number): number => (i * 2 * Math.PI) / spokes.length

  const box = useRef<SVGSVGElement>(null)
  const seen = useInView(box, { once: true })
  const still = useReducedMotion() || MotionGlobalConfig.skipAnimations
  const grow = useMotionValue(still ? 1 : 0)
  useEffect(() => {
    if (!seen || still) return
    // The shape a beat after its page lands, on the app's panel spring.
    const { exit: _exit, ...slow } = spring.slow
    const run = animate(grow, 1, { ...slow, delay: 0.35 })
    return () => run.stop()
  }, [seen, still, grow])
  const shape = useTransform(grow, (g) => radial(radii.map((r) => r * g)) ?? '')
  const [near, setNear] = useState<number | null>(null)

  const said = spokes.map((kind, i) => `${many(kind)} ${num(now[i])}`).join(', ')
  const lastMostly = before && mostly(before.kinds)
  return (
    <div className="flex w-full flex-col items-center gap-1">
      <svg ref={box} viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`} role="img" aria-label={`What you caught, by kind: ${said}.`}
        className="aspect-square w-full max-w-[min(30rem,60vh)] overflow-visible" onPointerLeave={() => setNear(null)}>
        {/* The grid: rings and spokes, faint, with no numbers on them. */}
        <g fill="none" stroke="var(--foreground)" strokeWidth={1}>
          {RINGS.map((ring) => <circle key={ring} r={R * ring} opacity={ring === 1 ? 0.14 : 0.08} />)}
          {spokes.map((kind, i) => {
            const [x, y] = at(angle(i), R)
            return <motion.line key={kind} x2={x} y2={y} animate={{ opacity: near === i ? 0.32 : 0.08 }} transition={spring.fast} />
          })}
        </g>
        {was && (
          <motion.path d={radial(was.map((n) => scale(n))) ?? ''} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.25} strokeDasharray="3 4" strokeLinejoin="round"
            initial={still ? false : { opacity: 0 }} animate={{ opacity: 0.7 }} transition={{ delay: 0.2, duration: 0.4, ease: EASE }} />
        )}
        <motion.path d={shape} fill="var(--tt-brand-color-400)" fillOpacity={0.18} stroke="var(--tt-brand-color-400)" strokeWidth={1.75} strokeLinejoin="round" />
        {spokes.map((kind, i) => <Dot key={kind} angle={angle(i)} r={radii[i]} grow={grow} tint={typeOf(kind)?.tint ?? 'var(--foreground)'} near={near === i} />)}
        {/* Each kind's name past the rim; pointed at, its count beside it, on the side away from the rim. */}
        {spokes.map((kind, i) => {
          const [x, y] = at(angle(i), R + 12)
          const side = Math.sin(angle(i))
          const anchor = side > 0.3 ? 'start' : side < -0.3 ? 'end' : 'middle'
          const up = Math.cos(angle(i)) > 0.3
          return (
            <g key={kind} transform={`translate(${x} ${y + (up ? -6 : Math.cos(angle(i)) < -0.3 ? 10 : 4)})`} textAnchor={anchor}>
              <text className="text-[0.6875rem]" fill={near === i ? 'var(--foreground)' : 'var(--muted-foreground)'}>{typeOf(kind)?.label}s</text>
              <motion.text y={up ? -17 : 17} className="text-[0.6875rem] font-semibold tabular-nums" fill={typeOf(kind)?.tint} initial={false}
                animate={{ opacity: near === i ? 1 : 0 }} transition={spring.fast}>{num(now[i])}</motion.text>
            </g>
          )
        })}
        {/* What answers the pointer: a slice of the circle round each spoke. */}
        {spokes.map((kind, i) => {
          const half = Math.PI / spokes.length
          const [x1, y1] = at(angle(i) - half, R + 44)
          const [x2, y2] = at(angle(i) + half, R + 44)
          return <path key={kind} d={`M0 0L${x1} ${y1}A${R + 44} ${R + 44} 0 0 1 ${x2} ${y2}Z`} fill="transparent" onPointerEnter={() => setNear(i)} />
        })}
      </svg>
      {before && lastMostly && (
        <p className="flex items-center gap-2 text-meta text-muted-foreground">
          <svg aria-hidden width="18" height="2" className="overflow-visible"><line x2="18" stroke="var(--muted-foreground)" strokeWidth={1.25} strokeDasharray="3 4" /></svg>
          {before.label}, when it was mostly {lastMostly}
        </p>
      )}
    </div>
  )
}
