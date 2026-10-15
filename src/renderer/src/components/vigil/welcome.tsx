import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { ArrowUp, CornerDownLeft } from 'lucide-react'
import { shift, spring } from '@/lib/motion'
import { chime, click, fold } from '@/lib/sound'
import { applyTheme, currentTheme, type Theme } from '@/lib/theme'
import { comboOf, fixed, keyFor, listen, saveKeys, useKeyChanges } from '@/lib/keys'
import { NO_SETUP, onboarding, type Onboarding, type Setup } from '@/lib/onboarding'
import { ImportMap, sourceFrom } from './welcome-import'
import { answered, applySetup, Payoff, YouPage } from './welcome-you'
import { enterSandbox } from '@/lib/sandbox'
import { examples, fillBox, holdKeys, tellBox } from '@/lib/welcome-box'
import keycapsUrl from '@/assets/welcome/keycaps.webp'
import type { CaptureMeta } from '@/components/capture-list'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { dayjs, when } from '../../../../main/dates'
import { readTask } from '../../../../main/task-words'
import { Scenery } from './scenery'
import { NOISE } from './grain'
import { ThemeDial } from './theme-dial'
import { Kbd, toast } from './ui'
import { FULL_TURN, glyph, inClay, konami } from './welcome-eggs'
import { WelcomeBackdrop, type Family } from './welcome-backdrop'
import { CAPTION, TABLE, DeskSticky, EveningReview, LongNote, Moment, NOTE_START, SLASH, SLASH_SAID, type NoteShot } from './welcome-day'
import { FLOW_SAID, FLOW_WORDS, FlowTree, GEM_SAID, type FlowShot } from './welcome-flow'
import {
  CAM, Camera, ENTER, MOVE, leadMs, readMs, EMPTY_BOX, frameOn, GhostHand, LAND, PostcardResult, QUOTE, Rise, Slots, Stage, WORD,
  cue, PACE, seeded, starterOf, typed, useScript, type Beat, type Box, type Kind, type Part
} from './welcome-reel'

/**
 * The welcome, the first time Vigil opens (and again from the Vigil menu, ⌘K
 * or Settings): a short film in six chapters, each first shown, then handed
 * to you. Each idea is said in one place only.
 *
 *   1 Why: the case in one screen, the day dated as a diary dates an entry
 *   2 You: four optional questions, and what Vigil did with the answers
 *   3 Catch: the key goes down, the box opens, three things are caught and
 *     read (a source, a meaning, a day); the kinds there are; then your turn
 *   4 Write: long notes, the block menu and a picture's caption
 *   5 The flow: a passing thought becomes a note, a task and a gem
 *   6 A day: a postcard a year on, the sticky on the desktop, Review
 *   7 Make it yours: the theme dial
 *   8 Ready: start, the sandbox, or your notes
 *
 * Any key or click while a chapter plays settles it at its end; the next
 * press moves on. Esc settles a chapter, and never goes back a page. Motion off or
 * Reduce motion: every chapter arrives settled, with fades only.
 */

// Why first: the whole idea in one screen, so someone who stops there still has it.
const CHAPTERS = ['Why', 'You', 'Catch', 'Write', 'The flow', 'A day', 'Make it yours', 'Ready']
const WHY = 1
const YOU = 2
const CATCH = 3
const WRITE = 4
const FLOW = 5
const DAY = 6
const DIAL = 7
const LAST = 8
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
      if (picking) return
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
              onPointerDown={(event) => void (event.isTrusted && !(event.target as HTMLElement).closest('button, a, [role="slider"]') && !reel.current.done && !reel.current.waiting && settled())}>
              {at === WHY && <ThesisChapter play={play} report={report} />}
              {at === YOU && <YouChapter setup={setup} onChange={answer} still={!play} report={report} fresh={brandNew} paid={paid} onPaid={setPaid} />}
              {at === CATCH && <CatchChapter play={play} report={report} state={state} onState={setState} setup={setup} turn={turn} mine={mine} />}
              {at === WRITE && <WriteChapter play={play} report={report} setup={setup} />}
              {at === FLOW && <FlowChapter play={play} report={report} />}
              {at === DAY && <DayChapter play={play} report={report} setup={setup} />}
              {at === DIAL && <DialChapter play={play} report={report} onPick={(theme) => (picked.current = theme)} mine={mine} />}
              {at === LAST && <Start name={name} kept={before.current.size + caught.length} skipped={skipped} importing={importing} still={!play} onPick={start} setup={setup} onImport={(what) => (leave('notes'), void window.api.importFrom(what))} />}
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
                {at === LAST ? 'Skip the tips' : 'Skip the welcome'}
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
 * it: the day, dated as a diary dates an entry; notes are taken to be used;
 * the three tools people split them across, each said by what it is for (so
 * no fan of one has anything to argue with); then why jump between apps at
 * all, and the answer typed in: in Vigil it is all one place (not a link
 * between those apps); and what a commonplace book is, in one line. One
 * thing at a time. The question and the answer are the user's own words.
 */
