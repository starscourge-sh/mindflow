// The Feed never brings back yesterday's quotes while there are others not seen this week, even with few people
// quoted: four people with ten quotes each, among forty others. Day one's Feed is taken, moved back a day in the book (sqlite3), and
// today's must hold none of yesterday's quotes, liked though they all were.
//   QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/feed-no-repeat.mjs
import { execFileSync } from 'child_process'
import { mkdtempSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { open, checks } from './harness.mjs'

const { check, done } = checks()
const data = mkdtempSync(join(tmpdir(), 'haligtree-feed-'))
process.env.QA_DATA = data
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const feed = async (page) => (await page.evaluate(() => window.api.haligtree('feed'))).posts.filter((one) => one.kind === 'quote' || one.type === 'nugget').map((one) => `${one.type}:${one.id}`)
let first = []
{
  const qa = await open()
  for (const who of ['Oscar Wilde', 'Dave Chappelle', 'Reid Hoffman', 'Seneca'])
    for (let n = 1; n <= 10; n++) await qa.page.evaluate(([who, n]) => window.api.captures.create({ kind: 'quote', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${who} said thing ${n}, a line worth keeping for a while.` }] }] }, attribution: who }), [who, n])
  // Enough else to keep the day's Feed (it is kept once the book holds twenty or more).
  for (let n = 0; n < 40; n++) await qa.page.evaluate((n) => window.api.captures.create({ kind: 'quote', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `A line by someone new, number ${n}.` }] }] }, attribution: `Person ${n}` }), n)
  // And gems: notes kept as gems, the Feed's other lane.
  for (let n = 0; n < 40; n++) {
    const cap = await qa.page.evaluate((n) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `A thought worth keeping, number ${n}, with enough words in it.` }] }] } }), n)
    await qa.page.evaluate((id) => window.api.haligtree('promote', id), cap)
  }
  first = await feed(qa.page)
  // Every one of them liked: a heart brings a note back sooner, never ahead of ones not yet shown.
  for (const key of first) await qa.page.evaluate((key) => window.api.haligtree('feed:react', key, 'like'), key)
  check('day one shows quotes and gems', first.length > 0, String(first.length))
  await qa.close()
}
// Day one becomes yesterday.
const file = join(data, readdirSync(data).includes('haligtree.db') ? 'haligtree.db' : '', 'haligtree.db').replace(/\/haligtree\.db\/haligtree\.db$/, '/haligtree.db')
execFileSync('sqlite3', [file, "update feed_days set day = date(day, '-1 day')"])
{
  const qa = await open()
  const second = await feed(qa.page)
  const again = second.filter((id) => first.includes(id))
  check('today holds none of yesterday\'s quotes or gems', second.length > 0 && again.length === 0, `${again.length} of ${second.length} again`)
  await qa.close()
}
done()
