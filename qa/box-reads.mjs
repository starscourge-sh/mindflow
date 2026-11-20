// Quick capture reads what is typed (App.tsx, lib/box-tokens.ts, components/haligtree/will-do.tsx, main/write.ts
// `ai:kind`), the Mac's model stood in (HALIGTREE_QA_CAPS=ai, HALIGTREE_QA_KIND). What it read is said on ONE quiet
// line under the words, whose room is kept from the start, so the box never grows as a reading comes:
// 1. "every sat", as the user typed it: one line ("A task, every Saturday from …"), no second row of the day, no
//    "the only one" (a repeat is many), the box no taller than when empty; the kind chip solid, with a sparkle for a
//    guess. ⌫ straight after the lit words leaves that part out of the line.
// 2. A task with a day and a time ("Design meeting tomorrow 10:00") says its when on that line; ⌘↵ makes the task
//    for that time.
// 3. A line the wording's rules read nothing in ("Claude references for the right reddit groups to market to") is read
//    by the Mac's model as a task once the words rest: the kind chip says Task, the line says "A task" and that it was
//    read on this Mac; pressing that part keeps it a note, and nothing asks again over that.
// Real keys only. QA_SHOTS films each, every 50ms.
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
const line = () => page.evaluate(() => document.querySelector('[data-will-line]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
/** The box as drawn: its card's height, how many lines under the words, and how tall the one line is. */
const box = () => page.evaluate(() => ({
  card: Math.round(document.querySelector('.app-container')?.getBoundingClientRect().height ?? 0),
  lines: document.querySelectorAll('[data-will-line]').length,
  tall: Math.round(document.querySelector('[data-will-line]')?.getBoundingClientRect().height ?? 0),
  stacked: document.querySelectorAll('[data-day-around]:not([data-will-line] *), [data-box-from]:not([data-will-line] *)').length,
  page: document.body.innerText
}))
const fresh = async () => {
  await page.evaluate(() => window.api.showPrompt())
  await wait(1000)
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await wait(300)
}
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: false, boxGlance: false })
  // 1. "every sat": one calm line, the box the same height, the wording says it repeats.
  await fresh()
  const empty = await box()
  check('empty, the line’s room is kept but says nothing', empty.lines === 1 && !(await line()), JSON.stringify({ ...empty, page: undefined }))
  await page.keyboard.type('every sat', { delay: 30 })
  await film('every-sat', 16)
  await wait(500)
  const sat = await box()
  const said = await line()
  check('“every sat”: one line under the words, no rows stacked under it', sat.lines === 1 && sat.stacked === 0 && sat.tall <= 30, JSON.stringify({ ...sat, page: undefined }))
  check('the box is no taller than it was empty', sat.card === empty.card, `${empty.card} → ${sat.card}`)
  check('the line says a task that repeats, and from when', /^A task, every Saturday from \S+/.test(said), said)
  check('and never “the only one”', !/only one/.test(sat.page), said)
  const look = await page.evaluate(() => { const one = document.querySelector('[data-kind-chip]'); return { style: one && getComputedStyle(one).borderStyle, guessed: !!one?.querySelector('[data-kind-guessed]') } })
  check('the kind chip is solid, a sparkle saying it was guessed', look.style !== 'dashed' && look.guessed, JSON.stringify(look))
  await page.keyboard.press('Backspace')
  await wait(400)
  check('⌫ straight after the lit words leaves that part out of the line', !/every Saturday/.test(await line()) && !(await page.$('[data-box-token="repeat"]')), await line())
  await page.keyboard.press('Escape'); await wait(400)

  // 2. A task with a day and a time: its when on the line; ⌘↵ makes it.
  await fresh()
  await page.keyboard.type('Design meeting tomorrow 10:00', { delay: 15 })
  await film('day', 12)
  await wait(500)
  const day = await line()
  check('the line says the day and time it lands on', /^A task, tomorrow at (10:00|10:00 AM)/.test(day), day)
  await page.keyboard.press('Meta+Enter'); await wait(1200)
  const made = (await v('tasks')).find((one) => one.title === 'Design meeting')
  const tomorrow = new Date(Date.now() + 86_400_000)
  check('⌘↵ makes the task for that day and time', !!made && new Date(made.dueAt).getDate() === tomorrow.getDate() && new Date(made.dueAt).getHours() === 10, JSON.stringify(made && { dueAt: made.dueAt, allDay: made.allDay }))

  // 3. Read by the Mac: "A task", said so; pressing it keeps a note.
  await fresh()
  await page.keyboard.type('Claude references for the right reddit groups to market to', { delay: 15 })
  await wait(300)
  check('while the words are still coming, it is a note', /note/i.test(await chip()), await chip())
  await film('read', 30)
  // The Mac's reading lands in its own time (the model, or its stand-in, after the words rest): waited for, up to 6 s.
  await page.waitForFunction(() => /task/i.test(document.querySelector('[data-kind-chip]')?.textContent ?? ''), null, { timeout: 6000 }).catch(() => {})
  check('rested, the Mac reads it as a task: the kind chip says so', /task/i.test(await chip()), await chip())
  const will = await line()
  check('the line under the box says a task, read on this Mac', /^A task/.test(will) && /read on this Mac/.test(will), will)
  await page.locator('[data-will="task"] [data-will-off]').click()
  await wait(500)
  check('pressing it keeps it a note', /note/i.test(await chip()), await chip())
  await wait(1200)
  check('and the Mac is not asked over the kind picked', /note/i.test(await chip()), await chip())
} finally {
  await c.close()
}
done()
