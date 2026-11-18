/**
 * Film grain: a fine moving grain laid over a painting, as on a film still:
 * one CSS pixel a grain, faint, about eighteen new frames a second. The app's
 * own: a few small tiles of grey grain are made once for the window and laid
 * over the picture in turn, each frame at a new place, never a
 * canvas of fresh random numbers. It moves only while on screen and while the
 * window is looked at (`awakeFrames`); with Motion off or Reduce motion it is
 * one still frame. It lies over the picture only: put it inside the picture's
 * own box, under any words.
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
    // One grey a pixel, written as a whole pixel at once (opaque: its alpha byte full).
    const pixels = new Uint32Array(image.data.buffer)
    const grey = new Uint8Array(pixels.length)
    crypto.getRandomValues(grey)
    for (let i = 0; i < pixels.length; i++) pixels[i] = 0xff000000 | (grey[i] * 0x010101)
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