const THESIS = 'You don’t take notes to do nothing with them.'
/** Each tool, by what it is for. Names only, no logos. */
const THREE: [string, string][] = [
  ['Obsidian', 'is for keeping notes.'],
  ['Todoist', 'is for doing.'],
  ['Anki', 'is for remembering.']
]
/** Asked once the three are up: why split it at all. */
const QUESTION = 'Why jump between apps to write down things that work better together?'
const ANSWER = 'In Vigil you write, read, study and plan *in one place*, because it’s all connected.'
/** The first time the words are used, what they mean. */
const BOOK = 'It is a commonplace book: one notebook for what you read, think and plan.'

type ThesisState = { typed: number; gaps: number; asked: boolean; answer: boolean; said: number; book: boolean }

function thesisBeats(): Beat<ThesisState>[] {
  const random = seeded(41)
  const beats: Beat<ThesisState>[] = [{ at: 0, to: {} }]
  const run = typed<ThesisState>(THESIS, 350, (sofar) => ({ typed: sofar.length }), random, 0.9, 2200)
  beats.push(...run.beats)
  // Read the line whole before anything else comes.
  let t = run.end + 900
  // Each tool's line stays up: the next comes once it is skimmed.
  THREE.forEach(([name, gap], i) => {
    beats.push({ at: t, to: { gaps: i + 1 }, cue: cue('bead') })
    t += Math.max(1500, leadMs(`${name} ${gap}`))
  })
  // The question, skimmed (it stays up); then the answer, typed in as a person would, its key words shining; then what Vigil is, in one line.
  beats.push({ at: t, to: { asked: true } })
  t += Math.max(1500, leadMs(QUESTION))
  beats.push({ at: t, to: { answer: true }, cue: cue('settled') })
  const answer = typed<ThesisState>(plainOf(ANSWER), t + 250, (sofar) => ({ said: sofar.length }), random, 0.9, 2400)
  beats.push(...answer.beats)
  t = answer.end + leadMs(plainOf(ANSWER)) + 300
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
        <h1 data-thesis="line" aria-label={THESIS} className={`${HEADLINE_XL} max-w-[18ch]`}>
          <span aria-hidden>{THESIS.slice(0, s.typed)}</span>
          {play && !show.done && <span aria-hidden className={`mf-caret ${typing ? 'mf-caret-typing' : 'mf-caret-gone'}`} />}
          <span aria-hidden className="invisible">{THESIS.slice(s.typed)}</span>
        </h1>
        <ul className="flex flex-col gap-[clamp(0.25rem,1vh,0.5rem)]">
          {THREE.map(([name, gap], i) => (
            <motion.li key={name} data-thesis={`gap-${i}`} className="text-[clamp(1.125rem,min(2.1vw,3vh),1.5rem)] leading-snug text-(--mf-wl-body)" {...come(s.gaps > i)}>
              <span className="font-semibold text-foreground">{name}</span> {gap}
            </motion.li>
          ))}
        </ul>
        <motion.p data-thesis="question" className="text-[clamp(1.125rem,min(2.1vw,3vh),1.5rem)] leading-snug font-medium text-foreground" {...come(s.asked)}>
          {QUESTION}
        </motion.p>
        <motion.p data-thesis="answer" aria-label={plainOf(ANSWER)} className="font-heading text-[clamp(1.375rem,min(2.8vw,4vh),2.25rem)] leading-tight text-foreground" {...come(s.answer)}>
          <TypedAnswer said={ANSWER} upTo={s.said} />
        </motion.p>
        <motion.p data-thesis="book" className="max-w-[44ch] text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.3125rem)] leading-snug text-(--mf-wl-body)" {...come(s.book)}>
          {BOOK}
        </motion.p>
      </div>
    </div>
  )
}

// --- 1 You ------------------------------------------------------------------------

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
      <div className="relative flex min-h-0 flex-1 flex-col justify-center overflow-y-auto pb-2">
        {paid
          ? <Payoff setup={setup} onChange={onChange} onBack={() => (chime('page'), setPaid(false))} still={still} fresh={fresh} />
          : <YouPage setup={setup} onChange={onChange} still={still} />}
      </div>
    </>
  )
}

/** A line for what you said Vigil is for, under a chapter's words: why this part matters to you, the words that say it *marked* to shine. */
const FOR_YOU: Partial<Record<NonNullable<Setup['use']>, Partial<Record<'catch' | 'write' | 'day', string>>>> = {
  study: { day: 'For study: this is how you *revise well before the exam*.' },
  work: { catch: 'For work: write a task with its day, and *it is on your list for that day*.' },
  writing: { write: 'For writing: your drafts live here, *next to the reading they came from*.' },
  life: { catch: 'For everyday life: a recipe, a plan, a line from a film; *one key, and it is kept*.' }
}
function ForYou({ setup, at }: { setup?: Setup; at: 'catch' | 'write' | 'day' }): React.JSX.Element | null {
  const said = setup?.use ? FOR_YOU[setup.use]?.[at] : undefined
  return said ? <span data-for-you aria-label={plainOf(said)} className="mt-1 block font-medium text-foreground">{parts(said).map((part, i) => (part.key ? <Shine key={i}>{part.text}</Shine> : <span key={i}>{part.text}</span>))}</span> : null
}

