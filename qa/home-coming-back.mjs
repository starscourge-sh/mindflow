// Home's "Coming back": one feature card held still on the left, numbered
// square tiles sliding beside it; "From this week"'s Show all lands on the
// Week's page at "Caught this week". Off screen, in a throwaway book.
//
//   npx electron-vite build --outDir out-x
//   QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=… node qa/home-coming-back.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(`${SHOTS}/frames`, { recursive: true })
const EMPTY = !!process.env.EMPTY
if (!EMPTY) process.env.QA_ARGS ??= '--sandbox'
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-coming-'))
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))

const c = await sandbox({ width: 1280, height: 900, seeded: !EMPTY })
const { h, v } = c
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await h.reload()
  await h.waitForTimeout(1500)
  await v('settings:set', { motion: false, safeMode: false, quietStart: '03:00', quietEnd: '03:01' })
  const data = await v('home')
  console.log(`edited ${data.edited.length}, returning ${data.returning.length}, due ${data.due.length}, unseen ${data.unseen.length}, week ${data.week.length}`)
  await c.go('home')
  await h.waitForTimeout(1500)
  const feature = h.locator('[data-coming-feature]')
  if (EMPTY) {
    check('an empty book shows no Coming back and no errors', (await feature.count()) === 0 && c.errors.length === 0, c.errors.join(' | '))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/empty.png` })
    throw 'done'
  }
  check('Coming back has its feature card', (await feature.count()) === 1)
  const toRow = () => h.evaluate(() => document.querySelector('[data-coming-feature]')?.closest('section')?.scrollIntoView({ block: 'center' }))
  await toRow()
  await h.waitForTimeout(500)
  if (SHOTS) await c.both(`${SHOTS}/wide`)
  // The feature stays put while the tiles slide.
  const scroller = h.locator('section:has([data-coming-feature]) .overflow-x-auto').first()
  const before = await feature.boundingBox()
    for (let n = 0; n < 12; n++) {
    await scroller.evaluate((box) => box.scrollBy({ left: 60 }))
    await h.waitForTimeout(50)
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/frames/scroll-${String(n).padStart(2, '0')}.png` })
  }
  const after = await feature.boundingBox()
  const slid = await scroller.evaluate((box) => box.scrollLeft)
  check('the tiles slide and the feature card stays put', slid > 0 && before && after && before.x === after.x, `slid ${slid}px, feature x ${before?.x} then ${after?.x}`)
  const more = h.locator('section:has([data-coming-feature]) button:has(svg)').filter({ hasNot: h.locator('[data-coming-feature] *') })
  const arrow = h.locator('section:has([data-coming-feature]) h2 ~ span button').first()
  if (await arrow.count()) {
    await arrow.click({ force: true })
    for (let n = 0; n < 8; n++) { await h.waitForTimeout(50); if (SHOTS) await h.screenshot({ path: `${SHOTS}/frames/arrow-${n}.png` }) }
  }
  void more
  // A tile's Read button comes in on hover: frames every 25ms, to see it arrive rather than pop.
  const tile = h.locator('.group\\/card:has(button[data-nav])').filter({ hasNot: h.locator('[data-coming-feature]') }).nth(1)
  await tile.scrollIntoViewIfNeeded()
  await tile.hover({ force: true })
  for (let n = 0; n < 14; n++) { await h.waitForTimeout(25); if (SHOTS) await tile.screenshot({ path: `${SHOTS}/frames/tilehover-${String(n).padStart(2, '0')}.png` }) }
  await feature.hover({ force: true })
  for (let n = 0; n < 4; n++) { await h.waitForTimeout(50); if (SHOTS) await h.screenshot({ path: `${SHOTS}/frames/hover-${n}.png` }) }
  await feature.locator('button[data-nav]').click({ force: true })
  for (let n = 0; n < 10; n++) { await h.waitForTimeout(50); if (SHOTS) await h.screenshot({ path: `${SHOTS}/frames/open-${n}.png` }) }
  // Narrow: the feature on top, the tiles under it.
  await c.go('home')
  await c.size(620, 900)
  await h.waitForTimeout(800)
  await toRow()
  await h.waitForTimeout(400)
  if (SHOTS) await c.both(`${SHOTS}/narrow`)
  await c.size(1280, 900)
  // Break it: a 200 character title on the feature that is actually drawn (data-drag-open), not home.due[0]
  // which may be a different card (memory / letter / another due).
  const open = await feature.locator('[data-drag-open]').getAttribute('data-drag-open')
  const lead = open?.includes(':') ? { type: open.slice(0, open.indexOf(':')), id: open.slice(open.indexOf(':') + 1) } : null
  if (lead?.id) {
    const long = 'A very long title that keeps going '.repeat(6).slice(0, 200)
    await h.evaluate(([id, title, type]) => type === 'capture' ? window.api.captures.update?.(id, { label: title }) : window.api.haligtree('item:save', id, { title }), [lead.id, long, lead.type]).catch(() => {})
    await c.go('home')
    await h.waitForTimeout(1200)
    await toRow()
    await h.waitForTimeout(400)
    const lines = await feature.locator('.text-heading').evaluate((one) => Math.round(one.getBoundingClientRect().height / parseFloat(getComputedStyle(one).lineHeight)))
    const text = await feature.locator('.text-heading').textContent()
    check('a 200 character title is held to 3 lines', (text?.length ?? 0) >= 150 && lines >= 1 && lines <= 3, `${lines} lines, ${text?.length ?? 0} chars`)
    if (SHOTS) await c.both(`${SHOTS}/long-title`)
  }
  // From this week's Show all: the Week's page, at "Caught this week".
  if (data.week.length) {
    await c.go('home')
    await h.waitForTimeout(1000)
    await h.evaluate(() => [...document.querySelectorAll('h2')].find((one) => one.textContent === 'From this week')?.scrollIntoView({ block: 'center' }))
    await h.locator('section:has(h2:text-is("From this week")) button:text-is("Show all")').click({ force: true })
    await h.waitForTimeout(2200)
    const box = await h.locator('[data-week-caught]').boundingBox()
    check('Show all lands on the Week\'s page at "Caught this week"', box && box.y >= 0 && box.y < 900, `top at ${box?.y}`)
    const cards = await h.locator('[data-week-caught] [data-nav]').count()
    check('the Week\'s page shows the same notes as the row', cards === data.week.length, `${cards} of ${data.week.length}`)
    if (SHOTS) await c.both(`${SHOTS}/week-caught`)
  }
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  if (error !== 'done') throw error
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(failed ? `${failed} FAILED` : `all ${results.length} passed`)
process.exit(failed ? 1 : 0)
