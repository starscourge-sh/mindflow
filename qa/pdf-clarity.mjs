// PDF reading made clear to someone starting out: a highlight stays drawn,
// PDFs show in Recent, names a newcomer reads at once, previews on the
// reader's menus, a click opening a PDF at its own page, page links, and
// the click / ⌘-click / ⌥-click rule.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-clarity.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOTS = process.env.QA_SHOTS ?? '/tmp'

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Law Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 6; n++) {
    const page = pdf.addPage([400, 560])
    page.drawText(`Page ${n} of the law book`, { x: 40, y: 500, size: 18, font })
    page.drawText(`Genocide is an attempt to destroy a people on page ${n}.`, { x: 40, y: 460, size: 12, font })
  }
  return Array.from(await pdf.save())
}

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
const pick = (page, from, to) => h.evaluate(([page, from, to]) => {
  const span = [...document.querySelectorAll(`.pdf-reader .pdf-page[data-page="${page}"] .textLayer span`)].find((one) => /Genocide/.test(one.textContent))
  const range = document.createRange()
  range.setStart(span.firstChild, from)
  range.setEnd(span.firstChild, to)
  getSelection().removeAllRanges()
  getSelection().addRange(range)
}, [page, from, to])
/** How far the colour under some words is from grey: 0 for plain page. */
const tintUnder = async (page) => {
  const box = await h.evaluate((page) => {
    const span = [...document.querySelectorAll(`.pdf-reader .pdf-page[data-page="${page}"] .textLayer span`)].find((one) => /Genocide/.test(one.textContent))
    const r = span?.getBoundingClientRect()
    return r ? { x: r.left + 1, y: r.top + r.height * 0.1, width: Math.min(40, r.width / 3), height: Math.max(2, r.height * 0.2) } : null
  }, page)
  if (!box) return -1
  const shot = await h.screenshot({ clip: box })
  return h.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, img.width, img.height).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])
    return Math.round(sum / (d.length / 4))
  }, shot.toString('base64'))
}

