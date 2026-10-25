// Passing over a control is never heard as pressing it: the Brutal sticker in
// Settings is silent under the pointer and slams when chosen, and a sweep
// over every button in Settings and on Home plays no press sound (a tick, a
// slam, a chime). Rows may still give their soft hover click.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/hover-sounds.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760 })
const { h, go, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { sounds: true, hintRate: 0, rotCount: 0 })
await h.waitForTimeout(400)
const heard = () => h.evaluate(() => (window.haligtreeHeard ?? []).splice(0))
// Hover sounds: the soft row click and its kin. Anything else under a still hand is a press sound.
const HOVER = new Set(['click:soft', 'click:tock', 'click:knock'])

try {
  await go('settings')
  const brutal = h.locator('.mf-style-brutal').first()
  await brutal.scrollIntoViewIfNeeded()
  await h.mouse.move(5, 5)
  await h.waitForTimeout(300)
  await heard()
  const box = await brutal.boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  await h.waitForTimeout(400)
  const over = await heard()
  check('pointing at Brutal makes no sound', !over.length, over.join(', '))
  await h.mouse.down(); await h.mouse.up()
  await h.waitForTimeout(400)
  const pressed = await heard()
  check('choosing Brutal slams', pressed.includes('click:slam'), pressed.join(', '))
  // Back to Soft, so the sweep runs in the usual style.
  await h.locator('.mf-style-soft').first().click()
  await h.waitForTimeout(600)

  // Opening a note is one sound, the page turn, never a click on top of it.
  await go('inbox')
  await h.waitForTimeout(500)
  await heard()
  await h.locator('[data-pane] [data-row][data-id]').first().click()
  await h.waitForTimeout(500)
  const opened = await heard()
  check('opening a note plays the page turn alone', opened.some((one) => one.startsWith('page')) && !opened.includes('click:tick'), opened.join(', '))

  for (const page of ['settings', 'home', 'inbox', 'today']) {
    await go(page)
    await h.mouse.move(5, 5)
    await heard()
    const spots = await h.evaluate(() => [...document.querySelectorAll('button, [role=button], [role=radio], [role=tab], a[href]')].map((one) => {
      const r = one.getBoundingClientRect()
      return r.width && r.height && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth ? { x: r.x + r.width / 2, y: r.y + r.height / 2, name: (one.getAttribute('aria-label') || one.textContent || '').trim().slice(0, 30) } : null
    }).filter(Boolean))
    const loud = []
    for (const spot of spots.slice(0, 120)) {
      await h.mouse.move(spot.x, spot.y, { steps: 2 })
      await h.waitForTimeout(40)
      const got = (await heard()).filter((one) => !HOVER.has(one) && !one.startsWith('clock') && one !== 'holding')
      if (got.length) loud.push(`${spot.name}: ${got.join(' ')}`)
    }
    check(`${page}: passing over ${Math.min(spots.length, 120)} controls plays no press sound`, !loud.length, loud.slice(0, 6).join(' | '))
  }
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
