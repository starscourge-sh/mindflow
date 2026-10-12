// How focus sessions went: a task's own numbers on its panel, and Stats'
// focus sections, read from the sandbox's ten weeks of seeded sessions. Then
// a break taken from the pill's way ("Break" timer) leaves a row behind, and
// a task with no sessions shows nothing. Pictures in paper, dark and Brutal.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-stats/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/focus-stats.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/focus-stats`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1100, height: 900 })
const { h, v, go, send } = c
try {
  await v('settings:set', { motion: false, hintRate: 0 })
  const tasks = await v('tasks')
  const budget = tasks.find((one) => one.title.startsWith('Send the Los Alamos budget'))
  const fresh = tasks.find((one) => one.title.startsWith('Run the Voight-Kampff test'))

  const stats = await v('focus:stats')
  check('Stats has the seeded sessions', stats.total.sessions > 40, `${stats.total.sessions} sessions, ${stats.total.minutes} min`)
  check('a streak is running', stats.streak.now >= 9, `now ${stats.streak.now}, best ${stats.streak.best}`)
  check('mornings are the best time', stats.best?.part === 'morning', JSON.stringify(stats.best))
  check('some ended early and some were abandoned', stats.outcomes.early > 0 && stats.outcomes.abandoned > 0, JSON.stringify(stats.outcomes))
  check('breaks and pauses are counted', stats.breaks.n > 0 && stats.pauses.sessions > 0, `${stats.breaks.n} breaks, ${stats.pauses.sessions} paused`)
  check('top tasks named', stats.top.length >= 3, stats.top.map((one) => `${one.title}: ${one.minutes}`).join('; '))

  const one = await v('focus:task', budget.id)
  check('a task counts its own', one.sessions > 5 && one.recent.length === 14 && one.lastAt, `${one.sessions} sessions, ${one.minutes} min, ${one.finished}/${one.early}/${one.abandoned}`)
  const none = await v('focus:task', fresh.id)
  check('a task with none has none', none.sessions === 0 && none.recent.length === 0)

  // A break, the pill's way: a "Break" timer, then called off.
  const before = (await v('focus:stats')).breaks
  const id = await v('timer:start', 'Break', 300000)
  await h.waitForTimeout(31_000)
  await v('session:cancel', id)
  const after = (await v('focus:stats')).breaks
  check('a break taken is counted', after.n === before.n + 1, `${before.n} -> ${after.n}`)

  for (const [style, theme] of [['soft', 'paper'], ['soft', 'dark'], ['brutal', 'paper']]) {
    await h.evaluate((s) => localStorage.setItem('style', s), style)
    await c.theme(theme)
    await c.size(1100, 900)
    await go('stats')
    await h.waitForTimeout(1500)
    const focus = h.locator('[data-focus-chart]')
    await focus.scrollIntoViewIfNeeded()
    await h.waitForTimeout(400)
    const text = await h.evaluate(() => document.body.innerText)
    const want = [/of focus in the last 7 days/, /in a row/, /ran their full length/, /where your focus went/i, /you focus best/].filter((one) => !one.test(text))
    check(`${style}/${theme}: Stats shows focus`, !want.length, want.join(' '))
    await h.screenshot({ path: `${dir}/stats-${style}-${theme}.png` })
    await h.evaluate(() => document.querySelector('[data-focus-ends]')?.scrollIntoView({ block: 'start' }))
    await h.waitForTimeout(300)
    await h.screenshot({ path: `${dir}/stats2-${style}-${theme}.png` })
    // Weeks.
    await h.locator('[data-focus-chart] button').nth(1).click()
    await h.waitForTimeout(400)
    check(`${style}/${theme}: twelve weeks`, (await h.locator('[data-focus-chart] [data-focus-bars] > *').count()) === 12)
    await focus.screenshot({ path: `${dir}/weeks-${style}-${theme}.png` })

    await send('task', budget.id)
    await h.waitForTimeout(1500)
    const panel = h.locator('[data-task-focus]')
    check(`${style}/${theme}: the task shows its focus`, await panel.isVisible().catch(() => false))
    await panel.scrollIntoViewIfNeeded().catch(() => {})
    await h.screenshot({ path: `${dir}/task-${style}-${theme}.png` })
    await send('task', fresh.id)
    await h.waitForTimeout(1200)
    check(`${style}/${theme}: a task with none shows nothing`, (await h.locator('[data-task-focus]').count()) === 0)
  }
  // The rest of what is done again and again: routines, reviews, reading.
  const habits = await v('habits:stats')
  check('Stats counts routines and reading', habits.routines > 0 && habits.doneWeek > 0 && habits.best?.run > 1 && habits.readAll > 0, JSON.stringify(habits))
  await go('stats')
  await h.waitForTimeout(1200)
  await h.evaluate(() => document.querySelector('[data-habits]')?.scrollIntoView({ block: 'center' }))
  check('Stats says it in “Kept up”', /Kept up/.test(await h.evaluate(() => document.body.innerText)))
  await h.screenshot({ path: `${dir}/habits-stats.png` })
  const routine = tasks.find((one) => one.title.startsWith('Read twenty pages'))
  await send('task', routine.id)
  await h.waitForTimeout(1500)
  const numbers = h.locator('[data-routine-numbers]')
  const said = await numbers.innerText()
  check('a routine shows its count, run and squares', /times/.test(said.replace(/\s+/g, '')) && /in a row|Longest run/.test(said) && (await numbers.locator('[aria-label="The last four weeks"] > *').count()) === 28, said.replace(/\n/g, ' / '))
  await numbers.screenshot({ path: `${dir}/routine.png` })
  const gems = await v('items', 'nugget')
  let gem = null
  for (const one of gems) if ((await v('item', one.id))?.reviewed) { gem = one; break }
  await send('nugget', gem.id)
  await h.waitForTimeout(1500)
  // The gem's details panel, where its reviews are told.
  if (!(await h.locator('[data-review-tally]').count())) await h.locator('button[aria-label="Details"]').first().click()
  await h.waitForTimeout(1000)
  await h.locator('[data-review-tally]').scrollIntoViewIfNeeded().catch(() => {})
  const tally = h.locator('[data-review-tally]')
  check('a gem says how its reviews went', /Reviewed/.test((await tally.textContent().catch(() => '')) ?? ''), await tally.innerText().catch(() => 'none'))
  await h.screenshot({ path: `${dir}/gem-reviews.png` })
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
