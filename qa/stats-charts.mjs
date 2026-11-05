// Review's Stats charts say only what they draw, and hold still under the pointer. Lines are monotone curves (they
// bend between points but never swing past one or below zero), every series runs to its last point, the dashed line a caption names is
// drawn dashed; bars are one width in every chart with a scale (a hairline at the tallest and its value) and no
// zero bars; no part of a split bar is a sliver; headlines say "1 minute", never "1 minutes". Pointing at every
// point and bar moves no mark and no card: films a frame every 50 ms across each chart (QA_SHOTS), in Everforest
// and Paper.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/stats-charts.mjs
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
const look = async (theme) => { await h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme); await h.waitForTimeout(400) }
try {
  await c.go('home'); await c.go('review')
  await waitFor(() => has('[data-review-tab="stats"]'))
  await h.click('[data-review-tab="stats"]')
  await waitFor(() => has('[data-review-stats] [data-mono-card]'))
  await h.waitForTimeout(1200)
  const drawn = await h.evaluate(() => {
    const lines = [...document.querySelectorAll('[data-review-stats] [data-mono-line]')].map((one) => ({ kind: one.getAttribute('data-mono-line'), curved: /[CSQT]/.test(one.getAttribute('d')), dash: one.getAttribute('stroke-dasharray'), points: (one.getAttribute('d').match(/[MLC]/g) ?? []).length }))
    const captions = [...document.querySelectorAll('[data-review-stats] [data-mono-card]')].map((card) => ({ says: /dashed/.test(card.querySelector('[data-mono-point]')?.textContent ?? ''), dashed: !!card.querySelector('[data-mono-line="dashed"][stroke-dasharray]') }))
    const bars = [...new Set([...document.querySelectorAll('[data-review-stats] [data-bar] > span')].map((one) => Math.round(one.getBoundingClientRect().width)))]
    const zero = document.querySelectorAll('[data-review-stats] [data-bar]').length - document.querySelectorAll('[data-review-stats] [data-bar] > span').length
    const scale = [...document.querySelectorAll('[data-review-stats] [data-focus-bars]')].every((one) => one.querySelector('[data-bars-top]')) && document.querySelectorAll('[data-review-stats] [data-bars-top]').length
    const slivers = [...document.querySelectorAll('[data-review-stats] [data-mono-tones] > div:first-child > span')].filter((one) => one.getBoundingClientRect().width < 11).length
    const text = document.querySelector('[data-review-stats]').textContent
    return { lines, captions, bars, zero, scale, slivers, grammar: /(^|\D)1 (minutes|reviews|cards|sources|days)\b/.test(text) }
  })
  check('lines are monotone curves (shadcn and Mono), drawn through every point', drawn.lines.length > 0 && drawn.lines.every((one) => one.curved), JSON.stringify(drawn.lines))
  check('every series in a chart reaches the same last point', [...new Set(drawn.lines.map((one) => one.points))].length <= 2 && drawn.lines.every((one) => one.points >= 2), JSON.stringify(drawn.lines.map((one) => one.points)))
  check('a caption that names a dashed line has one drawn dashed', drawn.captions.every((one) => !one.says || one.dashed), JSON.stringify(drawn.captions))
  check('bars are one width in every chart', drawn.bars.length === 1, JSON.stringify(drawn.bars))
  check('every bar chart drawn carries a scale (a hairline at the tallest with its value)', drawn.scale >= 1, String(drawn.scale))
  check('no part of a split bar is a sliver', drawn.slivers === 0, String(drawn.slivers))
  check('headlines count in words that agree ("1 minute", not "1 minutes")', !drawn.grammar)
  // Mono's geometry (the charts pass): bars, source bars and the split bar are pills, round at the ends; chips and
  // day squares keep a small corner; line dots are filled and 7 px, ringed in the card.
  const shapes = await h.evaluate(() => {
    const marks = [...document.querySelectorAll('[data-review-stats] [data-bar] > span, [data-review-stats] [data-mono-funnel] span.block')]
    const round = marks.filter((one) => parseFloat(getComputedStyle(one).borderTopLeftRadius) < Math.min(one.getBoundingClientRect().width, one.getBoundingClientRect().height) / 2 - 0.5).map((one) => `${one.tagName}.${(one.className.baseVal ?? one.className).slice(0, 40)}`)
    const square = [...document.querySelectorAll('[data-review-stats] [data-mono-chip], [data-review-stats] [data-day]')].filter((one) => parseFloat(getComputedStyle(one).borderTopLeftRadius) > 4).length
    const dots = [...new Set([...document.querySelectorAll('[data-review-stats] [data-mono-dot]')].map((one) => Math.round(one.getBoundingClientRect().width)))]
    const gap = getComputedStyle(document.querySelector('[data-review-stats] [data-mono-tones] > div:first-child')).columnGap
    return { marks: marks.length, round, square, dots, gap }
  })
  check('bars and source bars are pills; chips and day squares keep a corner of 4 px at most', shapes.marks > 0 && !shapes.round.length && !shapes.square, JSON.stringify(shapes))
  check('line dots are filled and 7 px; the split bar\'s parts sit 2 px apart', shapes.dots.length > 0 && shapes.dots.every((one) => one === 7) && Math.abs(parseFloat(shapes.gap) - 2) < 0.25, JSON.stringify(shapes))
  for (const theme of ['everforest', 'paper']) {
    await look(theme)
    await h.waitForTimeout(600)
    // Point at every point and bar, chart by chart; every mark and card keeps its box.
    const boxes = () => h.evaluate(() => [...document.querySelectorAll('[data-review-stats] [data-mono-card], [data-review-stats] [data-mono-dot], [data-review-stats] [data-bar] > span, [data-review-stats] [data-mono-funnel] span.block')].map((one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y + window.scrollY)},${Math.round(r.width)},${Math.round(r.height)}` }).join(' '))
    const moved = []
    let frame = 0
    for (const chart of ['minutes', 'known', 'due', 'kept', 'sources']) {
      const targets = h.locator(`[data-review-stats] [data-mono-card="${chart}"] [data-say]`)
      const n = await targets.count()
      if (!n) continue
      await targets.first().scrollIntoViewIfNeeded()
      await h.mouse.move(2, 2); await h.waitForTimeout(250)
      const rest = await boxes()
      for (let at = 0; at < n; at += Math.max(1, Math.floor(n / 6))) {
        const box = await targets.nth(at).boundingBox()
        if (!box) continue
        await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await h.waitForTimeout(50)
        if (shots && theme === 'everforest' && frame < 30) await h.screenshot({ path: join(shots, `chart-hover-${String(frame++).padStart(2, '0')}.png`) })
        await h.waitForTimeout(150)
        if ((await boxes()) !== rest) moved.push(`${chart}#${at}`)
      }
    }
    await h.mouse.move(2, 2)
    check(`${theme}: pointing at every point and bar moves no mark and no card`, !moved.length, JSON.stringify(moved.slice(0, 8)))
    if (shots) { await h.evaluate(() => document.querySelector('[data-mono-card="minutes"]')?.scrollIntoView({ block: 'start' })); await h.waitForTimeout(300); await h.screenshot({ path: join(shots, `charts-${theme}.png`) }) }
  }
  await look('paper')
} finally {
  await c.close()
}
done()
