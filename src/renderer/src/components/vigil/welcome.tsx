import { RulerMarks } from './milestones'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { ArrowUp, BookOpen, Check, CornerDownLeft, Gem, ListChecks, Quote as QuoteIcon } from 'lucide-react'
import { byKeys, hush, spring, speak } from '@/lib/motion'
import { chime, click, fold } from '@/lib/sound'
import { applyTheme, currentTheme, type Theme } from '@/lib/theme'
import { comboOf, fixed, keyFor, listen, saveKeys, useKeyChanges } from '@/lib/keys'
import { NO_SETUP, onboarding, type Onboarding, type Setup } from '@/lib/onboarding'
import { vigil } from '@/lib/vigil'
import { Button } from '@/components/ui/button'
import { ImportMap, sourceFrom } from './welcome-import'
import { answered, applySetup, Payoff, YouPage } from './welcome-you'
import { enterSandbox } from '@/lib/sandbox'
import { examples, fillBox, holdKeys, tellBox } from '@/lib/welcome-box'
import { typingWaits } from '@/lib/typing'
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
import { CAPTION, DeskSticky, EveningReview, LongNote, Moment, MorningBox, NOTE_START, PICKED, REWORDED, SLASH, SLASH_SAID, type NoteShot } from './welcome-day'
import { FLOW_LAST, FLOW_SAID, FLOW_WORDS, FlowTree, GEM_SAID, type FlowShot } from './welcome-flow'
import {
  BECOMES, CAM, Camera, Chip, ENTER, MOVE, leadMs, readMs, EMPTY_BOX, WIDE, frameOn, GhostHand, LAND, NoteResult, LinkScene, PostcardResult, QUOTE, Rise, Slots, Stage, TaskResult, CardResult, LinkResult, WORD,
  cue, PACE, seeded, starterOf, typed, useScript, type Beat, type Box, type Kind, type MapShot, type Part
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

// Writing and keeping lead; tasks come later, inside a day.
// Two questions first, so it starts out shaped for you; then writing and keeping lead, and tasks come later, inside a day.
const CHAPTERS = ['You', 'Catch', 'Write', 'The flow', 'Become', 'A day', 'Connect', 'Return', 'Make it yours', 'Ready']
const YOU = 1
const CATCH = 2
const WRITE = 3
const FLOW = 4
const BECOME = 5
const DAY = 6
const CONNECT = 7
const RETURN = 8
const DIAL = 9
const LAST = 10
const EASE = ENTER
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

/** A count in words, as a sentence says it. */
const counted = (n: number): string => ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][n] ?? String(n)

// Held back in the main window while the welcome runs, ahead of the app's own keys; said in the footer.
holdKeys(() => document.documentElement.hasAttribute('data-welcoming'), false, () => window.dispatchEvent(new CustomEvent('vigil:held')))

