import { useEffect, useState } from 'react'
import { call, useLive } from './haligtree'
import { SANDBOX, enterSandbox } from './sandbox'
import type { Setup } from '../../../main/onboarding'
export type { Setup }

/**
 * The welcome, page hints and Getting started, as the main process reports
 * them (src/main/onboarding.ts). One shape, one hook.
 */
export type Onboarding = {
  sandbox: boolean
  firstRun: boolean
  welcomed: string | null
  news: boolean
  steps: Record<'catch' | 'keep' | 'review' | 'task' | 'focus' | 'hold' | 'stick' | 'search' | 'card' | 'space' | 'import' | 'goal' | 'tour', boolean>
  marks: Record<string, string>
  hidden: boolean
  doneAt: string | null
  hintsSeen: string[]
  pageHints: boolean
  /** The box's keys as you press them now ('⌘.' unless changed; null when cleared). */
  box: string | null
  boxTaken: boolean
  name: string
  tray: { x: number; y: number } | null
  /** The welcome's first questions, as answered (src/main/onboarding.ts, Setup). */
  setup: Setup
  /** Which welcome plays: 1, the first one, or 2, the short one that starts you writing. */
  welcomeVersion: WelcomeVersion
}
export type WelcomeVersion = 1 | 2

export const onboarding = {
  state: () => call<Onboarding>('onboarding:state'),
  set: (patch: Partial<{ welcomed: string; newsSeen: boolean; hintsSeen: string[]; pageHints: boolean; hidden: boolean; welcoming: boolean; setup: Setup; welcomeVersion: WelcomeVersion }>) =>
    call<Onboarding>('onboarding:set', patch).then((now) => (tell(), now)),
  mark: (step: string) => call<Onboarding>('onboarding:mark', step).then((now) => (tell(), now)),
  finish: (name: string) => call<unknown>('onboarding:finish', name)
}

// Changes made here are told to every hook in this window at once, rather
// than waiting for the next write to the database.
const told = new Set<() => void>()
const tell = (): void => told.forEach((one) => one())

/** The state, kept fresh as anything changes. Null until it has been read once. */
export function useOnboarding(): Onboarding | null {
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    const again = (): void => setNonce((n) => n + 1)
    told.add(again)
    // A sticky put up, or a key taken, is not a write to the database: read again on coming back.
    window.addEventListener('focus', again)
    return () => void (told.delete(again), window.removeEventListener('focus', again))
  }, [])
  return useLive(onboarding.state, null as Onboarding | null, [nonce])
}

/** The welcome, from anywhere: the Haligtree menu, ⌘K, Settings. With no version, the one chosen in Settings. */
export const playWelcome = (version?: WelcomeVersion): void => void window.dispatchEvent(new CustomEvent('haligtree:welcome', { detail: version ? { version } : undefined }))

/** Which welcome an ask for it plays: the one asked for, else the one chosen in Settings. */
export const welcomeAsked = (event: Event | null, state: Onboarding): WelcomeVersion => (event as CustomEvent<{ version?: WelcomeVersion } | undefined> | null)?.detail?.version ?? state.welcomeVersion ?? 1

/**
 * Either welcome, to try without touching your book: played in the sandbox,
 * whose notes are someone else's. From your own book the sandbox opens first
 * and plays it on arrival (welcome-v2.tsx, useCarriedWelcome).
 */
export const tryWelcome = async (version: WelcomeVersion): Promise<void> => {
  if (SANDBOX) return playWelcome(version)
  await enterSandbox({ welcome: version })
}

export const NO_SETUP: Setup = { use: null, from: [], space: null, exam: null, goal: null, goalBy: null }
