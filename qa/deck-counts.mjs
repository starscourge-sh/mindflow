// Deck counts said plainly: a deck's never-studied cards read "not studied yet" (never "new", which Anki users
// read as today's new cards); where you start studying, "N new today" is the number of new cards the session
// really serves, under a shared limit of 5 and one deck's own limit of 2, and the Journal's review line says the
// same; the first deck with a card due explains "due" once, and Got it puts that away for good.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOTS=/abs/dir node qa/deck-counts.mjs
import { join } from 'path'
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.SHOTS ?? process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })

const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(120)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const text = (selector) => h.evaluate((selector) => document.querySelector(selector)?.textContent ?? '', selector)
const blur = () => h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
const shoot = async (name) => { if (shots) await c.both(join(shots, name)) }
const decks = async () => {
  await c.go('home')
  await c.go('review')
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click())
  await waitFor(() => has('[data-deck-shelf]'))
  await h.waitForTimeout(600)
}
const lookAs = async (one) => { if (!(await has(`[data-deck-look-to="${one}"][aria-checked="true"]`))) { await h.locator(`[data-deck-look-to="${one}"]`).click(); await h.waitForTimeout(600) } }
const reload = async () => { await h.reload(); await h.waitForLoadState('domcontentloaded'); await h.waitForTimeout(1500) }
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

