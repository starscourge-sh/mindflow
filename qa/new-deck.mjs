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
  check('1. the Decks tab says what a deck is', /A deck is a tag your cards share/.test(await h.evaluate(() => document.querySelector('[data-deck-shelf], [data-empty]')?.textContent ?? '')))
  await h.click('[data-deck-new]')
  check('1. New deck asks for a name in place', await answer('Zymurgy'))
  check('1. the new deck shows at once, empty', await waitFor(() => has('[data-own-deck="zymurgy"] [data-deck-empty]')))
  check('1. it is a tag: #zymurgy, made as a deck', (await call('decks:made')).includes('zymurgy'))
  check('1. it offers Paste cards and Make a card', await has('[data-own-deck="zymurgy"] [data-deck-paste]') && await has('[data-own-deck="zymurgy"] [data-deck-make]'))
  // Its review settings from its menu.
  await h.locator('[data-own-deck="zymurgy"] button[aria-label="Deck options"]').first().click()
  await h.waitForTimeout(400)
  const settings = await h.evaluate(() => document.querySelector('[role="menu"]')?.textContent ?? '')
  check('1. its menu holds its review settings', /New cards a day/.test(settings) && /typed answers/.test(settings), settings.slice(0, 200))
  await h.keyboard.press('Escape')

  // 2. A nested deck sits under its parent.
  await h.click('[data-deck-new]')
  await answer('Zymurgy/Cells')
  check('2. "Zymurgy/Cells" shows inside Zymurgy', await waitFor(() => has('[data-own-deck="zymurgy"] [data-deck-child="zymurgy-cells"]')))
  check('2. and not as a deck of its own beside it', !(await has('[data-own-deck="zymurgy-cells"]')))
  await shot('decks-tab', decks)

  // 3. The empty deck is a pocket in All cards that offers Paste cards, aimed at it.
  await cards('small')
  check('3. the empty deck is a pocket in All cards', await waitFor(() => has('[data-pocket-empty="zymurgy"]')))
  check('3. it says "Paste cards or make one"', /Paste cards or make one/.test(await h.evaluate(() => document.querySelector('[data-pocket-empty="zymurgy"]')?.textContent ?? '')))
  await shot('decks-pockets', async () => { await cards('small'); await waitFor(() => has('[data-pocket-empty]')) })
  await h.click('[data-pocket-empty="zymurgy"] [data-pocket-paste]')
  check('3. its Paste cards opens aimed at the deck', await waitFor(async () => (await h.evaluate(() => document.querySelector('[data-paste-deck]')?.value)) === 'zymurgy'))
  await h.locator('[data-paste-text]').fill('What is zymurgy? | The study of fermentation')
  await h.click('[data-paste-add]')
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
  check('4. the toast says deck', await waitFor(() => h.evaluate(() => /Moved to the deck #ferment/.test(document.body.textContent ?? ''))))
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
  check('6. ⌘K "New deck" asks for a name', await answer('Kiln'))
  check('6. and makes it', await waitFor(async () => (await call('decks:made')).includes('kiln')))
  check('6. on the Decks tab', await waitFor(() => has('[data-own-deck="kiln"]')))
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type('New card in #kiln', { delay: 20 })
  await h.waitForTimeout(800)
  await h.keyboard.press('Enter')
  check('6. ⌘K "New card in #kiln" opens a new card aimed at it', await waitFor(async () => (await h.evaluate(() => document.querySelector('[data-paste-deck]')?.value)) === 'kiln' && await h.evaluate(() => /New card in #kiln/.test(document.querySelector('[data-paste-cards] h3')?.textContent ?? ''))))

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
