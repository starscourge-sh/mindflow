import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { EASE, still } from '@/lib/motion'
import { num } from '../../../../main/dates'
import { seeded } from './wrap-worlds'

/**
 * The drawn pieces the wrap cards are made of. North star: real journal
 * spreads (page-as-field, handwriting, photos tipped into writing, sparse
 * washi). Never a sticker kit of KEPT badges and matching kraft on empty cream.
 */

/** Warm fibre baked into paper stock (same recipe as Review's paper finish). */
const FIBER = 'var(--mf-wrap-fiber, var(--wrap-paper-grain))'

/** A number that rolls up to itself once. */
export function Roll({ n, delay = 0.15 }: { n: number; delay?: number }): React.JSX.Element {
  const value = useMotionValue(still() ? n : 0)
  const shown = useTransform(value, (at) => num(Math.round(at)))
  useEffect(() => {
    if (still()) return
    const run = animate(value, n, { duration: Math.min(1.4, 0.5 + Math.log10(n + 1) * 0.25), delay, ease: EASE })
    return () => run.stop()
  }, [n, value, delay])
  return <motion.span aria-label={num(n)} className="tabular-nums">{shown}</motion.span>
}

/**
 * One voice at a time. `lift` = tip lifts off the page then settles (trailer
 * layer beat). `pop` = brief scatter snap for desk clutter. Quiet kinds linger
 * (`linger`); energetic kinds snap (`snap`).
 */
