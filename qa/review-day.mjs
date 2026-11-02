// Review's day, walked as a person with years of Anki habits: a tag's own
// new cards a day holds, the tag's "Typed answers" and "New cards a day"
// chips, "Lighter days" in Settings, the day told as minutes with "Do 25
// minutes now" on a long day, and the honest numbers on Stats and at the end.
// Light and dark screenshots of each, beside the rows they sit with.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=<dir> node qa/review-day.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS ?? '/tmp'
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const asked = () => h.evaluate(() => document.querySelector('h2')?.textContent ?? '')
const fresh = async () => { await h.reload(); await h.waitForTimeout(2500); await c.go('review', ':today'); await waitFor(async () => (await asked()).length > 3) }
try {
  await v('settings:set', { newPerDay: 500, hintRate: 0 })

  // 1. A tag's own new cards a day: 6 #qaart cards, 3 a day; #qaphysics untouched.
  await v('cards:list', [...Array.from({ length: 6 }, (_, n) => ({ term: `Painting ${n + 1}`, meaning: `Painter ${n + 1} #qaart` })), { term: 'Speed of light', meaning: '299,792 km/s #qaphysics' }, { term: 'Planck constant', meaning: '6.626e-34 J s #qaphysics' }])
  await v('tag:set', 'qaart', { newPerDay: 3 })
  const queue = await v('review:queue')
  const art = queue.filter((one) => /Painting/.test(one.prompt ?? '')).length
  const phys = queue.filter((one) => /Speed of light|Planck/.test(one.prompt ?? '')).length
  check('#qaart at 3 a day starts 3 of its 6 new cards', art === 3, `${art}`)
  check('#qaphysics, with no limit of its own, still comes', phys === 2, `${phys}`)

  // 2. The tag's chips, under Manage beside "In Review" and "Read the back aloud".
  await h.evaluate(() => window.api.openInHome('tag', 'qaart'))
  await waitFor(() => h.evaluate(() => [...document.querySelectorAll('[role="tab"]')].some((one) => one.textContent === 'Manage')))
  await h.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((one) => one.textContent === 'Manage').click())
  check('the tag shows "Typed answers" and "New cards a day"', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-tag-typed]') && !!document.querySelector('[data-tag-new]'))))
  check('"New cards a day" shows 3 as chosen', await h.evaluate(() => document.querySelector('[data-tag-new] button[aria-pressed="true"]')?.getAttribute('aria-label') === '3'))
  await h.locator('[data-tag-typed] button[aria-label="Exact"]').click()
  check('"Exact" is kept for the tag', await waitFor(async () => (await v('tag:study')).typed.qaart === 'exact'))
  await h.locator('[data-tag-typed]').scrollIntoViewIfNeeded()
  await c.both(`${shots}/review-day-tag`)

  // 3. "Lighter days" in Settings, beside the review limits.
  await c.go('settings')
  await h.click('[data-section="Review"]').catch(() => {})
  await h.waitForTimeout(800)
  const sat = h.locator('button[aria-label="Sat"]')
  await sat.scrollIntoViewIfNeeded()
  await sat.click()
  check('"Lighter days": Saturday kept', await waitFor(async () => JSON.stringify((await v('settings')).lighterDays) === '[6]'))
  await c.both(`${shots}/review-day-lighter`)

  // 4. The day as minutes; on a long day, "Do 25 minutes now" keeps the most at risk.
  await v('cards:list', Array.from({ length: 400 }, (_, n) => ({ term: `Date ${n + 1}?`, meaning: `${1400 + n} #qahistory` })))
  await fresh()
  const line = await h.evaluate(() => document.querySelector('[data-through]')?.innerText.replace(/\s+/g, ' ') ?? '')
  check('the line says minutes left', /about \d+ minutes left/.test(line), line)
  check('a long day offers "Do 25 minutes now"', await h.locator('[data-do-25]').count() === 1)
  await c.both(`${shots}/review-day-long`, h.locator('[data-review-top]'))
  // The count rolls letter by letter, so it is read with the spaces taken out.
  const flat = (text) => text.replace(/\s+/g, '')
  const before = Number(flat(line).match(/of([\d,]+)about/)?.[1].replace(/,/g, ''))
  await h.locator('[data-do-25]').click()
  const after = async () => h.evaluate(() => document.querySelector('[data-through]')?.innerText.replace(/\s+/g, ' ') ?? '')
  check('clicked, the day is about 25 minutes and fewer cards', await waitFor(async () => { const now = await after(); const left = Number(now.match(/about (\d+) minutes left/)?.[1]); const total = Number(flat(now).match(/of([\d,]+)about/)?.[1].replace(/,/g, '')); return left >= 20 && left <= 26 && total < before }), `${line} -> ${await after()}`)
  check('a notice says the most at risk come first', await waitFor(() => h.evaluate(() => /about25minutes,mostatriskfirst/.test(document.body.textContent.replace(/\s+/g, '')))))
  check('and the button goes', await waitFor(() => h.evaluate(() => !document.querySelector('[data-do-25]'))))
  await c.both(`${shots}/review-day-trimmed`, h.locator('[data-review-top]'))

  // 5. Stats: known after 15 days, seconds a card, days reviewed.
  await h.evaluate(() => document.querySelector('[data-review-tab="stats"]')?.click())
  check('Stats says what is known, and how steady', await waitFor(() => h.evaluate(() => /(are|is) known: remembered after a gap of 15 days or more|is known yet: a card counts once you remember it after a gap of 15 days or more/.test(document.querySelector('[data-study-honest]')?.textContent ?? ''))), await h.evaluate(() => document.querySelector('[data-study-honest]')?.textContent))
  await h.locator('[data-study-honest]').scrollIntoViewIfNeeded()
  await c.both(`${shots}/review-day-stats`)

  // 5b. The card browser says the same: how many are known, and which cards are too big.
  await v('cards:list', [{ term: 'The planets in order', meaning: 'Mercury, Venus, Earth, Mars, Jupiter, Saturn #qaplanets' }])
  await h.evaluate(() => document.querySelector('[data-review-tab="cards"]')?.click())
  check('"All cards" counts the known ones', await waitFor(() => h.evaluate(() => /known \(remembered after 15 days or more\)/.test(document.querySelector('[data-card-known]')?.textContent ?? ''))))
  // All cards opens as a list of the cards: the planets card is a row of it, marked.
  // Marked by an icon now, its words in its label: "asks for 6 things (more than 4)".
  check('a six-item answer is marked as asking for 6 things', await waitFor(() => h.evaluate(() => [...document.querySelectorAll('[data-card-big]')].some((one) => /asks for 6 things/.test(one.getAttribute('aria-label') ?? '')))), await h.evaluate(() => [...document.querySelectorAll('[data-card-big]')].map((one) => one.getAttribute('aria-label')).join(' | ')))
  await h.locator('[data-card-big]').first().scrollIntoViewIfNeeded()
  await c.both(`${shots}/review-day-browser`)

  // 6. The end of a short sitting: seconds a card (and the longest-kept card when there is one).
  for (const one of await v('cards:all')) if (!/^(Speed of light|Planck constant)$/.test(one.prompt)) await v('item:save', one.id, { suspended: true })
  await fresh()
  for (let i = 0; i < 6 && !(await h.locator('[data-review-finished]').count()); i++) {
    await h.evaluate(() => document.activeElement?.blur())
    await h.waitForTimeout(1500)
    await h.keyboard.press('Space')
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]')))
    await h.keyboard.press('3')
    await h.waitForTimeout(600)
  }
  check('the end says seconds a card', await waitFor(() => h.evaluate(() => /About \d+ seconds? a card today\./.test(document.querySelector('[data-seconds-each]')?.textContent ?? ''))), await h.evaluate(() => document.querySelector('[data-review-finished]')?.innerText.slice(0, 200)))
  await c.both(`${shots}/review-day-end`)
  check('nothing went wrong on the page', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
