// Every page, scrolled: its words fade out under the top edge of the page, never cut off hard against it.
// For each page, the scroller that holds it is scrolled 400px, and its top edge checked for a fade (a mask).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=/abs/dir node qa/page-tops.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 800 })
const { h, v, go, close } = s
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const PAGES = (process.env.QA_PAGES ?? 'home,inbox,tasks,articles,questions,nuggets,feed,review,calendar,settings,day,weekpage,monthpage,yearpage,goals,sources,tags,stats,bin').split(',')
try {
  await v('settings:set', { hintRate: 0 })
  for (const page of PAGES) {
    await go(page); await wait(1200)
    const found = await h.evaluate(() => {
      const card = [...document.querySelectorAll('[data-pane-card]')].find((one) => one.getClientRects().length)
      if (!card) return { none: 'no page card' }
      const top = card.getBoundingClientRect().top
      // The biggest scroller near the top of the page: the page's own.
      const all = [...card.querySelectorAll('*')].filter((one) => { const st = getComputedStyle(one); return /(auto|scroll)/.test(st.overflowY) && one.scrollHeight > one.clientHeight + 120 && one.getBoundingClientRect().top - top < 80 && one.clientWidth > 300 })
      const box = all.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]
      if (!box) return { none: 'nothing to scroll' }
      box.scrollTop = 120
      return { cls: String(box.className).slice(0, 80) }
    })
    if (found.none) { console.log(`  ${page}: ${found.none}`); continue }
    await wait(300); for (let i = 0; i < 4; i++) { await h.screenshot(); await wait(40) }
    const mask = await h.evaluate(() => {
      const card = [...document.querySelectorAll('[data-pane-card]')].find((one) => one.getClientRects().length)
      const top = card.getBoundingClientRect().top
      const box = [...card.querySelectorAll('*')].filter((one) => one.scrollTop >= 100).sort((a, b) => b.clientWidth - a.clientWidth)[0]
      // A fade is a mask on the scroller or on something it sits in, inside the page.
      for (let at = box; at && at !== card.parentElement; at = at.parentElement) { const m = getComputedStyle(at).maskImage; if (m && m !== 'none') return { faded: true, gap: Math.round(box.getBoundingClientRect().top - top) } }
      return { faded: false, gap: Math.round(box.getBoundingClientRect().top - top) }
    })
    check(`${page}: scrolled, its top fades rather than cuts`, mask.faded || mask.gap > 40, `${JSON.stringify(mask)} ${found.cls}`)
    if (shots) await h.screenshot({ path: `${shots}/${page}.png`, clip: { x: 260, y: 40, width: 1100, height: 220 } })
  }
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
done()
