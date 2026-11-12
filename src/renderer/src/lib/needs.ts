import { useEffect, useState } from 'react'
import { lacks, meets, WHICH, type Caps, type Need } from '../../../main/needs'
export { lacks, meets, WHICH, type Caps, type Need }

/**
 * What this Mac can do (main/needs.ts), asked of main once per window and kept:
 * main asked the Mac itself once, at start.
 */
let kept: Caps | null = null
let asking: Promise<Caps> | null = null

export function readCaps(): Promise<Caps> {
  asking ??= window.api.haligtree<Caps>('caps').then((caps) => (kept = caps))
  return asking
}

/** Those waiting on Apple Intelligence becoming ready in this window: told when the answer changes. */
const waiting = new Set<(caps: Caps) => void>()
/** Asked again (main asks the Mac at most once a minute): whoever shows "not ready" is told if it no longer is. */
function readAgain(): void {
  const was = kept
  asking = null
  void readCaps().then((now) => { if (now.ai !== was?.ai) for (const tell of waiting) tell(now) }, () => undefined)
}

/** What this Mac has, for a menu built in one go; asked as this window opens, so a menu opened later has it. */
export const capsNow = (): Caps | null => kept
if (typeof window !== 'undefined' && window.api) void readCaps().catch(() => undefined)

/** This Mac's powers; null for the moment before main answers, when nothing beyond every Mac's is offered. */
export function useCaps(): Caps | null {
  const [caps, setCaps] = useState(kept)
  useEffect(() => {
    if (!kept) void readCaps().then(setCaps)
  }, [])
  // "Not ready" is macOS still downloading Apple Intelligence: the one answer that changes by itself, and macOS tells
  // nobody when it does. So while it stands, the Mac is asked again as this window is come back to and each minute it
  // is in front, and what waited on it turns on without Haligtree being opened again.
  const unready = caps?.ai === 'not-ready'
  useEffect(() => {
    if (!unready) return
    waiting.add(setCaps)
    const again = (): void => void (document.hidden || readAgain())
    const each = setInterval(again, 60_000)
    window.addEventListener('focus', again)
    return () => (waiting.delete(setCaps), clearInterval(each), window.removeEventListener('focus', again))
  }, [unready])
  return caps
}

/** Whether this Mac has what a feature needs. */
export function useHas(need: Need | undefined): boolean {
  return meets(useCaps(), need)
}
