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

/** What this Mac has, for a menu built in one go; asked as this window opens, so a menu opened later has it. */
export const capsNow = (): Caps | null => kept
if (typeof window !== 'undefined' && window.api) void readCaps().catch(() => undefined)

/** This Mac's powers; null for the moment before main answers, when nothing beyond every Mac's is offered. */
export function useCaps(): Caps | null {
  const [caps, setCaps] = useState(kept)
  useEffect(() => {
    if (!kept) void readCaps().then(setCaps)
  }, [])
  return caps
}

/** Whether this Mac has what a feature needs. */
export function useHas(need: Need | undefined): boolean {
  return meets(useCaps(), need)
}
