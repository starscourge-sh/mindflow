import { toast } from '@/components/vigil/ui'
import { chime } from './sound'
import { vigil } from './vigil'

/**
 * The sandbox, as a window sees it: a practice copy of Vigil in a data
 * folder of its own (see src/main/sandbox.ts). Every window of the sandbox
 * is told so in its address, so this is known before anything renders.
 */
export const SANDBOX = new URLSearchParams(location.search).has('sandbox')

/**
 * What comes along into the sandbox: how Vigil feels to you (sounds, motion,
 * your keys, margin marks, the sizes you read at) and your celebrations, the
 * GIFs and pictures that make a milestone yours. Its scenery stays its own
 * public-domain landscapes.
 */
const CARRY_SETTINGS = ['motion', 'sounds', 'volume', 'soundPack', 'keys', 'marks', 'textSize', 'interfaceSize', 'celebrationsFolder', 'celebrationPicks'] as const
/** And from the window's own storage: the theme, Vim, and whether Vigil shows in screen recordings. */
const CARRY_LOCAL = ['theme', 'custom-themes', 'frosted', 'recordable', 'vim'] as const

export type Carry = { local: Record<string, string>; settings: Record<string, unknown> }

/** Said once, then the restart. */
const going = (text: string, cue: Parameters<typeof chime>[0]): Promise<void> => {
  chime(cue)
  toast(text, undefined, 'info')
  return new Promise((done) => setTimeout(done, 900))
}

/**
 * Into the sandbox: your look written down for it, then Vigil starts again
 * there. The onboarding's last screen calls this; so do Settings, ⌘K, the
 * Vigil menu and the menu bar.
 */
export async function enterSandbox(): Promise<void> {
  if (SANDBOX) return
  const settings = (await vigil.settings()) as unknown as Record<string, unknown>
  const local: Record<string, string> = {}
  for (const key of CARRY_LOCAL) {
    try {
      const value = localStorage.getItem(key)
      if (value !== null) local[key] = value
    } catch {
      // Not carried: the sandbox starts on its own default.
    }
  }
  const carry: Carry = { local, settings: Object.fromEntries(CARRY_SETTINGS.filter((key) => key in settings).map((key) => [key, settings[key]])) }
  await going('Opening the sandbox. Vigil restarts in a moment.', 'scene')
  await window.api.vigil('sandbox:enter', carry)
}

/** Back to your notes. Anything you caught in the sandbox is offered there. */
export async function leaveSandbox(): Promise<void> {
  if (!SANDBOX) return
  const now = new Date()
  // At 11:11 exactly, one more line.
  const wish = now.getHours() % 12 === 11 && now.getMinutes() === 11 ? ' Make a wish.' : ''
  await going(`Back to your notes. The sandbox keeps what you did, until you reset it.${wish}`, 'rewind')
  await window.api.vigil('sandbox:leave')
}

/** The sandbox as it began: its folder cleared, and the examples set out again. */
export async function resetSandbox(): Promise<void> {
  if (!SANDBOX) return
  await going('Starting the sandbox over. Vigil restarts in a moment.', 'rewind')
  await window.api.vigil('sandbox:reset')
}

export type SandboxState = { on: boolean; seeded: boolean; seededOn: string | null }
export const sandboxState = (): Promise<SandboxState> => window.api.vigil('sandbox:state') as Promise<SandboxState>
