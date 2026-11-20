import { inSidebar } from './places'
import { WelcomeLeaves } from './welcome-leaves'
import { WelcomeTitle } from './welcome-title'
import { SCENE, WelcomeScene, type ScenePlace } from './welcome-scene'
import { haligtree, unloaded, useLive, type Item } from '@/lib/haligtree'
import { WelcomeStamp } from './welcome-marks'
import { Condense, DRAG_MS, REACH_MS, WelcomePointer, type Move } from './welcome-pointer'
import { TAGLINE } from '../../../../main/tagline'
import { fittedTitle, quoted } from '../../../../main/clip'
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion, useIsPresent } from 'motion/react'
import { ArrowUp, Compass, CornerDownLeft, FolderInput, Shuffle, Undo2, Volume2, VolumeX } from 'lucide-react'
import { ReaderCard, drawBookName, seedOf } from './reader-card'
import { renameBook, useShelf } from '@/lib/books'
import { useFitPicture, useFitText } from '@/lib/fit-text'
import { shift, spring, still, still as calm } from '@/lib/motion'
import { sayName, ARRIVE_MS, BEAT_MS, PENTA, soundOn, ambience, bedHome, bedLift, bedResolve, bedShift, bell, chime, click, fold, pageTurn, quietBed, titleChime } from '@/lib/sound'
import { applyTheme, currentTheme, type Theme } from '@/lib/theme'
import { comboOf, fixed, keyFor, listen, saveKeys, useKeyChanges } from '@/lib/keys'
import { NO_SETUP, onboarding, type Onboarding, type Setup } from '@/lib/onboarding'
import { ImportMap, sourceFrom } from './welcome-import'
import { FIELD, answered, applySetup, Payoff, YouPage } from './welcome-you'
import { enterSandbox, SANDBOX, sandboxState, type Carry } from '@/lib/sandbox'
import { examples, fillBox, holdKeys, STORY_DAY, tellBox } from '@/lib/welcome-box'
import { pickStory, story } from '@/lib/welcome-stories'
import type { CaptureMeta } from '@/components/capture-list'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { dayjs } from '../../../../main/dates'
import { clock, when } from '@/lib/clock'
import { readTask } from '../../../../main/task-words'
import { NOISE } from './grain'
import { ThemeDial, turnDial } from './theme-dial'
import { Kbd, toast } from './ui'
import { FULL_TURN, glyph, inClay, konami } from './welcome-eggs'
import { WelcomeBackdrop, type Family } from './welcome-backdrop'
import { Grainient, INTRO_DELAY, INTRO_SECONDS, SPARK_HOLD, type GrainientHandle } from '@/components/ui/grainient'
import { BACK_END, BACK_START, ComeBack, type BackShot } from './welcome-day'
import { CURSOR_MS, FLOW_START, flowEnd, flowParts, flowWords, FlowTree, PICKS, type FlowShot, type Pick } from './welcome-flow'
import {
  CAM, ENTER, MOVE, leadMs, EMPTY_BOX, LAND, quoteNow, Rise, Caught, Stage,
  cue, seeded, starterOf, typed, useScript, type Beat, type Box, type Kind, type Part
} from './welcome-reel'
import { APP_NAME } from '../../../../main/name'

/**
 * The welcome, the first time Haligtree opens (and again from the Haligtree menu, ⌘K
 * or Settings): a short film that follows one thought, a question about old
 * movies had on a walk, from being caught to coming back. Each chapter opens
 * on what the one before left on the stage, and moves it on. Each idea is
 * said in one place only.
 *
 *   1 Why: the case in one screen, the day dated as a diary dates an entry
 *   2 You: four optional questions, and what Haligtree did with the answers
 *   3 Catch: the key goes down, the box opens; the thought, a line from the
 *     film (its source read) and a plan to see it again (its day read) are
 *     caught; the kinds there are; then your turn
 *   4 Write: the thought becomes a long note; a line of it a task, another a
 *     gem kept as it is, and the last a gem with a question
 *   5 Remember: the task on the desktop, the plain gem in the Feed and the
 *     other's question in Review, the quote a year on as a postcard
 *   6 Make it yours: the theme dial
 *   7 Name it: your book's name, on its reader card
 *   8 Ready: start, the sandbox, or your notes
 *
 * Any key or click while a chapter plays settles it at its end; the next
 * press moves on. Esc settles a chapter, and never goes back a page. Motion off or
 * Reduce motion: every chapter arrives settled, with fades only.
 */

// Why first: the whole idea in one screen, so someone who stops there still has it.
const CHAPTERS = ['Why', 'You', 'Catch', 'Write', 'Remember', 'Make it yours', 'Name it', 'Ready']
const WHY = 1
const YOU = 2
const CATCH = 3
const WRITE = 4
const BACK = 5
const DIAL = 6
const NAME = 7
const LAST = 8
const EASE = ENTER
/** The name a book has until it is given one (main/books.ts, DEFAULT_NAME). */
const DEFAULT_BOOK = 'My book'
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

/** What was typed into Haligtree since the welcome opened, oldest first. */
const since = (list: CaptureMeta[], before: Set<string>): CaptureMeta[] =>
  list.filter((one) => !before.has(one.id) && !one.source).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))

/** A count in words, as a sentence says it. */
const counted = (n: number): string => ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][n] ?? String(n)

// Held back in the main window while the welcome runs, ahead of the app's own keys; said in the footer.
// ⌘[ and ⌘], the app's own Back and Forward, are the welcome's Back and Next while it runs.
holdKeys(() => document.documentElement.hasAttribute('data-welcoming'), false, (event) =>
  window.dispatchEvent(event.metaKey && !event.shiftKey && (event.key === '[' || event.key === ']') ? new CustomEvent('haligtree:welcome-step', { detail: event.key === '[' ? -1 : 1 }) : new CustomEvent('haligtree:held')))

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

/**
 * A chapter's page, as a page of one book: going on, it lifts from its spine
 * on the left and slides off as it turns (the right edge coming up toward
 * you), while the next settles in a moment later from a little to the right;
 * going back, the other way. Under 900ms in all, and under reduced motion only
 * the fade is left (MotionConfig).
 */
const PAGE = {
  enter: (way: number) => ({ opacity: 0, transform: `perspective(1800px) translateX(${way * 2.5}%) rotateY(0deg)` }),
  // The page in front fades out first (its words gone in 0.22s, while it keeps turning away) and the next comes in only
  // then: overlapping, the two pages' words showed through each other for a moment, going back most of all.
  rest: { opacity: 1, transform: 'perspective(1800px) translateX(0%) rotateY(0deg)', transition: { duration: 0.45, ease: ENTER, delay: 0.22 } },
  leave: (way: number) => ({ opacity: 0, transform: `perspective(1800px) translateX(${way * -4}%) rotateY(${way * -16}deg)`, transition: { duration: 0.5, ease: MOVE, opacity: { duration: 0.22, ease: 'easeOut' } } }),
  gone: { opacity: 0, transition: { duration: 0 } }
}

/**
 * The welcome's easter egg, all through it: wherever the word "Haligtree" is written (a headline, a line, a card),
 * the pointer turns to a hand over it, and a click says the name aloud and lights the word for a moment. Found by
 * the word under the pointer, so no line has to be written differently for it; never inside a field or a button,
 * which keep their own clicks. The title card's own wordmark has its bounce too (welcome-title.tsx).
 */
const NAME_LIT = 'mf-name-said'
function nameAt(x: number, y: number): Range | null {
  const at = document.caretRangeFromPoint?.(x, y)
  const node = at?.startContainer
  if (!at || !node || node.nodeType !== Node.TEXT_NODE) return null
  const host = node.parentElement
  if (!host || host.closest('button, a, input, textarea, [contenteditable="true"], [data-title-name]')) return null
  const text = node.textContent ?? ''
  for (const found of text.matchAll(/Haligtree/g)) {
    if (at.startOffset < found.index || at.startOffset > found.index + found[0].length) continue
    const word = document.createRange()
    word.setStart(node, found.index)
    word.setEnd(node, found.index + found[0].length)
    // The pointer really over the word's letters, not only nearest to them.
    if (![...word.getClientRects()].some((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)) return null
    return word
  }
  return null
}
function useNameEgg(root: React.RefObject<HTMLElement | null>, shown: boolean): void {
  useEffect(() => {
    const el = root.current
    if (!el) return
    let over = false
    let frame = 0
    const move = (event: PointerEvent): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const now = !!nameAt(event.clientX, event.clientY)
        if (now !== over) (over = now), el.style.setProperty('cursor', now ? 'pointer' : '')
      })
    }
    const down = (event: PointerEvent): void => {
      const word = event.button === 0 ? nameAt(event.clientX, event.clientY) : null
      if (!word) return
      // Its own: never also the page's "settle" or "skip" that a click elsewhere on the page means.
      event.stopPropagation()
      event.preventDefault()
      sayName()
      const lit = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
      const Highlight = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
      if (lit && Highlight) {
        lit.set(NAME_LIT, new Highlight(word))
        window.setTimeout(() => lit.delete(NAME_LIT), 900)
      }
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerdown', down, true)
    return () => void (cancelAnimationFrame(frame), el.removeEventListener('pointermove', move), el.removeEventListener('pointerdown', down, true), el.style.removeProperty('cursor'))
  }, [root, shown])
}

