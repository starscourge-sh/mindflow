import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue, type Transition } from 'motion/react'
import { Coffee, Pause, Paperclip, Square, GripVertical as Grip, X as XSmall } from 'lucide-react'

// The theme's colours: this window has no editor, which is what usually brings them.
import '@/assets/styles/_variables.scss'
import { abandoned, alarm, chime, sessionClock } from '@/lib/sound'
import { useAppearance, useLive, vigil, type Elsewhere, type Focus, type LogEntry, type Settings } from '@/lib/vigil'
import { useAlive, useSurface } from '@/lib/use-alive'
import { BorderBeam } from 'border-beam'
import { Kbd, Tip, Typed } from './ui'
import { DotMatrix } from './dot-matrix'
import { Selfie } from './selfie'
import { ProgressBar } from './progress-bar'
import { clock as clockTime } from '@/lib/clock'
import { SpanPill, sessionEnd } from './session-span'
import { sleptSaid } from '@/lib/slept'
import { lengthSaid as timerSaid, nextStretch, stretchMs, type RoundsAt } from '@/lib/timer'
import { usePatience } from '@/lib/patience'
import { Camera, Check, Play, Screenshot, X } from '@/components/ui/icons'
import { still } from '@/lib/motion'
import { hueVar, type Hue } from '@/lib/books'
import { said } from '@/lib/host'
import { PICTURE_LOST, Unreadable, readBytes, saveClipboardImage } from '@/extensions/image-drop'

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
  // A break's sparks, at the pill's ring, drawn here over the whole screen so they fly out past the pill.
  const [sparks, setSparks] = useState<{ x: number; y: number; key: number } | null>(null)
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    return window.api.onGlow((tone, at) => (tone === 'break' ? at && !still() && setSparks({ ...at, key: Date.now() }) : setGlow({ tone, key: Date.now() })))
  }, [])
  return (
    <>
      {glow && <div key={glow.key} aria-hidden className={`mf-glow mf-glow-${glow.tone}`} />}
      {sparks && <><style>{BREAK_CSS}</style><Sparks key={sparks.key} x={sparks.x} y={sparks.y} /></>}
    </>
  )
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
  // A session left running in another book by a switch: named, and a click goes back there.
  const elsewhere = useLive(vigil.focusElsewhere, null as Elsewhere | null)
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
  // tenser, nothing paused, over or in safe mode. Silenced as the pill goes.
  const running = !!focus && !focus.pausedAt && !settings?.safeMode
  const timeLeft = focus?.plannedMs ? focus.plannedMs - worked(focus, now) : null
  useEffect(() => sessionClock({ running, left: timeLeft, tick: !!settings?.sessionTick, level: settings?.sessionTickVolume ?? 0.5, sound: settings?.sessionTickSound }), [running, timeLeft, settings?.sessionTick, settings?.sessionTickVolume, settings?.sessionTickSound])
  useEffect(() => () => sessionClock({ running: false, left: null, tick: false, level: 0 }), [])
  // Under the notch, where Settings puts it and the Mac has one: how tall the notch is, 0 for none.
  // Null until asked, so a pill never drops in at the top and then jumps to the notch.
  const [notch, setNotch] = useState<number | null>(null)
  useEffect(() => {
    const place = (): void => void window.api.focusPlace().then((at) => setNotch(at.notch))
    place()
    return window.api.onFocusPlaced(place)
  }, [])
  // A session just ended: the pill stays a moment to ask how it went.
  const [asked, setAsked] = useState<string | null>(null)
  // Whether it was ended before its time: the band offers Keep going rather than Go again.
  const [early, setEarly] = useState(false)
  // Keep going pressed: once that session is running again, the band gives way to its pill.
  // Cleared only then, so the window is never put away in the moment between.
  const resuming = useRef<string | null>(null)
  useEffect(() => void (focus && focus.id === resuming.current && (resuming.current = null, setAsked(null), setPickup(null))), [focus])
  // Then where to pick up next time: the unfinished symphony.
  const [pickup, setPickup] = useState<string | null>(null)
  // A session just abandoned: the pill stays a few seconds, saying so, with Undo.
  const [dropped, setDropped] = useState<string | null>(null)
  // A session ended while you were away (asleep, or long idle): said once you are back.
  const [away, setAway] = useState<Away | null>(null)
  // The Mac slept in a session and Settings ended it there: said once it wakes, as any time away is.
  useEffect(() => window.api.onFocusSlept((one) => {
    if (settings?.focusShows === 'note') window.api.nudge({ kind: 'away', id: one.id, goal: one.goal, endedAt: one.endedAt, timer: one.timer, breakOf: one.kind === 'break', idle: false, sleptAt: one.sleptAt, choice: one.choice })
    else setAway(one)
  }), [settings?.focusShows])
  // Another session started meanwhile: that question has gone by.
  useEffect(() => void (focus && focus.id !== asked && focus.id !== pickup && (setAsked(null), setPickup(null))), [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  // Brought back by Undo, or another started: the note has done its job.
  useEffect(() => void (focus && (setDropped(null), setAway(null))), [focus])
  // A timer stopped, or a session ended with nothing to ask: the island folds
  // back up the way it came before the window goes. Told as the session goes,
  // in the same render, so the window is never hidden before the fold plays.
  const [folding, setFolding] = useState(false)
  const [was, setWas] = useState(focus)
  // One pill from nothing running to nothing running: a session that turns
  // into its break, or a break into the session again, morphs in place.
  const [slot, setSlot] = useState(0)
  if (focus !== was) {
    setWas(focus)
    if (was && focus === null && !asked && !pickup && !dropped && !away) setFolding(true)
    if (focus && !was) setSlot((n) => n + 1)
  }
  // A question or a note took over from the fold: it carries on from there.
  useEffect(() => void ((asked || pickup || dropped || away || focus) && setFolding(false)), [asked, pickup, dropped, away, focus])
  // Nothing running, nothing asked, nothing folding: the pill goes away.
  useEffect(() => void (focus === null && !elsewhere && !asked && !pickup && !dropped && !away && !folding && window.api.showFocus(false)), [focus, elsewhere, asked, pickup, dropped, away, folding])

  // After a session: one surface, morphing from the island it was into each stage in turn.
  const after = away && !focus ? 'away' : dropped && !focus ? 'abandoned' : asked ? 'ask' : pickup ? 'pickup' : null
  if (after && notch !== null) {
    return (
      <After stage={after} id={(after === 'away' ? away!.id : after === 'abandoned' ? dropped : after === 'ask' ? asked : pickup)!} away={away} notch={notch} early={early}
        onBack={() => void (resuming.current = asked)}
        onDone={after === 'away' ? () => setAway(null) : after === 'abandoned' ? () => setDropped(null) : after === 'ask' ? () => (setPickup(asked), setAsked(null)) : () => setPickup(null)} />
    )
  }
  if (focus && notch !== null) {
    // Each run its own pill, so each one drops in; one coming out of the band after a session grows from it instead.
    return <Pill key={`${slot}:${notch}`} focus={focus} settings={settings} now={now} notch={notch} onEnded={(id, ended) => (setEarly(ended), setAsked(id))} onAbandoned={setDropped} onAway={(one) => (settings?.focusShows === 'note'
      // The time kept in the note: no bubble on screen to say it, so Vigil's nudge card does.
      ? window.api.nudge({ kind: 'away', id: one.id, goal: one.goal, endedAt: one.endedAt, timer: one.timer, breakOf: one.kind === 'break', idle: one.how === 'idle' })
      : setAway(one))} />
  }
  if (folding && notch !== null) return <After stage="bye" id="" notch={notch} onDone={() => setFolding(false)} />
  if (elsewhere && notch !== null) return <InAnotherBook focus={elsewhere} now={now} notch={notch} />
  return null
}

/**
 * A session left running in another book (“Keep it running” as you switched):
 * the book's name, its goal and time, and a click takes you back to it. Only
 * read from that book: nothing here pauses, ends or writes to it.
 */
function InAnotherBook({ focus, now, notch }: { focus: Elsewhere; now: number; notch: number }): React.JSX.Element {
  const left = focus.plannedMs ? focus.plannedMs - worked(focus, now) : null
  const time = focus.pausedAt ? 'Paused' : left === null ? clock(worked(focus, now)) : left > 0 ? clock(left) : 'Time’s up'
  return (
    <div className="mf-floating flex h-screen items-start justify-center overflow-hidden" style={{ paddingTop: notch ? notch + 4 : TOP }}>
      <button type="button" data-focus-elsewhere={focus.book} onClick={() => (chime('tap'), void window.api.vigil('books:go', focus.book))}
        style={{ backgroundImage: SOLID, backgroundColor: 'Canvas', filter: LIFT }}
        className="flex h-[34px] max-w-[300px] items-center gap-2 rounded-full border px-3 font-[system-ui,-apple-system,sans-serif] text-[13px] text-foreground transition-transform duration-150 active:scale-[0.97]">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: focus.color ? hueVar(focus.color as Hue) : 'var(--tt-brand-color-400)' }} />
        <span className="shrink-0 font-semibold">In {focus.bookName}</span>
        <span className="min-w-0 truncate">{focus.goal}</span>
        <span className="shrink-0 font-semibold tabular-nums">{time}</span>
      </button>
    </div>
  )
}

/** The bubble's one surface, whatever the stage: solid in every theme, so nothing behind shows through. */
export const SOLID = 'linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))'
export const SHADOW = 'shadow-[0_1px_2px_rgb(0_0_0/0.14),0_3px_8px_-2px_rgb(0_0_0/0.12)]'
/** The time-up wash laid over the solid. */
const TIMEUP_WASH = 'linear-gradient(color-mix(in oklab, var(--tt-brand-color-400) 14%, transparent), color-mix(in oklab, var(--tt-brand-color-400) 14%, transparent))'
/** What the island last was, so the stage after it starts from the same shape and colour. */
const lastShape = { height: 44, over: false }

