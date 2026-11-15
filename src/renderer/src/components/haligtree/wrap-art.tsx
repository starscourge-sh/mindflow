import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform, type PanInfo } from 'motion/react'
import { EASE, still } from '@/lib/motion'
import { num } from '../../../../main/dates'
import { seeded } from './wrap-worlds'

/**
 * The drawn pieces the wrap cards are made of: op-art, a scribble that draws
 * itself, a folder that fans out notes, a stack to drag through, sunbursts,
 * a word tiled, a looping line of tags, tags that fall and pile, a silk
 * shader, a curved row of pictures and a word that rolls.
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

/** A folder that opens and fans its papers out, each a note's title. */
export function Folder({ titles, color, paper, ink }: { titles: string[]; color: string; paper: string; ink: string }): React.JSX.Element {
  const [open, setOpen] = useState(still())
  useEffect(() => {
    if (still()) return
    const timer = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(timer)
  }, [])
  const shown = titles.slice(0, 3)
  const fan = shown.length === 1 ? [0] : shown.length === 2 ? [-1, 1] : [-1, 0, 1]
  return (
    <div className="relative mx-auto mt-[18%] aspect-[4/3] max-h-[70%] w-[min(78%,300px)]" data-wrap-folder>
      <div className="absolute inset-x-0 bottom-0 h-[78%] rounded-[6px]" style={{ background: color, filter: 'brightness(0.82)' }}>
        <div className="absolute -top-[10%] left-0 h-[12%] w-[38%] rounded-t-[6px]" style={{ background: color, filter: 'brightness(0.82)' }} />
      </div>
      {shown.map((title, i) => (
        <motion.div key={title + i} className="absolute bottom-[18%] left-[12%] flex h-[70%] w-[76%] items-start rounded-[4px] p-3 text-left text-[13px] leading-snug font-semibold shadow-md"
          style={{ background: paper, color: ink, transformOrigin: '50% 100%' }}
          initial={false}
          animate={open ? { y: -70 - (1 - Math.abs(fan[i])) * 18, x: fan[i] * 62, rotate: fan[i] * 12 } : { y: 0, x: 0, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20, delay: still() ? 0 : 0.35 + i * 0.08 }}>
          <span className="line-clamp-4 break-words">{title}</span>
        </motion.div>
      ))}
      <motion.div className="absolute inset-x-0 bottom-0 h-[62%] rounded-[6px]" style={{ background: color, transformOrigin: '50% 100%' }}
        initial={false} animate={{ rotateX: open ? -28 : 0 }} transition={{ duration: 0.45, ease: EASE, delay: still() ? 0 : 0.2 }} />
    </div>
  )
}

