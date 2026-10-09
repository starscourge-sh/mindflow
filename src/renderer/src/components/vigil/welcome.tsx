import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { ArrowUp, BookOpen, Brain, Check, CornerDownLeft, GitBranch, RotateCcw } from 'lucide-react'
import { EASE, byKeys, hush, spring, speak } from '@/lib/motion'
import { chime, click, fold } from '@/lib/sound'
import { applyTheme, currentTheme, type Theme } from '@/lib/theme'
import { comboOf, fixed, keyFor, listen, saveKeys, useKeyChanges } from '@/lib/keys'
import { onboarding, type Onboarding } from '@/lib/onboarding'
import { enterSandbox } from '@/lib/sandbox'
import { STARTERS, fillBox, holdKeys, tellBox } from '@/lib/welcome-box'
import keycapsUrl from '@/assets/welcome/keycaps.webp'
import type { CaptureMeta } from '@/components/capture-list'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { dayjs, when } from '../../../../main/dates'
import { readTask } from '../../../../main/task-words'
import { Scenery } from './scenery'
import { NOISE } from './grain'
import { ThemeDial } from './theme-dial'
import { RecapRadar } from './recap-radar'
import { Kbd, toast } from './ui'
import { FULL_TURN, glyph, inClay, konami } from './welcome-eggs'
import { WelcomeBackdrop, type Family } from './welcome-backdrop'
import { DeskSticky, EveningReview, GoalRoad, LongNote, Moment, MorningBox, PICKED, REWORDED } from './welcome-day'
import {
  CAM, Camera, Chip, DRAWER, EMPTY_BOX, WIDE, frameOn, GhostHand, KINDS, LAND, LinkScene, PostcardResult, QUOTE, Rise, Slots, Stage, TaskResult, CardResult, LinkResult, WORD,
  cue, seeded, starterOf, typed, useScript, type Beat, type Box, type Kind, type MapShot
} from './welcome-reel'

/**
 * The welcome, the first time Vigil opens (and again from the Vigil menu, ⌘K
 * or Settings): a short film in six chapters, each first shown, then handed
 * to you. One stage the whole way through, so nothing cuts: the box, what
 * comes out of it, the map those things join and the year they make are the
 * same objects moving on (shared layoutIds, welcome-reel.tsx).
 *
 *   0 hello: today's date and hour, a line typed, and the year as a ruler
 *   1 Catch: the key goes down, the box opens, and four things of four
 *     kinds land in it and sort themselves; each is caught into a slot;
 *     then the kinds there are, as the kind chip lists them
 *   2 Become: each thing turns into what its kind does (a task row, next
 *     year's postcard, a Review card); then your turn, in the real box
 *   3 Connect: a link is made, and the map it joins
 *   4 Return: a year read back
 *   5 Make it yours: the theme dial
 *   6 Ready: fresh, the sandbox, or your notes
 *
 * Any key or click while a chapter plays settles it at its end; the next
 * press moves on. Esc settles a chapter, and never goes back a page. Motion off or
 * Reduce motion: every chapter arrives settled, with fades only.
 */

const CHAPTERS = ['Catch', 'Write', 'Become', 'A day', 'Connect', 'Return', 'Make it yours', 'Ready']
const CATCH = 1
const WRITE = 2
const BECOME = 3
const DAY = 4
const CONNECT = 5
const RETURN = 6
const DIAL = 7
const LAST = 8
const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
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


/** While a different key is being chosen, every key press is the picker's. */
let picking = false

/** What was typed into Vigil since the welcome opened, oldest first. */
const since = (list: CaptureMeta[], before: Set<string>): CaptureMeta[] =>
  list.filter((one) => !before.has(one.id) && !one.source).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))

/** How long a line needs to be read before the film moves on: a quarter second a word, never under 1.2s. */
const readFor = (text: string): number => Math.max(1200, text.trim().split(/\s+/).length * 250)

/** A count in words, as a sentence says it. */
const counted = (n: number): string => ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][n] ?? String(n)

// Held back in the main window while the welcome runs, ahead of the app's own keys; said in the footer.
holdKeys(() => document.documentElement.hasAttribute('data-welcoming'), false, () => window.dispatchEvent(new CustomEvent('vigil:held')))

/** A chapter's report to the welcome: whether it has played to its end, and how to get it there now. */
type Reel = { done: boolean; settle: () => void; /** A chapter with a second part: true when it went on to it rather than letting the welcome move on. */ more?: () => boolean }
/** Where you are in Your turn, in the real box. */
type Turn = 'idle' | 'open' | 'away' | 'kept'

// --- the welcome ----------------------------------------------------------------

