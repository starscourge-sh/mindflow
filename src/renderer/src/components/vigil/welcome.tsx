import { TAGLINE } from '../../../../main/tagline'
import { fittedTitle, quoted } from '../../../../main/clip'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { ArrowUp, Compass, CornerDownLeft, FolderInput } from 'lucide-react'
import { shift, spring, still } from '@/lib/motion'
import { chime, click, fold } from '@/lib/sound'
import { applyTheme, currentTheme, type Theme } from '@/lib/theme'
import { comboOf, fixed, keyFor, listen, saveKeys, useKeyChanges } from '@/lib/keys'
import { NO_SETUP, onboarding, type Onboarding, type Setup } from '@/lib/onboarding'
import { ImportMap, sourceFrom } from './welcome-import'
import { answered, applySetup, Payoff, YouPage } from './welcome-you'
import { enterSandbox, SANDBOX } from '@/lib/sandbox'
import { examples, fillBox, holdKeys, STORY_DAY, tellBox } from '@/lib/welcome-box'
import keycapsUrl from '@/assets/welcome/keycaps.webp'
import type { CaptureMeta } from '@/components/capture-list'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { dayjs } from '../../../../main/dates'
import { clock, when } from '@/lib/clock'
import { readTask } from '../../../../main/task-words'
import { Scenery } from './scenery'
import { NOISE } from './grain'
import { ThemeDial } from './theme-dial'
import { Kbd, toast } from './ui'
import { FULL_TURN, glyph, inClay, konami } from './welcome-eggs'
import { WelcomeBackdrop, type Family } from './welcome-backdrop'
import { BACK_END, BACK_START, ComeBack, type BackShot } from './welcome-day'
import { CURSOR_MS, FLOW_END, FLOW_START, FLOW_WORDS, FlowTree, type FlowShot } from './welcome-flow'
import {
  CAM, ENTER, MOVE, leadMs, EMPTY_BOX, LAND, QUOTE, Rise, Caught, Stage,
  cue, seeded, starterOf, typed, useScript, type Beat, type Box, type Kind, type Part
} from './welcome-reel'

/**
 * The welcome, the first time Vigil opens (and again from the Vigil menu, ⌘K
 * or Settings): a short film that follows one thought, a question about old
 * movies had on a walk, from being caught to coming back. Each chapter opens
 * on what the one before left on the stage, and moves it on. Each idea is
 * said in one place only.
 *
 *   1 Why: the case in one screen, the day dated as a diary dates an entry
 *   2 You: four optional questions, and what Vigil did with the answers
 *   3 Catch: the key goes down, the box opens; the thought, a line from the
 *     film (its source read) and a plan to see it again (its day read) are
 *     caught; the kinds there are; then your turn
 *   4 Write: the thought becomes a long note; a line of it a task, another a
 *     gem with a question
 *   5 Remember: the task on the desktop, the gem's question in Review, the
 *     quote a year on as a postcard
 *   6 Make it yours: the theme dial
 *   7 Ready: start, the sandbox, or your notes
 *
 * Any key or click while a chapter plays settles it at its end; the next
 * press moves on. Esc settles a chapter, and never goes back a page. Motion off or
 * Reduce motion: every chapter arrives settled, with fades only.
 */

// Why first: the whole idea in one screen, so someone who stops there still has it.
const CHAPTERS = ['Why', 'You', 'Catch', 'Write', 'Remember', 'Make it yours', 'Ready']
const WHY = 1
const YOU = 2
const CATCH = 3
const WRITE = 4
const BACK = 5
const DIAL = 6
const LAST = 7
const EASE = ENTER
const capsOf = (keys: string): string[] => keys.match(/[⌃⌥⇧⌘]|[^⌃⌥⇧⌘]+/g) ?? []
/**
 * How long a chapter's headline and line hold the stage still before its
 * demo moves: a glance, less than a full skim (welcome-reel.tsx, leadMs),
 * since the words stay up and are read on while the demo plays. Never under
 * 1.2s, and never so long the page looks stuck.
 */
const glance = (words: string): number => Math.max(1200, leadMs(words) - 300)
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
// ⌘[ and ⌘], the app's own Back and Forward, are the welcome's Back and Next while it runs.
holdKeys(() => document.documentElement.hasAttribute('data-welcoming'), false, (event) =>
  window.dispatchEvent(event.metaKey && !event.shiftKey && (event.key === '[' || event.key === ']') ? new CustomEvent('vigil:welcome-step', { detail: event.key === '[' ? -1 : 1 }) : new CustomEvent('vigil:held')))

