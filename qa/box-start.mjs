// Raycast's way, in quick capture: "start" offers how long; "start 15m reply to emails" and ⌘↵ starts a 15-minute
// timer for it, with focus tools off (the default); "start the essay" with no length is still a task; words that
// name an open task ("start 25m write the long report") start a session on that task instead.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-start.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false, sounds: false, focusTools: false })
const text = () => page.evaluate(() => document.querySelector('.tiptap.ProseMirror')?.textContent ?? '')
try {
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(800)
  await page.keyboard.type('start', { delay: 10 }); await page.waitForTimeout(500)
  const lengths = await page.evaluate(() => [...document.querySelectorAll('[data-start-length]')].map((b) => b.textContent))
  check('“start” offers how long', lengths.join() === '5 min,10 min,15 min,25 min,45 min,60 min', lengths.join())
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'box-start.png') })
  await page.locator('[data-start-length="15"]').click(); await page.waitForTimeout(300)
  check('a length goes in the box, ready for the words', /^start 15m\s*$/.test(await text()), await text())
  await page.keyboard.type('reply to emails', { delay: 8 }); await page.waitForTimeout(900)
  const will = await page.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')
  check('the box says it will start a 15 min timer for it', /Start a 15 min timer for reply to emails/.test(will), will)
  await page.keyboard.press('Meta+Enter'); await page.waitForTimeout(1200)
  const focus = await v('focus:now')
  check('⌘↵ starts it, with focus tools off', !!focus && /reply to emails/.test(JSON.stringify(focus)), JSON.stringify(focus)?.slice(0, 160))
  await v('focus:cancel').catch(() => {})
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(800)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.keyboard.type('start the essay', { delay: 8 }); await page.waitForTimeout(900)
  const task = await page.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')
  check('“start the essay” with no length is still a task', /^A task/.test(task) && !/timer/.test(task), task)
  // Words that name an open task time that task: a session on it, not a plain timer.
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  const made = await v('task:add', 'Write the long report')
  const id = typeof made === 'string' ? made : made?.id
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(800)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.keyboard.type('start 25m write the long report', { delay: 8 }); await page.waitForTimeout(900)
  await page.keyboard.press('Meta+Enter'); await page.waitForTimeout(1500)
  const on = await v('focus:now')
  check('a timer named like an open task is a session on that task', !!on && !!on.taskId && (!id || on.taskId === id), JSON.stringify(on)?.slice(0, 200))
  const kept = on?.taskId ? await v('sessions', on.taskId) : []
  check('and it shows in that task’s sessions', Array.isArray(kept) && kept.length >= 1, JSON.stringify(kept)?.slice(0, 160))
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
