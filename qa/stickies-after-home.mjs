// The stickies wait for the main window: each sticky comes on screen only
// after the main window has, on a first visit to the sandbox and after Reset.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/stickies-after-home.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
for (const way of ['first visit', 'after Reset']) {
  if (way === 'after Reset') process.env.QA_ARGS = '--sandbox --sandbox-reset'
  const c = await sandbox({ width: 1200, height: 800 })
  try {
    await c.h.waitForTimeout(4000)
    const t = await c.electron.evaluate(() => ({ home: globalThis.haligtreeHomeTimes, stickies: globalThis.haligtreeStickyTimes }))
    check(`${way}: stickies came`, t.stickies.length >= 1, JSON.stringify(t))
    check(`${way}: every sticky after the main window is on screen`, t.home.shown != null && t.stickies.every((at) => at >= t.home.shown), JSON.stringify(t))
  } finally {
    await c.close()
  }
}
done()
