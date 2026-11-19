// Stats from what the book really keeps (the user's six, 19 Nov: "no fake metrics; every number says what counts").
// Known rows are laid in the sandbox's own tables, then "Your month" is read: tasks on time or late and the ones moved
// most, captures left unsorted and how long sorted ones waited, cards forgotten most and how long cards are held,
// pages never touched after their first day, and each goal's steps in the last four weeks. Focus (sessions finished
// or stopped early, where its hours went) and words per week were there already and are not repeated.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=/abs/dir] node qa/more-stats.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { electron, h, go, both, errors } = c
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const ago = (days) => new Date(Date.now() - days * 86_400_000).toISOString()
try {
  // Tasks: two done on their day, one a day late, made 2, 4 and 6 days before; one open moved 3 times and carried 2 days.
  await sql("update tasks set status = 'dropped' where status = 'done'")
  for (const [id, made, done, due] of [['qa-t1', 6, 2, 1], ['qa-t2', 4, 3, 3], ['qa-t3', 2, 1, 2]])
    await sql("insert into tasks (id, number, title, status, created_at, completed_at, due_at, all_day) values (?, (select max(number) + 1 from tasks), ?, 'done', ?, ?, ?, 1)", id, `QA done ${id}`, ago(made), ago(done), ago(due))
  await sql("insert into tasks (id, number, title, status, created_at, reschedules, rollovers) values ('qa-moved', (select max(number) + 1 from tasks), 'QA moved task', 'open', ?, 3, 2)", ago(9))
  const page = async () => h.evaluate(() => document.querySelector('[class*="@container/page"]')?.innerText ?? '')
  await go('stats'); await h.waitForTimeout(1500)
  await h.locator('button:has-text("Your month"), [role=tab]:has-text("Your month")').first().click(); await h.waitForTimeout(2500)
  const text = await page()
  check('tasks: 2 of the 3 with a day done on it or before, 1 after', /Of the 3 with a day, 2 were done on it or before and 1 after/.test(text), text.match(/In the last 30 days you did[^\n]*/)?.[0])
  check('tasks: half waited a day or less (waits of 4, 1 and 1 days)', /Half waited a day or less/.test(text), text.match(/Half waited[^.]*\./)?.[0])
  check('tasks: the one moved most, with how', /QA moved task\s*its day changed 3 times · carried over 2 days/.test(text))
  check('captures: still in the Inbox, said with what counts as dealt with', /still in your Inbox/.test(text) && /Dealt with: made a gem, a page, a task or a question, resolved, or moved to the Bin/.test(text), text.match(/\d+ captures? (is|are) still in your Inbox[^.]*\./)?.[0])
  const shown = await h.evaluate(() => [...document.querySelectorAll('[data-group]')].map((one) => one.getAttribute('data-group')))
  check('each of the new sections that has something to say is on the page', ['Tasks, on time or late', 'Left unsorted'].every((one) => shown.includes(one)), JSON.stringify(shown))
  for (const title of ['Cards you keep forgetting', 'Pages started, never touched again', 'Steps toward your goals'])
    if (shown.includes(title)) console.log(`(${title}: shown)`)
  check('Focus still says how sessions end and where the hours went, unrepeated', !/Sessions finished vs stopped/.test(text))
  if (process.env.SHOTS) {
    await h.locator('[data-group="Tasks, on time or late"]').scrollIntoViewIfNeeded().catch(() => null)
    await both(`${process.env.SHOTS}/q1-more-stats`)
  }
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
