// Live Text in the picture viewer: the words in a picture, read by the Mac (Apple's Vision), picked in place.
// The July 1890 Lippincott's cover on the Dorian Gray note: its words are found ("LIPPINCOTT'S", "MONTHLY
// MAGAZINE"), a drag picks them and ⌘C puts them on the clipboard, a double-click picks one word, a
// triple-click a line, ⌘A all; the words have the I-beam, the picture keeps its zoom cursor; Esc lets go of
// the words before it closes. Opened again, the words come from what was kept, not a second reading.
// A picture with no words (Masaccio's Trinity, on "Florence learned perspective") shows no layer and no pill.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-lt/main/index.js HALIGTREE_QA_AWAY=1 node qa/live-text.mjs
// SHOTS=dir keeps pictures of a selection, light and dark.
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
import { copiedText } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const clipboard = () => copiedText(electron)

/** The note's picture whose file is `name`, opened in the viewer with a double-click. */
const openPicture = async (name) => {
  const box = await h.evaluate(async (name) => {
    const img = [...document.querySelectorAll('.tiptap img')].find((one) => one.getBoundingClientRect().width > 100 && (one.dataset.sandbox === name || one.currentSrc.includes('assets/')))
    if (!img) return null
    img.scrollIntoView({ block: 'center' })
    await new Promise((done) => setTimeout(done, 300))
    const b = img.getBoundingClientRect()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, src: img.currentSrc }
  }, name)
  if (!box) return null
  await h.mouse.dblclick(box.x, box.y)
  await wait(900)
  return box.src
}
/** A word's box in the viewer, by its text (the nth such). */
const word = (text, nth = 0) => h.evaluate(([text, nth]) => {
  const span = [...document.querySelectorAll('.mf-look-text [data-word]')].filter((one) => one.textContent.trim() === text)[nth]
  if (!span) return null
  const b = span.getBoundingClientRect()
  return { x: b.x, y: b.y, w: b.width, h: b.height, line: span.dataset.line, cursor: getComputedStyle(span).cursor }
}, [text, nth])
const picked = () => h.evaluate(() => getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '')

