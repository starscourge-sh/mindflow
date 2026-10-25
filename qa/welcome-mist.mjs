// A brand-new Haligtree arrives as Arc and Dia do: the window comes up almost
// clear and grows solid over a few seconds; a sea mist covers the welcome and
// lifts; a soft sound swells in; and the first words come through only once
// the mist has thinned. Then the welcome plays as before.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-mist.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h, errors, close, electron } = c
const opacity = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => /view=home/.test(w.webContents.getURL()))?.qaOpacity ?? -1)
try {
  await h.waitForSelector('[data-welcome-mist]', { timeout: 8000 })
  const early = await opacity()
  check('the window comes up almost clear', early < 0.6, String(early))
  check('the words wait under the mist', await h.locator('[data-thesis="line"]').count() === 0)
  check('a soft sound swells in as it arrives', await h.evaluate(() => (window.haligtreeHeard ?? []).includes('cue:ambience')))
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'mist-1.png') })
  await h.waitForTimeout(2200)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'mist-2.png') })
  await h.waitForTimeout(3000)
  check('the window is solid in a few seconds', (await opacity()) === 1, String(await opacity()))
  check('the first words come through only after the chord, on the beat', await h.locator('[data-thesis="line"]').count() === 1)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'mist-3.png') })
  await h.waitForTimeout(6500)
  check('the mist is gone', await h.locator('[data-welcome-mist]').count() === 0)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'mist-4.png') })
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
