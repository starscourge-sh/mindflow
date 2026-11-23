import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { EASE, still } from '@/lib/motion'
import { num } from '../../../../main/dates'
import { seeded } from './wrap-worlds'

/**
 * The drawn pieces the wrap cards are made of: deckled paper, worn kraft and
 * washi, ink stamps, a scribble, and a silk of light for Night. Midori desk
 * collage, never clean vector stickers.
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

/** One voice at a time: each child comes in after the one before. */
export function In({ at = 0, children, className, style, from = 'up' }: { at?: number; children: ReactNode; className?: string; style?: CSSProperties; from?: 'up' | 'left' | 'scale' | 'none' }): React.JSX.Element {
  const off = still() || from === 'none' ? {} : from === 'left' ? { x: -18 } : from === 'scale' ? { scale: 0.86 } : { y: 14 }
  return (
    <motion.div className={className} style={style} initial={{ opacity: 0, ...off }} animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={still() ? { duration: 0.15 } : { delay: at, duration: 0.36, ease: EASE }}>
      {children}
    </motion.div>
  )
}

/** Soft hand-torn ends: big uneven bites that read at card size, never a pinked zig-zag. */
const TORN = {
  kraft: 'polygon(0% 18%, 4% 0%, 12% 8%, 22% 1%, 38% 6%, 52% 0%, 68% 5%, 82% 1%, 94% 7%, 100% 2%, 98% 28%, 100% 48%, 96% 62%, 100% 78%, 97% 100%, 84% 94%, 70% 100%, 52% 93%, 36% 100%, 20% 94%, 8% 100%, 0% 82%, 3% 58%, 0% 38%)',
  washi: 'polygon(0% 12%, 6% 0%, 18% 6%, 34% 0%, 50% 8%, 66% 1%, 80% 7%, 94% 0%, 100% 16%, 97% 40%, 100% 60%, 95% 78%, 100% 100%, 78% 94%, 58% 100%, 40% 92%, 22% 100%, 6% 94%, 0% 72%, 4% 48%, 0% 28%)',
  short: 'polygon(0% 20%, 8% 0%, 28% 10%, 48% 0%, 72% 8%, 92% 0%, 100% 22%, 96% 55%, 100% 100%, 70% 92%, 42% 100%, 18% 90%, 0% 100%, 4% 60%)'
} as const

/**
 * Worn kraft or washi: matte, a little see-through, fibre in the stock, soft
 * torn ends. Never a hatched rectangle or pinked sticker.
 */
export function KraftTape({ className = '', tint = '#c9b896', kind = 'kraft' }: { className?: string; tint?: string; kind?: 'kraft' | 'washi' | 'short' }): React.JSX.Element {
  const tall = kind === 'short' ? 'h-3' : 'h-4'
  return (
    <span aria-hidden data-wrap-tape={kind} className={`pointer-events-none block overflow-hidden ${tall} ${className}`}
      style={{
        opacity: kind === 'washi' ? 0.72 : 0.88,
        background:
          kind === 'washi'
            ? `linear-gradient(180deg, rgb(255 255 255 / 0.4), rgb(255 255 255 / 0.08) 45%, rgb(0 0 0 / 0.08)), ${FIBER}, ${tint}`
            : `linear-gradient(105deg, rgb(255 255 255 / 0.28), transparent 40%, rgb(0 0 0 / 0.1) 82%), linear-gradient(180deg, rgb(255 255 255 / 0.22), transparent 50%, rgb(0 0 0 / 0.12)), ${FIBER}, ${tint}`,
        backgroundSize: kind === 'washi' ? 'auto, 70px, auto' : 'auto, auto, 70px, auto',
        boxShadow: '0 1px 3px rgb(0 0 0 / 0.22), inset 0 1px 0 rgb(255 255 255 / 0.3), inset 0 -1px 1px rgb(0 0 0 / 0.1)',
        clipPath: TORN[kind],
        mixBlendMode: kind === 'washi' ? 'multiply' : 'normal',
        filter: 'contrast(1.05) saturate(0.92)'
      }} />
  )
}

