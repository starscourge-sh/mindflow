import { useSyncExternalStore } from 'react'

/**
 * The voice note being recorded in this window, if any: one place every
 * surface reads, so quick capture's Create, the beam and the recorder itself
 * all agree on "recording now". `stop(true)` keeps it, `stop(false)` throws it away.
 */
type Live = { stop: (keep: boolean) => void }
let live: Live | null = null
const told = new Set<() => void>()

export function setRecording(next: Live | null): void {
  live = next
  told.forEach((one) => one())
}

/** Stop the recording under way, keeping it or not. False when none is. */
export function stopRecording(keep: boolean): boolean {
  if (!live) return false
  live.stop(keep)
  return true
}

export const recordingNow = (): boolean => !!live

/** True while a voice note records in this window. */
export function useRecording(): boolean {
  return useSyncExternalStore((change) => (told.add(change), () => void told.delete(change)), recordingNow)
}
