// The reader reads as a page of its own, not a note (the user, 15 Nov 2026: "yes to narrower page + margin lines on
// both sides of the page for the reader mode"). Its words stand in a narrower column than a note's, the same number of
// characters a line at each of its seven text sizes, in a page whose two edges are hairlines down the scroll area's
// whole height, inside the pane, with wide margins between the words and the lines. Where a pane has no room for the
// margins the lines go before the words are squeezed. Measured with the reader in the pane a note was in (the note
// first, the same words in both), beside the note (half a split) and in the smallest window. A wide picture stands
// wider than the words and inside the lines; a long word, a long link, a table and code never run past a line;
// nothing on the page moves once the article has come; the lines are there in every look, faint. And a site's front
// page whose titles say only "Home" is named by its first heading (src/main/article-names.ts), wherever it is named.
// The characters are counted from the words as drawn (each character's line), the lines found in the pixels of the
// scroll area (a column of pixels unlike the page from its top to its foot), so the check holds however they are drawn.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/reader-page.mjs
// QA_SHOTS=<folder> keeps the frames: the note and the reader in one pane, the reader beside the note, the smallest
// window, a wide picture and Find lit, each light and dark, and the article's arrival a frame every 50ms.
import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

/** A picture of one colour, w by h. */
const png = (w, h, rgb) => {
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
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).fill(Buffer.from(rgb))])
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}

// Real prose (Frankenstein, 1818, public domain), the same in the note and the article, so their lines compare.
const PROSE = [
  'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings. I arrived here yesterday, and my first task is to assure my dear sister of my welfare and increasing confidence in the success of my undertaking.',
  'I am already far north of London, and as I walk in the streets of Petersburgh, I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight. Do you understand this feeling? This breeze, which has travelled from the regions towards which I am advancing, gives me a foretaste of those icy climes.',
  'Inspirited by this wind of promise, my daydreams become more fervent and vivid. I try in vain to be persuaded that the pole is the seat of frost and desolation; it ever presents itself to my imagination as the region of beauty and delight. There, Margaret, the sun is for ever visible, its broad disk just skirting the horizon and diffusing a perpetual splendour.',
  'These are my enticements, and they are sufficient to conquer all fear of danger or death and to induce me to commence this laborious voyage with the joy a child feels when he embarks in a little boat, with his holiday mates, on an expedition of discovery up his native river.',
  'But supposing all these conjectures to be false, you cannot contest the inestimable benefit which I shall confer on all mankind, to the last generation, by discovering a passage near the pole to those countries, to reach which at present so many months are requisite; or by ascertaining the secret of the magnet, which, if at all possible, can only be effected by an undertaking such as mine.',
  'These reflections have dispelled the agitation with which I began my letter, and I feel my heart glow with an enthusiasm which elevates me to heaven, for nothing contributes so much to tranquillise the mind as a steady purpose, a point on which the soul may fix its intellectual eye.'
]
const SITE = 'https://93.184.216.34'
const LETTERS = `${SITE}/letters`
const LONG_WORD = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(3)
const LONG_LINK = `${SITE}/archive/1818/letters/walton/to/margaret/saville/from/archangel/and/the/ice/beyond/the/pole/in/full`
const cells = (row) => row.map((one) => `<td>${one}</td>`).join('')
const pages = {
  '/letters': `<html><head><title>Letters from the North | Probe Times</title><meta property="og:site_name" content="Probe Times"><meta property="article:published_time" content="2026-09-14T08:00:00Z"></head><body>
    <article><h1>Letters from the North</h1><p class="byline">By Robert Walton</p>
    <p>${PROSE[0]}</p><p>${PROSE[1]}</p>
    <h2>The voyage</h2><p>${PROSE[2]}</p>
    <figure><img src="/wide.png" alt="The ice at the pole"><figcaption>The ice at the pole, as the letters picture it.</figcaption></figure>
    <p>${PROSE[3]}</p>
    <h2>The ship</h2><p>${PROSE[4]}</p>
    <p>A word with no room to break, ${LONG_WORD}, and an address written out whole: <a href="${LONG_LINK}">${LONG_LINK}</a>.</p>
    <img src="/small.png" alt="A sketch of the ship in the ice">
    <p>${PROSE[5]}</p>
    <h2>The crew</h2>
    <table><thead><tr><th>Name</th><th>Post on the ship</th><th>Watch kept</th><th>Rations a week</th><th>Home port</th><th>Years at sea</th><th>Letters home</th><th>Remarks of the master</th></tr></thead>
    <tbody><tr>${cells(['Robert Walton', 'Master and captain', 'The first watch', 'Biscuit, salt beef and tea', 'Archangel', 'Six years and more', 'Four to his sister', 'Ardent, and given to dreaming of the pole'])}</tr>
    <tr>${cells(['The lieutenant', 'Second in command', 'The middle watch', 'Biscuit, salt pork and rum', 'Petersburgh', 'Eleven years', 'None he will speak of', 'Of unparalleled courage, and kind to the men'])}</tr></tbody></table>
    <pre><code>const route = ["London", "Petersburgh", "Archangel", "the open sea", "the ice", "the pole"].map((port, day) => ({ port, day, letters: day * 2 })) // every port on the way north, a day apart</code></pre>
    <p>${PROSE[0]}</p></article></body></html>`,
  // A site's front page that calls itself only "Home" (its og:title, and its <title> but for the site's name).
  '/front': `<html><head><title>Home | Probe Times</title><meta property="og:title" content="Home"><meta property="og:site_name" content="Probe Times"></head><body>
    <article><h1>The Arctic Letters</h1><p>${PROSE[1]}</p><p>${PROSE[2]}</p></article></body></html>`
}
const FRONT = `${SITE}/front`
// Articles that open on something other than a paragraph's own letter: no drop cap for any of them.
const OPENS = {
  'a picture': `<img src="/small.png" alt="A sketch of the ship in the ice"><p>${PROSE[3]}</p><p>${PROSE[4]}</p>`,
  'a heading': `<h2>The first part</h2><p>${PROSE[3]}</p><p>${PROSE[4]}</p>`,
  'a quote mark': `<p>“${PROSE[3]}”</p><p>${PROSE[4]}</p>`,
  'a number': `<p>1818, Archangel. ${PROSE[3]}</p><p>${PROSE[4]}</p>`,
  'a link': `<p><a href="${SITE}/letters">These are my enticements</a>, ${PROSE[3]}</p><p>${PROSE[4]}</p>`
}
for (const [kind, body] of Object.entries(OPENS)) pages[`/opens-${kind.replace(/\W+/g, '-')}`] = `<html><head><title>Opens with ${kind}</title></head><body><article><h1>Opens with ${kind}</h1>${body}</article></body></html>`

