import { useEffect, useRef } from 'react'

import { still } from '@/lib/motion'

/**
 * The welcome's first screen, once: a tree drawn in the letters of its own
 * first line, beside the words, never behind them. Each letter flickers
 * through the line's letters and settles in its place, the trunk first and
 * the crown last, in about two seconds, pale as pencil on the paper; then,
 * as the next lines come (`away`), it fades so they are read alone. Not
 * drawn at all under reduced motion, nor where the window is too narrow to
 * keep it clear of the words.
 */
export function WelcomeTree({ letters, away }: { letters: string; away: boolean }): React.JSX.Element | null {
  const box = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = box.current
    if (!canvas || still()) return
    const pool = [...letters.replace(/[^\p{L}]/gu, '')]
    if (!pool.length) return
    const COLS = 46
    const ROWS = 40
    // One tree, the same every time: a seeded random, so the shape is Haligtree's own.
    let seed = 7
    const random = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const blobs = Array.from({ length: 9 }, (_, i) => ({ x: COLS / 2 + (random() - 0.5) * 26, y: 13 + (random() - 0.5) * 12 - (i === 0 ? 2 : 0), r: 6 + random() * 5 }))
    type Cell = { x: number; y: number; char: string; at: number; ink: number }
    const cells: Cell[] = []
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const fromMid = Math.abs(x + 0.5 - COLS / 2)
        // The trunk: narrow, widening to its roots; two boughs leave it under the crown.
        const trunk = y > 21 && fromMid < 1.6 + Math.max(0, y - 33) * 0.7
        const bough = y > 17 && y < 27 && Math.abs(fromMid - (27 - y) * 1.1) < 0.9
        const crown = blobs.reduce((most, one) => Math.max(most, 1 - Math.hypot((x - one.x) * 0.9, y - one.y) / one.r), 0)
        if (!trunk && !bough && (crown <= 0 || random() > 0.35 + crown)) continue
        const ink = trunk || bough ? 0.85 : 0.35 + crown * 0.6
        // Settled from the roots up, each a little apart from its neighbours.
        cells.push({ x, y, char: pool[Math.floor(random() * pool.length)], at: ((ROWS - y) / ROWS) * 1500 + random() * 450, ink })
      }
    }
    const context = canvas.getContext('2d')
    if (!context) return
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim() || '#333'
    const fit = (): void => {
      const scale = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * scale
      canvas.height = canvas.clientHeight * scale
      context.setTransform(scale, 0, 0, scale, 0, 0)
    }
    fit()
    const start = performance.now()
    let frame = 0
    const draw = (now: number): void => {
      const t = now - start
      const w = canvas.clientWidth
      const cell = w / COLS
      context.clearRect(0, 0, w, canvas.clientHeight)
      context.font = `${Math.round(cell * 1.05)}px ui-monospace, "SF Mono", Menlo, monospace`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillStyle = ink
      for (const one of cells) {
        const left = one.at - t
        if (left > 500) continue
        // Coming in: a faint letter that keeps changing; settled: its own letter, at its ink.
        const settled = left <= 0
        const char = settled ? one.char : pool[(Math.floor(t / 70) + one.x * 7 + one.y * 3) % pool.length]
        context.globalAlpha = (settled ? one.ink * 0.42 : 0.12 + (1 - left / 500) * 0.12)
        context.fillText(char, (one.x + 0.5) * cell, (one.y + 0.5) * cell * 1.25)
      }
      // Every letter settled: nothing moves, so nothing is drawn again.
      if (t < 2200) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    // A resize clears the canvas: drawn again as it stands.
    const again = (): void => (fit(), void (frame = requestAnimationFrame(draw)))
    window.addEventListener('resize', again)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', again)
    }
  }, [letters])
  return (
    <canvas ref={box} aria-hidden data-welcome-tree=""
      // Faded as the next lines come, so they are read alone.
      className={`pointer-events-none absolute top-1/2 right-[4vw] hidden aspect-[46/50] w-[min(30vw,30rem)] -translate-y-1/2 transition-opacity duration-700 ease-[var(--mf-ease)] min-[1180px]:block ${away ? 'opacity-0' : 'opacity-100'}`} />
  )
}
