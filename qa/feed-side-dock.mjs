// The Feed's side column is docked at the page's right edge, the window's
// height, as a book's panel in Media is: never floating in the middle with page
// to its right, never cut off at its foot. The posts scroll by themselves.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=/tmp/feed-dock node qa/feed-side-dock.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.SHOT ?? '/tmp/feed-side-dock'
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await go('feed'); await wait(2500)
  const read = () => h.evaluate(() => {
    const side = document.querySelector('[data-feed-side], [data-liked-side]')
    const page = document.querySelector('[data-page=feed]') ?? side?.closest('section')
    if (!side || !page) return null
    const r = side.getBoundingClientRect(), p = page.getBoundingClientRect()
    const posts = document.querySelector('[data-feed], [data-feed-liked]')
    let scroller = posts?.parentElement
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    return { right: Math.round(p.right - r.right), bottom: Math.round(p.bottom - r.bottom), sideInPostsScroller: !!scroller?.contains(side) }
  })
  const feed = await read()
  check('the Feed\'s side column reaches the page\'s right edge and foot', !!feed && Math.abs(feed.right) <= 2 && Math.abs(feed.bottom) <= 2, JSON.stringify(feed))
  check('the posts scroll by themselves, the side column holds still', !!feed && !feed.sideInPostsScroller, JSON.stringify(feed))
  await c.both(`${SHOT}-feed`)
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
}
await c.close()
done()
