// Files, organised as the user asked (8 Nov: "by default it just feels like a bunch of shit was just vomited onto the
// page"): "All" opens on one pile per kind (Books, Pictures, Audio), each its newest covers fanned behind a painted,
// opaque frost with a screw at each corner, then a Recent row; the tabs are All, Books, Pictures, Audio; Pictures go by
// month in a tight square grid with no words under them, drawing only the rows in sight at 5,000; Audio is one line a
// recording, by day; "Only files in no note" is a switch beside the search, not a tab, and says what is true per kind.
// The Add box keeps 16px under the header line. Every frame light and dark, 1440 and 560 wide, 5 / 50 / 500 / 5,000.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/files-piles.mjs [shots]
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.argv[2]
const c = await sandbox({ width: 1440, height: 900 })
const { h, go, electron, size, both } = c
const shot = async (name) => SHOTS && both(join(SHOTS, name))

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
const wav = () => {
  const b = Buffer.alloc(44 + 8000)
  b.write('RIFF', 0); b.writeUInt32LE(36 + 8000, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34)
  b.write('data', 36); b.writeUInt32LE(8000, 40)
  for (let i = 0; i < 8000; i++) b[44 + i] = 128 + Math.round(90 * Math.sin(i / 6) * Math.sin(i / 900))
  return [...b]
}
const hash = (text) => createHash('sha256').update(text).digest('hex')