/** A chapter's report to the welcome: whether it has played to its end, and how to get it there now. */
type Reel = {
  done: boolean; settle: () => void; /** A chapter with a second part: true when it went on to it rather than letting the welcome move on. */ more?: () => boolean
  /** The part playing, shown filling along Next; none when it waits for you. */ part?: Part | null
  /** What Next goes on to, when it is more of this page ("Next: Evening"). */ label?: string
}
/** What Next shows: whether the page is still playing (and its part), and what it goes on to. */
type Cue = { done: boolean; part: Part | null; label?: string }
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
  // The first questions' answers, kept as they are given and acted on when the welcome ends.
  const [setup, setSetup] = useState<Setup>(NO_SETUP)
  const answer = (next: Setup): void => {
    setSetup(next)
    void onboarding.set({ setup: next })
  }
  // Everything caught since the welcome opened, oldest first.
  const [caught, setCaught] = useState<CaptureMeta[]>([])
  const before = useRef<Set<string>>(new Set())
  // The chapters watched once: going back to one shows it settled.
  const [played, setPlayed] = useState<Set<number>>(new Set())
  const reel = useRef<Reel>({ done: true, settle: () => undefined })
  const shown = useRef(-1)
  const [kept, setKept] = useState<Set<string>>(new Set())
  const [newcomer, setNewcomer] = useState(false)
  const [earlier, setEarlier] = useState(0)
  const picked = useRef<Theme | null>(null)
  const veteran = useRef(false)
  // Your turn: the thing picked to try, how far it has got, and the one you kept.
  // A plain note first: the thing most people catch.
  const [pick, setPick] = useState<Kind>('note')
  const [turn, setTurn] = useState<Turn>('idle')
  const [mine, setMine] = useState<CaptureMeta | null>(null)
  // A key held back (lib main: heldInWelcome), said for a moment.
  const [held, setHeld] = useState(false)
  const quiet = still()
  // When the box last went away: an Esc a moment after is the same Esc, pressed twice out of habit.
  const awayAt = useRef(0)
  // A second press of Next within 400ms is one press, not two.
  const pressedAt = useRef(0)
  const dialog = useRef<HTMLDivElement>(null)
  // Whether the page on screen still plays, for Next to show (Primary).
  const [cue, setCue] = useState<Cue>({ done: true, part: null })
  const cueAt = useRef<Cue>(cue)

  const go = (to: number): void => {
    if (to < 0 || to > LAST || performance.now() - pressedAt.current < 400) return
    pressedAt.current = performance.now()
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
      setSetup(now.setup ?? NO_SETUP)
    })
    picked.current = null
    setCaught([])
    setPlayed(new Set())
    setPick('note')
    setTurn('idle')
    setMine(null)
    setSkipped(false)
    setImporting(false)
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
    if (at >= 0) tellBox(examples(), true)
  }, [at >= 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Your turn: the thing picked waits in the box, ready for ⌘. from anywhere; gone again once you move on.
  useEffect(() => {
    // Nothing written in for you: the box opens empty, its examples typing in, the kind you picked first.
    tellBox(examples(pick), true)
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
    // Whatever was answered and not yet acted on (the welcome skipped past the summary): done now, once.
    void applySetup(setup).then((next) => onboarding.set({ setup: next })).catch(() => undefined)
    void onboarding.set({ welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, ...(veteran.current && how !== 'fresh' ? { hidden: true } : {}) })
    setAt(-1)
    if (how === 'fresh') {
      chime('decided')
      window.api.openInHome('view', 'home')
      setTimeout(() => window.dispatchEvent(new CustomEvent('vigil:tour-stops')), 450)
    } else if (how === 'sandbox') {
      void enterSandbox().catch(() => toast('The sandbox could not open just now. It waits in ⌘K, under “Open the sandbox”.', undefined, 'warning'))
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
  // One click: it only goes to the last page, where Back still brings the chapters back.
  const skip = (): void => {
    if (at === LAST) return leave('closed')
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
    tellBox(examples(pick), true)
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
      else if (at === BECOME && reel.current.done && /^[1-5]$/.test(event.key)) choose(BECOMES[Number(event.key) - 1])
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
  // Only the chapter on screen says how far it has got: one still fading out
  // after Back keeps playing, and must not leave the next press settling it.
  shown.current = at
  const report = (now: Reel): void => {
    if (shown.current !== at) return
    reel.current = now
    // Next follows along: filling while the page plays, ready once it waits for you.
    const next: Cue = { done: now.done, part: now.done ? null : (now.part ?? null), label: now.label }
    const was = cueAt.current
    if (was.done !== next.done || was.label !== next.label || Math.abs((was.part?.to ?? 0) - (next.part?.to ?? 0)) > 30 || Math.abs((was.part?.from ?? 0) - (next.part?.from ?? 0)) > 30) {
      cueAt.current = next
      queueMicrotask(() => setCue(next))
    }
  }
  const name = replay ? '' : (state?.name ?? '')
  return (
    <MotionConfig reducedMotion={quiet ? 'always' : 'never'}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal aria-label="Welcome to Vigil" onKeyDown={(event) => event.stopPropagation()}
      className="mf-welcome fixed inset-0 z-[70] flex outline-none flex-col overflow-hidden bg-background text-foreground [container-type:inline-size]">
      <Backdrop plain={at === LAST} family={at === WRITE ? 'ruled' : at === DIAL ? 'dots' : 'none'} />
      <div className="relative h-11 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
      {at === LAST && <TrayArrow tray={state?.tray ?? null} />}
      <div className="relative mx-auto flex min-h-0 w-full max-w-[84rem] flex-1 flex-col">
        <main className="relative min-h-0 flex-1">
          <AnimatePresence initial={false}>
            <motion.section key={at}
              className="absolute inset-0 flex flex-col px-[clamp(1.5rem,5vw,4rem)] pt-2"
              // One camera across the chapters: the last pushes on past, the next comes up out of the distance.
              initial={play ? { opacity: 0, scale: 0.97 } : false} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: ENTER }}
              // The dial's page goes at once: its ring, light and dots must never show over the next one.
              exit={at === DIAL ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 1.02, transition: { duration: 0.2, ease: MOVE } }}
              // A click on the picture while it plays: its end, as a key does.
              onPointerDown={(event) => void (event.isTrusted && !(event.target as HTMLElement).closest('button, a, [role="slider"]') && !reel.current.done && settled())}>
              {at === 0 && <Hello replay={replay} kept={kept} calm={!play} newcomer={newcomer} today={earlier + caught.length} />}
              {at === YOU && <YouChapter setup={setup} onChange={answer} still={!play} report={report} />}
              {at === CATCH && <CatchChapter play={play} report={report} state={state} onState={setState} setup={setup} />}
              {at === WRITE && <WriteChapter play={play} report={report} setup={setup} />}
              {at === FLOW && <FlowChapter play={play} report={report} setup={setup} />}
              {at === BECOME && <BecomeChapter play={play} report={report} pick={pick} onPick={choose} turn={turn} mine={mine} setup={setup} />}
              {at === DAY && <DayChapter play={play} report={report} setup={setup} />}
              {at === CONNECT && <ConnectChapter play={play} report={report} setup={setup} />}
              {at === RETURN && <ReturnChapter play={play} report={report} />}
              {at === DIAL && <DialChapter play={play} report={report} onPick={(theme) => (picked.current = theme)} mine={mine} setup={setup} />}
              {at === LAST && <Start name={name} kept={before.current.size + caught.length} skipped={skipped} importing={importing} still={!play} onPick={start} setup={setup} onImport={(what) => (leave('notes'), void window.api.importFrom(what))} onPowers={() => (leave('notes'), window.api.openInHome('view', 'powers'))} />}
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
          {/* The ways past a page, worded alike: Skip the welcome, or, on Your turn, Skip trying it. */}
          {(at === LAST || !caught.length) && !(at === BECOME && turn !== 'kept') && (
            <button type="button" onClick={skip} className={QUIET_BUTTON}>
              {at === LAST ? 'Close, without the tour' : 'Skip the welcome'}
            </button>
          )}
          {at === BECOME && turn !== 'kept' && (
            <button type="button" onClick={next} className={QUIET_BUTTON}>
              Skip trying it
            </button>
          )}
          {at === 0 && <Primary onClick={next}>Show me</Primary>}
          {at > 0 && at < LAST && (at === BECOME && turn !== 'kept'
            ? <Primary onClick={openBox} keys={<BoxKeys />} wait={cue.done ? null : cue.part ?? { from: 0, to: 0 }}>Try it in quick capture</Primary>
            : <Primary onClick={next} wait={cue.done ? null : cue.part ?? { from: 0, to: 0 }}>{cue.label ?? 'Next'}</Primary>)}
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
 * A chapter's words: the headline and the one line under it, top left, there
 * from the start and never moving or dimming, so they can be read while the
 * stage below waits (each chapter's demo starts once they have been read,
 * `lead`). Each word of the headline rises once, in place.
 */
function Words({ title, still, done, children }: { title: string; docked?: boolean; still: boolean; done: boolean; tight?: boolean; children?: ReactNode }): React.JSX.Element {
  return (
    <div data-reel={done ? 'done' : 'playing'} data-words className="relative z-20 flex max-w-[52rem] shrink-0 flex-col gap-[clamp(0.375rem,1.2vh,0.75rem)] pb-[clamp(0.5rem,2vh,1.25rem)]">
      <h1 className={DOCKED}>
        <Rise text={title} still={still} />
      </h1>
      {children && (
        <motion.div className={`${BODY} max-w-[46ch]`} initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: ENTER, delay: 0.2 }}>
          {children}
        </motion.div>
      )}
    </div>
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
function useReport(report: (now: Reel) => void, done: boolean, settle: () => void, part?: Part | null): void {
  report({ done, settle, part })
}

// --- 1 You ------------------------------------------------------------------------

/**
 * Two questions before anything else, then a first space and a goal: all
 * optional (welcome-you.tsx). Then, if anything was answered, what Vigil did
 * with it, done there and then, each with its Undo; with nothing answered,
 * Next goes straight on.
 */
function YouChapter({ setup, onChange, still, report }: { setup: Setup; onChange: (next: Setup) => void; still: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const [paid, setPaid] = useState(false)
  const [working, setWorking] = useState(false)
  report({
    done: !working,
    settle: () => undefined,
    more: () => {
      if (paid || !answered(setup)) return false
      setWorking(true)
      void applySetup(setup).then((next) => {
        onChange(next)
        setPaid(true)
        chime('decided')
      }).catch(() => toast('Your answers are kept; they are acted on when the welcome ends.', undefined, 'warning')).finally(() => setWorking(false))
      return true
    }
  })
  return (
    <>
      <Words key={paid ? 'paid' : 'ask'} title={paid ? 'Done. Shaped for you.' : 'A few questions first.'} docked still={still} done>
        {paid ? 'Here is what your answers changed, already.' : 'So Vigil starts out shaped for you. Skip any of them.'}
      </Words>
      <div className="relative flex min-h-0 flex-1 flex-col justify-center overflow-y-auto pb-2">
        {paid
          ? <Payoff setup={setup} onChange={onChange} onBack={() => (chime('page'), setPaid(false))} still={still} />
          : <YouPage setup={setup} onChange={onChange} still={still} />}
      </div>
    </>
  )
}

/** A line for what you said Vigil is for, under a chapter's words, in the accent: why this part matters to you. */
const FOR_YOU: Partial<Record<NonNullable<Setup['use']>, Partial<Record<'catch' | 'write' | 'become' | 'connect', string>>>> = {
  study: { become: 'For study: words and gems you keep come back in Review, well before the exam.' },
  work: { catch: 'For work: write a task with its day, and it is on your list for that day.' },
  writing: { write: 'For writing: your drafts live here, next to the reading they came from.', connect: 'For writing: link each quote to the draft it belongs in.' },
  life: { catch: 'For everyday life: a recipe, a plan, a line from a film; one key, and it is kept.' }
}
function ForYou({ setup, at }: { setup?: Setup; at: 'catch' | 'write' | 'become' | 'connect' }): React.JSX.Element | null {
  const said = setup?.use ? FOR_YOU[setup.use]?.[at] : undefined
  return said ? <span data-for-you className="mt-1 block font-medium text-primary">{said}</span> : null
}

// --- 1 Catch ------------------------------------------------------------------------

/** What Catch catches, in order: a thought first, the todo last. */
const CAUGHT: Kind[] = ['quote', 'word', 'todo']

type CatchState = { docked: boolean; keys: boolean; down: number[]; box: Box | null; filled: Kind[]; close: boolean; kinds: boolean; aha: Kind | null }

/**
 * Four things caught, a beat at a time, with Vigil doing the sorting:
 * each is typed in by a person's hand, then what Vigil read in it lifts out
 * into its place and the chip turns to its kind, and a line under the box
 * says what that just did for you; Create presses itself, and the line folds
 * to a square that flies to its slot.
 */
function catchBeats(): Beat<CatchState>[] {
  const random = seeded(17)
  const todo = readTask(starterOf('todo').text)
  const day = todo.due ? when(todo.due, todo.allDay) : 'Friday 19:00'
  const lit = todo.spans.length ? starterOf('todo').text.slice(Math.min(...todo.spans.map((one) => one.from))) : ''
  // Timed in real milliseconds (played at pace 1): the title holds 0.9s, the rest at least 0.6s.
  const beats: Beat<CatchState>[] = [
    { at: 0, to: {}, cue: cue('scene') },
    { at: 900, to: { docked: true, keys: true } },
    { at: 1050, to: { down: [0] }, cue: cue('tap') },
    { at: 1120, to: { down: [0, 1] }, cue: cue('tap') },
    { at: 1220, to: { down: [] } },
    { at: 1320, to: { keys: false, box: EMPTY_BOX }, cue: cue('open') }
  ]
  let t = 1650
  // Each one, a beat at a time: typed in, never more than 2.4s; a moment more to
  // read it; what Vigil read lifts out, with a line saying what that does for
  // you; the chip turns to its kind and holds; Create; and the words shrink into their slot.
  const catchOne = (item: Kind, whole: string, at: (sofar: string) => Partial<Box>, sorted: Partial<Box> | null, kind: Box['kind'], filled: Kind[], sortCue: () => void, cap: number): void => {
    const run = typed<CatchState>(whole, t + 250, (sofar) => ({ box: { ...EMPTY_BOX, item, typing: true, ...at(sofar) } }), random, 0.85, cap)
    beats.push({ at: t, to: { box: { ...EMPTY_BOX, item, typing: true } } }, ...run.beats)
    const first = { ...EMPTY_BOX, item, ...at(whole) }
    const then = { ...first, ...sorted }
    // Read as it was typed: a short hold, then Vigil sorts it and, beside it, says what that did.
    const read = run.end + 600
    beats.push({ at: read, to: { box: then, aha: item }, cue: sortCue })
    const flip = read + (item === 'word' ? 0 : 620)
    beats.push({ at: flip, to: { box: { ...then, kind } }, cue: cue('shift') })
    // Nothing more moves until that line has been read; then Create, and it flies to its slot, its line going with it.
    // A little over its reading time: it fades in first.
    const sent = read + Math.max(readMs((AHA[item] ?? ['', '']).join(' ')) + 400, flip - read + 900)
    beats.push({ at: sent, to: { box: { ...then, kind, press: true } }, cue: () => (click('tick'), chime('send')) })
    beats.push({ at: sent + 60, to: { box: { ...EMPTY_BOX }, filled, aha: null } })
    t = sent + 900
  }
  // A thought first, the todo last: this is a book of things worth keeping before it is a task list.
  const said = `${QUOTE.text} - ${QUOTE.who}, ${QUOTE.where}`
  catchOne('quote', said, (sofar) => {
    if (sofar.length <= QUOTE.text.length + 2) return { text: sofar }
    // Past the closing mark: who said it, and where, lit as Vigil reads them.
    const [who, where = ''] = sofar.slice(QUOTE.text.length + 3).split(', ')
    return { text: QUOTE.text, tail: { who, where } }
  }, { tail: null, who: QUOTE.who!, where: QUOTE.where! }, 'quote', ['quote'], cue('promote'), 2400)
  // A link or a lone word reads as one the moment its first line is typed, as the box guesses them.
  catchOne('word', `${WORD.term}\n${WORD.meaning}`, (sofar) => ({ text: sofar, ...(sofar.length >= WORD.term.length ? { kind: 'word' as const } : {}) }), null, 'word', ['quote', 'word'], () => undefined, 1900)
  const plain = starterOf('todo').text.slice(0, starterOf('todo').text.length - lit.length).trim()
  catchOne('todo', starterOf('todo').text, (sofar) => (sofar.length <= plain.length + 1 ? { text: sofar } : { text: plain, lit: sofar.slice(plain.length + 1) }), { lit: null, date: day }, 'todo', ['quote', 'word', 'todo'], cue('tag'), 2400)
  beats.push({ at: t - 490, to: {}, cue: cue('settled') })
  // A calm beat: the kinds there are, as the picker lists them.
  beats.push({ at: t + 300, to: { kinds: true }, cue: cue('open') })
  beats.push({ at: t + 300 + readMs('Six kinds. Vigil guesses; you can always change it.') + 1500, to: {} })
  // In time order: a line's going is set before the typing it overlaps.
  return beats.sort((one, two) => one.at - two.at)
}

/** What Vigil just did with each thing caught, said under the box as it does it: a bold lead-in, then why it helps. */
const AHA: Partial<Record<Kind, [string, string]>> = {
  quote: ['Kept with its source.', 'Who said it, and where.'],
  word: ['Kept to learn.', 'Review asks you what it means.'],
  todo: ['Read as a date.', `It is on your list for ${dayjs().add(2, 'day').format('dddd')}.`]
}

/** The kinds, each with what it does: the welcome's own words for them. */
const WHAT: Record<string, string> = {
  note: 'Anything else, kept as you wrote it',
  todo: 'Goes to your tasks, on the day it names',
  quote: 'Someone’s words, signed with who said them',
  word: 'A word to learn, asked back in Review once you keep it',
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
      <p className="px-2 pt-1 pb-2 text-[0.9375rem] font-medium text-foreground">{counted(kinds.length)} kinds. Vigil guesses; you can always change it.</p>
      <ul className="grid grid-cols-3 gap-x-2">
        {kinds.map((type, i) => {
          const Icon = type.icon
          return (
            <motion.li key={type.id} className="flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5"
              initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: still ? 0 : 0.15 + i * 0.07 }}>
              <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: type.tint }} />
              <span className="min-w-0 leading-tight">
                <span className="block text-[0.9375rem] font-medium text-foreground">{type.label}</span>
                <span className="block text-[0.9375rem] text-muted-foreground">{WHAT[type.id]}</span>
              </span>
            </motion.li>
          )
        })}
      </ul>
    </motion.div>
  )
}