export function Welcome(): React.JSX.Element | null {
  const [at, setAt] = useState(-1)
  // Opened again from a menu: nothing is first about it.
  const [replay, setReplay] = useState(false)
  // Skipped ahead, and from where: the last page gets a line of its own.
  const [skipped, setSkipped] = useState<false | 'first' | 'later'>(false)
  const [state, setState] = useState<Onboarding | null>(null)
  // Everything caught since the welcome opened, oldest first.
  const [caught, setCaught] = useState<CaptureMeta[]>([])
  const before = useRef<Set<string>>(new Set())
  // The chapters watched once: going back to one shows it settled.
  const [played, setPlayed] = useState<Set<number>>(new Set())
  const reel = useRef<Reel>({ done: true, settle: () => undefined })
  const [kept, setKept] = useState<Set<string>>(new Set())
  const [newcomer, setNewcomer] = useState(false)
  const [earlier, setEarlier] = useState(0)
  const picked = useRef<Theme | null>(null)
  const veteran = useRef(false)
  // Your turn: the thing picked to try, how far it has got, and the one you kept.
  const [pick, setPick] = useState<Kind>('quote')
  const [turn, setTurn] = useState<Turn>('idle')
  const [mine, setMine] = useState<CaptureMeta | null>(null)
  // A key held back (lib main: heldInWelcome), said for a moment.
  const [held, setHeld] = useState(false)
  const quiet = still()
  // When the box last went away: an Esc a moment after is the same Esc, pressed twice out of habit.
  const awayAt = useRef(0)
  // Skip asks once before it goes: a stray click should not cost the welcome.
  const [sure, setSure] = useState(false)
  useEffect(() => {
    if (!sure) return
    const timer = setTimeout(() => setSure(false), 3000)
    return () => clearTimeout(timer)
  }, [sure])
  // A second press of Next within 400ms is one press, not two.
  const pressedAt = useRef(0)
  const dialog = useRef<HTMLDivElement>(null)

  const go = (to: number): void => {
    if (to < 0 || to > LAST || performance.now() - pressedAt.current < 400) return
    pressedAt.current = performance.now()
    setSure(false)
    reel.current = { done: true, settle: () => undefined }
    setPlayed((now) => (at > 0 ? new Set(now).add(at) : now))
    setAt(to)
  }

  const open = (again: boolean): void => {
    void Promise.all([window.api.captures.list(), onboarding.state()]).then(([list, now]) => {
      before.current = new Set(list.map((one) => one.id))
      setKept(new Set(list.map((one) => dayjs(one.capturedAt).format('YYYY-MM-DD'))))
      setNewcomer(list.length === 0)
      setEarlier(list.filter((one) => dayjs(one.capturedAt).isSame(dayjs(), 'day')).length)
      veteran.current = !now.welcomed && list.length > 0
      setState(now)
    })
    picked.current = null
    setCaught([])
    setPlayed(new Set())
    setPick('quote')
    setTurn('idle')
    setMine(null)
    setSkipped(false)
    setReplay(again)
    setAt(0)
    chime('read')
  }

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

  // The whole time it runs, the box is in lesson mode and the app keeps quiet under it.
  useEffect(() => {
    void onboarding.set({ welcoming: at >= 0 })
    document.documentElement.toggleAttribute('data-welcoming', at >= 0)
    if (at >= 0) tellBox(STARTERS.map((one) => one.text.split('\n')[0]), true)
  }, [at >= 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Your turn: the thing picked waits in the box, ready for ⌘. from anywhere; gone again once you move on.
  useEffect(() => {
    fillBox(at === BECOME && turn !== 'kept' ? starterOf(pick) : null)
  }, [at, pick, turn])

  // The box, coming and going, while Your turn waits on it.
  useEffect(() => {
    if (at < 0) return
    const offShown = window.api.onBoxShown(() => setTurn((now) => (now === 'kept' ? now : 'open')))
    const offAway = window.api.onBoxAway(() => {
      awayAt.current = performance.now()
      setTurn((now) => (now === 'open' ? 'away' : now))
    })
    const say = (): void => {
      setHeld(true)
      setTimeout(() => setHeld(false), 2600)
    }
    const offHeld = window.api.onHeld(say)
    window.addEventListener('vigil:held', say)
    return () => (offShown(), offAway(), offHeld(), window.removeEventListener('vigil:held', say))
  }, [at < 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Each capture, the moment it is saved.
  useEffect(() => {
    if (at < 0) return
    return window.api.captures.onChange(() => void window.api.captures.list().then((list) => {
      const now = since(list, before.current)
      setCaught((was) => {
        const fresh = now.find((one) => !was.some((old) => old.id === one.id))
        if (fresh) {
          setMine(fresh)
          setTurn('kept')
          chime('settled')
        }
        return now
      })
    }), ['capture'])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at < 0])

  const leave = (how: 'fresh' | 'sandbox' | 'notes' | 'closed'): void => {
    if (picked.current) applyTheme(picked.current)
    fillBox(null)
    void onboarding.set({ welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, ...(veteran.current && how !== 'fresh' ? { hidden: true } : {}) })
    setAt(-1)
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

  /** The first press settles the chapter at its end; the next one does what it says. */
  const settled = (): boolean => {
    if (reel.current.done) return true
    reel.current.settle()
    chime('page')
    return false
  }
  const skip = (): void => {
    if (at === LAST) return leave('closed')
    if (!sure) return void (chime('tap'), setSure(true))
    chime('page')
    setSkipped(at === 0 ? 'first' : 'later')
    go(LAST)
  }
  const next = (): void => {
    if (!settled()) return
    chime('page')
    if (reel.current.more?.()) return
    if (at === DIAL && picked.current) applyTheme(picked.current)
    go(at + 1)
  }
  const back = (): void => {
    if (at <= 0) return void chime('nope')
    chime('page')
    go(at - 1)
  }
  const openBox = (): void => {
    if (!settled()) return
    fillBox(starterOf(pick))
    chime('open')
    window.api.showPrompt()
  }
  const choose = (kind: Kind): void => {
    if (turn === 'kept') return
    if (kind !== pick) chime('tap')
    setPick(kind)
  }

  const [importing, setImporting] = useState(false)
  const start = (choice: 1 | 2 | 3): void => {
    if (choice === 1) return leave('fresh')
    if (choice === 2) return leave('sandbox')
    if (!importing) {
      chime('tap')
      return setImporting(true)
    }
    leave('notes')
    void window.api.importFrom('vault')
  }

  const primary = (): void => {
    if (at === BECOME && turn !== 'kept' && reel.current.done) return openBox()
    if (at === LAST) return start(1)
    next()
  }

  // The keys, ahead of the app under it while the welcome is up.
  useEffect(() => {
    if (at < 0) return
    const onKey = (event: KeyboardEvent): void => {
      // The ghost turning the dial presses its keys too: only a person's keys count here.
      if (!event.isTrusted) return
      if (konami(event.key)) chime('finding')
      // Choosing a different key: every key is the picker's, Esc included.
      if (picking) return
      const target = event.target as HTMLElement | null
      // Tab stays inside the welcome: the app's own buttons wait under it.
      if (event.key === 'Tab') {
        const all = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])') ?? [])].filter((one) => one.offsetParent && !one.closest('[inert]'))
        if (!all.length) return
        const i = all.indexOf(document.activeElement as HTMLElement)
        if (i < 0 || (event.shiftKey ? i === 0 : i === all.length - 1)) {
          event.preventDefault()
          all[event.shiftKey ? all.length - 1 : 0].focus()
        }
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (target?.closest?.('input, textarea, [contenteditable="true"]')) return
      // A focused button answers its own Enter and Space.
      const button = target?.closest?.('button') && (event.key === 'Enter' || event.key === ' ')
      if (button) return
      if (event.key === 'Escape') {
        // Esc puts the box away if it is up, or settles a chapter that is
        // playing. It never goes back a page (← does), and skipping the
        // welcome is a button only.
        if (turn === 'open') window.api.hidePrompt()
        else if (performance.now() - awayAt.current < 1000) undefined
        else settled()
      } else if (event.key === 'Enter') primary()
      else if (event.key === 'ArrowRight' || event.key === ' ') {
        if (at !== LAST) next()
      } else if (event.key === 'ArrowLeft') back()
      else if (at === LAST && /^[123]$/.test(event.key)) start(Number(event.key) as 1 | 2 | 3)
      else if (at === BECOME && reel.current.done && /^[1-4]$/.test(event.key)) choose(KINDS[Number(event.key) - 1])
      else if (at === DIAL && reel.current.done && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const dial = document.querySelector<HTMLElement>('[role="slider"][aria-label="Theme"]')
        if (!dial || dial.contains(target)) return
        dial.focus({ preventScroll: true })
        dial.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, bubbles: true }))
      } else if (!reel.current.done) {
        // Any other key while a chapter plays: its end, at once.
        settled()
      } else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  useEffect(() => void (at >= 0 && dialog.current?.focus({ preventScroll: true })), [at >= 0]) // eslint-disable-line react-hooks/exhaustive-deps

  if (at < 0) return null
  const play = !quiet && !played.has(at)
  const report = (now: Reel): void => void (reel.current = now)
  const name = replay ? '' : (state?.name ?? '')
  return (
    <MotionConfig reducedMotion={quiet ? 'always' : 'never'}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal aria-label="Welcome to Vigil" onKeyDown={(event) => event.stopPropagation()}
      className="mf-welcome fixed inset-0 z-[70] flex outline-none flex-col overflow-hidden bg-background text-foreground [container-type:inline-size]">
      <Backdrop plain={at === LAST} family={at === WRITE ? 'ruled' : at === CONNECT ? 'threads' : at === RETURN || at === LAST ? 'none' : 'dots'} />
      <div className="relative h-11 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
      {at === LAST && <TrayArrow tray={state?.tray ?? null} />}
      <div className="relative mx-auto flex min-h-0 w-full max-w-[84rem] flex-1 flex-col">
        <main className="relative min-h-0 flex-1">
          <AnimatePresence initial={false}>
            <motion.section key={at}
              className="absolute inset-0 flex flex-col px-[clamp(1.5rem,5vw,4rem)] pt-2"
              // One camera across the chapters: the last pushes on past, the next comes up out of the distance.
              initial={play ? { opacity: 0, scale: 0.94, filter: 'blur(4px)' } : false} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{ type: 'spring', duration: 0.9, bounce: 0 }}
              // The dial's page goes at once: its ring, light and dots must never show over the next one.
              exit={at === DIAL ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 1.06, filter: 'blur(4px)', transition: { duration: 0.35, ease: EASE } }}
              // A click on the picture while it plays: its end, as a key does.
              onPointerDown={(event) => void (event.isTrusted && !(event.target as HTMLElement).closest('button, a, [role="slider"]') && !reel.current.done && settled())}>
              {at === 0 && <Hello replay={replay} kept={kept} calm={!play} newcomer={newcomer} today={earlier + caught.length} />}
              {at === CATCH && <CatchChapter play={play} report={report} state={state} onState={setState} />}
              {at === WRITE && <WriteChapter play={play} report={report} />}
              {at === BECOME && <BecomeChapter play={play} report={report} pick={pick} onPick={choose} turn={turn} mine={mine} />}
              {at === DAY && <DayChapter play={play} report={report} />}
              {at === CONNECT && <ConnectChapter play={play} report={report} />}
              {at === RETURN && <ReturnChapter play={play} report={report} />}
              {at === DIAL && <DialChapter play={play} report={report} onPick={(theme) => (picked.current = theme)} />}
              {at === LAST && <Start name={name} kept={caught.length} skipped={skipped} importing={importing} still={!play} onPick={start} onFiles={() => (leave('notes'), void window.api.importFrom('files'))} onPowers={() => (leave('notes'), window.api.openInHome('view', 'powers'))} />}
            </motion.section>
          </AnimatePresence>
        </main>
        <footer className="relative flex h-[clamp(4rem,9vmin,5.5rem)] shrink-0 items-center gap-3 px-[clamp(1.5rem,5vw,4rem)]">
          <div className="mr-auto flex items-center gap-3">
            <Progress at={at} onBack={back} />
          </div>
          <AnimatePresence>
            {held && (
              <motion.p role="status" className="absolute left-1/2 -translate-x-1/2 text-[0.875rem] whitespace-nowrap text-(--mf-wl-body)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: spring.fast.exit }}>
                That waits until the welcome is done.
              </motion.p>
            )}
          </AnimatePresence>
          {(at === LAST || !caught.length) && !(at === BECOME && turn !== 'kept') && (
            <button type="button" onClick={skip} className={`flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center gap-2 rounded-[0.6rem] px-3 text-[clamp(0.8125rem,1.8vmin,1rem)] transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97] ${sure ? 'text-foreground' : 'text-(--mf-wl-quiet)'}`}>
              {at === LAST ? 'Close' : sure ? 'Skip to the end? Click again' : 'Skip the welcome'}
            </button>
          )}
          {at === BECOME && turn !== 'kept' && (
            <button type="button" onClick={next} className="rounded-sm px-1 text-[clamp(0.8125rem,1.8vmin,1rem)] text-(--mf-wl-quiet) underline decoration-current/30 underline-offset-4 transition-colors hover:text-foreground">
              Not now
            </button>
          )}
          {at === 0 && <Primary onClick={next}>Show me</Primary>}
          {at > 0 && at < LAST && (at === BECOME && turn !== 'kept'
            ? <Primary onClick={openBox} keys={<BoxKeys />}>Try it in the box</Primary>
            : <Primary onClick={next}>Next</Primary>)}
          {at === LAST && <Primary onClick={() => start(1)}>Start fresh</Primary>}
        </footer>
      </div>
    </div>
    </MotionConfig>
  )
}

/**
 * Where you are, said quietly: Back, a short mark a chapter, the one you are
 * in drawn longer, and its name. The prologue has no number.
 */
function Progress({ at, onBack }: { at: number; onBack: () => void }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 text-[clamp(0.8125rem,1.8vmin,1rem)] text-(--mf-wl-quiet)">
      <span className="sr-only">{at > 0 ? `Chapter ${at} of ${CHAPTERS.length}: ${CHAPTERS[at - 1]}` : 'Welcome'}</span>
      {at > 0 && (
        <button type="button" onClick={onBack} className="-ml-3 flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center rounded-[0.6rem] px-3 transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]">
          Back
        </button>
      )}
      <span aria-hidden className="flex items-center gap-1">
        {CHAPTERS.map((_, i) => (
          <motion.span key={i} className="h-[3px] w-5 origin-left rounded-full bg-foreground" initial={false}
            animate={{ opacity: i + 1 === at ? 0.85 : i + 1 < at ? 0.4 : 0.14, scaleX: i + 1 === at ? 1 : 0.55 }} transition={spring.moderate} />
        ))}
      </span>
      <span aria-hidden className="relative inline-flex h-[1.3em] min-w-[8rem] overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={at} className="text-foreground" initial={{ transform: 'translateY(100%)' }} animate={{ transform: 'translateY(0%)' }} exit={{ transform: 'translateY(-100%)' }} transition={{ duration: 0.24, ease: EASE }}>
            {at > 0 ? CHAPTERS[at - 1] : ''}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  )
}

/**
 * A chapter's words: the title rises large, holds, then settles smaller at
 * the top (one element, moved on CAM) so the stage below has the room, and
 * the line under it fades in.
 */
function Words({ title, docked, still, done, tight = false, children }: { title: string; docked: boolean; still: boolean; done: boolean; /** The camera is in close: the words step back to give it the frame. */ tight?: boolean; children?: ReactNode }): React.JSX.Element {
  return (
    <motion.div data-reel={done ? 'done' : 'playing'} className="relative z-20 flex max-w-[52rem] shrink-0 origin-top-left flex-col gap-[clamp(0.375rem,1.2vh,0.75rem)] pb-[clamp(0.5rem,2vh,1.25rem)]"
      initial={false} animate={{ opacity: tight ? 0.45 : 1 }} transition={{ duration: 0.6, ease: EASE }}>
      <motion.h1 layout="position" transition={CAM} className={docked ? DOCKED : `${HEADLINE_XL} max-w-[18ch] pt-[clamp(0rem,6vh,4rem)]`}>
        <Rise text={title} still={still} />
      </motion.h1>
      <AnimatePresence initial={false}>
        {docked && children && (
          <motion.div className={`${BODY} max-w-[46ch]`} initial={still ? false : { opacity: 0, filter: 'blur(2px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.3, ease: EASE, delay: 0.15 }}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/**
 * A call to action, on its own line and larger than the words around it,
 * the accent sweeping across its letters until it is done (main.css,
 * .mf-shimmer); with Motion off, plain accent. One a chapter at most.
 */
function Action({ done = false, className = '', children }: { done?: boolean; className?: string; children: ReactNode }): React.JSX.Element {
  return (
    <motion.p className={`font-heading text-[clamp(1.25rem,min(2.4vw,3.4vh),1.75rem)] leading-tight font-medium whitespace-nowrap ${className}`}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: 0.2 }}>
      <span className="mf-shimmer" data-done={done || undefined}>{children}</span>
    </motion.p>
  )
}

/** Tells the welcome how far the chapter has got, every render. */
function useReport(report: (now: Reel) => void, done: boolean, settle: () => void): void {
  report({ done, settle })
}

// --- 1 Catch ------------------------------------------------------------------------

type CatchState = { docked: boolean; keys: boolean; down: number[]; box: Box | null; filled: Kind[]; close: boolean; kinds: boolean }

/**
 * Four things caught, a beat at a time, with Vigil doing the sorting:
 * each lands whole, then what Vigil read in it lifts out into its place and
 * the chip turns to its kind; Create presses itself, and the line folds to a
 * square that flies to its slot.
 */
function catchBeats(): Beat<CatchState>[] {
  const todo = readTask(starterOf('todo').text)
  const day = todo.due ? when(todo.due, todo.allDay) : 'Friday 19:00'
  const lit = todo.spans.length ? starterOf('todo').text.slice(Math.min(...todo.spans.map((one) => one.from))) : ''
  const beats: Beat<CatchState>[] = [
    { at: 0, to: {}, cue: cue('scene') },
    { at: 1000, to: { docked: true, keys: true } },
    { at: 1250, to: { down: [0] }, cue: cue('tap') },
    { at: 1360, to: { down: [0, 1] }, cue: cue('tap') },
    { at: 1500, to: { down: [] } },
    { at: 1650, to: { keys: false, box: EMPTY_BOX }, cue: cue('open') }
  ]
  let t = 2150
  // Each one, a beat at a time, so each can be read: the words land; a moment to
  // read them; what Vigil read lifts out; the chip turns to its kind and holds;
  // the camera eases back; Create; and the words themselves shrink into their slot.
  const catchOne = (item: Kind, landed: Partial<Box>, sorted: Partial<Box> | null, kind: Box['kind'], filled: Kind[], sortCue: () => void): void => {
    const first = { ...EMPTY_BOX, item, ...landed }
    // A link reads as one the moment it lands, as the box guesses a bare address at once.
    const then = { ...first, ...sorted, ...(item === 'link' ? { kind } : {}) }
    // Time to read the words that landed before anything moves on: a quarter second a word, never under 1.2s.
    const read = readFor([landed.text, landed.lit, landed.tail?.who, landed.tail?.where].filter(Boolean).join(' '))
    const flip = sorted ? read + (item === 'link' ? 0 : 900) : read
    beats.push({ at: t, to: { box: first, close: true }, cue: () => click('tick') })
    if (sorted) beats.push({ at: t + read, to: { box: then }, cue: sortCue })
    beats.push({ at: t + flip, to: { box: { ...then, kind } }, cue: cue('shift') })
    // What it became, still, long enough to read, before it is sent.
    beats.push({ at: t + flip + 900, to: { close: false } })
    beats.push({ at: t + flip + 1500, to: { box: { ...then, kind, press: true } }, cue: () => (click('tick'), chime('send')) })
    beats.push({ at: t + flip + 1600, to: { box: { ...EMPTY_BOX }, filled } })
    t += flip + 2400
  }
  catchOne('todo', { text: starterOf('todo').text.slice(0, starterOf('todo').text.length - lit.length).trim(), lit }, { lit: null, date: day }, 'todo', ['todo'], cue('tag'))
  catchOne('quote', { text: QUOTE.text, tail: { who: QUOTE.who!, where: QUOTE.where! } }, { tail: null, who: QUOTE.who!, where: QUOTE.where! }, 'quote', ['todo', 'quote'], cue('promote'))
  catchOne('word', { text: `${WORD.term}\n${WORD.meaning}` }, null, 'word', ['todo', 'quote', 'word'], () => undefined)
  catchOne('link', { text: starterOf('link').text }, { page: true }, 'link', ['todo', 'quote', 'word', 'link'], cue('reveal'))
  beats.push({ at: t - 700, to: {}, cue: cue('settled') })
  // A calm beat: the kinds there are, as the picker lists them.
  beats.push({ at: t, to: { kinds: true }, cue: cue('open') })
  beats.push({ at: t + 3200, to: {} })
  return beats
}

/** The kinds, each with what it does: the welcome's own words for them. */
const WHAT: Record<string, string> = {
  note: 'Anything else, kept as you wrote it',
  todo: 'Goes to your tasks, on the day it names',
  quote: 'Someone’s words, signed with who said them',
  word: 'A word to learn, asked back in Review',
  link: 'A page, kept with its name and picture',
  decision: 'Comes back on a date to check it still holds',
  experiment: 'Runs until a date, then asks how it went'
}

/**
 * The kind chip's list, opened over the box for a moment: every kind and what
 * it does, a row at a time. Only the kinds the box offers.
 */
function KindList({ still }: { still: boolean }): React.JSX.Element {
  const kinds = CAPTURE_TYPES.filter((type) => type.id in WHAT)
  return (
    <motion.div className="relative z-10 origin-bottom-left rounded-[14px] border bg-popover p-2.5 text-popover-foreground shadow-(--mf-panel-shadow)"
      initial={still ? false : { opacity: 0, scale: 0.96, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, transition: spring.slow.exit }} transition={spring.slow}>
      <p className="px-2 pt-1 pb-2 text-[0.8125rem] font-medium text-foreground">{counted(kinds.length)} kinds. Vigil guesses; you can always change it.</p>
      <ul className="grid grid-cols-3 gap-x-2">
        {kinds.map((type, i) => {
          const Icon = type.icon
          return (
            <motion.li key={type.id} className="flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5"
              initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: still ? 0 : 0.15 + i * 0.07 }}>
              <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: type.tint }} />
              <span className="min-w-0 leading-tight">
                <span className="block text-[0.8125rem] font-medium text-foreground">{type.label}</span>
                <span className="block text-[0.75rem] text-muted-foreground">{WHAT[type.id]}</span>
              </span>
            </motion.li>
          )
        })}
      </ul>
    </motion.div>
  )
}

function CatchChapter({ play, report, state, onState }: { play: boolean; report: (now: Reel) => void; state: Onboarding | null; onState: (now: Onboarding) => void }): React.JSX.Element {
  useKeyChanges()
  const [beats] = useState(catchBeats)
  const show = useScript<CatchState>({ docked: false, keys: false, down: [], box: null, filled: [], close: false, kinds: false }, beats, play)
  useReport(report, show.done, show.settle)
  const s = show.state
  const [choosing, setChoosing] = useState(false)
  const scene = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const filled = s.filled
  const keys = keyFor('⌘.') || '⌘.'
  const caps = capsOf(keys)
  const down = new Set(s.down)
  return (
    <>
      <Words title="Catch it before it goes." docked={s.docked} still={!play} done={show.done} tight={s.close && !show.done}>
        {state?.boxTaken || choosing ? (
          <KeyPicker taken={!!state?.boxTaken} onState={onState} />
        ) : (
          <>
            <InlineKeys keys={keys} /> opens this box over any app, and Vigil sorts what you write.{' '}
            <button type="button" onClick={() => (chime('tap'), setChoosing(true))} className={`${QUIET} rounded-sm underline decoration-current/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current/60`}>
              Use a different key
            </button>
          </>
        )}
      </Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 flex-col pb-2">
      <Camera shot={s.close && !show.done ? frameOn(world.current, 'box', 1.32) : WIDE} className="flex min-h-0 flex-1">
      <div ref={world} className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.75rem,3vh,1.75rem)]">
        {s.keys && (
          <motion.div layoutId="reel-box" transition={CAM} className="flex items-end gap-2" initial={play ? { opacity: 0, filter: 'blur(4px)' } : false} animate={{ opacity: 1, filter: 'blur(0px)' }}>
            {keys === '⌘.'
              ? <KeycapPicture down={down} width={300} />
              : caps.map((cap, i) => <Keycap key={`${cap}${i}`} label={glyph(cap, i === caps.length - 1)} down={down.has(i)} size={88} />)}
          </motion.div>
        )}
        {s.box && (
          <div data-frame="box" className="relative w-[min(40rem,100%)] shrink-0">
            {/* The box steps back while the kinds are shown in its place. */}
            <motion.div className={s.kinds ? 'absolute inset-x-0 top-0' : ''} initial={false} animate={{ opacity: s.kinds ? 0 : 1, scale: s.kinds ? 0.97 : 1, filter: s.kinds ? 'blur(2px)' : 'blur(0px)' }} transition={spring.slow}>
              <Stage box={s.box} />
            </motion.div>
            {/* In the box's place, in the page's flow: it takes the room it needs, nothing sits under it. */}
            <AnimatePresence>{s.kinds && <KindList key="kinds" still={!play} />}</AnimatePresence>
          </div>
        )}
      </div>
      </Camera>
      {/* Outside the camera: the camera pushing in on the box never carries the slots past the window's edge. */}
      {(s.box || filled.length > 0) && <div className="relative z-10 flex shrink-0 justify-center pt-[clamp(0.5rem,2vh,1.25rem)]"><Slots filled={filled} /></div>}
      </div>
    </>
  )
}

