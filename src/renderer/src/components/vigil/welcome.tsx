import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, ArrowUp, CornerDownLeft, NotebookText } from 'lucide-react'
import { EASE, byKeys, hush, shift, speak } from '@/lib/motion'
import { chime, click } from '@/lib/sound'
import { applyTheme, type Theme } from '@/lib/theme'
import { comboOf, keyFor, listen, saveKeys, useKeyChanges } from '@/lib/keys'
import { onboarding, type Onboarding } from '@/lib/onboarding'
import { vigil } from '@/lib/vigil'
import { enterSandbox } from '@/lib/sandbox'
import { EXAMPLES } from '@/lib/welcome-box'
import { CaptureList, captureEntry, type CaptureMeta } from '@/components/capture-list'
import { NoteList } from './note-list'
import { dayjs } from '../../../../main/dates'
import { Scenery } from './scenery'
import { NOISE } from './grain'
import { MemoryPostcard } from './memory-postcard'
import { Signed } from './signature'
import { inkPath, ringPath } from './marks'
import { ThemeDial } from './theme-dial'
import { Kbd, toast } from './ui'
import { FULL_TURN, WANDER, glyph, inClay, konami, landedAside } from './welcome-eggs'

/**
 * The welcome: seven screens over the whole main window, the first time
 * Vigil opens (and again from the Vigil menu, ⌘K or Settings).
 *
 *   0 hello: the line types itself; a year of days, today lit
 *   1 the one key: the caps press as the real keys go down, anywhere
 *   2 catch something: in the real box; this screen waits for it
 *   3 it landed: your real Inbox row, an ink line under your first word
 *   4 it comes back: your words as next year's postcard
 *   5 make it yours: the theme dial
 *   6 how to start: fresh, the sandbox, or your notes
 *
 * Esc always works: before the last screen it goes to it (never into an
 * empty app), and on it, it closes. Keys swap screens at once; a click
 * swaps them with a short rise. Only the app's own answers move: your
 * capture landing, the caps under your fingers.
 */

const SCREENS = 7
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
 * The hour noticed, with a wink rather than a receptionist's "Good evening":
 * a line from something you might have watched, picked by the time of day.
 */
function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 5) return 'The night is darkest just before the dawn. A good hour for a thought.'
  if (hour < 12) return 'Good morning, in all four of Gandalf\'s meanings.'
  if (hour < 18) return 'An afternoon on Tatooine would have two suns. This one has you.'
  return 'Captain\'s log, evening entry.'
}

/** The newest capture typed into Vigil that was not there when the welcome opened. */
const newest = (list: CaptureMeta[], before: Set<string>): CaptureMeta | null =>
  list.filter((one) => !before.has(one.id) && !one.source).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0] ?? null

// --- small parts ----------------------------------------------------------------

/**
 * A line that types itself at 38ms a letter, with a pause after a full stop
 * and a caret in the accent that blinks at the Mac's rate and goes once the
 * line has rested. Any key finishes it at once: reading never waits on it.
 */
