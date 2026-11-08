// "What Haligtree can do" beside Settings, light and dark: the same left edge,
// tab list width and title size, and a tab switch filmed every 50 ms.
// Frames go to QA_SHOTS (default: a new temp folder), printed at the end.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/powers-tabs-look.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const out = process.env.QA_SHOTS ?? fs.mkdtempSync(path.join(os.tmpdir(), 'powers-look-'))
const c = await sandbox({ width: 1400, height: 880 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const boxes = () => h.evaluate(() => {
  const r = (el) => el && el.getBoundingClientRect()
  const nav = r(document.querySelector('[data-sections]'))
  const tab = r(document.querySelector('[data-sections] [data-section]'))
  const title = document.querySelector('[data-sections] ~ div h2')
  return { navLeft: Math.round(nav.left), navWidth: Math.round(nav.width), tabTop: Math.round(tab.top), titleLeft: (() => { const range = document.createRange(); range.selectNodeContents(title); return Math.round(range.getBoundingClientRect().left) })(), titleTop: Math.round(r(title).top), titleSize: getComputedStyle(title).fontSize }
})
try {
  await v('settings:set', { sounds: false, hintRate: 0 }); await wait(800)
  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    await go('settings'); await wait(1200)
    const settings = await boxes()
    await h.screenshot({ path: `${out}/settings-${theme}.png` })
    await go('powers'); await wait(1500)
    const powers = await boxes()
    await h.screenshot({ path: `${out}/powers-${theme}.png` })
    console.log(theme, 'SETTINGS', JSON.stringify(settings), 'POWERS', JSON.stringify(powers))
    check(`${theme}: same left edge, tab list width and title as Settings`, ['navLeft', 'navWidth', 'tabTop', 'titleLeft', 'titleTop', 'titleSize'].every((k) => settings[k] === powers[k]), JSON.stringify({ settings, powers }))
  }
  // A tab switch, a frame every 50 ms.
  await h.locator('[data-sections] [data-section="Writing"]').click(); await wait(800)
  const before = await h.locator('[data-sections] [data-section]').evaluateAll((all) => all.map((one) => JSON.stringify(one.getBoundingClientRect())))
  await h.locator('[data-sections] [data-section="Remembering"]').click()
  for (let i = 0; i < 12; i++) { await h.screenshot({ path: `${out}/switch-dark-${String(i).padStart(2, '0')}.png` }); await wait(50) }
  await c.look('light'); await wait(300)
  await h.locator('[data-sections] [data-section="Days and seasons"]').click()
  for (let i = 0; i < 12; i++) { await h.screenshot({ path: `${out}/switch-light-${String(i).padStart(2, '0')}.png` }); await wait(50) }
  await h.locator('[data-sections] [data-section="Remembering"]').click(); await wait(800)
  const after = await h.locator('[data-sections] [data-section]').evaluateAll((all) => all.map((one) => JSON.stringify(one.getBoundingClientRect())))
  check('the tab list stays still through a switch', JSON.stringify(before) === JSON.stringify(after))
  // Smallest window.
  await c.size(560, 400)
  await wait(900)
  await h.screenshot({ path: `${out}/powers-small.png` })
  check('at its smallest, no sideways scroll', await h.evaluate(() => [...document.querySelectorAll('[data-powers-tab]')].every((el) => el.parentElement.scrollWidth <= el.parentElement.clientWidth + 1)))
} finally { await c.close() }
console.log('SHOTS', out)
done()
