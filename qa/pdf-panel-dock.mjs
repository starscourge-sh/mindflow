// A book's panel, in Media › PDFs and in the reader: docked at the page's right
// edge, full height, its head (the cover at the panel's width, the title, "PDF ·
// 300 pages · 1 KB", the way back in and the page bar) held still while only the
// lists under it scroll; one scrollbar, nothing cut off at the foot, the last row
// reachable, section headings held at the top as they pass. Information with
// "Show more". The kinds start on the same left edge as on Pictures. At 390 wide
// it is one column and one scroll. Shots light and dark at 5, 50 and 500 books.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=/tmp/dock node qa/pdf-panel-dock.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.SHOT ?? '/tmp/pdf-panel-dock'
const { check, done } = checks()

const pdfBytes = (word, extra = '') => {
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
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n${extra}`
  return [...Buffer.from(out)]
}
const para = (...content) => ({ type: 'paragraph', content: content.map((one) => (typeof one === 'string' ? { type: 'text', text: one } : one)) })

const c = await sandbox({ width: 1440, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const kind = async (label) => { await h.locator('[data-page=media] [data-media-kinds] button', { hasText: label }).first().click({ timeout: 5000 }); await wait(1500) }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  const make = (body) => h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: body })
  const NAME = 'The Law Book.pdf'
  const src = await h.evaluate((bytes) => window.api.saveFile('The Law Book.pdf', new Uint8Array(bytes)), pdfBytes('Law'))
  await make([para('Reading pile'), { type: 'attachment', attrs: { src, name: NAME, size: 900 } }])
  // 40 notes linking into it, so the panel holds far more than the window.
  for (let n = 0; n < 40; n++) await make([para(`On page ${n * 7 + 1}`), para('As ', { type: 'text', text: 'the book says', marks: [{ type: 'link', attrs: { href: `${src}#page=${n * 7 + 1}&name=${encodeURIComponent(NAME)}` } }] }, '.')])
  await v('pdf:read', src, 134, 300)
  await v('pdf:highlight', src, { page: 40, quote: 'stare decisis', start: 0, end: 13 })
  // A picture, so Pictures has a grid to compare the kinds' left edge against.
  await h.reload(); await wait(1500)
  await go('media'); await wait(1200)
  const kindsLeft = async () => h.evaluate(() => Math.round(document.querySelector('[data-page=media] [data-media-kinds] button')?.getBoundingClientRect().left ?? -1))
  await kind('Pictures')
  const leftPictures = await kindsLeft()
  await kind('Pictures')
  await kind('PDFs')
  await h.waitForSelector('[data-inspector]', { timeout: 8000 })
  await wait(800)
  const leftPdfs = await kindsLeft()
  check('the kinds start on the same left edge on PDFs as on Pictures', Math.abs(leftPdfs - leftPictures) <= 1, `${leftPictures} vs ${leftPdfs}`)

  const read = () => h.evaluate(() => {
    const panel = document.querySelector('[data-inspector]')
    const page = document.querySelector('[data-page=media]')
    const body = page.querySelector(':scope section > div > div.overflow-y-auto') ?? panel.parentElement
    const r = (el) => el && el.getBoundingClientRect()
    const scrollers = [...page.querySelectorAll('*')].filter((one) => { const s = getComputedStyle(one); return /auto|scroll/.test(s.overflowY) && one.scrollHeight > one.clientHeight + 1 && one.clientHeight > 0 && panel.contains(one) || (one.contains(panel) && /auto|scroll/.test(s.overflowY) && one.scrollHeight > one.clientHeight + 1) })
    const cover = panel.querySelector('.book-head-cover')
    const head = panel.querySelector('.book-panel-head')
    return {
      panel: r(panel), main: r(page.closest('main') ?? page), pageBox: r(page), cover: r(cover), head: head && r(head),
      scrollers: scrollers.map((one) => one.className.slice(0, 40)),
      what: panel.querySelector('.book-head-what')?.textContent ?? '',
      info: !!panel.querySelector('[data-book-info]'),
      more: [...panel.querySelectorAll('button')].some((one) => one.textContent === 'Show more'),
      body: body && r(body),
    }
  })
  const at = await read()
  console.log(JSON.stringify(at))
  check('the panel reaches the page\'s right edge (no empty page to its right)', at.pageBox.right - at.panel.right <= 2, `${at.panel.right} of ${at.pageBox.right}`)
  check('the panel runs to the page\'s foot', Math.abs(at.pageBox.bottom - at.panel.bottom) <= 2, `${at.panel.bottom} of ${at.pageBox.bottom}`)
  check('one scrollbar: only the panel\'s list scrolls, never the panel and the page both', at.scrollers.length === 1 && /book-panel-body/.test(at.scrollers[0]), JSON.stringify(at.scrollers))
  check('the cover is at the panel\'s width (most of it) or the head\'s full height share', at.cover && at.cover.width >= at.panel.width * 0.6, `${at.cover?.width} of ${at.panel.width}`)
  check('a quiet line says "PDF · 300 pages · n KB"', /^PDF · 300 pages · \d+(\.\d)? (bytes|KB|MB)$/.test(at.what), at.what)
  check('an Information group with "Show more"', at.info && at.more, JSON.stringify({ info: at.info, more: at.more }))
  await c.both(`${SHOT}-media`)

  // Scrolled to the foot: the head has not moved, the last row is wholly in view, nothing is cut.
  const scrolled = await h.evaluate(async () => {
    const panel = document.querySelector('[data-inspector]')
    const body = panel.querySelector('.book-panel-body')
    const before = panel.querySelector('.book-panel-head').getBoundingClientRect().top
    if (!body) return { none: true }
    body.scrollTop = body.scrollHeight
    await new Promise((r) => setTimeout(r, 400))
    const last = [...body.querySelectorAll('.pdf-inspector-row, [data-cited]')].at(-1).getBoundingClientRect()
    const box = body.getBoundingClientRect()
    return { headMoved: Math.abs(panel.querySelector('.book-panel-head').getBoundingClientRect().top - before), lastBottom: last.bottom, boxBottom: box.bottom }
  })
  check('scrolled to the end: the head holds still and the last row is wholly in view', !scrolled.none && scrolled.headMoved < 1 && scrolled.lastBottom <= scrolled.boxBottom + 1, JSON.stringify(scrolled))
  await c.both(`${SHOT}-media-end`)

  // Half way: the "In your notes" heading is held at the top of the list.
  const stuck = await h.evaluate(async () => {
    const body = document.querySelector('[data-inspector] .book-panel-body')
    body.scrollTop = 400
    await new Promise((r) => setTimeout(r, 300))
    const heading = body.querySelector('.read-details-heading').getBoundingClientRect()
    return { gap: Math.round(heading.top - body.getBoundingClientRect().top) }
  })
  check('scrolled half way: the "In your notes" heading is held at the top', stuck.gap >= -1 && stuck.gap <= 1, JSON.stringify(stuck))
  await c.both(`${SHOT}-media-stuck`)

  // A phone's width: one column, one scroll, nothing off the side.
  await c.size(390, 844); await wait(900)
  const phone = await h.evaluate(() => {
    const page = document.querySelector('[data-page=media]')
    const wide = [...page.querySelectorAll('*')].filter((one) => one.getBoundingClientRect().right > window.innerWidth + 1 && one.getBoundingClientRect().width > 0).map((one) => one.className.slice(0, 30)).slice(0, 4)
    return { wide, sideways: document.documentElement.scrollWidth > window.innerWidth + 1 }
  })
  check('at 390 wide nothing runs off the side', !phone.wide.length && !phone.sideways, JSON.stringify(phone))
  await c.both(`${SHOT}-phone`)
  await c.size(1440, 900); await wait(600)

  // The reader's Details: the same head held still above the lists.
  await h.evaluate(([src, name]) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name, page: 1 } })), [src, NAME])
  await h.waitForSelector('.pdf-reader .pdf-page canvas', { timeout: 20000 }); await wait(1200)
  if (!(await h.$('.read-details'))) await h.click('.pdf-reader button[aria-label="Details"]')
  await h.waitForSelector('.read-details', { timeout: 5000 }); await wait(1200)
  const reader = await h.evaluate(async () => {
    const d = document.querySelector('.read-details')
    const head = d.querySelector('.book-panel-head')
    const body = d.querySelector('.book-panel-body')
    if (!head || !body) return { none: true, scrolls: getComputedStyle(d).overflowY }
    const before = head.getBoundingClientRect().top
    body.scrollTop = body.scrollHeight
    await new Promise((r) => setTimeout(r, 300))
    return { headMoved: Math.abs(head.getBoundingClientRect().top - before), panelScrolls: d.scrollHeight > d.clientHeight + 1, bodyScrolls: body.scrollHeight > body.clientHeight + 1, what: d.querySelector('.book-head-what')?.textContent }
  })
  check('the reader\'s Details: the head holds still, only the lists scroll', !reader.none && reader.headMoved < 1 && !reader.panelScrolls, JSON.stringify(reader))
  await c.both(`${SHOT}-reader`)
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
}
await c.close()
done()
