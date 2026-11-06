import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { ipcMain, shell } from 'electron'
import { database } from './captures'

/**
 * A task as a Reminder: "Add to Reminders" puts it in your Mac's default
 * Reminders list (EventKit, through JavaScript for Automation as the calendar
 * is read), with its day and time; ticked there, it is done here, and done
 * here, it is ticked there. macOS asks once, in its own words, the first time;
 * nothing is read from Reminders but the reminders Haligtree made. A repeating
 * task is not offered (each list repeats in its own way).
 * HALIGTREE_QA_REMINDERS=<file> stands a JSON file in for Reminders, for
 * tests: the real Reminders are never touched by a probe.
 */

type State = { id: string; exists: boolean; completed: boolean }
type Answer = { status: 'on' | 'denied' | 'unasked'; id?: string; states?: State[] }

const SCRIPT = `
ObjC.import('EventKit')
ObjC.import('Foundation')
function run(argv) {
  const [op, a, b, c] = argv
  const status = () => Number($.EKEventStore.authorizationStatusForEntityType(1))
  const store = $.EKEventStore.alloc.init
  if (status() === 0 && op === 'add') {
    let done = false
    const answered = () => { done = true }
    if (store.respondsToSelector('requestFullAccessToRemindersWithCompletion:')) store.requestFullAccessToRemindersWithCompletion(answered)
    else store.requestAccessToEntityTypeCompletion(1, answered)
    const until = Date.now() + 120000
    while (!done && Date.now() < until) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.2))
  }
  const now = status()
  if (op === 'status') return JSON.stringify({ status: now === 3 ? 'on' : now === 0 ? 'unasked' : 'denied' })
  if (now !== 3) return JSON.stringify({ status: now === 0 ? 'unasked' : 'denied' })
  if (op === 'add') {
    const one = $.EKReminder.reminderWithEventStore(store)
    one.title = a
    one.calendar = store.defaultCalendarForNewReminders
    if (b) {
      const units = 4 | 8 | 16 | (c === 'day' ? 0 : 32 | 64)
      one.dueDateComponents = $.NSCalendar.currentCalendar.componentsFromDate(units, $.NSDate.dateWithTimeIntervalSince1970(new Date(b).getTime() / 1000))
    }
    store.saveReminderCommitError(one, true, null)
    return JSON.stringify({ status: 'on', id: ObjC.unwrap(one.calendarItemIdentifier) })
  }
  const ids = JSON.parse(a || '[]')
  const states = []
  for (const id of ids) {
    const one = store.calendarItemWithIdentifier(id)
    if (!one || one.isNil()) { states.push({ id, exists: false, completed: false }); continue }
    if (op === 'tick' || op === 'untick') { one.completed = op === 'tick'; store.saveReminderCommitError(one, true, null) }
    if (op === 'remove') store.removeReminderCommitError(one, true, null)
    states.push({ id, exists: op !== 'remove', completed: !!one.completed })
  }
  return JSON.stringify({ status: 'on', states })
}
`

/** The stand-in for tests: a JSON file of reminders, { id: { title, due, completed } }. */
function standIn(op: string, a: string, b: string, file: string): Answer {
  let all: Record<string, { title: string; due: string | null; completed: boolean }> = {}
  try {
    all = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    // None yet.
  }
  if (op === 'status') return { status: 'on' }
  if (op === 'add') {
    const id = randomUUID()
    all[id] = { title: a, due: b || null, completed: false }
    writeFileSync(file, JSON.stringify(all))
    return { status: 'on', id }
  }
  const states = (JSON.parse(a || '[]') as string[]).map((id) => {
    const one = all[id]
    if (!one) return { id, exists: false, completed: false }
    if (op === 'tick' || op === 'untick') one.completed = op === 'tick'
    if (op === 'remove') delete all[id]
    return { id, exists: op !== 'remove', completed: one.completed }
  })
  writeFileSync(file, JSON.stringify(all))
  return { status: 'on', states }
}

function ask(op: string, a = '', b = '', c = ''): Promise<Answer> {
  if (process.env.HALIGTREE_QA_REMINDERS) return Promise.resolve(standIn(op, a, b, process.env.HALIGTREE_QA_REMINDERS))
  if (process.platform !== 'darwin') return Promise.resolve({ status: 'denied' })
  return new Promise((done) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', SCRIPT, op, a, b, c], { timeout: op === 'add' ? 130_000 : 20_000 }, (error, out) => {
      try {
        done(error ? { status: 'denied' } : (JSON.parse(String(out).trim()) as Answer))
      } catch {
        done({ status: 'denied' })
      }
    })
  })
}

export function registerReminders(): void {
  const db = database()
  db.exec('create table if not exists task_reminders (task_id text primary key, reminder_id text not null)')
  const links = (): { task: string; reminder: string }[] => db.prepare('select task_id as task, reminder_id as reminder from task_reminders').all() as { task: string; reminder: string }[]
  // Which tasks are in Reminders, for the menus.
  ipcMain.handle('haligtree:reminders:linked', () => links().map((one) => one.task))
  ipcMain.handle('haligtree:reminders:add', async (_event, task: unknown, title: unknown, due: unknown, allDay: unknown) => {
    const said = await ask('add', String(title ?? ''), typeof due === 'string' ? due : '', allDay ? 'day' : 'time')
    if (said.status !== 'on' || !said.id) return { status: said.status === 'on' ? 'denied' : said.status }
    db.prepare('insert or replace into task_reminders (task_id, reminder_id) values (?, ?)').run(String(task), said.id)
    return { status: 'on' }
  })
  // Taken out: the reminder goes from Reminders too, and the task stays as it is.
  ipcMain.handle('haligtree:reminders:remove', async (_event, task: unknown) => {
    const link = links().find((one) => one.task === String(task))
    if (!link) return false
    await ask('remove', JSON.stringify([link.reminder]))
    db.prepare('delete from task_reminders where task_id = ?').run(link.task)
    return true
  })
  // Each linked task's reminder: ticked or not, and gone (deleted in Reminders: the link goes).
  ipcMain.handle('haligtree:reminders:state', async () => {
    const all = links()
    if (!all.length) return []
    const said = await ask('state', JSON.stringify(all.map((one) => one.reminder)))
    if (said.status !== 'on') return []
    return all.flatMap((one) => {
      const state = said.states?.find((each) => each.id === one.reminder)
      if (!state) return []
      if (!state.exists) {
        db.prepare('delete from task_reminders where task_id = ?').run(one.task)
        return []
      }
      return [{ task: one.task, completed: state.completed }]
    })
  })
  ipcMain.handle('haligtree:reminders:tick', async (_event, task: unknown, done: unknown) => {
    const link = links().find((one) => one.task === String(task))
    if (link) await ask(done ? 'tick' : 'untick', JSON.stringify([link.reminder]))
    return !!link
  })
  ipcMain.handle('haligtree:reminders:privacy', () => void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders'))
}