const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const until = async (test, ms = 10000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await test()) return true; return false }
const shots = process.env.QA_SHOTS ?? ''
if (shots) mkdirSync(shots, { recursive: true })
try {
  await electron.evaluate((_, [site, pages, wide, small]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      const path = new URL(url).pathname
      // The first reading takes a real page's while, so the wait is seen before the article comes.
      if (pages[path]) {
        if (!globalThis.__readOnce) (globalThis.__readOnce = true, await new Promise((done) => setTimeout(done, 1500)))
        return new Response(pages[path], { headers: { 'content-type': 'text/html; charset=utf-8' } })
      }
      if (path === '/wide.png') return new Response(Buffer.from(wide, 'base64'), { headers: { 'content-type': 'image/png' } })
      if (path === '/small.png') return new Response(Buffer.from(small, 'base64'), { headers: { 'content-type': 'image/png' } })
      return new Response('', { status: 404 })
    }
  }, [SITE, pages, png(1600, 900, [70, 110, 150]), png(320, 200, [150, 110, 70])])
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })

  // In the page: the reader on show, its words' lines in characters, and the hairlines in the scroll area's pixels.
  await h.evaluate(() => {
    const visible = (selector) => [...document.querySelectorAll(selector)].find((one) => { const r = one.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
    /** Characters on each full line of these paragraphs (a paragraph's last line is not full, so not counted). */
    const linesOf = (paragraphs) => {
      const full = []
      const range = document.createRange()
      for (const p of paragraphs) {
        const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
        let top = null
        let count = 0
        for (let node = walk.nextNode(); node; node = walk.nextNode())
          for (let i = 0; i < node.data.length; i++) {
            range.setStart(node, i); range.setEnd(node, i + 1)
            const box = range.getClientRects()[0]
            if (box && box.width > 0) {
              if (top !== null && Math.abs(box.top - top) > 4) (full.push(count), (count = 0))
              top = box.top
            }
            count++
          }
      }
      return full
    }
    window.__words = (where) => {
      const root = visible(where)
      if (!root) return null
      const prose = [...root.querySelectorAll('p')].filter((one) => (one.textContent ?? '').length > 250 && !one.querySelector('a'))
      const lines = linesOf(prose)
      const p = prose[0]
      const box = p?.getBoundingClientRect()
      return { lines: lines.length, chars: lines.length ? Math.round((lines.reduce((a, b) => a + b, 0) / lines.length) * 10) / 10 : 0, em: p ? parseFloat(getComputedStyle(p).fontSize) : 0, left: box ? Math.round(box.left * 10) / 10 : 0, right: box ? Math.round(box.right * 10) / 10 : 0 }
    }
    /** The scroll area of the reader on show, and the pane around it. */
    window.__frame = () => {
      const reader = visible('.web-reader')
      const scroll = reader?.querySelector('.pdf-reader-scroll')
      if (!scroll) return null
      const r = scroll.getBoundingClientRect()
      const pane = (reader.closest('[data-pane-card]') ?? reader).getBoundingClientRect()
      return { x: r.left, y: r.top, width: scroll.clientWidth, height: r.height, scrollX: scroll.scrollWidth - scroll.clientWidth, pane: { left: pane.left, right: pane.right } }
    }
    /** Columns of pixels unlike the page from the top of a picture to its foot: [{ x, width, colour }] in the picture's own pixels. */
    window.__hairlines = async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (one) => one.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const pen = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d', { willReadFrequently: true })
      pen.drawImage(bitmap, 0, 0)
      const { data, width, height } = pen.getImageData(0, 0, bitmap.width, bitmap.height)
      const at = (x, y) => (y * width + x) * 4
      // The page's own colour: the commonest in the picture.
      const seen = new Map()
      for (let i = 0; i < data.length; i += 4 * 7) { const key = `${data[i]},${data[i + 1]},${data[i + 2]}`; seen.set(key, (seen.get(key) ?? 0) + 1) }
      const page = [...seen].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number)
      const unlike = (i) => Math.abs(data[i] - page[0]) + Math.abs(data[i + 1] - page[1]) + Math.abs(data[i + 2] - page[2]) > 6
      const runs = []
      for (let x = 0; x < width; x++) {
        let n = 0
        for (let y = 0; y < height; y++) if (unlike(at(x, y))) n++
        if (n / height < 0.97) continue
        const last = runs.at(-1)
        if (last && last.to === x - 1) last.to = x
        else runs.push({ from: x, to: x })
      }
      return { page, lines: runs.map(({ from, to }) => {
        // The line's colour: its strongest column's middle pixel.
        let best = from
        for (let x = from; x <= to; x++) if (Math.abs(data[at(x, height >> 1)] - page[0]) > Math.abs(data[at(best, height >> 1)] - page[0])) best = x
        const i = at(best, height >> 1)
        return { x: (from + to + 1) / 2, width: to - from + 1, colour: [data[i], data[i + 1], data[i + 2]] }
      }) }
    }
    /** The opening paragraph as drawn: whether it is marked for a drop cap, its first letter's box, and where its first three lines start. */
    window.__cap = () => {
      const body = visible('.web-reader-body')
      const p = body?.firstElementChild
      if (!p || p.tagName !== 'P') return { drop: false, opens: p?.tagName ?? null, lines: [] }
      const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      const marks = []
      for (let node = walk.nextNode(); node && marks.length < 600; node = walk.nextNode())
        for (let i = 0; i < node.data.length && marks.length < 600; i++) {
          range.setStart(node, i); range.setEnd(node, i + 1)
          const r = range.getClientRects()[0]
          if (r && r.width > 0) marks.push({ top: r.top, left: r.left, bottom: r.bottom, right: r.right })
        }
      const edge = p.getBoundingClientRect().left
      const lines = []
      for (const one of marks.slice(1)) if (!lines.length || Math.abs(one.top - lines.at(-1).top) > 4) lines.push(one)
      const lh = parseFloat(getComputedStyle(p).lineHeight)
      return { drop: p.hasAttribute('data-drop'), lh, cap: marks[0] && { top: Math.round(marks[0].top), bottom: Math.round(marks[0].bottom), right: Math.round(marks[0].right - edge) }, lines: lines.slice(0, 3).map((one) => ({ top: Math.round(one.top), bottom: Math.round(one.bottom), left: Math.round(one.left - edge) })) }
    }
    const ink = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    window.__rgb = (css) => { ink.clearRect(0, 0, 1, 1); ink.fillStyle = '#000'; ink.fillStyle = css; ink.fillRect(0, 0, 1, 1); return [...ink.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    const lum = (rgb) => { const [r, g, b] = rgb.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    window.__contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 }
  })

  /** The page as drawn now: the words' lines, the hairlines (in the page's own px) and what runs past them. */
  const page = async () => {
    const frame = await h.evaluate(() => window.__frame())
    if (!frame) return null
    const clip = { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
    // The page's own lines, read with the desk under it taken away for the picture (pdf.css: squared paper and grain
    // outside the page), so the desk's squares are never taken for the page's edges.
    await h.evaluate(() => { const off = document.createElement('style'); off.id = 'qa-no-desk'; off.textContent = '.pdf-reader-scroll { background-image: none !important }'; document.head.append(off) })
    const picture = await h.screenshot({ clip, scale: 'css' }).finally(() => h.evaluate(() => document.getElementById('qa-no-desk')?.remove()))
    const found = await h.evaluate((b64) => window.__hairlines(b64), picture.toString('base64'))
    const lines = found.lines.map((one) => ({ ...one, x: Math.round((frame.x + one.x) * 10) / 10 }))
    const words = await h.evaluate(() => window.__words('.web-reader-body'))
    const [left, right] = [lines[0]?.x, lines.at(-1)?.x]
    const past = lines.length === 2 ? await h.evaluate(([left, right]) => {
      const body = [...document.querySelectorAll('.web-reader-body')].find((one) => one.getBoundingClientRect().width > 0)
      // Whatever scrolls sideways inside itself (a wide table, code) is measured by its own box.
      const held = (one) => { for (let at = one.parentElement; at && at !== body; at = at.parentElement) if (/auto|scroll|hidden/.test(getComputedStyle(at).overflowX)) return true; return false }
      return [...body.querySelectorAll('*')].filter((one) => !held(one)).map((one) => [one.tagName, one.getBoundingClientRect(), one]).filter(([, r]) => r.width > 0 && (r.left < left - 0.5 || r.right > right + 0.5)).map(([tag, r, one]) => `${tag} ${Math.round(r.left)}..${Math.round(r.right)} (white-space ${getComputedStyle(one).whiteSpace}, overflow-wrap ${getComputedStyle(one).overflowWrap})`).slice(0, 4)
    }, [left, right]) : []
    return { frame, lines, page: found.page, words, past }
  }
  /** The reader's own text size, through its own buttons: from the usual size, n steps (Smaller below, Larger above). */
  const sizeTo = async (steps) => {
    await h.click('.web-reader button[aria-label="Usual size"]')
    for (let i = 0; i < Math.abs(steps); i++) await h.click(`.web-reader button[aria-label="${steps < 0 ? 'Smaller' : 'Larger'}"]`)
    await wait(350)
    return h.evaluate(() => document.querySelector('.web-reader button[aria-label="Usual size"]')?.textContent?.trim())
  }
  const SIZES = [-2, -1, 0, 1, 2, 3, 4]
  const shoot = async (name) => { if (shots) await c.both(`${shots}/${name}`) }

  // --- The note, in the pane, with the same words --------------------------------------------------------------------
  const note = await v('article:new')
  await v('item:save', note, { title: 'Letters from the North', body: { type: 'doc', content: PROSE.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) } })
  await c.send('article', note)
  await h.waitForSelector(`[data-open="${note}"] .tiptap p`, { timeout: 10000 })
  await h.mouse.move(4, 4); await wait(800)
  const noteWords = await h.evaluate((n) => window.__words(`[data-open="${n}"] .tiptap`), note)
  await shoot('1-note-in-the-pane')

  // --- The reader in the same pane: the article's arrival, a frame every 50ms -----------------------------------------
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), LETTERS)
  const frames = []
  // Until eight frames hold the article (a slower machine takes longer; nothing here is timed).
  for (const end = Date.now() + 20000; Date.now() < end;) {
    const at = await h.evaluate(() => {
      const reader = [...document.querySelectorAll('.web-reader')].find((one) => one.getBoundingClientRect().width > 0)
      const box = (el) => (el ? [el.getBoundingClientRect().left, el.getBoundingClientRect().top, el.getBoundingClientRect().width].map(Math.round).join(',') : null)
      return { article: !!reader?.querySelector('.web-reader-body p'), heading: box(reader?.querySelector('.web-reader-heading')), first: box(reader?.querySelector('.web-reader-body p')), tools: [...(reader?.querySelectorAll('.pdf-reader-tools button') ?? [])].map(box).join(' ') }
    })
    const drawn = await page().catch(() => null)
    frames.push({ ...at, lines: drawn?.lines.map((one) => one.x).join(',') ?? '' })
    if (shots) await h.screenshot({ path: `${shots}/0-arrival-${String(frames.length).padStart(2, '0')}.png` })
    if (frames.filter((one) => one.article).length >= 8) break
    await wait(50)
  }
  const came = frames.filter((one) => one.article)
  check('the article came (a frame every 50ms while it was read)', came.length >= 8, `${frames.length} frames, ${came.length} with the article`)
  check('nothing on the page moves once the article has come: its title, its first words, the lines', came.length > 0 && came.every((one) => one.heading === came[0].heading && one.first === came[0].first && one.lines === came[0].lines), JSON.stringify(came.map((one) => [one.heading, one.first, one.lines])).slice(0, 400))
  check('the bar holds still from the wait to the article', frames.every((one) => one.tools === frames[0].tools), JSON.stringify([...new Set(frames.map((one) => one.tools))]).slice(0, 300))
  await h.mouse.move(4, 4); await wait(600)

  // --- The reader full in the pane: narrower than the note, between two lines, at every size -------------------------
  await sizeTo(0)
  const full = await page()
  await shoot('2-reader-in-the-pane')

  // --- G and g g, as in every list (the user, 15 Nov 2026: "why doesnt G and gg work in reader mode") ----------------
  const scrolled = () => h.evaluate(() => {
    const reader = [...document.querySelectorAll('.web-reader')].find((one) => one.getBoundingClientRect().width > 0)
    let box = reader?.querySelector('.web-reader-body')?.parentElement ?? null
    while (box && box !== reader && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
    return box ? { top: Math.round(box.scrollTop), end: Math.round(box.scrollHeight - box.clientHeight) } : null
  })
  await h.mouse.move(700, 400)
  await h.keyboard.press('Shift+G'); await wait(500)
  const atEnd = await scrolled()
  check('G goes to the end of the article', !!atEnd && atEnd.end > 0 && Math.abs(atEnd.top - atEnd.end) <= 2, JSON.stringify(atEnd))
  await h.keyboard.press('g'); await h.keyboard.press('g'); await wait(500)
  const atTop = await scrolled()
  check('g g goes back to its start', !!atTop && atTop.top === 0, JSON.stringify(atTop))
  check('the reader in the pane the note was in: the lines are there, two, one each side', full?.lines.length === 2, JSON.stringify(full?.lines))
  check(`its words a narrower column than the note's (${noteWords?.chars} characters a line in the note)`, !!full?.words && !!noteWords && full.words.chars <= noteWords.chars - 8, `reader ${full?.words?.chars} over ${full?.words?.lines} lines, note ${noteWords?.chars} over ${noteWords?.lines}`)
  check(`about 60 characters a line (${full?.words?.chars} measured; 55 to 64: a book's measure, where a note runs to about 75)`, full?.words?.chars >= 55 && full?.words?.chars <= 64, JSON.stringify(full?.words))
  /** The drop cap two lines tall: lines one and two start beside it, the same way in, and line three is back at the words'
   *  edge (a range's box does not take the letter's raised size, so the lines it pushes aside are what is measured). */
  const twoTall = (cap) => !!cap?.drop && cap.lines.length === 3 && cap.lines[0].left >= cap.lh / 2 && Math.abs(cap.lines[1].left - cap.lines[0].left) <= 2 && cap.lines[2].left <= 1
  const head = await h.evaluate(() => {
    const kicker = [...document.querySelectorAll('.web-reader-kicker')].find((one) => one.getBoundingClientRect().width > 0)
    const title = [...document.querySelectorAll('.web-reader-heading')].find((one) => one.getBoundingClientRect().width > 0)
    const rule = title && getComputedStyle(title, '::after')
    const words = ([...document.querySelectorAll('.web-reader-body')].find((one) => one.getBoundingClientRect().width > 0)?.textContent ?? '').split(/\s+/).filter((one) => /[\p{L}\p{N}]/u.test(one)).length
    return { text: kicker?.textContent ?? null, upper: kicker && getComputedStyle(kicker).textTransform, spaced: kicker && parseFloat(getComputedStyle(kicker).letterSpacing), above: kicker && title ? kicker.getBoundingClientRect().bottom <= title.getBoundingClientRect().top : false, words, rule: rule && { width: parseFloat(rule.width), height: parseFloat(rule.height), fill: rule.backgroundColor } }
  })
  const minutes = Math.max(1, Math.round(head.words / 238))
  check(`over the title, the site and its minutes to read in spaced capitals ("Probe Times · ${minutes} min read": ${head.words} words at the app's 238 a minute)`, /^Probe Times · \d+ min read$/.test(head.text ?? '') && Math.abs(Number(/(\d+) min/.exec(head.text)?.[1]) - minutes) <= 1 && head.upper === 'uppercase' && head.spaced > 0 && head.above, JSON.stringify(head))
  check('under the title, a short rule', !!head.rule && head.rule.width >= 16 && head.rule.width <= 80 && head.rule.height >= 1 && head.rule.fill !== 'rgba(0, 0, 0, 0)', JSON.stringify(head.rule))
  /** Every line rule at one width and size: [ok, why]. */
  const lined = (got) => {
    if (!got || got.lines.length !== 2) return [false, `lines ${JSON.stringify(got?.lines)}`]
    const [left, right] = [got.lines[0].x, got.lines[1].x]
    const { em } = got.words
    const gutters = [got.words.left - left, right - got.words.right].map((one) => Math.round(one))
    const room = [left - got.frame.x, got.frame.x + got.frame.width - right].map((one) => Math.round(one))
    const ok = got.lines.every((one) => one.width <= 2) && gutters.every((one) => one >= 2 * em) && Math.abs(gutters[0] - gutters[1]) <= 2 && room.every((one) => one >= 12) && got.past.length === 0 && got.frame.scrollX <= 0
    return [ok, `gutters ${gutters} (em ${em}), room to the pane ${room}, line widths ${got.lines.map((one) => one.width)}, past a line: ${got.past.join('; ') || 'none'}, sideways ${got.frame.scrollX}`]
  }
  check('one hairline each side, full height, inside the pane, wide even margins between the words and the lines, nothing past them', lined(full)[0], lined(full)[1])

  for (const steps of SIZES) {
    const label = await sizeTo(steps)
    const got = await page()
    const cap = await h.evaluate(() => window.__cap())
    check(`in the pane at ${label}: the drop cap is two lines tall, the third line back at the edge`, twoTall(cap), JSON.stringify(cap))
    check(`in the pane at ${label}: the same characters a line (${got?.words?.chars} against ${full?.words?.chars})`, Math.abs((got?.words?.chars ?? 0) - full.words.chars) <= 3, JSON.stringify(got?.words))
    // The words' room: lines while the margins fit, else none, and never fewer characters while the pane holds the column.
    const fits = got.frame.width >= got.words.em * 35.5
    check(`in the pane at ${label}: ${fits ? 'the two lines, the margins wide' : 'no room for the margins, so no lines'}`, fits ? lined(got)[0] : got.lines.length === 0, fits ? lined(got)[1] : JSON.stringify(got.lines))
  }
  await sizeTo(0)
  // Larger, filmed a frame every 50ms (QA_SHOTS only): the page steps once to its new size, nothing slides.
  if (shots) {
    await h.click('.web-reader button[aria-label="Larger"]')
    for (let i = 0; i < 6; i++) (await h.screenshot({ path: `${shots}/7-larger-${i}.png` }), await wait(50))
    await sizeTo(0)
  }

  // A wide picture stands wider than the words and inside the lines; Find's marks lit on the page.
  const picture = await h.evaluate(() => {
    const img = [...document.querySelectorAll('.web-reader-body img')].find((one) => one.naturalWidth >= 1000)
    img?.scrollIntoView({ block: 'center' })
    return !!img
  })
  await wait(400)
  const wide = await page()
  const pic = await h.evaluate(() => { const r = [...document.querySelectorAll('.web-reader-body img')].find((one) => one.naturalWidth >= 1000)?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, width: r.width } : null })
  check('a wide picture stands wider than the words, centred on them, and 2.5em or more inside the lines', picture && !!pic && wide?.lines.length === 2 && pic.width >= wide.words.right - wide.words.left + 32 && Math.abs((pic.left + pic.right) / 2 - (wide.words.left + wide.words.right) / 2) <= 2 && pic.left >= wide.lines[0].x + 2.4 * wide.words.em && pic.right <= wide.lines[1].x - 2.4 * wide.words.em, JSON.stringify({ pic, words: wide?.words, lines: wide?.lines }))
  await shoot('3-wide-picture')
  const tableAndCode = await h.evaluate(() => { const body = [...document.querySelectorAll('.web-reader-body')].find((one) => one.getBoundingClientRect().width > 0); return { table: !!body?.querySelector('table'), code: !!body?.querySelector('pre'), word: (body?.textContent ?? '').includes('Pneumonoultramicroscopic') } })
  check('the table, the code and the long word are in the page (so "nothing past a line" covered them)', tableAndCode.table && tableAndCode.code && tableAndCode.word, JSON.stringify(tableAndCode))
  await h.click('.web-reader-body p'); await h.keyboard.press('Meta+f'); await wait(300)
  // The article's first words, the drop cap's letter among them: lit as one find (the letter stays a letter).
  await h.keyboard.type('You will rejoice'); await wait(500)
  const lit = await h.evaluate(() => {
    const reader = [...document.querySelectorAll('.web-reader')].find((one) => one.getBoundingClientRect().width > 0)
    const name = /::highlight\((web\w+)-mark\)/.exec(reader?.querySelector('style')?.textContent ?? '')?.[1]
    const now = name ? [...(CSS.highlights.get(`${name}-found-now`) ?? [])][0] : null
    const first = reader?.querySelector('.web-reader-body > p')
    return { count: reader?.querySelector('.tiptap-find-bar-count')?.getAttribute('aria-label'), at: now ? now.startOffset : null, inFirst: !!now && !!first?.contains(now.startContainer), words: now?.toString() ?? null }
  })
  check('Find lights the first words, the drop cap\'s letter with them', /^1 of 2$/.test(lit.count ?? '') && lit.inFirst && lit.at === 0 && lit.words === 'You will rejoice', JSON.stringify(lit))
  await shoot('4-find-lit')
  await h.keyboard.press('Escape'); await wait(300)

  // The lines in every look, light and dark: there, and faint.
  for (const [theme, style] of [['paper', 'soft'], ['light', 'soft'], ['dark', 'soft'], ['dark', 'paper'], ['paper', 'brutal']]) {
    await h.evaluate(([t, s]) => { localStorage.setItem('theme', t); localStorage.setItem('style', s); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, [theme, style])
    await wait(900)
    const got = await page()
    const contrast = got?.lines.length ? await h.evaluate(([a, b]) => window.__contrast(a, b), [got.lines[0].colour, got.page]) : 0
    const accent = await h.evaluate((page) => {
      const kicker = [...document.querySelectorAll('.web-reader-kicker')].find((one) => one.getBoundingClientRect().width > 0)
      const p = [...document.querySelectorAll('.web-reader-body > p[data-drop]')].find((one) => one.getBoundingClientRect().width > 0)
      const head = kicker && window.__rgb(getComputedStyle(kicker).color)
      return { head, cap: p && window.__rgb(getComputedStyle(p, '::first-letter').color), contrast: head ? window.__contrast(head, page) : 0 }
    }, got.page)
    check(`${theme}${style === 'soft' ? '' : ` (${style} style)`}: the site line and the drop cap in the accent, readable (${accent.contrast}:1, 4.5:1 or more)`, accent.contrast >= 4.5 && accent.cap?.join() === accent.head?.join(), JSON.stringify(accent))
    check(`${theme}${style === 'soft' ? '' : ` (${style} style)`}: the two lines are there, faint against the page (${contrast}:1, under 1.6:1)`, got?.lines.length === 2 && contrast > 1.02 && contrast < 1.6, `${JSON.stringify(got?.lines)} on ${got?.page}, ${contrast}:1`)
  }
  await h.evaluate(() => { localStorage.setItem('theme', 'paper'); localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) })
  await wait(600)

  // --- Beside the note: half a split ---------------------------------------------------------------------------------
  await h.keyboard.press('Meta+['); await wait(900)
  check('Back puts the note in the pane again', await until(() => h.evaluate((n) => !![...document.querySelectorAll(`[data-open="${n}"]`)].find((one) => one.getBoundingClientRect().width > 0), note)))
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href, how: 'aside' } })), LETTERS)
  await until(() => h.evaluate((n) => [...document.querySelectorAll('.web-reader-body p')].some((one) => one.getBoundingClientRect().width > 0) && !!document.querySelector(`[data-open="${n}"]`), note))
  await h.mouse.move(4, 4); await wait(800)
  for (const steps of SIZES) {
    const label = await sizeTo(steps)
    const got = await page()
    const fits = got.frame.width >= got.words.em * 35.5
    const holds = got.frame.width >= got.words.em * 28.5 + 48
    check(`beside the note at ${label} (pane ${Math.round(got.frame.width)}px): ${fits ? 'the two lines' : 'no room for the margins, so no lines'}${holds ? ', the words unsqueezed' : ''}`, (fits ? lined(got)[0] : got.lines.length === 0) && (!holds || Math.abs(got.words.chars - full.words.chars) <= 3), `${fits ? lined(got)[1] : JSON.stringify(got.lines)}; ${got.words.chars} characters a line`)
    // Its top, where the site, the title's rule and the drop cap are, beside the note.
    if (steps === 0) (await h.evaluate(() => { const box = [...document.querySelectorAll('.web-reader-scroll')].find((one) => one.getBoundingClientRect().width > 0); if (box) box.scrollTop = 0 }), await wait(300), await shoot('5-reader-beside-the-note'))
  }
  await sizeTo(0)
  // Beside the note the margins are narrow: the wide picture keeps 2.5em clear of each line, or keeps to the words.
  await h.evaluate(() => [...document.querySelectorAll('.web-reader-body img')].find((one) => one.naturalWidth >= 1000 && one.getBoundingClientRect().width > 0)?.scrollIntoView({ block: 'center' }))
  await wait(400)
  const besidePic = await page()
  const bp = await h.evaluate(() => { const r = [...document.querySelectorAll('.web-reader-body img')].find((one) => one.naturalWidth >= 1000 && one.getBoundingClientRect().width > 0)?.getBoundingClientRect(); return r ? { left: Math.round(r.left), right: Math.round(r.right) } : null })
  const clear = besidePic?.lines.length === 2 && bp ? Math.round(Math.min(bp.left - besidePic.lines[0].x, besidePic.lines[1].x - bp.right)) : null
  check('beside the note, a wide picture keeps 2.5em clear of each line (or keeps to the words)', !!bp && !!besidePic && ((bp.left >= besidePic.words.left - 1 && bp.right <= besidePic.words.right + 1) || (clear !== null && clear >= 2.4 * besidePic.words.em)), JSON.stringify({ bp, clear, lines: besidePic?.lines.map((one) => one.x), words: besidePic && [besidePic.words.left, besidePic.words.right, besidePic.words.em] }))
  await shoot('5-wide-picture-beside-the-note')

  // --- The smallest window, 560 x 400 --------------------------------------------------------------------------------
  await c.size(560, 400); await wait(900)
  const small = await page()
  check('in the smallest window: no lines, the words take the room, nothing sideways', !!small && small.lines.length === 0 && small.frame.scrollX <= 0 && small.words.right - small.words.left >= 250, JSON.stringify({ lines: small?.lines, words: small?.words, frame: small?.frame }))
  await shoot('6-smallest-window')

  // A front page calling itself only "Home" is named by its first heading: in the reader, its bar and Recent.
  await c.size(1500, 900); await wait(600)
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), FRONT)
  await until(() => h.evaluate(() => [...document.querySelectorAll('.web-reader-heading')].some((one) => one.getBoundingClientRect().width > 0 && one.textContent !== 'Letters from the North')))
  await h.waitForFunction((href) => !!document.querySelector(`[data-side-recent-row="${href}"]`), FRONT, { timeout: 5000 }).catch(() => {})
  const named = await h.evaluate((href) => ({
    heading: [...document.querySelectorAll('.web-reader-heading')].find((one) => one.getBoundingClientRect().width > 0)?.textContent ?? null,
    bar: [...document.querySelectorAll('.web-reader .pdf-reader-title')].find((one) => one.getBoundingClientRect().width > 0)?.textContent ?? null,
    recent: document.querySelector(`[data-side-recent-row="${href}"]`)?.textContent ?? null,
    twice: [...document.querySelectorAll('.web-reader-body :is(h1, h2, h3)')].filter((one) => one.getBoundingClientRect().width > 0 && one.textContent === 'The Arctic Letters').length
  }), FRONT)
  check('a page whose titles say only "Home" is named by its first heading: in the reader, its bar and Recent', named.heading === 'The Arctic Letters' && named.bar === 'The Arctic Letters' && named.recent === 'The Arctic Letters', JSON.stringify(named))
  check('…and that heading is not shown again under the title', named.twice === 0, JSON.stringify(named))
  // A link card to the same page is named the same way (the one naming, article-names.ts).
  const card = await h.evaluate((href) => window.api.fetchLinkMetadata(href).then((one) => one.title), FRONT)
  check('…and a link card to that page says the same name', card === 'The Arctic Letters', String(card))
  // Two paragraphs, far shorter than the pane: the lines still run from the bar to the foot.
  await h.mouse.move(4, 4); await wait(500)
  const short = await page()
  check('a short article: the two lines still run the scroll area\'s whole height', lined(short)[0], lined(short)[1])
  await shoot('8-short-article')
  // No drop cap where the article opens on a picture, a heading, a quote mark, a number or a link's words.
  for (const kind of Object.keys(OPENS)) {
    await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), `${SITE}/opens-${kind.replace(/\W+/g, '-')}`)
    await until(() => h.evaluate((title) => [...document.querySelectorAll('.web-reader-heading')].some((one) => one.getBoundingClientRect().width > 0 && one.textContent === title), `Opens with ${kind}`))
    await wait(300)
    const cap = await h.evaluate(() => window.__cap())
    check(`an article opening with ${kind}: no drop cap`, !cap.drop && (cap.lines.length < 2 || cap.lines[1].left <= 1), JSON.stringify(cap))
  }
  await shoot('9-no-drop-cap-after-a-link')
  check('no page errors', c.errors.filter((one) => !/favicon|net::|Failed to load resource/i.test(one)).length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).slice(0, 500))
} finally {
  await c.close?.()
  done()
}
