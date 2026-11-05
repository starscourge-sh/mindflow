// While a right-click menu is open, a row stays filled and anything taller (a deck's stack) is ringed, never
// filled: a fill behind a card read as the page dimming.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/menu-mark.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h } = c
const shots = process.env.QA_SHOTS
const look = (sel) => h.evaluate((sel) => { const el = document.querySelector(sel)?.closest('[data-slot="context-menu-trigger"]') ?? document.querySelector(sel); const s = getComputedStyle(el); return { bg: s.backgroundColor, outline: s.outlineStyle, state: el.getAttribute('data-state') } }, sel)
try {
  await c.go('review'); await h.waitForTimeout(1500)
  const deck = await h.evaluate(() => { const r = document.querySelector('[data-deck]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await h.mouse.click(deck.x, deck.y, { button: 'right' }); await h.waitForTimeout(500)
  const open = await look('[data-deck]')
  if (shots) await h.screenshot({ path: join(shots, 'deck-menu.png') })
  check('a deck with its menu open', open.state === 'open', JSON.stringify(open))
  check('is ringed, not filled', open.outline === 'solid' && /rgba\(0, 0, 0, 0\)|transparent/.test(open.bg), JSON.stringify(open))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  await c.go('writing'); await h.waitForTimeout(1500)
  const row = await h.evaluate(() => { const el = [...document.querySelectorAll('[data-row-menu]')].find((one) => { const r = one.getBoundingClientRect(); return r.height > 20 && r.height <= 56 && r.width > 200 && r.top > 100 }); el?.setAttribute('data-probe-row', ''); const r = el?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await h.mouse.click(row.x, row.y, { button: 'right' }); await h.waitForTimeout(500)
  const filled = await look('[data-probe-row]')
  if (shots) await h.screenshot({ path: join(shots, 'row-menu.png') })
  check('a list row with its menu open is filled, as before', filled.state === 'open' && !/rgba\(0, 0, 0, 0\)/.test(filled.bg) && filled.outline !== 'solid', JSON.stringify(filled))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
  done()
}
