// The Week's and Month's pages, and the day's Report, each show a picture of their own: never the same painting on
// two of them, while there are enough to go round.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/banner-distinct.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const shown = () => h.evaluate(() => [...document.querySelectorAll('[data-scene] img')].map((one) => one.src.split('/').pop()).at(-1) ?? null)
try {
  await v('settings:set', { sounds: false, hintRate: 0, scenery: true, sceneryToday: true })
  const seen = {}
  for (const page of ['day', 'weekpage', 'monthpage']) {
    await c.go(page); await h.waitForTimeout(2500)
    seen[page] = await shown()
  }
  const pictures = Object.values(seen).filter(Boolean)
  check('each page shows a picture', pictures.length === 3, JSON.stringify(seen))
  check('no two of them the same', new Set(pictures).size === pictures.length, JSON.stringify(seen))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
