// The focus session's sound (lib/sound.ts TICKS, Settings › Sound): the six clocks as chips, the cinematic ones in one
// "Cinematic ⌄" chip whose menu stays open as you pick (20 Nov), each heard as it is picked and kept. Real pointer;
// what plays is read by name from the window's own list (haligtreeHeard), the window muted.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/session-sounds.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const CLOCKS = ['Old clock', 'Wall clock', 'Pocket watch', 'Desk clock', 'Mantel clock', 'Grandfather clock']
const CINEMATIC = ['Dark pulse', 'Heartbeat', 'Tense loop', 'Approaching', 'Braam', 'Ominous', 'Deep drone', 'Soft suspense']
try {
  await v('settings:set', { sounds: true, sessionTick: true, hintRate: 0 })
  await go('settings'); await wait(800)
  await h.locator('[data-section="Sound"]').first().click(); await wait(700)
  const chips = await h.evaluate(() => [...document.querySelectorAll('button[aria-pressed]:not([data-session-cinematic])')].map((one) => one.getAttribute('aria-label')))
  const at = CLOCKS.map((one) => chips.indexOf(one))
  check('"Session sound": the six clocks side by side, as chips', at.every((n) => n >= 0) && at.every((n, i) => !i || n === at[i - 1] + 1), chips.join(', '))
  check('and no cinematic sound among the chips', CINEMATIC.every((one) => !chips.includes(one)))
  const heard = () => h.evaluate(() => [...(window.haligtreeHeard ?? [])])
  const before = (await heard()).length
  const trigger = h.locator('[data-session-cinematic]')
  await trigger.scrollIntoViewIfNeeded()
  check('one chip holds the rest, named "Cinematic"', (await trigger.innerText()).trim() === 'Cinematic', await trigger.innerText())
  await trigger.click(); await wait(400)
  const rows = await h.locator('[data-session-sound]').allInnerTexts()
  check('its menu lists the eight cinematic sounds', CINEMATIC.every((one) => rows.some((row) => row.trim() === one)), rows.join(', '))
  await h.locator('[data-session-sound="heartbeat"]').click(); await wait(900)
  const after = (await heard()).slice(before)
  check('picking one plays it, to hear it', after.some((one) => /tick-sample heartbeat/.test(one)), after.join(','))
  check('and keeps it', (await v('settings')).sessionTickSound === 'heartbeat', (await v('settings')).sessionTickSound)
  check('the menu stays open to hear another', await h.locator('[data-session-sound="braam"]').isVisible())
  await h.keyboard.press('Escape'); await wait(300)
  check('closed, the chip names the one chosen and is lit', (await trigger.innerText()).trim() === 'Heartbeat' && (await trigger.getAttribute('aria-pressed')) === 'true', await trigger.innerText())
  check('its volume is beside it', await h.evaluate(() => document.body.innerText.includes('Session sound volume')))
} finally {
  await close()
}
done()
