// The sidebar's sections (Pinned, Recent, Library, Tags) move whole: a heading dragged down past another section
// takes its section there, saved and said with Undo; a heading's menu moves it up or down too. Library hangs on a trunk.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/side-sections.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 1300 })
const { h, v, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const order = () => h.evaluate(() => [...document.querySelectorAll('aside nav [data-side-section]')].filter((one) => one.offsetHeight).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((one) => one.dataset.sideSection).filter((one, n, all) => all.indexOf(one) === n))
try {
  await v('settings:set', { hintRate: 0 })
  await go('home'); await wait(1500)
  const first = await order()
  check('sections in their usual order', first.join() === 'pinned,library,tags' || first.join() === 'pinned,recent,library,tags', first.join())
  const twigs = await h.evaluate(() => document.querySelectorAll('aside nav [data-side-section="library"] svg path').length)
  check('Library hangs on a trunk, a twig per row', twigs >= 4, String(twigs))
  // Drag Library's heading up above Pinned.
  const lib = await h.locator('[data-side-section-handle="library"]').boundingBox()
  const pin = await h.locator('[data-side-section="pinned"]').first().boundingBox()
  await h.mouse.move(lib.x + 30, lib.y + lib.height / 2); await h.mouse.down()
  for (let i = 1; i <= 14; i++) { await h.mouse.move(lib.x + 30, lib.y + lib.height / 2 + ((pin.y - 4 - lib.y - lib.height / 2) * i) / 14); await wait(30) }
  check('carried, a line shows where it lands', (await h.locator('[data-side-section-line]').count()) === 1)
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/side-drag.png`, clip: { x: 0, y: 0, width: 260, height: 1300 } })
  await h.mouse.up(); await wait(900)
  const moved = await order()
  check('let go above Pinned: Library comes first', moved[0] === 'library', moved.join())
  check('and is saved', (await v('settings')).sideSections?.[0] === 'library', JSON.stringify((await v('settings')).sideSections))
  check('the heading was not folded by the drag', (await h.locator('[data-side-section-handle="library"]').getAttribute('aria-expanded')) === 'true')
  // Its menu moves it back down.
  await h.locator('[data-side-section-handle="library"]').click({ button: 'right' }); await wait(400)
  await h.locator('[role="menuitem"]', { hasText: 'Move section down' }).click(); await wait(900)
  check('"Move section down" from its menu puts it after Pinned', (await order()).indexOf('library') > (await order()).indexOf('pinned'), (await order()).join())
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/side-after.png`, clip: { x: 0, y: 0, width: 260, height: 1300 } })
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
done()
