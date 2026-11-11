import { markOpened } from '@/lib/media-opened'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'

import { cue } from '@/lib/cues'
import { barsOf, waveformOf, type Waveform } from '@/lib/waveform'
import './sound-player.css'

/** The speeds "1×" steps through, and back to the first. */
const RATES = [1, 1.5, 2]
/** A bar and the gap after it, in pixels: thin and close, as a waveform is drawn small. */
const BAR = 2
const STEP = 4
/** The waveform's height, and its tallest bar. */
const HIGH = 28
const TALLEST = 24
/** How far ← and → move, in seconds. */
const NUDGE = 5

/** 0:42, 12:05, and past an hour 2:00:04. */
export const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60]
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/**
 * A recording by what it is and how long: 'Voice note · 0:56', never its file
 * name's '.m4a' or its size. One dropped in keeps its own name, without the
 * extension.
 */
export function soundTitle(name: string | null | undefined, seconds: number | null): string {
  const said = /^voice note\b/i.test(name ?? '') || !name ? 'Voice note' : name.replace(/\.[a-z0-9]{2,5}$/i, '')
  if (!seconds) return said
  // Past an hour, 2:00:00, never '120:00'.
  return `${said} · ${clock(seconds)}`
}

/**
 * Haligtree's one sound player, wherever a recording shows (a note, quick capture, Media, a meeting): a round play
 * button, the recording's own waveform (lib/waveform.ts) with what has played in ink and the rest faint, a playhead
 * to drag or anywhere on it to click, and the time on the right. Under it, quietly, its name, the speed and whatever
 * the place adds (`status`: a note's "No transcript · Transcribe"). No volume: the Mac's own keys do that.
 */
