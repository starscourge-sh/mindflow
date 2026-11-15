// Wikipedia searched and read inside Haligtree (part B; qa/wiki-reader.mjs is part A).
// "Open in the reader to the side" wherever "Open in the reader" is: a web link's
// right-click in a note, ⌥-click on it (its hover box says so), the link card's
// Block menu and its book button (⌥-click), ⌘K's answer and a typed address (⌥↵).
// Each opens the reader in a pane beside the note, and a link followed in that
// reader steps in its own pane, Back returning there while the note stays. Then
// Wiktionary, Project Gutenberg and the Stanford Encyclopedia of Philosophy, each
// searched from its own line only when picked, and "w " and words searching
// Wikipedia alone. Wikipedia is a stand-in (qa/wiki-stand-in.mjs).
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/wiki-beside.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { standIn, ROMAN, BYZANTINE } from './wiki-stand-in.mjs'
process.env.QA_ARGS ??= '--sandbox'
const site = await standIn()
process.env.HALIGTREE_QA_SITES = site.base

const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const until = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await test()) return true; return false }
const LEAD = 'Read about the'
// What the window shows: how many panes, the article read, and which pane holds the reader and which the note.
const shows = () => h.evaluate((lead) => {
  const panes = [...document.querySelectorAll('[data-pane]')]
  return {
    panes: panes.length,
    reader: document.querySelector('.web-reader-heading')?.textContent ?? null,
    readerPane: panes.findIndex((one) => one.querySelector('.web-reader')),
    notePane: panes.findIndex((one) => [...one.querySelectorAll('.ProseMirror')].some((each) => each.textContent.includes(lead)))
  }
}, LEAD)
const beside = (s, title) => s.panes === 2 && s.reader === title && s.notePane >= 0 && s.readerPane === s.notePane + 1
const start = async () => {
  for (let i = 0; i < 3 && (await shows()).panes > 1; i++) { await h.keyboard.press('Control+w'); await wait(400) }
  await c.send('article', note); await wait(1400)
}
// The first line of what is pointed at: a link that wraps has nothing of itself at the middle of its whole box.
const rectOf = (selector) => h.evaluate((selector) => { const r = document.querySelector(selector).getClientRects()[0]; return { x: r.left + Math.min(12, r.width / 2), y: r.top + r.height / 2 } }, selector)
const LINK = `.ProseMirror a[href="${BYZANTINE}"]`

