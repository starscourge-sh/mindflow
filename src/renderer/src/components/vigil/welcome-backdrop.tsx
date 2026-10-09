import { useEffect, useRef } from 'react'

/**
 * The welcome's background, behind every chapter: one family a chapter, drawn
 * on one 2D canvas in the theme's own ink, never above about 8% contrast so
 * the words always win. After React Bits' backgrounds, adapted, not copied:
 *
 * - dots: a grid of small dots; near the pointer they brighten and grow a little (Dot Grid)
 * - threads: a few slow, faint lines drifting across, the links of Connect (Threads)
 * - ruled: a ruled page with its margin, for Write (Squares, as paper)
 * - none: only the grain the welcome always has (Return, Ready)
 *
 * Families crossfade on a chapter change. It draws only while something
 * moves, stops while the window is hidden, and is still (drawn once) with
 * Reduce motion or Motion off.
 */
export type Family = 'dots' | 'threads' | 'ruled' | 'none'

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

/** What a frame cost, for the probe: the worst and the average, in ms. */
const cost = { frames: 0, total: 0, worst: 0 }
;(window as unknown as { __welcomeBackdrop: typeof cost }).__welcomeBackdrop = cost

export function WelcomeBackdrop({ family }: { family: Family }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const wanted = useRef(family)
  wanted.current = family
  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    let width = 0, height = 0, frame = 0, ink = '0,0,0', accent = '0,0,0'
    // Each family's share of the picture, eased toward the one wanted.
    const amount: Record<Family, number> = { dots: 0, threads: 0, ruled: 0, none: 0 }
    amount[wanted.current] = 1
    const pointer = { x: -999, y: -999, near: 0 }
    const rgb = (css: string): string => {
      const probe = document.createElement('i')
      probe.style.color = css
      document.body.append(probe)
      const got = getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0, 3).join(',') ?? '0,0,0'
      probe.remove()
      return got
    }
    const colours = (): void => {
      ink = rgb('var(--foreground)')
      accent = rgb('var(--primary)')
    }
    colours()
    const size = (): void => {
      const dpr = Math.min(2, devicePixelRatio || 1)
      width = el.clientWidth
      height = el.clientHeight
      el.width = Math.round(width * dpr)
      el.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    size()
    let t = 0
    const GAP = 22
    let grid: HTMLCanvasElement | null = null
    let gridInk = ''
    let last = 0
    const draw = (now: number): void => {
      frame = 0
      const start = performance.now()
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      t += dt
      let moving = false
      // The crossfade: each family toward 1 if wanted, else 0, over about 0.6s.
      for (const one of Object.keys(amount) as Family[]) {
        const to = one === wanted.current ? 1 : 0
        const next = still() ? to : amount[one] + (to - amount[one]) * Math.min(1, dt * 5)
        if (Math.abs(next - to) > 0.01) moving = true
        amount[one] = Math.abs(next - to) <= 0.01 ? to : next
      }
      pointer.near += ((pointer.x > -999 ? 1 : 0) - pointer.near) * Math.min(1, dt * 6)
      ctx.clearRect(0, 0, width, height)
      if (amount.dots > 0) {
        // The grid drawn once into its own canvas, laid down whole each frame;
        // only the dots near the pointer are drawn again, lifted.
        if (!grid || grid.width !== el.width || grid.height !== el.height || gridInk !== ink) {
          grid = document.createElement('canvas')
          grid.width = el.width
          grid.height = el.height
          gridInk = ink
          const g = grid.getContext('2d')!
          g.setTransform(el.width / width, 0, 0, el.height / height, 0, 0)
          g.fillStyle = `rgba(${ink},0.075)`
          g.beginPath()
          for (let y = GAP / 2; y < height; y += GAP) for (let x = GAP / 2; x < width; x += GAP) (g.moveTo(x + 1, y), g.arc(x, y, 1, 0, Math.PI * 2))
          g.fill()
        }
        ctx.globalAlpha = amount.dots
        ctx.drawImage(grid, 0, 0, width, height)
        ctx.globalAlpha = 1
        if (!still() && pointer.near > 0.01) {
          const reach = 130
          const x0 = Math.max(GAP / 2, Math.floor((pointer.x - reach) / GAP) * GAP + GAP / 2)
          const y0 = Math.max(GAP / 2, Math.floor((pointer.y - reach) / GAP) * GAP + GAP / 2)
          for (let y = y0; y <= pointer.y + reach && y < height; y += GAP) {
            for (let x = x0; x <= pointer.x + reach && x < width; x += GAP) {
              const lift = Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / reach) * pointer.near
              if (lift < 0.02) continue
              // Covered first, then the lifted dot: a touch higher, larger and in the accent.
              ctx.fillStyle = `rgba(${accent},${(0.08 + 0.17 * lift) * amount.dots})`
              ctx.beginPath()
              ctx.arc(x, y - lift * 2, 1 + lift * 0.9, 0, Math.PI * 2)
              ctx.fill()
            }
          }
        }
        if (pointer.near > 0.01 && pointer.near < 0.99) moving = true
      }
      if (amount.threads > 0) {
        ctx.lineWidth = 1
        for (let i = 0; i < 5; i++) {
          ctx.strokeStyle = `rgba(${i === 2 ? accent : ink},${(i === 2 ? 0.09 : 0.06) * amount.threads})`
          ctx.beginPath()
          for (let x = 0; x <= width; x += 12) {
            const y = height * (0.3 + i * 0.1) + Math.sin(x / (180 + i * 40) + t * (0.25 + i * 0.05) + i) * (28 + i * 6) + Math.sin(x / 70 + t * 0.4) * 4
            if (x) ctx.lineTo(x, y)
            else ctx.moveTo(x, y)
          }
          ctx.stroke()
        }
        if (!still()) moving = true
      }
      if (amount.ruled > 0) {
        ctx.fillStyle = `rgba(${ink},${0.06 * amount.ruled})`
        for (let y = 30; y < height; y += 30) ctx.fillRect(0, y, width, 1)
        ctx.fillStyle = `rgba(${accent},${0.09 * amount.ruled})`
        ctx.fillRect(Math.min(28, width * 0.03), 0, 1, height)
      }
      const spent = performance.now() - start
      cost.frames += 1
      cost.total += spent
      cost.worst = Math.max(cost.worst, spent)
      if (moving) wake()
    }
    const wake = (): void => {
      if (frame || document.visibilityState === 'hidden') return
      frame = requestAnimationFrame(draw)
    }
    const onMove = (event: PointerEvent): void => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      if (wanted.current === 'dots' && !still()) wake()
    }
    const onLeave = (): void => void ((pointer.x = -999), wake())
    const onShow = (): void => void (document.visibilityState === "visible" ? ((last = 0), wake()) : (cancelAnimationFrame(frame), (frame = 0)))
    const resized = new ResizeObserver(() => (size(), wake()))
    resized.observe(el)
    const themed = new MutationObserver(() => (colours(), wake()))
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    addEventListener('pointermove', onMove)
    document.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onShow)
    ;(el as HTMLCanvasElement & { wake?: () => void }).wake = wake
    wake()
    return () => {
      cancelAnimationFrame(frame)
      resized.disconnect()
      themed.disconnect()
      removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [])
  // A new family: the loop picks it up and crossfades.
  useEffect(() => void (canvas.current as (HTMLCanvasElement & { wake?: () => void }) | null)?.wake?.(), [family])
  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
}
