// The taste check for the Anki run's controls: the New card box's "Both ways" switch, a deck menu's
// "How much to remember" and the tag page's, each pointed at with a real pointer: one floating surface at
// most, none on a menu row; the hand on each; Haligtree's own Switch, scrub field and Chips. Light and dark
// screenshots of each beside its sibling controls.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/anki-taste.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
// Floating surfaces showing now: tips, and menus or popovers beyond `menus` already open.
const tips = () => h.evaluate(() => [...document.querySelectorAll('[role="tooltip"], [data-slot="tooltip-content"]')].filter((one) => one.getBoundingClientRect().width > 0).length)
const pointAt = async (selector) => {
  // A tall menu scrolls: the row brought into view first, as a person would scroll to it.
  await h.locator(selector).first().scrollIntoViewIfNeeded().catch(() => {})
  const box = await h.locator(selector).first().boundingBox()
  if (!box) return null
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  await h.waitForTimeout(900)
  return h.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)).cursor, [box.x + box.width / 2, box.y + box.height / 2])
}
const shot = async (name, again) => {
  if (!shots) return
  for (const [theme, said] of [['paper', 'light'], ['dark', 'dark']]) {
    await c.theme(theme)
    await again()
    await h.waitForTimeout(700)
    await h.screenshot({ path: join(shots, `${name}-${said}.png`) })
  }
  await c.theme('paper')
}
const decks = async () => {
  await c.go('home'); await c.go('review'); await waitFor(() => has('[data-review-tab]'))
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click())
  await waitFor(() => has('[data-own-deck="zoo"]'))
}
try {
  await call('cards:list', [{ term: 'perro', meaning: 'dog #zoo' }])
  await call('tag:set', 'zoo', { deck: true, retention: 0.95, newPerDay: 15 })

  // 1. New card: the switch beside the Deck field and "Make the card".
  const openNew = async () => { await decks(); await h.click('[data-own-deck="zoo"] [data-deck-dots]'); await h.locator('[role="menuitem"]', { hasText: 'Make a card' }).first().click(); await waitFor(() => has('[data-new-card]')) }
  await openNew()
  check('1. "Both ways" is Haligtree\'s Switch', await h.evaluate(() => document.querySelector('[data-new-both]')?.getAttribute('data-slot') === 'switch'))
  check('1. the hand on the switch', (await pointAt('[data-new-both]')) === 'pointer')
  const onWords = await pointAt('[data-new-both-row] > span')
  check('1. the hand on its words', onWords === 'pointer', onWords)
  check('1. pointing at it shows one tip, no more', (await tips()) <= 1, String(await tips()))
  check('1. no native title on it', await h.evaluate(() => !document.querySelector('[data-new-card] [title]')))
  await shot('taste-new-card', async () => { await openNew(); await h.click('[data-new-both]') })

  // 2. The deck's menu: "How much to remember" between "New cards a day" and "How typed answers are checked".
  const openMenu = async () => { await decks(); await h.locator('[data-own-deck="zoo"] [data-deck-dots]').first().click(); await waitFor(() => has('[role="menu"]')) }
  await openMenu()
  const rows = await h.locator('[role="menu"] [role="menuitemcheckbox"], [role="menu"] [role="menuitem"], [role="menu"] [data-menu-field]').count()
  let most = 0
  const arrows = []
  const tipped = []
  for (let at = 0; at < rows; at++) {
    const row = `:is([role="menu"] [role="menuitemcheckbox"], [role="menu"] [role="menuitem"], [role="menu"] [data-menu-field]) >> nth=${at}`
    // A field's row is words and its field: the field is what takes the pointer (its words keep the arrow, as in Settings).
    const field = await h.locator(row).evaluate((one) => one.matches('[data-menu-field]'))
    const cursor = await pointAt(field ? `${row} >> input` : row)
    const words = (await h.locator(row).textContent()).slice(0, 24)
    const n = await tips()
    if (n) tipped.push(`${words}: ${await h.evaluate(() => [...document.querySelectorAll('[role="tooltip"], [data-slot="tooltip-content"]')].map((one) => one.textContent).join('|'))}`)
    most = Math.max(most, n)
    if (cursor !== 'pointer' && cursor !== 'ew-resize' && cursor !== 'col-resize') arrows.push(`${words}: ${cursor}`)
  }
  check(`2. pointing at each of the menu's ${rows} rows shows no tip`, most === 0, tipped.join(' / '))
  check('2. the hand (or the scrub arrows) on every row', arrows.length === 0, arrows.join(' / '))
  check('2. its hint reads on a line under the name', (await h.locator('[role="menu"] [data-menu-hint]').count()) >= 1)
  // Its settings, from "Deck settings…": "How much to remember" is the scrub field, at 95%.
  await h.locator('[role="menuitem"]', { hasText: 'Deck settings…' }).first().click()
  await waitFor(() => has('[data-deck-settings]'))
  const scrub = await h.evaluate(() => document.querySelector('[data-deck-settings] input[aria-label^="How much to remember"]')?.value ?? null)
  check('2. "How much to remember" is the scrub field, 95%', scrub === '95', String(scrub))
  await h.keyboard.press('Escape')
  await waitFor(async () => !(await has('[data-deck-settings]')), 2000)
  await shot('taste-deck-menu', openMenu)
  await h.keyboard.press('Escape')

  // 3. The tag page: "How much to remember" beside "New cards a day" and "Read aloud in".
  const openTag = async () => {
    await h.evaluate(() => window.api.openInHome('tag', 'zoo'))
    await waitFor(() => h.evaluate(() => [...document.querySelectorAll('[role="tab"]')].some((one) => one.textContent === 'Manage')))
    await h.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((one) => one.textContent === 'Manage').click())
    await waitFor(() => has('[data-tag-keep]'))
  }
  await openTag()
  check('3. the tag page has it, as Chips and the scrub field', await h.evaluate(() => !!document.querySelector('[data-tag-keep] button[aria-pressed="true"][aria-label="Its own"]') && document.querySelector('[data-tag-keep] input')?.value === '95'))
  check('3. the hand on "As in Settings"', (await pointAt('[data-tag-keep] button[aria-label="As in Settings"]')) === 'pointer')
  check('3. one tip at most', (await tips()) <= 1)
  check('3. the hand on "Its own"', (await pointAt('[data-tag-keep] button[aria-label="Its own"]')) === 'pointer')
  check('3. one tip at most, and it is the app\'s', (await tips()) <= 1)
  check('3. its own line, on the same left edge as "Read the back aloud"', await h.evaluate(() => Math.abs(document.querySelector('[data-tag-keep]').getBoundingClientRect().left - document.querySelector('[data-tag-speak]').getBoundingClientRect().left) < 1), await h.evaluate(() => `${document.querySelector('[data-tag-keep]').getBoundingClientRect().left} vs ${document.querySelector('[data-tag-speak]').getBoundingClientRect().left}`))
  await shot('taste-tag-page', async () => { await openTag(); await h.evaluate(() => document.querySelector('[data-tag-keep]').scrollIntoView({ block: 'center' })) })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
