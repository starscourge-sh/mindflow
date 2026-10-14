import { execFile } from 'child_process'
import { ipcMain, shell } from 'electron'

/**
 * Your Mac's calendar, read only: the events of a few days, for Today's brief
 * and the week. Read through EventKit, so macOS asks once, in its own words,
 * for access to Calendars (never Calendar.app itself, which is left closed),
 * and Vigil only ever reads. Off until turned on in Settings; asked for only
 * then. MINDFLOW_QA_CALENDAR stands a list of events in, for tests.
 */
export type MacEvent = { title: string; start: string; end: string; allDay: boolean; calendar: string; color: string | null }
export type MacCalendar = { status: 'on' | 'denied' | 'unasked' | 'none'; events: MacEvent[] }

// JavaScript for Automation over EventKit: asked (if `ask`) and then read.
const SCRIPT = `
ObjC.import('EventKit')
ObjC.import('Foundation')
function run(argv) {
  const [from, to, mode] = argv
  const status = () => Number($.EKEventStore.authorizationStatusForEntityType(0))
  const store = $.EKEventStore.alloc.init
  if (status() === 0 && mode === 'ask') {
    let done = false
    const answered = () => { done = true }
    if (store.respondsToSelector('requestFullAccessToEventsWithCompletion:')) store.requestFullAccessToEventsWithCompletion(answered)
    else store.requestAccessToEntityTypeCompletion(0, answered)
    const until = Date.now() + 120000
    while (!done && Date.now() < until) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.2))
  }
  const now = status()
  if (now !== 3) return JSON.stringify({ status: now === 0 ? 'unasked' : 'denied', events: [] })
  const date = (iso) => $.NSDate.dateWithTimeIntervalSince1970(new Date(iso).getTime() / 1000)
  const found = store.eventsMatchingPredicate(store.predicateForEventsWithStartDateEndDateCalendars(date(from), date(to), $()))
  const events = []
  for (let i = 0; i < Number(found.count) && i < 300; i++) {
    const one = found.objectAtIndex(i)
    const hex = (() => { try { const c = one.calendar.color; return '#' + [c.redComponent, c.greenComponent, c.blueComponent].map((v) => Math.round(Number(v) * 255).toString(16).padStart(2, '0')).join('') } catch (e) { return null } })()
    events.push({ title: ObjC.unwrap(one.title) || 'Busy', start: new Date(Number(one.startDate.timeIntervalSince1970) * 1000).toISOString(), end: new Date(Number(one.endDate.timeIntervalSince1970) * 1000).toISOString(), allDay: !!one.allDay, calendar: ObjC.unwrap(one.calendar.title) || '', color: hex })
  }
  return JSON.stringify({ status: 'on', events })
}
`

const cache = new Map<string, { at: number; said: MacCalendar }>()

function read(from: string, to: string, ask: boolean): Promise<MacCalendar> {
  // A QA run can stand in a refusal too: MINDFLOW_QA_CALENDAR=denied.
  if (process.env.MINDFLOW_QA_CALENDAR === 'denied') return Promise.resolve({ status: 'denied', events: [] })
  if (process.env.MINDFLOW_QA_CALENDAR) {
    const events = (JSON.parse(process.env.MINDFLOW_QA_CALENDAR) as MacEvent[]).filter((one) => one.end > from && one.start < to)
    return Promise.resolve({ status: 'on', events })
  }
  if (process.platform !== 'darwin') return Promise.resolve({ status: 'none', events: [] })
  const key = `${from}|${to}`
  const kept = cache.get(key)
  if (!ask && kept && Date.now() - kept.at < 5 * 60_000) return Promise.resolve(kept.said)
  return new Promise((done) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', SCRIPT, from, to, ask ? 'ask' : 'read'], { timeout: ask ? 130_000 : 15_000 }, (error, out) => {
      let said: MacCalendar = { status: 'denied', events: [] }
      try {
        if (!error) said = JSON.parse(String(out).trim()) as MacCalendar
      } catch {
        // Unreadable: said as not allowed, never as an empty day.
      }
      said.events.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))
      cache.set(key, { at: Date.now(), said })
      done(said)
    })
  })
}

export function registerMacCalendar(): void {
  ipcMain.handle('vigil:calendar:events', (_event, from: unknown, to: unknown) => read(String(from), String(to), false))
  // Turned on in Settings: macOS asks, once, in its own words.
  ipcMain.handle('vigil:calendar:ask', (_event, from: unknown, to: unknown) => (cache.clear(), read(String(from), String(to), true)))
  ipcMain.handle('vigil:calendar:privacy', () => void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars'))
}
