// The window's button pills and the sidebar's headings, measured in Paper,
// Dark and Brutal. Quick capture's pill (new, actions, panel): three segments
// the same size within 1px, each inside the pill's border (lit inside it,
// never up to it), the pill on the window dots' centre line and at least 6px
// clear of the window's top; the main window's Back and Forward pill the same.
// The sidebar's headings (Tasks, Saved, Types, Tags) light as one row, with
// the rows' left, right and corners; the Tags chevron has no ring under the
// pointer, only a ring from the keyboard. Then the keys: ⌘A in the Queue
// goes to the list the pointer is over (Read too), and in the Recent panel
// with the pointer over it, with the focus elsewhere.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/chrome-fix.mjs
// SHOTS=dir keeps pictures.
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 800 })
const { h, page: box, v, go } = c

/** A pill's segments: each one's box, and the pill's. */
const segsOf = (w, sel) => w.evaluate((sel) => {
  const pill = document.querySelector(sel)
  if (!pill) return null
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }
  const lit = (child) => (child.matches('button') ? child : child.querySelector('button'))
  const style = getComputedStyle(pill)
  return { pill: r(pill), border: parseFloat(style.borderTopWidth), segs: [...pill.children].map((one) => r(lit(one))) }
}, sel)

async function pills(theme, style) {
  await h.evaluate((s) => localStorage.setItem('style', s), style)
  await c.theme(theme)
  await box.reload(); await box.waitForTimeout(1200)
  await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(600)
  await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view='))?.webContents.send('window:pointer', true))
  await box.waitForTimeout(400)
  const name = `${theme}${style === 'brutal' ? '-brutal' : ''}`
  const at = await segsOf(box, '.mf-pill')
  const dots = await box.evaluate(() => { const b = document.querySelector('.mf-dots').getBoundingClientRect(); return { y: b.y, h: b.height } })
  const widths = at.segs.map((one) => Math.round(one.w * 10) / 10)
  const heights = at.segs.map((one) => Math.round(one.h * 10) / 10)
  check(`${name}: quick capture's three segments are the same size`, at.segs.length === 3 && Math.max(...widths) - Math.min(...widths) <= 1 && Math.max(...heights) - Math.min(...heights) <= 1, `widths ${widths.join(', ')}; heights ${heights.join(', ')}`)
  const inner = { top: at.pill.y + at.border, bottom: at.pill.y + at.pill.h - at.border }
  const inset = Math.min(...at.segs.map((one) => Math.min(one.y - inner.top, inner.bottom - (one.y + one.h))))
  check(`${name}: each segment sits inside the pill's border, not up to it`, inset >= 1.5, `${inset.toFixed(1)}px`)
  const centre = Math.abs(at.pill.y + at.pill.h / 2 - (dots.y + dots.h / 2))
  check(`${name}: the pill is on the window dots' centre line`, centre <= 1, `${centre.toFixed(1)}px off`)
  check(`${name}: the pill is at least 6px clear of the window's top`, at.pill.y >= 6, `${at.pill.y.toFixed(1)}px`)
  // Each lit in turn: its fill stays inside the pill.
  await box.mouse.move(at.segs[1].x + at.segs[1].w / 2, at.segs[1].y + at.segs[1].h / 2)
  await box.waitForTimeout(300)
  if (shots) await box.screenshot({ path: `${shots}/box-pill-${name}.png`, clip: { x: Math.max(0, at.pill.x - 420), y: 0, width: 460 + at.pill.w, height: 48 } })
  await box.mouse.move(5, 300)
  // The main window's Back and Forward.
  await go('inbox'); await go('today')
  const main = await segsOf(h, 'header .mf-segs')
  if (main) {
    const mw = main.segs.map((one) => Math.round(one.w * 10) / 10)
    const mi = { top: main.pill.y + main.border, bottom: main.pill.y + main.pill.h - main.border }
    const mInset = Math.min(...main.segs.map((one) => Math.min(one.y - mi.top, mi.bottom - (one.y + one.h))))
    check(`${name}: Back and Forward are the same size, inside the pill's border`, Math.max(...mw) - Math.min(...mw) <= 1 && mInset >= 1.5, `widths ${mw.join(', ')}; inset ${mInset.toFixed(1)}px`)
    if (shots) await h.screenshot({ path: `${shots}/main-header-${name}.png`, clip: { x: 0, y: 0, width: 1200, height: 52 } })
  } else check(`${name}: Back and Forward are one segmented pill`, false, 'no .mf-segs in the header')
}

