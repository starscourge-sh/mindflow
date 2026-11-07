// Liked, in the Feed: the switch (tab, ⌘K, the heart's menu), every liked post
// newest like first and grouped by when, "Liked 3 days ago", a liked day as its
// own line, unlike with Undo, the strip of weeks jumping to one, the side
// column, J/K/L/Enter, then 3,000 likes over three years read a page at a time.
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/briefs/shots/feed-liked'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, v, go, errors, electron, both, size, close } = s
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const ago = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const rows = () => h.locator('[data-liked-row]').evaluateAll((all) => all.map((one) => ({ key: one.dataset.likedKey, day: one.dataset.likedDay })))
const openLiked = async () => { await go('feed'); await h.locator('[data-chip="liked"]').click(); await h.waitForTimeout(900) }
try {
  // The user's size: 30 likes on 29 gems and quotes over about a year and a half, and one Journal day.
  const gems = await sql("select id from nuggets where tier = 'nugget' and private = 0 and binned_at is null and superseded_by is null order by created_at limit 29")
  const spread = [0, 0, 1, 3, 3, 5, 9, 12, 20, 26, 33, 40, 61, 75, 90, 120, 150, 180, 200, 230, 260, 290, 330, 365, 380, 420, 460, 500, 540]
  for (const [at, gem] of gems.entries()) await sql("insert or replace into feed_reacts (day, key, reaction, was) values (?, ?, 'like', '{}')", ago(spread[at] ?? at * 10), `nugget:${gem.id}`)
  await sql("insert into day_pages (day, body, updated_at) values (?, 'A long walk by the river, and the thought that kept coming back about slow work.', ?) on conflict(day) do nothing", ago(8), new Date().toISOString())
  await sql("insert or replace into feed_reacts (day, key, reaction, was) values (?, ?, 'like', '{}')", ago(2), `day:${ago(8)}`)
  const likedKeys = async () => (await sql("select count(distinct key) as n from feed_reacts where reaction = 'like'"))[0].n
  const seeded = await likedKeys()
  check('seeded about 30 likes (the user\'s size)', seeded >= 30 && seeded <= 40, seeded)

  // The switch: a tab in the Feed's own tab chips.
  await openLiked()
  check('the Liked tab opens Liked', await h.locator('[data-feed-liked]').count() === 1)
  check('Liked sits in the Feed tab chips', (await h.locator('[data-chips="feed"] [role="tab"]').allInnerTexts()).join(' · ') === 'Notes · Reading · Liked')
  // ⌘K "Liked", from elsewhere.
  await go('home')
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(400)
  await h.keyboard.type('Liked', { delay: 25 })
  await h.waitForTimeout(400)
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1200)
  check('⌘K "Liked" opens Liked', await h.locator('[data-feed-liked]').count() === 1)
  // The heart's own menu, from the For you feed.
  await h.locator('[data-chip="notes"]').click()
  await h.waitForTimeout(900)
  await h.locator('[data-feed-post] [data-feed-reaction="like"]').first().click({ button: 'right' })
  await h.waitForTimeout(300)
  const see = h.getByRole('menuitem', { name: 'See everything you liked' })
  check('the heart has a menu with "See everything you liked"', await see.count() === 1)
  await see.click().catch(() => {})
  await h.waitForTimeout(900)
  check('…which opens Liked', await h.locator('[data-feed-liked]').count() === 1)

  // Order and groups.
  const list = await rows()
  check('every liked post is listed once', list.length === seeded && new Set(list.map((one) => one.key)).size === list.length, `${list.length} of ${seeded}`)
  check('newest like first', list.every((one, at) => !at || list[at - 1].day >= one.day))
  const groups = await h.locator('[data-liked-group]').allInnerTexts()
  check('grouped: This week first, then months, then a year', groups[0] === 'This week' && groups.some((g) => /^[A-Z][a-z]+$/.test(g) && g !== 'This') && groups.some((g) => /^\d{4}$/.test(g)), groups.join(', '))
  const words = await h.locator('[data-liked-row]').evaluateAll((all) => all.map((one) => one.innerText))
  check('"Liked today"', words.some((one) => one.includes('Liked today')))
  check('"Liked 3 days ago"', words.some((one) => one.includes('Liked 3 days ago')))
  check('older ones by date, "Liked 12 Mar"', words.some((one) => /Liked \d{1,2} [A-Z][a-z]{2}/.test(one)))
  check('a liked day is its own line, "You liked the day: …"', words.some((one) => /You liked the day: \d{1,2} [A-Z][a-z]{2}/.test(one)))

  // Side column and strip.
  check('the strip has 52 weeks', await h.locator('[data-liked-week]').count() === 52)
  check('the strip says its point in words', /likes? in the last year, the most in the week of/.test(await h.locator('[data-liked-point]').innerText()), await h.locator('[data-liked-point]').innerText())
  check('the strip names months under it', (await h.locator('[data-liked-strip]').innerText()).match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/g)?.length >= 10)
  const years = await h.locator('[data-liked-years] span span').allInnerTexts()
  check('the strip names its years, once each', years.length === 2 && years.every((y) => /^\d{4}$/.test(y)), years.join(', '))
  const boxes = await h.locator('[data-liked-strip] [aria-hidden] span span').evaluateAll((all) => all.map((one) => { const r = one.getBoundingClientRect(); return { l: r.left, r: r.right, t: Math.round(r.top) } }))
  check('no label under the strip runs into another', boxes.every((a, i) => boxes.every((b, j) => i === j || a.t !== b.t || a.r <= b.l || b.r <= a.l)))
  check('no "Less of this" or "From the archives" on a liked post', await h.locator('[data-feed-liked] [data-feed-reaction="less"], [data-feed-liked] [data-feed-context]').count() === 0)
  const keep = h.locator('[data-feed-side-card="keep-liking"]')
  check('side: "What you keep liking" with tags or sources', await keep.count() === 1 && (await keep.locator('[data-liked-tag], [data-liked-source]').count()) > 0, await keep.innerText().catch(() => ''))
  check('side: what you liked a year ago', await h.locator('[data-feed-side-card="year-ago"] [data-liked-year-ago]').count() >= 1)
  await both(`${SHOTS}/liked-30`)
  await h.locator('[data-chip="notes"]').click()
  await h.waitForTimeout(900)
  await both(`${SHOTS}/for-you-30`)
  await h.locator('[data-chip="liked"]').click()
  await h.waitForTimeout(900)

  // A week in the strip: the list goes to it.
  const week = await h.locator('[data-liked-week]').evaluateAll((all) => all.filter((one) => Number(one.dataset.likedWeekN) > 0).map((one) => one.dataset.likedWeek)[2])
  await h.locator(`[data-liked-week="${week}"]`).click()
  await h.waitForTimeout(700)
  const landed = await h.locator('[data-liked-focus]').getAttribute('data-liked-day').catch(() => null)
  const end = new Date(new Date(week).getTime() + 7 * 86400000).toISOString().slice(0, 10)
  const top = await h.locator('[data-liked-focus]').evaluate((one) => one.getBoundingClientRect().top).catch(() => -1)
  check('a week clicked goes to that week', !!landed && landed >= week && landed < end && top >= 0 && top < 300, `${week} → ${landed} at ${Math.round(top)}px`)

  // Unlike with Undo.
  const before = (await rows()).length
  const first = h.locator('[data-liked-row="0"]')
  const firstKey = await first.getAttribute('data-liked-key')
  await first.locator('[data-feed-reaction="like"]').click()
  await h.waitForTimeout(500)
  check('unliked, it leaves the list', (await rows()).length === before - 1 && !(await rows()).some((one) => one.key === firstKey))
  check('the toast says "Unliked" and opens the post', await h.locator(`[data-toast-made]`).filter({ hasText: 'Unliked' }).count() === 1)
  await h.getByRole('button', { name: /^Undo/ }).first().click()
  await h.waitForTimeout(700)
  check('Undo puts it back where it was', (await rows())[0]?.key === firstKey && (await rows()).length === before)
  check('…and the like is kept again', (await sql("select count(*) as n from feed_reacts where reaction = 'like' and key = ?", firstKey))[0].n === 1)

  // Keys: J J moves, L unlikes, Enter opens.
  await h.mouse.click(5, 450)
  await h.locator('[data-liked-row="0"]').dispatchEvent('pointerdown')
  await h.keyboard.press('j')
  await h.keyboard.press('j')
  await h.waitForTimeout(200)
  check('J moves down', await h.locator('[data-liked-focus]').getAttribute('data-liked-row') === '2')
  await h.keyboard.press('k')
  await h.waitForTimeout(200)
  check('K moves up', await h.locator('[data-liked-focus]').getAttribute('data-liked-row') === '1')
  const second = await h.locator('[data-liked-focus]').getAttribute('data-liked-key')
  await h.keyboard.press('l')
  await h.waitForTimeout(500)
  check('L unlikes', !(await rows()).some((one) => one.key === second))
  await h.getByRole('button', { name: /^Undo/ }).first().click().catch(() => {})
  await h.waitForTimeout(500)
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1200)
  check('Enter opens it', await h.locator('[data-feed-liked]').count() === 0)
  const cursors = await h.locator('[data-liked-week]').first().evaluate((one) => getComputedStyle(one).cursor).catch(() => 'pointer')
  check('hand cursor on a week', cursors === 'pointer', cursors)

  // 3,000 likes over three years, each a note of its own.
  const cols = (await sql("select name from pragma_table_info('nuggets')")).map((one) => one.name)
  // Copies of the 29 gems and quotes in turn, so the list reads as a real one would.
  const pick = cols.map((c) => (c === 'id' ? "id || '-x' || n" : c === 'capture_id' ? 'null' : c)).join(', ')
  for (const [at, gem] of gems.entries()) {
    await sql(`insert into nuggets (${cols.join(', ')}) with recursive k(n) as (select ? union all select n + ? from k where n + ? <= 3000) select ${pick} from nuggets, k where nuggets.id = ?`, at + 1, gems.length, gems.length, gem.id)
    await sql(`insert or replace into feed_reacts (day, key, reaction, was) with recursive k(n) as (select ? union all select n + ? from k where n + ? <= 3000)
      select date('now', 'localtime', '-' || (n * 1095 / 3000) || ' days'), 'nugget:' || ? || '-x' || n, 'like', '{}' from k`, at + 1, gems.length, gems.length, gem.id)
  }
  check('3,000 more likes laid down', (await sql("select count(*) as n from feed_reacts where reaction = 'like'"))[0].n >= 3000)
  await h.reload()
  await h.waitForTimeout(1500)
  const t0 = Date.now()
  await openLiked()
  const ms = Date.now() - t0
  const firstPage = (await rows()).length
  check('3,000 likes: one page at first, not all', firstPage > 0 && firstPage <= 40, `${firstPage} rows, opened in ${ms}ms`)
  check('…saying more are coming', await h.locator('[data-liked-foot="more"]').count() === 1)
  await both(`${SHOTS}/liked-3000`)
  await h.locator('[data-liked-foot]').scrollIntoViewIfNeeded()
  await h.waitForTimeout(1200)
  const second2 = (await rows()).length
  check('scrolled to the foot, the next page comes', second2 > firstPage && second2 <= firstPage + 70, `${firstPage} → ${second2}`)
  // The oldest week with likes: read down to it, still not everything.
  const old = await h.locator('[data-liked-week]').evaluateAll((all) => all.find((one) => Number(one.dataset.likedWeekN) > 0)?.dataset.likedWeek)
  await h.locator('[data-liked-strip]').scrollIntoViewIfNeeded()
  await h.locator(`[data-liked-week="${old}"]`).click()
  await h.waitForTimeout(1500)
  const after = (await rows()).length
  const at = await h.locator('[data-liked-focus]').getAttribute('data-liked-day').catch(() => null)
  check('a year back in the strip: read from that week, one page, not all between', after <= 40 && !!at && at >= old, `${after} rows, at ${at}`)
  check('…with a way back to the newest', await h.locator('[data-liked-newest]').count() === 1)
  await both(`${SHOTS}/liked-3000-jump`)
  await h.locator('[data-chip="notes"]').click().catch(() => {})
  await h.waitForTimeout(900)
  await both(`${SHOTS}/for-you-3000`)
  check('no errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 300))
} finally {
  await close()
}
done()
