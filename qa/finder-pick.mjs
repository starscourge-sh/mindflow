// Picking as Finder does, in every list, and the picked tasks' menu.
//   ⌘-click three rows apart: those three are picked. ⇧-click after a plain
//   click: the run between them. ⇧↓ and ⇧↑ grow and shrink the run. A plain
//   click picks just that row (the rest let go).
//   Three tasks picked, "Reschedule" then "Tomorrow" from their menu: all three
//   move to tomorrow, one notice, and ⌘Z puts each back. In Everything, with a
//   note picked too, the line says "Reschedule 2 tasks…".
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-keys/main/index.js MINDFLOW_QA_AWAY=1 node qa/finder-pick.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, page: box, go, send, v } = c

const ROW = '[data-row][data-id], button[data-pick], div[data-pick]'
const keyOf = (one) => one.dataset.id ?? one.dataset.pick
const rows = (w, root) => w.evaluate(([root, ROW]) => [...new Set([...(document.querySelector(root) ?? document).querySelectorAll(ROW)]
  .filter((one) => one.getBoundingClientRect().height > 0 && !one.closest('[data-example], .note-pane, [data-beside]')).map((one) => one.dataset.id ?? one.dataset.pick))], [root, ROW])
const picked = (w, root) => w.evaluate(([root, ROW]) => [...new Set([...(document.querySelector(root) ?? document).querySelectorAll(ROW)]
  .filter((one) => (one.closest('[data-picked]') ?? (one.hasAttribute('data-picked') ? one : null)) && !one.closest('.note-pane')).map((one) => one.dataset.id ?? one.dataset.pick))], [root, ROW])
const at = (w, root, key) => w.locator(`${root} [data-row][data-id="${key}"], ${root} [data-pick="${key}"]`).first()
const click = async (w, root, key, modifiers = []) => { await at(w, root, key).click({ position: { x: 30, y: 8 }, modifiers }); await w.waitForTimeout(350) }
const same = (a, b) => a.length === b.length && a.every((one) => b.includes(one))
void keyOf

// `plain: false`: a plain click goes to the note's own page (a tag page), so
// the run starts from a ⌘-click and Escape lets go.
async function finder(name, w, root, open, { arrows = true, plain = true } = {}) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return
  await open()
  const shown = await rows(w, root)
  if (shown.length < 6) return check(`${name}: has rows to try`, false, `${shown.length}`)
  // ⌘-click three apart.
  if (plain) await click(w, root, shown[0])
  for (const i of [0, 2, 4]) await click(w, root, shown[i], ['Meta'])
  let now = await picked(w, root)
  check(`${name}: ⌘-click three apart picks those three`, same(now, [shown[0], shown[2], shown[4]]), now.join(', '))
  // ⌘-click one again takes it out, keeping the rest.
  await click(w, root, shown[2], ['Meta'])
  now = await picked(w, root)
  check(`${name}: ⌘-click a picked one takes only it out`, same(now, [shown[0], shown[4]]), now.join(', '))
  // A plain click lets them go.
  if (plain) await click(w, root, shown[1])
  else { await w.keyboard.press('Escape'); await w.waitForTimeout(300); await click(w, root, shown[1], ['Meta']) }
  now = await picked(w, root)
  if (plain) check(`${name}: a plain click lets the picked ones go`, now.length === 0, now.join(', '))
  // ⇧-click from the one clicked.
  await click(w, root, shown[4], ['Shift'])
  now = await picked(w, root)
  check(`${name}: ⇧-click picks the run from the row clicked`, same(now, shown.slice(1, 5)), now.join(', '))
  // ⇧-click nearer redraws the run, never adds a second.
  await click(w, root, shown[2], ['Shift'])
  now = await picked(w, root)
  check(`${name}: a second ⇧-click redraws the run`, same(now, shown.slice(1, 3)), now.join(', '))
  // ⌘ then ⇧: the ⌘-picked one stays, the run adds to it.
  if (plain) await click(w, root, shown[0])
  else { await w.keyboard.press('Escape'); await w.waitForTimeout(300) }
  await click(w, root, shown[5], ['Meta'])
  await click(w, root, shown[3], ['Shift'])
  now = await picked(w, root)
  check(`${name}: ⇧-click after ⌘-click adds the run to what ⌘ picked`, same(now, [shown[3], shown[4], shown[5]]), now.join(', '))
  if (arrows) {
    await click(w, root, shown[0])
    await w.keyboard.press('Shift+ArrowDown'); await w.waitForTimeout(150)
    await w.keyboard.press('Shift+ArrowDown'); await w.waitForTimeout(250)
    now = await picked(w, root)
    check(`${name}: ⇧↓ ⇧↓ grows the run from the clicked row`, same(now, shown.slice(0, 3)), now.join(', '))
    await w.keyboard.press('Shift+ArrowUp'); await w.waitForTimeout(250)
    now = await picked(w, root)
    check(`${name}: ⇧↑ shrinks it`, same(now, shown.slice(0, 2)), now.join(', '))
  }
  await w.keyboard.press('Escape'); await w.waitForTimeout(250)
}

