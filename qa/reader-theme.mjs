// The web reader, made right (asks 69 and 70, 14 Nov): an article is set on the theme's own page in a note's
// reading type, column and rhythm, in every look (dark, light, Paper, and the Paper and Brutal styles), its byline
// readable (4.5:1 or more); and every place a plain web link in a note offers anything offers "Open in the reader",
// each driven to the reader opening: the link's hover, ⌥-click, its right-click menu, the selection bar on it, the
// link editor by ⌘K and by "Edit link", ⌘K's palette with the address typed, and the link card's corner and menu.
// The site is faked in the main process's fetch at an address on the internet, as in qa/web-reader.mjs.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/reader-theme.mjs
// QA_SHOTS=<folder> keeps a picture of the note beside the reader in each look.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SITE = 'https://93.184.216.34'
const ESSAY = `${SITE}/essay`
const para = (n) => `<p>Paragraph ${n} of the long essay walks slowly through the garden, noting each tree and the light that falls between the leaves, so a reader has enough words here to call this an article and not a scrap.</p>`
// Wrapped as sites wrap them (Wikipedia's sections, an article): the reader sets the blocks straight in its column.
const pages = {
  '/essay': `<html><head><title>The Long Essay | Probe Times</title><meta property="og:site_name" content="Probe Times"><meta property="article:published_time" content="2026-09-14T08:00:00Z"></head><body>
    <article><h1>The Long Essay</h1><p class="byline">By Ada Probe</p><section><p>The first section opens here, and <a href="https://93.184.216.34/other">a link in the essay</a> leads on.</p>${para(1)}${para(2)}</section>
    <section><h2>A second part</h2>${para(3)}${para(4)}<blockquote><p>A line quoted from somewhere else, kept apart.</p></blockquote>${para(5)}</section></article></body></html>`
}

