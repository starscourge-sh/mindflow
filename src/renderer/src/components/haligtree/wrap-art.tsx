import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { EASE, still } from '@/lib/motion'
import { num } from '../../../../main/dates'
import { seeded } from './wrap-worlds'
/**
 * The drawn pieces the wrap cards are made of: paper slips under tape, a
 * scribble that draws itself like pen ink, and a silk of light for Night.
 * Midori / scrapbook, never flat cartoon envelopes or sticker cutouts.
 */

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

/**
 * Ruled scrapbook paper under a picture or a title: cream stock, faint grid,
 * torn edge. Replaces the old black-and-white op-art frames that read as stickers.
 */
export function PaperMat({ ink, paper, className, ruled = true }: { ink: string; paper: string; className?: string; ruled?: boolean }): React.JSX.Element {
  const line = `color-mix(in srgb, ${ink} 14%, ${paper})`
  return (
    <div aria-hidden data-wrap-paper-mat className={`absolute inset-0 overflow-hidden ${className ?? ''}`}
      style={{
        background: paper,
        // Soft torn edge: never a perfect rectangle.
        clipPath: 'polygon(0.6% 1.2%, 98.8% 0.4%, 99.6% 98.2%, 1.4% 99.4%, 0.2% 48%, 1.1% 22%)',
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ink} 10%, transparent)`
      }}>
      {ruled && (
        <div className="absolute inset-0 opacity-90" style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent 0 27px, ${line} 27px 28px), repeating-linear-gradient(90deg, transparent 0 27px, color-mix(in srgb, ${ink} 7%, ${paper}) 27px 28px)`
        }} />
      )}
      {/* Aged wash at the foot, as a notebook page yellows. */}
      <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, transparent 55%, color-mix(in srgb, ${ink} 6%, transparent))` }} />
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
      <motion.path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" opacity={0.85}
        initial={{ pathLength: still() ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: still() ? 0 : 1.1, delay, ease: [0.45, 0, 0.2, 1] }} />
    </svg>
  )
}

/** Kraft masking tape for wrap collages: matte, torn ends, never a flat accent sticker. */
export function KraftTape({ className = '', tint = '#c4b79a' }: { className?: string; tint?: string }): React.JSX.Element {
  return (
    <span aria-hidden className={`pointer-events-none block h-3.5 overflow-hidden ${className}`}
      style={{
        background: `repeating-linear-gradient(90deg, rgb(255 255 255 / 0.08) 0 1px, transparent 1px 3px), linear-gradient(180deg, rgb(255 255 255 / 0.28), rgb(255 255 255 / 0.05) 48%, rgb(0 0 0 / 0.08)), ${tint}`,
        boxShadow: '0 1px 1.5px rgb(0 0 0 / 0.22), inset 0 0 0 0.5px rgb(255 255 255 / 0.18)',
        clipPath: 'polygon(3% 0, 97% 0, 100% 12%, 96% 26%, 99.5% 40%, 96.5% 55%, 100% 70%, 96% 86%, 98.5% 100%, 2% 100%, 0 86%, 3.5% 72%, 0 57%, 3% 42%, 0.5% 27%, 3.5% 13%)'
      }} />
  )
}

/**
 * Kept lines as a stack of paper slips under masking tape: Midori traveler's
 * notebook, not a cartoon envelope of name cards.
 */
export function Folder({ titles, color, paper, ink }: { titles: string[]; color: string; paper: string; ink: string }): React.JSX.Element {
  const [open, setOpen] = useState(still())
  useEffect(() => {
    if (still()) return
    const timer = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(timer)
  }, [])
  const shown = titles.slice(0, 3)
  // Fan so every title's first line clears the slip in front: Midori stack, not one card alone.
  const lean = shown.length === 1 ? [0] : shown.length === 2 ? [-5.5, 4.5] : [-6.5, 0.8, 5.5]
  return (
    <div className="relative mx-auto mt-[8%] aspect-[4/3] max-h-[78%] w-[min(88%,340px)]" data-wrap-folder data-wrap-papers="">
      {/* Desk blotter under the slips: oak wash, faint rule. */}
      <div className="absolute inset-[6%]" style={{
        background: `color-mix(in srgb, ${color} 18%, ${paper})`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ink} 14%, transparent)`,
        backgroundImage: `repeating-linear-gradient(0deg, transparent 0 26px, color-mix(in srgb, ${ink} 6%, transparent) 26px 27px)`,
        clipPath: 'polygon(0.4% 1%, 99.2% 0.3%, 100% 99%, 0.8% 98.5%)'
      }} />
      {shown.map((title, i) => (
        <motion.div key={title + i}
          className="absolute bottom-[12%] left-[9%] flex h-[64%] w-[82%] flex-col justify-start overflow-hidden px-3.5 pt-3.5 pb-2.5 text-left"
          style={{
            background: paper,
            color: ink,
            transformOrigin: '50% 100%',
            // Irregular paper edge, not a rounded card.
            clipPath: i === 0
              ? 'polygon(0.8% 1%, 99% 0.5%, 100% 98.5%, 1.2% 100%, 0% 55%)'
              : i === 1
                ? 'polygon(0% 0.8%, 98.5% 0%, 100% 99%, 0.5% 98%, 1% 40%)'
                : 'polygon(1% 0%, 100% 1.2%, 99% 100%, 0% 97.5%, 0.4% 30%)',
            backgroundImage: `repeating-linear-gradient(0deg, transparent 0 22px, color-mix(in srgb, ${ink} 12%, ${paper}) 22px 23px)`,
            boxShadow: '0 4px 14px -3px rgb(0 0 0 / 0.32), 0 1px 0 rgb(0 0 0 / 0.06)',
            zIndex: shown.length - i
          }}
          initial={false}
          animate={open
            ? { y: -28 - (shown.length - 1 - i) * 26, x: lean[i] * 3.4, rotate: lean[i] }
            : { y: (shown.length - 1 - i) * 5, x: lean[i] * 0.4, rotate: lean[i] * 0.3 }}
          transition={{ type: 'spring', stiffness: 200, damping: 26, delay: still() ? 0 : 0.28 + i * 0.07 }}>
          <span className="font-heading text-[15px] leading-snug font-semibold tracking-[-0.01em]" style={{ color: ink }}>{title}</span>
          <span className="mt-auto text-[10px] font-medium tracking-[0.08em] uppercase" style={{ color: `color-mix(in srgb, ${ink} 45%, ${paper})` }}>kept</span>
        </motion.div>
      ))}
      {/* Kraft tape across the stack. */}
      <KraftTape className="absolute top-[16%] left-1/2 z-30 w-32 -translate-x-1/2 rotate-[-7deg]" />
      {/* Short washi in stamp ink, torn, not a candy sticker. */}
      <div aria-hidden className="pointer-events-none absolute right-[9%] bottom-[20%] z-30 h-3 w-16 rotate-[16deg] overflow-hidden"
        style={{
          background: `repeating-linear-gradient(90deg, transparent 0 2px, rgb(255 255 255 / 0.12) 2px 3px), color-mix(in srgb, ${color} 42%, ${paper})`,
          clipPath: 'polygon(2% 0, 98% 8%, 100% 100%, 0 92%)',
          boxShadow: '0 1px 1px rgb(0 0 0 / 0.18)'
        }} />
    </div>
  )
}

