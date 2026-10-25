// Stopping a session before its time asks, in place on the pill, whether to
// count it: "End early, count it" or "Abandon, don't count it", Back or Escape
// keeping it running. After ending early the band offers Keep going (the same
// session again for the time it had left), not Go again; after abandoning,
// only Undo. Abandon is in the pill's right-click words, ⌘K and the task's page too.
//
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [HALIGTREE_QA_NOTCH=1] SHOT=<dir> node qa/stop-ask.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const notch = !!process.env.HALIGTREE_QA_NOTCH
const tag = notch ? 'notch' : 'float'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

const c = await sandbox({ width: 1100, height: 800 })
const { electron, h, v } = c
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
  await v('settings:set', { sounds: true, motion: true, countIn: false, focusShows: 'bubble', pillSits: notch ? 'notch' : 'free' })
  const task = (await v('tasks')).find((one) => one.status === 'open' && one.title)
  const begin = async (goal) => {
    const id = await v('session:start', task.id, goal, 25 * 60000)
    await h.evaluate(() => window.api.showFocus(true))
    return id
  }
  let id = await begin('Draft the essay')
  const pill = await pillWindow()
  pill.on('pageerror', (error) => c.errors.push('PILL PAGEERROR ' + error.message))
  await pill.waitForLoadState('domcontentloaded')
  await pill.waitForTimeout(3500)
  const heard = () => pill.evaluate(() => (window.haligtreeHeard ?? []).splice(0))
  const stop = async () => {
    await pill.hover('[data-island]', { position: { x: 160, y: 10 } })
    await pill.waitForTimeout(900)
    await pill.locator('[data-island] button', { hasText: 'Stop' }).click()
    await pill.waitForTimeout(500)
  }

  // 1. Stop asks; Escape backs out and the session keeps running.
  await stop()
  check('Stop before time asks in place', await pill.locator('[data-stop-ask]').count() === 1)
  const words = await pill.locator('[data-stop-ask]').innerText().catch(() => '')
  check('with both choices in plain words', words.includes('End early?') && words.includes('Count it') && words.includes("Don't count it"), words.replace(/\s+/g, ' '))
  if (SHOT) await pill.screenshot({ path: `${SHOT}/stop-ask-${tag}.png` })
  await pill.keyboard.press('Escape')
  await pill.waitForTimeout(400)
  check('Escape backs out', await pill.locator('[data-stop-ask]').count() === 0)
  check('and it is still running', (await v('focus:now'))?.id === id)

  // 2. End early: counted, and the band offers Keep going, not Go again.
  await stop()
  await heard()
  await pill.locator('[data-end-early]').click()
  await pill.waitForTimeout(1200)
  check('End early ends it, counted', !(await v('focus:now')) && (await v('sessions', task.id)).some((one) => one.id === id && one.endedAt && !one.abandonedAt))
  check('the band offers Keep going', await pill.locator('[data-keep-going]').count() === 1)
  check('and no Go again', await pill.locator('[data-after] [data-again]').count() === 0)
  if (SHOT) await pill.screenshot({ path: `${SHOT}/ended-early-${tag}.png` })
  await wait(2000)
  await pill.locator('[data-keep-going]').click()
  await pill.waitForTimeout(1500)
  const back = await v('focus:now')
  check('Keep going brings the same session back', back?.id === id)
  check('the minutes it was stopped not counted', back && back.pausedMs >= 1500, String(back?.pausedMs))
  check('the pill shows it again', await pill.locator('[data-island]').count() === 1)
  check('its window still on screen', await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=focus'))?.isVisible()))

  // 3. Abandon: not counted, the band says so with Undo, never Go again.
  await wait(2500)
  await pill.mouse.move(5, 300)
  await stop()
  await pill.locator('[data-abandon]').click()
  await pill.waitForTimeout(1000)
  const row = (await v('sessions', task.id)).find((one) => one.id === id)
  check('Abandon ends it, not counted', !!row?.abandonedAt)
  check('the band says so', (await pill.locator('[data-abandoned]').innerText().catch(() => '')).includes('not counted'))
  check('with Undo and no Go again', await pill.locator('[data-abandoned] button', { hasText: 'Undo' }).count() === 1 && await pill.locator('[data-after] [data-again]').count() === 0)
  if (SHOT) await pill.screenshot({ path: `${SHOT}/abandoned-${tag}.png` })
  await pill.locator('[data-abandoned] button', { hasText: 'Undo' }).click()
  await pill.waitForTimeout(1200)
  check('Undo puts it back running', (await v('focus:now'))?.id === id)

  // 4. Abandon in ⌘K and on the task's page, the same words.
  await h.reload(); await h.waitForTimeout(1500)
  await h.keyboard.press('Meta+k'); await h.waitForTimeout(500)
  await h.keyboard.type('abandon'); await h.waitForTimeout(600)
  const found = await h.evaluate(() => document.body.innerText.includes("Abandon session, don't count it"))
  check('⌘K has Abandon in the same words', found)
  await h.keyboard.press('Escape')
  await c.send('task', task.id); await h.waitForTimeout(1200)
  check("the task's page has it too", await h.locator('button', { hasText: "Abandon, don't count it" }).count() > 0)
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
