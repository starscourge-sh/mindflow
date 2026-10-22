// A task inside a note, a linked to-do or a task link, has the task's own
// right-click menu and its priority mark, kept live; ticking still ticks it.
// Every list keeps the mark's room, so titles line up with or without one.
// "Pick a date…" from the desktop sticky opens the main window on the task,
// its calendar up. A line on Today's written page has the task's menu, with
// Cut, Copy and Paste after it; a step and a line being written have their
// own few lines and the same three. Shots in Paper and in a dark theme.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/task-links.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, go, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const lines = () => h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
const shut = async () => { await h.keyboard.press('Escape'); await wait(250) }
// Every date line sits in one "Date" submenu.
const CORE = ['Start a focus session', 'Mark it done', 'Date', 'Priority', 'Open', 'Copy', 'Move to the Bin']
const hasCore = (menu) => CORE.every((label) => menu.some((one) => one.startsWith(label)))
const shoot = async (name) => SHOT && h.screenshot({ path: `${SHOT}/${name}.png` })

try {
  await v('settings:set', { sounds: true, hintRate: 0, countIn: false })
  const a = (await v('task:add', 'Fold the camping chairs', undefined, false)).id
  const b = (await v('task:add', 'Confirm the hotel booking', undefined, false)).id
  const link = (await v('task:add', 'Pack the head torch', undefined, false)).id
  const note = await h.evaluate(([a, b, link]) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Camping: before Friday' }] },
    { type: 'taskList', content: [a, b].map((id, n) => ({ type: 'taskItem', attrs: { checked: false, taskId: id }, content: [{ type: 'paragraph', content: [{ type: 'text', text: n ? 'Confirm the hotel booking' : 'Fold the camping chairs' }] }] })) },
    { type: 'paragraph', content: [{ type: 'text', text: 'And remember ' }, { type: 'noteLink', attrs: { id: `task:${link}`, label: 'Pack the head torch', kind: 'task' } }, { type: 'text', text: ' too.' }] }
  ] } }), [a, b, link])
  await send('capture', note)
  await wait(1800)
  const lineOf = (id) => h.locator(`.tiptap.ProseMirror li[data-task-id="${id}"] > div p`).first()
  check('the note shows its linked to-dos', (await lineOf(a).count()) === 1 && (await lineOf(b).count()) === 1)
  check('no priority, no mark', (await h.locator('.tiptap-task-priority').count()) === 0)

  // Right-click a linked to-do: the task's menu, not the line's.
  await lineOf(a).click({ button: 'right' }); await wait(600)
  const menu = await lines()
  check('right-click a linked to-do: the task menu', hasCore(menu), menu.join(' / '))
  await shoot('1-linked-menu')
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Priority' }).first().hover(); await wait(500)
  await h.locator('[role=menu] [role=menuitem]', { hasText: /^High/ }).last().click(); await wait(1200)
  check('Priority › High from the note sets it on the task', (await v('task', a))?.priority === 2)
  check('and the mark shows on that line', (await h.locator(`li[data-task-id="${a}"] .tiptap-task-priority[data-task-priority="2"]`).count()) === 1)
  check('only on that line', (await h.locator('.tiptap-task-priority').count()) === 1)
  await shoot('2-mark-high')

  // Set elsewhere: the note follows, as it happens.
  await v('task:save', b, { priority: 1 }); await wait(1200)
  check('a priority set elsewhere shows in the open note', (await h.locator(`li[data-task-id="${b}"] .tiptap-task-priority[data-task-priority="1"]`).count()) === 1)
  await v('task:save', a, { priority: 0 }); await wait(1200)
  check('and cleared elsewhere, it goes', (await h.locator(`li[data-task-id="${a}"] .tiptap-task-priority`).count()) === 0)

  // A task link: the same menu, and its mark just after it.
  const linkAt = h.locator(`.tiptap.ProseMirror a[data-note="task:${link}"]`).first()
  await linkAt.click({ button: 'right' }); await wait(600)
  const linkMenu = await lines()
  check('a right click does not follow the link', (await linkAt.count()) === 1)
  check('right-click a task link: the task menu', hasCore(linkMenu), linkMenu.join(' / '))
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Priority' }).first().hover(); await wait(500)
  await h.locator('[role=menu] [role=menuitem]', { hasText: /^Medium/ }).last().click(); await wait(1200)
  check('Priority › Medium from a task link sets it', (await v('task', link))?.priority === 3)
  check('and its mark sits just after the link', await h.evaluate((id) => document.querySelector(`a[data-note="task:${id}"]`)?.nextElementSibling?.matches('.tiptap-task-priority[data-task-priority="3"]') ?? false, link))
  await shoot('3-link-mark')
  const oneLine = await h.evaluate((id) => { const p = document.querySelector(`li[data-task-id="${id}"] > div p`); const r = p?.getBoundingClientRect(); return r ? Math.round(r.height) : 0 }, b)
  check('a marked to-do stays on one line, its link mark beside it', oneLine > 0 && oneLine < 40, `${oneLine}px`)

  // A plain line still has the block menu.
  await h.locator('.tiptap.ProseMirror > p').first().click({ button: 'right' }); await wait(600)
  const plain = await lines()
  check('a plain line keeps its own menu', !plain.some((one) => one.startsWith('Mark it done')), plain.slice(0, 4).join(' / '))
  await shut()

  // Ticking stays as it was.
  await h.locator(`li[data-task-id="${b}"] input[type=checkbox]`).first().click(); await wait(1200)
  check('ticking a linked to-do still finishes its task', (await v('task', b))?.status === 'done')
  // Marked done from the menu, the line ticks.
  await lineOf(a).click({ button: 'right' }); await wait(600)
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Mark it done' }).first().click(); await wait(1500)
  check('Mark it done from the note ticks the line', (await h.locator(`li[data-task-id="${a}"][data-checked="true"]`).count()) === 1)
  check('no errors in the note', !c.errors.length, c.errors.slice(0, 2).join(' | '))

  // --- Titles line up, with a mark or without
  const t1 = (await v('task:add', 'Charge the lantern today', undefined, true)).id
  const t2 = (await v('task:add', 'Buy matches today', undefined, true)).id
  await v('task:save', t1, { priority: 2 })
  const left = (sel) => h.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? Math.round(r.left * 10) / 10 : null }, sel)
  const aligned = async (name, one, two) => {
    const [x, y] = [await left(one), await left(two)]
    check(`${name}: titles line up with and without a mark`, x !== null && x === y, `${x} / ${y}`)
  }
  await go('today'); await wait(800)
  await aligned('Tasks, Today', `[data-row][data-id="${t1}"] span.truncate`, `[data-row][data-id="${t2}"] span.truncate`)
  await shoot('4-today-aligned')
  await go('home'); await wait(900)
  const home = await h.evaluate(() => [...document.querySelectorAll('[data-drag-open^="task:"]')].map((row) => ({ mark: !!row.querySelector('[data-priority]'), x: Math.round(row.querySelector('.line-clamp-2')?.getBoundingClientRect().left ?? -1) })))
  check('Home, Next up: titles line up with and without a mark', home.some((one) => one.mark) && home.some((one) => !one.mark) && new Set(home.map((one) => one.x)).size === 1, JSON.stringify(home))
  await go('matrix'); await wait(800)
  const card = (title) => h.evaluate((t) => { const b = [...document.querySelectorAll('button')].find((one) => one.textContent.includes(t)); const r = b?.querySelector('.line-clamp-2')?.getBoundingClientRect(); const o = b?.getBoundingClientRect(); return r && o ? Math.round((r.left - o.left) * 10) / 10 : null }, title)
  const [m1, m2] = [await card('Charge the lantern'), await card('Buy matches')]
  check('Matrix: titles line up with and without a mark', m1 !== null && m1 === m2, `${m1} / ${m2}`)
  await go('upcoming'); await wait(800)
  const [u1, u2] = [await left(`[data-row][data-id="${t1}"] span.truncate`), await left(`[data-row][data-id="${t2}"] span.truncate`)]
  if (u1 !== null && u2 !== null) check('Upcoming: titles line up with and without a mark', u1 === u2, `${u1} / ${u2}`)
  // The desktop sticky: its tasks have the same menu, their titles in line too.
  await h.evaluate(() => window.api.stick('today', 'today', true))
  let sticky
  for (let i = 0; i < 40 && !(sticky = c.electron.windows().find((w) => w.url().includes('type=today'))); i++) await wait(200)
  if (!sticky) check('the Today sticky opens', false)
  else {
    await sticky.waitForSelector(`[data-sticky-task="${t1}"]`, { timeout: 8000 }).catch(() => {})
    await wait(600)
    check('Sticky: opens with a marked task on it, no crash', !/ran into a problem/.test(await sticky.evaluate(() => document.body.innerText)))
    const xs = await sticky.evaluate(([a, b]) => [a, b].map((id) => Math.round(document.querySelector(`[data-sticky-task="${id}"]`)?.getBoundingClientRect().left ?? -1)), [t1, t2])
    check('Sticky: titles line up with and without a mark', xs[0] > 0 && xs[0] === xs[1], xs.join(' / '))
    // Too small for our menu, the sticky has the Mac draw it: stood in for here, picking Priority › Low.
    await c.electron.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('sticky:menu')
      ipcMain.handle('sticky:menu', (_event, items) => {
        globalThis.__menu = items
        const at = items.findIndex((one) => one.label === 'Priority')
        return at < 0 ? null : [at, items[at].submenu.findIndex((one) => one.label === 'Low')]
      })
    })
    const logs = []; sticky.on('pageerror', (e) => logs.push(String(e)))
    await sticky.locator(`[data-sticky-task="${t2}"]`).click({ button: 'right' }); await wait(900)
    const stickyMenu = (await c.electron.evaluate(() => globalThis.__menu ?? [])).map((one) => one.label ?? '')
    check('Sticky: right-click a task, the task menu', hasCore(stickyMenu), stickyMenu.filter(Boolean).join(' / '))
    check('Sticky: Priority › Low from it sets the task', (await v('task', t2))?.priority === 4)
    check('Sticky: no errors', !logs.length, logs.join(' | '))
    // "Pick a date…" from the sticky: the main window, the task, its calendar up.
    await go('home'); await wait(500)
    await c.electron.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('sticky:menu')
      ipcMain.handle('sticky:menu', (_event, items) => { const at = items.findIndex((one) => /^Date/.test(one.label ?? '')); return [at, items[at].submenu.findIndex((one) => one.label === 'Pick a date…')] })
    })
    await sticky.locator(`[data-sticky-task="${t2}"]`).click({ button: 'right' }); await wait(2200)
    const grids = await h.locator('[role=grid]').count()
    check('Sticky: Pick a date… opens the main window on the task, its calendar up', grids > 0 && await h.evaluate(() => [...document.querySelectorAll('textarea, input')].some((one) => /Buy matches/.test(one.value)) || /Buy matches/.test(document.body.innerText)), `calendars ${grids}`)
    await shut(); await shut()
  }
  // A note's window: the same, through the main window.
  await h.evaluate((id) => window.api.openInHome('task-date', id), t1); await wait(1800)
  check('task-date sent from any window opens the task with its calendar up', (await h.locator('[role=grid]').count()) > 0)
  await shut(); await shut()

  // --- Today's written page: a line is its task
  await v('task:save', t1, { subtasks: [{ text: 'Find the charger', done: false }] })
  await go('home'); await send('write', 'today'); await wait(1500)
  const lineField = h.locator(`[data-day-line="${t1}"] textarea:visible`).first()
  check('the written page shows the task as a line', (await lineField.count()) === 1)
  await lineField.click({ button: 'right' }); await wait(600)
  let dayMenu = await lines()
  check('right-click a written line: the task menu', hasCore(dayMenu), dayMenu.join(' / '))
  check('nothing picked: Paste at the end, no Cut or Copy', dayMenu.at(-1) === 'Paste⌘V' && !dayMenu.includes('Cut⌘X') && !dayMenu.includes('Copy⌘C'), dayMenu.slice(-3).join(' / '))
  await shut()
  check('the menu shut, the caret is back in the line', await h.evaluate(() => document.activeElement?.closest('[data-day-line]') !== null))
  // Words picked: Cut, Copy, Paste, last, and Copy copies them.
  await lineField.evaluate((el) => { el.focus(); el.setSelectionRange(0, 6) })
  await lineField.click({ button: 'right', position: { x: 10, y: 8 } }); await wait(600)
  dayMenu = await lines()
  check('words picked: Cut, Copy and Paste end the menu', dayMenu.slice(-3).join('|') === 'Cut⌘X|Copy⌘C|Paste⌘V', dayMenu.slice(-4).join(' / '))
  await shoot('5-day-line-menu')
  const before = await lineField.evaluate((el) => [el.selectionStart, el.selectionEnd])
  await h.locator('[role=menu] [role=menuitem]', { hasText: /^Copy⌘C$/ }).first().click(); await wait(700)
  const copied = await c.electron.evaluate(({ clipboard }) => clipboard.readText())
  check('Copy puts the picked words on the clipboard', copied === 'Charge'.slice(0, before[1] - before[0]) || copied.length === before[1] - before[0], `${JSON.stringify(copied)} ${before}`)
  // Paste into the new line: words in, then made a task from the menu.
  await c.electron.evaluate(({ clipboard }) => clipboard.writeText('Pack the tent pegs'))
  const fresh = h.locator('[data-day-section="now"] textarea[data-new]:visible').first()
  await fresh.click(); await fresh.click({ button: 'right' }); await wait(600)
  const freshMenu = await lines()
  check('an empty new line: only Paste', freshMenu.join('|') === 'Paste⌘V', freshMenu.join(' / '))
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Paste' }).first().click(); await wait(700)
  check('Paste puts the words in the line', (await fresh.inputValue()) === 'Pack the tent pegs', await fresh.inputValue())
  const tasksBefore = (await v('tasks')).length
  await fresh.click({ button: 'right' }); await wait(600)
  const withWords = await lines()
  check('right-clicked, the words wait in the line (not made a task by the menu opening)', (await fresh.inputValue()) === 'Pack the tent pegs' && (await v('tasks')).length === tasksBefore)
  check('a new line with words: Make it a task, then the edit lines', withWords[0]?.startsWith('Make it a task') && withWords.includes('Paste⌘V'), withWords.join(' / '))
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Make it a task' }).first().click(); await wait(1200)
  check('Make it a task makes it a line', (await v('tasks')).some((one) => one.title === 'Pack the tent pegs' && one.status === 'open'))
  // A step: its own lines.
  const step = h.locator(`[data-day-step="${t1}:0"] textarea:visible`).first()
  await step.click({ button: 'right' }); await wait(600)
  const stepMenu = await lines()
  check('right-click a step: tick, make it a task, take it out, Paste', ['Mark it done', 'Make it a task', 'Take the step out', 'Paste'].every((label) => stepMenu.some((one) => one.startsWith(label))), stepMenu.join(' / '))
  await shoot('6-day-step-menu')
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Make it a task' }).first().click(); await wait(1500)
  check('Make it a task of its own: a line of its own now', (await v('tasks')).some((one) => one.title === 'Find the charger' && one.status === 'open') && !((await v('task', t1))?.subtasks ?? []).length)
  // Pick a date… from a written line: the calendar, beside the page.
  await lineField.click({ button: 'right' }); await wait(600)
  await h.locator('[role=menu] [role=menuitem]', { hasText: /^Date/ }).first().hover(); await wait(500)
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Pick a date…' }).last().click(); await wait(1500)
  check('Pick a date… from a written line opens its calendar', (await h.locator('[role=grid]').count()) > 0)
  await shoot('7-day-line-date')
  await shut(); await shut()
  // The priority mark at the line's end, out of the words' way.
  const mark = await h.evaluate((id) => !!document.querySelector(`[data-day-line="${id}"] [data-priority="2"]`), t1)
  check('a written line shows its priority mark', mark)

  // --- The same in a dark theme: menus, marks and titles in line
  if (SHOT) {
    await c.theme('dark')
    await send('write', 'today'); await wait(1500)
    await h.mouse.move(5, 5)
    await shoot('dark-1-day-page')
    await h.locator(`[data-day-line="${t1}"] textarea:visible`).first().click({ button: 'right' }); await wait(600)
    await shoot('dark-2-day-line-menu')
    await h.locator('[role=menu] [role=menuitem]', { hasText: 'Priority' }).first().hover(); await wait(500)
    await shoot('dark-3-priority-sub')
    await shut(); await shut()
    await go('today'); await h.evaluate(() => { const k = 'view:tasks:today'; const v = JSON.parse(localStorage.getItem(k) ?? '{}'); localStorage.setItem(k, JSON.stringify({ ...v, group: 'none' })) })
    await c.theme('dark'); await go('today'); await wait(800)
    await shoot('dark-4-today-aligned')
    await h.locator(`[data-row][data-id="${t1}"]`).first().click({ button: 'right' }); await wait(600)
    await shoot('dark-5-today-menu')
    await shut()
    await go('home'); await wait(900); await shoot('dark-6-home')
    await go('matrix'); await wait(900); await shoot('dark-7-matrix')
    await send('capture', note); await wait(1800)
    await lineOf(b).click({ button: 'right' }); await wait(600)
    await shoot('dark-8-note-menu')
    await shut()
  }
  check('no errors anywhere', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 1500))
} finally {
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
