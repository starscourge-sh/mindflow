// Books, one click (user 11 Nov): a click on a cover or a name opens the book at its last-read page (page 1 if never
// opened); a click while scrubbing the cover opens at the page on show; the panel starts on the last book read and
// follows the pointer only once it rests on a book (REST, 150ms), so a sweep across the shelf changes nothing; the
// arrows move the panel's book and Enter opens it; ⌘-click picks without opening. In Table, a row opens at its page.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/books-one-click.mjs [shots]
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.argv[2]
const c = await sandbox({ width: 1440, height: 900 })
const { h, go, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const waitFor = async (test, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await test()) return true; await wait(100) } return false }
const hash = (text) => createHash('sha256').update(text).digest('hex')

/** A PDF of `count` pages, each its number in large type. */
const pdfBytes = (word, count) => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${count} >>`]
  const font = 3 + count * 2
  for (let i = 0; i < count; i++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`)
    const stream = `BT /F1 28 Tf 40 300 Td (${word} ${i + 1}) Tj ET`
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let out = '%PDF-1.4\n'
  const at = []
  objects.forEach((body, i) => (at.push(out.length), (out += `${i + 1} 0 obj\n${body}\nendobj\n`)))
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return [...Buffer.from(out)]
}
const store = await electron.evaluate(({ app }) => process.mainModule.require('path').join(app.getPath('userData'), 'assets'))
const write = (name, bytes) => electron.evaluate((_, [dir, name, bytes]) => { const fs = process.mainModule.require('fs'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(process.mainModule.require('path').join(dir, name), Buffer.from(bytes)) }, [store, name, bytes])

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const TITLES = ['Meditations', 'Walden', 'Middlemarch', 'Leviathan', 'Emma', 'Ulysses', 'Persuasion', 'Beowulf', 'Hamlet', 'Candide', 'Dracula', 'Lolita']
  const files = [], books = []
  for (const [i, title] of TITLES.entries()) {
    const name = `${hash(`book${i}`)}.pdf`
    await write(name, pdfBytes(title, 8))
    const src = `haligtree://assets/${name}`
    const at = new Date(Date.now() - i * 86400_000).toISOString()
    files.push({ src, kind: 'pdf', name: `${title}.pdf`, size: 2000, type: '', id: '', title: '', private: false, near: '', at, uses: [], added: true, gone: false, how: 'library' })
    // Walden (1) was read last, at page 5; Leviathan (3) earlier, at page 3; the rest never opened.
    const read = i === 1 ? { page: 5, readAt: new Date(Date.now() - 3600_000).toISOString() } : i === 3 ? { page: 3, readAt: new Date(Date.now() - 7200_000).toISOString() } : { page: null, readAt: null }
    books.push({ src, name: `${title}.pdf`, title, author: '', pages: 8, ...read, addedAt: at, highlights: 0, gems: 0, bytes: 2000 })
  }
  await write(`${hash('one-picture')}.png`, [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')])
  // One picture too, so Files has its kinds (with one kind alone it shows no tabs).
  files.push({ src: `haligtree://assets/${hash('one-picture')}.png`, kind: 'picture', name: 'Sketch.png', size: 100, type: '', id: '', title: '', private: false, near: '', at: new Date().toISOString(), uses: [], added: true, gone: false, how: 'library' })
  await electron.evaluate(({ ipcMain }, list) => { ipcMain.removeHandler('haligtree:media:list'); ipcMain.handle('haligtree:media:list', () => list) }, files)
  await electron.evaluate(({ ipcMain }, list) => { ipcMain.removeHandler('haligtree:pdf:library'); ipcMain.handle('haligtree:pdf:library', () => list) }, books)
  // Every book opened is written down here, as the reader is asked for it; the reader itself is not opened.
  await h.evaluate(() => { window.__opened = []; window.addEventListener('haligtree:pdf', (event) => { window.__opened.push(event.detail); event.stopImmediatePropagation() }, { capture: true }) })
  const opened = () => h.evaluate(() => window.__opened.slice())
  const clear = () => h.evaluate(() => (window.__opened.length = 0))
  const panel = () => h.evaluate(() => document.querySelector('[data-inspector]')?.getAttribute('data-inspector-book'))
  const cover = (i) => h.locator(`[data-book="${books[i].src}"]`)
  /** The shelf's own order (last read first, then newest added), as the arrows walk it. */
  const shelfOrder = () => h.$$eval('[data-book]', (all) => all.map((one) => one.getAttribute('data-book')))
  const fresh = async () => {
    await go('home'); await go('media')
    await h.locator('[data-media-kinds] button', { hasText: /^Books$/ }).first().click()
    await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-book]').length >= 12))
    await h.mouse.move(5, 5); await wait(400); await clear()
    await h.evaluate(() => { window.__log = []; const t0 = performance.now(); document.addEventListener('pointerover', (e) => { const b = e.target.closest?.('[data-book]'); b && window.__log.push(`over ${Math.round(performance.now() - t0)} ${b.textContent.slice(0, 10)} ${e.pointerType}`) }, true); new MutationObserver(() => window.__log.push(`panel ${Math.round(performance.now() - t0)} ${document.querySelector('[data-inspector] h1, [data-inspector] h2, [data-inspector] .book-head-title')?.textContent}`)).observe(document.querySelector('.pdf-library') ?? document.body, { subtree: true, attributes: true, attributeFilter: ['data-inspector-book'], childList: true }); document.addEventListener('keydown', (e) => window.__log.push(`key ${e.key} ${Math.round(performance.now() - t0)}`), true); document.addEventListener('click', (e) => window.__log.push(`click ${e.target.className} ${Math.round(performance.now() - t0)}`), true) })
  }
  const log = async (what) => console.log(`  log ${what}: ${(await h.evaluate(() => window.__log.join(' | '))).slice(0, 1500)}`)
  await fresh()

  // The panel starts on the last book read.
  check('the panel starts on the last book read (Walden), not the first on the shelf', (await panel()) === books[1].src, String(await panel()))

  // One click: open at the last-read page; never opened, page 1.
  await cover(1).locator('.pdf-book-title').click()
  let o = await opened()
  check('one click on Walden\'s name opens it at its last-read page (5)', o.length === 1 && o[0].src === books[1].src && o[0].page === 5, JSON.stringify(o))
  await fresh()
  await cover(4).locator('.pdf-book-cover').click({ position: { x: 4, y: 4 } })
  o = await opened()
  check('one click on Emma\'s cover (never opened) opens it at page 1', o.length === 1 && o[0].src === books[4].src && !o[0].page, JSON.stringify(o))

  // Scrubbed: rest on the cover, slide across, click: that page.
  await fresh()
  const box = await cover(6).locator('.pdf-book-cover').boundingBox()
  await h.mouse.move(box.x + 3, box.y + box.height / 2)
  await wait(800)
  for (let x = 3; x <= box.width * 0.7; x += 6) await h.mouse.move(box.x + x, box.y + box.height / 2)
  await wait(400)
  const showing = await h.evaluate(() => document.querySelector('[data-pdf-scrub-page]')?.textContent.trim())
  const want = Number(showing?.split('/')[0])
  await h.mouse.down(); await h.mouse.up()
  await wait(600)
  o = await opened()
  check(`a click while scrubbing Persuasion's cover opens it at the page on show (${showing})`, want > 1 && o.length === 1 && o[0].src === books[6].src && o[0].page === want, JSON.stringify({ showing, o }))

  // A sweep across the shelf: the panel never changes and no book is loaded in turn.
  await fresh()
  const before = await panel()
  await h.evaluate(() => { window.__panels = 0; const seen = new MutationObserver(() => (window.__panels += 1)); const aside = document.querySelector('[data-inspector]')?.parentElement; aside && seen.observe(aside, { childList: true, attributes: true, attributeFilter: ['data-inspector-book'] }); window.__seen = seen })
  await h.evaluate(() => document.querySelector('.pdf-library-shelf').scrollIntoView({ block: 'start' }))
  await wait(300)
  // Every card in sight, crossed in one go, as a person sweeps the pointer over the shelf.
  const boxes = await h.$$eval('[data-book]', (all) => all.map((one) => one.getBoundingClientRect()).filter((r) => r.top >= 0 && r.bottom <= innerHeight).map((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })))
  const sweepStart = Date.now()
  for (const b of boxes) await h.mouse.move(b.x, b.y, { steps: 3 })
  const sweepMs = Date.now() - sweepStart
  console.log(`  sweep: ${boxes.length} books in ${sweepMs}ms (${Math.round(sweepMs / boxes.length)}ms each)`)
  await h.mouse.move(5, 5)
  await wait(400)
  const swept = await h.evaluate(() => window.__panels)
  check(`a quick sweep across the ${boxes.length} books in sight (${Math.round(sweepMs / boxes.length)}ms each) leaves the panel as it was, with no book loaded in turn`, (await panel()) === before && swept === 0, JSON.stringify({ swept, same: (await panel()) === before }))
  // Rested on: the panel follows after REST, with its crossfade.
  const sixth = (await shelfOrder())[5]
  const target = await h.locator(`[data-book="${sixth}"]`).boundingBox()
  check('the sixth book is in sight to rest on', target.y > 0 && target.y + target.height < 900, JSON.stringify(target))
  const t0 = Date.now()
  // Timed in the page: from the pointer coming onto the book to the panel showing it.
  await h.evaluate((src) => { window.__rest = { src, over: 0, shown: 0 }; const card = document.querySelector(`[data-book="${CSS.escape(src)}"]`); card.addEventListener('pointerover', () => (window.__rest.over ||= performance.now()), { once: true }); const watch = new MutationObserver(() => { if (document.querySelector('[data-inspector]')?.getAttribute('data-inspector-book') === src && !window.__rest.shown) (window.__rest.shown = performance.now(), watch.disconnect()) }); watch.observe(document.querySelector('.pdf-library'), { subtree: true, childList: true, attributes: true }) }, sixth)
  await h.mouse.move(target.x + target.width / 2, target.y + target.height / 2)
  const moved = await waitFor(() => panel().then((src) => src === sixth), 2000)
  const took = await h.evaluate(() => Math.round(window.__rest.shown - window.__rest.over))
  void t0
  check(`rested on the sixth book, the panel shows it after the rest (${took}ms in the page, 150ms asked)`, moved && took >= 145 && took < 200, String(took))
  check('the panel comes in with a quick crossfade (fade-in, 150ms)', await h.evaluate(() => { const one = document.querySelector('[data-inspector]'); return /fade-in/.test(one.className) && getComputedStyle(one).animationDuration === '0.15s' }))
  if (SHOTS) for (const look of ['light', 'dark']) { await c.look(look); await h.screenshot({ path: join(SHOTS, `books-rest-${look}.png`) }) }
  await c.look('light')

  // Arrows move the panel's book; Enter opens it.
  await fresh()
  const order = await shelfOrder()
  const at1 = order.indexOf(books[1].src)
  const across = await h.evaluate(() => getComputedStyle(document.querySelector('.pdf-library-shelf')).gridTemplateColumns.split(' ').length)
  await h.keyboard.press('ArrowRight')
  await wait(150)
  check('→ moves the panel from Walden to the next book on the shelf', (await panel()) === order[at1 + 1], String(await panel()))
  await h.keyboard.press('ArrowDown')
  await wait(150)
  check(`↓ moves it a line down (${across} across)`, (await panel()) === order[Math.min(order.length - 1, at1 + 1 + across)])
  await h.keyboard.press('ArrowLeft'); await wait(150)
  await h.keyboard.press('ArrowUp'); await wait(150)
  check('← then ↑ come back to Walden', (await panel()) === books[1].src, String(await panel()))
  await h.keyboard.press('Enter')
  await wait(300)
  o = await opened()
  check('Enter opens the panel\'s book at its page', o.length === 1 && o[0].src === books[1].src && o[0].page === 5, JSON.stringify(o))

  // ⌘-click picks, does not open.
  await fresh()
  await cover(2).click({ modifiers: ['Meta'] })
  await cover(5).click({ modifiers: ['Meta'] })
  await wait(300)
  check('⌘-click picks two books without opening either', (await opened()).length === 0 && (await h.$$eval('[data-book][data-picked]', (all) => all.length)) === 2)
  check('and the panel shows the last one ⌘-clicked', (await panel()) === books[5].src)
  await h.keyboard.press('Escape')

  // Table: a row opens the book at its page, in one click.
  await h.locator('[data-files-display] [data-display]').click(); await wait(400)
  await h.locator('[data-slot="popover-content"] button', { hasText: /^Table$/ }).click(); await wait(500)
  await h.keyboard.press('Escape'); await wait(300); await clear()
  await h.locator(`[data-files-row][data-src="${books[3].src}"]`).click()
  o = await opened()
  check('in Table, one click on Leviathan\'s row opens it at its last-read page (3)', o.length === 1 && o[0].src === books[3].src && o[0].page === 3, JSON.stringify(o))
  await h.locator(`[data-files-row][data-src="${books[0].src}"]`).click({ modifiers: ['Meta'] })
  check('in Table, ⌘-click picks without opening', (await opened()).length === 1 && (await h.$$eval('[data-files-row][data-picked]', (all) => all.length)) === 1)
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check(`ran to the end (${error.message.split('\n')[0]})`, false)
} finally {
  await c.close()
  done()
}
