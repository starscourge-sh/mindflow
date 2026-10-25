// The session bubble's tips are never cut off: pointing at the session's name
// opens its tip below the pill, wholly inside the bubble's window, floating
// free; and there the pill hangs 14px below the
// top of its window, clear of the menu bar's edge.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_NOTCH=1 SHOT=<dir> node qa/pill-tip-room.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const pillWindow = async () => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes('view=focus'))
    if (found) return found
    await wait(200)
  }
  throw new Error('no pill')
}
try {
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  const task = (await v('tasks')).find((one) => one.status === 'open' && one.title)
  // Under the notch tips already had their room; floating free is where they were cut off.
  for (const sits of ['free']) {
    await v('settings:set', { sounds: false, motion: false, countIn: false, focusShows: 'bubble', pillSits: sits })
    const id = await v('session:start', task.id, 'Write the chapter on rivers', 12000)
    await h.evaluate(() => window.api.showFocus(true))
    const pill = await pillWindow()
    await pill.waitForTimeout(6000)
    await pill.hover('[data-session-goal]').catch(() => {})
    await pill.waitForTimeout(1500)
    const m = await pill.evaluate(() => {
      const tip = [...document.querySelectorAll('[data-slot="tooltip-content"], [role="tooltip"]')].map((one) => one.getBoundingClientRect()).find((r) => r.height > 0)
      const island = document.querySelector('[data-island]')?.getBoundingClientRect()
      return { tip: tip && { top: Math.round(tip.top), bottom: Math.round(tip.bottom) }, inner: window.innerHeight, islandTop: island && Math.round(island.top) }
    })
    if (process.env.SHOT) await pill.screenshot({ path: `${process.env.SHOT}/tip-${sits}.png` }).catch(() => {})
    check(`${sits}: the tip shows`, !!m.tip, JSON.stringify(m))
    check(`${sits}: and fits inside the bubble's window`, !!m.tip && m.tip.bottom <= m.inner && m.tip.top >= 0, JSON.stringify(m))
    if (sits === 'free') check('free: the pill hangs 14px below the top', m.islandTop >= 14, JSON.stringify(m))
    await pill.mouse.move(1, 1)
    await v('session:cancel', id)
    await pill.waitForTimeout(1500)
  }
} finally {
  await c.close()
}
done()
