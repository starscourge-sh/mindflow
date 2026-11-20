// The Feed's one way of bringing things back, as a person meets it. With Apple Intelligence (stand-in,
// HALIGTREE_QA_CAPS=ai) the Feed opened makes three insights, Connect or Reframe, each set apart and labelled as made and
// naming the notes it came from; a source opens its note; Keep makes a gem linked to its notes; Dismiss takes the card
// away and lowers its kind's share; the day stops at nine; and no note is in the Feed twice that day, as a post, in a
// pair or in an insight. The same book without Apple Intelligence: no insight cards, the Feed full from its posts alone.
// Then a newcomer's book with only notes brought in from elsewhere and lines highlighted in PDFs: a full Feed on day one,
// without AI, highlights among the posts opening their PDF.
// Run on a copy of the seeded sandbox: QA_ARGS=--sandbox QA_DATA=<copy> HALIGTREE_QA_AWAY=1 node qa/feed-insights.mjs
// The shares of what is picked (40/25/20/15 over 100 seeded picks), the 14-day rest and the heart's pull are
// test/insight-pick.test.ts.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

if (!process.env.QA_DATA) throw new Error('QA_DATA: a copy of the seeded sandbox, used by every launch')
const { check, done } = checks()
const until = async (h, what, ms = 10_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(200)) if (await what()) return true
  return false
}
/** Every note the Feed shows today, by id: each post's own (a pair's two, a poll's or quiz's note), and each insight's sources. */
const shownIds = async (h, v) => {
  const posts = await h.locator('[data-feed-post]:not([data-feed-post="insight"])').evaluateAll((all) => all.flatMap((one) => one.dataset.feedId.split('+').map((id) => id.slice(id.lastIndexOf(':') + 1))))
  const day = await v('feed:insights')
  return [...posts, ...day.cards.flatMap((card) => card.sources.map((one) => one.id))]
}
const sql = (s, query, ...args) => s.electron.evaluate((_, [q, a]) => globalThis.qaFeedSql(q, ...a), [query, args])

process.env.HALIGTREE_QA_CAPS = 'ai'
let s = await sandbox({ width: 1400, height: 900 })
try {
  const { h, v, go } = s
  const cards = h.locator('[data-feed-post="insight"]')
  await go('feed')
  check('the Feed opened makes three insights', await until(h, async () => (await cards.count()) >= 3), await cards.count())
  await h.waitForTimeout(1000)
  check('three at a time, no more', (await cards.count()) === 3, await cards.count())
  const levels = await cards.evaluateAll((all) => all.map((one) => one.dataset.insight))
  check('only Connect and Reframe: what comes back as itself is a post', levels.every((one) => one === 'connect' || one === 'reframe'), levels.join(', '))
  check('each names the notes it came from', (await cards.evaluateAll((all) => all.every((one) => one.querySelector('[data-insight-source]')))), levels.join(', '))
  check('every card sits in its panel, labelled as made', (await cards.locator('[data-insight-panel] [data-insight-made]').count()) === (await cards.count()))
  const ids = await shownIds(h, v)
  check('no note twice in the Feed today, posts and insights together', new Set(ids).size === ids.length, `${ids.length} shown, ${new Set(ids).size} different`)
  const secret = (await v('items', 'nugget')).filter((one) => one.private).map((one) => one.id)
  check('never a private note', !ids.some((id) => secret.includes(id)))

  // A source opens its note.
  const source = cards.first().locator('[data-insight-source]').first()
  const named = await source.innerText()
  await source.click()
  check('a source opens its note', await until(h, async () => (await h.locator('[data-page="feed"] [data-feed]').count()) === 0, 3000), named)
  await go('feed')

  // Keep: a gem, its notes linked under it, and the card says so.
  const first = cards.first()
  const id = await first.getAttribute('data-feed-id')
  const words = (await first.locator('[data-insight-words]').innerText()).trim()
  await first.locator('[data-insight-keep]').click()
  check('Keep: the card says "Kept as a gem"', await until(h, async () => (await h.locator(`[data-feed-id="${id}"] [data-insight-kept]`).count()) === 1, 3000))
  const card = (await v('feed:insights')).cards.find((one) => one.id === id)
  const gem = card?.gemId ? await v('item', card.gemId) : null
  check('Keep makes a gem with its words', !!gem && JSON.stringify(gem.body ?? '').includes(words.slice(0, 40)), words.slice(0, 40))
  check('the gem links every note it came from', !!gem && card.sources.filter((one) => one.type !== 'highlight').every((one) => JSON.stringify(gem.body ?? '').includes(one.id)))

  // Dismiss: the card goes, and its kind comes a little less often.
  const next = cards.nth(1)
  const other = await next.getAttribute('data-feed-id')
  const level = await next.getAttribute('data-insight')
  const before = (await v('feed:insight:mix'))[level]
  await next.locator('[data-insight-dismiss]').click()
  check('Dismiss takes the card away', await until(h, async () => (await h.locator(`[data-feed-id="${other}"]`).count()) === 0, 3000))
  const after = (await v('feed:insight:mix'))[level]
  check('Dismiss lowers its kind’s share a little', after < before && after >= before * 0.8, `${level} ${before} → ${after}`)

  // The day is finite: asked again and again, it stops at nine, and still no note comes twice.
  for (let turn = 0; turn < 6; turn++) (await v('feed:insights:make'), await h.waitForTimeout(600))
  const full = await v('feed:insights')
  check('a day’s batch stops at nine', full.done && full.cards.length <= 9, `${full.cards.length} shown, done ${full.done}`)
  await go('feed')
  await h.waitForTimeout(800)
  const later = await shownIds(h, v)
  check('still no note twice once the day’s insights are all made', new Set(later).size === later.length, `${later.length} shown, ${new Set(later).size} different`)
  check('the end says "That\'s all for today"', (await h.locator('[data-feed-end]').innerText()).includes("That's all for today"))
} finally {
  await s.close()
}