export function Welcome(): React.JSX.Element | null {
  const [at, setAt] = useState(-1)
  // Whether the page reads light (dark words): its gold is chosen by what is on screen, not by the theme's dark class.
  // Read only while the welcome is open: it is mounted in Home always, and reading the words' colour forces a style pass.
  const lightPage = useLightTheme(at >= 0)
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
  const picked = useRef<Theme | null>(null)
  const veteran = useRef(false)
  // Your turn, at the end of Catch: how far it has got, and the one you kept.
  const [turn, setTurn] = useState<Turn>('idle')
  const [mine, setMine] = useState<CaptureMeta | null>(null)
  // A key held back (lib main: heldInWelcome), said for a moment.
  const [held, setHeld] = useState(false)
  const quiet = still()
  // The arrival: a mist over everything that lifts, a sound swelling in, and the first words only once it has thinned.
  const [mist, setMist] = useState(false)
  const [veiled, setVeiled] = useState(false)
  // Each arrival played, counted: the gradient blooms afresh from the page's colour for each one. The title's words
  // wait for its bloom to be whole (the paper's mist has none to wait for).
  const [arrival, setArrival] = useState(0)
  const [bloomed, setBloomed] = useState(false)
  // Which way the last page turned: on (1) or back (-1).
  const [turning, setTurning] = useState(1)
  const veilTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Esc or a click during the arrival: the mist goes at once and the first page shows whole; the sound carries on.
  const [rushed, setRushed] = useState(false)
  // Into your own book: the welcome's page turns over onto the app's Home, under it already, which comes up as the paper goes.
  const [closing, setClosing] = useState(false)
  // The first welcome's ending, once in a lifetime: your book's name, written on the page, carried down into the
  // sidebar where it lives from now on, as the paper goes and the music comes home (Finale).
  const [finale, setFinale] = useState<string | null>(null)
  const book = useShelf()
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // The Sounds setting, for the arrival's own sound button.
  const [loud, setLoud] = useState(true)
  // The arrival as a scene over the whole screen (welcome-scene.tsx, main: makeScene): where it plays, its clock once
  // started, and whether this window is in its place under the fog yet. Until then nothing of the welcome shows here:
  // played again, the app stays as it was while the fog comes over it.
  const [scened, setScened] = useState<{ place: ScenePlace; t0: number; covered: boolean } | null>(null)
  // The page has come in over the scene in this window: the scene is let go.
  const [swept, setSwept] = useState(false)
  const plate = useRef<HTMLDivElement>(null)
  const sweep = useRef<Animation | null>(null)
  // The welcome over: this window grows to the app's own size (main: growAfterWelcome) before the app comes up in it.
  const [grown, setGrown] = useState(false)
  // Grown, and the app under it laid out and drawn once: the paper may go now.
  const [bare, setBare] = useState(false)
  // The first welcome's name has risen on the paper (Finale): the app may be laid out under it now.
  const [risen, setRisen] = useState(false)
  const finaleName = useRef<string | null>(null)
  /** The arrival's light is whole (the gradient's bloom, or out of the desktop the spark's burst in the mist): the title may come. */
  const bloom = (): void => {
    setBloomed(true)
    if (!rushed) titleChime(0.45)
  }
  const rush = (): void => {
    clearTimeout(veilTimer.current)
    // Arriving as a scene: straight to its end, the page in place over it and the words at once.
    sweep.current?.cancel()
    setSwept(true)
    setVeiled(false)
    setRushed(true)
  }
  const rushNow = useRef(rush)
  rushNow.current = rush
  // When the box last went away: an Esc a moment after is the same Esc, pressed twice out of habit.
  const awayAt = useRef(0)
  // A second press of Next within 400ms is one press, not two.
  const pressedAt = useRef(0)
  const dialog = useRef<HTMLDivElement>(null)
  // Watched once the welcome is on screen (before, there is no page to watch).
  useNameEgg(dialog, at >= 0)
  // Whether the page on screen still plays, for Next to show (Primary).
  const [cue, setCue] = useState<Cue>({ done: true, part: null })
  const cueAt = useRef<Cue>(cue)
  // The pages seen on the way here, in order: Back returns to the one before, even after a skip.
  const trail = useRef<number[]>([])
  // The answers acted on and their summary shown: going back to You shows the summary again, as it was left.
  const [paid, setPaid] = useState(false)
  // The name page's way to keep the name on screen, called by Next and Enter only.
  const nameSave = useRef<(() => void) | null>(null)
  // The goal's real card (welcome-you.tsx, applySetup puts it on the desktop): open on the page that says what was done,
  // folded into its pill at the screen's edge, as every goal's card starts, on every other page once it has been seen.
  // Only flipped as you come to that page or leave it, so a card you open or fold yourself on a later page stays as you left it.
  const goalCard = setup.made?.goalId && !(setup.undone ?? []).includes('goal') ? setup.made.goalId : null
  const goalPage = at === YOU && paid
  const goalSeen = useRef<string | null>(null)
  useEffect(() => {
    if (!goalCard) return
    if (goalPage) goalSeen.current = goalCard
    if (goalSeen.current === goalCard) window.api.deskPill(`goal:${goalCard}`, !goalPage)
  }, [goalCard, goalPage])

  const go = (to: number, backward = false): void => {
    if (to < WHY || to > LAST || performance.now() - pressedAt.current < 400) return
    pressedAt.current = performance.now()
    // A page of the book turned, heard as one.
    pageTurn(true)
    setTurning(backward ? -1 : 1)
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
    // As a scene over the whole screen where it can be (main: welcome:arrive), its window put in the middle of the
    // screen under the fog; else plainly, in this window put in the middle at once.
    // Asked whatever the motion: main puts the welcome's window in the middle either way; with Motion off it never makes a scene.
    const answer = window.api.welcomeArrive(again, still())
    const clear = answer.how === 'scene' && !!answer.place
    // A story of its own for each run of the welcome (welcome-stories.ts), kept until it opens again, so Back and Next show the same one.
    pickStory()
    void Promise.all([window.api.captures.list(), onboarding.state()]).then(([list, now]) => {
      before.current = new Set(list.map((one) => one.id))
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
    setScened(clear && answer.place ? { place: answer.place, t0: 0, covered: false } : null)
    setSwept(!clear)
    setGrown(false)
    sweep.current?.cancel()
    if (still()) chime('read')
    else {
      // The in-window arrival (its mist, spark and title card) only when there is no scene: the scene has its own.
      setMist(!clear)
      setVeiled(true)
      setRushed(false)
      setArrival((n) => n + 1)
      setBloomed(WELCOME_BACKGROUND !== 'grainient')
      clearTimeout(veilTimer.current)
      // Nothing but the mist and the chord until the arrival's beat: then the first words. A scene's music and words
      // wait for its clock instead (welcome:scene 'start').
      if (!clear) (ambience(), (veilTimer.current = setTimeout(() => setVeiled(false), ARRIVE_MS)))
      void haligtree.settings().then((now) => setLoud(now.sounds !== false))
    }
  }

  // The scene's moments, from main: its clock started, this window in its place under the fog, the intro skipped or its
  // sound switched from the scene's corner buttons, and at the end this window grown to the app's own size.
  useEffect(() => window.api.onWelcomeScene((event) => {
    if (event.what === 'start') {
      setScened((now) => now && { ...now, t0: event.t0 })
      // The music on the scene's clock (lib/sound.ts): the chord out of nothing, the bell with the name, the words on the beat.
      const lead = Math.max(0, (event.t0 - Date.now()) / 1000)
      ambience(SCENE.words, lead)
      titleChime(lead + SCENE.nameFrom / 1000)
      clearTimeout(veilTimer.current)
      veilTimer.current = setTimeout(() => setVeiled(false), Math.max(0, event.t0 + SCENE.words - Date.now()))
    } else if (event.what === 'covered') setScened((now) => now && { ...now, covered: true })
    else if (event.what === 'skip') rushNow.current()
    else if (event.what === 'sound') {
      setLoud(event.on)
      soundOn(event.on)
      if (event.on) ambience(SCENE.words)
      void haligtree.setSettings({ sounds: event.on })
    } else if (event.what === 'grown') setGrown(true)
  }), [])
  // In its place under the fog, its clock known: the page comes in over the scene from the left on the scene's beat,
  // and the scene is let go once it has.
  useEffect(() => {
    if (!scened?.covered || !scened.t0 || swept || !plate.current) return
    const delay = Math.max(0, scened.t0 + SCENE.sweepFrom - Date.now())
    const run = plate.current.animate([{ transform: 'translateX(-112%)' }, { transform: 'translateX(0)' }], { duration: SCENE.sweepTo - SCENE.sweepFrom, delay, easing: 'cubic-bezier(0.22, 0.9, 0.24, 1)', fill: 'both' })
    sweep.current = run
    run.onfinish = () => setSwept(true)
    return () => run.cancel()
  }, [scened?.covered, scened?.t0, swept]) // eslint-disable-line react-hooks/exhaustive-deps
  // Grown to the app's own size: the ground goes (the dialog's fade), the first welcome's name is carried to the sidebar,
  // and the welcome is gone once the name has landed.
  useEffect(() => {
    // The first welcome's name rises on the paper before the app is laid out under it (that first layout stalls a
    // quarter of a second: the name would come up already over Home's own lines).
    if (!closing || !grown || (finale && !risen)) return
    // The app laid out at the window's own size first (it is not drawn while covered), then the name carried to where
    // its sidebar now really is, a frame later.
    document.documentElement.removeAttribute('data-welcoming')
    // The paper fades, and the name is carried, only once the app has been laid out and drawn under it: the app's
    // first layout takes a quarter of a second, and a fade begun in that frame was cut to a jump, the page there one
    // frame and Home the next (19 Nov film, 82.2s). Two frames: the one that lays it out, then one drawn after it.
    let second = 0
    const first = requestAnimationFrame(() => (second = requestAnimationFrame(() => setBare(true))))
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(closed, quiet ? 450 : 1500)
    return () => (cancelAnimationFrame(first), cancelAnimationFrame(second))
  }, [closing, grown, risen]) // eslint-disable-line react-hooks/exhaustive-deps
  useCarriedWelcome()
  useEffect(() => {
    // Once a page: a first mount undone at once (React's StrictMode, in a dev build) leaves it to the second, so the chord plays once.
    let gone = false
    void onboarding.state().then((now) => void (!gone && now.firstRun && open(false)))
    const again = (): void => open(true)
    window.addEventListener('haligtree:welcome', again)
    window.addEventListener('haligtree:tour', again)
    return () => {
      gone = true
      window.removeEventListener('haligtree:welcome', again)
      window.removeEventListener('haligtree:tour', again)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The whole time it runs, the box is in lesson mode and the app keeps quiet under it.
  // Turning over into the book: the app under it is drawn again, to show through the paper as it goes.
  // Up once it shows (as a scene, once its window is in its place under the fog), down as it is left.
  const up = at >= 0 && !closing && (!scened || scened.covered)
  // The app under it is not drawn while it is up, nor while its window grows at the end (each step of the grow would
  // lay the app out again): only once the window is at its own size.
  const covering = at >= 0 && (up || (closing && !grown))
  useEffect(() => {
    void onboarding.set({ welcoming: up })
    if (up) tellBox(examples(), true)
  }, [up]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void document.documentElement.toggleAttribute('data-welcoming', covering), [covering])
  useEffect(() => void document.documentElement.toggleAttribute('data-scene-on', !!scened && !swept), [scened, swept])

  // The welcome's sound bed follows the pages: each turn a soft shift in the key, Name it a lift, the last page the chord come home, gone when it ends.
  useEffect(() => {
    if (at < 0) return quietBed()
    if (at === LAST) bedResolve()
    // Naming the book is the welcome's reveal: the music lifts there, then settles.
    else if (at === NAME) bedLift()
    else if (at > WHY) bedShift(at)
  }, [at])
  useEffect(() => () => quietBed(0.4), [])

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
    window.addEventListener('haligtree:held', say)
    return () => (offShown(), offAway(), offHeld(), window.removeEventListener('haligtree:held', say))
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
          // Only a capture made on Catch is your turn taken: the first thought written on You
          // (its own "In your Inbox" and sound) still leaves quick capture for you to try.
          if (shown.current === CATCH) {
            setTurn('kept')
            chime('settled')
          }
        }
        return now
      })
    }), ['capture'])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at < 0])

  const closed = (): void => (clearTimeout(closeTimer.current), setClosing(false), setGrown(false), setBare(false), setRisen(false), setFinale(null), setAt(-1))
  const leave = (how: 'fresh' | 'sandbox' | 'notes' | 'closed'): void => {
    if (closing) return
    if (picked.current) applyTheme(picked.current)
    fillBox(null)
    // The goal's card stays as the welcome left it, a pill in the stack, as every goal's card starts.
    goalSeen.current = null
    // The first welcome, going on into the book: its ending, the name carried into the sidebar and the chord come home
    // on it. Played again, skipped out of, or into the sandbox or an import: the bed simply goes, slowly.
    const ending = how === 'fresh' && !replay && !state?.welcomed && !quiet && !SANDBOX
    if (ending) bedHome()
    else quietBed()
    // Whatever was answered and not yet acted on (the welcome skipped past the summary): done now, once.
    void applySetup(setup).then((next) => onboarding.set({ setup: next })).catch(() => toast('Your answers could not be acted on just now. Set the same things any time in Settings.', undefined, 'warning'))
    void onboarding.set({ welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, ...(veteran.current && how !== 'fresh' ? { hidden: true } : {}) })
    // Into the sandbox, the welcome stays drawn (and still) under the opening
    // screen, which fades up over it: Home, about to be replaced by the restart,
    // never shows in between. It goes only if the sandbox cannot open.
    if (how === 'sandbox') setOpening(true)
    else {
      // The page's words go and its ground stays while the window grows to the app's own size (main:
      // growAfterWelcome); then the ground goes too and the app is there, as large as it will be. Reduce Motion: a calm
      // cross-fade to Home, never a cut. Not told the window has grown (main gone quiet): it comes up all the same.
      setClosing(true)
      finaleName.current = ending ? (book && book.name !== DEFAULT_BOOK ? book.name : APP_NAME) : null
      // The name comes up now, on the paper, as its words go (Finale): only carried to the sidebar once the window has
      // grown and the paper fades. Raised only then, it stood over Home's own lines, the paper already gone (19 Nov film).
      if (finaleName.current) setFinale(finaleName.current)
      closeTimer.current = setTimeout(closed, quiet ? 450 : 3200)
    }
    if (how !== 'sandbox') {
      // Said once on Home: the day the book was opened, and the first thing written in it here.
      const first = caught.length ? caught[caught.length - 1] : null
      try {
        sessionStorage.setItem('haligtree:book-opened', JSON.stringify({ on: dayjs().format('dddd D MMMM'), first: first ? String(first.label || first.title || '').slice(0, 120) : '' }))
      } catch {
        // Not kept: Home simply says nothing.
      }
      window.dispatchEvent(new CustomEvent('haligtree:book-opened'))
    }
    if (how === 'fresh') {
      chime('decided')
      // Home, unless it is hidden from the sidebar: then the Inbox, where the tour's first stop points, never a page
      // you put away (restarted from a hidden Home, the welcome ended on it).
      void inSidebar('home').then((shown) => window.api.openInHome('view', shown ? 'home' : 'inbox'))
      // Once the paper has gone and Home has said it was opened: then the tour's first stop.
      setTimeout(() => window.dispatchEvent(new CustomEvent('haligtree:tour-stops')), quiet ? 450 : 4000)
    } else if (how === 'sandbox') {
      void enterSandbox().catch(() => (setOpening(false), setAt(-1), toast('The sandbox could not open just now. It waits in ⌘K, under “Open the sandbox”.', undefined, 'warning')))
    } else if (how === 'notes') {
      chime('decided')
    } else {
      chime('away')
      toast(`The welcome is in the ${APP_NAME} menu and ⌘K whenever you want it again.`, undefined, 'info')
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
    setSkipped(at === WHY ? 'first' : 'later')
    go(LAST)
  }
  const next = (): void => {
    if (!settled()) return
    if (reel.current.more?.()) return void chime('page')
    if (at === DIAL && picked.current) applyTheme(picked.current)
    // The book's name is kept only going on from its page (Next or Enter), never by Back, the skip or closing.
    if (at === NAME) nameSave.current?.()
    go(at + 1)
  }
  // Back returns to the screen seen just before, as it was left: an earlier part of this page first, then the page before (the one skipped from, after a skip).
  const back = (): void => {
    if (reel.current.less?.()) return void chime('page')
    if (at === LAST && importing) return (chime('page'), setImporting(false))
    const to = trail.current[trail.current.length - 1] ?? at - 1
    if (at <= WHY || to < WHY) return void chime('nope')
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
    // Played in the sandbox already (tried from Settings or ⌘K): its notes are the examples.
    if (choice === 2) return leave(SANDBOX ? 'fresh' : 'sandbox')
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
      // Turning over into the book: any key there at once.
      if (closing) return void (event.preventDefault(), event.stopPropagation(), closed())
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
        else if (veiled) rush()
        else if (performance.now() - awayAt.current < 1000) undefined
        else if (!reel.current.waiting) settled()
      } else if (event.key === 'Enter' && veiled) rush()
      else if (event.key === 'Enter') primary()
      else if (event.key === 'ArrowRight' || event.key === ' ') {
        if (at !== LAST) next()
      } else if (event.key === 'ArrowLeft') back()
      // The two cards' keys, 1 and 2, as they show them: "Open my book" is ↵ (it said 2 and 3 with no 1 anywhere, 17 Nov).
      else if (at === LAST && /^[12]$/.test(event.key)) start((Number(event.key) + 1) as 2 | 3)
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
    // ⌘[ and ⌘], held back from the app (holdKeys above): Back and Next, as anywhere else in Haligtree.
    const onStep = (event: Event): void => {
      if (picking || opening) return
      if ((event as CustomEvent<number>).detail < 0) back()
      else if (at !== LAST) next()
    }
    window.addEventListener('haligtree:welcome-step', onStep)
    return () => (window.removeEventListener('keydown', onKey, true), window.removeEventListener('haligtree:welcome-step', onStep))
  })

  useEffect(() => void (at >= 0 && dialog.current?.focus({ preventScroll: true })), [at >= 0]) // eslint-disable-line react-hooks/exhaustive-deps
  if (at < 0) return null
  const play = !quiet && !played.has(at) && !(at === WHY && rushed)
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
    <motion.div ref={dialog} tabIndex={-1} role="dialog" aria-modal aria-label={`Welcome to ${APP_NAME}`} inert={opening} onKeyDown={(event) => event.stopPropagation()}
      data-closing={closing ? '' : undefined} data-story={story().id} data-dial={at === DIAL ? '' : undefined} data-page={lightPage ? 'light' : 'dark'} data-scene={scened ? (swept ? 'swept' : 'on') : undefined}
      // A click in the window while the scene holds in it: the arrival's end at once, as Esc and Enter.
      onPointerDown={(event) => void (closing ? closed() : scened && !swept && event.isTrusted && !(event.target as HTMLElement).closest('button') && rush())}
      // Leaving: the words go first (the page's parts below); the ground stays while the window grows (main:
      // growAfterWelcome), then goes too, the app there under it at its own size.
      initial={false} animate={{ opacity: closing && (bare || quiet) ? 0 : 1 }} transition={closing ? (quiet ? { duration: 0.4, ease: 'easeOut' } : { duration: 0.55, ease: MOVE }) : { duration: 0 }}
      // Played again: nothing of the welcome shows until the window is in its place under the scene's fog.
      style={scened && !scened.covered ? { visibility: 'hidden' } : undefined}
      className="mf-welcome fixed inset-0 z-[70] flex outline-none flex-col overflow-clip bg-background text-foreground [container-type:inline-size]">
      {/* The scene, as the window it has become (welcome-scene.tsx): the same frame the scene window drew last, moving on
          under the page, which comes in over it from the left (the sweep) as the first words come, and stays beside it
          for the whole welcome, cleared to the pale haze, as Dia's onboarding keeps its sky beside its panel. */}
      {scened && scened.t0 > 0 && scened.covered && (
        <WelcomeScene t0={scened.t0} place={scened.place} mode="window" name={state?.name ?? ''} />
      )}
      {/* The window's own page. After a scene it is a panel coming in from the left over the fog: solid under the words,
          thinning out to the right so the fog moves on beside them (Dia's black panel and its sky), never the old gold
          gradient over the whole window (the user: "mud on the right"). */}
      <div ref={plate} data-plate="" className={`absolute inset-0 ${scened ? '' : 'bg-background'}`}
        style={scened ? { background: SCENE_PANEL, ...(swept ? {} : { transform: 'translateX(-112%)' }) } : undefined}>
        {scened
          ? <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay" style={{ backgroundImage: NOISE, backgroundSize: '160px' }} />
          : <Backdrop family={at === WRITE ? 'ruled' : at === DIAL ? 'dots' : 'none'} page={at} arrival={arrival} arriving={mist && veiled && at === WHY} desk={false} held={false} onBloomed={bloom} />}
      </div>
      {/* The first screen's autumn leaves, blowing behind the words; Next blows them away, and a
          few small ones drift on through the rest (not over the dial, which has its own light). On the
          dial's page and the last, a slow stream of them is drawn in and sinks behind the dial's ring or
          the recommended way in, quicker and with the wind louder as the pointer nears it. */}
      {/* Not with the ember gradient: it is the movement there. */}
      {WELCOME_BACKGROUND === 'paper' && <WelcomeLeaves on={at === WHY && play} open={play} motes={at !== DIAL} middle={at === BACK ? 0 : 0.3} gather={at === LAST && !closing}
        lure={closing ? null : at === LAST ? '.mf-welcome [data-recommended]' : at === DIAL ? '.mf-welcome [role="slider"][aria-label="Theme"]' : null} />}
      {/* Before the first words: the book's title page. */}
      {/* The book is yours whether it is the first welcome or one played again: its title page always names you. */}
      {mist && veiled && at === WHY && <WelcomeTitle name={state?.name ?? ''} hurry={rushed} ready={bloomed} />}
      <div data-drag-strip="" className="relative h-11 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
      {at === LAST && <TrayArrow tray={state?.tray ?? null} />}
      {/* The chapter's thumb index on the fore-edge, moving down a place each chapter. */}
      <div className="relative z-[32] mx-auto flex min-h-0 w-full max-w-[84rem] flex-1 flex-col">
        <main className="relative min-h-0 flex-1">
          <AnimatePresence initial={false} custom={turning}>
            <motion.section key={at} custom={turning} variants={PAGE}
              className="mf-more absolute inset-0 flex origin-left flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-[clamp(1.5rem,5vw,4rem)] pt-2"
              // One book: the page lifts away from its spine as the next settles in under it (back, the other way).
              initial={play ? 'enter' : false} animate={closing ? 'leave' : 'rest'}
              // The dial's page goes at once: its ring, light and dots must never show over the next one.
              exit={at === DIAL ? 'gone' : 'leave'}
              // A click on the picture while it plays: its end, as a key does.
              onPointerDown={(event) => void (event.isTrusted && veiled ? rush() : event.isTrusted && !(event.target as HTMLElement).closest('button, a, [role="slider"]') && !reel.current.done && !reel.current.waiting && settled())}>
              {at === WHY && !veiled && <ThesisChapter play={play} report={report} />}
              {at === YOU && <YouChapter setup={setup} onChange={answer} still={!play} report={report} paid={paid} onPaid={setPaid} />}
              {at === CATCH && <CatchChapter play={play} report={report} state={state} onState={setState} setup={setup} turn={turn} mine={mine} />}
              {at === WRITE && <WriteChapter play={play} report={report} setup={setup} />}
              {at === BACK && <RememberChapter play={play} report={report} setup={setup} />}
              {at === DIAL && <DialChapter play={play} report={report} onPick={(theme) => (picked.current = theme)} mine={mine} />}
              {at === NAME && <NameChapter play={play} report={report} onNext={next} save={nameSave} />}
              {at === LAST && <WelcomeStamp still={!play} />}
              {at === LAST && <Start state={state} onState={setState} name={name} kept={before.current.size + caught.length} mine={caught.length} skipped={skipped} importing={importing} still={!play} onPick={start} setup={setup} onImport={(what) => (leave('notes'), void window.api.importFrom(what))} />}
            </motion.section>
          </AnimatePresence>
        </main>
        {/* The arrival's own two controls, in the footer's place, from its first frame: the sound, and
            the way past the intro. The footer comes up in their place once the first words have. */}
        {mist && at === WHY && (
          // With no mist to say the arrival is over, it is over once these have faded out.
          <div key={`intro-${arrival}`} data-intro="" onTransitionEnd={(event) => void (event.target === event.currentTarget && !veiled && setMist(false))} className={`pointer-events-auto absolute inset-x-0 bottom-0 z-50 flex h-[clamp(4rem,9vmin,5.5rem)] items-center px-[clamp(1.5rem,5vw,4rem)] transition-opacity duration-700 ${veiled ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            <button type="button" data-intro-sound="" aria-pressed={loud} aria-label={loud ? 'Sounds on' : 'Sounds off'} onClick={() => {
              const next = !loud
              setLoud(next)
              soundOn(next)
              if (next) ambience()
              void haligtree.setSettings({ sounds: next })
            }} className={QUIET_BUTTON}>
              {loud ? <Volume2 className="size-4" strokeWidth={1.8} /> : <VolumeX className="size-4" strokeWidth={1.8} />}
              <span>{loud ? 'Sound on' : 'Sound off'}</span>
            </button>
            <button type="button" data-skip-intro="" onClick={rush} className={`${QUIET_BUTTON} ml-auto whitespace-nowrap`}>
              Skip intro <Kbd className="h-6 min-w-6"><CornerDownLeft className="size-3" strokeWidth={2.4} /></Kbd>
            </button>
          </div>
        )}
        <footer className={`relative flex h-[clamp(4rem,9vmin,5.5rem)] shrink-0 items-center gap-3 px-[clamp(1.5rem,5vw,4rem)] transition-opacity ${closing ? 'duration-300' : 'duration-1000'} ${veiled || closing ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
          <div className="mr-auto flex min-w-0 items-center gap-[clamp(0.5rem,2vw,1.5rem)]">
            <Progress at={at} seen={played} onBack={back} />
            {/* The ways past a page sit with Back and the marks, far from the arrow, so the arrow only ever points from nothing to Next.
                Worded alike: Skip the welcome, or, on Your turn, Skip trying it. */}
            {/* Always a way out, on every page until the welcome ends, whatever was caught on the way. */}
            {!trying && (
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
          {/* Says where it goes: the highlighted card is a choice of its own (2), never what this opens. */}
          {at === LAST && <Primary onClick={() => start(1)}>Open my book</Primary>}
        </footer>
      </div>
    </motion.div>
    {finale && <Finale name={finale} carry={bare} onRisen={() => setRisen(true)} />}
    </MotionConfig>
  )
}

/**
 * The first welcome's last moment, about 1.4 seconds: the book's name, as it
 * was signed on its card, comes up in the middle of the page as the paper
 * starts to turn away, then is carried down to the sidebar's foot, shrinking
 * into the name the sidebar keeps from now on, which takes the light as it
 * lands (main.css, mf-name-landed). Over the app, never in its way: nothing
 * here takes a click or a key, and any key or click ends it at once (Welcome,
 * closing). With the sidebar folded it settles where it is and fades.
 */
function Finale({ name, carry, onRisen }: { name: string; /** The window has grown and the paper is going: carried down now. */ carry: boolean; onRisen: () => void }): React.JSX.Element {
  const risen = useRef(onRisen)
  risen.current = onRisen
  const self = useRef<HTMLParagraphElement>(null)
  // When it was let go to the sidebar, on the page's clock (read by its frames); until then it holds where it rose.
  const carried = useRef<number | null>(null)
  useEffect(() => void (carry && carried.current === null && (carried.current = performance.now())), [carry])
  useEffect(() => {
    const el = self.current
    if (!el) return
    const RISE = 350
    const TOTAL = 1400
    const rise = (p: number): number => 1 - (1 - p) ** 3
    const along = (p: number): number => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2)
    // Its own place, untransformed: the middle of the window, as laid out (read each frame, as the window settles).
    const place = (): { left: number; top: number; width: number; height: number } => ({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight })
    const big = parseFloat(getComputedStyle(el).fontSize)
    let lit = false
    let frame = 0
    // Followed every frame, not measured once: the first welcome's window is still settling to its size as it ends,
    // and the sidebar's foot moves with it.
    const t0 = performance.now()
    let told = false
    const tick = (now: number): void => {
      // Risen, it holds until carried: its clock stands at the end of its rise, then runs on from there.
      const held = carried.current === null ? Math.min(now - t0, RISE) : RISE + Math.max(0, now - Math.max(carried.current, t0 + RISE))
      const t = Math.min(1, held / TOTAL)
      if (held >= RISE && !told) (told = true), risen.current()
      const home = place()
      const target = document.querySelector<HTMLElement>('[data-sidebar-book-name]')
      const box = target?.getBoundingClientRect()
      const there = target && box && box.width ? box : null
      // Fading as it arrives, gone the moment it is over the sidebar's own name: never two names on top of each other.
      const shown = t < 0.25 ? rise(t / 0.25) : t < 0.66 ? 1 : Math.max(0, 1 - (t - 0.66) / 0.24)
      const up = t < 0.25 ? 10 * (1 - rise(t / 0.25)) : 0
      const go = t < 0.25 ? 0 : along(Math.min(1, (t - 0.25) / 0.65))
      let x = 0
      let y = up
      let scale = 0.96 + 0.04 * Math.min(1, rise(t / 0.25))
      if (there) {
        const size = parseFloat(getComputedStyle(target!).fontSize) / big
        // The two names' left edges and middles meet: the carried one lands over the sidebar's own.
        const toX = there.left - (home.left + home.width / 2 - (home.width * size) / 2)
        const toY = there.top + there.height / 2 - (home.top + home.height / 2)
        x = toX * go
        y = up + toY * go
        scale = scale + (size - scale) * go
        if (!lit && t >= 0.72) (lit = true), target!.classList.add('mf-name-landed')
      } else y = up - 4 * go
      el.style.opacity = String(shown)
      el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const unlit = setTimeout(() => document.querySelector('[data-sidebar-book-name]')?.classList.remove('mf-name-landed'), 2700)
    return () => (cancelAnimationFrame(frame), clearTimeout(unlit))
  }, [])
  return (
    <div aria-hidden data-finale="" className="pointer-events-none fixed inset-0 z-[71] grid place-items-center">
      <p ref={self} data-finale-name="" style={{ opacity: 0 }} className="origin-center text-[2.75rem] leading-none whitespace-nowrap text-foreground [font-family:'Haligtree_Signature',cursive]">
        {name}
      </p>
    </div>
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
        // Come to the second page, it blobs into being where it was kept: from 90%, soft and clear, to its size, a touch past and back, in 260ms.
        className={`-ml-3 flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center rounded-[0.6rem] px-3 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97] motion-reduce:transition-none ${at > WHY ? '' : 'invisible scale-[0.9] opacity-0 blur-[2px]'}`}
        style={{ transition: still() ? 'none' : 'visibility 260ms linear, opacity 200ms var(--mf-ease), scale 260ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 200ms var(--mf-ease), background-color 150ms ease, color 150ms ease' }}>
        Back
      </button>
      {/* Narrower still (the smallest window), the marks make room too, so the skip link is never under the way on. */}
      <span aria-hidden className="flex items-center gap-1 [@container(max-width:680px)]:hidden">
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
function Words({ title, still, done, wide = false, children }: { title: string; docked?: boolean; still: boolean; done: boolean; tight?: boolean; /** A longer line, kept to two lines on a wide window. */ wide?: boolean; children?: ReactNode }): React.JSX.Element {
  return (
    <div data-reel={done ? 'done' : 'playing'} data-words className="relative z-20 flex max-w-[60rem] shrink-0 flex-col gap-[clamp(0.375rem,1.2vh,0.75rem)] pb-[clamp(0.5rem,2vh,1.25rem)]">
      <h1 className={DOCKED}>
        <Rise text={title} still={still} />
      </h1>
      {children && (
        // The line comes in on its own once the page is up and the headline's words have risen: a short rise as it
        // fades in, in the headline's family (ENTER), so it is seen arriving rather than showing with the paper.
        // Reduce Motion: the same moment, a plain fade (no rise). Going back to a page already seen: there at once.
        <motion.div data-words-line className={`${BODY} ${wide ? 'max-w-[64ch]' : 'max-w-[46ch]'}`} initial={still && !calm() ? false : calm() ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={calm() ? { duration: 0.4, ease: 'easeOut', delay: 0.3 } : { duration: 0.45, ease: ENTER, delay: 0.5 }}>
          {children}
        </motion.div>
      )}
    </div>
  )
}

/**
 * A call to action, on its own line and larger than the words around it, with
 * the same light passing over it as the phrase that carries a chapter (Shine):
 * what to do now is the one thing to see. Its keys keep their own ink.
 */
export function Action({ className = '', children }: { className?: string; children: ReactNode }): React.JSX.Element {
  return (
    <motion.p className={`font-heading text-[clamp(1.25rem,min(2.4vw,3.4vh),1.75rem)] leading-tight font-medium whitespace-nowrap text-foreground ${className}`}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: 0.2 }}>
      <span className="mf-sheen">{children}</span>
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
 * most notes are never seen again; where thinking lives now, three kinds of
 * thing in three apps (said plainly, no brands, so a newcomer is never lost);
 * why: in each, going back is your job; and the answer, come up a word at a time: Haligtree
 * is one place for all three, and they come back on their own, a memory card on Home (hint-card,
 * this day last year) and a spaced question in Review; and what a commonplace
 * book is, in one line. One thing at a time.
 */
const THESIS = 'Most notes are written once and never seen again.'
/**
 * Where thinking lives now, by what it is, never by brand: anyone scattered
 * across apps sees themselves, whether or not they have heard of Obsidian or
 * Anki (those are asked about on the next page, "What did you use before?").
 * The one place each kind ends up is what the pointer sets in italics.
 */
const THREE: [string, string][] = [
  ['Your writing', 'lives in one app.'],
  ['Your plans', 'live in another.'],
  ['What you want to remember and practice (flashcards)', 'lives in a third.']
]
/** Written in the margin beside the cause, as a reader annotates a page, its arrow drawn to it: the objection the answer meets. */
const MARGIN_NOTE = 'But\u2026 you never write anything down to do nothing with it.'
/** How long the note takes to write, a pen's pace a letter at a time, and the arrow after it (MarginNote). */
const NOTE_LETTER_S = 0.045
const NOTE_WORD_GAP_S = 0.08
const noteWrites = (): { starts: number[]; lengths: number[]; arrowAt: number; end: number } => {
  // The arrow first (its head at the line, then its stroke out to where the note goes), then the note.
  const arrowAt = 0.15
  let at = arrowAt + 0.18 + 0.5 + 0.12
  const starts: number[] = [], lengths: number[] = []
  for (const word of MARGIN_NOTE.split(' ')) (starts.push(at), lengths.push(word.length * NOTE_LETTER_S), (at += word.length * NOTE_LETTER_S + NOTE_WORD_GAP_S))
  return { starts, lengths, arrowAt, end: at }
}
/** Said once the three are up: why notes go unseen (going back is left to you). */
const QUESTION = 'In each one, going back is your job. So mostly, nobody does.'
// One thing is pitched: the three are one thought, growing. What Haligtree is was said at the top, in the tagline.
const ANSWER = `${APP_NAME} changes the direction. Instead of asking you to search, it brings your writing, plans, and practice *back to you*.`

type ThesisState = { noted: boolean; opened: boolean; words: number; gaps: number; kept: number; line: number; move: Move; slanted: number; asked: boolean; answer: boolean; book: boolean }
const THESIS_START: ThesisState = { noted: false, opened: false, words: 0, gaps: 0, kept: 0, line: -1, move: 'off', slanted: 0, asked: false, answer: false, book: false }
const THESIS_END: ThesisState = { noted: true, opened: true, words: Infinity, gaps: THREE.length, kept: THREE.length, line: -1, move: 'off', slanted: THREE.length, asked: true, answer: true, book: true }

function thesisBeats(): Beat<ThesisState>[] {
  // The chapter opens on the arrival's beat (ARRIVE_MS): the date and the tagline first, on a glass note.
  const beats: Beat<ThesisState>[] = [{ at: 0, to: { opened: true }, cue: () => bell(PENTA[0] * 2, 0.014, 'arrive') }]
  // A beat later the headline, a word to each quarter beat, quietly: a note a word ran up the scale like a lesson.
  let t = BEAT_MS
  THESIS.split(' ').forEach((_, i) => {
    beats.push({ at: t, to: { words: i + 1 } })
    t += BEAT_MS / 4
  })
  // Read the line whole, and taken in, before anything else comes: the user found the three starting before the
  // headline had sunk in.
  t += Math.max(2200, leadMs(THESIS))
  // Each kind of app lands in bold, what it keeps comes up beside it, and a pointer selects that and sets it in italics, then goes on to the next.
  THREE.forEach((_, i) => {
    // Read before anything moves: the bold words alone a moment, then the rest of the line, and only once
    // both have been read does the pointer set out for it.
    beats.push({ at: t, to: { gaps: i + 1 }, cue: cue('bead') })
    beats.push({ at: t + 800, to: { kept: i + 1 } })
    const reach = t + 800 + Math.max(900, leadMs(THREE[i][1]) - 400)
    beats.push({ at: reach, to: { line: i, move: 'reach' } })
    const press = reach + REACH_MS + 160
    beats.push({ at: press, to: { move: 'drag' }, cue: cue('select') })
    beats.push({ at: press + DRAG_MS + 40, to: { move: 'held' } })
    beats.push({ at: press + DRAG_MS + 300, to: { slanted: i + 1 }, cue: cue('slant') })
    // A breath after each, before the next kind of app comes.
    t = press + DRAG_MS + 1000
  })
  beats.push({ at: t, to: { line: -1, move: 'leave' } })
  // The cause, read whole (it stays up).
  t += 300
  beats.push({ at: t, to: { asked: true } })
  t += Math.max(1200, leadMs(QUESTION) - 400)
  // Then a reader's note written on in the margin to its right, a letter at a time, its arrow drawn to it after;
  // nothing else moves on the page while it writes, and it is read before the answer comes.
  beats.push({ at: t, to: { noted: true }, cue: () => bell(PENTA[2], 0.009, 'note') })
  // Then read whole, once written: a reader finishes a handwritten line slower than it was written.
  t += noteWrites().end * 1000 + Math.max(1800, leadMs(MARGIN_NOTE))
  // The answer comes up out of the mist a word at a time, as the headline and the three did, its key words shining.
  beats.push({ at: t, to: { answer: true }, cue: () => bell(PENTA[0] * 2, 0.014, 'answer') })
  // Up once its last word has cleared (ANSWER_STAGGER apart, 1.1s each), then read whole, a breath before the page is done.
  t += (plainOf(ANSWER).split(' ').length * ANSWER_STAGGER + 1.1) * 1000 + Math.max(1200, leadMs(plainOf(ANSWER)) - 1200) + 700
  beats.push({ at: t, to: { book: true } })
  beats.push({ at: t + 900, to: {} })
  return beats
}

function ThesisChapter({ play, report }: { play: boolean; report: (now: Reel) => void }): React.JSX.Element {
  const [beats] = useState(thesisBeats)
  const show = useScript<ThesisState>(THESIS_START, beats, play, 1)
  useReport(report, show.done, show.settle, show.part)
  const s = show.done ? THESIS_END : show.state
  // Settled (Esc, a click) or not played: everything at its end at once.
  const quick = !play || show.done
  const root = useRef<HTMLDivElement>(null)
  const phrases = useRef<(HTMLElement | null)[]>([])
  const marks = useRef<(HTMLElement | null)[]>([])
  const come = (on: boolean): { initial: false; animate: { opacity: number; y: number; filter: string }; transition: object } => ({
    initial: false, animate: { opacity: on ? 1 : 0, y: on ? 0 : 6, filter: on ? 'blur(0px)' : 'blur(6px)' }, transition: { duration: quick ? 0 : 0.6, ease: ENTER }
  })
  return (
    <div ref={root} className="relative flex min-h-0 flex-1 flex-col justify-center-safe pb-2">
      <div data-reel={show.done ? 'done' : 'playing'} data-words className="flex max-w-[58rem] flex-col gap-[clamp(0.75rem,2.6vh,1.75rem)]">
        {/* No header above it: the title card before it said the name; this page opens on the problem. */}
        {/* The headline resolves out of the mist a word to a note, each word in its place from the start. */}
        <h1 data-thesis="line" data-words={Math.min(s.words, THESIS.split(' ').length)} data-mist-clear={s.words > 0 ? '' : undefined} aria-label={THESIS} className={`${HEADLINE_XL} max-w-[18ch]`}>
          {THESIS.split(' ').map((word, i, all) => (
            <Fragment key={i}><Condense text={word} on={s.words > i} quick={quick} />{i < all.length - 1 && ' '}</Fragment>
          ))}
        </h1>
        <ul className="relative flex w-fit flex-col gap-[clamp(0.25rem,1vh,0.5rem)]">
          {THREE.map(([name, gap], i) => {
            const slanted = s.slanted > i
            const chosen = s.line === i && (s.move === 'drag' || s.move === 'held')
            const lean = { duration: quick ? 0 : 0.5, ease: MOVE }
            return (
              <li key={name} data-thesis={`gap-${i}`} data-slant={slanted ? 'on' : 'off'} data-mist-clear={s.gaps > i ? '' : undefined} className="text-[clamp(1.125rem,min(2.1vw,3vh),1.5rem)] leading-snug text-(--mf-wl-body)">
                {/* The kind of app lands first, in bold; then what it keeps, which a hand selects and sets in italics: said the way a person would. */}
                <span className="font-semibold text-foreground"><Condense text={name} on={s.gaps > i} quick={quick} stagger={0.05} /></span>{' '}
                <span ref={(el) => void (phrases.current[i] = el)} className="relative inline-grid">
                  {/* The selection, growing with the drag (WelcomePointer sets its width), gone once the hand moves on. */}
                  <span ref={(el) => void (marks.current[i] = el)} aria-hidden data-selected={chosen ? '' : undefined}
                    className={`pointer-events-none absolute inset-y-[0.06em] -right-[0.08em] -left-[0.08em] origin-left rounded-[3px] bg-[color-mix(in_oklab,Highlight_80%,transparent)] ${chosen ? 'opacity-100' : 'opacity-0 transition-opacity duration-300 ease-out'}`} />
                  {/* Upright, then leaning over into Fraunces' true italic: the two cross, each at the other's slant, so the words seem to tilt rather than swap. */}
                  <motion.span aria-hidden={slanted || undefined} className="relative origin-[0_80%] [grid-area:1/1]" initial={false}
                    animate={slanted
                      ? { opacity: 0, transform: 'translateY(0em) skewX(-14deg)', filter: 'blur(1px)', transitionEnd: { visibility: 'hidden' } }
                      : { opacity: s.kept > i ? 1 : 0, transform: `translateY(${s.kept > i ? 0 : 0.28}em) skewX(0deg)`, filter: s.kept > i ? 'blur(0px)' : 'blur(10px)', visibility: 'visible' }}
                    transition={slanted ? lean : { duration: quick ? 0 : 1.1, ease: ENTER }}>
                    {gap}
                  </motion.span>
                  <motion.span aria-hidden={!slanted || undefined} className="relative origin-[0_80%] italic [grid-area:1/1]" initial={false}
                    animate={slanted
                      ? { opacity: 1, transform: 'skewX(0deg)', filter: 'blur(0px)', visibility: 'visible' }
                      : { opacity: 0, transform: 'skewX(14deg)', filter: 'blur(1px)', transitionEnd: { visibility: 'hidden' } }}
                    transition={lean}>
                    {gap}
                  </motion.span>
                </span>
              </li>
            )
          })}
        </ul>
        <div className="relative w-fit">
          <motion.p data-thesis="question" className="text-balance text-[clamp(1.125rem,min(2.1vw,3vh),1.5rem)] leading-snug font-medium text-foreground" {...come(s.asked)}>
            {QUESTION}
          </motion.p>
          <MarginNote on={s.noted} quick={quick} />
        </div>
        <motion.p data-thesis="answer" data-typed={s.answer ? plainOf(ANSWER).length : 0} aria-label={plainOf(ANSWER)} className="font-heading text-[clamp(1.375rem,min(2.8vw,4vh),2.25rem)] leading-tight text-foreground" {...come(s.answer)}>
          <MistAnswer said={ANSWER} on={s.answer} quick={quick} />
        </motion.p>
      </div>
      {play && !show.done && <WelcomePointer root={root} phrases={phrases} marks={marks} line={s.line} move={s.move} />}
    </div>
  )
}

// --- 2 You ------------------------------------------------------------------------

/**
 * Two questions before anything else, then a first space and a goal: all
 * optional (welcome-you.tsx). Then, if anything was answered, what Haligtree did
 * with it, done there and then, each with its Undo; with nothing answered,
 * Next goes straight on.
 */
function YouChapter({ setup, onChange, still, report, paid, onPaid: setPaid }: { setup: Setup; onChange: (next: Setup) => void; still: boolean; report: (now: Reel) => void; /** The summary is up (kept by the welcome, so coming back shows it again). */ paid: boolean; onPaid: (paid: boolean) => void }): React.JSX.Element {
  const [working, setWorking] = useState(false)
  // The five questions (or what was done with them) a little smaller where the window is short, so the last one is
  // never under the footer, the goal's card beside them drawn smaller with them; fitted again as answers make a row wrap.
  const stage = useRef<HTMLDivElement>(null)
  const asked = useRef<HTMLDivElement>(null)
  useFitPicture(asked, stage)
  report({
    done: !working,
    settle: () => undefined,
    // Back from the summary: the questions, every answer as it was given.
    less: () => (paid ? (setPaid(false), true) : false),
    // From the summary, Next says where it goes: Catch, which shows quick capture.
    label: paid ? 'Show me quick capture' : undefined,
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
      <Words key={paid ? 'paid' : 'ask'} title={paid ? `${APP_NAME} is shaped for you now.` : `Tell ${APP_NAME} a little about you.`} docked still={still} done>
        {paid ? 'Here is what that means for you.' : 'So it starts out shaped for you. Skip any question.'}
      </Words>
      <div ref={stage} className="mf-more relative flex min-h-0 flex-1 flex-col justify-center-safe overflow-y-auto pb-2">
        <div ref={asked} className="w-full">
          {paid
            ? <Payoff setup={setup} onChange={onChange} onBack={() => (chime('page'), setPaid(false))} still={still} />
            : <YouPage setup={setup} onChange={onChange} still={still} />}
        </div>
      </div>
    </>
  )
}

/** A line for what you said Haligtree is for, under a chapter's words: why this part matters to you, the words that say it *marked* to shine. */
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
  return said ? <span role="img" data-for-you aria-label={plainOf(said)} className="mt-1 block font-medium text-foreground">{parts(said).map((part, i) => (part.key ? <Shine key={i}>{part.text}</Shine> : <span key={i}>{part.text}</span>))}</span> : null
}

/** The words that carry a line's point: the accent with a light passing over it now and then (main.css, .mf-sheen). */
/** A pen's stroke under the words that carry the point, drawn left to right the moment they are said, a little uneven, as a reader underlines a book. */
/** The tagline's promise, which the page's hand underlines. */


/**
 * A reader's note in the margin to the right of the cause, the way a
 * commonplace book is annotated: a pen arrow drawn out from the line, then
 * the note written on as a pen writes, a letter at a time left to right. With no
 * room to its right, left out, never squeezed over words.
 */
/** The note's width: room for it in two lines, as a hand writes it, not three short ones. */
const NOTE_WIDTH_REM = 16

function MarginNote({ on, quick }: { on: boolean; quick: boolean }): React.JSX.Element {
  const box = useRef<HTMLSpanElement>(null)
  const [room, setRoom] = useState(false)
  const present = useIsPresent()
  useEffect(() => {
    const fit = (): void => {
      const line = box.current?.parentElement?.getBoundingClientRect()
      if (!line) return
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setRoom(window.innerWidth - line.right - 3.4 * rem - NOTE_WIDTH_REM * rem >= 12)
    }
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [])
  const shown = on && present
  const words = MARGIN_NOTE.split(' ')
  const pace = noteWrites()
  const now = (at: number): number => (quick || !shown ? 0 : at)
  return (
    <span ref={box} aria-hidden={!room || undefined} data-margin-note={on ? 'on' : 'off'} data-side={room ? 'right' : 'none'} className={room ? '' : 'invisible'}>
      <span data-margin-words="" className="pointer-events-none absolute top-1/2 left-[calc(100%+3.4rem)] w-[16rem] -translate-y-1/2 rotate-2 text-left text-balance font-heading text-[0.98rem] leading-snug text-primary italic">
        {words.map((word, i) => (
          <Fragment key={i}>
            {/* Each word written on left to right as a pen goes, the next begun once this one is down. */}
            <motion.span className="inline-block" initial={false}
              animate={{ clipPath: shown ? 'inset(-40% -10% -40% -10%)' : 'inset(-40% 110% -40% -10%)', opacity: shown ? 1 : 0 }}
              transition={{ clipPath: { duration: quick || !shown ? 0 : pace.lengths[i], delay: now(pace.starts[i]), ease: 'linear' }, opacity: { duration: quick || !shown ? 0 : 0.05, delay: now(pace.starts[i]) } }}>{word}</motion.span>{i < words.length - 1 && ' '}
          </Fragment>
        ))}
      </span>
      {/* The arrow, drawn before the note: its head at the line, then its stroke out to where the note is written. */}
      <svg viewBox="0 0 40 16" className="pointer-events-none absolute top-1/2 left-[calc(100%+0.6rem)] h-4 w-[2.6rem] -translate-y-1/2 overflow-visible">
        {['M7.5 4.8 L 3 9 L 8.6 10.8', 'M3 9 C 14 2, 28 1, 38 5'].map((d, i) => (
          <path key={i} d={d} pathLength={1} fill="none" stroke="var(--primary)" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1"
            style={{ strokeDashoffset: shown ? 0 : 1, opacity: shown ? 0.85 : 0, transition: quick || !shown ? 'none' : `stroke-dashoffset ${i ? 0.5 : 0.18}s cubic-bezier(0.65,0,0.35,1) ${pace.arrowAt + (i ? 0.18 : 0)}s, opacity 0.1s linear ${pace.arrowAt + (i ? 0.18 : 0)}s` }} />
        ))}
      </svg>
    </span>
  )
}

function Shine({ children, done = false }: { children: ReactNode; done?: boolean }): React.JSX.Element {
  return <span className="mf-sheen font-semibold" data-done={done || undefined}>{children}</span>
}

// --- 3 Catch ------------------------------------------------------------------------

/** What Catch catches, in order: the thought the story follows, a line from its book, then the story's task. */
const CAUGHT: Kind[] = ['note', 'quote', 'todo']

type CatchState = { keys: boolean; down: number[]; box: Box | null; filled: Kind[]; said: Kind[]; kinds: boolean; aha: 'keys' | null }

/**
 * Three things caught, a beat at a time, with Haligtree doing the sorting: each
 * is typed in by a person's hand, then what Haligtree read in it lifts out into
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
  // Each one: typed in, never more than its cap; a breath to see it whole; what Haligtree read lifts out
  // and its line comes up beside the slot; the chip turns to its kind; Create; the words fly to their slot.
  const catchOne = (item: Kind, whole: string, at: (sofar: string) => Partial<Box>, sorted: Partial<Box> | null, kind: Box['kind'], sortCue: () => void, cap: number): void => {
    const run = typed<CatchState>(whole, t + 200, (sofar) => ({ box: { ...EMPTY_BOX, item, typing: true, ...at(sofar) } }), random, 0.85, cap)
    beats.push({ at: t, to: { box: { ...EMPTY_BOX, item, typing: true } } }, ...run.beats)
    const then = { ...EMPTY_BOX, item, ...at(whole), ...sorted }
    // The first is looked at a breath longer: the keys' line (KEYS_SAID, fifteen words) goes with it, and was gone a few
    // tenths of a second before a reader had read it to its end (qa/welcome-read.mjs).
    const read = run.end + (item === CAUGHT[0] ? 850 : 450)
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
  catchOne('note', flowWords().caught, (sofar) => ({ text: sofar }), null, 'note', () => undefined, 1500)
  // Past the closing mark: who said it, and where, lit as Haligtree reads them.
  const QUOTE = quoteNow()
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

/** What Haligtree did with each thing caught, beside it: a bold lead-in, then why it helps. The keys' line is said under the keys. */
const AHA: Partial<Record<Kind, [string, string]>> = {
  note: ['Caught in seconds.', 'Now your mind can let go of it.'],
  quote: ['Kept with its source.', `${APP_NAME} read who said it, and where.`],
  todo: ['Dated for you.', `On your list for ${STORY_DAY}, at ${clock(dayjs().hour(20).minute(0).toDate())}.`]
}
const KEYS_SAID: [string, string] = ['Just watch first.', 'See how it reads what you write. Then it is your turn.']
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
      <p className="px-2 pt-1 pb-2 text-[0.9375rem] font-medium text-foreground">{counted(kinds.length)} kinds. {APP_NAME} guesses which, and you can always change it.</p>
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
  // Where the box is drawn here: quick capture, opened while the welcome runs, lands on it (main/index.ts, summonedAt), under the step's words.
  const frame = useRef<HTMLDivElement>(null)
  const told = useRef('')
  const tellSpot = (): void => {
    const r = frame.current?.getBoundingClientRect()
    if (!r) return
    const spot = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width) }
    if (JSON.stringify(spot) === told.current) return
    told.current = JSON.stringify(spot)
    void onboarding.set({ boxSpot: spot })
  }
  // After every change on the stage (the frame moves as lines come and go), and as the window changes size.
  useEffect(tellSpot)
  useEffect(() => {
    // The frame never gives back room it has taken: the stage is centred in its room, so a box that grew shorter
    // (sent, its words gone) moved the box, its column and its line 6 to 10px each time (Catch, 19 Nov film, 25.3s, 35.0s).
    let most = 0
    const watch = new ResizeObserver(() => {
      const el = frame.current
      if (el && el.offsetHeight > most) (most = el.offsetHeight), (el.style.minHeight = `${most}px`)
      tellSpot()
    })
    if (frame.current) watch.observe(frame.current)
    watch.observe(document.documentElement)
    return () => (watch.disconnect(), void onboarding.set({ boxSpot: null }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const keys = keyFor('⌘.') || '⌘.'
  const caps = capsOf(keys)
  const down = new Set(s.down)
  const box = <InlineKeys keys={keys} />
  const send = <InlineKeys keys={keyFor('⌘↵') || '⌘↵'} />
  // Its own quote marks dropped (a quote keeps them), cut at a word with “…” when long.
  const first = mine?.label.split('\n')[0].trim() ? quoted(mine.label.split('\n')[0], 44, (text, n) => fittedTitle(text, n) ?? text) : ''
  // A different key, offered where the keys are asked for: Your turn.
  // It comes with the line it follows (Action's own 0.2s), never before it, alone at the row's end.
  const other = (
    <motion.button type="button" onClick={() => (chime('tap'), setChoosing(true))} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: EASE, delay: 0.2 }}
      className={`${QUIET} rounded-sm underline decoration-current/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current/60`}>
      Use a different key
    </motion.button>
  )
  const said: Record<Turn, ReactNode> = {
    idle: <><Action>Now you: press {box} and write anything</Action>{other}</>,
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
      {/* From the top of its room, under the words, the box and its column level at their tops: centred, the stage moved
          each time anything in it changed height, the box opening out of the keys 12px above where the keys had been
          (Catch, 19 Nov film, 22.1s). The keys and the box now share one top-left corner, so the one turns into the other
          in place and grows only down and across. */}
      <div className="relative flex min-h-0 flex-1 flex-wrap content-start items-start gap-x-[clamp(1.5rem,4vw,3.5rem)] gap-y-[clamp(0.75rem,2.5vh,1.5rem)] pb-2">
        <div ref={frame} data-frame="box" className="relative w-[min(40rem,100%)] shrink-0 @min-[880px]:w-[min(40rem,56%)]">
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
        {/* What was caught, beside the box, each with what Haligtree did with it. */}
        {/* Its slots come with the box: while the keys are up, they are the one thing to watch. */}
        <motion.div className="relative z-10 min-w-[14rem] flex-1" initial={false} animate={{ opacity: s.keys ? 0 : 1 }} transition={{ duration: 0.3, ease: ENTER }}>
          <Caught kinds={CAUGHT} filled={s.filled} said={s.said} lines={AHA} />
        </motion.div>
        {/* Your turn, once it has all played: in the real box, with nothing to pick (the box guesses the kind). Its row
            is kept from the start, an unseen copy of its longest line under it: the stage is centred in its room, and
            a row added at the end lifted the box and its column 11px as the line came (19 Nov film, Catch 34.4s). */}
        <div className="relative z-10 grid w-full shrink-0 text-[clamp(1rem,min(2vw,2.9vh),1.375rem)] leading-snug text-foreground">
          <div aria-hidden inert className="invisible col-start-1 row-start-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">{said.idle}</div>
          <AnimatePresence>
            {show.done && (
              <motion.div key={turn} role="status" data-turn={turn} className="col-start-1 row-start-1 flex flex-wrap items-baseline gap-x-5 gap-y-1"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: spring.fast.exit }} transition={{ duration: 0.25, ease: ENTER }}>
                {said[turn]}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}

// --- 4 Write ------------------------------------------------------------------------

const WRITE_TITLE = 'Write it out.'
const WRITE_LINE = 'What you catch waits in your Inbox. When it needs room, write it out as a page, then pick out a line to make it a task or a gem.'

/**
 * The thought caught in Catch, written out a key at a time; then, in real
 * milliseconds: "New page" is pressed and it is written out as a page, its
 * title typed and its lines one after another; the pointer selects one line, presses
 * "Make a task", and the task lands with its day; another line, "Make a gem",
 * and a plain gem lands; the last line, "Make a gem" again, and the gem
 * with a question lands, its question typed in; then the closing line.
 * Each card lands with its own words under it, so nothing waits to be said.
 */
function writeBeats(): Beat<FlowShot>[] {
  const random = seeded(31)
  const beats: Beat<FlowShot>[] = [{ at: 0, to: {} }]
  // The thought is written first, a key at a time, as it was on the walk; only then does it grow into a note.
  const written = typed<FlowShot>(flowWords().caught, 400, (sofar) => ({ caught: sofar }), random, 0.9, 1700)
  beats.push(...written.beats)
  // You choose to write about it: "New page" comes up beside the capture, the pointer presses it, and the page opens
  // with the thought as its title, typed, then its lines written in one after another. Writing at length, not a copy.
  const offer = written.end + 600
  beats.push({ at: offer, to: { newPage: 'shown' } })
  beats.push({ at: offer + 250, to: { cursor: { line: 'page', to: 'button' } } })
  const press = offer + 250 + CURSOR_MS.button + 260
  beats.push({ at: press, to: { pressed: true }, cue: () => click('tick') })
  beats.push({ at: press + 170, to: { pressed: false, newPage: 'off', cursor: null, shown: 2 }, cue: cue('slide') })
  const title = typed<FlowShot>(flowWords().note, press + 600, (sofar) => ({ title: sofar }), random, 0.85, 1400)
  beats.push(...title.beats)
  let line = title.end + 350
  for (let n = 1; n <= flowParts(); n++) (beats.push({ at: line, to: { body: n }, cue: () => click('soft') }), (line += 420))
  const grows = line
  // You pick a line: the pointer comes to its start, drags across it (the selection grows with it), its one action
  // shows beside the selection, the pointer presses it, and only then is the line marked and what it becomes set down.
  const pick = (t: number, line: Pick, shown: number, sound: () => void): number => {
    const dragAt = t + CURSOR_MS.travel + 60
    const barAt = dragAt + CURSOR_MS.drag + 40
    const pressAt = barAt + 180 + CURSOR_MS.button + 40
    beats.push({ at: t, to: { cursor: { line, to: 'start' } } })
    beats.push({ at: dragAt, to: { cursor: { line, to: 'end' }, picked: line, pressed: false }, cue: () => click('soft') })
    beats.push({ at: barAt, to: { bar: true } })
    beats.push({ at: barAt + 180, to: { cursor: { line, to: 'button' } } })
    beats.push({ at: pressAt, to: { pressed: true }, cue: () => click('tick') })
    beats.push({ at: pressAt + 160, to: { picked: null, bar: false, pressed: false, lit: PICKS.indexOf(line) + 1, shown }, cue: sound })
    return pressAt + 160
  }
  let t = pick(grows + 500, 'task', 3, cue('tag'))
  // Two gems: one kept as it is, then the last sentence, which takes a question.
  t = pick(t + 450, 'kept', 4, cue('promote'))
  t = pick(t + 450, 'gem', 5, cue('promote'))
  // The pointer steps away once the gem is made: what is left is yours.
  beats.push({ at: t + 500, to: { cursor: null } })
  const question = typed<FlowShot>(flowWords().question, t + 450, (sofar) => ({ question: sofar }), random, 0.75, 1500)
  beats.push(...question.beats)
  beats.push({ at: question.end + 500, to: { last: true }, cue: cue('settled') })
  // The closing line stays up: it is read while Next waits.
  beats.push({ at: question.end + 1100, to: {} })
  return beats
}

function WriteChapter({ play, report, setup }: { play: boolean; report: (now: Reel) => void; setup?: Setup }): React.JSX.Element {
  const [beats] = useState(writeBeats)
  // The thought starts typing once the title and the first sentence are glanced at (about 1.2s), not the whole line
  // (4.2s): its box stood empty that long. The rest of the line is read while it types; nothing after it moves sooner.
  const show = useScript<FlowShot>(FLOW_START, beats, play, 1, glance(`${WRITE_TITLE} ${WRITE_LINE.split('. ')[0]}.`))
  useReport(report, show.done, show.settle, show.part)
  return (
    <>
      <Words title={WRITE_TITLE} still={!play} done={show.done} wide>{WRITE_LINE}<ForYou setup={setup} at="write" /></Words>
      <div className="relative flex min-h-0 flex-1 flex-col pb-2">
        <FlowTree shot={show.done ? flowEnd() : show.state} quiet={!play} />
      </div>
    </>
  )
}

// --- 5 Remember ---------------------------------------------------------------------

const BACK_TITLE = 'It comes back to you.'
const BACK_LINE = 'Each thing you keep comes back when you need it.'

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
  // One thing moving at a time: the gem's card lands and turns over to its answer, and only once it is still
  // does the curve under it draw, so the curve reads as that card's why; the postcard comes once the curve is in.
  { at: 2700, to: { shown: 2 }, cue: cue('open') },
  { at: 3800, to: { over: true }, cue: () => fold() },
  { at: 4700, to: { curve: true } },
  { at: 8000, to: { shown: 3 }, cue: cue('memory') },
  // Signed once its line is written on.
  { at: 9900, to: { signed: true } },
  // The last moment stays up: it is looked at while Next waits, a full second after the card's last line (where
  // the quote is from) is in, so Next never arrives with it.
  { at: 12400, to: {} }
]

/** An answer's words with the ones that carry the point marked *so*: as parts, each said plain or stood out. */
const parts = (said: string): { text: string; key: boolean }[] => said.split('*').map((text, i) => ({ text, key: i % 2 === 1 })).filter((one) => one.text)
const plainOf = (said: string): string => said.replace(/\*/g, '')
const shining = (said: string): ReactNode => parts(said).map((part, i) => (part.key ? <Shine key={i}>{part.text}</Shine> : <span key={i}>{part.text}</span>))

/** A word's gap in the answer's reveal: a little slower than the headline's, as it is a longer line read more slowly. */
const ANSWER_STAGGER = 0.07

/** An answer coming up out of the mist a word at a time, as the page's other lines do (Condense); the key words shining. */
function MistAnswer({ said, on, quick }: { said: string; on: boolean; quick: boolean }): React.JSX.Element {
  let before = 0
  return (
    <>
      {parts(said).map((part, i) => {
        const delay = before * ANSWER_STAGGER
        const lead = part.text.startsWith(' ') ? ' ' : ''
        const words = part.text.trim()
        before += words.split(' ').length
        return <span key={i}>{lead}<Condense text={words} on={on} quick={quick} delay={delay} stagger={ANSWER_STAGGER} each={part.key ? (word) => <Shine>{word}</Shine> : undefined} />{part.text.endsWith(' ') && words ? ' ' : ''}</span>
      })}
    </>
  )
}

function RememberChapter({ play, report, setup }: { play: boolean; report: (now: Reel) => void; setup?: Setup }): React.JSX.Element {
  const show = useScript<BackShot>(BACK_START, BACK_BEATS, play, 1, glance(`${BACK_TITLE} ${BACK_LINE} ${forYou(setup, 'remember')}`))
  useReport(report, show.done, show.settle, show.part)
  return (
    <>
      <Words title={BACK_TITLE} still={!play} done={show.done} wide>
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
 * The window puts each theme on as the ring turns to it, plainly: the colours change in the next frame, while the
 * ring glides on. A crossfade of the page (a view transition) pictured the whole page, old and new, at once: one
 * frame of 80 to 250ms, and the ring, gliding by the clock, threw a third of a detent across it. (It was once two
 * crossfades, one inside the other.) Recolouring is one restyle, about 15ms, with nothing laid out again.
 */
const fadeTo = (theme: Theme): void => applyTheme(theme, false, false)


/**
 * Two turns of the dial, one on and one back, so the page you had is the page you keep: the first as soon as the
 * words are glanced at, and never before the page has landed (PAGE's rest: 0.22s wait and 0.45s in). A theme put on
 * while the page still came in crossfaded a still picture of it, half in, over the live page moving on: a double.
 * Real milliseconds.
 */
const DIAL_BEATS: Beat<DialState>[] = [
  { at: 0, to: {} },
  { at: 700, to: { ticks: 1 }, cue: () => turnDial(1) },
  { at: 1950, to: { ticks: 2 }, cue: () => turnDial(-1) },
  { at: 2550, to: {} }
]

/** Named from the dial's own list (lib/theme.ts, THEMES): Paper is the lightest, Gruvbox a warm dark one. */
const DIAL_LINE = 'Pick how your pages look, from Paper to Gruvbox. Too small to read? ⌘+ makes everything bigger. Change either any time in “Settings”.'
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
  // Put back as the demo put each on: plainly, never a crossfade of the whole page (a 170ms frame as the page settled).
  useEffect(() => () => void (!yours.current && fadeTo(start)), []) // eslint-disable-line react-hooks/exhaustive-deps
  const settle = (): void => {
    show.settle()
    if (!yours.current) fadeTo(start)
  }
  useReport(report, show.done, settle, show.part)
  const win = useWindowSize()
  const size = Math.round(Math.max(150, Math.min(win.height * 0.42, win.width * 0.3, 360)))
  return (
    <>
      <Words title="Make it yours." still={!play} done={show.done}>
        {DIAL_LINE}
      </Words>
      <div className="relative flex min-h-0 flex-1 items-center-safe justify-center pb-2">
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
            {/* Its room is kept from the start and after the first turn: it fades, so the dial never moves under your hand. */}
            <motion.div data-dial-ask={show.done && !turned ? 'on' : 'off'} aria-hidden={!show.done || turned || undefined} className="relative z-20 mt-1 text-center"
              initial={false} animate={{ opacity: turned ? 0 : 1 }} transition={{ duration: 0.5, ease: EASE }}>
              <Action key={show.done ? 'on' : 'off'} className={show.done ? '' : 'invisible'}>Your turn: turn the dial</Action>
            </motion.div>
          </motion.div>
      </div>
    </>
  )
}

// --- 7 Name it -------------------------------------------------------------------

const NAME_LINE = 'It shows on your reader card, in the sidebar and in “Settings”, where you can change it any time.'

/**
 * Your book's name, typed on its reader card: the first time the card is
 * seen, its name changing as you type. A name is drawn for you ("Chapel of
 * Anticipation"), shown as the field's placeholder, and “Draw another” shows
 * a new one in the field (and a new card with it), only to try on: your own
 * name (the book's, or the one you typed) stays one step back, by “Back to”
 * under the field or ⌘Z in it, and typing always wins. Nothing is kept until
 * Next or Enter (save): then the name on screen becomes the open book's name,
 * which the sidebar's switcher, the card and “Settings” all read. Back, the
 * skip and closing the welcome leave the book as it was.
 */
function NameChapter({ play, report, onNext, save }: { play: boolean; report: (now: Reel) => void; onNext: () => void; save: React.MutableRefObject<(() => void) | null> }): React.JSX.Element {
  useReport(report, true, () => undefined)
  const shelf = useShelf()
  const [drawn] = useState(() => drawBookName())
  const [rise, setRise] = useState<'wait' | 'go' | undefined>(play ? 'wait' : undefined)
  const [typed, setTyped] = useState<string | null>(null)
  // A drawn name tried on: in the field, never saved unless you go on with it.
  const [preview, setPreview] = useState<string | null>(null)
  const [look, setLook] = useState<{ seed?: number; name?: string } | null>(null)
  useEffect(() => void Promise.all([haligtree.settings(), SANDBOX ? window.api.haligtree<Carry | null>('sandbox:carry').catch(() => null) : null]).then(([now, carry]) => setLook(carry?.book ? { seed: carry.book.seed ?? now.readerSeed, name: carry.book.name } : { seed: now.readerSeed })), [])
  // A book already named (the welcome played again) starts with its name, the book you came from when it plays in the
  // sandbox; "My book" is no one's name, so it starts empty.
  const named = look?.name ?? (shelf && shelf.current !== 'sandbox' ? shelf.name : '')
  const own = named && named !== DEFAULT_BOOK ? named : ''
  const mine = typed ?? own
  const value = preview ?? mine
  const shown = value.trim() || drawn
  const nameField = useRef<HTMLInputElement>(null)
  useFitText(nameField, value || drawn, { most: 26, least: 11, way: 'across' })
  // "Draw another" draws a new card with the name (a new picture, colours and title); going back to your own name
  // brings your own card back with it.
  const [redrawn, setRedrawn] = useState<number | null>(null)
  const seed = redrawn ?? look?.seed ?? seedOf(drawn)
  const back = (): void => (chime('undo'), setPreview(null), setRedrawn(null))
  save.current = () => {
    if (!shelf || !look || SANDBOX || shelf.current === 'sandbox') return
    if (look.seed === undefined || redrawn !== null) void haligtree.setSettings({ readerSeed: seed })
    if (shown !== shelf.name) void renameBook(shelf.current, shown)
  }
  useEffect(() => () => void (save.current = null), [save])
  return (
    <>
      <Words title="Name your book." still={!play} done>{NAME_LINE}</Words>
      <div className="flex min-h-0 flex-1 flex-wrap items-center justify-center gap-x-[clamp(2rem,7vw,6rem)] gap-y-6 pb-2">
        <motion.div data-name-field className="flex w-[min(28rem,100%)] flex-col gap-3" initial={play ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: ENTER, delay: 0.1 }}>
          <label htmlFor="mf-book-name" className="-mb-1 text-[1.0625rem] font-medium text-foreground">Your book's name</label>
          {/* Written in the pen's hand, as the owner signs a new book inside its cover (the title card's line). "Draw
              another" inside the field at its end, on its row and its edge, as a field's own button sits. */}
          <div className="relative">
            {/* Smaller the longer the name, so the whole name shows in the field at every length up to its 60 letters. */}
            <input ref={nameField} id="mf-book-name" data-welcome-book-name data-preview={preview === null ? undefined : ''} autoFocus spellCheck={false} className={`${FIELD} h-14 w-full pr-40 leading-none tracking-[-0.01em] [font-family:'Haligtree_Signature',cursive] placeholder:text-(--mf-wl-quiet)`} placeholder={drawn} value={value} maxLength={60} style={{ fontSize: 26 }}
              onChange={(event) => (setTyped(event.target.value), setPreview(null))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.preventDefault(), onNext())
                else if (event.key === 'Escape') (event.preventDefault(), event.currentTarget.blur())
                // ⌘Z over a drawn name: your own name back, as one step.
                else if (preview !== null && event.key.toLowerCase() === 'z' && (event.metaKey || event.ctrlKey) && !event.shiftKey) (event.preventDefault(), back())
              }} />
            <button type="button" data-name-draw onClick={() => {
              chime('anew')
              const next = drawBookName(Math.random, preview ?? (mine.trim() || drawn))
              setPreview(next)
              setRedrawn(seedOf(next))
            }} className={`${QUIET_BUTTON} absolute top-1/2 right-1.5 -translate-y-1/2`}>
              <Shuffle className="size-4" strokeWidth={1.8} /> Draw another
            </button>
          </div>
          {/* Its room kept whichever line shows, so the page never moves as a name is drawn or taken back. */}
          <p data-name-keeps className="flex h-9 items-center text-[0.9375rem] leading-snug text-(--mf-wl-body)">
            {preview !== null && mine.trim()
              ? <button type="button" data-name-own onClick={back} className={`${QUIET_BUTTON} -ml-3 max-w-full`}><Undo2 className="size-4 shrink-0" strokeWidth={1.8} /><span className="truncate">Back to {quoted(mine.trim(), 80)}</span><Kbd className="h-6 min-w-6 shrink-0">⌘Z</Kbd></button>
              : value.trim() ? <span>Press <Kbd className="mx-0.5 h-6 min-w-6 align-[-0.2em]"><CornerDownLeft className="size-3" strokeWidth={2.4} /></Kbd> to go on.</span> : <span>Left empty, it is called {quoted(drawn, 80)}.</span>}
          </p>
        </motion.div>
        {/* The book stands up into its pose once it can be seen, not while the page is still coming in. */}
        <motion.div className="shrink-0" initial={play ? { opacity: 0, scale: 0.96 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: ENTER, delay: 0.2 }}
          onUpdate={(at) => void (rise === 'wait' && Number(at.opacity) > 0.15 && setRise('go'))}>
          <ReaderCard seed={seed} named={shown} bare arrive={rise} watching />
        </motion.div>
      </div>
    </>
  )
}

// --- the parts kept from before -------------------------------------------------

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

/** The ⌘ and . keys, modelled and rendered offline by scripts/render-keycaps.mjs: each key, cream and charcoal, at rest and pressed, at 2x and 3x. */
const KEY_PICTURES = import.meta.glob('../../assets/welcome/key-*.webp', { eager: true, import: 'default' }) as Record<string, string>
const keyPicture = (name: string, look: string, down: boolean): string => {
  const at = (scale: number): string => KEY_PICTURES[`../../assets/welcome/key-${name}-${look}${down ? '-down' : ''}@${scale}x.webp`]
  return `${at(2)} 2x, ${at(3)} 3x`
}
/** Each picture's size, as it was rendered (scripts/render-keycaps.mjs, CSS): the cap fills about three quarters of its width. */
const KEY_W = 128
const KEY_H = 120

/**
 * ⌘ and . as two real keys: Haligtree's own render of a soft-matte cap with a
 * dished top, cream in the dark themes and charcoal in the light ones (Paper
 * too). Both keys are the same picture but for the mark, side by side on one
 * baseline. Pressed, a key shows its pressed frame (sunk 2px, its shadow
 * tighter), faded in over 100ms; let go, the frame at rest is back at once
 * and the pressed one fades off it. Only for ⌘. itself; any other key is drawn as caps.
 */
function KeycapPicture({ down, width }: { down: Set<number>; width: number }): React.JSX.Element {
  const scale = (width * 0.46) / KEY_W
  return (
    <span aria-hidden data-keycaps className="flex items-center justify-center" style={{ width, height: Math.round((width * 320) / 520), gap: width * 0.01 }}>
      <RenderedKey name="cmd" mark="⌘" down={down.has(0)} scale={scale} />
      <RenderedKey name="dot" mark="." down={down.has(1)} scale={scale} />
    </span>
  )
}

/** One key: its pictures for both looks, the theme showing one. */
function RenderedKey({ name, mark, down, scale }: { name: string; mark: string; down: boolean; scale: number }): React.JSX.Element {
  const w = Math.round(KEY_W * scale)
  const h = Math.round(KEY_H * scale)
  return (
    <span data-key={mark} data-down={down || undefined} className="relative block shrink-0" style={{ width: w, height: h }}>
      {(['cream', 'charcoal'] as const).map((look) => (
        <span key={look} data-look={look} className={`absolute inset-0 ${look === 'cream' ? '[[data-light]_&]:hidden' : 'hidden [[data-light]_&]:block'}`}>
          {/* At rest: hidden only once the pressed frame has fully come up over it, back at once on release. */}
          <TintedKey src={keyPicture(name, look, false)} w={w} h={h} style={{ opacity: down ? 0 : 1, transition: `opacity 0ms linear ${down ? 100 : 0}ms` }} />
          <TintedKey pressed src={keyPicture(name, look, true)} w={w} h={h} style={{ opacity: down ? 1 : 0, transition: 'opacity 100ms var(--mf-ease)' }} />
        </span>
      ))}
    </span>
  )
}

/**
 * One frame of a rendered key, in the theme's own colour: the picture keeps
 * its light and shade, and a layer cut to the cap's shape lends it the hue of
 * the theme's ink (Gruvbox's warm cream or brown, Nord's cool grey), so the
 * cap is never the plain cream or charcoal it was rendered in.
 */
function TintedKey({ src, w, h, pressed = false, style }: { src: string; w: number; h: number; pressed?: boolean; style: React.CSSProperties }): React.JSX.Element {
  const shape = `url("${src.split(' ')[0]}")`
  return (
    <span data-key-frame className="absolute inset-0 isolate" style={style}>
      <img alt="" draggable={false} data-pressed={pressed || undefined} srcSet={src} width={w} height={h} className="absolute inset-0 select-none" />
      <span aria-hidden data-key-tint className="absolute inset-0 mix-blend-color"
        style={{ background: 'var(--foreground)', maskImage: shape, WebkitMaskImage: shape, maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }} />
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
 * drawn by hand as the margin note's arrow is (a sagging shaft, an uneven head, drawn on as it comes), easing
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
            {/* Drawn by hand, as the margin note's arrow is: a shaft that sags a little, a head not quite even, drawn on
                as it comes (the shaft, then the head), then the nudge toward the button. */}
            <motion.svg viewBox="0 0 28 14" className="h-4 w-8 overflow-visible" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
              data-still={quiet || undefined}
              animate={quiet ? undefined : { x: [0, 5, 0] }}
              transition={quiet ? undefined : { duration: 1.1, ease: MOVE, repeat: Infinity, repeatDelay: 0.9, delay: 1.1 }}>
              <motion.path d="M2.5 7.6 C 8 5.4, 14.5 9.1, 23.6 6.6" initial={quiet ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.38, ease: [0.65, 0, 0.35, 1], delay: 0.4 }} />
              <motion.path d="M17.8 2.4 L 23.6 6.7 L 18.4 11.3" initial={quiet ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.2, ease: [0.65, 0, 0.35, 1], delay: 0.78 }} />
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
  const chip = 'h-6 min-w-6 rounded-[0.3em] border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground'
  // Two caps fit beside the words; a longer chord is one chip, so the button stays one line.
  return caps.length > 2 ? <Kbd className={`${chip} px-2`}>{caps.join('')}</Kbd> : <>{caps.map((key, i) => <Kbd key={i} className={chip}>{key}</Kbd>)}</>
}

/**
 * Behind it all: the scenery the empty Inbox uses, dimmed for reading and
 * standing still, under a film of grain. With no scenery, the grain
 * on the page's own colour.
 */
/**
 * Which background the welcome wears: "grainient", the flowing gradient in the
 * theme's own colours (React Bits' Grainient, stirred by the pointer), or
 * "paper", the still marks on the theme's own page it had before. One word
 * here to go back.
 */
const WELCOME_BACKGROUND: 'grainient' | 'paper' = 'grainient'

/** After a scene: the page as a panel over the fog, solid under the words and thinning out to the right (Dia's panel). */
const SCENE_PANEL = 'linear-gradient(90deg, var(--background) 0%, var(--background) 50%, color-mix(in oklab, var(--background) 80%, transparent) 61%, color-mix(in oklab, var(--background) 42%, transparent) 76%, color-mix(in oklab, var(--background) 12%, transparent) 91%, transparent 100%)'

/**
 * `arrival` counts the arrivals played; `arriving` is true while one is on; `onBloomed` once its gradient is whole.
 * `desk`: this arrival came as a scene over the desktop (welcome-scene.tsx), so the page has no spark or
 * bloom of its own; `held` while the page is not seen yet (the mist still over the desktop): its gradient draws nothing.
 */
export function Backdrop({ family, page, arrival = 0, arriving = false, desk = false, held = false, onBloomed }: { family: Family; page: number; arrival?: number; arriving?: boolean; desk?: boolean; held?: boolean; onBloomed?: () => void }): React.JSX.Element {
  if (WELCOME_BACKGROUND === 'grainient') return <GrainBackdrop page={page} arrival={arrival} arriving={arriving} desk={desk} held={held} onBloomed={onBloomed} />
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* No painting: under the words it had to be veiled for reading, which hid it on most themes and showed it on a few.
          The welcome is paper, its leaves and its mist, alike under every theme. */}
      <div className="absolute inset-0 opacity-[0.035] mix-blend-overlay" style={{ backgroundImage: NOISE, backgroundSize: '160px' }} />
      {/* One quiet family of marks a chapter, over the scenery and under the words (welcome-backdrop.tsx). */}
      <WelcomeBackdrop family={family} />
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_100%,color-mix(in_oklab,var(--background)_70%,transparent),transparent_70%)]" />
    </div>
  )
}

