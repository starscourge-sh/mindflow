import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { allThemes, applyTheme, currentTheme, isLight, themeName, type Theme } from '@/lib/theme'
import { chime, click, step } from '@/lib/sound'
import { falloff } from '@/lib/proximity'
import { Swatch } from '@/components/theme/theme-picker'
import { Rolling } from './ui'
import { DialParticles, type Sparks } from './dial-particles'
import { still } from '@/lib/motion'

/**
 * The welcome's theme dial: every theme as a detent around a ring, the one
 * worn now at the top under a small notch. Turned with ← and →, a drag, or
 * a click on a swatch; never the wheel, which scrolls the page. The window wears each theme as it
 * passes (a preview, not kept), with a note of a scale per detent; `onPick`
 * says which is at the top, and the welcome keeps it when you move on.
 *
 * Keys turn it at once (pressed many times, they should never wait for a
 * settle); a drag follows the pointer and lands on the nearest detent with a
 * little spring, carrying the flick's speed. A full turn one way is noticed.
 *
 * It guides the hand: each swatch grows and brightens the nearer it comes to
 * the notch, the notch glows and dips toward it, a drag is drawn gently into
 * each detent, and a tick is heard and the notch bumps as one passes. The
 * first time it is seen, it rocks a little, to show it turns. Large, a faint
 * stream of light runs round it toward the notch (dial-particles.tsx).
 */
// The rock is shown once a session: a hint, not a habit.

/** -180..180: how far `deg` is from the top. */
const offTop = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180
/** 1 at the notch, falling smoothly to 0 at `reach` degrees away. */
const near = (deg: number, reach: number): number => falloff(offTop(deg), reach)

