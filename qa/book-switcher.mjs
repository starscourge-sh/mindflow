// Switching books without a box, and a book's colour where a person looks for it.
//
// The menu under the book's name lists your books (the open one ticked, each other one press away); ⌘K lists
// them as its own second step, the one you were in last first, so ↵ ↵ flips between your last two; the box is
// left only for “Copy into which book…” and “Import into which book…”; a book's mark is a small book in its
// colour, never a dot; its colour is picked in Settings under “Your book”, from ⌘K's “Book colour…” and from a
// right-click on the book, changes what wears it in place (no band crossing the window: that is kept for
// arriving in another book), and is the same everywhere after; the Sandbox is no row among your books.
//
// In parts, so a run stays short (QA_PART): switch, colour, edges, shots, or all. The sandbox part runs when
// QA_ARGS has --sandbox, on a copy of a seeded sandbox.
//
//   npx electron-vite build --outDir out-x
//   QA_PART=switch QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/book-switcher.mjs
//   QA_ARGS=--sandbox QA_DATA=<a copy of a seeded sandbox> ... node qa/book-switcher.mjs
//   QA_PART=shots QA_SHOTS=<folder> for pictures in both looks, each beside the sibling it must match.
import { mkdirSync, mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _electron as electron } from 'playwright'

const root = process.env.QA_DATA ?? mkdtempSync(join(tmpdir(), 'haligtree-book-switcher-'))
if (root.includes('Application Support')) throw new Error('never the real data folder')
process.env.QA_DATA = root
const SANDBOXED = (process.env.QA_ARGS ?? '').includes('--sandbox')
const PART = SANDBOXED ? 'sandbox' : (process.env.QA_PART ?? 'all')
const on = (part) => PART === part || (PART === 'all' && part !== 'sandbox' && part !== 'shots')
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
// Told to stop (its turn in a queue is over), it stops at once and takes its apps with it: left to the test
// library, a stop waits for the app to quit, which an app with its restart caught never does.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => process.exit(130))
// A run that hangs says so and ends, its apps with it, instead of holding its turn.
setTimeout(() => { console.log('FAIL  the probe ran past four minutes and was stopped'); process.exit(2) }, 240_000).unref()
// The worst names a person could really give a book (60 characters is the most main keeps): long ones, one
// letter, another script, right to left, an emoji, and two books by one name.
const LONG = (n) => `Book ${String(n).padStart(2, '0')}: lectures, reading lists and loose ends of term`
const ODD = ['J', '読書ノート 📚 日々の記録', 'ملاحظات القراءة', 'Book 03: lectures, reading lists and loose ends of term']

