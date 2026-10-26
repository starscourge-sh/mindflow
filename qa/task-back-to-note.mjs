// A note made into a task by mistake turns back into the note: from the task's
// right-click menu, from the open task's own "Turn back into a note", and from
// a multi-pick. Each time the task is gone, the note is back in the Inbox as it
// was (open), the task in the Bin, and ⌘Z puts the task back.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-b/main/index.js HALIGTREE_QA_AWAY=1 node qa/task-back-to-note.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const P = '[data-page="upcoming"]'
const row = (id) => h.locator(`${P} [data-row][data-id="${id}"], ${P} [data-task-row][data-id="${id}"]`).first()
const state = (cap, task) => h.evaluate(async ([cap, task]) => ({ note: (await window.api.captures.get(cap))?.status, task: ((t) => !!t && t.status !== 'dropped')(await window.api.haligtree('task', task).catch(() => null)) }), [cap, task])
const blur = () => h.evaluate(() => document.activeElement?.closest?.('[contenteditable=true], input, textarea') && document.activeElement.blur())
const undo = async () => { await blur(); await wait(300); await h.keyboard.press('Meta+z'); await wait(900) }

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  await v('onboarding:set', { pageHints: false })
  const make = async (words) => {
    const cap = await h.evaluate((b) => window.api.captures.create({ kind: 'todo', body: b }), words)
    return { cap, task: (await v('toTask', cap)).id }
  }
  const one = await make('quillwort mend the fence')
  const two = await make('quillwort sharpen the saw')
  const three = await make('quillwort fold the maps')
  const four = await make('quillwort tune the fiddle')
  check('made into tasks, the notes leave the Inbox', (await state(one.cap, one.task)).note === 'resolved')
  await go('upcoming'); await wait(1000)

  // 1. Its right-click menu.
  await row(one.task).click({ button: 'right', position: { x: 40, y: 10 } }); await wait(400)
  const item = h.locator('[role=menu] [role=menuitem]').filter({ hasText: /^Turn back into a note/ }).first()
  check('the task\'s menu has "Turn back into a note"', (await item.count()) > 0)
  await item.click(); await wait(900)
  let s = await state(one.cap, one.task)
  check('from the menu: the task is gone, the note open in the Inbox', !s.task && s.note === 'open', JSON.stringify(s))
  await undo()
  s = await state(one.cap, one.task)
  check('⌘Z: the task is back, the note out of the Inbox again', s.task && s.note === 'resolved', JSON.stringify(s))

  // 2. The open task's own line.
  await row(two.task).click({ position: { x: 60, y: 10 } }); await wait(900)
  const line = h.locator(`${P} .note-pane button, ${P} .note-pane [role=button]`).filter({ hasText: /^Turn back into a note$/ }).first()
  check('the open task shows "Turn back into a note"', (await line.count()) > 0)
  await line.click(); await wait(900)
  s = await state(two.cap, two.task)
  check('from the open task: the task is gone, the note open in the Inbox', !s.task && s.note === 'open', JSON.stringify(s))
  const pane = await h.evaluate((P) => document.querySelector(`${P} .note-pane`)?.dataset.open ?? null, P)
  check('the page moves off the task it was', pane !== two.task, pane)

  // 3. A multi-pick.
  await blur()
  await row(three.task).click({ position: { x: 60, y: 10 }, modifiers: ['Meta'] }); await wait(300)
  await row(four.task).click({ position: { x: 60, y: 10 }, modifiers: ['Meta'] }); await wait(300)
  await row(four.task).click({ button: 'right', position: { x: 40, y: 10 } }); await wait(400)
  const many = h.locator('[role=menu] [role=menuitem]').filter({ hasText: /^Turn 2 back into notes/ }).first()
  check('a pick of two says "Turn 2 back into notes"', (await many.count()) > 0, await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()).join(' / ')))
  if (await many.count()) {
    await many.click(); await wait(900)
    const a = await state(three.cap, three.task), b = await state(four.cap, four.task)
    check('both notes back in the Inbox, both tasks gone', !a.task && !b.task && a.note === 'open' && b.note === 'open', JSON.stringify([a, b]))
  } else await h.keyboard.press('Escape')
} finally {
  await c.close()
}
done()