export function In({
  at = 0, children, className, style, from = 'up', pace = 'ease'
}: {
  at?: number
  children: ReactNode
  className?: string
  style?: CSSProperties
  from?: 'up' | 'left' | 'scale' | 'lift' | 'pop' | 'none'
  pace?: 'ease' | 'linger' | 'snap'
}): React.JSX.Element {
  const quiet = still() || from === 'none'
  const off = quiet
    ? {}
    : from === 'left' ? { x: -18 }
      : from === 'scale' ? { scale: 0.86 }
        : from === 'lift' ? { y: 22, scale: 0.94, rotate: -2.4 }
          : from === 'pop' ? { scale: 0.55, rotate: ((Math.round(at * 97) % 17) - 8) }
            : { y: 14 }
  const spring = from === 'lift' || from === 'pop' || pace === 'snap'
    ? { type: 'spring' as const, stiffness: pace === 'snap' ? 380 : 240, damping: pace === 'snap' ? 22 : 20, delay: at }
    : { delay: at, duration: pace === 'linger' ? 0.55 : 0.36, ease: EASE }
  return (
    <motion.div className={className} style={style}
      initial={{ opacity: 0, ...off }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
      transition={quiet ? { duration: 0.12 } : spring}>
      {children}
    </motion.div>
  )
}

/**
 * Soft settle only — no fog, smoke or mist wash. F50 mist read as Spotify
 * glitch on night cards and washed ink on cream; kept as a no-op export so
 * call sites can drop without a sweep mid-story.
 */
export function FogClear(_props: { accent: string; paper?: string; delay?: number; className?: string }): null {
  return null
}

/** Soft hand-torn ends: big uneven bites that read at card size, never a pinked zig-zag. */
const TORN = {
  kraft: 'polygon(0% 22%, 3% 0%, 11% 11%, 19% 0%, 31% 9%, 42% 1%, 55% 8%, 67% 0%, 79% 10%, 88% 2%, 96% 12%, 100% 4%, 99% 31%, 100% 52%, 96% 68%, 100% 84%, 97% 100%, 81% 93%, 68% 100%, 51% 91%, 36% 100%, 21% 92%, 9% 100%, 0% 86%, 3% 64%, 0% 42%)',
  washi: 'polygon(0% 14%, 5% 0%, 16% 9%, 29% 0%, 44% 11%, 58% 1%, 71% 9%, 84% 0%, 95% 8%, 100% 18%, 97% 41%, 100% 61%, 94% 79%, 100% 100%, 76% 93%, 58% 100%, 39% 91%, 21% 100%, 5% 93%, 0% 74%, 4% 49%, 0% 28%)',
  short: 'polygon(0% 24%, 7% 0%, 26% 13%, 45% 0%, 68% 11%, 89% 0%, 100% 26%, 95% 58%, 100% 100%, 69% 90%, 41% 100%, 16% 88%, 0% 100%, 5% 62%)',
  corner: 'polygon(0% 30%, 8% 0%, 28% 18%, 48% 0%, 72% 16%, 92% 2%, 100% 28%, 96% 70%, 100% 100%, 62% 88%, 28% 100%, 0% 78%, 4% 48%)',
  thin: 'polygon(0% 35%, 6% 0%, 22% 28%, 40% 0%, 58% 30%, 76% 0%, 94% 22%, 100% 40%, 98% 100%, 70% 78%, 42% 100%, 18% 72%, 0% 100%, 2% 62%)'
} as const

export type TapeKind = keyof typeof TORN

const TAPE_TINTS = ['#c9b896', '#b8a888', '#d4c4a0', '#a89878', '#cfc0a4', '#b5a07e'] as const

/**
 * Worn kraft or washi: matte, a little see-through, fibre in the stock, soft
 * torn ends. Seed picks end shape, tint and wear so no two strips match.
 */
export function KraftTape({
  className = '', tint, kind = 'kraft', seed = 1, wear = 0
}: {
  className?: string
  tint?: string
  kind?: TapeKind
  seed?: number
  /** 0..1 extra fade / crook so stacks do not share one recipe. */
  wear?: number
}): React.JSX.Element {
  const rand = seeded(seed * 9973 + kind.length * 17)
  const pick = (tint ?? TAPE_TINTS[Math.floor(rand() * TAPE_TINTS.length)]) as string
  const tall = kind === 'short' || kind === 'corner' || kind === 'thin' ? 'h-2.5' : kind === 'washi' ? 'h-3.5' : 'h-4'
  const fade = kind === 'washi' ? 0.62 + wear * 0.18 : 0.78 + wear * 0.14
  const crook = (rand() - 0.5) * 4
  return (
    <span aria-hidden data-wrap-tape={kind} className={`pointer-events-none block overflow-hidden ${tall} ${className}`}
      style={{
        opacity: fade,
        background:
          kind === 'washi' || kind === 'thin'
            ? `linear-gradient(${98 + crook}deg, rgb(255 255 255 / 0.42), rgb(255 255 255 / 0.06) 42%, rgb(0 0 0 / 0.1)), ${FIBER}, ${pick}`
            : `linear-gradient(${105 + crook}deg, rgb(255 255 255 / 0.3), transparent 38%, rgb(0 0 0 / 0.12) 84%), linear-gradient(180deg, rgb(255 255 255 / 0.2), transparent 52%, rgb(0 0 0 / 0.14)), ${FIBER}, ${pick}`,
        backgroundSize: kind === 'washi' || kind === 'thin' ? 'auto, 70px, auto' : 'auto, auto, 70px, auto',
        boxShadow: '0 1px 3px rgb(0 0 0 / 0.2), inset 0 1px 0 rgb(255 255 255 / 0.28), inset 0 -1px 1px rgb(0 0 0 / 0.12)',
        clipPath: TORN[kind],
        mixBlendMode: kind === 'washi' || kind === 'thin' ? 'multiply' : 'normal',
        filter: `contrast(${1.02 + wear * 0.06}) saturate(${0.88 + wear * 0.1})`
      }} />
  )
}

/**
 * Hand-torn edge: few uneven bites, irregular spacing, each variant a different
 * hand — never dense pinking-shear teeth and never the same path twice in a row.
 */
const DECKLE = [
  'polygon(0.6% 3.2%, 7% 0.2%, 15% 2.8%, 24% 0%, 36% 2.4%, 47% 0.6%, 59% 3%, 71% 0.2%, 82% 2.6%, 93% 0.4%, 99.2% 7%, 97.6% 19%, 99.6% 33%, 97.2% 48%, 99.4% 62%, 96.8% 76%, 99% 89%, 98.6% 97.5%, 88% 99.6%, 74% 97.2%, 61% 99.4%, 47% 97%, 33% 99.6%, 19% 97.4%, 6% 99.2%, 0.3% 90%, 2.2% 74%, 0.2% 58%, 1.9% 41%, 0.3% 26%, 1.8% 12%)',
  'polygon(0.4% 1.4%, 9% 2.6%, 18% 0%, 30% 2.2%, 42% 0.4%, 55% 2.8%, 68% 0.2%, 80% 2%, 92% 0.6%, 99.4% 5%, 98.2% 17%, 99.8% 31%, 97.4% 46%, 99.2% 60%, 97.6% 74%, 99.6% 88%, 94% 99.4%, 80% 97.6%, 66% 99.5%, 52% 97.2%, 38% 99.4%, 24% 97.8%, 10% 99.2%, 0.2% 92%, 1.6% 76%, 0.4% 60%, 2% 44%, 0.3% 28%, 1.7% 14%)',
  'polygon(1% 0.8%, 12% 2.4%, 25% 0.2%, 39% 2%, 52% 0%, 66% 2.6%, 79% 0.4%, 91% 2.2%, 99% 6%, 98.8% 21%, 99.5% 37%, 97% 52%, 99.3% 68%, 96.5% 82%, 99.2% 95%, 91% 99%, 76% 97.4%, 62% 99.6%, 48% 96.8%, 34% 99.2%, 20% 97%, 7% 99.4%, 0.5% 86%, 2.4% 70%, 0.2% 54%, 1.8% 38%, 0.5% 22%, 2% 9%)',
  'polygon(0.2% 4%, 6% 0%, 14% 3.4%, 27% 0.6%, 40% 3%, 53% 0%, 65% 2.8%, 78% 0.4%, 90% 3.2%, 99.5% 1.5%, 98% 16%, 99.7% 32%, 96.8% 47%, 99.5% 63%, 97.2% 78%, 99.4% 92%, 96% 99.2%, 84% 97%, 70% 99.5%, 55% 96.6%, 41% 99.4%, 26% 97.2%, 12% 99%, 0.4% 94%, 1.5% 78%, 0.2% 62%, 2.2% 46%, 0.4% 30%, 1.6% 15%)'
] as const

/** Soft lamp wash: uneven desk light, never a flat cream field. */
export function LampWash({ ink, accent, className = '' }: { ink: string; accent: string; className?: string }): React.JSX.Element {
  return (
    <div aria-hidden data-wrap-lamp className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        background: [
          `radial-gradient(ellipse 70% 55% at 18% 12%, rgb(255 248 230 / 0.55), transparent 62%)`,
          `radial-gradient(ellipse 55% 48% at 82% 78%, color-mix(in srgb, ${accent} 18%, transparent), transparent 70%)`,
          `radial-gradient(ellipse 90% 70% at 50% 110%, color-mix(in srgb, ${ink} 16%, transparent), transparent 55%)`,
          `linear-gradient(118deg, color-mix(in srgb, ${ink} 5%, transparent), transparent 42%, color-mix(in srgb, ${accent} 7%, transparent) 100%)`
        ].join(', '),
        mixBlendMode: 'multiply',
        opacity: 0.85
      }} />
  )
}

