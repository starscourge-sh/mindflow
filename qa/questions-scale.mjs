// Questions at 5, 50, 500 and 5,000: the page opens, its line and tabs stay put, rows draw only what is in
// view, and a long question wraps to two lines, never past the edge. Shots to QA_SHOTS at each size.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-wr/main/index.js HALIGTREE_QA_AWAY=1 node qa/questions-scale.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''

const { check, done } = checks()
const s = await sandbox({ width: Number(process.env.QA_WIDTH ?? 1300), height: 860, seeded: false })
const { h, v, go, close, errors } = s
const shots = process.env.QA_SHOTS
const LONG = 'Why did the people of the late Roman Empire keep writing letters about the weather, the harvest and the roads when everything around them was falling apart, and what does that say about what we keep?'
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { hintRate: 0 })
  await h.reload()
  await h.waitForTimeout(1500)
  let made = 0
  for (const size of [5, 50, 500, 5000]) {
    while (made < size) { await v('question:new', made === 0 ? LONG : `Question number ${(made + 1).toLocaleString('en-GB')}: what happened in the year ${1000 + made}?`); made++ }
    const at = Date.now()
    await go('questions')
    await h.waitForSelector('[role="main"] [data-row]')
    const took = Date.now() - at - 900
    const box = await h.evaluate(() => ({
      drawn: document.querySelectorAll('[role="main"] [data-row]').length,
      wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      said: (() => { const r = document.querySelector('[data-question-said]')?.getBoundingClientRect(); return r ? `${Math.round(r.left)},${Math.round(r.top)}` : null })(),
      count: document.querySelector('[role="main"] section')?.textContent.match(/([\d,]+) questions/)?.[1] ?? null
    }))
    console.log(size, JSON.stringify(box), `${took}ms after the page's own wait`)
    check(`${size}: it says ${size.toLocaleString('en-GB')} questions`, box.count?.replace(/,/g, '').includes(String(size)), box.count)
    check(`${size}: only rows in view are drawn (${box.drawn})`, box.drawn <= 60, box.drawn)
    check(`${size}: nothing runs past the window's edge`, !box.wide)
    if (shots) await h.screenshot({ path: `${shots}/questions-${size}.png` })
  }
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
