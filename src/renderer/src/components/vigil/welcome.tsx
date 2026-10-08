import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, CalendarDays, CornerDownLeft } from 'lucide-react'
import { EASE, byKeys, hush, shift, speak } from '@/lib/motion'
import { chime, click } from '@/lib/sound'
import { applyTheme, type Theme } from '@/lib/theme'
import { comboOf, keyFor, listen, saveKeys, useKeyChanges } from '@/lib/keys'
import { onboarding, type Onboarding } from '@/lib/onboarding'
import { enterSandbox } from '@/lib/sandbox'
import { STARTERS, fillBox, tellBox, type Starter } from '@/lib/welcome-box'
import keycapsUrl from '@/assets/welcome/keycaps.webp'
import { captureEntry, type CaptureMeta } from '@/components/capture-list'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { NoteList } from './note-list'
import { dayjs, when, whenInLine } from '../../../../main/dates'
import { readTask } from '../../../../main/task-words'
import { Scenery } from './scenery'
import { NOISE } from './grain'
import { MemoryPostcard } from './memory-postcard'
import { Signed } from './signature'
import { inkPath } from './marks'
import { ThemeDial } from './theme-dial'
import { Flip } from './review-view'
import { Kbd, toast } from './ui'
import { FULL_TURN, WANDER, glyph, inClay, konami, landedAside } from './welcome-eggs'

/**
 * The welcome: six screens over the whole main window, the first time
 * Vigil opens (and again from the Vigil menu, ⌘K or Settings).
 *
 *   0 hello: today's date and hour, a line typed, and the year as a ruler.
 *     Someone new sees only today on it ("your year starts today"); someone
 *     with notes sees the days they kept something stand taller. Today's mark
 *     rises with each thing caught in the welcome.
 *   1 the one key: the caps press as the real keys go down, anywhere
 *   2 catch three: three things of different kinds, in the real box, with
 *     starters to click or type. As each lands, its kind is named and what
 *     that kind does is shown: a todo in your tasks with the day it read, a
 *     quote as next year's postcard, a word as a card that turns over, a
 *     link with its page's name. One is enough to move on.
 *   3 a year of it: the day just had, then an example year read back
 *   4 make it yours: the theme dial
 *   5 how to start: fresh, the sandbox, or your notes
 *
 * Esc always works: before the last screen it goes to it (never into an
 * empty app), and on it, it closes. Keys swap screens at once; a click
 * swaps them with a short rise. Only the app's own answers move: your
 * capture landing, the caps under your fingers.
 */

const SCREENS = 6
/** The screen that asks for three things. */
const CATCH = 2
/** The theme dial's screen. */
const DIAL = 4
const LAST = SCREENS - 1
const MODS: Record<string, string> = { '⌘': 'Meta', '⌥': 'Alt', '⌃': 'Control', '⇧': 'Shift' }
const capsOf = (keys: string): string[] => keys.match(/[⌃⌥⇧⌘]|[^⌃⌥⇧⌘]+/g) ?? []
/** The window's size, kept fresh: the keycaps and the dial are sized to it. */
function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  useEffect(() => {
    const on = (): void => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return size
}
const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The first line, about your week rather than about the app: most of what
 * you notice is gone within a few days, so it names the day that will be.
 */
const firstLine = (): string => `Most of what you notice today will be gone by ${dayjs().add(3, 'day').format('dddd')}.`

/** The moment the welcome opened, as a diary dates an entry: the day, then the hour in your Mac's own style. */
const dateline = (): string => `${dayjs().format('dddd D MMMM')}, ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`

/** What was typed into Vigil since the welcome opened, oldest first. */
const since = (list: CaptureMeta[], before: Set<string>): CaptureMeta[] =>
  list.filter((one) => !before.has(one.id) && !one.source).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))

/** The kinds caught, each once, in the order they were first caught. */
const kindsOf = (list: CaptureMeta[]): string[] => [...new Set(list.map((one) => one.kind))]

/** A kind as the box names it, with its icon and colour. */
const typeOf = (kind: string): (typeof CAPTURE_TYPES)[number] => CAPTURE_TYPES.find((type) => type.id === kind) ?? CAPTURE_TYPES[0]

/** A count in words, as a sentence says it. */
const counted = (n: number): string => ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][n] ?? String(n)

// --- small parts ----------------------------------------------------------------

/**
 * A line that types itself at 38ms a letter, with a pause after a full stop
 * and a caret in the accent that blinks at the Mac's rate and goes once the
 * line has rested. Any key finishes it at once: reading never waits on it.
 */
function TypeLine({ text, className, onDone }: { text: string; className?: string; onDone?: () => void }): React.JSX.Element {
  const [n, setN] = useState(() => (still() ? text.length : 0))
  const [resting, setResting] = useState(false)
  // The screen's one voice while it types: the ring round today waits for it (lib/motion.ts).
  const voice = useId()
  useState(() => n < text.length && speak(voice, text, 10000, true))
  useEffect(() => () => hush(voice), [voice])
  useEffect(() => {
    if (n >= text.length) {
      hush(voice)
      onDone?.()
      const timer = setTimeout(() => setResting(true), 1200)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => {
      setN((now) => now + 1)
      if (text[n] !== ' ') click('soft')
    // The first letter once the year has come in: one thing at a time.
    }, n === 0 ? 680 : text[n - 1] === '.' ? 180 : 38)
    return () => clearTimeout(timer)
  }, [n, text]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const finish = (event: KeyboardEvent): void => void (event.key !== 'Escape' && setN(text.length))
    window.addEventListener('keydown', finish, true)
    return () => window.removeEventListener('keydown', finish, true)
  }, [text])
  return (
    <h1 aria-label={text} className={className}>
      <span aria-hidden>{text.slice(0, n)}</span>
      <span aria-hidden className={`mf-caret ${resting ? 'mf-caret-gone' : n >= text.length ? '' : 'mf-caret-typing'}`} />
      {/* The rest, unseen, so the line's shape is set from the start and nothing reflows. */}
      <span aria-hidden className="invisible">{text.slice(n)}</span>
    </h1>
  )
}

/**
 * A key, drawn as a key: a cap with a darker lip under it and a highlight
 * along its top. Pressed, it sinks and the lip goes, in 60ms; let go, it
 * springs back with a little overshoot.
 */