/**
 * The open notebook page as the field: cream stock, faint grid or dots, a
 * margin rule, fibre, uneven lamp. Content lives IN the page — never a card
 * floating on empty cream.
 */
export function JournalField({
  ink, paper, accent, children, className = '', grid = 'dot'
}: {
  ink: string
  paper: string
  accent: string
  children?: ReactNode
  className?: string
  grid?: 'dot' | 'quad'
}): React.JSX.Element {
  const field = grid === 'quad'
    ? `linear-gradient(color-mix(in srgb, ${ink} 9%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, ${ink} 9%, transparent) 1px, transparent 1px)`
    : `radial-gradient(circle, color-mix(in srgb, ${ink} 14%, transparent) 0.85px, transparent 1px)`
  const size = grid === 'quad' ? '16px 16px, 16px 16px' : '13px 13px'
  // Cream stock always gets graphite ink for reading — never the night card's pale ink washed onto the page.
  const quiet = `color-mix(in srgb, ${ink} 82%, ${paper})`
  return (
    <div data-wrap-journal data-wrap-collage className={`relative size-full overflow-hidden ${className}`}
      onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}
      style={{
        background: `${FIBER}, ${paper}`,
        backgroundSize: '120px, auto',
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ink} 6%, transparent)`,
        color: ink,
        '--wrap-quiet': quiet,
        '--foreground': ink,
        '--muted-foreground': quiet,
        '--mf-muted-strong': quiet
      } as CSSProperties}>
      <div aria-hidden className="absolute inset-0" style={{ backgroundImage: field, backgroundSize: size, backgroundPosition: '10px 8px', opacity: 0.55 }} />
      {/* Margin rule like a traveler's notebook. */}
      <div aria-hidden className="absolute inset-y-0 left-[11%]" style={{ width: 1, background: `color-mix(in srgb, ${accent} 55%, ${ink})`, opacity: 0.45 }} />
      <LampWash ink={ink} accent={accent} />
      <div className="relative z-[1] size-full" style={{ color: ink }}>{children}</div>
    </div>
  )
}

/**
 * A rubber date stamp (SEP 03 / NOV 24): inked rectangle, not a circular
 * KEPT product badge.
 */
export function DateStamp({ label, color, className = '', seed = 5 }: { label: string; color: string; className?: string; seed?: number }): React.JSX.Element {
  const rand = seeded(seed * 1301 + label.length)
  const rot = -6 + rand() * 12
  return (
    <span aria-hidden data-wrap-date className={`inline-grid place-items-center px-1.5 py-0.5 text-[10px] font-bold tracking-[0.18em] uppercase ${className}`}
      style={{
        color,
        border: `1.5px solid color-mix(in srgb, ${color} 75%, transparent)`,
        boxShadow: `inset 0 0 0 0.5px color-mix(in srgb, ${color} 35%, transparent), 0 0 1.5px color-mix(in srgb, ${color} 40%, transparent)`,
        borderRadius: `${2 + rand()}px ${3 + rand()}px ${2 + rand()}px ${4 + rand()}px`,
        background: `radial-gradient(ellipse at ${30 + rand() * 40}% ${40 + rand() * 30}%, color-mix(in srgb, ${color} 12%, transparent), transparent 70%)`,
        opacity: 0.72 + rand() * 0.18,
        transform: `rotate(${rot.toFixed(1)}deg)`,
        mixBlendMode: 'multiply',
        filter: `blur(${0.12 + rand() * 0.2}px) contrast(1.1)`,
        textShadow: `0.35px 0.25px 0.5px color-mix(in srgb, ${color} 50%, transparent)`
      }}>{label}</span>
  )
}

/** A photo tipped into the page: thin cream margin, slight tip, no rounded UI card. Lifts, then settles. */
export function TippedPrint({
  src, alt, ink, paper, className = '', at = 0.18
}: {
  src: string
  alt: string
  ink: string
  paper: string
  className?: string
  at?: number
}): React.JSX.Element {
  return (
    <In at={at} from="lift" pace="snap" className={className}>
      <div data-wrap-tipped className="relative size-full overflow-hidden"
        style={{
          background: `${FIBER}, ${paper}`,
          backgroundSize: '80px, auto',
          padding: 5,
          boxShadow: `0 1px 0 color-mix(in srgb, ${ink} 12%, transparent), 0 8px 18px -8px rgb(0 0 0 / 0.4)`,
          rotate: '-1.8deg'
        }}>
        <img data-wrap-hero src={src} alt={alt} draggable={false} className="pointer-events-none size-full object-cover" />
      </div>
    </In>
  )
}

/**
 * Ruled scrapbook paper with fibre in the stock and a deckled edge: cream
 * under a lamp, never a sharp vector square.
 */
export function PaperMat({ ink, paper, className, ruled = true, variant = 0 }: { ink: string; paper: string; className?: string; ruled?: boolean; variant?: 0 | 1 | 2 | 3 }): React.JSX.Element {
  const line = `color-mix(in srgb, ${ink} 13%, ${paper})`
  return (
    <div aria-hidden data-wrap-paper-mat className={`absolute inset-0 overflow-hidden ${className ?? ''}`}
      style={{
        background: `${FIBER}, ${paper}`,
        backgroundSize: '120px, auto',
        clipPath: DECKLE[variant % DECKLE.length],
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ink} 8%, transparent), 0 8px 20px -10px rgb(0 0 0 / 0.35)`
      }}>
      {ruled && (
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent 0 26px, ${line} 26px 27px), repeating-linear-gradient(90deg, transparent 0 26px, color-mix(in srgb, ${ink} 6%, ${paper}) 26px 27px)`,
          opacity: 0.85
        }} />
      )}
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 28% 18%, rgb(255 255 255 / 0.22), transparent 55%), linear-gradient(155deg, transparent 48%, color-mix(in srgb, ${ink} 8%, transparent))` }} />
    </div>
  )
}