await electron.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (url) => void globalThis.__opened.push(url) })
await v('settings:set', { sounds: false, hintRate: 0, motion: false })
const note = await v('article:new')
try {
  await v('item:save', note, { title: 'Reading list', body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: `${LEAD} ` }, { type: 'text', text: 'Byzantine Empire', marks: [{ type: 'link', attrs: { href: BYZANTINE } }] }, { type: 'text', text: ' next, and the empire before it.' }] },
    { type: 'bookmark', attrs: { href: ROMAN, title: 'Roman Empire', site: 'Wikipedia' } },
    { type: 'paragraph' }
  ] } })

  // 1. A web link's right-click in the note.
  await start()
  let at = await rectOf(LINK)
  await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(500)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))
  check('a web link\'s right-click offers "Open in the reader to the side" under "Open in the reader"', rows.indexOf('Open in the reader to the side') === rows.indexOf('Open in the reader') + 1, JSON.stringify(rows))
  await h.screenshot({ path: `${shots}/w4-link-menu.png` })
  await h.click('[role="menuitem"]:has-text("Open in the reader to the side")')
  await until(async () => (await shows()).reader === 'Byzantine Empire', 15000)
  let s = await shows()
  check('…which opens the reader beside the note', beside(s, 'Byzantine Empire'), JSON.stringify(s))
  await c.both(`${shots}/w4-beside-note`)

  // The reader's own pane: a link followed there steps in it, Back returns there, and the note stays as it was.
  const roman = await rectOf('.web-reader-body a[href$="/wiki/Roman_Empire"]')
  await h.mouse.click(roman.x, roman.y)
  await until(async () => (await shows()).reader === 'Roman Empire', 15000)
  s = await shows()
  check('a link followed in the reader beside the note steps in its own pane', beside(s, 'Roman Empire'), JSON.stringify(s))
  await h.keyboard.press('Meta+['); await until(async () => (await shows()).reader === 'Byzantine Empire')
  s = await shows()
  check('…and Back there returns to the first article, the note still beside it', beside(s, 'Byzantine Empire'), JSON.stringify(s))

  // 2. ⌥-click on the link, as its hover box now says.
  await start()
  at = await rectOf(LINK)
  await h.mouse.move(4, 4); await wait(200)
  await h.mouse.move(at.x, at.y, { steps: 3 }); await wait(600)
  const how = await h.evaluate(() => document.querySelector('.tiptap-link-preview-how')?.textContent ?? null)
  check('the link\'s hover box says ⌥-click opens it in the reader to the side', how === 'Click to open in your browser, ⌥-click to open in the reader to the side', String(how))
  await h.keyboard.down('Alt'); await h.mouse.click(at.x, at.y); await h.keyboard.up('Alt')
  await until(async () => (await shows()).reader === 'Byzantine Empire', 15000)
  check('⌥-click on the link opens the reader beside the note', beside(await shows(), 'Byzantine Empire'), JSON.stringify(await shows()))

  // 3. The link card's Block menu.
  await start()
  const card = await rectOf('[data-pane] .tiptap-bookmark')
  await h.mouse.click(card.x + 40, card.y, { button: 'right' }); await wait(600)
  const block = await h.evaluate(() => [...document.querySelectorAll('.tiptap-block-menu[data-state="open"] button')].map((one) => one.textContent.trim()))
  check('the link card\'s Block menu offers "Open in the reader to the side" after "Open in the reader"', block.indexOf('Open in the reader to the side') === block.indexOf('Open in the reader') + 1 && block.includes('Open in the browser'), JSON.stringify(block))
  await h.screenshot({ path: `${shots}/w4-block-menu.png` })
  await h.click('.tiptap-block-menu[data-state="open"] button:has-text("Open in the reader to the side")')
  await until(async () => (await shows()).reader === 'Roman Empire', 15000)
  check('…which opens the card\'s page in the reader beside the note', beside(await shows(), 'Roman Empire'), JSON.stringify(await shows()))

  // 4. The card's book button: its tip names ⌥-click, and ⌥-click opens it beside.
  await start()
  await h.hover('[data-pane] .tiptap-bookmark'); await wait(400)
  const book = '[data-pane] .tiptap-bookmark button[aria-label="Open in the reader"]'
  check('the card\'s book button says ⌥-click opens it to the side', (await h.evaluate((sel) => document.querySelector(sel)?.getAttribute('title'), book)) === 'Open in the reader. ⌥-click opens it to the side', String(await h.evaluate((sel) => document.querySelector(sel)?.getAttribute('title'), book)))
  at = await rectOf(book)
  await h.keyboard.down('Alt'); await h.mouse.click(at.x, at.y); await h.keyboard.up('Alt')
  await until(async () => (await shows()).reader === 'Roman Empire', 15000)
  check('⌥-click on the card\'s book opens the reader beside the note', beside(await shows(), 'Roman Empire'), JSON.stringify(await shows()))

  // 5. ⌘K: a Wikipedia answer with ⌥↵.
  await start()
  await h.click(`.ProseMirror p:has-text("${LEAD}")`); await wait(200)
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('byzantine', { delay: 30 }); await wait(700)
  await h.click('[data-look="wikipedia"][data-look-kind="line"]')
  await until(() => h.evaluate(() => document.querySelectorAll('[data-look-kind="hit"]').length > 0))
  const foot = await h.evaluate(() => [...document.querySelectorAll('[role="dialog"] kbd')].map((one) => one.textContent).join(' '))
  check('⌘K on an answer says ⌥↵ opens it to the side', /⌥↵/.test(foot), foot)
  await h.keyboard.press('Alt+Enter')
  await until(async () => (await shows()).reader === 'Roman Empire', 15000)
  check('⌥↵ on a Wikipedia answer in ⌘K opens it beside the note', beside(await shows(), 'Roman Empire'), JSON.stringify(await shows()))

  // 6. ⌘K: an address typed, "Open in the reader" with ⌥↵.
  await start()
  await h.click(`.ProseMirror p:has-text("${LEAD}")`); await wait(200)
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type(BYZANTINE, { delay: 5 }); await wait(700)
  await h.keyboard.press('Alt+Enter')
  await until(async () => (await shows()).reader === 'Byzantine Empire', 15000)
  check('⌥↵ on a typed address\'s "Open in the reader" opens it beside the note', beside(await shows(), 'Byzantine Empire'), JSON.stringify(await shows()))
  await start()

  // The other free sites: each its own line, asked only when picked, its answers listed.
  for (const [words, id, title, line] of [['serendipity', 'wiktionary', 'serendipity', 'A combination of events which have come about by chance'], ['frankenstein', 'gutenberg', 'Frankenstein; or, The modern Prometheus', 'Mary Wollstonecraft Shelley'], ['kant', 'sep', 'Immanuel Kant', 'Michael Rohlf']]) {
    const before = site.asked.length
    await h.keyboard.press('Meta+k'); await wait(500)
    await h.keyboard.type(words, { delay: 30 }); await wait(700)
    const quiet = site.asked.length === before
    await h.click(`[data-look="${id}"][data-look-kind="line"]`)
    await until(() => h.evaluate((id) => document.querySelectorAll(`[data-look="${id}"][data-look-kind="hit"]`).length > 0, id))
    const got = await h.evaluate((id) => [...document.querySelectorAll(`[data-look="${id}"][data-look-kind="hit"]`)].map((one) => [one.querySelector('[data-look-title]')?.textContent, one.querySelector('[data-look-line]')?.textContent]), id)
    check(`${id}: searched only when its line is picked, its answer listed with its line`, quiet && site.asked.length === before + 1 && got[0]?.[0] === title && got[0]?.[1]?.startsWith(line), JSON.stringify({ quiet, asked: site.asked.slice(before), got }))
    if (id === 'gutenberg') await c.both(`${shots}/w4-cmdk-gutenberg`)
    await h.keyboard.press('Escape'); await wait(300)
  }

  // "w " and words: Wikipedia alone, its line the one row, lit, and ↵ asks it.
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('w byzantine', { delay: 30 }); await wait(800)
  const alone = await h.evaluate(() => ({ rows: document.querySelectorAll('[role="dialog"] [data-row]').length, looks: [...document.querySelectorAll('[data-look]')].map((one) => one.getAttribute('data-look') + ':' + one.getAttribute('data-look-kind')), lit: document.querySelector('[data-search-at]')?.textContent ?? null }))
  check('"w " and words: Wikipedia\'s line alone, lit, none of your own results', alone.rows === 0 && alone.looks.join() === 'wikipedia:line' && alone.lit === 'Search Wikipedia for “byzantine”', JSON.stringify(alone))
  await c.both(`${shots}/w4-cmdk-prefix`)
  const before = site.asked.length
  await h.keyboard.press('Enter')
  await until(() => h.evaluate(() => document.querySelectorAll('[data-look-kind="hit"]').length > 0))
  // Its search once; a free answer's picture is fetched with it.
  const searched = site.asked.slice(before).filter((one) => one.includes('/search/page'))
  check('…and ↵ asks Wikipedia for the words after it', searched.length === 1 && new URL(searched[0], 'http://x').searchParams.get('q') === 'byzantine', JSON.stringify(site.asked.slice(before)))
  await h.keyboard.press('Escape'); await wait(300)
  check('no page errors', c.errors.length === 0, c.errors.join(' | ').slice(0, 300))
} finally {
  await c.close()
  site.close()
}
done()
