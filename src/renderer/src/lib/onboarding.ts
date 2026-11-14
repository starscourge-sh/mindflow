import { useSyncExternalStore } from 'react'
import { call } from './haligtree'
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
  set: (patch: Partial<{ welcomed: string; newsSeen: boolean; hintsSeen: string[]; pageHints: boolean; hidden: boolean; welcoming: boolean; setup: Setup; boxSpot: { x: number; y: number; width: number } | null }>) =>
    call<Onboarding>('onboarding:set', patch).then((now) => (tell(), now)),
  mark: (step: string) => call<Onboarding>('onboarding:mark', step).then((now) => (tell(), now)),
  finish: (name: string) => call<unknown>('onboarding:finish', name)
}

/**
 * The state for this whole window, read once for every page that shows it: on any write to the book, on a change made
 * here (told at once rather than at the next write), and as the window is come back to (a sticky put up, or a key
 * taken, is not a write to the book). Kept as said: a page draws again only when the answer is not the same. Read per
 * page with a count bumped on coming back, Home (and every page showing it) was drawn whole again on each return.
 */
let state: Onboarding | null = null
let said = ''
let asked = 0
const pages = new Set<() => void>()
const tell = (): void => {
  const mine = ++asked
  void onboarding.state().then((now) => {
    const json = JSON.stringify(now)
    // Only the newest read counts: one asked before a change may answer after it.
    if (mine !== asked || json === said) return
    said = json
    state = now
    pages.forEach((one) => one())
  }, () => undefined)
}
let wired = false
const subscribe = (change: () => void): (() => void) => {
  pages.add(change)
  if (!wired) {
    wired = true
    window.addEventListener('focus', tell)
    window.api.captures.onChange(tell)
    tell()
  }
  return () => void pages.delete(change)
}

/** The state, kept fresh as anything changes. Null until it has been read once. */
export function useOnboarding(): Onboarding | null {
  return useSyncExternalStore(subscribe, () => state)
}

/** The welcome, from anywhere: the Haligtree menu, ⌘K, Settings. */
export const playWelcome = (): void => void window.dispatchEvent(new CustomEvent('haligtree:welcome'))

/**
 * This page is the main window made again in the old one's place for the welcome played again (main: remakeHome): it
 * plays the welcome as it comes up, out of the desktop, over the tabs and panes the old one handed over. Not on a reload.
 */
export const REMADE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('again') && (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type !== 'reload'

/**
 * In a page made again for the welcome (REMADE): whether its welcome has begun (its mist's first frame over the
 * desktop, or the welcome up in the window). Until then the app's own pages under it are not made (home.tsx): a long
 * note's editor took a second to make, and the welcome waited behind it with the desktop bare. Begun from the start
 * in every other page.
 */
let begun = !REMADE
const begins = new Set<() => void>()
export const welcomeBegun = (): void => {
  if (begun) return
  begun = true
  begins.forEach((one) => one())
}
export const useWelcomeBegun = (): boolean => useSyncExternalStore((change) => (begins.add(change), () => void begins.delete(change)), () => begun)

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