/** The app on this data, its main window found and sized (as qa/spaces.mjs opens it: a second start shows no box to wait for). */
async function open(args = '') {
  const app = await electron.launch({ args: [process.env.QA_ENTRY ?? '.', ...args.split(' ').filter(Boolean)], env: { ...process.env, HALIGTREE_QA_AWAY: '1', HALIGTREE_USER_DATA: root } })
  const child = app.process()
  process.on('exit', () => { try { child.kill('SIGKILL') } catch {} })
  let h
  for (let i = 0; i < 150 && !h; i++) (h = app.windows().find((w) => w.url().includes('view=home'))) || (await wait(200))
  if (!h) throw new Error('no main window')
  const errors = []
  h.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  h.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)))
  await h.waitForLoadState('domcontentloaded')
  await h.waitForTimeout(1200)
  // A thing that is not there fails its line in seconds, not half a minute.
  h.setDefaultTimeout(6000)
  const v = (channel, ...rest) => h.evaluate(([c, a]) => window.api.haligtree(c, ...a), [channel, rest])
  // Asked again until the page is that wide: on a busy machine the app's own first sizing can land after the
  // first asking, and a check of a small window must never be taken on a large one. True once it is.
  const size = async (w, hh) => {
    for (let i = 0; i < 10; i++) {
      await app.evaluate(({ BrowserWindow }, [w, hh]) => { const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); win?.setBounds({ x: 40, y: 40, width: w, height: hh }); win?.show() }, [w, hh])
      await h.waitForTimeout(500)
      if (Math.abs((await h.evaluate(() => innerWidth)) - w) < 8) return true
    }
    return false
  }
  await size(1180, 760)
  const send = (type, id) => app.evaluate(({ BrowserWindow }, [type, id]) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', type, id), [type, id])
  const go = async (id) => { await send('view', id); await h.waitForTimeout(900) }
  const theme = async (name) => { await h.evaluate((n) => localStorage.setItem('theme', n), name); await h.reload(); await h.waitForTimeout(1500) }
  // With the restart caught (stub), the app cannot quit when asked to: it is given a moment, then ended.
  const close = async () => { await Promise.race([app.close().catch(() => {}), wait(2500)]); try { child.kill('SIGKILL') } catch {} }
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
// The restart is caught, not made: the next run is launched here with the arguments it was given.
const stub = (c) => c.electron.evaluate(({ app }) => {
  globalThis.__relaunched = null
  const children = process.mainModule.require('child_process')
  children.spawn = (_command, args) => (globalThis.__relaunched = args ?? [], { unref() {}, on() {}, kill() {} })
  app.relaunch = (options) => void (globalThis.__relaunched = options?.args ?? [])
  app.quit = () => void (globalThis.__quit = true)
  app.exit = () => void (globalThis.__quit = true)
})
const relaunched = async (c, tries = 80) => {
  for (let i = 0; i < tries && !(await c.electron.evaluate(() => globalThis.__relaunched)); i++) await c.h.waitForTimeout(100)
  return c.electron.evaluate(() => globalThis.__relaunched)
}
const argsOf = (args) => (args ?? []).filter((one) => one.startsWith('--book=') || one.startsWith('--sandbox')).join(' ')
const shelf = (c) => c.v('books:list')
const order = async (c) => (await shelf(c)).books.map((one) => one.id)

// --- what is on the page -------------------------------------------------------------------
const FOOT = '[aria-label="Haligtree menu"]'
const MENU = '[data-slot="dropdown-menu-content"]'
const OWN = '[data-slot="context-menu-content"]'
const BOX = '[role="dialog"][aria-label$="which book…"]'
const PALETTE = '[role="dialog"][aria-label="Search"]'
const openFoot = async (c) => { await c.h.click(FOOT); await c.h.waitForSelector(MENU, { timeout: 4000 }); await c.h.waitForTimeout(250) }
const shut = async (c) => { for (let i = 0; i < 3; i++) { await c.h.keyboard.press('Escape'); await c.h.waitForTimeout(150) } }
/** The menu's book rows, top to bottom: id, words, ticked or not, and what its mark is. */
const footRows = (c) => c.h.$$eval(`${MENU} [data-book]`, (all) => all.map((one) => {
  const mark = one.querySelector('svg[data-book-mark]')
  return { id: one.getAttribute('data-book'), name: (one.querySelector('span.truncate')?.textContent ?? one.textContent).trim(), open: !!one.querySelector('[data-book-open]'), mark: mark ? getComputedStyle(mark).color : null, hue: mark?.getAttribute('data-book-mark') ?? null, dots: one.querySelectorAll('span.rounded-full').length }
}))
/** A colour as the page paints it, for comparing a mark with the theme's own hue. */
const paint = (c, value) => c.h.evaluate((v) => { const one = document.createElement('span'); one.style.color = v; document.body.append(one); const got = getComputedStyle(one).color; one.remove(); return got }, value)
const hueNow = (c) => c.h.evaluate(() => document.documentElement.dataset.bookHue ?? null)
const washes = (c) => c.h.evaluate(() => [...(window.haligtreeWashes ?? [])])
/**
 * Before a colour is picked: from here on the page counts every band added to it (an element with
 * data-book-wash, at any frame), and lists each turn of colour and whether it eased.
 */
const watchColour = (c) => c.h.evaluate(() => {
  window.haligtreeWashes = []
  window.haligtreeTurns = []
  window.__bands = 0
  window.__bandWatch?.disconnect()
  window.__bandWatch = new MutationObserver((list) => { for (const one of list) for (const node of one.addedNodes) if (node.nodeType === 1 && (node.hasAttribute('data-book-wash') || node.querySelector('[data-book-wash]'))) window.__bands++ })
  window.__bandWatch.observe(document.documentElement, { childList: true, subtree: true })
})
const colourSeen = (c) => c.h.evaluate(() => ({ bands: window.__bands, washes: [...(window.haligtreeWashes ?? [])], turns: [...(window.haligtreeTurns ?? [])] }))
/** The crossing while it runs: which pictures of the window fade, by what keyframes, for how long. Empty if none came within half a second. */
const crossing = (c) => c.h.evaluate(() => new Promise((done) => {
  const started = performance.now()
  const look = () => {
    const found = document.getAnimations().filter((one) => one.effect?.pseudoElement?.startsWith('::view-transition')).map((one) => `${one.effect.pseudoElement} ${one.animationName} ${one.effect.getTiming().duration}`)
    if (found.length || performance.now() - started > 500) done(found)
    else requestAnimationFrame(look)
  }
  look()
}))
const count = (c, selector) => c.h.locator(selector).count()
/** ⌘K, with words typed: the label of the action the highlight is on. */
const palette = async (c, words) => {
  await c.h.evaluate(() => document.activeElement?.blur())
  await c.h.keyboard.press('Meta+k')
  await c.h.waitForSelector(PALETTE, { timeout: 4000 })
  await c.h.waitForTimeout(300)
  await c.h.keyboard.type(words)
  await c.h.waitForTimeout(500)
  return c.h.evaluate(() => document.querySelector('[data-search-at] [data-action-label]')?.textContent ?? null)
}
const actionLabels = (c) => c.h.$$eval(`${PALETTE} [data-action-label]`, (all) => all.map((one) => one.textContent))
/** ⌘K's second step: each choice's words, quiet note and mark. */
const choices = (c) => c.h.$$eval(`${PALETTE} [data-choice]`, (all) => all.map((one) => {
  const mark = one.querySelector('svg[data-book-mark]')
  return { words: one.querySelector('span.truncate')?.textContent ?? '', note: one.querySelector('[data-choice-note]')?.textContent ?? '', mark: mark ? getComputedStyle(mark).color : null, lit: one.hasAttribute('data-choice-at') }
}))
const toasted = (c, words) => c.h.waitForFunction((w) => document.body.innerText.includes(w), words, { timeout: 5000 }).then(() => true).catch(() => false)
const picture = async (c, name) => shots && c.h.screenshot({ path: join(shots, `${name}.png`) })
/** The page's own rem, in px: sizes in the checks come from it, never from a px written down here. */
const rem = (c) => c.h.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
const inWindow = (c, selector) => c.h.evaluate((s) => {
  const box = document.querySelector(s)?.getBoundingClientRect()
  return box ? { left: Math.round(box.left), top: Math.round(box.top), right: Math.round(innerWidth - box.right), bottom: Math.round(innerHeight - box.bottom), width: Math.round(box.width), height: Math.round(box.height) } : null
}, selector)

// === switch: one step from the sidebar, the order, ⌘K's flip, no box ===========================
if (on('switch')) {
  let work, reading
  {
    const c = await launch()
    try {
      // One book only: no list of one. Its name, ticked, and “New book…”.
      await openFoot(c)
      const alone = await footRows(c)
      const lines = await c.h.$$eval(`${MENU} [role="menuitem"]`, (all) => all.map((one) => one.textContent.trim()))
      check('one book only: the menu names it, ticked, with “New book…” under it', alone.length === 1 && alone[0].open && alone[0].name === 'My book' && lines[1]?.startsWith('New book…'), JSON.stringify(lines.slice(0, 3)))
      check('the menu has no “Switch book…” line and no Sandbox among the books', !lines.some((one) => /^Switch book/.test(one)) && !(await count(c, `${MENU} [data-book="sandbox"]`)) && lines.some((one) => one.startsWith('Open the sandbox…')), JSON.stringify(lines))
      await shut(c)
      const none = await palette(c, 'switch book')
      check('one book only: ⌘K offers no “Switch book…” (nothing to go to)', !(await actionLabels(c)).includes('Switch book…'), String(none))
      await shut(c)
      work = await c.v('books:create', 'Work')
      reading = await c.v('books:create', 'Reading')
      await c.v('books:color', work, 'green')
      await c.h.waitForTimeout(400)
      // One step from the sidebar: the menu, then the book. No box between.
      await stub(c)
      await openFoot(c)
      const rows = await footRows(c)
      check('the menu lists your books at its top: the open one first and ticked', rows.length === 3 && rows[0].id === 'default' && rows[0].open && !rows[1].open && !rows[2].open, JSON.stringify(rows.map((one) => [one.name, one.open])))
      await c.h.click(`${MENU} [data-book="${work}"]`)
      await c.h.waitForTimeout(300)
      const boxed = await count(c, '[role="dialog"]')
      const args = await relaunched(c)
      check('one step from the sidebar: a press on a book in the menu switches to it', argsOf(args) === `--book=${work}`, JSON.stringify(args))
      check('with no box in between', boxed === 0, `${boxed} dialogs`)
    } catch (error) {
      check('switch, part 1 ran to the end', false, String(error).slice(0, 300))
    }
    await c.close()
  }
  await wait(1000)
  {
    const c = await launch(`--book=${work}`)
    try {
      const now = await order(c)
      check('the open book is first, then the one you were just in', now[0] === work && now[1] === 'default' && now[2] === reading, JSON.stringify(now))
      const kept = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')).opened ?? {}
      check('main keeps when each book was last opened, on the shelf', kept.default > 0 && kept[work] > kept.default && kept[reading] === undefined, JSON.stringify(kept))
      await c.h.waitForTimeout(900)
      check('arriving in another book still washes once: its colour sweeps across the window, then is worn', JSON.stringify(await washes(c)) === '["green"]' && (await hueNow(c)) === 'green' && !(await count(c, '[data-book-wash]')), JSON.stringify(await washes(c)))
      await stub(c)
      const label = await palette(c, 'switch book')
      check('⌘K has “Switch book…”', label === 'Switch book…', String(label))
      await c.h.keyboard.press('Enter')
      await c.h.waitForTimeout(400)
      const list = await choices(c)
      check('it opens the books as ⌘K’s own second step, the open one left out', list.length === 2 && list[0].words === 'My book' && list[1].words === 'Reading' && list[0].lit, JSON.stringify(list))
      check('no box for switching: the list is inside ⌘K', (await count(c, BOX)) === 0 && (await count(c, PALETTE)) === 1)
      check('each book in ⌘K’s list wears its mark', list.length > 0 && list.every((one) => !!one.mark), JSON.stringify(list.map((one) => one.mark)))
      // The first choice is the one ↵ takes: its words must be drawn over the light under the rows, not under it.
      const over = await c.h.evaluate((box) => { const row = document.querySelector(`${box} [data-choice-at]`); const light = row?.parentElement?.firstElementChild; return { row: row ? getComputedStyle(row).position : null, light: light ? `${getComputedStyle(light).position} z ${getComputedStyle(light).zIndex}` : null, after: !!row && !!light && !!(light.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) } }, PALETTE)
      check('the lit choice’s words are drawn over its light (the first one is the one ↵ takes)', over.row === 'relative' && over.after, JSON.stringify(over))
      await picture(c, 'cmdk-switch-light')
      // Typing narrows it.
      await c.h.keyboard.type('read')
      await c.h.waitForTimeout(300)
      const narrowed = await choices(c)
      check('typing narrows it', narrowed.length === 1 && narrowed[0].words === 'Reading', JSON.stringify(narrowed))
      for (let i = 0; i < 4; i++) await c.h.keyboard.press('Backspace')
      await c.h.waitForTimeout(300)
      await c.h.keyboard.press('Enter')
      const args = await relaunched(c)
      check('↵ takes the first: the book you were in last', argsOf(args) === '--book=default', JSON.stringify(args))
    } catch (error) {
      check('switch, part 2 ran to the end', false, String(error).slice(0, 300))
    }
    await c.close()
  }
  await wait(1000)
  {
    const c = await launch(`--book=${reading}`)
    try {
      const now = await order(c)
      check('the order is kept after the app is opened again: Reading, then Work, then My book', now[0] === reading && now[1] === work && now[2] === 'default', JSON.stringify(now))
      await openFoot(c)
      const rows = await footRows(c)
      check('the menu keeps the same order', rows.map((one) => one.id).join() === now.join(), JSON.stringify(rows.map((one) => one.name)))
      await shut(c)
      await stub(c)
      await palette(c, 'switch book')
      await c.h.keyboard.press('Enter')
      await c.h.waitForTimeout(400)
      await c.h.keyboard.press('Enter')
      check('↵ ↵ in ⌘K goes to the book before this one (Work)', argsOf(await relaunched(c)) === `--book=${work}`)
    } catch (error) {
      check('switch, part 3 ran to the end', false, String(error).slice(0, 300))
    }
    await c.close()
  }
  await wait(1000)
  {
    const c = await launch(`--book=${work}`)
    try {
      await stub(c)
      await palette(c, 'switch book')
      await c.h.keyboard.press('Enter')
      await c.h.waitForTimeout(400)
      await c.h.keyboard.press('Enter')
      check('and ↵ ↵ again flips back (Reading): your two most recent books', argsOf(await relaunched(c)) === `--book=${reading}`)
      // The old way in does nothing: there is no box for switching.
      await c.h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:book-ask', { detail: { mode: 'switch' } })))
      await c.h.waitForTimeout(500)
      check('nothing asks “Switch to which book…” any more', (await count(c, '[role="dialog"]')) === 0)
      check('no errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
    } catch (error) {
      check('switch, part 4 ran to the end', false, String(error).slice(0, 300))
    }
    await c.close()
  }
  await wait(1000)
}

// === colour: the marks, and a colour picked three ways ===========================================
if (on('colour')) {
  const c = await launch('--book=default')
  try {
    let now = await shelf(c)
    const idOf = async (name) => (await shelf(c)).books.find((one) => one.name === name)?.id ?? (await c.v('books:create', name))
    const work = await idOf('Work')
    const reading = await idOf('Reading')
    await c.v('books:color', 'default', null)
    await c.v('books:color', work, 'green')
    await c.v('books:color', reading, null)
    await c.h.waitForTimeout(500)
    const accent = await paint(c, 'var(--mf-theme-accent)')
    const green = await paint(c, 'var(--tt-color-text-green)')
    const pink = await paint(c, 'var(--tt-color-text-pink)')
    const purple = await paint(c, 'var(--tt-color-text-purple)')

    // A mark is a small book in the book's colour.
    await openFoot(c)
    let rows = await footRows(c)
    const mine = (id) => rows.find((one) => one.id === id)
    check('a book’s mark is an icon, never a dot', rows.length >= 3 && rows.every((one) => one.mark && one.dots === 0), JSON.stringify(rows.map((one) => [one.name, one.hue, one.dots])))
    check('in the book’s colour, or the theme’s accent when it has none', mine(work)?.mark === green && mine('default')?.mark === accent && mine(reading)?.mark === accent, JSON.stringify({ work: mine(work)?.mark, green, mine: mine('default')?.mark, accent }))
    await picture(c, 'menu-light')
    {
      const row = await c.h.locator(`${MENU} [data-book="${work}"]`).boundingBox()
      await c.h.mouse.move(row.x + 30, row.y + row.height / 2); await c.h.mouse.move(row.x + 42, row.y + row.height / 2)
      await c.h.waitForTimeout(250)
      const lit = await c.h.$eval(`${MENU} [data-book="${work}"]`, (one) => ({ lit: one.hasAttribute('data-highlighted'), lines: [...one.querySelectorAll('svg[data-book-mark] *')].map((part) => getComputedStyle(part).stroke) }))
      check('a mark keeps its colour while its row is lit', lit.lit && lit.lines.length > 0 && lit.lines.every((one) => one === green), JSON.stringify(lit))
    }
    await shut(c)
    // ⌘K's other second step, the themes: its lit row's words over the light too (Esc puts the theme back).
    await palette(c, 'change theme')
    await c.h.keyboard.press('Enter')
    await c.h.waitForTimeout(400)
    const themeRow = await c.h.evaluate(() => { const row = document.querySelector('[data-theme-at]'); return row ? getComputedStyle(row).position : null })
    check('⌘K’s theme list draws its lit row’s words over the light too', themeRow === 'relative', String(themeRow))
    await shut(c)

    // 1. Settings: “Your book”, first group, this book first.
    await c.go('settings')
    await c.h.waitForTimeout(500)
    const groups = await c.h.$$eval('[data-group]', (all) => all.filter((one) => one.getClientRects().length).map((one) => one.getAttribute('data-group')))
    const firstRow = await c.h.evaluate(() => { const one = document.querySelector('[data-group="Books"] [data-setting]'); return { anchor: one?.getAttribute('data-setting-anchor'), title: one?.getAttribute('data-setting-title'), radios: one?.querySelectorAll('[role="radiogroup"][aria-label="Book colour"] [role="radio"]').length, mark: !!one?.querySelector('svg[data-book-mark]') } })
    const heading = await c.h.evaluate(() => [...document.querySelectorAll('h2')].map((one) => one.textContent.trim()).filter((one) => one === 'Your book').join())
    check('the “Books” group is under “Your book”, first there', heading === 'Your book' && groups[0] === 'Books', `${heading}: ${groups.join(', ')}`)
    check('this book at its top, with its name, its mark and its nine colours', firstRow.anchor === 'book:default' && firstRow.title === 'My book' && firstRow.radios === 9 && firstRow.mark, JSON.stringify(firstRow))
    await c.h.locator('button', { hasText: 'Import and backups' }).first().click()
    await c.h.waitForTimeout(600)
    const elsewhere = { books: await count(c, '[data-group="Books"]'), others: await c.h.$$eval('[data-group]', (all) => all.filter((one) => one.getClientRects().length).map((one) => one.getAttribute('data-group'))) }
    await c.h.locator('button', { hasText: 'Your book' }).first().click()
    await c.h.waitForTimeout(600)
    check('“Import and backups” no longer holds the books: they are under “Your book” alone', elsewhere.books === 0 && elsewhere.others.includes('Backups') && (await count(c, '[data-group="Books"]')) === 1, JSON.stringify(elsewhere))
    const sidebarTint = () => c.h.$eval('aside[data-book-tint]', (one) => getComputedStyle(one).backgroundImage)
    const tintBefore = await sidebarTint()
    // Where every row of the group and the one under it stands, to the tenth of a pixel.
    const places = () => c.h.$$eval('[data-group="Books"] [data-setting], [data-group="Books"] [role="radio"], [data-group="Your card"]', (all) => all.map((one) => { const box = one.getBoundingClientRect(); return [box.left, box.top, box.height].map((n) => Math.round(n * 10) / 10).join() }).join(' '))
    const placed = await places()
    await watchColour(c)
    await c.h.click('[data-setting-anchor="book:default"] [data-hue="pink"]')
    const faded = await crossing(c)
    await c.h.waitForTimeout(800)
    now = await shelf(c)
    let seen = await colourSeen(c)
    check('a colour picked in Settings changes what wears it in place: no band crosses the window at any frame', seen.bands === 0 && seen.washes.length === 0 && (await hueNow(c)) === 'pink' && (await sidebarTint()) !== tintBefore && (await paint(c, 'var(--primary)')) === pink, JSON.stringify(seen))
    check('nothing moves as a colour is picked: every row and swatch keeps its place and height', (await places()) === placed)
    check('it eases in over 200ms, once: one picture of the window fading into the next, nothing travelling', seen.turns.join() === 'pink:eased' && faded.includes('::view-transition-old(root) mf-plain-out 200') && faded.includes('::view-transition-new(root) mf-plain-in 200') && faded.length === 2, JSON.stringify({ turns: seen.turns, faded }))
    check('and is kept: the shelf, the tick and its name beside the swatches', now.color === 'pink' && (await c.h.$eval('[data-setting-anchor="book:default"] [data-book-colour-name]', (one) => one.textContent)) === 'Pink' && (await c.h.$eval('[data-setting-anchor="book:default"] [data-hue="pink"]', (one) => one.getAttribute('aria-checked') === 'true' && !!one.querySelector('[data-swatch="on"] svg'))))
    await picture(c, 'settings-light')
    // Found by a search.
    const found = {}
    for (const words of ['colour', 'color', 'accent', 'book']) {
      await c.h.fill('input[placeholder="Search…"]', words)
      await c.h.waitForTimeout(400)
      found[words] = await c.h.evaluate(() => !!document.querySelector('[data-setting-anchor="book:default"]')?.getClientRects().length)
    }
    await c.h.fill('input[placeholder="Search…"]', '')
    await c.h.waitForTimeout(300)
    check('Settings’ search finds it by “colour”, “color”, “accent” and “book”', Object.values(found).every(Boolean), JSON.stringify(found))
    check('no “Switch…” button: each other book’s row has “Open”', !(await c.h.evaluate(() => [...document.querySelectorAll('[data-group="Books"] button')].some((one) => one.textContent.trim() === 'Switch…'))) && (await count(c, `[data-group="Books"] [data-book-open="${work}"]`)) === 1)

    // 2. ⌘K: “Book colour…”, the nine as its second step.
    await c.go('home')
    const by = {}
    for (const words of ['accent', 'color', 'book colour']) { by[words] = (await palette(c, words), (await actionLabels(c)).includes('Book colour…')); if (words !== 'book colour') await shut(c) }
    check('⌘K has “Book colour…”, found by “accent” and “color” too', Object.values(by).every(Boolean), JSON.stringify(by))
    await c.h.evaluate(() => [...document.querySelectorAll('[data-action-label]')].find((one) => one.textContent === 'Book colour…')?.closest('button')?.click())
    await c.h.waitForTimeout(400)
    const nine = await choices(c)
    check('it opens the nine as ⌘K’s second step, the one worn said', nine.length === 9 && nine.find((one) => one.words === 'Pink')?.note === 'worn now' && nine.every((one) => !!one.mark), JSON.stringify(nine.map((one) => [one.words, one.note])))
    await picture(c, 'cmdk-colour-light')
    await watchColour(c)
    await c.h.keyboard.type('green')
    await c.h.waitForTimeout(300)
    await c.h.keyboard.press('Enter')
    await c.h.waitForTimeout(900)
    seen = await colourSeen(c)
    check('a colour picked in ⌘K changes what wears it in place, with no band, and is kept', seen.bands === 0 && seen.washes.length === 0 && (await hueNow(c)) === 'green' && (await shelf(c)).color === 'green' && (await paint(c, 'var(--primary)')) === green, JSON.stringify(seen))
    check('picked by ↵ it is simply there: nothing reached by a key moves', seen.turns.join() === 'green:at once', JSON.stringify(seen.turns))
    check('and says so, with Undo', await toasted(c, 'My book is green now'))

    // 3. A right-click on the book, in the sidebar's menu.
    await openFoot(c)
    await c.h.click(`${MENU} [data-book="default"]`, { button: 'right' })
    // Two frames on: the book's own menu is up, and the menu it was in is already gone (no fade left under it).
    const swap = await c.h.evaluate(([menu, own]) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => { const under = document.querySelector(menu); done({ own: !!document.querySelector(own), under: under ? getComputedStyle(under).display : 'gone' }) }))), [MENU, OWN])
    check('the menu it was in is gone in the same frames the book’s own menu comes: nothing fades under it', swap.own && (swap.under === 'gone' || swap.under === 'none'), JSON.stringify(swap))
    await c.h.waitForSelector(OWN, { timeout: 4000 })
    await c.h.waitForTimeout(350)
    const own = await c.h.evaluate((s) => { const menu = document.querySelector(s); return { words: [...menu.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()), heading: menu.querySelector('[data-slot="context-menu-label"]')?.textContent ?? menu.textContent.slice(0, 40), swatches: [...menu.querySelectorAll('[role="menuitemradio"]')].map((one) => [one.getAttribute('aria-label'), one.getAttribute('aria-checked')]) } }, OWN)
    check('a right-click on a book: its colour (the nine), “Rename…”, “Show in Settings”', own.swatches.length === 9 && own.words.join('|') === 'Rename…|Show in Settings' && /Colour of My book/.test(own.heading), JSON.stringify(own))
    check('the one worn is ticked there too', own.swatches.find(([name]) => name === 'Green')?.[1] === 'true' && own.swatches.filter(([, at]) => at === 'true').length === 1)
    check('one floating thing at a time: the menu it was in is gone, no card beside it', (await count(c, MENU)) === 0 && (await count(c, '[data-peek-card]')) === 0 && (await count(c, '[role="menu"]')) === 1, `${await count(c, MENU)} menus under, ${await count(c, '[role="menu"]')} in all`)
    await picture(c, 'own-menu-light')
    await watchColour(c)
    await c.h.click(`${OWN} [role="menuitemradio"][aria-label="Purple"]`)
    await c.h.waitForTimeout(900)
    seen = await colourSeen(c)
    check('a colour picked from the right-click changes what wears it in place, with no band, and is kept', seen.bands === 0 && seen.washes.length === 0 && seen.turns.join() === 'purple:eased' && (await hueNow(c)) === 'purple' && (await shelf(c)).color === 'purple', JSON.stringify(seen))
    check('and the right-click’s menu is gone with it', (await count(c, '[role="menu"]')) === 0)

    // The same everywhere after.
    await openFoot(c)
    rows = await footRows(c)
    const menuMark = mine('default')?.mark
    await shut(c)
    await palette(c, 'book colour')
    await c.h.keyboard.press('Enter')
    await c.h.waitForTimeout(400)
    const worn = (await choices(c)).find((one) => one.note === 'worn now')?.words
    await shut(c)
    await c.go('settings')
    await c.h.waitForTimeout(500)
    const said = await c.h.$eval('[data-setting-anchor="book:default"] [data-book-colour-name]', (one) => one.textContent)
    const settingsMark = await c.h.$eval('[data-setting-anchor="book:default"] svg[data-book-mark]', (one) => getComputedStyle(one).color)
    check('the colour is the same everywhere after: the menu’s mark, ⌘K’s list, Settings', menuMark === purple && worn === 'Purple' && said === 'Purple' && settingsMark === purple, JSON.stringify({ menuMark, purple, worn, said, settingsMark }))
    // A book with no colour, listed while the window wears purple: still the theme's own accent.
    check('a book with no colour keeps the theme’s own accent while the window wears another', mine(reading)?.mark === accent && accent !== purple, JSON.stringify({ reading: mine(reading)?.mark, accent, purple }))

    // Another book's colour, from its right-click: no wash here (it is not open), said, with Undo.
    await c.go('home')
    await openFoot(c)
    await c.h.click(`${MENU} [data-book="${reading}"]`, { button: 'right' })
    await c.h.waitForSelector(OWN, { timeout: 4000 })
    await c.h.waitForTimeout(300)
    await watchColour(c)
    await c.h.click(`${OWN} [role="menuitemradio"][aria-label="Blue"]`)
    await c.h.waitForTimeout(700)
    seen = await colourSeen(c)
    check('another book’s colour is set from its own right-click, and nothing this window wears changes', (await shelf(c)).books.find((one) => one.id === reading)?.color === 'blue' && seen.bands === 0 && seen.turns.length === 0 && (await hueNow(c)) === 'purple', JSON.stringify(seen))
    check('and says so, with Undo', await toasted(c, 'Reading is blue now'))
    await c.h.evaluate(() => [...document.querySelectorAll('button')].find((one) => /^Undo/.test(one.textContent.trim()))?.click())
    await c.h.waitForTimeout(600)
    check('Undo puts its colour back', (await shelf(c)).books.find((one) => one.id === reading)?.color === null)

    // “Show in Settings” and “Rename…”: there, in place.
    await openFoot(c)
    await c.h.click(`${MENU} [data-book="${reading}"]`, { button: 'right' })
    await c.h.waitForSelector(OWN, { timeout: 4000 })
    await c.h.waitForTimeout(300)
    await c.h.click(`${OWN} [role="menuitem"]:has-text("Rename…")`)
    await c.h.waitForTimeout(900)
    const naming = await c.h.evaluate((id) => { const field = document.activeElement; return { field: field?.matches('[data-name-in-place], input') && field.closest('[data-setting-anchor]')?.getAttribute('data-setting-anchor') === `book:${id}`, value: field?.value } }, reading)
    check('“Rename…” opens Settings on “Your book” with that book’s name ready to type', naming.field && naming.value === 'Reading', JSON.stringify(naming))
    await c.h.keyboard.press('Meta+a')
    await c.h.keyboard.type('Reading list')
    await c.h.keyboard.press('Enter')
    await c.h.waitForTimeout(600)
    check('typed and ↵: renamed', (await shelf(c)).books.find((one) => one.id === reading)?.name === 'Reading list')
    await c.v('books:rename', reading, 'Reading')
    await c.go('home')
    await openFoot(c)
    await c.h.click(`${MENU} [data-book="default"]`)
    await c.h.waitForTimeout(900)
    check('the open book’s row is no dead row: pressed, it shows its name and colour in Settings', (await count(c, '[data-setting-anchor="book:default"] [role="radiogroup"][aria-label="Book colour"]')) === 1 && (await count(c, MENU)) === 0)
    await c.go('home')
    await c.h.click(FOOT, { button: 'right' })
    await c.h.waitForTimeout(500)
    check('a right-click on the book’s name in the sidebar opens the same menu', (await count(c, `${OWN} [role="menuitemradio"]`)) === 9 && (await count(c, MENU)) === 0)
    await shut(c)
    // With one book's colours up, a press on another book's mark leaves one up, never two (no press is stopped
    // on its way to the document, so whatever is open hears it). The other mark in reach is the book's name.
    await openFoot(c)
    await c.h.click(`${MENU} [data-book="${reading}"]`, { button: 'right' })
    await c.h.waitForSelector(OWN, { timeout: 4000 })
    await c.h.waitForTimeout(300)
    const upFirst = await c.h.$eval(`${OWN} [data-slot="context-menu-label"]`, (one) => one.textContent)
    const foot = await c.h.locator(FOOT).boundingBox()
    await c.h.mouse.click(foot.x + foot.width / 2, foot.y + foot.height / 2)
    await c.h.waitForTimeout(350)
    const afterPress = await count(c, '[role="menu"]')
    await c.h.mouse.click(foot.x + foot.width / 2, foot.y + foot.height / 2, { button: 'right' })
    await c.h.waitForTimeout(450)
    const afterRight = { menus: await count(c, '[role="menu"]'), heading: await c.h.$eval(`${OWN} [data-slot="context-menu-label"]`, (one) => one.textContent).catch(() => '') }
    check('with one book’s colours up, a press on the book’s name leaves one menu or none, never two, and a right-click there leaves that book’s alone', /Colour of Reading/.test(upFirst) && afterPress <= 1 && afterRight.menus === 1 && /Colour of My book/.test(afterRight.heading), JSON.stringify({ upFirst, afterPress, afterRight }))
    await shut(c)
    // The same with a press on a sidebar row and on “New”: at most one thing floats after, never two.
    const floating = () => c.h.evaluate(() => [...document.querySelectorAll('[role="menu"], [role="dialog"], [data-slot="popover-content"]')].filter((one) => one.getClientRects().length && getComputedStyle(one).visibility !== 'hidden').length)
    const pressed = {}
    for (const [name, target] of [['a sidebar row', 'aside [data-sortable-id]'], ['“New”', 'button:has-text("New")']]) {
      await openFoot(c)
      await c.h.click(`${MENU} [data-book="${reading}"]`, { button: 'right' })
      await c.h.waitForSelector(OWN, { timeout: 4000 })
      await c.h.waitForTimeout(300)
      const at = await c.h.locator(target).first().boundingBox()
      await c.h.mouse.click(at.x + at.width / 2, at.y + at.height / 2)
      await c.h.waitForTimeout(450)
      pressed[name] = await floating()
      await shut(c)
    }
    check('and a press on a sidebar row or on “New” with a book’s colours up leaves one floating thing or none, never two', Object.values(pressed).length === 2 && Object.values(pressed).every((n) => n <= 1), JSON.stringify(pressed))
    await c.v('books:color', 'default', null)
    check('no errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  } catch (error) {
    check('colour ran to the end', false, String(error).slice(0, 400))
  }
  await c.close()
  await wait(1000)
}

