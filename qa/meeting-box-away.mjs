// Quick capture open as a recording starts: it goes as the recording's card comes, so one Haligtree window floats
// at a time; it opens again on its key, with what was typed in it kept.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/meeting-box-away.mjs
import { checks } from './harness.mjs'
import { recorded } from './meeting-flow.mjs'
const { check, done } = checks()
const { c, card } = await recorded({})
const wait = (ms) => c.h.waitForTimeout(ms)
const box = () => c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))?.isVisible() ?? false)
try {
  await c.h.evaluate(() => window.api.showPrompt()); await wait(1200)
  check('quick capture is open to start with', await box())
  await c.v('meeting:start', null)
  const m = await card(); await wait(1200)
  check('the recording card comes up', !!m)
  check('and quick capture goes', !(await box()))
  await c.h.evaluate(() => window.api.showPrompt()); await wait(1000)
  check('it opens again on its key while recording', await box())
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await c.close()
done()
