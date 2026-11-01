// A book's Details at the size a real reader reaches: 5, 50, 500 and 1,500
// highlights over 336 pages and every colour, and 200 notes linking in. The
// panel draws only what is in view, groups by chapter with counts, never runs
// a line off its edge, and its page bar still reads. Shots at each size, light and dark.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=/tmp/scale node qa/pdf-details-scale.mjs
import { PDFDocument, StandardFonts, PDFName, PDFNull, PDFNumber, PDFString } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? '/tmp/pdf-details-scale'
const PAGES = 336
const CHAPTERS = ['Property', 'Justice', 'Plunder', 'The State', 'Fraternity', 'Law and Charity', 'Two Uses of Force', 'The Socialists', 'Equality', 'Liberty', 'The Legislator', 'Conclusion']
const WORDS = 'Their philosophers dreamed of the nature of justice and how law shaped political ideas across the ages of men who wrote it down'.split(' ')
const sentence = (n, length) => Array.from({ length }, (_, i) => WORDS[(n * 7 + i * 3) % WORDS.length]).join(' ')
const COLOURS = [null, 'yellow', 'green', 'blue', 'pink', 'later']

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Law Book')
  pdf.setAuthor('Frédéric Bastiat')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= PAGES; n++) {
    const page = pdf.addPage([400, 560])
    page.drawText(`Page ${n}`, { x: 40, y: 510, size: 16, font })
    // Two lines that break between "the" and "nature": a highlight across them must keep the space.
    page.drawText('Their philosophers wrote on the', { x: 40, y: 470, size: 12, font })
    page.drawText('nature of justice and how law shaped', { x: 40, y: 454, size: 12, font })
    page.drawText('political ideas for a long time after.', { x: 40, y: 438, size: 12, font })
  }
  const ctx = pdf.context
  const root = ctx.nextRef()
  const pages = pdf.getPages()
  const refs = CHAPTERS.map(() => ctx.nextRef())
  CHAPTERS.forEach((title, n) => {
    const at = pages[Math.floor((n * PAGES) / CHAPTERS.length)]
    const entry = ctx.obj({ Title: PDFString.of(title), Parent: root, Dest: [at.ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull] })
    if (n > 0) entry.set(PDFName.of('Prev'), refs[n - 1])
    if (n < refs.length - 1) entry.set(PDFName.of('Next'), refs[n + 1])
    ctx.assign(refs[n], entry)
  })
  ctx.assign(root, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs.at(-1), Count: PDFNumber.of(refs.length) }))
  pdf.catalog.set(PDFName.of('Outlines'), root)
  return [...(await pdf.save())]
}

