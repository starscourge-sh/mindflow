// The freeze catcher stays quiet while nobody can see the window (the screen locked, the Mac asleep), where macOS
// slows a page right down, and still catches a real freeze once the window is seen again (the user's dev terminal,
// 14 Nov 01:04 to 01:56: fifteen "main window stopped answering" while the screen was locked, each "no script was
// running", each "answered again 7.0s after it stopped").
//   HALIGTREE_FREEZE_CATCH=1 QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/freeze-quiet.mjs
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_FREEZE_CATCH = '1'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { h, electron } = c
const wait = (ms) => new Promise((next) => setTimeout(next, ms))
// The logs folder of this run (a run with its own data folder keeps its logs in it).
const logsAt = await electron.evaluate(({ app }) => app.getPath('logs'))
const freezes = () => (existsSync(logsAt) ? readdirSync(logsAt).filter((one) => one.startsWith('freeze-main-window')) : [])
// The main window's page held for five seconds, as a real freeze holds it (the ask is not awaited: it is the hold).
const hold = () => void h.evaluate(() => { const end = Date.now() + 5000; while (Date.now() < end); }).catch(() => {})
const tell = (what) => electron.evaluate(({ powerMonitor }, what) => powerMonitor.emit(what), what)
try {
  await wait(3000)
  const before = freezes().length
  await tell('lock-screen')
  hold()
  await wait(7000)
  check('the screen locked, a page held five seconds is not called a freeze', freezes().length === before, JSON.stringify(freezes()))
  await tell('unlock-screen')
  hold()
  await wait(7000)
  check('just back, the first answer is waited for, however long it takes', freezes().length === before, JSON.stringify(freezes()))
  await wait(2500)
  hold()
  await wait(12000)
  check('seen again, a page held five seconds is caught as a freeze, with its log', freezes().length === before + 1, JSON.stringify(freezes()))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()
