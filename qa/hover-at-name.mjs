// A hover card comes up at what is pointed at. Writing with a page open beside its list: a tag on the page's
// Properties shows its card under the tag, inside the page, not beside the page over the list (the user, 15 Nov 2026:
// "im hovering the haligtree tag, look at how far the popover comes up"; the page's scroller, under 80% of its pane,
// was taken for a narrow list). A row in the list still has its card beside the list.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/hover-at-name.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
// 1400 wide by default: the page then fills under 60% of the window and under 80% of its pane, as in the user's
// screenshot (a wider list beside it), which is when it was taken for a list. WIDTH and HEIGHT try other sizes.
const c = await sandbox({ width: Number(process.env.WIDTH ?? 1400), height: Number(process.env.HEIGHT ?? 900) })
const { h, v, send } = c
const card = async () => {
  await h.waitForSelector('[data-note-preview]', { timeout: 4000 }).catch(() => null)
  return h.evaluate(() => { const r = document.querySelector('[data-note-preview]')?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, bottom: r.bottom } : null })
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  // A #tag in a page's title is the page's tag (as qa/folders.mjs makes one); its chip is under Properties, opened if folded.
  // Long enough that its page scrolls, as the user's issue tracker does: the page's own scroller is what was misread.
  const lines = Array.from({ length: 80 }, (_, n) => ({ type: 'paragraph', content: [{ type: 'text', text: `Line ${n + 1} of a long page, so that it scrolls.` }] }))
  await v('item:save', id, { title: 'A page with a tag #physics', body: { type: 'doc', content: lines } })
  await h.waitForTimeout(600)
  await send('article', id)
  await h.waitForTimeout(1500)
  const tag = h.locator('[data-property="tags"] [data-tag-open="physics"]').first()
  if (!(await tag.isVisible().catch(() => false))) { await h.locator('button:has-text("Properties")').first().click().catch(() => {}); await h.waitForTimeout(500) }
  check('the page shows its tag in Properties', (await tag.count()) === 1)
  const at = await tag.boundingBox()
  const pane = await h.evaluate(() => { const r = document.querySelector('.note-pane')?.getBoundingClientRect(); return r ? { left: r.left } : null })
  const list = await h.evaluate(() => { const r = document.querySelector('[role="main"] [data-note-hover]:not(.note-pane [data-note-hover])')?.getBoundingClientRect(); return r ? { right: r.right } : null })
  check('the list and the page are side by side at this width', !!pane && !!list && list.right <= pane.left + 2, JSON.stringify({ pane, list }))
  // What the card's place is worked out from: the chip's scrolling page, its width, and the pane's (note-preview.tsx sideList).
  console.log('geometry', JSON.stringify(await h.evaluate(() => {
    const chip = document.querySelector('[data-property="tags"] [data-tag-open="physics"]')
    let at = chip?.parentElement
    while (at && at !== document.body) { const o = getComputedStyle(at).overflowY; if ((o === 'auto' || o === 'scroll') && at.scrollHeight > at.clientHeight) break; at = at.parentElement }
    const pane = at?.closest?.('[data-pane]')
    return { window: innerWidth, scroller: at?.getBoundingClientRect().width, scrollerClass: String(at?.className ?? '').slice(0, 40), pane: pane?.getBoundingClientRect().width }
  })))
  await tag.hover()
  const shown = await card()
  check('the tag\'s card comes up', !!shown)
  check('under the tag, within 40 px of its left', !!shown && !!at && Math.abs(shown.left - at.x) <= 40, JSON.stringify({ card: shown, tag: at }))
  check('inside the page, never over the list', !!shown && !!pane && shown.left >= pane.left, JSON.stringify({ card: shown, pane }))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
