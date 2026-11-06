import { hum, paper, saberLength } from './sound'
import { haligtree } from './haligtree'
import { EASING, still } from '@/lib/motion'
import type { BarStyle } from '@/components/haligtree/progress-bar'

/**
 * The sandbox, as a window sees it: someone else's book to look around, in a data
 * folder of its own (see src/main/sandbox.ts). Every window of the sandbox
 * is told so in its address, so this is known before anything renders.
 */
export const SANDBOX = new URLSearchParams(location.search).has('sandbox')

/**
 * What comes along into the sandbox: how Haligtree feels to you (sounds, motion,
 * your keys, margin marks, the sizes you read at, your progress bars) and
 * your celebrations, the GIFs and pictures that make a milestone yours. Its
 * scenery stays its own public-domain landscapes (SandboxHost): the book is someone else's.
 */
const CARRY_SETTINGS = ['motion', 'sounds', 'volume', 'soundPack', 'keys', 'marks', 'textSize', 'interfaceSize', 'progressBars', 'celebrationsFolder', 'celebrationPicks', 'celebrationSources', 'giphyKey', 'giphyWords', 'giphyStars', 'giphyPins', 'inRecordings'] as const
/**
 * Your celebrations, worn again on every visit, not only the first: a sandbox
 * set out before you turned on Giphy (or chose new files) kept playing the old
 * ones, since the rest of the carry is only worn when the sandbox is set out.
 */
export const CARRY_CELEBRATIONS = ['celebrationsFolder', 'celebrationPicks', 'celebrationSources', 'giphyKey', 'giphyWords', 'giphyStars', 'giphyPins'] as const
/** And from the window's own storage: the theme and Vim. Which windows show in screen recordings comes as a setting (inRecordings). */
const CARRY_LOCAL = ['theme', 'custom-themes', 'style', 'vim'] as const

export type Carry = { local: Record<string, string>; settings: Record<string, unknown>; /** The book you came from: the welcome, played here, shows its name and card, never saving to it. */ book?: { name: string; seed?: number }; /** A welcome asked for, to play on arrival; `at` tells one ask from the next. */ welcome?: { at: number } }

/** The blade's curves. Lit: fast out of the hilt, then settling as the hum does. Put away: quick to answer too (never a slow-starting curve, which held the blade still just as you watch it). */
export const SABER_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
const SABER_IN = EASING
/** A line or the dinosaur has no recording to keep time with. */
const QUIET_MS = 700

/** What the overlay is told: its words, which way the blade goes, for how long (-1, not known yet), and the bars of the book being gone to. */
export type Going = { text: string; up: boolean; ms: number; bars?: BarStyle }

/** Each moment, newest last: what the QA runs read to see one ran, and how long its sound and bar took. */
type Swung = { up: boolean; text: string; soundMs: number; bladeMs: number | null; blade: boolean; bars: BarStyle }
const swung: Swung[] = []
;(window as unknown as { haligtreeSaber?: Swung[] }).haligtreeSaber = swung

/** A frame, or a moment when the window is hidden and frames do not come. */
const frame = (): Promise<void> => new Promise((done) => (requestAnimationFrame(() => done()), setTimeout(done, 60)))
/** Once the window is on screen (asked for from the menu bar, it is still coming up), two seconds at most. */
async function onScreen(): Promise<void> {
  for (const until = Date.now() + 2000; Date.now() < until; await new Promise((wait) => setTimeout(wait, 30)))
    if (await window.api.isShown?.().catch(() => true) ?? true) return
}

/** The bars a book draws: its own, or null for a book not set out yet, which will wear yours. */
export const barsOf = (book?: string): Promise<BarStyle | null> => window.api.haligtree<BarStyle | null>('books:bars', book).catch(() => null)

/**
 * The one way of going to another book (into or out of the sandbox, starting
 * it over): the words over the window and, under them, a bar in the style the
 * book you are going to draws. A lightsaber is lit or put away, its recording
 * the clock so the sound never ends before the blade; any other bar simply
 * fills. With Motion off there is no bar, but the moment lasts as long; Sounds
 * and the volume decide whether it is heard.
 */
