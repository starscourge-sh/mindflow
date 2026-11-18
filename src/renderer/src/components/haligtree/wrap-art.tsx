import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { EASE, still } from '@/lib/motion'
import { num } from '../../../../main/dates'
import { seeded } from './wrap-worlds'

/**
 * The drawn pieces the wrap cards are made of: op-art that frames your
 * pictures, a scribble that draws itself, a folder that fans out notes, a
 * silk shader and a number that rolls.
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

export type Op = 'rings' | 'checker' | 'stripes' | 'arcs'
/** Black-and-white op-art, drawn: rings, a checkerboard, stripes or nested arcs. */
export function OpArt({ kind, ink, bg, className }: { kind: Op; ink: string; bg: string; className?: string }): React.JSX.Element {
  const rings = Array.from({ length: 14 }, (_, i) => 100 - i * 7)
  return (
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="200" height="200" fill={bg} />
      {kind === 'rings' && rings.map((r, i) => <circle key={r} cx="100" cy="200" r={r * 1.9} fill={i % 2 ? bg : ink} />)}
      {kind === 'arcs' && rings.map((r, i) => <circle key={r} cx="40" cy="100" r={r * 1.6} fill={i % 2 ? bg : ink} />)}
      {kind === 'checker' && Array.from({ length: 100 }, (_, i) => ((i % 10) + Math.floor(i / 10)) % 2 ? null : <rect key={i} x={(i % 10) * 20} y={Math.floor(i / 10) * 20} width="20" height="20" fill={ink} />)}
      {kind === 'stripes' && Array.from({ length: 20 }, (_, i) => i % 2 ? null : <rect key={i} x={i * 10} y="0" width="10" height="200" fill={ink} transform={`skewX(${-8 + (i % 4)})`} />)}
    </svg>
  )
}

/** A single hand-drawn line that draws itself. The seed shapes its loops. */
export function Scribble({ seed, color, className, delay = 0.2, width = 2.2 }: { seed: number; color: string; className?: string; delay?: number; width?: number }): React.JSX.Element {
  const d = useMemo(() => {
    const rand = seeded(seed)
    const points = Array.from({ length: 7 }, (_, i) => [i * 55 - 20 + rand() * 30, 30 + rand() * 140] as const)
    let path = `M ${points[0][0]} ${points[0][1]}`
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i]
      const [px, py] = points[i - 1]
      // A loop now and then, the way a pen wanders.
      const loop = rand() > 0.55 ? 60 : 0
      path += ` C ${px + 40} ${py - loop}, ${x - 40 + loop} ${y + loop}, ${x} ${y}`
    }
    return path
  }, [seed])
  return (
    <svg viewBox="0 0 320 200" className={className} fill="none" aria-hidden>
      <motion.path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: still() ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: still() ? 0 : 1.1, delay, ease: [0.45, 0, 0.2, 1] }} />
    </svg>
  )
}

/** A folder that opens and lifts its papers out, stepped like file tabs so each one's title shows whole. */
export function Folder({ titles, color, paper, ink }: { titles: string[]; color: string; paper: string; ink: string }): React.JSX.Element {
  const [open, setOpen] = useState(still())
  useEffect(() => {
    if (still()) return
    const timer = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(timer)
  }, [])
  const shown = titles.slice(0, 3)
  const fan = shown.length === 1 ? [0] : shown.length === 2 ? [-1, 1] : [-1, 0, 1]
  // The back paper rises highest: each title sits in the strip the paper in front leaves clear.
  const step = (i: number): number => (shown.length - 1 - i) * 30
  return (
    <div className="relative mx-auto mt-[18%] aspect-[4/3] max-h-[70%] w-[min(78%,300px)]" data-wrap-folder>
      <div className="absolute inset-x-0 bottom-0 h-[78%] rounded-[6px]" style={{ background: color, filter: 'brightness(0.82)' }}>
        <div className="absolute -top-[10%] left-0 h-[12%] w-[38%] rounded-t-[6px]" style={{ background: color, filter: 'brightness(0.82)' }} />
      </div>
      {shown.map((title, i) => (
        <motion.div key={title + i} className="absolute bottom-[18%] left-[10%] flex h-[70%] w-[80%] items-start rounded-[4px] px-3 py-2 text-left text-[13px] leading-snug font-semibold shadow-md"
          style={{ background: paper, color: ink, transformOrigin: '50% 100%' }}
          initial={false}
          animate={open ? { y: -40 - step(i), x: fan[i] * 10, rotate: fan[i] * 2 } : { y: 0, x: 0, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 24, delay: still() ? 0 : 0.35 + i * 0.08 }}>
          <span className="block min-w-0 truncate">{title}</span>
        </motion.div>
      ))}
      <motion.div className="absolute inset-x-0 bottom-0 h-[62%] rounded-[6px]" style={{ background: color, transformOrigin: '50% 100%' }}
        initial={false} animate={{ rotateX: open ? -28 : 0 }} transition={{ duration: 0.45, ease: EASE, delay: still() ? 0 : 0.2 }} />
    </div>
  )
}

const SILK = `
precision mediump float;
uniform float t; uniform vec2 r; uniform vec3 c1; uniform vec3 c2; uniform vec3 c0;
void main() {
  vec2 p = gl_FragCoord.xy / r.xy; vec2 q = p * 3.0;
  float w = sin(q.x * 1.7 + t * 0.35 + sin(q.y * 2.3 + t * 0.2) * 1.4);
  float v = sin(q.y * 1.3 - t * 0.25 + w * 1.6) * 0.5 + 0.5;
  float f = smoothstep(0.1, 0.95, v * (0.6 + 0.4 * sin(t * 0.15 + p.x * 4.0)));
  vec3 col = mix(c0, mix(c1, c2, p.y + 0.3 * w), f * 0.85);
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = vec4(col + (g - 0.5) * 0.04, 1.0);
}`
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]

/** A slow silk of light, drawn by a small shader; one still frame with motion off. */
export function Silk({ base, a, b }: { base: string; a: string; b: string }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    const gl = el?.getContext('webgl', { preserveDrawingBuffer: true })
    if (!el || !gl) return
    const shader = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
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
    gl.uniform3fv(u('c0'), rgb(base))
    gl.uniform3fv(u('c1'), rgb(a))
    gl.uniform3fv(u('c2'), rgb(b))
    const draw = (time: number): void => {
      el.width = el.clientWidth
      el.height = el.clientHeight
      gl.viewport(0, 0, el.width, el.height)
      gl.uniform2f(u('r'), el.width, el.height)
      gl.uniform1f(u('t'), time / 1000)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    if (still()) return void draw(4000)
    let frame = requestAnimationFrame(function tick(now) {
      draw(now)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [base, a, b])
  return <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden />
}
