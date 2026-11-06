// Media you can add to: files go in with no note, through the picker's stand-in and a real drop (Chromium's own drag
// input, with real files, off screen). Added, seen under its kind, found by ⌘K, linked from a note with "/" and @,
// "used in" on its tile, binned, Undo, restart and still there; a file met not doubled; a refused file said by name;
// every way in saying the same words; every state (0, 1, 50, 2,000 files, a 500 MB PDF, an odd name, a file gone).
// Runs in the sandbox and in a book of its own (RUN=own for the second half is run by this file itself).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/media-add.mjs
import { mkdtempSync, mkdirSync, openSync, rmSync, writeFileSync, writeSync, closeSync, unlinkSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.env.SHOTS
const shot = (h, name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })
const here = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'media-add-files-'))
const write = (name, bytes) => (writeFileSync(join(here, name), bytes), join(here, name))

// `before`: how many bytes sit ahead of the objects, for a big file shaped as a real one, its table of contents at the very end.
const pdfBytes = (word, before = 0) => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const stream = `BT /F1 28 Tf 40 300 Td (${word}) Tj ET`
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = before ? '' : '%PDF-1.4\n'
  const at = []
  objects.forEach((body, i) => (at.push(before + out.length), (out += `${i + 1} 0 obj\n${body}\nendobj\n`)))
  const xref = before + out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out)
}
const wav = () => {
  const b = Buffer.alloc(44 + 8000)
  b.write('RIFF', 0); b.writeUInt32LE(36 + 8000, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34)
  b.write('data', 36); b.writeUInt32LE(8000, 40); b.fill(128, 44)
  return b
}
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64')
// A small real PNG of one colour, different for each seed, made by the app's own canvas.
const pngFrom = (h, seed) => h.evaluate(async (n) => {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240
  const pen = canvas.getContext('2d'); pen.fillStyle = `hsl(${n * 37 % 360} 45% ${35 + n % 30}%)`; pen.fillRect(0, 0, 320, 240)
  pen.fillStyle = '#fff'; pen.font = '40px serif'; pen.fillText(String(n), 40, 120)
  const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
  return [...new Uint8Array(await blob.arrayBuffer())]
}, seed).then((bytes) => Buffer.from(bytes))

/** The file picker's stand-in: the next "Add" gets these files. */
const pickNext = (electron, paths) => electron.evaluate(({ dialog }, list) => { dialog.showOpenDialog = async () => ({ canceled: !list.length, filePaths: list }) }, paths)
/** A real drop: Chromium's own drag input carrying real files, at a point of the parked window. */
async function drop(page, paths, x, y) {
  const cdp = await page.context().newCDPSession(page)
  const data = { items: [], files: paths, dragOperationsMask: 1 }
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data })
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data })
  await page.waitForTimeout(150)
  const over = await page.evaluate(() => !!document.querySelector('[data-media-drop]'))
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data })
  await cdp.detach()
  return over
}
const tiles = (h) => h.evaluate(() => [...document.querySelectorAll('[data-page=media] [data-media]')].map((one) => ({ kind: one.dataset.media, src: one.dataset.src, note: one.dataset.note ?? null, name: one.querySelector('.text-sm.font-medium')?.textContent, where: one.parentElement?.querySelector('[data-media-where]')?.textContent ?? null })))
const lastToast = (h) => h.evaluate(() => [...document.querySelectorAll('[data-toast], [data-sonner-toast], [role=status]')].map((one) => one.textContent).filter(Boolean).at(-1) ?? '')
const listed = (v) => v('media:list')
const notesCount = (h) => h.evaluate(async () => (await window.api.captures.list()).length)

