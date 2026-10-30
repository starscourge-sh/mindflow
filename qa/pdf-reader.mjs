// A PDF dropped into a note shows its pages in the note, page 1's words
// readable and selectable, with its page count.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-pdf/main/index.js HALIGTREE_QA_AWAY=1 node qa/pdf-reader.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

/** Three pages of real text, each saying which page it is. */
const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Probe Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 3; n++) {
    const page = pdf.addPage([400, 560])
    page.drawText(`Page ${n} of the probe book`, { x: 40, y: 500, size: 18, font })
    page.drawText(`A quiet sentence worth keeping on page ${n}.`, { x: 40, y: 460, size: 12, font })
  }
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
  await h.keyboard.press('Escape'); await wait(300)

  await h.click('.pdf-reader button[aria-label="Dark pages"]'); await wait(400)
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/pdf-pane-dark.png` })
  await h.click('.pdf-reader button[aria-label="Light pages"]')
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
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
