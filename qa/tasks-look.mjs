// Tasks looked at: every tab in light and dark, at 5, 50, 500 and 5,000 open tasks
// (long names, no dates, late ones, a fresh start), at 560 wide, and the bar's
// controls measured on every tab switch: nothing in it moves by even 1px.
//   QA_SHOTS=dir QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-tasks/main/index.js HALIGTREE_QA_AWAY=1 node qa/tasks-look.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.QA_SHOTS
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, go, both, size } = c
const wait = (ms) => h.waitForTimeout(ms)
const TABS = ['today', 'upcoming', 'later', 'routines', 'alltasks']
const day = (n) => new Date(Date.now() + n * 864e5).toISOString()
const LONG = 'Write to the council about the broken streetlight on the corner of Mill Lane and Station Road, again, with the photos'
let made = 0
const seed = async (to) => {
  for (; made < to; made++) {
    const n = made
    const id = (await v('task:add', n % 7 === 0 ? `${LONG} ${n}` : `Task number ${n}`, undefined, false)).id
    // A spread: late, today, days to come, someday, none.
    const kind = n % 5
    await v('task:save', id, kind === 0 ? { due: day(-1 - (n % 4)) } : kind === 1 ? { due: day(0) } : kind === 2 ? { due: day(1 + (n % 20)) } : kind === 3 ? { plan: 'someday' } : { due: null, plan: null })
  }
}
const bar = () => h.evaluate(() => Object.fromEntries(['[data-list-tabs]', '[data-write-day]', '[aria-label="More"]'].map((sel) => {
  const r = document.querySelector(sel)?.getBoundingClientRect()
  return [sel, r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}` : 'none']
})))
try {
  for (const t of (await v('tasks')).filter((t) => t.status === 'open')) await v('task:save', t.id, { status: 'done' })
  for (const count of [5, 50, 500, 5000]) {
    const started = Date.now()
    await seed(count)
    if (count === 5) await h.reload(), await wait(1500)
    for (const tab of TABS) {
      await go(tab); await wait(count >= 500 ? 1500 : 900)
      if (shots) await both(`${shots}/${tab}-${count}`)
      const wide = await h.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
      if (!wide) check(`${tab} at ${count}: no sideways scroll`, false)
    }
    console.log(`(${count}: seeded and shot in ${Math.round((Date.now() - started) / 1000)}s)`)
  }
  // Stillness: the bar's tabs, "Write out my day" and ⋯ stay put on every tab.
  await go('today'); await wait(900)
  const first = JSON.stringify(await bar())
  const moved = []
  for (const tab of [...TABS, 'today']) { await go(tab); await wait(700); const now = JSON.stringify(await bar()); if (now !== first) moved.push(`${tab}: ${now}`) }
  check('the bar stays put on every tab switch', !moved.length, moved.join(' / ') || first)
  // A fresh start: each tab keeps a folded "On hold".
  await v('tasks:fresh-start'); await wait(800)
  for (const tab of TABS) {
    await go(tab); await wait(1200)
    check(`${tab} shows "On hold" folded`, (await h.locator('[data-on-hold][aria-expanded="false"]').count()) === 1)
    if (shots && (tab === 'today' || tab === 'alltasks')) await both(`${shots}/${tab}-held`)
  }
  // Phone width: the window at its smallest.
  await size(560, 800); await wait(900)
  for (const tab of TABS) {
    await go(tab); await wait(900)
    if (shots) await both(`${shots}/${tab}-560`)
    const sideways = await h.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)
    const cut = await h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button, [data-write-day], [aria-label="More"]')].filter((el) => { const r = el.getBoundingClientRect(); return r.right > innerWidth || r.left < 0 }).map((el) => el.textContent).join(','))
    check(`${tab} at 560: no sideways scroll, nothing in the bar cut off`, sideways <= 1 && !cut, `${sideways}px over; cut: ${cut || 'none'}`)
  }
} catch (error) {
  check('ran to the end', false, error.message)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed} of ${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
