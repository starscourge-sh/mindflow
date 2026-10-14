// Everything (G L, once All captures): every note and every task in one list,
// with a filter over it to choose what shows. Checks:
//   1. the sidebar and the page say “Everything”, shown after Inbox; tasks and notes are both in the list;
//   2. the kind chips pick several at once: Task alone shows only tasks, grouped Overdue / Today /
//      Upcoming / No date; Task and Note together, both; the filter is remembered after a reload;
//   3. “To do / Done / Both” for tasks: Done shows only done tasks, with its own empty page when none;
//   4. a task opens in the same pane Upcoming uses; its right-click is the task's own menu;
//   5. the gestures: the tick and E mark one done; ⌘-click and ⇧-click pick; ⌫ moves the picked to
//      the Bin and says so; ⌘Z brings them back; Esc lets the selection go; ⌘A picks all on show.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/everything.mjs
// SHOTS=dir keeps a picture of each step.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shoot = async (name) => SHOTS && (await h.screenshot({ path: `${SHOTS}/${name}.png` }))
const P = '[data-page="all"]'

// What the page shows: its rows, which of them are tasks, its group names, the pane, the notice.
const read = () => h.evaluate((P) => {
  const page = document.querySelector(P)
  if (!page) return null
  const rows = [...page.querySelectorAll('[data-row][data-id]')].filter((one) => one.getBoundingClientRect().height > 0 && !one.closest('[data-example]'))
  const ids = [...new Set(rows.map((one) => one.dataset.id))]
  const ticks = new Set(rows.filter((one) => one.parentElement?.querySelector(':scope > span [data-task-tick]')).map((one) => one.dataset.id))
  return {
    ids,
    tasks: ids.filter((id) => ticks.has(id)),
    heads: [...page.querySelectorAll('.text-xs.text-muted-foreground')].map((one) => one.textContent.trim().replace(/\s*\d+$/, '')).filter((one) => /^(Overdue|Today|Upcoming|Later|No date|Done)$/.test(one)),
    title: [...document.querySelectorAll('header')].map((one) => one.innerText.replace(/\s+/g, ' ')).join(' | '),
    pane: document.querySelector(`${P} .note-pane, .note-pane`)?.dataset.open ?? null,
    // The page's count, “141 items”, as Rolling draws it a digit at a time.
    count: Number((/(\d+)items/.exec([...document.querySelectorAll('header')].map((one) => one.innerText.replace(/\s+/g, '')).join('|')) ?? [])[1] ?? -1),
    picked: rows.filter((one) => one.dataset.picked !== undefined).length,
    text: page.innerText.replace(/\s+/g, ' '),
    toast: [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ')
  }
}, P)
// The kind chips by their words; To do, Done and Both by their names (their letters roll).
const chip = (label) => (['To do', 'Done', 'Both'].includes(label)
  ? h.locator(`${P} [data-task-state] button[aria-label="${label}"]`)
  : h.locator(`${P} [data-everything-filter] button[aria-pressed]`, { hasText: new RegExp(`^${label}$`) })).first()
const pressed = (label) => chip(label).getAttribute('aria-pressed').then((one) => one === 'true').catch(() => false)
const set = async (label, on) => { if ((await pressed(label)) !== on) { await chip(label).click(); await wait(500) } }
const row = (id) => h.locator(`${P} [data-row][data-id="${id}"]`).first()
const menu = () => h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
const until = async (test, ms = 4000) => { const t0 = Date.now(); let s; do { await wait(250); s = await read() } while (!test(s) && Date.now() - t0 < ms); return s }

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  await v('onboarding:set', { pageHints: false })
  // A task for each group: late, today, ahead and with no date.
  const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
  for (const [words, due] of [['Return the library books', day(-2)], ['Water the plants', day(0)], ['Book the dentist', day(4)], ['Learn three chords', null]]) {
    const made = await v('task:add', words)
    if (due) await v('task:save', made.id, { due })
  }
  await h.reload(); await wait(2500)

  // 1. Its name, where it sits, and what it holds.
  // The sidebar as a new install has it (the sandbox keeps its own choice): Everything shown after Inbox.
  const was = (await v('settings')).sidebarShown
  await v('settings:set', { sidebarShown: ['inbox', 'all', 'review'] }); await wait(800)
  const side = await h.evaluate(() => [...document.querySelectorAll('aside nav')].map((one) => one.innerText).join('\n'))
  check('the sidebar says “Everything”, after Inbox, and no “All captures”', /Inbox\s+(\d+\s+)?Everything/.test(side) && !/All captures/.test(side), side.split('\n').slice(0, 6).join(', '))
  await v('settings:set', { sidebarShown: was })
  await go('all'); await wait(800)
  // A fresh start: every kind on show, tasks to do.
  for (const label of ['Task', 'Note', 'Quote', 'Link', 'Word', 'Todo']) await set(label, false)
  await set('To do', true)
  let s = await read()
  check('the page is called Everything', /Everything/.test(s?.title ?? ''), s?.title)
  const open = (await v('tasks')).filter((one) => one.status === 'open')
  const caps = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status !== 'discarded' && !one.archivedAt)
  check('tasks and notes are in the one list', s.tasks.length > 0 && s.count === open.length + caps.length, `${s.count} on show = ${open.length} open tasks + ${caps.length} notes`)
  check('every open task is in it', open.every((one) => s.ids.includes(one.id)), `${open.filter((one) => !s.ids.includes(one.id)).length} missing`)
  await shoot('1-everything')

  // 2. The kind chips.
  await set('Task', true)
  s = await read()
  check('“Task” alone shows only tasks', s.ids.length > 0 && s.ids.length === s.tasks.length, `${s.tasks.length}/${s.ids.length}`)
  check('tasks alone are grouped as Today and Upcoming group them', ['Overdue', 'Today', 'Upcoming', 'No date'].every((one) => s.heads.includes(one)), s.heads.join(', '))
  await shoot('2-tasks')
  await set('Note', true)
  s = await read()
  const notes = caps.filter((one) => one.kind === 'note').length
  check('“Task” and “Note” together show both', notes > 0 && s.count === open.length + notes, `${s.count} on show = ${open.length} tasks + ${notes} notes`)
  await shoot('3-tasks-notes')
  await h.reload(); await wait(2200); await go('all'); await wait(800)
  check('the chosen kinds are remembered', (await pressed('Task')) && (await pressed('Note')))
  await set('Note', false)

  // 3. To do, done, both.
  await set('Done', true)
  s = await read()
  const doneNow = (await v('tasks')).filter((one) => one.status === 'done')
  check('“Done” shows only done tasks', doneNow.length ? s.ids.every((id) => doneNow.some((one) => one.id === id)) : /Nothing done yet/.test(s.text), doneNow.length ? `${s.ids.length} rows, ${doneNow.length} done` : 'empty page')
  // Every done task out of the way for a moment: the empty page of this filter.
  for (const one of doneNow) await v('task:save', one.id, { status: 'dropped' })
  await wait(800)
  s = await read()
  check('no done tasks: the page says so, and how they get here', /Nothing done yet/.test(s.text), s.text.slice(0, 160))
  await shoot('4-done-empty')
  for (const one of doneNow) await v('task:save', one.id, { status: 'done' })
  await set('To do', true)

  // 4. Open one, and its menu.
  s = await read()
  const first = s.tasks[0]
  await row(first).click({ position: { x: 80, y: 10 } }); await wait(900)
  s = await read()
  check('a task opens in the pane beside the list', s.pane === first, `${s.pane} / ${first}`)
  await shoot('5-open')
  // A to-do with a tag, opened and pinned: the sidebar names it without the raw #tag, as task lists do.
  const tagged = await h.evaluate(() => window.api.captures.create({ body: 'Pick up the stamps #errands', kind: 'todo' }))
  const pinnedOne = await h.evaluate(() => window.api.captures.create({ body: 'Post the parcel #errands', kind: 'todo' }))
  await v('pin', 'captures', pinnedOne, true)
  await c.send('capture', tagged); await wait(1800)
  const side2 = await h.evaluate((ids) => [...document.querySelectorAll('aside [data-drag-open]')].filter((one) => ids.some((id) => one.dataset.dragOpen === `capture:${id}`)).map((one) => one.innerText.trim()), [tagged, pinnedOne])
  check('“Pinned” and “Opened today” show the words without the #tag', side2.length === 2 && side2.every((one) => /stamps|parcel/.test(one) && !/#errands/.test(one)), JSON.stringify(side2))
  await shoot('5b-sidebar')
  await go('all'); await wait(800)
  await h.keyboard.press('Escape'); await wait(300)
  await row(first).click({ button: 'right', position: { x: 80, y: 10 } }); await wait(500)
  const lines = await menu()
  check('right-click is the task\'s own menu', ['Mark it done', 'Do it tomorrow', 'Close without doing: to the Bin'].every((one) => lines.some((line) => line.startsWith(one))), lines.join(' / '))
  await h.keyboard.press('Escape'); await wait(300)

  // 5. Gestures. The tick.
  s = await read()
  const ticked = s.tasks.at(-1)
  await h.locator(`${P} [data-row][data-id="${ticked}"]`).locator('xpath=..').locator('[data-task-tick]').click(); await wait(300)
  s = await until((now) => !now.ids.includes(ticked))
  check('the tick marks it done and it leaves To do', !s.ids.includes(ticked) && (await v('task', ticked))?.status === 'done', s.toast)
  await h.keyboard.press('Meta+z'); await wait(1000)
  s = await until((now) => now.ids.includes(ticked))
  check('⌘Z puts it back', s.ids.includes(ticked))
  // E on the row under the cursor.
  await row(s.tasks[0]).click({ position: { x: 80, y: 10 } }); await wait(500)
  await h.evaluate(() => document.activeElement?.blur?.())
  const eTask = s.tasks[0]
  await h.keyboard.press('e'); await wait(300)
  s = await until((now) => !now.ids.includes(eTask))
  check('E marks the task under the cursor done', (await v('task', eTask))?.status === 'done')
  await h.keyboard.press('Meta+z'); await wait(1000)
  s = await until((now) => now.ids.includes(eTask))
  await h.keyboard.press('Escape'); await wait(300)
  // ⌘-click and ⇧-click.
  const [a, b, d] = s.tasks
  await row(a).click({ modifiers: ['Meta'], position: { x: 80, y: 10 } }); await wait(250)
  await row(d).click({ modifiers: ['Shift'], position: { x: 80, y: 10 } }); await wait(350)
  s = await read()
  check('⌘-click then ⇧-click picks the run between', s.picked >= 3, `${s.picked} picked`)
  await row(a).click({ button: 'right', position: { x: 80, y: 10 } }); await wait(500)
  const many = await menu()
  check('right-click on the picked: done together, and to the Bin', many.some((one) => /^Mark \d+ tasks done/.test(one)) && many.some((one) => /^Move \d+ to the Bin/.test(one)), many.join(' / '))
  await h.keyboard.press('Escape'); await wait(300)
  await shoot('6-picked')
  await h.keyboard.press('Backspace')
  s = await until((now) => !now.ids.includes(a))
  const gone = [a, b, d].filter((id) => !s.ids.includes(id)).length
  check('⌫ moves the picked to the Bin and says so', gone === 3 && /to the Bin/.test(s.toast), `${gone} gone; “${s.toast}”`)
  check('in the Bin, they are tasks closed without doing', (await v('task', a))?.status === 'dropped')
  await h.keyboard.press('Meta+z'); await wait(1200)
  s = await until((now) => now.ids.includes(a))
  check('⌘Z brings them back', [a, b, d].every((id) => s.ids.includes(id)))
  // ⌘A, Esc.
  await row(a).click({ position: { x: 80, y: 10 } }); await wait(400)
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Escape'); await wait(300)
  await h.keyboard.press('Meta+a'); await wait(450)
  s = await read()
  check('⌘A picks every row on show', s.picked === s.ids.length && s.picked > 0, `${s.picked}/${s.ids.length}`)
  await h.keyboard.press('Escape'); await wait(350)
  s = await read()
  check('Esc lets them go', s.picked === 0)
  await set('Task', false)
  await shoot('7-end')
  if (c.errors.length) console.log(c.errors.slice(0, 5).join('\n'))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
