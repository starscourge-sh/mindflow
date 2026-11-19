// Searching the Feed (feed-view.tsx FeedNotes): the same field as Writing's and the Inbox's lists (ListSearch), at
// the page's top line. Typed words keep the posts that hold every one of them (their words, who said them, their tags,
// your thoughts on them); the line says "N of M posts"; nothing found says so, with a way to search the whole book;
// a search never counts as reading to the end of the day's Feed; Esc puts every post back. Real keys.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/feed-search.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const posts = () => h.evaluate(() => [...document.querySelectorAll('[data-feed] ol > li[data-feed-at], [data-feed] [data-feed-at]')].map((one) => one.innerText ?? ''))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await go('feed'); await wait(2000)
  const all = await posts()
  check('the Feed shows its posts', all.length >= 5, String(all.length))
  const field = h.locator('input[placeholder="Search today\'s Feed"]')
  check('the Feed has a search field on its top line, as the Inbox has', (await field.count()) === 1)
  // A word one post has and most do not.
  const word = all.map((one) => one.toLowerCase().match(/\b[a-z]{7,}\b/g) ?? []).flat().find((one, _, list) => list.filter((w) => w === one).length === 1 && all.filter((post) => post.toLowerCase().includes(one)).length < all.length / 2)
  await field.click(); await h.keyboard.type(word, { delay: 15 }); await wait(400)
  const left = await posts()
  check('typed, only the posts holding the word stay', left.length >= 1 && left.length < all.length && left.every((one) => one.toLowerCase().includes(word)), `${word}: ${left.length} of ${all.length}`)
  const line = await h.locator('[data-feed-holds]').textContent()
  check('the line says how many are left of how many', line === `${left.length} of ${all.length} posts` || line === `${left.length} of ${all.length} post`, line)
  check('the end of the day\'s Feed is not reached by a search', (await h.locator('[data-feed-end]').count()) === 0)
  await h.keyboard.type('zqxj', { delay: 15 }); await wait(400)
  check('nothing found says so, with a way to search the whole book', (await h.locator('[data-feed-none]').count()) === 1 && (await h.locator('[data-feed-search-all]').count()) === 1, await h.locator('[data-feed-none]').textContent().catch(() => ''))
  await h.keyboard.press('Escape'); await wait(400)
  check('Esc puts every post back', (await posts()).length === all.length && (await field.inputValue()) === '', String((await posts()).length))
} finally {
  await close()
}
done()
