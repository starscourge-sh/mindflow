// A task's subtasks are a list ready to write in (17 Nov item 37): an empty row at its end takes the first; ↵ makes it
// and the caret stays on a new row for the next; ↵ in a subtask opens a new row under it; ⇧↵ splits a subtask where the
// caret is; each row is drawn as Today's are, a round tick and the list's size. Driven with keys, as a person types.
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
    const rows = [...document.querySelectorAll('[data-subtasks] > li')].map((one) => Math.round(one.getBoundingClientRect().height))
    return { round: tick ? getComputedStyle(tick).borderRadius : '', size: tick ? Math.round(tick.getBoundingClientRect().width) : 0, rows }
  })
  check('item 37: rows drawn as Today\'s, a round tick and a row each', parseFloat(look.round) >= 8 && look.size >= 17 && look.rows.every((one) => one >= 34), JSON.stringify(look))
  if (shots) await c.both(`${shots}/subtasks`)
} finally {
  await c.close()
}
done()