async function journey(c, label) {
  const { h, v, go, electron } = c
  const wait = (ms) => h.waitForTimeout(ms)
  await v('settings:set', { sounds: false, hintRate: 0 })
  const page = h
  const seenNotes = await notesCount(h)
  const png = write('Harbour at dawn.png', await pngFrom(h, 1))
  const gif = write('Spinning.gif', GIF)
  const pdf = write('The Lease of Time.pdf', pdfBytes('Lease'))
  const audio = write('Birdsong.wav', wav())
  const bad = write('notes.docx', Buffer.from('PK\u0003\u0004 not a picture'))
  const fake = write('fake.png', Buffer.from('hello, I am no picture'))
  await go('media'); await wait(900)
  // --- Add, through the picker's stand-in
  const before = (await listed(v)).length
  await pickNext(electron, [png, gif, pdf, audio])
  const add = h.locator('[data-page=media] [data-media-add]')
  check(`${label}: the page has a plain "Add"`, await add.count() === 1 && /Add/.test(await add.textContent()))
  await add.click(); await wait(900)
  let all = await listed(v)
  check(`${label}: four files added with nothing asked`, all.length === before + 4, `${before} → ${all.length}`)
  check(`${label}: no note was made`, await notesCount(h) === seenNotes, `${seenNotes} → ${await notesCount(h)}`)
  check(`${label}: one notice for the four`, /Added 4 files to Media/.test(await h.evaluate(() => document.body.innerText)), (await lastToast(h)).slice(0, 80))
  await shot(h, `added-${label}`)
  const by = (end) => all.find((one) => one.name.endsWith(end))
  const [P, G, D, A] = ['.png', '.gif', '.pdf', '.wav'].map(by)
  const kinds = [P?.kind, G?.kind, D?.kind, A?.kind].join()
  check(`${label}: each under its kind`, kinds === 'picture,gif,pdf,audio', kinds)
  const shownT = await tiles(h)
  check(`${label}: a new file says it is in no note`, shownT.some((one) => one.src === P.src && one.where === 'In no note yet'), JSON.stringify(shownT.find((one) => one.src === P.src)))
  // --- Undo the whole batch, then again
  await h.keyboard.press('Meta+z'); await wait(700)
  check(`${label}: ⌘Z takes the whole batch back`, (await listed(v)).length === before, `${(await listed(v)).length}`)
  await add.click(); await wait(900)
  check(`${label}: and adding again brings them`, (await listed(v)).length === before + 4)

  // --- Met, not doubled; refused by name; many at once
  await pickNext(electron, [pdf])
  await add.click(); await wait(800)
  check(`${label}: the same bytes are met, not doubled`, (await listed(v)).length === before + 4 && /already in Media/.test(await h.evaluate(() => document.body.innerText)))
  const copy = write('Another name for it.pdf', pdfBytes('Lease'))
  await pickNext(electron, [copy, bad, fake])
  await add.click(); await wait(800)
  const said = await h.evaluate(() => document.body.innerText)
  check(`${label}: the same bytes under another name are met too`, (await listed(v)).length === before + 4)
  check(`${label}: a file it cannot take says why, by name`, /notes\.docx: Media takes pictures, GIFs, PDFs and audio/.test(said) && /fake\.png: not a picture Haligtree can read/.test(said), said.slice(-200))

  // --- A real drop on the page
  const drops = [write('Dropped one.png', await pngFrom(h, 2)), write('Dropped two.png', await pngFrom(h, 3))]
  const box = await h.locator('[data-page=media]').boundingBox()
  const lit = await drop(h, drops, box.x + box.width / 2, box.y + box.height / 2)
  check(`${label}: carrying files over the page says what a drop does`, lit)
  await shot(h, `drop-hint-${label}`)
  await wait(900)
  all = await listed(v)
  check(`${label}: a real drop anywhere on the page adds them`, all.filter((one) => /^Dropped/.test(one.name)).length === 2, all.map((one) => one.name).join())
  check(`${label}: the drop's hint goes after`, !(await h.evaluate(() => !!document.querySelector('[data-media-drop]'))))

  // --- The shelf: a PDF added here is a book, and opens in the reader
  const chip = (name) => h.locator('[data-page=media] [data-media-kinds] button', { hasText: name }).first().click({ timeout: 5000 })
  await chip('PDFs'); await wait(1200)
  const books = await v('pdf:library')
  check(`${label}: a PDF added here is a book on the shelf`, books.some((one) => one.src === D.src) && await h.locator(`[data-library] [data-book="${D.src}"]`).count() === 1)
  await shot(h, `shelf-${label}`)
  await h.locator(`[data-library] [data-book="${D.src}"]`).dblclick(); await wait(1400)
  check(`${label}: and opens in the reader`, await h.evaluate(() => !!document.querySelector('.pdf-reader')))
  await go('media'); await wait(800)
  await chip('PDFs'); await wait(400)
  await chip('PDFs'); await wait(500)
  await h.locator(`[data-media][data-src="${D.src}"]`).click(); await wait(1400)
  check(`${label}: a click on its tile opens the reader at once`, await h.evaluate(() => !!document.querySelector('.pdf-reader')))
  await go('media'); await wait(800)

  // --- A picture used nowhere opens in the app's own viewer, and Esc comes back
  await h.locator(`[data-media][data-src="${P.src}"]`).click(); await wait(700)
  check(`${label}: a picture used nowhere opens in the app's own viewer`, await h.evaluate(() => !!document.querySelector('.mf-look')), '')
  await shot(h, `viewer-${label}`)
  await h.keyboard.press('Escape'); await wait(500)

  // --- Found by Media's search and ⌘K, and going there
  await h.locator('[data-page=media] input[placeholder^="Find"]').fill('harbour'); await wait(400)
  check(`${label}: Media's search finds it by name`, (await tiles(h)).length === 1)
  await h.locator('[data-page=media] input[placeholder^="Find"]').fill(''); await wait(300)
  const found = await h.evaluate(() => window.api.captures.find('harbour'))
  check(`${label}: ⌘K's search finds it with no note`, found.some((one) => one.type === 'media' && one.id.startsWith(P.src)), JSON.stringify(found.map((one) => one.type)))
  check(`${label}: ⌘K's search finds the book too`, (await h.evaluate(() => window.api.captures.find('lease of time'))).some((one) => one.type === 'pdf' && one.id.startsWith(D.src)))
  await go('home'); await wait(500)
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('harbour'); await wait(900)
  await shot(h, `cmdk-${label}`)
  await h.keyboard.press('Enter'); await wait(1400)
  const reveal = await h.evaluate((src) => ({ page: !!document.querySelector('[data-page=media]'), picked: !!document.querySelector(`[data-cursor] [data-media][data-src="${src}"]`) }), P.src)
  check(`${label}: ↵ on it opens Media with the keys on that tile`, reveal.page && reveal.picked, JSON.stringify(reveal))
  check(`${label}: and ⌘K has closed`, await h.evaluate(() => !document.querySelector('[role=dialog] input')))

  // --- Keys: ⌘A, ⇧-click, ⌫ with Undo
  await h.keyboard.press('Meta+a'); await wait(300)
  const count = await h.evaluate(() => document.querySelectorAll('[data-page=media] [data-picked]').length)
  check(`${label}: ⌘A picks every tile on show`, count >= 4, String(count))
  check(`${label}: picking moves nothing on the line`, Math.abs((await h.locator('[data-media-add]').boundingBox()).x - (await add.boundingBox()).x) < 1)
  await h.keyboard.press('Escape'); await wait(200)
  const dropA = all.find((one) => one.name === 'Dropped one.png'), dropB = all.find((one) => one.name === 'Dropped two.png')
  await h.locator(`[data-media][data-src="${dropB.src}"]`).click({ modifiers: ['Meta'] }); await wait(150)
  await h.locator(`[data-media][data-src="${dropA.src}"]`).click({ modifiers: ['Shift'] }); await wait(250)
  check(`${label}: ⇧-click picks a run`, await h.evaluate(() => document.querySelectorAll('[data-page=media] [data-picked]').length) === 2)
  await shot(h, `picked-${label}`)
  await h.locator(`[data-media][data-src="${dropA.src}"]`).click({ button: 'right' }); await wait(350)
  const severalMenu = await h.evaluate(() => [...document.querySelectorAll('[role=menu]')].at(-1)?.innerText ?? '')
  check(`${label}: right-click on the picked speaks for them all`, /Put 2 in a note/.test(severalMenu) && /Move 2 to the Bin/.test(severalMenu), severalMenu)
  await h.keyboard.press('Escape'); await wait(250)
  await h.keyboard.press('Backspace'); await wait(700)
  check(`${label}: ⌫ moves them to the Bin, with a notice`, !(await listed(v)).some((one) => /^Dropped/.test(one.name)) && /Moved 2 to the Bin/.test(await h.evaluate(() => document.body.innerText)))
  const bin = await v('bin:list')
  check(`${label}: the Bin lists them`, bin.filter((one) => one.type === 'media').length === 2, JSON.stringify(bin.filter((one) => one.type === 'media').map((one) => one.title)))
  await h.keyboard.press('Meta+z'); await wait(700)
  check(`${label}: ⌘Z brings them back`, (await listed(v)).filter((one) => /^Dropped/.test(one.name)).length === 2 && !(await v('bin:list')).some((one) => one.type === 'media'))

  // --- Bin, the page: shown, restored, deleted for good; added again comes out of the Bin
  await h.keyboard.press('Escape'); await wait(150)
  await h.evaluate((src) => window.api.haligtree('media:bin', [src]), dropA.src); await wait(300)
  await go('discarded'); await wait(1000)
  const row = h.locator(`[data-bin-row="media"][data-id="${dropA.src}"]`)
  check(`${label}: the Bin's page shows the file by name`, await row.count() === 1 && /Dropped one/.test(await row.textContent()), '')
  await row.click(); await wait(900)
  check(`${label}: and shows what is inside`, await h.evaluate(() => !!document.querySelector('[data-bin-inside] img')), '')
  await shot(h, `bin-${label}`)
  await h.keyboard.press('Escape'); await wait(200)
  await h.locator(`[data-bin-row="media"][data-id="${dropA.src}"] button`, { hasText: 'Restore' }).click(); await wait(600)
  check(`${label}: "Restore" puts it back in Media`, (await listed(v)).some((one) => one.src === dropA.src))
  await h.evaluate((src) => window.api.haligtree('media:bin', [src]), dropA.src); await wait(200)
  const backAgain = await h.evaluate((path) => window.api.haligtree('media:add', [{ path }]), drops[0])
  check(`${label}: added again from the Bin, it comes out`, backAgain.revived.length === 1 && (await listed(v)).some((one) => one.src === dropA.src), JSON.stringify(backAgain))
  await h.evaluate((src) => window.api.haligtree('media:bin', [src]), dropA.src); await wait(200)
  check(`${label}: deleted for good, it leaves the Bin`, await v('bin:forget', 'media', dropA.src) === true && !(await v('bin:list')).some((one) => one.id === dropA.src))
  await h.evaluate((src) => window.api.haligtree('media:bin', [src]), dropB.src); await wait(100)
  await v('bin:forget', 'media', dropB.src)

  // --- Linked later, from a note, with "/" and with @
  const noteId = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Field notes' }] }, { type: 'paragraph' }] } }))
  await wait(400)
  await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:open', { detail: { type: 'capture', id } })), noteId); await wait(1600)
  const bodyOf = () => h.evaluate(async (id) => JSON.stringify((await window.api.captures.get(id))?.body ?? ''), noteId)
  await h.locator('[data-pane] .ProseMirror').last().click(); await h.keyboard.press('Meta+ArrowDown'); await wait(150)
  await h.keyboard.type('/harbour'); await wait(800)
  const slash = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-list button')].map((one) => one.textContent))
  check(`${label}: "/" finds a Media file no note uses`, slash.some((one) => /Harbour at dawn/.test(one)), JSON.stringify(slash))
  await shot(h, `slash-${label}`)
  await h.keyboard.press('Enter'); await wait(1600)
  check(`${label}: and it goes in as a picture`, new RegExp(`"type":"image"[^}]*${P.src}|${P.src}[^}]*"type":"image"`).test(await bodyOf()) || (await bodyOf()).includes(P.src), (await bodyOf()).slice(0, 240))
  check(`${label}: and shows in the note`, await h.evaluate((src) => [...document.querySelectorAll('[data-pane] .ProseMirror img')].some((one) => one.getAttribute('src') === src), P.src))
  await h.keyboard.press('Enter'); await wait(100)
  await h.keyboard.type('@lease'); await wait(900)
  const at = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-list button')].map((one) => one.textContent))
  check(`${label}: @ finds one too, offered once`, at.filter((one) => /The Lease of Time/.test(one)).length === 1, JSON.stringify(at))
  await shot(h, `at-${label}`)
  await h.locator('.tiptap-slash-menu-list button', { hasText: 'The Lease of Time' }).last().click(); await wait(1600)
  const withBook = await bodyOf()
  check(`${label}: and it goes in as a PDF's block, not a link`, withBook.includes('"attachment"') && withBook.includes(D.src), withBook.slice(0, 280))
  await wait(1500)
  await go('media'); await wait(1000)
  all = await listed(v)
  const used = all.find((one) => one.src === P.src)
  check(`${label}: its record says where it is used`, used.uses.length === 1 && used.uses[0].id === noteId, JSON.stringify(used.uses))
  const usedTile = (await tiles(h)).find((one) => one.src === P.src)
  check(`${label}: its tile says so`, /^In\s*Field notes/.test(usedTile.where ?? ''), JSON.stringify(usedTile))
  await shot(h, `used-${label}`)
  check(`${label}: still one tile for the file`, all.filter((one) => one.src === P.src).length === 1)
  await h.locator(`[data-media][data-src="${P.src}"]`).locator('xpath=..').locator('[data-media-use]').click(); await wait(1500)
  const landed = await h.evaluate((id) => [...document.querySelectorAll('[data-pane]')].some((one) => /Field notes/.test(one.textContent)), noteId)
  check(`${label}: its "In …" is a way to that note`, landed)
  await go('media'); await wait(900)
  // What a file that notes use does on ⌫: it stays, and says so.
  await h.locator(`[data-media][data-src="${P.src}"]`).click({ modifiers: ['Meta'] }); await wait(150)
  await h.keyboard.press('Backspace'); await wait(500)
  check(`${label}: ⌫ on a file a note holds leaves it, and says why`, (await listed(v)).some((one) => one.src === P.src) && /stays: 1 note holds it/.test(await h.evaluate(() => document.body.innerText)))
  await h.keyboard.press('Escape'); await wait(200)
  await h.locator(`[data-media][data-src="${P.src}"]`).click({ button: 'right' }); await wait(350)
  const usedMenu = await h.evaluate(() => [...document.querySelectorAll('[role=menu]')].at(-1)?.innerText ?? '')
  check(`${label}: its menu has no "Move to the Bin" to refuse`, !/Move to the Bin/.test(usedMenu) && /Open note/.test(usedMenu) && /Put in a note/.test(usedMenu), usedMenu)
  await h.keyboard.press('Escape'); await wait(200)

  // --- "Put in a note…" from Media, for the recording
  await h.locator(`[data-media][data-src="${A.src}"]`).click({ button: 'right' }); await wait(350)
  const looseMenu = await h.evaluate(() => [...document.querySelectorAll('[role=menu]')].at(-1)?.innerText ?? '')
  check(`${label}: a loose file's menu offers the Bin and a note`, /Move to the Bin/.test(looseMenu) && /Put in a note/.test(looseMenu), looseMenu)
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Put in a note' }).click(); await wait(600)
  await shot(h, `put-${label}`)
  await h.keyboard.type('Field notes'); await wait(900)
  await h.keyboard.press('Enter'); await wait(900)
  check(`${label}: "Put in a note…" puts it in the note picked, as its block`, (await bodyOf()).includes(A.src), (await bodyOf()).slice(-200))
  check(`${label}: and says so, with a way there`, /Put “Birdsong” in/.test(await h.evaluate(() => document.body.innerText)))
  await h.keyboard.press('Meta+z'); await wait(700)
  check(`${label}: ⌘Z takes it back out`, !(await bodyOf()).includes(A.src))

  // --- Restart: still there. (The harness restarts on its own folder.)
  const kept = (await listed(v)).filter((one) => one.added).map((one) => one.src).sort()
  return { kept, P, D }
}

