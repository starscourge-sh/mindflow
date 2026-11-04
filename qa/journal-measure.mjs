// The Journal's day writing reads as a note does (note 1c7d6afe, "too long"): lines of about seventy characters,
// from the same left edge as the day's caption and tasks, at Narrow and at Wide, never across the whole sheet.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/journal-measure.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1600, height: 1000 })
const { h, v, go, look } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? process.env.QA_DATA
const said = 'Once again, feeling overwhelmed, I recently learned about an experiment on pigeons, and realised they were more likely to try the same thing again if the reward was variable. '
try {
  for (const width of ['page', 'wide']) {
    await v('settings:set', { hintRate: 0, pageWidth: width })
    await h.evaluate((width) => document.documentElement.setAttribute('data-width', width), width)
    await go('day'); await wait(1500)
    await h.locator('[data-day-write] .ProseMirror').first().click(); await wait(200)
    if (width === 'page') await h.keyboard.insertText(said.repeat(3))
    await wait(500)
    const at = await h.evaluate(() => {
      const words = document.querySelector('[data-day-write] .ProseMirror')
      const caption = document.querySelector('[data-day-caption]')
      const p = words.querySelector('p')
      const size = parseFloat(getComputedStyle(p).fontSize)
      // Characters a line holds: the column against the width of an average letter of these words.
      const probe = Object.assign(document.createElement('span'), { textContent: 'abcdefghijklmnopqrstuvwxyz '.repeat(4) })
      probe.style.cssText = 'position:absolute;white-space:nowrap;visibility:hidden'; p.append(probe); const letter = probe.getBoundingClientRect().width / probe.textContent.length; probe.remove()
      const box = p.getBoundingClientRect()
      return { chars: Math.round(box.width / letter), ems: +(box.width / size).toFixed(1), left: Math.round(box.left), caption: Math.round(caption?.getBoundingClientRect().left ?? -1) }
    })
    // Narrow: about seventy characters; Wide: a note's own wider column (52em), never the whole sheet.
    check(`${width}: a line is a note's line (36em Narrow, 52em Wide)`, at.ems <= (width === 'page' ? 36.5 : 52.5) && (width !== 'page' || (at.chars >= 55 && at.chars <= 95)), JSON.stringify(at))
    check(`${width}: from the caption's left edge`, Math.abs(at.left - at.caption) <= 2, JSON.stringify(at))
    await h.screenshot({ path: `${shots}/journal-measure-${width}.png` })
  }
  await look('dark'); await wait(500)
  await h.screenshot({ path: `${shots}/journal-measure-dark.png` })
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