// --- 2 Write ------------------------------------------------------------------------

type WriteState = { docked: boolean; page: boolean; scroll: number; picked: boolean; bar: boolean; hand: string | null; down: boolean; card: boolean; edited: string; saved: boolean }

function writeBeats(): Beat<WriteState>[] {
  const random = seeded(31)
  const beats: Beat<WriteState>[] = [
    { at: 0, to: {} },
    { at: 1000, to: { docked: true, page: true }, cue: cue('slide') },
    // A long note, read down like a page: each part held long enough to take in.
    { at: 2600, to: { scroll: 0.35 } },
    { at: 4400, to: { scroll: 0.62 } },
    { at: 6000, to: { picked: true }, cue: () => click('soft') },
    { at: 6700, to: { bar: true }, cue: cue('open') },
    { at: 8200, to: { hand: 'idea' } },
    { at: 8800, to: { down: true }, cue: () => click('tick') },
    { at: 8880, to: { down: false, hand: null, card: true, edited: PICKED, scroll: 0.86 }, cue: cue('open') }
  ]
  // The words reworded in the card, then kept.
  const run = typed<WriteState>(REWORDED, 10300, (sofar) => ({ edited: sofar }), random, 0.35)
  beats.push({ at: 10100, to: { edited: '' } }, ...run.beats)
  beats.push({ at: run.end + 1600, to: { saved: true, bar: false, picked: false }, cue: cue('promote') })
  beats.push({ at: run.end + 4400, to: {} })
  return beats
}

