// The example book's works arrive whole, as its people do: every work on the Sources page (and Gandalf's book, which his
// page opens) has what kind it is, its year where one can be given, who wrote it and a line about it from the first
// frame its page shows; opening every one of them asks Wikipedia nothing (counted on a stand-in address). A where that
// names its year already is never given it twice under a quote. A source you add yourself is still looked up when its
// page is first opened, and never before.
//
// Run on a sandbox seeded by this build: an empty QA_DATA seeds one (about 160 s), HALIGTREE_QA_STORY names its story.
//   QA_ARGS=--sandbox QA_DATA=<empty or a seeded copy> HALIGTREE_QA_STORY=frankenstein QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sandbox-works.mjs
// QA_SHOTS=<folder>: the Sources page's works and three works' pages, light and dark, and frames of one opening.
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_STORY ??= 'frankenstein'

// Every ask is counted; only A Book of My Own has an article.
const asks = []
const server = createServer((req, res) => {
  asks.push(decodeURIComponent(req.url))
  res.setHeader('content-type', 'application/json')
  if (req.url.startsWith('/wiki/A_Book_of_My_Own')) return void res.end(JSON.stringify({ type: 'standard', title: 'A Book of My Own', description: 'Book', extract: 'A Book of My Own is a book. It was added a moment ago.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/A_Book_of_My_Own' } } }))
  res.statusCode = 404
  res.end('{}')
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
process.env.HALIGTREE_QA_WIKI = `http://127.0.0.1:${server.address().port}/wiki/`

// A few read in full: [where, kind, year, who wrote it]. The rest need a kind and a line.
const SURE = [['Pride and Prejudice, chapter 1', 'Novel', '1813', 'Jane Austen'], ['Frankenstein, chapter 4 (1831)', 'Novel', '1831', 'Mary Shelley'],
  ['Hamlet, Act 1, Scene 3', 'Play', '', 'William Shakespeare'], ['The Odyssey, Book 1, tr. Samuel Butler (1900)', 'Epic poem', '1900', 'Homer'], ["Grandad's shelf", 'Bookshelf', '', '']]
const STORY = { sherlock: 'A Scandal in Bohemia', frankenstein: 'Frankenstein', dracula: 'Dracula', pride: 'Pride and Prejudice', odyssey: 'The Odyssey' }
const story = process.env.HALIGTREE_QA_STORY
const GANDALF_BOOK = 'The Fellowship of the Ring'

const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v, size, look, errors } = c
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const wait = (ms) => h.waitForTimeout(ms)
// A work's own row on Sources, by the id it is listed under. The list draws only the rows in view, so its page is
// scrolled down until the row is drawn (`reveal`), as a person scrolls to find it.
const rowOf = (name) => h.locator(`[data-row][data-id=${JSON.stringify(`medium:${name}`)}]`).first()
const reveal = (name) => h.evaluate(async (id) => {
  const sel = `[data-row][data-id="${CSS.escape(id)}"]`
  let box = document.querySelector('[data-row]')?.parentElement
  while (box && !(box.scrollHeight > box.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  if (!box) return !!document.querySelector(sel)
  box.scrollTop = 0
  for (let n = 0; n < 200 && !document.querySelector(sel) && box.scrollTop < box.scrollHeight - box.clientHeight - 1; n++) {
    box.scrollTop += Math.max(100, box.clientHeight / 2)
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  }
  return !!document.querySelector(sel)
}, `medium:${name}`)
// One work's page from just before it is asked for: the first frame it can be seen, its line (words, the wait for
// Wikipedia, or the ask for one), its kind and year as typed in its line, and who wrote it; whether any of it changes
// in the half second after. `open` is how it is asked for: the app's own event, or a press on something.
const firstFrame = (name, how = 'event') => h.evaluate(([name, how]) => new Promise((resolve) => {
  const start = performance.now()
  if (how === 'event') window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `medium:${name}` }))
  const read = () => {
    const page = document.querySelector('[data-source-page="medium"]')
    const head = page?.querySelector('[data-source-name]')
    if (!page || !head || !page.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || head.textContent.trim() !== name) return null
    const line = page.querySelector('[data-bio-room], [data-bio], [data-bio-add]')
    const fact = (label) => page.querySelector(`[data-fact="${label}"]`)?.value ?? ''
    // Its name cut short while the row still had room for all of it.
    const room = head.parentElement.parentElement.getBoundingClientRect().right - head.getBoundingClientRect().left - 24
    const cut = head.scrollWidth > head.clientWidth + 1 && head.scrollWidth <= room
    return { cut, line: line ? (line.hasAttribute('data-bio-room') ? 'looking up' : line.hasAttribute('data-bio') ? 'words' : 'add') : 'none', kind: fact('Kind'), year: fact('Year'),
      by: page.querySelector('[data-work-line]')?.textContent.trim() ?? '', words: page.querySelector('[data-bio-text] [contenteditable]')?.textContent?.slice(0, 60) ?? '' }
  }
  let first = null
  let steady = true
  const tick = setInterval(() => {
    const now = performance.now() - start
    const seen = read()
    if (seen && !first) first = { t: Math.round(now), ...seen }
    else if (seen && first && (seen.line !== first.line || seen.kind !== first.kind || seen.by !== first.by)) steady = false
    if ((first && now - first.t > 500) || now > 3500) (clearInterval(tick), resolve(first ? { ...first, steady } : null))
  }, 50)
}), [name, how])