try {
  // Two decks of eight new cards each; one of them may start only two a day; the shared limit is five.
  await call('cards:list', [
    ...Array.from({ length: 8 }, (_, at) => ({ term: `Alpha question ${at + 1}?`, meaning: `Alpha answer ${at + 1} #alpha` })),
    ...Array.from({ length: 8 }, (_, at) => ({ term: `Beta question ${at + 1}?`, meaning: `Beta answer ${at + 1} #beta` }))
  ])
  await call('settings:set', { newPerDay: 5, reviewsPerDay: 0 })
  await call('tag:set', 'beta', { newPerDay: 2 })
  // Review's own line already put away, as it is once a person has graded a card.
  const state = await call('onboarding:state')
  await call('onboarding:set', { hintsSeen: [...new Set([...state.hintsSeen.filter((one) => one !== 'deck-due'), 'review'])], pageHints: true })
  await reload()

  // 1. The tile and the table say "not studied yet", never "new".
  await decks()
  await lookAs('pockets')
  const tile = (await text('[data-own-deck="alpha"] [data-deck-counts]')).trim()
  check('1. the tile says "not studied yet"', /^\d+ due · 8 not studied yet$/.test(tile), tile)
  check('1. no deck count on the shelf says "new"', !(await h.evaluate(() => [...document.querySelectorAll('[data-deck-counts]')].some((one) => /\bnew\b/.test(one.textContent ?? '')))))
  await shoot('shelf-tiles')
  await lookAs('list')
  const head = await h.evaluate(() => [...document.querySelectorAll('[data-deck-list] > div:first-child span')].map((one) => one.textContent).join('|'))
  check('1. the List\'s column says "Not studied"', head.includes('Not studied') && !/\|New\|/.test(head), head)
  await shoot('shelf-table')
  await lookAs('pockets')

  // 2. The first deck with a card due explains "due", once.
  const anyDue = (await call('decks:list')).some((one) => one.due > 0) || await h.evaluate(() => [...document.querySelectorAll('[data-count-due]')].some((one) => Number(one.getAttribute('data-count-due')) > 0))
  check('2. some deck has a card due (the sandbox\'s)', anyDue)
  const line = await waitFor(() => has('[data-hint-line="deck-due"]'), 4000)
  await h.waitForTimeout(1500)
  const said = await text('[data-hint-line="deck-due"]')
  check('2. the due line shows over the decks', line && /A card comes back just before you’d forget it\. When it’s back, it’s due\./.test(said), said)
  check('2. it sits above the decks and their counts', await h.evaluate(() => { const hint = document.querySelector('[data-hint-line="deck-due"]'); const grid = document.querySelector('[data-deck-grid]'); return !!hint && !!grid && hint.getBoundingClientRect().bottom <= grid.getBoundingClientRect().top + 1 }))
  await shoot('due-hint')
  await h.locator('[data-hint-line="deck-due"] button', { hasText: 'Got it' }).click()
  check('2. "Got it" puts it away', await waitFor(async () => !(await has('[data-hint-line="deck-due"]')), 3000))
  check('2. for good: kept as seen', (await call('onboarding:state')).hintsSeen.includes('deck-due'))
  await reload()
  await decks()
  await h.waitForTimeout(1200)
  check('2. it stays away after a reload', !(await has('[data-hint-line="deck-due"]')))
  // Settings › Help's "Show them again" clears what was seen: it comes back.
  await call('onboarding:set', { hintsSeen: ['review'] })
  await reload()
  await decks()
  check('2. Settings › Help brings it back', await waitFor(() => has('[data-hint-line="deck-due"]'), 4000))
  // While Review's own line is still up, it waits: one line at a time.
  await call('onboarding:set', { hintsSeen: [] })
  await reload()
  await decks()
  await h.waitForTimeout(1200)
  check('2. not while Review\'s own line is up', !(await has('[data-hint-line="deck-due"]')))
  await call('onboarding:set', { hintsSeen: ['review', 'deck-due'] })
  await reload()

  // 3. Where you start studying: "N new today", from the session's own cards.
  const allowed = await call('review:new-today')
  const before = new Map((await call('cards:all')).map((one) => [one.id, one]))
  const neverStudied = (one) => one?.stage === 'new'
  await c.go('home')
  await c.go('review', ':today')
  await waitFor(() => has('[data-new-today]'))
  const start = Number(await h.evaluate(() => document.querySelector('[data-new-today]')?.getAttribute('data-new-today')))
  const startText = await text('[data-new-today]')
  check('3. the Study start says how many new cards today brings', /^\d+ new today$|^no new cards today$/.test(startText), startText)
  check('3. never more than the shared limit of 5', start <= 5, start)
  await shoot('study-start')
  // Through the whole session, as a person would: Space turns, 3 is Good.
  for (let i = 0; i < 400 && !(await has('[data-review-finished]')); i++) {
    await blur()
    await h.keyboard.press('Space')
    await h.waitForTimeout(120)
    await h.keyboard.press('3')
    await h.waitForTimeout(160)
  }
  check('3. the session ends', await waitFor(() => has('[data-review-finished]')))
  const after = await call('cards:all')
  const served = after.filter((one) => neverStudied(before.get(one.id)) && !neverStudied(one))
  const beta = served.filter((one) => one.tags.includes('beta'))
  check('3. "N new today" is the number of new cards the session served', served.length === start && start === allowed, `said ${start}, served ${served.length}, queue ${allowed}`)
  check('3. the deck with its own limit of 2 gave at most 2', beta.length <= 2, beta.length)
  // The Journal's line for today's review says the same number, before anything was studied: checked on a fresh day's numbers.
  await call('settings:set', { newPerDay: 7 })
  const now = await call('review:new-today')
  const total = await call('review:counts')
  await c.go('day')
  await waitFor(() => h.evaluate(() => /Go through today’s review/.test(document.body.textContent ?? '')), 6000)
  const brief = await h.evaluate(() => [...document.querySelectorAll('li')].find((one) => /Go through today’s review/.test(one.textContent ?? ''))?.textContent ?? '')
  const word = now === 0 ? 'no new ones' : now === total ? (total === 1 ? 'a new one' : 'all of them new') : `${WORDS[now] ?? 'several'} of them new`
  check('3. the Journal\'s review line says how many are new', total === 0 || brief.includes(word), `${now} of ${total}: ${brief.slice(0, 160)}`)
  await shoot('journal-review-line')
  // The siblings beside them, in the same light and dark: Review's All cards and Home.
  await c.go('review', ':cards')
  await h.waitForTimeout(900)
  await shoot('sibling-all-cards')
  await c.go('home')
  await h.waitForTimeout(900)
  await shoot('sibling-home')
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 400))
}
await c.close()
done()
