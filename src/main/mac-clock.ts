import { app, systemPreferences } from 'electron'

/**
 * Whether the Mac tells the time on a 12-hour clock ("9:05 PM"): its own
 * switch in Date & Time if it was moved, or else what its region does.
 * MINDFLOW_QA_CLOCK (12 or 24) sets it for a test run.
 */
export function macTwelveHour(): boolean {
  const qa = process.env.MINDFLOW_QA_CLOCK
  if (qa === '12' || qa === '24') return qa === '12'
  if (process.platform === 'darwin') {
    if (systemPreferences.getUserDefault('AppleICUForce24HourTime', 'boolean')) return false
    if (systemPreferences.getUserDefault('AppleICUForce12HourTime', 'boolean')) return true
  }
  const region = process.platform === 'darwin' ? systemPreferences.getUserDefault('AppleLocale', 'string') : ''
  const locale = (region || app.getSystemLocale() || 'en-GB').replace(/_/g, '-').replace(/@.*/, '')
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12 === true
  } catch {
    return false
  }
}
