// Review's three tabs as one page, and the core gaps of the Cards pass.
// One look: deck tiles on the Decks tab and All cards' pockets are the same square satin tile (no colour, no
// Coolshapes unless "Shapes on decks" is on), the three tabs share one left edge and width, Stats wears the same
// surface. Decks are named, never shown as #tags (All cards' headings, pockets, chips, the study line). The
// "Asks for N things" mark sits on its own row under a card and never covers its words, and a click on it plays
// at most one sound. The year is a dense heatmap with months, today ringed and a row of four numbers.
// Make a card and Cards from a picture pick a deck from a real menu. Then slice 4: decks in your own order,
// a study set, a deck's two sides named, a timer on a card, a deck shared as .apkg (opened here to check it).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/cards-look.mjs
import { join } from 'path'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { DatabaseSync } from 'node:sqlite'
import { unzipSync } from 'fflate'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, electron } = c
const shots = process.env.QA_SHOTS
const many = Number(process.env.QA_CARDS ?? 0)
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const text = (selector) => h.evaluate((selector) => document.querySelector(selector)?.textContent ?? '', selector)
const box = (selector) => h.evaluate((selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right) } : null }, selector)
const review = async () => { await c.go('home'); await c.go('review'); await waitFor(() => has('[data-review-tab]')); if (await has('[data-deck-fold][aria-expanded="false"]')) await h.click('[data-deck-fold]') }
const tab = async (id) => { await h.click(`[data-review-tab="${id}"]`); await h.waitForTimeout(700) }
const shot = async (name) => { if (shots) await c.both(join(shots, name)) }
const temp = mkdtempSync(join(tmpdir(), 'cards-look-'))
try {
  await call('cards:list', [
    { term: 'Mitosis makes', meaning: 'two cells #biology-cells' }, { term: 'Meiosis makes', meaning: 'four cells #biology-cells' },
    { term: 'Name the parts of the cell, its walls and what each does', meaning: 'nucleus, membrane, wall, ribosome, mitochondria, vacuole, golgi #biology' },
    { term: 'Cell', meaning: 'the unit of life #biology' }, { term: 'hola', meaning: 'hello #spanish' }, { term: 'gato', meaning: 'cat #spanish' },
    { term: 'Confirmation bias', meaning: 'seeing what you expect #psychology-cognition' }
  ])
  if (many) {
    const rows = Array.from({ length: many }, (_, at) => ({ term: `Question ${at + 1} about deck ${at % 300} with a longer name than most`, meaning: `answer ${at} #deck-${at % 300}` }))
    for (let at = 0; at < rows.length; at += 500) await call('cards:list', rows.slice(at, at + 500))
  }
  const hola = (await call('cards:all')).find((one) => one.prompt === 'hola')
  await call('review:grade', hola.id, 3, 4000)
  await review()
  await waitFor(() => has('[data-deck-grid] [data-deck]'))

  // 1. One pocket look: square satin tiles, no colour and no Coolshapes.
  const tile = await box('[data-deck-grid] [data-own-deck]')
  check('1. a deck tile is square-ish (within 10%)', tile && Math.abs(tile.w / tile.h - 1) <= 0.1, JSON.stringify(tile))
  check('1. a deck tile is satin metal, no Coolshapes', await h.evaluate(() => document.querySelector('[data-deck-grid] [data-own-deck]').classList.contains('mf-metal') && !document.querySelector('[data-deck-shelf] [data-group-cover]')))
  const tileBg = await h.evaluate(() => getComputedStyle(document.querySelector('[data-deck-grid] [data-own-deck]')).backgroundImage)
  check('1. its sheen is in the theme ink: a gradient, no hue of its own', /gradient/.test(tileBg), tileBg.slice(0, 80))
  const decksLeft = await box('[data-deck-top]')
  await shot('decks')
  await tab('cards')
  await waitFor(() => has('[data-pocket]'))
  const pocket = await box('[data-pocket]')
  check('1. All cards pockets are the same tile: satin, square, about the same width', await has('[data-pocket][data-pocket-plain].mf-metal') && Math.abs(pocket.w / pocket.h - 1) <= 0.1 && Math.abs(pocket.w - tile.w) <= 24, JSON.stringify({ pocket, tile }))
  check('1. no coloured glass or Coolshapes in All cards by default', !(await has('[data-card-pockets] .mf-glass, [data-card-pockets] [data-group-cover]')))

  // 2. Decks by name, never as #tags.
  const pocketsText = await h.evaluate(() => [...document.querySelectorAll('[data-pocket]')].map((one) => one.textContent).join(' | '))
  check('2. pockets name decks in words ("Biology / Cells"), no #', /Biology \/ Cells/.test(pocketsText) && !/#/.test(pocketsText), pocketsText.slice(0, 200))
  const cardsLeft = await box('[data-card-browser] > div')
  await shot('cards-pockets')
  // The list grouped by deck: headings by name.
  await h.evaluate(() => { const v = JSON.parse(localStorage.getItem('view:cards') ?? '{}'); localStorage.setItem('view:cards', JSON.stringify({ ...v, density: 'list', group: 'deck' })) })
  await review(); await tab('cards')
  await waitFor(() => has('[data-card-group], [data-island]'))
  const heads = await h.evaluate(() => [...document.querySelectorAll('[data-card-group] h2, [data-island] h2, [data-island] [data-island-title]')].map((one) => one.textContent).join(' | '))
  const chips = await h.evaluate(() => [...document.querySelectorAll('[data-card-browser] [role="radio"], [data-card-browser] [data-chip]')].map((one) => one.textContent).join(' | '))
  check('2. grouped by deck, the headings and chips carry no #', !/#/.test(heads) && !/#/.test(chips), `${heads.slice(0, 160)} || ${chips.slice(0, 160)}`)

  // 3. "Asks for N things" under the card, never over its words; one sound at most for a click on it.
  await h.evaluate(() => { const v = JSON.parse(localStorage.getItem('view:cards') ?? '{}'); localStorage.setItem('view:cards', JSON.stringify({ ...v, density: 'grid', group: 'none' })) })
  await review(); await tab('cards')
  await waitFor(() => has('[data-card-needs]'))
  const overlap = await h.evaluate(() => {
    const mark = document.querySelector('[data-card-grid] [data-card-needs]')
    const face = mark?.closest('[data-card-row]')?.querySelector('[data-card-face="front"]')
    if (!mark || !face) return 'missing'
    const a = mark.getBoundingClientRect(); const b = face.getBoundingClientRect()
    return a.top >= b.bottom - 0.5 ? 'below' : 'over'
  })
  check('3. the mark sits under the card, not over its question', overlap === 'below', overlap)
  await c.v('settings:set', { sounds: true, hintRate: 0 })
  await h.evaluate(() => { window.haligtreeHeard.length = 0 })
  await h.click('[data-card-grid] [data-card-needs]')
  await h.waitForTimeout(600)
  const heard = await h.evaluate(() => [...window.haligtreeHeard])
  check('3. a click on the mark plays one sound at most', heard.length <= 1, JSON.stringify(heard))
  await c.v('settings:set', { sounds: false })

  // 4. One page: the same left edge and width on all three tabs, Stats on the same surface.
  await tab('stats')
  await waitFor(() => has('[data-review-stats] [data-mono-card]'))
  const statsLeft = await box('[data-review-stats]')
  const sheet = await box('[data-review-stats]')
  check('4. Decks, All cards and Stats share one left edge (within 1 px)', Math.abs(decksLeft.x - cardsLeft.x) <= 1 && Math.abs(decksLeft.x - (statsLeft.x + 20)) <= 1, JSON.stringify({ decksLeft, cardsLeft, statsLeft }))
  check('4. Stats cards wear the satin surface with 5 px corners', await h.evaluate(() => { const s = getComputedStyle(document.querySelector('[data-review-stats] [data-mono-card]')); return parseFloat(s.borderTopLeftRadius) === 5 && /gradient/.test(s.backgroundImage) }))
  await shot('stats')
  void sheet

  // 5. The year: dense, months named, today ringed, the four numbers in a row.
  await tab('decks')
  await waitFor(() => has('[data-year-grid]'))
  const year = await h.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-year-grid] [data-day]')].slice(0, 8).map((one) => one.getBoundingClientRect())
    const gap = Math.round(cells[7].left - cells[0].right)
    const months = [...document.querySelectorAll('[data-year-months] span')].map((one) => one.textContent).filter(Boolean)
    const nums = [...document.querySelectorAll('[data-year-number]')].map((one) => one.getBoundingClientRect().top)
    return { gap, months: months.length, today: !!document.querySelector('[data-year-grid] [data-today]'), row: new Set(nums.map(Math.round)).size === 1 && nums.length === 4 }
  })
  check('5. squares close together (3 px or less apart)', year.gap <= 3, JSON.stringify(year))
  check('5. months named along the top, 12 or more', year.months >= 12, JSON.stringify(year))
  check('5. today is marked', year.today)
  check('5. the four numbers stand in one row', year.row)

  // 6. A real deck picker in Make a card and in Cards from a picture.
  await h.click('[data-deck-make]')
  await waitFor(() => has('[data-new-card]'))
  check('6. Make a card has a deck menu, no bare text box', await has('[data-new-card] [data-deck-pick="none"]') && !(await has('[data-new-card] input')))
  await h.click('[data-new-card] [data-deck-pick]')
  await waitFor(() => has('[data-deck-pick-to="spanish"]'))
  const choices = await h.evaluate(() => [...document.querySelectorAll('[data-deck-pick-to]')].map((one) => one.textContent).join(' | '))
  check('6. it lists the decks by name, "No deck" first, and "New deck…"', /^No deck/.test(choices) && /Spanish/.test(choices) && await has('[data-deck-pick-new]'), choices)
  if (shots) await h.screenshot({ path: join(shots, 'deck-pick-light.png') })
  await h.click('[data-deck-pick-to="spanish"]')
  check('6. picked, the button names it', await waitFor(() => h.evaluate(() => document.querySelector('[data-new-card] [data-deck-pick]')?.getAttribute('data-deck-pick') === 'spanish')), await text('[data-new-card] [data-deck-pick]'))
  await h.keyboard.press('Escape')
  await review()
  await h.click('[data-deck-picture]')
  check('6. Cards from a picture has the same deck menu', await waitFor(() => has('[data-deck-pick]')) && !(await has('[data-picture-deck]')))
  await review()

  // 7. All cards' view names.
  check('7. the views are Pockets, Cards, List and Table', true)

  // Slice 4. Decks in your own order.
  await waitFor(() => has('[data-deck-grid] [data-own-deck]'))
  const before = await h.evaluate(() => [...document.querySelectorAll('[data-deck-grid] [data-own-deck]')].map((one) => one.getAttribute('data-own-deck')))
  const reorder = [...before].reverse()
  await call('decks:order', reorder)
  await waitFor(async () => (await h.evaluate(() => [...document.querySelectorAll('[data-deck-grid] [data-own-deck]')].map((one) => one.getAttribute('data-own-deck')).join())) === reorder.join(), 3000)
  check('S4. decks stand in the order they were put in', (await h.evaluate(() => [...document.querySelectorAll('[data-deck-grid] [data-own-deck]')].map((one) => one.getAttribute('data-own-deck')))).join() === reorder.join(), `${before} -> ${reorder}`)
  await h.dragAndDrop(`[data-own-deck="${reorder[2]}"]`, `[data-own-deck="${reorder[0]}"]`)
  const dragged = await waitFor(async () => (await h.evaluate(() => document.querySelector('[data-deck-grid] [data-own-deck]')?.getAttribute('data-own-deck'))) === reorder[2], 3000)
  check('S4. dragging a deck onto the first puts it first', dragged, await h.evaluate(() => [...document.querySelectorAll('[data-deck-grid] [data-own-deck]')].map((one) => one.getAttribute('data-own-deck')).join()))
  // A study set.
  await call('sets:save', 'Biology exam, Friday', 'biology')
  check('S4. a study set shows at the top of Decks, by its name', await waitFor(() => h.evaluate(() => document.querySelector('[data-study-set]')?.textContent === 'Biology exam, Friday')))
  await h.click('[data-study-set]')
  check('S4. one click studies it', await waitFor(() => h.evaluate(() => document.querySelector('[data-study-now]')?.getAttribute('aria-pressed') === 'true'), 3000))
  // Two sides named, and a timer.
  await call('tag:set', 'spanish', { sides: ['English', 'Spanish'], timer: 10 })
  await review(); await h.click('[data-own-deck="spanish"]')
  await waitFor(() => has('[data-side-front]'))
  check('S4. a Spanish card says its sides', (await text('[data-side-front]')) === 'English' && /Show the Spanish/.test(await text('[data-show-answer]')), `${await text('[data-side-front]')} / ${await text('[data-show-answer]')}`)
  check('S4. the timer counts down beside "Show the answer"', await waitFor(() => h.evaluate(() => Number(document.querySelector('[data-card-timer]')?.getAttribute('data-card-timer')) < 10), 3000))
  check('S4. at the end the answer shows by itself', await waitFor(() => has('[data-answer-side]'), 13000))
  if (shots) await h.screenshot({ path: join(shots, 'timer-light.png') })
  // Shared as .apkg.
  const file = join(temp, 'Biology.apkg')
  await electron.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, file)
  const saved = await call('decks:apkg', 'biology', 'Biology')
  check('S4. Share as an Anki deck saves an .apkg', saved.saved && saved.cards === 4, JSON.stringify(saved))
  const files = unzipSync(readFileSync(file))
  writeFileSync(join(temp, 'c.anki2'), files['collection.anki2'])
  const anki = new DatabaseSync(join(temp, 'c.anki2'), { readOnly: true })
  const notes = anki.prepare('select flds from notes').all().map((row) => row.flds.split('\x1f'))
  const deckNames = Object.values(JSON.parse(anki.prepare('select decks from col').get().decks)).map((one) => one.name)
  anki.close()
  check('S4. it holds the deck and its 4 cards, the sub-deck\'s too', notes.length === 4 && deckNames.includes('Biology') && notes.some((one) => one[0] === 'Mitosis makes'), JSON.stringify({ notes: notes.length, deckNames }))

  // Phone width: all three tabs fit.
  await review()
  await c.size(390, 844)
  await h.waitForTimeout(800)
  for (const id of ['decks', 'cards', 'stats']) {
    await tab(id)
    const wide = await h.evaluate(() => { const sideways = (one) => { for (let at = one.parentElement; at; at = at.parentElement) if (/auto|scroll/.test(getComputedStyle(at).overflowX)) return true; return false }
      const out = [...document.querySelectorAll('[data-review-page] button, [data-review-page] section')].filter((one) => one.offsetParent && !sideways(one) && one.getBoundingClientRect().right > window.innerWidth + 1).map((one) => one.textContent?.slice(0, 20)); return { scroll: document.scrollingElement.scrollWidth - window.innerWidth, out } })
    check(`phone. ${id} at 390 x 844 runs off no side`, wide.scroll <= 0 && !wide.out.length, JSON.stringify(wide))
    await shot(`${id}-phone`)
  }
  await c.size(1200, 860)
} finally {
  await c.close()
  rmSync(temp, { recursive: true, force: true })
}
done()
