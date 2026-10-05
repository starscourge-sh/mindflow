import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, GripVertical, Pause, Play, X } from 'lucide-react'

import { chime } from '@/lib/sound'
import { useLive, vigil, type Focus } from '@/lib/vigil'

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
 * The focus timer, floating over everything in a window of its own, the way
 * Raycast Focus shows one: the time left and the goal, and on hover the three
 * things you would do with it. The whole pill drags; the buttons do not.
 */
export function FocusPill(): React.JSX.Element | null {
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
  // Time is up: two bells, once, and the pill keeps saying so until you act.
  if (over && rang.current !== focus.id) {
    rang.current = focus.id
    chime('hint')
  }
  const paused = !!focus.pausedAt

  return (
    <div className="flex h-screen items-center justify-center p-2">
      <div
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        className={`flex h-11 w-full items-center gap-2 rounded-full border bg-popover p-1.5 pr-1 text-control shadow-(--mf-panel-shadow) ${over ? 'border-[var(--tt-brand-color-400)]' : ''}`}
      >
        <span
          className={`rounded-full px-2.5 py-1 font-mono text-xs tabular-nums ${over ? 'bg-[var(--tt-brand-color-400)] text-white' : 'bg-accent text-muted-foreground'} ${paused ? 'animate-pulse' : ''}`}
        >
          {over ? "Time's up" : clock(left ?? done)}
        </span>
        {/* The goal at rest; what you can do with it under the pointer. */}
        {!hover ? (
        <button
          type="button"
          onClick={() => window.api.openInHome('task', focus.taskId)}
          className="min-w-0 flex-1 truncate text-left font-medium"
        >
          {focus.goal}
        </button>
        ) : (
        <span className="flex flex-1 items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => void (paused ? vigil.resumeSession(focus.id) : vigil.pauseSession(focus.id)).then(() => chime(paused ? 'on' : 'off'))}
            className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 hover:bg-accent/70"
          >
            {paused ? <>Resume <Play className="size-3.5" /></> : <>Pause <Pause className="size-3.5" /></>}
          </button>
          <button
            type="button"
            onClick={() => void vigil.endSession(focus.id, '', false).then(() => chime('done'))}
            className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 hover:bg-accent/70"
          >
            Complete <Check className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Cancel the session"
            title="Cancel: no record kept"
            onClick={() => void vigil.cancelSession(focus.id).then(() => chime('away'))}
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
