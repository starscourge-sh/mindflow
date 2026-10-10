// Marked days, in the sandbox: the seeded ones there (counted from today, a
// tag's exam among them); set from the day page, a right-click on the month's
// grid and !milestone in the box (and kept plain there, so nothing is marked);
// shown on the year's ruler, the week's strip, a goal's road, Home's and
// Today's countdown, and the year recap. Read back through the app's own API
// and the page, not by eye; SHOTS=dir keeps pictures in light and dark.
//
//   npx electron-vite build --outDir out-plan
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-plan/main/index.js MINDFLOW_QA_AWAY=1 node qa/milestones.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1180, height: 820 })
const { h, page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push({ name, ok: !!ok }), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms = 400) => h.waitForTimeout(ms)
const day = (n) => { const at = new Date(); at.setDate(at.getDate() + n); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}` }
const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })
const text = (selector) => h.evaluate((s) => [...document.querySelectorAll(s)].map((one) => one.textContent?.trim() ?? ''), selector)
const marks = () => v('milestones', null, null)
await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false })

try {
  // --- seeded, and never stale
  const seeded = await marks()
  const hamlet = seeded.find((one) => one.title === 'Hamlet essay due')
  check('seeded: Hamlet essay due in 9 days', hamlet?.day === day(9), hamlet?.day)
  check('seeded: Finished Frankenstein, months ago', seeded.some((one) => one.title === 'Finished Frankenstein' && one.day < day(-100)))
  check("a tag's exam is a marked day of its own", seeded.some((one) => one.id === 'exam:astrophysics' && one.day === day(21)))
  await v('tag:set', 'renaissance', { examAt: day(30) })
  check('an exam date set on a tag shows at once', (await marks()).some((one) => one.id === 'exam:renaissance' && one.day === day(30)))
  await v('tag:set', 'renaissance', { examAt: null })

  // --- the countdown on Home
  await c.go('home')
  await wait(800)
  const next = (await text('[data-next-mark]'))[0] ?? ''
  check("Home counts down to the next one: '9 days to Hamlet essay due'", next.includes('9 days to Hamlet essay due'), next)

  // --- set from the day page's header
  await c.go('day')
  await wait(900)
  const brief = (await text('[data-next-mark]'))[0] ?? ''
  check("Today's brief counts down too", brief.includes('Hamlet essay due'), brief)
  await h.getByRole('button', { name: 'Mark', exact: true }).click()
  await wait()
  await h.getByLabel('What the day is for').fill('Launch')
  await h.getByRole('button', { name: '🚀' }).click()
  await h.keyboard.press('Enter')
  await wait(900)
  const launch = (await marks()).find((one) => one.title === 'Launch')
  check('the day page marks today', launch?.day === day(0) && launch?.icon === '🚀', JSON.stringify(launch))
  check('its chip shows under the date', (await text('[data-day-mark]')).some((one) => one.includes('Launch')))
  await shot('milestones-day-light')

  // --- a right-click on the month's grid
  await c.go('monthpage')
  await wait(900)
  const target = (() => { const at = new Date(); at.setMonth(at.getMonth() + 1, 0); return day(Math.max(1, Math.round((at - new Date()) / 86400000) - 1)) })()
  const cell = h.locator(`[data-grid-day="${target}"]`)
  check('the month page shows its days as a grid', (await h.locator('[data-grid-day]').count()) >= 28)
  await cell.click({ button: 'right' })
  await wait()
  await h.getByRole('menuitem', { name: 'Mark this day…' }).click()
  await wait()
  await h.getByLabel('What the day is for').fill('Mock exam')
  await h.getByRole('button', { name: 'red' }).click()
  await h.keyboard.press('Enter')
  await wait(900)
  const mock = (await marks()).find((one) => one.title === 'Mock exam')
  check('a right-click on a day marks it', mock?.day === target && mock?.color === 'red', JSON.stringify(mock))
  // The month is a calendar now: a marked day is ringed and named (a flag is for an exam).
  check('it shows on the grid, ringed and named', (await cell.textContent()).includes('Mock exam') && (await cell.evaluate((one) => getComputedStyle(one).outlineStyle)) === 'solid')
  await shot('milestones-month-light')

  // --- the year's ruler: tall, named ticks
  await c.go('yearpage')
  await wait(1000)
  const labels = await text('[data-mark-label]')
  check('the year page names the marked days on its ruler', labels.some((one) => one.includes('Hamlet essay due')) && labels.length >= 3, labels.join(' | '))
  await shot('milestones-year-light')

  // --- the week's strip (Tasks, Week)
  await v('milestone:set', { day: day(2), title: 'Dentist', color: 'blue' })
  await c.go('week')
  await wait(1000)
  check('the week strip flags a marked day', (await text('[data-mark-flag]')).some((one) => one.includes('Dentist')))

  // --- a goal's road
  const goal = (await v('items', 'goal')).find((one) => one.title.startsWith('Get to Mars'))
  await c.send('goal', goal.id)
  await wait(1400)
  check("a goal's road rings the marked days on it", (await h.locator('[data-road-marked]').count()) >= 3, String(await h.locator('[data-road-marked]').count()))

  // --- the box: !milestone, and kept plain
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(400)
  await c.qa.reset()
  await page.keyboard.type('!milestone Talk on 3 Dec', { delay: 15 })
  await page.waitForTimeout(500)
  check('the box lights !milestone', (await page.locator('.box-token[data-box-token="milestone"]').count()) === 1)
  await page.keyboard.press('Alt+Meta+Enter')
  await page.waitForTimeout(1200)
  const talk = (await marks()).find((one) => one.title === 'Talk')
  check('sent, 3 December is marked and nothing is captured', !!talk && talk.day.endsWith('-12-03') && !(await page.evaluate(() => window.api.captures.list())).some((one) => one.label.includes('!milestone Talk')), talk?.day)
  await c.qa.reset()
  await page.keyboard.type('!milestone Tea on 4 Dec', { delay: 15 })
  await page.waitForTimeout(500)
  await page.click('.box-token[data-box-token="milestone"]')
  await page.waitForTimeout(300)
  await page.keyboard.press('Alt+Meta+Enter')
  await page.waitForTimeout(1200)
  check('kept plain, it is only words: no day marked', !(await marks()).some((one) => one.title === 'Tea'))

  // --- the year, wrapped
  await c.send('recap', 'year')
  await wait(2500)
  let found = false
  for (let i = 0; i < 14 && !found; i++) {
    found = (await h.evaluate(() => document.body.innerText)).includes("Your year's marked days")
    if (!found) (await h.keyboard.press('ArrowRight'), await wait(700))
  }
  check("the year's recap has its marked days", found)
  await h.keyboard.press('Escape')

  // --- dark
  if (SHOTS) {
    await c.theme('dark')
    await c.go('yearpage')
    await wait(1000)
    await shot('milestones-year-dark')
    await c.go('monthpage')
    await wait(900)
    await shot('milestones-month-dark')
    await c.go('home')
    await wait(900)
    await shot('milestones-home-dark')
  }
  check('no page errors', !c.errors.filter((one) => one.includes('PAGEERROR')).length, c.errors.length ? `console: ${c.errors.join(' / ').slice(0, 600)}` : '')
} catch (error) {
  check(`ran to the end: ${error.message.slice(0, 200)}`, false)
} finally {
  await c.close()
}
const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed`)
process.exit(failed.length ? 1 : 0)
