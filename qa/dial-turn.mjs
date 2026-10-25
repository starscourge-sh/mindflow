// The theme dial is turned, never jumped: a click on a swatch changes
// nothing, a drag round the ring moves it stop by stop, and each stop gives a
// firm trackpad tap (counted, never played, in a test run).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/dial-turn.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, go, errors, close, electron } = c
const taps = () => electron.evaluate(() => globalThis.haligtreeTaps?.() ?? -1)
try {
  await go('settings')
  await h.waitForTimeout(800)
  const dial = h.locator('[role="slider"][aria-label="Theme"]').first()
  await dial.scrollIntoViewIfNeeded()
  await h.waitForTimeout(600)
  const before = await dial.getAttribute('aria-valuenow')
  const swatch = dial.locator('[data-detent]').nth(3)
  await swatch.click()
  await h.waitForTimeout(900)
  check('a click on a swatch changes nothing', (await dial.getAttribute('aria-valuenow')) === before, `${before} -> ${await dial.getAttribute('aria-valuenow')}`)
  const box = await dial.boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const r = box.width * 0.42
  const tapped = await taps()
  await h.mouse.move(cx, cy - r)
  await h.mouse.down()
  for (let i = 1; i <= 24; i++) {
    const a = -Math.PI / 2 + (i / 24) * (Math.PI * 0.8)
    await h.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    await h.waitForTimeout(16)
  }
  await h.mouse.up()
  await h.waitForTimeout(900)
  const after = await dial.getAttribute('aria-valuenow')
  const now = await taps()
  check('a drag round the ring turns it', after !== before, `${before} -> ${after}`)
  check('each stop it passes gives a firm tap', now - tapped >= 3, `${tapped} -> ${now}`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
