// The gestures a Mac user tries on every list, checked on every list:
// click into the list, ⌘A picks every row on show and says how many; a
// right-click on a picked row speaks for all of them, counted, and names the
// Bin; ⌫ moves them to the Bin at once with a notice that says so; ⌘Z brings
// them back; Esc clears the selection. No list says "Discard". In the Bin, ⌫
// asks “Delete N for good?” first. All captures is the first row, the page
// the user hit it on.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/gestures.mjs
// SURVEY=1 only says what each gesture does, for a build from before.
import { sandbox } from './sandbox-lib.mjs'

const SURVEY = !!process.env.SURVEY
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${SURVEY ? 'SEEN' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 900 })
const { h, page: box, go, v } = c
const table = []

// What a surface's window shows, read the same way everywhere.
const ROW_ANY = '[data-row][data-id], [data-pick], [data-drag-open]'
const readAt = (w, root, ROW = ROW_ANY) => w.evaluate(([root, ROW]) => {
  const scope = document.querySelector(root) ?? document.body
  const rows = [...scope.querySelectorAll(ROW)].filter((one) => one.getBoundingClientRect().height > 0)
  return {
    rows: [...new Set(rows.map((one) => one.dataset.id ?? one.dataset.pick ?? one.dataset.dragOpen))].filter(Boolean),
    picked: new Set([...scope.querySelectorAll('[data-picked]')].map((one) => one.dataset.id ?? one.dataset.pick ?? one.dataset.dragOpen ?? one.querySelector('[data-id]')?.dataset.id)).size,
    selected: Number((/(\d[\d,]*)\s*selected/.exec(document.body.innerText) ?? [])[1]?.replace(/,/g, '') ?? 0),
    toast: [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '),
    focus: document.activeElement?.closest?.('[contenteditable=true]') ? 'editor' : document.activeElement?.tagName ?? ''
  }
}, [root, ROW])
const rowAt = (w, root, key) => w.locator(`${root} [data-row][data-id="${key}"], ${root} [data-pick="${key}"], ${root} [data-drag-open="${key}"]`).first()
const menu = (w) => w.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
const bodyHas = (w, re) => w.evaluate((src) => new RegExp(src).test(document.body.innerText), re.source)

async function surface(name, w, root, open, { click = true, rows: only } = {}) {
  const read = (w, root) => readAt(w, root, only)
  await open()
  // (Escape with nothing to close puts quick capture away, as it should: only the main window gets it.)
  if (w !== box) { await w.keyboard.press('Escape'); await w.waitForTimeout(150) }
  let s = await read(w, root)
  if (!s.rows.length) {
    table.push([name, 'empty, nothing to try'])
    return check(`${name}: has rows to try`, false, 'empty')
  }
  const first = s.rows[0]
  // Click into the list, as a person does, on the first row.
  // (Home's cards open on a click: there the page itself has the keys.)
  if (click) await rowAt(w, root, first).click({ position: { x: 30, y: 10 } }).catch(() => {})
  else await w.evaluate(() => document.activeElement?.blur?.())
  await w.waitForTimeout(500)
  const clickFocus = (await read(w, root)).focus
  // The note a click opened may take the keys: a person clicks the list again.
  if (clickFocus === 'editor') await w.evaluate(() => document.activeElement?.blur?.())
  await w.keyboard.press('Meta+a'); await w.waitForTimeout(450)
  s = await read(w, root)
  const all = Math.max(s.selected, s.picked)
  const row = []
  row.push(`click:${clickFocus === 'editor' ? 'note took keys' : 'list'}`)
  row.push(`⌘A:${all ? `${all} picked` : 'nothing'}${/selected/.test(s.toast) ? ' +notice' : ''}`)
  check(`${name}: ⌘A picks the rows on show and says how many`, all >= Math.min(s.rows.length, 1) && /\d+ selected/.test(s.toast), `${all} picked; notice “${s.toast}”`)
  // Right-click on a picked row.
  await rowAt(w, root, first).click({ button: 'right', position: { x: 30, y: 10 } }).catch(() => {})
  await w.waitForTimeout(450)
  const lines = await menu(w)
  row.push(`right-click:${lines.filter((one) => /Bin|Discard|Close|Archive|Resolve/.test(one)).join(' / ') || lines.slice(0, 3).join(' / ')}`)
  check(`${name}: right-click on the picked rows counts them and names the Bin`, lines.some((one) => /^Move \d[\d,]* to the Bin/.test(one) || (all === 1 && /to the Bin/.test(one))), lines.join(' / '))
  check(`${name}: no "Discard" in its menu`, !lines.some((one) => /Discard/.test(one)))
  await w.keyboard.press('Escape'); await w.waitForTimeout(250)
  s = await read(w, root)
  check(`${name}: closing the menu keeps the selection`, s.picked > 0, `${s.picked} still picked`)
  // ⌫: to the Bin at once.
  // Quick capture stays up when Escape only closes a menu.
  if (w === box) check(`${name}: Escape that closes the menu leaves quick capture open`, await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => /index\.html\?sandbox/.test(one.webContents.getURL()))?.isVisible()))
  await w.keyboard.press('Backspace')
  // Many at once take a moment to leave: given up to five seconds.
  const t0 = Date.now()
  do { await w.waitForTimeout(300); s = await read(w, root) } while (s.rows.includes(first) && Date.now() - t0 < 5000)
  const gone = !s.rows.includes(first)
  if (!gone) console.log(`  ${name}: still shown after ⌫: ${first}`)
  row.push(`⌫:${gone ? 'gone' : 'stayed'}${s.toast ? ` “${s.toast.slice(0, 60)}”` : ''}`)
  check(`${name}: ⌫ moves them to the Bin with a notice that says so`, gone && /to the Bin/.test(s.toast) && /Undo/.test(s.toast), s.toast)
  // ⌘Z brings them back.
  await w.keyboard.press('Meta+z'); await w.waitForTimeout(1100)
  s = await read(w, root)
  row.push(`⌘Z:${s.rows.includes(first) ? 'back' : 'not back'}`)
  check(`${name}: ⌘Z brings them back`, s.rows.includes(first))
  // Esc clears (a celebration that came up over the page takes the first one).
  if (await w.evaluate(() => !!document.querySelector('[data-celebration]'))) { await w.keyboard.press('Escape'); await w.waitForTimeout(500) }
  await w.keyboard.press('Meta+a'); await w.waitForTimeout(350)
  const before = (await read(w, root)).picked
  await w.keyboard.press('Escape'); await w.waitForTimeout(350)
  s = await read(w, root)
  row.push(`Esc:${s.picked ? `kept (${before} before)` : 'cleared'}`)
  check(`${name}: Esc clears the selection`, !s.picked)
  table.push([name, row.join('  ')])
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  // Something in every list: a resolved capture among the open ones, an archived pair, a goal, a question, a later task.
  const caps = await h.evaluate(() => window.api.captures.list())
  const open = caps.filter((one) => one.status === 'open')
  if (open[0]) await h.evaluate((id) => window.api.captures.save(id, { status: 'resolved' }), open[0].id)
  for (const one of open.slice(-2)) await h.evaluate((id) => window.api.vigil('notes:archive', 'captures', [id], true), one.id).catch(() => {})
  const page = (id) => `[data-page="${id}"]`
  const main = async (id) => { await go(id); await h.waitForTimeout(400) }
  const MAIN = [
    ['All captures', 'all'], ['Inbox', 'inbox'], ['Archived', 'archived'], ['Gems', 'nuggets'], ['Writing', 'articles'],
    ['Questions', 'questions'], ['Goals', 'goals'], ['Today', 'today'], ['Upcoming', 'upcoming'], ['Routines', 'routines'], ['Later', 'later'], ['Home', 'home']
  ]
  for (const [name, id] of MAIN) await surface(name, h, page(id), () => main(id), { click: id !== 'home' })

  // Quick capture's lists: its Inbox, and Saved.
  await box.evaluate(() => window.api.showPrompt())
  await box.waitForTimeout(900)
  await surface('Quick capture Inbox', box, 'body', async () => { await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(600); await box.evaluate(() => document.activeElement?.blur?.()); await box.keyboard.press('Control+1'); await box.waitForTimeout(500) }, { rows: '[data-row][data-id]' })
  await surface('Quick capture Saved', box, 'body', async () => { await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(600); await box.evaluate(() => document.activeElement?.blur?.()); await box.keyboard.press('Control+4'); await box.waitForTimeout(700) }, { rows: '[data-row][data-id]' })

  // The Bin: ⌫ asks first, with the count.
  await main('discarded')
  let s = await readAt(h, page('discarded'))
  if (s.rows.length) {
    await h.locator(`${page('discarded')} [data-row]`).first().click({ position: { x: 30, y: 10 } })
    await h.keyboard.press('Meta+a'); await h.waitForTimeout(400)
    s = await readAt(h, page('discarded'))
    check('Bin: ⌘A picks every row and says how many', s.picked === s.rows.length && /selected/.test(s.toast), `${s.picked} of ${s.rows.length}`)
    await h.locator(`${page('discarded')} [data-row]`).first().click({ button: 'right', position: { x: 30, y: 10 } })
    await h.waitForTimeout(400)
    const lines = await menu(h)
    check('Bin: right-click on the picked rows counts them', lines.some((one) => /^Restore \d/.test(one)) && lines.some((one) => /^Delete \d[\d,]* for good/.test(one)), lines.join(' / '))
    await h.keyboard.press('Escape'); await h.waitForTimeout(200)
    await h.keyboard.press('Backspace'); await h.waitForTimeout(400)
    const ask = await h.evaluate(() => document.querySelector('[data-bin-ask]')?.innerText.replace(/\s+/g, ' ') ?? '')
    check('Bin: ⌫ asks “Delete N for good? They cannot come back.” first', /Delete \d[\d,]* for good\? They cannot come back/.test(ask) || /Delete for good\? It cannot come back/.test(ask), ask)
    table.push(['Bin', `⌘A:${s.picked} picked  ⌫:${ask ? `asks “${ask.slice(0, 50)}”` : 'nothing'}`])
    await h.locator('[data-bin-ask] button', { hasText: /Keep/ }).first().click().catch(() => {})
    await h.keyboard.press('Escape'); await h.waitForTimeout(300)
    const after = await readAt(h, page('discarded'))
    check('Bin: “Keep them” keeps every one, Esc clears', after.rows.length === s.rows.length && !after.picked)
  } else check('Bin: has rows to try', false)

  // No list anywhere says "Discard" in a label a person reads.
  for (const id of ['all', 'inbox', 'discarded', 'archived']) {
    await main(id)
    check(`${id}: no "Discard" on the page`, !(await bodyHas(h, /\bDiscard(ed)?\b/)))
  }
  console.log('\nsurface | what each gesture did')
  for (const [name, row] of table) console.log(`${name} | ${row}`)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (!SURVEY && passed !== results.length) process.exitCode = 1
