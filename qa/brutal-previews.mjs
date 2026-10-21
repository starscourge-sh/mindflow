// In Brutal, Settings' small pictures stay drawings: their thin bars and
// frames get no hard shadow or card fill, which turned them into black
// blocks and doubled edges.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/brutal-previews.mjs
import { sandbox } from './sandbox-lib.mjs'
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h } = c
try {
  for (const theme of ['paper', 'dark']) {
    await c.theme(theme)
    await h.evaluate(() => { localStorage.setItem('style', 'brutal'); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) })
    await c.go('settings'); await h.waitForTimeout(900)
    await h.click('[data-section="Appearance"]'); await h.waitForTimeout(700)
    const bars = await h.evaluate(() => {
      const all = [...document.querySelectorAll('[data-preview] *')]
      return { seen: all.length, shadowed: all.filter((one) => { const s = getComputedStyle(one).boxShadow; return s !== 'none' && !/^rgba?\([^)]*\) 0px 0px 0px 0px$/.test(s) && !/0px 0px 0px [0-9.]+px/.test(s) }).length }
    })
    check(`${theme}: Brutal leaves the settings pictures' shapes flat`, bars.seen > 50 && bars.shadowed <= 2, JSON.stringify(bars))
  }
} finally { await c.close() }
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
