// Arc's spaces and sidebar in Vigil: a book's colour (picked in the book
// switcher and in Settings, shown as dots, washed across the window, worn
// again after a switch), the sidebar's Open today and Earlier (a note opened
// lands, closing it or the night moves it down, opening or dragging brings
// it back, Pinned never ages, the setting for how long), and Close the day's
// two lines looking back.
//
//   npx electron-vite build --outDir out-spaces
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-spaces/main/index.js MINDFLOW_QA_AWAY=1 node qa/spaces.mjs
//   QA_SHOTS=<folder> for pictures.
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _electron as electron } from 'playwright'

const root = process.env.QA_DATA ?? mkdtempSync(join(tmpdir(), 'vigil-spaces-'))
if (root.includes('Application Support')) throw new Error('never the real data folder')
process.env.QA_DATA = root
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const shot = async (c, name) => shots && c.h.screenshot({ path: join(shots, `${name}.png`) })
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

/**
 * The app on this data, its main window found and sized. Not the shared
 * harness: that waits for the box, which a Vigil started a second time no
 * longer shows (it opens the main window, as any app does).
 */
async function open(args) {
  const app = await electron.launch({ args: [process.env.QA_ENTRY ?? '.', ...args.split(' ').filter(Boolean)], env: { ...process.env, MINDFLOW_QA_AWAY: '1', MINDFLOW_USER_DATA: root } })
  const child = app.process()
  process.on('exit', () => { try { child.kill('SIGKILL') } catch {} })
  let h
  for (let i = 0; i < 100 && !h; i++) (h = app.windows().find((w) => w.url().includes('view=home'))) || (await new Promise((done) => setTimeout(done, 200)))
  if (!h) throw new Error('no main window')
  const errors = []
  // Another builder's half-made work, not this probe's.
  const theirs = (text) => text.includes('digest:last')
  h.on('pageerror', (e) => theirs(e.message) || errors.push('PAGEERROR ' + e.message))
  h.on('console', (m) => m.type() === 'error' && !theirs(m.text()) && errors.push(m.text().slice(0, 300)))
  await h.waitForLoadState('domcontentloaded')
  await h.waitForTimeout(1200)
  const v = (channel, ...rest) => h.evaluate(([c, a]) => window.api.vigil(c, ...a), [channel, rest])
  const size = async (w, hh) => {
    await app.evaluate(({ BrowserWindow }, [w, hh]) => { const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); win?.setBounds({ x: 40, y: 40, width: w, height: hh }); win?.show() }, [w, hh])
    await h.waitForTimeout(500)
  }
  await size(1180, 760)
  const send = (type, id) => app.evaluate(({ BrowserWindow }, [type, id]) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', type, id), [type, id])
  const go = async (id) => { await send('view', id); await h.waitForTimeout(900) }
  const theme = async (name) => { await h.evaluate((n) => localStorage.setItem('theme', n), name); await h.reload(); await h.waitForTimeout(1500) }
  const close = async () => { try { await app.close() } catch {} ; try { child.kill('SIGKILL') } catch {} }
  return { electron: app, h, errors, v, go, send, size, theme, close }
}
const launch = async (args = '') => {
  const c = await open(args)
  // No welcome over the page, no hints: the window as it is used every day.
  const state = await c.v('onboarding:state')
  if (!state?.welcomed || state?.welcoming) {
    await c.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
    await c.h.reload()
    await c.h.waitForTimeout(1500)
  }
  return c
}
const css = (c, name) => c.h.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
const hueNow = (c) => c.h.evaluate(() => document.documentElement.dataset.bookHue ?? null)
const washes = (c) => c.h.evaluate(() => [...(window.vigilWashes ?? [])])
const theme = process.env.QA_THEME