/** The words that carry a line's point: the accent with a light passing over it now and then (main.css, .mf-sheen). */
function Shine({ children, done = false }: { children: ReactNode; done?: boolean }): React.JSX.Element {
  return <span className="mf-sheen font-semibold" data-done={done || undefined}>{children}</span>
}

// --- 1 Catch ------------------------------------------------------------------------

/** What Catch catches, in order: a thought first, the todo last. */
const CAUGHT: Kind[] = ['quote', 'word', 'todo']

type CatchState = { docked: boolean; keys: boolean; down: number[]; box: Box | null; filled: Kind[]; close: boolean; kinds: boolean; aha: Kind | 'keys' | null }

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
  // Timed in real milliseconds (played at pace 1). The keys come only once the words over them are read,
  // say they are for later, press once and open the box: up about a second, so nobody waits on them thinking it is their turn.
  const beats: Beat<CatchState>[] = [
    { at: 0, to: {} },
    { at: 50, to: { docked: true, keys: true, aha: 'keys' }, cue: cue('scene') },
    { at: 750, to: { down: [0] }, cue: cue('tap') },
    { at: 820, to: { down: [0, 1] }, cue: cue('tap') },
    { at: 920, to: { down: [] } },
    { at: 1020, to: { keys: false, box: EMPTY_BOX }, cue: cue('open') }
  ]
  let t = 1300
  // Each one, a beat at a time: typed in, never more than 2.4s; a moment more to
  // read it; what Vigil read lifts out, with a line saying what that does for
  // you; the chip turns to its kind and holds; Create; and the words shrink into their slot.
  const catchOne = (item: Kind, whole: string, at: (sofar: string) => Partial<Box>, sorted: Partial<Box> | null, kind: Box['kind'], filled: Kind[], sortCue: () => void, cap: number): void => {
    const run = typed<CatchState>(whole, t + 250, (sofar) => ({ box: { ...EMPTY_BOX, item, typing: true, ...at(sofar) } }), random, 0.85, cap)
    // The line before goes as this one starts (the keys' line stays on under the first: it is not about an example).
    beats.push({ at: t, to: { box: { ...EMPTY_BOX, item, typing: true }, ...(item === 'quote' ? {} : { aha: null }) } }, ...run.beats)
    const first = { ...EMPTY_BOX, item, ...at(whole) }
    const then = { ...first, ...sorted }
    // Read as it was typed: a short hold, then Vigil sorts it and, beside it, says what that did.
    // The first waits, too, until the keys' line over it has been read.
    const read = Math.max(run.end + 600, item === 'quote' ? 50 + readMs((AHA.keys ?? ['', '']).join(' ')) + 700 : 0)
    beats.push({ at: read, to: { box: then, aha: item }, cue: sortCue })
    const flip = read + (item === 'word' ? 0 : 620)
    beats.push({ at: flip, to: { box: { ...then, kind } }, cue: cue('shift') })
    // Create once the chip has turned and its line is read; the line stays while the words fly to their slot,
    // and goes as the next one starts, never under someone else's example.
    const sent = read + Math.max(readMs((AHA[item] ?? ['', '']).join(' ')) + 300, flip - read + 900)
    beats.push({ at: sent, to: { box: { ...then, kind, press: true } }, cue: () => (click('tick'), chime('send')) })
    beats.push({ at: sent + 60, to: { box: { ...EMPTY_BOX }, filled } })
    t = sent + 750
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
  beats.push({ at: t + 300, to: { kinds: true, aha: null }, cue: cue('open') })
  // The kinds stay up, read while Next waits: only their rows' fade-in is waited for.
  beats.push({ at: t + 300 + 1000, to: {} })
  // In time order: a line's going is set before the typing it overlaps.
  return beats.sort((one, two) => one.at - two.at)
}

/** What Vigil just did with each thing caught, said under the box as it does it: a bold lead-in, then why it helps. */
const AHA: Partial<Record<Kind | 'keys', [string, string]>> = {
  // The keys, said to be for later: watching now, pressing them is for any time after the welcome.
  keys: ['Just watch.', 'Later, these keys open it from any app.'],
  quote: ['Kept with its source.', 'The name after it is who said it.'],
  word: ['Kept to learn.', 'Its meaning is filled in.'],
  todo: ['Read as a date.', `On your list for ${dayjs().add(2, 'day').format('dddd')}.`]
}
/** Catch's line: what writing it down does for you, in plain words first, then what the box does that others do not. */
const CATCH_SAID = 'Writing a thought down lets your mind let go of it, which psychologists call cognitive offloading.'
const CATCH_BOX = 'opens quick capture over any app, and it'
const CATCH_SHINE = 'reads what you type'


