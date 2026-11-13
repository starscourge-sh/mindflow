// With 5,000 tasks and 20,000 sessions the Tasks list opens no slower (ask 47, ruling 8). The one read behind every
// row's time (sessions:spent) is timed in the main process, and “All” is opened seven times from Home, timed in the
// page from the ask to its first row on show. Run it on the build before and on this one, on copies of one book,
// back to back on a quiet turn, and compare the two lines it prints.
//
//   SEED=1 QA_DATA=<a copy of the seeded sandbox> node qa/task-time-scale.mjs      the tasks and sessions written into the copy, the app shut
//   QA_DATA=<a copy of that> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/task-time-scale.mjs
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { join } from 'path'

const DATA = process.env.QA_DATA
if (!DATA) throw new Error('QA_DATA is needed')
const TASKS = 5000
const SESSIONS = 20000

if (process.env.SEED) {
  const db = new DatabaseSync(join(DATA, 'sandbox', 'haligtree.db'))
  db.exec('begin')
  let number = db.prepare('select coalesce(max(number), 0) as n from tasks').get().n
  const addTask = db.prepare("insert into tasks (id, number, title, status, created_at, due_at, all_day) values (?, ?, ?, 'open', ?, ?, 1)")
  const addSession = db.prepare("insert into sessions (id, task_id, started_at, ended_at, recap, paused_ms, planned_ms) values (?, ?, ?, ?, '', ?, ?)")
  const ids = []
  const day = 86_400_000
  for (let n = 0; n < TASKS; n++) {
    const id = randomUUID()
    ids.push(id)
    // A fifth with a day in the weeks ahead, the rest with none.
    addTask.run(id, ++number, `Scale task ${n + 1} #scale${n % 40}`, new Date(Date.now() - (TASKS - n) * 60_000).toISOString(), n % 5 === 0 ? new Date(Date.now() + (1 + (n % 60)) * day).toISOString() : null)
  }
  // Four sessions on every one of them: 25 minutes with a minute's pause, over the last year.
  for (let n = 0; n < SESSIONS; n++) {
    const start = Date.now() - (1 + (n % 365)) * day - (n % 1000) * 1000
    addSession.run(randomUUID(), ids[n % TASKS], new Date(start).toISOString(), new Date(start + 26 * 60_000).toISOString(), 60_000, 25 * 60_000)
  }
  db.exec('commit')
  console.log(`seeded: ${db.prepare("select count(*) as n from tasks where status = 'open'").get().n} open tasks, ${db.prepare('select count(*) as n from sessions').get().n} sessions`)
  db.close()
  process.exit(0)
}

const { sandbox } = await import('./sandbox-lib.mjs')
const { checks } = await import('./harness.mjs')
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { electron, h, v, go } = c
const middle = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]
try {
  const open = (await v('tasks')).filter((one) => one.status === 'open').length
  // The one read, called 21 times in the main process (none on a build before it existed).
  const read = await electron.evaluate(async ({ ipcMain }) => {
    const run = ipcMain._invokeHandlers.get('haligtree:sessions:spent')
    if (!run) return null
    const took = []
    let tasks = 0
    for (let n = 0; n < 21; n++) { const from = performance.now(); const got = await run({}); took.push(performance.now() - from); tasks = Object.keys(got.spent).length }
    return { ms: took.sort((a, b) => a - b)[10], tasks }
  })
  const drawn = []
  for (let n = 0; n < 8; n++) {
    await go('home')
    await h.waitForTimeout(500)
    await h.evaluate(() => (window.__from = performance.now()))
    await c.send('view', 'alltasks')
    const ms = await h.evaluate(() => new Promise((done) => {
      const look = () => { const row = document.querySelector('[data-task-row]'); if (row && getComputedStyle(row).visibility === 'visible') done(performance.now() - window.__from); else requestAnimationFrame(look) }
      look()
    }))
    // The first opening reads everything for the first time: it is said, and left out of the middle.
    if (n) drawn.push(Math.round(ms))
    else console.log(`first opening: ${Math.round(ms)} ms`)
    await h.waitForTimeout(600)
  }
  // Scrolled a little, past the example book's own tasks, to rows of the five thousand.
  await h.evaluate(() => { let one = document.querySelector('[data-task-row]')?.parentElement; while (one && !(one.scrollHeight > one.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(one).overflowY))) one = one.parentElement; if (one) one.scrollTop = 2400 })
  await h.waitForTimeout(700)
  const rows = await h.evaluate(() => document.querySelectorAll('[data-task-row]').length)
  const timed = await h.evaluate(() => [...document.querySelectorAll('[data-task-spent]')].filter((one) => one.textContent === '1 h 40 min so far').length)
  console.log(`TIMING ${open} open tasks: “All” drew in ${middle(drawn)} ms (middle of ${drawn.join(', ')}); the one read ${read ? `${read.ms.toFixed(1)} ms for ${read.tasks} tasks with time` : 'not in this build'}; ${rows} rows drawn, ${timed} saying a time`)
  check(`a book of ${open} open tasks: “All” draws only the rows in sight (${rows})`, open >= 5000 && rows > 5 && rows < 200)
  if (read) check(`the one read behind every row's time takes under 50 ms with 20,000 sessions on 5,000 tasks (${read.ms.toFixed(1)} ms)`, read.tasks >= 5000 && read.ms < 50, `${read.tasks} tasks`)
  if (read) check('rows in sight say their time: four sessions of 25 minutes read “1 h 40 min so far”', timed > 0, `${timed} of ${rows}`)
} finally {
  await c.close()
}
done()
