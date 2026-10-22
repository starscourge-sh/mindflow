// Arriving in the sandbox is never a blank screen: the main window is shown
// only once its page has drawn itself (the opening screen first, the examples
// filled in after), and within a time limit. Then the desktop has two
// stickies only, one column: the best-known goal's card (Dune) over Today's
// list, each with exactly one window. And the blade's sound waits for the
// window to be on screen.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS="--sandbox --show-home" QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sandbox-open.mjs
// QA_OPEN_BUDGET (ms, 4000 by default): from the start of the run to the window on screen.
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const BUDGET = Number(process.env.QA_OPEN_BUDGET ?? 4000)
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h } = c
try {
  const times = await electron.evaluate(() => globalThis.haligtreeHomeTimes)
  check('the window is shown only after its page has drawn itself', times.drawn && times.shown >= times.drawn, JSON.stringify(times))
  check(`and it is on screen within ${BUDGET}ms of the start`, times.shown && times.shown <= BUDGET, `${times.shown}ms (made ${times.made}, painted ${times.painted}, drawn ${times.drawn})`)
  check('arriving, it opens on the opening screen, not a bare page', await h.evaluate(() => new URLSearchParams(location.search).has('arrived')))

  // Two stickies, once the examples are set out: Dune's card and Today, in one column.
  let wins = []
  for (let i = 0; i < 40; i++) {
    wins = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('view=sticky')).map((w) => { const u = new URL(w.webContents.getURL()); return { key: `${u.searchParams.get('type')}:${u.searchParams.get('id')}`, b: w.getBounds(), visible: w.isVisible() } }))
    if (wins.filter((one) => one.visible).length >= 2) break
    await wait(500)
  }
  await wait(1500)
  wins = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('view=sticky')).map((w) => { const u = new URL(w.webContents.getURL()); return { key: `${u.searchParams.get('type')}:${u.searchParams.get('id')}`, b: w.getBounds(), visible: w.isVisible() } }))
  const goals = (await c.v('items', 'goal')).filter((one) => !one.closedAt)
  const dune = goals.find((one) => /Dune/.test(one.title))
  const keys = wins.map((one) => one.key)
  check('two stickies in all: Dune\'s card and Today', wins.length === 2 && keys.includes(`goal:${dune?.id}`) && keys.includes('today:today'), keys.join(', '))
  check('each sticky has exactly one window', new Set(keys).size === keys.length, keys.join(', '))
  const goal = wins.find((one) => one.key.startsWith('goal:'))
  const today = wins.find((one) => one.key === 'today:today')
  check('in one column: the goal over Today, right edges lined up, not overlapping', goal && today && Math.abs(goal.b.x + goal.b.width - (today.b.x + today.b.width)) <= 2 && goal.b.y + goal.b.height <= today.b.y + 20, JSON.stringify([goal?.b, today?.b]))

  // The blade's sound waits for the window: hidden, asked from the menu bar, it hums only once shown.
  await electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); w.hide(); globalThis.qaShownAt = null; w.once('show', () => (globalThis.qaShownAt = Date.now())) })
  await h.evaluate(() => { window.__humAt = null; const list = window.haligtreeSaber; const push = list.push.bind(list); list.push = (...a) => ((window.__humAt = Date.now()), push(...a)) })
  // Out of the sandbox is the same blade (saberOff), and stops short of the restart here.
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('haligtree:sandbox:leave'); ipcMain.handle('haligtree:sandbox:leave', () => 0) })
  await electron.evaluate(({ BrowserWindow }) => setTimeout(() => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')).show(), 600))
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:sandbox-leave')))
  await wait(2500)
  const humAt = await h.evaluate(() => window.__humAt)
  const shownAt = await electron.evaluate(() => globalThis.qaShownAt)
  check('the blade\'s sound starts only once the window is on screen', humAt && shownAt && humAt >= shownAt, `sound ${humAt && shownAt ? humAt - shownAt : '?'}ms after the window showed`)
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
