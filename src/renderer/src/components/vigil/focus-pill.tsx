import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Coffee, Pause, Paperclip, Square, GripVertical as Grip, X as XSmall } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import PlayerIcon from '@/components/ui/player-icon'
import XIcon from '@/components/ui/x-icon'
import CameraIcon from '@/components/ui/camera-icon'

// The theme's colours: this window has no editor, which is what usually brings them.
import '@/assets/styles/_variables.scss'
import { alarm, chime, sessionClock } from '@/lib/sound'
import { useAppearance, useLive, vigil, type Focus, type LogEntry, type Settings } from '@/lib/vigil'
import { useAlive, useSurface } from '@/lib/use-alive'
import { BorderBeam } from 'border-beam'
import { Kbd, Typed } from './ui'
import { DotMatrix } from './dot-matrix'
import { ProgressBar } from './progress-bar'
import { clockTime } from './session-timeline'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Check = alive(SimpleCheckedIcon)
const Play = alive(PlayerIcon)
const X = alive(XIcon)
const Camera = alive(CameraIcon)

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
 * The focus timer, floating over everything in a window of its own, hung
 * from the top of the screen the way the island hangs from the notch. A new
 * session drops in as a small black capsule and springs open to its task and
 * time, then settles into the pill. Under the pointer (or a file carried over
 * it) it opens again: the time large, Pause, Stop and Break early, the
 * session's log so far and a line to add to it. The grip drags it anywhere.
 */
