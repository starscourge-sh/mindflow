// Reads counted by what really happened (the user, 19 Nov: "if i scroll down to the bottom of a read is that really
// a 'read'... no and the time it took it usually a good indicator"). Three articles in the reader: one read to its end
// for over half its reading time (finished), one whose end was reached in a moment (left: read too quickly), one read a
// little and not to its end (left: its end not reached). Stats then says 1 of 3 finished, lists the other two to pick
// back up with why, says since when it counts, and what the first turned into (its highlight).
// The window is told it is in front by Chromium's own focus emulation: nothing is shown on or takes the real screen.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=/abs/dir] node qa/read-time.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, send, go, both, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const words = (n) => Array.from({ length: n }, (_, i) => ['the', 'river', 'keeps', 'its', 'own', 'counsel', 'and', 'night'][i % 8]).join(' ')
const article = (href, title, n) => sql('insert or replace into web_articles (id, href, title, byline, site, published, html, saved_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
  `qa-${title}`, href, title, '', 'example.org', '', `<!-- reader 4 --><p>${words(n)}</p>`, new Date().toISOString())
const READ = { href: 'https://example.org/finished', title: 'A short read, finished', words: 120 }
const QUICK = { href: 'https://example.org/quick', title: 'A short read, skimmed', words: 120 }
const LONG = { href: 'https://example.org/long', title: 'A long read, begun', words: 4000 }
// A person reading: the pointer moving over the words now and then, for `ms`.
const readFor = async (ms) => {
  const box = await h.locator('[class*="@container/page"] article, [class*="@container/page"] [data-web-reader]').first().boundingBox().catch(() => null)
  for (let t = 0; t < ms; t += 1500) { await h.mouse.move((box?.x ?? 400) + 50 + (t % 7) * 10, (box?.y ?? 300) + 60); await wait(1500) }
}
try {
  const focus = await h.context().newCDPSession(h)
  await focus.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  for (const one of [READ, QUICK, LONG]) await article(one.href, one.title, one.words)
  await sql("insert into pdf_highlights (id, src, page, quote, start, end, created_at) values ('qa-mark', ?, 0, 'the river keeps', 0, 15, ?)", READ.href, new Date().toISOString())
  // Finished: 120 words take half a minute, so 18 seconds read is over half, and its end is in view at once.
  await send('web', READ.href); await wait(2500); await readFor(18000)
  await send('web', QUICK.href); await wait(2500); await readFor(1500)
  await send('web', LONG.href); await wait(2500); await readFor(6000)
  await go('home'); await wait(1500)
  const kept = await sql('select href, active_ms as ms, end_at as endAt from article_reads order by href')
  console.log('kept', JSON.stringify(kept))
  const of = (href) => kept.find((one) => one.href === href)
  check('the finished read: its end reached, over half its reading time counted', of(READ.href)?.endAt && of(READ.href).ms >= 15000, JSON.stringify(of(READ.href)))
  check('the skimmed read: its end reached, under half its reading time', of(QUICK.href)?.endAt && of(QUICK.href).ms < 15000, JSON.stringify(of(QUICK.href)))
  check('the long read: some time counted, its end not reached', of(LONG.href) && !of(LONG.href).endAt && of(LONG.href).ms > 0, JSON.stringify(of(LONG.href)))
  await go('stats'); await wait(2500)
  const page = await h.evaluate(() => document.querySelector('[class*="@container/page"]')?.innerText ?? document.body.innerText)
  check('Stats says 1 of the 3 finished', /You finished 1 article of the 3 you opened/.test(page), page.match(/You finished[^.]*\./)?.[0])
  check('it says what counts as finished, and since when', /A read counts as finished when you reached its end and spent at least half its reading time on it/.test(page) && /Counted since/.test(page))
  const pick = await h.evaluate(() => [...document.querySelectorAll('[data-pick-up-row]')].map((one) => one.innerText.replace(/\s+/g, ' ')))
  check('"Pick back up" lists the two left part way, each with why', pick.length === 2 && pick.some((one) => one.includes('A long read, begun') && /end not reached/.test(one)) && pick.some((one) => one.includes('A short read, skimmed') && /too quickly/.test(one)), JSON.stringify(pick))
  check('"What reading turned into" names its highlight', /What reading turned into/.test(page) && /A short read, finished\s*1 highlight · 0 gems · 0 cards/.test(page), page.match(/What reading turned into[\s\S]{0,200}/)?.[0])
  if (process.env.SHOTS) {
    await h.locator('[data-group="Finished or left part way"]').scrollIntoViewIfNeeded().catch(() => null)
    await both(`${process.env.SHOTS}/q1-reads-stats`)
  }
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
