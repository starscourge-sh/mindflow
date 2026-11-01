// The Feed at scale and by keys. Notes: J/K move a cursor between posts, L
// likes, R opens the reply, Enter opens; "Read later" says its word; "See
// everything you liked" is in ⋯; a quiz card shows its answer on Space, grades
// on 1 to 4 and ⌘Z takes the grade back; a quote from a PDF shows the PDF and
// its page. Then 5, 50, 500 and 5,000 Pages with 0, 4, 40 and 400 sources:
// Reading draws a page of rows at a time, the side column stays inside the
// window with "All N sources", its counts never wrap, a face shows one hover
// card and no tip, and the card stays 12px inside the window. "On your mind"
// leaves #quote and #mine out. Notes, Reading and Liked screenshotted light
// and dark at each scale.
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/feedpass'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, v, go, errors, electron, both, close } = s
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const tab = async (name) => { await h.locator(`[data-tabs="feed"] [data-tab="${name}"]`).click(); await h.waitForTimeout(900) }
const fresh = async () => { await h.reload(); await h.waitForTimeout(2200); await go('feed'); await h.waitForTimeout(1200) }
const words = (n) => Array.from({ length: n }, (_, i) => ['slow', 'river', 'light', 'stone', 'paper', 'garden', 'letter', 'window'][i % 8]).join(' ')
try {
  // A quote kept from a PDF, as the reader keeps it: its words, then the link back at its page.
  const now = new Date().toISOString()
  await sql("insert into nuggets (id, kind, tier, title, body, created_at, medium, attribution) values ('qa-pdf-quote', 'quote', 'nugget', 'The map is not the territory.', ?, ?, 'Science and Sanity', 'Alfred Korzybski')",
    JSON.stringify('The map is not the territory.\n\n[Science and Sanity, p. 58](haligtree://assets/qa-book.pdf#page=58&mark=m1&name=Science%20and%20Sanity.pdf)'), now)
  await v('feed')
  const days = await sql('select day, keys from feed_days order by day desc limit 1')
  check('the day\'s Feed is kept to add the quote to', !!days[0])
  if (days[0]) await sql('update feed_days set keys = ? where day = ?', JSON.stringify(['nugget:qa-pdf-quote', ...JSON.parse(days[0].keys)]), days[0].day)
  await fresh()
  await tab('notes')

  // --- Keys in Notes.
  await h.mouse.move(5, 5)
  await h.keyboard.press('j')
  await h.waitForTimeout(200)
  const at = async () => h.evaluate(() => document.querySelector('[data-feed-cursor]')?.closest('[data-feed-at]')?.getAttribute('data-feed-at') ?? null)
  check('J puts the cursor on the first post', (await at()) === '0', await at())
  await h.keyboard.press('j')
  await h.waitForTimeout(150)
  check('J again moves it to the second', (await at()) === '1', await at())
  await h.keyboard.press('k')
  await h.waitForTimeout(150)
  check('K moves it back', (await at()) === '0', await at())
  // On to a post that is not a poll or a quiz card.
  const plain = await h.evaluate(() => [...document.querySelectorAll('[data-feed-at]')].find((one) => !['poll', 'quiz', 'day'].includes(one.getAttribute('data-feed-post')))?.getAttribute('data-feed-at'))
  for (let i = 0; i < Number(plain); i++) await h.keyboard.press('j')
  await h.waitForTimeout(200)
  const likeOf = `[data-feed-at="${plain}"] [data-feed-reaction="like"]`
  const likedBefore = await h.locator(likeOf).getAttribute('aria-pressed')
  await h.keyboard.press('l')
  await h.waitForTimeout(500)
  check('L likes the post under the cursor', (await h.locator(likeOf).getAttribute('aria-pressed')) !== likedBefore, `${likedBefore} -> ${await h.locator(likeOf).getAttribute('aria-pressed')}`)
  await h.keyboard.press('l')
  await h.waitForTimeout(400)
  await h.keyboard.press('r')
  await h.waitForTimeout(500)
  check('R opens the reply under the post', await h.evaluate((n) => !!document.activeElement?.closest(`[data-feed-at="${n}"]`) && /textarea|input|true/i.test(document.activeElement.tagName + document.activeElement.getAttribute('contenteditable')), plain))
  await h.keyboard.press('Escape')
  await h.mouse.click(5, 300)
  await h.waitForTimeout(300)
  check('Read later says its word on every post', (await h.locator('[data-feed-actions] [data-read-later]').count()) > 0 && (await h.locator('[data-feed-actions] [data-read-later]').first().innerText()).includes('Read later'))
  await h.locator('[data-feed-actions]').first().locator('[data-menu="post"]').click().catch(() => {})
  await h.waitForTimeout(400)
  check('"See everything you liked" is in ⋯', (await h.getByRole('menuitem', { name: 'See everything you liked' }).count()) === 1)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)

  const summary = await h.locator('[data-feed-summary]').innerText()
  check('the end of the day names 3 kinds at most', (summary.match(/\d+ (?!more)[A-Za-z]/g) ?? []).length <= 3, summary)

  // --- A quote from a PDF shows the PDF and its page.
  const from = h.locator('[data-feed-id="qa-pdf-quote"] [data-feed-from]')
  check('a PDF quote shows its PDF and page', (await from.count()) === 1 && /Science and Sanity\s*· p\. 58/.test(await from.innerText()), (await from.count()) ? await from.innerText() : 'none')
  check('its link back is not said twice in the quote', !(await h.locator('[data-feed-id="qa-pdf-quote"] blockquote').innerText()).includes('Science and Sanity'))
  check('a quote with no link back shows nothing', (await h.locator('[data-feed-post][data-feed-kind="quote"]:not([data-feed-id="qa-pdf-quote"]) [data-feed-from]').count()) === 0)

  // --- A quiz card graded by keys, and ⌘Z.
  const quiz = await h.locator('[data-feed-post="quiz"]').count()
  if (quiz) {
    const n = await h.locator('[data-feed-post="quiz"]').first().getAttribute('data-feed-at')
    await h.locator(`[data-feed-at="${n}"] [data-feed-quiz-prompt]`).click()
    await h.waitForTimeout(200)
    await h.keyboard.press(' ')
    await h.waitForTimeout(400)
    check('Space shows the quiz card\'s answer', (await h.locator(`[data-feed-at="${n}"] [data-feed-quiz-answer]`).count()) === 1)
    await h.keyboard.press('3')
    await h.waitForTimeout(800)
    check('3 grades it Good', (await h.locator(`[data-feed-at="${n}"]`).getAttribute('data-feed-graded')) === '3')
    check('an Undo for the grade shows, as in Review', (await h.locator(`[data-feed-at="${n}"] [data-undo-grade]`).count()) === 1)
    await h.keyboard.press('Meta+z')
    await h.waitForTimeout(900)
    check('⌘Z takes the grade back', (await h.locator(`[data-feed-at="${n}"]`).getAttribute('data-feed-graded')) === null && !(await h.locator(`[data-feed-at="${n}"] [data-feed-grade]:disabled`).count()))
  } else check('a quiz card is in the day\'s Feed to test', false, 'no quiz card')

  // --- On your mind leaves filing tags out.
  for (let i = 0; i < 6; i++) await sql("insert into captures (id, title, kind, status, body, captured_at) values (?, ?, 'note', 'open', ?, ?)", `qa-tag-${i}`, `Filing ${i}`, JSON.stringify('A thought on rivers #quote #mine #rivers'), now)
  const side = await v('feed:side')
  check('"On your mind" leaves #quote and #mine out', !side.week.some((one) => ['quote', 'mine'].includes(one.tag)) && side.week.some((one) => one.tag === 'rivers'), side.week.map((one) => one.tag).join(' '))

  // --- At scale.
  let pages = (await sql("select count(*) as n from nuggets where tier = 'article'"))[0].n
  let sources = 0
  for (const [items, people] of [[5, 0], [50, 4], [500, 40], [5000, 400]]) {
    const more = Math.max(0, items - pages)
    if (more) await sql(`with recursive n(i) as (select 1 union all select i + 1 from n where i < ?) insert into nuggets (id, kind, tier, title, body, created_at) select 'qa-page-' || cast(? + i as integer), 'note', 'article', 'A page on slow work, number ' || cast(? + i as integer) || ' of a long and winding series with a long title', ?, datetime('now', '-' || i || ' days') from n`, more, pages, pages, JSON.stringify(`${words(80)}. ${words(700)}`))
    pages += more
    // As many likes as items, spread over three years (one a Page): Liked at the same scale.
    await sql(`insert or replace into feed_reacts (day, key, reaction, was) select date('now', '-' || (abs(random()) % 1000) || ' days'), 'article:' || id, 'like', '{}' from nuggets where tier = 'article' and 'article:' || id not in (select key from feed_reacts) limit ?`, items)
    for (; sources < people; sources++) {
      const name = sources % 7 === 0 ? `Someone With A Very Long Name Indeed, Number ${sources + 1}` : `Source ${sources + 1}`
      for (let j = 0; j < 2; j++) await sql("insert into captures (id, title, kind, status, body, captured_at, attribution) values (?, ?, 'quote', 'open', ?, ?, ?)", `qa-src-${sources}-${j}`, `Line ${j} from ${name}`, JSON.stringify(`Line ${j} from ${name}`), new Date(Date.now() - 86400000 * 60).toISOString(), name)
    }
    await fresh()
    await tab('reading')
    const rows = await h.locator('[data-reading-row]').count()
    check(`${items} Pages: Reading draws a page of rows at a time`, rows <= 31, `${rows} rows of ${pages}`)
    if (pages > 31) {
      await h.locator('[data-reading-foot]').scrollIntoViewIfNeeded()
      await h.waitForTimeout(600)
      check(`${items} Pages: more rows come as the foot nears`, (await h.locator('[data-reading-row]').count()) > rows)
    }
    await h.evaluate(() => document.querySelector('[data-feed-reading]')?.closest('[class*="overflow"]')?.scrollTo(0, 0))
    await h.waitForTimeout(300)
    await both(`${SHOTS}/reading-${items}`)
    await tab('notes')
    await both(`${SHOTS}/notes-${items}`)
    const aside = await h.locator('[data-feed-side]').boundingBox()
    const win = await h.evaluate(() => ({ w: innerWidth, h: innerHeight }))
    check(`${people} sources: the side column stays inside the window`, !!aside && aside.y + aside.height <= win.h - 8, JSON.stringify(aside))
    const all = h.locator('[data-feed-all-sources]')
    const faces = await h.locator('[data-feed-face]').count()
    const total = (await all.count()) ? Number((await all.innerText()).replace(/\D/g, '')) : faces
    check(`${people} sources: 8 faces at most, and "All N sources" past that`, faces <= 8 && (total > 8 ? (await all.count()) === 1 : (await all.count()) === 0), `${faces} faces, ${(await all.count()) ? await all.innerText() : 'no link'}`)
    const wrapped = await h.evaluate(() => [...document.querySelectorAll('[data-feed-side] :is([data-feed-quiet], [data-feed-week], [data-feed-all-sources]) > span')].filter((one) => one.getBoundingClientRect().height > 24).map((one) => one.textContent))
    check(`${people} sources: no count or name wraps`, !wrapped.length, wrapped.join(' | '))
    const face = h.locator('[data-feed-face]').last()
    if (await face.count()) {
      await face.hover()
      await h.waitForTimeout(1500)
      const floating = await h.evaluate(() => [...document.querySelectorAll('[role="tooltip"], [data-note-preview]')].filter((one) => one.getBoundingClientRect().width > 0).length)
      check(`${people} sources: a face shows one floating thing`, floating <= 1, String(floating))
      const card = await h.locator('[data-note-preview]').boundingBox().catch(() => null)
      check(`${people} sources: its card stays 12px inside the window`, !card || (card.x + card.width <= win.w - 12 && card.y + card.height <= win.h - 12 && card.x >= 12), JSON.stringify(card))
      await h.mouse.move(5, 5)
      await h.waitForTimeout(400)
    }
    await tab('liked')
    check(`${items} likes: Liked draws a page at a time`, (await h.locator('[data-liked-row]').count()) <= 31 && (await h.locator('[data-liked-row]').count()) > 0, String(await h.locator('[data-liked-row]').count()))
    const tabsAt = await h.locator('[data-tabs="feed"]').boundingBox()
    await tab('notes')
    const notesAt = await h.locator('[data-tabs="feed"]').boundingBox()
    check(`${items}: the tabs sit in one place on Notes and Liked`, Math.abs(tabsAt.y - notesAt.y) < 1, `${tabsAt.y} vs ${notesAt.y}`)
    await tab('liked')
    await both(`${SHOTS}/liked-${items}`)
  }
  // Every heading in the tabs is one role: Liked's months and Reading's "Today's read" share a size.
  check('no page errors', !errors.length, errors.join(' | '))
} finally {
  await close()
}
done()