export function FocusPill(): React.JSX.Element | null {
  // Your Sounds, pack, volume and Motion here too: a window of its own still obeys them.
  useAppearance()
  const focus = useLive(vigil.focusNow, undefined as Focus | null | undefined)
  const settings = useLive(vigil.settings, null as Settings | null)
  const [now, setNow] = useState(Date.now())

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
  // A session just ended: the pill stays a moment to ask how it went.
  const [asked, setAsked] = useState<string | null>(null)
  // Another session started meanwhile: that question has gone by.
  useEffect(() => void (focus && focus.id !== asked && setAsked(null)), [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  // Nothing running and nothing asked: the pill goes away.
  useEffect(() => void (focus === null && !asked && window.api.showFocus(false)), [focus, asked])

  if (asked) return <HowDidItGo id={asked} onDone={() => setAsked(null)} />
  if (!focus) return null
  // Each session its own pill, so each one drops in.
  return <Pill key={focus.id} focus={focus} settings={settings} now={now} onEnded={setAsked} />
}

/** The pill's width at rest and open, and the capsule it starts as. */
const WIDE = 324
const REST = 44
const CAPSULE = { width: 132, height: 30 }
/** Above the pill, inside its window: where it hangs from. */
const TOP = 8
/** Below it: room for its shadow (64 in all at rest, the window main.ts makes). */
const BELOW = 12
/**
 * The island's spring: about 4% past where it is going, settled in about
 * 450ms (a damping ratio of 0.72 at 12.3 rad/s).
 */
const SPRING = { type: 'spring', stiffness: 152, damping: 17.8, mass: 1 } as const
/** The drop from under the menu bar: quicker, with the same little give. */
const DROP = { type: 'spring', stiffness: 420, damping: 30, mass: 1 } as const
/** How long the new session's card stays open before it settles into the pill. */
const SHOWN = 1900

const calm = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

/** A file kept for the next thought: a picture shown small, anything else by its name. */
type Attachment = { url: string; name: string; picture: boolean }
const PICTURE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/svg+xml', 'image/heic'])

function Pill({ focus, settings, now, onEnded }: { focus: Focus; settings: Settings | null; now: number; onEnded: (id: string) => void }): React.JSX.Element {
  const bubble = settings?.focusBubble ?? 'circle'
  const rang = useRef<string | null>(null)
  // Hover told by the pointer itself: a window's drag area never reports it.
  const [hover, setHover] = useState(false)
  // The beam and the goo run frame loops of their own: only with Motion on
  // and the pill on screen.
  const alive = useAlive()
  const surface = useSurface()
  const light = surface === 'light'
  const still = useRef(calm()).current

  // --- the island: dropped in, opened, settled, and opened again on hover
  // 'above' is out of sight under the menu bar; 'capsule' has dropped in;
  // 'shown' is the new session's card; 'rest' is the pill.
  const [stage, setStage] = useState<'above' | 'capsule' | 'shown' | 'rest'>(still ? 'rest' : 'above')
  // Under the pointer for a moment (not only passing over), or a file carried onto it.
  const [opened, setOpened] = useState(false)
  const [carried, setCarried] = useState(false)
  // Escape closes it, even with the pointer still on it, until the pointer leaves.
  const [shut, setShut] = useState(false)
  const [typing, setTyping] = useState(false)
  const [words, setWords] = useState('')
  const [attached, setAttached] = useState<Attachment | null>(null)
  const [denied, setDenied] = useState(false)
  const engaged = typing || !!words.trim() || !!attached || denied || carried
  const open = stage === 'shown' || (stage === 'rest' && !shut && (opened || engaged))
  const field = useRef<HTMLInputElement>(null)
  const intent = useRef<ReturnType<typeof setTimeout>>(undefined)

  // How tall it is open: measured, since the log and an attachment change it.
  const [inner, setInner] = useState<HTMLDivElement | null>(null)
  const [full, setFull] = useState(0)
  useEffect(() => {
    if (!inner) return
    // Its borders too: the shell is that much taller than what is inside it.
    const measure = (): void => setFull(inner.offsetHeight + 2)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(inner)
    return () => watch.disconnect()
  }, [inner])

  // The window grows down before the pill opens, and goes back once it has
  // closed: it is only ever as tall as the pill needs, so nothing around it
  // stops taking clicks.
  const target = open || stage === 'capsule' || stage === 'above' ? Math.max(REST, full) : REST
  // Open, room for the spring to overshoot as well as for the shadow.
  const want = Math.ceil(target + TOP + BELOW + (target > REST ? 16 : 0))
  // Asked for once as it mounts, whatever size an earlier session left it.
  const [room, setRoom] = useState(0)
  useEffect(() => {
    if (want > room) return void window.api.focusSize(want).then(() => setRoom(want))
    if (want === room) return
    if (!room) return void window.api.focusSize(want).then(() => setRoom(want))
    const later = setTimeout(() => void window.api.focusSize(want).then(() => setRoom(want)), still ? 0 : 650)
    return () => clearTimeout(later)
  }, [want, room, still])
  const height = Math.max(REST, Math.min(target, room - TOP - BELOW - (target > REST ? 16 : 0)))

  // A new session: up from under the menu bar as a capsule, then open, then
  // after a moment the pill. With Motion off or Reduce motion, a fade.
  useEffect(() => {
    if (still || !full) return
    if (stage === 'above') return void requestAnimationFrame(() => setStage('capsule'))
    if (stage === 'capsule') {
      // Opened only once the window has grown to hold it.
      if (room < want) return
      const next = setTimeout(() => setStage('shown'), 170)
      return () => clearTimeout(next)
    }
    if (stage === 'shown') {
      const next = setTimeout(() => setStage('rest'), SHOWN)
      return () => clearTimeout(next)
    }
    return undefined
  }, [stage, full, still, room, want])

  const enter = (): void => {
    setHover(true)
    clearTimeout(intent.current)
    intent.current = setTimeout(() => setOpened(true), 90)
  }
  const leave = (): void => {
    setHover(false)
    setShut(false)
    clearTimeout(intent.current)
    intent.current = setTimeout(() => setOpened(false), 220)
  }
  useEffect(() => () => clearTimeout(intent.current), [])
  const collapse = (): void => {
    field.current?.blur()
    setDenied(false)
    setShut(true)
    setOpened(false)
    chime('fold')
  }

  // The gleam: now and then a light glides across the pill, so a session left
  // running is not forgotten. Every 45 seconds, every 15 in the last minute
  // and past the time; never under the pointer, nor hidden, nor while nobody
  // is at the computer. Each one is a new key, which plays it once.
  const [gleam, setGleam] = useState(0)
  const done = worked(focus, now)
  const left = focus.plannedMs ? focus.plannedMs - done : null
  const gleamOn = !focus.pausedAt && settings?.sessionGleam !== false && !hover && !open
  const urgent = left !== null && left <= 60_000
  useEffect(() => {
    if (!gleamOn) return
    const every = setInterval(() => {
      if (document.hidden) return
      void window.api.idleSeconds().then((idle) => idle < 60 && !document.hidden && setGleam((n) => n + 1))
    }, urgent ? 15_000 : 45_000)
    return () => clearInterval(every)
  }, [gleamOn, urgent])

  // This session's log, as it grows.
  const timer = !focus.taskId
  const entries = useLive(() => (timer ? Promise.resolve([] as LogEntry[]) : vigil.sessionLog(focus.id)), [] as LogEntry[], [focus.id])

  const over = left !== null && left <= 0
  // Time is up: the screen's edge glows with a bell, once, and the pill keeps saying so until you act.
  if (over && rang.current !== focus.id) {
    rang.current = focus.id
    // The alarm clock's rings rather than the bell: the end of a countdown that ticked.
    alarm()
    window.api.glow('done')
  }
  const paused = !!focus.pausedAt
  // How far through: the ring is the session itself, filled as it goes.
  const share = focus.plannedMs ? Math.min(1, done / focus.plannedMs) : null
  const last = left !== null && left > 0 && left <= 60000
  // The dinosaur beside the ring: along a line that fills with the session, or
  // running in place, hopping a cactus now and then. A session with no length
  // has no line to fill, so it only runs.
  const along = bubble === 'progress' && share !== null

  // --- the log: a thought, maybe with a picture or a file, stamped now
  const keepFile = async (file: File): Promise<void> => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const picture = PICTURE_TYPES.has(file.type)
    const url = picture ? await window.api.saveImage(file.type, bytes) : await window.api.saveFile(file.name || 'file', bytes)
    if (!url) return chime('nope')
    setAttached({ url, name: file.name || (picture ? 'Picture' : 'File'), picture })
    setDenied(false)
    chime('pin')
    field.current?.focus()
  }
  const shoot = async (): Promise<void> => {
    chime('tap')
    const shot = await window.api.focusShot()
    if (shot && 'url' in shot) {
      setAttached({ url: shot.url, name: `Screenshot ${clockTime(new Date().toISOString())}`, picture: true })
      setDenied(false)
      chime('pin')
    } else setDenied(true)
    field.current?.focus()
  }
  const add = async (): Promise<void> => {
    const text = words.trim()
    if (!text && !attached) return
    const entry = await vigil.logToSession(focus.id, text, attached?.url ?? null, attached?.name ?? null)
    if (!entry) return chime('nope')
    setWords('')
    setAttached(null)
    setDenied(false)
    chime('logged')
  }
  const newest = [...entries].reverse().slice(0, 3)
  const more = entries.length - newest.length

  const button = 'flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--tt-brand-color-400)] [&_svg]:size-3'
  const end = (): void => void vigil.endSession(focus.id, '', false).then(() => (over ? chime('done') : glowEnd('done'), onEnded(focus.id)))
  const shown = stage === 'capsule' || stage === 'above'
  const spring = still ? { duration: 0 } : SPRING

  // Open: what the island shows. Kept drawn at rest (clipped away and
  // unreachable), so its height is known before it opens; and kept as it was
  // between the clock's ticks while closed, so a tick redraws only the pill.
  const timeText = open ? clock(left ?? done) : ''
  // Break early is offered from halfway: kept apart so the panel redraws once, as it turns.
  const halfway = focus.plannedMs ? done >= focus.plannedMs / 2 : done >= 15 * 60_000
  const panel = useMemo(() => (
    <div
      inert={!open}
      data-island-panel
      onMouseDown={(event) => event.target === event.currentTarget && !timer && (event.preventDefault(), field.current?.focus())}
      className={`px-3 pb-3 transition-opacity duration-150 ${open ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="flex items-end justify-between gap-2 pt-0.5 pb-2">
        <span className={`flex items-baseline gap-2 ${over || last ? 'text-[var(--tt-brand-color-400)]' : paused ? 'text-muted-foreground' : ''}`}>
          {over ? <span className="text-[20px] leading-[24px] font-semibold">Time's up</span> : <DotMatrix text={timeText || '00:00'} className="h-[24px]" />}
          <span className="text-[12px] text-muted-foreground">{paused ? 'Paused' : over ? '' : focus.plannedMs ? `of ${Math.round(focus.plannedMs / 60000)} min` : 'so far'}</span>
        </span>
      </div>
      <div className="-ml-1.5 flex items-center gap-0.5">
        {!over && (
          <button type="button" onClick={() => void (paused ? vigil.resumeSession(focus.id) : vigil.pauseSession(focus.id)).then(() => chime(paused ? 'on' : 'off'))} className={button}>
            {paused ? <Play className="fill-current" /> : <Pause className="fill-current" />} {paused ? 'Resume' : 'Pause'}
          </button>
        )}
        <button
            type="button"
            title={timer && !over ? 'Stop the timer' : timer ? undefined : 'End the session, and keep it (⌥-click: throw it away, no record kept)'}
            // Past its time it has already glowed: ending it is only the tick.
            // A session asks how it went before the pill goes; a timer just goes.
            // One way to stop: the × beside it went. A timer just goes; ⌥ on a
            // session throws it away, as the × did, with no record kept.
            onClick={(event) => (timer && !over ? void vigil.cancelSession(focus.id).then(() => glowEnd('cancel')) : timer ? void vigil.cancelSession(focus.id).then(() => chime('done')) : event.altKey ? void vigil.cancelSession(focus.id).then(() => (over ? chime('away') : glowEnd('cancel'))) : end())}
            className={over ? 'flex h-7 items-center rounded-full bg-[var(--tt-brand-color-400)] px-3 text-[12px] font-semibold text-white transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tt-brand-color-400)]' : button}
          >
            {over ? 'Done' : <><Square className="fill-current" /> Stop</>}
          </button>
        {/* Break early: this session kept, and five minutes away from it on the
            clock. Only past halfway (or a quarter hour in, with no planned
            length): before that it is a third button to read past. */}
        {!timer && (over || halfway) && (
          <button
            type="button"
            title="End the session, kept, and start a five-minute break"
            onClick={() => void vigil.endSession(focus.id, '', false).then(() => vigil.startTimer('Break', 5 * 60_000)).then(() => (chime('done'), window.api.glow('done')))}
            className={button}
          >
            <Coffee /> {over ? 'Break' : 'Break early'}
          </button>
        )}
      </div>

      {/* The session's log so far, newest first: the last three, then how many more. */}
      {newest.length > 0 && (
        <ol data-island-log className="mt-2 border-t border-border/60 pt-1.5">
          {newest.map((entry) => (
            <li key={entry.id} className="group/entry flex h-[22px] items-center gap-2 text-[12px]">
              <time dateTime={entry.at} className="w-9 shrink-0 text-muted-foreground tabular-nums">{clockTime(entry.at)}</time>
              <span className="min-w-0 flex-1 truncate">{entry.text || entry.assetName || 'Picture'}</span>
              {entry.asset && /\.(png|jpe?g|gif|webp|avif|bmp|heic|svg)$/i.test(entry.asset)
                ? <img src={entry.asset} alt="" draggable={false} className="size-4 shrink-0 rounded-[3px] border object-cover" />
                : entry.asset ? <Paperclip className="size-3 shrink-0 text-muted-foreground" /> : null}
              <button type="button" aria-label="Take this out of the log" onClick={() => void vigil.unlogFromSession(entry.id).then(() => chime('away'))}
                className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/entry:opacity-100 hover:text-foreground focus-visible:opacity-100">
                <XSmall className="size-3" />
              </button>
            </li>
          ))}
          {more > 0 && (
            <li>
              <button type="button" onClick={() => window.api.openInHome('task', focus.taskId)} className="h-[18px] text-[11px] text-muted-foreground hover:text-foreground">
                {more} more
              </button>
            </li>
          )}
        </ol>
      )}

      {/* Add a thought: Enter keeps it in this session's log, with the
          picture or file pasted, dropped or shot for it. Esc closes. */}
      {!timer && (
        <div className="mt-2">
          <label className={`flex h-8 items-center gap-1.5 rounded-full border bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] pr-1 pl-3 transition-colors focus-within:border-foreground/25 ${carried ? 'border-[var(--tt-brand-color-400)]' : ''}`}>
            <span className="relative min-w-0 flex-1">
              {!words && <span aria-hidden className="pointer-events-none absolute inset-0 truncate text-[12.5px] leading-[20px] text-muted-foreground">{carried ? 'Drop it into the log' : attached ? 'Say what it is, or just press Enter' : 'Add a thought'}</span>}
              <input
                ref={field}
                value={words}
                aria-label="Add a thought to this session's log"
                onChange={(event) => setWords(event.target.value)}
                onFocus={() => (setTyping(true), setShut(false))}
                onBlur={() => setTyping(false)}
                onPaste={(event) => {
                  const file = [...event.clipboardData.files].find((one) => PICTURE_TYPES.has(one.type)) ?? event.clipboardData.files[0]
                  if (!file) return
                  event.preventDefault()
                  void keepFile(file)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) (event.preventDefault(), void add())
                  if (event.key === 'Escape') (event.preventDefault(), collapse())
                }}
                className="block h-5 w-full bg-transparent text-[12.5px] outline-none"
              />
            </span>
            <button type="button" aria-label="Add a screenshot" title="Add a screenshot of this screen" onClick={() => void shoot()} className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-3.5">
              <Camera />
            </button>
            <Kbd className={`shrink-0 transition-opacity ${words.trim() || attached ? 'opacity-100' : 'opacity-40'}`}>↵</Kbd>
          </label>
          {attached && (
            <span data-island-attached className="mt-1.5 flex h-7 items-center gap-2 pl-1 text-[12px] text-muted-foreground">
              {attached.picture ? <img src={attached.url} alt="" className="h-7 w-10 shrink-0 rounded-[5px] border object-cover" /> : <Paperclip className="size-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{attached.name}</span>
              <button type="button" aria-label="Leave it out" onClick={() => (setAttached(null), chime('away'), field.current?.focus())} className="flex size-5 items-center justify-center rounded-full hover:bg-accent hover:text-foreground">
                <XSmall className="size-3" />
              </button>
            </span>
          )}
          {denied && (
            <span role="status" className="mt-1.5 flex items-center gap-2 pl-1 text-[11.5px] leading-4 text-muted-foreground">
              <span className="min-w-0 flex-1">Vigil can't see the screen yet. Paste or drop a picture instead.</span>
              <button type="button" onClick={() => window.api.screenSettings()} className="shrink-0 rounded-full px-2 py-0.5 font-medium text-foreground hover:bg-accent">Allow</button>
            </span>
          )}
        </div>
      )}
    </div>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [open, timeText, over, last, paused, timer, focus.id, focus.plannedMs, focus.taskId, entries, words, attached, carried, denied, halfway])

  return (
    // In pixels, not rem: the pill's window is a fixed 340 wide, and at Large
    // Interface size a rem-sized pill outgrew it and was cut off.
    <div className="mf-floating flex h-screen items-start justify-center overflow-hidden" style={{ paddingTop: TOP }}>
      {/* While the session runs, a slow mono glow breathes inside the pill's
          edge: alive, never asking to be looked at. Still when paused or over,
          and between times: it runs for its first moments, under the pointer
          and in the last minute, since a beam all session kept a core busy. */}
      <motion.div
        className="relative"
        initial={still ? { opacity: 0, width: WIDE, height: REST } : { y: -(CAPSULE.height + TOP + 4), width: CAPSULE.width, height: CAPSULE.height }}
        animate={{
          opacity: 1,
          y: 0,
          width: shown ? CAPSULE.width : WIDE,
          height: shown ? CAPSULE.height : height
        }}
        transition={still ? { opacity: { duration: 0.2 }, default: { duration: 0 } } : { y: DROP, width: SPRING, height: spring, opacity: { duration: 0.12 } }}
      >
      <div
        data-gleams={gleam}
        data-island={stage === 'rest' ? (open ? 'open' : 'rest') : stage}
        onPointerEnter={enter}
        onPointerLeave={leave}
        // A file carried over it opens it, ready to be dropped into the log.
        onDragEnter={(event) => !timer && event.dataTransfer.types.includes('Files') && (event.preventDefault(), setCarried(true))}
        onDragOver={(event) => !timer && event.dataTransfer.types.includes('Files') && event.preventDefault()}
        onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setCarried(false)}
        onDrop={(event) => {
          setCarried(false)
          const file = event.dataTransfer.files[0]
          if (!file || timer) return
          event.preventDefault()
          void keepFile(file)
        }}
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
        className={`absolute inset-0 overflow-hidden rounded-[22px] border font-[system-ui,-apple-system,sans-serif] text-[13px] text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.14),0_3px_8px_-2px_rgb(0_0_0/0.12)] transition-colors duration-300 ${over ? 'mf-timeup border-[color-mix(in_oklab,var(--tt-brand-color-400)_55%,var(--border))]' : ''}`}
      >
        {/* The capsule it drops in as: black, the island's own colour, fading to the theme's as it opens. */}
        {!still && <motion.span aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-black" initial={{ opacity: 1 }} animate={{ opacity: shown ? 1 : 0 }} transition={{ duration: 0.32, delay: shown ? 0 : 0.08 }} />}
        {/* At rest, the smoke is a few soft wisps drifting on the compositor:
            the beam's own loop restyles thirty times a second, too much to
            run all session, so it takes over only under the pointer, in the
            first and last moments, and past the time. */}
        {alive && !paused && settings?.sessionSmoke !== false && <Wisps light={light} />}
        {gleam > 0 && <Gleam key={gleam} light={light} />}
        <motion.div
          ref={setInner}
          className="absolute top-0 left-1/2 w-[322px] -translate-x-1/2"
          animate={{ opacity: shown ? 0 : 1 }}
          transition={{ duration: still ? 0 : 0.18, delay: shown || still ? 0 : 0.1 }}
        >
          <div className="flex h-[42px] items-center gap-2.5 pr-1.5 pl-2">
            <Ring share={over ? 1 : share} over={over} paused={paused} />
            {/* The goal: a click opens its task. */}
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
            {/* At rest: the time, in figures that do not jiggle as they count.
                Open, it steps aside for the large one below. */}
            <span
              aria-live="off"
              aria-hidden={open}
              className={`flex shrink-0 items-center gap-1.5 pr-1 text-[13px] whitespace-nowrap font-semibold transition-opacity duration-150 ${open ? 'opacity-0' : 'opacity-100'} ${over || last ? 'text-[var(--tt-brand-color-400)]' : paused ? 'text-muted-foreground' : ''}`}
            >
              {/* The time on a clock's dot grid, the one figure in the app that ticks. */}
              {over ? "Time's up" : <>{paused && 'Paused ·'}<DotMatrix text={clock(left ?? done)} className="h-[13px]" /></>}
            </span>
            {/* The one place that moves the window, as Raycast's grip does: faint until you reach for it. */}
            <span aria-hidden className={`-ml-1 flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground transition-opacity duration-150 ${hover ? 'opacity-70' : 'opacity-25'}`} style={DRAG}>
              <Grip className="size-3.5" />
            </span>
          </div>

          {panel}
        </motion.div>
      </div>
      {/* Laid over the pill rather than around it: the beam sets a dozen
          inherited values thirty times a second, and wrapped around the pill
          every dot of the clock was restyled with them. Over it, they reach
          only this empty shape. */}
      {/* The mono beam's inks are pale greys in every theme, lost on a light
          pill: there they are dimmed to graphite and drawn on the edge, with
          the inner glow kept low, which on a pale pill only smudged it. */}
      {/* The smoke: kept on at a whisper all session (Settings can turn it
          back to only the first moments, hover and the last minute), a step
          stronger once past the time, and full under the pointer, easing
          between them. It is the beam's own breathing. */}
      <BorderBeam size="pulse-inner" colorVariant="mono" strength={over && !hover ? 0.3 : 0.4} css={SMOKE_EASE} brightness={light ? 0.5 : undefined} style={light ? ({ '--beam-stroke-opacity': 9, '--beam-inner-opacity': 0.75 } as CSSProperties) : undefined} duration={3.4} theme={surface} borderRadius={22} active={alive && !paused && stage === 'rest' && (hover || done < 8000 || last || (over && settings?.sessionSmoke !== false))} className="pointer-events-none absolute inset-0">
        <div className="h-full w-full rounded-[22px]" />
      </BorderBeam>
      </motion.div>
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
  // Back to the pill's own size, whatever the island had grown it to.
  useEffect(() => void window.api.focusSize(TOP + REST + BELOW), [])
  const icon = 'flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--tt-brand-color-400)]'
  return (
    <div className="mf-floating flex h-screen items-start justify-center px-[8px]" style={{ paddingTop: TOP }}>
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

/**
 * The idle smoke: three soft blots of light, already blurred by their own
 * gradients, drifting and breathing on transform and opacity alone, so the
 * compositor runs them with no work on the page. Faint, on purpose.
 */
const WISPS = `@keyframes mf-wisp-a { 0%, 100% { transform: translate(-10%, 10%) scale(1); opacity: .5 } 50% { transform: translate(35%, -12%) scale(1.25); opacity: 1 } }
@keyframes mf-wisp-b { 0%, 100% { transform: translate(20%, -8%) scale(1.15); opacity: .9 } 50% { transform: translate(-25%, 12%) scale(.9); opacity: .4 } }
@keyframes mf-wisp-c { 0%, 100% { transform: translate(0, 6%) scale(.9); opacity: .4 } 50% { transform: translate(-30%, -10%) scale(1.2); opacity: .9 } }`
function Wisps({ light }: { light: boolean }): React.JSX.Element {
  const ink = light ? 'rgb(60 60 60 / 0.07)' : 'rgb(255 255 255 / 0.07)'
  const blot = (left: string, width: string, name: string, seconds: number): CSSProperties => ({
    left, width, top: '-30%', height: '160%', background: `radial-gradient(closest-side, ${ink}, transparent)`,
    animation: `${name} ${seconds}s ease-in-out infinite`, willChange: 'transform, opacity'
  })
  return (
    // Along the pill's own band, its top 44px, so the island's open card is not smoked all over.
    <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[44px] overflow-hidden rounded-[22px]">
      <style>{WISPS}</style>
      <span className="absolute" style={blot('2%', '38%', 'mf-wisp-a', 9)} />
      <span className="absolute" style={blot('35%', '34%', 'mf-wisp-b', 11)} />
      <span className="absolute" style={blot('62%', '36%', 'mf-wisp-c', 13)} />
    </span>
  )
}

/** The smoke's strength eases rather than jumps when the pointer comes and goes. */
const SMOKE_EASE = `@property --beam-strength { syntax: '<number>'; inherits: true; initial-value: 1; }
[data-beam="{id}"] { transition: --beam-strength 320ms cubic-bezier(0.16, 1, 0.3, 1); }`

/**
 * One gleam across the pill, like light sliding over glossy glass: a wide
 * soft band, angled, with a feathered falloff and a faint glint trailing it,
 * eased across in 1.25s on transform alone and clipped to the pill. The top
 * edge's sheen brightens as it passes. Screened onto a dark pill; on a light
 * one, laid on plainly with a soft shadow leading it. Brutal wears a flat, hard-edged band instead.
 * With Motion off or reduced motion, one soft glow that comes and goes.
 */
function Gleam({ light }: { light: boolean }): React.JSX.Element {
  const band = useRef<HTMLSpanElement>(null)
  const sheen = useRef<HTMLSpanElement>(null)
  const still = document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
  const brutal = document.documentElement.dataset.style === 'brutal'
  useEffect(() => {
    const runs: Animation[] = []
    if (still) {
      if (band.current) runs.push(band.current.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: 'ease-in-out' }))
    } else {
      const timing = { duration: 1250, easing: brutal ? 'cubic-bezier(0.65, 0, 0.35, 1)' : 'cubic-bezier(0.45, 0, 0.55, 1)' }
      // The band is 60% of the pill wide: from wholly off the left to wholly off the right.
      if (band.current) runs.push(band.current.animate([{ transform: 'translateX(-100%) skewX(-20deg)' }, { transform: 'translateX(175%) skewX(-20deg)' }], timing))
      if (sheen.current && !brutal) runs.push(sheen.current.animate([{ opacity: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.85 }, { opacity: 0 }], timing))
    }
    return () => runs.forEach((run) => run.cancel())
  }, [still, brutal])
  const white = (alpha: number): string => `rgb(255 255 255 / ${alpha})`
  // A pale pill cannot be brightened by a screen: there the band is a white
  // highlight laid on plainly, with a soft shadow just ahead of it, darker
  // then brighter, the way a curve of glass shows a light.
  const soft = light
    ? `linear-gradient(90deg, transparent 0%, ${white(0.45)} 22%, ${white(0.85)} 40%, ${white(0.45)} 56%, transparent 64%, rgb(0 0 0 / 0.13) 80%, transparent 100%)`
    : `linear-gradient(90deg, transparent 0%, ${white(0.18)} 30%, ${white(0.28)} 50%, ${white(0.18)} 70%, transparent 100%)`
  // The glint: a thin second light behind the band, fainter.
  const glint = `linear-gradient(90deg, transparent 4%, ${white(0.14)} 8%, transparent 12%)`
  const hard = light
    ? `linear-gradient(90deg, transparent 30%, ${white(0.6)} 30%, ${white(0.6)} 55%, rgb(0 0 0 / 0.12) 55%, rgb(0 0 0 / 0.12) 62%, transparent 62%)`
    : `linear-gradient(90deg, transparent 30%, ${white(0.3)} 30%, ${white(0.3)} 55%, transparent 55%)`
  return (
    <span aria-hidden data-gleam className="pointer-events-none absolute inset-0 overflow-hidden" style={{ mixBlendMode: light ? 'normal' : 'screen', borderRadius: 'inherit' }}>
      {still ? (
        <span ref={band} className="absolute inset-0" style={{ opacity: 0, background: `color-mix(in oklab, var(--tt-brand-color-400) ${light ? 10 : 14}%, transparent)` }} />
      ) : (
        <>
          {!brutal && <span ref={sheen} className="absolute inset-x-[8%] top-0 h-[45%]" style={{ opacity: 0, background: `linear-gradient(${white(light ? 0.45 : 0.16)}, transparent)`, borderRadius: 'inherit' }} />}
          <span ref={band} className="absolute -inset-y-2 left-0 w-[60%]" style={{ transform: 'translateX(-100%) skewX(-20deg)', willChange: 'transform', background: brutal ? hard : `${soft}, ${glint}` }} />
        </>
      )}
    </span>
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