function TypeLine({ text, className }: { text: string; className?: string }): React.JSX.Element {
  const [n, setN] = useState(() => (still() ? text.length : 0))
  const [resting, setResting] = useState(false)
  // The screen's one voice while it types: the ring round today waits for it (lib/motion.ts).
  const voice = useId()
  useState(() => n < text.length && speak(voice, text, 10000, true))
  useEffect(() => () => hush(voice), [voice])
  useEffect(() => {
    if (n >= text.length) {
      hush(voice)
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

/** Whether today is in the second half of the year: the first screen's words then sit high, clear of it. */
const lateInYear = (): boolean => dayjs().month() >= 6

/**
 * The year, as a field of dots behind the first screen: a month a row and a
 * day a dot, so the short months end short, the days gone a little stronger
 * than the days to come, today lit and ringed by hand. It fills the window
 * edge to edge; the words sit in the half of it today is not in, where it
 * fades back.
 */
function YearField({ calm }: { calm: boolean }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = (): void => setRoom({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const today = dayjs().startOf('day')
  const start = today.startOf('year')
  const quiet = calm || still()
  const w = room?.w ?? 0
  const h = room?.h ?? 0
  const sx = w / 31
  const sy = h / 12
  const s = Math.min(sx, sy)
  const months = Array.from({ length: 12 }, (_, m) => start.add(m, 'month'))
  const days = today.endOf('year').diff(start, 'day') + 1
  const at = today.diff(start, 'day')
  const cx = (today.date() - 0.5) * sx
  const cy = (today.month() + 0.5) * sy
  // The note beside today, on whichever side has the room.
  const leftward = today.date() > 20
  return (
    <figure aria-label={`Today, day ${at + 1} of ${days}`} className="pointer-events-none absolute top-0 bottom-16 left-[calc(50%-50vw+clamp(1rem,3vw,2.5rem))] right-[calc(50%-50vw+clamp(1rem,3vw,2.5rem))]">
      <div ref={box} className="absolute inset-0">
        {s > 0 && (
          <>
            <svg aria-hidden width={w} height={h} className={`absolute inset-0 overflow-visible ${lateInYear() ? 'mf-year-field-top' : 'mf-year-field'}`}>
              {months.flatMap((month, m) => Array.from({ length: month.daysInMonth() }, (_, d) => {
                const day = month.date(d + 1)
                const now = day.isSame(today, 'day')
                const gone = day.isBefore(today, 'day')
                const far = Math.hypot(d + 1 - today.date(), (m - today.month()) * 2)
                return (
                  <circle key={`${m}-${d}`} cx={(d + 0.5) * sx} cy={(m + 0.5) * sy} r={now ? Math.max(3, s * 0.13) : Math.max(1.5, s * 0.075)}
                    className={`${now ? 'fill-primary' : 'fill-foreground'} ${quiet ? '' : 'mf-dot-in'}`}
                    style={{ opacity: now ? 1 : gone ? 0.46 : 0.17, animationDelay: quiet ? undefined : `${Math.round(60 + far * 8)}ms` } as CSSProperties} />
                )
              }))}
              {/* Today, ringed: a loose ring by hand, written once the line
                  above has been typed; a drawn circle with Margin marks off. */}
              <circle cx={cx} cy={cy} r={s * 0.42} fill="none" stroke="var(--primary)" strokeWidth={1.2} opacity={0.6} className={`mf-unmarked ${quiet ? '' : 'mf-dot-in'}`} style={{ animationDelay: quiet ? undefined : '80ms' }} />
              <path d={ringPath(cx, cy, s * 0.62, s * 0.5, today.format('YYYY-MM-DD'))} pathLength={1} fill="none" stroke="var(--primary)" strokeWidth={1.6} strokeLinecap="round" opacity={0.8}
                className={`mf-mark ${quiet ? '' : 'mf-pen'}`} style={{ strokeDasharray: 1, strokeDashoffset: quiet ? 0 : 1, animationDelay: quiet ? undefined : '150ms' }} />
            </svg>
            <figcaption className={`absolute -translate-y-1/2 rounded-md bg-background/85 px-2 py-0.5 whitespace-nowrap ${QUIET}`}
              style={leftward ? { right: w - cx + s * 0.8, top: cy } : { left: cx + s * 0.8, top: cy }}>
              <span className="text-foreground">{today.format('dddd D MMMM')}.</span> Day one.
            </figcaption>
          </>
        )}
      </div>
    </figure>
  )
}

/** The progress: one dot a screen, the current one a capsule. Seen ones can be gone back to. */
function Dots({ at, seen, onGo }: { at: number; seen: number; onGo: (to: number) => void }): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <span className="sr-only">Step {at + 1} of {SCREENS}</span>
      {Array.from({ length: SCREENS }, (_, i) => (
        <button key={i} type="button" aria-hidden tabIndex={-1} disabled={i > seen || i === at} onClick={() => onGo(i)}
          className="relative flex h-4 items-center justify-center disabled:cursor-default" style={{ width: i === at ? 14 : 6 }}>
          <span className={`block h-1.5 w-full rounded-full transition-colors duration-200 ${i <= seen ? 'bg-foreground/35' : 'bg-foreground/15'}`} />
          {i === at && <motion.span layoutId="mf-welcome-dot" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground"
            transition={byKeys() || still() ? { duration: 0 } : { duration: 0.24, ease: EASE }} />}
        </button>
      ))}
    </div>
  )
}

/** The one orange button: what this screen does next, with its key. */
function Primary({ children, keys = '↵', onClick, hidden = false }: { children: ReactNode; keys?: ReactNode; onClick: () => void; hidden?: boolean }): React.JSX.Element {
  return (
    <button type="button" onClick={onClick} tabIndex={hidden ? -1 : 0} aria-hidden={hidden || undefined}
      className={`flex h-[clamp(2.25rem,5vmin,3rem)] items-center gap-2 rounded-full bg-primary pr-1.5 pl-4 text-[clamp(0.875rem,2vmin,1.15rem)] font-semibold whitespace-nowrap text-primary-foreground transition-[opacity,transform,background-color] duration-200 ease-(--mf-ease) hover:bg-primary/90 active:scale-[0.97] ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
      {children}
      <span className="flex items-center gap-0.5">
        {typeof keys === 'string' ? <Kbd className="h-6 min-w-6 rounded-full border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground">{keys === '↵' ? <CornerDownLeft className="size-3" strokeWidth={2.4} /> : keys}</Kbd> : keys}
      </span>
    </button>
  )
}

// --- the welcome ----------------------------------------------------------------

export function Welcome(): React.JSX.Element | null {
  const [at, setAtState] = useState(-1)
  // How far you have been, for the dots.
  const [seen, setSeen] = useState(0)
  // Opened again from a menu: nothing is first about it.
  const [replay, setReplay] = useState(false)
  // Skipped ahead, and from where: the first screen gets a line of its own.
  const [skipped, setSkipped] = useState<false | 'first' | 'later'>(false)
  const [state, setState] = useState<Onboarding | null>(null)
  const [caught, setCaught] = useState<CaptureMeta | null>(null)
  // How the screen was reached, for whether it rises in: a key, a click, or the app answering.
  const [how, setHow] = useState<'key' | 'pointer' | 'app'>('app')
  const before = useRef<Set<string>>(new Set())
  // The theme the dial was left on, kept when you move on.
  const picked = useRef<Theme | null>(null)
  const veteran = useRef(false)

  const go = (to: number, by: 'key' | 'pointer' | 'app' = byKeys() ? 'key' : 'pointer'): void => {
    if (to < 0 || to > LAST) return
    setHow(by)
    setAtState(to)
    setSeen((was) => Math.max(was, to))
  }

  const open = (again: boolean): void => {
    void Promise.all([window.api.captures.list(), onboarding.state()]).then(([list, now]) => {
      before.current = new Set(list.map((one) => one.id))
      // Notes from before the welcome existed: someone who knows Vigil already.
      veteran.current = !now.welcomed && list.length > 0
      setState(now)
    })
    picked.current = null
    setCaught(null)
    setSkipped(false)
    setReplay(again)
    setSeen(0)
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
    void onboarding.set({ welcoming: at === 1 || at === 2 })
    document.documentElement.toggleAttribute('data-welcoming', at >= 0)
  }, [at])

  // Whether the real box is up over the welcome: the words then keep clear of it.
  const [boxUp, setBoxUp] = useState(false)
  useEffect(() => {
    if (at < 0) return
    const offShown = window.api.onBoxShown(() => setBoxUp(true))
    const offAway = window.api.onBoxAway(() => setBoxUp(false))
    return () => (offShown(), offAway())
  }, [at < 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Your first capture, the moment it is saved.
  useEffect(() => {
    if (at !== 1 && at !== 2) return
    return window.api.captures.onChange(() => void window.api.captures.list().then((list) => {
      const found = newest(list, before.current)
      if (!found) return
      setCaught(found)
      go(3, 'app')
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
    if (at === 5 && picked.current) applyTheme(picked.current)
    // No capture, nothing landed: past the landing.
    if (at === 2 && !caught) return go(4)
    go(at + 1)
  }
  const back = (): void => {
    if (at <= 0) return void chime('nope')
    chime('page')
    go(at === 4 && !caught ? 2 : at - 1)
  }
  const openBox = (): void => {
    chime('open')
    window.api.showPrompt()
  }

  // The keys, ahead of everything else in the window while the welcome is up.
  useEffect(() => {
    if (at < 0) return
    const onKey = (event: KeyboardEvent): void => {
      if (konami(event.key)) {
        chime('finding')
        setAtState((now) => now) // redraw the caps
        setSeen((was) => was)
        setClayTick((n) => n + 1)
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const typing = (event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')
      if (typing) return
      if (event.key === 'Escape') skip()
      else if (event.key === 'Enter') primary[at]?.()
      else if (at === LAST && /^[123]$/.test(event.key)) choose(Number(event.key) as 1 | 2 | 3)
      else if (at === 5 && /^Arrow/.test(event.key)) {
        // The dial's own: turned from anywhere on the screen.
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

  const primary: Record<number, (() => void) | undefined> = {
    0: next,
    1: openBox,
    2: openBox,
    3: next,
    4: next,
    5: next,
    6: () => choose(1)
  }

  if (at < 0) return null
  const motionless = how === 'key' || still()
  return (
    <div role="dialog" aria-modal aria-label="Welcome to Vigil" className="mf-welcome fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background text-foreground [container-type:inline-size]">
      <Backdrop plain={at === LAST} />
      {/* Somewhere to hold the window by, clear of its buttons. */}
      <div className="relative h-11 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
      {at === LAST && <TrayArrow tray={state?.tray ?? null} />}
      {/* One frame for the words and the footer: in a large window they stay
          together in the middle, not scattered to its far corners. */}
      <div className="relative mx-auto flex min-h-0 w-full max-w-[84rem] flex-1 flex-col [@media(min-height:760px)]:my-auto [@media(min-height:760px)]:max-h-[48rem]">
      {/* The first screen's year, behind its words: there and gone with the screen. */}
      <AnimatePresence initial={false}>
        {at === 0 && (
          <motion.div key="year" className="absolute inset-0" initial={false} exit={{ opacity: 0, transition: { duration: motionless ? 0 : 0.12 } }}>
            <YearField calm={motionless} />
          </motion.div>
        )}
      </AnimatePresence>
      <main className="relative flex min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.section
            key={at}
            // Two lines of words crossing in one place read as one change through a breath of blur, not two pages stacked.
            initial={motionless ? false : { opacity: 0, transform: shift('translateY(6px)'), filter: 'blur(2px)' }}
            animate={{ opacity: 1, transform: shift('translateY(0px)'), filter: 'blur(0px)' }}
            exit={motionless ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, filter: 'blur(2px)', transition: { duration: 0.12, ease: EASE } }}
            transition={{ duration: 0.2, ease: EASE }}
            className={`w-full px-[clamp(1.5rem,5vw,4rem)] py-6 [@media(max-height:480px)]:py-2 ${at === 0 && lateInYear() ? 'mx-auto mb-auto mt-[clamp(0rem,2vh,1.5rem)]' : at === 2 && boxUp ? 'mx-auto mt-auto' : (PLACE[at] ?? 'm-auto')}`}
          >
            {at === 0 && <Hello replay={replay} />}
            {at === 1 && <OneKey state={state} onState={setState} onBox={() => go(2, 'app')} />}
            {at === 2 && <Catch boxUp={boxUp} />}
            {at === 3 && caught && <Landed capture={caught} />}
            {at === 4 && <ComesBack capture={caught} />}
            {at === 5 && <Yours onPick={(theme) => (picked.current = theme)} />}
            {at === LAST && <Start name={replay ? '' : (state?.name ?? '')} skipped={skipped} importing={importing} onPick={choose} onFiles={() => (leave('notes'), void window.api.importFrom('files'))} />}
          </motion.section>
        </AnimatePresence>
      </main>
      <footer className="relative grid h-[clamp(4rem,9vmin,5.5rem)] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-[clamp(1.5rem,5vw,4rem)]">
        {/* Its words in line with the headline above; the hover wash reaches out past them. */}
        <button type="button" onClick={skip} className="-ml-3 flex h-[clamp(2rem,4.6vmin,2.75rem)] items-center gap-2 justify-self-start rounded-full px-3 text-[clamp(0.875rem,2vmin,1.15rem)] text-(--mf-wl-quiet) transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]">
          {at === LAST ? 'Close' : 'Skip'} <Kbd>Esc</Kbd>
        </button>
        <Dots at={at} seen={seen} onGo={(to) => (chime('page'), go(to === 3 && !caught ? 2 : to, 'pointer'))} />
        <div className="justify-self-end">
          {at === 0 && <Primary onClick={next}>Show me</Primary>}
          {at === 1 && <LateButton onClick={openBox} />}
          {at === 2 && <Primary onClick={openBox} keys={<BoxKeys />} hidden={boxUp}>Open the box</Primary>}
          {(at === 3 || at === 4 || at === 5) && <Primary onClick={next}>Next</Primary>}
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
const HEADLINE_XL = 'font-heading text-[clamp(2.5rem,min(7.4vw,10.5vh),6.75rem)] leading-[0.98] font-medium tracking-[-0.034em] text-balance text-foreground'
/** Under something larger than itself: the keys, the dial. */
const HEADLINE_SM = 'font-heading text-[clamp(1.625rem,min(3.6vw,5.4vh),3.25rem)] leading-[1.08] font-medium tracking-[-0.022em] text-balance text-foreground'
const BODY = 'max-w-[32ch] text-[clamp(1.0625rem,min(2.5vw,3.6vh),1.75rem)] leading-[1.4] text-pretty text-(--mf-wl-body)'
const QUIET = 'text-[clamp(0.9375rem,min(2.2vw,3.2vh),1.5rem)] leading-snug text-(--mf-wl-quiet)'
/** Keys inside a line of the larger type: sized to it, not to the app's small caps. */
const LINE_KEY = 'h-[1.3em] min-w-[1.3em] rounded-[0.3em] px-[0.3em] text-[0.62em]'
/** Where each screen sits in the window: the first low, in its field; the rest in the middle. */
const PLACE: Record<number, string> = {
  0: 'mx-auto mt-auto mb-[clamp(0rem,3vh,2.5rem)]'
}

// --- the screens ------------------------------------------------------------------

/** The establishing shot: the year all round, the line typed into its quiet corner. */
function Hello({ replay }: { replay: boolean }): React.JSX.Element {
  return (
    <div className="flex max-w-[min(100%,44rem)] flex-col gap-[clamp(0.75rem,2.4vh,1.75rem)]">
      {replay ? <h1 className={HEADLINE_XL}>Vigil keeps what you notice.</h1> : <TypeLine text="Vigil keeps what you notice." className={HEADLINE_XL} />}
      <p className={BODY}>Catch a thought in two seconds. Nothing you keep goes stale, and the good things come back to you.</p>
      {/* The hour, on a line of its own: an aside, never a salesman's opener. */}
      <p className={`${QUIET} italic [@media(max-height:520px)]:hidden`}>{greeting()} Two minutes, and you can stop any time.</p>
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
        {caps.map((cap, i) => <Keycap key={`${cap}${i}`} label={glyph(cap, i === caps.length - 1)} down={down.has(i)} size={big} />)}
      </div>
      <div className="flex flex-col items-center gap-[clamp(0.5rem,1.6vh,1rem)]">
        <h1 className={HEADLINE_SM}>One key to remember</h1>
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
                From any app, press <InlineKeys keys={keys} /> and a small box opens. Try it now.
              </p>
              <p className={`flex items-center gap-2 ${QUIET}`}>
                <span className="mf-listening" aria-hidden />
                Listening for it
                <span aria-hidden className="opacity-50">·</span>
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
 * The box itself is the hero: large and in the middle, the words small above
 * it. With the real box up (it opens over the top of the screen), the picture
 * of it goes and the words wait low in the window, clear of it as it grows.
 */
function Catch({ boxUp }: { boxUp: boolean }): React.JSX.Element {
  useKeyChanges()
  const send = <InlineKeys keys={keyFor('⌘↵') || '⌘↵'} />
  return (
    <div className="mx-auto flex w-full max-w-[min(100%,54rem)] flex-col items-center gap-[clamp(1rem,3.6vh,2.25rem)] text-center">
      <div className="flex flex-col items-center gap-[clamp(0.375rem,1.2vh,0.75rem)]">
        <h1 className={boxUp ? HEADLINE : HEADLINE_SM}>{boxUp ? 'Write anything in the box.' : 'Catch something'}</h1>
        <p className={`${BODY} max-w-[34ch] text-balance`}>
          {boxUp ? <>{send} sends it. <span className="inline-flex translate-y-[-0.08em] align-middle"><Kbd className={LINE_KEY}>Esc</Kbd></span> puts it away.</> : <>A thing to buy, a line you liked, a half-idea. {send} sends it, and you are back where you were.</>}
        </p>
      </div>
      {!boxUp && <BoxPreview />}
      {/* The box has the cursor, so the first key wipes its example: here they keep coming while you type. */}
      {boxUp && <Example />}
    </div>
  )
}

/** The box's examples, one after another, quietly under the words while the real box is up. */
function Example(): React.JSX.Element {
  const { shown } = useExample()
  return <p aria-hidden className={`${QUIET} min-h-[1.4em]`}>Like: <span className="text-(--mf-wl-body)">{shown}</span></p>
}

/** The box's examples typed in turn, one at a time, still when Motion is off. */
function useExample(): { line: string; shown: string; typing: boolean; quiet: boolean } {
  const [n, setN] = useState(0)
  const [typed, setTyped] = useState(0)
  const line = EXAMPLES[n % EXAMPLES.length]
  const quiet = still()
  // The screen's voice for as long as it is up: the scenery holds still behind it.
  const voice = useId()
  useState(() => !quiet && speak(voice, 'box preview', 600000, true))
  useEffect(() => () => hush(voice), [voice])
  useEffect(() => {
    if (quiet || typed < line.length) {
      const timer = setTimeout(() => (quiet ? setN((was) => was + 1) : setTyped((was) => was + 1)), quiet ? 3000 : typed === 0 ? 500 : 38)
      return () => clearTimeout(timer)
    }
    const rest = setTimeout(() => (setTyped(0), setN((was) => was + 1)), 2600)
    return () => clearTimeout(rest)
  }, [typed, line, quiet])
  return { line, shown: quiet ? line : line.slice(0, typed), typing: !quiet && typed < line.length, quiet }
}

/**
 * What the box looks like, writing the same examples the real one shows
 * while it waits: so the thing that opens is already familiar. Not a
 * control; the real box is a key away.
 */
function BoxPreview(): React.JSX.Element {
  const { shown, typing } = useExample()
  return (
    <figure aria-hidden className="w-full text-left">
      <div className="pointer-events-none overflow-hidden rounded-[clamp(1rem,2vw,1.5rem)] border border-foreground/10 bg-background shadow-(--mf-panel-shadow)">
        <p className="min-h-[clamp(4.5rem,22vh,12rem)] px-[1em] pt-[0.8em] text-[clamp(1.25rem,min(3.2vw,4.6vh),2.5rem)] leading-snug text-foreground">
          {shown}
          <span className={`mf-caret ${typing ? 'mf-caret-typing' : ''}`} />
        </p>
        <div className="flex items-center gap-[0.5em] border-t border-foreground/[0.07] px-[1.1em] py-[0.6em] text-[clamp(0.875rem,min(2.2vw,3.2vh),1.375rem)] text-(--mf-wl-quiet)">
          <NotebookText className="size-[1em]" strokeWidth={1.75} />
          Note
          <span className="ml-auto flex h-[1.9em] items-center gap-[0.4em] rounded-[0.4em] bg-foreground/[0.07] px-[0.65em] font-medium text-foreground">
            Create <span className="text-[0.85em] opacity-70">{keyFor('⌘↵') || '⌘↵'}</span>
          </span>
        </div>
      </div>
    </figure>
  )
}

/**
 * The Inbox around your capture: your own rows already waiting there, newest
 * first, never made-up ones. Safe mode volunteers none of them; quiet hours
 * keep the private ones back, as everything the app offers unasked does.
 */
async function waiting(capture: CaptureMeta): Promise<CaptureMeta[]> {
  const [list, settings] = await Promise.all([window.api.captures.list(), vigil.settings().catch(() => null)])
  if (settings?.safeMode) return []
  const { quietStart: from = '', quietEnd: to = '' } = settings ?? {}
  const now = new Date().toTimeString().slice(0, 5)
  const hush = from <= to ? now >= from && now < to : now >= from || now < to
  return list
    .filter((one) => one.id !== capture.id && one.status === 'open' && !one.archivedAt && !(hush && one.private))
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    .slice(0, 3)
}

/**
 * The moment it lands, timed to the frame: the line changes at once, the
 * row arrives at 80ms from just above through a breath of blur, the sound at
 * 340ms as it settles (it says arrived, not sent), and at 600ms an ink line
 * under the first word you wrote. With Motion off, all of it at once, and the
 * sound still.
 */
function Landed({ capture }: { capture: CaptureMeta }): React.JSX.Element {
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
  const aside = landedAside(capture.label)
  const w = mark?.width ?? 0
  // The ones before it, as your Inbox holds them: faded, there for scale.
  const [earlier, setEarlier] = useState<CaptureMeta[] | null>(null)
  useEffect(() => {
    let live = true
    void waiting(capture).then((list) => live && setEarlier(list), () => live && setEarlier([]))
    return () => void (live = false)
  }, [capture])
  const arrive = { delay: 0.08, duration: 0.26, ease: EASE }
  return (
    // The moment, as it is in the Inbox: a calm column, yours arriving at the
    // top and the ones before it moving down to make room; the words beside it.
    <div className="mx-auto grid w-full max-w-[72rem] items-center gap-x-[clamp(2rem,5vw,5rem)] gap-y-[clamp(1.25rem,4vh,3rem)] @[56rem]:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="pointer-events-none overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow) [zoom:1.2] @[56rem]:order-2 @[56rem]:[zoom:1.55] @[80rem]:[zoom:1.75] [&_*]:!cursor-default">
        <p className="px-4 pt-3 pb-1 text-[0.8125rem] font-medium text-foreground">Inbox</p>
      <motion.div ref={row} className="relative w-full"
        initial={quiet ? false : { opacity: 0, transform: 'translateY(-10px)', filter: 'blur(2px)' }}
        animate={{ opacity: 1, transform: 'translateY(0px)', filter: 'blur(0px)' }}
        transition={arrive}>
          {/* Shown as it waits in the Inbox: one the box also made a task still reads as just caught. */}
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
        {earlier?.length ? (
          <motion.div aria-hidden className="opacity-40 [mask-image:linear-gradient(to_bottom,black_30%,transparent)] [@media(max-height:560px)]:hidden"
            initial={quiet ? false : { transform: 'translateY(-3.25rem)' }} animate={{ transform: 'translateY(0rem)' }} transition={arrive}>
            <CaptureList groups={[['', earlier]]} cursor={-1} onPick={() => undefined} />
          </motion.div>
        ) : earlier && (
          // Nothing before it: the first thing in your Inbox, over a quiet ruled column waiting for the rest.
          <motion.div aria-hidden className="mx-4 [mask-image:linear-gradient(to_bottom,black_40%,transparent)] [@media(max-height:560px)]:hidden"
            initial={quiet ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...arrive, delay: 0.34 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex h-[3.25rem] items-center border-t border-foreground/[0.07] px-1 text-xs text-muted-foreground">
                {i === 0 && 'Everything you catch waits here, newest first.'}
              </div>
            ))}
          </motion.div>
        )}
      </div>
      <div className="flex flex-col gap-[clamp(0.5rem,1.6vh,1rem)]">
        <div className="flex flex-col gap-1">
          <h1 className={HEADLINE}>It landed.</h1>
          {aside && <p className="font-heading text-[clamp(1.125rem,min(2.6vw,3.6vh),1.75rem)] text-(--mf-wl-body) italic">{aside}</p>}
        </div>
        <p className={`${BODY} max-w-[34ch]`}>It waits in your Inbox. Nothing to sort now: later, a few minutes at a time.</p>
        <ol aria-label="How Vigil goes" className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 ${QUIET} [@media(max-height:520px)]:hidden`}>
          {['Catch', 'Wait', 'Tidy and Decide', 'Comes back'].map((step, i, all) => (
            // The arrow goes with the step before it, so a wrapped line never starts with one.
            <li key={step} className="flex items-center gap-2.5 whitespace-nowrap">
              <span className={i === 0 ? 'font-medium text-foreground' : ''}>{step}</span>
              {i < all.length - 1 && <ArrowRight aria-hidden className="size-[0.85em] opacity-60" strokeWidth={1.75} />}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

/**
 * Your own words, as the postcard they will be a year from today, laid large
 * on the table and a little askew; the words on the other side of it, and
 * the two other ways things come back.
 */
function ComesBack({ capture }: { capture: CaptureMeta | null }): React.JSX.Element {
  useEffect(() => chime('riffle'), [])
  const words = capture?.label?.split('\n')[0]?.trim() || 'The first thing you catch.'
  const year = dayjs().add(1, 'year')
  return (
    <div className="mx-auto grid w-full max-w-[72rem] items-center gap-x-[clamp(2rem,6vw,6rem)] gap-y-8 @[50rem]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <figure className="flex w-full max-w-[34rem] flex-col gap-[clamp(0.75rem,2.4vh,1.5rem)] justify-self-center [@media(max-height:520px)]:hidden">
        {/* Drawn at the postcard's own size and enlarged whole, so its stamp and postmark keep their proportions. */}
        <div className="origin-center -rotate-[3deg] [zoom:1.15] @[50rem]:[zoom:1.35] @[80rem]:[zoom:1.6] [&>div]:shadow-[0_2px_3px_color-mix(in_oklab,var(--mf-shadow-ink)_14%,transparent),0_22px_44px_-16px_color-mix(in_oklab,var(--mf-shadow-ink)_42%,transparent)]">
          <MemoryPostcard at={new Date().toISOString()} seed={capture?.id ?? 'welcome'}>
            <p className="text-meta text-(--mf-wl-quiet)">A year ago today</p>
            <p className="clear-both mt-1 line-clamp-3 font-heading text-[1.125rem] leading-snug text-foreground [overflow-wrap:anywhere]">{words}</p>
            {capture?.kind === 'quote' && capture.attribution && <p className="mt-1 text-meta text-(--mf-wl-quiet)"><Signed who={capture.attribution} /></p>}
          </MemoryPostcard>
        </div>
        <figcaption className={`pl-1 ${QUIET}`}>On <span className="text-foreground">{year.format('D MMMM YYYY')}</span>, this comes back to you.</figcaption>
      </figure>
      <div className="flex flex-col gap-[clamp(0.75rem,2.6vh,1.75rem)]">
        <h1 className={HEADLINE}>Then it comes back to you.</h1>
        {/* Three ways back, read top to bottom: a number to follow, the name large,
            what it does quiet beneath it, a hairline leading the eye down. */}
        <ol className="flex flex-col border-l border-foreground/15">
          {[
            ['On this day', 'What you caught a year ago.'],
            ['A hint in the box', 'Something you kept, as you open it.'],
            ['Review', 'What you want to remember, just before you would forget it.']
          ].map(([lead, rest], n) => (
            <li key={lead} className="relative flex flex-col gap-0.5 py-[clamp(0.35rem,1.2vh,0.75rem)] pl-[clamp(1rem,2vw,1.5rem)]">
              <span aria-hidden className="absolute top-[calc(clamp(0.35rem,1.2vh,0.75rem)+clamp(1.25rem,min(2.9vw,4.2vh),2rem)*0.64)] -left-[3px] size-[5px] rounded-full bg-foreground/50" />
              <span className="font-heading text-[clamp(1.25rem,min(2.9vw,4.2vh),2rem)] leading-tight font-medium text-foreground">
                <span className="mr-2 text-[0.6em] font-normal tabular-nums text-(--mf-wl-quiet)">{n + 1}</span>{lead}
              </span>
              <span className={`${QUIET} max-w-[34ch]`}>{rest}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

/** The centrepiece: the dial in the middle of the window, which wears each theme it passes; the words set in the corner beside it. */
function Yours({ onPick }: { onPick: (theme: Theme) => void }): React.JSX.Element {
  const [say, setSay] = useState<string | undefined>()
  const win = useWindowSize()
  const size = Math.round(Math.max(140, Math.min(win.height * 0.44, win.width * 0.3, 360)))
  return (
    <div className="mx-auto grid w-full max-w-[72rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[clamp(1.5rem,4vw,4rem)] @[50rem]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <div className="flex flex-col gap-[clamp(0.5rem,1.8vh,1.25rem)] @[50rem]:self-start @[50rem]:pt-[clamp(0rem,4vh,2.5rem)]">
        <h1 className={HEADLINE}>Make it yours.</h1>
        <p className={`${BODY} max-w-[24ch]`}>Pick the colours you will want to look at every day.</p>
        <p className={`${QUIET} max-w-[26ch] [@media(max-height:560px)]:hidden`}>
          Turn it with <span className="inline-flex translate-y-[-0.08em] gap-[0.12em] align-middle"><Kbd className={LINE_KEY}>←</Kbd><Kbd className={LINE_KEY}>→</Kbd></span>, the scroll wheel, or a spin. You can change it any time.
        </p>
      </div>
      <ThemeDial size={size} big onPick={onPick} onFullTurn={() => (setSay(FULL_TURN), setTimeout(() => setSay(undefined), 1800))} say={say} />
    </div>
  )
}

/** The three ways in, as rows: each a key, a name and one line. */
function Start({ name, skipped, importing, onPick, onFiles }: { name: string; skipped: false | 'first' | 'later'; importing: boolean; onPick: (pick: 1 | 2 | 3) => void; onFiles: () => void }): React.JSX.Element {
  useKeyChanges()
  const rows: { key: 1 | 2 | 3; title: string; line: string }[] = [
    { key: 1, title: 'Start fresh', line: 'Your own empty Vigil. A short checklist on Home shows you the rest.' },
    { key: 2, title: 'Explore the sandbox', line: 'A practice copy full of examples, kept by Nisaba, the Sumerian goddess of writing. Nothing you do there touches your notes.' },
    { key: 3, title: 'Bring my notes', line: 'From Obsidian, Notion, Markdown, Readwise, Kindle or Anki.' }
  ]
  const stagger = !byKeys() && !still()
  return (
    // A plain page and a quiet list: the choice, without a frame round it.
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-[clamp(0.75rem,2.6vh,1.75rem)]">
      <div className="flex flex-col gap-2">
        <h1 className={`${HEADLINE} max-w-[18ch]`}>{name ? `How do you want to start, ${name}?` : 'How do you want to start?'}</h1>
        {skipped && <p role="status" className={`${QUIET} max-w-[48ch]`}>{skipped === 'first' && <span className="italic">{WANDER} </span>}Skipped ahead. The welcome is in the Vigil menu and ⌘K whenever you want it again.</p>}
      </div>
      <ol className="flex max-w-[44rem] flex-col">
        {rows.map((row, i) => (
          <motion.li key={row.key} className="border-t border-foreground/10 first:border-t-0"
            initial={stagger ? { opacity: 0, transform: shift('translateY(6px)') } : false}
            animate={{ opacity: 1, transform: shift('translateY(0px)') }}
            transition={{ delay: stagger ? i * 0.035 : 0, duration: 0.18, ease: EASE }}>
            <button type="button" onClick={() => onPick(row.key)} className="group -mx-3 flex w-[calc(100%+1.5rem)] min-w-0 items-baseline gap-[clamp(0.75rem,2vw,1.25rem)] rounded-xl px-3 py-[clamp(0.375rem,1.2vh,0.875rem)] text-left outline-none transition-[background-color,transform] duration-150 hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.99]">
              <Kbd className={`${LINE_KEY} shrink-0 translate-y-[-0.1em] text-[clamp(0.6875rem,min(1.1vw,1.7vh),0.875rem)]`}>{row.key}</Kbd>
              <span className="flex min-w-0 flex-col gap-[0.2em]">
                <span className="mf-row-title flex items-center gap-2 font-heading text-[clamp(1.25rem,min(2.6vw,3.8vh),2rem)] leading-tight font-medium tracking-[-0.015em] text-foreground">
                  {row.title}
                  {row.key === 1 && <Kbd className={`${LINE_KEY} text-(--mf-wl-quiet)`}><CornerDownLeft className="size-[1em]" strokeWidth={2.2} /></Kbd>}
                </span>
                <span className={`${QUIET} max-w-[46ch] text-pretty [@media(max-height:560px)]:truncate [@media(max-height:440px)]:hidden`}>{row.line}</span>
              </span>
            </button>
            {row.key === 3 && importing && (
              <div className="mb-3 flex flex-wrap gap-2 pl-[clamp(2.25rem,5vw,3.25rem)]">
                <button type="button" onClick={() => onPick(3)} className="h-9 rounded-full bg-primary px-4 text-[0.875rem] font-semibold text-primary-foreground active:scale-[0.97]">A folder: Obsidian or Notion…</button>
                <button type="button" onClick={onFiles} className="h-9 rounded-full border px-4 text-[0.875rem] font-medium text-foreground hover:bg-foreground/[0.05] active:scale-[0.97]">Files: Markdown, Readwise, Kindle, Anki…</button>
              </div>
            )}
          </motion.li>
        ))}
      </ol>
      <p className={`flex max-w-[48ch] items-start gap-2 ${QUIET} [@media(max-height:440px)]:hidden`}>
        <ArrowUp aria-hidden className="mt-[0.15em] size-[1em] shrink-0 text-primary" strokeWidth={2.2} />
        <span>Vigil lives in your menu bar, up there. It starts with your Mac, so <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> always works.</span>
      </p>
    </div>
  )
}

/** Whether the welcome is on screen, for what should keep quiet under it. */
export const welcoming = (): boolean => document.documentElement.hasAttribute('data-welcoming')
export { inClay }
