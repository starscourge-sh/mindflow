// A Journal day in the Feed acts like any post: Reply keeps a thought on that
// day, shown under it and in its thread; the heart is kept, and a liked day
// comes back sooner; Restack still makes a gem.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/feed-journal.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const s = await sandbox({ width: 1500, height: 1000 })
const { h, v, go, close } = s
try {
  await go('feed'); await h.waitForTimeout(1500)
  const day = h.locator('[data-feed-post="day"]').first()
  check('the Feed has a Journal day', (await day.count()) === 1)
  await day.scrollIntoViewIfNeeded()
  const id = await day.getAttribute('data-feed-id')
  check('a Journal day has Reply, Restack and the heart', (await day.locator('[data-feed-reply]').count()) === 1 && (await day.locator('[data-feed-restack]').count()) === 1 && (await day.locator('[data-feed-reaction="like"]').count()) === 1)
  await day.locator('[data-feed-reply]').click(); await h.waitForTimeout(500)
  await h.keyboard.type('Still true of most Mondays', { delay: 10 }); await h.keyboard.press('Enter'); await h.waitForTimeout(1000)
  check('Reply keeps a thought on the day', ((await v('glosses', id)) ?? []).some((one) => one.body.includes('most Mondays')))
  check('the thought shows under the day', (await day.innerText()).includes('most Mondays'))
  await day.locator('[data-feed-reaction="like"]').click(); await h.waitForTimeout(800)
  check('the heart is kept on the day', (await v('feed')).posts.find((one) => one.id === id)?.react === 'like')
  check('no page errors', !s.errors.length, s.errors.join(' | '))
} finally {
  await close()
}
done()
