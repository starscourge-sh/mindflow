// An Inbox capture's "Turn it into > Make it a goal…": the goal sheet opens named from the capture's first line,
// "No day: someday" is allowed, and setting it makes a goal with no day, opened on Goals.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-q/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/capture-goal.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0, inboxDays: 0 })
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Walk the Camino one day' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'From Porto, slowly' }] }] } }))
  await c.send('capture', id); await wait(2000)
  await h.click('[data-note-head] button[aria-label="More"]'); await wait(500)
  await h.locator('[role=menu] [data-slot="dropdown-menu-sub-trigger"]').filter({ hasText: 'Turn it into' }).first().hover(); await wait(500)
  const line = h.locator('[data-slot="dropdown-menu-sub-content"] [role=menuitem]').filter({ hasText: 'Make it a goal' })
  check('"Turn it into" offers "Make it a goal…"', (await line.count()) === 1)
  await line.first().click(); await wait(800)
  const name = await h.locator('input[aria-label="The goal"]').inputValue().catch(() => null)
  check('the goal sheet opens named from the capture', name === 'Walk the Camino one day', String(name))
  const chip = await h.evaluate(() => { const one = [...document.querySelectorAll('[role=dialog] button')].find((b) => b.innerText.replace(/\s+/g, "").includes("Noday:someday")); one?.click(); return [...document.querySelectorAll('[role=dialog] button')].map((b) => b.innerText.replace(/\s+/g, ' ')).join(' | ') })
  await wait(400)
  check('"No day: someday" is allowed', (await h.locator('[data-someday-said]').count()) === 1, chip)
  await h.screenshot({ path: `${process.env.QA_DATA}/goal-sheet.png` })
  await h.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.innerText.includes('Set the goal'))?.click()); await wait(1500)
  const goals = await v('items', 'goal')
  const made = goals.find((one) => one.title === 'Walk the Camino one day')
  check('a goal with no day is made', !!made && !made.goalAt, made ? `goalAt ${made.goalAt}` : 'none')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
