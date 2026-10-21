import { ipcMain } from 'electron'
import { database } from './captures'

/**
 * Close the day's two questions, answered a night at a time and kept by day,
 * so a year can be read back: the same question down the months. Your own
 * words only; nothing reads them for you.
 */
import { QUESTIONS } from './journal-words'

export function registerJournal(): void {
  const db = database()
  db.exec('create table if not exists journal (day text not null, question text not null, answer text not null, primary key (day, question))')
  ipcMain.handle('vigil:journal:save', (_event, day: unknown, question: unknown, answer: unknown) => {
    const text = String(answer ?? '').trim()
    if (!(String(question) in QUESTIONS) || !/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return false
    if (!text) db.prepare('delete from journal where day = ? and question = ?').run(String(day), String(question))
    else db.prepare('insert or replace into journal (day, question, answer) values (?, ?, ?)').run(String(day), String(question), text)
    return true
  })
  ipcMain.handle('vigil:journal:day', (_event, day: unknown) =>
    Object.fromEntries((db.prepare('select question, answer from journal where day = ?').all(String(day)) as { question: string; answer: string }[]).map((row) => [row.question, row.answer])))
  ipcMain.handle('vigil:journal:year', (_event, year: unknown) =>
    db.prepare("select day, question, answer from journal where day like ? order by day").all(`${Number(year) || new Date().getFullYear()}-%`))

  // This season's habits, ticked on Close the day: a habit's name and the days
  // it was done, nothing else. No reminders, no streak to keep: a day not
  // ticked is only a day not ticked, and its journal line says why.
  db.exec('create table if not exists habit_days (day text not null, habit text not null, primary key (day, habit))')
  const isDay = (day: unknown): boolean => /^\d{4}-\d{2}-\d{2}$/.test(String(day))
  ipcMain.handle('vigil:habits:day', (_event, day: unknown) =>
    isDay(day) ? (db.prepare('select habit from habit_days where day = ?').all(String(day)) as { habit: string }[]).map((row) => row.habit) : [])
  ipcMain.handle('vigil:habits:tick', (_event, day: unknown, habit: unknown, done: unknown) => {
    const name = String(habit ?? '').trim()
    if (!isDay(day) || !name) return false
    if (done) db.prepare('insert or ignore into habit_days (day, habit) values (?, ?)').run(String(day), name)
    else db.prepare('delete from habit_days where day = ? and habit = ?').run(String(day), name)
    return true
  })
  // Every day each habit was done since `from`, for the grid in Stats.
  ipcMain.handle('vigil:habits:since', (_event, from: unknown) =>
    db.prepare('select day, habit from habit_days where day >= ? order by day').all(isDay(from) ? String(from) : '0000-00-00'))
  // A day's own words, for a gap pointed at: its two answers, and the last line on its page.
  ipcMain.handle('vigil:habits:why', (_event, day: unknown) => {
    if (!isDay(day)) return null
    const answers = Object.fromEntries((db.prepare('select question, answer from journal where day = ?').all(String(day)) as { question: string; answer: string }[]).map((row) => [row.question, row.answer]))
    let line = ''
    try {
      const page = db.prepare('select body from day_pages where day = ?').get(String(day)) as { body: string | null } | undefined
      type Part = { type?: string; text?: string; content?: Part[] }
      const doc = JSON.parse(page?.body ?? 'null') as Part | null
      const lines = (doc?.content ?? []).map((node) => [node.text ?? '', ...(node.content ?? []).map((one) => one.text ?? '')].join('').trim()).filter(Boolean)
      line = lines[lines.length - 1] ?? ''
    } catch {
      // No page that day, or not one written here.
    }
    return { well: answers.well ?? '', learned: answers.learned ?? '', line }
  })
}
