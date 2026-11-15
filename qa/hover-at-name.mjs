// A hover card comes up at what is pointed at. Writing with a page open beside its list: a tag on the page's
// Properties shows its card under the tag, inside the page, not beside the page over the list (the user, 15 Nov 2026:
// "im hovering the haligtree tag, look at how far the popover comes up"; the page's scroller, under 80% of its pane,
// was taken for a narrow list). A row in the list still has its card beside the list.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/hover-at-name.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1600, height: 900 })
const { h, v, send } = c
const card = async () => {
  await h.waitForSelector('[data-note-preview]', { timeout: 4000 }).catch(() => null)
  return h.evaluate(() => { const r = document.querySelector('[data-note-preview]')?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, bottom: r.bottom } : null })
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'A page with a tag', tags: ['physics'] })
  await h.waitForTimeout(600)
  await send('article', id)
  await h.waitForTimeout(1500)
  const tag = h.locator('[data-tag-open="physics"]').first()
  check('the page shows its tag in Properties', (await tag.count()) === 1)
  const at = await tag.boundingBox()
  const pane = await h.evaluate(() => { const r = document.querySelector('.note-pane')?.getBoundingClientRect(); return r ? { left: r.left } : null })
  const list = await h.evaluate(() => { const r = document.querySelector('[role="main"] [data-note-hover]:not(.note-pane [data-note-hover])')?.getBoundingClientRect(); return r ? { right: r.right } : null })
  check('the list and the page are side by side at this width', !!pane && !!list && list.right <= pane.left + 2, JSON.stringify({ pane, list }))
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