/** A pile of cards: drag the top one away and it goes to the back, with a spring. */
export function Stack({ cards, colors, ink }: { cards: { title: string; note: string }[]; colors: string[]; ink: string }): React.JSX.Element {
  const [order, setOrder] = useState(() => cards.map((_, i) => i))
  const send = (): void => setOrder((now) => [...now.slice(1), now[0]])
  const shown = order.slice(0, 4)
  return (
    <div className="relative mx-auto aspect-[4/5] max-h-full w-[min(70%,240px)]" data-wrap-stack>
      {[...shown].reverse().map((index, back) => {
        const depth = shown.length - 1 - back
        return (
          <motion.div key={index} drag={depth === 0} dragSnapToOrigin dragElastic={0.6}
            onDragEnd={(_, info: PanInfo) => (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 500) && send()}
            onClick={(event) => (event.stopPropagation(), depth === 0 && send())} whileDrag={{ rotate: 6, scale: 1.03 }}
            className={`absolute inset-0 flex flex-col justify-between rounded-[8px] p-4 shadow-lg ${depth === 0 ? 'cursor-grab active:cursor-grabbing' : ''}`}
            style={{ background: colors[index % colors.length], color: ink, zIndex: 10 - depth }}
            animate={{ scale: 1 - depth * 0.05, y: depth * -12, rotate: depth === 0 ? 0 : (index % 2 ? 4 : -4) * depth }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
            <span className="text-[13px] font-semibold tabular-nums">#{index + 1}</span>
            <span className="leading-[1.02] font-black break-words line-clamp-3" style={{ fontSize: cards[index].title.length > 18 ? 18 : cards[index].title.length > 10 ? 22 : 30 }}>{cards[index].title}</span>
            <span className="text-[13px] font-semibold">{cards[index].note}</span>
          </motion.div>
        )
      })}
    </div>
  )
}

/** A sunburst, or a scalloped flower, slowly turning. */
export function Burst({ color, kind = 'sun', className, points = 14 }: { color: string; kind?: 'sun' | 'flower'; className?: string; points?: number }): React.JSX.Element {
  const d = useMemo(() => {
    if (kind === 'sun') {
      const pts = Array.from({ length: points * 2 }, (_, i) => {
        const r = i % 2 ? 62 : 100
        const a = (i / (points * 2)) * Math.PI * 2
        return `${100 + Math.cos(a) * r},${100 + Math.sin(a) * r}`
      })
      return `M ${pts.join(' L ')} Z`
    }
    let path = ''
    for (let i = 0; i < points; i++) {
      const a = (i / points) * Math.PI * 2
      const b = ((i + 1) / points) * Math.PI * 2
      const m = (a + b) / 2
      const [x0, y0, x1, y1] = [100 + Math.cos(a) * 78, 100 + Math.sin(a) * 78, 100 + Math.cos(b) * 78, 100 + Math.sin(b) * 78]
      path += `${i ? '' : `M ${x0} ${y0}`} Q ${100 + Math.cos(m) * 112} ${100 + Math.sin(m) * 112} ${x1} ${y1} `
    }
    return path + 'Z'
  }, [kind, points])
  return (
    <motion.svg viewBox="0 0 200 200" className={className} aria-hidden initial={{ rotate: 0, scale: still() ? 1 : 0.6 }} animate={{ rotate: still() ? 0 : 360, scale: 1 }}
      transition={{ rotate: { duration: 60, repeat: Infinity, ease: 'linear' }, scale: { type: 'spring', stiffness: 200, damping: 16 } }}>
      <path d={d} fill={color} />
    </motion.svg>
  )
}

/** A big number repeated in stacked colour bands, each a beat after the last. */
export function Bands({ n, colors, ink }: { n: number; colors: string[]; ink: string }): React.JSX.Element {
  return (
    <div className="flex flex-col" data-wrap-bands>
      {colors.map((color, i) => (
        <motion.div key={i} className="overflow-hidden px-3 text-[clamp(24px,6.5cqi,60px)] leading-[0.95] font-black tracking-tight tabular-nums" style={{ background: color, color: ink }}
          initial={still() ? false : { clipPath: 'inset(0 100% 0 0)' }} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ delay: 0.15 + i * 0.07, duration: 0.32, ease: EASE }}>
          {num(n)}
        </motion.div>
      ))}
    </div>
  )
}

/** A word tiled across the card as a pattern. */
export function Tiled({ word, color, rows = 9 }: { word: string; color: string; rows?: number }): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <motion.div key={i} className="text-[44px] leading-[0.9] font-black whitespace-nowrap uppercase" style={{ color: `color-mix(in srgb, ${color} 30%, var(--wrap-bg))`, marginLeft: i % 2 ? -40 : 0 }}
          initial={still() ? false : { x: i % 2 ? 40 : -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.03, duration: 0.3, ease: EASE }}>
          {Array.from({ length: 8 }, () => word).join(' ')}
        </motion.div>
      ))}
    </div>
  )
}

