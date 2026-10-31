// Review settings you can feel: "How much to remember" and "New cards a day"
// are scrub fields (drag sideways, ↑ ↓, click to type, sums like "+5" and
// "20*2"), and a line under each says what the setting costs, in minutes and
// reviews a day, worked out from the scheduler on your own cards (review:cost).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/review-settings-feel.mjs [shots-folder]
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const shots = process.argv[2]

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, both } = c
const wait = (ms) => h.waitForTimeout(ms)
const settings = () => v('settings')
const cost = () => h.evaluate(() => {
  const line = document.querySelectorAll('[data-review-cost]')[1]
  return line ? { reviews: Number(line.dataset.reviews), minutes: Number(line.dataset.minutes), text: `About ${line.dataset.minutes} minutes a day, ${line.dataset.reviews} reviews` } : null
})

try {
  await v('settings:set', { sounds: false, hintRate: 0, newPerDay: 10, retention: 0.9 })
  await v('onboarding:set', { newsSeen: true, pageHints: false })
  // A seeded deck: 580 new cards waiting (more than a month of new cards at 15 a day), and 20 already seen once.
  for (let n = 0; n < 600; n++) {
    const id = await v('nugget:from', `Fact number ${n} is ${n * 7}.`, {})
    await v('item:save', id, { title: `What is fact ${n}?`, prompt: `What is fact ${n}?` })
    if (n < 20) await v('review:grade', id, 3, 6000)
  }
  await go('settings')
  await h.click('[data-section="Review"]').catch(() => {})
  await wait(900)
  const box = h.locator('input[aria-label="New cards a day"]')
  await box.scrollIntoViewIfNeeded(); await wait(300)
  check('"New cards a day" is a scrub field', (await box.getAttribute('data-scrub-field')) !== null)
  check('the scrub field shows the sideways-drag cursor', (await box.evaluate((el) => getComputedStyle(el).cursor)) === 'ew-resize', await box.evaluate((el) => getComputedStyle(el).cursor))
  check('"How much to remember" is a scrub field', (await h.locator('input[aria-label="How much to remember"][data-scrub-field]').count()) === 1)
  await wait(1200)
  const before = await cost()
  const forecastBefore = await v('review:cost', 10, 0.9)
  check('the cost line shows minutes and reviews a day', !!before && /About \d+ minutes? a day, \d+ reviews?/.test(before.text), before?.text)
  check('and matches the forecast for this deck', !!before && before.reviews === forecastBefore.reviews && before.minutes === forecastBefore.minutes, `${JSON.stringify(before)} vs ${JSON.stringify(forecastBefore)}`)

  // Drag right: the value climbs and the line follows.
  const at = await box.boundingBox()
  await h.mouse.move(at.x + at.width / 2, at.y + at.height / 2)
  await h.mouse.down()
  for (let x = 0; x <= 120; x += 10) await h.mouse.move(at.x + at.width / 2 + x, at.y + at.height / 2)
  await h.mouse.up()
  await wait(1500)
  const dragged = (await settings()).newPerDay
  check('dragging right raises "New cards a day"', dragged > 10, String(dragged))
  check('the field shows the new value', Number(await box.inputValue()) === dragged, await box.inputValue())
  const after = await cost()
  const forecastAfter = await v('review:cost', dragged, 0.9)
  check('the minutes line changes with it', !!after && after.reviews > before.reviews, `${before?.text} → ${after?.text}`)
  check('and still matches the forecast', !!after && after.reviews === forecastAfter.reviews && after.minutes === forecastAfter.minutes, `${JSON.stringify(after)} vs ${JSON.stringify(forecastAfter)}`)

  // Typed sums: "20*2", then "+5" from there.
  await box.click(); await wait(200)
  await h.keyboard.press('Meta+a'); await h.keyboard.type('20*2'); await h.keyboard.press('Enter'); await wait(900)
  check('"20*2" typed sets 40', (await settings()).newPerDay === 40, String((await settings()).newPerDay))
  await box.click(); await wait(200)
  await h.keyboard.press('Meta+a'); await h.keyboard.type('+5'); await h.keyboard.press('Enter'); await wait(900)
  check('"+5" typed adds five', (await settings()).newPerDay === 45, String((await settings()).newPerDay))
  // ↑ steps, ⇧↑ by ten.
  await box.click(); await wait(200)
  await h.keyboard.press('ArrowUp'); await h.keyboard.press('Shift+ArrowUp'); await h.keyboard.press('Escape'); await wait(700)
  check('↑ and ⇧↑ step by one and ten', (await settings()).newPerDay === 56, String((await settings()).newPerDay))

  // How much to remember: 95% says how many more reviews than 90%.
  const keep = h.locator('input[aria-label="How much to remember"]')
  await keep.click(); await wait(200)
  await h.keyboard.press('Meta+a'); await h.keyboard.type('95'); await h.keyboard.press('Enter'); await wait(1800)
  check('typed 95 keeps 95%', Math.round((await settings()).retention * 100) === 95, String((await settings()).retention))
  const higher = await h.locator('[data-review-cost]').first().getAttribute('data-times')
  const f95 = await v('review:cost', 56, 0.95)
  const ratio = (f95.reviews / f95.usual).toFixed(1)
  check('95% says how many times the reviews of 90%', higher === ratio, higher)
  if (shots) await both(`${shots}/review-settings-feel`)
} catch (error) { console.log(String(error).slice(0, 400), c.errors.slice(-3).join('\n')) } finally {
  await c.close()
  done()
}
