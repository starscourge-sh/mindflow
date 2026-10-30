// Haligtree's own paintings are always the whole pack where it is written now: a setting still naming an old copy's
// folder (from before the rename, or another book) shows every painting shipped, not the few that copy had.
// Settings > Scenery says how many, and each is wide enough for the Report's banner, so each takes its turn there.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/scenery-pack.mjs
import { readdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v, go } = c
const shipped = readdirSync(new URL('../src/renderer/src/assets/scenery/', import.meta.url)).filter((one) => one.endsWith('.webp')).length
const count = (folders) => h.evaluate(async (folders) => {
  for (let i = 0; i < 40; i++) {
    const got = await window.api.haligtree('scenery', folders)
    if (!got.scanning && got.scenes.length) return got.scenes.length
    await new Promise((ok) => setTimeout(ok, 250))
  }
  return 0
}, folders)
try {
  const now = (await v('settings')).sceneryFolders
  const all = await count(now)
  check(`the pack holds every painting shipped (${shipped})`, all === shipped, `${all} of ${shipped}`)
  // The Report's, Week's and Month's banners take turns over the wide ones (scenery.tsx choose): none left out.
  const narrow = await h.evaluate(async (folders) => (await window.api.haligtree('scenery', folders)).scenes.filter((one) => !(one.width >= one.height * 1.2)).map((one) => one.id), now)
  check('every painting is wide enough for the Report\'s rotation', narrow.length === 0, narrow.join(', '))
  await go('settings'); await h.waitForTimeout(1200)
  await h.click('[data-section="Scenery"]'); await h.waitForTimeout(2500)
  const said = await h.locator('[data-scenery-folder]').filter({ hasText: 'Haligtree’s paintings' }).first().innerText()
  check(`Settings > Scenery says ${shipped} pictures`, said.replace(/\s+/g, '').includes(`${shipped}pictures`), said.replace(/\s+/g, ' '))
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/scenery-settings.png` })
  const old = '/Users/someone/Library/Application Support/mindflow/books/b-old/Scenery'
  const fromOld = await count([old])
  check('an old copy\'s folder reads as the whole pack', fromOld === all, `${fromOld} of ${all}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
