// Pictures, for the eye: the header of an open capture (its "Inbox" chip) beside its siblings, a Writing page's and a
// gem's, light and dark, in a window 560, 1000 and 1440 wide (the chip keeps its word in all three: it folds to its
// mark only in a pane under 21rem); and the chip's box measured beside the stepper and the
// tools in each, so the three headers can be read against each other.
//   SHOT=<path prefix> QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/where-it-goes-look.mjs
import { sandbox } from './sandbox-lib.mjs'
const c = await sandbox({ width: 1440, height: 900, at: '14:10' })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const dir = process.env.SHOT ?? '/tmp/where-it-goes'
let ok = true
const check = (name, pass, detail = '') => { ok &&= !!pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const head = () => h.evaluate(() => {
  const one = document.querySelector('[data-note-head]')
  if (!one) return null
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) } }
  const chip = one.querySelector('[data-place-chip]')
  const b = one.getBoundingClientRect()
  return { head: box(one), stepper: box(one.querySelector('[data-stepper]')), chip: box(chip), words: chip?.querySelector('[data-place-name]')?.offsetParent ? chip.querySelector('[data-place-name]').textContent : '', more: box(one.querySelector('[aria-label="More"]')),
    cut: [...one.querySelectorAll('button')].filter((el) => el.offsetParent && (el.getBoundingClientRect().right > b.right + 0.5 || el.getBoundingClientRect().left < b.left - 0.5)).length, lines: Math.round(b.height) }
})
try {
  await v('settings:set', { hintRate: 0 })
  await v('onboarding:set', { pageHints: false }).catch(() => {})
  for (const [w, hh] of [[1440, 900], [1000, 700], [560, 400]]) {
    await c.size(w, hh)
    for (const theme of ['light', 'dark']) {
      await c.look(theme)
      for (const [name, view, rows] of [['capture', 'inbox', '[data-pane] [data-row][data-type="capture"][data-id]'], ['page', 'articles', '[data-pane] [data-row][data-type="article"][data-id]'], ['gem', 'nuggets', '[data-pane] [data-row][data-type="nugget"][data-id]']]) {
        await go('day'); await go(view); await wait(900)
        const row = h.locator(rows).first()
        if (!(await row.count())) { check(`${name}, ${w} wide, ${theme}: a row to open`, false); continue }
        await row.click(); await wait(1100)
        const chip = h.locator('[data-note-head] [data-place-chip]').first()
        if (await chip.count()) { await chip.scrollIntoViewIfNeeded(); await wait(250) }
        await h.screenshot({ path: `${dir}-${name}-${w}-${theme}.png` })
        const at = await head()
        check(`${name}, ${w} wide, ${theme}: one line, nothing cut, the chip with its words, 24px or more to press`,
          !!at && at.cut === 0 && at.lines <= 40 && !!at.chip && at.chip.height >= 24 && at.chip.width >= 24 && at.words !== '', JSON.stringify(at))
        await h.keyboard.press('Escape'); await wait(200)
      }
    }
  }
} catch (error) { check('the run finished', false, String(error.message).split('\n')[0]) }
const errs = c.errors.filter((one) => !/Autofill|DevTools/.test(one))
check('no errors on the page', !errs.length, errs.slice(0, 2).join(' | '))
console.log(ok ? 'all passed' : 'some failed')
await c.close(); process.exit(ok ? 0 : 1)