// The same book on a Mac without Apple Intelligence: no insight cards, the Feed full from its posts.
process.env.HALIGTREE_QA_CAPS = 'macos26'
s = await sandbox({ width: 1400, height: 900 })
try {
  const { h, v, go } = s
  await go('feed')
  await h.waitForTimeout(2500)
  check('without Apple Intelligence no insight cards', (await h.locator('[data-feed-post="insight"]').count()) === 0)
  const posts = await h.locator('[data-feed-post]').count()
  check('and the Feed is full from its posts alone', posts >= 15, posts)
  const ids = await shownIds(h, v)
  check('no note twice without AI either', new Set(ids).size === ids.length, `${ids.length} shown`)
} finally {
  await s.close()
}

// A newcomer's book: only notes brought in from elsewhere and lines highlighted in PDFs, no AI. Gems, quotes and
// Journal days put away first, today's set forgotten so it is picked from this book.
s = await sandbox({ width: 1400, height: 900 })
try {
  const { h, v, go } = s
  // Home asks for the Feed on launch; that look, still being read, kept the old book's set as today's after the clearing below.
  // Waiting for it first means the clearing is the last word.
  await v('feed')
  const now = new Date().toISOString()
  await sql(s, 'update nuggets set binned_at = ? where binned_at is null', now)
  await sql(s, "update captures set status = 'discarded' where kind in ('quote', 'decision', 'checkback')")
  await sql(s, 'update captures set imported_at = coalesce(imported_at, captured_at)')
  await sql(s, 'delete from day_pages')
  await sql(s, 'delete from feed_days')
  await sql(s, 'delete from feed_insights')
  for (let at = 0; at < 6; at++) {
    await sql(s, "insert into pdf_highlights (id, src, page, quote, start, end, created_at) values (?, 'haligtree://assets/qa-reading.pdf', ?, ?, 0, 40, ?)",
      `qa-mark-${at}`, at + 3, `A line worth keeping from the reading, number ${at + 1}, about how memory fades without use.`, new Date(Date.now() - at * 9 * 86_400_000).toISOString())
  }
  // Read once afresh here, so the page opens on this book's set, not on what Home was told at launch.
  await v('feed')
  await go('feed')
  await h.locator('[data-feed-post="highlight"]').first().waitFor({ timeout: 15_000 }).catch(() => {})
  check('no goal screen: the newcomer has a Feed on day one', (await h.locator('[data-page="feed"] [data-feed] li[data-feed-post]').count()) > 0 && (await h.getByText('Your Feed starts once').count()) === 0)
  const posts = h.locator('[data-feed-post]:not([data-feed-post="insight"])')
  check('a full Feed from imported notes and highlights, without AI', (await posts.count()) >= 15, await posts.count())
  const kinds = await posts.evaluateAll((all) => [...new Set(all.map((one) => one.dataset.feedPost))])
  check('only what the book holds: notes brought in and highlights', kinds.every((one) => one === 'capture' || one === 'highlight' || one === 'pair' || one === 'quiz'), kinds.join(', '))
  check('imported notes say "From the archives"', (await h.locator('[data-feed-archive] [data-feed-context]').first().innerText().catch(() => '')).includes('From the archives'))
  const marks = h.locator('[data-feed-post="highlight"]')
  check('highlights come up as posts', (await marks.count()) >= 1, await marks.count())
  if (await marks.count()) {
    const mark = marks.first()
    check('a highlight reads as a quote with its PDF and page under it', (await mark.locator('[data-feed-quote]').count()) === 1 && /qa-reading/.test(await mark.locator('[data-feed-from]').innerText()) && (await mark.locator('[data-feed-from]').getAttribute('data-feed-from-page')) !== null)
  }
  const ids = await shownIds(h, v)
  check('no note twice in the newcomer’s Feed', new Set(ids).size === ids.length, `${ids.length} shown`)
  check('no page errors', !s.errors.length, s.errors.join(' | '))
} finally {
  await s.close()
}
done()
