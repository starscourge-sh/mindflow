// “Move to the Bin” in a Feed post's ⋯ menu: last, after a line, with the
// Bin's can. It takes the post away at once, puts the note behind it in the
// Bin, and Undo (⌘Z too) brings both back. A day's post has no such line.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-g/main/index.js HALIGTREE_QA_AWAY=1 node qa/feed-bin.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go, errors } = c
const binned = async (type, id) => (await v('items', 'discarded').catch(() => null), (await v('item', id))?.binnedAt ?? null)
try {
  const posts = (await v('feed')).posts
  const kinds = [...new Set(posts.map((one) => one.type))]
  await go('feed')
  await h.waitForTimeout(1200)
  for (const type of ['nugget', 'capture', 'article', 'question'].filter((one) => kinds.includes(one))) {
    const post = posts.find((one) => one.type === type)
    const card = h.locator(`[data-feed-id="${post.id}"]`).first()
    if (!(await card.count())) continue
    await card.scrollIntoViewIfNeeded()
    await card.locator('[data-feed-actions] [data-menu="post"]').click()
    await h.waitForTimeout(300)
    const lines = await h.locator('[role="menu"] [role="menuitem"]').allTextContents()
    check(`${type}: “Move to the Bin” is the menu's last line`, /Move to the Bin/.test(lines.at(-1)), lines.join(' / '))
    await h.locator('[role="menu"] [data-menu-item="bin"]').click()
    await h.waitForTimeout(500)
    check(`${type}: the post goes at once`, (await h.locator(`[data-feed-id="${post.id}"]`).count()) === 0)
    const gone = type === 'capture' ? (await h.evaluate((id) => window.api.captures.get(id), post.id))?.status === 'discarded' : !!(await binned(type, post.id))
    check(`${type}: what is behind it is in the Bin`, gone)
    await h.keyboard.press('Meta+z')
    await h.waitForTimeout(900)
    const back = type === 'capture' ? (await h.evaluate((id) => window.api.captures.get(id), post.id))?.status !== 'discarded' : !(await binned(type, post.id))
    check(`${type}: ⌘Z brings it back, and the post with it`, back && (await h.locator(`[data-feed-id="${post.id}"]`).count()) === 1)
  }
  const day = posts.find((one) => one.type === 'day')
  if (day) {
    const card = h.locator(`[data-feed-id="${day.id}"]`).first()
    await card.scrollIntoViewIfNeeded()
    await card.locator('[data-feed-actions] [data-menu="post"]').click()
    await h.waitForTimeout(300)
    check('a day\'s post has no “Move to the Bin”', (await h.locator('[role="menu"] [data-menu-item="bin"]').count()) === 0)
    await h.keyboard.press('Escape')
  }
  check('no errors', !errors.length, errors.join('\n'))
} finally {
  await c.close()
}
done()
