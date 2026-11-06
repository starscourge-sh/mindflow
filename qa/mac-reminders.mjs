// A task as a Reminder (every Mac, EventKit), against a stand-in for Reminders (HALIGTREE_QA_REMINDERS, a
// file in this run's own folder: the real Reminders are never touched): a task's right-click has "Add to
// Reminders"; chosen, a reminder with its title and day is made; ticked "in Reminders", the task is done
// here; a task done here is ticked there; "Take out of Reminders" takes the reminder away and leaves the task.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-reminders.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'

const file = join(process.env.QA_DATA, 'reminders-stand-in.json')
process.env.HALIGTREE_QA_REMINDERS = file
const { open } = await import('./harness.mjs')
const { check, done } = checks()
const qa = await open()
const { electron, page } = qa
const store = () => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}
try {
  for (const text of ['Hand in the essay today 5pm', 'Return the library books today', 'Water the plants every day', 'Ring the dentist today'])
    await page.evaluate((t) => window.api.haligtree('task:add', t), text)
  await page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  const tasks = await page.evaluate(() => window.api.haligtree('tasks'))
  const id = (t) => tasks.find((one) => one.title.startsWith(t)).id
  await electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('home')); w?.setBounds({ width: 1400, height: 860 }); w?.show() })
  const h = electron.windows().find((w) => w.url().includes('home'))
  await h.reload()
  await h.waitForTimeout(2500)
  await h.keyboard.press('Escape')
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('home'))?.webContents.send('home:open', 'view', 'day'))
  await h.waitForTimeout(1500)
  const menu = async (text) => {
    await h.locator('[data-pane]').getByText(text).first().click({ button: 'right' })
    await h.waitForTimeout(500)
    return h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  }
  let lines = await menu('Water the plants')
  check('a repeating task is not offered to Reminders', !lines.some((one) => /Reminders/.test(one)), lines.join(' / '))
  await h.keyboard.press('Escape')
  lines = await menu('Hand in the essay')
  check('a task’s right-click has “Add to Reminders”', lines.some((one) => one.startsWith('Add to Reminders')), lines.join(' / '))
  if (process.env.SHOT) await h.screenshot({ path: `${process.env.SHOT}/reminders-menu-light.png` })
  await h.locator('[role="menu"] [role="menuitem"]').filter({ hasText: 'Add to Reminders' }).first().click()
  await h.waitForTimeout(1200)
  const made = Object.values(store())
  check('chosen, a reminder is made with its title and day', made.length === 1 && made[0].title === 'Hand in the essay' && !!made[0].due, JSON.stringify(made))
  const toast = await h.evaluate(() => document.body.innerText.match(/In Reminders:[^\n]*/)?.[0] ?? null)
  check('a notice says it is in Reminders and that its tick comes back', /In Reminders: “Hand in the essay”\. Ticked there, it is done here/.test(toast ?? ''), toast)
  await h.keyboard.press('Escape')
  lines = await menu('Hand in the essay')
  check('its menu now has “Take out of Reminders”', lines.some((one) => one.startsWith('Take out of Reminders')), lines.join(' / '))
  await h.keyboard.press('Escape')
  // Ticked in Reminders.
  const all = store()
  for (const key of Object.keys(all)) all[key].completed = true
  writeFileSync(file, JSON.stringify(all))
  await h.evaluate(() => window.dispatchEvent(new Event('focus')))
  await h.waitForTimeout(1500)
  const status = (t) => h.evaluate((i) => window.api.haligtree('task', i).then((one) => one?.status), id(t))
  check('ticked in Reminders, the task is done here', (await status('Hand in the essay')) === 'done', await status('Hand in the essay'))
  // Done here, ticked there.
  await h.locator('[data-pane]').getByText('Return the library books').first().click({ button: 'right' })
  await h.waitForTimeout(400)
  await h.locator('[role="menu"] [role="menuitem"]').filter({ hasText: 'Add to Reminders' }).first().click()
  await h.waitForTimeout(1000)
  await h.evaluate((i) => window.api.haligtree('task:done', i), id('Return the library books'))
  await h.evaluate(() => window.dispatchEvent(new Event('focus')))
  await h.waitForTimeout(1500)
  const books = Object.values(store()).find((one) => one.title === 'Return the library books')
  check('done here, it is ticked in Reminders', books?.completed === true, JSON.stringify(books))
  // Taken out.
  await h.locator('[data-pane]').getByText('Ring the dentist').first().click({ button: 'right' })
  await h.waitForTimeout(400)
  await h.locator('[role="menu"] [role="menuitem"]').filter({ hasText: 'Add to Reminders' }).first().click()
  await h.waitForTimeout(1000)
  await h.locator('[data-pane]').getByText('Ring the dentist').first().click({ button: 'right' })
  await h.waitForTimeout(400)
  await h.locator('[role="menu"] [role="menuitem"]').filter({ hasText: 'Take out of Reminders' }).first().click()
  await h.waitForTimeout(1000)
  check('“Take out of Reminders” takes the reminder away and leaves the task', !Object.values(store()).some((one) => one.title === 'Ring the dentist') && (await status('Ring the dentist')) === 'open')
} finally {
  await qa.close().catch(() => {})
  try { qa.electron.process().kill('SIGKILL') } catch {}
}
done()
