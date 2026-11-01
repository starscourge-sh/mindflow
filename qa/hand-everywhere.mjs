// The hand over everything clickable, app-wide: walks every view of the main window and quick capture
// (closed and with its side panel open) and checks every button, [role=button], [role=menuitem], link,
// label for a control, summary, chip and swatch, at the point the pointer would be on it, shows the hand.
// It reads the element really under that point (elementFromPoint), so a see-through strip or drag region
// laid over a control is caught too. Disabled ones and the parts you type in are left out.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/hand-everywhere.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 1000 })
const { h, page, go } = c
const VIEWS = (process.env.QA_VIEWS ?? 'home,inbox,today,review,day,articles,feed,nuggets,all,calendar,stats,week,map,discarded,upcoming,powers,tags,matrix,goals,monthpage,weekpage,yearpage,sources,questions,media,queue,lookups,later,routines,settings').split(',')

/** Every clickable thing in view whose hand is missing, named by its words or label. */
const arrows = (target) => target.evaluate(() => {
  const CLICKABLE = 'button, [role=button], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=option], a[href], summary, label:has(input[type=checkbox], input[type=radio], button), [data-chip], [data-swatch]'
  const out = []
  for (const one of document.querySelectorAll(CLICKABLE)) {
    if (one.matches(':disabled, [aria-disabled=true], [data-disabled]') || one.closest('[inert], [aria-hidden=true], [contenteditable=true]')) continue
    if (!one.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    const r = one.getBoundingClientRect()
    if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue
    // Clear of a faded parent (opacity near 0): what is not seen is not pointed at.
    let seen = 1
    for (let n = one; n; n = n.parentElement) seen *= Number(getComputedStyle(n).opacity)
    if (seen < 0.2) continue
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2))
    const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
    const under = document.elementFromPoint(x, y)
    if (!under || !one.contains(under)) continue
    if (under.closest('input, textarea, select, [contenteditable=true]')) continue
    const cursor = getComputedStyle(under).cursor
    if (cursor === 'pointer' || cursor === 'grab' || cursor === 'col-resize' || cursor === 'row-resize' || cursor === 'ew-resize' || cursor === 'ns-resize') continue
    const name = (one.getAttribute('aria-label') || one.textContent || one.className.toString()).trim().replace(/\s+/g, ' ').slice(0, 40)
    const where = (n) => `${n.tagName.toLowerCase()}${n.getAttribute('role') ? `[role=${n.getAttribute('role')}]` : ''}.${String(n.className?.baseVal ?? n.className).split(' ').slice(0, 3).join('.')}`
    out.push(`${name} [${cursor}] ${where(one)} > ${where(under)}`)
  }
  return [...new Set(out)]
})

try {
  await c.v('settings:set', { sounds: false, hintRate: 0, rotCount: 0 })
  // Quick capture has the keys while Haligtree is not the active app, and macOS shows only the active app's cursor unless told.
  const shown = await c.electron.evaluate(() => globalThis.haligtreeCursorShown?.() ?? false)
  check('the window server shows Haligtree\'s cursor while another app is in front (quick capture)', shown === true, String(shown))
  await h.waitForTimeout(1500)
  for (const view of VIEWS) {
    await go(view)
    const missing = await arrows(h)
    check(`${view}: every clickable thing shows the hand`, missing.length === 0, JSON.stringify(missing.slice(0, 10)))
  }
  // Quick capture: pointer in (the header's pill and chips show), then with the side panel open.
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(1200)
  await page.mouse.move(300, 200)
  await page.mouse.move(600, 40)
  await page.waitForTimeout(500)
  const box = await arrows(page)
  check('quick capture: every clickable thing shows the hand', box.length === 0, JSON.stringify(box.slice(0, 10)))
  await page.keyboard.press('Meta+\\')
  await page.waitForTimeout(1200)
  await page.mouse.move(600, 40)
  await page.waitForTimeout(500)
  const panel = await arrows(page)
  check('quick capture with its side panel: every clickable thing shows the hand', panel.length === 0, JSON.stringify(panel.slice(0, 10)))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
