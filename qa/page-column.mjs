// Every page on the one shared page column: each page in the sidebar opened in
// turn, at a wide and a narrow window, in paper and dark, and the box its
// content actually fills measured against the column. A page that sets its own
// width (the Bin did) fails here.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/page-column.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

// Pages laid out as a board or a canvas use every bit of the width on purpose.
const WIDE = new Set(['calendar', 'week', 'matrix', 'map', 'home'])
// Pages you write or read in sit on the shared reading column (page-narrow) or the day's sheet (page-sheet), as a note does.
const READING = new Set(['day', 'weekpage', 'monthpage', 'review'])
const PAGES = (process.env.PAGES ?? 'inbox,all,review,day,weekpage,monthpage,today,upcoming,routines,later,tomorrow,nuggets,articles,questions,lookups,goals,queue,tags,sources,stats,discarded,archived,powers').split(',')
const SIZES = process.env.SIZES ? process.env.SIZES.split(',').map((one) => one.split('x').map(Number)) : [[1600, 1000], [900, 700]]
const THEMES = (process.env.THEMES ?? 'light,dark').split(',')

/** The column, and the smallest box holding everything written on the page below its header line. */
const measure = () => {
  const columns = [...document.querySelectorAll('.page-column:not(header)')].filter((one) => one.offsetParent && one.getBoundingClientRect().width > 200)
  const column = columns[0]
  if (!column) return { column: null }
  const texts = []
  const walk = document.createTreeWalker(column, NodeFilter.SHOW_TEXT)
  for (let node; (node = walk.nextNode());) {
    if (!node.textContent.trim()) continue
    const el = node.parentElement
    if (!el?.offsetParent || el.closest('[data-sonner-toaster], [role=tooltip], [data-back-to-top]')) continue
    const box = el.getBoundingClientRect()
    if (box.width && box.bottom > 0 && box.top < innerHeight) texts.push(el)
  }
  const c = column.getBoundingClientRect()
  if (!texts.length) return { column: Math.round(c.width), content: null }
  // The lowest box holding every one of them.
  let common = texts[0]
  while (common && !texts.every((one) => common.contains(one))) common = common.parentElement
  const b = common.getBoundingClientRect()
  const reading = common.closest('.page-narrow, .page-sheet')
  const empty = !!common.closest('[data-empty]')
  return { reading: reading ? Math.round(reading.getBoundingClientRect().width) === Math.round(parseFloat(getComputedStyle(reading).maxWidth)) || Math.round(reading.getBoundingClientRect().width) >= Math.round(c.width) - 64 : false, empty, column: Math.round(c.width), content: Math.round(b.width), left: Math.round(b.left - c.left), right: Math.round(c.right - b.right), tag: `${common.tagName.toLowerCase()}.${String(common.className).split(' ').slice(0, 4).join('.')}` }
}

const c = await sandbox({ width: 1600, height: 1000 })
try {
  for (const theme of THEMES) {
    await c.theme(theme)
    for (const [w, hh] of SIZES) {
      await c.size(w, hh)
      for (const page of PAGES) {
        await c.go(page)
        await c.h.waitForTimeout(400)
        const m = await c.h.evaluate(measure)
        if ((w === SIZES[0][0] && theme === THEMES[0]) || process.env.ALLSHOTS) await c.h.screenshot({ path: `${dir}/col-${page}-${w}-${theme}.png` })
        if (!m.column) { check(`${page} at ${w} ${theme}: on the shared page column`, WIDE.has(page), 'no page column'); continue }
        // Rows and paragraphs sit inside the column's own padding, a few px either way; a page of its own width is far off.
        const off = m.content === null || m.empty ? 0 : m.column - m.content
        if (READING.has(page)) { check(`${page} at ${w} ${theme}: on the shared reading column`, m.reading || off <= 64, `column ${m.column}, content ${m.content} ${m.tag ?? ''}`); continue }
        check(`${page} at ${w} ${theme}: content fills the page column`, off <= 64, `column ${m.column}, content ${m.content}, left ${m.left}, right ${m.right} ${m.tag ?? ''}`)
      }
    }
  }
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
