// "Don't count it" never asks how it went: a session stopped and abandoned (started by accident) shows only
// "Session abandoned, not counted" with Undo, in every frame after the click, never "How did it go?". Tried for a
// session on a task, one with no task, and one ended early, brought back with Keep going, then abandoned.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [HALIGTREE_QA_NOTCH=1] [QA_SHOTS=dir] node qa/abandon-no-ask.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const c = await sandbox({ width: 1100, height: 800 })
const { electron, h, v } = c
try {
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  await v('settings:set', { countIn: false, focusShows: 'bubble', pillSits: process.env.HALIGTREE_QA_NOTCH ? 'notch' : 'free' })
  const task = (await v('tasks')).find((one) => one.status === 'open' && one.title)
  let pill = null
  const start = async (taskId, goal) => {
    const id = await v('session:start', taskId, goal, 25 * 60000)
    await h.evaluate(() => window.api.showFocus(true))
    for (let i = 0; i < 50 && !pill; i++) (pill = electron.windows().find((one) => one.url().includes('view=focus')) ?? null), await wait(200)
    await pill.waitForSelector('[data-island]', { timeout: 8000 })
    await pill.waitForTimeout(2500)
    return id
  }
  const stop = async () => {
    await pill.hover('[data-island]', { position: { x: 160, y: 10 } })
    await pill.waitForTimeout(900)
    await pill.locator('[data-island] button', { hasText: 'Stop' }).click()
    await pill.waitForTimeout(500)
  }
  // Every frame for 3s after the click: what the pill says.
  const watch = () => pill.evaluate(() => { window.__said = []; const end = performance.now() + 3000; const tick = () => { const text = document.body.innerText.replace(/\s+/g, ' '); window.__said.push(/How did it go|Where do you pick up/.test(text) ? 'ask' : document.querySelector('[data-abandoned]') ? 'abandoned' : 'other'); if (performance.now() < end) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  const abandonNow = async (name) => {
    await stop()
    await watch()
    await pill.locator('[data-abandon]').click()
    await wait(1200)
    if (shots) await pill.screenshot({ path: `${shots}/abandon-${name}.png` })
    await wait(2200)
    const said = await pill.evaluate(() => window.__said)
    check(`${name}: "Don't count it" never asks how it went, in any frame`, said.length > 20 && !said.includes('ask'), [...new Set(said)].join(' '))
    check(`${name}: it says "Session abandoned, not counted"`, said.includes('abandoned'))
    // Let the band go before the next one.
    await pill.mouse.move(5, 300)
    await wait(6000)
  }
  // 1. On a task.
  let id = await start(task.id, 'Started by accident')
  await abandonNow('on a task')
  check('...not counted', !!(await v('sessions', task.id)).find((one) => one.id === id)?.abandonedAt)
  // 2. No task.
  await start('', 'No task')
  await abandonNow('no task')
  // 3. Ended early, Keep going, then abandoned.
  id = await start(task.id, 'Ended early first')
  await stop()
  await pill.locator('[data-end-early]').click()
  await wait(2500)
  await pill.locator('[data-keep-going]').click()
  await wait(2500)
  check('Keep going brought it back', (await v('focus:now'))?.id === id)
  await pill.mouse.move(5, 300)
  await wait(1500)
  await abandonNow('after Keep going')
  // 4. With the five-second count-in on, abandoned straight after starting (the session started by accident).
  await v('settings:set', { countIn: true })
  const quick = await v('session:start', task.id, 'Counted in', 25 * 60000)
  await h.evaluate(() => window.api.showFocus(true))
  await pill.waitForSelector('[data-island]', { timeout: 8000 })
  await wait(1200)
  await abandonNow('during the count-in')
  check('...that one not counted, and not running again', !!(await v('sessions', task.id)).find((one) => one.id === quick)?.abandonedAt && !(await v('focus:now')))
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