/** The sidebar's light over one row, read once it has arrived. */
const lightOver = async (locator) => {
  await locator.scrollIntoViewIfNeeded()
  await h.waitForTimeout(300)
  const b = await locator.boundingBox()
  await h.mouse.move(b.x + 6, b.y + b.height / 2)
  await h.waitForTimeout(500)
  return h.evaluate(() => {
    const lit = document.querySelector('[data-side-row][data-fluid-hover-active]')
    if (!lit) return null
    const b = lit.getBoundingClientRect()
    return { text: lit.textContent.trim().slice(0, 20), left: Math.round(b.left), right: Math.round(b.right), radius: getComputedStyle(lit).borderTopLeftRadius }
  })
}

async function headings(theme) {
  await h.evaluate(() => localStorage.setItem('style', 'soft'))
  await c.theme(theme)
  await go('inbox')
  const row = await lightOver(h.locator('[data-side-row]', { hasText: /^Inbox/ }).first())
  for (const name of ['Tasks', 'Saved', 'Types', 'Tags']) {
    const head = name === 'Tags' ? h.locator('[data-side-row]', { hasText: /^Tags$/ }).first() : h.locator('button[data-side-row][aria-expanded]', { hasText: new RegExp(`^${name}`) }).first()
    if (!(await head.count())) { check(`${theme}: the ${name} heading is there`, false); continue }
    const lit = await lightOver(head)
    check(`${theme}: hovering ${name}, the light spans the row as the rows' does`, lit && row && Math.abs(lit.left - row.left) <= 1 && Math.abs(lit.right - row.right) <= 1 && lit.radius === row.radius, `${JSON.stringify(lit)} vs row ${JSON.stringify(row)}`)
  }
  // The Tags chevron: its own small fill, no ring, under the pointer; the row still lit.
  const chevron = h.getByRole('button', { name: /Fold the tags away|Show your tags/ }).first()
  await chevron.scrollIntoViewIfNeeded(); await h.waitForTimeout(300)
  const cb = await chevron.boundingBox()
  await h.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await h.waitForTimeout(400)
  const hover = await h.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => /Fold the tags away|Show your tags/.test(b.getAttribute('aria-label') ?? ''))
    const s = getComputedStyle(el)
    return { outline: s.outlineStyle === 'none' || s.outlineWidth === '0px' ? 'none' : `${s.outlineStyle} ${s.outlineWidth}`, ring: s.boxShadow, fill: s.backgroundColor, lit: document.querySelector('[data-side-row][data-fluid-hover-active]')?.textContent.trim() }
  })
  check(`${theme}: the Tags chevron under the pointer: a fill, no ring, the Tags row still lit`, hover.outline === 'none' && hover.ring === 'none' && hover.fill !== 'rgba(0, 0, 0, 0)' && hover.lit === 'Tags', JSON.stringify(hover))
  if (shots) await h.screenshot({ path: `${shots}/sidebar-chevron-${theme}.png`, clip: { x: 0, y: Math.max(0, cb.y - 260), width: 280, height: 330 } })
  // On the Tags page: the chosen fill is the row's width too.
  await go('tags')
  const chosen = await h.evaluate(() => { const el = document.querySelector('[data-side-row][aria-current=page]'); const b = el?.getBoundingClientRect(); return b && { text: el.textContent.trim(), left: Math.round(b.left), right: Math.round(b.right) } })
  check(`${theme}: on the Tags page its heading is the chosen row, as wide as the rows`, chosen?.text === 'Tags' && Math.abs(chosen.left - row.left) <= 1 && Math.abs(chosen.right - row.right) <= 1, JSON.stringify(chosen))
  // By keyboard: the chevron shows a ring.
  await chevron.focus()
  await h.keyboard.press('Shift+Tab'); await h.keyboard.press('Tab')
  await h.waitForTimeout(200)
  const ring = await h.evaluate(() => { const el = document.activeElement; const s = getComputedStyle(el); return { label: el.getAttribute('aria-label'), outline: s.outlineStyle, visible: el.matches(':focus-visible'), opacity: s.opacity } })
  check(`${theme}: the Tags chevron reached by Tab shows the focus ring`, /tags/.test(ring.label ?? '') && ring.visible && ring.outline !== 'none' && ring.opacity === '1', JSON.stringify(ring))
  if (shots) await h.screenshot({ path: `${shots}/sidebar-focus-${theme}.png`, clip: { x: 0, y: Math.max(0, cb.y - 260), width: 280, height: 330 } })
  await h.evaluate(() => document.activeElement?.blur?.())
  // Folded and unfolded, the heading lights the same.
  await chevron.click(); await h.waitForTimeout(600)
  const folded = await lightOver(h.locator('[data-side-row]', { hasText: /^Tags$/ }).first())
  check(`${theme}: folded, the Tags heading still lights the whole row`, folded && Math.abs(folded.right - row.right) <= 1, JSON.stringify(folded))
  if (shots) await h.screenshot({ path: `${shots}/sidebar-folded-${theme}.png`, clip: { x: 0, y: Math.max(0, cb.y - 260), width: 280, height: 330 } })
  await chevron.click(); await h.waitForTimeout(600)
  await h.mouse.move(600, 400)
}