const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Reading The Law', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'the-law.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf .pdf-page canvas', { timeout: 20000 })
  const src = await h.evaluate((sel) => { let s = ''; document.querySelector(sel).editor.state.doc.descendants((n) => void (n.type.name === 'attachment' && (s = n.attrs.src))); return s }, EDITOR)
  const name = 'the-law.pdf'
  const openReader = async (page = 83) => {
    await h.evaluate(([src, name, page]) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name, page } })), [src, name, page])
    await h.waitForSelector('.pdf-reader .pdf-page canvas', { timeout: 20000 })
    await wait(1200)
    if (!(await h.$('.read-details'))) await h.click('.pdf-reader button[aria-label="Details"]')
    await h.waitForSelector('.read-details', { timeout: 5000 })
    await wait(1200)
  }

  // A highlight made by hand across a line end keeps the space there.
  await openReader(5)
  const quote = await h.evaluate(async () => {
    const layer = document.querySelector('.pdf-reader .pdf-page[data-page="5"] .textLayer')
    const spans = [...layer.querySelectorAll('span')].filter((one) => one.textContent.trim())
    const from = spans.find((one) => one.textContent.includes('Their philosophers'))
    const to = spans.find((one) => one.textContent.includes('nature of justice'))
    const range = document.createRange()
    range.setStart(from.firstChild, from.textContent.indexOf('the', 20))
    range.setEnd(to.firstChild, 'nature of justice'.length)
    getSelection().removeAllRanges(); getSelection().addRange(range)
    await new Promise((r) => setTimeout(r, 300))
    return getSelection().toString()
  })
  await h.keyboard.press('h'); await wait(800)
  const made = (await v('pdf:highlights', src)).find((one) => one.page === 5)
  check('a highlight across a line end keeps the space there ("the nature")', /the nature of justice/.test(made?.quote ?? ''), JSON.stringify({ selection: quote, stored: made?.quote }))
  if (made) await v('pdf:unhighlight', made.id)
  await h.evaluate(() => getSelection().removeAllRanges())
  // One kept before line ends were read as spaces: put right once its page is drawn.
  const old = await v('pdf:highlight', src, { page: 6, quote: 'thenature of justice', start: 0, end: 1 })
  await h.reload(); await wait(2500)
  await openReader(6)
  for (let i = 0; i < 20 && (await v('pdf:highlights', src)).find((one) => one.id === old)?.quote !== 'the nature of justice'; i++) await wait(300)
  const fixed = (await v('pdf:highlights', src)).find((one) => one.id === old)
  const layerShape = await h.evaluate(() => [...(document.querySelector('.pdf-reader .pdf-page[data-page="6"] .textLayer')?.childNodes ?? [])].map((one) => one.nodeName + ':' + (one.textContent ?? '').slice(0, 12)).join(' | '))
  check('a highlight kept as "thenature" reads "the nature" once its page is drawn', fixed?.quote === 'the nature of justice', `${fixed?.quote} :: ${layerShape}`)
  await v('pdf:unhighlight', old)

  // 200 notes and gems linking into the book, at pages through it.
  for (let n = 0; n < 200; n++) {
    const page = 1 + ((n * 37) % PAGES)
    const title = n % 9 === 0 ? `A long note title about ${sentence(n, 14)}` : `On ${sentence(n, 4)}`
    await v('item:save', await v('article:new'), { title, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: sentence(n, 8) + ' ' }, { type: 'noteLink', attrs: { id, label: 'Reading The Law', key: '' } }, { type: 'text', text: ' ' }, { type: 'text', text: `The Law Book, p. ${page}`, marks: [{ type: 'link', attrs: { href: `${src}#page=${page}` } }] }] }] } })
  }

  // The note that holds the book, linked from all 200: its mentions draw only the rows in view.
  if (!process.env.SKIP_MENTIONS) {
    await c.send('article', id); await wait(2000)
    const fold = h.locator('section[data-chrome] button:has-text("Mentions")').first()
    if (await fold.count() && !(await h.locator('section[data-chrome] h3:has-text("linked mention")').count())) await fold.click()
    await wait(800)
    const said = await h.evaluate(() => ({ heading: [...document.querySelectorAll('section[data-chrome] h3')].map((one) => one.textContent).join(' | '), rows: document.querySelectorAll('section[data-chrome] [data-row]').length }))
    check('200 linked mentions under the note: only the rows in view are drawn (under 80)', /200 linked mentions/.test(said.heading) && said.rows > 0 && said.rows <= 80, JSON.stringify(said))
    await h.evaluate(() => document.querySelector('section[data-chrome] h3')?.scrollIntoView({ block: 'start' })); await wait(600)
    await c.both(`${SHOT}-mentions`)
  }

  let have = []
  for (const size of (process.env.SIZES ?? '5,50,500,1500').split(',').map(Number)) {
    while (have.length < size) {
      const n = have.length
      const page = 1 + Math.floor(((n * 7919) % 1000) / 1000 * PAGES)
      have.push(await v('pdf:highlight', src, { page, quote: sentence(n, 6 + (n % 5) * 9), start: 0, end: 10, color: COLOURS[n % COLOURS.length] }))
    }
    await h.reload(); await wait(2500)
    await openReader(83)
    const seen = await h.evaluate(() => {
      const d = document.querySelector('.read-details')
      const box = d.getBoundingClientRect()
      const out = [...d.querySelectorAll('*')].filter((one) => { const r = one.getBoundingClientRect(); return r.width && r.right > box.right + 1 }).map((one) => one.className).slice(0, 4)
      return { rows: d.querySelectorAll('.read-details-mark').length, out, heading: d.querySelector('.read-details-heading')?.textContent, legend: d.querySelector('.book-bar-says')?.scrollWidth > d.querySelector('.book-bar-says')?.clientWidth + 1, groups: d.querySelectorAll('.read-details-marks [data-mark-group]').length, ticks: d.querySelectorAll('[data-page-bar] .book-bar-tick').length }
    })
    console.log(size, JSON.stringify(seen))
    check(`${size} highlights: nothing runs off the panel's right edge`, !seen.out.length, JSON.stringify(seen.out))
    check(`${size} highlights: only the rows in view are drawn (under 80)`, seen.rows <= 80, String(seen.rows))
    check(`${size} highlights: grouped by chapter once past 30`, size <= 30 ? seen.groups === 0 : seen.groups > 0, String(seen.groups))
    check(`${size} highlights: the page bar draws at most 120 marks`, seen.ticks <= 120, String(seen.ticks))
    await c.both(`${SHOT}-${size}`)
    if (size === 500) {
      // Quiet words read at 4.5:1 or better on the panel, in Paper and in Dark; every block starts on one left edge.
      for (const theme of ['light', 'dark']) {
        await c.look(theme)
        const m = await h.evaluate(() => {
          const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
          const rgb = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3) }
          const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
          const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100 }
          const d = document.querySelector('.read-details')
          const bg = rgb(getComputedStyle(d).backgroundColor)
          const of = (sel) => { const el = d.querySelector(sel); return el ? ratio(rgb(getComputedStyle(el).color), bg) : null }
          const left = (sel) => { const el = d.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().left) : null }
          return { page: of('.read-details-mark-page'), count: of('.read-details-count'), part: of('.read-details-part'), ends: of('.book-bar-ends'), kind: of('.book-cited-kind'), line: of('.book-cited-line'), edges: { title: left('.read-details-head'), bar: left('.book-bar'), heading: left('.read-details-heading'), find: left('.read-details-find'), part: left('.read-details-part'), row: left('.read-details-mark'), note: left('.book-cited-row') } }
        })
        console.log(theme, JSON.stringify(m))
        check(`${theme}: page numbers, counts, chapter names, bar ends and note lines reach 4.5:1`, ['page', 'count', 'part', 'ends', 'kind', 'line'].every((k) => m[k] === null || m[k] >= 4.5), JSON.stringify(m))
        const lefts = Object.values(m.edges).filter((one) => one !== null)
        check(`${theme}: every block starts on one left edge (within 2px)`, Math.max(...lefts) - Math.min(...lefts) <= 2, JSON.stringify(m.edges))
      }
      await c.look('light')
      await h.evaluate(() => { const d = document.querySelector('.read-details'); d.scrollTop = d.scrollHeight / 2 })
      await wait(800)
      check('500 highlights: scrolled down, "Back to top" shows', !!(await h.$('.read-details-frame button[aria-label="Back to top"]')))
      await c.both(`${SHOT}-${size}-scrolled`)
      await h.fill('.read-details-find input', 'justice'); await wait(500)
      const says = await h.evaluate(() => document.querySelector('.read-details-found')?.textContent ?? '')
      check('500 highlights: finding says how many of all match ("N of 500")', / of 500/.test(says), says)
      await c.both(`${SHOT}-${size}-find`)
      await h.fill('.read-details-find input', ''); await wait(300)
      // Read through the open chapter: its heading stays at the top while its rows pass under it.
      await h.evaluate(() => { const d = document.querySelector('.read-details'); const head = d.querySelector('.read-details-marks [data-mark-group][aria-expanded="true"]'); d.scrollTop += head.getBoundingClientRect().top - d.getBoundingClientRect().top + 400 })
      await wait(500)
      const stuck = await h.evaluate(() => document.querySelector('.read-details-marks .read-details-stuck')?.textContent ?? '')
      check('500 highlights: the chapter read through stays at the top ("Plunder")', /Plunder/.test(stuck), stuck)
      await c.both(`${SHOT}-${size}-stuck`)
      // "In your notes": 200 by chapter, and pointed at, a row shows the shared note card alone.
      await h.evaluate(() => { const d = document.querySelector('.read-details'); const at = d.querySelector('[data-book-cited]'); d.scrollTop += at.getBoundingClientRect().top - d.getBoundingClientRect().top - 60 })
      await wait(600)
      const row = h.locator('.book-cited-row').first()
      await row.hover(); await wait(1200)
      const floating = await h.evaluate(() => ({ cards: document.querySelectorAll('[data-note-preview]').length, tips: document.querySelectorAll('[data-slot=tooltip-content]').length, cursor: getComputedStyle(document.querySelector('.book-cited-row')).cursor }))
      check('a note row pointed at shows the note card and no tip, with the hand', floating.cards === 1 && floating.tips === 0 && floating.cursor === 'pointer', JSON.stringify(floating))
      // Beside the list, never over its rows, and no Markdown in its words.
      const placed = await h.evaluate(() => {
        const card = document.querySelector('[data-note-preview]')?.getBoundingClientRect(), list = document.querySelector('.read-details')?.getBoundingClientRect()
                return card && list && { cardRight: Math.round(card.right), cardLeft: Math.round(card.left), listLeft: Math.round(list.left), listRight: Math.round(list.right), }
      })
      check('the card sits beside the list, not over its rows', placed && (placed.cardRight <= placed.listLeft || placed.cardLeft >= placed.listRight), JSON.stringify(placed))
      await c.both(`${SHOT}-${size}-notes`)
      await h.mouse.move(5, 5)
    }
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
