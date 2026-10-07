import { useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { allThemes, applyTheme, currentTheme, themeName, type Theme } from '@/lib/theme'
import { chime, step } from '@/lib/sound'
import { Swatch } from '@/components/theme/theme-picker'
import { Rolling } from './ui'

/**
 * The welcome's theme dial: every theme as a detent around a ring, the one
 * worn now at the top under a small notch. Turned with ← and →, the scroll
 * wheel, a drag, or a click on a swatch. The window wears each theme as it
 * passes (a preview, not kept), with a note of a scale per detent; `onPick`
 * says which is at the top, and the welcome keeps it when you move on.
 *
 * Keys turn it at once (pressed many times, they should never wait for a
 * settle); a drag follows the pointer and lands on the nearest detent with a
 * little spring, carrying the flick's speed. A full turn one way is noticed.
 */
export function ThemeDial({ size = 200, onPick, onFullTurn, say }: { size?: number; onPick: (theme: Theme) => void; onFullTurn?: () => void; /** Said in place of the theme's name, for a moment. */ say?: string }): React.JSX.Element {
  const themes = allThemes()
  const n = themes.length
  const per = 360 / n
  const [at, setAt] = useState(() => Math.max(0, themes.indexOf(currentTheme())))
  // The ring's turn, in degrees: minus the detent at the top, times `per`. Not wrapped, so a turn is a turn.
  const turn = useMotionValue(-at * per)
  const counter = useTransform(turn, (deg) => -deg)
  const [grabbing, setGrabbing] = useState(false)
  // Detents passed one way, for the full turn.
  const travelled = useRef(0)
  const told = useRef(false)

  const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
  const wrap = (i: number): number => ((i % n) + n) % n

  // A detent reached: worn, heard, and told.
  const land = (raw: number, by: 1 | -1 | 0): void => {
    const i = wrap(raw)
    if (i === at && by === 0) return
    step(i)
    applyTheme(themes[i], false)
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
    if (how === 'key' || still()) turn.set(target)
    else animate(turn, target, { type: 'spring', bounce: 0.18, duration: 0.42, velocity })
  }
  const here = (): number => Math.round(-turn.get() / per)

  const nudge = (by: 1 | -1, how: 'key' | 'pointer'): void => {
    const next = here() + by
    land(next, by)
    go(next, how)
  }

  // The wheel: a detent per notch, or per 40px of a trackpad's glide.
  const wheel = useRef(0)
  const ring = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ring.current
    if (!el) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      wheel.current += Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      while (Math.abs(wheel.current) >= 40) {
        const by = wheel.current > 0 ? 1 : -1
        wheel.current -= by * 40
        nudge(by, 'pointer')
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  // A drag: the ring follows the angle of the pointer around its middle, 1:1.
  const drag = useRef<{ from: number; turn: number; last: number; moved: number; samples: { t: number; deg: number }[] } | null>(null)
  const angleOf = (event: React.PointerEvent): number => {
    const box = ring.current!.getBoundingClientRect()
    return (Math.atan2(event.clientY - (box.top + box.height / 2), event.clientX - (box.left + box.width / 2)) * 180) / Math.PI
  }
  const onDown = (event: React.PointerEvent): void => {
    if (event.button !== 0) return
    // A click on a swatch is a click: the drag starts once it moves.
    ring.current?.setPointerCapture(event.pointerId)
    turn.stop()
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
    turn.set(now.turn)
    now.samples = [...now.samples.slice(-4), { t: performance.now(), deg: now.turn }]
    const detent = here()
    if (detent !== now.last) {
      land(detent, detent > now.last ? 1 : -1)
      now.last = detent
    }
  }
  const onUp = (event: React.PointerEvent): void => {
    const now = drag.current
    drag.current = null
    setGrabbing(false)
    if (!now) return
    ring.current?.releasePointerCapture(event.pointerId)
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
    go(projected, 'pointer', velocity)
  }

  const radius = size / 2 - 18
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
          nudge(event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1, 'key')
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={`relative shrink-0 touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${grabbing ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ width: size, height: size }}
      >
        {/* The face: a machined ring, the detents set into it. */}
        <div aria-hidden className="absolute inset-0 rounded-full border bg-[color-mix(in_oklab,var(--foreground)_4%,var(--background))] shadow-[inset_0_1px_0_color-mix(in_oklab,white_8%,transparent),inset_0_-10px_24px_-12px_color-mix(in_oklab,var(--mf-shadow-ink)_40%,transparent),0_12px_32px_-14px_color-mix(in_oklab,var(--mf-shadow-ink)_45%,transparent)]" />
        <div aria-hidden className="absolute inset-[30px] rounded-full border bg-background shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_20%,transparent)]" />
        {/* The notch at the top: where the theme you are wearing sits. */}
        <div aria-hidden className="absolute top-[3px] left-1/2 h-[7px] w-[2px] -translate-x-1/2 rounded-full bg-primary" />
        <motion.div aria-hidden className="absolute inset-0" style={{ rotate: turn }}>
          {themes.map((theme, i) => {
            const deg = i * per - 90
            const x = size / 2 + radius * Math.cos((deg * Math.PI) / 180)
            const y = size / 2 + radius * Math.sin((deg * Math.PI) / 180)
            return (
              <motion.span
                key={theme}
                data-detent={i}
                className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full [--mf-swatch-ring:color-mix(in_oklab,var(--foreground)_4%,var(--background))]"
                style={{ left: x, top: y, rotate: counter }}
              >
                <span className={`transition-transform duration-150 ease-(--mf-ease) ${i === at ? 'scale-110' : 'scale-[0.82] opacity-70'}`}>
                  <Swatch theme={theme} />
                </span>
              </motion.span>
            )
          })}
        </motion.div>
        {/* The middle: a sample of the words, in the theme being worn. */}
        <div aria-hidden className="pointer-events-none absolute inset-[30px] flex flex-col items-center justify-center rounded-full">
          <span className="font-heading text-[2rem] leading-none tracking-[-0.02em] text-foreground">Aa</span>
          <span className="mt-1.5 h-[3px] w-6 rounded-full bg-primary" />
        </div>
      </div>
      <Rolling text={say ?? themeName(themes[at])} by="character" className="h-5 max-w-[16rem] truncate text-control font-medium text-foreground" />
    </div>
  )
}