function Keycap({ label, down, size = 64 }: { label: string; down: boolean; size?: number }): React.JSX.Element {
  const lip = Math.round(size / 20)
  const wide = label.length > 1 && !/^[𒀭𒆠]$/u.test(label)
  return (
    <motion.span
      aria-hidden
      className="relative inline-flex items-center justify-center rounded-[22%] border border-foreground/12 bg-[color-mix(in_oklab,var(--foreground)_7%,var(--background))] font-medium text-foreground"
      style={{
        height: size, minWidth: size, paddingInline: wide ? size * 0.28 : 0,
        // A full stop is a speck at the size of a letter: drawn larger, the way a keycap prints it.
        fontSize: wide ? size * 0.3 : /^[.,;']$/.test(label) ? size * 0.62 : size * 0.42,
        color: down ? 'var(--primary)' : undefined,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
        boxShadow: down
          ? `inset 0 1px 0 color-mix(in oklab, white 6%, transparent), 0 0 0 0 transparent`
          : `inset 0 1px 0 color-mix(in oklab, white 10%, transparent), 0 ${lip}px 0 color-mix(in oklab, var(--foreground) 16%, var(--background)), 0 ${lip + 6}px 16px -8px color-mix(in oklab, var(--mf-shadow-ink) 55%, transparent)`,
        transition: down ? 'box-shadow 60ms ease-out' : 'box-shadow 140ms cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      animate={{ transform: `translateY(${down ? lip : 0}px)` }}
      transition={down ? { duration: 0.06, ease: 'easeOut' } : { type: 'spring', duration: 0.22, bounce: 0.35 }}
    >
      {label}
    </motion.span>
  )
}

/**
 * ⌘ and . as two real keys, from a render: one picture split down the middle so
 * each half presses on its own, sinking a little into the desk and dimming, as
 * a key does under a finger. Only for ⌘. itself; any other key is drawn as caps.
 */
function KeycapPicture({ down, width }: { down: Set<number>; width: number }): React.JSX.Element {
  return (
    <span aria-hidden className="flex" style={{ width, height: Math.round((width * 320) / 520) }}>
      {[0, 1].map((i) => (
        <span key={i} className="relative h-full w-1/2 overflow-hidden">
          <motion.img
            src={keycapsUrl}
            alt=""
            draggable={false}
            className="absolute top-0 h-full max-w-none"
            style={{ width: width, left: i ? '-100%' : 0 }}
            animate={{ transform: `translateY(${down.has(i) ? width * 0.012 : 0}px) scale(${down.has(i) ? 0.985 : 1})`, filter: `brightness(${down.has(i) ? 0.82 : 1}) drop-shadow(0 ${down.has(i) ? 8 : 14}px ${down.has(i) ? 10 : 18}px rgb(0 0 0 / 0.35))` }}
            transition={down.has(i) ? { duration: 0.06, ease: 'easeOut' } : { type: 'spring', duration: 0.24, bounce: 0.35 }}
          />
        </span>
      ))}
    </span>
  )
}

/**
 * The year as a ruler along the foot of the first screen: a tick a day,
 * January at the left. It is drawn up to today in one sweep, then the days
 * gone fade back as the line above finishes saying they will be, all but the
 * days you kept something on, which stay, taller. Today stands up in the
 * accent with its number over it, and rises a little with each thing kept
 * today, the count beside its number.
 *
 * Someone new has kept nothing, so nothing pretends they have: the days gone
 * are a bare line, and the ruler says the year starts today.
 */
function YearRule({ calm, kept, faded, newcomer, today: count }: { calm: boolean; kept: Set<string>; faded: boolean; newcomer: boolean; today: number }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = (): void => setW(el.clientWidth)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const quiet = calm || still()
  const today = dayjs().startOf('day')
  const start = today.startOf('year')
  const days = today.endOf('year').diff(start, 'day') + 1
  const at = today.diff(start, 'day')
  const step = w / days
  const x = (d: number): number => Math.round((d + 0.5) * step) + 0.5
  const H = 32
  // One path a kind, so a year is four elements rather than 366.
  const ticks = (pick: (d: number) => boolean, tall: (d: number) => number): string => {
    let path = ''
    for (let d = 0; d < days; d++) if (pick(d)) path += `M${x(d)} ${H}V${H - tall(d)}`
    return path
  }
  const keptOn = (d: number): boolean => kept.has(start.add(d, 'day').format('YYYY-MM-DD'))
  // The first of each month a little taller, so the months read without a grid.
  const first = (d: number): boolean => start.add(d, 'day').date() === 1
  const months = Array.from({ length: 12 }, (_, m) => ({ name: start.add(m, 'month').format('MMM'), d: start.add(m, 'month').diff(start, 'day') }))
  const anyKept = Array.from({ length: at }, (_, d) => d).some(keptOn)
  // Today's mark: three quarters up with nothing kept yet, full height by the third thing.
  const rise = Math.min(1, 0.72 + count * 0.095)
  const said = newcomer
    ? count ? `Your year starts today: ${count} kept so far. Each day you keep something stands taller.` : 'Your year starts today. Each day you keep something stands taller.'
    : `Each mark is a day of your year. ${anyKept ? 'The tall ones are days you kept something.' : 'Keep something, and its day stands taller.'}`
  return (
    <figure aria-label={newcomer ? 'Your year, starting today' : `Today is day ${at + 1} of ${days}`} className="relative w-full">
      <div ref={box} className="relative h-[calc(32px+2.9rem)]">
        {w > 0 && (
          <>
            {/* Over today: its number (or just Today, for someone new), and what was kept on it. */}
            <span className={`absolute top-0 -translate-x-1/2 text-[0.8125rem] leading-[1.1rem] font-medium whitespace-nowrap text-primary tabular-nums ${quiet ? '' : 'mf-rise-text'}`} style={{ left: x(at) }}>
              {newcomer ? 'Today' : `Day ${at + 1}`}{count > 0 && <span className="text-(--mf-wl-quiet)"> · {count} kept</span>}
            </span>
            <svg aria-hidden width={w} height={H} className="absolute top-[1.4rem] left-0 overflow-visible">
              {newcomer ? (
                // Nothing kept before today: the days gone are a bare line, not marks.
                <path d={`M${x(0)} ${H - 0.5}H${x(at)}`} stroke="var(--foreground)" strokeWidth={1} fill="none" opacity={0.18} />
              ) : (
                // The days gone: drawn in, then let go of as the line says they are.
                <path d={ticks((d) => d < at && !keptOn(d), (d) => (first(d) ? 18 : 11))} stroke="var(--foreground)" strokeWidth={1} fill="none"
                  className={quiet ? '' : 'mf-sweep'} style={{ opacity: faded ? 0.1 : 0.6, transition: quiet ? undefined : 'opacity 1200ms cubic-bezier(0.33, 0.1, 0.25, 1)' }} />
              )}
              {/* The days to come, short and waiting. */}
              <path d={ticks((d) => d > at, (d) => (first(d) ? 18 : 7))} stroke="var(--foreground)" strokeWidth={1} fill="none" opacity={0.36} />
              {/* The days you kept something on: these stay. */}
              {!newcomer && <path d={ticks((d) => d < at && keptOn(d), () => 24)} stroke="var(--foreground)" strokeWidth={1.5} fill="none" opacity={0.85} className={quiet ? '' : 'mf-sweep'} />}
              <g className={quiet ? '' : 'mf-rise'}>
                <path d={`M${x(at)} ${H}V0`} stroke="var(--primary)" strokeWidth={2} fill="none"
                  style={{ transform: `scaleY(${rise})`, transformBox: 'fill-box', transformOrigin: '50% 100%', transition: quiet ? undefined : 'transform 420ms cubic-bezier(0.34, 1.4, 0.64, 1)' }} />
              </g>
            </svg>
            {months.map((month) => (
              <span key={month.name} className="absolute top-[calc(1.4rem+32px+0.45rem)] text-[0.75rem] leading-none text-(--mf-wl-quiet)" style={{ left: x(month.d) - 0.5 }}>{month.name}</span>
            ))}
          </>
        )}
      </div>
      {/* What it is, said once and quietly, so the ruler reads at a glance. */}
      <figcaption className={`mt-2 text-[0.8125rem] leading-snug text-(--mf-wl-quiet) ${quiet ? '' : 'mf-rise-text'}`}>{said}</figcaption>
    </figure>
  )
}

/**
 * Where you are, said once and quietly: Back, when there is somewhere to go
 * back to, and the count. No row of dots or names to read; the screen is the
 * thing to look at. The arrow keys do the same.
 */
function Progress({ at, onBack }: { at: number; onBack: () => void }): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 text-[clamp(0.8125rem,1.8vmin,1rem)] text-(--mf-wl-quiet)">
      <span className="sr-only">Step {at + 1} of {SCREENS}</span>
      {at > 0 && (
        <button type="button" onClick={onBack} className="-ml-3 flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center rounded-[0.6rem] px-3 transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]">
          Back
        </button>
      )}
      <span aria-hidden className="tabular-nums"><span className="text-foreground">{at + 1}</span> of {SCREENS}</span>
    </div>
  )
}

/** The one button in the accent: what this screen does next, with its key. */
function Primary({ children, keys = '↵', onClick, hidden = false }: { children: ReactNode; keys?: ReactNode; onClick: () => void; hidden?: boolean }): React.JSX.Element {
  return (
    <button type="button" onClick={onClick} tabIndex={hidden ? -1 : 0} aria-hidden={hidden || undefined}
      className={`flex h-[clamp(2.25rem,4.6vmin,2.75rem)] items-center gap-2.5 rounded-[0.6rem] bg-primary pr-2 pl-3.5 text-[clamp(0.875rem,1.8vmin,1.0625rem)] font-semibold whitespace-nowrap text-primary-foreground transition-[opacity,transform,background-color] duration-200 ease-(--mf-ease) hover:bg-primary/90 active:scale-[0.97] ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
      {children}
      <span className="flex items-center gap-0.5">
        {typeof keys === 'string' ? <Kbd className="h-6 min-w-6 rounded-[0.35rem] border-primary-foreground/25 bg-primary-foreground/12 text-primary-foreground">{keys === '↵' ? <CornerDownLeft className="size-3" strokeWidth={2.4} /> : keys}</Kbd> : keys}
      </span>
    </button>
  )
}

// --- the welcome ----------------------------------------------------------------

export function Welcome(): React.JSX.Element | null {
  const [at, setAtState] = useState(-1)
  // Opened again from a menu: nothing is first about it.
  const [replay, setReplay] = useState(false)
  // Skipped ahead, and from where: the first screen gets a line of its own.
  const [skipped, setSkipped] = useState<false | 'first' | 'later'>(false)
  const [state, setState] = useState<Onboarding | null>(null)
  // Everything caught since the welcome opened, oldest first, kept fresh (a link's name arrives late).
  const [caught, setCaught] = useState<CaptureMeta[]>([])
  const caughtNow = useRef<CaptureMeta[]>([])
  // The one whose kind the catch screen is showing: the last to land.
  const [showing, setShowing] = useState<string | null>(null)
  // How the screen was reached, for whether it rises in: a key, a click, or the app answering.
  const [how, setHow] = useState<'key' | 'pointer' | 'app'>('app')
  const before = useRef<Set<string>>(new Set())
  // The days this year you have already kept something on, for the first screen's ruler.
  const [kept, setKept] = useState<Set<string>>(new Set())
  // Nothing kept, ever: the ruler does not pretend otherwise.
  const [newcomer, setNewcomer] = useState(false)
  // Kept today before the welcome opened, so today's mark counts the day, not just the welcome.
  const [earlier, setEarlier] = useState(0)
  // The theme the dial was left on, kept when you move on.
  const picked = useRef<Theme | null>(null)
  const veteran = useRef(false)

  const go = (to: number, by: 'key' | 'pointer' | 'app' = byKeys() ? 'key' : 'pointer'): void => {
    if (to < 0 || to > LAST) return
    setHow(by)
    setAtState(to)
  }

  const open = (again: boolean): void => {
    void Promise.all([window.api.captures.list(), onboarding.state()]).then(([list, now]) => {
      before.current = new Set(list.map((one) => one.id))
      setKept(new Set(list.map((one) => dayjs(one.capturedAt).format('YYYY-MM-DD'))))
      setNewcomer(list.length === 0)
      setEarlier(list.filter((one) => dayjs(one.capturedAt).isSame(dayjs(), 'day')).length)
      // Notes from before the welcome existed: someone who knows Vigil already.
      veteran.current = !now.welcomed && list.length > 0
      setState(now)
    })
    picked.current = null
    caughtNow.current = []
    setCaught([])
    setShowing(null)
    setSkipped(false)
    setReplay(again)
    setHow('app')
    setAtState(0)
    chime('read')
  }

  // First run: the main process opened this window for it. Again: from a menu.
  useEffect(() => {
    void onboarding.state().then((now) => now.firstRun && open(false))
    const again = (): void => open(true)
    window.addEventListener('vigil:welcome', again)
    window.addEventListener('vigil:tour', again)
    return () => {
      window.removeEventListener('vigil:welcome', again)
      window.removeEventListener('vigil:tour', again)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The box says something warmer while the welcome waits on it.
  useEffect(() => {
    void onboarding.set({ welcoming: at === 1 || at === CATCH })
    document.documentElement.toggleAttribute('data-welcoming', at >= 0)
  }, [at])

  const kinds = kindsOf(caught)
  // The starters for the kinds not caught yet: once you have a todo of your own, the todo one goes.
  const left = kinds.length >= 3 ? [] : STARTERS.filter((one) => !kinds.includes(one.kind))
  // The box, told what is left to try, and whether this is the first thing.
  useEffect(() => tellBox(left.map((one) => one.text), caught.length === 0), [left.length, caught.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Whether the real box is up over the welcome: the words then keep clear of it.
  const [boxUp, setBoxUp] = useState(false)
  useEffect(() => {
    if (at < 0) return
    const offShown = window.api.onBoxShown(() => setBoxUp(true))
    const offAway = window.api.onBoxAway(() => setBoxUp(false))
    return () => (offShown(), offAway())
  }, [at < 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Each capture, the moment it is saved, and again as it changes (a link's page name).
  useEffect(() => {
    if (at !== 1 && at !== CATCH) return
    return window.api.captures.onChange(() => void window.api.captures.list().then((list) => {
      const now = since(list, before.current)
      const fresh = now.find((one) => !caughtNow.current.some((was) => was.id === one.id))
      caughtNow.current = now
      setCaught(now)
      if (!fresh) return
      setShowing(fresh.id)
      if (at !== CATCH) go(CATCH, 'app')
    }), ['capture'])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at])

  const leave = (how: 'fresh' | 'sandbox' | 'notes' | 'closed'): void => {
    // The theme on the dial is the one you leave with.
    if (picked.current) applyTheme(picked.current)
    // Someone with notes of their own does not need a beginner's checklist on
    // Home after a look round, unless they chose to start fresh.
    void onboarding.set({ welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, ...(veteran.current && how !== 'fresh' ? { hidden: true } : {}) })
    setAtState(-1)
    if (how === 'fresh') {
      chime('decided')
      window.api.openInHome('view', 'home')
      setTimeout(() => window.dispatchEvent(new CustomEvent('vigil:tour-stops')), 450)
    } else if (how === 'sandbox') {
      void enterSandbox().catch(() => toast('The sandbox could not open just now. It waits in ⌘K, under Open the sandbox.', undefined, 'warning'))
    } else if (how === 'notes') {
      chime('decided')
    } else {
      chime('away')
      toast('The welcome is in the Vigil menu and ⌘K whenever you want it again.', undefined, 'info')
    }
  }

  const skip = (): void => {
    if (at === LAST) return leave('closed')
    chime('page')
    setSkipped(at === 0 ? 'first' : 'later')
    go(LAST, byKeys() ? 'key' : 'pointer')
  }
  const next = (): void => {
    chime('page')
    if (at === DIAL && picked.current) applyTheme(picked.current)
    go(at + 1)
  }
  const back = (): void => {
    if (at <= 0) return void chime('nope')
    chime('page')
    go(at - 1)
  }
  const openBox = (): void => {
    chime('open')
    window.api.showPrompt()
  }
  // A starter: typed into the box for you, so you see its kind guessed, and sent by you.
  const start = (text: string): void => {
    fillBox(text)
    if (boxUp) return void chime('tap')
    openBox()
  }

  // The keys, ahead of everything else in the window while the welcome is up.
  useEffect(() => {
    if (at < 0) return
    const onKey = (event: KeyboardEvent): void => {
      if (konami(event.key)) {
        chime('finding')
        setAtState((now) => now) // redraw the caps
        setClayTick((n) => n + 1)
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const typing = (event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')
      if (typing) return
      if (event.key === 'Escape') skip()
      else if (event.key === 'Enter') primary[at]?.()
      else if (at === LAST && /^[123]$/.test(event.key)) choose(Number(event.key) as 1 | 2 | 3)
      else if (at === CATCH && /^[1-9]$/.test(event.key) && left[Number(event.key) - 1]) start(left[Number(event.key) - 1].text)
      else if (at === DIAL && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        // The dial's own, as its scroll wheel turns it: turned from anywhere on
        // the screen. Left and right stay back and next, as on every other screen.
        const dial = document.querySelector<HTMLElement>('[role="slider"][aria-label="Theme"]')
        if (!dial || dial.contains(event.target as Node)) return
        dial.focus({ preventScroll: true })
        dial.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, bubbles: true }))
      } else if (event.key === 'ArrowRight' && at !== LAST) next()
      else if (event.key === 'ArrowLeft') back()
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  const [, setClayTick] = useState(0)

  const [importing, setImporting] = useState(false)
  const choose = (pick: 1 | 2 | 3): void => {
    if (pick === 1) return leave('fresh')
    if (pick === 2) return leave('sandbox')
    // Your notes: a folder (Obsidian or Notion) at once; files are a click beside it.
    if (!importing) {
      chime('tap')
      return setImporting(true)
    }
    leave('notes')
    void window.api.importFrom('vault')
  }

  // Three kinds caught: the next screen. Before then, the box again.
  const done = kinds.length >= 3
  const primary: Record<number, (() => void) | undefined> = {
    0: next,
    1: openBox,
    [CATCH]: boxUp ? undefined : done ? next : openBox,
    3: next,
    [DIAL]: next,
    [LAST]: () => choose(1)
  }

  if (at < 0) return null
  const motionless = how === 'key' || still()
  const shown = caught.find((one) => one.id === showing) ?? null
  return (
    <div role="dialog" aria-modal aria-label="Welcome to Vigil" className="mf-welcome fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background text-foreground [container-type:inline-size]">
      <Backdrop plain={at === LAST} />
      {/* Somewhere to hold the window by, clear of its buttons. */}
      <div className="relative h-11 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
      {at === LAST && <TrayArrow tray={state?.tray ?? null} />}
      {/* One frame for the words and the footer: in a large window they stay
          together in the middle, not scattered to its far corners. */}
      <div className="relative mx-auto flex min-h-0 w-full max-w-[84rem] flex-1 flex-col [@media(min-height:760px)]:my-auto [@media(min-height:760px)]:max-h-[48rem]">
      <main className="relative flex min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.section
            key={at}
            // Two lines of words crossing in one place read as one change through a breath of blur, not two pages stacked.
            initial={motionless ? false : { opacity: 0, transform: shift('translateY(6px)'), filter: 'blur(2px)' }}
            animate={{ opacity: 1, transform: shift('translateY(0px)'), filter: 'blur(0px)' }}
            exit={motionless ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, filter: 'blur(2px)', transition: { duration: 0.12, ease: EASE } }}
            transition={{ duration: 0.2, ease: EASE }}
            className={`w-full px-[clamp(1.5rem,5vw,4rem)] py-6 [@media(max-height:480px)]:py-2 ${at === CATCH && boxUp ? 'mx-auto mt-auto' : (PLACE[at] ?? 'm-auto')}`}
          >
            {at === 0 && <Hello replay={replay} kept={kept} calm={motionless} newcomer={newcomer} today={earlier + caught.length} />}
            {at === 1 && <OneKey state={state} onState={setState} onBox={() => go(CATCH, 'app')} />}
            {at === CATCH && <Catch boxUp={boxUp} caught={caught} shown={shown} left={left} onStart={start} />}
            {at === 3 && <AYear calm={motionless} caught={caught} />}
            {at === DIAL && <Yours onPick={(theme) => (picked.current = theme)} />}
            {at === LAST && <Start name={replay ? '' : (state?.name ?? '')} kept={caught.length} skipped={skipped} importing={importing} onPick={choose} onFiles={() => (leave('notes'), void window.api.importFrom('files'))} />}
          </motion.section>
        </AnimatePresence>
      </main>
      <footer className="relative flex h-[clamp(4rem,9vmin,5.5rem)] shrink-0 items-center gap-3 px-[clamp(1.5rem,5vw,4rem)]">
        <div className="mr-auto">
          <Progress at={at} onBack={back} />
        </div>
        <button type="button" onClick={skip} className="flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center gap-2 rounded-[0.6rem] px-3 text-[clamp(0.8125rem,1.8vmin,1rem)] text-(--mf-wl-quiet) transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]">
          {at === LAST ? 'Close' : 'Skip'} <Kbd>Esc</Kbd>
        </button>
        {/* One is enough: after the first, a quiet way on without the other two. */}
        {at === CATCH && caught.length > 0 && !done && !boxUp && (
          <button type="button" onClick={next} className="flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center gap-2 rounded-[0.6rem] px-3 text-[clamp(0.8125rem,1.8vmin,1rem)] text-foreground transition-colors hover:bg-foreground/[0.06] active:scale-[0.97]">
            That is enough for now <Kbd>→</Kbd>
          </button>
        )}
        <div>
          {at === 0 && <Primary onClick={next}>Show me</Primary>}
          {at === 1 && <LateButton onClick={openBox} />}
          {at === CATCH && (done
            ? <Primary onClick={next} hidden={boxUp}>Next</Primary>
            : <Primary onClick={openBox} keys={<BoxKeys />} hidden={boxUp}>{caught.length ? 'Catch another' : 'Open the box'}</Primary>)}
          {at > CATCH && at < LAST && <Primary onClick={next}>Next</Primary>}
          {at === LAST && <Primary onClick={() => choose(1)}>Start fresh</Primary>}
        </div>
      </footer>
      </div>
    </div>
  )
}

/** The box's own keys as small caps, inside a button. */
function BoxKeys(): React.JSX.Element {
  useKeyChanges()
  const caps = capsOf(keyFor('⌘.') || '⌘.')
  const chip = 'h-6 min-w-6 rounded-full border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground'
  // Two caps fit beside the words; a longer chord is one chip, so the button stays one line.
  return caps.length > 2 ? <Kbd className={`${chip} px-2`}>{caps.join('')}</Kbd> : <>{caps.map((key, i) => <Kbd key={i} className={chip}>{key}</Kbd>)}</>
}

/** "Open it for me", which comes a little after the screen: the point is to try the key yourself. */
function LateButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 6000)
    return () => clearTimeout(timer)
  }, [])
  return <Primary onClick={onClick} hidden={!shown}>Open it for me</Primary>
}

/**
 * Behind it all: the scenery the empty Inbox uses, dimmed for reading and
 * drifting very slowly, under a film of grain. With no scenery, the grain
 * on the page's own colour.
 */
function Backdrop({ plain }: { plain: boolean }): React.JSX.Element {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* The last screen is a plain page: the scenery steps back for the choice. */}
      <div className={`mf-drift absolute -inset-[2%] transition-opacity duration-300 ease-(--mf-ease) ${plain ? 'opacity-0' : 'opacity-100'}`}>
        <Scenery place="rest" seed="welcome" text="all" className="absolute inset-0" />
      </div>
      <div className="absolute inset-0 opacity-[0.035] mix-blend-overlay" style={{ backgroundImage: NOISE, backgroundSize: '160px' }} />
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_100%,color-mix(in_oklab,var(--background)_70%,transparent),transparent_70%)]" />
    </div>
  )
}

/** On the last screen, a small arrow up at the menu bar icon itself, wherever it is. */
function TrayArrow({ tray }: { tray: { x: number; y: number } | null }): React.JSX.Element | null {
  if (!tray) return null
  const x = tray.x - window.screenX
  // Off past the window's edge, an arrow would point at nothing: the line on the screen says where instead.
  if (x < 24 || x > window.innerWidth - 24) return null
  // A window lower down has something else above it: pointing up would point at that.
  if (window.screenY - (screen as Screen & { availTop: number }).availTop > 40) return null
  return (
    <div aria-hidden className="pointer-events-none absolute top-1.5 z-10 flex -translate-x-1/2 flex-col items-center gap-0.5 text-primary" style={{ left: x }}>
      <ArrowUp className={`size-4 ${still() ? '' : 'mf-nudge-up'}`} strokeWidth={2.2} />
      <span className="text-[0.75rem] font-medium whitespace-nowrap">Vigil is up here</span>
    </div>
  )
}

/*
 * The type, sized to the window by its smaller side, so a short wide window
 * and a tall narrow one both read, and a phone-sized recording of either
 * still does. Lines stay short: a welcome is read at a glance, not studied.
 * Secondary lines are the page's own ink, mixed back (main.css, .mf-welcome),
 * never a faint grey.
 */
const HEADLINE = 'font-heading text-[clamp(2rem,min(5vw,7.4vh),4.5rem)] leading-[1.04] font-medium tracking-[-0.026em] text-balance text-foreground'
/** The first screen's: the establishing shot, the largest words in the welcome. */
const HEADLINE_XL = 'font-heading text-[clamp(2.25rem,min(5.6vw,8.4vh),5.25rem)] leading-[1.02] font-medium tracking-[-0.03em] text-balance text-foreground'
/** Under something larger than itself: the keys, the dial. */
const HEADLINE_SM = 'font-heading text-[clamp(1.625rem,min(3.6vw,5.4vh),3.25rem)] leading-[1.08] font-medium tracking-[-0.022em] text-balance text-foreground'
const BODY = 'max-w-[32ch] text-[clamp(1.0625rem,min(2.5vw,3.6vh),1.75rem)] leading-[1.4] text-pretty text-(--mf-wl-body)'
const QUIET = 'text-[clamp(0.9375rem,min(2.2vw,3.2vh),1.5rem)] leading-snug text-(--mf-wl-quiet)'
/** Keys inside a line of the larger type: sized to it, not to the app's small caps. */
const LINE_KEY = 'h-[1.3em] min-w-[1.3em] rounded-[0.3em] px-[0.3em] text-[0.62em]'
/** A date or a count set in the type: figures that line up, in the quiet ink. */
const FIGURES = 'text-[clamp(0.875rem,min(1.9vw,2.8vh),1.25rem)] tabular-nums text-(--mf-wl-quiet)'
/** Where each screen sits in the window: the first fills it, top to bottom; the rest in the middle. */
const PLACE: Record<number, string> = {
  0: 'flex self-stretch'
}

// --- the screens ------------------------------------------------------------------

/**
 * The establishing shot: an entry dated like a diary's, one line about your
 * week typed under it, and the year along the foot. The line says most of
 * today will be gone; as it finishes, the gone days on the ruler fade, and
 * only the ones you kept something on stay.
 */
function Hello({ replay, kept, calm, newcomer, today }: { replay: boolean; kept: Set<string>; calm: boolean; newcomer: boolean; today: number }): React.JSX.Element {
  const [said, setSaid] = useState(false)
  const [line] = useState(firstLine)
  const [when] = useState(dateline)
  // Opened again, nothing types: the days fade once the ruler has been drawn.
  useEffect(() => {
    if (!replay) return
    const timer = setTimeout(() => setSaid(true), calm || still() ? 0 : 900)
    return () => clearTimeout(timer)
  }, [replay, calm])
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col justify-between gap-[clamp(1.5rem,5vh,3rem)]">
      <div className="flex max-w-[min(100%,46rem)] flex-col gap-[clamp(0.75rem,2.6vh,1.75rem)] pt-[clamp(0rem,4vh,3rem)]">
        <p className={FIGURES}>{when}</p>
        {replay ? <h1 className={`${HEADLINE_XL} max-w-[17ch]`}>{line}</h1> : <TypeLine text={line} className={`${HEADLINE_XL} max-w-[17ch]`} onDone={() => setSaid(true)} />}
        <p className={`${BODY} max-w-[28ch]`}>Vigil keeps it for you, one key away, and brings it back.</p>
      </div>
      <div className="[@media(max-height:520px)]:hidden">
        <YearRule calm={calm} kept={kept} faded={said} newcomer={newcomer} today={today} />
      </div>
    </div>
  )
}

/**
 * The one key. The caps go down as the real keys do: the modifiers from this
 * window, and the last one when the box opens, which is told to this window
 * even when the keys went to another app. If another app already holds the
 * key, the box gets another one, right here.
 */
function OneKey({ state, onState, onBox }: { state: Onboarding | null; onState: (now: Onboarding) => void; onBox: () => void }): React.JSX.Element {
  useKeyChanges()
  const keys = keyFor('⌘.') || '⌘.'
  const caps = capsOf(keys)
  const [down, setDown] = useState<Set<number>>(new Set())
  const [arrived, setArrived] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const taken = !!state?.boxTaken
  const win = useWindowSize()
  // The hero of the screen: as large as the window allows, smaller per cap when the chord is long.
  const big = Math.round(Math.max(52, Math.min(win.height * 0.17, win.width * 0.13, 152) * Math.min(1, 2.6 / caps.length)))

  useEffect(() => {
    const press = (event: KeyboardEvent, on: boolean): void => {
      caps.forEach((cap, i) => {
        const named = MODS[cap]
        const hit = named ? event.key === named : comboOf(event)?.endsWith(cap)
        if (!hit) return
        setDown((was) => {
          const next = new Set(was)
          if (on) next.add(i)
          else next.delete(i)
          return next
        })
        if (on && !event.repeat) chime('tap')
      })
    }
    const onDown = (event: KeyboardEvent): void => press(event, true)
    const onUp = (event: KeyboardEvent): void => press(event, false)
    // Gone to the box: whatever was held is let go there.
    const onBlur = (): void => void setTimeout(() => setDown(new Set()), 160)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [keys]) // eslint-disable-line react-hooks/exhaustive-deps

  // The box opened, from here or from anywhere: every cap down for a beat, then on.
  useEffect(() => window.api.onBoxShown(() => {
    setDown(new Set(caps.map((_, i) => i)))
    setArrived(true)
    setTimeout(() => setDown(new Set()), 150)
    setTimeout(onBox, 1150)
  }), [keys]) // eslint-disable-line react-hooks/exhaustive-deps

  const all = down.size === caps.length
  return (
    // The close-up: the keys, large and in the middle, and the words under them.
    <div className="mx-auto flex max-w-[min(100%,46rem)] flex-col items-center gap-[clamp(1.25rem,4.5vh,3rem)] text-center">
      <div className={`relative flex items-end gap-[0.18em] rounded-[0.42em] p-[0.16em] transition-[box-shadow] duration-300 ease-(--mf-ease) ${all || arrived ? 'shadow-[0_0_0_1.5px_var(--primary)]' : 'shadow-[0_0_0_1.5px_transparent]'}`} style={{ fontSize: big }}>
        {keys === '⌘.'
          ? <KeycapPicture down={down} width={Math.round(big * 3.1)} />
          : caps.map((cap, i) => <Keycap key={`${cap}${i}`} label={glyph(cap, i === caps.length - 1)} down={down.has(i)} size={big} />)}
      </div>
      <div className="flex flex-col items-center gap-[clamp(0.5rem,1.6vh,1rem)]">
        <h1 className={HEADLINE_SM}>Press it, from any app.</h1>
        <AnimatePresence mode="wait" initial={false}>
          {arrived ? (
            <motion.p key="there" className="font-heading text-[clamp(1.25rem,min(2.6vw,3.8vh),2rem)] leading-snug text-foreground" initial={{ opacity: 0, filter: 'blur(2px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.12 }}>
              There it is. <span className="text-(--mf-wl-body)">Now write something in it.</span>
            </motion.p>
          ) : taken || choosing ? (
            <KeyPicker key="pick" taken={taken} onState={onState} />
          ) : (
            <motion.div key="ask" className="flex flex-col items-center gap-[clamp(0.75rem,2vh,1.25rem)]" exit={{ opacity: 0, transition: { duration: 0.1 } }}>
              <p className={`${BODY} max-w-[30ch]`}>
                A small box opens. It is all of Vigil you need today.
              </p>
              <p className={QUIET}>
                <button type="button" onClick={() => (chime('tap'), setChoosing(true))} className="rounded-sm underline decoration-current/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current/60">
                  Use a different key
                </button>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Keys written in a sentence, as small caps. */
function InlineKeys({ keys }: { keys: string }): React.JSX.Element {
  return <span className="inline-flex translate-y-[-0.08em] gap-[0.12em] align-middle">{capsOf(keys).map((key, i) => <Kbd key={i} className={LINE_KEY}>{glyph(key, i === capsOf(keys).length - 1)}</Kbd>)}</span>
}

/**
 * Another app holds the key, or you would rather a different one: press the
 * keys you want, and the box answers to them from now on. The same setting
 * Settings › Shortcuts changes, so it is one place to change it back.
 */
function KeyPicker({ taken, onState }: { taken: boolean; onState: (now: Onboarding) => void }): React.JSX.Element {
  const [listening, setListening] = useState(true)
  const [said, setSaid] = useState<string | null>(null)
  const changes = useKeyChanges()
  useEffect(() => {
    if (!listening) return
    listen((event) => {
      const combo = comboOf(event)
      if (!combo) return
      if (combo === 'Esc') return void (setListening(false), listen(null))
      // A key for every app has to hold a ⌘, ⌥ or ⌃, or typing a letter would open the box.
      if (!/[⌃⌥⌘]/.test(combo)) return void (chime('nope'), setSaid('Hold ⌘, ⌥ or ⌃ with it, so typing never opens the box.'))
      // Back to ⌘. is no change at all; anything else is written as yours.
      const next = { ...changes }
      if (combo === '⌘.') delete next['⌘.']
      else next['⌘.'] = combo
      saveKeys(next)
      setListening(false)
      listen(null)
      // Asked again once the key has been taken, or not.
      setTimeout(() => void onboarding.state().then((now) => {
        onState(now)
        if (now.boxTaken) {
          chime('nope')
          setSaid('That one is taken too. Try another.')
          setListening(true)
        } else {
          chime('settled')
          setSaid(null)
        }
      }), 250)
    })
    return () => listen(null)
  }, [listening]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.div className="flex flex-col items-center gap-4" initial={false} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
      <p className={`${BODY} max-w-[34ch]`}>
        {taken ? <><InlineKeys keys={keyFor('⌘.') || '⌘.'} /> is already taken by another app on this Mac. Press the keys you would like instead.</> : <>Press the keys you would like for the box instead.</>}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => (chime('tap'), setListening(true))}
          className={`flex h-11 min-w-60 items-center gap-2.5 rounded-xl border px-4 text-[0.9375rem] transition-colors ${listening ? 'border-primary/60 bg-primary/[0.06] text-foreground' : 'text-(--mf-wl-body) hover:bg-foreground/[0.04]'}`}>
          {listening ? <><span className="mf-listening" aria-hidden />Press the keys…</> : <>Box key: <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> <span className="ml-auto text-(--mf-wl-quiet)">Change</span></>}
        </button>
      </div>
      {said ? <p role="status" className={`${QUIET} text-[color-mix(in_srgb,var(--tt-color-text-orange)_70%,var(--foreground))]`}>{said}</p>
        : !listening && !taken && <p role="status" className={QUIET}>Done. Now press it, from any app.</p>}
    </motion.div>
  )
}

/**
 * Three things to catch, of three kinds. Three slots at the top fill with
 * each new kind as it lands. Before the first: three starters to click (each
 * is typed into the box for you, to send yourself) or to write your own.
 * With the real box up (it opens over the top of the screen), the words wait
 * low in the window, clear of it. Once something lands: its kind, named, and
 * beside it what that kind does, with the starters still to try under it.
 */
function Catch({ boxUp, caught, shown, left, onStart }: { boxUp: boolean; caught: CaptureMeta[]; shown: CaptureMeta | null; left: Starter[]; onStart: (text: string) => void }): React.JSX.Element {
  useKeyChanges()
  const send = <InlineKeys keys={keyFor('⌘↵') || '⌘↵'} />
  const kinds = kindsOf(caught)
  if (boxUp) {
    return (
      <div className="mr-auto flex w-full max-w-[min(100%,54rem)] flex-col items-start gap-[clamp(0.5rem,1.6vh,1rem)]">
        <Slots caught={caught} />
        <h1 className={HEADLINE}>{caught.length ? 'The next one, in the box.' : 'Write it in the box.'}</h1>
        <p className={`${BODY} max-w-[38ch]`}>
          {caught.length ? null : <>Watch the chip at its foot: Vigil guesses the kind from your words. </>}
          {send} sends it. <span className="inline-flex translate-y-[-0.08em] align-middle"><Kbd className={LINE_KEY}>Esc</Kbd></span> puts it away.
        </p>
      </div>
    )
  }
  if (!shown) {
    return (
      <div className="mr-auto flex w-full max-w-[56rem] flex-col gap-[clamp(1rem,3.6vh,2.5rem)]">
        <div className="flex flex-col gap-[clamp(0.75rem,2.2vh,1.25rem)]">
          <Slots caught={caught} />
          <h1 className={HEADLINE}>Catch three things.</h1>
          <p className={`${BODY} max-w-[36ch]`}>Three kinds, to see what each one does. Pick one and it is typed into the box for you, or write your own.</p>
        </div>
        <Starters left={left} onStart={onStart} />
      </div>
    )
  }
  const type = typeOf(shown.kind)
  const name = type.label.toLowerCase()
  const again = caught.find((one) => one.kind === shown.kind)?.id !== shown.id
  const aside = shown.kind === 'note' ? landedAside(shown.label) : null
  return (
    <div className="mx-auto grid w-full max-w-[72rem] items-center gap-x-[clamp(2rem,6vw,6rem)] gap-y-8 @[50rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-w-0 flex-col gap-[clamp(1rem,3vh,2rem)]">
        <div className="flex flex-col gap-[clamp(0.625rem,2vh,1.125rem)]">
          <Slots caught={caught} said={false} />
          <div className="flex flex-wrap items-baseline gap-x-[0.5em] gap-y-1">
            <h1 className={HEADLINE}>{again ? `Another ${name}.` : `${/^[aeiou]/.test(name) ? 'An' : 'A'} ${name}.`}</h1>
            {aside && <p className="font-heading text-[clamp(1.125rem,min(2.6vw,3.6vh),1.75rem)] text-(--mf-wl-body) italic">{aside}</p>}
          </div>
          <p className={`${BODY} max-w-[34ch]`}><Says capture={shown} /></p>
        </div>
        {kinds.length >= 3 ? (
          <p className={QUIET}>Three kinds, one box for all of them.</p>
        ) : (
          <div className="flex flex-col gap-1">
            <p className={QUIET}>{again ? 'For the next slot, another kind:' : 'Next, try:'}</p>
            <Starters left={left} onStart={onStart} small />
          </div>
        )}
      </div>
      <div className="flex w-full min-w-0 justify-center [@media(max-height:520px)]:hidden">
        <Shows key={shown.id} capture={shown} />
      </div>
    </div>
  )
}

/** Kinds already given their little arrival, so a slot pops in once, not every time the box comes and goes. */
const popped = new Set<string>()

/** Three slots, filling with each new kind caught: its icon and its name. */
function Slots({ caught, said = true }: { caught: CaptureMeta[]; said?: boolean }): React.JSX.Element {
  const firsts = kindsOf(caught).map((kind) => caught.find((one) => one.kind === kind) as CaptureMeta)
  const quiet = still()
  useEffect(() => void firsts.forEach((one) => popped.add(one.id)))
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
    <ol aria-label={`${Math.min(firsts.length, 3)} of 3 kinds caught`} className="flex flex-wrap gap-2">
      {[0, 1, 2].map((i) => {
        const first = firsts[i]
        const type = first ? typeOf(first.kind) : null
        const Icon = type?.icon
        return (
          <li key={i} className={`flex h-8 min-w-[6.5rem] items-center justify-center rounded-full border px-3 text-[0.8125rem] font-medium ${type ? 'border-foreground/15 bg-background/85 text-foreground' : 'border-dashed border-foreground/25'}`}>
            {type && Icon && (
              <motion.span key={first.id} className="flex items-center gap-1.5"
                initial={quiet || popped.has(first.id) ? false : { opacity: 0, transform: 'scale(0.6)' }} animate={{ opacity: 1, transform: 'scale(1)' }}
                transition={{ type: 'spring', duration: 0.4, bounce: 0.35, delay: 0.15 }}>
                <Icon className="size-4" style={{ color: type.tint }} />{type.label}
              </motion.span>
            )}
          </li>
        )
      })}
    </ol>
      {said && firsts.length < 3 && <span aria-hidden className="text-[0.8125rem] text-(--mf-wl-quiet)">{firsts.length ? `${counted(firsts.length)} of three` : 'Three kinds to catch'}</span>}
    </div>
  )
}

/** The starters still to try, each with its kind beside it and a number key; a click types it into the box. */
function Starters({ left, onStart, small = false }: { left: Starter[]; onStart: (text: string) => void; small?: boolean }): React.JSX.Element {
  return (
    <ol className="flex max-w-[46rem] flex-col">
      {left.map((one, i) => {
        const type = typeOf(one.kind)
        const Icon = type.icon
        return (
          <li key={one.kind}>
            <button type="button" onClick={() => onStart(one.text)}
              className="group -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-3 rounded-xl px-3 py-[clamp(0.375rem,1.2vh,0.625rem)] text-left transition-[background-color,transform] duration-150 hover:bg-foreground/[0.06] active:scale-[0.99]">
              <Kbd className="shrink-0 text-(--mf-wl-quiet)">{i + 1}</Kbd>
              <span className={`min-w-0 flex-1 truncate font-heading text-foreground ${small ? 'text-[clamp(1rem,min(1.9vw,2.8vh),1.25rem)]' : 'text-[clamp(1.125rem,min(2.4vw,3.4vh),1.625rem)]'}`}>{one.text}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-[0.8125rem] text-(--mf-wl-quiet)">
                <Icon className="size-4" style={{ color: type.tint }} />{type.label}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** A quote's words without their marks, and who said it: the box's Who said it, or a name after a dash. */
function quoteOf(capture: CaptureMeta): { words: string; who: string } {
  const line = capture.label.split('\n')[0].trim()
  const [, said = line, by = ''] = /^["“'](.+?)["”']\s*(?:[-–]\s*(.+))?$/.exec(line) ?? []
  return { words: said.trim(), who: (capture.attribution || by).trim() }
}

/** A word on its own, and its meaning if one was written after a dash or a colon. */
function wordOf(capture: CaptureMeta): { term: string; meaning: string } {
  const line = capture.label.split('\n')[0].trim()
  const [, term = line, meaning = ''] = /^(.+?)\s+[-–:]\s+(.+)$/.exec(line) ?? /^(.+?):\s*(.+)$/.exec(line) ?? []
  return { term: term.replace(/^(define|what does)\s+/i, '').replace(/\s+(meaning|mean\??)$/i, '').trim(), meaning: meaning.trim() }
}

/** What the kind just caught does, in a sentence or two. */
function Says({ capture }: { capture: CaptureMeta }): React.JSX.Element {
  const strong = 'text-foreground'
  if (capture.kind === 'todo') {
    const read = readTask(capture.label.split('\n')[0])
    if (!read.due) return <>It is in your tasks. Put a day in the words, like “friday”, and it shows in Today on that day.</>
    const today = dayjs(read.due).isSame(dayjs(), 'day')
    return <>Vigil read <span className={strong}>{whenInLine(read.due, read.allDay).replace(/ (\d)/, ' at $1')}</span> in your words. {today ? 'It is in Today, in your tasks.' : 'It waits in your tasks, and shows in Today on the day.'}</>
  }
  if (capture.kind === 'quote') {
    const { who } = quoteOf(capture)
    const now = dayjs()
    const date = <span className={`${strong} whitespace-nowrap`} aria-label={now.add(1, 'year').format('D MMMM YYYY')}><span aria-hidden>{now.format('D MMMM')} <RollingYear from={now.year()} /></span></span>
    return who
      ? <>Back in your Inbox on {date}, a year to the day, signed by {who}.</>
      : <>Back in your Inbox on {date}, a year to the day. Say who said it, and it comes back signed.</>
  }
  if (capture.kind === 'word') {
    return wordOf(capture).meaning
      ? <>A card now: Review asks you what it means, on days further and further apart, until it sticks.</>
      : <>Write what it means under it, and it becomes a card: Review asks you, on days further and further apart, until it sticks.</>
  }
  if (capture.kind === 'link') {
    const named = !!capture.title && !/^https?:/.test(capture.title)
    return <>{named ? 'Vigil fetched the name of the page' : 'Vigil is fetching the name of the page'}, so you find it by what it is, not by its address.</>
  }
  if (capture.kind === 'decision') return <>Kept with its reason, the first thing forgotten: the box asks why on the line under it.</>
  if (capture.kind === 'excerpt') return <>Kept whole, so you can lift out the lines you want later.</>
  if (capture.kind === 'bit') return <>Kept for the next time you need a good line.</>
  return <>Kept as you wrote it. It comes back on its own: as a hint in the box, or a year from today.</>
}

/** What the kind does, shown with the app's own parts rather than told. */
function Shows({ capture }: { capture: CaptureMeta }): React.JSX.Element {
  if (capture.kind === 'todo') return <TaskShow capture={capture} />
  if (capture.kind === 'quote') return <QuoteShow capture={capture} />
  if (capture.kind === 'word') return <WordShow capture={capture} />
  if (capture.kind === 'link') return <LinkShow capture={capture} />
  return <NoteShow capture={capture} />
}

/** A panel as the app draws one, enlarged with the window. */
const PANEL = 'w-full max-w-[30rem] overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow) [zoom:1.1] @[56rem]:[zoom:1.2] @[80rem]:[zoom:1.4] [&_*]:!cursor-default'
/** A panel's arrival: from just above, through a breath of blur. */
const arrival = (quiet: boolean, delay = 0.08): object => quiet ? { initial: false } : { initial: { opacity: 0, transform: 'translateY(-10px)', filter: 'blur(2px)' }, animate: { opacity: 1, transform: 'translateY(0px)', filter: 'blur(0px)' }, transition: { delay, duration: 0.26, ease: EASE } }

/**
 * A todo: your words as typed, the day and time Vigil read in them lit, then
 * the task as your list shows it, filed under Today, Upcoming or Backlog.
 */
function TaskShow({ capture }: { capture: CaptureMeta }): React.JSX.Element {
  const quiet = still()
  useEffect(() => {
    const sound = setTimeout(() => chime('send'), quiet ? 0 : 340)
    return () => clearTimeout(sound)
  }, [quiet])
  const line = capture.label.split('\n')[0]
  const read = readTask(line)
  const spans = [...read.spans].sort((a, b) => a.from - b.from)
  const parts: ReactNode[] = []
  let from = 0
  spans.forEach((span, i) => {
    parts.push(line.slice(from, span.from), <span key={i} className="rounded-[0.2em] bg-primary/12 px-[0.15em] text-primary">{line.slice(span.from, span.to)}</span>)
    from = span.to
  })
  parts.push(line.slice(from))
  const place = !read.due ? 'Backlog' : dayjs(read.due).isSame(dayjs(), 'day') ? 'Today' : 'Upcoming'
  return (
    <div className="flex w-full max-w-[30rem] flex-col gap-3">
      {/* Your words, with what Vigil read in them lit; nothing read, nothing to show. */}
      {spans.length > 0 && <p className="px-1 text-[clamp(0.9375rem,min(1.9vw,2.8vh),1.1875rem)] text-(--mf-wl-body)">{parts}</p>}
      <motion.div className={PANEL} {...arrival(quiet)}>
        <p className="flex items-baseline gap-2 px-4 pt-3 pb-1 text-[0.8125rem] font-medium text-foreground">Tasks <span className="font-normal text-muted-foreground">{place}</span></p>
        <div className="flex items-center gap-3 px-4 pt-2 pb-3.5">
          <span aria-hidden className="size-4 shrink-0 rounded-full border-[1.5px] border-foreground/35" />
          <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-foreground">{read.title.trim() || line}</span>
          {read.due && (
            <span className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.75rem] font-medium text-primary tabular-nums">
              <CalendarDays className="size-3.5" />{when(read.due, read.allDay)}
            </span>
          )}
        </div>
      </motion.div>
    </div>
  )
}

/** A quote: next year's postcard, laid on the table a little askew and signed. */
function QuoteShow({ capture }: { capture: CaptureMeta }): React.JSX.Element {
  useEffect(() => chime('riffle'), [])
  const { words, who } = quoteOf(capture)
  return (
    <figure aria-hidden className="w-full max-w-[30rem]">
      {/* Drawn at the postcard's own size and enlarged whole, so its stamp and postmark keep their proportions. */}
      <div className="origin-center -rotate-[3deg] [zoom:1.1] @[50rem]:[zoom:1.25] @[80rem]:[zoom:1.5] [&>div]:shadow-[0_2px_3px_color-mix(in_oklab,var(--mf-shadow-ink)_14%,transparent),0_22px_44px_-16px_color-mix(in_oklab,var(--mf-shadow-ink)_42%,transparent)]">
        <MemoryPostcard at={new Date().toISOString()} seed={capture.id}>
          <p className="text-meta text-(--mf-wl-quiet)">A year ago today</p>
          <p className="clear-both mt-1 line-clamp-4 font-heading text-[1.125rem] leading-snug text-foreground [overflow-wrap:anywhere]">{words}</p>
          {who && <p className="mt-1 text-meta text-(--mf-wl-quiet)"><Signed who={who} /></p>}
        </MemoryPostcard>
      </div>
    </figure>
  )
}

/**
 * A word: the card Review will ask you, the question on its face and the
 * meaning on its back. Review's own card: a click, a drag or Space turns it.
 */
function WordShow({ capture }: { capture: CaptureMeta }): React.JSX.Element {
  const [over, setOver] = useState(false)
  const { term, meaning } = wordOf(capture)
  const turn = (to: boolean): void => {
    chime('tap')
    setOver(to)
  }
  useEffect(() => {
    const sound = setTimeout(() => chime('send'), still() ? 0 : 340)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== ' ' || event.metaKey || (event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return
      event.preventDefault()
      chime('tap')
      setOver((was) => !was)
    }
    window.addEventListener('keydown', onKey)
    return () => (clearTimeout(sound), window.removeEventListener('keydown', onKey))
  }, [])
  const face = 'flex h-full min-h-[10rem] flex-col justify-center rounded-xl border bg-background px-6 py-6 shadow-(--mf-panel-shadow)'
  return (
    <motion.div className="w-full max-w-[28rem] [zoom:1.05] @[56rem]:[zoom:1.15] @[80rem]:[zoom:1.35]" {...arrival(still())}>
      <Flip over={over} onTurn={turn}
        front={
          <div className={face}>
            <p className="text-xs text-muted-foreground">Review</p>
            <h2 className="mt-1.5 font-heading text-title font-semibold tracking-[-0.018em] text-balance text-foreground">What does “{term}” mean?</h2>
          </div>
        }
        back={
          <div className={face}>
            <p className="text-xs text-muted-foreground">What does “{term}” mean?</p>
            <p className="mt-1.5 font-heading text-[1.1875rem] leading-snug text-foreground">{meaning || 'Its meaning, in your own words, once you write it under the word.'}</p>
          </div>
        }
      />
      <p className="mt-3 text-center text-[0.8125rem] text-(--mf-wl-quiet)">Click it, or press <Kbd>Space</Kbd>, to turn it over.</p>
    </motion.div>
  )
}

/** A link: the page's name as it arrives, over its address. */
function LinkShow({ capture }: { capture: CaptureMeta }): React.JSX.Element {
  const quiet = still()
  useEffect(() => {
    const sound = setTimeout(() => chime('send'), quiet ? 0 : 340)
    return () => clearTimeout(sound)
  }, [quiet])
  const url = capture.label.match(/https?:\/\/\S+/)?.[0] ?? capture.label
  let host = url
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // Shown as written.
  }
  const named = !!capture.title && !/^https?:/.test(capture.title)
  // Still nothing after a while: offline, most likely, and said so rather than left waiting.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8000)
    return () => clearTimeout(timer)
  }, [])
  const Mark = typeOf('link').icon
  return (
    <motion.div className={PANEL} {...arrival(quiet)}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-foreground/[0.03]"><Mark className="size-4" style={{ color: typeOf('link').tint }} /></span>
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            {named ? (
              <motion.p key="named" className="truncate text-[0.9375rem] font-medium text-foreground" initial={quiet ? false : { opacity: 0, filter: 'blur(2px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.2 }}>{capture.title}</motion.p>
            ) : (
              <motion.p key="asking" className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground" exit={{ opacity: 0, transition: { duration: 0.1 } }}>
                {slow ? 'No answer from the page yet. Its name comes when it does.' : <>Fetching its name <span className="mf-listening" aria-hidden /></>}
              </motion.p>
            )}
          </AnimatePresence>
          <p className="truncate text-[0.8125rem] text-muted-foreground">{host}</p>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Anything else: the row as your Inbox holds it, timed to the frame. The
 * row arrives at 80ms from just above through a breath of blur, the sound at
 * 340ms as it settles (it says arrived, not sent), and at 600ms an ink line
 * under the first word you wrote. With Motion off, all of it at once, and
 * the sound still.
 */
function NoteShow({ capture }: { capture: CaptureMeta }): React.JSX.Element {
  const row = useRef<HTMLDivElement>(null)
  const [mark, setMark] = useState<{ left: number; top: number; width: number } | null>(null)
  const quiet = still()
  useEffect(() => {
    const sound = setTimeout(() => chime('send'), quiet ? 0 : 340)
    return () => clearTimeout(sound)
  }, [quiet])
  // The first word, found in the row as drawn, for the ink line under it.
  useLayoutEffect(() => {
    const find = (): void => {
      const box = row.current
      if (!box) return
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? ''
        const start = text.search(/\S/)
        if (start < 0 || (node.parentElement?.closest('[aria-hidden="true"], kbd, svg') ?? null)) continue
        const word = text.slice(start).match(/^\S+/)?.[0] ?? ''
        const range = document.createRange()
        range.setStart(node, start)
        range.setEnd(node, start + word.length)
        const rect = range.getBoundingClientRect()
        const outer = box.getBoundingClientRect()
        if (!rect.width) continue
        // The row is drawn larger than a list's (zoom): back into its own pixels.
        const z = outer.width / (box.offsetWidth || outer.width) || 1
        // A first word cut short by the row's ellipsis is underlined only as far as it shows.
        const shown = Math.min(rect.right, node.parentElement?.getBoundingClientRect().right ?? rect.right) - rect.left
        setMark({ left: (rect.left - outer.left) / z - 1, top: (rect.bottom - outer.top) / z + 1, width: Math.min(shown / z + 3, box.offsetWidth) })
        return
      }
    }
    const timer = setTimeout(find, quiet ? 0 : 340)
    return () => clearTimeout(timer)
  }, [quiet])
  const w = mark?.width ?? 0
  return (
    <div className={PANEL}>
      <p className="px-4 pt-3 pb-1 text-[0.8125rem] font-medium text-foreground">Inbox</p>
      <motion.div ref={row} className="relative w-full" {...arrival(quiet)}>
        {/* Your words whole, over two lines if they need them: never cut off at the moment they land. */}
        <NoteList groups={[['', [{ ...captureEntry({ ...capture, status: 'open' }), wrap: true }]]]} density="list" table="captures" cursor={-1} onPick={() => undefined} />
        {mark && (
          <svg aria-hidden className="pointer-events-none absolute overflow-visible" style={{ left: mark.left, top: mark.top, width: w, height: 6 }} viewBox={`0 0 ${w} 6`}>
            <path d={inkPath(w, capture.id)} pathLength={1} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round"
              className={`mf-mark ${quiet ? '' : 'mf-ink'}`} style={{ strokeDasharray: 1, strokeDashoffset: quiet ? 0 : 1 }} />
            {/* Margin marks off: the same line, ruled straight. */}
            <path d={`M1 3 H ${w - 1}`} pathLength={1} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round"
              className={`mf-unmarked ${quiet ? '' : 'mf-ink'}`} style={{ strokeDasharray: 1, strokeDashoffset: quiet ? 0 : 1 }} />
          </svg>
        )}
      </motion.div>
    </div>
  )
}

/**
 * What a year of it becomes, shown rather than listed. First the day you
 * just had, what you caught in the welcome; then an example year read back,
 * the way Your year, wrapped will read yours: the first screen's ruler, a
 * year on, its tall marks the days something was kept, and four things the
 * year found out about its reader, one at a time, a beat apart. Plainly
 * labelled an example: nothing on it is yours yet.
 */
function AYear({ calm, caught }: { calm: boolean; caught: CaptureMeta[] }): React.JSX.Element {
  useEffect(() => chime('riffle'), [])
  const quiet = calm || still()
  // The example's days kept: most of them, more as the habit takes, never
  // every one. Drawn a week to a mark, each as tall as the days kept in it,
  // so the year reads at a glance as the first screen's ruler, filled in.
  const [[path, days]] = useState(() => {
    let line = ''
    let n = 0
    for (let week = 0; week < 52; week++) {
      let kept = 0
      for (let d = week * 7; d < week * 7 + 7; d++) if (((d * 2654435761) >>> 0) % 100 < 38 + d / 6.5) kept++
      n += kept
      line += `M${week * 7 + 3.5} 26V${24 - kept * 3}`
    }
    return [line, n] as const
  })
  const found: [string, string][] = [
    ['You kept the most from Frankenstein.', '11 lines, more than from any other book'],
    ['You think best on Sunday evenings.', 'a third of all you caught, around 9pm'],
    ['You kept circling one question.', '“Who is the monster?” Four clues, then an answer'],
    ['You remembered 86%.', 'of what came back to you, on 112 different days']
  ]
  const arrive = (i: number): object => quiet ? {} : { initial: { opacity: 0, transform: 'translateY(6px)' }, animate: { opacity: 1, transform: 'translateY(0px)' }, transition: { delay: 0.9 + i * 0.5, duration: 0.32, ease: EASE } }
  return (
    <div className="mx-auto grid w-full max-w-[72rem] items-center gap-x-[clamp(2rem,6vw,6rem)] gap-y-8 @[50rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col gap-[clamp(0.75rem,2.6vh,1.5rem)]">
        {caught.length > 0 && (
          // The day you just had, as the start of it: what you caught, by kind.
          <div className="flex flex-col gap-2">
            <p className={FIGURES}>One day: {counted(caught.length).toLowerCase()} {caught.length === 1 ? 'thing' : 'things'}.</p>
            <ul aria-label="What you caught today" className="flex flex-wrap gap-2">
              {caught.slice(0, 6).map((one) => {
                const type = typeOf(one.kind)
                const Icon = type.icon
                return (
                  <li key={one.id} className="flex h-8 max-w-[14rem] items-center gap-1.5 rounded-full border border-foreground/15 bg-background/85 px-3 text-[0.8125rem] text-foreground">
                    <Icon className="size-4 shrink-0" style={{ color: type.tint }} /><span className="truncate">{one.label.split('\n')[0]}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        <h1 className={`${HEADLINE} max-w-[13ch]`}>{caught.length ? 'A year of days, read back to you.' : 'A year of it, read back to you.'}</h1>
        <p className={`${BODY} max-w-[30ch]`}>No more notes in three apps you never open again. One book, and once a year it shows you what you were like.</p>
      </div>
      <figure aria-label="An example year, read back" className="w-full max-w-[30rem] justify-self-center rounded-2xl border bg-background/90 p-[clamp(1rem,2.6vh,1.5rem)] shadow-(--mf-panel-shadow) [@media(max-height:520px)]:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-heading text-[1.0625rem] font-medium text-foreground">A year, wrapped</p>
          <span className="rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium tracking-[0.08em] text-(--mf-wl-quiet) uppercase">An example</span>
        </div>
        <svg aria-hidden viewBox="0 0 365 26" preserveAspectRatio="none" className="mt-3 h-7 w-full overflow-visible">
          <path d={path} stroke="var(--foreground)" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" fill="none" opacity={0.7} className={quiet ? '' : 'mf-sweep'} />
        </svg>
        <p className="mt-1.5 text-[0.75rem] text-(--mf-wl-quiet)">{days} days you kept something, a week to a mark</p>
        <ol className="mt-[clamp(0.75rem,2.4vh,1.25rem)] flex flex-col gap-[clamp(0.5rem,1.7vh,0.9rem)] border-t border-foreground/10 pt-[clamp(0.75rem,2.4vh,1.25rem)]">
          {found.map(([said, how], i) => (
            <motion.li key={said} {...arrive(i)}>
              <p className="font-heading text-[clamp(1.0625rem,min(2vw,2.9vh),1.375rem)] leading-tight text-foreground">{said}</p>
              <p className="mt-0.5 text-[0.8125rem] text-(--mf-wl-quiet)">{how}</p>
            </motion.li>
          ))}
        </ol>
      </figure>
    </div>
  )
}

/** This year turning into the next, its last figure rolling up like a counter's, once. Still with Motion off. */
function RollingYear({ from }: { from: number }): React.JSX.Element {
  const quiet = still() || byKeys()
  const [a, b] = [String(from), String(from + 1)]
  // Only the figures that change roll; the rest of the year stays put.
  let same = 0
  while (same < a.length && a[same] === b[same]) same++
  return (
    <span className="whitespace-nowrap tabular-nums">
      {b.slice(0, same)}
      <span className="relative inline-flex overflow-hidden align-bottom [clip-path:inset(0_-0.1em)]">
        <span className="invisible">{b.slice(same)}</span>
        <motion.span className="absolute inset-x-0 top-0 flex flex-col"
          initial={quiet ? false : { transform: 'translateY(0%)' }} animate={{ transform: 'translateY(-50%)' }}
          transition={{ delay: 0.45, type: 'spring', duration: 0.5, bounce: 0.12 }}>
          <span>{a.slice(same)}</span>
          <span>{b.slice(same)}</span>
        </motion.span>
      </span>
    </span>
  )
}

/** The centrepiece: the dial in the middle of the window, which wears each theme it passes; the words set in the corner beside it. */
function Yours({ onPick }: { onPick: (theme: Theme) => void }): React.JSX.Element {
  const [say, setSay] = useState<string | undefined>()
  const win = useWindowSize()
  const size = Math.round(Math.max(140, Math.min(win.height * 0.44, win.width * 0.3, 360)))
  return (
    // The dial in the middle; the words low at its left, ending where it does.
    <div className="mx-auto grid w-full max-w-[72rem] grid-cols-[minmax(0,1fr)_auto] items-end gap-x-[clamp(1.5rem,4vw,4rem)] @[50rem]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <div className="flex flex-col gap-[clamp(0.5rem,1.8vh,1.25rem)] pb-[clamp(0rem,3vh,2rem)]">
        <h1 className={`${HEADLINE} max-w-[13ch]`}>The page you will write on.</h1>
        <p className={`${QUIET} max-w-[24ch] [@media(max-height:560px)]:hidden`}>
          Turn it with <span className="inline-flex translate-y-[-0.08em] gap-[0.12em] align-middle"><Kbd className={LINE_KEY}>↑</Kbd><Kbd className={LINE_KEY}>↓</Kbd></span>, the wheel or a drag. Settings has it later.
        </p>
      </div>
      <ThemeDial size={size} big onPick={onPick} onFullTurn={() => (setSay(FULL_TURN), setTimeout(() => setSay(undefined), 1800))} say={say} />
    </div>
  )
}

/**
 * The end: a decision already made for you, with two quieter ways round it.
 * Your empty book is ready and the button below opens it; the sandbox and
 * your old notes are a line of small links, each with its number key. The
 * arrow at the top of the window points at Vigil in the menu bar, so the
 * words do not have to.
 */
function Start({ name, kept, skipped, importing, onPick, onFiles }: { name: string; kept: number; skipped: false | 'first' | 'later'; importing: boolean; onPick: (pick: 1 | 2 | 3) => void; onFiles: () => void }): React.JSX.Element {
  const others: { key: 2 | 3; title: string }[] = [
    { key: 2, title: 'Try the sandbox first' },
    { key: 3, title: 'Bring my notes' }
  ]
  const link = 'group flex items-center gap-2 rounded-[0.6rem] px-3 py-1.5 -mx-3 text-foreground transition-colors hover:bg-foreground/[0.06] active:scale-[0.98]'
  return (
    <div className="mr-auto flex w-full max-w-[58rem] flex-col gap-[clamp(1.25rem,4.5vh,3rem)]">
      <div className="flex flex-col gap-[clamp(0.5rem,1.8vh,1rem)]">
        <h1 className={`${HEADLINE_XL} max-w-[14ch]`}>{name ? `Your book is ready, ${name}.` : 'Your book is ready.'}</h1>
        <p className={`${BODY} max-w-[30ch]`}>{kept ? `${counted(kept)} ${kept === 1 ? 'thing' : 'things'} in it already.` : 'Empty for now.'} <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> {kept ? 'adds the next' : 'fills it'}, from any app.</p>
        {skipped && <p role="status" className={`${QUIET} max-w-[48ch]`}>{skipped === 'first' && <span className="italic">{WANDER} </span>}The welcome waits in the Vigil menu and ⌘K.</p>}
      </div>
      <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 ${QUIET} [@media(max-height:440px)]:hidden`}>
        <span className="-mr-3">Or</span>
        {others.map((row) => (
          <button key={row.key} type="button" onClick={() => onPick(row.key)} className={link}>
            {row.title}
            <Kbd className="text-(--mf-wl-quiet)">{row.key}</Kbd>
          </button>
        ))}
      </div>
      {importing && (
        <div className="-mt-[clamp(0.5rem,2vh,1.5rem)] flex flex-wrap gap-2">
          <button type="button" onClick={() => onPick(3)} className="h-9 rounded-[0.6rem] bg-primary px-4 text-[0.875rem] font-semibold text-primary-foreground active:scale-[0.97]">A folder: Obsidian or Notion…</button>
          <button type="button" onClick={onFiles} className="h-9 rounded-[0.6rem] border px-4 text-[0.875rem] font-medium text-foreground hover:bg-foreground/[0.05] active:scale-[0.97]">Files: Markdown, Readwise, Kindle, Anki…</button>
        </div>
      )}
    </div>
  )
}

/** Whether the welcome is on screen, for what should keep quiet under it. */
export const welcoming = (): boolean => document.documentElement.hasAttribute('data-welcoming')
export { inClay }
