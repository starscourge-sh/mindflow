// Quick capture reads what is typed (App.tsx, lib/box-tokens.ts, main/write.ts `ai:kind`), the Mac's model stood in
// (HALIGTREE_QA_CAPS=ai, HALIGTREE_QA_KIND):
// 1. A line the wording's rules read nothing in ("Claude references for the right reddit groups to market to") is read
//    by the Mac's model as a task once the words rest: the kind chip says Task, the line under the box says "Add to your
//    tasks" and that it was read on this Mac; its × keeps it a note, and nothing asks again over that.
// 2. A task with a day and a time ("Design meeting tomorrow 10:00") shows that day around it, the new one lit in its
//    place; ⌘↵ makes the task for that time. Real keys only. QA_SHOTS films both, every 50ms.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-reads.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_CAPS = 'ai'
process.env.HALIGTREE_QA_KIND = 'task'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const wait = (ms) => page.waitForTimeout(ms)
const film = async (name, n) => { if (!shots) return; for (let i = 0; i < n; i++) { await page.screenshot({ path: `${shots}/${name}-${String(i).padStart(2, '0')}.png` }); await wait(50) } }
const EDITOR = '.tiptap.ProseMirror.haligtree-editor'
const chip = () => page.evaluate(() => document.querySelector('[data-kind-chip]')?.textContent?.trim() ?? '')
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: false, boxGlance: false })
  await page.evaluate(() => window.api.showPrompt())
  await wait(1200)
  // 2. A task with a day and a time, seen in its day.
  await page.click(EDITOR)
  await page.keyboard.type('Design meeting tomorrow 10:00', { delay: 15 })
  await film('day', 12)
  await wait(500)
  const around = await page.evaluate(() => ({ text: document.querySelector('[data-day-around]')?.textContent ?? null, mine: document.querySelector('[data-day-around] [data-day-item="mine"]')?.textContent ?? null }))
  check('the day it lands on is shown around it', !!around.text && /^Tomorrow/.test(around.text), JSON.stringify(around))
  check('the new one is lit in its place, at its time', !!around.mine && /10:00/.test(around.mine) && /Design meeting/.test(around.mine), JSON.stringify(around))
  await page.keyboard.press('Meta+Enter'); await wait(1200)
  const made = (await v('tasks')).find((one) => one.title === 'Design meeting')
  const tomorrow = new Date(Date.now() + 86_400_000)
  check('⌘↵ makes the task for that day and time', !!made && new Date(made.dueAt).getDate() === tomorrow.getDate() && new Date(made.dueAt).getHours() === 10, JSON.stringify(made && { dueAt: made.dueAt, allDay: made.allDay }))
  // 1. After the task is kept, the box opens empty again for the next.
  await page.evaluate(() => window.api.showPrompt())
  await wait(1000)
  await page.click(EDITOR)
  await page.keyboard.type('Claude references for the right reddit groups to market to', { delay: 15 })
  await wait(300)
  check('while the words are still coming, it is a note', /note/i.test(await chip()), await chip())
  await film('read', 30)
  await wait(400)
  check('rested, the Mac reads it as a task: the kind chip says so', /task/i.test(await chip()), await chip())
  const will = await page.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')
  check('the line under the box says it will go to your tasks, read on this Mac', /Add to your tasks/.test(will) && /read on this Mac/.test(will), will)
  await page.locator('[data-will="task"] [data-will-off]').click()
  await wait(500)
  check('its × keeps it a note', /note/i.test(await chip()), await chip())
  await wait(1200)
  check('and the Mac is not asked over the kind picked', /note/i.test(await chip()), await chip())

} finally {
  await c.close()
}
done()
