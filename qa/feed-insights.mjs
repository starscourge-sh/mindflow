// The Feed's one way of bringing things back, as a person meets it. With Apple Intelligence (stand-in,
// HALIGTREE_QA_CAPS=ai) the Feed opened makes three insights, Connect or Reframe, each set apart and labelled as made and
// naming the notes it came from; a source opens its note; Keep makes a gem linked to its notes; Dismiss takes the card
// away and lowers its kind's share; the day stops at nine; and no note is in the Feed twice that day, as a post, in a
// pair or in an insight. The same book without Apple Intelligence: no insight cards, the Feed full from its posts alone.
// Then a newcomer's book with only notes brought in from elsewhere and lines highlighted in PDFs: a full Feed on day one,
// without AI, highlights among the posts opening their PDF.
// Run on a copy of the seeded sandbox: QA_ARGS=--sandbox QA_DATA=<copy> HALIGTREE_QA_AWAY=1 node qa/feed-insights.mjs
// A person who decided something and set a date to check back: on the day, the Feed's first post is "Check back" with
// the call, the question (bold) and what would reopen it, in their own words with no AI; "Still holds" moves the date
// on and Undo puts it back. And every Reframe card quotes its note ("Your note says"), the quote really in that note;
// the stand-in's vague line ("What if the silence broke...") is dropped, never shown.
// Last, an everyday reader hearts three old notes and answers one: over four weeks they come back more than old notes
// left alone, never inside their rest.
// The shares of what is picked (40/25/20/15 over 100 seeded picks), the 14-day rest and the heart's pull are
// test/insight-pick.test.ts; how much what was done with a note counts (hearts, thoughts, opens, edits, links) is
// test/feed-mattered.test.ts.
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
  // It opens beside the Feed, as every note named in an offer does (the user, 21 Nov: "why cant i open source on the side").
  const beside = await until(h, async () => (await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].filter((one) => one.getClientRects().length).length)) === 2, 3000)
  check('a source opens its note beside the Feed, the Feed still there', beside && (await h.locator('[data-page="feed"] [data-feed]').count()) > 0, named)
  // The note's pane shut again by its tab's ×, back to the Feed alone.
  await h.evaluate(() => { const all = [...document.querySelectorAll('[data-pane]')].filter((one) => one.getClientRects().length); all.at(-1)?.querySelector('[data-tab-close]')?.click() })
  check('and its tab\'s × closes it again, the Feed alone', await until(h, async () => (await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].filter((one) => one.getClientRects().length).length)) <= 1, 3000))
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

  // Reframe names what it turns around: "Your note says" a quote that is in its source, then the other side.
  const reframes = full.cards.filter((one) => one.level === 'reframe')
  const bodyOf = async (one) => (await sql(s, `select coalesce(title, '') || ' ' || coalesce(body, '') as said from ${one.type === 'capture' ? 'captures' : 'nuggets'} where id = ?`, one.id))[0]?.said ?? ''
  for (const one of reframes) {
    const said = (await bodyOf(one.sources[0])).toLowerCase()
    const words = one.quote.toLowerCase().match(/\p{L}+/gu) ?? []
    check('a Reframe quotes its note: every word of "Your note says" is in it', words.length >= 4 && words.every((word) => said.includes(word)), `${one.quote} / ${one.sources[0].title}`)
  }
  const shownReframe = h.locator('[data-feed-post="insight"][data-insight="reframe"]').first()
  if (await shownReframe.count()) {
    check('a Reframe card reads "Your note says" first, then "The other side"', /^Your note says: “.+”/.test((await shownReframe.locator('[data-insight-quote]').innerText()).trim()) && /^The other side: /.test((await shownReframe.locator('[data-insight-words]').innerText()).trim()))
  }
  const tried = await sql(s, "select state, words from feed_insights where level = 'reframe' and sources != '[]' and day = ?", full.day)
  check('the vague other side is dropped, never shown', !full.cards.some((one) => /silence broke/i.test(one.words)) && (tried.length < 2 || tried.some((one) => one.state === 'failed')), `${tried.length} Reframes tried, ${tried.filter((one) => one.state === 'failed').length} dropped`)

  // A decision whose check-back date is today: its own post, first, in its own words.
  const [party] = await sql(s, "select id from captures where kind = 'checkback' and fields like '%It happens at my party%' limit 1")
  const noon = new Date(); noon.setHours(12, 0, 0, 0)
  await sql(s, "update captures set fields = json_remove(json_set(fields, '$.back', ?), '$.heldAt') where id = ?", noon.toISOString(), party.id)
  await sql(s, 'delete from feed_checkback_off')
  await h.reload(); await h.waitForTimeout(2000)
  await go('feed')
  // The party note's own post (another decision may be near its date in the sandbox too).
  const back = h.locator(`[data-feed-post="checkback"][data-feed-id="captures:${party.id}"]`)
  await back.first().waitFor({ timeout: 10_000 }).catch(() => {})
  check('the decision comes back first in the Feed, as "Check back"', (await h.locator('[data-feed-post]').first().getAttribute('data-feed-post')) === 'checkback' && /^Check back:\s*Not saying who spoilt the surprise party/.test((await back.locator('[data-checkback-head]').innerText()).trim()))
  check('with what was decided, the question in bold and what would reopen it',
    (await back.locator('[data-checkback-call]').innerText()).includes('You decided: “Say nothing. The cake was still a surprise.”')
    && (await back.locator('[data-checkback-ask]').innerText()).includes("You said you'd ask: Does saying nothing still hold?")
    && (await back.locator('[data-checkback-ask]').evaluate((one) => Number(getComputedStyle(one).fontWeight) >= 600))
    && (await back.locator('[data-checkback-reopen]').innerText()).includes('Reopen only if: It happens at my party.'))
  check('labelled as the person\'s own words, not as made by Apple Intelligence', (await back.locator('[data-insight-made]').count()) === 0 && /own words/.test(await back.locator('[data-feed-context]').innerText()))
  const again = await shownIds(h, v)
  check('the decision is in the Feed once, never among the rest', again.filter((one) => one === party.id).length === 1, `${again.filter((one) => one === party.id).length} times`)
  await back.locator('[data-checkback-hold]').click()
  const fieldsOf = async () => JSON.parse((await sql(s, 'select fields from captures where id = ?', party.id))[0].fields)
  await h.waitForTimeout(600)
  const held = await fieldsOf()
  const days = Math.round((new Date(held.back) - noon) / 86_400_000)
  check('"Still holds" moves the date on by the interval it had (or 30 days) and records the look', days >= 1 && !!held.heldAt && (await h.locator('[role="status"]').allInnerTexts()).some((one) => /Still holds: it comes back on/.test(one)), `${days} days on`)
  await h.locator('[role="status"] button', { hasText: 'Undo' }).first().click()
  await h.waitForTimeout(600)
  const undone = await fieldsOf()
  check('Undo puts the date back', undone.back === noon.toISOString() && !undone.heldAt, undone.back)
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
  // Read once afresh here, so the page opens on this book's set, not on what Home was told at launch; the writes above
  // went straight to the book, so the window hears of no change: reloaded, it asks again.
  await v('feed')
  await h.reload(); await h.waitForTimeout(2500)
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

