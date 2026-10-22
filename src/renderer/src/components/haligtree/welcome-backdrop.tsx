import { useEffect, useRef } from 'react'
import { still } from '@/lib/motion'

/**
 * The welcome's background: still, faint marks in the theme's own ink, only
 * where they help, never above about 8% contrast so the words always win.
 * Nothing in it drifts or follows the pointer.
 *
 * - dots: a still grid of small dots, behind the dial (Make it yours)
 * - ruled: a ruled page with its margin, for Write
 * - none: only the grain the welcome always has (every other chapter)
 *
 * The only movement is a short crossfade when a chapter changes.
 */
export type Family = 'dots' | 'ruled' | 'none'

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
    const amount: Record<Family, number> = { dots: 0, ruled: 0, none: 0 }
    amount[wanted.current] = 1
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
    const GAP = 22
    let grid: HTMLCanvasElement | null = null
    let gridInk = ''
    let last = 0
    const draw = (now: number): void => {
      frame = 0
      const start = performance.now()
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      let moving = false
      // The crossfade: each family toward 1 if wanted, else 0, over about 0.6s.
      for (const one of Object.keys(amount) as Family[]) {
        const to = one === wanted.current ? 1 : 0
        const next = still() ? to : amount[one] + (to - amount[one]) * Math.min(1, dt * 5)
        if (Math.abs(next - to) > 0.01) moving = true
        amount[one] = Math.abs(next - to) <= 0.01 ? to : next
      }
      ctx.clearRect(0, 0, width, height)
      if (amount.dots > 0) {
        // The grid drawn once into its own canvas, laid down whole each frame.
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
    const onShow = (): void => void (document.visibilityState === "visible" ? ((last = 0), wake()) : (cancelAnimationFrame(frame), (frame = 0)))
    const resized = new ResizeObserver(() => (size(), wake()))
    resized.observe(el)
    const themed = new MutationObserver(() => (colours(), wake()))
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    document.addEventListener('visibilitychange', onShow)
    ;(el as HTMLCanvasElement & { wake?: () => void }).wake = wake
    wake()
    return () => {
      cancelAnimationFrame(frame)
      resized.disconnect()
      themed.disconnect()
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [])
  // A new family: the loop picks it up and crossfades.
  useEffect(() => void (canvas.current as (HTMLCanvasElement & { wake?: () => void }) | null)?.wake?.(), [family])
  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
}
