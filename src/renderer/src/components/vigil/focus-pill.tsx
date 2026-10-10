import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Pause, Square, GripVertical as Grip } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import PlayerIcon from '@/components/ui/player-icon'
import XIcon from '@/components/ui/x-icon'

// The theme's colours: this window has no editor, which is what usually brings them.
import '@/assets/styles/_variables.scss'
import { alarm, chime, sessionClock } from '@/lib/sound'
import { useAppearance, useLive, vigil, type Focus, type Settings } from '@/lib/vigil'
import { useAlive, useSurface } from '@/lib/use-alive'
import { BorderBeam } from 'border-beam'
import { Liquid } from 'liquid-gooey'
import { Typed } from './ui'
import { DotMatrix } from './dot-matrix'
import { ProgressBar } from './progress-bar'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Check = alive(SimpleCheckedIcon)
const Play = alive(PlayerIcon)
const X = alive(XIcon)

/** 59:55, or 1:02:03 past the hour. */
export const clock = (ms: number): string => {
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
  const settings = useLive(vigil.settings, null as Settings | null)
  const bubble = settings?.focusBubble ?? 'circle'
  const [now, setNow] = useState(Date.now())
  const rang = useRef<string | null>(null)
  // Hover told by the pointer itself: a window's drag area never reports it.
  const [hover, setHover] = useState(false)
  // The beam and the goo run frame loops of their own: only with Motion on
  // and the pill on screen.
  const alive = useAlive()
  const surface = useSurface()
  // The right-hand end is as wide as what it shows: the time at rest, the
  // buttons under the pointer. Both are measured, and the end eases between
  // them, so the goal gets every pixel the time does not need. Each is drawn
  // at its own full width (w-max), so the slot never squeezes what it measures.
  const [timeBox, setTimeBox] = useState<HTMLSpanElement | null>(null)
  const [toolBox, setToolBox] = useState<HTMLSpanElement | null>(null)
  const [wide, setWide] = useState<{ time: number; tools: number } | null>(null)
  useEffect(() => {
    if (!timeBox || !toolBox) return
    const measure = (): void => setWide({ time: timeBox.offsetWidth, tools: toolBox.offsetWidth })
    const watch = new ResizeObserver(measure)
    watch.observe(timeBox)
    watch.observe(toolBox)
    return () => watch.disconnect()
  }, [timeBox, toolBox])

  // A see-through window: only the pill is drawn.
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  // The session's clock, heard: ticking if asked for, the last ten seconds
  // always, nothing paused, over or in safe mode. Silenced as the pill goes.
  const running = !!focus && !focus.pausedAt && !settings?.safeMode
  const timeLeft = focus?.plannedMs ? focus.plannedMs - worked(focus, now) : null
  useEffect(() => sessionClock({ running, left: timeLeft, tick: !!settings?.sessionTick, level: settings?.sessionTickVolume ?? 0.5 }), [running, timeLeft, settings?.sessionTick, settings?.sessionTickVolume])
  useEffect(() => () => sessionClock({ running: false, left: null, tick: false, level: 0 }), [])
  // The gleam: now and then a light glides across the pill, so a session left
  // running is not forgotten. Every 45 seconds, every 15 in the last minute
  // and past the time; never under the pointer, nor hidden, nor while nobody
  // is at the computer. Each one is a new key, which plays it once.
  const [gleam, setGleam] = useState(0)
  const gleamOn = !!focus && !focus.pausedAt && settings?.sessionGleam !== false && !hover
  const urgent = timeLeft !== null && timeLeft <= 60_000
  useEffect(() => {
    if (!gleamOn) return
    const every = setInterval(() => {
      if (document.hidden) return
      void window.api.idleSeconds().then((idle) => idle < 60 && !document.hidden && setGleam((n) => n + 1))
    }, urgent ? 15_000 : 45_000)
    return () => clearInterval(every)
  }, [gleamOn, urgent])
  // A session just ended: the pill stays a moment to ask how it went.
  const [asked, setAsked] = useState<string | null>(null)
  // Another session started meanwhile: that question has gone by.
  useEffect(() => void (focus && focus.id !== asked && setAsked(null)), [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  // Nothing running and nothing asked: the pill goes away.
  useEffect(() => void (focus === null && !asked && window.api.showFocus(false)), [focus, asked])

  if (asked) return <HowDidItGo id={asked} onDone={() => setAsked(null)} />
  if (!focus) return null
  const done = worked(focus, now)
  const left = focus.plannedMs ? focus.plannedMs - done : null
  const over = left !== null && left <= 0
  // Time is up: the screen's edge glows with a bell, once, and the pill keeps saying so until you act.
  if (over && rang.current !== focus.id) {
    rang.current = focus.id
    // The alarm clock's rings rather than the bell: the end of a countdown that ticked.
    alarm()
    window.api.glow('done')
  }
  const paused = !!focus.pausedAt
  // A timer set from the box has no task behind it, and leaves no record.
  const timer = !focus.taskId

  // How far through: the ring is the session itself, filled as it goes.
  const share = focus.plannedMs ? Math.min(1, done / focus.plannedMs) : null
  const last = left !== null && left > 0 && left <= 60000
  // The dinosaur beside the ring: along a line that fills with the session, or
  // running in place, hopping a cactus now and then. A session with no length
  // has no line to fill, so it only runs.
  const along = bubble === 'progress' && share !== null
  const icon = 'flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--tt-brand-color-400)]'

  return (
    // In pixels, not rem: the pill's window is a fixed 340 by 64, and at Large
    // Interface size a rem-sized pill outgrew it and was cut off top and bottom.
    <div className="mf-floating flex h-screen items-center justify-center p-[8px]">
      {/* While the session runs, a slow mono glow breathes inside the pill's
          edge: alive, never asking to be looked at. Still when paused or over,
          and between times: it runs for its first moments, under the pointer
          and in the last minute, since a beam all session kept a core busy. */}
      {/* The mono beam's inks are pale greys in every theme, lost on a light
          pill: there they are dimmed to graphite and drawn on the edge, with
          the inner glow kept low, which on a pale pill only smudged it. */}
      {/* The smoke: kept on at a whisper all session (Settings can turn it
          back to only the first moments, hover and the last minute), a step
          stronger once past the time, and full under the pointer, easing
          between them. It is the beam's own breathing. */}
      <div className="relative w-full">
      <div
        data-gleams={gleam}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        // Right-click: a quick switch for the ticking, the one Settings has too.
        onContextMenu={(event) => {
          event.preventDefault()
          const on = !!settings?.sessionTick
          void window.api.focusMenu(on).then((picked) => picked && vigil.setSettings({ sessionTick: !on }).then(() => chime(on ? 'off' : 'on')))
        }}
        // Solid, whatever the theme: a glass theme's see-through colours let the
        // window behind show through the pill, lines and text and all.
        // Time up: an accent wash over the solid, so the pill says so from across the room.
        style={{ backgroundImage: `${over ? 'linear-gradient(color-mix(in oklab, var(--tt-brand-color-400) 14%, transparent), color-mix(in oklab, var(--tt-brand-color-400) 14%, transparent)), ' : ''}linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))`, backgroundColor: 'Canvas' }}
        className={`relative flex h-[44px] w-full items-center gap-2.5 rounded-full border pr-1.5 pl-2 font-[system-ui,-apple-system,sans-serif] text-[13px] text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.14),0_3px_8px_-2px_rgb(0_0_0/0.12)] transition-colors duration-300 ${over ? 'mf-timeup border-[color-mix(in_oklab,var(--tt-brand-color-400)_55%,var(--border))]' : ''}`}
      >
        {gleam > 0 && <Gleam key={gleam} light={surface === 'light'} />}
        <Ring share={over ? 1 : share} over={over} paused={paused} />
        {/* The goal stays put; only the right-hand end changes under the pointer. */}
        <button
          type="button"
          onClick={() => !timer && window.api.openInHome('task', focus.taskId)}
          className={`min-w-0 flex-1 truncate text-left font-medium tracking-[-0.005em] ${timer ? 'cursor-default' : ''}`}
        >
          {focus.goal || (timer ? 'Timer' : 'Focus')}
        </button>
        {/* It runs all session, looked at or not, unlike the bars in the app,
            which run only while their window is (main.css). Paused, or time up
            in place, it stands; reaching the end of its line, it jumps for joy.
            Paused, it steps out: "Paused" needs the room, and the goal keeps its words. */}
        {bubble !== 'circle' && !paused && (
          <span className={`shrink-0 ${(over && !along) ? 'mf-bubble-still' : alive ? 'mf-bubble-run' : ''} ${over && along && alive ? 'mf-bubble-cheer' : ''}`}>
            <ProgressBar as="dino" value={along ? (over ? 1 : share!) : 0} label="The session so far" duration={0} className={along ? 'w-[64px]' : 'w-[44px]'} />
          </span>
        )}
        <span className="relative grid h-7 shrink-0 grid-cols-[minmax(0,1fr)] place-items-center transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]" style={wide ? { width: hover ? wide.tools : wide.time } : undefined}>
          {/* At rest: the time, in figures that do not jiggle as they count. */}
          <span
            ref={setTimeBox}
            aria-live="off"
            className={`col-start-1 row-start-1 flex w-max items-center gap-1.5 justify-self-end pr-1.5 text-[13px] whitespace-nowrap font-semibold transition-opacity duration-150 ${hover ? 'opacity-0' : 'opacity-100'} ${over || last ? 'text-[var(--tt-brand-color-400)]' : paused ? 'text-muted-foreground' : ''}`}
          >
            {/* The time on a clock's dot grid, the one figure in the app that ticks. */}
            {over ? "Time's up" : <>{paused && 'Paused ·'}<DotMatrix text={clock(left ?? done)} className="h-[13px]" /></>}
          </span>
          {/* Under the pointer: what you would do with it, in the same place.
              The one rare moment that gets the goo: the time melts into its
              controls, droplets splitting off from where the figures were. */}
          <span ref={setToolBox} className={`col-start-1 row-start-1 flex w-max justify-self-end transition-opacity duration-150 ${hover ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
          <Goo on={alive && !over} open={hover} light={surface === 'light'} className="flex items-center gap-0.5">
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
                title={over ? undefined : timer ? 'Done' : 'End the session, and keep it'}
                // Past its time it has already glowed: ending it is only the tick.
                // A session asks how it went before the pill goes; a timer just goes.
                onClick={() => void (timer ? vigil.cancelSession(focus.id) : vigil.endSession(focus.id, '', false)).then(() => (over ? chime('done') : glowEnd('done'), timer || setAsked(focus.id)))}
                className={over ? 'flex h-7 items-center rounded-full bg-[var(--tt-brand-color-400)] px-3 text-[12px] font-semibold text-white transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tt-brand-color-400)]' : icon}
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
          </Goo>
          </span>
        </span>
        {/* The one place that moves the window, as Raycast's grip does: faint until you reach for it. */}
        <span aria-hidden className={`-ml-1 flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground transition-opacity duration-150 ${hover ? 'opacity-70' : 'opacity-25'}`} style={DRAG}>
          <Grip className="size-3.5" />
        </span>
      </div>
      {/* Laid over the pill rather than around it: the beam sets a dozen
          inherited values thirty times a second, and wrapped around the pill
          every dot of the clock was restyled with them. Over it, they reach
          only this empty shape. */}
      <BorderBeam size="pulse-inner" colorVariant="mono" strength={hover ? 0.4 : over ? 0.26 : 0.14} css={SMOKE_EASE} brightness={surface === 'light' ? 0.5 : undefined} style={surface === 'light' ? ({ '--beam-stroke-opacity': 9, '--beam-inner-opacity': 0.75 } as CSSProperties) : undefined} duration={3.4} theme={surface} borderRadius={22} active={alive && !paused && (settings?.sessionSmoke !== false ? true : !over && (hover || done < 8000 || last))} className="pointer-events-none absolute inset-0">
        <div className="h-full w-full rounded-full" />
      </BorderBeam>
      </div>
    </div>
  )
}

/**
 * "How did it go?": the pill, just after a session ends, turned into one line
 * whose answer is the session's recap, kept in the task's log. Never in the
 * way: Escape or the cross skips it, and left alone it lets itself go.
 * Kept, it says so with a way back, then goes.
 */
function HowDidItGo({ id, onDone }: { id: string; onDone: () => void }): React.JSX.Element {
  const [words, setWords] = useState('')
  const [kept, setKept] = useState<string | null>(null)
  // Untouched for a minute, it is skipped; once kept, it says so for a few seconds.
  useEffect(() => {
    if (words && kept === null) return
    const gone = setTimeout(onDone, kept === null ? 60_000 : 4_000)
    return () => clearTimeout(gone)
  }, [words, kept]) // eslint-disable-line react-hooks/exhaustive-deps
  const skip = (): void => (chime('fold'), onDone())
  const keep = (): void => {
    if (!words.trim()) return skip()
    void vigil.recapSession(id, words.trim()).then((was) => (chime('logged'), setKept(was)))
  }
  const icon = 'flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--tt-brand-color-400)]'
  return (
    <div className="mf-floating flex h-screen items-center justify-center p-[8px]">
      <div
        style={{ backgroundImage: 'linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))', backgroundColor: 'Canvas' }}
        className="flex h-[44px] w-full items-center gap-2.5 rounded-full border pr-1.5 pl-2 font-[system-ui,-apple-system,sans-serif] text-[13px] text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.14),0_3px_8px_-2px_rgb(0_0_0/0.12)]"
      >
        <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--tt-brand-color-400)] text-white">
          <Check className="size-3" strokeWidth={3} />
        </span>
        {kept === null ? (
          <>
            <label className="relative min-w-0 flex-1">
              {/* The question types itself in, standing in for the placeholder. */}
              {!words && <span aria-hidden className="pointer-events-none absolute inset-0 truncate text-muted-foreground"><Typed text="How did it go?" step={45} delay={250} /></span>}
              <input
                autoFocus
                value={words}
                aria-label="How did it go?"
                onChange={(event) => setWords(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') (event.preventDefault(), keep())
                  if (event.key === 'Escape') (event.preventDefault(), skip())
                }}
                className="w-full bg-transparent font-medium outline-none"
              />
            </label>
            <button type="button" aria-label="Skip" title="Skip: no recap" onClick={skip} className={icon}>
              <X className="size-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate font-medium"><Typed text="Saved in the task’s log" step={35} delay={0} /></span>
            <button
              type="button"
              onClick={() => void vigil.recapSession(id, kept).then(() => (chime('undo'), onDone()))}
              className="flex h-7 shrink-0 items-center rounded-full px-3 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--tt-brand-color-400)]"
            >
              Undo
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** The smoke's strength eases rather than jumps when the pointer comes and goes. */
const SMOKE_EASE = `@property --beam-strength { syntax: '<number>'; inherits: true; initial-value: 1; }
[data-beam="{id}"] { transition: --beam-strength 320ms cubic-bezier(0.16, 1, 0.3, 1); }`

/**
 * One gleam across the pill: a soft diagonal light gliding from left to right
 * in 700ms, its edges masked away so it reads as a reflection, not a bar.
 * With Motion off or reduced motion, one soft glow that comes and goes instead.
 */
function Gleam({ light }: { light: boolean }): React.JSX.Element {
  const shine = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const element = shine.current
    if (!element) return
    const still = document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
    const run = still
      ? element.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: 'ease-in-out' })
      : element.animate([{ transform: 'translateX(-110%) skewX(-20deg)' }, { transform: 'translateX(330%) skewX(-20deg)' }], { duration: 700, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })
    return () => run.cancel()
  }, [])
  const still = typeof document !== 'undefined' && (document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches)
  // A pale pill takes a brighter light to show at all.
  const ink = light ? 'rgb(255 255 255 / 0.95)' : 'rgb(255 255 255 / 0.2)'
  return (
    <span aria-hidden data-gleam className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
      <span
        ref={shine}
        className="absolute inset-y-0 left-0"
        style={still
          ? { right: 0, opacity: 0, background: `color-mix(in oklab, var(--tt-brand-color-400) ${light ? 10 : 14}%, transparent)` }
          : { width: '22%', transform: 'translateX(-110%) skewX(-20deg)', background: `linear-gradient(90deg, transparent, ${ink} 50%, transparent)`, maskImage: 'linear-gradient(transparent, black 20%, black 80%, transparent)' }}
      />
    </span>
  )
}

/**
 * The pill's controls, each a droplet: gathered at the right-hand end at
 * rest, they split apart under the pointer and merge back as it leaves. Off,
 * a plain row.
 */
function Goo({ on, open, light, className, children }: { on: boolean; open: boolean; light: boolean; className: string; children: React.ReactNode }): React.JSX.Element {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean)
  if (!on) return <span className={className}>{items}</span>
  // Each 28px button and an 8px gap, so once split they stand apart as
  // droplets rather than staying bridged into one bar.
  const SLOT = 36
  return (
    // On a light pill the accent is close to the pill itself: a touch of ink
    // gives the droplets an edge to read by.
    <Liquid fill={light ? 'color-mix(in oklab, var(--accent), var(--foreground) 7%)' : 'color-mix(in oklab, var(--accent) 80%, transparent)'} blur={4} className={`${className} gap-2!`}>
      {items.map((item, index) => (
        <Liquid.Item key={index} x={open ? 0 : (items.length - 1 - index) * SLOT} scale={open ? 1 : 0.6} transition="snappy" delay={open ? (items.length - 1 - index) * 25 : 0}>
          {item}
        </Liquid.Item>
      ))}
    </Liquid>
  )
}

/**
 * The session as a ring: the track is the whole length, the arc how much of
 * it has gone. Open-ended sessions have no length, so they show a steady dot.
 */
function Ring({ share, over, paused }: { share: number | null; over: boolean; paused: boolean }): React.JSX.Element {
  const r = 8
  const around = 2 * Math.PI * r
  // The pill's one colour: the accent while the time runs, grey while it waits.
  const tone = paused && !over ? 'var(--foreground)' : 'var(--tt-brand-color-400)'
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
          // No easing between ticks: a step is a fraction of a pixel, and a
          // transition restarted twice a second redrew the pill every frame.
        />
      )}
    </svg>
  )
}
