// Resting the pointer on a list row brings up nothing over the list: no card
// with the row's name and quick buttons (the user found it in the way). What
// it offered (Pin, Open to the side, Copy link) is in the row's right-click
// menu instead, on every list that had it.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 [SHOT=<dir>] node qa/no-peek.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const lines = () => h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
// Anything that came up floating over the page while the pointer rested.
const floating = () => h.evaluate(() => [...document.querySelectorAll('[data-row-card], [role=tooltip], [data-radix-popper-content-wrapper]')]
  .filter((one) => one.getBoundingClientRect().width > 0).map((one) => one.textContent.trim().slice(0, 60)))

// Each list, and whether its rows' menus had Pin for the card to offer.
const LISTS = [
  ['all', true], ['inbox', true], ['kind:quote', true], ['nuggets', true], ['articles', true],
  ['questions', false], ['goals', false], ['today', false], ['upcoming', false]
]

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  for (let [view, pinnable] of LISTS) {
    await go(view); await wait(900)
    const rows = h.locator('[data-pane] [data-row][data-id]:visible')
    const count = await rows.count()
    if (!count) { check(`${view}: has rows to point at`, false); continue }
    const row = rows.nth(Math.min(1, count - 1))
    const box = await row.boundingBox()
    // A real hand: moves onto the row, then a little more, then rests.
    await h.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 5 })
    await h.mouse.move(box.x + 140, box.y + box.height / 2, { steps: 3 })
    await wait(1500)
    const up = await floating()
    check(`${view}: resting on a row for 1.5s brings up nothing over the list`, up.length === 0, up.join(' | '))
    if (SHOT) await h.screenshot({ path: `${SHOT}/hover-${view.replace(/\W+/g, '-')}.png` })
    await row.click({ button: 'right' }); await wait(450)
    // Lines folded into "Open in…" and "Copy" count too: open each to read them.
    let menu = await lines()
    for (const sub of ['Open in…', 'Copy']) {
      const trigger = h.locator('[role=menu] [role=menuitem][data-state]', { hasText: new RegExp(`^${sub}$`) }).first()
      if (await trigger.count()) { await trigger.hover(); await wait(350); menu = [...menu, ...(await lines())] }
    }
    // A task cannot be pinned: its menu starts a focus session instead.
    if (menu.some((one) => one.startsWith('Mark it done'))) pinnable = false
    const has = (rule) => menu.some((one) => rule.test(one))
    const missing = [
      !has(/^Open to the side/) && 'Open to the side',
      !has(/^Copy/) && 'Copy',
      pinnable && !has(/^(Pin|Unpin)/) && 'Pin'
    ].filter(Boolean)
    check(`${view}: right-click has what the card had`, missing.length === 0, missing.length ? `missing ${missing.join(', ')}: ${menu.join(' / ')}` : '')
    if (SHOT) await h.screenshot({ path: `${SHOT}/menu-${view.replace(/\W+/g, '-')}.png` })
    await h.keyboard.press('Escape'); await wait(300)
  }
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  console.error(error)
  results.push(false)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
