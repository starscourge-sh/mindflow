// Tasks on the All tab, in your own order (the user, 23 Nov: "why cant i drag to place up there?"): a row dragged up
// lands there; a task on hold dragged up among the live ones is brought back; a live one dragged into "On hold" goes on hold.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
// Tall enough that "Today" and "On hold" are both in view, as on the user's screen: the drag goes straight up, no scrolling.
await s.size(1300, 1400)
const { h, close } = s
h.setDefaultTimeout(8000)
const rowsAll = () => h.evaluate(() => [...document.querySelectorAll('[data-task-row]')].map((r) => ({ id: r.dataset.id, held: r.hasAttribute('data-set-aside'), y: r.getBoundingClientRect().top + 12 })))
let lookAt = null
const drag = async (from, to) => {
  await h.mouse.move(460, from); await h.mouse.down()
  await h.mouse.move(460, from - 8, { steps: 3 }); await h.mouse.move(460, to, { steps: 14 }); await h.waitForTimeout(300)
  lookAt = await h.evaluate(() => ({ lit: document.querySelectorAll('[data-drop-hot]').length, words: document.querySelector('[data-carry-card]')?.textContent ?? '' }))
  await h.mouse.up(); await h.waitForTimeout(1200)
}
const rows = rowsAll
const held = async (id) => (await s.v('tasks:held')).some((t) => t.id === id)
// "On hold" stands at the foot of the list: scrolled to it, as a person does.
// Everything from "Overdue" to the first of "On hold" stands in one screen here: only what is in view is aimed at.
const foot = async () => { await h.mouse.move(700, 500); for (let n = 0; n < 12; n++) await h.mouse.wheel(0, -600); await h.waitForTimeout(700) }
const seen = async () => { const tall = await h.evaluate(() => innerHeight); return (await rows()).filter((r) => r.y > 100 && r.y < tall - 40) }
try {
  await h.locator('aside [data-side-row]', { hasText: /^Tasks/ }).first().click(); await h.waitForTimeout(1200)
  await h.getByRole('tab', { name: 'All' }).first().click(); await h.waitForTimeout(1200)
  // The part each row stands in, by the heading above it.
  const partsNow = () => h.evaluate(() => [...document.querySelectorAll('[data-task-row]')].map((row) => ({ id: row.dataset.id, part: [...document.querySelectorAll('[data-row-part]')].filter((one) => one.getBoundingClientRect().top < row.getBoundingClientRect().top).at(-1)?.dataset.rowPart ?? null })))
  // As after a fresh start: most put on hold, so "Today" and "On hold" stand in one screen, as on the user's.
  const before = await partsNow()
  const today = before.filter((r) => r.part === 'Today').map((r) => r.id)
  const at = await h.evaluate(() => new Date().toISOString())
  for (const one of before.filter((r) => r.part !== 'Today').slice(2)) await s.v('task:hold', one.id, at)
  await h.getByRole('tab', { name: 'Today' }).first().click(); await h.waitForTimeout(600)
  await h.getByRole('tab', { name: 'All' }).first().click(); await h.waitForTimeout(1200)
  let list
  await foot()
  if ((await h.locator('[data-on-hold]').getAttribute('aria-expanded')) === 'false') { await h.locator('[data-on-hold]').click(); await h.waitForTimeout(600) }
  await foot()
  list = await seen()
  const live = list.filter((r) => !r.held).slice(-3)
  // 1 your order: the last live row dragged above the one two up.
  await drag(live[2].y, live[0].y - 6)
  const after = (await rows()).filter((r) => !r.held).map((r) => r.id)
  check('on All, a row dragged up lands there', after.indexOf(live[2].id) < after.indexOf(live[1].id), JSON.stringify({ was: live.map((r) => r.id), after: after.slice(-3) }))
  // 2 out of "On hold": brought back. "On hold" and the live rows over it, in one screen.
  await h.evaluate(() => document.querySelector('[data-on-hold]')?.scrollIntoView({ block: 'center' })); await h.waitForTimeout(600)
  list = await seen()
  const one = list.find((r) => r.held)
  await drag(one.y, list.filter((r) => !r.held).at(-1).y)
  check('a task on hold dragged up among the live ones is brought back', !(await held(one.id)), one.id)
  // 2b as the user did: a task on hold let go on "Today" is brought back for today and stands under "Today", not in "Overdue".
  // The last of "Today" near the top, so "On hold" under it is in the same screen.
  await h.evaluate(() => { const head = document.querySelector('[data-row-part="Today"]'); const rows = [...document.querySelectorAll('[data-task-row]')].filter((one) => head && one.getBoundingClientRect().top > head.getBoundingClientRect().bottom); const next = document.querySelector('[data-row-part]:not([data-row-part="Today"]):not([data-row-part="Overdue"])'); const inToday = rows.filter((one) => !next || one.getBoundingClientRect().top < next.getBoundingClientRect().top); inToday.at(-1)?.scrollIntoView({ block: 'start' }) }); await h.waitForTimeout(600)
  const todayRow = await h.evaluate(() => { const head = document.querySelector('[data-row-part="Today"]'); const next = document.querySelector('[data-row-part]:not([data-row-part="Today"]):not([data-row-part="Overdue"])'); const r = [...document.querySelectorAll('[data-task-row]')].filter((one) => head && one.getBoundingClientRect().top > head.getBoundingClientRect().bottom && (!next || one.getBoundingClientRect().top < next.getBoundingClientRect().top)).at(-1); return r && { id: r.dataset.id, y: r.getBoundingClientRect().top + 12 } })
  // One with no deadline: a past deadline keeps a task in "Overdue" whatever its day, as it should.
  // One with a deadline gone by: dropped on "Today" that deadline moves too, so it is not still "Overdue".
  const late = new Set((await s.v('tasks:held')).filter((t) => t.deadline).map((t) => t.id))
  const keep = (await seen()).find((r) => r.held && late.has(r.id)) ?? (await seen()).find((r) => r.held)
  if (!keep || !todayRow) throw new Error(JSON.stringify({ keep, todayRow }))
  await drag(keep.y, todayRow.y)
  const back = (await s.v('tasks')).find((t) => t.id === keep.id)
  const under = await h.evaluate((id) => { const row = document.querySelector(`[data-task-row][data-id="${id}"]`); const heads = [...document.querySelectorAll('[data-row-part]')].filter((one) => row && one.getBoundingClientRect().top < row.getBoundingClientRect().top); return heads.at(-1)?.dataset.rowPart ?? null }, keep.id)
  check('carried over another part, room opens where it lands; no heading lights', lookAt?.lit === 0, JSON.stringify(lookAt))
  check('a task on hold dropped on "Today" is brought back for today and stands under "Today"', !(await held(keep.id)) && !!back?.dueAt && new Date(back.dueAt).toDateString() === new Date(await h.evaluate(() => Date.now())).toDateString() && under === 'Today', JSON.stringify({ todayRow: !!todayRow, due: back?.dueAt, under }))
  // 2c the user's next try: a task with no date let go on "Today" is moved to today, not refused.
  await foot()
  const parts = await partsNow()
  const undated = parts.find((r) => r.part === 'No date')
  const inToday = parts.find((r) => r.part === 'Today')
  const ys = await h.evaluate(([a, b]) => [a, b].map((id) => document.querySelector(`[data-task-row][data-id="${id}"]`).getBoundingClientRect().top + 12), [undated.id, inToday.id])
  await drag(ys[0], ys[1])
  const moved = (await s.v('tasks')).find((t) => t.id === undated.id)
  check('a task with no date dropped on "Today" is moved to today', !!moved?.dueAt && new Date(moved.dueAt).toDateString() === new Date(await h.evaluate(() => Date.now())).toDateString(), JSON.stringify({ due: moved?.dueAt }))
  // 3 into "On hold": put on hold.
  await h.evaluate(() => document.querySelector('[data-on-hold]')?.scrollIntoView({ block: 'center' })); await h.waitForTimeout(500)
  list = await seen()
  const away = list.filter((r) => !r.held).at(-1)
  const into = list.find((r) => r.held)
  await drag(away.y, into.y)
  check('a live task dragged into "On hold" goes on hold', await held(away.id), away.id)
  // The add box (the user, 23 Nov): ⌫ once keeps "!!!" as words; deleted and typed again, it is read again.
  const box = h.getByPlaceholder(/Add a task/).first()
  await box.click(); await h.keyboard.type('ship it !!!', { delay: 20 }); await h.waitForTimeout(300)
  const chips = () => h.evaluate(() => [...document.querySelectorAll('[data-task-chip]')].map((one) => one.getAttribute('data-task-chip')).join(','))
  const first = await chips()
  await h.keyboard.press('Backspace'); await h.waitForTimeout(200)
  const kept = await chips()
  for (let n = 0; n < 3; n++) await h.keyboard.press("Backspace")
  await h.keyboard.type('!!!', { delay: 20 }); await h.waitForTimeout(300)
  const again = await chips()
  check('"!!!" kept as words by ⌫, then deleted (three presses, one each) and typed again, is read as a priority again', /priority/.test(first) && !/priority/.test(kept) && /priority/.test(again) && (await box.inputValue()) === 'ship it !!!', JSON.stringify({ first, kept, again, words: await box.inputValue() }))
  await h.keyboard.press('Meta+a'); await h.keyboard.press('Backspace')
} catch (error) { check('ran', false, error.stack) } finally { await close() }
done()
