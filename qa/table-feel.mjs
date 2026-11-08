// Tables walked as a person uses them: made from the "/" menu, the header row
// set apart, room in every cell, the "+" bars shown on hover (caret anywhere),
// a click adding a row, a column border dragged wider, a row dragged by its
// grip, Tab and ⇧Tab between cells (Tab on the last cell adds a row), Enter
// staying in its cell, the row and column menus (icons, the hand, 28px rows,
// sort), a range copied and pasted, a 20 x 20 table scrolling inside its own
// box and never the page, and the look in Paper, Light and Dark. Frames under QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/table-feel.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const sel = '[data-open] .tiptap'
const shot = async (name) => shots && h.screenshot({ path: `${shots}/table-${name}.png` })
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const cell = (kind, text) => ({ type: kind, content: [p(text)] })
const table = (rows, cols, word = (r, c) => `${String.fromCharCode(65 + c)}${r}`) => ({
  type: 'table',
  content: Array.from({ length: rows }, (_, r) => ({ type: 'tableRow', content: Array.from({ length: cols }, (_, k) => cell(r === 0 ? 'tableHeader' : 'tableCell', word(r, k))) }))
})
const set = (content) => h.evaluate(([sel, content]) => document.querySelector(sel).editor.chain().setContent({ type: 'doc', content }).run(), [sel, content])
const grid = () => h.evaluate((sel) => {
  const ed = document.querySelector(sel).editor
  const out = []
  ed.state.doc.descendants((node) => { if (node.type.name === 'table') { out.push(node.content.content.map((row) => row.content.content.map((one) => one.textContent))); return false } })
  return out[0] ?? null
}, sel)
const where = () => h.evaluate((sel) => {
  const ed = document.querySelector(sel).editor
  const { $from } = ed.state.selection
  for (let d = $from.depth; d > 0; d--) if (/^table(Cell|Header)$/.test($from.node(d).type.name)) {
    const rowDepth = d - 1
    return { row: $from.index(rowDepth - 1), col: $from.index(rowDepth), text: $from.node(d).textContent }
  }
  return null
}, sel)
const box = (q) => h.evaluate((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null }, q)
const cellBox = (r, k) => box(`${sel} table tr:nth-child(${r + 1}) > :nth-child(${k + 1})`)
const clickCell = async (r, k) => { const b = await cellBox(r, k); await h.mouse.click(b.x + b.w / 2, b.y + b.h / 2); await wait(150) }

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Table feel', body: { type: 'doc', content: [p('Start.')] } })
  await c.send('article', id); await wait(1500)

  // 1. Made from the "/" menu.
  await set([p('')])
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), sel)
  await h.keyboard.type('/table', { delay: 30 }); await wait(500)
  await h.keyboard.press('Enter'); await wait(400)
  const made = await grid()
  check('"/" Table makes a 3 x 3 table with a header row', made?.length === 3 && (await h.$$eval(`${sel} table tr:first-child th`, (all) => all.length)) === 3, JSON.stringify(made))
  check('and the caret waits in its first cell', (await where())?.row === 0)

  // 2. The look: header set apart, room in each cell, borders from the theme.
  await set([p('A reading list.'), table(4, 3, (r, k) => r === 0 ? ['Book', 'Author', 'Year'][k] : [['Essays', 'Montaigne', '1580'], ['Walden', 'Thoreau', '1854'], ['Meditations', 'Marcus Aurelius', '180']][r - 1][k]), p('After the table.')])
  await wait(300)
  const look = async () => h.evaluate((sel) => {
    const th = document.querySelector(`${sel} th`), td = document.querySelector(`${sel} td`)
    const a = getComputedStyle(th), b = getComputedStyle(td)
    const wrap = document.querySelector(`${sel} .tableWrapper`)
    return {
      thWeight: Number(a.fontWeight), thBg: a.backgroundColor, tdBg: b.backgroundColor, thImage: a.backgroundImage,
      padTop: parseFloat(b.paddingTop), padLeft: parseFloat(b.paddingLeft), rowH: td.getBoundingClientRect().height,
      border: b.borderTopColor, radius: parseFloat(getComputedStyle(wrap.querySelector('table')).borderTopLeftRadius) || parseFloat(getComputedStyle(wrap).borderTopLeftRadius),
      thColor: a.color, tdColor: b.color, thSize: parseFloat(a.fontSize), tdSize: parseFloat(b.fontSize)
    }
  }, sel)
  const L = await look()
  console.log('LOOK', JSON.stringify(L))
  check('the header row is set apart: a tint and heavier words, one size with the cells', L.thBg !== L.tdBg && L.thWeight >= 600 && L.thSize === L.tdSize, `${L.thBg} / ${L.tdBg} / ${L.thWeight}`)
  check('cells have room: 8px above, 12px at the sides, rows at least 36px', L.padTop >= 8 && L.padLeft >= 12 && L.rowH >= 36, JSON.stringify(L))
  check('the table has rounded outer corners like every card', L.radius >= 6, String(L.radius))
  await shot('look-paper')

  // 3. Hover shows the "+" bars, caret anywhere.
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), sel)
  const mid = await cellBox(2, 1)
  await h.mouse.move(mid.x + 10, mid.y + 10, { steps: 4 }); await wait(100)
  await h.mouse.move(mid.x + 14, mid.y + 12, { steps: 2 }); await wait(250)
  const bars = await h.$$eval('.tiptap-table-add', (all) => all.length)
  check('pointing at a table shows its "+" bars, with the caret outside it', bars === 2, String(bars))
  await shot('hover')
  const add = await box('.tiptap-table-add.is-row')
  if (add) {
    await h.mouse.move(add.x + add.w / 2, add.y + add.h / 2, { steps: 4 }); await wait(150)
    const cursor = await h.$eval('.tiptap-table-add.is-row', (one) => getComputedStyle(one).cursor)
    check('the "+" bar shows the hand', cursor === 'pointer', cursor)
    await h.mouse.down(); await h.mouse.up(); await wait(300)
    check('a click on the bottom "+" adds a row', (await grid())?.length === 5, JSON.stringify(await grid()))
    await h.keyboard.press('Meta+z'); await wait(200)
    check('⌘Z takes it back', (await grid())?.length === 4)
  } else check('the "+" bar can be reached', false)
  const titles = await h.$$eval('.tiptap-table-controls [title]', (all) => all.length)
  check('no stock browser tooltips on the grips and bars', titles === 0, String(titles))

  // 4. Tab, ⇧Tab, Enter.
  await clickCell(1, 0)
  await h.keyboard.press('Tab'); await wait(80)
  check('Tab moves to the next cell', JSON.stringify(await where()) === JSON.stringify({ row: 1, col: 1, text: 'Montaigne' }), JSON.stringify(await where()))
  await h.keyboard.press('Shift+Tab'); await wait(80)
  check('⇧Tab moves back', (await where())?.col === 0)
  await clickCell(3, 2)
  await h.keyboard.press('Tab'); await wait(150)
  check('Tab on the last cell adds a row and moves into it', (await grid())?.length === 5 && (await where())?.row === 4, JSON.stringify(await where()))
  await h.keyboard.press('Meta+z'); await wait(150)
  await clickCell(1, 0)
  await h.keyboard.press('End'); await h.keyboard.press('Enter'); await h.keyboard.type('second line'); await wait(150)
  check('Enter in a cell starts a new line inside the cell', (await where())?.text === 'Essayssecond line' && (await grid())?.length === 4, JSON.stringify(await where()))
  await h.keyboard.press('Meta+z'); await h.keyboard.press('Meta+z'); await wait(150)
  await set([p('A reading list.'), table(4, 3, (r, k) => r === 0 ? ['Book', 'Author', 'Year'][k] : [['Essays', 'Montaigne', '1580'], ['Walden', 'Thoreau', '1854'], ['Meditations', 'Marcus Aurelius', '180']][r - 1][k]), p('After the table.')])
  await wait(200)

  // 5. Column border dragged wider.
  await clickCell(1, 0)
  const c0 = await cellBox(1, 0)
  await h.mouse.move(c0.x + c0.w - 1, c0.y + c0.h / 2, { steps: 3 }); await wait(150)
  const resizeCursor = await h.evaluate(() => getComputedStyle(document.querySelector('.ProseMirror.resize-cursor') ?? document.body).cursor)
  check('a column border shows the resize arrows', /col-resize|ew-resize/.test(resizeCursor), resizeCursor)
  await shot('resize-hover')
  await h.mouse.down()
  for (let i = 1; i <= 6; i++) (await h.mouse.move(c0.x + c0.w - 1 + i * 10, c0.y + c0.h / 2), await wait(30))
  await shot('resize-drag')
  await h.mouse.up(); await wait(200)
  const widened = (await cellBox(1, 0)).w
  check('dragging a column border makes the column wider', widened > c0.w + 30, `${c0.w} -> ${widened}`)

  // 6. A row dragged by its grip.
  const r1 = await cellBox(1, 1)
  await h.mouse.move(r1.x + 10, r1.y + r1.h / 2, { steps: 3 }); await wait(200)
  const rowGrip = await box('.tiptap-table-grip.is-row')
  if (rowGrip) {
    const gx = rowGrip.x + rowGrip.w / 2, gy = rowGrip.y + rowGrip.h / 2
    await h.mouse.move(gx, gy); await wait(100)
    const r3 = await cellBox(3, 1)
    await h.mouse.down()
    for (let i = 1; i <= 6; i++) (await h.mouse.move(gx, gy + ((r3.y + r3.h / 2 - gy) * i) / 6), await wait(40))
    await shot('row-drag')
    await h.mouse.up(); await wait(300)
    const after = await grid()
    check('a row dragged by its grip moves', after?.[3]?.[0] === 'Essays', JSON.stringify(after?.map((row) => row[0])))
    await h.keyboard.press('Meta+z'); await wait(200)
  } else check('a row grip shows on hover', false)

  // 7. The row and column menus.
  const openMenu = async (axis, r, k) => {
    const at = await cellBox(r, k)
    await h.mouse.move(at.x + 10, at.y + 10, { steps: 3 }); await wait(200)
    const g = await box(`.tiptap-table-grip.is-${axis}`)
    if (!g) return null
    await h.mouse.click(g.x + g.w / 2, g.y + g.h / 2); await wait(350)
    // 28px at the app's 100% size: 1.75rem, the right-click menu's own row (min-h-7).
    return h.evaluate(() => [...document.querySelectorAll('.tiptap-table-menu button')].map((one) => ({ text: one.textContent.trim(), icon: !!one.querySelector('svg'), height: Math.round(one.getBoundingClientRect().height / parseFloat(getComputedStyle(document.documentElement).fontSize) * 16), cursor: getComputedStyle(one).cursor })))
  }
  const rowMenu = await openMenu('row', 2, 1)
  await shot('row-menu')
  console.log('ROW MENU', JSON.stringify(rowMenu))
  check('a row grip opens the row menu: above, below, delete', ['Insert row above', 'Insert row below', 'Delete row'].every((one) => rowMenu?.some((row) => row.text === one)), JSON.stringify(rowMenu?.map((row) => row.text)))
  check('every row-menu line has an icon, the hand and 28px height', rowMenu?.length && rowMenu.every((one) => one.icon && one.cursor === 'pointer' && one.height === 28), JSON.stringify(rowMenu))
  await h.keyboard.press('Escape'); await wait(150)
  const colMenu = await openMenu('column', 2, 0)
  await shot('column-menu')
  check('a column grip opens the column menu: left, right, sort, delete', ['Insert column left', 'Insert column right', 'Sort column A to Z', 'Delete column'].every((one) => colMenu?.some((row) => row.text === one)), JSON.stringify(colMenu?.map((row) => row.text)))
  check('every column-menu line has an icon, the hand and 28px height', colMenu?.length && colMenu.every((one) => one.icon && one.cursor === 'pointer' && one.height === 28), JSON.stringify(colMenu))
  const sortRow = await h.evaluate(() => [...document.querySelectorAll('.tiptap-table-menu button')].findIndex((one) => one.textContent.trim() === 'Sort column A to Z'))
  if (sortRow >= 0) {
    await h.evaluate((i) => document.querySelectorAll('.tiptap-table-menu button')[i].click(), sortRow); await wait(300)
    const sorted = (await grid()).map((row) => row[0])
    check('"Sort column A to Z" sorts the rows under the header', JSON.stringify(sorted) === JSON.stringify(['Book', 'Essays', 'Meditations', 'Walden']), JSON.stringify(sorted))
  }
  await h.keyboard.press('Escape')

  // 8. A range copied and pasted.
  await set([p('A reading list.'), table(4, 3, (r, k) => r === 0 ? ['Book', 'Author', 'Year'][k] : [['Essays', 'Montaigne', '1580'], ['Walden', 'Thoreau', '1854'], ['Meditations', 'Marcus Aurelius', '180']][r - 1][k]), p('After the table.')])
  await wait(200)
  const a = await cellBox(1, 0), b = await cellBox(2, 1)
  await h.mouse.move(a.x + 8, a.y + a.h / 2); await h.mouse.down()
  await h.mouse.move(b.x + b.w / 2, b.y + b.h / 2, { steps: 6 }); await h.mouse.up(); await wait(200)
  await shot('range')
  const picked = await h.$$eval(`${sel} .selectedCell`, (all) => all.length)
  check('dragging across cells picks a range', picked === 4, String(picked))
  await h.keyboard.press('Meta+c'); await wait(150)
  await clickCell(3, 1)
  await h.keyboard.press('Meta+v'); await wait(300)
  const pasted = await grid()
  check('the range pastes into the cells from where the caret is', pasted?.[3]?.[1] === 'Essays' && pasted?.[3]?.[2] === 'Montaigne' && pasted?.length >= 5, JSON.stringify(pasted))

  // 9. 20 x 20 scrolls in its own box, never the page.
  await set([p('Big.'), table(20, 20), p('After.')])
  await wait(500)
  const scroll = await h.evaluate((sel) => {
    const wrap = document.querySelector(`${sel} .tableWrapper`)
    const page = document.querySelector(sel).closest('.haligtree-editor-content') ?? document.querySelector(sel).parentElement
    let pageWide = false
    for (let el = wrap.parentElement; el; el = el.parentElement) if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'hidden' && getComputedStyle(el).overflowX !== 'clip') pageWide = el.className || el.tagName
    return { wrap: wrap.scrollWidth > wrap.clientWidth + 50, pageWide, w: wrap.clientWidth, page: page?.clientWidth }
  }, sel)
  check('a 20 x 20 table scrolls sideways inside its own box', scroll.wrap, JSON.stringify(scroll))
  check('and the page never scrolls sideways', !scroll.pageWide, JSON.stringify(scroll))
  await shot('20x20')

  // 10. Paper, Light and Dark.
  await set([p('A reading list.'), table(4, 3, (r, k) => r === 0 ? ['Book', 'Author', 'Year'][k] : [['Essays', 'Montaigne', '1580'], ['Walden', 'Thoreau', '1854'], ['Meditations', 'Marcus Aurelius', '180']][r - 1][k]), p('After the table.')])
  for (const name of ['light', 'dark', 'paper']) {
    await c.theme(name)
    await wait(300)
    const t = await look()
    check(`${name}: header tinted apart from cells, borders drawn`, t.thBg !== t.tdBg && !/rgba\(0, 0, 0, 0\)/.test(t.border), JSON.stringify(t))
    await shot(`look-${name}`)
  }
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 400))
} finally {
  await c.close()
}
done()
