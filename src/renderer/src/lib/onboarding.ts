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
}

export const onboarding = {
  state: () => call<Onboarding>('onboarding:state'),
  set: (patch: Partial<{ welcomed: string; newsSeen: boolean; hintsSeen: string[]; pageHints: boolean; hidden: boolean; welcoming: boolean; setup: Setup }>) =>
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

/** The welcome, from anywhere: the Haligtree menu, ⌘K, Settings. */
export const playWelcome = (): void => void window.dispatchEvent(new CustomEvent('haligtree:welcome'))

/**
 * The welcome, to try without touching your book: played in the sandbox,
 * whose notes are someone else's. From your own book the sandbox opens first
 * and plays it on arrival (welcome.tsx, useCarriedWelcome).
 */
export const tryWelcome = async (): Promise<void> => {
  if (SANDBOX) return playWelcome()
  await enterSandbox({ welcome: true })
}

export const NO_SETUP: Setup = { use: null, from: [], space: null, exam: null, goal: null, goalBy: null }