/** Hand-torn edge: a few uneven bites with irregular spacing — never dense pinking-shear teeth. */
const DECKLE = [
  'polygon(0.8% 2%, 8% 0.4%, 19% 2.2%, 31% 0%, 44% 1.8%, 58% 0.3%, 71% 2%, 84% 0.5%, 96% 1.6%, 99.4% 9%, 98.2% 22%, 99.6% 38%, 97.8% 54%, 99.5% 70%, 98% 86%, 99.2% 97%, 90% 99.4%, 76% 97.8%, 61% 99.5%, 46% 98%, 32% 99.6%, 17% 97.9%, 4% 99.2%, 0.4% 88%, 1.8% 72%, 0.3% 55%, 1.6% 38%, 0.4% 22%, 1.5% 10%)',
  'polygon(0.5% 1%, 11% 2%, 23% 0.2%, 37% 1.8%, 51% 0%, 66% 2.1%, 79% 0.4%, 91% 1.5%, 99.2% 4%, 98.5% 18%, 99.7% 34%, 97.9% 49%, 99.4% 65%, 98.1% 81%, 99.5% 94%, 93% 99.2%, 78% 98%, 63% 99.5%, 48% 97.8%, 33% 99.4%, 19% 98.1%, 6% 99.3%, 0.3% 91%, 1.7% 74%, 0.2% 58%, 1.5% 41%, 0.4% 25%, 1.6% 11%)'
] as const

/**
 * Ruled scrapbook paper with fibre in the stock and a deckled edge: cream
 * under a lamp, never a sharp vector square.
 */
export function PaperMat({ ink, paper, className, ruled = true, variant = 0 }: { ink: string; paper: string; className?: string; ruled?: boolean; variant?: 0 | 1 }): React.JSX.Element {
  const line = `color-mix(in srgb, ${ink} 13%, ${paper})`
  return (
    <div aria-hidden data-wrap-paper-mat className={`absolute inset-0 overflow-hidden ${className ?? ''}`}
      style={{
        background: `${FIBER}, ${paper}`,
        backgroundSize: '120px, auto',
        clipPath: DECKLE[variant],
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ink} 8%, transparent), 0 8px 20px -10px rgb(0 0 0 / 0.35)`
      }}>
      {ruled && (
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent 0 26px, ${line} 26px 27px), repeating-linear-gradient(90deg, transparent 0 26px, color-mix(in srgb, ${ink} 6%, ${paper}) 26px 27px)`,
          opacity: 0.85
        }} />
      )}
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 20%, rgb(255 255 255 / 0.2), transparent 55%), linear-gradient(155deg, transparent 50%, color-mix(in srgb, ${ink} 7%, transparent))` }} />
    </div>
  )
}

/** A date-stamp ring: irregular ink, not a UI pill. */
export function InkStamp({ label, color, className = '' }: { label: string; color: string; className?: string }): React.JSX.Element {
  return (
    <span aria-hidden data-wrap-stamp className={`grid place-items-center text-[9px] font-bold tracking-[0.14em] uppercase ${className}`}
      style={{
        color,
        width: 46,
        height: 46,
        borderRadius: '46% 54% 48% 52% / 52% 46% 54% 48%',
        boxShadow: `inset 0 0 0 1.6px color-mix(in srgb, ${color} 80%, transparent), inset 0 0 0 4px color-mix(in srgb, ${color} 12%, transparent)`,
        background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${color} 10%, transparent), transparent 60%)`,
        opacity: 0.82,
        transform: 'rotate(9deg)'
      }}>{label}</span>
  )
}

