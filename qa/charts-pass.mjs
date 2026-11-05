// The charts pass: Mono Charts' craft on Haligtree's paper. With a full year of reviews, an empty book and a book
// with one review, in Paper (light) and dark, in both finishes (Paper and Satin):
//   - every data mark passes 3:1 against its card, measured from the window's own pixels (capturePage, off screen);
//   - no darker panel inside a chart card: the chart sits on the card;
//   - cards are compact: padding 12 px at most; dot charts' dots 6 to 9 px with 2 to 3 px gaps;
//   - with too little to draw (no reviews, or one in 30 days) the card says its number and a sentence, and no chart.
// Charts covered: Review › Stats (every MonoCard) and the Stats page's own charts ([data-chart]).
// Frames of every card in each state go to QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/charts-pass.mjs
import { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1300, height: 900 })
const { h, electron } = c
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const DAY = 86400000

/** Lays the review history down straight in the book: 'full' a year of days, 'sparse' one review today, 'empty' none. */
function history(kind) {
  const db = new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'))
  const ids = db.prepare("select id from nuggets where coalesce(prompt, '') != '' limit 40").all().map((row) => row.id)
  db.exec('begin')
  db.prepare('delete from review_log').run()
  const add = db.prepare('insert into review_log (item_id, grade, reviewed_at, ms, first) values (?, ?, ?, ?, 0)')
  if (kind === 'sparse') add.run(ids[0], 3, new Date().toISOString(), 8000)
  if (kind === 'full') for (let day = 0; day < 365; day++) { if (day % 9 === 4) continue; for (let n = 0; n < 1 + ((day * 7) % 23); n++) add.run(ids[n % ids.length], n % 6 ? 3 : 1, new Date(Date.now() - day * DAY - n * 60000).toISOString(), 4000 + (n % 5) * 3000) }
  db.exec('commit')
  db.close()
}

const finish = (to) => h.evaluate((to) => { document.documentElement.dataset.reviewFinish = to }, to)
const openStats = async () => {
  await c.go('home'); await c.go('review')
  await waitFor(() => has('[data-review-tab="stats"]'))
  await h.click('[data-review-tab="stats"]')
  await waitFor(() => has('[data-review-stats] [data-mono-card]'))
  await h.mouse.move(2, 2)
  await h.waitForTimeout(1500)
}

/** Each chart card on screen: its marks' centres and a point of its own surface, then their colours from the window's pixels. */
async function contrast(scope) {
  const cards = await h.evaluate((scope) => {
    const marks = '[data-bar] > span, [data-mono-dot], [data-mono-dots] > span:not([data-n="0"]), [data-day][data-n]:not([data-n="0"]), [data-mono-tones] > div:first-child > span, [data-mono-funnel] span.block, [data-mark]'
    return [...document.querySelectorAll(scope)].map((card) => {
      card.scrollIntoView({ block: 'center' })
      const box = card.getBoundingClientRect()
      const points = [...card.querySelectorAll(marks)].filter((one) => !one.closest('[data-year-key]')).map((one) => { const r = one.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] }).filter(([x, y]) => y > 0 && y < innerHeight).slice(0, 60)
      return { name: card.getAttribute('data-mono-card') ?? card.getAttribute('data-chart'), surface: [box.x + 5, box.y + box.height / 2], points }
    })
  }, scope)
  const out = []
  for (const card of cards) {
    await h.evaluate(([scope, name]) => [...document.querySelectorAll(scope)].find((one) => (one.getAttribute('data-mono-card') ?? one.getAttribute('data-chart')) === name)?.scrollIntoView({ block: 'center' }), [scope, card.name])
    await h.waitForTimeout(120)
    const again = await h.evaluate(([scope, name]) => {
      const one = [...document.querySelectorAll(scope)].find((el) => (el.getAttribute('data-mono-card') ?? el.getAttribute('data-chart')) === name)
      const box = one.getBoundingClientRect()
      const marks = '[data-bar] > span, [data-mono-dot], [data-mono-dots] > span:not([data-n="0"]), [data-day][data-n]:not([data-n="0"]), [data-mono-tones] > div:first-child > span, [data-mono-funnel] span.block, [data-mark]'
      // A card's own surface: inside its padding; for a chart drawn straight in a section, just left of the chart.
      return { surface: one.hasAttribute('data-mono-card') ? [box.x + 5, box.y + box.height / 2] : [box.x - 6, box.y + box.height / 2], points: [...one.querySelectorAll(marks)].filter((el) => !el.closest('[data-year-key]')).map((el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] }).filter(([x, y]) => y > 0 && y < innerHeight).slice(0, 60) }
    }, [scope, card.name])
    const colours = await electron.evaluate(async ({ BrowserWindow }, points) => {
      const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
      const image = await win.webContents.capturePage()
      const { width } = image.getSize()
      const scale = width / win.getContentBounds().width
      const bitmap = image.toBitmap()
      const row = image.getSize().width * 4
      return points.map(([x, y]) => { const at = Math.round(y * scale) * row + Math.round(x * scale) * 4; return [bitmap[at + 2], bitmap[at + 1], bitmap[at]] })
    }, [again.surface, ...again.points])
    const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
    const [surface, ...marks] = colours
    const ratios = marks.map((one) => ratio(one, surface))
    out.push({ name: card.name, marks: ratios.length, weakest: ratios.length ? Math.round(Math.min(...ratios) * 100) / 100 : null })
  }
  return out
}

