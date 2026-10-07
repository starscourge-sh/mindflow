import { useEffect, useState } from 'react'
import { useLive } from './vigil'

/**
 * The welcome, page hints and Getting started, as the main process reports
 * them (src/main/onboarding.ts). One shape, one hook.
 */
export type Onboarding = {
  sandbox: boolean
  firstRun: boolean
  welcomed: string | null
  news: boolean
  steps: Record<'catch' | 'keep' | 'review' | 'task' | 'hold' | 'stick' | 'search', boolean>
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
}

const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

export const onboarding = {
  state: () => call<Onboarding>('onboarding:state'),
  set: (patch: Partial<{ welcomed: string; newsSeen: boolean; hintsSeen: string[]; pageHints: boolean; hidden: boolean; welcoming: boolean }>) =>
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

/** The welcome, from anywhere: the Vigil menu, ⌘K, Settings. */
export const playWelcome = (): void => void window.dispatchEvent(new CustomEvent('vigil:welcome'))
