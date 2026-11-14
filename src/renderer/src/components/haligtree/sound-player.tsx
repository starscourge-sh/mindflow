import { keepLength, keepPlace, markOpened } from '@/lib/media-opened'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pause, PictureInPicture2, Play, RotateCcw } from 'lucide-react'

import { cue } from '@/lib/cues'
import { realMove } from '@/lib/real-move'
import { Fit as Maximize } from '@/components/ui/icons'
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

type Shared = {
  src: string
  /** The length kept with it, so the player knows it before the sound is read. */
  length?: number | null
  /** Told the true length once the sound is read, for a place that keeps it. */
  onLength?: (seconds: number) => void
  onPlaying?: (playing: boolean) => void
  className?: string
}

/**
 * Haligtree's one sound player, wherever a recording shows (a note, quick capture, Media, a meeting): a round play
 * button, the recording's own waveform (lib/waveform.ts) with what has played in ink and the rest faint, a playhead
 * to drag or anywhere on it to click, and the time on the right. Under it, quietly, its name, the speed and whatever
 * the place adds (`status`: a note's "No transcript · Transcribe"). No volume: the Mac's own keys do that.
 */
export function SoundPlayer(props: Shared & {
  /** On one line, for a list of them (Files' Audio): the speed beside the time, the time one width in every row, no line under. */
  inline?: boolean
  /** Its name on the quiet line ("Voice note"; its length is the time on the right); left out where the place already names it. */
  name?: string
  status?: React.ReactNode
}): React.JSX.Element {
  return <Player {...props} />
}

/**
 * The same player for a film, wherever one shows (a note, quick capture's box, Files' viewer): its picture, and over
 * the picture's foot the sound player's own bar, its parts and keys and speeds and time, on one line, with the film's
 * own two (picture in picture, full screen). Before it plays, its poster frame (Quick Look's, or its own first
 * frame), never a black box. While it plays the bar steps away once the pointer has been still and comes back on a
 * move. Its place is kept as it stops, for Files' "Carry on watching".
 */
export function VideoPlayer(props: Shared & {
  /** Its poster frame, made by Quick Look (files-shelves.tsx, useFileFace): shown until it plays. */
  poster?: string | null
  /** Where to start, in seconds: the place it was left at. */
  from?: number
  /** Played as soon as it can be (Files' viewer). */
  autoPlay?: boolean
  /** Its keys heard anywhere in the window (Files' viewer, which is all there is on screen), not only on the player. */
  windowKeys?: boolean
  /** Its picture's own size, once read. */
  onShape?: (width: number, height: number) => void
  /** A way to its own app, said where it cannot play. */
  onOpenOwn?: () => void
  /** Its picture's own style (Files' viewer sizes it to the window). */
  pictureStyle?: React.CSSProperties
}): React.JSX.Element {
  return <Player {...props} video />
}

