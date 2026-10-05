import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { GripVertical, Pause, Play, Square, X } from 'lucide-react'

// The theme's colours: this window has no editor, which is what usually brings them.
import '@/assets/styles/_variables.scss'
import { chime } from '@/lib/sound'
import { useAppearance, useLive, vigil, type Focus } from '@/lib/vigil'

/** 59:55, or 1:02:03 past the hour. */
const clock = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
  const two = (n: number): string => String(n).padStart(2, '0')
  return h ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`
}

/** Time worked so far: pauses do not count. */
export const worked = (focus: Focus, now = Date.now()): number =>
  now - new Date(focus.startedAt).getTime() - focus.pausedMs - (focus.pausedAt ? now - new Date(focus.pausedAt).getTime() : 0)

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties

/**
 * A session or timer over: light around the screen's edge and a sound, one
 * pair for finished and another for called off.
 */
export const glowEnd = (tone: 'done' | 'cancel'): void => {
  chime(tone === 'done' ? 'finish' : 'called')
  window.api.glow(tone)
}

/** The glow's own window: the whole screen, see-through, lit at its edge for a moment. */
export function ScreenGlow(): React.JSX.Element | null {
  // Motion obeys Settings here too: no fade when it is off.
  useAppearance()
  const [glow, setGlow] = useState<{ tone: string; key: number } | null>(null)
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    return window.api.onGlow((tone) => setGlow({ tone, key: Date.now() }))
  }, [])
  if (!glow) return null
  return <div key={glow.key} aria-hidden className={`mf-glow mf-glow-${glow.tone}`} />
}

/**
 * The focus timer, floating over everything in a window of its own, the way
 * Raycast Focus shows one: the time left and the goal, and on hover the three
 * things you would do with it. The whole pill drags; the buttons do not.
 */
export function FocusPill(): React.JSX.Element | null {
  // Your Sounds, pack, volume and Motion here too: a window of its own still obeys them.
  useAppearance()
  const focus = useLive(vigil.focusNow, undefined as Focus | null | undefined)
  const [now, setNow] = useState(Date.now())
  const rang = useRef<string | null>(null)
  // Hover told by the pointer itself: a window's drag area never reports it.
  const [hover, setHover] = useState(false)

  // A see-through window: only the pill is drawn.
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  // Nothing running: the pill goes away.
  useEffect(() => void (focus === null && window.api.showFocus(false)), [focus])

  if (!focus) return null
  const done = worked(focus, now)
  const left = focus.plannedMs ? focus.plannedMs - done : null
  const over = left !== null && left <= 0
  // Time is up: the screen's edge glows with a bell, once, and the pill keeps saying so until you act.
  if (over && rang.current !== focus.id) {
    rang.current = focus.id
    glowEnd('done')
  }
  const paused = !!focus.pausedAt
  // A timer set from the box has no task behind it, and leaves no record.
  const timer = !focus.taskId

  // How far through: the ring is the session itself, filled as it goes.
  const share = focus.plannedMs ? Math.min(1, done / focus.plannedMs) : null
  const last = left !== null && left > 0 && left <= 60000
  const icon = 'flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--tt-brand-color-400)]'

  return (
    <div className="flex h-screen items-center justify-center p-2">
      <div
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        // Solid, whatever the theme: a glass theme's see-through colours let the
        // window behind show through the pill, lines and text and all.
        style={{ backgroundImage: 'linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))', backgroundColor: 'Canvas' }}
        className={`flex h-11 w-full items-center gap-2.5 rounded-full border pr-1.5 pl-2 font-[system-ui,-apple-system,sans-serif] text-[13px] text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.14),0_3px_8px_-2px_rgb(0_0_0/0.12)] transition-colors duration-300 ${over ? 'border-[color-mix(in_oklab,var(--tt-brand-color-400)_40%,var(--border))]' : ''}`}
      >
        <Ring share={over ? 1 : share} over={over} paused={paused} />
        {/* The goal stays put; only the right-hand end changes under the pointer. */}
        <button
          type="button"
          onClick={() => !timer && window.api.openInHome('task', focus.taskId)}
          className={`min-w-0 flex-1 truncate text-left font-medium tracking-[-0.005em] ${timer ? 'cursor-default' : ''}`}
        >
          {focus.goal || (timer ? 'Timer' : 'Focus')}
        </button>
        <span className="relative grid h-7 w-[6.25rem] shrink-0 place-items-center">
          {/* At rest: the time, in figures that do not jiggle as they count. */}
          <span
            aria-live="off"
            className={`col-start-1 row-start-1 justify-self-end pr-1.5 text-[13px] font-semibold tabular-nums transition-opacity duration-150 ${hover ? 'opacity-0' : 'opacity-100'} ${over || last ? 'text-[var(--tt-brand-color-400)]' : paused ? 'text-muted-foreground' : ''}`}
          >
            {over ? "Time's up" : paused ? `Paused · ${clock(left ?? done)}` : clock(left ?? done)}
          </span>
          {/* Under the pointer: what you would do with it, in the same place. */}
          <span className={`col-start-1 row-start-1 flex items-center justify-self-end gap-0.5 transition-opacity duration-150 ${hover ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            {!over && (
              <button
                type="button"
                aria-label={paused ? 'Resume' : 'Pause'}
                title={paused ? 'Resume' : 'Pause'}
                onClick={() => void (paused ? vigil.resumeSession(focus.id) : vigil.pauseSession(focus.id)).then(() => chime(paused ? 'on' : 'off'))}
                className={icon}
              >
                {paused ? <Play className="size-3.5 fill-current" /> : <Pause className="size-3.5 fill-current" />}
              </button>
            )}
            {(!timer || over) && (
              <button
                type="button"
                aria-label={timer ? 'Done' : 'End the session'}
                title={timer ? 'Done' : 'End the session, and keep it'}
                // Past its time it has already glowed: ending it is only the tick.
                onClick={() => void (timer ? vigil.cancelSession(focus.id) : vigil.endSession(focus.id, '', false)).then(() => (over ? chime('done') : glowEnd('done')))}
                className={over ? 'flex h-7 items-center rounded-full bg-[var(--tt-brand-color-400)] px-3 text-xs font-semibold text-white transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tt-brand-color-400)]' : icon}
              >
                {over ? 'Done' : <Square className="size-3 fill-current" />}
              </button>
            )}
            <button
              type="button"
              aria-label={timer ? 'Cancel the timer' : 'Cancel the session'}
              title="Cancel: no record kept"
              onClick={() => void vigil.cancelSession(focus.id).then(() => (over ? chime('away') : glowEnd('cancel')))}
              className={icon}
            >
              <X className="size-3.5" />
            </button>
          </span>
        </span>
        {/* The one place that moves the window, as Raycast's grip does: faint until you reach for it. */}
        <span aria-hidden className={`-ml-1 flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground transition-opacity duration-150 ${hover ? 'opacity-70' : 'opacity-25'}`} style={DRAG}>
          <GripVertical className="size-3.5" />
        </span>
      </div>
    </div>
  )
}

/**
 * The session as a ring: the track is the whole length, the arc how much of
 * it has gone. Open-ended sessions have no length, so they show a steady dot.
 */
function Ring({ share, over, paused }: { share: number | null; over: boolean; paused: boolean }): React.JSX.Element {
  const r = 8
  const around = 2 * Math.PI * r
  const tone = over ? 'var(--tt-brand-color-400)' : 'var(--foreground)'
  return (
    <svg viewBox="0 0 22 22" className="size-[22px] shrink-0 -rotate-90" aria-hidden>
      <circle cx="11" cy="11" r={r} fill="none" stroke="var(--border)" strokeWidth="2.5" />
      {share === null ? (
        <circle cx="11" cy="11" r="3" fill={tone} opacity={paused ? 0.35 : 0.8} />
      ) : (
        <circle
          cx="11" cy="11" r={r} fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={around} strokeDashoffset={around * (1 - share)}
          opacity={paused ? 0.4 : over ? 1 : 0.8}
          className="transition-[stroke-dashoffset] duration-500 ease-linear"
        />
      )}
    </svg>
  )
}
