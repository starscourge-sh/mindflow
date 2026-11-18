// Selection in both readers is forgiving, as in Apple's apps: a drag that starts off the words (the margin beside a
// paragraph, the gap between paragraphs, just past a line's end, the desk beside the page) begins at the nearest
// word; nothing the reader draws over the words (a link's arrow, a footnote mark, a highlight) eats the start of a
// drag; a click that moves a hair is still a click; a double-click picks a word and a drag after it grows by words;
// ⇧-click extends; a drag past the column's edge stops at the line's end; a drag past the pane's edge scrolls.
// Real pointer input throughout, and each line reads back the words the drag picked.
//   QA_DATA=<a sandbox copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/forgiving-select.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SITE = 'https://93.184.216.34'
const ESSAY = `${SITE}/forgiving`
const words = (n) => `Paragraph ${n} walks slowly through the orchard, naming each pear and plum tree and the light that falls between their leaves, so that a reader has several whole lines of words to pick from here and not a scrap.`
const html = `<html><head><title>The Forgiving Essay | Probe Times</title><meta property="og:site_name" content="Probe Times"></head><body><article>
  <h1>The Forgiving Essay</h1><p class="byline">By Ada Probe</p>
  <p>The first paragraph holds <a href="https://example.org/far">a link out of the app</a> in its words, then a footnote mark<sup class="reference"><a href="${ESSAY}#cite_note-1">[1]</a></sup> after a phrase, and then it goes on long enough to wrap across several lines of the column.</p>
  ${Array.from({ length: 14 }, (_, n) => `<p>${n === 3 ? words(n + 2).replace('naming each', 'naming<sup class="reference"><a href="${ESSAY}#cite_note-2">[2]</a></sup> each') : words(n + 2)}</p>`).join('\n')}
  <ol class="references"><li id="cite_note-1">The footnote itself.</li></ol></article></body></html>`

/** A book of three pages: page 1 has three paragraphs (each line its own run of words, starting with a tree's name), a footnote mark, and room around them. */
const LINES = [
  ['Amber light falls across the reading room while the clock keeps its slow time,', 'Aspen leaves turn over in the yard and the pages wait for a careful hand to', 'Alder roots hold the bank of the river where the old mill stood for years.'],
  ['Birch bark peels in thin sheets.', 'Beech nuts gather under the hedge where the children used to play at dusk and', 'Box hedges line the path to the gate, trimmed square every spring by hand so', 'Bay windows look out over the water and catch the last of the evening sun.'],
  ['Cedar chests keep the winter coats safe from the moths and the damp air of the', 'Cherry blossom drifts across the lane in April and settles on the parked cars', 'Chestnut cases split open in the autumn wind and scatter their shining seeds,', 'Cypress trees stand dark against the hills like a row of quiet sentinels now.']
]
const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Forgiving Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 3; n++) {
    const page = pdf.addPage([612, 792])
    if (n > 1) {
      for (let line = 0; line < 40; line++) page.drawText(`Page ${n}, line ${line + 1}: more words to read on and on down the page.`, { x: 72, y: 720 - line * 16, size: 12, font })
      continue
    }
    page.drawText('The Forgiving Book', { x: 72, y: 720, size: 18, font })
    let y = 680
    for (const para of LINES) {
      for (const line of para) {
        // The footnote mark: a small raised 1 after "bank", its own run, as a book sets one.
        if (line.startsWith('Alder')) {
          const head = 'Alder roots hold the bank'
          page.drawText(head, { x: 72, y, size: 12, font })
          const at = 72 + font.widthOfTextAtSize(head, 12)
          page.drawText('1', { x: at + 0.5, y: y + 5, size: 7, font })
          page.drawText(line.slice(head.length), { x: at + 5, y, size: 12, font })
        } else page.drawText(line, { x: 72, y, size: 12, font })
        y -= 16
      }
      y -= 22
    }
  }
  return Array.from(await pdf.save())
}

