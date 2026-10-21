// "Haligtree can't see the screen yet" follows System Settings: allowed since Haligtree
// started, it says "Allowed. Restart Haligtree to use it" with a "Restart Haligtree"
// button; refused, it says so with plain help for a switch already on (off and
// on again); and it asks again while shown, so it clears once allowed.
// macOS is played by MINDFLOW_QA_FAKE_SCREEN, changed while the app runs.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/screen-access.mjs
// SHOTS=dir keeps pictures.
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

process.env.MINDFLOW_QA_FAKE_SCREEN = 'denied'
const shots = process.env.SHOTS
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, v } = c
const fake = (value) => electron.evaluate((_, value) => (process.env.MINDFLOW_QA_FAKE_SCREEN = value), value)
try {
  check('refused: the check says off', (await h.evaluate(() => window.api.screenAccess())) === 'off')
  await fake('restart')
  check('allowed since Haligtree started: the check says restart', (await h.evaluate(() => window.api.screenAccess())) === 'restart')
  const shot = await h.evaluate(() => window.api.screenShot())
  check('a screenshot then says a restart is needed', shot?.denied && shot.restart === true, JSON.stringify(shot))
  await fake('1')
  check('allowed and live: the check says on', (await h.evaluate(() => window.api.screenAccess())) === 'on')

  // The session bubble: its screenshot button, refused, then allowed since start, then live.
  await fake('denied')
  // At the Mac, as far as the pill knows, so it shows.
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  await v('settings:set', { boxHideButtons: false })
  const tasks = await v('tasks')
  const task = tasks.find((one) => one.status === 'open' && one.title) ?? tasks[0]
  await v('session:start', task.id, 'Practice', 25 * 60_000)
  await h.evaluate(() => window.api.showFocus(true))
  let pill = null
  for (let i = 0; i < 100 && !pill; i++) { pill = electron.windows().find((p) => p.url().includes('view=focus')) ?? null; if (!pill) await wait(250) }
  await pill.waitForLoadState('domcontentloaded')
  await wait(2000)
  await pill.hover('[data-island] button >> nth=0')
  await wait(700)
  await pill.locator('[aria-label="Add a screenshot"]').click()
  await wait(800)
  const said = () => pill.evaluate(() => document.querySelector('[data-screen-denied]')?.textContent ?? '')
  check('refused: “Haligtree can’t see the screen yet”, with help for a switch already on', /can’t see the screen yet/.test(await said()) && /turn it off and on/i.test(await said()), await said())
  if (shots) await pill.screenshot({ path: `${shots}/screen-refused.png` })
  await fake('restart')
  await wait(2600)
  check('allowed in System Settings meanwhile: it now says to restart, with a button', /Restart Haligtree to use it/.test(await said()) && await pill.locator('[data-screen-restart]').count() === 1, await said())
  if (shots) await pill.screenshot({ path: `${shots}/screen-restart.png` })
  await fake('1')
  await wait(2600)
  check('live: the notice goes by itself', !(await said()))
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