try {
  const notes = await h.evaluate(() => window.api.captures.list())
  const dorian = notes.find((one) => /^The Picture of Dorian Gray/.test(one.label ?? ''))
  await c.send('capture', dorian.id)
  await wait(1800)
  const src = await openPicture('dorian-lippincott')
  check('the Lippincott cover opens in the viewer', !!src && (await h.locator('.mf-look').count()) === 1, src)
  // Read by the Mac in the background: the viewer opened before the words came.
  const found = await h.locator('.mf-look-text').waitFor({ timeout: 40000 }).then(() => true, () => false)
  check('its words are laid over it', found)
  const lines = await h.evaluate(() => {
    const out = new Map()
    for (const span of document.querySelectorAll('.mf-look-text [data-word]')) out.set(span.dataset.line, `${out.get(span.dataset.line) ?? ''}${span.textContent}`)
    return [...out.values()].map((one) => one.trim())
  })
  check('the Mac read "LIPPINCOTT\'S" and "MONTHLY MAGAZINE"', lines.includes("LIPPINCOTT'S") && lines.includes('MONTHLY MAGAZINE'), `${lines.length} lines: ${lines.slice(5, 10).join(' | ')}`)
  const pill = h.locator('.mf-look-text-pill')
  check('a "Select text" pill shows on the picture', (await pill.count()) === 1 && /Select text/.test(await pill.textContent()))

  const lip = await word("LIPPINCOTT'S")
  const monthly = await word('MONTHLY')
  const magazine = await word('MAGAZINE')
  check('the words have the I-beam; the picture keeps its zoom cursor', lip?.cursor === 'text' && (await h.evaluate(() => getComputedStyle(document.querySelector('.mf-look-image')).cursor)) === 'zoom-in')
  const shown = await h.evaluate(() => { const b = document.querySelector('.mf-look-image').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } })
  check('the words lie inside the picture', !!lip && !!magazine && lip.x > shown.x && lip.x + lip.w < shown.x + shown.w && magazine.y + magazine.h < shown.y + shown.h, JSON.stringify({ lip, shown }))

  // Every word stretched to its own box: from where it starts to where the next word starts (or its own end).
  const fitted = await h.evaluate(async (src) => {
    const { lines } = await window.api.imageLines(src)
    const shown = document.querySelector('.mf-look-image').getBoundingClientRect()
    const spans = [...document.querySelectorAll('.mf-look-text [data-word]')]
    let n = 0
    const off = []
    for (const line of lines) line.words.forEach((word, i) => {
      const next = line.words[i + 1]
      const want = (next ? next.x - word.x : word.w) * shown.width
      const b = spans[n++].getBoundingClientRect()
      // Its letters a little short of the box: the mark a pick draws at its end fills the rest.
      if (b.width > want + 1 || b.width < want * (word.text.length > 2 ? 0.7 : 0.3) || Math.abs(b.left - (shown.left + word.x * shown.width)) > 1.5) off.push(`${word.text}: ${b.width.toFixed(1)} for ${want.toFixed(1)}`)
    })
    return { words: n, off: off.slice(0, 5), count: off.length }
  }, src)
  check('every word is stretched to its own box, none past the next', fitted.count === 0, JSON.stringify(fitted))

  // A drag from the start of LIPPINCOTT'S to the end of MAGAZINE.
  await h.mouse.move(lip.x + 1, lip.y + lip.h / 2)
  await h.mouse.down()
  await h.mouse.move(lip.x + lip.w / 2, lip.y + lip.h / 2, { steps: 4 })
  await h.mouse.move(magazine.x + magazine.w - 1, magazine.y + magazine.h / 2, { steps: 8 })
  await h.mouse.up()
  await wait(200)
  check('a drag picks "LIPPINCOTT\'S MONTHLY MAGAZINE"', (await picked()) === "LIPPINCOTT'S MONTHLY MAGAZINE", await picked())
  check('the viewer is still open and not zoomed after the drag', (await h.locator('.mf-look').count()) === 1 && (await h.locator('.mf-look-image[data-zoomed]').count()) === 0)
  if (shots) {
    await c.look('light'); await wait(300); await h.screenshot({ path: `${shots}/selection-light.png` })
    await c.look('dark'); await wait(300); await h.screenshot({ path: `${shots}/selection-dark.png` })
    await c.look('light'); await wait(300)
    check('still picked after the theme changed', (await picked()) === "LIPPINCOTT'S MONTHLY MAGAZINE", await picked())
  }
  await h.keyboard.press('Meta+c')
  await wait(400)
  check('⌘C puts the words on the clipboard, a line to a line', (await clipboard()) === "LIPPINCOTT'S\nMONTHLY MAGAZINE", JSON.stringify(await clipboard()))
  check('and ⌘C left the viewer open', (await h.locator('.mf-look').count()) === 1)

  // Right-click on the picked words: their own lines first, then the picture's.
  await h.mouse.click(magazine.x + magazine.w / 2, magazine.y + magazine.h / 2, { button: 'right' })
  await wait(500)
  const menu = await h.evaluate(() => [...document.querySelectorAll("[role='menu'] [role='menuitem']")].map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
  if (shots) await h.screenshot({ path: `${shots}/menu.png` })
  const onTop = await h.evaluate(() => {
    const menu = document.querySelector("[role='menu']")
    if (!menu) return false
    const b = menu.getBoundingClientRect()
    return menu.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2))
  })
  check('the menu shows over the viewer, not behind it', onTop)
  check('right-click on picked words offers "Copy" and "Look Up", then "Text in it"', /^Copy⌘C$/.test(menu[0] ?? '') && /^Look Up “/.test(menu[1] ?? '') && menu.includes('Text in it'), JSON.stringify(menu))
  await h.keyboard.press('Escape')
  await wait(400)
  check('Esc shuts the menu, the viewer stays', (await h.locator("[role='menu']").count()) === 0 && (await h.locator('.mf-look').count()) === 1)

  await h.mouse.dblclick(monthly.x + monthly.w / 2, monthly.y + monthly.h / 2)
  await wait(200)
  check('a double-click picks one word', (await picked()) === 'MONTHLY', await picked())
  await h.mouse.click(monthly.x + monthly.w / 2, monthly.y + monthly.h / 2, { clickCount: 3 })
  await wait(200)
  check('a triple-click picks its line', (await picked()) === 'MONTHLY MAGAZINE', await picked())
  await h.keyboard.press('Meta+a')
  await wait(200)
  const all = await picked()
  check('⌘A picks every word in the picture', all.includes('THIS NUMBER CONTAINS') && all.includes("LIPPINCOTT'S") && all.includes('PHILADELPHIA'), `${all.length} letters`)
  await h.keyboard.press('Escape')
  await wait(300)
  check('Esc lets go of the words first, the viewer stays', (await picked()) === '' && (await h.locator('.mf-look').count()) === 1)
  // A click off the words on the picture still zooms, as before.
  await h.mouse.click(shown.x + 8, shown.y + shown.h - 8)
  await wait(500)
  const zoomed = (await h.locator('.mf-look-image[data-zoomed]').count()) === 1
  const lipZoomed = await word("LIPPINCOTT'S")
  check('a click off the words zooms, and the words grow with the picture', zoomed && !!lipZoomed && lipZoomed.w > lip.w * 1.2, JSON.stringify({ zoomed, was: lip?.w, now: lipZoomed?.w }))
  await h.keyboard.press('Escape')
  await wait(900)
  check('Esc then closes the viewer', (await h.locator('.mf-look').count()) === 0)

  // Again: the words were kept.
  await openPicture('dorian-lippincott')
  const again = await h.locator('.mf-look-text').waitFor({ timeout: 3000 }).then(() => true, () => false)
  check('opened again, the words are there at once', again)
  const kept = await h.evaluate((src) => window.api.imageLines(src), src)
  check('and the Mac is not asked again: they come from the database', kept?.kept === true && kept.lines.length > 20, JSON.stringify({ kept: kept?.kept, lines: kept?.lines.length }))
  await h.keyboard.press('Escape')
  await wait(900)

  // A picture with no words: no layer, no pill.
  const florence = (await v('items', 'article')).find((one) => one.title.includes('Florence learned perspective'))
  await c.send('article', florence.id)
  await wait(1800)
  const plain = await openPicture('masaccio-trinity')
  check('a picture with no words opens', !!plain && (await h.locator('.mf-look').count()) === 1, plain)
  const read = await h.evaluate((src) => window.api.imageLines(src), plain)
  await wait(400)
  check('it was read and holds no words', !!read && read.lines.length === 0, JSON.stringify(read))
  check('and shows no words layer and no pill', (await h.locator('.mf-look-text').count()) === 0 && (await h.locator('.mf-look-text-pill').count()) === 0)
  if (shots) await h.screenshot({ path: `${shots}/no-text.png` })
  await h.keyboard.press('Escape')
  await wait(600)
  check('no errors on the page', c.errors.length === 0, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