/** A chapter's report to the welcome: whether it has played to its end, and how to get it there now. */
type Reel = {
  done: boolean; settle: () => void; /** A chapter with a second part: true when it went on to it rather than letting the welcome move on. */ more?: () => boolean
  /** The part playing, shown filling along Next; none when it waits for you. */ part?: Part | null
  /** What Next goes on to, when it is more of this page ("Next: Evening"). */ label?: string
  /** A page with an earlier part of its own (the answers before their summary, an earlier moment of the day): true when Back went to it rather than to the page before. */ less?: () => boolean
  /** Held at the end of a part, with more of the page still to come: Next is ready, and goes on to it. */ waiting?: boolean
}
/** What Next shows: whether the page is still playing (and its part), and what it goes on to. */
type Cue = { done: boolean; part: Part | null; label?: string; waiting?: boolean }
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
  const [newcomer, setNewcomer] = useState(false)
  const picked = useRef<Theme | null>(null)
  const veteran = useRef(false)
  // Your turn, at the end of Catch: how far it has got, and the one you kept.
  const [turn, setTurn] = useState<Turn>('idle')
  const [mine, setMine] = useState<CaptureMeta | null>(null)
  // A key held back (lib main: heldInWelcome), said for a moment.
  const [held, setHeld] = useState(false)
  const quiet = still()
  // A first welcome on a fresh install: the only time an answer may add to the sidebar. Replayed, or with things kept, it stays theirs.
  const brandNew = !replay && newcomer
  // When the box last went away: an Esc a moment after is the same Esc, pressed twice out of habit.
  const awayAt = useRef(0)
  // A second press of Next within 400ms is one press, not two.
  const pressedAt = useRef(0)
  const dialog = useRef<HTMLDivElement>(null)
  // Whether the page on screen still plays, for Next to show (Primary).
  const [cue, setCue] = useState<Cue>({ done: true, part: null })
  const cueAt = useRef<Cue>(cue)
  // The pages seen on the way here, in order: Back returns to the one before, even after a skip.
  const trail = useRef<number[]>([])
  // The answers acted on and their summary shown: going back to You shows the summary again, as it was left.
  const [paid, setPaid] = useState(false)

  const go = (to: number, backward = false): void => {
    if (to < WHY || to > LAST || performance.now() - pressedAt.current < 400) return
    pressedAt.current = performance.now()
    if (backward) trail.current.pop()
    else trail.current.push(at)
    // Quick capture never stays up over a page it was not opened for.
    if (turn === 'open') window.api.hidePrompt()
    reel.current = { done: true, settle: () => undefined }
    // The next page says for itself whether it plays: until it does, nothing is taken as waiting for you.
    cueAt.current = { done: false, part: null }
    setCue(cueAt.current)
    setPlayed((now) => (at > 0 ? new Set(now).add(at) : now))
    setAt(to)
  }

  const open = (again: boolean): void => {
    void Promise.all([window.api.captures.list(), onboarding.state()]).then(([list, now]) => {
      before.current = new Set(list.map((one) => one.id))
      setNewcomer(list.length === 0)
      veteran.current = !now.welcomed && list.length > 0
      setState(now)
      setSetup(now.setup ?? NO_SETUP)
    })
    picked.current = null
    trail.current = []
    setPaid(false)
    setCaught([])
    setPlayed(new Set())
    setTurn('idle')
    setMine(null)
    setSkipped(false)
    setImporting(false)
    setReplay(again)
    // Opened again over a page still up: that page's way on (a part still to come) must not carry over to the opening.
    reel.current = { done: true, settle: () => undefined }
    setAt(WHY)
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

  // Your turn: nothing written in for you; the box opens empty, its examples typing in, a note first.
  useEffect(() => {
    tellBox(examples(), true)
  }, [at, turn])

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
    void applySetup(setup, brandNew).then((next) => onboarding.set({ setup: next })).catch(() => toast('Your answers could not be acted on just now. Set the same things any time in Settings.', undefined, 'warning'))
    void onboarding.set({ welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, ...(veteran.current && how !== 'fresh' ? { hidden: true } : {}) })
    // Into the sandbox, the welcome stays drawn (and still) under the opening
    // screen, which fades up over it: Home, about to be replaced by the restart,
    // never shows in between. It goes only if the sandbox cannot open.
    if (how === 'sandbox') setOpening(true)
    else setAt(-1)
    if (how === 'fresh') {
      chime('decided')
      window.api.openInHome('view', 'home')
      setTimeout(() => window.dispatchEvent(new CustomEvent('vigil:tour-stops')), 450)
    } else if (how === 'sandbox') {
      void enterSandbox().catch(() => (setOpening(false), setAt(-1), toast('The sandbox could not open just now. It waits in ⌘K, under “Open the sandbox”.', undefined, 'warning')))
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
    setSkipped(at === WHY ? 'first' : 'later')
    go(LAST)
  }
  const next = (): void => {
    if (!settled()) return
    chime('page')
    if (reel.current.more?.()) return
    if (at === DIAL && picked.current) applyTheme(picked.current)
    go(at + 1)
  }
  // Back returns to the screen seen just before, as it was left: an earlier part of this page first, then the page before (the one skipped from, after a skip).
  const back = (): void => {
    if (reel.current.less?.()) return void chime('page')
    if (at === LAST && importing) return (chime('page'), setImporting(false))
    const to = trail.current[trail.current.length - 1] ?? at - 1
    if (at <= WHY || to < WHY) return void chime('nope')
    chime('page')
    if (at === LAST) setSkipped(false)
    go(to, true)
  }
  const openBox = (): void => {
    if (!settled()) return
    tellBox(examples(), true)
    chime('open')
    window.api.showPrompt()
  }

  const [importing, setImporting] = useState(false)
  // Leaving for the sandbox: shown, but nothing in it answers any more.
  const [opening, setOpening] = useState(false)
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
    if (at === CATCH && turn !== 'kept' && reel.current.done) return openBox()
    if (at === LAST) return start(1)
    next()
  }

  // The keys, ahead of the app under it while the welcome is up.
  useEffect(() => {
    if (at < 0) return
    const onKey = (event: KeyboardEvent): void => {
      // The ghost turning the dial presses its keys too: only a person's keys count here.
      if (!event.isTrusted) return
      // On the way into the sandbox: no key does anything, here or in the app under it.
      if (opening) return void (event.preventDefault(), event.stopPropagation())
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
        else if (!reel.current.waiting) settled()
      } else if (event.key === 'Enter') primary()
      else if (event.key === 'ArrowRight' || event.key === ' ') {
        if (at !== LAST) next()
      } else if (event.key === 'ArrowLeft') back()
      else if (at === LAST && /^[123]$/.test(event.key)) start(Number(event.key) as 1 | 2 | 3)
      else if (at === DIAL && reel.current.done && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const dial = document.querySelector<HTMLElement>('[role="slider"][aria-label="Theme"]')
        if (!dial || dial.contains(target)) return
        dial.focus({ preventScroll: true })
        dial.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, bubbles: true }))
      } else if (!reel.current.done && !reel.current.waiting) {
        // Any other key while a chapter plays: its end, at once.
        settled()
      } else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    // ⌘[ and ⌘], held back from the app (holdKeys above): Back and Next, as anywhere else in Vigil.
    const onStep = (event: Event): void => {
      if (picking || opening) return
      if ((event as CustomEvent<number>).detail < 0) back()
      else if (at !== LAST) next()
    }
    window.addEventListener('vigil:welcome-step', onStep)
    return () => (window.removeEventListener('keydown', onKey, true), window.removeEventListener('vigil:welcome-step', onStep))
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
    const next: Cue = { done: now.done, part: now.done || now.waiting ? null : (now.part ?? null), label: now.label, waiting: now.waiting }
    const was = cueAt.current
    if (was.done !== next.done || was.label !== next.label || !!was.waiting !== !!next.waiting || Math.abs((was.part?.to ?? 0) - (next.part?.to ?? 0)) > 30 || Math.abs((was.part?.from ?? 0) - (next.part?.from ?? 0)) > 30) {
      cueAt.current = next
      queueMicrotask(() => setCue(next))
    }
  }
  const name = replay ? '' : (state?.name ?? '')
  // Your turn, once Catch has played: the way on is to try it, or to skip trying it.
  const trying = at === CATCH && turn !== 'kept' && cue.done
  return (
    <MotionConfig reducedMotion={quiet ? 'always' : 'never'}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal aria-label="Welcome to Vigil" inert={opening} onKeyDown={(event) => event.stopPropagation()}
      className="mf-welcome fixed inset-0 z-[70] flex outline-none flex-col overflow-hidden bg-background text-foreground [container-type:inline-size]">
      <Backdrop plain={at === LAST} family={at === WRITE ? 'ruled' : at === DIAL ? 'dots' : 'none'} />
      <div data-drag-strip="" className="relative h-11 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
      {at === LAST && <TrayArrow tray={state?.tray ?? null} />}
      <div className="relative mx-auto flex min-h-0 w-full max-w-[84rem] flex-1 flex-col">
        <main className="relative min-h-0 flex-1">
          <AnimatePresence initial={false}>
            <motion.section key={at}
              className="mf-more absolute inset-0 flex flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-[clamp(1.5rem,5vw,4rem)] pt-2"
              // One camera across the chapters: the last pushes on past, the next comes up out of the distance.
              initial={play ? { opacity: 0, scale: 0.97 } : false} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: ENTER }}
              // The dial's page goes at once: its ring, light and dots must never show over the next one.
              exit={at === DIAL ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 1.02, transition: { duration: 0.2, ease: MOVE } }}
              // A click on the picture while it plays: its end, as a key does.
              onPointerDown={(event) => void (event.isTrusted && !(event.target as HTMLElement).closest('button, a, [role="slider"]') && !reel.current.done && !reel.current.waiting && settled())}>
              {at === WHY && <ThesisChapter play={play} report={report} />}
              {at === YOU && <YouChapter setup={setup} onChange={answer} still={!play} report={report} fresh={brandNew} paid={paid} onPaid={setPaid} />}
              {at === CATCH && <CatchChapter play={play} report={report} state={state} onState={setState} setup={setup} turn={turn} mine={mine} />}
              {at === WRITE && <WriteChapter play={play} report={report} setup={setup} />}
              {at === BACK && <RememberChapter play={play} report={report} setup={setup} />}
              {at === DIAL && <DialChapter play={play} report={report} onPick={(theme) => (picked.current = theme)} mine={mine} />}
              {at === LAST && <Start name={name} kept={before.current.size + caught.length} mine={caught.length} skipped={skipped} importing={importing} still={!play} onPick={start} setup={setup} onImport={(what) => (leave('notes'), void window.api.importFrom(what))} />}
            </motion.section>
          </AnimatePresence>
        </main>
        <footer className="relative flex h-[clamp(4rem,9vmin,5.5rem)] shrink-0 items-center gap-3 px-[clamp(1.5rem,5vw,4rem)]">
          <div className="mr-auto flex min-w-0 items-center gap-[clamp(0.5rem,2vw,1.5rem)]">
            <Progress at={at} seen={played} onBack={back} />
            {/* The ways past a page sit with Back and the marks, far from the arrow, so the arrow only ever points from nothing to Next.
                Worded alike: Skip the welcome, or, on Your turn, Skip trying it. */}
            {(at === LAST || !caught.length) && !trying && (
              <button type="button" data-skip onClick={skip} className={`${QUIET_BUTTON} whitespace-nowrap`}>
                {at === LAST ? 'Start without the tour' : 'Skip the welcome'}
              </button>
            )}
            {trying && (
              <button type="button" data-skip onClick={next} className={`${QUIET_BUTTON} whitespace-nowrap`}>
                Skip trying it
              </button>
            )}
          </div>
          <AnimatePresence>
            {held && (
              <motion.p role="status" className="absolute left-1/2 -translate-x-1/2 text-[0.875rem] whitespace-nowrap text-(--mf-wl-body)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: spring.fast.exit }}>
                That waits until the welcome is done.
              </motion.p>
            )}
          </AnimatePresence>
          {/* Ready: an arrow beside the way on, nudging toward it. Its place is kept while the page plays, so nothing shifts when it comes. */}
          <NextArrow on={at === LAST || cue.done || !!cue.waiting} page={at} quiet={quiet} />
          {at < LAST && (trying
            ? <Primary onClick={openBox} keys={<BoxKeys />}>Try it in quick capture</Primary>
            : <Primary onClick={next} wait={cue.done || cue.waiting ? null : cue.part ?? { from: 0, to: 0 }}>{cue.label ?? (at === WHY ? 'Show me' : 'Next')}</Primary>)}
          {at === LAST && <Primary onClick={() => start(1)}>Start</Primary>}
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
function Progress({ at, seen, onBack }: { at: number; /** The chapters already shown: one skipped past stays faint. */ seen: Set<number>; onBack: () => void }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 text-[clamp(0.8125rem,1.8vmin,1rem)] text-(--mf-wl-quiet)">
      <span className="sr-only">{at > 0 ? `Chapter ${at} of ${CHAPTERS.length}: ${CHAPTERS[at - 1]}` : 'Welcome'}</span>
      {/* Nothing comes before the first page: Back keeps its place there, unseen, so the marks never shift. */}
      <button type="button" onClick={onBack} tabIndex={at > WHY ? 0 : -1} aria-hidden={at > WHY ? undefined : true}
        className={`-ml-3 flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center rounded-[0.6rem] px-3 transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97] ${at > WHY ? '' : 'invisible'}`}>
        Back
      </button>
      <span aria-hidden className="flex items-center gap-1">
        {CHAPTERS.map((_, i) => (
          <motion.span key={i} className="h-[3px] w-5 origin-left rounded-full bg-foreground" initial={false}
            animate={{ opacity: i + 1 === at ? 0.85 : seen.has(i + 1) ? 0.4 : 0.14, scaleX: i + 1 === at ? 1 : 0.55 }} transition={spring.moderate} />
        ))}
      </span>
      {/* Narrow, the marks alone say where you are: the name makes room, so the skip link never crowds the arrow beside Next. */}
      <span aria-hidden className="relative inline-flex h-[1.3em] min-w-[8rem] overflow-hidden [@container(max-width:960px)]:hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={at} className="text-foreground" initial={{ opacity: 0, transform: shift('translateY(100%)') }} animate={{ opacity: 1, transform: shift('translateY(0%)') }} exit={{ opacity: 0, transform: shift('translateY(-100%)') }} transition={{ duration: 0.24, ease: EASE }}>
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
 * A call to action, on its own line and larger than the words around it, in
 * the page's own ink: only its keys stand out, drawn as keys. The shine is
 * kept for the one short phrase that carries a chapter. One a chapter at most.
 */
function Action({ className = '', children }: { className?: string; children: ReactNode }): React.JSX.Element {
  return (
    <motion.p className={`font-heading text-[clamp(1.25rem,min(2.4vw,3.4vh),1.75rem)] leading-tight font-medium whitespace-nowrap text-foreground ${className}`}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: 0.2 }}>
      {children}
    </motion.p>
  )
}

