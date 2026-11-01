// Review's Decks page at window widths 900, 1100, 1300 and 1600, in a dark theme with a lime accent
// (Everforest) and in Paper: tiles stay square-ish, the toolbar stays one row with its right end beside
// it, the book coverage line stays inside its box, the year's four numbers are never cut, today's ring
// is drawn inside its square, and the satin has no stripes. A resize from 1600 to 900 is filmed every 50 ms.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/cards-look-widths.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h } = c
const shots = process.env.QA_SHOTS
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const look = async (theme) => { await h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme); await h.waitForTimeout(400) }
try {
  await call('cards:list', [{ term: 'Name the parts of a long deck', meaning: 'x #comparative-anatomy-and-physiology-of-the-vertebrates' }])
  await c.go('home'); await c.go('review')
  await waitFor(() => has('[data-deck-grid] [data-deck]'))
  for (const theme of ['everforest', 'paper']) {
    await look(theme)
    for (const width of [900, 1100, 1300, 1600]) {
      await c.size(width, 900)
      await h.waitForTimeout(700)
      const seen = await h.evaluate(() => {
        const tiles = [...document.querySelectorAll('[data-deck-grid] [data-deck]')].map((one) => one.getBoundingClientRect())
        const worst = Math.max(...tiles.map((r) => Math.abs(r.width / r.height - 1)))
        const bar = document.querySelector('[data-review-toolbar]')
        const tops = [...bar.querySelectorAll(':scope > *')].map((one) => Math.round(one.getBoundingClientRect().top + one.getBoundingClientRect().height / 2))
        const labels = [...document.querySelectorAll('[data-year-number] span')].filter((one) => one.scrollWidth > one.clientWidth + 1 || one.getBoundingClientRect().right > document.querySelector('[data-study-year-map]').getBoundingClientRect().right).map((one) => one.textContent)
        const box = document.querySelector('[data-book-coverage]')?.getBoundingClientRect()
        const said = [...document.querySelectorAll('[data-book-coverage] [data-coverage-said]')].filter((one) => one.getBoundingClientRect().right > box.right + 0.5).length
        const today = document.querySelector('[data-year-grid] [data-day][style*="inset"]')
        const bg = getComputedStyle(document.querySelector('[data-deck-grid] [data-deck]')).backgroundImage
        return { worst: Math.round(worst * 100) / 100, w: Math.round(tiles[0].width), h: Math.round(tiles[0].height), rows: new Set(tops).size, labels, coverage: box ? said : 'none', today: !!today, stripes: /repeating-linear-gradient/.test(bg) }
      })
      check(`${theme} ${width}: tiles square-ish (within 6%)`, seen.worst <= 0.06, JSON.stringify({ worst: seen.worst, w: seen.w, h: seen.h }))
      check(`${theme} ${width}: the toolbar is one row`, seen.rows === 1, String(seen.rows))
      check(`${theme} ${width}: the year's four numbers are never cut`, !seen.labels.length, JSON.stringify(seen.labels))
      check(`${theme} ${width}: the coverage line stays in its box`, seen.coverage === 0 || seen.coverage === 'none', String(seen.coverage))
      check(`${theme} ${width}: today is ringed inside its square, the satin has no stripes`, seen.today && !seen.stripes, JSON.stringify(seen))
      if (shots) await h.screenshot({ path: join(shots, `width-${width}-${theme}.png`) })
    }
  }
  // Pointing at a day: a hairline ring on its square, its month label brightens, no tip; zoomed shots of today and the pointed day.
  await c.size(1300, 900); await h.waitForTimeout(500)
  const day = h.locator('[data-year-grid] [data-day]').nth(7 * 30 + 2)
  await day.hover(); await h.waitForTimeout(150)
  const lit = await h.evaluate(() => ({ on: !!document.querySelector('[data-year-grid] [data-day-on]'), ring: getComputedStyle(document.querySelector('[data-year-grid] [data-day-on]') ?? document.body).boxShadow, month: [...document.querySelectorAll('[data-year-months] span')].some((one) => one.className.includes('text-foreground')), tips: document.querySelectorAll('[role="tooltip"]').length }))
  check('hover: the pointed day gets a ring, its month label brightens, no tip', lit.on && /inset/.test(lit.ring) && lit.month && !lit.tips, JSON.stringify(lit))
  if (shots) {
    const box = await day.boundingBox()
    await h.screenshot({ path: join(shots, 'zoom-pointed-day.png'), clip: { x: box.x - 30, y: box.y - 30, width: 90, height: 90 } })
    const today = await h.locator('[data-year-grid] [data-today]').boundingBox()
    await h.screenshot({ path: join(shots, 'zoom-today-year.png'), clip: { x: today.x - 30, y: today.y - 30, width: 70, height: 70 } })
  }
  await h.mouse.move(5, 5)

  // Frames every 50 ms while the window narrows from 1600 to 900.
  await look('everforest')
  await c.size(1600, 900); await h.waitForTimeout(600)
  for (let at = 0; at <= 7; at++) {
    await c.size(1600 - at * 100, 900)
    await h.waitForTimeout(50)
    if (shots) await h.screenshot({ path: join(shots, `resize-${String(at).padStart(2, '0')}.png`) })
  }
  await look('paper')
} finally {
  await c.close()
}
done()
