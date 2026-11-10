// 10 Nov: in a week, "+N more" over hidden events opens the Calendar's own Day view, where they all have room;
// to-dos alone still open the day's page (qa/big-numbers.mjs).
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/cal-more-events.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
let ok = true
const check = (name, pass, detail = '') => { ok &&= pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
try {
  const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + 1)
  const next = new Date(day); next.setDate(day.getDate() + 1)
  for (let i = 1; i <= 9; i++) await v('event:add', { title: `All-day probe ${i}`, start: day.toISOString(), end: next.toISOString(), allDay: true })
  await c.go('calendar'); await h.waitForTimeout(1500)
  await h.keyboard.press('w').catch(() => {}); await h.waitForTimeout(800)
  const key = await h.evaluate(() => document.querySelector('[data-cal-allday-more]')?.getAttribute('data-cal-allday-more'))
  check('a crowded day in the week ends in "+N more"', !!key, String(key))
  if (key) {
    await h.locator(`[data-cal-allday-more="${key}"]`).click(); await h.waitForTimeout(1200)
    const after = await h.evaluate(() => ({ page: document.querySelector('[data-page]')?.getAttribute('data-page'), heads: document.querySelectorAll('[data-cal-head]').length, shown: [...document.querySelectorAll('[data-cal-allday-lane] *')].filter((el) => /All-day probe/.test(el.textContent ?? '') && el.children.length === 0).length }))
    check('it opens the Calendar on that one day', after.page === 'calendar' && after.heads === 1, JSON.stringify(after))
    // Up to ten rows on one day, less any taken by a bar over many days or the day's study chip.
    check('where nearly all of them have room', after.shown >= 8, JSON.stringify(after))
    if (process.env.SHOT) await c.both(process.env.SHOT)
  }
} catch (error) { check('the run finished', false, error.message.split('\n')[0]) }
console.log(ok ? 'all passed' : 'some failed')
await c.close(); process.exit(0)