async function keys() {
  // The Queue: Up next and Read on one page; ⌘A goes to the one under the pointer.
  const gems = (await v('items', 'nugget')).filter((one) => !one.archivedAt).slice(0, 6)
  await v('queue:add', gems.map((one) => one.id), false)
  await go('queue')
  const rowIds = await h.evaluate(() => [...document.querySelectorAll('[data-queue-row]')].map((one) => one.dataset.queueRow).slice(0, 3))
  for (const id of rowIds) await h.evaluate((id) => window.api.haligtree('queue:done', id).catch(() => {}), id)
  await h.waitForTimeout(600)
  let read = await h.locator('[data-read-row]').count()
  if (!read) {
    // Read one the way a person does: Mark as read from its menu.
    await h.locator('[data-queue-row]').first().click({ button: 'right', position: { x: 30, y: 10 } })
    await h.getByRole('menuitem', { name: /as read/i }).first().click().catch(() => {})
    await h.keyboard.press('Escape').catch(() => {})
    await h.waitForTimeout(600)
    read = await h.locator('[data-read-row]').count()
  }
  const picked = () => h.evaluate(() => ({ next: document.querySelectorAll('[data-queue-row][data-picked], [data-queue-row] [data-picked]').length, read: document.querySelectorAll('[data-read-row][data-picked]').length }))
  if (read) {
    // Click in Up next, then point at Read: ⌘A picks Read.
    await h.locator('[data-queue-row]').first().click({ modifiers: ['Meta'] }).catch(() => {})
    await h.keyboard.press('Escape'); await h.waitForTimeout(200)
    await h.locator('[data-read-row]').first().scrollIntoViewIfNeeded(); await h.waitForTimeout(400)
    const rb = await h.locator('[data-read-row]').first().boundingBox()
    await h.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2)
    await h.evaluate(() => document.activeElement?.blur?.())
    if (process.env.DBG) console.log(await h.evaluate(([x, y]) => ({ scopes: document.querySelectorAll('[data-list-scope]').length, at: document.elementFromPoint(x, y)?.closest('[data-list-scope]') ? 'in scope' : document.elementFromPoint(x, y)?.outerHTML.slice(0, 120), picked: document.querySelectorAll('[data-picked]').length }), [rb.x + rb.width / 2, rb.y + rb.height / 2]))
    await h.keyboard.press('Meta+a'); await h.waitForTimeout(400)
    const a = await picked()
    check('Queue: ⌘A with the pointer over Read picks Read, not Up next', a.read === read && a.next === 0, JSON.stringify(a))
    await h.keyboard.press('Escape'); await h.waitForTimeout(250)
    await h.locator('[data-queue-row]').first().scrollIntoViewIfNeeded(); await h.waitForTimeout(400)
    const nb = await h.locator('[data-queue-row]').first().boundingBox()
    await h.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2)
    await h.keyboard.press('Meta+a'); await h.waitForTimeout(400)
    const b = await picked()
    check('Queue: ⌘A with the pointer over Up next picks Up next', b.next > 0 && b.read === 0, JSON.stringify(b))
    await h.keyboard.press('Escape'); await h.waitForTimeout(250)
  } else check('Queue: something in Read to try', false)

  // The Recent panel beside a page: pointer over it, the focus on the page.
  await go('all')
  await h.keyboard.press('Shift+Meta+y'); await h.waitForTimeout(900)
  const panel = h.locator('aside[aria-label=Recent]')
  if (await panel.count()) {
    // The last click on the page (its heading), the focus there too.
    await h.locator('[data-page="all"] h1').first().click().catch(() => {})
    await h.waitForTimeout(300)
    const pb = await panel.locator('[data-recent-row]').nth(1).boundingBox()
    await h.mouse.move(pb.x + 20, pb.y + pb.height / 2)
    await h.keyboard.press('Meta+a'); await h.waitForTimeout(400)
    const seen = await h.evaluate(() => ({ recent: document.querySelectorAll('aside[aria-label=Recent] [data-picked]').length, rows: document.querySelectorAll('aside[aria-label=Recent] [data-recent-row]').length, inbox: document.querySelectorAll('[data-page="all"] [data-picked]').length }))
    check('Recent: ⌘A with the pointer over the panel picks its rows, not the page\'s', seen.recent > 0 && seen.inbox === 0, JSON.stringify(seen))
    const first = await panel.locator('[data-recent-row]').first().getAttribute('data-drag-open')
    await h.keyboard.press('Backspace'); await h.waitForTimeout(1200)
    const toast = await h.evaluate(() => document.querySelector('[role=status][aria-live]')?.textContent ?? '')
    check('Recent: ⌫ there moves them to the Bin, said', /to the Bin/.test(toast), toast)
    await h.keyboard.press('Meta+z'); await h.waitForTimeout(1500)
    check('Recent: ⌘Z brings them back', (await panel.locator(`[data-drag-open="${first}"]`).count()) > 0)
    // Pointer back over the page: ⌘A is the page's again.
    await h.keyboard.press('Escape')
    const ib = await h.locator('[data-page="all"] [data-row][data-id]').first().boundingBox()
    await h.mouse.move(ib.x + 30, ib.y + 10)
    await h.keyboard.press('Meta+a'); await h.waitForTimeout(400)
    const back = await h.evaluate(() => ({ recent: document.querySelectorAll('aside[aria-label=Recent] [data-picked]').length, inbox: document.querySelectorAll('[data-page="all"] [data-picked]').length }))
    check('Recent: with the pointer back over the page, ⌘A picks the page\'s rows', back.inbox > 0 && back.recent === 0, JSON.stringify(back))
    await h.keyboard.press('Escape')
    await h.keyboard.press('Shift+Meta+y'); await h.waitForTimeout(500)
  } else check('Recent: the panel opens with ⇧⌘Y', false)
}

