import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { ArrowUp, Check, CornerDownLeft } from 'lucide-react'
import { EASE, byKeys, hush, spring, speak } from '@/lib/motion'
import { chime, click, fold } from '@/lib/sound'
import { applyTheme, currentTheme, type Theme } from '@/lib/theme'
import { comboOf, fixed, keyFor, listen, saveKeys, useKeyChanges } from '@/lib/keys'
import { onboarding, type Onboarding } from '@/lib/onboarding'
import { enterSandbox } from '@/lib/sandbox'
import { STARTERS, fillBox, holdKeys, tellBox } from '@/lib/welcome-box'
import keycapsUrl from '@/assets/welcome/keycaps.webp'
import type { CaptureMeta } from '@/components/capture-list'
import { dayjs } from '../../../../main/dates'
import { Scenery } from './scenery'
import { NOISE } from './grain'
import { ThemeDial } from './theme-dial'
import { RecapRadar } from './recap-radar'
import { Kbd, toast } from './ui'
import { FULL_TURN, glyph, inClay, konami } from './welcome-eggs'
import {
  CAM, Chip, EMPTY_BOX, GhostHand, KINDS, LAND, MiniMap, PostcardResult, QUOTE, Rise, Slots, Stage, TaskResult, CardResult, WORD,
  cue, guess, seeded, starterOf, typed, useScript, type Beat, type Box, type Kind
} from './welcome-reel'

/**
 * The welcome, the first time Vigil opens (and again from the Vigil menu, ⌘K
 * or Settings): a short film in six chapters, each first shown, then handed
 * to you. One stage the whole way through, so nothing cuts: the box, what
 * comes out of it, the map those things join and the year they make are the
 * same objects moving on (shared layoutIds, welcome-reel.tsx).
 *
 *   0 hello: today's date and hour, a line typed, and the year as a ruler
 *   1 Catch: the key goes down, the box opens, and a ghost writes three
 *     things of three kinds into it; each is caught into a slot
 *   2 Become: each thing turns into what its kind does (a task row, next
 *     year's postcard, a Review card); then your turn, in the real box
 *   3 Connect: the three join a map of a year's notes
 *   4 Return: a year read back
 *   5 Make it yours: the theme dial
 *   6 Ready: fresh, the sandbox, or your notes
 *
 * Any key or click while a chapter plays settles it at its end; the next
 * press moves on. Esc settles, then goes to the last page. Motion off or
 * Reduce motion: every chapter arrives settled, with fades only.
 */