/**
 * The gradient behind the welcome, in the worn theme's own colours: its page
 * first, so the edges are the page, then its accent deep, mid and full, and a
 * light touch of it last. On a light theme the accent comes in paler and less
 * saturated, so the page stays calm and the words stay dark on light. A veil
 * of the page's own colour toward the words' side keeps them first to read.
 * Each turn of the page stirs it once, toward the words.
 */
/** Whether the theme worn is a light one, followed as it changes (the welcome's own dial changes it). */
// Read off the words' own colour, the one thing the gradient must suit: dark words want the light version. A theme's
// class name, or even its light flag, can say otherwise (a dark custom theme over a paper class).
const lightRead = (): boolean => {
  const [r, g, b] = (getComputedStyle(document.body).color.match(/[\d.]+/g) ?? ['255', '255', '255']).map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
}
/**
 * The theme's colours are read off the page, which makes the browser work out its styles: done on every render (twice
 * a render in development), it froze the window. So they are read once and kept until the theme itself changes: the
 * root's class, style or theme flags, or a theme's own rules in the head (an imported theme's style tag). One watcher
 * for the whole window, made on first use and kept, so a kept value is never stale.
 */
const kept: { light?: boolean; palette?: string[] } = {}
const told = new Set<() => void>()
let watching = false
const forget = (): void => {
  kept.light = undefined
  kept.palette = undefined
  for (const one of [...told]) one()
}
const watchOnce = (): void => {
  if (watching) return
  watching = true
  // In the head only the imported themes' own tag (lib/theme.ts): other style tags come and go there (a page turn
  // adds and takes one away), which would read the colours again for nothing.
  const themed = (node: Node | null): boolean => !!node && (node instanceof Element ? node : node.parentElement)?.closest('#mf-custom-themes') != null
  const watch = new MutationObserver((changes) => {
    if (changes.some((one) => one.type === 'attributes' || themed(one.target) || [...one.addedNodes, ...one.removedNodes].some(themed))) forget()
  })
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-light', 'data-theme'] })
  watch.observe(document.head, { childList: true, subtree: true, characterData: true })
}
const watchTheme = (changed: () => void): (() => void) => {
  watchOnce()
  told.add(changed)
  return () => void told.delete(changed)
}
const lightNow = (): boolean => (watchOnce(), (kept.light ??= lightRead()))
const unwatched = (): (() => void) => () => undefined
const notRead = (): boolean => false
/** `on` false (the welcome closed): nothing is read or watched, so a render of Home costs no style pass. */
const useLightTheme = (on = true): boolean => useSyncExternalStore(on ? watchTheme : unwatched, on ? lightNow : notRead)