export function SoundPlayer({ src, name, length, onLength, onPlaying, status, className, inline }: {
  src: string
  /** On one line, for a list of them (Files' Audio): the speed beside the time, the time one width in every row, no line under. */
  inline?: boolean
  /** Its name on the quiet line ("Voice note"; its length is the time on the right); left out where the place already names it. */
  name?: string
  /** The length kept with it, so the player knows it before the sound is read. */
  length?: number | null
  /** Told the true length once the sound is read, for a place that keeps it. */
  onLength?: (seconds: number) => void
  onPlaying?: (playing: boolean) => void
  status?: React.ReactNode
  className?: string
}): React.JSX.Element {
  const sound = useRef<HTMLAudioElement>(null)
  const wave = useRef<HTMLDivElement>(null)
  const [shape, setShape] = useState<Waveform | null>(null)
  const [width, setWidth] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  const [at, setAt] = useState(0)
  const [rate, setRate] = useState(1)
  // Where the pointer rests on the waveform, as a share of it: a faint line there, and its time in the time's place.
  const [hover, setHover] = useState<number | null>(null)
  const started = useRef(false)
  // Where the playhead was held, against the pointer, while it is dragged.
  const grip = useRef(0)
  const told = useRef({ onLength, onPlaying })
  told.current = { onLength, onPlaying }

  // A sound whose waveform cannot be read still plays: its length then is the one the file itself gives, if any.
  const [own, setOwn] = useState(0)
  const end = length || shape?.seconds || own
  useEffect(() => {
    let live = true
    void waveformOf(src).then((found) => {
      if (!live || !found) return
      setShape(found)
      if (!length && found.seconds) told.current.onLength?.(found.seconds)
    })
    return () => void (live = false)
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

  // As many bars as fit, one every STEP pixels.
  useLayoutEffect(() => {
    const el = wave.current
    if (!el) return
    const measure = (): void => setWidth(el.clientWidth)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  // The share played, written straight onto the playhead and the ink each frame while it plays: nothing re-renders
  // as it moves, and only those two are touched (a variable on the waveform restyled all its bars every frame).
  const head = useRef<HTMLSpanElement>(null)
  const ink = useRef<HTMLDivElement>(null)
  const share = useRef(0)
  const place = (to: number): void => {
    share.current = Math.min(1, Math.max(0, Number.isFinite(to) ? to : 0))
    const across = (wave.current?.clientWidth ?? 0) * share.current
    if (head.current) head.current.style.transform = `translateX(${across}px)`
    if (ink.current) ink.current.style.clipPath = `inset(0 calc(100% - ${across}px) 0 0)`
    wave.current?.setAttribute('data-at', share.current.toFixed(4))
  }
  // A wider or narrower player keeps its place.
  useLayoutEffect(() => place(share.current), [width]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const media = sound.current
    if (!media) return
    const sync = (): void => {
      setPlaying(!media.paused)
      setEnded(media.ended)
      setAt(media.currentTime)
      setRate(media.playbackRate)
      if (Number.isFinite(media.duration)) setOwn(media.duration)
      if (end) place(media.ended ? 1 : media.currentTime / end)
    }
    const finish = (): void => cue('media-end')
    const events = ['play', 'pause', 'timeupdate', 'seeked', 'ended', 'ratechange', 'durationchange']
    events.forEach((one) => media.addEventListener(one, sync))
    media.addEventListener('ended', finish)
    sync()
    let frame = 0
    let second = -1
    const glide = (): void => {
      if (end) place(media.currentTime / end)
      // The time on the right turns over with the sound's own second, not a quarter second late.
      if (Math.floor(media.currentTime) !== second) (second = Math.floor(media.currentTime), setAt(media.currentTime))
      frame = requestAnimationFrame(glide)
    }
    if (playing) frame = requestAnimationFrame(glide)
    return () => {
      events.forEach((one) => media.removeEventListener(one, sync))
      media.removeEventListener('ended', finish)
      cancelAnimationFrame(frame)
    }
  }, [playing, end])
  useEffect(() => told.current.onPlaying?.(playing), [playing])

  const toggle = (): void => {
    const media = sound.current
    if (!media) return
    if (!media.paused) return (cue('pause'), media.pause())
    if (media.ended) (cue('media-replay'), (media.currentTime = 0))
    else cue(started.current ? 'play' : 'media-start')
    started.current = true
    markOpened(src)
    void media.play()
  }
  const seek = (share: number): void => {
    const media = sound.current
    if (!media || !end) return
    const to = Math.min(1, Math.max(0, share)) * end
    started.current = true
    media.currentTime = to
    setAt(to)
    setEnded(false)
    place(to / end)
  }
  const speed = (): void => {
    const media = sound.current
    if (!media) return
    const next = (RATES.indexOf(media.playbackRate) + 1) % RATES.length
    cue('media-speed', next)
    media.playbackRate = RATES[next]
  }
  const shareAt = (event: { clientX: number }): number => {
    const box = wave.current!.getBoundingClientRect()
    return box.width ? (event.clientX - box.left) / box.width : 0
  }

  // Keys on the waveform: ← and → by five seconds, Home and End, Space or Return to play. Listened for on the
  // waveform itself, before the editor around it, which would take them as moving the caret.
  useEffect(() => {
    const el = wave.current
    if (!el) return
    const key = (event: KeyboardEvent): void => {
      const media = sound.current
      if (!media || !end) return
      const to = { ArrowLeft: media.currentTime - NUDGE, ArrowRight: media.currentTime + NUDGE, Home: 0, End: end }[event.key]
      if (to === undefined && event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      event.stopPropagation()
      if (to === undefined) toggle()
      else seek(to / end)
    }
    el.addEventListener('keydown', key)
    return () => el.removeEventListener('keydown', key)
  })

  const bars = barsOf(shape?.peaks ?? [], Math.floor((width + STEP - BAR) / STEP))
  const drawn = (
    <svg aria-hidden width={width} height={HIGH} className="mf-sound-bars">
      {bars.map((level, i) => {
        const tall = Math.max(BAR, level * TALLEST)
        return <rect key={i} x={i * STEP} y={(HIGH - tall) / 2} width={BAR} height={tall} rx={BAR / 2} />
      })}
    </svg>
  )
  const state = ended ? 'ended' : playing ? 'playing' : 'paused'
  // The time on the right: its length at rest, how far in once it has started, the time under the pointer while it rests there.
  const shown = hover !== null && end ? hover * end : started.current || at > 0 ? at : end
  const press = (run: () => void) => (event: React.KeyboardEvent): void => void ((event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), event.stopPropagation(), run()))
  // One width at every speed (the widest kept under it, right-aligned).
  const speedButton = (
    <span role="button" tabIndex={0} data-speed data-sound-control className="tiptap-media-speed mf-sound-speed" aria-label={`Speed ${rate} times`} title="Change the speed"
      onClick={speed} onKeyDown={press(speed)}>
      <span>{rate}×</span><span aria-hidden className="mf-sound-reserve">1.5×</span>
    </span>
  )
  return (
    <div data-sound-player data-state={state} data-inline={inline || undefined} data-length={end || undefined} className={`mf-sound${className ? ` ${className}` : ''}`} contentEditable={false}
      // Its controls are its own: a press on one never moves the editor's selection, nor opens what holds it (a Media
      // tile opens its note). A press between them is the block's, which picks it, as any block is picked.
      onMouseDown={(event) => (event.target as Element).closest('[data-sound-control]') && event.stopPropagation()}
      onClick={(event) => (event.target as Element).closest('[data-sound-control]') && event.stopPropagation()}>
      <audio ref={sound} src={src} preload="metadata" />
      <span role="button" tabIndex={0} data-sound-play data-sound-control className="tiptap-media-play mf-sound-play" data-state={state}
        aria-label={ended ? 'Play again' : playing ? 'Pause' : 'Play'} title={ended ? 'Play again' : playing ? 'Pause' : 'Play'}
        onClick={toggle} onKeyDown={press(toggle)}>
        {/* All three drawn, one shown: the swap is a quick morph, never a wait. */}
        <Play data-icon="paused" />
        <Pause data-icon="playing" />
        <RotateCcw data-icon="ended" />
      </span>
      <div ref={wave} data-wave data-sound-control role="slider" tabIndex={0} aria-label="Place in it" aria-valuemin={0} aria-valuemax={Math.round(end)} aria-valuenow={Math.round(at)} aria-valuetext={`${clock(at)} of ${clock(end)}`}
        className="mf-sound-wave" data-ready={shape ? '' : undefined}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          // Taken by the playhead itself, it moves from where it was held, never jumping under the pointer; anywhere
          // else, it jumps there and follows.
          const off = share.current - shareAt(event)
          grip.current = Math.abs(off * event.currentTarget.clientWidth) <= 8 ? off : 0
          seek(shareAt(event) + grip.current)
        }}
        onPointerMove={(event) => {
          const to = Math.min(1, Math.max(0, shareAt(event)))
          if (event.currentTarget.hasPointerCapture(event.pointerId)) seek(to + grip.current)
          setHover(to)
        }}
        onPointerLeave={() => setHover(null)}>
        {drawn}
        <div ref={ink} className="mf-sound-played" aria-hidden>{drawn}</div>
        {hover !== null && <span className="mf-sound-ghost" aria-hidden style={{ left: `${hover * 100}%` }} />}
        <span ref={head} data-playhead className="mf-sound-head" aria-hidden />
      </div>
      {/* As wide as its longest time, so the waveform beside it never moves as the numbers change. */}
      <span data-sound-time className="tiptap-media-time mf-sound-time" style={{ minWidth: `${Math.max(inline ? 5 : 0, clock(end).length)}ch` }}>{clock(shown)}</span>
      {inline ? speedButton : <div className="mf-sound-under">
        {name && <span className="tiptap-attachment-name mf-sound-name">{name}</span>}
        {name && status && <span className="mf-sound-dot" aria-hidden>·</span>}
        {status && <span data-sound-control className="mf-sound-status">{status}</span>}
        {/* At the line's end, under the time. */}
        {speedButton}
      </div>}
    </div>
  )
}