function WriteChapter({ play, report }: { play: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const [beats] = useState(writeBeats)
  const show = useScript<WriteState>({ docked: false, page: false, scroll: 0, picked: false, bar: false, hand: null, down: false, card: false, edited: '', saved: false }, beats, play)
  useReport(report, show.done, show.settle)
  const s = show.state
  const scene = useRef<HTMLDivElement>(null)
  return (
    <>
      <Words title="Write it out at length." docked={s.docked} still={!play} done={show.done}>
        Long notes live here too, and any line in them can become an idea.
      </Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        {s.page && (
          <motion.div className="w-full" initial={play ? { opacity: 0, y: 12, filter: 'blur(4px)' } : false} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.5, ease: EASE }}>
            <LongNote scroll={s.scroll} picked={s.picked} bar={s.bar} card={s.card} edited={s.edited} saved={s.saved} />
          </motion.div>
        )}
        {play && !show.done && <GhostHand to={s.hand} down={s.down} root={scene} />}
      </div>
    </>
  )
}

// --- 3 Become -----------------------------------------------------------------------

type BecomeState = { docked: boolean; cards: Kind[]; landed: boolean; signed: boolean; over: boolean; hand: string | null; down: boolean; look: Kind | null }

const BECOME_BEATS: Beat<BecomeState>[] = [
  { at: 0, to: {} },
  { at: 1450, to: { docked: true }, cue: cue('slide') },
  { at: 2100, to: { cards: ['todo'] }, cue: cue('noted') },
  { at: 2850, to: { look: 'todo' } },
  { at: 4300, to: { look: null } },
  { at: 4800, to: { cards: ['todo', 'quote'] }, cue: cue('riffle') },
  { at: 5600, to: { look: 'quote' } },
  { at: 6350, to: { landed: true }, cue: () => (click('tick'), chime('memory')) },
  { at: 6450, to: { signed: true } },
  { at: 8600, to: { look: null } },
  { at: 9100, to: { cards: ['todo', 'quote', 'word'] }, cue: cue('reveal') },
  { at: 9900, to: { look: 'word' } },
  { at: 10550, to: { hand: 'card' } },
  { at: 11400, to: { down: true }, cue: () => click('tick') },
  { at: 11450, to: { down: false, over: true }, cue: () => fold() },
  { at: 13500, to: { hand: null, look: null } },
  { at: 14000, to: { cards: ['todo', 'quote', 'word', 'link'] }, cue: cue('reveal') },
  { at: 14650, to: { look: 'link' } },
  { at: 16450, to: { look: null } },
  { at: 17500, to: {} }
]

/** What each kind does, in a line under it. */
function Caption({ kind }: { kind: Kind }): React.JSX.Element {
  const now = dayjs()
  if (kind === 'todo') return <>In your tasks, and in Today on the day.</>
  // True of every kind: the year-later memory picks from anything kept (vigil.ts, memory).
  if (kind === 'quote') return <>Anything kept can come back a year later, on <span className="whitespace-nowrap text-foreground">{now.format('D MMM')} <RollingYear from={now.year()} /></span>.</>
  // A word is asked in Review once it is kept from the Inbox with its meaning (vigil.ts, promote).
  if (kind === 'word') return <>Kept as an idea, Review asks what it means.</>
  // A link's card is filled in once the page answers (cardUp).
  return <>Kept with the page’s name and picture.</>
}