const CHAPTERS = ['Catch', 'Become', 'Connect', 'Return', 'Make it yours', 'Ready']
const CATCH = 1
const BECOME = 2
const CONNECT = 3
const RETURN = 4
const DIAL = 5
const LAST = 6
const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
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
type Reel = { done: boolean; settle: () => void }
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
        // Esc puts the box away if it is up, settles a chapter that is playing,
        // and otherwise goes back a step. Skipping the welcome is a button only.
        if (turn === 'open') window.api.hidePrompt()
        else if (performance.now() - awayAt.current < 1000) undefined
        else if (settled()) back()
      } else if (event.key === 'Enter') primary()
      else if (event.key === 'ArrowRight' || event.key === ' ') {
        if (at !== LAST) next()
      } else if (event.key === 'ArrowLeft') back()
      else if (at === LAST && /^[123]$/.test(event.key)) start(Number(event.key) as 1 | 2 | 3)
      else if (at === BECOME && reel.current.done && /^[123]$/.test(event.key)) choose(KINDS[Number(event.key) - 1])
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
      <Backdrop plain={at === LAST} />
      <div className="relative h-11 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
      {at === LAST && <TrayArrow tray={state?.tray ?? null} />}
      <div className="relative mx-auto flex min-h-0 w-full max-w-[84rem] flex-1 flex-col">
        <main className="relative min-h-0 flex-1">
          <AnimatePresence initial={false}>
            <motion.section key={at}
              className="absolute inset-0 flex flex-col px-[clamp(1.5rem,5vw,4rem)] pt-2"
              exit={{ opacity: 0, filter: 'blur(2px)', transition: spring.slow.exit }}
              // A click on the picture while it plays: its end, as a key does.
              onPointerDown={(event) => void (!(event.target as HTMLElement).closest('button, a, [role="slider"]') && !reel.current.done && settled())}>
              {at === 0 && <Hello replay={replay} kept={kept} calm={!play} newcomer={newcomer} today={earlier + caught.length} />}
              {at === CATCH && <CatchChapter play={play} report={report} state={state} onState={setState} />}
              {at === BECOME && <BecomeChapter play={play} report={report} pick={pick} onPick={choose} turn={turn} mine={mine} onBox={openBox} />}
              {at === CONNECT && <ConnectChapter play={play} report={report} />}
              {at === RETURN && <ReturnChapter play={play} report={report} kept={kept} newcomer={newcomer} today={earlier + caught.length} />}
              {at === DIAL && <DialChapter play={play} report={report} onPick={(theme) => (picked.current = theme)} />}
              {at === LAST && <Start name={name} kept={caught.length} skipped={skipped} importing={importing} still={!play} onPick={start} onFiles={() => (leave('notes'), void window.api.importFrom('files'))} />}
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
          {(at === LAST || !caught.length) && (
            <button type="button" onClick={skip} className={`flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center gap-2 rounded-[0.6rem] px-3 text-[clamp(0.8125rem,1.8vmin,1rem)] transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97] ${sure ? 'text-foreground' : 'text-(--mf-wl-quiet)'}`}>
              {at === LAST ? 'Close' : sure ? 'Skip to the end? Click again' : 'Skip the welcome'}
            </button>
          )}
          {at === BECOME && turn !== 'kept' && (
            <button type="button" onClick={next} className="flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center gap-2 rounded-[0.6rem] px-3 text-[clamp(0.8125rem,1.8vmin,1rem)] text-foreground transition-colors hover:bg-foreground/[0.06] active:scale-[0.97]">
              Not now <Kbd>→</Kbd>
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
function Words({ title, docked, still, done, children }: { title: string; docked: boolean; still: boolean; done: boolean; children?: ReactNode }): React.JSX.Element {
  return (
    <div data-reel={done ? 'done' : 'playing'} className="relative z-10 flex max-w-[52rem] shrink-0 flex-col gap-[clamp(0.375rem,1.2vh,0.75rem)] pb-[clamp(0.5rem,2vh,1.25rem)]">
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
    </div>
  )
}

/** Tells the welcome how far the chapter has got, every render. */
function useReport(report: (now: Reel) => void, done: boolean, settle: () => void): void {
  report({ done, settle })
}

// --- 1 Catch ------------------------------------------------------------------------

type CatchState = { docked: boolean; keys: boolean; down: number[]; box: Box | null; filled: Kind[]; hand: string | null; press: boolean }

/** The ghost's three things, written into the box one after another, each caught into a slot. */
function catchBeats(): Beat<CatchState>[] {
  const random = seeded(7)
  const beats: Beat<CatchState>[] = [
    { at: 0, to: {}, cue: cue('scene') },
    { at: 1300, to: { docked: true, keys: true } },
    { at: 1750, to: { down: [0] }, cue: cue('tap') },
    { at: 1900, to: { down: [0, 1] }, cue: cue('tap') },
    { at: 2060, to: { down: [] } },
    { at: 2250, to: { keys: false, box: EMPTY_BOX }, cue: cue('open') }
  ]
  let t = 2600
  // Each letter, and a pulse of sound when the chip changes its guess.
  const write = (base: Box, text: string, field: 'text' | 'who' | 'where', quick = 1): Box => {
    let was = guess(base.text)
    const run = typed<CatchState>(text, t, (sofar) => ({ box: { ...base, at: field, [field]: field === 'text' ? base.text + sofar : sofar } }), random, quick)
    for (const beat of run.beats) {
      const now = guess(beat.to.box!.text)
      if (now !== was) {
        const tick = beat.cue
        beat.cue = () => (tick?.(), chime('shift'))
        was = now
      }
      beats.push(beat)
    }
    t = run.end
    return { ...base, at: field, [field]: field === 'text' ? base.text + text : text }
  }
  // Create, pressed by the ghost; the line folds into its slot.
  const send = (box: Box, filled: Kind[]): void => {
    beats.push({ at: t + 260, to: { hand: 'create' } })
    beats.push({ at: t + 900, to: { press: true, box: { ...box, press: true } }, cue: () => (click('tick'), chime('send')) })
    beats.push({ at: t + 1000, to: { press: false, box: EMPTY_BOX, filled, hand: null } })
    t += 1350
  }
  let box = write({ ...EMPTY_BOX, item: 'todo' }, starterOf('todo').text, 'text')
  send(box, ['todo'])
  // The quote, pasted whole, then who said it and where it is from.
  box = { ...EMPTY_BOX, item: 'quote', text: QUOTE.text, pasted: 1 }
  beats.push({ at: t, to: { box }, cue: () => click('tick') })
  beats.push({ at: t + 160, to: {}, cue: cue('shift') })
  t += 650
  box = write(box, QUOTE.who!, 'who', 0.7)
  t += 300
  box = write(box, QUOTE.where!, 'where', 0.7)
  send(box, ['todo', 'quote'])
  // The word, and what it means on the line under it.
  box = write({ ...EMPTY_BOX, item: 'word' }, WORD.term, 'text')
  t += 380
  beats.push({ at: t, to: { box: { ...box, text: `${box.text}\n` } } })
  box = write({ ...box, text: `${box.text}\n` }, WORD.meaning, 'text', 0.38)
  t += 300
  box = write(box, starterOf('word').where!, 'where', 0.7)
  send(box, ['todo', 'quote', 'word'])
  beats.push({ at: t - 300, to: {}, cue: cue('settled') })
  beats.push({ at: t + 500, to: { box: { ...EMPTY_BOX, at: 'text' } } })
  return beats
}

function CatchChapter({ play, report, state, onState }: { play: boolean; report: (now: Reel) => void; state: Onboarding | null; onState: (now: Onboarding) => void }): React.JSX.Element {
  useKeyChanges()
  const [beats] = useState(catchBeats)
  const show = useScript<CatchState>({ docked: false, keys: false, down: [], box: null, filled: [], hand: null, press: false }, beats, play)
  useReport(report, show.done, show.settle)
  const s = show.state
  const scene = useRef<HTMLDivElement>(null)
  const [choosing, setChoosing] = useState(false)
  const keys = keyFor('⌘.') || '⌘.'
  const caps = capsOf(keys)
  const down = new Set(s.down)
  return (
    <>
      <Words title="Catch it before it goes." docked={s.docked} still={!play} done={show.done}>
        {state?.boxTaken || choosing ? (
          <KeyPicker taken={!!state?.boxTaken} onState={onState} />
        ) : (
          <>
            <InlineKeys keys={keys} /> opens this box over any app. Write the thought, and Vigil works out what kind of thing it is.{' '}
            <button type="button" onClick={() => (chime('tap'), setChoosing(true))} className={`${QUIET} rounded-sm underline decoration-current/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current/60`}>
              Use a different key
            </button>
          </>
        )}
      </Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.75rem,3vh,1.75rem)] pb-2">
        {s.keys && (
          <motion.div layoutId="reel-box" transition={CAM} className="flex items-end gap-2" initial={play ? { opacity: 0, filter: 'blur(4px)' } : false} animate={{ opacity: 1, filter: 'blur(0px)' }}>
            {keys === '⌘.'
              ? <KeycapPicture down={down} width={300} />
              : caps.map((cap, i) => <Keycap key={`${cap}${i}`} label={glyph(cap, i === caps.length - 1)} down={down.has(i)} size={88} />)}
          </motion.div>
        )}
        {s.box && <Stage box={s.box} quiet={!play || show.done} />}
        {(s.box || s.filled.length > 0) && <Slots filled={s.filled} quiet={!play} />}
        {play && !show.done && <GhostHand to={s.hand} down={s.press} root={scene} />}
      </div>
    </>
  )
}

