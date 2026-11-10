// 10 Nov: a note opened beside a list (Writing) is swapped in with no flight, and a flight from elsewhere that lands
// on a list and a note grows into the note only, never a sheet the size of the page that then turns into a list.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/hero-lands-on-note.mjs [shots-dir]
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const c = await sandbox({ width: 1400, height: 900 })
const { h, go } = c
let ok = true
const check = (name, pass, detail = '') => { ok &&= pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const flights = () => h.evaluate(() => (window.__heroFlights ?? []).map((f) => ({ kind: f.kind, to: f.to, skipped: f.skipped })))
const clear = () => h.evaluate(() => { if (window.__heroFlights) window.__heroFlights.length = 0 })
const settle = async () => { await h.waitForFunction(() => !document.documentElement.dataset.hero, null, { timeout: 8000 }).catch(() => {}); await h.waitForTimeout(800) }
try {
  // 1. Writing: a row of the list opens its page beside it, no flight.
  await go('articles'); await h.waitForTimeout(2000)
  const rows = h.locator('[data-pane-card] [data-row]')
  const n = await rows.count()
  check('Writing shows its list', n > 2, String(n))
  await clear()
  await rows.nth(1).click(); await settle()
  await rows.nth(2).click(); await settle()
  const swapped = await flights()
  check('rows of the list swap the page in with no flight', swapped.length === 0, JSON.stringify(swapped))
  check('the page opened beside the list', await h.evaluate(() => !!document.querySelector('[data-pane-card] .note-pane[data-open]')))
  // 2. From Home, a Writing page's tile: if it lands beside a list, the flight ends on the page, not the whole card.
  await go('home'); await h.waitForTimeout(2000)
  const tile = await h.evaluate(() => {
    const el = [...document.querySelectorAll('[data-pane-card] [data-drag-open]')].find((one) => /^article:/.test(one.getAttribute('data-drag-open')) && one.getBoundingClientRect().height > 0)
    if (!el) return null
    el.scrollIntoView({ block: 'center' }); return el.getAttribute('data-drag-open')
  })
  if (!tile) check('Home has a Writing page tile', false)
  else {
    await h.waitForTimeout(400); await clear()
    await h.locator(`[data-pane-card] [data-drag-open="${tile}"]`).first().click(); await settle()
    const [flight] = await flights()
    const shape = await h.evaluate(() => {
      const r = (el) => el && (({ x, y, width, height }) => ({ x, y, w: width, h: height }))(el.getBoundingClientRect())
      return { note: r(document.querySelector('[data-pane-card] .note-pane[data-open]')), card: r(document.querySelector('[data-pane-front] > [data-pane-card], [data-pane] > [data-pane-card]')), list: !!document.querySelector('[data-pane-card] [data-row]') }
    })
    const near = (a, b) => !!a && !!b && ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= 4)
    if (shape.list && shape.note) check('landing beside a list, it grows into the page, not the whole card', !!flight && !flight.skipped && near(flight.to, shape.note), JSON.stringify({ to: flight?.to, ...shape }))
    else check('landing on a page of its own, it grows into the card', !!flight && (flight.skipped || near(flight.to, shape.note ?? shape.card) || near(flight.to, shape.card)), JSON.stringify({ to: flight?.to, ...shape }))
    if (process.argv[2]) await h.screenshot({ path: `${process.argv[2]}/landed.png` })
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
}
console.log(ok ? 'all passed' : 'some failed')
await c.close(); process.exit(0)
