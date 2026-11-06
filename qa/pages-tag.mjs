// A tag's own page, read as a person who opened #programming-humour: the name once, on one line (never broken at
// its hyphen, never printed on the cover too); no colour icon floating by the title; the modes as one control in the
// bar; every action named and in one home (Read through, Study, ⋯); one toolbar row whose right edge is the rows';
// each note's own words in the stream (clean text, no Markdown), and beside it only what differs from the rest.
// Then 1,000 notes, a tag with nothing left, a phone's width and the window's own minimum (560), light and dark.
//
//   npx electron-vite build --outDir out-x
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/pages-tag.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const { h, electron, send, size, both, close, errors } = await sandbox({ width: 1280, height: 860 })
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = (...lines) => ({ type: 'doc', content: lines.map(para) })
const make = (body, kind = 'note') => h.evaluate((p) => window.api.captures.create(p), { kind, body })
const open = async (tag) => { await send('tag', tag); await wait(1500) }

// What the open tag's page shows, measured.
const page = () => h.evaluate(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) } }
  const header = [...document.querySelectorAll('header[data-collection-header]')].find((one) => one.offsetParent)
  const h1 = header?.querySelector('h1')
  const title = h1?.querySelector('[data-tag-title] > span') ?? h1
  const bar = [...document.querySelectorAll('section > header')].find((one) => one.offsetParent && one.closest('section')?.contains(header))
  const toolbar = document.querySelector('[data-tag-toolbar]')
  const entries = [...document.querySelectorAll('[data-tag-stream] article, [data-tag-islands] article')]
  return {
    coverText: header?.querySelector('[data-cover-name]')?.textContent ?? '',
    titleText: title?.textContent ?? '',
    titleLines: title ? Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight || getComputedStyle(title).fontSize)) : 0,
    titleCut: title ? title.scrollWidth > title.clientWidth + 1 : true,
    iconInTitle: !!h1?.querySelector('[data-tag-colour], svg'),
    // A chip draws its word letter by letter, twice over: its name is its aria-label.
    barButtons: bar ? [...bar.querySelectorAll('button')].filter((one) => one.offsetParent).map((one) => one.getAttribute('aria-label') || one.textContent.trim()) : [],
    actions: header ? [...header.querySelectorAll('button')].filter((one) => one.offsetParent && !one.closest('h1')).map((one) => ({ name: one.textContent.trim() || one.getAttribute('aria-label') || '', top: Math.round(one.getBoundingClientRect().top), primary: getComputedStyle(one).backgroundColor !== 'rgba(0, 0, 0, 0)' })) : [],
    toolbar: box(toolbar),
    toolbarHolds: toolbar ? { view: !!toolbar.querySelector('[aria-pressed]'), display: !!toolbar.querySelector('button') } : null,
    toolbarLast: box(toolbar ? [...toolbar.querySelectorAll('button, input')].filter((one) => one.offsetParent).pop() : null),
    entry: box(entries[0]),
    entries: entries.length,
    words: entries.slice(0, 12).map((one) => one.querySelector('[data-entry-words]')?.textContent ?? ''),
    asides: entries.slice(0, 12).map((one) => one.querySelector('[data-entry-aside]')?.textContent ?? ''),
    pictures: [...document.querySelectorAll('[data-entry-picture]')].map((one) => box(one)),
    // The page's own column: at 390 the window's title bar runs past the edge (its own matter, named in the report).
    overflow: (() => { const page = header?.closest('section'); return page ? page.scrollWidth - page.clientWidth : 0 })(),
    sideways: [...document.querySelectorAll('[data-collection-header], [data-tag-toolbar], [data-tag-stream]')].some((one) => one.scrollWidth > one.clientWidth + 1)
  }
})

