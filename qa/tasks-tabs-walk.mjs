// Tasks' tabs walked one after another, as the user did (23 Nov: "something confusing ... only obvious when you move
// through them"): the bar's controls stand still from tab to tab, the count is what is shown, "On hold" is one folded
// list at the foot of each tab with its dates in quiet ink, and the carried-over card picks a day in place.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, close } = s
h.setDefaultTimeout(8000)
try {
  await s.v('settings:set', { carryAsk: 2 })
  await h.locator('aside [data-side-row]', { hasText: /^Tasks/ }).first().click(); await h.waitForTimeout(1500)
  // A fresh start's leftovers: some on hold, as on the user's book.
  const at = await h.evaluate(() => new Date().toISOString())
  const open = (await s.v('tasks')).filter((t) => t.status === 'open')
  for (const one of open.filter((t) => !t.dueAt).concat(open.filter((t) => t.recurrence)).slice(0, 6)) await s.v('task:hold', one.id, at)
  const bar = () => h.evaluate(() => {
    const box = (sel) => { const r = document.querySelector(`[data-page] header ${sel}`)?.getBoundingClientRect(); return r && r.width ? Math.round(r.left) : null }
    const said = document.querySelector('[data-page] header')?.textContent?.match(/(\d+) open/)?.[1]
    const rows = [...document.querySelectorAll('[data-task-row]')].filter((r) => !r.hasAttribute('data-set-aside')).length
    const held = document.querySelector('[data-on-hold]')
    const last = [...document.querySelectorAll('[data-task-row], [data-on-hold]')].at(-1)
    return { display: box('[data-display]'), search: box('input'), said: said ? Number(said) : null, rows, heldOpen: held?.getAttribute('aria-expanded'), heldLast: !!held && last === held }
  })
  const seen = {}
  for (const tab of ['Today', 'Upcoming', 'Later', 'Routines', 'All']) {
    await h.getByRole('tab', { name: tab }).first().click(); await h.waitForTimeout(900)
    seen[tab] = await bar()
  }
  const lefts = new Set(Object.values(seen).map((one) => `${one.display}`))
  check('the bar\'s Sort button stands in one place on every tab, Today included', lefts.size === 1 && !lefts.has('null'), JSON.stringify(seen))
  check('"N open" counts the tasks shown, never those folded on hold', Object.values(seen).every((one) => one.said === null || one.said === one.rows), JSON.stringify(seen))
  check('"On hold" is folded and last on every tab that has it', Object.values(seen).filter((one) => one.heldOpen).every((one) => one.heldOpen === 'false' && one.heldLast), JSON.stringify(seen))
  // Its tasks, opened: dates in quiet ink, never a red "Late". At the foot of the list, scrolled to.
  await h.mouse.move(700, 500); for (let n = 0; n < 12; n++) await h.mouse.wheel(0, 800); await h.waitForTimeout(600)
  await h.locator('[data-on-hold]').first().click(); await h.waitForTimeout(600)
  const ink = await h.evaluate(() => { const meta = document.querySelector('[data-set-aside] [data-task-meta] span'); const quiet = document.createElement('span'); quiet.className = 'text-muted-foreground'; document.body.append(quiet); const want = getComputedStyle(quiet).color; quiet.remove(); return { got: meta && getComputedStyle(meta).color, want } })
  check('a task on hold shows its dates in quiet ink', !!ink.got && ink.got === ink.want, JSON.stringify(ink))
  await h.locator('[data-on-hold]').first().click(); await h.waitForTimeout(400)
  // The carried-over card: "Pick a date" opens a small calendar in place, the task stays shut; "Tomorrow" in it moves it.
  await h.getByRole('tab', { name: 'Today' }).first().click(); await h.waitForTimeout(900)
  const card = h.locator('[data-task-ask="carried"]').first()
  // A seed made today has nothing carried over yet (qa/make-seed.mjs): said, not failed.
  if (!(await card.count())) { console.log('SKIP the carried-over card: no task in this seed has been carried over twice'); throw Object.assign(new Error('skip'), { skip: true }) }
  const id = await card.evaluate((el) => el.closest('[data-task-row]')?.getAttribute('data-id'))
  await card.getByText('Pick a date').click(); await h.waitForTimeout(500)
  const placed = await h.evaluate(() => ({ calendar: !!document.querySelector('[data-radix-popper-content-wrapper] [role="grid"], [data-radix-popper-content-wrapper] table'), opened: !!document.querySelector('[data-open][data-task-row], [data-close-beside]') }))
  check('"Pick a date" opens a calendar in place, not the whole task', placed.calendar && !placed.opened, JSON.stringify(placed))
  await h.locator('[data-radix-popper-content-wrapper]').getByText('Tomorrow', { exact: true }).first().click(); await h.waitForTimeout(800)
  const due = (await s.v('tasks')).find((t) => t.id === id)?.dueAt
  const tomorrow = await h.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toDateString() })
  check('…and "Tomorrow" there moves the task to tomorrow', !!due && new Date(due).toDateString() === tomorrow, JSON.stringify({ due, tomorrow }))
  // The carried-over card's own "Tomorrow", one press.
  const next = h.locator('[data-task-ask="carried"]').first()
  if (await next.count()) {
    const other = await next.evaluate((el) => el.closest('[data-task-row]')?.getAttribute('data-id'))
    await next.getByRole('button', { name: 'Tomorrow', exact: true }).click(); await h.waitForTimeout(800)
    const moved = (await s.v('tasks')).find((t) => t.id === other)?.dueAt
    check('the card\'s own "Tomorrow" moves it to tomorrow in one press', !!moved && new Date(moved).toDateString() === tomorrow, JSON.stringify({ moved }))
  }
  if (process.env.QA_SHOTS) { await s.look?.('dark'); await h.waitForTimeout(400); await h.screenshot({ path: `${process.env.QA_SHOTS}/today-dark.png` }) }
} catch (error) { if (!error.skip) check('ran', false, error.stack) } finally { await close() }
done()