export function ThemeDial({ size = 200, big = false, calm = false, wear = (theme) => applyTheme(theme, false), onPick, onFullTurn, say }: { size?: number; /** The name under it set as a title, for the welcome's centrepiece. */ big?: boolean; /** It does not turn itself: already shown, or settled. */ calm?: boolean; /** How the window puts a theme on as it passes (the welcome spreads it from the notch). */ wear?: (theme: Theme) => void; onPick: (theme: Theme) => void; onFullTurn?: () => void; /** Said in place of the theme's name, for a moment. */ say?: string }): React.JSX.Element {
  const themes = allThemes()
  const n = themes.length
  const per = 360 / n
  const [at, setAt] = useState(() => Math.max(0, themes.indexOf(currentTheme())))
  // The ring's turn, in degrees: minus the detent at the top, times `per`. Not wrapped, so a turn is a turn.
  const turn = useMotionValue(-at * per)
  const counter = useTransform(turn, (deg) => -deg)
  const [grabbing, setGrabbing] = useState(false)
  // Touched yet: the hint under the name goes once you have.
  const [touched, setTouched] = useState(false)
  // The notch: how near the nearest swatch is (1 when one sits under it), and a bump as one passes.
  const pull = useTransform(turn, (deg) => near(deg - Math.round(deg / per) * per, per / 2))
  const bump = useMotionValue(1)
  const notchY = useTransform(pull, (p) => p * 2)
  const notchScale = useTransform([pull, bump], ([p, b]: number[]) => (0.8 + 0.35 * p) * b)
  const glow = useTransform(pull, (p) => p * p)
  const glowScale = useTransform(pull, (p) => 0.6 + 0.4 * p)
  // Detents passed one way, for the full turn.
  const travelled = useRef(0)
  const told = useRef(false)
  // The light round a large dial: a few sparks when a swatch lands on release.
  const sparks: Sparks = useRef(null)

  const wrap = (i: number): number => ((i % n) + n) % n

  // A detent reached: worn, heard, and told.
  const land = (raw: number, by: 1 | -1 | 0, heard: 'note' | 'tick' = 'note'): void => {
    const i = wrap(raw)
    if (i === at && by === 0) return
    if (heard === 'tick') {
      click('tick')
      if (!still()) animate(bump, [1.45, 1], { type: 'spring', bounce: 0.3, duration: 0.3 })
    } else step(i)
    wear(themes[i])
    setAt(i)
    onPick(themes[i])
    if (by) {
      travelled.current = Math.sign(travelled.current) === by || travelled.current === 0 ? travelled.current + by : by
      if (!told.current && Math.abs(travelled.current) >= n) {
        told.current = true
        chime('cheer')
        onFullTurn?.()
      }
    }
  }

  /** To detent `raw` (unwrapped), by key (at once) or by pointer (a spring, carrying `velocity`). */
  const go = (raw: number, how: 'key' | 'pointer', velocity = 0): void => {
    const target = -raw * per
    setTouched(true)
    if (how === 'key' || still()) turn.jump(target)
    else {
      const run = animate(turn, target, { type: 'spring', bounce: 0.25, duration: 0.45, velocity })
      // A flick carries the ring past stops on its way: each one it passes ticks, the last one rings as it lands.
      let passing = here()
      const off = turn.on('change', (deg) => {
        const now = Math.round(-deg / per)
        if (now !== passing && now !== raw) click('tick')
        passing = now
      })
      void run.then(off, off)
      // Landed, and still there (not caught by another drag): a few sparks rise from it.
      if (big) void run.then(() => !drag.current && Math.abs(turn.get() - target) < 0.5 && sparks.current?.(wrap(raw)))
    }
  }
  const here = (): number => Math.round(-turn.get() / per)

  // A step turns the ring and ticks, as a drag does: a dial is
  // seen and heard turning, not swapped; a key steps it at once, with its tick.
  const nudge = (by: 1 | -1, how: 'key' | 'pointer' = 'pointer'): void => {
    const next = here() + by
    land(next, by, 'tick')
    go(next, how)
  }

  // The first sight of it: once you have had a moment with the page, the ring
  // turns itself, a theme, then another, each worn by the page as it lands,
  // and comes back to where you were. It shows what the dial does better than
  // a rock could. Any touch of yours stops it where it is.
  const yours = useRef(false)
  yours.current = touched
  useEffect(() => {
    // Each time the welcome shows it (played again from ⌘K too): it is the one place it turns itself.
    if (!big || calm || still()) return
    const home = here()
    let run: { stop: () => void } | undefined
    const to = (raw: number, by: 1 | -1): void => {
      if (yours.current) return
      land(raw, by, 'tick')
      run = animate(turn, -raw * per, { type: 'spring', bounce: 0.25, duration: 0.5 })
    }
    const steps = [setTimeout(() => to(home + 1, 1), 2200), setTimeout(() => to(home + 2, 1), 3900), setTimeout(() => to(home, -1), 5800)]
    return () => (steps.forEach(clearTimeout), run?.stop())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // No wheel: scrolling over the dial scrolls the page, as everywhere. A drag or ← and → turn it.
  const ring = useRef<HTMLDivElement>(null)

  // A drag: the ring follows the angle of the pointer around its middle, 1:1.
  const drag = useRef<{ from: number; turn: number; last: number; moved: number; samples: { t: number; deg: number }[] } | null>(null)
  const angleOf = (event: React.PointerEvent): number => {
    const box = ring.current!.getBoundingClientRect()
    return (Math.atan2(event.clientY - (box.top + box.height / 2), event.clientX - (box.left + box.width / 2)) * 180) / Math.PI
  }
  const onDown = (event: React.PointerEvent): void => {
    if (event.button !== 0) return
    // A click on a swatch is a click: the drag starts once it moves.
    // A pointer the system did not make (the welcome's hand) cannot be captured, and needs not be.
    try {
      ring.current?.setPointerCapture(event.pointerId)
    } catch {
      // Followed without it.
    }
    turn.stop()
    setTouched(true)
    drag.current = { from: angleOf(event), turn: turn.get(), last: here(), moved: 0, samples: [] }
    setGrabbing(true)
  }
  const onMove = (event: React.PointerEvent): void => {
    const now = drag.current
    if (!now) return
    let delta = angleOf(event) - now.from
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    // Unwrapped as it goes past the back, so a long drag keeps turning.
    now.from += delta
    now.moved += Math.abs(delta)
    now.turn += delta
    // Drawn into each detent: the ring lags the hand a little either side of one, and catches up between.
    const k = Math.round(now.turn / per) * per
    const half = per / 2
    const f = (now.turn - k) / half
    turn.set(k + Math.sign(f) * half * Math.abs(f) ** 1.6)
    now.samples = [...now.samples.slice(-4), { t: performance.now(), deg: now.turn }]
    const detent = here()
    if (detent !== now.last) {
      land(detent, detent > now.last ? 1 : -1, 'tick')
      now.last = detent
    }
  }
  const onUp = (event: React.PointerEvent): void => {
    const now = drag.current
    drag.current = null
    setGrabbing(false)
    if (!now) return
    if (ring.current?.hasPointerCapture(event.pointerId)) ring.current.releasePointerCapture(event.pointerId)
    // Hardly moved: a click, on a swatch or the face. A swatch is turned to the top the short way round.
    if (now.moved < 4) {
      const hit = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-detent]')
      const i = hit ? Number(hit.dataset.detent) : at
      const ahead = wrap(i - at) <= n / 2 ? wrap(i - at) : wrap(i - at) - n
      if (ahead) land(here() + ahead, ahead > 0 ? 1 : -1)
      go(here() + ahead, 'pointer')
      return
    }
    const [first, last] = [now.samples[0], now.samples[now.samples.length - 1]]
    const velocity = first && last && last.t > first.t ? ((last.deg - first.deg) / (last.t - first.t)) * 1000 : 0
    // Projected a little past where it was let go, the way a flicked knob carries on.
    const projected = Math.round(-(turn.get() + velocity * 0.12) / per)
    if (projected !== now.last) land(projected, projected > now.last ? 1 : -1)
    else step(wrap(projected))
    go(projected, 'pointer', velocity)
  }

  // The band the detents sit in, and the swatches in it, grow with the dial so a large one is not a thin rim.
  const band = Math.max(30, Math.round(size * 0.14))
  const radius = size / 2 - band * 0.6
  const grow = Math.max(1, size / 240)
  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div
        ref={ring}
        role="slider"
        tabIndex={0}
        aria-label="Theme"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={at + 1}
        aria-valuetext={themeName(themes[at])}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          event.stopPropagation()
          turn.stop()
          nudge(event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1, 'key')
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={`group/dial relative shrink-0 touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${grabbing ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ width: size, height: size }}
      >
        {/* The face: a machined ring, the detents set into it. */}
        <div aria-hidden className="absolute inset-0 rounded-full border bg-[color-mix(in_oklab,var(--foreground)_4%,var(--background))] shadow-[inset_0_1px_0_color-mix(in_oklab,white_8%,transparent),inset_0_-10px_24px_-12px_color-mix(in_oklab,var(--mf-shadow-ink)_40%,transparent),0_12px_32px_-14px_color-mix(in_oklab,var(--mf-shadow-ink)_45%,transparent)]" />
        <div aria-hidden className="absolute rounded-full border bg-background shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_20%,transparent)]" style={{ inset: band }} />
        {/* The notch at the top: where the theme you are wearing sits. */}
        {/* A soft light under it, brighter as a swatch comes home; and the notch itself dips toward it. */}
        <motion.div aria-hidden className="pointer-events-none absolute left-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_32%,transparent),transparent)]" style={{ width: band * 1.9, height: band * 1.9, top: band * 0.6 - band * 0.95, x: '-50%', opacity: glow, scale: glowScale }} />
        <motion.div aria-hidden className="absolute top-[3px] left-1/2 -ml-px h-[7px] w-[2px] origin-top rounded-full bg-primary" style={{ y: notchY, scale: notchScale }} />
        <motion.div aria-hidden className="absolute inset-0" style={{ rotate: turn }}>
          {/* A knurled edge round the face, like a grip: it turns with the ring, and darkens under the hand. */}
          <svg className={`absolute inset-0 transition-opacity duration-200 ease-(--mf-ease) ${grabbing ? 'opacity-100' : 'opacity-60 group-hover/dial:opacity-90'}`} viewBox={`0 0 ${size} ${size}`}>
            {/* Two rows, the inner one set half a step round, as the dots on a drag handle sit. */}
            {[0, 1].flatMap((row) => Array.from({ length: GRIP }, (_, k) => {
              const a = ((k + row / 2) / GRIP) * Math.PI * 2
              const dot = Math.max(1.25, size / 200)
              const r = size / 2 - band - Math.max(7, band * 0.24) - row * dot * 3.6
              return <circle key={`${row}-${k}`} cx={size / 2 + r * Math.cos(a)} cy={size / 2 + r * Math.sin(a)} r={dot} className="fill-foreground/30" />
            }))}
          </svg>
          {themes.map((theme, i) => {
            const deg = i * per - 90
            const x = size / 2 + radius * Math.cos((deg * Math.PI) / 180)
            const y = size / 2 + radius * Math.sin((deg * Math.PI) / 180)
            return <Detent key={theme} theme={theme} i={i} x={x} y={y} per={per} grow={grow} turn={turn} counter={counter} />
          })}
        </motion.div>
        {/* The middle: a sample of the words, in the theme being worn. */}
        <div aria-hidden className="pointer-events-none absolute flex flex-col items-center justify-center rounded-full" style={{ inset: band }}>
          <span className="font-heading leading-none tracking-[-0.02em] text-foreground" style={{ fontSize: Math.max(32, size * 0.17) }}>Aa</span>
          <span className="mt-1.5 h-[3px] w-6 rounded-full bg-primary" />
        </div>
        {big && <DialParticles size={size} band={band} per={per} turn={turn} at={at} touched={touched} grabbing={grabbing} light={isLight(themes[at])} sparks={sparks} />}
      </div>
      <div className="flex flex-col items-center">
        {big ? (
          // Large, the name passes whole, a soft crossfade: letters rolling at speed read as a flicker.
          <span className="relative grid h-[1.4em] max-w-[20rem] place-items-center text-[0.9375rem] leading-[1.4] font-medium text-foreground">
            <AnimatePresence initial={false}>
              <motion.span key={say ?? themes[at]} className="col-start-1 row-start-1 truncate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                {say ?? themeName(themes[at])}
              </motion.span>
            </AnimatePresence>
          </span>
        ) : <Rolling text={say ?? themeName(themes[at])} by="character" className="h-5 max-w-[16rem] truncate text-control font-medium text-foreground" />}
        {big && <span aria-hidden className={`text-meta text-muted-foreground transition-opacity duration-300 ease-(--mf-ease) ${touched ? 'opacity-0' : 'opacity-100'}`}>Drag the ring</span>}
      </div>
    </div>
  )
}

/** How many dots make the grip round the face. */
const GRIP = 48

/** One swatch on the ring: larger and brighter the nearer it is to the notch, falling off smoothly. */
function Detent({ theme, i, x, y, per, grow, turn, counter }: { theme: Theme; i: number; x: number; y: number; per: number; grow: number; turn: MotionValue<number>; counter: MotionValue<number> }): React.JSX.Element {
  const close = useTransform(turn, (deg) => near(i * per + deg, per * 1.6))
  const scale = useTransform(close, (c) => 0.8 + 0.34 * c)
  const opacity = useTransform(close, (c) => 0.55 + 0.45 * c)
  return (
    <motion.span
      data-detent={i}
      className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full [--mf-swatch-ring:color-mix(in_oklab,var(--foreground)_4%,var(--background))]"
      style={{ left: x, top: y, rotate: counter }}
    >
      <motion.span style={{ zoom: grow, scale, opacity }}>
        <Swatch theme={theme} />
      </motion.span>
    </motion.span>
  )
}
