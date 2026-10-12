// A task inside a note, a linked to-do or a task link, has the task's own
// right-click menu and its priority mark, kept live; ticking still ticks it.
// Every list keeps the mark's room, so titles line up with or without one.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 [SHOT=<dir>] node qa/task-links.mjs
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
const CORE = ['Start a focus session', 'Mark it done', 'Do it today', 'Pick a date…', 'Priority', 'Open', 'Copy', 'Close without doing']
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
  }
  check('no errors anywhere', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 300))
} finally {
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
