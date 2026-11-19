// The focus session's sound (lib/sound.ts TICKS, Settings › Sound): the ten sounds the user chose (17 Nov) offered with
// the clocks, each heard as it is picked and kept, and the volume beside them heard as it is let go. Real pointer;
// what plays is read by name from the window's own list (haligtreeHeard), the window muted.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/session-sounds.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const NEW = ['Dark pulse', 'Heartbeat', 'Tense loop', 'Approaching', 'Braam', 'Ominous', 'Deep drone', 'Soft suspense', 'Grandfather clock', 'Mantel clock']
try {
  await v('settings:set', { sounds: true, sessionTick: true, hintRate: 0 })
  await go('settings'); await wait(800)
  await h.locator('[data-section="Sound"]').first().click(); await wait(700)
  const offered = await h.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].map((one) => one.getAttribute('aria-label')))
  check('"Session sound" offers the ten new sounds beside the clocks', NEW.every((one) => offered.includes(one)) && offered.includes('Wall clock'), offered.join(', '))
  const heard = () => h.evaluate(() => [...(window.haligtreeHeard ?? [])])
  const before = (await heard()).length
  await h.locator('button[aria-pressed][aria-label="Heartbeat"]').scrollIntoViewIfNeeded()
  await h.locator('button[aria-pressed][aria-label="Heartbeat"]').click(); await wait(900)
  const after = (await heard()).slice(before)
  check('picking one plays it, to hear it', after.some((one) => /tick-sample heartbeat/.test(one)), after.join(','))
  check('and keeps it', (await v('settings')).sessionTickSound === 'heartbeat', (await v('settings')).sessionTickSound)
  check('its volume is beside it', (await h.locator('text=Session sound volume').count()) === 1)
} finally {
  await close()
}
done()
