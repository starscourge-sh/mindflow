// Media (G ,): every picture, GIF, PDF and recording kept in the book's notes, as a grid. Tiles for each
// kind; the search and the kind chips narrow them; a click opens the note on the picture, ⌥-click to the
// side; "Copy link" pasted into another note shows the same picture there; an empty book says how things get here.
//   npx electron-vite build --outDir out-p
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/media.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shot = (h, name) => process.env.SHOTS && h.screenshot({ path: `${process.env.SHOTS}/${name}.png` })

// A one-page PDF, small enough to write out here.
const PDF = (() => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const stream = 'BT /F1 28 Tf 40 300 Td (Lease) Tj ET'
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = '%PDF-1.4\n'
  const at = []
  objects.forEach((body, i) => (at.push(out.length), (out += `${i + 1} 0 obj\n${body}\nendobj\n`)))
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return [...Buffer.from(out)]
})()
// A short silence, as a WAV.
const WAV = (() => {
  const data = 8000
  const b = Buffer.alloc(44 + data)
  b.write('RIFF', 0); b.writeUInt32LE(36 + data, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34)
  b.write('data', 36); b.writeUInt32LE(data, 40); b.fill(128, 44)
  return [...b]
})()
const GIF = [...Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64')]

const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

// --- an empty book first: the page says how things get here.
{
  const before = process.env.QA_ARGS
  process.env.QA_ARGS = ''
  const c = await sandbox({ width: 1300, height: 860, seeded: false })
  try {
    await c.v('settings:set', { sounds: false, hintRate: 0 })
    await c.go('media'); await c.h.waitForTimeout(800)
    const empty = await c.h.evaluate(() => document.querySelector('[data-page=media] [data-empty]')?.textContent ?? '')
    check('an empty book: Media says how things get here', /No pictures or files yet/.test(empty) && /Paste or drop/.test(empty), empty.slice(0, 120))
    await shot(c.h, 'media-empty')
  } catch (error) {
    check('the empty run finished', false, error.message.split('\n')[0])
  } finally {
    await c.close()
    process.env.QA_ARGS = before ?? '--sandbox'
  }
}

const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const chip = (name) => h.locator('[data-page=media] [data-media-kinds] button', { hasText: name }).first().click({ timeout: 5000 })
const tiles = () => h.evaluate(() => [...document.querySelectorAll('[data-page=media] [data-media]')].map((one) => ({ kind: one.dataset.media, src: one.dataset.src, note: one.dataset.note })))
try {
  process.env.QA_ARGS = '--sandbox'
  await v('settings:set', { sounds: false, hintRate: 0 })
  const png = await h.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240
    const pen = canvas.getContext('2d'); pen.fillStyle = '#3a7'; pen.fillRect(0, 0, 320, 240); pen.fillStyle = '#fff'; pen.fillRect(60, 60, 200, 120)
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
    return window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer()))
  })
  const gif = await h.evaluate((bytes) => window.api.saveImage('image/gif', new Uint8Array(bytes)), GIF)
  const pdf = await h.evaluate((bytes) => window.api.saveFile('Lease.pdf', new Uint8Array(bytes)), PDF)
  const wav = await h.evaluate((bytes) => window.api.saveFile('Birdsong.wav', new Uint8Array(bytes)), WAV)
  const make = (body) => h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: body })
  const garden = await make([para('Garden plans'), para('Tomatoes by the fence'), { type: 'image', attrs: { src: png } }, para('Water them at dusk')])
  const cats = await make([para('Cat moments'), { type: 'image', attrs: { src: gif } }, para('Paste below')])
  await make([para('Flat papers'), { type: 'attachment', attrs: { src: pdf, name: 'Lease.pdf', size: PDF.length } }])
  // A book as it comes off the web, its file name full of a site's tags.
  const book = await h.evaluate((bytes) => window.api.saveFile('18 - The Law Book (z-lib.org).pdf', new Uint8Array(bytes)), [...PDF, ...Buffer.from('% another book\n')])
  await make([para('Reading pile'), { type: 'attachment', attrs: { src: book, name: '18 - The Law Book (z-lib.org).pdf', size: PDF.length } }])
  await make([para('Morning walk'), { type: 'attachment', attrs: { src: wav, name: 'Birdsong.wav', size: WAV.length } }])
  // A gem kept from the PDF, still in Markdown: its link back ("Lease, p. 1") is a place in the book, not a second PDF.
  await h.evaluate((src) => window.api.haligtree('nugget:from', `A line from the lease\n\n[Lease, p. 1](${src}#page=1&mark=probe&name=Lease.pdf)`, { kind: 'quote', medium: 'Lease', passage: 'p. 1' }), pdf)
  await wait(600)

  await go('media'); await wait(1500)
  const all = await tiles()
  const kinds = Object.fromEntries(['picture', 'gif', 'pdf', 'audio'].map((kind) => [kind, all.filter((one) => one.kind === kind).length]))
  check('tiles for each kind', kinds.picture >= 1 && kinds.gif >= 1 && kinds.pdf >= 1 && kinds.audio >= 1, JSON.stringify(kinds))
  check('the four made here are among them', [png, gif, pdf, wav].every((src) => all.some((one) => one.src === src)), `${all.length} tiles`)
  const pdfFace = await h.evaluate((src) => document.querySelector(`[data-media][data-src="${src}"] img`)?.getAttribute('src')?.slice(0, 22) ?? 'file tile', pdf)
  check('the PDF tile shows its first page', pdfFace.startsWith('data:image'), pdfFace)
  check('a gem\'s link back into the PDF is no tile of its own', all.filter((one) => one.src === pdf).length === 1, JSON.stringify(all.filter((one) => one.src === pdf)))
  const pdfName = await h.evaluate((src) => document.querySelector(`[data-media][data-src="${src}"] .text-sm.font-medium`)?.textContent, pdf)
  check('the PDF tile is named by its title, else its file name without .pdf', pdfName === 'Lease', pdfName)
  const kept = await v('pdf:cover', pdf)
  check('its cover is kept in the book, ready at once next time', !!kept?.image?.startsWith('data:image/jpeg'), JSON.stringify(kept)?.slice(0, 60))
  check('the recording tile plays where it sits', await h.evaluate((src) => !!document.querySelector(`[data-media][data-src="${src}"] [data-sound-play]`), wav))
  await shot(h, 'media-light')

  await h.locator('[data-page=media] input[placeholder^="Find"]').fill('tomatoes'); await wait(500)
  const found = await tiles()
  check('the search finds a picture by the words around it', found.some((one) => one.src === png) && !found.some((one) => one.src === gif), `${found.length} tiles`)
  await h.locator('[data-page=media] input[placeholder^="Find"]').fill('lease'); await wait(500)
  const named = await tiles()
  check('and a file by its name', named.length >= 1 && named.every((one) => one.kind === 'pdf') && named.some((one) => one.src === pdf), JSON.stringify(named.map((one) => one.kind)))
  await h.locator('[data-page=media] input[placeholder^="Find"]').fill(''); await wait(400)
  await chip('GIFs'); await wait(500)
  const gifs = await tiles()
  check('"GIFs" leaves only GIFs', gifs.length >= 1 && gifs.every((one) => one.kind === 'gif'), JSON.stringify(gifs.map((one) => one.kind)))
  await chip('Audio'); await wait(500)
  const audio = await tiles()
  check('"Audio" leaves only recordings', audio.length >= 1 && audio.every((one) => one.kind === 'audio'), JSON.stringify(audio.map((one) => one.kind)))
  await chip('Audio'); await wait(500)
  check('pressed again, "Audio" shows every kind', (await tiles()).length === all.length)

  // "PDFs" is a library: each book once as its cover, its name made readable, and an inspector for the one picked.
  await chip('Books'); await wait(1500)
  const shelf = await h.evaluate(() => ({ books: [...document.querySelectorAll('[data-library] .pdf-book')].map((one) => one.querySelector('.pdf-book-title')?.textContent), covers: document.querySelectorAll('[data-library] .pdf-book-cover img').length, inspector: document.querySelector('.pdf-inspector .book-head-title')?.textContent, open: document.querySelector('.pdf-inspector-open')?.textContent }))
  check('"PDFs" shows a shelf of covers, one per book', shelf.books.length === 2 && shelf.covers === 2, JSON.stringify(shelf))
  check('a file name like "18 - The Law Book (z-lib.org).pdf" reads "The Law Book"', shelf.books.includes('The Law Book'), JSON.stringify(shelf.books))
  check('the inspector shows the book picked, with a way to open it', !!shelf.inspector && shelf.open === 'Start reading', JSON.stringify(shelf))
  await shot(h, 'media-library')
  await h.locator('[data-library] .pdf-book', { hasText: 'Lease' }).click(); await wait(400)
  check('a click picks a book for the inspector', await h.evaluate(() => document.querySelector('.book-head-title')?.textContent) === 'Lease', '')
  // The shelf with a book picked, light and dark.
  if (process.env.SHOTS) await c.both(`${process.env.SHOTS}/media-library`)
  await h.locator('.pdf-inspector-open').click(); await wait(1500)
  check('"Start reading" opens it in the reader', await h.evaluate(() => !!document.querySelector('.pdf-reader')), '')
  await go('media'); await wait(1200)

  // A click: the note opens on the picture, picked.
  await h.locator(`[data-media][data-src="${png}"]`).click(); await wait(1800)
  const landed = await h.evaluate((src) => {
    const img = [...document.querySelectorAll('[data-pane] .ProseMirror img')].find((one) => one.getAttribute('src') === src)
    return { there: !!img, picked: !!img?.closest('.ProseMirror-selectednode') }
  }, png)
  check('a click opens the note on the picture', landed.there && landed.picked, JSON.stringify(landed))

  await go('media'); await wait(1200)
  const panes = await h.evaluate(() => document.querySelectorAll('[data-pane]').length)
  await h.locator(`[data-media][data-src="${pdf}"]`).click({ modifiers: ['Alt'] }); await wait(1800)
  const after = await h.evaluate(() => document.querySelectorAll('[data-pane]').length)
  const beside = await h.evaluate((src) => [...document.querySelectorAll('[data-pane] .ProseMirror a[href], [data-pane] .ProseMirror [data-node-view-wrapper]')].length > 0 && !!document.querySelector('[data-pane] [data-page=media]'), pdf)
  check('⌥-click opens the note to the side, Media staying', after === panes + 1 && beside, `${panes} → ${after} panes`)
  await shot(h, 'media-aside')

  // "Copy link", pasted into another note: the same picture there.
  await h.locator(`[data-media][data-src="${png}"]`).click({ button: 'right' }); await wait(400)
  // A picture's two copies sit together under "Copy", as on every row.
  await h.getByRole('menuitem', { name: 'Copy', exact: true }).hover({ timeout: 5000 }); await wait(500)
  const copies = await h.evaluate(() => [...document.querySelectorAll('[role=menu]')].at(-1)?.textContent ?? '')
  check('a picture\'s menu has "Copy link" and "Copy image"', /Copy link/.test(copies) && /Copy image/.test(copies), copies.slice(0, 120))
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Copy link' }).last().click(); await wait(500)
  // Into another note, opened from its own tile.
  await go('media'); await wait(1200)
  await h.locator(`[data-media][data-src="${gif}"]`).click(); await wait(1800)
  // It lands with the GIF picked: a step down is the line under it.
  await h.keyboard.press('ArrowDown'); await h.keyboard.press('End'); await wait(200)
  await h.keyboard.press('Meta+v'); await wait(1200)
  await wait(1500)
  const pasted = await h.evaluate(async (id) => JSON.stringify((await window.api.captures.get(id))?.body ?? ''), cats)
  check('"Copy link" pasted into another note shows the same picture', pasted.includes(png), pasted.slice(0, 160))

} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5).join('\n'))
  await c.close()
}
done()