const { check, done } = checks()
// Under the width where a PDF on its own opens with both sides (pdf-reader.tsx BOTH_SIDES), so the desk shows beside its page.
const c = await sandbox({ width: 1390, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const clear = () => h.evaluate(() => getSelection().removeAllRanges())
const picked = () => h.evaluate(() => getSelection().toString())
/** A drag filmed in light and dark: a frame as it is pressed and after each of five moves, of the part of the window round it. */
const film = async (name, from, to) => {
  const clip = { x: Math.max(0, Math.min(from.x, to.x) - 80), y: Math.max(0, Math.min(from.y, to.y) - 60), width: Math.abs(to.x - from.x) + 260, height: Math.abs(to.y - from.y) + 120 }
  for (const look of ['light', 'dark']) {
    await c.look(look)
    await clear()
    await h.mouse.move(from.x, from.y)
    await h.mouse.down()
    await h.screenshot({ path: `${shots}/${name}-${look}-0.png`, clip })
    for (let n = 1; n <= 5; n++) {
      await h.mouse.move(from.x + ((to.x - from.x) * n) / 5, from.y + ((to.y - from.y) * n) / 5, { steps: 2 })
      await wait(50)
      await h.screenshot({ path: `${shots}/${name}-${look}-${n}.png`, clip })
    }
    await h.mouse.up()
  }
  await c.look('light')
  await clear()
}
/** A press at `from`, moved to `to` in steps as a hand moves, and let go: the words it picked. */
const drag = async (from, to, steps = 12) => {
  await clear()
  await h.mouse.move(from.x, from.y)
  await h.mouse.down()
  await h.mouse.move(to.x, to.y, { steps })
  await h.mouse.up()
  await wait(120)
  return picked()
}
/** Where the selection starts against a place in the text: -1 before it, 0 at it, 1 after it. */
const startAgainst = (where) => h.evaluate((where) => {
  const s = getSelection()
  if (!s.rangeCount || s.isCollapsed) return null
  const r = s.getRangeAt(0)
  const at = window.__places?.[where]
  if (!at) return null
  const one = document.createRange()
  one.setStart(at.node, at.offset)
  return r.compareBoundaryPoints(Range.START_TO_START, one)
}, where)
const flat = (text) => text.replace(/\s+/g, ' ').trim()
/** The middle of the `n`th letter of `text` inside the first of `selector` holding it: a move of a hair across it picks that letter. */
const letterMid = (selector, text, n) => h.evaluate(([selector, text, n]) => {
  for (const el of document.querySelectorAll(selector)) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      const at = node.data.indexOf(text)
      if (at < 0) continue
      const r = document.createRange()
      r.setStart(node, at + n - 1)
      r.setEnd(node, at + n)
      const b = r.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    }
  }
  return null
}, [selector, text, n])
/** A press that moves 3px across a letter's middle, and lets go. */
const hair = async (at) => { await h.mouse.move(at.x - 1.5, at.y); await h.mouse.down(); await h.mouse.move(at.x + 1.5, at.y, { steps: 2 }); await h.mouse.up(); await wait(200) }
/** Whether the words picked now offer "Keep as a gem" on a right-click, as words picked on the words do. */
const keepOffered = async () => {
  const at = await h.evaluate(() => { const s = getSelection(); const b = s.rangeCount ? [...s.getRangeAt(0).getClientRects()].find((one) => one.width > 4) : null; return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null })
  if (!at) return false
  await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(400)
  const offered = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].some((one) => one.textContent.trim().startsWith('Keep as a gem')))
  await h.keyboard.press('Escape'); await wait(250)
  return offered
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  await electron.evaluate((_, [site, page]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      return new URL(url).pathname === '/forgiving' ? new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('', { status: 404 })
    }
  }, [SITE, html])
  // A highlight already in the essay and in the book: starting a drag on one picks words, as anywhere.
  await v('pdf:highlight', ESSAY, { id: 'mark-web', page: 0, quote: 'naming each pear and plum tree', start: 0, end: 0, prefix: 'Paragraph 3 walks slowly through the orchard, ', suffix: ' and the light', gemId: null, color: null })
  await h.evaluate(() => (window.__opened = [], (window.open = (to) => (window.__opened.push(String(to)), null))))

  // ---- The web reader ----
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), ESSAY)
  await h.waitForSelector('.web-reader-body p', { timeout: 15000 }).catch(() => {})
  await wait(800)
  // Each paragraph's lines, as the column wraps them: their boxes, and the text place at each line's start and end.
  const webLines = (n) => h.evaluate((n) => {
    const p = document.querySelectorAll('.web-reader-body > p')[n]
    const range = document.createRange()
    range.selectNodeContents(p)
    const rows = []
    for (const r of range.getClientRects()) {
      if (!r.width) continue
      const row = rows.find((one) => r.top + r.height / 2 > one.top && r.top + r.height / 2 < one.bottom)
      if (row) (row.left = Math.min(row.left, r.left), (row.right = Math.max(row.right, r.right)))
      else rows.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })
    }
    return rows.map((one) => ({ ...one, mid: (one.top + one.bottom) / 2 }))
  }, n)
  const keepPlace = (name, x, y) => h.evaluate(([name, x, y]) => {
    const at = document.caretPositionFromPoint(x, y)
    window.__places ??= {}
    window.__places[name] = at ? { node: at.offsetNode, offset: at.offset } : null
    return at ? at.offsetNode.textContent.slice(at.offset, at.offset + 24) : null
  }, [name, x, y])
  const box = await h.evaluate(() => {
    const r = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b ? { left: b.left, right: b.right, top: b.top, bottom: b.bottom } : null }
    return { body: r('.web-reader-body'), column: r('.web-reader-column'), scroll: r('.web-reader-scroll'), sup: r('.web-reader-body sup'), link: (() => { const a = [...document.querySelectorAll('.web-reader-body a[href^="http"]')].find((one) => /link out/.test(one.textContent)); const rs = a ? [...a.getClientRects()] : []; const last = rs.at(-1); return last ? { left: last.left, right: last.right, top: last.top, bottom: last.bottom } : null })() }
  })
  const p2 = await webLines(2)
  const p1 = await webLines(1)
  const p0 = await webLines(0)
  console.log(`(web: column ${Math.round(box.column?.left)} to ${Math.round(box.column?.right)}, words ${Math.round(box.body?.left)} to ${Math.round(box.body?.right)}, paragraph 2 has ${p2.length} lines, footnote mark ${box.sup ? 'drawn' : 'missing'}, link arrow ${box.link ? 'drawn' : 'missing'})`)

  // The margin beside a paragraph, level with its second line: the drag starts at that line's start.
  const lineStart = await keepPlace('web-margin', p2[1].left + 0.5, p2[1].mid)
  let got = await drag({ x: (box.column.left + box.body.left) / 2, y: p2[1].mid }, { x: p2[2].left + 120, y: p2[2].mid })
  check('web: a drag from the margin beside a paragraph picks from its line\'s start', (await startAgainst('web-margin')) === 0 && flat(got).startsWith(flat(lineStart).slice(0, 12)), `picked "${flat(got).slice(0, 60)}", the line starts "${lineStart}"`)
  check('web: words picked from the margin offer "Keep as a gem", as words picked on the words do', await keepOffered())
  await film('rs1-web-margin', { x: (box.column.left + box.body.left) / 2, y: p2[1].mid }, { x: p2[2].left + 120, y: p2[2].mid })

  // The gap between two paragraphs: the drag starts in the line above it or at the start of the one below.
  await keepPlace('web-gap-above', p1.at(-1).left + 0.5, p1.at(-1).mid)
  const belowStart = await keepPlace('web-gap-below', p2[0].left + 0.5, p2[0].mid)
  got = await drag({ x: box.body.left + 60, y: (p1.at(-1).bottom + p2[0].top) / 2 }, { x: p2[1].left + 100, y: p2[1].mid })
  const gapStart = [await startAgainst('web-gap-above'), await startAgainst('web-gap-below')]
  check('web: a drag from the gap between paragraphs picks from the nearest line', gapStart[0] >= 0 && gapStart[1] <= 0 && flat(got).includes(flat(belowStart).slice(0, 12)), `picked "${flat(got).slice(0, 60)}", against the lines ${JSON.stringify(gapStart)}`)

  // Just past a line's end: the drag starts at that line's end.
  await keepPlace('web-end', p2[1].left + 0.5, p2[1].mid)
  got = await drag({ x: Math.min(box.body.right - 2, p2[0].right + 12), y: p2[0].mid }, { x: p2[1].left + 80, y: p2[1].mid })
  check('web: a drag from just past a line\'s end picks from that line\'s end', got.length > 0 && got.length < 60 && (await startAgainst('web-end')) <= 0 && flat(got).startsWith(flat(lineStart).slice(0, 8)), `picked "${flat(got).slice(0, 60)}"`)

  // The desk beside the page, outside its lines: the drag starts at the line's start, level with it.
  const deskStart = await keepPlace('web-desk', p1[1].left + 0.5, p1[1].mid)
  got = await drag({ x: box.column.left - 30, y: p1[1].mid }, { x: p1[2].left + 90, y: p1[2].mid })
  check('web: a drag from the desk beside the page picks from the line beside it', (await startAgainst('web-desk')) === 0 && flat(got).startsWith(flat(deskStart).slice(0, 12)), `picked "${flat(got).slice(0, 60)}", the line starts "${deskStart}"`)

  // A link's arrow out: a drag that starts on it picks words and follows nothing.
  if (box.link) {
    const opened = await h.evaluate(() => window.__opened.length)
    got = await drag({ x: box.link.right - 3, y: (box.link.top + box.link.bottom) / 2 }, { x: box.link.right + 140, y: (box.link.top + box.link.bottom) / 2 + 2 })
    check('web: a drag that starts on a link\'s arrow picks the words after it', got.trim().length > 4 && (await h.evaluate(() => window.__opened.length)) === opened, `picked "${flat(got).slice(0, 60)}"`)
  } else check('web: the link\'s arrow is drawn', false, 'no link in the article')
  // A footnote mark: a drag that starts on it picks from it on.
  if (box.sup) {
    // Each drag goes from the mark onto the words after it, level with their middle (above them is the mark's own raised line).
    const after = await letterMid('.web-reader-body > p:nth-of-type(1)', ' after a phrase', 5)
    got = await drag({ x: (box.sup.left + box.sup.right) / 2, y: (box.sup.top + box.sup.bottom) / 2 }, { x: after.x + 60, y: after.y })
    const under = await h.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); const at = document.caretPositionFromPoint(x, y); return `${el?.tagName}.${el?.className} select ${el && getComputedStyle(el).userSelect}, caret in "${at?.offsetNode?.textContent?.slice(0, 12)}" at ${at?.offset}, ${document.querySelector('.web-reader-body sup')?.outerHTML.slice(0, 120)}` }, [(box.sup.left + box.sup.right) / 2, (box.sup.top + box.sup.bottom) / 2])
    check('web: a drag that starts on a footnote mark picks from it', /^1?\]? *after a ph/.test(flat(got)), `picked "${flat(got).slice(0, 60)}"; under the press: ${under}`)
    // The second mark, in a plain paragraph; and the first paragraph's own words, beside its drop cap.
    const second = await h.evaluate(() => { const r = document.querySelectorAll('.web-reader-body sup')[1]?.getBoundingClientRect(); return r ? { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 } : null })
    const each = await letterMid('.web-reader-body > p:nth-of-type(5)', ' each pear', 4)
    got = second && each ? await drag(second, { x: each.x + 60, y: each.y }) : ''
    const opening = await letterMid('.web-reader-body > p', 'holds', 2)
    const own = await drag(opening, { x: opening.x + 120, y: opening.y })
    check('web: a drag from a footnote mark in a plain paragraph picks from it too; the opening paragraph\'s own words pick', /each pe/.test(got) && /lds a link/.test(own), `picked "${flat(got).slice(0, 40)}" / "${flat(own).slice(0, 40)}"`)
  } else check('web: the footnote mark is drawn', false, 'no sup in the article')
  // A highlight: a drag that starts on its words picks words.
  const markBox = await h.evaluate(() => { const name = /::highlight\((web\w+)-mark\)/.exec(document.querySelector('.web-reader style')?.textContent ?? '')?.[1]; const range = name && [...(CSS.highlights.get(`${name}-mark`) ?? [])][0]; const r = range?.getClientRects()[0]; return r ? { left: r.left, right: r.right, mid: (r.top + r.bottom) / 2 } : null })
  if (markBox) {
    got = await drag({ x: markBox.left + 30, y: markBox.mid }, { x: markBox.right - 10, y: markBox.mid })
    check('web: a drag that starts on a highlight picks its words', flat(got).length >= 4 && 'naming each pear and plum tree'.includes(flat(got)), `picked "${flat(got).slice(0, 60)}"`)
  } else check('web: the highlight is drawn', false, 'no highlight')

  // A click that moves a hair is a click: nothing picked, and a link so clicked opens.
  await clear()
  await hair(await letterMid('.web-reader-body > p', 'pear and plum', 2))
  const hairWeb = await picked()
  const linkWord = await letterMid('.web-reader-body a', 'link out', 3)
  const before = await h.evaluate(() => window.__opened.length)
  if (linkWord) await hair(linkWord)
  const followed = (await h.evaluate(() => window.__opened.length)) - before
  check('web: a click that moves a hair picks nothing, and on a link it opens the link', hairWeb === '' && followed === 1, `picked "${hairWeb}", link opened ${followed} times`)

  // Double-click picks a word; the drag after it grows by whole words; ⇧-click extends.
  await clear()
  const wordAt = await h.evaluate(([x, y]) => {
    const at = document.caretPositionFromPoint(x, y)
    const text = at.offsetNode.data
    let i = at.offset
    while (i < text.length && /\w/.test(text[i])) i++
    while (i < text.length && !/\w/.test(text[i])) i++
    let j = i
    while (j < text.length && /\w/.test(text[j])) j++
    const r = document.createRange()
    r.setStart(at.offsetNode, i)
    r.setEnd(at.offsetNode, j)
    const b = r.getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, word: text.slice(i, j) }
  }, [p2[1].left + 0.5, p2[1].mid])
  await h.mouse.dblclick(wordAt.x, wordAt.y); await wait(120)
  const oneWord = await picked()
  await clear()
  await h.mouse.move(wordAt.x, wordAt.y); await h.mouse.down(); await h.mouse.up(); await h.mouse.down({ clickCount: 2 })
  await h.mouse.move(p2[2].left + 45, p2[2].mid, { steps: 10 }); await h.mouse.up(); await wait(120)
  const byWords = await picked()
  const wholeWords = await h.evaluate(() => { const s = getSelection(); const r = s.getRangeAt(0); const a = r.startContainer.textContent, b = r.endContainer.textContent; return !/\w/.test(a[r.startOffset - 1] ?? ' ') && !/\w/.test(b[r.endOffset] ?? ' ') })
  check('web: double-click picks a word, and the drag after it grows by whole words', oneWord.trim() === wordAt.word && wholeWords && flat(byWords).split(' ').length >= 3, `"${oneWord}" then "${flat(byWords).slice(0, 50)}"`)
  await clear()
  await h.mouse.click(wordAt.x, wordAt.y, { clickCount: 3 }); await wait(120)
  const webPara = await picked()
  const webWhole = await h.evaluate(() => document.querySelectorAll('.web-reader-body > p')[2].textContent)
  await clear()
  await h.mouse.click((box.column.left + box.body.left) / 2, p2[1].mid, { clickCount: 2 }); await wait(120)
  const marginWord = await picked()
  check('web: triple-click picks the paragraph; double-click in the margin picks the word beside it', flat(webPara) === flat(webWhole) && flat(marginWord) === flat(lineStart).match(/^\w+/)?.[0], `"${flat(webPara).slice(0, 40)}…" / "${marginWord}"`)
  await clear()
  await h.mouse.dblclick(wordAt.x, wordAt.y); await wait(80)
  await h.keyboard.down('Shift'); await h.mouse.click(p2[2].left + 150, p2[2].mid); await h.keyboard.up('Shift'); await wait(120)
  const extended = await picked()
  check('web: ⇧-click extends the selection', flat(extended).startsWith(flat(oneWord)) && flat(extended).split(' ').length >= 5, `"${flat(extended).slice(0, 60)}"`)
  await clear()
  await h.mouse.dblclick(wordAt.x, wordAt.y); await wait(80)
  await h.keyboard.down('Shift'); await h.mouse.click((box.column.left + box.body.left) / 2, p2[2].mid); await h.keyboard.up('Shift'); await wait(120)
  const extendedToMargin = await picked()
  check('web: ⇧-click in the margin extends to the line beside it', flat(extendedToMargin).startsWith(flat(oneWord)) && flat(extendedToMargin).length > flat(oneWord).length, `"${flat(extendedToMargin).slice(0, 60)}"`)

  // Past the column's edge: the selection keeps to the line's end.
  const lineEnd = await h.evaluate(([x, y]) => { const at = document.caretPositionFromPoint(x, y); return at ? at.offsetNode.textContent.slice(Math.max(0, at.offset - 12), at.offset) : '' }, [p2[1].right - 0.5, p2[1].mid])
  got = await drag({ x: p2[1].left + 40, y: p2[1].mid }, { x: box.column.right + 60, y: p2[1].mid + 3 })
  check('web: a drag past the column\'s edge keeps to the line\'s end', flat(got).endsWith(flat(lineEnd).slice(-6)) && !got.includes('\n') && flat(got).length < 120, `picked "…${flat(got).slice(-40)}", the line ends "${lineEnd}"`)

  // Past the pane's bottom edge: the page scrolls and the selection follows, from words and from the margin alike.
  for (const from of ['words', 'margin']) {
    await clear()
    await h.evaluate(() => (document.querySelector('.web-reader-scroll').scrollTop = 0))
    await wait(150)
    const scroll = await h.evaluate(() => { const s = document.querySelector('.web-reader-scroll'); const r = s.getBoundingClientRect(); return { top: s.scrollTop, bottom: r.bottom, inner: innerHeight } })
    const lines = await webLines(3)
    const start = { x: from === 'words' ? lines[0].left + 40 : (box.column.left + box.body.left) / 2, y: lines[0].mid }
    await h.mouse.move(start.x, start.y); await h.mouse.down()
    await h.mouse.move(start.x + 60, scroll.bottom - 4, { steps: 6 })
    for (let n = 0; n < 12; n++) { await h.mouse.move(start.x + 60 + (n % 2), Math.min(scroll.inner + 30, scroll.bottom + 30), { steps: 1 }); await wait(60) }
    await h.mouse.up(); await wait(150)
    const after = await h.evaluate(() => document.querySelector('.web-reader-scroll').scrollTop)
    const long = await picked()
    check(`web: a drag from the ${from} past the pane's bottom edge scrolls, and picks on`, after > scroll.top + 40 && flat(long).length > 200, `scrolled ${Math.round(after - scroll.top)}px, picked ${flat(long).length} characters`)
  }
  await clear()

  // ---- The PDF reader ----
  await h.evaluate(() => localStorage.setItem('pdf-rail', ''))
  const src = await h.evaluate(async (bytes) => window.api.saveFile('forgiving-book.pdf', new Uint8Array(bytes)), await makePdf())
  await v('pdf:highlight', src, { id: 'mark-pdf', page: 1, quote: 'Cherry blossom drifts across the lane', start: 0, end: 0, gemId: null, color: null })
  await h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'forgiving-book.pdf' } })), src)
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(1200)
  const measure = () => h.evaluate(() => {
    const layer = document.querySelector('.pdf-reader .pdf-page[data-page="1"] .textLayer')
    const sheet = layer?.closest('.pdf-page')?.getBoundingClientRect()
    const spans = [...(layer?.querySelectorAll('span') ?? [])].filter((one) => one.textContent && !one.querySelector('span'))
    window.__runs = spans
    return { sheet: sheet && { left: sheet.left, right: sheet.right, top: sheet.top, bottom: sheet.bottom }, spans: spans.map((one) => { const r = one.getBoundingClientRect(); return { text: one.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, mid: (r.top + r.bottom) / 2 } }) }
  })
  let runs = await measure()
  const run = (start) => runs.spans.findIndex((one) => one.text.startsWith(start))
  const at = (start) => runs.spans[run(start)]
  /** The text place at the start (or end) of a run of words, kept to compare the selection against. */
  const pdfPlace = (name, start, end = false) => h.evaluate(([name, index, end]) => {
    const node = [...window.__runs[index].childNodes].find((one) => one.nodeType === 3)
    window.__places ??= {}
    window.__places[name] = { node, offset: end ? node.data.length : 0 }
  }, [name, run(start), end])
  console.log(`(pdf: page 1 from ${Math.round(runs.sheet?.left)} to ${Math.round(runs.sheet?.right)}, ${runs.spans.length} runs of words${at('Box') ? '' : ', no line starting "Box"'})`)
  if (!at('Box')) throw new Error(`the book's words are not laid as expected: ${runs.spans.map((one) => one.text.slice(0, 12)).join(' | ')}`)

  await pdfPlace('pdf-margin', 'Box')
  got = await drag({ x: (runs.sheet.left + at('Box').left) / 2, y: at('Box').mid }, { x: at('Bay').left + 120, y: at('Bay').mid })
  check('pdf: a drag from the page\'s margin beside a line picks from that line\'s start', (await startAgainst('pdf-margin')) === 0 && flat(got).startsWith('Box hedges'), `picked "${flat(got).slice(0, 60)}"`)
  check('pdf: words picked from the margin offer "Keep as a gem", as words picked on the words do', await keepOffered())
  await film('rs1-pdf-margin', { x: (runs.sheet.left + at('Box').left) / 2, y: at('Box').mid }, { x: at('Bay').left + 120, y: at('Bay').mid })

  await pdfPlace('pdf-gap-above', 'Alder')
  await pdfPlace('pdf-gap-below', 'Birch')
  got = await drag({ x: at('Birch').left + 60, y: (at('Alder').bottom + at('Birch').top) / 2 }, { x: at('Beech').left + 100, y: at('Beech').mid })
  const pdfGap = [await startAgainst('pdf-gap-above'), await startAgainst('pdf-gap-below')]
  check('pdf: a drag from the gap between paragraphs picks from the nearest line', pdfGap[0] >= 0 && pdfGap[1] <= 0 && flat(got).includes('Birch bark') && !flat(got).includes('Amber'), `picked "${flat(got).slice(0, 70)}", against the lines ${JSON.stringify(pdfGap)}`)

  await pdfPlace('pdf-end', 'Birch', true)
  got = await drag({ x: at('Birch').right + 40, y: at('Birch').mid }, { x: at('Beech').left + 80, y: at('Beech').mid })
  check('pdf: a drag from just past a line\'s end picks from that line\'s end', (await startAgainst('pdf-end')) === 0 && flat(got).startsWith('Beech') && flat(got).length < 40, `picked "${flat(got).slice(0, 60)}"`)

  await pdfPlace('pdf-desk', 'Cherry')
  got = await drag({ x: runs.sheet.left - 14, y: at('Cherry').mid }, { x: at('Chestnut').left + 90, y: at('Chestnut').mid })
  check('pdf: a drag from the desk beside the page picks from the line beside it', (await startAgainst('pdf-desk')) === 0 && flat(got).startsWith('Cherry blossom'), `picked "${flat(got).slice(0, 60)}"`)

  const markRect = await h.evaluate(() => { const r = document.querySelector('.pdf-reader .pdf-mark')?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, mid: (r.top + r.bottom) / 2 } : null })
  if (markRect) {
    got = await drag({ x: markRect.left + 40, y: markRect.mid }, { x: markRect.right - 8, y: markRect.mid })
    check('pdf: a drag that starts on a highlight picks its words', /blossom|drifts|across/.test(got) && flat(got).length > 10, `picked "${flat(got).slice(0, 60)}"`)
  } else check('pdf: the highlight is drawn', false, 'no .pdf-mark')
  const mark1 = at('1')
  if (mark1) {
    got = await drag({ x: (mark1.left + mark1.right) / 2, y: mark1.mid }, { x: mark1.right + 100, y: at('Alder').mid })
    check('pdf: a drag that starts on a footnote mark picks from it', /of the river/.test(got) && !/Amber|Aspen/.test(got), `picked "${flat(got).slice(0, 60)}"`)
  } else check('pdf: the footnote mark is laid as its own run', false, runs.spans.map((one) => one.text.slice(0, 8)).join('|'))

  await clear()
  await hair(await letterMid('.pdf-reader .pdf-page[data-page="1"] .textLayer span', 'Beech nuts', 3))
  const hairPdf = await picked()
  await h.mouse.move((runs.sheet.left + at('Beech').left) / 2, at('Beech').mid); await h.mouse.down(); await h.mouse.move((runs.sheet.left + at('Beech').left) / 2 + 3, at('Beech').mid, { steps: 2 }); await h.mouse.up(); await wait(150)
  const hairMargin = await picked()
  check('pdf: a click that moves a hair picks nothing, on the words or beside them', hairPdf === '' && hairMargin === '', `"${hairPdf}" / "${hairMargin}"`)

  await clear()
  const pdfWord = { x: at('Beech').left + 80, y: at('Beech').mid }
  await h.mouse.dblclick(pdfWord.x, pdfWord.y); await wait(120)
  const pdfOne = await picked()
  await clear()
  await h.mouse.move(pdfWord.x, pdfWord.y); await h.mouse.down(); await h.mouse.up(); await h.mouse.down({ clickCount: 2 })
  await h.mouse.move(at('Box').left + 45, at('Box').mid, { steps: 10 }); await h.mouse.up(); await wait(120)
  const pdfWords = await picked()
  check('pdf: double-click picks a word, and the drag after it grows by whole words', /^\w+$/.test(pdfOne.trim()) && /^\w/.test(flat(pdfWords)) && flat(pdfWords).startsWith(pdfOne.trim()) && /hedges$|Box$/.test(flat(pdfWords)), `"${pdfOne}" then "${flat(pdfWords).slice(0, 80)}"`)
  await clear()
  await h.mouse.click(pdfWord.x, pdfWord.y, { clickCount: 3 }); await wait(120)
  const pdfLine = await picked()
  await clear()
  await h.mouse.move(pdfWord.x, pdfWord.y); await h.mouse.down(); await h.mouse.up(); await h.mouse.down({ clickCount: 2 }); await h.mouse.up(); await h.mouse.down({ clickCount: 3 })
  await h.mouse.move(at('Box').left + 30, at('Box').mid, { steps: 8 }); await h.mouse.up(); await wait(120)
  const pdfLines = await picked()
  await clear()
  await h.mouse.click(at('Birch').right + 12, at('Birch').mid, { clickCount: 2 }); await wait(120)
  const endWord = await picked()
  const zoomed = await h.evaluate(() => document.querySelector('.pdf-reader .pdf-page[data-page="1"]')?.getBoundingClientRect().width)
  check('pdf: triple-click picks the line and the drag after it whole lines; a double-click just past a line picks its last word, not a zoom', flat(pdfLine) === LINES[1][1] && flat(pdfLines) === `${LINES[1][1]} ${LINES[1][2]}` && endWord.trim() === 'sheets' && Math.abs(zoomed - (runs.sheet.right - runs.sheet.left)) < 2, `"${flat(pdfLine).slice(0, 30)}…" / "${flat(pdfLines).slice(-30)}" / "${endWord}" / page ${Math.round(zoomed)} wide, was ${Math.round(runs.sheet.right - runs.sheet.left)}`)
  runs = await measure()
  await clear()
  await h.mouse.dblclick(pdfWord.x, pdfWord.y); await wait(80)
  await h.keyboard.down('Shift'); await h.mouse.click((runs.sheet.left + at('Bay').left) / 2, at('Bay').mid); await h.keyboard.up('Shift'); await wait(120)
  const pdfShift = await picked()
  check('pdf: ⇧-click in the margin extends to the line beside it', flat(pdfShift).startsWith(pdfOne.trim()) && flat(pdfShift).endsWith('hand so') && !/Bay|Amber/.test(pdfShift), `"${flat(pdfShift).slice(0, 90)}"`)

  got = await drag({ x: at('Beech').left + 40, y: at('Beech').mid }, { x: runs.sheet.right + 30, y: at('Beech').mid + 2 })
  check('pdf: a drag past the page\'s edge keeps to the line\'s end', flat(got).endsWith('at dusk and') && !/Box/.test(got), `picked "…${flat(got).slice(-40)}"`)

  for (const from of ['words', 'margin']) {
    await clear()
    await h.evaluate(() => (document.querySelector('.pdf-reader .pdf-reader-scroll').scrollTop = 0))
    await wait(300)
    const scroll = await h.evaluate(() => { const s = document.querySelector('.pdf-reader .pdf-reader-scroll'); const r = s.getBoundingClientRect(); return { top: s.scrollTop, bottom: r.bottom, inner: innerHeight } })
    const start = { x: from === 'words' ? at('Cedar').left + 30 : (runs.sheet.left + at('Cedar').left) / 2, y: at('Cedar').mid }
    await h.mouse.move(start.x, start.y); await h.mouse.down()
    await h.mouse.move(start.x + 60, scroll.bottom - 4, { steps: 6 })
    for (let n = 0; n < 12; n++) { await h.mouse.move(start.x + 60 + (n % 2), Math.min(scroll.inner + 30, scroll.bottom + 30), { steps: 1 }); await wait(60) }
    await h.mouse.up(); await wait(200)
    const after = await h.evaluate(() => document.querySelector('.pdf-reader .pdf-reader-scroll').scrollTop)
    const long = await picked()
    check(`pdf: a drag from the ${from} past the pane's bottom edge scrolls, and picks on`, after > scroll.top + 40 && /Cypress/.test(long), `scrolled ${Math.round(after - scroll.top)}px, picked ${flat(long).length} characters`)
  }
} finally {
  await c.close()
}
done()
