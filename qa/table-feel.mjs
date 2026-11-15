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
// Every cue asked for, sounds on or off (lib/sound.ts keeps them on window.haligtreeCued).
const cued = () => h.evaluate(() => [...(window.haligtreeCued ?? [])])
const unCue = () => h.evaluate(() => { if (window.haligtreeCued) window.haligtreeCued.length = 0 })
// Frames through each change of state, every 50ms, for reading by eye.
const frames = process.env.QA_FRAMES
const frame = async (name) => frames && h.screenshot({ path: `${frames}/${name}.png` })
const overlaps = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const viewport = () => h.evaluate(() => ({ w: innerWidth, h: innerHeight }))

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
      border: b.borderTopColor,
      // Every corner that could round the table: the table, its scrolling box, and the corner cells (the header's tint).
      radius: Math.max(...[wrap.querySelector('table'), wrap, th, wrap.querySelector('tr:last-child > :last-child')].map((one) => one ? Math.max(...['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].map((at) => parseFloat(getComputedStyle(one)[`border${at}Radius`]) || 0)) : 0)),
      thColor: a.color, tdColor: b.color, thSize: parseFloat(a.fontSize), tdSize: parseFloat(b.fontSize)
    }
  }, sel)
  const L = await look()
  console.log('LOOK', JSON.stringify(L))
  check('the header row is set apart: a tint and heavier words, one size with the cells', L.thBg !== L.tdBg && L.thWeight >= 600 && L.thSize === L.tdSize, `${L.thBg} / ${L.tdBg} / ${L.thWeight}`)
  check('cells have room: 8px above, 12px at the sides, rows at least 36px', L.padTop >= 8 && L.padLeft >= 12 && L.rowH >= 36, JSON.stringify(L))
  check('the table has sharp corners (the user, 15 Nov 2026: "i want tables to have sharp corners")', L.radius === 0, String(L.radius))
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
    await unCue()
    await h.mouse.down(); await h.mouse.up(); await wait(300)
    check('a click on the bottom "+" adds a row', (await grid())?.length === 5, JSON.stringify(await grid()))
    const plusCues = await cued()
    check('and it answers with the "added" cue, once', plusCues.filter((one) => one === 'added').length === 1, JSON.stringify(plusCues))
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
    const start = await cellBox(1, 0)
    await unCue()
    await h.mouse.down()
    // The lifted copy, measured at each step: it must keep the grab offset.
    const followed = []
    for (let i = 1; i <= 6; i++) {
      const y = gy + ((r3.y + r3.h / 2 - gy) * i) / 6
      await h.mouse.move(gx, y); await wait(50)
      const copy = await box('.tiptap-table-carried')
      followed.push(copy ? Math.round(copy.y - (y - gy) - start.y) : null)
      await frame(`row-drag-${i}`)
    }
    await shot('row-drag')
    // Its cells line up with the table's own columns (they used to space themselves their own way).
    const lined = await h.evaluate(() => {
      const copy = document.querySelector('.tiptap-table-carried tr')
      const table = [...document.querySelectorAll('.tiptap.ProseMirror table')].find((one) => !one.closest('.tiptap-table-carried'))
      if (!copy || !table) return null
      const mine = [...copy.cells].map((one) => Math.round(one.getBoundingClientRect().width))
      const theirs = [...table.rows[0].cells].map((one) => Math.round(one.getBoundingClientRect().width))
      return { mine, theirs }
    })
    check('the carried row\'s columns are the table\'s widths (within 2px)', !!lined && lined.mine.length === lined.theirs.length && lined.mine.every((w, i) => Math.abs(w - lined.theirs[i]) <= 2), JSON.stringify(lined))
    const copyText = await h.evaluate(() => document.querySelector('.tiptap-table-carried')?.textContent ?? '')
    check('mid-drag the row itself is carried: a lifted copy of it under the pointer', /Essays.*Montaigne.*1580/.test(copyText), copyText)
    check('and it tracks the pointer 1:1, keeping where it was taken (within 2px)', followed.every((one) => one !== null && Math.abs(one) <= 2), JSON.stringify(followed))
    check('the place it left is faded while it is in the air', !!(await box('.tiptap-table-vacated')))
    check('a landing line says where it will go', !!(await box('.tiptap-table-landing.is-row')))
    await h.mouse.up()
    for (let i = 0; i < 5; i++) (await frame(`row-settle-${i}`), await wait(50))
    await wait(150)
    const after = await grid()
    check('a row dragged by its grip moves', after?.[3]?.[0] === 'Essays', JSON.stringify(after?.map((row) => row[0])))
    check('and the copy settles in and goes', !(await box('.tiptap-table-carried')))
    const dragCues = await cued()
    check('picking it up lifts (the "lift" cue) and dropping it moves (the "shift" cue), once each', dragCues.filter((one) => one === 'lift').length === 1 && dragCues.filter((one) => one === 'shift').length === 1, JSON.stringify(dragCues))
    await h.keyboard.press('Meta+z'); await wait(200)

    // Esc mid-drag puts it back.
    const before = JSON.stringify(await grid())
    await h.mouse.move(r1.x + 10, r1.y + r1.h / 2, { steps: 3 }); await wait(200)
    const g2 = await box('.tiptap-table-grip.is-row')
    await h.mouse.move(g2.x + g2.w / 2, g2.y + g2.h / 2); await wait(80)
    await unCue()
    await h.mouse.down()
    for (let i = 1; i <= 4; i++) (await h.mouse.move(g2.x + g2.w / 2, g2.y + g2.h / 2 + i * 20), await wait(40))
    await h.keyboard.press('Escape'); await wait(60)
    await frame('row-esc')
    await h.mouse.up(); await wait(300)
    check('Esc mid-drag puts the row back where it was', JSON.stringify(await grid()) === before, JSON.stringify(await grid()))
    check('and answers with the soft "stay" cue, nothing moved', (await cued()).includes('stay') && !(await cued()).includes('shift'), JSON.stringify(await cued()))
    check('Esc leaves the note open', !!(await h.$(sel)))
  } else check('a row grip shows on hover', false)

  // 6b. A column dragged by its grip.
  {
    const k0 = await cellBox(1, 0)
    await h.mouse.move(k0.x + 10, k0.y + 10, { steps: 3 }); await wait(200)
    const colGrip = await box('.tiptap-table-grip.is-column')
    if (colGrip) {
      const gx = colGrip.x + colGrip.w / 2, gy = colGrip.y + colGrip.h / 2
      const head = await cellBox(0, 0)
      const k2 = await cellBox(1, 2)
      await h.mouse.move(gx, gy); await wait(80)
      await unCue()
      await h.mouse.down()
      const followed = []
      for (let i = 1; i <= 6; i++) {
        const x = gx + ((k2.x + k2.w / 2 - gx) * i) / 6
        await h.mouse.move(x, gy); await wait(50)
        const copy = await box('.tiptap-table-carried')
        followed.push(copy ? Math.round(copy.x - (x - gx) - head.x) : null)
        await frame(`column-drag-${i}`)
      }
      const copyText = await h.evaluate(() => document.querySelector('.tiptap-table-carried')?.textContent ?? '')
      check('mid-drag the column itself is carried, header to last row', /Book.*Essays.*Walden.*Meditations/.test(copyText), copyText)
      check('and it tracks the pointer 1:1 (within 2px)', followed.every((one) => one !== null && Math.abs(one) <= 2), JSON.stringify(followed))
      await h.mouse.up()
      for (let i = 0; i < 5; i++) (await frame(`column-settle-${i}`), await wait(50))
      await wait(150)
      const moved = (await grid())?.[0]
      check('a column dragged by its grip moves', moved?.[2] === 'Book', JSON.stringify(moved))
      check('with the "lift" and "shift" cues', (await cued()).includes('lift') && (await cued()).includes('shift'), JSON.stringify(await cued()))
      await h.keyboard.press('Meta+z'); await wait(200)
    } else check('a column grip shows on hover', false)
  }

  // 7. The row and column menus.
  const openMenu = async (axis, r, k) => {
    const at = await cellBox(r, k)
    await h.mouse.move(at.x + 10, at.y + 10, { steps: 3 }); await wait(200)
    const g = await box(`.tiptap-table-grip.is-${axis}`)
    if (!g) return null
    await unCue()
    await h.mouse.click(g.x + g.w / 2, g.y + g.h / 2)
    for (let i = 0; i < 6; i++) (await frame(`${axis}-menu-open-${i}`), await wait(50))
    await wait(50)
    // 28px at the app's 100% size: 1.75rem, the right-click menu's own row (min-h-7).
    return h.evaluate(() => [...document.querySelectorAll('.tiptap-table-menu button')].map((one) => ({ text: one.textContent.trim(), icon: !!one.querySelector('svg'), height: Math.round(one.getBoundingClientRect().height / parseFloat(getComputedStyle(document.documentElement).fontSize) * 16), cursor: getComputedStyle(one).cursor })))
  }
  const rowMenu = await openMenu('row', 2, 1)
  await shot('row-menu')
  console.log('ROW MENU', JSON.stringify(rowMenu))
  check('a row grip opens the row menu: above, below, delete', ['Insert row above', 'Insert row below', 'Delete row'].every((one) => rowMenu?.some((row) => row.text === one)), JSON.stringify(rowMenu?.map((row) => row.text)))
  check('every row-menu line has an icon, the hand and 28px height', rowMenu?.length && rowMenu.every((one) => one.icon && one.cursor === 'pointer' && one.height === 28), JSON.stringify(rowMenu))
  // Where it opened: clear of the row it acts on and of the window's edges.
  const clear = async (cells) => {
    const menu = await box('.tiptap-table-menu')
    const all = await Promise.all(cells.map(([r, k]) => cellBox(r, k)))
    const vp = await viewport()
    const room = menu && Math.min(menu.x, menu.y, vp.w - menu.x - menu.w, vp.h - menu.y - menu.h)
    return { menu, hidden: all.filter((one) => overlaps(menu, one)).length, room }
  }
  const rowSpot = await clear([[2, 0], [2, 1], [2, 2]])
  check('the row menu opens beside the row, not over it', rowSpot.menu && rowSpot.hidden === 0, JSON.stringify(rowSpot))
  check('and 12px or more from every window edge', rowSpot.room >= 12, JSON.stringify(rowSpot))
  check('opening the row menu plays the menu "open" cue, once', (await cued()).filter((one) => one === 'open').length === 1, JSON.stringify(await cued()))
  await h.keyboard.press('Escape'); await wait(150)
  const colMenu = await openMenu('column', 2, 0)
  await shot('column-menu')
  check('a column grip opens the column menu: left, right, sort, delete', ['Insert column left', 'Insert column right', 'Sort column A to Z', 'Delete column'].every((one) => colMenu?.some((row) => row.text === one)), JSON.stringify(colMenu?.map((row) => row.text)))
  check('every column-menu line has an icon, the hand and 28px height', colMenu?.length && colMenu.every((one) => one.icon && one.cursor === 'pointer' && one.height === 28), JSON.stringify(colMenu))
  const colSpot = await clear([[0, 0], [1, 0], [2, 0], [3, 0]])
  check('the column menu opens beside the column, not over it', colSpot.menu && colSpot.hidden === 0, JSON.stringify(colSpot))
  check('and 12px or more from every window edge', colSpot.room >= 12, JSON.stringify(colSpot))
  check('opening the column menu plays the menu "open" cue, once', (await cued()).filter((one) => one === 'open').length === 1, JSON.stringify(await cued()))
  const sortRow = await h.evaluate(() => [...document.querySelectorAll('.tiptap-table-menu button')].findIndex((one) => one.textContent.trim() === 'Sort column A to Z'))
  if (sortRow >= 0) {
    const sortBox = await h.evaluate((i) => { const r = document.querySelectorAll('.tiptap-table-menu button')[i].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, sortRow)
    await unCue()
    await h.mouse.move(sortBox.x, sortBox.y, { steps: 3 }); await wait(80)
    await h.mouse.click(sortBox.x, sortBox.y); await wait(300)
    const sorted = (await grid()).map((row) => row[0])
    check('"Sort column A to Z" sorts the rows under the header', JSON.stringify(sorted) === JSON.stringify(['Book', 'Essays', 'Meditations', 'Walden']), JSON.stringify(sorted))
    check('choosing it plays its cue ("shift"), once', (await cued()).filter((one) => one === 'shift').length === 1, JSON.stringify(await cued()))
  }
  // A column near the window's top: still clear of it, and of the column.
  await h.keyboard.press('Escape'); await wait(100)
  await h.evaluate((sel) => document.querySelector(`${sel} table`).scrollIntoView({ block: 'start' }), sel); await wait(250)
  const topMenu = await openMenu('column', 2, 1)
  const topSpot = await clear([[0, 1], [1, 1], [2, 1], [3, 1]])
  await frame('column-menu-near-top')
  check('near the top of the window the column menu still leaves the column in view', topMenu?.length && topSpot.hidden === 0 && topSpot.room >= 12, JSON.stringify(topSpot))
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
