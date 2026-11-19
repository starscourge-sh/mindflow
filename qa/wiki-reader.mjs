// Wikipedia searched and read inside Haligtree (its part B, the reader beside a note, went on 18 Nov: qa/REMOVED-18nov.md).
// ⌘K offers "Search Wikipedia for “…”" under your own results and asks Wikipedia
// nothing until that line is picked, then only the words typed; its answers come
// with their one line and a free picture; ↵ reads one in the reader, with its
// sections beside it, its Commons picture kept and credited (a fair-use one gone),
// a link to another article followed in place with Back and Forward, a link out
// of Wikipedia sent to the browser, a highlight kept as a gem citing the article,
// its section and the day read. The site down, ⌘K says Wikipedia did not answer in one
// line, and a kept article still opens. Wikipedia is a stand-in (qa/wiki-stand-in.mjs).
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/wiki-reader.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { standIn, ROMAN, BYZANTINE, CARTHAGE } from './wiki-stand-in.mjs'
process.env.QA_ARGS ??= '--sandbox'
const site = await standIn()
process.env.HALIGTREE_QA_SITES = site.base

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const searches = () => site.asked.filter((one) => one.includes('/w/rest.php/v1/search/page'))
const heading = () => h.evaluate(() => document.querySelector('.web-reader-heading')?.textContent ?? null)
const until = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await test()) return true; return false }
try {
  await electron.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (url) => void globalThis.__opened.push(url) })
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  await wait(600)

  // ⌘K, words typed: the line is there, under your own results, and nothing has been asked.
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('roman empire', { delay: 30 }); await wait(900)
  const line = await h.evaluate(() => {
    const row = document.querySelector('[data-look="wikipedia"][data-look-kind="line"]')
    const results = [...document.querySelectorAll('[role="dialog"] [data-row]')]
    return { text: row?.textContent ?? null, under: !!row && results.every((one) => one.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING), results: results.length, island: row?.closest('[data-island]')?.querySelector('[data-island-head]')?.textContent ?? null, others: [...document.querySelectorAll('[data-look][data-look-kind="line"]')].map((one) => one.getAttribute('data-look')) }
  })
  check('⌘K offers “Search Wikipedia for “roman empire”” as a line of its own', line.text === 'Search Wikipedia for “roman empire”', JSON.stringify(line))
  check('…under your own results, with Wiktionary, Project Gutenberg, the Stanford Encyclopedia and Fandom each a line of its own', line.under && line.others.join() === 'wikipedia,wiktionary,gutenberg,sep,fandom', JSON.stringify(line))
  check('nothing is sent to Wikipedia while typing', searches().length === 0, JSON.stringify(site.asked))
  await c.both(`${shots}/w4-cmdk-line`)

  // Picked: Wikipedia's own search, once, with the words alone; its answers take the line's place.
  // Frames through the change, about one every 50ms (each picture takes part of that).
  const film = async (name, count = 10) => { if (!process.env.QA_SHOTS) return; for (let n = 0; n < count; n++) { await h.screenshot({ path: `${shots}/${name}-${String(n).padStart(2, '0')}.png` }); await wait(20) } }
  await h.click('[data-look="wikipedia"][data-look-kind="line"]')
  await film('w4-frames-ask')
  await until(() => h.evaluate(() => document.querySelectorAll('[data-look-kind="hit"]').length > 0))
  const hits = await h.evaluate(() => [...document.querySelectorAll('[data-look-kind="hit"]')].map((one) => ({ title: one.querySelector('[data-look-title]')?.textContent, line: one.querySelector('[data-look-line]')?.textContent ?? '', picture: one.querySelector('img')?.getAttribute('src')?.slice(0, 22) ?? null, lit: one.hasAttribute('data-search-at') })))
  check('picking the line asks Wikipedia once, for the words typed and nothing else', searches().length === 1 && new URL(searches()[0], 'http://x').searchParams.get('q') === 'roman empire', JSON.stringify(searches()))
  check('its answers are listed: title and one line each', hits.map((one) => one.title).join('|') === 'Roman Empire|Holy Roman Empire|Byzantine Empire' && hits[0].line === 'State and civilisation, 27 BC to AD 476' && hits[2].line.startsWith('The Byzantine Empire, also called the Eastern Roman Empire'), JSON.stringify(hits))
  check('a picture where it is free (Commons), none where it is not', hits[0].picture === 'data:image/png;base64,' && hits[1].picture === null, JSON.stringify(hits.map((one) => one.picture)))
  check('the light goes to the first answer, so ↵ reads it', hits[0].lit, JSON.stringify(hits.map((one) => one.lit)))
  const peek = await h.evaluate(() => document.querySelector('[data-look-peek]')?.textContent ?? '')
  check('the preview names it, its line and where it opens', /Roman Empire/.test(peek) && /Read here in the reader/.test(peek), peek)
  await c.both(`${shots}/w4-cmdk-hits`)

  // ↵: the article in the reader.
  await h.keyboard.press('Enter')
  await film('w4-frames-open', 12)
  await until(async () => (await heading()) === 'Roman Empire', 15000)
  await wait(500)
  const read = await h.evaluate(() => {
    const body = document.querySelector('.web-reader-body')
    return {
      readers: document.querySelectorAll('.web-reader').length,
      // The page's head: the site over the title, the byline under it.
      meta: [...document.querySelectorAll('.web-reader-kicker, .web-reader-meta')].map((one) => one.textContent).join(' · '),
      kept: [...body.querySelectorAll('img')].map((one) => one.getAttribute('src')),
      credit: [...body.querySelectorAll('[data-credit] a')].map((one) => [one.textContent, one.getAttribute('href')]),
      poster: /film poster/i.test(body.innerHTML),
      footnote: !!body.querySelector('a[href*="#cite_note"]'),
      edits: /\[\s*edit\s*\]/.test(body.textContent),
      contents: [...document.querySelectorAll('.web-reader .pdf-rail [data-outline-title]')].map((one) => one.getAttribute('data-outline-title'))
    }
  })
  check('↵ reads the article in the reader', read.readers === 1, JSON.stringify(read))
  check('its Commons picture is kept with your notes and credited to its page there', read.kept.length === 1 && /^haligtree:\/\/assets\//.test(read.kept[0]) && read.credit.length === 1 && read.credit[0][0] === 'Picture: Wikimedia Commons' && read.credit[0][1] === 'https://commons.wikimedia.org/wiki/File:Colosseum.jpg', JSON.stringify([read.kept, read.credit]))
  check('a picture held under fair use is not kept, nor its caption', !read.poster, '')
  // Each part of the byline is held on one line by its own no-break spaces (\s finds those too).
  check('the byline says Wikipedia, its licence and that it is kept', /Wikipedia/.test(read.meta) && /CC\sBY-SA\s4\.0/.test(read.meta) && /kept\s/.test(read.meta), read.meta)
  check('a footnote mark is words, not a link that goes nowhere', !read.footnote, '')
  check('its sections stand beside it as contents, every heading kept and no “[edit]” left', read.contents.join('|') === 'History|Pax Romana|Legacy|References' && !read.edits, JSON.stringify([read.contents, read.edits]))
  const arrows = await h.evaluate(() => Object.fromEntries([...document.querySelectorAll('.web-reader-body a')].filter((one) => ['Byzantine Empire', 'a page elsewhere'].includes(one.textContent)).map((one) => [one.textContent, getComputedStyle(one, '::after').content])))
  check('a link the reader follows in place wears no arrow out; one to another site does', arrows['Byzantine Empire'] === 'none' && arrows['a page elsewhere'] !== 'none', JSON.stringify(arrows))
  await c.both(`${shots}/w4-reader-article`)
  await h.click('.web-reader .pdf-rail [data-outline-title="Legacy"]'); await wait(500)
  const atLegacy = await h.evaluate(() => {
    const box = document.querySelector('.web-reader-scroll').getBoundingClientRect()
    const legacy = [...document.querySelectorAll('.web-reader-body h2')].find((one) => one.textContent === 'Legacy').getBoundingClientRect()
    return { gap: Math.round(legacy.top - box.top), lit: document.querySelector('.web-reader .pdf-rail [aria-current]')?.getAttribute('data-outline-title'), chapter: document.querySelector('.web-reader [data-pdf-chapter]')?.textContent ?? null }
  })
  check('a section in the contents takes you to it, and is lit', atLegacy.gap >= 0 && atLegacy.gap < 60 && atLegacy.lit === 'Legacy', JSON.stringify(atLegacy))
  check('the section you are in stands beside the title, as a PDF\'s chapter does', atLegacy.chapter === 'Legacy', JSON.stringify(atLegacy))

  // A link to another article, followed in the reader from deep in the page (Legacy, reached above);
  // Back comes to where you were, Forward goes again.
  const DEEP = 'the empire in the east'
  // On the link's own first line: a link that wraps has the middle of its whole box on other words.
  const linkAt = await h.evaluate((words) => { const r = [...document.querySelectorAll('.web-reader-body a')].find((one) => one.textContent === words).getClientRects()[0]; return { x: r.left + Math.min(12, r.width / 2), y: r.top + r.height / 2 } }, DEEP)
  const top = await h.evaluate(() => document.querySelector('.web-reader-scroll').scrollTop)
  const under = await h.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.textContent?.slice(0, 40) ?? null, linkAt)
  await h.mouse.click(linkAt.x, linkAt.y)
  await until(async () => (await heading()) === 'Byzantine Empire', 15000)
  check('a link to another Wikipedia article is followed in the reader, in the same pane', (await heading()) === 'Byzantine Empire' && (await h.evaluate(() => document.querySelectorAll('.web-reader').length)) === 1 && site.asked.some((one) => one === '/en.wikipedia.org/wiki/Byzantine_Empire'), `${await heading()} (clicked on ${under})`)
  check('…and the browser is not opened', (await electron.evaluate(() => globalThis.__opened.length)) === 0, '')
  await h.keyboard.press('Meta+['); await until(async () => (await heading()) === 'Roman Empire')
  await wait(800)
  const back = await h.evaluate(() => document.querySelector('.web-reader-scroll').scrollTop)
  check('Back comes to the first article where you were', (await heading()) === 'Roman Empire' && top > 300 && Math.abs(back - top) < 60, `${await heading()} at ${back}, was ${top}`)
  await h.keyboard.press('Meta+]'); await until(async () => (await heading()) === 'Byzantine Empire')
  check('Forward goes to the followed article again', (await heading()) === 'Byzantine Empire', String(await heading()))
  await h.keyboard.press('Meta+['); await until(async () => (await heading()) === 'Roman Empire')
  await wait(800)

  // A link out of Wikipedia: the browser (a stand-in) on a click.
  await h.evaluate(() => { [...document.querySelectorAll('.web-reader-body a')].find((one) => one.textContent === 'a page elsewhere').scrollIntoView({ block: 'center' }) })
  await wait(400)
  // Its first line: the link wraps, and the middle of its whole box falls between its two lines.
  const outAt = await h.evaluate(() => { const r = [...document.querySelectorAll('.web-reader-body a')].find((one) => one.textContent === 'a page elsewhere').getClientRects()[0]; return { x: r.left + Math.min(12, r.width / 2), y: r.top + r.height / 2 } })
  const outUnder = await h.evaluate(({ x, y }) => { const one = document.elementFromPoint(x, y); return `${one?.tagName} ${one?.textContent?.slice(0, 30)} readers:${document.querySelectorAll('.web-reader').length} sel:${getSelection()?.isCollapsed}` }, outAt)
  await h.mouse.click(outAt.x, outAt.y); await wait(600)
  check('a link out of Wikipedia opens in the browser', (await electron.evaluate(() => globalThis.__opened)).includes('https://example.org/rome-elsewhere') && (await heading()) === 'Roman Empire', `${JSON.stringify(await electron.evaluate(() => globalThis.__opened))} (clicked on ${outUnder})`)
  await h.mouse.click(outAt.x, outAt.y, { button: 'right' }); await wait(500)
  const linkMenu = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))
  check('its right-click offers the reader, the reader to the side and the browser', ['Open in the reader', 'Open in the reader to the side', 'Open in the browser', 'Copy link'].every((one) => linkMenu.includes(one)), JSON.stringify(linkMenu))
  await h.screenshot({ path: `${shots}/w4-reader-link-menu.png` })
  await h.keyboard.press('Escape'); await wait(300)

  // A highlight kept as a gem: it cites the article, its section and the day it was read.
  await h.evaluate(() => {
    const p = [...document.querySelectorAll('.web-reader-body p')].find((one) => /long peace that lasted/.test(one.textContent))
    p.scrollIntoView({ block: 'center' })
    const text = p.firstChild
    const from = text.data.indexOf('a long peace')
    const range = document.createRange()
    range.setStart(text, from)
    range.setEnd(text, from + 'a long peace that lasted about two centuries'.length)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await wait(400)
  const pickAt = await h.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.click(pickAt.x, pickAt.y, { button: 'right' }); await wait(500)
  await h.click('[role="menuitem"]:has-text("Keep as a gem")'); await wait(900)
  const marks = await v('pdf:highlights', ROMAN)
  const gem = marks[0]?.gemId ? await v('item', marks[0].gemId) : null
  const gemBody = JSON.stringify(gem?.body ?? '')
  check('a highlight kept as a gem cites the article, its section and the day read', marks.length === 1 && /Roman Empire: Pax Romana, Wikipedia, read [^\]]*2026/.test(gemBody) && gemBody.includes(`haligtree://article?href=${encodeURIComponent(ROMAN)}`), gemBody.slice(0, 400))
  check("…its source the article, as the reader's other gems have it", gem?.medium === 'Roman Empire, Wikipedia' && gem?.kind === 'quote', JSON.stringify({ medium: gem?.medium, kind: gem?.kind }))
  if (gem) {
    await c.send('nugget', gem.id); await wait(1200)
    await c.both(`${shots}/w4-gem-citation`)
  }

  // Nothing in the reader's bar moves as a page comes: each tool stands where it stood while the page was read.
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), CARTHAGE)
  await until(() => h.evaluate(() => !!document.querySelector('.web-reader-reading')))
  const tools = () => h.evaluate(() => [...document.querySelectorAll('.web-reader .pdf-reader-tools button')].map((one) => `${one.getAttribute('aria-label')}@${Math.round(one.getBoundingClientRect().left)}`))
  const whileReading = await tools()
  await until(async () => (await heading()) === 'Carthage', 15000)
  await wait(400)
  const onceRead = await tools()
  check('nothing in the reader\'s bar moves as the page comes', whileReading.length > 4 && whileReading.join() === onceRead.join(), JSON.stringify({ whileReading, onceRead }))

  // Offline: one plain line, never an empty list; the kept article still opens.
  site.offline(true)
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('carthage', { delay: 30 }); await wait(700)
  await h.click('[data-look="wikipedia"][data-look-kind="line"]')
  await until(() => h.evaluate(() => !!document.querySelector('[data-look="wikipedia"][data-look-kind="said"]')))
  const offline = await h.evaluate(() => ({ said: [...document.querySelectorAll('[data-look="wikipedia"]')].map((one) => one.textContent), asking: !!document.querySelector('[data-look-asking]') }))
  // The site down with the Mac online: it did not answer ("offline" is said only when the Mac itself is: net.isOnline()).
  check('the site down, ⌘K says Wikipedia did not answer, in one plain line', offline.said.length === 1 && offline.said[0] === 'Wikipedia did not answer just now' && !offline.asking, JSON.stringify(offline))
  await c.both(`${shots}/w4-cmdk-offline`)
  await h.keyboard.press('Escape'); await wait(300)
  const before = site.asked.length
  await c.go('home'); await wait(500)
  check('(the reader is closed first)', (await heading()) === null, String(await heading()))
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), ROMAN)
  await until(async () => (await heading()) === 'Roman Empire')
  check('offline, a kept article still opens, asking nothing', (await heading()) === 'Roman Empire' && site.asked.length === before, `${await heading()} ${site.asked.slice(before).join()}`)
  site.offline(false)
  check('no page errors', c.errors.length === 0, c.errors.join(' | ').slice(0, 300))
} finally {
  await c.close()
  site.close()
}
done()
