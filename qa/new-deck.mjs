// Decks you make: Review › Decks' "New deck" asks a name in place and shows it at once (and as an empty
// pocket in All cards offering Paste cards); "Biology/Cells" sits under Biology; a card's "Move to deck…"
// and the many-picked menu offer "New deck…" first and move the cards in, with Undo; ⌘K "New deck" and
// "New card in #x"; Review says deck. Light and dark screenshots of the Decks tab and the pockets.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/new-deck.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const tab = (id) => h.evaluate((id) => document.querySelector(`[data-review-tab="${id}"]`).click(), id)
const decks = async () => { await c.go('review'); await waitFor(() => has('[data-review-tab]')); await tab('decks'); await waitFor(() => has('[data-deck-shelf], [data-empty]')) }
const cards = async (density) => {
  await h.evaluate((density) => localStorage.setItem('view:cards', JSON.stringify({ sort: 'due', group: 'none', filter: {}, density })), density)
  await c.go('home')
  await c.go('review')
  await waitFor(() => has('[data-review-tab]'))
  await tab('cards')
  await waitFor(() => has('[data-card-browser]'))
}
// The app's own question, answered: the name typed, Enter.
const answer = async (words) => {
  if (!(await waitFor(() => has('[data-ask-field]')))) return false
  await h.waitForTimeout(150)
  await h.locator('[data-ask-field]').fill(words)
  await h.keyboard.press('Enter')
  return true
}
// A deck named in place, in the grid (ask-sheet.mjs): the name typed in its field, Enter.
const inPlace = async (words) => {
  if (!(await waitFor(() => h.evaluate(() => document.activeElement?.matches('[data-name-in-place]'))))) return false
  await h.keyboard.type(words)
  await h.keyboard.press('Enter')
  return true
}
const tagsOf = async (id) => (await call('cards:all')).find((one) => one.id === id)?.tags ?? []
const menuItem = (words) => h.locator('[role="menuitem"]', { hasText: words }).first()
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
try {
  await call('cards:list', [{ term: 'Zebra question', meaning: 'Zebra answer #zoo' }, { term: 'Yak question', meaning: 'Yak answer #zoo' }, { term: 'Xerus question', meaning: 'Xerus answer #zoo' }])
  const all = await call('cards:all')
  const zebra = all.find((one) => one.prompt === 'Zebra question').id
  const yak = all.find((one) => one.prompt === 'Yak question').id
  const xerus = all.find((one) => one.prompt === 'Xerus question').id

  // 1. New deck from the Decks tab: asked in place, shown at once, empty, with its two ways in.
  await decks()
  check('1. the Decks tab offers the ways cards come in at its top', /Make a card/.test(await h.evaluate(() => document.querySelector('[data-deck-top]')?.textContent ?? '')))
  await h.click('[data-deck-new]')
  check('1. New deck asks for a name in place', await inPlace('Zymurgy'))
  check('1. the new deck shows at once, empty', await waitFor(() => has('[data-own-deck="zymurgy"] [data-deck-empty]')))
  check('1. it is a tag: #zymurgy, made as a deck', (await call('decks:made')).includes('zymurgy'))
  check('1. the empty deck says a click makes a card', /click to make a card/.test(await h.evaluate(() => document.querySelector('[data-own-deck="zymurgy"]')?.textContent ?? '')))
  // Its review settings from its menu's "Deck settings…".
  await h.locator('[data-own-deck="zymurgy"] [data-deck-dots]').first().click()
  await h.waitForTimeout(400)
  await menuItem('Deck settings…').click()
  await waitFor(() => has('[data-deck-settings]'))
  const settings = await h.evaluate(() => document.querySelector('[data-deck-settings]')?.textContent ?? '')
  check('1. its menu holds its review settings', /New cards a day/.test(settings) && /Typed answers/.test(settings), settings.slice(0, 200))
  await h.keyboard.press('Escape')
  await waitFor(async () => !(await has('[data-deck-settings]')), 2000)

  // 2. A nested deck sits under its parent.
  await h.click('[data-deck-new]')
  await inPlace('Zymurgy/Cells')
  check('2. "Zymurgy/Cells" shows inside Zymurgy', await waitFor(() => has('[data-own-deck="zymurgy"] [data-deck-kids="zymurgy"]')))
  check('2. and not as a deck of its own beside it', !(await has('[data-own-deck="zymurgy-cells"]')))
  await shot('decks-tab', decks)

  // 3. The empty deck is a deck on Decks (All cards holds only cards), and its menu's "Add many at once" is aimed at it.
  await decks()
  check('3. the empty deck shows on Decks', await waitFor(() => has('[data-own-deck="zymurgy"]')))
  await cards('grid')
  check('3. and All cards draws no deck at all, only cards', !(await has('[data-card-browser] :is([data-pocket], .mf-pile)')))
  await decks()
  await h.locator('[data-own-deck="zymurgy"]').click({ button: 'right' })
  await h.getByRole('menuitem', { name: /^Add many at once/ }).first().click()
  check('3. its Paste cards opens aimed at the deck', await waitFor(async () => (await h.evaluate(() => document.querySelector('[data-paste-cards] [data-deck-pick]')?.getAttribute('data-deck-pick'))) === 'zymurgy'))
  await h.locator('[data-paste-text]').fill('What is zymurgy? | The study of fermentation')
  await h.evaluate(() => document.querySelector('[data-paste-add]').click())
  check('3. the pasted card goes in the deck', await waitFor(async () => (await call('cards:all')).some((one) => one.prompt === 'What is zymurgy?' && one.tags.includes('zymurgy'))))

  // 4. A card's "Move to deck…" › "New deck…": named, moved in, Undo puts it back.
  await cards('list')
  await waitFor(() => has(`[data-pick="nugget:${zebra}"]`))
  await h.locator(`[data-pick="nugget:${zebra}"]`).click({ button: 'right' })
  await h.waitForTimeout(400)
  check('4. the card menu says "Move to deck…"', await menuItem('Move to deck…').isVisible())
  await menuItem('Move to deck…').hover()
  await h.waitForTimeout(400)
  const first = await h.evaluate(() => document.querySelectorAll('[role="menu"]')[1]?.querySelector('[role="menuitem"]')?.textContent ?? '')
  check('4. "New deck…" comes first', first.includes('New deck…'), first)
  await menuItem('New deck…').click()
  await answer('Ferment')
  check('4. the card moves into the new deck', await waitFor(async () => { const tags = await tagsOf(zebra); return tags.includes('ferment') && !tags.includes('zoo') }), JSON.stringify(await tagsOf(zebra)))
  check('4. the toast says deck', await waitFor(() => h.evaluate(() => /Moved to the deck Ferment/.test(document.body.textContent ?? ''))))
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Meta+z')
  check('4. Undo puts it back', await waitFor(async () => { const tags = await tagsOf(zebra); return tags.includes('zoo') && !tags.includes('ferment') }), JSON.stringify(await tagsOf(zebra)))

  // 5. Many picked: the menu moves them all into a new deck.
  await cards('list')
  await waitFor(() => has(`[data-pick="nugget:${yak}"]`))
  await h.locator(`[data-pick="nugget:${yak}"]`).click({ modifiers: ['Meta'] })
  await h.locator(`[data-pick="nugget:${xerus}"]`).click({ modifiers: ['Meta'] })
  await h.locator(`[data-pick="nugget:${xerus}"]`).click({ button: 'right' })
  await h.waitForTimeout(400)
  check('5. the many-picked menu says "Move 2 to deck…"', await menuItem('Move 2 to deck…').isVisible().catch(() => false))
  await menuItem('Move 2 to deck…').hover()
  await h.waitForTimeout(400)
  await menuItem('New deck…').click()
  await answer('Pickled')
  check('5. both move into the new deck', await waitFor(async () => (await tagsOf(yak)).includes('pickled') && (await tagsOf(xerus)).includes('pickled')))

  // 6. ⌘K: "New deck", and "New card in #x" aimed at it.
  await c.go('home')
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type('New deck', { delay: 20 })
  await h.waitForTimeout(800)
  await h.keyboard.press('Enter')
  check('6. ⌘K "New deck" names it in place, in the deck grid', await inPlace('Kiln'))
  check('6. and makes it', await waitFor(async () => (await call('decks:made')).includes('kiln')))
  check('6. on the Decks tab', await waitFor(() => has('[data-own-deck="kiln"]')))
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type('New card in #kiln', { delay: 20 })
  await h.waitForTimeout(800)
  await h.keyboard.press('Enter')
  check('6. ⌘K "New card in #kiln" opens a two-field card aimed at it', await waitFor(async () => (await h.evaluate(() => document.querySelector('[data-deck-pick]')?.getAttribute('data-deck-pick'))) === 'kiln' && await has('[data-new-question]') && await has('[data-new-answer]')))
  // Tab to the answer, ⌘↵ keeps it, in the deck.
  await h.waitForTimeout(300)
  await h.keyboard.type('What is a kiln?')
  await h.keyboard.press('Tab')
  check('6. Tab moves to the answer', await h.evaluate(() => document.activeElement?.hasAttribute('data-new-answer')))
  await h.keyboard.type('An oven for firing pots')
  await h.keyboard.press('Meta+Enter')
  check('6. ⌘↵ keeps the card in the deck', await waitFor(async () => (await call('cards:all')).some((one) => one.prompt === 'What is a kiln?' && one.tags.includes('kiln'))))

  // 8. A deck's right-click menu: its settings, Rename and Delete deck (cards kept, with Undo).
  await decks()
  await waitFor(() => has('[data-own-deck="kiln"]'))
  await h.locator('[data-own-deck="kiln"] h3').click({ button: 'right' })
  await h.waitForTimeout(400)
  const right = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent ?? '').join(' | '))
  check('8. right-click has the ⋯ menu\'s lines', ['Deck settings…', 'New deck inside', 'Rename…', 'Delete deck…'].every((one) => right.includes(one)), right)
  await menuItem('Rename…').click()
  await answer('Furnace')
  check('8. Rename deck renames the tag on its cards', await waitFor(async () => (await call('cards:all')).some((one) => one.prompt === 'What is a kiln?' && one.tags.includes('furnace'))))
  check('8. and it is still a deck', (await call('decks:made')).includes('furnace'))
  await waitFor(() => has('[data-own-deck="furnace"]'))
  await h.locator('[data-own-deck="furnace"] h3').click({ button: 'right' })
  await h.waitForTimeout(400)
  await menuItem('Delete deck…').click()
  check('8. Delete asks first, saying the cards are kept', await waitFor(() => h.evaluate(() => /cards themselves are kept|card themselves are kept|themselves are kept/.test(document.querySelector('[data-sure]')?.textContent ?? ''))))
  await h.evaluate(() => document.querySelector('[data-sure-yes]').click())
  const kiln = async () => (await call('cards:all')).find((one) => one.prompt === 'What is a kiln?')
  check('8. Delete takes the tag off and keeps the card', await waitFor(async () => { const one = await kiln(); return !!one && !one.tags.includes('furnace') }))
  check('8. and the deck is gone', await waitFor(async () => !(await has('[data-own-deck="furnace"]'))))
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Meta+z')
  check('8. Undo brings the deck and its tag back', await waitFor(async () => (await kiln())?.tags.includes('furnace') && (await call('decks:made')).includes('furnace')))

  // 9. Decks sort by most due.
  const order = await h.evaluate(() => [...document.querySelectorAll('[data-own-deck]')].map((one) => one.getAttribute('data-own-deck')))
  const dues = Object.fromEntries((await call('cards:all')).filter((one) => one.made !== 'deck').flatMap((one) => one.tags.map((tag) => [tag, one])).map(([tag]) => [tag, 0]))
  for (const one of await call('cards:all')) if (one.made !== 'deck' && !one.paused && one.dueAt && Date.parse(one.dueAt) <= Date.now()) for (const tag of order) if (one.tags.some((t) => t === tag || t.startsWith(`${tag}-`))) dues[tag] = (dues[tag] ?? 0) + 1
  check('9. the decks go most due first', order.every((tag, at) => !at || (dues[order[at - 1]] ?? 0) >= (dues[tag] ?? 0)), order.map((tag) => `${tag}:${dues[tag] ?? 0}`).join(' '))

  // 7. Review says deck.
  await cards('list')
  const words = await h.evaluate(() => document.querySelector('[data-card-browser]')?.textContent ?? '')
  check('7. the picked bar and lists say deck, not tag', !/Add tag|Take tag off|Deck or tag/.test(words))
  await h.locator(`[data-pick="nugget:${yak}"]`).click({ button: 'right' })
  await h.waitForTimeout(400)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent ?? '').join(' | '))
  check('7. the card menu says deck', /Move to deck…/.test(lines) && !/deck or tag/.test(lines), lines)
  await h.keyboard.press('Escape')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
