// What the 6 Nov oversight review wanted proved: ⌫ on a row only pointed at, on every list whose menu promises it; "Add a
// step" driven to its result; a Settings section kept by Back; a done task's menu tidy.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-oversight/main/index.js HALIGTREE_QA_AWAY=1 node qa/oversight-6nov.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  for (const [page, selector] of [['inbox', '[data-id]'], ['articles', '[data-id]'], ['nuggets', '[data-id]'], ['questions', '[data-id]'], ['upcoming', '[data-task-row]'], ['goals', '[data-id]'], ['queue', '[data-id], [data-queue-row]']]) {
    try {
      await go(page)
      await wait(1300)
      await h.evaluate(() => document.activeElement?.blur())
      const rows = h.locator(`[data-pane-card] :is(${selector})`)
      const before = await rows.count()
      if (!before) { check(`${page}: has rows to try`, false, 'no rows'); continue }
      const row = rows.nth(Math.min(1, before - 1))
      const id = await row.getAttribute('data-id')
      const words = (await row.innerText()).slice(0, 30).replace(/\n/g, ' ')
      // Two moves, as a real pointer makes: a first move from nowhere reports no distance.
      await row.hover({ position: { x: 20, y: 8 } })
      await row.hover({ position: { x: 40, y: 10 } })
      await wait(350)
      await h.keyboard.press('Backspace')
      await wait(1100)
      const after = await rows.count()
      const gone = !!id && !(await h.locator(`[data-pane-card] [data-id="${id}"]`).count())
      check(`${page}: ⌫ on a row only pointed at takes it away`, gone, `${before} to ${after}, ${id}, "${words}"`)
      if (gone) (await h.keyboard.press('Meta+z'), await wait(900))
    } catch (error) { check(`${page}: runs`, false, String(error).slice(0, 160)) }
  }
  // The keys win over a pointer resting elsewhere: J walks to a row, and ⌫ takes that one, not the one under the pointer.
  await go('nuggets'); await wait(1200)
  const list = h.locator('[data-pane-card] [data-id]')
  const rested = await list.nth(4).getAttribute('data-id')
  await list.nth(4).hover(); await wait(300)
  await h.keyboard.press('j'); await wait(250)
  await h.keyboard.press('Backspace'); await wait(1000)
  check('after J, ⌫ leaves the row under the pointer alone', (await h.locator(`[data-pane-card] [data-id="${rested}"]`).count()) > 0, rested)
  await h.keyboard.press('Meta+z'); await wait(900)
  // Pointing at a sidebar row takes nothing from the list.
  await go('articles'); await wait(1200)
  const count = await h.locator('[data-pane-card] [data-id]').count()
  await h.locator('[data-side-recent-row]').first().hover({ timeout: 3000 }).catch(() => undefined); await wait(300)
  await h.keyboard.press('Backspace'); await wait(900)
  const left = await h.locator('[data-pane-card] [data-id]').count()
  check('pointing at the sidebar, ⌫ does not take the sidebar row\'s note', left >= count - 1, `${count} to ${left}`)
  if (left < count) (await h.keyboard.press('Meta+z'), await wait(900))
  // Add a step, on a line with none.
  await go('today'); await wait(1200)
  const write = h.locator('button', { hasText: 'Write out my day' }).first()
  if (await write.count()) (await write.click({ timeout: 5000 }), await wait(800))
  const made = await v('task:add', 'A line with no steps', undefined, true)
  await v('task:save', made.id, { due: new Date().toISOString() })
  await wait(1000)
  await h.locator(`[data-day-line="${made.id}"] [data-line]`).first().click({ button: 'right' })
  await wait(400)
  await h.getByRole('menuitem', { name: /Add a step/ }).first().click()
  await wait(600)
  await h.keyboard.type('its first step', { delay: 15 })
  await h.keyboard.press('Enter')
  await wait(900)
  check('"Add a step" adds one to a line with none', (await v('task', made.id)).subtasks?.[0]?.text === 'its first step', JSON.stringify((await v('task', made.id)).subtasks))
  await h.keyboard.press('Escape')
  // A done task's menu, no doubled lines and no stray ends.
  await v('task:done', made.id); await wait(900)
  await h.evaluate(() => document.activeElement?.blur())
  await h.locator(`[data-day-line="${made.id}"]`).first().click({ button: 'right', position: { x: 300, y: 10 } })
  await wait(400)
  const seps = await h.evaluate(() => { const kids = [...document.querySelector('[role="menu"]').querySelectorAll('[role="menuitem"], [role="separator"]')].map((one) => one.getAttribute('role')); return { first: kids[0], last: kids.at(-1), twice: kids.some((one, i) => one === 'separator' && kids[i + 1] === 'separator') } })
  check('a done task\'s menu has no doubled or stray lines', seps.first !== 'separator' && seps.last !== 'separator' && !seps.twice, JSON.stringify(seps))
  await h.keyboard.press('Escape')
  // Settings: left for a page by a click starts on Your book, but Back returns to where you were.
  await go('settings'); await wait(800)
  await h.locator('[data-section="Appearance"]').first().click(); await wait(300)
  await go('inbox'); await wait(600)
  await h.keyboard.press('Meta+BracketLeft'); await wait(800)
  const on = await h.evaluate(() => document.querySelector('[data-section][aria-current="page"]')?.getAttribute('data-section'))
  check('Back to Settings returns to the section you left', on === 'Appearance', on)
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
