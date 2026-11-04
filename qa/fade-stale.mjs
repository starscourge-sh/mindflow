// A list that fades at an edge while there is more past it (the scroll drives the fade) has no fade once all of it
// is in view. Chromium keeps the last value a scroll timeline gave when the list stops scrolling, so a list scrolled
// down and then narrowed to a few rows (⌘K, a menu typed into) kept a faded top over rows with nothing above them,
// as quick capture's box did. Every faded scroller is marked data-all-shown while it fits (lib/fade-fits.ts).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/fade-stale.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1100, height: 820 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? process.env.QA_DATA
// The fade's two ends as drawn now, and whether the list can scroll at all.
const read = (selector) => h.evaluate((selector) => {
  const list = [...document.querySelectorAll(selector)].find((one) => one.getClientRects().length)
  if (!list) return null
  const style = getComputedStyle(list)
  return { top: style.getPropertyValue('--mf-less').trim(), foot: style.getPropertyValue('--mf-more').trim(), scrolls: list.scrollHeight > list.clientHeight + 1, at: Math.round(list.scrollTop) }
}, selector)
const flat = (one) => !!one && !one.scrolls && parseFloat(one.top) === 0 && parseFloat(one.foot) === 0
try {
  await v('settings:set', { hintRate: 0 })
  await h.keyboard.press('Meta+k'); await wait(900)
  const rows = '[role=dialog] .mf-more'
  await h.evaluate((rows) => { const list = [...document.querySelectorAll(rows)].find((one) => one.getClientRects().length); if (list) list.scrollTop = list.scrollHeight }, rows)
  await wait(400)
  const scrolled = await read(rows)
  check('⌘K scrolled down: its top fades', scrolled?.scrolls && parseFloat(scrolled.top) > 0, JSON.stringify(scrolled))
  await h.keyboard.type('zzqx dentist', { delay: 15 }); await wait(900)
  const narrowed = await read(rows)
  check('narrowed to rows that all fit: no fade left at either edge', flat(narrowed), JSON.stringify(narrowed))
  await h.screenshot({ path: `${shots}/fade-stale-palette.png` })
  await h.keyboard.press('Escape'); await wait(500)
  // A faded list (the same class every menu, the palette and Display's panel wear) scrolled, then all of it in view:
  // its rows cut back, or its box grown, at the end of the list and in its middle.
  for (const how of ['rows cut back', 'box grown', 'rows cut back, from the middle', 'box grown, from the middle']) {
    const out = await h.evaluate(async (how) => {
      const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
      const box = document.createElement('div')
      box.className = 'mf-more'
      box.style.cssText = 'position:fixed;left:10px;top:10px;width:200px;height:200px;overflow-y:auto;z-index:99999'
      const inner = document.createElement('div'); inner.style.height = '2000px'
      box.append(inner); document.body.append(box)
      await frame()
      box.scrollTop = how.includes('middle') ? 60 : 1800
      await frame(); await new Promise((done) => setTimeout(done, 200))
      const faded = parseFloat(getComputedStyle(box).getPropertyValue('--mf-less')) > 0
      if (how.startsWith('rows')) inner.style.height = '100px'
      else box.style.height = '2100px'
      await frame(); await new Promise((done) => setTimeout(done, 300)); await frame()
      const style = getComputedStyle(box)
      const after = { top: style.getPropertyValue('--mf-less').trim(), foot: style.getPropertyValue('--mf-more').trim(), scrolls: box.scrollHeight > box.clientHeight + 1 }
      box.remove()
      return { faded, ...after }
    }, how)
    check(`${how}: faded while scrolled, then no fade once all of it shows`, out.faded && flat(out), JSON.stringify(out))
  }
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