try {
  // #programming-humour: 30 jokes, each also #bit #career as in the user's screenshot, a few with more of their own words.
  for (let k = 0; k < 30; k++) {
    await make(k % 3 === 0
      ? doc(`Joke ${k}: there are 10 kinds of people, those who read binary and those who do not.`, 'And a second line of the joke, to read on.', '#programming-humour #bit #career')
      : doc(`Joke ${k}: a SQL query walks into a bar and asks two tables, can I join you? #programming-humour #career`))
  }
  // Markdown kept as text (an import): its marks never show in the stream.
  await make('# Markdown heading\n**Bold words** and a [link](https://example.com) #programming-humour #career')
  await open('programming-humour')
  // The first screenful comes in a few at a time: wait for it.
  await h.waitForFunction(() => document.querySelectorAll('[data-tag-stream] article').length >= 10, null, { timeout: 5000 }).catch(() => {})
  const a = await page()
  console.log(JSON.stringify({ ...a, words: a.words.slice(0, 3), asides: a.asides.slice(0, 3) }))
  check('the cover never says the tag\'s name again', !/programming/i.test(a.coverText), JSON.stringify(a.coverText))
  check('the name is in the title once', a.titleText === '#programming-humour', a.titleText)
  check('the long name sits on one line, whole (not cut, not broken at the hyphen)', a.titleLines === 1 && !a.titleCut, `${a.titleLines} lines, cut ${a.titleCut}`)
  check('no colour icon floats beside the title', !a.iconInTitle)
  check('the bar holds no separate Blurt, Study or Practise buttons', !a.barButtons.some((one) => /^(Blurt|Study|Practise)$/.test(one)), JSON.stringify(a.barButtons))
  check('the bar\'s modes are one control (Read, Manage)', a.barButtons.includes('Read') && a.barButtons.includes('Manage'), JSON.stringify(a.barButtons))
  check('every action in the band has a name a newcomer reads', a.actions.length >= 3 && a.actions.every((one) => one.name.length > 2), JSON.stringify(a.actions))
  check('one primary button only', a.actions.filter((one) => one.primary).length === 1, JSON.stringify(a.actions.filter((one) => one.primary)))
  check('Stream or List sits in the one toolbar row, not in the band', !a.actions.some((one) => /^(Stream|List)$/.test(one.name)) && a.toolbarHolds?.view, JSON.stringify(a.toolbarHolds))
  // A row's light reaches 8px past its words on each side (-mx-2): the words' edge is the one to line up with.
  check('the toolbar\'s right edge is the rows\' right edge', a.toolbarLast && a.entry && Math.abs(a.toolbarLast.right - (a.entry.right - 8)) <= 4, `toolbar ${a.toolbarLast?.right}, words ${a.entry && a.entry.right - 8}`)
  check('each note shows its own words, not only a title', a.words.length >= 10 && a.words.every((one) => one.length > 10), JSON.stringify(a.words.filter((one) => one.length <= 10)))
  check('no tags trail a note\'s words (its filing, said by the page)', a.words.every((one) => !/#\S+\s*$/.test(one)), JSON.stringify(a.words.filter((one) => /#\S+\s*$/.test(one)).slice(0, 2)))
  check('no Markdown marks in the words', a.words.every((one) => !/\*\*|\]\(|^#\s/.test(one)), JSON.stringify(a.words.filter((one) => /\*\*|\]\(/.test(one))))
  check('no line of only tags in the words', a.words.every((one) => !/^(#[^\s#]+\s*)+$/m.test(one)))
  check('a tag every note shares (#career) is never repeated on a row', a.asides.every((one) => !one.includes('#career')), JSON.stringify(a.asides.slice(0, 4)))
  check('one kind only: no row says its kind', a.asides.every((one) => !/^Note|Gem/.test(one)), JSON.stringify(a.asides.slice(0, 4)))
  check('no sideways scroll', a.overflow <= 0 && !a.sideways, String(a.overflow))
  if (shots) await both(`${shots}/tag-1280`)

  // Every action reachable from exactly one control: Study's three ways, and the ⋯ menu's lines.
  await h.locator('[data-study-menu]').click()
  await wait(300)
  const study = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))
  check('Study holds Review, Practise and Blurt, each saying what it does', study.length === 3 && /Review/.test(study[0]) && /Practise/.test(study[1]) && /Blurt/.test(study[2]), JSON.stringify(study))
  if (shots) await h.screenshot({ path: `${shots}/tag-study-menu.png` })
  await h.keyboard.press('Escape')
  await wait(200)
  await h.locator('[data-tag-more]').click()
  await wait(300)
  const more = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))
  check('⋯ holds rename, colour, backdrop, a deck, Home and copy, every line named', ['Rename', 'Colour', 'Backdrop', 'deck', 'Home', 'Copy'].every((word) => more.some((one) => one.includes(word))), JSON.stringify(more))
  if (shots) await h.screenshot({ path: `${shots}/tag-more-menu.png` })
  // One home: no line of ⋯ is also a button of its own on the page.
  const named = (await page()).actions.map((one) => one.name)
  check('nothing in ⋯ is also a button on the page', !more.some((line) => named.some((one) => one && line.startsWith(one))), JSON.stringify(named))
  await h.keyboard.press('Escape')
  await wait(200)
  // Blurt from the menu takes the page; Read in the bar brings the stream back.
  await h.locator('[data-study-menu]').click()
  await wait(250)
  await h.locator('[data-blurt-open]').click()
  await wait(600)
  const blurting = await h.evaluate(() => !document.querySelector('[data-tag-stream]'))
  if (shots) await h.screenshot({ path: `${shots}/tag-blurt.png` })
  await h.locator('[data-list-tabs] button[aria-label="Read"]').click({ timeout: 5000 })
  await wait(900)
  const back = await h.evaluate(() => !!document.querySelector('[data-tag-stream]'))
  check('Study › Blurt takes the page, and Read brings the stream back', blurting && back, `${blurting} ${back}`)

  // At 1600 wide: the same, still one line.
  await size(1600, 1000)
  await wait(700)
  const wide = await page()
  check('1600: the name on one line, whole', wide.titleLines === 1 && !wide.titleCut)
  if (shots) await both(`${shots}/tag-1600`)

  // The window's own minimum is 560: the page fits it. A phone's 390 too, when the probe lets the window go that small.
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.setMinimumSize(1, 1))
  for (const w of [560, 390]) {
    await size(w, 844)
    await wait(900)
    const small = await page()
    check(`${w}: no sideways scroll, the name on one line`, small.overflow <= 0 && !small.sideways && small.titleLines === 1, `${small.overflow} ${small.titleLines} ${small.titleCut}`)
    // At the window's own minimum the name is whole; on a phone's 390 a name this long ends in … and is whole in its tip.
    if (w === 560) check('560: the long name whole', !small.titleCut)
    check(`${w}: Read through, Study and ⋯ on one line`, new Set(small.actions.filter((one) => /Read through|Study|More/.test(one.name)).map((one) => one.top)).size === 1, JSON.stringify(small.actions.map((one) => one.top)))
    check(`${w}: Read through, Study and ⋯ all reachable`, small.actions.filter((one) => /Read through|Study|More/.test(one.name)).length >= 3, JSON.stringify(small.actions.map((one) => one.name)))
    if (shots) await both(`${shots}/tag-${w}`)
  }
  await size(1280, 860)

  // 1,000 notes under one tag: the page comes, a screenful drawn, never all of them.
  await h.evaluate(async () => { for (let k = 0; k < 1000; k++) await window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Thought ${k} on a long subject, worded so it reads as a line or two. #stoicism` }] }] } }) })
  const t0 = Date.now()
  await open('stoicism')
  const big = await page()
  check('1,000 notes: the page shows, a screenful of entries, not all 1,000', big.entries > 0 && big.entries < 200, `${big.entries} entries drawn in ${Date.now() - t0}ms`)
  if (shots) await both(`${shots}/tag-1000`)

  // Nothing left under a tag: its page says so plainly.
  const lone = await h.evaluate((p) => window.api.captures.create(p), { kind: 'note', body: doc('Only one #lonely') })
  await open('lonely')
  await h.evaluate((id) => window.api.captures.update?.(id, { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No tag now' }] }] } }), lone?.id ?? lone)
  await wait(1200)
  if (shots) await both(`${shots}/tag-empty`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
