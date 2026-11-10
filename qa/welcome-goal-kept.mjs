// The welcome's goal stays yours once it is made. Leaving a welcome played again on a later day neither takes the goal
// away (with its log) nor makes it afresh, and a goal you took away yourself never comes back. Its day, "in 3
// months" when none was picked, was counted again from each new today, read as a changed answer, and "learn Spanish"
// kept coming back on the user's desktop (10 Nov).
//   npx electron-vite build --outDir out-p && QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-goal-kept.mjs
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = (process.env.QA_ARGS ?? '').replace('--sandbox', '').trim()
let failed = 0
const check = (name, ok, more = '') => (failed += ok ? 0 : 1, console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`))
const dbs = (dir) => readdirSync(dir).flatMap((one) => { const p = join(dir, one); return statSync(p).isDirectory() ? dbs(p) : one === 'haligtree.db' ? [p] : [] })
const spanish = () => dbs(process.env.QA_DATA).flatMap((p) => { const d = new DatabaseSync(p, { readOnly: true }); const rows = d.prepare("select id from nuggets where tier = 'goal' and title = 'learn Spanish'").all(); d.close(); return rows.map((r) => r.id) })
const c = await sandbox({ seeded: false })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
// Through the welcome to its end, by its own "Skip the welcome" and "Start without the tour".
const playAndLeave = async () => {
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  await wait(1200)
  for (const name of ['Skip the welcome', 'Start without the tour']) {
    for (let i = 0; i < 20 && !(await h.evaluate((n) => [...document.querySelectorAll('.mf-welcome button')].some((b) => b.textContent.trim() === n), name)); i++) await wait(300)
    // Pressed as the page has it: the button is still sliding in when it first shows.
    await h.evaluate((n) => [...document.querySelectorAll('.mf-welcome button')].find((b) => b.textContent.trim() === n)?.click(), name)
    await wait(1500)
  }
  await h.waitForSelector('.mf-welcome', { state: 'detached', timeout: 8000 }).catch(() => {})
  await wait(1500)
}
try {
  await h.waitForSelector('.mf-welcome', { timeout: 8000 }).catch(() => {})
  // Made by a welcome a week ago: "in 3 months" from then.
  const then = new Date(Date.now() + 85 * 86400000).toISOString().slice(0, 10)
  const id = await v('goal:new', 'learn Spanish', then, null, null)
  await v('onboarding:set', { welcomed: new Date().toISOString(), setup: { use: null, from: [], space: null, exam: null, goal: 'learn Spanish', goalBy: null, made: { goalId: id, goalTitle: 'learn Spanish', goalBy: then } } })
  await playAndLeave()
  let now = spanish()
  check('played again a week later and left: the same goal is kept, not taken away and made afresh', now.length === 1 && now[0] === id, JSON.stringify({ id, now }))
  // Taken away by you, then the welcome played again: it stays gone.
  await v('goal:drop', id)
  await playAndLeave()
  now = spanish()
  check('a goal you took away stays gone after the welcome is played again', now.length === 0, JSON.stringify(now))
  await playAndLeave()
  check('and again', spanish().length === 0)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