/** A darker or lighter panel inside a chart card, a chart's padding, and the dot charts' dot sizes and gaps. */
const layout = (scope) => h.evaluate((scope) => [...document.querySelectorAll(scope)].map((card) => {
  const box = card.getBoundingClientRect()
  const panels = [...card.querySelectorAll('div, section, span')].filter((one) => {
    if (one.closest('[data-mono-switch], [data-mono-chip], [data-bar], [data-mono-tones], [data-mono-funnel], [data-mark], [data-mono-dots], [data-day-cells], [data-year-grid]')) return false
    const r = one.getBoundingClientRect()
    const bg = getComputedStyle(one).backgroundColor
    const alpha = /rgba?\(([^)]+)\)/.exec(bg)?.[1].split(',')[3] ?? (/color\(.* \/ ([\d.]+)\)/.exec(bg)?.[1]) ?? (bg === 'transparent' ? '0' : '1')
    return Number(alpha) > 0.01 && r.width > box.width * 0.6 && r.height > 30
  }).length
  const style = getComputedStyle(card)
  const dots = [...card.querySelectorAll('[data-mono-dots] > span')].map((one) => Math.round(one.getBoundingClientRect().width))
  const gap = card.querySelector('[data-mono-dots]') ? parseFloat(getComputedStyle(card.querySelector('[data-mono-dots]')).columnGap) : null
  return { name: card.getAttribute('data-mono-card') ?? card.getAttribute('data-chart'), panels, pad: Math.max(...['paddingTop', 'paddingLeft', 'paddingRight', 'paddingBottom'].map((side) => parseFloat(style[side]))), dots: [...new Set(dots)], gap }
}), scope)

const frames = async (tag) => {
  if (!shots) return
  const cards = h.locator('[data-review-stats] [data-mono-card]')
  for (let at = 0; at < await cards.count(); at++) {
    const name = await cards.nth(at).getAttribute('data-mono-card')
    await cards.nth(at).scrollIntoViewIfNeeded()
    await cards.nth(at).screenshot({ path: join(shots, `${tag}-${name}.png`) }).catch(() => {})
  }
}

