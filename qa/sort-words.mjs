// The Inbox's "Sort by" and "Grouping" say what they do (the user, 17 Nov: "what is 'by location' or 'example'?
// where i 'looked up'? 'where from'"). With looked-up words in the list, no "By Definition", "By Example" or
// "By Location" (the lookup's own fields), and the groupings read "Book looked up in" and "Came from" (as the filter).
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=/abs/dir] node qa/sort-words.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, go, both, errors } = c
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
try {
  // Looked-up words as the user's book holds them: a meaning, an example, a Kindle location, from two books.
  const words = await sql("select id from captures where status = 'open' order by captured_at desc limit 4")
  for (const [at, one] of words.entries())
    await sql("update captures set kind = 'word', medium = ?, fields = ? where id = ?", at % 2 ? 'Frankenstein' : 'Dracula', JSON.stringify({ location: String(20 + at), definition: `meaning ${at}`, example: `example ${at}` }), one.id)
  // Brought in from somewhere, beside ones typed here: the grouping by how each came in is offered.
  await sql("update captures set source = 'Obsidian' where id = ?", words[0].id)
  await go('inbox')
  const sort = await h.waitForSelector('button:has-text("Sort:")', { timeout: 8000 })
  await sort.click()
  await h.waitForTimeout(600)
  const menu = await h.evaluate(() => document.body.innerText)
  for (const gone of ['By Definition', 'By Example', 'By Location']) check(`no "${gone}" in Sort by`, !menu.includes(gone))
  const grouping = await h.$('button:has-text("Kind"), [role=combobox]:near(:text("Grouping"))')
  await h.locator('text=Grouping').locator('xpath=..').locator('button, [role=combobox]').first().click().catch(() => grouping?.click())
  await h.waitForTimeout(500)
  const groups = await h.evaluate(() => document.body.innerText)
  check('the grouping by book reads "Book looked up in"', groups.includes('Book looked up in') && !groups.includes('Where looked up'))
  check('the grouping by where it came in reads "Came from", as its filter does', groups.includes('Came from') && !/\nWhere from\n/.test(groups))
  if (process.env.SHOTS) await both(`${process.env.SHOTS}/q1-grouping`)
  // Sort by as a finished list (20 Nov: "looks like a first draft"): one row an order, a direction turned by its
  // arrow, the tick in its own column, no count by the heading, no loose sentence among the rows.
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  const rows = () => h.evaluate(() => [...document.querySelectorAll('[role=menu][aria-label="Sort by"] [role=menuitemradio]')].map((one) => ({ name: one.textContent.trim(), on: one.getAttribute('aria-checked') === 'true', height: Math.round(one.getBoundingClientRect().height), hand: getComputedStyle(one).cursor, tick: one.querySelector('svg') ? Math.round(one.querySelector('svg').getBoundingClientRect().left - one.getBoundingClientRect().left) : null })))
  const listed = await rows()
  check('Sort by: one "Recently changed" row, no "Longest unchanged" row of its own', listed.some((one) => one.name === 'Recently changed') && !listed.some((one) => one.name === 'Longest unchanged'), JSON.stringify(listed.map((one) => one.name)))
  check('Sort by: every row one height, the hand on each', listed.length > 2 && listed.every((one) => one.height === listed[0].height && one.hand === 'pointer'), JSON.stringify(listed))
  check('Sort by: no count beside its heading, no loose sentence under the rows', await h.evaluate(() => { const box = document.querySelector('[role=menu][aria-label="Sort by"]').closest('section'); return box.querySelector('h2').textContent.trim() === 'Sort by' && !box.querySelector('p') }))
  await h.locator('[role=menuitemradio]', { hasText: 'Recently changed' }).click()
  await h.waitForTimeout(300)
  await h.locator('[data-sort-turn]').click()
  await h.waitForTimeout(300)
  const turned = await rows()
  const said = await h.evaluate(() => document.querySelector('[data-display]')?.textContent.replace(/\s+/g, ' ').trim())
  check('its arrow turns it round: the row and the button say "Longest unchanged"', turned.find((one) => one.on)?.name === 'Longest unchanged' && /Sort: Longest unchanged/.test(said ?? ''), `${JSON.stringify(turned.find((one) => one.on))} ${said}`)
  if (process.env.SHOTS) await both(`${process.env.SHOTS}/q1-sort-by`)
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
  done()
}