/** Tells the welcome how far the chapter has got, every render. */
function useReport(report: (now: Reel) => void, done: boolean, settle: () => void, part?: Part | null): void {
  report({ done, settle, part })
}

// --- Why ------------------------------------------------------------------------

/**
 * The whole idea, on one screen, so someone who reads nothing else still has
 * it, every line serving one promise (your notes come back to you; you do
 * not have to go back to them): the day, dated as a diary dates an entry;
 * most notes are never seen again; the three kinds of app people keep them
 * in, each by what it keeps (kinds, not brands, so no fan of one has anything
 * to argue with); why: in each, going back is your job; and the answer typed
 * in: in Vigil they come back on their own, a memory card on Home (hint-card,
 * this day last year) and a spaced question in Review; and what a commonplace
 * book is, in one line. One thing at a time.
 */
const THESIS = 'Most notes are written once and never seen again.'
/** The apps someone like this already uses, each by what it keeps: named, so they see at once where Vigil fits. */
const THREE: [string, string][] = [
  ['Notion and Obsidian', 'keep what you write.'],
  ['Todoist', 'keeps what you plan.'],
  ['Anki', 'keeps what you mean to remember.']
]
/** Said once the three are up: why notes go unseen (going back is left to you). */
const QUESTION = 'In each one, going back is your job. So mostly, nobody does.'
const ANSWER = 'In Vigil, your notes *come back to you*: an old note when you open the app, a question as you start to forget it.'
/** The first time the words are used, what they mean: the cycle the chapters after follow (Catch, Write, Remember). */
const BOOK = 'Vigil is a commonplace book, the kind writers have kept for centuries: catch a thought, write it out, and it finds you again.'

type ThesisState = { typed: number; gaps: number; asked: boolean; answer: boolean; said: number; book: boolean }

function thesisBeats(): Beat<ThesisState>[] {
  const random = seeded(41)
  const beats: Beat<ThesisState>[] = [{ at: 0, to: {} }]
  const run = typed<ThesisState>(THESIS, 350, (sofar) => ({ typed: sofar.length }), random, 0.9, 2000)
  beats.push(...run.beats)
  // Read the line whole before anything else comes.
  let t = run.end + 800
  // Each tool's line stays up: the next comes once it is glanced at (each is a few words, read on while the next comes).
  THREE.forEach((_, i) => {
    beats.push({ at: t, to: { gaps: i + 1 }, cue: cue('bead') })
    // The kind first, then (a beat later) what it keeps.
    t += 1400
  })
  // The cause, glanced at (it stays up); then the answer, typed in as a person would (read as it types), its key words shining; then what Vigil is, in one line.
  beats.push({ at: t, to: { asked: true } })
  t += Math.max(1200, leadMs(QUESTION) - 600)
  beats.push({ at: t, to: { answer: true }, cue: cue('settled') })
  const answer = typed<ThesisState>(plainOf(ANSWER), t + 250, (sofar) => ({ said: sofar.length }), random, 0.9, 2200)
  beats.push(...answer.beats)
  t = answer.end + 1200
  beats.push({ at: t, to: { book: true } })
  // The last line stays up: it is read while Next waits, not before Next is ready.
  beats.push({ at: t + 700, to: {} })
  return beats
}

