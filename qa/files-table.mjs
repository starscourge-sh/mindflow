// Files, for finding one file (user 11 Nov: "a person needs to find one file, see books/PDFs as a table, search
// images ... and find a specific recording"):
//   1. Every tab (All, Books, Images, Audio) has Display, as Review's cards do: "View as" its own view or Table, kept
//      per tab. Table: a small face, name, kind, length, size, added, opened, the notes it is in; headers sort; rows
//      open the file, take the right-click menu, ↑ ↓ Enter, ⌘A, ⇧-click, ⌫ to the Bin and ⌘Z; only rows in sight drawn.
//   2. Search reaches inside: a picture's words as the Mac read them, a recording's transcript.
//   3. All's Recent: a grid of Books-shelf cards, as many across as fit, two lines at most, "Show all" into Table by Recent.
// Frame times while scrolling 2,000 rows. Light and dark beside Review's cards in Table.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/files-table.mjs [shots]
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.argv[2]
const c = await sandbox({ width: 1440, height: 900 })
const { h, go, v, electron, size, both } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => SHOTS && both(join(SHOTS, name))
const waitFor = async (test, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await test()) return true; await wait(200) } return false }
const hash = (text) => createHash('sha256').update(text).digest('hex')

const wav = () => {
  const b = Buffer.alloc(44 + 16000)
  b.write('RIFF', 0); b.writeUInt32LE(36 + 16000, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34)
  b.write('data', 36); b.writeUInt32LE(16000, 40)
  for (let i = 0; i < 16000; i++) b[44 + i] = 128 + Math.round(90 * Math.sin(i / 6) * Math.sin(i / 900))
  return [...b]
}
const pdfBytes = (word) => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const stream = `BT /F1 28 Tf 40 300 Td (${word}) Tj ET`
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = '%PDF-1.4\n'
  const at = []
  objects.forEach((body, i) => (at.push(out.length), (out += `${i + 1} 0 obj\n${body}\nendobj\n`)))
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return [...Buffer.from(out)]
}
/** rAF gaps for `ms`, the page's scroller moved `by` px a frame (0: standing still). */
const frameTimes = (ms, by) => h.evaluate(async ([ms, by]) => {
  let el = document.querySelector('[data-files-table], [data-media-grid]')
  while (el && !/auto|scroll/.test(getComputedStyle(el).overflowY)) el = el.parentElement
  const gaps = []
  let last = performance.now()
  const end = last + ms
  let long = 0
  const watch = new PerformanceObserver((list) => (long += list.getEntries().length))
  try { watch.observe({ type: 'longtask', buffered: false }) } catch {}
  await new Promise((done) => {
    const step = (now) => {
      gaps.push(now - last)
      last = now
      if (by) {
        el.scrollTop += by
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) el.scrollTop = 0
      }
      now < end ? requestAnimationFrame(step) : done()
    }
    requestAnimationFrame(step)
  })
  watch.disconnect()
  gaps.shift()
  const s = [...gaps].sort((a, b) => a - b)
  const pick = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]
  const r = (n) => Math.round(n * 10) / 10
  return { frames: gaps.length, p50: r(pick(0.5)), p95: r(pick(0.95)), max: r(s[s.length - 1]), over34: gaps.filter((g) => g > 34).length, long }
}, [ms, by])
const store = await electron.evaluate(({ app }) => process.mainModule.require('path').join(app.getPath('userData'), 'assets'))
const write = (name, bytes) => electron.evaluate((_, [dir, name, bytes]) => { const fs = process.mainModule.require('fs'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(process.mainModule.require('path').join(dir, name), Buffer.from(bytes)) }, [store, name, bytes])
const copyAs = (from, names) => electron.evaluate((_, [dir, from, names]) => { const fs = process.mainModule.require('fs'); const p = process.mainModule.require('path'); for (const n of names) if (!fs.existsSync(p.join(dir, n))) fs.copyFileSync(p.join(dir, from), p.join(dir, n)) }, [store, from, names])
const display = async () => { await h.locator('[data-files-display] [data-display]').click(); await wait(400) }
const viewAs = async (label) => { await display(); await h.locator('[data-slot="popover-content"] button', { hasText: new RegExp(`^${label}$`) }).click(); await wait(500); await h.keyboard.press('Escape'); await wait(300) }
const tab = async (label) => { await h.locator('[data-media-kinds] button', { hasText: new RegExp(`^${label}$`) }).first().click(); await wait(700) }
const rowsDrawn = () => h.$$eval('[data-files-row]', (all) => all.length)
const names = () => h.$$eval('[data-files-row] [data-table-name]', (all) => all.map((one) => one.textContent.trim()))

try {
  await v('settings:set', { sounds: false, hintRate: 0 })

  // ── 2. Search reaches inside a picture and a recording (the real index, real notes) ──
  const words = await h.evaluate(async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 900, height: 300 })
    const pen = canvas.getContext('2d'); pen.fillStyle = '#fff'; pen.fillRect(0, 0, 900, 300)
    pen.fillStyle = '#111'; pen.font = 'bold 84px Helvetica'; pen.fillText('ZEPHYR LEDGER', 40, 180)
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
    return [...new Uint8Array(await blob.arrayBuffer())]
  })
  const picName = `${hash('zephyr-words')}.png`
  const sndName = `${hash('marmalade-sound')}.wav`
  await write(picName, words)
  await write(sndName, wav())
  const PIC = `haligtree://assets/${picName}`
  const SND = `haligtree://assets/${sndName}`
  await h.evaluate(([pic, snd]) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Thursday standup' }] },
    { type: 'image', attrs: { src: pic } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Then the call.' }] },
    { type: 'attachment', attrs: { src: snd, name: 'standup.wav', size: 16044 } },
    { type: 'paragraph', content: [{ type: 'text', text: '[0:03] we agreed the marmalade budget for spring' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '[0:09] and nothing else' }] }
  ] } }), [PIC, SND])
  await v('media:list')
  const said = await v('media:find', 'marmalade spring')
  check('a recording is found by the words in its transcript ("marmalade spring")', said.includes(SND), JSON.stringify(said))
  check('a word in no file finds nothing', (await v('media:find', 'xylophonic')).length === 0)
  // The Mac reads the picture's words once, in the background; the index has them as soon as it has.
  const read = await waitFor(async () => (await v('media:list'), (await v('media:find', 'zephyr')).includes(PIC)), 60000)
  check('a picture is found by the words the Mac read in it ("zephyr", Live Text)', read)
  check('words from two places at once: the note\'s name and the picture\'s words ("standup zephyr")', (await v('media:find', 'standup zephyr')).includes(PIC))
  // Cost: one search, measured in the page, round trip included.
  const cost = await h.evaluate(async () => { const t = performance.now(); for (let i = 0; i < 20; i++) await window.api.haligtree('media:find', `ledger ${i % 3 ? 'zephyr' : 'spring'}`); return (performance.now() - t) / 20 })
  console.log(`  cost: media:find round trip, small book: ${cost.toFixed(2)} ms`)
  await go('home')
  await go('media')
  await h.locator('[data-list-search] input, input[placeholder="Find by note, name or words"]').first().fill('marmalade')
  check('typed in Files\' search, the recording shows ("marmalade")', await waitFor(() => h.evaluate((src) => !!document.querySelector(`[data-media-grid] [data-src="${src}"]`), SND), 5000))
  await h.locator('input[placeholder="Find by note, name or words"]').fill('zephyr')
  check('typed in Files\' search, the picture shows ("zephyr")', await waitFor(() => h.evaluate((src) => !!document.querySelector(`[data-media-grid] [data-src="${src}"]`), PIC), 5000))
  await shot('files-search-inside')
  await h.locator('input[placeholder="Find by note, name or words"]').fill('')
  await wait(400)

  // ── 1b. The Table on real files: open, menu, ⌫ to the Bin and ⌘Z back ──
  const loose = join(tmpdir(), `ftab-${process.pid}.png`)
  writeFileSync(loose, Buffer.from(words.map((n, i) => (i > 200 && i < 210 ? (n + 1) % 256 : n))))
  await v('media:add', [{ path: loose }])
  await go('home'); await go('media')
  await tab('Images')
  await viewAs('Table')
  check('Images: Display\'s "View as" turns it into a table', await h.evaluate(() => !!document.querySelector('[data-files-table]')))
  const heads = await h.$$eval('[data-files-table] [data-table-head] > *', (all) => all.map((one) => one.textContent.trim()).filter(Boolean))
  check('Images\' table columns: Name, Kind, Size, Added, Opened, In', heads.join(',') === 'Name,Kind,Size,Added,Opened,In', heads.join(','))
  const free = await h.evaluate(() => [...document.querySelectorAll('[data-files-row]')].find((one) => /In no note/.test(one.textContent))?.dataset.src)
  check('the added picture is a row "In no note"', !!free, String(free))
  await h.locator(`[data-files-row][data-src="${free}"]`).click({ button: 'right' })
  await wait(400)
  const menu = await h.$$eval('[role="menu"] [role="menuitem"]', (all) => all.map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
  check('right-click a row: the same menu, "Look at it ↵" first, "Move to the Bin" in it', /^Look at it/.test(menu[0] ?? '') && menu.some((one) => /Move to the Bin/.test(one)), menu.join(' | '))
  await h.keyboard.press('Escape'); await wait(300)
  await h.locator(`[data-files-row][data-src="${free}"]`).click({ modifiers: ['Meta'] })
  await wait(200)
  await h.keyboard.press('Backspace')
  check('⌫ moves the picked row to the Bin', await waitFor(() => h.evaluate((src) => !document.querySelector(`[data-files-row][data-src="${src}"]`), free), 5000))
  await h.keyboard.press('Meta+z')
  check('⌘Z brings it back', await waitFor(() => h.evaluate((src) => !!document.querySelector(`[data-files-row][data-src="${src}"]`), free), 6000))
  // Enter on a picture's row: it lifts into the viewer.
  await h.locator(`[data-files-row][data-src="${PIC}"]`).click()
  check('a picture\'s row clicked: the picture opens in the viewer', await waitFor(() => h.evaluate(() => !!document.querySelector('.mf-look')), 4000))
  await h.keyboard.press('Escape'); await wait(800)
  await go('home'); await go('media'); await tab('Images')
  const opened = await h.evaluate((src) => document.querySelector(`[data-files-row][data-src="${src}"] [data-col="opened"]`)?.textContent.trim(), PIC)
  check('its "Opened" says it was opened today', opened === 'Today', String(opened))
  await tab('Audio')
  check('Audio keeps its own view (its list) while Images is a table', await h.evaluate(() => !document.querySelector('[data-files-table]')))
  await viewAs('Table')
  await h.locator(`[data-files-row][data-src="${SND}"]`).click()
  check('a recording\'s row clicked: it plays where it is', await waitFor(() => h.evaluate((src) => !!document.querySelector(`[data-files-row][data-src="${src}"][data-playing]`), SND), 4000))
  await h.locator(`[data-files-row][data-src="${SND}"]`).click()
  check('clicked again, it stops', await waitFor(() => h.evaluate((src) => !document.querySelector(`[data-files-row][data-src="${src}"][data-playing]`), SND), 4000))
  const length = await waitFor(() => h.evaluate((src) => /^\d+:\d\d$/.test(document.querySelector(`[data-files-row][data-src="${src}"] [data-col="length"]`)?.textContent.trim() ?? ''), SND), 8000)
  check('a recording\'s row says how long it is ("0:02")', length, await h.evaluate((src) => document.querySelector(`[data-files-row][data-src="${src}"] [data-col="length"]`)?.textContent, SND))
  await viewAs('List')
  await tab('Images')
  check('back on Images, its table was kept', await h.evaluate(() => !!document.querySelector('[data-files-table]')))
  await viewAs('Grid')

  // ── 1c. 2,000 files (the list stood in for, real files in the store) ──
  const pictures = await h.evaluate(async () => {
    const out = []
    for (let n = 0; n < 24; n++) {
      const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 240 })
      const pen = canvas.getContext('2d')
      pen.fillStyle = `hsl(${(n * 47) % 360} 42% ${38 + (n % 5) * 8}%)`; pen.fillRect(0, 0, 320, 240)
      pen.fillStyle = `hsl(${(n * 47 + 160) % 360} 50% 70%)`; pen.beginPath(); pen.arc(80 + (n % 4) * 50, 120, 50 + (n % 3) * 15, 0, 7); pen.fill()
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
      out.push([...new Uint8Array(await blob.arrayBuffer())])
    }
    return out
  })
  const base = { picture: [], pdf: [], audio: [] }
  for (const [n, bytes] of pictures.entries()) { const name = `${hash(`p${n}`)}.png`; await write(name, bytes); base.picture.push(name) }
  for (const n of [0, 1, 2, 3]) { const name = `${hash(`b${n}`)}.pdf`; await write(name, pdfBytes(['Meditations', 'Walden', 'Middlemarch', 'Leviathan'][n])); base.pdf.push(name) }
  base.audio.push(sndName)
  const note = (await v('media:list')).find((one) => one.uses.length)?.uses[0] ?? null
  const COUNT = 2000
  const files = []
  const named = { picture: [], pdf: [], audio: [] }
  for (let i = 0; i < COUNT; i++) {
    const kind = i % 50 === 3 && base.pdf.length ? 'pdf' : i % 20 === 7 ? 'audio' : 'picture'
    const end = kind === 'pdf' ? 'pdf' : kind === 'audio' ? 'wav' : 'png'
    const name = `${hash(`big${kind}${i}`)}.${end}`
    named[kind].push(name)
    const at = new Date(Date.now() - i * 1.6 * 3600_000).toISOString()
    const used = note && i % 3 !== 0
    const title = kind === 'pdf' ? ['Meditations', 'Walden', 'Middlemarch', 'Leviathan', 'Emma', 'Ulysses'][i % 6] : kind === 'audio' ? `Voice note ${i}` : `Picture ${i}`
    files.push({ src: `haligtree://assets/${name}`, kind, name: kind === 'picture' ? `${title}.png` : `${title}.${end}`, size: 1000 + ((i * 7919) % 900000), type: used ? note.type : '', id: used ? note.id : '', title: used ? note.title : '', private: false, near: '', at, uses: used ? [note] : [], added: !used, gone: false, how: 'library', ...(kind === 'audio' ? { seconds: 30 + (i % 400) } : {}), ...(i % 9 === 0 ? { openedAt: new Date(Date.now() - i * 600_000).toISOString() } : {}) })
  }
  for (const kind of ['picture', 'pdf', 'audio']) for (const [at, from] of base[kind].entries()) await copyAs(from, named[kind].filter((_, i) => i % base[kind].length === at))
  await electron.evaluate(({ ipcMain }, list) => { ipcMain.removeHandler('haligtree:media:list'); ipcMain.handle('haligtree:media:list', () => list) }, files)
  const books = files.filter((f) => f.kind === 'pdf').map((f, i) => ({ src: f.src, name: f.name, title: f.name.replace(/\.pdf$/, ''), author: '', pages: 40 + i * 13, page: null, readAt: null, addedAt: f.at, highlights: 0, gems: 0, bytes: f.size }))
  await electron.evaluate(({ ipcMain }, list) => { ipcMain.removeHandler('haligtree:pdf:library'); ipcMain.handle('haligtree:pdf:library', () => list) }, books)
  await go('home'); await go('media')
  await wait(1200)
  await tab('All')
  if (await h.evaluate(() => !!document.querySelector('[data-files-table]'))) await viewAs('Piles')

  // ── 3. Recent on All: a grid, two lines at most, "Show all" ──
  const recent = await h.evaluate(() => {
    const grid = document.querySelector('[data-files-recent-grid]')
    const cards = [...(grid?.querySelectorAll('[data-recent-file]') ?? [])]
    const lines = new Set(cards.map((one) => Math.round(one.getBoundingClientRect().top)))
    const across = getComputedStyle(grid).gridTemplateColumns.split(' ').length
    return { cards: cards.length, lines: lines.size, across, all: !!document.querySelector('[data-files-recent-all]'), titles: cards.every((one) => one.querySelector('.pdf-book-title') && one.querySelector('.pdf-book-meta')), rowGone: !document.querySelector('.files-recent-row') }
  })
  check('All\'s Recent is a grid of shelf cards (cover, title, a quiet line), not one long row', recent.cards > 0 && recent.titles && recent.rowGone, JSON.stringify(recent))
  check('Recent: as many across as fit, two lines at most, both full', recent.lines === 2 && recent.cards === recent.across * 2 && recent.across >= 6, JSON.stringify(recent))
  await shot('files-recent-1440')
  await size(560, 400)
  const narrow = await h.evaluate(() => ({ across: getComputedStyle(document.querySelector('[data-files-recent-grid]')).gridTemplateColumns.split(' ').length, sideways: document.documentElement.scrollWidth > innerWidth, cards: document.querySelectorAll('[data-recent-file]').length }))
  check('at 560 wide: fewer across, still two lines, nothing sideways', narrow.across >= 2 && narrow.cards === narrow.across * 2 && !narrow.sideways, JSON.stringify(narrow))
  await shot('files-recent-560')
  await size(1440, 900)
  await h.locator('[data-files-recent-all]').click()
  await wait(700)
  const sortSaid = await h.evaluate(() => document.querySelector('[data-files-display] [data-display]')?.textContent.replace(/\s+/g, ' ').trim())
  check('"Show all" opens Table, sorted Recent (last opened or added first)', await h.evaluate(() => !!document.querySelector('[data-files-table]')) && /Recent/.test(sortSaid ?? ''), String(sortSaid))

  // ── 1d. The table at 2,000 ──
  const drawn = await rowsDrawn()
  check(`only the rows in sight are drawn (${drawn} of ${COUNT})`, drawn > 5 && drawn < 80, String(drawn))
  check('the count says 2,000 files', await h.evaluate(() => /2,000/.test(document.body.textContent)))
  const allHeads = await h.$$eval('[data-files-table] [data-table-head] > *', (all) => all.map((one) => one.textContent.trim()).filter(Boolean))
  check('All\'s table columns: Name, Kind, Length, Size, Added, Opened, In', allHeads.join(',') === 'Name,Kind,Length,Size,Added,Opened,In', allHeads.join(','))
  check('faces come from the small caches (a picture\'s small copy, a book\'s first page)', await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-files-row] [data-cover] img').length >= 5), 8000))
  await h.locator('[data-sort-column="Name"]').click(); await wait(500)
  const az = await names()
  const sorted = (list, down) => list.every((one, i) => !i || (down ? list[i - 1].localeCompare(one, undefined, { numeric: true, sensitivity: 'base' }) >= 0 : list[i - 1].localeCompare(one, undefined, { numeric: true, sensitivity: 'base' }) <= 0))
  check('clicking "Name" sorts A to Z', sorted(az.slice(0, 15), false), az.slice(0, 4).join(', '))
  await h.locator('[data-sort-column="Name"]').click(); await wait(500)
  const za = await names()
  check('clicking it again, Z to A', sorted(za.slice(0, 15), true) && za[0] !== az[0], za.slice(0, 4).join(', '))
  await h.locator('[data-sort-column="Size"]').click(); await wait(500)
  check('"Size": the largest first, marked on its head', await h.evaluate(() => document.querySelector('[data-sort-column="Size"]')?.getAttribute('aria-sort') === 'descending'))
  await h.locator('[data-sort-column="Opened"]').click(); await wait(500)
  check('"Opened": the last opened first, its arrow pointing down', await h.evaluate(() => document.querySelector('[data-sort-column="Opened"]')?.getAttribute('aria-sort') === 'descending'))
  // Keys: ↓ moves the cursor, ⌘A takes all, Esc lets go, ⇧-click picks a run.
  await h.mouse.move(5, 5)
  for (let i = 0; i < 3; i++) await h.keyboard.press('ArrowDown')
  await wait(200)
  const at = await h.evaluate(() => [...document.querySelectorAll('[data-files-row]')].findIndex((one) => one.hasAttribute('data-cursor')))
  check('↓ three times: the fourth row is the keyboard\'s', at === 3 || at === 2, String(at))
  await h.keyboard.press('Meta+a'); await wait(300)
  check('⌘A picks all 2,000', await h.evaluate(() => /2,000 selected/.test(document.body.textContent)))
  await h.keyboard.press('Escape'); await wait(300)
  const rows = h.locator('[data-files-row]')
  await rows.nth(1).click({ modifiers: ['Meta'] })
  await rows.nth(5).click({ modifiers: ['Shift'] })
  await wait(200)
  check('⌘-click then ⇧-click picks the run (5 rows)', (await h.$$eval('[data-files-row][data-picked]', (all) => all.length)) === 5)
  await h.keyboard.press('Escape'); await wait(300)
  await shot('files-table-all-1440')

  // Frame times scrolling 2,000 rows: the page's own scroller moved 90px every frame for 4 seconds, as a fast trackpad
  // fling does. Beside it, this window standing still (what a parked window's frames are anyway) and Images' own grid
  // at the same 2,000, the list it stands beside.
  const still = await frameTimes(1500, 0)
  // PROFILE=1: where the time goes while it scrolls, by function (for finding what to cut, not a check).
  const cdp = process.env.PROFILE ? await h.context().newCDPSession(h) : null
  if (cdp) (await cdp.send('Profiler.enable'), await cdp.send('Profiler.start'))
  const rolling = await frameTimes(4000, 90)
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop')
    const self = new Map()
    const gap = profile.timeDeltas
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    profile.samples.forEach((id, i) => { const n = byId.get(id); const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(key, (self.get(key) ?? 0) + (gap[i] ?? 0) / 1000) })
    console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, ms]) => `    ${ms.toFixed(0)}ms ${k}`).join('\n'))
  }
  console.log(`  frames standing still: ${JSON.stringify(still)}`)
  console.log(`  frames scrolling the 2,000-row table: ${JSON.stringify(rolling)}`)
  await tab('Images'); await viewAs('Grid'); await wait(800)
  const grid = await frameTimes(4000, 90)
  console.log(`  frames scrolling Images' grid of 1,800 for comparison: ${JSON.stringify(grid)}`)
  // The machine is shared with other runs, so the bar is Images' own grid scrolled the same way in the same minute, plus a hard ceiling.
  check(`scrolling 2,000 rows is as smooth as Images' grid beside it, and no frame over 100ms (table p50 ${rolling.p50} p95 ${rolling.p95} max ${rolling.max}; grid p50 ${grid.p50} p95 ${grid.p95}; still p50 ${still.p50})`, rolling.p50 <= grid.p50 + 2 && rolling.p95 <= grid.p95 + 5 && rolling.max < 100, JSON.stringify({ still, rolling, grid }))

  // Books and Audio as tables at scale, each with its own length column.
  await tab('Books')
  await viewAs('Table')
  const bookHeads = await h.$$eval('[data-files-table] [data-table-head] > *', (all) => all.map((one) => one.textContent.trim()).filter(Boolean))
  check('Books\' table: Name, Pages, Size, Added, Opened, In; a page count on each', bookHeads.join(',') === 'Name,Pages,Size,Added,Opened,In' && await h.evaluate(() => [...document.querySelectorAll('[data-files-row] [data-col="length"]')].every((one) => /pages?$/.test(one.textContent))), bookHeads.join(','))
  await shot('files-table-books')
  await tab('Audio')
  await viewAs('Table')
  check('Audio\'s table: a length on each recording ("0:37")', await h.evaluate(() => [...document.querySelectorAll('[data-files-row] [data-col="length"]')].slice(0, 10).every((one) => /^\d+:\d\d$/.test(one.textContent))))
  await shot('files-table-audio')
  await size(560, 400)
  const small = await h.evaluate(() => ({ sideways: document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('[data-files-table] *')].some((one) => one.scrollWidth > one.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(one).overflowX)), name: Math.round(document.querySelector('[data-files-row] [data-table-name]')?.getBoundingClientRect().width ?? 0), tall: Math.round(document.querySelector('[data-files-row]')?.getBoundingClientRect().height ?? 0), length: (document.querySelector('[data-files-row] [data-col="length"]')?.getBoundingClientRect().width ?? 0) > 0 }))
  check('at 560 x 400 the table folds its quiet columns but keeps a recording\'s length: nothing sideways, the name keeps room, rows at least 32px', !small.sideways && small.name >= 120 && small.tall >= 32 && small.length, JSON.stringify(small))
  await shot('files-table-audio-560')
  await size(1440, 900)
  // Reload: each tab's choice is kept.
  await h.reload(); await wait(2500)
  await go('media'); await tab('Audio')
  check('after a reload, Audio is still a table', await h.evaluate(() => !!document.querySelector('[data-files-table]')))

  // Review's cards in Table, for the screenshots side by side.
  if (SHOTS) {
    await h.evaluate(() => { const was = JSON.parse(localStorage.getItem('view:cards') ?? '{"sort":"due","group":"none","filter":{}}'); localStorage.setItem('view:cards', JSON.stringify({ ...was, density: 'compact' })) })
    await go('review')
    await h.evaluate(() => document.querySelector('[data-review-tab="cards"]')?.click())
    await wait(1500)
    await shot('sibling-review-cards-table')
  }
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check(`ran to the end (${error.message.split('\n')[0]})`, false)
} finally {
  await c.close()
  done()
}
