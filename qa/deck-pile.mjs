// A deck is a square pile: no edges for 1 card, 1 for 2, 2 for 4, up to 5; one card proud above it
// when some are due; pointed at, the top card lifts 2px and the tile's own box does not move. The same
// on Review › Decks and in All cards' pockets. Then "Move to the Bin" from a right-click crumples the
// row into a ball that is tossed at the sidebar's Bin, and Restore on the Bin page un-crumples it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/deck-pile.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const c = await sandbox({ width: 1280, height: 860 })
const { h } = c
const waitFor = async (test, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (sel) => h.evaluate((sel) => !!document.querySelector(sel), sel)
const record = (sel) => h.evaluate((sel) => { window.__seen = []; const end = performance.now() + 2500; const tick = () => { const one = document.querySelector(sel); window.__seen.push(one ? (() => { const r = one.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}` })() : null); if (performance.now() < end) requestAnimationFrame(tick) }; requestAnimationFrame(tick) }, sel)
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
  check('Decks: a card stands proud exactly when some are due', Object.values(seen).every((one) => one.proud === (one.due && one !== seen.pileone)), JSON.stringify(seen))
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
  // All cards: the same pile.
  await h.evaluate(() => { localStorage.setItem('view:cards', JSON.stringify({ sort: 'due', group: 'none', filter: {}, density: 'small' })) })
  await h.reload()
  await h.waitForLoadState('domcontentloaded')
  await c.go('review')
  await waitFor(() => has('[data-review-tab]'))
  await h.evaluate(() => document.querySelector('[data-review-tab="cards"]')?.click())
  await waitFor(() => has('[data-pocket="#pilemany"]'))
  await h.waitForTimeout(400)
  const pockets = await h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-pocket^="#pile"]')].map((one) => [one.getAttribute('data-pocket'), one.querySelectorAll(':scope > [data-pile-edge]').length])))
  check('All cards: the same piles (0, 1, 2, 3, 5 edges)', pockets['#pileone'] === 0 && pockets['#piletwo'] === 1 && pockets['#pilefour'] === 2 && pockets['#pileeight'] === 3 && pockets['#pilemany'] === 5, JSON.stringify(pockets))
  if (shots) await h.screenshot({ path: join(shots, 'pile-cards-light.png') })
  // Move to the Bin from a right-click: the row crumples and goes at the sidebar's Bin.
  await c.go('articles')
  await h.waitForTimeout(1500)
  const rowEl = h.locator('[data-id]').first()
  const id = await rowEl.getAttribute('data-id')
  await rowEl.click({ button: 'right' })
  await h.waitForTimeout(500)
  await record('[data-crumple="bin"]')
  await h.getByRole('menuitem', { name: /^Move to the Bin/ }).first().click()
  for (let n = 0; n < 12; n++) { if (shots) await h.screenshot({ path: join(shots, `crumple-${String(n).padStart(2, '0')}.png`) }); await h.waitForTimeout(50) }
  await h.waitForTimeout(1200)
  const all = await recorded()
  const balls = all.slice(all.findIndex(Boolean))
  const bin = await h.evaluate(() => { const r = document.querySelector('[data-side-row][aria-label="Bin"]')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width } : null })
  const flying = balls.filter(Boolean)
  check('Move to the Bin: the row is crumpled (shrinks to a ball)', flying.length >= 4 && Number(flying.at(-1).split(',')[2]) < Number(flying[0].split(',')[2]), balls.join(' | '))
  // The Bin row in sight: the ball goes left to it. Scrolled out of the sidebar: it drops off the window's foot.
  const binSeen = !!bin && bin.y < 860
  const [x0, y0] = flying[0]?.split(',').map(Number) ?? []
  const [x1, y1] = flying.at(-1)?.split(',').map(Number) ?? []
  check(`...and it is tossed ${binSeen ? 'toward the sidebar\'s Bin' : 'off the window\'s foot (the Bin is scrolled out of sight)'}, then gone`, !balls.at(-1) && flying.length > 0 && (binSeen ? x1 < x0 : y1 > y0), `${JSON.stringify(bin)} ${balls.join(' | ')}`)
  check('Nothing is left on the page once it has landed', await h.evaluate(() => !document.querySelector('[data-crumple]')))
  // Restore on the Bin page: the row un-crumples where it was.
  await c.go('discarded')
  await waitFor(() => has(`[data-bin-row][data-id="${id}"]`))
  await h.waitForTimeout(600)
  await h.locator(`[data-bin-row][data-id="${id}"]`).click({ button: 'right' })
  await h.waitForTimeout(500)
  await record('[data-crumple="back"]')
  await h.getByRole('menuitem', { name: /^Restore/ }).first().click()
  for (let n = 0; n < 8; n++) { if (shots) await h.screenshot({ path: join(shots, `uncrumple-${n}.png`) }); await h.waitForTimeout(50) }
  await h.waitForTimeout(1500)
  const got = await recorded()
  const back = got.slice(got.findIndex(Boolean)).map((one) => one && Number(one.split(',')[2]))
  const grow = back.filter(Boolean)
  check('Restore: the row un-crumples from a ball to flat, then goes', grow.length >= 2 && grow.at(-1) > grow[0] && !back.at(-1), back.join(' '))
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