/**
 * A date-stamp impression: irregular ring, soft bleed, uneven fill — ink on
 * paper, never a UI badge or product pill.
 */
export function InkStamp({
  label, color, className = '', seed = 3, heavy = false
}: {
  label: string
  color: string
  className?: string
  seed?: number
  heavy?: boolean
}): React.JSX.Element {
  const rand = seeded(seed * 7919 + label.length * 13)
  const rot = -14 + rand() * 28
  const wobble = 42 + rand() * 10
  const bleed = 0.55 + rand() * 0.3
  return (
    <span aria-hidden data-wrap-stamp className={`relative grid place-items-center text-[8.5px] font-bold tracking-[0.16em] uppercase ${className}`}
      style={{
        color,
        width: wobble,
        height: wobble + rand() * 4,
        borderRadius: `${44 + rand() * 12}% ${52 + rand() * 10}% ${48 + rand() * 12}% ${50 + rand() * 10}% / ${50 + rand() * 10}% ${46 + rand() * 12}% ${54 + rand() * 8}% ${48 + rand() * 10}%`,
        boxShadow: [
          `inset 0 0 0 ${1.2 + rand()}px color-mix(in srgb, ${color} ${68 + rand() * 20}%, transparent)`,
          `inset 0 0 0 ${3.2 + rand() * 1.4}px color-mix(in srgb, ${color} ${10 + rand() * 10}%, transparent)`,
          `0 0 ${2 + rand() * 2}px color-mix(in srgb, ${color} 35%, transparent)`
        ].join(', '),
        background: [
          `radial-gradient(circle at ${30 + rand() * 30}% ${25 + rand() * 30}%, color-mix(in srgb, ${color} ${heavy ? 22 : 12}%, transparent), transparent 58%)`,
          `radial-gradient(circle at ${60 + rand() * 25}% ${70 + rand() * 20}%, color-mix(in srgb, ${color} 8%, transparent), transparent 45%)`
        ].join(', '),
        opacity: bleed,
        transform: `rotate(${rot.toFixed(1)}deg)`,
        mixBlendMode: 'multiply',
        filter: `blur(${0.15 + rand() * 0.25}px) contrast(1.08)`,
        textShadow: `0.4px 0.3px 0.6px color-mix(in srgb, ${color} 55%, transparent), -0.3px 0.4px 0.7px color-mix(in srgb, ${color} 35%, transparent)`
      }}>
      <span style={{ opacity: 0.88 + rand() * 0.1, letterSpacing: `${0.12 + rand() * 0.08}em` }}>{label}</span>
      {/* Soft ink flecks outside the ring. */}
      <span className="absolute -top-0.5 right-1 size-1 rounded-full opacity-40" style={{ background: color, filter: 'blur(0.6px)' }} />
      <span className="absolute bottom-0.5 -left-0.5 size-1.5 rounded-full opacity-25" style={{ background: color, filter: 'blur(0.9px)' }} />
    </span>
  )
}

