// The welcome asked for in the sandbox (Settings' “Show it”, ⌘K's “Show the welcome in the sandbox”) arrives once: the
// sandbox's main window is made as the welcome's window from the start because it carries the welcome (main:
// carriesWelcome), in the middle of the screen, and the welcome's scene plays once, drawing in to that same window.
// The ask writes `sandbox/carry.json` with the welcome in it before the sandbox starts (lib/sandbox.ts enterSandbox); here
// it is written as that does, on a copy of the seeded sandbox:
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-sandbox-once.mjs
import { writeFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

// The arrival allowed in this test run.
process.env.HALIGTREE_QA_ARRIVAL = 'again'
const { check, done } = checks()
writeFileSync(join(process.env.QA_DATA, 'sandbox', 'carry.json'), JSON.stringify({ local: {}, settings: {}, welcome: { at: Date.now() } }))
const c = await sandbox({ width: 1100, height: 760, seeded: false })
const { h, electron, errors, close } = c
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const homes = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=home')).map((one) => one.webContents.getURL().replace(/^.*\?/, '')))
try {
  // Watched until the welcome's first words: every main window and scene window there was at any moment.
  let most = 0
  let scenes = 0
  let sceneUp = false
  const seen = new Set()
  let words = false
  for (let i = 0; i < 300 && !words; i++) {
    const now = await homes()
    most = Math.max(most, now.length)
    now.forEach((one) => seen.add(one))
    const up = c.electron.windows().some((one) => one.url().includes('view=scene'))
    if (up && !sceneUp) scenes++
    sceneUp = up
    words = await h.evaluate(() => !!document.querySelector('[data-thesis]')).catch(() => false)
    await wait(100)
  }
  const steps = (await electron.evaluate(() => globalThis.haligtreeArrival?.() ?? null))?.steps?.map((one) => one.what) ?? []
  check('the welcome\'s scene played once, into that same window', scenes === 1 && words && steps.filter((one) => one === 'start').length === 1, JSON.stringify({ scenes, words, steps }))
  check('once: no window made in its place, one main window throughout', most === 1 && seen.size === 1, JSON.stringify({ most, seen: [...seen] }))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
