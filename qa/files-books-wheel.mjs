// Files > Books: an up and down wheel over "Continue reading" scrolls the shelf, and a sideways one turns the row
// (the user, 11 Nov: over the row the page would not scroll). And the "Choose files…" box keeps the page's column on
// every tab: on Books it stretched to the page's whole width.
//
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/files-books-wheel.mjs [shots]
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.argv[2]
const c = await sandbox({ width: 1200, height: 760 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = (name) => SHOTS && c.both(join(SHOTS, name))

const PDF = (word, i) => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 420] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const stream = `0.${(i * 7) % 9 + 1} 0.3 0.4 rg 0 0 300 420 re f 1 1 1 rg BT /F1 30 Tf 30 340 Td (${word}) Tj ET`
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = '%PDF-1.4\n'
  const at = []
  objects.forEach((body, n) => (at.push(out.length), (out += `${n + 1} 0 obj\n${body}\nendobj\n`)))
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return [...Buffer.from(out)]
}
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

try {
  const words = ['Meditations', 'Walden', 'Middlemarch', 'Emma', 'Persuasion', 'Ivanhoe', 'Kidnapped', 'Dracula', 'Beowulf', 'Utopia', 'Leviathan', 'Candide']
  for (const [i, word] of words.entries()) {
    const src = await h.evaluate((b) => window.api.saveFile(`${b.name}.pdf`, new Uint8Array(b.data)), { name: word, data: [...PDF(word, i), ...Buffer.from(`% ${i}\n`)] })
    await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: [para(`Reading ${word}`), { type: 'attachment', attrs: { src, name: `${word}.pdf`, size: 900 } }] })
    await v('pdf:read', src, 10 + i, 300)
  }
  await go('media'); await wait(1500)

  // --- 3. The box, on All and then on Books: the same column, the same left edge and width.
  await h.locator('[data-media-add]').first().click(); await wait(500)
  const boxAt = () => h.evaluate(() => {
    const box = document.querySelector('[data-media-add-box]')
    const tabs = document.querySelector('[data-media-kinds]')
    if (!box) return null
    const r = box.getBoundingClientRect(), t = tabs?.getBoundingClientRect()
    // The column the tabs sit in, inside its padding: the box keeps to it.
    const col = tabs?.parentElement, cs = col && getComputedStyle(col), cr = col?.getBoundingClientRect()
    const right = cr ? Math.round(cr.right - parseFloat(cs.paddingRight)) : null
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height), tabsLeft: t && Math.round(t.left), colRight: right, aboveTabs: !!t && r.bottom <= t.top + 1 }
  })
  const onAll = await boxAt()
  if (SHOTS) await shot('files-add-all')
  await h.locator('[data-media-kinds] button', { hasText: /^Books$/ }).first().click(); await wait(1500)
  const onBooks = await boxAt()
  if (SHOTS) await shot('files-add-books')
  const inColumn = (one) => !!one && one.left === one.tabsLeft && Math.abs(one.right - one.colRight) <= 1 && one.aboveTabs
  check('on All, the box sits in the page column over the tabs', inColumn(onAll), JSON.stringify(onAll))
  check('on Books, the box keeps to the shelf\'s column over the tabs (never across the book panel), at the same left edge as on All', inColumn(onBooks) && Math.abs(onBooks.left - onAll.left) <= 1, `All ${JSON.stringify(onAll)} Books ${JSON.stringify(onBooks)}`)
  await h.keyboard.press('Escape'); await wait(400)

  // --- 2. Wheel over Continue reading.
  const row = await h.evaluate(() => {
    const car = document.querySelector('[data-shelf-continue] [data-flex-carousel]')
    if (!car) return null
    car.scrollIntoView({ block: 'start' })
    const r = car.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })
  check('Continue reading on Books is the moving row', !!row, String(row))
  if (row) {
    await h.evaluate(() => (document.querySelector('[data-shelf-scroll]').scrollTop = 0))
    await wait(300)
    const pos = await h.evaluate(() => { const r = document.querySelector('[data-shelf-continue] [data-flex-carousel]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })
    await h.mouse.move(pos.x, pos.y); await wait(200)
    const before = await h.evaluate(() => ({ top: document.querySelector('[data-shelf-scroll]').scrollTop, active: document.querySelector('[data-shelf-continue] [data-flex-carousel]').dataset.active }))
    await h.mouse.wheel(0, 400); await wait(700)
    const down = await h.evaluate(() => ({ top: document.querySelector('[data-shelf-scroll]').scrollTop, active: document.querySelector('[data-shelf-continue] [data-flex-carousel]').dataset.active }))
    check('a down wheel over the row scrolls the shelf', down.top - before.top >= 200, `${JSON.stringify(before)} -> ${JSON.stringify(down)}`)
    check('and does not turn the row', down.active === before.active, `${before.active} -> ${down.active}`)
    await h.mouse.wheel(0, -400); await wait(700)
    const up = await h.evaluate(() => document.querySelector('[data-shelf-scroll]').scrollTop)
    check('an up wheel over it scrolls back', up < down.top - 200, `${down.top} -> ${up}`)
    // A trackpad swipe that starts sideways stays the row's for the whole gesture, even where it drifts down.
    await h.evaluate(() => (document.querySelector('[data-shelf-scroll]').scrollTop = 0)); await wait(300)
    const pos2 = await h.evaluate(() => { const r = document.querySelector('[data-shelf-continue] [data-flex-carousel]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })
    await h.mouse.move(pos2.x, pos2.y)
    const from = await h.evaluate(() => ({ top: document.querySelector('[data-shelf-scroll]').scrollTop, active: document.querySelector('[data-shelf-continue] [data-flex-carousel]').dataset.active }))
    for (const [dx, dy] of [[40, 4], [60, 10], [50, 30], [30, 45], [20, 40]]) { await h.mouse.wheel(dx, dy); await wait(16) }
    await wait(900)
    const side = await h.evaluate(() => ({ top: document.querySelector('[data-shelf-scroll]').scrollTop, active: document.querySelector('[data-shelf-continue] [data-flex-carousel]').dataset.active }))
    check('a sideways swipe turns the row and leaves the shelf where it was, though it drifts down', side.active !== from.active && side.top === from.top, `${JSON.stringify(from)} -> ${JSON.stringify(side)}`)
  }
  check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
