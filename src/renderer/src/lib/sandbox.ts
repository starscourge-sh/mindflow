import { hum, saberLength } from './sound'
import { vigil } from './vigil'
import { still } from '@/lib/motion'

/**
 * The sandbox, as a window sees it: someone else's book to look around, in a data
 * folder of its own (see src/main/sandbox.ts). Every window of the sandbox
 * is told so in its address, so this is known before anything renders.
 */
export const SANDBOX = new URLSearchParams(location.search).has('sandbox')

/**
 * What comes along into the sandbox: how Vigil feels to you (sounds, motion,
 * your keys, margin marks, the sizes you read at, your progress bars) and
 * your celebrations, the GIFs and pictures that make a milestone yours. Its
 * scenery stays its own public-domain landscapes, and its bars are always
 * lightsabers, whatever yours are (SandboxHost): the book is someone else's.
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

export type Carry = { local: Record<string, string>; settings: Record<string, unknown> }

/** The blade's curves. Lit: fast out of the hilt, then settling as the hum does. Put away: quick to answer too (never a slow-starting curve, which held the blade still just as you watch it). */
export const SABER_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
export const SABER_IN = 'cubic-bezier(0.23, 1, 0.32, 1)'

/** What the overlay is told: its words, which way the blade goes, and for how long. */
export type Going = { text: string; up: boolean; ms: number }

/** Each saber moment, newest last: what the QA runs read to see one ran, and how long its sound and blade took. */
type Swung = { up: boolean; text: string; soundMs: number; bladeMs: number | null; blade: boolean }
const swung: Swung[] = []
;(window as unknown as { vigilSaber?: Swung[] }).vigilSaber = swung

/** A frame, or a moment when the window is hidden and frames do not come. */
const frame = (): Promise<void> => new Promise((done) => (requestAnimationFrame(() => done()), setTimeout(done, 60)))

/**
 * The one way the saber is lit or put away, wherever it happens (into or out
 * of the sandbox, starting it over, another book): the words over the
 * window, the blade, and its sound, started on the same frame. The sound is
 * the clock: the blade runs exactly as long as the decoded recording, so the
 * sound never ends before it does. With Motion off there is no blade, but
 * the moment lasts as long; Sounds and the volume decide whether it is heard.
 */
async function saber(up: boolean, text: string): Promise<void> {
  // The screen goes up on this very frame, before the sound is even read: the
  // page it leaves (the welcome) is never followed by a glimpse of the one
  // under it. Its length (-1, not known yet) follows once the sound says.
  const going = (ms: number): boolean => window.dispatchEvent(new CustomEvent<Going>('vigil:going', { detail: { text, up, ms } }))
  going(-1)
  const ms = await saberLength(up)
  going(ms)
  // The overlay drawn, blade at rest, before anything starts.
  await frame()
  await frame()
  const calm = still()
  const blade = calm ? null : document.querySelector<HTMLElement>('[data-going] .pb-blade > span')
  const seen: Swung = { up, text, soundMs: ms, bladeMs: null, blade: !!blade }
  swung.push(seen)
  hum(up)
  if (blade) {
    const begun = performance.now()
    const away = 'translateX(calc(-100% - 16px))'
    const run = blade.animate([{ transform: up ? away : 'translateX(0)' }, { transform: up ? 'translateX(0)' : away }], { duration: ms, easing: up ? SABER_OUT : SABER_IN, fill: 'forwards' })
    void run.finished.then(() => void (seen.bladeMs = Math.round(performance.now() - begun))).catch(() => undefined)
  }
  await new Promise((done) => setTimeout(done, ms))
}
/** The blade lit, with its sound. */
export const saberOn = (text: string): Promise<void> => saber(true, text)
/** The blade put away, with its sound. */
export const saberOff = (text: string): Promise<void> => saber(false, text)

/** Your look, written down to carry: into the sandbox, or into another book with `more` (its scenery too). */
export async function gatherCarry(more: readonly string[] = []): Promise<Carry> {
  const settings = (await vigil.settings()) as unknown as Record<string, unknown>
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
 * Into the sandbox: your look written down for it, then Vigil starts again
 * there. The onboarding's last screen calls this; so do Settings, ⌘K, the
 * Vigil menu and the menu bar.
 */
let opening = false
export async function enterSandbox(): Promise<void> {
  // Once: a second press while the screen is up does not start it again.
  if (SANDBOX || opening) return
  opening = true
  try {
    // Up at once: your look is gathered behind it.
    const said = saberOn('Opening the sandbox')
    const carry = await gatherCarry()
    await said
    await window.api.vigil('sandbox:enter', carry)
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
  await saberOff(`Back to your notes${wish}`)
  await window.api.vigil('sandbox:leave')
}

/**
 * Asked for from ⌘K, the Vigil menu, the menu bar or an old example's
 * Freshen: the pill up top asks, and Start over there is held, since nothing
 * brings back what was there.
 */
export async function resetSandbox(): Promise<void> {
  window.dispatchEvent(new CustomEvent('vigil:sandbox-reset'))
}

/** The sandbox as it began: its folder cleared, and the examples set out again. Only from a held button. */
export async function startSandboxOver(): Promise<void> {
  if (!SANDBOX) return
  await saberOn('Starting the sandbox over')
  await window.api.vigil('sandbox:reset')
}

export type SandboxState = { on: boolean; seeded: boolean; seededOn: string | null }
export const sandboxState = (): Promise<SandboxState> => window.api.vigil('sandbox:state') as Promise<SandboxState>
