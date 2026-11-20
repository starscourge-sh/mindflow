// Stats is real from the first day: a person who keeps gems and cards but has written on few days sees their own
// numbers, never a "Your Stats start once..." goal with a faded sample of made-up ones beside them. A section with
// too little in it says so in its place, in one quiet line ("Writing: shows after a few days of writing").
// Run on a copy of the seeded sandbox whose writing days were taken out first:
//   sqlite3 <copy>/sandbox/haligtree.db 'delete from word_days'
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=dir] node qa/stats-from-day-one.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, v } = c
const shown = () => h.$$eval('section[data-group]', (all) => all.filter((one) => one.checkVisibility()).map((one) => one.dataset.group))
const big = (title) => h.evaluate((title) => document.querySelector(`section[data-group="${title}"] .mf-big-number`)?.textContent?.trim() ?? null, title)

try {
  await v('settings:set', { motion: false, sounds: false, readyShown: [] })
  const words = await v('words:stats')
  const stats = await v('stats')
  const studied = await v('study:stats')
  console.log(`(writing days ${words.daysWritten}; ${studied.cards} cards; ${stats.week} noted this week)`)
  await c.go('stats')
  await h.waitForTimeout(1500)
  const text = await h.evaluate(() => document.body.innerText)
  check('no goal and no sample of made-up numbers', !(await h.$('[data-goal-sample]')) && !/Your Stats start|What your Stats will look like|48,210|640 words/.test(text))
  check('Writing says in its place that it shows after a few days of writing', (await h.locator('[data-stats-later="Writing"]').textContent().catch(() => '')) === 'Writing: shows after a few days of writing')
  const glance = await shown()
  check('the real sections show: Remembering, This week, Days you opened it', ['Remembering', 'This week', 'Days you opened it'].every((one) => glance.includes(one)), glance.join(' | '))
  check(`"This week" is the book's own number (${stats.week})`, (await big('This week')) === String(stats.week), await big('This week'))
  check(`"Days you opened it" is the book's own (${new Set(stats.days).size})`, (await big('Days you opened it')) === String(new Set(stats.days).size), await big('Days you opened it'))
  const kept = Math.round((studied.recalled / studied.checked) * 100)
  check(`"Remembering" is the book's own (${kept}%)`, (await big('Remembering')) === `${kept}%`, await big('Remembering'))
  check('no "Your Stats are ready" moment', !(await h.$('[data-ready-moment]')))
  if (process.env.QA_SHOTS) await c.both(join(process.env.QA_SHOTS, 'stats-day-one'))
  // Your month and Your year are real too.
  for (const name of ['Your month', 'Your year']) {
    await h.locator(`[data-chips="stats"] button[aria-label="${name}"]`).first().click()
    await h.waitForTimeout(900)
    check(`"${name}" shows its real sections`, (await shown()).length >= 3, (await shown()).join(' | '))
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
done()
