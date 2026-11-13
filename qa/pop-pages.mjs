// The pages that share the tooltip, the title tip and the sheet (13 Nov): Home, Writing with a note open, Tasks, Review,
// Files, Settings, the PDF reader and quick capture. On each, in both looks, a tooltip and a title tip of that page's own
// are brought up by the pointer, held half way in (50ms of their 150) and pictured, then pictured at rest; quick capture
// has the one sheet there is (Display), pictured the same way. FRAMES=dir is where the pictures go.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 FRAMES=dir node qa/pop-pages.mjs
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { holdEntrance, stepEntrance } from './pop-hold-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const c = await sandbox({ width: 1440, height: 900, at: '11:30' })
const { h, v, go } = c
let passed = 0
let all = 0
const check = (name, pass, detail = '') => { all++; if (pass) passed++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => h.waitForTimeout(ms)
const dir = process.env.FRAMES
if (dir) mkdirSync(dir, { recursive: true })
const only = (process.env.ONLY ?? '').split(',').filter(Boolean)

/** The first thing on the page that matches `sel`, is drawn, and is clear of the sidebar and the title bar: marked, so the pointer can go to it. */
const mark = (on, sel, left) => on.evaluate(([sel, left]) => {
  document.querySelectorAll('[data-qa-point]').forEach((one) => one.removeAttribute('data-qa-point'))
  const el = [...document.querySelectorAll(sel)].find((one) => { const r = one.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.left > left && r.top > 60 && r.bottom < innerHeight - 20 && !one.closest('[data-slot="tooltip-content"], [data-title-tips]') && !one.disabled })
  if (!el) return null
  el.setAttribute('data-qa-point', '')
  return (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.tagName).trim().slice(0, 40)
}, [sel, left])
const picture = (key, what, when, look) => `${dir}/page-${key}-${what.replace(/ /g, '')}-${when}-${look}.png`
/** One surface on one page: brought up by the pointer after a rest, held half way in and pictured, then pictured at rest. */
const show = async (on, key, name, look, what, sel, pointAt, left) => {
  await on.mouse.move(left + 30, 8)
  await on.waitForTimeout(1100)
  const said = await mark(on, pointAt, left)
  if (!said) return console.log(`NOTE  ${look}: ${name}: nothing with a ${what} is drawn to point at`)
  await holdEntrance(on, sel)
  await on.locator('[data-qa-point]').first().hover().catch(() => {})
  const seen = await stepEntrance(on, sel, [50], dir ? () => picture(key, what, 'mid', look) : null)
  if (dir) await on.screenshot({ path: picture(key, what, 'rest', look) })
  check(`${look}: ${name}: its ${what} (on “${said}”) is whole half way in, never faded, and there at rest`, !!seen[0] && seen[0].opacity === 1 && !seen[0].fades && seen[0].n > 0 && await on.locator(sel).count() > 0, seen[0] ? `opacity ${seen[0].opacity}; ${seen[0].clip}` : 'it did not come')
  await on.mouse.move(left + 30, 8)
  await on.waitForTimeout(300)
}
const places = [
  ['home', 'Home', () => go('home')],
  ['writing', 'Writing with a note open', async () => { await go('articles'); await wait(900); await h.locator('button[data-row], [data-drag-open]').first().click().catch(() => {}) }],
  ['tasks', 'Tasks', () => go('today')],
  ['review', 'Review', () => go('review')],
  ['files', 'Files', () => go('media')],
  ['settings', 'Settings', () => go('settings')],
  ['pdf', 'the PDF reader', async () => { await go('media'); await wait(900); const pdf = h.locator('[data-drag-open^="pdf:"]').first(); if (await pdf.count()) { await pdf.scrollIntoViewIfNeeded().catch(() => {}); await pdf.click().catch(() => {}) } else console.log('NOTE  no PDF is listed in Files to open the reader on') }]
].filter(([key]) => !only.length || only.includes(key))
try {
  await v('settings:set', { hintRate: 0 })
  for (const look of ['light', 'dark']) {
    await c.look(look)
    for (const [key, name, to] of places) {
      await to()
      await wait(1400)
      await show(h, key, name, look, 'tooltip', '[data-slot="tooltip-content"]', '[data-slot="tooltip-trigger"]', 300)
      await show(h, key, name, look, 'title tip', '[data-title-tips]', '[title]:not([title=""]), [data-title-tip]', 300)
    }
    if (only.length && !only.includes('box')) continue
    // Quick capture: the same two, and the one sheet.
    const box = c.page
    await box.evaluate(() => window.api.showPrompt())
    await box.waitForTimeout(900)
    await show(box, 'box', 'quick capture', look, 'tooltip', '[data-slot="tooltip-content"]', '[data-slot="tooltip-trigger"]', 0)
    await show(box, 'box', 'quick capture', look, 'title tip', '[data-title-tips]', '[title]:not([title=""]), [data-title-tip]', 0)
    const toggle = box.locator('button[aria-label="Show the side panel"]')
    if (await toggle.count()) { await toggle.first().click(); await box.waitForTimeout(800) }
    await box.keyboard.press('Control+1')
    await box.waitForTimeout(800)
    if (await box.locator('[data-display]').count()) {
      await holdEntrance(box, '[data-slot="sheet-content"]')
      await box.locator('[data-display]').first().click()
      const seen = await stepEntrance(box, '[data-slot="sheet-content"]', [50], dir ? () => picture('box', 'sheet', 'mid', look) : null)
      if (dir) await box.screenshot({ path: picture('box', 'sheet', 'rest', look) })
      check(`${look}: quick capture: its sheet (Display) is whole half way in, never faded, and there at rest`, !!seen[0] && seen[0].opacity === 1 && !seen[0].fades && seen[0].n > 0, seen[0] ? `opacity ${seen[0].opacity}; ${seen[0].clip}` : 'it did not come')
      await box.keyboard.press('Escape')
      await box.waitForTimeout(500)
    } else console.log(`NOTE  ${look}: quick capture: no Display button to open the sheet from`)
  }
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} catch (error) {
  check('the probe ran to its end', false, String(error.message).split('\n')[0])
} finally {
  await c.close()
}
console.log(`${passed}/${all} passed`)
process.exit(passed === all ? 0 : 1)
