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
import { copiedText } from './pasteboard.mjs'
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
// Wide enough that the Sources page keeps "Add from DOI or ISBN" on its bar (below about 1,300px it folds behind "⋯").
const c = await sandbox({ width: 1320, height: 800 })
const { h, v, errors } = c
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const wait = (ms) => h.waitForTimeout(ms)
// The page's body: the page's one-line editors (is-line, is-plain) are drawn before it, and the first match was one.
const sel = '[data-open] .tiptap:not(.is-line):not(.is-plain)'
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
  check('the chip shows the orb with "Looking up…" while Crossref is asked', /mf-orb-pill/.test(orb) && /Looking up/.test(orb), `${orb}; asked so far: ${asked.map((one) => one.url).join(', ')}`)
  await type(' and weeps.')
  const typed = await ed((editor) => editor.state.doc.textContent)
  check('typing goes on while it is looked up', typed.endsWith(' and weeps.'), typed)
  await h.waitForFunction(() => /Shelley/.test(document.querySelector('.mf-citation')?.textContent ?? ''), null, { timeout: 6000 })
  await film('filled', 4)
  check('the chip fills in as "(Shelley 1831, p. 82)"', (await chipTexts())[0] === '(Shelley 1831, p. 82)', JSON.stringify(await chipTexts()))
  check('Crossref was asked with the app named in User-Agent and no email', asked.some((one) => /frankenstein/.test(one.url) && /Haligtree/.test(one.agent) && !/@|mailto/.test(one.url + one.agent)), JSON.stringify(asked.at(-1)))
  const foot = await h.evaluate(() => ({ head: document.querySelector('[data-works-cited] h3')?.textContent, rows: [...document.querySelectorAll('[data-works-cited] [data-work-cited]')].map((one) => one.textContent), link: document.querySelector('[data-works-cited] a')?.getAttribute('href') }))
  check('"Works cited" at the foot: author, year, title, publisher, DOI link', foot.head === 'Works cited · made from your citations' && foot.rows[0] === 'Shelley, Mary. 1831. Frankenstein; or, The Modern Prometheus. Henry Colburn and Richard Bentley. https://doi.org/10.1000/frankenstein' && foot.link === 'https://doi.org/10.1000/frankenstein', JSON.stringify(foot))
  const lastBlock = await h.evaluate((sel) => { const box = document.querySelector(sel); return box.lastElementChild?.matches('[data-works-cited]') || !!box.querySelector(':scope > [data-works-cited]') }, sel)
  check('"Works cited" sits inside the note, at its end', lastBlock)

  // 2. An ISBN, and a second DOI with two authors.
  await cite('9780141439518'); await h.waitForFunction(() => /Austen/.test(document.body.innerText), null, { timeout: 6000 }); await wait(200)
  await cite('https://doi.org/10.1000/pair, pp. 3-5'); await h.waitForFunction(() => /Lee and Park/.test(document.body.innerText), null, { timeout: 6000 }); await wait(200)
  const texts = await chipTexts()
  check('an ISBN is looked up in Open Library: "(Austen 2003)"', texts.includes('(Austen 2003)'), JSON.stringify(texts))
  check('a doi.org link with pp.: "(Lee and Park 2021, p. 3-5)"', texts.includes('(Lee and Park 2021, p. 3-5)'), JSON.stringify(texts))
  const rows = await h.evaluate(() => [...document.querySelectorAll('[data-works-cited] [data-work-cited]')].map((one) => one.textContent.slice(0, 20)))
  check('three works cited, by surname', rows.length === 3 && rows[0].startsWith('Austen') && rows[1].startsWith('Lee') && rows[2].startsWith('Shelley'), JSON.stringify(rows))
  await shot('three')

  // 3. Copy: the lines as plain text, one each.
  await h.click('[data-works-cited-copy]'); await wait(300)
  const copied = await copiedText(c.electron)
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

  // 5. The lookup did not answer (503) with the Mac online: said as that, never "offline" (the user's rule 1, 15 Nov 2026:
  // "dont have catchall errors when you can be more specific"); then the same with the Mac offline (main's net says so).
  await cite('10.1000/offline'); await h.waitForSelector('.mf-citation[data-citation-missing]', { timeout: 6000 }); await wait(200)
  check('a lookup that did not answer says so, not "offline"', /did not answer just now/.test(await toastText()) && !/is offline|seem to be offline/.test(await toastText()), await toastText())
  await c.electron.evaluate(({ net }) => { globalThis.__wasOnline = net.isOnline; net.isOnline = () => false })
  await cite('10.1000/offline'); await wait(900)
  check('with the Mac offline, it says the Mac is offline', /this Mac is offline/.test(await toastText()), await toastText())
  await c.electron.evaluate(({ net }) => { net.isOnline = globalThis.__wasOnline })

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
  const once = await h.evaluate(() => [...document.querySelectorAll('[data-works-cited] [data-work-cited]')].filter((one) => one.textContent.startsWith('Shelley')).length)
  check('Shelley is listed once though cited twice', once === 1, String(once))
  await wait(2500)

  // 6b. A citation's page changed after it went in: right-click, "Edit the page", a field in the chip itself where the
  // number stands; Enter keeps it, Esc leaves it, ⌘Z puts the old page back; one with no page offers "Add a page".
  const chipEl = (re) => h.evaluateHandle((src) => [...document.querySelectorAll('.mf-citation')].find((one) => new RegExp(src).test(one.textContent)), re)
  const pageOfChip = async (work) => (await chips()).find((one) => one.work.startsWith(work))?.page
  const editVia = async (re, name) => {
    const el = await chipEl(re)
    // On its words, as a person clicks: a chip that wraps has only space at the middle of its whole box.
    const box = await el.evaluate((one) => { const r = one.getClientRects()[0]; return { x: r.x, y: r.y, width: r.width, height: r.height } })
    await h.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' }); await wait(400)
    const menu = await h.evaluate(() => ({ group: document.querySelector('[data-clicked-group="citation"]')?.textContent ?? '', lines: [...document.querySelectorAll('[data-clicked]')].map((one) => one.textContent.trim()) }))
    // No line to press: say what the right-click opened and what is under the pointer, with a picture, not only a timeout.
    if (!(await h.locator('[data-clicked="edit-page"]').count())) {
      const under = await h.evaluate(([x, y]) => { const one = document.elementFromPoint(x, y); return `${one?.tagName.toLowerCase()}.${String(one?.className).split(' ')[0]} "${one?.textContent?.slice(0, 40)}"` }, [box.x + box.width / 2, box.y + box.height / 2])
      if (shots) await shot(`no-edit-page-${String(re).replace(/\W+/g, '-')}`)
      throw new Error(`right-click on "${re}" opened no "Edit the page": menu ${JSON.stringify(menu)}, under the pointer ${under}, chip at ${JSON.stringify(box)}`)
    }
    await h.click('[data-clicked="edit-page"]', { timeout: 4000 })
    if (shots && name) await film(name, 6)
    await h.waitForSelector('[data-cite-page]', { timeout: 3000 })
    return menu
  }
  const menu = await editVia('Shelley 1831, p. 82', 'page-edit')
  check('right-click on a citation: its own lines, "Open the work" and "Edit the page"', menu.group === 'Citation, p. 82' && menu.lines.some((one) => /Open the work/.test(one)) && menu.lines.some((one) => /Edit the page/.test(one)), JSON.stringify(menu))
  const field = await h.evaluate(() => { const input = document.querySelector('[data-cite-page]'); return { value: input?.value, focused: document.activeElement === input, picked: input && input.selectionStart === 0 && input.selectionEnd === input.value.length, chip: input?.closest('.mf-citation')?.textContent } })
  check('"Edit the page" puts a field in the chip where the page stands, focused, its number picked', field.value === '82' && field.focused && field.picked && field.chip.startsWith('(Shelley 1831, p.'), JSON.stringify(field))
  await type('90'); if (shots) await film('page-typed', 3)
  await h.keyboard.press('Enter'); await wait(300); if (shots) await film('page-kept', 4)
  check('Enter keeps it: "(Shelley 1831, p. 90)", the field gone', (await pageOfChip('Frankenstein')) === '90' && (await chipTexts()).includes('(Shelley 1831, p. 90)') && !(await h.locator('[data-cite-page]').count()), JSON.stringify(await chipTexts()))
  const caret = await ed((editor) => editor.isFocused)
  check('the writing has the keys again', caret)
  await h.keyboard.press('Meta+z'); await wait(300)
  check('⌘Z puts the old page back', (await pageOfChip('Frankenstein')) === '82', String(await pageOfChip('Frankenstein')))
  await editVia('Shelley 1831, p. 82')
  await type('100'); await h.keyboard.press('Escape'); await wait(300)
  check('Esc leaves the page as it was', (await pageOfChip('Frankenstein')) === '82' && !(await h.locator('[data-cite-page]').count()), String(await pageOfChip('Frankenstein')))
  const none = await editVia('Austen 2003\\)')
  check('a citation with no page offers "Add a page"', none.lines.some((one) => /Add a page/.test(one)), JSON.stringify(none.lines))
  await type('p. 12'); await h.keyboard.press('Enter'); await wait(300)
  check('"p. 12" typed reads as page 12: "(Austen 2003, p. 12)"', (await chipTexts()).includes('(Austen 2003, p. 12)'), JSON.stringify(await chipTexts()))
  for (const name of ['light', 'dark']) { await c.look(name); await editVia('Austen 2003, p. 12'); await shot(`page-field-${name}`); await h.keyboard.press('Escape'); await wait(200) }

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
