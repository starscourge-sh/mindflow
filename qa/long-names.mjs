// Long names made short (main/long-names.ts), with the Mac's model stood in (HALIGTREE_QA_CAPS=ai):
// 1. "Name long notes for me" on, a task added with a long name is named short; its long words open its description.
// 2. Settings › Writing › "Rename the long ones I have…": the list shows each long one with its short name; "Rename"
//    renames them, a note keeping its long first line under the short title and as another name; the notice's Undo
//    puts every one back. Real pointer only for the Settings journey.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/long-names.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

process.env.HALIGTREE_QA_CAPS = 'ai'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const cap = (name, ...args) => h.evaluate(([n, a]) => window.api.captures[n](...a), [name, args])
const LONG_TASK = 'send shaun loom on a.i assisted jackhammer experience'
const LONG_NOTE = 'Go: Code a database in 45 steps: a series of test-driven small coding puzzles #project'
try {
  // 1. Made with the setting on.
  await v('settings:set', { nameLong: true })
  const made = await v('task:add', LONG_TASK)
  await wait(1500)
  const task = await v('task', made.id)
  check('a task made with a long name is named short', !!task && task.title !== LONG_TASK && task.title.split(' ').length <= 7, task?.title)
  check('and its long words open its description', JSON.stringify(task?.notes ?? '').includes(LONG_TASK), JSON.stringify(task?.notes)?.slice(0, 160))
  await v('settings:set', { nameLong: false })

  // 2. The ones already kept, from Settings.
  const note = await cap('create', { kind: 'note', body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: LONG_NOTE }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Each step a failing test to make pass.' }] }] } })
  const other = await v('task:add', 'call the bank about the overdraft fee on the joint account and ask about the card')
  const otherName = (await v('task', other.id)).title
  await go('settings')
  await h.locator('[data-section="Writing"]').first().click(); await wait(500)
  const look = h.locator('[data-long-names] [data-rename-look]')
  await look.scrollIntoViewIfNeeded()
  check('Settings › Writing offers "Rename the long ones I have…"', (await look.count()) === 1)
  await look.click()
  await h.locator('[data-long-names] [data-rename-apply]').waitFor({ timeout: 20000 })
  const rows = await h.locator('[data-long-name]').count()
  check('the long ones are listed, each with its short name', rows >= 2 && (await h.locator(`[data-long-name="${note}"]`).count()) === 1, `${rows} rows`)
  const shown = await h.locator(`[data-long-name="${note}"] input`).inputValue()
  check('the note\'s short name is in its own field, to change', shown.length > 0 && shown.length < LONG_NOTE.length, shown)
  await h.locator(`[data-long-name="${note}"] input`).fill('Build a database in Go')
  await h.locator('[data-long-names] [data-rename-apply]').click(); await wait(900)
  const row = await cap('get', note)
  const body = JSON.stringify(row?.body ?? '')
  check('the note is named as typed', body.includes('"text":"Build a database in Go"'), body.slice(0, 200))
  // Its #project went to a line of its own as it was made (tags-off-name.ts, 19 Nov): the rest of the line stays.
  check('its long first line stays, under it', body.includes(LONG_NOTE.replace(' #project', '')), body.slice(0, 300))
  check('and is listed by its short name', row?.label === 'Build a database in Go', row?.label)
  const renamedTask = (await v('tasks')).find((one) => one.id === other.id)
  check('a long task is renamed too', renamedTask && renamedTask.title !== otherName, renamedTask?.title)
  const toast = h.locator('[role="status"]', { hasText: 'Renamed' })
  check('one notice says so', (await toast.count()) === 1, await toast.first().textContent().catch(() => ''))
  await toast.locator('button', { hasText: 'Undo' }).click(); await wait(900)
  const back = await cap('get', note)
  check('Undo puts the note back as it was', !JSON.stringify(back?.body ?? '').includes('Build a database in Go'), JSON.stringify(back?.body ?? '').slice(0, 160))
  const backTask = (await v('tasks')).find((one) => one.id === other.id)
  check('and the task', backTask?.title === otherName, backTask?.title)
} finally {
  await close()
}
done()
