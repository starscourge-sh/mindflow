// Obsidian's split (tracker: "in obsidian, you can open a new split then cmd+o to search for what to open; by
// default the split contains the same content"). ⌘\ opens a pane on the right showing the page in front again,
// with the keys; ⌘O there searches for what to open in it, and ↵ opens it in that pane, the left one untouched.
// A note open in front keeps ⌘O for its own window. Each pane closes from its own × (Dia).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/split-same.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1400, height: 880 })
const { h, go, v } = c
const wait = (ms = 600) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? process.env.QA_DATA
const panes = () => h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((el) => ({
  front: el.hasAttribute('data-pane-front'),
  picker: !!el.querySelector('[data-pane-picker]'),
  page: el.querySelector('[data-page]')?.getAttribute('data-page') ?? null,
  close: !!el.querySelector('[data-pane-close]')
})))
try {
  await v('settings:set', { hintRate: 0 })
  await go('inbox'); await wait(800)
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+Backslash'); await wait(800)
  let list = await panes()
  check('⌘\\ opens a pane on the right with the same page, in front', list.length === 2 && list[1].front && !list[1].picker && list[1].page === list[0].page && !!list[0].page, JSON.stringify(list))
  check('each pane has its own × to close it', list.every((one) => one.close))
  await h.screenshot({ path: `${shots}/split-same.png` })
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+o'); await wait(700)
  list = await panes()
  const typing = await h.evaluate(() => !!document.activeElement?.closest('[data-pane-picker]'))
  check('⌘O there searches for what to open, in that pane, with the keys', list.length === 2 && list[1].picker && !list[0].picker && typing, JSON.stringify(list))
  await h.screenshot({ path: `${shots}/split-same-open.png` })
  await h.keyboard.press('Escape'); await wait(700)
  list = await panes()
  check('Esc there goes back to the page it was asked over, the pane kept', list.length === 2 && list[1].page === 'inbox' && !list[1].picker, JSON.stringify(list.map((one) => one.page)))
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+o'); await wait(700)
  await h.keyboard.type('calendar'); await wait(900)
  await h.keyboard.press('Enter'); await wait(1200)
  list = await panes()
  check('↵ opens it in that pane, the left one as it was', list.length === 2 && list[1].page === 'calendar' && list[0].page !== 'calendar', JSON.stringify(list.map((one) => one.page)))
  await h.locator('[data-pane]').nth(1).locator('[data-pane-close]').click(); await wait(700)
  check('its × closes it', (await panes()).length === 1)
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