function ThesisChapter({ play, report }: { play: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const [beats] = useState(thesisBeats)
  const [when] = useState(dateline)
  const show = useScript<ThesisState>({ typed: 0, gaps: 0, asked: false, answer: false, said: 0, book: false }, beats, play, 1)
  useReport(report, show.done, show.settle, show.part)
  const s = show.done ? { typed: THESIS.length, gaps: THREE.length, asked: true, answer: true, said: Infinity, book: true } : show.state
  const typing = s.typed < THESIS.length
  const come = (on: boolean): { initial: false; animate: { opacity: number; y: number }; transition: object } => ({
    initial: false, animate: { opacity: on ? 1 : 0, y: on ? 0 : 6 }, transition: { duration: play ? 0.35 : 0, ease: ENTER }
  })
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center pb-2">
      <div data-reel={show.done ? 'done' : 'playing'} data-words className="flex max-w-[58rem] flex-col gap-[clamp(0.75rem,2.6vh,1.75rem)]">
        <p className={FIGURES}>{when}</p>
        <p data-tagline className="text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.3125rem)] font-semibold text-foreground">{TAGLINE}</p>
        <h1 data-thesis="line" data-typed={s.typed} aria-label={THESIS} className={`${HEADLINE_XL} max-w-[18ch]`}>
          <span aria-hidden>{THESIS.slice(0, s.typed)}</span>
          {play && !show.done && <span aria-hidden className={`mf-caret ${typing ? 'mf-caret-typing' : 'mf-caret-gone'}`} />}
          <span aria-hidden className="invisible">{THESIS.slice(s.typed)}</span>
        </h1>
        <ul className="flex flex-col gap-[clamp(0.25rem,1vh,0.5rem)]">
          {THREE.map(([name, gap], i) => (
            <motion.li key={name} data-thesis={`gap-${i}`} className="text-[clamp(1.125rem,min(2.1vw,3vh),1.5rem)] leading-snug text-(--mf-wl-body)" {...come(s.gaps > i)}>
              {/* The kind of app, a beat, then what it does, in italics: said the way a person would. */}
              <span className="font-semibold text-foreground">{name}</span>{' '}
              <motion.span className="italic" initial={false} animate={{ opacity: s.gaps > i ? 1 : 0 }} transition={{ duration: play ? 0.3 : 0, delay: play && !show.done ? 0.45 : 0, ease: ENTER }}>{gap}</motion.span>
            </motion.li>
          ))}
        </ul>
        <motion.p data-thesis="question" className="text-balance text-[clamp(1.125rem,min(2.1vw,3vh),1.5rem)] leading-snug font-medium text-foreground" {...come(s.asked)}>
          {QUESTION}
        </motion.p>
        <motion.p data-thesis="answer" data-typed={Math.min(s.said, plainOf(ANSWER).length)} aria-label={plainOf(ANSWER)} className="font-heading text-[clamp(1.375rem,min(2.8vw,4vh),2.25rem)] leading-tight text-foreground" {...come(s.answer)}>
          <TypedAnswer said={ANSWER} upTo={s.said} />
        </motion.p>
        <motion.p data-thesis="book" className="text-balance text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.3125rem)] leading-snug text-(--mf-wl-body)" {...come(s.book)}>
          {BOOK}
        </motion.p>
      </div>
    </div>
  )
}

// --- 2 You ------------------------------------------------------------------------

/**
 * Two questions before anything else, then a first space and a goal: all
 * optional (welcome-you.tsx). Then, if anything was answered, what Vigil did
 * with it, done there and then, each with its Undo; with nothing answered,
 * Next goes straight on.
 */
function YouChapter({ setup, onChange, still, report, fresh, paid, onPaid: setPaid }: { setup: Setup; onChange: (next: Setup) => void; still: boolean; report: (now: Reel) => void; /** A fresh install's first welcome: the only time the sidebar may be added to. */ fresh: boolean; /** The summary is up (kept by the welcome, so coming back shows it again). */ paid: boolean; onPaid: (paid: boolean) => void }): React.JSX.Element {
  const [working, setWorking] = useState(false)
  report({
    done: !working,
    settle: () => undefined,
    // Back from the summary: the questions, every answer as it was given.
    less: () => (paid ? (setPaid(false), true) : false),
    more: () => {
      if (paid || !answered(setup)) return false
      setWorking(true)
      void applySetup(setup, fresh).then((next) => {
        onChange(next)
        setPaid(true)
        chime('decided')
      }).catch(() => toast('Your answers are kept; they are acted on when the welcome ends.', undefined, 'warning')).finally(() => setWorking(false))
      return true
    }
  })
  return (
    <>
      <Words key={paid ? 'paid' : 'ask'} title={paid ? 'Vigil is shaped for you now.' : 'Tell Vigil a little about you.'} docked still={still} done>
        {paid ? 'Here is what that means for you.' : 'So it starts out shaped for you. Skip any question.'}
      </Words>
      <div className="mf-more relative flex min-h-0 flex-1 flex-col justify-[safe_center] overflow-y-auto pb-2">
        {paid
          ? <Payoff setup={setup} onChange={onChange} onBack={() => (chime('page'), setPaid(false))} still={still} fresh={fresh} />
          : <YouPage setup={setup} onChange={onChange} still={still} />}
      </div>
    </>
  )
}

/** A line for what you said Vigil is for, under a chapter's words: why this part matters to you, the words that say it *marked* to shine. */
type Where = 'catch' | 'write' | 'remember'
const FOR_YOU: Partial<Record<NonNullable<Setup['use']>, Partial<Record<Where, string>>>> = {
  study: { remember: 'For study: this is how you *revise well before the exam*.' },
  work: { catch: 'For work: write a task with its day, and *it is on your list for that day*.' },
  writing: { write: 'For writing: your drafts live here, *next to the reading they came from*.' },
  life: { catch: 'For everyday life: a recipe, a plan, a line from a film; *one key, and it is kept*.' }
}
/** The line for you, in plain words, for a chapter's lead to count. */
const forYou = (setup: Setup | undefined, at: Where): string => plainOf((setup?.use && FOR_YOU[setup.use]?.[at]) || '')
function ForYou({ setup, at }: { setup?: Setup; at: Where }): React.JSX.Element | null {
  const said = setup?.use ? FOR_YOU[setup.use]?.[at] : undefined
  return said ? <span data-for-you aria-label={plainOf(said)} className="mt-1 block font-medium text-foreground">{parts(said).map((part, i) => (part.key ? <Shine key={i}>{part.text}</Shine> : <span key={i}>{part.text}</span>))}</span> : null
}

/** The words that carry a line's point: the accent with a light passing over it now and then (main.css, .mf-sheen). */
function Shine({ children, done = false }: { children: ReactNode; done?: boolean }): React.JSX.Element {
  return <span className="mf-sheen font-semibold" data-done={done || undefined}>{children}</span>
}

// --- 3 Catch ------------------------------------------------------------------------

/** What Catch catches, in order: the thought the story follows, a line from the film it is about, then a plan to see the film again. */
const CAUGHT: Kind[] = ['note', 'quote', 'todo']

type CatchState = { keys: boolean; down: number[]; box: Box | null; filled: Kind[]; said: Kind[]; kinds: boolean; aha: 'keys' | null }

/**
 * Three things caught, a beat at a time, with Vigil doing the sorting: each
 * is typed in by a person's hand, then what Vigil read in it lifts out into
 * its place and the chip turns to its kind, while beside its slot a line
 * says what that did for you; Create presses itself, and the words fly to
 * their slot. The lines stay, so the box goes on without waiting for them
 * to be read. Real milliseconds.
 */
