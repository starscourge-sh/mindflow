// The gestures a Mac user tries on every list, checked on every list:
// click into the list, ⌘A picks every row on show and says how many; a
// right-click on a picked row speaks for all of them, counted, and names the
// Bin; ⌫ moves them to the Bin at once with a notice that says so; ⌘Z brings
// them back; Esc clears the selection. No list says "Discard". In the Bin, ⌫
// asks “Delete N for good?” first. All captures is the first row, the page
// the user hit it on. The Queue answers the same keys, but what leaves it only
// leaves the queue; an Inbox emptied into the Bin is not “Inbox zero”.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/gestures.mjs
// SURVEY=1 only says what each gesture does, for a build from before.
import { sandbox } from './sandbox-lib.mjs'

const SURVEY = !!process.env.SURVEY
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${SURVEY ? 'SEEN' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 900 })
const { h, page: box, go, v } = c
const table = []
// The Inbox groups by date to start; ⌘A past "Show N more" is about its kind islands, a choice in Display.
await h.evaluate(() => localStorage.setItem('view:captures:Inbox', JSON.stringify({ sort: 'newest', group: 'kind', filter: {} })))
await h.reload(); await h.waitForTimeout(1800)

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

async function surface(name, w, root, open, { click = true, rows: only, emptied, kept = false } = {}) {
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
  // The menu is waited for, and Escape below waits for it to go: pressed before
  // a slow menu is up, Escape is the list's own (let go of the rows) instead.
  await w.waitForSelector('[role=menu] [role=menuitem]', { timeout: 5000 }).catch(() => {})
  await w.waitForTimeout(200)
  const lines = await menu(w)
  row.push(`right-click:${lines.filter((one) => /Bin|Discard|Close|Archive|Resolve/.test(one)).join(' / ') || lines.slice(0, 3).join(' / ')}`)
  check(`${name}: right-click on the picked rows counts them and names the Bin`, lines.some((one) => /^Move \d[\d,]* to the Bin/.test(one) || (all === 1 && /to the Bin/.test(one))), lines.join(' / '))
  check(`${name}: no "Discard" in its menu`, !lines.some((one) => /Discard/.test(one)))
  await w.keyboard.press('Escape'); await w.waitForSelector('[role=menu]', { state: 'detached', timeout: 3000 }).catch(() => {}); await w.waitForTimeout(250)
  s = await read(w, root)
  check(`${name}: closing the menu keeps the selection`, s.picked > 0, `${s.picked} still picked`)
  // ⌫: to the Bin at once.
  // Quick capture stays up when Escape only closes a menu.
  if (w === box) check(`${name}: Escape that closes the menu leaves quick capture open`, await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => /index\.html\?sandbox/.test(one.webContents.getURL()))?.isVisible()))
  await w.keyboard.press('Backspace')
  // Many at once take a moment to leave: given up to five seconds.
  const t0 = Date.now()
  do { await w.waitForTimeout(300); s = await read(w, root) } while (s.rows.includes(first) && Date.now() - t0 < 5000)
  // The Day page keeps what happened that day: a row moved to the Bin stays, struck through, saying so.
  const gone = !s.rows.includes(first) || (kept && await w.evaluate(([root, first]) => /In the Bin/.test(document.querySelector(`${root} [data-pick="${first}"], ${root} [data-drag-open="${first}"]`)?.textContent ?? ''), [root, first]))
  if (!gone) console.log(`  ${name}: still shown after ⌫: ${first}`)
  row.push(`⌫:${gone ? 'gone' : 'stayed'}${s.toast ? ` “${s.toast.slice(0, 60)}”` : ''}`)
  check(`${name}: ⌫ moves them to the Bin with a notice that says so`, gone && /to the Bin/.test(s.toast) && /Undo/.test(s.toast), s.toast)
  // Emptied into the Bin is not dealt with: no Inbox zero, a line that says where they went.
  if (emptied && !s.rows.length) {
    await w.waitForTimeout(600)
    const seen = await w.evaluate((root) => ({ zero: !!document.querySelector('[data-inbox-zero]') || /Everything you caught has a place/.test(document.body.innerText), said: /The last ones are in the Bin/.test(document.body.innerText), page: (document.querySelector(root) ?? document.body).innerText.replace(/\s+/g, ' ').slice(0, 300) }), root)
    check(`${name}: emptied into the Bin, no “Inbox zero”, it says they are in the Bin`, !seen.zero && seen.said, seen.zero || !seen.said ? JSON.stringify(seen) : '')
  }
  // ⌘Z brings them back.
  await w.keyboard.press('Meta+z'); await w.waitForTimeout(1100)
  s = await read(w, root)
  row.push(`⌘Z:${s.rows.includes(first) ? 'back' : 'not back'}`)
  check(`${name}: ⌘Z brings them back`, s.rows.includes(first))
  // Esc clears (a celebration that came up over the page takes the first one).
  if (await w.evaluate(() => !!document.querySelector('[data-celebration] > *'))) { await w.keyboard.press('Escape'); await w.waitForTimeout(500) }
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
  for (const one of open.slice(-2)) await h.evaluate((id) => window.api.haligtree('notes:archive', 'captures', [id], true), one.id).catch(() => {})
  // Everything is the Inbox with "Show sorted too" on: its page is named so.
  const page = (id) => `[data-page="${({ all: 'inbox' })[id] ?? id}"]`
  // The Inbox asked for from "Show sorted too" stays as it is (the page you are on); from elsewhere it opens plain.
  const main = async (id) => { if (id === 'inbox') await go('day'); await go(id); await h.waitForTimeout(400) }
  const MAIN = [
    ['Inbox, sorted too', 'all'], ['Inbox', 'inbox'], ['Archived', 'archived'], ['Gems', 'nuggets'], ['Writing', 'articles'],
    ['Questions', 'questions'], ['Goals', 'goals'], ['Tasks', 'today'], ['Upcoming', 'upcoming'], ['Routines', 'routines'], ['Later', 'later'], ['Today page', 'day'], ['Home', 'home']
  ]
  for (const [name, id] of MAIN) await surface(name, h, page(id), () => main(id), { click: id !== 'day' && id !== 'home', emptied: id === 'inbox', kept: id === 'day' })

  // Quick capture's lists: its Inbox, and Saved.
  await box.evaluate(() => window.api.showPrompt())
  await box.waitForTimeout(900)
  await surface('Quick capture Inbox', box, 'body', async () => { await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(600); await box.evaluate(() => document.activeElement?.blur?.()); await box.keyboard.press('Control+1'); await box.waitForTimeout(500) }, { rows: '[data-row][data-id]', emptied: true })
  await surface('Quick capture Saved', box, 'body', async () => { await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(600); await box.evaluate(() => document.activeElement?.blur?.()); await box.keyboard.press('Control+4'); await box.waitForTimeout(700) }, { rows: '[data-row][data-id]' })

  // The Queue: the same gestures, but what leaves only leaves the queue, never for the Bin.
  const gems = (await v('items', 'nugget')).filter((one) => !one.archivedAt).slice(0, 4)
  await v('queue:add', gems.map((one) => one.id), false)
  await main('queue')
  const Q = page('queue')
  let q = await readAt(h, Q)
  const queued = q.rows.length
  check('Queue: has rows to try', queued >= 3, `${queued} rows`)
  await h.locator(`${Q} [data-queue-row] button`).first().click({ modifiers: ['Meta'] })
  await h.waitForTimeout(300)
  q = await readAt(h, Q)
  check('Queue: ⌘-click picks one', q.picked === 1, `${q.picked} picked`)
  await h.locator(`${Q} [data-queue-row]`).nth(2).locator('button').first().click({ modifiers: ['Shift'] })
  await h.waitForTimeout(300)
  q = await readAt(h, Q)
  check('Queue: ⇧-click picks the run to it', q.picked === 3 && (await readAt(h, Q)).rows.length === queued && !(await h.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Reading"]'))), `${q.picked} picked`)
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  check('Queue: Esc clears the selection', !(await readAt(h, Q)).picked)
  await h.keyboard.press('Meta+a'); await h.waitForTimeout(400)
  q = await readAt(h, Q)
  check('Queue: ⌘A picks every one and says what ⌫ does', q.picked === queued && /selected: ⌫ takes them out of the queue/.test(q.toast), `${q.picked}; “${q.toast}”`)
  await h.locator(`${Q} [data-queue-row]`).first().click({ button: 'right', position: { x: 30, y: 10 } })
  await h.waitForTimeout(400)
  const qLines = await menu(h)
  check('Queue: right-click on the picked rows counts them and says the queue, not the Bin', qLines.some((one) => one.startsWith(`Take ${queued} out of the queue`)) && !qLines.some((one) => /Bin/.test(one)), qLines.join(' / '))
  await h.keyboard.press('Escape'); await h.waitForTimeout(250)
  check('Queue: closing the menu keeps the selection', (await readAt(h, Q)).picked === queued)
  await c.electron.evaluate(({ clipboard }) => clipboard.writeText(''))
  await h.keyboard.press('Meta+c'); await h.waitForTimeout(400)
  const copied = await c.electron.evaluate(({ clipboard }) => clipboard.readText())
  check('Queue: ⌘C copies their names, one to a line', copied.split('\n').length === queued, JSON.stringify(copied.slice(0, 80)))
  await h.keyboard.press('Backspace')
  await h.waitForTimeout(900)
  q = await readAt(h, Q)
  const still = (await v('items', 'nugget')).filter((one) => gems.some((gem) => gem.id === one.id)).length
  check('Queue: ⌫ takes them out of the queue, said, and the gems stay', !q.rows.length && /out of the queue/.test(q.toast) && /Undo/.test(q.toast) && still === gems.length, `${q.rows.length} left; “${q.toast}”; ${still} of ${gems.length} gems`)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(1100)
  check('Queue: ⌘Z puts them back in the queue', (await readAt(h, Q)).rows.length === queued)
  table.push(['Queue', `picked ${queued}, menu ${qLines.slice(0, 3).join(' / ')}`])

  // Inbox zero is for real exits only. Emptied into the Bin: the quiet page, and its ⌘Z still
  // works once the notice has gone. Emptied by resolving every one: Inbox zero.
  await main('inbox')
  const I = page('inbox')
  // Grouped by kind, each kind shows a few: one ⌘A still picks the whole Inbox, those behind “Show N more” too.
  const waiting = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open' && !one.archivedAt).length
  const hidden = await h.evaluate((root) => !!document.querySelector(`${root} [data-island-more]`), I)
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+a'); await h.waitForTimeout(400)
  const said = (await readAt(h, I)).toast
  check('Inbox: one ⌘A picks every capture, rows behind “Show N more” too, and counts them all', hidden && new RegExp(`^${waiting.toLocaleString('en')} selected`).test(said), `${waiting} waiting, “Show N more” ${hidden ? 'there' : 'missing'}; “${said}”`)
  await h.keyboard.press('Backspace')
  await h.waitForFunction(() => /The last ones are in the Bin/.test(document.body.innerText), null, { timeout: 6000 }).catch(() => {})
  await h.waitForTimeout(7000)
  const quietNow = await h.evaluate(() => ({ said: /The last ones are in the Bin/.test(document.body.innerText), toast: !!document.querySelector('[role=status][aria-live]')?.textContent?.trim(), moment: document.querySelector('[data-celebration]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '' }))
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(1500)
  const backAll = (await readAt(h, I)).rows.length
  check('Inbox emptied into the Bin: no “Inbox empty” moment, and after the notice ⌘Z on the page brings them back', quietNow.said && !quietNow.toast && !/Inbox empty/.test(quietNow.moment) && backAll > 0, `${JSON.stringify(quietNow)}, ${backAll} back`)
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+a'); await h.waitForTimeout(400)
  await h.locator(`${I} [data-row][data-picked]`).first().click({ button: 'right', position: { x: 30, y: 10 } })
  await h.waitForTimeout(400)
  await h.getByRole('menuitem', { name: /^Resolve \d/ }).first().click()
  await h.waitForFunction(() => !!document.querySelector('[data-inbox-zero]'), null, { timeout: 8000 }).catch(() => {})
  check('Inbox emptied by resolving every one: “Inbox zero”', await h.evaluate(() => !!document.querySelector('[data-inbox-zero]') && /Everything you caught has a place/.test(document.body.innerText)))
  // The day's “Inbox empty” moment may come up over it: put away first.
  await h.waitForTimeout(1200)
  if (await h.evaluate(() => !!document.querySelector('[data-celebration] > *'))) { await h.keyboard.press('Escape'); await h.waitForTimeout(600) }
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(1500)
  check('and ⌘Z puts them back in the Inbox', (await readAt(h, I)).rows.length > 0)

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
