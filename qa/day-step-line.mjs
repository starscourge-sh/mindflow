// A step on Today's written page: its ring sits level with its words, as a line's does (the user, 6 Nov: "looks
// misaligned"), and Enter at the start of its words opens an empty step above it, as a line does.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOT=<dir> node qa/day-step-line.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await go('today')
  await wait(1200)
  const write = h.locator('button', { hasText: 'Write out my day' }).first()
  if (await write.count()) (await write.click({ timeout: 5000 }), await wait(800))
  const made = await v('task:add', 'Admin', undefined, true)
  await v('task:save', made.id, { due: new Date().toISOString(), subtasks: [{ text: 'submit leave notice', done: false }, { text: 'second step', done: false }] })
  await wait(1200)
  const level = (selector) => h.evaluate((sel) => {
    const box = document.querySelector(sel)
    const ring = box.querySelector('[role="checkbox"]').getBoundingClientRect()
    const words = box.querySelector('[data-line] p')
    const range = document.createRange()
    range.selectNodeContents(words)
    const line = range.getClientRects()[0] ?? words.getBoundingClientRect()
    return { ring: ring.top + ring.height / 2, words: line.top + line.height / 2 }
  }, selector)
  for (const size of [undefined, 'large']) {
    if (size) (await h.evaluate(() => { document.documentElement.style.fontSize = '20px' }), await wait(400))
    const step = await level(`[data-day-step="${made.id}:0"]`)
    const top = await level(`[data-day-line="${made.id}"]`)
    check(`${size ?? 'normal'} text: the step's ring is level with its words`, Math.abs(step.ring - step.words) <= 1, JSON.stringify(step))
    check(`${size ?? 'normal'} text: the line's ring is level with its words`, Math.abs(top.ring - top.words) <= 1.5, JSON.stringify(top))
    if (process.env.SHOT) await h.screenshot({ path: join(process.env.SHOT, `day-step-${size ?? 'normal'}.png`) })
  }
  await h.evaluate(() => { document.documentElement.style.fontSize = '' })
  await wait(300)
  // The caret at the start of the first step, Enter, then a new first step typed.
  await h.locator(`[data-day-step="${made.id}:0"] [data-line]`).first().click()
  await wait(400)
  await h.keyboard.press('Meta+ArrowLeft')
  await wait(200)
  await h.keyboard.press('Enter')
  await wait(500)
  await h.keyboard.type('new first step', { delay: 15 })
  await h.keyboard.press('Enter')
  await wait(900)
  const steps = (await v('task', made.id)).subtasks.map((one) => one.text)
  check('Enter at the start of a step opens a line above it', steps[0] === 'new first step' && steps[1] === 'submit leave notice' && steps.length >= 3, JSON.stringify(steps))
  // Enter at the end of a line with steps: its first step.
  await h.locator(`[data-day-line="${made.id}"] [data-line]`).first().click()
  await h.keyboard.press('Meta+ArrowRight')
  await h.keyboard.press('Enter')
  await wait(500)
  await h.keyboard.type('right under the line', { delay: 15 })
  await h.keyboard.press('Enter')
  await wait(900)
  const after = (await v('task', made.id)).subtasks.map((one) => one.text)
  check('Enter at the end of a line with steps adds its first step', after[0] === 'right under the line', JSON.stringify(after))
  await h.keyboard.press('Escape')
  await h.locator(`[data-day-line="${made.id}"] [data-line]`).first().click({ button: 'right' })
  await wait(400)
  check('its menu has "Add a step"', (await h.getByRole('menuitem', { name: /Add a step/ }).count()) > 0)
  await h.keyboard.press('Escape')
  check('no page errors', !c.errors.some((e) => e.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
