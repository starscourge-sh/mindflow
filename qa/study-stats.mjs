// Study stats: "Remembering" on the Stats page and on Review's "Stats" tab, and from ⌘K "Study stats": reviews
// in the last 30 days, how often a card seen before was remembered, what falls due in two weeks, each chart
// with its words (a title, both ends of its axis, a tip on every bar) and a year of review days. The numbers
// match the review log. Light and dark screenshots beside Review's "Today" and the Stats page.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/study-stats.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
// Each theme reloads the window: `again` brings the page back after each.
const shot = async (name, again) => {
  if (!shots) return
  for (const [theme, said] of [['paper', 'light'], ['dark', 'dark']]) {
    await c.theme(theme)
    await again()
    await h.waitForTimeout(600)
    await h.screenshot({ path: join(shots, `${name}-${said}.png`) })
  }
  await c.theme('paper')
  await again()
}
try {
  const stats = await h.evaluate(() => window.api.haligtree('study:stats'))
  const sum = stats.month.reduce((all, one) => all + one.reviews, 0)
  check('30 days of reviews, today last', stats.month.length === 30 && stats.due.length === 14, `${stats.month.length} days, ${stats.due.length} ahead`)
  check('remembered never more than checked', stats.recalled <= stats.checked, `${stats.recalled} of ${stats.checked}`)
  await c.go('review')
  await h.evaluate(() => document.querySelector('[data-review-tab="stats"]').click())
  check('Review\'s "Stats" tab shows Remembering', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-study-said]'))))
  const said = await h.evaluate(() => document.querySelector('[data-study-said]').getAttribute('data-reviews'))
  check('its sentence counts the reviews of the last 30 days', said === String(sum), `${said} vs ${sum}`)
  check('a dot for each day', await h.evaluate(() => document.querySelectorAll('[data-study-month] [data-mono-dots] > *').length) === 30)
  await h.evaluate(() => document.querySelector('[data-study-month] [data-mono-switch="year"]').click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-study-year]')))
  const words = await h.evaluate(() => ['[data-study-month]', '[data-study-due]', '[data-study-year]'].map((one) => document.querySelector(one)?.textContent ?? ''))
  await h.evaluate(() => document.querySelector('[data-study-month] [data-mono-switch="month"]').click())
  await waitFor(() => h.evaluate(() => /Cards reviewed each day/.test(document.querySelector('[data-study-month]')?.textContent ?? '')))
  words[0] = await h.evaluate(() => document.querySelector('[data-study-month]')?.textContent ?? '')
  check('each chart says what it shows and its axis in words', /Cards reviewed each day/.test(words[0]) && /30 days ago/.test(words[0]) && /today/.test(words[0]) && /Cards coming due/.test(words[1]) && /in two weeks/.test(words[1]) && /Days you reviewed/.test(words[2]), words.join(' | '))
  await shot('study-stats', async () => { await c.go('review'); await h.evaluate(() => document.querySelector('[data-review-tab="stats"]').click()); await waitFor(() => h.evaluate(() => !!document.querySelector('[data-study-said]'))) })
  await c.go('stats')
  check('the Stats page has it too', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-study-said]'))))
  await shot('stats-page', async () => { await c.go('stats'); await waitFor(() => h.evaluate(() => !!document.querySelector('[data-study-said]'))) })
  await c.go('home')
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type('Study stats', { delay: 15 })
  await h.waitForTimeout(500)
  await h.keyboard.press('Enter')
  check('⌘K "Study stats" opens Review on it', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-review-stats] [data-study-said]'))))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
