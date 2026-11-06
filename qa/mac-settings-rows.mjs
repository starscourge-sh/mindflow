// This run's Settings rows ("Dates and times lit", "Offers from your notes", "Evening at sunset", "Welcome back")
// beside their neighbours: every control in each hovered in turn shows at most one floating thing; the city
// picker's rows the same. SHOT keeps each beside its neighbours, light and dark (their edges read by eye from those).
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-settings-rows.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h } = c
const floating = () => h.evaluate(() => document.querySelectorAll('[data-title-tips], [data-note-preview], [role="tooltip"]').length)
try {
  await c.go('settings')
  for (const [section, titles] of [['Writing', ['Dates and times lit']], ['What comes back to you', ['Evening at sunset', 'Welcome back', 'Offers from your notes']]]) {
    await h.evaluate((name) => document.querySelector(`[data-section="${name}"]`)?.click(), section)
    await h.waitForTimeout(700)
    for (const title of titles) {
      await h.evaluate((title) => [...document.querySelectorAll('[data-setting]')].find((el) => el.textContent.startsWith(title))?.scrollIntoView({ block: 'center' }), title)
      const controls = await h.evaluate((title) => {
        const row = [...document.querySelectorAll('[data-setting]')].find((el) => el.textContent.startsWith(title))
        return [...row.querySelectorAll('button, [role="switch"]')].map((one) => { const r = one.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })
      }, title)
      let worst = 0
      for (const [x, y] of controls) {
        await h.mouse.move(x, y)
        await h.waitForTimeout(900)
        worst = Math.max(worst, await floating())
      }
      check(`“${title}”: its ${controls.length} controls hovered one by one show at most one floating thing`, worst <= 1, `${worst}`)
      await h.mouse.move(2, 2)
      if (process.env.SHOT) await c.both(`${process.env.SHOT}/rows-${title.replace(/\W+/g, '-').toLowerCase()}`)
    }
  }
  // The city picker, row by row.
  await h.click('[data-sun-place]')
  await h.waitForTimeout(500)
  const rows = await h.locator('[data-sun-places] [role="menuitemradio"]').all()
  let worst = 0
  for (const row of rows.slice(0, 12)) {
    await row.hover()
    await h.waitForTimeout(500)
    worst = Math.max(worst, await floating())
  }
  check(`the city picker's rows (${rows.length}) hovered show no tip over them`, rows.length > 10 && worst === 0, `${worst}`)
  const cursor = await h.evaluate(() => getComputedStyle(document.querySelector('[data-sun-places] [role="menuitemradio"]')).cursor)
  check('its rows show the hand', cursor === 'pointer', cursor)
  if (process.env.SHOT) await c.both(`${process.env.SHOT}/rows-city-picker`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
