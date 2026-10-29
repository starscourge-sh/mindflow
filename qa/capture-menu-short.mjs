// A capture's "…" menu stays short: Resolve on its own line, and what it can become (a gem, a question, a task, a
// clue, another kind) on one "Turn it into" line that opens beside it, each with its key.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/capture-menu-short.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const lines = () => h.evaluate(() => [...document.querySelectorAll('[role=menu]:last-of-type [role=menuitem]')].map((one) => one.textContent.trim()))
try {
  await v('settings:set', { sounds: false, hintRate: 0, inboxDays: 0 })
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A note for the menu' }] }] } }))
  await c.send('capture', id); await wait(2000)
  await h.click('[data-note-head] button[aria-label="More"]'); await wait(500)
  const top = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
  check('the menu has Resolve and a "Turn it into" line', top.some((one) => one.startsWith('Resolve')) && top.some((one) => one.startsWith('Turn it into')), JSON.stringify(top))
  check('and no longer lists the turns one by one', !top.some((one) => /^(Save as a gem|Start an open question|Make it a task|Add as a clue|Change kind)/.test(one)), JSON.stringify(top))
  await h.locator('[role=menu] [data-slot="dropdown-menu-sub-trigger"]').filter({ hasText: 'Turn it into' }).first().hover(); await wait(500)
  const sub = await h.evaluate(() => [...document.querySelectorAll('[data-slot="dropdown-menu-sub-content"] [role=menuitem]')].map((one) => one.textContent.trim()))
  check('"Turn it into" opens the five, with their keys', ['Save as a gemP', 'Start an open question from thisH', 'Make it a task', 'Add as a clue to a question…', 'Change kind…'].every((one) => sub.includes(one)), JSON.stringify(sub))
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/capture-menu.png` })
  await h.locator('[data-slot="dropdown-menu-sub-content"] [role=menuitem]').filter({ hasText: 'Save as a gem' }).first().click(); await wait(1200)
  check('and a line there does its work', (await h.evaluate((one) => window.api.captures.get(one), id))?.status === 'promoted')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
