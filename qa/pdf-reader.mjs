// A PDF dropped into a note shows its pages in the note, page 1's words
// readable and selectable, with its page count.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-pdf/main/index.js HALIGTREE_QA_AWAY=1 node qa/pdf-reader.mjs
import zlib from 'node:zlib'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

/** An 8 by 8 orange PNG, built by hand: the picture dark pages must leave as it is. */
const orangePng = () => {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]) }
  const head = Buffer.alloc(13); head.writeUInt32BE(8, 0); head.writeUInt32BE(8, 4); head[8] = 8; head[9] = 2
  const rows = Buffer.concat(Array.from({ length: 8 }, () => Buffer.from([0, ...Array.from({ length: 8 }, () => [240, 120, 20]).flat()])))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

/** Three pages of real text, each saying which page it is. */
const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Probe Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const picture = await pdf.embedPng(orangePng())
  for (let n = 1; n <= 3; n++) {
    const page = pdf.addPage([400, 560])
    page.drawText(`Page ${n} of the probe book`, { x: 40, y: 500, size: 18, font })
    page.drawText(`A quiet sentence worth keeping on page ${n}.`, { x: 40, y: 460, size: 12, font })
    page.drawImage(picture, { x: 40, y: 300, width: 80, height: 80 })
  }
  // An outline, as a book's contents: one entry for each page.
  const { PDFName, PDFNull, PDFNumber, PDFString } = await import('pdf-lib')
  const ctx = pdf.context
  const root = ctx.nextRef()
  const refs = pdf.getPages().map(() => ctx.nextRef())
  pdf.getPages().forEach((page, n) => {
    const entry = ctx.obj({ Title: PDFString.of(`Chapter ${n + 1}`), Parent: root, Dest: [page.ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull] })
    if (n > 0) entry.set(PDFName.of('Prev'), refs[n - 1])
    if (n < refs.length - 1) entry.set(PDFName.of('Next'), refs[n + 1])
    ctx.assign(refs[n], entry)
  })
  ctx.assign(root, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs[refs.length - 1], Count: PDFNumber.of(refs.length) }))
  pdf.catalog.set(PDFName.of('Outlines'), root)
  return Array.from(await pdf.save())
}

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const errors = []
h.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
h.on('pageerror', (e) => errors.push(String(e)))
const EDITOR = '[data-open] .tiptap'
/** How much of a span's box on page 1 of the note's PDF block reads as white page: a grey band behind the words reads near 0. */
const whiteUnderWords = async () => {
  const box = await h.evaluate(() => {
    const span = [...document.querySelectorAll('.tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer span')].find((one) => /probe book/.test(one.textContent))
    const r = span?.getBoundingClientRect()
    return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null
  })
  if (!box) return -1
  const shot = await h.screenshot({ clip: box })
  return h.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, img.width, img.height).data
    let white = 0
    for (let i = 0; i < data.length; i += 4) if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) white++
    return white / (data.length / 4)
  }, shot.toString('base64'))
}