/** Serif line with a soft ink bloom so type sits in the fibre, not on a sticker. */
export function InkLine({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }): React.JSX.Element {
  return (
    <p data-wrap-ink className={`m-0 font-heading leading-snug font-semibold text-pretty ${className}`}
      style={{
        ...style,
        textShadow: '0.35px 0.25px 0.55px color-mix(in srgb, currentColor 45%, transparent), -0.25px 0.35px 0.6px color-mix(in srgb, currentColor 28%, transparent)',
        filter: 'contrast(1.04)'
      }}>
      {children}
    </p>
  )
}

/** A margin scrap in the Signature hand: one kept line, tipped. */
export function MarginNote({ text, ink, paper, className = '', seed = 2 }: { text: string; ink: string; paper: string; className?: string; seed?: number }): React.JSX.Element {
  const rand = seeded(seed * 421)
  const rot = -9 + rand() * 8
  return (
    <div aria-hidden data-wrap-margin className={`pointer-events-none px-2.5 py-1.5 ${className}`}
      style={{
        background: `${FIBER}, ${paper}`,
        backgroundSize: '90px, auto',
        color: ink,
        clipPath: DECKLE[Math.floor(rand() * DECKLE.length)],
        boxShadow: '0 2px 8px -3px rgb(0 0 0 / 0.3)',
        transform: `rotate(${rot.toFixed(1)}deg)`,
        opacity: 0.92
      }}>
      <p className="m-0 max-w-[14ch] text-[15px] leading-tight [font-family:'Haligtree_Signature',cursive]"
        style={{ textShadow: '0.3px 0.2px 0.4px color-mix(in srgb, currentColor 40%, transparent)' }}>{text}</p>
    </div>
  )
}