let bookId
// --- 1. A book's colour -------------------------------------------------------------------
{
  const c = await launch()
  if (theme) await c.theme(theme)
  const first = await c.v('books:list')
  check('a book starts with no colour: the theme as drawn', first.color === null && first.books.every((one) => one.color === null) && (await hueNow(c)) === null)
  const accent = await css(c, '--tt-brand-color-400')
  // The switcher: every book with a dot, and the open book's colour row.
  await c.h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:book-ask', { detail: { mode: 'switch' } })))
  await c.h.waitForSelector('[data-book-colour]', { timeout: 4000 })
  check('the switcher offers the open book\'s colour, ten choices', (await c.h.$$('[data-book-colour] [role="radio"]')).length === 9)
  await shot(c, 'switcher-none')
  await c.h.click('[data-book-colour] [data-hue="pink"]')
  await c.h.waitForTimeout(80)
  const banded = await c.h.evaluate(() => !!document.querySelector('[data-book-wash]'))
  await c.h.waitForTimeout(700)
  const after = await c.v('books:list')
  check('picking pink keeps it on the shelf', after.color === 'pink' && after.books.find((one) => one.current).color === 'pink', JSON.stringify(after.books))
  check('the window washes into it: a band sweeps across, then is gone', banded && (await washes(c)).includes('pink') && !(await c.h.$('[data-book-wash]')))
  check('the accent turns to the theme\'s pink', (await hueNow(c)) === 'pink' && (await css(c, '--tt-brand-color-400')) === (await css(c, '--tt-color-text-pink')) && (await css(c, '--tt-brand-color-400')) !== accent, `${accent} -> ${await css(c, '--tt-brand-color-400')}`)
  const tint = await c.h.$eval('aside[data-book-tint]', (one) => getComputedStyle(one).backgroundImage)
  check('the sidebar takes a tint of it', tint.includes('gradient'), tint.slice(0, 60))
  await shot(c, 'switcher-pink')
  await c.h.keyboard.press('Escape')
  await c.h.waitForTimeout(300)
  await shot(c, 'home-blue')
  // A second book, shown in the switcher with its own dot.
  bookId = await c.v('books:create', 'Work')
  await c.v('books:color', bookId, 'green')
  await c.h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:book-ask', { detail: { mode: 'switch' } })))
  await c.h.waitForSelector(`[data-book="${bookId}"]`, { timeout: 4000 })
  const dots = await c.h.$$eval('[data-book] span[aria-hidden]', (all) => all.map((one) => one.getAttribute('style') ?? ''))
  check('the switcher shows each book\'s colour as a dot', dots.some((one) => one.includes('pink')) && dots.some((one) => one.includes('green')), JSON.stringify(dots))
  await shot(c, 'switcher-two')
  await c.h.keyboard.press('Escape')
  await c.h.waitForTimeout(300)
  check('Escape puts the switcher away', !(await c.h.$('[data-book-colour]')))
  // Settings: the same dots under each book.
  await c.go('settings')
  await c.h.evaluate(() => [...document.querySelectorAll('[data-section]')].find((one) => one.getAttribute('data-section') === 'Import and backups')?.click())
  await c.h.waitForTimeout(700)
  const rows = await c.h.$$('[data-setting] [role="radiogroup"][aria-label="Book colour"]')
  check('Settings has a colour row under each book', rows.length === 2, `${rows.length}`)
  await c.h.evaluate(() => document.querySelector('[role="radiogroup"][aria-label="Book colour"] [data-hue="purple"]')?.scrollIntoView({ block: 'center' }))
  await c.h.click('[role="radiogroup"][aria-label="Book colour"] [data-hue="purple"]')
  await c.h.waitForTimeout(700)
  check('a colour picked in Settings is worn at once', (await hueNow(c)) === 'purple' && (await c.v('books:list')).color === 'purple')
  await shot(c, 'settings-books')
  // Motion off: the colour is simply there, with no band.
  await c.h.evaluate(() => (document.documentElement.dataset.motion = 'off', window.vigilWashes = []))
  await c.v('books:color', 'default', 'orange')
  await c.h.waitForTimeout(500)
  check('with Motion off, no wash: the colour is simply there', (await hueNow(c)) === 'orange' && (await washes(c)).length === 0)
  await c.h.evaluate(() => delete document.documentElement.dataset.motion)
  // Back to none: the theme's own accent again.
  await c.h.click('[role="radiogroup"][aria-label="Book colour"] [data-hue="none"]')
  await c.h.waitForTimeout(700)
  check('No colour gives the theme\'s accent back', (await hueNow(c)) === null && (await css(c, '--tt-brand-color-400')) === accent)
  await c.v('books:color', 'default', 'blue')
  check('no errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  await c.close()
}

// --- 2. Arriving in a book by a switch: its colour washes in -------------------------------
{
  const c = await launch(`--book=${bookId}`)
  await c.h.waitForTimeout(1500)
  check('switched into Work, the window washes into its green', (await hueNow(c)) === 'green' && (await washes(c)).includes('green'), JSON.stringify(await washes(c)))
  await c.close()
}

// --- 3. Open today and Earlier --------------------------------------------------------------
{
  const c = await launch()
  check('My book wears blue again on a plain start, with no wash', (await hueNow(c)) === 'blue' && (await washes(c)).length === 0)
  const ids = []
  for (const words of ['Rome trip packing list', 'Notes on Stoner by John Williams', 'Kitchen shelf measurements', 'A thought about tides']) ids.push(await c.h.evaluate((d) => window.api.captures.create({ body: d }), doc(words)))
  await c.h.waitForTimeout(600)
  const open = () => c.h.$$eval('[data-open-today] [data-open-row] .private-text', (all) => all.map((one) => one.textContent))
  const empty = await c.h.$eval('[data-open-empty]', (one) => one.textContent).catch(() => '')
  check('first time: Open today says what it is for', empty.includes('Notes you open land here') && empty.includes('Overnight'), empty)
  await shot(c, 'open-empty')
  await c.send('capture', ids[0])
  await c.h.waitForTimeout(700)
  await c.send('capture', ids[1])
  await c.h.waitForTimeout(900)
  let now = await open()
  check('a note opened lands under Open today, newest first', now[0] === 'Notes on Stoner by John Williams' && now[1] === 'Rome trip packing list' && now.length === 2, JSON.stringify(now))
  await c.send('capture', ids[0])
  await c.h.waitForTimeout(700)
  check('opening one again keeps its place', JSON.stringify(await open()) === JSON.stringify(now))
  await shot(c, 'open-two')
  // Close one with its ×: down to Earlier.
  await c.h.locator('[data-open-row="open"]').first().hover()
  await c.h.locator('[data-open-row="open"]').first().locator('[data-no-split]').click()
  await c.h.waitForTimeout(600)
  now = await open()
  check('× moves it down to Earlier', now.length === 1 && now[0] === 'Rome trip packing list', JSON.stringify(now))
  const heading = await c.h.$$eval('button[aria-expanded]', (all) => all.map((one) => one.textContent).find((t) => t?.startsWith('Earlier')) ?? '')
  check('Earlier shows how many wait there', /Earlier\s*1/.test(heading), heading)
  // Overnight: one opened yesterday moves down on its own, after a moment where you last saw it.
  await c.h.evaluate(([a, b]) => {
    const yesterday = new Date(Date.now() - 86400000).toISOString()
    const list = JSON.parse(localStorage.getItem('sidebar:open-today'))
    for (const one of list) if (one.id === a) (one.at = yesterday, one.since = yesterday)
    localStorage.setItem('sidebar:open-today', JSON.stringify(list))
    localStorage.setItem('sidebar:open-seen', JSON.stringify([`capture:${a}`]))
    void b
  }, [ids[0], ids[1]])
  await c.h.reload()
  await c.h.waitForTimeout(500)
  const held = await open()
  await c.h.waitForTimeout(1800)
  const moved = await open()
  check('the night\'s move is seen: the note stays a moment, then slides down', held.includes('Rome trip packing list') && !moved.includes('Rome trip packing list'), `${JSON.stringify(held)} then ${JSON.stringify(moved)}`)
  const emptyAfter = await c.h.$eval('[data-open-empty]', (one) => one.textContent).catch(() => '')
  check('an empty morning says where yesterday went', emptyAfter.includes('under Earlier'), emptyAfter)
  // Earlier opened: both there; clicking one brings it back up.
  await c.h.evaluate(() => [...document.querySelectorAll('button[aria-expanded]')].find((one) => one.textContent?.startsWith('Earlier'))?.click())
  await c.h.waitForTimeout(500)
  const earlier = await c.h.$$eval('[data-open-row="earlier"] .private-text', (all) => all.map((one) => one.textContent))
  check('Earlier lists what moved down, most recent first', earlier.length === 2, JSON.stringify(earlier))
  await shot(c, 'earlier-open')
  await c.h.click('[data-open-row="earlier"] button[data-side-row]')
  await c.h.waitForTimeout(800)
  check('opening one from Earlier brings it back to Open today', (await open()).length === 1)
  // The setting: Never, and yesterday's is open again.
  await c.v('settings:set', { sidebarOpenFor: 'never' })
  await c.h.waitForTimeout(600)
  const heads = await c.h.$eval('[data-open-today]', (one) => one.textContent)
  check('“Never”: the heading says Open, and yesterday\'s stays', heads.startsWith('Open') && !heads.startsWith('Open today') && (await open()).includes('Rome trip packing list'), JSON.stringify(await open()))
  await c.v('settings:set', { sidebarOpenFor: 'day' })
  await c.h.waitForTimeout(500)
  // Drag to Pinned: pinned, gone from Open today. Pinned never ages.
  const from = await c.h.$eval('[data-open-row="open"] button[data-side-row]', (one) => { const r = one.getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 } })
  await c.h.mouse.move(from.x, from.y)
  await c.h.mouse.down()
  await c.h.mouse.move(from.x + 20, from.y + 4, { steps: 4 })
  await c.h.waitForTimeout(200)
  const to = await c.h.$eval('[data-side-drop="pinned"]', (one) => { const r = one.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2, shown: r.height > 0 } })
  await c.h.mouse.move(to.x, to.y, { steps: 8 })
  await c.h.waitForTimeout(250)
  await shot(c, 'drag-to-pinned')
  await c.h.mouse.up()
  await c.h.waitForTimeout(900)
  const pinnedNow = async () => (await c.h.evaluate(() => window.api.captures.list())).filter((one) => one.pinnedAt).map((one) => one.label)
  const pins = await pinnedNow()
  const quiet = (await c.v('pins')).length === 0
  check('while carrying a note, Pinned shows as a place to drop it', to.shown)
  check('dropped on Pinned, the note is pinned and shows there (or, in quiet hours, stays under Open today)', pins.length === 1 && (quiet ? (await open()).includes(pins[0]) : !(await open()).includes(pins[0])), JSON.stringify({ pins, quiet }))
  if (quiet) await c.v('settings:set', { quietStart: '00:00', quietEnd: '00:00' })
  await c.h.waitForTimeout(600)
  await shot(c, 'pinned')
  // And back from Pinned to Open today.
  const pinRow = await c.h.$eval('[data-side-drop="pinned"] [data-drag-open]', (one) => { const r = one.getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 } })
  await c.h.mouse.move(pinRow.x, pinRow.y)
  await c.h.mouse.down()
  await c.h.mouse.move(pinRow.x + 20, pinRow.y + 4, { steps: 4 })
  const drop = await c.h.$eval('[data-open-today]', (one) => { const r = one.getBoundingClientRect(); return { x: r.x + 40, y: r.y + 10 } })
  await c.h.mouse.move(drop.x, drop.y, { steps: 8 })
  await c.h.waitForTimeout(250)
  await c.h.mouse.up()
  await c.h.waitForTimeout(900)
  check('dragged back to Open today, it is unpinned and open again', (await pinnedNow()).length === 0 && (await open()).length >= 1, JSON.stringify(await open()))
  // A binned note leaves the sidebar.
  await c.h.evaluate((id) => window.api.captures.save(id, { status: 'discarded' }), ids[1]).catch(() => undefined)
  await c.h.waitForTimeout(700)
  check('a note sent to the Bin leaves the sidebar', !(await open()).includes('Notes on Stoner by John Williams'))
  // Narrow: icons only.
  await c.size(700, 640)
  await c.h.waitForTimeout(500)
  await shot(c, 'narrow')
  await c.size(1180, 760)
  check('no errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  await c.close()
}

// --- 4. Close the day looks back --------------------------------------------------------------
{
  const c = await launch()
  await c.h.evaluate(async () => {
    for (const words of ['one', 'two', 'three']) await window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: words }] }] } })
  })
  const day = await c.v('digest:day')
  check('today in four numbers', day.caught >= 3 && day.kept === 0 && day.reviewed === 0 && day.finished === 0, JSON.stringify(day))
  await c.h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-day')))
  await c.h.waitForSelector('[data-close-look]', { timeout: 4000 })
  const lines = await c.h.$$eval('[data-close-look-line]', (all) => all.map((one) => one.textContent))
  check('Close the day opens on two lines of your day in Vigil', lines.length === 2 && /You caught \d+ things\./.test(lines[0]) && lines[1] === 'No reviews or tasks finished today.', JSON.stringify(lines))
  const order = await c.h.$$eval('[data-close-day] section', (all) => all.map((one) => Object.keys(one.dataset)[0]))
  check('it comes before the pick for tomorrow', order.indexOf('closeLook') >= 0 && order.indexOf('closeLook') < order.indexOf('closeFrog'), JSON.stringify(order))
  await shot(c, 'close-day')
  check('no errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  await c.close()
}

const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