function CatchChapter({ play, report, state, onState, setup }: { play: boolean; report: (now: Reel) => void; state: Onboarding | null; onState: (now: Onboarding) => void; setup?: Setup }): React.JSX.Element {
  useKeyChanges()
  const [beats] = useState(catchBeats)
  const show = useScript<CatchState>({ docked: false, keys: true, down: [], box: null, filled: [], close: false, kinds: false, aha: null }, beats, play, 1, leadMs('Catch it before it goes. ⌘. opens quick capture from any app. Vigil sorts what you write. Use a different key'))
  useReport(report, show.done, show.settle, show.part)
  const s = show.state
  const [choosing, setChoosing] = useState(false)
  const scene = useRef<HTMLDivElement>(null)
  const filled = s.filled
  const keys = keyFor('⌘.') || '⌘.'
  const caps = capsOf(keys)
  const down = new Set(s.down)
  return (
    <>
      <Words title="Catch it before it goes." still={!play} done={show.done}>
        {state?.boxTaken || choosing ? (
          <KeyPicker taken={!!state?.boxTaken} onState={onState} />
        ) : (
          <>
            <InlineKeys keys={keys} /> opens quick capture from any app. Vigil sorts what you write.{' '}
            <button type="button" onClick={() => (chime('tap'), setChoosing(true))} className={`${QUIET} rounded-sm underline decoration-current/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current/60`}>
              Use a different key
            </button>
            <ForYou setup={setup} at="catch" />
          </>
        )}
      </Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 flex-col justify-center gap-[clamp(0.75rem,2.5vh,1.5rem)] pb-2">
        {s.keys && (
          <motion.div layoutId="reel-box" transition={CAM} className="flex items-end gap-2" initial={play ? { opacity: 0, scale: 0.95 } : false} animate={{ opacity: 1, scale: 1 }}>
            {keys === '⌘.'
              ? <KeycapPicture down={down} width={300} />
              : caps.map((cap, i) => <Keycap key={`${cap}${i}`} label={glyph(cap, i === caps.length - 1)} down={down.has(i)} size={88} />)}
          </motion.div>
        )}
        {s.box && (
          <div data-frame="box" className="relative w-[min(46rem,100%)] shrink-0">
            {/* The box steps back while the kinds are shown in its place. */}
            <motion.div className={s.kinds ? 'absolute inset-x-0 top-0' : ''} initial={false} animate={{ opacity: s.kinds ? 0 : 1, scale: s.kinds ? 0.97 : 1 }} transition={{ duration: 0.25, ease: MOVE }}>
              <Stage box={s.box} />
              {/* What Vigil just did with it, and why it helps: right under the box, there only while its example is. */}
              <div aria-live="polite" className="flex min-h-[2.4em] items-center pt-3 text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.3125rem)] leading-snug">
                <AnimatePresence mode="wait" initial={false}>
                  {s.aha && AHA[s.aha] && (
                    <motion.p key={s.aha} data-aha={s.aha} className="text-balance text-foreground" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15, ease: MOVE } }} transition={{ duration: 0.25, ease: ENTER }}>
                      <strong className="font-semibold">{AHA[s.aha]![0]}</strong> {AHA[s.aha]![1]}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
            {/* In the box's place, in the page's flow: it takes the room it needs, nothing sits under it. */}
            <AnimatePresence>{s.kinds && <KindList key="kinds" still={!play} />}</AnimatePresence>
          </div>
        )}
        {(s.box || filled.length > 0) && <div className="relative z-10 flex shrink-0"><Slots filled={filled} kinds={CAUGHT} /></div>}
      </div>
    </>
  )
}

// --- 2 Write ------------------------------------------------------------------------

type WriteState = NoteShot & { docked: boolean; page: boolean; step: Power | null; hand: string | null; down: boolean }
type Power = 'slash' | 'pic' | 'pick' | 'gem'

/** What each part shows, said right under the page as it happens: one plain line, read before the page moves. */
const SAID_WRITE: Record<Power, string> = {
  slash: `/ opens every kind of block: ${['headings', 'math', 'tables'].filter((word) => SLASH_SAID.includes(word)).join(', ')} and more.`,
  pic: 'Every picture has its own bar, with “Caption” to write a line under it.',
  pick: 'Pick out any line, and save it as a gem.',
  gem: 'Kept, up in Gems.'
}
// What a gem is, and that nothing is copied out to make one, is said next, in The flow (welcome-flow.tsx, GEM_SAID): here, where it went and why.
const GEM_WHY = 'Review brings it back, so you remember what you read.'
const WRITE_LINE = 'Long notes live here too, and any line can become a gem.'

/**
 * A reading note on The Lord of the Rings, there at rest while the words over
 * it are read; then three of its powers, one at a time, each said under the
 * page first and shown once that line has been read: the block menu, walked
 * from top to bottom, then a callout; a picture's own bar and its caption; a
 * line picked out and kept as a gem, which flies to Gems at the page's top
 * while the line under the page says what a gem is. Real milliseconds.
 */
function writeBeats(): Beat<WriteState>[] {
  const random = seeded(31)
  const beats: Beat<WriteState>[] = [{ at: 0, to: {} }]
  // / : its line first; then the real block menu, ↓ held to walk it, "cal", and a callout.
  let t = 100
  beats.push({ at: t, to: { step: 'slash' } })
  t += readMs(SAID_WRITE.slash)
  beats.push({ at: t, to: { focus: 'slash', slash: '/', row: 0 }, cue: cue('open') })
  const rows = SLASH.length
  for (let i = 1; i < rows; i++) beats.push({ at: t + 500 + i * 105, to: { row: i }, cue: i % 3 ? undefined : () => click('soft') })
  t += 500 + rows * 105 + 400
  beats.push({ at: t, to: { slash: '/c' }, cue: () => click('soft') }, { at: t + 110, to: { slash: '/ca' }, cue: () => click('soft') }, { at: t + 220, to: { slash: '/cal' }, cue: () => click('soft') })
  beats.push({ at: t + 800, to: { slash: '', callout: true }, cue: () => click('tick') })
  // The picture: its line first, the page still; then its bar, “Caption” pressed, and the caption typed.
  t += 1700
  beats.push({ at: t, to: { step: 'pic', focus: 'pic', pic: true }, cue: cue('stick') })
  t += readMs(SAID_WRITE.pic)
  beats.push({ at: t, to: { tools: true } })
  beats.push({ at: t + 300, to: { hand: 'caption' } })
  beats.push({ at: t + 900, to: { down: true }, cue: () => click('tick') })
  beats.push({ at: t + 980, to: { down: false } })
  const caption = typed<WriteState>(CAPTION, t + 1100, (sofar) => ({ caption: sofar }), random, 0.6, 1400)
  beats.push(...caption.beats)
  beats.push({ at: caption.end + 600, to: { tools: false, hand: null } })
  // A line picked out, kept as a gem: its line first, then the pick, the bar, the card, the words tidied, saved.
  t = caption.end + 1200
  beats.push({ at: t, to: { step: 'pick', focus: 'story', lit: 2 } })
  t += readMs(SAID_WRITE.pick)
  beats.push({ at: t, to: { picked: true }, cue: () => click('soft') })
  beats.push({ at: t + 600, to: { bar: true }, cue: cue('open') })
  beats.push({ at: t + 1100, to: { hand: 'idea' } })
  beats.push({ at: t + 1700, to: { down: true }, cue: () => click('tick') })
  beats.push({ at: t + 1780, to: { down: false, hand: null, card: true, edited: PICKED, focus: 'hovel' }, cue: cue('open') })
  const run = typed<WriteState>(REWORDED, t + 2900, (sofar) => ({ edited: sofar }), random, 0.45, 2000)
  beats.push({ at: t + 2700, to: { edited: '' } }, ...run.beats)
  beats.push({ at: run.end + 900, to: { saved: true, bar: false, picked: false, step: 'gem' }, cue: cue('promote') })
  // Once that is read, back up to the picture, so it is in view to point at.
  beats.push({ at: run.end + 900 + readMs(`${SAID_WRITE.gem} ${GEM_WHY}`), to: { focus: 'pic' } })
  return beats
}

function WriteChapter({ play, report, setup }: { play: boolean; report: (now: Reel) => void; setup?: Setup }): React.JSX.Element {
  const [beats] = useState(writeBeats)
  const show = useScript<WriteState>({ ...NOTE_START, docked: true, page: true, step: null, hand: null, down: false }, beats, play, 1, leadMs(`Write it out at length. ${WRITE_LINE}`))
  useReport(report, show.done, show.settle, show.part)
  const s = show.state
  const scene = useRef<HTMLDivElement>(null)
  const step: Power | null = show.done ? 'gem' : s.step
  return (
    <>
      <Words title="Write it out at length." still={!play} done={show.done}>{WRITE_LINE}<ForYou setup={setup} at="write" /></Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 flex-col justify-center gap-[clamp(0.5rem,1.6vh,0.875rem)] pb-2">
        <LongNote shot={s} tag={setup?.space ?? undefined} />
        {/* What the page is showing now, right under it: the one caption at the demo; once a gem is made, what a gem is and why it helps. */}
        <div aria-live="polite" className="relative h-[3.4em] w-full max-w-[60rem] text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.3125rem)] leading-snug">
          <AnimatePresence mode="wait" initial={false}>
            {step && (
              <motion.div key={step} data-write-step={step} className="absolute inset-x-0 top-0 flex flex-col gap-0.5"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15, ease: MOVE } }} transition={{ duration: 0.25, ease: ENTER }}>
                <p className="flex items-center gap-2 font-medium text-foreground">
                  {step === 'gem' && <Gem className="size-[1em] shrink-0" style={{ color: 'var(--tt-color-text-purple)' }} />}
                  {step === 'slash' ? <><Kbd className={STEP_KEY}>/</Kbd>{SAID_WRITE.slash.slice(2)}</> : SAID_WRITE[step]}
                </p>
                {step === 'gem' && <p data-gem-why className="text-(--mf-wl-body)">{GEM_WHY}</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {play && !show.done && <GhostHand to={s.hand} down={s.down} root={scene} />}
      </div>
    </>
  )
}

