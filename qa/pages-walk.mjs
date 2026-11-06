// Every page from the sidebar, walked as a person would, light and dark, at 1280 and 1600 wide: a frame of each, and
// the page's bar measured against Sources' (height and left edge), and how much of the content area its widest list
// uses when it holds 10 or more short rows. Prints one line a page; the verdicts are read from the frames by eye.
// (Map and Media are another helper's: framed for the list only.)
//
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/pages-walk.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const PAGES = ['inbox', 'home', 'day', 'weekpage', 'monthpage', 'yearpage', 'articles', 'questions', 'nuggets', 'review', 'today', 'calendar', 'feed', 'goals', 'queue', 'tags', 'sources', 'stats', 'map', 'media', 'discarded', 'archived', 'pinned', 'recent', 'powers']
const { h, go, size, both, close } = await sandbox({ width: 1280, height: 860 })
const shots = process.env.QA_SHOTS
const measure = () => h.evaluate(() => {
  const section = [...document.querySelectorAll('[role="main"] section, main section')].find((one) => one.offsetParent) ?? document.querySelector('section')
  const bar = section?.querySelector(':scope > header')
  const area = section?.getBoundingClientRect()
  // The widest run of short rows: a parent holding 10+ [data-row] children-or-descendants of one line each.
  const rows = [...document.querySelectorAll('[data-row]')].filter((one) => one.offsetParent && one.getBoundingClientRect().height < 64)
  const lefts = new Set(rows.map((one) => Math.round(one.getBoundingClientRect().left)))
  const widest = rows.reduce((most, one) => Math.max(most, one.getBoundingClientRect().width), 0)
  return { bar: bar ? Math.round(bar.getBoundingClientRect().height) : null, barLeft: bar ? Math.round(bar.getBoundingClientRect().left) : null, area: area ? Math.round(area.width) : null, rows: rows.length, columns: lefts.size, widest: Math.round(widest) }
})
try {
  for (const [w, hh] of [[1280, 860], [1600, 1000]]) {
    await size(w, hh)
    for (const id of PAGES) {
      await go(id)
      await h.waitForTimeout(700)
      const m = await measure()
      const half = m.rows >= 10 && m.columns === 1 && m.area && m.widest < m.area / 2
      console.log(`${w} ${id.padEnd(10)} bar ${m.bar}@${m.barLeft}  rows ${m.rows} in ${m.columns} col, widest ${m.widest} of ${m.area}${half ? '  <- under half the page' : ''}`)
      if (shots) await both(`${shots}/walk-${w}-${id}`)
    }
  }
} finally {
  await close()
}
