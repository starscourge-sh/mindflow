// Cards from a picture with no labels (a painting): ovals drawn by hand. The button's count says exactly how many
// covers there are, each drawn cover stays inside the picture, and the cards made match the count.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/picture-unlabelled.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900, seeded: false })
const { h } = c
const shots = process.env.QA_SHOTS
const picture = join(import.meta.dirname, '..', 'build', 'icon.png')
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test().catch(() => false)) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const text = (selector) => h.evaluate((selector) => document.querySelector(selector)?.textContent ?? '', selector)
const count = (selector) => h.evaluate((selector) => document.querySelectorAll(selector).length, selector)
try {
  await call('onboarding:set', { welcomed: new Date().toISOString() })
  await h.reload(); await h.waitForTimeout(1500)
  await c.go('home'); await c.go('review'); await waitFor(() => h.evaluate(() => !!document.querySelector('[data-review-tab]')))
  if (shots) await h.screenshot({ path: join(shots, 'start.png') })
  await h.click('[data-first-way="picture"]', { timeout: 8000 })
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-picture-cards]')))
  await h.setInputFiles('[data-picture-file]', picture)
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-picture-board]')))
  await waitFor(async () => !/Finding/.test(await text('[data-picture-status]')), 15000)
  await h.click('[data-picture-tools] button:has-text("Oval")').catch(() => h.keyboard.press('o'))
  const board = await h.evaluate(() => { const r = document.querySelector('[data-picture-board]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const drag = async (x0, y0, x1, y1) => { await h.mouse.move(board.x + board.w * x0, board.y + board.h * y0); await h.mouse.down(); await h.mouse.move(board.x + board.w * x1, board.y + board.h * y1, { steps: 8 }); await h.mouse.up(); await h.waitForTimeout(200) }
  await drag(0.3, 0.1, 0.55, 0.35)
  await drag(0.0, 0.35, 0.12, 0.75)
  const covers = await count('[data-made-cover]')
  const button = await text('[data-picture-make]')
  if (shots) await h.screenshot({ path: join(shots, 'two-ovals.png') })
  check('two ovals drawn make two covers', covers === 2, String(covers))
  check('the button says "Make 2 cards"', /Make 2 cards/.test(button), button)
  const outside = await h.evaluate(() => { const b = document.querySelector('[data-picture-board]').getBoundingClientRect(); return [...document.querySelectorAll('[data-made-cover]')].filter((one) => { const r = one.getBoundingClientRect(); return r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1 }).length })
  check('every cover sits inside the picture', outside === 0, String(outside))
  await h.click('[data-picture-make]'); await h.waitForTimeout(1200)
  const made = (await call('items', 'card')).filter((one) => /occlusion/.test(one.fields ?? ''))
  check('the cards made match the count', made.length === 2, String(made.length))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
  done()
}
