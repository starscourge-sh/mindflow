/**
 * Film grain, adapted from React Bits' Noise (reactbits.dev/animations/noise,
 * by David Haz, MIT + Commons Clause). A fine moving grain laid over a
 * painting, as on a film still: one CSS pixel a grain, faint, about eighteen
 * new frames a second.
 *
 * Changed from React Bits: a few small tiles of grain are made once and
 * shifted about, rather than a full canvas of new random numbers each frame;
 * it moves only while on screen and while the window is looked at
 * (`awakeFrames`), and with Motion off or Reduce motion it is one still frame.
 * It lies over the picture only: put it inside the picture's own box, under
 * any words.
 */
import { useEffect, useRef } from 'react'
import { awakeFrames, useStill } from '@/lib/motion'

const TILE = 192
const TILES = 4
const FPS = 18

let made: HTMLCanvasElement[] | null = null
/** The grain tiles, made once for the whole window. */
function tiles(): HTMLCanvasElement[] {
  if (made) return made
  made = Array.from({ length: TILES }, () => {
    const tile = document.createElement('canvas')
    tile.width = TILE
    tile.height = TILE
    const ctx = tile.getContext('2d')!
    const image = ctx.createImageData(TILE, TILE)
    for (let i = 0; i < image.data.length; i += 4) {
      const v = (Math.random() * 255) | 0
      image.data[i] = v
      image.data[i + 1] = v
      image.data[i + 2] = v
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
    return tile
  })
  return made
}

/** How strong the grain is: faint enough to feel rather than see. */
export const GRAIN_OPACITY = 0.08

export function FilmGrain({ className = '', opacity = GRAIN_OPACITY }: { className?: string; opacity?: number }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const still = useStill()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return undefined
    const all = tiles()
    let at = 0
    let last = 0
    let inView = false
    const draw = (): void => {
      // One canvas pixel to a CSS pixel: each grain is 1px however sharp the screen.
      const w = Math.max(1, Math.round(canvas.clientWidth))
      const h = Math.max(1, Math.round(canvas.clientHeight))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      at = (at + 1) % all.length
      const pattern = ctx.createPattern(all[at], 'repeat')
      if (!pattern) return
      const dx = (Math.random() * TILE) | 0
      const dy = (Math.random() * TILE) | 0
      ctx.setTransform(1, 0, 0, 1, -dx, -dy)
      ctx.fillStyle = pattern
      ctx.fillRect(dx, dy, w, h)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }
    draw()
    if (still) {
      // Drawn again only when its size changes.
      const sized = new ResizeObserver(draw)
      sized.observe(canvas)
      return () => sized.disconnect()
    }
    const loop = awakeFrames((now) => {
      if (!inView || document.hidden) return false
      if (now - last >= 1000 / FPS) {
        last = now
        draw()
      }
      return true
    })
    const seen = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      if (inView) loop.again()
    })
    seen.observe(canvas)
    const onShow = (): void => void (!document.hidden && loop.again())
    document.addEventListener('visibilitychange', onShow)
    return () => (loop.stop(), seen.disconnect(), document.removeEventListener('visibilitychange', onShow))
  }, [still])

  return (
    <canvas
      ref={ref}
      aria-hidden
      data-film-grain={still ? 'still' : 'moving'}
      className={`pointer-events-none absolute inset-0 size-full ${className}`}
      style={{ opacity, imageRendering: 'pixelated' }}
    />
  )
}