/** A planned length as said under the time: "25 min", or "30 sec" for one under a minute. */
export const lengthSaid = (ms: number): string => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} sec` : timerSaid(Math.round(ms / 60_000) * 60_000))

/** A session ended while you were away, as the main process says it: when it ended and why. */
export type Away = { id: string; endedAt: string; timer: boolean; kind: string | null; how: 'asleep' | 'idle'; goal: string; /** Ended by the Mac's sleep, as Settings says: when it slept, and finished or abandoned there. */ sleptAt?: string; choice?: 'abandon' | 'finish' }
/** What “+10 min” adds: ten minutes from the planned end, or from now once past it. */
export const MORE = 10 * 60_000
/** How long the time takes to roll up to its new length. */
const ROLL = 700
/** Untouched this long, past a session's time (or in one with no length), you are away. */
const IDLE_OVER = 15 * 60_000
const IDLE_OPEN = 45 * 60_000
// “Start the next round by itself” waits for you if the Mac has been untouched this long (seconds) as the break ends.
const AWAY_FROM_BREAK = 120
/** Time's up and unanswered: asked again this many minutes after the end, a little more each time, then left be. */
const NUDGES = [3, 6, 11]
/** Set by Go again from the band: the next pill grows out of the band instead of dropping in. */
let morphNext = false
/** Inside quiet hours (Settings): a nudge shows but makes no sound. */
const quietNow = (settings: Settings | null): boolean => {
  if (!settings?.quietStart || !settings.quietEnd || settings.quietStart === settings.quietEnd) return false
  const time = new Date().toTimeString().slice(0, 5)
  return settings.quietStart <= settings.quietEnd ? time >= settings.quietStart && time < settings.quietEnd : time >= settings.quietStart || time < settings.quietEnd
}

/**
 * A break's own colours, opaque in every theme: a calm mint in a light one,
 * a deep sea green in a dark one, and in Brutal one flat, bright block. The
 * accent turns mint too, so the ring, the buttons and Time's up all follow.
 */
const breakInks = (light: boolean, brutal: boolean): CSSProperties => (light ? {
  '--foreground': 'oklch(0.3 0.06 168)', '--muted-foreground': 'oklch(0.45 0.07 168)', '--border': brutal ? 'oklch(0.2 0.04 168)' : 'oklch(0.85 0.05 165)',
  '--accent': 'oklch(0.89 0.06 165)', '--tt-brand-color-400': 'oklch(0.58 0.14 160)'
} : {
  '--foreground': 'oklch(0.96 0.03 165)', '--muted-foreground': 'oklch(0.8 0.06 165)', '--border': brutal ? 'oklch(0.92 0.05 165)' : 'oklch(0.44 0.06 170)',
  '--accent': 'oklch(0.38 0.06 170)', '--tt-brand-color-400': 'oklch(0.82 0.15 158)', '--pill-on-accent': 'oklch(0.22 0.05 170)'
}) as unknown as CSSProperties
const breakFill = (light: boolean, brutal: boolean): string => brutal
  ? (light ? 'oklch(0.9 0.12 158)' : 'oklch(0.4 0.09 165)')
  : light ? 'linear-gradient(165deg, oklch(0.975 0.035 140), oklch(0.93 0.06 168))' : 'linear-gradient(165deg, oklch(0.31 0.055 172), oklch(0.24 0.05 195))'
/** Short lines a break says in turn, under its cup: playful, never an order. */
export const BREAK_LINES = ['Break time', 'Stretch a little', 'Look at something far away', 'Water, maybe?', 'Shoulders down', 'Breathe out slowly', 'Stand up, walk about', 'Unclench your jaw', 'Nothing to do for a bit']

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
/** The pill's lift off the screen, drawn around whatever shape it is clipped to (a box shadow would be clipped with it). */
const LIFT = 'drop-shadow(0 1px 1px rgb(0 0 0 / 0.14)) drop-shadow(0 3px 3px rgb(0 0 0 / 0.08))'

type Shape = { w: number; h: number }
/**
 * The island's shape, sprung without laying anything out. Its box is set
 * once per change, to the larger of where it is and where it is going (and
 * to where it went once the spring settles); inside that box the shape seen
 * is a clip, and its 1px edge a second clip a pixel wider behind it. So each
 * frame of the spring moves a clip, never a width or a height, and nothing in
 * the pill is laid out again. Hung from the top, centred, as the pill hangs
 * under the menu bar or the notch.
 */
function useShape(start: Shape, target: Shape, how: { w: Transition; h: Transition }, tucked: boolean): { box: Shape; clip: MotionValue<string>; edge: MotionValue<string> } {
  const w = useMotionValue(start.w)
  const h = useMotionValue(start.h)
  const [box, setBox] = useState<Shape>(() => ({ w: Math.max(start.w, target.w), h: Math.max(start.h, target.h) }))
  const clip = useMotionValue('')
  const edge = useMotionValue('')
  useLayoutEffect(() => {
    // Under the notch it hangs from the notch: square on top, with no edge there.
    const round = tucked ? '0 0 18px 18px' : '22px'
    const rim = tucked ? '0 0 19px 19px' : '23px'
    const draw = (): void => {
      const half = w.get() / 2
      clip.set(`inset(0px calc(50% - ${half}px) calc(100% - ${h.get()}px) calc(50% - ${half}px) round ${round})`)
      // The edge layer is a pixel larger all round, so the same shape there is a pixel out from it.
      edge.set(`inset(${tucked ? 1 : 0}px calc(50% - ${half + 1}px) calc(100% - ${h.get() + 2}px) calc(50% - ${half + 1}px) round ${rim})`)
    }
    draw()
    const off = [w.on('change', draw), h.on('change', draw)]
    return () => off.forEach((one) => one())
  }, [tucked]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    setBox((was) => {
      const next = { w: Math.max(was.w, w.get(), target.w), h: Math.max(was.h, h.get(), target.h) }
      return next.w === was.w && next.h === was.h ? was : next
    })
    let live = true
    const moves = [animate(w, target.w, how.w), animate(h, target.h, how.h)]
    // Settled: the box comes in to the shape, once.
    void Promise.all(moves).then(() => live && setBox((was) => (was.w === target.w && was.h === target.h ? was : { ...target })))
    return () => {
      live = false
      moves.forEach((one) => one.stop())
    }
  }, [target.w, target.h]) // eslint-disable-line react-hooks/exhaustive-deps
  return { box, clip, edge }
}


/** A file kept for the next thought: a picture shown small, anything else by its name. */
type Attachment = { url: string; name: string; picture: boolean }
const PICTURE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/svg+xml', 'image/heic'])

/**
 * Under the notch, the pill is the notch's own black, a little wider than it:
 * the ring and the rounds at its left, the time at its right, the notch itself
 * between them. Pointed at, it opens down into the island. Its colours are a
 * dark theme's in every theme, light and Brutal too, since the notch is black.
 */
const NOTCH_INKS = {
  '--foreground': 'rgb(245 245 245)',
  '--muted-foreground': 'rgb(163 163 163)',
  '--border': 'rgb(255 255 255 / 0.12)',
  '--popover': 'rgb(0 0 0)',
  '--background': 'rgb(0 0 0)',
  '--accent': 'rgb(255 255 255 / 0.1)'
} as CSSProperties
/** The notch's width, near enough on every notched Mac, left clear between the wings. */
const NOTCH_WIDTH = 200

function Pill({ focus, settings, now, notch, onEnded, onAbandoned, onAway }: { focus: Focus; settings: Settings | null; now: number; notch: number; onEnded: (id: string, early: boolean) => void; onAbandoned: (id: string) => void; onAway: (away: Away) => void }): React.JSX.Element {
  const tucked = notch > 0
  const top = tucked ? 0 : TOP
  const restH = tucked ? notch : REST
  const bubble = settings?.focusBubble ?? 'circle'
  const rang = useRef<string | null>(null)
  // Hover told by the pointer itself: a window's drag area never reports it.
  const [hover, setHover] = useState(false)
  // The beam and the goo run frame loops of their own: only with Motion on
  // and the pill on screen.
  const alive = useAlive()
  const surface = useSurface()
  const light = surface === 'light'
  // The drop from above is the island's own; with Motion off (even before this
  // window has applied the setting) or Reduce motion, it fades in place instead.
  const calm = useRef(still() || settings?.motion === false).current
  const brutal = document.documentElement.dataset.style === 'brutal'
  // Grown out of the band after a session (Go again), rather than dropped in from above.
  const [morph] = useState(() => morphNext)
  useEffect(() => void (morphNext = false), [])

  // The five-second rule (Settings): a session just begun counts 5, 4, 3, 2, 1
  // with a tick each, its clock held until the count is done. Asked again for
  // each run the pill shows, since one pill can go from a break to the session again.
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    // Held since the moment it began: how the main process starts one with the rule on.
    if (focus.pausedAt !== focus.startedAt || focus.pausedMs) return
    setCount(5)
  }, [focus.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (count === null) return
    if (count === 0) return void vigil.resumeSession(focus.id).then(() => (chime('on'), setCount(null)))
    // The first count is the start's own moment: whatever started it has just made its sound.
    if (count < 5) chime('tick')
    const next = setTimeout(() => setCount(count - 1), 1000)
    return () => clearTimeout(next)
  }, [count]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- the island: dropped in, opened, settled, and opened again on hover
  // 'above' is out of sight under the menu bar; 'capsule' has dropped in;
  // 'shown' is the new session's card; 'rest' is the pill.
  // Under the notch it comes straight out of it: no drop from the menu bar.
  const [stage, setStage] = useState<'above' | 'capsule' | 'shown' | 'rest'>(calm || tucked ? 'rest' : morph ? 'shown' : 'above')
  // Time's up asks out loud: the island opens on its choices until you answer, point at it and leave, or press Escape.
  const [asking, setAsking] = useState(false)
  // How many times an unanswered Time's up has asked again (capped, see NUDGES).
  const [nudged, setNudged] = useState(0)
  // Another run in the same pill (a session's break, or the session again): it opens to say so, and asks afresh.
  const firstId = useRef(focus.id)
  useEffect(() => {
    if (focus.id === firstId.current) return
    firstId.current = focus.id
    setAsking(false)
    setNudged(0)
    if (!calm) setStage('shown')
  }, [focus.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Under the pointer for a moment (not only passing over), or a file carried onto it.
  const [opened, setOpened] = useState(false)
  const [carried, setCarried] = useState(false)
  // Escape closes it, even with the pointer still on it, until the pointer leaves.
  const [shut, setShut] = useState(false)
  const [typing, setTyping] = useState(false)
  const [words, setWords] = useState('')
  const [attached, setAttached] = useState<Attachment | null>(null)
  const [denied, setDenied] = useState<false | 'refused' | 'asked'>(false)
  // The camera, open for a selfie.
  const [selfie, setSelfie] = useState(false)
  // Stop pressed before the time is up: the pill asks, in place, whether to count it.
  const [stopping, setStopping] = useState(false)
  const engaged = typing || !!words.trim() || !!attached || !!denied || selfie || carried || stopping
  const open = stage === 'shown' || (stage === 'rest' && !shut && (opened || engaged || asking))
  const field = useRef<HTMLInputElement>(null)
  // Closed, the camera goes off with it: never on out of sight.
  useEffect(() => void (!open && setSelfie(false)), [open])
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
  const target = open || stage === 'capsule' || stage === 'above' ? Math.max(restH, full) : restH
  // Open, room for the spring to overshoot as well as for the shadow.
  const want = Math.ceil(Math.max(REST, target) + top + BELOW + (target > restH ? 16 : 0))
  // Asked for once as it mounts, whatever size an earlier session left it.
  const [room, setRoom] = useState(0)
  useEffect(() => {
    if (want > room) return void window.api.focusSize(want).then(() => setRoom(want))
    if (want === room) return
    if (!room) return void window.api.focusSize(want).then(() => setRoom(want))
    const later = setTimeout(() => void window.api.focusSize(want).then(() => setRoom(want)), calm ? 0 : 650)
    return () => clearTimeout(later)
  }, [want, room, calm])
  const height = Math.max(restH, Math.min(target, room - top - BELOW - (target > restH ? 16 : 0)))

  // A new session: up from under the menu bar as a capsule, then open, then
  // after a moment the pill. With Motion off or Reduce motion, a fade.
  useEffect(() => {
    if (calm || !full) return
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
  }, [stage, full, calm, room, want])

  const enter = (): void => {
    setHover(true)
    clearTimeout(intent.current)
    intent.current = setTimeout(() => setOpened(true), 90)
  }
  const leave = (): void => {
    setHover(false)
    setShut(false)
    // Seen and passed by: Time's up stops holding the island open (it asks again later if still unanswered).
    if (opened) setAsking(false)
    clearTimeout(intent.current)
    intent.current = setTimeout(() => setOpened(false), 220)
  }
  useEffect(() => () => clearTimeout(intent.current), [])
  const collapse = (): void => {
    field.current?.blur()
    setDenied(false)
    setShut(true)
    setOpened(false)
    setAsking(false)
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

  // Pomodoro rounds ("4x25"): which round, and work or a break.
  const rounds = useMemo((): RoundsAt | null => {
    try {
      return focus.rounds ? (JSON.parse(focus.rounds) as RoundsAt) : null
    } catch {
      return null
    }
  }, [focus.rounds])
  const resting = !!rounds && rounds.phase !== 'work'
  // A break, of either kind: its own colours, cup, words and sounds.
  const onBreak = resting || focus.kind === 'break'
  const over = left !== null && left <= 0
  const paused = !!focus.pausedAt

  // --- away: nobody has touched the Mac for a long while (idle time comes
  // from the system). The main process ends the session at the time it should
  // have ended and the band says so, rather than counting hours of nothing. A
  // session still within its time while idle is left be. Sleep is the main
  // process's to answer, as Settings says (“When the Mac sleeps”); the
  // heartbeat only tells the pill it has just woken.
  const beat = useRef(Date.now())
  const latest = useRef({ focus, paused, onAway })
  latest.current = { focus, paused, onAway }
  const leaving = useRef(false)
  const goAway = (from: number): void => {
    const { focus: one, paused: held } = latest.current
    if (held || leaving.current) return
    leaving.current = true
    void vigil.awaySession(one.id, from).then((ended) => {
      leaving.current = false
      if (ended) latest.current.onAway({ ...ended, goal: one.goal })
    }, () => void (leaving.current = false))
  }
  useEffect(() => {
    const heart = setInterval(() => {
      const at = Date.now()
      beat.current = at
    }, 5000)
    const idle = setInterval(() => void window.api.idleSeconds().then((seconds) => {
      const { focus: one } = latest.current
      const quiet = seconds * 1000
      if (quiet >= (one.plannedMs ? IDLE_OVER : IDLE_OPEN)) goAway(Date.now() - quiet)
    }), 30_000)
    return () => (clearInterval(heart), clearInterval(idle))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Just woken (the heartbeat has not caught up): no alarm yet, the away check speaks first.
  const woke = now - beat.current > 90_000

  // Time is up: the screen's edge glows with a bell, once, and the pill opens to ask until you act.
  // A round that is not the last goes straight on to its break, or a break to the next round.
  // Its planned length is part of the stretch, so a session given ten more minutes rings again at its new end.
  const stretch = `${focus.id}:${rounds ? `${rounds.round}${rounds.phase}` : ''}:${focus.plannedMs}`
  if (over && rang.current !== stretch && !woke) {
    rang.current = stretch
    const next = rounds && nextStretch(rounds)
    if (next) {
      // A break starts with its own sound, airy and soft; its end calls you back, bright.
      const go = (): void => {
        chime(next.phase === 'work' ? 'breakOut' : 'breakIn')
        window.api.glow('done')
        void vigil.nextRound(focus.id, { round: next.round, phase: next.phase, ms: stretchMs(next) })
      }
      // A break over with nobody at the Mac (two minutes untouched): the next round waits and asks with “Go again”, as a session's does.
      if (next.phase !== 'work') go()
      else void window.api.idleSeconds().then((idle) => (idle >= AWAY_FROM_BREAK ? (chime('breakOut'), window.api.glow('done'), setHeldAt(stretch), setAsking(true), setNudged(0)) : go()), go)
    } else if (focus.kind === 'break' && settings?.autoNextRound) {
      // “Start the next round by itself” (Settings): the break over, the session before it starts again, no click.
      // With nothing to go back to, or nobody at the Mac (two minutes untouched), it asks as it would have.
      chime('breakOut')
      window.api.glow('done')
      const ask = (): void => (setAsking(true), setNudged(0))
      void window.api.idleSeconds().then((idle) => (idle >= AWAY_FROM_BREAK ? ask() : vigil.againSession().then((id) => void (!id && ask()))), ask)
    } else {
      // A break over calls you back brightly; the end of a session or countdown, the alarm clock's rings.
      if (onBreak) chime('breakOut')
      else alarm()
      window.api.glow('done')
      setAsking(true)
      setNudged(0)
    }
  }

  // --- unanswered: asked again after 3, 6 and 11 minutes, a little more each
  // time (a soft bell and the island opening; then two bells and the screen's
  // edge), then left be. Never while you are away from the Mac, never a sound
  // in quiet hours or with Sounds off, and never with the pill paused.
  const [retry, setRetry] = useState(0)
  const overBy = useRef(0)
  // Rounds held after a break (nobody at the Mac): the next one starts on “Go again”.
  const [heldAt, setHeldAt] = useState<string | null>(null)
  const held = heldAt === stretch
  const roundOn = (): void => {
    const next = rounds && nextStretch(rounds)
    if (!next) return
    chime('breakOut')
    setHeldAt(null)
    setAsking(false)
    void vigil.nextRound(focus.id, { round: next.round, phase: next.phase, ms: stretchMs(next) })
  }
  overBy.current = over ? -(left ?? 0) : 0
  useEffect(() => {
    if (!over || paused || nudged >= NUDGES.length || (rounds && nextStretch(rounds) && !held)) return
    // A QA run can set window.vigilNudges to shorter minutes.
    const at = (window as { vigilNudges?: number[] }).vigilNudges ?? NUDGES
    const wait = Math.max(1000, at[nudged] * 60_000 - overBy.current)
    const later = setTimeout(() => void window.api.idleSeconds().then((idle) => {
      if (idle >= 60) return void setTimeout(() => setRetry((n) => n + 1), 60_000)
      setNudged((n) => n + 1)
      setAsking(true)
      setShut(false)
      setGleam((n) => n + 1)
      if (!quietNow(settings)) chime(nudged === 0 ? 'nudge' : 'nudgeMore')
      if (nudged > 0) window.api.glow('done')
    }), wait)
    return () => clearTimeout(later)
  }, [over, paused, nudged, retry]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- ten more minutes: the planned length grows, from anywhere (the pill,
  // its menu, ⌘K or ⌃⌥⌘=), and the time rolls up to it rather than jumping,
  // with a small wind of the crown.
  // Told in the render that brings the new length, so the roll starts from the time last shown.
  const [plan, setPlan] = useState({ id: focus.id, ms: focus.plannedMs, startedAt: focus.startedAt })
  const shownLeft = useRef<number | null>(left)
  const [roll, setRoll] = useState<{ from: number; at: number } | null>(null)
  const [grew, setGrew] = useState(0)
  if (plan.id !== focus.id || plan.ms !== focus.plannedMs || plan.startedAt !== focus.startedAt) {
    setPlan({ id: focus.id, ms: focus.plannedMs, startedAt: focus.startedAt })
    if (plan.id === focus.id && plan.startedAt === focus.startedAt && plan.ms && focus.plannedMs && focus.plannedMs > plan.ms) {
      setGrew((n) => n + 1)
      if (!calm) setRoll({ from: Math.max(0, shownLeft.current ?? 0), at: performance.now() })
    }
  }
  useEffect(() => {
    if (!grew) return
    chime('more')
    setAsking(false)
    setNudged(0)
  }, [grew])
  const [, setFrame] = useState(0)
  useEffect(() => {
    if (!roll) return
    // A frame's worth at a time, on a timer rather than animation frames, so it rolls even in a window the Mac thinks is covered.
    let frame: ReturnType<typeof setTimeout>
    const step = (): void => {
      if (performance.now() - roll.at >= ROLL) return setRoll(null)
      setFrame((n) => n + 1)
      frame = setTimeout(step, 16)
    }
    frame = setTimeout(step, 16)
    return () => clearTimeout(frame)
  }, [roll])
  const rolled = roll ? 1 - (1 - Math.min(1, (performance.now() - roll.at) / ROLL)) ** 3 : 1
  const leftShown = roll && left !== null ? roll.from + (left - roll.from) * rolled : left
  shownLeft.current = leftShown
  const extend = (): void => void vigil.extendSession(focus.id, MORE).then((planned) => planned === false && chime('nope'))
  // A break, or a session finished, can go again: the last session kept, same task and length.
  const lastKept = useLive(() => (focus.kind === 'break' ? vigil.lastSession() : Promise.resolve(null)), null as Awaited<ReturnType<typeof vigil.lastSession>>, [focus.kind])
  // A plain timer ("5m tea") or a set of rounds, over: started again as it first was, in the same pill.
  const timerAgain = (): void => void (rounds
    ? vigil.startRounds(focus.goal, { rounds: rounds.rounds, workMs: rounds.workMs, breakMs: rounds.breakMs, longMs: rounds.longMs })
    : vigil.startTimer(focus.goal, (focus.plannedMs ?? 0) - (focus.extendedMs ?? 0))).then(() => (chime('anew'), window.api.glow('done')))
  // --- a break arriving: a moment of its own, then calm. The pill springs a
  // little, the cup pops into the ring with its steam starting, and a small
  // burst of sparks leaves the ring. Once each time a break begins; nothing
  // moves with Motion off or Reduce motion (the colours still change).
  const [arrived, setArrived] = useState(0)
  const island = useRef<HTMLDivElement>(null)
  useEffect(() => void (onBreak && !over && setArrived((n) => n + 1)), [onBreak, focus.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!arrived || calm) return
    // The sparks: on the screen's own glow layer, so they leave the pill rather than being clipped by it.
    if (alive) window.api.glow('break')
    const bounce = shell.current?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.045)', offset: 0.32 }, { transform: 'scale(0.988)', offset: 0.68 }, { transform: 'scale(1)' }],
      { duration: 640, delay: 120, easing: 'cubic-bezier(0.34, 1.3, 0.64, 1)' })
    return () => bounce?.cancel()
  }, [arrived]) // eslint-disable-line react-hooks/exhaustive-deps
  const again = (): void => void vigil.againSession().then((id) => (id ? (chime('anew'), window.api.glow('done')) : chime('nope')))

  // How far through: the ring is the session itself, filled as it goes.
  const share = focus.plannedMs ? Math.min(1, Math.max(0, 1 - (leftShown ?? 0) / focus.plannedMs)) : null
  const last = left !== null && left > 0 && left <= 60000
  // The dinosaur beside the ring: along a line that fills with the session, or
  // running in place, hopping a cactus now and then. A session with no length
  // has no line to fill, so it only runs.
  const along = bubble === 'progress' && share !== null

  // --- the log: a thought, maybe with a picture or a file, stamped now
  // A file that will not open (Apple Notes hands over a pointer into its own
  // folder) is never the end of it: a paste takes the clipboard's own picture
  // instead, or keeps the words that came with it and says so plainly.
  const keepFile = async (file: File, words?: string): Promise<void> => {
    let picture = PICTURE_TYPES.has(file.type)
    let url: string | null | undefined
    try {
      const bytes = await readBytes(file)
      url = picture ? await window.api.saveImage(file.type, bytes) : await window.api.saveFile(file.name || 'file', bytes)
    } catch (cause) {
      if (!(cause instanceof Unreadable)) throw cause
      url = words === undefined ? null : await saveClipboardImage()
      if (url) picture = true
      else {
        if (words) setWords((now) => now + words)
        return said(words === undefined ? cause.message : PICTURE_LOST, false)
      }
    }
    if (!url) return chime('nope')
    setAttached({ url, name: file.name || (picture ? 'Picture' : 'File'), picture })
    setDenied(false)
    chime('pin')
    field.current?.focus()
  }
  const shoot = async (): Promise<void> => {
    chime('tap')
    setSelfie(false)
    const shot = await window.api.focusShot()
    if (shot && 'url' in shot) {
      setAttached({ url: shot.url, name: `Screenshot ${clockTime(new Date().toISOString())}`, picture: true })
      setDenied(false)
      chime('shutter')
    } else setDenied(shot && 'asked' in shot && shot.asked ? 'asked' : 'refused')
    field.current?.focus()
  }
  // A selfie: the camera opens in the pill, and what is kept waits here like a screenshot.
  const selfieKept = (url: string): void => {
    setSelfie(false)
    setAttached({ url, name: `Selfie ${clockTime(new Date().toISOString())}`, picture: true })
    setDenied(false)
    chime('pin')
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

  const button = 'flex h-7 shrink-0 items-center whitespace-nowrap gap-1 rounded-full px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--tt-brand-color-400)] [&_svg]:size-3'
  // Past the end: how it went, and how long ago, once that is a minute or more.
  const overMin = over ? Math.floor(-(left ?? 0) / 60_000) : 0
  const overSaid = `${onBreak ? `${lengthSaid(focus.plannedMs ?? 0)} break done` : timer ? `${lengthSaid(focus.plannedMs ?? 0)} timer done` : `All ${lengthSaid(focus.plannedMs ?? 0)} done`}${overMin >= 1 ? ` · ${overMin} min ago` : ''}`
  const end = (): void => void vigil.endSession(focus.id, '', false).then(() => (over ? chime('done') : glowEnd('done'), onEnded(focus.id, !over)))
  // Asking whether to count it: Escape backs out, from anywhere on the pill.
  useEffect(() => {
    if (!stopping) return
    const onKey = (event: KeyboardEvent): void => void (event.key === 'Escape' && (event.preventDefault(), chime('fold'), setStopping(false)))
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stopping])
  // Time ran out while asking: Done is the only answer then.
  useEffect(() => void (over && setStopping(false)), [over])
  // Abandoned: kept in the log marked so, counted nowhere, with Undo for a few seconds.
  const abandon = (): void => void vigil.abandonSession(focus.id).then((how) => {
    if (how !== 'abandoned') return
    abandoned()
    window.api.glow('cancel')
    onAbandoned(focus.id)
  })
  const shown = stage === 'capsule' || stage === 'above'
  const spring = calm ? { duration: 0 } : SPRING
  // Kept for the stage after it, which starts from this shape and colour.
  lastShape.height = shown ? CAPSULE.height : height
  lastShape.over = over
  // Where it starts: dropped in as the capsule, grown from the band (Go again), or, still, at rest.
  const [startShape] = useState<Shape>(() => calm ? { w: WIDE, h: restH } : morph ? { w: WIDE, h: Math.max(restH, lastShape.height) } : tucked ? { w: NOTCH_WIDTH, h: notch } : { w: CAPSULE.width, h: CAPSULE.height })
  const shape = useShape(startShape, shown ? { w: CAPSULE.width, h: CAPSULE.height } : { w: WIDE, h: height }, { w: calm ? { duration: 0 } : SPRING, h: spring }, tucked)
  const shell = useRef<HTMLDivElement>(null)
  const edgeInk = over && !tucked ? 'color-mix(in oklab, var(--tt-brand-color-400) 55%, var(--border))' : tucked && onBreak && !over ? 'oklch(0.82 0.15 158 / 0.5)' : 'var(--border)'

  // Open: what the island shows. Kept drawn at rest (clipped away and
  // unreachable), so its height is known before it opens; and kept as it was
  // between the clock's ticks while closed, so a tick redraws only the pill.
  const timeText = open ? clock(leftShown ?? done) : ''
  // Break early is offered from halfway: kept apart so the panel redraws once, as it turns.
  const halfway = focus.plannedMs ? done >= focus.plannedMs / 2 : done >= 15 * 60_000
  // From when to when: "21:24 → 21:49" beside the large time, moved on by a pause or ten more minutes. To the minute, so a tick never redraws it.
  const spanTo = sessionEnd(focus, now)
  const endMinute = spanTo === null ? null : Math.floor(spanTo / 60_000) * 60_000
  const span = !over && count === null ? <SpanPill from={Date.parse(focus.startedAt)} to={endMinute} /> : null
  const panel = useMemo(() => (
    <div
      inert={!open}
      data-island-panel
      onMouseDown={(event) => event.target === event.currentTarget && !timer && (event.preventDefault(), field.current?.focus())}
      className={`${tucked ? 'px-[14px] pb-[14px]' : 'px-3 pb-3'} transition-opacity duration-150 ${open ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Under the notch the ring and the time sit in the wings beside it, as
          the island's own leading and trailing items do; below them, one line
          says what this is and how it stands, on the same left edge as
          everything under it. Time's up keeps “+10 min” on that line, quiet,
          so the one filled button below is the only thing in the accent. */}
      {tucked ? (
        <div data-notch-head className="flex items-center gap-3 pt-1 pb-3">
          <span className="min-w-0 flex-1">
            <span data-timeup={over || undefined} className="block truncate text-[15px] leading-5 font-semibold">
              {over ? (onBreak ? "Break's over" : "Time's up") : onBreak ? <BreakLine first={resting && rounds!.phase === 'long' ? 'Long break' : 'Off the clock for a bit'} still={calm || paused} /> : focus.goal || (timer ? 'Timer' : 'Focus')}
            </span>
            <span className="block truncate text-[12px] leading-4 text-muted-foreground">
              {over ? (onBreak ? overSaid : `${focus.goal || 'Timer'}${overMin >= 1 ? ` · ${overMin} min ago` : ''}`) : count !== null ? 'Starting in a moment' : paused ? 'Paused' : focus.plannedMs ? `of ${lengthSaid(focus.plannedMs)}${onBreak ? ' break' : ''}` : 'so far'}
            </span>
          </span>
          {span}
          {over && focus.plannedMs !== null && (
            <Tip label="Ten more minutes  ⌃⌥⌘="><button type="button" data-more onClick={extend} className="flex h-7 shrink-0 items-center rounded-full bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)] px-3 text-[12px] font-semibold text-foreground tabular-nums transition-colors hover:bg-[color-mix(in_oklab,var(--foreground)_16%,transparent)]">
              +10 min
            </button></Tip>
          )}
        </div>
      ) : (
      <div className="flex items-end justify-between gap-2 pt-0.5 pb-2">
        <span className={`flex items-baseline gap-2 ${over || last ? 'text-[var(--tt-brand-color-400)]' : paused ? 'text-muted-foreground' : ''}`}>
          {over ? <span data-timeup className="text-[20px] leading-[24px] font-semibold">{onBreak ? "Break's over" : "Time's up"}</span> : <DotMatrix text={timeText || '00:00'} className="h-[24px]" />}
          <span className="text-[12px] text-muted-foreground">{count !== null ? 'Starting in a moment' : paused ? 'Paused' : over ? overSaid : focus.plannedMs ? `of ${lengthSaid(focus.plannedMs)}${onBreak ? ' break' : ''}` : 'so far'}</span>
        </span>
        {span && <span className="mb-px">{span}</span>}
      </div>
      )}
      {/* Stopped before its time: count it, or abandon it. Plain words, in place; Escape or Back keeps it running. */}
      {stopping && !over ? (
        <div data-stop-ask className={`${tucked ? 'ml-0' : 'ml-0.5'} flex items-center gap-1 whitespace-nowrap`}>
          <span className="mr-1 text-[12px] font-semibold text-foreground">End early?</span>
          <Tip label="End it now and count the time so far"><button type="button" data-end-early autoFocus onClick={() => (setStopping(false), end())} className={PRIMARY}>
            Count it
          </button></Tip>
          <Tip label="Ends now, stays in the task's log, counts toward nothing"><button type="button" data-abandon onClick={() => (setStopping(false), abandon())} className={button}>
            Don't count it
          </button></Tip>
          <Tip label="Back: keep it running  Esc"><button type="button" data-stop-back aria-label="Back: keep it running" onClick={() => (chime('fold'), setStopping(false))} className={`${ICON_BUTTON} ml-auto`}>
            <X className="size-3.5" />
          </button></Tip>
        </div>
      ) : (
      <div className={`${tucked ? (over ? 'ml-0 gap-1' : '-ml-2.5 gap-1') : '-ml-1.5 gap-0.5'} flex items-center`}>
        {/* A break over: back to it is the answer it hopes for, so it comes first. */}
        {over && held && rounds && (
          <Tip label={`Start round ${rounds.round + 1} of ${rounds.rounds}`}><button type="button" data-rounds-on onClick={roundOn} className={PRIMARY}>
            Go again
          </button></Tip>
        )}
        {over && onBreak && lastKept && (
          <Tip label={`Start “${lastKept.goal}” again${lastKept.plannedMs ? `, ${lengthSaid(lastKept.plannedMs)}` : ''}`}><button type="button" data-again onClick={again} className={PRIMARY}>
            Go again
          </button></Tip>
        )}
        {/* A break is not paused: it is ended, or made longer. */}
        {/* Counting in: not paused, only waiting; Start now skips the count (its end plays the one sound). */}
        {!over && !onBreak && count !== null && (
          <button type="button" data-start-now onClick={() => setCount(0)} className={button}>
            <Play className="fill-current" /> Start now
          </button>
        )}
        {!over && !onBreak && count === null && (
          <button type="button" onClick={() => void (paused ? vigil.resumeSession(focus.id) : vigil.pauseSession(focus.id)).then(() => chime(paused ? 'on' : 'off'))} className={button}>
            {paused ? <Play className="fill-current" /> : <Pause className="fill-current" />} {paused ? 'Resume' : 'Pause'}
          </button>
        )}
        {/* Ten more minutes, for a session or a break with a length: the time rolls up to it. */}
        {focus.plannedMs !== null && !(tucked && over) && (
          <Tip label="Ten more minutes  ⌃⌥⌘="><button type="button" data-more onClick={extend} className={`${button} tabular-nums`}>
            +10 min
          </button></Tip>
        )}
        {/* On a break with a session to go back to, “Back to work” is the way out; ending it without one is in the right-click menu. */}
        {!(focus.kind === 'break' && !over && lastKept) && <Tip label={timer && !over ? (focus.kind === 'break' ? 'End the break' : 'Stop the timer') : timer ? undefined : over ? 'Finish the session' : 'Stop: asks whether to count it'}><button
            type="button"
            // Past its time it has already glowed: ending it is only the tick.
            // A session asks how it went before the pill goes; a timer just goes.
            // One way to stop: the × beside it went. A timer just goes; ⌥ on a
            // session abandons it, as the right-click menu does: kept, marked, counted nowhere.
            onClick={(event) => (timer && !over ? void vigil.cancelSession(focus.id).then(() => glowEnd('cancel')) : timer ? void vigil.cancelSession(focus.id).then(() => chime('done')) : event.altKey ? abandon() : over ? end() : (chime('tap'), setStopping(true)))}
            className={`${over && !(onBreak && lastKept) && !held ? PRIMARY : button} ${over ? (tucked && !(onBreak && lastKept) && !held ? 'order-first' : 'order-2') : focus.kind === 'break' ? 'order-2' : ''}`}
          >
            {over ? 'Done' : focus.kind === 'break' ? 'End break' : <><Square className="fill-current" /> Stop</>}
          </button></Tip>}
        {/* On a break: straight back to the session it came from, whenever you are ready. */}
        {!over && focus.kind === 'break' && lastKept && (
          <Tip label={`End the break and start “${lastKept.goal}” again${lastKept.plannedMs ? `, ${lengthSaid(lastKept.plannedMs)}` : ''}`}><button type="button" data-back-to-work onClick={again} className={PRIMARY}>
            Back to work
          </button></Tip>
        )}
        {/* A plain timer or a set of rounds over: the same again, as long as it first was. */}
        {over && timer && focus.kind !== 'break' && !held && (
          <Tip label={rounds ? 'The same rounds again' : `The same timer again, ${lengthSaid(focus.plannedMs! - (focus.extendedMs ?? 0))}`}><button type="button" data-timer-again onClick={timerAgain} className={`${button} order-1`}>
            Again
          </button></Tip>
        )}
        {/* Break early: this session kept, and five minutes away from it on the
            clock. Only past halfway (or a quarter hour in, with no planned
            length): before that it is a third button to read past. The
            session turns into the break in place, one pill throughout. */}
        {!timer && (over || halfway) && (
          <Tip label="End the session, kept, and start a five-minute break"><button
            type="button"
            data-take-break
            onClick={() => void vigil.startBreak(focus.id, 5 * 60_000).then(() => (chime('breakIn'), window.api.glow('done')))}
            className={`${button} ${over ? 'order-1' : ''}`}
          >
            <Coffee /> {over ? 'Take a break' : 'Break early'}
          </button></Tip>
        )}
      </div>
      )}

      {/* The session's log so far, newest first: the last three, then how many more. */}
      {newest.length > 0 && (
        <ol data-island-log className="mt-2 border-t border-border pt-1.5">
          {newest.map((entry) => (
            <li key={entry.id} className="group/entry flex h-[22px] items-center gap-2 text-[12px]">
              <time dateTime={entry.at} className="min-w-9 shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">{clockTime(entry.at)}</time>
              <span className="min-w-0 flex-1 truncate">{entry.text || entry.assetName || 'Picture'}</span>
              {entry.asset && /\.(png|jpe?g|gif|webp|avif|bmp|heic|svg)$/i.test(entry.asset)
                ? <img src={entry.asset} alt="" draggable={false} className="size-4 shrink-0 rounded-[4px] border object-cover" />
                : entry.asset ? <Paperclip className="size-3 shrink-0 text-muted-foreground" /> : null}
              <button type="button" aria-label="Take this out of the log" onClick={() => void vigil.unlogFromSession(entry.id).then(() => chime('away'))}
                className="relative after:absolute after:-inset-1 after:rounded-full flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/entry:opacity-100 hover:text-foreground focus-visible:opacity-100">
                <XSmall className="size-3" />
              </button>
            </li>
          ))}
          {more > 0 && (
            <li>
              <button type="button" onClick={() => window.api.openInHome('task', focus.taskId)} className="h-[18px] text-[12px] text-muted-foreground hover:text-foreground">
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
          {/* On the bubble's own surface, as the time row is: no fill or box of its own, only a fine line under it while you type (or carry a file over). */}
          <label className={`flex h-8 items-center gap-1.5 border-b pr-1 transition-colors ${carried ? 'border-[var(--tt-brand-color-400)]' : 'border-transparent focus-within:border-border'}`}>
            <span className="relative min-w-0 flex-1">
              {!words && <span aria-hidden className="pointer-events-none absolute inset-0 truncate text-[13px] leading-[20px] text-muted-foreground">{carried ? 'Drop it into the log' : attached ? 'Say what it is, or just press Enter' : 'Add a thought'}</span>}
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
                  void keepFile(file, event.clipboardData.getData('text/plain'))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) (event.preventDefault(), void add())
                  if (event.key === 'Escape') (event.preventDefault(), collapse())
                }}
                className="block h-5 w-full bg-transparent text-[13px] outline-none"
              />
            </span>
            <Tip label="Take a selfie"><button type="button" data-take-selfie aria-label="Take a selfie" aria-pressed={selfie} onClick={() => (chime(selfie ? 'fold' : 'tap'), setDenied(false), setSelfie(!selfie))} className={`flex size-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-3.5 ${selfie ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}>
              <Camera />
            </button></Tip>
            <Tip label="Add a screenshot of this screen, without Vigil"><button type="button" aria-label="Add a screenshot" onClick={() => void shoot()} className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-3.5">
              <Screenshot />
            </button></Tip>
            {/* The keycap is the send button too: a click does what Enter does. */}
            <Tip label="Keep it in this session's log"><button type="button" data-island-send aria-label="Keep it in the log" onClick={(event) => (event.preventDefault(), void add(), field.current?.focus())}
              className={`flex h-6 shrink-0 items-center justify-center rounded-full px-0.5 transition-opacity hover:bg-accent ${words.trim() || attached ? 'opacity-100' : 'opacity-40'}`}>
              <Kbd>↵</Kbd>
            </button></Tip>
          </label>
          {attached && (
            <span data-island-attached className="mt-1.5 flex h-7 items-center gap-2 pl-1 text-[12px] text-muted-foreground">
              {attached.picture ? <img src={attached.url} alt="" className="h-7 w-10 shrink-0 rounded-[4px] border object-cover" /> : <Paperclip className="size-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{attached.name}</span>
              <button type="button" aria-label="Leave it out" onClick={() => (setAttached(null), chime('away'), field.current?.focus())} className="relative after:absolute after:-inset-0.5 after:rounded-full flex size-5 items-center justify-center rounded-full hover:bg-accent hover:text-foreground">
                <XSmall className="size-3" />
              </button>
            </span>
          )}
          {selfie && <Selfie onKeep={selfieKept} onClose={() => (setSelfie(false), field.current?.focus())} primary={PRIMARY} plain={button} />}
          {denied && (
            <span role="status" data-screen-denied className="mt-1.5 flex items-center gap-2 pl-1 text-[12px] leading-4 text-muted-foreground">
              <span className="min-w-0 flex-1"><b className="font-semibold text-foreground">{denied === 'asked' ? 'Allow Vigil in the window macOS opened' : 'Vigil can’t see the screen yet'}</b>{denied === 'asked' ? ', then try again.' : '. Paste or drop a picture instead.'}</span>
              <button type="button" onClick={() => window.api.privacySettings('screen')} className="shrink-0 rounded-full px-2 py-0.5 font-medium text-foreground hover:bg-accent">Open Privacy settings</button>
            </span>
          )}
        </div>
      )}
    </div>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [open, timeText, over, last, paused, timer, focus.id, focus.plannedMs, focus.taskId, focus.goal, entries, words, attached, carried, denied, selfie, halfway, onBreak, lastKept, overSaid, rounds, tucked, stopping, count, focus.startedAt, endMinute, held])

  return (
    // In pixels, not rem: the pill's window is a fixed 340 wide, and at Large
    // Interface size a rem-sized pill outgrew it and was cut off.
    <div className="mf-floating flex h-screen items-start justify-center overflow-hidden" style={{ paddingTop: top, ...(tucked ? NOTCH_INKS : {}), ...(onBreak ? (tucked ? { '--tt-brand-color-400': 'oklch(0.82 0.15 158)', '--pill-on-accent': 'oklch(0.22 0.05 170)' } as CSSProperties : breakInks(light, brutal)) : {}) }}>
      {/* While the session runs, a slow mono glow breathes inside the pill's
          edge: alive, never asking to be looked at. Still when paused or over,
          and between times: it runs for its first moments, under the pointer
          and in the last minute, since a beam all session kept a core busy. */}
      <motion.div
        ref={shell}
        className="relative"
        data-tucked={tucked || undefined}
        style={{ width: shape.box.w, height: shape.box.h, filter: LIFT }}
        initial={calm ? { opacity: 0 } : morph ? { opacity: 1, y: 0 } : tucked ? false : { y: -(CAPSULE.height + TOP + 4) }}
        animate={{ opacity: 1, y: 0 }}
        transition={calm ? { opacity: { duration: 0.2 }, default: { duration: 0 } } : { y: DROP, opacity: { duration: 0.12 } }}
      >
      {/* Its 1px edge: the same shape a pixel out, behind it, in the edge's colour over the pill's own. */}
      <motion.span aria-hidden className="pointer-events-none absolute -inset-px" style={{ clipPath: shape.edge, backgroundImage: `linear-gradient(${edgeInk}, ${edgeInk}), ${SOLID}`, backgroundColor: 'Canvas' }} />
      <motion.div data-island-frame className="absolute inset-0" style={{ clipPath: shape.clip }}>
      <div
        ref={island}
        data-arrived={arrived || undefined}
        data-gleams={gleam}
        data-island={stage === 'rest' ? (open ? 'open' : 'rest') : stage}
        data-break={onBreak || undefined}
        data-over={over || undefined}
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
        // Right-click: a quick switch for the ticking, the one Settings has too,
        // and, for a session, Abandon session (⌥-click on Stop does the same).
        onContextMenu={(event) => {
          event.preventDefault()
          const on = !!settings?.sessionTick
          void window.api.focusMenu(on, !timer, focus.plannedMs !== null, focus.kind === 'break', !timer && !over).then((picked) =>
            picked === 'notch' || picked === 'free' ? void vigil.setSettings({ pillSits: picked }).then(() => chime('tap')) : picked === 'abandon' ? abandon() : picked === 'early' ? end() : picked === 'extend' ? extend() : picked === 'end' ? void vigil.cancelSession(focus.id).then(() => glowEnd('cancel'))
              : picked === 'tick' && vigil.setSettings({ sessionTick: !on }).then(() => chime(on ? 'off' : 'on')))
        }}
        // Solid, whatever the theme: a glass theme's see-through colours let the
        // window behind show through the pill, lines and text and all.
        // Time up: an accent wash over the solid, so the pill says so from across the room.
        style={{ backgroundImage: `${over && !tucked ? `${TIMEUP_WASH}, ` : ''}${SOLID}`, backgroundColor: 'Canvas' }}
        className={`absolute inset-0 overflow-hidden ${tucked ? 'rounded-t-none rounded-b-[18px]' : 'rounded-[22px]'} font-[system-ui,-apple-system,sans-serif] text-[13px] text-foreground ${over && !tucked ? 'mf-timeup' : ''}`}
      >
        {onBreak && <style>{BREAK_CSS}</style>}
        {/* Under the notch the pill stays the notch's black; a break glows mint from its lower edge, breathing. */}
        {tucked && onBreak && (
          <span aria-hidden data-notch-break className="pointer-events-none absolute inset-x-[12%] bottom-0 h-[70%]"
            style={{ background: 'radial-gradient(60% 100% at 50% 100%, oklch(0.78 0.15 158 / 0.42), transparent 70%)', animation: alive && !paused ? 'mf-notch-breath 7s ease-in-out infinite' : undefined }} />
        )}

        {/* The capsule it drops in as: black, the island's own colour, fading to the theme's as it opens. */}
        {!calm && !morph && <motion.span aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-black" initial={{ opacity: 1 }} animate={{ opacity: shown ? 1 : 0 }} transition={{ duration: 0.32, delay: shown ? 0 : 0.08 }} />}
        {/* A break: its own opaque material, faded over the work one (and back) so the pill morphs rather than swaps. */}
        <AnimatePresence>
          {onBreak && !tucked && (
            <motion.span key="break" aria-hidden className="pointer-events-none absolute inset-0" style={{ borderRadius: 'inherit' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: calm ? 0.15 : 0.6, ease: [0.23, 1, 0.32, 1] }}>
              <BreakSurface light={light} brutal={brutal} moving={alive && !paused} />
              {over && <span className="absolute inset-0" style={{ backgroundImage: TIMEUP_WASH }} />}
            </motion.span>
          )}
        </AnimatePresence>
        {/* At rest, the smoke is a few soft wisps drifting on the compositor:
            the beam's own loop restyles thirty times a second, too much to
            run all session, so it takes over only under the pointer, in the
            first and last moments, and past the time. */}
        {alive && !paused && !tucked && !onBreak && settings?.sessionSmoke !== false && <Wisps light={light} />}
        {gleam > 0 && <Gleam key={gleam} light={light} />}
        <motion.div
          ref={setInner}
          className="absolute top-0 left-1/2 w-[322px] -translate-x-1/2"
          animate={{ opacity: shown ? 0 : 1 }}
          transition={{ duration: calm ? 0 : 0.18, delay: shown || calm ? 0 : 0.1 }}
        >
          {/* Under the notch: the ring and rounds in the left wing, the time in the right, the notch clear between. */}
          {tucked && (
            <div data-notch-band className="flex items-center justify-between px-[14px]" style={{ height: notch }}>
              <span className="flex items-center gap-1.5">
                {onBreak ? <BreakRing key={arrived} share={over ? 1 : share} paused={paused} moving={alive} pop={arrived > 0 && !calm} /> : <Ring share={over ? 1 : share} over={over} paused={paused} quiet={open && over} />}
                {rounds && rounds.rounds > 1 && <RoundDots at={rounds} />}
              </span>
              {/* At rest the wing says it in the accent; open, the button below does, so the wing is plain. */}
              <span className={`flex items-center text-[12px] font-semibold ${(over || last) && !open ? 'text-[var(--tt-brand-color-400)]' : paused || (over && open) ? 'text-muted-foreground' : ''}`}>
                {over ? 'Up' : <DotMatrix text={clock(leftShown ?? done)} className="h-[12px]" />}
              </span>
            </div>
          )}
          {/* Under the notch, the wings are the header: no second row repeating the ring. */}
          {!tucked && <div className="flex h-[42px] items-center gap-2.5 pr-1.5 pl-2">
            {onBreak ? <BreakRing key={arrived} share={over ? 1 : share} paused={paused} moving={alive} pop={arrived > 0 && !calm} /> : <Ring share={over ? 1 : share} over={over} paused={paused} />}
            {/* The goal: a click opens its task. */}
            <button
              type="button"
              onClick={() => !timer && window.api.openInHome('task', focus.taskId)}
              className={`min-w-0 flex-1 truncate text-left font-medium tracking-[-0.005em] outline-none ${timer ? 'cursor-default' : ''}`}
            >
              {onBreak ? <BreakLine first={resting && rounds!.phase === 'long' ? 'Long break' : over ? 'Back to it?' : 'Off the clock for a bit'} still={calm || over || paused} /> : focus.goal || (timer ? 'Timer' : 'Focus')}
            </button>
            {/* A dot a round: done ones filled, this one ringed, the rest to come. */}
            {rounds && rounds.rounds > 1 && <RoundDots at={rounds} />}
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
            {/* Nearly up, or up: the answer most wanted sits right on the pill, no need to open it.
                A break over offers to go again; a session or a timer, ten more minutes. */}
            {!open && count === null && (over && held ? (
              <Tip label="Start the next round"><button type="button" data-rounds-on-chip onClick={roundOn} className={CHIP_PRIMARY}>Go again</button></Tip>
            ) : over && focus.kind === 'break' && lastKept ? (
              <Tip label={`Start “${lastKept.goal}” again`}><button type="button" data-again-chip onClick={again} className={CHIP_PRIMARY}>Go again</button></Tip>
            ) : (last || over) && focus.plannedMs !== null ? (
              <Tip label="Ten more minutes  ⌃⌥⌘="><button type="button" data-more-chip onClick={extend} className={CHIP}>+10 min</button></Tip>
            ) : null)}
            <span
              aria-live="off"
              aria-hidden={open}
              className={`flex shrink-0 items-center gap-1.5 pr-1 text-[13px] whitespace-nowrap font-semibold transition-opacity duration-150 ${open ? 'opacity-0' : 'opacity-100'} ${over || last ? 'text-[var(--tt-brand-color-400)]' : paused ? 'text-muted-foreground' : ''}`}
            >
              {/* The time on a clock's dot grid, the one figure in the app that ticks. */}
              {count !== null ? <span data-count-in className="flex items-center gap-1.5"><span className="font-medium text-muted-foreground">Starting in</span><DotMatrix text={String(Math.max(1, count))} className="h-[13px]" /></span> : over ? (onBreak ? '' : "Time's up") : <>{paused && 'Paused ·'}<DotMatrix text={clock(leftShown ?? done)} className="h-[13px]" /></>}
            </span>
            {/* The one place that moves the window, as Raycast's grip does: faint until you reach for it. */}
            {(
              <span aria-hidden className={`-ml-1 flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground transition-opacity duration-150 ${hover ? 'opacity-70' : 'opacity-25'}`} style={DRAG}>
                <Grip className="size-3.5" />
              </span>
            )}
          </div>}

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
      {!tucked && <BorderBeam size="pulse-inner" colorVariant="mono" strength={over && !hover ? 0.3 : 0.4} css={SMOKE_EASE} brightness={light ? 0.5 : undefined} style={light ? ({ '--beam-stroke-opacity': 9, '--beam-inner-opacity': 0.75 } as CSSProperties) : undefined} duration={3.4} theme={surface} borderRadius={22} active={alive && !paused && stage === 'rest' && (hover || done < 8000 || last || (over && settings?.sessionSmoke !== false))} className="pointer-events-none absolute inset-0">
        <div className="h-full w-full rounded-[22px]" />
      </BorderBeam>}
      </motion.div>
      </motion.div>
    </div>
  )
}

/**
 * After a session, the island stays one surface: from whatever shape it was
 * (open, or the pill) its height springs down to a band on the island's own
 * spring, while what it says crossfades: How did it go, then Where do you
 * pick up, or Session abandoned. At the end it folds back up into the capsule
 * it dropped in as (into the notch, under one), and only then does its window
 * go. With Motion off or Reduce motion, each change is a short fade.
 */
function After({ stage, id, notch, onDone, away = null, early = false, onBack }: { stage: 'ask' | 'pickup' | 'abandoned' | 'away' | 'bye'; id: string; notch: number; onDone: () => void; away?: Away | null; /** Ended before its time: Keep going is offered. */ early?: boolean; /** The session is running again: the band gives way to the pill. */ onBack?: () => void }): React.JSX.Element {
  const calm = useRef(still()).current
  const tucked = notch > 0
  const top = tucked ? 0 : TOP
  // Under the notch the band hangs from it, as the pill does: the notch's own black above the line.
  // Said after the Mac slept, it takes two lines: when it slept, then what became of the session.
  const line = stage === 'away' && away?.sleptAt ? SLEPT_BAND : REST
  const band = tucked ? notch + line : line
  // The island it was, read once: the shape it starts from.
  const from = useRef({ ...lastShape }).current
  // And what the next pill grows from, if Go again starts one from this band.
  lastShape.height = band
  lastShape.over = false
  const [leaving, setLeaving] = useState(stage === 'bye')
  useEffect(() => void setLeaving(stage === 'bye'), [stage])
  // Leaving: the fold plays, then the window goes.
  useEffect(() => {
    if (!leaving) return
    const gone = setTimeout(onDone, calm ? 200 : 420)
    return () => clearTimeout(gone)
  }, [leaving]) // eslint-disable-line react-hooks/exhaustive-deps
  // A stage that is over: How did it go hands on to Pick up; the others fold away.
  const next = (): void => (stage === 'ask' ? onDone() : setLeaving(true))
  // The window: grown at once if the band needs more, shrunk only once the spring has settled.
  useEffect(() => {
    const later = setTimeout(() => void window.api.focusSize(top + band + BELOW), calm || band >= from.height ? 0 : 650)
    return () => clearTimeout(later)
  }, [top, band]) // eslint-disable-line react-hooks/exhaustive-deps
  const fold = tucked ? { w: NOTCH_WIDTH, h: notch } : { w: CAPSULE.width, h: CAPSULE.height }
  const [startShape] = useState<Shape>(() => ({ w: WIDE, h: calm ? band : Math.max(from.height, tucked ? notch : 0) }))
  const shape = useShape(startShape, leaving && !calm ? fold : { w: WIDE, h: band }, { w: calm ? { duration: 0 } : SPRING, h: calm ? { duration: 0 } : SPRING }, tucked)
  return (
    <div className="mf-floating flex h-screen items-start justify-center overflow-hidden" style={{ paddingTop: top, ...(tucked ? NOTCH_INKS : {}) }}>
      <motion.div
        className="relative"
        style={{ width: shape.box.w, height: shape.box.h, filter: LIFT }}
        initial={calm ? { opacity: 0 } : { opacity: 1 }}
        animate={leaving ? (calm ? { opacity: 0 } : { y: tucked ? 0 : -(CAPSULE.height + TOP + 4), opacity: tucked ? 0 : 1 }) : { opacity: 1, y: 0 }}
        transition={calm ? { duration: 0.18 } : leaving ? { y: DROP, opacity: { duration: 0.3, delay: 0.1 } } : { y: SPRING, opacity: { duration: 0.12 } }}
      >
      <motion.span aria-hidden className="pointer-events-none absolute -inset-px" style={{ clipPath: shape.edge, backgroundImage: `linear-gradient(var(--border), var(--border)), ${SOLID}`, backgroundColor: 'Canvas' }} />
      <motion.div
        data-island-frame
        data-after={leaving ? 'leaving' : stage}
        style={{ clipPath: shape.clip, backgroundImage: SOLID, backgroundColor: 'Canvas' }}
        className={`absolute inset-0 overflow-hidden ${tucked ? 'rounded-t-none rounded-b-[18px]' : 'rounded-[22px]'} font-[system-ui,-apple-system,sans-serif] text-[13px] text-foreground`}
      >
        {/* Time's up was an accent wash: it fades off rather than snapping. */}
        {from.over && <motion.span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: TIMEUP_WASH }} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: calm ? 0 : 0.5 }} />}
        {/* Folding up, it goes back to the capsule's black, as it dropped in. */}
        {!calm && !tucked && <motion.span aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-black" initial={{ opacity: 0 }} animate={{ opacity: leaving ? 1 : 0 }} transition={{ duration: 0.26 }} />}
        <AnimatePresence initial={!calm}>
          {!leaving && (
            <motion.div
              key={stage}
              className="absolute inset-x-0 flex items-center gap-2.5 pr-1.5 pl-2"
              style={{ top: tucked ? notch : 0, height: line }}
              initial={{ opacity: 0, y: calm ? 0 : 4 }}
              animate={{ opacity: 1, y: 0, transition: { duration: calm ? 0.15 : 0.22, delay: calm ? 0 : 0.09, ease: [0.23, 1, 0.32, 1] } }}
              exit={{ opacity: 0, y: calm ? 0 : -4, transition: { duration: calm ? 0.1 : 0.14 } }}
            >
              {stage === 'ask' ? <HowDidItGo id={id} onDone={next} early={early} onBack={onBack} /> : stage === 'pickup' ? <PickUp id={id} onDone={next} /> : stage === 'abandoned' ? <Abandoned id={id} onDone={next} /> : stage === 'away' && away ? <AwayBand away={away} onDone={next} /> : null}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      </motion.div>
    </div>
  )
}

/** The band's height when it says what the Mac's sleep did: two lines. */
const SLEPT_BAND = 92

/** A small answer on the pill at rest: “+10 min”, or “Go again” filled. */
const CHIP = 'flex h-6 shrink-0 items-center rounded-full bg-accent px-2 text-[12px] font-semibold text-foreground tabular-nums transition-[filter,background-color] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-[var(--tt-brand-color-400)]'
const CHIP_PRIMARY = 'flex h-6 shrink-0 items-center rounded-full bg-[var(--tt-brand-color-400)] px-2.5 text-[12px] font-semibold mf-on-accent transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tt-brand-color-400)]'
/** The one answer a band or Time's up hopes for: filled with the accent. */
const PRIMARY = 'flex h-7 shrink-0 items-center rounded-full bg-[var(--tt-brand-color-400)] px-3 text-[12px] font-semibold mf-on-accent transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tt-brand-color-400)]'
const ICON_BUTTON = 'flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--tt-brand-color-400)]'
const WORD_BUTTON = 'flex h-7 shrink-0 items-center rounded-full px-3 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--tt-brand-color-400)]'

/**
 * "How did it go?": just after a session ends, one line whose answer is the
 * session's recap, kept in the task's log. Never in the way: Escape or the
 * cross skips it, and left alone it lets itself go. Kept, it says so with a
 * way back, then goes.
 */
function HowDidItGo({ id, onDone, early = false, onBack }: { id: string; onDone: () => void; early?: boolean; onBack?: () => void }): React.JSX.Element {
  const [words, setWords] = useState('')
  const [kept, setKept] = useState<string | null>(null)
  // Untouched for a minute, it is skipped; once kept, it says so for a few
  // seconds, waiting while the pointer rests on it or the bubble is hidden.
  const wait = usePatience(kept === null ? 60_000 : 4_000, onDone, !(words && kept === null))
  const skip = (): void => (chime('fold'), onDone())
  const keep = (): void => {
    if (!words.trim()) return skip()
    void vigil.recapSession(id, words.trim()).then((was) => (chime('logged'), setKept(was)))
  }
  return (
    <>
      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--tt-brand-color-400)] mf-on-accent">
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
          {/* Ended early: Keep going puts the same session back for the time it had left (the undo of ending it).
              Ended at its time: Go again, the same session over, same task and length. The recap, if typed, kept first. */}
          {early
            ? <KeepGoing id={id} onBack={onBack} before={() => (words.trim() ? vigil.recapSession(id, words.trim()).then(() => undefined) : Promise.resolve())} />
            : <GoAgain before={() => (words.trim() ? vigil.recapSession(id, words.trim()).then(() => undefined) : Promise.resolve())} />}
          <Tip label="Skip: no recap"><button type="button" aria-label="Skip" onClick={skip} className={ICON_BUTTON}>
            <X className="size-3.5" />
          </button></Tip>
        </>
      ) : (
        <span data-kept-recap {...wait} className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="min-w-0 flex-1 truncate font-medium"><Typed text="Saved in the task’s log" step={35} delay={0} /></span>
          <button type="button" onClick={() => void vigil.recapSession(id, kept).then(() => (chime('undo'), onDone()))} className={WORD_BUTTON}>
            Undo
          </button>
        </span>
      )}
    </>
  )
}

/** Keep going, after ending early: the same session running again, the time since it ended not counted. */
function KeepGoing({ id, before, onBack }: { id: string; before: () => Promise<void>; onBack?: () => void }): React.JSX.Element {
  const go = (): void => void before().then(() => {
    morphNext = !still()
    return vigil.unendSession(id)
  }).then((back) => (back ? (chime('back'), onBack?.(), window.api.showFocus(true)) : (morphNext = false, chime('nope'))))
  return (
    <Tip label="Undo ending it: the session runs again for the time it had left"><button type="button" data-keep-going onClick={go} className={`${WORD_BUTTON} text-foreground`}>
      Keep going
    </button></Tip>
  )
}

/**
 * Go again, in a band after a session: starts the last session kept over
 * (same task, same length), and the pill grows out of the band rather than
 * dropping in. Shown only when there is one to go again.
 */
function GoAgain({ before, primary = false }: { before?: () => Promise<void>; primary?: boolean }): React.JSX.Element | null {
  const last = useLive(vigil.lastSession, null as Awaited<ReturnType<typeof vigil.lastSession>>)
  if (!last) return null
  const go = (): void => void (before?.() ?? Promise.resolve()).then(() => {
    morphNext = !still()
    return vigil.againSession()
  }).then((started) => (started ? (chime('anew'), window.api.showFocus(true)) : (morphNext = false, chime('nope'))))
  return (
    <Tip label={`Start “${last.goal}” again${last.plannedMs ? `, ${lengthSaid(last.plannedMs)}` : ''}`}><button type="button" data-again onClick={go} className={primary ? PRIMARY : `${WORD_BUTTON} text-foreground`}>
      Go again
    </button></Tip>
  )
}

/**
 * Ended while you were away: the Mac slept, or nobody touched it for a long
 * while, so the session was ended at the time it should have been (its
 * planned end, or when you left) and the hours of nothing were not counted.
 * Said once you are back, with Go again; after a long idle, which may have
 * been reading on paper, “Keep going” puts it back running as it was.
 */
function AwayBand({ away, onDone }: { away: Away; onDone: () => void }): React.JSX.Element {
  useEffect(() => {
    chime('hint')
    const gone = setTimeout(onDone, 10 * 60_000)
    return () => clearTimeout(gone)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const what = away.kind === 'break' ? 'Your break' : away.timer ? 'Your timer' : 'Your session'
  const keep = (): void => void vigil.unawaySession(away.id).then((back) => (back ? chime('back') : (chime('nope'), onDone())))
  // Ended by the Mac's sleep, as Settings says: when it slept, on a line of its own, then what that did.
  if (away.sleptAt) return (
    <span data-away data-slept={away.choice} role="status" className="flex min-w-0 flex-1 flex-col gap-2 pl-1.5">
      {/* Cut short in a narrow bubble, the whole of it on hover. */}
      <Tip label={sleptSaid(away).join(', ')}>
        <span className="min-w-0 pt-0.5 pr-1 leading-[18px]">
          <span data-slept-at className="block truncate font-semibold">{sleptSaid(away)[0]},</span>
          <span data-slept-did className="block truncate">{sleptSaid(away)[1]}</span>
        </span>
      </Tip>
      <span className="flex items-center justify-between">
        {away.kind === 'break' || !away.timer ? <GoAgain primary /> : <span />}
        <button type="button" aria-label="Close" onClick={() => (chime('fold'), onDone())} className={ICON_BUTTON}>
          <X className="size-3.5" />
        </button>
      </span>
    </span>
  )
  return (
    <span data-away role="status" className="flex min-w-0 flex-1 items-center gap-2 pl-1.5">
      <Tip label={`${what} ended at ${clockTime(away.endedAt)}, while you were ${away.how === 'asleep' ? 'away (the Mac was asleep)' : 'away'}`}>
        <span className="min-w-0 flex-1 truncate font-medium">
          Ended at {clockTime(away.endedAt)}<span className="font-normal text-muted-foreground">, while you were away</span>
        </span>
      </Tip>
      {!away.timer && away.how === 'idle' && <Tip label="I was still at it: keep it running as it was"><button type="button" onClick={keep} className={WORD_BUTTON}>Keep going</button></Tip>}
      {away.kind === 'break' || !away.timer ? <GoAgain primary /> : null}
      <button type="button" aria-label="Close" onClick={() => (chime('fold'), onDone())} className={ICON_BUTTON}>
        <X className="size-3.5" />
      </button>
    </span>
  )
}

/**
 * A session just abandoned: the band says so, with Undo, for a few seconds,
 * then folds away. Undo puts it back running.
 */
function Abandoned({ id, onDone }: { id: string; onDone: () => void }): React.JSX.Element {
  // Five seconds, but never while the pointer rests on it or the bubble is hidden.
  const wait = usePatience(5000, onDone)
  const undo = (): void => void vigil.unabandonSession(id).then((back) => (back ? chime('back') : (chime('nope'), onDone())))
  return (
    <span data-abandoned role="status" {...wait} className="flex min-w-0 flex-1 items-center gap-2.5 pl-1.5">
      <span className="min-w-0 flex-1 truncate font-medium">Session abandoned<span className="font-normal text-muted-foreground">, not counted</span></span>
      <button type="button" onClick={undo} className={`${WORD_BUTTON} text-foreground`}>Undo</button>
    </span>
  )
}

/**
 * "Where do you pick up?": the line after How did it go, Hemingway's trick of
 * stopping mid-sentence. Kept on the task, it greets you when the task next
 * opens. Escape or the cross skips it; left alone for a minute it goes.
 */
function PickUp({ id, onDone }: { id: string; onDone: () => void }): React.JSX.Element {
  const [words, setWords] = useState('')
  useEffect(() => {
    if (words) return
    const gone = setTimeout(onDone, 60_000)
    return () => clearTimeout(gone)
  }, [words]) // eslint-disable-line react-hooks/exhaustive-deps
  const skip = (): void => (chime('fold'), onDone())
  const keep = (): void => {
    if (!words.trim()) return skip()
    void vigil.pickUp(id, words.trim()).then(() => (chime('logged'), onDone()))
  }
  return (
    <span data-pickup className="flex min-w-0 flex-1 items-center gap-2.5 pl-1.5">
      <label className="relative min-w-0 flex-1">
        {!words && <span aria-hidden className="pointer-events-none absolute inset-0 truncate text-muted-foreground"><Typed text="Where do you pick up next time?" step={40} delay={200} /></span>}
        <input autoFocus value={words} aria-label="Where do you pick up next time?" onChange={(event) => setWords(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.preventDefault(), keep())
            if (event.key === 'Escape') (event.preventDefault(), skip())
          }}
          className="w-full bg-transparent font-medium outline-none" />
      </label>
      <button type="button" aria-label="Skip" onClick={skip} className={ICON_BUTTON}>
        <X className="size-3.5" />
      </button>
    </span>
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
export function Wisps({ light }: { light: boolean }): React.JSX.Element {
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
export const SMOKE_EASE = `@property --beam-strength { syntax: '<number>'; inherits: true; initial-value: 1; }
[data-beam="{id}"] { transition: --beam-strength 320ms cubic-bezier(0.16, 1, 0.3, 1); }`

/**
 * One gleam across the pill, like light sliding over glossy glass: a wide
 * soft band, angled, with a feathered falloff and a faint glint trailing it,
 * eased across in 1.25s on transform alone and clipped to the pill. The top
 * edge's sheen brightens as it passes. Screened onto a dark pill; on a light
 * one, laid on plainly with a soft shadow leading it. Brutal wears a flat, hard-edged band instead.
 * With Motion off or reduced motion, one soft glow that comes and goes.
 */
export function Gleam({ light }: { light: boolean }): React.JSX.Element {
  const band = useRef<HTMLSpanElement>(null)
  const sheen = useRef<HTMLSpanElement>(null)
  const calm = still()
  const brutal = document.documentElement.dataset.style === 'brutal'
  useEffect(() => {
    const runs: Animation[] = []
    if (calm) {
      if (band.current) runs.push(band.current.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: 'ease-in-out' }))
    } else {
      const timing = { duration: 1250, easing: brutal ? 'cubic-bezier(0.65, 0, 0.35, 1)' : 'cubic-bezier(0.45, 0, 0.55, 1)' }
      // The band is 60% of the pill wide: from wholly off the left to wholly off the right.
      if (band.current) runs.push(band.current.animate([{ transform: 'translateX(-100%) skewX(-20deg)' }, { transform: 'translateX(175%) skewX(-20deg)' }], timing))
      if (sheen.current && !brutal) runs.push(sheen.current.animate([{ opacity: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.85 }, { opacity: 0 }], timing))
    }
    return () => runs.forEach((run) => run.cancel())
  }, [calm, brutal])
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
      {calm ? (
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

/** One dot a round of a pomodoro set: what is done filled, this round ringed (filled on its break), the rest hollow. */
function RoundDots({ at }: { at: RoundsAt }): React.JSX.Element {
  return (
    <span data-round-dots role="img" aria-label={`Round ${at.round} of ${at.rounds}${at.phase === 'work' ? '' : ', on a break'}`} className="flex shrink-0 items-center gap-[3px]">
      {Array.from({ length: at.rounds }, (_, index) => {
        const n = index + 1
        const done = n < at.round || (n === at.round && at.phase !== 'work')
        const now = n === at.round && at.phase === 'work'
        return (
          <span key={n} className="block size-[6px] rounded-full"
            style={{
              background: done ? 'var(--tt-brand-color-400)' : 'transparent',
              border: `1.25px solid ${done || now ? 'var(--tt-brand-color-400)' : 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)'}`
            }} />
        )
      })}
    </span>
  )
}