// --- 3 The flow ---------------------------------------------------------------------

type FlowState = FlowShot & { docked: boolean }

/** Long enough to skim some words (about 400 a minute, never under 1.2s): a moment's line before its card, a card before the next. */
const skim = (words: string): number => leadMs(words)

/**
 * One moment at a time, in real milliseconds: its time and line said first,
 * then what it shows; the two lines picked out one after the other; the task,
 * then the gem; then the closing line.
 */
function flowBeats(): Beat<FlowState>[] {
  const beats: Beat<FlowState>[] = [{ at: 0, to: {} }]
  let t = 200
  const line = (i: number): string => FLOW_SAID[i].join(' ')
  // A moment told, then its card set down with its sound, then a moment to look at it.
  const moment = (i: number, card: Partial<FlowState>, sound: () => void, look: string): void => {
    beats.push({ at: t, to: { docked: true, said: i + 1 } })
    t += skim(line(i))
    beats.push({ at: t, to: card, cue: sound })
    t += skim(look)
  }
  moment(0, { shown: 1 }, cue('bead'), `${FLOW_WORDS.spark} Overheard on a walk`)
  moment(1, { shown: 2 }, cue('send'), `${FLOW_WORDS.caught} Saved in seconds`)
  moment(2, { shown: 3 }, cue('slide'), `${FLOW_WORDS.note} ${FLOW_WORDS.lines.join(' ')}`)
  // Picked out: the task's line, then the gem's.
  beats.push({ at: t, to: { said: 4 } })
  t += skim(line(3))
  beats.push({ at: t, to: { lit: 1 }, cue: () => click('soft') })
  beats.push({ at: t + 700, to: { lit: 2 }, cue: () => click('soft') })
  t += 700 + 1200
  // Put to work: the task with its day, then the gem.
  moment(4, { shown: 4 }, cue('tag'), `${FLOW_WORDS.task} Now a task, due Saturday`)
  beats.push({ at: t, to: { shown: 5 }, cue: cue('promote') })
  t += skim(`${FLOW_WORDS.gem} ${GEM_SAID.join(' ')}`)
  beats.push({ at: t, to: { last: true }, cue: cue('settled') })
  beats.push({ at: t + skim(FLOW_LAST), to: {} })
  return beats
}

/**
 * How a passing thought becomes an essay's work: a spark, caught, written
 * out, two lines picked out, and one becomes a task and one a gem, each
 * moment said under where it happens (welcome-flow.tsx). Your first tag is on
 * the note.
 */
function FlowChapter({ play, report, setup }: { play: boolean; report: (now: Reel) => void; setup?: Setup }): React.JSX.Element {
  const [beats] = useState(flowBeats)
  const show = useScript<FlowState>({ docked: false, said: 0, shown: 0, lit: 0, last: false }, beats, play, 1, leadMs('How a thought grows. The path most notes take, often without anyone noticing.'))
  useReport(report, show.done, show.settle, show.part)
  const s = show.state
  return (
    <>
      <Words title="How a thought grows." docked={s.docked} still={!play} done={show.done}>
        The path most notes take, often without anyone noticing.
      </Words>
      <div className="relative flex min-h-0 flex-1 flex-col pb-2">
        {s.docked && <FlowTree shot={s} quiet={!play} tag={setup?.space ?? null} />}
      </div>
    </>
  )
}

// --- 3 Become -----------------------------------------------------------------------

type BecomeState = { docked: boolean; cards: Kind[]; landed: boolean; signed: boolean; over: boolean; hand: string | null; down: boolean; look: Kind | null }

// A plain note first, then in the order Catch caught them: the quote, the word, the link, and the todo last.
const BECOME_BEATS: Beat<BecomeState>[] = [
  { at: 0, to: {} },
  { at: 1450, to: { docked: true }, cue: cue('slide') },
  // A plain note first: the thing most often caught.
  { at: 2100, to: { cards: ['note'] }, cue: cue('noted') },
  { at: 2850, to: { look: 'note' } },
  { at: 4300, to: { look: null } },
  { at: 4800, to: { cards: ['note', 'quote'] }, cue: cue('riffle') },
  { at: 5550, to: { look: 'quote' } },
  { at: 6300, to: { landed: true }, cue: () => (click('tick'), chime('memory')) },
  { at: 6400, to: { signed: true } },
  { at: 8550, to: { look: null } },
  { at: 9050, to: { cards: ['note', 'quote', 'word'] }, cue: cue('reveal') },
  { at: 9850, to: { look: 'word' } },
  { at: 10500, to: { hand: 'card' } },
  { at: 11350, to: { down: true }, cue: () => click('tick') },
  { at: 11400, to: { down: false, over: true }, cue: () => fold() },
  { at: 13450, to: { hand: null, look: null } },
  { at: 13950, to: { cards: ['note', 'quote', 'word', 'link'] }, cue: cue('reveal') },
  { at: 14600, to: { look: 'link' } },
  { at: 16400, to: { look: null } },
  { at: 16900, to: { cards: ['note', 'quote', 'word', 'link', 'todo'] }, cue: cue('noted') },
  { at: 17650, to: { look: 'todo' } },
  { at: 19100, to: { look: null } },
  { at: 20200, to: {} }
]

/** What each kind does, in a line under it. */
function Caption({ kind }: { kind: Kind }): React.JSX.Element {
  const now = dayjs()
  // A note is kept as written, in the Inbox, until it is sorted or grown into a longer piece.
  if (kind === 'note') return <>In your Inbox as you wrote it, ready to grow into a longer note.</>
  if (kind === 'todo') return <>In your tasks, and in Today on the day.</>
  // True of every kind: the year-later memory picks from anything kept (vigil.ts, memory).
  if (kind === 'quote') return <>This is how old notes come back to you: a postcard on Home, a year later, on <span className="whitespace-nowrap text-foreground">{now.format('D MMM')} <RollingYear from={now.year()} /></span>.</>
  // A word is asked in Review once it is kept from the Inbox with its meaning (vigil.ts, promote).
  if (kind === 'word') return <>Kept as a gem, Review asks what it means.</>
  // A link's card is filled in once the page answers (cardUp).
  return <>Kept with the page’s name and picture.</>
}

