import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, powerMonitor } from 'electron'

/**
 * Lock and away: when the Mac was locked or asleep, kept as stretches of time
 * (the last 120 days, in this book's folder), so that
 *   - a day the Mac was away for (locked or asleep at least 20 of its hours)
 *     never breaks a streak: it neither counts nor ends one (awayDays);
 *   - back after four hours or more, the main window says what came due while
 *     you were gone, once ("haligtree:back").
 * Only while Haligtree is running: a day with the app quit is not known.
 * HALIGTREE_QA_AWAY_DAYS stands in away days for a probe ("2026-11-01,2026-11-02").
 */

type Stretch = { from: number; to: number }
const file = (): string => join(app.getPath('userData'), 'away.json')
let stretches: Stretch[] | null = null
let since: number | null = null

const read = (): Stretch[] => {
  if (stretches) return stretches
  try {
    stretches = JSON.parse(readFileSync(file(), 'utf8')) as Stretch[]
  } catch {
    stretches = []
  }
  return stretches
}
const keep = (one: Stretch): void => {
  const all = [...read(), one].filter((each) => each.to > Date.now() - 120 * 86_400_000)
  stretches = all
  try {
    writeFileSync(file(), JSON.stringify(all))
  } catch {
    // Not kept: a day away may break a streak, as before.
  }
}

/** The local days ("2026-11-01") the Mac was away for at least 20 of their hours. */
export function awayDays(): Set<string> {
  if (process.env.HALIGTREE_QA_AWAY_DAYS) return new Set(process.env.HALIGTREE_QA_AWAY_DAYS.split(','))
  const per = new Map<string, number>()
  for (const { from, to } of read()) {
    for (let at = from; at < to; ) {
      const day = new Date(at)
      const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime()
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
      per.set(key, (per.get(key) ?? 0) + Math.min(to, next) - at)
      at = next
    }
  }
  return new Set([...per].filter(([, ms]) => ms >= 20 * 3600_000).map(([key]) => key))
}

const gone = (): void => void (since ??= Date.now())
const back = (): void => {
  if (since === null) return
  const one = { from: since, to: Date.now() }
  since = null
  if (one.to - one.from < 60_000) return
  keep(one)
  if (one.to - one.from < 4 * 3600_000) return
  for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed() && window.webContents.getURL().includes('view=home')) window.webContents.send('haligtree:back', one.to - one.from)
}

export function registerAway(): void {
  powerMonitor.on('lock-screen', gone)
  powerMonitor.on('suspend', gone)
  powerMonitor.on('unlock-screen', back)
  powerMonitor.on('resume', back)
}