/** The things caught as what they became, side by side; a chip until its turn comes. */
function Results({ cards, landed, signed, over, onTurn, pick, onPick, kept, quiet, captions }: {
  cards: Kind[]; landed: boolean; signed: boolean; over: boolean; onTurn: (over: boolean) => void; quiet: boolean
  pick?: Kind | null; onPick?: (kind: Kind) => void; kept?: boolean; captions: boolean
}): React.JSX.Element {
  const live = !!onPick
  // Two rows on one grid: the three set down on one baseline, their lines under them on one line.
  return (
    <div className="grid w-full max-w-[72rem] grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-x-[clamp(0.75rem,1.8vw,1.75rem)] gap-y-3">
      {KINDS.map((kind) => {
        const card = cards.includes(kind)
        const chosen = pick === kind
        return (
          <div key={kind} data-frame={kind} onClick={live ? () => onPick(kind) : undefined} data-ghost={kind === 'word' ? 'card' : undefined}
            style={{ rotate: kind === 'quote' && landed ? '-2.5deg' : '0deg', transition: 'rotate 450ms cubic-bezier(0.34, 1.4, 0.64, 1)' }}
            className={`relative min-w-0 self-end rounded-2xl p-1.5 transition-[box-shadow,background-color] duration-200 ${live ? 'cursor-pointer hover:bg-foreground/[0.03]' : ''} ${chosen ? 'shadow-[0_0_0_2px_var(--primary)]' : 'shadow-[0_0_0_2px_transparent]'}`}>
            {!card ? (
              <div className="flex justify-center py-6"><Chip kind={kind} /></div>
            ) : kind === 'todo' ? (
              <TaskResult line={starterOf('todo').text} />
            ) : kind === 'quote' ? (
              <PostcardResult words={QUOTE.text} who={QUOTE.who!} where={QUOTE.where} signed={signed} />
            ) : (
              kind === 'word' ? <CardResult term={WORD.term} meaning={WORD.meaning} over={over} onTurn={onTurn} /> : <LinkResult />
            )}
            {/* The one you picked for your turn says so, and says when it is kept. */}
            <AnimatePresence>
              {chosen && (
                <motion.span key={kept ? 'kept' : 'pick'} className="absolute -top-3 left-4 z-10 flex h-6 items-center gap-1 rounded-full bg-primary px-2.5 text-[0.75rem] font-semibold text-primary-foreground shadow-sm"
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={LAND}>
                  {kept ? <><Check className="size-3.5" strokeWidth={2.6} />Saved</> : 'Your pick'}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )
      })}
      {captions && KINDS.map((kind, i) => (
        <motion.p key={kind} className="flex items-start gap-2 px-1.5 text-left text-[clamp(0.8125rem,min(1.5vw,2.2vh),1rem)] leading-snug text-(--mf-wl-quiet)"
          initial={false} animate={{ opacity: cards.includes(kind) ? 1 : 0 }} transition={{ duration: 0.3, ease: EASE, delay: cards.includes(kind) && !quiet ? 0.35 : 0 }}>
          {live && <Kbd className="mt-px shrink-0">{i + 1}</Kbd>}
          <span><Caption kind={kind} /></span>
        </motion.p>
      ))}
    </div>
  )
}

function BecomeChapter({ play, report, pick, onPick, turn, mine }: { play: boolean; report: (now: Reel) => void; pick: Kind; onPick: (kind: Kind) => void; turn: Turn; mine: CaptureMeta | null }): React.JSX.Element {
  useKeyChanges()
  const show = useScript<BecomeState>({ docked: false, cards: [], landed: false, signed: false, over: false, hand: null, down: false, look: null }, BECOME_BEATS, play)
  const world = useRef<HTMLDivElement>(null)
  useReport(report, show.done, show.settle)
  const s = show.state
  const scene = useRef<HTMLDivElement>(null)
  // Once played, the card turns by hand.
  const [over, setOver] = useState<boolean | null>(null)
  const box = <InlineKeys keys={keyFor('⌘.') || '⌘.'} />
  const send = <InlineKeys keys={keyFor('⌘↵') || '⌘↵'} />
  const said: Record<Turn, ReactNode> = {
    idle: <Action>Your turn: pick one, then press {box}</Action>,
    open: <Action>Now press {send} in the box to keep it</Action>,
    away: <Action>Press {box} to bring the box back</Action>,
    kept: <>Saved{mine && mine.kind !== pick ? `: “${(mine.label.split('\n')[0] ?? '').slice(0, 40)}”` : ''}. It is yours now, in your Inbox.</>
  }
  return (
    <>
      <Words title="Then it becomes something." docked={s.docked} still={!play} done={show.done} tight={!!s.look && !show.done}>
        Each kind goes where it is useful. These four were only a show.
      </Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.75rem,3vh,1.75rem)] pb-2">
        <Camera shot={s.look && !show.done ? frameOn(world.current, s.look, 1.35) : WIDE} className="w-full max-w-[64rem]">
        <div ref={world} className="relative w-full">
        <Results cards={s.cards} landed={s.landed} signed={s.signed} over={over ?? s.over} quiet={!play} captions={s.docked}
          onTurn={(to) => (show.done ? (chime('tap'), setOver(to)) : undefined)}
          pick={show.done ? pick : null} onPick={show.done ? onPick : undefined} kept={turn === 'kept'} />
        </div>
        </Camera>
        <AnimatePresence>
          {show.done && (
            <motion.div key="turn" className="flex items-center gap-[clamp(1rem,2.5vw,2rem)] pt-2" initial={{ opacity: 0, filter: 'blur(2px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={{ duration: 0.25, ease: EASE }}>
              <motion.div role="status" key={turn} className="text-[clamp(1rem,min(2vw,2.9vh),1.375rem)] leading-snug text-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                {said[turn]}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {play && !show.done && <GhostHand to={s.hand} down={s.down} root={scene} />}
      </div>
    </>
  )
}

// --- 3 A day with Vigil -------------------------------------------------------------

type DayState = { look: number; answered: number; hint: boolean; tip: boolean; asking: boolean; question: string; kept: boolean; sticky: boolean; ticked: boolean; line: string; chip: boolean; logged: boolean; over: boolean; hand: string | null; down: boolean }
type PairsState = { pair: number; struck: boolean; row: boolean }

/** What other notes, task and flashcard apps each leave out, in plain words. */
const GAPS: [typeof BookOpen, string, string][] = [
  [RotateCcw, 'Notes that sit and wait', 'Notes that come back'],
  [BookOpen, 'Long notes in one app, quick thoughts in another', 'Both in one book, each feeding the other'],
  [GitBranch, 'Tasks without the why', 'Tasks with where they came from'],
  [Brain, 'Flashcards you write by hand', 'Remembering built in']
]

/** What a commonplace book adds, a pair at a time: what other apps leave you with, struck, then this; then all four in a row. */
const pairsBeats = (onward: () => void): Beat<PairsState>[] => [
  { at: 0, to: {} },
  ...GAPS.flatMap((_, i): Beat<PairsState>[] => [
    { at: 700 + i * 2300, to: { pair: i, struck: false } },
    { at: 700 + i * 2300 + 800, to: { struck: true }, cue: cue('tag') }
  ]),
  { at: 700 + 4 * 2300, to: { row: true }, cue: cue('gather') },
  // Watched through, the day follows on its own; settled, the row stays until the next press.
  { at: 700 + 4 * 2300 + 2800, to: {}, cue: onward }
]

/**
 * The pairs: one at a time, large, then gathered into a row. Settled (a skip,
 * Reduce motion, Motion off) it is the row, each pair struck and answered,
 * and it holds there: the product's whole case, never skipped past unseen.
 */
function Pairs({ play, report, onward }: { play: boolean; report: (now: Reel) => void; onward: () => void }): React.JSX.Element {
  const [beats] = useState(() => pairsBeats(onward))
  const show = useScript<PairsState>({ pair: -1, struck: false, row: false }, beats, play)
  // Settled, the next press goes on to the day rather than to the next chapter.
  report({ done: show.done, settle: show.settle, more: () => (onward(), true) })
  const s = show.state
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <AnimatePresence mode="wait" initial={false}>
        {s.row ? (
          <motion.ul key="row" className="grid w-full max-w-[74rem] grid-cols-4 grid-rows-[auto_auto_auto] gap-x-[clamp(0.75rem,2.5vw,2.25rem)] gap-y-2 px-6" initial={play ? { opacity: 0, scale: 0.96 } : false} animate={{ opacity: 1, scale: 1 }} transition={spring.slow}>
            {GAPS.map(([Icon, was, now], i) => (
              <motion.li key={now} className="row-span-3 grid grid-rows-subgrid justify-items-center text-center" initial={play ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: i * 0.08 }}>
                <Icon className="size-5 text-primary" />
                <span className="self-end text-[clamp(0.875rem,min(1.5vw,2.2vh),1.0625rem)] leading-snug text-balance text-(--mf-wl-quiet) line-through decoration-primary/60">{was}</span>
                <span className="font-heading text-[clamp(1.0625rem,min(2vw,3vh),1.5rem)] leading-tight text-balance text-foreground">{now}</span>
              </motion.li>
            ))}
          </motion.ul>
        ) : s.pair >= 0 ? (
          <motion.div key={s.pair} className="mx-auto flex w-full max-w-[44rem] flex-col items-center gap-3 px-6 text-center"
            initial={{ opacity: 0, y: 10, filter: 'blur(3px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(3px)', transition: { duration: 0.16 } }} transition={{ duration: 0.3, ease: EASE }}>
            {(() => {
              const [Icon, was, now] = GAPS[s.pair]
              return (
                <>
                  <Icon className="size-6 text-primary" />
                  <p className={`font-heading text-[clamp(1.375rem,min(3vw,4.4vh),2.25rem)] leading-tight transition-colors duration-500 ${s.struck ? 'text-(--mf-wl-quiet) line-through decoration-primary/70 decoration-2' : 'text-foreground'}`}>{was}</p>
                  <motion.p className="font-heading text-[clamp(1.625rem,min(3.6vw,5.2vh),2.75rem)] leading-tight text-foreground" initial={false} animate={{ opacity: s.struck ? 1 : 0, y: s.struck ? 0 : 8 }} transition={{ duration: 0.35, ease: EASE, delay: s.struck ? 0.1 : 0 }}>{now}</motion.p>
                </>
              )
            })()}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/**
 * An ordinary day, in four moments, each a problem and then what Vigil does
 * about it, the camera moving from one to the next across the day.
 */
function dayBeats(): Beat<DayState>[] {
  const random = seeded(23)
  const beats: Beat<DayState>[] = [
    { at: 0, to: { look: 0 } },
    // Morning: something kept comes back in the box; worth knowing, so it goes to Review.
    { at: 700, to: { hint: true, answered: 1 }, cue: cue('memory') },
    { at: 3700, to: { hand: 'thumbs' } },
    { at: 4200, to: { tip: true } },
    { at: 5600, to: { down: true }, cue: () => click('tick') },
    { at: 5680, to: { down: false, tip: false, asking: true, hand: null }, cue: cue('promote') }
  ]
  const ask = typed<DayState>('What is a commonplace book?', 5900, (sofar) => ({ question: sofar }), random, 0.4)
  beats.push(...ask.beats)
  let t = ask.end + 1200
  beats.push({ at: t, to: { kept: true }, cue: cue('noted') })
  // While working: the day's tasks stay on the desktop.
  t += 1600
  beats.push({ at: t, to: { look: 1 } })
  beats.push({ at: t + 900, to: { sticky: true, answered: 2 }, cue: cue('stick') })
  beats.push({ at: t + 2700, to: { hand: 'tick' } })
  beats.push({ at: t + 3250, to: { ticked: true, down: true }, cue: cue('done') })
  beats.push({ at: t + 3350, to: { down: false, hand: null } })
  // The long run: a log from the box lights today on the goal's road.
  t += 4600
  beats.push({ at: t, to: { look: 2 } })
  const log = typed<DayState>('+half marathon: 8k today', t + 900, (sofar) => ({ line: sofar, chip: sofar.length > 3 }), random, 0.4)
  beats.push(...log.beats)
  t = log.end + 1300
  beats.push({ at: t, to: { hand: 'add-log' } })
  beats.push({ at: t + 600, to: { down: true }, cue: () => click('tick') })
  beats.push({ at: t + 680, to: { down: false, logged: true, chip: false, line: '', answered: 3, hand: null }, cue: cue('mark') })
  // Evening: Review asks, just before you would forget.
  t += 2600
  beats.push({ at: t, to: { look: 3 } })
  beats.push({ at: t + 1000, to: { answered: 4 } })
  beats.push({ at: t + 2400, to: { over: true }, cue: () => fold() })
  beats.push({ at: t + 4200, to: {} })
  return beats
}

function DayScene({ play, report }: { play: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const [beats] = useState(dayBeats)
  const show = useScript<DayState>({ look: 0, answered: 0, hint: false, tip: false, asking: false, question: '', kept: false, sticky: false, ticked: false, line: '', chip: false, logged: false, over: false, hand: null, down: false }, beats, play)
  report({ done: show.done, settle: show.settle })
  const s = show.state
  const scene = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const shot = frameOn(world.current, `moment-${s.look}`, 1)
  const moments: [string, string, ReactNode][] = [
    ['Morning', 'You saved it, then never saw it again.', <>Now and then, opening the box brings back something you kept, on its own. Worth knowing? Thumbs up, and Review will test you on it.</>],
    ['While you work', 'Your plan is in a tab you closed.', <>Today’s tasks can stay on your desktop as a sticky note, over whatever you are working in. Tick them off right there.</>],
    ['The long run', 'Big goals get lost in small days.', <>A goal keeps its road in sight. Start a line in the box with + and the goal’s name, and the step is logged. Small days, added up, get you there.</>],
    ['Evening', 'You read it, and a week later it is gone.', <>Review asks you just before you would forget, further apart each time.</>]
  ]
  return (
    <motion.div ref={scene} className="absolute inset-0" initial={play ? { opacity: 0, filter: 'blur(4px)' } : false} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.4, ease: EASE }}>
      <Camera shot={shot} className="absolute -top-1/2 -left-1/2 h-[200%] w-[200%]">
        <div ref={world} className="relative grid size-full grid-cols-2 grid-rows-2">
          {moments.map(([hour, problem, answer], i) => (
            <div key={hour} data-frame={`moment-${i}`} className="min-h-0 min-w-0">
              <Moment hour={hour} problem={problem} answer={answer} answered={s.answered > i}>
                {i === 0 && <MorningBox shown={s.hint} tip={s.tip} asking={s.asking} question={s.question} kept={s.kept} />}
                {i === 1 && <DeskSticky on={s.sticky} ticked={s.ticked} />}
                {i === 2 && <GoalRoad line={s.line} chip={s.chip} logged={s.logged} />}
                {i === 3 && <EveningReview over={s.over} />}
              </Moment>
            </div>
          ))}
        </div>
      </Camera>
      {play && !show.done && <GhostHand to={s.hand} down={s.down} root={scene} />}
    </motion.div>
  )
}

/** A day with Vigil: first what a commonplace book adds, then a day of it. */
function DayChapter({ play, report }: { play: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const [stage, setStage] = useState<'pairs' | 'day'>('pairs')
  const [docked] = useState(() => !play)
  const [dock, setDock] = useState(docked)
  useEffect(() => {
    if (dock) return
    const timer = setTimeout(() => setDock(true), 900)
    return () => clearTimeout(timer)
  }, [dock])
  const [done, setDone] = useState(false)
  // Before the pairs begin, a press brings the title down at once.
  if (!dock) report({ done: false, settle: () => setDock(true) })
  const relay = (now: Reel): void => {
    report(now)
    if (stage === 'day' && now.done !== done) queueMicrotask(() => setDone(now.done))
  }
  return (
    <>
      <Words title="A day with Vigil." docked={dock} still={!play} done={stage === 'day' && done}>
        {stage === 'pairs' ? 'Obsidian, Notion, Anki and a bit of Todoist, in one place.' : 'A normal day, once you have kept a few things.'}
      </Words>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {stage === 'pairs'
          ? dock && <Pairs play={play} report={relay} onward={() => setStage('day')} />
          : <DayScene play={play} report={relay} />}
      </div>
    </>
  )
}

// --- 4 Connect ----------------------------------------------------------------------

type ConnectState = MapShot & { docked: boolean; cards: boolean; hand: string | null }

/** A link being made, typed by the ghost; then the map it joins. */
function connectBeats(): Beat<ConnectState>[] {
  const random = seeded(11)
  const beats: Beat<ConnectState>[] = [
    { at: 0, to: {} },
    { at: 900, to: { docked: true } },
    { at: 1250, to: { cards: false }, cue: () => fold() },
    { at: 1550, to: { dots: true }, cue: cue('bead') }
  ]
  const run = typed<ConnectState>('Rewatching this tonight @Do or', 1900, (sofar) => ({ note: sofar }), random, 0.75)
  beats.push(...run.beats)
  beats.push({ at: run.end + 150, to: { suggest: true }, cue: cue('search') })
  beats.push({ at: run.end + 1500, to: { suggest: false, note: 'Rewatching this tonight @Do or do not' }, cue: () => click('tick') })
  beats.push({ at: run.end + 1800, to: { linked: true }, cue: cue('clue') })
  beats.push({ at: run.end + 3200, to: { folded: true }, cue: () => fold() })
  beats.push({ at: run.end + 3700, to: { pulled: true }, cue: cue('zoomout') })
  beats.push({ at: run.end + 5800, to: { hand: 'dot-quote' } })
  beats.push({ at: run.end + 6350, to: { lit: 'quote' }, cue: cue('look') })
  beats.push({ at: run.end + 7200, to: { hand: null } })
  // The finished map, its names readable, held still before anything else.
  beats.push({ at: run.end + 9200, to: {} })
  return beats
}

function ConnectChapter({ play, report }: { play: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const [beats] = useState(connectBeats)
  const show = useScript<ConnectState>({ docked: false, cards: true, hand: null, dots: false, note: '', suggest: false, linked: false, folded: false, pulled: false, lit: null }, beats, play)
  useReport(report, show.done, show.settle)
  const s = show.state
  const scene = useRef<HTMLDivElement>(null)
  const [lit, setLit] = useState<string | null | undefined>(undefined)
  // Pointed at a dot yourself: the call to do it, and the ring round the dot, stop.
  const [pointed, setPointed] = useState(false)
  return (
    <>
      <Words title="And it finds its friends." docked={s.docked} still={!play} done={show.done}>
        Type <Kbd className={LINE_KEY}>@</Kbd> and a note’s name to link two notes.
      </Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 flex-col items-center justify-center pb-2">
        <AnimatePresence>
          {s.cards && (
            <motion.div key="cards" className="w-full max-w-[64rem] origin-center" exit={{ opacity: 0, scale: 0.15, filter: 'blur(2px)', transition: { duration: 0.4, ease: DRAWER } }}>
              <Results cards={KINDS} landed signed over quiet={!play} captions={false} onTurn={() => undefined} />
            </motion.div>
          )}
        </AnimatePresence>
        {!s.cards && (
          <div className="absolute inset-0 pb-2">
            <LinkScene shot={{ ...s, lit: show.done && lit !== undefined ? lit : s.lit }} quiet={!play} hint={show.done && !pointed ? 'quote' : null}
              onLight={(id) => show.done && (id !== lit && id && click('soft'), id && setPointed(true), setLit(id))} />
          </div>
        )}
        {show.done && <Action done={pointed} className="absolute bottom-2 left-1/2 -translate-x-1/2">Your turn: point at a dot</Action>}
        {play && !show.done && <GhostHand to={s.hand} down={false} root={scene} />}
      </div>
    </>
  )
}

// --- 4 Return -----------------------------------------------------------------------

type ReturnState = { docked: boolean; radar: boolean; lines: number }

const RETURN_BEATS: Beat<ReturnState>[] = [
  { at: 0, to: {} },
  { at: 1100, to: { docked: true, radar: true } },
  { at: 1700, to: {}, cue: cue('wrapped') },
  { at: 2200, to: { lines: 1 } },
  { at: 3300, to: { lines: 2 } },
  { at: 4400, to: { lines: 3 } },
  { at: 5500, to: { lines: 4 } },
  { at: 7500, to: {} }
]

/** An example year: what Your year, wrapped finds out about its reader. */
const FOUND: [string, string][] = [
  ['Saved the most from Frankenstein.', '11 lines, more than from any other book'],
  ['Thought best on Sunday evenings.', 'a third of all they caught, around 9pm'],
  ['Came back to one question.', '“Who is the monster?” Four clues, then an answer'],
  ['Remembered 86%.', 'of what came back to them, on 112 different days']
]
const YEAR = [{ kind: 'note', n: 142 }, { kind: 'todo', n: 96 }, { kind: 'quote', n: 64 }, { kind: 'word', n: 41 }, { kind: 'link', n: 52 }]
const YEAR_BEFORE = { label: 'The year before', kinds: [{ kind: 'note', n: 80 }, { kind: 'todo', n: 120 }, { kind: 'quote', n: 18 }, { kind: 'word', n: 9 }, { kind: 'link', n: 44 }] }

function ReturnChapter({ play, report }: { play: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const show = useScript<ReturnState>({ docked: false, radar: false, lines: 0 }, RETURN_BEATS, play)
  useReport(report, show.done, show.settle)
  const s = show.state
  return (
    <>
      <Words title="And it all comes back to you." docked={s.docked} still={!play} done={show.done}>
        Once a year, Vigil reads your year back to you.
      </Words>
      <figure aria-label="An example year, read back" className="relative mb-2 grid min-h-0 flex-1 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] grid-rows-[auto_minmax(0,1fr)] items-center gap-x-[clamp(1.5rem,4vw,4rem)] rounded-2xl border border-foreground/10 bg-popover/60 px-[clamp(1rem,3vw,2rem)] py-[clamp(0.75rem,2vh,1.25rem)]">
        <figcaption className="col-span-2 flex items-baseline gap-3">
          <span className="font-heading text-[clamp(1.0625rem,min(1.9vw,2.8vh),1.375rem)] font-medium text-foreground">An example year</span>
          <span className="text-[0.875rem] text-(--mf-wl-quiet)">Someone else’s, read back, to show how yours will look.</span>
        </figcaption>
        <div className="flex min-h-0 justify-center [&_svg]:max-h-[min(26rem,40vh)]">
          {s.radar && (
            <motion.div className="w-full max-w-[24rem]" initial={play ? { opacity: 0, scale: 0.94 } : false} animate={{ opacity: 1, scale: 1 }} transition={LAND}>
              <RecapRadar kinds={YEAR} before={YEAR_BEFORE} />
            </motion.div>
          )}
        </div>
        <ol className="flex flex-col gap-[clamp(0.5rem,2vh,1.25rem)]">
          {FOUND.map(([said, how], i) => (
            <motion.li key={said} initial={false} animate={{ opacity: i < s.lines ? 1 : 0, transform: i < s.lines ? 'translateY(0px)' : 'translateY(8px)' }} transition={{ duration: 0.4, ease: EASE }}>
              <p className="font-heading text-[clamp(1.0625rem,min(2vw,2.9vh),1.5rem)] leading-tight text-foreground">{said}</p>
              <p className="mt-0.5 text-[clamp(0.8125rem,min(1.5vw,2.2vh),1rem)] text-(--mf-wl-quiet)">{how}</p>
            </motion.li>
          ))}
        </ol>
      </figure>
    </>
  )
}

// --- 5 Make it yours ----------------------------------------------------------------

type DialState = { docked: boolean; dial: boolean; ticks: number }

/**
 * The window puts a theme on with a quick plain crossfade, colours only
 * (main.css: 200ms while the welcome runs), and the dial itself stays live
 * on top of it, so the ring never stops while the page changes.
 */
const fadeTo = (theme: Theme): void => {
  const go = (): void => applyTheme(theme, false)
  const start = (document as Document & { startViewTransition?: (run: () => void) => { ready: Promise<void> } }).startViewTransition
  if (!start || still()) return go()
  void start.call(document, go).ready.catch(() => undefined)
}

/** Turns the dial one detent, as its arrow keys do: the ring ticks round and the page changes. */
const tickDial = (key: 'ArrowDown' | 'ArrowUp'): void =>
  void document.querySelector<HTMLElement>('[role="slider"][aria-label="Theme"]')?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

/** Two ticks of the dial, one on and one back, so the page you had is the page you keep; a hold after each, nothing else moving. */
const DIAL_BEATS: Beat<DialState>[] = [
  { at: 0, to: {} },
  { at: 900, to: { docked: true, dial: true }, cue: cue('slide') },
  { at: 2600, to: { ticks: 1 }, cue: () => tickDial('ArrowDown') },
  { at: 4400, to: { ticks: 2 }, cue: () => tickDial('ArrowUp') },
  { at: 6200, to: {} }
]

function DialChapter({ play, report, onPick }: { play: boolean; report: (now: Reel) => void; onPick: (theme: Theme) => void }): React.JSX.Element {
  const [say, setSay] = useState<string | undefined>()
  const show = useScript<DialState>({ docked: false, dial: false, ticks: 0 }, DIAL_BEATS, play)
  // Turned by you: the call to do it stops.
  const [turned, setTurned] = useState(false)
  // The theme you came with. The demo's ticks only show it off: leave before you
  // turn it yourself, mid-tick or not, and this is the theme you keep.
  const [start] = useState(currentTheme)
  const yours = useRef(false)
  useEffect(() => () => void (!yours.current && applyTheme(start, false)), []) // eslint-disable-line react-hooks/exhaustive-deps
  const settle = (): void => {
    show.settle()
    if (!yours.current) applyTheme(start, false)
  }
  useReport(report, show.done, settle)
  const s = show.state
  const win = useWindowSize()
  const size = Math.round(Math.max(150, Math.min(win.height * 0.42, win.width * 0.3, 360)))
  return (
    <>
      <Words title="Make it yours." docked={s.docked} still={!play} done={show.done}>
        The page you write on. Settings has it later too.
      </Words>
      <div className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        {/* What she has seen caught, behind the dial, wearing each theme as it passes. */}
        {s.dial && (
          <>
            <motion.div aria-hidden className="absolute top-[18%] left-[2%] w-[min(19rem,27%)] [@media(max-width:820px)]:hidden" initial={play ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0, rotate: -4 }} transition={{ ...LAND, delay: 0.15 }}>
              <TaskResult line={starterOf('todo').text} id="dial-todo" />
            </motion.div>
            <motion.div aria-hidden className="absolute right-[2%] bottom-[12%] w-[min(20rem,28%)] [@media(max-width:820px)]:hidden" initial={play ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0, rotate: 3 }} transition={{ ...LAND, delay: 0.25 }}>
              <PostcardResult words={QUOTE.text} who={QUOTE.who!} where={QUOTE.where} signed id="dial-quote" themed />
            </motion.div>
          </>
        )}
        {s.dial && (
          <motion.div className="relative z-10" initial={play ? { opacity: 0, scale: 0.96, filter: 'blur(4px)' } : false} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={CAM}>
            {/* Its own layer in the crossfade, shown live: the ring and its light never stop while the page changes. */}
            <div className="[view-transition-name:mf-theme-dial]">
              <ThemeDial calm size={size} big wear={fadeTo} onPick={(theme) => void (show.done && (yours.current = true, setTurned(true), onPick(theme)))} onFullTurn={() => (setSay(FULL_TURN), setTimeout(() => setSay(undefined), 1800))} say={say} />
            </div>
            {show.done && <Action done={turned} className="relative z-20 mt-1 text-center">Your turn: turn the dial</Action>}
          </motion.div>
        )}
      </div>
    </>
  )
}

// --- the parts kept from before -------------------------------------------------

/**
 * The first line, about your week rather than about the app: most of what
 * you notice is gone within a few days, so it names the day that will be.
 */
const firstLine = (): string => `Most of what you notice today will be gone by ${dayjs().add(3, 'day').format('dddd')}.`

/** The moment the welcome opened, as a diary dates an entry: the day, then the hour in your Mac's own style. */
const dateline = (): string => `${dayjs().format('dddd D MMMM')}, ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`

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
            className="absolute top-0 h-full max-w-none mix-blend-multiply dark:mix-blend-normal"
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
  // Someone new: the ruler is the year ahead, starting today, not a calendar year mostly gone before they came.
  const start = newcomer ? today : today.startOf('year')
  const days = newcomer ? 365 : today.endOf('year').diff(start, 'day') + 1
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
  const months = newcomer
    ? Array.from({ length: 12 }, (_, m) => start.add(m + 1, 'month').startOf('month')).map((day) => ({ name: day.format('MMM'), d: day.diff(start, 'day') })).filter((one) => one.d < days)
    : Array.from({ length: 12 }, (_, m) => ({ name: start.add(m, 'month').format('MMM'), d: start.add(m, 'month').diff(start, 'day') }))
  const anyKept = Array.from({ length: at }, (_, d) => d).some(keptOn)
  // Today's mark: three quarters up with nothing kept yet, full height by the third thing.
  const rise = Math.min(1, 0.72 + count * 0.095)
  const said = newcomer
    ? count ? `Your year starts today, with ${count} kept. Each day you keep something stands taller.` : 'Your year starts today. Each day you keep something stands taller.'
    : `Each mark is a day of your year. ${anyKept ? 'The tall ones are days you kept something.' : 'Keep something, and its day stands taller.'}`
  return (
    <figure aria-label={newcomer ? 'Your year, starting today' : `Today is day ${at + 1} of ${days}`} className="relative w-full">
      <div ref={box} className="relative h-[calc(32px+2.9rem)]">
        {w > 0 && (
          <>
            {/* Over today: its number (or just Today, for someone new), and what was kept on it. */}
            <span className={`absolute top-0 ${newcomer ? '-translate-x-px' : '-translate-x-1/2'} text-[0.8125rem] leading-[1.1rem] font-medium whitespace-nowrap text-primary tabular-nums ${quiet ? '' : 'mf-rise-text'}`} style={{ left: x(at) }}>
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

/** The box's own keys as small caps, inside a button. */
function BoxKeys(): React.JSX.Element {
  useKeyChanges()
  const caps = capsOf(keyFor('⌘.') || '⌘.')
  const chip = 'h-6 min-w-6 rounded-full border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground'
  // Two caps fit beside the words; a longer chord is one chip, so the button stays one line.
  return caps.length > 2 ? <Kbd className={`${chip} px-2`}>{caps.join('')}</Kbd> : <>{caps.map((key, i) => <Kbd key={i} className={chip}>{key}</Kbd>)}</>
}

/**
 * Behind it all: the scenery the empty Inbox uses, dimmed for reading and
 * drifting very slowly, under a film of grain. With no scenery, the grain
 * on the page's own colour.
 */
function Backdrop({ plain, family }: { plain: boolean; family: Family }): React.JSX.Element {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* The last screen is a plain page: the scenery steps back for the choice. */}
      <div className={`mf-drift absolute -inset-[2%] transition-opacity duration-300 ease-(--mf-ease) ${plain ? 'opacity-0' : 'opacity-100'}`}>
        <Scenery place="rest" seed="welcome" text="all" className="absolute inset-0" />
      </div>
      <div className="absolute inset-0 opacity-[0.035] mix-blend-overlay" style={{ backgroundImage: NOISE, backgroundSize: '160px' }} />
      {/* One quiet family of marks a chapter, over the scenery and under the words (welcome-backdrop.tsx). */}
      <WelcomeBackdrop family={family} />
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
/** The first screen's: the establishing shot, the largest words in the welcome. */
const HEADLINE_XL = 'font-heading text-[clamp(2.25rem,min(5.6vw,8.4vh),5.25rem)] leading-[1.02] font-medium tracking-[-0.03em] text-balance text-foreground'
/** A chapter's title once it has made room for the stage. */
const DOCKED = 'font-heading text-[clamp(1.5rem,min(3vw,4.6vh),2.75rem)] leading-[1.08] font-medium tracking-[-0.022em] text-balance text-foreground'
const BODY = 'max-w-[32ch] text-[clamp(1.0625rem,min(2.5vw,3.6vh),1.75rem)] leading-[1.4] text-pretty text-(--mf-wl-body)'
const QUIET = 'text-[clamp(0.9375rem,min(2.2vw,3.2vh),1.5rem)] leading-snug text-(--mf-wl-quiet)'
/** Keys inside a line of the larger type: sized to it, not to the app's small caps. */
const LINE_KEY = 'h-[1.3em] min-w-[1.3em] rounded-[0.3em] px-[0.3em] text-[0.62em]'
/** A date or a count set in the type: figures that line up, in the quiet ink. */
const FIGURES = 'text-[clamp(0.875rem,min(1.9vw,2.8vh),1.25rem)] tabular-nums text-(--mf-wl-quiet)'

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
        <p className={`${BODY} max-w-[28ch]`}>Your commonplace book: long notes and quick thoughts that come back to you.</p>
        <p className={`${QUIET} max-w-[40ch]`}>For students, researchers and anyone who reads and writes to think.</p>
      </div>
      <div className="[@media(max-height:520px)]:hidden">
        <YearRule calm={calm} kept={kept} faded={said} newcomer={newcomer} today={today} />
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
/** Keys every Mac app already uses: never the box's, or Bold or Copy would stop working everywhere. */
const COMMON = ['⌘A', '⌘B', '⌘C', '⌘V', '⌘X', '⌘Z', '⌘S', '⌘W', '⌘Q', '⌘H', '⌘M', '⌘N', '⌘O', '⌘P', '⌘F', '⌘T', '⌘R', '⌘I', '⌘U', '⌘K', '⌘L', '⌘G', '⌘E', '⌘D', '⌘Y', '⌘J', '⇧⌘Z', '⌘Space', '⌃Space', '⌘⇥']

function KeyPicker({ taken, onState }: { taken: boolean; onState: (now: Onboarding) => void }): React.JSX.Element {
  const [listening, setListening] = useState(true)
  const [said, setSaid] = useState<string | null>(null)
  // The keys pressed, waiting for a yes before they become the box's, everywhere.
  const [asked, setAsked] = useState<string | null>(null)
  const changes = useKeyChanges()
  useEffect(() => {
    picking = listening
    return () => void (picking = false)
  }, [listening])
  useEffect(() => {
    if (!listening) return
    listen((event) => {
      const combo = comboOf(event)
      if (!combo) return
      if (combo === 'Esc') return void (setListening(false), listen(null))
      // A key for every app has to hold a ⌘, ⌥ or ⌃, or typing a letter would open the box.
      if (!/[⌃⌥⌘]/.test(combo)) return void (chime('nope'), setSaid('Hold ⌘, ⌥ or ⌃ with it, so typing never opens the box.'))
      // Keys every Mac app already uses (Bold, Copy, Paste, Quit…) would be lost everywhere else.
      if (combo !== '⌘.' && (fixed(combo) || COMMON.includes(combo))) return void (chime('nope'), setSaid(`${combo} is one every app already uses. Try one with ⌥ or ⌃ in it.`))
      chime('tap')
      setSaid(null)
      setAsked(combo)
      setListening(false)
      listen(null)
    })
    return () => listen(null)
  }, [listening]) // eslint-disable-line react-hooks/exhaustive-deps
  const keep = (combo: string): void => {
      // Back to ⌘. is no change at all; anything else is written as yours.
      const next = { ...changes }
      if (combo === '⌘.') delete next['⌘.']
      else next['⌘.'] = combo
      saveKeys(next)
      setAsked(null)
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
  }
  return (
    <motion.div className="flex flex-col items-start gap-3" initial={false} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
      <p className={`${BODY} max-w-[34ch]`}>
        {taken ? <><InlineKeys keys={keyFor('⌘.') || '⌘.'} /> is already taken by another app on this Mac. Press the keys you would like instead.</> : <>Press the keys you would like for the box instead.</>}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => (chime('tap'), setListening(true))}
          className={`flex h-11 min-w-60 items-center gap-2.5 rounded-xl border px-4 text-[0.9375rem] transition-colors ${listening ? 'border-primary/60 bg-primary/[0.06] text-foreground' : 'text-(--mf-wl-body) hover:bg-foreground/[0.04]'}`}>
          {listening ? <><span className="mf-listening" aria-hidden />Press the keys…</> : <>Box key: <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> <span className="ml-auto text-(--mf-wl-quiet)">Change</span></>}
        </button>
      </div>
      {asked && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => keep(asked)} className="flex h-9 items-center gap-2 rounded-[0.6rem] bg-primary px-4 text-[0.875rem] font-semibold text-primary-foreground active:scale-[0.97]">Use <InlineKeys keys={asked} /> for the box</button>
          <button type="button" onClick={() => (chime('tap'), setAsked(null), setListening(true))} className="h-9 rounded-[0.6rem] border px-4 text-[0.875rem] font-medium text-foreground hover:bg-foreground/[0.05] active:scale-[0.97]">Try another</button>
        </div>
      )}
      {said ? <p role="status" className={`${QUIET} text-[color-mix(in_srgb,var(--tt-color-text-orange)_70%,var(--foreground))]`}>{said}</p>
        : !listening && !taken && !asked && <p role="status" className={QUIET}>Done. Now press it, from any app.</p>}
    </motion.div>
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

/**
 * The end: a decision already made for you, with two quieter ways round it.
 * Your empty book is ready and the button below opens it; the sandbox and
 * your old notes are a line of small links, each with its number key. The
 * arrow at the top of the window points at Vigil in the menu bar, so the
 * words do not have to.
 */
function Start({ name, kept, skipped, importing, still, onPick, onFiles, onPowers }: { name: string; kept: number; skipped: false | 'first' | 'later'; importing: boolean; still: boolean; onPick: (pick: 1 | 2 | 3) => void; onFiles: () => void; onPowers: () => void }): React.JSX.Element {
  const others: { key: 2 | 3; title: string }[] = [
    { key: 2, title: 'Try the sandbox first' },
    { key: 3, title: 'Bring my notes' }
  ]
  const link = 'group flex items-center gap-2 rounded-[0.6rem] px-3 py-1.5 -mx-3 text-foreground transition-colors hover:bg-foreground/[0.06] active:scale-[0.98]'
  return (
    <div className="my-auto mr-auto flex w-full max-w-[58rem] flex-col gap-[clamp(1rem,4.5vh,3rem)] overflow-y-auto">
      <div className="flex flex-col gap-[clamp(0.5rem,1.8vh,1rem)]">
        <h1 className={`${HEADLINE_XL} max-w-[14ch]`}><Rise text={name ? `Your commonplace book is ready, ${name}.` : 'Your commonplace book is ready.'} still={still} /></h1>
        <p className={`${BODY} max-w-[30ch]`}>{kept ? `${counted(kept)} ${kept === 1 ? 'thing' : 'things'} in it already.` : 'Empty for now.'} <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> {kept ? 'adds the next' : 'fills it'}, from any app.</p>
        {skipped && <p role="status" className={`${QUIET} max-w-[48ch]`}>The welcome waits in the Vigil menu and ⌘K.</p>}
      </div>
      <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 ${QUIET}`}>
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
      {/* Quietest of all: every power, a card each, for whoever wants the whole map first. */}
      <button type="button" onClick={onPowers} className={`${QUIET} -mx-1 self-start rounded-sm px-1 underline decoration-current/30 underline-offset-4 transition-colors hover:text-foreground`}>See everything Vigil can do</button>
    </div>
  )
}

/** Whether the welcome is on screen, for what should keep quiet under it. */
export const welcoming = (): boolean => document.documentElement.hasAttribute('data-welcoming')
export { inClay }