// Real files in the sandbox's own store: 40 small pictures, 6 PDFs and 4 recordings, each written under many names, so
// a book of 5,000 files is 5,000 real, different addresses with real small copies.
const pictures = await h.evaluate(async () => {
  const out = []
  for (let n = 0; n < 40; n++) {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240
    const pen = canvas.getContext('2d')
    pen.fillStyle = `hsl(${(n * 47) % 360} 42% ${38 + (n % 5) * 8}%)`; pen.fillRect(0, 0, 320, 240)
    pen.fillStyle = `hsl(${(n * 47 + 160) % 360} 50% 70%)`; pen.beginPath(); pen.arc(80 + (n % 4) * 50, 120, 50 + (n % 3) * 15, 0, 7); pen.fill()
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
    out.push([...new Uint8Array(await blob.arrayBuffer())])
  }
  return out
})
const store = await electron.evaluate(({ app }) => process.mainModule.require('path').join(app.getPath('userData'), 'assets'))
const write = (name, bytes) => electron.evaluate((_, [dir, name, bytes]) => { const fs = process.mainModule.require('fs'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(process.mainModule.require('path').join(dir, name), Buffer.from(bytes)) }, [store, name, bytes])
const copyAs = (from, names) => electron.evaluate((_, [dir, from, names]) => { const fs = process.mainModule.require('fs'); const p = process.mainModule.require('path'); for (const n of names) if (!fs.existsSync(p.join(dir, n))) fs.copyFileSync(p.join(dir, from), p.join(dir, n)) }, [store, from, names])
const base = { picture: [], pdf: [], audio: [] }
for (const [n, bytes] of pictures.entries()) { const name = `${hash(`p${n}`)}.png`; await write(name, bytes); base.picture.push(name) }
for (const n of [0, 1, 2, 3, 4, 5]) { const name = `${hash(`b${n}`)}.pdf`; await write(name, pdfBytes(['Meditations', 'Walden', 'Middlemarch', 'Leviathan', 'Emma', 'Ulysses'][n])); base.pdf.push(name) }
for (const n of [0, 1, 2, 3]) { const name = `${hash(`a${n}`)}.wav`; await write(name, wav()); base.audio.push(name) }
const real = await c.v('media:list')
const note = real.find((one) => one.uses.length)?.uses[0] ?? null

/** A book of `count` files: 2% books, 5% recordings, the rest pictures, spread over the last months, some in a note. */
async function book(count, going = 3) {
  const kinds = []
  for (let i = 0; i < count; i++) kinds.push(i % 50 === 3 ? 'pdf' : i % 20 === 7 ? 'audio' : 'picture')
  if (count <= 5) kinds.splice(0, 5, 'picture', 'pdf', 'audio', 'picture', 'picture')
  const files = []
  const names = { picture: [], pdf: [], audio: [] }
  for (const [i, kind] of kinds.entries()) {
    const end = kind === 'pdf' ? 'pdf' : kind === 'audio' ? 'wav' : 'png'
    const name = `${hash(`${kind}${i}`)}.${end}`
    names[kind].push(name)
    const at = new Date(Date.now() - i * (count > 500 ? 1.6 : 9) * 3600_000).toISOString()
    const used = note && i % 3 !== 0
    const title = kind === 'pdf' ? ['Meditations', 'Walden', 'Middlemarch', 'Leviathan', 'Emma', 'Ulysses'][i % 6] : kind === 'audio' ? `Voice note ${i}` : `Picture ${i}`
    files.push({ src: `haligtree://assets/${name}`, kind, name: kind === 'picture' ? '' : `${title}.${end}`, size: 1000, type: used ? note.type : '', id: used ? note.id : '', title: used ? note.title : '', private: false, near: '', at, uses: used ? [note] : [], added: !used, gone: false })
  }
  for (const kind of ['picture', 'pdf', 'audio']) {
    for (const [at, from] of base[kind].entries()) await copyAs(from, names[kind].filter((_, i) => i % base[kind].length === at))
  }
  await electron.evaluate(({ ipcMain }, list) => { ipcMain.removeHandler('haligtree:media:list'); ipcMain.handle('haligtree:media:list', () => list) }, files)
  // The shelf reads its own list: the same books, three of them part way through (Continue reading).
  const books = files.filter((f) => f.kind === 'pdf').map((f, i) => ({ src: f.src, name: f.name, title: f.name.replace(/\.pdf$/, ''), author: '', pages: 40, page: i < going ? 12 + i : null, readAt: i < going ? new Date(Date.now() - i * 3600_000).toISOString() : null, addedAt: f.at, highlights: 0, gems: 0, bytes: 1000 }))
  await electron.evaluate(({ ipcMain }, list) => { ipcMain.removeHandler('haligtree:pdf:library'); ipcMain.handle('haligtree:pdf:library', () => list) }, books)
  await go('home')
  await go('media')
  await h.waitForTimeout(1500)
  return files
}

const chips = () => h.$$eval('[data-media-kinds] button', (all) => all.map((one) => one.textContent.trim()))
const tab = async (label) => { await h.locator('[data-media-kinds] button', { hasText: new RegExp(`^${label}$`) }).first().click(); await h.waitForTimeout(700) }
const scroller = () => h.evaluate(() => { let el = document.querySelector('[data-media-grid]'); while (el && !/auto|scroll/.test(getComputedStyle(el).overflowY)) el = el.parentElement; return !!el })

try {
  for (const count of (process.env.COUNTS ?? "5,50,500,5000").split(",").filter(Boolean).map(Number)) {
    const files = await book(count)
    const want = { pdf: files.filter((f) => f.kind === 'pdf').length, picture: files.filter((f) => f.kind === 'picture').length, audio: files.filter((f) => f.kind === 'audio').length }
    // 1. All: a pile per kind, then Recent.
    const tabs = await chips()
    check(`${count}: the tabs are All, Books, Pictures, Audio`, tabs.slice(0, 4).join(',') === 'All,Books,Pictures,Audio', tabs.join(','))
    check(`${count}: "All" is on when Files opens`, await h.evaluate(() => document.querySelector('[data-media-shelf]')?.getAttribute('data-media-shelf') === 'all'))
    const piles = await h.$$eval('[data-pile]', (all) => all.map((one) => ({ id: one.dataset.pile, n: Number(one.dataset.count), text: one.textContent.trim(), covers: one.querySelectorAll('.files-pile-cover').length, screws: one.querySelectorAll('.files-pile-screw').length })))
    check(`${count}: one pile per kind, counted`, piles.length === 3 && piles.every((p) => p.n === want[p.id]), JSON.stringify(piles.map((p) => p.text)))
    check(`${count}: each pile fans its newest covers (up to 4) with four screws`, piles.length > 0 && piles.every((p) => p.covers === Math.min(4, p.n) && p.screws === 4), JSON.stringify(piles.map((p) => [p.covers, p.screws])))
    check(`${count}: each label reads as "Books · 8"`, piles.every((p) => /^(Books|Pictures|Audio) · [\d,]+$/.test(p.text.replace(/\s+/g, ' '))), piles.map((p) => p.text).join(' | '))
    const frost = await h.evaluate(() => {
      const front = document.querySelector('.files-pile-front')
      const bg = getComputedStyle(front).backgroundColor
      const blurred = [...document.querySelectorAll('[data-media-page] *, [data-pane-card] *')].filter((el) => { const b = getComputedStyle(el).backdropFilter; return b && b !== 'none' }).length
      return { bg, blurred }
    })
    check(`${count}: the frost is painted and opaque, no backdrop blur on the page`, !/rgba\(.*,\s*0?\.\d+\)$/.test(frost.bg) && !/ \/ 0?\.\d+\)$/.test(frost.bg) && frost.blurred === 0, JSON.stringify(frost))
    const recent = await h.$$eval('[data-recent-file]', (all) => all.length)
    check(`${count}: Recent holds the last ${Math.min(10, count)}`, recent === Math.min(10, count), String(recent))
    check(`${count}: no "In no note" tab among the kinds`, !(await chips()).some((t) => /no note/i.test(t)))
    check(`${count}: "Only files in no note" is a switch beside the search`, (await h.locator('[data-media-loose]:visible [role="switch"]').count()) === 1)
    // Hover a pile: it lifts, with its own sound, once.
    await h.evaluate(() => (window.haligtreeCued.length = 0))
    const pile = h.locator('[data-pile="picture"]')
    const box = await pile.boundingBox()
    const before = await h.evaluate(() => document.querySelector('[data-pile="picture"] .files-pile-box').getBoundingClientRect().top)
    await h.mouse.move(box.x + 10, box.y + 10)
    await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 })
    await h.waitForTimeout(400)
    const lift = await h.evaluate((was) => was - document.querySelector('[data-pile="picture"] .files-pile-box').getBoundingClientRect().top, before)
    const cued = await h.evaluate(() => [...window.haligtreeCued])
    check(`${count}: a pile pointed at lifts and gives its own sound once`, lift >= 2 && cued.filter((one) => one === 'fan').length === 1 && cued.length === 1, `lift ${lift}, cues ${cued.join(',')}`)
    if (count === 50) {
      // Frames through the hover: every 50ms.
      for (let f = 0; f < 6 && SHOTS; f++) { await h.mouse.move(box.x + box.width / 2 + f, box.y + box.height / 2); await h.screenshot({ path: join(SHOTS, `hover-${f}.png`), clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 } }); await h.waitForTimeout(50) }
    }
    await h.mouse.move(5, 5)
    await h.waitForTimeout(300)
    await shot(`all-${count}-1440`)
    await size(560, 700)
    await h.waitForTimeout(500)
    const wide = await h.evaluate(() => { const page = document.querySelector('[data-pane-card]') ?? document.body; return [...page.querySelectorAll('*')].filter((one) => one.scrollWidth > one.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(one).overflowX) && !one.classList.contains('files-recent-row')).length })
    check(`${count}: 560 wide, nothing scrolls sideways`, wide === 0, String(wide))
    const reach = await h.evaluate(() => {
      const card = document.querySelector('[data-pane-card]').getBoundingClientRect()
      const inside = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.width > 0 && r.left >= card.left && r.right <= card.right + 0.5 && !!hit && el.contains(hit) }
      const sw = [...document.querySelectorAll('[data-media-loose]')].find((one) => one.offsetParent)
      const covers = [...document.querySelectorAll('.files-pile-cover')].every((one) => { const r = one.getBoundingClientRect(); return r.left >= card.left - 0.5 && r.right <= card.right + 0.5 })
      return { add: inside(document.querySelector('[data-media-add]')), loose: inside(sw?.querySelector('[role="switch"]')), covers }
    })
    check(`${count}: 560 wide, "Add" and the switch are whole and take a click; no cover runs off the page`, reach.add && reach.loose && reach.covers, JSON.stringify(reach))
    await shot(`all-${count}-560`)
    await size(1440, 900)

    // 2. A pile opens its kind, as its tab does; tabs stay put.
    const tabsAt = await h.$$eval('[data-media-kinds] button', (all) => all.map((one) => Math.round(one.getBoundingClientRect().left)))
    await h.locator('[data-pile="picture"]').click()
    await h.waitForTimeout(700)
    check(`${count}: clicking the pictures pile opens Pictures`, await h.evaluate(() => document.querySelector('[data-media-shelf]')?.getAttribute('data-media-shelf') === 'picture'))
    const tabsNow = await h.$$eval('[data-media-kinds] button', (all) => all.map((one) => Math.round(one.getBoundingClientRect().left)))
    check(`${count}: the tabs do not move when the kind changes`, JSON.stringify(tabsAt) === JSON.stringify(tabsNow), `${tabsAt} vs ${tabsNow}`)

    // 3. Pictures, by month, squares with no words.
    await h.mouse.move(5, 5)
    await h.waitForTimeout(300)
    const pics = await h.evaluate(() => {
      const heads = [...document.querySelectorAll('[data-files-group]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim())
      const tiles = [...document.querySelectorAll('[data-media-grid] [data-media="picture"]')]
      const square = tiles.slice(0, 6).every((one) => { const r = one.getBoundingClientRect(); return Math.abs(r.width - r.height) < 1.5 })
      const words = tiles.slice(0, 6).some((one) => [...one.querySelectorAll('[data-square-foot]')].some((foot) => getComputedStyle(foot).opacity !== '0'))
      return { heads, drawn: tiles.length, square, words }
    })
    check(`${count}: Pictures are grouped by month with a count`, pics.heads.length > 0 && pics.heads.every((t) => /^[A-Z][a-z]+ \d{4} · [\d,]+$/.test(t)), pics.heads.slice(0, 3).join(' | '))
    check(`${count}: pictures are squares with no caption at rest`, pics.square && !pics.words, JSON.stringify(pics))
    check(`${count}: only the rows in sight are drawn`, pics.drawn <= Math.min(want.picture, 400), `${pics.drawn} of ${want.picture}`)
    await shot(`pictures-${count}-1440`)
    if (count === 5000) {
      const t0 = Date.now()
      await h.evaluate(() => { let el = document.querySelector('[data-media-grid]'); while (el && !/auto|scroll/.test(getComputedStyle(el).overflowY)) el = el.parentElement; el.scrollTop = el.scrollHeight })
      await h.waitForTimeout(600)
      const end = await h.evaluate(() => ({ drawn: document.querySelectorAll('[data-media-grid] [data-media="picture"]').length, heads: [...document.querySelectorAll('[data-files-group]')].map((one) => one.textContent.trim()).slice(-1)[0] }))
      check('5000: scrolled to the end, still only the rows in sight', end.drawn > 0 && end.drawn <= 400, `${JSON.stringify(end)} in ${Date.now() - t0}ms`)
      await shot('pictures-5000-end-1440')
    }
    // Pointed at, a picture says its name and its note in its own foot.
    const first = h.locator('[data-media-grid] [data-media="picture"]').first()
    await h.evaluate(() => { let el = document.querySelector('[data-media-grid]'); while (el && !/auto|scroll/.test(getComputedStyle(el).overflowY)) el = el.parentElement; el.scrollTop = 0 })
    await h.waitForTimeout(300)
    await first.hover()
    await h.waitForTimeout(300)
    const foot = await first.evaluate((one) => ({ op: getComputedStyle(one.querySelector('[data-square-foot]')).opacity, text: one.querySelector('[data-square-foot]').textContent }))
    check(`${count}: pointed at, a picture shows its name and its note`, foot.op === '1' && /In /.test(foot.text), JSON.stringify(foot))
    await h.mouse.move(5, 5)
    await size(560, 700)
    await shot(`pictures-${count}-560`)
    await size(1440, 900)

    // 4. Audio: one line per recording, by day.
    await tab('Audio')
    const rows = await h.evaluate(() => [...document.querySelectorAll('[data-media-grid] [data-media="audio"]')].map((one) => ({ h: one.getBoundingClientRect().height, play: !!one.querySelector('[data-sound-play]') })))
    const days = await h.$$eval('[data-files-group]', (all) => all.map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
    check(`${count}: Audio is one slim line per recording, with its player`, rows.length > 0 && rows.every((r) => r.h < 100 && r.play), JSON.stringify(rows.slice(0, 3)))
    check(`${count}: recordings grouped by day with a count`, days.length > 0 && days.every((t) => / · [\d,]+$/.test(t)), days.slice(0, 3).join(' | '))
    await shot(`audio-${count}-1440`)
    await size(560, 700)
    await shot(`audio-${count}-560`)
    await size(1440, 900)
    // "Only files in no note", in Audio: says what is true for recordings.
    await h.locator('[data-media-loose]:visible [role="switch"]').click()
    await h.waitForTimeout(500)
    const loose = await h.evaluate(() => ({ rows: document.querySelectorAll('[data-media-grid] [data-media="audio"]').length, line: document.querySelector('[data-media-nothing]')?.textContent ?? '' }))
    const looseWant = files.filter((f) => f.kind === 'audio' && !f.uses.length).length
    check(`${count}: the switch narrows Audio to recordings in no note`, looseWant ? loose.rows > 0 : /^(All [\d,]+ recordings are|The one recording here is) in a note\.$/.test(loose.line), JSON.stringify(loose))
    await h.locator('[data-media-loose]:visible [role="switch"]').click()
    await h.waitForTimeout(300)

    // 5. Books: the shelf as it was, the Continue reading row kept where the sandbox has one.
    await tab('Books')
    await h.waitForTimeout(1200)
    const shelf = await h.evaluate(() => ({ library: !!document.querySelector('[data-library]'), books: document.querySelectorAll('[data-library] [data-book]').length, going: !!document.querySelector('[data-shelf-continue]') }))
    check(`${count}: Books is the library shelf, every book on it, "Continue reading" kept at its top`, shelf.library && shelf.books === want.pdf && shelf.going, JSON.stringify(shelf))
    await shot(`books-${count}-1440`)
    // "Dark pages" on: a text cover is drawn on the dark page, and its backing is dark, not white.
    if (count === 5) {
      const ink = () => h.evaluate(() => { const img = document.querySelector('[data-library] [data-book] img'); if (!img || !img.complete) return null; const c = document.createElement('canvas'); c.width = 8; c.height = 8; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; return Math.round(sum / (d.length / 4) / 3) })
      const light = await ink()
      await h.evaluate(() => { localStorage.setItem('pdf-dark', '1'); window.dispatchEvent(new CustomEvent('haligtree:pdf-dark')) }); await h.waitForTimeout(2500)
      const dark = await ink()
      const backing = await h.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pdf-paper').trim())
      check('with "Dark pages" on, a book\'s cover is drawn dark, as its pages are', light !== null && dark !== null && dark < light - 60, `cover brightness ${light} -> ${dark}`)
      check('and its backing is the dark page, not white', backing === '#1c1a17', backing)
      await shot(`books-dark-pages`)
      await h.evaluate(() => { localStorage.setItem('pdf-dark', '0'); window.dispatchEvent(new CustomEvent('haligtree:pdf-dark')) }); await h.waitForTimeout(600)
    }
    await tab('All')
  }
  // 7. A book of 500 with eight books part way through, so "Continue reading" is the moving row, wider than the shelf.
  if (!process.env.SKIP_MORE) {
    await book(500, 8)
    const FRAMES = process.env.FRAMES
    // The page's scroller (the shelf's own on Books) and anything in the page that scrolls sideways, rows made to scroll so excepted.
    const sideways = () => h.evaluate(() => {
      const card = document.querySelector('[data-pane-card]') ?? document.body
      let page = document.querySelector('[data-shelf-scroll]') ?? document.querySelector('[data-media-grid]')
      while (page && !page.matches('[data-shelf-scroll]') && !/auto|scroll/.test(getComputedStyle(page).overflowY)) page = page.parentElement
      const own = '.files-recent-row, [data-picture-row] [role="list"], [data-flex-carousel]'
      const wide = [card, ...card.querySelectorAll('*')].filter((one) => one.scrollWidth > one.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(one).overflowX) && !one.matches(own))
      const right = page?.getBoundingClientRect().right ?? 0
      const past = page ? [...page.querySelectorAll('*')].filter((one) => !one.closest(own) && one.getBoundingClientRect().right > right + 1 && one.getBoundingClientRect().width > 0).slice(0, 3).map((one) => `${one.tagName.toLowerCase()}.${String(one.className).slice(0, 50)} ${Math.round(one.getBoundingClientRect().right - right)}px`) : []
      return { page: page ? page.scrollWidth - page.clientWidth : -1, wide: wide.map((one) => `${one.tagName.toLowerCase()}.${String(one.className).slice(0, 40)}`), past }
    })
    for (const w of [1280, 1440, 1920]) {
      await size(w, 900)
      for (const label of ['All', 'Books', 'Pictures', 'Audio']) {
        await tab(label)
        await h.waitForTimeout(label === 'Books' ? 900 : 300)
        const panel = label === 'Books' ? await h.evaluate(() => !!document.querySelector('[data-library] .book-panel')) : false
        const out = await sideways()
        check(`${w} wide, ${label}${label === 'Books' ? (panel ? ' with its panel open' : ' (no panel)') : ''}: nothing scrolls sideways`, out.page === 0 && !out.wide.length && (label !== 'Books' || panel), JSON.stringify(out))
      }
      await tab('All')
    }
    await size(1440, 900)

    // 8. Continue reading arrives once: frames every 50ms from the tab switch. The first frame it shows in already has the
    // moving row with its final book in the middle; no still row before it, no recentre after, its fade only rising.
    const film = async (name, act, ms = 2200) => {
      const frames = []
      await act()
      const t0 = Date.now()
      for (let f = 0; Date.now() - t0 < ms; f++) {
        const at = Date.now()
        frames.push(await h.evaluate(() => {
          const row = document.querySelector('[data-shelf-continue] [data-picture-row]')
          const shown = row?.querySelector('[data-picture-row-shown], .transition-opacity')
          return {
            mode: row?.getAttribute('data-picture-row') ?? 'none',
            still: row ? row.querySelectorAll('[data-still-picture]').length : 0,
            opacity: shown ? Number(getComputedStyle(shown).opacity) : row && row.querySelector('[data-still-picture], canvas') ? 1 : 0,
            active: row?.querySelector('[data-flex-carousel]')?.getAttribute('data-active') ?? '',
            caption: row?.querySelector('[data-flex-carousel-caption]')?.textContent?.trim().slice(0, 40) ?? ''
          }
        }))
        if (FRAMES) await h.screenshot({ path: join(FRAMES, `${name}-${String(f).padStart(2, '0')}.png`) })
        await h.waitForTimeout(Math.max(0, 50 - (Date.now() - at)))
      }
      const seen = frames.filter((one) => one.opacity > 0 && (one.still || one.active !== ''))
      const last = frames[frames.length - 1]
      const steady = seen.every((one) => one.mode === 'moving' && !one.still && one.active === last.active && (!one.caption || one.caption === last.caption))
      let rising = true
      for (let i = 1; i < frames.length; i++) if (frames[i].opacity + 0.01 < frames[i - 1].opacity) rising = false
      return { ok: seen.length > 0 && steady && rising && last.opacity === 1, frames: frames.map((one) => `${one.mode}/${one.still}/${one.opacity.toFixed(2)}/${one.active}`).join(' ') }
    }
    await tab('All')
    const toBooks = await film('to-books', () => h.locator('[data-media-kinds] button', { hasText: /^Books$/ }).first().click())
    check('switching to Books: "Continue reading" shows once, its final book in the middle from its first frame, faded in', toBooks.ok, toBooks.frames)
    await tab('Pictures')
    const back = await film('back-to-books', () => h.locator('[data-media-kinds] button', { hasText: /^Books$/ }).first().click())
    check('back to Books from Pictures: the same, once', back.ok, back.frames)
    // Files opened afresh on Books: another page, then Back.
    await go('home')
    const fresh = await film('open-on-books', () => h.keyboard.press('Meta+BracketLeft'))
    check('Files opened afresh on Books: the same, once', fresh.ok, fresh.frames)

    // 9. Pictures: the month's heading stays at the top while its month scrolls under it, opaque, pushed up by the next.
    await tab('Pictures')
    await h.waitForTimeout(500)
    const scrollBy = (y) => h.evaluate((y) => { let el = document.querySelector('[data-media-grid]'); while (el && !/auto|scroll/.test(getComputedStyle(el).overflowY)) el = el.parentElement; el.scrollTop += y; return el.scrollTop }, y)
    const held = () => h.evaluate(() => {
      const stuck = document.querySelector('[data-files-held]')
      let el = document.querySelector('[data-media-grid]'); while (el && !/auto|scroll/.test(getComputedStyle(el).overflowY)) el = el.parentElement
      const top = el.getBoundingClientRect().top
      // The month of the first picture showing under the heading.
      const under = [...document.querySelectorAll('[data-media-grid] [data-index]')].find((row) => row.getBoundingClientRect().bottom > top + 60 && row.querySelector('[data-media]'))
      let at = under
      while (at && !at.querySelector('[data-files-group]')) at = at.previousElementSibling
      return { text: stuck?.textContent.replace(/\s+/g, ' ').trim() ?? '', month: at?.querySelector('[data-files-group]')?.textContent.replace(/\s+/g, ' ').trim() ?? '', at: stuck ? Math.round(stuck.getBoundingClientRect().top - top) : null, bg: stuck ? getComputedStyle(stuck.parentElement).backgroundColor : '' }
    })
    check('Pictures at the top: no heading held (the first one is in its place)', !(await held()).text)
    await scrollBy(300)
    await h.waitForTimeout(200)
    const mid = await held()
    check('scrolled into a month: its heading is held at the top, opaque, naming the month under it', mid.text && mid.text === mid.month && mid.at !== null && mid.at <= 0 && !/rgba\(.*,\s*0?\.\d+\)$/.test(mid.bg), JSON.stringify(mid))
    if (FRAMES) await h.screenshot({ path: join(FRAMES, 'pictures-held.png') })
    // Scrolled till the next heading meets it: it is pushed up, never drawn over the next.
    const next = await h.evaluate(() => { let el = document.querySelector('[data-media-grid]'); while (el && !/auto|scroll/.test(getComputedStyle(el).overflowY)) el = el.parentElement; const top = el.getBoundingClientRect().top; const head = [...document.querySelectorAll('[data-files-group]')].find((one) => one.getBoundingClientRect().top > top + 10); return head ? head.getBoundingClientRect().top - top : null })
    if (next !== null) {
      await scrollBy(next - 20)
      await h.waitForTimeout(200)
      const pushed = await held()
      if (FRAMES) await h.screenshot({ path: join(FRAMES, 'pictures-pushed.png') })
      check('the next month\'s heading pushes the held one up', pushed.at !== null && pushed.at < -5, JSON.stringify(pushed))
    }
    await h.evaluate(() => { let el = document.querySelector('[data-media-grid]'); while (el && !/auto|scroll/.test(getComputedStyle(el).overflowY)) el = el.parentElement; el.scrollTop = 0 })
    await h.waitForTimeout(300)

    // 10. ↓ and ↑ go line to line over a month's heading, in the same column, onto a short line's last picture.
    await h.evaluate(() => document.activeElement?.blur())
    const where = () => h.evaluate(() => {
      const one = document.querySelector('[data-media-grid] [data-cursor]')
      if (!one) return null
      const r = one.getBoundingClientRect()
      const line = [...one.closest('.grid').children]
      return { top: Math.round(r.top + (one.closest('[data-index]').closest('[data-vlist]') ? 0 : 0)), row: Number(one.closest('[data-index]').dataset.index), col: line.indexOf(one.closest('.grid > *')), len: line.length }
    })
    // From the last column, so a month's short last line is met (the column then comes in to its last picture).
    await h.keyboard.press('ArrowRight')
    const first = await where()
    for (let i = 1; i < (first?.len ?? 1); i++) await h.keyboard.press('ArrowRight')
    await h.waitForTimeout(150)
    let now = await where()
    let crossed = 0
    let short = 0
    let ok = !!now
    const path = [now && `${now.row}:${now.col}`]
    for (let i = 0; i < 60 && ok && !(crossed >= 3 && short); i++) {
      await h.keyboard.press('ArrowDown')
      await h.waitForTimeout(100)
      const was = now
      now = await where()
      // The next line down: the row after, or after a heading's row; the same column, or a short line's last.
      const step = now.row - was.row
      if (step === 2) crossed++
      if (now.col < was.col) short++
      ok = !!now && (step === 1 || step === 2) && now.col === Math.min(was.col, now.len - 1)
      path.push(`${now.row}:${now.col}`)
    }
    check('↓ goes line by line, over each month\'s heading, keeping its column (a short line: its last)', ok && crossed > 0, `${crossed} headings crossed, ${short} short lines; ${path.join(' ')}`)
    const up = []
    let upOk = true
    for (let i = 0; i < 3; i++) {
      const was = await where()
      await h.keyboard.press('ArrowUp')
      await h.waitForTimeout(120)
      const is = await where()
      up.push(`${is.row}:${is.col}`)
      upOk &&= (was.row - is.row === 1 || was.row - is.row === 2)
    }
    check('↑ comes back the same way', upOk, up.join(' '))

    // 11. The header's controls: one height, one middle, here and on the pages beside it.
    for (const view of ['media', 'inbox', 'articles', 'nuggets', 'sources', 'goals', 'discarded']) {
      await go(view)
      await h.waitForTimeout(600)
      const boxes = await h.evaluate(() => {
        const head = [...document.querySelectorAll('section > header')].find((one) => one.offsetParent && one.querySelector('input, button'))
        if (!head) return []
        const items = [...head.querySelectorAll('label:has(input), [data-media-loose], button')].filter((one) => one.offsetParent && !one.closest('[role="switch"]') && one.getAttribute('role') !== 'switch' && one.getAttribute('role') !== 'tab' && !one.closest('[role="tablist"], [role="radiogroup"], [data-chips], [data-list-tabs]') && getComputedStyle(one).display !== 'contents' && one.getBoundingClientRect().height > 12)
        return items.map((one) => ({ what: (one.getAttribute('aria-label') || one.textContent || one.tagName).trim().slice(0, 24), h: Math.round(one.getBoundingClientRect().height), mid: Math.round(one.getBoundingClientRect().top + one.getBoundingClientRect().height / 2) }))
      })
      const tall = boxes.filter((one) => one.h >= 24)
      const one = tall.length > 0 && tall.every((b) => b.h === tall[0].h && Math.abs(b.mid - tall[0].mid) <= 1)
      check(`${view}: the header's search, switches and buttons are one height (the 28px of a field) on one middle`, one || !tall.length, JSON.stringify(boxes))
    }
    await go('media')
  }
  // 6. The Add box sits 16px under the header line.
  await h.locator('[data-media-add]').click()
  await h.waitForTimeout(400)
  const gap = await h.evaluate(() => { const box = document.querySelector('[data-media-add-box]').getBoundingClientRect(); const head = [...document.querySelectorAll('header')].map((one) => one.getBoundingClientRect()).filter((r) => r.bottom <= box.top + 1).sort((a, b) => b.bottom - a.bottom)[0]; return Math.round(box.top - head.bottom) })
  check('the Add box keeps 16px under the header line', gap >= 16, `${gap}px`)
  await shot('add-box')
  check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.join(' | ').slice(0, 400))
  void scroller
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 400))
} finally {
  await c.close()
  done()
}