// === edges: twelve long names, a change from elsewhere, a session, a small window, a size up ====
if (on('edges')) {
  const c = await launch('--book=default')
  try {
    const have = (await shelf(c)).books.length
    const made = []
    for (let n = have; n < 12; n++) made.push(await c.v('books:create', n >= 8 ? ODD[n - 8] : LONG(n)))
    await c.h.waitForTimeout(500)
    const all = (await shelf(c)).books
    const long = all.find((one) => one.name.startsWith('Book '))
    await stub(c)

    // Twelve books with long names.
    await openFoot(c)
    let box = await inWindow(c, MENU)
    let rows = await footRows(c)
    const cut = await c.h.$$eval(`${MENU} [data-book] span.truncate`, (all) => all.filter((one) => one.scrollWidth > one.clientWidth + 1).length)
    check('twelve books: the menu lists them all and keeps inside the window', rows.length === 12 && box.left >= 12 && box.right >= 12 && box.top >= 12 && box.bottom >= 12, JSON.stringify(box))
    check('long names are cut in their rows, the menu no wider for them (15rem)', cut >= 5 && box.width <= 15 * (await rem(c)) + 2, `${cut} cut, ${box.width}px wide at a rem of ${await rem(c)}px`)
    const odd = rows.filter((one) => ODD.includes(one.name))
    check('one letter, another script, right to left, an emoji and a name used twice each keep their row and mark', odd.length === 5 && odd.every((one) => one.mark) && rows.filter((one) => one.name === ODD[3]).length === 2 && new Set(odd.map((one) => one.id)).size === 5, JSON.stringify(odd.map((one) => one.name)))
    // On rest, the whole name: in the row's own card beside the menu, never a tip on a menu row.
    const row = await c.h.locator(`${MENU} [data-book="${long.id}"]`).boundingBox()
    await c.h.mouse.move(row.x + 30, row.y + row.height / 2)
    await c.h.mouse.move(row.x + 40, row.y + row.height / 2)
    await c.h.waitForTimeout(900)
    const card = await c.h.evaluate(() => document.querySelector('[data-peek-card]')?.textContent ?? '')
    const tips = await count(c, '[role="tooltip"]:not([data-menu-peek]), [data-title-tips]')
    check('the whole name shows on rest, in the row’s card beside the menu', card.includes(long.name), card.slice(0, 90))
    check('one hover, one surface: the card, and no tip', tips === 0 && (await count(c, '[data-peek-card]')) === 1 && (await count(c, '[role="tooltip"]')) === 1, `${tips} tips, ${await count(c, '[role="tooltip"]')} floating in all`)
    await picture(c, 'menu-twelve-light')

    // Renamed, then deleted, from elsewhere while the menu is up (main tells every window).
    await c.v('books:rename', long.id, 'Renamed while the menu is up')
    await c.h.waitForTimeout(500)
    rows = await footRows(c)
    check('a book renamed elsewhere while the menu is up is renamed in it', rows.find((one) => one.id === long.id)?.name === 'Renamed while the menu is up' && (await count(c, MENU)) === 1)
    const gone = await c.v('books:delete', long.id)
    await c.h.waitForTimeout(600)
    rows = await footRows(c)
    check('a book deleted elsewhere while the menu is up leaves it, the menu still up', !!gone && rows.length === 11 && !rows.some((one) => one.id === long.id) && (await count(c, MENU)) === 1, `${rows.length} rows`)
    await shut(c)

    // The window at its smallest.
    const small560 = await c.size(560, 400)
    check('the window is at its smallest for the next three lines: 560 by 400', small560, `${await c.h.evaluate(() => `${innerWidth} by ${innerHeight}`)}`)
    await openFoot(c)
    box = await inWindow(c, MENU)
    const scrolls = await c.h.evaluate((s) => { const menu = document.querySelector(s); const inner = [menu, ...menu.querySelectorAll('*')].find((one) => one.scrollHeight > one.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(one).overflowY)); return !!inner }, MENU)
    check('at 560 by 400 the menu keeps inside the window, and scrolls for what does not fit', box.left >= 12 && box.right >= 12 && box.top >= 12 && box.bottom >= 12 && scrolls, JSON.stringify({ ...box, scrolls }))
    await picture(c, 'menu-560-light')
    await shut(c)
    await palette(c, 'switch book')
    await c.h.keyboard.press('Enter')
    await c.h.waitForTimeout(400)
    const small = await inWindow(c, `${PALETTE} > div`)
    check('at 560 by 400 ⌘K’s list of books fits the window', (await choices(c)).length === 10 && small.left >= 0 && small.right >= 0 && small.bottom >= 0, JSON.stringify(small))
    await shut(c)
    await c.go('settings')
    await c.h.waitForTimeout(500)
    const sideways = await c.h.evaluate(() => ({ page: document.documentElement.scrollWidth - innerWidth, swatches: (() => { const one = document.querySelector('[data-setting-anchor="book:default"] [role="radiogroup"]')?.getBoundingClientRect(); return one ? Math.round(innerWidth - one.right) : null })() }))
    check('at 560 by 400 Settings’ “Your book” has no sideways scroll, its swatches all in view', sideways.page <= 0 && sideways.swatches >= 0, JSON.stringify(sideways))
    await picture(c, 'settings-560-light')
    await c.go('home')
    await c.size(1180, 760)

    // The interface a size up.
    await c.v('settings:set', { interfaceSize: 125 })
    await c.h.waitForTimeout(700)
    await openFoot(c)
    box = await inWindow(c, MENU)
    const big = await c.h.$eval(`${MENU} svg[data-book-mark]`, (one) => Math.round(one.getBoundingClientRect().width * 10) / 10)
    const up = await rem(c)
    check('a size up (125%): the menu still inside the window, its marks grown with it (0.875rem)', box.left >= 12 && box.right >= 12 && box.top >= 12 && box.bottom >= 12 && Math.abs(big - 0.875 * up) < 0.6 && up > 18, JSON.stringify({ ...box, mark: big, rem: up }))
    await picture(c, 'menu-125-light')
    await shut(c)
    await c.v('settings:set', { interfaceSize: 100 })
    await c.h.waitForTimeout(500)

    // A focus session running: the switch still asks.
    await c.v('settings:set', { focusTools: true, countIn: false })
    const task = await c.v('task:add', 'Write the essay plan')
    await c.v('session:start', task?.id ?? task, 'Write the essay plan', 40 * 60_000)
    await c.h.waitForTimeout(500)
    const other = (await shelf(c)).books.find((one) => !one.current)
    await openFoot(c)
    await c.h.click(`${MENU} [data-book="${other.id}"]`)
    await c.h.waitForSelector('[data-book-running]', { timeout: 5000 }).catch(() => undefined)
    const words = await c.h.$eval('[data-book-running]', (one) => one.textContent).catch(() => '')
    await c.h.waitForTimeout(400)
    check('a session running as you switch from the menu still asks “End it” or “Keep it running”', words.includes('A focus session is running in My book') && words.includes('End it') && words.includes('Keep it running'), words.slice(0, 120))
    check('with the menu gone under it: one floating thing', (await count(c, MENU)) === 0 && (await count(c, '[data-book-running]')) === 1, `${await count(c, MENU)} menus`)
    await picture(c, 'session-ask-light')
    await c.h.keyboard.press('Escape')
    await c.h.waitForTimeout(500)
    check('Esc stays here', !(await c.electron.evaluate(() => globalThis.__relaunched)))
    await openFoot(c)
    await c.h.click(`${MENU} [data-book="${other.id}"]`)
    await c.h.waitForSelector('[data-book-running]', { timeout: 5000 })
    await c.h.click('[data-running-choice="keep"]')
    check('“Keep it running” switches', argsOf(await relaunched(c)) === `--book=${other.id}`)
    for (const id of made) if (id !== long.id) await c.v('books:delete', id).catch(() => null)
    check('no errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  } catch (error) {
    check('edges ran to the end', false, String(error).slice(0, 400))
  }
  await c.close()
  await wait(1000)
}

