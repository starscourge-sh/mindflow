// A book with realistically large numbers, for seeing how big counts look:
// 12,000 notes (10,000 gems), 3,500 tasks, a 1,500-card review queue, a tag on
// 4,000 notes, 8,000 log lines on a goal and on a task, a 900-day streak,
// 1.4 million words written, 2,300 focus hours and an 11-hour session still
// running. The tasks' routine and the goal go in through the app; the rest is
// written straight into the sandbox's file while the app is shut, the way
// qa/scale-book.mjs does it.
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

export const BIG = { gems: 10000, writing: 400, captures: 1600, inbox: 900, bin: 500, tasks: 3500, today: 1200, cards: 1500, tagged: 4000, logs: 8000, days: 900, words: 1400000, hours: 2300 }
const DAY = 86400000
const ago = (days) => new Date(Date.now() - days * DAY).toISOString()
const local = (ms) => { const at = new Date(ms); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}` }
const word = (i) => ['river', 'lamp', 'orchard', 'quill', 'harbour', 'meadow', 'lantern', 'ember', 'thistle', 'willow'][i % 10]
const doc = (text) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

/** The book's file in a data folder made for the sandbox. */
export const bookFile = (data) => join(data, 'sandbox', 'mindflow.db')
export const seeded = (data) => existsSync(bookFile(data)) && new DatabaseSync(bookFile(data)).prepare("select count(*) as n from nuggets where body like '%Big gem%'").get().n >= BIG.gems

export async function seedBig(data) {
  const c = await sandbox({ width: 1400, height: 900 })
  try {
    await c.v('settings:set', { hintRate: 0, newPerDay: 5000, reviewsPerDay: 5000, rotCount: 0 })
    await c.v('onboarding:set', { pageHints: false })
    await c.v('task:add', 'Stretch every day')
    await c.v('task:add', 'Write the long report')
    await c.v('goal:new', 'Run a marathon', local(Date.now() + 120 * DAY), local(Date.now() - BIG.days * DAY))
  } finally {
    await c.close()
  }
  const db = new DatabaseSync(bookFile(data))
  db.exec('begin')
  // Tasks: 1,200 on Today, 900 done, the rest open with no date.
  let number = db.prepare('select coalesce(max(number), 0) as n from tasks').get().n
  const addTask = db.prepare("insert into tasks (id, number, title, status, due_at, all_day, created_at, completed_at) values (?, ?, ?, ?, ?, 1, ?, ?)")
  const today = new Date(); today.setHours(0, 0, 0, 0)
  for (let i = 0; i < BIG.tasks; i++) {
    const done = i >= BIG.today && i < BIG.today + 900
    addTask.run(randomUUID(), ++number, `Big task ${i + 1} ${word(i)}`, done ? 'done' : 'open', i < BIG.today ? today.toISOString() : null, ago(i / 4), done ? ago(i % BIG.days) : null)
  }
  // Captures: 900 in the Inbox, 500 in the Bin, the rest kept; one a day for 900 days and more besides. #big goes on 4,000 notes outside the Bin.
  let capNumber = db.prepare('select coalesce(max(number), 0) as n from captures').get().n
  const addCapture = db.prepare('insert into captures (id, number, title, kind, status, body, captured_at) values (?, ?, \'\', ?, ?, ?, ?)')
  let tagged = 0
  const tag = () => (tagged++ < BIG.tagged ? ' #big' : '')
  for (let i = 0; i < BIG.captures; i++) {
    const status = i < BIG.inbox ? 'open' : i < BIG.inbox + BIG.bin ? 'discarded' : 'resolved'
    addCapture.run(randomUUID(), ++capNumber, i % 7 === 0 ? 'quote' : 'note', status, doc(`Big note ${i + 1} about the ${word(i)}${status === 'discarded' ? '' : tag()}`), ago(i % BIG.days))
  }
  // Gems: 10,000, 1,500 of them asking a question nobody has answered yet: the review queue.
  const addGem = db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at, prompt) values (?, ?, 'note', ?, ?, ?, ?, ?)")
  const gems = []
  for (let i = 0; i < BIG.gems + BIG.writing; i++) {
    const id = randomUUID()
    const gem = i < BIG.gems
    if (gem) gems.push(id)
    const at = ago((i * BIG.days) / (BIG.gems + BIG.writing))
    addGem.run(id, gem ? 'nugget' : 'article', gem ? '' : `Big writing ${i + 1 - BIG.gems}`, doc(`${gem ? 'Big gem' : 'Big draft'} ${i + 1} on the ${word(i)}${tag()}`), at, at, gem && i < BIG.cards ? `What about the ${word(i)} ${i + 1}?` : null)
  }
  // Reviews every day for 900 days, thirty a day, on gems that ask nothing (so the queue stays new cards).
  const addReview = db.prepare('insert into review_log (item_id, grade, reviewed_at, ms, first) values (?, 3, ?, 4000, 0)')
  for (let d = 0; d < BIG.days; d++) for (let r = 0; r < 30; r++) addReview.run(gems[BIG.cards + ((d * 30 + r) % (BIG.gems - BIG.cards))], new Date(Date.now() - (d + 1) * DAY + r * 60000).toISOString())
  // The goal's progress log: 8,000 lines over its 900 days.
  const goal = db.prepare("select id from nuggets where tier = 'goal' and title = 'Run a marathon'").get().id
  const addGloss = db.prepare('insert into glosses (id, item_id, body, created_at) values (?, ?, ?, ?)')
  for (let i = 0; i < BIG.logs; i++) addGloss.run(randomUUID(), goal, `Ran ${(i % 20) + 2} km by the ${word(i)}`, ago(BIG.days - (i * BIG.days) / BIG.logs))
  // A routine ticked every day for 900 days.
  const routine = db.prepare("select id from tasks where title like 'Stretch%'").get().id
  const addTick = db.prepare('insert into task_done (task_id, done_at) values (?, ?)')
  for (let d = 0; d < BIG.days; d++) addTick.run(routine, new Date(Date.now() - d * DAY - 3600000).toISOString())
  // Focus: a session a day for 900 days, 2,300 hours in all; one of them 11 hours long.
  const addSession = db.prepare("insert into sessions (id, task_id, started_at, ended_at, recap, kind, goal) values (?, ?, ?, ?, '', ?, ?)")
  const each = Math.round(((BIG.hours - 11) * 3600000) / BIG.days)
  for (let d = 1; d <= BIG.days; d++) {
    const start = new Date(Date.now() - d * DAY)
    start.setHours(6, 0, 0, 0)
    const long = d === 3
    addSession.run(randomUUID(), '', start.toISOString(), new Date(start.getTime() + (long ? 11 * 3600000 + 20 * 60000 : each)).toISOString(), 'focus', long ? 'The long push' : 'Deep work')
  }
  // 8,000 log lines on one task, over forty sessions.
  const report = db.prepare("select id from tasks where title = 'Write the long report'").get().id
  const addLine = db.prepare('insert into session_log (id, session_id, at, text) values (?, ?, ?, ?)')
  for (let s = 0; s < 40; s++) {
    const id = randomUUID()
    const start = Date.now() - (40 - s) * DAY + 3 * 3600000
    addSession.run(id, report, new Date(start).toISOString(), new Date(start + 3600000).toISOString(), null, null)
    for (let l = 0; l < BIG.logs / 40; l++) addLine.run(randomUUID(), id, new Date(start + l * 15000).toISOString(), `Report thought ${s * 200 + l + 1}`)
  }
  // An 11 h 20 min session still running.
  addSession.run(randomUUID(), '', new Date(Date.now() - (11 * 60 + 20) * 60000).toISOString(), null, 'focus', 'All-day sprint')
  // 1.4 million words written, a share a day for 900 days.
  const writing = db.prepare("select id from nuggets where tier = 'article' limit 1").get().id
  const addWords = db.prepare("insert or replace into word_days (day, id, kind, words) values (?, ?, 'nugget', ?)")
  for (let d = 0; d < BIG.days; d++) addWords.run(local(Date.now() - d * DAY), writing, Math.round(BIG.words / BIG.days))
  db.exec('commit')
  const count = (sql) => db.prepare(sql).get().n
  const said = {
    notes: count("select (select count(*) from captures where body like '%Big note%') + (select count(*) from nuggets where body like '%Big %') as n"),
    tasks: count("select count(*) as n from tasks where title like 'Big task%'"),
    words: count('select sum(words) as n from word_days'),
    hours: Math.round(count("select sum((julianday(ended_at) - julianday(started_at)) * 24) as n from sessions where kind = 'focus' and ended_at is not null"))
  }
  db.close()
  return said
}
