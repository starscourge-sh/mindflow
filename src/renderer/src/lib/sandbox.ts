import { chime, hum } from './sound'
import { vigil } from './vigil'

/**
 * The sandbox, as a window sees it: a practice copy of Vigil in a data
 * folder of its own (see src/main/sandbox.ts). Every window of the sandbox
 * is told so in its address, so this is known before anything renders.
 */
export const SANDBOX = new URLSearchParams(location.search).has('sandbox')

/**
 * What comes along into the sandbox: how Vigil feels to you (sounds, motion,
 * your keys, margin marks, the sizes you read at, your progress bars) and
 * your celebrations, the GIFs and pictures that make a milestone yours. Its
 * scenery stays its own public-domain landscapes.
 */
const CARRY_SETTINGS = ['motion', 'sounds', 'volume', 'soundPack', 'keys', 'marks', 'textSize', 'interfaceSize', 'progressBars', 'celebrationsFolder', 'celebrationPicks', 'giphy', 'giphyKey', 'giphyWords', 'giphyStars'] as const
/** And from the window's own storage: the theme, Vim, and whether Vigil shows in screen recordings. */
const CARRY_LOCAL = ['theme', 'custom-themes', 'frosted', 'style', 'recordable', 'vim'] as const

export type Carry = { local: Record<string, string>; settings: Record<string, unknown> }

/** How long the blade takes to light across, before the restart. */
export const GOING_MS = 2200

/**
 * Said over the whole window, a blade lighting across as Vigil gets ready,
 * then the restart. Over everything, so what lies under it (an empty Home
 * behind a closing welcome) never flashes up first.
 */
export const going = (text: string, sound: () => void): Promise<void> => {
  sound()
  window.dispatchEvent(new CustomEvent('vigil:going', { detail: text }))
  return new Promise((done) => setTimeout(done, GOING_MS))
}

/** Your look, written down to carry: into the sandbox, or into another book with `more` (its scenery too). */
export async function gatherCarry(more: readonly string[] = []): Promise<Carry> {
  const settings = (await vigil.settings()) as unknown as Record<string, unknown>
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
export async function enterSandbox(): Promise<void> {
  if (SANDBOX) return
  // Up at once: your look is gathered behind it.
  const said = going('Opening the sandbox', () => hum(true))
  const carry = await gatherCarry()
  await said
  await window.api.vigil('sandbox:enter', carry)
}

/** Back to your notes. Anything you caught in the sandbox is offered there. */
export async function leaveSandbox(): Promise<void> {
  if (!SANDBOX) return
  const now = new Date()
  // At 11:11 exactly, one more line.
  const wish = now.getHours() % 12 === 11 && now.getMinutes() === 11 ? '. Make a wish' : ''
  await going(`Back to your notes${wish}`, () => hum(false))
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
  await going('Starting the sandbox over', () => chime('rewind'))
  await window.api.vigil('sandbox:reset')
}

export type SandboxState = { on: boolean; seeded: boolean; seededOn: string | null }
export const sandboxState = (): Promise<SandboxState> => window.api.vigil('sandbox:state') as Promise<SandboxState>
