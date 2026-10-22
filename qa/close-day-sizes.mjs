// Close the day at a small and a full window, light and dark: the sheet stays inside the window.
// Run: QA_SHOTS=dir QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-notes/main/index.js HALIGTREE_QA_AWAY=1 node qa/close-day-sizes.mjs
import { sandbox } from './sandbox-lib.mjs'

const { h, size, theme, close } = await sandbox({ width: 760, height: 540 })
const S = process.env.QA_SHOTS
const fails = []
try {
  for (const t of ['paper', 'dark']) {
    await theme(t)
    for (const [w, hh] of [[760, 540], [1680, 1050]]) {
      await size(w, hh)
      await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:close-day')))
      await h.waitForTimeout(1500)
      if (S) await h.screenshot({ path: `${S}/closeday-${w}-${t}.png` })
      const fits = await h.evaluate(() => {
        const el = document.querySelector('[data-close-day]')
        if (!el) return 'not open'
        const r = el.getBoundingClientRect()
        return r.left >= 0 && r.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1 ? 'fits' : `spills ${Math.round(r.left)}..${Math.round(r.right)} of ${innerWidth}`
      })
      console.log(fits === 'fits' ? 'ok  ' : 'FAIL', t, w, fits)
      if (fits !== 'fits') fails.push(`${t} ${w}`)
      await h.keyboard.press('Escape')
      await h.waitForTimeout(600)
    }
  }
} finally {
  await close()
}
console.log(fails.length ? `${fails.length} failed` : 'all passed')
process.exit(fails.length ? 1 : 0)