/**
 * The session as a ring: the track is the whole length, the arc how much of
 * it has gone. Open-ended sessions have no length, so they show a steady dot.
 */
export function Ring({ share, over, paused, quiet = false }: { share: number | null; over: boolean; paused: boolean; /** In the ink, not the accent: the accent is for something else here. */ quiet?: boolean }): React.JSX.Element {
  const r = 8
  const around = 2 * Math.PI * r
  // The pill's one colour: the accent while the time runs, grey while it waits.
  const tone = quiet || (paused && !over) ? 'var(--foreground)' : 'var(--tt-brand-color-400)'
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

/**
 * A break's material: one opaque fill of its own (no blur, nothing behind
 * showing through), with a soft light that breathes in and out about as slowly
 * as you should, and now and then a gentle shimmer across it. Brutal wears it
 * flat, with a hard-edged band stepping across instead. Still with Motion off,
 * Reduce motion, or the pill paused or hidden.
 */
const BREAK_CSS = `@keyframes mf-break-breath { 0%, 100% { transform: translateX(-8%) scale(.86); opacity: .55 } 50% { transform: translateX(14%) scale(1.12); opacity: 1 } }
@keyframes mf-break-shimmer { 0% { transform: translateX(-140%) skewX(-18deg) } 22%, 100% { transform: translateX(330%) skewX(-18deg) } }
@keyframes mf-steam { 0% { transform: translateY(1.2px); opacity: 0 } 35% { opacity: .9 } 100% { transform: translateY(-1.8px); opacity: 0 } }
@keyframes mf-break-line { from { opacity: 0; transform: translateY(5px) } to { opacity: 1; transform: none } }
@keyframes mf-cup-pop { 0% { transform: scale(.2) translateY(2px); opacity: 0 } 55% { transform: scale(1.22); opacity: 1 } 80% { transform: scale(.94) } 100% { transform: none } }
@keyframes mf-spark { 0% { transform: translate(0, 0) scale(.4); opacity: 0 } 10% { opacity: 1 } 70% { opacity: 1 } 100% { transform: translate(var(--dx), var(--dy)) scale(.9) rotate(var(--turn)); opacity: 0 } }
@keyframes mf-notch-breath { 0%, 100% { opacity: .55; transform: scaleX(.9) } 50% { opacity: 1; transform: scaleX(1.06) } }`
export function BreakSurface({ light, brutal, moving }: { light: boolean; brutal: boolean; moving: boolean }): React.JSX.Element {
  const glow = light ? 'rgb(255 255 255 / 0.75)' : 'oklch(0.75 0.12 160 / 0.28)'
  const sweep = brutal
    ? `linear-gradient(90deg, transparent 30%, ${light ? 'rgb(255 255 255 / 0.7)' : 'rgb(255 255 255 / 0.22)'} 30%, ${light ? 'rgb(255 255 255 / 0.7)' : 'rgb(255 255 255 / 0.22)'} 58%, transparent 58%)`
    : `linear-gradient(90deg, transparent, ${light ? 'rgb(255 255 255 / 0.55)' : 'rgb(255 255 255 / 0.12)'} 50%, transparent)`
  return (
    <span data-break-surface className="absolute inset-0 overflow-hidden" style={{ background: breakFill(light, brutal), borderRadius: 'inherit' }}>
      {!brutal && (
        <span className="absolute" style={{
          left: '-5%', top: '-40%', width: '70%', height: 120, background: `radial-gradient(closest-side, ${glow}, transparent)`,
          animation: moving ? 'mf-break-breath 7s ease-in-out infinite' : undefined, opacity: moving ? undefined : 0.7, willChange: moving ? 'transform, opacity' : undefined
        }} />
      )}
      {moving && (
        <span className="absolute -inset-y-2 left-0 w-[40%]" style={{
          background: sweep, transform: 'translateX(-140%) skewX(-18deg)',
          animation: `mf-break-shimmer 9s ${brutal ? 'steps(8, end)' : 'cubic-bezier(0.45, 0, 0.55, 1)'} 1.5s infinite`, willChange: 'transform'
        }} />
      )}
    </span>
  )
}

/** A break's ring: the break so far around a small cup, its steam curling up while the break runs. */
export function BreakRing({ share, paused, moving, pop = false }: { share: number | null; paused: boolean; moving: boolean; /** Pops in, as a break arrives. */ pop?: boolean }): React.JSX.Element {
  const r = 9.5
  const around = 2 * Math.PI * r
  const steam = (delay: number): CSSProperties => (moving && !paused ? { animation: `mf-steam 2.6s ease-in-out ${delay}s infinite`, transformBox: 'fill-box' } : { opacity: 0.6 })
  return (
    <svg data-break-ring viewBox="0 0 22 22" className="size-[22px] shrink-0 overflow-visible" aria-hidden>
      <circle cx="11" cy="11" r={r} fill="none" stroke="var(--border)" strokeWidth="1.75" />
      {share !== null && (
        <circle cx="11" cy="11" r={r} fill="none" stroke="var(--tt-brand-color-400)" strokeWidth="1.75" strokeLinecap="round" transform="rotate(-90 11 11)"
          strokeDasharray={around} strokeDashoffset={around * (1 - share)} opacity={paused ? 0.45 : 1} />
      )}
      <g style={pop ? { animation: 'mf-cup-pop 560ms cubic-bezier(0.34, 1.56, 0.64, 1) 160ms both', transformBox: 'fill-box', transformOrigin: '50% 80%' } : undefined}>
      <g fill="none" stroke="var(--tt-brand-color-400)" strokeWidth="1.1" strokeLinecap="round">
        <path d="M9 9.1c-.6-.65.6-1.15 0-1.8" style={steam(0)} />
        <path d="M11.7 9.1c-.6-.65.6-1.15 0-1.8" style={steam(1.3)} />
      </g>
      <path d="M6.5 10.4h7.6v2.9a3 3 0 0 1-3 3H9.5a3 3 0 0 1-3-3Z" fill="var(--tt-brand-color-400)" />
      <path d="M14.1 11.3h.75a1.45 1.45 0 0 1 0 2.9h-.85" fill="none" stroke="var(--tt-brand-color-400)" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/**
 * What a break says in place of a goal: its first words, then every nine
 * seconds another short line, each rising in as the last goes. One line a
 * break picks up where the last left off, so the hundredth break does not
 * open on the same three. Still (Motion off, paused, or over): the first words only.
 */
let lineAt = 0
export function BreakLine({ first, still }: { first: string; still: boolean }): React.JSX.Element {
  const [line, setLine] = useState<string>(first)
  useEffect(() => {
    setLine(first)
    if (still) return
    const next = (): void => {
      lineAt = (lineAt % (BREAK_LINES.length - 1)) + 1
      setLine(BREAK_LINES[lineAt])
    }
    let turn: ReturnType<typeof setInterval> | undefined
    const soon = setTimeout(() => (next(), (turn = setInterval(next, 8000))), 4500)
    return () => (clearTimeout(soon), clearInterval(turn))
  }, [first, still])
  return <span key={line} data-break-line className="block truncate" style={still ? undefined : { animation: 'mf-break-line 420ms cubic-bezier(0.23, 1, 0.32, 1)' }}>{line}</span>
}

/**
 * A break's arrival: a dozen small sparks out of the ring, mint and warm
 * light, a few of them tiny stars, flying out and fading in under a second.
 * Played once, then gone; never with Motion off.
 */
const SPARK_INKS = ['oklch(0.72 0.15 160)', 'oklch(0.82 0.16 80)', 'oklch(0.7 0.17 25)', 'oklch(0.68 0.14 250)']
export function Sparks({ x, y }: { x: number; y: number }): React.JSX.Element | null {
  const [gone, setGone] = useState(false)
  useEffect(() => {
    const done = setTimeout(() => setGone(true), 1400)
    return () => clearTimeout(done)
  }, [])
  if (gone) return null
  return (
    <span aria-hidden data-sparks className="pointer-events-none absolute z-20" style={{ left: x, top: y }}>
      {Array.from({ length: 22 }, (_, index) => {
        const angle = (index / 22) * Math.PI * 2 + (index % 2 ? 0.22 : -0.12)
        const reach = 46 + (index % 4) * 22
        const star = index % 3 === 0
        return (
          <span key={index} className="absolute block" style={{
            left: star ? -8 : -4, top: star ? -8 : -4, width: star ? 16 : 8, height: star ? 16 : 8,
            borderRadius: star ? 0 : 999, background: SPARK_INKS[index % SPARK_INKS.length],
            clipPath: star ? 'polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)' : undefined,
            ['--dx' as string]: `${Math.cos(angle) * reach * 1.25}px`, ['--dy' as string]: `${Math.sin(angle) * reach}px`, ['--turn' as string]: `${star ? 120 : 0}deg`,
            boxShadow: star ? undefined : '0 0 6px 1px color-mix(in oklab, currentColor 40%, transparent)', color: SPARK_INKS[index % SPARK_INKS.length],
            animation: `mf-spark ${900 + (index % 3) * 120}ms cubic-bezier(0.16, 1, 0.3, 1) ${(index % 4) * 30}ms both`
          } as CSSProperties} />
        )
      })}
    </span>
  )
}
