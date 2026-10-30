// A mark a line tells you to type (@, [[, /, #) is drawn as code, not as a plain character: here in the Map's hover preview.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/typed-marks.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 1000 })
const { h } = c
try {
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  await h.waitForTimeout(1500)
  const row = h.locator('aside').getByText('Map', { exact: true }).first()
  await row.scrollIntoViewIfNeeded()
  const b = await row.boundingBox()
  await h.mouse.move(b.x + 5, b.y + b.height / 2, { steps: 4 })
  await h.waitForTimeout(1400)
  const card = h.locator('[data-slot="tooltip-content"] [data-peek-card]')
  const marks = await card.locator('code').allTextContents()
  if (process.env.SHOTS) await card.screenshot({ path: `${process.env.SHOTS}/map-peek.png` })
  check('the Map preview draws @ as code', marks.includes('@'), JSON.stringify(marks))
  const text = await card.textContent()
  check('and the sentence around it is whole', /Type\s*@\s*in a note to link it/.test(text ?? ''), text)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
