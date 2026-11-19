// A goal the welcome made is never taken away or made again unasked. The user's own book (17 to 19 Nov):
// "learn Spanish", answered with a day already gone (14 Oct), was deleted with its log and made again each
// day the welcome was left, because its "three months on" was counted afresh from every today.
// Plays the welcome again, leaves it by "Skip the welcome" and "Start without the tour" as a person does,
// then checks the same goal (same id) is still there, once, with its day. Then the answer is renamed and
// left again: the same goal takes the new name in place.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-goal-kept.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const key = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const c = await sandbox({ width: 1280, height: 800 })
const { h, v, errors } = c
const goals = async (title) => (await v('items', 'goal')).filter((one) => one.title === title)
const leaveWelcome = async () => {
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome [data-skip]', { timeout: 10000 })
  await h.click('.mf-welcome [data-skip]')
  await h.waitForFunction(() => document.querySelector('.mf-welcome [data-skip]')?.textContent?.includes('Start without the tour'), null, { timeout: 8000 })
  await h.click('.mf-welcome [data-skip]')
  await h.waitForFunction(() => !document.querySelector('.mf-welcome'), null, { timeout: 10000 })
  await h.waitForTimeout(1500)
}
try {
  // As the user's book had it: made on an earlier day, three months on from then; the day asked is long gone.
  const made = key(88)
  const id = await v('goal:new', 'learn Spanish', made)
  await v('onboarding:set', { setup: { use: null, from: ['Obsidian'], space: null, exam: null, goal: 'learn Spanish', goalBy: '2026-10-14T10:00:00.000Z', made: { goalId: id, goalTitle: 'learn Spanish', goalBy: made } } })
  await leaveWelcome()
  const after = await goals('learn Spanish')
  check('the goal the welcome made is still there, the same one, after the welcome is left', after.length === 1 && after[0].id === id, JSON.stringify(after.map((one) => one.id)) + ' was ' + id)
  check('its day is the one it was made with', after[0]?.goalAt === made || after[0]?.goal_at === made, JSON.stringify(after[0] && { goalAt: after[0].goalAt ?? after[0].goal_at }))
  const setup = (await v('onboarding:state')).setup
  check('the welcome still knows it as its goal', setup?.made?.goalId === id, JSON.stringify(setup?.made))
  // The answer renamed: the same goal, renamed in place.
  await v('onboarding:set', { setup: { ...setup, goal: 'learn Portuguese' } })
  await leaveWelcome()
  const renamed = await goals('learn Portuguese')
  check('a changed answer renames the same goal, not a new one', renamed.length === 1 && renamed[0].id === id && !(await goals('learn Spanish')).length, JSON.stringify(renamed.map((one) => one.id)))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
  done()
}
