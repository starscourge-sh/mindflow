// "Hide until…" and "Get ready": a task or note hidden until a day, and a
// task with a due-by date that comes up on Today ahead of it.
//   1. a task's right-click menu hides it until tomorrow: out of Today and every list; ⌘Z brings it back;
//   2. "show again monday" in the words hides a new task; the day it comes back it is on Today, marked "Back today";
//   3. Everything's box shows what is hidden, each saying until when; unticked, they go again;
//   4. a hidden task closed goes to the Bin all the same, and comes back from it still hidden;
//   5. a note hidden until tomorrow is out of the list; on its day it is back, saying so;
//   6. "get ready 3 days before" with a due-by date two days off: on Today, "Get ready: due …", its steps listed;
//      one due in ten days is not; the menu changes the lead, ⌘Z puts it back; the details offer both.
// The day is moved by setting the day it comes back to today, as the clock reaching it would.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/snooze.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const key = (days = 0) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const said = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getDate()} ${'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ')[d.getMonth()]}` }
const ids = () => h.evaluate(() => [...new Set([...document.querySelectorAll('[data-row][data-id]')].filter((one) => one.getBoundingClientRect().height > 0).map((one) => one.dataset.id))])
const row = (id) => h.locator(`[data-row][data-id="${id}"]`).first()
const menu = () => h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
const listed = async (id) => (await v('tasks')).some((one) => one.id === id)
const task = (id) => v('task', id)
const undo = async () => { await h.keyboard.press('Escape'); await wait(200); await h.locator('body').click({ position: { x: 5, y: 400 } }).catch(() => {}); await h.keyboard.press('Meta+z'); await wait(1200) }

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true, showSnoozed: false })
  await v('onboarding:set', { pageHints: false })

  // 1. From the menu, until tomorrow, and back with ⌘Z.
  const a = (await v('task:add', 'Water the ferns', null, true)).id
  await go('today')
  check('A task added for today is on Today', (await ids()).includes(a))
  await row(a).click({ button: 'right', position: { x: 30, y: 10 } }); await wait(400)
  // Every way of giving it a day sits under its Date line, hiding it until a day too.
  await h.getByRole('menuitem', { name: /^Date/ }).first().hover(); await wait(500)
  check('Its menu offers “Hide until…”, under its Date', (await menu()).includes('Hide until…'), (await menu()).join(' | '))
  await h.getByRole('menuitem', { name: 'Hide until…' }).hover(); await wait(500)
  const sub = await menu()
  check('With Tomorrow, Next week, Next month and Pick a day…', ['Tomorrow', 'Next week', 'Next month', 'Pick a day…'].every((one) => sub.includes(one)), sub.join(' | '))
  await h.getByRole('menuitem', { name: 'Tomorrow', exact: true }).click(); await wait(1200)
  check('Hidden until tomorrow', (await task(a)).snoozedUntil === key(1), (await task(a)).snoozedUntil)
  check('Out of Today', !(await ids()).includes(a))
  check('Out of every list', !(await listed(a)))
  await undo()
  check('⌘Z shows it again', (await task(a)).snoozedUntil === null && (await listed(a)))
  await wait(600)
  check('Back on Today', (await ids()).includes(a))

  // 2. Said in the words; and the day it comes back.
  const b = (await v('task:add', 'Renew the passport show again monday')).id
  const bt = await task(b)
  check('“show again monday” hides a new task until a Monday', bt.snoozedUntil && new Date(`${bt.snoozedUntil}T12:00`).getDay() === 1 && bt.snoozedUntil > key(), bt.snoozedUntil)
  check('Its title keeps only its words', bt.title === 'Renew the passport', bt.title)
  check('Not in any list while hidden', !(await listed(b)))
  const u = (await v('task:add', 'Clean the gutters snooze until 3 nov')).id
  check('“snooze until 3 nov” is read too', /-11-03$/.test((await task(u)).snoozedUntil ?? ''), (await task(u)).snoozedUntil)
  await v('task:save', b, { snoozedUntil: key() }); await wait(1200)
  check('On its day it is on Today, with no date of its own', (await ids()).includes(b) && (await task(b)).dueAt === null)
  const mark = await row(b).locator('[data-came-back]').textContent().catch(() => '')
  check('Marked “Back today”', mark.includes('Back today'), mark)
  // One on a later list, with no day: back from hiding, it is on Today as the sidebar counts it.
  const l = (await v('task:add', 'Sort the loft boxes')).id
  await v('task:save', l, { plan: 'someday', snoozedUntil: key(4) }); await wait(800)
  await v('task:save', l, { snoozedUntil: key() }); await wait(1200)
  const sideCount = async () => Number(await h.evaluate(() => { const box = document.querySelector('[data-side-count="today"]'); const host = box && [box, ...box.querySelectorAll('*')].find((one) => one.shadowRoot); return (host?.shadowRoot.textContent ?? box?.innerText ?? '').replace(/\D/g, '') || '0' }))
  const onPage = async () => h.evaluate(() => new Set([...document.querySelectorAll('[data-row][data-id]')].map((one) => one.dataset.id)).size)
  check('A later-list task back today is on Today, marked “Back today”', (await ids()).includes(l) && (await row(l).locator('[data-came-back]').textContent().catch(() => '')).includes('Back today'))
  check('…and the sidebar counts what Today lists', await sideCount() === await onPage(), `${await sideCount()} counted, ${await onPage()} listed`)
  await v('task:save', l, { snoozedUntil: key(4) }); await wait(800)

  // 3. Everything's box.
  await v('task:save', b, { snoozedUntil: key(5) })
  await go('all'); await wait(600)
  check('Everything leaves the hidden task out', !(await ids()).includes(b))
  const chip = h.locator('[data-snoozed-chip] button')
  check('A box offers to show what is hidden', await chip.count() === 1, await chip.textContent().catch(() => ''))
  await chip.click(); await wait(1500)
  check('Ticked, the hidden task shows', (await ids()).includes(b) && (await listed(b)))
  await chip.click(); await wait(1500)
  check('Unticked, it goes again', !(await ids()).includes(b) && !(await listed(b)))

  // 4. The Bin.
  await v('task:save', b, { status: 'dropped' })
  check('Closed while hidden, it is in the Bin', (await v('tasks')).some((one) => one.id === b && one.status === 'dropped'))
  await v('task:save', b, { status: 'open' })
  check('Back from the Bin, still hidden', !(await listed(b)) && (await task(b)).snoozedUntil === key(5))

  // 5. A note.
  const note = await h.evaluate(() => window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'An idea for the garden shed' }] }] } }))
  const noteId = typeof note === 'string' ? note : note?.id
  const inList = async () => (await h.evaluate(() => window.api.captures.list())).some((one) => one.id === noteId)
  check('A new note is in the list', await inList())
  await v('capture:snooze', noteId, key(1)); await wait(500)
  check('Hidden until tomorrow, it is out of the list', !(await inList()))
  check('Counted as hidden', (await v('snoozed')).includes(noteId))
  await v('capture:snooze', noteId, key()); await wait(800)
  check('On its day it is back', await inList())
  await go('all'); await wait(800)
  const noteRow = await row(noteId).textContent().catch(() => '')
  check('Its row says “Back today”', noteRow.includes('Back today'), noteRow.slice(0, 120))

  // 6. Get ready.
  const d = (await v('task:add', `Hand in the report by ${said(2)} get ready 3 days before`)).id
  await v('task:save', d, { subtasks: [{ text: 'Check the figures', done: false }, { text: 'Print two copies', done: false }] })
  const far = (await v('task:add', `Book the hall by ${said(10)} get ready 3 days before`)).id
  check('“get ready 3 days before” is read', (await task(d)).getReady === 3 && (await task(d)).deadline)
  await go('today'); await wait(800)
  check('Two days before it is due, it is on Today', (await ids()).includes(d))
  const ready = await row(d).locator('[data-get-ready]').textContent().catch(() => '')
  check('Saying “Get ready: due …”', ready.startsWith('Get ready: due'), ready)
  const steps = await h.locator(`li:has-text("Check the figures")`).count()
  check('With its steps listed', steps > 0)
  check('Ten days before, it is not on Today', !(await ids()).includes(far))
  await row(d).click({ button: 'right', position: { x: 30, y: 10 } }); await wait(400)
  check('Its menu says the lead', (await menu()).includes('Get ready 3 days before'), (await menu()).join(' | '))
  await h.getByRole('menuitem', { name: 'Get ready 3 days before' }).hover(); await wait(500)
  await h.getByRole('menuitem', { name: '1 week before' }).click(); await wait(1000)
  check('Changed to a week', (await task(d)).getReady === 7)
  await undo()
  check('⌘Z puts back three days', (await task(d)).getReady === 3)

  // The details offer both.
  await row(d).click(); await wait(1200)
  const pane = await h.evaluate(() => document.body.innerText)
  check('The details have “Hide until”', pane.includes('Hide until'))
  check('And the get-ready leads', pane.includes('Get ready before it') && (await h.locator('[data-get-ready-leads] button').count()) === 4)
  check('No errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('Ran to the end', false, String(error).slice(0, 300))
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
