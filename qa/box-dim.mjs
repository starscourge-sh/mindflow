// "Dim quick capture": on (the usual), the box steps back
// to half strength when it loses the focus; off, it stays at full strength,
// while the main window still dims as before. Switched in Settings itself.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-dim.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760 })
const { page, h, v, send } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
// Left: what the window does when another app takes the focus.
const left = async (p) => {
  await p.evaluate(() => (document.documentElement.dataset.blurred = 'on'))
  await p.waitForTimeout(400)
  // The page's strength as seen: its own fade, or the main window's veil over it (main.css).
  const o = await p.evaluate(() => Number(getComputedStyle(document.body).opacity) * (getComputedStyle(document.body, '::after').content === 'none' ? 1 : 1 - Number(getComputedStyle(document.body, '::after').opacity)))
  await p.evaluate(() => (document.documentElement.dataset.blurred = 'off'))
  return o
}
try {
  check('the usual: quick capture dims when left', (await left(page)) < 0.7)
  // Off from Settings, by its switch.
  await send('view', 'settings')
  await h.waitForTimeout(1500)
  const sw = h.locator('[data-setting]', { hasText: 'Dim quick capture' }).first().getByRole('switch')
  await sw.scrollIntoViewIfNeeded()
  check('Settings has the switch, on to start', (await sw.getAttribute('aria-checked')) === 'true')
  await sw.click()
  await h.waitForTimeout(600)
  check('switched off, it is saved', (await v('settings')).boxDim === false)
  check('off: quick capture stays at full strength when left', (await left(page)) === 1)
  check('off: the main window still dims when left', (await left(h)) < 0.7)
  await sw.click()
  await h.waitForTimeout(600)
  check('on again: quick capture dims again', (await left(page)) < 0.7)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
