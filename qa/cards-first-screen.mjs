// Review's first screen is the decks, as Anki's is: "Study now" beside the tabs (the old Today), "Make a card",
// "Add many at once" and "Import" (naming Anki and CSV) always at the top, each deck with its due count first
// on a plain face in the theme's tone (no Coolshapes unless "Shapes on decks" is on), squarer corners, sub-decks
// folding on a chevron with the parent counting them, a plain list like Anki's, and the year of study under the
// decks with the streak now, the longest, the average day and the share of days studied. "Add many at once"
// offers "Show them", which shows just those cards. Nothing on the page moves as it loads or as tabs switch,
// and it fits 390 px wide.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/cards-first-screen.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const text = (selector) => h.evaluate((selector) => document.querySelector(selector)?.textContent ?? '', selector)
const boxes = (selector) => h.evaluate((selector) => [...document.querySelectorAll(selector)].map((one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}` }).join(' '), selector)
const review = async () => { await c.go('home'); await c.go('review'); await waitFor(() => has('[data-review-tab]')) }
const shot = async (name, again) => {
  if (!shots) return
  for (const [theme, said] of [['paper', 'light'], ['dark', 'dark']]) {
    await c.theme(theme)
    await again()
    await h.waitForTimeout(600)
    await h.screenshot({ path: join(shots, `${name}-${said}.png`) })
  }
  await c.theme('paper')
}
try {
  await call('cards:list', [
    { term: 'Mitosis makes', meaning: 'two cells #biology-cells' }, { term: 'Meiosis makes', meaning: 'four cells #biology-cells' },
    { term: 'Ribosome', meaning: 'makes proteins #biology-cells-parts' }, { term: 'Heart chambers', meaning: 'four #biology-organs' },
    { term: 'Cell', meaning: 'the unit of life #biology' }, { term: 'hola', meaning: 'hello #spanish' }
  ])
  const first = (await call('cards:all')).find((one) => one.prompt === 'hola')
  await call('review:grade', first.id, 3, 4000)

  // 1. Review opens on the decks.
  await review()
  check('1. Review opens on the decks', await waitFor(() => has('[data-deck-shelf]'), 4000))
  check('1. the Decks tab is the one chosen, first of the tabs', await h.evaluate(() => document.querySelector('[role="tab"]')?.getAttribute('data-review-tab') === 'decks' && document.querySelector('[data-review-tab="decks"]')?.getAttribute('aria-selected') === 'true'))
  check('1. "Study now" is a button beside the tabs, not a tab', await h.evaluate(() => { const one = document.querySelector('[data-study-now]'); return !!one && one.textContent === 'Study now' && one.getAttribute('role') !== 'tab' }))

  // 2. The ways in, always at the top, with decks already there.
  const top = await text('[data-deck-top]')
  check('2. "Make a card", "Add many at once" and "Import" are at the top', /Make a card/.test(top) && /Add many at once/.test(top) && /Import/.test(top), top)
  check('2. Import names Anki and CSV', /Anki/.test(await text('[data-deck-import]')) && /CSV/.test(await text('[data-deck-import]')))

  // 3. Decks: a plain face, due first, squarer, no Coolshapes by default.
  check('3. no Coolshapes cover on any deck by default', !(await has('[data-deck-shelf] [data-group-cover]')))
  check('3. each deck has a plain face with its due count, or its new count when none is due', await has('[data-deck-face="#biology"]') && /^5 ?new$/.test(await text('[data-deck-face="#biology"]')))
  const counts = await text('[data-own-deck="spanish"] [data-deck-counts]')
  check('3. the counts say due first, then new, then cards', /^\d+ due · \d+ new · \d+ cards?$/.test(counts.trim()), counts)
  const radius = await h.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-own-deck="biology"]')).borderTopLeftRadius))
  check('3. a deck is squarer: a corner of 4 to 6 px', radius >= 4 && radius <= 6, `${radius}px`)
  check('3. the parent counts the cards of the decks inside it', /5 cards/.test(await text('[data-own-deck="biology"] [data-deck-counts]')), await text('[data-own-deck="biology"] [data-deck-counts]'))

  // 4. Sub-decks fold on a chevron, drawn on the trunk.
  check('4. a sub-deck with its own inside has a fold chevron', await has('[data-own-deck="biology"] [data-deck-fold-kids="cells"]'))
  check('4. its child shows while open', await has('[data-deck-child="biology-cells-parts"]'))
  await h.click('[data-own-deck="biology"] [data-deck-fold-kids="cells"]')
  check('4. folding hides the deck inside it', await waitFor(() => h.evaluate(() => !document.querySelector('[data-deck-child="biology-cells-parts"]')), 2000))
  check('4. the chevron says it is folded', (await h.getAttribute('[data-own-deck="biology"] [data-deck-fold-kids="cells"]', 'aria-expanded')) === 'false')
  await h.click('[data-own-deck="biology"] [data-deck-fold-kids="cells"]')
  check('4. unfolding brings it back', await waitFor(() => has('[data-deck-child="biology-cells-parts"]'), 2000))

  // 5. The year under the decks, with its four numbers.
  check('5. the year of study sits under the decks', await h.evaluate(() => { const year = document.querySelector('[data-study-year-map]'); const last = [...document.querySelectorAll('[data-deck]')].pop(); return !!year && !!last && year.getBoundingClientRect().top > last.getBoundingClientRect().bottom }))
  check('5. it has a square a day for 53 weeks', (await h.evaluate(() => document.querySelectorAll('[data-year-grid] [data-day]').length)) === 371)
  const numbers = await h.evaluate(() => [...document.querySelectorAll('[data-year-number]')].map((one) => one.textContent))
  check('5. streak now, longest streak, average day and share of days studied', ['streak now', 'longest streak', 'a day, on days studied', 'of days studied'].every((one) => numbers.some((line) => line.endsWith(one))), numbers.join(' | '))
  const stats = await call('study:stats')
  check('5. one review today: a streak of 1 day now, the longest at least that', stats.streak?.current === 1 && stats.streak?.longest >= 1 && numbers[0].startsWith('1 day'), JSON.stringify(stats.streak))

  // 6. Nothing moves: the top row and the tabs keep their boxes as the page loads, as tabs switch, and on hover.
  const before = await boxes('[data-deck-top] > *, [data-review-tabs] > *, [data-study-now]')
  await h.hover('[data-deck-make]')
  await h.waitForTimeout(300)
  await h.click('[data-review-tab="cards"]')
  await waitFor(() => has('[data-card-browser]'))
  await h.click('[data-review-tab="decks"]')
  await waitFor(() => has('[data-deck-top]'))
  await h.waitForTimeout(1200)
  check('6. the top row and tabs stay put through hover and tab switches', before === await boxes('[data-deck-top] > *, [data-review-tabs] > *, [data-study-now]'), before)
  await h.evaluate(() => document.querySelector('[data-study-year-map]').scrollIntoView({ block: 'center' }))
  await h.waitForTimeout(300)
  const yearBox = await boxes('[data-study-year-map]')
  await h.hover('[data-year-grid] [data-day]:nth-child(200)')
  await h.waitForTimeout(200)
  check('6. pointing at a day says it in its line, and nothing moves', /review/.test(await text('[data-year-said]')) && yearBox === await boxes('[data-study-year-map]'), `${await text('[data-year-said]')} ${yearBox} / ${await boxes('[data-study-year-map]')}`)
  await shot('decks-first', async () => { await review(); await waitFor(() => has('[data-study-year-map]')) })

  // 7. The plain list, as Anki's.
  await h.click('[data-deck-look-to="list"]')
  check('7. the List switch shows the decks as a table', await waitFor(() => has('[data-deck-list]'), 2000))
  check('7. its columns are Deck, Due, New, Cards', /Deck\s*Due\s*New\s*Cards/.test(await text('[data-deck-list] > div:first-child')))
  check('7. a sub-deck folds in the list too', await has('[data-deck-list] [data-deck-fold-kids="biology"]'))
  await h.click('[data-deck-list] [data-deck-fold-kids="biology"]')
  check('7. folded, its sub-decks are gone from the list', await waitFor(() => h.evaluate(() => !document.querySelector('[data-deck-row="biology-cells"]')), 2000))
  await h.click('[data-deck-list] [data-deck-fold-kids="biology"]')
  await shot('decks-list', async () => { await review(); await waitFor(() => has('[data-deck-list]')) })
  await h.click('[data-deck-look-to="pockets"]')

  // 8. "Study now" studies; Decks brings the shelf back.
  await h.click('[data-study-now]')
  check('8. "Study now" leaves the decks for today\'s cards', await waitFor(() => h.evaluate(() => !document.querySelector('[data-deck-shelf]') && document.querySelector('[data-study-now]')?.getAttribute('aria-pressed') === 'true'), 3000))
  await h.click('[data-review-tab="decks"]')
  check('8. Decks is one click back', await waitFor(() => has('[data-deck-shelf]'), 3000))

  // 9. "Add many at once": its toast offers "Show them", which shows just those cards.
  await h.click('[data-deck-top] [data-deck-paste]')
  await waitFor(() => has('[data-paste-text]'))
  check('9. the box is called "Add many at once" and says it takes a spreadsheet', /Add many at once/.test(await text('[data-paste-cards] h3')) && /spreadsheet/.test(await text('[data-paste-cards]')))
  await h.fill('[data-paste-text]', 'uno | one\ndos | two\ntres | three')
  await h.click('[data-paste-add]')
  const show = h.locator('button', { hasText: 'Show them' }).first()
  check('9. the toast offers "Show them"', await waitFor(() => show.isVisible(), 3000))
  await show.click()
  check('9. "Show them" shows just the 3 new cards', await waitFor(() => h.evaluate(() => document.querySelector('[data-cards-only]')?.getAttribute('data-cards-only') === '3'), 3000), await text('[data-cards-only]'))
  await h.click('[data-cards-all]')
  check('9. "Show every card" goes back to all of them', await waitFor(() => h.evaluate(() => !document.querySelector('[data-cards-only]')), 2000))

  // 10. Phone width: nothing cut off, no sideways scroll.
  await review()
  await c.size(390, 844)
  await h.waitForTimeout(800)
  const wide = await h.evaluate(() => { const page = document.querySelector('[data-deck-shelf]'); const out = [...document.querySelectorAll('[data-deck-shelf] button, [data-study-year-map]')].filter((one) => one.getBoundingClientRect().right > window.innerWidth + 1).map((one) => one.textContent?.slice(0, 20)); return { scroll: page ? page.scrollWidth - page.clientWidth : -1, out } })
  check('10. at 390 x 844 nothing runs off the side', wide.scroll <= 0 && !wide.out.length, JSON.stringify(wide))
  if (shots) await h.screenshot({ path: join(shots, 'decks-phone-light.png') })
  await c.size(1200, 860)
} finally {
  await c.close()
}
done()