// --- 2 Become -----------------------------------------------------------------------

type BecomeState = { docked: boolean; cards: Kind[]; landed: boolean; signed: boolean; over: boolean; hand: string | null; down: boolean }

const BECOME_BEATS: Beat<BecomeState>[] = [
  { at: 0, to: {} },
  { at: 1300, to: { docked: true }, cue: cue('slide') },
  { at: 1900, to: { cards: ['todo'] }, cue: cue('noted') },
  { at: 3200, to: { cards: ['todo', 'quote'] }, cue: cue('riffle') },
  { at: 3800, to: { landed: true }, cue: () => (click('tick'), chime('memory')) },
  { at: 4100, to: { signed: true } },
  { at: 5400, to: { cards: ['todo', 'quote', 'word'] }, cue: cue('reveal') },
  { at: 6300, to: { hand: 'card' } },
  { at: 6950, to: { down: true }, cue: () => click('tick') },
  { at: 7020, to: { down: false, over: true }, cue: () => fold() },
  { at: 7900, to: { hand: null } },
  { at: 8700, to: {} }
]

/** What each kind does, in a line under it. */
function Caption({ kind }: { kind: Kind }): React.JSX.Element {
  const now = dayjs()
  if (kind === 'todo') return <>In your tasks, and in Today on the day.</>
  if (kind === 'quote') return <>A year from today, on <span className="whitespace-nowrap text-foreground">{now.format('D MMMM')} <RollingYear from={now.year()} /></span>, it comes back to you like this.</>
  return <>Review asks you, further apart each time, until it sticks.</>
}