function Player({ src, name, length, onLength, onPlaying, status, className, inline, video = false, poster, from, autoPlay, windowKeys, onShape, onOpenOwn, pictureStyle }: Shared & {
  inline?: boolean
  name?: string
  status?: React.ReactNode
  video?: boolean
  poster?: string | null
  from?: number
  autoPlay?: boolean
  windowKeys?: boolean
  onShape?: (width: number, height: number) => void
  onOpenOwn?: () => void
  pictureStyle?: React.CSSProperties
}): React.JSX.Element {
  const sound = useRef<HTMLAudioElement & HTMLVideoElement>(null)
  const wave = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const [shape, setShape] = useState<Waveform | null>(null)
  const [width, setWidth] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  const [at, setAt] = useState(0)
  const [rate, setRate] = useState(1)
  // Where the pointer rests on the waveform, as a share of it: a faint line there, and its time in the time's place.
  const [hover, setHover] = useState<number | null>(null)
  // The playhead held and dragged: a film's bar stays in sight however still the pointer is.
  const [scrubbing, setScrubbing] = useState(false)
  // A film that cannot be read here (a kind Chromium does not play): said in words over its frame.
  const [broken, setBroken] = useState(false)
  const started = useRef(false)
  // Where the playhead was held, against the pointer, while it is dragged.
  const grip = useRef(0)
  const told = useRef({ onLength, onPlaying, onShape })
  told.current = { onLength, onPlaying, onShape }

  // A sound whose waveform cannot be read still plays: its length then is the one the file itself gives, if any.
  const [own, setOwn] = useState(0)
  const end = length || shape?.seconds || own
  useEffect(() => {
    // A film's bar is a line, not a waveform: its sound is never decoded (a lecture's would be hundreds of megabytes).
    if (video) return
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

  // A film: its shape and length once read, where it was left, and its place kept each time it stops.
  useEffect(() => {
    const media = sound.current
    if (!video || !media) return
    const read = (): void => {
      if (media.videoWidth && media.videoHeight) told.current.onShape?.(media.videoWidth, media.videoHeight)
      if (Number.isFinite(media.duration) && media.duration > 0) {
        // Files' tiles say it too, without reading the file again.
        keepLength(src, Math.round(media.duration * 100) / 100)
        if (!length) told.current.onLength?.(Math.round(media.duration * 100) / 100)
      }
      // Carried on from where it was left, unless that was its very end.
      if (from && Number.isFinite(media.duration) && from < media.duration - 1 && media.currentTime === 0) (media.currentTime = from, (started.current = true))
    }
    const keep = (): void => void (Number.isFinite(media.duration) && media.duration > 0 && keepPlace(src, media.ended ? media.duration : media.currentTime, media.duration))
    const go = (): void => void (autoPlay && media.paused && !media.ended && toggle())
    const fail = (): void => setBroken(true)
    // Failed before it was listened to (a file the player gave up on at once).
    if (media.error) fail()
    if (media.readyState >= 1) read()
    media.addEventListener('loadedmetadata', read)
    media.addEventListener('pause', keep)
    media.addEventListener('ended', keep)
    media.addEventListener('error', fail)
    if (media.readyState >= 2) go()
    else media.addEventListener('loadeddata', go, { once: true })
    return () => {
      // Taken off the page once started (the note closed, the viewer put away, playing or moved along while paused): its place is kept too.
      if (started.current) keep()
      media.removeEventListener('loadedmetadata', read)
      media.removeEventListener('pause', keep)
      media.removeEventListener('ended', keep)
      media.removeEventListener('error', fail)
      media.removeEventListener('loadeddata', go)
    }
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (): void => {
    const media = sound.current
    if (!media || broken) return
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
  // A film's own two: its own little window over every app, and the whole screen (the frame goes, its bar with it).
  const popOut = (which: 'pip' | 'full'): void => {
    const media = sound.current
    if (!media) return
    const out = which === 'pip' ? document.pictureInPictureElement === media : document.fullscreenElement === root.current
    cue(out ? 'media-window-close' : 'media-window')
    if (which === 'pip') void (out ? document.exitPictureInPicture() : media.requestPictureInPicture()).catch(() => {})
    else void (out ? document.exitFullscreen() : (root.current?.requestFullscreen() ?? Promise.resolve())).catch(() => {})
  }
  const shareAt = (event: { clientX: number }): number => {
    const box = wave.current!.getBoundingClientRect()
    return box.width ? (event.clientX - box.left) / box.width : 0
  }

  // Keys on the waveform: ← and → by five seconds, Home and End, Space or Return to play. Listened for on the
  // waveform itself, before the editor around it, which would take them as moving the caret. A film hears them on
  // the whole of it (picture and bar), picked by a click on its picture; in Files' viewer, anywhere in the window.
  useEffect(() => {
    const el = video ? (windowKeys ? window : root.current) : wave.current
    if (!el) return
    const key = (event: Event): void => {
      const press = event as KeyboardEvent
      const media = sound.current
      if (!media || !end || press.metaKey || press.ctrlKey || press.altKey) return
      // A button of the player's own (or of the viewer round it) answers Space and Return itself.
      if (press.target instanceof HTMLButtonElement || (video && (press.target as Element | null)?.closest?.('[data-sound-control]') && (press.key === ' ' || press.key === 'Enter'))) return
      const to = { ArrowLeft: media.currentTime - NUDGE, ArrowRight: media.currentTime + NUDGE, Home: 0, End: end }[press.key]
      if (to === undefined && press.key !== ' ' && press.key !== 'Enter') return
      // A film takes Return only on itself: in a note it is the editor's (a new line after the block).
      if (video && press.key === 'Enter') return
      event.preventDefault()
      event.stopPropagation()
      wake()
      if (to === undefined) toggle()
      else seek(to / end)
    }
    el.addEventListener('keydown', key)
    return () => el.removeEventListener('keydown', key)
  })

  // A film's bar steps away while it plays and the pointer is still, and a move brings it back: one CSS fade that
  // waits two seconds and then goes, started again by each move (data-wake flips between two names, which restarts
  // it). No timer stands in for the pointer.
  const wakeName = useRef<'a' | 'b'>('a')
  const wake = (): void => {
    if (!video || !root.current) return
    wakeName.current = wakeName.current === 'a' ? 'b' : 'a'
    root.current.setAttribute('data-wake', wakeName.current)
  }

  const bars = barsOf(shape?.peaks ?? [], Math.floor((width + STEP - BAR) / STEP))
  const drawn = (
    <svg aria-hidden width={width} height={HIGH} className="mf-sound-bars">
      {video
        // A film's line: one long bar the whole way, the waveform's own parts (faint, the played part in ink).
        ? <rect x={0} y={HIGH / 2 - 1} width={width} height={2} rx={1} />
        : bars.map((level, i) => {
          const tall = Math.max(BAR, level * TALLEST)
          return <rect key={i} x={i * STEP} y={(HIGH - tall) / 2} width={BAR} height={tall} rx={BAR / 2} />
        })}
    </svg>
  )
  const state = broken ? 'broken' : ended ? 'ended' : playing ? 'playing' : 'paused'
  // The time on the right: its length at rest, how far in once it has started, the time under the pointer while it rests there.
  const shown = hover !== null && end ? hover * end : started.current || at > 0 ? at : end
  const press = (run: () => void) => (event: React.KeyboardEvent): void => void ((event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), event.stopPropagation(), run()))
  const flat = inline || video
  // One width at every speed (the widest kept under it, right-aligned).
  const speedButton = (
    <span role="button" tabIndex={0} data-speed data-sound-control className="tiptap-media-speed mf-sound-speed" aria-label={`Speed ${rate} times`} title="Change the speed"
      onClick={speed} onKeyDown={press(speed)}>
      <span>{rate}×</span><span aria-hidden className="mf-sound-reserve">1.5×</span>
    </span>
  )
  const bar = (
    <div data-sound-player data-state={state} data-inline={flat || undefined} data-length={end || undefined} className={`mf-sound${video ? ' mf-video-bar' : className ? ` ${className}` : ''}`} contentEditable={false}
      // Its controls are its own: a press on one never moves the editor's selection, nor opens what holds it (a Media
      // tile opens its note). A press between them is the block's, which picks it, as any block is picked.
      onMouseDown={(event) => (event.target as Element).closest('[data-sound-control]') && event.stopPropagation()}
      onClick={(event) => (event.target as Element).closest('[data-sound-control]') && event.stopPropagation()}>
      {!video && <audio ref={sound} src={src} preload="metadata" />}
      <span role="button" tabIndex={0} data-sound-play data-sound-control className="tiptap-media-play mf-sound-play" data-state={state}
        aria-label={ended ? 'Play again' : playing ? 'Pause' : 'Play'} title={ended ? 'Play again' : playing ? 'Pause' : 'Play'}
        onClick={toggle} onKeyDown={press(toggle)}>
        {/* All three drawn, one shown: the swap is a quick morph, never a wait. */}
        <Play data-icon="paused" />
        <Pause data-icon="playing" />
        <RotateCcw data-icon="ended" />
      </span>
      <div ref={wave} data-wave data-sound-control role="slider" tabIndex={0} aria-label="Place in it" aria-valuemin={0} aria-valuemax={Math.round(end)} aria-valuenow={Math.round(at)} aria-valuetext={`${clock(at)} of ${clock(end)}`}
        className="mf-sound-wave" data-ready={shape || video ? '' : undefined}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          setScrubbing(true)
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
        onPointerUp={() => setScrubbing(false)}
        onLostPointerCapture={() => setScrubbing(false)}
        onPointerLeave={() => setHover(null)}>
        {drawn}
        <div ref={ink} className="mf-sound-played" aria-hidden>{drawn}</div>
        {hover !== null && <span className="mf-sound-ghost" aria-hidden style={{ left: `${hover * 100}%` }} />}
        <span ref={head} data-playhead className="mf-sound-head" aria-hidden />
      </div>
      {/* As wide as its longest time, so the waveform beside it never moves as the numbers change. */}
      <span data-sound-time className="tiptap-media-time mf-sound-time" style={{ minWidth: `${Math.max(flat ? 5 : 0, clock(end).length)}ch` }}>{clock(shown)}</span>
      {flat ? speedButton : <div className="mf-sound-under">
        {name && <span className="tiptap-attachment-name mf-sound-name">{name}</span>}
        {name && status && <span className="mf-sound-dot" aria-hidden>·</span>}
        {status && <span data-sound-control className="mf-sound-status">{status}</span>}
        {/* At the line's end, under the time. */}
        {speedButton}
      </div>}
      {video && (
        <>
          <span role="button" tabIndex={0} data-sound-control data-video-pip className="mf-sound-tool mf-video-window" aria-label="Picture in picture" title="Picture in picture" onClick={() => popOut('pip')} onKeyDown={press(() => popOut('pip'))}>
            <PictureInPicture2 />
          </span>
          <span role="button" tabIndex={0} data-sound-control data-video-full className="mf-sound-tool mf-video-window" aria-label="Full screen" title="Full screen" onClick={() => popOut('full')} onKeyDown={press(() => popOut('full'))}>
            <Maximize />
          </span>
        </>
      )}
    </div>
  )
  if (!video) return bar
  return (
    <div ref={root} data-video-player data-state={state} data-scrubbing={scrubbing || undefined} data-poster={poster ? '' : undefined} data-wake={wakeName.current} tabIndex={-1}
      className={`mf-video${className ? ` ${className}` : ''}`} contentEditable={false}
      onPointerMove={(event) => realMove(event) && wake()} onKeyDown={wake}
      // A control of its bar reached by Tab keeps the bar up while it has the keys (the picture clicked does not).
      onFocus={(event) => (wake(), root.current?.toggleAttribute('data-keys', event.target !== root.current && event.target.matches(':focus-visible')))}
      onBlur={(event) => !root.current?.contains(event.relatedTarget as Node | null) && root.current?.removeAttribute('data-keys')}>
      <div className="mf-video-picture" style={pictureStyle}>
        <video ref={sound} className="tiptap-attachment-video" src={src} poster={poster || undefined} preload="metadata" playsInline
          // A click on the picture plays or pauses it and picks the player, so its keys are heard at once; the block
          // under it is picked too, as a picture's is (the editor sees the press first), for its width and place.
          onClick={() => (toggle(), root.current?.focus({ preventScroll: true }))} />
        {broken && (
          <div data-video-broken className="mf-video-broken">
            <span className="text-heading font-semibold">This video will not play here</span>
            <span className="text-control">Its kind of film is one the app cannot read.{onOpenOwn ? '' : ' Its own app on the Mac can.'}</span>
            {onOpenOwn && (
              <button type="button" data-sound-control className="mf-video-own" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => (event.stopPropagation(), onOpenOwn())}>Open in its app</button>
            )}
          </div>
        )}
        {!broken && (
          <div className="mf-video-foot">
            {/* The frost rises out of the foot by a clip and only the controls fade (the Shared Frost Rule), as a picture square's foot does in Files. */}
            <span aria-hidden className="mf-blur-edge mf-video-blur"><span /><span /><span /><span /></span>
            {bar}
          </div>
        )}
      </div>
    </div>
  )
}
