// A deck is a square pile: no edges for 1 card, 1 for 2, 2 for 4, up to 5; one card proud above it
// when some are due; pointed at, the top card lifts 2px and the tile's own box does not move. The same
// on Review › Decks and in All cards' pockets. Then "Move to the Bin" from a right-click shreds the
// row into strips (never a ball of paper); Restore on the Bin page draws nothing over the list as it closes up.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/deck-pile.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const c = await sandbox({ width: 1280, height: 860 })
const H = 860
const { h } = c
const waitFor = async (test, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (sel) => h.evaluate((sel) => !!document.querySelector(sel), sel)
const record = (sel) => h.evaluate((sel) => { window.__seen = []; const end = performance.now() + 5000; const tick = () => { const one = document.querySelector(sel); window.__seen.push(one ? (() => { const r = one.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}` })() : null); if (performance.now() < end) requestAnimationFrame(tick) }; requestAnimationFrame(tick) }, sel)
const recorded = () => h.evaluate(() => window.__seen)
const SIZES = { one: 1, two: 2, four: 4, eight: 8, many: 40 }
try {
  await waitFor(() => has('main'))
  const cards = Object.entries(SIZES).flatMap(([tag, n]) => Array.from({ length: n }, (_, at) => ({ term: `Pile ${tag} question ${at}?`, meaning: `Answer ${at} #pile${tag}` })))
  await call('cards:list', cards)
  for (const tag of Object.keys(SIZES)) await call('tag:set', `pile${tag}`, { deck: true })
  await c.go('review')
  await waitFor(() => has('[data-review-tab]'))
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click())
  await waitFor(() => has('[data-own-deck="pilemany"]'))
  await h.mouse.move(5, 5)
  await h.waitForTimeout(400)
  const piles = () => h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-own-deck^="pile"]')].map((one) => [one.getAttribute('data-own-deck'), { edges: one.querySelectorAll(':scope > [data-pile-edge]').length, proud: !!one.querySelector(':scope > [data-pile-proud]'), due: !!one.querySelector('[data-due-dot]') }])))
  const seen = await piles()
  check('Decks: 1 card, no edges; 2, one; 4, two; 8, three; 40, five', seen.pileone?.edges === 0 && seen.piletwo?.edges === 1 && seen.pilefour?.edges === 2 && seen.pileeight?.edges === 3 && seen.pilemany?.edges === 5, JSON.stringify(seen))
  // The sandbox's own decks have cards due (Astrophysics, Film); the piles made here have none.
  const proud = await h.evaluate(() => [...document.querySelectorAll('[data-deck-grid] [data-deck]')].map((one) => {
    const face = one.querySelector(':scope > [data-pile-top]').getBoundingClientRect()
    const card = one.querySelector(':scope > [data-pile-proud]')?.getBoundingClientRect()
    return { deck: one.getAttribute('data-deck'), due: Number(one.querySelector('[data-count-due]')?.getAttribute('data-count-due') ?? 0), up: card ? Math.round(face.top - card.top) : 0, above: Math.round(one.getBoundingClientRect().top - (card ?? face).top), tops: Math.round(face.top - one.getBoundingClientRect().top) }
  }))
  const dueDecks = proud.filter((one) => one.due > 0)
  check('Decks: a deck with cards due has a card standing 6 to 8px above its top card', dueDecks.length >= 1 && dueDecks.every((one) => one.up >= 6 && one.up <= 8), JSON.stringify(proud))
  check('...the card standing up stays inside the tile (nothing above it), and the count is said once, on the face', dueDecks.every((one) => one.above <= 0) && await h.evaluate(() => !document.querySelector('.mf-pile-tab, [data-pile-due]')), JSON.stringify(dueDecks))
  check('every top card starts the same distance down its tile, so rows line up at the top', new Set(proud.map((one) => one.tops)).size === 1, proud.map((one) => one.tops).join(' '))
  check('Decks: a deck with none due has no card standing up', Object.values(seen).every((one) => !one.proud), JSON.stringify(seen))
  // Each card behind is whole: 3px right and 4px down from the one before, its own hairline showing on the right and the bottom.
  const steps = await h.evaluate(() => { const one = document.querySelector('[data-own-deck="pilemany"]'); const face = one.querySelector(':scope > [data-pile-top]').getBoundingClientRect(); return [...one.querySelectorAll(':scope > [data-pile-edge]')].map((edge) => { const r = edge.getBoundingClientRect(); return `${Math.round(r.right - face.right)}/${Math.round(r.bottom - face.bottom)}/${getComputedStyle(edge).borderRightWidth}` }) })
  check('40 cards: five cards behind, each 3px right and 4px down of the one before, with its own hairline', steps.join(' ') === '3/4/1px 6/8/1px 9/12/1px 12/16/1px 15/20/1px', steps.join(' '))
  const sizes = await h.evaluate(() => [...document.querySelectorAll('[data-deck-grid] > *')].map((one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}` }))
  check('every tile takes the same room, whatever its pile', new Set(sizes).size === 1, sizes.join(' '))
  const face = await h.evaluate(() => { const r = document.querySelector('[data-own-deck="pileone"] [data-pile-top]').getBoundingClientRect(); return Math.abs(r.width - r.height) < 1.5 })
  check('the top card is square', face)
  check('Decks: no colour and no picture on any pile by default', await h.evaluate(() => !document.querySelector('[data-deck-grid] [data-group-cover], [data-deck-grid] img')))
  if (shots) await h.screenshot({ path: join(shots, 'pile-decks-light.png') })
  await c.look('dark')
  await h.waitForTimeout(400)
  if (shots) await h.screenshot({ path: join(shots, 'pile-decks-dark.png') })
  await c.look('light')
  // Hover: frames every 50ms, the top lifting, the tile's box still.
  const box = () => h.evaluate(() => { const r = document.querySelector('[data-own-deck="pilemany"]').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join() })
  const lift = () => h.evaluate(() => Math.round(new DOMMatrix(getComputedStyle(document.querySelector('[data-own-deck="pilemany"] [data-pile-top]')).transform).m42 * 10) / 10)
  const before = await box()
  const r = await h.evaluate(() => { const r = document.querySelector('[data-own-deck="pilemany"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await h.mouse.move(r.x, r.y)
  const frames = []
  for (let n = 0; n < 6; n++) { frames.push(await lift()); if (shots) await h.screenshot({ path: join(shots, `pile-hover-${n}.png`), clip: { x: r.x - 110, y: r.y - 110, width: 220, height: 240 } }); await h.waitForTimeout(50) }
  check('Pointed at: the top card lifts 2px, never more', frames.at(-1) === -2 && frames.every((one) => one <= 0 && one >= -2), frames.join(' '))
  check('Pointed at: the tile\'s own box does not move', (await box()) === before, `${before} / ${await box()}`)
  await h.mouse.move(5, 5)
  // All cards: never a pile, grouped by deck too; each deck a heading over its own card faces.
  await h.evaluate(() => { localStorage.setItem('view:cards', JSON.stringify({ sort: 'due', group: 'deck', filter: {}, density: 'grid' })) })
  await h.reload()
  await h.waitForLoadState('domcontentloaded')
  await c.go('review')
  await waitFor(() => has('[data-review-tab]'))
  await h.evaluate(() => document.querySelector('[data-review-tab="cards"]')?.click())
  await waitFor(() => has('[data-card-face="front"]'))
  await h.waitForTimeout(400)
  check('All cards: no pile anywhere, a heading a deck, single card faces', await h.evaluate(() => !document.querySelector('[data-card-browser] :is(.mf-pile, [data-pile-edge], [data-pocket])') && document.querySelectorAll('[data-card-list] [data-island-head]').length >= 5 && document.querySelectorAll('[data-card-list] [data-card-face="front"]').length > 0))
  if (shots) await h.screenshot({ path: join(shots, 'pile-cards-light.png') })
  // Move to the Bin from a right-click: the row goes through the shredder, never crumpled into a ball.
  await c.go('articles')
  await h.waitForTimeout(1500)
  const rowEl = h.locator('[data-id]').first()
  const id = await rowEl.getAttribute('data-id')
  const rowBox = await rowEl.boundingBox()
  await rowEl.click({ button: 'right' })
  await h.waitForTimeout(500)
  await record('[data-shred], [data-crumple]')
  const count = () => h.evaluate(() => { window.__most = 0; window.__balls = 0; const end = performance.now() + 2500; const tick = () => { window.__most = Math.max(window.__most, document.querySelectorAll('[data-shred]').length); window.__balls += document.querySelectorAll('[data-crumple]').length; if (performance.now() < end) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await count()
  await h.getByRole('menuitem', { name: /^Move to the Bin/ }).first().click()
  for (let n = 0; n < 12; n++) { if (shots) await h.screenshot({ path: join(shots, `shred-${String(n).padStart(2, '0')}.png`) }); await h.waitForTimeout(50) }
  await h.waitForTimeout(2600)
  const [most, balls] = await h.evaluate(() => [window.__most, window.__balls])
  check('Move to the Bin: the row is cut into 16 to 24 strips', most >= 16 && most <= 24, `${most} strips`)
  check('...never crumpled into a ball', balls === 0, `${balls} ball frames`)
  const all = await recorded()
  const fell = all.filter(Boolean).map((one) => Number(one.split(',')[1]))
  check('...the strips fall from where the row was', fell.length >= 4 && Math.abs(fell[0] - rowBox.y) < 20 && fell.at(-1) > fell[0], fell.join(' '))
  check('Nothing is left on the page once they have fallen', await h.evaluate(() => !document.querySelector('[data-shred], [data-crumple]')))
  // Restore on the Bin page: the shredder run backwards, its strips rising into the row where it was.
  await c.go('discarded')
  await waitFor(() => has(`[data-bin-row][data-id="${id}"]`))
  await h.waitForTimeout(600)
  await h.locator(`[data-bin-row][data-id="${id}"]`).click({ button: 'right' })
  await h.waitForTimeout(500)
  await h.evaluate(() => { window.__drawn = 0; const end = performance.now() + 2000; const tick = () => { window.__drawn += document.querySelectorAll('[data-shred], [data-crumple]').length; if (performance.now() < end) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await h.getByRole('menuitem', { name: /^Restore/ }).first().click()
  await h.waitForTimeout(2300)
  // No strips over the list as it closes up (they sat on the row below as it moved into the gap): the row simply goes back.
  check('Restore: nothing is drawn over the list as it closes up (no strips, no ball)', (await h.evaluate(() => window.__drawn)) === 0, `${await h.evaluate(() => window.__drawn)} frames with paper`)
  check('...and the row has left the Bin', !(await has(`[data-bin-row][data-id="${id}"]`)))
  check('...and nothing crumpled', await h.evaluate(() => !document.querySelector('[data-crumple]')))
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