/** A colour as the page works it out, mixes and all, in oklab's words ("oklab(0.6 0.1 0.05)"), which the gradient reads. */
const resolve = (color: string): string => {
  const probe = document.createElement('i')
  probe.style.display = 'none'
  probe.style.color = `color-mix(in oklab, ${color} 100%, transparent 0%)`
  document.body.append(probe)
  const said = getComputedStyle(probe).color
  probe.remove()
  return said
}
/**
 * The gradient's colours, joined in one line so a theme change is one new
 * value: the theme's page at the edges, then the logo's own gold and bronze
 * (build/logo), whatever the theme or the book's colour, so every welcome is
 * an old book: gilt on leather on a dark theme, foxed parchment on a light one.
 */
const GOLD = '#C9961C'
const GILT = '#F2C24A'
const paletteRead = (): string[] => {
  const mix = (share: number, other = 'var(--background)', ink = GOLD): string => resolve(`color-mix(in oklab, ${ink} ${share}%, ${other})`)
  // Light: the gold no more than half in, its brightest a wash of gilt on white. Dark: bronze deepening from the page up to the gold, its brightest the gilt.
  const colours = lightNow()
    ? [resolve('var(--background)'), mix(12), mix(26), mix(42), mix(24, 'white', GILT)]
    : [resolve('var(--background)'), mix(28), mix(60), resolve(GOLD), mix(80, 'var(--background)', GILT)]
  return colours
}
/** The same list until the theme changes, so a render reads nothing and the gradient is handed the same colours. */
const paletteNow = (): string[] => (watchOnce(), (kept.palette ??= paletteRead()))
const usePalette = (): string[] => useSyncExternalStore(watchTheme, paletteNow)