// An everyday reader hearts three old notes in today's Feed and writes a thought on one. Over the next four weeks,
// those come back more often than the old notes shown beside them that day and left alone, and none of them, nor any
// other note, comes back inside its 14 days' rest. The book is grown by 400 old notes first, so a fortnight's posts
// (24 a day) never use the whole book up and the rest is never broken to fill a day. A day passes by moving every dated
// trace of the Feed (its days, hearts, thoughts, opens) one day back, then asking for the Feed again.
s = await sandbox({ width: 1400, height: 900 })
try {
  const { h, v, go } = s
  await v('feed')
  // A reader who has not touched anything yet: no hearts, thoughts or opens from the example book's seeding.
  for (const table of ['feed_reacts', 'feed_days', 'glosses', 'note_opens']) await sql(s, `delete from ${table}`)
  try { await sql(s, 'delete from feed_insights') } catch { /* none */ }
  for (let at = 0; at < 400; at++)
    await sql(s, "insert into captures (id, title, kind, status, body, captured_at) values (?, '', 'note', 'open', ?, ?)", `qa-old-${at}`, `An old thought kept a while ago, number ${at + 1}, about reading slowly and coming back to it.`, new Date(Date.now() - (40 + at) * 86_400_000).toISOString())
  await h.reload(); await h.waitForTimeout(2500)
  await go('feed')
  await h.locator('[data-feed-post]').first().waitFor({ timeout: 15_000 }).catch(() => {})
  const month = Date.now() - 30 * 86_400_000
  const first = (await v('feed')).posts
  const old = first.filter((one) => (one.type === 'nugget' || one.type === 'capture') && new Date(one.made).getTime() < month).map((one) => one.id)
  check('today’s Feed holds old notes to heart', old.length >= 5, old.length)
  const liked = old.slice(0, 3)
  for (const id of liked) {
    const post = h.locator(`[data-feed-id="${id}"]`)
    await post.scrollIntoViewIfNeeded()
    await post.locator('[data-feed-reaction="like"]').click()
    await h.waitForTimeout(300)
  }
  const answered = h.locator(`[data-feed-id="${liked[0]}"]`)
  await answered.locator('[data-feed-reply]').click()
  await h.waitForTimeout(400)
  await h.keyboard.type('Still how I read now', { delay: 15 })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1200)
  const hearts = await sql(s, "select key from feed_reacts where reaction = 'like'")
  check('three hearts and one thought kept', hearts.length === 3 && (await sql(s, 'select id from glosses where item_id = ?', liked[0])).length === 1, `${hearts.length} hearts`)
  const alone = old.slice(3)

  // Four weeks, a Feed a day: each note's days shown, day 0 being today's.
  const shownOn = new Map()
  // The day's notes; a poll or a quiz card is Review's and a decision's own, not a note that rests.
  const mark = (day, posts) => { for (const one of posts) if (one.type !== 'poll' && one.type !== 'quiz') for (const id of String(one.id).split('+')) shownOn.set(id, [...(shownOn.get(id) ?? []), day]) }
  mark(0, first)
  const back = async (table, column, isDay) => {
    // Through a mark first, so a day moved back never meets one not yet moved (day is part of the key).
    await sql(s, `update ${table} set ${column} = '~' || ${isDay ? `date(${column}, '-1 day')` : `strftime('%Y-%m-%dT%H:%M:%fZ', ${column}, '-1 day')`}`)
    await sql(s, `update ${table} set ${column} = substr(${column}, 2)`)
  }
  const DAYS = 28
  for (let day = 1; day <= DAYS; day++) {
    await back('feed_days', 'day', true)
    await back('feed_reacts', 'day', true)
    await back('glosses', 'created_at', false)
    await back('note_opens', 'at', false)
    mark(day, (await v('feed')).posts)
  }
  const times = (ids) => ids.map((id) => (shownOn.get(id) ?? []).filter((day) => day > 0).length)
  const mean = (all) => all.reduce((sum, one) => sum + one, 0) / Math.max(1, all.length)
  const likedTimes = times(liked)
  const aloneTimes = times(alone)
  check('what was hearted comes back more than old notes left alone', mean(likedTimes) > mean(aloneTimes) && likedTimes.every((one) => one >= 1),
    `hearted ${likedTimes.join(', ')} (mean ${mean(likedTimes).toFixed(2)}), left alone ${aloneTimes.join(', ')} (mean ${mean(aloneTimes).toFixed(2)}) over ${DAYS} days`)
  const inRest = [...shownOn].filter(([, days]) => days.some((day, at) => at && day - days[at - 1] < 14))
  check('nothing comes back inside its 14 days’ rest, hearted or not', !inRest.length, inRest.slice(0, 3).map(([id, days]) => `${id}: days ${days.join(', ')}`).join('; '))
  check('no page errors', !s.errors.length, s.errors.join(' | '))
} finally {
  await s.close()
}
done()
