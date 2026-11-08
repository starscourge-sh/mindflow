// A tag's own page, as a finished list page beside Gems and Sources: no
// picture behind or beside its name (a tag has no cover), its count saying
// what it counts, List by default, one left edge for head, toolbar and rows,
// nothing wider than the page at 560, 1280 and 1920, at 5, 50, 500 and 5,000
// notes, light and dark. Then every control to its end: ↓ and ↵ open a note
// and ⌘[ comes back, ⌘A picks and Esc lets go, a right click has "Read from
// here", Filter narrows, Stream and List swap, Read through opens and Esc
// shuts it, Study and ⋯ open their menus (no Backdrop), an "Often with" tag
// opens its page, and Read or Manage are steps ⌘[ and ⌘] walk.
//
//   npx electron-vite build --outDir out-tag
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-tag/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/tag-page.mjs
import { mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { DatabaseSync } from 'node:sqlite'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

// Seeded on a closed sandbox: four tags at four sizes, mixed captures and gems, one note carrying a long run of tags.
let c = await sandbox({ width: 1280, height: 860 })
await c.close()
const db = new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'))
const doc = (...lines) => JSON.stringify({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
const words = (n, s = 0) => Array.from({ length: n }, (_, i) => ['slow', 'river', 'light', 'stone', 'paper', 'garden', 'letter', 'window', 'supercalifragilisticexpialidocious'][(i + s) % 9]).join(' ')
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()
db.exec('begin')
let n = Number(db.prepare('select coalesce(max(number), 0) as n from captures').get().n)
const cap = db.prepare("insert into captures (id, number, title, kind, status, body, captured_at) values (?, ?, '', 'note', 'open', ?, ?)")
const gem = db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at) values (?, 'nugget', 'note', ?, ?, ?, ?)")
for (const size of [5, 50, 500, 5000]) {
  for (let i = 0; i < size; i++) {
    const extra = i === 1 ? ' #vocabulary #research #youtube #maliketh #idea #reading #history #a-very-long-tag-name-that-goes-on' : i % 7 === 0 ? ' #often' : ''
    if (i % 3 === 0) gem.run(randomUUID(), `${words(4, i)} ${i}`, doc(`${words(30, i)} #scale${size}${extra}`), ago(i * 41), ago(i * 41))
    else cap.run(randomUUID(), ++n, doc(`${words(i === 2 ? 60 : 8, i)} ${i}`, `${words(40, i)} #scale${size}${extra}`), ago(i * 37))
  }
}
db.exec('commit')
db.close()

c = await sandbox({ width: 1280, height: 860 })
const { h, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const open = async (tag) => { await send('tag', tag); await wait(1500) }
const blur = () => h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
const key = async (one) => { await blur(); await h.keyboard.press(one); await wait(600) }
const measure = () => h.evaluate(() => {
  const page = document.querySelector('[data-tag-page]')
  if (!page) return null
  const box = page.getBoundingClientRect()
  const left = (el) => (el ? Math.round(el.getBoundingClientRect().left) : null)
  const titleWords = document.querySelector('[data-tag-title]')
  const firstIcon = document.querySelector('[data-tag-list] [data-row] > :first-child') ?? document.querySelector('[data-tag-stream] article')
  const wide = [...page.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > box.right + 1 }).map((el) => el.tagName + '.' + String(el.className).slice(0, 40))
  let scroller = page.parentElement
  while (scroller && !(scroller.scrollHeight > scroller.clientHeight && getComputedStyle(scroller).overflowY !== 'visible')) scroller = scroller.parentElement
  return {
    head: left(titleWords), toolbar: left(document.querySelector('[data-tag-toolbar]')), row: left(firstIcon),
    wide: wide.slice(0, 3), sideways: scroller ? scroller.scrollWidth > scroller.clientWidth + 1 : false,
    pictures: page.querySelectorAll('header img, [data-backdrop]').length,
    count: document.querySelector('[data-tag-held]')?.textContent ?? '', list: !!document.querySelector('[data-tag-list]'),
    rows: document.querySelectorAll('[data-tag-list] [data-row]').length, titleSize: titleWords ? parseFloat(getComputedStyle(titleWords).fontSize) : 0
  }
})
try {
  await h.evaluate(() => localStorage.removeItem('tag:look'))
  for (const theme of ['dark', 'light']) {
    await c.look(theme)
    for (const [w, hh] of [[1280, 860], [560, 700], [1920, 1080]]) {
      await c.size(w, hh)
      for (const size of [5, 50, 500, 5000]) {
        const started = Date.now()
        await open(`scale${size}`)
        const m = await measure()
        if (!m) { check(`${theme} ${w} #scale${size}: the page shows`, false); continue }
        const tag = `${theme} ${w} #scale${size}`
        check(`${tag}: no picture in or behind the head`, m.pictures === 0)
        check(`${tag}: List is the default`, m.list)
        check(`${tag}: the count says what it counts`, new RegExp(`^${size.toLocaleString('en')} notes with #scale${size}$`).test(m.count.replace(/\s/g, ' ')), m.count)
        check(`${tag}: nothing wider than the page, no sideways scroll`, !m.wide.length && !m.sideways, m.wide.join(' | '))
        check(`${tag}: head, toolbar and rows on one left edge`, m.head !== null && Math.abs(m.head - m.toolbar) <= 2 && Math.abs(m.head - m.row) <= 14, `head ${m.head}, toolbar ${m.toolbar}, row ${m.row}`)
        if (size === 5000) check(`${tag}: only the rows in view are drawn, shown in ${Date.now() - started}ms`, m.rows > 0 && m.rows < 200, `${m.rows} rows`)
        await h.screenshot({ path: `${dir}/after-${theme}-${w}-${size}.png` })
      }
    }
  }
  await c.look('dark')
  await c.size(1280, 860)
  await open('scale50')

  // Keys: ↓ puts the cursor on a row, ↵ opens it, ⌘[ comes back to the tag.
  await h.mouse.move(5, 5)
  await key('ArrowDown')
  check('↓ puts the cursor on the first row', await h.locator('[data-tag-list] [data-cursor]').count() === 1)
  await key('ArrowDown')
  const second = await h.evaluate(() => document.querySelector('[data-tag-list] [data-cursor]')?.getAttribute('data-id'))
  await key('Enter')
  check('↵ opens the row under the cursor', !(await h.locator('[data-tag-page]').count()), second)
  await key('Meta+BracketLeft')
  await wait(800)
  check('⌘[ comes back to the tag page', await h.locator('[data-tag-page]').count() === 1)

  // ⌘A picks every row, Esc lets them go.
  await key('Meta+a')
  const bar = await h.locator('[data-picked-bar]').textContent().catch(() => '')
  check('⌘A picks all 50', /50 selected/.test(bar ?? ''), bar)
  await key('Escape')
  check('Esc lets them go', await h.locator('[data-picked-bar]').count() === 0)

  // A right click on a row: its full menu with "Read from here".
  await h.locator('[data-tag-list] [data-row]').nth(2).click({ button: 'right' })
  await wait(500)
  const menu = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  check('a right click opens the row\'s menu with "Read from here"', menu.some((one) => one.startsWith('Read from here')), `${menu.length} lines`)
  await h.screenshot({ path: `${dir}/after-row-menu.png` })
  await h.keyboard.press('Escape'); await wait(300)

  // Filter narrows, and says how many of how many.
  await h.locator('[data-tag-toolbar] input').fill('supercalifragilisticexpialidocious 4')
  await wait(600)
  const narrowed = await h.locator('[data-tag-narrowed]').textContent().catch(() => '')
  check('Filter narrows the list and says how many of how many', /of 50 shown/.test(narrowed ?? ''), narrowed)
  await h.locator('[data-tag-toolbar] input').fill('')
  await wait(500)

  // Stream and List swap, kept for next time; the stream never runs off the page.
  await h.locator('[data-tag-toolbar] button:has-text("Stream")').click()
  await wait(700)
  const stream = await measure()
  check('Stream shows the notes as text', await h.locator('[data-tag-stream] article').count() > 0)
  check('the stream stays inside the page, tags and all', !stream.wide.length && !stream.sideways, stream.wide.join(' | '))
  await h.screenshot({ path: `${dir}/after-stream-dark-1280.png` })
  await c.size(560, 700); await wait(400)
  const narrow = await measure()
  check('the stream stays inside the page at 560', !narrow.wide.length && !narrow.sideways, narrow.wide.join(' | '))
  await h.screenshot({ path: `${dir}/after-stream-dark-560.png` })
  await c.size(1280, 860)
  await h.locator('[data-tag-toolbar] button:has-text("List")').click()
  await wait(600)
  check('List comes back', await h.locator('[data-tag-list]').count() === 1)

  // Read through opens the reader; Esc shuts it.
  await h.locator('[data-tag-head] button:has-text("Read through")').click()
  await wait(900)
  const reader = await h.evaluate(() => !!document.querySelector('[data-read-through], [role="dialog"]'))
  check('Read through opens the reader', reader)
  await h.keyboard.press('Escape'); await wait(700)
  check('Esc shuts it, back on the tag', await h.evaluate(() => !document.querySelector('[data-read-through], [role="dialog"]')) && await h.locator('[data-tag-page]').count() === 1)

  // Study and ⋯: their menus, every line named; no Backdrop any more.
  await h.locator('[data-study-menu]').click(); await wait(400)
  const study = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  check('Study offers Review, Practise and Blurt', study.length === 3, study.join(' / '))
  await h.keyboard.press('Escape'); await wait(300)
  await h.locator('[data-tag-more]').click(); await wait(400)
  const more = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  check('⋯ has Rename and Colour, and no Backdrop', more.some((one) => one.startsWith('Rename')) && more.some((one) => one.startsWith('Colour')) && !more.some((one) => /Backdrop/.test(one)), more.join(' / '))
  await h.screenshot({ path: `${dir}/after-more-menu.png` })
  await h.keyboard.press('Escape'); await wait(300)

  // Often with: a tag there opens its own page.
  await h.mouse.move(900, 500); await h.mouse.wheel(0, 20000); await wait(600)
  await h.locator('[data-often-tag="often"]').click(); await wait(1500)
  check('an "Often with" tag opens its page', /#often/.test(await h.locator('[data-tag-held]').textContent().catch(() => '')))
  await h.screenshot({ path: `${dir}/after-often.png` })

  // Read and Manage are steps: ⌘[ and ⌘] walk them.
  const tabNow = () => h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button')].find((one) => one.getAttribute('aria-selected') === 'true' || one.getAttribute('aria-pressed') === 'true')?.getAttribute('aria-label') ?? '')
  await h.locator('[data-list-tabs] button[aria-label="Manage"]').click(); await wait(700)
  const a = await tabNow()
  await key('Meta+BracketLeft')
  const back = await tabNow()
  await key('Meta+BracketRight')
  const forward = await tabNow()
  check('Manage, ⌘[ is Read, ⌘] is Manage again', a === 'Manage' && back === 'Read' && forward === 'Manage', `${a}, ${back}, ${forward}`)
} catch (error) {
  check('the run finished', false, String(error.message ?? error).slice(0, 300))
}
await c.close()
const failed = results.filter((one) => !one).length
console.log(`\n${results.length - failed} of ${results.length} passed.`)
process.exit(failed ? 1 : 0)
