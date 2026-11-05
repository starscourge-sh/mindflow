// The "+" left of a line's handle on Today (as beside a note's handle): pointing at a line shows it; a click opens a new
// line straight under that line, caret in it, and what is written there is kept in that place. The same on a step.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/day-add-below.mjs
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: Number(process.env.WIDTH) || 1400, height: 900 })
const { h, v, go, look } = c
const wait = (ms) => h.waitForTimeout(ms)
const order = () => h.evaluate(() => [...document.querySelectorAll('[data-day-section="now"] [data-day-line], [data-day-section="now"] [data-day-step]')].map((el) => el.textContent.trim().slice(0, 30)))
try {
  await v('settings:set', { motion: false, hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'page' })))
  await h.reload(); await wait(1500); await go('today'); await wait(1500)
  await h.locator('[data-new="now"] .ProseMirror').click()
  for (const line of ['Qa alpha', 'Qa beta', 'Qa gamma']) { await h.keyboard.type(line); await h.keyboard.press('Enter'); await wait(400) }
  await h.keyboard.press('Escape'); await wait(400)
  const id = (title) => h.evaluate((t) => [...document.querySelectorAll('[data-day-line]')].find((el) => el.textContent.includes(t))?.getAttribute('data-day-line'), title)
  const alpha = await id('Qa alpha')
  const row = h.locator(`[data-day-line="${alpha}"]`)
  const plus = row.locator('[data-add-below]').first()
  // Too narrow a page: no + at all, rather than one hung past the pane's edge.
  await c.size(1100, 900); await wait(600)
  check('a narrow page has no + (no gutter for it)', (await plus.evaluate((el) => getComputedStyle(el).display)) === 'none')
  await c.size(1400, 900); await wait(600)
  check('the + is hidden until the line is pointed at', (await plus.evaluate((el) => getComputedStyle(el).opacity)) === '0')
  await row.hover(); await wait(300)
  const seen = await plus.evaluate((el) => ({ opacity: getComputedStyle(el).opacity, cursor: getComputedStyle(el).cursor, box: el.getBoundingClientRect().toJSON() }))
  check('pointing at the line shows the +, with the hand', Number(seen.opacity) > 0.3 && seen.cursor === 'pointer', JSON.stringify(seen))
  const grip = await row.locator('[data-grip]').first().evaluate((el) => el.getBoundingClientRect().toJSON())
  check('the + sits left of the handle, on its line', seen.box.right <= grip.left + 1 && Math.abs((seen.box.top + seen.box.height / 2) - (grip.top + grip.height / 2)) < 6, `${JSON.stringify(seen.box)} ${JSON.stringify(grip)}`)
  const hit = await plus.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return top === el || el.contains(top) ? 'self' : (top?.outerHTML ?? '').slice(0, 160) })
  check('the + can be pressed (nothing over it)', hit === 'self', hit)
  if (shots) { for (const one of ['light', 'dark']) { await look(one); await row.hover(); await wait(200); await h.screenshot({ path: `${shots}/hover-${one}.png`, clip: { x: 0, y: Math.max(0, seen.box.top - 80), width: 800, height: 260 } }) } await look('light') }
  await row.hover(); await wait(200); await plus.click(); await wait(500)
  const focused = await h.evaluate(() => { const el = document.activeElement; return { editable: !!el?.closest('[contenteditable=true]'), empty: !(el?.textContent ?? '').trim(), where: el?.closest('[data-day-line],[data-new],[data-day-draft],[data-day-step]')?.outerHTML.slice(0, 120) ?? el?.outerHTML.slice(0, 120) } })
  check('a click puts the caret in a new line', focused.editable && focused.empty, JSON.stringify(focused))
  await h.keyboard.type('Qa between'); await h.keyboard.press('Escape'); await wait(800)
  const after = await order()
  const at = after.findIndex((one) => one.includes('Qa alpha'))
  check('the new line is kept straight under the line its + was on', after[at + 1]?.includes('Qa between'), JSON.stringify(after))
  if (shots) await h.screenshot({ path: `${shots}/after-light.png`, clip: { x: 0, y: Math.max(0, seen.box.top - 80), width: 800, height: 300 } })
  // A step under beta, then a step added under it with its +.
  const beta = await id('Qa beta')
  await h.locator(`[data-day-line="${beta}"] [data-line] .ProseMirror`).first().click(); await h.keyboard.press('End'); await h.keyboard.press('Enter'); await wait(300)
  await h.keyboard.type('Qa step one'); await h.keyboard.press('Tab'); await wait(300); await h.keyboard.press('Escape'); await wait(800)
  const step = h.locator(`[data-day-step="${beta}:0"]`)
  if (await step.count()) {
    await step.hover(); await wait(300)
    await step.locator('[data-add-below]').click(); await wait(500)
    await h.keyboard.type('Qa step two'); await h.keyboard.press('Escape'); await wait(800)
    const steps = (await v('tasks')).find((one) => one.id === beta)?.subtasks?.map((one) => one.text) ?? []
    check('a step\'s + adds a step under it', steps[0] === 'Qa step one' && steps[1] === 'Qa step two', JSON.stringify(steps))
  } else check('a step\'s + adds a step under it', false, 'no step made to try it on')
} catch (error) { check('ran', false, error.message) }
await c.close?.()
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(0)