async function dateChip(theme) {
  await h.evaluate(() => localStorage.setItem('style', 'soft'))
  await c.theme(theme)
  // A made-up task, late since yesterday, with a priority and a length.
  const made = await v('task:add', 'Water the classroom ferns yesterday 9am !!2 ~30m', undefined, false)
  const id = made.id
  const was = (await v('tasks')).find((one) => one.id === id)
  await go('today')
  const chip = h.locator(`[data-row][data-id="${id}"] [data-date-chip]`).first()
  check(`${theme}: Today's row has a pressable date`, (await chip.count()) === 1)
  if (!(await chip.count())) return
  await chip.scrollIntoViewIfNeeded()
  const before = await chip.evaluate((el) => getComputedStyle(el).backgroundColor)
  await chip.hover(); await h.waitForTimeout(700)
  const look = await chip.evaluate((el, before) => ({ cursor: getComputedStyle(el).cursor, fill: getComputedStyle(el).backgroundColor !== before, tip: [...document.querySelectorAll('[role=tooltip], [data-slot=tooltip-content]')].map((one) => one.textContent).join(' ') }), before)
  check(`${theme}: pointing at the date shows a hand, a fill and “Click to change the date”`, look.cursor === 'pointer' && look.fill && /Late: the day you meant to do it has passed\. Click to change the date/.test(look.tip), JSON.stringify(look))
  if (shots) await h.screenshot({ path: `${shots}/date-chip-hover-${theme}.png` })
  await chip.click(); await h.waitForTimeout(500)
  const opened = await h.evaluate(() => ({ quick: [...document.querySelectorAll('[data-quick]')].map((one) => one.dataset.quick), calendar: !!document.querySelector('[data-slot=popover-content] [role=grid], [data-slot=popover-content] table'), detail: !!document.querySelector('[data-task-detail], aside [data-task-title-field]') }))
  check(`${theme}: a click opens the calendar with Today, Tomorrow, Next week and No date on top, the task stays shut`, opened.quick.join(',') === 'Today,Tomorrow,Next week,No date' && opened.calendar, JSON.stringify(opened))
  if (shots) await h.screenshot({ path: `${shots}/date-chip-open-${theme}.png` })
  await h.locator('[data-quick="Tomorrow"]').click(); await h.waitForTimeout(800)
  const moved = (await v('tasks')).find((one) => one.id === id)
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const toast = await h.evaluate(() => document.querySelector('[role=status][aria-live]')?.textContent ?? '')
  check(`${theme}: Tomorrow moves it there, said with an Undo`, new Date(moved.dueAt).toDateString() === tomorrow.toDateString() && /Moved to/.test(toast) && /Undo/.test(toast), `${moved.dueAt}; “${toast}”`)
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(900)
  const back = (await v('tasks')).find((one) => one.id === id)
  check(`${theme}: ⌘Z puts the date back`, back.dueAt === was.dueAt, `${back.dueAt} vs ${was.dueAt}`)
  // By keyboard: Tab to it, Enter opens, Esc closes and nothing else.
  const again = h.locator(`[data-row][data-id="${id}"] [data-date-chip]`).first()
  await again.focus(); await h.keyboard.press('Enter'); await h.waitForTimeout(400)
  const keyOpen = await h.evaluate(() => document.querySelectorAll('[data-quick]').length)
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  const keyShut = await h.evaluate(() => ({ quick: document.querySelectorAll('[data-quick]').length, page: !!document.querySelector('[data-page="today"]') }))
  check(`${theme}: Enter on the date opens it, Esc closes it and stays on Today`, keyOpen === 4 && keyShut.quick === 0 && keyShut.page, `${keyOpen} → ${JSON.stringify(keyShut)}`)
  // Its priority and length open their choices the same way.
  await v('task:save', id, { priority: 2 })
  await h.waitForTimeout(500)
  const mark = h.locator(`[data-task-row][data-id="${id}"] [data-chip-choices][aria-label^="Priority"]`).first()
  await mark.click(); await h.waitForTimeout(400)
  const marks = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  check(`${theme}: the priority mark opens the priorities`, marks.some((one) => /^Urgent/.test(one)) && marks.some((one) => /^No priority/.test(one)), marks.join(' / '))
  const length = h.locator(`[data-task-row][data-id="${id}"] [data-chip-choices][aria-label^="About"]`).first()
  await length.click(); await h.waitForTimeout(400)
  const lengths = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  check(`${theme}: the length chip opens the lengths`, lengths.includes('No length') && lengths.length >= 5, lengths.join(' / '))
  // Elsewhere: Home's Next up, Upcoming, the Week, Everything, the Matrix have the same pressable date.
  for (const where of ['home', 'upcoming', 'week', 'all', 'matrix']) {
    await go(where)
    check(`${theme}: ${where} shows dates you can press`, (await h.locator('[data-date-chip]').count()) > 0)
  }
  await v('task:save', id, { status: 'dropped' })
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  const only = process.env.ONLY
  if (!only || only === 'pills') for (const [theme, style] of [['paper', 'soft'], ['dark', 'soft'], ['paper', 'brutal'], ['dark', 'brutal']]) await pills(theme, style)
  if (!only || only === 'heads') for (const theme of ['paper', 'dark']) await headings(theme)
  await h.evaluate(() => localStorage.setItem('style', 'soft'))
  if (!only || only === 'keys') await keys()
  if (!only || only === 'dates') for (const theme of ['paper', 'dark']) await dateChip(theme)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