const SILK = `
precision mediump float;
uniform float t; uniform vec2 r; uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform float h; uniform float s; uniform float o;
// A colour turned round the colour wheel by a (YIQ), so a card's turn moves the light's hue and keeps its brightness.
vec3 turned(vec3 c, float a) {
  vec3 y = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c;
  y.yz = vec2(y.y * cos(a) - y.z * sin(a), y.y * sin(a) + y.z * cos(a));
  return clamp(mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * y, 0.0, 1.0);
}
void main() {
  vec2 p = gl_FragCoord.xy / r.xy;
  float x = p.x * r.x / r.y;
  float k = t * 0.32;
  // Two curtains of light, each a soft band whose middle wanders as slow waves pass along it, brighter where they fold.
  float w1 = sin(x * 1.5 + k + sin(p.y * 2.1 - k * 0.7) * 1.3);
  float w2 = sin(x * 2.3 - k * 0.8 + w1 * 1.1 + p.y * 1.4);
  float b1 = exp(-pow((p.y - 0.68 - 0.13 * w1) * 3.0, 2.0)) * (0.62 + 0.38 * sin(x * 2.6 + k * 1.3));
  float b2 = exp(-pow((p.y - 0.30 - 0.11 * w2) * 3.4, 2.0)) * (0.58 + 0.42 * sin(x * 1.9 - k * 1.1 + 1.7));
  // Faded out toward the edges, so the light sits behind the middle.
  float edge = 1.0 - smoothstep(0.42, 0.95, length((p - 0.5) * vec2(1.1, 1.4))) * 0.7;
  float l1 = clamp(b1 * s * edge, 0.0, 1.0);
  float l2 = clamp(b2 * s * 0.85 * edge, 0.0, 1.0);
  if (o > 0.5) {
    // On its own paper (c0): the light mixed into it. No procedural speckles: the card wears Settings › Grain.
    vec3 col = mix(mix(c0, turned(c1, h), l1), turned(c2, h * 0.7), l2);
    gl_FragColor = vec4(col, 1.0);
  } else {
    // Light alone, over whatever is under the canvas: as much of it shows as there is light (premultiplied).
    float a = clamp(l1 + l2 * (1.0 - l1), 0.0, 1.0);
    vec3 col = (turned(c1, h) * l1 + turned(c2, h * 0.7) * l2 * (1.0 - l1));
    gl_FragColor = vec4(col, a);
  }
}`
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]

/**
 * A slow aurora of light (React Bits' Aurora and Silk, written here as one small shader): two curtains in the look's
 * colours over its paper. `hue` turns the light round the colour wheel and `strength` sets how much of it shows; a
 * change to either, or to the colours, glides across in about a second. Drawn at `scale` of the page's pixels (the
 * light is soft, so a quarter of the pixels look the same and cost a quarter as much), stopped while the window is
 * hidden, and one still frame with Motion off or Reduce motion, redrawn in place when it changes. `clear`: the light alone,
 * on a see-through canvas, over whatever is under it (the dimmed app behind a wrap's card).
 */
export function Silk({ base, a, b, hue = 0, strength = 0.85, scale = 0.5, clear = false, className = 'absolute inset-0 size-full' }: { base: string; a: string; b: string; hue?: number; strength?: number; scale?: number; clear?: boolean; className?: string }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  // Where the light is going: read by the running loop every frame, so a change never starts the drawing again.
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
    // What is drawn now, eased toward the target each frame.
    const now = { ...target.current, c0: [...target.current.c0], c1: [...target.current.c1], c2: [...target.current.c2] }
    const ease = (k: number): void => {
      const to = target.current
      for (const key of ['c0', 'c1', 'c2'] as const) for (let i = 0; i < 3; i++) now[key][i] += (to[key][i] - now[key][i]) * k
      now.h += (to.h - now.h) * k
      now.s += (to.s - now.s) * k
    }
    // Sized only when the box is: setting a canvas's size empties it and makes its pixels again.
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
      // One frame, and the same frame again in its new colours when they change: an in-place change, never a glide.
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
    // The light keeps its own time, so a pause while hidden carries on from where it stopped rather than jumping on.
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