let pdfSrc = ''
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Law notes', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const file = new File([new Uint8Array(bytes)], 'law-book.pdf', { type: 'application/pdf' })
    const data = new DataTransfer()
    data.items.add(file)
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(600)
  pdfSrc = await h.evaluate((sel) => {
    let src = ''
    document.querySelector(sel).editor.state.doc.descendants((node) => void (node.type.name === 'attachment' && (src = node.attrs.src)))
    return src
  }, EDITOR)
  // A PDF link in a note: hovering turns the preview's pages, but a click opens the link's own page; a click on the card opens the page it shows.
  await h.evaluate(([sel, src]) => {
    const ed = document.querySelector(sel).editor
    ed.commands.insertContentAt(ed.state.doc.content.size, { type: 'paragraph', content: [{ type: 'text', text: 'The Law Book, p. 2', marks: [{ type: 'link', attrs: { href: `${src}#page=2&name=law-book.pdf` } }] }] })
  }, [EDITOR, pdfSrc])
  await wait(600)
  const link = h.locator(`${EDITOR} a[href*="page=2"]`).first()
  await link.scrollIntoViewIfNeeded()
  const lb = await link.boundingBox()
  // Right-click on the link: its own rows, the block's folded into one "Block ›" row, and no row looks picked before a key is pressed.
  await h.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2, { button: 'right' }); await wait(700)
  const linkMenu = await h.evaluate(() => {
    const menu = document.querySelector('.tiptap-block-menu')
    const top = menu ? [...menu.querySelectorAll(':scope .tiptap-block-menu-list > [role="menuitem"], :scope .tiptap-block-menu-list > * > [role="menuitem"]')].map((one) => one.textContent.trim()) : []
    const lit = menu ? [...menu.querySelectorAll('[role="menuitem"]')].filter((one) => getComputedStyle(one).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(one).backgroundColor !== 'transparent').map((one) => one.textContent.trim()) : []
    const dead = menu ? [...menu.querySelectorAll('[role="menuitem"][data-disabled], [role="menuitem"][aria-disabled="true"]')].filter((one) => !one.title).map((one) => one.textContent.trim()) : []
    return { top, sub: !!menu?.querySelector('[data-block-sub]'), lit, dead }
  })
  check('right-click on a PDF link folds the block\'s rows behind "Block ›"', linkMenu.sub && !linkMenu.top.some((one) => /Copy link to block|Duplicate|Delete/.test(one)), JSON.stringify(linkMenu))
  check('opened by the mouse, no row looks picked', linkMenu.lit.length === 0, JSON.stringify(linkMenu.lit))
  check('no greyed row without a reason in its tip', linkMenu.dead.length === 0, JSON.stringify(linkMenu.dead))
  await c.both(`${SHOTS}/pdf-clarity-link-menu`)
  await h.keyboard.press('Escape'); await wait(400)
  await h.mouse.move(0, 0); await wait(300)
  await h.mouse.move(lb.x + 2, lb.y + lb.height / 2, { steps: 2 }); await wait(900)
  await h.mouse.move(lb.x + lb.width - 2, lb.y + lb.height / 2, { steps: 10 }); await wait(900)
  const corner = await h.evaluate(() => document.querySelector('[data-pdf-peek-page]')?.textContent?.trim())
  await h.evaluate(() => { window.__opened = null; window.addEventListener('haligtree:pdf', (event) => (window.__opened = event.detail.page ?? 'own'), { once: true }) })
  await h.mouse.click(lb.x + lb.width - 2, lb.y + lb.height / 2); await wait(900)
  const clicked = await h.evaluate(() => window.__opened)
  check('hovering a PDF link turns the preview past its page', corner && corner !== '2 / 6', String(corner))
  check('a click on a PDF link opens its own page, not the page the hover turned to', clicked === 2, JSON.stringify({ corner, clicked }))
  await h.keyboard.press('Meta+BracketLeft'); await wait(1500)
  await h.click('.is-pdf button[aria-label="Open law-book.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page .textLayer span', { timeout: 15000 }).catch(() => {})
  await h.fill('.pdf-reader-page-field', '1'); await h.keyboard.press('Enter')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(800)

  // A highlight stays drawn on its words.
  const before = await tintUnder(1)
  await pick(1, 0, 'Genocide is an attempt'.length); await wait(400)
  await h.keyboard.press('h'); await wait(1200)
  const saved = await v('pdf:highlights', pdfSrc)
  const after = await tintUnder(1)
  const bands = await h.evaluate(() => document.querySelectorAll('.pdf-reader .pdf-page[data-page="1"] .pdf-mark').length)
  check('a highlight is saved', saved.length === 1, JSON.stringify(saved))
  check('a highlight stays drawn on its words (colour under them)', bands > 0 && after - before > 15, JSON.stringify({ bands, before, after }))
  await h.screenshot({ path: `${SHOTS}/pdf-clarity-highlight.png` })
  // Words picked reaching past a highlight: its menu offers "Extend the highlight", then the picked words' own rows.
  await pick(1, 0, 'Genocide is an attempt to destroy'.length); await wait(400)
  const onMark = await h.evaluate(() => { const r = document.querySelector('.pdf-reader .pdf-page[data-page="1"] .pdf-mark').getBoundingClientRect(); return { x: r.left + 6, y: r.top + r.height / 2 } })
  await h.mouse.click(onMark.x, onMark.y, { button: 'right' }); await wait(500)
  const overMark = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  check('over a highlight, picked words offer "Extend the highlight", then their own rows', overMark[0] === 'Extend the highlight' && overMark.some((one) => one.startsWith('Make a card')) && overMark.some((one) => one.startsWith('Remove highlight')), JSON.stringify(overMark))
  await c.both(`${SHOTS}/pdf-clarity-menu-over-highlight`)
  await h.click('[role="menuitem"]:has-text("Extend the highlight")'); await wait(800)
  const grown = (await v('pdf:highlights', pdfSrc)).find((one) => one.page === 1)
  check('"Extend the highlight" grows it to the words picked', grown?.quote === 'Genocide is an attempt to destroy', JSON.stringify(grown))
  await pick(1, 0, 'Genocide'.length); await wait(400)
  await h.mouse.click(onMark.x, onMark.y, { button: 'right' }); await wait(500)
  check('words inside a highlight offer "Keep just these words"', await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].some((one) => one.textContent.trim() === 'Keep just these words')), '')
  await h.click('[role="menuitem"]:has-text("Keep just these words")'); await wait(800)
  const cut = (await v('pdf:highlights', pdfSrc)).find((one) => one.page === 1)
  check('"Keep just these words" cuts it to them', cut?.quote === 'Genocide', JSON.stringify(cut))
  // In the dark, on a page scrolled to, in a colour: still drawn, and still drawn once the page is scrolled away and back.
  await c.look('dark')
  await h.fill('.pdf-reader-page-field', '3'); await h.keyboard.press('Enter'); await wait(1200)
  const darkBefore = await tintUnder(3)
  await pick(3, 0, 'Genocide is an attempt'.length); await wait(400)
  await h.keyboard.press('h'); await wait(1200)
  const darkAfter = await tintUnder(3)
  check('in the dark, a highlight on page 3 is drawn', darkAfter - darkBefore > 15, JSON.stringify({ darkBefore, darkAfter }))
  await h.screenshot({ path: `${SHOTS}/pdf-clarity-highlight-dark.png` })
  await h.fill('.pdf-reader-page-field', '6'); await h.keyboard.press('Enter'); await wait(1000)
  await h.fill('.pdf-reader-page-field', '3'); await h.keyboard.press('Enter'); await wait(1500)
  const back = await tintUnder(3)
  check('scrolled away and back, the highlight is still drawn', back - darkBefore > 15, JSON.stringify({ darkBefore, back }))
  await c.look('light')
  // Words picked across a line end, as most sentences in a real book are: still drawn.
  await h.fill('.pdf-reader-page-field', '2'); await h.keyboard.press('Enter'); await wait(1200)
  const crossBefore = await tintUnder(2)
  await h.evaluate(() => {
    const spans = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="2"] .textLayer span')]
    const title = spans.find((one) => /law book/.test(one.textContent))?.firstChild
    const line = spans.find((one) => /Genocide/.test(one.textContent))?.firstChild
    const range = document.createRange()
    range.setStart(title, title.textContent.length - 4)
    range.setEnd(line, 'Genocide is an attempt'.length)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await wait(400)
  await h.keyboard.press('h'); await wait(1200)
  const crossAfter = await tintUnder(2)
  const crossBands = await h.evaluate(() => document.querySelectorAll('.pdf-reader .pdf-page[data-page="2"] .pdf-mark').length)
  check('words picked across a line end are drawn as a highlight', crossBands >= 2 && crossAfter - crossBefore > 15, JSON.stringify({ crossBands, crossBefore, crossAfter }))

  // Picking words shows nothing over the page; the right-click menu holds every action, with its key.
  await pick(2, 30, 'Genocide is an attempt to destroy'.length); await wait(500)
  check('picking words shows no bar over the page', await h.evaluate(() => !document.querySelector('.pdf-keep-bar')), '')
  const wb = await h.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.click(wb.x, wb.y, { button: 'right' }); await wait(500)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  check('the menu on picked words offers every action, Mark for a card and Copy included', ['Highlight', 'Keep as a gem', 'Make a card', 'Fill-in-the-blank card', 'Mark for a card', 'Look up', 'Copy with citation', 'Copy'].every((one) => rows.some((row) => row.startsWith(one))), JSON.stringify(rows))
  // Pointed at, a row shows its preview beside the menu, as the slash menu does.
  await h.hover('[role="menu"] [role="menuitem"][data-peek="blank"]'); await wait(900)
  const peek = await h.evaluate(() => document.querySelector('[data-menu-peek]')?.textContent ?? '')
  check('pointing at "Fill-in-the-blank card" shows its preview with the blank', /blanked out/.test(peek) && /Genocide is an attempt to/.test(peek), peek.slice(0, 160))
  await c.both(`${SHOTS}/pdf-clarity-menu`)
  await h.keyboard.press('Escape'); await wait(300)

  // Opened in the reader, the PDF is in the sidebar's Recent with its cover, and in ⌘K's Recent; a click reopens it where you left it.
  await h.fill('.pdf-reader-page-field', '4'); await h.keyboard.press('Enter'); await wait(1200)
  await c.send('article', id); await wait(1500)
  const recentRow = await h.evaluate(() => {
    const row = [...document.querySelectorAll('[data-side-recent-row]')].find((one) => /Law Book/.test(one.textContent))
    return row ? { text: row.textContent.trim(), cover: !!row.querySelector('img'), cursor: getComputedStyle(row).cursor } : null
  })
  check('the PDF is in the sidebar\'s Recent, with its cover', recentRow?.cover === true, JSON.stringify(recentRow))
  const recentBox = h.locator('[data-side-recent]')
  if (await recentBox.count()) { await recentBox.scrollIntoViewIfNeeded(); await c.both(`${SHOTS}/pdf-clarity-recent`, recentBox) }
  if (recentRow) {
    await h.click('[data-side-recent-row]:has-text("Law Book")')
    await h.waitForSelector('.pdf-reader .pdf-page .textLayer span', { timeout: 15000 }).catch(() => {})
    await wait(1500)
    const at = await h.evaluate(() => document.querySelector('.pdf-reader-page-field')?.value)
    check('clicking it in Recent reopens it at the page last read', at === '4', String(at))
  }
  await h.keyboard.press('Meta+k'); await wait(800)
  const palette = await h.evaluate(() => {
    // ⌘K's islands: before anything is typed, what it lists is the Recent island, headed so.
    const head = document.querySelector('[data-island-head="Recent"]')
    return head ? (document.querySelector('[data-answers]')?.textContent ?? '') : ''
  })
  check('⌘K lists the PDF under Recent', /Law Book|law-book/.test(palette), palette.slice(0, 200))
  await h.keyboard.press('Escape'); await wait(300)
} catch (e) {
  check('ran without throwing', false, String(e.stack ?? e))
} finally {
  await c.close()
}
done()
