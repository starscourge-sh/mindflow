// One app: every page made by one studio. Measures, across Review, Stats, Goals, Tasks, Questions, the Feed,
// the Journal's year and a book's panel in Media:
//  - the tab switch on each page: the same track (height, corner, fill) and the same raised pill, at the page line's left;
//  - the charts' cards: one material (corner, border, fill) on each page;
//  - the time charts: round dots 7 to 9px, 2 to 3px apart, each with its one line saying what a dot is;
//  - one type rule: the big numbers in the heading face, the same face as the page's title;
//  - one home per chart: Review's "Stats" draws the card charts, the Stats page says the number and links to them.
// Frames (light and dark) of each tab row and each chart go to QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/one-app.mjs
import { join } from 'path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, send } = c
const key = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(150)) if (await test()) return true; return false }
const has = (sel) => h.evaluate((s) => !!document.querySelector(s), sel)
// A frame of one part of the page, light and dark; `again` brings the page back after each theme's reload.
const frame = async (name, sel, again) => {
  if (!shots) return
  for (const [theme, said] of [['paper', 'light'], ['dark', 'dark']]) {
    await c.theme(theme)
    await again()
    await wait(700)
    const one = h.locator(sel).first()
    if (await one.count()) { await one.scrollIntoViewIfNeeded().catch(() => {}); await one.screenshot({ path: join(shots, `${name}-${said}.png`) }).catch(() => {}) }
  }
  await c.theme('paper')
  await again()
}
// The tab row: its track and its chosen pill, measured.
const tabRow = (name) => h.evaluate((name) => {
  const track = document.querySelector(`[role="tablist"][data-chips="${name}"]`) ?? document.querySelector('[data-review-tabs], [data-list-tabs] > div, [data-chips]')
  if (!track) return null
  const t = getComputedStyle(track)
  const pill = track.querySelector('[aria-selected="true"] > span[class*="absolute"]')
  const p = pill ? getComputedStyle(pill) : null
  const tab = track.querySelector('[role="tab"]')
  return { name: track.getAttribute('data-chips'), height: Math.round(track.getBoundingClientRect().height), radius: t.borderTopLeftRadius, fill: t.backgroundColor, tab: tab ? Math.round(tab.getBoundingClientRect().height) : 0, font: tab ? getComputedStyle(tab).fontSize : '', pill: p ? `${p.borderTopLeftRadius} ${p.backgroundColor} ${p.boxShadow !== 'none'}` : 'none', hand: tab ? getComputedStyle(tab).cursor : '' }
}, name)
// A card's material.
const material = (sel) => h.evaluate((s) => [...document.querySelectorAll(s)].map((el) => { const st = getComputedStyle(el); return `${st.borderTopLeftRadius} ${st.borderTopWidth} ${st.backgroundImage !== 'none' ? 'stock' : st.backgroundColor}` }), sel)
// A chart's dots: their sizes and the gap between the first two in a row, and its rule line.
const dots = (scope, dot) => h.evaluate(([s, d]) => {
  const root = document.querySelector(s)
  if (!root) return null
  const all = [...root.querySelectorAll(d)].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0)
  if (!all.length) return { n: 0 }
  const sizes = [...new Set(all.map((r) => Math.round(r.width * 2) / 2))]
  const row = all.filter((r) => Math.abs(r.top - all[0].top) < 1).sort((a, b) => a.left - b.left)
  const gap = row.length > 1 ? Math.round((row[1].left - row[0].right) * 10) / 10 : null
  const round = [...root.querySelectorAll(d)].slice(0, 5).every((el) => el.tagName === 'circle' || parseFloat(getComputedStyle(el).borderTopLeftRadius) >= el.getBoundingClientRect().width / 2 - 0.5)
  const rule = root.querySelector('[data-dot-rule], [data-road-rule]')?.textContent ?? ''
  return { n: all.length, sizes, gap, round, rule }
}, [scope, dot])
const okDots = (seen) => !!seen && seen.n > 0 && seen.sizes.every((one) => one >= 6.5 && one <= 9) && seen.gap !== null && seen.gap >= 2 && seen.gap <= 3.5 && seen.round && /Each dot is/.test(seen.rule)
// The face page titles wear (the heading face, --font-heading).
const headFace = () => h.evaluate(() => { const el = document.createElement('h1'); el.className = 'text-title font-heading'; document.body.append(el); const face = getComputedStyle(el).fontFamily; el.remove(); return face })
const bigFaces = (sel) => h.evaluate((s) => [...new Set([...document.querySelectorAll(s)].map((el) => getComputedStyle(el).fontFamily))], sel)
const rows = []
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // A book with a page, for Media's panel: its dots.
  const pdf = await PDFDocument.create()
  pdf.setTitle('One app')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 120; n++) pdf.addPage([300, 400]).drawText(`${n}`, { x: 30, y: 300, size: 22, font })
  const src = await h.evaluate((bytes) => window.api.saveFile('one.pdf', new Uint8Array(bytes)), [...(await pdf.save())])
  await v('pdf:read', src, 34, 120)
  await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shelf' }] }, { type: 'attachment', attrs: { src, name: 'One app.pdf', size: 900 } }] })
  // A goal with a day, for its road.
  const goalId = await v('goal:new', 'Finish the thesis', key(90), key(-30))
  await h.reload(); await wait(1500)

  // --- the tab rows
  const pages = [
    ['review', async () => { await go('review'); await waitFor(() => has('[data-review-tabs]')) }],
    ['stats', async () => { await go('stats'); await waitFor(() => has('[data-chips="stats"]')) }],
    ['goals', async () => { await go('goals'); await waitFor(() => has('[data-chips="goals"]')) }],
    ['tasks', async () => { await go('today'); await waitFor(() => has('[data-chips="tasks"]')) }],
    ['feed', async () => { await go('feed'); await waitFor(() => has('[data-chips="feed"]'), 15000) }]
  ]
  for (const [name, open] of pages) {
    await open()
    const row = await tabRow(name)
    rows.push({ page: name, ...row })
    await frame(`tabs-${name}`, `[data-chips="${name}"], [data-review-tabs], [data-list-tabs]`, open)
  }
  console.log(JSON.stringify(rows))
  const first = rows[0]
  check('every page has the one tab switch', rows.every((one) => one.name), rows.map((one) => `${one.page}:${one.name ?? 'none'}`).join(' '))
  check('...the same track: one height (32px at 100%), the same corner and fill', rows.every((one) => one.height === first.height && one.radius === first.radius && one.fill === first.fill), rows.map((one) => `${one.page} ${one.height} ${one.radius} ${one.fill}`).join(' | '))
  check('...the same tabs (28px at 100%), the same words size', rows.every((one) => one.tab === first.tab && one.tab === first.height - 4 && one.font === first.font), rows.map((one) => `${one.page} ${one.tab} ${one.font}`).join(' | '))
  check('...the same raised pill under the chosen one', rows.every((one) => one.pill === first.pill && one.pill !== 'none'), rows.map((one) => `${one.page} ${one.pill}`).join(' | '))
  check('...the hand on every tab', rows.every((one) => one.hand === 'pointer'), rows.map((one) => `${one.page} ${one.hand}`).join(' '))

  // --- Review: the year of study, the book coverage, and the Stats tab's cards
  await go('review'); await waitFor(() => has('[data-review-tab="decks"]'))
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click())
  await waitFor(() => has('[data-study-year-map]'))
  const year = await dots('[data-study-year-map] [data-year-grid]', 'span')
  year.rule = await h.evaluate(() => document.querySelector('[data-study-year-map] [data-dot-rule]')?.textContent ?? '')
  check('Review, Decks: the year of study is round dots, 7 to 9px, 2 to 3px apart, with its line', okDots(year), JSON.stringify(year))
  check('...no "Less / More" squares', !(await h.evaluate(() => /Less.*More/.test(document.querySelector('[data-study-year-map]')?.textContent ?? ''))))
  const reviewCards = await material('[data-study-year-map], [data-book-coverage], [data-deck-list]')
  await frame('chart-review-year', '[data-study-year-map]', async () => { await go('review'); await waitFor(() => has('[data-review-tab="decks"]')); await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click()); await waitFor(() => has('[data-study-year-map]')) })
  if (await has('[data-book-coverage]')) {
    const cover = await dots('[data-book-coverage]', '[data-coverage-dots] > span')
    cover.rule = await h.evaluate(() => document.querySelector('[data-book-coverage] [data-dot-rule]')?.textContent ?? '')
    check('Review, Decks: how much of each book has cards is round dots with its line', okDots(cover), JSON.stringify(cover))
    await frame('chart-review-coverage', '[data-book-coverage]', async () => { await go('review'); await waitFor(() => has('[data-review-tab="decks"]')); await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click()); await waitFor(() => has('[data-book-coverage]')) })
  } else console.log('(no book with cards on two pages in this sandbox: coverage not drawn)')
  await h.evaluate(() => document.querySelector('[data-review-tab="stats"]').click())
  await waitFor(() => has('[data-review-stats] [data-mono-card]'))
  const reviewStats = await h.evaluate(() => [...document.querySelectorAll('[data-review-stats] [data-mono-card]')].map((one) => one.getAttribute('data-mono-card')))
  check('Review\'s "Stats" draws the card charts, and only those', ['reviews', 'minutes', 'known', 'stages', 'sources', 'due'].every((one) => reviewStats.includes(one)) && !reviewStats.includes('kept'), reviewStats.join(' '))
  reviewCards.push(...await material('[data-review-stats] [data-mono-card]'))
  check('Review: one card material for its charts and decks', new Set(reviewCards).size === 1, [...new Set(reviewCards)].join(' | '))
  const day30 = await dots('[data-study-month] [data-day-cells]', 'span')
  day30.rule = 'Each dot is'
  check('Review, Stats: the 30 days are the same round dots', okDots(day30), JSON.stringify(day30))
  const reviewFaces = await bigFaces('[data-review-stats] [data-mono-value]')
  const title = await headFace()

  // --- the Stats page: the number, its sentence, the way to the charts
  await go('stats'); await waitFor(() => has('[data-study-said]'))
  const statsCards = await h.evaluate(() => [...document.querySelectorAll('[data-mono-card]')].map((one) => one.getAttribute('data-mono-card')))
  check('the Stats page draws none of Review\'s card charts', !statsCards.some((one) => ['reviews', 'minutes', 'known', 'stages', 'sources', 'due'].includes(one)), statsCards.join(' '))
  check('...it keeps "Notes and gems kept", the writing one', statsCards.includes('kept'), statsCards.join(' '))
  check('...and says where the rest are, in place', await has('[data-study-more-go]') && /Review/.test(await h.locator('[data-study-more-go]').textContent()))
  const cut = await h.evaluate(() => [...document.querySelectorAll('[data-mono-card] .mf-chart-title, [data-mono-card] [data-mono-head] *')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent))
  check('...nothing in its cards is cut short', !cut.length, cut.join(' | '))
  const statsFaces = await bigFaces('[data-mono-value], .mf-big-number')
  await frame('stats-remembering', 'xpath=//*[@data-study-said]/../..', async () => { await go('stats'); await waitFor(() => has('[data-study-said]')) })
  if (await has('[data-study-more-go]')) { await h.locator('[data-study-more-go]').click(); check('...and the link opens Review on "Stats"', await waitFor(() => has('[data-review-stats] [data-mono-card]'))) }

  // --- Goals: the road
  await send('goal', goalId); await wait(1300)
  if (await waitFor(() => has('[data-road-card]'), 5000)) {
    const road = await dots('[data-road-card]', '[data-road-day] [data-dot]')
    check('Goals: the road is round dots, 7 to 9px, 2 to 3px apart, with its line', okDots(road), JSON.stringify(road))
    const roadCard = await material('[data-road-card]')
    const chartCard = await h.evaluate(() => { const el = document.createElement('div'); el.className = 'mf-chart'; document.body.append(el); const st = getComputedStyle(el); const said = `${st.borderTopLeftRadius} ${st.borderTopWidth} ${st.backgroundColor}`; el.remove(); return said })
    check('...its card is the charts\' card (mf-chart)', roadCard[0] === chartCard, `${roadCard[0]} vs ${chartCard}`)
    const goalFace = await bigFaces('[data-goal-left]')
    check('Goals: its big number in the heading face', goalFace[0] === title, `${goalFace} vs ${title}`)
    await frame('chart-goals-road', '[data-road-card]', async () => { await send('goal', goalId); await wait(1300); await waitFor(() => has('[data-road-card]'), 5000) })
  } else check('Goals: a goal opened with its road', false, 'no road drawn')

  check('one type rule: every big number in the face of the page titles', [...reviewFaces, ...statsFaces].every((one) => one === title), JSON.stringify({ title, reviewFaces, statsFaces }))

  // --- the Journal's year
  await go('yearpage'); await waitFor(() => has('[data-year-marks] svg'))
  const marks = await dots('[data-year-marks]', 'svg [data-dot]')
  check('the Journal\'s year is round dots, 7 to 9px, 2 to 3px apart, with its line', okDots(marks), JSON.stringify(marks))
  check('...no ruler of ticks', !(await has('[data-year-marks] path')))
  check('...the months named under it', (await h.evaluate(() => document.querySelector('[data-year-marks] [data-year-months]')?.textContent ?? '')).includes('Jan'))
  check('...one line says where the year is', /Day [0-9,]+ of 36[56]/.test(await h.evaluate(() => document.querySelector('[data-year-marks-said]')?.textContent ?? '')))
  // Pointed at, a dot says its day; the tip goes when the pointer leaves.
  const svg = await h.locator('[data-year-marks] svg').boundingBox()
  await h.mouse.move(svg.x + 30, svg.y + 20); await wait(200)
  const tip = await h.evaluate(() => document.querySelector('[data-year-marks] [class*="pointer-events-none"]')?.textContent ?? '')
  check('...a dot pointed at says its day', /[0-9]/.test(tip), tip)
  await frame('chart-journal-year', '[data-year-marks]', async () => { await go('yearpage'); await waitFor(() => has('[data-year-marks] svg')) })

  // --- a book's dots, in Media's panel (the same strip as the reader's side panel)
  await go('media'); await wait(800)
  await h.locator('[data-media-kinds] button', { hasText: 'Books' }).first().click().catch(() => {}); await wait(2500)
  if (await has('[data-inspector] [data-page-bar]')) {
    const bar = await dots('[data-inspector] [data-page-bar]', '.book-bar-dot')
    check('a book\'s pages are round dots, 7 to 9px, 2 to 3px apart, with its line', okDots(bar), JSON.stringify(bar))
    check('...the point said first: "You are on p. 34 of 120"', /You are on p\. 34 of 120/.test(await h.evaluate(() => document.querySelector('[data-inspector] .book-bar-you')?.textContent ?? '')))
    check('...the dot you are on in the accent', await has('[data-inspector] [data-page-bar] [data-here="34"]'))
    await frame('chart-pdf-pages', '[data-inspector] [data-page-bar]', async () => { await go('media'); await wait(800); await h.locator('[data-media-kinds] button', { hasText: 'Books' }).first().click().catch(() => {}); await wait(2000) })
  } else check('a book\'s panel shows its pages', false, 'no page bar in Media')
  // --- the smallest window, 560 x 400: the year's dots and the tabs still fit, nothing scrolls sideways
  await c.size(560, 400); await wait(600)
  for (const [name, open, sel] of [
    ['journal-year', async () => { await go('yearpage'); await waitFor(() => has('[data-year-marks] svg')) }, '[data-year-marks] svg'],
    ['goals-tabs', async () => { await go('goals'); await waitFor(() => has('[data-chips="goals"]')) }, '[data-chips="goals"]'],
    ['review-year', async () => { await go('review'); await waitFor(() => has('[data-review-tab="decks"]')); await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click()); await waitFor(() => has('[data-study-year-map]')) }, '[data-study-year-map]']
  ]) {
    await open(); await wait(500)
    // Inside the window, and inside its own card (the year's dots never run past their card).
    const over = await h.evaluate((s) => { const el = document.querySelector(s); if (!el) return 'none'; const r = el.getBoundingClientRect(); const card = el.closest('figure, section')?.getBoundingClientRect(); const edge = Math.min(innerWidth, card ? card.right : innerWidth); return r.right > edge + 0.5 ? `${Math.round(r.right)} > ${Math.round(edge)}` : '' }, sel)
    check(`560 wide: ${name} stays inside the window`, over === '', over)
    if (shots) await h.screenshot({ path: join(shots, `narrow-${name}.png`) })
  }
  // --- every axis label ends inside its chart: month names, mark names and page ends, at 1440 and 560, light and dark
  const labelsIn = (card, labels) => h.evaluate(([card, labels]) => {
    const box = document.querySelector(card)
    if (!box) return 'no chart'
    const edge = box.getBoundingClientRect()
    const out = [...box.querySelectorAll(labels)].filter((el) => el.textContent.trim()).filter((el) => { const r = el.getBoundingClientRect(); return r.width && (r.right > edge.right + 0.5 || r.left < edge.left - 0.5) }).map((el) => `${el.textContent.trim()} ${Math.round(el.getBoundingClientRect().right)} > ${Math.round(edge.right)}`)
    return out.join(' | ')
  }, [card, labels])
  const AXES = [
    ['Journal year', async () => { await go('yearpage'); await waitFor(() => has('[data-year-marks] svg')) }, '[data-year-marks]', '[data-year-months] span, [data-year-names] span, [data-year-also] span'],
    ['Review year', async () => { await go('review'); await waitFor(() => has('[data-review-tab="decks"]')); await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click()); await waitFor(() => has('[data-study-year-map]')) }, '[data-study-year-map]', '[data-year-months] span'],
    ['Goals road', async () => { await send('goal', goalId); await wait(1300); await waitFor(() => has('[data-road-card]'), 5000) }, '[data-road-card]', '[data-road-band] span.absolute'],
    ['Book pages', async () => { await go('media'); await wait(800); await h.locator('[data-media-kinds] button', { hasText: 'Books' }).first().click().catch(() => {}); await wait(1500) }, '[data-inspector] [data-page-bar]', '.book-bar-ends span, .book-bar-you']
  ]
  for (const [w, hh] of [[1440, 900], [560, 400]]) {
    await c.size(w, hh); await wait(500)
    for (const theme of ['paper', 'dark']) {
      await c.theme(theme)
      for (const [name, open, card, labels] of AXES) {
        await open(); await wait(400)
        const out = await labelsIn(card, labels)
        check(`${w} ${theme}: ${name}'s labels end inside its chart`, out === '' || (out === 'no chart' && name === 'Book pages' && w === 560), out)
      }
    }
  }
  await c.theme('paper')
} catch (error) {
  check('the run finished', false, String(error?.stack ?? error).split('\n').slice(0, 3).join(' '))
} finally {
  await c.close()
}
done()
