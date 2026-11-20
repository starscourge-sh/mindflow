/**
 * Is a meeting on? The one place that answers (the rule is meeting-away.ts), from signals that are events:
 *   recording  Haligtree's own meeting recorder running: index.ts says so as the recorder's state changes
 *   camera     a camera in use by any app                           the Mac's own "in use" flags, listened to
 *   mic        a microphone in use by an app other than Haligtree   (native/glass.mm watchInUse): read, never opened
 *   event      a Calendar event with other people happening now: events.ts tells when one is made, moved or
 *              dropped, and the clock is waited on for the next start or end
 *   mirrored   the screen mirrored to another: read when Electron says the displays changed
 * Nothing is asked again and again. A test run (HALIGTREE_QA_AWAY) never listens to the Mac: whether the person at it
 * is on a call must not change a probe. Its signals are HALIGTREE_QA_SIGNALS ("camera,mic") as it starts, and
 * globalThis.haligtreeSignal(name, on) from then on. The book's own events are followed in every run.
 */
import { screen } from 'electron'
import { mirrored, watchInUse } from './glass'
import { NO_SIGNALS, SIGNALS, type Signal, type Signals } from './meeting-away'

// HALIGTREE_QA_INUSE: a test run that listens to the Mac's own in-use flags as a person's run does (qa/switch-packaged.mjs).
const QA = !!process.env.HALIGTREE_QA_AWAY && !process.env.HALIGTREE_QA_INUSE
const stood = (process.env.HALIGTREE_QA_SIGNALS ?? '').split(',')
let signals: Signals = { ...NO_SIGNALS, ...Object.fromEntries(SIGNALS.filter((one) => QA && stood.includes(one)).map((one) => [one, true])) }
/** “Show anyway”: the stickies and goal cards out again though a meeting or quiet hours would keep them away. */
let anyway = false
const told: (() => void)[] = []
const tell = (): void => told.forEach((one) => one())

/** Told when a signal comes on or goes off, or “Show anyway” is asked for. */
export const whenMeeting = (listen: () => void): void => void told.push(listen)
export const meetingSignals = (): Signals => signals
export const shownAnyway = (): boolean => anyway
export function setSignal(name: Signal, on: boolean): void {
  if (signals[name] === on) return
  signals = { ...signals, [name]: on }
  tell()
}
export function showAnyway(on: boolean): void {
  if (anyway === on) return
  anyway = on
  tell()
}
/** The meeting and quiet hours are both over: “Show anyway” was for those, and is forgotten (nobody is told: nothing changes). */
export const forgetAnyway = (): void => void (anyway = false)

let eventTimer: ReturnType<typeof setTimeout> | undefined
/**
 * The Calendar's part: `read` says whether an event with other people is on now and when that can next change. Looked
 * at when the Calendar says an event changed (the function given back) and at that moment by the clock, to the second.
 */
export function followEvents(read: () => { on: boolean; next: number }): () => void {
  const look = (): void => {
    clearTimeout(eventTimer)
    try {
      const { on, next } = read()
      setSignal('event', on)
      // A clock, not a look every so often: the next start or end of an event with people (a day at most, the furthest read).
      eventTimer = setTimeout(look, Math.max(1000, next - Date.now() + 50))
    } catch {
      // The book is shut (quitting): nothing more to follow.
    }
  }
  return look
}

/** The Mac's own signals, from now on: a camera or microphone in use, the screen mirrored. Never in a test run. */
export function watchMac(): void {
  ;(globalThis as { haligtreeSignal?: (name: Signal, on: boolean) => void }).haligtreeSignal = (name, on) => void (QA && SIGNALS.includes(name) && setSignal(name, on === true))
  if (QA || process.platform !== 'darwin') return
  watchInUse((mic, camera) => (setSignal('mic', mic), setSignal('camera', camera)))
  const displays = (): void => setSignal('mirrored', mirrored())
  screen.on('display-added', displays)
  screen.on('display-removed', displays)
  screen.on('display-metrics-changed', displays)
  displays()
}
