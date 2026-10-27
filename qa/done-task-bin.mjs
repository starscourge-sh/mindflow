// A task already done can leave the day's list: its right-click menu has "Move to the Bin"; it is then no longer counted as done, and Undo brings it back done.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/done-task-bin.mjs
import { open, checks } from './harness.mjs'

const { check, done } = checks()
const qa = await open()
const { electron, page } = qa
for (const text of ['send the docs today', 'fix the account today', 'book flights today'])
  await page.evaluate((t) => window.api.haligtree('task:add', t), text)
await page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
const tasks = await page.evaluate(() => window.api.haligtree('tasks'))
const id = (t) => tasks.find((one) => one.title.startsWith(t)).id
for (const t of ['send the docs', 'fix the account']) await page.evaluate((i) => window.api.haligtree('task:done', i), id(t))
await page.waitForTimeout(800)
await electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('home')); w?.setBounds({ width: 1400, height: 860 }); w?.show() })
const h = electron.windows().find((w) => w.url().includes('home'))
await h.reload()
await h.waitForTimeout(2500)
await h.keyboard.press('Escape')
await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('home'))?.webContents.send('home:open', 'view', 'day'))
await h.waitForTimeout(1200)
const status = (t) => h.evaluate((i) => window.api.haligtree('task', i).then((one) => one?.status), id(t))
const shown = (t) => h.evaluate((t) => [...document.querySelectorAll('[data-pane] li, [data-pane] [data-sortable-id]')].some((one) => one.textContent.includes(t) && one.getBoundingClientRect().height), t)
try {
  check('a done task shows on the day\'s list', await shown('send the docs'), JSON.stringify({ st: await status('send the docs'), rows: await h.evaluate(() => [...document.querySelectorAll('[data-pane] li')].map((one) => one.textContent.slice(0, 30))), page: await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page')) }))
  await h.locator('[data-pane]').getByText('send the docs').first().click({ button: 'right' })
  await h.waitForTimeout(500)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  check('its menu offers "Move to the Bin"', lines.some((one) => one.startsWith('Move to the Bin')), JSON.stringify(lines))
  await h.locator('[role="menu"] [role="menuitem"]').filter({ hasText: 'Move to the Bin' }).first().click()
  await h.waitForTimeout(1200)
  check('it leaves the list, in the Bin', (await status('send the docs')) === 'dropped' && !(await shown('send the docs')), JSON.stringify([await status('send the docs'), await h.evaluate(() => [...document.querySelectorAll('[data-pane] li, [data-pane] [data-sortable-id]')].filter((one) => one.textContent.includes('send the docs') && one.getBoundingClientRect().height).map((one) => one.outerHTML.slice(0, 300)))]))
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(1200)
  check('Undo brings it back done', (await status('send the docs')) === 'done', await status('send the docs'))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await qa.close?.()
}
done()
