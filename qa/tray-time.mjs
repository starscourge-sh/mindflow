// The menu bar's dropdown: the day, week, month and year bars are said as time
// gone, in a “Time gone” submenu of their own, apart from the goals, so they
// are never read as a goal's progress and the menu stays short. Read from the menu's own
// template in main (kept on globalThis.trayMenu in a test run).
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tray-time.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1000, height: 700 })
const { electron, v } = c
const menu = () => electron.evaluate(() => globalThis.trayMenu ?? [])
try {
  // A goal of its own, so the menu has its Goals part above the bars.
  const at = new Date(Date.now() + 92 * 86_400_000).toISOString().slice(0, 10)
  const made = await v('goal:new', 'Complete Ten Caesars Book', at).catch((error) => String(error))
  let items = []
  // The bars are drawn by the main window once it has painted: wait for the drawn rows.
  for (let i = 0; i < 40; i++) {
    items = await menu()
    if (items.some((one) => one.drawn)) break
    await new Promise((ok) => setTimeout(ok, 250))
  }
  const labels = items.map((one) => one.type === 'separator' ? '---' : one.label || `[${one.toolTip}]`)
  console.log(labels.slice(0, 14).join(' | '))
  const head = items.findIndex((one) => one.label === 'Time gone')
  const goals = items.findIndex((one) => one.label === 'Goals')
  check('the menu has a goal in its Goals part', goals >= 0 && items.some((one) => /of the way/.test(one.sublabel)), String(made))
  check('the time bars are under their own “Time gone”, a submenu apart from the goals', head > goals && items[head].enabled)
  const rows = items.slice(head + 1, head + 5)
  const said = rows.map((one) => one.toolTip)
  check('four rows under it: Today, This week, This month, This year', ['Today', 'This week', 'This month', 'This year'].every((name, i) => said[i]?.startsWith(name)), said.join(' / '))
  check('each says how much has gone, “83% gone”', said.length === 4 && said.every((one) => /\b\d{1,3}% gone$/.test(one)), said.join(' / '))
  check('drawn as pictures the menu\'s width, not plain lines', rows.every((one) => one.drawn && !one.enabled))
  check('no row says “of the way”, which is the goal\'s words', !said.some((one) => /of the way/.test(one)))
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 300))
} finally {
  await c.close()
}
done()