/**
 * The spark the arrival's light comes from, as Arc's opening has it: a tiny, very bright point that pops in at the
 * centre of the dark with a soft halo, and glimmers there (never pulsing in and out), its halo slowly gathering as
 * if something were building. A breath before the burst it draws in, a quick squeeze, and then lets go: a flash,
 * the halo rolling out ahead of the gradient, the point staying bright at the heart of it until the light has
 * reached the edges, then gone into it. On the glow's own clock (grainient.tsx), all transform and opacity.
 *
 * Played by the browser itself (Web Animations, on the compositor): each part is drawn once and only moved and faded
 * after. Stepped by the page's frames instead (motion's `scale`), the halo was painted afresh every frame as it grew to
 * twelve times its size, and frames dropped from the moment the spark came. `onDone` once it has gone into the light.
 */
// Points in the intro (0 to 1, the glow's own `opened`): in, the long glimmer, gathering, the squeeze, the release.
const SPARK_AT = [0, 0.05, 0.2, 0.34, 0.48, SPARK_HOLD - 0.06, SPARK_HOLD - 0.015, SPARK_HOLD, SPARK_HOLD + 0.12, 0.94, 1]
const sparkFrames = (opacity: number[], scale: number[]): Keyframe[] => SPARK_AT.map((offset, i) => ({ offset, opacity: opacity[i], transform: `scale(${scale[i]})`, easing: 'ease-in-out' }))
const HALO = sparkFrames([0, 0.45, 0.5, 0.55, 0.62, 0.85, 0.7, 1, 0.75, 0.3, 0], [0.3, 0.8, 0.85, 0.9, 0.98, 1.25, 1, 2.2, 7, 11, 12])
const CORE = sparkFrames([0, 1, 0.9, 1, 0.92, 1, 1, 1, 1, 0.9, 0], [0.2, 1, 0.94, 1.05, 0.97, 1.12, 0.7, 2.1, 1.6, 1.3, 1])
/** Over the desktop: whole in the middle, given out before the screen's edges (an oval to the window's own sides). */
const SPARK_IN_MIST = 'radial-gradient(closest-side, black 45%, transparent)'
function IntroSpark({ onDone, inMist = false }: { onDone?: () => void; inMist?: boolean }): React.JSX.Element {
  const halo = useRef<HTMLSpanElement>(null)
  const core = useRef<HTMLSpanElement>(null)
  const done = useRef(onDone)
  done.current = onDone
  useLayoutEffect(() => {
    const timing: KeyframeAnimationOptions = { delay: INTRO_DELAY * 1000, duration: INTRO_SECONDS * 1000, fill: 'both' }
    const glow = halo.current?.animate(HALO, timing)
    const point = core.current?.animate(CORE, timing)
    void glow?.finished.then(() => done.current?.(), () => undefined)
    return () => (glow?.cancel(), point?.cancel())
  }, [])
  return (
    // In the mist over the desktop (`inMist`) its light gives out before the screen's edges, as the mist does: rolled out
    // to the edge at its burst, it read as a sheet's edge over the desktop (6% at the screen's top on a 1080-high screen).
    <span aria-hidden data-intro-spark className="pointer-events-none absolute inset-0 z-[1] grid place-items-center mix-blend-screen"
      style={inMist ? { maskImage: SPARK_IN_MIST, WebkitMaskImage: SPARK_IN_MIST } : undefined}>
      {/* The halo: wide and soft, gathering through the hold, then rolling out ahead of the light. */}
      <span ref={halo} className="col-start-1 row-start-1 size-40 shrink-0 rounded-full opacity-0"
        style={{ background: 'radial-gradient(circle, rgb(255 233 168 / 0.55) 0%, rgb(250 189 47 / 0.22) 35%, rgb(250 189 47 / 0.06) 60%, transparent 72%)' }} />
      {/* The point itself: a hot white-gold core, glimmering slightly, squeezed and then flashing as it lets go. */}
      <span ref={core} className="col-start-1 row-start-1 size-[7px] rounded-full bg-[#fffaf0] opacity-0"
        style={{ boxShadow: '0 0 6px 2px rgb(255 240 200 / 0.95), 0 0 18px 6px rgb(250 189 47 / 0.55), 0 0 42px 14px rgb(250 189 47 / 0.22)' }} />
    </span>
  )
}