try {
  const list = await v('sources')
  const listed = list.filter((one) => one.field === 'medium').map((one) => one.name)
  const works = [...listed, ...(listed.includes(GANDALF_BOOK) ? [] : [GANDALF_BOOK])]
  console.log(`${listed.length} works on Sources (story ${story}), and ${GANDALF_BOOK} from Gandalf's page`)
  check(`the story's book (${STORY[story]}) is among them`, listed.includes(STORY[story]), listed.join(' | ').slice(0, 300))

  // What is kept for each: a kind, a line in your words, marked as looked up, with no address to credit.
  const kept = await v('works')
  const authorOf = (name) => kept.find((one) => one.title === name)?.authors ?? ''
  const bare = []
  for (const name of works) {
    const page = await v('source', 'medium', name)
    if (!page || !page.what || page.bio.trim().length < 20 || !page.bioAt || page.bioUrl) bare.push(`${name}: ${page ? `kind "${page.what}", line ${page.bio.length}, asked ${!!page.bioAt}, url "${page.bioUrl}"` : 'no page'}`)
  }
  check(`all ${works.length} works: a kind and a line, kept as looked up`, !bare.length, bare.join(' | ').slice(0, 600) || 'none bare')
  for (const [name, kind, year, by] of SURE) {
    const page = await v('source', 'medium', name)
    check(`${name}: ${kind}, ${year || 'no year (not one known)'}, ${by || 'nobody wrote it'}`, page?.what === kind && page.born === year && authorOf(name) === by, page ? `${page.what} | ${page.born} | ${authorOf(name)}` : 'no page')
  }

  // Under a quote on a person's page, a where that names its year is not given it again; one that does not, is.
  await c.send('view', 'sources')
  await wait(600)
  const fromLines = async (who) => {
    await h.evaluate((who) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `attribution:${who}` })), who)
    await wait(900)
    return h.evaluate(() => [...document.querySelectorAll('[data-quote-from]')].map((one) => one.textContent.trim()))
  }
  const shelley = await fromLines('Mary Shelley')
  // Her page beside the works' own, light and dark: the sibling a work's page is read against.
  if (shots) { for (const name of ['light', 'dark']) { await look(name); await h.screenshot({ path: `${shots}/person-mary-shelley-${name}.png` }) } await look('light') }
  check('Mary Shelley’s quotes: “Frankenstein, chapter 4 (1831)”, never its year twice', shelley.includes('Frankenstein, chapter 4 (1831)') && !shelley.some((one) => /\((\d{4})\)\s*\(\1\)/.test(one)), shelley.join(' | '))
  const austen = await fromLines('Jane Austen')
  check('Jane Austen’s quotes: “Pride and Prejudice, chapter 1 (1813)”, its year given once', austen.includes('Pride and Prejudice, chapter 1 (1813)'), austen.join(' | '))

  // Each work's page, opened: its line, kind and author there in the first frame (never "Looking up"), and nothing asked.
  const before = asks.length
  const wrong = []
  let pages = 0
  for (const name of works) {
    const page = await firstFrame(name)
    pages++
    const by = authorOf(name)
    if (!(page?.line === 'words' && page.kind && page.steady && !page.cut && (!by || page.by.startsWith(by.split(';')[0].trim())))) wrong.push(`${name} ${JSON.stringify(page)}`)
    await wait(150)
  }
  check(`each of the ${pages} works' pages: its line, kind and author in the first frame, they stay, and its name is not cut while it fits`, !wrong.length, wrong.join(' | ').slice(0, 700) || 'all whole')

  // Three by a press on their row on Sources, as a person opens them; one by Gandalf's "in The Fellowship of the Ring".
  const pressed = []
  for (const name of [STORY[story], 'Hamlet, Act 1, Scene 3', 'Meditations, Book 2, tr. George Long (1862)']) {
    await c.send('view', 'sources')
    await wait(900)
    await reveal(name)
    const row = rowOf(name)
    const found = await row.count()
    if (!found) { pressed.push(`${name}: no row`); continue }
    await row.scrollIntoViewIfNeeded()
    const watching = firstFrame(name, 'press')
    await row.click()
    const page = await watching
    pressed.push(`${name}: ${page?.line} ${page?.kind} ${page?.steady ? 'steady' : 'moved'}`)
    if (!(page?.line === 'words' && page.kind && page.steady)) pressed.push('WRONG')
    if (shots) {
      await wait(400)
      const file = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')
      for (const name of ['light', 'dark']) { await look(name); await h.screenshot({ path: `${shots}/work-${file}-${name}.png` }) }
      await look('light')
    }
  }
  check('three works opened by a press on their Sources row: whole in the first frame', !pressed.includes('WRONG') && !pressed.some((one) => one.includes('no row')), pressed.join(' | '))
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: 'attribution:Gandalf' })))
  await wait(900)
  const link = h.locator('[data-character-work-open]').first()
  const onLink = await link.count() ? (await link.textContent()).trim() : ''
  const watching = firstFrame(GANDALF_BOOK, 'press')
  if (onLink) await link.click()
  const gandalfBook = await watching
  check(`Gandalf's page: "in ${GANDALF_BOOK}" opens its page, whole in the first frame`, onLink === GANDALF_BOOK && gandalfBook?.line === 'words' && gandalfBook.by.startsWith('J. R. R. Tolkien') && gandalfBook.steady, `${onLink} ; ${JSON.stringify(gandalfBook)}`)
  // And from ⌘K: a work is found by who wrote it, and a click on it opens its page whole.
  await c.send('view', 'home')
  await wait(900)
  await h.keyboard.press('Meta+k')
  await wait(500)
  await h.keyboard.type('Shakespeare')
  await wait(900)
  const found = h.locator(`div[aria-label="Search"] button[data-drag-open=${JSON.stringify('work:Hamlet, Act 1, Scene 3')}]`)
  const listedThere = await found.count() > 0
  const fromSearch = listedThere ? firstFrame('Hamlet, Act 1, Scene 3', 'press') : null
  if (listedThere) await found.first().click()
  const searched = await fromSearch
  check('⌘K “Shakespeare” lists Hamlet, Act 1, Scene 3 as his work, and a click opens its page whole', listedThere && searched?.line === 'words' && searched.by.startsWith('William Shakespeare') && searched.steady, `${listedThere} ; ${JSON.stringify(searched)}`)
  if (!listedThere) await h.keyboard.press('Escape')
  await wait(1500)
  check(`opening all ${pages + 5} works' pages asked Wikipedia nothing`, asks.length === before && before === 0, `${asks.length} asks: ${asks.join(' | ').slice(0, 400)}`)

  // The Sources page's works, as a person sees them: the list of them, light and dark, at both sizes.
  if (shots) {
    await c.send('view', 'sources')
    await wait(900)
    for (const [w, hh] of [[1440, 900], [560, 400]]) {
      await size(w, hh)
      const first = listed.find((one) => one.startsWith('A podcast')) ?? listed[0]
      await reveal(first)
      const head = rowOf(first)
      if (await head.count()) await head.scrollIntoViewIfNeeded()
      for (const name of ['light', 'dark']) { await look(name); await wait(300); await h.screenshot({ path: `${shots}/sources-works-${w}x${hh}-${name}.png` }) }
      await look('light')
    }
    await size(1440, 900)
    // Frames every 50ms through one opening: the press, then the page coming in.
    await c.send('view', 'sources')
    await wait(900)
    await reveal('Pride and Prejudice, chapter 34')
    const row = rowOf('Pride and Prejudice, chapter 34')
    if (await row.count()) {
      await row.scrollIntoViewIfNeeded()
      await row.click()
      for (let n = 0; n < 12; n++) { await h.screenshot({ path: `${shots}/frames-open-${String(n).padStart(2, '0')}.png` }); await wait(50) }
    }
  }

  // At the window's smallest, 560 by 400: the longest work's name and a short one, light and dark.
  if (shots) {
    await size(560, 400)
    const longest = [...listed].sort((a, b) => b.length - a.length)[0]
    // Whole: neither it nor anything in it is cut short (a word cut with "…" is wider than the box that shows it).
    const whole = (selector) => h.evaluate((selector) => {
      const one = document.querySelector(selector)
      const cut = (el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1
      return one ? { text: one.innerText.trim(), whole: one.getBoundingClientRect().width > 0 && !cut(one) && ![...one.querySelectorAll('*')].some(cut) } : null
    }, selector)
    let back = null
    for (const name of [longest, 'Hamlet, Act 1, Scene 3']) {
      await h.evaluate((name) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `medium:${name}` })), name)
      await wait(900)
      // The way back over the page is never cut short ("So…") by a long name beside it.
      if (name === longest) back = await whole('[data-source-back]')
      const file = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '').slice(0, 40)
      for (const name of ['light', 'dark']) { await look(name); await wait(250); await h.screenshot({ path: `${shots}/small-${file}-${name}.png` }) }
      await look('light')
    }
    // Any box around the page that scrolls sideways, the window's own included.
    const sideways = await h.evaluate(() => {
      const wide = (one) => one.scrollWidth > one.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(one).overflowX)
      for (let box = document.querySelector('[data-source-page="medium"]'); box; box = box.parentElement) if (wide(box)) return `${box.className.slice(0, 40)}: ${box.scrollWidth} > ${box.clientWidth}`
      const root = document.scrollingElement
      return root && root.scrollWidth > root.clientWidth + 1 ? `the window: ${root.scrollWidth} > ${root.clientWidth}` : ''
    })
    check('at 560 by 400 a work\'s page has no sideways scroll', !sideways, sideways || 'none')
    check(`at 560 by 400 the path over the longest work's page (${longest.length} letters) still says “Sources” whole`, back?.text === 'Sources' && back.whole, JSON.stringify(back))
    // And in a folder's path (items-view.tsx, the same parts): "Writing" over a folder three deep.
    await size(1440, 900)
    await c.send('view', 'articles')
    await wait(900)
    await h.locator('aside').getByText('Leonardo', { exact: true }).first().click()
    await wait(900)
    await size(560, 400)
    await wait(500)
    const root = await whole('[data-path-bar] [data-folder-back]')
    const path = await h.evaluate(() => document.querySelector('[data-path-bar]')?.innerText.replace(/\s+/g, ' ').trim() ?? '')
    for (const name of ['light', 'dark']) { await look(name); await wait(250); await h.screenshot({ path: `${shots}/small-folder-path-${name}.png` }) }
    await look('light')
    check('at 560 by 400 a deep folder\'s path still says “Writing” whole', root?.text === 'Writing' && root.whole, `${JSON.stringify(root)} ; ${path}`)
    await size(1440, 900)
  }

  // Your own source: nothing is asked when its note is made, and its page asks once when it is first opened.
  const ownBefore = asks.length
  await h.evaluate(() => window.api.captures.create({ kind: 'quote', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A line from a book of my own.' }] }] }, attribution: 'Somebody', medium: 'A Book of My Own' }))
  await wait(1500)
  check('a source of your own: nothing asked before its page is opened', asks.length === ownBefore, asks.slice(ownBefore).join(' | '))
  const mine = await firstFrame('A Book of My Own')
  await wait(2500)
  const own = asks.slice(ownBefore)
  check('a source of your own: its page asks once, on its first opening', own.length === 1 && own[0].startsWith('/wiki/A_Book_of_My_Own') && mine?.line === 'looking up', `${own.join(' | ')} ; first frame ${JSON.stringify(mine)}`)
  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
} finally {
  await c.close()
  server.close()
}
done()