function catchBeats(): Beat<CatchState>[] {
  const random = seeded(17)
  const todo = readTask(starterOf('todo').text)
  const day = todo.due ? when(todo.due, todo.allDay) : 'Saturday 20:00'
  const lit = todo.spans.length ? starterOf('todo').text.slice(Math.min(...todo.spans.map((one) => one.from))) : ''
  // The keys are up from the first frame, "Just watch" under them: they press as soon as the words over them are glanced at, and open the box.
  const beats: Beat<CatchState>[] = [
    { at: 0, to: {} },
    { at: 50, to: { down: [0] }, cue: cue('tap') },
    { at: 120, to: { down: [0, 1] }, cue: cue('tap') },
    { at: 220, to: { down: [] } },
    { at: 340, to: { keys: false, box: EMPTY_BOX }, cue: cue('open') }
  ]
  let t = 600
  // Each one: typed in, never more than its cap; a breath to see it whole; what Vigil read lifts out
  // and its line comes up beside the slot; the chip turns to its kind; Create; the words fly to their slot.
  const catchOne = (item: Kind, whole: string, at: (sofar: string) => Partial<Box>, sorted: Partial<Box> | null, kind: Box['kind'], sortCue: () => void, cap: number): void => {
    const run = typed<CatchState>(whole, t + 200, (sofar) => ({ box: { ...EMPTY_BOX, item, typing: true, ...at(sofar) } }), random, 0.85, cap)
    beats.push({ at: t, to: { box: { ...EMPTY_BOX, item, typing: true } } }, ...run.beats)
    const then = { ...EMPTY_BOX, item, ...at(whole), ...sorted }
    const read = run.end + 450
    let sent = read + 150
    if (sorted) {
      beats.push({ at: read, to: { box: then, said: [...CAUGHT.slice(0, CAUGHT.indexOf(item) + 1)] }, cue: sortCue })
      beats.push({ at: read + 450, to: { box: { ...then, kind } }, cue: cue('shift') })
      sent = read + 1300
    }
    beats.push({ at: sent, to: { box: { ...then, kind, press: true } }, cue: () => (click('tick'), chime('send')) })
    // Sent: in its slot, and (a plain thought, with nothing to read in it) its line comes now; the keys' line goes with the first.
    beats.push({ at: sent + 60, to: { box: { ...EMPTY_BOX }, filled: CAUGHT.slice(0, CAUGHT.indexOf(item) + 1), said: CAUGHT.slice(0, CAUGHT.indexOf(item) + 1), aha: null } })
    t = sent + 550
  }
  catchOne('note', FLOW_WORDS.caught, (sofar) => ({ text: sofar }), null, 'note', () => undefined, 1500)
  // Past the closing mark: who said it, and where, lit as Vigil reads them.
  const said = `${QUOTE.text} - ${QUOTE.who}, ${QUOTE.where}`
  catchOne('quote', said, (sofar) => {
    if (sofar.length <= QUOTE.text.length + 2) return { text: sofar }
    const [who, where = ''] = sofar.slice(QUOTE.text.length + 3).split(', ')
    return { text: QUOTE.text, tail: { who, where } }
  }, { tail: null, who: QUOTE.who!, where: QUOTE.where! }, 'quote', cue('promote'), 2200)
  const plain = starterOf('todo').text.slice(0, starterOf('todo').text.length - lit.length).trim()
  catchOne('todo', starterOf('todo').text, (sofar) => (sofar.length <= plain.length + 1 ? { text: sofar } : { text: plain, lit: sofar.slice(plain.length + 1) }), { lit: null, date: day }, 'todo', cue('tag'), 2200)
  beats.push({ at: t - 490, to: {}, cue: cue('settled') })
  // The kinds there are, in the box's place, as the picker lists them; they stay up, read while Next waits.
  beats.push({ at: t, to: { kinds: true }, cue: cue('open') })
  beats.push({ at: t + 900, to: {} })
  // In time order: a line's coming is set before the typing it overlaps.
  return beats.sort((one, two) => one.at - two.at)
}

/** What Vigil did with each thing caught, beside it: a bold lead-in, then why it helps. The keys' line is said under the keys. */
const AHA: Partial<Record<Kind, [string, string]>> = {
  note: ['Caught in seconds.', 'Now your mind can let go of it.'],
  quote: ['Kept with its source.', 'Vigil read who said it, and where.'],
  todo: ['Dated for you.', `On your list for ${STORY_DAY}, at ${clock(dayjs().hour(20).minute(0).toDate())}.`]
}
const KEYS_SAID: [string, string] = ['Just watch.', 'Later, these keys open it from any app.']
/** Catch's line: what the box is and what it does that others do not. No keys in it: they are on the stage, to watch. */
const CATCH_BOX = 'Quick capture opens over any app, and it'
const CATCH_SHINE = 'spots the details'
/** What it spots, said plainly after the shine: what the three catches below show. */
const CATCH_TAIL = ': dates, names, kinds.'

/** The kinds, each with what it does: the welcome's own words for them. */
const WHAT: Record<string, string> = {
  note: 'Anything else, kept as you wrote it',
  todo: 'Goes to your tasks, on the day it names',
  quote: 'Someone’s words, signed with who said them',
  word: 'A word to learn, asked back in “Review”',
  link: 'A page, kept with its name and picture',
  decision: 'A choice, back on a date to check it still holds',
  experiment: 'Tried until a date, then asks what you found'
}

/**
 * The kind chip's list, opened in the box's place: every kind and what it
 * does, a row at a time. Only the kinds the box offers.
 */
function KindList({ still }: { still: boolean }): React.JSX.Element {
  const kinds = CAPTURE_TYPES.filter((type) => type.id in WHAT)
  const half = Math.ceil(kinds.length / 2)
  return (
    <motion.div className="relative z-10 origin-bottom-left rounded-[14px] border bg-popover p-2.5 text-popover-foreground shadow-(--mf-panel-shadow)"
      initial={still ? false : { opacity: 0, scale: 0.96, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, transition: spring.slow.exit }} transition={spring.slow}>
      <p className="px-2 pt-1 pb-2 text-[0.9375rem] font-medium text-foreground">{counted(kinds.length)} kinds. Vigil guesses which, and you can always change it.</p>
      {/* Two columns, each a stack of its own: a row sits under the one above it at one gap, never stretched to match a taller row beside it. */}
      <div className="grid grid-cols-2 items-start gap-x-2">
        {[kinds.slice(0, half), kinds.slice(half)].map((column, c) => (
          <ul key={c} className="flex min-w-0 flex-col">
            {column.map((type, j) => {
              const Icon = type.icon
              const i = c * half + j
              return (
                <motion.li key={type.id} data-kind-row={type.id} className="flex min-w-0 items-start gap-2 rounded-md px-2 py-1"
                  initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: still ? 0 : 0.15 + i * 0.06 }}>
                  <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: type.tint }} />
                  <span className="min-w-0 leading-tight">
                    <span className="block text-[0.9375rem] font-medium text-foreground">{type.label}</span>
                    <span className="block text-[0.875rem] text-muted-foreground">{WHAT[type.id]}</span>
                  </span>
                </motion.li>
              )
            })}
          </ul>
        ))}
      </div>
    </motion.div>
  )
}

