// A PDF dropped into a note shows its pages in the note, page 1's words
// readable and selectable, with its page count.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-pdf/main/index.js HALIGTREE_QA_AWAY=1 node qa/pdf-reader.mjs
import zlib from 'node:zlib'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { copiedText, paste } from './pasteboard.mjs'
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

// The dictionary and Wikipedia, as small servers here (honoured only in a probe): words are looked up without the internet.
const { createServer } = await import('node:http')
// Answered after a moment, as a real dictionary and Wikipedia are, so the wait itself can be seen.
const answer = (req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url.startsWith('/dict/quiet')) return res.end(JSON.stringify([{ word: 'quiet', meanings: [{ partOfSpeech: 'adjective', definitions: [{ definition: 'Making little or no noise.' }] }] }]))
  if (req.url.startsWith('/wiki/quiet')) return res.end(JSON.stringify({ type: 'standard', title: 'Quiet', description: 'Absence of noise', extract: 'Quiet is the lack of noise or disturbance.', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Quiet.jpg/320px-Quiet.jpg' }, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Quiet' } } }))
  res.statusCode = 404
  res.end('{}')
}
const lookups = createServer((req, res) => void setTimeout(() => answer(req, res), 3000))
await new Promise((done) => lookups.listen(0, '127.0.0.1', done))
process.env.HALIGTREE_QA_DICT = `http://127.0.0.1:${lookups.address().port}/dict/`
process.env.HALIGTREE_QA_WIKI = `http://127.0.0.1:${lookups.address().port}/wiki/`

const { check, done } = checks()
// Under the width where a PDF on its own starts with both sides open (checked at the end).
const c = await sandbox({ width: 1390, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
/** A reader tool by its name, as a person reaches it: on the bar, or behind "More" when a narrow pane folds the tools away. */
const tool = async (label) => {
  const shown = h.locator(`.pdf-reader .pdf-reader-bar button[aria-label="${label}"]:visible`).first()
  if (await shown.count()) return shown.click()
  // "More" shuts after a row is picked (its zoom buttons keep it open): opened only when it is shut.
  // A row of the menu (its words), or one of the zoom row's buttons, which leave it open.
  const row = `[data-fit-menu] :is([data-tool="${label}"], button[aria-label="${label}"])`
  if (!(await h.locator(row).count())) {
    await h.click('.pdf-reader .pdf-reader-bar button[aria-label="More"]'); await wait(300)
  }
  await h.click(row)
}
/** The page's words a floating field covers: none, when it is placed right. */
const hiddenWords = (selector = '.pdf-reader .pdf-why') => h.evaluate((selector) => {
  const field = document.querySelector(selector)?.getBoundingClientRect()
  if (!field) return ['no field']
  return [...document.querySelectorAll('.pdf-reader .textLayer span')].filter((one) => {
    if (!one.textContent.trim() || one.querySelector('span')) return false
    const r = one.getBoundingClientRect()
    return r.width && r.left < field.right && r.right > field.left && r.top < field.bottom && r.bottom > field.top
  }).map((one) => one.textContent)
}, selector)
const errors = []
h.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
h.on('pageerror', (e) => errors.push(String(e)))
const EDITOR = '[data-open] .tiptap:not(.is-line):not(.is-plain)'
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

/** The share of the words' box in the page's own colour, read from a bare spot of the same page (dimmed or not). */
const pageUnderWords = async () => {
  const box = await h.evaluate(() => {
    const span = [...document.querySelectorAll('.tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer span')].find((one) => /probe book/.test(one.textContent))
    const r = span?.getBoundingClientRect()
    const page = span?.closest('.pdf-page')?.getBoundingClientRect()
    return r && page ? { x: r.left, y: r.top, width: r.width, height: r.height, bare: { x: page.left + 8, y: page.top + 8, width: 2, height: 2 } } : null
  })
  if (!box) return -1
  const [shot, bare] = [await h.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } }), await h.screenshot({ clip: box.bare })]
  return h.evaluate(async ([b64, bareB64]) => {
    const read = async (src) => {
      const img = new Image(); img.src = `data:image/png;base64,${src}`; await img.decode()
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, img.width, img.height).data
    }
    const data = await read(b64)
    const paper = await read(bareB64)
    let same = 0
    for (let i = 0; i < data.length; i += 4) if ([0, 1, 2].every((k) => Math.abs(data[i + k] - paper[k]) <= 3)) same++
    return same / (data.length / 4)
  }, [shot.toString('base64'), bare.toString('base64')])
}

