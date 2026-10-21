// Arc's spaces and sidebar in Haligtree: a book's colour (picked in the book
// switcher and in Settings, shown as dots, washed across the window, worn
// again after a switch), Recent in ⌘K (the notes opened last, newest first,
// before anything is typed; the sidebar has no Recent), and Close the day's
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
 * harness: that waits for the box, which a Haligtree started a second time no
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

// --- 3. Recent, in ⌘K -------------------------------------------------------
{
  const c = await launch()
  check('My book wears blue again on a plain start, with no wash', (await hueNow(c)) === 'blue' && (await washes(c)).length === 0)
  const ids = []
  for (const words of ['Rome trip packing list', 'Notes on Stoner by John Williams', 'Kitchen shelf measurements', 'A thought about tides']) ids.push(await c.h.evaluate((d) => window.api.captures.create({ body: d }), doc(words)))
  await c.h.waitForTimeout(600)
  // ⌘K with nothing typed: the notes under its Recent heading, top first.
  const recent = async () => {
    await c.go('home'); await c.h.evaluate(() => document.activeElement?.blur())
    await c.h.keyboard.press('Meta+k'); await c.h.waitForTimeout(900)
    const got = await c.h.evaluate(() => {
      const box = document.querySelector('[role=dialog][aria-label=Search]')
      const out = []
      let on = false
      for (const one of box?.querySelectorAll('div, [data-drag-open]') ?? []) {
        if (one.matches('div') && one.children.length === 0) on = one.textContent.trim() === 'Recent'
        else if (on && one.matches('[data-drag-open]')) out.push(one.textContent.trim())
      }
      return out
    })
    await c.h.keyboard.press('Escape'); await c.h.waitForTimeout(300)
    return got
  }
  await c.send('capture', ids[0]); await c.h.waitForTimeout(700)
  await c.send('capture', ids[1]); await c.h.waitForTimeout(900)
  let now = await recent()
  check('a note opened is first under ⌘K’s Recent, newest first', now[0]?.includes('Notes on Stoner') && now[1]?.includes('Rome trip'), JSON.stringify(now))
  await c.send('capture', ids[0]); await c.h.waitForTimeout(700)
  now = await recent()
  check('opening one again puts it on top', now[0]?.includes('Rome trip'), JSON.stringify(now))
  check('the sidebar has no Recent section', !(await c.h.evaluate(() => /\bRecent\b/.test(document.querySelector('aside')?.innerText ?? ''))))
  await shot(c, 'cmdk-recent')
  // A binned note leaves Recent.
  await c.h.evaluate((id) => window.api.captures.save(id, { status: 'discarded' }), ids[0]).catch(() => undefined)
  await c.h.waitForTimeout(700)
  check('a note sent to the Bin leaves ⌘K’s Recent', !(await recent()).some((one) => one.includes('Rome trip')))
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
  check('Close the day opens on two lines of your day in Haligtree', lines.length === 2 && /You caught \d+ things\./.test(lines[0]) && lines[1] === 'No reviews or tasks finished today.', JSON.stringify(lines))
  const order = await c.h.$$eval('[data-close-day] section', (all) => all.map((one) => Object.keys(one.dataset)[0]))
  check('it comes before the pick for tomorrow', order.indexOf('closeLook') >= 0 && order.indexOf('closeLook') < order.indexOf('closeFrog'), JSON.stringify(order))
  await shot(c, 'close-day')
  check('no errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  await c.close()
}

const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
