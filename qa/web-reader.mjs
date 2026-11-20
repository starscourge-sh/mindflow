// A web page in the reader: a link card's "Open in the reader" keeps the page
// as an article (words, byline, site, its picture kept here) and opens it in a
// pane in the note's reading type; picked words become a gem whose link comes
// back with them lit; ⌘K finds the article; offline it still reads; a page
// Readability cannot read says why, never a blank pane. The site is faked in
// the main process's fetch at an address on the internet, so fetchOutside's
// guard still runs, as in qa/card-pictures.mjs.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-web/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/web-reader.mjs
import { deflateSync, crc32 } from 'node:zlib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { copiedText } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'

const png = (r, g, b, w = 64, h = 36) => {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(8 + data.length + 4)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), 8 + data.length)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2
  const rows = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())])))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}
const SITE = 'https://93.184.216.34'
const para = (n) => `<p>Paragraph ${n} of the probe article walks slowly through the garden, noting each tree and the light that falls between the leaves, so a reader has enough words here to call this an article and not a scrap.</p>`
const pages = {
  '/article': `<html><head><title>The Garden Essay | Probe Times</title><meta property="og:site_name" content="Probe Times"><meta property="article:published_time" content="2026-09-14T08:00:00Z"></head><body>
    <nav><a href="/">Home</a> <a href="/about">About</a></nav>
    <article><h1>The Garden Essay</h1><p class="byline">By Ada Probe</p>
    ${para(1)}<p>A quiet sentence worth keeping sits here, in the middle of the essay.</p>${para(2)}<img src="/pic.png" alt="A garden">${para(3)}<img src="/missing.png" alt="The old gate">${para(4)}<script>alert(1)</script></article>
    <footer>Subscribe to our newsletter</footer></body></html>`,
  '/second': `<html><head><title>A Second Essay</title><meta property="og:site_name" content="Probe Times"></head><body><article><h1>A Second Essay</h1>${para(5)}${para(6)}${para(7)}</article></body></html>`,
  '/paid': `<html><head><title>Members only</title><script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false}</script></head><body><article><h1>Members only</h1><p>Subscribe to read the rest.</p></article></body></html>`,
  '/login': `<html><head><title>Sign in</title></head><body><form><input name="user"><input type="password" name="pw"><button>Sign in</button></form></body></html>`,
  '/app': `<html><head><title>App</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`
}

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const errors = []
h.on('pageerror', (e) => errors.push(String(e)))
const net = (patch) => electron.evaluate((_, p) => Object.assign(globalThis.__webNet, p), patch)
/** How many words each open reader has drawn as highlights (its own names, from its own style), in pane order. */
const drawnIn = (kind = 'mark') => h.evaluate((kind) => [...document.querySelectorAll('.web-reader')].map((reader) => {
  const name = /::highlight\((web\w+)-mark\)/.exec(reader.querySelector('style')?.textContent ?? '')?.[1]
  return name ? (CSS.highlights.get(`${name}-${kind}`)?.size ?? 0) : -1
}), kind)
const open = (href) => h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), href)
try {
  await electron.evaluate((_, [site, pages, pic]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.__webNet = { blocked: false, hits: 0 }
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      globalThis.__webNet.hits += 1
      if (globalThis.__webNet.blocked) throw new TypeError('fetch failed: offline')
      const path = new URL(url).pathname
      if (pages[path]) return new Response(pages[path], { headers: { 'content-type': 'text/html; charset=utf-8' } })
      // A site's guard against robots, as Cloudflare answers a fetch it will not let through.
      if (path === '/guarded') return new Response('<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>', { status: 403, headers: { 'content-type': 'text/html; charset=UTF-8' } })
      if (path === '/pic.png') return new Response(Buffer.from(pic, 'base64'), { headers: { 'content-type': 'image/png' } })
      return new Response('', { status: 404 })
    }
  // The garden at a photograph's size: one an icon's size alone between paragraphs is dropped (article-clean.ts).
  }, [SITE, pages, png(60, 140, 60, 640, 360)])
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })

  // A note holding a link card to the article, and words of its own to compare the reading type with.
  const note = await v('article:new')
  await v('item:save', note, { title: 'Reading list', body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'A paragraph of the note itself, in the note pane, to set beside the reader.' }] },
    { type: 'bookmark', attrs: { href: `${SITE}/article`, title: 'The Garden Essay', site: 'Probe Times' } },
    { type: 'paragraph' }
  ] } })
  await c.send('article', note); await wait(1400)
  const noteType = await h.evaluate(() => {
    const p = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain) p')
    const s = p && getComputedStyle(p)
    return s ? { family: s.fontFamily, size: s.fontSize } : null
  })
  await c.both(`${shots}/web-note-pane`)
  const button = '.tiptap-bookmark button[aria-label="Open in the reader"]'
  // The card's buttons are drawn once the pointer first comes over it (bookmark-node-view.ts).
  await h.hover('[data-open] .tiptap-bookmark'); await wait(300)
  check('a link card offers "Open in the reader"', await h.evaluate((sel) => !!document.querySelector(sel), button), '')
  await h.click(button)
  await h.waitForSelector('.web-reader-body p', { timeout: 15000 }).catch(() => {})
  // The words come first; its pictures settle after them (qa/reader-fandom.mjs).
  await h.waitForFunction(() => !document.querySelector('.web-reader-body img[data-wait], [data-web-coming]'), null, { timeout: 15000 }).catch(() => {})
  await wait(400)
  const shown = await h.evaluate(() => {
    const body = document.querySelector('.web-reader-body')
    const p = body?.querySelector('p')
    const s = p && getComputedStyle(p)
    return {
      bar: document.querySelector('.web-reader .pdf-reader-title')?.textContent,
      heading: document.querySelector('.web-reader-heading')?.textContent,
      // The page's head: the site over the title, the byline under it.
      meta: [...document.querySelectorAll('.web-reader-kicker, .web-reader-meta')].map((one) => one.textContent).join(' · '),
      words: body?.textContent ?? '',
      img: body?.querySelector('img')?.getAttribute('src') ?? '',
      imgs: body?.querySelectorAll('img').length,
      missing: [...(body?.querySelectorAll('a') ?? [])].map((one) => [one.textContent, one.getAttribute('href')]).find(([words]) => /old gate/.test(words)),
      scripts: body?.querySelectorAll('script, nav, footer').length ?? -1,
      family: s?.fontFamily,
      tools: [...document.querySelectorAll('.web-reader .pdf-reader-tools button')].map((one) => one.getAttribute('aria-label'))
    }
  })
  check('the article opens in its own pane under its title', shown.bar === 'The Garden Essay' && shown.heading === 'The Garden Essay', JSON.stringify(shown).slice(0, 300))
  check('with its byline, site and date', /Ada Probe/.test(shown.meta ?? '') && /Probe Times/.test(shown.meta ?? '') && /2026/.test(shown.meta ?? ''), shown.meta)
  check('its words are there, the menus and footer gone', /quiet sentence worth keeping/.test(shown.words) && !/Subscribe|About/.test(shown.words) && shown.scripts === 0, shown.words.slice(0, 120))
  check('its picture is kept with the notes', /^haligtree:\/\/assets\/[a-f0-9]{64}\.png$/.test(shown.img), shown.img)
  check('a picture the site would not send stays a link to it there, saying so', shown.imgs === 1 && shown.missing?.[1] === `${SITE}/missing.png` && shown.missing?.[0] === 'Picture the site would not send: The old gate', JSON.stringify([shown.imgs, shown.missing]))
  check("in the note's reading type", noteType && shown.family === noteType.family, `${shown.family} vs ${noteType?.family}`)
  // The page is the theme's (qa/reader-theme.mjs): no paper of its own, as a note has none.
  check('the top bar has find and size, and no paper pages of its own', ['Find', 'Smaller', 'Larger'].every((one) => shown.tools.includes(one)) && !shown.tools.some((one) => one === 'Paper pages' || one === 'White pages'), JSON.stringify(shown.tools))
  await h.screenshot({ path: `${shots}/web-reader.png` })

  // ⌘+ grows the words; ⌘0 puts them back.
  const sizeOf = () => h.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.web-reader-body p')).fontSize))
  const was = await sizeOf()
  await h.click('.web-reader button[aria-label="Larger"]'); await wait(200)
  const grown = await sizeOf()
  await h.click('.web-reader button[aria-label="Usual size"]'); await wait(200)
  check('Larger grows the words, the usual size puts them back', grown > was && (await sizeOf()) === was, `${was} ${grown}`)

  // ⌘F finds words in the article.
  await h.click('.web-reader-body p'); await h.keyboard.press('Meta+f'); await wait(300)
  await h.keyboard.type('garden'); await wait(300)
  const count = await h.evaluate(() => document.querySelector('.web-reader .tiptap-find-bar-count')?.getAttribute('aria-label'))
  check('⌘F finds every "garden" in it', /^1 of [4-9]/.test(count ?? ''), count)
  await h.keyboard.press('Escape'); await wait(200)
  // "/" finds as ⌘F does, and back in the article n and N step through what it found, as Vim's keys do in a note (the
  // user, 15 Nov 2026: "why doesnt '/' work for looking up on reader mode e.g '/faust'").
  const findAt = () => h.evaluate(() => document.querySelector('.web-reader .tiptap-find-bar-count')?.getAttribute('aria-label') ?? '')
  await h.click('.web-reader-body p'); await h.keyboard.press('/'); await wait(300)
  check('"/" opens find, ready to type in', await h.evaluate(() => !!document.activeElement?.closest('.web-reader') && document.activeElement?.tagName === 'INPUT'))
  await h.keyboard.type('garden'); await wait(300)
  const slashAt = await findAt()
  await h.click('.web-reader-body p'); await wait(150)
  await h.keyboard.press('n'); await wait(200)
  const nAt = await findAt()
  await h.keyboard.press('Shift+N'); await wait(200)
  check('n steps to the next match from the article, N back', /^1 of [4-9]/.test(slashAt) && /^2 of/.test(nAt) && /^1 of/.test(await findAt()), `${slashAt} → ${nAt} → ${await findAt()}`)
  await h.click('.web-reader button[aria-label="Close find"]'); await wait(200)

  await h.evaluate(() => (window.__firstWords = document.querySelector('.web-reader-body p')?.firstChild))
  // Picked words offer Keep; Keep makes a gem with the quote, "Article title, Site", and a link back.
  await h.evaluate(() => {
    const p = [...document.querySelectorAll('.web-reader-body p')].find((one) => /quiet sentence/.test(one.textContent))
    const text = p.firstChild
    const range = document.createRange()
    range.setStart(text, 2)
    range.setEnd(text, 'A quiet sentence worth keeping'.length)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await wait(400)
  check('picking words shows no bar over the article', await h.evaluate(() => !document.querySelector('.web-reader .pdf-keep-bar')), '')
  const keepAt = await h.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.click(keepAt.x, keepAt.y, { button: 'right' }); await wait(500)
  check('picked words offer Keep as a gem on right-click', await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].some((one) => one.textContent.trim().startsWith('Keep as a gem'))), '')
  await h.screenshot({ path: `${shots}/web-keep.png` })
  await h.click('[role="menuitem"]:has-text("Keep as a gem")'); await wait(900)
  const marks = await v('pdf:highlights', `${SITE}/article`)
  check('Keep saves a highlight with the words around it', marks.length === 1 && marks[0].quote === 'quiet sentence worth keeping' && marks[0].prefix.endsWith('A ') && marks[0].suffix.startsWith(' sits'), JSON.stringify(marks))
  const gem = marks[0]?.gemId ? await v('item', marks[0].gemId) : null
  const body = JSON.stringify(gem?.body ?? '')
  check('the gem holds the quote', /quiet sentence worth keeping/.test(body), body.slice(0, 200))
  // The article is the gem's source and its byline who said it; it is a quote.
  check('its source is "Article title, Site", by its author', gem?.medium === 'The Garden Essay, Probe Times' && gem?.attribution === 'Ada Probe' && gem?.kind === 'quote', JSON.stringify({ medium: gem?.medium, attribution: gem?.attribution, kind: gem?.kind }))
  check('it links back to the article and mark', body.includes(`haligtree://article?href=${encodeURIComponent(`${SITE}/article`)}&mark=${marks[0]?.id}`), body.slice(0, 400))
  check('the highlight is drawn', (await drawnIn()).join() === '1', JSON.stringify(await drawnIn()))
  check('Keep left the words as they were drawn (nothing rebuilt them)', await h.evaluate(() => window.__firstWords === document.querySelector('.web-reader-body p')?.firstChild), '')
  await c.both(`${shots}/web-mark`)

  // Right-click on it: open its gem, or remove the highlight.
  const at = await h.evaluate(() => {
    const name = /::highlight\((web\w+)-mark\)/.exec(document.querySelector('.web-reader style').textContent)[1]
    const r = [...CSS.highlights.get(`${name}-mark`)][0].getClientRects()[0]
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(500)
  const menu = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))
  check('right-click on the highlight offers its gem and removing it', menu.includes('In a gem: Open') && menu.includes('Remove highlight'), JSON.stringify(menu))
  await h.keyboard.press('Escape'); await wait(300)

  // A colour on the bar highlights without a gem, drawn in that colour; its menu offers "Keep as a gem" and its colours.
  const pickSits = () => h.evaluate(() => {
    const text = [...document.querySelectorAll('.web-reader-body p')].find((one) => /quiet sentence/.test(one.textContent)).firstChild
    const from = text.data.indexOf('sits here')
    const range = document.createRange()
    range.setStart(text, from)
    range.setEnd(text, from + 'sits here'.length)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await pickSits(); await wait(400)
  const sitsAt = await h.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.click(sitsAt.x, sitsAt.y, { button: 'right' }); await wait(500)
  const webBar = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] :is([role="menuitem"], [role="menuitemradio"])')].map((one) => one.getAttribute('aria-label') || one.textContent.trim()))
  check('the menu offers Highlight, its colours, Keep and Copy with citation', ['Highlight', 'Blue', 'Keep as a gem', 'Copy with citation'].every((one) => webBar.some((row) => row.startsWith(one))), JSON.stringify(webBar))
  await h.screenshot({ path: `${shots}/web-read-bar.png` })
  await h.keyboard.press('Escape'); await wait(300)
  await h.keyboard.press('Meta+Shift+c'); await wait(400)
  const webCopied = await copiedText(electron)
  check('⇧⌘C copies the words with the author and article', webCopied === '“sits here” (Ada Probe, The Garden Essay, Probe Times)', webCopied)
  await pickSits(); await wait(400)
  // 4 highlights in the fourth colour, blue.
  await h.keyboard.press('4'); await wait(700)
  let webMarks = await v('pdf:highlights', `${SITE}/article`)
  const blue = webMarks.find((one) => one.quote === 'sits here')
  check('a colour highlights the words without a gem', blue?.color === 'blue' && !blue.gemId, JSON.stringify(webMarks))
  check('drawn in that colour, the book-colour one kept apart', (await drawnIn('mark-blue')).join() === '1' && (await drawnIn()).join() === '1', JSON.stringify([await drawnIn('mark-blue'), await drawnIn()]))
  const blueAt = await h.evaluate(() => {
    const name = /::highlight\((web\w+)-mark\)/.exec(document.querySelector('.web-reader style').textContent)[1]
    const r = [...CSS.highlights.get(`${name}-mark-blue`)][0].getClientRects()[0]
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await h.mouse.click(blueAt.x, blueAt.y, { button: 'right' }); await wait(500)
  const blueMenu = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')].map((one) => one.getAttribute('aria-label') ?? one.textContent.trim()))
  check('its menu offers its colours and Keep as a gem', ['Pink', 'Keep as a gem', 'Copy with citation', 'Remove highlight'].every((one) => blueMenu.includes(one)), JSON.stringify(blueMenu))
  await h.click('[role="menuitemradio"][aria-label="Pink"]'); await wait(600)
  webMarks = await v('pdf:highlights', `${SITE}/article`)
  check('a colour from the menu recolours it', webMarks.find((one) => one.id === blue?.id)?.color === 'pink' && (await drawnIn('mark-pink')).join() === '1', JSON.stringify(webMarks.map((one) => one.color)))
  await h.mouse.click(blueAt.x, blueAt.y, { button: 'right' }); await wait(500)
  await h.click('[role="menuitem"]:has-text("Keep as a gem")'); await wait(900)
  webMarks = await v('pdf:highlights', `${SITE}/article`)
  const sitsGem = webMarks.find((one) => one.id === blue?.id)?.gemId ? await v('item', webMarks.find((one) => one.id === blue?.id).gemId) : null
  await h.click('.web-reader button[aria-label="Highlights"]'); await wait(400)
  const webListed = await h.evaluate(() => [...document.querySelectorAll('.web-reader .pdf-marks-list .pdf-outline-title')].map((one) => one.textContent))
  check('"Highlights" lists the article\'s highlights in reading order', JSON.stringify(webListed) === JSON.stringify(['quiet sentence worth keeping', 'sits here']), JSON.stringify(webListed))
  await h.click('.web-reader .pdf-marks-list .pdf-outline-row:has-text("sits here")'); await wait(500)
  check('a row lights its highlight', (await drawnIn('flash')).join() === '1', JSON.stringify(await drawnIn('flash')))
  await h.click('.web-reader button[aria-label="Highlights"]'); await wait(300)
  check('"Keep as a gem" makes its gem, sourced as Keep does', sitsGem?.medium === 'The Garden Essay, Probe Times' && sitsGem?.attribution === 'Ada Probe' && JSON.stringify(sitsGem?.body).includes('sits here'), JSON.stringify({ medium: sitsGem?.medium, attribution: sitsGem?.attribution }))

  // ⌘K finds the article by its title.
  const found = await h.evaluate(() => window.api.captures.find('garden essay'))
  check('search finds the article by its title, once', found.filter((one) => one.type === 'web').length === 1 && found.find((one) => one.type === 'web')?.label === 'The Garden Essay', JSON.stringify(found.map((one) => [one.type, one.label])))

  // Offline, the gem's link opens the kept article with the highlight lit.
  await net({ blocked: true, hits: 0 })
  await c.send('article', note); await wait(1200)
  await h.evaluate((href) => document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor.chain().focus('end').insertContent(`<p><a href="${href}">back to the essay</a></p>`).run(), `haligtree://article?href=${encodeURIComponent(`${SITE}/article`)}&mark=${marks[0]?.id}`)
  await wait(400)
  const linkBox = await h.evaluate(() => { const r = [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) a')].find((one) => one.textContent === 'back to the essay').getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 } })
  await h.keyboard.down('Meta'); await h.mouse.click(linkBox.x, linkBox.y); await h.keyboard.up('Meta')
  await h.waitForSelector('.web-reader-body p', { timeout: 10000 }).catch(() => {})
  await wait(500)
  const back = { open: await h.evaluate(() => !!document.querySelector('.web-reader-body')), marks: (await drawnIn())[0], lit: (await drawnIn('flash'))[0] }
  check("the gem's link opens the article with the highlight lit", back.open && back.marks === 1 && back.lit === 1, JSON.stringify(back))
  check('read from the book, not the site, when offline', (await electron.evaluate(() => globalThis.__webNet.hits)) === 0, '')
  await h.screenshot({ path: `${shots}/web-link-back.png` })
  await net({ blocked: false })

  // Cards straight from an article: C asks the question where the words were; ⇧C blanks them in their sentence.
  const pickWords = (words) => h.evaluate((words) => {
    const p = [...document.querySelectorAll('.web-reader-body p')].find((one) => one.textContent.includes(words))
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
    let text = walker.nextNode()
    while (text && !text.data.includes(words)) text = walker.nextNode()
    const at = text.data.indexOf(words)
    const range = document.createRange()
    range.setStart(text, at)
    range.setEnd(text, at + words.length)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  }, words)
  const articleCards = async () => [...(await v('items', 'card')), ...(await v('items', 'nugget'))].filter((one) => /The Garden Essay/.test(one.medium ?? '') && one.prompt)
  await pickWords('in the middle'); await wait(500)
  await h.keyboard.press('c'); await wait(400)
  check('C opens the question field, focused', await h.evaluate(() => document.activeElement?.getAttribute('aria-label') === "The card's question"), '')
  await h.keyboard.type('Where does the quiet sentence sit?'); await h.keyboard.press('Enter'); await wait(900)
  check('Return makes a card from the article', (await articleCards()).some((one) => one.prompt === 'Where does the quiet sentence sit?'), JSON.stringify((await articleCards()).map((one) => one.prompt)))
  await pickWords('worth keeping'); await wait(500)
  await h.keyboard.press('Shift+C'); await wait(900)
  const webBlank = (await articleCards()).find((one) => one.prompt?.includes('_____'))
  check('⇧C blanks the words in their own sentence, nothing from the heading', webBlank?.prompt === 'A quiet sentence _____ sits here, in the middle of the essay.', JSON.stringify(webBlank?.prompt))
  // Two articles side by side: each keeps its own highlights.
  await v('item:save', note, { title: 'Reading list', body: { type: 'doc', content: [
    { type: 'bookmark', attrs: { href: `${SITE}/article`, title: 'The Garden Essay', site: 'Probe Times' } },
    { type: 'bookmark', attrs: { href: `${SITE}/second`, title: 'A Second Essay', site: 'Probe Times' } },
    { type: 'paragraph' }
  ] } })
  await c.send('article', note); await wait(1400)
  await h.locator('.tiptap-bookmark').nth(0).hover(); await wait(300)
  await h.keyboard.down('Alt'); await h.locator(button).nth(0).click(); await h.keyboard.up('Alt')
  await h.waitForSelector('.web-reader-body p', { timeout: 10000 }).catch(() => {})
  await wait(600)
  await h.locator(`[data-open="${note}"] .tiptap-bookmark`).nth(1).hover(); await wait(300)
  await h.locator(`[data-open="${note}"] ${button}`).nth(1).click()
  await h.waitForFunction(() => document.querySelectorAll('.web-reader-body p').length > 0 && document.querySelectorAll('.web-reader').length === 2, null, { timeout: 10000 }).catch(() => {})
  await wait(600)
  const side = await h.evaluate(() => [...document.querySelectorAll('.web-reader .pdf-reader-title')].map((one) => one.textContent))
  const both = await drawnIn()
  check('two articles open side by side', side.length === 2 && side.includes('The Garden Essay') && side.includes('A Second Essay'), JSON.stringify(side))
  check('each keeps its own highlights: the first still drawn, none on the second', both.length === 2 && both[side.indexOf('The Garden Essay')] === 1 && both[side.indexOf('A Second Essay')] === 0, JSON.stringify(both))
  await h.screenshot({ path: `${shots}/web-side-by-side.png` })

  // Pages the reader cannot read say why, never a blank pane.
  // A guard against robots is said as one (never as a sign-in it is not).
  for (const [path, words] of [['/login', /sign in/], ['/paid', /paywall/], ['/app', /scripts/], ['/guarded', /checks that a person is visiting/]]) {
    await open(`${SITE}${path}`)
    await h.waitForSelector('.web-reader-failed', { timeout: 10000 }).catch(() => {})
    const said = await h.evaluate(() => document.querySelector('.web-reader-failed')?.textContent ?? '')
    check(`a page at ${path} says why it cannot be read`, words.test(said) && /link stays/.test(said), said)
    await c.both(`${shots}/web-failed${path.replace('/', '-')}`)
  }
  await net({ blocked: true })
  await open(`${SITE}/never-kept`)
  await h.waitForSelector('.web-reader-failed', { timeout: 10000 }).catch(() => {})
  check('offline, a page never kept says it could not be reached', /could not be reached/.test(await h.evaluate(() => document.querySelector('.web-reader-failed')?.textContent ?? '')), '')
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