/** A margin scrap in the Signature hand: one kept line, tipped. */
export function MarginNote({ text, ink, paper, className = '' }: { text: string; ink: string; paper: string; className?: string }): React.JSX.Element {
  return (
    <div aria-hidden data-wrap-margin className={`pointer-events-none px-2.5 py-1.5 ${className}`}
      style={{
        background: `${FIBER}, ${paper}`,
        backgroundSize: '90px, auto',
        color: ink,
        clipPath: 'polygon(1% 2%, 98% 0%, 100% 96%, 2% 100%, 0% 40%)',
        boxShadow: '0 2px 8px -3px rgb(0 0 0 / 0.28)',
        transform: 'rotate(-6deg)'
      }}>
      <p className="m-0 max-w-[14ch] text-[15px] leading-tight [font-family:'Haligtree_Signature',cursive]">{text}</p>
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
 * Desk collage frame: blotter, corner tip, stamp, margin scrap, tapes — density
 * of an open Midori, not one lonely motif in the middle.
 */
export function DeskCollage({
  children, ink, paper, accent, seed, note, stamp = 'kept', className = ''
}: {
  children: ReactNode
  ink: string
  paper: string
  accent: string
  seed: number
  note?: string
  stamp?: string
  className?: string
}): React.JSX.Element {
  return (
    <div data-wrap-desk className={`relative size-full ${className}`}>
      {/* Leather / oak blotter under everything. */}
      <div aria-hidden className="absolute inset-[4%]" style={{
        background: `color-mix(in srgb, ${accent} 16%, ${paper})`,
        backgroundImage: `${FIBER}, repeating-linear-gradient(0deg, transparent 0 28px, color-mix(in srgb, ${ink} 5%, transparent) 28px 29px)`,
        backgroundSize: '110px, auto',
        clipPath: DECKLE[1],
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ink} 12%, transparent), 0 10px 28px -12px rgb(0 0 0 / 0.4)`
      }} />
      {/* Corner tip of another page peeking out. */}
      <div aria-hidden className="absolute top-[8%] left-[6%] z-[1] h-[28%] w-[34%] rotate-[-11deg]"
        style={{
          background: `${FIBER}, color-mix(in srgb, ${paper} 88%, ${ink})`,
          backgroundSize: '90px, auto',
          clipPath: 'polygon(2% 1%, 98% 3%, 100% 100%, 0% 96%)',
          boxShadow: '0 3px 10px -4px rgb(0 0 0 / 0.3)'
        }} />
      <div aria-hidden className="absolute right-[7%] bottom-[10%] z-[1] h-[22%] w-[30%] rotate-[8deg]"
        style={{
          background: `${FIBER}, color-mix(in srgb, ${accent} 8%, ${paper})`,
          backgroundSize: '80px, auto',
          clipPath: DECKLE[0],
          boxShadow: '0 3px 10px -4px rgb(0 0 0 / 0.28)',
          opacity: 0.9
        }} />
      <div className="absolute inset-0 z-[2]">{children}</div>
      <InkStamp label={stamp} color={accent} className="absolute top-[12%] right-[14%] z-20" />
      {note && <MarginNote text={note} ink={ink} paper={paper} className="absolute bottom-[14%] left-[8%] z-20 max-w-[40%]" />}
      <KraftTape className="absolute top-[18%] left-[22%] z-30 w-[42%] rotate-[-8deg]" />
      <KraftTape kind="washi" tint={`color-mix(in srgb, ${accent} 35%, #d4c4a0)`} className="absolute top-[28%] right-[12%] z-30 w-[22%] rotate-[16deg]" />
      <KraftTape kind="short" tint="#b8a888" className="absolute bottom-[24%] right-[28%] z-30 w-[18%] rotate-[-18deg]" />
      <Scribble seed={seed} color={accent} width={1.4} className="pointer-events-none absolute top-[6%] left-0 z-10 w-full opacity-65" delay={0.3} />
    </div>
  )
}

/**
 * Kept lines as a stack of deckled slips on a blotter: Midori traveler's
 * notebook open on a desk, not a cartoon envelope.
 */
export function Folder({ titles, color, paper, ink }: { titles: string[]; color: string; paper: string; ink: string }): React.JSX.Element {
  const [open, setOpen] = useState(still())
  useEffect(() => {
    if (still()) return
    const timer = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(timer)
  }, [])
  const shown = titles.slice(0, 3)
  const lean = shown.length === 1 ? [0] : shown.length === 2 ? [-5.5, 4.5] : [-6.5, 0.8, 5.5]
  const edges = [DECKLE[0], DECKLE[1], DECKLE[0]]
  return (
    <div className="relative mx-auto mt-[4%] aspect-[4/3] max-h-[82%] w-[min(92%,360px)]" data-wrap-folder data-wrap-papers="">
      {/* Desk blotter. */}
      <div className="absolute inset-[3%]" style={{
        background: `color-mix(in srgb, ${color} 14%, ${paper})`,
        backgroundImage: `${FIBER}, repeating-linear-gradient(0deg, transparent 0 26px, color-mix(in srgb, ${ink} 5%, transparent) 26px 27px)`,
        backgroundSize: '110px, auto',
        clipPath: DECKLE[1],
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ink} 12%, transparent), 0 8px 22px -10px rgb(0 0 0 / 0.38)`
      }} />
      {/* Peek of a third scrap under the stack. */}
      <div aria-hidden className="absolute top-[14%] right-[8%] z-[1] h-[40%] w-[36%] rotate-[12deg]"
        style={{
          background: `${FIBER}, color-mix(in srgb, ${color} 10%, ${paper})`,
          backgroundSize: '85px, auto',
          clipPath: 'polygon(1% 2%, 99% 0%, 100% 98%, 0% 100%)',
          boxShadow: '0 2px 8px -3px rgb(0 0 0 / 0.25)'
        }} />
      {shown.map((title, i) => (
        <motion.div key={title + i}
          className="absolute bottom-[12%] left-[9%] flex h-[62%] w-[80%] flex-col justify-start overflow-hidden px-3.5 pt-3.5 pb-2.5 text-left"
          style={{
            background: `${FIBER}, ${paper}`,
            backgroundSize: '100px, auto',
            color: ink,
            transformOrigin: '50% 100%',
            clipPath: edges[i],
            boxShadow: '0 5px 16px -4px rgb(0 0 0 / 0.34), 0 1px 0 rgb(0 0 0 / 0.06)',
            zIndex: shown.length - i + 2
          }}
          initial={false}
          animate={open
            ? { y: -28 - (shown.length - 1 - i) * 26, x: lean[i] * 3.4, rotate: lean[i] }
            : { y: (shown.length - 1 - i) * 5, x: lean[i] * 0.4, rotate: lean[i] * 0.3 }}
          transition={{ type: 'spring', stiffness: 200, damping: 26, delay: still() ? 0 : 0.28 + i * 0.07 }}>
          <div className="absolute inset-0 opacity-80" style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent 0 22px, color-mix(in srgb, ${ink} 11%, ${paper}) 22px 23px)`
          }} />
          <span className="relative font-heading text-[15px] leading-snug font-semibold tracking-[-0.01em]" style={{ color: ink }}>{title}</span>
          <span className="relative mt-auto text-[10px] font-medium tracking-[0.08em] uppercase" style={{ color: `color-mix(in srgb, ${ink} 45%, ${paper})` }}>kept</span>
        </motion.div>
      ))}
      <InkStamp label="kept" color={color} className="absolute top-[10%] right-[10%] z-30" />
      <KraftTape className="absolute top-[16%] left-1/2 z-30 w-36 -translate-x-1/2 rotate-[-7deg]" />
      <KraftTape kind="washi" tint={`color-mix(in srgb, ${color} 40%, #d4c4a0)`} className="absolute right-[8%] bottom-[18%] z-30 w-16 rotate-[18deg]" />
      <KraftTape kind="short" tint="#b8a888" className="absolute left-[12%] bottom-[28%] z-30 w-12 rotate-[-22deg]" />
      <MarginNote text="from the drawer" ink={ink} paper={paper} className="absolute bottom-[8%] left-[4%] z-30" />
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
