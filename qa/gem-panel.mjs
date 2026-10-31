// A gem's details: "Where it came from" is a pair of links. Its PDF row opens
// the reader at the page its body links to (⌥ beside), with the PDF's pages
// previewed on hover; its person row opens their Sources page; a pencil on
// hover turns either into its field, Enter keeping what is typed. The page
// it shows is the body link's, even with a stale page kept beside it. Islands
// holding something open by themselves, empty ones stay folded, and a
// person's own fold is remembered and wins.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/gem-panel.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.QA_SHOTS ?? '/tmp'
const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Probe Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 3; n++) pdf.addPage([400, 560]).drawText(`Page ${n} of the probe book`, { x: 40, y: 500, size: 18, font })
  return Array.from(await pdf.save())
}

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // A real PDF in the book: dropped into a page, as a person adds one.
  const page = await v('article:new')
  await v('item:save', page, { title: 'With a PDF', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await send('article', page); await wait(1400)
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'probe-book.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf', { timeout: 15000 }).catch(() => {})
  await wait(800)
  const src = await h.evaluate((sel) => {
    let found = ''
    document.querySelector(sel).editor.state.doc.descendants((node) => void (node.type.name === 'attachment' && (found = node.attrs.src)))
    return found
  }, EDITOR)
  check('the PDF is kept in the book', /\.pdf$/.test(src), src)

  // A gem from page 2, its body linking there, with a stale "p. 3" kept beside it and on the book's name.
  const gem = await v('nugget:from', `A quiet sentence.\n\n[The Probe Book, p. 2](${src}#page=2&mark=&name=probe-book.pdf)`, { attribution: 'DK', medium: 'The Probe Book', passage: 'p. 3', kind: 'quote' })
  await v('item:save', gem, { context: 'Said in passing', medium: 'The Probe Book, p. 3' })
  // A gem with nothing in its islands, to see them stay folded.
  const bare = await v('nugget:from', 'A thought with nothing around it.', {})

  const listen = () => h.evaluate(() => {
    window.__heard = []
    if (window.__listening) return
    window.__listening = true
    for (const name of ['haligtree:pdf', 'haligtree:source']) window.addEventListener(name, (event) => window.__heard.push({ name, detail: event.detail }), true)
  })
  const heard = () => h.evaluate(() => window.__heard)
  const openDetails = async (id) => {
    await send('nugget', id); await wait(1500)
    const details = h.locator('button[aria-label="Details"][aria-pressed="false"]').first()
    if (await details.count()) { await details.click(); await wait(900) }
  }
  const groups = () => h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-details-group]')].map((one) => [one.dataset.detailsGroup, one.hasAttribute('data-open')])))

  await openDetails(gem)
  const first = await groups()
  check('"Where it came from" opens by itself, holding a source', first['Where it came from'] === true, JSON.stringify(first))
  check('Context opens by itself, holding words', first.Context === true, JSON.stringify(first))
  check('Why stays folded, empty', first.Why === false, JSON.stringify(first))

  // One truth for the page: the row says the body link's p. 2, never the stale p. 3.
  const row = await h.evaluate(() => {
    const link = document.querySelector('[data-source-link="where"]')
    const body = [...document.querySelectorAll('[data-open] .tiptap a[href*=".pdf#"]')].map((one) => one.textContent)
    return { text: link?.textContent ?? '', peek: link?.dataset.pdfPeek ?? '', peekPage: link?.dataset.pdfPeekPage ?? '', body }
  })
  check('the source row names the page the body links to', row.text === 'The Probe Book, p. 2', JSON.stringify(row))
  check('and agrees with the link in the body', row.body.some((one) => one.includes('p. 2')) && !row.text.includes('p. 3'), JSON.stringify(row))
  check('the PDF row carries the hover preview of its pages, at that page', row.peek === src && row.peekPage === '2', JSON.stringify(row))

  // Cursors: rows that open things show the hand; the field shows the text cursor only while editing.
  const cursors = await h.evaluate(() => {
    const at = (sel) => { const one = document.querySelector(sel); return one ? getComputedStyle(one).cursor : 'missing' }
    return { where: at('[data-source-link="where"]'), who: at('[data-source-link="source"]'), pencil: at('[data-source-edit="where"]'), field: document.querySelector('[data-gem-where]') ? 'shown' : 'none' }
  })
  check('the PDF row and the person row show the hand', cursors.where === 'pointer' && cursors.who === 'pointer', JSON.stringify(cursors))
  check('the pencil shows the hand', cursors.pencil === 'pointer', JSON.stringify(cursors))
  check('no text field sits there until the pencil is pressed', cursors.field === 'none', JSON.stringify(cursors))
  // Every row in the panel that is a button shows the hand.
  const arrows = await h.evaluate(() => [...document.querySelectorAll('[data-details-group] button:not(:disabled), [data-details-group] [role="button"]')].filter((one) => one.getClientRects().length && getComputedStyle(one).cursor !== 'pointer').map((one) => one.getAttribute('aria-label') || one.textContent.trim().slice(0, 30)))
  check('every button in the panel shows the hand', arrows.length === 0, arrows.join(' | '))

  // Hover shows the pencil and the PDF's pages.
  await h.hover('[data-source-link="where"]'); await wait(1500)
  const hovered = await h.evaluate(() => ({ pencil: getComputedStyle(document.querySelector('[data-source-edit="where"]')).opacity, peek: !!document.querySelector('.pdf-peek, [data-pdf-peek-card]') }))
  check('hovering the row shows its pencil', Number(hovered.pencil) > 0.5, JSON.stringify(hovered))
  await h.screenshot({ path: `${shots}/gem-panel-hover.png` })

  // A click opens the reader at p. 2; ⌥-click opens it beside.
  await listen()
  await h.mouse.move(5, 5); await wait(300)
  await h.click('[data-source-link="where"]'); await wait(1500)
  const opened = await heard()
  const pdfOpen = opened.find((one) => one.name === 'haligtree:pdf')
  check('a click opens the reader at the page the gem came from', pdfOpen?.detail?.page === 2 && pdfOpen.detail.src === src && !pdfOpen.detail.aside, JSON.stringify(opened))
  await h.waitForSelector('.pdf-reader-page-field', { timeout: 8000 }).catch(() => {})
  await wait(800)
  check('the reader shows page 2', await h.evaluate(() => document.querySelector('.pdf-reader-page-field')?.value) === '2', String(await h.evaluate(() => document.querySelector('.pdf-reader-page-field')?.value)))

  await openDetails(gem)
  await listen()
  await h.click('[data-source-link="where"]', { modifiers: ['Alt'] }); await wait(1200)
  const aside = (await heard()).find((one) => one.name === 'haligtree:pdf')
  check('⌥-click opens it to the side', aside?.detail?.aside === true && aside.detail.page === 2, JSON.stringify(aside))

  // The person row opens their Sources page.
  await openDetails(gem)
  await listen()
  await h.click('[data-source-link="source"]'); await wait(1000)
  const person = (await heard()).find((one) => one.name === 'haligtree:source')
  check('the person row opens their Sources page', person?.detail === 'attribution:DK', JSON.stringify(person))

  // The pencil turns the row into its field; Enter keeps what is typed.
  await openDetails(gem)
  await h.hover('[data-source-row="source"]'); await wait(300)
  await h.click('[data-source-edit="source"]'); await wait(400)
  const editing = await h.evaluate(() => {
    const field = document.querySelector('[data-gem-source]')
    return { focused: document.activeElement === field, cursor: field ? getComputedStyle(field).cursor : 'missing' }
  })
  check('the pencil turns the row into its field, the caret in it', editing.focused, JSON.stringify(editing))
  check('the field shows the text cursor while editing', editing.cursor === 'text', JSON.stringify(editing))
  await h.keyboard.press('Meta+A'); await h.keyboard.type('Dee Kay'); await h.keyboard.press('Enter'); await wait(900)
  const saved = await v('item', gem)
  check('Enter saves it', saved.attribution === 'Dee Kay', String(saved.attribution))
  check('and the row is a link again', await h.evaluate(() => document.querySelector('[data-source-link="source"]')?.textContent === 'Dee Kay'), '')
  // Esc leaves it as it was.
  await h.hover('[data-source-row="source"]'); await wait(300)
  await h.click('[data-source-edit="source"]'); await wait(300)
  await h.keyboard.press('Meta+A'); await h.keyboard.type('Nobody'); await h.keyboard.press('Escape'); await wait(700)
  check('Esc leaves it as it was', (await v('item', gem)).attribution === 'Dee Kay', String((await v('item', gem)).attribution))

  // "From the same book": the book's map, this gem lit, its siblings around it.
  // Two more gems from the book (pp. 1 and 3); the page the PDF was dropped into holds it too.
  await v('nugget:from', `First words.\n\n[The Probe Book, p. 1](${src}#page=1&mark=&name=probe-book.pdf)`, { medium: 'The Probe Book', passage: 'p. 1', kind: 'quote' })
  await v('nugget:from', `Last words.\n\n[The Probe Book, p. 3](${src}#page=3&mark=&name=probe-book.pdf)`, { medium: 'The Probe Book', passage: 'p. 3', kind: 'quote' })
  await openDetails(gem); await wait(1200)
  check('"From the same book" is there for a gem from a PDF', (await groups())['From the same book'] !== undefined, JSON.stringify(await groups()))
  check('and starts folded', (await groups())['From the same book'] === false, JSON.stringify(await groups()))
  await h.locator('[data-details-group="From the same book"] button[aria-expanded]').click(); await wait(1800)
  const same = await h.evaluate(() => ({ others: document.querySelector('[data-same-book]')?.dataset.others, says: document.querySelector('[data-same-book-says]')?.textContent }))
  check('it counts the siblings: the two gems and the page holding the PDF', same.others === '3' && /^3 others from The Probe Book, pages 1 to 3$/.test(same.says ?? ''), JSON.stringify(same))
  await h.locator('[data-details-group="From the same book"]').scrollIntoViewIfNeeded(); await wait(600)
  const sameBox = await h.evaluate(() => { const r = document.querySelector('[data-details-group="From the same book"]').getBoundingClientRect(); return { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8 } })
  for (const name of ['light', 'dark']) { await c.look(name); await wait(500); await h.screenshot({ path: `${shots}/gem-panel-same-book-${name}.png`, clip: sameBox }) }
  await c.look('light'); await wait(500)
  // A sibling's dot pointed at says its title and page; a click opens it.
  const dots = await h.evaluate(() => {
    const canvas = document.querySelector('[data-same-book] canvas')
    const { width, height } = canvas
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
    const dpr = devicePixelRatio, rect = canvas.getBoundingClientRect(), found = []
    for (let y = 4; y < height - 4; y += 4) for (let x = 4; x < width - 4; x += 4) if (data[(y * width + x) * 4 + 3] > 250) found.push([rect.left + x / dpr, rect.top + y / dpr])
    return found
  })
  let tipped = '', clicked = false
  for (const [x, y] of dots.filter((_, i) => i % Math.max(1, Math.floor(dots.length / 60)) === 0)) {
    await h.mouse.move(x, y); await wait(60)
    const words = await h.evaluate(() => document.querySelector('[data-map-tip]')?.textContent ?? '')
    if (!/Last words/.test(words)) continue
    tipped = words
    await listen()
    await h.evaluate(() => window.addEventListener('haligtree:open', (event) => window.__heard.push({ name: 'open', detail: event.detail }), { once: true, capture: true }))
    await h.mouse.click(x, y); await wait(1200)
    clicked = (await heard()).some((one) => one.name === 'open' && one.detail?.type === 'nugget')
    break
  }
  check("a sibling pointed at says its title, page and kind", /Last words/.test(tipped) && /p\. 3 · Gem/.test(tipped), tipped)
  check('a click on a sibling opens it', clicked, '')
  // A plain note from the book (a Lookup): the foot under its words links straight to the page, as well as to everything from the book.
  const lookup = await h.evaluate(([src]) => window.api.captures.create({ kind: 'word', title: 'quiet', medium: 'The Probe Book', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quiet' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Looked up in ' }, { type: 'text', text: 'The Probe Book, p. 3', marks: [{ type: 'link', attrs: { href: `${src}#page=3&mark=&name=probe-book.pdf` } }] }] }] } }), [src])
  await send('capture', lookup); await wait(1800)
  const foot = await h.evaluate(() => {
    const page = document.querySelector('[data-open-pdf-page]')
    return { page: page?.textContent, at: page?.dataset.openPdfPage, peek: page?.dataset.pdfPeekPage, cursor: page ? getComputedStyle(page).cursor : '', shelf: document.querySelector('[data-open-source="medium"]')?.textContent }
  })
  check('a note from a PDF has the page under its words, beside everything from the book', foot.page === 'The Probe Book, p. 3' && foot.shelf === 'Everything from The Probe Book', JSON.stringify(foot))
  check('the page link shows the hand and previews the page', foot.cursor === 'pointer' && foot.peek === '3', JSON.stringify(foot))
  await listen()
  await h.click('[data-open-pdf-page]'); await wait(1200)
  await send('capture', lookup); await wait(1500)
  await h.click('[data-open-pdf-page]', { modifiers: ['Alt'] }); await wait(1000)
  const footOpens = (await heard()).filter((one) => one.name === 'haligtree:pdf').map((one) => one.detail)
  check('a click opens the reader at that page, ⌥-click beside', footOpens[0]?.page === 3 && !footOpens[0].aside && footOpens[1]?.page === 3 && footOpens[1].aside === true, JSON.stringify(footOpens))
  await send('capture', lookup); await wait(1500)
  const footBox = await h.evaluate(() => { const r = document.querySelector('[data-open-pdf-page]').parentElement.getBoundingClientRect(); return { x: r.left - 12, y: r.top - 60, width: r.width + 24, height: r.height + 80 } })
  for (const name of ['light', 'dark']) { await c.look(name); await wait(500); await h.screenshot({ path: `${shots}/note-foot-pdf-${name}.png`, clip: footBox }) }
  await c.look('light')

  // The note's own details: "Where it came from" is links too, the PDF one at its page.
  await send('capture', lookup); await wait(1500)
  const noteDetails = h.locator('button[aria-label="Details"][aria-pressed="false"]').first()
  if (await noteDetails.count()) { await noteDetails.click(); await wait(900) }
  const noteRow = await h.evaluate(() => { const one = document.querySelector('[data-source-link="where"]'); return { text: one?.textContent, peek: one?.dataset.pdfPeekPage, cursor: one ? getComputedStyle(one).cursor : '', field: !!document.querySelector('[data-note-where]') } })
  check("a note's own source row is a link to its PDF page, with the hand", noteRow.text === 'The Probe Book, p. 3' && noteRow.peek === '3' && noteRow.cursor === 'pointer' && !noteRow.field, JSON.stringify(noteRow))
  await listen()
  await h.click('[data-source-link="where"]', { modifiers: ['Alt'] }); await wait(1000)
  const noteOpen = (await heard()).find((one) => one.name === 'haligtree:pdf')?.detail
  check("⌥-click on it opens the page beside", noteOpen?.page === 3 && noteOpen.aside === true, JSON.stringify(noteOpen))
  await send('capture', lookup); await wait(1500)
  if (await noteDetails.count()) { await noteDetails.click(); await wait(900) }
  await h.hover('[data-source-row="where"]'); await wait(300)
  await h.click('[data-source-edit="where"]'); await wait(300)
  check("its pencil turns it into its field, the caret in it", await h.evaluate(() => document.activeElement === document.querySelector('[data-note-where]')), '')
  await h.keyboard.press('Meta+A'); await h.keyboard.type('The Probe Book'); await h.keyboard.press('Enter'); await wait(800)
  const noteSaved = await h.evaluate((id) => window.api.captures.get(id).then((one) => one?.medium), lookup)
  check('Enter keeps it and the row is a link again', noteSaved === 'The Probe Book' && await h.evaluate(() => !!document.querySelector('[data-source-link="where"]')), String(noteSaved))

  await openDetails(bare)
  check('a gem from no PDF has no "From the same book"', (await groups())['From the same book'] === undefined, JSON.stringify(await groups()))
  await openDetails(gem)

  // Light and dark.
  await h.mouse.move(5, 5); await wait(300)
  const panel = h.locator('[data-details-group="Where it came from"]').first()
  await panel.scrollIntoViewIfNeeded()
  await c.both(`${shots}/gem-panel`)

  // A bare gem: its islands wait folded.
  await openDetails(bare)
  const empty = await groups()
  check('empty islands stay folded', empty.Context === false && empty.Why === false && empty['Where it came from'] === false && empty['Thoughts on this note'] !== true, JSON.stringify(empty))
  // A person's own choice wins: Why opened on the bare gem stays open, and Context folded on the full one stays folded.
  await h.locator('[data-details-group="Why"] button[aria-expanded]').click(); await wait(400)
  await openDetails(gem)
  await h.locator('[data-details-group="Context"] button[aria-expanded]').click(); await wait(400)
  await openDetails(bare)
  check('an island opened by hand stays open where it is empty', (await groups()).Why === true, JSON.stringify(await groups()))
  await openDetails(gem)
  check('an island folded by hand stays folded where it holds something', (await groups()).Context === false, JSON.stringify(await groups()))
} catch (error) { console.log(String(error).slice(0, 300), c.errors.slice(-3).join("\n")) } finally {
  await c.close()
}
done()