try {
  // App size off 100%, so the View menu's Actual Size would show if it changed it.
  await v('settings:set', { sounds: false, hintRate: 0, interfaceSize: 110 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'With a PDF', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  const bytes = await makePdf()
  // Dropped as Finder drops it: a File on the drop's DataTransfer.
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const file = new File([new Uint8Array(bytes)], 'probe-book.pdf', { type: 'application/pdf' })
    const data = new DataTransfer()
    data.items.add(file)
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(800)
  const seen = await h.evaluate(() => {
    const block = document.querySelector('.tiptap-attachment.is-pdf')
    if (!block) return null
    const scroll = block.querySelector('.tiptap-pdf-scroll').getBoundingClientRect()
    return {
      words: block.querySelector('.pdf-page[data-page="1"] .textLayer')?.textContent ?? '',
      sheets: block.querySelectorAll('.pdf-page').length,
      drawn: block.querySelectorAll('.pdf-page canvas').length,
      count: block.querySelector('.tiptap-attachment-size')?.textContent ?? '',
      tall: scroll.height,
      window: innerHeight,
      canvasW: block.querySelector('.pdf-page canvas')?.width ?? 0,
      shownW: block.querySelector('.pdf-page')?.getBoundingClientRect().width ?? 0,
    }
  })
  check('the dropped PDF becomes a PDF block in the note', !!seen, 'no .is-pdf block')
  const pdfSrc = await h.evaluate((sel) => {
    let src = ''
    document.querySelector(sel).editor.state.doc.descendants((node) => void (node.type.name === 'attachment' && (src = node.attrs.src)))
    return src
  }, EDITOR)
  if (!seen?.sheets) console.log('errors:', errors.slice(-5))
  // The block picked as a whole (as a drop leaves it): no grey band behind page 1's words.
  const picked1 = await h.evaluate((sel) => document.querySelector(sel).editor.state.selection.node?.type.name ?? '', EDITOR)
  const white1 = await whiteUnderWords()
  check('the block picked whole shows no band behind its words', white1 > 0.5, `${picked1}: ${white1}`)
  check("page 1's words are laid over it", /Page 1 of the probe book/.test(seen?.words ?? ''), seen?.words)
  check('a sheet for every page', seen?.sheets === 3, String(seen?.sheets))
  check('it says how many pages', /3 pages/.test(seen?.count ?? ''), seen?.count)
  check('the box is no taller than 70% of the window', seen && seen.tall <= seen.window * 0.7 + 1, JSON.stringify(seen))
  check('drawn at the screen density', seen?.canvasW > 0 && seen.canvasW >= Math.floor(seen.shownW * (await h.evaluate(() => devicePixelRatio))) - 1, JSON.stringify(seen))
  // Selecting the words works: a range over the first line reads back as text.
  const picked = await h.evaluate(() => {
    const span = [...document.querySelectorAll('.is-pdf .pdf-page[data-page="1"] .textLayer span')].find((one) => /quiet sentence/.test(one.textContent))
    if (!span) return ''
    const range = document.createRange()
    range.selectNodeContents(span)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    return getSelection().toString()
  })
  check('its text can be selected', /quiet sentence worth keeping/.test(picked), picked)
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-in-note.png` })

  // Open: full size in the pane, under the title the PDF carries.
  await h.click('.is-pdf button[aria-label="Open probe-book.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(600)
  const title = await h.evaluate(() => document.querySelector('.pdf-reader-title')?.textContent ?? '')
  check('Open shows it full size in the pane', !!title, 'no .pdf-reader')
  check("under the PDF's own title", title === 'The Probe Book', title)
  await wait(300)
  const named = await h.evaluate(() => ({ file: document.body.innerText.includes('probe-book'), times: document.body.innerText.split('The Probe Book').length - 1 }))
  check("the window's top bar names it the same, not by its file name", !named.file && named.times >= 2, JSON.stringify(named))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-pane-open.png` })
  const widthAt = () => h.evaluate(() => document.querySelector('.pdf-reader .pdf-page')?.getBoundingClientRect().width ?? 0)
  const before = await widthAt()
  await h.click('.pdf-reader button[aria-label="Larger"]', { timeout: 4000 }); await wait(200)
  await h.click('.pdf-reader button[aria-label="Larger"]'); await wait(800)
  const after = await widthAt()
  check('Larger zooms the pages in', after > before * 1.15, `${before} -> ${after}`)
  const zoomed = await h.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="1"] .textLayer span')].find((one) => /quiet sentence/.test(one.textContent))
    if (!span) return { text: '', fits: false }
    const range = document.createRange()
    range.selectNodeContents(span)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    const words = span.getBoundingClientRect(), sheet = span.closest('.pdf-page').getBoundingClientRect()
    return { text: getSelection().toString(), fits: words.width > 0.4 * sheet.width && words.right <= sheet.right }
  })
  check('zoomed in, the text still selects and sits over its words', /quiet sentence/.test(zoomed.text) && zoomed.fits, JSON.stringify(zoomed))
  await h.click('.pdf-reader button[aria-label="Fit width"]'); await wait(600)
  check('Fit width puts it back', Math.abs((await widthAt()) - before) < 2, String(await widthAt()))
  // ⌘+ and ⌘0, pressed and from the View menu: the pages zoom, the app's size stays.
  const appSize = async () => (await v('settings')).interfaceSize ?? 100
  const sizeBefore = await appSize()
  await h.keyboard.press('Meta+Equal'); await wait(800)
  check('⌘+ zooms the PDF', (await widthAt()) > before * 1.05, `${before} -> ${await widthAt()}`)
  await c.electron.evaluate(({ Menu, BrowserWindow }) => {
    const find = (items) => { for (const item of items) { if (item.label === 'Actual Size') return item; const inner = item.submenu && find(item.submenu.items); if (inner) return inner } return null }
    const item = find(Menu.getApplicationMenu().items)
    const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
    item.click(undefined, win, win.webContents)
  })
  await wait(800)
  check("the View menu's Actual Size fits the PDF again", Math.abs((await widthAt()) - before) < 2, String(await widthAt()))
  check("and the app's own size is untouched", (await appSize()) === sizeBefore, `${sizeBefore} -> ${await appSize()}`)
  // The PDF's own outline: its entries, each going to its page.
  await h.waitForSelector('.pdf-reader button[aria-label="Outline"]', { timeout: 4000 }).catch(() => {})
  await h.click('.pdf-reader button[aria-label="Outline"]', { timeout: 4000 }); await wait(300)
  const entries = await h.evaluate(() => [...document.querySelectorAll('.pdf-outline-row')].map((one) => one.textContent))
  check("the outline lists the PDF's own contents", JSON.stringify(entries) === JSON.stringify(['Chapter 11', 'Chapter 22', 'Chapter 33']), JSON.stringify(entries))
  await h.click('.pdf-outline-row:nth-child(2)'); await wait(800)
  check('an entry goes to its page', await h.evaluate(() => document.querySelector('.pdf-reader-page-field').value) === '2', '')
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-outline.png` })
  await h.click('.pdf-reader button[aria-label="Outline"]'); await wait(300)
  // ⌘F: every match counted, Return steps to the next page's, each one marked on its page.
  await h.click('.pdf-reader-scroll'); await h.keyboard.press('Meta+KeyF'); await wait(300)
  check('⌘F opens find in the PDF', await h.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Find in PDF'), '')
  await h.keyboard.type('quiet sentence'); await wait(800)
  const count = await h.evaluate(() => document.querySelector('.pdf-find-bar .tiptap-find-bar-count')?.getAttribute('aria-label'))
  check('it finds the words on all 3 pages', count === '1 of 3', String(count))
  await h.keyboard.press('Enter'); await h.keyboard.press('Enter'); await wait(1000)
  const onMatch = await h.evaluate(() => ({ field: document.querySelector('.pdf-reader-page-field').value, current: document.querySelector('.pdf-mark.is-find.is-current')?.closest('.pdf-page')?.dataset.page }))
  check('Return steps to the match on page 3, marked', onMatch.field === '3' && onMatch.current === '3', JSON.stringify(onMatch))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-find.png` })
  await h.keyboard.press('Escape'); await wait(300)
  check('Esc closes find and its marks', await h.evaluate(() => !document.querySelector('.pdf-find-bar') && !document.querySelector('.pdf-mark.is-find')), '')
  await h.fill('.pdf-reader-page-field', '3'); await h.keyboard.press('Enter'); await wait(800)
  const onPage = await h.evaluate(() => {
    const box = document.querySelector('.pdf-reader-scroll').getBoundingClientRect()
    const sheet = document.querySelector('.pdf-reader .pdf-page[data-page="3"]').getBoundingClientRect()
    return { field: document.querySelector('.pdf-reader-page-field').value, top: Math.round(sheet.top - box.top) }
  })
  await wait(1500)
  const drawnNow = await h.evaluate(() => [...document.querySelectorAll('.pdf-reader .pdf-page')].map((one) => `${one.dataset.page}:${one.querySelector('canvas') ? 'drawn' : 'empty'}`).join(' '))
  check('the page gone to is drawn', /3:drawn/.test(drawnNow), drawnNow)
  check('typing a page goes there', onPage.field === '3' && onPage.top < 60, JSON.stringify(onPage))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-pane.png` })
  // Highlight to gem: words picked on page 3 offer "Keep"; Keep makes a gem with the quote, the book and the page.
  await h.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="3"] .textLayer span')].find((one) => /quiet sentence/.test(one.textContent))
    const text = span.firstChild
    const range = document.createRange()
    range.setStart(text, 2)
    range.setEnd(text, 'A quiet sentence worth keeping'.length)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await h.waitForSelector('.pdf-keep-bar button[aria-label="Keep"]', { timeout: 4000 }).catch(() => {})
  check('picked words offer Keep', await h.evaluate(() => !!document.querySelector('.pdf-keep-bar button[aria-label="Keep"]')), '')
  await h.click('.pdf-keep-bar button[aria-label="Keep"]'); await wait(900)
  const kept = await h.evaluate(async () => {
    const one = document.querySelector('.pdf-reader .pdf-mark')
    return { band: !!one, page: one?.closest('.pdf-page')?.dataset.page }
  })
  check('the kept words are marked on their page', kept.band && kept.page === '3', JSON.stringify(kept))
  const marks = await v('pdf:highlights', pdfSrc)
  check('the highlight is saved with its page and words', marks.length === 1 && marks[0].page === 3 && marks[0].quote === 'quiet sentence worth keeping', JSON.stringify(marks))
  const gem = marks[0]?.gemId ? await v('item', marks[0].gemId) : null
  const body = JSON.stringify(gem?.body ?? '')
  check('Keep made a gem holding the quote', /quiet sentence worth keeping/.test(body), body.slice(0, 200))
  check('the gem names the book and page', gem?.attribution === 'The Probe Book, p. 3', String(gem?.attribution))
  check('the gem links back to the page and mark', body.includes(`#page=3&mark=${marks[0]?.id}`), body.slice(0, 300))
  // Zoomed in, the mark is drawn again over the same words.
  await h.click('.pdf-reader button[aria-label="Larger"]'); await wait(1200)
  const overWords = await h.evaluate(() => {
    const band = document.querySelector('.pdf-reader .pdf-page[data-page="3"] .pdf-mark')?.getBoundingClientRect()
    const span = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="3"] .textLayer span')].find((one) => /quiet sentence/.test(one.textContent))?.getBoundingClientRect()
    return band && span ? { top: Math.round(band.top - span.top), left: Math.round(band.left - span.left), w: Math.round(band.width), sw: Math.round(span.width) } : null
  })
  check('zoomed in, the mark is redrawn over its words', overWords && Math.abs(overWords.top) < 4 && overWords.left > 0 && overWords.w < overWords.sw, JSON.stringify(overWords))
  await h.click('.pdf-reader button[aria-label="Fit width"]'); await wait(600)
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-mark.png` })
  // Right-click on it: open its gem, or remove the highlight.
  const at = await h.evaluate(() => { const r = document.querySelector('.pdf-reader .pdf-mark').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(500)
  const menu = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))
  check('right-click on a mark offers its gem and removing it', menu.includes('Open its gem') && menu.includes('Remove highlight'), JSON.stringify(menu))
  // "Open its gem" opens the gem Keep made, in place of the reader; Back returns to the PDF.
  await h.click('[role="menuitem"]:has-text("Open its gem")'); await wait(1200)
  const gemShown = await h.evaluate((gemId) => ({ open: !!document.querySelector(`[data-open="${gemId}"]`), reader: !!document.querySelector('.pdf-reader'), words: document.querySelector(`[data-open="${gemId}"]`)?.textContent.includes('quiet sentence worth keeping') ?? false }), marks[0]?.gemId)
  check('"Open its gem" opens the gem with its quote', gemShown.open && gemShown.words && !gemShown.reader, JSON.stringify(gemShown))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-open-gem.png` })
  await h.keyboard.press('Meta+BracketLeft')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="3"] canvas', { timeout: 10000 }).catch(() => {})
  await wait(800)
  const returned = await h.evaluate(() => {
    const box = document.querySelector('.pdf-reader-scroll')?.getBoundingClientRect()
    const sheet = document.querySelector('.pdf-reader .pdf-page[data-page="3"]')?.getBoundingClientRect()
    return { reader: !!document.querySelector('.pdf-reader'), page: document.querySelector('.pdf-reader-page-field')?.value, top: box && sheet ? Math.round(sheet.top - box.top) : null }
  })
  check('Back from the gem returns to the PDF', returned.reader, JSON.stringify(returned))
  check('at the page you were on, not page 1', returned.page === '3' && returned.top !== null && Math.abs(returned.top) < 60, JSON.stringify(returned))
  await h.fill('.pdf-reader-page-field', '3'); await h.keyboard.press('Enter'); await wait(1000)

  // Paper pages, read off the screen: the white turns warm, the orange square stays orange.
  const pixels = async () => {
    const sheet = await h.evaluate(() => { const r = document.querySelector('.pdf-reader .pdf-page[data-page="3"]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })
    const shot = await h.screenshot({ clip: { x: sheet.x, y: sheet.y, width: sheet.w, height: sheet.h } })
    return h.evaluate(async ([b64, w]) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
      // Measured on the page in CSS pixels, then into the shot's own pixels.
      const scale = img.width / w
      const at = (x, y) => [...ctx.getImageData(Math.round((x / 400) * w * scale), Math.round((y / 400) * w * scale), 1, 1).data].slice(0, 3)
      return { paper: at(300, 120), picture: at(80, 220) }
    }, [shot.toString('base64'), sheet.w])
  }
  const light = await pixels()
  await h.click('.pdf-reader button[aria-label="Paper pages"]'); await wait(600)
  const warm = await pixels()
  check('paper pages: the white turns to warm paper', warm.paper[0] > warm.paper[2] + 12 && light.paper.every((one) => one > 245), JSON.stringify({ light, warm }))
  check('and the picture keeps its colour', warm.picture.every((one, i) => Math.abs(one - light.picture[i]) < 24) && warm.picture[0] > warm.picture[1] + 80, JSON.stringify({ light, warm }))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-pane-paper.png` })
  await h.click('.pdf-reader button[aria-label="White pages"]')
  await h.keyboard.press('Meta+BracketLeft'); await wait(1200)
  check('Back returns to the note', await h.evaluate(() => !document.querySelector('.pdf-reader') && !!document.querySelector('.is-pdf')), '')

  // Reopened, the highlight is drawn again; the gem's link opens the PDF at page 3 with it flashing.
  const link = await h.evaluate(async (src) => {
    const marks = await window.api.haligtree('pdf:highlights', src)
    return `${src}#page=3&mark=${marks[0].id}&name=probe-book.pdf`
  }, pdfSrc)
  await h.evaluate((href) => document.querySelector('[data-open] .tiptap').editor.chain().focus('end').insertContent(`<p><a href="${href}">back to the book</a></p>`).run(), link)
  await wait(400)
  const linkBox = await h.evaluate(() => { const r = [...document.querySelectorAll('[data-open] .tiptap a')].find((one) => one.textContent === 'back to the book').getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 } })
  await h.keyboard.down('Meta'); await h.mouse.click(linkBox.x, linkBox.y); await h.keyboard.up('Meta')
  await h.waitForSelector('.pdf-reader .pdf-mark', { timeout: 10000 }).catch(() => {})
  await wait(300)
  const back = await h.evaluate(() => {
    const box = document.querySelector('.pdf-reader-scroll')?.getBoundingClientRect()
    const sheet = document.querySelector('.pdf-reader .pdf-page[data-page="3"]')?.getBoundingClientRect()
    return { open: !!box, field: document.querySelector('.pdf-reader-page-field')?.value, top: box && sheet ? Math.round(sheet.top - box.top) : null, flash: !!document.querySelector('.pdf-reader .pdf-mark.is-flash') }
  })
  check("the gem's link opens the PDF at its page", back.open && back.field === '3' && back.top !== null && back.top < 60, JSON.stringify(back))
  check('with the mark drawn again and flashing', back.flash, JSON.stringify(back))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-link-back.png` })
  // ⌥-click Open: the PDF to the side, the note beside it.
  await h.keyboard.press('Meta+BracketLeft'); await wait(1200)
  await h.keyboard.down('Alt'); await h.click('.is-pdf button[aria-label="Open probe-book.pdf"]'); await h.keyboard.up('Alt')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] canvas', { timeout: 10000 }).catch(() => {})
  await wait(800)
  const side = await h.evaluate(() => ({ reader: !!document.querySelector('.pdf-reader'), note: !!document.querySelector('.tiptap-attachment.is-pdf') }))
  check('⌥-click Open puts the PDF beside the note', side.reader && side.note, JSON.stringify(side))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-beside-note.png` })
  const white2 = await whiteUnderWords()
  check('beside the reader, the block shows no band behind its words', white2 > 0.5, String(white2))

  // The slash menu's "PDF" in a fresh note, typed as a person types: the picker hands back a PDF, its pages show.
  await h.evaluate(([bytes]) => {
    const file = new File([new Uint8Array(bytes)], 'slash-book.pdf', { type: 'application/pdf' })
    // The picker stands in for Finder's: clicking the file input picks this PDF.
    HTMLInputElement.prototype.click = function () {
      if (this.type !== 'file') return
      const data = new DataTransfer(); data.items.add(file)
      this.files = data.files
      window.__accept = this.accept
      this.dispatchEvent(new Event('change'))
    }
  }, [bytes])
  const fresh = await v('article:new')
  await v('item:save', fresh, { title: 'Slash PDF', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', fresh); await wait(1400)
  // Two notes are open side by side now: type in the fresh one.
  const FRESH = `[data-open="${fresh}"] .tiptap`
  await h.click(`${FRESH} p`)
  await h.keyboard.type('/pdf'); await wait(600)
  const offered = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-title')].map((one) => one.textContent.trim()))
  check('typing /pdf in a fresh note shows the slash menu with "PDF"', offered.includes('PDF'), JSON.stringify(offered))
  await h.click('.tiptap-slash-menu-title:text-is("PDF")', { timeout: 3000 }).catch(() => {})
  await h.waitForSelector(`${FRESH} .tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer span`, { timeout: 15000 }).catch(() => {})
  const slashed = await h.evaluate((sel) => ({ accept: window.__accept, words: document.querySelector(`${sel} .tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer`)?.textContent ?? '', slash: document.querySelector(sel).textContent.includes('/pdf') }), FRESH)
  check('"PDF" picks only PDFs and puts its pages in the note, the /pdf gone', /pdf/.test(slashed.accept) && /Page 1 of the probe book/.test(slashed.words) && !slashed.slash, JSON.stringify(slashed))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-slash.png` })
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