async function moment(up: boolean, text: string, going: Promise<BarStyle | null>): Promise<void> {
  // The screen goes up on this very frame, before anything is read: the page
  // it leaves (the welcome) is never followed by a glimpse of the one under it.
  const say = (ms: number, bars?: BarStyle): boolean => window.dispatchEvent(new CustomEvent<Going>('haligtree:going', { detail: { text, up, ms, bars } }))
  say(-1)
  const bars = (await going) ?? (document.documentElement.dataset.bars as BarStyle | undefined) ?? 'line'
  const saber = bars === 'saber'
  const ms = saber ? await saberLength(up) : QUIET_MS
  say(ms, bars)
  // The overlay drawn, bar at rest, on screen, before anything starts: the
  // sound never plays over a window not yet seen (a blank screen humming).
  await onScreen()
  await frame()
  await frame()
  const fill = still() ? null : document.querySelector<HTMLElement>('[data-going] [data-bar-fill]')
  const seen: Swung = { up, text, soundMs: ms, bladeMs: null, blade: !!fill, bars }
  swung.push(seen)
  if (saber) hum(up)
  else paper('slide')
  if (fill) {
    const begun = performance.now()
    const away = saber ? 'translateX(calc(-100% - 16px))' : bars === 'dino' ? 'translateX(0)' : 'translateX(-100%)'
    const whole = bars === 'dino' ? 'translateX(100%)' : 'translateX(0)'
    const grow = !saber || up
    const run = fill.animate([{ transform: grow ? away : whole }, { transform: grow ? whole : away }], { duration: ms, easing: saber && !up ? SABER_IN : SABER_OUT, fill: 'forwards' })
    void run.finished.then(() => void (seen.bladeMs = Math.round(performance.now() - begun))).catch(() => undefined)
  }
  await new Promise((done) => setTimeout(done, ms))
}
/** Going somewhere: the blade lit, if the book there draws one. */
export const momentOn = (text: string, going: Promise<BarStyle | null>): Promise<void> => moment(true, text, going)
/** Coming back: the blade put away, if the book there draws one. */
export const momentOff = (text: string, going: Promise<BarStyle | null>): Promise<void> => moment(false, text, going)

/** Your look, written down to carry: into the sandbox, or into another book with `more` (its scenery too). */
export async function gatherCarry(more: readonly string[] = []): Promise<Carry> {
  const settings = (await haligtree.settings()) as unknown as Record<string, unknown>
  // Celebration files you chose yourself, never the ones a run from source adds for the developer.
  if ('ownPicks' in settings) settings.celebrationPicks = settings.ownPicks
  const local: Record<string, string> = {}
  for (const key of CARRY_LOCAL) {
    try {
      const value = localStorage.getItem(key)
      if (value !== null) local[key] = value
    } catch {
      // Not carried: it starts on its own default.
    }
  }
  return { local, settings: Object.fromEntries([...CARRY_SETTINGS, ...more].filter((key) => key in settings).map((key) => [key, settings[key]])) }
}

/**
 * Into the sandbox: your look written down for it, then Haligtree starts again
 * there. The onboarding's last screen calls this; so do Settings, ⌘K, the
 * Haligtree menu and the menu bar.
 */
let opening = false
export async function enterSandbox({ welcome }: { /** A welcome to play once there (lib/onboarding.ts, tryWelcome). */ welcome?: boolean } = {}): Promise<void> {
  // Once: a second press while the screen is up does not start it again.
  if (SANDBOX || opening) return
  opening = true
  try {
    // Up at once: your look is gathered behind it.
    const said = momentOn('Opening the sandbox', barsOf('sandbox'))
    const [look, here, mine] = await Promise.all([gatherCarry(), window.api.haligtree<{ name: string }>('books:list'), haligtree.settings()])
    const carry: Carry = { ...look, book: { name: here.name, seed: mine.readerSeed }, ...(welcome ? { welcome: { at: Date.now() } } : {}) }
    await said
    await window.api.haligtree('sandbox:enter', carry)
  } catch (error) {
    opening = false
    throw error
  }
}

/** Back to your notes. Anything you caught in the sandbox is offered there. */
export async function leaveSandbox(): Promise<void> {
  if (!SANDBOX) return
  const now = new Date()
  // At 11:11 exactly, one more line.
  const wish = now.getHours() % 12 === 11 && now.getMinutes() === 11 ? '. Make a wish' : ''
  await momentOff(`Back to your notes${wish}`, barsOf())
  await window.api.haligtree('sandbox:leave')
}

/**
 * Asked for from ⌘K, the Haligtree menu, the menu bar or an old example's
 * Freshen: the pill up top asks, and Start over there is held, since nothing
 * brings back what was there.
 */
export async function resetSandbox(): Promise<void> {
  window.dispatchEvent(new CustomEvent('haligtree:sandbox-reset'))
}

/** The sandbox as it began: its folder cleared, and the examples set out again. Only from a held button. */
export async function startSandboxOver(): Promise<void> {
  if (!SANDBOX) return
  // Set out again from what you carried in, so it draws those bars.
  const carry = await window.api.haligtree<Carry | null>('sandbox:carry').catch(() => null)
  await momentOn('Starting the sandbox over', Promise.resolve((carry?.settings.progressBars as BarStyle | undefined) ?? null))
  await window.api.haligtree('sandbox:reset')
}

type SandboxState = { on: boolean; seeded: boolean; seededOn: string | null }
export const sandboxState = (): Promise<SandboxState> => window.api.haligtree<SandboxState>('sandbox:state')
