// Undo puts back what was there: a thought sent from under a note comes back
// into its field with the caret at the end; a gem pinned and then put in the
// Bin comes back out pinned, and one archived comes back archived; a deleted
// log comes back on its own day; a reopen undone keeps the day it was settled;
// a read undone keeps its place in the queue; a monthly task moved and moved
// back keeps its day; a task added from the line comes back into it; an Inbox
// exit undone opens that capture again.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/undo-restores.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1180, height: 820 })
const { h, v, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })

try {
  // --- a thought under an open capture
  await go('inbox')
  await h.locator('[data-row]').first().click()
  await h.waitForTimeout(900)
  const field = h.locator('textarea[placeholder="Add a thought…"]').first()
  await field.click()
  await field.type('The tide was late again', { delay: 10 })
  await h.keyboard.press('Enter')
  await h.waitForFunction(() => /thought is kept/.test(document.body.innerText), null, { timeout: 4000 }).catch(() => {})
  check('a thought is kept, and the field empties', (await field.inputValue()) === '')
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(700)
  check('⌘Z puts the thought back in its field', (await field.inputValue()) === 'The tide was late again', JSON.stringify(await field.inputValue()))
  await h.keyboard.type(' today', { delay: 10 })
  check('with the caret at the end', (await field.inputValue()) === 'The tide was late again today', JSON.stringify(await field.inputValue()))
  await field.fill('')
  await h.keyboard.press('Escape')

  // --- the Bin keeps what a gem was
  const gems = await v('items', 'nugget').catch(() => null) ?? []
  const first = gems.find((one) => one.pinnedAt) ?? gems[0]
  const second = gems.find((one) => one !== first && !one.pinnedAt)
  if (first && second) {
    if (!first.pinnedAt) await v('pin', 'nuggets', first.id, true)
    await h.evaluate((id) => window.api.haligtree('notes:archive', 'nuggets', [id], true), second.id)
    const before = (await v('items', 'nugget')).find((one) => one.id === first.id)
    await v('bin:put', first.id); await v('bin:put', second.id)
    await v('bin:restore', 'nugget', first.id); await v('bin:restore', 'nugget', second.id)
    const after = await h.evaluate(() => window.api.haligtree('bin:list'))
    const all = (await v('items', 'nugget'))
    const one = all.find((x) => x.id === first.id)
    check('a gem out of the Bin is pinned again if it was', !!before?.pinnedAt && !!one?.pinnedAt, `before ${before?.pinnedAt} after ${one?.pinnedAt}`)
    check('a gem archived before the Bin is archived again', !!all.find((x) => x.id === second.id)?.archivedAt)
    check('neither is left in the Bin', !after.some((x) => x.id === first.id || x.id === second.id))
  } else check('sandbox has gems to try the Bin with', false)
  // --- a goal's log deleted and undone: the same row, on the same day
  const goals = await v('items', 'goal')
  const goal = goals.find((one) => !one.closedAt) ?? goals[0]
  if (goal) {
    const log = await v('clue', goal.id, 'Ran 5k before work')
    const before = (await v('item', goal.id)).glosses.find((one) => one.id === log)
    const cut = await v('clue:cut', log)
    check('a deleted log is gone', !(await v('item', goal.id)).glosses.some((one) => one.id === log))
    await v('clue:put', cut)
    const after = (await v('item', goal.id)).glosses.find((one) => one.id === log)
    check('undone, it is back with its own id and day', !!after && after.createdAt === before.createdAt && after.body === before.body, JSON.stringify(after))
    // --- a settled goal reopened and undone: settled on the day it first was
    await v('goal:close', goal.id, 'made it', '2026-01-02T10:00:00.000Z')
    await v('goal:reopen', goal.id)
    await v('goal:close', goal.id, 'made it', '2026-01-02T10:00:00.000Z')
    check('a reopen undone keeps the day it was settled', (await v('item', goal.id)).closedAt === '2026-01-02T10:00:00.000Z')
    await v('goal:reopen', goal.id)
  } else check('sandbox has a goal', false)

  // --- read from the middle of the queue, undone: back in its place
  const { queue } = await v('queue')
  if (queue.length >= 3) {
    const middle = queue[1]
    await v('queue:done', middle.id)
    await v('queue:undone', middle.id, true)
    const now = (await v('queue')).queue.map((one) => one.id)
    check('a read undone is back in its place in the queue', now.indexOf(middle.id) === 1, `at ${now.indexOf(middle.id)}`)
  } else check('sandbox queue has three to try', false, String(queue.length))

  // --- a monthly task on the 31st, moved by hand and undone: still on the 31st
  const made = await v('task:add', 'Pay the rent')
  const id = typeof made === 'string' ? made : made?.id
  await v('task:save', id, { due: '2026-10-31T09:00:00.000Z', recurrence: 'every month', reschedules: 0 })
  await v('task:done', id)
  const anchored = await v('task', id)
  await v('task:save', id, { due: '2026-12-05T09:00:00.000Z' })
  await v('task:save', id, { due: anchored.dueAt, reschedules: anchored.reschedules ?? 0 })
  await v('task:done', id)
  const next = (await v('task', id)).dueAt
  check('a series moved and moved back keeps its day: the 31st after a short month', anchored.dueAt?.startsWith('2026-11-30') && next?.startsWith('2026-12-31'), `${anchored.dueAt} then ${next}`)

  // --- the add line in Tasks: a task undone, its words back in the line
  await go('today')
  const add = h.locator('input[placeholder^="Add a task"]:visible').first()
  await add.click()
  await add.fill('Call the bank friday')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1500)
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(800)
  check('a task added from the line and undone comes back into the line', (await add.inputValue()) === 'Call the bank friday', JSON.stringify(await add.inputValue()))
  await add.fill('')

  // --- an Inbox exit undone: that capture open again
  await go('inbox')
  await h.keyboard.press('Escape')
  await h.locator('[data-row]:visible').first().click({ timeout: 5000 }).catch(async (error) => { console.log(String(error.message).split('\n').slice(0, 8).join(' | ')); await h.locator('[data-row]:visible').first().click({ force: true }) })
  await h.waitForTimeout(900)
  const title = async () => h.evaluate(() => document.querySelector('.tiptap.ProseMirror')?.textContent?.slice(0, 40))
  const was = await title()
  // Its details out beside it (they start put away), and "Resolve" in them.
  await h.evaluate(() => (localStorage.setItem('noteDetails', 'open'), window.dispatchEvent(new Event('mf:details'))))
  await h.waitForTimeout(500)
  const pressed = await h.evaluate(() => { const one = [...document.querySelectorAll('button, [role=button]')].find((b) => b.textContent?.trim() === 'Resolve'); one?.click(); return !!one })
  if (!pressed) throw new Error('no Resolve beside the open capture')
  await h.waitForTimeout(700)
  const moved = await title()
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(1000)
  check('an exit undone opens that capture again', moved !== was && (await title()) === was, `${was} / ${moved} / ${await title()}`)
} catch (error) {
  check('ran to the end', false, String(error.message).split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
