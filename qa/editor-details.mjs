// Five small editor details walked as a person meets them (10 Nov):
//  4. a table's grips and "+" bars stay while the pointer travels out to them
//     (a grace of TABLE_GRACE_MS), fade, and go once it is clearly away;
//  5. the block handle ("+" and the grip) has a hairline round it, light and dark;
//  8. a link card's buttons show the hand and are what the pointer hits; a
//     YouTube card offers no "Open in the reader"; the reader opened from a card
//     is a step, so ⌘[ comes back to the note; "Read it again" reads on the paper;
//  9. a card's copy plays the copy sound once;
// 10. "/" lists files in no note yet by name and kind, never an empty row.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/editor-details.mjs
// Frames and light/dark pictures under QA_SHOTS.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { clearBoard, copiedText } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, v, electron } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const sel = '[data-open] .tiptap:not(.is-line):not(.is-plain)'
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const cell = (kind, text) => ({ type: kind, content: [p(text)] })
const table = (rows, cols) => ({ type: 'table', content: Array.from({ length: rows }, (_, r) => ({ type: 'tableRow', content: Array.from({ length: cols }, (_, k) => cell(r === 0 ? 'tableHeader' : 'tableCell', `${String.fromCharCode(65 + k)}${r}`)) })) })
const DOT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const card = (href, title) => ({ type: 'bookmark', attrs: { href, title, description: 'A card for the probe.', site: new URL(href).hostname, image: DOT, icon: null, loading: false } })
const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const WEB = 'https://haligtree-qa.invalid/an-essay'
const set = (content) => h.evaluate(([sel, content]) => document.querySelector(sel).editor.chain().setContent({ type: 'doc', content }).run(), [sel, content])
const box = (q) => h.evaluate((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null }, q)
const controls = () => h.evaluate(() => {
  const layer = document.querySelector('.tiptap-table-controls')
  return { grips: layer?.querySelectorAll('.tiptap-table-grip').length ?? 0, bars: layer?.querySelectorAll('.tiptap-table-add').length ?? 0, leaving: layer?.hasAttribute('data-leaving') ?? false, opacity: layer ? Number(getComputedStyle(layer).opacity) : null }
})
const cued = () => h.evaluate(() => [...(window.haligtreeCued ?? [])])
const unCue = () => h.evaluate(() => { if (window.haligtreeCued) window.haligtreeCued.length = 0 })
// Frames every 50ms (or as fast as they come) for `ms` of the clock, not of frames taken.
const frames = async (name, ms) => { const start = Date.now(); if (!shots) return wait(ms); while (Date.now() - start < ms) { const t = Date.now() - start; await h.screenshot({ path: `${shots}/${name}-${String(t).padStart(3, '0')}.png` }); await wait(Math.max(0, 50 - (Date.now() - start - t))) } }
// WCAG contrast of two rgb() strings.
const lum = (rgb) => { const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Editor details', body: { type: 'doc', content: [p('Start.')] } })
  await c.send('article', id); await wait(1500)
  await set([p('A line to hover.'), table(3, 3), p('Between.'), card(WEB, 'An essay to read'), card(YT, 'A video'), p('The end.')])
  await wait(800)

  try {
  // 4. The table's controls: shown at once, kept through the grace, gone after.
  const cellBox = await box(`${sel} table tr:nth-child(2) > :nth-child(2)`)
  const tableBox = await box(`${sel} table`)
  await h.mouse.move(cellBox.x + cellBox.w / 2, cellBox.y + cellBox.h / 2, { steps: 4 })
  await wait(120)
  const on = await controls()
  check('4. hovering a cell shows both grips and both "+" bars at once', on.grips === 2 && on.bars === 2 && !on.leaving, JSON.stringify(on))
  // Out past the margin on the way to the row grip, on a slant, as a hand goes.
  await h.mouse.move(tableBox.x - 60, cellBox.y + cellBox.h / 2 + 30, { steps: 3 })
  await wait(120)
  const mid = await controls()
  check('4. 120ms after leaving the table they are still there (the grace)', mid.grips === 2 && mid.bars === 2, JSON.stringify(mid))
  check('4. and marked as leaving, to fade', mid.leaving, JSON.stringify(mid))
  const grip = await box('.tiptap-table-grip.is-row')
  await h.mouse.move(grip.x + grip.w / 2 - 6, grip.y + grip.h / 2, { steps: 2 })
  await wait(80)
  const reached = await controls()
  check('4. reaching the row grip keeps them, whole again', reached.grips === 2 && !reached.leaving && reached.opacity === 1, JSON.stringify(reached))
  const under = await h.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className ?? '', [grip.x + grip.w / 2 - 6, grip.y + grip.h / 2])
  check('4. and the pointer is on the grip itself', /tiptap-table-grip/.test(String(under)), String(under))
  // The "+" under the table, reached from the last row on the way down.
  const lastRow = await box(`${sel} table tr:last-child > :nth-child(2)`)
  await h.mouse.move(lastRow.x + lastRow.w / 2, lastRow.y + lastRow.h / 2, { steps: 3 }); await wait(80)
  await h.mouse.move(lastRow.x + lastRow.w / 2, tableBox.y + tableBox.h + 40, { steps: 2 }); await wait(100)
  const addBar = await box('.tiptap-table-add.is-row')
  await h.mouse.move(addBar.x + addBar.w / 2, addBar.y + addBar.h / 2, { steps: 2 }); await wait(60)
  const rowsBefore = await h.evaluate((sel) => document.querySelectorAll(`${sel} table tr`).length, sel)
  await h.mouse.down(); await h.mouse.up(); await wait(300)
  const rowsAfter = await h.evaluate((sel) => document.querySelectorAll(`${sel} table tr`).length, sel)
  check('4. overshooting and coming back to "+" below, a click adds a row', rowsAfter === rowsBefore + 1, `${rowsBefore} -> ${rowsAfter}`)
  // Far away: gone once the grace is over.
  await h.mouse.move(tableBox.x + tableBox.w + 300, tableBox.y - 200, { steps: 2 })
  const left = Date.now()
  await wait(150)
  const fading = await controls()
  check(`4. ${Date.now() - left}ms after leaving for good they are still drawn (fading)`, fading.grips === 2 && fading.leaving, JSON.stringify(fading))
  await frames('table-leave', 450)
  const gone = await controls()
  check('4. and gone after the grace (by 600ms)', gone.grips === 0 && gone.bars === 0, JSON.stringify(gone))

  } catch (error) {
    check('4. the table walk ran to its end', false, String(error).slice(0, 200))
    await h.mouse.move(5, 5)
  }

  // 5. The block handle's hairline, light and dark.
  const firstLine = await box(`${sel} p`)
  for (const name of ['light', 'dark']) {
    await c.look(name)
    await h.mouse.move(firstLine.x + 40, firstLine.y + firstLine.h / 2, { steps: 3 }); await wait(400)
    const ring = await h.evaluate(() => {
      const handle = document.querySelector('.tiptap-drag-handle.is-shown')
      if (!handle) return null
      const style = getComputedStyle(handle)
      return { shadow: style.boxShadow, border: getComputedStyle(document.querySelector('.tiptap.ProseMirror')).getPropertyValue('--tt-border-color').trim(), bg: style.backgroundColor }
    })
    check(`5. ${name}: the block handle has a 1px hairline in the theme's border colour`, !!ring && /0px 0px 0px 1px/.test(ring.shadow) && !/rgba\(0, 0, 0, 0\)/.test(ring.shadow), JSON.stringify(ring))
    if (shots) {
      const hb = await box('.tiptap-drag-handle.is-shown')
      if (hb) await h.screenshot({ path: `${shots}/handle-${name}.png`, clip: { x: Math.max(0, hb.x - 40), y: Math.max(0, hb.y - 30), width: 520, height: 320 } })
    }
  }
  await c.look('light')

  // 8a. The card's buttons: the hand, and they are what the pointer hits.
  const cards = await h.evaluate((sel) => [...document.querySelectorAll(`${sel} .tiptap-bookmark`)].map((one) => { const r = one.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }), sel)
  const hoverCard = async (index) => { const b = cards[index]; await h.mouse.move(b.x + b.w / 2, b.y + b.h / 2, { steps: 3 }); await wait(300) }
  const buttonsOn = (index) => h.evaluate(([sel, index]) => [...document.querySelectorAll(`${sel} .tiptap-bookmark`)[index].querySelectorAll('button')].map((one) => {
    const r = one.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return { label: one.getAttribute('aria-label'), cursor: getComputedStyle(one).cursor, hitCursor: hit ? getComputedStyle(hit).cursor : null, hits: !!hit && one.contains(hit), opacity: getComputedStyle(one).opacity }
  }), [sel, index])
  await hoverCard(0)
  const webButtons = await buttonsOn(0)
  check('8a. a web card shows "Open in the reader" and "Copy URL"', webButtons.map((one) => one.label).join() === 'Open in the reader,Copy URL', JSON.stringify(webButtons))
  const cardCursors = await h.evaluate((sel) => {
    const one = document.querySelectorAll(`${sel} .tiptap-bookmark`)[0]
    const of = (q) => { const el = q ? one.querySelector(q) : one; return el ? getComputedStyle(el).cursor : 'missing' }
    return { card: of(''), picture: of('img'), title: of('.tiptap-bookmark-title'), site: of('.tiptap-bookmark-site') }
  }, sel)
  check('8a. the card itself shows the hand all over, its picture too (a click opens the link)', Object.values(cardCursors).every((one) => one === 'pointer'), JSON.stringify(cardCursors))
  check('8a. both show the hand, and the pointer lands on them', webButtons.every((one) => one.cursor === 'pointer' && one.hits && one.hitCursor === 'pointer'), JSON.stringify(webButtons))
  if (shots) for (const name of ['light', 'dark']) { await c.look(name); await hoverCard(0); const b = cards[0]; await h.screenshot({ path: `${shots}/cards-${name}.png`, clip: { x: b.x - 20, y: b.y - 20, width: b.w + 40, height: cards[1].y + cards[1].h - b.y + 40 } }) }
  await c.look('light')
  await hoverCard(1)
  const ytButtons = await buttonsOn(1)
  check('8b. a YouTube card offers no "Open in the reader", only "Copy URL"', ytButtons.map((one) => one.label).join() === 'Copy URL', JSON.stringify(ytButtons))
  check('8a. its copy shows the hand too', ytButtons.every((one) => one.cursor === 'pointer' && one.hits), JSON.stringify(ytButtons))

  // 9. Copy: the copy sound, once, and the link on the clipboard.
  await clearBoard(electron)
  await unCue()
  await h.evaluate(([sel]) => [...document.querySelectorAll(`${sel} .tiptap-bookmark`)[1].querySelectorAll('button')].find((one) => one.getAttribute('aria-label') === 'Copy URL').click(), [sel])
  await wait(400)
  const heard = await cued()
  const clip = await copiedText(electron)
  check('9. copy puts the link on the clipboard', clip === YT, clip)
  check('9. and plays the copy sound once, nothing else', heard.filter((one) => one === 'copy').length === 1 && heard.length === 1, JSON.stringify(heard))

  // 8c. Opened from the card, the reader is a step: ⌘[ comes back to the note.
  await hoverCard(0)
  await h.locator(`${sel} .tiptap-bookmark >> nth=0`).locator('button[aria-label="Open in the reader"]').click()
  await h.waitForSelector('.web-reader', { timeout: 8000 }).catch(() => {})
  const inReader = await h.evaluate(() => !!document.querySelector('.web-reader'))
  check('8c. "Open in the reader" opens the reader', inReader)
  await h.waitForSelector('.web-reader-failed [data-read-again]', { timeout: 15000 }).catch(() => {})
  const again = await h.evaluate(() => {
    const button = document.querySelector('.web-reader-failed [data-read-again]')
    const page = document.querySelector('.web-reader-scroll')
    if (!button || !page) return null
    return { text: getComputedStyle(button).color, page: getComputedStyle(page).backgroundColor, paper: !!document.querySelector('.web-reader.is-paper'), ring: getComputedStyle(button).boxShadow, cursor: getComputedStyle(button).cursor }
  })
  for (const name of ['light', 'dark']) {
    await c.look(name)
    const now = await h.evaluate(() => { const b = document.querySelector('.web-reader-failed [data-read-again]'); const pg = document.querySelector('.web-reader-scroll'); return b && pg ? { text: getComputedStyle(b).color, page: getComputedStyle(pg).backgroundColor } : null })
    const ratio = now ? contrast(now.text, now.page) : 0
    check(`8b. ${name}: "Read it again" reads on the reader's page (contrast ${ratio.toFixed(1)}:1, at least 4.5)`, ratio >= 4.5, JSON.stringify(now))
    if (shots) await h.screenshot({ path: `${shots}/reader-failed-${name}.png` })
  }
  await c.look('light')
  check('8b. "Read it again" has a hairline and the hand', !!again && /1px/.test(again.ring) && again.cursor === 'pointer', JSON.stringify(again))
  await h.keyboard.press('Meta+BracketLeft')
  await wait(1200)
  const backAt = await h.evaluate(() => ({ reader: !!document.querySelector('.web-reader'), note: document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)')?.textContent?.includes('A line to hover.') ?? false }))
  check('8c. ⌘[ comes back to the note', !backAt.reader && backAt.note, JSON.stringify(backAt))
  await h.keyboard.press('Meta+BracketRight')
  await wait(1200)
  check('8c. and ⌘] goes forward to the reader again', await h.evaluate(() => !!document.querySelector('.web-reader')))
  await h.keyboard.press('Meta+BracketLeft')
  await wait(1200)

  // 8c again, from a note (not a Page), scrolled down to its card: Back lands on the note at that place.
  const longNote = { type: 'doc', content: [...Array.from({ length: 40 }, (_, i) => p(`Line ${i + 1} of a long note.`)), card(WEB, 'An essay further down'), p('After the card.')] }
  const noteId = await h.evaluate((body) => window.api.captures.create({ kind: "note", body }), longNote)
  await c.send('capture', noteId); await wait(1800)
  await h.evaluate((sel) => document.querySelector(`${sel} .tiptap-bookmark`).scrollIntoView({ block: 'center' }), sel); await wait(500)
  const scroller = () => h.evaluate((sel) => { let el = document.querySelector(sel); while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement; return el ? Math.round(el.scrollTop) : -1 }, sel)
  const before = await scroller()
  const cardAt = await box(`${sel} .tiptap-bookmark`)
  await h.mouse.move(cardAt.x + cardAt.w / 2, cardAt.y + cardAt.h / 2, { steps: 3 }); await wait(300)
  await h.locator(`${sel} .tiptap-bookmark button[aria-label="Open in the reader"]`).click()
  await h.waitForSelector('.web-reader', { timeout: 8000 }).catch(() => {})
  check('8c. from a note, "Open in the reader" opens the reader', await h.evaluate(() => !!document.querySelector('.web-reader')))
  await h.locator('[data-tab-arrows] button').first().click()
  await wait(1500)
  const after = await scroller()
  const home = await h.evaluate(() => ({ reader: !!document.querySelector('.web-reader'), note: document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)')?.textContent?.includes('Line 1 of a long note.') ?? false }))
  check('8c. the Back arrow returns to the note', !home.reader && home.note, JSON.stringify(home))
  check(`8c. at its place (scrolled ${before} before, ${after} after)`, before > 100 && Math.abs(after - before) < 40, `${before} -> ${after}`)

  // 10. "/": files in no note yet, each by name and kind.
  const png = await h.evaluate(() => new Promise((ok) => { const canvas = Object.assign(document.createElement('canvas'), { width: 120, height: 80 }); const pen = canvas.getContext('2d'); pen.fillStyle = '#c84'; pen.fillRect(0, 0, 120, 80); canvas.toBlob((blob) => blob.arrayBuffer().then((b) => ok([...new Uint8Array(b)]))) }))
  await h.evaluate((bytes) => window.api.haligtree('media:add', [{ name: '', bytes: new Uint8Array(bytes) }]), png)
  await h.evaluate((bytes) => window.api.haligtree('media:add', [{ name: 'A very long file name that goes on and on past the edge of any menu row ever drawn.png', bytes: new Uint8Array([...bytes.slice(0, -1), 7]) }]), png)
  await wait(800)
  const rowsOf = () => h.evaluate(() => {
    const list = document.querySelector('.tiptap-slash-menu-list')
    if (!list) return null
    let group = ''
    const out = []
    for (const one of list.children) {
      if (one.classList.contains('tiptap-slash-menu-group')) { group = one.textContent; continue }
      const title = one.querySelector('.tiptap-slash-menu-title')
      out.push({ group, title: title?.textContent ?? '', hint: one.querySelector('.tiptap-slash-menu-hint')?.textContent ?? '', cut: title ? title.scrollWidth > title.clientWidth : false, img: !!one.querySelector('img') })
    }
    return out
  })
  await h.evaluate((sel) => { const ed = document.querySelector(sel).editor; ed.chain().focus('end').run() }, sel)
  await h.keyboard.press('Enter')
  await h.keyboard.type('/', { delay: 40 }); await wait(900)
  const plain = (await rowsOf()) ?? []
  const loose = plain.filter((one) => /in no note yet/.test(one.group))
  check('10. "/" has a "From Files, in no note yet" group', loose.length > 0 && loose.every((one) => one.group === 'From Files, in no note yet'), JSON.stringify(loose.map((one) => one.group)))
  check('10. every row in it has a name and its kind', loose.every((one) => one.title.trim() && /^(Picture|GIF|PDF|Recording)$/.test(one.hint)), JSON.stringify(loose))
  if (shots) for (const name of ['light', 'dark']) { await c.look(name); await h.screenshot({ path: `${shots}/slash-files-${name}.png` }) }
  await c.look('light')
  await h.keyboard.type('media', { delay: 40 }); await wait(900)
  const asked = (await rowsOf()) ?? []
  check('10. "/media" lists them all with names, none empty', asked.length >= 2 && asked.every((one) => one.title.trim()), JSON.stringify(asked))
  check('10. the picture with no name of its own is named by its kind and day', asked.some((one) => /^Picture from /.test(one.title)), JSON.stringify(asked.map((one) => one.title)))
  const long = asked.find((one) => /^A very long/.test(one.title))
  check('10. a long name is cut short in its row', !!long?.cut, JSON.stringify(long))
  // The whole name as a tip on a cut row only.
  const longRow = h.locator('.tiptap-slash-menu-list > button', { hasText: /^A very long/ }).first()
  await longRow.scrollIntoViewIfNeeded(); await wait(200)
  const longBox = await longRow.boundingBox()
  await h.mouse.move(longBox.x + 40, longBox.y + longBox.height / 2, { steps: 4 }); await wait(200)
  check('10. pointing at a cut name gives the whole name as its tip', (await longRow.getAttribute('title'))?.startsWith('A very long file name'), await longRow.getAttribute('title'))
  const shortRow = h.locator('.tiptap-slash-menu-list > button', { hasText: /^Picture from / }).first()
  await shortRow.scrollIntoViewIfNeeded(); await wait(200)
  const shortBox = await shortRow.boundingBox()
  await h.mouse.move(shortBox.x + 40, shortBox.y + shortBox.height / 2, { steps: 4 }); await wait(200)
  check('10. a name that fits gets no tip', !(await shortRow.getAttribute('title')), await shortRow.getAttribute('title'))
  await longRow.scrollIntoViewIfNeeded(); await wait(200)
  if (shots) for (const name of ['light', 'dark']) { await c.look(name); await h.screenshot({ path: `${shots}/slash-media-${name}.png` }) }
  await c.look('light')
  await h.keyboard.press('Escape')
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 600))
} finally {
  await c.close()
  done()
}