/** A single hand-drawn line that draws itself. The seed shapes its loops. */
export function Scribble({ seed, color, className, delay = 0.2, width = 1.6 }: { seed: number; color: string; className?: string; delay?: number; width?: number }): React.JSX.Element {
  const d = useMemo(() => {
    const rand = seeded(seed)
    const points = Array.from({ length: 7 }, (_, i) => [i * 55 - 20 + rand() * 30, 30 + rand() * 140] as const)
    let path = `M ${points[0][0]} ${points[0][1]}`
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i]
      const [px, py] = points[i - 1]
      const loop = rand() > 0.55 ? 60 : 0
      path += ` C ${px + 40} ${py - loop}, ${x - 40 + loop} ${y + loop}, ${x} ${y}`
    }
    return path
  }, [seed])
  return (
    <svg viewBox="0 0 320 200" className={className} fill="none" aria-hidden>
      <motion.path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" opacity={0.75}
        initial={{ pathLength: still() ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: still() ? 0 : 1.1, delay, ease: [0.45, 0, 0.2, 1] }} />
    </svg>
  )
}

/**
 * Desk collage frame: blotter, corner tips, stamp, margin scrap, tapes, lamp —
 * density of an open Midori, not one lonely motif in the middle.
 */
/**
 * Cover collage: blotter + tipped print area + one kraft + one washi + margin
 * hand. Sparse glue, not a tape sample card or KEPT badge kit.
 */
export function DeskCollage({
  children, ink, paper, accent, seed, note, className = ''
}: {
  children: ReactNode
  ink: string
  paper: string
  accent: string
  seed: number
  note?: string
  className?: string
}): React.JSX.Element {
  const rand = seeded(seed)
  return (
    <div data-wrap-desk data-wrap-collage className={`relative size-full ${className}`}
      onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <JournalField ink={ink} paper={paper} accent={accent} grid="dot" className="absolute inset-[3%]" />
      <div className="absolute inset-0 z-[2]">{children}</div>
      {note && <MarginNote text={note} ink={ink} paper={paper} seed={seed + 3} className="absolute bottom-[11%] left-[5%] z-20 max-w-[42%]" />}
      <KraftTape seed={seed + 1} wear={0.35 + rand() * 0.3} className="absolute top-[16%] left-[18%] z-30 w-[44%] rotate-[-9deg]" />
      <KraftTape kind="washi" seed={seed + 2} wear={0.5 + rand() * 0.2} tint={`color-mix(in srgb, ${accent} 28%, #d4c4a0)`} className="absolute bottom-[22%] right-[10%] z-30 w-[20%] rotate-[17deg]" />
      <Scribble seed={seed} color={accent} width={1.25} className="pointer-events-none absolute top-[4%] left-0 z-10 w-full opacity-40" delay={0.3} />
    </div>
  )
}