function GrainBackdrop({ page, arrival, arriving, desk, held, onBloomed }: { page: number; arrival: number; arriving: boolean; desk: boolean; held: boolean; onBloomed?: () => void }): React.JSX.Element {
  const light = useLightTheme()
  const colours = usePalette()
  const grain = useRef<GrainientHandle>(null)
  // A page turned: one slow swirl toward the words' side, the way it went. Not on the first page shown, nor with motion off.
  const was = useRef(page)
  useEffect(() => {
    if (was.current === page) return
    const forward = page > was.current
    was.current = page
    if (page < 0 || still()) return
    grain.current?.nudge(0.38, 0.45, forward ? -1 : 1)
  }, [page])
  return (
    <div aria-hidden className="absolute inset-0">
      {/* A new canvas for each arrival, so each one blooms from the page's colour; skipped, it is whole at once. */}
      {/* Out of the desktop the spark is in the mist (welcome.tsx), and the gradient is whole when the page comes up under it. */}
      {arriving && !desk && !still() && <IntroSpark key={`spark-${arrival}`} />}
      {/* Its grain creeps a pixel at a time, as sand slides (grainient.tsx), instead of reshuffling every frame, which read as running. */}
      <Grainient key={arrival} ref={grain} intro={arriving && !desk} paused={held} onIntroDone={onBloomed} colors={colours} angle={55} speed={1.32} flow={0.8} silk={light ? 0.2 : 0.35} saturation={light ? 0.8 : 1} grainAmount={light ? 0.06 : 0.08} />
      {/* The veil toward the words' side: not over the arrival, which fills the whole window as Arc's does, then in as the first words come. */}
      <div className={`pointer-events-none absolute inset-0 transition-opacity duration-[1600ms] ${arriving ? 'opacity-0' : 'opacity-100'} bg-[linear-gradient(90deg,color-mix(in_oklab,var(--background)_55%,transparent)_0%,color-mix(in_oklab,var(--background)_30%,transparent)_45%,transparent_80%)]`} />
      {/* On a dark theme the gradient's bright end sits under light words and cards: a film of the page's colour over all of it. */}
      {!light && <div className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--background)_20%,transparent)]" />}
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
      <span className="text-[0.75rem] font-medium whitespace-nowrap">{APP_NAME} is up here</span>
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
export const BODY = 'max-w-[32ch] text-[clamp(1.0625rem,min(2.5vw,3.6vh),1.75rem)] leading-[1.4] text-pretty text-(--mf-wl-body)'
export const QUIET = 'text-[clamp(0.9375rem,min(2.2vw,3.2vh),1.5rem)] leading-snug text-(--mf-wl-quiet)'
/** Keys inside a line of the larger type: sized to it, not to the app's small caps. */
const LINE_KEY = 'h-[1.3em] min-w-[1.3em] rounded-[0.3em] px-[0.3em] text-[0.62em]'
/** A way past a page, beside the one accent button: quiet until pointed at. */
const QUIET_BUTTON = 'flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center gap-2 rounded-[0.6rem] px-3 text-[clamp(0.8125rem,1.8vmin,1rem)] text-(--mf-wl-quiet) transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]'

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
  // In the sandbox the notes are someone else's, to try things on: said as theirs, never as clutter in yours.
  if (SANDBOX) return 'This is someone else’s book, full of their notes to try things on. Yours stay apart.'
  return `${kept < 10 ? counted(kept) : kept} ${kept === 1 ? 'note' : 'notes'} in it already.`
}

