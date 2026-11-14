// Files takes any file a student or a writer drops in: a video, a Word or Pages file, a spreadsheet, a ZIP, a file
// with an ending nobody knows. Real small files made here (ffmpeg's films when it is installed, a Word file zipped from
// its minimal XML, the Mac's textutil for RTF, ODT and old Word), added through "Choose files…" and a real drop; each
// lands under its tab (Videos, Documents) with a face that is not blank, opens (a video plays with the app's own
// controls, a document shows its page with "Open in its app" and "Show in Finder"), shows in Table, is found by name,
// shows as a card with its face in a note, and is still there after a restart. Also measures making 50 faces.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/files-any-kind.mjs
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.env.SHOTS
const here = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'files-any-kind-'))
const write = (name, bytes) => (writeFileSync(join(here, name), bytes), join(here, name))
const has = (tool) => { try { execFileSync('/usr/bin/which', [tool]); return true } catch { return false } }

// ── The sample files ──
const zipOf = (name, files) => {
  const dir = mkdtempSync(join(here, 'zip-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  const out = join(here, name)
  execFileSync('/usr/bin/zip', ['-q', '-X', '-r', out, ...Object.keys(files)], { cwd: dir })
  return out
}
const docx = (name, words) => zipOf(name, {
  '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:sz w:val="56"/></w:rPr><w:t>${words}</w:t></w:r></w:p><w:p><w:r><w:t>A short essay for the seminar on Tuesday.</w:t></w:r></w:p></w:body></w:document>`
})
const xlsx = (name) => zipOf(name, {
  '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Marks" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Student</t></is></c><c r="B1"><v>72</v></c></row></sheetData></worksheet>'
})
const film = (name, args) => {
  const out = join(here, name)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=8', ...args, out])
  return out
}
const textutil = (name, format, words) => {
  const from = write(`${name}.txt`, words)
  const out = join(here, `${name}.${format}`)
  execFileSync('/usr/bin/textutil', ['-convert', format, '-output', out, from])
  return out
}
const FFMPEG = has('ffmpeg')
const videos = FFMPEG ? {
  mp4: film('Lecture clip.mp4', ['-pix_fmt', 'yuv420p', '-c:v', 'libx264']),
  mov: film('Field recording.mov', ['-pix_fmt', 'yuv420p', '-c:v', 'libx264']),
  webm: film('Screen capture.webm', ['-c:v', 'libvpx-vp9', '-b:v', '200k'])
} : {}
const documents = {
  docx: docx('Essay draft.docx', 'Essay draft on Montaigne'),
  doc: textutil('Old letter', 'doc', 'An old Word letter.'),
  rtf: textutil('Reading notes', 'rtf', 'Reading notes in rich text.'),
  odt: textutil('Open notes', 'odt', 'An OpenDocument page.'),
  txt: write('Shopping list.txt', 'Eggs\nPaper\nInk\n'),
  md: write('Outline.md', '# Outline\n\n- One\n- Two\n'),
  csv: write('Marks.csv', 'name,mark\nAda,81\nBen,74\n'),
  xlsx: xlsx('Grades.xlsx'),
  zip: zipOf('Sources.zip', { 'a.txt': 'source one', 'b.txt': 'source two' }),
  odd: write('Mystery file.qzx', 'nobody knows this kind'),
  bare: write('README', 'a file with no ending at all')
}
const noVideo = !FFMPEG
check('sample files made (ffmpeg for the films)', Object.values(documents).every(existsSync) && (noVideo || Object.values(videos).every(existsSync)), noVideo ? 'no ffmpeg: films skipped' : '')

const pickNext = (electron, paths) => electron.evaluate(({ dialog }, list) => { dialog.showOpenDialog = async () => ({ canceled: !list.length, filePaths: list }) }, paths)
async function drop(page, paths, x, y) {
  const cdp = await page.context().newCDPSession(page)
  const data = { items: [], files: paths, dragOperationsMask: 1 }
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data })
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data })
  await page.waitForTimeout(150)
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data })
  await cdp.detach()
}

