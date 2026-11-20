// The sidebar's right click on each page row offers only what fits that row: "New page" on Writing's alone (it makes
// a Writing page), "Start a list" on Gems' alone; every row has Open (when not there), its moves, its hide line and
// "Customize the sidebar…". Real pointer.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [FRAMES=dir] node qa/sidebar-row-menus.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const FRAMES = process.env.FRAMES
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  await c.go('home')
  const rows = await h.evaluate(() => [...document.querySelectorAll('aside [data-side-row][aria-label]')].map((one) => one.getAttribute('aria-label')).filter(Boolean))
  const menus = {}
  for (const label of [...new Set(rows)]) {
    const row = h.locator(`aside [data-side-row][aria-label="${label}"]`).first()
    if (!(await row.isVisible().catch(() => false))) continue
    await row.click({ button: 'right' }); await wait(400)
    menus[label] = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
    if (FRAMES && ['Writing', 'Review'].includes(label)) await c.both(join(FRAMES, `menu-${label.toLowerCase()}`))
    await h.keyboard.press('Escape'); await wait(300)
  }
  // The page rows (Home to Goals), not the folders or tags under them, which have menus of their own.
  const PAGES = ['Home', 'Inbox', 'Journal', 'Writing', 'Review', 'Tasks', 'Calendar', 'Goals']
  const pages = Object.entries(menus).filter(([label]) => PAGES.includes(label))
  console.log(JSON.stringify(Object.fromEntries(pages)))
  check('every page row has a menu', pages.length === PAGES.length && pages.every(([, items]) => items.length > 0), pages.map(([label]) => label).join(', '))
  check('"New page" on Writing\'s row', menus.Writing?.some((one) => one.startsWith('New page')), JSON.stringify(menus.Writing))
  const stray = pages.filter(([label, items]) => label !== 'Writing' && items.some((one) => one.startsWith('New page'))).map(([label]) => label)
  check('and on no other row (Review, Tasks, …)', !stray.length, stray.join(', '))
  const lists = pages.filter(([label, items]) => label !== 'Gems' && items.some((one) => one.startsWith('Start a list'))).map(([label]) => label)
  check('"Start a list" on Gems\' row alone', !lists.length, lists.join(', '))
  check('each says how to customize the sidebar', pages.every(([, items]) => items.some((one) => one.startsWith('Customize the sidebar'))))
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.stack.split('\n').slice(0, 3).join(' / '))
} finally {
  await c.close()
  done()
}
