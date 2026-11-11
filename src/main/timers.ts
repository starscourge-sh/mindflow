/**
 * Every repeating timer of the main process, kept so the app can stop them all as it quits. The database closes in
 * `will-quit`; a timer still due in the moments after (the alerts check every 30s, reminders, backups) read the
 * closed database and threw "database is not open" in a macOS alert. Imported first, so every `setInterval` after is
 * counted, whichever file makes it.
 */
import { named } from './stalls'

const running = new Set<ReturnType<typeof setInterval>>()
const made = globalThis.setInterval
const cleared = globalThis.clearInterval

globalThis.setInterval = ((run: (...given: unknown[]) => void, ms?: number, ...args: unknown[]) => {
  // Each tick is timed under the timer's name (stalls.ts): its function's, or the file and line that made it, read once here.
  const where = /([^/\\()\s]+:\d+):\d+\)?$/.exec(new Error().stack?.split('\n')[2] ?? '')?.[1] ?? 'somewhere'
  const name = `timer ${run.name || where} every ${ms ?? 0} ms`
  const timer = made((...given: unknown[]) => named(name, () => run(...given)), ms, ...args)
  running.add(timer)
  return timer
}) as typeof setInterval
globalThis.clearInterval = ((timer?: ReturnType<typeof setInterval>) => {
  if (timer) running.delete(timer)
  cleared(timer)
}) as typeof clearInterval

/** Stop every repeating timer: called as the app quits, before the database closes. */
export function stopTimers(): void {
  for (const timer of running) cleared(timer)
  running.clear()
}
