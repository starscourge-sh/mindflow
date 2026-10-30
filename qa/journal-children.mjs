// Journal's Week, Month and Year hang under its row in the sidebar, as Writing's folders do:
// each opens its page, is lit while on it (Journal itself then not), shows the hand, and has the tree lines.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/journal-children.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const rows = () => h.evaluate(() => [...document.querySelectorAll('aside[data-chrome] [data-side-scale]')].map((one) => ({ id: one.dataset.sideScale, text: one.textContent.trim().slice(0, one.textContent.trim().length / 2), lit: one.getAttribute('aria-current') === 'page', hand: getComputedStyle(one).cursor === 'pointer', h: Math.round(one.getBoundingClientRect().height), lines: !!one.parentElement.querySelector(':scope > svg path') })))
const journalLit = () => h.evaluate(() => document.querySelector('aside[data-chrome] [data-side-row][aria-label="Journal"]')?.getAttribute('aria-current') === 'page')
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.go('day')
  const first = await rows()
  check('Journal has Week, Month and Year under it (Day is Journal itself)', first.map((one) => one.text).join() === 'Week,Month,Year', JSON.stringify(first.map((one) => one.text)))
  check('each shows the hand and hangs on the tree lines', first.length === 3 && first.every((one) => one.hand && one.lines), JSON.stringify(first))
  const folder = await h.evaluate(() => Math.round(document.querySelector('[data-side-folder]')?.getBoundingClientRect().height ?? 0))
  check('each is as tall as a Writing folder row', !folder || first.every((one) => Math.abs(one.h - folder) <= 1), `${first.map((one) => one.h)} vs ${folder}`)
  check('on the Day page, Journal is lit and no child', (await journalLit()) && first.every((one) => !one.lit))
  for (const [id, view] of [['weekpage', 'Week'], ['monthpage', 'Month'], ['yearpage', 'Year']]) {
    await h.locator(`[data-side-scale=${id}]`).click(); await h.waitForTimeout(900)
    const now = await rows()
    const on = await h.evaluate(() => document.title + ' ' + (document.querySelector('[data-view]')?.getAttribute('data-view') ?? ''))
    check(`${view}: clicked, its row alone is lit and Journal is not`, now.find((one) => one.id === id)?.lit && now.filter((one) => one.lit).length === 1 && !(await journalLit()), JSON.stringify(now.map((one) => one.lit)) + on)
    if (SHOT) await h.screenshot({ path: `${SHOT}/journal-${id}.png`, clip: { x: 0, y: 0, width: 320, height: 520 } })
  }
  const shown = (await v('settings')).sidebarShown
  if (shown) {
    await v('settings:set', { sidebarShown: [...shown, 'weekpage'] }); await h.waitForTimeout(800)
    const after = await rows()
    // Week's and Month's pages are never rows of their own now: reached only through Journal, even in a book that once showed them.
    check("Week's page once shown as its own row: Week is still under Journal, and no row of its own", after.some((one) => one.id === 'weekpage') && !(await h.$('aside[data-chrome] [data-side-row][aria-label="Week\'s page"]')), JSON.stringify(after.map((one) => one.id)))
  }
  await c.theme('dark'); await c.go('monthpage')
  if (SHOT) await h.screenshot({ path: `${SHOT}/journal-dark.png`, clip: { x: 0, y: 0, width: 320, height: 520 } })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