/** The things caught as what they became, side by side; a chip until its turn comes. */
function Results({ cards, landed, signed, over, onTurn, pick, onPick, kept, quiet, captions, look = null, tag = null }: {
  cards: Kind[]; landed: boolean; signed: boolean; over: boolean; onTurn: (over: boolean) => void; quiet: boolean
  /** Your first tag, worn by the note. */
  tag?: string | null
  /** The one being shown: it comes forward and the rest step back, all inside the window. */
  look?: Kind | null
  pick?: Kind | null; onPick?: (kind: Kind) => void; kept?: boolean; captions: boolean
}): React.JSX.Element {
  const live = !!onPick
  // Two rows on one grid: the three set down on one baseline, their lines under them on one line.
  return (
    <div className="grid w-full max-w-[72rem] grid-cols-[minmax(11.5rem,1.5fr)_minmax(10.5rem,1.15fr)_minmax(8.5rem,0.85fr)_minmax(9rem,0.9fr)_minmax(11.25rem,1.1fr)] gap-x-[clamp(0.5rem,1vw,1.75rem)] gap-y-3">
      {BECOMES.map((kind) => {
        const card = cards.includes(kind)
        const chosen = pick === kind
        return (
          <div key={kind} data-frame={kind} onClick={live ? () => onPick(kind) : undefined} data-ghost={kind === 'word' ? 'card' : undefined}
            style={{ rotate: kind === 'quote' && landed ? '-2.5deg' : '0deg', opacity: look && look !== kind ? 0.6 : 1, scale: look === kind ? '1.03' : '1', translate: look === kind ? '0 -4px' : '0 0',
              transition: 'rotate 450ms cubic-bezier(0.34, 1.4, 0.64, 1), opacity 300ms cubic-bezier(0.65, 0, 0.35, 1), scale 300ms cubic-bezier(0.65, 0, 0.35, 1), translate 300ms cubic-bezier(0.65, 0, 0.35, 1)' }}
            className={`relative min-w-0 self-end rounded-2xl p-1.5 transition-[box-shadow,background-color] duration-200 ${live ? 'cursor-pointer hover:bg-foreground/[0.03]' : ''} ${chosen ? 'shadow-[0_0_0_2px_var(--primary)]' : 'shadow-[0_0_0_2px_transparent]'}`}>
            {!card ? (
              <div className="flex justify-center py-6"><Chip kind={kind} /></div>
            ) : kind === 'note' ? (
              <NoteResult words={starterOf('note').text} tag={tag} />
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
      {captions && BECOMES.map((kind, i) => (
        <motion.p key={kind} className="flex items-start gap-2 px-1.5 text-left text-[clamp(0.8125rem,min(1.5vw,2.2vh),1rem)] leading-snug text-(--mf-wl-quiet)"
          initial={false} animate={{ opacity: cards.includes(kind) ? 1 : 0 }} transition={{ duration: 0.3, ease: EASE, delay: cards.includes(kind) && !quiet ? 0.35 : 0 }}>
          {live && <Kbd className="mt-px shrink-0">{i + 1}</Kbd>}
          <span><Caption kind={kind} /></span>
        </motion.p>
      ))}
    </div>
  )
}

function BecomeChapter({ play, report, pick, onPick, turn, mine, setup }: { play: boolean; report: (now: Reel) => void; pick: Kind; onPick: (kind: Kind) => void; turn: Turn; mine: CaptureMeta | null; setup?: Setup }): React.JSX.Element {
  useKeyChanges()
  const show = useScript<BecomeState>({ docked: false, cards: [], landed: false, signed: false, over: false, hand: null, down: false, look: null }, BECOME_BEATS, play, PACE, leadMs('Then it becomes something. Each kind goes where it is useful.'))
  const world = useRef<HTMLDivElement>(null)
  useReport(report, show.done, show.settle, show.part)
  const s = show.state
  const scene = useRef<HTMLDivElement>(null)
  // Once played, the card turns by hand.
  const [over, setOver] = useState<boolean | null>(null)
  const box = <InlineKeys keys={keyFor('⌘.') || '⌘.'} />
  const send = <InlineKeys keys={keyFor('⌘↵') || '⌘↵'} />
  const said: Record<Turn, ReactNode> = {
    idle: <Action>Your turn: pick a kind, then press {box}</Action>,
    open: <Action>Now write one in quick capture, and press {send}</Action>,
    away: <Action>Press {box} to bring quick capture back</Action>,
    kept: <>Saved{mine && mine.kind !== pick ? `: “${(mine.label.split('\n')[0] ?? '').slice(0, 40)}”` : ''}. It is yours now, {mine?.kind === 'todo' ? 'in your tasks' : 'in your Inbox'}.</>
  }
  return (
    <>
      <Words title="Then it becomes something." still={!play} done={show.done}>
        Each kind goes where it is useful.
        <ForYou setup={setup} at="become" />
      </Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 flex-col items-start justify-center gap-[clamp(0.75rem,3vh,1.75rem)] pb-2">
        {/* No push-in here: four across fill the window, so the one shown comes forward instead. */}
        <Camera shot={WIDE} className="w-full max-w-[64rem]">
        <div ref={world} className="relative w-full">
        <Results cards={s.cards} landed={s.landed} signed={s.signed} over={over ?? s.over} quiet={!play} captions={s.docked} look={show.done ? null : s.look}
          onTurn={(to) => (show.done ? (chime('tap'), setOver(to)) : undefined)}
          pick={show.done ? pick : null} onPick={show.done ? onPick : undefined} kept={turn === 'kept'} tag={setup?.space} />
        </div>
        </Camera>
        <AnimatePresence>
          {show.done && (
            <motion.div key="turn" className="flex items-center gap-[clamp(1rem,2.5vw,2rem)] pt-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={{ duration: 0.25, ease: ENTER }}>
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
type PairsState = { pair: number; struck: boolean; row: boolean; /** How much of the answer now up has been typed, in letters. */ typed: number }

/**
 * What other notes, task and flashcard apps each leave a reader with, and what
 * Vigil does instead, in plain words. Only what Notion, Obsidian, Apple Notes
 * and Anki do not do as they come, and each said once: linking notes and long
 * pages are theirs too, so they are not claimed. What comes back on its own is
 * the Morning's, being asked it back the Evening's, the postcard a year on
 * Become's, catching from any app Catch's: none said twice. Line tasks: qa/line-tasks.mjs.
 */
const GAPS: [typeof BookOpen, string, string][] = [
  [QuoteIcon, 'Quotes pasted in without who said them', 'Type the quote and its source after it: *who said it, and where*, are filed for you'],
  [ListChecks, 'A to-do in a note that no list ever shows you', 'Pick lines in a note to make them *tasks, linked both ways*: tick one, both tick']
]

/**
 * What a commonplace book adds, a pair at a time, each staying once it has
 * come: what other apps leave you with, struck, then this. Timed in real
 * milliseconds: about three seconds a pair, as long as one takes to read;
 * the whole list then holds about as long as reading it again takes, before
 * the day follows on its own. A press shows them all at once, and the next
 * goes on.
 */
/** An answer's words with the ones that carry the point marked *so*: as parts, each said plain or stood out. */
const parts = (said: string): { text: string; key: boolean }[] => said.split('*').map((text, i) => ({ text, key: i % 2 === 1 })).filter((one) => one.text)
const plainOf = (said: string): string => said.replace(/\*/g, '')

const pairsBeats = (): Beat<PairsState>[] => {
  const random = seeded(31)
  const beats: Beat<PairsState>[] = [{ at: 0, to: {} }]
  let t = 100
  for (const [i, [, was, now]] of GAPS.entries()) {
    beats.push({ at: t, to: { pair: i, struck: false, typed: 0 } })
    t += readMs(was)
    beats.push({ at: t, to: { struck: true }, cue: cue('tag') })
    // Then its answer, typed in by a person's hand (lib/typing.ts).
    const run = typed<PairsState>(plainOf(now), t + 350, (sofar) => ({ typed: sofar.length }), random, 0.9, 2600)
    beats.push(...run.beats)
    t = run.end + 1400
  }
  // The last answer typed and read: the list waits for you (Next goes on to the day).
  beats.push({ at: t, to: { row: true } })
  return beats
}

/** An answer as far as it is typed: the rest laid out but unseen, so nothing moves as it types; the key words in the accent. */
function TypedAnswer({ said, upTo }: { said: string; upTo: number }): React.JSX.Element {
  let left = upTo
  return (
    <>
      {parts(said).map((part, i) => {
        const shown = part.text.slice(0, Math.max(0, left))
        const rest = part.text.slice(shown.length)
        left -= part.text.length
        const ink = part.key ? 'font-semibold text-primary' : ''
        return (
          <span key={i} className={ink}>
            {shown}
            {rest && <span className="opacity-0">{rest}</span>}
          </span>
        )
      })}
    </>
  )
}

/**
 * The pairs, as a list read down like a page: each arrives, its old way
 * struck through, and under it, large, what Vigil does instead. Nothing
 * leaves: the earlier pairs stay for whoever reads slower. Settled (a press,
 * Reduce motion, Motion off) it is the whole list, and it holds there.
 */
function Pairs({ play, report, onward }: { play: boolean; report: (now: Reel) => void; onward: () => void }): React.JSX.Element {
  const [beats] = useState(pairsBeats)
  const show = useScript<PairsState>({ pair: -1, struck: false, row: false, typed: 0 }, beats, play, 1, leadMs(PAIRS_LINE))
  // Settled, the next press goes on to the day rather than to the next chapter: Next says so.
  report({ done: show.done, settle: show.settle, more: () => (onward(), true), part: show.part, label: `Next: ${MOMENTS[0][0]}` })
  const s = show.state
  const all = show.done || s.row
  return (
    <div className="absolute inset-0 z-10 flex items-center">
      <ul data-pairs className="flex w-full max-w-[56rem] flex-col gap-[clamp(0.75rem,2.6vh,1.5rem)]">
        {GAPS.map(([Icon, was, now], i) => {
          const come = all || i <= s.pair
          const struck = all || i < s.pair || (i === s.pair && s.struck)
          return (
            <motion.li key={now} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4" initial={false}
              animate={{ opacity: come ? 1 : 0, y: come ? 0 : 6 }} transition={{ duration: 0.3, ease: ENTER }}>
              <Icon className="mt-1 size-[clamp(1.125rem,min(2vw,2.8vh),1.5rem)] text-primary" />
              <span className="flex flex-col">
                <span className={`text-[clamp(1rem,min(1.7vw,2.5vh),1.25rem)] leading-snug transition-colors duration-500 ${struck ? 'text-(--mf-wl-quiet) line-through decoration-primary/70' : 'text-foreground'}`}>{was}</span>
                {/* Typed in once its old way is struck; whole once it is past, or settled. */}
                <span data-answer className="font-heading text-[clamp(1.25rem,min(2.5vw,3.6vh),1.875rem)] leading-tight text-foreground" aria-label={plainOf(now)}>
                  <TypedAnswer said={now} upTo={all || i < s.pair ? Infinity : i === s.pair && s.struck ? s.typed : 0} />
                </span>
              </span>
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * An ordinary day, in four moments, each a problem and then what Vigil does
 * about it, the camera moving from one to the next across the day. Timed in
 * real milliseconds, each moment up at least as long as its words take to
 * read (225 words a minute, and a second to find them). A press goes on to
 * the next moment, never past one unseen.
 */
function dayBeats(): Beat<DayState>[] {
  const random = seeded(23)
  const beats: Beat<DayState>[] = [{ at: 0, to: { look: 0 } }]
  // Each moment: the camera arrives; its problem is read; then its answer, and once that is read, the picture plays.
  let t = 0
  const said = (i: number): number => {
    const [, problem, answer] = MOMENTS[i]
    beats.push({ at: t + 650 + readMs(problem), to: { answered: i + 1 } })
    return t + 650 + readMs(problem) + readMs(answer)
  }
  // Morning: something kept comes back in the box; worth knowing, so it goes to Review.
  let d = said(0)
  beats.push({ at: d, to: { hint: true }, cue: cue('memory') })
  beats.push({ at: d + 1500, to: { hand: 'thumbs' } })
  beats.push({ at: d + 1900, to: { tip: true } })
  beats.push({ at: d + 2800, to: { down: true }, cue: () => click('tick') })
  beats.push({ at: d + 2860, to: { down: false, tip: false, asking: true, hand: null }, cue: cue('promote') })
  const ask = typed<DayState>('What is a commonplace book?', d + 3000, (sofar) => ({ question: sofar }), random, 0.6, 1500)
  beats.push(...ask.beats)
  beats.push({ at: ask.end + 800, to: { kept: true }, cue: cue('noted') })
  // Between classes: the day's tasks stay on the desktop.
  t = ask.end + 2800
  beats.push({ at: t, to: { look: 1 }, stop: true })
  d = said(1)
  beats.push({ at: d, to: { sticky: true }, cue: cue('stick') })
  beats.push({ at: d + 1600, to: { hand: 'tick' } })
  beats.push({ at: d + 2100, to: { ticked: true, down: true }, cue: cue('done') })
  beats.push({ at: d + 2200, to: { down: false, hand: null } })
  // Evening: Review asks, just before you would forget.
  t = d + 3600
  beats.push({ at: t, to: { look: 3 }, stop: true })
  d = said(2)
  beats.push({ at: d + 300, to: { over: true }, cue: () => fold() })
  beats.push({ at: d + 3300, to: {} })
  return beats
}

/** The day's moments: the hour, the problem, and what Vigil does about it. */
const MOMENTS: [string, string, string][] = [
  ['Morning', 'You saved it, then never saw it again.', 'Now and then, quick capture brings back something you kept. Thumbs up, write a question, and Review will test you on it.'],
  ['Between classes', 'Your plan is in a tab you closed.', 'Today’s tasks can sit on your desktop as a sticky note. Tick them off right there.'],
  ['Evening', 'You read it, and a week later it is gone.', 'What you kept while reading comes back to be asked, in the book you write in, not a deck in another app. A word even asks its own question.']
]
const DAY_LINE = 'A normal day, once you have kept a few things.'
const PAIRS_LINE = 'What changes once it is all one book.'

function DayScene({ play, report }: { play: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const [beats] = useState(dayBeats)
  const show = useScript<DayState>({ look: 0, answered: 0, hint: false, tip: false, asking: false, question: '', kept: false, sticky: false, ticked: false, line: '', chip: false, logged: false, over: false, hand: null, down: false }, beats, play, 1, leadMs(DAY_LINE))
  // A press goes on to the next moment of the day; on the last, it settles it.
  const s = show.state
  // Which moment is up, and the one a press goes on to: named on Next, so it is clear more of the day is coming.
  const moment = [0, 1, 3].indexOf(s.look)
  report({ done: show.done, settle: show.onward, part: show.part, label: moment >= 0 && moment < MOMENTS.length - 1 ? `Next: ${MOMENTS[moment + 1][0]}` : undefined })
  const scene = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const shot = frameOn(world.current, `moment-${s.look}`, 1)
  // Shown once the camera knows where the first moment is (the world is measured after the first paint).
  const [framed, setFramed] = useState(false)
  useEffect(() => void requestAnimationFrame(() => setFramed(true)), [])
  // In the grid's corners, morning to evening down the diagonal: the camera moves once each time.
  const at = [0, 1, 3]
  return (
    <motion.div ref={scene} className="absolute inset-0" initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: ENTER }}>
      <Camera shot={shot} cut={!framed || s.look === 0} className="absolute -top-1/2 -left-1/2 h-[200%] w-[200%]">
        <div ref={world} className="relative grid size-full grid-cols-2 grid-rows-2">
          {[0, 1, 2, 3].map((cell) => {
            const i = at.indexOf(cell)
            if (i < 0) return <div key={cell} />
            const [hour, problem, answer] = MOMENTS[i]
            const look = at.indexOf(s.look)
            return (
              // Only the moment in view is shown: the others wait unseen, so nothing slides past the window's edge as the camera moves.
              <div key={cell} data-frame={`moment-${cell}`} className="min-h-0 min-w-0 transition-opacity ease-(--mf-ease)"
                style={{ opacity: framed && look === i ? 1 : 0, transitionDuration: look === i ? '300ms' : '150ms', transitionDelay: look === i && i > 0 ? '550ms' : '0ms' }}>
                <Moment hour={hour} problem={problem} answer={answer} answered={s.answered > i}>
                  {i === 0 && <MorningBox shown={s.hint} tip={s.tip} asking={s.asking} question={s.question} kept={s.kept} />}
                  {i === 1 && <DeskSticky on={s.sticky} ticked={s.ticked} />}
                  {i === 2 && <EveningReview over={s.over} />}
                </Moment>
              </div>
            )
          })}
        </div>
      </Camera>
      {play && !show.done && <GhostHand to={s.hand} down={s.down} root={scene} />}
    </motion.div>
  )
}

/** A day with Vigil: first what a commonplace book adds, then a day of it. */
/** What Vigil takes from each tool, said plainly: the names only, no logos. */
const TOOLS: [string, string][] = [['Obsidian', 'linked notes'], ['Notion', 'long pages'], ['Anki', 'remembering'], ['Todoist', 'tasks']]

type ToolsState = { shown: number; merged: boolean; line: boolean }

/** Where the book lives, said as it is (main/backup.ts): one database on this Mac, no account, and a daily copy in your own iCloud Drive when the Mac has one. Nothing else sends your notes anywhere. */
const WHERE = 'text-[clamp(1.125rem,min(2.2vw,3.2vh),1.625rem)] text-foreground'
const WHERE_SAID = 'max-w-[44ch] text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.375rem)] leading-snug text-balance text-(--mf-wl-body)'
const WHERE_TRUE = 'No account. A copy goes to your own iCloud Drive each day, if you use it.'

/** What each tool is for, under its name: read at a glance, in the body's ink. */
const TAKES = 'text-[clamp(1.125rem,min(2vw,3vh),1.5rem)] text-(--mf-wl-body)'

/**
 * The chapter's opening, as large as the welcome sets anything: the four
 * tools a reader may have lived in, one at a time, each with what Vigil takes
 * from it, held together; then they give way to one book, and where it lives.
 * Only opacity and a small scale move. A first press only finishes it; still,
 * it is the end state.
 */
function Tools({ play, report, onward, from = [] }: { play: boolean; report: (now: Reel) => void; onward: () => void; /** The tools you said you came from: they lead, in the accent. */ from?: string[] }): React.JSX.Element {
  const tools = [...TOOLS.filter(([name]) => from.includes(name)), ...TOOLS.filter(([name]) => !from.includes(name))]
  const [beats] = useState<Beat<ToolsState>[]>(() => {
    const merged = 400 + 3 * 1100 + 2200
    return [
      { at: 0, to: {} },
      // A name a little over a second apart, all four then held together for 2.2s, so each is read before they go.
      ...TOOLS.map((_, i): Beat<ToolsState> => ({ at: 400 + i * 1100, to: { shown: i + 1 }, cue: cue('bead') })),
      { at: merged, to: { merged: true }, cue: cue('gather') },
      { at: merged + 700, to: { line: true } },
      // Held as long as its words take to read; then the pairs follow on their own.
      { at: merged + 700 + readMs(`One book. All of it, in one place, on your own Mac. ${WHERE_TRUE}`), to: {}, cue: onward }
    ]
  })
  const show = useScript<ToolsState>({ shown: 0, merged: false, line: false }, beats, play, 1)
  report({ done: show.done, settle: show.settle, more: () => (onward(), true), part: show.part })
  const s = play ? show.state : { shown: 4, merged: true, line: true }
  const big = 'font-heading text-[clamp(2rem,min(4.6vw,7vh),4.25rem)] leading-none font-medium tracking-[-0.03em] text-foreground'
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-center gap-[clamp(1rem,4vh,2.5rem)]">
      <div className="relative">
        <motion.div className="flex w-full items-start gap-[clamp(1.5rem,4vw,3.5rem)]" initial={false} animate={{ opacity: s.merged ? 0 : 1, scale: s.merged ? 0.97 : 1 }} transition={{ duration: 0.3, ease: MOVE }}>
          {tools.map(([name, takes], i) => (
            <motion.div key={name} className="flex flex-col gap-2" initial={false}
              animate={{ opacity: i < s.shown ? 1 : 0, y: i < s.shown ? 0 : 6 }} transition={{ duration: 0.3, ease: ENTER }}>
              <span className={`${big} ${from.includes(name) ? 'text-primary' : ''}`}>{name}</span>
              <span className={TAKES}>{takes}</span>
            </motion.div>
          ))}
        </motion.div>
        {/* What they become: one book, in their place. */}
        <motion.span className={`${big} pointer-events-none absolute top-0 left-0 origin-left text-[clamp(2.75rem,min(6.4vw,9.5vh),6rem)]`} initial={false}
          animate={{ opacity: s.merged ? 1 : 0, scale: s.merged ? 1 : 0.95 }} transition={{ duration: 0.35, ease: ENTER, delay: s.merged ? 0.2 : 0 }}>One book.</motion.span>
      </div>
      <motion.div className="flex flex-col gap-[clamp(0.25rem,1vh,0.625rem)]" initial={false} animate={{ opacity: s.line ? 1 : 0, y: s.line ? 0 : 4 }} transition={{ duration: 0.3, ease: ENTER }}>
        <p className={WHERE}>All of it, in one place, on your own Mac.</p>
        <p className={WHERE_SAID}>{WHERE_TRUE}</p>
      </motion.div>
    </div>
  )
}

function DayChapter({ play, report, setup }: { play: boolean; report: (now: Reel) => void; setup?: Setup }): React.JSX.Element {
  const [stage, setStage] = useState<'tools' | 'pairs' | 'day'>('tools')
  const [docked] = useState(() => !play)
  const [dock, setDock] = useState(docked)
  useEffect(() => {
    if (dock) return
    const timer = setTimeout(() => setDock(true), leadMs('A day with Vigil.'))
    return () => clearTimeout(timer)
  }, [dock])
  const [done, setDone] = useState(false)
  // Before the pairs begin, a press brings the title down at once.
  if (!dock) report({ done: false, settle: () => setDock(true) })
  // The pairs, typed out, wait for a press before the day; the day waits at its end. Either way the page says it is waiting.
  const relay = (now: Reel): void => {
    report(now)
    const waits = stage !== 'tools' && now.done
    if (waits !== done) queueMicrotask(() => setDone(waits))
  }
  return (
    <>
      <Words title="A day with Vigil." docked={dock} still={!play} done={done}>
        {stage === 'day' ? DAY_LINE : stage === 'pairs' ? PAIRS_LINE : null}
      </Words>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {stage === 'tools'
          ? dock && <Tools play={play} report={relay} onward={() => setStage('pairs')} from={setup?.from ?? []} />
          : stage === 'pairs'
          ? <Pairs play={play} report={relay} onward={() => setStage('day')} />
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
    { at: 1350, to: { docked: true } },
    { at: 1700, to: { cards: false }, cue: () => fold() },
    { at: 2000, to: { dots: true }, cue: cue('bead') }
  ]
  const run = typed<ConnectState>('Essay on grit: open with @Do or', 2350, (sofar) => ({ note: sofar }), random, 0.75)
  beats.push(...run.beats)
  beats.push({ at: run.end + 150, to: { suggest: true }, cue: cue('search') })
  beats.push({ at: run.end + 1500, to: { suggest: false, note: 'Essay on grit: open with @Do or do not' }, cue: () => click('tick') })
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

function ConnectChapter({ play, report, setup }: { play: boolean; report: (now: Reel) => void; setup?: Setup }): React.JSX.Element {
  const [beats] = useState(connectBeats)
  const show = useScript<ConnectState>({ docked: false, cards: true, hand: null, dots: false, note: '', suggest: false, linked: false, folded: false, pulled: false, lit: null }, beats, play, PACE, leadMs('And it finds its friends. Type @ and a note’s name to link two notes.'))
  useReport(report, show.done, show.settle, show.part)
  const s = show.state
  const scene = useRef<HTMLDivElement>(null)
  const [lit, setLit] = useState<string | null | undefined>(undefined)
  // Pointed at a dot yourself: the call to do it, and the ring round the dot, stop.
  const [pointed, setPointed] = useState(false)
  return (
    <>
      <Words title="And it finds its friends." docked={s.docked} still={!play} done={show.done}>
        Type <Kbd className={LINE_KEY}>@</Kbd> and a note’s name to link two notes.
        <ForYou setup={setup} at="connect" />
      </Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 flex-col items-center justify-center pb-2">
        <AnimatePresence>
          {s.cards && (
            <motion.div key="cards" className="w-full max-w-[64rem] origin-center" exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.25, ease: MOVE } }}>
              <Results cards={BECOMES} landed signed over quiet={!play} captions={false} onTurn={() => undefined} />
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
  { at: 1350, to: { docked: true, radar: true } },
  { at: 1900, to: {}, cue: cue('wrapped') },
  { at: 2400, to: { lines: 1 } },
  { at: 3500, to: { lines: 2 } },
  { at: 4600, to: { lines: 3 } },
  { at: 5700, to: { lines: 4 } },
  { at: 7500, to: {} }
]

/** An example year: what Your year, wrapped finds out about its reader. */
const FOUND: [string, string][] = [
  ['Saved the most from Frankenstein.', '11 lines, more than from any other book'],
  ['Busiest on 14 March.', '23 things caught that day'],
  ['Reviewed one gem most.', '“Who is the monster?”, 9 times'],
  ['Reviewed on 112 different days.', '1,240 cards in all']
]
const YEAR = [{ kind: 'note', n: 142 }, { kind: 'todo', n: 96 }, { kind: 'quote', n: 64 }, { kind: 'word', n: 41 }, { kind: 'link', n: 52 }]
const YEAR_BEFORE = { label: 'The year before', kinds: [{ kind: 'note', n: 80 }, { kind: 'todo', n: 120 }, { kind: 'quote', n: 18 }, { kind: 'word', n: 9 }, { kind: 'link', n: 44 }] }

function ReturnChapter({ play, report }: { play: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const show = useScript<ReturnState>({ docked: false, radar: true, lines: 0 }, RETURN_BEATS, play, PACE, leadMs('And it all comes back to you. Ask any time, and Vigil reads your year back to you.'))
  useReport(report, show.done, show.settle, show.part)
  const s = show.state
  return (
    <>
      <Words title="And it all comes back to you." docked={s.docked} still={!play} done={show.done}>
        Ask any time, and Vigil reads your year back to you.
      </Words>
      {/* The card as tall as what it holds, in the middle of the room left: no empty band above the chart. */}
      <figure aria-label="An example year, read back" className="relative my-auto grid min-h-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] grid-rows-[auto_minmax(0,1fr)] items-center gap-x-[clamp(1.5rem,4vw,4rem)] rounded-2xl border border-foreground/10 bg-popover px-[clamp(1rem,3vw,2rem)] py-[clamp(0.75rem,2vh,1.25rem)]">
        <figcaption className="col-span-2 flex items-baseline gap-3">
          <span className="font-heading text-[clamp(1.0625rem,min(1.9vw,2.8vh),1.375rem)] font-medium text-foreground">An example year</span>
          <span className="text-[0.875rem] text-(--mf-wl-quiet)">Someone else’s, read back, to show how yours will look.</span>
        </figcaption>
        {/* As large as the room allows, its kinds named at a readable size. */}
        <div className="flex min-h-0 justify-center [&_svg]:max-h-[min(30rem,50vh)] [&_text]:text-[0.875rem]">
          {s.radar && (
            <motion.div className="w-full max-w-[30rem]" initial={play ? { opacity: 0, scale: 0.94 } : false} animate={{ opacity: 1, scale: 1 }} transition={LAND}>
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
  { at: 1350, to: { docked: true, dial: true }, cue: cue('slide') },
  { at: 2900, to: { ticks: 1 }, cue: () => tickDial('ArrowDown') },
  { at: 4400, to: { ticks: 2 }, cue: () => tickDial('ArrowUp') },
  { at: 6200, to: {} }
]

function DialChapter({ play, report, onPick, mine, setup }: { play: boolean; report: (now: Reel) => void; onPick: (theme: Theme) => void; mine: CaptureMeta | null; setup: Setup }): React.JSX.Element {
  const [say, setSay] = useState<string | undefined>()
  const show = useScript<DialState>({ docked: false, dial: true, ticks: 0 }, DIAL_BEATS, play, PACE, leadMs('Make it yours. The page you write on. Settings has it later too.'))
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
  useReport(report, show.done, settle, show.part)
  const s = show.state
  const win = useWindowSize()
  const size = Math.round(Math.max(150, Math.min(win.height * 0.42, win.width * 0.3, 360)))
  return (
    <>
      <Words title="Make it yours." docked={s.docked} still={!play} done={show.done}>
        The page you write on. Settings has it later too.
      </Words>
      <div className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        {/* Pages to judge a theme on, behind the dial, wearing each theme as it passes: your own first note
            when you wrote one, and a Review question. Nothing shown earlier in the welcome comes back here. */}
        {s.dial && (
          <>
            <motion.div aria-hidden data-dial-page="note" className="absolute top-[18%] left-[2%] w-[min(19rem,27%)] [@media(max-width:820px)]:hidden" initial={play ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0, rotate: -4 }} transition={{ ...LAND, delay: 0.15 }}>
              <div className="overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-(--mf-panel-shadow)">
                <p className="flex items-baseline gap-2 px-4 pt-3 pb-1 text-[0.8125rem] font-medium text-foreground">Inbox <span className="font-normal text-muted-foreground">{mine ? 'Yours, just now' : 'Note'}</span></p>
                <p className="px-4 pt-1 pb-3.5 font-heading text-[0.9375rem] leading-snug text-pretty text-foreground">{(mine?.label.split('\n')[0] || 'Chapter four: the creature learns to read by listening through a cottage wall.').slice(0, 140)}</p>
                {setup.space && <p className="-mt-2 px-4 pb-3.5"><span className="rounded-full bg-accent px-2 py-0.5 text-[0.8125rem] text-foreground">#{setup.space}</span></p>}
              </div>
            </motion.div>
            <motion.div aria-hidden data-dial-page="review" className="absolute right-[2%] bottom-[12%] w-[min(20rem,28%)] [@media(max-width:820px)]:hidden" initial={play ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0, rotate: 3 }} transition={{ ...LAND, delay: 0.25 }}>
              <div className="flex min-h-[8.5rem] flex-col justify-center rounded-xl border bg-popover px-5 py-5 text-popover-foreground shadow-(--mf-panel-shadow)">
                <p className="text-xs text-muted-foreground">Review · 3 due</p>
                <p className="mt-1.5 font-heading text-[1.1875rem] leading-snug font-semibold text-foreground">What does “anagnorisis” mean?</p>
              </div>
            </motion.div>
          </>
        )}
        {s.dial && (
          <motion.div className="relative z-10" initial={play ? { opacity: 0, scale: 0.95 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: ENTER }}>
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
 * A line that types itself as a person would, pausing at a full stop,
 * with a caret in the accent that blinks at the Mac's rate and goes once the
 * line has rested. Any key finishes it at once: reading never waits on it.
 */
function TypeLine({ text, className, onDone }: { text: string; className?: string; onDone?: () => void }): React.JSX.Element {
  const [n, setN] = useState(() => (still() ? text.length : 0))
  const [waits] = useState(() => typingWaits(text, seeded(5), 0.8, 2600))
  const [resting, setResting] = useState(false)
  // The screen's one voice while it types: the ring round today waits for it (lib/motion.ts).
  const voice = useId()
  useState(() => n < text.length && speak(voice, text, 10000, true))
  useEffect(() => () => hush(voice), [voice])
  useEffect(() => {
    if (n >= text.length) {
      hush(voice)
      onDone?.()
      const timer = setTimeout(() => setResting(true), 1200 * PACE)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => {
      setN((now) => now + 1)
      if (text[n] !== ' ') click('soft')
    // The first letter once the year has come in: one thing at a time. Then a person's hand (lib/typing.ts).
    }, n === 0 ? 680 * PACE : waits[n])
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
              <g className={quiet ? '' : 'mf-ruler-rise'}>
                <path d={`M${x(at)} ${H}V0`} stroke="var(--primary)" strokeWidth={2} fill="none"
                  style={{ transform: `scaleY(${rise})`, transformBox: 'fill-box', transformOrigin: '50% 100%', transition: quiet ? undefined : 'transform 420ms cubic-bezier(0.34, 1.4, 0.64, 1)' }} />
              </g>
            </svg>
            {/* The days marked for something: tall, in their colours, named. */}
            <RulerMarks start={start.format('YYYY-MM-DD')} days={days} width={w} today={today.format('YYYY-MM-DD')} />
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
/**
 * The way on. While the page still plays (`wait`), it says so: a thin line
 * fills along its foot over the time left, and the button sits a shade back
 * (a press now shows the end at once). Once the page waits for you, the line
 * is full and gone, the button comes up to full colour, and a ring goes out
 * from it once. With Motion off: no line and no ring, just the ready state.
 */
function Primary({ children, keys = '↵', onClick, hidden = false, wait = null }: { children: ReactNode; keys?: ReactNode; onClick: () => void; hidden?: boolean; wait?: Part | null }): React.JSX.Element {
  const [rang, setRang] = useState(0)
  const waited = useRef(!!wait)
  useEffect(() => {
    if (waited.current && !wait && !still()) setRang((n) => n + 1)
    waited.current = !!wait
  }, [!!wait]) // eslint-disable-line react-hooks/exhaustive-deps
  const left = wait ? Math.max(0, wait.to - performance.now()) : 0
  const gone = wait && wait.to > wait.from ? Math.min(1, Math.max(0, (performance.now() - wait.from) / (wait.to - wait.from))) : 0
  return (
    <button type="button" onClick={onClick} tabIndex={hidden ? -1 : 0} aria-hidden={hidden || undefined} data-next data-ready={wait ? undefined : ''}
      className={`relative flex h-[clamp(2.25rem,4.6vmin,2.75rem)] items-center gap-2.5 rounded-[0.6rem] pr-2 pl-3.5 text-[clamp(0.875rem,1.8vmin,1.0625rem)] font-semibold whitespace-nowrap text-primary-foreground transition-[opacity,transform,background-color] duration-300 ease-(--mf-ease) active:scale-[0.97] ${wait ? 'bg-[color-mix(in_oklab,var(--primary)_62%,var(--background))]' : 'bg-primary hover:bg-primary/90'} ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
      {/* The part still to play, filling along the foot of the button. */}
      {wait && wait.to > wait.from && !still() && (
        <span aria-hidden className="pointer-events-none absolute inset-x-2.5 bottom-[3px] h-[2px] overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--primary-foreground)_30%,var(--primary))]">
          <span key={`${Math.round(wait.from)}-${Math.round(wait.to)}`} className="mf-next-fill block h-full origin-left rounded-full bg-primary-foreground"
            style={{ ['--from' as string]: gone, animationDuration: `${Math.round(left)}ms` }} />
        </span>
      )}
      {/* Ready: one ring, going out once. */}
      {rang > 0 && <span key={rang} aria-hidden className="mf-next-ready pointer-events-none absolute -inset-[3px] rounded-[0.8rem] border-2 border-primary" />}
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
 * standing still, under a film of grain. With no scenery, the grain
 * on the page's own colour.
 */
function Backdrop({ plain, family }: { plain: boolean; family: Family }): React.JSX.Element {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* The last screen is a plain page: the scenery steps back for the choice. */}
      <div className={`absolute -inset-[2%] transition-opacity duration-300 ease-(--mf-ease) ${plain ? 'opacity-0' : 'opacity-100'}`}>
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
/** A key named in the Write chapter's step line. */
const STEP_KEY = 'h-[1.35em] min-w-[1.35em] rounded-[0.3em] px-[0.35em] font-sans text-[0.7em] text-foreground'
/** Keys inside a line of the larger type: sized to it, not to the app's small caps. */
const LINE_KEY = 'h-[1.3em] min-w-[1.3em] rounded-[0.3em] px-[0.3em] text-[0.62em]'
/** A way past a page, beside the one accent button: quiet until pointed at. */
const QUIET_BUTTON = 'flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center gap-2 rounded-[0.6rem] px-3 text-[clamp(0.8125rem,1.8vmin,1rem)] text-(--mf-wl-quiet) transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]'
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
    const timer = setTimeout(() => setSaid(true), calm || still() ? 0 : 900 * PACE)
    return () => clearTimeout(timer)
  }, [replay, calm])
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col justify-between gap-[clamp(1.5rem,5vh,3rem)]">
      <div className="grid items-center gap-x-[clamp(2rem,5vw,5rem)] @min-[64rem]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-[clamp(0.75rem,2.6vh,1.75rem)] pt-[clamp(0rem,4vh,3rem)]">
          <p className={FIGURES}>{when}</p>
          {replay ? <h1 className={`${HEADLINE_XL} max-w-[17ch]`}>{line}</h1> : <TypeLine text={line} className={`${HEADLINE_XL} max-w-[17ch]`} onDone={() => setSaid(true)} />}
          <p className={`${BODY} max-w-[34ch]`}>Your commonplace book: what you read, think and write, caught in a keystroke and brought back before you forget.</p>
        </div>
        {/* The other side of the line: once it is said, something kept comes back, a year on, as Vigil brings it back. */}
        <motion.div aria-hidden className="hidden w-full max-w-[22rem] justify-self-center @min-[64rem]:block" initial={false}
          animate={{ opacity: said ? 1 : 0, y: said ? 0 : 12, rotate: said ? -2.5 : 0 }} transition={calm || still() ? { duration: 0 } : { type: 'spring', duration: 0.7, bounce: 0.15, delay: 0.5 }}>
          <PostcardResult id="hello-quote" words={QUOTE.text} who={QUOTE.who!} where={QUOTE.where} signed={said} />
        </motion.div>
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
      if (!/[⌃⌥⌘]/.test(combo)) return void (chime('nope'), setSaid('Hold ⌘, ⌥ or ⌃ with it, so typing never opens quick capture.'))
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
        {taken ? <><InlineKeys keys={keyFor('⌘.') || '⌘.'} /> is already taken by another app on this Mac. Press the keys you would like instead.</> : <>Press the keys you would like for quick capture instead.</>}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => (chime('tap'), setListening(true))}
          className={`flex h-11 min-w-60 items-center gap-2.5 rounded-xl border px-4 text-[0.9375rem] transition-colors ${listening ? 'border-primary/60 bg-primary/[0.06] text-foreground' : 'text-(--mf-wl-body) hover:bg-foreground/[0.04]'}`}>
          {listening ? <><span className="mf-listening" aria-hidden />Press the keys…</> : <>Quick capture key: <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> <span className="ml-auto text-(--mf-wl-quiet)">Change</span></>}
        </button>
      </div>
      {asked && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => keep(asked)} className="flex h-9 items-center gap-2 rounded-[0.6rem] bg-primary px-4 text-[0.875rem] font-semibold text-primary-foreground active:scale-[0.97]">Use <InlineKeys keys={asked} /> for quick capture</button>
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
 * your old notes are a line of small links (2 and 3 on the keys). The
 * arrow at the top of the window points at Vigil in the menu bar, so the
 * words do not have to.
 */
function Start({ name, kept, skipped, importing, still, onPick, setup, onImport, onPowers }: { name: string; kept: number; skipped: false | 'first' | 'later'; importing: boolean; still: boolean; onPick: (pick: 1 | 2 | 3) => void; setup: Setup; onImport: (what: 'vault' | 'files') => void; onPowers: () => void }): React.JSX.Element {
  const others: { key: 2 | 3; title: string }[] = [
    { key: 2, title: "Peek into someone else's book first" },
    // Named for the app you said you came from, when Vigil can bring things in from it.
    { key: 3, title: sourceFrom(setup.from) && sourceFrom(setup.from) !== 'Other files' ? `Bring my notes from ${sourceFrom(setup.from)}` : 'Bring my notes' }
  ]
  const link = 'group flex items-center gap-2 rounded-[0.6rem] px-3 py-1.5 -mx-3 text-foreground transition-colors hover:bg-foreground/[0.06] active:scale-[0.98]'
  return (
    <div className="my-auto mr-auto flex w-full max-w-[58rem] flex-col gap-[clamp(1rem,4vh,2.5rem)] overflow-y-auto">
      <div className="flex flex-col gap-[clamp(0.5rem,1.8vh,1rem)]">
        <h1 className={`${HEADLINE_XL} max-w-[14ch]`}><Rise text={name ? `Your commonplace book is ready, ${name}.` : 'Your commonplace book is ready.'} still={still} /></h1>
        <p className={`${BODY} max-w-[30ch]`}>{kept ? `${counted(kept)} ${kept === 1 ? 'thing' : 'things'} in it already.` : 'Empty for now.'} <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> {kept ? 'adds the next' : 'fills it'}, from any app.</p>
        {setup.made?.goalId && setup.made.goalTitle && setup.made.goalBy && (
          <p data-start-goal className={`${WHERE_SAID} max-w-[48ch]`}><span className="font-medium text-foreground">“{setup.made.goalTitle}”</span> is on your Goals page, {dayjs(setup.made.goalBy).diff(dayjs().startOf('day'), 'day')} days to go.</p>
        )}
        {skipped && <p role="status" className={`${QUIET} max-w-[48ch]`}>The welcome waits in the Vigil menu and ⌘K.</p>}
      </div>
      {importing ? <ImportMap start={sourceFrom(setup.from)} onImport={onImport} still={still} /> : <FirstCard space={setup.space} />}
      <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 ${QUIET}`}>
        <span className="-mr-3">Or</span>
        {others.map((row) => (
          <button key={row.key} type="button" onClick={() => onPick(row.key)} className={link}>
            {row.title}
          </button>
        ))}
      </div>
      {/* Quietest of all: every power, a card each, for whoever wants the whole map first. */}
      <button type="button" onClick={onPowers} className={`${QUIET} -mx-1 self-start rounded-sm px-1 underline decoration-current/30 underline-offset-4 transition-colors hover:text-foreground`}>See everything Vigil can do</button>
    </div>
  )
}

/**
 * Your first card, so Review is not empty tomorrow: one thing worth
 * remembering and the question it answers, kept as a gem (in your first
 * space, if you picked one). Optional: Start fresh goes on without it.
 */
function FirstCard({ space }: { space: string | null }): React.JSX.Element {
  const [words, setWords] = useState('')
  const [question, setQuestion] = useState('')
  const [made, setMade] = useState(false)
  const keep = async (): Promise<void> => {
    if (!words.trim() || !question.trim() || made) return void chime('nope')
    const id = await vigil.nuggetFrom(space ? `${words.trim()} #${space}` : words.trim(), {})
    await vigil.saveItem(id, { prompt: question.trim() })
    chime('settled')
    setMade(true)
  }
  const field = 'h-10 min-w-0 flex-1 rounded-lg border border-foreground/15 bg-popover px-3 text-[0.9375rem] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]'
  if (made) return <p role="status" className="font-heading text-[clamp(1.125rem,min(2.2vw,3.2vh),1.5rem)] text-foreground">Your first gem is kept{space ? ` in #${space}` : ''}. Review will ask you: “{question.trim()}”</p>
  return (
    <form className="flex w-full max-w-[44rem] flex-col gap-2.5" onSubmit={(event) => (event.preventDefault(), void keep())}>
      <p className="font-heading text-[clamp(1.125rem,min(2.2vw,3.2vh),1.5rem)] leading-tight text-foreground">
        Make your first card, so Review has something tomorrow <span className="ml-1 text-[0.8em] text-(--mf-wl-quiet)">Optional</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <input aria-label="Something worth remembering" className={field} placeholder="Something worth remembering" value={words} maxLength={300} onChange={(event) => setWords(event.target.value)} />
        <input aria-label="The question it answers" className={field} placeholder="The question it answers" value={question} maxLength={200} onChange={(event) => setQuestion(event.target.value)} />
        <Button type="submit" variant="secondary" className="h-10" disabled={!words.trim() || !question.trim()}>Keep it</Button>
      </div>
    </form>
  )
}

/** Whether the welcome is on screen, for what should keep quiet under it. */
export const welcoming = (): boolean => document.documentElement.hasAttribute('data-welcoming')
export { inClay }