const due = (id) => h.evaluate((id) => window.api.vigil('task', id).then((task) => task?.dueAt ?? null), id)
const dayOf = (iso) => (iso ? new Date(iso).toDateString() : null)
async function reschedule(name, root, open, ids, line) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return
  await open()
  const before = await Promise.all(ids.map(due))
  for (const id of ids) await click(h, root, id, ['Meta'])
  await at(h, root, ids[0]).click({ button: 'right', position: { x: 30, y: 8 } })
  await h.waitForTimeout(400)
  const item = h.locator('[role=menu] [role=menuitem]').filter({ hasText: line }).first()
  if (!(await item.count())) {
    const lines = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
    await h.keyboard.press('Escape')
    return check(`${name}: the picked ones' menu has “${line}”`, false, lines.join(' / '))
  }
  check(`${name}: the picked ones' menu has “${line}”`, true)
  await item.hover(); await h.waitForTimeout(150); await item.click().catch(() => {})
  await h.waitForTimeout(400)
  await h.locator('[role=menu] [role=menuitem]').filter({ hasText: /^Tomorrow$/ }).first().click()
  const tomorrow = new Date(Date.now() + 864e5).toDateString()
  let after = []
  for (let i = 0; i < 20; i++) { await h.waitForTimeout(200); after = await Promise.all(ids.map(due)); if (after.every((one) => dayOf(one) === tomorrow)) break }
  check(`${name}: every picked task moves to tomorrow`, after.every((one) => dayOf(one) === tomorrow), after.map(dayOf).join(', '))
  const said = await h.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '))
  check(`${name}: one notice says how many, with Undo`, new RegExp(`Moved ${ids.length} tasks to tomorrow`).test(said) && /Undo/.test(said), said)
  await h.evaluate(() => document.activeElement?.blur())
  await h.waitForTimeout(300)
  await h.keyboard.press('Meta+z')
  let back = []
  for (let i = 0; i < 20; i++) { await h.waitForTimeout(200); back = await Promise.all(ids.map(due)); if (back.every((one, n) => one === before[n])) break }
  check(`${name}: ⌘Z puts each back where it was`, back.every((one, n) => one === before[n]), back.map(dayOf).join(', '))
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  await v('onboarding:set', { pageHints: false })
  for (const w of [h, box]) await w.evaluate(() => localStorage.setItem('saber-offered', new Date().toISOString()))
  const page = (id) => `[data-page="${id}"]`
  const main = (id) => async () => { await go(id); await h.waitForTimeout(600) }
  // More open tasks, so Upcoming and Everything have enough of them.
  for (let i = 1; i <= 6; i++) await v('task:add', `Finder pick ${i} in ${i + 3} days`).catch(() => {})
  // And some for today, for quick capture's Tasks tab.
  for (let i = 1; i <= 3; i++) await v('task:add', `Finder today ${i} today`).catch(() => {})
  for (const [name, id] of [['Everything', 'all'], ['Inbox', 'inbox'], ['Writing', 'articles'], ['Gems', 'nuggets'], ['Tasks (Upcoming)', 'upcoming']])
    await finder(name, h, page(id), main(id))
  const [tag] = await v('tags')
  await finder(`Tag #${tag.tag} list`, h, 'body', async () => {
    await send('tag', tag.tag); await h.waitForTimeout(1400)
    await h.getByRole('tab', { name: /^Manage$/ }).first().click().catch(() => {}); await h.waitForTimeout(700)
  }, { arrows: false, plain: false })
  await h.getByRole('tab', { name: /^Read$/ }).first().click().catch(() => {})
  const boxOpen = (key) => async () => {
    await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(600)
    await box.evaluate(() => document.activeElement?.blur()); await box.keyboard.press(key); await box.waitForTimeout(700)
  }
  await finder('Quick capture Inbox', box, 'body', boxOpen('Control+1'))
  await finder('Quick capture Tasks', box, 'body', boxOpen('Control+2'))
  await box.keyboard.press('Escape')

  // Three tasks rescheduled at once, from their menu.
  await go('upcoming'); await h.waitForTimeout(600)
  // Not already tomorrow's, so the move shows.
  const tomorrowIs = new Date(Date.now() + 864e5).toDateString()
  const upcoming = await rows(h, page('upcoming'))
  const tasks = []
  for (const id of upcoming) if (tasks.length < 3 && dayOf(await due(id)) !== tomorrowIs) tasks.push(id)
  await reschedule('Tasks (Upcoming)', page('upcoming'), async () => { await click(h, page('upcoming'), tasks[0]); await h.keyboard.press('Escape') }, tasks, /^Reschedule$/)
  // Everything: two tasks and a note picked; the line is for the tasks only.
  await go('all'); await h.waitForTimeout(600)
  // A note further down, past the tasks: scrolled to, as a person would.
  await at(h, page('all'), (await rows(h, page('all')))[0]).hover()
  for (let i = 0; i < 30 && !(await h.locator(`${page('all')} [data-row][data-type="capture"]`).count()); i++) { await h.mouse.wheel(0, 600); await h.waitForTimeout(150) }
  const all = await rows(h, page('all'))
  const kinds = await h.evaluate((ids) => Promise.all(ids.map((id) => window.api.captures.get(id).then(async (capture) => (capture ? 'note' : (await window.api.vigil('task', id))?.status === 'open' ? 'task' : 'other')))), all)
  // The note, and the two tasks nearest it, so all three are in view.
  const noteAt = kinds.indexOf('note')
  const note = all[noteAt]
  const two = []
  for (const i of all.map((_, i) => i).sort((a, b) => Math.abs(a - noteAt) - Math.abs(b - noteAt))) if (two.length < 2 && kinds[i] === 'task' && dayOf(await due(all[i])) !== tomorrowIs) two.push(all[i])
  if (two.length < 2 || !note) check('Everything: has two tasks and a note to pick', false, kinds.join(','))
  else {
    // The note is picked too, so the tasks' line names them.
    await reschedule('Everything, tasks and a note', page('all'), async () => { await click(h, page('all'), note, ['Meta']) }, two, /^Reschedule 2 tasks…$/)
  }
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
