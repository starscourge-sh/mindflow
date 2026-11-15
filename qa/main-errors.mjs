// An error main did not expect is written to the app's log and the app goes on, never Electron's raw box in front of a
// person (the user, 15 Nov 2026: "i dont want the users getting such errors"). A run with HALIGTREE_QA_MAIN_ERRORS=1
// keeps the app's own keeper on (main-errors.ts): main throws once and rejects once; both are in main-errors.log,
// and the window still answers.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/main-errors.mjs
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_MAIN_ERRORS = '1'

const { check, done } = checks()
const c = await sandbox({ width: 1000, height: 700 })
try {
  const logs = await c.electron.evaluate(({ app }) => app.getPath('logs'))
  await c.electron.evaluate(() => {
    setTimeout(() => { throw new Error('main-errors probe: thrown on purpose') }, 0)
    Promise.reject(new Error('main-errors probe: rejected on purpose'))
  })
  await c.h.waitForTimeout(1200)
  const file = join(logs, 'main-errors.log')
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  check('the thrown error is in main-errors.log, with its stack', /Uncaught exception\n[^\n]*thrown on purpose\n\s+at /.test(text), file)
  check('the rejection is in it too', /Unhandled rejection\n[^\n]*rejected on purpose/.test(text))
  check('the app goes on: its window still answers', (await c.h.evaluate(() => 1 + 1)) === 2)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
