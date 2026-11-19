// The Inbox's "Sort by" and "Grouping" say what they do (the user, 17 Nov: "what is 'by location' or 'example'?
// where i 'looked up'? 'where from'"). With looked-up words in the list, no "By Definition", "By Example" or
// "By Location" (the lookup's own fields), and the groupings read "Book looked up in" and "How it came in".
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
  check('the grouping by where it came in reads "How it came in"', groups.includes('How it came in') && !/\nWhere from\n/.test(groups))
  if (process.env.SHOTS) await both(`${process.env.SHOTS}/q1-grouping`)
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
  done()
}
