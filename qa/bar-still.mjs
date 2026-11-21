// Someone reads a long page in Writing: they open it from the list, scroll down to its end with the wheel and back up
// to the top. The window's top row never moves under them: Back and Forward, the open tab and "+" keep their left
// edges in every 50 ms sample, while the page's name comes and goes faintly in the room after the tabs (21 Nov: the
// name arrived before Back and Forward and pushed them and the tab ~200px right). A heading going under the page's
// title fades out over 2.5rem rather than standing there cut in half.
//   QA_ARGS=--sandbox QA_DATA=<seeded sandbox copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/bar-still.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const SCROLLER = '[data-open] .haligtree-editor-wrapper.has-handles > .haligtree-editor-content'
try {
  await v('settings:set', { sounds: false, hintRate: 0, topTitle: true })
  await c.go('articles'); await wait(1500)
  // The row, clicked as a person would: the sandbox's long illustrated page.
  const row = h.locator('[data-pane-card] [data-row][data-id]', { hasText: 'Euclid, drawn' }).first()
  await row.click(); await wait(1500)
  check('the page opened beside the Writing list', await h.locator(SCROLLER).count() > 0)
  // Every 50 ms, in the page, the left edge of each control in the top row (at most 1,200 samples, a minute).
  await h.evaluate(() => {
    const edge = (sel) => { const at = document.querySelector(sel); return at ? Math.round(at.getBoundingClientRect().left * 10) / 10 : null }
    window.__bar = []
    window.__barTimer = setInterval(() => {
      if (window.__bar.length >= 1200) return clearInterval(window.__barTimer)
      const title = document.querySelector('[data-top-title]')
      window.__bar.push({ arrows: edge('[data-tab-arrows]'), tab: edge('[data-tab-on]'), add: edge('[data-tab-add]'), title: title ? title.textContent : null, inRoom: !!title?.closest('[data-tab-room]') })
    }, 50)
  })
  const box = await h.locator(SCROLLER).first().boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const scrolled = () => h.evaluate((sel) => { const s = document.querySelector(sel); return { top: Math.round(s.scrollTop), end: s.scrollHeight - s.clientHeight } }, SCROLLER)
  // Down to the end, a wheel's push at a time (capped), then back to the top.
  for (let i = 0; i < 120 && (await scrolled()).top < (await scrolled()).end - 2; i++) { await h.mouse.wheel(0, 160); await wait(60) }
  const atEnd = await scrolled()
  await wait(400)
  // The heading fade, read with the page scrolled: as tall as a heading's line.
  // Against 2.5rem in the page's own root size ("App size" sets it: 17px at 106%, so 42.5px).
  const fade = await h.evaluate((sel) => ({ is: parseFloat(getComputedStyle(document.querySelector(sel)).getPropertyValue('--mf-top-fade')), want: 2.5 * parseFloat(getComputedStyle(document.documentElement).fontSize) }), SCROLLER)
  for (let i = 0; i < 120 && (await scrolled()).top > 0; i++) { await h.mouse.wheel(0, -160); await wait(60) }
  await wait(400)
  const samples = await h.evaluate(() => (clearInterval(window.__barTimer), window.__bar))
  const moved = (key) => {
    const seen = samples.map((one) => one[key]).filter((one) => one !== null)
    return seen.length ? Math.max(...seen) - Math.min(...seen) : NaN
  }
  check('scrolled to the end and back', atEnd.top >= atEnd.end - 2 && atEnd.end > 900, JSON.stringify(atEnd))
  check(`sampled the bar every 50 ms throughout (${samples.length} samples)`, samples.length >= 40)
  const named = samples.filter((one) => one.title)
  check('the page\'s name showed in the bar while its first line was out of sight, and went at the top', named.length > 0 && !samples.at(-1).title, `${named.length} of ${samples.length}`)
  check('the name sits in the room after the tabs, never before Back and Forward', named.every((one) => one.inRoom))
  for (const [key, what] of [['arrows', 'Back and Forward'], ['tab', 'the open tab'], ['add', '"+"']]) {
    check(`${what} never moved while the page scrolled`, moved(key) <= 0.5, `moved ${moved(key)}px across ${samples.length} samples`)
  }
  check('a heading under the title fades out over 2.5rem, not cut in half', Math.abs(fade.is - fade.want) < 0.5, JSON.stringify(fade))
  // The drawings on the page (Excalidraw) log their font subsetting falling back to the main thread: theirs, on main too.
  const own = errors.filter((one) => !/subsetting/i.test(one))
  check('no errors on the page', own.length === 0, own.join(' | '))
} finally {
  await c.close()
}
done()