// --- In the sandbox
// PART=book,ways runs only those halves, on a machine too busy for the whole file at once.
const part = (name) => !process.env.PART || process.env.PART.split(',').includes(name)
let out = null
if (part('sandbox')) {
const c = await sandbox({ width: 1300, height: 860 })
try {
  out = await journey(c, 'sandbox')
  check('no page errors in the sandbox', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the sandbox run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
}
// --- Restart the same sandbox
if (out) {
  const again = await sandbox({ width: 1300, height: 860 })
  try {
    const now = (await again.v('media:list')).filter((one) => one.added).map((one) => one.src).sort()
    check('after a restart every added file is still there', now.length > 0 && JSON.stringify(now) === JSON.stringify(out.kept), `${out.kept.length} → ${now.length}`)
  } catch (error) {
    check('the restart run finished', false, error.message.split('\n')[0])
  } finally {
    await again.close()
  }
}

// --- A book of its own, with every state of the page: 0, 1, 50, 2,000, a 500 MB PDF, an odd name, a file gone
if (part('book')) {
  const before = process.env.QA_ARGS
  process.env.QA_ARGS = ''
  const b = await sandbox({ width: 1300, height: 860, seeded: false })
  const { h, v, go, electron } = b
  const wait = (ms) => h.waitForTimeout(ms)
  try {
    await v('settings:set', { sounds: false, hintRate: 0, welcomed: new Date().toISOString() })
    await h.reload(); await wait(1800)
    await go('media'); await wait(900)
    const empty = await h.evaluate(() => ({ line: document.querySelector('[data-page=media] [data-empty]')?.textContent ?? '', button: !!document.querySelector('[data-media-add-empty]'), grid: !!document.querySelector('[data-media-grid]') }))
    check('own book, 0 files: says how to add, has the button, no empty grid', /Press “Add”/.test(empty.line) && empty.button && !empty.grid, JSON.stringify(empty))
    await shot(h, 'state-0')
    const one = write('Only one.png', await pngFrom(h, 11))
    await pickNext(electron, [one])
    await h.locator('[data-media-add-empty]').click(); await wait(1000)
    check('own book, 1 file: the empty line gives way to its tile', (await tiles(h)).length === 1)
    check('own book: its one kind has no row of tabs', !(await h.evaluate(() => !!document.querySelector('[data-media-kinds]'))))
    await shot(h, 'state-1')
    const box0 = await h.locator('[data-media-add]').boundingBox()
    // An odd file name: long, with emoji, quotes, a bar and accents.
    const odd = write(`A “very” odd|name été 🌿 ${'long '.repeat(18)}.pdf`, pdfBytes('Odd'))
    await pickNext(electron, [odd])
    await h.locator('[data-media-add]').click(); await wait(1200)
    const oddT = (await tiles(h)).find((t) => t.kind === 'pdf')
    check('an odd file name goes in and reads whole in its record', !!oddT && (await v('media:list')).some((t) => t.name.includes('🌿')), JSON.stringify(oddT)?.slice(0, 120))
    const fit = await h.evaluate(() => { const el = document.querySelector('[data-media="pdf"]')?.closest('[data-id]'); return el ? el.getBoundingClientRect().width : 0 })
    check('and is cut to its tile', fit > 100 && fit < 220, String(fit))
    await shot(h, 'state-odd')
    const box1 = await h.locator('[data-media-add]').boundingBox()
    check('"Add" does not move as the page fills', Math.abs(box0.x - box1.x) < 1 && Math.abs(box0.y - box1.y) < 1, `${box0.x},${box0.y} → ${box1.x},${box1.y}`)
    // 50 files in one go: one notice.
    const fifty = []
    for (let n = 0; n < 50; n++) fifty.push(write(`Fifty ${n}.png`, await pngFrom(h, 100 + n)))
    await pickNext(electron, fifty)
    await h.locator('[data-media-add]').click(); await wait(2000)
    check('50 files at once: one notice with the count', /Added 50 files to Media/.test(await h.evaluate(() => document.body.innerText)))
    check('50 files: all there', (await v('media:list')).length === 52, String((await v('media:list')).length))
    await shot(h, 'state-50')
    // A file gone from the disk: says so, and "Add" brings it back.
    const gone = (await v('media:list')).find((t) => t.name === 'Only one.png')
    const dir = await electron.evaluate(({ app }) => app.getPath('userData'))
    unlinkSync(join(dir, 'assets', gone.src.split('/').pop())); await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false }))
    await go('home'); await wait(300); await go('media'); await wait(900)
    const goneRow = await v('media:list').then((list) => list.find((t) => t.src === gone.src))
    check('a file gone from the disk is known to be gone', goneRow.gone === true, JSON.stringify(goneRow).slice(0, 100))
    // Far down a long page, where nothing is drawn: found by its name, as a person would.
    await h.locator('[data-page=media] input[placeholder^="Find"]').fill('only one'); await wait(500)
    const goneLine = await h.evaluate((src) => document.querySelector(`[data-media][data-src="${src}"]`)?.parentElement?.querySelector('[data-media-where]')?.textContent ?? '', gone.src)
    check('and its tile says so', /gone/.test(goneLine), goneLine)
    await shot(h, 'state-gone')
    await h.locator(`[data-media][data-src="${gone.src}"]`).click(); await wait(400)
    check('pressed, it says what to do', /Add it again to bring it back/.test(await h.evaluate(() => document.body.innerText)))
    await h.locator('[data-page=media] input[placeholder^="Find"]').fill(''); await wait(300)
    await pickNext(electron, [one]); await h.locator('[data-media-add]').click(); await wait(900)
    check('added again, it is back', (await v('media:list')).find((t) => t.src === gone.src)?.gone === false)
    // A 500 MB PDF: in by path a piece at a time, onto the shelf, into the reader.
    const big = join(here, 'A very large book.pdf')
    const head = '%PDF-1.4\n%', piece = 16 * 1024 * 1024
    const before = head.length + 32 * piece + 1
    const fd = openSync(big, 'w'); writeSync(fd, head); const padding = Buffer.alloc(piece, 37); for (let n = 0; n < 32; n++) writeSync(fd, padding); writeSync(fd, '\n'); writeSync(fd, pdfBytes('Large', before)); closeSync(fd)
    await pickNext(electron, [big])
    const started = Date.now()
    await h.locator('[data-media-add]').click()
    for (let n = 0; n < 200 && !(await v('media:list')).some((t) => t.name === 'A very large book.pdf'); n++) await wait(250)
    const took = Date.now() - started
    const huge = (await v('media:list')).find((t) => t.name === 'A very large book.pdf')
    check('a 500 MB PDF goes in', !!huge && huge.size > 500_000_000, `${huge?.size} in ${took}ms`)
    await shot(h, 'state-500mb')
    // The window stays alive with it on the page: its cover is drawn off to one side.
    const alive = await Promise.race([h.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(true)))), new Promise((done) => setTimeout(() => done(false), 8000))])
    check('and the window keeps answering', alive === true)
    await h.locator(`[data-media][data-src="${huge.src}"]`).click(); await wait(4000)
    check('and opens in the reader', await h.evaluate(() => !!document.querySelector('.pdf-reader')))
    await go('media'); await wait(800)
    // 2,000 added: the page reads fast, draws only what is in sight, and has a chip for those in no note once a note uses some.
    const many = await h.evaluate(async () => {
      const out = []
      for (let n = 0; n < 2000; n++) out.push({ name: `Scale ${n}.gif`, bytes: new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 255, 255, 255, 0, 0, 0, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59, n & 255, n >> 8]) })
      return window.api.haligtree('media:add', out).then((told) => told.added.length)
    })
    check('2,000 files go in at once', many === 2000, String(many))
    const open0 = Date.now()
    await go('home'); await wait(200); await go('media')
    await h.waitForSelector('[data-page=media] [data-media]', { timeout: 15000 })
    const drawn = await h.evaluate(() => document.querySelectorAll('[data-page=media] [data-media]').length)
    check('2,000 files: the page draws only what is in sight', drawn > 0 && drawn < 200, `${drawn} tiles, ${Date.now() - open0}ms`)
    await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Holds one' }] }, { type: 'image', attrs: { src: document.querySelector('[data-page=media] [data-media]').dataset.src } }] } })); await wait(1200)
    check('2,000 files: "In no note" gets a chip of its own', await h.evaluate(() => !!document.querySelector('[data-media-loose]')))
    await shot(h, 'state-2000')
    check('no page errors in the book of its own', !b.errors.length, b.errors.slice(0, 3).join(' | '))
  } catch (error) {
    console.log(error.message.slice(0, 900))
    check('the own-book run finished', false, error.message.split('\n')[0])
  } finally {
    await b.close()
    process.env.QA_ARGS = before ?? '--sandbox'
  }
}

