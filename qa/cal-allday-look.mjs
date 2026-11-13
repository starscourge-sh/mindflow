// The Calendar's all-day lane wears a table header's fine dot screen, fainter (the user, 13 Nov), in Week and in Day:
// on each day's cell and on the "All-day" label, never on the hours below. Pictures of it in both looks.
//
//   QA_DATA=<a copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=<dir>] node qa/cal-allday-look.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const look = () => h.evaluate(() => {
  const bg = (el) => (el ? getComputedStyle(el).backgroundImage : 'none')
  const lane = document.querySelector('[data-cal-allday-lane]')
  return { cell: bg(document.querySelector('[data-cal-allday]')), label: bg(lane?.previousElementSibling ?? null), hours: bg(document.querySelector('[data-cal-col]')) }
})
const dots = (one) => /radial-gradient/.test(one) && /0\.6px/.test(one)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await go('calendar'); await wait(900)
  for (const [mode, key] of [['week', 'w'], ['day', 'd']]) {
    await h.keyboard.press(key); await wait(700)
    const now = await look()
    check(`${mode}: each day's all-day cell wears the dot screen`, dots(now.cell), now.cell.slice(0, 90))
    check(`${mode}: the “All-day” label beside the lane wears it too`, dots(now.label), now.label.slice(0, 90))
    check(`${mode}: the hours below do not`, !dots(now.hours), now.hours.slice(0, 90))
    for (const theme of ['light', 'dark']) {
      await c.look(theme); await wait(400)
      if (shots) await h.screenshot({ path: `${shots}/allday-${mode}-${theme}.png`, clip: { x: 250, y: 90, width: 1150, height: 360 } })
    }
    await c.look('light'); await wait(300)
  }
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} catch (error) { check('ran without throwing', false, String(error?.stack ?? error).slice(0, 400)) } finally { await c.close() }
done()
