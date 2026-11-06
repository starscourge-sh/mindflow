import { useEffect, useLayoutEffect, useRef } from 'react'

import { cn } from '@/lib/cn'
import { byKeys, still } from '@/lib/motion'
import { useCentreOn } from '@/lib/centre-on'
import { clock } from './sound-player'

/** The bars of the live level: as thin and as close as the player's waveform, so a recording keeps one look. */
const BAR = 2
const STEP = 4
/** A new bar this often: the level moves in from the right at about 57 bars a second's worth of room. */
const EVERY = 70
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
/** Kept: how long the tick shows before the bar goes back, and how long going back takes. */
export const BACK_AFTER = 120
export const BACK = 160

/**
 * Haligtree's one recorder bar, for everything that listens (a voice note, talk to type, a meeting): × on the left,
 * the sound's level as a waveform growing in from the right, the time behind a small red light, and the way to end
 * it on the right. In a window with a place for it (quick capture's footer, `docked`), it grows out of the
 * microphone (`from`, its middle in the bar's own pixels) over that row and, kept, goes back into it; anywhere else it
 * floats at the bottom, centred on what it writes into (`over`), a thing of its own.
 */
export function RecorderBar({ label, role = 'dialog', level, start, end, seconds, waiting, docked, from, over, closing, data }: {
  label: string
  /** A voice note's bar holds the keys (a dialog); talk to type's is a group, the writing keeping the caret and the keys. */
  role?: 'dialog' | 'group'
  /** The level now, from 0 (quiet) to 1, read once a frame. */
  level: () => number
  start: React.ReactNode
  end: React.ReactNode
  /** How long it has listened; left out where time does not matter (talk to type). */
  seconds?: number
  /** Said in the level's place until it is listening ("Getting ready…"). */
  waiting?: React.ReactNode
  docked?: boolean
  from?: number | null
  over?: HTMLElement | null
  /** Ending: it goes back where it came from. */
  closing?: boolean
  /** The bar's own marks, for the place that uses it (`data-voice-recorder`). */
  data?: Record<string, string | true>
}): React.JSX.Element {
  const bar = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const read = useRef(level)
  read.current = level
  const middle = useCentreOn(docked ? null : over)

  // The shape it grows from and goes back into: the microphone's round button where it sat, or a short pill.
  const seed = (): string => {
    const width = bar.current?.offsetWidth ?? 0
    const at = from ?? width / 2
    return `inset(0 ${Math.max(0, width - at - 16)}px 0 ${Math.max(0, at - 16)}px round 16px)`
  }
  // Opened by a key (⌘K, "/record" and Return) it is simply there; from the mic, it grows out of it.
  useLayoutEffect(() => {
    if (!docked || still() || byKeys() || !bar.current) return
    bar.current.animate([{ clipPath: seed() }, { clipPath: 'inset(0 0 0 0 round 16px)' }], { duration: 260, easing: EASE })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!closing || still() || !bar.current) return
    // Docked, it stays solid as it shrinks back into the mic, the row's own controls coming back under it as it goes.
    const going = docked ? [{ clipPath: 'inset(0 0 0 0 round 16px)' }, { clipPath: seed() }] : [{ opacity: 1 }, { opacity: 0, transform: 'translateY(4px)' }]
    // A beat for the tick on Stop to be seen (BACK_AFTER), then back where it came from.
    bar.current.animate(going, { duration: BACK, delay: BACK_AFTER, easing: EASE, fill: 'forwards' })
  }, [closing]) // eslint-disable-line react-hooks/exhaustive-deps

  // Floating over a note, never over the line it writes into: that line is scrolled up clear of the bar, with room
  // made under the note's end for it while the bar is up (writing at the end of a long note, there was none).
  useLayoutEffect(() => {
    const el = bar.current
    if (docked || !over || !el) return
    const at = getSelection()?.anchorNode
    const line = (at?.nodeType === 1 ? (at as Element) : at?.parentElement)?.closest('p, li, h1, h2, h3, h4, blockquote, pre')
    if (!line || !over.contains(line)) return
    const need = line.getBoundingClientRect().bottom - (el.getBoundingClientRect().top - 16)
    if (need <= 0) return
    let scroller = over.parentElement
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    if (!scroller) return
    // The room goes under what holds the writing, never on the editor itself: a style written on the editor is a
    // change it reads as its own, and it put the caret back at the start.
    const holder = over.parentElement
    if (!holder) return
    const before = holder.style.paddingBottom
    holder.style.paddingBottom = `${need}px`
    scroller.scrollBy({ top: need, behavior: 'instant' })
    return () => void (holder.style.paddingBottom = before)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // The level as a waveform moving in from the right, as Voice Memos draws it: a bar every EVERY ms, the loudest
  // moment since the last one, gliding left between them; older bars fade out at the left.
  useEffect(() => {
    const levels: number[] = []
    let loudest = 0
    let last = performance.now()
    let frame = 0
    const draw = (): void => {
      frame = requestAnimationFrame(draw)
      const el = canvas.current
      if (!el) return
      const now = performance.now()
      loudest = Math.max(loudest, Math.min(1, Math.max(0, read.current())))
      if (now - last >= EVERY) {
        levels.push(loudest)
        if (levels.length > 400) levels.shift()
        loudest = 0
        last = now
      }
      const ratio = devicePixelRatio
      const width = el.clientWidth * ratio, height = el.clientHeight * ratio
      if (el.width !== width || el.height !== height) (el.width = width, el.height = height)
      const c = el.getContext('2d')!
      c.clearRect(0, 0, width, height)
      c.fillStyle = getComputedStyle(el).color
      // Between two new bars the row slides one step left, so it moves smoothly rather than in jumps.
      const slide = still() ? 0 : Math.min(1, (now - last) / EVERY) * STEP * ratio
      const step = STEP * ratio, thin = BAR * ratio
      // Quiet is a faint line through the middle, never a row of dots; sound stands up from it as bars.
      c.globalAlpha = 0.35
      c.fillRect(0, (height - ratio) / 2, width, ratio)
      c.globalAlpha = 1
      for (let i = levels.length - 1, x = width - thin - slide; i >= 0 && x > -step; i -= 1, x -= step) {
        if (!levels[i]) continue
        const tall = Math.max(thin * 2, levels[i] * height)
        c.beginPath()
        c.roundRect(x, (height - tall) / 2, thin, tall, thin / 2)
        c.fill()
      }
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div ref={bar} role={role} aria-label={label} data-recorder-bar={docked ? 'docked' : 'floating'} {...data}
      className={cn('mf-voice-pill z-[1000] flex items-center gap-2 px-0.5',
        docked ? 'absolute inset-0' : 'fixed bottom-28 left-1/2 w-[340px] max-w-[calc(100vw-24px)] -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-2 duration-200')}
      style={docked || middle === null ? undefined : { left: middle }}>
      {start}
      <span className="relative flex h-6 min-w-0 flex-1 items-center">
        {/* Faded at the left, where the oldest of it moves out. */}
        <canvas ref={canvas} data-voice-level aria-hidden className={cn('h-6 w-full text-foreground/70 [mask-image:linear-gradient(90deg,transparent,#000_30%)]', waiting && 'invisible')} />
        {waiting && <span className="absolute inset-0 flex items-center justify-center text-control">{waiting}</span>}
      </span>
      {seconds !== undefined && (
        // The time with a small red light before it, the one sign of "on air" every recorder shares.
        <span className="flex shrink-0 items-center gap-1.5 text-control tabular-nums text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-[var(--tt-color-text-red)] motion-safe:animate-pulse" />
          <span data-voice-time>{clock(seconds)}</span>
        </span>
      )}
      {end}
    </div>
  )
}
