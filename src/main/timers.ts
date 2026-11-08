/**
 * Every repeating timer of the main process, kept so the app can stop them all as it quits. The database closes in
 * `will-quit`; a timer still due in the moments after (the alerts check every 30s, reminders, backups) read the
 * closed database and threw "database is not open" in a macOS alert. Imported first, so every `setInterval` after is
 * counted, whichever file makes it.
 */
const running = new Set<ReturnType<typeof setInterval>>()
const made = globalThis.setInterval
const cleared = globalThis.clearInterval

globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
  const timer = made(...args)
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