/** What the keys are for, under them and then under the box until the first thing is caught: a bold lead-in, then why. */
function KeysLine({ on, enter = false }: { on: boolean; /** Fades in as it mounts (under the keys); under the box it carries on as it was. */ enter?: boolean }): React.JSX.Element {
  return (
    <div aria-live="polite" className="flex min-h-[2.4em] items-center pt-3 text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.3125rem)] leading-snug">
      <AnimatePresence initial={enter}>
        {on && (
          <motion.p key="keys" data-aha="keys" className="text-balance text-foreground" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15, ease: MOVE } }} transition={{ duration: 0.25, ease: ENTER }}>
            <strong className="font-semibold">{KEYS_SAID[0]}</strong> {KEYS_SAID[1]}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

function CatchChapter({ play, report, state, onState, setup, turn, mine }: { play: boolean; report: (now: Reel) => void; state: Onboarding | null; onState: (now: Onboarding) => void; setup?: Setup; turn: Turn; mine: CaptureMeta | null }): React.JSX.Element {
  useKeyChanges()
  const [beats] = useState(catchBeats)
  // The keys press once the words over them are glanced at: nothing moves on the stage while they are.
  const show = useScript<CatchState>({ keys: true, down: [], box: null, filled: [], said: [], kinds: false, aha: 'keys' }, beats, play, 1, glance(`Catch it before it goes. ${CATCH_BOX} ${CATCH_SHINE}${CATCH_TAIL} ${forYou(setup, 'catch')}`))
  useReport(report, show.done, show.settle, show.part)
  const s = show.state
  const [choosing, setChoosing] = useState(false)
  const keys = keyFor('⌘.') || '⌘.'
  const caps = capsOf(keys)
  const down = new Set(s.down)
  const box = <InlineKeys keys={keys} />
  const send = <InlineKeys keys={keyFor('⌘↵') || '⌘↵'} />
  // Its own quote marks dropped (a quote keeps them), cut at a word with “…” when long.
  const first = mine?.label.split('\n')[0].trim() ? quoted(mine.label.split('\n')[0], 44, (text, n) => fittedTitle(text, n) ?? text) : ''
  // A different key, offered where the keys are asked for: Your turn.
  const other = (
    <button type="button" onClick={() => (chime('tap'), setChoosing(true))} className={`${QUIET} rounded-sm underline decoration-current/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current/60`}>
      Use a different key
    </button>
  )
  const said: Record<Turn, ReactNode> = {
    idle: <><Action>Your turn: press {box} and write anything</Action>{other}</>,
    open: <Action>Now write something, and press {send} to save it</Action>,
    away: <><Action>Press {box} to bring quick capture back</Action>{other}</>,
    kept: <>Saved{first ? ` ${first}` : ''}. It is in {mine?.kind === 'todo' ? 'your tasks' : 'your Inbox'}.</>
  }
  return (
    <>
      <Words title="Catch it before it goes." still={!play} done={show.done}>
        {state?.boxTaken || choosing ? (
          <KeyPicker taken={!!state?.boxTaken} onState={onState} />
        ) : (
          <>
            {CATCH_BOX} <Shine done={show.done}>{CATCH_SHINE}</Shine>{CATCH_TAIL}
            <ForYou setup={setup} at="catch" />
          </>
        )}
      </Words>
      <div className="relative flex min-h-0 flex-1 flex-wrap content-center items-center gap-x-[clamp(1.5rem,4vw,3.5rem)] gap-y-[clamp(0.75rem,2.5vh,1.5rem)] pb-2">
        <div data-frame="box" className="relative w-[min(40rem,100%)] shrink-0 @min-[880px]:w-[min(40rem,56%)]">
          {s.keys && (
            <>
              <motion.div layoutId="reel-box" transition={CAM} className="flex items-end gap-2" initial={play ? { opacity: 0, scale: 0.95 } : false} animate={{ opacity: 1, scale: 1 }}>
                {keys === '⌘.'
                  ? <KeycapPicture down={down} width={280} />
                  : caps.map((cap, i) => <Keycap key={`${cap}${i}`} label={glyph(cap, i === caps.length - 1)} down={down.has(i)} size={84} />)}
              </motion.div>
              {/* Under the keys, what they are for: later, not now. The same line stays under the box when it opens. */}
              <KeysLine on={s.aha === 'keys'} enter={play} />
            </>
          )}
          {s.box && (
            <>
              {/* The box steps back while the kinds are shown in its place. */}
              <motion.div className={s.kinds ? 'absolute inset-x-0 top-0' : ''} initial={false} animate={{ opacity: s.kinds ? 0 : 1, scale: s.kinds ? 0.97 : 1 }} transition={{ duration: 0.25, ease: MOVE }}>
                <Stage box={s.box} />
                <KeysLine on={s.aha === 'keys'} />
              </motion.div>
              {/* In the box's place, in the page's flow: it takes the room it needs, nothing sits under it. */}
              <AnimatePresence>{s.kinds && <KindList key="kinds" still={!play} />}</AnimatePresence>
            </>
          )}
        </div>
        {/* What was caught, beside the box, each with what Vigil did with it. */}
        {/* Its slots come with the box: while the keys are up, they are the one thing to watch. */}
        <motion.div className="relative z-10 min-w-[14rem] flex-1" initial={false} animate={{ opacity: s.keys ? 0 : 1 }} transition={{ duration: 0.3, ease: ENTER }}>
          <Caught kinds={CAUGHT} filled={s.filled} said={s.said} lines={AHA} />
        </motion.div>
        {/* Your turn, once it has all played: in the real box, with nothing to pick (the box guesses the kind). */}
        <AnimatePresence>
          {show.done && (
            <motion.div key={turn} role="status" data-turn={turn} className="relative z-10 flex w-full shrink-0 flex-wrap items-baseline gap-x-5 gap-y-1 text-[clamp(1rem,min(2vw,2.9vh),1.375rem)] leading-snug text-foreground"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={{ duration: 0.25, ease: ENTER }}>
              {said[turn]}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}

// --- 4 Write ------------------------------------------------------------------------

const WRITE_TITLE = 'Write it out.'
const WRITE_LINE = 'Write at length, then select a line to make it a task or a gem.'

/**
 * The thought caught in Catch, there from the first frame; then, in real
 * milliseconds: it grows into a note; the pointer selects one line, presses
 * "Make a task", and the task lands with its day; another line, "Make a gem",
 * and the gem lands, its question typed in; then the closing line.
 * Each card lands with its own words under it, so nothing waits to be said.
 */
function writeBeats(): Beat<FlowShot>[] {
  const random = seeded(31)
  const beats: Beat<FlowShot>[] = [{ at: 0, to: {} }, { at: 50, to: { shown: 2 }, cue: cue('slide') }]
  // You pick a line: the pointer comes to its start, drags across it (the selection grows with it), its one action
  // shows beside the selection, the pointer presses it, and only then is the line marked and what it becomes set down.
  const pick = (t: number, line: 'task' | 'gem', shown: number, sound: () => void): number => {
    const dragAt = t + CURSOR_MS.travel + 60
    const barAt = dragAt + CURSOR_MS.drag + 40
    const pressAt = barAt + 180 + CURSOR_MS.button + 40
    beats.push({ at: t, to: { cursor: { line, to: 'start' } } })
    beats.push({ at: dragAt, to: { cursor: { line, to: 'end' }, picked: line, pressed: false }, cue: () => click('soft') })
    beats.push({ at: barAt, to: { bar: true } })
    beats.push({ at: barAt + 180, to: { cursor: { line, to: 'button' } } })
    beats.push({ at: pressAt, to: { pressed: true }, cue: () => click('tick') })
    beats.push({ at: pressAt + 160, to: { picked: null, bar: false, pressed: false, lit: line === 'task' ? 1 : 2, shown }, cue: sound })
    return pressAt + 160
  }
  let t = pick(1000, 'task', 3, cue('tag'))
  t = pick(t + 450, 'gem', 4, cue('promote'))
  // The pointer steps away once the gem is made: what is left is yours.
  beats.push({ at: t + 500, to: { cursor: null } })
  const question = typed<FlowShot>(FLOW_WORDS.question, t + 450, (sofar) => ({ question: sofar }), random, 0.75, 1500)
  beats.push(...question.beats)
  beats.push({ at: question.end + 500, to: { last: true }, cue: cue('settled') })
  // The closing line stays up: it is read while Next waits.
  beats.push({ at: question.end + 1100, to: {} })
  return beats
}

function WriteChapter({ play, report, setup }: { play: boolean; report: (now: Reel) => void; setup?: Setup }): React.JSX.Element {
  const [beats] = useState(writeBeats)
  const show = useScript<FlowShot>(FLOW_START, beats, play, 1, glance(`${WRITE_TITLE} ${WRITE_LINE} ${forYou(setup, 'write')}`))
  useReport(report, show.done, show.settle, show.part)
  return (
    <>
      <Words title={WRITE_TITLE} still={!play} done={show.done}>{WRITE_LINE}<ForYou setup={setup} at="write" /></Words>
      <div className="relative flex min-h-0 flex-1 flex-col pb-2">
        <FlowTree shot={show.done ? FLOW_END : show.state} quiet={!play} />
      </div>
    </>
  )
}

// --- 5 Remember ---------------------------------------------------------------------

const BACK_TITLE = 'It comes back to you.'
const BACK_LINE = 'Tasks on their day, gems before they fade, a saved line a year on.'

/**
 * The three kept things, there from the first frame; then, in real
 * milliseconds, each comes back in turn and stays: the sticky, ticked off;
 * Review's card, turned over, and the curve under it all for why; the
 * postcard, signed.
 */
const BACK_BEATS: Beat<BackShot>[] = [
  { at: 0, to: {} },
  { at: 50, to: { shown: 1 }, cue: cue('stick') },
  { at: 1500, to: { ticked: true }, cue: cue('done') },
  { at: 2700, to: { shown: 2 }, cue: cue('open') },
  // The curve under the three, a beat after the gem's card, so it reads as that card's why.
  { at: 3100, to: { curve: true } },
  { at: 4200, to: { over: true }, cue: () => fold() },
  { at: 5600, to: { shown: 3 }, cue: cue('memory') },
  { at: 6500, to: { signed: true } },
  // The last moment stays up: it is looked at while Next waits.
  { at: 7700, to: {} }
]

/** An answer's words with the ones that carry the point marked *so*: as parts, each said plain or stood out. */
const parts = (said: string): { text: string; key: boolean }[] => said.split('*').map((text, i) => ({ text, key: i % 2 === 1 })).filter((one) => one.text)
const plainOf = (said: string): string => said.replace(/\*/g, '')
const shining = (said: string): ReactNode => parts(said).map((part, i) => (part.key ? <Shine key={i}>{part.text}</Shine> : <span key={i}>{part.text}</span>))

/** An answer as far as it is typed: the rest laid out but unseen, so nothing moves as it types; the key words shining. */
function TypedAnswer({ said, upTo }: { said: string; upTo: number }): React.JSX.Element {
  let left = upTo
  return (
    <>
      {parts(said).map((part, i) => {
        const shown = part.text.slice(0, Math.max(0, left))
        const rest = part.text.slice(shown.length)
        left -= part.text.length
        // The words that carry the point shine (main.css, .mf-sheen); the rest of a part waits unseen beside it, never inside it.
        return (
          <span key={i}>
            {shown && (part.key ? <Shine>{shown}</Shine> : shown)}
            {rest && <span className={`opacity-0 ${part.key ? 'font-semibold' : ''}`}>{rest}</span>}
          </span>
        )
      })}
    </>
  )
}

function RememberChapter({ play, report, setup }: { play: boolean; report: (now: Reel) => void; setup?: Setup }): React.JSX.Element {
  const show = useScript<BackShot>(BACK_START, BACK_BEATS, play, 1, glance(`${BACK_TITLE} ${BACK_LINE} ${forYou(setup, 'remember')}`))
  useReport(report, show.done, show.settle, show.part)
  return (
    <>
      <Words title={BACK_TITLE} still={!play} done={show.done}>
        {BACK_LINE}
        <ForYou setup={setup} at="remember" />
      </Words>
      <div className="relative flex min-h-0 flex-1 flex-col justify-center pb-2">
        <ComeBack shot={show.done ? BACK_END : show.state} quiet={!play} said={shining} />
      </div>
    </>
  )
}

/** Where the book lives, said as it is (main/backup.ts): one database on this Mac, no account, and a daily copy in your own iCloud Drive when the Mac has one. Nothing else sends your notes anywhere. Said on the last page. */
const WHERE_SAID = 'max-w-[44ch] text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.375rem)] leading-snug text-balance text-(--mf-wl-body)'
const WHERE_TRUE = 'It all stays on this Mac, with no account. A copy goes to your own iCloud Drive each day, if you use it.'

// --- 6 Make it yours ----------------------------------------------------------------

type DialState = { ticks: number }

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

/** Two ticks of the dial, one on and one back, so the page you had is the page you keep: the first as soon as the words are glanced at. Real milliseconds. */
const DIAL_BEATS: Beat<DialState>[] = [
  { at: 0, to: {} },
  { at: 50, to: { ticks: 1 }, cue: () => tickDial('ArrowDown') },
  { at: 1300, to: { ticks: 2 }, cue: () => tickDial('ArrowUp') },
  { at: 1900, to: {} }
]

/** Named from the dial's own list (lib/theme.ts, THEMES): Paper is the lightest, Gruvbox a warm dark one. */
const DIAL_LINE = 'Pick how your pages look, from Paper to Gruvbox. Change it any time in “Settings”.'
/** The note behind the dial when you have not written one yet: a line anyone might keep, from no book shown before. */
const DIAL_NOTE = 'Rain on the train window, and everyone quiet.'

function DialChapter({ play, report, onPick, mine }: { play: boolean; report: (now: Reel) => void; onPick: (theme: Theme) => void; mine: CaptureMeta | null }): React.JSX.Element {
  const [say, setSay] = useState<string | undefined>()
  const show = useScript<DialState>({ ticks: 0 }, DIAL_BEATS, play, 1, glance(`Make it yours. ${DIAL_LINE}`))
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
  const win = useWindowSize()
  const size = Math.round(Math.max(150, Math.min(win.height * 0.42, win.width * 0.3, 360)))
  return (
    <>
      <Words title="Make it yours." still={!play} done={show.done}>
        {DIAL_LINE}
      </Words>
      <div className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        {/* Pages to judge a theme on, behind the dial, wearing each theme as it passes: your own first note
            when you wrote one, and a Review question. Nothing shown earlier in the welcome comes back here. */}
        <>
            <motion.div aria-hidden data-dial-page="note" className="absolute top-[18%] left-[2%] w-[min(19rem,27%)] [@media(max-width:820px)]:hidden" initial={play ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0, rotate: -4 }} transition={{ ...LAND, delay: 0.15 }}>
              <div className="overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-(--mf-panel-shadow)">
                <p className="flex items-baseline gap-2 px-4 pt-3 pb-1 text-[0.8125rem] font-medium text-foreground">Inbox <span className="font-normal text-muted-foreground">{mine ? 'Yours, just now' : 'Note'}</span></p>
                <p className="px-4 pt-1 pb-3.5 font-heading text-[0.9375rem] leading-snug text-pretty text-foreground">{(mine?.label.split('\n')[0] || DIAL_NOTE).slice(0, 140)}</p>
              </div>
            </motion.div>
            <motion.div aria-hidden data-dial-page="review" className="absolute right-[2%] bottom-[12%] w-[min(20rem,28%)] [@media(max-width:820px)]:hidden" initial={play ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0, rotate: 3 }} transition={{ ...LAND, delay: 0.25 }}>
              <div className="flex min-h-[8.5rem] flex-col justify-center rounded-xl border bg-popover px-5 py-5 text-popover-foreground shadow-(--mf-panel-shadow)">
                <p className="text-xs text-muted-foreground">Review · 3 due</p>
                <p className="mt-1.5 font-heading text-[1.1875rem] leading-snug font-semibold text-foreground">What does “petrichor” mean?</p>
              </div>
            </motion.div>
        </>
          <motion.div className="relative z-10" initial={play ? { opacity: 0, scale: 0.95 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: ENTER }}>
            {/* Its own layer in the crossfade, shown live: the ring and its light never stop while the page changes. */}
            <div className="[view-transition-name:mf-theme-dial]">
              <ThemeDial calm size={size} big wear={fadeTo} onPick={(theme) => void (show.done && (yours.current = true, setTurned(true), onPick(theme)))} onFullTurn={() => (setSay(FULL_TURN), setTimeout(() => setSay(undefined), 1800))} say={say} />
            </div>
            {show.done && !turned && <Action className="relative z-20 mt-1 text-center">Your turn: turn the dial</Action>}
          </motion.div>
      </div>
    </>
  )
}

// --- the parts kept from before -------------------------------------------------

/** The moment the welcome opened, as a diary dates an entry: the day, then the hour in your Mac's own style. */
const dateline = (): string => `${dayjs().format('dddd D MMMM')}, ${clock(new Date())}`

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

/**
 * Once a page waits for you: a short arrow in the accent beside the way on,
 * drawn in Vigil's own line (round ends, the same weight as its keys), easing
 * toward the button and back, a nudge every couple of seconds. It comes a
 * moment after the button's ring, and goes the moment Next is pressed. With
 * Motion off or Reduce motion: there, still.
 */
function NextArrow({ on, page, quiet }: { on: boolean; /** Each page's own arrow: a press goes on, its arrow goes, even when the next page is ready at once. */ page: number; quiet: boolean }): React.JSX.Element {
  return (
    <span aria-hidden className="relative -mr-1 flex h-6 w-8 shrink-0 items-center justify-end [@container(max-width:560px)]:hidden">
      <AnimatePresence>
        {on && (
          <motion.span key={page} data-next-arrow className="flex text-primary"
            initial={quiet ? { opacity: 0 } : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: { duration: 0.12, ease: MOVE } }}
            transition={quiet ? { duration: 0.2 } : { duration: 0.35, ease: ENTER, delay: 0.35 }}>
            <motion.svg viewBox="0 0 28 14" className="h-3.5 w-7 overflow-visible" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"
              data-still={quiet || undefined}
              animate={quiet ? undefined : { x: [0, 5, 0] }}
              transition={quiet ? undefined : { duration: 1.1, ease: MOVE, repeat: Infinity, repeatDelay: 0.9, delay: 0.7 }}>
              <path d="M3 7h20" />
              <path d="M18 2.5 23.5 7 18 11.5" />
            </motion.svg>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
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
/** Keys inside a line of the larger type: sized to it, not to the app's small caps. */
const LINE_KEY = 'h-[1.3em] min-w-[1.3em] rounded-[0.3em] px-[0.3em] text-[0.62em]'
/** A way past a page, beside the one accent button: quiet until pointed at. */
const QUIET_BUTTON = 'flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center gap-2 rounded-[0.6rem] px-3 text-[clamp(0.8125rem,1.8vmin,1rem)] text-(--mf-wl-quiet) transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]'
/** A date or a count set in the type: figures that line up, in the quiet ink. */
const FIGURES = 'text-[clamp(0.875rem,min(1.9vw,2.8vh),1.25rem)] tabular-nums text-(--mf-wl-quiet)'

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

/**
 * What is in the book, said as what it is: the notes written just now, your
 * own from before, or (in the sandbox) its example notes. Never "things".
 */
const keptSaid = (kept: number, mine: number): string => {
  if (kept === mine) return kept === 1 ? 'Your first note is in it.' : `Your first ${counted(kept).toLowerCase()} notes are in it.`
  return `${kept < 10 ? counted(kept) : kept} ${SANDBOX ? 'example ' : ''}${kept === 1 ? 'note' : 'notes'} in it already.`
}

/**
 * The end: a decision already made for you, with two other ways round it.
 * Your book is ready and Start opens it; the sandbox and your old notes are
 * two cards under it, each saying in a line what it does (2 and 3 on the
 * keys, and Tab reaches them). Nothing else asks for a choice on the way out. The
 * arrow at the top of the window points at Vigil in the menu bar, so the
 * words do not have to.
 */
function Start({ name, kept, mine, skipped, importing, still, onPick, setup, onImport }: { name: string; kept: number; /** How many of them were written in the welcome itself. */ mine: number; skipped: false | 'first' | 'later'; importing: boolean; still: boolean; onPick: (pick: 1 | 2 | 3) => void; setup: Setup; onImport: (what: 'vault' | 'files') => void }): React.JSX.Element {
  const from = sourceFrom(setup.from)
  const others: { key: 2 | 3; title: string; line: string; icon: typeof Compass }[] = [
    { key: 2, title: 'Try it with example notes first', line: 'Look around a book already full of notes. Yours waits for when you come back.', icon: Compass },
    // Named for the app you said you came from, when Vigil can bring things in from it.
    { key: 3, title: from && from !== 'Other files' ? `Bring my notes from ${from}` : 'Bring my notes', line: 'From Obsidian, Notion, Anki or files. See what each thing becomes before you choose.', icon: FolderInput }
  ]
  return (
    <div className="my-auto mr-auto flex w-full max-w-[58rem] flex-col gap-[clamp(1rem,4vh,2.5rem)] overflow-y-auto">
      <div className="flex flex-col gap-[clamp(0.5rem,1.8vh,1rem)]">
        <p data-tagline className={`${BODY} font-semibold text-foreground`}>{TAGLINE}</p>
        <h1 className={`${HEADLINE_XL} max-w-[14ch]`}><Rise text={name ? `Your commonplace book is ready, ${name}.` : 'Your commonplace book is ready.'} still={still} /></h1>
        <p data-start-kept className={`${BODY} max-w-[30ch]`}>{kept ? <>{keptSaid(kept, mine)} <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> adds the next, from any app.</> : <>Press <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> from any app to save your first note.</>}</p>
        {setup.made?.goalId && setup.made.goalTitle && setup.made.goalBy && (
          <p data-start-goal className={`${WHERE_SAID} max-w-[48ch]`}><span className="font-medium text-foreground">“{setup.made.goalTitle}”</span> is on your Goals page, {dayjs(setup.made.goalBy).diff(dayjs().startOf('day'), 'day')} days to go.</p>
        )}
        <p data-start-where className={WHERE_SAID}>{WHERE_TRUE}</p>
        {skipped && <p role="status" className={`${QUIET} max-w-[48ch]`}>The welcome waits in the Vigil menu and ⌘K.</p>}
      </div>
      {importing ? <ImportMap start={from} onImport={onImport} still={still} /> : (
        // The other two ways in, as choices you can see at a glance: a card each, its key with it.
        <div data-start-choices className="grid w-full max-w-[48rem] grid-cols-2 gap-3 [@container(max-width:640px)]:grid-cols-1">
          {others.map((row, i) => {
            const Icon = row.icon
            return (
              <motion.button key={row.key} type="button" data-choice={row.key} onClick={() => onPick(row.key)}
                initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: ENTER, delay: still ? 0 : 0.35 + i * 0.08 }}
                className="group flex items-start gap-3 rounded-xl border border-foreground/12 bg-popover px-4 py-3.5 text-left text-popover-foreground shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_10%,transparent)] transition-[background-color,border-color,box-shadow,scale] duration-200 ease-(--mf-ease) hover:border-foreground/25 hover:bg-[color-mix(in_oklab,var(--foreground)_3%,var(--popover))] hover:shadow-(--mf-panel-shadow) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98]">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.9} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[clamp(1rem,min(1.7vw,2.4vh),1.1875rem)] leading-snug font-semibold text-foreground">{row.title}</span>
                  <span className="text-[clamp(0.9375rem,min(1.5vw,2.1vh),1.0625rem)] leading-snug text-(--mf-wl-body)">{row.line}</span>
                </span>
                <Kbd className="mt-0.5 h-6 min-w-6 shrink-0">{row.key}</Kbd>
              </motion.button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Whether the welcome is on screen, for what should keep quiet under it. */
export const welcoming = (): boolean => document.documentElement.hasAttribute('data-welcoming')
export { inClay }
