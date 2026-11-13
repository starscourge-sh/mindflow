// The welcome asked for in the sandbox (Settings' “Show it”, ⌘K's “Show the welcome in the sandbox”) arrives once: the
// sandbox's main window is made see-through from the start because it carries the welcome (main: carriesWelcome), so the
// welcome comes out of the desktop from that same window, never a window of its own first and then one made in its place.
// The ask writes `sandbox/carry.json` with the welcome in it before the sandbox starts (lib/sandbox.ts enterSandbox); here
// it is written as that does, on a copy of the seeded sandbox:
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-sandbox-once.mjs
import { writeFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

// The arrival allowed in this test run; the window made see-through only if the sandbox carries the welcome.
process.env.HALIGTREE_QA_ARRIVAL = 'again'
const { check, done } = checks()
writeFileSync(join(process.env.QA_DATA, 'sandbox', 'carry.json'), JSON.stringify({ local: {}, settings: {}, welcome: { at: Date.now() } }))
const c = await sandbox({ width: 1100, height: 760, seeded: false })
const { h, electron, errors, close } = c
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const homes = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=home')).map((one) => one.webContents.getURL().replace(/^.*\?/, '')))
try {
  const made = await electron.evaluate(() => globalThis.haligtreeArrival?.() ?? null)
  check('the sandbox carrying the welcome made its main window see-through from the start', made?.made === true, JSON.stringify(made))
  // Watched until the welcome has come out of the desktop and landed: every main window there was at any moment.
  let most = 0
  const seen = new Set()
  let mist = false
  let landed = false
  for (let i = 0; i < 300 && !landed; i++) {
    const now = await homes()
    most = Math.max(most, now.length)
    now.forEach((one) => seen.add(one))
    mist ||= await h.evaluate(() => !!document.querySelector('[data-welcome-mist="desk"]')).catch(() => false)
    landed = mist && (await h.evaluate(() => !!window.haligtreeArrival?.landed).catch(() => false))
    await wait(100)
  }
  check('the welcome came out of the desktop from that same window', mist && landed, `mist ${mist}, landed ${landed} (load ${loadavg()[0].toFixed(1)})`)
  check('once: no window made in its place, one main window throughout', most === 1 && ![...seen].some((one) => one.includes('again=1')), JSON.stringify({ most, seen: [...seen] }))
  check('landed, the window is a window again', (await electron.evaluate(() => globalThis.haligtreeArrival?.() ?? null))?.clear === false)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
