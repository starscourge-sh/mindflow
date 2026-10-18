// A tag's big heading keeps the tails of g, p and y; the tag page has no pin
// button; Home shows the month only once "Show the month on Home" is on.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 [QA_SHOTS=dir] node qa/tag-head-pin.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.QA_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, size } = c
const wait = (ms) => h.waitForTimeout(ms)
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
// The heading's span against the box that clips it: room below the last line's baseline for the tails.
const tails = () => h.evaluate(() => {
  const span = [...document.querySelectorAll('.font-heading > span')].filter((one) => one.textContent.includes('bug-report'))
    .sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize))[0]
  if (!span) return null
  const size = parseFloat(getComputedStyle(span).fontSize)
  // Below the last line, inside the clip: the tails of g, p and y reach about 0.2em under it.
  return { spare: Math.round(parseFloat(getComputedStyle(span).paddingBottom)), need: Math.round(size * 0.18), size }
})
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  await h.evaluate((b) => window.api.captures.create({ body: b }), doc('typing glyphs #bug-report'))
  await h.reload(); await wait(2000)
  for (const width of [900, 1800]) {
    await size(width, 900)
    await c.send('tag', 'bug-report'); await wait(1300)
    const t = await tails()
    check(`${width}: the heading has room for its tails`, t && t.spare >= t.need, JSON.stringify(t))
    check(`${width}: no pin button on the tag page`, !(await h.locator('[aria-label="Pin to the sidebar"], [aria-label="Unpin from the sidebar"]').count()))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/tag-${width}.png` })
  }
  await c.go('home'); await wait(1000)
  check('Home has no month by default', !(await h.locator('[data-home-plan] [data-month-grid]').count()))
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/home-off.png` })
  await v('settings:set', { homeCalendar: true }); await wait(1200)
  check('Home shows the month once turned on', (await h.locator('[data-home-plan] [data-month-grid]').count()) > 0)
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
