// A wide table scrolled sideways: the row grip stays at the edge where the rows are seen, never out over the
// block handle ("+" and the six dots) to its left, and the "+" bars and the column grip keep to the part in sight.
// Back at the start, the grip is where it was. The 350ms grace on leaving is kept. Light and dark, under QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/table-scrolled-grips.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 800 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const sel = '[data-open] .tiptap'
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const cell = (kind, text) => ({ type: kind, content: [p(text)] })
const table = (rows, cols) => ({
  type: 'table',
  content: Array.from({ length: rows }, (_, r) => ({ type: 'tableRow', content: Array.from({ length: cols }, (_, k) => cell(r === 0 ? 'tableHeader' : 'tableCell', `Column ${k + 1} row ${r} words`)) }))
})
const rect = (q) => h.evaluate((q) => { const one = document.querySelector(q); if (!one) return null; const r = one.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom } }, q)
const overlaps = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const state = () => h.evaluate(() => {
  const box = (one) => { if (!one) return null; const r = one.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
  const pill = (one) => { if (!one) return null; const r = one.getBoundingClientRect(); const s = getComputedStyle(one, '::after'); const w = parseFloat(s.width), hh = parseFloat(s.height); return { x: r.x + (r.width - w) / 2, y: r.y + (r.height - hh) / 2, w, h: hh } }
  const handle = document.querySelector('.tiptap-drag-handle')
  const shown = handle && Number(getComputedStyle(handle).opacity) > 0.05 && getComputedStyle(handle).visibility !== 'hidden'
  return {
    row: pill(document.querySelector('.tiptap-table-grip.is-row')),
    col: box(document.querySelector('.tiptap-table-grip.is-column')),
    addRow: box(document.querySelector('.tiptap-table-add.is-row')),
    addCol: box(document.querySelector('.tiptap-table-add.is-column')),
    wrap: box(document.querySelector('[data-open] .tableWrapper')),
    handle: shown ? box(handle) : null,
    scrolled: document.querySelector('[data-open] .tableWrapper')?.scrollLeft ?? 0
  }
})

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Wide table', body: { type: 'doc', content: [p('A wide one.'), table(5, 12), p('After it.')] } })
  await c.send('article', id); await wait(1800)
  await h.waitForSelector(`${sel} table`)
  const wrap = await rect('[data-open] .tableWrapper')
  const cellOf = (r, k) => rect(`${sel} table tr:nth-child(${r + 1}) > :nth-child(${k + 1})`)
  const hoverRow = async (r) => {
    const w = await rect('[data-open] .tableWrapper')
    const one = await cellOf(r, 0)
    await h.mouse.move(w.x + 60, one.y + one.h / 2, { steps: 4 }); await wait(250)
  }
  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    await h.evaluate(() => { const w = document.querySelector('[data-open] .tableWrapper'); w.scrollLeft = 0 })
    await wait(200)
    await hoverRow(0)
    const start = await state()
    check(`${theme}: at the start the row grip shows left of the table`, !!start.row && start.row.x + start.row.w <= start.wrap.x + 2, JSON.stringify(start.row))
    if (shots) await h.screenshot({ path: `${shots}/table-scrolled-start-${theme}.png` })
    // Scrolled to the middle.
    await h.evaluate(() => { const w = document.querySelector('[data-open] .tableWrapper'); w.scrollLeft = (w.scrollWidth - w.clientWidth) / 2 })
    await wait(150)
    await hoverRow(0)
    const mid = await state()
    check(`${theme}: the table is scrolled to its middle`, mid.scrolled > 100, `${mid.scrolled}px`)
    check(`${theme}: scrolled, the row grip is where it was at the start`, !!mid.row && Math.abs(mid.row.x - start.row.x) <= 1.5, `start ${start.row?.x.toFixed(1)}, now ${mid.row?.x.toFixed(1)}`)
    check(`${theme}: scrolled, the row grip never lies over the block handle`, !overlaps(mid.row, mid.handle), JSON.stringify({ row: mid.row, handle: mid.handle }))
    check(`${theme}: scrolled, the add-row bar keeps to the table in sight`, !!mid.addRow && mid.addRow.x >= mid.wrap.x - 1 && mid.addRow.x + mid.addRow.w <= mid.wrap.x + mid.wrap.w + 1, JSON.stringify(mid.addRow))
    check(`${theme}: scrolled, the add-column bar sits by the table's seen right edge`, !!mid.addCol && mid.addCol.x <= mid.wrap.x + mid.wrap.w + 8, JSON.stringify(mid.addCol))
    check(`${theme}: scrolled, the column grip keeps to the table in sight`, !!mid.col && mid.col.x >= mid.wrap.x - 1 && mid.col.x + mid.col.w <= mid.wrap.x + mid.wrap.w + 1, JSON.stringify(mid.col))
    if (shots) await h.screenshot({ path: `${shots}/table-scrolled-middle-${theme}.png` })
    // The pointer out over the block handle's gutter, left of the scrolled table: no row is pointed at from there
    // beyond the grip's own margin, and the grace still holds the grips 350ms.
    await h.mouse.move(wrap.x - 120, (await cellOf(2, 0)).y + 10, { steps: 3 })
    await wait(120)
    const held = await state()
    check(`${theme}: just after leaving, the grips are still there (the grace)`, !!held.row)
    await wait(600)
    check(`${theme}: after the grace, they are gone`, !(await state()).row)
    // Back to the start.
    await h.evaluate(() => { document.querySelector('[data-open] .tableWrapper').scrollLeft = 0 })
    await wait(150)
    await hoverRow(1)
    const back = await state()
    check(`${theme}: back at the start, the row grip is where it was`, !!back.row && Math.abs(back.row.x - start.row.x) <= 1.5, `${back.row?.x}`)
  }
  check('no errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
