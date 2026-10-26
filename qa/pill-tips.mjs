// The session bubble's tips sit inside its card, never against its edge: opened over Time's up, each tip keeps
// at least 12px from every edge of the bubble's window (which is the card's own edge).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pill-tips.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms))
const c = await sandbox({ width: 1100, height: 900 })
const { electron, h, v } = c
try {
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  await v('settings:set', { sounds: false, countIn: false, focusShows: 'bubble' })
  const task = (await v('tasks')).find((one) => one.status === 'open' && one.title)
  await v('session:start', task.id, 'Tips', 3000)
  await h.evaluate(() => window.api.showFocus(true))
  let pill
  for (let i = 0; i < 50 && !pill; i++) (pill = electron.windows().find((one) => one.url().includes('view=focus'))), await wait(200)
  await pill.waitForLoadState('domcontentloaded')
  await wait(6000)
  const buttons = await pill.$$('[data-island] button')
  const worst = []
  for (const button of buttons) {
    if (!(await button.isVisible())) continue
    await button.hover({ force: true, timeout: 3000 }).catch(() => {}); await wait(700)
    const gap = await pill.evaluate(() => { const tip = document.querySelector('[data-slot="tooltip-content"], [role="tooltip"]'); if (!tip) return null; const r = tip.getBoundingClientRect(); return Math.min(r.left, innerWidth - r.right, r.top, innerHeight - r.bottom) })
    if (gap !== null) worst.push(Math.round(gap))
    await pill.mouse.move(1, 1); await wait(300)
  }
  check('tips opened over the card', worst.length >= 2, JSON.stringify(worst))
  check('each keeps 12px or more from the card\'s edges', worst.every((one) => one >= 12), JSON.stringify(worst))
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