/**
 * Gems / sources as ink on an open journal page (refs 01–06): titles written
 * down the field, optional tipped print nested in the writing, one date stamp,
 * at most one washi. Never a sticker stack, never KEPT.
 */
export function Folder({
  titles, color, paper, ink, date, tip
}: {
  titles: string[]
  color: string
  paper: string
  ink: string
  /** Rubber-stamp date, e.g. "NOV 24". */
  date?: string
  tip?: { src: string; alt: string }
}): React.JSX.Element {
  const shown = titles.slice(0, tip ? 4 : 6)
  return (
    <div className="relative h-full min-h-[220px] w-full" data-wrap-folder data-wrap-papers="">
      <JournalField ink={ink} paper={paper} accent={color} grid="quad" className="absolute inset-0">
        <div className="absolute inset-0 flex flex-col px-[13%] pt-4 pb-5 pr-4 text-left">
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="m-0 text-[11px] font-semibold tracking-[0.06em] uppercase" style={{ color: `color-mix(in srgb, ${ink} 45%, ${paper})` }}>subject</p>
            {date && <DateStamp label={date} color={color} seed={19} />}
          </div>
          {tip && (
            <TippedPrint src={tip.src} alt={tip.alt} ink={ink} paper={paper}
              className="mb-2 h-[42%] w-[78%] max-w-[260px] shrink-0 self-end" />
          )}
          <ol className="relative m-0 flex min-h-0 flex-1 list-none flex-col justify-start gap-2 overflow-hidden p-0 pt-1">
            {shown.map((title, i) => (
              <motion.li key={title + i} className="min-w-0"
                initial={still() ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: still() ? 0 : 0.28 + i * 0.07, duration: 0.32, ease: EASE }}>
                <InkLine className="text-[clamp(14px,2.2cqi,18px)] tracking-[-0.01em]" style={{ color: ink }}>
                  <span className="mr-2 inline-block opacity-40" style={{ color }}>•</span>
                  {title}
                </InkLine>
              </motion.li>
            ))}
          </ol>
          {/* One washi only — glue, not decoration. */}
          <KraftTape kind="washi" seed={23} wear={0.6} tint={`color-mix(in srgb, ${color} 18%, #d8c9a8)`}
            className="absolute bottom-[8%] left-[14%] z-10 w-[30%] rotate-[-4deg]" />
          <p className="pointer-events-none absolute bottom-[9%] right-[10%] m-0 max-w-[12ch] text-right text-[14px] leading-tight [font-family:'Haligtree_Signature',cursive]"
            style={{ color: `color-mix(in srgb, ${ink} 55%, ${paper})`, rotate: '4deg' }}>{titles.length} kept</p>
        </div>
      </JournalField>
    </div>
  )
}

const SILK = `
precision mediump float;
uniform float t; uniform vec2 r; uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform float h; uniform float s; uniform float o;
vec3 turned(vec3 c, float a) {
  vec3 y = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c;
  y.yz = vec2(y.y * cos(a) - y.z * sin(a), y.y * sin(a) + y.z * cos(a));
  return clamp(mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * y, 0.0, 1.0);
}
void main() {
  vec2 p = gl_FragCoord.xy / r.xy;
  float x = p.x * r.x / r.y;
  float k = t * 0.32;
  float w1 = sin(x * 1.5 + k + sin(p.y * 2.1 - k * 0.7) * 1.3);
  float w2 = sin(x * 2.3 - k * 0.8 + w1 * 1.1 + p.y * 1.4);
  float b1 = exp(-pow((p.y - 0.68 - 0.13 * w1) * 3.0, 2.0)) * (0.62 + 0.38 * sin(x * 2.6 + k * 1.3));
  float b2 = exp(-pow((p.y - 0.30 - 0.11 * w2) * 3.4, 2.0)) * (0.58 + 0.42 * sin(x * 1.9 - k * 1.1 + 1.7));
  float edge = 1.0 - smoothstep(0.42, 0.95, length((p - 0.5) * vec2(1.1, 1.4))) * 0.7;
  float l1 = clamp(b1 * s * edge, 0.0, 1.0);
  float l2 = clamp(b2 * s * 0.85 * edge, 0.0, 1.0);
  if (o > 0.5) {
    vec3 col = mix(mix(c0, turned(c1, h), l1), turned(c2, h * 0.7), l2);
    gl_FragColor = vec4(col, 1.0);
  } else {
    float a = clamp(l1 + l2 * (1.0 - l1), 0.0, 1.0);
    vec3 col = (turned(c1, h) * l1 + turned(c2, h * 0.7) * l2 * (1.0 - l1));
    gl_FragColor = vec4(col, a);
  }
}`
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]