let kept = []
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })
/** Frames through a change, one about every 50ms for half a second, to read by eye. */
const frames = async (name) => { if (!SHOTS) return; const t0 = Date.now(); for (let at = 0; at < 10; at++) { await h.screenshot({ path: `${SHOTS}/${name}-${String(at).padStart(2, '0')}-${Date.now() - t0}ms.png` }); const next = (at + 1) * 50 - (Date.now() - t0); if (next > 0) await wait(next) } }
const chips = () => h.$$eval('[data-page=media] [data-media-kinds] button', (all) => all.filter((one) => !one.closest('[data-media-unlinked], [data-media-decks]') && !one.hasAttribute('data-media-bin-unlinked')).map((one) => one.textContent.trim()))
const chip = async (name) => { await h.locator('[data-page=media] [data-media-kinds] button', { hasText: new RegExp(`^${name}`) }).first().click({ timeout: 5000 }); await wait(700) }
const display = async () => { await h.locator('[data-files-display] [data-display]').click(); await wait(400) }
const viewAs = async (label) => { await display(); await h.locator('[data-slot="popover-content"] button', { hasText: new RegExp(`^${label}$`) }).click(); await wait(500); await h.keyboard.press('Escape'); await wait(300) }
/** Every face on show that is drawn and not blank: a picture with pixels, a frame, a page, or the Mac's icon. */
const faces = () => h.evaluate(() => [...document.querySelectorAll('[data-page=media] [data-media]')].map((tile) => {
  const img = tile.querySelector('[data-file-face] img')
  const video = tile.querySelector('[data-file-face] video')
  return { src: tile.dataset.src, face: tile.querySelector('[data-file-face]')?.getAttribute('data-file-face') ?? null, drawn: (!!img && img.complete && img.naturalWidth > 8) || (!!video && video.readyState >= 2 && video.videoWidth > 8) }
}))

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await go('media'); await wait(900)
  const before = (await v('media:list')).length
  // ── Added through "Choose files…" (the picker's stand-in), all at once ──
  const picked = [...Object.values(videos), ...Object.values(documents)]
  await pickNext(electron, picked)
  if (!(await h.locator('[data-media-choose]').count())) await h.locator('[data-media-add]').click()
  check('"Add"\'s box says any file goes in', /Any file/.test(await h.locator('[data-media-add-box]').textContent()))
  await h.locator('[data-media-choose]').click(); await wait(2500)
  const all = await v('media:list')
  const said = await h.evaluate(() => document.body.innerText)
  check(`all ${picked.length} files added, none refused`, all.length === before + picked.length && new RegExp(`Added ${picked.length} files\\.`).test(said), `${before} → ${all.length}`)
  const of = (path) => all.find((one) => path.endsWith(one.name))
  const kindsSeen = Object.fromEntries([...Object.entries(videos), ...Object.entries(documents)].map(([end, path]) => [end, of(path)?.kind]))
  check('each video is a video', Object.keys(videos).every((end) => kindsSeen[end] === 'video'), JSON.stringify(kindsSeen))
  check('every other file is a document, whatever its ending', Object.keys(documents).every((end) => kindsSeen[end] === 'document'), JSON.stringify(kindsSeen))
  check('a file with no ending keeps its name', of(documents.bare)?.name === 'README' && /\.bin$/.test(of(documents.bare)?.src ?? ''), of(documents.bare)?.src)

  // ── Tabs: Videos and Documents after Audio ──
  await chip('All')
  const tabs = await chips()
  check('the tabs read All, …, Audio, Videos, Documents', tabs.join('|').endsWith(noVideo ? 'Documents' : 'Videos|Documents') && tabs.indexOf('Documents') > tabs.indexOf('Images'), tabs.join(' | '))
  // ── Piles on All: one for each new kind that has files ──
  const piles = await h.$$eval('[data-files-piles] [data-pile]', (all) => all.map((one) => `${one.dataset.pile}:${one.dataset.count}`))
  check('All has a pile for Videos and for Documents, with their counts', piles.includes(`document:${Object.keys(documents).length}`) && (noVideo || piles.includes(`video:${Object.keys(videos).length}`)), piles.join(' '))
  await wait(1500)
  await shot('all-piles')

  if (!noVideo) {
    await chip('Videos'); await wait(2500)
    const seen = await faces()
    check('Videos shows each video', seen.length === Object.keys(videos).length, String(seen.length))
    check('each video\'s face is a frame from it, not blank', seen.length > 0 && seen.every((one) => one.face === 'video' && one.drawn), JSON.stringify(seen))
    await shot('videos-grid')
    // ── A video opens and plays in place, with the app's own controls ──
    const mp4 = of(videos.mp4)
    await h.locator(`[data-media][data-src="${mp4.src}"]`).click()
    await frames('video-open')
    await wait(1000)
    const look = await h.evaluate(() => {
      const video = document.querySelector('[data-file-look=video] video')
      return { open: !!video, playing: !!video && !video.paused, stock: !!video?.hasAttribute('controls'), own: !!document.querySelector('[data-file-look=video] [data-video-player] [data-sound-player] .tiptap-media-play'), open2: !!document.querySelector('[data-file-look-open]'), finder: !!document.querySelector('[data-file-look-finder]') }
    })
    check('a video opens in the viewer and plays', look.open && look.playing, JSON.stringify(look))
    check('with the app\'s own controls, never the stock ones', look.own && !look.stock, JSON.stringify(look))
    check('"Open in its app" and "Show in Finder" are there', look.open2 && look.finder)
    await shot('video-look')
    await h.locator('[data-file-look=video] .tiptap-media-play').click(); await wait(300)
    check('its own pause button pauses it', await h.evaluate(() => document.querySelector('[data-file-look=video] video')?.paused === true))
    await h.keyboard.press('Escape'); await wait(500)
    check('Esc puts it away', !(await h.evaluate(() => !!document.querySelector('[data-file-look]'))))
  }

  await chip('Documents'); await wait(3000)
  const docs = await faces()
  check('Documents shows each document', docs.length === Object.keys(documents).length, String(docs.length))
  check('each document has a face: its page, or the Mac\'s icon for it', docs.every((one) => one.face && one.drawn), JSON.stringify(docs.filter((one) => !one.drawn || !one.face)))
  const pages = docs.filter((one) => one.face === 'document').length
  check('Quick Look drew a first page for most of them', pages >= Math.ceil(docs.length / 2), `${pages} pages, ${docs.length - pages} icons`)
  await shot('documents-grid')
  // ── A document opens as a preview, with "Open in its app" and "Show in Finder" ──
  const essay = of(documents.docx)
  await electron.evaluate(({ shell }) => { globalThis.qaOpened = []; shell.openPath = async (path) => (globalThis.qaOpened.push(path), '') })
  await h.locator(`[data-media][data-src="${essay.src}"]`).click()
  await frames('document-open')
  await wait(2000)
  const preview = await h.evaluate(() => ({ open: !!document.querySelector('[data-file-look=document]'), page: !!document.querySelector('[data-file-look-page]')?.naturalWidth, icon: !!document.querySelector('[data-file-look-icon]'), name: document.querySelector('[data-file-look-name]')?.textContent }))
  check('a document opens a preview of its page', preview.open && (preview.page || preview.icon), JSON.stringify(preview))
  check('named as it came', preview.name === 'Essay draft', preview.name)
  await shot('document-look')
  await h.locator('[data-file-look-open]').click(); await wait(500)
  const opened = await electron.evaluate(() => globalThis.qaOpened)
  check('"Open in its app" hands the file to the Mac', opened.length === 1 && opened[0].endsWith(essay.src.split('/').pop()), JSON.stringify(opened))
  check('and the preview goes', !(await h.evaluate(() => !!document.querySelector('[data-file-look]'))))
  // ── The right-click menu ──
  await h.locator(`[data-media][data-src="${essay.src}"]`).click({ button: 'right' }); await wait(400)
  const menu = await h.evaluate(() => [...document.querySelectorAll('[role=menu]')].at(-1)?.innerText ?? '')
  check('its menu: Preview it, Open in its app, Show in Finder, Put in a note…, Move to the Bin', ['Preview it', 'Open in its app', 'Show in Finder', 'Put in a note', 'Move to the Bin'].every((one) => menu.includes(one)), menu)
  await h.keyboard.press('Escape'); await wait(300)

  // ── Search by name ──
  const find = h.locator('[data-page=media] input[placeholder^="Find"]')
  await chip('All')
  await find.fill('essay draft'); await wait(600)
  const hits = await h.$$eval('[data-page=media] [data-media]', (all) => all.map((one) => one.dataset.src))
  check('Files\' search finds a document by its name', hits.length === 1 && hits[0] === essay.src, JSON.stringify(hits))
  await find.fill(''); await wait(400)
  const cmdk = await h.evaluate(() => window.api.captures.find('grades'))
  check('⌘K finds it too', cmdk.some((one) => one.type === 'media' && one.id.startsWith(of(documents.xlsx).src)), JSON.stringify(cmdk.map((one) => one.type)))

  // ── Table: each new kind there, with its kind word and face ──
  await chip('All')
  await viewAs('Table'); await wait(1500)
  const rows = await h.$$eval('[data-files-row]', (all) => all.map((one) => ({ src: one.dataset.src, kind: one.querySelector('[data-col=kind]')?.textContent, face: !!one.querySelector('[data-file-face] img') })))
  const want = [...Object.values(videos), ...Object.values(documents)].map((path) => of(path).src)
  check('Table lists every new file', want.every((src) => rows.some((one) => one.src === src)), `${rows.length} rows`)
  check('with its kind in a word (Video, DOCX, ZIP, File)', rows.find((one) => one.src === essay.src)?.kind === 'DOCX' && rows.find((one) => one.src === of(documents.zip).src)?.kind === 'ZIP' && rows.find((one) => one.src === of(documents.bare).src)?.kind === 'File' && (noVideo || rows.find((one) => one.src === of(videos.mp4).src)?.kind === 'Video'), JSON.stringify(rows.filter((one) => want.includes(one.src)).map((one) => one.kind)))
  await shot('table')
  await display()
  // Display's Kind filter: its choices are in its own menu.
  await h.locator('[data-slot="popover-content"] button', { hasText: /^All$/ }).first().click(); await wait(400)
  const facets = await h.evaluate(() => [...document.querySelectorAll('[role=menu], [role=listbox], [data-slot="popover-content"]')].map((one) => one.innerText).join(' '))
  check('Display filters by the new kinds', /Documents/.test(facets) && (noVideo || /Videos/.test(facets)), facets.replace(/\s+/g, ' ').slice(0, 300))
  await h.keyboard.press('Escape'); await wait(200)
  await h.keyboard.press('Escape'); await wait(300)
  await viewAs('Piles')

  // ── Light and dark, beside Images (the sibling grid), and at the smallest window ──
  if (SHOTS) {
    // The app's own themes: Paper (its light one) and Dark, set as Settings sets them.
    const theme = async (one) => { await h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, one === 'dark' ? 'dark' : 'paper'); await wait(900) }
    for (const one of ['light', 'dark']) {
      await theme(one)
      for (const tab of ['Images', ...(noVideo ? [] : ['Videos']), 'Documents']) { await chip(tab); await wait(1200); await shot(`${tab.toLowerCase()}-grid-${one}`) }
      await viewAs('Table'); await wait(1000); await shot(`documents-table-${one}`); await viewAs('Grid')
      await chip('All'); await wait(1200); await shot(`all-piles-${one}`)
      await viewAs('Table'); await wait(1000); await shot(`all-table-${one}`); await viewAs('Piles')
    }
    await theme('light')
    const size = await electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); const was = w.getSize(); w.setSize(560, 400); return was })
    await wait(800); await chip('Documents'); await wait(1000); await shot('documents-grid-small')
    await electron.evaluate(({ BrowserWindow }, was) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')).setSize(...was), size)
    await wait(800)
  }

  // ── A real drop on the page ──
  const late = docx('Dropped chapter.docx', 'Chapter three')
  const box = await h.locator('[data-page=media]').boundingBox()
  await drop(h, [late], box.x + box.width / 2, box.y + box.height / 2); await wait(1500)
  check('a real drop of a Word file adds it', (await v('media:list')).some((one) => one.name === 'Dropped chapter.docx' && one.kind === 'document'))

  // ── In a note: a card with its face; a video plays there ──
  const blocks = [documents.docx, ...(noVideo ? [] : [videos.mp4])].map((path) => of(path)).map((one) => ({ type: 'attachment', attrs: { src: one.src, name: one.name, size: one.size } }))
  const noteId = await h.evaluate((content) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Seminar pack' }] }, ...content] } }), blocks)
  await wait(500)
  await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:open', { detail: { type: 'capture', id } })), noteId); await wait(2500)
  const inNote = await h.evaluate(() => {
    const card = document.querySelector('[data-pane] .tiptap-attachment:not(.is-video) [data-attachment-face]')
    const img = card?.querySelector('img')
    return { card: !!card, face: card?.getAttribute('data-attachment-face'), drawn: !!img && img.naturalWidth > 8, words: card?.closest('.tiptap-attachment')?.innerText.replace(/\s+/g, ' '), video: !!document.querySelector('[data-pane] .tiptap-attachment.is-video video'), stock: !!document.querySelector('[data-pane] .tiptap-attachment.is-video video[controls]') }
  })
  check('a document in a note is a card with its face', inNote.card && inNote.drawn && /Essay draft\.docx/.test(inNote.words) && /DOCX/.test(inNote.words), JSON.stringify(inNote))
  if (!noVideo) check('a video in a note plays there, under the app\'s own controls', inNote.video && !inNote.stock, JSON.stringify(inNote))
  await shot('note-cards')
  await h.locator('[data-pane] [data-attachment-face]').first().click(); await wait(1800)
  check('a click on the card\'s face previews the file', await h.evaluate(() => !!document.querySelector('[data-file-look=document]')))
  await h.keyboard.press('Escape'); await wait(400)
  await wait(1500)
  const used = (await v('media:list')).find((one) => one.src === essay.src)
  check('Files says the note holds it', used?.uses.some((one) => one.id === noteId), JSON.stringify(used?.uses))

  // ── Fifty faces, timed ──
  const fifty = Array.from({ length: 50 }, (_, at) => at % 2 ? docx(`Batch ${at}.docx`, `Batch paper ${at}`) : write(`Batch ${at}.txt`, `Batch note number ${at}\n`.repeat(20)))
  const told = await h.evaluate((items) => window.api.haligtree('media:add', items.map((path) => ({ path }))), fifty)
  const srcs = told.added.map((one) => one.src)
  const timed = await h.evaluate(async (list) => {
    const t0 = performance.now()
    const made = await Promise.all(list.map((src) => window.api.haligtree('notes:thumb', src, 320)))
    const first = performance.now() - t0
    const t1 = performance.now()
    await Promise.all(list.map((src) => window.api.haligtree('notes:thumb', src, 320)))
    return { first: Math.round(first), again: Math.round(performance.now() - t1), drawn: made.filter(Boolean).length }
  }, srcs)
  check('50 faces made', timed.drawn >= 45, `${timed.drawn} of 50 drawn by Quick Look; first ${timed.first} ms, again ${timed.again} ms`)
  console.log(`MEASURE 50 document faces: first ${timed.first} ms (${Math.round(timed.first / 50)} ms each, all at once), cached ${timed.again} ms`)
  if (!noVideo) {
    const ten = Array.from({ length: 10 }, (_, at) => film(`Clip ${at}.mp4`, ['-vf', `hue=h=${(at + 1) * 33}`, '-pix_fmt', 'yuv420p', '-c:v', 'libx264']))
    const got = await h.evaluate((items) => window.api.haligtree('media:add', items.map((path) => ({ path }))), ten)
    const t = await h.evaluate(async (list) => { const t0 = performance.now(); const made = await Promise.all(list.map((src) => window.api.haligtree('notes:thumb', src, 320))); return { ms: Math.round(performance.now() - t0), drawn: made.filter(Boolean).length } }, got.added.map((one) => one.src))
    console.log(`MEASURE 10 video frames: ${t.ms} ms (${Math.round(t.ms / 10)} ms each), ${t.drawn} drawn`)
  }
  const thumbs = await electron.evaluate(({ app }) => process.mainModule.require('fs').readdirSync(process.mainModule.require('path').join(app.getPath('userData'), 'thumbs')).filter((one) => /-ql/.test(one)).length)
  check('faces are kept on disk, once per file and size', thumbs >= 50, `${thumbs} kept`)
  kept = (await v('media:list')).filter((one) => one.kind === 'video' || one.kind === 'document').map((one) => one.src).sort()
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}

// ── Restart: still there, under the same tabs, faces from the disk ──
if (kept.length) {
  const again = await sandbox({ width: 1300, height: 860 })
  try {
    const now = (await again.v('media:list')).filter((one) => one.kind === 'video' || one.kind === 'document').map((one) => one.src).sort()
    check('after a restart every video and document is still there', JSON.stringify(now) === JSON.stringify(kept), `${kept.length} → ${now.length}`)
    await again.go('media'); await again.h.waitForTimeout(900)
    await again.h.locator('[data-page=media] [data-media-kinds] button', { hasText: /^Documents/ }).first().click(); await again.h.waitForTimeout(1500)
    const drawn = await again.h.evaluate(() => [...document.querySelectorAll('[data-page=media] [data-media] [data-file-face] img')].filter((img) => img.naturalWidth > 8).length)
    check('and Documents draws their faces again', drawn > 0, String(drawn))
  } catch (error) {
    check('the restart run finished', false, error.message.split('\n')[0])
  } finally {
    await again.close()
  }
}
rmSync(here, { recursive: true, force: true })
done()
