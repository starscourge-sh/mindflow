// Run with: QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out/main/index.js MINDFLOW_QA_AWAY=1 node qa/sidebar-recent.mjs
// The sidebar's Recent: one short section, at most five rows (today's first),
// "Show all" opens the Recent panel instead of growing the sidebar, it hides
// from Customize and from its heading's right click, and comes back.
// SHOTS=<dir> saves pictures, light and dark.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shoot = async (name) => SHOTS && (await h.screenshot({ path: `${SHOTS}/${name}.png` }))
const rows = () => h.$$eval('[data-open-today] [data-open-row]', (all) => all.length).catch(() => 0)
const section = () => h.evaluate(() => !!document.querySelector('[data-open-today]'))
const menu = () => h.$$eval('[role="menuitem"]', (all) => all.map((one) => one.textContent?.trim()))

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false, sidebarRecent: true })
  await v('onboarding:set', { pageHints: false })
  // Eight notes opened, two of them yesterday.
  const ids = []
  for (let i = 1; i <= 8; i++) ids.push(await h.evaluate((n) => window.api.captures.create({ kind: 'note', body: `Reading note number ${n}` }), i))
  await h.evaluate((ids) => {
    const now = Date.now()
    const list = ids.map((id, at) => {
      const when = new Date(now - (at < 2 ? 86400000 + at * 1000 : (8 - at) * 60000)).toISOString()
      return { type: 'capture', id, since: when, at: when }
    })
    localStorage.setItem('sidebar:open-today', JSON.stringify(list))
    localStorage.setItem('sidebar:open-ever', '1')
  }, ids)
  await h.reload(); await wait(2500)

  const n = await rows()
  check('Recent shows at most five rows', n === 5, `${n} rows`)
  const kinds = await h.$$eval('[data-open-today] [data-open-row]', (all) => all.map((one) => one.dataset.openRow))
  check('today\'s first, then the ones before', kinds.every((one) => one === 'open'), JSON.stringify(kinds))
  const heads = await h.evaluate(() => document.querySelector('aside')?.innerText ?? '')
  check('one heading, “Recent”, no “Opened before”, no “N more”', /\bRecent\b/.test(heads) && !/Opened before|Opened today|\d+ more/.test(heads))
  await shoot('recent-light')
  const before = await h.$eval('[data-open-today]', (one) => one.getBoundingClientRect().height)
  await h.click('[data-recent-all]'); await wait(900)
  const after = await h.$eval('[data-open-today]', (one) => one.getBoundingClientRect().height)
  const opened = await h.evaluate(() => !!document.querySelector('aside[aria-label="Recent"]'))
  check('“Show all” opens the Recent panel', opened)
  check('…and the sidebar does not grow', Math.abs(after - before) < 2, `${before} → ${after}`)
  await shoot('recent-panel')
  await h.keyboard.press('Meta+Shift+y'); await wait(500)

  // ⌫ on a row takes it off.
  await h.locator('[data-open-today] [data-open-row] button[data-side-row]').first().focus()
  await h.keyboard.press('Backspace'); await wait(700)
  const toast = await h.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent).join(' '))
  check('⌫ takes a row off, said', /Off the sidebar/.test(toast), toast.slice(0, 80))
  await h.keyboard.press('Meta+z'); await wait(500)

  // Hidden from its heading's right click.
  await h.locator('[data-open-heading]').click({ button: 'right' }); await wait(400)
  const head = await menu()
  check('its heading\'s right click offers Hide from the sidebar', head.some((one) => one?.startsWith('Hide from the sidebar')), JSON.stringify(head))
  await h.locator('[role="menuitem"]', { hasText: 'Hide from the sidebar' }).click(); await wait(800)
  check('hidden from the heading menu: gone', !(await section()))
  await h.keyboard.press('Meta+Shift+y'); await wait(800)
  check('hidden, ⇧⌘Y still opens Recent', await h.evaluate(() => !!document.querySelector('aside[aria-label="Recent"]')))
  await h.keyboard.press('Meta+Shift+y'); await wait(500)

  // Back from Customize, and hidden from there too.
  // Through the menu at the sidebar's foot, as a person would.
  await h.locator('button[aria-label="Vigil menu"]').click(); await wait(400)
  await h.locator('[data-peek="customize"]').click(); await wait(700)
  const sw = h.locator('[data-show-row="recent"] [role="switch"]')
  check('Customize lists Recent with its switch, off', (await sw.getAttribute('aria-checked').catch(() => null)) === 'false')
  await sw.click(); await wait(800)
  check('switched on in Customize: back', await section())
  await shoot('recent-customize')
  await sw.click(); await wait(800)
  check('switched off in Customize: gone', !(await section()))
  await sw.click(); await wait(600)
  await h.keyboard.press('Escape'); await wait(300)

  await c.theme('dark'); await wait(1200)
  await shoot('recent-dark')
  if (c.errors.length) console.log(c.errors.slice(0, 5).join('\n'))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
