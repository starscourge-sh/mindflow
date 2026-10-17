// What is open beside a list never outlives its row. On every page with a list
// and a pane, open one, then:
//   1. right-click it and move it to the Bin: the pane closes or moves on to
//      the next one still there, never left on the binned one; ⌘Z brings it back.
//   2. ⌘A, ⌫: every row the page shows goes, one notice says how many and that
//      they are in the Bin, with Undo; the pane closes; the page does not swap
//      in its made-up example rows as if they had stayed; ⌘Z brings them back.
// The Bin itself: “Delete for good” on the open one, and on every one.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/pane-after-bin.mjs
// SHOTS=dir keeps a picture of each page after ⌘A, ⌫.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, page: box, go, v } = c

const ANY = '[data-row][data-id], [data-pick], [data-drag-open]'
let only = ANY
// What the page shows: its rows (never the example's), the pane's open thing, the notice.
const read = (w, root, ROW = only) => w.evaluate(([root, ROW]) => {
  const scope = document.querySelector(root) ?? document.body
  const rows = [...scope.querySelectorAll(ROW)].filter((one) => one.getBoundingClientRect().height > 0 && !one.closest('[data-example]'))
  const pane = scope.querySelector('.note-pane')
  return {
    rows: [...new Set(rows.map((one) => one.dataset.id ?? one.dataset.pick ?? one.dataset.dragOpen))].filter(Boolean),
    pane: pane?.dataset.open ?? null,
    example: !!scope.querySelector('[data-example]'),
    toast: [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ')
  }
}, [root, ROW])
const rowAt = (w, root, key) => w.locator(`${root} [data-row][data-id="${key}"], ${root} [data-pick="${key}"], ${root} [data-drag-open="${key}"]`).first()
// Off a note the click opened, as a person clicks the list again; a list row keeps the keys.
const blur = (w) => w.evaluate(() => document.activeElement?.closest?.('[contenteditable=true], input, textarea') && document.activeElement.blur())
const until = async (w, root, test, ms = 5000) => {
  const t0 = Date.now()
  let s
  do { await w.waitForTimeout(250); s = await read(w, root) } while (!test(s) && Date.now() - t0 < ms)
  return s
}
const settle = async (w) => {
  if (await w.evaluate(() => !!document.querySelector('[data-celebration]'))) { await w.keyboard.press('Escape'); await w.waitForTimeout(500) }
}

async function surface(name, w, root, open, { bin = /to the Bin/, all = true, undo = true, rows = ANY } = {}) {
  only = rows
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return
  await open()
  let s = await read(w, root)
  if (!s.rows.length) return check(`${name}: has rows to try`, false, 'empty')
  // 1. One, from its right-click menu, while it is open.
  const first = s.rows[0]
  await rowAt(w, root, first).click({ position: { x: 30, y: 10 } })
  await w.waitForTimeout(900)
  s = await read(w, root)
  const was = s.pane
  if (!was) console.log(`  ${name}: a click opens no pane here`)
  await blur(w)
  await rowAt(w, root, first).click({ button: 'right', position: { x: 30, y: 10 } })
  await w.waitForTimeout(400)
  const item = w.locator('[role=menu] [role=menuitem]').filter({ hasText: bin }).first()
  if (!(await item.count())) {
    const lines = await w.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
    await w.keyboard.press('Escape')
    return check(`${name}: its right-click menu has a way to the Bin`, false, lines.join(' / '))
  }
  await item.click()
  // The Bin asks before deleting for good.
  await w.waitForTimeout(300)
  await w.getByRole('button', { name: /^Delete( [\d,]+)? for good$/ }).first().click({ timeout: 800 }).catch(() => {})
  // Deleting for good is held, never clicked (qa/four-asks.mjs): hold “Hold to delete”.
  const hold = w.locator('[data-bin-ask] button', { hasText: /^Hold to delete/ }).first()
  await hold.waitFor({ timeout: 2000 }).catch(() => {})
  if (await hold.count()) {
    const at = await hold.boundingBox()
    await w.mouse.move(at.x + at.width / 2, at.y + at.height / 2)
    await w.mouse.down(); await w.waitForTimeout(1500); await w.mouse.up()
  }
  s = await until(w, root, (s) => !s.rows.includes(first))
  check(`${name}: binned from its menu, its row goes`, !s.rows.includes(first))
  if (was) check(`${name}: and the pane closes or moves on, never left on it`, s.pane !== was && (!s.pane || s.rows.length > 0), `pane was “${was}”, now “${s.pane}”`)
  await settle(w)
  if (!undo) return
  await blur(w)
  await w.keyboard.press('Meta+z')
  s = await until(w, root, (s) => s.rows.includes(first), 3000)
  // A long list draws only what is in view: one put back out of view is asked after.
  const back = s.rows.includes(first) || await w.evaluate(async (id) => {
    const capture = await window.api.captures.get(id).catch(() => null)
    if (capture) return capture.status !== 'discarded'
    const item = await window.api.vigil('item', id).catch(() => null)
    return !!item && !item.binnedAt
  }, first)
  check(`${name}: ⌘Z brings it back`, back)
  if (!all) return
  // 2. Every one, with one open.
  s = await read(w, root)
  const drawn = s.rows.length
  await rowAt(w, root, s.rows[0]).click({ position: { x: 30, y: 10 } })
  await w.waitForTimeout(900)
  const opened = (await read(w, root)).pane
  await blur(w)
  await w.keyboard.press('Meta+a'); await w.waitForTimeout(450)
  // How many ⌘A picked, drawn or not (a long list draws only what is in view).
  const many = Number((/([\d,]+) selected/.exec((await read(w, root)).toast) ?? [])[1]?.replace(/,/g, '') ?? 0) || drawn
  await w.keyboard.press('Backspace')
  s = await until(w, root, (s) => !s.rows.length, 6000)
  await w.waitForTimeout(400)
  s = await read(w, root)
  if (SHOTS && w === h) await w.screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, '-').toLowerCase()}.png` })
  const n = Number((/Moved ([\d,]+) to the Bin/.exec(s.toast) ?? [])[1]?.replace(/,/g, '') ?? (/Moved to the Bin/.test(s.toast) ? 1 : 0))
  check(`${name}: ⌘A, ⌫ takes every row on show`, !s.rows.length, `${s.rows.length} of ${drawn} drawn left: ${s.rows.slice(0, 3).join(', ')}`)
  check(`${name}: one notice says how many, the Bin, Undo`, n === many && /Undo/.test(s.toast), `“${s.toast}”, ${many} were shown`)
  if (opened) check(`${name}: the pane closes with them`, !s.pane, `pane was “${opened}”, now “${s.pane}”`)
  check(`${name}: no example rows come in as if some stayed`, !s.example)
  await settle(w)
  await blur(w)
  await w.keyboard.press('Meta+z')
  s = await until(w, root, (s) => s.rows.length >= drawn, 4000)
  check(`${name}: ⌘Z brings them all back`, s.rows.length >= drawn, `${s.rows.length} of ${drawn}`)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  await v('onboarding:set', { pageHints: false })
  // The sandbox's one-time line about lightsaber bars, set off by the pointer passing a bar, would take the Undo's place.
  for (const w of [h, box]) await w.evaluate(() => localStorage.setItem('saber-offered', new Date().toISOString()))
  // Something in every list: an archived pair, a later task, a dated and an undated one in Upcoming.
  const caps = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open')
  for (const one of caps.slice(-2)) await h.evaluate((id) => window.api.vigil('notes:archive', 'captures', [id], true), one.id).catch(() => {})
  const page = (id) => `[data-page="${id}"]`
  const main = (id) => async () => { await go(id); await h.waitForTimeout(500) }
  for (const [name, id] of [
    ['Upcoming', 'upcoming'], ['Today', 'today'], ['Routines', 'routines'], ['Later', 'later'],
    ['This week', 'week'], ['Matrix', 'matrix'],
    ['Inbox', 'inbox'], ['All captures', 'all'], ['Archived', 'archived'],
    ['Gems', 'nuggets'], ['Writing', 'articles'], ['Questions', 'questions'], ['Goals', 'goals']
  ]) await surface(name, h, page(id), main(id))

  // Quick capture's lists.
  const boxOpen = (key) => async () => { await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(600); await blur(box); await box.keyboard.press(key); await box.waitForTimeout(700) }
  // (⌘A, ⌫ and ⌘Z on these lists are qa/gestures.mjs's; here, what is open beside them.)
  await surface('Quick capture Inbox', box, 'body', boxOpen('Control+1'), { rows: '[data-row][data-id]', all: false })
  await surface('Quick capture Saved', box, 'body', boxOpen('Control+4'), { rows: '[data-row][data-id]', all: false })
  await box.keyboard.press('Escape')

  // The Bin: the open one deleted for good, then every one.
  await surface('Bin', h, page('discarded'), main('discarded'), { bin: /Delete for good|Delete forever/, all: false, undo: false })
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
