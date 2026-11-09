// Citations walked as a person writes them: "/" "Cite a source" with a DOI and
// a page (the chip goes in at once with the orb, typing goes on, it fills in),
// an ISBN, a DOI not found and one offline (plain words, filled in by hand), a
// DOI pasted alone on a line ("Make it a citation?"), "Works cited" at the foot
// and its "Copy", a chip opening its work's page with the notes citing it,
// "Add from DOI or ISBN" on the Sources page, and ⌘K finding the work.
// Crossref and Open Library are never called: a server here answers as they do
// (HALIGTREE_QA_CITE). Frames under QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/citations.mjs
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const asked = []
const server = createServer((req, res) => {
  asked.push({ url: req.url, agent: req.headers['user-agent'] ?? '' })
  const json = (status, body) => setTimeout(() => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }, asked.length === 1 ? 4000 : 1200)
  if (req.url.startsWith('/crossref/works/10.1000%2Ffrankenstein')) return json(200, { message: { title: ['Frankenstein; or, The Modern Prometheus'], author: [{ given: 'Mary', family: 'Shelley' }], issued: { 'date-parts': [[1831]] }, publisher: 'Henry Colburn and Richard Bentley', type: 'book' } })
  if (req.url.startsWith('/crossref/works/10.1000%2Fpair')) return json(200, { message: { title: ['On Two Minds'], author: [{ given: 'Ann', family: 'Lee' }, { given: 'Bo', family: 'Park' }], issued: { 'date-parts': [[2021]] }, 'container-title': ['Journal of Small Things'], publisher: 'Elsevier', type: 'journal-article' } })
  if (req.url.startsWith('/crossref/works/10.1000%2Foffline')) return json(503, {})
  if (req.url.startsWith('/crossref/')) return json(404, {})
  if (req.url.startsWith('/openlibrary/api/books') && req.url.includes('9780141439518')) return json(200, { 'ISBN:9780141439518': { title: 'Pride and Prejudice', authors: [{ name: 'Jane Austen' }], publishers: [{ name: 'Penguin Classics' }], publish_date: '2003' } })
  return json(200, {})
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
process.env.HALIGTREE_QA_CITE = `http://127.0.0.1:${server.address().port}`

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 800 })
const { h, v, errors } = c
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const wait = (ms) => h.waitForTimeout(ms)
const sel = '[data-open] .tiptap'
const shot = async (name) => shots && h.screenshot({ path: `${shots}/cite-${name}.png` })
const film = async (name, count = 8) => { for (let i = 0; i < count; i++) { await shot(`${name}-${String(i).padStart(2, '0')}`); await wait(50) } }
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const ed = (fn, arg) => h.evaluate(([sel, fn, arg]) => new Function('editor', 'arg', `return (${fn})(editor, arg)`)(document.querySelector(sel).editor, arg), [sel, fn.toString(), arg])
const type = (text) => h.keyboard.type(text, { delay: 12 })
const chips = () => ed((editor) => { const out = []; editor.state.doc.descendants((node) => void (node.type.name === 'citation' && out.push({ ...node.attrs }))); return out })
const chipTexts = () => h.evaluate(() => [...document.querySelectorAll('.mf-citation')].map((one) => one.textContent))
const toastText = () => h.evaluate(() => [...document.querySelectorAll('[role="status"][aria-live]')].map((one) => one.textContent).join(' | '))
const toastAction = (label) => h.evaluate((label) => { const button = [...document.querySelectorAll('[role="status"][aria-live] button')].find((one) => one.textContent.includes(label)); button?.click(); return !!button }, label)
const answer = async (words) => {
  await h.waitForSelector('[data-ask] [data-ask-field] input, [data-ask] input', { timeout: 4000 })
  await h.evaluate(() => { const input = document.querySelector('[data-ask] input'); input.select() })
  if (words) await type(words)
  else await h.keyboard.press('Backspace')
  await h.keyboard.press('Enter'); await wait(350)
}
const skip = async () => { await h.waitForSelector('[data-ask-skip]', { timeout: 4000 }); await h.click('[data-ask-skip]'); await wait(350) }
const cite = async (words, end = true) => {
  if (end) await ed((editor) => editor.commands.focus('end'))
  await type(' /'); await wait(300); await type('cite'); await wait(400)
  const picked = await h.evaluate(() => document.querySelector('.tiptap-slash-menu .is-selected')?.textContent ?? '')
  await h.keyboard.press('Enter'); await wait(400)
  await answer(words)
  return picked
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'On monsters', body: { type: 'doc', content: [p('Start.')] } })
  await c.send('article', id); await wait(1500)
  await ed((editor) => editor.chain().setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The creature reads Milton' }] }] }).focus('end').run())
  await wait(200)

  // 1. "/" "cite", a DOI with a page: the chip at once, the orb in it, typing goes on, then "(Shelley 1831, p. 82)".
  const picked = await cite('10.1000/frankenstein p. 82', false)
  check('"/" "cite" picks "Cite a source"', /Cite a source/.test(picked), picked)
  await film('looking', 4)
  const orb = await h.evaluate(() => { const chip = document.querySelector('.mf-citation'); return chip ? `${chip.querySelector('.mf-orb-pill') ? 'mf-orb-pill ' : ''}${chip.textContent}` : 'none' })
  check('the chip shows the orb with "Looking up…" while Crossref is asked', /mf-orb-pill/.test(orb) && /Looking up/.test(orb), orb)
  await type(' and weeps.')
  const typed = await ed((editor) => editor.state.doc.textContent)
  check('typing goes on while it is looked up', typed.endsWith(' and weeps.'), typed)
  await h.waitForFunction(() => /Shelley/.test(document.querySelector('.mf-citation')?.textContent ?? ''), null, { timeout: 6000 })
  await film('filled', 4)
  check('the chip fills in as "(Shelley 1831, p. 82)"', (await chipTexts())[0] === '(Shelley 1831, p. 82)', JSON.stringify(await chipTexts()))
  check('Crossref was asked with the app named in User-Agent and no email', asked.some((one) => /frankenstein/.test(one.url) && /Haligtree/.test(one.agent) && !/@|mailto/.test(one.url + one.agent)), JSON.stringify(asked.at(-1)))
  const foot = await h.evaluate(() => ({ head: document.querySelector('[data-works-cited] h3')?.textContent, rows: [...document.querySelectorAll('[data-works-cited] li')].map((one) => one.textContent), link: document.querySelector('[data-works-cited] a')?.getAttribute('href') }))
  check('"Works cited" at the foot: author, year, title, publisher, DOI link', foot.head === 'Works cited' && foot.rows[0] === 'Shelley, Mary. 1831. Frankenstein; or, The Modern Prometheus. Henry Colburn and Richard Bentley. https://doi.org/10.1000/frankenstein' && foot.link === 'https://doi.org/10.1000/frankenstein', JSON.stringify(foot))
  const lastBlock = await h.evaluate(() => { const box = document.querySelector(`[data-open] .tiptap`); return box.lastElementChild?.matches('[data-works-cited]') || !!box.querySelector(':scope > [data-works-cited]') })
  check('"Works cited" sits inside the note, at its end', lastBlock)

  // 2. An ISBN, and a second DOI with two authors.
  await cite('9780141439518'); await h.waitForFunction(() => /Austen/.test(document.body.innerText), null, { timeout: 6000 }); await wait(200)
  await cite('https://doi.org/10.1000/pair, pp. 3-5'); await h.waitForFunction(() => /Lee and Park/.test(document.body.innerText), null, { timeout: 6000 }); await wait(200)
  const texts = await chipTexts()
  check('an ISBN is looked up in Open Library: "(Austen 2003)"', texts.includes('(Austen 2003)'), JSON.stringify(texts))
  check('a doi.org link with pp.: "(Lee and Park 2021, p. 3-5)"', texts.includes('(Lee and Park 2021, p. 3-5)'), JSON.stringify(texts))
  const rows = await h.evaluate(() => [...document.querySelectorAll('[data-works-cited] li')].map((one) => one.textContent.slice(0, 20)))
  check('three works cited, by surname', rows.length === 3 && rows[0].startsWith('Austen') && rows[1].startsWith('Lee') && rows[2].startsWith('Shelley'), JSON.stringify(rows))
  await shot('three')

  // 3. Copy: the lines as plain text, one each.
  await h.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = async (text) => void (window.__copied = text) })
  await h.click('[data-works-cited-copy]'); await wait(300)
  const copied = await h.evaluate(() => window.__copied)
  check('"Copy" puts the three lines on the clipboard', copied?.split('\n').length === 3 && copied.includes('Austen, Jane. 2003. Pride and Prejudice. Penguin Classics. ISBN 9780141439518'), JSON.stringify(copied))
  check('and says so', /Copied 3 works cited/.test(await toastText()), await toastText())

  // 4. Not found: plain words, and filled in by hand.
  await cite('10.1000/nothing'); await h.waitForSelector('.mf-citation[data-citation-missing]', { timeout: 6000 }); await wait(200)
  check('a DOI not found says so in plain words', /Nothing was found for 10\.1000\/nothing/.test(await toastText()), await toastText())
  await shot('missing')
  check('its chip shows it was not found', (await chipTexts()).includes('(10.1000/nothing)'))
  check('"Fill it in by hand" is offered', await toastAction('Fill it in by hand'))
  await answer('Notes on the Analytical Engine'); await answer('Ada Lovelace'); await answer('1843'); await skip()
  await wait(300)
  check('filled by hand, the chip reads "(Lovelace 1843)"', (await chipTexts()).includes('(Lovelace 1843)'), JSON.stringify(await chipTexts()))

  // 5. Offline: said as offline, the writing untouched.
  await cite('10.1000/offline'); await h.waitForSelector('.mf-citation[data-citation-missing]', { timeout: 6000 }); await wait(200)
  check('no network says "you seem to be offline"', /you seem to be offline/.test(await toastText()), await toastText())

  // 6. A DOI pasted alone on a line: "Make it a citation?".
  await ed((editor) => editor.chain().focus('end').run()); await h.keyboard.press('Enter'); await wait(150)
  await h.evaluate((sel) => { const data = new DataTransfer(); data.setData('text/plain', 'https://doi.org/10.1000/frankenstein'); document.querySelector(sel).dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })) }, sel)
  await wait(300)
  const pasted = await ed((editor) => editor.state.doc.lastChild.textContent)
  check('the DOI goes in as pasted, and "Make it a citation?" is asked', pasted === 'https://doi.org/10.1000/frankenstein' && /Make it a citation\?/.test(await toastText()), JSON.stringify({ pasted, toast: await toastText() }))
  check('"Make it a citation" pressed', await toastAction('Make it a citation'))
  await h.waitForFunction(() => [...document.querySelectorAll('.mf-citation')].filter((one) => /Shelley 1831\)/.test(one.textContent)).length === 1, null, { timeout: 6000 })
  const line = await ed((editor) => ({ text: editor.state.doc.lastChild.textContent, kinds: editor.state.doc.lastChild.content.content.map((one) => one.type.name) }))
  check('the pasted words become the chip', line.text === '' && line.kinds.join() === 'citation', JSON.stringify(line))
  const once = await h.evaluate(() => [...document.querySelectorAll('[data-works-cited] li')].filter((one) => one.textContent.startsWith('Shelley')).length)
  check('Shelley is listed once though cited twice', once === 1, String(once))
  await wait(2500)

  // 7. The chip opens its work's page: its details, and this note among those citing it.
  for (const name of ['light', 'dark']) { await c.look(name); await shot(`note-${name}`) }
  await c.look('light')
  await h.evaluate(() => [...document.querySelectorAll('.mf-citation')].find((one) => /Shelley/.test(one.textContent)).click())
  await h.waitForSelector('[data-source-page="medium"]', { timeout: 5000 }); await wait(900)
  const page = await h.evaluate(() => ({ name: document.querySelector('[data-source-name]')?.textContent, work: document.querySelector('[data-work-line]')?.textContent, cited: document.body.innerText.includes('Notes citing it') && document.body.innerText.includes('On monsters') }))
  check('a click on the chip opens "Frankenstein; or, The Modern Prometheus"', /Frankenstein/.test(page.name ?? ''), JSON.stringify(page))
  check('its page shows Mary Shelley, the publisher and the DOI', /Mary Shelley/.test(page.work ?? '') && /doi:10\.1000\/frankenstein/.test(page.work ?? ''), page.work)
  check('"Notes citing it" lists "On monsters"', page.cited)
  for (const name of ['light', 'dark']) { await c.look(name); await shot(`work-${name}`) }
  await c.look('light')
  const citers = await v('work:citers', 'Frankenstein; or, The Modern Prometheus')
  check('the store finds the note citing the work', citers.length === 1 && citers[0].id === id, JSON.stringify(citers))

  // 8. Sources page: "Add from DOI or ISBN".
  await c.go('sources')
  await h.click('[data-add-work]'); await wait(300)
  await answer('10.1000/pair')
  await h.waitForFunction(() => /On Two Minds/.test(document.querySelector('[data-source-name]')?.textContent ?? ''), null, { timeout: 6000 })
  check('"Add from DOI or ISBN" opens the work\'s page', true)
  await c.go('sources'); await wait(300)
  await h.click('[data-add-work]'); await wait(300)
  await answer('not a number')
  check('words that are neither say what a DOI and an ISBN look like', /not a DOI or an ISBN/.test(await toastText()), await toastText())
  for (const name of ['light', 'dark']) { await c.look(name); await shot(`sources-${name}`) }
  await c.look('light')

  // 9. ⌘K finds the work by its title.
  await h.keyboard.press('Escape'); await wait(200)
  await h.keyboard.press('Meta+k'); await wait(500)
  await type('Shelley')
  const found = await h.waitForFunction(() => /Frankenstein; or, The Modern Prometheus/.test(document.querySelector('[role="dialog"][aria-label="Search"]')?.textContent ?? ''), null, { timeout: 6000 }).then(() => true, () => false)
  await shot('cmdk')
  check('⌘K finds the work by its author', found)
  const opened = found && await h.evaluate(() => { const row = [...document.querySelectorAll('[role="dialog"][aria-label="Search"] [data-row-title]')].find((one) => /Modern Prometheus/.test(one.textContent)); row?.click(); return !!row })
  await wait(900)
  check('and opens its page, with the notes citing it', !!opened && /Frankenstein/.test(await h.evaluate(() => document.querySelector('[data-source-name]')?.textContent ?? '')) && await h.evaluate(() => document.body.innerText.includes('Notes citing it')))

  check('no page errors', !errors.filter((one) => !/ResizeObserver/.test(one)).length, errors.join(' | '))
} finally {
  await c.close()
  server.close()
}
done()
