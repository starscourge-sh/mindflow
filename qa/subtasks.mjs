// A task's subtasks are a list ready to write in (17 Nov item 37): an empty row at its end takes the first; ↵ makes it
// and the caret stays on a new row for the next; ↵ in a subtask opens a new row under it; ⇧↵ splits a subtask where the
// caret is; each row is drawn as Today's are, a round tick and the list's size. Driven with keys, as a person types.
// Then a checklist with a date in a step ("test 2 @ 3"): the offer to make it a task, "Make it a task" from its
// right-click (linked back, Undo), a drag by the grip, the last tick's offer to finish; and an empty description with
// no block grip or block menu on its placeholder.
// QA_SHOTS=dir keeps the list light and dark.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/subtasks.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const steps = async (id) => ((await v('tasks')).find((one) => one.id === id)?.subtasks ?? []).map((one) => one.text)
const focused = () => h.evaluate(() => { const one = document.activeElement; return one?.hasAttribute('data-subtask-new') ? 'new' : one?.getAttribute('data-subtask') ?? one?.tagName })
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  const made = await v('task:add', 'Morning routine')
  await c.send('task', made.id); await h.waitForTimeout(1400)
  const row = h.locator('[data-subtask-new]').first()
  check('item 37: an empty row is there to type the first in', await row.count() === 1, '')
  await row.click()
  await h.keyboard.type('exercise'); await h.keyboard.press('Enter'); await h.waitForTimeout(300)
  const stay = await focused()
  await h.keyboard.type('shake shower'); await h.keyboard.press('Enter'); await h.waitForTimeout(500)
  check('item 37: ↵ makes it and the caret is on a new row for the next', stay === 'new' && (await focused()) === 'new' && (await steps(made.id)).join('|') === 'exercise|shake shower', `${stay}, ${(await steps(made.id)).join('|')}`)
  // ⇧↵ in "shake shower" after "shake": two subtasks.
  await h.locator('[data-subtask="1"]').click()
  await h.keyboard.press('Meta+ArrowRight')
  for (let i = 0; i < ' shower'.length; i++) await h.keyboard.press('ArrowLeft')
  await h.keyboard.press('Shift+Enter'); await h.waitForTimeout(500)
  check('item 37: ⇧↵ splits a subtask where the caret is', (await steps(made.id)).join('|') === 'exercise|shake|shower' && (await focused()) === '2', `${(await steps(made.id)).join('|')}, caret in ${await focused()}`)
  // ↵ in the first opens a row under it.
  await h.locator('[data-subtask="0"]').click()
  await h.keyboard.press('Enter'); await h.waitForTimeout(300)
  await h.keyboard.type('wash'); await h.keyboard.press('Enter'); await h.waitForTimeout(500)
  check('item 37: ↵ in a subtask opens a new row under it', (await steps(made.id)).join('|') === 'exercise|wash|shake|shower' && (await focused()) === 'new', `${(await steps(made.id)).join('|')}, caret in ${await focused()}`)
  await h.keyboard.press('Escape'); await h.waitForTimeout(200)
  const look = await h.evaluate(() => {
    const tick = document.querySelector('[data-subtasks] [role="checkbox"]')
    const rows = [...document.querySelectorAll('[data-subtasks] [role="listitem"]')].map((one) => Math.round(one.getBoundingClientRect().height))
    return { round: tick ? getComputedStyle(tick).borderRadius : '', size: tick ? Math.round(tick.getBoundingClientRect().width) : 0, rows }
  })
  check('item 37: rows drawn as Today\'s, a round tick and a row each', parseFloat(look.round) >= 8 && look.size >= 17 && look.rows.every((one) => one >= 34), JSON.stringify(look))
  if (shots) await c.both(`${shots}/subtasks`)

  // An everyday user's checklist: a step whose words say when is offered as a task of its own; one made a task is
  // linked back and leaves the list, Undo puts it back; the rows drag into a new order; the last tick offers to finish.
  const trip = await v('task:add', 'Plan the trip')
  await c.send('task', trip.id); await h.waitForTimeout(1400)
  await h.locator('[data-subtask-new]').first().click()
  await h.keyboard.type('test 1'); await h.keyboard.press('Enter'); await h.waitForTimeout(300)
  await h.keyboard.type('test 2 @ 3'); await h.waitForTimeout(300)
  const lit = await h.evaluate(() => {
    const field = document.querySelector('[data-subtask-new]')
    const row = field?.closest('[role="listitem"]')
    return { marks: [...(field?.parentElement?.querySelectorAll('mark') ?? [])].map((one) => one.textContent), offer: row?.querySelector('[data-subtask-offer]')?.textContent ?? '' }
  })
  check('a date typed in a subtask lights, and "Make it a task, due …" is offered beside it', lit.marks.some((one) => /3/.test(one ?? '')) && /^Make it a task, due /.test(lit.offer), JSON.stringify(lit))
  await h.keyboard.press('Enter'); await h.waitForTimeout(500)
  check('the offer never converts by itself: ↵ keeps both as subtasks', (await steps(trip.id)).join('|') === 'test 1|test 2 @ 3' && !(await v('tasks')).some((one) => one.title === 'test 1'), (await steps(trip.id)).join('|'))
  await h.locator('[data-subtask="0"]').click({ button: 'right' }); await h.waitForTimeout(300)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent?.trim()))
  await h.getByRole('menuitem', { name: /^Make it a task/ }).click(); await h.waitForTimeout(900)
  const graduated = (await v('tasks')).find((one) => one.title === 'test 1' && one.status === 'open')
  const listed = graduated ? await h.locator(`[data-for-this="${graduated.id}"]`).count() : 0
  check('right-click "Make it a task": a task "test 1" made from the parent, one subtask left, listed under “For this”',
    !!graduated && graduated.fromId === trip.id && graduated.fromType === 'task' && (await steps(trip.id)).join('|') === 'test 2 @ 3' && listed === 1 && lines.some((one) => /^Move down/.test(one ?? '')) && lines.some((one) => /^Delete/.test(one ?? '')),
    `${JSON.stringify(graduated && { fromId: graduated.fromId, fromType: graduated.fromType })}, ${(await steps(trip.id)).join('|')}, listed ${listed}, menu ${lines.join(' / ')}`)
  await h.getByRole('button', { name: /^Undo/ }).first().click(); await h.waitForTimeout(900)
  check('Undo takes the task back and puts "test 1" back where it was', !(await v('tasks')).some((one) => one.title === 'test 1' && one.status === 'open') && (await steps(trip.id)).join('|') === 'test 1|test 2 @ 3', (await steps(trip.id)).join('|'))
  // Dragged by its grip, the shared carry: one drop line while carried, the new order kept on letting go.
  const rowsAt = await h.evaluate(() => [...document.querySelectorAll('[data-subtasks] [data-sortable-id]')].map((one) => { const box = one.getBoundingClientRect(); return { x: box.left, y: box.top + box.height / 2, h: box.height } }))
  await h.mouse.move(rowsAt[1].x + 40, rowsAt[1].y); await h.waitForTimeout(150)
  await h.mouse.move(rowsAt[1].x - 7, rowsAt[1].y); await h.mouse.down()
  await h.mouse.move(rowsAt[1].x - 7, rowsAt[1].y - 8, { steps: 3 }); await h.waitForTimeout(150)
  await h.mouse.move(rowsAt[0].x - 7, rowsAt[0].y - rowsAt[0].h / 3, { steps: 10 }); await h.waitForTimeout(250)
  const carried = await h.evaluate(() => ({ lines: document.querySelectorAll('[data-drop-line]').length, cards: document.querySelectorAll('[data-lifted]').length }))
  await h.mouse.up(); await h.waitForTimeout(600)
  check('drag a subtask by its grip: the one drop line and card, and the new order kept', carried.lines === 1 && carried.cards === 1 && (await steps(trip.id)).join('|') === 'test 2 @ 3|test 1', `${JSON.stringify(carried)}, ${(await steps(trip.id)).join('|')}`)
  await h.locator('[data-subtasks] [role="checkbox"]').nth(0).click(); await h.waitForTimeout(300)
  const early = await h.getByRole('button', { name: /Finish it/ }).count()
  await h.locator('[data-subtasks] [role="checkbox"]').nth(1).click(); await h.waitForTimeout(500)
  const offered = await h.getByText('All done: finish the task too?').count()
  const still = (await v('tasks')).find((one) => one.id === trip.id)?.status
  await h.getByRole('button', { name: /Finish it/ }).first().click(); await h.waitForTimeout(800)
  check('ticking the last open subtask offers to finish the task, and only then; it finishes when asked',
    early === 0 && offered >= 1 && still === 'open' && (await v('tasks')).find((one) => one.id === trip.id)?.status === 'done', `early ${early}, offered ${offered}, before ${still}, after ${(await v('tasks')).find((one) => one.id === trip.id)?.status}`)

  // A task with no description: its one empty line shows no block grip, and a right-click there opens no block menu.
  const bare = await v('task:add', 'Pack bags')
  await c.send('task', bare.id); await h.waitForTimeout(1400)
  const line = h.locator('p.is-editor-empty[data-placeholder^="Add a description"]').first()
  const gripShown = () => h.evaluate(() => {
    const grip = [...document.querySelectorAll('.tiptap-drag-handle')].find((one) => one.getClientRects().length)
    // What a person sees: a grip in sight, not see-through (it fades, so read once the fade is over).
    const look = grip && getComputedStyle(grip)
    return !!look && look.visibility !== 'hidden' && Number(look.opacity) > 0.5 && look.pointerEvents !== 'none'
  })
  const box = await line.boundingBox()
  await h.mouse.move(box.x + 30, box.y + box.height / 2); await h.waitForTimeout(150)
  await h.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 4 }); await h.waitForTimeout(400)
  const gripOnBare = await gripShown()
  await h.mouse.click(box.x + 60, box.y + box.height / 2, { button: 'right' }); await h.waitForTimeout(400)
  const blockMenu = await h.evaluate(() => [...document.querySelectorAll('[role="menu"]')].some((one) => /Turn into|Duplicate/.test(one.textContent ?? '')))
  await h.keyboard.press('Escape'); await h.waitForTimeout(200)
  await h.mouse.click(box.x + 60, box.y + box.height / 2); await h.keyboard.type('Passport'); await h.waitForTimeout(300)
  await h.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 4 }); await h.waitForTimeout(400)
  const gripOnWords = await gripShown()
  check('an empty description shows no block grip and opens no block menu; once written in, the grip is back', !gripOnBare && !blockMenu && gripOnWords, `grip on the empty line ${gripOnBare}, block menu ${blockMenu}, grip once written ${gripOnWords}`)
} finally {
  await c.close()
}
done()
