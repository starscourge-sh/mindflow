// Apple Intelligence that is still downloading turns its features on by itself when it is ready, and says so meanwhile.
// The user's Mac, 12 Nov: macOS was downloading it ("13% complete" in System Settings › Siri) while Settings said only
// "Apple Intelligence is still getting ready on this Mac": they asked what that meant and when it would be done. And
// the app asked the Mac once a run, so the features would not have appeared until Haligtree was opened again.
// Here the Mac is stood in for (HALIGTREE_QA_CAPS, never the real one): first "not ready", then ready.
//   QA_DATA=<a copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/ai-ready-later.mjs
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_CAPS = 'not-ready'
// A "not ready" stands 1.5 s in this run before the Mac is asked again (a minute, in the app).
process.env.HALIGTREE_QA_ASK_AGAIN = '1500'
const { sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const row = () => h.locator('[data-setting-title="Apple Intelligence"]')
const said = async () => (await row().innerText().catch(() => '')).replace(/\s+/g, ' ')
const switchUp = () => row().locator('[role="switch"][aria-label="Apple Intelligence"]').count()
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  check('this run\'s Mac says Apple Intelligence is not ready', (await v('caps')).ai === 'not-ready', JSON.stringify(await v('caps')))
  await c.go('settings'); await wait(700)
  await h.click('[data-section="Review"]'); await wait(700)
  await row().scrollIntoViewIfNeeded()
  let now = await said()
  check('Settings says macOS is still downloading or setting it up', /still downloading or setting up Apple Intelligence/.test(now), now)
  check('...that the features turn on by themselves', /turn on by themselves when it is ready/.test(now), now)
  check('...and where to see how far it is, by this macOS\'s own name for the place', /System Settings › Siri shows how far/.test(now), now)
  check('...with no switch to press yet', (await switchUp()) === 0)
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/ai-not-ready.png` })

  // Asked again too soon, the same answer stands: the Mac is not asked on every look.
  await h.evaluate(() => window.dispatchEvent(new Event('focus'))); await wait(400)
  check('come back to at once: still not ready, nothing flickers', (await switchUp()) === 0 && /still downloading/.test(await said()))

  // macOS finishes. Nothing is reopened: the window is come back to, and the features are there.
  await electron.evaluate(() => void (process.env.HALIGTREE_QA_CAPS = 'ai'))
  await wait(1700)
  await h.evaluate(() => window.dispatchEvent(new Event('focus')))
  let up = 0
  for (let i = 0; i < 20 && !(up = await switchUp()); i++) await wait(250)
  now = await said()
  check('ready, and the window come back to: the switch is there, in the same run', up === 1, now)
  check('...and the "still downloading" line is gone', !/still downloading/.test(now), now)
  check('main says so too', (await v('caps')).ai === 'available', JSON.stringify(await v('caps')))
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/ai-ready.png` })

  // What Haligtree can do says the short form where a card lacks it, and nothing once it does not.
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close()
}
done()
