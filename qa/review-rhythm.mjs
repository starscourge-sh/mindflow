// The review rhythm, driven in the real app over the sandbox's made-up data:
// captures per day on Home's month (with the gaps), the morning "Sort this
// out" over the Inbox with its ten-minute clock, today's captures beside
// Close the day's line, the week's review template, last period's intentions
// and the month's aims carried in, one cadence per habit and goal with a soft
// cap, the day's time log, the archive of older weeks, recall offered only on
// the day, a card showing its passage, and a score per sitting charted by tag.
//
//   npx electron-vite build --outDir out-rhythm
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-rhythm/main/index.js HALIGTREE_QA_AWAY=1 node qa/review-rhythm.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1280, height: 900, at: '09:30' })
const { h, v, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const key = (d) => d.toLocaleDateString('en-CA')
const monday = (d = new Date()) => { const x = new Date(d); const back = (x.getDay() + 6) % 7; x.setDate(x.getDate() - back); return key(x) }
const shift = (day, by) => { const x = new Date(`${day}T12:00:00`); x.setDate(x.getDate() + by); return key(x) }
try {
  await v('settings:set', { hintRate: 0, homeCalendar: true })
  const caught = await h.evaluate((d) => window.api.captures.create({ kind: 'note', body: d }), doc('a thought caught this morning for the rhythm probe'))

  // 1. Captures per day on Home's month, with the gaps; both marks at once.
  await go('home')
  await h.waitForSelector('[data-month-plan] [data-day]', { timeout: 15000 })
  const s0 = await v('settings')
  check('1. captures marks are off to start', s0.monthCaptures === false && await h.locator('[data-month-plan] [data-captured]').count() === 0)
  await h.click('[data-month-plan] [data-month-show]'); await h.click('[data-month-captures-switch]'); await h.keyboard.press('Escape')
  await h.waitForTimeout(700)
  const levels = await h.evaluate(() => [...document.querySelectorAll('[data-month-plan] [data-captured]')].map((one) => Number(one.getAttribute('data-captured'))))
  check('1. switched on, days carry a capture mark at 3 strengths or a gap', levels.some((n) => n > 0) && levels.every((n) => n >= 0 && n <= 3), JSON.stringify([...new Set(levels)]))
  const today = key(new Date())
  check('1. today has a capture mark', Number(await h.getAttribute(`[data-month-plan] [data-day="${today}"]`, 'data-captured')) >= 1)
  check('1. a key under the calendar says what the marks mean', /Captured: 1 to 2, 3 to 5, 6 or more/.test(await h.locator('[data-month-key]').innerText()))
  await h.click('[data-month-plan] [data-month-show]'); await h.click('[data-month-opened-switch]'); await h.keyboard.press('Escape')
  await h.waitForTimeout(600)
  check('1. both marks can show at once', await h.locator('[data-month-plan] [data-opened-mark]').count() > 0 && await h.locator('[data-month-plan] [data-captured-mark]').count() > 0)
  const s1 = await v('settings')
  check('1. the choice is kept in Settings', s1.monthCaptures === true && s1.monthOpened === true)
  const label = await h.getAttribute(`[data-month-plan] [data-day="${today}"] button[aria-label^="Open"]`, 'aria-label')
  check('1. a day says its captures in its label', /captures?/.test(label ?? ''), label)
  const dot = await h.evaluate(() => { const m = document.querySelector('[data-captured-mark]').getBoundingClientRect(); return [m.width, m.height] })
  check('1. the marks are small dots, not pills', dot[0] <= 5 && dot[0] === dot[1], JSON.stringify(dot))
  await go('calendar')
  await h.waitForTimeout(1200)
  await h.keyboard.press('m')
  await h.waitForTimeout(900)
  check('1. the Calendar page\'s month shows the same dots', await h.locator('[data-month-plan] [data-captured-mark]').count() > 0 && await h.locator('[data-month-plan] [data-opened-mark]').count() > 0)
  await go('home')
  for (const theme of ['dark', 'light']) {
    await c.theme(theme)
    const seen = await h.evaluate(() => { const m = document.querySelector('[data-captured-mark]'); return m ? getComputedStyle(m).backgroundColor : null })
    check(`1. the capture mark has a colour in ${theme}`, !!seen && seen !== 'rgba(0, 0, 0, 0)', seen)
  }

  // 2. The morning sort: offered on Home before noon, over the Inbox, with a gentle ten-minute clock.
  await go('home')
  await h.waitForSelector('[data-month-plan] [data-day]', { timeout: 15000 })
  check('2. Home offers the morning sort', await h.locator('[data-morning-sort]').count() === 1)
  const open = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open' && !one.archivedAt && !one.keptIn && !(one.snoozedUntil && one.snoozedUntil > new Date().toLocaleDateString('en-CA'))).length
  await h.click('[data-morning-sort] button:has-text("Sort this out")')
  await h.waitForTimeout(800)
  check('2. the sheet lists every capture waiting in the Inbox', await h.locator('[data-sort-out="inbox"] [data-sort-row]').count() === open, `${await h.locator('[data-sort-out="inbox"] [data-sort-row]').count()} of ${open}`)
  check('2. a ten-minute clock runs at the top', (await h.getAttribute('[data-sort-timer]', 'data-sort-timer')) === '10')
  check('2. the offer goes once started', await h.locator('[data-morning-sort]').count() === 0)
  const first = await h.getAttribute('[data-sort-out="inbox"] [data-sort-row]', 'data-sort-row')
  await h.keyboard.press('r')
  check('2. R marks the first one resolved', (await h.getAttribute(`[data-sort-row="${first}"]`, 'data-kind')) === 'resolve')
  for (const row of await h.locator('[data-sort-out="inbox"] [data-sort-row]').all()) if ((await row.getAttribute('data-sort-row')) !== first) await row.locator('button:has-text("Later")').click()
  await h.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 11 * 60_000 })
  await h.waitForTimeout(1300)
  check('2. after ten minutes it says so, and nothing stops', (await h.getAttribute('[data-sort-timer]', 'data-sort-timer')) === 'up' && await h.locator('[data-sort-out="inbox"]').count() === 1)
  await h.keyboard.press('Meta+Enter')
  await h.waitForTimeout(900)
  const after = await h.evaluate((id) => window.api.captures.get(id), first)
  check('2. Sort them resolves it, the rest wait', after?.status === 'resolved', after?.status)
  await h.reload()
  await h.waitForTimeout(1500)

  // 3. Close the day: today's captures beside the line for today's page.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:close-day')))
  await h.waitForTimeout(800)
  const log = h.locator('[data-close-day] [data-close-line] [data-day-log]')
  check('3. the day\'s captures sit beside the line', await log.count() === 1 && (await log.innerText()).includes('a thought caught this morning'))
  const side = await h.evaluate(() => { const a = document.querySelector('[data-close-line] input')?.getBoundingClientRect(); const b = document.querySelector('[data-close-line] [data-day-log]')?.getBoundingClientRect(); return a && b ? b.left - a.right : null })
  check('3. and beside it, not under it', side !== null && side > 0, `${side}px`)
  await h.keyboard.press('Escape')

  // 4 and 5. The week's review, last week's intentions and the month's aims carried in.
  const week = monday()
  const month = today.slice(0, 7)
  const lastMonth = (() => { const x = new Date(`${month}-15T12:00:00`); x.setMonth(x.getMonth() - 1); return key(x).slice(0, 7) })()
  await v('period:save', `week:${shift(week, -7)}`, { fields: { intentions: 'ship the draft by friday' } })
  await v('period:save', `month:${month}`, { fields: { focus: 'protect the mornings' } })
  await v('period:save', `month:${lastMonth}`, { fields: { intentions: 'read two books' } })
  await go('weekpage')
  const carried = await h.locator('[data-week-carried]').innerText()
  check('5. last week\'s intentions open this week\'s page', carried.includes('ship the draft by friday'), carried.replace(/\n/g, ' | '))
  check('5. and the month\'s focus shows in its week', carried.includes('protect the mornings'))
  const labels = await h.locator('[data-week-review] label > span:first-child').allInnerTexts()
  check('4. the week\'s review asks wins, what failed, what I learned, next time and intentions', JSON.stringify(labels) === JSON.stringify(['Wins', 'What failed', 'What I learned', 'Next time', 'Intentions for next week']), JSON.stringify(labels))
  await h.locator('[data-week-review] textarea[aria-label="Wins"]').fill('finished the outline')
  await h.locator('[data-week-review] textarea[aria-label="What failed"]').focus()
  await h.waitForTimeout(500)
  check('4. a win written is kept on the week\'s page', (await v('period', `week:${week}`)).fields.wins === 'finished the outline')
  await go('monthpage')
  check('5. last month\'s intentions open this month\'s page', (await h.locator('[data-month-carried]').innerText()).includes('read two books'))
  check('5. the month asks for next month\'s intentions', await h.locator('textarea[aria-label="Intentions for next month"]').count() === 1)

  // 6 and 7. One cadence per thing; keep or drop; a soft cap.
  const daily = await v('task:add', 'stretch for the rhythm probe every day')
  const weekly = await v('task:add', 'water the rhythm probe plants every week')
  await v('settings:set', { activeCap: 1 })
  await go('weekpage')
  const weekRows = await h.locator('[data-keep-drop="week"]').innerText().catch(() => '')
  check('6. the week asks about the daily habit', weekRows.includes('stretch for the rhythm probe') && !weekRows.includes('water the rhythm probe'))
  check('7. past the cap, a soft line says so', await h.locator('[data-keep-drop="week"] [data-over-cap]').count() === 1)
  await go('monthpage')
  const monthRows = await h.locator('[data-keep-drop="month"]').innerText().catch(() => '')
  check('6. the month asks about the weekly habit and not the daily one', monthRows.includes('water the rhythm probe') && !monthRows.includes('stretch for the rhythm probe'), monthRows.slice(0, 200).replace(/\n/g, ' | '))
  await h.locator(`[data-keep-row="${weekly.id}"] button:has-text("Keep")`).click()
  await h.waitForTimeout(400)
  check('7. Keep is remembered for the month', JSON.parse((await v('period', `month:${month}`)).fields.kept ?? '[]').includes(weekly.id))
  await h.locator(`[data-keep-row="${weekly.id}"] button:has-text("Drop")`).click()
  await h.waitForTimeout(500)
  check('7. Drop sends the habit to the Bin', (await v('task', weekly.id))?.status === 'dropped')
  void daily

  // 9. The day's page builds itself as a time log.
  await go('day')
  const rows = await h.locator('[data-day-log] [data-log-row]').count()
  const text = await h.locator('[data-day-log]').innerText().catch(() => '')
  check('9. today\'s page has a time log of what happened', rows > 0 && text.includes('a thought caught this morning') && /\d{1,2}:\d{2}/.test(text), `${rows} rows`)

  // 10. Older weeks in an archive you can browse.
  await go('weekpage')
  const archive = h.locator('[data-archive] button')
  if (await archive.count()) {
    await archive.click()
    await h.waitForTimeout(900)
    check('10. the archive opens on every older week', await h.locator('[data-archive-row]').count() > 0 || (await h.locator('[data-archive]').innerText()).includes('Nothing older'))
  } else check('10. the archive is there once there are three earlier weeks', (await h.locator('section[aria-label="Earlier weeks"] li').count()) < 3)

  // 11. Recall offered only on the day: an old gem without a question is not asked; today's is.
  const gems = await v('items', 'nugget')
  const old = gems.find((one) => !one.prompt && !one.supersededBy && key(new Date(one.createdAt)) !== today)
  const fresh = await v('nugget:from', 'a gem kept today for the rhythm probe', {})
  await h.evaluate((id) => window.api.openInHome('nugget', id), fresh)
  await h.waitForTimeout(1200)
  check('11. a gem kept today offers its question', await h.locator('[data-ask-line]').count() === 1)
  if (old) {
    await h.evaluate((id) => window.api.openInHome('nugget', id), old.id)
    await h.waitForTimeout(1200)
    check('11. an older gem does not ask again', await h.locator('[data-ask-line]').count() === 0)
  } else check('11. (no older gem without a question in the sandbox)', true)

  // 12 and 13. A card from a selection shows its passage; a sitting is scored and charted by tag.
  const source = await h.evaluate((d) => window.api.captures.create({ kind: 'note', body: d }), doc('Water boils at one hundred degrees at sea level, less up a mountain. #physics'))
  const card = await v('nugget:from', 'Water boils at 100 degrees at sea level #physics', { captureId: source, passage: 'Water boils at one hundred degrees at sea level' })
  await v('item:save', card, { prompt: 'At what temperature does water boil at sea level?' })
  check('12. the gem keeps the exact passage it came from', (await v('item', card))?.passage === 'Water boils at one hundred degrees at sea level')
  await v('settings:set', { newPerDay: 500 })
  await go('review')
  let seen = false
  for (let i = 0; i < 300; i++) {
    const heading = await h.locator('[data-review-finished]').count()
    if (heading) break
    const ours = (await h.locator('h2').allInnerTexts()).some((one) => one.includes('water boil'))
    await h.keyboard.press('Space')
    await h.waitForTimeout(250)
    if (ours && !seen) {
      seen = true
      check('12. turned over, the card shows the passage', (await h.locator('[data-card-passage]').innerText().catch(() => '')).includes('one hundred degrees'))
      await h.click('[data-card-passage-open]')
      await h.waitForTimeout(1200)
      check('12. and opens its note at it', (await h.locator('text=Where it came from').count()) > 0)
      await h.keyboard.press('Escape')
      await h.click('button:has-text("Back to the review")').catch(() => {})
      await h.waitForTimeout(500)
      await h.keyboard.press('Space')
      await h.waitForTimeout(250)
    }
    await h.keyboard.press('3')
    await h.waitForTimeout(250)
  }
  check('12. our card came up in the review', seen)
  check('13. the finished review asks for a score, 1 to 5', await h.locator('[data-recall-score] [data-recall]').count() === 5)
  await h.click('[data-recall="4"]')
  await h.waitForTimeout(700)
  const scores = await v('recall:scores')
  check('13. the score is kept with its cards\' tags', scores.length === 1 && scores[0].score === 4 && scores[0].tags.includes('physics'), JSON.stringify(scores[0]))
  check('13. and charted per tag', await h.locator('[data-recall-line="physics"]').count() === 1 && await h.locator('[data-recall-line="Every sitting"]').count() === 1)
} catch (error) {
  console.log('ERROR', error.message)
  results.push(false)
} finally {
  if (c.errors.length) console.log('page errors:', c.errors.slice(0, 5))
  await c.close()
}
const failed = results.filter((one) => !one).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
