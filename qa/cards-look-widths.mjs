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
  await call('cards:list', [{ term: 'Name the parts of a long deck', meaning: 'x #comparative-anatomy-and-physiology-of-the-vertebrates' }, { term: 'One long word', meaning: 'y #communication' }, { term: 'Longer still', meaning: 'z #internationalisation-workshop' }])
  await c.go('home'); await c.go('review')
  await waitFor(() => has('[data-deck-grid] [data-deck]'))
  for (const theme of ['everforest', 'paper']) {
    await look(theme)
    // Every 20 px from 700 to 1300 in the dark theme, and the four usual widths in Paper.
    for (const width of theme === 'everforest' ? Array.from({ length: 31 }, (_, at) => 700 + at * 20) : [900, 1100, 1300, 1600]) {
      await c.size(width, 900)
      await h.waitForTimeout(700)
      const seen = await h.evaluate(() => {
        const tiles = [...document.querySelectorAll('[data-deck-grid] [data-deck]')].map((one) => one.getBoundingClientRect())
        const worst = Math.max(...tiles.map((r) => Math.abs(r.width / r.height - 1)))
        const bar = document.querySelector('[data-review-toolbar]')
        const tops = [...bar.querySelectorAll(':scope > *')].filter((one) => one.offsetParent).map((one) => Math.round(one.getBoundingClientRect().top + one.getBoundingClientRect().height / 2))
        const labels = [...document.querySelectorAll('[data-year-number] span')].filter((one) => one.scrollWidth > one.clientWidth + 1 || one.getBoundingClientRect().right > document.querySelector('[data-study-year-map]').getBoundingClientRect().right).map((one) => one.textContent)
        const box = document.querySelector('[data-book-coverage]')?.getBoundingClientRect()
        const said = [...document.querySelectorAll('[data-book-coverage] [data-coverage-said]')].filter((one) => one.getBoundingClientRect().right > box.right + 0.5).length
        const today = document.querySelector('[data-year-grid] [data-day][style*="inset"]')
        const bg = getComputedStyle(document.querySelector('[data-deck-grid] [data-deck]')).backgroundImage
        const barBox = bar.getBoundingClientRect()
        const cut = [...bar.querySelectorAll('button, [data-review-tab-controls] *')].filter((one) => one.offsetParent && (one.getBoundingClientRect().right > barBox.right + 0.5 || one.getBoundingClientRect().left < barBox.left - 0.5)).map((one) => one.textContent?.slice(0, 20))
        const ways = [...bar.querySelectorAll('[data-way]')].filter((one) => one.offsetParent).length
        const more = !!bar.querySelector('[data-toolbar-more]')
        const ownShown = [...bar.querySelectorAll('[data-review-tab-controls] > *')].every((one) => one.offsetParent && one.getBoundingClientRect().right <= barBox.right + 0.5)
        const numberRows = [...document.querySelectorAll('[data-year-number]')].reduce((rows, one) => { const top = Math.round(one.getBoundingClientRect().top); rows[top] = (rows[top] ?? 0) + 1; return rows }, {})
        // A word broken across two lines in a deck's name: its own range draws more than one box. Only a very long word may break, at
        // its soft hyphens, with a real hyphen; a name past two lines ends in "…" (its menu names it whole), so a clamped name is not read here.
        const broken = [...document.querySelectorAll('[data-deck-grid] [data-deck] h3')].flatMap((one) => { const text = one.firstChild; if (!text || text.nodeType !== 3) return []; const out = []; let at = 0; for (const word of text.textContent.split(' ')) { const range = document.createRange(); range.setStart(text, at); range.setEnd(text, at + word.length); const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.bottom <= one.getBoundingClientRect().bottom + 1); if (word.length > 1 && !word.includes('\u00AD') && one.scrollHeight <= one.clientHeight + 1 && rects.length > 1) out.push(word); at += word.length + 1 } return out })
        const make = bar.querySelector('[data-deck-make]')
        const makeShown = !!make?.offsetParent && make.getBoundingClientRect().width > 0
        const study = document.querySelector('[data-study-now]').getBoundingClientRect().height
        const button = make.getBoundingClientRect().height
        const feet = [...document.querySelectorAll('[data-deck-foot]')].filter((one) => one.getBoundingClientRect().height > 24).length
        const side = document.querySelector('aside[data-chrome]')
        const railTop = side ? Math.round(side.getBoundingClientRect().top) : -1
        const railNarrow = side ? side.getBoundingClientRect().width < 80 : false
        const railIcons = [...document.querySelectorAll('[data-rail-folders] svg')].map((one) => one.getAttribute('class'))
        return { makeShown, study, button, feet, railTop, railNarrow, railIcons, broken, cut, ways, more, ownShown, numberRows: Object.values(numberRows), worst: Math.round(worst * 100) / 100, w: Math.round(tiles[0].width), h: Math.round(tiles[0].height), rows: new Set(tops).size, labels, coverage: box ? said : 'none', today: !!today, stripes: /repeating-linear-gradient/.test(bg) }
      })
      check(`${theme} ${width}: tiles square-ish (within 6%)`, seen.worst <= 0.06, JSON.stringify({ worst: seen.worst, w: seen.w, h: seen.h }))
      check(`${theme} ${width}: the toolbar is one row, nothing cut off, the tab's own controls all shown`, seen.rows === 1 && !seen.cut.length && seen.ownShown, JSON.stringify({ rows: seen.rows, cut: seen.cut, ownShown: seen.ownShown }))
      check(`${theme} ${width}: the ways in that do not fit fold into More, in order`, seen.ways === 4 ? !seen.more : seen.more && seen.ways >= 0, JSON.stringify({ ways: seen.ways, more: seen.more }))
      check(`${theme} ${width}: "Make a card" never folds`, seen.makeShown)
      check(`${theme} ${width}: "Study now" no taller than the toolbar's buttons`, seen.study <= seen.button + 0.5, JSON.stringify({ study: seen.study, button: seen.button }))
      check(`${theme} ${width}: a deck tile's foot is one line`, seen.feet === 0, String(seen.feet))
      if (seen.railNarrow) check(`${theme} ${width}: the icon rail starts below the traffic lights, its two folder icons differ`, seen.railTop >= 34 && new Set(seen.railIcons).size === seen.railIcons.length, JSON.stringify({ top: seen.railTop, icons: seen.railIcons }))
      check(`${theme} ${width}: no deck name breaks inside a word`, !seen.broken.length, JSON.stringify(seen.broken))
      check(`${theme} ${width}: the four numbers stand 4 across or 2 and 2, never 3 and 1`, ['4', '2,2'].includes(seen.numberRows.join()), JSON.stringify(seen.numberRows))
      check(`${theme} ${width}: the year's four numbers are never cut`, !seen.labels.length, JSON.stringify(seen.labels))
      check(`${theme} ${width}: the coverage line stays in its box`, seen.coverage === 0 || seen.coverage === 'none', String(seen.coverage))
      check(`${theme} ${width}: today is ringed inside its square, the satin has no stripes`, seen.today && !seen.stripes, JSON.stringify(seen))
      if (shots && [700, 760, 900, 1100, 1300, 1600].includes(width)) await h.screenshot({ path: join(shots, `width-${width}-${theme}.png`) })
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
