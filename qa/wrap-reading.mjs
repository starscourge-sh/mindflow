// Wrapped's reading card: the month's reads in the reader, finished or left part way, said as Stats says them (main/
// read-time.ts: finished only with its end reached and half its reading time spent). Three reads are laid in this
// month (one finished, two left), the month is wrapped, and its cards are turned to the reading card, framed light and dark.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=/abs/dir node qa/wrap-reading.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, look, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
try {
  const now = new Date().toISOString()
  for (const [href, title, words, ms, end] of [
    ['https://example.org/a', 'On keeping a commonplace book', 600, 120_000, now],
    ['https://example.org/b', 'The long history of marginalia', 4000, 300_000, null],
    ['https://example.org/c', 'Why we underline', 900, 20_000, now]
  ]) {
    await sql('insert or replace into web_articles (id, href, title, byline, site, published, html, saved_at) values (?, ?, ?, ?, ?, ?, ?, ?)', `qa-${title}`, href, title, '', 'example.org', '', '<!-- reader 4 --><p>words</p>', now)
    await sql('insert or replace into article_reads (href, words, active_ms, end_at, first_at, last_at) values (?, ?, ?, ?, ?, ?)', href, words, ms, end, now, now)
  }
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: `month:${new Date().toISOString().slice(0, 7)}` })))
  await wait(2500)
  for (let i = 0; i < 12 && !(await h.$('[data-wrap-card="reading"]')); i++) (await h.keyboard.press('ArrowRight'), await wait(1200))
  const card = await h.$eval('[data-wrap-card="reading"]', (el) => el.innerText.replace(/\s+/g, ' ')).catch(() => '')
  check('the month has a reading card: 1 of 3 finished, said with what finished means', /You finished 1 of 3 articles you opened/.test(card) && /Finished means its end reached with at least half its reading time spent on it/.test(card), card.slice(0, 240))
  check('it names the two left part way, with the minutes read of each', card.includes('The long history of marginalia') && card.includes('Why we underline'), card.slice(0, 400))
  // A bar is its read's share of its own reading time: 5 of 17 minutes is under a third of its track, not all of it.
  // Measured once the bars have grown in.
  await wait(1500)
  const bars = await h.$$eval('[data-wrap-card="reading"] [data-wrap-rows] .h-2', (all) => all.map((one) => Math.round((one.getBoundingClientRect().width / one.parentElement.getBoundingClientRect().width) * 100)))
  check('each bar is its share of its own read, 5 of 17 under a third', bars[0] > 20 && bars[0] < 40, JSON.stringify(bars))
  await wait(1500)
  for (const theme of ['light', 'dark']) {
    await look(theme); await wait(800)
    await h.screenshot({ path: `${process.env.SHOTS}/q1-wrap-reading-${theme}.png` })
  }
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
