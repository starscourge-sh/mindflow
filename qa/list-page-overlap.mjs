// The list's header (its tabs, count and buttons) and the page open beside it
// (its "1 / 12 ↓ ↑" pager and top row) never draw on top of each other, at
// any width: Goals, Gems, Writing, Questions, Review, Sources, Tasks and the Inbox at 700, 900, 1200 and 1300px,
// with the list dragged to its narrowest.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-g/main/index.js HALIGTREE_QA_AWAY=1 node qa/list-page-overlap.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, go, size, errors } = c
const VIEWS = (process.env.VIEWS ?? 'goals,nuggets,articles,questions,review,sources,all,inbox').split(',')
try {
  // The list dragged as narrow as it goes (280px), where its header is most crowded.
  await h.evaluate(() => localStorage.setItem('list-width', '280'))
  await h.reload()
  await h.waitForTimeout(1500)
  for (const view of VIEWS) {
    for (const width of (process.env.WIDTHS ?? '700,900,1200,1300').split(',').map(Number)) {
      await size(width, 800)
      await go(view)
      // One open beside the list, if the list has rows.
      await h.evaluate(() => document.querySelector('[data-row][data-id]')?.click())
      await h.waitForTimeout(900)
      if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/${view}-${width}.png` })
      const found = await h.evaluate(() => {
        const shown = (node) => { const r = node.getBoundingClientRect(); const s = getComputedStyle(node); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && node.checkVisibility?.() !== false }
        const leaves = (root) => root ? [...root.querySelectorAll('button, [data-stepper], span, a')].filter((node) => shown(node) && !node.querySelector('button, span, a')) : []
        const header = [...document.querySelectorAll('header, [data-list-tabs]')].filter(shown)
        const pane = [...document.querySelectorAll('[data-open], [data-stepper]')].filter(shown)
        const a = header.flatMap(leaves)
        const b = [...new Set(pane.flatMap((one) => one.matches('[data-stepper]') ? [one, ...leaves(one)] : leaves(one)))].filter((node) => !header.some((one) => one.contains(node)))
        const hits = []
        for (const x of a) for (const y of b) {
          const p = x.getBoundingClientRect(), q = y.getBoundingClientRect()
          const w = Math.min(p.right, q.right) - Math.max(p.left, q.left), hh = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)
          if (w > 1 && hh > 1) hits.push(`${x.textContent.trim().slice(0, 20) || x.tagName} x ${y.textContent.trim().slice(0, 20) || y.tagName}`)
        }
        // Nothing in the list's header runs past its own column (it would be cut off, or once drew over the page).
        const over = header.filter((one) => one.matches('header') && one.scrollWidth > one.clientWidth + 1).map((one) => `${one.scrollWidth}>${one.clientWidth}`)
        // And no button in it is cut off by the line it sits in (the ⋯ once was, a dot of it left).
        const cut = header.flatMap((one) => [...one.querySelectorAll('button')]).filter((one) => {
          const r = one.getBoundingClientRect(); if (!r.width) return false
          for (let up = one.parentElement; up && up !== document.body; up = up.parentElement) {
            if (getComputedStyle(up).overflowX === 'visible') continue
            const box = up.getBoundingClientRect()
            if (r.right > box.right + 1 || r.left < box.left - 1) return true
          }
          return false
        }).map((one) => one.getAttribute('aria-label') || one.textContent.trim().slice(0, 16))
        over.push(...cut.map((one) => `cut: ${one}`))
        return { over, headers: a.length, pane: b.length, stepper: !!document.querySelector('[data-stepper]'), hits: [...new Set(hits)].slice(0, 4) }
      })
      check(`${view} at ${width}px: the list's header and the page beside it do not overlap`, !found.hits.length, JSON.stringify(found))
      check(`${view} at ${width}px: everything in the list's header fits its column`, !found.over.length, JSON.stringify(found.over))
    }
  }
  check('no errors', !errors.length, errors.join('\n'))
} finally {
  await c.close()
}
done()
