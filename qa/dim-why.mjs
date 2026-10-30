// Every dimmed row says why it is dimmed, first on the line under its title, the way a capture that took its exit
// does ("Kept as a gem"): closed goals, closed questions, paused gems, done tasks, captures that took an exit.
// Checked in the app on each page that lists them, at a list's sizes.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/dim-why.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v } = c
const dimmed = () => h.evaluate(() => [...document.querySelectorAll('[data-row]')].filter((row) => {
  for (let el = row; el && el !== document.body; el = el.parentElement) if (Number(getComputedStyle(el).opacity) < 0.9) return el === row || row.contains(el) || el.contains(row)
  return false
}).map((row) => ({ title: row.querySelector('[data-title], .truncate')?.textContent ?? '', text: row.innerText.replace(/\s+/g, ' ').trim() })))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // One of each that dims: a goal made, a goal on ice, a question answered, a question let go, a gem paused.
  const goals = await v('items', 'goal'), questions = await v('items', 'question'), gems = await v('items', 'nugget')
  console.log(`${goals.length} goals, ${questions.length} questions, ${gems.length} gems`)
  if (goals[0]) await v('goal:close', goals[0].id, 'made it')
  if (goals[1]) await v('goal:close', goals[1].id, 'on ice')
  if (questions[0]) await v('question:close', questions[0].id, 'answered', false)
  if (questions[1]) await v('question:close', questions[1].id, 'let go', false)
  if (gems[0]) await v('item:save', gems[0].id, { suspended: true })
  await h.reload(); await h.waitForTimeout(1500)
  const seen = []
  for (const page of ['goals', 'questions', 'nuggets', 'articles', 'inbox', 'all', 'discarded', 'today', 'upcoming', 'later']) {
    await c.go(page); await h.waitForTimeout(600)
    // Each tab of the page, so a closed goal under "Ended" is looked at too.
    // Each tab of the page, so a closed goal under "Ended" is looked at too.
    const tabs = await h.locator('[data-list-tabs] button').count()
    for (let tab = 0; tab <= tabs; tab++) {
      if (tab) { await h.locator('[data-list-tabs] button').nth(tab - 1).click(); await h.waitForTimeout(500) }
      for (const row of await dimmed()) seen.push({ page: `${page}${tab ? `/${tab}` : ''}`, ...row })
      if (SHOT && (await dimmed()).length) await h.screenshot({ path: `${SHOT}/dim-${page}-${tab}.png` })
    }
  }
  console.log(seen.map((one) => `${one.page}: ${one.text.slice(0, 140)}`).join('\n'))
  check('dimmed rows were found to look at', seen.length > 0, seen.length)
  const WHY = /\b(Made it|Missed|Gave it up|Crossed off|On ice since|Paused|Answered|Stopped asking|Kept as|Kept in|Became|Made into|In the Bin|Done|Hidden until)\b/
  for (const one of seen) check(`${one.page}: “${one.text.slice(0, 40)}” says why it is dimmed`, WHY.test(one.text), one.text)
  for (const page of ['goals/2', 'goals/3', 'nuggets']) check(`${page} has a dimmed row to look at`, seen.some((one) => one.page === page))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