const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? ''
try {
  await electron.evaluate((_, [site, pages]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      const page = pages[new URL(url).pathname]
      // The first reading takes a real page's while (2.5s), so what lists it is drawn before its article is kept.
      if (page && !globalThis.__readOnce) (globalThis.__readOnce = true, await new Promise((done) => setTimeout(done, 2500)))
      return page ? new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('', { status: 404 })
    }
  }, [SITE, pages])
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  // In the page: the colour actually painted behind an element (the first solid one up its ancestors), a colour laid
  // over it, and the contrast of two, all read through a canvas so any colour a theme writes (oklch, color-mix) is plain RGB.
  await h.evaluate(() => {
    const ink = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const paint = (...fills) => { for (const fill of fills) { ink.fillStyle = fill; ink.fillRect(0, 0, 1, 1) } return [...ink.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    const solid = (fill) => (paint('#fff', fill).join() === paint('#000', fill).join() ? paint('#fff', fill) : null)
    window.__painted = (el) => { for (let at = el; at; at = at.parentElement) { const got = solid(getComputedStyle(at).backgroundColor); if (got) return got } return null }
    // The page a pane gives whatever it shows: in a split on a dark theme the pane in front is lifted a step
    // (panes.tsx), as macOS lifts its key window, so a page is measured against its own pane's.
    window.__paneGives = (el) => solid(getComputedStyle(el.closest('[data-pane-card]') ?? document.documentElement).getPropertyValue('--background'))
    const lum = (rgb) => { const [r, g, b] = rgb.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    window.__contrast = (el) => {
      const under = window.__painted(el)
      const ink2 = paint(`rgb(${under.join(',')})`, getComputedStyle(el).color)
      const [hi, lo] = [lum(ink2), lum(under)].sort((a, b) => b - a)
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
    }
  })

  // A note holding a plain link to the essay among words, and a link card to it.
  const note = await v('article:new')
  await v('item:save', note, { title: 'Reading list', body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'The note itself, set beside the reader to read the two as one book.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Read ' }, { type: 'text', text: 'the long essay', marks: [{ type: 'link', attrs: { href: ESSAY } }] }, { type: 'text', text: ' before the seminar on Thursday.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'A second paragraph of the note, so its own rhythm between paragraphs can be read.' }] },
    { type: 'bookmark', attrs: { href: ESSAY, title: 'The Long Essay', site: 'Probe Times' } },
    { type: 'paragraph' }
  ] } })
  const LINK = `[data-open="${note}"] .tiptap:not(.is-line):not(.is-plain) a[href="${ESSAY}"]`
  const showNote = async () => {
    await h.keyboard.press('Escape').catch(() => {})
    await c.send('article', note)
    await h.waitForSelector(LINK, { timeout: 10000 })
    await h.mouse.move(4, 4)
    await wait(700)
  }
  /** Whether the reader is showing the essay, by its own heading. */
  const reading = async () => {
    await h.waitForFunction(() => [...document.querySelectorAll('.web-reader-heading')].some((one) => one.textContent === 'The Long Essay'), null, { timeout: 8000 }).catch(() => {})
    return h.evaluate(() => [...document.querySelectorAll('.web-reader-heading')].some((one) => one.textContent === 'The Long Essay'))
  }
  /** A frame every 50ms for `ms`, around a box, kept as <name>-00.png and on (QA_SHOTS only): to read a change by eye. */
  const film = async (name, ms, clip) => { if (!shots) return; for (let t = 0; t <= ms; t += 50) await h.screenshot({ path: `${shots}/${name}-${String(t / 50).padStart(2, '0')}.png`, clip }) }
  const linkAt = async () => {
    const r = await h.locator(LINK).first().boundingBox()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.x, top: r.y, height: r.height }
  }

  // --- Every place the plain link offers anything ---------------------------------------------------------------
  await showNote()
  // Its hover: one box, saying where it goes and that ⌥-click reads it in the reader; no second tip beside it.
  let at = await linkAt()
  await h.mouse.move(at.x, at.y, { steps: 4 })
  await film('film-hover', 700, { x: Math.max(0, at.left - 80), y: Math.max(0, at.top - 70), width: 640, height: 200 })
  await wait(700)
  const hover = await h.evaluate(() => ({
    box: document.querySelector('.tiptap-link-preview')?.textContent ?? null,
    tips: [...document.querySelectorAll('body *')].filter((one) => !one.closest('.tiptap-link-preview') && one.children.length === 0 && /^Click to open/.test(one.textContent?.trim() ?? '')).length
  }))
  check('hover: the link\'s box offers the reader (“⌥-click to open in the reader”)', /⌥-click to open in the reader/.test(hover.box ?? ''), JSON.stringify(hover))
  check('hover: one floating thing, no tip beside the box', hover.box !== null && hover.tips === 0, JSON.stringify(hover))
  if (shots) await h.screenshot({ path: `${shots}/link-hover.png` })
  await h.mouse.move(4, 4); await wait(300)

  // Its right-click menu.
  at = await linkAt()
  await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(600)
  const menuRow = h.locator('[role="menuitem"]', { hasText: /^Open in the reader/ })
  check('right-click: the link\'s menu offers “Open in the reader”', (await menuRow.count()) > 0)
  if (await menuRow.count()) await menuRow.first().click()
  check('right-click: “Open in the reader” opens the essay in the reader', await reading())
  // Its first reading names it everywhere it is listed: the sidebar's Recent too, by the article's title, not its address.
  await h.waitForFunction((href) => document.querySelector(`[data-side-recent-row="${href}"]`)?.textContent === 'The Long Essay', ESSAY, { timeout: 5000 }).catch(() => {})
  const recentName = await h.evaluate((href) => document.querySelector(`[data-side-recent-row="${href}"]`)?.textContent ?? null, ESSAY)
  check("the sidebar's Recent names the article by its title once it is read", recentName === 'The Long Essay', String(recentName))

  // The selection bar on words picked in it.
  await showNote()
  at = await linkAt()
  await h.mouse.dblclick(at.x, at.y); await wait(900)
  const barRead = h.locator('[data-read-link]')
  check('selection bar: words picked in the link offer “Open in the reader”', (await barRead.count()) > 0, await h.evaluate(() => [...document.querySelectorAll('[aria-label]')].filter((one) => one.closest('[role="toolbar"], .tiptap-toolbar')).map((one) => one.getAttribute('aria-label')).join(', ')))
  if (shots) await h.screenshot({ path: `${shots}/selection-bar.png` })
  if (await barRead.count()) await barRead.first().click()
  check('selection bar: it opens the essay in the reader', await reading())

  // The link editor, by ⌘K with the caret in the link (a click beside it, then the arrows).
  await showNote()
  at = await linkAt()
  await h.mouse.click(at.left - 6, at.top + at.height / 2); await wait(300)
  for (let i = 0; i < 4; i++) await h.keyboard.press('ArrowRight')
  await h.keyboard.press('Meta+k')
  await film('film-editor', 300, { x: Math.max(0, at.left - 80), y: Math.max(0, at.top - 40), width: 640, height: 200 })
  await wait(300)
  const editorOpen = await h.evaluate(() => !!document.querySelector('[data-link-editor]'))
  const editorRead = h.locator('[data-link-editor] [data-link-read]')
  check('⌘K on the link: the link editor offers “Open in the reader”', editorOpen && (await editorRead.count()) > 0, `editor ${editorOpen}`)
  if (shots && editorOpen) await h.screenshot({ path: `${shots}/link-editor.png` })
  if (await editorRead.count()) await editorRead.first().click()
  check('⌘K on the link: it opens the essay in the reader, the link as it was', (await reading()) && !(await h.evaluate(() => !!document.querySelector('[data-link-editor]'))))
  await showNote()
  check('the link is unchanged after it', await h.evaluate((sel) => document.querySelector(sel)?.textContent, LINK) === 'the long essay')

  // The link editor by the menu's “Edit link”: the same box, the same line.
  at = await linkAt()
  await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(600)
  await h.locator('[role="menuitem"]', { hasText: /^Edit link/ }).first().click(); await wait(600)
  check('“Edit link”: the link editor offers “Open in the reader”', (await h.locator('[data-link-editor] [data-link-read]').count()) > 0)
  await h.keyboard.press('Escape'); await wait(300)

  // ⌘K's palette, with the address pasted in: the reader first, Enter opens it.
  await h.mouse.click(4, 300); await wait(200)
  await h.keyboard.press('Escape'); await wait(200)
  await h.keyboard.press('Meta+k'); await wait(700)
  await h.keyboard.type(ESSAY); await wait(900)
  // The lit row (Enter's) and the actions offered, by their own labels (search.tsx, actionRow).
  const palette = await h.evaluate(() => ({ lit: document.querySelector('[data-search-at] [data-action-label]')?.textContent ?? document.querySelector('[data-search-at]')?.textContent?.trim().slice(0, 60) ?? null, actions: [...document.querySelectorAll('[data-action-label]')].map((one) => one.textContent).slice(0, 5) }))
  check('⌘K with the address: the lit first row is “Open in the reader”', palette.lit === 'Open in the reader', JSON.stringify(palette))
  if (shots) await h.screenshot({ path: `${shots}/palette.png` })
  await h.keyboard.press('Enter')
  check('⌘K with the address: Enter opens the essay in the reader', await reading())

  // The link card: its corner and its menu (these had it already).
  await showNote()
  await h.hover(`[data-open="${note}"] .tiptap-bookmark`); await wait(400)
  check('link card: its corner offers “Open in the reader”', (await h.locator(`[data-open="${note}"] .tiptap-bookmark button[aria-label="Open in the reader"]`).count()) > 0)
  await h.locator(`[data-open="${note}"] .tiptap-bookmark`).click({ button: 'right', position: { x: 12, y: 12 } }); await wait(700)
  check('link card: its menu offers “Open in the reader”', (await h.locator('button:has-text("Open in the reader"), [role="menuitem"]:has-text("Open in the reader")').count()) > 0)
  await h.keyboard.press('Escape'); await wait(300)

  // ⌥-click on the link: the reader, beside the note. Both stay open for the looks below.
  await showNote()
  at = await linkAt()
  await h.keyboard.down('Alt'); await h.mouse.click(at.x, at.y); await h.keyboard.up('Alt')
  check('⌥-click: the essay opens in the reader beside the note', (await reading()) && (await h.evaluate((n) => !!document.querySelector(`[data-open="${n}"]`), note)))
  await h.waitForSelector('.web-reader-body p', { timeout: 10000 }).catch(() => {})
  await h.mouse.move(4, 4); await wait(600)

  // --- The reader's own page, in every look ------------------------------------------------------------------
  check('the reader\'s bar has no “Paper pages” of its own: the theme decides', await h.evaluate(() => ![...document.querySelectorAll('.web-reader .pdf-reader-tools button')].some((one) => /pages/i.test(one.getAttribute('aria-label') ?? ''))))
  const rhythm = await h.evaluate((n) => {
    const read = (p) => { const s = getComputedStyle(p); return { line: Math.round((parseFloat(s.lineHeight) / parseFloat(s.fontSize)) * 100) / 100, size: parseFloat(s.fontSize), family: s.fontFamily } }
    const noteP = [...document.querySelectorAll(`[data-open="${n}"] .tiptap:not(.is-line):not(.is-plain) > p`)]
    const body = document.querySelector('.web-reader-body')
    const ps = [...(body?.querySelectorAll('p') ?? [])]
    const second = ps.find((one) => one.previousElementSibling?.tagName === 'P')
    const noteSecond = noteP.find((one) => one.previousElementSibling?.tagName === 'P')
    return {
      note: noteP[0] && read(noteP[0]), reader: ps[0] && read(ps[0]),
      gap: second && Math.round((parseFloat(getComputedStyle(second).marginTop) / parseFloat(getComputedStyle(second).fontSize)) * 100) / 100,
      noteGap: noteSecond && Math.round((parseFloat(getComputedStyle(noteSecond).marginTop) / parseFloat(getComputedStyle(noteSecond).fontSize)) * 100) / 100,
      // A quote's, a list's or a table's own paragraphs stay inside it, as in a note.
      straight: ps.filter((one) => one.parentElement === body).length, all: ps.filter((one) => !one.closest('blockquote, li, td, th, figure')).length,
      quote: body?.querySelector('blockquote') ? getComputedStyle(body.querySelector('blockquote')).fontStyle : null,
      // The article's title against the note's own (items-view.tsx, data-page-title): face, size, weight.
      title: [document.querySelector('.web-reader-heading'), document.querySelector(`[data-open="${n}"] [data-page-title]`)].map((one) => one && [getComputedStyle(one).fontFamily, getComputedStyle(one).fontSize, getComputedStyle(one).fontWeight].join(' / '))
    }
  }, note)
  check("the article's words in the note's type and size", rhythm.note && rhythm.reader && rhythm.reader.family === rhythm.note.family && rhythm.reader.size === rhythm.note.size, JSON.stringify(rhythm))
  check("the note's line height and room between paragraphs", rhythm.reader?.line === rhythm.note?.line && rhythm.gap === rhythm.noteGap, JSON.stringify(rhythm))
  check('every paragraph set straight in the column, out of the site\'s sections', rhythm.all > 0 && rhythm.straight === rhythm.all, JSON.stringify(rhythm))
  check('a quote set off as a note sets one', rhythm.quote === 'italic', JSON.stringify(rhythm))
  check("the article's title set as a note's title is", !!rhythm.title[0] && rhythm.title[0] === rhythm.title[1], JSON.stringify(rhythm.title))

  for (const [theme, style] of [['paper', 'soft'], ['light', 'soft'], ['dark', 'soft'], ['dark', 'paper'], ['paper', 'brutal']]) {
    await h.evaluate(([t, s]) => { localStorage.setItem('theme', t); localStorage.setItem('style', s); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, [theme, style])
    await wait(900)
    const look = await h.evaluate((n) => {
      const noteP = document.querySelector(`[data-open="${n}"] .tiptap:not(.is-line):not(.is-plain) > p`)
      const readerP = document.querySelector('.web-reader-body p')
      const meta = document.querySelector('.web-reader-meta')
      return {
        worn: [document.documentElement.className.match(/\b(paper|light|dark|midnight)\b/g)?.join(' '), document.documentElement.dataset.style ?? 'soft'].join(' / '),
        notePage: window.__painted(noteP)?.join(), readerPage: window.__painted(readerP)?.join(), notePane: window.__paneGives(noteP)?.join(), readerPane: window.__paneGives(readerP)?.join(),
        noteInk: getComputedStyle(noteP).color, readerInk: getComputedStyle(readerP).color,
        byline: meta?.textContent, bylineContrast: meta ? window.__contrast(meta) : 0, bylineSize: meta ? parseFloat(getComputedStyle(meta).fontSize) : 0,
        noteLink: getComputedStyle(document.querySelector(`[data-open="${n}"] .tiptap:not(.is-line):not(.is-plain) a[href]`)).color,
        readerLink: getComputedStyle(document.querySelector('.web-reader-body a[href]')).color
      }
    }, note)
    const name = `${theme}${style === 'soft' ? '' : ` (${style} style)`}`
    check(`${name}: the reader's page is the theme's page, as the note's is`, !!look.readerPage && look.readerPage === look.readerPane && look.notePage === look.notePane, JSON.stringify(look))
    check(`${name}: the article's words are the note's ink`, look.readerInk === look.noteInk, JSON.stringify(look))
    check(`${name}: a link in the article is the note's link colour`, look.readerLink === look.noteLink, `${look.readerLink} / ${look.noteLink}`)
    check(`${name}: the byline reads at 4.5:1 or more, 14px or larger`, look.bylineContrast >= 4.5 && look.bylineSize >= 14, `${look.bylineContrast}:1 at ${look.bylineSize}px, "${look.byline}"`)
    if (shots) await h.screenshot({ path: `${shots}/reader-${theme}-${style}.png` })
  }
  await h.evaluate(() => { localStorage.setItem('theme', 'paper'); localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) })
  check('no page errors', c.errors.filter((one) => !/favicon|net::|Failed to load resource/i.test(one)).length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close?.()
  done()
}