/** Outlined words stacked, echoing the solid one. */
export function Echo({ text, color, size = 54 }: { text: string; color: string; size?: number }): React.JSX.Element {
  return (
    <div className="relative font-black uppercase leading-[0.86]" style={{ fontSize: size }}>
      {[3, 2, 1].map((i) => (
        <motion.div key={i} className="break-words" aria-hidden style={{ color: 'transparent', WebkitTextStroke: `1.5px ${color}` }}
          initial={still() ? false : { y: 0, opacity: 0 }} animate={{ y: 0, opacity: 1 - i * 0.22 }} transition={{ delay: 0.1 * (4 - i), duration: 0.3 }}>
          {text}
        </motion.div>
      ))}
      <In at={0.4}><div className="break-words" style={{ color }}>{text}</div></In>
    </div>
  )
}

/** A line of words running along a curve, for ever. */
export function CurvedLoop({ words, color, bend = 60 }: { words: string[]; color: string; bend?: number }): React.JSX.Element {
  const id = useMemo(() => `loop-${Math.random().toString(36).slice(2)}`, [])
  const offset = useMotionValue(0)
  useEffect(() => {
    if (still()) return
    const run = animate(offset, -50, { duration: 18, repeat: Infinity, ease: 'linear' })
    return () => run.stop()
  }, [offset])
  const start = useTransform(offset, (at) => `${at}%`)
  const text = Array.from({ length: 6 }, () => words.map((w) => `${w}  ·  `).join('')).join('')
  return (
    <svg viewBox="0 0 400 160" className="w-[130%] -ml-[15%] overflow-visible" aria-hidden>
      <path id={id} d={`M -20 ${90 - bend / 2} Q 200 ${90 + bend} 420 ${90 - bend / 2}`} fill="none" />
      <text fontSize="30" fontWeight="900" fill={color} style={{ textTransform: 'uppercase' }}>
        <motion.textPath href={`#${id}`} startOffset={start}>{text}</motion.textPath>
      </text>
    </svg>
  )
}

/**
 * Words that drop and pile up: a small 2D world of boxes with gravity, a
 * floor and walls. Still motion shows the pile already settled.
 */
