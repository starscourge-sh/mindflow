// "Tidy transcripts" (Settings, Voice notes): on to start, its preview shows
// one line as said and as kept, the ums and the doubled word gone; switched
// off, the kept line is as said. The rules themselves: test/fillers.test.ts.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tidy-transcripts.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const SAID = 'Um, so the the Venetian statute, uh, came first, you know.'

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  check('on to start', (await v('settings')).tidyTranscripts === true, String((await v('settings')).tidyTranscripts))
  await c.go('settings'); await wait(800)
  await h.click('[data-section="Writing"]'); await wait(700)
  const row = h.locator('[data-preview="tidy"]')
  await row.scrollIntoViewIfNeeded().catch(() => {})
  await wait(400)
  const kept = async () => (await h.locator('[data-tidy-kept]').innerText({ timeout: 4000 }).catch(() => null))?.trim()
  const on = await kept()
  check('the preview keeps the line without the ums and the doubled word', on === 'So the Venetian statute came first.', String(on))
  for (const name of ['light', 'dark']) { await c.look(name); await wait(300); await row.screenshot({ path: `${shots}/tidy-preview-on-${name}.png` }).catch(() => {}) }
  await c.look('light')
  await v('settings:set', { tidyTranscripts: false }); await wait(800)
  const off = await kept()
  check('switched off, the kept line is as said', off === SAID, String(off))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
