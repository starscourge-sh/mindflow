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

  return (
    <div className="flex h-screen items-center justify-center p-2">
      <div
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        // Solid, whatever the theme: a glass theme's see-through colours let the
        // window behind show through the pill, lines and text and all.
        style={{ backgroundImage: 'linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))', backgroundColor: 'Canvas' }}
        className={`flex h-10 w-full items-center gap-1.5 rounded-full border p-1 pr-1 font-[system-ui,-apple-system,sans-serif] text-[13px] text-foreground shadow-(--mf-panel-shadow) ${over ? 'border-[color-mix(in_oklab,var(--tt-brand-color-400)_45%,transparent)]' : ''}`}
      >
        <span
          className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-xs tabular-nums ${over ? 'bg-[color-mix(in_oklab,var(--tt-brand-color-400)_18%,transparent)] text-[var(--tt-brand-color-400)]' : 'bg-accent text-muted-foreground'} ${paused ? 'animate-pulse' : ''}`}
        >
          {over ? "Time's up" : clock(left ?? done)}
        </span>
        {/* The goal at rest; what you can do with it under the pointer. */}
        {!hover ? (
        <button
          type="button"
          onClick={() => !timer && window.api.openInHome('task', focus.taskId)}
          className="min-w-0 flex-1 truncate pl-0.5 text-left font-medium"
        >
          {focus.goal}
        </button>
        ) : (
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => void (paused ? vigil.resumeSession(focus.id) : vigil.pauseSession(focus.id)).then(() => chime(paused ? 'on' : 'off'))}
            className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-2.5 text-xs font-medium hover:bg-accent/70"
          >
            {paused ? <>Resume <Play className="size-3.5" /></> : <>Pause <Pause className="size-3.5" /></>}
          </button>
          {(!timer || over) && (
          <button
            type="button"
            // Past its time it has already glowed: ending it is only the tick.
            onClick={() => void (timer ? vigil.cancelSession(focus.id) : vigil.endSession(focus.id, '', false)).then(() => (over ? chime('done') : glowEnd('done')))}
            className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-2.5 text-xs font-medium hover:bg-accent/70"
          >
            {timer ? 'Done' : 'End'} <Square className="size-3 fill-current" />
          </button>
          )}
          <button
            type="button"
            aria-label={timer ? 'Cancel the timer' : 'Cancel the session'}
            title="Cancel: no record kept"
            onClick={() => void vigil.cancelSession(focus.id).then(() => (over ? chime('away') : glowEnd('cancel')))}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </span>
        )}
        {/* The one place that moves the window, as Raycast's grip does. */}
        <span aria-hidden className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground" style={DRAG}>
          <GripVertical className="size-3.5" />
        </span>
      </div>
    </div>
  )
}