export function FallingWords({ words, colors, ink, seed }: { words: string[]; colors: string[]; ink: string; seed: number }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const items = useRef<HTMLDivElement[]>([])
  useEffect(() => {
    const host = box.current
    if (!host) return
    const W = host.clientWidth
    const H = host.clientHeight
    const rand = seeded(seed)
    const bodies = items.current.map((el, i) => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      return { el, w, h, x: rand() * Math.max(1, W - w), y: -h - i * 46, vx: 0, vy: 0, a: (rand() - 0.5) * 0.6 }
    })
    const stepOnce = (): void => {
      for (const b of bodies) {
        b.vy = Math.min(b.vy + 0.6, 18)
        b.y += b.vy
        b.x = Math.max(0, Math.min(W - b.w, b.x + b.vx))
        b.vx *= 0.9
        if (b.y + b.h > H) (b.y = H - b.h), (b.vy = 0), (b.a *= 0.8)
      }
      // Boxes rest on each other: push the lower overlap up, and slide sideways off an edge.
      for (let i = 0; i < bodies.length; i++)
        for (let j = 0; j < bodies.length; j++) {
          if (i === j) continue
          const [a, b] = [bodies[i], bodies[j]]
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
          if (ox <= 0 || oy <= 0 || a.y > b.y) continue
          a.y -= oy
          a.vy = 0
          const edge = a.x + a.w / 2 - (b.x + b.w / 2)
          if (Math.abs(edge) > b.w * 0.42) a.vx += Math.sign(edge) * 0.8
        }
      for (const b of bodies) b.el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.a}rad)`
    }
    if (still()) {
      for (let i = 0; i < 400; i++) stepOnce()
      return
    }
    let frame = requestAnimationFrame(function tick() {
      stepOnce()
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [words, seed])
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden" aria-hidden data-wrap-falling>
      {words.map((word, i) => (
        <div key={word + i} ref={(el) => void (el && (items.current[i] = el))} className="absolute top-0 left-0 max-w-[90%] truncate rounded-full px-3 py-1 text-[15px] font-black uppercase"
          style={{ background: colors[i % colors.length], color: ink, transform: 'translate(-999px, -999px)' }}>{word}</div>
      ))}
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
/** Glowing lines that bend, after React Bits' LineWaves (MIT + Commons Clause, (c) David Haz), cut down to one pass. */
const LINES = `
precision mediump float;
uniform float t; uniform vec2 r; uniform vec3 c1; uniform vec3 c2; uniform vec3 c0;
void main() {
  vec2 p = gl_FragCoord.xy / r.y;
  float w = 0.6 * sin(p.x * 1.1 + t * 0.4 + 0.6 * sin(p.y * 1.8 - t * 0.28)) + 0.2 * sin(p.x * 2.6 - t * 0.33 + p.y * 1.6);
  float y = p.y * 9.0 + w * 2.2;
  float line = 1.0 - smoothstep(0.0, 0.09, abs(fract(y) - 0.5) - 0.02);
  vec3 tint = mix(c1, c2, 0.5 + 0.5 * sin(floor(y) * 0.7 + t * 0.2));
  gl_FragColor = vec4(mix(c0, tint, line * 0.85 * (0.4 + 0.6 * p.x)), 1.0);
}`
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]

/** A slow silk of light, drawn by a small shader; one still frame with motion off. */
export function Silk({ base, a, b, lines = false }: { base: string; a: string; b: string; lines?: boolean }): React.JSX.Element {
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
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, lines ? LINES : SILK))
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
  }, [base, a, b, lines])
  return <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden />
}

/** The period's pictures on a curved row that turns slowly; drag to turn it yourself. */
export function CurvedGallery({ pictures }: { pictures: { src: string; title: string }[] }): React.JSX.Element {
  const turn = useMotionValue(0)
  useEffect(() => {
    if (still() || pictures.length < 2) return
    const run = animate(turn, [0, -pictures.length * 34], { duration: pictures.length * 4, repeat: Infinity, ease: 'linear' })
    return () => run.stop()
  }, [turn, pictures.length])
  const shown = pictures.slice(0, 10)
  return (
    <motion.div className="relative h-full min-h-[200px] w-full" style={{ perspective: 900 }} data-wrap-gallery onPan={(_, info) => turn.set(turn.get() + info.delta.x * 0.3)}>
      {shown.map((one, i) => <Panel key={one.src + i} one={one} i={i} turn={turn} count={shown.length} />)}
    </motion.div>
  )
}
function Panel({ one, i, turn, count }: { one: { src: string; title: string }; i: number; turn: ReturnType<typeof useMotionValue<number>>; count: number }): React.JSX.Element {
  const span = count * 34
  const angle = useTransform(turn, (at) => ((((i * 34 + at) % span) + span) % span) - span / 2)
  const transform = useTransform(angle, (a) => `translate(-50%, -50%) translateZ(-300px) rotateY(${a}deg) translateZ(300px) translateY(${Math.abs(a) * 0.5}px)`)
  const opacity = useTransform(angle, (a) => (Math.abs(a) > 80 ? 0 : 1 - Math.abs(a) / 110))
  return (
    <motion.img src={one.src} alt={one.title} draggable={false} className="absolute top-1/2 left-1/2 aspect-[3/4] h-[78%] rounded-[6px] object-cover"
      style={{ transform, opacity }} />
  )
}

/** Words that roll through, one at a time, like a departure board. */
export function TextLoop({ words, every = 1.4 }: { words: string[]; every?: number }): React.JSX.Element {
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (still() || words.length < 2) return
    const timer = setInterval(() => setAt((n) => (n + 1) % words.length), every * 1000)
    return () => clearInterval(timer)
  }, [words.length, every])
  return (
    <span className="relative inline-flex overflow-hidden align-bottom" style={{ height: '1.1em' }}>
      <motion.span key={at} className="block whitespace-nowrap" initial={still() ? false : { y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
        {words[at]}
      </motion.span>
    </span>
  )
}