/**
 * A slow aurora of light over the look's paper. Texture is Settings › Grain on
 * the card, not shader speckles.
 */
export function Silk({ base, a, b, hue = 0, strength = 0.85, scale = 0.5, clear = false, className = 'absolute inset-0 size-full' }: { base: string; a: string; b: string; hue?: number; strength?: number; scale?: number; clear?: boolean; className?: string }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const target = useRef({ c0: rgb(base), c1: rgb(a), c2: rgb(b), h: hue, s: strength })
  const redraw = useRef<(() => void) | null>(null)
  useEffect(() => {
    target.current = { c0: rgb(base), c1: rgb(a), c2: rgb(b), h: hue, s: strength }
    redraw.current?.()
  }, [base, a, b, hue, strength])
  useEffect(() => {
    const el = canvas.current
    const gl = el?.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: true, alpha: clear })
    if (!el || !gl) return
    const shader = (type: number, src: string): WebGLShader => {
      const one = gl.createShader(type)!
      gl.shaderSource(one, src)
      gl.compileShader(one)
      return one
    }
    const program = gl.createProgram()!
    gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'))
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, SILK))
    gl.linkProgram(program)
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const at = gl.getAttribLocation(program, 'p')
    gl.enableVertexAttribArray(at)
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0)
    const u = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name)
    const [uT, uR, u0, u1, u2, uH, uS, uO] = ['t', 'r', 'c0', 'c1', 'c2', 'h', 's', 'o'].map(u)
    const now = { ...target.current, c0: [...target.current.c0], c1: [...target.current.c1], c2: [...target.current.c2] }
    const ease = (k: number): void => {
      const to = target.current
      for (const key of ['c0', 'c1', 'c2'] as const) for (let i = 0; i < 3; i++) now[key][i] += (to[key][i] - now[key][i]) * k
      now.h += (to.h - now.h) * k
      now.s += (to.s - now.s) * k
    }
    const size = (): void => {
      el.width = Math.max(1, Math.round(el.clientWidth * scale))
      el.height = Math.max(1, Math.round(el.clientHeight * scale))
      gl.viewport(0, 0, el.width, el.height)
    }
    const draw = (time: number): void => {
      gl.uniform2f(uR, el.width, el.height)
      gl.uniform1f(uT, time / 1000)
      gl.uniform3fv(u0, now.c0)
      gl.uniform3fv(u1, now.c1)
      gl.uniform3fv(u2, now.c2)
      gl.uniform1f(uH, now.h)
      gl.uniform1f(uS, now.s)
      gl.uniform1f(uO, clear ? 0 : 1)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    size()
    if (still()) {
      const once = (): void => (ease(1), draw(6000))
      redraw.current = once
      const sized = new ResizeObserver(() => (size(), once()))
      sized.observe(el)
      once()
      return () => (sized.disconnect(), (redraw.current = null))
    }
    const sized = new ResizeObserver(size)
    sized.observe(el)
    let frame = 0
    let last = 0
    let clock = 6000
    const tick = (stamp: number): void => {
      const dt = last ? Math.min(64, stamp - last) : 16
      last = stamp
      clock += dt
      ease(1 - Math.exp(-dt / 320))
      draw(clock)
      frame = requestAnimationFrame(tick)
    }
    const run = (): void => {
      cancelAnimationFrame(frame)
      last = 0
      if (!document.hidden) frame = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', run)
    run()
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', run)
      sized.disconnect()
    }
  }, [scale, clear])
  return <canvas ref={canvas} className={className} aria-hidden />
}
