// A note's hover card (here a sidebar tag's) goes once the pointer leaves its link, however it leaves: straight
// onto the Map in a few quick moves, across the card first, in one jump, or while its words are still being read.
// (Each move off a link once put the leaving off again, so a pointer that kept moving left the card open.)
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/hover-card-leave.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const card = () => h.evaluate(() => !!document.querySelector('[data-note-preview]'))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.send('view', 'map'); await wait(3000)
  const tags = await h.evaluate(() => document.querySelectorAll('aside [data-side-tag]').length)
  if (!tags) { await h.locator('aside').getByText('Tags', { exact: true }).first().click(); await wait(800) }
  const row = await h.locator('aside [data-side-tag]').first().boundingBox()
  const canvas = await h.locator('[data-pane] canvas').first().boundingBox()
  const paths = [
    ['straight to the map, quick', async () => { await h.mouse.move(canvas.x + 300, canvas.y + 300, { steps: 3 }) }],
    ['across the card, then the map', async () => { const b = await h.locator('[data-note-preview]').boundingBox(); await h.mouse.move(b.x + 40, b.y + 40, { steps: 5 }); await wait(300); await h.mouse.move(canvas.x + 400, canvas.y + 250, { steps: 6 }) }],
    ['one jump onto the map', async () => { await h.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2) }]
  ]
  for (const [name, path] of paths) {
    await h.mouse.move(row.x + 40, row.y + row.height / 2, { steps: 4 })
    await wait(1400)
    const before = await card()
    await path()
    await wait(900)
    check(`${name}: the card showed, then went`, before && !(await card()))
  }
  await h.mouse.move(row.x + 40, row.y + row.height / 2, { steps: 4 })
  await wait(520)
  await h.mouse.move(canvas.x + 200, canvas.y + 200, { steps: 2 })
  await wait(1500)
  check('left while it loads: no card', !(await card()))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally { await c.close?.() }
done()
