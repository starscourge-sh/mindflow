// A beginner's first visit to Review, in a fresh book: the Decks page offers the ways in, each with a tiny
// example ("Make your first card", "Import from Anki"; "Make cards from a picture" waits for image occlusion),
// and an example deck of ten cards that teaches spaced repetition by doing it. Trying it studies it at once,
// with all four grades; its cards are scheduled for real but never counted (no review logged, no streak, no
// heatmap day, not in the stats' card count); its picture card shows its drawing; one click removes it all.
// The first card of your own turns the page into your decks. Nothing moves as the page loads, every way in
// shows the hand, and it all fits 390 px wide.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/first-cards.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860, seeded: false })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test().catch(() => false)) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const text = (selector) => h.evaluate((selector) => document.querySelector(selector)?.textContent ?? '', selector)
const boxes = (selector) => h.evaluate((selector) => [...document.querySelectorAll(selector)].map((one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}` }).join(' '), selector)
const review = async () => { await c.go('home'); await c.go('review'); await waitFor(() => has('[data-review-tab]')) }
const both = async (name) => shots && c.both(join(shots, name))
// A frame every 50 ms through a change, kept as files to look at.
const frames = async (name, act, n = 12) => { const run = act(); for (let at = 0; at < n; at++) { if (shots) await h.screenshot({ path: join(shots, `${name}-${String(at).padStart(2, '0')}.png`) }); await h.waitForTimeout(50) } await run }
try {
  await call('onboarding:set', { welcomed: new Date().toISOString() })
  await h.reload()
  await h.waitForTimeout(1500)
  await review()

  // 1. The ways in, each with an example; no picture way until image occlusion lands.
  check('1. a fresh book opens Review on "Your first cards"', await waitFor(() => has('[data-first-ways]')), await text('[data-deck-shelf]'))
  const at = await boxes('[data-deck-top], [data-first-ways], [data-first-way], [data-first-example]')
  await h.waitForTimeout(1500)
  check('1. nothing on the page moves after it shows', at === (await boxes('[data-deck-top], [data-first-ways], [data-first-way], [data-first-example]')), at)
  check('1. "Make your first card" and "Import from Anki", each with a tiny example', /Make your first card/.test(await text('[data-first-way="make"]')) && /Import from Anki/.test(await text('[data-first-way="import"]')) && (await h.evaluate(() => document.querySelectorAll('[data-first-way] [data-first-sample]').length)) === 2)
  check('1. no "Make cards from a picture" yet', !/picture/i.test(await text('[data-first-ways]')))
  check('1. the example deck is offered, saying it never counts', /never counts in your streak or stats/.test(await text('[data-first-example="offered"]')))
  check('1. every way in shows the hand', await h.evaluate(() => [...document.querySelectorAll('[data-first-way], [data-first-ways] button, [data-deck-top] button')].every((one) => getComputedStyle(one).cursor === 'pointer')))
  check('1. "Study now" stays the one filled button on the page', (await h.evaluate(() => [...document.querySelectorAll('[data-page] button, main button')].filter((one) => one.className.includes('bg-primary ') || / bg-primary$/.test(one.className)).length)) <= 1)
  check('1. no "gem" on the page', !/\bgems?\b/i.test(await text('[data-deck-shelf]')))
  await both('first-1-ways')

  // 2. Make your first card opens the card form.
  await h.click('[data-first-way="make"]')
  check('2. "Make your first card" opens the card form', await waitFor(() => has('[data-new-card]')))
  await both('first-2-make')
  await review()

  // 3. Try the example deck: studied at once, all four grades, scheduled but not counted.
  await frames('first-3-try', () => h.click('[data-example-try]'))
  check('3. trying the example deck studies it at once', await waitFor(() => h.evaluate(() => document.querySelector('[data-study-now]')?.getAttribute('aria-pressed') === 'true')))
  check('3. ten cards came in', (await call('example:count')) === 10)
  check('3. the first card says what the deck is for', await waitFor(async () => /What is this deck for\?/.test(await text('body'))), (await text('body')).slice(0, 200))
  check('3. the round says "The example deck" in words, not its tag', /The example deck\./.test(await text('body')) && !/Studying #how-remembering-works/.test(await text('body')))
  const arrows = await h.evaluate(() => [...document.querySelectorAll('button')].filter((one) => one.offsetParent && !one.disabled && getComputedStyle(one).cursor !== 'pointer').map((one) => one.textContent.trim() || one.getAttribute('aria-label')))
  check('3. every button while studying shows the hand', !arrows.length, JSON.stringify(arrows))
  await both('first-3-card')
  await h.keyboard.press('Space')
  await waitFor(() => has('[data-grades] button'))
  const grades = await h.evaluate(() => [...document.querySelectorAll('[data-grades] button')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()))
  check('3. all four grades show: Again, Hard, Good, Easy', grades.length === 4 && /Again/.test(grades[0]) && /Hard/.test(grades[1]) && /Good/.test(grades[2]) && /Easy/.test(grades[3]), JSON.stringify(grades))
  await both('first-3-turned')
  await h.keyboard.press('3')
  await h.waitForTimeout(800)
  const cards = await call('cards:all')
  const first = cards.find((one) => one.prompt === 'What is this deck for?')
  check('3. the graded card is scheduled for real', !!first?.dueAt && first.stage !== 'new', JSON.stringify({ due: first?.dueAt, stage: first?.stage }))
  const stats = await call('study:stats')
  check('3. never counted: no review logged, no heatmap day, no streak, no card in the stats', (await call('review:fit:state')).reviews === 0 && Object.keys(stats.year).length === 0 && stats.streak.current === 0 && stats.cards === 0, JSON.stringify({ year: stats.year, streak: stats.streak, cards: stats.cards }))

  // 4. The picture card shows its drawing.
  const picture = cards.find((one) => /haligtree:\/\/assets\/[a-f0-9]{64}\.svg/.test(one.prompt))
  check('4. one card is a picture card', !!picture)
  const loaded = await h.evaluate((src) => new Promise((done) => { const img = new Image(); img.onload = () => done(img.naturalWidth); img.onerror = () => done(0); img.src = src }), /\((haligtree:[^)]+)\)/.exec(picture?.prompt ?? '')?.[1] ?? '')
  check('4. its drawing loads', loaded > 0, loaded)

  // 5. Back on the decks: the example deck with its counts; still the first page, as no card is yours.
  await review()
  check('5. the decks page shows the example deck added, with its counts', await waitFor(() => has('[data-first-example="added"]')) && /due · 9 new/.test(await text('[data-first-example="added"]')), await text('[data-first-example]'))
  await both('first-5-added')

  // 6. Phone width: one column, no sideways scroll, tap targets at least 32 px.
  await c.size(390, 844)
  await h.waitForTimeout(600)
  const phone = await h.evaluate(() => {
    const scroller = document.querySelector('[data-deck-shelf]')?.closest('[data-page]') ?? document.scrollingElement
    const ways = [...document.querySelectorAll('[data-first-way]')].map((one) => one.getBoundingClientRect())
    const small = [...document.querySelectorAll('[data-first-ways] button, [data-first-way], [data-deck-top] button')].filter((one) => one.getBoundingClientRect().height < 32).map((one) => one.textContent)
    const wide = [...document.querySelectorAll('[data-deck-shelf] *')].filter((one) => one.getBoundingClientRect().right > window.innerWidth + 1).map((one) => one.tagName + ' ' + (one.textContent ?? '').slice(0, 30))
    return { stacked: ways.length === 2 && ways[1].top >= ways[0].bottom, small, wide: wide.slice(0, 4), sideways: scroller.scrollWidth > scroller.clientWidth + 1 }
  })
  check('6. at 390 px the ways stack, nothing runs off, every tap target is 32 px or more', phone.stacked && !phone.small.length && !phone.wide.length && !phone.sideways, JSON.stringify(phone))
  await both('first-6-phone')
  await c.size(1200, 860)

  // 7. One click removes it all.
  await h.click('[data-example-remove]')
  check('7. "Remove the example deck" takes every card away', await waitFor(async () => (await call('example:count')) === 0))
  check('7. and the page offers it again', await waitFor(() => has('[data-first-example="offered"]')))

  // 8. A card of your own: the page becomes your decks, and the example deck, when there, is named in words with its own menu.
  await call('example:add')
  await call('cards:list', [{ term: 'hola', meaning: 'hello #spanish' }])
  await review()
  check('8. with a card of your own the decks show, not the first page', await waitFor(() => has('[data-own-deck="spanish"]')) && !(await has('[data-first-ways]')))
  check('8. the example deck is named in words', /How remembering works/.test(await text('[data-own-deck="how-remembering-works"]')), await text('[data-own-deck="how-remembering-works"]'))
  await h.click('[data-own-deck="how-remembering-works"]', { button: 'right' })
  check('8. its right-click menu offers "Remove the example deck"', await waitFor(async () => /Remove the example deck/.test(await h.evaluate(() => document.querySelector('[role="menu"]')?.textContent ?? ''))))
  await h.keyboard.press('Escape')
  await both('first-8-own')
} catch (error) {
  check('ran', false, String(error?.message ?? error).split('\n')[0])
} finally {
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  await c.close()
  done()
}
