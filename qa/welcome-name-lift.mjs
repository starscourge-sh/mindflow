// Name it is one of the welcome's climaxes: the music lifts there. Silent (HALIGTREE_QA_AWAY), so proved through the
// sound bed's own state (sound.ts, window.haligtreeBed): its swell and the layers sounding over it.
//  - on Make it yours, the page before, the bed stays at its quiet level (a chapter's soft pair only, no lift)
//  - on Name it, within two seconds the swell is more than twice the bed and the lift's layer (four voices) is sounding
//  - then it settles: eight seconds on, the swell is back near the bed and the lift's layer has gone
//  - the last page still resolves (cue:bed-resolve)
//
//   npx electron-vite build --outDir out-x && QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-name-lift.mjs
import { sandbox } from './sandbox-lib.mjs'

let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
const BED = 0.14
const chapter = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
const next = async (h) => ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")') : h.click('footer button:has-text("Next"), footer button:has-text("Show me")'))
const bed = (h) => h.evaluate(() => window.haligtreeBed?.() ?? null)
// The bed sampled every 100ms for `ms`: the loudest swell, and the most voices of each layer at once.
const watch = (h, ms) => h.evaluate((ms) => new Promise((done) => {
  let swell = 0
  const layers = {}
  const t0 = performance.now()
  const tick = () => {
    const now = window.haligtreeBed?.()
    if (now) {
      swell = Math.max(swell, now.swell)
      for (const [k, v] of Object.entries(now.layers)) layers[k] = Math.max(layers[k] ?? 0, v)
    }
    if (performance.now() - t0 < ms) setTimeout(tick, 100)
    else done({ swell, layers })
  }
  tick()
}), ms)

const c = await sandbox({ width: 1280, height: 800, seeded: false })
const { h } = c
try {
  await c.v('settings:set', { sounds: true })
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  for (let i = 0; i < 40 && !(await chapter(h)).includes('Make it yours'); i++) (await next(h), await h.waitForTimeout(500))
  // Let Make it yours' own turn settle, then watch its bed.
  await h.waitForTimeout(6000)
  const dial = await watch(h, 2500)
  check('Make it yours: the bed at its quiet level, no lift', dial.swell < BED * 1.6 && !dial.layers.lift, JSON.stringify(dial))
  for (let i = 0; i < 6 && !(await chapter(h)).includes('Name it'); i++) (await next(h), await h.waitForTimeout(150))
  check('on Name it', (await chapter(h)).includes('Name it'), await chapter(h))
  const lift = await watch(h, 2200)
  check('Name it: within two seconds the swell is more than twice the bed', lift.swell > BED * 2, JSON.stringify(lift))
  check('Name it: the lift\'s layer of four voices sounds over it', lift.layers.lift === 4, JSON.stringify(lift.layers))
  check('Name it: heard as the lift', (await h.evaluate(() => window.haligtreeHeard ?? [])).includes('cue:bed-lift'))
  await h.waitForTimeout(8000)
  const after = await bed(h)
  check('then it settles: back near the bed, the lift gone', after && after.swell < BED * 1.5 && after.swell >= BED && !after.layers.lift, JSON.stringify(after))
  await h.click('footer button:has-text("Next")')
  await h.waitForTimeout(600)
  check('the last page still resolves', (await h.evaluate(() => window.haligtreeHeard ?? [])).includes('cue:bed-resolve'))
} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
