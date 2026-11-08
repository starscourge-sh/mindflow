// Media › PDFs: the picked book's inspector lists every note and gem that links into it, in page order
// through the book, each with its page and the line it sits in; a click opens one. A small map draws the
// book in the middle, its linked notes around it and the links between them; a page bar marks where notes
// and highlights attach and where you are, and a tick opens the reader there. The reader's Details has the
// same list and bar. Screenshots light and dark, with 1 book and with 12.
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/media-pdf-links.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shot = (h, name) => process.env.SHOTS && h.screenshot({ path: `${process.env.SHOTS}/${name}.png` })

// A one-page PDF with a word on it; `extra` makes each one a different file.
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
const NAME = '18 - The Law Book (z-lib.org).pdf'

const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const pdfs = async () => { await go('media'); await wait(1200); await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'Books' }).first().click({ timeout: 5000 }); await wait(1800) }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  const src = await h.evaluate((bytes) => window.api.saveFile('18 - The Law Book (z-lib.org).pdf', new Uint8Array(bytes)), pdfBytes('Law'))
  const link = (words, page) => ({ type: 'text', text: words, marks: [{ type: 'link', attrs: { href: `${src}#page=${page}&name=${encodeURIComponent(NAME)}` } }] })
  const make = (body) => h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: body })
  await make([para('Reading pile'), { type: 'attachment', attrs: { src, name: NAME, size: 900 } }])
  // Three notes and a gem, each linking a different page; two of the notes link each other.
  const late = await make([para('Rights in the end'), para('The closing chapter on ', link('remedies', 210), ' ties it all together.')])
  const early = await make([para('Consent first'), para('Contract starts with ', link('consent', 12), ' and nothing else.'), para({ type: 'noteLink', attrs: { id: late, label: 'Rights in the end' } })])
  await make([para('Torts and harm'), para('Negligence needs a duty, as ', link('the book says', 80), '.')])
  const gem = await v('nugget:from', 'Precedent binds', {})
  await v('item:save', gem, { body: { type: 'doc', content: [para('Precedent binds lower courts: ', link('p. 150', 150))] } })
  // Read to page 134 of 300, with a highlight on page 40.
  await v('pdf:read', src, 134, 300)
  await v('pdf:highlight', src, { page: 40, quote: 'stare decisis', start: 0, end: 13 })
  await h.reload(); await wait(1500)

  await pdfs()
  const list = await h.evaluate(() => [...document.querySelectorAll('[data-inspector] [data-cited]')].map((one) => ({ page: Number(one.dataset.citedPage), title: one.querySelector('.book-cited-title')?.textContent, kind: one.querySelector('.book-cited-kind')?.textContent, line: one.querySelector('.book-cited-line')?.textContent ?? '', at: one.querySelector('.book-cited-page')?.textContent })))
  const linked = list.filter((one) => one.page > 0)
  check('"In your notes" lists the 3 notes and the gem that link pages', linked.length === 4 && linked.filter((one) => one.kind === 'Gem').length === 1, JSON.stringify(list))
  check('in page order through the book: 12, 80, 150, 210', linked.map((one) => one.page).join() === '12,80,150,210', linked.map((one) => one.page).join())
  check('each says its page ("p. 12")', linked[0]?.at === 'p. 12', linked[0]?.at)
  check('each shows the line its link sits in', /Contract starts with consent/.test(linked[0]?.line ?? '') && /Negligence needs a duty/.test(linked[1]?.line ?? ''), JSON.stringify(linked.map((one) => one.line)))
  await h.locator('[data-inspector] button', { hasText: 'Show more' }).click(); await wait(300)
  const facts = await h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-inspector] .pdf-inspector-row')].map((one) => [one.querySelector('dt')?.textContent, one.querySelector('dd')?.textContent])))
  check('the facts count the notes', facts['In your notes'] === String(list.length), JSON.stringify(facts))
  check('the file name is whole, not cut with an ellipsis', facts.File === NAME, facts.File)

  const map = await h.evaluate(() => { const one = document.querySelector('[data-inspector] [data-book-map]'); return { nodes: Number(one?.dataset.nodes), lines: Number(one?.dataset.lines), says: one?.querySelector('figcaption')?.textContent, canvas: !!one?.querySelector('canvas') } })
  check('the map draws the book and its 5 linked notes and gems', map.nodes === 6 && map.canvas, JSON.stringify(map))
  check('a line to each, and one between the two notes that link each other', map.lines === 6, JSON.stringify(map))
  check('the map says what it shows in one line', /5 notes link to this book; 1 link joins them to each other/.test(map.says ?? ''), map.says)

  const bar = await h.evaluate(() => ({ notes: [...document.querySelectorAll('[data-inspector] [data-tick=note]')].map((one) => Number(one.dataset.tickPage)), marks: [...document.querySelectorAll('[data-inspector] [data-tick=mark]')].map((one) => Number(one.dataset.tickPage)), here: document.querySelector('[data-inspector] [data-here]')?.dataset.here, says: document.querySelector('[data-inspector] .book-bar-says')?.textContent }))
  check('the page bar ticks each page a note links to', bar.notes.sort((a, b) => a - b).join() === '12,80,150,210', JSON.stringify(bar))
  check('and the highlight on p. 40, and marks you on p. 134', bar.marks.join() === '40' && bar.here === '134', JSON.stringify(bar))
  check('the bar says what its marks are, in one line of words', bar.says === '4 pages with notes · 1 page highlighted', bar.says)

  for (const theme of ['paper', 'dark']) {
    await c.look(theme === 'paper' ? 'light' : 'dark'); await wait(600)
    await shot(h, `media-pdf-1-book-${theme}`)
  }
  await c.look('light')

  // A click on a row opens the note.
  await h.locator('[data-inspector] [data-cited]', { hasText: 'Consent first' }).click(); await wait(1500)
  const opened = await h.evaluate(() => ({ media: !!document.querySelector('[data-page=media]'), words: document.querySelector('.tiptap')?.textContent ?? '' }))
  check('a click opens the note', !opened.media && /Contract starts with/.test(opened.words), JSON.stringify(opened).slice(0, 160))

  // A tick opens the reader on its page.
  await pdfs()
  await h.locator('[data-inspector] [data-tick=note][data-tick-page="80"]').click(); await wait(2500)
  check('a tick opens the reader', await h.evaluate(() => !!document.querySelector('.pdf-reader')), '')
  // The reader's Details has the same list and bar.
  const details = await h.evaluate(() => !!document.querySelector('.read-details'))
  if (!details) await h.locator('button[aria-label=Details]').first().click(); await wait(1200)
  const inReader = await h.evaluate(() => ({ rows: [...document.querySelectorAll('.read-details [data-cited]')].map((one) => Number(one.dataset.citedPage)).filter(Boolean), bar: !!document.querySelector('.read-details [data-page-bar]') }))
  check('the reader\'s Details lists them in page order too, with the page bar', inReader.rows.join() === '12,80,150,210' && inReader.bar, JSON.stringify(inReader))
  await shot(h, 'media-pdf-reader-details')

  // Twelve books.
  const more = []
  for (let i = 1; i <= 11; i++) more.push(await h.evaluate(([bytes, n]) => window.api.saveFile(`Volume ${n}.pdf`, new Uint8Array(bytes)), [pdfBytes(`Vol ${i}`, `% ${i}\n`), i]))
  await make([para('The rest of the shelf'), ...more.map((one, i) => ({ type: 'attachment', attrs: { src: one, name: `Volume ${i + 1}.pdf`, size: 900 } }))])
  // The reader kept where it was on this one-page file: back to p. 134 of 300 for the pictures.
  await v('pdf:read', src, 134, 300)
  await pdfs(); await wait(2500)
  check('twelve books on the shelf', await h.evaluate(() => document.querySelectorAll('[data-library] .pdf-book').length) === 12, '')
  await h.locator('[data-library] .pdf-book', { hasText: 'The Law Book' }).click(); await wait(1200)
  await h.mouse.move(5, 450); await wait(600)
  const top = await h.evaluate(() => { const one = document.querySelector('[data-inspector]'); const box = one?.getBoundingClientRect(); const cover = one?.querySelector('.book-head-cover')?.getBoundingClientRect(); return { scrolled: one?.scrollTop, cover: cover && box ? Math.round(cover.top - box.top) : null } })
  check('with a long shelf the inspector still starts at its cover', top.scrolled === 0 && top.cover !== null && top.cover >= 0, JSON.stringify(top))
  for (const theme of ['paper', 'dark']) {
    await c.look(theme === 'paper' ? 'light' : 'dark'); await wait(600)
    await shot(h, `media-pdf-12-books-${theme}`)
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5).join('\n'))
  await c.close()
}
done()
