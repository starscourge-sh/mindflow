// Settings, Celebrations: each moment's three choices ("Haligtree's drawing" or
// "Just the tick", "Your file", "Giphy") are whole at every width, wrapping to
// a second line rather than running past the row's edge.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/moment-chips.mjs
import { sandbox } from './sandbox-lib.mjs'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h } = c
try {
  for (const [w, ht] of [[900, 700], [1300, 900], [1700, 1000]]) {
    await c.size(w, ht)
    await c.go('settings'); await h.waitForTimeout(900)
    await h.click('[data-section="Scenery"]'); await h.waitForTimeout(800)
    const cut = await h.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-moment-status]')].map((one) => one.parentElement)
      const bad = []
      for (const row of rows) {
        const edge = row.getBoundingClientRect()
        for (const chip of row.querySelectorAll('button')) {
          const r = chip.getBoundingClientRect()
          if (r.width && (r.right > edge.right + 1 || chip.scrollWidth > chip.clientWidth + 1)) bad.push(chip.textContent.trim())
        }
      }
      return { rows: rows.length, bad }
    })
    check(`${w}x${ht}: every moment's choices are whole`, cut.rows > 3 && !cut.bad.length, JSON.stringify(cut))
  }
} finally { await c.close() }
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