// --- Every way in: Media's button, a drop on Media, Finder's Services, a drop on a note, quick capture.
if (part('ways')) {
  const w = await sandbox({ width: 1300, height: 860 })
  const { h, v, go, electron } = w
  const wait = (ms) => h.waitForTimeout(ms)
  try {
    await v('settings:set', { sounds: false, hintRate: 0 })
    const notes0 = await notesCount(h)
    const finder = write('From Finder.png', await pngFrom(h, 21))
    const pdf = write('From Finder.pdf', pdfBytes('Finder'))
    check('Finder\'s line answers', await electron.evaluate(() => typeof globalThis.servicesSendFiles === 'function'))
    await electron.evaluate((_, paths) => globalThis.servicesSendFiles(paths), [finder, pdf].join('\n'))
    await wait(1500)
    const all = await v('media:list')
    check('Finder\'s Services: in Media, no note made', all.some((one) => one.name === 'From Finder.png' && one.added) && all.some((one) => one.name === 'From Finder.pdf' && one.added) && await notesCount(h) === notes0)
    await go('media'); await wait(800)
    // Dropped on a note: in that note, and in Media under its kind, one file.
    const dropped = write('Dropped on a note.png', await pngFrom(h, 22))
    const noteId = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A note to drop on' }] }, { type: 'paragraph' }] } }))
    await wait(300)
    await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:open', { detail: { type: 'capture', id } })), noteId); await wait(1500)
    const spot = await h.locator('[data-pane] .ProseMirror').last().boundingBox()
    await drop(h, [dropped], spot.x + 40, spot.y + 30); await wait(2500)
    const tile = (await v('media:list')).find((one) => one.uses.some((use) => use.id === noteId))
    check('a drop on a note: in that note, and in Media under its kind', tile?.kind === 'picture', JSON.stringify(tile)?.slice(0, 160))
    // And the same bytes added from Media afterwards are met.
    const told = await h.evaluate((path) => window.api.haligtree('media:add', [{ path }]), dropped)
    check('then "Add" with the same file meets it', told.met.length === 1 && told.added.length === 0, JSON.stringify(told))
    // Quick capture: a drop in the box, sent: the same store, one more note holding it, in Media under its kind.
    const boxFile = write('Dropped on the box.png', await pngFrom(h, 23))
    await w.page.bringToFront().catch(() => {})
    const boxArea = await w.page.locator('.ProseMirror').first().boundingBox()
    if (boxArea) {
      await drop(w.page, [boxFile], boxArea.x + 20, boxArea.y + 10); await wait(1800)
      await w.page.locator('.ProseMirror').first().click(); await w.page.keyboard.type('From the box'); await wait(300)
      await w.page.keyboard.press('Meta+Enter'); await wait(1800)
    }
    const fromBox = (await v('media:list')).filter((one) => one.uses.some((use) => /From the box/.test(use.title)))
    check('a drop in quick capture, sent: in Media under its kind, in the note it made', fromBox.length === 1 && fromBox[0].kind === 'picture', JSON.stringify(fromBox.map((one) => one.uses))?.slice(0, 200))
    // One file in three notes: one tile, each note a way there.
    const shared = write('Shared map.png', await pngFrom(h, 24))
    const [sharedFile] = (await h.evaluate((path) => window.api.haligtree('media:add', [{ path }]), shared)).added
    for (const title of ['First holder', 'Second holder', 'Third holder']) await h.evaluate(([src, title]) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }, { type: 'image', attrs: { src } }] } }), [sharedFile.src, title])
    await wait(600)
    await go('media'); await wait(1000)
    const sharedT = (await v('media:list')).filter((one) => one.src === sharedFile.src)
    check('one file in three notes is one tile, knowing all three', sharedT.length === 1 && sharedT[0].uses.length === 3, JSON.stringify(sharedT[0]?.uses?.map((one) => one.title)))
    const line = h.locator(`[data-media][data-src="${sharedFile.src}"]`).locator('xpath=..')
    check('its line says one and how many more', /\+2/.test(await line.locator('[data-media-where]').textContent()), await line.locator('[data-media-where]').textContent())
    await line.locator('[data-media-more-uses]').click(); await wait(350)
    await shot(h, 'used-many')
    const others = await h.evaluate(() => [...document.querySelectorAll('[role=menu]')].at(-1)?.innerText ?? '')
    check('"+2" lists the others', (others.match(/holder/g) ?? []).length === 2, others)
    await h.locator('[role=menu] [role=menuitem]').first().click(); await wait(1500)
    check('and each is a way to that note', await h.evaluate(() => [...document.querySelectorAll('[data-pane] .ProseMirror')].some((one) => /holder/.test(one.textContent))))
    await go('media'); await wait(800)
    // "Make it a note", where it was already: a picture's own, also with no words in it.
    const count0 = await notesCount(h)
    const loosePic = (await v('media:list')).find((one) => !one.uses.length && one.kind === 'picture')
    await h.locator(`[data-media][data-src="${loosePic.src}"]`).click({ button: 'right' }); await wait(350)
    await h.getByRole('menuitem', { name: 'Text in it' }).hover(); await wait(500)
    await h.locator('[role=menu] [role=menuitem]', { hasText: 'Make it a note' }).last().click(); await wait(1500)
    check('"Make it a note" makes a note holding the picture, words or none', await notesCount(h) === count0 + 1 && (await v('media:list')).find((one) => one.src === loosePic.src).uses.length === 1, `${count0} → ${await notesCount(h)}`)
    // The shelf's keys: ⌘A, right-click, ⌫, ⌘Z.
    await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'PDFs' }).first().click(); await wait(1200)
    const finderBook = (await v('media:list')).find((one) => one.name === 'From Finder.pdf')
    const card = h.locator(`[data-library] [data-book="${finderBook.src}"]`)
    await card.click({ modifiers: ['Meta'] }); await wait(250)
    check('the shelf picks with ⌘-click', await h.evaluate((src) => !!document.querySelector(`[data-book="${src}"][data-picked]`), finderBook.src))
    await card.click({ button: 'right' }); await wait(350)
    const bookLines = await h.evaluate(() => [...document.querySelectorAll('[role=menu]')].at(-1)?.innerText ?? '')
    check('a book\'s menu offers a note and the Bin', /Put in a note/.test(bookLines) && /Move to the Bin/.test(bookLines), bookLines)
    await h.keyboard.press('Escape'); await wait(250)
    await h.keyboard.press('Backspace'); await wait(800)
    check('⌫ on the shelf bins the book', !(await v('pdf:library')).some((one) => one.src === finderBook.src))
    await h.keyboard.press('Meta+z'); await wait(800)
    check('⌘Z puts it back on the shelf', (await v('pdf:library')).some((one) => one.src === finderBook.src))
    check('no page errors on the ways in', !w.errors.length, w.errors.slice(0, 3).join(' | '))
  } catch (error) {
    check('the ways-in run finished', false, error.message.split('\n')[0])
  } finally {
    await w.close()
  }
}
rmSync(here, { recursive: true, force: true })
done()