/** The kinds, each with what it does: the welcome's own words for them. */
const WHAT: Record<string, string> = {
  note: 'Anything else, kept as you wrote it',
  todo: 'Goes to your tasks, on the day it names',
  quote: 'Someone’s words, signed with who said them',
  word: 'A word to learn, its meaning filled in for you',
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
      <p className="px-2 pt-1 pb-2 text-[0.9375rem] font-medium text-foreground">{counted(kinds.length)} kinds. Vigil guesses which, and you can always change it.</p>
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

/** What Vigil just did, or what the keys are for, under the box: a bold lead-in, then why it helps. */
function AhaLine({ aha, enter = false }: { aha: CatchState['aha']; /** Fades in as it mounts (under the keys); under the box it carries on as it was. */ enter?: boolean }): React.JSX.Element {
  return (
    <div aria-live="polite" className="flex min-h-[2.4em] items-center pt-3 text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.3125rem)] leading-snug">
      <AnimatePresence mode="wait" initial={enter}>
        {aha && AHA[aha] && (
          <motion.p key={aha} data-aha={aha} className="text-balance text-foreground" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15, ease: MOVE } }} transition={{ duration: 0.25, ease: ENTER }}>
            <strong className="font-semibold">{AHA[aha]![0]}</strong> {AHA[aha]![1]}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

function CatchChapter({ play, report, state, onState, setup, turn, mine }: { play: boolean; report: (now: Reel) => void; state: Onboarding | null; onState: (now: Onboarding) => void; setup?: Setup; turn: Turn; mine: CaptureMeta | null }): React.JSX.Element {
  useKeyChanges()
  const [beats] = useState(catchBeats)
  // The keys come once the long line over them is read, and a breath more: nothing moves on the stage while it is.
  const show = useScript<CatchState>({ docked: false, keys: false, down: [], box: null, filled: [], close: false, kinds: false, aha: null }, beats, play, 1, leadMs(`Catch it before it goes. ${CATCH_SAID} ⌘ . ${CATCH_BOX} ${CATCH_SHINE}. Use a different key`) + 600)
  useReport(report, show.done, show.settle, show.part)
  const s = show.state
  const [choosing, setChoosing] = useState(false)
  const scene = useRef<HTMLDivElement>(null)
  const filled = s.filled
  const keys = keyFor('⌘.') || '⌘.'
  const caps = capsOf(keys)
  const down = new Set(s.down)
  const box = <InlineKeys keys={keys} />
  const send = <InlineKeys keys={keyFor('⌘↵') || '⌘↵'} />
  const first = (mine?.label.split('\n')[0] ?? '').slice(0, 40)
  const said: Record<Turn, ReactNode> = {
    idle: <Action>Your turn: press {box} and write anything</Action>,
    open: <Action>Now write something, and press {send} to save it</Action>,
    away: <Action>Press {box} to bring quick capture back</Action>,
    kept: <>Saved{first ? ` “${first}”` : ''}. It is in {mine?.kind === 'todo' ? 'your tasks' : 'your Inbox'}.</>
  }
  return (
    <>
      <Words title="Catch it before it goes." still={!play} done={show.done}>
        {state?.boxTaken || choosing ? (
          <KeyPicker taken={!!state?.boxTaken} onState={onState} />
        ) : (
          <>
            {CATCH_SAID} <InlineKeys keys={keys} /> {CATCH_BOX} <Shine done={show.done}>{CATCH_SHINE}</Shine>.{' '}
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
        {/* Under the keys, what they are for: later, not now. The same line stays under the box when it opens. */}
        {s.keys && s.aha === 'keys' && <AhaLine aha="keys" enter={play} />}
        {s.box && (
          <div data-frame="box" className="relative w-[min(46rem,100%)] shrink-0">
            {/* The box steps back while the kinds are shown in its place. */}
            <motion.div className={s.kinds ? 'absolute inset-x-0 top-0' : ''} initial={false} animate={{ opacity: s.kinds ? 0 : 1, scale: s.kinds ? 0.97 : 1 }} transition={{ duration: 0.25, ease: MOVE }}>
              <Stage box={s.box} />
              {/* What Vigil just did with it, and why it helps: right under the box, there only while its example is. */}
              <AhaLine aha={s.aha} />
            </motion.div>
            {/* In the box's place, in the page's flow: it takes the room it needs, nothing sits under it. */}
            <AnimatePresence>{s.kinds && <KindList key="kinds" still={!play} />}</AnimatePresence>
          </div>
        )}
        {(s.box || filled.length > 0) && <div className="relative z-10 flex shrink-0"><Slots filled={filled} kinds={CAUGHT} /></div>}
        {/* Your turn, once it has all played: in the real box, with nothing to pick (the box guesses the kind). */}
        <AnimatePresence>
          {show.done && (
            <motion.div key={turn} role="status" data-turn={turn} className="relative z-10 shrink-0 text-[clamp(1rem,min(2vw,2.9vh),1.375rem)] leading-snug text-foreground"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={{ duration: 0.25, ease: ENTER }}>
              {said[turn]}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}

// --- 2 Write ------------------------------------------------------------------------

type WriteState = NoteShot & { docked: boolean; page: boolean; step: Power | null; hand: string | null; down: boolean }
type Power = 'slash' | 'pic'

/** What each part shows, said right under the page as it happens: one plain line, read before the page moves. */
const SAID_WRITE: Record<Power, string> = {
  slash: `/ opens every kind of block: ${['headings', 'math', 'tables'].filter((word) => SLASH_SAID.includes(word)).join(', ')} and more.`,
  pic: 'Every picture has its own bar, with “Caption” to write a line under it.'
}
// A line picked out of a note and made a gem is shown once, next, in The flow (welcome-flow.tsx).
const WRITE_LINE = 'Long notes live here too, beside everything you caught.'

/**
 * A reading note on how Florence learned perspective (a table of painters,
 * Perugino's Delivery of the Keys as its picture, a line of Leonardo's), there at rest while the words over
 * it are read; then three of its powers, one at a time, each said under the
 * page first and shown once that line has been read: the block menu, walked
 * from top to bottom, then a callout; a picture's own bar and its caption.
 * Real milliseconds.
 */
function writeBeats(): Beat<WriteState>[] {
  const random = seeded(31)
  const beats: Beat<WriteState>[] = [{ at: 0, to: {} }]
  // / : its line first; then the real block menu, ↓ held to walk it, "cal", and a callout.
  let t = 100
  beats.push({ at: t, to: { step: 'slash' } })
  // Each step's line stays up while its part plays: the part starts once the line is skimmed, not read word by word.
  t += leadMs(SAID_WRITE.slash)
  beats.push({ at: t, to: { focus: 'slash', slash: '/', row: 0 }, cue: cue('open') })
  const rows = SLASH.length
  for (let i = 1; i < rows; i++) beats.push({ at: t + 500 + i * 105, to: { row: i }, cue: i % 3 ? undefined : () => click('soft') })
  t += 500 + rows * 105 + 400
  beats.push({ at: t, to: { slash: '/c' }, cue: () => click('soft') }, { at: t + 110, to: { slash: '/ca' }, cue: () => click('soft') }, { at: t + 220, to: { slash: '/cal' }, cue: () => click('soft') })
  beats.push({ at: t + 800, to: { slash: '', callout: true }, cue: () => click('tick') })
  // The picture: its line first, the page still; then its bar, “Caption” pressed, and the caption typed.
  t += 1400
  beats.push({ at: t, to: { step: 'pic', focus: 'pic', pic: true }, cue: cue('stick') })
  t += leadMs(SAID_WRITE.pic)
  beats.push({ at: t, to: { tools: true } })
  beats.push({ at: t + 300, to: { hand: 'caption' } })
  beats.push({ at: t + 900, to: { down: true }, cue: () => click('tick') })
  beats.push({ at: t + 980, to: { down: false } })
  const caption = typed<WriteState>(CAPTION, t + 1100, (sofar) => ({ caption: sofar }), random, 0.6, 1400)
  beats.push(...caption.beats)
  beats.push({ at: caption.end + 600, to: { tools: false, hand: null } })
  // The caption stays on the page: it is read while Next waits.
  beats.push({ at: caption.end + 600 + 500, to: {} })
  return beats
}

function WriteChapter({ play, report, setup }: { play: boolean; report: (now: Reel) => void; setup?: Setup }): React.JSX.Element {
  const [beats] = useState(writeBeats)
  const show = useScript<WriteState>({ ...NOTE_START, table: TABLE.length, docked: true, page: true, step: null, hand: null, down: false }, beats, play, 1, leadMs(`Write it out at length. ${WRITE_LINE}`))
  useReport(report, show.done, show.settle, show.part)
  const s = show.state
  const scene = useRef<HTMLDivElement>(null)
  const step: Power | null = show.done ? 'pic' : s.step
  return (
    <>
      <Words title="Write it out at length." still={!play} done={show.done}>{WRITE_LINE}<ForYou setup={setup} at="write" /></Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 flex-col justify-center gap-[clamp(0.5rem,1.6vh,0.875rem)] pb-2">
        <LongNote shot={s} gems={false} />
        {/* What the page is showing now, right under it: one line at a time. */}
        <div aria-live="polite" className="relative h-[3.4em] w-full max-w-[60rem] text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.3125rem)] leading-snug">
          <AnimatePresence mode="wait" initial={false}>
            {step && (
              <motion.div key={step} data-write-step={step} className="absolute inset-x-0 top-0 flex flex-col gap-0.5"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15, ease: MOVE } }} transition={{ duration: 0.25, ease: ENTER }}>
                <p className="flex items-center gap-2 font-medium text-foreground">
                  {step === 'slash' ? <><Kbd className={STEP_KEY}>/</Kbd>{SAID_WRITE.slash.slice(2)}</> : SAID_WRITE[step]}
                </p>
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
  beats.push({ at: t + 800, to: {} })
  return beats
}

/**
 * How a passing thought becomes an essay's work: a spark, caught, written
 * out, two lines picked out, and one becomes a task and one a gem, each
 * moment said under where it happens (welcome-flow.tsx).
 */
function FlowChapter({ play, report }: { play: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const [beats] = useState(flowBeats)
  // A touch quicker than written (0.8): every line stays up as the next comes, so none is lost.
  const show = useScript<FlowState>({ docked: false, said: 0, shown: 0, lit: 0, last: false }, beats, play, 0.8, leadMs('How a thought grows. The path most notes take, often without anyone noticing.'))
  useReport(report, show.done, show.settle, show.part)
  const s = show.state
  return (
    <>
      <Words title="How a thought grows." docked={s.docked} still={!play} done={show.done}>
        The path most notes take, often without anyone noticing.
      </Words>
      <div className="relative flex min-h-0 flex-1 flex-col pb-2">
        {s.docked && <FlowTree shot={s} quiet={!play} />}
      </div>
    </>
  )
}

// --- 3 A day with Vigil -------------------------------------------------------------

type DayState = { seen: boolean; look: number; answered: number; typed: number; card: boolean; signed: boolean; ticked: boolean; over: boolean; hand: string | null; down: boolean }

/** An answer's words with the ones that carry the point marked *so*: as parts, each said plain or stood out. */
const parts = (said: string): { text: string; key: boolean }[] => said.split('*').map((text, i) => ({ text, key: i % 2 === 1 })).filter((one) => one.text)
const plainOf = (said: string): string => said.replace(/\*/g, '')

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

/**
 * An ordinary day, in three moments, each a problem struck through and then
 * what Vigil does about it, typed in with its key words shining, the camera
 * moving from one to the next across the day. Timed in real milliseconds,
 * each moment up at least as long as its words take to read (225 words a
 * minute, and a second to find them). A press goes on to the next moment,
 * never past one unseen. Each says something no other chapter does: the
 * year-on postcard, the sticky on the desktop, and the one place Review is
 * named.
 */
function dayBeats(): Beat<DayState>[] {
  const random = seeded(23)
  // Nothing of the day shows until the words over it are read (the lead waits on beat 1).
  const beats: Beat<DayState>[] = [{ at: 0, to: { look: 0 } }, { at: 10, to: { seen: true } }]
  let t = 10
  // When the moment's answer was typed in whole: the camera moves on no sooner than it has been read.
  let typedAt = 0
  const readBy = (i: number): number => typedAt + readMs(plainOf(MOMENTS[i][2])) + 300
  // Each moment: the camera arrives; its problem is read, then struck; its answer typed and read; then the picture plays.
  const said = (i: number): number => {
    const [, problem, answer] = MOMENTS[i]
    // The problem stays up, struck through, while its answer is typed: it is skimmed before it is struck.
    const at = t + 650 + leadMs(problem) + 500
    beats.push({ at, to: { answered: i + 1, typed: 0 }, cue: cue('tag') })
    const run = typed<DayState>(plainOf(answer), at + 400, (sofar) => ({ typed: sofar.length }), random, 0.8, 1800)
    beats.push(...run.beats)
    // The answer stays up while its picture plays: the picture starts once it is skimmed.
    typedAt = run.end
    return run.end + 1200
  }
  // Morning: a line kept a year ago comes back on Home, as a postcard, and signs itself.
  let d = said(0)
  beats.push({ at: d, to: { card: true }, cue: cue('memory') })
  beats.push({ at: d + 900, to: { signed: true } })
  // Lunchtime: the day's tasks, already on the desktop; one ticked off right there.
  t = Math.max(d + 3200, readBy(0))
  beats.push({ at: t, to: { look: 1 }, stop: true })
  d = said(1)
  beats.push({ at: d + 200, to: { hand: 'tick' } })
  beats.push({ at: d + 800, to: { ticked: true, down: true }, cue: cue('done') })
  beats.push({ at: d + 900, to: { down: false, hand: null } })
  // Evening: Review asks, just before you would forget.
  t = Math.max(d + 1700, readBy(1))
  beats.push({ at: t, to: { look: 3 }, stop: true })
  d = said(2)
  beats.push({ at: d + 300, to: { over: true }, cue: () => fold() })
  // The evening stays up: it is looked at while Next waits.
  beats.push({ at: d + 1300, to: {} })
  return beats.sort((one, two) => one.at - two.at)
}

/** The day's moments: when, as a timestamp (never a bare "Morning." that reads like a greeting), the problem, and what Vigil does about it, its key words *marked*. */
const MOMENTS: [string, string, string][] = [
  ['Tue 8:40', 'You saved it, then never saw it again.', 'A year on, it *comes back on Home*, like a postcard from yourself.'],
  ['Tue 13:15', 'Your task list is in an app you forget to open.', 'Today’s tasks sit *on your desktop as a sticky note*. Tick them off right there.'],
  ['Tue 21:30', 'You read it, and a week later it is gone.', 'What you saved while reading *comes back as questions* in Review. No separate flashcard app.']
]
/** What Next goes on to, in words rather than a timestamp. */
const NEXT_MOMENT = ['lunchtime', 'evening']
const DAY_LINE = 'Here is a normal day, once you have saved a few things.'
const DAY_TITLE = 'What a day with Vigil looks like.'

function DayScene({ play, report }: { play: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const [beats] = useState(dayBeats)
  const show = useScript<DayState>({ seen: false, look: 0, answered: 0, typed: 0, card: false, signed: false, ticked: false, over: false, hand: null, down: false }, beats, play, 1, leadMs(`${DAY_TITLE} ${DAY_LINE}`))
  // A press goes on to the next moment of the day; on the last, it settles it.
  const s = show.state
  // Which moment is up, and the one a press goes on to: named on Next, so it is clear more of the day is coming.
  const moment = [0, 1, 3].indexOf(s.look)
  // Back goes to the moment before, whole, as it was left; from the first moment, to the page before.
  report({ done: show.done, settle: show.onward, part: show.part, less: show.back, waiting: show.waiting, label: moment >= 0 && moment < MOMENTS.length - 1 ? `Next: ${NEXT_MOMENT[moment]}` : undefined })
  const scene = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const shot = frameOn(world.current, `moment-${s.look}`, 1)
  // Shown once the camera knows where the first moment is (the world is measured after the first paint).
  const [framed, setFramed] = useState(false)
  useEffect(() => void requestAnimationFrame(() => setFramed(true)), [])
  // In the grid's corners, morning to evening down the diagonal: the camera moves once each time.
  const at = [0, 1, 3]
  const look = at.indexOf(s.look)
  return (
    <motion.div ref={scene} className="absolute inset-0" initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: ENTER }}>
      <Camera shot={shot} cut={!framed || s.look === 0} className="absolute -top-1/2 -left-1/2 h-[200%] w-[200%]">
        <div ref={world} className="relative grid size-full grid-cols-2 grid-rows-2">
          {[0, 1, 2, 3].map((cell) => {
            const i = at.indexOf(cell)
            if (i < 0) return <div key={cell} />
            const [hour, problem, answer] = MOMENTS[i]
            const typedTo = show.done || s.answered > i + 1 ? Infinity : s.answered === i + 1 ? s.typed : 0
            return (
              // Only the moment in view is shown: the others wait unseen, so nothing slides past the window's edge as the camera moves.
              <div key={cell} data-frame={`moment-${cell}`} className="min-h-0 min-w-0 transition-opacity ease-(--mf-ease)"
                style={{ opacity: framed && (s.seen || show.done) && look === i ? 1 : 0, transitionDuration: look === i ? '300ms' : '150ms', transitionDelay: look === i && i > 0 ? '550ms' : '0ms' }}>
                <Moment hour={hour} problem={problem} answer={<span data-answer aria-label={plainOf(answer)}><TypedAnswer said={answer} upTo={typedTo} /></span>} answered={s.answered > i || show.done}>
                  {i === 0 && (
                    // The postcard a year on, floating in as it does on Home; nothing in its place until it comes.
                    <motion.div className="w-full max-w-[22rem]" initial={false}
                      animate={{ opacity: s.card ? 1 : 0, y: s.card ? 0 : 12, rotate: s.card ? -2.5 : 0 }} transition={play ? { type: 'spring', duration: 0.7, bounce: 0.15 } : { duration: 0 }}>
                      {s.card && <PostcardResult id="day-postcard" words={QUOTE.text} who={QUOTE.who!} where={QUOTE.where} signed={s.signed} />}
                    </motion.div>
                  )}
                  {/* Set down as the camera turns to it, so it is already there when the moment shows. */}
                  {i === 1 && <DeskSticky on={s.look >= 1 || show.done} ticked={s.ticked} />}
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

/** Where the book lives, said as it is (main/backup.ts): one database on this Mac, no account, and a daily copy in your own iCloud Drive when the Mac has one. Nothing else sends your notes anywhere. Said on the last page. */
const WHERE_SAID = 'max-w-[44ch] text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.375rem)] leading-snug text-balance text-(--mf-wl-body)'
const WHERE_TRUE = 'It all stays on this Mac, with no account. A copy goes to your own iCloud Drive each day, if you use it.'

/** A day with Vigil: three moments of an ordinary day. (Which tools it stands in for is said once, on Why.) */
function DayChapter({ play, report, setup }: { play: boolean; report: (now: Reel) => void; setup?: Setup }): React.JSX.Element {
  const [done, setDone] = useState(false)
  // The day waits at its end, and the page says so.
  const relay = (now: Reel): void => {
    report(now)
    // Held at an earlier moment's end, its words are as whole as at the day's end.
    const whole = now.done || !!now.waiting
    if (whole !== done) queueMicrotask(() => setDone(whole))
  }
  return (
    <>
      <Words title={DAY_TITLE} still={!play} done={done}>
        {DAY_LINE}
        <ForYou setup={setup} at="day" />
      </Words>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <DayScene play={play} report={relay} />
      </div>
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
  { at: 5200, to: {} }
]

const DIAL_LINE = 'Pick how your pages look. You can change it any time in Settings.'
/** The note behind the dial when you have not written one yet: a line anyone might keep, from no book shown before. */
const DIAL_NOTE = 'Rain on the train window, and everyone quiet.'

function DialChapter({ play, report, onPick, mine }: { play: boolean; report: (now: Reel) => void; onPick: (theme: Theme) => void; mine: CaptureMeta | null }): React.JSX.Element {
  const [say, setSay] = useState<string | undefined>()
  const show = useScript<DialState>({ docked: false, dial: true, ticks: 0 }, DIAL_BEATS, play, PACE, leadMs(`Make it yours. ${DIAL_LINE}`))
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
        {DIAL_LINE}
      </Words>
      <div className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        {/* Pages to judge a theme on, behind the dial, wearing each theme as it passes: your own first note
            when you wrote one, and a Review question. Nothing shown earlier in the welcome comes back here. */}
        {s.dial && (
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
        )}
        {s.dial && (
          <motion.div className="relative z-10" initial={play ? { opacity: 0, scale: 0.95 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: ENTER }}>
            {/* Its own layer in the crossfade, shown live: the ring and its light never stop while the page changes. */}
            <div className="[view-transition-name:mf-theme-dial]">
              <ThemeDial calm size={size} big wear={fadeTo} onPick={(theme) => void (show.done && (yours.current = true, setTurned(true), onPick(theme)))} onFullTurn={() => (setSay(FULL_TURN), setTimeout(() => setSay(undefined), 1800))} say={say} />
            </div>
            {show.done && !turned && <Action className="relative z-20 mt-1 text-center">Your turn: turn the dial</Action>}
          </motion.div>
        )}
      </div>
    </>
  )
}

// --- the parts kept from before -------------------------------------------------

/** The moment the welcome opened, as a diary dates an entry: the day, then the hour in your Mac's own style. */
const dateline = (): string => `${dayjs().format('dddd D MMMM')}, ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`

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
/** A key named in the Write chapter's step line. */
const STEP_KEY = 'h-[1.35em] min-w-[1.35em] rounded-[0.3em] px-[0.35em] font-sans text-[0.7em] text-foreground'
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
 * The end: a decision already made for you, with two quieter ways round it.
 * Your book is ready and Start opens it; the sandbox and your old notes are
 * a line of small links (2 and 3 on the keys). Nothing else asks for a
 * choice on the way out. The
 * arrow at the top of the window points at Vigil in the menu bar, so the
 * words do not have to.
 */
function Start({ name, kept, skipped, importing, still, onPick, setup, onImport }: { name: string; kept: number; skipped: false | 'first' | 'later'; importing: boolean; still: boolean; onPick: (pick: 1 | 2 | 3) => void; setup: Setup; onImport: (what: 'vault' | 'files') => void }): React.JSX.Element {
  const others: { key: 2 | 3; title: string }[] = [
    { key: 2, title: 'Try it with example notes first' },
    // Named for the app you said you came from, when Vigil can bring things in from it.
    { key: 3, title: sourceFrom(setup.from) && sourceFrom(setup.from) !== 'Other files' ? `Bring my notes from ${sourceFrom(setup.from)}` : 'Bring my notes' }
  ]
  const link = 'group flex items-center gap-2 rounded-[0.6rem] px-3 py-1.5 -mx-3 text-foreground transition-colors hover:bg-foreground/[0.06] active:scale-[0.98]'
  return (
    <div className="my-auto mr-auto flex w-full max-w-[58rem] flex-col gap-[clamp(1rem,4vh,2.5rem)] overflow-y-auto">
      <div className="flex flex-col gap-[clamp(0.5rem,1.8vh,1rem)]">
        <h1 className={`${HEADLINE_XL} max-w-[14ch]`}><Rise text={name ? `Your commonplace book is ready, ${name}.` : 'Your commonplace book is ready.'} still={still} /></h1>
        <p className={`${BODY} max-w-[30ch]`}>{kept ? <>{counted(kept)} {kept === 1 ? 'thing' : 'things'} in it already. <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> adds the next, from any app.</> : <>Press <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> from any app to save your first thing.</>}</p>
        {setup.made?.goalId && setup.made.goalTitle && setup.made.goalBy && (
          <p data-start-goal className={`${WHERE_SAID} max-w-[48ch]`}><span className="font-medium text-foreground">“{setup.made.goalTitle}”</span> is on your Goals page, {dayjs(setup.made.goalBy).diff(dayjs().startOf('day'), 'day')} days to go.</p>
        )}
        <p data-start-where className={WHERE_SAID}>{WHERE_TRUE}</p>
        {skipped && <p role="status" className={`${QUIET} max-w-[48ch]`}>The welcome waits in the Vigil menu and ⌘K.</p>}
      </div>
      {importing && <ImportMap start={sourceFrom(setup.from)} onImport={onImport} still={still} />}
      <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 ${QUIET}`}>
        <span className="-mr-3">Or</span>
        {others.map((row) => (
          <button key={row.key} type="button" onClick={() => onPick(row.key)} className={link}>
            {row.title}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Whether the welcome is on screen, for what should keep quiet under it. */
export const welcoming = (): boolean => document.documentElement.hasAttribute('data-welcoming')
export { inClay }
