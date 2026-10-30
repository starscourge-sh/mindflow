// Haligtree's own paintings are always the whole pack where it is written now: a setting still naming an old copy's
// folder (from before the rename, or another book) shows every painting shipped, not the few that copy had.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/scenery-pack.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v } = c
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
  check('the pack holds every painting shipped (20)', all >= 20, String(all))
  const old = '/Users/someone/Library/Application Support/mindflow/books/b-old/Scenery'
  const fromOld = await count([old])
  check('an old copy\'s folder reads as the whole pack', fromOld === all, `${fromOld} of ${all}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
