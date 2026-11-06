// Media shows a tab only for a kind the book holds (the user, 6 Nov: "why show tabs for items that dont exist yet?").
// The picture row's bent corners are drawn whole, never cut flat at the top or foot of the row (the user: "the left side
// gets snipped"), and that extra room never takes a click from what is above or below it.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/media-tabs-carousel.mjs [shots]
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.argv[2]
const c = await sandbox({ width: 1100, height: 760 })
const { h, go } = c
try {
  await go('media')
  await h.waitForTimeout(2500)
  const tabs = await h.$$eval('[data-media-kinds] button', (all) => all.map((one) => one.textContent.trim()))
  // The sandbox holds only pictures here: one kind needs no tabs at all.
  check('no tab for a kind the book has none of', !tabs.includes('Audio') && !tabs.includes('GIFs') && !tabs.includes('PDFs'), tabs.join(', ') || 'no tabs')
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'media.png') })
  const hit = await h.evaluate(() => [...document.querySelectorAll('[data-media-kinds] button')].every((one) => {
    const r = one.getBoundingClientRect()
    return one.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
  }))
  check('every tab still takes a click over the row\'s extra room', hit)
  const row = await h.evaluate(() => {
    const canvas = document.querySelector('[data-flex-carousel] canvas').getBoundingClientRect()
    const box = document.querySelector('[data-flex-carousel-row]').getBoundingClientRect()
    return { above: box.top - canvas.top, below: canvas.bottom - box.bottom, on: document.elementFromPoint(box.left + box.width / 2, box.top + 40)?.hasAttribute('data-flex-carousel-row') }
  })
  check('the glass has room above and below the row', row.above >= 30 && row.below >= 30, JSON.stringify(row))
  check('the row itself still takes the pointer', row.on === true)
  await h.locator('[data-flex-carousel-frame] button[aria-label="Next picture"]').click()
  await h.waitForTimeout(900)
  check('the buttons still turn it', Number(await h.getAttribute('[data-flex-carousel]', 'data-active')) >= 0)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'media-turned.png') })
  for (const [w, hh] of [[1100, 760], [900, 700], [1500, 900]]) {
    await c.size(w, hh)
    await h.waitForTimeout(500)
    const fit = await h.evaluate(() => {
      const page = document.querySelector('[data-pane-card]').getBoundingClientRect()
      const buttons = [...document.querySelectorAll('[data-flex-carousel-frame] button[aria-label$="picture"]')].map((one) => one.getBoundingClientRect())
      const wide = [...document.querySelectorAll('[data-pane-card] *')].filter((one) => one.scrollLeft > 0 && !one.closest('[data-flex-carousel-frame]')).length
      return { n: buttons.length, inside: buttons.every((one) => one.left >= page.left && one.right <= page.right), wide }
    })
    check(`${w} wide: the buttons stay on the page and it never scrolls sideways`, fit.n === 2 && fit.inside && fit.wide === 0, JSON.stringify(fit))
  }
  check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