/** The three things as what they became, side by side; a chip until its turn comes. */
function Results({ cards, landed, signed, over, onTurn, pick, onPick, kept, quiet, captions }: {
  cards: Kind[]; landed: boolean; signed: boolean; over: boolean; onTurn: (over: boolean) => void; quiet: boolean
  pick?: Kind | null; onPick?: (kind: Kind) => void; kept?: boolean; captions: boolean
}): React.JSX.Element {
  return (
    <div className="grid w-full max-w-[64rem] grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-[clamp(1rem,2.5vw,2rem)]">
      {KINDS.map((kind, i) => {
        const card = cards.includes(kind)
        const chosen = pick === kind
        const live = !!onPick
        return (
          <div key={kind} className="flex min-w-0 flex-col items-center gap-3">
            <div onClick={live ? () => onPick(kind) : undefined} data-ghost={kind === 'word' ? 'card' : undefined}
              className={`relative w-full rounded-2xl p-1.5 transition-[box-shadow,background-color] duration-200 ${live ? 'cursor-pointer hover:bg-foreground/[0.03]' : ''} ${chosen ? 'shadow-[0_0_0_2px_var(--primary)]' : 'shadow-[0_0_0_2px_transparent]'}`}>
              {!card ? (
                <div className="flex justify-center py-6"><Chip kind={kind} quiet={quiet} /></div>
              ) : kind === 'todo' ? (
                <TaskResult line={starterOf('todo').text} />
              ) : kind === 'quote' ? (
                <PostcardResult words={QUOTE.text} who={QUOTE.who!} where={QUOTE.where} landed={landed} signed={signed} />
              ) : (
                <CardResult term={WORD.term} meaning={WORD.meaning} over={over} onTurn={onTurn} />
              )}
              {chosen && kept && (
                <motion.span className="absolute -top-2.5 -right-2.5 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={LAND}>
                  <Check className="size-4" strokeWidth={2.6} />
                </motion.span>
              )}
            </div>
            {captions && (
              <motion.p className="flex max-w-[22rem] items-center justify-center gap-2 text-center text-[clamp(0.8125rem,min(1.5vw,2.2vh),1rem)] leading-snug text-(--mf-wl-quiet)"
                initial={false} animate={{ opacity: card ? 1 : 0 }} transition={{ duration: 0.3, ease: EASE, delay: card && !quiet ? 0.35 : 0 }}>
                {live && <Kbd className="shrink-0">{i + 1}</Kbd>}
                <span><Caption kind={kind} /></span>
              </motion.p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function BecomeChapter({ play, report, pick, onPick, turn, mine, onBox }: { play: boolean; report: (now: Reel) => void; pick: Kind; onPick: (kind: Kind) => void; turn: Turn; mine: CaptureMeta | null; onBox: () => void }): React.JSX.Element {
  useKeyChanges()
  const show = useScript<BecomeState>({ docked: false, cards: [], landed: false, signed: false, over: false, hand: null, down: false }, BECOME_BEATS, play)
  useReport(report, show.done, show.settle)
  const s = show.state
  const scene = useRef<HTMLDivElement>(null)
  // Once played, the card turns by hand.
  const [over, setOver] = useState<boolean | null>(null)
  const box = <InlineKeys keys={keyFor('⌘.') || '⌘.'} />
  const send = <InlineKeys keys={keyFor('⌘↵') || '⌘↵'} />
  const said: Record<Turn, ReactNode> = {
    idle: <>Your turn. Pick one, and press {box} to open the box with it written in. Then {send} keeps it.</>,
    open: <>It is in the box. Press {send} there to keep it.</>,
    away: <>The box is put away, with your words still in it. Press {box} to bring it back.</>,
    kept: <>Kept{mine && mine.kind !== pick ? `: “${(mine.label.split('\n')[0] ?? '').slice(0, 40)}”` : ''}. It is yours now, in your Inbox.</>
  }
  return (
    <>
      <Words title="Then it becomes something." docked={s.docked} still={!play} done={show.done}>
        Each kind goes where it will be of use to you.
      </Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.75rem,3vh,1.75rem)] pb-2">
        <Results cards={s.cards} landed={s.landed} signed={s.signed} over={over ?? s.over} quiet={!play} captions={s.docked}
          onTurn={(to) => (show.done ? (chime('tap'), setOver(to)) : undefined)}
          pick={show.done ? pick : null} onPick={show.done ? onPick : undefined} kept={turn === 'kept'} />
        <AnimatePresence>
          {show.done && (
            <motion.div key="turn" className="flex items-center gap-[clamp(1rem,2.5vw,2rem)]" initial={{ opacity: 0, filter: 'blur(2px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={{ duration: 0.25, ease: EASE }}>
              {turn !== 'kept' && <PressMe onBox={onBox} open={turn === 'open'} />}
              <motion.p role="status" key={turn} className="max-w-[40ch] text-[clamp(1rem,min(2vw,2.9vh),1.375rem)] leading-snug text-pretty text-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                {said[turn]}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
        {play && !show.done && <GhostHand to={s.hand} down={s.down} root={scene} />}
      </div>
    </>
  )
}

/**
 * The one key, drawn as the real keys, pressing as yours go down and when the
 * box opens from anywhere. A click on it opens the box too.
 */
function PressMe({ onBox, open }: { onBox: () => void; open: boolean }): React.JSX.Element {
  useKeyChanges()
  const keys = keyFor('⌘.') || '⌘.'
  const caps = capsOf(keys)
  const [down, setDown] = useState<Set<number>>(new Set())
  useEffect(() => {
    const press = (event: KeyboardEvent, on: boolean): void => caps.forEach((cap, i) => {
      if (!(MODS[cap] ? event.key === MODS[cap] : comboOf(event)?.endsWith(cap))) return
      setDown((was) => {
        const next = new Set(was)
        if (on) next.add(i)
        else next.delete(i)
        return next
      })
    })
    const onDown = (event: KeyboardEvent): void => press(event, true)
    const onUp = (event: KeyboardEvent): void => press(event, false)
    const onBlur = (): void => void setTimeout(() => setDown(new Set()), 160)
    const offShown = window.api.onBoxShown(() => {
      setDown(new Set(caps.map((_, i) => i)))
      setTimeout(() => setDown(new Set()), 150)
    })
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => (offShown(), window.removeEventListener('keydown', onDown), window.removeEventListener('keyup', onUp), window.removeEventListener('blur', onBlur))
  }, [keys]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button type="button" onClick={onBox} aria-label="Open the box" className={`shrink-0 rounded-[0.9rem] p-1 transition-shadow duration-300 ${open ? 'shadow-[0_0_0_1.5px_var(--primary)]' : 'shadow-[0_0_0_1.5px_transparent] hover:shadow-[0_0_0_1.5px_color-mix(in_oklab,var(--foreground)_20%,transparent)]'}`}>
      {keys === '⌘.'
        ? <KeycapPicture down={down} width={150} />
        : <span className="flex items-end gap-1">{caps.map((cap, i) => <Keycap key={`${cap}${i}`} label={glyph(cap, i === caps.length - 1)} down={down.has(i)} size={44} />)}</span>}
    </button>
  )
}

// --- 3 Connect ----------------------------------------------------------------------

type ConnectState = { docked: boolean; dots: boolean; map: boolean; lit: string | null; hand: string | null }

const CONNECT_BEATS: Beat<ConnectState>[] = [
  { at: 0, to: {} },
  { at: 1200, to: { docked: true, dots: true }, cue: () => fold() },
  { at: 1550, to: { map: true }, cue: cue('scene') },
  { at: 2600, to: { hand: 'dot-quote' } },
  { at: 3250, to: { lit: 'quote' }, cue: cue('search') },
  { at: 4500, to: { hand: null } },
  { at: 5400, to: {} }
]

function ConnectChapter({ play, report }: { play: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const show = useScript<ConnectState>({ docked: false, dots: false, map: false, lit: null, hand: null }, CONNECT_BEATS, play)
  useReport(report, show.done, show.settle)
  const s = show.state
  const scene = useRef<HTMLDivElement>(null)
  const [lit, setLit] = useState<string | null | undefined>(undefined)
  return (
    <>
      <Words title="And it finds its friends." docked={s.docked} still={!play} done={show.done}>
        Notes that share a book, a person or an idea link up on their own. {show.done ? 'Your turn: point at a dot.' : ''}
      </Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 flex-col items-center justify-center pb-2">
        {!s.dots ? (
          <Results cards={KINDS} landed signed over quiet={!play} captions={false} onTurn={() => undefined} />
        ) : (
          <MiniMap shown={s.map} lit={show.done && lit !== undefined ? lit : s.lit} quiet={!play} onLight={(id) => show.done && (id !== lit && id && click('soft'), setLit(id))} />
        )}
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
  { at: 2650, to: { lines: 2 } },
  { at: 3100, to: { lines: 3 } },
  { at: 3550, to: { lines: 4 } },
  { at: 5000, to: {} }
]

/** An example year: what Your year, wrapped finds out about its reader. */
const FOUND: [string, string][] = [
  ['You kept the most from Frankenstein.', '11 lines, more than from any other book'],
  ['You think best on Sunday evenings.', 'a third of all you caught, around 9pm'],
  ['You kept circling one question.', '“Who is the monster?” Four clues, then an answer'],
  ['You remembered 86%.', 'of what came back to you, on 112 different days']
]
const YEAR = [{ kind: 'note', n: 142 }, { kind: 'todo', n: 96 }, { kind: 'quote', n: 64 }, { kind: 'word', n: 41 }, { kind: 'link', n: 52 }]
const YEAR_BEFORE = { label: 'The year before', kinds: [{ kind: 'note', n: 80 }, { kind: 'todo', n: 120 }, { kind: 'quote', n: 18 }, { kind: 'word', n: 9 }, { kind: 'link', n: 44 }] }

function ReturnChapter({ play, report, kept, newcomer, today }: { play: boolean; report: (now: Reel) => void; kept: Set<string>; newcomer: boolean; today: number }): React.JSX.Element {
  const show = useScript<ReturnState>({ docked: false, radar: false, lines: 0 }, RETURN_BEATS, play)
  useReport(report, show.done, show.settle)
  const s = show.state
  return (
    <>
      <Words title="And it all comes back to you." docked={s.docked} still={!play} done={show.done}>
        Your year starts today. Once a year, Vigil reads it back to you, like this.
      </Words>
      <div className="w-full shrink-0 pb-[clamp(0.5rem,2vh,1.25rem)] [@media(max-height:560px)]:hidden">
        <YearRule calm={!play} kept={kept} faded newcomer={newcomer} today={today} />
      </div>
      <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-x-[clamp(1.5rem,5vw,5rem)] pb-2">
        <div className="flex min-h-0 justify-center [&_svg]:max-h-[min(20rem,34vh)]">
          {s.radar && (
            <motion.div className="w-full max-w-[24rem]" initial={play ? { opacity: 0, scale: 0.94 } : false} animate={{ opacity: 1, scale: 1 }} transition={LAND}>
              <RecapRadar kinds={YEAR} before={YEAR_BEFORE} />
            </motion.div>
          )}
        </div>
        <ol aria-label="An example year, read back" className="flex flex-col gap-[clamp(0.75rem,2.6vh,1.5rem)]">
          {FOUND.map(([said, how], i) => (
            <motion.li key={said} initial={false} animate={{ opacity: i < s.lines ? 1 : 0, transform: i < s.lines ? 'translateY(0px)' : 'translateY(8px)' }} transition={{ duration: 0.4, ease: EASE }}>
              <p className="font-heading text-[clamp(1.125rem,min(2.3vw,3.3vh),1.75rem)] leading-tight text-foreground">{said}</p>
              <p className="mt-0.5 text-[clamp(0.8125rem,min(1.5vw,2.2vh),1rem)] text-(--mf-wl-quiet)">{how}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </>
  )
}

// --- 5 Make it yours ----------------------------------------------------------------

type DialState = { docked: boolean; dial: boolean; hand: string | null }

/**
 * The dial turns itself on first sight (theme-dial.tsx): a theme, another,
 * and back. The ghost's hand rests on it while it does. Settled, the dial is
 * set down calm on the theme it started on.
 */
const DIAL_BEATS: Beat<DialState>[] = [
  { at: 0, to: {} },
  { at: 900, to: { docked: true, dial: true }, cue: cue('slide') },
  { at: 2600, to: { hand: 'dial' } },
  { at: 6700, to: { hand: null } },
  { at: 7300, to: {} }
]

function DialChapter({ play, report, onPick }: { play: boolean; report: (now: Reel) => void; onPick: (theme: Theme) => void }): React.JSX.Element {
  const [say, setSay] = useState<string | undefined>()
  const [start] = useState(currentTheme)
  const [calm, setCalm] = useState(!play)
  const show = useScript<DialState>({ docked: false, dial: false, hand: null }, DIAL_BEATS, play)
  const settle = (): void => {
    show.settle()
    if (calm) return
    applyTheme(start, false)
    onPick(start)
    setCalm(true)
  }
  useReport(report, show.done, settle)
  const s = show.state
  const scene = useRef<HTMLDivElement>(null)
  const win = useWindowSize()
  const size = Math.round(Math.max(150, Math.min(win.height * 0.42, win.width * 0.3, 360)))
  return (
    <>
      <Words title="Make it yours." docked={s.docked} still={!play} done={show.done}>
        {show.done
          ? <>Your turn: turn it with <span className="inline-flex translate-y-[-0.08em] gap-[0.12em] align-middle"><Kbd className={LINE_KEY}>↑</Kbd><Kbd className={LINE_KEY}>↓</Kbd></span>, the wheel or a drag. Settings has it later.</>
          : <>The page you will write on. The window wears each one as it passes.</>}
      </Words>
      <div ref={scene} className="relative flex min-h-0 flex-1 items-center justify-center pb-2">
        {s.dial && (
          <motion.div data-ghost="dial" initial={play ? { opacity: 0, scale: 0.96, filter: 'blur(4px)' } : false} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={CAM}>
            <ThemeDial key={String(calm)} calm={calm} size={size} big onPick={onPick} onFullTurn={() => (setSay(FULL_TURN), setTimeout(() => setSay(undefined), 1800))} say={say} />
          </motion.div>
        )}
        {play && !show.done && <GhostHand to={s.hand} down={false} root={scene} />}
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
        <p className={`${BODY} max-w-[28ch]`}>Vigil keeps it for you, one key away, and brings it back.</p>
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
function Start({ name, kept, skipped, importing, still, onPick, onFiles }: { name: string; kept: number; skipped: false | 'first' | 'later'; importing: boolean; still: boolean; onPick: (pick: 1 | 2 | 3) => void; onFiles: () => void }): React.JSX.Element {
  const others: { key: 2 | 3; title: string }[] = [
    { key: 2, title: 'Try the sandbox first' },
    { key: 3, title: 'Bring my notes' }
  ]
  const link = 'group flex items-center gap-2 rounded-[0.6rem] px-3 py-1.5 -mx-3 text-foreground transition-colors hover:bg-foreground/[0.06] active:scale-[0.98]'
  return (
    <div className="my-auto mr-auto flex w-full max-w-[58rem] flex-col gap-[clamp(1rem,4.5vh,3rem)] overflow-y-auto">
      <div className="flex flex-col gap-[clamp(0.5rem,1.8vh,1rem)]">
        <h1 className={`${HEADLINE_XL} max-w-[14ch]`}><Rise text={name ? `Your book is ready, ${name}.` : 'Your book is ready.'} still={still} /></h1>
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
    </div>
  )
}

/** Whether the welcome is on screen, for what should keep quiet under it. */
export const welcoming = (): boolean => document.documentElement.hasAttribute('data-welcoming')
export { inClay }
