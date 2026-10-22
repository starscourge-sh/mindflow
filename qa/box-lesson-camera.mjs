// The first capture's lesson in quick capture: the word beside the kind chip
// ("guessed from your words") has the row to itself; the camera steps out of
// its way and is back once the lesson is over. And the tour, once Getting
// started has gone, leaves that stop out rather than point at nothing.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-lesson-camera.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1200, height: 800 })
const { page } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
const camera = () => page.evaluate(() => {
  const shot = [...document.querySelectorAll('[data-zen-row] button')].find((one) => /screenshot|camera/i.test(one.getAttribute('aria-label') ?? ''))
  const chip = document.querySelector('[data-kind-chip]')
  if (!chip) return null
  const r = chip.getBoundingClientRect(), word = getComputedStyle(chip, '::after')
  const wordLeft = r.right + 12, wordRight = wordLeft + (word.content === 'none' ? 0 : 150)
  const s = shot?.getBoundingClientRect()
  return { shown: !!s && s.width > 0, overlap: !!s && s.width > 0 && word.content !== 'none' && s.left < wordRight && s.right > wordLeft }
})
try {
  await c.v('settings:set', { hintRate: 0 })
  await page.evaluate(() => window.api.showPrompt()); await wait(900)
  check('The camera is in the footer', (await camera())?.shown)
  await page.evaluate(() => { document.documentElement.setAttribute('data-welcome-ph', ''); document.documentElement.setAttribute('data-welcome-first', '') }); await wait(300)
  const during = await camera()
  check('During the lesson, the camera is out of the word\'s way', during && !during.shown && !during.overlap, JSON.stringify(during))
  await page.evaluate(() => { document.documentElement.removeAttribute('data-welcome-ph'); document.documentElement.removeAttribute('data-welcome-first') }); await wait(300)
  check('After the lesson, the camera is back', (await camera())?.shown)
  // The tour on Home with no Getting started list: no stop without a lit part, but Quick capture's.
  const { h } = c
  await c.go('home')
  await h.evaluate(() => document.querySelector('[data-tour="started"]')?.remove())
  await h.evaluate(() => window.dispatchEvent(new Event('haligtree:tour-stops'))); await h.waitForTimeout(500)
  let titles = []
  for (let i = 0; i < 6; i++) {
    const t = await h.evaluate(() => document.querySelector('[role=dialog][aria-label="Where things are"]')?.innerText ?? '')
    if (!t) break
    titles.push(t.split('\n')[0]); await h.keyboard.press('ArrowRight'); await h.waitForTimeout(300)
  }
  check('Without Getting started on screen, the tour leaves its stop out', titles.length === 4 && !titles.includes('Getting started'), titles.join(', '))
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