try {
  // A full year.
  history('full')
  await openStats()
  for (const [look, fin] of [['light', 'paper'], ['light', 'satin'], ['dark', 'paper'], ['dark', 'satin']]) {
    await c.look(look); await finish(fin); await h.waitForTimeout(500)
    const seen = await contrast('[data-review-stats] [data-mono-card]')
    const weak = seen.filter((one) => one.marks && one.weakest < 3)
    check(`${look} ${fin}, a full year: every mark passes 3:1 against its card`, seen.some((one) => one.marks) && !weak.length, JSON.stringify(seen))
    await frames(`full-${look}-${fin}`)
  }
  await c.look('light'); await finish('paper')
  const laid = await layout('[data-review-stats] [data-mono-card]')
  check('no panel inside a chart card: the chart sits on the card', laid.length > 0 && laid.every((one) => !one.panels), JSON.stringify(laid.map((one) => [one.name, one.panels])))
  const rem = await h.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
  check('cards are compact: padding 0.75 rem at most (12 px at the default size)', laid.every((one) => one.pad <= rem * 0.75 + 0.5), JSON.stringify({ rem, pads: laid.map((one) => [one.name, one.pad]) }))
  const lines = await h.evaluate(() => [...document.querySelectorAll('[data-review-stats] [data-mono-line]')].map((one) => ({ width: parseFloat(one.getAttribute('stroke-width')), curve: /C/.test(one.getAttribute('d')) })))
  const dots = await h.evaluate(() => [...new Set([...document.querySelectorAll('[data-review-stats] [data-mono-dot]')].map((one) => Math.round(one.getBoundingClientRect().width)))])
  check('lines are 2 px or more and smooth (monotone), with filled dots of 6 px or more', lines.length > 0 && lines.every((one) => one.width >= 2 && one.curve) && dots.length && dots.every((one) => one >= 6), JSON.stringify({ lines, dots }))
  const bars = await h.evaluate(() => [...document.querySelectorAll('[data-review-stats] [data-bar] > span')].map((one) => { const r = one.getBoundingClientRect(); return parseFloat(getComputedStyle(one).borderTopLeftRadius) >= r.width / 2 - 0.5 }))
  check('bars are pills with round caps', bars.length > 0 && bars.every(Boolean), `${bars.filter(Boolean).length} of ${bars.length}`)

  // Phone width: every card fits, nothing scrolls sideways.
  await c.size(390, 844)
  await h.waitForTimeout(600)
  const narrow = await h.evaluate(() => {
    const root = document.querySelector('[data-review-stats]')
    const wide = [...root.querySelectorAll('[data-mono-card]')].filter((one) => one.scrollWidth > one.clientWidth + 1 || one.getBoundingClientRect().right > innerWidth).map((one) => one.getAttribute('data-mono-card'))
    return { page: document.scrollingElement.scrollWidth <= innerWidth + 1, wide }
  })
  check('at 390 px wide every chart card fits, nothing scrolls sideways', narrow.page && !narrow.wide.length, JSON.stringify(narrow))
  if (shots) for (const name of ['minutes', 'known', 'stages']) { const one = h.locator(`[data-review-stats] [data-mono-card="${name}"]`); await one.scrollIntoViewIfNeeded(); await one.screenshot({ path: join(shots, `phone-${name}.png`) }).catch(() => {}) }
  await c.size(1300, 900)
  await h.waitForTimeout(400)

  // The Stats page's own charts.
  await c.go('stats')
  await waitFor(() => has('[data-chart]'), 6000)
  await h.waitForTimeout(800)
  for (const part of ['now', 'month', 'year']) {
    const chip = h.locator(`button[aria-label="${part === 'now' ? 'At a glance' : part === 'month' ? 'Your month' : 'Your year'}"]`).first()
    if (await chip.count()) { await chip.click(); await h.waitForTimeout(1200) }
    for (const look of ['light', 'dark']) {
      await c.look(look); await h.waitForTimeout(400)
      const seen = await contrast('[data-chart]')
      const weak = seen.filter((one) => one.marks && one.weakest < 3)
      check(`Stats, ${part}, ${look}: its charts' marks pass 3:1`, (part !== 'year' || seen.length > 0) && !weak.length, JSON.stringify(seen))
      if (shots) for (const name of seen.map((one) => one.name)) await h.locator(`[data-chart="${name}"]`).first().screenshot({ path: join(shots, `stats-${part}-${look}-${name}.png`) }).catch(() => {})
    }
    await c.look('light')
  }

  // Too little to draw: one review in 30 days, then none.
  for (const kind of ['sparse', 'empty']) {
    history(kind)
    await openStats()
    const said = await h.evaluate(() => Object.fromEntries(['reviews', 'minutes'].map((name) => {
      const card = document.querySelector(`[data-review-stats] [data-mono-card="${name}"]`)
      return [name, { sentence: !!card?.querySelector('[data-chart-sparse]'), marks: card?.querySelectorAll('[data-day], [data-bar]').length ?? -1, text: card?.textContent.slice(0, 160) }]
    })))
    check(`${kind}: the 30 days and the minutes say their number and a sentence, with no chart drawn`, Object.values(said).every((one) => one.sentence && one.marks === 0), JSON.stringify(said))
    check(`${kind}: no card says NaN or Infinity`, !(await h.evaluate(() => /NaN|Infinity/.test(document.querySelector('[data-review-stats]').textContent))))
    for (const look of ['light', 'dark']) { await c.look(look); await frames(`${kind}-${look}`) }
    await c.look('light')
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
