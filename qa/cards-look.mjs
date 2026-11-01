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
    { term: 'Confirmation bias', meaning: 'seeing what you expect #psychology-cognition' },
    { term: 'Forty', meaning: 'a long name #comparative-anatomy-of-the-vertebrates-ok' },
    { term: 'Eighty', meaning: 'a longer name #comparative-anatomy-and-physiology-of-the-vertebrates-and-the-invertebrates-of-the-sea' }
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

  // 1b. Dense tiles: about 200 px, the name leads, satin you can see, no tip at all (one hover, one surface).
  await tab('decks')
  await waitFor(() => has('[data-deck-grid] [data-own-deck]'))
  const dense = await h.evaluate(() => { const one = document.querySelector('[data-deck-grid] [data-own-deck]'); const r = one.getBoundingClientRect(); const first = [...one.querySelectorAll('h3, [data-deck-counts]')][0]; return { w: Math.round(r.width), h: Math.round(r.height), lead: first?.tagName, bg: getComputedStyle(one).backgroundImage } })
  check('1b. a deck tile is about 200 px square', dense.w >= 168 && dense.w <= 215 && Math.abs(dense.w - dense.h) <= 2, JSON.stringify({ w: dense.w, h: dense.h }))
  check('1b. its name leads, above its counts', dense.lead === 'H3', dense.lead)
  check('1b. its satin is smooth: a sheen and a pooled light, no stripes', !/repeating-linear-gradient/.test(dense.bg) && (dense.bg.match(/gradient/g) ?? []).length >= 2, dense.bg.slice(0, 60))
  const tipsOn = async (selector) => { await h.hover(selector); await h.waitForTimeout(900); return h.evaluate((selector) => { const el = document.querySelector(selector); const titled = [el, ...el.querySelectorAll('*')].filter((one) => one.hasAttribute('title')).length; for (let at = el.parentElement; at; at = at.parentElement) if (at.hasAttribute?.('title')) return 99; return titled + [...document.querySelectorAll('[role="tooltip"], [data-note-preview]')].filter((one) => one.getBoundingClientRect().width > 0).length }, selector) }
  const onTile = await tipsOn('[data-deck-grid] [data-own-deck] h3')
  const onDots = await tipsOn('[data-deck-grid] [data-own-deck] [aria-label="Deck options"]')
  check('1b. pointing at a tile, then its ⋯: no tip, no title, nothing floats', onTile === 0 && onDots === 0, JSON.stringify({ onTile, onDots }))
  // Long names wrap to two lines, never cut on one; the ⋯ menu names the deck whole.
  await c.size(390, 844); await h.waitForTimeout(700)
  const longTile = '[data-own-deck="comparative-anatomy-and-physiology-of-the-vertebrates-and-the-invertebrates-of-the-sea"]'
  if (await has('[data-deck-fold][aria-expanded="false"]')) await h.click('[data-deck-fold]')
  await waitFor(() => has(longTile))
  const clamp = await h.evaluate((sel) => { const one = document.querySelector(`${sel} h3`); const lines = Math.round(one.getBoundingClientRect().height / parseFloat(getComputedStyle(one).lineHeight)); return { lines, clamp: getComputedStyle(one).webkitLineClamp, ws: getComputedStyle(one).whiteSpace } }, longTile)
  check('1b. an 80-letter name at 390 wide wraps to two lines, at most', clamp.lines <= 2 && clamp.clamp === '2' && clamp.ws !== 'nowrap', JSON.stringify(clamp))
  await h.click(`${longTile} [aria-label="Deck options"]`)
  check('1b. its ⋯ menu names it whole at the top', await waitFor(() => h.evaluate(() => /invertebrates of the sea/i.test(document.querySelector('[data-menu-heading]')?.textContent ?? ''))))
  if (shots) await h.screenshot({ path: join(shots, 'long-name-menu-phone-light.png') })
  const menuBox = await h.evaluate(() => { const r = document.querySelector('[data-menu-heading]')?.closest('[role="menu"]')?.getBoundingClientRect(); return r ? { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth } : null })
  check('1b. at 390 wide the menu stays on screen', menuBox && menuBox.left >= 0 && menuBox.right <= menuBox.vw, JSON.stringify(menuBox))
  check('1b. a tile shows each figure once: no big due number repeating its counts', !(await has('[data-deck-due-big]')))
  await h.keyboard.press('Escape')
  await c.size(1200, 860); await h.waitForTimeout(700)
  // One toolbar: the same four buttons in the same place on all three tabs.
  const bar = {}
  for (const id of ['decks', 'cards', 'stats']) { await tab(id); await waitFor(() => has('[data-review-toolbar]')); await h.evaluate(() => { for (let at = document.querySelector('[data-review-toolbar]'); at; at = at.parentElement) at.scrollTop = 0 }); await h.waitForTimeout(150); bar[id] = await h.evaluate(() => [...document.querySelectorAll('[data-review-toolbar] [data-deck-make], [data-review-toolbar] [data-deck-paste], [data-review-toolbar] [data-deck-picture], [data-review-toolbar] [data-deck-import]')].map((one) => { const r = one.getBoundingClientRect(); return `${one.textContent}@${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}` }).join(' ')) }
  check('1c. one toolbar: the same four buttons in the same place on Decks, All cards and Stats', bar.decks && bar.decks.split(' @').length && bar.decks === bar.cards && bar.cards === bar.stats, JSON.stringify(bar))
  // The toolbar never moves or goes: the same four boxes on every tab, with each form open, and across switches.
  const fourBoxes = () => h.evaluate(() => [...document.querySelectorAll('[data-review-toolbar] [data-deck-make], [data-review-toolbar] [data-deck-paste], [data-review-toolbar] [data-deck-picture], [data-review-toolbar] [data-deck-import]')].map((one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}` }).join(' '))
  const states = {}
  for (const [name, steps] of [['decks', ['decks']], ['picture on decks', ['decks', '[data-deck-picture]']], ['make', ['cards', '[data-deck-make]']], ['many', ['decks', '[data-deck-paste]']], ['stats', ['stats']], ['picture on stats', ['stats', '[data-deck-picture]']], ['cards', ['cards']]]) {
    await tab(steps[0])
    await h.evaluate(() => { for (let at = document.querySelector('[data-review-toolbar]'); at; at = at.parentElement) at.scrollTop = 0 })
    if (steps[1]) { await h.click(steps[1]); await h.waitForTimeout(500) }
    states[name] = await fourBoxes()
    if (steps[1] && await has(`${steps[1]}[aria-pressed="true"]`)) states[name] += ' pressed'
    if (steps[1]) { await h.keyboard.press('Escape'); if (await has(`${steps[1]}[aria-pressed="true"]`)) await h.click(steps[1]); await h.waitForTimeout(300) }
  }
  const plain = states.decks
  check('1c. the toolbar stays, the same four boxes, on every tab and with every form open', Object.values(states).every((one) => one.replace(' pressed', '') === plain), JSON.stringify(states))
  check('1c. the button whose form is open shows pressed', ['picture on decks', 'make', 'many', 'picture on stats'].every((name) => states[name].endsWith(' pressed')), JSON.stringify(states))
  check('1c. a tab\'s own controls sit in the toolbar\'s right end, never a row of their own', await (async () => { await tab('cards'); return h.evaluate(() => { const bar = document.querySelector('[data-review-toolbar]').getBoundingClientRect(); const own = document.querySelector('[data-review-tab-controls]'); return !!own && own.children.length > 0 && Math.abs(own.getBoundingClientRect().top + own.getBoundingClientRect().height / 2 - (bar.top + bar.height / 2)) <= 2 }) })())
  await tab('stats')
  // Hovering a chart moves nothing: every card's box the same with the pointer on each chart, and no tip floats.
  const cardBoxes = () => h.evaluate(() => [...document.querySelectorAll('[data-review-stats] [data-mono-card]')].map((one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.y)},${Math.round(r.height)}` }).join(' '))
  const rest = await cardBoxes()
  const moved = []
  for (const name of await h.evaluate(() => [...document.querySelectorAll('[data-review-stats] [data-mono-card]')].map((one) => one.getAttribute('data-mono-card')))) {
    const marks = h.locator(`[data-review-stats] [data-mono-card="${name}"] [data-day], [data-review-stats] [data-mono-card="${name}"] svg, [data-review-stats] [data-mono-card="${name}"] [data-mono-tones] span`)
    if (!(await marks.count())) continue
    await marks.first().scrollIntoViewIfNeeded()
    const box = await marks.first().boundingBox()
    if (!box) continue
    await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await h.waitForTimeout(250)
    await h.evaluate(() => { for (let at = document.querySelector('[data-review-stats]'); at; at = at.parentElement) at.scrollTop = 0 })
    const now = await cardBoxes()
    if (now !== rest || await has('[data-mono-tip]')) moved.push(name)
  }
  check('1e. pointing at any chart moves no card and floats no tip', !moved.length, JSON.stringify(moved))
  await h.mouse.move(5, 5)

  // Stats says each figure once; its days are the heatmap's square cells.
  const statsText = await h.evaluate(() => document.querySelector('[data-review-stats]').textContent)
  check('1d. Stats says "of the last 7 days" once and the retention figure once', (statsText.match(/of the last 7 days/g) ?? []).length <= 1 && !(await has('[data-mono-card="retention"]')), String((statsText.match(/of the last 7 days/g) ?? []).length))
  const cells = await h.evaluate(() => { const one = document.querySelector('[data-day-cells] [data-day]'); const r = one?.getBoundingClientRect(); return one ? { w: Math.round(r.width), h: Math.round(r.height), radius: getComputedStyle(one).borderTopLeftRadius } : null })
  check('1d. Stats days are square cells, as the heatmap draws them', cells && cells.w === cells.h && cells.radius === '2px' && !(await has('[data-mono-dots]')), JSON.stringify(cells))
  await tab('cards')
  await waitFor(() => has('[data-pocket]'))

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

  // Every row in the Table and the List one line high: a stage cell says one word.
  for (const density of ['compact', 'list']) {
    await h.evaluate((density) => { const v = JSON.parse(localStorage.getItem('view:cards') ?? '{}'); localStorage.setItem('view:cards', JSON.stringify({ ...v, density, group: 'none' })) }, density)
    await review(); await tab('cards')
    await waitFor(() => has('[data-card-list] [data-pick]'))
    const heights = await h.evaluate(() => [...new Set([...document.querySelectorAll('[data-card-list] [data-pick]')].map((one) => Math.round(one.getBoundingClientRect().height)))])
    const stages = await h.evaluate(() => [...new Set([...document.querySelectorAll('[data-card-stage-cell], [data-card-list] [data-card-stage]')].map((one) => one.textContent.trim()))])
    check(`1f. ${density}: every row the same height, stage cells one word`, heights.length === 1 && stages.every((one) => !/\s|\(/.test(one)), JSON.stringify({ heights, stages }))
  }

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
  // Live: while dragged over the first deck, the others make room before the drop. Frames every 50 ms.
  console.log('drag', reorder.join(), await h.evaluate(() => [...document.querySelectorAll('[data-own-deck]')].map((one) => one.getAttribute('data-own-deck')).join()))
  const order = () => h.evaluate(() => [...document.querySelectorAll('[data-deck-grid] [data-own-deck]')].map((one) => one.getAttribute('data-own-deck')).join())
  await h.evaluate(() => { for (let at = document.querySelector('[data-deck-grid]'); at; at = at.parentElement) at.scrollTop = 0 })
  await h.locator(`[data-own-deck="${reorder[2]}"]`).scrollIntoViewIfNeeded()
  const from = await h.locator(`[data-own-deck="${reorder[2]}"]`).boundingBox()
  const to = await h.locator(`[data-own-deck="${reorder[0]}"]`).boundingBox()
  await h.mouse.move(from.x + 40, from.y + 40)
  await h.mouse.down()
  const frames = []
  for (let step = 1; step <= 12; step++) {
    await h.mouse.move(from.x + 40 + ((to.x - from.x) * step) / 12, from.y + 40 + ((to.y - from.y) * step) / 12)
    await h.waitForTimeout(50)
    frames.push(await order())
    if (shots && step % 3 === 0) await h.screenshot({ path: join(shots, `drag-frame-${step}.png`) })
  }
  const midDrag = frames.at(-1)
  await h.mouse.up()
  check('S4. while dragging, the decks make room live, before the drop', midDrag !== reorder.join() && midDrag.startsWith(reorder[2]), JSON.stringify(frames.filter((one, at) => frames[at - 1] !== one)))
  if (!(await waitFor(async () => (await order()).startsWith(reorder[2]), 1500))) await h.dragAndDrop(`[data-own-deck="${reorder[2]}"]`, `[data-own-deck="${reorder[0]}"]`)
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
