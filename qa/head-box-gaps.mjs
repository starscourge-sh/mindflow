// A heading row set flush on the box under it reads as one thing (11 Nov: Calendar's "Upcoming" head sat
// directly on its "Today, Wed 11 / Nothing more today" box). Walks every view and measures, for each bordered
// or filled box, the gap to a heading row just above it (a short line of words with no box of its own).
// Fewer than 4px is a fail; each is listed with its words. Light and dark pictures under QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/head-box-gaps.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go } = c
const shots = process.env.QA_SHOTS
const VIEWS = (process.env.VIEWS ?? 'home,today,inbox,calendar,upcoming,day,weekpage,monthpage,yearpage,review,articles,nuggets,all,media,feed,sources,goals,stats,map,powers,questions,matrix,queue,tags,lookups,routines,practices,alltasks,discarded,settings').split(',')

const flush = () => h.evaluate(() => {
  const out = []
  const boxed = (s) => {
    const fill = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent'
    const line = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' && !/rgba\(.*, 0\)$/.test(s.borderTopColor)
    return fill || line
  }
  const seen = (one) => { const r = one.getBoundingClientRect(); const s = getComputedStyle(one); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 }
  // Inside the page only: the tab strip is meant to sit on the page it names.
  const pages = [...document.querySelectorAll('[class*="@container/page"]')]
  for (const box of pages.flatMap((page) => [...page.querySelectorAll('*')])) {
    if (!(box instanceof HTMLElement) || box.closest('.tiptap, [role="menu"], [role="dialog"] [cmdk-list], svg, button, a, input, textarea, select, label')) continue
    const s = getComputedStyle(box)
    if (!boxed(s) || !seen(box) || s.position === 'absolute' || s.position === 'fixed') continue
    const r = box.getBoundingClientRect()
    if (r.height < 24 || r.width < 120) continue
    // The heading row: the element just before the box, or just before its nearest wrapper that starts where it does.
    let at = box
    while (at.parentElement && !at.previousElementSibling && Math.abs(at.parentElement.getBoundingClientRect().top - r.top) < 1) at = at.parentElement
    const head = at.previousElementSibling
    if (!(head instanceof HTMLElement) || !seen(head)) continue
    const hs = getComputedStyle(head)
    if (boxed(hs) || hs.position === 'absolute' || hs.position === 'fixed') continue
    const hr = head.getBoundingClientRect()
    const words = head.innerText.trim()
    if (!words || hr.height > 48 || hr.height < 12 || words.split('\n').length > 2) continue
    // Above it and side by side with it, not beside it in a row.
    if (hr.bottom > r.top + 1 || hr.right < r.left || hr.left > r.right) continue
    const gap = r.top - hr.bottom
    if (gap < 4) out.push({ gap: Math.round(gap * 10) / 10, head: words.replace(/\s+/g, ' ').slice(0, 50), box: (box.className?.toString?.() ?? '').slice(0, 70) })
  }
  return out
})

try {
  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    for (const view of VIEWS) {
      await go(view)
      await h.waitForTimeout(500)
      const found = await flush()
      check(`${theme}, ${view}: every heading row has room above its box`, !found.length, found.slice(0, 6).map((one) => `"${one.head}" ${one.gap}px over ${one.box}`).join(' | '))
      if (shots && (view === 'calendar' || view === 'inbox')) await h.screenshot({ path: `${shots}/gaps-${view}-${theme}.png` })
    }
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
