// A test run's freeze log is written inside the run's own data folder, never among the real ones in
// ~/Library/Logs, and it ends with what the main process had in hand (src/main/stalls.ts).
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_FREEZE_CATCH=1 node qa/freeze-log-place.mjs
//
// The main window's page is held in a loop for 9 s (longer than the 3 s after which a window counts as frozen), the
// log is waited for, and the folder it lands in is checked: under QA_DATA, with the main process's block at its end.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_FREEZE_CATCH ??= '1'

const { check, done } = checks()
/** The freeze logs in a folder (none when the folder is not there). */
const logsIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((name) => /^freeze-.*\.txt$/.test(name)) : [])
const real = ['Haligtree', 'haligtree', 'Electron'].map((name) => join(homedir(), 'Library', 'Logs', name))
const before = real.map((dir) => logsIn(dir).length)
const c = await sandbox({ width: 1100, height: 800 })
const { h, electron } = c
try {
  const dir = await electron.evaluate(({ app }) => app.getPath('logs'))
  const data = process.env.QA_DATA ?? ''
  check('a test run keeps its logs inside its own data folder', !!data && dir.startsWith(data) && !dir.includes(join('Library', 'Logs')), dir)
  await h.waitForTimeout(1500)
  // Held from a timer, so this call itself comes back.
  await h.evaluate(() => void setTimeout(() => { const from = Date.now(); while (Date.now() - from < 9000) { /* held */ } }, 50))
  let found = []
  for (let i = 0; i < 80 && !found.length; i++) (await new Promise((next) => setTimeout(next, 500)), (found = logsIn(dir)))
  check('the frozen window wrote its freeze log there', found.length > 0, `${found.length} in ${dir}`)
  const text = found.length ? readFileSync(join(dir, found[0]), 'utf8') : ''
  check('the log ends with what the main process had in hand', /The main process \(its one thread also answers every window\):/.test(text) && /event loop delay since last asked/.test(text) && /the slowest this run:/.test(text), text.slice(text.indexOf('The main process'), text.indexOf('The main process') + 300).replace(/\n/g, ' | '))
  check('nothing was written among the real logs in ~/Library/Logs', real.every((one, at) => logsIn(one).length === before[at]), real.map((one, at) => `${one}: ${before[at]} then ${logsIn(one).length}`).join('; '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
  done()
}