// === sandbox: someone else's book, no colour to change, not a row among yours ===================
if (on('sandbox')) {
  const c = await launch('--sandbox')
  try {
    for (let i = 0; i < 300 && !(await c.v('sandbox:state'))?.seeded; i++) await c.h.waitForTimeout(500)
    await c.h.waitForTimeout(800)
    check('in the sandbox', (await shelf(c)).current === 'sandbox')
    await openFoot(c)
    const lines = await c.h.$$eval(`${MENU} [role="menuitem"]`, (all) => all.map((one) => one.textContent.trim()))
    const rows = await footRows(c)
    check('the Sandbox is not a row among your books; its own lines stay', !rows.some((one) => one.id === 'sandbox' || one.name === 'Sandbox') && lines.includes('Back to my notes') && lines.includes('Reset the sandbox') && !lines.some((one) => /^Switch book|^New book/.test(one)), JSON.stringify(lines))
    check('your books are listed there, none ticked: each a press away', rows.length >= 1 && rows.every((one) => !one.open && one.mark), JSON.stringify(rows.map((one) => [one.name, one.open])))
    await c.h.click(`${MENU} [data-book]`, { button: 'right' })
    await c.h.waitForTimeout(500)
    const own = await c.h.evaluate((s) => [...(document.querySelector(s)?.querySelectorAll('[role="menuitem"], [role="menuitemradio"]') ?? [])].map((one) => one.textContent.trim() || one.getAttribute('aria-label')), OWN)
    check('a book’s right-click offers no colour or name to change from the sandbox, only “Show in Settings”', own.join('|') === 'Show in Settings', JSON.stringify(own))
    await picture(c, 'sandbox-own-menu')
    await shut(c)
    await palette(c, 'book colour')
    const labels = await actionLabels(c)
    check('⌘K offers no “Book colour…” in the sandbox', !labels.includes('Book colour…'), labels.slice(0, 4).join(' | '))
    await shut(c)
    await c.go('settings')
    await c.h.waitForTimeout(600)
    const said = await c.h.evaluate(() => { const one = document.querySelector('[data-setting-anchor="book:sandbox"]'); return { title: one?.getAttribute('data-setting-title'), off: one?.querySelector('[data-setting-off]')?.textContent ?? '', swatches: document.querySelectorAll('[data-group="Books"] [role="radiogroup"][aria-label="Book colour"]').length } })
    check('Settings says so where the colour would be: it is someone else’s book', said.title === 'Sandbox' && /no colour to change/.test(said.off) && /someone else’s book/.test(said.off) && said.swatches === 0, JSON.stringify(said))
    await picture(c, 'sandbox-settings')
    check('no errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  } catch (error) {
    check('sandbox ran to the end', false, String(error).slice(0, 400))
  }
  await c.close()
}

// === shots: both looks, each surface beside the sibling it must match ============================
if (PART === 'shots' && shots) {
  const c = await launch(process.env.QA_BOOK ? `--book=${process.env.QA_BOOK}` : '')
  try {
    const frames = async (name, n = 7) => { for (let i = 0; i < n; i++) { await c.h.screenshot({ path: join(shots, `${name}-f${i}.png`) }); await c.h.waitForTimeout(20) } }
    for (const look of (process.env.QA_LOOKS ?? 'paper dark').split(' ')) {
      await c.theme(look)
      await c.go('home')
      const here = (await shelf(c)).books.find((one) => one.current)
      const other = (await shelf(c)).books.find((one) => !one.current)
      // The sidebar's menu, and its entrance frame by frame.
      await c.h.click(FOOT)
      await frames(`${look}-menu-open`)
      await c.h.waitForTimeout(400)
      await picture(c, `${look}-1-menu`)
      const row = await c.h.locator(`${MENU} [data-book="${other.id}"]`).boundingBox()
      await c.h.mouse.move(row.x + 30, row.y + row.height / 2); await c.h.mouse.move(row.x + 44, row.y + row.height / 2)
      await c.h.waitForTimeout(900)
      await picture(c, `${look}-1-menu-hover`)
      // Its sibling: Import's submenu, a menu of the app beside it.
      const sub = c.h.locator(`${MENU} [data-slot="dropdown-menu-sub-trigger"]`).first()
      if (await sub.count()) { await sub.hover(); await c.h.waitForTimeout(600); await picture(c, `${look}-1-menu-sibling-submenu`) }
      // A book's own menu, from a right-click.
      await c.h.click(`${MENU} [data-book="${here.id}"]`, { button: 'right' })
      await frames(`${look}-own-open`, 5)
      await c.h.waitForTimeout(400)
      await picture(c, `${look}-2-own-menu`)
      await shut(c)
      // A sibling right-click menu: a sidebar place's.
      const place = c.h.locator('aside [data-sortable-id]').first()
      if (await place.count()) { await place.click({ button: 'right' }); await c.h.waitForTimeout(500); await picture(c, `${look}-2-own-menu-sibling`); await shut(c) }
      // ⌘K's list of books, beside “Goal on screen…”, and “Book colour…”.
      await palette(c, 'switch book'); await c.h.keyboard.press('Enter'); await c.h.waitForTimeout(500)
      await picture(c, `${look}-3-cmdk-books`)
      await shut(c)
      await palette(c, 'book colour'); await c.h.keyboard.press('Enter'); await c.h.waitForTimeout(500)
      await picture(c, `${look}-3-cmdk-colour`)
      await shut(c)
      await palette(c, 'goal on screen'); await c.h.keyboard.press('Enter'); await c.h.waitForTimeout(500)
      await picture(c, `${look}-3-cmdk-sibling-goal`)
      await shut(c)
      // The box: import and copy.
      await c.h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:book-ask', { detail: { mode: 'import' } })))
      await c.h.waitForTimeout(600)
      await picture(c, `${look}-4-box-import`)
      await c.h.keyboard.type('Thesis')
      await c.h.waitForTimeout(400)
      await picture(c, `${look}-4-box-import-typed`)
      await shut(c)
      await c.h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:book-ask', { detail: { mode: 'copy', refs: [] } })))
      await c.h.waitForTimeout(600)
      await picture(c, `${look}-4-box-copy`)
      await shut(c)
      // Settings: “Your book” (a book copied while its Settings stood elsewhere opens there), and a sibling section.
      await c.go('settings')
      await c.h.waitForTimeout(700)
      await c.h.locator('button', { hasText: 'Your book' }).first().click()
      await c.h.waitForTimeout(700)
      await picture(c, `${look}-5-settings-your-book`)
      await c.h.locator('button', { hasText: 'Import and backups' }).first().click()
      await c.h.waitForTimeout(700)
      await picture(c, `${look}-5-settings-sibling`)
      await c.h.locator('button', { hasText: 'Your book' }).first().click()
      await c.h.waitForTimeout(600)
      // A colour picked: what wears it turns in place, frame by frame.
      const next = here.color === 'pink' ? 'blue' : 'pink'
      await c.h.click(`[data-setting-anchor="book:${here.id}"] [data-hue="${next}"]`)
      await frames(`${look}-turn`, 9)
      await c.h.waitForTimeout(700)
      await picture(c, `${look}-5-settings-picked`)
      await c.v('books:color', here.id, here.color)
      await c.h.waitForTimeout(700)
    }
  } catch (error) {
    check('shots ran to the end', false, String(error).slice(0, 400))
  }
  await c.close()
}

const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
