import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, ArrowUp, CornerDownLeft } from 'lucide-react'
import { EASE, byKeys, shift } from '@/lib/motion'
import { chime, click } from '@/lib/sound'
import { applyTheme, type Theme } from '@/lib/theme'
import { comboOf, keyFor, listen, saveKeys, useKeyChanges } from '@/lib/keys'
import { onboarding, type Onboarding } from '@/lib/onboarding'
import { enterSandbox } from '@/lib/sandbox'
import { CaptureList, type CaptureMeta } from '@/components/capture-list'
import { dayjs } from '../../../../main/dates'
import { Scenery } from './scenery'
import { NOISE } from './grain'
import { MemoryPostcard } from './memory-postcard'
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

/** Said by the time of day, the way a person would open. */
function greeting(now = new Date()): string {
  const hour = now.getHours()
  return hour < 5 ? 'Up late.' : hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : hour < 23 ? 'Good evening.' : 'Up late.'
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
  useEffect(() => {
    if (n >= text.length) {
      const timer = setTimeout(() => setResting(true), 1200)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => {
      setN((now) => now + 1)
      if (text[n] !== ' ') click('soft')
    }, n === 0 ? 420 : text[n - 1] === '.' ? 180 : 38)
    return () => clearTimeout(timer)
  }, [n, text])
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

/** A year of days, a dot each, a week a column: today lit, the rest of it still to come. */
function YearDots(): React.JSX.Element {
  const today = dayjs().startOf('day')
  const start = today.startOf('year')
  const days = today.endOf('year').diff(start, 'day') + 1
  const lead = start.day()
  const at = today.diff(start, 'day')
  const quiet = still()
  const cells = Array.from({ length: days }, (_, i) => {
    const slot = i + lead
    return { i, x: Math.floor(slot / 7), y: slot % 7 }
  })
  const cols = Math.ceil((days + lead) / 7)
  const here = cells[at]
  return (
    <figure className="flex flex-col gap-2.5" aria-label={`Today, day ${at + 1} of ${days}`}>
      <svg aria-hidden viewBox={`0 0 ${cols * 10} 70`} className="w-[min(100%,clamp(20rem,34vw,36rem))] overflow-visible">
        {cells.map(({ i, x, y }) => {
          const far = Math.hypot(x - here.x, (y - here.y) * 1.4)
          return (
            <circle key={i} cx={x * 10 + 5} cy={y * 10 + 5} r={i === at ? 3.4 : 2.5}
              className={`${i === at ? 'fill-primary' : 'fill-foreground'} ${quiet ? '' : 'mf-dot-in'}`}
              style={{ opacity: i === at ? 1 : i < at ? 0.42 : 0.14, animationDelay: quiet ? undefined : `${Math.round(120 + far * 14)}ms` } as CSSProperties} />
          )
        })}
        {/* Today, ringed: the one dot that is lit because you are here. */}
        <circle cx={here.x * 10 + 5} cy={here.y * 10 + 5} r={6.4} fill="none" stroke="var(--primary)" strokeWidth={1.1} opacity={0.55} className={quiet ? '' : 'mf-dot-in'} style={{ animationDelay: quiet ? undefined : '80ms' }} />
      </svg>
      <figcaption className="text-control text-muted-foreground">
        <span className="text-foreground">{today.format('dddd D MMMM')}.</span> Day one.
      </figcaption>
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
      className={`flex h-9 items-center gap-2 rounded-full bg-primary pr-1.5 pl-4 text-[0.875rem] font-semibold whitespace-nowrap text-primary-foreground transition-[opacity,transform,background-color] duration-200 ease-(--mf-ease) hover:bg-primary/90 active:scale-[0.97] ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
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

  const go = (to: number, by: 'key' | 'pointer' | 'app' = byKeys() ? 'key' : 'pointer'): void => {
    if (to < 0 || to > LAST) return
    setHow(by)
    setAtState(to)
    setSeen((was) => Math.max(was, to))
  }

  const open = (again: boolean): void => {
    void window.api.captures.list().then((list) => (before.current = new Set(list.map((one) => one.id))))
    void onboarding.state().then(setState)
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
    void onboarding.set({ welcomed: new Date().toISOString(), newsSeen: true, welcoming: false })
    setAtState(-1)
    if (how === 'fresh') {
      chime('decided')
      window.api.openInHome('view', 'home')
      setTimeout(() => window.dispatchEvent(new CustomEvent('vigil:tour-stops')), 450)
    } else if (how === 'sandbox') {
      chime('scene')
      toast('Opening the sandbox. Vigil restarts in a moment.', undefined, 'info')
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
    <div role="dialog" aria-modal aria-label="Welcome to Vigil" className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background text-foreground [container-type:inline-size]">
      <Backdrop />
      {/* Somewhere to hold the window by, clear of its buttons. */}
      <div className="relative h-11 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
      {at === LAST && <TrayArrow tray={state?.tray ?? null} />}
      <main className="relative flex min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.section
            key={at}
            // Two lines of words crossing in one place read as one change through a breath of blur, not two pages stacked.
            initial={motionless ? false : { opacity: 0, transform: shift('translateY(6px)'), filter: 'blur(2px)' }}
            animate={{ opacity: 1, transform: shift('translateY(0px)'), filter: 'blur(0px)' }}
            exit={motionless ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, filter: 'blur(2px)', transition: { duration: 0.12, ease: EASE } }}
            transition={{ duration: 0.2, ease: EASE }}
            className="m-auto w-full max-w-[min(78rem,100%)] px-[clamp(1.5rem,7vw,7rem)] py-6"
          >
            {at === 0 && <Hello replay={replay} />}
            {at === 1 && <OneKey state={state} onState={setState} onBox={() => go(2, 'app')} />}
            {at === 2 && <Catch />}
            {at === 3 && caught && <Landed capture={caught} />}
            {at === 4 && <ComesBack capture={caught} />}
            {at === 5 && <Yours onPick={(theme) => (picked.current = theme)} />}
            {at === LAST && <Start name={replay ? '' : (state?.name ?? '')} skipped={skipped} importing={importing} onPick={choose} onFiles={() => (leave('notes'), void window.api.importFrom('files'))} />}
          </motion.section>
        </AnimatePresence>
      </main>
      <footer className="relative grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-[clamp(1rem,4vw,2rem)]">
        <button type="button" onClick={skip} className="flex h-8 items-center gap-2 justify-self-start rounded-full px-3 text-control text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]">
          {at === LAST ? 'Close' : 'Skip'} <Kbd>Esc</Kbd>
        </button>
        <Dots at={at} seen={seen} onGo={(to) => (chime('page'), go(to === 3 && !caught ? 2 : to, 'pointer'))} />
        <div className="justify-self-end">
          {at === 0 && <Primary onClick={next}>Show me</Primary>}
          {at === 1 && <LateButton onClick={openBox} />}
          {at === 2 && <Primary onClick={openBox} keys={<BoxKeys />}>Open the box</Primary>}
          {(at === 3 || at === 4 || at === 5) && <Primary onClick={next}>Next</Primary>}
        </div>
      </footer>
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
function Backdrop(): React.JSX.Element {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="mf-drift absolute -inset-[2%]">
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
  const inside = x >= 24 && x <= window.innerWidth - 24
  const left = Math.max(24, Math.min(window.innerWidth - 24, x))
  return (
    <div aria-hidden className="pointer-events-none absolute top-1.5 z-10 flex -translate-x-1/2 flex-col items-center text-primary" style={{ left }}>
      <ArrowUp className={`size-4 ${still() ? '' : 'mf-nudge-up'}`} strokeWidth={2.2} style={inside ? undefined : { transform: `rotate(${x > left ? 45 : -45}deg)` }} />
    </div>
  )
}

/** The words of a screen: the headline in the heading font, the line under it, and what it shows beside. */
function Screen({ title, children, aside, side = false, stack = false }: { title: ReactNode; children?: ReactNode; aside?: ReactNode; /** Beside the words in a narrow window too. */ side?: boolean; /** Under the words at every width. */ stack?: boolean }): React.JSX.Element {
  return (
    <div className={`grid items-center gap-x-[clamp(1.5rem,5vw,5rem)] gap-y-7 [@media(max-height:560px)]:gap-y-5 ${aside && !stack ? (side ? '@[30rem]:grid-cols-[minmax(0,1fr)_auto]' : '@[50rem]:grid-cols-[minmax(0,1fr)_auto]') : ''}`}>
      <div className="flex max-w-[clamp(20rem,44vw,40rem)] flex-col gap-4 [@media(max-height:560px)]:gap-3">
        {typeof title === 'string' ? <h1 className={HEADLINE}>{title}</h1> : title}
        {children}
      </div>
      {aside}
    </div>
  )
}
const HEADLINE = 'font-heading text-[clamp(1.75rem,4.4vw,4.25rem)] leading-[1.05] font-medium tracking-[-0.024em] text-balance text-foreground [@media(max-height:560px)]:text-[clamp(1.6rem,4.2vw,2.25rem)]'
const BODY = 'max-w-[clamp(20rem,40vw,36rem)] text-[clamp(0.9375rem,1.3vw,1.25rem)] leading-relaxed text-pretty text-muted-foreground'

// --- the screens ------------------------------------------------------------------

function Hello({ replay }: { replay: boolean }): React.JSX.Element {
  return (
    <Screen
      title={replay ? <h1 className={HEADLINE}>Vigil keeps what you notice.</h1> : <TypeLine text="Vigil keeps what you notice." className={HEADLINE} />}
      aside={<div className="[@media(max-height:560px)]:hidden"><YearDots /></div>}
    >
      <p className={BODY}>
        <span className="text-foreground">{greeting()}</span> Catch a thought in two seconds. Nothing you keep goes stale, and the good things come back to you.
      </p>
      <p className="text-control text-muted-foreground/80">Two minutes, and you can stop any time.</p>
    </Screen>
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
  const big = win.height < 560 || win.width < 700 ? 52 : win.width >= 1280 && win.height >= 820 ? 104 : 76

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
    <Screen
      stack={caps.length > 2}
      title="One key to remember"
      aside={
        <div className={`flex flex-col items-start gap-5 ${caps.length > 2 ? '' : '@[50rem]:items-center'}`}>
          <div className={`relative flex items-end gap-3 rounded-[28px] p-3 transition-[box-shadow] duration-300 ease-(--mf-ease) ${all || arrived ? 'shadow-[0_0_0_1.5px_var(--primary)]' : 'shadow-[0_0_0_1.5px_transparent]'}`}>
            {caps.map((cap, i) => <Keycap key={`${cap}${i}`} label={glyph(cap, i === caps.length - 1)} down={down.has(i)} size={big} />)}
          </div>
        </div>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {arrived ? (
          <motion.p key="there" className="font-heading text-[clamp(1.25rem,2.4vw,2rem)] leading-snug text-foreground" initial={{ opacity: 0, filter: 'blur(2px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.12 }}>
            There it is. <span className="text-muted-foreground">Now write something in it.</span>
          </motion.p>
        ) : taken || choosing ? (
          <KeyPicker key="pick" taken={taken} onState={onState} />
        ) : (
          <motion.div key="ask" className="flex flex-col gap-4" exit={{ opacity: 0, transition: { duration: 0.1 } }}>
            <p className={BODY}>
              From any app, press <InlineKeys keys={keys} /> and a small box opens. Try it now.
            </p>
            <p className="flex items-center gap-2 text-control text-muted-foreground/80">
              <span className="mf-listening" aria-hidden />
              Listening for it
              <span aria-hidden className="text-muted-foreground/40">·</span>
              <button type="button" onClick={() => (chime('tap'), setChoosing(true))} className="rounded-sm underline decoration-foreground/20 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground/50">
                Use a different key
              </button>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  )
}

/** Keys written in a sentence, as small caps. */
function InlineKeys({ keys }: { keys: string }): React.JSX.Element {
  return <span className="inline-flex translate-y-[-1px] gap-0.5 align-middle">{capsOf(keys).map((key, i) => <Kbd key={i}>{glyph(key, i === capsOf(keys).length - 1)}</Kbd>)}</span>
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
    <motion.div className="flex flex-col gap-4" initial={false} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
      <p className={BODY}>
        {taken ? <><InlineKeys keys={keyFor('⌘.') || '⌘.'} /> is already taken by another app on this Mac. Press the keys you would like instead.</> : <>Press the keys you would like for the box instead.</>}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => (chime('tap'), setListening(true))}
          className={`flex h-10 min-w-56 items-center gap-2.5 rounded-xl border px-3.5 text-control transition-colors ${listening ? 'border-primary/60 bg-primary/[0.06] text-foreground' : 'text-muted-foreground hover:bg-foreground/[0.04]'}`}>
          {listening ? <><span className="mf-listening" aria-hidden />Press the keys…</> : <>Box key: <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> <span className="ml-auto text-muted-foreground">Change</span></>}
        </button>
      </div>
      {said ? <p role="status" className="text-control text-[color-mix(in_srgb,var(--tt-color-text-orange)_80%,var(--foreground))]">{said}</p>
        : !listening && !taken && <p role="status" className="text-control text-muted-foreground">Done. Now press it, from any app.</p>}
    </motion.div>
  )
}

function Catch(): React.JSX.Element {
  useKeyChanges()
  return (
    <Screen
      title="Catch something"
      aside={
        <div className="w-full @[50rem]:w-[clamp(22rem,34vw,32rem)]">
          {/* Where it will land: the shape of an Inbox row, waiting. */}
          <div className="flex h-12 items-center gap-3 rounded-xl border border-foreground/10 bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)] px-3.5">
            <span className="size-4 shrink-0 rounded-[5px] border border-foreground/15" />
            <span className="mf-caret mf-caret-slow" aria-hidden />
            <span className="truncate text-control text-muted-foreground/70">Your first capture lands here</span>
          </div>
        </div>
      }
    >
      <p className={BODY}>
        Write anything: a thing to buy, a line you liked, a half-idea. Press <InlineKeys keys={keyFor('⌘↵') || '⌘↵'} /> to send it. The box closes and you are back where you were.
      </p>
    </Screen>
  )
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
  return (
    <Screen
      title={<div className="flex flex-col gap-1"><h1 className={HEADLINE}>It landed.</h1>{aside && <p className="font-heading text-[clamp(1.125rem,2.4vw,1.5rem)] text-muted-foreground italic">{aside}</p>}</div>}
      aside={
        <motion.div ref={row} className="relative w-full [zoom:1.1] @[50rem]:w-[clamp(20rem,28vw,26rem)] @[80rem]:[zoom:1.3]"
          initial={quiet ? false : { opacity: 0, transform: 'translateY(-10px)', filter: 'blur(2px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)', filter: 'blur(0px)' }}
          transition={{ delay: 0.08, duration: 0.26, ease: EASE }}>
          <div className="pointer-events-none overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow) [&_*]:!cursor-default">
            {/* Shown as it waits in the Inbox: one the box also made a task still reads as just caught. */}
            <CaptureList groups={[['', [{ ...capture, status: 'open' }]]]} cursor={-1} onPick={() => undefined} />
          </div>
          {mark && (
            <svg aria-hidden className="pointer-events-none absolute overflow-visible" style={{ left: mark.left, top: mark.top, width: w, height: 6 }} viewBox={`0 0 ${w} 6`}>
              <path d={`M1 3.6 C ${w * 0.28} 1.4, ${w * 0.55} 5.4, ${w - 1} 2.2`} pathLength={1} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round"
                className={quiet ? '' : 'mf-ink'} style={{ strokeDasharray: 1, strokeDashoffset: quiet ? 0 : 1 }} />
            </svg>
          )}
        </motion.div>
      }
    >
      <p className={BODY}>It waits in your Inbox. Nothing to sort now: later, a few minutes at a time.</p>
      <ol aria-label="How Vigil goes" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-control">
        {['Catch', 'Wait', 'Tidy and Decide', 'Comes back'].map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            {i > 0 && <ArrowRight aria-hidden className="size-3 text-muted-foreground/50" strokeWidth={1.75} />}
            <span className={i === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}>{step}</span>
          </li>
        ))}
      </ol>
    </Screen>
  )
}

/** Your own words, as the postcard they will be a year from today; and the two other ways back. */
function ComesBack({ capture }: { capture: CaptureMeta | null }): React.JSX.Element {
  useEffect(() => chime('riffle'), [])
  const words = capture?.label?.split('\n')[0]?.trim() || 'The first thing you catch.'
  const year = dayjs().add(1, 'year')
  return (
    <Screen
      title="Then it comes back to you."
      aside={
        <figure className="flex w-full max-w-[clamp(18rem,30vw,30rem)] flex-col gap-3 [@media(max-height:520px)]:hidden">
          <div className="-rotate-[1.5deg]">
            <MemoryPostcard at={new Date().toISOString()} seed={capture?.id ?? 'welcome'}>
              <p className="text-meta text-muted-foreground">A year ago today</p>
              <p className="clear-both mt-1 line-clamp-3 font-heading text-[clamp(1.0625rem,1.6vw,1.5rem)] leading-snug text-foreground [overflow-wrap:anywhere]">{words}</p>
            </MemoryPostcard>
          </div>
          <figcaption className="pl-1 text-control text-muted-foreground">On <span className="text-foreground">{year.format('D MMMM YYYY')}</span>, this comes back to you.</figcaption>
        </figure>
      }
    >
      <ul className="flex flex-col gap-3">
        {[
          ['A hint in the box', 'now and then: something you kept, at the moment you open it.'],
          ['Review', 'the things you want to remember, just before you would forget them.'],
          ['On this day', 'what you caught a year ago, like a postcard from yourself.']
        ].map(([lead, rest]) => (
          <li key={lead} className={BODY}><span className="font-medium text-foreground">{lead}</span>, {rest}</li>
        ))}
      </ul>
    </Screen>
  )
}

function Yours({ onPick }: { onPick: (theme: Theme) => void }): React.JSX.Element {
  const [say, setSay] = useState<string | undefined>()
  const win = useWindowSize()
  const size = win.height < 560 ? 148 : win.width >= 1280 && win.height >= 820 ? 272 : 216
  return (
    <Screen side title="Make it yours." aside={<ThemeDial size={size} onPick={onPick} onFullTurn={() => (setSay(FULL_TURN), setTimeout(() => setSay(undefined), 1800))} say={say} />}>
      <p className={BODY}>Pick the colours you will want to look at every day. You can change them any time.</p>
      <p className="flex flex-wrap items-center gap-1.5 text-control text-muted-foreground/80 [@media(max-height:560px)]:hidden">
        <span>Turn it with</span><span className="inline-flex gap-0.5"><Kbd>←</Kbd><Kbd>→</Kbd></span><span>or the scroll wheel, or give it a spin.</span>
      </p>
    </Screen>
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
    <div className="flex flex-col gap-6 [@media(max-height:560px)]:gap-3">
      <div className="flex flex-col gap-2">
        <h1 className={HEADLINE}>{name ? `How do you want to start, ${name}?` : 'How do you want to start?'}</h1>
        {skipped && <p role="status" className="text-control text-muted-foreground">{skipped === 'first' && <span className="italic">{WANDER} </span>}Skipped ahead. The welcome is in the Vigil menu and ⌘K whenever you want it again.</p>}
      </div>
      <ol className="flex max-w-[clamp(28rem,60vw,48rem)] flex-col gap-2 [@media(max-height:560px)]:gap-1.5">
        {rows.map((row, i) => (
          <motion.li key={row.key}
            initial={stagger ? { opacity: 0, transform: shift('translateY(6px)') } : false}
            animate={{ opacity: 1, transform: shift('translateY(0px)') }}
            transition={{ delay: stagger ? 0.06 + i * 0.04 : 0, duration: 0.22, ease: EASE }}>
            <button type="button" onClick={() => onPick(row.key)} className={`group flex w-full min-w-0 items-start gap-4 rounded-2xl border bg-[color-mix(in_oklab,var(--background)_88%,transparent)] px-4 py-3.5 text-left outline-none backdrop-blur-sm transition-[background-color,border-color,transform] duration-150 hover:border-foreground/20 hover:bg-[color-mix(in_oklab,var(--foreground)_5%,var(--background))] focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.99] [@media(max-height:560px)]:py-2 ${row.key === 1 ? 'border-foreground/15' : 'border-foreground/8'}`}>
                <Kbd className="mt-0.5 h-6 min-w-6 text-[0.75rem]">{row.key}</Kbd>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="mf-row-title flex items-center gap-2 font-heading text-[clamp(1.0625rem,2vw,1.25rem)] font-medium tracking-[-0.01em] text-foreground">
                    {row.title}
                    {row.key === 1 && <Kbd className="text-muted-foreground"><CornerDownLeft className="size-3" strokeWidth={2.2} /></Kbd>}
                  </span>
                  <span className="text-control leading-relaxed text-pretty text-muted-foreground [@media(max-height:560px)]:truncate [@media(max-height:440px)]:hidden">{row.line}</span>
                </span>
            </button>
            {row.key === 3 && importing && (
              <div className="mt-2 flex flex-wrap gap-2 pl-14">
                <button type="button" onClick={() => onPick(3)} className="h-8 rounded-full bg-primary px-3.5 text-control font-semibold text-primary-foreground active:scale-[0.97]">A folder: Obsidian or Notion…</button>
                <button type="button" onClick={onFiles} className="h-8 rounded-full border px-3.5 text-control font-medium text-foreground hover:bg-foreground/[0.05] active:scale-[0.97]">Files: Markdown, Readwise, Kindle, Anki…</button>
              </div>
            )}
          </motion.li>
        ))}
      </ol>
      <p className="flex items-start gap-2 text-control text-muted-foreground [@media(max-height:440px)]:hidden">
        <ArrowUp aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={2.2} />
        <span>Vigil lives in your menu bar, up there. It starts with your Mac, so <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> always works.</span>
      </p>
    </div>
  )
}

/** Whether the welcome is on screen, for what should keep quiet under it. */
export const welcoming = (): boolean => document.documentElement.hasAttribute('data-welcoming')
export { inClay }