/**
 * The end: a decision already made for you, with two other ways round it.
 * Your book is ready and Start opens it; the sandbox and your old notes are
 * two cards under it, each saying in a line what it does (2 and 3 on the
 * keys, and Tab reaches them). Nothing else asks for a choice on the way out. The
 * arrow at the top of the window points at Haligtree in the menu bar, so the
 * words do not have to.
 */
function Start({ state, onState, name, kept, mine, skipped, importing, still, onPick, setup, onImport }: { state: Onboarding | null; onState: (now: Onboarding) => void; name: string; kept: number; /** How many of them were written in the welcome itself. */ mine: number; skipped: false | 'first' | 'later'; importing: boolean; still: boolean; onPick: (pick: 1 | 2 | 3) => void; setup: Setup; onImport: (what: 'vault' | 'files' | 'apple-notes') => void }): React.JSX.Element {
  useKeyChanges()
  const from = sourceFrom(setup.from)
  // The goal the answers made, only while it is still open in the book: binned, archived or ended since, it is not said.
  const goals = useLive(() => haligtree.items('goal'), [] as Item[], [], ['item'])
  const goalOpen = !unloaded(goals) && goals.some((one) => one.id === setup.made?.goalId && !one.archivedAt && !one.closedAt)
  // ⌘. taken by another app, and Catch skipped past or left with it still taken: Catch's own
  // picker here, kept once shown so its "Done" stays in sight, and the line under it says the key chosen.
  const [picking, setPicking] = useState(false)
  useEffect(() => void (state?.boxTaken && setPicking(true)), [state?.boxTaken])
  // The sandbox is the way we point a newcomer: it is marked, tinted and says why. Start still opens their own book.
  const others: { key: 2 | 3; title: string; line: string; icon: typeof Compass; best?: boolean }[] = [
    { key: 2, title: 'Try it in someone else’s book first', line: `The best way to see what ${APP_NAME} does. Their notes stay apart from yours; try anything, and “Back to my notes” takes you home.`, icon: Compass, best: true },
    // Named for the app you said you came from, when Haligtree can bring things in from it.
    { key: 3, title: from && from !== 'Other files' ? `Bring my notes from ${from}` : 'Bring my notes', line: 'From Apple Notes, Obsidian, Notion, Anki or files. See what each thing becomes before you choose.', icon: FolderInput }
  ]
  return (
    // The page with the most on it: its headline and gaps a smaller share of the height than the other pages', so its two
    // choices stand whole above the footer at every size the welcome takes (they were cut, 15 Nov 2026; a taller window
    // alone did not do it, the words growing with it).
    <div className="my-auto mr-auto flex w-full max-w-[58rem] flex-col gap-[clamp(1rem,3vh,2rem)] overflow-y-auto">
      <div className="flex flex-col gap-[clamp(0.5rem,1.8vh,1rem)]">
        <p data-tagline className={`${BODY} font-semibold text-foreground`}>{TAGLINE}</p>
        <h1 className={`${HEADLINE_XL.replace('text-[clamp(2.25rem,min(5.6vw,8.4vh),5.25rem)]', 'text-[clamp(2.25rem,min(5.6vw,6.4vh),4.5rem)]')} max-w-[14ch]`}><Rise text={name ? `Your commonplace book is ready, ${name}.` : 'Your commonplace book is ready.'} still={still} /></h1>
        {!state?.boxTaken && <p data-start-kept className={`${BODY} max-w-[30ch]`}>{kept ? <>{keptSaid(kept, mine)} <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> adds the next, from any app.</> : <>Press <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> from any app to save your first note.</>}</p>}
        {picking && <div data-start-key-picker className={`${BODY} max-w-[48ch]`}><KeyPicker taken={!!state?.boxTaken} onState={onState} /></div>}
        {setup.made?.goalId && setup.made.goalTitle && setup.made.goalBy && goalOpen && (
          <p data-start-goal className={`${WHERE_SAID} max-w-[48ch]`}><span className="font-medium text-foreground">{quoted(setup.made.goalTitle, 80)}</span> is on your Goals page, {dayjs(setup.made.goalBy).diff(dayjs().startOf('day'), 'day')} days to go.</p>
        )}
        <p data-start-where className={WHERE_SAID}>{WHERE_TRUE}</p>
        {skipped && <p role="status" className={`${QUIET} max-w-[48ch]`}>The welcome waits in the {APP_NAME} menu and ⌘K.</p>}
      </div>
      {importing ? <ImportMap start={from} onImport={onImport} still={still} /> : (
        // The other two ways in, as choices you can see at a glance: a card each, its key with it.
        <div data-start-choices className="grid w-full max-w-[48rem] grid-cols-2 gap-3 [@container(max-width:640px)]:grid-cols-1">
          {others.map((row, i) => {
            const Icon = row.icon
            return (
              <motion.button key={row.key} type="button" data-choice={row.key} data-recommended={row.best || undefined} onClick={() => onPick(row.key)}
                initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: ENTER, delay: still ? 0 : 0.35 + i * 0.08 }}
                // Both cards alike: one tinted and ringed read as already chosen, so "Open my book" seemed to start it. Its badge says which is recommended.
                className={`relative group flex items-start gap-3 rounded-xl border border-foreground/12 bg-popover px-4 py-3.5 hover:border-foreground/25 hover:bg-[color-mix(in_oklab,var(--foreground)_3%,var(--popover))] text-left text-popover-foreground shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_10%,transparent)] transition-[background-color,border-color,box-shadow,scale] duration-200 ease-(--mf-ease) hover:shadow-(--mf-panel-shadow) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98]`}>
                {/* Now and then a light goes once round the recommended card's edge: a nudge, never a glow that stays. */}
                {row.best && !still && <span aria-hidden data-recommended-beam className="mf-beam mf-beam-card mf-beam-again" />}
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.9} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {row.best && <span data-recommended-mark className="w-fit rounded-full bg-primary px-2 py-0.5 text-[0.8125rem] leading-4 font-semibold text-primary-foreground">Recommended</span>}
                  <span className="text-[clamp(1rem,min(1.7vw,2.4vh),1.1875rem)] leading-snug font-semibold text-foreground">{row.title}</span>
                  <span className="text-[clamp(0.9375rem,min(1.5vw,2.1vh),1.0625rem)] leading-snug text-(--mf-wl-body)">{row.line}</span>
                </span>
                <Kbd className="mt-0.5 h-6 min-w-6 shrink-0">{row.key - 1}</Kbd>
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


/**
 * In the sandbox, a welcome asked for from your own book (lib/onboarding.ts,
 * tryWelcome) plays once on arrival, after the examples are set out. Each
 * ask plays once: a later start of the sandbox does not play it again.
 */
const PLAYED = 'welcome-carried-at'
const played = (): string | null => {
  try {
    return localStorage.getItem(PLAYED)
  } catch {
    return null
  }
}
function useCarriedWelcome(): void {
  useEffect(() => {
    if (!SANDBOX) return
    let gone = false
    void (async () => {
      const carry = await window.api.haligtree<Carry | null>('sandbox:carry').catch(() => null)
      const asked = carry?.welcome
      if (!asked || played() === String(asked.at)) return
      // The examples are set out first, a minute at most, so the welcome never covers a half-made book.
      for (let waited = 0; !gone && waited < 60000; waited += 300) {
        if ((await sandboxState().catch(() => null))?.seeded) break
        await new Promise((wait) => setTimeout(wait, 300))
      }
      // Marked played only as it plays: a first mount undone at once (React's StrictMode, in a dev build) leaves it to the second.
      if (gone || played() === String(asked.at)) return
      try {
        localStorage.setItem(PLAYED, String(asked.at))
      } catch {
        // Played anyway: once more is the worst of it.
      }
      window.dispatchEvent(new CustomEvent('haligtree:welcome'))
    })()
    return () => void (gone = true)
  }, [])
}
