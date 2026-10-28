// ⌘W (File > Close) closes the frontmost thing open, never the whole window while something is: a task or note open
// beside its list goes first, then a panel or dialog; with nothing open, the window.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/close-front.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const closeKey = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('menu:close'))
const homeOpen = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('view=home') && w.isVisible()))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const tasks = await v('tasks')
  const task = tasks.find((one) => one.status === 'open')
  await c.send('task', task.id); await wait(1800)
  const before = await h.evaluate(() => !!document.querySelector('[data-close-beside]'))
  await closeKey(); await wait(900)
  check('⌘W closes the task open beside its list, not the window', before && !(await h.evaluate(() => !!document.querySelector('[data-close-beside]'))) && (await homeOpen()))
  const gems = await v('items', 'nugget')
  await c.send('nugget', gems[0].id); await wait(1800)
  const url = await h.evaluate(() => !!document.querySelector('[data-open]'))
  await closeKey(); await wait(900)
  check('⌘W closes an open gem, not the window', url && !(await h.evaluate(() => !!document.querySelector('[data-open]'))) && (await homeOpen()))
  await h.keyboard.press('Meta+k'); await wait(700)
  await closeKey(); await wait(700)
  check('⌘W closes search, not the window', !(await h.evaluate(() => !!document.querySelector('[role="dialog"]'))) && (await homeOpen()))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