try {
  // App size off 100%, so the View menu's Actual Size would show if it changed it.
  await v('settings:set', { sounds: false, hintRate: 0, interfaceSize: 110 })
  // Paper pages are on by default; this run starts from white to see the switch turn them.
  await h.evaluate(() => { localStorage.setItem('pdf-paper', '0'); window.dispatchEvent(new CustomEvent('haligtree:pdf-paper')) })
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
  // G and g g, as in every list and the web reader (the user, 15 Nov 2026: "why doesnt G and gg work in reader mode").
  const pdfScroll = () => h.evaluate(() => { const box = document.querySelector('.pdf-reader .pdf-page')?.closest('.pdf-reader-scroll') ?? null; return box ? { top: Math.round(box.scrollTop), end: Math.round(box.scrollHeight - box.clientHeight) } : null })
  await h.mouse.move(600, 400)
  await h.keyboard.press('Shift+G'); await wait(500)
  const pdfEnd = await pdfScroll()
  check('G goes to the end of the PDF', !!pdfEnd && pdfEnd.end > 0 && Math.abs(pdfEnd.top - pdfEnd.end) <= 2, JSON.stringify(pdfEnd))
  await h.keyboard.press('g'); await h.keyboard.press('g'); await wait(500)
  const pdfTop = await pdfScroll()
  check('g g goes back to its first page', !!pdfTop && pdfTop.top === 0, JSON.stringify(pdfTop))
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
  // At its smallest and largest, ⌘− and ⌘+ play the "nope" the note's text size plays at its ends (heard by name; the window is muted).
  await v('settings:set', { sounds: true })
  const heardSince = async (run) => {
    const from = await h.evaluate(() => (window.haligtreeHeard ?? []).length)
    await run(); await wait(300)
    return h.evaluate((n) => (window.haligtreeHeard ?? []).slice(n), from)
  }
  const downSteps = await heardSince(async () => { for (let i = 0; i < 4; i++) { await h.keyboard.press('Meta+Minus'); await wait(120) } })
  const atSmallest = await heardSince(() => h.keyboard.press('Meta+Minus'))
  check('zooming out to the smallest plays no "nope" on the way', !downSteps.includes('cue:nope'), downSteps.join(','))
  check('⌘− at the smallest plays "nope"', atSmallest.includes('cue:nope'), atSmallest.join(','))
  for (let i = 0; i < 11; i++) { await h.keyboard.press('Meta+Equal'); await wait(80) }
  const atLargest = await heardSince(() => h.keyboard.press('Meta+Equal'))
  check('⌘+ at the largest plays "nope"', atLargest.includes('cue:nope'), atLargest.join(','))
  await v('settings:set', { sounds: false })
  await h.keyboard.press('Meta+Digit0'); await wait(800)
  // The PDF's own outline: its entries, each going to its page.
  // The sidebar opens beside the pages, never over them: the pages keep the reader's full height.
  const fullHeight = await h.evaluate(() => Math.round(document.querySelector('.pdf-reader-scroll').getBoundingClientRect().height))
  await h.click('.pdf-reader button[aria-label="Sidebar"]', { timeout: 4000 }); await wait(600)
  const rail = await h.evaluate(() => ({ height: Math.round(document.querySelector('.pdf-reader-scroll').getBoundingClientRect().height), tabs: [...document.querySelectorAll('.pdf-rail [role="tab"]')].map((one) => one.textContent), thumbs: document.querySelectorAll('.pdf-rail .pdf-thumb').length, drawn: [...document.querySelectorAll('.pdf-rail .pdf-thumb canvas')].filter((one) => one.width > 0).length, here: document.querySelector('.pdf-thumb.is-here')?.getAttribute('aria-label'), railLeft: Math.round(document.querySelector('.pdf-rail').getBoundingClientRect().right), pagesLeft: Math.round(document.querySelector('.pdf-reader-scroll').getBoundingClientRect().left) }))
  check('the sidebar sits beside the pages, which keep their full height', rail.height === fullHeight && rail.pagesLeft >= rail.railLeft - 1, JSON.stringify({ fullHeight, ...rail }))
  check('it opens on the pages, each drawn small, the one on show ringed', JSON.stringify(rail.tabs) === JSON.stringify(['Pages', 'Outline']) && rail.thumbs === 3 && rail.drawn >= 1 && rail.here === 'Page 1', JSON.stringify(rail))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-rail-pages.png` })
  // Dark pages reach the strip too: a thumbnail's corner goes dark with its page, and back.
  const corner = () => h.evaluate(() => {
    const canvas = document.querySelector('.pdf-thumb-sheet canvas')
    if (!canvas?.width) return null
    const [r, g, b] = canvas.getContext('2d').getImageData(1, 1, 1, 1).data
    return Math.round((r + g + b) / 3)
  })
  const thumbLight = await corner()
  await h.evaluate(() => (localStorage.setItem('pdf-dark', '1'), window.dispatchEvent(new StorageEvent('storage', { key: 'pdf-dark' }))))
  await wait(1500)
  const thumbDark = await corner()
  await h.evaluate(() => (localStorage.setItem('pdf-dark', '0'), window.dispatchEvent(new StorageEvent('storage', { key: 'pdf-dark' }))))
  await wait(1500)
  check('dark pages: the thumbnails go dark, and back', thumbLight > 200 && thumbDark < 60 && (await corner()) > 200, `${thumbLight} ${thumbDark}`)
  await h.click('.pdf-thumb[aria-label="Page 3"]'); await wait(800)
  check('a page in the sidebar goes to it', await h.evaluate(() => document.querySelector('.pdf-reader-page-field').value) === '3', '')
  // Its edge dragged makes it wider, kept for the next PDF.
  const edge = await h.evaluate(() => { const r = document.querySelector('.pdf-rail-edge').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 200, w: Math.round(document.querySelector('.pdf-rail').getBoundingClientRect().width) } })
  await h.mouse.move(edge.x, edge.y); await h.mouse.down(); await h.mouse.move(edge.x + 60, edge.y, { steps: 6 }); await h.mouse.up(); await wait(300)
  const wider = await h.evaluate(() => ({ w: Math.round(document.querySelector('.pdf-rail').getBoundingClientRect().width), kept: localStorage.getItem('pdf-rail-width') }))
  check('dragging its edge widens it, and the width is kept', wider.w === edge.w + 60 && Number(wider.kept) === wider.w, JSON.stringify({ was: edge.w, ...wider }))
  await h.click('.pdf-rail [role="tab"]:has-text("Outline")'); await wait(300)
  const entries = await h.evaluate(() => [...document.querySelectorAll('[data-outline-row]')].map((one) => one.getAttribute('data-outline-title') + one.lastElementChild.textContent))
  check("the outline lists the PDF's own contents", JSON.stringify(entries) === JSON.stringify(['Chapter 11', 'Chapter 22', 'Chapter 33']), JSON.stringify(entries))
  await h.locator('[data-outline-row]').nth(1).click(); await wait(800)
  check('an entry goes to its page', await h.evaluate(() => document.querySelector('.pdf-reader-page-field').value) === '2', '')
  const lit = await h.evaluate(() => ({ here: document.querySelector('[data-outline-row][aria-current]')?.getAttribute('data-outline-title'), chapter: document.querySelector('[data-pdf-chapter]')?.textContent }))
  check('the chapter you are in is lit in the outline and named under the title', lit.here === 'Chapter 2' && lit.chapter === 'Chapter 2', JSON.stringify(lit))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-outline.png` })
  await h.click('.pdf-reader button[aria-label="Sidebar"]'); await wait(300)
  // ⌘F: every match counted, Return steps to the next page's, each one marked on its page.
  await h.click('.pdf-reader-scroll'); await h.keyboard.press('Meta+KeyF'); await wait(300)
  check('⌘F opens find in the PDF', await h.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Find in PDF'), '')
  await h.keyboard.type('quiet sentence'); await wait(800)
  const count = await h.evaluate(() => document.querySelector('.pdf-find-bar .tiptap-find-bar-count')?.getAttribute('aria-label'))
  // Find starts from the page you are on, so the match on show is the first on or after it: any of the 3.
  check('it finds the words on all 3 pages', / of 3$/.test(count ?? ''), String(count))
  for (let i = 0; i < 3 && (await h.evaluate(() => document.querySelector('.pdf-mark.is-find.is-current')?.closest('.pdf-page')?.dataset.page)) !== '3'; i++) { await h.keyboard.press('Enter'); await wait(500) }
  await wait(500)
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
  // Words picked across a line end keep the space between them ("the nature", never "thenature"): Keep reads the selection's words, as here.
  const across = await h.evaluate(() => {
    const spans = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="3"] .textLayer span')]
    const title = spans.find((one) => /probe book/.test(one.textContent))?.firstChild
    const line = spans.find((one) => /quiet sentence/.test(one.textContent))?.firstChild
    if (!title || !line) return null
    const range = document.createRange()
    range.setStart(title, title.textContent.length - 4)
    range.setEnd(line, 7)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    const said = getSelection().toString().replace(/\s+/g, ' ').trim()
    getSelection().removeAllRanges()
    return said
  })
  check('words picked across a line end keep their space', across === 'book A quiet', String(across))
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
  await wait(400)
  // No bar pops over the page: right-click on the words offers "Keep as a gem", with its key.
  check('picking words shows no bar over the page', await h.evaluate(() => !document.querySelector('.pdf-reader .pdf-keep-bar')), '')
  const keepAt = await h.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.click(keepAt.x, keepAt.y, { button: 'right' }); await wait(500)
  check('picked words offer Keep as a gem on right-click', await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].some((one) => one.textContent.trim().startsWith('Keep as a gem'))), '')
  await h.click('[role="menuitem"]:has-text("Keep as a gem")'); await wait(900)
  const kept = await h.evaluate(async () => {
    const one = document.querySelector('.pdf-reader .pdf-mark')
    return { band: !!one, page: one?.closest('.pdf-page')?.dataset.page }
  })
  check('the kept words are marked on their page', kept.band && kept.page === '3', JSON.stringify(kept))
  // Kept, it asks "Why keep this?" right there, focused: Return keeps the reason as the gem's own thought.
  const whyShown = await h.evaluate(() => document.activeElement?.classList.contains('pdf-why-field') ?? false)
  check('after Keep, "Why keep this?" is there and focused', whyShown, '')
  check('"Why keep this?" hides none of the page\'s words', (await hiddenWords()).length === 0, JSON.stringify(await hiddenWords()))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-why.png` })
  await h.keyboard.type('the line for chapter two'); await h.keyboard.press('Enter'); await wait(500)
  check('Return closes it', await h.evaluate(() => !document.querySelector('.pdf-why-field')), '')
  const marks = await v('pdf:highlights', pdfSrc)
  check('the highlight is saved with its page and words', marks.length === 1 && marks[0].page === 3 && marks[0].quote === 'quiet sentence worth keeping', JSON.stringify(marks))
  const gem = marks[0]?.gemId ? await v('item', marks[0].gemId) : null
  const body = JSON.stringify(gem?.body ?? '')
  check('Keep made a gem holding the quote', /quiet sentence worth keeping/.test(body), body.slice(0, 200))
  const gemWhy = (await v('glosses', marks[0]?.gemId)).map((one) => one.body)
  check('the reason is kept as the gem\'s thought', gemWhy.includes('the line for chapter two'), JSON.stringify(gemWhy))
  // The book is the gem's source and the page its place, never a person called "The Probe Book, p. 3"; it is a quote.
  check('the gem names the book as its source and the page as its place', gem?.medium === 'The Probe Book' && gem?.passage === 'p. 3' && !gem?.attribution && gem?.kind === 'quote', JSON.stringify({ medium: gem?.medium, passage: gem?.passage, attribution: gem?.attribution, kind: gem?.kind }))
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
  check('right-click on a mark offers its gem and removing it', menu.includes('In a gem: Open') && menu.includes('Remove highlight'), JSON.stringify(menu))
  // "In a gem: Open" opens the gem Keep made, in place of the reader; Back returns to the PDF.
  await h.click('[role="menuitem"]:has-text("In a gem: Open")'); await wait(1200)
  const gemShown = await h.evaluate((gemId) => ({ open: !!document.querySelector(`[data-open="${gemId}"]`), reader: !!document.querySelector('.pdf-reader'), words: document.querySelector(`[data-open="${gemId}"]`)?.textContent.includes('quiet sentence worth keeping') ?? false }), marks[0]?.gemId)
  check('"In a gem: Open" opens the gem with its quote', gemShown.open && gemShown.words && !gemShown.reader, JSON.stringify(gemShown))
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

  // Picked words offer more than a gem: "Highlight" alone, in a colour, "Keep", and "Copy with citation".
  const pickHeading = (from, to) => h.evaluate(([from, to]) => {
    const span = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="3"] .textLayer span')].find((one) => /Page 3 of the probe/.test(one.textContent))
    const range = document.createRange()
    range.setStart(span.firstChild, from)
    range.setEnd(span.firstChild, to)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  }, [from, to])
  await pickHeading(0, 6); await wait(400)
  const headAt = await h.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.click(headAt.x, headAt.y, { button: 'right' }); await wait(500)
  const bar = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemradio"]')].map((one) => one.getAttribute('aria-label') || one.textContent.trim()))
  check('the menu offers Highlight, the colours, Keep and Copy with citation', ['Highlight', 'Yellow', 'Green', 'Blue', 'Pink'].every((one) => bar.some((row) => row.startsWith(one))) && ['Keep as a gem', 'Copy with citation'].every((one) => bar.some((row) => row.startsWith(one))), JSON.stringify(bar))
  check('every row of the menu shows the hand', await h.evaluate(() => [...document.querySelectorAll('[role="menu"] :is([role="menuitem"], [role="menuitemradio"])')].every((one) => getComputedStyle(one).cursor === 'pointer')), '')
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-read-bar.png` })
  await h.click('[role="menu"] [role="menuitemradio"][aria-label="Green"]'); await wait(700)
  let all = await v('pdf:highlights', pdfSrc)
  const green = all.find((one) => one.quote === 'Page 3')
  check('a colour highlights the words without making a gem', green && green.color === 'green' && !green.gemId, JSON.stringify(all))
  check('and the mark is drawn in that colour', await h.evaluate((id) => document.querySelector(`.pdf-mark[data-mark="${id}"]`)?.style.getPropertyValue('--mark') === '#3fae5a', green?.id), '')
  // Keys: H highlights in the colour last used; ⇧⌘C copies the words with the book and page.
  await pickHeading(7, 9); await wait(400)
  await h.keyboard.press('Meta+Shift+c'); await wait(400)
  const copied = await copiedText(c.electron)
  check('⇧⌘C copies the words with the book and page', copied === '“of” (The Probe Book, p. 3)', copied)
  await pickHeading(7, 9); await wait(400)
  await h.keyboard.press('h'); await wait(700)
  all = await v('pdf:highlights', pdfSrc)
  const byKey = all.find((one) => one.quote === 'of')
  check('H highlights in the colour last used', byKey?.color === 'green' && !byKey.gemId, JSON.stringify(byKey))
  // Right-click a highlight: its colour, "Keep as a gem" (it has none yet), copy, remove.
  const greenAt = await h.evaluate((id) => { const r = document.querySelector(`.pdf-mark[data-mark="${id}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, green?.id)
  await h.mouse.click(greenAt.x, greenAt.y, { button: 'right' }); await wait(500)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')].map((one) => one.getAttribute('aria-label') ?? one.textContent.trim()))
  check('right-click on a highlight offers its colours, Keep as a gem, Copy with citation and Remove', ['Blue', 'Keep as a gem', 'Copy with citation', 'Remove highlight'].every((one) => rows.includes(one)), JSON.stringify(rows))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-mark-menu.png` })
  await h.click('[role="menuitemradio"][aria-label="Blue"]'); await wait(600)
  all = await v('pdf:highlights', pdfSrc)
  check('a colour from the menu recolours the highlight', all.find((one) => one.id === green?.id)?.color === 'blue', JSON.stringify(all))
  await h.mouse.click(greenAt.x, greenAt.y, { button: 'right' }); await wait(500)
  await h.click('[role="menuitem"]:has-text("Keep as a gem")'); await wait(900)
  all = await v('pdf:highlights', pdfSrc)
  const madeGem = all.find((one) => one.id === green?.id)?.gemId
  const greenGem = madeGem ? await v('item', madeGem) : null
  check('"Keep as a gem" on a highlight makes its gem, the book and page as on Keep', greenGem?.medium === 'The Probe Book' && greenGem?.passage === 'p. 3' && greenGem?.kind === 'quote' && JSON.stringify(greenGem?.body).includes(`mark=${green?.id}`), JSON.stringify({ medium: greenGem?.medium, passage: greenGem?.passage }))
  // Right-click on picked words: the bar's own actions.
  await pickHeading(10, 13); await wait(400)
  const pickedAt = await h.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.click(pickedAt.x, pickedAt.y, { button: 'right' }); await wait(500)
  const pickedRows = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))
  check('right-click on picked words offers Highlight, Keep as a gem and Copy with citation', ['Highlight', 'Keep as a gem', 'Copy with citation'].every((one) => pickedRows.some((row) => row.startsWith(one))), JSON.stringify(pickedRows))
  await h.keyboard.press('Escape'); await wait(300)
  await h.evaluate(() => getSelection().removeAllRanges())
  // L looks the words up where they sit: the dictionary's meaning and Wikipedia's summary, each kept as a Lookup with why and where.
  await h.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="3"] .textLayer span')].find((one) => /quiet sentence/.test(one.textContent))
    const range = document.createRange()
    range.setStart(span.firstChild, 2)
    range.setEnd(span.firstChild, 7)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  }); await wait(400)
  // While it is asked: the app's own orb and shimmering words, never grey bars; seen dark, then light.
  await c.look('dark'); await wait(300)
  await h.keyboard.press('l'); await wait(300)
  const waiting = await h.evaluate(() => [...document.querySelectorAll('.look-up .mf-orb-pill .mf-shimmer')].map((one) => one.textContent))
  check('while it is looked up, the card waits with the orb and its words', waiting.length > 0 && waiting.every((one) => /…$/.test(one ?? '')), JSON.stringify(waiting))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-look-up-waiting-dark.png` })
  await c.look('light'); await wait(150)
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-look-up-waiting-light.png` })
  await h.waitForSelector('.look-up [data-look="wikipedia"] .look-up-extract', { timeout: 10000 }).catch(() => {})
  await h.waitForSelector('.look-up [data-look="dictionary"] .look-up-meaning', { timeout: 10000 }).catch(() => {}); await wait(300)
  // A reader's Look Up: the word as a headword, its meaning, Wikipedia under a hairline; no field up front, the licence in the link's tip.
  const lookCard = await h.evaluate(() => { const one = document.querySelector('.look-up'); return one ? { words: one.querySelector('.look-up-headword')?.textContent, font: getComputedStyle(one.querySelector('.look-up-headword')).fontFamily, meaning: one.querySelector('[data-look="dictionary"] .look-up-meaning')?.textContent, wiki: one.querySelector('[data-look="wikipedia"] .look-up-extract')?.textContent, licence: one.querySelector('.look-up-link')?.getAttribute('title'), field: !!one.querySelector('input') } : null })
  check('L looks the words up: the word as a serif headword, the dictionary and Wikipedia, the licence in the link, no field up front', lookCard?.words === 'quiet' && /Fraunces/.test(lookCard.font) && /little or no noise/.test(lookCard.meaning) && /lack of noise/.test(lookCard.wiki) && /CC BY-SA/.test(lookCard.licence ?? '') && !lookCard.field, JSON.stringify(lookCard))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-look-up.png` })
  check('the article\'s lead picture (a Commons one) shows as its thumbnail', await h.evaluate(() => document.querySelector('.look-up .look-up-picture')?.getAttribute('src')?.startsWith('https://upload.wikimedia.org/wikipedia/commons/') ?? false), '')
  await c.look('dark'); await wait(500)
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-look-up-dark.png` })
  await c.look('light'); await wait(300)
  // One Keep keeps both together; then "Why keep this?" in place: Enter saves the line.
  await h.hover('[data-look-keep]'); await wait(200)
  check('Keep shows the hand', await h.evaluate(() => getComputedStyle(document.querySelector('[data-look-keep]')).cursor) === 'pointer', '')
  await h.click('[data-look-keep]'); await wait(900)
  check('after Keep, "Why keep this?" asks in place, focused', await h.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Why keep this'), '')
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-look-up-kept.png` })
  await h.keyboard.type('for the essay on silence'); await h.keyboard.press('Enter'); await wait(900)
  const lookedUp = await h.evaluate(async () => (await window.api.captures.find('quiet')).filter((one) => one.type === 'capture').map((one) => one.label))
  check('Keep keeps it as one Lookup', lookedUp.some((one) => /^quiet/i.test(one)), JSON.stringify(lookedUp))
  const keptBody = await h.evaluate(async () => { const found = (await window.api.captures.find('quiet')).find((one) => one.type === 'capture' && /^quiet/i.test(one.label)); return found ? JSON.stringify((await window.api.captures.get(found.id))?.body ?? '') : '' })
  check('with the meaning and Wikipedia together, the sentence round the words and where it was looked up', /lack of noise/.test(keptBody) && /A quiet sentence worth keeping/.test(keptBody) && /Looked up in/.test(keptBody) && /The Probe Book, p. 3/.test(keptBody), keptBody.slice(0, 300))
  const lookupWhy = await h.evaluate(async () => { const found = (await window.api.captures.find('quiet')).find((one) => one.type === 'capture' && /^quiet/i.test(one.label)); return found ? (await window.api.haligtree('glosses', found.id)).map((one) => one.body) : [] })
  check('and why, as its own thought', lookupWhy.includes('for the essay on silence'), JSON.stringify(lookupWhy))
  // The book is its source and the page its place: one Sources page for the book, never one per page.
  const lookupSource = await h.evaluate(async () => { const found = (await window.api.captures.find('quiet')).find((one) => one.type === 'capture' && /^quiet/i.test(one.label)); const one = found ? await window.api.captures.get(found.id) : null; return { medium: one?.medium, fields: one?.fields } })
  check('its source is the book alone, its page kept apart', lookupSource.medium === 'The Probe Book' && JSON.parse(lookupSource.fields ?? '{}').location === '3', JSON.stringify(lookupSource))
  await h.keyboard.press('Escape'); await wait(300)
  check('Esc puts the card away', await h.evaluate(() => !document.querySelector('.look-up')), '')
  // 10 Nov: with words still picked on the page, Esc and a press away both put the card away (the reader took Esc first).
  const pickAndLook = async () => {
    await h.evaluate(() => {
      const span = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="3"] .textLayer span')].find((one) => /quiet sentence/.test(one.textContent))
      const range = document.createRange(); range.setStart(span.firstChild, 2); range.setEnd(span.firstChild, 7)
      getSelection().removeAllRanges(); getSelection().addRange(range)
    }); await wait(300)
    await h.keyboard.press('l'); await h.waitForSelector('.look-up', { timeout: 5000 }).catch(() => {}); await wait(300)
  }
  await pickAndLook()
  await h.keyboard.press('Escape'); await wait(300)
  check('with words picked, Esc puts the card away', await h.evaluate(() => !document.querySelector('.look-up')), '')
  await pickAndLook()
  const page = await h.locator('.pdf-reader .pdf-page[data-page="3"]').boundingBox()
  await h.mouse.click(page.x + 12, page.y + page.height - 12); await wait(300)
  check('a press away puts the card away', await h.evaluate(() => !document.querySelector('.look-up')), '')
  await pickAndLook()
  await h.mouse.move(page.x + page.width / 2, page.y + 40); await h.mouse.wheel(0, 240); await wait(300)
  check('scrolling the page puts the card away', await h.evaluate(() => !document.querySelector('.look-up')), '')
  await h.evaluate(() => getSelection().removeAllRanges())
  // Details, at the right of the pages as a note's: what the book is, how far you have read, its highlights (searchable, by colour) and the notes that hold it.
  await h.click('.pdf-reader button[aria-label="Details"]'); await wait(800)
  const about = await h.evaluate(() => { const d = document.querySelector('.read-details'); return d ? { title: d.querySelector('.book-head-title')?.textContent, cover: !!d.querySelector('.book-head-cover img'), here: d.querySelector('[data-page-bar] [data-here]')?.dataset.here, pages: d.querySelector('[data-page-bar] .book-bar-ends span:last-child')?.textContent, marks: [...d.querySelectorAll('.read-details-mark-words')].map((one) => one.textContent), cited: d.querySelectorAll('[data-cited]').length, pagesLeft: Math.round(document.querySelector('.pdf-reader-scroll').getBoundingClientRect().right), detailsLeft: Math.round(d.getBoundingClientRect().left) } : null })
  check('Details shows the book, its cover and where you are on its page bar', about?.title === 'The Probe Book' && about.cover && about.here === about.pages?.replace('p. ', ''), JSON.stringify(about))
  check('its highlights are listed in page order', JSON.stringify(about?.marks) === JSON.stringify(['Page 3', 'of', 'quiet sentence worth keeping']), JSON.stringify(about?.marks))
  check('and the notes and gems that hold the book or link into it', about?.cited >= 2, JSON.stringify(about))
  check('Details sits beside the pages, never over them', about && about.detailsLeft >= about.pagesLeft - 1, JSON.stringify(about))
  await c.both(`${process.env.QA_SHOTS ?? '/tmp'}/pdf-details`)
  await h.fill('.read-details-find input', 'quiet'); await wait(300)
  check('finding in highlights narrows the list to those words', JSON.stringify(await h.evaluate(() => [...document.querySelectorAll('.read-details-mark-words')].map((one) => one.textContent))) === JSON.stringify(['quiet sentence worth keeping']), '')
  await h.fill('.read-details-find input', ''); await wait(200)
  await h.click('.read-details-colour[aria-label="Blue"]'); await wait(300)
  check('a colour shows only its highlights', JSON.stringify(await h.evaluate(() => [...document.querySelectorAll('.read-details-mark-words')].map((one) => one.textContent))) === JSON.stringify(['Page 3']), '')
  await h.click('.read-details-colour[aria-label="Blue"]'); await wait(300)
  await h.fill('.pdf-reader-page-field', '1'); await h.keyboard.press('Enter'); await wait(800)
  await h.click('.read-details-mark:has-text("quiet sentence")'); await wait(1000)
  const jumped = await h.evaluate(() => ({ page: document.querySelector('.pdf-reader-page-field')?.value, lit: document.querySelector('.pdf-reader .pdf-mark.is-flash')?.closest('.pdf-page')?.dataset.page }))
  check('a row goes to its page and lights the highlight', jumped.page === '3' && jumped.lit === '3', JSON.stringify(jumped))
  // "Gather into a note": one new note with every highlight as a quote, each linking back to its page.
  await h.click('.read-details-action:has-text("Gather into a note")'); await wait(1500)
  const gathered = await h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)'); return ed ? { quotes: ed.querySelectorAll('blockquote').length, links: [...ed.querySelectorAll('a')].map((a) => a.textContent) } : null })
  check('"Gather into a note" opens a note with each highlight quoted and linked to its page', gathered?.quotes === 3 && gathered.links.every((one) => one === 'The Probe Book, p. 3'), JSON.stringify(gathered))
  await h.keyboard.press('Meta+BracketLeft'); await wait(1200)
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="3"] canvas', { timeout: 10000 }).catch(() => {})
  if (await h.evaluate(() => !!document.querySelector('.read-details'))) await h.click('.pdf-reader button[aria-label="Details"]')
  await h.fill('.pdf-reader-page-field', '3'); await h.keyboard.press('Enter'); await wait(800)

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
  await h.click('.pdf-reader button[aria-label="View"]'); await wait(300); await h.locator('[data-page-layout-menu] [data-look-choice="paper"]').click(); await wait(600)
  const warm = await pixels()
  check('paper pages: the white turns to warm paper', warm.paper[0] > warm.paper[2] + 12 && light.paper.every((one) => one > 245), JSON.stringify({ light, warm }))
  check('and the picture keeps its colour', warm.picture.every((one, i) => Math.abs(one - light.picture[i]) < 24) && warm.picture[0] > warm.picture[1] + 80, JSON.stringify({ light, warm }))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-pane-paper.png` })
  await h.click('.pdf-reader button[aria-label="View"]'); await wait(300); await h.locator('[data-page-layout-menu] [data-look-choice="white"]').click(); await wait(300)
  await h.keyboard.press('Meta+BracketLeft'); await wait(1200)
  check('Back returns to the note', await h.evaluate(() => !document.querySelector('.pdf-reader') && !!document.querySelector('.is-pdf')), '')

  // Reopened, the highlight is drawn again; the gem's link opens the PDF at page 3 with it flashing.
  const link = await h.evaluate(async (src) => {
    const marks = await window.api.haligtree('pdf:highlights', src)
    return `${src}#page=3&mark=${marks[0].id}&name=probe-book.pdf`
  }, pdfSrc)
  await h.evaluate((href) => document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor.chain().focus('end').insertContent(`<p><a href="${href}">back to the book</a></p>`).run(), link)
  await wait(400)
  const linkBox = await h.evaluate(() => { const r = [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) a')].find((one) => one.textContent === 'back to the book').getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 } })
  // Pointed at, the link shows the book in the app's one PDF preview, open at the page it lands on, never its stored address.
  await h.mouse.move(linkBox.x, linkBox.y); await wait(1200)
  const hover = await h.evaluate(() => ({ corner: document.querySelector('[data-pdf-peek-card] [data-pdf-peek-page]')?.textContent?.trim(), page: !!document.querySelector('[data-pdf-peek-card] img')?.src.startsWith('data:image'), address: !!document.querySelector('.tiptap-link-preview') }))
  check('a PDF link says its page after its words, outside the link', await h.evaluate(() => { const link = [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) a')].find((one) => one.textContent === 'back to the book'); return link?.nextElementSibling?.classList.contains('mf-pdf-link-page') && link.nextElementSibling.textContent === ' · p. 3' && link.textContent === 'back to the book' }), '')
  check('a PDF link pointed at previews the book at its page (3 / 3), not its address', hover.corner === '3 / 3' && hover.page && !hover.address, JSON.stringify(hover))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-link-hover.png` })
  await h.mouse.click(linkBox.x, linkBox.y)
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
  // Opened again with no page of its own, it opens where you last read it.
  await wait(800)
  const place = await v('pdf:place', pdfSrc)
  check('the page last read is kept with the page count', place?.page === 3 && place.pages === 3, JSON.stringify(place))
  check('and opened again, the PDF opens at that page', await h.evaluate(() => document.querySelector('.pdf-reader-page-field')?.value) === '3', await h.evaluate(() => document.querySelector('.pdf-reader-page-field')?.value))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-beside-note.png` })
  // Beside the reader, the note's pane is the one behind, drawn a touch dimmer as a whole (panes.tsx): its page is
  // no longer pure white, so the words are measured against the page's own colour beside them.
  const white2 = await pageUnderWords()
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
  const FRESH = `[data-open="${fresh}"] .tiptap:not(.is-line):not(.is-plain)`
  await h.click(`${FRESH} p`)
  await h.keyboard.type('/pdf'); await wait(600)
  const offered = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-title')].map((one) => one.textContent.trim()))
  check('typing /pdf in a fresh note shows the slash menu with "PDF"', offered.includes('PDF'), JSON.stringify(offered))
  await h.click('.tiptap-slash-menu-title:text-is("PDF")', { timeout: 3000 }).catch(() => {})
  await h.waitForSelector(`${FRESH} .tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer span`, { timeout: 15000 }).catch(() => {})
  const slashed = await h.evaluate((sel) => ({ accept: window.__accept, words: document.querySelector(`${sel} .tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer`)?.textContent ?? '', slash: document.querySelector(sel).textContent.includes('/pdf') }), FRESH)
  check('"PDF" picks only PDFs and puts its pages in the note, the /pdf gone', /pdf/.test(slashed.accept) && /Page 1 of the probe book/.test(slashed.words) && !slashed.slash, JSON.stringify(slashed))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-slash.png` })

  // ⌘K finds the PDF by its own title and by the file's name, and opens it in the reader.
  const byTitle = await h.evaluate(() => window.api.captures.find('probe book'))
  const byName = await h.evaluate(() => window.api.captures.find('probe-book.pdf'))
  check('search finds the PDF by its title, once', byTitle.filter((one) => one.type === 'pdf').length === 1 && byTitle.find((one) => one.type === 'pdf')?.label === 'The Probe Book', JSON.stringify(byTitle.map((one) => [one.type, one.label])))
  check('and by its file name', byName.some((one) => one.type === 'pdf'), JSON.stringify(byName.map((one) => [one.type, one.label])))
  await h.keyboard.press('Escape'); await h.click('.pdf-reader-scroll, [data-open] .tiptap:not(.is-line):not(.is-plain)', { timeout: 3000 }).catch(() => {})
  await h.keyboard.press('Meta+k'); await wait(600)
  await h.keyboard.type('The Probe Book', { delay: 30 }); await wait(1200)
  const row = await h.evaluate(() => [...document.querySelectorAll('[data-drag-open^="pdf:"]')].map((one) => one.textContent.trim()))
  check('⌘K lists the PDF under its title', row.some((one) => one.includes('The Probe Book')), JSON.stringify(row))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-search.png` })
  // Its row previews the pages on hover, as everywhere a PDF is named: the cover, then across the card to the last page.
  const rowName = h.locator('[data-drag-open^="pdf:"] [data-pdf-peek]').first()
  check('the ⌘K row carries the PDF preview', (await rowName.count()) === 1, '')
  if (await rowName.count()) {
    await rowName.hover(); await wait(1000)
    const rowPeek = await h.evaluate(() => document.querySelector('[data-pdf-peek-card] [data-pdf-peek-page]')?.textContent?.trim())
    const face = await h.evaluate(() => { const r = document.querySelector('[data-pdf-peek-card] [role="button"]')?.getBoundingClientRect(); return r && { left: r.left, top: r.top, width: r.width, height: r.height } })
    if (face) {
      const below = face.top > (await rowName.boundingBox()).y
      await h.mouse.move(face.left + face.width * 0.1, below ? face.top - 4 : face.top + face.height + 4, { steps: 2 })
      await h.mouse.move(face.left + face.width * 0.1, face.top + face.height / 2, { steps: 4 })
      await h.mouse.move(face.left + face.width * 0.9, face.top + face.height / 2, { steps: 8 }); await wait(800)
    }
    const rowEnd = await h.evaluate(() => document.querySelector('[data-pdf-peek-card] [data-pdf-peek-page]')?.textContent?.trim())
    await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-search-peek.png` })
    check('hovering the ⌘K row shows the cover, and the pointer across it turns to the last page', rowPeek === '1 / 3' && rowEnd === '3 / 3', JSON.stringify({ rowPeek, rowEnd }))
    await h.mouse.move(0, 0); await wait(300)
  }
  await h.click('[data-drag-open^="pdf:"]'); await wait(300)
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] canvas', { timeout: 10000 }).catch(() => {})
  check('picking it opens it in the reader', await h.evaluate(() => document.querySelector('.pdf-reader-title')?.textContent) === 'The Probe Book', '')

  // A PDF file copied in Finder and pasted into a note: its block, not its icon or name.
  const { writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const finderFile = join(process.env.QA_DATA ?? '/tmp', 'finder-book.pdf')
  writeFileSync(finderFile, Buffer.from(bytes))
  const pasted = await v('article:new')
  await v('item:save', pasted, { title: 'Pasted PDF', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', pasted); await wait(1400)
  const PASTED = `[data-open="${pasted}"] .tiptap:not(.is-line):not(.is-plain)`
  // As Finder's ⌘C then ⌘V hands it to the page: the file, with its place on disk (qa/pasteboard.mjs).
  await h.click(`${PASTED} p`); await paste(h, { paths: [finderFile] })
  await h.waitForSelector(`${PASTED} .tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer span`, { timeout: 15000 }).catch(() => {})
  const fromFinder = await h.evaluate((sel) => ({ name: document.querySelector(`${sel} .tiptap-attachment.is-pdf .tiptap-attachment-name`)?.textContent, words: document.querySelector(`${sel} .is-pdf .pdf-page[data-page="1"] .textLayer`)?.textContent ?? '', pictures: document.querySelectorAll(`${sel} img`).length }), PASTED)
  check('a PDF copied in Finder pastes as its PDF block', fromFinder.name === 'finder-book.pdf' && /Page 1 of the probe book/.test(fromFinder.words) && !fromFinder.pictures, JSON.stringify(fromFinder))
  // A PDF on the clipboard as a file (as Chromium hands some apps' copies over): the same.
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    ed.commands.focus('end')
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'clip-book.pdf', { type: 'application/pdf' }))
    ed.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, [PASTED, bytes])
  await wait(1500)
  check('a PDF file on the clipboard pastes as its block too', await h.evaluate((sel) => [...document.querySelectorAll(`${sel} .tiptap-attachment.is-pdf .tiptap-attachment-name`)].some((one) => one.textContent === 'clip-book.pdf'), PASTED), '')

  // A link card for a PDF on the web: "Open in the reader" fetches it once into the book and opens it.
  const SITE = 'http://93.184.216.34'
  await c.electron.evaluate((_, [site, pdf]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.__pdfHits = 0
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      globalThis.__pdfHits += 1
      if (new URL(url).pathname === '/papers/web-book.pdf') return new Response(Buffer.from(pdf), { headers: { 'content-type': 'application/pdf' } })
      return new Response('', { status: 404 })
    }
  }, [SITE, bytes])
  await h.evaluate(([sel, href]) => document.querySelector(sel).editor.chain().focus('end').insertContent({ type: 'bookmark', attrs: { href, title: 'A web book', site: '93.184.216.34' } }).run(), [PASTED, `${SITE}/papers/web-book.pdf`])
  await wait(600)
  const card = h.locator(`${PASTED} .tiptap-bookmark`).last()
  await card.hover(); await wait(200)
  check('a card for a PDF offers "Open in the reader"', await card.locator('button[aria-label="Open in the reader"]').count() === 1, '')
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-web-card.png` })
  await card.locator('button[aria-label="Open in the reader"]').click()
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] canvas', { timeout: 10000 }).catch(() => {})
  await wait(400)
  const webOpen = await h.evaluate(() => ({ title: document.querySelector('.pdf-reader-title')?.textContent, src: document.querySelector('.pdf-reader') ? 'open' : '' }))
  check('it opens in the reader', webOpen.title === 'The Probe Book', JSON.stringify(webOpen))
  await h.keyboard.press('Meta+BracketLeft'); await wait(1200)
  await h.locator(`${PASTED} .tiptap-bookmark`).last().hover()
  await h.locator(`${PASTED} .tiptap-bookmark button[aria-label="Open in the reader"]`).last().click()
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] canvas', { timeout: 10000 }).catch(() => {})
  const hits = await c.electron.evaluate(() => globalThis.__pdfHits)
  check('opened again, it is not fetched again', hits === 1 && await h.evaluate(() => !!document.querySelector('.pdf-reader')), `fetched ${hits} times`)
  await h.keyboard.press('Meta+BracketLeft'); await wait(1000)

  // Quick capture: a PDF dropped in is kept with the capture, and shows as its block once the capture opens.
  await c.page.evaluate(() => window.api.showPrompt()); await c.page.waitForTimeout(800)
  await c.page.evaluate(([bytes]) => {
    const ed = document.querySelector('.haligtree-editor[contenteditable=true]').editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'box-book.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 10, clientY: box.top + 10 }))
  }, [bytes])
  await c.page.waitForSelector('.tiptap-attachment.is-pdf', { timeout: 10000 }).catch(() => {})
  await c.page.waitForTimeout(600)
  check('dropped into quick capture, it shows as the PDF block', await c.page.evaluate(() => !!document.querySelector('.tiptap-attachment.is-pdf')), '')
  await c.page.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-quick-capture.png` })
  await c.page.keyboard.press('Alt+Meta+Enter'); await c.page.waitForTimeout(1200)
  let boxed = null
  for (let i = 0; i < 30 && !boxed; i++) {
    boxed = await h.evaluate(async () => {
      for (const meta of await window.api.captures.list()) {
        const one = await window.api.captures.get(meta.id)
        if (JSON.stringify(one?.body ?? '').includes('box-book.pdf')) return meta.id
      }
      return null
    })
    if (!boxed) await wait(300)
  }
  check('the capture keeps the PDF', !!boxed, '')
  if (boxed) {
    await c.send('capture', boxed); await wait(1500)
    await h.waitForSelector(`[data-open="${boxed}"] .tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer span`, { timeout: 15000 }).catch(() => {})
    check('opened, the capture shows the PDF block with its pages', /Page 1 of the probe book/.test(await h.evaluate((id) => document.querySelector(`[data-open="${id}"] .is-pdf .pdf-page[data-page="1"] .textLayer`)?.textContent ?? '', boxed)), '')
  }
  // Home's "Continue reading": a book part way through, its cover and how far you are; a click opens it at that page.
  await v('pdf:read', pdfSrc, 2, 3)
  await c.go('home'); await wait(1500)
  // Its covers row (picture-row.tsx): the book's cover, its title and page under it. One book fits whole, so it is the
  // still row (as Home's other shelves), not the flowing Flex Carousel, which only comes when more covers than fit.
  await h.evaluate(() => document.querySelector('[data-continue-reading] [data-picture-row]')?.scrollIntoView({ block: 'center' })); await wait(2500)
  const going = await h.evaluate(() => {
    const row = document.querySelector('[data-continue-reading] [data-picture-row]')
    if (!row) return null
    const flowing = row.querySelector('[data-flex-carousel]')
    if (flowing) return { kind: 'moving', words: [...flowing.closest('[data-flex-carousel-frame]').querySelectorAll('[data-flex-carousel-caption] span:not(.mf-caption-out)')].map((one) => one.textContent), cover: Number(flowing.dataset.fetched ?? 0) > 0 && !!flowing.querySelector('canvas') }
    const card = row.querySelector('[data-still-picture]')
    return card && { kind: 'still', words: [...card.querySelectorAll(':scope > span')].map((one) => one.textContent), cover: (card.querySelector('img')?.naturalWidth ?? 0) > 0 }
  })
  check('Home shows "Continue reading" with the book\'s cover, its title and its page', going?.words.includes('The Probe Book') && going.words.includes('p. 2 of 3') && going.cover, JSON.stringify(going))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/home-continue-reading.png` })
  const cover = await h.evaluate(() => { const r = document.querySelector('[data-continue-reading] :is([data-flex-carousel], [data-still-picture])').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await h.mouse.click(cover.x, cover.y); await wait(1500)
  check('a click opens the book at that page', await h.evaluate(() => document.querySelector('.pdf-reader-page-field')?.value) === '2', await h.evaluate(() => document.querySelector('.pdf-reader-page-field')?.value))
  // Cards straight from the page: C asks the question where the words were; ⇧C blanks them in their sentence.
  const pickOn = (page, words) => h.evaluate(([page, words]) => {
    const span = [...document.querySelectorAll(`.pdf-reader .pdf-page[data-page="${page}"] .textLayer span`)].find((one) => one.textContent.includes(words))
    const at = span.textContent.indexOf(words)
    const range = document.createRange()
    range.setStart(span.firstChild, at)
    range.setEnd(span.firstChild, at + words.length)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  }, [page, words])
  // Study cards since 31 Oct (Review only, tier 'card'); ⌥ or the setting keeps them as gems too.
  const cardsFromBook = async () => [...(await v('items', 'card')), ...(await v('items', 'nugget'))].filter((one) => one.medium === 'The Probe Book' && one.prompt)
  await pickOn(2, 'worth keeping'); await wait(500)
  await h.keyboard.press('c'); await wait(400)
  check('C opens the question field where the words were, focused', await h.evaluate(() => document.activeElement?.getAttribute('aria-label') === "The card's question"), '')
  check('the question field hides none of the page\'s words (it goes under the line when the line above has words)', (await hiddenWords()).length === 0, JSON.stringify(await hiddenWords()))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-card.png` })
  await h.keyboard.type('What is the sentence on page 2 worth?'); await h.keyboard.press('Enter'); await wait(900)
  const asked = (await cardsFromBook()).find((one) => one.prompt === 'What is the sentence on page 2 worth?')
  const askedBody = asked ? JSON.stringify((await v('item', asked.id))?.body ?? '') : ''
  check('Return makes a card: the words answer it, with the book and page', !!askedBody && /worth keeping/.test(askedBody) && asked.passage === 'p. 2' && askedBody.includes('#page=2'), askedBody)
  await pickOn(2, 'quiet'); await wait(500)
  await h.keyboard.press('Shift+C'); await wait(900)
  const blank = (await cardsFromBook()).find((one) => one.prompt?.includes('_____'))
  check('⇧C makes a fill-in-the-blank card from the sentence alone, not the heading above it', blank?.prompt === 'A _____ sentence worth keeping on page 2.', JSON.stringify(blank?.prompt))
  check('the count of cards from this source is said', /Card made: 2 from this source/.test(await h.evaluate(() => document.body.textContent)), '')
  // Snip: drag a rectangle over the page's figure (the orange square), make it a card's answer, or keep it as a gem.
  // "Snip" is called "Keep a figure" now (cdc1e815): plain words a student would use.
  await tool('Keep a figure'); await wait(300)
  check('Snip turns on a layer to drag over the pages', await h.evaluate(() => !!document.querySelector('[data-pdf-snip]')), '')
  const figure = await h.evaluate(() => {
    const page = document.querySelector('.pdf-reader .pdf-page[data-page="2"]')
    page.scrollIntoView({ block: 'start' })
    const r = page.getBoundingClientRect()
    return { x: r.left + r.width * 0.12, y: r.top + r.height * 0.55, w: r.width * 0.2, h: r.height * 0.15 }
  })
  await wait(400)
  await h.mouse.move(figure.x, figure.y); await h.mouse.down()
  await h.mouse.move(figure.x + figure.w, figure.y + figure.h, { steps: 6 })
  // Mid-drag, light and dark: the box being drawn over the page.
  await c.both(`${process.env.QA_SHOTS ?? '/tmp'}/pdf-snip-drag`)
  await h.mouse.up()
  // The cut is saved as a picture before Card and Keep show: waited for, not timed, as a loaded machine takes longer.
  const snipped = await h.waitForFunction(() => !!document.querySelector('.pdf-keep-bar button[aria-label="Card"]') && !!document.querySelector('.pdf-keep-bar button[aria-label="Keep"]') && !document.querySelector('[data-pdf-snip]'), null, { timeout: 10000 }).then(() => true, () => false)
  check('a dragged rectangle is cut out and offers Card and Keep', snipped, JSON.stringify(await h.evaluate(() => ({ layer: !!document.querySelector('[data-pdf-snip]'), box: !!document.querySelector('.pdf-snip-box'), bars: [...document.querySelectorAll('.pdf-keep-bar button')].map((one) => one.getAttribute('aria-label')), toast: document.querySelector('[role="status"]')?.textContent }))))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-snip.png` })
  await h.click('.pdf-keep-bar button[aria-label="Card"]'); await wait(400)
  await h.keyboard.type('What does figure 1 show?'); await h.keyboard.press('Enter'); await wait(900)
  const snipCard = (await cardsFromBook()).find((one) => one.prompt === 'What does figure 1 show?')
  const snipBody = snipCard ? JSON.stringify((await v('item', snipCard.id))?.body ?? '') : ''
  check('the snip is the card\'s answer: a picture, with the book and page', /!\[\]\(haligtree:\/\/assets\/[^)]+\.png\)/.test(snipBody) && snipBody.includes('#page=2') && snipCard?.passage === 'p. 2', snipBody.slice(0, 200))
  // "Mark for a card": words marked in its colour (key 6) on the first read; "Make your marked cards" asks for each one's card.
  await pickOn(3, 'on page 3'); await wait(500)
  await h.keyboard.press('6'); await wait(700)
  check('6 marks words "Mark for a card", and the bar counts them', await h.evaluate(() => document.querySelector('[data-card-later-count]')?.textContent === '1'), await h.evaluate(() => document.querySelector('[data-card-later-count]')?.textContent ?? 'none'))
  const laterLook = await h.evaluate(() => {
    const band = document.querySelector('.pdf-reader .pdf-mark.is-later')
    return band && { background: getComputedStyle(band).backgroundColor, underline: getComputedStyle(band).backgroundImage.includes('repeating-linear-gradient') ? 'dashed' : 'none', tick: !!document.querySelector(`.pdf-reader .pdf-later-tick[data-mark="${band.dataset.mark}"]`) }
  })
  check('"Mark for a card" is a dashed underline and a margin tick, never a band of colour like a highlight or a match', laterLook?.underline === 'dashed' && laterLook.tick && /rgba\(0, 0, 0, 0\)|transparent/.test(laterLook.background), JSON.stringify(laterLook))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-later-mark.png` })
  await tool('Make your marked cards'); await wait(800)
  check('the walk goes to the passage and asks its question, focused', await h.evaluate(() => document.activeElement?.getAttribute('aria-label') === "The card's question" && document.querySelector('.pdf-reader-page-field')?.value === '3'), await h.evaluate(() => document.querySelector('.pdf-reader-page-field')?.value))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-card-later.png` })
  await h.keyboard.type('Where is the quiet sentence on the last page?'); await h.keyboard.press('Enter'); await wait(1000)
  const laterCard = (await cardsFromBook()).find((one) => one.prompt === 'Where is the quiet sentence on the last page?')
  const laterMarks = (await v('pdf:highlights', pdfSrc)).filter((one) => one.color === 'later')
  check('Return makes its card, the passage becomes a plain highlight, and the walk ends with what it made', !!laterCard && laterMarks.length === 0 && /Marked cards made: 1 card/.test(await h.evaluate(() => document.body.textContent)) && !(await h.evaluate(() => !!document.querySelector('.pdf-reader button[aria-label="Mark for a card"]'))), JSON.stringify({ card: !!laterCard, left: laterMarks.length }))
  // In the dark: the card's question field beside its sibling, the bar over picked words.
  const titled = await h.evaluate(() => { const t = document.querySelector('.pdf-reader .pdf-reader-title'); return { whole: t.scrollWidth <= t.clientWidth + 1, text: t.textContent, more: !!document.querySelector('.pdf-reader .pdf-reader-bar button[aria-label="More"]'), pane: Math.round(document.querySelector('.pdf-reader').getBoundingClientRect().width) } })
  check('in a half-width pane the title is whole; the tools wait behind "More"', titled.whole && titled.more, JSON.stringify(titled))
  await c.look('dark'); await wait(500)
  await h.evaluate(() => document.querySelector('.pdf-reader .pdf-page[data-page="2"]').scrollIntoView({ block: 'start' })); await wait(600)
  await pickOn(2, 'worth keeping'); await wait(500)
  check('in a half-width pane picked words have nothing drawn over them', await h.evaluate(() => !document.querySelector('.pdf-reader .pdf-keep-bar')), '')
  await h.keyboard.press('c'); await wait(400)
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-card-dark.png` })
  await h.keyboard.press('Escape'); await wait(300)
  await c.look('light')
  // A PDF named in a note previews its pages on hover: the cover first, the pointer across the card turns them, a click opens that page.
  for (const theme of ['light', 'dark']) {
    await c.look(theme); await wait(300)
    const name = h.locator('.tiptap-attachment-name[data-pdf-peek]').first()
    if (!(await name.count())) { check('a note shows the PDF to hover', false, 'no PDF block on screen'); break }
    await name.scrollIntoViewIfNeeded(); await h.mouse.move(0, 0); await wait(200)
    await name.hover(); await wait(900)
    const shown = await h.evaluate(() => ({ card: !!document.querySelector('[data-pdf-peek-card] img'), corner: document.querySelector('[data-pdf-peek-page]')?.textContent?.trim() }))
    if (theme === 'light') check('hovering a PDF shows its cover at once, "1 / 3" in the corner', shown.card && shown.corner === '1 / 3', JSON.stringify(shown))
    const face = await h.evaluate(() => { const r = document.querySelector('[data-pdf-peek-card] [role="button"]').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } })
    // Up onto the card, then across it to the last third: page 3.
    await h.mouse.move(face.left + face.width * 0.1, face.top + face.height + 4, { steps: 2 })
    await h.mouse.move(face.left + face.width * 0.1, face.top + face.height / 2, { steps: 4 })
    await h.mouse.move(face.left + face.width * 0.9, face.top + face.height / 2, { steps: 8 }); await wait(900)
    await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-peek-${theme}.png` })
    const scrubbed = await h.evaluate(() => ({ corner: document.querySelector('[data-pdf-peek-page]')?.textContent?.trim(), drawn: !!document.querySelector('[data-pdf-peek-card] img') }))
    if (theme === 'light') check('moving across the card turns to page 3, its picture drawn', scrubbed.corner === '3 / 3' && scrubbed.drawn, JSON.stringify(scrubbed))
    if (theme === 'dark') {
      // One page look in both places: "Paper pages" turned on in the reader turns the PDF in the note to paper too, and back.
      await h.mouse.move(0, 0); await wait(200)
      await tool('View'); await wait(300); await h.locator('[data-page-layout-menu] [data-look-choice="paper"]').click(); await wait(500)
      const looks = await h.evaluate(() => ({ reader: getComputedStyle(document.querySelector('.pdf-reader .pdf-page')).backgroundColor, note: getComputedStyle(document.querySelector('.tiptap-attachment.is-pdf .pdf-page')).backgroundColor }))
      await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-paper-both-dark.png` })
      await tool('View'); await wait(300); await h.locator('[data-page-layout-menu] [data-look-choice="white"]').click(); await wait(400)
      const white = await h.evaluate(() => getComputedStyle(document.querySelector('.tiptap-attachment.is-pdf .pdf-page')).backgroundColor)
      check('"Paper pages" in the reader turns the PDF in the note to the same paper, and back to white', looks.reader === 'rgb(244, 236, 219)' && looks.note === looks.reader && white === 'rgb(255, 255, 255)', JSON.stringify({ ...looks, white }))
      break
    }
    const opened = await h.evaluate(() => { window.__peekOpened = null; window.addEventListener('haligtree:pdf', (event) => (window.__peekOpened = event.detail.page), { once: true }) })
    void opened
    await h.mouse.down(); await h.mouse.up(); await wait(900)
    check('a click opens the reader at the page on show', await h.evaluate(() => window.__peekOpened === 3 && !document.querySelector('[data-pdf-peek-card]')), String(await h.evaluate(() => window.__peekOpened)))
  }
  await h.mouse.move(0, 0); await c.look('light')
  // The pages turn along the PDF's own name too, no need to reach the card: left edge the first page, right edge the last; a click on the name opens its own page.
  {
    const name = h.locator('.tiptap-attachment-name[data-pdf-peek]').first()
    await name.scrollIntoViewIfNeeded(); await wait(200)
    const box = await name.boundingBox()
    await h.mouse.move(box.x + 2, box.y + box.height / 2, { steps: 2 }); await wait(900)
    const start = await h.evaluate(() => document.querySelector('[data-pdf-peek-page]')?.textContent?.trim())
    await h.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 10 }); await wait(900)
    const end = await h.evaluate(() => document.querySelector('[data-pdf-peek-page]')?.textContent?.trim())
    await h.evaluate(() => { window.__alongOpened = null; window.addEventListener('haligtree:pdf', (event) => (window.__alongOpened = event.detail.page ?? 'own'), { once: true }) })
    await h.mouse.down(); await h.mouse.up(); await wait(900)
    // A click on the name itself opens the book where it was left, never the page the hover turned to: that page opens from the card.
    const opened = await h.evaluate(() => window.__alongOpened)
    check('moving along the PDF\'s name turns its pages (1 / 3 at the left, 3 / 3 at the right), and a click on the name opens its own page, not the turned one', start === '1 / 3' && end === '3 / 3' && opened !== null && opened !== 3, JSON.stringify({ start, end, opened }))
    await h.mouse.move(0, 0)
  }
  // On its own in a wide window, both sides start open, even with the rail last left shut.
  await h.evaluate(() => localStorage.setItem('pdf-rail', ''))
  await c.size(1600, 900)
  await h.reload(); await wait(2500)
  const sides = await h.evaluate(() => ({ body: Math.round(document.querySelector('.pdf-reader-body')?.getBoundingClientRect().width ?? 0), panes: document.querySelectorAll('.pdf-reader').length, reader: !!document.querySelector('.pdf-reader'), rail: !!document.querySelector('.pdf-reader .pdf-rail'), details: !!document.querySelector('.pdf-reader .read-details') }))
  check('a PDF on its own opens with both sides', sides.rail && sides.details, JSON.stringify(sides))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
