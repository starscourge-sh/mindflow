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
}
