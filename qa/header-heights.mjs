// Every page's header row: the buttons side by side in it stand the same height (a 32px button beside a 28px one
// looked unfinished, 7 Nov: "Restore all" beside "Hold to empty" in the Bin).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/header-heights.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 820 })
const { h, v, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const PAGES = (process.env.QA_PAGES ?? 'home,inbox,tasks,articles,questions,nuggets,feed,review,calendar,settings,day,weekpage,monthpage,yearpage,goals,sources,tags,stats,bin,media').split(',')
try {
  await v('settings:set', { hintRate: 0 })
  // Something in the Bin, so its buttons show.
  const items = await v('items', 'capture').catch(() => [])
  if (items[0] && items[1]) await v('item:bin', [items[0].id, items[1].id]).catch(() => {})
  for (const page of PAGES) {
    await go(page); await wait(1000)
    const rows = await h.evaluate(() => {
      const card = [...document.querySelectorAll('[data-pane-card]')].find((one) => one.getClientRects().length)
      if (!card) return []
      const top = card.getBoundingClientRect().top
      // Buttons with words, in the page's top band, grouped by the line they sit on.
      const buttons = [...card.querySelectorAll('button, [role=button]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 40 && r.height >= 20 && r.height <= 44 && r.top - top < 130 && (b.textContent ?? '').trim().length > 1 && !b.closest('[role=tablist], [data-tabs], [data-chips], [role=radiogroup]') && getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)' || (r.width > 40 && r.top - top < 130 && getComputedStyle(b).borderTopWidth !== '0px' && (b.textContent ?? '').trim().length > 1 && !b.closest('[role=tablist], [data-tabs], [data-chips], [role=radiogroup]')) })
      const lines = {}
      for (const b of buttons) { const r = b.getBoundingClientRect(); const mid = Math.round((r.top + r.height / 2) / 6); (lines[mid] ??= []).push({ t: b.textContent.trim().slice(0, 20), hgt: Math.round(r.height) }) }
      return Object.values(lines).filter((one) => one.length > 1)
    })
    const off = rows.filter((line) => Math.max(...line.map((b) => b.hgt)) - Math.min(...line.map((b) => b.hgt)) > 2)
    check(`${page}: buttons side by side in the header are one height`, off.length === 0, JSON.stringify(off))
  }
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
done()
