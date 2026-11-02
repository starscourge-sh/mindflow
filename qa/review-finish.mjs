// Review's two finishes, "Satin · Paper", on Review's own toolbar beside the tab's controls.
// Pressed, every Review surface changes at once: deck stacks and the cards behind them, the deck
// list, Stats' panels and year chart, All cards' list, Table and Cards, Make a card, the study card.
// Paper is card stock (no gradient); satin is the metal. No control moves when it is pressed. The
// choice is kept across a restart and is also in Settings › Review, where each choice shows itself.
// Frames (QA_SHOTS=dir) of each surface in both finishes, light and dark, at 1300 and 390 wide.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/review-finish.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
let c = await sandbox({ width: 1300, height: 860, seeded: false })
let h = c.h
const waitFor = async (test, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test().catch(() => false)) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (sel) => h.evaluate((sel) => !!document.querySelector(sel), sel)
const DECKS = ['concepts', 'language-words', 'psychology-cognition', 'film', 'biology']
const WORDS = ['Zeigarnik effect', 'Cognitive load', 'Entropy', 'Chiaroscuro', 'Mitosis', 'El subjuntivo', 'Montage', 'Opportunity cost', 'Parallax', 'Counterpoint']
const cards = Array.from({ length: 40 }, (_, n) => ({ term: `What does ‘${WORDS[n % WORDS.length]}’ mean? (${n})`, meaning: `A short answer, number ${n} #${DECKS[n % DECKS.length]}` }))
const tab = async (name) => {
  await h.evaluate((name) => document.querySelector(`[data-review-tab="${name}"]`)?.click(), name)
  await waitFor(() => has(name === 'decks' ? '[data-deck-shelf]' : name === 'stats' ? '[data-review-stats]' : '[data-card-browser]'))
  await h.mouse.move(5, 5)
  await h.waitForTimeout(500)
}
const fresh = async () => { await c.go('home'); await h.waitForTimeout(300); await c.go('review'); await waitFor(() => has('[data-review-tab]')) }
const view = (patch) => h.evaluate((patch) => localStorage.setItem('view:cards', JSON.stringify({ sort: 'due', group: 'none', filter: {}, ...patch })), patch)
// Each surface's paint: its background and its shadow.
const paint = (sel) => h.evaluate((sel) => { const one = document.querySelector(sel); if (!one) return null; const s = getComputedStyle(one); return { bg: s.backgroundImage + ' ' + s.backgroundColor, shadow: s.boxShadow } }, sel)
const finishNow = () => h.evaluate(() => ({ root: document.documentElement.dataset.reviewFinish, pressed: document.querySelector('[data-review-finish-pick] [aria-checked="true"]')?.textContent }))
const press = async (to) => { await h.click(`[data-review-finish-to="${to}"]`); await h.waitForTimeout(250) }
// Every control on Review's line and toolbar, where it stands.
const boxes = () => h.evaluate(() => [...document.querySelectorAll('[data-review-tabs] button, [data-study-now], [data-review-toolbar] button, [data-review-toolbar] input')].filter((one) => one.offsetWidth).map((one) => { const r = one.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',') }).join(' '))
const shoot = async (name) => {
  if (!shots) return
  for (const look of ['light', 'dark']) { await c.look(look); await h.waitForTimeout(300); await h.screenshot({ path: join(shots, `${name}-${look}.png`) }) }
  await c.look('light')
}
// One surface in both finishes: it changes, paper is flat stock, and no control moves.
const flips = async (label, sel, metal = true) => {
  await press('satin')
  const satin = await paint(sel)
  const before = await boxes()
  await press('paper')
  const paper = await paint(sel)
  const after = await boxes()
  check(`${label}: wears paper when Paper is pressed`, !!satin && !!paper && (satin.bg !== paper.bg || satin.shadow !== paper.shadow) && !/gradient/.test(paper.bg), JSON.stringify({ satin: satin?.bg.slice(0, 60), paper: paper?.bg.slice(0, 60) }))
  if (metal) check(`${label}: satin is the metal (a sheen)`, /gradient/.test(satin?.bg ?? ''), satin?.bg.slice(0, 60))
  check(`${label}: no control moved`, before === after, before === after ? '' : `${before}\n${after}`)
}
const both = async (name) => { await press('satin'); await shoot(`${name}-satin`); await press('paper'); await shoot(`${name}-paper`) }
try {
  await waitFor(() => has('main'), 60000)
  await call('cards:list', cards)
  for (const deck of DECKS) await call('tag:set', deck, { deck: true })
  await view({})
  await fresh()
  await tab('decks')

  // The switch: there, with both words, satin first.
  const pick = await h.evaluate(() => [...document.querySelectorAll('[data-review-finish-to]')].map((one) => one.textContent).join(' · '))
  check('"Satin · Paper" is on Review\'s toolbar', pick === 'Satin · Paper', pick)
  check('...in the right-hand group, after the tab\'s own controls', await h.evaluate(() => { const right = document.querySelector('[data-review-right]'); return !!right?.contains(document.querySelector('[data-review-finish-pick]')) && !!right.contains(document.querySelector('[data-deck-look-pick]')) }))
  check('...satin to begin with', (await finishNow()).root === 'satin' && (await finishNow()).pressed === 'Satin', JSON.stringify(await finishNow()))
  check('...each half shows the hand', await h.evaluate(() => [...document.querySelectorAll('[data-review-finish-to]')].every((one) => getComputedStyle(one).cursor === 'pointer')))

  await flips('Decks: a deck\'s top card', '[data-pile-top]')
  await flips('Decks: a card behind it', '.mf-pile-edge')
  check('Paper: the root says paper, the switch says Paper', JSON.stringify(await finishNow()) === JSON.stringify({ root: 'paper', pressed: 'Paper' }), JSON.stringify(await finishNow()))
  await flips('Decks: the year chart', '[data-study-year-map]')
  await both('decks-1300')
  await h.click('[data-deck-look-to="list"]')
  await h.waitForTimeout(400)
  await flips('Decks as a list', '[data-deck-list]')
  await h.click('[data-deck-look-to="pockets"]')
  await h.waitForTimeout(300)

  await tab('stats')
  await flips('Stats: a panel', '[data-review-stats] [data-mono-card]')
  await both('stats-1300')

  await tab('cards')
  await flips('All cards: a card in the list', '[data-card-list] [data-pick^="nugget:"]', false)
  await both('cards-list-1300')
  await view({ density: 'compact' })
  await fresh()
  await tab('cards')
  await flips('All cards: the Table', '[data-card-list]', false)
  await view({ density: 'grid' })
  await fresh()
  await tab('cards')
  await flips('All cards: a card face in Cards', '[data-card-face="front"]', false)
  await both('cards-grid-1300')

  await h.click('[data-deck-make]')
  await waitFor(() => has('[data-new-card]'))
  await flips('Make a card', '[data-new-card]', false)
  await both('make-1300')
  await h.click('[data-deck-make]')
  await h.waitForTimeout(300)

  // The study card, opened while paper is on.
  await press('paper')
  await c.go('review', ':today')
  await waitFor(() => has('[data-finish-face]'))
  const study = await paint('[data-finish-face]')
  check('Studying: the card is paper', !!study && !/gradient/.test(study.bg) && /rgb|oklab|color/.test(study.bg) && !/rgba\(0, 0, 0, 0\)$/.test(study.bg), study?.bg)
  await shoot('study-1300-paper')

  // Narrow: the switch shows whole, inside the window, and nothing runs off.
  await c.size(390, 844)
  await fresh()
  await tab('decks')
  const narrow = await h.evaluate(() => { const r = document.querySelector('[data-review-finish-pick]')?.getBoundingClientRect(); return { right: Math.round(r?.right ?? 9999), width: Math.round(r?.width ?? 0), win: window.innerWidth, scroll: document.documentElement.scrollWidth } })
  check('390 wide: the switch shows whole, inside the window, no sideways scroll', narrow.width > 60 && narrow.right <= narrow.win && narrow.scroll <= narrow.win, JSON.stringify(narrow))
  await flips('390 wide: a deck', '[data-pile-top]')
  await both('decks-390')
  await tab('cards')
  await both('cards-grid-390')
  await view({ density: 'list' })
  await fresh()
  await tab('cards')
  await both('cards-list-390')
  await tab('stats')
  await both('stats-390')
  await c.size(1300, 860)

  // Settings › Review has it too, each choice showing itself; picking there changes Review's root at once.
  await press('paper')
  await c.go('settings')
  await waitFor(() => has('[data-section="Review"]'))
  await h.click('[data-section="Review"]')
  await waitFor(() => has('[data-choices="Finish"]'))
  const tiles = await h.evaluate(() => [...document.querySelectorAll('[data-choices="Finish"] [data-choice]')].map((one) => `${one.dataset.choice}:${one.getAttribute('aria-checked')}:${!!one.querySelector('[data-finish-sample] .mf-metal')}`).join(' '))
  check('Settings › Review: "Finish" with a sample for each, Paper picked', tiles === 'satin:false:true paper:true:true', tiles)
  const samples = await h.evaluate(() => [...document.querySelectorAll('[data-finish-sample] .mf-pile-top')].map((one) => /gradient/.test(getComputedStyle(one).backgroundImage)).join())
  check('...the satin sample shows the sheen, the paper one plain stock', samples === 'true,false', samples)
  if (shots) { await h.locator('[data-choices="Finish"]').scrollIntoViewIfNeeded(); await h.waitForTimeout(300); await shoot('settings') }
  await h.click('[data-choices="Finish"] [data-choice="satin"]')
  await h.waitForTimeout(300)
  check('...picking Satin there puts satin on at once', (await h.evaluate(() => document.documentElement.dataset.reviewFinish)) === 'satin')
  await h.click('[data-choices="Finish"] [data-choice="paper"]')
  await h.waitForTimeout(300)
  check('...and Paper back', (await h.evaluate(() => document.documentElement.dataset.reviewFinish)) === 'paper')
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))

  // Kept across a restart.
  await waitFor(async () => (await call('settings')).reviewFinish === 'paper')
  await c.close()
  c = await sandbox({ width: 1300, height: 860, seeded: false })
  h = c.h
  await waitFor(() => has('main'), 60000)
  await c.go('review')
  await waitFor(() => has('[data-review-finish-pick]'))
  await h.waitForTimeout(500)
  check('After a restart: still Paper', JSON.stringify(await finishNow()) === JSON.stringify({ root: 'paper', pressed: 'Paper' }), JSON.stringify(await finishNow()))
} finally {
  await c.close()
}
done()
