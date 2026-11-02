// Review › Decks and Review › All cards can never be mistaken for each other.
// Decks: the shelf of decks, each a stack (a pile), under "Your decks: pick one to study."
// All cards: the cards themselves, never a stack. It opens as a list, one row a card, soonest due
// first, ungrouped; the grid shows single card faces with their questions; grouped by deck, each
// deck is a heading (its name, how many, how many due) over its own card faces, folding. Nowhere
// in Review does the word "pocket" reach a person. Frames at 5, 136 and 1,000 cards, 1300 and 390
// wide, light and dark.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/cards-not-decks.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const c = await sandbox({ width: 1300, height: 860, seeded: false })
const { h } = c
const waitFor = async (test, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test().catch(() => false)) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (sel) => h.evaluate((sel) => !!document.querySelector(sel), sel)
const DECKS = ['concepts', 'language-words', 'psychology-cognition', 'film', 'biology']
const WORDS = ['Zeigarnik effect', 'Cognitive load', 'Entropy', 'Chiaroscuro', 'Mitosis', 'El subjuntivo', 'Montage', 'Opportunity cost', 'Parallax', 'Counterpoint']
const make = (count, from) => Array.from({ length: count }, (_, at) => {
  const n = at + from
  return { term: `What does ‘${WORDS[n % WORDS.length]}’ mean? (${n})`, meaning: `A short answer, number ${n} #${DECKS[n % DECKS.length]}` }
})
const tab = async (name) => {
  await h.evaluate((name) => document.querySelector(`[data-review-tab="${name}"]`)?.click(), name)
  await waitFor(() => has(name === 'decks' ? '[data-deck-shelf]' : '[data-card-browser]'))
  await h.mouse.move(5, 5)
  await h.waitForTimeout(500)
}
const fresh = async () => { await c.go('home'); await h.waitForTimeout(300); await c.go('review'); await waitFor(() => has('[data-review-tab]')) }
const view = (patch) => h.evaluate((patch) => localStorage.setItem('view:cards', JSON.stringify({ sort: 'due', group: 'none', filter: {}, ...patch })), patch)
const piles = (root) => h.evaluate((root) => document.querySelector(root)?.querySelectorAll('.mf-pile, [data-pocket], [data-pile-edge], [data-shelf]').length ?? -1, root)
const shoot = async (name) => { if (!shots) return; for (const look of ['light', 'dark']) { await c.look(look); await h.waitForTimeout(250); await h.screenshot({ path: join(shots, `${name}-${look}.png`) }) } await c.look('light') }
let made = 0
const add = async (to) => {
  await call('cards:list', make(to - made, made))
  made = to
}
try {
  await waitFor(() => has('main'), 60000)
  await add(5)
  for (const deck of DECKS) await call('tag:set', deck, { deck: true })
  await view({})
  await h.evaluate(() => localStorage.removeItem('view:cards'))
  await fresh()

  // Decks: stacks, and its line.
  await tab('decks')
  check('Decks: each deck is a stack (pile)', (await piles('[data-deck-grid]')) >= 2, String(await piles('[data-deck-grid]')))
  check('Decks: its line says what it is for', (await h.evaluate(() => document.querySelector('[data-review-hint]')?.textContent)) === 'Your decks: pick one to study.')
  check('Decks: the view choice is called "Stacks", never "Pockets"', await h.evaluate(() => [...document.querySelectorAll('[data-deck-look-to]')].map((one) => one.getAttribute('aria-label')).join() === 'Stacks,List'))

  // All cards, as anyone first finds it: a list of the cards, ungrouped, soonest due first.
  const hintAt = async () => h.evaluate(() => Math.round(document.querySelector('[data-review-hint]')?.getBoundingClientRect().top ?? -1))
  const decksHint = await hintAt()
  await tab('cards')
  check('All cards: its line says what it is for, in the same place as on Decks', (await h.evaluate(() => document.querySelector('[data-review-hint]')?.textContent)) === 'Every card: find, fix or move one.' && (await hintAt()) === decksHint)
  const first = await h.evaluate(() => ({ density: document.querySelector('[data-card-browser]')?.getAttribute('data-density'), group: document.querySelector('[data-card-browser]')?.getAttribute('data-group'), rows: document.querySelectorAll('[data-card-list] [data-pick^="nugget:"]').length, text: document.querySelector('[data-card-list]')?.textContent ?? '' }))
  check('All cards opens as a list, ungrouped', first.density === 'list' && first.group === 'none', JSON.stringify(first).slice(0, 200))
  const total = (await call('cards:all')).length
  check('...one row a card, each with its question', first.rows === total && first.text.includes('Zeigarnik effect'), `${first.rows} rows of ${total}`)
  check('...and no stack anywhere on it', (await piles('[data-card-browser]')) === 0, String(await piles('[data-card-browser]')))
  await h.click('[data-display]')
  await h.waitForTimeout(400)
  const menu = await h.evaluate(() => document.body.innerText)
  check('Display offers "Cards", "List" and "Table", never "Pockets"', /Cards/.test(menu) && /List/.test(menu) && /Table/.test(menu) && !/pocket/i.test(menu))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)

  // Grid, grouped by deck: headings over single card faces.
  await view({ density: 'grid', group: 'deck' })
  await fresh()
  await tab('cards')
  const grid = await h.evaluate(() => ({
    heads: [...document.querySelectorAll('[data-card-list] [data-island-head]')].map((one) => `${one.getAttribute('data-island-head')} ${one.getAttribute('data-total')} ${/\bcards?\b/.test(one.textContent) ? 'cards' : ''}`),
    faces: [...document.querySelectorAll('[data-card-list] [data-card-face="front"]')].map((one) => one.textContent)
  }))
  check('Grouped by deck: no element is a deck pile', (await piles('[data-card-browser]')) === 0, String(await piles('[data-card-browser]')))
  check('...each deck is a heading: its name, how many cards', ['Concepts', 'Language words', 'Psychology cognition', 'Film', 'Biology'].every((name) => grid.heads.some((one) => one.startsWith(name))) && grid.heads.includes('Concepts 1 cards'), grid.heads.join(' | '))
  check('...over its own card faces, each showing its question', grid.faces.length > 0 && grid.faces.every((one) => one.trim().length > 8), `${grid.faces.length} faces`)
  // Folds: Concepts' heading hides its card and brings it back.
  const inConcepts = () => h.evaluate(() => document.querySelector('[data-island="Concepts"]')?.querySelectorAll('[data-card-face="front"]').length ?? -1)
  await h.evaluate(() => document.querySelector('[data-island="Concepts"]')?.scrollIntoView({ block: 'center' }))
  await h.waitForTimeout(500)
  const open = await inConcepts()
  await h.click('[data-island-head="Concepts"]')
  await h.waitForTimeout(300)
  const folded = await inConcepts()
  await h.click('[data-island-head="Concepts"]')
  await h.waitForTimeout(300)
  check('...and a deck folds under its heading, and opens again', open === 1 && folded === 0 && (await inConcepts()) === 1, `${open} ${folded}`)

  // Nowhere in Review says "pocket": every tab's words, labels and tips.
  const said = async () => h.evaluate(() => [document.querySelector('[data-review-page]')?.innerText ?? '', ...[...document.querySelectorAll('[data-review-page] [aria-label], [data-review-page] [title]')].map((one) => `${one.getAttribute('aria-label') ?? ''} ${one.getAttribute('title') ?? ''}`)].join(' '))
  let words = ''
  for (const one of ['decks', 'cards', 'stats']) { await tab(one); words += await said() }
  check('No "pocket" anywhere a person reads in Review', !/pocket/i.test(words), (words.match(/.{30}pocket.{30}/i) ?? [''])[0])

  // Frames: Decks to All cards, every 50 ms.
  if (shots) {
    await tab('decks')
    await h.evaluate(() => document.querySelector('[data-review-tab="cards"]')?.click())
    for (let n = 0; n < 8; n++) { await h.screenshot({ path: join(shots, `switch-${n}.png`) }); await h.waitForTimeout(50) }
  }

  // At scale, both widths, both looks: Decks, All cards' list, and its grid grouped by deck.
  for (const count of [5, 136, 1000]) {
    if (count > made) await add(count)
    for (const width of [1300, 390]) {
      await c.size(width, width === 390 ? 844 : 860)
      await view({})
      await fresh()
      await tab('decks')
      await shoot(`decks-${count}-${width}`)
      check(`${count} cards, ${width} wide: Decks still stacks`, (await piles('[data-deck-grid]')) >= 2)
      await tab('cards')
      await shoot(`list-${count}-${width}`)
      check(`${count} cards, ${width} wide: All cards a list, no stack, nothing wider than the window`, (await piles('[data-card-browser]')) === 0 && (await h.evaluate(() => document.querySelectorAll('[data-card-list] [data-pick^="nugget:"]').length)) > 0 && (await h.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)))
      await view({ density: 'grid', group: 'deck' })
      await fresh()
      await tab('cards')
      await shoot(`grid-${count}-${width}`)
      check(`${count} cards, ${width} wide: grouped grid has headings and faces, no stack`, (await piles('[data-card-browser]')) === 0 && (await h.evaluate(() => document.querySelectorAll('[data-island-head]').length)) >= 5 && (await h.evaluate(() => document.querySelectorAll('[data-card-face="front"]').length)) > 0)
      const edges = await h.evaluate(() => ({ bar: window.innerWidth, controls: [...document.querySelectorAll('[data-review-tab-controls] > *')].map((one) => Math.round(one.getBoundingClientRect().right)) }))
      check(`${count} cards, ${width} wide: every control in the toolbar shows whole, inside the window`, edges.controls.every((right) => right <= edges.bar + 1), JSON.stringify(edges))
    }
  }
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
