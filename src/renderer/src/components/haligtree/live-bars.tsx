import { useEffect, useRef } from 'react'
import { still } from '@/lib/motion'

/**
 * One waveform mark for every recording: Media's audio tiles and a voice note or dropped sound in a note
 * (attachment-view.tsx) wear the same one, moving with what plays.
 */
/** The six bars of the waveform mark (lucide's AudioLines): where each stands across, and its height at rest. */
const BARS = [[2, 3], [6, 11], [10, 18], [14, 7], [18, 13], [22, 3]] as const
/** One Web Audio graph per recording element: an element can be wired into one only once. */
const heard = new WeakMap<HTMLAudioElement, AnalyserNode>()
let ears: AudioContext | null = null

/**
 * The waveform mark, moving with what is playing: each bar's height follows the loudness of its own band of the
 * sound, read every frame from an analyser, so speech and music move it differently. Still at its drawn heights when
 * paused or with Motion off. Written straight onto the bars each frame, so nothing re-renders as it moves.
 */
export function LiveBars({ sound, playing, className = 'size-7' }: { sound: React.RefObject<HTMLAudioElement | null>; playing: boolean; className?: string }): React.JSX.Element {
  const bars = useRef<(SVGLineElement | null)[]>([])
  /** Each bar's height now, as a share of its drawn height: where a settle starts from. */
  const now = useRef<number[]>(BARS.map(() => 1))
  const put = (at: number, scale: number): void => {
    now.current[at] = scale
    const bar = bars.current[at]
    if (!bar) return
    if (scale === 1) bar.removeAttribute('transform')
    else bar.setAttribute('transform', `translate(0 ${12 * (1 - scale)}) scale(1 ${scale})`)
  }
  useEffect(() => {
    const audio = sound.current
    let frame = 0
    // Stopped or done: the bars ease back to the mark's own shape over a quarter second, never snap.
    const settle = (): void => {
      const from = [...now.current]
      if (still() || from.every((one) => one === 1)) return BARS.forEach((_, at) => put(at, 1))
      const start = performance.now()
      const step = (): void => {
        const t = Math.min(1, (performance.now() - start) / 260)
        const eased = 1 - (1 - t) ** 3
        from.forEach((one, at) => put(at, one + (1 - one) * eased))
        if (t < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }
    if (!playing || !audio || still()) {
      settle()
      return () => cancelAnimationFrame(frame)
    }
    ears ??= new AudioContext()
    void ears.resume()
    let analyser = heard.get(audio)
    if (!analyser) {
      analyser = ears.createAnalyser()
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.7
      ears.createMediaElementSource(audio).connect(analyser).connect(ears.destination)
      heard.set(audio, analyser)
    }
    const levels = new Uint8Array(analyser.frequencyBinCount)
    const draw = (): void => {
      analyser.getByteFrequencyData(levels)
      BARS.forEach(([, tall], at) => {
        // Each bar its own slice of the low and middle bands, where voices and most music are.
        const level = levels[1 + at * 3] / 255
        // From a short stub to the full height of the mark, about its middle.
        put(at, Math.max(2, level * 18) / tall)
      })
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [playing, sound])
  return (
    <svg data-media-wave aria-hidden viewBox="0 0 24 24" className={`${className} overflow-visible`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      {BARS.map(([x, tall], at) => (
        <line key={x} ref={(bar) => void (bars.current[at] = bar)} x1={x} x2={x} y1={12 - tall / 2} y2={12 + tall / 2} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}
